import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
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

  it('full lifecycle simulation preserves serial_number across assign, edit notes, return, and reassign', () => {
    let mockDbRecord: Record<string, any> = {
      id: '9d78733f-59ea-45e5-ae69-34862daeb0f6',
      asset_tag: 'AST-537',
      name: 'VIVO Y19',
      serial_number: '863482049182374',
      status: 'Available',
      assigned_employee_id: null,
      notes: 'Initial stock',
    };

    // 1. Assign to employee A
    const assignPayload = buildAssetPatchPayload({
      assigned_employee_id: 'emp-uuid-1',
      status: 'Assigned',
      assigned_date: '2026-10-29',
    });
    mockDbRecord = { ...mockDbRecord, ...assignPayload };
    expect(mockDbRecord.serial_number).toBe('863482049182374');
    expect(mockDbRecord.status).toBe('Assigned');

    // 2. Edit notes and purchase cost (serialNumber untouched)
    const editNotesPayload = buildAssetPatchPayload({
      notes: 'Updated accessories included',
      purchase_cost: 13500,
    });
    mockDbRecord = { ...mockDbRecord, ...editNotesPayload };
    expect(mockDbRecord.serial_number).toBe('863482049182374');
    expect(mockDbRecord.notes).toBe('Updated accessories included');

    // 3. Return asset
    const returnPayload = buildAssetPatchPayload({
      assigned_employee_id: null,
      status: 'Available',
      assigned_date: null,
    });
    mockDbRecord = { ...mockDbRecord, ...returnPayload };
    expect(mockDbRecord.serial_number).toBe('863482049182374');
    expect(mockDbRecord.status).toBe('Available');
    expect(mockDbRecord.assigned_employee_id).toBeNull();

    // 4. Reassign to employee B
    const reassignPayload = buildAssetPatchPayload({
      assigned_employee_id: 'emp-uuid-2',
      status: 'Assigned',
      assigned_date: '2026-10-30',
    });
    mockDbRecord = { ...mockDbRecord, ...reassignPayload };
    expect(mockDbRecord.serial_number).toBe('863482049182374');
    expect(mockDbRecord.assigned_employee_id).toBe('emp-uuid-2');
  });

  it('audit trigger migration contains SECURITY DEFINER and web_anon grants to prevent SQLSTATE 42501', () => {
    const migrationPath = path.resolve(__dirname, '../../deploy/vps/db/45-asset-audit-trail.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('GRANT SELECT, INSERT ON public.asset_audit_logs TO web_anon');
    expect(sql).toContain('GRANT USAGE, SELECT ON SEQUENCE public.asset_audit_logs_id_seq TO web_anon');
  });
});
