import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { authService } from '../../services/authService';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (identifier: string) => void;
  initialIdentifier?: string;
}

type Step = 'REQUEST_OTP' | 'VERIFY_OTP' | 'RESET_PASSWORD' | 'SUCCESS';

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialIdentifier = '',
}) => {
  const [step, setStep] = useState<Step>('REQUEST_OTP');
  const [identifier, setIdentifier] = useState(initialIdentifier);

  // 6-digit OTP input boxes
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Password reset fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetToken, setResetToken] = useState('');

  // Status and timers
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [expiryCountdown, setExpiryCountdown] = useState(300); // 5 minutes (300 seconds)

  // Reset modal state on open
  useEffect(() => {
    if (isOpen) {
      setStep('REQUEST_OTP');
      setIdentifier(initialIdentifier || '');
      setOtpDigits(['', '', '', '', '', '']);
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      setErrorMessage(null);
      setInfoMessage(null);
      setResendCooldown(0);
      setExpiryCountdown(300);
    }
  }, [isOpen, initialIdentifier]);

  // Resend 60-second cooldown timer countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // 5-minute OTP expiry countdown
  useEffect(() => {
    if (step !== 'VERIFY_OTP' || expiryCountdown <= 0) return;
    const timer = setInterval(() => {
      setExpiryCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [step, expiryCountdown]);

  if (!isOpen) return null;

  const formatTimer = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Password complexity checks
  const passwordRules = {
    minLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasLowercase: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    hasSpecialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPassword),
    matchesConfirm: Boolean(newPassword && confirmPassword && newPassword === confirmPassword),
  };

  const isPasswordCompliant =
    passwordRules.minLength &&
    passwordRules.hasUppercase &&
    passwordRules.hasLowercase &&
    passwordRules.hasNumber &&
    passwordRules.hasSpecialChar &&
    passwordRules.matchesConfirm;

  // Step 1: Request OTP Submission
  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!identifier.trim()) {
      setErrorMessage('Please enter your registered email address or User ID.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await authService.forgotPassword(identifier.trim().toLowerCase());
      setInfoMessage(res.message);
      setOtpDigits(['', '', '', '', '', '']);
      setExpiryCountdown(res.expiresInSeconds || 300);
      setResendCooldown(res.resendCooldownSeconds || 60);
      setIsLoading(false);
      setStep('VERIFY_OTP');

      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 120);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Unable to process password reset request.');
    }
  };

  // Step 2: Handle OTP input box typing, autofill, and paste
  const handleOtpChange = (index: number, value: string) => {
    setErrorMessage(null);
    if (value.length > 1) {
      const cleanDigits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newDigits = ['', '', '', '', '', ''];
      cleanDigits.forEach((digit, idx) => {
        if (idx < 6) newDigits[idx] = digit;
      });
      setOtpDigits(newDigits);
      const nextIndex = Math.min(cleanDigits.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
      return;
    }

    const digit = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      e.preventDefault();
      const next = ['', '', '', '', '', ''];
      pasted.split('').forEach((d, idx) => {
        if (idx < 6) next[idx] = d;
      });
      setOtpDigits(next);
      otpInputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const enteredOtp = otpDigits.join('');
    if (enteredOtp.length !== 6) {
      setErrorMessage('Please enter the complete 6-digit verification code.');
      return;
    }
    if (expiryCountdown <= 0) {
      setErrorMessage('This verification code has expired. Please request a new code.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await authService.verifyResetOtp(identifier.trim(), enteredOtp);
      setResetToken(res.resetToken);
      setIsLoading(false);
      setErrorMessage(null);
      setStep('RESET_PASSWORD');
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Invalid or expired verification code.');
    }
  };

  // Step 3: Set New Password Submission
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordCompliant) {
      setErrorMessage('Please ensure your new password meets all security requirements.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      await authService.resetPassword(resetToken, newPassword, confirmPassword);
      setIsLoading(false);
      setStep('SUCCESS');
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Failed to save new password.');
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      <div
        className="modal-content"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 24px 48px -12px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06)',
          overflow: 'hidden',
          boxSizing: 'border-box',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'DM Sans', 'Plus Jakarta Sans', sans-serif",
        }}
      >
        {/* Minimal Apple-Style Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: '1px solid #F1F5F9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <KeyRound size={19} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
                {step === 'REQUEST_OTP' && 'Forgot Password'}
                {step === 'VERIFY_OTP' && 'OTP Verification'}
                {step === 'RESET_PASSWORD' && 'Set New Password'}
                {step === 'SUCCESS' && 'Password Changed Successfully'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                Businz Enterprise Security
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: '#F8FAFC',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', boxSizing: 'border-box' }}>
          {errorMessage && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: '#FEF2F2',
                color: '#B91C1C',
                border: '1px solid #FECACA',
                fontSize: '0.82rem',
                marginBottom: '18px',
                lineHeight: 1.45,
              }}
            >
              <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ================= STEP 1: ENTER EMAIL / USER ID ================= */}
          {step === 'REQUEST_OTP' && (
            <form onSubmit={handleRequestOtp} noValidate>
              <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: 1.55, marginTop: 0, marginBottom: '20px' }}>
                Enter your registered <strong>Email</strong> or <strong>User ID</strong>. We’ll send a single-use 6-digit verification code valid for 5 minutes.
              </p>

              <div style={{ marginBottom: '20px' }}>
                <label
                  htmlFor="forgot-password-identifier"
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    marginBottom: '8px',
                  }}
                >
                  Registered Email or User ID
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="forgot-password-identifier"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      setErrorMessage(null);
                    }}
                    placeholder="name@businz.com or EMP-001"
                    required
                    style={{
                      width: '100%',
                      minHeight: '48px',
                      padding: '12px 14px 12px 40px',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.92rem',
                      color: '#0F172A',
                      backgroundColor: '#F8FAFC',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.15s ease, background-color 0.15s ease',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#0E7490';
                      e.target.style.backgroundColor = '#FFFFFF';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E2E8F0';
                      e.target.style.backgroundColor = '#F8FAFC';
                    }}
                  />
                  <Mail
                    size={17}
                    style={{
                      position: 'absolute',
                      left: '14px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#94A3B8',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={isLoading || !identifier.trim()}
                  style={{
                    width: '100%',
                    minHeight: '48px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    backgroundColor: identifier.trim() && !isLoading ? '#0E7490' : '#CBD5E1',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.92rem',
                    cursor: identifier.trim() && !isLoading ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  {isLoading ? (
                    <>
                      <RotateCw size={16} className="animate-spin" />
                      <span>Sending Code...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Verification Code</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '10px',
                    borderRadius: '12px',
                    backgroundColor: 'transparent',
                    color: '#64748B',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <ArrowLeft size={14} /> Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* ================= STEP 2: OTP VERIFICATION ================= */}
          {step === 'VERIFY_OTP' && (
            <div>
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
                  lineHeight: 1.5,
                  marginBottom: '18px',
                }}
              >
                <Clock size={17} style={{ flexShrink: 0, marginTop: '2px', color: '#0E7490' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>Check Your Email</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: expiryCountdown <= 60 ? '#DC2626' : '#0E7490',
                        backgroundColor: expiryCountdown <= 60 ? '#FEE2E2' : '#ECFEFF',
                        padding: '2px 8px',
                        borderRadius: '999px',
                      }}
                    >
                      Expires in {formatTimer(expiryCountdown)}
                    </span>
                  </div>
                  <span>{infoMessage || 'If an active account matches your details, a 6-digit code has been sent.'}</span>
                </div>
              </div>

              <form onSubmit={handleVerifyOtp} noValidate>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    marginBottom: '10px',
                  }}
                >
                  6-Digit Verification Code
                </label>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                    gap: '8px',
                    marginBottom: '20px',
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
                      aria-label={`Verification digit ${idx + 1}`}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
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
                      onFocus={(e) => {
                        e.target.style.borderColor = '#0E7490';
                        e.target.style.backgroundColor = '#FFFFFF';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = digit ? '#0E7490' : '#CBD5E1';
                        e.target.style.backgroundColor = digit ? '#F0FDFA' : '#F8FAFC';
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button
                    type="submit"
                    disabled={isLoading || otpDigits.join('').length !== 6 || expiryCountdown <= 0}
                    style={{
                      width: '100%',
                      minHeight: '48px',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      backgroundColor:
                        otpDigits.join('').length === 6 && !isLoading && expiryCountdown > 0 ? '#0E7490' : '#CBD5E1',
                      color: '#FFFFFF',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: '0.92rem',
                      cursor:
                        otpDigits.join('').length === 6 && !isLoading && expiryCountdown > 0 ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    {isLoading ? (
                      <>
                        <RotateCw size={16} className="animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify Code</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('REQUEST_OTP');
                        setErrorMessage(null);
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
                        minHeight: '36px',
                        padding: '4px 6px',
                      }}
                    >
                      <ArrowLeft size={14} /> Change Email / ID
                    </button>

                    <button
                      type="button"
                      disabled={resendCooldown > 0 || isLoading}
                      onClick={() => handleRequestOtp()}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: resendCooldown > 0 ? '#94A3B8' : '#0E7490',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                        minHeight: '36px',
                        padding: '4px 6px',
                      }}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* ================= STEP 3: SET NEW PASSWORD ================= */}
          {step === 'RESET_PASSWORD' && (
            <form onSubmit={handleResetPassword} noValidate>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#166534',
                  fontSize: '0.82rem',
                  marginBottom: '18px',
                }}
              >
                <ShieldCheck size={17} color="#16A34A" style={{ flexShrink: 0 }} />
                <span>Identity verified. Set a strong new password for your account.</span>
              </div>

              {/* New Password */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="reset-new-password"
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    marginBottom: '6px',
                  }}
                >
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setErrorMessage(null);
                    }}
                    placeholder="Enter new password"
                    required
                    style={{
                      width: '100%',
                      minHeight: '48px',
                      padding: '12px 40px 12px 38px',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.9rem',
                      color: '#0F172A',
                      backgroundColor: '#F8FAFC',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#0E7490';
                      e.target.style.backgroundColor = '#FFFFFF';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E2E8F0';
                      e.target.style.backgroundColor = '#F8FAFC';
                    }}
                  />
                  <Lock
                    size={16}
                    style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94A3B8',
                      cursor: 'pointer',
                      padding: '6px',
                    }}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  htmlFor="reset-confirm-password"
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    marginBottom: '6px',
                  }}
                >
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setErrorMessage(null);
                    }}
                    placeholder="Confirm new password"
                    required
                    style={{
                      width: '100%',
                      minHeight: '48px',
                      padding: '12px 40px 12px 38px',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.9rem',
                      color: '#0F172A',
                      backgroundColor: '#F8FAFC',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#0E7490';
                      e.target.style.backgroundColor = '#FFFFFF';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E2E8F0';
                      e.target.style.backgroundColor = '#F8FAFC';
                    }}
                  />
                  <Lock
                    size={16}
                    style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94A3B8',
                      cursor: 'pointer',
                      padding: '6px',
                    }}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Password Rules Checklist */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  border: '1px solid #E2E8F0',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  PASSWORD REQUIREMENTS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: passwordRules.minLength ? '#16A34A' : '#64748B' }}>
                    <CheckCircle2 size={13} color={passwordRules.minLength ? '#16A34A' : '#CBD5E1'} />
                    <span>8+ characters</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: passwordRules.hasUppercase ? '#16A34A' : '#64748B' }}>
                    <CheckCircle2 size={13} color={passwordRules.hasUppercase ? '#16A34A' : '#CBD5E1'} />
                    <span>Uppercase (A–Z)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: passwordRules.hasLowercase ? '#16A34A' : '#64748B' }}>
                    <CheckCircle2 size={13} color={passwordRules.hasLowercase ? '#16A34A' : '#CBD5E1'} />
                    <span>Lowercase (a–z)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: passwordRules.hasNumber ? '#16A34A' : '#64748B' }}>
                    <CheckCircle2 size={13} color={passwordRules.hasNumber ? '#16A34A' : '#CBD5E1'} />
                    <span>Number (0–9)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: passwordRules.hasSpecialChar ? '#16A34A' : '#64748B' }}>
                    <CheckCircle2 size={13} color={passwordRules.hasSpecialChar ? '#16A34A' : '#CBD5E1'} />
                    <span>Symbol (@, #, !)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: passwordRules.matchesConfirm ? '#16A34A' : '#64748B' }}>
                    <CheckCircle2 size={13} color={passwordRules.matchesConfirm ? '#16A34A' : '#CBD5E1'} />
                    <span>Passwords match</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!isPasswordCompliant || isLoading}
                style={{
                  width: '100%',
                  minHeight: '48px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  backgroundColor: isPasswordCompliant && !isLoading ? '#0E7490' : '#CBD5E1',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.92rem',
                  cursor: isPasswordCompliant && !isLoading ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {isLoading ? (
                  <>
                    <RotateCw size={16} className="animate-spin" />
                    <span>Saving Password...</span>
                  </>
                ) : (
                  <span>Save Password</span>
                )}
              </button>
            </form>
          )}

          {/* ================= STEP 4: PASSWORD CHANGED SUCCESSFULLY ================= */}
          {step === 'SUCCESS' && (
            <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  backgroundColor: '#DCFCE7',
                  color: '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <CheckCircle2 size={32} />
              </div>

              <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 700, color: '#0F172A' }}>
                Password Changed Successfully
              </h3>

              <p style={{ margin: '0 0 22px', fontSize: '0.86rem', color: '#64748B', lineHeight: 1.55 }}>
                Your new password has been saved and all previous active sessions have been signed out. You can now sign in with your new password.
              </p>

              <button
                type="button"
                onClick={() => {
                  onSuccess(identifier.trim());
                  onClose();
                }}
                style={{
                  width: '100%',
                  minHeight: '48px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span>Continue to Sign In</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
