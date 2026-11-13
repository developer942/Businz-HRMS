import { describe, it, expect } from 'vitest';
import {
  isDefaultOtEligibleDepartment,
  getCalendarDaysInMonth as getBackendCalendarDays,
  resolvePayrollSalaryDivisor as resolveBackendDivisor,
  calculateEnterpriseOvertimeRateAndAmount as calcBackendOt,
  resolveEmployeeOtEligibility as resolveBackendEligibility,
  formatPayslipOvertimeForViewer as formatBackendPayslipOt,
  computeFullPayroll,
} from '../src/services/calculationEngine.js';
import { PayrollSettingsModel } from '../src/types/payroll.js';
import {
  getCalendarDaysInMonth as getFrontendCalendarDays,
  resolvePayrollSalaryDivisor as resolveFrontendDivisor,
  calculateEnterpriseOvertimeRateAndAmount as calcFrontendOt,
  resolveEmployeeOtEligibility as resolveFrontendEligibility,
  resolveEmployeeDepartmentForDate,
  identifyEligibleOvertimeFromAttendance,
  calculateEmployeePayroll,
  formatPayslipOvertimeForViewer as formatFrontendPayslipOt,
} from '../../frontend/src/services/policyEngine';
import { INITIAL_DEPARTMENT_OT_POLICIES } from '../../frontend/src/data/attendanceEnterpriseInitialData';
import { Employee } from '../../frontend/src/types/hrms';
import { OvertimeRequest, OvertimePolicy, EmployeeOtPolicy } from '../../frontend/src/types/attendanceEnterprise';

const baseSettings: PayrollSettingsModel = {
  id: 'settings-1',
  orgKey: 'global',
  pfEnabled: true,
  pfRate: 12.0,
  pfWageCeiling: 15000.0,
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
  esicSalaryThreshold: 21000.0,
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
  professionalTaxAmount: 200.0,
  lopEnabled: true,
  attendanceBonusEnabled: true,
  overtimeEnabled: true,
  standardWorkingDays: 26,
  payrollCycleDay: 1,
};

const defaultOtPolicy: OvertimePolicy = {
  id: 'OT-POL-001',
  policyName: 'Standard Enterprise Overtime Policy',
  enabled: true,
  calculationMethod: 'Shift Based',
  minimumOtDurationMinutes: 30,
  maximumDailyOtHours: 4,
  maximumMonthlyOtHours: 50,
  approvalRequired: true,
  approver: 'HR_AND_CEO',
  rateMethod: 'Fixed Amount Per Hour',
  fixedRatePerHour: 100,
  regularMultiplier: 1.0,
  weekendMultiplier: 1.5,
  holidayMultiplier: 2.0,
  wageBase: 'FIXED_HOURLY',
  divisorMode: 'FIXED_26',
  customDivisorDays: 26,
  defaultDailyPaidHours: 9,
  effectiveFrom: '2020-01-01',
  payslipVisibility: {
    showOtHoursOnPayslip: true,
    showOtAmountOnPayslip: true,
    showOtCalculationDetailsOnPayslip: false,
  },
};

describe('BUSINZ HRMS Enterprise Overtime & Payroll Calculation Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Department-Wise Overtime Eligibility (FLOOR & Dispatch Loading vs Restricted)
  // ---------------------------------------------------------------------------
  describe('1. Department-Wise Overtime Eligibility & Exceptions', () => {
    it('enables automatic overtime for FLOOR and Dispatch Loading departments by default', () => {
      expect(isDefaultOtEligibleDepartment('FLOOR')).toBe(true);
      expect(isDefaultOtEligibleDepartment('Dispatch Loading')).toBe(true);
      expect(isDefaultOtEligibleDepartment('floor')).toBe(true);

      const floorSeed = INITIAL_DEPARTMENT_OT_POLICIES.find(
        d => d.department.toUpperCase() === 'FLOOR'
      );
      const dispatchLoadingSeed = INITIAL_DEPARTMENT_OT_POLICIES.find(
        d => d.department === 'Dispatch Loading'
      );
      expect(floorSeed?.otAllowed).toBe(true);
      expect(dispatchLoadingSeed?.otAllowed).toBe(true);
    });

    it('restricts non-eligible departments unless employee-specific policy or statutory entitlement applies', () => {
      const restrictedDepts = ['HR', 'ACCOUNTS', 'DESIGN', 'DEVELOPER', 'Sales', 'Marketing', 'Dispatch'];
      for (const dept of restrictedDepts) {
        expect(isDefaultOtEligibleDepartment(dept)).toBe(false);
        const res = resolveBackendEligibility({ departmentName: dept, dateStr: '2026-11-10' });
        expect(res.eligible).toBe(false);
        expect(res.source).toBe('RESTRICTED');
      }
    });

    it('allows overtime in a restricted department when employee-specific Allow OT exception or statutory entitlement is active', () => {
      const empAllow = resolveBackendEligibility({
        departmentName: 'ACCOUNTS',
        dateStr: '2026-11-10',
        departmentOtAllowed: false,
        employeeExceptionRule: 'Allow OT',
        employeePolicyEffectiveFrom: '2026-01-01',
      });
      expect(empAllow.eligible).toBe(true);
      expect(empAllow.source).toBe('EMPLOYEE_EXCEPTION');

      const empStatutory = resolveBackendEligibility({
        departmentName: 'HR',
        dateStr: '2026-11-10',
        departmentOtAllowed: false,
        employeeExceptionRule: 'Follow Department',
        statutoryEntitlement: true,
      });
      expect(empStatutory.eligible).toBe(true);
      expect(empStatutory.source).toBe('STATUTORY_ENTITLEMENT');

      const empBlocked = resolveBackendEligibility({
        departmentName: 'FLOOR',
        dateStr: '2026-11-10',
        departmentOtAllowed: true,
        employeeExceptionRule: 'Block OT',
      });
      expect(empBlocked.eligible).toBe(false);
      expect(empBlocked.source).toBe('RESTRICTED');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Automatic Calendar Month Detection (28, 29, 30, 31 Days) & Salary Divisor
  // ---------------------------------------------------------------------------
  describe('2. Calendar Month Detection (28/29/30/31 Days) & Salary Divisor Modes', () => {
    it('accurately detects 28, 29, 30, and 31 days in payroll months across backend and frontend engines', () => {
      // 28 days: Feb 2026 (non-leap year)
      expect(getBackendCalendarDays(2, 2026)).toBe(28);
      expect(getFrontendCalendarDays('February', 2026)).toBe(28);

      // 29 days: Feb 2024 & Feb 2028 (leap years)
      expect(getBackendCalendarDays(2, 2024)).toBe(29);
      expect(getFrontendCalendarDays('February', 2024)).toBe(29);
      expect(getBackendCalendarDays(2, 2028)).toBe(29);
      expect(getFrontendCalendarDays('February', 2028)).toBe(29);

      // 30 days: April, June, September, November
      expect(getBackendCalendarDays(4, 2026)).toBe(30);
      expect(getFrontendCalendarDays('April', 2026)).toBe(30);
      expect(getBackendCalendarDays(11, 2026)).toBe(30);
      expect(getFrontendCalendarDays('November', 2026)).toBe(30);

      // 31 days: January, March, May, July, August, October, December
      expect(getBackendCalendarDays(1, 2026)).toBe(31);
      expect(getFrontendCalendarDays('January', 2026)).toBe(31);
      expect(getBackendCalendarDays(8, 2026)).toBe(31);
      expect(getFrontendCalendarDays('August', 2026)).toBe(31);
      expect(getBackendCalendarDays(12, 2026)).toBe(31);
      expect(getFrontendCalendarDays('December', 2026)).toBe(31);
    });

    it('resolves configured salary divisor modes (FIXED_26, FIXED_30, CALENDAR_DAYS, WORKING_DAYS)', () => {
      const fixed26 = resolveBackendDivisor({ month: 2, year: 2026, divisorMode: 'FIXED_26' });
      expect(fixed26.calendarDays).toBe(28);
      expect(fixed26.divisorDays).toBe(26);

      const fixed30 = resolveBackendDivisor({ month: 2, year: 2026, divisorMode: 'FIXED_30' });
      expect(fixed30.calendarDays).toBe(28);
      expect(fixed30.divisorDays).toBe(30);

      const calFebLeap = resolveBackendDivisor({ month: 2, year: 2028, divisorMode: 'CALENDAR_DAYS' });
      expect(calFebLeap.calendarDays).toBe(29);
      expect(calFebLeap.divisorDays).toBe(29);

      const calOct = resolveFrontendDivisor({ month: 'October', year: 2026, divisorMode: 'CALENDAR_DAYS' });
      expect(calOct.calendarDays).toBe(31);
      expect(calOct.divisorDays).toBe(31);

      const workingNov = resolveFrontendDivisor({
        month: 'November',
        year: 2026,
        divisorMode: 'WORKING_DAYS',
        weeklyOffDayIndex: 0, // Sundays in Nov 2026 = 5 Sundays (1, 8, 15, 22, 29)
      });
      expect(workingNov.calendarDays).toBe(30);
      expect(workingNov.divisorDays).toBe(25);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Overtime Calculation from Wage Base, Divisor, Shift Hours, Approved Hours & Multiplier
  // ---------------------------------------------------------------------------
  describe('3. Enterprise Overtime Calculation Formula', () => {
    it('calculates overtime from FIXED_HOURLY, BASIC, GROSS, and CTC across 1x, 1.5x, and 2x multipliers', () => {
      // 1) Fixed Hourly Rate: ₹100/hr * 3 hrs = ₹300
      const fixedRes = calcBackendOt({
        approvedHours: 3,
        wageBaseMode: 'FIXED_HOURLY',
        fixedHourlyRate: 100,
        divisorDays: 26,
        dailyPaidHours: 9,
        multiplier: 'Fixed Amount Per Hour',
      });
      expect(fixedRes.hourlyRate).toBe(100);
      expect(fixedRes.calculatedAmount).toBe(300);

      // 2) BASIC wage base: ₹11,700 Basic, 26 divisor, 9h shift (= ₹50/hr base), 2x multiplier (= ₹100/hr), 4.5 hrs = ₹450
      const basicRes = calcBackendOt({
        approvedHours: 4.5,
        wageBaseMode: 'BASIC',
        basicSalary: 11700,
        divisorDays: 26,
        dailyPaidHours: 9,
        multiplier: '2x Salary',
      });
      expect(basicRes.hourlyRate).toBe(100);
      expect(basicRes.multiplierValue).toBe(2);
      expect(basicRes.calculatedAmount).toBe(450);

      // 3) GROSS wage base: ₹18,000 Gross, 30 divisor, 8h shift (= ₹75/hr base), 1.5x multiplier (= ₹112.50/hr), 6 hrs = ₹675
      const grossRes = calcFrontendOt({
        approvedHours: 6,
        wageBaseMode: 'GROSS',
        grossSalary: 18000,
        divisorDays: 30,
        dailyPaidHours: 8,
        multiplier: '1.5x Salary',
      });
      expect(grossRes.hourlyRate).toBe(112.5);
      expect(grossRes.calculatedAmount).toBe(675);

      // 4) Leap Year 29-day Calendar Divisor: ₹23,200 CTC, 29 days, 8h shift (= ₹100/hr base), 2x multiplier (= ₹200/hr), 5 hrs = ₹1,000
      const leapRes = calcFrontendOt({
        approvedHours: 5,
        wageBaseMode: 'CTC',
        monthlyCtc: 23200,
        divisorDays: 29,
        dailyPaidHours: 8,
        multiplier: '2x Salary',
      });
      expect(leapRes.hourlyRate).toBe(200);
      expect(leapRes.calculatedAmount).toBe(1000);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. End-to-End Workflow: Attendance → Identify Eligible Hours → Department Policy → Approval → Payroll
  // ---------------------------------------------------------------------------
  describe('4. Attendance-to-Payroll Overtime Identification & Workflow', () => {
    const floorEmp: Employee = {
      id: 'emp-floor-1',
      employeeId: 'VRM-101',
      name: 'Ramesh Floor',
      department: 'FLOOR',
      designation: 'Operator',
      email: 'ramesh@businz.com',
      phone: '9876543210',
      joiningDate: '2025-01-01',
      status: 'Active',
      basicSalary: 6000,
      grossSalary: 15000,
      allowances: { da: 3000, conveyance: 750, hra: 5250 } as any,
      deductions: 0,
      salaryDetails: {
        monthlyCtc: 15000,
        basicSalary: 6000,
        da: 3000,
        conveyance: 750,
        hra: 5250,
        withPf: true,
      } as any,
    };

    const dispatchLoadingEmp: Employee = {
      ...floorEmp,
      id: 'emp-dl-1',
      employeeId: 'VRM-102',
      name: 'Suresh Loading',
      department: 'Dispatch Loading',
    };

    const accountsEmp: Employee = {
      ...floorEmp,
      id: 'emp-acc-1',
      employeeId: 'VRM-103',
      name: 'Priya Accounts',
      department: 'ACCOUNTS',
    };

    it('identifies overtime from attendance for FLOOR and Dispatch Loading while filtering out restricted departments', () => {
      const attendance = [
        {
          id: 'att-1',
          employeeId: 'VRM-101',
          employeeName: 'Ramesh Floor',
          department: 'FLOOR',
          date: '2026-11-05',
          checkIn: '09:00 AM',
          checkOut: '08:00 PM',
          workHours: 11, // 2 hrs OT beyond 9h shift
          status: 'Present' as const,
        },
        {
          id: 'att-2',
          employeeId: 'VRM-102',
          employeeName: 'Suresh Loading',
          department: 'Dispatch Loading',
          date: '2026-11-05',
          checkIn: '09:00 AM',
          checkOut: '09:00 PM',
          workHours: 12, // 3 hrs OT beyond 9h shift
          status: 'Present' as const,
        },
        {
          id: 'att-3',
          employeeId: 'VRM-103',
          employeeName: 'Priya Accounts',
          department: 'ACCOUNTS',
          date: '2026-11-05',
          checkIn: '09:00 AM',
          checkOut: '08:30 PM',
          workHours: 11.5, // Restricted department -> should NOT auto-identify
          status: 'Present' as const,
        },
      ];

      const identifiedResult = identifyEligibleOvertimeFromAttendance({
        attendanceRecords: attendance as any,
        employees: [floorEmp, dispatchLoadingEmp, accountsEmp],
        departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        employeeOtPolicies: [],
        overtimePolicy: defaultOtPolicy,
        existingOtRequests: [],
        month: 'November',
        year: 2026,
      });

      const identified = identifiedResult.eligibleNewRequests;
      expect(identified).toHaveLength(2);
      expect(identifiedResult.skippedRestricted).toBe(1);
      const floorOt = identified.find(r => r.employeeId === 'VRM-101')!;
      const dlOt = identified.find(r => r.employeeId === 'VRM-102')!;

      expect(floorOt.requestedOtHours).toBe(2);
      expect(floorOt.calculatedAmount).toBe(200);
      expect(floorOt.eligibilitySource).toBe('Department Policy');
      expect(floorOt.status).toBe('Pending Approval');

      expect(dlOt.requestedOtHours).toBe(3);
      expect(dlOt.calculatedAmount).toBe(300);
      expect(dlOt.eligibilitySource).toBe('Department Policy');
    });

    it('supports historical department changes, backdated arrears, and duplicate OT prevention in payroll', () => {
      // Employee was in FLOOR during Oct 2026, then moved to HR on 2026-11-01
      const transferredEmp: Employee = {
        ...floorEmp,
        id: 'emp-trans-1',
        employeeId: 'VRM-104',
        firstName: 'Karthik',
        lastName: 'Transferred',
        department: 'HR',
        departmentHistory: [
          {
            department: 'FLOOR',
            departmentId: 'dept-floor',
            departmentName: 'FLOOR',
            effectiveFrom: '2025-01-01',
            effectiveTo: '2026-10-31',
          },
          {
            department: 'HR',
            departmentId: 'dept-hr',
            departmentName: 'HR',
            effectiveFrom: '2026-11-01',
          },
        ],
      } as any;

      expect(resolveEmployeeDepartmentForDate(transferredEmp, '2026-10-20')).toBe('FLOOR');
      expect(resolveEmployeeDepartmentForDate(transferredEmp, '2026-11-05')).toBe('HR');

      const eligOct = resolveFrontendEligibility({
        employee: transferredEmp,
        dateStr: '2026-10-20',
        departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        employeeOtPolicies: [],
      });
      expect(eligOct.eligible).toBe(true);
      expect(eligOct.departmentName).toBe('FLOOR');

      const eligNov = resolveFrontendEligibility({
        employee: transferredEmp,
        dateStr: '2026-11-05',
        departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        employeeOtPolicies: [],
      });
      expect(eligNov.eligible).toBe(false);
      expect(eligNov.departmentName).toBe('HR');

      // Duplicate OT requests for same date + backdated arrear from October included in November payroll
      const otRequests: OvertimeRequest[] = [
        {
          id: 'OT-NOV-1',
          employeeId: 'VRM-101',
          employeeName: 'Ramesh Floor',
          department: 'FLOOR',
          date: '2026-11-05',
          shiftName: 'General',
          shiftEnd: '06:30 PM',
          actualCheckOut: '08:30 PM',
          potentialOtHours: 2,
          requestedOtHours: 2,
          approvedOtHours: 2,
          multiplier: 'Fixed Amount Per Hour',
          hourlyRate: 100,
          calculatedAmount: 200,
          submittedAt: '2026-11-05',
          reason: 'Floor batch completion',
          status: 'Approved',
        },
        // Accidental duplicate for same employee + date -> must be deduplicated
        {
          id: 'OT-NOV-1-DUP',
          employeeId: 'VRM-101',
          employeeName: 'Ramesh Floor',
          department: 'FLOOR',
          date: '2026-11-05',
          shiftName: 'General',
          shiftEnd: '06:30 PM',
          actualCheckOut: '08:30 PM',
          potentialOtHours: 2,
          requestedOtHours: 2,
          approvedOtHours: 2,
          multiplier: 'Fixed Amount Per Hour',
          hourlyRate: 100,
          calculatedAmount: 200,
          submittedAt: '2026-11-05',
          reason: 'Duplicate entry',
          status: 'Approved',
        },
        // Backdated arrear from locked October payroll routed to November 2026
        {
          id: 'OT-OCT-ARREAR',
          employeeId: 'VRM-101',
          employeeName: 'Ramesh Floor',
          department: 'FLOOR',
          date: '2026-10-28',
          shiftName: 'General',
          shiftEnd: '06:30 PM',
          actualCheckOut: '09:30 PM',
          potentialOtHours: 3,
          requestedOtHours: 3,
          approvedOtHours: 3,
          multiplier: 'Fixed Amount Per Hour',
          hourlyRate: 100,
          calculatedAmount: 300,
          submittedAt: '2026-11-02',
          reason: 'Backdated Oct attendance correction',
          status: 'Approved',
          isBackdatedArrear: true,
          arrearSourceMonth: 'October 2026',
          targetPayrollMonth: 'November',
          targetPayrollYear: 2026,
        },
      ];

      const payrollRes = calculateEmployeePayroll(
        floorEmp,
        [],
        [],
        [],
        [],
        undefined,
        undefined,
        undefined,
        'November',
        2026,
        [],
        {
          overtimeRequests: otRequests,
          overtimePolicy: defaultOtPolicy,
          departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
          employeeOtPolicies: [],
          salaryDivisorMode: 'FIXED_DAYS',
        }
      );

      // 2 hrs (Nov 5) + 3 hrs (Oct 28 arrear) = 5 hrs (duplicate Nov 5 ignored!)
      expect(payrollRes.overtimeHours).toBe(5);
      expect(payrollRes.overtimeAmount).toBe(500);
      expect(payrollRes.calendarDaysInMonth).toBe(30);
      expect(payrollRes.salaryDivisorUsed).toBe(26);
      expect(payrollRes.grossSalary).toBe(15000 + payrollRes.attendanceBonus + 500);
      // ESIC 0.75% on grossSalary (including overtime)
      expect(payrollRes.esiDeduction).toBe(Math.round(payrollRes.grossSalary * 0.0075));
      // EPF 12% on Basic+DA+Conv (6000+3000+750 = 9750) = 1170
      expect(payrollRes.epfDeduction).toBe(1170);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. ESIC Treatment & Payslip Visibility Settings
  // ---------------------------------------------------------------------------
  describe('5. ESIC Overtime Integration & Payslip Visibility Controls', () => {
    it('integrates overtime into ESIC and supports 6-month contribution period continuation when OT pushes gross over ₹21,000', () => {
      // Case A: Gross ₹20,000 + ₹2,000 OT = ₹22,000 (> ₹21,000) without continuation -> ESIC ₹0
      const withoutCont = computeFullPayroll({
        employeeId: 'VRM-201',
        monthlySalary: 20000,
        basicPercentage: 40,
        daPercentage: 20,
        conveyancePercentage: 5,
        hraPercentage: 35,
        payrollMonth: 11,
        payrollYear: 2026,
        settings: baseSettings,
        attendance: {
          workingDays: 26,
          presentDays: 26,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          absentDays: 0,
          halfDays: 0,
          lopDays: 0,
          overtimeHours: 10,
        },
        earnings: {
          overtimeHours: 10,
          overtimeRate: 200,
        },
      });
      expect(withoutCont.grossSalary).toBe(22000);
      expect(withoutCont.esicAmount).toBe(0);

      // Case B: Same employee in active ESIC 6-month contribution period -> ESIC 0.75% of ₹22,000 = ₹165
      const withCont = computeFullPayroll({
        employeeId: 'VRM-201',
        monthlySalary: 20000,
        basicPercentage: 40,
        daPercentage: 20,
        conveyancePercentage: 5,
        hraPercentage: 35,
        payrollMonth: 11,
        payrollYear: 2026,
        settings: baseSettings,
        attendance: {
          workingDays: 26,
          presentDays: 26,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          absentDays: 0,
          halfDays: 0,
          lopDays: 0,
          overtimeHours: 10,
        },
        earnings: {
          overtimeHours: 10,
          overtimeRate: 200,
        },
        employeeContext: {
          isContributionPeriodContinuation: true,
        },
      });
      expect(withCont.grossSalary).toBe(22000);
      expect(withCont.esicAmount).toBe(165);
    });

    it('formats payslip overtime visibility options without altering actual earnings or statutory disclosures', () => {
      const fullView = formatBackendPayslipOt({
        overtimeHours: 4,
        overtimeAmount: 400,
        overtimeRate: 100,
        divisorUsed: 26,
        shiftHours: 9,
        multiplierLabel: 'Fixed Amount Per Hour',
        visibility: {
          showOtHoursOnPayslip: true,
          showOtAmountOnPayslip: true,
          showOtCalculationDetailsOnPayslip: true,
        },
      });
      expect(fullView.label).toBe('Overtime Earnings (4 hrs)');
      expect(fullView.amount).toBe(400);
      expect(fullView.description).toContain('4 hrs × ₹100/hr');
      expect(fullView.description).toContain('Divisor: 26d');

      const hideHoursView = formatFrontendPayslipOt({
        overtimeHours: 4,
        overtimeAmount: 400,
        overtimeRate: 100,
        divisorUsed: 26,
        shiftHours: 9,
        visibility: {
          showOtHoursOnPayslip: false,
          showOtAmountOnPayslip: true,
          showOtCalculationDetailsOnPayslip: false,
        },
      });
      expect(hideHoursView.label).toBe('Overtime Earnings');
      expect(hideHoursView.amount).toBe(400);
      expect(hideHoursView.description).toBeUndefined();
    });
  });
});
