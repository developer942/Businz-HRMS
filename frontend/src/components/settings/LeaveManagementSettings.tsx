import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { MasterLeavePolicy, LeaveTypeConfig } from '../../types/settings';
import { SandwichCondition } from '../../types/sandwichLeave';
import { 
  CalendarDays, 
  Plus, 
  Edit3, 
  Archive, 
  GitFork, 
  ShieldCheck, 
  EyeOff, 
  Eye, 
  CheckCircle2, 
  Layers, 
  Trash2,
  HelpCircle,
  Sliders,
  Check,
  Sparkles,
  Info,
  X
} from 'lucide-react';

export const LeaveManagementSettings: React.FC = () => {
  const { 
    masterLeavePolicies, 
    addMasterLeavePolicy, 
    updateMasterLeavePolicy, 
    archiveMasterLeavePolicy,
    toggleMasterLeavePolicyStatus,
    deleteMasterLeavePolicy,
    resetMasterLeavePoliciesToDefault,
    sandwichPolicies,
    updateSandwichPolicy,
    createSandwichPolicy,
    currentUser
  } = useHRMS();

  const userRole = (currentUser?.role as string) || '';
  const isCEO = userRole === 'CEO' || 
                userRole === 'Super Admin' || 
                currentUser?.designation === 'CEO' || 
                currentUser?.employeeId === 'EMP-000' ||
                userRole.toLowerCase().includes('ceo');

  const isHR = userRole === 'HR Admin' || 
               userRole === 'HR Manager' || 
               userRole === 'HR' || 
               userRole.toLowerCase().includes('hr') ||
               currentUser?.department?.toLowerCase().includes('hr');

  const isPrivileged = isCEO || isHR || userRole === 'Management' || userRole === 'Super Admin' || userRole !== 'Employee';

  // Sub tab: 'policies' | 'sandwich'
  const [activeSubTab, setActiveSubTab] = useState<'policies' | 'sandwich'>('policies');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<MasterLeavePolicy | null>(null);

  // Form State: strictly the 4 requested fields
  const [form, setForm] = useState<{
    policyName: string;
    frequency: 'MONTH' | 'YEAR';
    quotaDays: number;
    leaveType: string;
    customLeaveType: string;
    isPaid: boolean;
  }>({
    policyName: '',
    frequency: 'MONTH',
    quotaDays: 1,
    leaveType: 'Casual Leave (CL)',
    customLeaveType: '',
    isPaid: true
  });



  const openAddModal = () => {
    setEditingPolicy(null);
    setForm({
      policyName: 'Casual Leave Policy',
      frequency: 'MONTH',
      quotaDays: 1,
      leaveType: 'Casual Leave (CL)',
      customLeaveType: '',
      isPaid: true
    });
    setIsModalOpen(true);
  };

  const openEditModal = (p: MasterLeavePolicy) => {
    setEditingPolicy(p);
    const firstType = p.leaveTypes?.[0];
    const leaveTypeName = firstType?.name || 'Casual Leave (CL)';
    const isPaid = firstType !== undefined ? firstType.isPaid : true;

    const standardTypes = [
      'Casual Leave (CL)',
      'Sick Leave (SL)',
      'Earned Leave (EL)',
      'Privilege Leave (PL)',
      'Compensatory Off (Comp-Off)',
      'Maternity Leave',
      'Paternity Leave',
      'Bereavement Leave',
      'Loss of Pay (LOP)'
    ];

    const matchedStandard = standardTypes.find(t => 
      t.toLowerCase() === leaveTypeName.toLowerCase() || 
      t.toLowerCase().startsWith(leaveTypeName.toLowerCase()) ||
      leaveTypeName.toLowerCase().startsWith(t.split(' ')[0].toLowerCase())
    );

    let frequency: 'MONTH' | 'YEAR' = 'MONTH';
    let quotaDays = 1;

    if (p.monthlyFreeUnpaidLeaves && p.monthlyFreeUnpaidLeaves > 0) {
      frequency = 'MONTH';
      quotaDays = p.monthlyFreeUnpaidLeaves;
    } else if (firstType) {
      if (firstType.quotaPerYear % 12 === 0 && firstType.quotaPerYear <= 24) {
        frequency = 'MONTH';
        quotaDays = firstType.quotaPerYear / 12;
      } else {
        frequency = 'YEAR';
        quotaDays = firstType.quotaPerYear;
      }
    }

    setForm({
      policyName: p.policyName,
      frequency,
      quotaDays,
      leaveType: matchedStandard || (leaveTypeName ? 'CUSTOM' : 'Casual Leave (CL)'),
      customLeaveType: matchedStandard ? '' : leaveTypeName,
      isPaid
    });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.policyName.trim()) return;

    const finalLeaveTypeName = (form.leaveType === 'CUSTOM' ? form.customLeaveType : form.leaveType).trim() || 'Casual Leave';
    const quotaPerYear = form.frequency === 'MONTH' ? Number(form.quotaDays) * 12 : Number(form.quotaDays);
    const monthlyDays = form.frequency === 'MONTH' ? Number(form.quotaDays) : Math.max(1, Math.round(Number(form.quotaDays) / 12));

    const leaveTypes: LeaveTypeConfig[] = [
      {
        id: editingPolicy?.leaveTypes?.[0]?.id || `lt-${Date.now()}`,
        name: finalLeaveTypeName,
        isPaid: form.isPaid,
        quotaPerYear: quotaPerYear,
        description: `${finalLeaveTypeName} (${form.isPaid ? 'Paid' : 'Unpaid'}) - ${form.quotaDays} day(s) per ${form.frequency === 'MONTH' ? 'month' : 'year'}`,
        color: form.isPaid ? '#0E7490' : '#EF4444'
      }
    ];

    // If it's a paid policy, ensure there is also an Unpaid Leave fallback type
    if (form.isPaid) {
      leaveTypes.push({
        id: editingPolicy?.leaveTypes?.[1]?.id || `lt-ul-${Date.now()}`,
        name: 'Unpaid Leave (LWP)',
        isPaid: false,
        quotaPerYear: 12,
        description: 'Loss of pay leave beyond monthly paid quota',
        color: '#EF4444'
      });
    }

    const payload = {
      policyName: form.policyName.trim(),
      description: `${finalLeaveTypeName}: ${form.quotaDays} day(s) per ${form.frequency === 'MONTH' ? 'month' : 'year'} (${form.isPaid ? 'Paid' : 'Unpaid'}). Additional unpaid leaves incur 1 day salary deduction.`,
      applicableEmployees: 'ALL' as const,
      applicableDepartments: 'ALL' as const,
      applicableBranches: 'ALL' as const,
      applicableEmploymentType: editingPolicy?.applicableEmploymentType || ('Confirmed' as const),
      effectiveDate: editingPolicy?.effectiveDate || '2026-01-01',
      status: editingPolicy?.status === 'Archived' ? ('Inactive' as const) : (editingPolicy?.status || ('Active' as const)),
      leaveTypes,
      monthlyFreeUnpaidLeaves: form.isPaid ? monthlyDays : 0,
      deductionRuleType: editingPolicy?.deductionRuleType || ('DAILY_SALARY' as const),
      fixedDeductionAmount: editingPolicy?.fixedDeductionAmount || 1000,
      dailySalaryMultiplier: editingPolicy?.dailySalaryMultiplier || 1,
      percentageOfDailySalary: editingPolicy?.percentageOfDailySalary || 100,
      customFormula: editingPolicy?.customFormula || '(DAILY_SALARY * UNPAID_DAYS)',
      approvalFlow: editingPolicy?.approvalFlow || ('EMPLOYEE_HR' as const),
      deductionVisibility: editingPolicy?.deductionVisibility || ('GENERIC' as const),
      genericCategoryLabel: editingPolicy?.genericCategoryLabel || 'OTHERS'
    };

    if (editingPolicy) {
      updateMasterLeavePolicy(editingPolicy.id, payload);
    } else {
      addMasterLeavePolicy(payload);
    }
    setIsModalOpen(false);
  };

  // Sandwich Rule State & Handlers
  const [sandwichFeedback, setSandwichFeedback] = useState<string | null>(null);

  const showSandwichFeedback = (msg: string) => {
    setSandwichFeedback(msg);
    setTimeout(() => setSandwichFeedback(null), 3000);
  };

  const isSandwichEnabled = sandwichPolicies.length > 0
    ? sandwichPolicies.some(p => p.sandwichRuleEnabled && p.status === 'Active')
    : false;

  const countWeeklyOff = sandwichPolicies.length > 0
    ? sandwichPolicies.some(p => p.countWeeklyOffAsLeave)
    : true;

  const countPublicHoliday = sandwichPolicies.length > 0
    ? sandwichPolicies.some(p => p.countPublicHolidayAsLeave)
    : true;

  const currentCondition = sandwichPolicies[0]?.sandwichCondition || 'BOTH_SIDES_MANDATORY';

  const ALL_STANDARD_SANDWICH_LEAVE_TYPES = [
    'Casual Leave', 
    'Casual Leave (CL)', 
    'Sick Leave', 
    'Sick Leave (SL)', 
    'Earned Leave', 
    'Earned Leave (EL)', 
    'Privilege Leave', 
    'Compensatory Off', 
    'Loss of Pay (LOP)', 
    'Unpaid Leave'
  ];

  const handleToggleGlobalSandwich = (nextState?: boolean) => {
    const newState = typeof nextState === 'boolean' ? nextState : !isSandwichEnabled;
    if (sandwichPolicies.length === 0) {
      createSandwichPolicy({
        policyName: 'Corporate Sandwich Leave Policy',
        description: 'Enforces sandwich rule on leaves bounded by weekly offs or holidays.',
        applicableLeaveTypes: ALL_STANDARD_SANDWICH_LEAVE_TYPES,
        applicableEmployees: 'ALL',
        applicableDepartments: 'ALL',
        applicableDesignations: 'ALL',
        applicableBranches: 'ALL',
        effectiveFrom: '2026-01-01',
        status: newState ? 'Active' : 'Inactive',
        sandwichRuleEnabled: newState,
        countWeeklyOffAsLeave: true,
        countPublicHolidayAsLeave: true,
        sandwichCondition: 'BOTH_SIDES_MANDATORY',
        payType: 'SAME_AS_APPLIED_LEAVE'
      });
    } else {
      sandwichPolicies.forEach(p => {
        updateSandwichPolicy(p.id, {
          sandwichRuleEnabled: newState,
          status: newState ? 'Active' : 'Inactive'
        }, newState ? 'Enabled sandwich leave rule via Settings' : 'Disabled sandwich leave rule via Settings');
      });
    }
    showSandwichFeedback(newState ? 'Sandwich Leave Rule turned ON.' : 'Sandwich Leave Rule turned OFF.');
  };

  const handleToggleWeeklyOff = (nextVal?: boolean) => {
    const val = typeof nextVal === 'boolean' ? nextVal : !countWeeklyOff;
    if (sandwichPolicies.length === 0) {
      createSandwichPolicy({
        policyName: 'Corporate Sandwich Leave Policy',
        description: 'Enforces sandwich rule on leaves bounded by weekly offs or holidays.',
        applicableLeaveTypes: ALL_STANDARD_SANDWICH_LEAVE_TYPES,
        applicableEmployees: 'ALL',
        applicableDepartments: 'ALL',
        applicableDesignations: 'ALL',
        applicableBranches: 'ALL',
        effectiveFrom: '2026-01-01',
        status: 'Active',
        sandwichRuleEnabled: true,
        countWeeklyOffAsLeave: val,
        countPublicHolidayAsLeave: true,
        sandwichCondition: 'BOTH_SIDES_MANDATORY',
        payType: 'SAME_AS_APPLIED_LEAVE'
      });
    } else {
      sandwichPolicies.forEach(p => {
        updateSandwichPolicy(p.id, { countWeeklyOffAsLeave: val });
      });
    }
    showSandwichFeedback(val ? 'Counting Weekly Offs as leave enabled.' : 'Counting Weekly Offs as leave disabled.');
  };

  const handleTogglePublicHoliday = (nextVal?: boolean) => {
    const val = typeof nextVal === 'boolean' ? nextVal : !countPublicHoliday;
    if (sandwichPolicies.length === 0) {
      createSandwichPolicy({
        policyName: 'Corporate Sandwich Leave Policy',
        description: 'Enforces sandwich rule on leaves bounded by weekly offs or holidays.',
        applicableLeaveTypes: ALL_STANDARD_SANDWICH_LEAVE_TYPES,
        applicableEmployees: 'ALL',
        applicableDepartments: 'ALL',
        applicableDesignations: 'ALL',
        applicableBranches: 'ALL',
        effectiveFrom: '2026-01-01',
        status: 'Active',
        sandwichRuleEnabled: true,
        countWeeklyOffAsLeave: true,
        countPublicHolidayAsLeave: val,
        sandwichCondition: 'BOTH_SIDES_MANDATORY',
        payType: 'SAME_AS_APPLIED_LEAVE'
      });
    } else {
      sandwichPolicies.forEach(p => {
        updateSandwichPolicy(p.id, { countPublicHolidayAsLeave: val });
      });
    }
    showSandwichFeedback(val ? 'Counting Public Holidays as leave enabled.' : 'Counting Public Holidays as leave disabled.');
  };

  const handleConditionChange = (condition: SandwichCondition) => {
    if (sandwichPolicies.length === 0) {
      createSandwichPolicy({
        policyName: 'Corporate Sandwich Leave Policy',
        description: 'Enforces sandwich rule on leaves bounded by weekly offs or holidays.',
        applicableLeaveTypes: ALL_STANDARD_SANDWICH_LEAVE_TYPES,
        applicableEmployees: 'ALL',
        applicableDepartments: 'ALL',
        applicableDesignations: 'ALL',
        applicableBranches: 'ALL',
        effectiveFrom: '2026-01-01',
        status: 'Active',
        sandwichRuleEnabled: true,
        countWeeklyOffAsLeave: true,
        countPublicHolidayAsLeave: true,
        sandwichCondition: condition,
        payType: 'SAME_AS_APPLIED_LEAVE'
      });
    } else {
      sandwichPolicies.forEach(p => {
        updateSandwichPolicy(p.id, { sandwichCondition: condition });
      });
    }
    showSandwichFeedback('Sandwich trigger condition updated.');
  };

  const toggleRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    backgroundColor: '#F8FAFC',
    borderRadius: '10px',
    border: '1px solid #E2E8F0',
    transition: 'all 0.15s ease'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sub-tabs & Action Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: '#FFFFFF',
        padding: '10px 14px',
        borderRadius: '12px',
        border: '1px solid #E7ECF3'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('policies')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.85rem',
              backgroundColor: activeSubTab === 'policies' ? '#0E7490' : 'transparent',
              color: activeSubTab === 'policies' ? '#FFFFFF' : '#64748B',
              transition: 'all 0.15s ease'
            }}
          >
            <CalendarDays size={16} />
            <span>Leave Policies & Quotas</span>
            <span style={{
              fontSize: '0.72rem',
              padding: '1px 7px',
              borderRadius: '999px',
              backgroundColor: activeSubTab === 'policies' ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
              color: activeSubTab === 'policies' ? '#FFFFFF' : '#475569',
              fontWeight: 800
            }}>
              {masterLeavePolicies.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('sandwich')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.85rem',
              backgroundColor: activeSubTab === 'sandwich' ? '#0E7490' : 'transparent',
              color: activeSubTab === 'sandwich' ? '#FFFFFF' : '#64748B',
              transition: 'all 0.15s ease'
            }}
          >
            <Sliders size={16} />
            <span>Sandwich Leave Rule</span>
            <span style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: isSandwichEnabled ? '#DCFCE7' : '#F1F5F9',
              color: isSandwichEnabled ? '#15803D' : '#64748B',
              fontWeight: 800
            }}>
              {isSandwichEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {activeSubTab === 'policies' && isPrivileged && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (window.confirm('Reset leave policies to standard Company defaults (Confirmed 1 Day/Month Paid & Provisional 1 Paid/3 Months)?')) {
                  resetMasterLeavePoliciesToDefault();
                }
              }}
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 650
              }}
              title="Reset to Company Standards"
            >
              <Layers size={14} /> Reset Defaults
            </button>
            <button
              type="button"
              onClick={() => openAddModal()}
              style={{ 
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 13px',
                fontWeight: 650,
                fontSize: '0.80rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.2)',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0891B2')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0E7490')}
            >
              <Plus size={14} strokeWidth={2.2} />
              <span>Add Leave Policy</span>
            </button>
          </div>
        )}
      </div>

      {activeSubTab === 'sandwich' ? (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #F1F5F9',
            paddingBottom: '16px'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sliders size={20} color="#0E7490" />
                Sandwich Leave Rule Configuration
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                Simple ON / OFF rule to determine if intervening weekends and public holidays are deducted as leave.
              </p>
            </div>

            {/* Notification Toast if updated */}
            {sandwichFeedback && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                fontSize: '0.82rem',
                fontWeight: 700,
                border: '1px solid #A5F3FC'
              }}>
                <CheckCircle2 size={16} />
                <span>{sandwichFeedback}</span>
              </div>
            )}
          </div>

          {/* Clean Preference Rows (Matching exact screenshot format) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Row 1: Master Sandwich Rule ON/OFF */}
            <div style={toggleRowStyle}>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B' }}>
                  Enforce Sandwich Leave Rule
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Automatically treat intervening weekly offs and holidays as leaves when an employee takes leave on both surrounding working days
                </div>
              </div>
              <input
                type="checkbox"
                checked={isSandwichEnabled}
                onChange={(e) => handleToggleGlobalSandwich(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#0E7490', cursor: 'pointer' }}
              />
            </div>

            {/* Row 2: Count Weekly Offs */}
            <div style={{
              ...toggleRowStyle,
              opacity: isSandwichEnabled ? 1 : 0.5,
              pointerEvents: isSandwichEnabled ? 'auto' : 'none'
            }}>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B' }}>
                  Count Intervening Weekly Offs as Leave
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Include Saturday and Sunday (or weekly rest days) in leave deduction when bounded by leave days
                </div>
              </div>
              <input
                type="checkbox"
                checked={countWeeklyOff}
                disabled={!isSandwichEnabled}
                onChange={(e) => handleToggleWeeklyOff(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#0E7490', cursor: isSandwichEnabled ? 'pointer' : 'not-allowed' }}
              />
            </div>

            {/* Row 3: Count Public Holidays */}
            <div style={{
              ...toggleRowStyle,
              opacity: isSandwichEnabled ? 1 : 0.5,
              pointerEvents: isSandwichEnabled ? 'auto' : 'none'
            }}>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B' }}>
                  Count Intervening Public Holidays as Leave
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Include official company or public holidays in leave deduction when bounded by leave days
                </div>
              </div>
              <input
                type="checkbox"
                checked={countPublicHoliday}
                disabled={!isSandwichEnabled}
                onChange={(e) => handleTogglePublicHoliday(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#0E7490', cursor: isSandwichEnabled ? 'pointer' : 'not-allowed' }}
              />
            </div>

            {/* Row 4: Trigger Condition */}
            <div style={{
              ...toggleRowStyle,
              opacity: isSandwichEnabled ? 1 : 0.5,
              pointerEvents: isSandwichEnabled ? 'auto' : 'none'
            }}>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B' }}>
                  Sandwich Trigger Condition
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Standard rule requires leave on both preceding and succeeding work days (e.g. Friday AND Monday)
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  disabled={!isSandwichEnabled}
                  onClick={() => handleConditionChange('BOTH_SIDES_MANDATORY')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: isSandwichEnabled ? 'pointer' : 'not-allowed',
                    backgroundColor: currentCondition === 'BOTH_SIDES_MANDATORY' ? '#0E7490' : '#E2E8F0',
                    color: currentCondition === 'BOTH_SIDES_MANDATORY' ? '#FFFFFF' : '#475569',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Both Sides Mandatory
                </button>
                <button
                  type="button"
                  disabled={!isSandwichEnabled}
                  onClick={() => handleConditionChange('LEAVE_ONLY_BEFORE')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: isSandwichEnabled ? 'pointer' : 'not-allowed',
                    backgroundColor: currentCondition !== 'BOTH_SIDES_MANDATORY' ? '#0E7490' : '#E2E8F0',
                    color: currentCondition !== 'BOTH_SIDES_MANDATORY' ? '#FFFFFF' : '#475569',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Either Side (Relaxed)
                </button>
              </div>
            </div>
          </div>

          {/* Educational Note */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: '#F0FDFA',
            border: '1px solid #CCFBF1',
            color: '#0F766E',
            fontSize: '0.80rem'
          }}>
            <Info size={16} style={{ flexShrink: 0 }} />
            <span>
              <strong>How it works:</strong> If an employee applies for leave on Friday and Monday, the intervening weekend (Saturday & Sunday) will {isSandwichEnabled ? 'automatically be counted as 2 additional leave days.' : 'NOT be counted (Sandwich Rule is currently OFF).'}
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* Policies List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
        {masterLeavePolicies.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1.5px dashed #CBD5E1',
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px'
          }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={24} />
            </div>
            <div style={{ fontWeight: 750, fontSize: '1.05rem', color: '#0F172A' }}>No Leave Policies Configured</div>
            <div style={{ color: '#64748B', fontSize: '0.86rem', maxWidth: '420px', lineHeight: 1.5 }}>
              All default leave policies have been removed. Click <strong>+ Add Leave Policy</strong> above to configure your organization's custom leave rules manually.
            </div>
          </div>
        ) : (
          masterLeavePolicies.map(policy => {
            const isActive = policy.status === 'Active';
            const isArchived = policy.status === 'Archived';
            const isProvisional = policy.applicableEmploymentType === 'Provisional' || 
              policy.policyName.toLowerCase().includes('provisional') || 
              policy.policyName.toLowerCase().includes('probation');

            return (
            <div
              key={policy.id}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: isActive ? '1.5px solid #0E7490' : '1px solid #E7ECF3',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                opacity: isArchived ? 0.6 : 1
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                        {policy.policyName}
                      </h4>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                        v{policy.version}
                      </span>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        backgroundColor: isProvisional ? '#FEF3C7' : '#ECFEFF',
                        color: isProvisional ? '#B45309' : '#0E7490',
                        border: `1px solid ${isProvisional ? '#FDE68A' : '#A5F3FC'}`
                      }}>
                        {isProvisional ? 'Provisional (First 3 Months)' : 'Confirmed Staff'}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                      {policy.description}
                    </p>
                  </div>

                  <span className={`status-pill ${isActive ? 'approved' : isArchived ? 'overdue' : 'pending'}`}>
                    {policy.status}
                  </span>
                </div>

                {/* 4 Core Fields Info Card */}
                {(() => {
                  const mainType = (policy.leaveTypes || [])[0];
                  const isPaid = mainType !== undefined ? mainType.isPaid : true;
                  const isMonthly = Boolean(policy.monthlyFreeUnpaidLeaves && policy.monthlyFreeUnpaidLeaves > 0);
                  const quotaDisplay = isMonthly
                    ? `${policy.monthlyFreeUnpaidLeaves} Day / Month (${(policy.monthlyFreeUnpaidLeaves || 1) * 12}d/yr)`
                    : `${mainType?.quotaPerYear || 1} Day(s) / Year`;

                  return (
                    <div style={{
                      backgroundColor: '#F8FAFC',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      fontSize: '0.84rem',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '12px',
                      marginBottom: '14px',
                      border: '1px solid #F1F5F9'
                    }}>
                      <div>
                        <span style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>
                          Year / Month:
                        </span>
                        <div style={{ fontWeight: 700, color: '#0E7490', marginTop: '3px' }}>
                          {quotaDisplay}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>
                          Leave Type:
                        </span>
                        <div style={{ fontWeight: 700, color: '#1E293B', marginTop: '3px' }}>
                          {mainType?.name || 'Casual Leave (CL)'}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>
                          Paid or Unpaid:
                        </span>
                        <div style={{ marginTop: '3px' }}>
                          <span style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '6px',
                            backgroundColor: isPaid ? '#ECFEFF' : '#FEF2F2',
                            color: isPaid ? '#0E7490' : '#DC2626',
                            border: `1px solid ${isPaid ? '#CFFAFE' : '#FECACA'}`,
                            display: 'inline-block'
                          }}>
                            {isPaid ? 'Paid' : 'Unpaid'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F1F5F9', paddingTop: '14px', marginTop: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {isPrivileged ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ 
                          fontSize: '0.78rem', 
                          padding: '6px 14px', 
                          borderRadius: '8px', 
                          backgroundColor: '#0E7490', 
                          color: '#FFFFFF', 
                          border: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                        onClick={() => openEditModal(policy)}
                        title="Edit this Leave Policy"
                      >
                        <Edit3 size={13} /> Edit Policy
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ 
                          fontSize: '0.78rem', 
                          padding: '6px 12px', 
                          borderRadius: '8px',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #CBD5E1',
                          color: '#334155',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                        onClick={() => toggleMasterLeavePolicyStatus(policy.id)}
                        disabled={isArchived}
                      >
                        {isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                      🔒 Active Policy (CEO & HR Managed)
                    </span>
                  )}
                </div>

                {isPrivileged && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {!isArchived && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ 
                          color: '#F59E0B', 
                          padding: '6px 10px', 
                          borderRadius: '8px',
                          backgroundColor: '#FFFBEB',
                          border: '1px solid #FDE68A',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          if (window.confirm(`Archive "${policy.policyName}"? Historical payroll runs will continue using past versions.`)) {
                            archiveMasterLeavePolicy(policy.id);
                          }
                        }}
                        title="Archive Policy"
                      >
                        <Archive size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ 
                        color: '#EF4444', 
                        padding: '6px 10px', 
                        borderRadius: '8px',
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FECACA',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        if (window.confirm(`Permanently delete "${policy.policyName}"?`)) {
                          deleteMasterLeavePolicy(policy.id);
                        }
                      }}
                      title="Permanently Delete Policy"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        }))}
      </div>

      {/* CREATE / EDIT MODAL - STREAMLINED TO 4 ESSENTIAL FIELDS */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div
            className="modal-content"
            style={{
              maxWidth: '520px',
              width: '100%',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div className="modal-header" style={{ borderBottom: '1px solid #E7ECF3', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                {editingPolicy ? 'Edit Leave Policy' : 'Create Leave Policy'}
              </h3>
              <button
                className="close-btn"
                title="Close"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '24px' }}>
                {/* 1. Policy Name */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                    Policy Name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.policyName}
                    onChange={e => setForm(prev => ({ ...prev, policyName: e.target.value }))}
                    placeholder="e.g. Casual Leave Policy"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.9rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 2. Year / Month */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                    Year / Month <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        className="form-control"
                        min={0}
                        step={0.5}
                        value={form.quotaDays}
                        onChange={e => setForm(prev => ({ ...prev, quotaDays: parseFloat(e.target.value) || 0 }))}
                        placeholder="e.g. 1"
                        required
                        style={{
                          width: '100%',
                          padding: '10px 48px 10px 14px',
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0',
                          fontSize: '0.9rem',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '0.8rem',
                        color: '#64748B',
                        fontWeight: 600,
                        pointerEvents: 'none'
                      }}>
                        Days
                      </span>
                    </div>

                    <select
                      className="form-control"
                      value={form.frequency}
                      onChange={e => setForm(prev => ({ ...prev, frequency: e.target.value as 'MONTH' | 'YEAR' }))}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: '#1E293B',
                        outline: 'none',
                        backgroundColor: '#FFFFFF',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="MONTH">Per Month</option>
                      <option value="YEAR">Per Year</option>
                    </select>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '6px' }}>
                    Entitlement: <strong style={{ color: '#0E7490' }}>{form.quotaDays} Day{form.quotaDays !== 1 ? 's' : ''}</strong> {form.frequency === 'MONTH' ? `per Month (${form.quotaDays * 12} days/year)` : 'per Year'}
                  </div>
                </div>

                {/* 3. Leave Type */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                    Leave Type <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    className="form-control"
                    value={form.leaveType}
                    onChange={e => {
                      const val = e.target.value;
                      setForm(prev => {
                        const nextPolicyName = (!prev.policyName || prev.policyName === `${prev.leaveType} Policy`) && val !== 'CUSTOM'
                          ? `${val} Policy`
                          : prev.policyName;
                        return {
                          ...prev,
                          leaveType: val,
                          policyName: nextPolicyName || prev.policyName
                        };
                      });
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.9rem',
                      color: '#1E293B',
                      outline: 'none',
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="Casual Leave (CL)">Casual Leave (CL)</option>
                    <option value="Sick Leave (SL)">Sick Leave (SL)</option>
                    <option value="Earned Leave (EL)">Earned Leave (EL)</option>
                    <option value="Privilege Leave (PL)">Privilege Leave (PL)</option>
                    <option value="Compensatory Off (Comp-Off)">Compensatory Off (Comp-Off)</option>
                    <option value="Maternity Leave">Maternity Leave</option>
                    <option value="Paternity Leave">Paternity Leave</option>
                    <option value="Bereavement Leave">Bereavement Leave</option>
                    <option value="Loss of Pay (LOP)">Loss of Pay (LOP)</option>
                    <option value="CUSTOM">Custom Leave Type...</option>
                  </select>

                  {form.leaveType === 'CUSTOM' && (
                    <input
                      type="text"
                      className="form-control"
                      value={form.customLeaveType}
                      onChange={e => setForm(prev => ({ ...prev, customLeaveType: e.target.value }))}
                      placeholder="Enter custom leave type name (e.g. Marriage Leave)"
                      required
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        fontSize: '0.9rem',
                        marginTop: '8px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  )}
                </div>

                {/* 4. Paid or Unpaid */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                    Paid or Unpaid <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Paid Option */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setForm(prev => ({ ...prev, isPaid: true }))}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setForm(prev => ({ ...prev, isPaid: true })); }}
                      style={{
                        padding: '14px',
                        borderRadius: '12px',
                        border: form.isPaid ? '2px solid #0E7490' : '1.5px solid #E2E8F0',
                        backgroundColor: form.isPaid ? '#ECFEFF' : '#FFFFFF',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        border: form.isPaid ? '5px solid #0E7490' : '2px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        flexShrink: 0
                      }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: form.isPaid ? '#0E7490' : '#1E293B' }}>
                          Paid
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                          No salary deduction
                        </div>
                      </div>
                    </div>

                    {/* Unpaid Option */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setForm(prev => ({ ...prev, isPaid: false }))}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setForm(prev => ({ ...prev, isPaid: false })); }}
                      style={{
                        padding: '14px',
                        borderRadius: '12px',
                        border: !form.isPaid ? '2px solid #EF4444' : '1.5px solid #E2E8F0',
                        backgroundColor: !form.isPaid ? '#FEF2F2' : '#FFFFFF',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        border: !form.isPaid ? '5px solid #EF4444' : '2px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        flexShrink: 0
                      }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: !form.isPaid ? '#DC2626' : '#1E293B' }}>
                          Unpaid
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                          Loss of pay (deducted)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px', borderTop: '1px solid #E7ECF3' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '8px 18px', borderRadius: '10px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    padding: '8px 22px',
                    borderRadius: '10px',
                    backgroundColor: '#0E7490',
                    borderColor: '#0E7490',
                    fontWeight: 700
                  }}
                >
                  {editingPolicy ? 'Save Changes' : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
