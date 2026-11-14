/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeForFirestore } from './firebase';
import { sendRealInAppNotification } from './notificationService';

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved';
export type SupportChannelPreference = 'general' | 'womens' | 'email' | 'platform';

export interface SupportTicketRecord {
  id: string;
  referenceCode: string;
  userId: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  portalId: string;
  role: string;
  channelPreference: SupportChannelPreference;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  adminReply?: string;
  repliedByEmail?: string;
  repliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitSupportTicketInput {
  userId?: string | null;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  portalId?: string;
  role?: string;
  channelPreference?: SupportChannelPreference;
  subject?: string;
  message: string;
}

export interface SubmitSupportTicketResult {
  ticket: SupportTicketRecord;
  deliveryMode: 'firestore' | 'server';
}

export function validateSupportTicketInput(
  input: SubmitSupportTicketInput,
  language: 'ar' | 'en' = 'ar'
): string | null {
  const name = input.senderName.trim();
  const email = input.senderEmail.trim();
  const msg = input.message.trim();

  if (name.length < 2) {
    return language === 'ar'
      ? 'يرجى إدخال الاسم الكامل (حرفان على الأقل).'
      : 'Please enter your full name (at least 2 characters).';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return language === 'ar'
      ? 'يرجى إدخال بريد إلكتروني صحيح للتواصل.'
      : 'Please provide a valid email address for follow-up.';
  }
  if (msg.length < 5) {
    return language === 'ar'
      ? 'يرجى كتابة تفاصيل الرسالة أو الاستفسار (5 أحرف على الأقل).'
      : 'Please write your inquiry details (at least 5 characters).';
  }
  return null;
}

export async function submitSupportTicket(
  input: SubmitSupportTicketInput,
  language: 'ar' | 'en' = 'ar'
): Promise<SubmitSupportTicketResult> {
  const validationError = validateSupportTicketInput(input, language);
  if (validationError) {
    throw new Error(validationError);
  }

  const cleanName = input.senderName.trim().slice(0, 128);
  const cleanEmail = input.senderEmail.trim().slice(0, 128);
  const cleanPhone = (input.senderPhone || '').trim().slice(0, 32);
  const cleanPortal = (input.portalId || 'public').trim().slice(0, 64);
  const cleanRole = (input.role || 'visitor').trim().slice(0, 64);
  const cleanSubject = (
    input.subject?.trim() ||
    (language === 'ar' ? 'طلب دعم من داخل منصة MEDORA' : 'In-Platform Support Request — MEDORA')
  ).slice(0, 160);
  const cleanMessage = input.message.trim().slice(0, 4000);
  const channelPreference: SupportChannelPreference = input.channelPreference || 'platform';

  const now = new Date().toISOString();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const ticketId = `ticket_${Date.now()}_${suffix.toLowerCase()}`;
  const referenceCode = `MED-SUP-${Date.now().toString().slice(-6)}-${suffix}`;

  if (input.userId) {
    const ticket: SupportTicketRecord = {
      id: ticketId,
      referenceCode,
      userId: input.userId,
      senderName: cleanName,
      senderEmail: cleanEmail,
      ...(cleanPhone ? { senderPhone: cleanPhone } : {}),
      portalId: cleanPortal,
      role: cleanRole,
      channelPreference,
      subject: cleanSubject,
      message: cleanMessage,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, 'support_tickets', ticketId), sanitizeForFirestore(ticket));
      await sendRealInAppNotification({
        recipientUid: input.userId,
        title: language === 'ar' ? `تم استلام طلب الدعم (${referenceCode})` : `Support Ticket Received (${referenceCode})`,
        message:
          language === 'ar'
            ? 'تم تسجيل رسالتك في مركز الدعم الرسمي بنجاح، وسيتابع فريقنا الرد عليك قريباً.'
            : 'Your support ticket has been logged in the Official Support Center.',
        type: 'general',
        link: cleanPortal !== 'public' ? `/${cleanPortal}` : '/support',
      }).catch(() => {});

      return { ticket, deliveryMode: 'firestore' };
    } catch (err: any) {
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      if (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) {
        // Fallback cleanly to real backend ticket endpoint if remote project rules haven't deployed support_tickets yet
        console.warn('[SupportCenterService] Firestore rule pending deployment; dispatching via /api/support/tickets');
      } else {
        handleFirestoreError(err, OperationType.CREATE, `support_tickets/${ticketId}`);
      }
    }
  }

  // Real backend HTTP endpoint delivery (unauthenticated visitors or fallback)
  const response = await fetch('/api/support/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      senderName: cleanName,
      senderEmail: cleanEmail,
      senderPhone: cleanPhone,
      portalId: cleanPortal,
      role: cleanRole,
      channelPreference,
      subject: cleanSubject,
      message: cleanMessage,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.ticket) {
    const msg =
      payload?.error ||
      (language === 'ar'
        ? 'تعذر إرسال الرسالة إلى الخادم. يرجى المحاولة مرة أخرى أو التواصل عبر واتساب.'
        : 'Unable to send support message. Please retry or contact us via WhatsApp.');
    throw new Error(msg);
  }

  const serverTicket: SupportTicketRecord = {
    ...payload.ticket,
    userId: input.userId || 'visitor',
    updatedAt: payload.ticket.createdAt || now,
  };

  return { ticket: serverTicket, deliveryMode: 'server' };
}

export function subscribeUserSupportTickets(
  userId: string | null | undefined,
  onUpdate: (tickets: SupportTicketRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const q = query(collection(db, 'support_tickets'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SupportTicketRecord[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as SupportTicketRecord), id: docSnap.id });
      });
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(items);
    },
    (err: any) => {
      const code = String(err?.code || '');
      if (code === 'permission-denied') {
        onUpdate([]);
        return;
      }
      console.warn('[SupportCenterService] User ticket listener error:', err);
      if (onError) onError(err);
    }
  );
}

export function subscribeAllSupportTicketsForAdmin(
  onUpdate: (tickets: SupportTicketRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = collection(db, 'support_tickets');
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SupportTicketRecord[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as SupportTicketRecord), id: docSnap.id });
      });
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(items);
    },
    (err) => {
      console.warn('[SupportCenterService] Admin ticket listener error:', err);
      if (onError) onError(err);
    }
  );
}

export async function updateSupportTicketByAdmin(
  ticketId: string,
  updates: {
    status: SupportTicketStatus;
    adminReply?: string;
    repliedByEmail: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await updateDoc(
      doc(db, 'support_tickets', ticketId),
      sanitizeForFirestore({
        status: updates.status,
        adminReply: updates.adminReply?.trim() || undefined,
        repliedByEmail: updates.repliedByEmail,
        repliedAt: now,
        updatedAt: now,
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `support_tickets/${ticketId}`);
  }
}
