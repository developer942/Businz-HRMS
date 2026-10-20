import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  LoanPolicy, 
  LoanPolicyType, 
  LoanLimitType, 
  ApprovalWorkflowMode, 
  LowSalaryRepaymentRule, 
  PayslipVisibilityRule,
  RequestLimitPeriod,
  AdvanceRepaymentType,
  DeductionStartOption,
  AdvanceApprovalAuthority
} from '../../types/settings';
import { formatCurrency } from '../../utils/numbers';
import { 
  Banknote, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  ShieldAlert, 
  Calendar, 
  Calculator, 
  Percent, 
  DollarSign, 
  UserCheck, 
  Clock, 
  HelpCircle,
  Eye,
  Check,
  X,
  Building,
  Users,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Grid,
  FileText,
  AlertCircle,
  Layers,
  RefreshCw
} from 'lucide-react';

export const AdvanceLoanPolicySettings: React.FC = () => {
  const { 
    loanPolicies, 
    createLoanPolicy, 
    updateLoanPolicy, 
    deleteLoanPolicy, 
    currentUser, 
    departments,
    branches,
    employees 
  } = useHRMS();

  const isPrivileged = currentUser.role !== 'Employee';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<LoanPolicy | null>(null);

  // 13 Settings Form State strictly mapped to user specifications
  const [formData, setFormData] = useState<{
    // 1. Policy Name
    policyName: string;
    policyType: LoanPolicyType;
    description: string;

    // 2. Applicable Employees
    applicableEmployees: 'ALL' | string[];
    applicableDepartments: 'ALL' | string[];
    applicableBranches: 'ALL' | string[];

    // 3. Minimum Working Period
    minimumEmploymentMonths: number;

    // 4. Maximum Advance Amount
    maxLoanAmount: number;
    minLoanAmount: number;

    // 5. Maximum Salary %
    maxSalaryPercent: number;
    maxLoanLimitType: LoanLimitType;
    maxLoanLimitValue: number;

    // 6. Request Limit
    requestLimit: RequestLimitPeriod;

    // 7. Previous Advance Pending
    allowPreviousPending: boolean;
    maxActiveLoans: number;

    // 8. Repayment Type
    repaymentType: AdvanceRepaymentType;

    // 9. Maximum Repayment Months
    maxRepaymentMonths: number;
    minRepaymentMonths: number;

    // 10. Deduction Start
    deductionStart: DeductionStartOption;
    deductionStartRule: 'NEXT_PAYROLL_CYCLE' | 'SPECIFIED_MONTH';

    // 11. Approval By
    approvalBy: AdvanceApprovalAuthority;
    approvalWorkflow: ApprovalWorkflowMode;

    // 12. Reason Required
    reasonRequired: boolean;

    // 13. Policy Status
    status: 'Active' | 'Inactive';

    // Additional governance
    lowSalaryRule: LowSalaryRepaymentRule;
    payslipVisibility: PayslipVisibilityRule;
    effectiveFrom: string;
    effectiveTo: string;
  }>({
    policyName: 'Advance Salary',
    policyType: 'Advance Salary',
    description: 'Standard monthly advance policy for full-time employees with automated payroll EMI recovery.',
    applicableEmployees: 'ALL',
    applicableDepartments: 'ALL',
    applicableBranches: 'ALL',
    minimumEmploymentMonths: 3,
    maxLoanAmount: 20000,
    minLoanAmount: 2000,
    maxSalaryPercent: 50,
    maxLoanLimitType: 'PERCENTAGE_SALARY',
    maxLoanLimitValue: 50,
    requestLimit: 'ONCE_IN_3_MONTHS',
    allowPreviousPending: false,
    maxActiveLoans: 1,
    repaymentType: 'MONTHLY_EMI',
    maxRepaymentMonths: 6,
    minRepaymentMonths: 1,
    deductionStart: 'NEXT_MONTH',
    deductionStartRule: 'NEXT_PAYROLL_CYCLE',
    approvalBy: 'HR_OR_CEO',
    approvalWorkflow: 'HR_OR_CEO',
    reasonRequired: true,
    status: 'Active',
    lowSalaryRule: 'DEDUCT_AVAILABLE_CARRY_FORWARD',
    payslipVisibility: 'GENERIC',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: ''
  });


  const openAddModal = () => {
    setEditingPolicy(null);
    setFormData({
      policyName: 'Advance Salary',
      policyType: 'Advance Salary',
      description: 'Standard enterprise salary advance policy with predefined caps and recovery schedule.',
      applicableEmployees: 'ALL',
      applicableDepartments: 'ALL',
      applicableBranches: 'ALL',
      minimumEmploymentMonths: 3,
      maxLoanAmount: 20000,
      minLoanAmount: 2000,
      maxSalaryPercent: 50,
      maxLoanLimitType: 'PERCENTAGE_SALARY',
      maxLoanLimitValue: 50,
      requestLimit: 'ONCE_IN_3_MONTHS',
      allowPreviousPending: false,
      maxActiveLoans: 1,
      repaymentType: 'MONTHLY_EMI',
      maxRepaymentMonths: 6,
      minRepaymentMonths: 1,
      deductionStart: 'NEXT_MONTH',
      deductionStartRule: 'NEXT_PAYROLL_CYCLE',
      approvalBy: 'HR_OR_CEO',
      approvalWorkflow: 'HR_OR_CEO',
      reasonRequired: true,
      status: 'Active',
      lowSalaryRule: 'DEDUCT_AVAILABLE_CARRY_FORWARD',
      payslipVisibility: 'GENERIC',
      effectiveFrom: new Date().toISOString().split('T')[0],
      effectiveTo: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (p: LoanPolicy) => {
    setEditingPolicy(p);
    setFormData({
      policyName: p.policyName || 'Advance Salary',
      policyType: p.policyType || 'Advance Salary',
      description: p.description || '',
      applicableEmployees: p.applicableEmployees || 'ALL',
      applicableDepartments: p.applicableDepartments || 'ALL',
      applicableBranches: p.applicableBranches || 'ALL',
      minimumEmploymentMonths: p.minimumEmploymentMonths ?? 3,
      maxLoanAmount: p.maxLoanAmount ?? 20000,
      minLoanAmount: p.minLoanAmount ?? 2000,
      maxSalaryPercent: p.maxSalaryPercent ?? (p.maxLoanLimitType === 'PERCENTAGE_SALARY' ? p.maxLoanLimitValue : 50),
      maxLoanLimitType: p.maxLoanLimitType || 'PERCENTAGE_SALARY',
      maxLoanLimitValue: p.maxLoanLimitValue ?? 50,
      requestLimit: p.requestLimit || 'ONCE_IN_3_MONTHS',
      allowPreviousPending: p.allowPreviousPending ?? (p.maxActiveLoans > 1),
      maxActiveLoans: p.maxActiveLoans ?? 1,
      repaymentType: p.repaymentType || 'MONTHLY_EMI',
      maxRepaymentMonths: p.maxRepaymentMonths ?? 6,
      minRepaymentMonths: p.minRepaymentMonths ?? 1,
      deductionStart: p.deductionStart || 'NEXT_MONTH',
      deductionStartRule: p.deductionStartRule || 'NEXT_PAYROLL_CYCLE',
      approvalBy: p.approvalBy || (p.approvalWorkflow as any) || 'HR_OR_CEO',
      approvalWorkflow: p.approvalWorkflow || 'HR_OR_CEO',
      reasonRequired: p.reasonRequired ?? true,
      status: p.status || 'Active',
      lowSalaryRule: p.lowSalaryRule || 'DEDUCT_AVAILABLE_CARRY_FORWARD',
      payslipVisibility: p.payslipVisibility || 'GENERIC',
      effectiveFrom: p.effectiveFrom || new Date().toISOString().split('T')[0],
      effectiveTo: p.effectiveTo || ''
    });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.policyName.trim()) return;

    const payload = {
      ...formData,
      // Keep legacy fields synchronized
      maxLoanLimitType: 'PERCENTAGE_SALARY' as LoanLimitType,
      maxLoanLimitValue: formData.maxSalaryPercent,
      maxActiveLoans: formData.allowPreviousPending ? 2 : 1,
      approvalWorkflow: formData.approvalBy === 'HR' ? 'HR_ONLY' : formData.approvalBy === 'CEO' ? 'CEO_ONLY' : formData.approvalBy === 'HR_THEN_CEO' ? 'HR_THEN_CEO' : 'HR_OR_CEO',
      deductionStartRule: formData.deductionStart === 'NEXT_MONTH' ? 'NEXT_PAYROLL_CYCLE' : 'SPECIFIED_MONTH'
    };

    if (editingPolicy) {
      updateLoanPolicy(editingPolicy.id, payload as any);
    } else {
      createLoanPolicy(payload as any);
    }
    setIsModalOpen(false);
  };

  // Helper formatting for 13 settings table
  const get13SettingsData = (policy: LoanPolicy) => {
    const isPendingAllowed = policy.allowPreviousPending ?? (policy.maxActiveLoans > 1);
    const salaryPct = policy.maxSalaryPercent ?? (policy.maxLoanLimitType === 'PERCENTAGE_SALARY' ? policy.maxLoanLimitValue : 50);
    const reqLimitLabel = 
      policy.requestLimit === 'ONCE_A_MONTH' ? 'Once in a Month' :
      policy.requestLimit === 'ONCE_IN_3_MONTHS' ? 'Once in 3 Months' :
      policy.requestLimit === 'ONCE_IN_6_MONTHS' ? 'Once in 6 Months' :
      policy.requestLimit === 'ONCE_A_YEAR' ? 'Once a Year' :
      policy.requestLimit === 'NO_LIMIT' ? 'No Limit' : 'Once in 3 Months';

    const repayLabel = 
      policy.repaymentType === 'FULL' ? 'Full' :
      policy.repaymentType === 'MONTHLY_EMI' ? 'Monthly EMI' :
      policy.repaymentType === 'BOTH' ? 'Full / Monthly EMI' : 'Monthly EMI';

    const deductLabel = 
      policy.deductionStart === 'CURRENT_MONTH' ? 'Current Month' :
      policy.deductionStart === 'NEXT_MONTH' ? 'Next Month' :
      policy.deductionStartRule === 'NEXT_PAYROLL_CYCLE' ? 'Next Month' : 'Current Month';

    const approvalLabel = 
      policy.approvalBy === 'HR' ? 'HR Only' :
      policy.approvalBy === 'CEO' ? 'CEO Only' :
      policy.approvalBy === 'HR_THEN_CEO' ? 'HR then CEO' : 'HR / CEO';

    return [
      {
        num: 1,
        name: 'Policy Name',
        value: policy.policyName,
        example: 'Advance Salary',
        badgeColor: '#0E7490',
        badgeBg: '#ECFEFF',
        description: 'Official identifier for this advance compensation policy'
      },
      {
        num: 2,
        name: 'Applicable Employees',
        value: policy.applicableEmployees === 'ALL' ? 'All' : `Selected (${Array.isArray(policy.applicableEmployees) ? policy.applicableEmployees.length : 0} Employees)`,
        example: 'All / Selected',
        badgeColor: '#0284C7',
        badgeBg: '#E0F2FE',
        description: 'Scope of workforce permitted to request under this policy'
      },
      {
        num: 3,
        name: 'Minimum Working Period',
        value: `${policy.minimumEmploymentMonths ?? 3} Months`,
        example: '3 Months',
        badgeColor: '#D97706',
        badgeBg: '#FEF3C7',
        description: 'Minimum continuous employment required prior to eligibility'
      },
      {
        num: 4,
        name: 'Maximum Advance Amount',
        value: formatCurrency(policy.maxLoanAmount ?? 20000),
        example: '₹20,000.00',
        badgeColor: '#059669',
        badgeBg: '#D1FAE5',
        description: 'Strict absolute monetary ceiling for any single request'
      },
      {
        num: 5,
        name: 'Maximum Salary %',
        value: `${salaryPct}%`,
        example: '50%',
        badgeColor: '#7C3AED',
        badgeBg: '#EDE9FE',
        description: 'Maximum percentage of employee monthly salary allowed'
      },
      {
        num: 6,
        name: 'Request Limit',
        value: reqLimitLabel,
        example: 'Once in 3 Months',
        badgeColor: '#2563EB',
        badgeBg: '#DBEAFE',
        description: 'Frequency interval permitted between successive advance requests'
      },
      {
        num: 7,
        name: 'Previous Advance Pending',
        value: isPendingAllowed ? 'Allow' : 'Not Allow',
        example: 'Allow / Not Allow',
        badgeColor: isPendingAllowed ? '#16A34A' : '#DC2626',
        badgeBg: isPendingAllowed ? '#DCFCE7' : '#FEE2E2',
        description: 'Permission rule when an employee already has an active balance'
      },
      {
        num: 8,
        name: 'Repayment Type',
        value: repayLabel,
        example: 'Full / Monthly EMI',
        badgeColor: '#0D9488',
        badgeBg: '#CCFBF1',
        description: 'Repayment mechanism deducted automatically via payroll'
      },
      {
        num: 9,
        name: 'Maximum Repayment Months',
        value: `${policy.maxRepaymentMonths ?? 6} Months`,
        example: '3 / 6 Months',
        badgeColor: '#4F46E5',
        badgeBg: '#EEF2FF',
        description: 'Maximum tenure duration allowed to fully settle advance'
      },
      {
        num: 10,
        name: 'Deduction Start',
        value: deductLabel,
        example: 'Current / Next Month',
        badgeColor: '#9333EA',
        badgeBg: '#F3E8FF',
        description: 'Payroll cycle in which recovery deduction first begins'
      },
      {
        num: 11,
        name: 'Approval By',
        value: approvalLabel,
        example: 'HR / CEO',
        badgeColor: '#C026D3',
        badgeBg: '#FAE8FF',
        description: 'Designated executive or management authority for approval'
      },
      {
        num: 12,
        name: 'Reason Required',
        value: (policy.reasonRequired ?? true) ? 'Yes' : 'No',
        example: 'Yes / No',
        badgeColor: (policy.reasonRequired ?? true) ? '#16A34A' : '#64748B',
        badgeBg: (policy.reasonRequired ?? true) ? '#DCFCE7' : '#F1F5F9',
        description: 'Whether formal justification is mandatory at request submission'
      },
      {
        num: 13,
        name: 'Policy Status',
        value: policy.status || 'Active',
        example: 'Active / Inactive',
        badgeColor: policy.status === 'Active' ? '#15803D' : '#64748B',
        badgeBg: policy.status === 'Active' ? '#DCFCE7' : '#F1F5F9',
        description: 'Live availability status of this policy in the employee portal'
      }
    ];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 1. Header Toolbar with Stats & Mode Switch */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: '#FFFFFF',
        padding: '14px 20px',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#F8FAFC',
            padding: '6px 12px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0'
          }}>
            <Banknote size={18} color="#0E7490" />
            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>
              Advance Salary Policy
            </span>
            <span style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: '#ECFEFF',
              color: '#0E7490',
              fontWeight: 700,
              border: '1px solid #CFFAFE'
            }}>
              {loanPolicies.length} Policies
            </span>
          </div>
        </div>

        {isPrivileged && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              type="button" 
              className="btn btn-primary btn-sm"
              onClick={openAddModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                padding: '7px 16px',
                borderRadius: '10px',
                backgroundColor: '#0E7490',
                borderColor: '#0E7490'
              }}
            >
              <Plus size={15} />
              <span>Add Advance Policy</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Empty State when no policy exists */}
      {loanPolicies.length === 0 ? (
        <div 
          className="card"
          style={{
            borderRadius: '16px',
            border: '2px dashed #CBD5E1',
            padding: '50px 24px',
            textAlign: 'center',
            backgroundColor: '#FAFCFD',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px'
          }}
        >
          <div 
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#ECFEFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              border: '1px solid #CFFAFE'
            }}
          >
            <Banknote size={32} color="#0E7490" />
          </div>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
            No Advance Salary Policy Configured
          </h4>
          <p style={{ margin: '0 0 24px 0', fontSize: '0.88rem', color: '#64748B', maxWidth: '520px', lineHeight: 1.5 }}>
            Configure your company's Advance Salary policy using the standardized 13 settings matrix covering eligibility, maximum loan limits, repayment months, deduction cycles, and approval workflow.
          </p>
          {isPrivileged && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={openAddModal}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 22px',
                  fontSize: '0.88rem',
                  borderRadius: '12px',
                  fontWeight: 700,
                  backgroundColor: '#0E7490',
                  borderColor: '#0E7490',
                  boxShadow: '0 4px 12px rgba(14, 116, 144, 0.2)'
                }}
              >
                <Plus size={16} />
                <span>Add Advance Policy</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Card Grid View Only */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
          {loanPolicies.map((policy) => {
            const isActive = policy.status === 'Active';
            const settings = get13SettingsData(policy);
            return (
              <div 
                key={policy.id}
                className="card"
                style={{
                  borderRadius: '16px',
                  border: isActive ? '1.5px solid #0E7490' : '1px solid var(--color-border)',
                  boxShadow: isActive ? '0 4px 14px rgba(14, 116, 144, 0.08)' : 'var(--shadow-sm)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  backgroundColor: '#FFFFFF'
                }}
              >
                <div>
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{
                          backgroundColor: isActive ? '#DCFCE7' : '#F1F5F9',
                          color: isActive ? '#15803D' : '#64748B',
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          borderRadius: '999px'
                        }}>
                          {policy.status}
                        </span>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: 600, 
                          color: '#0E7490',
                          backgroundColor: '#ECFEFF',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}>
                          {policy.policyType}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                        {policy.policyName}
                      </h3>
                    </div>

                    {isPrivileged && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          type="button" 
                          onClick={() => openEditModal(policy)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 8px', borderRadius: '8px' }}
                          title="Edit Policy"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            if (window.confirm(`Delete policy "${policy.policyName}"?`)) {
                              deleteLoanPolicy(policy.id);
                            }
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 8px', borderRadius: '8px', color: '#EF4444' }}
                          title="Delete Policy"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  <p style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '14px', lineHeight: 1.4 }}>
                    {policy.description || 'Configured advance rules and limits.'}
                  </p>

                  {/* Settings Key-Value Grid */}
                  <div style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: '12px',
                    padding: '12px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    border: '1px solid #F1F5F9'
                  }}>
                    {settings.slice(1, 13).map(s => (
                      <div key={s.num} style={{ fontSize: '0.76rem' }}>
                        <div style={{ color: '#64748B', fontSize: '0.68rem', marginBottom: '1px' }}>
                          {s.name}:
                        </div>
                        <div style={{ fontWeight: 750, color: '#1E293B' }}>
                          {s.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Metadata */}
                <div style={{ 
                  marginTop: '16px', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  paddingTop: '10px', 
                  borderTop: '1px solid var(--color-border)', 
                  fontSize: '0.72rem', 
                  color: '#64748B' 
                }}>
                  <span>Created: {policy.createdAt}</span>
                </div>
              </div>
            );
          })}

          {isPrivileged && (
            <div
              onClick={openAddModal}
              style={{
                borderRadius: '16px',
                border: '2px dashed #CBD5E1',
                padding: '30px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                backgroundColor: '#FAFCFD',
                cursor: 'pointer',
                minHeight: '260px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#0E7490';
                e.currentTarget.style.backgroundColor = '#F0FDFA';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.backgroundColor = '#FAFCFD';
              }}
            >
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: '#ECFEFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0E7490'
              }}>
                <Plus size={22} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                  Create New Advance Policy
                </div>
                <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '4px' }}>
                  Configure eligibility, loan caps, EMI repayment rules
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Add / Edit Policy Modal with 13 Standardized Settings */}
      {isModalOpen && (
        <div 
          className="modal-overlay" 
          style={{ 
            zIndex: 9999, 
            backgroundColor: 'rgba(15, 23, 42, 0.65)', 
            backdropFilter: 'blur(6px)',
            padding: isFullScreen ? '12px' : '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div 
            className="modal-content" 
            style={{ 
              width: isFullScreen ? '98vw' : '92vw',
              maxWidth: isFullScreen ? '1440px' : '1100px',
              height: isFullScreen ? '96vh' : '88vh',
              maxHeight: isFullScreen ? '96vh' : '88vh',
              borderRadius: '20px',
              backgroundColor: '#FFFFFF',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{ 
              padding: '16px 24px', 
              borderBottom: '1px solid #E2E8F0', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              flexShrink: 0,
              background: '#FFFFFF'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '42px', 
                  height: '42px', 
                  borderRadius: '12px', 
                  background: '#ECFEFF', 
                  border: '1px solid #CFFAFE', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Banknote size={22} color="#0E7490" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                      {editingPolicy ? 'Edit Advance Salary Policy' : 'Create Advance Salary Policy'}
                    </h3>
                    <span style={{ 
                      fontSize: '0.72rem', 
                      fontWeight: 700, 
                      padding: '2px 8px', 
                      borderRadius: '9999px',
                      background: formData.status === 'Active' ? '#DCFCE7' : '#F1F5F9',
                      color: formData.status === 'Active' ? '#15803D' : '#64748B',
                      border: formData.status === 'Active' ? '1px solid #BBF7D0' : '1px solid #E2E8F0'
                    }}>
                      {formData.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#64748B', margin: '2px 0 0' }}>
                    Configure advance parameters matching your enterprise governance rules.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  title={isFullScreen ? "Restore modal size" : "Expand to full screen"}
                  style={{ 
                    background: '#F8FAFC', 
                    border: '1px solid #E2E8F0', 
                    cursor: 'pointer', 
                    color: '#64748B',
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  title="Close"
                  style={{ 
                    background: '#F8FAFC', 
                    border: '1px solid #E2E8F0', 
                    cursor: 'pointer', 
                    color: '#64748B',
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body & Form */}
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', margin: 0 }}>
              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '20px 24px', 
                background: '#F8FAFC',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
              }}>

                {/* Policy Identity & Scope */}
                <div style={{ 
                  background: '#FFFFFF', 
                  borderRadius: '14px', 
                  border: '1px solid #E2E8F0', 
                  padding: '18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                    <Building size={16} color="#0E7490" />
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                      Policy Identity & Scope
                    </h4>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                    {/* Policy Name */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Policy Name <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <input 
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. Advance Salary"
                        value={formData.policyName}
                        onChange={e => setFormData({ ...formData, policyName: e.target.value })}
                      />
                    </div>

                    {/* Applicable Employees */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Applicable Employees <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <select 
                        className="form-control"
                        value={formData.applicableEmployees === 'ALL' ? 'ALL' : 'SELECTED'}
                        onChange={e => setFormData({ 
                          ...formData, 
                          applicableEmployees: e.target.value === 'ALL' ? 'ALL' : [] 
                        })}
                      >
                        <option value="ALL">All Employees (Company-wide)</option>
                        <option value="SELECTED">Selected Employees Only</option>
                      </select>
                    </div>

                    {/* Policy Status */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Policy Status <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <select 
                        className="form-control"
                        value={formData.status}
                        onChange={e => setFormData({ ...formData, status: e.target.value as 'Active' | 'Inactive' })}
                      >
                        <option value="Active">Active (Live in portal)</option>
                        <option value="Inactive">Inactive (Suspended / Draft)</option>
                      </select>
                    </div>
                  </div>

                  {/* Multi-select dropdown if Selected Employees is picked */}
                  {formData.applicableEmployees !== 'ALL' && (
                    <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Select Eligible Departments / Employees:
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                        {employees.map(emp => {
                          const isSelected = Array.isArray(formData.applicableEmployees) && formData.applicableEmployees.includes(emp.employeeId);
                          return (
                            <label 
                              key={emp.employeeId} 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                padding: '4px 10px', 
                                borderRadius: '6px', 
                                backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF', 
                                border: isSelected ? '1px solid #0E7490' : '1px solid #CBD5E1', 
                                fontSize: '0.75rem', 
                                cursor: 'pointer' 
                              }}
                            >
                              <input 
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => {
                                  const current = Array.isArray(formData.applicableEmployees) ? [...formData.applicableEmployees] : [];
                                  if (e.target.checked) {
                                    setFormData({ ...formData, applicableEmployees: [...current, emp.employeeId] });
                                  } else {
                                    setFormData({ ...formData, applicableEmployees: current.filter(id => id !== emp.employeeId) });
                                  }
                                }}
                              />
                              <span>{emp.firstName} {emp.lastName} ({emp.employeeId})</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B', marginBottom: '4px', display: 'block' }}>
                      Policy Purpose / Description
                    </label>
                    <input 
                      type="text"
                      className="form-control"
                      placeholder="e.g. Standard advance salary policy for unexpected emergency requirements"
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                </div>

                {/* Eligibility & Maximum Limits */}
                <div style={{ 
                  background: '#FFFFFF', 
                  borderRadius: '14px', 
                  border: '1px solid #E2E8F0', 
                  padding: '18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                    <Calculator size={16} color="#0E7490" />
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                      Eligibility & Maximum Limits
                    </h4>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                    {/* Minimum Working Period */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Minimum Working Period (Months) <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <input 
                        type="number"
                        min={0}
                        max={60}
                        className="form-control"
                        required
                        value={formData.minimumEmploymentMonths}
                        onChange={e => setFormData({ ...formData, minimumEmploymentMonths: Number(e.target.value) })}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                        Example: <strong>3 Months</strong> completed service
                      </span>
                    </div>

                    {/* Maximum Advance Amount */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Maximum Advance Amount (₹) <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <input 
                        type="number"
                        min={1000}
                        step={1000}
                        className="form-control"
                        required
                        value={formData.maxLoanAmount}
                        onChange={e => setFormData({ ...formData, maxLoanAmount: Number(e.target.value) })}
                      />
                    </div>

                    {/* Maximum Salary % */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Maximum Salary % <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <input 
                        type="number"
                        min={5}
                        max={100}
                        step={5}
                        className="form-control"
                        required
                        value={formData.maxSalaryPercent}
                        onChange={e => setFormData({ ...formData, maxSalaryPercent: Number(e.target.value) })}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                        Example: <strong>50%</strong> of monthly salary
                      </span>
                    </div>
                  </div>
                </div>

                {/* Request Rules & Restrictions */}
                <div style={{ 
                  background: '#FFFFFF', 
                  borderRadius: '14px', 
                  border: '1px solid #E2E8F0', 
                  padding: '18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                    <Clock size={16} color="#0E7490" />
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                      Request Rules & Restrictions
                    </h4>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                    {/* Request Limit */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Request Limit <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <select 
                        className="form-control"
                        value={formData.requestLimit}
                        onChange={e => setFormData({ ...formData, requestLimit: e.target.value as RequestLimitPeriod })}
                      >
                        <option value="ONCE_IN_3_MONTHS">Once in 3 Months (Standard)</option>
                        <option value="ONCE_A_MONTH">Once in a Month</option>
                        <option value="ONCE_IN_6_MONTHS">Once in 6 Months</option>
                        <option value="ONCE_A_YEAR">Once a Year</option>
                        <option value="NO_LIMIT">No Limit</option>
                      </select>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                        Example: <strong>Once in 3 Months</strong>
                      </span>
                    </div>

                    {/* Previous Advance Pending */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Previous Advance Pending <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <select 
                        className="form-control"
                        value={formData.allowPreviousPending ? 'ALLOW' : 'NOT_ALLOW'}
                        onChange={e => setFormData({ ...formData, allowPreviousPending: e.target.value === 'ALLOW' })}
                      >
                        <option value="NOT_ALLOW">Not Allow</option>
                        <option value="ALLOW">Allow</option>
                      </select>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                        Example: <strong>Allow / Not Allow</strong>
                      </span>
                    </div>

                    {/* Reason Required */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Reason Required <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <select 
                        className="form-control"
                        value={formData.reasonRequired ? 'YES' : 'NO'}
                        onChange={e => setFormData({ ...formData, reasonRequired: e.target.value === 'YES' })}
                      >
                        <option value="YES">Yes</option>
                        <option value="NO">No</option>
                      </select>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                        Example: <strong>Yes / No</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Repayment & Approval Governance */}
                <div style={{ 
                  background: '#FFFFFF', 
                  borderRadius: '14px', 
                  border: '1px solid #E2E8F0', 
                  padding: '18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                    <ShieldCheck size={16} color="#0E7490" />
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                      Repayment & Approval Governance
                    </h4>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                    {/* Repayment Type */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Repayment Type <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <select 
                        className="form-control"
                        value={formData.repaymentType}
                        onChange={e => setFormData({ ...formData, repaymentType: e.target.value as AdvanceRepaymentType })}
                      >
                        <option value="MONTHLY_EMI">Monthly EMI (Installments)</option>
                        <option value="FULL">Full (Single Deduction)</option>
                        <option value="BOTH">Full / Monthly EMI (Both)</option>
                      </select>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                        Example: <strong>Full / Monthly EMI</strong>
                      </span>
                    </div>

                    {/* Maximum Repayment Months */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Maximum Repayment Months <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <input 
                        type="number"
                        min={1}
                        max={36}
                        className="form-control"
                        required
                        value={formData.maxRepaymentMonths}
                        onChange={e => setFormData({ ...formData, maxRepaymentMonths: Number(e.target.value) })}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                        Example: <strong>3 / 6 Months</strong>
                      </span>
                    </div>

                    {/* Deduction Start */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Deduction Start <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <select 
                        className="form-control"
                        value={formData.deductionStart}
                        onChange={e => setFormData({ ...formData, deductionStart: e.target.value as 'NEXT_MONTH' | 'CURRENT_MONTH' })}
                      >
                        <option value="NEXT_MONTH">Next Month</option>
                        <option value="CURRENT_MONTH">Current Month</option>
                      </select>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                        Example: <strong>Current / Next Month</strong>
                      </span>
                    </div>

                    {/* Approval By */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Approval By <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <select 
                        className="form-control"
                        value={formData.approvalBy}
                        onChange={e => setFormData({ ...formData, approvalBy: e.target.value as AdvanceApprovalAuthority })}
                      >
                        <option value="HR_OR_CEO">HR / CEO (Either can approve)</option>
                        <option value="HR">HR Only</option>
                        <option value="CEO">CEO Only</option>
                        <option value="HR_THEN_CEO">HR Then CEO (Two-level)</option>
                      </select>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                        Example: <strong>HR / CEO</strong>
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Modal Sticky Footer */}
              <div style={{ 
                padding: '14px 24px', 
                borderTop: '1px solid #E2E8F0', 
                background: '#FFFFFF', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                flexShrink: 0 
              }}>
                <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
                  Enforcing <strong>standard advance settings</strong> on all employee self-service requests.
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setIsModalOpen(false)}
                    style={{ borderRadius: '10px', padding: '8px 18px', fontSize: '0.84rem' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    style={{ 
                      borderRadius: '10px', 
                      padding: '8px 22px', 
                      fontSize: '0.84rem', 
                      fontWeight: 700, 
                      backgroundColor: '#0E7490', 
                      borderColor: '#0E7490',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)'
                    }}
                  >
                    <Check size={16} />
                    {editingPolicy ? 'Update Advance Policy' : 'Save Advance Policy'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
