import React, { useState } from 'react';
import {
  Building2,
  ToggleLeft,
  ToggleRight,
  Sliders,
  Eye,
  UserCheck,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { isDefaultOtEligibleDepartment, getCalendarDaysInMonth } from '../../services/attendanceCalculationEngine';
import { OtWageBaseMode, OtSalaryDivisorMode, IndividualOtException } from '../../types/attendanceEnterprise';

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
  const [selectedExceptionEmpId, setSelectedExceptionEmpId] = useState<string>('');
  const [exceptionMode, setExceptionMode] = useState<IndividualOtException>('Allow OT');
  const [statutoryFlag, setStatutoryFlag] = useState<boolean>(false);
  const [exceptionCustomRate, setExceptionCustomRate] = useState<string>('');
  const [exceptionEffectiveFrom, setExceptionEffectiveFrom] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

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

  const getDraftValue = (key: string, value: number) => (
    Object.prototype.hasOwnProperty.call(inputDrafts, key) ? inputDrafts[key] : String(value)
  );

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
  // FLOOR and Dispatch Loading default to eligible (YES); other departments default to restricted (NO) unless enabled by HR/CEO.
  const activeDepartmentPolicies = departments.map(dept => {
    const normalizedDeptId = dept.id.toLowerCase();
    const normalizedDeptName = dept.name.toLowerCase();
    const defaultEligible = isDefaultOtEligibleDepartment(dept.name);
    const existing = departmentOtPolicies.find(
      p => (
        p.department.toLowerCase() === normalizedDeptName ||
        p.id.toLowerCase() === normalizedDeptId ||
        p.id.toLowerCase() === `dot-${normalizedDeptId}` ||
        p.id.toLowerCase() === `dot-${normalizedDeptName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
      )
    );
    return existing ? {
      ...existing,
      otAllowed: normalizeOtAllowed((existing as any).otAllowed, defaultEligible)
    } : {
      id: `DOT-${dept.id}`,
      department: dept.name,
      otAllowed: defaultEligible,
      policyId: 'OTP-001',
      maxOtHoursDaily: 4.0,
      maxOtHoursMonthly: 60,
      minOtDurationMinutes: 30,
      approvalRequired: true,
      calculationMethod: 'Shift End Based' as const,
      standardShiftHours: 9,
      otHourlyRate: 100
    };
  });

  const payslipVis = payrollSettingsConfig?.payslipOvertimeVisibility || overtimePolicy?.payslipVisibility || {
    showOtHoursOnPayslip: true,
    showOtAmountOnPayslip: true,
    showOtCalculationDetailsOnPayslip: false,
  };

  const handlePayslipVisibilityToggle = (field: 'showOtHoursOnPayslip' | 'showOtAmountOnPayslip' | 'showOtCalculationDetailsOnPayslip') => {
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

  const handleAddEmployeeException = () => {
    if (!selectedExceptionEmpId || !isHrOrCeo) return;
    const emp = employees.find(e => e.employeeId === selectedExceptionEmpId || e.id === selectedExceptionEmpId);
    if (!emp) return;
    updateEmployeeOtPolicy(emp.employeeId, {
      employeeId: emp.employeeId,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      department: emp.department,
      departmentDefaultOt: isDefaultOtEligibleDepartment(emp.department),
      individualOtException: exceptionMode,
      statutoryEntitlement: statutoryFlag,
      customHourlyRate: exceptionCustomRate ? Number(exceptionCustomRate) : undefined,
      effectiveFrom: exceptionEffectiveFrom || undefined,
    });
    setSelectedExceptionEmpId('');
    setExceptionCustomRate('');
    setStatutoryFlag(false);
  };

  const now = new Date();
  const currentMonthDays = getCalendarDaysInMonth(now.getMonth() + 1, now.getFullYear());

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      borderRadius: '16px',
      border: '1px solid #E7ECF3',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
            Department Overtime Eligibility Rules
          </h4>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
            Define department standard shift duration, overtime authorization, and hourly overtime rate (e.g. 9 hrs shift; 10 hrs worked triggers 1 hr OT @ ₹100/hr).
          </p>
        </div>
        <span style={{ fontSize: '0.78rem', color: '#0E7490', fontWeight: 700, background: '#ECFEFF', padding: '4px 10px', borderRadius: '6px', border: '1px solid #CFFAFE' }}>
          {departments.length} Organization {departments.length === 1 ? 'Department' : 'Departments'}
        </span>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #E7ECF3', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
          <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E7ECF3' }}>
            <tr>
              <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Standard Shift</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OT Allowed</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OT Hourly Rate</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overtime Trigger Rule</th>
            </tr>
          </thead>
          <tbody>
            {activeDepartmentPolicies.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '36px 16px', textAlign: 'center', color: '#64748B' }}>
                  <Building2 size={36} style={{ margin: '0 auto 10px', color: '#CBD5E1', display: 'block' }} />
                  <div style={{ fontWeight: 750, color: '#1E293B', fontSize: '0.92rem' }}>
                    No Organization Departments Added Yet
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px', maxWidth: '440px', margin: '4px auto 0' }}>
                    Departments created under <strong>Organization → Departments</strong> will dynamically appear here for overtime policy configuration.
                  </div>
                </td>
              </tr>
            ) : (
              activeDepartmentPolicies.map(dept => {
                const isDepartmentOtAllowed = normalizeOtAllowed((dept as any).otAllowed, isDefaultOtEligibleDepartment(dept.department));
                const isOtAllowed = overtimePolicy.enabled !== false && isDepartmentOtAllowed;
                const shiftHours = dept.standardShiftHours ?? 9;
                const hourlyRate = dept.otHourlyRate ?? 100;
                const shiftDraftKey = `${dept.id}:standardShiftHours`;
                const rateDraftKey = `${dept.id}:otHourlyRate`;
                return (
                  <tr key={dept.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building2 size={16} color="#0E7490" />
                      {dept.department}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      {isHrOrCeo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="number"
                            step="0.5"
                            min="4"
                            max="16"
                            value={getDraftValue(shiftDraftKey, shiftHours)}
                            onChange={e => handlePolicyNumberChange(shiftDraftKey, dept.id, dept.department, 'standardShiftHours', e.target.value)}
                            style={{
                              width: '58px',
                              padding: '6px 8px',
                              borderRadius: '8px',
                              border: '1px solid #E2E8F0',
                              fontSize: '0.82rem',
                              fontFamily: 'monospace',
                              color: '#1E293B',
                              backgroundColor: '#FFFFFF'
                            }}
                          />
                          <span style={{ color: '#64748B', fontSize: '0.78rem', fontWeight: 600 }}>hrs</span>
                        </div>
                      ) : (
                        <span style={{ color: '#1E293B', fontWeight: 600 }}>{shiftHours} hrs</span>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      {isHrOrCeo ? (
                        <button
                          type="button"
                          onClick={() => updateDepartmentOtPolicy(dept.id, { department: dept.department, otAllowed: !isDepartmentOtAllowed })}
                          disabled={overtimePolicy.enabled === false}
                          title={overtimePolicy.enabled === false ? 'Company overtime policy is off' : 'Toggle department overtime'}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 12px',
                            borderRadius: '9999px',
                            border: 'none',
                            fontSize: '0.75rem',
                            fontWeight: 750,
                            cursor: overtimePolicy.enabled === false ? 'not-allowed' : 'pointer',
                            backgroundColor: isOtAllowed ? '#DCFCE7' : '#F1F5F9',
                            color: isOtAllowed ? '#15803D' : '#64748B',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                            opacity: overtimePolicy.enabled === false ? 0.72 : 1
                          }}
                        >
                          {isOtAllowed ? (
                            <>
                              <ToggleRight size={16} color="#15803D" /> YES
                            </>
                          ) : (
                            <>
                              <ToggleLeft size={16} color="#94A3B8" /> NO
                            </>
                          )}
                        </button>
                      ) : (
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: isOtAllowed ? '#DCFCE7' : '#F1F5F9',
                          color: isOtAllowed ? '#15803D' : '#64748B'
                        }}>
                          {isOtAllowed ? 'YES' : 'NO'}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      {isHrOrCeo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#0E7490', fontWeight: 700, fontSize: '0.85rem' }}>₹</span>
                          <input
                            type="number"
                            step="10"
                            min="0"
                            value={getDraftValue(rateDraftKey, hourlyRate)}
                            onChange={e => handlePolicyNumberChange(rateDraftKey, dept.id, dept.department, 'otHourlyRate', e.target.value)}
                            disabled={!isOtAllowed}
                            style={{
                              width: '72px',
                              padding: '6px 8px',
                              borderRadius: '8px',
                              border: '1px solid #E2E8F0',
                              fontSize: '0.82rem',
                              fontFamily: 'monospace',
                              color: !isOtAllowed ? '#94A3B8' : '#1E293B',
                              backgroundColor: !isOtAllowed ? '#F8FAFC' : '#FFFFFF'
                            }}
                          />
                          <span style={{ color: '#64748B', fontSize: '0.78rem' }}>/ hr</span>
                        </div>
                      ) : (
                        <span style={{ color: isOtAllowed ? '#0E7490' : '#94A3B8', fontWeight: 700 }}>
                          ₹{hourlyRate} / hr
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      {isOtAllowed ? (
                        <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: '#ECFEFF',
                            border: '1px solid #CFFAFE',
                            fontWeight: 700,
                            color: '#0E7490'
                          }}>
                            Work &gt; {shiftHours} hrs
                          </span>
                          <span style={{ color: '#64748B' }}>
                            (e.g., 10 hrs work = 1 hr OT → <strong>₹{hourlyRate}</strong>)
                          </span>
                        </div>
                      ) : (
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#F1F5F9',
                          color: '#94A3B8',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          Overtime Restricted
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 2. Overtime Wage Base, Salary Divisor & Effective Date Configuration */}
      <div style={{
        marginTop: '8px',
        padding: '18px',
        borderRadius: '12px',
        border: '1px solid #E7ECF3',
        backgroundColor: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={16} color="#0E7490" />
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1E293B' }}>
              Overtime Calculation Formula, Salary Divisor &amp; Effective Dating
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0E7490', backgroundColor: '#ECFEFF', padding: '3px 10px', borderRadius: '999px', border: '1px solid #CFFAFE' }}>
            Current Month Calendar Days: {currentMonthDays} Days · Configured Divisor: {payrollSettingsConfig?.standardWorkingDaysPerMonth || 26} Days
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Applicable Wage Base
            </label>
            <select
              disabled={!isHrOrCeo}
              value={overtimePolicy.wageBase || 'FIXED_HOURLY'}
              onChange={e => updateOvertimePolicy({ wageBase: e.target.value as OtWageBaseMode })}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '0.82rem',
                color: '#1E293B',
                backgroundColor: '#FFFFFF'
              }}
            >
              <option value="FIXED_HOURLY">Department Fixed Hourly Rate (₹/hr)</option>
              <option value="BASIC">Basic Salary ÷ Divisor ÷ Daily Hours</option>
              <option value="GROSS">Gross Salary ÷ Divisor ÷ Daily Hours</option>
              <option value="CTC">Monthly CTC ÷ Divisor ÷ Daily Hours</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Payroll &amp; OT Salary Divisor Mode
            </label>
            <select
              disabled={!isHrOrCeo}
              value={overtimePolicy.divisorMode || 'COMPANY_DIVISOR'}
              onChange={e => {
                const mode = e.target.value as OtSalaryDivisorMode;
                updateOvertimePolicy({ divisorMode: mode });
                if (updatePayrollSettingsConfig) {
                  if (mode === 'CALENDAR_DAYS') updatePayrollSettingsConfig({ salaryDivisorMode: 'CALENDAR_DAYS' });
                  else if (mode === 'WORKING_DAYS') updatePayrollSettingsConfig({ salaryDivisorMode: 'WORKING_DAYS' });
                  else if (mode === 'FIXED_26') updatePayrollSettingsConfig({ salaryDivisorMode: 'FIXED_DAYS', standardWorkingDaysPerMonth: 26 });
                  else if (mode === 'FIXED_30') updatePayrollSettingsConfig({ salaryDivisorMode: 'FIXED_DAYS', standardWorkingDaysPerMonth: 30 });
                }
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '0.82rem',
                color: '#1E293B',
                backgroundColor: '#FFFFFF'
              }}
            >
              <option value="COMPANY_DIVISOR">Company Configured Divisor ({payrollSettingsConfig?.standardWorkingDaysPerMonth || 26} Days)</option>
              <option value="CALENDAR_DAYS">Actual Calendar Days in Month (28 / 29 / 30 / 31)</option>
              <option value="FIXED_26">Fixed 26 Days</option>
              <option value="FIXED_30">Fixed 30 Days</option>
              <option value="WORKING_DAYS">Actual Working Days (Excl. Weekly Offs)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Default Overtime Multiplier
            </label>
            <select
              disabled={!isHrOrCeo}
              value={overtimePolicy.defaultMultiplier || overtimePolicy.rateType || '1x Salary'}
              onChange={e => updateOvertimePolicy({ defaultMultiplier: e.target.value as any, rateType: e.target.value as any })}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '0.82rem',
                color: '#1E293B',
                backgroundColor: '#FFFFFF'
              }}
            >
              <option value="1x Salary">1.0x Normal Rate</option>
              <option value="1.5x Salary">1.5x Overtime Multiplier</option>
              <option value="2x Salary">2.0x Double Wage (Statutory / Holiday)</option>
              <option value="Fixed Amount Per Hour">Fixed Amount Per Hour</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Policy Effective From
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={15} color="#64748B" />
              <input
                type="date"
                disabled={!isHrOrCeo}
                value={overtimePolicy.effectiveFrom || '2026-01-01'}
                onChange={e => updateOvertimePolicy({ effectiveFrom: e.target.value, version: (overtimePolicy.version || 1) + 1 })}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.82rem',
                  color: '#1E293B',
                  backgroundColor: '#FFFFFF'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Payslip Overtime Visibility Settings */}
      <div style={{
        padding: '18px',
        borderRadius: '12px',
        border: '1px solid #E7ECF3',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={16} color="#0E7490" />
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1E293B' }}>
              Payslip Overtime Visibility Controls
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
            Controls payslip presentation without altering actual Gross/Net earnings or ESIC/statutory disclosures.
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {[
            { key: 'showOtHoursOnPayslip' as const, label: 'Show Approved Overtime Hours on Payslip' },
            { key: 'showOtAmountOnPayslip' as const, label: 'Show Separate Overtime Amount Row on Payslip' },
            { key: 'showOtCalculationDetailsOnPayslip' as const, label: 'Show Formula Details (Rate × Hours · Divisor)' },
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
                  gap: '8px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: `1px solid ${active ? '#0E7490' : '#E2E8F0'}`,
                  backgroundColor: active ? '#ECFEFF' : '#F8FAFC',
                  color: active ? '#0E7490' : '#64748B',
                  fontSize: '0.79rem',
                  fontWeight: 700,
                  cursor: isHrOrCeo ? 'pointer' : 'not-allowed'
                }}
              >
                {active ? <ToggleRight size={17} color="#0E7490" /> : <ToggleLeft size={17} color="#94A3B8" />}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Employee-Specific Overtime Policy & Statutory Entitlements */}
      <div style={{
        padding: '18px',
        borderRadius: '12px',
        border: '1px solid #E7ECF3',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={16} color="#0E7490" />
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1E293B' }}>
              Employee-Specific Overtime Exceptions &amp; Statutory Entitlements
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
            Authorize individual employees in restricted departments or record statutory OT entitlement.
          </span>
        </div>

        {isHrOrCeo && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Employee</label>
              <select
                value={selectedExceptionEmpId}
                onChange={e => setSelectedExceptionEmpId(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
              >
                <option value="">Select employee...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.employeeId}>
                    {emp.firstName} {emp.lastName} ({emp.employeeId} · {emp.department})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '0 1 180px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Policy Override</label>
              <select
                value={exceptionMode}
                onChange={e => setExceptionMode(e.target.value as IndividualOtException)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
              >
                <option value="Allow OT">Allow OT (Exception)</option>
                <option value="Block OT">Block OT</option>
                <option value="Default to Department">Default to Department</option>
              </select>
            </div>

            <div style={{ flex: '0 1 130px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Custom Rate (₹/hr)</label>
              <input
                type="number"
                placeholder="Dept default"
                value={exceptionCustomRate}
                onChange={e => setExceptionCustomRate(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
              />
            </div>

            <div style={{ flex: '0 1 145px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Effective From</label>
              <input
                type="date"
                value={exceptionEffectiveFrom}
                onChange={e => setExceptionEffectiveFrom(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
              />
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', paddingBottom: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={statutoryFlag}
                onChange={e => setStatutoryFlag(e.target.checked)}
                style={{ accentColor: '#0E7490' }}
              />
              Statutory Entitlement
            </label>

            <button
              type="button"
              onClick={handleAddEmployeeException}
              disabled={!selectedExceptionEmpId}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: selectedExceptionEmpId ? '#0E7490' : '#CBD5E1',
                color: '#FFFFFF',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: selectedExceptionEmpId ? 'pointer' : 'not-allowed'
              }}
            >
              Save Employee Rule
            </button>
          </div>
        )}

        {employeeOtPolicies.length > 0 && (
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
                  color: '#1E293B'
                }}
              >
                <ShieldCheck size={14} color={ep.individualOtException === 'Block OT' ? '#DC2626' : '#16A34A'} />
                <strong>{ep.employeeName}</strong> ({ep.department}) —{' '}
                <span style={{ fontWeight: 700 }}>
                  {ep.statutoryEntitlement ? 'Statutory Entitlement' : ep.individualOtException}
                </span>
                {ep.customHourlyRate ? ` · ₹${ep.customHourlyRate}/hr` : ''}
                {ep.effectiveFrom ? ` · From ${ep.effectiveFrom}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
