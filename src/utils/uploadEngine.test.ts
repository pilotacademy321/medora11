import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_UPLOAD_POLICY,
  DEFAULT_RECEIPT_MAX_BYTES,
  MEDICAL_DOC_UPLOAD_POLICY,
  RADIOLOGY_UPLOAD_POLICY,
  RECEIPT_UPLOAD_POLICY,
  StorageTaskLike,
  UploadDeduplicationGuard,
  classifyStorageUploadError,
  computeTransferTelemetry,
  createFileFingerprint,
  executeResumableUploadWithRetry,
  formatBytesCompact,
  formatTransferSpeed,
  inferMimeTypeFromFileName,
  shouldOptimizeImageForUpload,
  validateUploadFile,
} from './uploadEngine';

test('validateUploadFile accepts valid PDF, JPG, JPEG, PNG, WEBP, HEIC receipts up to 5 MB', () => {
  const validFiles = [
    { name: 'receipt.pdf', type: 'application/pdf', size: 250_000 },
    { name: 'photo.jpg', type: 'image/jpeg', size: 1_200_000 },
    { name: 'photo.jpeg', type: 'image/jpg', size: 500_000 },
    { name: 'screenshot.png', type: 'image/png', size: DEFAULT_RECEIPT_MAX_BYTES },
    { name: 'scan.webp', type: 'image/webp', size: 100_000 },
    { name: 'ios_photo.heic', type: '', size: 800_000 },
  ];
  for (const f of validFiles) {
    const res = validateUploadFile(f, RECEIPT_UPLOAD_POLICY);
    assert.equal(res.valid, true, `Expected ${f.name} to be valid: ${res.errorAr}`);
  }
});

test('validateUploadFile rejects empty, oversized, SVG, HTML, EXE, and unsupported receipt files with clear Arabic errors', () => {
  const empty = validateUploadFile({ name: 'empty.pdf', type: 'application/pdf', size: 0 }, RECEIPT_UPLOAD_POLICY);
  assert.equal(empty.valid, false);
  assert.ok(empty.errorAr && empty.errorAr.includes('0'));

  const oversized = validateUploadFile(
    { name: 'huge.pdf', type: 'application/pdf', size: DEFAULT_RECEIPT_MAX_BYTES + 1 },
    RECEIPT_UPLOAD_POLICY
  );
  assert.equal(oversized.valid, false);
  assert.ok(oversized.errorAr && oversized.errorAr.includes('يتجاوز'));

  const svg = validateUploadFile({ name: 'xss.svg', type: 'image/svg+xml', size: 1024 }, RECEIPT_UPLOAD_POLICY);
  assert.equal(svg.valid, false);

  const exe = validateUploadFile(
    { name: 'payload.exe', type: 'application/x-msdownload', size: 2048 },
    RECEIPT_UPLOAD_POLICY
  );
  assert.equal(exe.valid, false);

  const html = validateUploadFile({ name: 'page.html', type: 'text/html', size: 1024 }, RECEIPT_UPLOAD_POLICY);
  assert.equal(html.valid, false);

  const nullRes = validateUploadFile(null, RECEIPT_UPLOAD_POLICY);
  assert.equal(nullRes.valid, false);
});

test('validateUploadFile supports medical documents, DICOM, audio chat attachments, and radiology ZIPs', () => {
  assert.equal(
    validateUploadFile({ name: 'lab-report.pdf', type: 'application/pdf', size: 12 * 1024 * 1024 }, MEDICAL_DOC_UPLOAD_POLICY).valid,
    true
  );
  assert.equal(
    validateUploadFile({ name: 'chest.dcm', type: '', size: 8 * 1024 * 1024 }, MEDICAL_DOC_UPLOAD_POLICY).valid,
    true
  );
  assert.equal(
    validateUploadFile({ name: 'voice-note.m4a', type: 'audio/mp4', size: 4 * 1024 * 1024 }, CHAT_UPLOAD_POLICY).valid,
    true
  );
  assert.equal(
    validateUploadFile({ name: 'ct-series.zip', type: 'application/zip', size: 60 * 1024 * 1024 }, RADIOLOGY_UPLOAD_POLICY).valid,
    true
  );
});

test('computeTransferTelemetry reports exact 0% for 0 bytes (never fakes progress) and accurate real telemetry', () => {
  const start = 1000;
  const zero = computeTransferTelemetry({
    bytesTransferred: 0,
    totalBytes: 1_000_000,
    startedAtMs: start,
    nowMs: start + 500,
    status: 'uploading',
  });
  assert.equal(zero.percent, 0);
  assert.equal(zero.bytesTransferred, 0);
  assert.equal(zero.bytesPerSecond, 0);
  assert.equal(zero.speedFormatted, '0 KB/s');

  const mid = computeTransferTelemetry({
    bytesTransferred: 500_000,
    totalBytes: 1_000_000,
    startedAtMs: start,
    nowMs: start + 2000,
    status: 'uploading',
  });
  assert.equal(mid.percent, 50);
  assert.equal(mid.bytesTransferred, 500_000);
  assert.equal(mid.bytesPerSecond, 250_000);
  assert.equal(mid.etaSeconds, 2);

  const done = computeTransferTelemetry({
    bytesTransferred: 1_000_000,
    totalBytes: 1_000_000,
    startedAtMs: start,
    nowMs: start + 4000,
    status: 'completed',
  });
  assert.equal(done.percent, 100);
  assert.equal(done.etaSeconds, 0);
});

test('UploadDeduplicationGuard prevents concurrent duplicate uploads and frees slot after completion or failure', async () => {
  const guard = new UploadDeduplicationGuard();
  const fp = createFileFingerprint({ name: 'receipt.jpg', size: 12345, lastModified: 99, type: 'image/jpeg' }, 'sub');

  let invocations = 0;
  let resolveUpload!: (v: string) => void;
  const firstPromise = guard.run(fp, () => {
    invocations++;
    return new Promise<string>((resolve) => {
      resolveUpload = resolve;
    });
  });

  const duplicatePromise = guard.run(fp, () => {
    invocations++;
    return Promise.resolve('should-not-run');
  });

  assert.equal(invocations, 1);
  assert.equal(guard.has(fp), true);
  resolveUpload('https://storage.example/receipt.jpg');

  const [r1, r2] = await Promise.all([firstPromise, duplicatePromise]);
  assert.equal(r1, 'https://storage.example/receipt.jpg');
  assert.equal(r2, 'https://storage.example/receipt.jpg');
  assert.equal(guard.has(fp), false);

  // Subsequent retry after failure must be allowed
  await assert.rejects(
    guard.run(fp, async () => {
      throw new Error('network drop');
    })
  );
  assert.equal(guard.has(fp), false);
  const retryResult = await guard.run(fp, async () => 'retry-ok');
  assert.equal(retryResult, 'retry-ok');
});

test('shouldOptimizeImageForUpload never compresses PDFs, DICOMs, or files <= 1.5MB', () => {
  assert.equal(
    shouldOptimizeImageForUpload({ name: 'big-report.pdf', type: 'application/pdf', size: 4_000_000 }),
    false
  );
  assert.equal(
    shouldOptimizeImageForUpload({ name: 'mri.dcm', type: 'application/dicom', size: 20_000_000 }),
    false
  );
  assert.equal(
    shouldOptimizeImageForUpload({ name: 'small.jpg', type: 'image/jpeg', size: 900_000 }),
    false
  );
  assert.equal(
    shouldOptimizeImageForUpload({ name: 'camera-receipt.jpg', type: 'image/jpeg', size: 3_500_000 }),
    true
  );
});

test('executeResumableUploadWithRetry streams real 0%->45%->100% progress and resolves download URL strictly after completion', async () => {
  const observedPercents: number[] = [];
  let urlRequestedAfterComplete = false;

  const result = await executeResumableUploadWithRetry<{ bytesTransferred: number; totalBytes: number; ref: string }>({
    totalBytesFallback: 1000,
    maxRetries: 1,
    stallTimeoutMs: 4000,
    baseBackoffMs: 100,
    isOnline: () => true,
    onProgress: (info) => {
      observedPercents.push(info.percent);
    },
    createTask: (): StorageTaskLike<{ bytesTransferred: number; totalBytes: number; ref: string }> => ({
      cancel: () => true,
      on: (_event, next, _error, complete) => {
        setTimeout(() => next({ bytesTransferred: 450, totalBytes: 1000, ref: 'r1' }), 15);
        setTimeout(() => next({ bytesTransferred: 1000, totalBytes: 1000, ref: 'r1' }), 30);
        setTimeout(() => {
          urlRequestedAfterComplete = true;
          complete();
        }, 45);
      },
    }),
    getDownloadUrl: async (snap) => {
      assert.equal(urlRequestedAfterComplete, true);
      assert.equal(snap.bytesTransferred, 1000);
      return 'https://firebasestorage.googleapis.com/v0/b/test/o/receipt.jpg?alt=media';
    },
  });

  assert.equal(result.downloadUrl, 'https://firebasestorage.googleapis.com/v0/b/test/o/receipt.jpg?alt=media');
  assert.equal(result.finalProgress.percent, 100);
  assert.equal(result.finalProgress.status, 'completed');
  assert.ok(observedPercents.includes(0));
  assert.ok(observedPercents.includes(45));
  assert.ok(observedPercents.includes(100));
});

test('executeResumableUploadWithRetry retries transient failures and stops immediately on permission denied', async () => {
  let attempts = 0;
  const recovered = await executeResumableUploadWithRetry<{ bytesTransferred: number; totalBytes: number }>({
    totalBytesFallback: 1000,
    maxRetries: 2,
    stallTimeoutMs: 4000,
    baseBackoffMs: 100,
    isOnline: () => true,
    createTask: (attempt) => {
      attempts = attempt;
      return {
        cancel: () => true,
        on: (_event, next, error, complete) => {
          if (attempt === 1) {
            setTimeout(() => error({ code: 'storage/retry-limit-exceeded', message: 'Network drop' }), 10);
          } else {
            setTimeout(() => next({ bytesTransferred: 1000, totalBytes: 1000 }), 10);
            setTimeout(() => complete(), 20);
          }
        },
      };
    },
    getDownloadUrl: async () => 'https://firebasestorage.googleapis.com/recovered',
  });

  assert.equal(attempts, 2);
  assert.equal(recovered.downloadUrl, 'https://firebasestorage.googleapis.com/recovered');

  // Non-retryable storage/unauthorized must NOT retry
  let unauthAttempts = 0;
  await assert.rejects(
    executeResumableUploadWithRetry<{ bytesTransferred: number; totalBytes: number }>({
      totalBytesFallback: 1000,
      maxRetries: 2,
      stallTimeoutMs: 4000,
      baseBackoffMs: 100,
      isOnline: () => true,
      createTask: (attempt) => {
        unauthAttempts = attempt;
        return {
          cancel: () => true,
          on: (_event, _next, error) => {
            setTimeout(() => error({ code: 'storage/unauthorized', message: 'Missing permissions' }), 10);
          },
        };
      },
      getDownloadUrl: async () => 'https://unreachable',
    })
  );
  assert.equal(unauthAttempts, 1);
});

test('executeResumableUploadWithRetry supports offline guard, stall detection classification, and user cancellation', async () => {
  await assert.rejects(
    executeResumableUploadWithRetry({
      totalBytesFallback: 1000,
      isOnline: () => false,
      createTask: () => ({ cancel: () => true, on: () => {} }),
      getDownloadUrl: async () => '',
    }),
    /إنترنت/
  );

  let cancelFn: (() => void) | null = null;
  const uploadPromise = executeResumableUploadWithRetry<{ bytesTransferred: number; totalBytes: number }>({
    totalBytesFallback: 1000,
    maxRetries: 1,
    stallTimeoutMs: 4000,
    baseBackoffMs: 100,
    isOnline: () => true,
    onCancelHandle: (fn) => {
      cancelFn = fn;
    },
    createTask: () => ({
      cancel: () => true,
      on: (_event, next, error) => {
        setTimeout(() => next({ bytesTransferred: 200, totalBytes: 1000 }), 10);
        setTimeout(() => error({ code: 'storage/canceled', message: 'Canceled' }), 30);
      },
    }),
    getDownloadUrl: async () => 'https://never',
  });
  setTimeout(() => cancelFn?.(), 15);
  await assert.rejects(uploadPromise, /إلغاء/);

  const stalledClass = classifyStorageUploadError({ code: 'upload/stalled' }, true);
  assert.equal(stalledClass.code, 'upload/stalled');
  assert.equal(stalledClass.retryable, true);
  assert.equal(inferMimeTypeFromFileName('REPORT.PDF', ''), 'application/pdf');
  assert.equal(formatBytesCompact(1024 * 1024), '1.0 MB');
  assert.equal(formatTransferSpeed(512 * 1024), '512 KB/s');
});
