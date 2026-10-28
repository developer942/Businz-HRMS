import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { DateInput } from '../common/DateInput';
import { 
  SandwichLeavePolicy, 
  SandwichCondition, 
  SandwichPayType, 
  SandwichPolicyStatus 
} from '../../types/sandwichLeave';
import { 
  Plus, 
  Search, 
  Sliders, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Archive, 
  Edit3, 
  History, 
  ShieldCheck, 
  Layers, 
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Filter,
  Check,
  Building2,
  Users
} from 'lucide-react';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export const SandwichLeavePolicySettings: React.FC = () => {
  const { 
    sandwichPolicies, 
    sandwichAuditLogs,
    createSandwichPolicy, 
    updateSandwichPolicy, 
    archiveSandwichPolicy, 
    toggleSandwichPolicyStatus,
    currentUser,
    employees,
    departments,
    branches,
    designations,
    masterLeavePolicies
  } = useHRMS();

  const isPrivileged = currentUser.role !== 'Employee';

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SandwichPolicyStatus>('ALL');
  const [branchFilter, setBranchFilter] = useState('ALL');

  // Pagination & Row Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(5);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<SandwichLeavePolicy | null>(null);
  const [historyModalPolicy, setHistoryModalPolicy] = useState<SandwichLeavePolicy | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    policyName: string;
    description: string;
    applicableLeaveTypes: string[];
    applicableEmployees: 'ALL' | string[];
    applicableDepartments: 'ALL' | string[];
    applicableDesignations: 'ALL' | string[];
    applicableBranches: 'ALL' | string[];
    effectiveFrom: string;
    effectiveTo: string;
    status: SandwichPolicyStatus;
    sandwichRuleEnabled: boolean;
    countWeeklyOffAsLeave: boolean;
    countPublicHolidayAsLeave: boolean;
    sandwichCondition: SandwichCondition;
    payType: SandwichPayType;
    customPayRuleFormula: string;
  }>({
    policyName: '',
    description: '',
    applicableLeaveTypes: ['Casual Leave', 'Sick Leave', 'Unpaid Leave'],
    applicableEmployees: 'ALL',
    applicableDepartments: 'ALL',
    applicableDesignations: 'ALL',
    applicableBranches: 'ALL',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
    status: 'Active',
    sandwichRuleEnabled: true,
    countWeeklyOffAsLeave: true,
    countPublicHolidayAsLeave: true,
    sandwichCondition: 'BOTH_SIDES_MANDATORY',
    payType: 'SAME_AS_APPLIED_LEAVE',
    customPayRuleFormula: ''
  });

  // Available master leave types from master policy
  const availableLeaveTypeNames = useMemo(() => {
    const defaultTypes = ['Casual Leave', 'Sick Leave', 'Paid Leave', 'Unpaid Leave', 'Earned Leave', 'Compensatory Leave', 'Maternity Leave', 'Paternity Leave'];
    if (!masterLeavePolicies || masterLeavePolicies.length === 0) return defaultTypes;
    const names = new Set<string>();
    masterLeavePolicies.forEach(p => {
      p.leaveTypes?.forEach(t => names.add(t.name));
    });
    return names.size > 0 ? Array.from(names) : defaultTypes;
  }, [masterLeavePolicies]);

  // Filtering policies
  const filteredPolicies = useMemo(() => {
    return sandwichPolicies.filter(p => {
      const matchesSearch = p.policyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const matchesBranch = branchFilter === 'ALL' || 
        p.applicableBranches === 'ALL' || 
        (Array.isArray(p.applicableBranches) && p.applicableBranches.includes(branchFilter));

      return matchesSearch && matchesStatus && matchesBranch;
    });
  }, [sandwichPolicies, searchQuery, statusFilter, branchFilter]);

  // Pagination logic
  const totalEntries = filteredPolicies.length;
  const paginatedPolicies = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      return filteredPolicies;
    }
    const start = (currentPage - 1) * pageSize;
    return filteredPolicies.slice(start, start + pageSize);
  }, [filteredPolicies, currentPage, pageSize]);

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(paginatedPolicies.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  const openCreateModal = () => {
    setEditingPolicy(null);
    setFormData({
      policyName: '',
      description: '',
      applicableLeaveTypes: ['Casual Leave', 'Sick Leave', 'Unpaid Leave'],
      applicableEmployees: 'ALL',
      applicableDepartments: 'ALL',
      applicableDesignations: 'ALL',
      applicableBranches: 'ALL',
      effectiveFrom: new Date().toISOString().split('T')[0],
      effectiveTo: '',
      status: 'Active',
      sandwichRuleEnabled: true,
      countWeeklyOffAsLeave: true,
      countPublicHolidayAsLeave: true,
      sandwichCondition: 'BOTH_SIDES_MANDATORY',
      payType: 'SAME_AS_APPLIED_LEAVE',
      customPayRuleFormula: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (p: SandwichLeavePolicy) => {
    setEditingPolicy(p);
    setFormData({
      policyName: p.policyName,
      description: p.description,
      applicableLeaveTypes: p.applicableLeaveTypes || [],
      applicableEmployees: p.applicableEmployees,
      applicableDepartments: p.applicableDepartments,
      applicableDesignations: p.applicableDesignations,
      applicableBranches: p.applicableBranches,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo || '',
      status: p.status,
      sandwichRuleEnabled: p.sandwichRuleEnabled,
      countWeeklyOffAsLeave: p.countWeeklyOffAsLeave,
      countPublicHolidayAsLeave: p.countPublicHolidayAsLeave,
      sandwichCondition: p.sandwichCondition,
      payType: p.payType,
      customPayRuleFormula: p.customPayRuleFormula || ''
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.policyName.trim()) return;

    if (editingPolicy) {
      updateSandwichPolicy(editingPolicy.id, {
        policyName: formData.policyName.trim(),
        description: formData.description.trim(),
        applicableLeaveTypes: formData.applicableLeaveTypes,
        applicableEmployees: formData.applicableEmployees,
        applicableDepartments: formData.applicableDepartments,
        applicableDesignations: formData.applicableDesignations,
        applicableBranches: formData.applicableBranches,
        effectiveFrom: formData.effectiveFrom,
        effectiveTo: formData.effectiveTo || undefined,
        status: formData.status,
        sandwichRuleEnabled: formData.sandwichRuleEnabled,
        countWeeklyOffAsLeave: formData.countWeeklyOffAsLeave,
        countPublicHolidayAsLeave: formData.countPublicHolidayAsLeave,
        sandwichCondition: formData.sandwichCondition,
        payType: formData.payType,
        customPayRuleFormula: formData.customPayRuleFormula
      });
    } else {
      createSandwichPolicy({
        policyName: formData.policyName.trim(),
        description: formData.description.trim(),
        applicableLeaveTypes: formData.applicableLeaveTypes,
        applicableEmployees: formData.applicableEmployees,
        applicableDepartments: formData.applicableDepartments,
        applicableDesignations: formData.applicableDesignations,
        applicableBranches: formData.applicableBranches,
        effectiveFrom: formData.effectiveFrom,
        effectiveTo: formData.effectiveTo || undefined,
        status: formData.status,
        sandwichRuleEnabled: formData.sandwichRuleEnabled,
        countWeeklyOffAsLeave: formData.countWeeklyOffAsLeave,
        countPublicHolidayAsLeave: formData.countPublicHolidayAsLeave,
        sandwichCondition: formData.sandwichCondition,
        payType: formData.payType,
        customPayRuleFormula: formData.customPayRuleFormula
      });
    }

    setIsModalOpen(false);
  };

  const toggleLeaveTypeSelection = (typeName: string) => {
    setFormData(prev => {
      const exists = prev.applicableLeaveTypes.includes(typeName);
      return {
        ...prev,
        applicableLeaveTypes: exists 
          ? prev.applicableLeaveTypes.filter(t => t !== typeName)
          : [...prev.applicableLeaveTypes, typeName]
      };
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & KPI Stat Row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(14, 116, 144, 0.15)'
          }}>
            <Sliders size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '1.28rem', fontWeight: 800, color: '#0F172A' }}>
                Sandwich Leave Policy Engine
              </h2>
              <span style={{ 
                fontSize: '0.72rem', 
                backgroundColor: '#ECFEFF', 
                color: '#0E7490', 
                fontWeight: 700, 
                padding: '3px 9px', 
                borderRadius: '9999px',
                border: '1px solid #CFFAFE'
              }}>
                HR & CEO Controlled
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#64748B' }}>
              Dynamic, policy-driven rules connecting leave requests, weekly offs, branch holidays, attendance, and payroll deductions
            </p>
          </div>
        </div>

        {isPrivileged && (
          <button
            className="btn btn-primary"
            onClick={openCreateModal}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              backgroundColor: '#0E7490',
              borderColor: '#0E7490',
              borderRadius: '12px',
              padding: '10px 18px',
              fontWeight: 700
            }}
          >
            <Plus size={18} /> Create Sandwich Leave Policy
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', border: '1px solid #E7ECF3', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600 }}>Active Sandwich Policies</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>
              {sandwichPolicies.filter(p => p.status === 'Active').length}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', border: '1px solid #E7ECF3', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#DCFCE7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600 }}>Weekly Off Sandwiches</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>
              {sandwichPolicies.filter(p => p.status === 'Active' && p.countWeeklyOffAsLeave).length} Policies
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', border: '1px solid #E7ECF3', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600 }}>Public Holiday Sandwiches</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>
              {sandwichPolicies.filter(p => p.status === 'Active' && p.countPublicHolidayAsLeave).length} Policies
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', border: '1px solid #E7ECF3', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#F1F5F9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <History size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600 }}>Audit Logs & Versions</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>
              {sandwichAuditLogs.length} Events
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #E7ECF3',
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Search policy name or description..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-control"
              style={{ paddingLeft: '36px', height: '38px', borderRadius: '10px', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="form-control"
              style={{ height: '38px', borderRadius: '10px', fontSize: '0.85rem', minWidth: '130px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Draft">Draft</option>
              <option value="Archived">Archived</option>
            </select>

            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              className="form-control"
              style={{ height: '38px', borderRadius: '10px', fontSize: '0.85rem', minWidth: '140px' }}
            >
              <option value="ALL">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
          Showing {paginatedPolicies.length} of {totalEntries} policies
        </div>
      </div>

      {/* Standardized Table adhering to VRM Design System */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div className="table-responsive" style={{ margin: 0 }}>
          <table className="hrms-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  Policy Name & Version
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  Applicable To
                </th>
                <th style={{ textAlign: 'center', padding: '14px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  Weekly Off
                </th>
                <th style={{ textAlign: 'center', padding: '14px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  Public Holiday
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  Condition
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  Pay Treatment
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  Effective Range
                </th>
                <th style={{ textAlign: 'center', padding: '14px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  Status
                </th>
                <th style={{ textAlign: 'right', padding: '14px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedPolicies.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
                    <Sliders size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#64748B' }}>No sandwich leave policies found</div>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Adjust search filters or create a new policy above.</div>
                  </td>
                </tr>
              ) : (
                paginatedPolicies.map(policy => {
                  const isSelected = selectedIds.includes(policy.id);
                  const isArchived = policy.status === 'Archived';
                  const isActive = policy.status === 'Active';

                  return (
                    <tr
                      key={policy.id}
                      style={{
                        backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                        borderBottom: '1px solid #F1F5F9',
                        borderLeft: isSelected ? '4px solid #0E7490' : '4px solid transparent',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.88rem' }}>
                            {policy.policyName}
                          </span>
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            padding: '2px 6px',
                            borderRadius: '6px'
                          }}>
                            v{policy.version}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px', maxWidth: '320px' }}>
                          {policy.description}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                          {policy.applicableLeaveTypes?.map(t => (
                            <span
                              key={t}
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                color: '#0E7490',
                                padding: '1px 6px',
                                borderRadius: '4px'
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', fontSize: '0.8rem' }}>
                        {policy.applicableBranches === 'ALL' && policy.applicableDepartments === 'ALL' ? (
                          <span style={{ fontWeight: 700, color: '#0E7490' }}>Company Wide (All Sites)</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {policy.applicableBranches !== 'ALL' && (
                              <span style={{ color: '#475569', fontWeight: 600 }}>
                                Branch: {Array.isArray(policy.applicableBranches) ? policy.applicableBranches.join(', ') : 'All'}
                              </span>
                            )}
                            {policy.applicableDepartments !== 'ALL' && (
                              <span style={{ color: '#64748B' }}>
                                Dept: {Array.isArray(policy.applicableDepartments) ? policy.applicableDepartments.join(', ') : 'All'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '9999px',
                          backgroundColor: policy.countWeeklyOffAsLeave ? '#DCFCE7' : '#F1F5F9',
                          color: policy.countWeeklyOffAsLeave ? '#166534' : '#64748B'
                        }}>
                          {policy.countWeeklyOffAsLeave ? 'ON' : 'OFF'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '9999px',
                          backgroundColor: policy.countPublicHolidayAsLeave ? '#DCFCE7' : '#F1F5F9',
                          color: policy.countPublicHolidayAsLeave ? '#166534' : '#64748B'
                        }}>
                          {policy.countPublicHolidayAsLeave ? 'ON' : 'OFF'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                        {policy.sandwichCondition === 'BOTH_SIDES_MANDATORY' && 'Both Sides Mandatory'}
                        {policy.sandwichCondition === 'LEAVE_BEFORE_AND_AFTER' && 'Before & After'}
                        {policy.sandwichCondition === 'LEAVE_ONLY_BEFORE' && 'Leave Only Before'}
                        {policy.sandwichCondition === 'LEAVE_ONLY_AFTER' && 'Leave Only After'}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: policy.payType === 'UNPAID_LEAVE' ? '#FEE2E2' : '#ECFEFF',
                          color: policy.payType === 'UNPAID_LEAVE' ? '#DC2626' : '#0E7490'
                        }}>
                          {policy.payType === 'SAME_AS_APPLIED_LEAVE' && 'Same as Applied'}
                          {policy.payType === 'PAID_LEAVE' && 'Paid Leave'}
                          {policy.payType === 'UNPAID_LEAVE' && 'Unpaid (LOP)'}
                          {policy.payType === 'CUSTOM_RULE' && 'Custom Rule'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', fontSize: '0.78rem', color: '#64748B' }}>
                        <div>From: <strong style={{ color: '#1E293B' }}>{formatDateDDMMYYYY(policy.effectiveFrom)}</strong></div>
                        {policy.effectiveTo ? (
                          <div>To: <strong style={{ color: '#1E293B' }}>{formatDateDDMMYYYY(policy.effectiveTo)}</strong></div>
                        ) : (
                          <div style={{ color: '#0E7490', fontWeight: 600 }}>No Expiry</div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span className={`status-pill ${isActive ? 'approved' : isArchived ? 'overdue' : 'pending'}`}>
                          {policy.status}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {isPrivileged && (
                            <>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => openEditModal(policy)}
                                title="Edit Policy (Creates v+1)"
                                style={{ padding: '6px 10px' }}
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => toggleSandwichPolicyStatus(policy.id)}
                                disabled={isArchived}
                                title={isActive ? 'Deactivate' : 'Activate'}
                                style={{ padding: '6px 10px' }}
                              >
                                {isActive ? 'Deactivate' : 'Activate'}
                              </button>
                            </>
                          )}
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setHistoryModalPolicy(policy)}
                            title="View Policy History & Audit Logs"
                            style={{ padding: '6px 10px' }}
                          >
                            <History size={13} />
                          </button>
                          {isPrivileged && !isArchived && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                if (window.confirm(`Archive sandwich policy "${policy.policyName}"? Historical calculations will remain intact.`)) {
                                  archiveSandwichPolicy(policy.id);
                                }
                              }}
                              title="Archive Policy"
                              style={{ padding: '6px 10px', color: '#EF4444' }}
                            >
                              <Archive size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Standard Pagination Component */}
        <StandardTablePagination
          currentPage={currentPage}
          totalEntries={totalEntries}
          pageSize={pageSize}
          pageSizeOptions={[5, 10]}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Floating Action Bar for Checked Rows */}
      <StandardFloatingActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onDelete={() => {
          if (window.confirm(`Archive ${selectedIds.length} selected sandwich policies?`)) {
            selectedIds.forEach(id => archiveSandwichPolicy(id));
            setSelectedIds([]);
          }
        }}
        customActions={
          <>
            <button
              className="action-bar-btn"
              onClick={() => {
                selectedIds.forEach(id => {
                  const p = sandwichPolicies.find(item => item.id === id);
                  if (p && p.status !== 'Active') toggleSandwichPolicyStatus(id);
                });
                setSelectedIds([]);
              }}
            >
              <CheckCircle2 size={14} />
              <span>Activate</span>
            </button>
            <button
              className="action-bar-btn"
              onClick={() => {
                selectedIds.forEach(id => {
                  const p = sandwichPolicies.find(item => item.id === id);
                  if (p && p.status === 'Active') toggleSandwichPolicyStatus(id);
                });
                setSelectedIds([]);
              }}
            >
              <XCircle size={14} />
              <span>Deactivate</span>
            </button>
          </>
        }
      />

      {/* CREATE / EDIT POLICY MODAL */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '820px', width: '92%', maxHeight: '92vh', overflowY: 'auto', borderRadius: '18px', padding: 0 }}>
            <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                  {editingPolicy ? `Edit Sandwich Policy: ${editingPolicy.policyName}` : 'Create Sandwich Leave Policy'}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                  {editingPolicy ? `Saving changes will increment policy version to v${editingPolicy.version + 1} preserving past records.` : 'Configure dynamic sandwich conditions, weekly offs, holidays, and payroll rules.'}
                </p>
              </div>
              <button 
                className="close-btn" 
                onClick={() => setIsModalOpen(false)}
                style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
                
                {/* 1. Policy Details */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: 800, color: '#0E7490', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>1.</span> Policy Details & Status
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                        POLICY NAME <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Standard Corporate Sandwich Leave Policy"
                        value={formData.policyName}
                        onChange={e => setFormData({ ...formData, policyName: e.target.value })}
                        required
                        style={{ borderRadius: '10px' }}
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                        POLICY STATUS
                      </label>
                      <select
                        className="form-control"
                        value={formData.status}
                        onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                        style={{ borderRadius: '10px' }}
                      >
                        <option value="Active">Active</option>
                        <option value="Draft">Draft</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                        DESCRIPTION
                      </label>
                      <textarea
                        className="form-control"
                        rows={2}
                        placeholder="Explain the coverage, eligibility, and business intent of this sandwich rule..."
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        style={{ borderRadius: '10px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Applicable Scoping (Hierarchy) */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0E7490', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>2.</span> Policy Scope & Assignment Hierarchy
                    </h4>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                      Priority: Employee &gt; Designation &gt; Department &gt; Branch &gt; Company Default
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                        APPLICABLE BRANCHES
                      </label>
                      <select
                        className="form-control"
                        value={formData.applicableBranches === 'ALL' ? 'ALL' : (formData.applicableBranches[0] || 'ALL')}
                        onChange={e => {
                          const val = e.target.value;
                          setFormData({ ...formData, applicableBranches: val === 'ALL' ? 'ALL' : [val] });
                        }}
                        style={{ borderRadius: '10px' }}
                      >
                        <option value="ALL">All Branches (Global)</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                        APPLICABLE DEPARTMENTS
                      </label>
                      <select
                        className="form-control"
                        value={formData.applicableDepartments === 'ALL' ? 'ALL' : (formData.applicableDepartments[0] || 'ALL')}
                        onChange={e => {
                          const val = e.target.value;
                          setFormData({ ...formData, applicableDepartments: val === 'ALL' ? 'ALL' : [val] });
                        }}
                        style={{ borderRadius: '10px' }}
                      >
                        <option value="ALL">All Departments</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 3. Applicable Leave Types */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0E7490', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>3.</span> Applicable Leave Types
                    </h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFormData({ ...formData, applicableLeaveTypes: [...availableLeaveTypeNames] })}
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFormData({ ...formData, applicableLeaveTypes: [] })}
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748B' }}>
                    Select which leave types are subject to the sandwich rule. Leaves not selected will follow standard calculation without sandwich deductions.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                    {availableLeaveTypeNames.map(typeName => {
                      const isChecked = formData.applicableLeaveTypes.includes(typeName);
                      return (
                        <label
                          key={typeName}
                          onClick={() => toggleLeaveTypeSelection(typeName)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: isChecked ? '1px solid #0E7490' : '1px solid #E2E8F0',
                            backgroundColor: isChecked ? '#ECFEFF' : '#F8FAFC',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            fontWeight: isChecked ? 700 : 500,
                            color: isChecked ? '#0E7490' : '#334155'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            style={{ accentColor: '#0E7490', cursor: 'pointer' }}
                          />
                          <span>{typeName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Sandwich Rule Enable & Component Toggles */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: 800, color: '#0E7490', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>4.</span> Core Sandwich Rule & Toggles
                  </h4>

                  {/* Main Switch */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    backgroundColor: formData.sandwichRuleEnabled ? '#ECFEFF' : '#F8FAFC',
                    border: formData.sandwichRuleEnabled ? '1px solid #A5F3FC' : '1px solid #E2E8F0',
                    marginBottom: '14px'
                  }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>
                        Sandwich Rule Master Toggle
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        {formData.sandwichRuleEnabled 
                          ? 'Active: System checks sandwich conditions and combines bounding leaves.'
                          : 'Inactive: System will NEVER count weekly off or holidays as leave.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, sandwichRuleEnabled: !formData.sandwichRuleEnabled })}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        border: 'none',
                        backgroundColor: formData.sandwichRuleEnabled ? '#0E7490' : '#CBD5E1',
                        color: '#FFFFFF'
                      }}
                    >
                      {formData.sandwichRuleEnabled ? 'ENABLED (ON)' : 'DISABLED (OFF)'}
                    </button>
                  </div>

                  {/* Sub Toggles */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Weekly Off Toggle */}
                    <div style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F8FAFC',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1E293B' }}>Count Weekly Off as Leave</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B' }}>e.g. Fri Leave + Sat/Sun Off + Mon Leave = 4 Days</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.countWeeklyOffAsLeave}
                        onChange={e => setFormData({ ...formData, countWeeklyOffAsLeave: e.target.checked })}
                        style={{ accentColor: '#0E7490', width: '18px', height: '18px', cursor: 'pointer' }}
                        disabled={!formData.sandwichRuleEnabled}
                      />
                    </div>

                    {/* Public Holiday Toggle */}
                    <div style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F8FAFC',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1E293B' }}>Count Public Holiday as Leave</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B' }}>e.g. Mon Leave + Tue Holiday + Wed Leave = 3 Days</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.countPublicHolidayAsLeave}
                        onChange={e => setFormData({ ...formData, countPublicHolidayAsLeave: e.target.checked })}
                        style={{ accentColor: '#0E7490', width: '18px', height: '18px', cursor: 'pointer' }}
                        disabled={!formData.sandwichRuleEnabled}
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Sandwich Condition (Both Sides Mandatory, etc.) */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '0.92rem', fontWeight: 800, color: '#0E7490', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>5.</span> Sandwich Trigger Condition
                  </h4>
                  <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#64748B' }}>
                    Defines what pattern of bounding leave days triggers conversion of intervening weekly offs or holidays into sandwich leaves.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                    {[
                      { id: 'BOTH_SIDES_MANDATORY', title: 'Both Sides Mandatory (Recommended Default)', desc: 'Intervening off/holiday is counted ONLY when leave exists on BOTH sides.' },
                      { id: 'LEAVE_BEFORE_AND_AFTER', title: 'Leave Before and After', desc: 'Identical to both sides mandatory; requires bounded leaves.' },
                      { id: 'LEAVE_ONLY_BEFORE', title: 'Leave Only Before', desc: 'Applies sandwich when leave exists on the day immediately preceding the off.' },
                      { id: 'LEAVE_ONLY_AFTER', title: 'Leave Only After', desc: 'Applies sandwich when leave exists on the day immediately following the off.' }
                    ].map(opt => {
                      const isSelected = formData.sandwichCondition === opt.id;
                      return (
                        <div
                          key={opt.id}
                          onClick={() => setFormData({ ...formData, sandwichCondition: opt.id as any })}
                          style={{
                            padding: '12px',
                            borderRadius: '10px',
                            border: isSelected ? '2px solid #0E7490' : '1px solid #E2E8F0',
                            backgroundColor: isSelected ? '#ECFEFF' : '#F8FAFC',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="radio"
                              name="sandwichCondition"
                              checked={isSelected}
                              onChange={() => {}}
                              style={{ accentColor: '#0E7490' }}
                            />
                            <span style={{ fontWeight: 800, fontSize: '0.84rem', color: isSelected ? '#0E7490' : '#1E293B' }}>
                              {opt.title}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '4px', paddingLeft: '20px' }}>
                            {opt.desc}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 6. Paid / Unpaid Behaviour */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '0.92rem', fontWeight: 800, color: '#0E7490', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>6.</span> Sandwich Day Pay Treatment
                  </h4>
                  <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#64748B' }}>
                    Determines whether sandwich days are paid or unpaid (Loss of Pay flowing directly to Payroll salary deductions).
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {[
                      { id: 'SAME_AS_APPLIED_LEAVE', title: 'Same as Applied Leave', desc: 'Follows applied leave pay type. Casual Leave -> Paid, Unpaid -> Unpaid.' },
                      { id: 'PAID_LEAVE', title: 'Paid Leave', desc: 'Sandwich days are fully paid; deducted from applicable leave balance.' },
                      { id: 'UNPAID_LEAVE', title: 'Unpaid Leave (LOP)', desc: 'Sandwich days are unpaid and automatically deducted from monthly salary.' }
                    ].map(payOpt => {
                      const isSelected = formData.payType === payOpt.id;
                      return (
                        <div
                          key={payOpt.id}
                          onClick={() => setFormData({ ...formData, payType: payOpt.id as any })}
                          style={{
                            padding: '12px',
                            borderRadius: '10px',
                            border: isSelected ? '2px solid #0E7490' : '1px solid #E2E8F0',
                            backgroundColor: isSelected ? '#ECFEFF' : '#F8FAFC',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="radio"
                              name="payType"
                              checked={isSelected}
                              onChange={() => {}}
                              style={{ accentColor: '#0E7490' }}
                            />
                            <span style={{ fontWeight: 800, fontSize: '0.84rem', color: isSelected ? '#0E7490' : '#1E293B' }}>
                              {payOpt.title}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '4px', paddingLeft: '20px' }}>
                            {payOpt.desc}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 7. Effective Dates */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: 800, color: '#0E7490', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>7.</span> Effective Period
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                        EFFECTIVE FROM <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <DateInput
                        className="form-control"
                        value={formData.effectiveFrom}
                        onChange={e => setFormData({ ...formData, effectiveFrom: e.target.value })}
                        required
                        style={{ borderRadius: '10px' }}
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                        EFFECTIVE TO (OPTIONAL)
                      </label>
                      <DateInput
                        className="form-control"
                        value={formData.effectiveTo}
                        onChange={e => setFormData({ ...formData, effectiveTo: e.target.value })}
                        style={{ borderRadius: '10px' }}
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '10px', backgroundColor: '#F8FAFC' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  style={{ borderRadius: '10px', padding: '8px 18px' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    backgroundColor: '#0E7490',
                    borderColor: '#0E7490',
                    borderRadius: '10px',
                    padding: '8px 22px',
                    fontWeight: 700
                  }}
                >
                  {editingPolicy ? 'Update & Create New Version' : 'Save & Activate Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUDIT & VERSION HISTORY MODAL */}
      {historyModalPolicy && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px', width: '90%', maxHeight: '80vh', overflowY: 'auto', borderRadius: '18px', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                  Policy Audit & Version History
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#0E7490', fontWeight: 700, marginTop: '2px' }}>
                  {historyModalPolicy.policyName} (Current: v{historyModalPolicy.version})
                </div>
              </div>
              <button 
                onClick={() => setHistoryModalPolicy(null)}
                style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sandwichAuditLogs.filter(l => l.policyId === historyModalPolicy.id).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94A3B8' }}>
                  No historical changes logged for this policy yet.
                </div>
              ) : (
                sandwichAuditLogs
                  .filter(l => l.policyId === historyModalPolicy.id)
                  .map(log => (
                    <div 
                      key={log.id} 
                      style={{
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          backgroundColor: log.action.includes('CREATED') ? '#DCFCE7' : log.action.includes('UPDATED') ? '#ECFEFF' : '#F1F5F9',
                          color: log.action.includes('CREATED') ? '#166534' : log.action.includes('UPDATED') ? '#0E7490' : '#475569'
                        }}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                          {log.timestamp}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B', marginTop: '4px' }}>
                        {log.reason || 'Policy update'}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                        By: <strong>{log.user}</strong> ({log.userRole})
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
