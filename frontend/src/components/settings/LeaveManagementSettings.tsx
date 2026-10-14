import React, { useState, useMemo } from 'react';
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
  X,
  Users,
  RefreshCw,
  Coins,
  Building2,
  UserCheck
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
    employees,
    departments,
    currentUser,
    orgStructure,
    employmentTypes
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

  // Organization Departments derived from departments and employees
  const allDepartmentNames = useMemo(() => {
    const set = new Set<string>();
    (departments || []).forEach(d => {
      const name = typeof d === 'string' ? d : (d as any).name;
      if (name) set.add(name);
    });
    (employees || []).forEach(e => {
      if (e.department) set.add(e.department);
    });
    if (set.size === 0) {
      ['Engineering', 'Human Resources', 'Sales', 'Marketing', 'Finance', 'Operations', 'General'].forEach(d => set.add(d));
    }
    return Array.from(set).sort();
  }, [departments, employees]);

  // Dynamic Employment Types derived from Organization Structure (Company Details) and DB
  const availableEmploymentTypes = useMemo(() => {
    const orgTypes = Array.isArray(orgStructure?.employmentTypes) ? orgStructure.employmentTypes : [];
    const dbTypes = Array.isArray(employmentTypes) ? employmentTypes.filter(t => t.status !== 'Inactive').map(t => t.name) : [];
    const empTypes = Array.isArray(employees) ? employees.map(e => (e as any).employmentType).filter(Boolean) : [];

    const combined = [...orgTypes, ...dbTypes, ...empTypes]
      .map(t => (typeof t === 'string' ? t.trim() : ''))
      .filter(Boolean);

    const uniqueMap = new Map<string, string>();
    combined.forEach(t => {
      const lower = t.toLowerCase();
      if (!uniqueMap.has(lower)) {
        uniqueMap.set(lower, t);
      }
    });

    const result = Array.from(uniqueMap.values());
    if (result.length === 0) {
      return ['Full Time', 'Intern', 'Contract', 'Probation'];
    }
    return result;
  }, [orgStructure?.employmentTypes, employmentTypes, employees]);

  // Form State: core fields + Applicable Employees + Carry Forward + Leave Encashment
  const [form, setForm] = useState<{
    policyName: string;
    frequency: 'MONTH' | 'YEAR';
    quotaDays: number;
    leaveType: string;
    customLeaveType: string;
    isPaid: boolean;
    // 1. Applicable Employees / Eligibility
    applicableScope: 'ALL' | 'DEPARTMENT' | 'EMPLOYMENT_TYPE' | 'GENDER' | 'CUSTOM_EMPLOYEES';
    selectedDepartments: string[];
    employmentType: string;
    gender: 'ALL' | 'Male' | 'Female';
    selectedEmployeeIds: string[];
    // 2. Carry Forward
    allowCarryForward: boolean;
    maxCarryForwardDays: number;
    carryForwardExpiryMonths: number;
    // 3. Leave Encashment
    allowEncashment: boolean;
    maxEncashableDays: number;
    minBalanceForEncashment: number;
    encashmentCalculationBase: 'BASIC' | 'GROSS';
  }>({
    policyName: '',
    frequency: 'MONTH',
    quotaDays: 1,
    leaveType: 'Casual Leave (CL)',
    customLeaveType: '',
    isPaid: true,
    applicableScope: 'ALL',
    selectedDepartments: [],
    employmentType: 'ALL',
    gender: 'ALL',
    selectedEmployeeIds: [],
    allowCarryForward: false,
    maxCarryForwardDays: 5,
    carryForwardExpiryMonths: 12,
    allowEncashment: false,
    maxEncashableDays: 10,
    minBalanceForEncashment: 5,
    encashmentCalculationBase: 'BASIC'
  });

  const openAddModal = () => {
    setEditingPolicy(null);
    setForm({
      policyName: 'Casual Leave Policy',
      frequency: 'MONTH',
      quotaDays: 1,
      leaveType: 'Casual Leave (CL)',
      customLeaveType: '',
      isPaid: true,
      applicableScope: 'ALL',
      selectedDepartments: [],
      employmentType: 'ALL',
      gender: 'ALL',
      selectedEmployeeIds: [],
      allowCarryForward: false,
      maxCarryForwardDays: 5,
      carryForwardExpiryMonths: 12,
      allowEncashment: false,
      maxEncashableDays: 10,
      minBalanceForEncashment: 5,
      encashmentCalculationBase: 'BASIC'
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

    const isEmpScope = Array.isArray(p.applicableEmployees) && p.applicableEmployees.length > 0;
    const isDeptScope = Array.isArray(p.applicableDepartments) && p.applicableDepartments.length > 0;
    const isGenderScope = Boolean(p.applicableGender && p.applicableGender !== 'ALL');
    const isEmploymentScope = Boolean(p.applicableEmploymentType && p.applicableEmploymentType !== 'ALL');

    const applicableScope = isEmpScope 
      ? 'CUSTOM_EMPLOYEES' 
      : isDeptScope 
      ? 'DEPARTMENT' 
      : isGenderScope 
      ? 'GENDER' 
      : isEmploymentScope 
      ? 'EMPLOYMENT_TYPE' 
      : 'ALL';

    setForm({
      policyName: p.policyName,
      frequency,
      quotaDays,
      leaveType: matchedStandard || (leaveTypeName ? 'CUSTOM' : 'Casual Leave (CL)'),
      customLeaveType: matchedStandard ? '' : leaveTypeName,
      isPaid,
      applicableScope,
      selectedDepartments: Array.isArray(p.applicableDepartments) ? p.applicableDepartments : [],
      employmentType: (p.applicableEmploymentType as any) || 'ALL',
      gender: p.applicableGender || 'ALL',
      selectedEmployeeIds: Array.isArray(p.applicableEmployees) ? p.applicableEmployees : [],
      allowCarryForward: Boolean(p.allowCarryForward),
      maxCarryForwardDays: p.maxCarryForwardDays ?? 5,
      carryForwardExpiryMonths: p.carryForwardExpiryMonths ?? 12,
      allowEncashment: Boolean(p.allowEncashment),
      maxEncashableDays: p.maxEncashableDays ?? 10,
      minBalanceForEncashment: p.minBalanceForEncashment ?? 5,
      encashmentCalculationBase: p.encashmentCalculationBase || 'BASIC'
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

    let applicableEmployees: 'ALL' | string[] = 'ALL';
    let applicableDepartments: 'ALL' | string[] = 'ALL';
    let applicableEmploymentType: 'ALL' | string = 'ALL';
    let applicableGender: 'ALL' | 'Male' | 'Female' = 'ALL';

    if (form.applicableScope === 'DEPARTMENT' && form.selectedDepartments.length > 0) {
      applicableDepartments = form.selectedDepartments;
    } else if (form.applicableScope === 'CUSTOM_EMPLOYEES' && form.selectedEmployeeIds.length > 0) {
      applicableEmployees = form.selectedEmployeeIds;
    } else if (form.applicableScope === 'EMPLOYMENT_TYPE') {
      applicableEmploymentType = form.employmentType;
    } else if (form.applicableScope === 'GENDER') {
      applicableGender = form.gender;
    }

    let description = `${finalLeaveTypeName}: ${form.quotaDays} day(s) per ${form.frequency === 'MONTH' ? 'month' : 'year'} (${form.isPaid ? 'Paid' : 'Unpaid'}).`;
    if (form.allowCarryForward) {
      description += ` Carry forward up to ${form.maxCarryForwardDays}d.`;
    }
    if (form.allowEncashment) {
      description += ` Encashable up to ${form.maxEncashableDays}d.`;
    }

    const payload = {
      policyName: form.policyName.trim(),
      description,
      applicableEmployees,
      applicableDepartments,
      applicableBranches: 'ALL' as const,
      applicableEmploymentType,
      applicableGender,
      effectiveDate: editingPolicy?.effectiveDate || '2026-01-01',
      status: editingPolicy?.status === 'Archived' ? ('Inactive' as const) : (editingPolicy?.status || ('Active' as const)),
      leaveTypes,
      allowCarryForward: form.allowCarryForward,
      maxCarryForwardDays: form.allowCarryForward ? Number(form.maxCarryForwardDays) : 0,
      carryForwardExpiryMonths: form.allowCarryForward ? Number(form.carryForwardExpiryMonths) : 12,
      allowEncashment: form.allowEncashment,
      maxEncashableDays: form.allowEncashment ? Number(form.maxEncashableDays) : 0,
      minBalanceForEncashment: form.allowEncashment ? Number(form.minBalanceForEncashment) : 0,
      encashmentCalculationBase: form.encashmentCalculationBase,
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
                    <>
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

                      {/* Applicable Scope, Carry Forward & Encashment Badges */}
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '14px',
                        alignItems: 'center'
                      }}>
                        {/* Applicable Employees Badge */}
                        <span style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          backgroundColor: '#EFF6FF',
                          color: '#1E40AF',
                          border: '1px solid #DBEAFE',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <Users size={12} />
                          {Array.isArray(policy.applicableEmployees) && policy.applicableEmployees.length > 0
                            ? `Specific: ${policy.applicableEmployees.length} Staff`
                            : Array.isArray(policy.applicableDepartments) && policy.applicableDepartments.length > 0
                            ? `Dept: ${policy.applicableDepartments.join(', ')}`
                            : policy.applicableGender && policy.applicableGender !== 'ALL'
                            ? `${policy.applicableGender} Only`
                            : policy.applicableEmploymentType && policy.applicableEmploymentType !== 'ALL'
                            ? `${policy.applicableEmploymentType}`
                            : 'All Employees'}
                        </span>

                        {/* Carry Forward Badge */}
                        <span style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          backgroundColor: policy.allowCarryForward ? '#DCFCE7' : '#F1F5F9',
                          color: policy.allowCarryForward ? '#15803D' : '#64748B',
                          border: `1px solid ${policy.allowCarryForward ? '#BBF7D0' : '#E2E8F0'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <RefreshCw size={12} />
                          {policy.allowCarryForward 
                            ? `Carry Forward: Max ${policy.maxCarryForwardDays ?? 5}d` 
                            : 'No Carry Forward'}
                        </span>

                        {/* Leave Encashment Badge */}
                        <span style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          backgroundColor: policy.allowEncashment ? '#FEF3C7' : '#F1F5F9',
                          color: policy.allowEncashment ? '#B45309' : '#64748B',
                          border: `1px solid ${policy.allowEncashment ? '#FDE68A' : '#E2E8F0'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <Coins size={12} />
                          {policy.allowEncashment 
                            ? `Encashable: Max ${policy.maxEncashableDays ?? 10}d (${policy.encashmentCalculationBase || 'Basic'})` 
                            : 'No Encashment'}
                        </span>
                      </div>
                    </>
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
              maxWidth: '580px',
              width: '95%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div className="modal-header" style={{ borderBottom: '1px solid #E7ECF3', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                  {editingPolicy ? 'Edit Leave Policy' : 'Create Leave Policy'}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                  Configure entitlement, audience, rollover & encashment rules
                </p>
              </div>
              <button
                className="close-btn"
                title="Close"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '24px', overflowY: 'auto', maxHeight: 'calc(92vh - 140px)' }}>
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

                {/* 5. Applicable Employees */}
                <div style={{ borderTop: '1px solid #E7ECF3', paddingTop: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                    Applicable Employees <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <p style={{ margin: '0 0 10px', fontSize: '0.76rem', color: '#64748B' }}>
                    Define which employees or groups are eligible for this leave policy
                  </p>

                  <select
                    className="form-control"
                    value={form.applicableScope}
                    onChange={e => setForm(prev => ({ ...prev, applicableScope: e.target.value as any }))}
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
                      marginBottom: '10px'
                    }}
                  >
                    <option value="ALL">All Employees (Company-wide)</option>
                    <option value="DEPARTMENT">Specific Department(s)</option>
                    <option value="EMPLOYMENT_TYPE">Employment Type</option>
                    <option value="GENDER">Gender Specific (Maternity / Paternity)</option>
                    <option value="CUSTOM_EMPLOYEES">Specific Individual Staff</option>
                  </select>

                  {/* Scope: Specific Departments */}
                  {form.applicableScope === 'DEPARTMENT' && (
                    <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                          Select Applicable Departments:
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, selectedDepartments: [...allDepartmentNames] }))}
                            style={{ background: 'none', border: 'none', color: '#0E7490', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                          >
                            Select All
                          </button>
                          <span style={{ color: '#CBD5E1' }}>•</span>
                          <button
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, selectedDepartments: [] }))}
                            style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {allDepartmentNames.map(dept => {
                          const isSelected = form.selectedDepartments.includes(dept);
                          return (
                            <button
                              key={dept}
                              type="button"
                              onClick={() => {
                                setForm(prev => ({
                                  ...prev,
                                  selectedDepartments: isSelected 
                                    ? prev.selectedDepartments.filter(d => d !== dept)
                                    : [...prev.selectedDepartments, dept]
                                }));
                              }}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '8px',
                                border: isSelected ? '1.5px solid #0E7490' : '1px solid #CBD5E1',
                                backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                                color: isSelected ? '#0E7490' : '#475569',
                                fontSize: '0.78rem',
                                fontWeight: isSelected ? 700 : 500,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {isSelected && <Check size={12} />} {dept}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Scope: Employment Type */}
                  {form.applicableScope === 'EMPLOYMENT_TYPE' && (
                    <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.76rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                        Target Employment Type:
                      </label>
                      <select
                        className="form-control"
                        value={form.employmentType}
                        onChange={e => setForm(prev => ({ ...prev, employmentType: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.86rem',
                          color: '#1E293B',
                          backgroundColor: '#FFFFFF'
                        }}
                      >
                        <option value="ALL">All Employment Types</option>
                        {availableEmploymentTypes.map(t => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                        {form.employmentType && 
                         form.employmentType !== 'ALL' && 
                         !availableEmploymentTypes.some(t => t.toLowerCase() === form.employmentType.toLowerCase()) && (
                          <option value={form.employmentType}>{form.employmentType}</option>
                        )}
                      </select>
                      {availableEmploymentTypes.length === 0 && (
                        <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#64748B' }}>
                          No custom employment types configured yet. You can add them in <strong>Company Settings → Organization Structure</strong>.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scope: Gender Specific */}
                  {form.applicableScope === 'GENDER' && (
                    <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.76rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                        Gender Eligibility:
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {(['Female', 'Male', 'ALL'] as const).map(g => {
                          const isSel = form.gender === g;
                          const label = g === 'Female' ? 'Female Only' : g === 'Male' ? 'Male Only' : 'All Genders';
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() => setForm(prev => ({ ...prev, gender: g }))}
                              style={{
                                padding: '8px',
                                borderRadius: '8px',
                                border: isSel ? '1.5px solid #0E7490' : '1px solid #CBD5E1',
                                backgroundColor: isSel ? '#ECFEFF' : '#FFFFFF',
                                color: isSel ? '#0E7490' : '#475569',
                                fontSize: '0.8rem',
                                fontWeight: isSel ? 700 : 500,
                                cursor: 'pointer'
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Scope: Specific Employees */}
                  {form.applicableScope === 'CUSTOM_EMPLOYEES' && (
                    <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                          Select Staff Members ({form.selectedEmployeeIds.length} Selected):
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, selectedEmployeeIds: employees.map(e => e.employeeId) }))}
                            style={{ background: 'none', border: 'none', color: '#0E7490', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                          >
                            Select All
                          </button>
                          <span style={{ color: '#CBD5E1' }}>•</span>
                          <button
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, selectedEmployeeIds: [] }))}
                            style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {employees.map(emp => {
                          const isChecked = form.selectedEmployeeIds.includes(emp.employeeId);
                          return (
                            <label
                              key={emp.employeeId}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                backgroundColor: isChecked ? '#ECFEFF' : '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setForm(prev => ({
                                    ...prev,
                                    selectedEmployeeIds: isChecked
                                      ? prev.selectedEmployeeIds.filter(id => id !== emp.employeeId)
                                      : [...prev.selectedEmployeeIds, emp.employeeId]
                                  }));
                                }}
                                style={{ accentColor: '#0E7490' }}
                              />
                              <span style={{ fontWeight: 750, color: '#0F172A' }}>{emp.firstName} {emp.lastName}</span>
                              <span style={{ color: '#64748B', fontSize: '0.72rem' }}>({emp.employeeId} • {emp.department})</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 6. Carry Forward Configuration */}
                <div style={{ borderTop: '1px solid #E7ECF3', paddingTop: '16px' }}>
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: form.allowCarryForward ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                      backgroundColor: form.allowCarryForward ? '#F0FDFA' : '#FAFAFA'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          backgroundColor: form.allowCarryForward ? '#CCFBF1' : '#F1F5F9',
                          color: form.allowCarryForward ? '#0F766E' : '#64748B',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <RefreshCw size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 750, fontSize: '0.88rem', color: '#0F172A' }}>
                            Allow Carry Forward
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                            Roll over unused leave balance to the next year or month
                          </div>
                        </div>
                      </div>

                      <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '24px', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={form.allowCarryForward}
                          onChange={e => setForm(prev => ({ ...prev, allowCarryForward: e.target.checked }))}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: form.allowCarryForward ? '#0E7490' : '#CBD5E1',
                          borderRadius: '24px',
                          transition: '0.2s'
                        }}>
                          <span style={{
                            position: 'absolute',
                            content: '""',
                            height: '18px',
                            width: '18px',
                            left: form.allowCarryForward ? '21px' : '3px',
                            bottom: '3px',
                            backgroundColor: '#FFFFFF',
                            borderRadius: '50%',
                            transition: '0.2s'
                          }} />
                        </span>
                      </label>
                    </div>

                    {form.allowCarryForward && (
                      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #CCFBF1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.76rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                            Max Carry Forward Days
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={form.maxCarryForwardDays}
                            onChange={e => setForm(prev => ({ ...prev, maxCarryForwardDays: parseInt(e.target.value) || 0 }))}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.85rem',
                              backgroundColor: '#FFFFFF',
                              boxSizing: 'border-box'
                            }}
                          />
                          <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px', display: 'block' }}>
                            Max days roll over into next period
                          </span>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.76rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                            Rollover Expiry Period
                          </label>
                          <select
                            value={form.carryForwardExpiryMonths}
                            onChange={e => setForm(prev => ({ ...prev, carryForwardExpiryMonths: parseInt(e.target.value) }))}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.85rem',
                              backgroundColor: '#FFFFFF',
                              boxSizing: 'border-box'
                            }}
                          >
                            <option value={12}>12 Months (End of Calendar Year)</option>
                            <option value={3}>3 Months (Quarterly Expiry - 90 Days)</option>
                            <option value={6}>6 Months (Half-Yearly Expiry)</option>
                            <option value={0}>Never Expires (Accumulate Across Years)</option>
                          </select>
                          <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px', display: 'block' }}>
                            Period before unused carried days lapse
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 7. Leave Encashment Configuration */}
                <div style={{ borderTop: '1px solid #E7ECF3', paddingTop: '16px' }}>
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: form.allowEncashment ? '1.5px solid #F59E0B' : '1px solid #E2E8F0',
                      backgroundColor: form.allowEncashment ? '#FFFBEB' : '#FAFAFA'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          backgroundColor: form.allowEncashment ? '#FEF3C7' : '#F1F5F9',
                          color: form.allowEncashment ? '#B45309' : '#64748B',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Coins size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 750, fontSize: '0.88rem', color: '#0F172A' }}>
                            Allow Leave Encashment
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                            Convert accumulated unused leaves into cash during payroll or exit
                          </div>
                        </div>
                      </div>

                      <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '24px', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={form.allowEncashment}
                          onChange={e => setForm(prev => ({ ...prev, allowEncashment: e.target.checked }))}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: form.allowEncashment ? '#F59E0B' : '#CBD5E1',
                          borderRadius: '24px',
                          transition: '0.2s'
                        }}>
                          <span style={{
                            position: 'absolute',
                            content: '""',
                            height: '18px',
                            width: '18px',
                            left: form.allowEncashment ? '21px' : '3px',
                            bottom: '3px',
                            backgroundColor: '#FFFFFF',
                            borderRadius: '50%',
                            transition: '0.2s'
                          }} />
                        </span>
                      </label>
                    </div>

                    {form.allowEncashment && (
                      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #FDE68A', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.74rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                            Max Encashable Days
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={form.maxEncashableDays}
                            onChange={e => setForm(prev => ({ ...prev, maxEncashableDays: parseInt(e.target.value) || 0 }))}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.85rem',
                              backgroundColor: '#FFFFFF',
                              boxSizing: 'border-box'
                            }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px', display: 'block' }}>
                            Max days per cycle
                          </span>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.74rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                            Min Retained Balance
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={form.minBalanceForEncashment}
                            onChange={e => setForm(prev => ({ ...prev, minBalanceForEncashment: parseInt(e.target.value) || 0 }))}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.85rem',
                              backgroundColor: '#FFFFFF',
                              boxSizing: 'border-box'
                            }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px', display: 'block' }}>
                            Balance to preserve
                          </span>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.74rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                            Calculation Base
                          </label>
                          <select
                            value={form.encashmentCalculationBase}
                            onChange={e => setForm(prev => ({ ...prev, encashmentCalculationBase: e.target.value as any }))}
                            style={{
                              width: '100%',
                              padding: '8px 8px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.82rem',
                              backgroundColor: '#FFFFFF',
                              boxSizing: 'border-box'
                            }}
                          >
                            <option value="BASIC">Basic / 26</option>
                            <option value="GROSS">Gross / 30</option>
                          </select>
                          <span style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px', display: 'block' }}>
                            Per-day rate basis
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px', borderTop: '1px solid #E7ECF3', backgroundColor: '#F8FAFC' }}>
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
