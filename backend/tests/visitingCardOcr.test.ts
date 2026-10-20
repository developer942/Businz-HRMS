import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { validateExtractedCardData } from '../src/utils/cardValidator.js';
import { ocrService } from '../src/services/ocrService.js';
import dotenv from 'dotenv';

dotenv.config();

describe('Visiting Card OCR Regression & Validation Engine Tests', () => {
  // Unit Tests for Step 6 Validation Engine
  describe('cardValidator Unit Tests', () => {
    it('should reject noisy / corrupt customer names (e.g. "ISI", symbols, phone numbers)', () => {
      const result1 = validateExtractedCardData({
        customer_name: 'ISI',
        company_name: 'VRM STRUCTURES',
        contact_number: '9884630789'
      });
      expect(result1.fields.customerName.status).toBe('needs_review');
      expect(result1.fields.customerName.reviewReason).toBeDefined();

      const result2 = validateExtractedCardData({
        customer_name: '+91 98846 30789',
        company_name: 'VRM STRUCTURES',
        contact_number: '9884630789'
      });
      expect(result2.fields.customerName.status).toBe('needs_review');
      expect(result2.fields.customerName.value).toBeNull();
      expect(result2.customerName).toBe('');
    });

    it('should allow valid Indian names with initials (e.g. "S. Sangeetha", "A. P. J. Abdul Kalam")', () => {
      const result = validateExtractedCardData({
        customer_name: 'S. Sangeetha',
        company_name: 'VRM STRUCTURES INDIA PRIVATE LIMITED',
        contact_number: '+91 98846 30789'
      });
      expect(result.fields.customerName.status).toBe('valid');
      expect(result.customerName).toBe('S. Sangeetha');
    });

    it('should sanitize OCR noise from company names (e.g. "2 -=5 VRM STRUCTURES INDIA PVT LTD. n")', () => {
      const result = validateExtractedCardData({
        customer_name: 'S. Sangeetha',
        company_name: '2 -=5 VRM STRUCTURES INDIA PVT LTD. n',
        contact_number: '+91 98846 30789'
      });
      // Should clean leading "2 -=5" noise and trailing ". n"
      expect(result.companyName).toContain('VRM STRUCTURES INDIA PVT LTD');
      expect(result.companyName).not.toContain('2 -=5');
    });

    it('should validate and normalize phone numbers (e.g. "+91 98846 30789" -> "+91 98846 30789")', () => {
      const result = validateExtractedCardData({
        customer_name: 'S. Sangeetha',
        contact_number: '+91 98846 30789'
      });
      expect(result.fields.contactNumber.status).toBe('valid');
      expect(result.contactNumber).toBe('+91 98846 30789');
    });

    it('should validate website and email formats', () => {
      const result = validateExtractedCardData({
        customer_name: 'S. Sangeetha',
        contact_number: '+91 98846 30789',
        email: 'scm@vrmstructures.in',
        website: 'www.vrmstructures.in'
      });
      expect(result.fields.email.status).toBe('valid');
      expect(result.fields.website.status).toBe('valid');
      expect(result.email).toBe('scm@vrmstructures.in');
      expect(result.website).toBe('www.vrmstructures.in');
    });

    it('should flag corrupted address text and require review', () => {
      const result = validateExtractedCardData({
        customer_name: 'S. Sangeetha',
        contact_number: '+91 98846 30789',
        address: 'IIE Fria) No.u4, Secretariat Offi EE'
      });
      expect(result.fields.address.status).toBe('needs_review');
    });
  });

  // End-to-End Gemini OCR Extraction Test with Provided Regression Card
  describe('E2E Visiting Card OCR Regression Test with Gemini', () => {
    const cardImagePath = 'C:\\Users\\ahile\\.gemini\\antigravity-ide\\brain\\c9e41194-27c6-4f17-9502-e1d2ee12f177\\.user_uploaded\\media_1792137886438.jpg';

    it('should successfully extract all fields from the regression card image', async () => {
      if (!fs.existsSync(cardImagePath)) {
        console.warn('Regression card image not found at', cardImagePath);
        return;
      }

      const imageBuffer = fs.readFileSync(cardImagePath);
      const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

      const result = await ocrService.extractCardDetails(base64Image, 'image/jpeg');

      expect(result).toBeDefined();
      expect(result.extractionEngine).toBe('gemini');

      // Regression Ground Truth Checks:
      // Customer Name: S. Sangeetha
      expect(result.customerName).toBe('S. Sangeetha');
      expect(result.fields.customerName.status).toBe('valid');

      // Company Name: VRM STRUCTURES INDIA PRIVATE LIMITED
      expect(result.companyName?.toUpperCase()).toContain('VRM STRUCTURES');
      expect(result.fields.companyName.status).toBe('valid');

      // Designation: Purchase office
      expect(result.designation?.toLowerCase()).toContain('purchase');

      // Contact Number: 98846 30789
      expect(result.contactNumber).toContain('98846');
      expect(result.fields.contactNumber.status).toBe('valid');

      // Email: scm@vrmstructures.in
      expect(result.email).toBe('scm@vrmstructures.in');
      expect(result.fields.email.status).toBe('valid');

      // Website: www.vrmstructures.in
      expect(result.website).toContain('vrmstructures.in');
      expect(result.fields.website.status).toBe('valid');

      // Address: GNT Road, Nagappa Industrial Estate, Puzhal, Chennai 600066
      expect(result.address).toContain('Nagappa');
      expect(result.address).toContain('600');
      expect(result.fields.address.status).toBe('valid');
    }, 45000);
  });
});
