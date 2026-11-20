import { ErrorBoundary } from './components/common/ErrorBoundary';
import React, { useEffect, useState } from 'react';
import { HRMSProvider, useHRMS } from './context/HRMSContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './components/auth/LoginPage';
import { authService, toAppUser } from './services/authService';
import { initGlobalKeyboardGuard } from './utils/keyboardUtils';
import { PublicPolicyPages, resolvePublicPolicyRoute, PublicPolicyRoute } from './components/public/PublicPolicyPages';

const AuthenticatedApp: React.FC = () => {
  const { updateCurrentUser, setActiveModule, resetToDashboard, syncAllWithCloud } = useHRMS();
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'anonymous'>('checking');
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  useEffect(() => {
    // Install global keyboard protection across entire HRMS
    const cleanupKeyboardGuard = initGlobalKeyboardGuard();
    return () => cleanupKeyboardGuard();
  }, []);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      const hasAnyLocalCredential = Boolean(authService.getToken() || authService.getRefreshToken());
      // Even if localStorage was cleared by mobile browser, attempt silent HttpOnly cookie refresh
      try {
        const authUser = await authService.getCurrentUser();
        if (!active) return;
        const appUser = toAppUser(authUser);
        updateCurrentUser(appUser);
        setSessionNotice(null);
        // Preserve the user's current module across valid page refreshes instead of
        // forcibly bouncing them back to Dashboard (fresh login still opens Dashboard).
        let restoredModule = 'dashboard';
        try {
          const savedModule = window.sessionStorage?.getItem('vrm_active_module');
          if (savedModule && savedModule.trim()) {
            restoredModule = savedModule.trim();
          }
        } catch {}
        setActiveModule(restoredModule as any);
        setAuthState('authenticated');
        void syncAllWithCloud?.();
      } catch (err: any) {
        if (!active) return;
        // Only display an expiry banner if the user actually had a prior session that expired/revoked
        const msg = err instanceof Error ? err.message : '';
        if (hasAnyLocalCredential && msg && !/no active session/i.test(msg)) {
          setSessionNotice(msg);
        }
        setAuthState('anonymous');
      }
    };

    void restoreSession();

    // Synchronize auth state cleanly across multiple open tabs & handle genuine server revocations
    const unsubscribe = authService.subscribeSessionChanges({
      onSessionExpired: (message) => {
        if (!active) return;
        setSessionNotice(message || 'Your session has expired. Please sign in again.');
        setAuthState('anonymous');
      },
      onLoggedOutInOtherTab: () => {
        if (!active) return;
        setSessionNotice('You were signed out in another tab.');
        setAuthState('anonymous');
      },
      onSessionUpdated: () => {
        if (!active) return;
        setSessionNotice(null);
      },
    });

    // Silently re-verify session after a temporary mobile/desktop network disconnection
    const handleOnline = () => {
      if (!active || !authService.getToken()) return;
      void authService.getCurrentUser()
        .then((u) => {
          if (active && u?.email) {
            updateCurrentUser(toAppUser(u));
          }
        })
        .catch(() => {
          // Non-fatal; definitive revocations emit hrms:session-expired automatically
        });
    };
    window.addEventListener('online', handleOnline);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
  }, []); // Run only once on mount to restore initial session

  const logout = () => {
    void authService.logout();
    resetToDashboard?.();
    setActiveModule('dashboard');
    setSessionNotice(null);
    updateCurrentUser({
      id: 'USR-001',
      name: 'Admin',
      email: 'developer@businz.com',
      role: 'Super Admin',
      avatar: '',
      department: 'Management',
      designation: 'CEO',
      employeeId: 'EMP-000'
    });
    setAuthState('anonymous');
  };

  if (authState === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#475569' }}>
        Verifying secure session…
      </div>
    );
  }

  return authState === 'authenticated' ? (
    <AppLayout onLogout={logout} />
  ) : (
    <LoginPage
      sessionNotice={sessionNotice}
      onLoginSuccess={() => {
        // Fresh login always starts from Dashboard and triggers a single authoritative sync
        setSessionNotice(null);
        resetToDashboard?.();
        setActiveModule('dashboard');
        setAuthState('authenticated');
        void syncAllWithCloud?.();
      }}
    />
  );
};

export const App: React.FC = () => {
  const [publicRoute, setPublicRoute] = useState<PublicPolicyRoute | null>(() =>
    typeof window !== 'undefined' ? resolvePublicPolicyRoute(window.location.pathname) : null
  );

  useEffect(() => {
    const syncRoute = () => {
      setPublicRoute(resolvePublicPolicyRoute(window.location.pathname));
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('vrm-public-nav', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('vrm-public-nav', syncRoute);
    };
  }, []);

  const handlePublicNavigate = (targetPath: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', targetPath);
      setPublicRoute(resolvePublicPolicyRoute(targetPath));
      window.dispatchEvent(new Event('vrm-public-nav'));
    }
  };

  if (publicRoute) {
    return (
      <ErrorBoundary fallbackTitle="BUSINZ HRMS Policy Page">
        <PublicPolicyPages route={publicRoute} onNavigate={handlePublicNavigate} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="HRMS Portal Recovery">
      <HRMSProvider>
        <AuthenticatedApp />
      </HRMSProvider>
    </ErrorBoundary>
  );
};

export default App;
