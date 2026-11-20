import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import { authRepository, isPrivilegedRole } from '../repositories/authRepository.js';
import { auditRepository } from '../repositories/auditRepository.js';
import { passwordResetRepository } from '../repositories/passwordResetRepository.js';
import { REFRESH_COOKIE_NAME, refreshSessionRepository } from '../repositories/refreshSessionRepository.js';
import { env } from '../config/env.js';
import {
  sendPasswordResetOtpEmail,
  sendEmailLoginOtpEmail,
  sendPasswordChangedNotificationEmail,
} from '../services/emailService.js';
import { smsOtpService, normalizeMobileToE164 } from '../services/smsOtpService.js';
import {
  changePasswordSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
  emailOtpLoginRequestSchema,
  emailOtpLoginVerifySchema,
  mobileOtpLoginRequestSchema,
  mobileOtpLoginVerifySchema,
} from '../validators/authValidators.js';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // Strictly 5 minutes (300 seconds)
const OTP_EXPIRY_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_REQUESTS_PER_WINDOW = 3;
const OTP_RATE_WINDOW_MINUTES = 15;

function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

function getIncomingRefreshToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const fromCookie = cookies[REFRESH_COOKIE_NAME];
  if (fromCookie && fromCookie.trim()) return fromCookie.trim();
  const fromBody = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
  return fromBody || null;
}

function setRefreshCookie(res: Response, refreshToken: string, expiresAt: Date): void {
  const isProd = env.NODE_ENV === 'production';
  const maxAgeSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const segments = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (isProd) segments.push('Secure');
  res.setHeader('Set-Cookie', segments.join('; '));
}

function clearRefreshCookie(res: Response): void {
  const isProd = env.NODE_ENV === 'production';
  const segments = [
    `${REFRESH_COOKIE_NAME}=`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (isProd) segments.push('Secure');
  res.setHeader('Set-Cookie', segments.join('; '));
}

function buildSessionUserPayload(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId,
    department: user.department,
    designation: user.designation,
    company_id: user.company_id || 'company-a',
    mustChangePassword: user.mustChangePassword,
    accountStatus: user.accountStatus,
    credentialEmailStatus: user.credentialEmailStatus,
    credentialEmailSentAt: user.credentialEmailSentAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = loginSchema.parse(req.body);
    const identifier = ('identifier' in validated ? validated.identifier : validated.email).trim();

    const user = await authRepository.findByIdentifier(identifier);
    if (!user) {
      await auditRepository.recordLog('LOGIN_FAILED', identifier, 'Anonymous', {
        reason: 'User account not found',
      });

      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          details: [],
        },
      });
      return;
    }

    // Check account active / deactivated / disabled status
    if (user.accountStatus === 'DEACTIVATED' || user.accountStatus === 'DISABLED' || !user.isActive) {
      await auditRepository.recordLog('LOGIN_FAILED', user.employeeId, user.email, {
        reason: `Account ${user.accountStatus.toLowerCase()}`,
      });

      const errorCode = user.accountStatus === 'DISABLED' ? 'ACCOUNT_DISABLED' : 'ACCOUNT_DEACTIVATED';
      res.status(403).json({
        success: false,
        error: {
          code: errorCode,
          message: 'Your account has been deactivated. Please contact HR or CEO for reactivation.',
          details: [],
        },
      });
      return;
    }

    const isMatch = await authRepository.verifyPassword(
      validated.password,
      user.passwordHash,
      user.plainPassword,
      user.additionalPlainPasswords
    );
    if (!isMatch) {
      await auditRepository.recordLog('LOGIN_FAILED', user.employeeId, user.email, {
        reason: 'Invalid password',
      });

      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          details: [],
        },
      });
      return;
    }

    // Record last login and generate access + rotating refresh token
    await authRepository.recordLoginSuccess(user);
    const token = authRepository.generateToken(user, 'password');
    const refreshSession = await refreshSessionRepository.createSession({
      userId: user.id,
      employeeCode: user.employeeId || user.email,
      authMethod: 'password',
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    setRefreshCookie(res, refreshSession.refreshToken, refreshSession.expiresAt);

    res.status(200).json({
      success: true,
      data: {
        accessToken: token,
        refreshToken: refreshSession.refreshToken,
        user: buildSessionUserPayload(user),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          details: [],
        },
      });
      return;
    }

    const validated = changePasswordSchema.parse(req.body);
    const result = await authRepository.changePassword(
      req.user.email || req.user.employeeId || '',
      validated.currentPassword,
      validated.newPassword,
      req.user.email
    );

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'PASSWORD_CHANGE_FAILED',
          message: result.message || 'Failed to update password',
          details: [],
        },
      });
      return;
    }

    const updatedUser = await authRepository.findByIdentifier(req.user.employeeId || req.user.email);
    if (!updatedUser) {
      res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_REFRESH_FAILED',
          message: 'Password changed. Please sign in again.',
          details: [],
        },
      });
      return;
    }

    // Dispatch password-change notification email asynchronously using existing SMTP service
    if (updatedUser.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updatedUser.email)) {
      void sendPasswordChangedNotificationEmail({
        to: updatedUser.email,
        employeeName: updatedUser.name,
        employeeCode: updatedUser.employeeId,
        companyId: updatedUser.company_id,
      }).catch(() => {});
    }

    const accessToken = authRepository.generateToken(updatedUser, 'password');
    const refreshSession = await refreshSessionRepository.createSession({
      userId: updatedUser.id,
      employeeCode: updatedUser.employeeId || updatedUser.email,
      authMethod: 'password',
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    setRefreshCookie(res, refreshSession.refreshToken, refreshSession.expiresAt);

    res.status(200).json({
      success: true,
      message: 'Password updated successfully. You may now access the full dashboard.',
      data: { accessToken, refreshToken: refreshSession.refreshToken },
    });
  } catch (err) {
    next(err);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          details: [],
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: req.user,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Rotates a valid refresh token (from HttpOnly cookie or request body) into a fresh
 * short-lived access JWT while safely tolerating simultaneous multi-tab refresh races.
 */
export const refreshSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const incomingToken = getIncomingRefreshToken(req);
    if (!incomingToken) {
      res.status(401).json({
        success: false,
        error: {
          code: 'REFRESH_TOKEN_MISSING',
          message: 'Your session has expired. Please sign in again.',
          details: [],
        },
      });
      return;
    }

    let rotated;
    try {
      rotated = await refreshSessionRepository.rotateSession(incomingToken, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
    } catch (dbErr) {
      console.error('[authController.refreshSession] Transient DB error:', dbErr instanceof Error ? dbErr.message : dbErr);
      res.status(503).json({
        success: false,
        error: {
          code: 'AUTH_SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'Unable to refresh session right now. Please retry shortly.',
          details: [],
        },
      });
      return;
    }

    if (rotated.status !== 'ROTATED' && rotated.status !== 'GRACE_REUSED' || !rotated.session) {
      clearRefreshCookie(res);
      const code =
        rotated.status === 'EXPIRED'
          ? 'REFRESH_TOKEN_EXPIRED'
          : rotated.status === 'REPLAY_DETECTED'
            ? 'HRMS_TOKEN_REVOKED'
            : 'REFRESH_TOKEN_INVALID';
      res.status(401).json({
        success: false,
        error: {
          code,
          message: 'Your session has expired or was signed out. Please sign in again.',
          details: [],
        },
      });
      return;
    }

    let user;
    try {
      user = await authRepository.findByIdentifier(rotated.session.employeeCode);
    } catch (dbErr) {
      console.error('[authController.refreshSession] Transient user lookup error:', dbErr instanceof Error ? dbErr.message : dbErr);
      res.status(503).json({
        success: false,
        error: {
          code: 'AUTH_SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'Unable to verify account right now. Please retry shortly.',
          details: [],
        },
      });
      return;
    }

    if (!user || !user.isActive || user.accountStatus === 'DEACTIVATED' || user.accountStatus === 'DISABLED') {
      await refreshSessionRepository.revokeAllForUser(rotated.session.employeeCode);
      clearRefreshCookie(res);
      res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Your account is unavailable or has been deactivated. Please contact HR.',
          details: [],
        },
      });
      return;
    }

    const accessToken = authRepository.generateToken(user, rotated.session.authMethod || 'password');
    if (rotated.status === 'ROTATED' && rotated.newRefreshToken && rotated.newExpiresAt) {
      setRefreshCookie(res, rotated.newRefreshToken, rotated.newExpiresAt);
    }

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        ...(rotated.status === 'ROTATED' && rotated.newRefreshToken ? { refreshToken: rotated.newRefreshToken } : {}),
        user: buildSessionUserPayload(user),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Explicit user logout: revokes server-side refresh session family and clears HttpOnly cookie.
 */
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const incomingToken = getIncomingRefreshToken(req);
    if (incomingToken) {
      await refreshSessionRepository.revokeByRawToken(incomingToken);
    }
    if (req.user?.employeeId) {
      await auditRepository.recordLog('LOGOUT', req.user.employeeId, req.user.email, { ip: req.ip }).catch(() => {});
    }
    clearRefreshCookie(res);
    res.status(200).json({
      success: true,
      message: 'Signed out cleanly.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * REQUIREMENT 1: Initiates the Forgot Password flow.
 * - Generates single-use 6-digit OTP using crypto.randomInt
 * - Hashes OTP with bcrypt (never stores or logs plaintext OTP)
 * - 5-minute expiry
 * - Invalidates previous unused OTPs on resend
 * - Enforces request rate limits
 * - Returns generic response for unknown accounts to prevent enumeration
 * - Never exposes raw OTP in the HTTP response
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = forgotPasswordSchema.parse(req.body);
    const identifier = validated.email_or_employee_id.trim();

    // Generic message to prevent account enumeration
    const genericSuccessMessage =
      'If an active account matches your details, a verification code has been sent to the registered email address.';

    const user = await authRepository.findByIdentifier(identifier);
    if (!user || user.accountStatus === 'DEACTIVATED' || user.accountStatus === 'DISABLED' || !user.isActive) {
      await auditRepository.recordLog('FORGOT_PASSWORD_ATTEMPT', identifier, 'Anonymous', {
        reason: 'User not found or deactivated',
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        message: genericSuccessMessage,
        data: {
          expiresInSeconds: OTP_EXPIRY_SECONDS,
          resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
        },
      });
      return;
    }

    // Check rate limit: Max 3 requests within 15 minutes
    const recentCount = await passwordResetRepository.countRecentRequests(
      user.employeeId,
      OTP_RATE_WINDOW_MINUTES,
      'password_reset'
    );
    if (recentCount >= MAX_OTP_REQUESTS_PER_WINDOW) {
      await auditRepository.recordLog('FORGOT_PASSWORD_RATE_LIMITED', user.employeeId, user.email || 'unknown', {
        recentCount,
        ip: req.ip,
      });

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many OTP requests. Please wait 15 minutes before requesting another verification code.',
        },
      });
      return;
    }

    // Check if employee has a valid registered email address
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!user.email || !emailRegex.test(user.email.trim())) {
      await auditRepository.recordLog('FORGOT_PASSWORD_NO_EMAIL', user.employeeId, 'System', {
        reason: 'No valid registered email address',
      });

      res.status(400).json({
        success: false,
        error: {
          code: 'NO_REGISTERED_EMAIL',
          message: 'No registered email address is linked to this employee account. Please contact HR.',
        },
      });
      return;
    }

    // Generate cryptographically secure 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS); // 5 minutes

    // Store in password_resets table (automatically invalidates prior active OTPs for this employee)
    const createdReset = await passwordResetRepository.createResetRecord({
      employeeId: user.employeeId,
      otpHash,
      expiresAt,
      purpose: 'password_reset',
    });

    // Dispatch email via existing configured SMTP service
    const emailResult = await sendPasswordResetOtpEmail({
      to: user.email,
      employeeName: user.name,
      employeeCode: user.employeeId,
      otp: rawOtp,
      companyId: user.company_id,
      purpose: 'PASSWORD_RESET',
    });

    if (emailResult.status === 'FAILED') {
      await passwordResetRepository.rollbackFailedDispatch(createdReset.id);
      await auditRepository.recordLog('FORGOT_PASSWORD_ATTEMPT', user.employeeId, user.email, {
        reason: 'SMTP delivery failed',
        ip: req.ip,
      });

      res.status(503).json({
        success: false,
        error: {
          code: 'SMTP_DELIVERY_FAILED',
          message: 'Unable to send verification email at this time. Please try again shortly or contact HR.',
        },
      });
      return;
    }

    await auditRepository.recordLog('PASSWORD_RESET_OTP_SENT', user.employeeId, user.email, {
      expiresAt: expiresAt.toISOString(),
      ip: req.ip,
    });

    res.status(200).json({
      success: true,
      message: genericSuccessMessage,
      data: {
        expiresInSeconds: OTP_EXPIRY_SECONDS,
        resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Verifies the 6-digit password reset OTP.
 * Validates attempt count (< 5) and expiration (5 minutes).
 * On success, marks OTP used and issues a single-use 10-minute reset authorization token.
 */
export const verifyResetOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = verifyResetOtpSchema.parse(req.body);
    const identifier = validated.email_or_employee_id.trim();
    const otp = validated.otp.trim();

    const user = await authRepository.findByIdentifier(identifier);
    if (!user || !user.isActive || user.accountStatus === 'DEACTIVATED' || user.accountStatus === 'DISABLED') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
        },
      });
      return;
    }

    const resetRecord = await passwordResetRepository.getLatestActiveReset(user.employeeId, 'password_reset');
    if (!resetRecord) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
        },
      });
      return;
    }

    // Check expiry (5 minutes)
    if (new Date() > resetRecord.expiresAt) {
      await passwordResetRepository.markAsUsed(resetRecord.id);
      res.status(400).json({
        success: false,
        error: {
          code: 'OTP_EXPIRED',
          message: 'Verification code has expired. Please request a new code.',
        },
      });
      return;
    }

    // Check attempt limit (max 5)
    if (resetRecord.attemptCount >= MAX_OTP_ATTEMPTS) {
      await passwordResetRepository.markAsUsed(resetRecord.id);
      res.status(400).json({
        success: false,
        error: {
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: 'Maximum verification attempts exceeded. Please request a new code.',
        },
      });
      return;
    }

    // Compare OTP hash using bcrypt
    const isMatch = await bcrypt.compare(otp, resetRecord.otpHash);
    if (!isMatch) {
      const attempts = await passwordResetRepository.incrementAttempt(resetRecord.id);
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await passwordResetRepository.markAsUsed(resetRecord.id);
      }
      await auditRepository.recordLog('PASSWORD_RESET_OTP_FAILED', user.employeeId, user.email, {
        attempt: attempts,
        ip: req.ip,
      });

      res.status(400).json({
        success: false,
        error: {
          code: attempts >= MAX_OTP_ATTEMPTS ? 'MAX_ATTEMPTS_EXCEEDED' : 'INVALID_OTP',
          message:
            attempts >= MAX_OTP_ATTEMPTS
              ? 'Maximum verification attempts exceeded. Please request a new code.'
              : 'Invalid or expired verification code.',
          remainingAttempts: Math.max(0, MAX_OTP_ATTEMPTS - attempts),
        },
      });
      return;
    }

    // Atomically mark OTP used to prevent replay attacks
    const wasMarked = await passwordResetRepository.markAsUsed(resetRecord.id);
    if (!wasMarked) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'This verification code has already been used.',
        },
      });
      return;
    }

    const resetToken = passwordResetRepository.generateResetToken(
      user.employeeId,
      user.email,
      resetRecord.id
    );

    await auditRepository.recordLog('PASSWORD_RESET_OTP_VERIFIED', user.employeeId, user.email, {
      ip: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Verification code verified successfully. You may now set a new password.',
      data: {
        resetToken,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Resets employee password using the single-use verified reset_token.
 * - Hashes password with bcrypt (cost 12)
 * - Consumes reset_token so it cannot be replayed
 * - Increments tokenVersion to revoke existing sessions
 * - Sends password-change notification email via existing SMTP service
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = resetPasswordSchema.parse(req.body);
    const { reset_token, new_password } = validated;

    const tokenPayload = passwordResetRepository.verifyResetToken(reset_token);
    if (!tokenPayload) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_RESET_TOKEN',
          message: 'Your password reset authorization has expired or was already used. Please request a new verification code.',
        },
      });
      return;
    }

    const user = await authRepository.findByIdentifier(tokenPayload.employeeId);
    if (!user || !user.isActive || user.accountStatus === 'DEACTIVATED' || user.accountStatus === 'DISABLED') {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Active employee account not found.',
        },
      });
      return;
    }

    // Consume single-use reset authorization token
    const consumed = passwordResetRepository.consumeResetToken(tokenPayload.resetId);
    if (!consumed) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_RESET_TOKEN',
          message: 'This password reset authorization has already been used.',
        },
      });
      return;
    }

    // Update password securely, scrub legacy plaintext fields, and increment tokenVersion to revoke sessions
    await authRepository.updatePasswordDirectly(user.employeeId, new_password, user.email);

    // Send password-change notification email via existing SMTP service
    if (user.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
      const notifResult = await sendPasswordChangedNotificationEmail({
        to: user.email,
        employeeName: user.name,
        employeeCode: user.employeeId,
        companyId: user.company_id,
      });
      await auditRepository.recordLog('PASSWORD_CHANGE_NOTIFICATION_SENT', user.employeeId, user.email, {
        status: notifResult.status,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please sign in with your new password.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * REQUIREMENT 2: Optional Passwordless Email OTP Login — Request OTP
 * - Sends single-use 5-minute OTP to registered employee email
 * - Blocks privileged roles (CEO, Super Admin, HR, Accounts/Finance Manager) from bypassing password/MFA
 * - Uses generic response for unknown emails to prevent enumeration
 */
export const requestEmailOtpLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = emailOtpLoginRequestSchema.parse(req.body);
    const email = validated.email.trim().toLowerCase();

    const genericMessage =
      'If an eligible employee account matches this email, a one-time sign-in code has been sent.';

    const user = await authRepository.findByIdentifier(email);
    if (!user || !user.isActive || user.accountStatus === 'DEACTIVATED' || user.accountStatus === 'DISABLED') {
      await auditRepository.recordLog('EMAIL_OTP_LOGIN_REQUESTED', email, 'Anonymous', {
        reason: 'Account not found or inactive',
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        message: genericMessage,
        data: {
          expiresInSeconds: OTP_EXPIRY_SECONDS,
          resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
        },
      });
      return;
    }

    // Security Requirement: Do not allow email OTP login to bypass required password/MFA for privileged users
    if (isPrivilegedRole(user)) {
      await auditRepository.recordLog('EMAIL_OTP_PRIVILEGED_BLOCKED', user.employeeId, user.email, {
        role: user.role,
        ip: req.ip,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'PRIVILEGED_MFA_REQUIRED',
          message:
            'Privileged accounts (CEO, HR, Accounts, Admin) require standard password authentication and cannot use passwordless OTP sign-in.',
        },
      });
      return;
    }

    const recentCount = await passwordResetRepository.countRecentRequests(
      user.employeeId,
      OTP_RATE_WINDOW_MINUTES,
      'email_otp_login'
    );
    if (recentCount >= MAX_OTP_REQUESTS_PER_WINDOW) {
      await auditRepository.recordLog('FORGOT_PASSWORD_RATE_LIMITED', user.employeeId, user.email, {
        flow: 'email_otp_login',
        recentCount,
        ip: req.ip,
      });

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many OTP requests. Please wait 15 minutes before requesting another code.',
        },
      });
      return;
    }

    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    const createdRecord = await passwordResetRepository.createResetRecord({
      employeeId: user.employeeId,
      otpHash,
      expiresAt,
      purpose: 'email_otp_login',
    });

    const emailResult = await sendEmailLoginOtpEmail({
      to: user.email,
      employeeName: user.name,
      employeeCode: user.employeeId,
      otp: rawOtp,
      companyId: user.company_id,
    });

    if (emailResult.status === 'FAILED') {
      await passwordResetRepository.rollbackFailedDispatch(createdRecord.id);
      res.status(503).json({
        success: false,
        error: {
          code: 'SMTP_DELIVERY_FAILED',
          message: 'Unable to send sign-in verification email at this time. Please use password sign-in.',
        },
      });
      return;
    }

    await auditRepository.recordLog('EMAIL_OTP_LOGIN_REQUESTED', user.employeeId, user.email, {
      expiresAt: expiresAt.toISOString(),
      ip: req.ip,
    });

    res.status(200).json({
      success: true,
      message: genericMessage,
      data: {
        expiresInSeconds: OTP_EXPIRY_SECONDS,
        resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * REQUIREMENT 2: Optional Passwordless Email OTP Login — Verify OTP & Create Session
 */
export const verifyEmailOtpLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = emailOtpLoginVerifySchema.parse(req.body);
    const email = validated.email.trim().toLowerCase();
    const otp = validated.otp.trim();

    const user = await authRepository.findByIdentifier(email);
    if (!user || !user.isActive || user.accountStatus === 'DEACTIVATED' || user.accountStatus === 'DISABLED') {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
        },
      });
      return;
    }

    if (isPrivilegedRole(user)) {
      await auditRepository.recordLog('EMAIL_OTP_PRIVILEGED_BLOCKED', user.employeeId, user.email, {
        role: user.role,
        ip: req.ip,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'PRIVILEGED_MFA_REQUIRED',
          message:
            'Privileged accounts (CEO, HR, Accounts, Admin) require standard password authentication and cannot use passwordless OTP sign-in.',
        },
      });
      return;
    }

    const resetRecord = await passwordResetRepository.getLatestActiveReset(user.employeeId, 'email_otp_login');
    if (!resetRecord) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
        },
      });
      return;
    }

    if (new Date() > resetRecord.expiresAt) {
      await passwordResetRepository.markAsUsed(resetRecord.id);
      res.status(401).json({
        success: false,
        error: {
          code: 'OTP_EXPIRED',
          message: 'Verification code has expired. Please request a new code.',
        },
      });
      return;
    }

    if (resetRecord.attemptCount >= MAX_OTP_ATTEMPTS) {
      await passwordResetRepository.markAsUsed(resetRecord.id);
      res.status(401).json({
        success: false,
        error: {
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: 'Maximum verification attempts exceeded. Please request a new code.',
        },
      });
      return;
    }

    const isMatch = await bcrypt.compare(otp, resetRecord.otpHash);
    if (!isMatch) {
      const attempts = await passwordResetRepository.incrementAttempt(resetRecord.id);
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await passwordResetRepository.markAsUsed(resetRecord.id);
      }
      await auditRepository.recordLog('EMAIL_OTP_LOGIN_FAILED', user.employeeId, user.email, {
        attempt: attempts,
        ip: req.ip,
      });

      res.status(401).json({
        success: false,
        error: {
          code: attempts >= MAX_OTP_ATTEMPTS ? 'MAX_ATTEMPTS_EXCEEDED' : 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
          remainingAttempts: Math.max(0, MAX_OTP_ATTEMPTS - attempts),
        },
      });
      return;
    }

    const wasMarked = await passwordResetRepository.markAsUsed(resetRecord.id);
    if (!wasMarked) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'This verification code has already been used.',
        },
      });
      return;
    }

    await authRepository.recordLoginSuccess(user);
    await auditRepository.recordLog('EMAIL_OTP_LOGIN_VERIFIED', user.employeeId, user.email, {
      ip: req.ip,
    });

    const token = authRepository.generateToken(user, 'email_otp');
    const refreshSession = await refreshSessionRepository.createSession({
      userId: user.id,
      employeeCode: user.employeeId || user.email,
      authMethod: 'email_otp',
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    setRefreshCookie(res, refreshSession.refreshToken, refreshSession.expiresAt);

    res.status(200).json({
      success: true,
      data: {
        accessToken: token,
        refreshToken: refreshSession.refreshToken,
        user: buildSessionUserPayload(user),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Public OTP capability discovery endpoint for Login screen (exposes no credentials).
 */
export const getOtpAuthConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const smsStatus = await smsOtpService.getPublicStatus('company-a');
    res.status(200).json({
      success: true,
      data: {
        emailOtpEnabled: true,
        mobileOtpEnabled: smsStatus.mobileOtpEnabled,
        dltCompliant: smsStatus.dltCompliant,
        mobileOtpStatusMessage: smsStatus.statusMessage,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * REQUIREMENT 3: Mobile Number OTP Login — Request OTP
 * - Disabled until a real DLT-compliant SMS provider is configured & verified
 * - Normalizes mobile number to E.164 format (+91...)
 * - Rejects duplicate mobile numbers across employees
 * - Never creates a new employee account from an unknown mobile number
 * - Enforces privileged role protection
 */
export const requestMobileOtpLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = mobileOtpLoginRequestSchema.parse(req.body);
    const normalizedPhone = normalizeMobileToE164(validated.mobile_number);

    if (!normalizedPhone) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MOBILE_NUMBER',
          message: 'Please enter a valid 10-digit mobile number or E.164 formatted number (+91...).',
        },
      });
      return;
    }

    // Check whether a real, DLT-compliant SMS provider is configured & enabled
    const smsStatus = await smsOtpService.getPublicStatus('company-a');
    if (!smsStatus.mobileOtpEnabled) {
      await auditRepository.recordLog('MOBILE_OTP_PROVIDER_UNAVAILABLE', normalizedPhone, 'Anonymous', {
        ip: req.ip,
      });

      res.status(503).json({
        success: false,
        error: {
          code: 'MOBILE_OTP_UNAVAILABLE',
          message:
            'Mobile OTP login is currently disabled until an authorized Indian DLT-compliant SMS provider is configured and tested.',
        },
      });
      return;
    }

    const lookup = await authRepository.findByMobileNumber(normalizedPhone);

    if (lookup.status === 'DUPLICATE') {
      await auditRepository.recordLog('MOBILE_OTP_DUPLICATE_NUMBER', normalizedPhone, 'System', {
        ip: req.ip,
      });

      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_MOBILE_NUMBER',
          message:
            'This mobile number is linked to multiple employee records. For security, please sign in using your Email or Employee ID.',
        },
      });
      return;
    }

    const genericSmsMessage =
      'If an active employee account is linked to this verified mobile number, an SMS verification code has been sent.';

    if (lookup.status === 'NOT_FOUND' || !lookup.user) {
      // Never create an employee account from an unknown mobile number; return generic response
      await auditRepository.recordLog('MOBILE_OTP_LOGIN_FAILED', normalizedPhone, 'Anonymous', {
        reason: 'Unknown mobile number',
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        message: genericSmsMessage,
        data: {
          normalizedMobile: normalizedPhone,
          expiresInSeconds: OTP_EXPIRY_SECONDS,
          resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
        },
      });
      return;
    }

    const user = lookup.user;

    if (isPrivilegedRole(user)) {
      await auditRepository.recordLog('EMAIL_OTP_PRIVILEGED_BLOCKED', user.employeeId, normalizedPhone, {
        role: user.role,
        channel: 'mobile_otp',
        ip: req.ip,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'PRIVILEGED_MFA_REQUIRED',
          message:
            'Privileged accounts (CEO, HR, Accounts, Admin) require standard password authentication and cannot use passwordless OTP sign-in.',
        },
      });
      return;
    }

    const recentCount = await passwordResetRepository.countRecentRequests(
      user.employeeId,
      OTP_RATE_WINDOW_MINUTES,
      'mobile_otp_login'
    );
    if (recentCount >= MAX_OTP_REQUESTS_PER_WINDOW) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many OTP requests. Please wait 15 minutes before requesting another code.',
        },
      });
      return;
    }

    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    const createdRecord = await passwordResetRepository.createResetRecord({
      employeeId: user.employeeId,
      otpHash,
      expiresAt,
      purpose: 'mobile_otp_login',
    });

    const smsResult = await smsOtpService.sendSmsOtp({
      companyId: user.company_id,
      toE164: normalizedPhone,
      otp: rawOtp,
      employeeCode: user.employeeId,
    });

    if (smsResult.status === 'FAILED') {
      await passwordResetRepository.rollbackFailedDispatch(createdRecord.id);
      res.status(503).json({
        success: false,
        error: {
          code: 'SMS_DELIVERY_FAILED',
          message: smsResult.error || 'Unable to deliver SMS verification code at this time.',
        },
      });
      return;
    }

    await auditRepository.recordLog('MOBILE_OTP_LOGIN_REQUESTED', user.employeeId, normalizedPhone, {
      expiresAt: expiresAt.toISOString(),
      ip: req.ip,
    });

    res.status(200).json({
      success: true,
      message: genericSmsMessage,
      data: {
        normalizedMobile: normalizedPhone,
        expiresInSeconds: OTP_EXPIRY_SECONDS,
        resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * REQUIREMENT 3: Mobile Number OTP Login — Verify OTP & Create Session
 */
export const verifyMobileOtpLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = mobileOtpLoginVerifySchema.parse(req.body);
    const normalizedPhone = normalizeMobileToE164(validated.mobile_number);
    const otp = validated.otp.trim();

    if (!normalizedPhone) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MOBILE_NUMBER',
          message: 'Please enter a valid mobile number.',
        },
      });
      return;
    }

    const smsStatus = await smsOtpService.getPublicStatus('company-a');
    if (!smsStatus.mobileOtpEnabled) {
      res.status(503).json({
        success: false,
        error: {
          code: 'MOBILE_OTP_UNAVAILABLE',
          message:
            'Mobile OTP login is currently disabled until an authorized Indian DLT-compliant SMS provider is configured and tested.',
        },
      });
      return;
    }

    const lookup = await authRepository.findByMobileNumber(normalizedPhone);
    if (lookup.status === 'DUPLICATE') {
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_MOBILE_NUMBER',
          message:
            'This mobile number is linked to multiple employee records. Please sign in using your Email or Employee ID.',
        },
      });
      return;
    }

    if (lookup.status !== 'FOUND' || !lookup.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
        },
      });
      return;
    }

    const user = lookup.user;
    if (isPrivilegedRole(user)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'PRIVILEGED_MFA_REQUIRED',
          message:
            'Privileged accounts (CEO, HR, Accounts, Admin) require standard password authentication and cannot use passwordless OTP sign-in.',
        },
      });
      return;
    }

    const resetRecord = await passwordResetRepository.getLatestActiveReset(user.employeeId, 'mobile_otp_login');
    if (!resetRecord) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
        },
      });
      return;
    }

    if (new Date() > resetRecord.expiresAt) {
      await passwordResetRepository.markAsUsed(resetRecord.id);
      res.status(401).json({
        success: false,
        error: {
          code: 'OTP_EXPIRED',
          message: 'Verification code has expired. Please request a new code.',
        },
      });
      return;
    }

    if (resetRecord.attemptCount >= MAX_OTP_ATTEMPTS) {
      await passwordResetRepository.markAsUsed(resetRecord.id);
      res.status(401).json({
        success: false,
        error: {
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: 'Maximum verification attempts exceeded. Please request a new code.',
        },
      });
      return;
    }

    const isMatch = await bcrypt.compare(otp, resetRecord.otpHash);
    if (!isMatch) {
      const attempts = await passwordResetRepository.incrementAttempt(resetRecord.id);
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await passwordResetRepository.markAsUsed(resetRecord.id);
      }
      await auditRepository.recordLog('MOBILE_OTP_LOGIN_FAILED', user.employeeId, normalizedPhone, {
        attempt: attempts,
        ip: req.ip,
      });

      res.status(401).json({
        success: false,
        error: {
          code: attempts >= MAX_OTP_ATTEMPTS ? 'MAX_ATTEMPTS_EXCEEDED' : 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
          remainingAttempts: Math.max(0, MAX_OTP_ATTEMPTS - attempts),
        },
      });
      return;
    }

    const wasMarked = await passwordResetRepository.markAsUsed(resetRecord.id);
    if (!wasMarked) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'This verification code has already been used.',
        },
      });
      return;
    }

    await authRepository.recordLoginSuccess(user);
    await auditRepository.recordLog('MOBILE_OTP_LOGIN_VERIFIED', user.employeeId, normalizedPhone, {
      ip: req.ip,
    });

    const token = authRepository.generateToken(user, 'mobile_otp');
    const refreshSession = await refreshSessionRepository.createSession({
      userId: user.id,
      employeeCode: user.employeeId || user.email,
      authMethod: 'mobile_otp',
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    setRefreshCookie(res, refreshSession.refreshToken, refreshSession.expiresAt);

    res.status(200).json({
      success: true,
      data: {
        accessToken: token,
        refreshToken: refreshSession.refreshToken,
        user: buildSessionUserPayload(user),
      },
    });
  } catch (err) {
    next(err);
  }
};
