import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import { authRepository } from '../repositories/authRepository.js';
import { auditRepository } from '../repositories/auditRepository.js';
import { passwordResetRepository } from '../repositories/passwordResetRepository.js';
import { sendPasswordResetOtpEmail } from '../services/emailService.js';
import { 
  changePasswordSchema, 
  loginSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema
} from '../validators/authValidators.js';

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
        reason: 'Account deactivated',
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
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

    // Record last login and generate token
    await authRepository.recordLoginSuccess(user);
    const token = authRepository.generateToken(user);

    res.status(200).json({
      success: true,
      data: {
        accessToken: token,
        user: {
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
        },
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
      req.user.email,
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

    const updatedUser = await authRepository.findByEmail(req.user.email);
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

    const accessToken = authRepository.generateToken(updatedUser);

    res.status(200).json({
      success: true,
      message: 'Password updated successfully. You may now access the full dashboard.',
      data: { accessToken },
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
 * Initiates the Forgot Password flow.
 * Generates single-use 6-digit OTP, hashes it with bcrypt, and sends email.
 * Always returns a generic message to prevent account enumeration.
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = forgotPasswordSchema.parse(req.body);
    const identifier = validated.email_or_employee_id.trim();

    // Standard secure message to avoid account enumeration
    const genericSuccessMessage = 'If this account exists, a verification code has been sent.';

    const user = await authRepository.findByIdentifier(identifier);
    if (!user || user.accountStatus === 'DEACTIVATED' || user.accountStatus === 'DISABLED' || !user.isActive) {
      await auditRepository.recordLog('FORGOT_PASSWORD_ATTEMPT', identifier, 'Anonymous', {
        reason: 'User not found or deactivated',
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        message: genericSuccessMessage,
      });
      return;
    }

    // Check rate limit: Max 3 requests within 15 minutes
    const recentCount = await passwordResetRepository.countRecentRequests(user.employeeId, 15);
    if (recentCount >= 3) {
      await auditRepository.recordLog('FORGOT_PASSWORD_RATE_LIMITED', user.employeeId, user.email, {
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
          message: 'Please contact HR to update your registered email address.',
        },
      });
      return;
    }

    // Generate cryptographically secure 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in password_resets table
    await passwordResetRepository.createResetRecord({
      employeeId: user.employeeId,
      otpHash,
      expiresAt,
    });

    // Dispatch email
    await sendPasswordResetOtpEmail({
      to: user.email,
      employeeName: user.name,
      employeeCode: user.employeeId,
      otp: rawOtp,
    });

    await auditRepository.recordLog('PASSWORD_RESET_OTP_SENT', user.employeeId, user.email, {
      expiresAt: expiresAt.toISOString(),
      ip: req.ip,
    });

    res.status(200).json({
      success: true,
      message: genericSuccessMessage,
      data: {
        recipientMasked: user.email.replace(/(.{2})(.*)(?=@)/, (_g1, g2, g3) => g2 + '*'.repeat(Math.max(1, g3.length))),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Verifies the 6-digit OTP.
 * Validates attempt count (< 5) and expiration (10 minutes).
 * On success, issues a signed 15-minute JWT reset token.
 */
export const verifyResetOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = verifyResetOtpSchema.parse(req.body);
    const identifier = validated.email_or_employee_id.trim();
    const otp = validated.otp.trim();

    const user = await authRepository.findByIdentifier(identifier);
    if (!user) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
        },
      });
      return;
    }

    const resetRecord = await passwordResetRepository.getLatestActiveReset(user.employeeId);
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

    // Check expiry (10 minutes)
    if (new Date() > resetRecord.expiresAt) {
      await passwordResetRepository.markAsUsed(resetRecord.id);
      res.status(400).json({
        success: false,
        error: {
          code: 'OTP_EXPIRED',
          message: 'Invalid or expired verification code.',
        },
      });
      return;
    }

    // Check attempt limit (max 5)
    if (resetRecord.attemptCount >= 5) {
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
      await auditRepository.recordLog('PASSWORD_RESET_OTP_FAILED', user.employeeId, user.email, {
        attempt: attempts,
        ip: req.ip,
      });

      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
          remainingAttempts: Math.max(0, 5 - attempts),
        },
      });
      return;
    }

    // OTP verified successfully: mark used and generate 15-minute reset token
    await passwordResetRepository.markAsUsed(resetRecord.id);
    const resetToken = passwordResetRepository.generateResetToken(user.employeeId, user.email);

    await auditRepository.recordLog('PASSWORD_RESET_OTP_VERIFIED', user.employeeId, user.email, {
      ip: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Verification code verified successfully. You may now choose a new password.',
      data: {
        resetToken,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Resets employee password using the verified reset_token.
 * Enforces strong password rules and updates bcrypt password hash.
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
          message: 'Your password reset session has expired or is invalid. Please request a new verification code.',
        },
      });
      return;
    }

    const user = await authRepository.findByIdentifier(tokenPayload.employeeId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Employee account not found.',
        },
      });
      return;
    }

    // Hash the new password using bcrypt
    const newPasswordHash = await bcrypt.hash(new_password, 10);

    // Update password securely and revoke any prior mustChangePassword flag
    await authRepository.updatePasswordDirectly(user.employeeId, newPasswordHash, user.email);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please login with your new password.',
    });
  } catch (err) {
    next(err);
  }
};
