import { describe, expect, it } from 'vitest';
import { buildAssetPatchPayload } from '../../frontend/src/services/supabaseDirectService.js';

describe('Asset PATCH payload – serial number must survive assignment (29 Oct 2026 root cause)', () => {
  it('assignment payload contains ONLY assignment columns (serial/purchase/warranty/notes untouched)', () => {
    const body = buildAssetPatchPayload({
      assigned_employee_id: 'd252d7a5-2417-4dc6-8314-4caa8f6fc76a',
      status: 'Assigned',
      assigned_date: '2026-10-29',
    });
    expect(Object.keys(body).sort()).toEqual(['assigned_date', 'assigned_employee_id', 'status']);
    for (const k of ['serial_number', 'purchase_date', 'warranty_expiry', 'notes', 'assigned_department_id']) {
      expect(k in body).toBe(false); // previously these were sent as null and wiped in PostgreSQL
    }
  });

  it('return (unassign) payload clears only the assignment', () => {
    const body = buildAssetPatchPayload({ assigned_employee_id: null, status: 'Available', assigned_date: null });
    expect(body).toEqual({ assigned_employee_id: null, status: 'Available', assigned_date: null });
    expect('serial_number' in body).toBe(false);
  });

  it('undefined values are omitted, explicit empty strings on nullable columns become NULL', () => {
    const body = buildAssetPatchPayload({ serial_number: '', notes: undefined, name: 'VIVO Y19' });
    expect(body).toEqual({ serial_number: null, name: 'VIVO Y19' });
  });

  it('an authorized edit keeps the entered serial number exactly', () => {
    const body = buildAssetPatchPayload({ serial_number: 'OJFY9LS0UWN79PSS', notes: 'edited' });
    expect(body.serial_number).toBe('OJFY9LS0UWN79PSS');
  });
});

