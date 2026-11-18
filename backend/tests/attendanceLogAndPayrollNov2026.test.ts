import { describe, expect, it } from 'vitest';
import {
  buildEmployeeMonthlyAttendanceCalendar,
  calculateCalendarDayPayrollAttendance,
  isDateCompanyPaidHoliday,
} from '../../frontend/src/services/attendanceCalculationEngine';
import { getMonthInfo } from '../../frontend/src/utils/monthUtils';

describe('BUSINZ HRMS Attendance Log, Dashboard Summary & Payroll Calculation Engine', () => {
  const employee = {
    id: '2aca9794-144a-48ea-b80f-d8cac0571bcb',
    employeeId: 'VRM-027',
    firstName: 'Ahilesh',
    lastName: 'K',
    department: 'DEVELOPER',
    workLocation: 'Plant HQ',
    joiningDate: '2025-01-01',
    shiftDetails: {
      weeklyOff: 'Sunday',
    },
  };

  const nov2026Holidays = [
    {
      id: 'HOL-DIWALI-2026',
      name: 'Diwali',
      date: '2026-11-09',
      type: 'National',
      applicableLocation: 'All Sites & HQ',
      paidStatus: 'Paid',
    },
  ];

  const nov2026AttendanceRecords = [
    { id: 'att-02', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-02', shiftDate: '2026-11-02', checkIn: '09:30', checkOut: '19:01', workingHours: 9.52, status: 'Present', lateStatus: 'On Time' },
    { id: 'att-03', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-03', shiftDate: '2026-11-03', checkIn: '10:01', checkOut: '19:30', workingHours: 9.48, status: 'Present', lateStatus: 'On Time' },
    { id: 'att-04', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-04', shiftDate: '2026-11-04', checkIn: '10:20', checkOut: '19:41', workingHours: 9.35, status: 'Present', lateStatus: 'On Time' },
    { id: 'att-05', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-05', shiftDate: '2026-11-05', checkIn: '10:00', checkOut: '19:00', workingHours: 9.0, status: 'Present', lateStatus: 'On Time' },
    { id: 'att-06', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-06', shiftDate: '2026-11-06', checkIn: '10:05', checkOut: '19:00', workingHours: 8.92, status: 'Present', lateStatus: 'On Time' },
    // Nov 7: Approved Paid Leave (no punch record in attendance_records)
    // Nov 8: Sunday Holiday
    // Nov 9: Monday Holiday (Diwali)
    { id: 'att-10', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-10', shiftDate: '2026-11-10', checkIn: '14:28', checkOut: '19:00', workingHours: 4.53, status: 'Late', lateStatus: 'Late (228 mins)' },
    { id: 'att-11', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-11', shiftDate: '2026-11-11', checkIn: '10:08', checkOut: '19:25', workingHours: 9.29, status: 'Present', lateStatus: 'On Time' },
    { id: 'att-12', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-12', shiftDate: '2026-11-12', checkIn: '10:01', checkOut: '18:36', workingHours: 8.59, status: 'Present', lateStatus: 'On Time' },
    { id: 'att-13', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-13', shiftDate: '2026-11-13', checkIn: '10:04', checkOut: '18:52', workingHours: 8.8, status: 'Present', lateStatus: 'On Time' },
    { id: 'att-14', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-14', shiftDate: '2026-11-14', checkIn: '10:00', checkOut: '18:51', workingHours: 8.85, status: 'Present', lateStatus: 'On Time' },
    // Nov 15: Sunday Holiday
    { id: 'att-16', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-16', shiftDate: '2026-11-16', checkIn: '09:58', checkOut: '18:38', workingHours: 8.66, status: 'Present', lateStatus: 'On Time' },
    { id: 'att-17', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-17', shiftDate: '2026-11-17', checkIn: '10:00', checkOut: '18:49', workingHours: 8.83, status: 'Present', lateStatus: 'On Time' },
    // Nov 18: Today's in-progress punch
    { id: 'att-18', employeeId: 'VRM-027', employeeName: 'Ahilesh K', date: '2026-11-18', shiftDate: '2026-11-18', checkIn: '10:06', checkOut: '', workingHours: 0, status: 'Present', lateStatus: 'On Time' },
  ];

  const nov2026LeaveRequests = [
    {
      id: '9d836fd2-cd5a-4464-ac8b-acf0aceb9af6',
      employeeId: 'VRM-027',
      employeeName: 'Ahilesh K',
      leaveType: 'Casual Leave',
      startDate: '2026-11-07',
      endDate: '2026-11-07',
      daysCount: 1,
      status: 'Approved',
      reason: 'Personal work',
    },
  ];

  it('reproduces and verifies the exact November 1–18, 2026 acceptance criteria', () => {
    const result = buildEmployeeMonthlyAttendanceCalendar({
      month: '2026-11',
      todayStr: '2026-11-18',
      employee,
      employeeId: employee.employeeId,
      employeeUuid: employee.id,
      employeeName: 'Ahilesh K',
      department: employee.department,
      joiningDate: employee.joiningDate,
      weeklyOff: 'Sunday',
      holidays: nov2026Holidays,
      employeeLocation: employee.workLocation,
      attendanceRecords: nov2026AttendanceRecords as any,
      leaveRequests: nov2026LeaveRequests as any,
    });

    // 1. Total calendar rows through Nov 18 = 18
    expect(result.rows.length).toBe(18);
    expect(result.calendarDaysElapsed).toBe(18);

    // 2. Holidays = 4 (Nov 1, 8, 9, 15)
    expect(result.holidaysCount).toBe(4);
    const holidayDates = result.rows
      .filter(r => r.effectiveStatus === 'Holiday')
      .map(r => r.date)
      .sort();
    expect(holidayDates).toEqual(['2026-11-01', '2026-11-08', '2026-11-09', '2026-11-15']);

    // 3. Scheduled Working Days = 18 - 4 = 14
    expect(result.scheduledWorkingDays).toBe(14);

    // 4. Full Present = 12
    expect(result.fullPresentDays).toBe(12);

    // 5. Half Day = 1 (Nov 10)
    expect(result.halfDays).toBe(1);
    const nov10Row = result.rows.find(r => r.date === '2026-11-10');
    expect(nov10Row?.effectiveStatus).toBe('Half Day');
    expect(nov10Row?.workingHours).toBe(4.53);

    // 6. Approved Paid Leave = 1 (Nov 7 visible with blank check-in/check-out and 0 working/OT hours)
    expect(result.paidLeaveDays).toBe(1);
    const nov7Row = result.rows.find(r => r.date === '2026-11-07');
    expect(nov7Row).toBeDefined();
    expect(nov7Row?.effectiveStatus).toBe('Paid Leave');
    expect(nov7Row?.checkIn).toBeNull();
    expect(nov7Row?.checkOut).toBeNull();
    expect(nov7Row?.workingHours).toBe(0);

    // 7. Worked-day equivalent = 12 + 0.5 = 12.5 / 14
    expect(result.workedDays).toBe(12.5);

    // 8. Paid-day equivalent = 12 + 0.5 + 1 paid leave + 4 paid holidays = 17.5 / 18
    expect(result.paidDays).toBe(17.5);
    expect(result.provisionalInProgressDays).toBe(1);
    expect(result.confirmedPaidDays).toBe(16.5);

    // 9. Nov 18 in-progress punch is marked provisional
    const nov18Row = result.rows.find(r => r.date === '2026-11-18');
    expect(nov18Row?.effectiveStatus).toBe('Present');
    expect(nov18Row?.isInProgress).toBe(true);
    expect(nov18Row?.isProvisional).toBe(true);

    // 10. Mutually exclusive status counts per calendar date sum to 18
    const totalBucketSum =
      result.fullPresentDays +
      result.halfDays +
      result.lateDays +
      result.paidLeaveDays +
      result.unpaidLeaveDays +
      result.pendingLeaveDays +
      result.holidaysCount +
      result.absentDays;
    expect(totalBucketSum).toBe(18);
  });

  it('counts custom weekday holidays with "All Sites & HQ" location in both holiday check and getMonthInfo', () => {
    expect(isDateCompanyPaidHoliday('2026-11-09', nov2026Holidays, 'Plant HQ')).toEqual({
      isHoliday: true,
      holidayName: 'Diwali',
    });
    expect(isDateCompanyPaidHoliday('2026-11-09', nov2026Holidays, undefined)).toEqual({
      isHoliday: true,
      holidayName: 'Diwali',
    });

    const refDate = new Date('2026-11-18T12:00:00+05:30');
    const monthInfo = getMonthInfo(refDate, {
      holidays: nov2026Holidays,
      weeklyOff: 'Sunday',
      employeeLocation: 'Plant HQ',
    });
    expect(monthInfo.elapsedCalendarDays).toBe(18);
    expect(monthInfo.elapsedHolidays).toBe(4);
    expect(monthInfo.elapsedWorkingDays).toBe(14);
  });

  it('distinguishes Approved Paid Leave, Pending Leave, Unpaid Leave, Not Marked (today), and Absent (past date) without fabricating approval', () => {
    const calPending = buildEmployeeMonthlyAttendanceCalendar({
      month: '2026-11',
      todayStr: '2026-11-18',
      employee,
      holidays: nov2026Holidays,
      attendanceRecords: nov2026AttendanceRecords as any,
      leaveRequests: [
        {
          id: 'lv-pending',
          employeeId: 'VRM-027',
          leaveType: 'Casual Leave',
          startDate: '2026-11-07',
          endDate: '2026-11-07',
          status: 'Pending',
        },
      ],
    });
    const pendingRow = calPending.rows.find(r => r.date === '2026-11-07');
    expect(pendingRow?.effectiveStatus).toBe('Pending Leave');
    expect(calPending.paidLeaveDays).toBe(0);
    expect(calPending.pendingLeaveDays).toBe(1);

    const calAbsentPast = buildEmployeeMonthlyAttendanceCalendar({
      month: '2026-11',
      todayStr: '2026-11-18',
      employee,
      holidays: nov2026Holidays,
      attendanceRecords: nov2026AttendanceRecords as any,
      leaveRequests: [],
    });
    const absentRow = calAbsentPast.rows.find(r => r.date === '2026-11-07');
    expect(absentRow?.effectiveStatus).toBe('Absent');
    expect(calAbsentPast.paidLeaveDays).toBe(0);
    expect(calAbsentPast.absentDays).toBe(1);

    const calNotMarkedToday = buildEmployeeMonthlyAttendanceCalendar({
      month: '2026-11',
      todayStr: '2026-11-07',
      employee,
      holidays: nov2026Holidays,
      attendanceRecords: nov2026AttendanceRecords.filter(r => r.date < '2026-11-07') as any,
      leaveRequests: [],
    });
    const todayUnmarkedRow = calNotMarkedToday.rows.find(r => r.date === '2026-11-07');
    expect(todayUnmarkedRow?.effectiveStatus).toBe('Not Marked');
  });

  it('handles cross-month leave boundaries and mid-month joining dates accurately', () => {
    const crossMonthCal = buildEmployeeMonthlyAttendanceCalendar({
      month: '2026-11',
      todayStr: '2026-11-04',
      employee,
      holidays: nov2026Holidays,
      attendanceRecords: [
        { id: 'att-03', employeeId: 'VRM-027', date: '2026-11-03', checkIn: '10:00', checkOut: '19:00', workingHours: 9, status: 'Present' },
        { id: 'att-04', employeeId: 'VRM-027', date: '2026-11-04', checkIn: '10:00', checkOut: '19:00', workingHours: 9, status: 'Present' },
      ] as any,
      leaveRequests: [
        {
          id: 'lv-cross',
          employeeId: 'VRM-027',
          leaveType: 'Earned Leave',
          startDate: '2026-10-30',
          endDate: '2026-11-02',
          status: 'Approved',
        },
      ],
    });
    // Nov 1 is Sunday (Holiday), Nov 2 is Paid Leave, Nov 3 & 4 are Present
    expect(crossMonthCal.calendarDaysElapsed).toBe(4);
    expect(crossMonthCal.holidaysCount).toBe(1);
    expect(crossMonthCal.paidLeaveDays).toBe(1);
    expect(crossMonthCal.fullPresentDays).toBe(2);
    expect(crossMonthCal.paidDays).toBe(4);
  });

  it('treats today in-progress punch as provisional and prevents premature payroll finalization before checkout', () => {
    const livePayroll = calculateCalendarDayPayrollAttendance({
      month: '2026-11',
      todayStr: '2026-11-18',
      employeeId: 'VRM-027',
      employeeUuid: employee.id,
      employeeName: 'Ahilesh K',
      joiningDate: '2025-01-01',
      weeklyOff: 'Sunday',
      holidays: nov2026Holidays,
      employeeLocation: 'Plant HQ',
      attendanceRecords: nov2026AttendanceRecords as any,
      leaveRequests: nov2026LeaveRequests as any,
      isPunchLogAttendanceMode: true,
      finalizePayroll: false,
    });

    expect(livePayroll.elapsedCalendarDays).toBe(18);
    expect(livePayroll.elapsedHolidays).toBe(4);
    expect(livePayroll.elapsedScheduledWorkingDays).toBe(14);
    expect(livePayroll.fullPresentDays).toBe(12);
    expect(livePayroll.halfDays).toBe(1);
    expect(livePayroll.workedDays).toBe(12.5);
    expect(livePayroll.paidLeaveDays).toBe(1);
    expect(livePayroll.provisionalInProgressDays).toBe(1);

    const finalizedBeforeCheckout = calculateCalendarDayPayrollAttendance({
      month: '2026-11',
      todayStr: '2026-11-18',
      employeeId: 'VRM-027',
      employeeUuid: employee.id,
      employeeName: 'Ahilesh K',
      joiningDate: '2025-01-01',
      weeklyOff: 'Sunday',
      holidays: nov2026Holidays,
      employeeLocation: 'Plant HQ',
      attendanceRecords: nov2026AttendanceRecords as any,
      leaveRequests: nov2026LeaveRequests as any,
      isPunchLogAttendanceMode: true,
      finalizePayroll: true,
    });

    // When finalizePayroll is true and Nov 18 has not checked out, Nov 18 is held as pendingAttendanceDays (not finalized as full present)
    expect(finalizedBeforeCheckout.fullPresentDays).toBe(11);
    expect(finalizedBeforeCheckout.halfDays).toBe(1);
    expect(finalizedBeforeCheckout.workedDays).toBe(11.5);
    expect(finalizedBeforeCheckout.pendingAttendanceDays).toBe(1);
    expect(finalizedBeforeCheckout.provisionalInProgressDays).toBe(1);
    expect(finalizedBeforeCheckout.paidDays).toBe(16.5);
  });
});
