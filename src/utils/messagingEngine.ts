/**
 * Pure, framework-agnostic Messaging Engine for MEDORA.
 * Handles:
 * - UTF-8 / Arabic / English / digits / emojis / punctuation / multiline text validation
 * - Deterministic & idempotent message IDs for safe retry without duplicates
 * - Chronological message sorting & deduplication
 * - Real error classification (permissions, auth session expiry, offline, timeout, unavailable)
 */

import { ChatMessage } from '../types';

export const MAX_CHAT_MESSAGE_LENGTH = 4000;

export type MessagingErrorCode =
  | 'empty_message'
  | 'message_too_long'
  | 'offline'
  | 'unauthenticated'
  | 'permission-denied'
  | 'timeout'
  | 'unavailable'
  | 'invalid-argument'
  | 'unknown';

export interface ClassifiedMessagingError {
  code: MessagingErrorCode;
  retryable: boolean;
  requiresReauth: boolean;
  messageAr: string;
  messageEn: string;
  rawError: string;
}

export interface MessageValidationResult {
  valid: boolean;
  normalizedText: string;
  errorCode?: 'empty_message' | 'message_too_long';
  errorAr?: string;
  errorEn?: string;
}

/**
 * Normalizes line endings (\r\n / \r -> \n) without stripping Arabic diacritics,
 * emojis, symbols, internal newlines, or meaningful spaces.
 * Rejects empty or whitespace-only messages (including NBSP / zero-width whitespace-only).
 */
export function validateAndNormalizeMessageText(
  rawText: string,
  hasAttachment = false,
  maxLength = MAX_CHAT_MESSAGE_LENGTH
): MessageValidationResult {
  const safeString = typeof rawText === 'string' ? rawText : String(rawText ?? '');
  const normalizedNewlines = safeString.replace(/\r\n?/g, '\n');

  // Check if message has at least one non-whitespace/non-invisible character
  const strippedVisible = normalizedNewlines.replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, '');

  if (strippedVisible.length === 0) {
    if (hasAttachment) {
      return { valid: true, normalizedText: '' };
    }
    return {
      valid: false,
      normalizedText: '',
      errorCode: 'empty_message',
      errorAr: 'لا يمكن إرسال رسالة فارغة أو مكوّنة من مسافات فقط.',
      errorEn: 'Cannot send an empty or whitespace-only message.',
    };
  }

  // Trim only trailing/leading blank newlines at extreme ends while keeping internal spacing & newlines
  const finalText = normalizedNewlines.replace(/^\n+|\n+$/g, '');

  if (Array.from(finalText).length > maxLength) {
    return {
      valid: false,
      normalizedText: finalText,
      errorCode: 'message_too_long',
      errorAr: `تجاوز النص الحد الأقصى المسموح (${maxLength} حرفاً).`,
      errorEn: `Message exceeds the maximum allowed length (${maxLength} characters).`,
    };
  }

  return {
    valid: true,
    normalizedText: finalText,
  };
}

/**
 * Generates a Firestore-safe deterministic-format message ID for idempotent retries.
 * Reusing the exact same ID on retry guarantees zero duplicate documents in Firestore.
 */
export function createClientMessageId(nowMs = Date.now()): string {
  const rand = Math.random().toString(36).substring(2, 8);
  return `msg_${nowMs}_${rand}`;
}

export interface LocalOutboxMessage extends ChatMessage {
  deliveryState: 'sending' | 'failed';
  errorCode?: MessagingErrorCode;
  errorMessage?: string;
  retryable?: boolean;
}

/**
 * Merges confirmed Firestore server messages with any in-flight or failed local outbox messages.
 * - Server messages always win when the same `id` exists (clears duplicate/stale local states).
 * - Deduplicates strictly by `id`.
 * - Sorts deterministically ascending by timestamp, with `id` tie-breaker.
 */
export function mergeAndSortConversationMessages(
  serverMessages: ChatMessage[],
  localOutbox: LocalOutboxMessage[] = []
): Array<ChatMessage & { deliveryState?: 'sending' | 'failed' | 'sent'; errorCode?: MessagingErrorCode; errorMessage?: string; retryable?: boolean }> {
  const byId = new Map<
    string,
    ChatMessage & { deliveryState?: 'sending' | 'failed' | 'sent'; errorCode?: MessagingErrorCode; errorMessage?: string; retryable?: boolean }
  >();

  for (const msg of serverMessages) {
    if (!msg || !msg.id) continue;
    byId.set(msg.id, {
      ...msg,
      deliveryState: 'sent',
    });
  }

  for (const pending of localOutbox) {
    if (!pending || !pending.id) continue;
    if (!byId.has(pending.id)) {
      byId.set(pending.id, pending);
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const tA = Date.parse(a.timestamp || '') || 0;
    const tB = Date.parse(b.timestamp || '') || 0;
    if (tA !== tB) return tA - tB;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Classifies Firebase Auth, Firestore, and Network errors into accurate, honest user-facing diagnostics.
 */
export function classifyMessagingError(
  err: unknown,
  isOnline = true
): ClassifiedMessagingError {
  const anyErr = err as { code?: string; message?: string } | null;
  const code = String(anyErr?.code || '').toLowerCase();
  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lowerMsg = rawMessage.toLowerCase();

  if (!isOnline || code === 'offline' || lowerMsg.includes('client is offline') || lowerMsg.includes('network_offline')) {
    return {
      code: 'offline',
      retryable: true,
      requiresReauth: false,
      messageAr: 'انقطع الاتصال بالإنترنت. تم الاحتفاظ بالنص دون مسحه؛ اضغط "إعادة المحاولة" عند عودة الاتصال.',
      messageEn: 'You appear to be offline. Your message was preserved—click Retry once connection returns.',
      rawError: rawMessage,
    };
  }

  if (code === 'network_timeout' || lowerMsg.includes('network_timeout') || code.includes('deadline-exceeded')) {
    return {
      code: 'timeout',
      retryable: true,
      requiresReauth: false,
      messageAr: 'انتهت مهلة الاتصال بالخادم قبل تأكيد حفظ الرسالة. تم الاحتفاظ بالنص لإعادة المحاولة بأمان.',
      messageEn: 'Server confirmation timed out. Your message is preserved and can be safely retried.',
      rawError: rawMessage,
    };
  }

  if (
    code.includes('unauthenticated') ||
    lowerMsg.includes('unauthenticated') ||
    lowerMsg.includes('auth/user-token-expired') ||
    lowerMsg.includes('auth/id-token-expired') ||
    lowerMsg.includes('session_expired')
  ) {
    return {
      code: 'unauthenticated',
      retryable: false,
      requiresReauth: true,
      messageAr: 'انتهت صلاحية جلسة الدخول أو لم يتم التحقق من الحساب. يرجى إعادة تسجيل الدخول ثم المحاولة مجدداً.',
      messageEn: 'Authentication session expired or missing. Please sign in again and retry.',
      rawError: rawMessage,
    };
  }

  if (
    code.includes('permission-denied') ||
    lowerMsg.includes('missing or insufficient permissions') ||
    lowerMsg.includes('permission-denied')
  ) {
    return {
      code: 'permission-denied',
      retryable: true,
      requiresReauth: false,
      messageAr:
        'رفضت قاعدة البيانات العملية (permission-denied): تأكد من نشر قواعد Firestore المحدّثة أو وجود صلاحية/علاقة معتمدة لهذه المحادثة.',
      messageEn:
        'Firestore rejected the operation (permission-denied): ensure updated Firestore security rules are published and this conversation is authorized.',
      rawError: rawMessage,
    };
  }

  if (
    code.includes('unavailable') ||
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('networkerror') ||
    lowerMsg.includes('unavailable')
  ) {
    return {
      code: 'unavailable',
      retryable: true,
      requiresReauth: false,
      messageAr: 'تعذر الوصول إلى خادم Firestore حالياً. تحقق من الشبكة واضغط "إعادة المحاولة".',
      messageEn: 'Firestore service is temporarily unreachable. Check your connection and retry.',
      rawError: rawMessage,
    };
  }

  if (code.includes('invalid-argument') || lowerMsg.includes('invalid-argument') || lowerMsg.includes('unsupported field value')) {
    return {
      code: 'invalid-argument',
      retryable: false,
      requiresReauth: false,
      messageAr: 'بيانات الرسالة غير صالحة أو تحتوي على تنسيق غير مدعوم في Firestore.',
      messageEn: 'Invalid message payload or unsupported Firestore field value.',
      rawError: rawMessage,
    };
  }

  return {
    code: 'unknown',
    retryable: true,
    requiresReauth: false,
    messageAr: `تعذر إرسال الرسالة: ${rawMessage}`,
    messageEn: `Failed to send message: ${rawMessage}`,
    rawError: rawMessage,
  };
}

/**
 * Wraps an async Firestore write with an explicit timeout so offline/dropped sockets
 * never leave the send UI spinning forever.
 */
export function runWithNetworkTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 15000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error('network_timeout: Firestore write did not receive server confirmation in time.');
      (err as any).code = 'network_timeout';
      reject(err);
    }, timeoutMs);

    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
