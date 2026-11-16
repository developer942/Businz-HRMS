// Comprehensive Test Suite for Calendar Day Based Payroll (Requirements 1-15)
import { computeFullPayroll, calculateCalendarDayPayrollAttendance } from '../src/services/calculationEngine';
import {
  calculateEmployeePayroll,
  calculateCalendarDayPayrollAttendance as frontendCalcCalendarAttendance,
} from '../../frontend/src/services/policyEngine';
import { PayrollSettingsModel } from '../src/types/payroll';
import { Employee } from '../../frontend/src/types/hrms';

const assertEqual = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    throw new Error(`[FAIL] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const baseSettings: PayrollSettingsModel = {
  id: 'set-cal-1',
  orgKey: 'global',
  standardWorkingDays: 26,
  pfEnabled: true,
  pfRate: 12.0,
  pfWageCeiling: 15000,
  pfWageComponents: {
    basic: true,
    da: true,
    conveyance: true,
    hra: false,
    attendance_bonus: false,
    overtime: false,
    other_earnings: false,
  },
  esicEnabled: true,
  esicRate: 0.75,
  esicSalaryThreshold: 21000,
  esicWageComponents: {
    basic: true,
    da: true,
    conveyance: true,
    hra: true,
    attendance_bonus: true,
    overtime: true,
    other_earnings: true,
  },
  professionalTaxEnabled: false,
  professionalTaxAmount: 200,
  lopEnabled: true,
  attendanceBonusEnabled: false,
  overtimeEnabled: true,
  payrollCycleDay: 1,
  salaryComponents: [
    {
      id: 'comp-basic',
      code: 'BASIC',
      name: 'BASIC SALARY',
      type: 'EARNING',
      calculationMethod: 'PERCENTAGE',
      percentageBase: 'CTC',
      defaultValue: 40,
      taxable: true,
      pfApplicable: true,
      esicApplicable: true,
      active: true,
    },
    {
      id: 'comp-hra',
      code: 'HRA',
      name: 'House Rent Allowance',
      type: 'EARNING',
      calculationMethod: 'PERCENTAGE',
      percentageBase: 'CTC',
      defaultValue: 35,
      taxable: true,
      pfApplicable: false,
      esicApplicable: true,
      active: true,
    },
    {
      id: 'comp-da',
      code: 'DA',
      name: 'Dearness Allowance',
      type: 'EARNING',
      calculationMethod: 'PERCENTAGE',
      percentageBase: 'CTC',
      defaultValue: 20,
      taxable: true,
      pfApplicable: true,
      esicApplicable: true,
      active: true,
    },
    {
      id: 'comp-conv',
      code: 'CONV',
      name: 'Conveyance',
      type: 'EARNING',
      calculationMethod: 'PERCENTAGE',
      percentageBase: 'CTC',
      defaultValue: 5,
      taxable: false,
      pfApplicable: true,
      esicApplicable: true,
      active: true,
    },
  ],
};

const frontendPayrollConfig: any = {
  standardWorkingDaysPerMonth: 26,
  attendanceBonusEnabled: false,
  pfPolicy: {
    enabled: true,
    employeePercentage: 12,
    employerPercentage: 12,
    pfCeilingLimit: 15000,
    capAtCeiling: true,
  },
  esicPolicy: {
    enabled: true,
    employeePercentage: 0.75,
    employerPercentage: 3.25,
    grossSalaryLimit: 21000,
  },
  ptPolicy: {
    enabled: false,
    monthlyDeduction: 0,
  },
  components: baseSettings.salaryComponents,
};

export function runCalendarDayPayrollTests() {
  console.log('=== Running Calendar Day Based Payroll Test Suite ===');

  // ---------------------------------------------------------------------------
  // 1. User Bug Reproduction: Vijay E (VRM-043) in November 2026
  // Joined: 06/10/2026, CTC: ₹16,000, Without PF (< 6 Months), 8 present punches
  // ---------------------------------------------------------------------------
  {
    const vijayEmployee: Employee = {
      id: 'emp-vijay-043',
      employeeId: 'VRM-043',
      firstName: 'Vijay',
      lastName: 'E',
      email: 'vijay@vrmstructures.in',
      phone: '9884720789',
      department: 'Production',
      designation: 'Mechine Operator',
      joiningDate: '06/10/2026',
      status: 'Active',
      employmentType: 'Full-Time',
      basicSalary: 6400,
      withPf: false,
      salaryDetails: {
        monthlyCtc: 16000,
        basicSalary: 6400,
        hra: 5600,
        da: 3200,
        conveyance: 800,
        withPf: false,
        salaryScheme: 'WITHOUT_PF',
        panNumber: 'CIJPV1948R',
      },
      shiftDetails: {
        shiftName: 'General Shift',
        startTime: '09:00',
        endTime: '18:00',
        weeklyOff: 'Sunday',
      },
    };

    const novPunches = Array.from({ length: 8 }, (_, i) => ({
      id: `att-vijay-${i + 1}`,
      employeeId: 'VRM-043',
      employeeName: 'Vijay E',
      department: 'Production',
      date: `2026-11-${String(i + 2).padStart(2, '0')}`,
      status: 'Present' as const,
      workingHours: 9,
    }));

    const feRes = calculateEmployeePayroll(
      vijayEmployee,
      novPunches as any,
      [],
      [],
      [],
      undefined,
      undefined,
      frontendPayrollConfig,
      'November',
      2026,
      [],
      {}
    );

    const beRes = computeFullPayroll({
      employeeId: 'VRM-043',
      monthlySalary: 16000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 5,
      hraPercentage: 35,
      withPf: false,
      payrollMonth: 11,
      payrollYear: 2026,
      settings: baseSettings,
      attendance: {
        workingDays: 25,
        presentDays: 8,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        absentDays: 0,
        joiningDate: '06/10/2026',
        weeklyOff: 'Sunday',
        attendanceRecords: novPunches,
      },
    });

    // Nov 2026 has 30 calendar days, 5 Sundays (Nov 1, 8, 15, 22, 29), 25 working days
    assertEqual(feRes.calendarDays, 30, 'Vijay E Nov 2026 Calendar Days (FE)');
    assertEqual(feRes.eligibleDays, 30, 'Vijay E Nov 2026 Eligible Days (FE)');
    assertEqual(feRes.workingDays, 25, 'Vijay E Nov 2026 Working Days (FE)');
    assertEqual(feRes.paidWeekOffDays, 5, 'Vijay E Nov 2026 Paid Week Off Days (FE)');
    assertEqual(feRes.lopDays, 0, 'Vijay E Nov 2026 LOP Days (FE)');
    assertEqual(feRes.paidDays, 30, 'Vijay E Nov 2026 Total Paid Days (FE)');
    assertEqual(feRes.basicSalary, 6400, 'Vijay E Nov 2026 Basic Salary (FE)');
    assertEqual(feRes.hra, 5600, 'Vijay E Nov 2026 HRA (FE)');
    assertEqual(feRes.da, 3200, 'Vijay E Nov 2026 DA (FE)');
    assertEqual(feRes.conveyance, 800, 'Vijay E Nov 2026 Conveyance (FE)');
    assertEqual(feRes.grossSalary, 16000, 'Vijay E Nov 2026 Gross Salary (FE)');
    assertEqual(feRes.totalDeductions, 0, 'Vijay E Nov 2026 Total Deductions (FE)');
    assertEqual(feRes.netSalary, 16000, 'Vijay E Nov 2026 Net Pay (FE)');
    assertEqual(
      feRes.earningsBreakdown[0].description?.includes('Paid 30/30 days'),
      true,
      'Vijay E Nov 2026 Earnings Description shows Paid 30/30 days'
    );

    // Backend parity
    assertEqual(beRes.calendarDays, 30, 'Vijay E Nov 2026 Calendar Days (BE)');
    assertEqual(beRes.paidDays, 30, 'Vijay E Nov 2026 Total Paid Days (BE)');
    assertEqual(beRes.grossSalary, 16000, 'Vijay E Nov 2026 Gross Salary (BE)');
    assertEqual(beRes.netSalary, 16000, 'Vijay E Nov 2026 Net Pay (BE)');
  }

  // ---------------------------------------------------------------------------
  // 2. Months with 28, 29, 30, and 31 Days (Full-Month 0-LOP Guarantee & LOP Proration)
  // ---------------------------------------------------------------------------
  const monthTestCases = [
    { month: 2, year: 2026, expectedCalDays: 28, label: 'Feb 2026 (28 days)' },
    { month: 2, year: 2024, expectedCalDays: 29, label: 'Feb 2024 Leap Year (29 days)' },
    { month: 2, year: 2028, expectedCalDays: 29, label: 'Feb 2028 Leap Year (29 days)' },
    { month: 11, year: 2026, expectedCalDays: 30, label: 'Nov 2026 (30 days)' },
    { month: 10, year: 2026, expectedCalDays: 31, label: 'Oct 2026 (31 days)' },
    { month: 12, year: 2026, expectedCalDays: 31, label: 'Dec 2026 (31 days)' },
  ];

  for (const tc of monthTestCases) {
    // A) Full month 0 LOP -> Full ₹30,000 Gross regardless of 28/29/30/31 days
    const fullRes = computeFullPayroll({
      employeeId: 'EMP-CAL',
      monthlySalary: 30000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 5,
      hraPercentage: 35,
      withPf: true,
      payrollMonth: tc.month,
      payrollYear: tc.year,
      settings: baseSettings,
      attendance: {
        workingDays: tc.expectedCalDays,
        presentDays: tc.expectedCalDays,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        absentDays: 0,
        joiningDate: '2023-01-01',
      },
    });
    assertEqual(fullRes.calendarDays, tc.expectedCalDays, `${tc.label} calendarDays`);
    assertEqual(fullRes.paidDays, tc.expectedCalDays, `${tc.label} paidDays (0 LOP)`);
    assertEqual(fullRes.grossSalary, 30000, `${tc.label} full gross salary with 0 LOP`);

    // B) 2 LOP days -> Gross Pay = 30000 * (CalendarDays - 2) / CalendarDays
    const lopRes = computeFullPayroll({
      employeeId: 'EMP-CAL',
      monthlySalary: 30000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 5,
      hraPercentage: 35,
      withPf: false,
      payrollMonth: tc.month,
      payrollYear: tc.year,
      settings: baseSettings,
      attendance: {
        workingDays: tc.expectedCalDays,
        presentDays: tc.expectedCalDays - 2,
        paidLeaveDays: 0,
        unpaidLeaveDays: 2,
        absentDays: 0,
        joiningDate: '2023-01-01',
      },
    });
    const expectedPaid = tc.expectedCalDays - 2;
    const expectedGross = Math.round(((30000 * expectedPaid) / tc.expectedCalDays) * 100) / 100;
    assertEqual(lopRes.lopDays, 2, `${tc.label} 2 LOP days`);
    assertEqual(lopRes.paidDays, expectedPaid, `${tc.label} paidDays with 2 LOP`);
    assertEqual(lopRes.grossSalary, expectedGross, `${tc.label} prorated gross salary with 2 LOP`);
    assertEqual(lopRes.netSalary, expectedGross, `${tc.label} netPay equals prorated gross when 0 statutory deductions (no double LOP deduction)`);
  }

  // ---------------------------------------------------------------------------
  // 3. Overlapping Holidays (Holiday on a Weekly Off must NOT be double-counted)
  // ---------------------------------------------------------------------------
  {
    // Nov 2026: Nov 1, 8, 15, 22, 29 are Sundays.
    // Declare 2 holidays: 2026-11-08 (Sunday - overlaps with weekly off!) and 2026-11-10 (Tuesday - working day).
    const breakdown = calculateCalendarDayPayrollAttendance({
      month: 11,
      year: 2026,
      joiningDate: '2025-01-01',
      weeklyOff: 'Sunday',
      holidays: [
        { date: '2026-11-08', name: 'Diwali (Sunday)', holidayType: 'Festival', status: 'Active' },
        { date: '2026-11-10', name: 'Govardhan Puja (Tuesday)', holidayType: 'Festival', status: 'Active' },
      ],
      attendanceRecords: [],
      leaveRequests: [],
    });

    assertEqual(breakdown.calendarDays, 30, 'Overlapping holiday: calendarDays = 30');
    assertEqual(breakdown.paidWeekOffDays, 5, 'Overlapping holiday: 5 Sundays counted as paidWeekOffDays');
    assertEqual(breakdown.paidHolidayDays, 1, 'Overlapping holiday: only Tuesday holiday counted as paidHolidayDays (Sunday holiday not double-counted)');
    assertEqual(breakdown.overlappingHolidayDays, 1, 'Overlapping holiday: 1 overlapping holiday recorded');
    assertEqual(breakdown.presentDays, 24, 'Overlapping holiday: 24 remaining working days present');
    assertEqual(breakdown.paidDays, 30, 'Overlapping holiday: total paidDays = 30 (not 31)');
  }

  // ---------------------------------------------------------------------------
  // 4. Different Employee Week-Off Schedules (Sunday, Friday, Saturday+Sunday, 2nd & 4th Saturday)
  // ---------------------------------------------------------------------------
  {
    // A) Friday off in Nov 2026 (Nov 6, 13, 20, 27 = 4 Fridays)
    const fridayOff = calculateCalendarDayPayrollAttendance({
      month: 11,
      year: 2026,
      joiningDate: '2025-01-01',
      weeklyOff: 'Friday',
    });
    assertEqual(fridayOff.paidWeekOffDays, 4, 'Friday week-off in Nov 2026 = 4 days');
    assertEqual(fridayOff.workingDays, 26, 'Friday week-off in Nov 2026 workingDays = 26');

    // B) Saturday & Sunday off in Nov 2026 (4 Saturdays + 5 Sundays = 9 days)
    const satSunOff = calculateCalendarDayPayrollAttendance({
      month: 11,
      year: 2026,
      joiningDate: '2025-01-01',
      weeklyOff: 'Saturday, Sunday',
    });
    assertEqual(satSunOff.paidWeekOffDays, 9, 'Saturday & Sunday week-off in Nov 2026 = 9 days');
    assertEqual(satSunOff.workingDays, 21, 'Saturday & Sunday week-off in Nov 2026 workingDays = 21');

    // C) 2nd & 4th Saturday + Sunday off in Nov 2026 (5 Sundays + 2 Saturdays = 7 days)
    const altSatOff = calculateCalendarDayPayrollAttendance({
      month: 11,
      year: 2026,
      joiningDate: '2025-01-01',
      weeklyOff: '2nd & 4th Saturday and Sunday',
    });
    assertEqual(altSatOff.paidWeekOffDays, 7, '2nd & 4th Saturday + Sunday off in Nov 2026 = 7 days');
    assertEqual(altSatOff.workingDays, 23, '2nd & 4th Saturday + Sunday off in Nov 2026 workingDays = 23');
  }

  // ---------------------------------------------------------------------------
  // 5. Mid-Month New Joiner, Mid-Month Exit, and Combined Join+Exit
  // ---------------------------------------------------------------------------
  {
    // A) Mid-month joiner on 16th Nov 2026 (active Nov 16..30 = 15 eligible days out of 30)
    const joinerRes = computeFullPayroll({
      employeeId: 'EMP-JOINER',
      monthlySalary: 30000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 5,
      hraPercentage: 35,
      withPf: false,
      payrollMonth: 11,
      payrollYear: 2026,
      settings: baseSettings,
      attendance: {
        workingDays: 30,
        presentDays: 15,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        absentDays: 0,
        joiningDate: '2026-11-16',
        weeklyOff: 'Sunday',
      },
    });
    assertEqual(joinerRes.calendarDays, 30, 'Mid-month joiner calendarDays = 30');
    assertEqual(joinerRes.eligibleDays, 15, 'Mid-month joiner eligibleDays = 15');
    assertEqual(joinerRes.paidDays, 15, 'Mid-month joiner paidDays = 15');
    assertEqual(joinerRes.grossSalary, 15000, 'Mid-month joiner grossSalary = 15000 (15/30 of 30000)');

    // B) Mid-month exit on 10th Nov 2026 (active Nov 1..10 = 10 eligible days out of 30)
    const exitRes = computeFullPayroll({
      employeeId: 'EMP-EXIT',
      monthlySalary: 30000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 5,
      hraPercentage: 35,
      withPf: false,
      payrollMonth: 11,
      payrollYear: 2026,
      settings: baseSettings,
      attendance: {
        workingDays: 30,
        presentDays: 10,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        absentDays: 0,
        joiningDate: '2024-01-01',
        exitDate: '2026-11-10',
        weeklyOff: 'Sunday',
      },
    });
    assertEqual(exitRes.eligibleDays, 10, 'Mid-month exit eligibleDays = 10');
    assertEqual(exitRes.paidDays, 10, 'Mid-month exit paidDays = 10');
    assertEqual(exitRes.grossSalary, 10000, 'Mid-month exit grossSalary = 10000 (10/30 of 30000)');

    // C) Mid-month joiner (Nov 16) with 2 LOP days -> Eligible = 15, Paid = 13 -> Gross = 13000
    const joinerWithLop = computeFullPayroll({
      employeeId: 'EMP-JOIN-LOP',
      monthlySalary: 30000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 5,
      hraPercentage: 35,
      withPf: false,
      payrollMonth: 11,
      payrollYear: 2026,
      settings: baseSettings,
      attendance: {
        workingDays: 30,
        presentDays: 13,
        paidLeaveDays: 0,
        unpaidLeaveDays: 2,
        absentDays: 0,
        joiningDate: '2026-11-16',
        weeklyOff: 'Sunday',
      },
    });
    assertEqual(joinerWithLop.eligibleDays, 15, 'Joiner with LOP eligibleDays = 15');
    assertEqual(joinerWithLop.lopDays, 2, 'Joiner with LOP lopDays = 2');
    assertEqual(joinerWithLop.paidDays, 13, 'Joiner with LOP paidDays = 13');
    assertEqual(joinerWithLop.grossSalary, 13000, 'Joiner with LOP grossSalary = 13000');
  }

  // ---------------------------------------------------------------------------
  // 6. Paid Leave vs Unpaid Leave / LOP vs Pending Attendance Policy
  // ---------------------------------------------------------------------------
  {
    const leaveTestBreakdown = frontendCalcCalendarAttendance({
      month: 11,
      year: 2026,
      joiningDate: '2025-01-01',
      weeklyOff: 'Sunday',
      holidays: [{ date: '2026-11-10', name: 'Festival Holiday', status: 'Active' }],
      attendanceRecords: [
        { date: '2026-11-02', status: 'Present' },
        { date: '2026-11-03', status: 'Absent' }, // 1 Absent day -> 1 LOP
        { date: '2026-11-04', status: 'Half Day' }, // 0.5 Half-Day LOP, 0.5 Present
      ],
      leaveRequests: [
        {
          employeeId: 'EMP-LV',
          leaveType: 'Casual Leave (Paid)',
          startDate: '2026-11-11',
          endDate: '2026-11-12',
          daysCount: 2,
          status: 'Approved',
        },
        {
          employeeId: 'EMP-LV',
          leaveType: 'Unpaid Leave (LOP)',
          startDate: '2026-11-16',
          endDate: '2026-11-16',
          daysCount: 1,
          status: 'Approved',
        },
      ],
      autoConvertPendingToLop: false,
    });

    // Total Calendar = 30, Sundays = 5, Holiday = 1 (Nov 10), Paid Leave = 2 (Nov 11-12), LOP = 2.5 (Nov 3 Absent + Nov 4 Half Day + Nov 16 Unpaid Leave)
    assertEqual(leaveTestBreakdown.calendarDays, 30, 'Leave & LOP test: calendarDays = 30');
    assertEqual(leaveTestBreakdown.paidWeekOffDays, 5, 'Leave & LOP test: paidWeekOffDays = 5');
    assertEqual(leaveTestBreakdown.paidHolidayDays, 1, 'Leave & LOP test: paidHolidayDays = 1');
    assertEqual(leaveTestBreakdown.paidLeaveDays, 2, 'Leave & LOP test: paidLeaveDays = 2');
    assertEqual(leaveTestBreakdown.lopDays, 2.5, 'Leave & LOP test: lopDays = 2.5');
    assertEqual(leaveTestBreakdown.paidDays, 27.5, 'Leave & LOP test: paidDays = 27.5 (30 - 2.5)');
  }

  // ---------------------------------------------------------------------------
  // 7. Missing Punch / Pending Attendance Policy & Adjacent Presence Sandwich Policy
  // ---------------------------------------------------------------------------
  {
    // A) By default (autoConvertPendingToLop = false), missing punches are NOT converted to LOP
    const defaultPending = calculateCalendarDayPayrollAttendance({
      month: 11,
      year: 2026,
      joiningDate: '2025-01-01',
      weeklyOff: 'Sunday',
      attendanceRecords: [
        { date: '2026-11-02', status: 'Present' },
        { date: '2026-11-03', status: 'Pending' },
      ],
      autoConvertPendingToLop: false,
    });
    assertEqual(defaultPending.lopDays, 0, 'Pending attendance with autoConvertPendingToLop=false gives 0 LOP');
    assertEqual(defaultPending.paidDays, 30, 'Pending attendance with autoConvertPendingToLop=false gives 30 paidDays');

    // B) Sandwich policy: Unpaid leave on Saturday (Nov 7) and Monday (Nov 9) with Sunday (Nov 8) in between
    const sandwichBreakdown = calculateCalendarDayPayrollAttendance({
      month: 11,
      year: 2026,
      joiningDate: '2025-01-01',
      weeklyOff: 'Sunday',
      attendanceRecords: [
        { date: '2026-11-07', status: 'Absent' },
        { date: '2026-11-09', status: 'Absent' },
      ],
      weekOffEligibilityPolicy: {
        requireAdjacentPresenceForWeekOff: true,
      },
    });
    // Nov 7 (Absent = 1) + Nov 9 (Absent = 1) + Nov 8 Sunday sandwiched between two unpaid absences (= 1 sandwich LOP) = 3 LOP days
    assertEqual(sandwichBreakdown.sandwichLopDays, 1, 'Sandwiched Sunday between two unpaid absences = 1 sandwichLopDay');
    assertEqual(sandwichBreakdown.lopDays, 3, 'Total LOP with sandwiched Sunday = 3 days');
    assertEqual(sandwichBreakdown.paidWeekOffDays, 4, 'Remaining paid Sundays = 4 days');
    assertEqual(sandwichBreakdown.paidDays, 27, 'Total paid days with sandwich LOP = 27 days');
  }

  // ---------------------------------------------------------------------------
  // 8. Prorated Salary Components & Statutory Deductions (PF & ESIC) Parity
  // ---------------------------------------------------------------------------
  {
    // Employee with ₹15,000 CTC, With PF = true, 3 LOP days in Nov 2026 (27/30 paid days = 90%)
    // Prorated Gross = 15000 * 27 / 30 = 13500
    // Prorated Basic (40%) = 5400, HRA (35%) = 4725, DA (20%) = 2700, Conv (5%) = 675
    // PF Base (Basic + DA + Conv) = 5400 + 2700 + 675 = 8775 -> PF (12%) = 1053
    // ESIC (0.75% of 13500) = 101.25 (BE) / 101 (FE)
    const beProrated = computeFullPayroll({
      employeeId: 'EMP-PF-PRORATE',
      monthlySalary: 15000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 5,
      hraPercentage: 35,
      withPf: true,
      payrollMonth: 11,
      payrollYear: 2026,
      settings: baseSettings,
      attendance: {
        workingDays: 25,
        presentDays: 22,
        paidLeaveDays: 0,
        unpaidLeaveDays: 3,
        absentDays: 0,
        joiningDate: '2024-01-01',
        weeklyOff: 'Sunday',
      },
    });

    assertEqual(beProrated.paidDays, 27, 'Prorated PF test: paidDays = 27');
    assertEqual(beProrated.basicSalary, 5400, 'Prorated PF test: basicSalary = 5400');
    assertEqual(beProrated.hra, 4725, 'Prorated PF test: hra = 4725');
    assertEqual(beProrated.da, 2700, 'Prorated PF test: da = 2700');
    assertEqual(beProrated.conveyance, 675, 'Prorated PF test: conveyance = 675');
    assertEqual(beProrated.grossSalary, 13500, 'Prorated PF test: grossSalary = 13500');
    assertEqual(beProrated.pfAmount, 1053, 'Prorated PF test: pfAmount = 1053 (12% of prorated 8775)');
  }

  console.log('=== All Calendar Day Based Payroll Tests Passed Successfully! ===');
}

runCalendarDayPayrollTests();
