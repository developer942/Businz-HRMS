import React, { useEffect, useState } from 'react';
import { HRMSProvider, useHRMS } from './context/HRMSContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './components/auth/LoginPage';
import { authService, toAppUser } from './services/authService';
import { initGlobalKeyboardGuard } from './utils/keyboardUtils';

const AuthenticatedApp: React.FC = () => {
  const { switchRole, updateCurrentUser, setActiveModule, resetToDashboard, syncAllWithCloud } = useHRMS();
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'anonymous'>('checking');

  useEffect(() => {
    // Install global keyboard protection across entire HRMS
    const cleanupKeyboardGuard = initGlobalKeyboardGuard();
    return () => cleanupKeyboardGuard();
  }, []);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      if (!authService.getToken()) {
        if (active) setAuthState('anonymous');
        return;
      }

      try {
        const authUser = await authService.getCurrentUser();
        if (!active) return;
        const appUser = toAppUser(authUser);
        updateCurrentUser(appUser);
        void syncAllWithCloud?.();
        // Primary Rule: Software must ALWAYS start from dashboard
        resetToDashboard?.();
        setActiveModule('dashboard');
        setAuthState('authenticated');
      } catch {
        if (active) setAuthState('anonymous');
      }
    };

    void restoreSession();
    return () => { active = false; };
  }, []); // Run only once on mount to restore initial session

  const logout = () => {
    authService.clearSession();
    resetToDashboard?.();
    setActiveModule('dashboard');
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
    <LoginPage onLoginSuccess={() => {
      // Primary Rule: Software must ALWAYS start from dashboard upon logging in and refresh authoritative DB state
      void syncAllWithCloud?.();
      resetToDashboard?.();
      setActiveModule('dashboard');
      setAuthState('authenticated');
    }} />
  );
};

export const App: React.FC = () => (
  <HRMSProvider>
    <AuthenticatedApp />
  </HRMSProvider>
);

export default App;
