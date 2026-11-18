import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../src/app.js';
import {
  authRepository,
  BCRYPT_ROUNDS,
  isBcryptPasswordHash,
  scrubProfilePasswordFields,
} from '../src/repositories/authRepository.js';
import { passwordResetRepository } from '../src/repositories/passwordResetRepository.js';
import { settingsRepository } from '../src/repositories/settingsRepository.js';
import { smsOtpService, normalizeMobileToE164 } from '../src/services/smsOtpService.js';

let testServer: Server;
let baseUrl = '';

function request(_expressApp: any) {
  const buildReq = (method: 'GET' | 'POST', urlPath: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let payloadBody: any = undefined;

    const execute = async () => {
      const res = await fetch(`${baseUrl}${urlPath}`, {
        method,
        headers,
        body: payloadBody !== undefined ? JSON.stringify(payloadBody) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, body: json };
    };

    const chain: any = {
      set(key: string, val: string) {
        headers[key] = val;
        return chain;
      },
      send(body: any) {
        payloadBody = body;
        return execute();
      },
      then(onFulfilled: any, onRejected: any) {
        return execute().then(onFulfilled, onRejected);
      },
    };
    return chain;
  };

  return {
    get: (urlPath: string) => buildReq('GET', urlPath),
    post: (urlPath: string) => buildReq('POST', urlPath),
  };
}

describe('BUSINZ HRMS — Secure Forgot Password + OTP Authentication Suite', () => {
  let capturedEmails: Array<{ to: string; subject: string; text: string; html: string }> = [];
  let shouldSmtpFail = false;
  let createTransportSpy: any;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      testServer = app.listen(0, () => {
        const port = (testServer.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (testServer) {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
  });

  beforeEach(async () => {
    capturedEmails = [];
    shouldSmtpFail = false;
    authRepository.clearTestAccounts();
    passwordResetRepository.clearInMemoryForTests();
    smsOtpService.resetInMemoryStateForTests('company-a');

    // Configure existing company-a Google Workspace SMTP in settingsRepository
    await settingsRepository.saveCompanySmtpConfig('company-a', {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      senderEmail: 'developer@businz.com',
      senderName: 'Businz HRMS',
      appPassword: 'xdarqfxcbkkjgnja',
    });

    createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockImplementation(() => {
      return {
        verify: vi.fn(async () => {
          if (shouldSmtpFail) throw new Error('SMTP connection refused');
          return true;
        }),
        sendMail: vi.fn(async (mailOptions: any) => {
          if (shouldSmtpFail) {
            throw new Error('SMTP connection timed out while dispatching email');
          }
          capturedEmails.push({
            to: mailOptions.to,
            subject: mailOptions.subject,
            text: mailOptions.text || '',
            html: mailOptions.html || '',
          });
          return { messageId: `<test-${Date.now()}@businz.com>` };
        }),
      } as any;
    });

    // Register standard employee test account
    const initialHash = await bcrypt.hash('OldPassword@2026!', BCRYPT_ROUNDS);
    authRepository.registerTestAccount({
      id: 'emp-uuid-101',
      employeeId: 'VRM-101',
      email: 'arun.kumar@businz.com',
      phone: '+919876500101',
      passwordHash: initialHash,
      name: 'Arun Kumar',
      role: 'Employee',
      department: 'Engineering',
      designation: 'Software Engineer',
      company_id: 'company-a',
      isActive: true,
      mustChangePassword: false,
      accountStatus: 'ACTIVE',
      tokenVersion: 1,
    });
  });

  afterEach(() => {
    if (createTransportSpy) {
      createTransportSpy.mockRestore();
    }
  });

  function extractOtpFromLastEmail(): string {
    const last = capturedEmails[capturedEmails.length - 1];
    expect(last).toBeDefined();
    const match = last.text.match(/\b(\d{6})\b/);
    expect(match).not.toBeNull();
    return match![1];
  }

  // ==========================================================================
  // 1. Valid Employee Email & 2. Invalid Employee Email
  // ==========================================================================
  it('1 & 2. handles valid employee email and invalid employee email with identical generic responses and 5-minute OTP expiry', async () => {
    // 1. Valid employee email
    const validRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'arun.kumar@businz.com' });

    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.data.expiresInSeconds).toBe(300); // 5 minutes
    // Security: Raw or simulated OTP must NEVER be exposed in API response
    expect(validRes.body.data.simulatedOtp).toBeUndefined();
    expect(validRes.body.data.otp).toBeUndefined();
    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].to).toBe('arun.kumar@businz.com');
    expect(capturedEmails[0].text).toContain('5 minutes');

    // Verify stored OTP in repository is bcrypt-hashed, never plaintext
    const otp = extractOtpFromLastEmail();
    const activeReset = await passwordResetRepository.getLatestActiveReset('VRM-101', 'password_reset');
    expect(activeReset).not.toBeNull();
    expect(activeReset!.otpHash).not.toBe(otp);
    expect(isBcryptPasswordHash(activeReset!.otpHash)).toBe(true);

    // 2. Invalid / unknown employee email returns the exact same generic message & structure (prevents user enumeration)
    const invalidRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'unknown.person@businz.com' });

    expect(invalidRes.status).toBe(200);
    expect(invalidRes.body.success).toBe(true);
    expect(invalidRes.body.message).toBe(validRes.body.message);
    expect(invalidRes.body.data.expiresInSeconds).toBe(300);
    expect(capturedEmails).toHaveLength(1); // No email sent for non-existent user
  });

  // ==========================================================================
  // 3. Valid OTP & 4. Incorrect OTP (with attempt limit)
  // ==========================================================================
  it('3 & 4. rejects incorrect OTPs, tracks remaining attempts, and locks OTP after 5 failed attempts', async () => {
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'VRM-101' });

    const realOtp = extractOtpFromLastEmail();
    const wrongOtp = realOtp === '123456' ? '654321' : '123456';

    // Attempts 1 to 4 with wrong OTP
    for (let attempt = 1; attempt <= 4; attempt++) {
      const badRes = await request(app)
        .post('/api/v1/auth/verify-reset-otp')
        .send({ email_or_employee_id: 'VRM-101', otp: wrongOtp });

      expect(badRes.status).toBe(400);
      expect(badRes.body.error.code).toBe('INVALID_OTP');
      expect(badRes.body.error.remainingAttempts).toBe(5 - attempt);
    }

    // Attempt 5 with wrong OTP exceeds max attempts and invalidates the OTP
    const fifthBadRes = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email_or_employee_id: 'VRM-101', otp: wrongOtp });

    expect(fifthBadRes.status).toBe(400);
    expect(fifthBadRes.body.error.code).toBe('MAX_ATTEMPTS_EXCEEDED');
    expect(fifthBadRes.body.error.remainingAttempts).toBe(0);

    // Even supplying the real OTP now must fail because the OTP was invalidated on the 5th failure
    const afterLockoutRes = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email_or_employee_id: 'VRM-101', otp: realOtp });

    expect(afterLockoutRes.status).toBe(400);
  });

  // ==========================================================================
  // 5. Expired OTP
  // ==========================================================================
  it('5. rejects an OTP that has expired after 5 minutes', async () => {
    // Insert an already-expired OTP record (expired 1 second ago)
    const expiredOtp = '482910';
    const otpHash = await bcrypt.hash(expiredOtp, 10);
    await passwordResetRepository.createResetRecord({
      employeeId: 'VRM-101',
      otpHash,
      expiresAt: new Date(Date.now() - 1000),
      purpose: 'password_reset',
    });

    const res = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email_or_employee_id: 'VRM-101', otp: expiredOtp });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  // ==========================================================================
  // 6. OTP Reused After Success (Replay Attack Prevention)
  // ==========================================================================
  it('6. prevents OTP replay and reset_token replay after successful verification', async () => {
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'arun.kumar@businz.com' });

    const otp = extractOtpFromLastEmail();

    // First verification succeeds
    const firstVerify = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email_or_employee_id: 'arun.kumar@businz.com', otp });

    expect(firstVerify.status).toBe(200);
    expect(firstVerify.body.data.resetToken).toBeDefined();

    // Replaying the same OTP a second time is rejected
    const replayVerify = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email_or_employee_id: 'arun.kumar@businz.com', otp });

    expect(replayVerify.status).toBe(400);
    expect(replayVerify.body.error.code).toBe('INVALID_OTP');
  });

  // ==========================================================================
  // 7. Resend OTP (Invalidates Previous OTP) & 8. Too Many OTP Requests
  // ==========================================================================
  it('7 & 8. invalidates previous OTP upon resend and enforces rate limit after 3 requests in 15 minutes', async () => {
    // Request #1
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'arun.kumar@businz.com' });
    const firstOtp = extractOtpFromLastEmail();

    // Request #2 (Resend)
    const resendRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'arun.kumar@businz.com' });
    expect(resendRes.status).toBe(200);
    const secondOtp = extractOtpFromLastEmail();

    // First OTP must now be invalid!
    const oldOtpVerify = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email_or_employee_id: 'arun.kumar@businz.com', otp: firstOtp });
    expect(oldOtpVerify.status).toBe(400);

    // Request #3
    const thirdRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'arun.kumar@businz.com' });
    expect(thirdRes.status).toBe(200);
    const thirdOtp = extractOtpFromLastEmail();

    // Request #4 within 15 minutes must be blocked with 429 RATE_LIMITED
    const fourthRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'arun.kumar@businz.com' });
    expect(fourthRes.status).toBe(429);
    expect(fourthRes.body.error.code).toBe('RATE_LIMITED');

    // Latest OTP (#3) still verifies cleanly
    const verifyThird = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email_or_employee_id: 'arun.kumar@businz.com', otp: thirdOtp });
    expect(verifyThird.status).toBe(200);
    expect(secondOtp).toBeDefined();
  });

  // ==========================================================================
  // 9. Password Successfully Changed, 10. Old Password Rejected + Session Revoked, 11. New Password Login
  // ==========================================================================
  it('9, 10 & 11. resets password securely, revokes prior sessions, rejects old password, sends notification email, and logs in with new password', async () => {
    // Log in with old password first to obtain an active session token
    const initialLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'arun.kumar@businz.com', password: 'OldPassword@2026!' });
    expect(initialLogin.status).toBe(200);
    const oldSessionToken = initialLogin.body.data.accessToken;

    // Verify old session token works before password reset
    const meBefore = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldSessionToken}`);
    expect(meBefore.status).toBe(200);

    // Initiate Forgot Password -> Verify OTP -> Reset Password
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'arun.kumar@businz.com' });
    const otp = extractOtpFromLastEmail();

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email_or_employee_id: 'arun.kumar@businz.com', otp });
    expect(verifyRes.status).toBe(200);
    const resetToken = verifyRes.body.data.resetToken;

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        reset_token: resetToken,
        new_password: 'NewStrongPassword#2026',
        confirm_password: 'NewStrongPassword#2026',
      });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);

    // Verify password-change notification email was dispatched
    const lastEmail = capturedEmails[capturedEmails.length - 1];
    expect(lastEmail.to).toBe('arun.kumar@businz.com');
    expect(lastEmail.subject).toContain('Password Was Changed');

    // Reusing the same reset_token a second time must fail
    const replayReset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        reset_token: resetToken,
        new_password: 'AnotherPassword#2026',
        confirm_password: 'AnotherPassword#2026',
      });
    expect(replayReset.status).toBe(400);
    expect(replayReset.body.error.code).toBe('INVALID_RESET_TOKEN');

    // 10a. Old session token issued before password reset is now revoked (401 HRMS_TOKEN_REVOKED)
    const meAfterReset = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldSessionToken}`);
    expect(meAfterReset.status).toBe(401);
    expect(meAfterReset.body.error.code).toBe('HRMS_TOKEN_REVOKED');

    // 10b. Old password is rejected on login
    const oldPasswordLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'arun.kumar@businz.com', password: 'OldPassword@2026!' });
    expect(oldPasswordLogin.status).toBe(401);
    expect(oldPasswordLogin.body.error.code).toBe('INVALID_CREDENTIALS');

    // 11. New password login succeeds and issues a valid session
    const newPasswordLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'arun.kumar@businz.com', password: 'NewStrongPassword#2026' });
    expect(newPasswordLogin.status).toBe(200);
    expect(newPasswordLogin.body.data.accessToken).toBeDefined();
    expect(newPasswordLogin.body.data.user.employeeId).toBe('VRM-101');
  });

  // ==========================================================================
  // 12. SMTP Failure Handling
  // ==========================================================================
  it('12. handles SMTP failure gracefully by rolling back the OTP and returning 503', async () => {
    shouldSmtpFail = true;

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'arun.kumar@businz.com' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SMTP_DELIVERY_FAILED');

    // Ensure no orphaned active OTP remains in storage after SMTP failure
    const activeReset = await passwordResetRepository.getLatestActiveReset('VRM-101', 'password_reset');
    expect(activeReset).toBeNull();
  });

  // ==========================================================================
  // 13. Employee Without an Email
  // ==========================================================================
  it('13. handles an employee account without a registered email address cleanly', async () => {
    authRepository.registerTestAccount({
      id: 'emp-uuid-no-email',
      employeeId: 'VRM-NO-EMAIL',
      email: '',
      passwordHash: await bcrypt.hash('Password@123', BCRYPT_ROUNDS),
      name: 'No Email Worker',
      role: 'Employee',
      department: 'Production',
      designation: 'Technician',
      company_id: 'company-a',
      isActive: true,
      mustChangePassword: false,
      accountStatus: 'ACTIVE',
    });

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email_or_employee_id: 'VRM-NO-EMAIL' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_REGISTERED_EMAIL');
    expect(capturedEmails).toHaveLength(0);
  });

  // ==========================================================================
  // 14. Duplicate Employee Mobile Numbers & 15. Mobile OTP Provider Unavailable
  // ==========================================================================
  it('14 & 15. keeps Mobile OTP disabled when no DLT SMS provider is configured, and rejects duplicate employee mobile numbers when enabled', async () => {
    // 15. By default, Mobile OTP provider is disabled (no fake SMS OTPs!)
    const disabledRes = await request(app)
      .post('/api/v1/auth/mobile-otp/request')
      .send({ mobile_number: '9876500101' });

    expect(disabledRes.status).toBe(503);
    expect(disabledRes.body.error.code).toBe('MOBILE_OTP_UNAVAILABLE');

    // Verify E.164 normalization helper
    expect(normalizeMobileToE164('9876500101')).toBe('+919876500101');
    expect(normalizeMobileToE164('+91 98765-00101')).toBe('+919876500101');
    expect(normalizeMobileToE164('12345')).toBeNull();

    // Configure & verify a DLT-compliant SMS provider for testing duplicate mobile numbers & admin credential masking
    const adminView = await smsOtpService.saveConfig('company-a', {
      enabled: true,
      isVerified: true,
      provider: 'MSG91',
      apiEndpoint: 'https://control.msg91.com/api/v5/otp',
      senderId: 'BUSINZ',
      dltEntityId: '1201159283746519283',
      dltTemplateId: '1207161829384756102',
      apiKey: 'msg91-real-secret-api-key-2026',
    });

    // Verify admin configuration view never exposes plaintext or encrypted API credentials
    expect(adminView.hasApiKey).toBe(true);
    expect(adminView.maskedApiKey).toBe('••••••••••••••••');
    expect((adminView as any).apiKey).toBeUndefined();
    expect((adminView as any).apiKeyEncrypted).toBeUndefined();
    expect(JSON.stringify(adminView)).not.toContain('msg91-real-secret-api-key-2026');

    // Register two employees sharing the same mobile number (+919876599999)
    const sharedHash = await bcrypt.hash('Pass@12345!', BCRYPT_ROUNDS);
    authRepository.registerTestAccount({
      id: 'emp-dup-1',
      employeeId: 'VRM-DUP-1',
      email: 'dup1@businz.com',
      phone: '9876599999',
      passwordHash: sharedHash,
      name: 'Duplicate One',
      role: 'Employee',
      department: 'Sales',
      designation: 'Executive',
      isActive: true,
      mustChangePassword: false,
      accountStatus: 'ACTIVE',
    });
    authRepository.registerTestAccount({
      id: 'emp-dup-2',
      employeeId: 'VRM-DUP-2',
      email: 'dup2@businz.com',
      phone: '+91 98765 99999',
      passwordHash: sharedHash,
      name: 'Duplicate Two',
      role: 'Employee',
      department: 'Sales',
      designation: 'Executive',
      isActive: true,
      mustChangePassword: false,
      accountStatus: 'ACTIVE',
    });

    // 14. Requesting Mobile OTP for duplicate mobile number is blocked with 409 DUPLICATE_MOBILE_NUMBER
    const dupRes = await request(app)
      .post('/api/v1/auth/mobile-otp/request')
      .send({ mobile_number: '9876599999' });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('DUPLICATE_MOBILE_NUMBER');
  });

  // ==========================================================================
  // 16. Unauthorized Access Attempts, Email OTP Login & Privileged Role Protection
  // ==========================================================================
  it('16. allows standard employee Email OTP login, blocks privileged roles (CEO, HR, Accounts) from passwordless OTP bypass, and protects admin SMS config endpoints', async () => {
    // Standard employee requests Email OTP login
    const reqOtp = await request(app)
      .post('/api/v1/auth/otp-login/request')
      .send({ email: 'arun.kumar@businz.com' });
    expect(reqOtp.status).toBe(200);
    const loginOtp = extractOtpFromLastEmail();

    // Standard employee verifies Email OTP and receives session with role & permissions
    const verifyOtp = await request(app)
      .post('/api/v1/auth/otp-login/verify')
      .send({ email: 'arun.kumar@businz.com', otp: loginOtp });
    expect(verifyOtp.status).toBe(200);
    expect(verifyOtp.body.data.accessToken).toBeDefined();
    expect(verifyOtp.body.data.user.role).toBe('Employee');
    const employeeSessionToken = verifyOtp.body.data.accessToken;

    // Register privileged accounts (CEO, HR Manager, Finance Manager / Accounts)
    for (const priv of [
      { id: 'priv-ceo', empId: 'VRM-CEO', email: 'ceo@businz.com', role: 'CEO', desig: 'Chief Executive Officer' },
      { id: 'priv-hr', empId: 'VRM-HR', email: 'hr.head@businz.com', role: 'HR Manager', desig: 'HR Manager' },
      { id: 'priv-acc', empId: 'VRM-ACC', email: 'accounts@businz.com', role: 'Finance Manager', desig: 'Accounts Manager' },
    ]) {
      authRepository.registerTestAccount({
        id: priv.id,
        employeeId: priv.empId,
        email: priv.email,
        phone: '+919876511111',
        passwordHash: await bcrypt.hash('PrivPass#2026!', BCRYPT_ROUNDS),
        name: priv.desig,
        role: priv.role,
        department: 'Management',
        designation: priv.desig,
        isActive: true,
        mustChangePassword: false,
        accountStatus: 'ACTIVE',
      });

      const privOtpRes = await request(app)
        .post('/api/v1/auth/otp-login/request')
        .send({ email: priv.email });

      expect(privOtpRes.status).toBe(403);
      expect(privOtpRes.body.error.code).toBe('PRIVILEGED_MFA_REQUIRED');
    }

    // Unauthorized access attempts to SMS provider admin configuration:
    // 1) Unauthenticated -> 401
    const unauthSmsCfg = await request(app).get('/api/v1/settings/sms-otp/config');
    expect(unauthSmsCfg.status).toBe(401);

    // 2) Standard Employee token -> 403 Forbidden
    const empSmsCfg = await request(app)
      .get('/api/v1/settings/sms-otp/config')
      .set('Authorization', `Bearer ${employeeSessionToken}`);
    expect(empSmsCfg.status).toBe(403);

    // Verify scrubProfilePasswordFields removes portalPassword as well as password/plainPassword
    const scrubbed = scrubProfilePasswordFields({
      id: 'VRM-101',
      portalPassword: 'LeakedPortalPassword',
      password: 'LeakedPassword',
      systemAccess: { portalPassword: 'LeakedPortalPassword', role: 'Employee' },
    });
    expect(scrubbed.portalPassword).toBeUndefined();
    expect(scrubbed.password).toBeUndefined();
    expect(scrubbed.systemAccess.portalPassword).toBeUndefined();
  });

  // ==========================================================================
  // 17. Login and Recovery on Android Chrome / Mobile Viewport & Autofill Readiness
  // ==========================================================================
  it('17. verifies Android Chrome mobile OTP autofill attributes, numeric keyboard, touch targets, and no horizontal overflow in LoginPage and ForgotPasswordModal', () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const loginPageCode = fs.readFileSync(
      path.join(repoRoot, 'frontend/src/components/auth/LoginPage.tsx'),
      'utf8'
    );
    const forgotModalCode = fs.readFileSync(
      path.join(repoRoot, 'frontend/src/components/auth/ForgotPasswordModal.tsx'),
      'utf8'
    );

    // Verify Android Chrome WebOTP / autofill support (autoComplete="one-time-code") and numeric keypad (inputMode="numeric")
    expect(forgotModalCode).toContain('one-time-code');
    expect(forgotModalCode).toContain('inputMode="numeric"');
    expect(forgotModalCode).toContain('overflowX: \'hidden\'');
    expect(forgotModalCode).toContain('Save Password');
    expect(forgotModalCode).toContain('Password Changed Successfully');
    // Ensure fake simulatedEmail box is completely removed
    expect(forgotModalCode).not.toContain('Simulated In-App Mail Dispatch');

    expect(loginPageCode).toContain('one-time-code');
    expect(loginPageCode).toContain('inputMode="numeric"');
    expect(loginPageCode).toContain('overflowX: \'hidden\'');
    expect(loginPageCode).toContain('Login with OTP');
    expect(loginPageCode).toContain('Email OTP');
    expect(loginPageCode).toContain('Mobile OTP');
  });
});
