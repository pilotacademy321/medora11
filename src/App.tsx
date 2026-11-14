/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense } from 'react';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { AppSidebar } from './components/AppSidebar';
import { HomePageView } from './components/HomePageView';
import { Footer } from './components/Footer';
import { AppBackground } from './components/AppBackground';
import { registerPushServiceWorker } from './lib/pushNotificationService';
import { PortalId } from './types';
import { parseCurrentRoute, navigateTo, RouteState } from './utils/navigation';

// Route-level code splitting: load portal workspaces and secondary pages on demand only
const PortalsSelectionPage = React.lazy(() =>
  import('./components/PortalsSelectionPage').then((m) => ({ default: m.PortalsSelectionPage }))
);
const AboutUsPage = React.lazy(() =>
  import('./components/AboutUsPage').then((m) => ({ default: m.AboutUsPage }))
);
const SupportContactPage = React.lazy(() =>
  import('./components/SupportContactPage').then((m) => ({ default: m.SupportContactPage }))
);
const PortalShellView = React.lazy(() =>
  import('./components/PortalShellView').then((m) => ({ default: m.PortalShellView }))
);
const NotificationInbox = React.lazy(() =>
  import('./components/NotificationInbox').then((m) => ({ default: m.NotificationInbox }))
);
const InstallUpdatePage = React.lazy(() =>
  import('./components/InstallUpdatePage').then((m) => ({ default: m.InstallUpdatePage }))
);

// Modal-level code splitting: never block initial Home page bundle
const LegalModal = React.lazy(() =>
  import('./components/LegalModals').then((m) => ({ default: m.LegalModal }))
);
const OnboardingModal = React.lazy(() =>
  import('./components/OnboardingModal').then((m) => ({ default: m.OnboardingModal }))
);
const AuthDomainGuideModal = React.lazy(() =>
  import('./components/AuthDomainGuideModal').then((m) => ({ default: m.AuthDomainGuideModal }))
);
const FeaturesGuideModal = React.lazy(() =>
  import('./components/FeaturesGuideModal').then((m) => ({ default: m.FeaturesGuideModal }))
);
const NotificationPermissionBanner = React.lazy(() =>
  import('./components/NotificationPermissionBanner').then((m) => ({ default: m.NotificationPermissionBanner }))
);
const NotificationSettingsModal = React.lazy(() =>
  import('./components/NotificationSettingsModal').then((m) => ({ default: m.NotificationSettingsModal }))
);

const RouteLoadingSkeleton: React.FC<{ language: 'ar' | 'en' }> = ({ language }) => (
  <div className="bg-white/95 rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-xs animate-pulse space-y-6 my-2">
    <div className="flex items-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-slate-200 shrink-0" />
      <div className="space-y-2.5 flex-1">
        <div className="h-5 w-52 max-w-full rounded-lg bg-slate-200" />
        <div className="h-3.5 w-80 max-w-full rounded-lg bg-slate-100" />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="h-32 rounded-2xl bg-slate-100" />
      <div className="h-32 rounded-2xl bg-slate-100" />
      <div className="h-32 rounded-2xl bg-slate-100" />
    </div>
    <p className="text-center text-xs font-semibold text-slate-400">
      {language === 'ar' ? 'جاري تحميل الواجهة بسرعة...' : 'Loading interface...'}
    </p>
  </div>
);

const MainAppContent: React.FC = () => {
  const { language } = useLanguage();
  const { user, needsOnboarding, showDomainHelp, setShowDomainHelp } = useAuth();
  const [routeState, setRouteState] = useState<RouteState>(() => parseCurrentRoute());
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [featuresGuideOpen, setFeaturesGuideOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const [notificationInboxOpen, setNotificationInboxOpen] = useState(false);

  // Defer push service worker registration after initial paint settles
  useEffect(() => {
    const timer = window.setTimeout(() => {
      registerPushServiceWorker().catch((err) => {
        console.warn('[App] Push service worker registration notice:', err);
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const [legalModal, setLegalModal] = useState<{
    isOpen: boolean;
    type: 'privacy' | null;
  }>({
    isOpen: false,
    type: null,
  });

  // Handle URL Synchronization, Browser Back/Forward buttons and direct navigation
  useEffect(() => {
    const handleLocationChange = () => {
      const parsed = parseCurrentRoute();
      setRouteState(parsed);
    };

    handleLocationChange();
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const handleNavigate = (target: string) => {
    navigateTo(target);
  };

  const handleSelectPortal = (portalId: PortalId) => {
    navigateTo(portalId);
  };

  const handleResetToHome = () => {
    navigateTo('home');
  };

  const handleNavigateToPortals = () => {
    navigateTo('portals');
  };

  const handleOpenLegal = (_type: 'privacy' = 'privacy') => {
    setLegalModal({ isOpen: true, type: 'privacy' });
  };

  const handleCloseLegal = () => {
    setLegalModal({ isOpen: false, type: null });
  };

  // Render appropriate view based on routeState
  const renderCurrentView = () => {
    // 1. Dedicated Portal Page
    if (routeState.portalId) {
      return (
        <Suspense fallback={<RouteLoadingSkeleton language={language} />}>
          <PortalShellView
            portalId={routeState.portalId}
            onBackToHome={handleResetToHome}
            onBackToPortals={handleNavigateToPortals}
            onSelectPortal={handleSelectPortal}
          />
        </Suspense>
      );
    }

    // 2. Dedicated Portal Selection Page (/portals)
    if (routeState.route === 'portals') {
      return (
        <Suspense fallback={<RouteLoadingSkeleton language={language} />}>
          <PortalsSelectionPage
            onNavigateHome={handleResetToHome}
            onSelectPortal={handleSelectPortal}
          />
        </Suspense>
      );
    }

    // 3. Dedicated About Us Page (/about)
    if (routeState.route === 'about') {
      return (
        <Suspense fallback={<RouteLoadingSkeleton language={language} />}>
          <AboutUsPage
            onNavigateHome={handleResetToHome}
            onNavigatePortals={handleNavigateToPortals}
            onNavigateSupport={() => handleNavigate('support')}
          />
        </Suspense>
      );
    }

    // 4. Dedicated Support & Contact Page (/support)
    if (routeState.route === 'support') {
      return (
        <Suspense fallback={<RouteLoadingSkeleton language={language} />}>
          <SupportContactPage
            onNavigateHome={handleResetToHome}
            onNavigatePortals={handleNavigateToPortals}
          />
        </Suspense>
      );
    }

    // 5. Dedicated Notification Inbox Page (/notifications)
    if (routeState.route === 'notifications') {
      return (
        <Suspense fallback={<RouteLoadingSkeleton language={language} />}>
          <div className="py-2 sm:py-4">
            <NotificationInbox
              onSelectPortal={handleSelectPortal}
              onOpenSettings={() => setNotificationSettingsOpen(true)}
            />
          </div>
        </Suspense>
      );
    }

    // 6. Dedicated Official Installation & Update Page (/install)
    if (routeState.route === 'install') {
      return (
        <Suspense fallback={<RouteLoadingSkeleton language={language} />}>
          <InstallUpdatePage
            onNavigateHome={handleResetToHome}
            onNavigatePortals={handleNavigateToPortals}
          />
        </Suspense>
      );
    }

    // 7. Dedicated Welcome Landing Page (Default: / or /home)
    return (
      <HomePageView
        onNavigate={handleNavigate}
        onSelectPortal={handleSelectPortal}
      />
    );
  };

  const isWelcomeStage = routeState.route === 'home' && !routeState.portalId;

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-slate-900 transition-colors duration-200 relative overflow-x-hidden">
      {/* Official MEDORA Multi-Device Pure White Background */}
      <AppBackground />

      {/* Right Persistent Dark-Navy Sidebar (Hidden on Stage 1 Welcome Screen so zero portals appear) */}
      {!isWelcomeStage && (
        <AppSidebar
          currentRoute={routeState.route}
          selectedPortalId={routeState.portalId}
          onNavigateHome={handleResetToHome}
          onSelectPortal={handleSelectPortal}
          onNavigate={handleNavigate}
          onOpenProfile={() => {
            handleNavigate('patient');
          }}
          onOpenSettings={() => setShowDomainHelp(true)}
          onOpenFeaturesGuide={() => setFeaturesGuideOpen(true)}
          mobileOpen={sidebarMobileOpen}
          onCloseMobile={() => setSidebarMobileOpen(false)}
        />
      )}

      {/* Main Content Area (Full-width on Stage 1 Welcome Screen, offset for sidebar on Stages 2 & 3) */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${isWelcomeStage ? '' : 'lg:ps-72'}`}>
        {/* Global Top Navigation Header */}
        <Header
          activeSection={routeState.route}
          onNavigate={handleNavigate}
          selectedPortalId={routeState.portalId}
          onResetToHome={handleResetToHome}
          onToggleSidebar={isWelcomeStage ? undefined : () => setSidebarMobileOpen((prev) => !prev)}
          onSelectPortal={handleSelectPortal}
          onOpenNotificationSettings={() => setNotificationSettingsOpen(true)}
          onOpenNotificationInbox={() => setNotificationInboxOpen(true)}
          hideSearch={isWelcomeStage}
        />

        {/* Routed View Container with Smooth Composited Stage Transition */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 max-w-7xl w-full mx-auto">
          <div key={routeState.path} className="medora-stage-enter">
            {renderCurrentView()}
          </div>
        </main>

        {/* Global Footer */}
        <Footer onNavigate={handleNavigate} onOpenLegal={handleOpenLegal} />
      </div>

      {/* Push Notification Permission Banner (only mount when signed in) */}
      {user && (
        <Suspense fallback={null}>
          <NotificationPermissionBanner
            onOpenSettings={() => setNotificationSettingsOpen(true)}
          />
        </Suspense>
      )}

      {/* Notification Settings Modal */}
      {notificationSettingsOpen && (
        <Suspense fallback={null}>
          <NotificationSettingsModal
            isOpen={notificationSettingsOpen}
            onClose={() => setNotificationSettingsOpen(false)}
          />
        </Suspense>
      )}

      {/* Notification Inbox Modal */}
      {notificationInboxOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
            <Suspense fallback={<RouteLoadingSkeleton language={language} />}>
              <NotificationInbox
                isModal
                onClose={() => setNotificationInboxOpen(false)}
                onSelectPortal={handleSelectPortal}
                onOpenSettings={() => {
                  setNotificationInboxOpen(false);
                  setNotificationSettingsOpen(true);
                }}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Legal Terms & Privacy Modal */}
      {legalModal.isOpen && (
        <Suspense fallback={null}>
          <LegalModal
            isOpen={legalModal.isOpen}
            type={legalModal.type}
            onClose={handleCloseLegal}
          />
        </Suspense>
      )}

      {/* New User Role Setup & Accreditation Modal */}
      {needsOnboarding && user && (
        <Suspense fallback={null}>
          <OnboardingModal />
        </Suspense>
      )}

      {/* Features Guide Modal */}
      {featuresGuideOpen && (
        <Suspense fallback={null}>
          <FeaturesGuideModal
            isOpen={featuresGuideOpen}
            onClose={() => setFeaturesGuideOpen(false)}
            onSelectPortal={handleSelectPortal}
          />
        </Suspense>
      )}

      {/* Firebase Domain Guide Modal */}
      {showDomainHelp && (
        <Suspense fallback={null}>
          <AuthDomainGuideModal
            onSelectPortal={handleSelectPortal}
          />
        </Suspense>
      )}
    </div>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <MainAppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}
