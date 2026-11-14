import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { PORTALS_DATA } from '../data/portalsData';
import { isPortalActive } from '../config/portalsConfig';
import { PortalId } from '../types';
import {
  Stethoscope,
  Scan,
  FlaskConical,
  Pill,
  User,
  ShieldCheck,
  Users,
  Building2,
  ArrowLeft,
  ArrowRight,
  Search,
  Home,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

interface PortalsSelectionPageProps {
  onNavigateHome: () => void;
  onSelectPortal: (portalId: PortalId) => void;
}

/**
 * Stage 2: Section Selection Screen (اختر القسم الذي ترغب بالدخول إليه)
 * Displays only currently active portals as independent cards with icon, name,
 * and brief description. Any temporarily suspended portal is omitted.
 */
export const PortalsSelectionPage: React.FC<PortalsSelectionPageProps> = ({
  onNavigateHome,
  onSelectPortal,
}) => {
  const { isRTL, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'clinical' | 'diagnostic' | 'pharmacy' | 'public'
  >('all');

  const getPortalIcon = (iconName: string, size = 26) => {
    switch (iconName) {
      case 'doctor':
        return <Stethoscope size={size} />;
      case 'radiology':
        return <Scan size={size} />;
      case 'laboratory':
        return <FlaskConical size={size} />;
      case 'pharmacy':
        return <Pill size={size} />;
      case 'wholesaler':
        return <Building2 size={size} />;
      case 'patient':
        return <User size={size} />;
      case 'super_admin':
        return <ShieldCheck size={size} />;
      case 'secretary':
        return <Users size={size} />;
      default:
        return <Stethoscope size={size} />;
    }
  };

  // Show strictly currently active portals only
  const activePortals = PORTALS_DATA.filter((p) => isPortalActive(p.id));
  const hasLabActive = activePortals.some((p) => p.id === 'laboratory');
  const hasPharmacyActive = activePortals.some((p) => p.id === 'pharmacy');
  const hasClinicalActive = activePortals.some((p) => p.id === 'doctor' || p.id === 'secretary');

  const filterTabs = [
    {
      id: 'all' as const,
      visible: true,
      labelAr: `جميع الأقسام (${activePortals.length})`,
      labelEn: `All Sections (${activePortals.length})`,
    },
    {
      id: 'clinical' as const,
      visible: hasClinicalActive,
      labelAr: 'العيادات والسكرتارية',
      labelEn: 'Clinics & Secretary',
    },
    {
      id: 'diagnostic' as const,
      visible: hasLabActive,
      labelAr: 'المختبرات الطبية',
      labelEn: 'Medical Laboratories',
    },
    {
      id: 'pharmacy' as const,
      visible: hasPharmacyActive,
      labelAr: 'الصيدليات الأهلية',
      labelEn: 'Pharmacies',
    },
    {
      id: 'public' as const,
      visible: activePortals.some((p) => p.id === 'patient' || p.id === 'super_admin'),
      labelAr: 'المرضى والإدارة',
      labelEn: 'Patients & Admin',
    },
  ].filter((tab) => tab.visible);

  const filteredPortals = activePortals.filter((p) => {
    if (categoryFilter === 'clinical' && !['doctor', 'secretary'].includes(p.id)) return false;
    if (categoryFilter === 'diagnostic' && !['laboratory'].includes(p.id)) return false;
    if (categoryFilter === 'pharmacy' && !['pharmacy'].includes(p.id)) return false;
    if (categoryFilter === 'public' && !['patient', 'super_admin'].includes(p.id)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAr = p.titleAr.toLowerCase().includes(q) || p.descAr.toLowerCase().includes(q);
      const matchEn = p.titleEn.toLowerCase().includes(q) || p.descEn.toLowerCase().includes(q);
      return matchAr || matchEn;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-transparent pt-6 sm:pt-10 pb-20">
      {/* Top Breadcrumb Navigation back to Welcome Screen */}
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 mb-6 sm:mb-8">
        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-slate-500 py-3 border-b border-slate-200/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNavigateHome}
              className="flex items-center gap-1.5 text-slate-700 hover:text-[#003366] transition-colors cursor-pointer"
            >
              <Home size={15} />
              <span>{language === 'ar' ? 'شاشة الترحيب' : 'Welcome'}</span>
            </button>
            <span>{isRTL ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}</span>
            <span className="text-[#003366] font-bold">
              {language === 'ar' ? 'اختيار القسم' : 'Select Section'}
            </span>
          </div>

          <button
            type="button"
            onClick={onNavigateHome}
            className="text-xs font-bold text-slate-600 hover:text-[#003366] flex items-center gap-1.5 cursor-pointer"
          >
            {isRTL ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
            <span>{language === 'ar' ? 'العودة للترحيب' : 'Back to Welcome'}</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 space-y-8">
        {/* Stage 2 Primary Heading */}
        <div className="text-center max-w-3xl mx-auto space-y-2.5">
          <p className="text-xs font-bold text-[#0284c7] tracking-wide">
            {language === 'ar' ? 'منصات MEDORA الطبية' : 'MEDORA Healthcare Platforms'}
          </p>

          <h1 className="text-2xl sm:text-4xl font-black text-[#001738] tracking-tight text-balance">
            {language === 'ar'
              ? 'اختر القسم الذي ترغب بالدخول إليه'
              : 'Choose the Section You Wish to Enter'}
          </h1>

          <p className="text-xs sm:text-base text-slate-600 leading-relaxed text-balance">
            {language === 'ar'
              ? 'كل قسم يعمل كبوابة مستقلة متكاملة بصلاحياتها وخدماتها المخصصة لضمان الخصوصية والسرعة وسهولة الاستخدام.'
              : 'Each section opens its own independent portal with tailored tools, strict permissions, and zero clutter.'}
          </p>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {filterTabs.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3.5 py-2 min-h-[40px] rounded-xl font-bold text-xs transition-colors cursor-pointer whitespace-nowrap ${
                  categoryFilter === cat.id
                    ? 'bg-[#003366] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {language === 'ar' ? cat.labelAr : cat.labelEn}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search size={15} className="absolute top-3 start-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'ar' ? 'ابحث باسم القسم...' : 'Search section name...'}
              className="w-full ps-9 pe-3 py-2 min-h-[40px] rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-[#003366]"
            />
          </div>
        </div>

        {/* Active Section Cards Grid */}
        {filteredPortals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPortals.map((portal) => (
              <div
                key={portal.id}
                className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-7 shadow-xs hover:shadow-xl hover:-translate-y-1 border border-slate-200/90 transition-all duration-200 flex flex-col justify-between group relative overflow-hidden"
              >
                <div
                  className="absolute top-0 inset-x-0 h-1.5 transition-all group-hover:h-2"
                  style={{ backgroundColor: portal.accentColor }}
                />

                <div className="space-y-4">
                  {/* Icon & Section Name */}
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0 transition-transform group-hover:scale-105"
                      style={{ backgroundColor: portal.accentColor }}
                    >
                      {getPortalIcon(portal.iconName, 26)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-black text-slate-900 group-hover:text-[#003366] transition-colors leading-snug">
                        {language === 'ar' ? portal.titleAr : portal.titleEn}
                      </h2>
                      <p className="text-xs font-semibold text-slate-500 mt-0.5 truncate">
                        {language === 'ar' ? portal.subtitleAr : portal.subtitleEn}
                      </p>
                    </div>
                  </div>

                  {/* Brief Clear Description */}
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-3">
                    {language === 'ar' ? portal.descAr : portal.descEn}
                  </p>
                </div>

                {/* Enter Section CTA */}
                <button
                  type="button"
                  onClick={() => onSelectPortal(portal.id)}
                  className="mt-6 w-full py-3 min-h-[46px] px-4 rounded-xl text-xs sm:text-sm font-bold text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs hover:shadow-md hover:brightness-105 active:scale-[0.98]"
                  style={{ backgroundColor: portal.accentColor }}
                >
                  <span>{language === 'ar' ? 'دخول القسم' : 'Enter Section'}</span>
                  {isRTL ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white/95 rounded-3xl border border-slate-200 p-10 text-center space-y-3">
            <p className="text-sm font-bold text-slate-800">
              {language === 'ar' ? 'لا توجد أقسام مطابقة لبحثك' : 'No matching sections found'}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
            >
              {language === 'ar' ? 'عرض جميع الأقسام المتاحة' : 'Reset Filters'}
            </button>
          </div>
        )}

        {/* Accreditation and Security Info Card */}
        <div className="rounded-3xl p-6 sm:p-7 bg-white/95 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#003366] text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">
                {language === 'ar'
                  ? 'اعتماد الكوادر والمنشآت الصحية في العراق'
                  : 'Official Syndicate & Provider Accreditation'}
              </h3>
              <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">
                {language === 'ar'
                  ? 'يتطلب تفعيل صلاحيات الكوادر الطبية والمنشآت الصحية تدقيق رقم إجازة الممارسة النقابية لحماية سلامة المرضى.'
                  : 'Professional accounts require Iraqi syndicate license validation before clinical dispatch features are unlocked.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateHome}
            className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {language === 'ar' ? 'العودة لشاشة الترحيب' : 'Back to Welcome'}
          </button>
        </div>
      </div>
    </div>
  );
};
