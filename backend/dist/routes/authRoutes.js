import { Router } from 'express';
import { changePassword, forgotPassword, getOtpAuthConfig, login, me, requestEmailOtpLogin, requestMobileOtpLogin, resetPassword, verifyEmailOtpLogin, verifyMobileOtpLogin, verifyResetOtp, } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
export const authRouter = Router();
authRouter.post('/login', authRateLimiter, login);
authRouter.get('/me', authenticateToken, me);
authRouter.post('/change-password', authenticateToken, changePassword);
// Public OTP Capability Status (exposes no credentials)
authRouter.get('/otp-config', getOtpAuthConfig);
// Requirement 1: Secure Email OTP Password Reset Lifecycle Routes
authRouter.post('/forgot-password', authRateLimiter, forgotPassword);
authRouter.post('/verify-reset-otp', authRateLimiter, verifyResetOtp);
authRouter.post('/reset-password', authRateLimiter, resetPassword);
// Requirement 2: Optional Passwordless Email OTP Login Routes
authRouter.post('/otp-login/request', authRateLimiter, requestEmailOtpLogin);
authRouter.post('/otp-login/verify', authRateLimiter, verifyEmailOtpLogin);
// Requirement 3: Optional Mobile Number OTP Login Routes (DLT Compliant, Disabled Until Real SMS Provider Configured)
authRouter.post('/mobile-otp/request', authRateLimiter, requestMobileOtpLogin);
authRouter.post('/mobile-otp/verify', authRateLimiter, verifyMobileOtpLogin);
//# sourceMappingURL=authRoutes.js.map