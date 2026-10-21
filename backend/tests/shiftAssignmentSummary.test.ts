import { describe, expect, it } from 'vitest';
import { buildShiftAssignmentSummary } from '../src/repositories/shiftRepository.js';

const shifts = [
  { id: 'normal', shift_name: 'NORMAL SHIFT' },
  { id: 'morning', shift_name: 'Morning' },
];

const employee = (id: string, code: string, department = 'HR', overrides: Record<string, unknown> = {}) => ({
  id,
  employee_id: code,
  first_name: code,
  last_name: 'User',
  status: 'Active',
  company_id: 'company-a',
  department: { name: department },
  ...overrides,
});

describe('buildShiftAssignmentSummary', () => {
  it('counts distinct active employees by shift ID and ignores future assignments', () => {
    const rows = [
      { shift_id: 'normal', company_id: 'company-a', effective_from: '2026-01-01', effective_to: '2026-10-19', created_at: '2026-01-01T00:00:00Z', employee: employee('1', 'EMP-001') },
      { shift_id: 'morning', company_id: 'company-a', effective_from: '2026-10-20', effective_to: null, created_at: '2026-10-19T00:00:00Z', employee: employee('1', 'EMP-001') },
      { shift_id: 'normal', company_id: 'company-a', effective_from: '2026-10-21', effective_to: null, created_at: '2026-10-20T00:00:00Z', employee: employee('2', 'EMP-002') },
      { shift_id: 'morning', company_id: 'company-a', effective_from: '2026-01-01', effective_to: null, created_at: '2026-01-01T00:00:00Z', employee: employee('3', 'EMP-003') },
      { shift_id: 'morning', company_id: 'company-a', effective_from: '2026-01-01', effective_to: null, created_at: '2026-01-01T00:00:00Z', employee: employee('3', 'EMP-003') },
    ];

    const result = buildShiftAssignmentSummary(shifts, rows, 'company-a', '2026-10-20');
    expect(result.find(item => item.shiftId === 'normal')?.employees).toEqual([]);
    expect(result.find(item => item.shiftId === 'morning')?.employees.map(item => item.employeeId)).toEqual(['EMP-001', 'EMP-003']);
    expect(result.find(item => item.shiftId === 'morning')?.count).toBe(2);
  });

  it('enforces tenant, active status, and department scope', () => {
    const rows = [
      { shift_id: 'normal', company_id: 'company-a', effective_from: '2026-01-01', employee: employee('1', 'EMP-001', 'HR') },
      { shift_id: 'normal', company_id: 'company-a', effective_from: '2026-01-01', employee: employee('2', 'EMP-002', 'Sales') },
      { shift_id: 'normal', company_id: 'company-b', effective_from: '2026-01-01', employee: employee('3', 'EMP-003', 'HR', { company_id: 'company-b' }) },
      { shift_id: 'normal', company_id: 'company-a', effective_from: '2026-01-01', employee: employee('4', 'EMP-004', 'HR', { status: 'Inactive' }) },
    ];
    const result = buildShiftAssignmentSummary(shifts, rows, 'company-a', '2026-10-20', { level: 'department', department: 'HR' });
    expect(result[0].employees.map(item => item.employeeId)).toEqual(['EMP-001']);
    expect(result[0].count).toBe(result[0].employees.length);
  });
});
