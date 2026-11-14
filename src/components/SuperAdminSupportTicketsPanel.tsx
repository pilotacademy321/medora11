/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Headphones, Loader2, Mail, MessageSquare, Send } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { OFFICIAL_SUPPORT_CONFIG } from '../config/officialSupportConfig';
import {
  SupportTicketRecord,
  SupportTicketStatus,
  subscribeAllSupportTicketsForAdmin,
  updateSupportTicketByAdmin,
} from '../lib/supportCenterService';

interface SuperAdminSupportTicketsPanelProps {
  adminEmail: string;
}

export const SuperAdminSupportTicketsPanel: React.FC<SuperAdminSupportTicketsPanelProps> = ({
  adminEmail,
}) => {
  const { language } = useLanguage();
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    const unsub = subscribeAllSupportTicketsForAdmin(
      (items) => {
        setTickets(items);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setLoadError(
          err.message ||
            (language === 'ar' ? 'تعذر تحميل تذاكر الدعم.' : 'Unable to load support tickets.')
        );
      }
    );
    return () => unsub();
  }, [language]);

  const handleUpdateTicket = async (ticketId: string, status: SupportTicketStatus) => {
    setSavingId(ticketId);
    setActionMsg(null);
    try {
      await updateSupportTicketByAdmin(ticketId, {
        status,
        adminReply: replyDrafts[ticketId],
        repliedByEmail: adminEmail,
      });
      setActionMsg({
        type: 'success',
        text: language === 'ar' ? 'تم تحديث حالة التذكرة والرد بنجاح.' : 'Support ticket updated.',
      });
    } catch (err: any) {
      setActionMsg({
        type: 'error',
        text:
          err?.message ||
          (language === 'ar' ? 'فشل تحديث التذكرة.' : 'Failed to update ticket.'),
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#003366] text-white flex items-center justify-center shrink-0">
            <Headphones size={22} />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              {language === 'ar'
                ? 'صندوق تذاكر مركز الدعم الرسمي'
                : 'Official Support Center Tickets'}
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? `متابعة الرسائل الواردة من جميع البوابات عبر (${OFFICIAL_SUPPORT_CONFIG.email.address})`
                : `Manage support requests across all portals (${OFFICIAL_SUPPORT_CONFIG.email.address})`}
            </p>
          </div>
        </div>
        <div className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl">
          {language === 'ar' ? `الإجمالي: ${tickets.length}` : `Total: ${tickets.length}`}
        </div>
      </div>

      {actionMsg && (
        <div
          className={`p-3 rounded-xl text-xs font-bold border ${
            actionMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 size={22} className="animate-spin text-[#003366]" />
          <span>{language === 'ar' ? 'جاري تحميل تذاكر الدعم...' : 'Loading support tickets...'}</span>
        </div>
      ) : loadError ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          {loadError}
        </div>
      ) : tickets.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-500 space-y-1">
          <p className="font-bold text-slate-700">
            {language === 'ar' ? 'لا توجد تذاكر دعم مفتوحة حالياً' : 'No support tickets yet'}
          </p>
          <p>
            {language === 'ar'
              ? 'ستظهر هنا جميع الرسائل المرسلة عبر نموذج الدعم داخل المنصة.'
              : 'In-platform support messages submitted by users will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-black text-[#003366]" dir="ltr">
                    {ticket.referenceCode}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="font-bold text-slate-900">{ticket.senderName}</span>
                  <span className="text-slate-500 font-mono" dir="ltr">
                    {ticket.senderEmail}
                  </span>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800">
                  {ticket.portalId} / {ticket.status}
                </span>
              </div>

              <div>
                <div className="text-sm font-bold text-slate-900">{ticket.subject}</div>
                <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{ticket.message}</p>
              </div>

              {ticket.adminReply && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950">
                  <strong>{language === 'ar' ? 'الرد المسجل:' : 'Saved Reply:'}</strong>{' '}
                  {ticket.adminReply}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  value={replyDrafts[ticket.id] ?? ticket.adminReply ?? ''}
                  onChange={(e) =>
                    setReplyDrafts((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                  }
                  placeholder={
                    language === 'ar' ? 'اكتب رد الإدارة للمستخدم...' : 'Write admin reply...'
                  }
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingId === ticket.id}
                    onClick={() => handleUpdateTicket(ticket.id, 'in_progress')}
                    className="px-3 py-2 min-h-[40px] rounded-xl bg-[#003366] hover:bg-[#001738] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Send size={13} />
                    <span>{language === 'ar' ? 'حفظ الرد' : 'Save Reply'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={savingId === ticket.id}
                    onClick={() => handleUpdateTicket(ticket.id, 'resolved')}
                    className="px-3 py-2 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle2 size={13} />
                    <span>{language === 'ar' ? 'تمت المعالجة' : 'Resolve'}</span>
                  </button>
                  <a
                    href={`mailto:${ticket.senderEmail}?subject=${encodeURIComponent(`RE: ${ticket.subject} (${ticket.referenceCode})`)}`}
                    className="px-3 py-2 min-h-[40px] rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold inline-flex items-center gap-1"
                  >
                    <Mail size={13} />
                    <span>{language === 'ar' ? 'إيميل' : 'Email'}</span>
                  </a>
                  {ticket.senderPhone && (
                    <a
                      href={`${OFFICIAL_SUPPORT_CONFIG.generalSupport.whatsappUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 min-h-[40px] rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <MessageSquare size={13} />
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
