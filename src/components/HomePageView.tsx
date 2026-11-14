import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { PortalId } from '../types';
import { Logo } from './Logo';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';

interface HomePageViewProps {
  onNavigate: (route: string) => void;
  onSelectPortal?: (portalId: PortalId) => void;
}

/**
 * Stage 1: Welcome Screen (شاشة الترحيب)
 * Pure, distraction-free entry screen displaying:
 * - MEDORA Logo
 * - Headline: «مرحباً بك في منصات MEDORA»
 * - Short intro: «وجهتك الطبية المتكاملة للوصول إلى الخدمات الصحية بسهولة وأمان»
 * - Primary CTA: «ابدأ» -> navigates cleanly to Stage 2 (Section Selection)
 * Intentionally displays ZERO portals or sections on this screen.
 */
export const HomePageView: React.FC<HomePageViewProps> = ({ onNavigate }) => {
  const { language, isRTL } = useLanguage();

  const handleStart = () => {
    onNavigate('portals');
  };

  return (
    <section
      aria-label={language === 'ar' ? 'شاشة الترحيب بمنصات MEDORA' : 'MEDORA Welcome Screen'}
      className="min-h-[calc(100vh-11rem)] flex items-center justify-center py-6 sm:py-10"
    >
      <div className="w-full max-w-6xl mx-auto">
        <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* Primary Welcome & Action Column */}
          <div className="lg:col-span-6 p-7 sm:p-10 lg:p-14 flex flex-col justify-center items-start text-start space-y-6">
            {/* Official MEDORA Logo */}
            <div className="shrink-0">
              <Logo size="lg" showTagline={true} />
            </div>

            {/* Welcome Headline */}
            <div className="space-y-3.5 max-w-xl">
              <h1
                className="text-3xl sm:text-4xl lg:text-[2.65rem] font-black text-[#001738] tracking-tight leading-[1.2] text-balance"
              >
                {language === 'ar' ? 'مرحباً بك في منصات MEDORA' : 'Welcome to MEDORA Platforms'}
              </h1>

              <p className="text-sm sm:text-base lg:text-lg text-slate-600 font-medium leading-relaxed max-w-lg">
                {language === 'ar'
                  ? 'وجهتك الطبية المتكاملة للوصول إلى الخدمات الصحية بسهولة وأمان'
                  : 'Your integrated medical destination for easy, secure healthcare access.'}
              </p>
            </div>

            {/* Primary Start Action Button */}
            <div className="pt-1 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleStart}
                className="w-full sm:w-auto min-w-[200px] min-h-[54px] px-10 py-3.5 rounded-2xl brand-gradient-btn text-white font-black text-base sm:text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003366]"
              >
                <span>{language === 'ar' ? 'ابدأ' : 'Start'}</span>
                {isRTL ? <ArrowLeft size={20} /> : <ArrowRight size={20} />}
              </button>
            </div>

            {/* Clean unboxed step & trust footer */}
            <div className="pt-4 border-t border-slate-200/70 w-full flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 font-semibold">
              <span className="inline-flex items-center gap-1.5 text-[#003366]">
                <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
                <span>
                  {language === 'ar'
                    ? 'بيئة طبية معتمدة ومشفرة بالكامل'
                    : 'Verified & encrypted clinical environment'}
                </span>
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span>
                {language === 'ar'
                  ? 'الترحيب ← اختيار القسم ← البوابة المختارة'
                  : 'Welcome · Choose Section · Dedicated Portal'}
              </span>
            </div>
          </div>

          {/* Balanced Visual Showcase Column */}
          <div className="lg:col-span-6 bg-gradient-to-br from-[#dceeff] via-[#eef6ff] to-[#cfe5fa] relative min-h-[260px] sm:min-h-[340px] lg:min-h-[460px] flex items-center justify-center overflow-hidden border-t lg:border-t-0 lg:border-s border-slate-200/70">
            <picture className="w-full h-full block">
              <source srcSet="/assets/images/medora-hero-opt.webp" type="image/webp" />
              <img
                src="/assets/aistudio/file_00000000d0e08246a7817a4a6dd65913_c057d2c6.png"
                alt="MEDORA Healthcare Platform"
                width={1200}
                height={800}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center block"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            </picture>
          </div>
        </div>
      </div>
    </section>
  );
};
