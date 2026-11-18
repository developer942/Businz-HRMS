import React, { useState, useEffect, useRef } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { Employee, Role } from '../../types/hrms';
import { authService, toAppUser, AuthUser } from '../../services/authService';
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Mail,
  Lock,
  Check,
  AlertCircle,
  KeyRound,
  Smartphone,
  Clock,
  RotateCw,
  ShieldAlert,
} from 'lucide-react';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { supabaseDirect } from '../../services/supabaseDirectService';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

type AuthMode = 'PASSWORD' | 'OTP';
type OtpChannel = 'EMAIL' | 'MOBILE';
type OtpFlowStep = 'ENTER_DESTINATION' | 'VERIFY_CODE';

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { switchRole, updateCurrentUser, employees, setActiveModule, resetToDashboard } = useHRMS();

  const [authMode, setAuthMode] = useState<AuthMode>('PASSWORD');
  const [otpChannel, setOtpChannel] = useState<OtpChannel>('EMAIL');
  const [otpStep, setOtpStep] = useState<OtpFlowStep>('ENTER_DESTINATION');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isFormReady, setIsFormReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // OTP Login state
  const [otpEmail, setOtpEmail] = useState('');
  const [otpMobile, setOtpMobile] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [otpInfoMessage, setOtpInfoMessage] = useState<string | null>(null);
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(300);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [mobileOtpEnabled, setMobileOtpEnabled] = useState(false);
  const [mobileOtpStatusMessage, setMobileOtpStatusMessage] = useState(
    'Mobile OTP login is disabled until an authorized Indian DLT-compliant SMS provider is configured.'
  );

  // Prevent browser credential manager from auto-populating inputs on page load
  useEffect(() => {
    setIdentifier('');
    setPassword('');
    const timer = setTimeout(() => {
      setIsFormReady(true);
      setIdentifier('');
      setPassword('');
    }, 150);

    authService.getOtpConfig().then((cfg) => {
      setMobileOtpEnabled(cfg.mobileOtpEnabled);
      if (cfg.mobileOtpStatusMessage) {
        setMobileOtpStatusMessage(cfg.mobileOtpStatusMessage);
      }
    });

    return () => clearTimeout(timer);
  }, []);

  // OTP timers
  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const t = setInterval(() => setOtpResendCooldown((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [otpResendCooldown]);

  useEffect(() => {
    if (authMode !== 'OTP' || otpStep !== 'VERIFY_CODE' || otpExpirySeconds <= 0) return;
    const t = setInterval(() => setOtpExpirySeconds((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [authMode, otpStep, otpExpirySeconds]);

  // First Login Forced Password Change States
  const [showForceChangeModal, setShowForceChangeModal] = useState(false);
  const [pendingEmployee, setPendingEmployee] = useState<Employee | null>(null);
  const [pendingRole, setPendingRole] = useState<Role>('Employee');
  const [currentTempPassword, setCurrentTempPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  const passwordChecks = {
    minLength: newPassword.length >= 10,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasLowercase: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    hasSpecialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPassword),
    matchesConfirm: Boolean(newPassword && confirmPassword && newPassword === confirmPassword),
  };

  const isNewPasswordCompliant =
    passwordChecks.minLength &&
    passwordChecks.hasUppercase &&
    passwordChecks.hasLowercase &&
    passwordChecks.hasNumber &&
    passwordChecks.hasSpecialChar &&
    passwordChecks.matchesConfirm;

  const formatTimer = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const completeAuthenticatedSession = (userData: AuthUser, usedPassword?: string) => {
    if ((userData as any).accountStatus === 'DEACTIVATED' || (userData as any).accountStatus === 'DISABLED') {
      setIsLoading(false);
      authService.clearSession();
      setLoginError('Your account has been deactivated. Please contact HR or CEO for reactivation.');
      return;
    }

    if (userData.mustChangePassword && usedPassword) {
      setIsLoading(false);
      setPendingRole(toAppUser(userData).role);
      setPendingEmployee({
        id: userData.employeeId || userData.email,
        employeeId: userData.employeeId || userData.email,
        firstName: userData.name?.split(' ')[0] || 'Employee',
        lastName: userData.name?.split(' ')[1] || '',
        email: userData.email,
        phone: '',
        dob: '',
        gender: 'Male',
        address: '',
        department: userData.department || 'General',
        designation: userData.designation || 'Staff',
        reportingManagerId: '',
        reportingManagerName: '',
        joiningDate: '',
        employmentType: 'Full-Time',
        status: 'Active',
        avatar: '',
        basicSalary: 0,
        allowances: { hra: 0, transport: 0, medical: 0, special: 0 },
        bankDetails: { bankName: '', accountNumber: '', ifscCode: '', branch: '' },
        attendanceMethod: 'Face Scan',
        gpsAllowed: true,
        faceRegistered: false,
        documents: [],
        mustChangePassword: true,
      });
      setCurrentTempPassword(usedPassword);
      setShowForceChangeModal(true);
      return;
    }

    const appUser = toAppUser(userData);
    switchRole(appUser.role);
    updateCurrentUser(appUser);
    resetToDashboard?.();
    setActiveModule('dashboard');
    setIsLoading(false);
    onLoginSuccess();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setResetSuccessMessage(null);
    setIsLoading(true);

    const cleanIdentifier = identifier.trim().toLowerCase();

    const matchedLocalEmp = employees?.find(
      (emp) =>
        emp.employeeId?.toLowerCase() === cleanIdentifier ||
        emp.email?.toLowerCase() === cleanIdentifier ||
        emp.id?.toLowerCase() === cleanIdentifier
    );
    if (
      matchedLocalEmp &&
      (matchedLocalEmp.accountStatus === 'DEACTIVATED' ||
        matchedLocalEmp.accountStatus === 'DISABLED' ||
        matchedLocalEmp.status === 'Inactive' ||
        matchedLocalEmp.status === 'Terminated')
    ) {
      setIsLoading(false);
      authService.clearSession();
      setLoginError('Your account has been deactivated. Please contact HR or CEO for reactivation.');
      return;
    }

    try {
      const { user: userData } = await authService.login(cleanIdentifier, password);
      completeAuthenticatedSession(userData, password);
    } catch (error) {
      setIsLoading(false);
      authService.clearSession();
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    }
  };

  const handleRequestOtpLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);
    setResetSuccessMessage(null);

    if (otpChannel === 'EMAIL') {
      if (!otpEmail.trim()) {
        setLoginError('Please enter your registered email address.');
        return;
      }
      setIsLoading(true);
      try {
        const res = await authService.requestEmailOtpLogin(otpEmail.trim());
        setOtpInfoMessage(res.message);
        setOtpExpirySeconds(res.expiresInSeconds || 300);
        setOtpResendCooldown(res.resendCooldownSeconds || 60);
        setOtpDigits(['', '', '', '', '', '']);
        setIsLoading(false);
        setOtpStep('VERIFY_CODE');
        setTimeout(() => otpInputRefs.current[0]?.focus(), 120);
      } catch (err: any) {
        setIsLoading(false);
        setLoginError(err.message || 'Unable to send sign-in code.');
      }
    } else {
      if (!mobileOtpEnabled) {
        setLoginError(mobileOtpStatusMessage);
        return;
      }
      if (!otpMobile.trim()) {
        setLoginError('Please enter your verified mobile number.');
        return;
      }
      setIsLoading(true);
      try {
        const res = await authService.requestMobileOtpLogin(otpMobile.trim());
        setOtpInfoMessage(res.message);
        setOtpExpirySeconds(res.expiresInSeconds || 300);
        setOtpResendCooldown(res.resendCooldownSeconds || 60);
        setOtpDigits(['', '', '', '', '', '']);
        setIsLoading(false);
        setOtpStep('VERIFY_CODE');
        setTimeout(() => otpInputRefs.current[0]?.focus(), 120);
      } catch (err: any) {
        setIsLoading(false);
        setLoginError(err.message || 'Mobile OTP login is unavailable.');
      }
    }
  };

  const handleVerifyOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setLoginError('Please enter the complete 6-digit verification code.');
      return;
    }
    if (otpExpirySeconds <= 0) {
      setLoginError('Verification code has expired. Please request a new code.');
      return;
    }

    setLoginError(null);
    setIsLoading(true);
    try {
      const result =
        otpChannel === 'EMAIL'
          ? await authService.verifyEmailOtpLogin(otpEmail.trim(), code)
          : await authService.verifyMobileOtpLogin(otpMobile.trim(), code);
      completeAuthenticatedSession(result.user);
    } catch (err: any) {
      setIsLoading(false);
      authService.clearSession();
      setLoginError(err.message || 'Invalid or expired verification code.');
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    setLoginError(null);
    if (value.length > 1) {
      const cleanDigits = value.replace(/\D/g, '').slice(0, 6).split('');
      const next = ['', '', '', '', '', ''];
      cleanDigits.forEach((d, idx) => {
        if (idx < 6) next[idx] = d;
      });
      setOtpDigits(next);
      otpInputRefs.current[Math.min(cleanDigits.length, 5)]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, '');
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleForcePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError(null);

    if (!isNewPasswordCompliant) {
      setChangeError('Please ensure all password complexity requirements are fulfilled.');
      return;
    }

    if (!pendingEmployee) return;

    setIsChangingPassword(true);

    try {
      await authService.changePassword(currentTempPassword, newPassword, confirmPassword);

      // Update non-sensitive flag only (never write plaintext passwords to client storage or PostgREST)
      supabaseDirect
        .updateEmployee(pendingEmployee.id || pendingEmployee.employeeId, {
          must_change_password: false,
        })
        .catch(() => {});

      setIsChangingPassword(false);
      setShowForceChangeModal(false);

      switchRole(pendingRole);
      updateCurrentUser({
        name: `${pendingEmployee.firstName} ${pendingEmployee.lastName}`.trim(),
        email: pendingEmployee.email,
        role: pendingRole,
        employeeId: pendingEmployee.employeeId,
        department: pendingEmployee.department,
        designation: pendingEmployee.designation,
      });
      resetToDashboard?.();
      setActiveModule('dashboard');
      onLoginSuccess();
    } catch (error) {
      setIsChangingPassword(false);
      setChangeError(error instanceof Error ? error.message : 'Failed to update password. Please try again.');
    }
  };

  return (
    <div
      className="login-page-container"
      style={{
        minHeight: '100vh',
        width: '100%',
        maxWidth: '100%',
        display: 'flex',
        backgroundColor: '#FFFFFF',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'DM Sans', 'Plus Jakarta Sans', sans-serif",
        overflowX: 'hidden',
      }}
    >
      {/* LEFT PANEL: Businz Showcase */}
      <div
        className="login-showcase-panel"
        style={{
          flex: '1 1 50%',
          background: 'linear-gradient(150deg, #04091e 0%, #0a1738 45%, #08112d 100%)',
          padding: '50px 60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            left: '-10%',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(39, 211, 245, 0.22) 0%, rgba(0,0,0,0) 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Top Brand Logo Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', zIndex: 2 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              flexShrink: 0,
            }}
          >
            <img src="/logo.png" alt="Logo" style={{ width: '44px', height: '44px', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              Businz
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Enterprise HRMS
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ maxWidth: '480px', margin: 'auto 0', zIndex: 2, padding: '40px 0' }}>
          <h1
            style={{
              fontSize: '3rem',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              marginBottom: '28px',
            }}
          >
            Manage your
            <br />
            <span
              style={{
                background: 'linear-gradient(90deg, #0E7490 0%, #38bdf8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              workforce
            </span>
            <br />
            with precision.
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1', fontSize: '0.95rem' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(14, 116, 144, 0.2)',
                  border: '1px solid rgba(14, 116, 144, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38bdf8',
                }}
              >
                <Check size={14} />
              </div>
              <span>Live Biometric & Automated Attendance Sync</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1', fontSize: '0.95rem' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(14, 116, 144, 0.2)',
                  border: '1px solid rgba(14, 116, 144, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38bdf8',
                }}
              >
                <Check size={14} />
              </div>
              <span>Statutory Compliance, PF, ESI & TDS Ready</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1', fontSize: '0.95rem' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(14, 116, 144, 0.2)',
                  border: '1px solid rgba(14, 116, 144, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38bdf8',
                }}
              >
                <Check size={14} />
              </div>
              <span>Role-Based Dashboards & Real-time Analytics</span>
            </div>
          </div>
        </div>

        <div style={{ zIndex: 2, color: '#64748b', fontSize: '0.82rem' }}>
          &copy; {new Date().getFullYear()} Businz. All rights reserved.
        </div>
      </div>

      {/* RIGHT PANEL: Minimal Apple-Style Centered Authentication Form */}
      <div
        className="login-form-panel"
        style={{
          flex: '1 1 50%',
          backgroundColor: '#FFFFFF',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          boxSizing: 'border-box',
          overflowX: 'hidden',
        }}
      >
        <div style={{ maxWidth: '400px', width: '100%', boxSizing: 'border-box' }}>
          {/* Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <img src="/logo.png" alt="Logo" style={{ width: '38px', height: '38px', objectFit: 'contain' }} />
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Businz
            </span>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Sign In
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#64748b', margin: 0 }}>
              Access Businz HRMS using your password or a one-time verification code.
            </p>
          </div>

          {/* Apple-Style Segmented Mode Switcher: Password vs Login with OTP */}
          <div
            role="tablist"
            aria-label="Sign in method"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '4px',
              backgroundColor: '#F1F5F9',
              padding: '4px',
              borderRadius: '12px',
              marginBottom: '22px',
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'PASSWORD'}
              onClick={() => {
                setAuthMode('PASSWORD');
                setLoginError(null);
              }}
              style={{
                padding: '9px 12px',
                minHeight: '38px',
                borderRadius: '9px',
                border: 'none',
                backgroundColor: authMode === 'PASSWORD' ? '#FFFFFF' : 'transparent',
                color: authMode === 'PASSWORD' ? '#0F172A' : '#64748B',
                fontWeight: authMode === 'PASSWORD' ? 700 : 600,
                fontSize: '0.82rem',
                boxShadow: authMode === 'PASSWORD' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Password
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'OTP'}
              onClick={() => {
                setAuthMode('OTP');
                setOtpStep('ENTER_DESTINATION');
                setLoginError(null);
                setResetSuccessMessage(null);
              }}
              style={{
                padding: '9px 12px',
                minHeight: '38px',
                borderRadius: '9px',
                border: 'none',
                backgroundColor: authMode === 'OTP' ? '#FFFFFF' : 'transparent',
                color: authMode === 'OTP' ? '#0F172A' : '#64748B',
                fontWeight: authMode === 'OTP' ? 700 : 600,
                fontSize: '0.82rem',
                boxShadow: authMode === 'OTP' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Login with OTP
            </button>
          </div>

          {/* Error Alert Box */}
          {loginError && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px 14px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                color: '#991b1b',
                fontSize: '0.84rem',
                marginBottom: '18px',
                lineHeight: 1.45,
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{loginError}</span>
            </div>
          )}

          {/* Success Banner from Password Reset */}
          {resetSuccessMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                backgroundColor: '#DCFCE7',
                border: '1px solid #86EFAC',
                borderRadius: '12px',
                color: '#15803D',
                fontSize: '0.84rem',
                fontWeight: 600,
                marginBottom: '18px',
              }}
            >
              <CheckCircle2 size={18} color="#16A34A" style={{ flexShrink: 0 }} />
              <span>{resetSuccessMessage}</span>
            </div>
          )}

          {/* ================= MODE 1: STANDARD PASSWORD SIGN IN ================= */}
          {authMode === 'PASSWORD' && (
            <form onSubmit={handleSubmit} autoComplete="off">
              <input type="text" name="fake_user_field" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" autoComplete="off" />
              <input type="password" name="fake_pwd_field" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" autoComplete="new-password" />

              <div style={{ marginBottom: '16px' }}>
                <label
                  htmlFor="hrms-user-identifier"
                  style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}
                >
                  User ID / Email
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="hrms-user-identifier"
                    type="text"
                    name="hrms_user_identifier"
                    autoComplete="off"
                    readOnly={!isFormReady}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onFocus={(e) => {
                      setIsFormReady(true);
                      e.target.style.borderColor = '#0E7490';
                    }}
                    onClick={() => setIsFormReady(true)}
                    required
                    placeholder="name@businz.com or EMP-001"
                    style={{
                      width: '100%',
                      minHeight: '48px',
                      padding: '12px 14px 12px 40px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      fontSize: '0.9rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s ease',
                    }}
                    onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                  />
                  <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                </div>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label
                  htmlFor="hrms-user-password"
                  style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}
                >
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="hrms-user-password"
                    type={showPassword ? 'text' : 'password'}
                    name="hrms_user_secret"
                    autoComplete="new-password"
                    readOnly={!isFormReady}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={(e) => {
                      setIsFormReady(true);
                      e.target.style.borderColor = '#0E7490';
                    }}
                    onClick={() => setIsFormReady(true)}
                    required
                    placeholder="Enter your password"
                    style={{
                      width: '100%',
                      minHeight: '48px',
                      padding: '12px 40px 12px 40px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      fontSize: '0.9rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s ease',
                    }}
                    onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                  />
                  <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#94a3b8',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setLoginError(null);
                    setResetSuccessMessage(null);
                    setShowForgotModal(true);
                  }}
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#0E7490',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 0',
                  }}
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  minHeight: '48px',
                  padding: '13px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #0E7490, #0891b2)',
                  color: '#ffffff',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(14, 116, 144, 0.25)',
                }}
              >
                {isLoading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ================= MODE 2: OPTIONAL LOGIN WITH OTP ================= */}
          {authMode === 'OTP' && (
            <div>
              {/* Channel selector: Email OTP vs Mobile OTP */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setOtpChannel('EMAIL');
                    setOtpStep('ENTER_DESTINATION');
                    setLoginError(null);
                  }}
                  style={{
                    flex: 1,
                    minHeight: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: otpChannel === 'EMAIL' ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                    backgroundColor: otpChannel === 'EMAIL' ? '#ECFEFF' : '#F8FAFC',
                    color: otpChannel === 'EMAIL' ? '#0E7490' : '#475569',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <Mail size={15} />
                  <span>Email OTP</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpChannel('MOBILE');
                    setOtpStep('ENTER_DESTINATION');
                    setLoginError(null);
                  }}
                  style={{
                    flex: 1,
                    minHeight: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: otpChannel === 'MOBILE' ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                    backgroundColor: otpChannel === 'MOBILE' ? '#ECFEFF' : '#F8FAFC',
                    color: otpChannel === 'MOBILE' ? '#0E7490' : '#475569',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <Smartphone size={15} />
                  <span>Mobile OTP</span>
                </button>
              </div>

              {otpStep === 'ENTER_DESTINATION' ? (
                <form onSubmit={handleRequestOtpLogin} noValidate>
                  {otpChannel === 'EMAIL' ? (
                    <div style={{ marginBottom: '18px' }}>
                      <label
                        htmlFor="otp-login-email"
                        style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}
                      >
                        Registered Employee Email
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          id="otp-login-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          value={otpEmail}
                          onChange={(e) => {
                            setOtpEmail(e.target.value);
                            setLoginError(null);
                          }}
                          placeholder="employee@businz.com"
                          required
                          style={{
                            width: '100%',
                            minHeight: '48px',
                            padding: '12px 14px 12px 40px',
                            borderRadius: '12px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.9rem',
                            color: '#0f172a',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                        <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '8px', marginBottom: 0 }}>
                        Note: Privileged roles (CEO, HR, Accounts) require standard password authentication.
                      </p>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '18px' }}>
                      {!mobileOtpEnabled && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            padding: '12px 14px',
                            borderRadius: '12px',
                            backgroundColor: '#FFFBEB',
                            border: '1px solid #FDE68A',
                            color: '#92400E',
                            fontSize: '0.8rem',
                            lineHeight: 1.45,
                            marginBottom: '14px',
                          }}
                        >
                          <ShieldAlert size={17} style={{ flexShrink: 0, marginTop: '1px', color: '#D97706' }} />
                          <span>{mobileOtpStatusMessage}</span>
                        </div>
                      )}

                      <label
                        htmlFor="otp-login-mobile"
                        style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}
                      >
                        Verified Mobile Number (E.164 / +91)
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          id="otp-login-mobile"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          disabled={!mobileOtpEnabled}
                          value={otpMobile}
                          onChange={(e) => {
                            setOtpMobile(e.target.value);
                            setLoginError(null);
                          }}
                          placeholder="+91 98765 43210"
                          required
                          style={{
                            width: '100%',
                            minHeight: '48px',
                            padding: '12px 14px 12px 40px',
                            borderRadius: '12px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: mobileOtpEnabled ? '#FFFFFF' : '#F8FAFC',
                            fontSize: '0.9rem',
                            color: '#0f172a',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                        <Smartphone size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading || (otpChannel === 'MOBILE' && !mobileOtpEnabled)}
                    style={{
                      width: '100%',
                      minHeight: '48px',
                      padding: '13px',
                      borderRadius: '12px',
                      backgroundColor:
                        !isLoading && (otpChannel === 'EMAIL' || mobileOtpEnabled) ? '#0E7490' : '#CBD5E1',
                      color: '#FFFFFF',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: !isLoading && (otpChannel === 'EMAIL' || mobileOtpEnabled) ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    {isLoading ? (
                      <>
                        <RotateCw size={16} className="animate-spin" />
                        <span>Sending Verification Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Send One-Time Code</span>
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtpLogin} noValidate>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      color: '#334155',
                      fontSize: '0.82rem',
                      lineHeight: 1.45,
                      marginBottom: '16px',
                    }}
                  >
                    <Clock size={17} style={{ flexShrink: 0, marginTop: '2px', color: '#0E7490' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>Enter 6-Digit Code</span>
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            color: otpExpirySeconds <= 60 ? '#DC2626' : '#0E7490',
                            backgroundColor: otpExpirySeconds <= 60 ? '#FEE2E2' : '#ECFEFF',
                            padding: '2px 8px',
                            borderRadius: '999px',
                          }}
                        >
                          {formatTimer(otpExpirySeconds)}
                        </span>
                      </div>
                      <span>{otpInfoMessage}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                      gap: '8px',
                      marginBottom: '18px',
                    }}
                  >
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpInputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                        maxLength={idx === 0 ? 6 : 1}
                        aria-label={`Sign in OTP digit ${idx + 1}`}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        style={{
                          width: '100%',
                          height: '52px',
                          textAlign: 'center',
                          fontSize: '1.25rem',
                          fontWeight: 700,
                          borderRadius: '12px',
                          border: digit ? '2px solid #0E7490' : '1px solid #CBD5E1',
                          backgroundColor: digit ? '#F0FDFA' : '#F8FAFC',
                          color: '#0F172A',
                          outline: 'none',
                          boxSizing: 'border-box',
                          padding: 0,
                        }}
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || otpDigits.join('').length !== 6 || otpExpirySeconds <= 0}
                    style={{
                      width: '100%',
                      minHeight: '48px',
                      padding: '13px',
                      borderRadius: '12px',
                      backgroundColor:
                        otpDigits.join('').length === 6 && !isLoading && otpExpirySeconds > 0 ? '#0E7490' : '#CBD5E1',
                      color: '#FFFFFF',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor:
                        otpDigits.join('').length === 6 && !isLoading && otpExpirySeconds > 0 ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    {isLoading ? (
                      <>
                        <RotateCw size={16} className="animate-spin" />
                        <span>Verifying & Signing In...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & Sign In</span>
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep('ENTER_DESTINATION');
                        setLoginError(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748B',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <ArrowLeft size={14} /> Change {otpChannel === 'EMAIL' ? 'Email' : 'Number'}
                    </button>

                    <button
                      type="button"
                      disabled={otpResendCooldown > 0 || isLoading}
                      onClick={() => handleRequestOtpLogin()}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: otpResendCooldown > 0 ? '#94A3B8' : '#0E7490',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: otpResendCooldown > 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {otpResendCooldown > 0 ? `Resend in ${otpResendCooldown}s` : 'Resend Code'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          FIRST LOGIN FORCED PASSWORD CHANGE MODAL
          ========================================================================= */}
      {showForceChangeModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: '20px',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '32px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <KeyRound size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
                  First Login: Change Password Required
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
                  For security, you must replace your temporary password before accessing the dashboard.
                </p>
              </div>
            </div>

            {changeError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '10px',
                  color: '#B91C1C',
                  fontSize: '0.82rem',
                  marginBottom: '16px',
                }}
              >
                {changeError}
              </div>
            )}

            <form onSubmit={handleForcePasswordChangeSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Current Temporary Password
                </label>
                <input
                  type="text"
                  value={currentTempPassword}
                  onChange={(e) => setCurrentTempPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.88rem',
                    backgroundColor: '#F8FAFC',
                    color: '#334155',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  New Permanent Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="Enter new strong password"
                    style={{
                      width: '100%',
                      padding: '10px 38px 10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Confirm New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Confirm your new password"
                    style={{
                      width: '100%',
                      padding: '10px 38px 10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '12px',
                  padding: '14px',
                  marginBottom: '20px',
                  fontSize: '0.78rem',
                }}
              >
                <div style={{ fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  Password Complexity Standards:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: passwordChecks.minLength ? '#16A34A' : '#94A3B8' }}>
                    <Check size={13} strokeWidth={3} /> Minimum 10 characters
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: passwordChecks.hasUppercase ? '#16A34A' : '#94A3B8' }}>
                    <Check size={13} strokeWidth={3} /> At least 1 uppercase (A-Z)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: passwordChecks.hasLowercase ? '#16A34A' : '#94A3B8' }}>
                    <Check size={13} strokeWidth={3} /> At least 1 lowercase (a-z)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: passwordChecks.hasNumber ? '#16A34A' : '#94A3B8' }}>
                    <Check size={13} strokeWidth={3} /> At least 1 number (0-9)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: passwordChecks.hasSpecialChar ? '#16A34A' : '#94A3B8' }}>
                    <Check size={13} strokeWidth={3} /> Special character (@, #, $)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: passwordChecks.matchesConfirm ? '#16A34A' : '#94A3B8' }}>
                    <Check size={13} strokeWidth={3} /> Passwords match
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    authService.clearSession();
                    setShowForceChangeModal(false);
                    setPendingEmployee(null);
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '10px 18px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isNewPasswordCompliant || isChangingPassword}
                  className="btn btn-primary"
                  style={{
                    padding: '10px 22px',
                    fontSize: '0.85rem',
                    backgroundColor: isNewPasswordCompliant ? '#0E7490' : '#94A3B8',
                    borderColor: isNewPasswordCompliant ? '#0E7490' : '#94A3B8',
                    cursor: isNewPasswordCompliant ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isChangingPassword ? 'Updating Password...' : 'Save Password & Enter Dashboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Secure Forgot Password Lifecycle Modal */}
      <ForgotPasswordModal
        isOpen={showForgotModal}
        initialIdentifier={identifier}
        onClose={() => setShowForgotModal(false)}
        onSuccess={(resetIdentifier) => {
          setAuthMode('PASSWORD');
          setIdentifier(resetIdentifier);
          setPassword('');
          setLoginError(null);
          setResetSuccessMessage('Password reset successfully. Please sign in with your new password.');
        }}
      />
    </div>
  );
};
