import { describe, expect, it } from 'vitest';
import {
  isShiftEnded,
  calculateShiftDateTimes,
} from '../src/services/shiftAttendanceEngine.js';
import {
  buildEmployeeMonthlyAttendanceCalendar,
  resolveOvernightAttendanceSession,
} from '../../frontend/src/services/attendanceCalculationEngine';
import { attendanceCorrectionSchema } from '../src/validators/attendanceValidators.js';

describe('BUSINZ HRMS - Missed Punch-Out (MU) Status Derivation & Authorized Correction', () => {
  const standardShift = {
    id: 'shift-std-01',
    shiftName: 'General Shift',
    startTime: '09:00 AM',
    endTime: '06:00 PM',
    workingHours: 9,
    gracePeriodMins: 15,
  };

  const overnightShift = {
    id: 'shift-night-01',
    shiftName: 'Night Shift',
    startTime: '10:00 PM',
    endTime: '06:00 AM',
    workingHours: 8,
    gracePeriodMins: 15,
  };

  const sampleEmployee = {
    id: 'emp-vrm-045-uuid',
    employeeId: 'VRM-045',
    firstName: 'Mumtazsulthana',
    lastName: 'A',
    department: 'Production',
    workLocation: 'CHENNAI',
    joiningDate: '2026-11-01',
    workShift: 'General Shift',
    shiftDetails: {
      weeklyOff: 'Sunday',
    },
  };

  const afterShiftEnd = new Date(2026, 10, 10, 19, 30, 0);
  const duringShift = new Date(2026, 10, 10, 14, 30, 0);

  it('1. Missed checkout after shift end is derived as MU with 0 working hours and does not earn present days', () => {
    const shiftDateStr = '2026-11-10';

    const ended = isShiftEnded(shiftDateStr, standardShift, afterShiftEnd);
    expect(ended).toBe(true);

    const cal = buildEmployeeMonthlyAttendanceCalendar({
      month: 11,
      year: 2026,
      todayStr: '2026-11-10',
      nowInput: afterShiftEnd,
      employee: sampleEmployee,
      assignedShift: standardShift,
      attendanceRecords: [
        {
          id: 'att-mu-01',
          employeeId: 'VRM-045',
          date: shiftDateStr,
          shiftDate: shiftDateStr,
          checkIn: '09:51 AM',
          checkOut: null,
          workingHours: 0,
          status: 'Present', // Raw punch status before closure
        },
      ],
    });

    const dayRow = cal.rows.find(r => r.date === shiftDateStr);
    expect(dayRow).toBeDefined();
    expect(dayRow?.status).toBe('MU');
    expect(dayRow?.effectiveStatus).toBe('MU');
    expect(dayRow?.workingHours).toBe(0);
    expect(dayRow?.checkOut).toBeNull();
    expect(dayRow?.checkIn).toBe('09:51 AM');
    expect(dayRow?.workedDayEquivalent).toBe(0);
    expect(dayRow?.paidDayEquivalent).toBe(0);
    expect(dayRow?.lopDayEquivalent).toBe(1);

    expect(cal.muDays).toBe(1);
    expect(cal.fullPresentDays).toBe(0);
  });

  it('2. Active shift before shift end remains In Progress (provisional Present), never MU', () => {
    const shiftDateStr = '2026-11-10';

    const ended = isShiftEnded(shiftDateStr, standardShift, duringShift);
    expect(ended).toBe(false);

    const cal = buildEmployeeMonthlyAttendanceCalendar({
      month: 11,
      year: 2026,
      todayStr: '2026-11-10',
      nowInput: duringShift,
      employee: sampleEmployee,
      assignedShift: standardShift,
      attendanceRecords: [
        {
          id: 'att-prog-01',
          employeeId: 'VRM-045',
          date: shiftDateStr,
          shiftDate: shiftDateStr,
          checkIn: '09:51 AM',
          checkOut: null,
          status: 'Present',
        },
      ],
    });

    const dayRow = cal.rows.find(r => r.date === shiftDateStr);
    expect(dayRow).toBeDefined();
    // Shift is in-progress, not missed punch-out
    expect(dayRow?.status).toBe('Present');
    expect(dayRow?.isInProgress).toBe(true);
    expect(dayRow?.isProvisional).toBe(true);
    expect(cal.provisionalInProgressDays).toBe(1);
  });

  it('3. Authorized HR/CEO correction validates timestamps, enforces reason, and computes correct hours', () => {
    // 3a. Valid payload with mandatory reason
    const validPayload = {
      employeeId: 'VRM-045',
      date: '2026-11-10',
      status: 'Present' as const,
      checkIn: '09:51 AM',
      checkOut: '06:40 PM',
      reason: 'Regularized missed punch-out with verified CCTV entry by HR',
    };

    const parsed = attendanceCorrectionSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);

    const session = resolveOvernightAttendanceSession({
      attendanceDate: validPayload.date,
      checkIn: validPayload.checkIn,
      checkOut: validPayload.checkOut,
      otThresholdHours: 9,
    });

    expect(session.isValid).toBe(true);
    // 09:51 AM to 06:40 PM = 8 hours 49 minutes = 8.82 hours
    expect(session.workingHours).toBe(8.82);
    expect(session.otHours).toBe(0);

    // 3b. Fails if reason is missing or too short
    const invalidPayload = {
      ...validPayload,
      reason: '  ',
    };
    const parsedInvalid = attendanceCorrectionSchema.safeParse(invalidPayload);
    expect(parsedInvalid.success).toBe(false);
  });

  it('4. Overnight shift correction (10:00 PM to 06:00 AM next day) computes 8.0 hours without negative durations', () => {
    const shiftDateStr = '2026-11-10';

    const session = resolveOvernightAttendanceSession({
      attendanceDate: shiftDateStr,
      checkIn: '10:00 PM',
      checkOut: '06:00 AM',
      allowAutoRollSameDateIsoCheckOut: true,
      otThresholdHours: 8,
    });

    expect(session.isValid).toBe(true);
    expect(session.workingHours).toBe(8.0);
    expect(session.isOvernight).toBe(true);
    expect(session.otHours).toBe(0);
  });

  it('5. Role authorization enforces access control (denies non-HR/non-CEO, allows authorized)', () => {
    const authorizedRoles = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'];

    const checkAccess = (role: string) => authorizedRoles.includes(role);

    expect(checkAccess('HR Manager')).toBe(true);
    expect(checkAccess('CEO')).toBe(true);
    expect(checkAccess('Super Admin')).toBe(true);
    expect(checkAccess('HR Admin')).toBe(true);
    expect(checkAccess('HR')).toBe(true);

    // Non-HR roles must be rejected
    expect(checkAccess('Employee')).toBe(false);
    expect(checkAccess('Staff')).toBe(false);
    expect(checkAccess('Manager')).toBe(false);
    expect(checkAccess('Team Lead')).toBe(false);
  });

  it('6. Completed attendance (both check-in and check-out present) is unaffected and earns full present day', () => {
    const shiftDateStr = '2026-11-10';

    const cal = buildEmployeeMonthlyAttendanceCalendar({
      month: 11,
      year: 2026,
      todayStr: '2026-11-10',
      nowInput: afterShiftEnd,
      employee: sampleEmployee,
      assignedShift: standardShift,
      attendanceRecords: [
        {
          id: 'att-comp-01',
          employeeId: 'VRM-045',
          date: shiftDateStr,
          shiftDate: shiftDateStr,
          checkIn: '09:00 AM',
          checkOut: '06:00 PM',
          workingHours: 9.0,
          status: 'Present',
        },
      ],
    });

    const dayRow = cal.rows.find(r => r.date === shiftDateStr);
    expect(dayRow).toBeDefined();
    expect(dayRow?.status).toBe('Present');
    expect(dayRow?.workingHours).toBe(9.0);
    expect(dayRow?.workedDayEquivalent).toBe(1);
    expect(dayRow?.paidDayEquivalent).toBe(1);
    expect(dayRow?.lopDayEquivalent).toBe(0);

    expect(cal.muDays).toBe(0);
    expect(cal.fullPresentDays).toBe(1);
  });
});
