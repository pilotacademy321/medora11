import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { getVisibleSupportContacts } from '../utils/supportRouting';
import { OFFICIAL_SUPPORT_CONFIG } from '../config/officialSupportConfig';
import { Logo } from './Logo';
import { MessageSquare, Mail, Phone, ExternalLink, Instagram, ShieldCheck } from 'lucide-react';

interface FooterProps {
  onNavigate: (sectionId: string) => void;
  onOpenLegal: (type: 'privacy') => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenLegal }) => {
  const { t, language } = useLanguage();
  const { user, userProfile, isAdmin } = useAuth();
  const contacts = getVisibleSupportContacts({
    isAuthenticated: Boolean(user),
    userRole: userProfile?.role,
    gender: userProfile?.gender,
    isAdmin,
  });

  const whatsappHref = contacts.generalContact.whatsappHref;
  const callHref = contacts.generalContact.callHref;
  const emailHref = contacts.emailHref;

  return (
    <footer className="bg-[#00172e] text-slate-300 pt-16 pb-12 border-t border-slate-800 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-slate-800/80">
          {/* Brand & Slogan Column */}
          <div className="md:col-span-5 space-y-4">
            <div className="inline-block p-2 rounded-xl bg-white/5 border border-white/10">
              <Logo size="md" showTagline={true} light={true} />
            </div>

            <p className="text-xs sm:text-sm text-slate-300 max-w-sm leading-relaxed">
              {t.footer.brandDesc}
            </p>
          </div>

          {/* Quick Links Column */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              {language === 'ar' ? 'روابط المنصة' : 'Platform Links'}
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <button
                  onClick={() => onNavigate('home')}
                  className="hover:text-white transition-colors cursor-pointer text-start"
                >
                  {t.nav.home}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('portals')}
                  className="hover:text-white transition-colors cursor-pointer text-start"
                >
                  {t.nav.portals}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('support')}
                  className="hover:text-white transition-colors cursor-pointer text-start"
                >
                  {language === 'ar' ? 'الدعم الفني والتواصل' : 'Support & Contact'}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-white transition-colors cursor-pointer text-start"
                >
                  {t.nav.about}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('install')}
                  className="text-emerald-400 hover:text-emerald-300 font-bold transition-colors cursor-pointer text-start flex items-center gap-1.5"
                >
                  <span>{language === 'ar' ? 'تثبيت التطبيق (أندرويد وآيفون)' : 'Install App (Android & iPhone)'}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenLegal('privacy')}
                  className="hover:text-white transition-colors cursor-pointer text-start text-slate-400 hover:text-slate-200"
                >
                  {t.footer.links.privacy}
                </button>
              </li>
            </ul>
          </div>

          {/* Official Support Channels Column */}
          <div className="md:col-span-4 space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              {t.footer.supportTitle}
            </h4>
            
            <div className="space-y-3 text-xs sm:text-sm">
              <a
                href={OFFICIAL_SUPPORT_CONFIG.instagram.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-pink-500/40 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Instagram size={17} />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">
                      {language === 'ar'
                        ? OFFICIAL_SUPPORT_CONFIG.instagram.titleAr
                        : OFFICIAL_SUPPORT_CONFIG.instagram.titleEn}
                    </div>
                    <div className="font-bold text-white font-mono group-hover:text-pink-300 transition-colors">
                      {OFFICIAL_SUPPORT_CONFIG.instagram.handle}
                    </div>
                  </div>
                </div>
                <ExternalLink size={14} className="text-slate-500 group-hover:text-pink-400 transition-colors" />
              </a>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <MessageSquare size={16} />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">
                      {language === 'ar'
                        ? OFFICIAL_SUPPORT_CONFIG.generalSupport.titleAr
                        : OFFICIAL_SUPPORT_CONFIG.generalSupport.titleEn}
                    </div>
                    <div className="font-bold text-white font-mono" dir="ltr">{contacts.generalContact.displayPhone}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition-colors"
                  >
                    <MessageSquare size={12} />
                    <span>{language === 'ar' ? 'واتساب' : 'WhatsApp'}</span>
                  </a>
                  <a
                    href={callHref}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold transition-colors"
                  >
                    <Phone size={12} />
                    <span>{language === 'ar' ? 'اتصال' : 'Call'}</span>
                  </a>
                </div>
              </div>

              {contacts.femaleContact && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0">
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-rose-200/80">
                        {language === 'ar'
                          ? OFFICIAL_SUPPORT_CONFIG.womensSupport.titleAr
                          : OFFICIAL_SUPPORT_CONFIG.womensSupport.titleEn}
                      </div>
                      <div className="font-bold text-white font-mono" dir="ltr">{contacts.femaleContact.displayPhone}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={contacts.femaleContact.whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-rose-600/25 hover:bg-rose-600/40 text-rose-200 border border-rose-500/30 text-[11px] font-bold transition-colors"
                    >
                      <MessageSquare size={12} />
                      <span>{language === 'ar' ? 'واتساب' : 'WhatsApp'}</span>
                    </a>
                    <a
                      href={contacts.femaleContact.callHref}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold transition-colors"
                    >
                      <Phone size={12} />
                      <span>{language === 'ar' ? 'اتصال' : 'Call'}</span>
                    </a>
                  </div>
                </div>
              )}

              <a
                href={emailHref}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                  <Mail size={16} />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">
                    {language === 'ar'
                      ? OFFICIAL_SUPPORT_CONFIG.email.titleAr
                      : OFFICIAL_SUPPORT_CONFIG.email.titleEn}
                  </div>
                  <div className="font-semibold text-white font-mono break-all">{contacts.email}</div>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Medical Motif */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>{t.footer.copyright}</div>
        </div>
      </div>
    </footer>
  );
};
