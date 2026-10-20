import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEmployeeVerifiedContext } from '../src/controllers/aiController.js';
import { employeeRepository } from '../src/repositories/employeeRepository.js';
import { leaveRepository } from '../src/repositories/leaveRepository.js';
import { attendanceRepository } from '../src/repositories/attendanceRepository.js';
import { shiftRepository } from '../src/repositories/shiftRepository.js';
import { authRepository } from '../src/repositories/authRepository.js';
import { sendCredentialEmail, sendPasswordResetOtpEmail } from '../src/services/emailService.js';

describe('Chatbot Precision & Deterministic Integrity Suite (Requirements 1 - 10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Req 2 & 4: Retrieves employee-specific answers and calculates leave balances in code, not AI', async () => {
    vi.spyOn(employeeRepository, 'getEmployeeById').mockResolvedValue({
      id: 'EMP-007',
      employeeId: 'EMP-007',
      firstName: 'Murugan',
      lastName: 'K',
      department: 'Engineering & Design',
      designation: 'Senior Developer',
      status: 'Active',
      workShift: 'General Shift',
    } as any);

    vi.spyOn(authRepository, 'findByIdentifier').mockResolvedValue({
      employeeId: 'EMP-007',
      credentialEmailStatus: 'SENT',
      credentialEmailSentAt: '2026-10-15T09:30:00Z',
    } as any);

    vi.spyOn(shiftRepository, 'getShifts').mockResolvedValue([
      {
        id: 'SH-01',
        shiftName: 'General Shift',
        startTime: '09:00',
        endTime: '18:00',
        workingHours: 8.25,
        gracePeriodMins: 15,
        breakDurationMins: 45,
      } as any,
    ]);

    // 3 approved Casual leaves, 1 Sick leave, 0 Earned leaves
    vi.spyOn(leaveRepository, 'getLeaves').mockImplementation(async (filter?: any) => {
      if (filter?.status === 'Pending') return [];
      return [
        { id: 'l1', employeeId: 'EMP-007', leaveType: 'Casual Leave', daysCount: 2, status: 'Approved' },
        { id: 'l2', employeeId: 'EMP-007', leaveType: 'Casual Leave', daysCount: 1, status: 'Approved' },
        { id: 'l3', employeeId: 'EMP-007', leaveType: 'Sick Leave', daysCount: 1, status: 'Approved' },
      ] as any;
    });

    vi.spyOn(attendanceRepository, 'getAttendanceLogs').mockResolvedValue([
      { id: 'a1', employeeId: 'EMP-007', date: '2026-10-01', status: 'Present', workingHours: 8.25 },
      { id: 'a2', employeeId: 'EMP-007', date: '2026-10-02', status: 'Present', workingHours: 8.25 },
      { id: 'a3', employeeId: 'EMP-007', date: '2026-10-03', status: 'Present', workingHours: 8.25 },
      { id: 'a4', employeeId: 'EMP-007', date: '2026-10-04', status: 'Late', lateStatus: 'Late (10m)', workingHours: 8.0 },
    ] as any);

    const req: any = {
      user: { employeeId: 'EMP-007', role: 'Employee', company_id: 'company-a' },
      query: { month: '2026-10' },
      body: {},
    };

    let result: any = null;
    const res: any = {
      json: vi.fn((data) => { result = data; }),
      status: vi.fn().mockReturnThis(),
    };

    await getEmployeeVerifiedContext(req, res);

    expect(result.success).toBe(true);
    const { leaveBalances, attendanceTotals, shift } = result.data;

    // Quotas: CL: 12, SL: 10, EL: 15
    // Used: CL: 3, SL: 1, EL: 0
    expect(leaveBalances.casual.remaining).toBe(9); // 12 - 3
    expect(leaveBalances.sick.remaining).toBe(9);   // 10 - 1
    expect(leaveBalances.earned.remaining).toBe(15); // 15 - 0
    expect(leaveBalances.totalRemaining).toBe(33);  // 9 + 9 + 15

    // Attendance totals calculated in code
    expect(attendanceTotals.presentDays).toBe(3);
    expect(attendanceTotals.lateDays).toBe(1);
    expect(attendanceTotals.absentDays).toBe(0);
    expect(attendanceTotals.totalWorkingHours).toBe(32.8);

    // Shift verified
    expect(shift.shiftName).toBe('General Shift');
    expect(shift.startTime).toBe('09:00');
    expect(shift.endTime).toBe('18:00');
    expect(shift.gracePeriodMins).toBe(15);
  });

  it('Req 5 & 6: Never invents balances or attendance totals when records do not exist', async () => {
    vi.spyOn(employeeRepository, 'getEmployeeById').mockResolvedValue(null);
    vi.spyOn(authRepository, 'findByIdentifier').mockResolvedValue(null);
    vi.spyOn(shiftRepository, 'getShifts').mockResolvedValue([]);
    vi.spyOn(leaveRepository, 'getLeaves').mockResolvedValue([]);
    vi.spyOn(attendanceRepository, 'getAttendanceLogs').mockResolvedValue([]);

    const req: any = {
      user: { employeeId: 'EMP-UNKNOWN', role: 'Employee', company_id: 'company-a' },
      query: { month: '2026-10' },
      body: {},
    };

    let result: any = null;
    const res: any = {
      json: vi.fn((data) => { result = data; }),
      status: vi.fn().mockReturnThis(),
    };

    await getEmployeeVerifiedContext(req, res);

    expect(result.success).toBe(true);
    // When employee not in DB, employee is null and shift is null
    expect(result.data.employee).toBeNull();
    expect(result.data.shift).toBeNull();
    // Attendance totals must be 0, never invent fake numbers
    expect(result.data.attendanceTotals.hasDataForMonth).toBe(false);
    expect(result.data.attendanceTotals.presentDays).toBe(0);
    expect(result.data.attendanceTotals.lateDays).toBe(0);
    expect(result.data.attendanceTotals.absentDays).toBe(0);
    expect(result.data.verifiedFacts).toContain('Not configured / cannot be verified');
  });

  it('Req 8: Treats employee messages as input, not permission to bypass access rules', async () => {
    vi.spyOn(employeeRepository, 'getEmployeeById').mockImplementation(async (id: string) => {
      return {
        id,
        employeeId: id,
        firstName: id === 'EMP-007' ? 'Murugan' : 'CEO',
        lastName: 'User',
        department: 'Tech',
        designation: 'Staff',
      } as any;
    });

    vi.spyOn(authRepository, 'findByIdentifier').mockResolvedValue(null);
    vi.spyOn(shiftRepository, 'getShifts').mockResolvedValue([]);
    vi.spyOn(leaveRepository, 'getLeaves').mockResolvedValue([]);
    vi.spyOn(attendanceRepository, 'getAttendanceLogs').mockResolvedValue([]);

    // Regular employee tries to query another employee EMP-999
    const req: any = {
      user: { employeeId: 'EMP-007', role: 'Employee', company_id: 'company-a' },
      query: { employeeId: 'EMP-999' },
      body: { employeeId: 'EMP-999' },
    };

    let result: any = null;
    const res: any = {
      json: vi.fn((data) => { result = data; }),
      status: vi.fn().mockReturnThis(),
    };

    await getEmployeeVerifiedContext(req, res);

    expect(result.success).toBe(true);
    // Must remain strictly locked to authenticated employee EMP-007
    expect(result.data.employee.employeeId).toBe('EMP-007');
  });

  it('Req 9: Only reports an email as sent after backend mail service accepts it', async () => {
    // Calling sendCredentialEmail without valid SMTP transporter configured
    const unconfiguredResult = await sendCredentialEmail({
      to: 'employee@test.com',
      employeeName: 'Murugan',
      employeeCode: 'EMP-007',
      temporaryPassword: 'TempPassword123',
    });

    // When mail server fails or rejects authentication, it must NOT report SENT
    expect(unconfiguredResult.status).toBe('FAILED');
    expect(unconfiguredResult.error).toBeDefined();

    // Same for OTP email
    const otpResult = await sendPasswordResetOtpEmail({
      to: 'employee@test.com',
      employeeName: 'Murugan',
      employeeCode: 'EMP-007',
      otp: '123456',
    });

    expect(otpResult.status).toBe('FAILED');
    expect(otpResult.error).toBeDefined();
  });
});
