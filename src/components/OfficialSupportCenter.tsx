/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Headphones,
  Instagram,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { OFFICIAL_SUPPORT_CONFIG, buildOfficialMailtoHref } from '../config/officialSupportConfig';
import {
  buildWhatsAppSupportHref,
  detectSensitiveSupportInput,
  getVisibleSupportContacts,
} from '../utils/supportRouting';
import { isPortalSuspended } from '../config/portalsConfig';
import {
  SupportChannelPreference,
  SupportTicketRecord,
  submitSupportTicket,
  subscribeUserSupportTickets,
} from '../lib/supportCenterService';
import { PortalId } from '../types';

export interface OfficialSupportCenterProps {
  portalId?: PortalId | 'public';
  portalTitleAr?: string;
  portalTitleEn?: string;
  variant?: 'full' | 'portal' | 'modal';
  onClose?: () => void;
  defaultOpenForm?: boolean;
}

export const OfficialSupportCenter: React.FC<OfficialSupportCenterProps> = ({
  portalId = 'public',
  portalTitleAr,
  portalTitleEn,
  variant = 'full',
  onClose,
  defaultOpenForm = true,
}) => {
  const { language } = useLanguage();
  const { user, userProfile, isAdmin } = useAuth();

  const contacts = useMemo(
    () =>
      getVisibleSupportContacts({
        isAuthenticated: Boolean(user),
        userRole: userProfile?.role,
        gender: userProfile?.gender,
        isAdmin,
      }),
    [user, userProfile?.role, userProfile?.gender, isAdmin]
  );

  const [formData, setFormData] = useState({
    name: userProfile?.displayName || user?.displayName || '',
    email: userProfile?.email || user?.email || '',
    phone: userProfile?.phone || '',
    role: (userProfile?.role || (portalId !== 'public' ? portalId : 'patient')) as string,
    channelPreference: 'platform' as SupportChannelPreference,
    subject: '',
    message: '',
  });

  // Sync authenticated profile defaults when user profile loads
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      name: prev.name || userProfile?.displayName || user?.displayName || '',
      email: prev.email || userProfile?.email || user?.email || '',
      phone: prev.phone || userProfile?.phone || '',
      role: userProfile?.role || prev.role,
    }));
  }, [userProfile?.displayName, userProfile?.email, userProfile?.phone, userProfile?.role, user?.displayName, user?.email]);

  const [isFormExpanded, setIsFormExpanded] = useState<boolean>(
    variant === 'full' || variant === 'modal' || defaultOpenForm
  );
  const [submissionStatus, setSubmissionStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastSubmittedTicket, setLastSubmittedTicket] = useState<SupportTicketRecord | null>(null);

  // Real ticket loading / history state
  const [isLoadingTickets, setIsLoadingTickets] = useState<boolean>(Boolean(user?.uid));
  const [ticketHistoryError, setTicketHistoryError] = useState<string>('');
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);

  useEffect(() => {
    if (!user?.uid) {
      setIsLoadingTickets(false);
      return;
    }

    setIsLoadingTickets(true);
    setTicketHistoryError('');
    const unsub = subscribeUserSupportTickets(
      user.uid,
      (items) => {
        setTickets(items);
        setIsLoadingTickets(false);
      },
      (err) => {
        setIsLoadingTickets(false);
        setTicketHistoryError(
          err.message ||
            (language === 'ar'
              ? 'تعذر تحميل سجل تذاكر الدعم.'
              : 'Unable to load your support ticket history.')
        );
      }
    );

    return () => unsub();
  }, [user?.uid, language]);

  const sensitiveWarning = useMemo(
    () => detectSensitiveSupportInput(`${formData.subject} ${formData.message}`),
    [formData.subject, formData.message]
  );

  // Context-aware WhatsApp direct links (pointing to the authoritative international numbers)
  const generalWhatsappHref = useMemo(
    () =>
      buildWhatsAppSupportHref('main', {
        name: formData.name || userProfile?.displayName,
        accountType: formData.role,
        inquiryCategory: formData.subject || (portalTitleAr ? `بوابة ${portalTitleAr}` : undefined),
        description: formData.message || undefined,
      }),
    [formData.name, formData.role, formData.subject, formData.message, userProfile?.displayName, portalTitleAr]
  );

  const womensWhatsappHref = useMemo(
    () =>
      buildWhatsAppSupportHref('womens', {
        name: formData.name || userProfile?.displayName,
        inquiryCategory: formData.subject || (portalTitleAr ? `بوابة ${portalTitleAr}` : undefined),
        description: formData.message || undefined,
      }),
    [formData.name, formData.subject, formData.message, userProfile?.displayName, portalTitleAr]
  );

  const directEmailHref = useMemo(
    () =>
      buildOfficialMailtoHref(
        formData.subject ||
          (language === 'ar'
            ? `استفسار دعم رسمي — MEDORA${portalTitleAr ? ` (${portalTitleAr})` : ''}`
            : `Official Support Inquiry — MEDORA${portalTitleEn ? ` (${portalTitleEn})` : ''}`),
        formData.message
          ? `${formData.message}\n\n---\n${formData.name || ''} | ${formData.phone || ''}`
          : undefined
      ),
    [formData.subject, formData.message, formData.name, formData.phone, language, portalTitleAr, portalTitleEn]
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setSubmissionStatus('submitting');

    try {
      const result = await submitSupportTicket(
        {
          userId: user?.uid || null,
          senderName: formData.name,
          senderEmail: formData.email,
          senderPhone: formData.phone,
          portalId,
          role: formData.role,
          channelPreference: formData.channelPreference,
          subject: formData.subject,
          message: formData.message,
        },
        language
      );

      setLastSubmittedTicket(result.ticket);
      setTickets((prev) => {
        if (prev.some((t) => t.id === result.ticket.id)) return prev;
        return [result.ticket, ...prev];
      });
      setSubmissionStatus('success');
      setFormData((prev) => ({
        ...prev,
        subject: '',
        message: '',
      }));
    } catch (err: any) {
      setSubmissionStatus('error');
      setErrorMessage(
        err?.message ||
          (language === 'ar'
            ? 'حدث خطأ أثناء إرسال رسالتك. يرجى المحاولة مجدداً أو التواصل مباشرة عبر واتساب.'
            : 'Failed to submit your message. Please retry or contact us directly via WhatsApp.')
      );
    }
  };

  const isCompact = variant === 'portal';

  return (
    <section
      aria-label={language === 'ar' ? OFFICIAL_SUPPORT_CONFIG.brandNameAr : OFFICIAL_SUPPORT_CONFIG.brandNameEn}
      className={
        variant === 'modal'
          ? 'bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col'
          : 'bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden'
      }
    >
      {/* Top Executive MEDORA Support Banner */}
      <div className="bg-gradient-to-r from-[#001738] via-[#002855] to-[#003366] text-white px-5 py-5 sm:px-8 sm:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/40 shrink-0">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 text-sky-300 flex items-center justify-center shrink-0">
            <Headphones size={24} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-sky-300 tracking-wide">
              {language === 'ar' ? 'MEDORA IRAQ • القنوات الرسمية الوحيدة المعتمدة' : 'MEDORA IRAQ • Sole Official Contact Channels'}
            </div>
            <h2 className="text-lg sm:text-2xl font-black tracking-tight mt-0.5">
              {language === 'ar' ? OFFICIAL_SUPPORT_CONFIG.brandNameAr : OFFICIAL_SUPPORT_CONFIG.brandNameEn}
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 mt-1 max-w-2xl leading-relaxed">
              {portalTitleAr || portalTitleEn
                ? language === 'ar'
                  ? `خدمة دعم مباشر مخصصة لمستخدمي ${portalTitleAr || portalId} — اختر القناة المناسبة أو أرسل رسالة مباشرة من داخل المنصة.`
                  : `Dedicated support for ${portalTitleEn || portalId} — choose an official channel or message us directly inside the platform.`
                : language === 'ar'
                  ? 'تواصل مباشرة مع فريق الدعم العام أو الدعم النسائي أو المراسلة الرسمية لحل أي استفسار تقني أو إداري.'
                  : 'Connect directly with General Support, Women’s Support, Official Email, Instagram, or in-platform messaging.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {isCompact && (
            <button
              type="button"
              onClick={() => setIsFormExpanded((prev) => !prev)}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white text-[#001738] hover:bg-sky-50 text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-2 shadow-xs"
            >
              <Send size={14} />
              <span>
                {isFormExpanded
                  ? language === 'ar'
                    ? 'إخفاء نموذج المراسلة'
                    : 'Hide Messaging Form'
                  : language === 'ar'
                    ? 'مراسلة الدعم من داخل المنصة'
                    : 'Message Support In-App'}
              </span>
            </button>
          )}
          {variant === 'modal' && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={language === 'ar' ? 'إغلاق مركز الدعم' : 'Close Support Center'}
              className="p-2.5 min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors cursor-pointer flex items-center justify-center"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Container */}
      <div className={`${variant === 'modal' ? 'overflow-y-auto ' : ''}p-5 sm:p-7 space-y-6`}>
        {/* 4 SEPARATE OFFICIAL DIRECT CHANNELS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* 1. GENERAL SUPPORT (MEN) — الدعم العام (الرجال) */}
          <div className="rounded-2xl bg-emerald-50/75 border border-emerald-200 p-5 flex flex-col justify-between shadow-xs hover:border-emerald-300 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <UserCheck size={22} />
                </div>
                <span className="text-[11px] font-bold text-emerald-800">
                  {language === 'ar' ? 'قناة مباشرة ١' : 'Direct Line 1'}
                </span>
              </div>
              <h3 className="text-sm font-black text-slate-900">
                {language === 'ar'
                  ? OFFICIAL_SUPPORT_CONFIG.generalSupport.titleAr
                  : OFFICIAL_SUPPORT_CONFIG.generalSupport.titleEn}
              </h3>
              <div className="mt-1.5 text-lg font-mono font-black text-slate-950 tracking-wider" dir="ltr">
                {OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone}
              </div>
              <div className="text-[11px] font-mono text-emerald-800 font-semibold" dir="ltr">
                {OFFICIAL_SUPPORT_CONFIG.generalSupport.intlCompact}
              </div>
              <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">
                {language === 'ar'
                  ? OFFICIAL_SUPPORT_CONFIG.generalSupport.subtitleAr
                  : OFFICIAL_SUPPORT_CONFIG.generalSupport.subtitleEn}
              </p>
            </div>

            <div className="mt-4 pt-3.5 border-t border-emerald-200/70 space-y-2">
              <a
                href={generalWhatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                data-support-channel="whatsapp-general"
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-colors shadow-xs"
              >
                <MessageSquare size={15} />
                <span>
                  {language === 'ar'
                    ? OFFICIAL_SUPPORT_CONFIG.generalSupport.whatsappCtaAr
                    : OFFICIAL_SUPPORT_CONFIG.generalSupport.whatsappCtaEn}
                </span>
              </a>
              <a
                href={contacts.generalContact.callHref}
                data-support-channel="call-general"
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-100/70 text-emerald-900 border border-emerald-300 text-xs font-bold transition-colors"
              >
                <Phone size={14} />
                <span>
                  {language === 'ar'
                    ? `${OFFICIAL_SUPPORT_CONFIG.generalSupport.callCtaAr}: ${OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone}`
                    : `${OFFICIAL_SUPPORT_CONFIG.generalSupport.callCtaEn}: ${OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone}`}
                </span>
              </a>
            </div>
          </div>

          {/* 2. WOMEN'S SUPPORT — الدعم النسائي (Separate & Always Clearly Displayed) */}
          <div className="rounded-2xl bg-rose-50/75 border border-rose-200 p-5 flex flex-col justify-between shadow-xs hover:border-rose-300 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="w-11 h-11 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <ShieldCheck size={22} />
                </div>
                <span className="text-[11px] font-bold text-rose-800">
                  {language === 'ar' ? 'قناة مباشرة ٢' : 'Direct Line 2'}
                </span>
              </div>
              <h3 className="text-sm font-black text-slate-900">
                {language === 'ar'
                  ? OFFICIAL_SUPPORT_CONFIG.womensSupport.titleAr
                  : OFFICIAL_SUPPORT_CONFIG.womensSupport.titleEn}
              </h3>
              <div className="mt-1.5 text-lg font-mono font-black text-slate-950 tracking-wider" dir="ltr">
                {OFFICIAL_SUPPORT_CONFIG.womensSupport.displayPhone}
              </div>
              <div className="text-[11px] font-mono text-rose-800 font-semibold" dir="ltr">
                {OFFICIAL_SUPPORT_CONFIG.womensSupport.intlCompact}
              </div>
              <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">
                {language === 'ar'
                  ? OFFICIAL_SUPPORT_CONFIG.womensSupport.subtitleAr
                  : OFFICIAL_SUPPORT_CONFIG.womensSupport.subtitleEn}
              </p>
            </div>

            <div className="mt-4 pt-3.5 border-t border-rose-200/70 space-y-2">
              <a
                href={womensWhatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                data-support-channel="whatsapp-womens"
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold transition-colors shadow-xs"
              >
                <MessageSquare size={15} />
                <span>
                  {language === 'ar'
                    ? OFFICIAL_SUPPORT_CONFIG.womensSupport.whatsappCtaAr
                    : OFFICIAL_SUPPORT_CONFIG.womensSupport.whatsappCtaEn}
                </span>
              </a>
              <a
                href={OFFICIAL_SUPPORT_CONFIG.womensSupport.callUrl}
                data-support-channel="call-womens"
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-rose-100/70 text-rose-900 border border-rose-300 text-xs font-bold transition-colors"
              >
                <Phone size={14} />
                <span>
                  {language === 'ar'
                    ? `${OFFICIAL_SUPPORT_CONFIG.womensSupport.callCtaAr}: ${OFFICIAL_SUPPORT_CONFIG.womensSupport.displayPhone}`
                    : `${OFFICIAL_SUPPORT_CONFIG.womensSupport.callCtaEn}: ${OFFICIAL_SUPPORT_CONFIG.womensSupport.displayPhone}`}
                </span>
              </a>
            </div>
          </div>

          {/* 3. OFFICIAL EMAIL — البريد الإلكتروني الرسمي */}
          <div className="rounded-2xl bg-sky-50/75 border border-sky-200 p-5 flex flex-col justify-between shadow-xs hover:border-sky-300 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="w-11 h-11 rounded-xl bg-[#003366] text-white flex items-center justify-center shadow-xs shrink-0">
                  <Mail size={22} />
                </div>
                <span className="text-[11px] font-bold text-[#003366]">
                  {language === 'ar' ? 'المراسلات الرسمية' : 'Official Email'}
                </span>
              </div>
              <h3 className="text-sm font-black text-slate-900">
                {language === 'ar'
                  ? OFFICIAL_SUPPORT_CONFIG.email.titleAr
                  : OFFICIAL_SUPPORT_CONFIG.email.titleEn}
              </h3>
              <div className="mt-1.5 text-sm sm:text-base font-mono font-black text-[#003366] break-all" dir="ltr">
                {OFFICIAL_SUPPORT_CONFIG.email.address}
              </div>
              <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">
                {language === 'ar'
                  ? OFFICIAL_SUPPORT_CONFIG.email.subtitleAr
                  : OFFICIAL_SUPPORT_CONFIG.email.subtitleEn}
              </p>
            </div>

            <div className="mt-4 pt-3.5 border-t border-sky-200/70">
              <a
                href={directEmailHref}
                data-support-channel="official-email"
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#003366] hover:bg-[#001738] text-white text-xs font-extrabold transition-colors shadow-xs"
              >
                <Mail size={15} />
                <span>
                  {language === 'ar'
                    ? OFFICIAL_SUPPORT_CONFIG.email.ctaAr
                    : OFFICIAL_SUPPORT_CONFIG.email.ctaEn}
                </span>
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>

          {/* 4. OFFICIAL INSTAGRAM — حساب Instagram الرسمي */}
          <div className="rounded-2xl bg-gradient-to-br from-pink-50/85 via-purple-50/50 to-amber-50/50 border border-pink-200 p-5 flex flex-col justify-between shadow-xs hover:border-pink-300 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Instagram size={22} />
                </div>
                <span className="text-[11px] font-bold text-rose-800">Instagram</span>
              </div>
              <h3 className="text-sm font-black text-slate-900">
                {language === 'ar'
                  ? OFFICIAL_SUPPORT_CONFIG.instagram.titleAr
                  : OFFICIAL_SUPPORT_CONFIG.instagram.titleEn}
              </h3>
              <div className="mt-1.5 text-lg font-mono font-black text-slate-950" dir="ltr">
                {OFFICIAL_SUPPORT_CONFIG.instagram.handle}
              </div>
              <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">
                {language === 'ar'
                  ? OFFICIAL_SUPPORT_CONFIG.instagram.subtitleAr
                  : OFFICIAL_SUPPORT_CONFIG.instagram.subtitleEn}
              </p>
            </div>

            <div className="mt-4 pt-3.5 border-t border-pink-200/70">
              <a
                href={OFFICIAL_SUPPORT_CONFIG.instagram.url}
                target="_blank"
                rel="noopener noreferrer"
                data-support-channel="official-instagram"
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-700 hover:to-purple-700 text-white text-xs font-extrabold transition-colors shadow-xs"
              >
                <Instagram size={15} />
                <span>
                  {language === 'ar'
                    ? OFFICIAL_SUPPORT_CONFIG.instagram.ctaAr
                    : OFFICIAL_SUPPORT_CONFIG.instagram.ctaEn}
                </span>
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        </div>

        {/* 5. IN-PLATFORM SUPPORT MESSAGING (LOADING, SENDING, SUCCESS, FAILURE STATES) */}
        {isFormExpanded && (
          <div className="rounded-3xl bg-slate-50/80 border border-slate-200 p-5 sm:p-7 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  {language === 'ar'
                    ? 'مراسلة الدعم من داخل منصة MEDORA'
                    : 'Message Support Inside MEDORA Platform'}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  {language === 'ar'
                    ? 'أرسل رسالتك أو بلاغك الفني مباشرة وسيتم تسجيله برقم متابعة رسمي وإشعار فريق الدعم.'
                    : 'Send your inquiry directly inside the platform and receive an official tracking reference.'}
                </p>
              </div>
              <div className="text-[11px] font-bold text-[#003366] bg-white px-3 py-1.5 rounded-xl border border-slate-200 shrink-0" dir="ltr">
                {OFFICIAL_SUPPORT_CONFIG.email.address}
              </div>
            </div>

            {submissionStatus === 'success' && lastSubmittedTicket ? (
              <div
                data-support-state="success"
                className="bg-white rounded-2xl p-6 sm:p-8 border border-emerald-200 text-center space-y-4 shadow-xs"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={30} />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-base sm:text-lg font-black text-slate-900">
                    {language === 'ar'
                      ? 'تم إرسال رسالتك إلى مركز الدعم الرسمي بنجاح'
                      : 'Your Support Message Was Sent Successfully'}
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                    {language === 'ar'
                      ? 'تم تسجيل طلبك في المنظومة برقم المرجع التالي وسيقوم فريق MEDORA بمتابعته والرد عليك في أقرب وقت.'
                      : 'Your inquiry has been logged with the tracking reference below. Our support team will follow up promptly.'}
                  </p>
                </div>

                <div className="inline-flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900">
                  <span>{language === 'ar' ? 'رقم المرجع:' : 'Reference:'}</span>
                  <span className="font-mono text-sm font-black" dir="ltr">
                    {lastSubmittedTicket.referenceCode}
                  </span>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionStatus('idle');
                      setLastSubmittedTicket(null);
                    }}
                    className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#003366] hover:bg-[#001738] text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    {language === 'ar' ? 'إرسال رسالة دعم جديدة' : 'Send Another Message'}
                  </button>
                  <a
                    href={generalWhatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                  >
                    <MessageSquare size={14} />
                    <span>{language === 'ar' ? 'متابعة فورية عبر واتساب العام' : 'Follow Up via General WhatsApp'}</span>
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* FAILURE / ERROR STATE */}
                {submissionStatus === 'error' && errorMessage && (
                  <div
                    role="alert"
                    data-support-state="error"
                    className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">
                          {language === 'ar' ? 'تعذر إرسال الرسالة' : 'Submission Failed'}
                        </div>
                        <p className="mt-0.5 text-red-800">{errorMessage}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSubmit()}
                      className="px-3.5 py-2 min-h-[38px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <RefreshCw size={13} />
                      <span>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                    </button>
                  </div>
                )}

                {/* SENSITIVE DATA WARNING */}
                {sensitiveWarning.detected && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-2.5">
                    <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      {language === 'ar'
                        ? 'تنبيه أمني: يرجى عدم مشاركة كلمات المرور أو رموز التحقق (OTP) أو تفاصيل البطاقات المصرفية في رسائل الدعم.'
                        : 'Security notice: Never include passwords, OTP codes, or payment card numbers in support messages.'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {language === 'ar' ? 'الاسم الكامل / المنشأة *' : 'Full Name / Facility *'}
                    </label>
                    <input
                      type="text"
                      required
                      disabled={submissionStatus === 'submitting'}
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={language === 'ar' ? 'مثال: د. علي العبيدي' : 'e.g. Dr. Ali Al-Obaidi'}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {language === 'ar' ? 'البريد الإلكتروني للمتابعة *' : 'Reply Email Address *'}
                    </label>
                    <input
                      type="email"
                      required
                      disabled={submissionStatus === 'submitting'}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="name@example.com"
                      dir="ltr"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {language === 'ar' ? 'رقم الهاتف (اختياري)' : 'Phone / WhatsApp (Optional)'}
                    </label>
                    <input
                      type="tel"
                      disabled={submissionStatus === 'submitting'}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="07XXXXXXXXX"
                      dir="ltr"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {language === 'ar' ? 'توجيه الرسالة إلى القسم' : 'Target Support Desk'}
                    </label>
                    <select
                      disabled={submissionStatus === 'submitting'}
                      value={formData.channelPreference}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          channelPreference: e.target.value as SupportChannelPreference,
                        })
                      }
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
                    >
                      <option value="platform">
                        {language === 'ar' ? 'مركز الدعم داخل المنصة (رسمي)' : 'In-Platform Official Support'}
                      </option>
                      <option value="general">
                        {language === 'ar'
                          ? `${OFFICIAL_SUPPORT_CONFIG.generalSupport.titleAr} (${OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone})`
                          : `${OFFICIAL_SUPPORT_CONFIG.generalSupport.titleEn} (${OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone})`}
                      </option>
                      <option value="womens">
                        {language === 'ar'
                          ? `${OFFICIAL_SUPPORT_CONFIG.womensSupport.titleAr} (${OFFICIAL_SUPPORT_CONFIG.womensSupport.displayPhone})`
                          : `${OFFICIAL_SUPPORT_CONFIG.womensSupport.titleEn} (${OFFICIAL_SUPPORT_CONFIG.womensSupport.displayPhone})`}
                      </option>
                      <option value="email">
                        {language === 'ar'
                          ? `البريد الرسمي (${OFFICIAL_SUPPORT_CONFIG.email.address})`
                          : `Official Email (${OFFICIAL_SUPPORT_CONFIG.email.address})`}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {language === 'ar' ? 'البوابة / الصفة' : 'Portal / Role'}
                    </label>
                    <select
                      disabled={submissionStatus === 'submitting'}
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
                    >
                      <option value="patient">{language === 'ar' ? 'بوابة المريض' : 'Patient Portal'}</option>
                      <option value="doctor">{language === 'ar' ? 'بوابة الطبيب / العيادة' : 'Doctor / Clinic'}</option>
                      <option value="laboratory">{language === 'ar' ? 'بوابة المختبرات' : 'Medical Laboratory'}</option>
                      <option value="pharmacy">{language === 'ar' ? 'بوابة الصيدليات' : 'Pharmacy'}</option>
                      <option value="secretary">{language === 'ar' ? 'بوابة السكرتارية' : 'Secretary Portal'}</option>
                      <option value="super_admin">{language === 'ar' ? 'الإدارة العليا Super Admin' : 'Super Admin'}</option>
                      {!isPortalSuspended('radiology') && (
                        <option value="radiology_center">{language === 'ar' ? 'مركز الأشعة' : 'Radiology Center'}</option>
                      )}
                      {!isPortalSuspended('wholesaler') && (
                        <option value="wholesaler">{language === 'ar' ? 'مذخر الأدوية' : 'Wholesaler'}</option>
                      )}
                      <option value="other">{language === 'ar' ? 'أخرى / زائر' : 'Other / Visitor'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {language === 'ar' ? 'عنوان الاستفسار' : 'Subject'}
                    </label>
                    <input
                      type="text"
                      disabled={submissionStatus === 'submitting'}
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      placeholder={
                        language === 'ar'
                          ? 'مثال: تفعيل حساب أو استفسار تقني'
                          : 'e.g. Account activation or technical help'
                      }
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {language === 'ar' ? 'تفاصيل الرسالة *' : 'Message Details *'}
                  </label>
                  <textarea
                    rows={isCompact ? 3 : 4}
                    required
                    disabled={submissionStatus === 'submitting'}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder={
                      language === 'ar'
                        ? 'اكتب تفاصيل استفسارك أو طلب الدعم بوضوح...'
                        : 'Write your detailed support request here...'
                    }
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={submissionStatus === 'submitting'}
                    data-support-submit="true"
                    className="min-h-[48px] px-7 py-3 rounded-xl text-xs sm:text-sm font-black text-white brand-gradient-btn shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-wait"
                  >
                    {submissionStatus === 'submitting' ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>
                          {language === 'ar'
                            ? 'جاري الإرسال إلى مركز الدعم...'
                            : 'Sending to Official Support Center...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        <span>
                          {language === 'ar'
                            ? 'إرسال رسالة الدعم من داخل المنصة'
                            : 'Send In-Platform Support Message'}
                        </span>
                      </>
                    )}
                  </button>

                  <a
                    href={directEmailHref}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <Mail size={14} />
                    <span>
                      {language === 'ar'
                        ? `أو أرسل عبر البريد: ${OFFICIAL_SUPPORT_CONFIG.email.address}`
                        : `Or Email: ${OFFICIAL_SUPPORT_CONFIG.email.address}`}
                    </span>
                  </a>
                </div>
              </form>
            )}

            {/* REAL TICKETS LOADING & HISTORY STATUS */}
            {(isLoadingTickets || ticketHistoryError || tickets.length > 0) && (
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-2">
                    <Clock size={15} className="text-[#003366]" />
                    <span>
                      {language === 'ar' ? 'سجل مراسلاتك الأخيرة مع الدعم' : 'Your Recent Support Requests'}
                    </span>
                  </h4>
                  {isLoadingTickets && (
                    <span
                      data-support-state="loading"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"
                    >
                      <Loader2 size={13} className="animate-spin text-[#003366]" />
                      <span>{language === 'ar' ? 'جاري التحميل...' : 'Loading...'}</span>
                    </span>
                  )}
                </div>

                {ticketHistoryError && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    {ticketHistoryError}
                  </div>
                )}

                {tickets.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {tickets.slice(0, 4).map((ticket) => (
                      <div
                        key={ticket.id}
                        className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono font-bold text-[#003366]" dir="ltr">
                            {ticket.referenceCode}
                          </span>
                          <span className="font-bold text-slate-700">
                            {ticket.status === 'resolved'
                              ? language === 'ar'
                                ? 'تمت المعالجة'
                                : 'Resolved'
                              : ticket.status === 'in_progress'
                                ? language === 'ar'
                                  ? 'قيد المتابعة'
                                  : 'In Progress'
                                : language === 'ar'
                                  ? 'مفتوحة'
                                  : 'Open'}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {ticket.subject}
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">{ticket.message}</p>
                        {ticket.adminReply && (
                          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-950">
                            <strong>{language === 'ar' ? 'رد الإدارة:' : 'Support Reply:'}</strong>{' '}
                            {ticket.adminReply}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
