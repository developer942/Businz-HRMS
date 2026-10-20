import { describe, it, expect, vi } from 'vitest';
import { getEmployeeVerifiedContext } from '../src/controllers/aiController.js';
import { employeeRepository } from '../src/repositories/employeeRepository.js';
import { leaveRepository } from '../src/repositories/leaveRepository.js';
import { attendanceRepository } from '../src/repositories/attendanceRepository.js';
import { shiftRepository } from '../src/repositories/shiftRepository.js';
import { authRepository } from '../src/repositories/authRepository.js';

describe('AI Verified Context & Deterministic Calculation Engine Test Suite', () => {
  it('1. Calculates leave balances in backend code, not with AI', async () => {
    vi.spyOn(employeeRepository, 'getEmployeeById').mockResolvedValue({
      id: 'EMP-007',
      employeeId: 'EMP-007',
      firstName: 'Murugan',
      lastName: 'K',
      department: 'Engineering',
      designation: 'Senior Developer',
      status: 'Active',
      workShift: 'Morning Shift',
    } as any);

    vi.spyOn(authRepository, 'findByIdentifier').mockResolvedValue({
      employeeId: 'EMP-007',
      credentialEmailStatus: 'SENT',
      credentialEmailSentAt: '2026-10-15T09:00:00Z',
    } as any);

    vi.spyOn(shiftRepository, 'getShifts').mockResolvedValue([
      {
        id: 'SH-01',
        shiftName: 'Morning Shift',
        startTime: '08:30',
        endTime: '17:30',
        workingHours: 8.0,
        gracePeriodMins: 15,
        breakDurationMins: 60,
      } as any,
    ]);

    // 2 Casual leaves, 1 Sick leave used
    vi.spyOn(leaveRepository, 'getLeaves').mockImplementation(async (filter?: any) => {
      if (filter?.status === 'Pending') return [];
      return [
        { id: 'l1', employeeId: 'EMP-007', leaveType: 'Casual Leave', daysCount: 2, status: 'Approved' },
        { id: 'l2', employeeId: 'EMP-007', leaveType: 'Sick Leave', daysCount: 1, status: 'Approved' },
      ] as any;
    });

    vi.spyOn(attendanceRepository, 'getAttendanceLogs').mockResolvedValue([
      { id: 'a1', employeeId: 'EMP-007', date: '2026-10-01', status: 'Present', workingHours: 8.0 },
      { id: 'a2', employeeId: 'EMP-007', date: '2026-10-02', status: 'Present', workingHours: 8.0 },
      { id: 'a3', employeeId: 'EMP-007', date: '2026-10-03', status: 'Late', lateStatus: 'Late (15m)', workingHours: 7.5 },
    ] as any);

    const req: any = {
      user: { employeeId: 'EMP-007', role: 'Employee', company_id: 'company-a' },
      query: { month: '2026-10' },
      body: {},
    };

    let responseData: any = null;
    const res: any = {
      json: vi.fn((data) => { responseData = data; }),
      status: vi.fn().mockReturnThis(),
    };

    await getEmployeeVerifiedContext(req, res);

    expect(responseData.success).toBe(true);
    const { leaveBalances, attendanceTotals, shift, emailStatus } = responseData.data;

    // Leave balances calculated deterministically
    expect(leaveBalances.casual.quota).toBe(12);
    expect(leaveBalances.casual.used).toBe(2);
    expect(leaveBalances.casual.remaining).toBe(10);

    expect(leaveBalances.sick.quota).toBe(10);
    expect(leaveBalances.sick.used).toBe(1);
    expect(leaveBalances.sick.remaining).toBe(9);

    expect(leaveBalances.earned.quota).toBe(15);
    expect(leaveBalances.earned.used).toBe(0);
    expect(leaveBalances.earned.remaining).toBe(15);

    expect(leaveBalances.totalRemaining).toBe(34); // 10 + 9 + 15

    // Attendance totals calculated in backend code
    expect(attendanceTotals.month).toBe('2026-10');
    expect(attendanceTotals.presentDays).toBe(2);
    expect(attendanceTotals.lateDays).toBe(1);
    expect(attendanceTotals.absentDays).toBe(0);
    expect(attendanceTotals.totalWorkingHours).toBe(23.5);

    // Shift resolved
    expect(shift.shiftName).toBe('Morning Shift');
    expect(shift.startTime).toBe('08:30');

    // Email status verified
    expect(emailStatus.isAccepted).toBe(true);
    expect(emailStatus.status).toBe('SENT');
  });

  it('2. Returns 0 attendance totals without inventing fake 18/3 when month has no data', async () => {
    vi.spyOn(leaveRepository, 'getLeaves').mockResolvedValue([]);
    vi.spyOn(attendanceRepository, 'getAttendanceLogs').mockResolvedValue([]);

    const req: any = {
      user: { employeeId: 'EMP-007', role: 'Employee', company_id: 'company-a' },
      query: { month: '2026-11' },
      body: {},
    };

    let responseData: any = null;
    const res: any = {
      json: vi.fn((data) => { responseData = data; }),
      status: vi.fn().mockReturnThis(),
    };

    await getEmployeeVerifiedContext(req, res);

    expect(responseData.success).toBe(true);
    const { attendanceTotals } = responseData.data;

    // Must be 0, never invent 18 or 3!
    expect(attendanceTotals.presentDays).toBe(0);
    expect(attendanceTotals.lateDays).toBe(0);
    expect(attendanceTotals.absentDays).toBe(0);
    expect(attendanceTotals.hasDataForMonth).toBe(false);
  });

  it('3. Treats employee messages as input, not permission to bypass access rules (RBAC)', async () => {
    // Authenticated as regular employee EMP-007
    // Trying to query someone else's data (EMP-999)
    const req: any = {
      user: { employeeId: 'EMP-007', role: 'Employee', company_id: 'company-a' },
      query: { employeeId: 'EMP-999' }, // Employee trying to access another employee
      body: {},
    };

    let responseData: any = null;
    const res: any = {
      json: vi.fn((data) => { responseData = data; }),
      status: vi.fn().mockReturnThis(),
    };

    await getEmployeeVerifiedContext(req, res);

    expect(responseData.success).toBe(true);
    // Scoped strictly to authenticated employee EMP-007
    expect(responseData.data.employee.employeeId).toBe('EMP-007');
  });

  it('4. Reports email as NOT accepted when status is null or NOT_SENT', async () => {
    vi.spyOn(authRepository, 'findByIdentifier').mockResolvedValue({
      employeeId: 'EMP-007',
      credentialEmailStatus: 'NOT_SENT',
      credentialEmailSentAt: null,
    } as any);

    const req: any = {
      user: { employeeId: 'EMP-007', role: 'Employee', company_id: 'company-a' },
      query: {},
      body: {},
    };

    let responseData: any = null;
    const res: any = {
      json: vi.fn((data) => { responseData = data; }),
      status: vi.fn().mockReturnThis(),
    };

    await getEmployeeVerifiedContext(req, res);

    expect(responseData.success).toBe(true);
    expect(responseData.data.emailStatus.isAccepted).toBe(false);
    expect(responseData.data.emailStatus.status).toBe('NOT_SENT');
    expect(responseData.data.emailStatus.sentAt).toBeNull();
  });
});
