import { describe, expect, it } from 'vitest';
import { saveCustomerSchema } from '../src/validators/customerValidators.js';
import { customerController } from '../src/controllers/customerController.js';
import { customerRepository } from '../src/repositories/customerRepository.js';
import { vi } from 'vitest';

const validBase = {
  customerName: 'S. Sangeetha',
  contactNumber: '98765 43210',
  consentStatus: 'Unknown' as const
};

describe('customer contact validation', () => {
  it.each(['', '   ', '123456', '%%%'])('rejects invalid customer name %j', customerName => {
    expect(saveCustomerSchema.safeParse({ ...validBase, customerName }).success).toBe(false);
  });

  it.each(['தமிழரசி', "R. O'Neil", 'Anne-Marie D.'])('accepts Unicode names and initials: %s', customerName => {
    expect(saveCustomerSchema.safeParse({ ...validBase, customerName }).success).toBe(true);
  });

  it.each(['3M', 'L&T', 'Studio 54 (India) Pvt. Ltd.'])('accepts real company names: %s', companyName => {
    expect(saveCustomerSchema.safeParse({ ...validBase, companyName }).success).toBe(true);
  });

  it('normalizes Indian, international, and landline numbers as strings', () => {
    const indian = saveCustomerSchema.parse(validBase);
    const international = saveCustomerSchema.parse({ ...validBase, contactNumber: '+44 20 7946 0958' });
    const landline = saveCustomerSchema.parse({ ...validBase, alternateContactNumber: '044-24567890' });
    expect(indian.contactNumber).toBe('+919876543210');
    expect(international.contactNumber).toBe('+442079460958');
    expect(landline.alternateContactNumber).toBe('+914424567890');
    expect(typeof indian.contactNumber).toBe('string');
  });

  it.each(['%%%', '123', '+91 abc'])('rejects invalid primary phone %j', contactNumber => {
    expect(saveCustomerSchema.safeParse({ ...validBase, contactNumber }).success).toBe(false);
  });

  it('validates optional designation, email, and website while preserving full addresses', () => {
    expect(saveCustomerSchema.safeParse({ ...validBase, designation: '123', email: 'bad@', website: 'ftp://example.in' }).success).toBe(false);
    const result = saveCustomerSchema.parse({
      ...validBase,
      designation: 'Director - South 2',
      email: 'sales@example.in',
      website: 'www.example.in',
      address: 'Door No. 12/3-B, L&T Road,\nChennai - 600 032, Tamil Nadu.'
    });
    expect(result.website).toBe('https://www.example.in/');
    expect(result.address).toContain('\n');
  });

  it('derives company and collector identity from the authenticated user', async () => {
    const save = vi.spyOn(customerRepository, 'saveCustomer').mockImplementation(async data => ({
      ...data,
      id: '00000000-0000-4000-8000-000000000001',
      customerId: 'CUST-2026-0001'
    } as any));
    vi.spyOn(customerRepository, 'findDuplicateCustomer').mockResolvedValue(null);
    const req: any = {
      body: {
        ...validBase,
        companyId: 'other-company',
        collectedById: 'spoofed-id',
        collectedByName: 'Spoofed User'
      },
      user: {
        id: '00000000-0000-4000-8000-000000000099',
        name: 'Authenticated Collector',
        company_id: 'company-a'
      }
    };
    const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await customerController.saveCustomer(req, response);

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-a',
      collectedById: '00000000-0000-4000-8000-000000000099',
      collectedByName: 'Authenticated Collector'
    }));
    expect(response.status).toHaveBeenCalledWith(201);
    vi.restoreAllMocks();
  });
});
