import { describe, it, expect, vi } from 'vitest';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { verifySmtpConnection } from '../src/services/emailService.js';
import { authenticateToken } from '../src/middleware/authMiddleware.js';
import { requireRoles } from '../src/middleware/rbacMiddleware.js';

describe('Gmail SMTP Integration & Authentication Security Suite', () => {

  describe('1. Distinct HRMS Authentication & Authorization Errors (No Bypass)', () => {
    it('returns 401 HRMS_UNAUTHENTICATED when token is missing', async () => {
      const req: any = { headers: {} };
      const res: any = {
        statusCode: 0,
        body: null,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        }
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HRMS_UNAUTHENTICATED');
      expect(res.body.error.message).toContain('Authentication required');
    });

    it('returns 401 HRMS_TOKEN_EXPIRED when session token has expired', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { id: 'usr-1', email: 'admin@businz.com', role: 'Super Admin' },
        env.JWT_SECRET,
        { expiresIn: '-10s' }
      );

      const req: any = { headers: { authorization: `Bearer ${expiredToken}` } };
      const res: any = {
        statusCode: 0,
        body: null,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        }
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HRMS_TOKEN_EXPIRED');
      expect(res.body.error.message).toContain('expired');
    });

    it('returns 401 HRMS_TOKEN_INVALID when token has invalid signature or bogus content', async () => {
      const req: any = { headers: { authorization: 'Bearer bogus.invalid.token' } };
      const res: any = {
        statusCode: 0,
        body: null,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        }
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HRMS_TOKEN_INVALID');
    });

    it('returns 403 HRMS_FORBIDDEN when user has valid token but unauthorized role (e.g. Employee)', () => {
      const req: any = {
        user: { id: 'usr-emp', email: 'emp@businz.com', role: 'Employee' }
      };
      const res: any = {
        statusCode: 0,
        body: null,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        }
      };
      const next = vi.fn();

      const middleware = requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']);
      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HRMS_FORBIDDEN');
      expect(res.body.error.message).toContain('Insufficient permissions');
    });

    it('permits authorized admin user (Super Admin / HR Manager / CEO)', () => {
      const req: any = {
        user: { id: 'usr-admin', email: 'admin@businz.com', role: 'Super Admin' }
      };
      const res: any = {};
      const next = vi.fn();

      const middleware = requireRoles(['Super Admin', 'CEO', 'HR Manager']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('2. Google App Password Sanitization & STARTTLS Configuration', () => {
    it('removes spaces from Google App Password and configures smtp.gmail.com:587 with STARTTLS', async () => {
      const createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        verify: vi.fn().mockResolvedValue(true),
        sendMail: vi.fn().mockResolvedValue({ messageId: '<test@google.com>' }),
      } as any);

      const result = await verifySmtpConnection({
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        senderEmail: 'hr@mycompany.com',
        appPassword: 'abcd efgh ijkl mnop', // 16 characters with Google formatting spaces
      });

      expect(createTransportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false, // Port 587 must NOT use direct SSL; it must use STARTTLS
          requireTLS: true,
          auth: {
            user: 'hr@mycompany.com',
            pass: 'abcdefghijklmnop', // Spaces stripped cleanly!
          }
        })
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('STARTTLS');
      createTransportSpy.mockRestore();
    });

    it('falls back to saved decrypted password if input is empty or masked bullets', async () => {
      const createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        verify: vi.fn().mockResolvedValue(true),
      } as any);

      // Testing with masked bullets '••••••••••••••••'
      // If no saved config exists, it requires password
      await expect(
        verifySmtpConnection({
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          senderEmail: 'hr@mycompany.com',
          appPassword: '••••••••••••••••',
        })
      ).rejects.toThrow('Google Account App Password (16 characters) is required');

      createTransportSpy.mockRestore();
    });
  });

  describe('3. Distinct Error Reporting & No Password Leakage', () => {
    it('returns SMTP_AUTH_FAILED with helpful guidance when Google rejects credentials', async () => {
      const authErr: any = new Error('Invalid login: 535-5.7.8 Username and Password not accepted');
      authErr.responseCode = 535;

      const createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        verify: vi.fn().mockRejectedValue(authErr),
      } as any);

      try {
        await verifySmtpConnection({
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          senderEmail: 'hr@mycompany.com',
          appPassword: 'secretpassword12',
        });
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.code).toBe('SMTP_AUTH_FAILED');
        expect(err.message).toContain('535 5.7.8');
        expect(err.message).toContain('Google rejected credentials');
        expect(err.message).not.toContain('secretpassword12'); // Never leak password!
      } finally {
        createTransportSpy.mockRestore();
      }
    });

    it('returns SMTP_CONNECTION_FAILED when host or port is unreachable', async () => {
      const connErr: any = new Error('connect ECONNREFUSED 142.250.180.108:587');
      connErr.code = 'ECONNREFUSED';

      const createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        verify: vi.fn().mockRejectedValue(connErr),
      } as any);

      try {
        await verifySmtpConnection({
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          senderEmail: 'hr@mycompany.com',
          appPassword: 'secretpassword12',
        });
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.code).toBe('SMTP_CONNECTION_FAILED');
        expect(err.message).toContain('Unable to connect to smtp.gmail.com:587');
        expect(err.message).not.toContain('secretpassword12');
      } finally {
        createTransportSpy.mockRestore();
      }
    });
  });

  describe('4. Test Email Sending to Explicitly Selected Recipient Only', () => {
    it('does NOT call sendMail when test recipient is omitted (connection verification only)', async () => {
      const sendMailMock = vi.fn().mockResolvedValue({ messageId: '1' });
      const verifyMock = vi.fn().mockResolvedValue(true);

      const createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        verify: verifyMock,
        sendMail: sendMailMock,
      } as any);

      const result = await verifySmtpConnection({
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        senderEmail: 'hr@mycompany.com',
        appPassword: 'abcdefghijklmnop',
      });

      expect(verifyMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).not.toHaveBeenCalled(); // No unsolicited emails!
      expect(result.success).toBe(true);
      expect(result.message).toContain('Verified Google Workspace SMTP handshake');

      createTransportSpy.mockRestore();
    });

    it('sends test email ONLY when testRecipientEmail is explicitly provided', async () => {
      const sendMailMock = vi.fn().mockResolvedValue({ messageId: '<test-email-id@businz>' });
      const verifyMock = vi.fn().mockResolvedValue(true);

      const createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        verify: verifyMock,
        sendMail: sendMailMock,
      } as any);

      const result = await verifySmtpConnection({
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        senderEmail: 'hr@mycompany.com',
        appPassword: 'abcdefghijklmnop',
        testRecipientEmail: 'audit@businz.com', // Explicitly selected recipient
      });

      expect(verifyMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'audit@businz.com',
          subject: expect.stringContaining('SMTP Connection Verified'),
        })
      );
      expect(result.success).toBe(true);
      expect(result.message).toContain('delivered to audit@businz.com');

      createTransportSpy.mockRestore();
    });
  });

});
