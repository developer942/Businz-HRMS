import React, { useState, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { Employee, Role } from '../../types/hrms';
import { authService, toAppUser } from '../../services/authService';
import { 
  Building2, 
  CheckCircle2, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  Mail, 
  Lock, 
  Shield, 
  X, 
  Check,
  UserCheck,
  AlertCircle,
  KeyRound,
  ShieldCheck
} from 'lucide-react';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { supabaseDirect } from '../../services/supabaseDirectService';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { switchRole, updateCurrentUser, employees, setActiveModule, resetToDashboard, changeEmployeePassword } = useHRMS();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isFormReady, setIsFormReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Prevent browser credential manager from auto-populating inputs on page load
  useEffect(() => {
    setIdentifier('');
    setPassword('');
    const timer = setTimeout(() => {
      setIsFormReady(true);
      setIdentifier('');
      setPassword('');
    }, 150);
    return () => clearTimeout(timer);
  }, []);

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

  // Password Complexity Validation Helpers
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoading(true);

    const cleanIdentifier = identifier.trim().toLowerCase();

    // Pre-check: If employee is deactivated in system state, block login immediately
    const matchedLocalEmp = employees?.find(emp => 
      emp.employeeId?.toLowerCase() === cleanIdentifier || 
      emp.email?.toLowerCase() === cleanIdentifier || 
      emp.id?.toLowerCase() === cleanIdentifier
    );
    if (matchedLocalEmp && (
      matchedLocalEmp.accountStatus === 'DEACTIVATED' || 
      matchedLocalEmp.accountStatus === 'DISABLED' || 
      matchedLocalEmp.status === 'Inactive' || 
      matchedLocalEmp.status === 'Terminated'
    )) {
      setIsLoading(false);
      authService.clearSession();
      setLoginError('Your account has been deactivated. Please contact HR or CEO for reactivation.');
      return;
    }

    try {
      const { user: userData } = await authService.login(cleanIdentifier, password);

      if ((userData as any).accountStatus === 'DEACTIVATED' || (userData as any).accountStatus === 'DISABLED') {
        setIsLoading(false);
        authService.clearSession();
        setLoginError('Your account has been deactivated. Please contact HR or CEO for reactivation.');
        return;
      }

      if (userData.mustChangePassword) {
        setIsLoading(false);
        setPendingRole(toAppUser(userData).role);
        setPendingEmployee({
          id: userData.employeeId || cleanIdentifier,
          employeeId: userData.employeeId || cleanIdentifier,
          firstName: userData.name?.split(' ')[0] || 'Employee',
          lastName: userData.name?.split(' ')[1] || '',
          email: userData.email || cleanIdentifier,
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
        setCurrentTempPassword(password);
        setShowForceChangeModal(true);
        return;
      }

      const appUser = toAppUser(userData);
      switchRole(appUser.role);
      updateCurrentUser(appUser);
      // Primary Rule: Software MUST start from dashboard upon logging in
      resetToDashboard?.();
      setActiveModule('dashboard');
      setIsLoading(false);
      onLoginSuccess();
    } catch (error) {
      setIsLoading(false);
      authService.clearSession();
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
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

      // 1. Update in HRMSContext local state
      const empIdentifier = pendingEmployee.employeeId || pendingEmployee.id || pendingEmployee.email;
      changeEmployeePassword(empIdentifier, newPassword);

      // 2. Direct VPS Postgres update
      supabaseDirect.updateEmployee(pendingEmployee.id || pendingEmployee.employeeId, {
        password: newPassword,
        must_change_password: false,
      }).catch(err => console.warn('[LoginPage] updateEmployee direct sync warning:', err));

      // 3. Persist to company_settings employee_profiles_data
      try {
        const empKey = pendingEmployee.employeeId || pendingEmployee.id;
        const currentProfiles = await supabaseDirect.getCompanySetting('employee_profiles_data');
        const profiles = currentProfiles && typeof currentProfiles === 'object' && !Array.isArray(currentProfiles) ? currentProfiles : {};
        if (empKey) {
          profiles[empKey] = {
            ...(profiles[empKey] || {}),
            password: newPassword,
            mustChangePassword: false,
            updatedAt: new Date().toISOString()
          };
        }
        if (pendingEmployee.id && pendingEmployee.id !== empKey) {
          profiles[pendingEmployee.id] = {
            ...(profiles[pendingEmployee.id] || {}),
            password: newPassword,
            mustChangePassword: false,
            updatedAt: new Date().toISOString()
          };
        }
        await supabaseDirect.saveCompanySetting('employee_profiles_data', profiles);
      } catch (err) {
        console.warn('[LoginPage] company_settings sync notice:', err);
      }

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
      // Primary Rule: Software MUST start from dashboard upon logging in
      resetToDashboard?.();
      setActiveModule('dashboard');
      onLoginSuccess();
    } catch (error) {
      setIsChangingPassword(false);
      setChangeError(error instanceof Error ? error.message : 'Failed to update password. Please try again.');
    }
  };

  return (
    <div className="login-page-container" style={{
      minHeight: '100vh',
      width: '100%',
      maxWidth: '100%',
      display: 'flex',
      backgroundColor: '#ffffff',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      overflowX: 'hidden'
    }}>
      
      {/* LEFT PANEL: Dark Indigo Showcase */}
      <div className="login-showcase-panel" style={{
        flex: '1 1 50%',
        background: 'linear-gradient(150deg, #04091e 0%, #0a1738 45%, #08112d 100%)',
        padding: '50px 60px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: '-10%',
          left: '-10%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(39, 211, 245, 0.22) 0%, rgba(0,0,0,0) 70%)',
          pointerEvents: 'none'
        }} />

        {/* Top Brand Logo Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', zIndex: 2 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px',
            flexShrink: 0
          }}>
            <img 
              src="/logo.png" 
              alt="Logo" 
              style={{ width: '44px', height: '44px', objectFit: 'contain' }} 
            />
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
          <h1 style={{
            fontSize: '3rem',
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            marginBottom: '28px'
          }}>
            Manage your<br />
            <span style={{
              background: 'linear-gradient(90deg, #0E7490 0%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              workforce
            </span><br />
            with precision.
          </h1>

          {/* Feature Bullet List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1', fontSize: '0.95rem' }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'rgba(14, 116, 144, 0.2)',
                border: '1px solid rgba(14, 116, 144, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}>
                <Check size={14} />
              </div>
              <span>Live Biometric & Automated Attendance Sync</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1', fontSize: '0.95rem' }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'rgba(14, 116, 144, 0.2)',
                border: '1px solid rgba(14, 116, 144, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}>
                <Check size={14} />
              </div>
              <span>Statutory Compliance, PF, ESI & TDS Ready</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1', fontSize: '0.95rem' }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'rgba(14, 116, 144, 0.2)',
                border: '1px solid rgba(14, 116, 144, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}>
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

      {/* RIGHT PANEL: Clean Form Section */}
      <div className="login-form-panel" style={{
        flex: '1 1 50%',
        backgroundColor: '#ffffff',
        padding: '60px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        boxSizing: 'border-box'
      }}>
        <div style={{ maxWidth: '400px', width: '100%' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <img 
              src="/logo.png" 
              alt="Logo" 
              style={{ width: '38px', height: '38px', objectFit: 'contain' }} 
            />
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Businz
            </span>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', marginBottom: '6px', letterSpacing: '-0.02em' }}>
              Sign In
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
              Access Businz HRMS using your User ID or Email.
            </p>
          </div>

          {/* Error Alert Box */}
          {loginError && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              color: '#991b1b',
              fontSize: '0.84rem',
              marginBottom: '20px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{loginError}</span>
            </div>
          )}

          {/* Success Banner from Password Reset */}
          {resetSuccessMessage && (
            <div style={{
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
              marginBottom: '20px'
            }}>
              <CheckCircle2 size={18} color="#16A34A" style={{ flexShrink: 0 }} />
              <span>{resetSuccessMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} autoComplete="off">
            {/* Hidden dummy inputs to suppress browser password manager autofill */}
            <input type="text" name="fake_user_field" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" autoComplete="off" />
            <input type="password" name="fake_pwd_field" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" autoComplete="new-password" />
            
            {/* Field 1: User ID / Email (Accepts Employee Code or Email) */}
            <div style={{ marginBottom: '18px' }}>
              <label htmlFor="hrms-user-identifier" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
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
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 38px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    fontSize: '0.9rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}
                  onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                />
                <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              </div>
            </div>

            {/* Field 2: Password */}
            <div style={{ marginBottom: '6px' }}>
              <label htmlFor="hrms-user-password" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
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
                  style={{
                    width: '100%',
                    padding: '12px 38px 12px 38px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    fontSize: '0.9rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}
                  onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
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
                    padding: '4px'
                  }}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* 1. "Forgot Password?" link below the password field */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '22px' }}>
              <button
                type="button"
                onClick={() => {
                  setLoginError(null);
                  setResetSuccessMessage(null);
                  setShowForgotModal(true);
                }}
                style={{
                  fontSize: '0.80rem',
                  fontWeight: 600,
                  color: '#0E7490',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 0'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0891B2')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#0E7490')}
              >
                Forgot Password?
              </button>
            </div>


            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
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
                boxShadow: '0 4px 14px rgba(14, 116, 144, 0.35)',
                transition: 'all 0.2s ease'
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

        </div>
      </div>

      {/* =========================================================================
          FIRST LOGIN FORCED PASSWORD CHANGE MODAL
          ========================================================================= */}
      {showForceChangeModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '20px'
        }}>
          <div style={{
            maxWidth: '520px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            padding: '32px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            position: 'relative'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
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
              <div style={{
                padding: '10px 14px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '10px',
                color: '#B91C1C',
                fontSize: '0.82rem',
                marginBottom: '16px'
              }}>
                {changeError}
              </div>
            )}

            <form onSubmit={handleForcePasswordChangeSubmit}>
              {/* Current Temporary Password */}
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
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* New Password */}
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
                      boxSizing: 'border-box'
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

              {/* Confirm New Password */}
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
                      boxSizing: 'border-box'
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

              {/* Password Requirement Checklist */}
              <div style={{
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '20px',
                fontSize: '0.78rem'
              }}>
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

              {/* Action Buttons */}
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
                    cursor: isNewPasswordCompliant ? 'pointer' : 'not-allowed'
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
          setIdentifier(resetIdentifier);
          setPassword('');
          setLoginError(null);
          setResetSuccessMessage('Password reset successfully. Please login with your new password.');
        }}
      />

    </div>
  );
};
