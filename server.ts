import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import webPush from 'web-push';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});

// In AI Studio / Cloud Run containers, process.env.PORT is often set to 8080 (the container reverse proxy).
// The app server MUST listen on port 3000. Check --port argument or fallback to 3000.
function resolvePort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const p = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(p) && p > 0) return p;
  }
  const envPort = Number(process.env.PORT);
  if (envPort && envPort !== 8080) {
    return envPort;
  }
  return 3000;
}

const PORT = resolvePort();
const isProd = process.env.NODE_ENV === 'production';

// Helper functions to validate VAPID keys format and byte length
function isValidVapidPublicKey(key: unknown): boolean {
  if (!key || typeof key !== 'string') return false;
  try {
    const cleanKey = key.trim().replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (cleanKey.length % 4)) % 4);
    const buf = Buffer.from(cleanKey + padding, 'base64');
    return buf.length === 65 && buf[0] === 0x04;
  } catch {
    return false;
  }
}

function isValidVapidPrivateKey(key: unknown): boolean {
  if (!key || typeof key !== 'string') return false;
  try {
    const cleanKey = key.trim().replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (cleanKey.length % 4)) % 4);
    const buf = Buffer.from(cleanKey + padding, 'base64');
    return buf.length === 32;
  } catch {
    return false;
  }
}

// Initialize or load persistent VAPID keys for Web Push
const VAPID_KEY_FILE = path.resolve(__dirname, '.vapid-keys.json');

// Check environment variables first, but ONLY accept them if both are strictly valid
const envPubKey = process.env.VAPID_PUBLIC_KEY ? process.env.VAPID_PUBLIC_KEY.trim() : '';
const envPrivKey = process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PRIVATE_KEY.trim() : '';

let vapidKeys = {
  publicKey: isValidVapidPublicKey(envPubKey) ? envPubKey : '',
  privateKey: isValidVapidPrivateKey(envPrivKey) ? envPrivKey : '',
};

if (envPubKey && !isValidVapidPublicKey(envPubKey)) {
  console.warn('[Server] Provided VAPID_PUBLIC_KEY in environment is invalid (must decode to 65 bytes). Falling back to persistent/generated keys.');
}
if (envPrivKey && !isValidVapidPrivateKey(envPrivKey)) {
  console.warn('[Server] Provided VAPID_PRIVATE_KEY in environment is invalid (must decode to 32 bytes). Falling back to persistent/generated keys.');
}

// If environment didn't provide valid keys, try reading from .vapid-keys.json
if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  if (fs.existsSync(VAPID_KEY_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(VAPID_KEY_FILE, 'utf-8'));
      if (isValidVapidPublicKey(saved.publicKey) && isValidVapidPrivateKey(saved.privateKey)) {
        vapidKeys = {
          publicKey: saved.publicKey.trim(),
          privateKey: saved.privateKey.trim(),
        };
      } else {
        console.warn('[Server] Saved .vapid-keys.json contained invalid key structure, regenerating fresh keys.');
      }
    } catch (e) {
      console.warn('[Server] Error reading .vapid-keys.json, generating new keys:', e);
    }
  }

  // If still missing valid keys, generate a fresh valid VAPID keypair
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    vapidKeys = webPush.generateVAPIDKeys();
    try {
      fs.writeFileSync(VAPID_KEY_FILE, JSON.stringify(vapidKeys, null, 2), 'utf-8');
      console.log('[Server] Generated and saved new persistent VAPID keys to .vapid-keys.json');
    } catch (e) {
      console.warn('[Server] Could not save .vapid-keys.json:', e);
    }
  }
}

// Configure webPush with self-healing fallback
function configureVapidDetails() {
  try {
    webPush.setVapidDetails(
      'mailto:bcgmoc@gmail.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    console.log('[Server] Web Push VAPID details configured successfully.');
  } catch (err) {
    console.warn('[Server] VAPID configuration failed with existing keys, regenerating fresh valid keypair:', err);
    vapidKeys = webPush.generateVAPIDKeys();
    try {
      fs.writeFileSync(VAPID_KEY_FILE, JSON.stringify(vapidKeys, null, 2), 'utf-8');
      console.log('[Server] Fresh VAPID keys saved to .vapid-keys.json');
    } catch (writeErr) {
      console.warn('[Server] Could not save fresh .vapid-keys.json:', writeErr);
    }
    try {
      webPush.setVapidDetails(
        'mailto:bcgmoc@gmail.com',
        vapidKeys.publicKey,
        vapidKeys.privateKey
      );
      console.log('[Server] Web Push VAPID details re-configured successfully with fresh keypair.');
    } catch (retryErr) {
      console.error('[Server] Fatal Web Push VAPID configuration error:', retryErr);
    }
  }
}

configureVapidDetails();

async function startServer() {
  const app = express();

  // Basic middleware
  app.use(express.json());

  // -------------------------------------------------------------
  // PUSH NOTIFICATION BACKEND ROUTES (/api/push/*)
  // -------------------------------------------------------------

  // 1. Get VAPID Public Key for client-side push subscription
  app.get('/api/push/vapid-key', (_req, res) => {
    res.json({
      ok: true,
      vapidPublicKey: vapidKeys.publicKey,
      messagingSenderId: '153128091325',
      projectId: 'operating-league-dv9wh',
    });
  });

  // 2. Push service health and capabilities
  app.get('/api/push/status', (_req, res) => {
    res.json({
      ok: true,
      service: 'MEDORA Push Delivery Engine',
      isConfigured: Boolean(vapidKeys.publicKey && vapidKeys.privateKey),
      vapidPublicKey: vapidKeys.publicKey,
      platforms: ['android', 'ios', 'desktop'],
      supportedPortals: [
        'patient',
        'doctor',
        'secretary',
        'pharmacy',
        'laboratory',
        'radiology',
        'wholesaler',
        'super_admin',
      ],
      timestamp: new Date().toISOString(),
    });
  });

  // 3. Dispatch Push Notification to target device subscriptions
  app.post('/api/push/send', async (req, res) => {
    try {
      const {
        recipientUid,
        recipientRole,
        category,
        title,
        body,
        genericBody,
        targetUrl = '/',
        targetPortal = 'home',
        priority = 'normal',
        sourceEventId,
        subscriptions = [], // Array of PushSubscription objects
      } = req.body;

      if (!recipientUid) {
        return res.status(400).json({ ok: false, error: 'recipientUid is required' });
      }

      // Security gate: Super Admin notifications can only be delivered to authorized admin email
      if (targetPortal === 'super_admin' && recipientRole !== 'super_admin') {
        console.warn(`[Security] Blocked unauthorized super_admin notification attempt to UID: ${recipientUid}`);
        return res.status(403).json({ ok: false, error: 'Unauthorized target portal' });
      }

      const payload = JSON.stringify({
        notification: {
          title: title || 'منصة MEDORA | ميدورا العراق',
          body: body || 'لديك تحديث طبي جديد',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        },
        data: {
          url: targetUrl,
          portal: targetPortal,
          category,
          sourceEventId: sourceEventId || `evt_${Date.now()}`,
          genericBody: genericBody || 'لديك تحديث طبي جديد في منصة MEDORA | ميدورا العراق',
          priority,
          timestamp: String(Date.now()),
        },
      });

      let deliveredCount = 0;
      let failedCount = 0;
      const invalidEndpoints: string[] = [];

      // Send to all provided device push subscriptions
      if (Array.isArray(subscriptions) && subscriptions.length > 0) {
        const sendPromises = subscriptions.map(async (sub) => {
          if (!sub || !sub.endpoint || !sub.keys) return;
          try {
            await webPush.sendNotification(sub, payload, {
              TTL: priority === 'urgent' ? 60 * 60 * 24 : 60 * 60 * 4, // 24h or 4h
              urgency: priority === 'urgent' ? 'high' : 'normal',
            });
            deliveredCount++;
          } catch (err: any) {
            failedCount++;
            // 410 Gone or 404 Not Found indicates expired or unregistered subscription
            if (err?.statusCode === 410 || err?.statusCode === 404) {
              invalidEndpoints.push(sub.endpoint);
            }
            console.warn(`[PushSend] Push send failure for endpoint (${err?.statusCode}):`, err?.message);
          }
        });

        await Promise.allSettled(sendPromises);
      }

      console.log(`[PushSend] Dispatched for ${recipientUid}: ${deliveredCount} delivered, ${failedCount} failed`);

      return res.json({
        ok: true,
        status: 'processed',
        deliveredCount,
        failedCount,
        invalidEndpoints,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[PushSend] Error handling /api/push/send:', err);
      return res.status(500).json({ ok: false, error: err?.message || 'Internal push delivery error' });
    }
  });

  // 4. Live Test Push directly to a provided subscription
  app.post('/api/push/test', async (req, res) => {
    try {
      const { subscription, title, body, url = '/' } = req.body;

      if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({ ok: false, error: 'Valid PushSubscription is required' });
      }

      const payload = JSON.stringify({
        notification: {
          title: title || 'MEDORA — إشعار تجريبي مباشر',
          body: body || 'تم ربط هاتفك بنظام الإشعارات المباشرة بنجاح.',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        },
        data: {
          url,
          portal: 'test',
          timestamp: String(Date.now()),
        },
      });

      await webPush.sendNotification(subscription, payload, {
        TTL: 60,
        urgency: 'high',
      });

      return res.json({ ok: true, status: 'delivered', timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error('[PushTest] Error sending test notification:', err);
      return res.status(500).json({ ok: false, error: err?.message || 'Test push delivery failed' });
    }
  });

  // -------------------------------------------------------------
  // OFFICIAL MANUAL WALLET PAYMENT & VERIFICATION ROUTES (/api/payments/*)
  // Strictly ONLY: سوبر كي (SuperQi) & زين كاش (ZainCash)
  // -------------------------------------------------------------
  const ALLOWED_MANUAL_METHODS = new Set(['superqi', 'zaincash']);
  const DEFAULT_WALLET_CONFIG = {
    superqi: {
      id: 'superqi',
      displayName: 'سوبر كي (SuperQi)',
      walletNumber: '917337618826',
      currency: 'IQD',
      isActive: true,
    },
    zaincash: {
      id: 'zaincash',
      displayName: 'زين كاش (ZainCash)',
      walletNumber: '07885663748',
      currency: 'IQD',
      isActive: true,
    },
  };

  // Helper: verify any authenticated Firebase user via Identity Toolkit
  async function verifyAuthenticatedUserToken(req: express.Request): Promise<
    | { ok: true; uid: string; email: string }
    | { ok: false; status: number; error: string }
  > {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      return { ok: false, status: 401, error: 'Missing Authorization Bearer token' };
    }
    const idToken = match[1].trim();
    if (!firebaseApiKey) {
      return { ok: false, status: 500, error: 'Firebase API key not configured on server' };
    }
    try {
      const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );
      if (!lookupRes.ok) {
        return { ok: false, status: 401, error: 'Invalid or expired Firebase ID token' };
      }
      const data: any = await lookupRes.json();
      const account = Array.isArray(data?.users) ? data.users[0] : null;
      if (!account || !account.localId) {
        return { ok: false, status: 401, error: 'Token user lookup failed' };
      }
      return {
        ok: true,
        uid: String(account.localId),
        email: String(account.email || '').trim().toLowerCase(),
      };
    } catch (err) {
      console.error('[PaymentSecurity] Token lookup error:', err);
      return { ok: false, status: 500, error: 'Token verification error' };
    }
  }

  // 1. Official active payment methods (SuperQi & ZainCash ONLY)
  app.get('/api/payments/methods', (_req, res) => {
    res.json({
      ok: true,
      methods: [DEFAULT_WALLET_CONFIG.superqi, DEFAULT_WALLET_CONFIG.zaincash],
      currency: 'IQD',
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Validate payment request submission (authenticated user)
  app.post('/api/payments/validate-submission', async (req, res) => {
    const authCheck = await verifyAuthenticatedUserToken(req);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ ok: false, error: authCheck.error });
    }

    const {
      planId,
      paymentMethod,
      amountIqd,
      expectedAmountIqd,
      transferDate,
      receiptSizeBytes,
      receiptMimeType,
    } = req.body || {};

    if (!ALLOWED_MANUAL_METHODS.has(String(paymentMethod))) {
      return res.status(400).json({
        ok: false,
        error: 'Unsupported payment method. Only superqi and zaincash are enabled.',
      });
    }

    const amount = Number(amountIqd);
    const expected = Number(expectedAmountIqd);
    if (!planId || !Number.isFinite(amount) || amount <= 0 || amount !== expected) {
      return res.status(400).json({
        ok: false,
        error: 'Submitted amount does not match expected plan amount.',
      });
    }

    const parsedDate = transferDate ? new Date(`${String(transferDate).trim()}T00:00:00Z`) : null;
    if (!parsedDate || isNaN(parsedDate.getTime()) || parsedDate.getTime() > Date.now() + 48 * 60 * 60 * 1000) {
      return res.status(400).json({ ok: false, error: 'Invalid or future transferDate.' });
    }

    const size = Number(receiptSizeBytes || 0);
    const mime = String(receiptMimeType || '').toLowerCase();
    if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'Receipt file must be between 1 byte and 5 MB.' });
    }
    const isAllowedImage = mime.startsWith('image/') && mime !== 'image/svg+xml';
    const isAllowedPdf = mime === 'application/pdf';
    if (!isAllowedImage && !isAllowedPdf) {
      return res.status(400).json({ ok: false, error: 'Receipt must be a valid PDF or image file (PDF, JPG, JPEG, PNG, WEBP, HEIC).' });
    }

    return res.json({
      ok: true,
      uid: authCheck.uid,
      email: authCheck.email,
      status: 'pending',
      validatedAt: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------
  // SUPER ADMIN OVERSIGHT VERIFICATION & AUDIT ENDPOINTS (/api/admin/*)
  // Enforces server-side verification for bcgmoc@gmail.com via Firebase Identity Toolkit
  // -------------------------------------------------------------
  const SOLE_ADMIN_EMAIL = 'bcgmoc@gmail.com';
  const FIREBASE_CONFIG_FILE = path.resolve(__dirname, 'firebase-applet-config.json');
  let firebaseApiKey = '';
  try {
    const fbCfg = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_FILE, 'utf-8'));
    firebaseApiKey = String(fbCfg.apiKey || '');
  } catch (e) {
    console.warn('[AdminSecurity] Could not load firebase-applet-config.json:', e);
  }

  const oversightAuditBuffer: Array<{
    auditId: string;
    actorEmail: string;
    actorUid: string;
    conversationId: string;
    action: string;
    relationshipType?: string;
    recordedAt: string;
  }> = [];

  async function verifySuperAdminBearerToken(req: express.Request): Promise<
    | { ok: true; uid: string; email: string }
    | { ok: false; status: number; error: string }
  > {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      return { ok: false, status: 401, error: 'Missing Authorization Bearer token' };
    }
    const idToken = match[1].trim();
    if (!firebaseApiKey) {
      return { ok: false, status: 500, error: 'Firebase API key not configured on server' };
    }
    try {
      const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );
      if (!lookupRes.ok) {
        return { ok: false, status: 401, error: 'Invalid or expired Firebase ID token' };
      }
      const data: any = await lookupRes.json();
      const account = Array.isArray(data?.users) ? data.users[0] : null;
      if (!account || !account.email || !account.localId) {
        return { ok: false, status: 401, error: 'Token user lookup failed' };
      }
      const email = String(account.email).trim().toLowerCase();
      const hasGoogleProvider =
        Array.isArray(account.providerUserInfo) &&
        account.providerUserInfo.some((p: any) => p?.providerId === 'google.com');
      const isVerified = Boolean(account.emailVerified) || hasGoogleProvider;
      if (email !== SOLE_ADMIN_EMAIL || !isVerified) {
        console.warn(`[AdminSecurity] Denied oversight request for: ${email}`);
        return { ok: false, status: 403, error: 'Forbidden: Super Admin oversight restricted to verified bcgmoc@gmail.com' };
      }
      return { ok: true, uid: String(account.localId), email };
    } catch (err: any) {
      console.error('[AdminSecurity] Token verification failure:', err);
      return { ok: false, status: 500, error: 'Token verification error' };
    }
  }

  app.post('/api/admin/verify-oversight', async (req, res) => {
    const verification = await verifySuperAdminBearerToken(req);
    if (!verification.ok) {
      return res.status(verification.status).json({
        ok: false,
        verified: false,
        error: verification.error,
      });
    }
    return res.json({
      ok: true,
      verified: true,
      uid: verification.uid,
      email: verification.email,
      oversightScope: 'global_messaging_read_and_support',
      verifiedAt: new Date().toISOString(),
    });
  });

  app.post('/api/admin/audit-message-access', async (req, res) => {
    const verification = await verifySuperAdminBearerToken(req);
    if (!verification.ok) {
      return res.status(verification.status).json({
        ok: false,
        error: verification.error,
      });
    }
    const { conversationId, relationshipType, action = 'super_admin_conversation_viewed' } = req.body || {};
    if (!conversationId || typeof conversationId !== 'string') {
      return res.status(400).json({ ok: false, error: 'conversationId is required' });
    }
    const entry = {
      auditId: `srv_oversight_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorEmail: verification.email,
      actorUid: verification.uid,
      conversationId,
      action: String(action),
      relationshipType: relationshipType ? String(relationshipType) : undefined,
      recordedAt: new Date().toISOString(),
    };
    oversightAuditBuffer.unshift(entry);
    if (oversightAuditBuffer.length > 200) oversightAuditBuffer.length = 200;
    console.log(`[AdminOversight] ${entry.actorEmail} -> ${entry.action} (${entry.conversationId})`);
    return res.json({ ok: true, ...entry });
  });

  // Super Admin Payment Management Server-Side Authorization Endpoints
  app.post('/api/admin/payments/verify-approval', async (req, res) => {
    const verification = await verifySuperAdminBearerToken(req);
    if (!verification.ok) {
      return res.status(verification.status).json({ ok: false, error: verification.error });
    }

    const { requestId, planId, amountIqd, expectedAmountIqd, paymentMethod, currentStatus } = req.body || {};
    if (!requestId || !planId) {
      return res.status(400).json({ ok: false, error: 'requestId and planId are required' });
    }
    if (!ALLOWED_MANUAL_METHODS.has(String(paymentMethod))) {
      return res.status(400).json({ ok: false, error: 'Unsupported paymentMethod for approval' });
    }
    if (currentStatus !== 'pending' && currentStatus !== 'under_review') {
      return res.status(409).json({ ok: false, error: `Cannot approve payment request in status: ${currentStatus}` });
    }
    const amt = Number(amountIqd);
    const exp = Number(expectedAmountIqd);
    if (!Number.isFinite(amt) || amt <= 0 || amt !== exp) {
      return res.status(400).json({ ok: false, error: 'Payment amount mismatch detected during server verification' });
    }

    const entry = {
      auditId: `srv_pay_approve_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorEmail: verification.email,
      actorUid: verification.uid,
      conversationId: String(requestId),
      action: 'payment_approved',
      relationshipType: `${paymentMethod}:${planId}:${amt}`,
      recordedAt: new Date().toISOString(),
    };
    oversightAuditBuffer.unshift(entry);
    if (oversightAuditBuffer.length > 200) oversightAuditBuffer.length = 200;
    console.log(`[PaymentAdmin] APPROVED ${requestId} (${amt} IQD via ${paymentMethod}) by ${verification.email}`);

    return res.json({
      ok: true,
      verified: true,
      approvedByUid: verification.uid,
      approvedByEmail: verification.email,
      approvedAt: entry.recordedAt,
      auditId: entry.auditId,
    });
  });

  app.post('/api/admin/payments/verify-rejection', async (req, res) => {
    const verification = await verifySuperAdminBearerToken(req);
    if (!verification.ok) {
      return res.status(verification.status).json({ ok: false, error: verification.error });
    }

    const { requestId, rejectionReason, currentStatus } = req.body || {};
    if (!requestId || typeof rejectionReason !== 'string' || rejectionReason.trim().length < 3) {
      return res.status(400).json({ ok: false, error: 'requestId and a clear rejectionReason (min 3 chars) are required' });
    }
    if (currentStatus === 'approved' || currentStatus === 'rejected') {
      return res.status(409).json({ ok: false, error: `Cannot reject request in status: ${currentStatus}` });
    }

    const entry = {
      auditId: `srv_pay_reject_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorEmail: verification.email,
      actorUid: verification.uid,
      conversationId: String(requestId),
      action: 'payment_rejected',
      relationshipType: rejectionReason.trim().slice(0, 120),
      recordedAt: new Date().toISOString(),
    };
    oversightAuditBuffer.unshift(entry);
    if (oversightAuditBuffer.length > 200) oversightAuditBuffer.length = 200;
    console.log(`[PaymentAdmin] REJECTED ${requestId} by ${verification.email}`);

    return res.json({
      ok: true,
      verified: true,
      reviewedByUid: verification.uid,
      reviewedByEmail: verification.email,
      reviewedAt: entry.recordedAt,
      auditId: entry.auditId,
    });
  });

  app.post('/api/admin/payments/verify-settings', async (req, res) => {
    const verification = await verifySuperAdminBearerToken(req);
    if (!verification.ok) {
      return res.status(verification.status).json({ ok: false, error: verification.error });
    }

    const { superqi, zaincash } = req.body || {};
    const walletPattern = /^\d{7,16}$/;
    if (
      !superqi ||
      !zaincash ||
      !walletPattern.test(String(superqi.walletNumber || '').trim()) ||
      !walletPattern.test(String(zaincash.walletNumber || '').trim())
    ) {
      return res.status(400).json({ ok: false, error: 'Valid 7-16 digit wallet numbers are required for SuperQi and ZainCash' });
    }

    const entry = {
      auditId: `srv_pay_settings_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorEmail: verification.email,
      actorUid: verification.uid,
      conversationId: 'payment_settings_default',
      action: 'payment_settings_updated',
      relationshipType: `superqi:${superqi.walletNumber}|zaincash:${zaincash.walletNumber}`,
      recordedAt: new Date().toISOString(),
    };
    oversightAuditBuffer.unshift(entry);
    if (oversightAuditBuffer.length > 200) oversightAuditBuffer.length = 200;
    console.log(`[PaymentAdmin] SETTINGS UPDATED by ${verification.email}`);

    return res.json({
      ok: true,
      verified: true,
      updatedByUid: verification.uid,
      updatedByEmail: verification.email,
      updatedAt: entry.recordedAt,
      auditId: entry.auditId,
    });
  });

  // -------------------------------------------------------------
  // VITE DEV MIDDLEWARE OR PRODUCTION STATIC SERVING
  // -------------------------------------------------------------
  const httpServer = http.createServer(app);

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Vite middleware mounted in development mode.');
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    console.log('[Server] Serving production build from /dist.');
  }

  httpServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] Port ${PORT} already in use.`);
    } else {
      console.error('[Server] HTTP server encountered an error:', err);
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] MEDORA Full-Stack Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
