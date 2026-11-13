import React from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { SubscriptionPlan } from '../types';
import { SubscriptionCheckoutPanel } from './SubscriptionCheckoutPanel';

interface SubscriptionPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: SubscriptionPlan | null;
  onSuccess?: () => void;
}

export const SubscriptionPaymentModal: React.FC<SubscriptionPaymentModalProps> = ({
  isOpen,
  onClose,
  plan,
  onSuccess,
}) => {
  const { language, isRTL } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-sm overflow-y-auto">
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-auto"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="bg-gradient-to-r from-[#002244] to-[#003366] text-white p-5 sm:p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 end-4 p-1.5 rounded-full hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              {language === 'ar' ? 'الدفع الرسمي لمنصة MEDORA' : 'Official MEDORA Subscription Checkout'}
            </span>
          </div>

          <h3 className="text-xl sm:text-2xl font-black tracking-tight">
            {language === 'ar' ? 'الاشتراك وتأكيد الدفع عبر المحفظة' : 'Subscription & Manual Wallet Transfer'}
          </h3>
          <p className="text-slate-200 text-xs sm:text-sm mt-1">
            {language === 'ar'
              ? 'الوسائل المعتمدة رسمياً: سوبر كي (SuperQi) و زين كاش (ZainCash) فقط — التفعيل بعد التحقق الإداري'
              : 'Official active methods: SuperQi & ZainCash only — Activation after Super Admin verification'}
          </p>
        </div>

        <div className="p-5 sm:p-6 max-h-[80vh] overflow-y-auto">
          <SubscriptionCheckoutPanel
            initialPlanId={plan?.id}
            compact
            onSubmitted={() => {
              if (onSuccess) onSuccess();
            }}
          />
        </div>
      </div>
    </div>
  );
};
