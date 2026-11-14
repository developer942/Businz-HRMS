import React, { useState, useMemo } from 'react';
import {
  Sliders,
  Eye,
  UserCheck,
  ShieldCheck,
  Calculator,
  Search,
  Plus,
  X,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Check
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
  OvertimeMultiplierType
} from '../../types/attendanceEnterprise';
import { isOwnerOrCEO } from '../../data/hrmsInitialData';

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
    currentUser
  } = useHRMS();

  // Section 1: Department search
  const [deptSearchQuery, setDeptSearchQuery] = useState('');

  // Section 2: Collapsible Advanced Settings
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Section 3: Live Calculation Preview state (defaults match the ₹15,000 / Nov 2026 / 9h / 10h benchmark)
  const [previewSalary, setPreviewSalary] = useState<string>('15000');
  const [previewPayrollMonth, setPreviewPayrollMonth] = useState<string>('2026-11');
  const [previewDailyHours, setPreviewDailyHours] = useState<string>(
    String(overtimePolicy.defaultDailyPaidHours || 9)
  );
  const [previewOtHours, setPreviewOtHours] = useState<string>('10');
  const [previewMultiplier, setPreviewMultiplier] = useState<OvertimeMultiplierType>('1x Salary');

  // Manage Exceptions Dialog state
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [selectedExceptionEmpId, setSelectedExceptionEmpId] = useState<string>('');
  const [exceptionMode, setExceptionMode] = useState<IndividualOtException>('Allow OT');
  const [statutoryFlag, setStatutoryFlag] = useState<boolean>(false);
  const [exceptionCustomRate, setExceptionCustomRate] = useState<string>('');
  const [exceptionEffectiveFrom, setExceptionEffectiveFrom] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [exceptionEffectiveTo, setExceptionEffectiveTo] = useState<string>('');
  const [exceptionReason, setExceptionReason] = useState<string>('');

  const isHrOrCeo =
    currentUser?.role === 'CEO' ||
    currentUser?.role === 'HR' ||
    currentUser?.role === 'HR Manager' ||
    currentUser?.role === 'HR Admin' ||
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'Management' ||
    currentUser?.role === 'ERP Administrator';

  const isMasterEnabled = overtimePolicy.enabled !== false;

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

  const filteredDepartments = useMemo(() => {
    const q = deptSearchQuery.trim().toLowerCase();
    if (!q) return activeDepartmentPolicies;
    return activeDepartmentPolicies.filter(d => d.department.toLowerCase().includes(q));
  }, [activeDepartmentPolicies, deptSearchQuery]);

  const enabledDeptCount = useMemo(
    () => activeDepartmentPolicies.filter(d => d.otAllowed).length,
    [activeDepartmentPolicies]
  );

  const handleBulkDepartmentToggle = (mode: 'ALL_ON' | 'ALL_OFF' | 'DEFAULT') => {
    if (!isHrOrCeo || !isMasterEnabled) return;
    activeDepartmentPolicies.forEach(dept => {
      const nextAllowed =
        mode === 'ALL_ON'
          ? true
          : mode === 'ALL_OFF'
            ? false
            : isDefaultOtEligibleDepartment(dept.department);
      updateDepartmentOtPolicy(dept.id, {
        department: dept.department,
        otAllowed: nextAllowed,
      });
    });
  };

  // Calculation method & divisor state derived from overtimePolicy
  const isSalaryBased = (overtimePolicy.wageBase || 'GROSS') !== 'FIXED_HOURLY';
  const activeWageBase: OtWageBaseMode =
    overtimePolicy.wageBase && overtimePolicy.wageBase !== 'FIXED_HOURLY'
      ? overtimePolicy.wageBase
      : 'GROSS';
  const activeDivisorMode: OtSalaryDivisorMode = overtimePolicy.divisorMode || 'CALENDAR_DAYS';
  const isAutomaticMonthDays = activeDivisorMode === 'CALENDAR_DAYS';

  const handleDivisorModeChange = (mode: OtSalaryDivisorMode) => {
    if (!isHrOrCeo || !isMasterEnabled) return;
    updateOvertimePolicy({ divisorMode: mode });
    if (updatePayrollSettingsConfig) {
      if (mode === 'CALENDAR_DAYS') {
        updatePayrollSettingsConfig({ salaryDivisorMode: 'CALENDAR_DAYS' });
      } else if (mode === 'WORKING_DAYS') {
        updatePayrollSettingsConfig({ salaryDivisorMode: 'WORKING_DAYS' });
      } else if (mode === 'FIXED_26') {
        updatePayrollSettingsConfig({
          salaryDivisorMode: 'FIXED_DAYS',
          standardWorkingDaysPerMonth: 26,
        });
      } else if (mode === 'FIXED_30') {
        updatePayrollSettingsConfig({
          salaryDivisorMode: 'FIXED_DAYS',
          standardWorkingDaysPerMonth: 30,
        });
      }
    }
  };

  const payslipVis = {
    showOtHoursOnPayslip: true,
    showOtAmountOnPayslip: true,
    showOtRateOnPayslip: true,
    showOtCalculationDetailsOnPayslip: false,
    showEmployerContributionOnPayslip: false,
    ...(overtimePolicy?.payslipVisibility || {}),
    ...(payrollSettingsConfig?.payslipOvertimeVisibility || {}),
  };

  const handlePayslipVisibilityToggle = (
    field:
      | 'showOtHoursOnPayslip'
      | 'showOtAmountOnPayslip'
      | 'showOtCalculationDetailsOnPayslip'
  ) => {
    if (!isHrOrCeo) return;
    const nextVis = {
      ...payslipVis,
      [field]: !payslipVis[field],
    };
    updateOvertimePolicy({ payslipVisibility: nextVis });
    if (updatePayrollSettingsConfig) {
      updatePayrollSettingsConfig({ payslipOvertimeVisibility: nextVis });
    }
  };

  // Section 3: Live Calculation Preview computation
  const previewResult = useMemo(() => {
    const [yearPart, monthPart] = (previewPayrollMonth || '2026-11').split('-');
    const yearNum = Number(yearPart) || 2026;
    const monthNum = Number(monthPart) || 11;
    const calendarDays = getCalendarDaysInMonth(monthNum, yearNum);

    const divisorResolved = resolvePayrollSalaryDivisor({
      month: monthNum,
      year: yearNum,
      payrollConfig: payrollSettingsConfig,
      overtimePolicy,
      divisorModeOverride: activeDivisorMode,
    });

    const divisorDays = divisorResolved.divisorDays || calendarDays;
    const salaryNum = Math.max(0, Number(previewSalary) || 0);
    const paidHoursNum = Math.max(1, Number(previewDailyHours) || Number(overtimePolicy.defaultDailyPaidHours) || 9);
    const otHoursNum = Math.max(0, Number(previewOtHours) || 0);

    const calcSelected = calculateEnterpriseOvertimeRateAndAmount({
      approvedOtHours: otHoursNum,
      wageBaseMode: isSalaryBased ? activeWageBase : 'FIXED_HOURLY',
      basicSalary: salaryNum,
      grossSalary: salaryNum,
      monthlyCtc: salaryNum,
      fixedHourlyRate: overtimePolicy.fixedRatePerHour || 100,
      divisor: divisorDays,
      dailyPaidHours: paidHoursNum,
      multiplier: previewMultiplier,
      month: monthNum,
      year: yearNum,
    });

    const calc1x = calculateEnterpriseOvertimeRateAndAmount({
      approvedOtHours: otHoursNum,
      wageBaseMode: isSalaryBased ? activeWageBase : 'FIXED_HOURLY',
      basicSalary: salaryNum,
      grossSalary: salaryNum,
      monthlyCtc: salaryNum,
      fixedHourlyRate: overtimePolicy.fixedRatePerHour || 100,
      divisor: divisorDays,
      dailyPaidHours: paidHoursNum,
      multiplier: '1x Salary',
      month: monthNum,
      year: yearNum,
    });

    const calc2x = calculateEnterpriseOvertimeRateAndAmount({
      approvedOtHours: otHoursNum,
      wageBaseMode: isSalaryBased ? activeWageBase : 'FIXED_HOURLY',
      basicSalary: salaryNum,
      grossSalary: salaryNum,
      monthlyCtc: salaryNum,
      fixedHourlyRate: overtimePolicy.fixedRatePerHour || 100,
      divisor: divisorDays,
      dailyPaidHours: paidHoursNum,
      multiplier: '2x Salary',
      month: monthNum,
      year: yearNum,
    });

    const dailyRate = divisorDays > 0 ? Math.round(((salaryNum / divisorDays) + Number.EPSILON) * 100) / 100 : 0;

    return {
      monthNum,
      yearNum,
      calendarDays,
      divisorDays,
      salaryNum,
      paidHoursNum,
      otHoursNum,
      dailyRate,
      baseHourlyRate: calcSelected.baseHourlyRate,
      effectiveHourlyRate: calcSelected.hourlyRate,
      otAmount: calcSelected.overtimeAmount,
      amount1x: calc1x.overtimeAmount,
      amount2x: calc2x.overtimeAmount,
      multiplierFactor: calcSelected.multiplierFactor,
    };
  }, [
    previewSalary,
    previewPayrollMonth,
    previewDailyHours,
    previewOtHours,
    previewMultiplier,
    activeDivisorMode,
    isSalaryBased,
    activeWageBase,
    overtimePolicy,
    payrollSettingsConfig,
  ]);

  // Employee Exceptions modal helpers (excludes CEO completely)
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

  const activeEmployeeExceptions = useMemo(
    () => employeeOtPolicies.filter(ep => !isOwnerOrCEO(ep as any)),
    [employeeOtPolicies]
  );

  const selectedModalEmployee = useMemo(
    () =>
      employees.find(
        e =>
          !isOwnerOrCEO(e) &&
          (e.employeeId === selectedExceptionEmpId || e.id === selectedExceptionEmpId)
      ),
    [employees, selectedExceptionEmpId]
  );

  const handleSaveEmployeeException = () => {
    if (!selectedExceptionEmpId) return;
    const emp = employees.find(
      e => e.employeeId === selectedExceptionEmpId || e.id === selectedExceptionEmpId
    );
    if (!emp || isOwnerOrCEO(emp)) return;
    updateEmployeeOtPolicy(emp.employeeId, {
      employeeId: emp.employeeId,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      department: emp.department,
      departmentDefaultOt: isDefaultOtEligibleDepartment(emp.department),
      individualOtException: exceptionMode,
      individualException: exceptionMode,
      statutoryEntitlement: statutoryFlag,
      customHourlyRate: exceptionCustomRate ? Number(exceptionCustomRate) : undefined,
      effectiveFrom: exceptionEffectiveFrom || undefined,
      effectiveTo: exceptionEffectiveTo || undefined,
      notes:
        exceptionReason.trim() ||
        `Configured by ${currentUser?.name || currentUser?.role || 'HR'}`,
    });
    setSelectedExceptionEmpId('');
    setExceptionCustomRate('');
    setExceptionEffectiveTo('');
    setExceptionReason('');
    setStatutoryFlag(false);
  };

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* PAGE HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid #E7ECF3',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
            Overtime Policy
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
            Set up overtime in three simple steps
          </p>
        </div>

        <span
          style={{
            padding: '5px 14px',
            borderRadius: '9999px',
            fontSize: '0.76rem',
            fontWeight: 700,
            backgroundColor: isMasterEnabled ? '#DCFCE7' : '#FEF3C7',
            color: isMasterEnabled ? '#15803D' : '#B45309',
            border: isMasterEnabled ? '1px solid #BBF7D0' : '1px solid #FDE68A',
          }}
        >
          {isMasterEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {/* =================================================================== */}
      {/* SECTION 1 — ELIGIBLE DEPARTMENTS: Who Can Receive Overtime?         */}
      {/* =================================================================== */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          paddingBottom: '22px',
          borderBottom: '1px solid #E7ECF3',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
              1. Allow Overtime — Who Can Receive Overtime?
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
              Select departments eligible for OT ({enabledDeptCount} of {activeDepartmentPolicies.length} enabled)
            </div>
          </div>

          <button
            type="button"
            disabled={!isHrOrCeo}
            onClick={() => updateOvertimePolicy({ enabled: !isMasterEnabled })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 14px',
              borderRadius: '9999px',
              border: isMasterEnabled ? '1px solid #0E7490' : '1px solid #CBD5E1',
              backgroundColor: isMasterEnabled ? '#ECFEFF' : '#F8FAFC',
              color: isMasterEnabled ? '#0E7490' : '#64748B',
              fontWeight: 800,
              fontSize: '0.8rem',
              cursor: isHrOrCeo ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
            }}
          >
            <span
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: isMasterEnabled ? '#0E7490' : '#CBD5E1',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isMasterEnabled && <Check size={12} strokeWidth={3} />}
            </span>
            {isMasterEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Search & Compact Quick Selection Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: '320px' }}>
            <Search
              size={14}
              color="#94A3B8"
              style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              value={deptSearchQuery}
              onChange={e => setDeptSearchQuery(e.target.value)}
              placeholder="Search department..."
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '0.8rem',
                color: '#1E293B',
                backgroundColor: '#F8FAFC',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {isHrOrCeo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={!isMasterEnabled}
                onClick={() => handleBulkDepartmentToggle('DEFAULT')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '8px',
                  border: '1px solid #CFFAFE',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  cursor: isMasterEnabled ? 'pointer' : 'not-allowed',
                }}
              >
                FLOOR &amp; Dispatch Loading Only
              </button>
              <button
                type="button"
                disabled={!isMasterEnabled}
                onClick={() => handleBulkDepartmentToggle('ALL_ON')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  cursor: isMasterEnabled ? 'pointer' : 'not-allowed',
                }}
              >
                Select All
              </button>
              <button
                type="button"
                disabled={!isMasterEnabled}
                onClick={() => handleBulkDepartmentToggle('ALL_OFF')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  cursor: isMasterEnabled ? 'pointer' : 'not-allowed',
                }}
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* Clean 2-Column Department Pill Grid (No hourly rate inputs, no ₹100 fields) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '10px',
            opacity: isMasterEnabled ? 1 : 0.55,
          }}
        >
          {filteredDepartments.map(dept => {
            const isAllowed = Boolean(dept.otAllowed);
            return (
              <button
                key={dept.id}
                type="button"
                disabled={!isHrOrCeo || !isMasterEnabled}
                onClick={() =>
                  updateDepartmentOtPolicy(dept.id, {
                    department: dept.department,
                    otAllowed: !isAllowed,
                  })
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '11px 14px',
                  borderRadius: '12px',
                  border: isAllowed ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                  backgroundColor: isAllowed ? '#ECFEFF' : '#FFFFFF',
                  cursor: isHrOrCeo && isMasterEnabled ? 'pointer' : 'not-allowed',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: isAllowed ? 'none' : '1.5px solid #CBD5E1',
                      backgroundColor: isAllowed ? '#0E7490' : 'transparent',
                      color: '#FFFFFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isAllowed && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: isAllowed ? 700 : 600,
                      color: isAllowed ? '#0F172A' : '#475569',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dept.department}
                  </span>
                </div>

                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: isAllowed ? '#0E7490' : '#F1F5F9',
                    color: isAllowed ? '#FFFFFF' : '#64748B',
                    flexShrink: 0,
                  }}
                >
                  {isAllowed ? 'ON' : 'OFF'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =================================================================== */}
      {/* SECTION 2 — HOW OVERTIME IS CALCULATED                              */}
      {/* =================================================================== */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          paddingBottom: '22px',
          borderBottom: '1px solid #E7ECF3',
          opacity: isMasterEnabled ? 1 : 0.6,
        }}
      >
        <div>
          <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
            2. How to Calculate OT — How Should Overtime Be Calculated?
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
            Automatically derives each employee&apos;s hourly overtime rate from their monthly salary
          </div>
        </div>

        {/* Highlighted Salary-Based Calculation Formula Banner */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
              {isSalaryBased ? 'Salary-Based Calculation' : 'Fixed Hourly Rate Calculation'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '3px', fontFamily: 'monospace' }}>
              {isSalaryBased
                ? 'Eligible Monthly Wages ÷ Month Days ÷ Paid Daily Hours × OT Hours × Applicable Multiplier'
                : 'Fixed Hourly Rate × Approved OT Hours × Applicable Multiplier'}
            </div>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: 700,
              backgroundColor: '#DCFCE7',
              color: '#15803D',
              border: '1px solid #BBF7D0',
            }}
          >
            Recommended
          </span>
        </div>

        {/* Field 1: Calculation Method */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#334155',
              marginBottom: '8px',
            }}
          >
            Calculation Method
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            <button
              type="button"
              disabled={!isHrOrCeo || !isMasterEnabled}
              onClick={() =>
                updateOvertimePolicy({
                  wageBase:
                    overtimePolicy.wageBase && overtimePolicy.wageBase !== 'FIXED_HOURLY'
                      ? overtimePolicy.wageBase
                      : 'GROSS',
                  rateMethod: 'Daily Salary Based',
                })
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '11px 14px',
                borderRadius: '10px',
                border: isSalaryBased ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                backgroundColor: isSalaryBased ? '#ECFEFF' : '#FFFFFF',
                cursor: isHrOrCeo && isMasterEnabled ? 'pointer' : 'not-allowed',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  border: isSalaryBased ? '5px solid #0E7490' : '1.5px solid #94A3B8',
                  backgroundColor: '#FFFFFF',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                }}
              />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                  Salary-Based Rate (Recommended)
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                  Individual hourly rate from employee salary
                </div>
              </div>
            </button>

            <button
              type="button"
              disabled={!isHrOrCeo || !isMasterEnabled}
              onClick={() =>
                updateOvertimePolicy({
                  wageBase: 'FIXED_HOURLY',
                  rateMethod: 'Fixed Amount Per Hour',
                  fixedRatePerHour: overtimePolicy.fixedRatePerHour || 100,
                })
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '11px 14px',
                borderRadius: '10px',
                border: !isSalaryBased ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                backgroundColor: !isSalaryBased ? '#ECFEFF' : '#FFFFFF',
                cursor: isHrOrCeo && isMasterEnabled ? 'pointer' : 'not-allowed',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  border: !isSalaryBased ? '5px solid #0E7490' : '1.5px solid #94A3B8',
                  backgroundColor: '#FFFFFF',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                }}
              />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                  Fixed Hourly Rate (where permitted)
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                  Flat rate only when legally permitted
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Show Fixed Hourly Rate input ONLY if Fixed Hourly Rate method is explicitly selected */}
        {!isSalaryBased && (
          <div style={{ maxWidth: '280px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.76rem',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '5px',
              }}
            >
              Permitted Fixed Hourly Rate (₹ / hr)
            </label>
            <input
              type="number"
              min={1}
              disabled={!isHrOrCeo || !isMasterEnabled}
              value={overtimePolicy.fixedRatePerHour || 100}
              onChange={e =>
                updateOvertimePolicy({
                  fixedRatePerHour: Math.max(1, Number(e.target.value) || 0),
                })
              }
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.84rem',
                color: '#0F172A',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Field 2: Monthly Divisor (Radio options matching reference design) */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#334155',
              marginBottom: '8px',
            }}
          >
            Monthly Divisor
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.84rem',
                fontWeight: isAutomaticMonthDays ? 700 : 500,
                color: '#0F172A',
                cursor: isHrOrCeo && isMasterEnabled ? 'pointer' : 'not-allowed',
              }}
            >
              <input
                type="radio"
                name="otMonthlyDivisor"
                checked={isAutomaticMonthDays}
                disabled={!isHrOrCeo || !isMasterEnabled}
                onChange={() => handleDivisorModeChange('CALENDAR_DAYS')}
                style={{ accentColor: '#0E7490', width: '16px', height: '16px' }}
              />
              <span>Automatic month days (28/29/30/31)</span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.84rem',
                  fontWeight: !isAutomaticMonthDays ? 700 : 500,
                  color: '#0F172A',
                  cursor: isHrOrCeo && isMasterEnabled ? 'pointer' : 'not-allowed',
                }}
              >
                <input
                  type="radio"
                  name="otMonthlyDivisor"
                  checked={!isAutomaticMonthDays}
                  disabled={!isHrOrCeo || !isMasterEnabled}
                  onChange={() =>
                    handleDivisorModeChange(
                      activeDivisorMode === 'CALENDAR_DAYS' ? 'FIXED_26' : activeDivisorMode
                    )
                  }
                  style={{ accentColor: '#0E7490', width: '16px', height: '16px' }}
                />
                <span>Applicable statutory / configured divisor</span>
              </label>

              {!isAutomaticMonthDays && (
                <select
                  disabled={!isHrOrCeo || !isMasterEnabled}
                  value={activeDivisorMode}
                  onChange={e => handleDivisorModeChange(e.target.value as OtSalaryDivisorMode)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <option value="FIXED_26">Statutory 26 Days</option>
                  <option value="FIXED_30">Fixed 30 Days</option>
                  <option value="WORKING_DAYS">Paid Working Days (Excl. Weekly Offs)</option>
                  <option value="COMPANY_DIVISOR">
                    Company Configured ({payrollSettingsConfig?.standardWorkingDaysPerMonth || 26} Days)
                  </option>
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Fields 3 & 4: Paid Working Hours per Day & Applicable OT Multiplier */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '6px',
              }}
            >
              Paid Working Hours per Day
            </label>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              disabled={!isHrOrCeo || !isMasterEnabled}
              value={overtimePolicy.defaultDailyPaidHours || 9}
              onChange={e => {
                const hrs = Math.max(1, Math.min(24, Number(e.target.value) || 9));
                updateOvertimePolicy({ defaultDailyPaidHours: hrs });
                setPreviewDailyHours(String(hrs));
              }}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#0F172A',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ display: 'block', fontSize: '0.71rem', color: '#64748B', marginTop: '4px' }}>
              Uses employee&apos;s shift hours or this company default (9 hrs)
            </span>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '6px',
              }}
            >
              Applicable OT Multiplier
            </label>
            <select
              disabled={!isHrOrCeo || !isMasterEnabled}
              value={overtimePolicy.defaultMultiplier || '2x Salary'}
              onChange={e => {
                const mult = e.target.value as OvertimeMultiplierType;
                const factor = mult === '2x Salary' ? 2.0 : mult === '1.5x Salary' ? 1.5 : 1.0;
                updateOvertimePolicy({
                  defaultMultiplier: mult,
                  rateType: mult as any,
                  regularMultiplier: factor,
                });
              }}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#0F172A',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box',
              }}
            >
              <option value="2x Salary">2× Salary (Statutory Double Rate)</option>
              <option value="1.5x Salary">1.5× Salary</option>
              <option value="1x Salary">1× Salary (Standard Hourly Rate)</option>
            </select>
            <span style={{ display: 'block', fontSize: '0.71rem', color: '#64748B', marginTop: '4px' }}>
              Resolved from effective policy and statutory rules
            </span>
          </div>
        </div>

        {/* Compact Advanced Settings & Employee Exceptions Bar */}
        <div
          style={{
            marginTop: '4px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => setShowAdvancedSettings(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'none',
                border: 'none',
                padding: 0,
                color: '#0F172A',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Sliders size={14} color="#0E7490" />
              <span>Advanced Settings (Wage Base, Payslip Visibility &amp; Compliance)</span>
              {showAdvancedSettings ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            <button
              type="button"
              onClick={() => setIsExceptionModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #0E7490',
                backgroundColor: '#FFFFFF',
                color: '#0E7490',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <UserCheck size={13} />
              <span>Manage Exceptions ({activeEmployeeExceptions.length})</span>
            </button>
          </div>

          {showAdvancedSettings && (
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
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                  gap: '12px',
                }}
              >
                {isSalaryBased && (
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#475569',
                        marginBottom: '4px',
                      }}
                    >
                      Eligible Wage Base
                    </label>
                    <select
                      disabled={!isHrOrCeo}
                      value={activeWageBase}
                      onChange={e =>
                        updateOvertimePolicy({ wageBase: e.target.value as OtWageBaseMode })
                      }
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.8rem',
                        color: '#0F172A',
                      }}
                    >
                      <option value="GROSS">Gross Salary (Basic + Allowances)</option>
                      <option value="BASIC">Basic Salary Only</option>
                      <option value="CTC">Monthly CTC</option>
                    </select>
                  </div>
                )}

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: '#475569',
                      marginBottom: '4px',
                    }}
                  >
                    Approval Requirement
                  </label>
                  <select
                    disabled={!isHrOrCeo}
                    value={overtimePolicy.approvalRequired !== false ? 'REQUIRED' : 'AUTO'}
                    onChange={e =>
                      updateOvertimePolicy({
                        approvalRequired: e.target.value === 'REQUIRED',
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.8rem',
                      color: '#0F172A',
                    }}
                  >
                    <option value="REQUIRED">Require HR / Manager Approval</option>
                    <option value="AUTO">Auto-Approve Eligible Dept OT</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: '#475569',
                      marginBottom: '4px',
                    }}
                  >
                    Policy Effective Date
                  </label>
                  <input
                    type="date"
                    disabled={!isHrOrCeo}
                    value={overtimePolicy.effectiveFrom || '2026-01-01'}
                    onChange={e => updateOvertimePolicy({ effectiveFrom: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.8rem',
                      color: '#0F172A',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Compact Payslip Visibility ON/OFF Switches */}
              <div
                style={{
                  paddingTop: '10px',
                  borderTop: '1px solid #F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={14} color="#0E7490" />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                    Payslip Visibility:
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {(
                    [
                      { key: 'showOtAmountOnPayslip', label: 'Show OT Amount' },
                      { key: 'showOtHoursOnPayslip', label: 'Show OT Hours' },
                      { key: 'showOtCalculationDetailsOnPayslip', label: 'Show OT Calculation Details' },
                    ] as const
                  ).map(item => {
                    const active = Boolean(payslipVis[item.key]);
                    return (
                      <label
                        key={item.key}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          color: '#334155',
                          cursor: isHrOrCeo ? 'pointer' : 'not-allowed',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={!isHrOrCeo}
                          onChange={() => handlePayslipVisibilityToggle(item.key)}
                          style={{ accentColor: '#0E7490', width: '14px', height: '14px' }}
                        />
                        <span>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* SECTION 3 — LIVE CALCULATION PREVIEW                                */}
      {/* =================================================================== */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
              3. Calculation Preview
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
              Automatic live overtime calculation preview using selected month days and paid hours
            </div>
          </div>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '8px',
              backgroundColor: '#ECFEFF',
              color: '#0E7490',
              fontSize: '0.74rem',
              fontWeight: 700,
              border: '1px solid #CFFAFE',
            }}
          >
            <Calculator size={13} />
            Live Formula Engine
          </span>
        </div>

        {/* Preview Input Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '5px',
              }}
            >
              Monthly Salary (₹)
            </label>
            <input
              type="number"
              min={0}
              value={previewSalary}
              onChange={e => setPreviewSalary(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 11px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#0F172A',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '5px',
              }}
            >
              Payroll Month
            </label>
            <input
              type="month"
              value={previewPayrollMonth}
              onChange={e => setPreviewPayrollMonth(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 11px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#0F172A',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '5px',
              }}
            >
              Daily Paid Hours
            </label>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={previewDailyHours}
              onChange={e => setPreviewDailyHours(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 11px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#0F172A',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '5px',
              }}
            >
              Approved OT Hours
            </label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={previewOtHours}
              onChange={e => setPreviewOtHours(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 11px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#0F172A',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '5px',
              }}
            >
              Multiplier
            </label>
            <select
              value={previewMultiplier}
              onChange={e => setPreviewMultiplier(e.target.value as OvertimeMultiplierType)}
              style={{
                width: '100%',
                padding: '8px 11px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#0F172A',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box',
              }}
            >
              <option value="1x Salary">1× (illustration only)</option>
              <option value="1.5x Salary">1.5× rate</option>
              <option value="2x Salary">2× (statutory rate)</option>
            </select>
          </div>
        </div>

        {/* Live Output Metrics Strip */}
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '14px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                Month Days
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                {previewResult.divisorDays}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                Daily Rate
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                ₹{previewResult.dailyRate.toFixed(2)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                Base Hourly Rate
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                ₹{previewResult.baseHourlyRate.toFixed(2)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                OT Amount ({previewResult.multiplierFactor}×)
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16A34A', marginTop: '2px' }}>
                ₹{previewResult.otAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div
            style={{
              paddingTop: '10px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              fontSize: '0.76rem',
              color: '#475569',
            }}
          >
            <span>
              Daily Rate = ₹{previewResult.salaryNum.toLocaleString('en-IN')} ÷ {previewResult.divisorDays} ={' '}
              <strong>₹{previewResult.dailyRate.toFixed(2)}</strong> • Base Hourly Rate = ₹
              {previewResult.dailyRate.toFixed(2)} ÷ {previewResult.paidHoursNum} ={' '}
              <strong>₹{previewResult.baseHourlyRate.toFixed(2)}/hr</strong>
            </span>
            <span>
              At 1× illustrative: <strong>₹{previewResult.amount1x.toFixed(2)}</strong> • At 2× statutory:{' '}
              <strong style={{ color: '#0E7490' }}>₹{previewResult.amount2x.toFixed(2)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MANAGE EMPLOYEE EXCEPTIONS DIALOG                                   */}
      {/* =================================================================== */}
      {isExceptionModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '18px',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                  Manage Employee Overtime Exceptions
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                  Configure authorized employee-level overrides with effective dates and audit reason
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExceptionModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  padding: '4px',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isHrOrCeo && (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Search Employee
                      </label>
                      <input
                        type="text"
                        value={employeeSearchQuery}
                        onChange={e => setEmployeeSearchQuery(e.target.value)}
                        placeholder="Search name, ID, or department..."
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.8rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Select Employee
                      </label>
                      <select
                        value={selectedExceptionEmpId}
                        onChange={e => setSelectedExceptionEmpId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.8rem',
                          backgroundColor: '#FFFFFF',
                        }}
                      >
                        <option value="">-- Select Employee --</option>
                        {filteredModalEmployees.map(emp => (
                          <option key={emp.id} value={emp.employeeId}>
                            {emp.firstName} {emp.lastName} ({emp.employeeId} • {emp.department})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {selectedModalEmployee && (
                    <div style={{ fontSize: '0.76rem', color: '#0E7490', fontWeight: 700 }}>
                      Department: {selectedModalEmployee.department}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Eligibility Override
                      </label>
                      <select
                        value={exceptionMode}
                        onChange={e => setExceptionMode(e.target.value as IndividualOtException)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.8rem',
                          backgroundColor: '#FFFFFF',
                        }}
                      >
                        <option value="Allow OT">Allow OT</option>
                        <option value="Block OT">Restrict OT</option>
                        <option value="Default to Department">Default to Department</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Custom Rate (Optional ₹/hr)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={exceptionCustomRate}
                        onChange={e => setExceptionCustomRate(e.target.value)}
                        placeholder="Use Salary Formula"
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.8rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Effective From
                      </label>
                      <input
                        type="date"
                        value={exceptionEffectiveFrom}
                        onChange={e => setExceptionEffectiveFrom(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.8rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Effective To (Optional)
                      </label>
                      <input
                        type="date"
                        value={exceptionEffectiveTo}
                        onChange={e => setExceptionEffectiveTo(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.8rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: 600, color: '#334155' }}>
                      <input
                        type="checkbox"
                        checked={statutoryFlag}
                        onChange={e => setStatutoryFlag(e.target.checked)}
                        style={{ accentColor: '#0E7490' }}
                      />
                      <ShieldCheck size={14} color="#0E7490" />
                      <span>Statutory OT Entitlement</span>
                    </label>

                    <input
                      type="text"
                      value={exceptionReason}
                      onChange={e => setExceptionReason(e.target.value)}
                      placeholder="Reason / authorization note..."
                      style={{
                        flex: '1 1 200px',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.8rem',
                      }}
                    />

                    <button
                      type="button"
                      disabled={!selectedExceptionEmpId}
                      onClick={handleSaveEmployeeException}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: selectedExceptionEmpId ? '#0E7490' : '#94A3B8',
                        color: '#FFFFFF',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: selectedExceptionEmpId ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <Plus size={14} />
                      Save Exception
                    </button>
                  </div>
                </div>
              )}

              {/* Existing Exceptions List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                  Active Employee Exceptions ({activeEmployeeExceptions.length})
                </div>
                {activeEmployeeExceptions.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '0.8rem', backgroundColor: '#F8FAFC', borderRadius: '10px' }}>
                    No employee-specific overtime exceptions configured. All employees follow their department eligibility rule.
                  </div>
                ) : (
                  activeEmployeeExceptions.map(ep => {
                    const mode = ep.individualOtException || ep.individualException || 'Default to Department';
                    const isAllowed = mode === 'Allow OT' || ep.statutoryEntitlement;
                    return (
                      <div
                        key={ep.id}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.83rem', fontWeight: 700, color: '#0F172A' }}>
                            {ep.employeeName} ({ep.employeeId}) • {ep.department}
                          </div>
                          <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '2px' }}>
                            {ep.effectiveFrom ? `From ${ep.effectiveFrom}` : 'Immediate'}
                            {ep.effectiveTo ? ` to ${ep.effectiveTo}` : ''}
                            {ep.customHourlyRate ? ` • Custom ₹${ep.customHourlyRate}/hr` : ' • Salary-Based Rate'}
                            {ep.notes ? ` • ${ep.notes}` : ''}
                          </div>
                        </div>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            backgroundColor: isAllowed ? '#DCFCE7' : '#FEE2E2',
                            color: isAllowed ? '#15803D' : '#B91C1C',
                          }}
                        >
                          {ep.statutoryEntitlement ? 'Statutory Entitled' : mode}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
