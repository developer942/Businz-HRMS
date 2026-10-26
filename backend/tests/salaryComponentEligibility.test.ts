import { describe, it, expect } from 'vitest';
import {
  isComponentEligible,
  filterEligibleComponents,
  validateComponentEligibility,
  isEsicStatutoryEligible,
} from '../src/services/componentEligibilityEngine.js';
import { computeFullPayroll } from '../src/services/calculationEngine.js';
import { SalaryComponentConfig, PayrollSettingsModel } from '../src/types/payroll.js';

const mockSettings: PayrollSettingsModel = {
  id: 'test-settings',
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

describe('Salary Component Dynamic Eligibility Engine — Comprehensive Verification', () => {

  // ==========================================================================
  // TEST EXAMPLE 1: PF Applies to All Employees
  // ==========================================================================
  it('Test 1: PF configured with "ALL" applies to any employee covered by policy', () => {
    const pfComponent: SalaryComponentConfig = {
      id: 'c-pf',
      name: 'Provident Fund (EPF)',
      code: 'PF',
      type: 'DEDUCTION',
      calculationMethod: 'PERCENTAGE',
      defaultValue: 12,
      percentageBase: 'BASIC',
      isStatutory: true,
      active: true,
      isConfidential: false,
      description: 'Statutory PF',
      eligibilityType: 'ALL',
    };

    const eligible = isComponentEligible(pfComponent, {
      employeeId: 'EMP-001',
      monthlyCtc: 25000,
      basicSalary: 10000,
      withPf: true,
    });

    expect(eligible).toBe(true);
  });

  // ==========================================================================
  // TEST EXAMPLE 2: Custom Conditional Allowance (Monthly CTC > ₹30,000)
  // ==========================================================================
  describe('Test 2: Custom Conditional Allowance (Monthly CTC > ₹30,000)', () => {
    const conditionalAllowance: SalaryComponentConfig = {
      id: 'c-special-allowance',
      name: 'Executive Performance Allowance',
      code: 'EXEC_ALLOW',
      type: 'EARNING',
      calculationMethod: 'FIXED_AMOUNT',
      defaultValue: 5000,
      isStatutory: false,
      active: true,
      isConfidential: false,
      description: 'For CTC > 30000',
      eligibilityType: 'SALARY_CONDITION',
      eligibilityBase: 'CTC',
      eligibilityOperator: '>',
      eligibilityLimit: 30000,
    };

    it('Employee CTC ₹25,000 → Not Applied', () => {
      const eligible = isComponentEligible(conditionalAllowance, {
        employeeId: 'EMP-JR',
        monthlyCtc: 25000,
        basicSalary: 10000,
        withPf: true,
      });
      expect(eligible).toBe(false);

      // Verify full calculation excludes it
      const payroll = computeFullPayroll({
        employeeId: 'EMP-JR',
        monthlySalary: 25000,
        basicPercentage: 40,
        daPercentage: 20,
        conveyancePercentage: 5,
        hraPercentage: 35,
        payrollMonth: 8,
        payrollYear: 2026,
        settings: mockSettings,
        attendance: { workingDays: 26, presentDays: 26, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, halfDays: 0, lopDays: 0, overtimeHours: 0 },
        configuredComponents: [conditionalAllowance],
      });

      const hasAllowance = payroll.earningsBreakdown.some(e => e.name === conditionalAllowance.name);
      expect(hasAllowance).toBe(false);
      expect(payroll.grossSalary).toBe(25000);
    });

    it('Employee CTC ₹35,000 → Applied and added to gross', () => {
      const eligible = isComponentEligible(conditionalAllowance, {
        employeeId: 'EMP-SR',
        monthlyCtc: 35000,
        basicSalary: 14000,
        withPf: true,
      });
      expect(eligible).toBe(true);

      // Verify full calculation includes it
      const payroll = computeFullPayroll({
        employeeId: 'EMP-SR',
        monthlySalary: 35000,
        basicPercentage: 40,
        daPercentage: 20,
        conveyancePercentage: 5,
        hraPercentage: 35,
        payrollMonth: 8,
        payrollYear: 2026,
        settings: mockSettings,
        attendance: { workingDays: 26, presentDays: 26, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, halfDays: 0, lopDays: 0, overtimeHours: 0 },
        configuredComponents: [conditionalAllowance],
      });

      const allowanceItem = payroll.earningsBreakdown.find(e => e.name === conditionalAllowance.name);
      expect(allowanceItem).toBeDefined();
      expect(allowanceItem?.amount).toBe(5000);
      expect(payroll.grossSalary).toBe(35000 + 5000);
    });
  });

  // ==========================================================================
  // TEST EXAMPLE 3: Custom Conditional Deduction (Monthly CTC <= ₹21,000)
  // ==========================================================================
  describe('Test 3: Custom Conditional Deduction (Monthly CTC <= ₹21,000)', () => {
    const conditionalDeduction: SalaryComponentConfig = {
      id: 'c-welfare-fund',
      name: 'Subsidized Welfare Levy',
      code: 'WELFARE',
      type: 'DEDUCTION',
      calculationMethod: 'FIXED_AMOUNT',
      defaultValue: 250,
      isStatutory: false,
      active: true,
      isConfidential: false,
      description: 'Deducted only for CTC <= 21000',
      eligibilityType: 'SALARY_CONDITION',
      eligibilityBase: 'CTC',
      eligibilityOperator: '<=',
      eligibilityLimit: 21000,
    };

    it('Employee CTC ₹18,000 → Applied', () => {
      const eligible = isComponentEligible(conditionalDeduction, {
        employeeId: 'EMP-LOW',
        monthlyCtc: 18000,
        basicSalary: 7200,
        withPf: true,
      });
      expect(eligible).toBe(true);
    });

    it('Employee CTC ₹21,000 → Applied (boundary test)', () => {
      const eligible = isComponentEligible(conditionalDeduction, {
        employeeId: 'EMP-MID',
        monthlyCtc: 21000,
        basicSalary: 8400,
        withPf: true,
      });
      expect(eligible).toBe(true);
    });

    it('Employee CTC ₹25,000 → Not Applied', () => {
      const eligible = isComponentEligible(conditionalDeduction, {
        employeeId: 'EMP-HIGH',
        monthlyCtc: 25000,
        basicSalary: 10000,
        withPf: true,
      });
      expect(eligible).toBe(false);
    });
  });

  // ==========================================================================
  // TEST EXAMPLE 4: Selected Employees
  // ==========================================================================
  describe('Test 4: Selected Employees (Apply to Employee A & B, Exclude C)', () => {
    const selectedComponent: SalaryComponentConfig = {
      id: 'c-retention-bonus',
      name: 'Key Talent Retention Allowance',
      code: 'KEY_TALENT',
      type: 'EARNING',
      calculationMethod: 'FIXED_AMOUNT',
      defaultValue: 7500,
      isStatutory: false,
      active: true,
      isConfidential: false,
      description: 'Assigned strictly to selected staff',
      eligibilityType: 'SELECTED_EMPLOYEES',
      eligibleEmployeeIds: ['EMP-001', 'EMP-002'],
    };

    it('Employee A (EMP-001) → Applied', () => {
      const eligible = isComponentEligible(selectedComponent, {
        employeeId: 'EMP-001',
        monthlyCtc: 30000,
        withPf: true,
      });
      expect(eligible).toBe(true);
    });

    it('Employee B (EMP-002) → Applied', () => {
      const eligible = isComponentEligible(selectedComponent, {
        employeeId: 'EMP-002',
        monthlyCtc: 40000,
        withPf: true,
      });
      expect(eligible).toBe(true);
    });

    it('Employee C (EMP-003) → Not Applied', () => {
      const eligible = isComponentEligible(selectedComponent, {
        employeeId: 'EMP-003',
        monthlyCtc: 50000,
        withPf: true,
      });
      expect(eligible).toBe(false);
    });
  });

  // ==========================================================================
  // TEST EXAMPLE 5: Statutory ESIC Wage Ceiling & Coverage Continuation
  // ==========================================================================
  describe('Test 5: Statutory ESIC Wage Ceiling & Coverage Continuation Rules', () => {
    it('Gross wage ₹18,000 (<= 21,000) → Eligible', () => {
      const eligible = isEsicStatutoryEligible({
        employeeId: 'EMP-ESI-1',
        grossSalary: 18000,
        monthlyCtc: 18000,
        withPf: true,
      });
      expect(eligible).toBe(true);
    });

    it('Gross wage ₹21,000 boundary → Eligible', () => {
      const eligible = isEsicStatutoryEligible({
        employeeId: 'EMP-ESI-2',
        grossSalary: 21000,
        monthlyCtc: 21000,
        withPf: true,
      });
      expect(eligible).toBe(true);
    });

    it('Gross wage ₹25,000 (> 21,000) without continuation → Exempt/Ineligible', () => {
      const eligible = isEsicStatutoryEligible({
        employeeId: 'EMP-ESI-3',
        grossSalary: 25000,
        monthlyCtc: 25000,
        withPf: true,
        isContributionPeriodContinuation: false,
      });
      expect(eligible).toBe(false);
    });

    it('Gross wage ₹25,000 (> 21,000) WITH coverage continuation → Eligible throughout period', () => {
      const eligible = isEsicStatutoryEligible({
        employeeId: 'EMP-ESI-4',
        grossSalary: 25000,
        monthlyCtc: 25000,
        withPf: true,
        isContributionPeriodContinuation: true,
      });
      expect(eligible).toBe(true);
    });

    it('Probation / Without-PF scheme (withPf: false) → Exempt', () => {
      const eligible = isEsicStatutoryEligible({
        employeeId: 'EMP-PROB',
        grossSalary: 15000,
        withPf: false,
      });
      expect(eligible).toBe(false);
    });
  });

  // ==========================================================================
  // TEST EXAMPLE 6: Validation Engine
  // ==========================================================================
  describe('Test 6: Validation Rules Engine', () => {
    it('Rejects negative salary limits', () => {
      const val = validateComponentEligibility({
        eligibilityType: 'SALARY_CONDITION',
        eligibilityBase: 'CTC',
        eligibilityOperator: '>',
        eligibilityLimit: -5000,
      });
      expect(val.isValid).toBe(false);
      expect(val.error).toContain('cannot be negative');
    });

    it('Rejects BETWEEN operator when maxLimit <= limit', () => {
      const val = validateComponentEligibility({
        eligibilityType: 'SALARY_CONDITION',
        eligibilityBase: 'CTC',
        eligibilityOperator: 'BETWEEN',
        eligibilityLimit: 30000,
        eligibilityLimitMax: 25000,
      });
      expect(val.isValid).toBe(false);
      expect(val.error).toContain('must be greater than minimum limit');
    });

    it('Rejects BETWEEN operator when maxLimit is missing', () => {
      const val = validateComponentEligibility({
        eligibilityType: 'SALARY_CONDITION',
        eligibilityBase: 'CTC',
        eligibilityOperator: 'BETWEEN',
        eligibilityLimit: 30000,
      });
      expect(val.isValid).toBe(false);
      expect(val.error).toContain('upper range limit is required');
    });

    it('Rejects Selected Employees when selection list is empty', () => {
      const val = validateComponentEligibility({
        eligibilityType: 'SELECTED_EMPLOYEES',
        eligibleEmployeeIds: [],
      });
      expect(val.isValid).toBe(false);
      expect(val.error).toContain('At least one employee must be selected');
    });

    it('Rejects Selected Employees with duplicate entries', () => {
      const val = validateComponentEligibility({
        eligibilityType: 'SELECTED_EMPLOYEES',
        eligibleEmployeeIds: ['EMP-001', 'EMP-002', 'emp-001'],
      });
      expect(val.isValid).toBe(false);
      expect(val.error).toContain('Duplicate employee ID');
    });

    it('Accepts valid ALL, SALARY_CONDITION, and SELECTED_EMPLOYEES configs', () => {
      expect(validateComponentEligibility({ eligibilityType: 'ALL' }).isValid).toBe(true);
      expect(validateComponentEligibility({
        eligibilityType: 'SALARY_CONDITION',
        eligibilityBase: 'BASIC',
        eligibilityOperator: '>=',
        eligibilityLimit: 15000,
      }).isValid).toBe(true);
      expect(validateComponentEligibility({
        eligibilityType: 'SELECTED_EMPLOYEES',
        eligibleEmployeeIds: ['EMP-001', 'EMP-002'],
      }).isValid).toBe(true);
    });
  });

  // ==========================================================================
  // TEST EXAMPLE 7: Automatic Recalculation Across Salary Threshold
  // ==========================================================================
  it('Test 7: Dynamically toggles component inclusion when employee salary crosses threshold', () => {
    const allowance: SalaryComponentConfig = {
      id: 'c-high-earner',
      name: 'High Earner Bonus',
      code: 'HIGH_EARN',
      type: 'EARNING',
      calculationMethod: 'FIXED_AMOUNT',
      defaultValue: 3000,
      isStatutory: false,
      active: true,
      isConfidential: false,
      description: 'CTC > 30000',
      eligibilityType: 'SALARY_CONDITION',
      eligibilityBase: 'CTC',
      eligibilityOperator: '>',
      eligibilityLimit: 30000,
    };

    // Employee starts with 28,000 CTC
    const result1 = computeFullPayroll({
      employeeId: 'EMP-GROWTH',
      monthlySalary: 28000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 5,
      hraPercentage: 35,
      payrollMonth: 8,
      payrollYear: 2026,
      settings: mockSettings,
      attendance: { workingDays: 26, presentDays: 26, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, halfDays: 0, lopDays: 0, overtimeHours: 0 },
      configuredComponents: [allowance],
    });
    expect(result1.grossSalary).toBe(28000);
    expect(result1.earningsBreakdown.some(e => e.name === allowance.name)).toBe(false);

    // Employee gets incremented to 32,000 CTC
    const result2 = computeFullPayroll({
      employeeId: 'EMP-GROWTH',
      monthlySalary: 32000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 5,
      hraPercentage: 35,
      payrollMonth: 8,
      payrollYear: 2026,
      settings: mockSettings,
      attendance: { workingDays: 26, presentDays: 26, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, halfDays: 0, lopDays: 0, overtimeHours: 0 },
      configuredComponents: [allowance],
    });
    expect(result2.grossSalary).toBe(32000 + 3000);
    expect(result2.earningsBreakdown.some(e => e.name === allowance.name)).toBe(true);
  });
});
