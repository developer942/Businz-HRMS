import React, { useState, useMemo } from 'react';
import {
  Building2,
  ToggleLeft,
  ToggleRight,
  Sliders,
  Eye,
  UserCheck,
  ShieldCheck,
  Calendar,
  Calculator,
  Search,
  Plus,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import {
  isDefaultOtEligibleDepartment,
  getCalendarDaysInMonth,
  resolvePayrollSalaryDivisor,
  calculateEnterpriseOvertimeRateAndAmount
} from '../../services/attendanceCalculationEngine';
import { OtWageBaseMode, OtSalaryDivisorMode, IndividualOtException } from '../../types/attendanceEnterprise';
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

  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({});
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

  const normalizeOtAllowed = (value: unknown, fallback = false): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['no', 'false', '0', 'off', 'disabled'].includes(normalized)) return false;
      if (['yes', 'true', '1', 'on', 'enabled'].includes(normalized)) return true;
    }
    return fallback;
  };

  const getDraftValue = (key: string, value: number) =>
    Object.prototype.hasOwnProperty.call(inputDrafts, key) ? inputDrafts[key] : String(value);

  const handlePolicyNumberChange = (
    key: string,
    deptId: string,
    department: string,
    field: 'standardShiftHours' | 'otHourlyRate',
    rawValue: string
  ) => {
    setInputDrafts(prev => ({ ...prev, [key]: rawValue }));
    if (rawValue === '') {
      updateDepartmentOtPolicy(deptId, { department, [field]: 0 });
      return;
    }
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) {
      updateDepartmentOtPolicy(deptId, { department, [field]: parsed });
    }
  };

  // Dynamic department overtime policy mapping:
  // FLOOR and Dispatch Loading default to eligible (ON); other departments default to restricted (OFF) unless enabled by HR/CEO.
  const activeDepartmentPolicies = useMemo(() => {
    return departments.map(dept => {
      const normalizedDeptId = dept.id.toLowerCase();
      const normalizedDeptName = dept.name.toLowerCase();
      const defaultEligible = isDefaultOtEligibleDepartment(dept.name);
      const existing = departmentOtPolicies.find(
        p =>
          p.department.toLowerCase() === normalizedDeptName ||
          p.id.toLowerCase() === normalizedDeptId ||
          p.id.toLowerCase() === `dot-${normalizedDeptId}` ||
          p.id.toLowerCase() === `dot-${normalizedDeptName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
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
            standardShiftHours: 9,
            otHourlyRate: 100,
          };
    });
  }, [departments, departmentOtPolicies, overtimePolicy]);

  const handleBulkDepartmentToggle = (mode: 'ALL_ON' | 'ALL_OFF' | 'DEFAULT') => {
    if (!isHrOrCeo || overtimePolicy.enabled === false) return;
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
      | 'showOtRateOnPayslip'
      | 'showOtCalculationDetailsOnPayslip'
      | 'showEmployerContributionOnPayslip'
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

  const filteredModalEmployees = useMemo(() => {
    const q = employeeSearchQuery.trim().toLowerCase();
    const eligibleEmps = employees.filter(emp => !isOwnerOrCEO(emp));
    if (!q) return eligibleEmps;
    return eligibleEmps.filter(
      emp =>
        `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(q) ||
        emp.employeeId.toLowerCase().includes(q) ||
        (emp.department || '').toLowerCase().includes(q)
    );
  }, [employees, employeeSearchQuery]);

  const selectedModalEmployee = useMemo(
    () => employees.find(e => (e.employeeId === selectedExceptionEmpId || e.id === selectedExceptionEmpId) && !isOwnerOrCEO(e)),
    [employees, selectedExceptionEmpId]
  );

  const handleSaveEmployeeException = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModalEmployee || isOwnerOrCEO(selectedModalEmployee) || !isHrOrCeo) return;
    updateEmployeeOtPolicy(selectedModalEmployee.employeeId, {
      employeeId: selectedModalEmployee.employeeId,
      employeeName: `${selectedModalEmployee.firstName} ${selectedModalEmployee.lastName}`.trim(),
      department: selectedModalEmployee.department,
      departmentDefaultOt: isDefaultOtEligibleDepartment(selectedModalEmployee.department),
      individualOtException: exceptionMode,
      statutoryEntitlement: statutoryFlag,
      customHourlyRate: exceptionCustomRate ? Number(exceptionCustomRate) : undefined,
      effectiveFrom: exceptionEffectiveFrom || undefined,
      effectiveTo: exceptionEffectiveTo || undefined,
      reason: exceptionReason.trim() || undefined,
      authorizedBy: currentUser?.name || currentUser?.role || 'HR Admin',
    });
    setSelectedExceptionEmpId('');
    setExceptionCustomRate('');
    setExceptionEffectiveTo('');
    setExceptionReason('');
    setStatutoryFlag(false);
    setIsExceptionModalOpen(false);
  };

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentMonthDays = getCalendarDaysInMonth(currentMonth, currentYear);

  const isSalaryBased = (overtimePolicy.wageBase || 'GROSS') !== 'FIXED_HOURLY';
  const activeWageBase: OtWageBaseMode = overtimePolicy.wageBase || 'GROSS';
  const activeDivisorMode: OtSalaryDivisorMode = overtimePolicy.divisorMode || 'CALENDAR_DAYS';
  const activeMultiplier = overtimePolicy.defaultMultiplier || overtimePolicy.rateType || '2x Salary';
  const defaultDailyPaidHours = activeDepartmentPolicies[0]?.standardShiftHours || 9;

  // Live mathematical preview for ₹15,000 monthly salary, 30-day month (or active divisor), 9 daily hours, 10 OT hours
  const previewDivisor = resolvePayrollSalaryDivisor({
    month: 11, // November (30 days benchmark)
    year: currentYear,
    divisorMode: activeDivisorMode,
    customDivisorDays: payrollSettingsConfig?.standardWorkingDaysPerMonth || 26,
  });

  const liveSample = calculateEnterpriseOvertimeRateAndAmount({
    approvedHours: 10,
    wageBaseMode: activeWageBase,
    basicSalary: 15000,
    grossSalary: 15000,
    monthlyCtc: 15000,
    fixedHourlyRate: activeDepartmentPolicies[0]?.otHourlyRate || 100,
    divisorDays: previewDivisor.divisorDays,
    dailyPaidHours: defaultDailyPaidHours,
    multiplier: activeMultiplier,
    statutoryMultiplier: overtimePolicy.statutoryMultiplier || 1,
  });

  const isMasterEnabled = overtimePolicy.enabled !== false;
  const enabledDeptsCount = activeDepartmentPolicies.filter(d => d.otAllowed).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ==================== SECTION A — ENABLE OVERTIME ==================== */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          padding: '18px 22px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: isMasterEnabled ? '#ECFEFF' : '#F1F5F9',
              color: isMasterEnabled ? '#0E7490' : '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sliders size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1E293B' }}>
                Section A — Enable Overtime Policy
              </h3>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 10px',
                  borderRadius: '9999px',
                  backgroundColor: isMasterEnabled ? '#DCFCE7' : '#FEE2E2',
                  color: isMasterEnabled ? '#15803D' : '#DC2626',
                }}
              >
                {isMasterEnabled ? 'Policy Active' : 'Policy Disabled'}
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 10px',
                  borderRadius: '9999px',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                }}
              >
                {isSalaryBased ? `Salary-Based (${activeWageBase})` : 'Fixed Hourly Rate'} · {activeMultiplier}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
              Master switch controlling organization-wide overtime calculation, attendance tracking, and payroll variable (<code>OT</code>) integration.
            </p>
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
            padding: '8px 16px',
            borderRadius: '12px',
            border: `1px solid ${isMasterEnabled ? '#0E7490' : '#CBD5E1'}`,
            backgroundColor: isMasterEnabled ? '#0E7490' : '#F8FAFC',
            color: isMasterEnabled ? '#FFFFFF' : '#475569',
            fontSize: '0.82rem',
            fontWeight: 750,
            cursor: isHrOrCeo ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease',
          }}
        >
          {isMasterEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          {isMasterEnabled ? 'Overtime Enabled' : 'Overtime Disabled'}
        </button>
      </div>

      {/* ==================== SECTION B — ELIGIBLE DEPARTMENTS ==================== */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          padding: '20px 22px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={17} color="#0E7490" />
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                Section B — Eligible Departments
              </h4>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#0E7490',
                  fontWeight: 700,
                  background: '#ECFEFF',
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                {enabledDeptsCount} of {activeDepartmentPolicies.length} Enabled
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.79rem', color: '#64748B' }}>
              Toggle overtime eligibility per department. A department restriction does not eliminate overtime legally payable to a statutorily covered employee.
            </p>
          </div>

          {isHrOrCeo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={!isMasterEnabled}
                onClick={() => handleBulkDepartmentToggle('DEFAULT')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  color: '#334155',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: isMasterEnabled ? 'pointer' : 'not-allowed',
                }}
              >
                Default (FLOOR &amp; Dispatch ON)
              </button>
              <button
                type="button"
                disabled={!isMasterEnabled}
                onClick={() => handleBulkDepartmentToggle('ALL_ON')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #A5F3FC',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: isMasterEnabled ? 'pointer' : 'not-allowed',
                }}
              >
                Enable All
              </button>
              <button
                type="button"
                disabled={!isMasterEnabled}
                onClick={() => handleBulkDepartmentToggle('ALL_OFF')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: isMasterEnabled ? 'pointer' : 'not-allowed',
                }}
              >
                Restrict All
              </button>
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #E7ECF3', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.83rem' }}>
            <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E7ECF3' }}>
              <tr>
                <th style={{ padding: '10px 16px', fontWeight: 700, color: '#475569', fontSize: '0.73rem', textTransform: 'uppercase' }}>
                  Department
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 700, color: '#475569', fontSize: '0.73rem', textTransform: 'uppercase' }}>
                  OT Eligibility
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 700, color: '#475569', fontSize: '0.73rem', textTransform: 'uppercase' }}>
                  Daily Shift Hours
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 700, color: '#475569', fontSize: '0.73rem', textTransform: 'uppercase' }}>
                  Applicable OT Calculation Rule
                </th>
              </tr>
            </thead>
            <tbody>
              {activeDepartmentPolicies.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '28px 16px', textAlign: 'center', color: '#64748B' }}>
                    No departments found. Add departments under Organization settings.
                  </td>
                </tr>
              ) : (
                activeDepartmentPolicies.map(dept => {
                  const isDepartmentOtAllowed = normalizeOtAllowed(
                    (dept as any).otAllowed,
                    isDefaultOtEligibleDepartment(dept.department)
                  );
                  const isOtAllowed = isMasterEnabled && isDepartmentOtAllowed;
                  const shiftHours = dept.standardShiftHours ?? 9;
                  const hourlyRate = dept.otHourlyRate ?? 100;
                  const shiftDraftKey = `${dept.id}:standardShiftHours`;
                  const rateDraftKey = `${dept.id}:otHourlyRate`;

                  return (
                    <tr key={dept.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building2 size={15} color={isOtAllowed ? '#0E7490' : '#94A3B8'} />
                        {dept.department}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <button
                          type="button"
                          disabled={!isHrOrCeo || !isMasterEnabled}
                          onClick={() =>
                            updateDepartmentOtPolicy(dept.id, {
                              department: dept.department,
                              otAllowed: !isDepartmentOtAllowed,
                            })
                          }
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 12px',
                            borderRadius: '9999px',
                            border: 'none',
                            fontSize: '0.74rem',
                            fontWeight: 750,
                            cursor: !isHrOrCeo || !isMasterEnabled ? 'not-allowed' : 'pointer',
                            backgroundColor: isOtAllowed ? '#DCFCE7' : '#F1F5F9',
                            color: isOtAllowed ? '#15803D' : '#64748B',
                          }}
                        >
                          {isOtAllowed ? (
                            <>
                              <ToggleRight size={15} color="#15803D" /> ON
                            </>
                          ) : (
                            <>
                              <ToggleLeft size={15} color="#94A3B8" /> OFF
                            </>
                          )}
                        </button>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        {isOtAllowed && isHrOrCeo ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="number"
                              step="0.5"
                              min="4"
                              max="16"
                              value={getDraftValue(shiftDraftKey, shiftHours)}
                              onChange={e =>
                                handlePolicyNumberChange(
                                  shiftDraftKey,
                                  dept.id,
                                  dept.department,
                                  'standardShiftHours',
                                  e.target.value
                                )
                              }
                              style={{
                                width: '56px',
                                padding: '5px 8px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: '#1E293B',
                              }}
                            />
                            <span style={{ color: '#64748B', fontSize: '0.76rem' }}>hrs/day</span>
                          </div>
                        ) : (
                          <span style={{ color: '#64748B', fontSize: '0.78rem' }}>{shiftHours} hrs/day</span>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        {!isOtAllowed ? (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: '#94A3B8',
                              fontWeight: 600,
                            }}
                          >
                            Overtime Restricted (Except Statutory / Individual Exception)
                          </span>
                        ) : isSalaryBased ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '3px 10px',
                              borderRadius: '6px',
                              backgroundColor: '#ECFEFF',
                              border: '1px solid #CFFAFE',
                              color: '#0E7490',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                            }}
                          >
                            Salary-Based ({activeWageBase} ÷ Divisor ÷ {shiftHours}h × {activeMultiplier})
                          </span>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#0E7490', fontWeight: 700, fontSize: '0.82rem' }}>₹</span>
                            <input
                              type="number"
                              step="10"
                              min="0"
                              disabled={!isHrOrCeo}
                              value={getDraftValue(rateDraftKey, hourlyRate)}
                              onChange={e =>
                                handlePolicyNumberChange(
                                  rateDraftKey,
                                  dept.id,
                                  dept.department,
                                  'otHourlyRate',
                                  e.target.value
                                )
                              }
                              style={{
                                width: '70px',
                                padding: '5px 8px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: '#1E293B',
                              }}
                            />
                            <span style={{ color: '#64748B', fontSize: '0.76rem' }}>/ hr</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== SECTION C — OVERTIME CALCULATION ==================== */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          padding: '20px 22px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calculator size={17} color="#0E7490" />
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
              Section C — Overtime Calculation Formula &amp; Rules
            </h4>
          </div>

          {/* Primary Calculation Mode Selector */}
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: '#F1F5F9',
              padding: '3px',
              borderRadius: '10px',
              gap: '4px',
            }}
          >
            <button
              type="button"
              disabled={!isHrOrCeo}
              onClick={() => updateOvertimePolicy({ wageBase: 'GROSS' })}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.76rem',
                fontWeight: 750,
                cursor: isHrOrCeo ? 'pointer' : 'not-allowed',
                backgroundColor: isSalaryBased ? '#0E7490' : 'transparent',
                color: isSalaryBased ? '#FFFFFF' : '#64748B',
              }}
            >
              Salary-Based Hourly Rate (Recommended)
            </button>
            <button
              type="button"
              disabled={!isHrOrCeo}
              onClick={() => updateOvertimePolicy({ wageBase: 'FIXED_HOURLY' })}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.76rem',
                fontWeight: 750,
                cursor: isHrOrCeo ? 'pointer' : 'not-allowed',
                backgroundColor: !isSalaryBased ? '#0E7490' : 'transparent',
                color: !isSalaryBased ? '#FFFFFF' : '#64748B',
              }}
            >
              Fixed Hourly Rate
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Eligible Wage Base
            </label>
            <select
              disabled={!isHrOrCeo}
              value={activeWageBase}
              onChange={e => updateOvertimePolicy({ wageBase: e.target.value as OtWageBaseMode })}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '0.82rem',
                color: '#1E293B',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="GROSS">Gross Salary ÷ Divisor ÷ Daily Hours</option>
              <option value="BASIC">Basic Salary ÷ Divisor ÷ Daily Hours</option>
              <option value="CTC">Monthly CTC ÷ Divisor ÷ Daily Hours</option>
              <option value="FIXED_HOURLY">Fixed Hourly Rate (Where Legally Permitted)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Monthly Salary Divisor
            </label>
            <select
              disabled={!isHrOrCeo}
              value={activeDivisorMode}
              onChange={e => {
                const mode = e.target.value as OtSalaryDivisorMode;
                updateOvertimePolicy({ divisorMode: mode });
                if (updatePayrollSettingsConfig) {
                  if (mode === 'CALENDAR_DAYS') updatePayrollSettingsConfig({ salaryDivisorMode: 'CALENDAR_DAYS' });
                  else if (mode === 'WORKING_DAYS') updatePayrollSettingsConfig({ salaryDivisorMode: 'WORKING_DAYS' });
                  else if (mode === 'STATUTORY_DIVISOR') updatePayrollSettingsConfig({ salaryDivisorMode: 'STATUTORY_DIVISOR', standardWorkingDaysPerMonth: 26 });
                  else if (mode === 'FIXED_26') updatePayrollSettingsConfig({ salaryDivisorMode: 'FIXED_DAYS', standardWorkingDaysPerMonth: 26 });
                  else if (mode === 'FIXED_30') updatePayrollSettingsConfig({ salaryDivisorMode: 'FIXED_DAYS', standardWorkingDaysPerMonth: 30 });
                }
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '0.82rem',
                color: '#1E293B',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="CALENDAR_DAYS">Automatic Calendar Days ({currentMonthDays} Days this month: 28/29/30/31)</option>
              <option value="FIXED_30">Fixed 30 Days</option>
              <option value="WORKING_DAYS">Configured Paid Working Days ({payrollSettingsConfig?.standardWorkingDaysPerMonth || 26} Days)</option>
              <option value="STATUTORY_DIVISOR">Applicable Statutory Divisor (26 Days)</option>
              <option value="COMPANY_DIVISOR">Company Divisor ({payrollSettingsConfig?.standardWorkingDaysPerMonth || 26} Days)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Daily Paid Working Hours
            </label>
            <input
              type="number"
              step="0.5"
              min="4"
              max="16"
              disabled={!isHrOrCeo}
              value={defaultDailyPaidHours}
              onChange={e => {
                const hrs = Math.max(1, Number(e.target.value) || 9);
                activeDepartmentPolicies.forEach(d => {
                  updateDepartmentOtPolicy(d.id, { department: d.department, standardShiftHours: hrs });
                });
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '0.82rem',
                color: '#1E293B',
                backgroundColor: '#FFFFFF',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Overtime Multiplier
            </label>
            <select
              disabled={!isHrOrCeo}
              value={activeMultiplier}
              onChange={e => {
                const val = e.target.value as any;
                const numMult = val === '2x Salary' ? 2.0 : val === '1.5x Salary' ? 1.5 : 1.0;
                updateOvertimePolicy({
                  defaultMultiplier: val,
                  rateType: val,
                  regularMultiplier: numMult,
                });
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '0.82rem',
                color: '#1E293B',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="2x Salary">2.0× Statutory Double Rate (Default)</option>
              <option value="1.5x Salary">1.5× Overtime Multiplier</option>
              <option value="1x Salary">1.0× Standard Hourly Rate</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Approval Requirement
            </label>
            <button
              type="button"
              disabled={!isHrOrCeo}
              onClick={() => updateOvertimePolicy({ approvalRequired: !overtimePolicy.approvalRequired })}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                backgroundColor: overtimePolicy.approvalRequired ? '#ECFEFF' : '#F8FAFC',
                color: overtimePolicy.approvalRequired ? '#0E7490' : '#64748B',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: isHrOrCeo ? 'pointer' : 'not-allowed',
              }}
            >
              <span>{overtimePolicy.approvalRequired ? 'Manager / HR Approval Required' : 'Auto-Approve Eligible OT'}</span>
              {overtimePolicy.approvalRequired ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            </button>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Policy Effective Date
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={15} color="#64748B" />
              <input
                type="date"
                disabled={!isHrOrCeo}
                value={overtimePolicy.effectiveFrom || '2026-01-01'}
                onChange={e =>
                  updateOvertimePolicy({
                    effectiveFrom: e.target.value,
                    version: (overtimePolicy.version || 1) + 1,
                  })
                }
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.82rem',
                  color: '#1E293B',
                  backgroundColor: '#FFFFFF',
                }}
              />
            </div>
          </div>
        </div>

        {/* Live Salary-Based OT Calculation Preview Banner */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '0.78rem',
            color: '#334155',
          }}
        >
          <div>
            <strong>Formula:</strong>{' '}
            <code>Hourly Rate = Eligible Monthly Wages ÷ Applicable Divisor ÷ Daily Paid Hours</code> ·{' '}
            <code>OT = Hourly Rate × Approved OT Hours × Multiplier</code>
          </div>
          <div style={{ color: '#0E7490', fontWeight: 700 }}>
            Example (₹15,000 Salary, {previewDivisor.divisorDays} Days, {defaultDailyPaidHours}h Shift, 10h OT):{' '}
            ₹{(15000 / previewDivisor.divisorDays / defaultDailyPaidHours).toFixed(2)}/hr ×{' '}
            {liveSample.multiplierApplied}× = ₹{liveSample.calculatedAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {/* ==================== SECTION D — PAYSLIP VISIBILITY ==================== */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          padding: '18px 22px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={17} color="#0E7490" />
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
              Section D — Payslip Visibility
            </h4>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
            Controls payslip display only; never alters payable Gross/Net salary or mandatory statutory disclosures.
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {[
            { key: 'showOtAmountOnPayslip' as const, label: 'Show OT Amount' },
            { key: 'showOtHoursOnPayslip' as const, label: 'Show OT Hours' },
            { key: 'showOtRateOnPayslip' as const, label: 'Show OT Rate' },
            { key: 'showOtCalculationDetailsOnPayslip' as const, label: 'Show Optional Calculation Details' },
            { key: 'showEmployerContributionOnPayslip' as const, label: 'Show Employer PF/ESIC Info' },
          ].map(item => {
            const active = Boolean(payslipVis[item.key]);
            return (
              <button
                key={item.key}
                type="button"
                disabled={!isHrOrCeo}
                onClick={() => handlePayslipVisibilityToggle(item.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  border: `1px solid ${active ? '#0E7490' : '#E2E8F0'}`,
                  backgroundColor: active ? '#ECFEFF' : '#F8FAFC',
                  color: active ? '#0E7490' : '#64748B',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: isHrOrCeo ? 'pointer' : 'not-allowed',
                }}
              >
                {active ? <ToggleRight size={15} color="#0E7490" /> : <ToggleLeft size={15} color="#94A3B8" />}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================== SECTION E — EMPLOYEE EXCEPTIONS ==================== */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          padding: '18px 22px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserCheck size={17} color="#0E7490" />
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                Section E — Employee Overtime Exceptions
              </h4>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                }}
              >
                {employeeOtPolicies.length} Active {employeeOtPolicies.length === 1 ? 'Exception' : 'Exceptions'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
              Individual employee overrides and statutory overtime entitlements with effective dates and audit reasons.
            </p>
          </div>

          {isHrOrCeo && (
            <button
              type="button"
              onClick={() => setIsExceptionModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                fontSize: '0.79rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Plus size={15} />
              Manage Exceptions
            </button>
          )}
        </div>

        {employeeOtPolicies.length === 0 ? (
          <div style={{ fontSize: '0.79rem', color: '#64748B', padding: '8px 0' }}>
            No employee-specific exceptions configured. All employees follow their department eligibility rule.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {employeeOtPolicies.map(ep => (
              <div
                key={ep.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  backgroundColor: ep.individualOtException === 'Block OT' ? '#FEF2F2' : '#F0FDF4',
                  border: `1px solid ${ep.individualOtException === 'Block OT' ? '#FECACA' : '#BBF7D0'}`,
                  fontSize: '0.76rem',
                  color: '#1E293B',
                }}
              >
                <ShieldCheck size={14} color={ep.individualOtException === 'Block OT' ? '#DC2626' : '#16A34A'} />
                <strong>{ep.employeeName}</strong> ({ep.department}) —{' '}
                <span style={{ fontWeight: 700 }}>
                  {ep.statutoryEntitlement ? 'Statutory Entitlement' : ep.individualOtException}
                </span>
                {ep.customHourlyRate ? ` · ₹${ep.customHourlyRate}/hr` : ''}
                {ep.effectiveFrom ? ` · From ${ep.effectiveFrom}` : ''}
                {ep.effectiveTo ? ` to ${ep.effectiveTo}` : ''}
                {ep.reason ? ` · "${ep.reason}"` : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ==================== MANAGE EXCEPTIONS DIALOG ==================== */}
      {isExceptionModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '540px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1E293B' }}>
                  Manage Employee Overtime Exception
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                  Configure individual overtime eligibility, custom rate, and effective dates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExceptionModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#F1F5F9',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEmployeeException} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Search Employee
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                  <input
                    type="text"
                    placeholder="Filter by employee name, code, or department..."
                    value={employeeSearchQuery}
                    onChange={e => setEmployeeSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px 8px 32px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Select Employee *
                  </label>
                  <select
                    required
                    value={selectedExceptionEmpId}
                    onChange={e => setSelectedExceptionEmpId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                    }}
                  >
                    <option value="">Choose employee...</option>
                    {filteredModalEmployees.map(emp => (
                      <option key={emp.id} value={emp.employeeId}>
                        {emp.firstName} {emp.lastName} ({emp.employeeId})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Employee Department
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={selectedModalEmployee?.department || '—'}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F8FAFC',
                      color: '#475569',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Allow / Restrict OT
                  </label>
                  <select
                    value={exceptionMode}
                    onChange={e => setExceptionMode(e.target.value as IndividualOtException)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                    }}
                  >
                    <option value="Allow OT">Allow OT (Override)</option>
                    <option value="Block OT">Restrict OT</option>
                    <option value="Default to Department">Default to Department</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Applicable Custom Rate (₹/hr)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Leave blank for salary formula"
                    value={exceptionCustomRate}
                    onChange={e => setExceptionCustomRate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Effective From
                  </label>
                  <input
                    type="date"
                    value={exceptionEffectiveFrom}
                    onChange={e => setExceptionEffectiveFrom(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Effective To (Optional)
                  </label>
                  <input
                    type="date"
                    value={exceptionEffectiveTo}
                    onChange={e => setExceptionEffectiveTo(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Authorization Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g., Floor shift supervisor / statutory factory worker coverage"
                  value={exceptionReason}
                  onChange={e => setExceptionReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#1E293B',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={statutoryFlag}
                  onChange={e => setStatutoryFlag(e.target.checked)}
                  style={{ accentColor: '#0E7490' }}
                />
                Statutorily Covered Worker (Cannot be blocked by department restriction)
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsExceptionModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedExceptionEmpId}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: selectedExceptionEmpId ? '#0E7490' : '#CBD5E1',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: selectedExceptionEmpId ? 'pointer' : 'not-allowed',
                  }}
                >
                  Save Exception
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
