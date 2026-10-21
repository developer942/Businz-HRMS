import { describe, expect, it } from 'vitest';
import { createExpenseSchema } from '../src/validators/expenseValidators.js';

const valid = { category: 'Travel', amount: 1500, date: '2026-10-20', description: 'Client travel', receiptUrl: 'data:image/png;base64,dGVzdA==' };

describe('expense claim validation', () => {
  it('accepts a valid past expense date', () => {
    expect(createExpenseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid and non-leap dates', () => {
    expect(createExpenseSchema.safeParse({ ...valid, date: '2025-02-29' }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...valid, date: '20-10-2026' }).success).toBe(false);
  });

  it('requires a receipt and enforces the claim limit', () => {
    expect(createExpenseSchema.safeParse({ ...valid, receiptUrl: '' }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...valid, amount: 100001 }).success).toBe(false);
  });
});
