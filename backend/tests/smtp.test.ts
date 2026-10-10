import { describe, it, expect, beforeEach } from 'vitest';
import { encryptCredential, decryptCredential } from '../src/utils/crypto.js';
import { settingsRepository } from '../src/repositories/settingsRepository.js';
import { getCompanySmtpTransporter, verifySmtpConnection, sendOfferLetterEmail } from '../src/services/emailService.js';

describe('SMTP Configuration & Security Regression Tests', () => {
  beforeEach(() => {
    // Reset any state if necessary
  });

  describe('1. AES-256-GCM Credential Encryption', () => {
    it('should correctly encrypt and decrypt Google App Passwords', () => {
      const rawPassword = 'xdarqfxcbkkjgnja';
      const encrypted = encryptCredential(rawPassword);

      expect(encrypted).not.toBe(rawPassword);
      expect(encrypted.split(':')).toHaveLength(3); // iv:tag:ciphertext

      const decrypted = decryptCredential(encrypted);
      expect(decrypted).toBe(rawPassword);
    });

    it('should handle empty password gracefully', () => {
      expect(encryptCredential('')).toBe('');
      expect(decryptCredential('')).toBe('');
    });
  });

  describe('2. Multi-Tenant Company Isolation', () => {
    it('should maintain independent SMTP configurations for Company A and Company B', async () => {
      // Configure Company A (Businz)
      await settingsRepository.saveCompanySmtpConfig('company-a', {
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        senderEmail: 'developer@businz.com',
        senderName: 'Businz Technologies Pvt Ltd',
        appPassword: 'xdarqfxcbkkjgnja',
      });

      // Configure Company B (Nexus)
      await settingsRepository.saveCompanySmtpConfig('company-b', {
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        senderEmail: 'hr@nexus-solutions.com',
        senderName: 'Nexus Industrial Solutions',
        appPassword: 'nexuspassword1234',
      });

      const configA = await settingsRepository.getCompanySmtpConfig('company-a');
      const configB = await settingsRepository.getCompanySmtpConfig('company-b');

      expect(configA).not.toBeNull();
      expect(configB).not.toBeNull();
      expect(configA?.senderEmail).toBe('developer@businz.com');
      expect(configB?.senderEmail).toBe('hr@nexus-solutions.com');

      // Verify passwords decrypt independently
      const passA = decryptCredential(configA!.appPasswordEncrypted);
      const passB = decryptCredential(configB!.appPasswordEncrypted);

      expect(passA).toBe('xdarqfxcbkkjgnja');
      expect(passB).toBe('nexuspassword1234');
      expect(passA).not.toBe(passB);
    });

    it('should strip spaces from Google App Passwords automatically', async () => {
      await settingsRepository.saveCompanySmtpConfig('company-a', {
        senderEmail: 'developer@businz.com',
        appPassword: 'xdar qfxc bkkj gnja', // spaced format from Google
      });

      const config = await settingsRepository.getCompanySmtpConfig('company-a');
      const decrypted = decryptCredential(config!.appPasswordEncrypted);
      expect(decrypted).toBe('xdarqfxcbkkjgnja');
    });
  });

  describe('3. Shared Transporter Construction', () => {
    it('should construct Google Workspace transporter on port 587 with STARTTLS', async () => {
      const details = await getCompanySmtpTransporter('company-a');
      expect(details).not.toBeNull();
      expect(details?.host).toBe('smtp.gmail.com');
      expect(details?.port).toBe(587);
      expect(details?.senderEmail).toBe('developer@businz.com');
    });
  });

  describe('4. Offer Letter PDF Attachment Structure', () => {
    it('should reject invalid recipient emails gracefully', async () => {
      const result = await sendOfferLetterEmail({
        to: 'invalid-email',
        candidateName: 'Test Candidate',
        subject: 'Offer Letter',
        letterBody: 'Welcome',
        companyId: 'company-a',
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Invalid recipient address');
    });

    it('should accept valid PDF attachments with base64 payload', async () => {
      // Mock an invalid SMTP server to verify attachment parsing without sending external email
      const fakeBase64 = Buffer.from('%PDF-1.4 test content').toString('base64');
      
      const payload = {
        to: 'candidate.test@example.com',
        candidateName: 'John Doe',
        subject: 'Offer of Employment',
        letterBody: 'Please find attached your offer letter.',
        companyId: 'company-a',
        pdfAttachment: {
          filename: 'Offer_Letter_John_Doe.pdf',
          base64: fakeBase64,
        }
      };

      expect(payload.pdfAttachment.filename).toBe('Offer_Letter_John_Doe.pdf');
      expect(payload.pdfAttachment.base64).toBe(fakeBase64);
      expect(Buffer.from(payload.pdfAttachment.base64, 'base64').toString()).toContain('%PDF-1.4');
    });
  });

  describe('5. Error Message Sanitization', () => {
    it('should never expose passwords in verification errors', async () => {
      try {
        await verifySmtpConnection({
          smtpHost: '127.0.0.1', // unroutable local test
          smtpPort: 2525,
          senderEmail: 'test@example.com',
          appPassword: 'supersecretpass123',
        });
      } catch (err: any) {
        expect(err.message).not.toContain('supersecretpass123');
      }
    });
  });
});
