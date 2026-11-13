import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { X, ShieldCheck } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  type?: 'privacy' | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const { t, language } = useLanguage();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8 shadow-2xl border border-slate-200 text-start">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#003366] flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                {t.legal.privacyTitle}
              </h3>
              <span className="text-xs text-slate-500">
                {language === 'ar' 
                  ? 'منصة ميدورا MEDORA — الرعاية الصحية الرقمية الموحدة في العراق' 
                  : 'MEDORA Healthcare Platform — Unified Digital Healthcare in Iraq'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Medical & Confidentiality Disclaimer Banner */}
        <div className="mt-4 p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 text-xs leading-relaxed">
          <strong>{language === 'ar' ? 'إقرار حماية وسرية البيانات الطبية:' : 'Medical Data Protection & Confidentiality:'}</strong>{' '}
          {language === 'ar'
            ? 'تلتزم منظومة ميدورا بأعلى معايير التشفير والسرية الطبية المعمول بها لحماية خصوصية المرضى والكوادر الطبية والمراكز الصحية في عموم محافظات العراق.'
            : 'MEDORA adheres to rigorous encryption and medical confidentiality standards to safeguard the privacy of patients, clinical staff, and healthcare centers across Iraq.'}
        </div>

        {/* Modal Body Content */}
        <div className="mt-5 space-y-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <p>
            {language === 'ar'
              ? 'تلتزم منصة ميدورا (MEDORA) بحماية خصوصية المرضى والكوادر الطبية والمراكز الصحية في العراق وفق أرقى المعايير التقنية والأخلاقية.'
              : 'MEDORA is committed to safeguarding patient, clinician, and medical facility confidentiality in accordance with strict ethical and technological benchmarks.'}
          </p>
          <h4 className="font-bold text-slate-800 text-sm mt-3">
            {language === 'ar' ? '١. جمع البيانات وتشفيرها' : '1. Data Security & Storage'}
          </h4>
          <p>
            {language === 'ar'
              ? 'يتم تخزين السجلات الطبية وتقارير الفحوصات وصور الأشعة بتشفير سحابي آمن لا يمكن الاطلاع عليه إلا من قبل الكادر المعالج المصرح له أو المريض صاحب الملف.'
              : 'Medical records, pathology test sheets, and radiological imaging are protected with access-restricted security protocols.'}
          </p>
          <h4 className="font-bold text-slate-800 text-sm mt-3">
            {language === 'ar' ? '٢. عدم مشاركة البيانات مع جهات تجارية' : '2. No Commercial Data Sharing'}
          </h4>
          <p>
            {language === 'ar'
              ? 'لا يتم بيع أو مشاركة أي بيانات صحية أو تفاصيل تواصل شخصية لأغراض إعلانية أو تجارية تحت أي ظرف.'
              : 'No personal health data or contact details are sold or shared for external commercial advertising.'}
          </p>
          <h4 className="font-bold text-slate-800 text-sm mt-3">
            {language === 'ar' ? '٣. سيادة المريض على ملفاته' : '3. Patient Data Ownership'}
          </h4>
          <p>
            {language === 'ar'
              ? 'يحتفظ المريض بالحق الكامل في استعراض بياناته، منح أذونات مؤقتة لأطباء آخرين، وإلغاء هذه الأذونات في أي وقت عبر بوابته المعتمدة.'
              : 'Patients retain complete ownership of their health records, including granting and revoking time-bound access permissions to treating clinicians.'}
          </p>
        </div>

        {/* Modal Footer */}
        <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#003366] hover:bg-[#002244] transition-colors cursor-pointer"
          >
            {t.legal.close}
          </button>
        </div>
      </div>
    </div>
  );
};
