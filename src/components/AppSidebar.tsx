import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { getVisibleSupportContacts } from '../utils/supportRouting';
import { OFFICIAL_SUPPORT_CONFIG } from '../config/officialSupportConfig';
import { PORTALS_DATA } from '../data/portalsData';
import { PortalId } from '../types';
import { Logo } from './Logo';
import {
  Home,
  LayoutGrid,
  User,
  Stethoscope,
  Pill,
  FlaskConical,
  Scan,
  Truck,
  Calendar,
  ShieldCheck,
  FileText,
  Settings,
  Headphones,
  MessageCircle,
  Phone,
  ChevronLeft,
  ChevronRight,
  X,
  Bell,
  Download,
} from 'lucide-react';

interface AppSidebarProps {
  currentRoute: string;
  selectedPortalId: PortalId | null;
  onNavigateHome: () => void;
  onSelectPortal: (portalId: PortalId) => void;
  onNavigate: (route: string) => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenFeaturesGuide: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentRoute,
  selectedPortalId,
  onNavigateHome,
  onNavigate,
  onOpenProfile,
  onOpenSettings,
  onOpenFeaturesGuide,
  mobileOpen,
  onCloseMobile,
}) => {
  const { language, isRTL } = useLanguage();
  const { user, userProfile, isAdmin } = useAuth();
  const contacts = getVisibleSupportContacts({
    isAuthenticated: Boolean(user),
    userRole: userProfile?.role,
    gender: userProfile?.gender,
    isAdmin,
  });

  const isHomeActive = currentRoute === 'home' && !selectedPortalId;
  const isPortalsActive = currentRoute === 'portals' && !selectedPortalId;
  const activePortal = selectedPortalId
    ? PORTALS_DATA.find((p) => p.id === selectedPortalId) || null
    : null;

  const getPortalIcon = (id: PortalId) => {
    switch (id) {
      case 'laboratory':
        return <FlaskConical size={18} />;
      case 'pharmacy':
        return <Pill size={18} />;
      case 'doctor':
        return <Stethoscope size={18} />;
      case 'patient':
        return <User size={18} />;
      case 'super_admin':
        return <ShieldCheck size={18} />;
      case 'secretary':
        return <Calendar size={18} />;
      case 'wholesaler':
        return <Truck size={18} />;
      case 'radiology':
        return <Scan size={18} />;
    }
  };

  const handleHomeClick = () => {
    onNavigateHome();
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 z-40 lg:hidden backdrop-blur-xs transition-opacity print:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Main Sidebar Shell (never dumps all portals simultaneously) */}
      <aside
        className={`fixed top-0 bottom-0 z-50 w-72 bg-[#001738] text-white flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out border-slate-800 print:hidden ${
          isRTL ? 'right-0 border-l' : 'left-0 border-r'
        } ${
          mobileOpen
            ? 'translate-x-0'
            : isRTL
              ? 'translate-x-full lg:translate-x-0'
              : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Header with Brand Logo */}
        <div className="p-4 pb-3.5 border-b border-slate-800/80 flex items-center justify-between">
          <button
            type="button"
            onClick={handleHomeClick}
            className="flex items-center gap-2 text-start group cursor-pointer focus:outline-hidden"
          >
            <Logo size="sm" showTagline={true} light={true} />
          </button>

          {/* Close button for mobile */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close Sidebar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          {/* Primary 3-Stage Flow Navigation */}
          <div className="space-y-1.5">
            {/* Active Selected Portal Indicator (ONLY the currently active portal) */}
            {activePortal && (
              <div className="mb-3 p-3 rounded-xl bg-blue-600/25 border border-blue-400/40 text-sky-100">
                <div className="text-[10px] font-semibold text-sky-300 mb-1">
                  {language === 'ar' ? 'البوابة المفتوحة حالياً' : 'Active Section'}
                </div>
                <div className="flex items-center gap-2.5 text-sm font-bold text-white">
                  <span className="text-sky-300 shrink-0">{getPortalIcon(activePortal.id)}</span>
                  <span className="truncate">
                    {language === 'ar' ? activePortal.titleAr : activePortal.titleEn}
                  </span>
                </div>
              </div>
            )}

            {/* Back to Section Selection */}
            <button
              type="button"
              onClick={() => {
                onNavigate('portals');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                isPortalsActive
                  ? 'bg-[#1a56db] text-white shadow-md shadow-blue-900/40'
                  : 'text-slate-200 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <LayoutGrid size={18} className={isPortalsActive ? 'text-white' : 'text-sky-400'} />
                <span>
                  {activePortal
                    ? language === 'ar'
                      ? 'العودة إلى اختيار الأقسام'
                      : 'Back to Sections'
                    : language === 'ar'
                      ? 'اختيار القسم'
                      : 'Choose Section'}
                </span>
              </div>
              <span className="text-slate-400 text-xs">
                {isRTL ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>

            {/* Welcome Screen */}
            <button
              type="button"
              onClick={handleHomeClick}
              className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                isHomeActive
                  ? 'bg-blue-600/30 text-sky-300 font-bold border border-blue-500/40'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Home size={18} className="text-slate-400" />
                <span>{language === 'ar' ? 'شاشة الترحيب' : 'Welcome Screen'}</span>
              </div>
              <span className="text-slate-500 text-xs">
                {isRTL ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>

            {/* Notification Inbox */}
            <button
              type="button"
              onClick={() => {
                onNavigate('notifications');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all group cursor-pointer ${
                currentRoute === 'notifications'
                  ? 'bg-blue-600/30 text-sky-300 font-bold border border-blue-500/40'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Bell size={18} className={currentRoute === 'notifications' ? 'text-sky-300' : 'text-slate-400 group-hover:text-slate-200'} />
                <span>{language === 'ar' ? 'صندوق الإشعارات' : 'Notification Inbox'}</span>
              </div>
              <span className="text-slate-500 group-hover:text-slate-300 text-xs">
                {isRTL ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>

            {/* Install App */}
            <button
              type="button"
              onClick={() => {
                onNavigate('install');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all group cursor-pointer ${
                currentRoute === 'install'
                  ? 'bg-emerald-600/30 text-emerald-300 font-bold border border-emerald-500/40'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Download size={18} className={currentRoute === 'install' ? 'text-emerald-300' : 'text-emerald-400 group-hover:text-emerald-300'} />
                <span>{language === 'ar' ? 'تثبيت التطبيق (أندرويد وآيفون)' : 'Install App (Android & iOS)'}</span>
              </div>
              <span className="text-slate-500 group-hover:text-slate-300 text-xs">
                {isRTL ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
          </div>

          {/* Utility Divider */}
          <div className="border-t border-slate-800/90 pt-4 space-y-1">
            {/* Features Guide */}
            <button
              type="button"
              onClick={() => {
                onOpenFeaturesGuide();
                onCloseMobile();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:bg-slate-800/70 hover:text-white transition-all cursor-pointer"
            >
              <FileText size={17} className="text-slate-400" />
              <span>{language === 'ar' ? 'دليل ميزات المنظومة' : 'Platform Features Guide'}</span>
            </button>

            {/* Profile */}
            <button
              type="button"
              onClick={() => {
                onOpenProfile();
                onCloseMobile();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:bg-slate-800/70 hover:text-white transition-all cursor-pointer"
            >
              <User size={17} className="text-slate-400" />
              <span>{language === 'ar' ? 'الملف الشخصي' : 'My Profile'}</span>
            </button>

            {/* Settings */}
            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                onCloseMobile();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:bg-slate-800/70 hover:text-white transition-all cursor-pointer"
            >
              <Settings size={17} className="text-slate-400" />
              <span>{language === 'ar' ? 'الإعدادات' : 'Settings'}</span>
            </button>

            {/* Support */}
            <button
              type="button"
              onClick={() => {
                onNavigate('support');
                onCloseMobile();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:bg-slate-800/70 hover:text-white transition-all cursor-pointer"
            >
              <Headphones size={17} className="text-slate-400" />
              <span>{language === 'ar' ? 'الدعم والمساعدة' : 'Support & Help'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Official Support Contact Box & Version */}
        <div className="p-3.5 border-t border-slate-800/80 bg-[#00132e]/90 space-y-2">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <MessageCircle size={18} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-300 block leading-tight">
                  {language === 'ar'
                    ? OFFICIAL_SUPPORT_CONFIG.generalSupport.titleAr
                    : OFFICIAL_SUPPORT_CONFIG.generalSupport.titleEn}
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400 tracking-wider" dir="ltr">
                  {contacts.generalContact.displayPhone}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href={contacts.generalContact.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 text-[11px] font-bold transition-colors"
              >
                <MessageCircle size={12} />
                <span>{language === 'ar' ? 'واتساب' : 'WhatsApp'}</span>
              </a>
              <a
                href={contacts.generalContact.callHref}
                className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition-colors"
              >
                <Phone size={12} />
                <span>{language === 'ar' ? 'اتصال' : 'Call'}</span>
              </a>
            </div>
          </div>

          {contacts.femaleContact && (
            <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-700/50 text-white space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-rose-200">
                  {language === 'ar'
                    ? OFFICIAL_SUPPORT_CONFIG.womensSupport.titleAr
                    : OFFICIAL_SUPPORT_CONFIG.womensSupport.titleEn}
                </span>
                <span className="text-[11px] font-mono font-bold text-rose-300" dir="ltr">
                  {contacts.femaleContact.displayPhone}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  href={contacts.femaleContact.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-100 text-[10px] font-bold transition-colors"
                >
                  <MessageCircle size={11} />
                  <span>{language === 'ar' ? 'واتساب' : 'WhatsApp'}</span>
                </a>
                <a
                  href={contacts.femaleContact.callHref}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold transition-colors"
                >
                  <Phone size={11} />
                  <span>{language === 'ar' ? 'اتصال' : 'Call'}</span>
                </a>
              </div>
            </div>
          )}

          <div className="text-center text-[10px] text-slate-400 font-mono tracking-wider">
            v1.0.1
          </div>
        </div>
      </aside>
    </>
  );
};
