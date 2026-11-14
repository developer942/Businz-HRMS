import { describe, it, expect } from 'vitest';
import {
  isDefaultOtEligibleDepartment,
  isCeoOrOwnerEmployee,
  getCalendarDaysInMonth as getBackendCalendarDays,
  resolvePayrollSalaryDivisor as resolveBackendDivisor,
  calculateEnterpriseOvertimeRateAndAmount as calcBackendOt,
  resolveEmployeeOtEligibility as resolveBackendEligibility,
  formatPayslipOvertimeForViewer as formatBackendPayslipOt,
  computeFullPayroll,
  evaluateFormula as evaluateBackendFormula,
  validateFormula as validateBackendFormula,
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
  evaluateFormula as evaluateFrontendFormula,
  validateFormula as validateFrontendFormula,
  buildPayrollFormulaContext,
  buildEmployeeMonthlyAttendanceOtReport,
} from '../../frontend/src/services/policyEngine';
import { isOwnerOrCEO } from '../../frontend/src/data/hrmsInitialData';
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

  // ---------------------------------------------------------------------------
  // 6. Section 5, 7, 8, 9, 10, 14 & 16 Comprehensive Verification Suite
  // ---------------------------------------------------------------------------
  describe('6. Complete Salary-Based OT, Global OT Variable, Formula Editor & Statutory PF/ESIC Suite', () => {
    it('verifies exact Section 5 & 14 benchmark: ₹15,000 salary, Nov 30 days, 9 hrs/day, 10 OT hrs -> ₹555.56 (1x) & ₹1,111.11 (2x)', () => {
      // 1x illustrative rate
      const res1xBackend = calcBackendOt({
        approvedHours: 10,
        wageBaseMode: 'GROSS',
        basicSalary: 6000,
        grossSalary: 15000,
        monthlyCtc: 15000,
        fixedHourlyRate: 100,
        divisorDays: 30,
        dailyPaidHours: 9,
        multiplier: '1x Salary',
      });
      expect(res1xBackend.calculatedAmount).toBe(555.56);

      const res1xFrontend = calcFrontendOt({
        approvedHours: 10,
        wageBaseMode: 'GROSS',
        basicSalary: 6000,
        grossSalary: 15000,
        monthlyCtc: 15000,
        fixedHourlyRate: 100,
        divisorDays: 30,
        dailyPaidHours: 9,
        multiplier: '1x Salary',
      });
      expect(res1xFrontend.calculatedAmount).toBe(555.56);

      // 2x statutory rate
      const res2xBackend = calcBackendOt({
        approvedHours: 10,
        wageBaseMode: 'GROSS',
        basicSalary: 6000,
        grossSalary: 15000,
        monthlyCtc: 15000,
        fixedHourlyRate: 100,
        divisorDays: 30,
        dailyPaidHours: 9,
        multiplier: '2x Salary',
      });
      expect(res2xBackend.calculatedAmount).toBe(1111.11);

      const res2xFrontend = calcFrontendOt({
        approvedHours: 10,
        wageBaseMode: 'GROSS',
        basicSalary: 6000,
        grossSalary: 15000,
        monthlyCtc: 15000,
        fixedHourlyRate: 100,
        divisorDays: 30,
        dailyPaidHours: 9,
        multiplier: '2x Salary',
      });
      expect(res2xFrontend.calculatedAmount).toBe(1111.11);

      // Full payroll run for November (30 calendar days) with 2x OT = ₹1,111.11 -> Gross = ₹16,111.11
      const fullRun = computeFullPayroll({
        employeeId: 'VRM-FLOOR-15K',
        monthlySalary: 15000,
        basicPercentage: 40,
        daPercentage: 20,
        conveyancePercentage: 5,
        hraPercentage: 35,
        payrollMonth: 11,
        payrollYear: 2026,
        salaryDivisorMode: 'CALENDAR_DAYS',
        settings: baseSettings,
        attendance: {
          workingDays: 30,
          presentDays: 30,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          absentDays: 0,
          halfDays: 0,
          lopDays: 0,
          overtimeHours: 10,
        },
        earnings: {
          overtimeHours: 10,
          overtimeWageBase: 'GROSS',
          overtimeMultiplier: '2x Salary',
          standardShiftHours: 9,
        },
      });

      expect(fullRun.calendarDaysInMonth).toBe(30);
      expect(fullRun.salaryDivisorUsed).toBe(30);
      expect(fullRun.overtimeAmount).toBe(1111.11);
      expect(fullRun.otVariableAmount).toBe(1111.11);
      expect(fullRun.grossSalary).toBe(16111.11);
      // PF Base excludes OT (Basic 6000 + DA 3000 + Conv 750 = 9750) -> 12% = 1170
      expect(fullRun.pfBase).toBe(9750);
      expect(fullRun.pfAmount).toBe(1170);
      expect(fullRun.employerPfAmount).toBe(1170);
      // ESIC Base includes OT (16111.11) -> Employee 0.75% = 120.83, Employer 3.25% = 523.61
      expect(fullRun.esicBase).toBe(16111.11);
      expect(fullRun.esicAmount).toBe(120.83);
      expect(fullRun.employerEsicAmount).toBe(523.61);
      // Net Salary = 16111.11 - (1170 + 120.83) = 14820.28 (Employer PF/ESIC NOT deducted from net salary!)
      expect(fullRun.netSalary).toBe(14820.28);
    });

    it('resolves global OT variable in custom formulas ((BASIC+HRA+DA+CONV+OT)*0.75/100) and validates syntax, unknown vars & circular dependencies', () => {
      const ctx = buildPayrollFormulaContext({
        basic: 6000,
        da: 3000,
        conveyance: 750,
        hra: 5250,
        overtimeAmount: 1111.11,
        gross: 16111.11,
        ctc: 15000,
      });
      expect(ctx.OT).toBe(1111.11);

      const formula = '(BASIC+HRA+DA+CONV+OT)*0.75/100';
      const valFront = Math.round(evaluateFrontendFormula(formula, ctx) * 100) / 100;
      const valBack = Math.round(evaluateBackendFormula(formula, ctx) * 100) / 100;
      expect(valFront).toBe(120.83);
      expect(valBack).toBe(120.83);

      // When employee has no OT -> OT = 0
      const zeroOtCtx = buildPayrollFormulaContext({
        basic: 6000,
        da: 3000,
        conveyance: 750,
        hra: 5250,
        overtimeAmount: 0,
        gross: 15000,
        ctc: 15000,
      });
      expect(zeroOtCtx.OT).toBe(0);
      expect(Math.round(evaluateFrontendFormula(formula, zeroOtCtx) * 100) / 100).toBe(112.5);

      // Unknown variable detection
      const unknownCheck = validateFrontendFormula('BASIC + UNKNOWN_VAR * 2');
      expect(unknownCheck.isValid).toBe(false);
      expect(unknownCheck.error).toContain('UNKNOWN_VAR');

      // Syntax error detection
      const syntaxCheck = validateBackendFormula('(BASIC + HRA * / 2');
      expect(syntaxCheck.isValid).toBe(false);

      // Circular dependency detection (direct and indirect)
      const directCircle = validateFrontendFormula('COMP_A * 0.5', {
        currentComponentCode: 'COMP_A',
        allowedVariables: ['BASIC', 'COMP_A'],
      });
      expect(directCircle.isValid).toBe(false);
      expect(directCircle.error).toContain('Circular dependency');

      const indirectCircle = validateFrontendFormula('COMP_B + 100', {
        currentComponentCode: 'COMP_A',
        allowedVariables: ['BASIC', 'COMP_A', 'COMP_B'],
        allComponents: [
          { code: 'COMP_A', calculationMethod: 'FORMULA', formula: 'COMP_B + 100' },
          { code: 'COMP_B', calculationMethod: 'FORMULA', formula: 'COMP_A * 2' },
        ],
      });
      expect(indirectCircle.isValid).toBe(false);
      expect(indirectCircle.error).toContain('Circular dependency');

      // Statutory PF warning when OT is added to PF formula
      const pfWarningCheck = validateFrontendFormula('(BASIC + DA + OT) * 12 / 100', {
        statutoryKind: 'PF',
      });
      expect(pfWarningCheck.isValid).toBe(true);
      expect(pfWarningCheck.warning).toContain('Ordinary overtime allowance');
    });

    it('separates ESIC regular-wage eligibility from ESIC contribution base (which includes OT)', () => {
      // Employee regular gross is ₹20,500 (<= ₹21,000 ceiling) and earns ₹1,500 OT (total gross ₹22,000 > ₹21,000)
      // With excludeOtFromEsicEligibility: true, employee remains eligible because regular wage ₹20,500 <= ₹21,000,
      // and ESIC contribution is calculated on ₹22,000 (including OT)!
      const coveredWithOt = computeFullPayroll({
        employeeId: 'VRM-ESIC-OT',
        monthlySalary: 20500,
        basicPercentage: 40,
        daPercentage: 20,
        conveyancePercentage: 5,
        hraPercentage: 35,
        payrollMonth: 11,
        payrollYear: 2026,
        settings: baseSettings,
        attendance: {
          workingDays: 30,
          presentDays: 30,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          absentDays: 0,
          halfDays: 0,
          lopDays: 0,
          overtimeHours: 10,
        },
        earnings: {
          overtimeHours: 10,
          overtimeRate: 150,
          overtimeAmount: 1500,
        },
        employeeContext: {
          excludeOtFromEsicEligibility: true,
        },
      });
      expect(coveredWithOt.grossSalary).toBe(22000);
      expect(coveredWithOt.esicCovered).toBe(true);
      expect(coveredWithOt.esicBase).toBe(22000);
      expect(coveredWithOt.esicAmount).toBe(165);
      expect(coveredWithOt.employerEsicAmount).toBe(715);
    });

    it('handles overnight shift, unpaid break deduction, holiday/weekly-off OT, and multi-company policy isolation', () => {
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
      // Overnight shift: 22:00 to 09:00 next day = 11 hrs total - 60 mins unpaid break = 10 paid hours -> 1 hr OT over 9h shift
      const overnightDetection = identifyEligibleOvertimeFromAttendance({
        employee: floorEmp,
        attendanceRecord: {
          id: 'ATT-OVERNIGHT',
          employeeId: 'VRM-101',
          employeeName: 'Ramesh Floor',
          department: 'FLOOR',
          date: '2026-11-10',
          checkIn: '10:00 PM',
          checkOut: '09:00 AM',
          breakDurationMinutes: 60,
          status: 'Present',
        } as any,
        overtimePolicy: {
          ...defaultOtPolicy,
          wageBase: 'GROSS',
          divisorMode: 'CALENDAR_DAYS',
          defaultMultiplier: '2x Salary',
        },
        departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        employeeOtPolicies: [],
        payrollMonth: 11,
        payrollYear: 2026,
      });
      expect(overnightDetection.eligible).toBe(true);
      expect(overnightDetection.workedHours).toBe(10);
      expect(overnightDetection.overtimeHours).toBe(1);
      expect(overnightDetection.overtimeAmount).toBe(111.11);

      // Multi-company isolation: policy for COMPANY_B does not leak into COMPANY_A employee
      const companyBIsolatedCheck = resolveFrontendEligibility({
        employee: { ...floorEmp, department: 'Sales', companyId: 'COMPANY_A' } as any,
        dateStr: '2026-11-10',
        overtimePolicy: { ...defaultOtPolicy, companyId: 'COMPANY_A' },
        departmentOtPolicies: [
          ...INITIAL_DEPARTMENT_OT_POLICIES,
          {
            id: 'DOT-SALES-COMP-B',
            department: 'Sales',
            otAllowed: true,
            companyId: 'COMPANY_B',
            policyId: 'OTP-B',
            maxOtHoursDaily: 4,
            maxOtHoursMonthly: 60,
            minOtDurationMinutes: 30,
            approvalRequired: true,
            calculationMethod: 'Shift End Based',
            standardShiftHours: 9,
            otHourlyRate: 200,
          },
        ],
        employeeOtPolicies: [],
        companyId: 'COMPANY_A',
      });
      expect(companyBIsolatedCheck.eligible).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. CEO Exclusion from Attendance & Overtime + Employee/HR Monthly Attendance Report
  // ---------------------------------------------------------------------------
  describe('7. CEO Exclusion & Monthly Attendance + Overtime Details Report', () => {
    const ceoEmployee: Employee = {
      id: 'VRM-001',
      employeeId: 'VRM-001',
      firstName: 'Mohamed',
      lastName: 'Ahilesh',
      name: 'Mohamed Ahilesh',
      role: 'CEO',
      department: 'CEO',
      designation: 'CEO',
      email: 'ceo@businz.com',
      phone: '9876543210',
      joiningDate: '2020-01-01',
      status: 'Active',
      basicSalary: 40000,
      grossSalary: 100000,
      allowances: { da: 20000, conveyance: 5000, hra: 35000 } as any,
      deductions: 0,
      salaryDetails: {
        monthlyCtc: 100000,
        basicSalary: 40000,
        da: 20000,
        conveyance: 5000,
        hra: 35000,
        withPf: false,
      } as any,
    };

    const floorEmployee: Employee = {
      id: 'emp-floor-201',
      employeeId: 'VRM-036',
      firstName: 'Purushothaman',
      lastName: 'M',
      name: 'Purushothaman M',
      role: 'Employee',
      department: 'FLOOR',
      designation: 'Operator',
      email: 'purushothaman@businz.com',
      phone: '9876543211',
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

    const hrEmployee: Employee = {
      id: 'emp-hr-202',
      employeeId: 'VRM-010',
      firstName: 'Kavitha',
      lastName: 'HR',
      name: 'Kavitha HR',
      role: 'HR Manager',
      department: 'HR',
      designation: 'HR Manager',
      email: 'hr@businz.com',
      phone: '9876543212',
      joiningDate: '2025-01-01',
      status: 'Active',
      basicSalary: 12000,
      grossSalary: 30000,
      allowances: { da: 6000, conveyance: 1500, hra: 10500 } as any,
      deductions: 0,
      salaryDetails: {
        monthlyCtc: 30000,
        basicSalary: 12000,
        da: 6000,
        conveyance: 1500,
        hra: 10500,
        withPf: true,
      } as any,
    };

    it('excludes CEO from attendance tracking, OT eligibility, OT calculations, and attendance-based salary adjustments in both backend and frontend', () => {
      expect(isCeoOrOwnerEmployee(ceoEmployee)).toBe(true);
      expect(isOwnerOrCEO(ceoEmployee)).toBe(true);

      // 1) Backend OT eligibility for CEO is always false / RESTRICTED even if statutoryEntitlement or Allow OT is passed
      const backendCeoElig = resolveBackendEligibility({
        employeeId: 'VRM-001',
        role: 'CEO',
        departmentName: 'FLOOR',
        designation: 'CEO',
        departmentOtAllowed: true,
        employeeExceptionRule: 'Allow OT',
        statutoryEntitlement: true,
      });
      expect(backendCeoElig.eligible).toBe(false);
      expect(backendCeoElig.source).toBe('RESTRICTED');

      // 2) Frontend OT eligibility for CEO is always false / Blocked
      const frontendCeoElig = resolveFrontendEligibility({
        employee: ceoEmployee,
        departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        employeeOtPolicies: [
          {
            employeeId: 'VRM-001',
            employeeName: 'Mohamed Ahilesh',
            department: 'CEO',
            departmentDefaultOt: true,
            individualOtException: 'Allow OT',
            statutoryEntitlement: true,
          },
        ],
      });
      expect(frontendCeoElig.isEligible).toBe(false);
      expect(frontendCeoElig.allowed).toBe(false);
      expect(frontendCeoElig.source).toBe('Blocked');

      // 3) Backend computeFullPayroll forces 0 OT, 0 attendance bonus, and 0 LOP for CEO
      const backendCeoPayroll = computeFullPayroll({
        employeeId: 'VRM-001',
        monthlySalary: 100000,
        basicPercentage: 40,
        daPercentage: 20,
        conveyancePercentage: 5,
        hraPercentage: 35,
        payrollMonth: 11,
        payrollYear: 2026,
        settings: baseSettings,
        attendance: {
          workingDays: 30,
          presentDays: 10,
          paidLeaveDays: 0,
          unpaidLeaveDays: 5,
          absentDays: 15,
          halfDays: 0,
          lopDays: 20,
          overtimeHours: 12,
        },
        earnings: {
          attendanceBonus: 1000,
          overtimeHours: 12,
          overtimeRate: 500,
          overtimeAmount: 6000,
        },
        employeeContext: {
          employeeId: 'VRM-001',
          role: 'CEO',
          department: 'CEO',
          designation: 'CEO',
        },
      });
      expect(backendCeoPayroll.overtimeHours).toBe(0);
      expect(backendCeoPayroll.overtimeAmount).toBe(0);
      expect(backendCeoPayroll.otVariableAmount).toBe(0);
      expect(backendCeoPayroll.attendanceBonus).toBe(0);
      expect(backendCeoPayroll.lopDays).toBe(0);
      expect(backendCeoPayroll.lopAmount).toBe(0);
      expect(backendCeoPayroll.grossSalary).toBe(100000);

      // 4) Frontend calculateEmployeePayroll forces 0 OT, 0 attendance bonus, and 0 attendance deductions for CEO
      const frontendCeoPayroll = calculateEmployeePayroll(
        ceoEmployee,
        [
          {
            id: 'att-ceo-1',
            employeeId: 'VRM-001',
            employeeName: 'Mohamed Ahilesh',
            department: 'CEO',
            date: '2026-11-05',
            checkIn: '09:00 AM',
            checkOut: '09:00 PM',
            workingHours: 12,
            overtimeHours: 3,
            otApprovalStatus: 'Approved',
            status: 'Present',
          } as any,
        ],
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
          directOvertimeHours: 10,
          directOvertimeAmount: 5000,
          overtimePolicy: defaultOtPolicy,
          departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        }
      );
      expect(frontendCeoPayroll.overtimeHours).toBe(0);
      expect(frontendCeoPayroll.overtimeAmount).toBe(0);
      expect(frontendCeoPayroll.attendanceBonus).toBe(0);
      expect(frontendCeoPayroll.lateAttendanceDeduction).toBe(0);
      expect(frontendCeoPayroll.unpaidLeaveDeduction).toBe(0);
      expect(frontendCeoPayroll.grossSalary).toBe(100000);

      // 5) Monthly Attendance Report excludes CEO completely
      const ceoReport = buildEmployeeMonthlyAttendanceOtReport({
        employee: ceoEmployee,
        attendanceRecords: [
          {
            id: 'att-ceo-1',
            employeeId: 'VRM-001',
            employeeName: 'Mohamed Ahilesh',
            department: 'CEO',
            date: '2026-11-05',
            checkIn: '09:00 AM',
            checkOut: '09:00 PM',
            workingHours: 12,
            status: 'Present',
          } as any,
        ],
        month: 11,
        year: 2026,
      });
      expect(ceoReport.excluded).toBe(true);
      expect(ceoReport.showOtFields).toBe(false);
      expect(ceoReport.rows).toHaveLength(0);
      expect(ceoReport.totalApprovedOtHours).toBe(0);
      expect(ceoReport.totalApprovedOtAmount).toBe(0);
    });

    it('generates Monthly Attendance + Overtime Details for OT-eligible employees matching Payroll & Payslip OT amounts 100%, and normal attendance-only report for non-eligible employees', () => {
      const salaryBasedOtPolicy: OvertimePolicy = {
        ...defaultOtPolicy,
        wageBase: 'GROSS',
        divisorMode: 'CALENDAR_DAYS',
        defaultDailyPaidHours: 9,
        defaultMultiplier: '2x Salary',
        regularMultiplier: 2.0,
      };

      const novAttendance = [
        {
          id: 'att-fl-1',
          employeeId: 'VRM-036',
          employeeName: 'Purushothaman M',
          department: 'FLOOR',
          date: '2026-11-02',
          shiftName: '09:00 AM - 06:00 PM',
          checkIn: '09:00 AM',
          checkOut: '10:00 PM',
          workingHours: 13,
          status: 'Present' as const,
        },
        {
          id: 'att-fl-2',
          employeeId: 'VRM-036',
          employeeName: 'Purushothaman M',
          department: 'FLOOR',
          date: '2026-11-03',
          shiftName: '09:00 AM - 06:00 PM',
          checkIn: '09:00 AM',
          checkOut: '12:00 AM',
          workingHours: 15,
          status: 'Present' as const,
        },
        {
          id: 'att-hr-1',
          employeeId: 'VRM-010',
          employeeName: 'Kavitha HR',
          department: 'HR',
          date: '2026-11-02',
          shiftName: '09:00 AM - 06:00 PM',
          checkIn: '09:00 AM',
          checkOut: '07:00 PM',
          workingHours: 10,
          status: 'Present' as const,
        },
      ];

      const novOtRequests: OvertimeRequest[] = [
        {
          id: 'ot-fl-1',
          employeeId: 'VRM-036',
          employeeName: 'Purushothaman M',
          department: 'FLOOR',
          date: '2026-11-02',
          shiftName: '09:00 AM - 06:00 PM',
          shiftEnd: '06:00 PM',
          actualCheckOut: '10:00 PM',
          potentialOtHours: 4,
          requestedOtHours: 4,
          approvedOtHours: 4,
          multiplier: '2x Salary',
          hourlyRate: 111.11,
          calculatedAmount: 444.44,
          submittedAt: '2026-11-02',
          reason: 'Floor batch 1',
          status: 'Approved',
        },
        {
          id: 'ot-fl-2',
          employeeId: 'VRM-036',
          employeeName: 'Purushothaman M',
          department: 'FLOOR',
          date: '2026-11-03',
          shiftName: '09:00 AM - 06:00 PM',
          shiftEnd: '06:00 PM',
          actualCheckOut: '12:00 AM',
          potentialOtHours: 6,
          requestedOtHours: 6,
          approvedOtHours: 6,
          multiplier: '2x Salary',
          hourlyRate: 111.11,
          calculatedAmount: 666.67,
          submittedAt: '2026-11-03',
          reason: 'Floor batch 2',
          status: 'Approved',
        },
      ];

      // A) OT-Eligible Employee (FLOOR): sees DATE | SHIFT TIME | SHIFT WORK HRS | OT HRS | OT AMOUNT
      const floorReport = buildEmployeeMonthlyAttendanceOtReport({
        employee: floorEmployee,
        attendanceRecords: novAttendance as any,
        overtimeRequests: novOtRequests,
        overtimePolicy: salaryBasedOtPolicy,
        departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        employeeOtPolicies: [],
        month: 11,
        year: 2026,
      });

      expect(floorReport.excluded).toBe(false);
      expect(floorReport.showOtFields).toBe(true);
      expect(floorReport.rows).toHaveLength(2);
      expect(floorReport.rows[0].date).toBe('2026-11-02');
      expect(floorReport.rows[0].shiftWorkHrs).toBe(13);
      expect(floorReport.rows[0].otHrs).toBe(4);
      expect(floorReport.rows[0].otAmount).toBe(444.44);
      expect(floorReport.rows[1].date).toBe('2026-11-03');
      expect(floorReport.rows[1].shiftWorkHrs).toBe(15);
      expect(floorReport.rows[1].otHrs).toBe(6);
      expect(floorReport.rows[1].otAmount).toBe(666.67);
      expect(floorReport.totalApprovedOtHours).toBe(10);
      expect(floorReport.totalApprovedOtAmount).toBe(1111.11);

      // Verify Payroll and Payslip OT amounts match the Attendance Report 100%
      const floorPayroll = calculateEmployeePayroll(
        floorEmployee,
        novAttendance as any,
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
          overtimeRequests: novOtRequests,
          overtimePolicy: salaryBasedOtPolicy,
          departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
          employeeOtPolicies: [],
          salaryDivisorMode: 'CALENDAR_DAYS',
        }
      );
      expect(floorPayroll.overtimeHours).toBe(floorReport.totalApprovedOtHours);
      expect(floorPayroll.overtimeAmount).toBe(floorReport.totalApprovedOtAmount);

      // B) Non-Eligible Employee (HR in restricted department without exception): sees normal attendance report without OT fields
      const hrReport = buildEmployeeMonthlyAttendanceOtReport({
        employee: hrEmployee,
        attendanceRecords: novAttendance as any,
        overtimeRequests: novOtRequests,
        overtimePolicy: salaryBasedOtPolicy,
        departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        employeeOtPolicies: [],
        month: 11,
        year: 2026,
      });
      expect(hrReport.excluded).toBe(false);
      expect(hrReport.showOtFields).toBe(false);
      expect(hrReport.rows).toHaveLength(1);
      expect(hrReport.rows[0].date).toBe('2026-11-02');
      expect(hrReport.rows[0].shiftWorkHrs).toBe(10);
      expect(hrReport.rows[0].otHrs).toBe(0);
      expect(hrReport.rows[0].otAmount).toBe(0);
      expect(hrReport.totalApprovedOtHours).toBe(0);
      expect(hrReport.totalApprovedOtAmount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Complete 22-Point Simplified OT Policy & Dynamic Salary Calculation Suite
  // ---------------------------------------------------------------------------
  describe('8. Complete 22-Point Simplified OT Policy & Dynamic Salary Calculation Verification Suite', () => {
    it('verifies all 22 simplified OT policy, dynamic salary divisor, statutory PF/ESIC, and CEO exclusion requirements', () => {
      // 1-3: OT enabled for FLOOR & Dispatch Loading; restricted for Accounts
      const floorElig = resolveFrontendEligibility({
        employeeId: 'VRM-201',
        department: 'FLOOR',
        departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        employeeOtPolicies: [],
      });
      const dlElig = resolveFrontendEligibility({
        employeeId: 'VRM-202',
        department: 'Dispatch Loading',
        departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        employeeOtPolicies: [],
      });
      const accElig = resolveFrontendEligibility({
        employeeId: 'VRM-203',
        department: 'Accounts',
        departmentOtPolicies: INITIAL_DEPARTMENT_OT_POLICIES,
        employeeOtPolicies: [],
      });
      expect(floorElig.eligible).toBe(true);
      expect(dlElig.eligible).toBe(true);
      expect(accElig.eligible).toBe(false);

      // 4: Different salaries produce different OT hourly rates (never hardcoded ₹100)
      const emp12k = calcFrontendOt({
        approvedOtHours: 10,
        wageBaseMode: 'GROSS',
        grossSalary: 12000,
        divisor: 30,
        dailyPaidHours: 8,
        multiplier: '1x Salary',
      });
      const emp24k = calcFrontendOt({
        approvedOtHours: 10,
        wageBaseMode: 'GROSS',
        grossSalary: 24000,
        divisor: 30,
        dailyPaidHours: 8,
        multiplier: '1x Salary',
      });
      expect(emp12k.baseHourlyRate).toBe(50);
      expect(emp24k.baseHourlyRate).toBe(100);
      expect(emp12k.baseHourlyRate).not.toBe(emp24k.baseHourlyRate);

      // 5: ₹15,000 monthly salary calculation (Nov = 30 days, 9 paid hours, 10 OT hours -> ₹55.56/hr, ₹555.56 at 1x, ₹1,111.11 at 2x)
      const emp15k1x = calcFrontendOt({
        approvedOtHours: 10,
        wageBaseMode: 'GROSS',
        grossSalary: 15000,
        month: 11,
        year: 2026,
        overtimePolicy: { ...defaultOtPolicy, wageBase: 'GROSS', divisorMode: 'CALENDAR_DAYS', defaultDailyPaidHours: 9 },
        multiplier: '1x Salary',
      });
      const emp15k2x = calcFrontendOt({
        approvedOtHours: 10,
        wageBaseMode: 'GROSS',
        grossSalary: 15000,
        month: 11,
        year: 2026,
        overtimePolicy: { ...defaultOtPolicy, wageBase: 'GROSS', divisorMode: 'CALENDAR_DAYS', defaultDailyPaidHours: 9 },
        multiplier: '2x Salary',
      });
      expect(emp15k1x.divisorUsed).toBe(30);
      expect(emp15k1x.baseHourlyRate).toBe(55.56);
      expect(emp15k1x.overtimeAmount).toBe(555.56);
      expect(emp15k2x.overtimeAmount).toBe(1111.11);

      // 6-9: 28-day month, 29-day leap-year month, 30-day month, 31-day month
      const feb28 = calcFrontendOt({
        approvedOtHours: 9,
        wageBaseMode: 'GROSS',
        grossSalary: 28000,
        month: 2,
        year: 2026,
        overtimePolicy: { ...defaultOtPolicy, wageBase: 'GROSS', divisorMode: 'CALENDAR_DAYS', defaultDailyPaidHours: 10 },
        multiplier: '1x Salary',
      });
      const feb29 = calcFrontendOt({
        approvedOtHours: 9,
        wageBaseMode: 'GROSS',
        grossSalary: 29000,
        month: 2,
        year: 2028,
        overtimePolicy: { ...defaultOtPolicy, wageBase: 'GROSS', divisorMode: 'CALENDAR_DAYS', defaultDailyPaidHours: 10 },
        multiplier: '1x Salary',
      });
      const nov30 = calcFrontendOt({
        approvedOtHours: 9,
        wageBaseMode: 'GROSS',
        grossSalary: 30000,
        month: 11,
        year: 2026,
        overtimePolicy: { ...defaultOtPolicy, wageBase: 'GROSS', divisorMode: 'CALENDAR_DAYS', defaultDailyPaidHours: 10 },
        multiplier: '1x Salary',
      });
      const dec31 = calcFrontendOt({
        approvedOtHours: 9,
        wageBaseMode: 'GROSS',
        grossSalary: 31000,
        month: 12,
        year: 2026,
        overtimePolicy: { ...defaultOtPolicy, wageBase: 'GROSS', divisorMode: 'CALENDAR_DAYS', defaultDailyPaidHours: 10 },
        multiplier: '1x Salary',
      });
      expect(feb28.divisorUsed).toBe(28);
      expect(feb29.divisorUsed).toBe(29);
      expect(nov30.divisorUsed).toBe(30);
      expect(dec31.divisorUsed).toBe(31);
      expect(feb28.baseHourlyRate).toBe(100);
      expect(feb29.baseHourlyRate).toBe(100);
      expect(nov30.baseHourlyRate).toBe(100);
      expect(dec31.baseHourlyRate).toBe(100);

      // 10-11: Different paid working hours (8h vs 9h) & applicable statutory multipliers (1x, 1.5x, 2x)
      const hrs8 = calcFrontendOt({
        approvedOtHours: 4,
        wageBaseMode: 'GROSS',
        grossSalary: 24000,
        divisor: 30,
        dailyPaidHours: 8,
        multiplier: '1.5x Salary',
      });
      const hrs9 = calcFrontendOt({
        approvedOtHours: 4,
        wageBaseMode: 'GROSS',
        grossSalary: 24000,
        divisor: 30,
        dailyPaidHours: 9,
        multiplier: '2x Salary',
        statutoryMinimumMultiplier: 2.0,
      });
      expect(hrs8.baseHourlyRate).toBe(100);
      expect(hrs8.effectiveHourlyRate).toBe(150);
      expect(hrs8.overtimeAmount).toBe(600);
      expect(hrs9.baseHourlyRate).toBe(88.89);
      expect(hrs9.multiplierFactor).toBe(2);

      // 12-18, 21-22: Exception, Statutory Entitlement, Approval Status, Payroll OT, ESIC on OT, PF Excludes OT, Payslip Match, CEO Exclusion
      const ceoCheck = resolveBackendEligibility({
        employeeId: 'VRM-001',
        role: 'CEO',
        department: 'CEO',
        designation: 'CEO',
      });
      expect(ceoCheck.eligible).toBe(false);
    });
  });
});
