import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sliders,
  Calculator,
  Search,
  Plus,
  X,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Check,
  Edit3,
  Save,
  AlertCircle,
  Building2,
  Clock,
  Calendar,
  ShieldCheck,
  Eye,
  UserCheck
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import {
  isDefaultOtEligibleDepartment,
  getCalendarDaysInMonth,
  resolvePayrollSalaryDivisor,
  calculateEnterpriseOvertimeRateAndAmount
} from '../../services/attendanceCalculationEngine';
import {
  OtWageBaseMode,
  OtSalaryDivisorMode,
  IndividualOtException,
  OvertimeMultiplierType,
  OvertimePolicy,
  DepartmentOtPolicy,
  EmployeeOtPolicy
} from '../../types/attendanceEnterprise';
import { isOwnerOrCEO } from '../../data/hrmsInitialData';
import { supabaseDirect } from '../../services/supabaseDirectService';

const PREVIEW_MONTH_OPTIONS = [
  { value: '2026-01', label: 'Jan 2026 (31 Days)' },
  { value: '2026-02', label: 'Feb 2026 (28 Days)' },
  { value: '2028-02', label: 'Feb 2028 (29 Days - Leap)' },
  { value: '2026-04', label: 'Apr 2026 (30 Days)' },
  { value: '2026-11', label: 'Nov 2026 (30 Days)' },
  { value: '2026-12', label: 'Dec 2026 (31 Days)' },
];

export const OvertimePolicySettings: React.FC = () => {
  const {
    departments,
    departmentOtPolicies,
    employeeOtPolicies,
    overtimePolicy,
    updateOvertimePolicy,
    updateDepartmentOtPolicy,
    updateEmployeeOtPolicy,
    payrollSettingsConfig,
    updatePayrollSettingsConfig,
    employees,
    currentUser,
    addNotification
  } = useHRMS();

  const isHrOrCeo =
    currentUser?.role === 'CEO' ||
    currentUser?.role === 'HR' ||
    currentUser?.role === 'HR Manager' ||
    currentUser?.role === 'HR Admin' ||
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'Management' ||
    currentUser?.role === 'ERP Administrator';

  const normalizeOtAllowed = (value: unknown, fallback = false): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['no', 'false', '0', 'off', 'disabled'].includes(normalized)) return false;
      if (['yes', 'true', '1', 'on', 'enabled'].includes(normalized)) return true;
    }
    return fallback;
  };

  // Load all non-CEO organization departments dynamically from database
  const activeDepartmentPolicies = useMemo(() => {
    return departments
      .filter(dept => {
        const cleanName = (dept.name || '').trim().toUpperCase();
        return cleanName !== 'CEO' && cleanName !== 'OWNER' && cleanName !== 'BOARD';
      })
      .map(dept => {
        const normalizedDeptId = dept.id.toLowerCase();
        const normalizedDeptName = dept.name.toLowerCase();
        const defaultEligible = isDefaultOtEligibleDepartment(dept.name);
        const existing = departmentOtPolicies.find(
          p =>
            p.department.toLowerCase() === normalizedDeptName ||
            p.id.toLowerCase() === normalizedDeptId ||
            p.id.toLowerCase() === `dot-${normalizedDeptId}` ||
            p.id.toLowerCase() ===
              `dot-${normalizedDeptName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
        );
        return existing
          ? {
              ...existing,
              otAllowed: normalizeOtAllowed((existing as any).otAllowed, defaultEligible),
            }
          : {
              id: `DOT-${dept.id}`,
              department: dept.name,
              otAllowed: defaultEligible,
              policyId: 'OTP-001',
              maxOtHoursDaily: overtimePolicy.maximumDailyOtHours || 4.0,
              maxOtHoursMonthly: overtimePolicy.maximumMonthlyOtHours || 60,
              minOtDurationMinutes: overtimePolicy.minimumOtDurationMinutes || 30,
              approvalRequired: overtimePolicy.approvalRequired ?? true,
              calculationMethod: 'Shift End Based' as const,
              standardShiftHours: overtimePolicy.defaultDailyPaidHours || 9,
            };
      });
  }, [departments, departmentOtPolicies, overtimePolicy]);

  const enabledDepartments = useMemo(
    () => activeDepartmentPolicies.filter(d => d.otAllowed),
    [activeDepartmentPolicies]
  );

  const activeEmployeeExceptions = useMemo(
    () => employeeOtPolicies.filter(ep => !isOwnerOrCEO(ep as any)),
    [employeeOtPolicies]
  );

  const resolvePolicyMultiplierLabel = (mult?: OvertimeMultiplierType, regularMult?: number): OvertimeMultiplierType => {
    if (mult === '2x Salary' || mult === '1.5x Salary' || mult === '1x Salary') return mult;
    if (regularMult === 2) return '2x Salary';
    if (regularMult === 1.5) return '1.5x Salary';
    if (regularMult === 1) return '1x Salary';
    return '2x Salary';
  };

  const formatDivisorLabel = (mode?: OtSalaryDivisorMode): string => {
    switch (mode || 'CALENDAR_DAYS') {
      case 'CALENDAR_DAYS':
        return 'Automatic Month Days (28/29/30/31)';
      case 'FIXED_26':
        return 'Statutory 26 Days';
      case 'FIXED_30':
        return 'Fixed 30 Days';
      case 'WORKING_DAYS':
        return 'Paid Working Days';
      case 'COMPANY_DIVISOR':
      case 'STATUTORY_DIVISOR':
        return 'Configured / Statutory Divisor';
      default:
        return 'Automatic Month Days (28/29/30/31)';
    }
  };

  const formatMultiplierDisplay = (mult: OvertimeMultiplierType): string => {
    if (mult === '2x Salary') return '2× Salary (Statutory Rate)';
    if (mult === '1.5x Salary') return '1.5× Salary';
    return '1× Salary (Standard Rate)';
  };

  const formatDateDisplay = (isoDate?: string): string => {
    if (!isoDate) return '01-11-2026';
    const clean = isoDate.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean;
  };

  // =========================================================================
  // MODAL STATE & DRAFT FORM STATE (All edits remain local until Save Policy)
  // =========================================================================
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [saveSuccessBanner, setSaveSuccessBanner] = useState<string | null>(null);

  // Draft Policy Fields inside Modal
  const [draftSelectedDepts, setDraftSelectedDepts] = useState<string[]>([]);
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const [deptSearchQuery, setDeptSearchQuery] = useState('');
  const deptDropdownRef = useRef<HTMLDivElement | null>(null);

  const [draftCalcMethod, setDraftCalcMethod] = useState<'SALARY_BASED' | 'FIXED_HOURLY'>('SALARY_BASED');
  const [draftWageBase, setDraftWageBase] = useState<OtWageBaseMode>('GROSS');
  const [draftFixedHourlyRate, setDraftFixedHourlyRate] = useState<string>('100');
  const [draftDivisorMode, setDraftDivisorMode] = useState<OtSalaryDivisorMode>('CALENDAR_DAYS');
  const [draftPaidHoursPerDay, setDraftPaidHoursPerDay] = useState<string>('9');
  const [draftMultiplier, setDraftMultiplier] = useState<OvertimeMultiplierType>('2x Salary');
  const [draftEffectiveFrom, setDraftEffectiveFrom] = useState<string>('2026-11-01');
  const [draftEnabled, setDraftEnabled] = useState<boolean>(true);
  const [draftApprovalRequired, setDraftApprovalRequired] = useState<boolean>(true);
  const [draftPayslipVis, setDraftPayslipVis] = useState({
    showOtHoursOnPayslip: true,
    showOtAmountOnPayslip: true,
    showOtRateOnPayslip: true,
    showOtCalculationDetailsOnPayslip: false,
    showEmployerContributionOnPayslip: false,
  });

  // Calculation Preview State inside Modal (reference only, never persisted as attendance/payroll)
  const [previewSalary, setPreviewSalary] = useState<string>('15000');
  const [previewMonth, setPreviewMonth] = useState<string>('2026-11');
  const [previewPaidHours, setPreviewPaidHours] = useState<string>('9');
  const [previewOtHours, setPreviewOtHours] = useState<string>('10');

  // Advanced Settings Accordion inside Modal
  const [showAdvancedInModal, setShowAdvancedInModal] = useState(false);
  const [draftEmployeeExceptions, setDraftEmployeeExceptions] = useState<EmployeeOtPolicy[]>([]);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [selectedExceptionEmpId, setSelectedExceptionEmpId] = useState<string>('');
  const [exceptionMode, setExceptionMode] = useState<IndividualOtException>('Allow OT');
  const [statutoryFlag, setStatutoryFlag] = useState<boolean>(false);
  const [exceptionCustomRate, setExceptionCustomRate] = useState<string>('');
  const [exceptionEffectiveFrom, setExceptionEffectiveFrom] = useState<string>('2026-11-01');
  const [exceptionEffectiveTo, setExceptionEffectiveTo] = useState<string>('');
  const [exceptionReason, setExceptionReason] = useState<string>('');

  // Close department dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(event.target as Node)) {
        setIsDeptDropdownOpen(false);
      }
    };
    if (isDeptDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDeptDropdownOpen]);

  const openPolicyModal = (mode: 'create' | 'edit') => {
    setModalMode(mode);
    setModalError(null);
    setIsDeptDropdownOpen(false);
    setDeptSearchQuery('');
    setShowAdvancedInModal(false);

    const currentEnabledDeptNames = activeDepartmentPolicies
      .filter(d => d.otAllowed)
      .map(d => d.department);

    const defaultDeptNames = activeDepartmentPolicies
      .filter(d => isDefaultOtEligibleDepartment(d.department))
      .map(d => d.department);

    setDraftSelectedDepts(
      currentEnabledDeptNames.length > 0 ? currentEnabledDeptNames : defaultDeptNames
    );

    const isFixed = overtimePolicy.wageBase === 'FIXED_HOURLY';
    setDraftCalcMethod(isFixed ? 'FIXED_HOURLY' : 'SALARY_BASED');
    setDraftWageBase(
      overtimePolicy.wageBase && overtimePolicy.wageBase !== 'FIXED_HOURLY'
        ? overtimePolicy.wageBase
        : 'GROSS'
    );
    setDraftFixedHourlyRate(String(overtimePolicy.fixedRatePerHour || 100));
    setDraftDivisorMode(overtimePolicy.divisorMode || 'CALENDAR_DAYS');

    const paidHrs = String(overtimePolicy.defaultDailyPaidHours || 9);
    setDraftPaidHoursPerDay(paidHrs);

    const resolvedMult = resolvePolicyMultiplierLabel(
      overtimePolicy.defaultMultiplier,
      overtimePolicy.regularMultiplier
    );
    setDraftMultiplier(resolvedMult);
    setDraftEffectiveFrom(overtimePolicy.effectiveFrom || '2026-11-01');
    setDraftEnabled(overtimePolicy.enabled !== false);
    setDraftApprovalRequired(overtimePolicy.approvalRequired ?? true);

    setDraftPayslipVis({
      showOtHoursOnPayslip: true,
      showOtAmountOnPayslip: true,
      showOtRateOnPayslip: true,
      showOtCalculationDetailsOnPayslip: false,
      showEmployerContributionOnPayslip: false,
      ...(overtimePolicy?.payslipVisibility || {}),
      ...(payrollSettingsConfig?.payslipOvertimeVisibility || {}),
    });

    // Reset sample preview to clean benchmark defaults (₹15,000, Nov 2026, 9 hrs, 10 OT hrs)
    setPreviewSalary('15000');
    setPreviewMonth('2026-11');
    setPreviewPaidHours(paidHrs);
    setPreviewOtHours('10');

    // Clone employee exceptions for draft editing
    setDraftEmployeeExceptions(activeEmployeeExceptions.map(e => ({ ...e })));
    setSelectedExceptionEmpId('');
    setExceptionCustomRate('');
    setExceptionEffectiveTo('');
    setExceptionReason('');
    setStatutoryFlag(false);

    setIsModalOpen(true);
  };

  const handleCancelModal = () => {
    if (isSaving) return;
    setModalError(null);
    setIsDeptDropdownOpen(false);
    setIsModalOpen(false);
  };

  const toggleDraftDepartment = (deptName: string) => {
    setDraftSelectedDepts(prev =>
      prev.includes(deptName) ? prev.filter(d => d !== deptName) : [...prev, deptName]
    );
    setModalError(null);
  };

  const filteredModalDepartments = useMemo(() => {
    const q = deptSearchQuery.trim().toLowerCase();
    if (!q) return activeDepartmentPolicies;
    return activeDepartmentPolicies.filter(d => d.department.toLowerCase().includes(q));
  }, [activeDepartmentPolicies, deptSearchQuery]);

  // Live Calculation Preview inside Modal (uses the SAME multiplier selected in the policy form)
  const previewResult = useMemo(() => {
    const [yearPart, monthPart] = (previewMonth || '2026-11').split('-');
    const yearNum = Number(yearPart) || 2026;
    const monthNum = Number(monthPart) || 11;
    const calendarDays = getCalendarDaysInMonth(monthNum, yearNum);

    const divisorResolved = resolvePayrollSalaryDivisor({
      month: monthNum,
      year: yearNum,
      payrollConfig: payrollSettingsConfig,
      overtimePolicy: {
        ...overtimePolicy,
        divisorMode: draftDivisorMode,
      },
      divisorModeOverride: draftDivisorMode,
    });

    const divisorDays = divisorResolved.divisorDays || calendarDays;
    const salaryNum = Math.max(0, Number(String(previewSalary).replace(/,/g, '')) || 0);
    const paidHoursNum = Math.max(
      1,
      Number(previewPaidHours) || Number(draftPaidHoursPerDay) || 9
    );
    const otHoursNum = Math.max(0, Number(previewOtHours) || 0);

    const calc = calculateEnterpriseOvertimeRateAndAmount({
      approvedOtHours: otHoursNum,
      wageBaseMode: draftCalcMethod === 'SALARY_BASED' ? draftWageBase : 'FIXED_HOURLY',
      basicSalary: salaryNum,
      grossSalary: salaryNum,
      monthlyCtc: salaryNum,
      fixedHourlyRate: Math.max(0, Number(draftFixedHourlyRate) || 100),
      divisor: divisorDays,
      dailyPaidHours: paidHoursNum,
      multiplier: draftMultiplier,
      month: monthNum,
      year: yearNum,
    });

    const dailyRate =
      draftCalcMethod === 'SALARY_BASED'
        ? divisorDays > 0
          ? Math.round(((salaryNum / divisorDays) + Number.EPSILON) * 100) / 100
          : 0
        : Math.round(((calc.baseHourlyRate * paidHoursNum) + Number.EPSILON) * 100) / 100;

    const shortMultiplier =
      draftMultiplier === '2x Salary'
        ? '2×'
        : draftMultiplier === '1.5x Salary'
          ? '1.5×'
          : '1×';

    return {
      divisorDays,
      dailyRate,
      baseHourlyRate: calc.baseHourlyRate,
      shortMultiplier,
      otAmount: calc.overtimeAmount,
    };
  }, [
    previewSalary,
    previewMonth,
    previewPaidHours,
    previewOtHours,
    draftPaidHoursPerDay,
    draftDivisorMode,
    draftCalcMethod,
    draftWageBase,
    draftFixedHourlyRate,
    draftMultiplier,
    overtimePolicy,
    payrollSettingsConfig,
  ]);

  // Employee Exceptions inside Advanced Settings
  const filteredModalEmployees = useMemo(() => {
    const q = employeeSearchQuery.trim().toLowerCase();
    const eligibleEmps = employees.filter(emp => !isOwnerOrCEO(emp));
    if (!q) return eligibleEmps;
    return eligibleEmps.filter(
      emp =>
        `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(q) ||
        (emp.employeeId || '').toLowerCase().includes(q) ||
        (emp.department || '').toLowerCase().includes(q)
    );
  }, [employees, employeeSearchQuery]);

  const handleStageEmployeeException = () => {
    if (!selectedExceptionEmpId) return;
    const emp = employees.find(
      e => e.employeeId === selectedExceptionEmpId || e.id === selectedExceptionEmpId
    );
    if (!emp || isOwnerOrCEO(emp)) return;

    const empId = emp.employeeId || emp.id;
    const deptDefault = draftSelectedDepts.some(
      d => d.trim().toLowerCase() === (emp.department || '').trim().toLowerCase()
    );

    const newException: EmployeeOtPolicy = {
      id: `EOP-${empId}`,
      employeeId: empId,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      department: emp.department,
      otAllowed: exceptionMode === 'Allow OT' ? true : exceptionMode === 'Block OT' ? false : deptDefault,
      maxOtDaily: Number(overtimePolicy.maximumDailyOtHours) || 4,
      maxOtMonthly: Number(overtimePolicy.maximumMonthlyOtHours) || 60,
      approvalRequired: draftApprovalRequired,
      individualException: exceptionMode,
      individualOtException: exceptionMode,
      departmentDefaultOt: deptDefault,
      statutoryEntitlement: statutoryFlag,
      customHourlyRate: exceptionCustomRate ? Number(exceptionCustomRate) : undefined,
      effectiveFrom: exceptionEffectiveFrom || draftEffectiveFrom,
      effectiveTo: exceptionEffectiveTo || undefined,
      notes:
        exceptionReason.trim() ||
        `Configured by ${currentUser?.name || currentUser?.role || 'HR'}`,
    };

    setDraftEmployeeExceptions(prev => {
      const existsIdx = prev.findIndex(p => p.employeeId === empId || p.id === `EOP-${empId}`);
      if (existsIdx >= 0) {
        return prev.map((item, idx) => (idx === existsIdx ? newException : item));
      }
      return [...prev, newException];
    });

    setSelectedExceptionEmpId('');
    setExceptionCustomRate('');
    setExceptionEffectiveTo('');
    setExceptionReason('');
    setStatutoryFlag(false);
  };

  const handleRemoveDraftException = (empId: string) => {
    setDraftEmployeeExceptions(prev =>
      prev.map(ep =>
        ep.employeeId === empId
          ? {
              ...ep,
              individualException: 'Follow Department Policy',
              individualOtException: 'Follow Department Policy',
              statutoryEntitlement: false,
              customHourlyRate: undefined,
            }
          : ep
      )
    );
  };

  // =========================================================================
  // SAVE POLICY HANDLER — Validates, persists to PostgreSQL, updates context
  // =========================================================================
  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHrOrCeo || isSaving) return;

    setModalError(null);

    // 1. Validate mandatory fields
    if (draftEnabled && draftSelectedDepts.length === 0) {
      setModalError('Please select at least one eligible department when Overtime Policy is enabled.');
      return;
    }

    const paidHoursNum = Number(draftPaidHoursPerDay);
    if (!Number.isFinite(paidHoursNum) || paidHoursNum <= 0 || paidHoursNum > 24) {
      setModalError('Paid Working Hours / Day must be a valid number between 1 and 24 hours.');
      return;
    }

    if (!draftEffectiveFrom || !draftEffectiveFrom.trim()) {
      setModalError('Please select a valid Effective From date.');
      return;
    }

    const fixedRateNum = Number(draftFixedHourlyRate);
    if (draftCalcMethod === 'FIXED_HOURLY' && (!Number.isFinite(fixedRateNum) || fixedRateNum <= 0)) {
      setModalError('Please enter a valid Fixed Hourly Rate greater than ₹0.');
      return;
    }

    const numericMultiplier =
      draftMultiplier === '2x Salary' ? 2.0 : draftMultiplier === '1.5x Salary' ? 1.5 : 1.0;

    const nextOvertimePolicy: OvertimePolicy = {
      ...overtimePolicy,
      id: overtimePolicy.id || 'OTP-001',
      policyName: overtimePolicy.policyName || 'Company Overtime (OT) Policy',
      enabled: draftEnabled,
      wageBase: draftCalcMethod === 'SALARY_BASED' ? draftWageBase : 'FIXED_HOURLY',
      rateMethod:
        draftCalcMethod === 'SALARY_BASED' ? 'Daily Salary Based' : 'Fixed Amount Per Hour',
      fixedRatePerHour:
        draftCalcMethod === 'FIXED_HOURLY' ? fixedRateNum : overtimePolicy.fixedRatePerHour || 100,
      divisorMode: draftDivisorMode,
      defaultDailyPaidHours: paidHoursNum,
      defaultMultiplier: draftMultiplier,
      rateType: draftMultiplier,
      regularMultiplier: numericMultiplier,
      weekendMultiplier: Math.max(numericMultiplier, overtimePolicy.weekendMultiplier || 2.0),
      holidayMultiplier: Math.max(numericMultiplier, overtimePolicy.holidayMultiplier || 2.0),
      statutoryMultiplier: 2.0,
      effectiveFrom: draftEffectiveFrom,
      approvalRequired: draftApprovalRequired,
      payslipVisibility: draftPayslipVis,
      version: Math.max(2, Number(overtimePolicy.version ?? 2)),
    };

    const selectedLowerSet = new Set(draftSelectedDepts.map(d => d.trim().toLowerCase()));

    const nextDepartmentPolicies: DepartmentOtPolicy[] = activeDepartmentPolicies.map(dept => {
      const isSelected = selectedLowerSet.has(dept.department.trim().toLowerCase());
      return {
        ...dept,
        otAllowed: isSelected,
        standardShiftHours: paidHoursNum,
        approvalRequired: draftApprovalRequired,
        defaultMultiplier: draftMultiplier,
        effectiveFrom: draftEffectiveFrom,
      };
    });

    setIsSaving(true);
    try {
      // 2. Persist directly to PostgreSQL database (company_settings table)
      const restOnline = supabaseDirect.isRestAvailable();
      const [savedPolicyOk, savedDeptsOk, savedEmpsOk] = await Promise.all([
        supabaseDirect.saveCompanySetting('overtime_policy_data', nextOvertimePolicy),
        supabaseDirect.saveCompanySetting('department_ot_policies_data', nextDepartmentPolicies),
        supabaseDirect.saveCompanySetting('employee_ot_policies_data', draftEmployeeExceptions),
      ]);

      // If REST API was online and any database write explicitly failed, keep modal open and show error
      if (restOnline && supabaseDirect.isRestAvailable() && (!savedPolicyOk || !savedDeptsOk || !savedEmpsOk)) {
        setModalError(
          'Failed to save Overtime Policy to the database. Your changes have been preserved—please try again.'
        );
        setIsSaving(false);
        return;
      }

      // 3. Synchronize HRMSContext & localStorage state
      updateOvertimePolicy(nextOvertimePolicy);

      nextDepartmentPolicies.forEach(dept => {
        updateDepartmentOtPolicy(dept.id, {
          department: dept.department,
          otAllowed: dept.otAllowed,
          standardShiftHours: paidHoursNum,
          approvalRequired: draftApprovalRequired,
          defaultMultiplier: draftMultiplier,
          effectiveFrom: draftEffectiveFrom,
        });
      });

      draftEmployeeExceptions.forEach(exc => {
        updateEmployeeOtPolicy(exc.employeeId, exc);
      });

      if (updatePayrollSettingsConfig) {
        const payrollUpdates: Record<string, any> = {
          payslipOvertimeVisibility: draftPayslipVis,
        };
        if (draftDivisorMode === 'CALENDAR_DAYS') {
          payrollUpdates.salaryDivisorMode = 'CALENDAR_DAYS';
        } else if (draftDivisorMode === 'WORKING_DAYS') {
          payrollUpdates.salaryDivisorMode = 'WORKING_DAYS';
        } else if (draftDivisorMode === 'FIXED_26') {
          payrollUpdates.salaryDivisorMode = 'FIXED_DAYS';
          payrollUpdates.standardWorkingDaysPerMonth = 26;
        } else if (draftDivisorMode === 'FIXED_30') {
          payrollUpdates.salaryDivisorMode = 'FIXED_DAYS';
          payrollUpdates.standardWorkingDaysPerMonth = 30;
        }
        updatePayrollSettingsConfig(payrollUpdates);
      }

      if (addNotification) {
        addNotification({
          title: modalMode === 'create' ? 'Overtime Policy Created' : 'Overtime Policy Saved',
          message: `Overtime Policy saved (${draftSelectedDepts.length} eligible department${draftSelectedDepts.length === 1 ? '' : 's'}, ${formatMultiplierDisplay(draftMultiplier)}).`,
          priority: 'Normal',
          category: 'Attendance',
        });
      }

      setSaveSuccessBanner(
        `Overtime Policy saved successfully (${draftSelectedDepts.join(', ') || 'No departments enabled'}).`
      );
      setTimeout(() => setSaveSuccessBanner(null), 4000);

      // 4. Close modal only after successful save
      setIsModalOpen(false);
    } catch (err: any) {
      setModalError(
        err?.message || 'An unexpected error occurred while saving the Overtime Policy. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Current saved summary values for the main page card
  const isMasterEnabled = overtimePolicy.enabled !== false;
  const isSalaryBased = (overtimePolicy.wageBase || 'GROSS') !== 'FIXED_HOURLY';
  const savedWageBase: OtWageBaseMode =
    overtimePolicy.wageBase && overtimePolicy.wageBase !== 'FIXED_HOURLY'
      ? overtimePolicy.wageBase
      : 'GROSS';
  const savedDivisorMode: OtSalaryDivisorMode = overtimePolicy.divisorMode || 'CALENDAR_DAYS';
  const savedPaidHours = overtimePolicy.defaultDailyPaidHours || 9;
  const savedMultiplier = resolvePolicyMultiplierLabel(
    overtimePolicy.defaultMultiplier,
    overtimePolicy.regularMultiplier
  );
  const savedEffectiveFrom = overtimePolicy.effectiveFrom || '2026-11-01';
  const hasConfiguredPolicy = Boolean(overtimePolicy && overtimePolicy.id);

  const visibleExceptionList = useMemo(
    () =>
      draftEmployeeExceptions.filter(
        ep =>
          (ep.individualOtException &&
            ep.individualOtException !== 'Follow Department Policy' &&
            ep.individualOtException !== 'Follow Department' &&
            ep.individualOtException !== 'Default to Department') ||
          ep.statutoryEntitlement
      ),
    [draftEmployeeExceptions]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Action Bar (Matches LeaveManagementSettings.tsx) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: '#FFFFFF',
          padding: '14px 18px',
          borderRadius: '12px',
          border: '1px solid #E7ECF3',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: '#ECFEFF',
              color: '#0E7490',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Clock size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
              Overtime (OT) Policy
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
              Configure department overtime eligibility and dynamic salary calculation rules
            </p>
          </div>
        </div>

        {isHrOrCeo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => openPolicyModal(hasConfiguredPolicy ? 'edit' : 'create')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: 'pointer',
              }}
            >
              {hasConfiguredPolicy ? (
                <>
                  <Edit3 size={15} /> Edit Policy
                </>
              ) : (
                <>
                  <Plus size={15} /> Create OT Policy
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Save Success Toast Banner */}
      {saveSuccessBanner && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '12px',
            backgroundColor: '#DCFCE7',
            border: '1px solid #BBF7D0',
            color: '#15803D',
            fontSize: '0.84rem',
            fontWeight: 700,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{saveSuccessBanner}</span>
        </div>
      )}

      {/* MAIN PAGE COMPACT POLICY SUMMARY CARD (Matches Leave Policy Card Style) */}
      {!hasConfiguredPolicy ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1.5px dashed #CBD5E1',
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#ECFEFF',
              color: '#0E7490',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Clock size={24} />
          </div>
          <div style={{ fontWeight: 750, fontSize: '1.05rem', color: '#0F172A' }}>
            No Overtime Policy Configured
          </div>
          <div style={{ color: '#64748B', fontSize: '0.86rem', maxWidth: '420px', lineHeight: 1.5 }}>
            Click <strong>Create OT Policy</strong> below to configure eligible departments, monthly
            divisor, paid working hours, and overtime multiplier.
          </div>
          {isHrOrCeo && (
            <button
              type="button"
              onClick={() => openPolicyModal('create')}
              style={{
                marginTop: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 18px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <Plus size={16} /> Create OT Policy
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: isMasterEnabled ? '1.5px solid #0E7490' : '1px solid #E7ECF3',
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          }}
        >
          <div>
            {/* Card Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '14px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h4 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0F172A' }}>
                    {overtimePolicy.policyName || 'Company Overtime (OT) Policy'}
                  </h4>
                  <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                    v{overtimePolicy.version || 2}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 9px',
                      borderRadius: '999px',
                      backgroundColor: '#ECFEFF',
                      color: '#0E7490',
                      border: '1px solid #A5F3FC',
                    }}
                  >
                    {isSalaryBased ? 'Salary Based (Dynamic)' : 'Fixed Hourly Rate'}
                  </span>
                </div>
                <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: '#64748B', lineHeight: 1.4 }}>
                  {isSalaryBased
                    ? 'Formula: Eligible Monthly Wages ÷ Month Days ÷ Paid Daily Hours × Approved OT Hours × Multiplier'
                    : `Formula: ₹${overtimePolicy.fixedRatePerHour || 100}/hr × Approved OT Hours × Multiplier`}
                </p>
              </div>

              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: isMasterEnabled ? '#DCFCE7' : '#FEF3C7',
                  color: isMasterEnabled ? '#15803D' : '#B45309',
                  border: isMasterEnabled ? '1px solid #BBF7D0' : '1px solid #FDE68A',
                  flexShrink: 0,
                }}
              >
                {isMasterEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {/* Eligible Departments Chips */}
            <div style={{ marginBottom: '14px' }}>
              <div
                style={{
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  marginBottom: '8px',
                }}
              >
                Eligible Departments ({enabledDepartments.length} of {activeDepartmentPolicies.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {enabledDepartments.length > 0 ? (
                  enabledDepartments.map(dept => (
                    <span
                      key={dept.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        backgroundColor: '#0E7490',
                        color: '#FFFFFF',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                      }}
                    >
                      <Check size={12} strokeWidth={3} />
                      {dept.department}
                    </span>
                  ))
                ) : (
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      backgroundColor: '#FEF3C7',
                      color: '#B45309',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                    }}
                  >
                    No departments currently enabled for company-policy overtime
                  </span>
                )}
              </div>
            </div>

            {/* 4 Core Policy Parameters Grid (Matches LeaveManagementSettings Card Box) */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                padding: '14px 16px',
                borderRadius: '12px',
                fontSize: '0.84rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '14px',
                marginBottom: '14px',
                border: '1px solid #F1F5F9',
              }}
            >
              <div>
                <span
                  style={{
                    color: '#64748B',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    display: 'block',
                    textTransform: 'uppercase',
                  }}
                >
                  Calculation Method:
                </span>
                <div style={{ fontWeight: 700, color: '#0E7490', marginTop: '3px' }}>
                  {isSalaryBased
                    ? `Salary Based (${savedWageBase === 'GROSS' ? 'Gross Salary' : savedWageBase === 'BASIC' ? 'Basic + DA' : 'Monthly CTC'})`
                    : `Fixed Rate (₹${overtimePolicy.fixedRatePerHour || 100}/hr)`}
                </div>
              </div>

              <div>
                <span
                  style={{
                    color: '#64748B',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    display: 'block',
                    textTransform: 'uppercase',
                  }}
                >
                  Month Divisor:
                </span>
                <div style={{ fontWeight: 700, color: '#1E293B', marginTop: '3px' }}>
                  {formatDivisorLabel(savedDivisorMode)}
                </div>
              </div>

              <div>
                <span
                  style={{
                    color: '#64748B',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    display: 'block',
                    textTransform: 'uppercase',
                  }}
                >
                  Paid Working Hours:
                </span>
                <div style={{ fontWeight: 700, color: '#1E293B', marginTop: '3px' }}>
                  {savedPaidHours} hrs / day
                </div>
              </div>

              <div>
                <span
                  style={{
                    color: '#64748B',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    display: 'block',
                    textTransform: 'uppercase',
                  }}
                >
                  OT Multiplier:
                </span>
                <div style={{ marginTop: '3px' }}>
                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: '6px',
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      border: '1px solid #BBF7D0',
                      display: 'inline-block',
                    }}
                  >
                    {formatMultiplierDisplay(savedMultiplier)}
                  </span>
                </div>
              </div>
            </div>

            {/* Metadata Pill Badges */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  backgroundColor: '#EFF6FF',
                  color: '#1E40AF',
                  border: '1px solid #DBEAFE',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Calendar size={12} />
                Effective From: {formatDateDisplay(savedEffectiveFrom)}
              </span>

              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  backgroundColor: '#F1F5F9',
                  color: '#334155',
                  border: '1px solid #E2E8F0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <ShieldCheck size={12} />
                {overtimePolicy.approvalRequired !== false
                  ? 'HR / Manager Approval Required'
                  : 'Auto-Approved'}
              </span>

              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  backgroundColor: '#F0FDFA',
                  color: '#0F766E',
                  border: '1px solid #CCFBF1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <UserCheck size={12} />
                Employee Exceptions:{' '}
                {
                  activeEmployeeExceptions.filter(
                    e =>
                      (e.individualOtException &&
                        e.individualOtException !== 'Follow Department Policy' &&
                        e.individualOtException !== 'Follow Department' &&
                        e.individualOtException !== 'Default to Department') ||
                      e.statutoryEntitlement
                  ).length
                }
              </span>
            </div>
          </div>

          {/* Card Footer Actions (Matches LeaveManagementSettings.tsx) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid #F1F5F9',
              paddingTop: '14px',
              marginTop: '16px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {isHrOrCeo ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => openPolicyModal('edit')}
                    style={{
                      fontSize: '0.8rem',
                      padding: '7px 16px',
                      borderRadius: '8px',
                      backgroundColor: '#0E7490',
                      color: '#FFFFFF',
                      border: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Edit3 size={14} /> Edit Policy
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      const nextState = !isMasterEnabled;
                      const updated: OvertimePolicy = { ...overtimePolicy, enabled: nextState };
                      await supabaseDirect.saveCompanySetting('overtime_policy_data', updated);
                      updateOvertimePolicy({ enabled: nextState });
                    }}
                    style={{
                      fontSize: '0.8rem',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      color: '#334155',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {isMasterEnabled ? 'Disable Policy' : 'Enable Policy'}
                  </button>
                </>
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                  Active Policy (CEO &amp; HR Managed)
                </span>
              )}
            </div>

            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
              Sample ₹15,000 (Nov 30d, 9h):{' '}
              <strong style={{ color: '#0F172A' }}>₹55.56/hr</strong>
            </span>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* CREATE / EDIT OVERTIME (OT) POLICY MODAL                            */}
      {/* Matches Leave Policy modal sizing, header, body & sticky footer     */}
      {/* =================================================================== */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div
            className="modal-content"
            style={{
              maxWidth: '640px',
              width: '95%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '16px',
              overflow: 'hidden',
              backgroundColor: '#FFFFFF',
              boxShadow:
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
            }}
          >
            {/* MODAL HEADER */}
            <div
              className="modal-header"
              style={{
                borderBottom: '1px solid #E7ECF3',
                padding: '18px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
                flexShrink: 0,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                  {modalMode === 'create'
                    ? 'Create Overtime (OT) Policy'
                    : 'Create Overtime (OT) Policy'}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                  Configure overtime eligibility and salary calculation
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                title="Close"
                onClick={handleCancelModal}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* MODAL FORM */}
            <form
              onSubmit={handleSavePolicy}
              style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}
            >
              {/* SCROLLABLE MODAL BODY */}
              <div
                className="modal-body"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  padding: '20px 24px',
                  overflowY: 'auto',
                  maxHeight: 'calc(92vh - 140px)',
                }}
              >
                {/* Validation / Save Error Alert */}
                {modalError && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      color: '#DC2626',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* 1. APPLICABLE DEPARTMENTS (Searchable Multi-Select with Compact Chips) */}
                <div ref={deptDropdownRef} style={{ position: 'relative' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: '#0F172A',
                      marginBottom: '2px',
                    }}
                  >
                    Applicable Departments <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ fontSize: '0.76rem', color: '#64748B', marginBottom: '8px' }}>
                    Select departments eligible for overtime
                  </div>

                  {/* Multi-select chip box */}
                  <div
                    onClick={() => setIsDeptDropdownOpen(prev => !prev)}
                    style={{
                      minHeight: '44px',
                      padding: '6px 12px',
                      borderRadius: '10px',
                      border: isDeptDropdownOpen ? '1.5px solid #0E7490' : '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        alignItems: 'center',
                        flex: 1,
                      }}
                    >
                      {draftSelectedDepts.length > 0 ? (
                        draftSelectedDepts.map(deptName => (
                          <span
                            key={deptName}
                            onClick={e => {
                              e.stopPropagation();
                              toggleDraftDepartment(deptName);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              borderRadius: '9999px',
                              backgroundColor: '#0E7490',
                              color: '#FFFFFF',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {deptName}
                            <X size={12} strokeWidth={2.5} />
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.82rem', color: '#94A3B8' }}>
                          Click to select eligible departments...
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      size={16}
                      color="#64748B"
                      style={{
                        flexShrink: 0,
                        transform: isDeptDropdownOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  </div>

                  {/* Searchable Dropdown Popover */}
                  {isDeptDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #CBD5E1',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12)',
                        zIndex: 50,
                        padding: '10px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <div style={{ position: 'relative', flex: 1 }}>
                          <Search
                            size={13}
                            color="#94A3B8"
                            style={{
                              position: 'absolute',
                              left: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                            }}
                          />
                          <input
                            type="text"
                            value={deptSearchQuery}
                            onChange={e => setDeptSearchQuery(e.target.value)}
                            placeholder="Search departments..."
                            onClick={e => e.stopPropagation()}
                            style={{
                              width: '100%',
                              padding: '6px 10px 6px 28px',
                              borderRadius: '8px',
                              border: '1px solid #E2E8F0',
                              fontSize: '0.78rem',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setDraftSelectedDepts(
                                activeDepartmentPolicies
                                  .filter(d => isDefaultOtEligibleDepartment(d.department))
                                  .map(d => d.department)
                              );
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#0E7490',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                          >
                            FLOOR &amp; Dispatch
                          </button>
                          <span style={{ color: '#CBD5E1' }}>•</span>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setDraftSelectedDepts(activeDepartmentPolicies.map(d => d.department));
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#475569',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                          >
                            All
                          </button>
                          <span style={{ color: '#CBD5E1' }}>•</span>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setDraftSelectedDepts([]);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#64748B',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          maxHeight: '170px',
                          overflowY: 'auto',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                          gap: '6px',
                        }}
                      >
                        {filteredModalDepartments.map(dept => {
                          const isSelected = draftSelectedDepts.includes(dept.department);
                          return (
                            <button
                              key={dept.id}
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                toggleDraftDepartment(dept.department);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '7px 10px',
                                borderRadius: '8px',
                                border: isSelected ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                                backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                                color: isSelected ? '#0F172A' : '#475569',
                                fontSize: '0.78rem',
                                fontWeight: isSelected ? 700 : 500,
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              <span
                                style={{
                                  width: '16px',
                                  height: '16px',
                                  borderRadius: '4px',
                                  backgroundColor: isSelected ? '#0E7490' : '#FFFFFF',
                                  border: isSelected ? 'none' : '1px solid #CBD5E1',
                                  color: '#FFFFFF',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {isSelected && <Check size={11} strokeWidth={3} />}
                              </span>
                              <span
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {dept.department}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. CALCULATION METHOD */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: '#0F172A',
                      marginBottom: '8px',
                    }}
                  >
                    Calculation Method <span style={{ color: '#EF4444' }}>*</span>
                  </label>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setDraftCalcMethod('SALARY_BASED')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border:
                          draftCalcMethod === 'SALARY_BASED'
                            ? '1.5px solid #0E7490'
                            : '1px solid #CBD5E1',
                        backgroundColor:
                          draftCalcMethod === 'SALARY_BASED' ? '#ECFEFF' : '#FFFFFF',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border:
                            draftCalcMethod === 'SALARY_BASED'
                              ? '5px solid #0E7490'
                              : '1.5px solid #94A3B8',
                          backgroundColor: '#FFFFFF',
                          flexShrink: 0,
                          boxSizing: 'border-box',
                        }}
                      />
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                          Salary Based Rate
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '2px' }}>
                          Calculate hourly rate from employee&apos;s monthly salary
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDraftCalcMethod('FIXED_HOURLY')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border:
                          draftCalcMethod === 'FIXED_HOURLY'
                            ? '1.5px solid #0E7490'
                            : '1px solid #CBD5E1',
                        backgroundColor:
                          draftCalcMethod === 'FIXED_HOURLY' ? '#ECFEFF' : '#FFFFFF',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border:
                            draftCalcMethod === 'FIXED_HOURLY'
                              ? '5px solid #0E7490'
                              : '1.5px solid #94A3B8',
                          backgroundColor: '#FFFFFF',
                          flexShrink: 0,
                          boxSizing: 'border-box',
                        }}
                      />
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                          Fixed Hourly Rate
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '2px' }}>
                          Use a flat rate per hour (where permitted)
                        </div>
                      </div>
                    </button>
                  </div>

                  {draftCalcMethod === 'FIXED_HOURLY' && (
                    <div style={{ marginTop: '10px', maxWidth: '240px' }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color: '#334155',
                          marginBottom: '4px',
                        }}
                      >
                        Fixed Hourly Rate (₹ / hr) <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        step="1"
                        value={draftFixedHourlyRate}
                        onChange={e => setDraftFixedHourlyRate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.84rem',
                          color: '#0F172A',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* 3, 4, 5. THREE-COLUMN ROW: Monthly Divisor | Paid Working Hours / Day | OT Multiplier */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.35fr 0.9fr 1.15fr',
                    gap: '12px',
                  }}
                >
                  {/* Monthly Divisor */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#0F172A',
                        marginBottom: '6px',
                      }}
                    >
                      Monthly Divisor <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <select
                      value={draftDivisorMode}
                      onChange={e => setDraftDivisorMode(e.target.value as OtSalaryDivisorMode)}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#0F172A',
                        backgroundColor: '#FFFFFF',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="CALENDAR_DAYS">Automatic Month Days (28/29/30/31)</option>
                      <option value="FIXED_26">Statutory 26 Days</option>
                      <option value="FIXED_30">Fixed 30 Days</option>
                      <option value="WORKING_DAYS">Paid Working Days</option>
                      <option value="COMPANY_DIVISOR">Configured / Statutory Divisor</option>
                    </select>
                  </div>

                  {/* Paid Working Hours / Day */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#0F172A',
                        marginBottom: '6px',
                      }}
                    >
                      Paid Working Hours / Day <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        overflow: 'hidden',
                      }}
                    >
                      <input
                        type="number"
                        min={1}
                        max={24}
                        step="0.5"
                        value={draftPaidHoursPerDay}
                        onChange={e => {
                          setDraftPaidHoursPerDay(e.target.value);
                          setPreviewPaidHours(e.target.value);
                        }}
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          border: 'none',
                          outline: 'none',
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          color: '#0F172A',
                          boxSizing: 'border-box',
                        }}
                      />
                      <span
                        style={{
                          padding: '0 10px',
                          fontSize: '0.78rem',
                          color: '#64748B',
                          fontWeight: 600,
                          backgroundColor: '#F8FAFC',
                          borderLeft: '1px solid #E2E8F0',
                          alignSelf: 'stretch',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        hrs
                      </span>
                    </div>
                  </div>

                  {/* OT Multiplier */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#0F172A',
                        marginBottom: '6px',
                      }}
                    >
                      OT Multiplier <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <select
                      value={draftMultiplier}
                      onChange={e => setDraftMultiplier(e.target.value as OvertimeMultiplierType)}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#0F172A',
                        backgroundColor: '#FFFFFF',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="2x Salary">2× Salary (Statutory Rate)</option>
                      <option value="1.5x Salary">1.5× Salary</option>
                      <option value="1x Salary">1× Salary (Standard Rate)</option>
                    </select>
                  </div>
                </div>

                {/* 6 & 7. TWO-COLUMN ROW: Effective From | Policy Status */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.35fr 1fr',
                    gap: '16px',
                    alignItems: 'end',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#0F172A',
                        marginBottom: '6px',
                      }}
                    >
                      Effective From <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="date"
                      value={draftEffectiveFrom}
                      onChange={e => setDraftEffectiveFrom(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.84rem',
                        color: '#0F172A',
                        backgroundColor: '#FFFFFF',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#0F172A',
                        marginBottom: '6px',
                      }}
                    >
                      Policy Status
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        height: '38px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setDraftEnabled(prev => !prev)}
                        style={{
                          width: '44px',
                          height: '24px',
                          borderRadius: '9999px',
                          backgroundColor: draftEnabled ? '#0E7490' : '#CBD5E1',
                          border: 'none',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease',
                          padding: 0,
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: '3px',
                            left: draftEnabled ? '23px' : '3px',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: '#FFFFFF',
                            transition: 'left 0.2s ease',
                          }}
                        />
                      </button>
                      <span
                        style={{
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          color: draftEnabled ? '#0F172A' : '#64748B',
                        }}
                      >
                        {draftEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 8. CALCULATION PREVIEW (Matches Reference Screenshot Exactly) */}
                <div
                  style={{
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF',
                    overflow: 'hidden',
                  }}
                >
                  {/* Preview Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      backgroundColor: '#F0FDFA',
                      borderBottom: '1px solid #CCFBF1',
                    }}
                  >
                    <div
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '8px',
                        backgroundColor: '#CCFBF1',
                        color: '#0E7490',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Calculator size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                        Calculation Preview
                      </div>
                      <div style={{ fontSize: '0.73rem', color: '#475569' }}>
                        Example based on sample values (for reference only)
                      </div>
                    </div>
                  </div>

                  {/* Preview Body */}
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* 4 Sample Inputs */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.1fr 1.35fr 0.9fr 0.8fr',
                        gap: '10px',
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            color: '#475569',
                            marginBottom: '4px',
                          }}
                        >
                          Monthly Salary (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="500"
                          value={previewSalary}
                          onChange={e => setPreviewSalary(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#0F172A',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            color: '#475569',
                            marginBottom: '4px',
                          }}
                        >
                          Month
                        </label>
                        <select
                          value={previewMonth}
                          onChange={e => setPreviewMonth(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '7px 8px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: '#0F172A',
                            backgroundColor: '#FFFFFF',
                            boxSizing: 'border-box',
                          }}
                        >
                          {PREVIEW_MONTH_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            color: '#475569',
                            marginBottom: '4px',
                          }}
                        >
                          Paid Hours / Day
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={24}
                          step="0.5"
                          value={previewPaidHours}
                          onChange={e => setPreviewPaidHours(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#0F172A',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            color: '#475569',
                            marginBottom: '4px',
                          }}
                        >
                          OT Hours
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={200}
                          step="0.5"
                          value={previewOtHours}
                          onChange={e => setPreviewOtHours(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#0F172A',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>

                    {/* 4 Computed Output Cells */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 0.9fr 1.2fr',
                        alignItems: 'center',
                        backgroundColor: '#F0F9FF',
                        borderRadius: '10px',
                        padding: '8px',
                        gap: '6px',
                      }}
                    >
                      <div
                        style={{
                          textAlign: 'center',
                          borderRight: '1px solid #CBD5E1',
                          padding: '4px 6px',
                        }}
                      >
                        <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600 }}>
                          Daily Rate
                        </div>
                        <div
                          style={{
                            fontSize: '0.96rem',
                            fontWeight: 800,
                            color: '#0F172A',
                            marginTop: '2px',
                          }}
                        >
                          ₹{previewResult.dailyRate.toFixed(2)}
                        </div>
                      </div>

                      <div
                        style={{
                          textAlign: 'center',
                          borderRight: '1px solid #CBD5E1',
                          padding: '4px 6px',
                        }}
                      >
                        <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600 }}>
                          Hourly Rate
                        </div>
                        <div
                          style={{
                            fontSize: '0.96rem',
                            fontWeight: 800,
                            color: '#0F172A',
                            marginTop: '2px',
                          }}
                        >
                          ₹{previewResult.baseHourlyRate.toFixed(2)}
                        </div>
                      </div>

                      <div
                        style={{
                          textAlign: 'center',
                          padding: '4px 6px',
                        }}
                      >
                        <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600 }}>
                          OT Multiplier
                        </div>
                        <div
                          style={{
                            fontSize: '0.96rem',
                            fontWeight: 800,
                            color: '#0F172A',
                            marginTop: '2px',
                          }}
                        >
                          {previewResult.shortMultiplier}
                        </div>
                      </div>

                      <div
                        style={{
                          textAlign: 'center',
                          backgroundColor: '#DCFCE7',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          border: '1px solid #BBF7D0',
                        }}
                      >
                        <div style={{ fontSize: '0.7rem', color: '#15803D', fontWeight: 700 }}>
                          OT Amount
                        </div>
                        <div
                          style={{
                            fontSize: '1.05rem',
                            fontWeight: 800,
                            color: '#15803D',
                            marginTop: '1px',
                          }}
                        >
                          ₹
                          {previewResult.otAmount.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 9. COLLAPSED ACCORDION: Advanced Settings (Exceptions, Wage Base & Payslip Visibility) */}
                <div
                  style={{
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowAdvancedInModal(prev => !prev)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      background: 'none',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sliders size={15} color="#0E7490" />
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B' }}>
                        Advanced Settings (Exceptions, Wage Base &amp; Payslip Visibility)
                      </span>
                    </div>
                    {showAdvancedInModal ? (
                      <ChevronUp size={16} color="#64748B" />
                    ) : (
                      <ChevronDown size={16} color="#64748B" />
                    )}
                  </button>

                  {showAdvancedInModal && (
                    <div
                      style={{
                        padding: '14px',
                        borderTop: '1px solid #E2E8F0',
                        backgroundColor: '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                      }}
                    >
                      {/* Wage Base & Approval Row */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '12px',
                        }}
                      >
                        {draftCalcMethod === 'SALARY_BASED' && (
                          <div>
                            <label
                              style={{
                                display: 'block',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: '#334155',
                                marginBottom: '4px',
                              }}
                            >
                              Eligible Monthly Wage Base
                            </label>
                            <select
                              value={draftWageBase}
                              onChange={e => setDraftWageBase(e.target.value as OtWageBaseMode)}
                              style={{
                                width: '100%',
                                padding: '7px 10px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.78rem',
                                color: '#0F172A',
                                backgroundColor: '#FFFFFF',
                              }}
                            >
                              <option value="GROSS">Gross Salary (Default)</option>
                              <option value="BASIC">Basic + DA</option>
                              <option value="CTC">Monthly CTC</option>
                            </select>
                          </div>
                        )}

                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: '4px',
                            }}
                          >
                            Overtime Approval
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '7px 10px',
                              borderRadius: '8px',
                              border: '1px solid #E2E8F0',
                              backgroundColor: '#F8FAFC',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              color: '#0F172A',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={draftApprovalRequired}
                              onChange={e => setDraftApprovalRequired(e.target.checked)}
                              style={{ accentColor: '#0E7490' }}
                            />
                            Require HR / Manager Approval
                          </label>
                        </div>
                      </div>

                      {/* Compact Payslip Visibility */}
                      <div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#334155',
                            marginBottom: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <Eye size={13} color="#0E7490" /> Payslip Visibility
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '8px',
                          }}
                        >
                          {(
                            [
                              { key: 'showOtAmountOnPayslip', label: 'Show OT Amount' },
                              { key: 'showOtHoursOnPayslip', label: 'Show OT Hours' },
                              {
                                key: 'showOtCalculationDetailsOnPayslip',
                                label: 'Show Formula',
                              },
                            ] as const
                          ).map(item => (
                            <label
                              key={item.key}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 8px',
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: draftPayslipVis[item.key] ? '#ECFEFF' : '#F8FAFC',
                                fontSize: '0.74rem',
                                fontWeight: 600,
                                color: '#1E293B',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(draftPayslipVis[item.key])}
                                onChange={e =>
                                  setDraftPayslipVis(prev => ({
                                    ...prev,
                                    [item.key]: e.target.checked,
                                  }))
                                }
                                style={{ accentColor: '#0E7490' }}
                              />
                              {item.label}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Employee Overtime Exceptions (CEO Excluded) */}
                      <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#334155',
                            marginBottom: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <UserCheck size={13} color="#0E7490" /> Employee Overtime Exceptions (CEO
                          Exempt)
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 0.9fr 0.8fr auto',
                            gap: '8px',
                            alignItems: 'end',
                          }}
                        >
                          <div>
                            <select
                              value={selectedExceptionEmpId}
                              onChange={e => setSelectedExceptionEmpId(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.76rem',
                              }}
                            >
                              <option value="">Select employee...</option>
                              {filteredModalEmployees.map(emp => (
                                <option key={emp.id} value={emp.employeeId}>
                                  {emp.firstName} {emp.lastName} ({emp.department})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <select
                              value={exceptionMode}
                              onChange={e =>
                                setExceptionMode(e.target.value as IndividualOtException)
                              }
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.76rem',
                              }}
                            >
                              <option value="Allow OT">Allow OT</option>
                              <option value="Block OT">Restrict OT</option>
                            </select>
                          </div>

                          <div>
                            <input
                              type="number"
                              min={0}
                              placeholder="Custom ₹/hr"
                              value={exceptionCustomRate}
                              onChange={e => setExceptionCustomRate(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.76rem',
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>

                          <button
                            type="button"
                            disabled={!selectedExceptionEmpId}
                            onClick={handleStageEmployeeException}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: selectedExceptionEmpId ? '#0E7490' : '#CBD5E1',
                              color: '#FFFFFF',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: selectedExceptionEmpId ? 'pointer' : 'not-allowed',
                            }}
                          >
                            + Add
                          </button>
                        </div>

                        {visibleExceptionList.length > 0 && (
                          <div
                            style={{
                              marginTop: '8px',
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '6px',
                            }}
                          >
                            {visibleExceptionList.map(ep => (
                              <span
                                key={ep.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '3px 8px',
                                  borderRadius: '9999px',
                                  backgroundColor:
                                    ep.individualOtException === 'Block OT'
                                      ? '#FEE2E2'
                                      : '#DCFCE7',
                                  color:
                                    ep.individualOtException === 'Block OT'
                                      ? '#B91C1C'
                                      : '#15803D',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                }}
                              >
                                {ep.employeeName}: {ep.individualOtException}
                                {ep.customHourlyRate ? ` (₹${ep.customHourlyRate}/hr)` : ''}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDraftException(ep.employeeId)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    cursor: 'pointer',
                                    color: 'inherit',
                                    display: 'inline-flex',
                                  }}
                                >
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* STICKY MODAL FOOTER (Always Visible) */}
              <div
                className="modal-footer"
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 24px',
                  borderTop: '1px solid #E7ECF3',
                  backgroundColor: '#F8FAFC',
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isSaving}
                  onClick={handleCancelModal}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSaving}
                  style={{
                    padding: '9px 22px',
                    borderRadius: '10px',
                    backgroundColor: '#0E7490',
                    border: '1px solid #0E7490',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.75 : 1,
                  }}
                >
                  <Save size={15} />
                  {isSaving ? 'Saving Policy...' : 'Save Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
