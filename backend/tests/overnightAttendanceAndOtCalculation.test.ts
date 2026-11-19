import { describe, it, expect } from 'vitest';
import {
  resolveOvernightAttendanceSession as resolveBackendSession,
  evaluateBackendShiftAttendance,
  addDaysToDateStr,
  formatDurationHoursAndMinutes,
} from '../src/services/shiftAttendanceEngine.js';
import { assertAttendanceTransition } from '../src/services/attendanceStateMachine.js';
import {
  resolveOvernightAttendanceSession as resolveFrontendSession,
  calculateAttendanceHoursAndStatus,
  identifyEligibleOvertimeFromAttendance,
  buildEmployeeMonthlyAttendanceCalendar,
  buildEmployeeMonthlyAttendanceOtReport,
} from '../../frontend/src/services/attendanceCalculationEngine.js';
import { evaluateShiftAttendance } from '../../frontend/src/services/shiftAttendanceEngine.js';

const normalShift = {
  id: '37e325d3-8538-4db3-8828-30743f040b91',
  companyId: 'company-a',
  shiftName: 'NORMAL SHIFT',
  startTime: '09:30',
  endTime: '18:30',
  gracePeriodMins: 40,
  breakDurationMins: 0,
  workingHours: 9,
};

const nightShift = {
  id: '99e325d3-8538-4db3-8828-30743f040b99',
  companyId: 'company-a',
  shiftName: 'NIGHT SHIFT',
  startTime: '22:00',
  endTime: '06:00',
  gracePeriodMins: 15,
  breakDurationMins: 0,
  workingHours: 8,
};

describe('Overnight Punch In/Punch Out Working-Hours & Overtime Calculation Engine', () => {
  it('1. Same-day punch: calculates exact working duration and 0 OT when within threshold', () => {
    const res = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:00 AM',
      checkOut: '07:00 PM',
      otThresholdHours: 9,
      unpaidBreakMinutes: 0,
    });

    expect(res.isValid).toBe(true);
    expect(res.isOvernight).toBe(false);
    expect(res.attendanceDate).toBe('2026-11-05');
    expect(res.checkInDate).toBe('2026-11-05');
    expect(res.checkOutDate).toBe('2026-11-05');
    expect(res.elapsedMinutes).toBe(540);
    expect(res.workingHours).toBe(9);
    expect(res.formattedWorkingDuration).toBe('9h 00m');
    expect(res.otMinutes).toBe(0);
    expect(res.otHours).toBe(0);
    expect(res.formattedOtDuration).toBe('0h 00m');
  });

  it('2. Reported Case (Ashok Kumar A, VRM-024): 05/11/2026 10:04 AM to 06/11/2026 01:00 AM -> 14h 56m (14.93 hrs) worked and 5h 56m (5.93 hrs) OT under 9h threshold & 0 unpaid break', () => {
    // Test with time-of-day strings on attendanceDate 2026-11-05
    const backendRes = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:04 AM',
      checkOut: '01:00 AM',
      otThresholdHours: 9,
      unpaidBreakMinutes: 0,
    });

    expect(backendRes.isValid).toBe(true);
    expect(backendRes.isOvernight).toBe(true);
    expect(backendRes.attendanceDate).toBe('2026-11-05');
    expect(backendRes.checkInDate).toBe('2026-11-05');
    expect(backendRes.checkOutDate).toBe('2026-11-06');
    // 2026-11-05T10:04:00+05:30 = 2026-11-05T04:34:00.000Z
    expect(backendRes.checkInIso).toBe('2026-11-05T04:34:00.000Z');
    // 2026-11-06T01:00:00+05:30 = 2026-11-05T19:30:00.000Z
    expect(backendRes.checkOutIso).toBe('2026-11-05T19:30:00.000Z');
    expect(backendRes.elapsedMinutes).toBe(896); // 14 hours 56 minutes
    expect(backendRes.netWorkedMinutes).toBe(896);
    expect(backendRes.workingHours).toBe(14.93);
    expect(backendRes.formattedWorkingDuration).toBe('14h 56m');
    expect(backendRes.otMinutes).toBe(356); // 5 hours 56 minutes
    expect(backendRes.otHours).toBe(5.93);
    expect(backendRes.formattedOtDuration).toBe('5h 56m');

    // Test with legacy broken DB timestamps where check_out was anchored to 2026-11-05 01:00:00+05:30 (2026-11-04T19:30:00.000Z)
    const repairedFromLegacyIso = resolveFrontendSession({
      attendanceDate: '2026-11-05',
      checkIn: '2026-11-05T04:34:00.000Z',
      checkOut: '2026-11-04T19:30:00.000Z',
      otThresholdHours: 9,
      unpaidBreakMinutes: 0,
      allowAutoRollSameDateIsoCheckOut: true,
    });

    expect(repairedFromLegacyIso.isValid).toBe(true);
    expect(repairedFromLegacyIso.isOvernight).toBe(true);
    expect(repairedFromLegacyIso.checkOutDate).toBe('2026-11-06');
    expect(repairedFromLegacyIso.checkOutIso).toBe('2026-11-05T19:30:00.000Z');
    expect(repairedFromLegacyIso.elapsedMinutes).toBe(896);
    expect(repairedFromLegacyIso.workingHours).toBe(14.93);
    expect(repairedFromLegacyIso.formattedWorkingDuration).toBe('14h 56m');
    expect(repairedFromLegacyIso.otMinutes).toBe(356);
    expect(repairedFromLegacyIso.otHours).toBe(5.93);
    expect(repairedFromLegacyIso.formattedOtDuration).toBe('5h 56m');
  });

  it('3. Night shift 10:00 PM to next-day 06:00 AM: calculates 8h 00m and associates punch-out with original shift date', () => {
    const res = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:00 PM',
      checkOut: '06:00 AM',
      otThresholdHours: 8,
      unpaidBreakMinutes: 0,
    });

    expect(res.isValid).toBe(true);
    expect(res.isOvernight).toBe(true);
    expect(res.attendanceDate).toBe('2026-11-05');
    expect(res.checkInDate).toBe('2026-11-05');
    expect(res.checkOutDate).toBe('2026-11-06');
    expect(res.elapsedMinutes).toBe(480);
    expect(res.workingHours).toBe(8);
    expect(res.formattedWorkingDuration).toBe('8h 00m');
    expect(res.otHours).toBe(0);

    // Verify shift window evaluation at 01:00 AM on 2026-11-06 keeps 2026-11-05 open session active for Punch Out
    const wallAt1Am = new Date(2026, 10, 6, 1, 0, 0);
    const evalDayShiftOvernight = evaluateBackendShiftAttendance({
      employeeId: 'VRM-024',
      assignedShift: normalShift,
      attendanceLogs: [
        {
          id: '3025b552-baa0-413a-9ee4-7411c514c338',
          employeeId: 'VRM-024',
          employeeName: 'Ashok Kumar A',
          date: '2026-11-05',
          shiftDate: '2026-11-05',
          checkIn: '10:04',
          checkOut: undefined,
          workingHours: 0,
          status: 'Present',
          lateStatus: 'On Time',
          method: 'Face Scan',
          inGeofence: true,
        },
      ],
      now: wallAt1Am,
      useTimeZoneWallClock: false,
    });

    expect(evalDayShiftOvernight.state).toBe('CHECKED_IN');
    expect(evalDayShiftOvernight.canCheckOut).toBe(true);
    expect(evalDayShiftOvernight.canCheckIn).toBe(false);
    expect(evalDayShiftOvernight.shiftDate).toBe('2026-11-05');

    const frontendEvalAt1Am = evaluateShiftAttendance({
      employee: { id: 'emp-24', employeeId: 'VRM-024', firstName: 'Ashok Kumar', lastName: 'A', workShift: 'NORMAL SHIFT' } as any,
      shifts: [normalShift as any],
      attendanceRecords: [
        {
          id: '3025b552-baa0-413a-9ee4-7411c514c338',
          employeeId: 'VRM-024',
          employeeName: 'Ashok Kumar A',
          department: 'Production',
          date: '2026-11-05',
          shiftDate: '2026-11-05',
          checkIn: '10:04 AM',
          checkOut: null,
          workingHours: 0,
          status: 'Present',
          lateStatus: 'On Time',
          method: 'Face Scan',
        } as any,
      ],
      now: wallAt1Am,
    });
    expect(frontendEvalAt1Am.state).toBe('CHECKED_IN');
    expect(frontendEvalAt1Am.canCheckOut).toBe(true);
    expect(frontendEvalAt1Am.shiftDate).toBe('2026-11-05');
  });

  it('4. Missing punch-out: returns 0 working hours and 0 OT without negative duration', () => {
    const res = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:04 AM',
      checkOut: null,
      otThresholdHours: 9,
    });

    expect(res.isValid).toBe(false);
    expect(res.errorCode).toBe('MISSING_CHECK_OUT');
    expect(res.workingHours).toBe(0);
    expect(res.otHours).toBe(0);
    expect(res.elapsedMinutes).toBe(0);
  });

  it('5. Duplicate punch protection: blocks duplicate Check-In and duplicate Check-Out', () => {
    const checkInInstant = new Date('2026-11-05T04:34:00.000Z');
    const checkOutInstant = new Date('2026-11-05T19:30:00.000Z');

    // Duplicate Check-In when already checked in
    expect(() =>
      assertAttendanceTransition({
        type: 'IN',
        row: { check_in: checkInInstant.toISOString(), check_out: null },
        serverNow: new Date('2026-11-05T05:00:00.000Z'),
        newPhotoFingerprint: 'fp-2',
        checkInPhotoFingerprint: 'fp-1',
      })
    ).toThrow(/Duplicate check-in is not allowed/i);

    // Duplicate Check-Out when already checked out
    expect(() =>
      assertAttendanceTransition({
        type: 'OUT',
        row: { check_in: checkInInstant.toISOString(), check_out: checkOutInstant.toISOString() },
        serverNow: new Date('2026-11-05T20:00:00.000Z'),
        newPhotoFingerprint: 'fp-3',
        checkInPhotoFingerprint: 'fp-1',
      })
    ).toThrow(/Duplicate check-out is not allowed/i);
  });

  it('6. Invalid reversed timestamps: does NOT blindly add 24 hours when reversed time exceeds max session length or has explicit earlier date', () => {
    // Reversed same-day typo: Check-In 09:32 AM, Check-Out 07:30 AM (rolling +24h would be 21h 58m > 18h limit)
    const reversedMorning = resolveBackendSession({
      attendanceDate: '2026-11-11',
      checkIn: '09:32 AM',
      checkOut: '07:30 AM',
      otThresholdHours: 9,
    });
    expect(reversedMorning.isValid).toBe(false);
    expect(reversedMorning.errorCode).toBe('INVALID_REVERSED_TIMESTAMPS');
    expect(reversedMorning.workingHours).toBe(0);
    expect(reversedMorning.otHours).toBe(0);

    // Reversed same-day typo: Check-In 10:00 PM, Check-Out 07:30 PM (rolling +24h would be 21h 30m > 18h limit)
    const reversedEvening = resolveBackendSession({
      attendanceDate: '2026-11-07',
      checkIn: '10:00 PM',
      checkOut: '07:30 PM',
      otThresholdHours: 9,
    });
    expect(reversedEvening.isValid).toBe(false);
    expect(reversedEvening.errorCode).toBe('INVALID_REVERSED_TIMESTAMPS');
    expect(reversedEvening.workingHours).toBe(0);
    expect(reversedEvening.otHours).toBe(0);

    // Explicit earlier calendar date on checkOutDate (2026-11-04 check-out for 2026-11-05 check-in)
    const explicitEarlierDate = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:04 AM',
      checkOut: '01:00 PM',
      checkOutDate: '2026-11-04',
      otThresholdHours: 9,
    });
    expect(explicitEarlierDate.isValid).toBe(false);
    expect(explicitEarlierDate.errorCode).toBe('INVALID_REVERSED_TIMESTAMPS');
    expect(explicitEarlierDate.workingHours).toBe(0);
    expect(explicitEarlierDate.otHours).toBe(0);
  });

  it('7. Unpaid breaks: deducts unpaid breaks only when configured by policy', () => {
    // 10:04 AM to 01:00 AM next day (896 mins = 14h 56m) with 60m unpaid break -> 836 mins (13h 56m = 13.93 hrs), OT = 296 mins (4h 56m = 4.93 hrs)
    const withUnpaidBreak = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:04 AM',
      checkOut: '01:00 AM',
      unpaidBreakMinutes: 60,
      otThresholdHours: 9,
    });

    expect(withUnpaidBreak.isValid).toBe(true);
    expect(withUnpaidBreak.elapsedMinutes).toBe(896);
    expect(withUnpaidBreak.breakDeductedMinutes).toBe(60);
    expect(withUnpaidBreak.netWorkedMinutes).toBe(836);
    expect(withUnpaidBreak.workingHours).toBe(13.93);
    expect(withUnpaidBreak.formattedWorkingDuration).toBe('13h 56m');
    expect(withUnpaidBreak.otMinutes).toBe(296);
    expect(withUnpaidBreak.otHours).toBe(4.93);
    expect(withUnpaidBreak.formattedOtDuration).toBe('4h 56m');
  });

  it('8. Varying OT thresholds, minimum OT duration, rounding, daily cap, and OT eligibility', () => {
    // 8-hour threshold on 14h 56m session -> 6h 56m (6.93 hrs) OT
    const threshold8h = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:04 AM',
      checkOut: '01:00 AM',
      otThresholdHours: 8,
    });
    expect(threshold8h.otMinutes).toBe(416);
    expect(threshold8h.otHours).toBe(6.93);
    expect(threshold8h.formattedOtDuration).toBe('6h 56m');

    // 8.5-hour threshold on 14h 56m session -> 6h 26m (6.43 hrs) OT
    const threshold85h = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:04 AM',
      checkOut: '01:00 AM',
      otThresholdHours: 8.5,
    });
    expect(threshold85h.otMinutes).toBe(386);
    expect(threshold85h.otHours).toBe(6.43);
    expect(threshold85h.formattedOtDuration).toBe('6h 26m');

    // OT disabled for department/employee -> 0 OT
    const otDisabled = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:04 AM',
      checkOut: '01:00 AM',
      otThresholdHours: 9,
      otEligible: false,
    });
    expect(otDisabled.workingHours).toBe(14.93);
    expect(otDisabled.otMinutes).toBe(0);
    expect(otDisabled.otHours).toBe(0);

    // 30-minute rounding on 5h 56m (356 mins) -> 5h 30m (330 mins = 5.5 hrs)
    const rounded30m = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:04 AM',
      checkOut: '01:00 AM',
      otThresholdHours: 9,
      otRoundingMinutes: 30,
    });
    expect(rounded30m.otMinutes).toBe(330);
    expect(rounded30m.otHours).toBe(5.5);
    expect(rounded30m.formattedOtDuration).toBe('5h 30m');
  });

  it('9. Multiple shifts & no double-counting on the next calendar date', () => {
    // 05/11/2026 overnight punch-out at 01:00 AM on 06/11/2026 must not overlap 06/11/2026 10:02 AM check-in
    const validBeforeNextShift = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:04 AM',
      checkOut: '01:00 AM',
      nextDayCheckIn: '10:02 AM',
      otThresholdHours: 9,
    });
    expect(validBeforeNextShift.isValid).toBe(true);
    expect(validBeforeNextShift.workingHours).toBe(14.93);
    expect(validBeforeNextShift.otHours).toBe(5.93);

    // If an overnight checkout (e.g. 11:00 AM next day) overlaps next day's check-in (10:02 AM), reject it
    const overlappingNextShift = resolveBackendSession({
      attendanceDate: '2026-11-05',
      checkIn: '10:00 PM',
      checkOut: '11:00 AM',
      nextDayCheckIn: '10:02 AM',
      otThresholdHours: 9,
    });
    expect(overlappingNextShift.isValid).toBe(false);
    expect(overlappingNextShift.errorCode).toBe('OVERLAPS_NEXT_SHIFT');

    // Verify monthly calendar credits 14.93 hrs strictly to 2026-11-05 and 10.97 hrs strictly to 2026-11-06 without double-counting
    const emp = {
      id: '57a2379f-b4ff-4bae-9604-a253eefe438f',
      employeeId: 'VRM-024',
      firstName: 'Ashok Kumar',
      lastName: 'A',
      department: 'Production',
      designation: 'Dispatch Loading',
      joiningDate: '2024-01-01',
      status: 'Active',
      workShift: 'NORMAL SHIFT',
      basicSalary: 6000,
      grossSalary: 15000,
    } as any;

    const cal = buildEmployeeMonthlyAttendanceCalendar({
      employee: emp,
      month: '2026-11',
      attendanceRecords: [
        {
          id: '3025b552-baa0-413a-9ee4-7411c514c338',
          employeeId: 'VRM-024',
          employeeName: 'Ashok Kumar A',
          department: 'Production',
          date: '2026-11-05',
          shiftDate: '2026-11-05',
          checkIn: '10:04 AM',
          checkOut: '01:00 AM',
          workingHours: -9.07, // Even if legacy record had -9.07, calendar engine repairs it to 14.93
          status: 'Present',
        },
        {
          id: '7da3e187-5551-4e0a-8208-d187677f6494',
          employeeId: 'VRM-024',
          employeeName: 'Ashok Kumar A',
          department: 'Production',
          date: '2026-11-06',
          shiftDate: '2026-11-06',
          checkIn: '10:02 AM',
          checkOut: '09:00 PM',
          workingHours: 10.97,
          status: 'Present',
        },
      ],
      leaveRequests: [],
      holidays: [],
      weeklySchedules: [],
      todayStr: '2026-11-06',
    });

    const nov5Row = cal.rows.find(r => r.date === '2026-11-05')!;
    const nov6Row = cal.rows.find(r => r.date === '2026-11-06')!;
    expect(nov5Row.workingHours).toBe(14.93);
    expect(nov6Row.workingHours).toBe(10.97);
  });

  it('10. Month-end midnight crossing: 30/11/2026 10:00 PM to 01/12/2026 02:00 AM stays credited to November (2026-11-30)', () => {
    expect(addDaysToDateStr('2026-11-30', 1)).toBe('2026-12-01');
    const monthEndSession = resolveBackendSession({
      attendanceDate: '2026-11-30',
      checkIn: '10:00 PM',
      checkOut: '02:00 AM',
      otThresholdHours: 9,
    });

    expect(monthEndSession.isValid).toBe(true);
    expect(monthEndSession.isOvernight).toBe(true);
    expect(monthEndSession.attendanceDate).toBe('2026-11-30');
    expect(monthEndSession.checkInDate).toBe('2026-11-30');
    expect(monthEndSession.checkOutDate).toBe('2026-12-01');
    expect(monthEndSession.checkInIso).toBe('2026-11-30T16:30:00.000Z');
    expect(monthEndSession.checkOutIso).toBe('2026-11-30T20:30:00.000Z');
    expect(monthEndSession.elapsedMinutes).toBe(240);
    expect(monthEndSession.workingHours).toBe(4);
    expect(monthEndSession.formattedWorkingDuration).toBe('4h 00m');
  });
});
