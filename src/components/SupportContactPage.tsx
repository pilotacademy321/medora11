/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { isPortalSuspended } from '../config/portalsConfig';
import { OfficialSupportCenter } from './OfficialSupportCenter';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Headphones,
  HelpCircle,
  Home,
  ShieldAlert,
} from 'lucide-react';

interface SupportContactPageProps {
  onNavigateHome: () => void;
  onNavigatePortals: () => void;
}

export const SupportContactPage: React.FC<SupportContactPageProps> = ({
  onNavigateHome,
  onNavigatePortals,
}) => {
  const { isRTL, language } = useLanguage();
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const faqs = [
    {
      qAr: 'كيف يتم اعتماد حسابات الأطباء والصيادلة والمختبرات؟',
      qEn: 'How are doctor, pharmacy, and laboratory accounts accredited?',
      aAr: 'يتم تقديم طلب الانضمام مع إدخال رقم إجازة الممارسة الصادرة عن نقابة الأطباء أو الصيادلة أو ذوي المهن الصحية، ويقوم فريق الإدارة المركزية بالتحقق من صحة السجل قبل تفعيل الصلاحيات.',
      aEn: 'Practitioners submit registration details with their official Iraqi syndicate license number. Our accreditation team validates credentials before unlocking full clinical capabilities.',
    },
    {
      qAr: 'هل يمكن للمريض حجز موعد لدى طبيب وإجراء تحاليل في نفس اليوم؟',
      qEn: 'Can a patient book a doctor appointment and lab tests on the same day?',
      aAr: 'نعم، يمكن للمراجع حجز الموعد السريري واختيار موعد التحليل المخبري المناسب، وتصل النتائج مباشرة إلى ملف المريض الإلكتروني ليطلع عليها الطبيب المعالج.',
      aEn: 'Yes, patients can schedule consultations and diagnostic tests seamlessly, with results linked directly to their encrypted medical file.',
    },
    {
      qAr: 'كيف تطلب الصيدليات الأدوية بالجملة من المذاخر المعتمدة؟',
      qEn: 'How do pharmacies order wholesale medications from accredited warehouses?',
      aAr: 'من خلال بوابة الصيدليات (سوق المذاخر والمكاتب العلمية B2B)، يمكن للصيدلي استعراض الأصناف المعتمدة، وتدقيق الأسعار والوجبات بالدينار، وإرسال طلب الشراء فورياً.',
      aEn: 'Through the Pharmacy Portal B2B Wholesale Market tab, pharmacists can browse verified batch catalogs and place orders directly with drug warehouses.',
      hidden: isPortalSuspended('wholesaler'),
    },
    {
      qAr: 'ما هي ساعات عمل الدعم الفني والتنسيق الميداني؟',
      qEn: 'What are the operating hours of technical support and coordination?',
      aAr: 'مكتب التنسيق الرقمي متاح يومياً من الساعة ٨:٠٠ صباحاً حتى ١٠:٠٠ مساءً، وتتوفر خدمة المحادثة الفورية عبر واتساب والبريد الرسمي والمراسلة داخل المنصة.',
      aEn: 'Our coordination desk is active daily from 8:00 AM to 10:00 PM, with fast WhatsApp, official email, and in-platform ticket support.',
    },
  ].filter((faq) => !('hidden' in faq && faq.hidden));

  return (
    <div className="min-h-screen bg-transparent pt-24 pb-20">
      {/* Top Breadcrumb Navigation */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 sm:mb-8">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-500 py-3 border-b border-slate-200">
          <button
            type="button"
            onClick={onNavigateHome}
            className="flex items-center gap-1.5 text-slate-700 hover:text-[#003366] transition-colors cursor-pointer"
          >
            <Home size={15} />
            <span>{language === 'ar' ? 'الرئيسية' : 'Home'}</span>
          </button>
          <span>{isRTL ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}</span>
          <span className="text-[#003366] font-bold">
            {language === 'ar' ? 'مركز الدعم الرسمي MEDORA' : 'MEDORA Official Support Center'}
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-[#003366] uppercase tracking-wider">
            <Headphones size={15} />
            <span>
              {language === 'ar'
                ? 'مركز الدعم والتواصل الرسمي — MEDORA العراق'
                : 'Official Support & Coordination — MEDORA Iraq'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {language === 'ar'
              ? 'مركز الدعم الرسمي لمنصة MEDORA'
              : 'MEDORA Official Support Center'}
          </h1>

          <p className="text-xs sm:text-base text-slate-600 leading-relaxed text-balance">
            {language === 'ar'
              ? 'تواصل مباشرة مع فريق الدعم العام (الرجال) أو الدعم النسائي عبر واتساب، أو راسلنا عبر البريد الرسمي وحساب إنستغرام أو من داخل المنصة.'
              : 'Reach General Support (Men) or Women’s Support via WhatsApp, email us officially, follow Instagram, or message us directly inside MEDORA.'}
          </p>
        </div>

        {/* Full Official Support Center (All 5 Channels + States) */}
        <OfficialSupportCenter variant="full" portalId="public" />

        {/* FAQ & Emergency Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-extrabold text-lg">
              <HelpCircle size={20} className="text-[#003366]" />
              <span>{language === 'ar' ? 'الأسئلة الأكثر شيوعاً' : 'Frequently Asked Questions'}</span>
            </div>

            <div className="space-y-3">
              {faqs.map((faq, idx) => {
                const isOpen = activeFaq === idx;
                return (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-200 overflow-hidden transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveFaq(isOpen ? null : idx)}
                      className="w-full p-3.5 text-start font-bold text-xs sm:text-sm text-slate-800 bg-slate-50 hover:bg-slate-100 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                    >
                      <span>{language === 'ar' ? faq.qAr : faq.qEn}</span>
                      <span className="text-slate-400 shrink-0 font-bold text-base">
                        {isOpen ? '−' : '+'}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="p-3.5 bg-white text-xs text-slate-600 leading-relaxed border-t border-slate-100">
                        {language === 'ar' ? faq.aAr : faq.aEn}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-5 rounded-3xl p-6 sm:p-7 bg-red-50 border border-red-200 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-red-900">
              <ShieldAlert size={18} className="text-red-600 shrink-0" />
              <span>
                {language === 'ar' ? 'تنبيه الحالات الإسعافية الطارئة' : 'Emergency Medical Notice'}
              </span>
            </div>
            <p className="text-xs text-red-800 leading-relaxed">
              {language === 'ar'
                ? 'هذه المنظومة مخصصة للرعاية المنتظمة وتنسيق المواعيد والخدمات الطبية. في حال وجود حالة طوارئ حرجة فورية، يرجى الاتصال بالإسعاف الفوري العراقي على الرقم (122) أو التوجه لأقرب طوارئ مستشفى حكومي.'
                : 'This platform is designed for scheduled care and clinical coordination. For life-threatening emergencies, please dial Iraqi Emergency Dispatch at 122 or proceed to the nearest emergency room immediately.'}
            </p>
          </div>
        </div>

        {/* Bottom Navigation CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl bg-slate-100 border border-slate-200">
          <div className="text-xs text-slate-600">
            {language === 'ar'
              ? 'انتقل إلى شاشة اختيار الأقسام أو عد إلى شاشة الترحيب.'
              : 'Explore the medical portals or return to the welcome screen.'}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onNavigateHome}
              className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer"
            >
              {language === 'ar' ? 'شاشة الترحيب' : 'Welcome Screen'}
            </button>

            <button
              type="button"
              onClick={onNavigatePortals}
              className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-white bg-[#003366] hover:bg-slate-900 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>{language === 'ar' ? 'اختيار القسم' : 'Choose Section'}</span>
              {isRTL ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
