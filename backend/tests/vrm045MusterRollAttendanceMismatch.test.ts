import { describe, expect, it } from 'vitest';
import {
  buildEmployeeMonthlyAttendanceCalendar,
  normalizeDateToISO,
  parseTimeToMinutes,
  formatHoursAndMinutes,
  formatDurationHoursAndMinutes,
} from '../../frontend/src/services/attendanceCalculationEngine';

describe('VRM-045 (Mumtazsulthana A) Muster Roll & Attendance Log Mismatch Fix', () => {
  const mumtazEmployee = {
    id: 'd735e9a9-479c-4661-b7d8-64dc852f5e5d',
    employeeId: 'VRM-045',
    firstName: 'Mumtazsulthana',
    lastName: 'A',
    department: 'Production Head',
    workLocation: 'CHENNAI',
    joiningDate: '2026-11-06', // Original profile date before fix
    shiftDetails: {
      weeklyOff: 'Sunday',
    },
  };

  const mumtazNovAttendanceRecords = [
    {
      id: '784d21e2-4e0e-44d8-a27e-b8a4b37d1e19',
      employeeId: 'VRM-045',
      date: '2026-11-03',
      shiftDate: '2026-11-03',
      checkIn: '09:56 AM',
      checkOut: '07:00 PM',
      workingHours: 9.07,
      status: 'Present',
      method: 'Manual Punch',
    },
    {
      id: '8c16b017-4006-4633-8fa1-38e65a3fc3a1',
      employeeId: 'VRM-045',
      date: '2026-11-04',
      shiftDate: '2026-11-04',
      checkIn: '09:58 AM',
      checkOut: '08:59 PM',
      workingHours: 11.02,
      status: 'Present',
      method: 'Manual Punch',
    },
    {
      id: '991bf490-5848-4e51-a8e3-cdca1134f9de',
      employeeId: 'VRM-045',
      date: '2026-11-05',
      shiftDate: '2026-11-05',
      checkIn: '09:59 AM',
      checkOut: '07:30 PM',
      workingHours: 9.52,
      status: 'Present',
      method: 'Manual Punch',
    },
    {
      id: '3442b479-8400-4865-9fdb-4f1e412b8c27',
      employeeId: 'VRM-045',
      date: '2026-11-06',
      shiftDate: '2026-11-06',
      checkIn: '10:20 AM',
      checkOut: '07:40 PM',
      workingHours: 9.33,
      status: 'Present',
      method: 'Manual Punch',
    },
    {
      id: '7abbfb9b-0946-43a2-a16e-780e227bf3b9',
      employeeId: 'VRM-045',
      date: '2026-11-07',
      shiftDate: '2026-11-07',
      checkIn: '10:20 AM',
      checkOut: '07:00 PM',
      workingHours: 8.67,
      status: 'Present',
      method: 'Manual Punch',
    },
    {
      id: '8c8669bd-de75-4893-8bba-f07476741c3b',
      employeeId: 'VRM-045',
      date: '2026-11-10',
      shiftDate: '2026-11-10',
      checkIn: '10:12 AM',
      checkOut: '03:10 PM',
      workingHours: 4.97,
      status: 'Half Day',
      method: 'Manual Punch',
    },
  ];

  const holidays = [
    {
      id: 'HOL-DIWALI',
      name: 'Diwali',
      date: '2026-11-09',
      type: 'National',
      applicableLocation: 'All Sites & HQ',
      paidStatus: 'Paid',
    },
  ];

  it('1. Generates Nov 03, 04, 05, 06 in Attendance Log calendar even when profile joiningDate is 2026-11-06', () => {
    const calendar = buildEmployeeMonthlyAttendanceCalendar({
      month: '2026-11',
      todayStr: '2026-11-21',
      employee: mumtazEmployee,
      employeeId: 'VRM-045',
      employeeUuid: 'd735e9a9-479c-4661-b7d8-64dc852f5e5d',
      employeeName: 'Mumtazsulthana A',
      department: 'Production Head',
      joiningDate: '2026-11-06', // Before fix this caused Nov 03-05 to be discarded!
      attendanceRecords: mumtazNovAttendanceRecords,
      leaveRequests: [],
      holidays,
    });

    // Verify Nov 03 is present, marked Present, with exact punch times and working duration
    const day03 = calendar.rows.find(r => r.date === '2026-11-03');
    expect(day03).toBeDefined();
    expect(day03?.status).toBe('Present');
    expect(day03?.checkIn).toBe('09:56 AM');
    expect(day03?.checkOut).toBe('07:00 PM');
    expect(day03?.workingHours).toBeCloseTo(9.07, 1);

    // Verify Nov 04 is present
    const day04 = calendar.rows.find(r => r.date === '2026-11-04');
    expect(day04).toBeDefined();
    expect(day04?.status).toBe('Present');
    expect(day04?.checkIn).toBe('09:58 AM');
    expect(day04?.checkOut).toBe('08:59 PM');

    // Verify Nov 05 is present
    const day05 = calendar.rows.find(r => r.date === '2026-11-05');
    expect(day05).toBeDefined();
    expect(day05?.status).toBe('Present');
    expect(day05?.checkIn).toBe('09:59 AM');
    expect(day05?.checkOut).toBe('07:30 PM');

    // Verify Nov 06 is present
    const day06 = calendar.rows.find(r => r.date === '2026-11-06');
    expect(day06).toBeDefined();
    expect(day06?.status).toBe('Present');

    // Verify Nov 10 is Half Day
    const day10 = calendar.rows.find(r => r.date === '2026-11-10');
    expect(day10).toBeDefined();
    expect(day10?.status).toBe('Half Day');
    expect(day10?.workedDayEquivalent).toBe(0.5);
  });

  it('2. Correctly handles updated joiningDate 2026-11-03 in database employee record', () => {
    const calendar = buildEmployeeMonthlyAttendanceCalendar({
      month: '2026-11',
      todayStr: '2026-11-21',
      employee: { ...mumtazEmployee, joiningDate: '2026-11-03' },
      employeeId: 'VRM-045',
      employeeUuid: 'd735e9a9-479c-4661-b7d8-64dc852f5e5d',
      employeeName: 'Mumtazsulthana A',
      department: 'Production Head',
      joiningDate: '2026-11-03',
      attendanceRecords: mumtazNovAttendanceRecords,
      leaveRequests: [],
      holidays,
    });

    const dates = calendar.rows.map(r => r.date);
    expect(dates).toContain('2026-11-03');
    expect(dates).toContain('2026-11-04');
    expect(dates).toContain('2026-11-05');
    expect(dates).toContain('2026-11-06');
    expect(dates).toContain('2026-11-07');
    expect(dates).toContain('2026-11-08'); // Sunday Holiday
    expect(dates).toContain('2026-11-09'); // Diwali Holiday
    expect(dates).toContain('2026-11-10'); // Half Day
  });

  it('3. Verified attendance status without physical punch timestamps displays status and null/empty times without inventing timestamps', () => {
    const recordsWithoutPunchTimes = [
      {
        id: 'att-manual-verified',
        employeeId: 'VRM-045',
        date: '2026-11-15',
        shiftDate: '2026-11-15',
        checkIn: null,
        checkOut: null,
        workingHours: 9,
        status: 'Present',
        method: 'Manual Override',
        reason: 'Authorized on-duty attendance by HR',
      },
      {
        id: 'att-manual-half-day',
        employeeId: 'VRM-045',
        date: '2026-11-16',
        shiftDate: '2026-11-16',
        checkIn: '',
        checkOut: '',
        workingHours: 4.5,
        status: 'Half Day',
        method: 'Manual Override',
      },
    ];

    const calendar = buildEmployeeMonthlyAttendanceCalendar({
      month: '2026-11',
      todayStr: '2026-11-21',
      employee: mumtazEmployee,
      employeeId: 'VRM-045',
      attendanceRecords: recordsWithoutPunchTimes,
      leaveRequests: [],
    });

    const day15 = calendar.rows.find(r => r.date === '2026-11-15');
    expect(day15).toBeDefined();
    // Nov 15 was Sunday Holiday, but manual override marks it
    expect(day15?.status).toBe('Holiday'); // Sunday weekly off preserved if no punch

    const day16 = calendar.rows.find(r => r.date === '2026-11-16');
    expect(day16).toBeDefined();
    expect(day16?.status).toBe('Half Day');
    // Timestamps MUST be null or empty, NEVER fabricated
    expect(day16?.checkIn).toBeNull();
    expect(day16?.checkOut).toBeNull();
  });

  it('4. Timezone boundaries: ISO timestamps accurately normalize to Indian Standard Time (IST)', () => {
    // 2026-11-03 04:26:00 UTC is 09:56:00 IST on 2026-11-03
    expect(normalizeDateToISO('2026-11-03T04:26:00.000Z')).toBe('2026-11-03');
    // 2026-11-04 15:29:00 UTC is 20:59:00 IST on 2026-11-04
    expect(normalizeDateToISO('2026-11-04T15:29:00.000Z')).toBe('2026-11-04');
    // 2026-11-05 18:35:00 UTC is 00:05:00 IST on 2026-11-06 (crosses midnight boundary)
    expect(normalizeDateToISO('2026-11-05T18:35:00.000Z')).toBe('2026-11-06');
  });

  it('5. Duration display uses hours and minutes format without decimal hours', () => {
    // formatHoursAndMinutes takes decimal hours
    expect(formatHoursAndMinutes(9.07)).toBe('9h 04m');
    expect(formatHoursAndMinutes(11.02)).toBe('11h 01m');
    expect(formatHoursAndMinutes(9.52)).toBe('9h 31m');
    expect(formatHoursAndMinutes(4.97)).toBe('4h 58m');

    // formatDurationHoursAndMinutes takes total minutes
    expect(formatDurationHoursAndMinutes(9.07 * 60)).toBe('9h 04m');
    expect(formatDurationHoursAndMinutes(11.02 * 60)).toBe('11h 01m');
    expect(formatDurationHoursAndMinutes(9.52 * 60)).toBe('9h 31m');
    expect(formatDurationHoursAndMinutes(4.97 * 60)).toBe('4h 58m');
  });
});
