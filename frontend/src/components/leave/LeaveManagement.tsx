import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  CalendarDays, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Eye, 
  Sliders, 
  ShieldAlert, 
  FileCheck, 
  Info,
  Calendar,
  Layers,
  Check,
  DollarSign,
  Home
} from 'lucide-react';
import { LeaveRequest, SandwichCalculationResult, SandwichPayType, SandwichCalculationDayDetail } from '../../types/hrms';
import { toNum } from '../../utils/numbers';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { ExportDropdown } from '../common/ExportDropdown';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';

interface LeaveManagementProps {
  openApplyModal?: boolean;
  openWfhModal?: boolean;
  onCloseQuickAdd?: () => void;
}

const DEFAULT_LEAVE_CATEGORY_OPTIONS = [
  { id: 'default-cl', value: 'Casual Leave (CL)', label: 'Casual Leave (CL)' },
  { id: 'default-sl', value: 'Sick Leave (SL)', label: 'Sick Leave (SL)' },
  { id: 'default-el', value: 'Earned Leave (EL)', label: 'Earned Leave (EL)' },
  { id: 'default-eml', value: 'Emergency Leave', label: 'Emergency Leave' },
  { id: 'default-pl', value: 'Paid Leave', label: 'Paid Leave' },
  { id: 'default-ul', value: 'Unpaid Leave', label: 'Unpaid Leave' },
  { id: 'default-co', value: 'Compensatory Off', label: 'Compensatory Off' }
];

export const LeaveManagement: React.FC<LeaveManagementProps> = ({ openApplyModal, openWfhModal, onCloseQuickAdd }) => {
  const { 
    leaveRequests, 
    applyLeave, 
    approveLeave, 
    rejectLeave, 
    currentUser, 
    employees, 
    hasPermission,
    leavePolicies,
    holidayPolicies,
    masterLeavePolicies,
    sandwichPolicies,
    computeSandwichCalculation,
    overrideSandwichCalculation
  } = useHRMS();

  const isEmployeeRole = currentUser.role === 'Employee';
  const isManagerRole = currentUser.role === 'Department Manager';
  const isPrivileged = currentUser.role === 'Super Admin' || currentUser.role === 'HR Admin' || currentUser.role === 'HR Manager' || currentUser.role === 'CEO' || currentUser.role === 'Management';
  const isCEO = currentUser.role === 'CEO' || currentUser.role === 'Super Admin' || (currentUser as any).designation?.toLowerCase().includes('ceo') || currentUser.employeeId === 'EMP-000';
  const isHRApprover = currentUser.role === 'HR Admin' || currentUser.role === 'HR Manager' || currentUser.role === 'HR' || (currentUser as any).department?.toLowerCase().includes('hr');
  const canApprove = isCEO || isHRApprover;
  const currentEmployee = employees.find(emp => {
    const fullName = `${emp.firstName} ${emp.lastName}`.trim().toLowerCase();
    return (
      Boolean(currentUser.employeeId && emp.employeeId === currentUser.employeeId) ||
      Boolean(currentUser.id && (emp.id === currentUser.id || emp.employeeId === currentUser.id || (emp as any).authUserId === currentUser.id)) ||
      Boolean(currentUser.email && emp.email?.toLowerCase() === currentUser.email.toLowerCase()) ||
      Boolean(currentUser.name && fullName === currentUser.name.trim().toLowerCase())
    );
  });
  const currentEmployeeId = currentEmployee?.employeeId || currentUser.employeeId || currentUser.id || 'EMP-001';
  const currentEmployeeName = currentEmployee
    ? `${currentEmployee.firstName} ${currentEmployee.lastName}`.trim()
    : (currentUser.name || 'Staff Member');
  const reviewerName = `${currentUser.name || 'Authorized User'} (${currentUser.role || 'Reviewer'})`;
  const getLocalDateString = (offsetDays: number = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const formatReviewDateTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };
  const minRequestDate = getLocalDateString(1);

  // Multi-row selection state
  const [selectedLeaveIds, setSelectedLeaveIds] = useState<string[]>([]);

  const handleToggleLeave = (id: string) => {
    setSelectedLeaveIds(prev => 
      prev.includes(id) ? prev.filter(lId => lId !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (roleScopedLeaves.length > 0 && roleScopedLeaves.every(l => selectedLeaveIds.includes(l.id))) {
      setSelectedLeaveIds(prev => prev.filter(id => !roleScopedLeaves.some(l => l.id === id)));
    } else {
      const pageIds = roleScopedLeaves.map(l => l.id);
      setSelectedLeaveIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const [showModal, setShowModal] = useState<boolean>(openApplyModal || false);
  const [inspectLeave, setInspectLeave] = useState<LeaveRequest | null>(null);
  const [overrideLeave, setOverrideLeave] = useState<LeaveRequest | null>(null);
  const [rejectModalTarget, setRejectModalTarget] = useState<LeaveRequest | null>(null);
  const [rejectComment, setRejectComment] = useState<string>('');

  // Role-based data scoping for leave applications
  const roleScopedLeaves = isEmployeeRole
    ? leaveRequests.filter(l => (
        l.employeeId === currentEmployeeId ||
        l.employeeId === currentEmployee?.id ||
        l.employeeName?.trim().toLowerCase() === currentEmployeeName.trim().toLowerCase()
      ))
    : isManagerRole
    ? leaveRequests.filter(l => l.department === currentUser.department)
    : leaveRequests;

  const [showWfhModal, setShowWfhModal] = useState<boolean>(false);
  const [wfhForm, setWfhForm] = useState({
    employeeId: currentEmployeeId,
    startDate: minRequestDate,
    endDate: minRequestDate,
    reason: ''
  });

  const wfhDaysCount = useMemo(() => {
    if (!wfhForm.startDate || !wfhForm.endDate) return 1;
    try {
      const start = new Date(wfhForm.startDate);
      const end = new Date(wfhForm.endDate);
      if (end < start) return 0;
      const diffTime = Math.abs(end.getTime() - start.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    } catch {
      return 1;
    }
  }, [wfhForm.startDate, wfhForm.endDate]);

  const handleWfhSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentMin = getLocalDateString(1);
    if (!wfhForm.startDate || wfhForm.startDate < currentMin) {
      alert(`Work From Home start date must be a future date (${formatDateDDMMYYYY(currentMin)} onwards). Past dates (yesterday, previous months) cannot be requested.`);
      return;
    }
    if (!wfhForm.endDate || wfhForm.endDate < wfhForm.startDate) {
      alert('Work From Home end date cannot be before start date.');
      return;
    }
    const targetEmpId = isEmployeeRole ? currentEmployeeId : wfhForm.employeeId;
    const emp = employees.find(e => e.employeeId === targetEmpId || e.id === targetEmpId) || currentEmployee || employees[0];

    applyLeave({
      employeeId: targetEmpId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : currentEmployeeName,
      department: emp?.department || currentUser.department || 'General',
      leaveType: 'Work From Home',
      startDate: wfhForm.startDate,
      endDate: wfhForm.endDate,
      daysCount: wfhDaysCount,
      reason: wfhForm.reason || 'Work From Home request'
    });

    setShowWfhModal(false);
    if (onCloseQuickAdd) onCloseQuickAdd();
    setWfhForm(prev => ({
      ...prev,
      startDate: minRequestDate,
      endDate: minRequestDate,
      reason: ''
    }));
  };

  const wfhTotalCount = useMemo(() => {
    return roleScopedLeaves.filter(l => {
      return l.leaveType === 'Work From Home' || 
        (l.leaveType && l.leaveType.toLowerCase().includes('work from home')) ||
        (l.leaveType && l.leaveType.toLowerCase() === 'wfh');
    }).length;
  }, [roleScopedLeaves]);

  const displayedLeaves = roleScopedLeaves;

  // Standard Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const paginatedLeaves = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return displayedLeaves.slice(startIndex, startIndex + pageSize);
  }, [displayedLeaves, currentPage, pageSize]);

  const [form, setForm] = useState({
    employeeId: currentEmployeeId,
    leaveType: leavePolicies[0]?.name || 'Casual Leave (CL)',
    startDate: minRequestDate,
    endDate: minRequestDate,
    reason: '',
    attachmentUrl: ''
  });

  // HR Override Form State
  const [overrideForm, setOverrideForm] = useState<{
    excludedDates: string[];
    includedDates: string[];
    adjustedPayType: SandwichPayType;
    adjustedDaysCount: number;
    internalReason: string;
  }>({
    excludedDates: [],
    includedDates: [],
    adjustedPayType: 'SAME_AS_APPLIED_LEAVE',
    adjustedDaysCount: 1,
    internalReason: ''
  });

  const openLeaveModal = () => {
    const nextMin = getLocalDateString(1);
    setForm(prev => ({
      ...prev,
      employeeId: isEmployeeRole ? currentEmployeeId : (prev.employeeId || currentEmployeeId),
      startDate: nextMin,
      endDate: nextMin,
      reason: ''
    }));
    setShowModal(true);
  };

  const openWfhRequestModal = () => {
    const nextMin = getLocalDateString(1);
    setWfhForm(prev => ({
      ...prev,
      employeeId: isEmployeeRole ? currentEmployeeId : (prev.employeeId || currentEmployeeId),
      startDate: nextMin,
      endDate: nextMin,
      reason: ''
    }));
    setShowWfhModal(true);
  };

  React.useEffect(() => {
    if (openApplyModal) openLeaveModal();
  }, [openApplyModal]);

  React.useEffect(() => {
    if (openWfhModal) openWfhRequestModal();
  }, [openWfhModal]);

  React.useEffect(() => {
    if (currentEmployeeId) {
      setForm(prev => ({ ...prev, employeeId: currentEmployeeId }));
      setWfhForm(prev => ({ ...prev, employeeId: currentEmployeeId }));
    }
  }, [currentEmployeeId]);

  // Live Dynamic Sandwich Calculation for the active application modal
  const liveCalculation: SandwichCalculationResult | null = useMemo(() => {
    const targetEmpId = isEmployeeRole ? currentEmployeeId : form.employeeId;
    if (!targetEmpId || !form.startDate || !form.endDate) return null;

    try {
      return computeSandwichCalculation({
        employeeId: targetEmpId,
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate
      });
    } catch (e) {
      console.error('Error calculating sandwich preview', e);
      return null;
    }
  }, [computeSandwichCalculation, isEmployeeRole, currentUser.employeeId, form.employeeId, form.leaveType, form.startDate, form.endDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentMin = getLocalDateString(1);
    if (!form.startDate || form.startDate < currentMin) {
      alert(`Leave start date must be a future date (${formatDateDDMMYYYY(currentMin)} onwards). Past dates (yesterday, previous months) cannot be requested.`);
      return;
    }
    if (!form.endDate || form.endDate < form.startDate) {
      alert('Leave end date cannot be before start date.');
      return;
    }
    const targetEmpId = isEmployeeRole ? currentEmployeeId : form.employeeId;
    const emp = employees.find(e => e.employeeId === targetEmpId || e.id === targetEmpId) || currentEmployee || employees[0];
    
    applyLeave({
      employeeId: targetEmpId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : currentEmployeeName,
      department: emp?.department || currentUser.department || 'General',
      leaveType: form.leaveType,
      startDate: form.startDate,
      endDate: form.endDate,
      daysCount: liveCalculation?.totalDays || 1,
      reason: form.reason || 'Personal leave request',
      sandwichDetails: liveCalculation || undefined
    });

    setShowModal(false);
    if (onCloseQuickAdd) onCloseQuickAdd();
  };

  const openOverrideModal = (leave: LeaveRequest) => {
    setOverrideLeave(leave);
    setOverrideForm({
      excludedDates: leave.hrOverride?.excludedDates || [],
      includedDates: leave.hrOverride?.includedDates || [],
      adjustedPayType: leave.hrOverride?.adjustedPayType || leave.sandwichDetails?.payTypeApplied || 'SAME_AS_APPLIED_LEAVE',
      adjustedDaysCount: leave.daysCount,
      internalReason: leave.hrOverride?.internalReason || ''
    });
  };

  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideLeave || !overrideForm.internalReason.trim()) return;

    overrideSandwichCalculation(overrideLeave.id, {
      excludedDates: overrideForm.excludedDates,
      includedDates: overrideForm.includedDates,
      adjustedPayType: overrideForm.adjustedPayType,
      adjustedDaysCount: Number(overrideForm.adjustedDaysCount),
      internalReason: overrideForm.internalReason.trim()
    });

    setOverrideLeave(null);
  };

  const toggleOverrideExcludeDate = (dateStr: string) => {
    setOverrideForm(prev => {
      const isExcluded = prev.excludedDates.includes(dateStr);
      return {
        ...prev,
        excludedDates: isExcluded ? prev.excludedDates.filter(d => d !== dateStr) : [...prev.excludedDates, dateStr],
        includedDates: prev.includedDates.filter(d => d !== dateStr)
      };
    });
  };

  const pendingCount = roleScopedLeaves.filter(l => l.status === 'Pending').length;
  const approvedCount = roleScopedLeaves.filter(l => l.status === 'Approved').length;
  const rejectedCount = roleScopedLeaves.filter(l => l.status === 'Rejected').length;

  // Leave Export Handlers
  const getLeaveExportData = () => {
    const columns = [
      { key: 'id', label: 'Leave ID' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'employeeName', label: 'Employee Name' },
      { key: 'department', label: 'Department' },
      { key: 'leaveType', label: 'Leave Type' },
      { key: 'startDate', label: 'Start Date' },
      { key: 'endDate', label: 'End Date' },
      { key: 'daysCount', label: 'Requested Days' },
      { key: 'paidDaysCount', label: 'Paid Days' },
      { key: 'unpaidDaysCount', label: 'Unpaid Days' },
      { key: 'sandwichDays', label: 'Sandwich Days' },
      { key: 'status', label: 'Status' },
      { key: 'appliedDate', label: 'Applied Date' },
      { key: 'approvedBy', label: 'Approved/Reviewed By' },
      { key: 'approvedAt', label: 'Reviewed Date & Time' },
      { key: 'reason', label: 'Reason' }
    ];

    const data = roleScopedLeaves.map(l => ({
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employeeName,
      department: l.department,
      leaveType: l.leaveType,
      startDate: formatDateDDMMYYYY(l.startDate),
      endDate: formatDateDDMMYYYY(l.endDate),
      daysCount: l.daysCount,
      paidDaysCount: l.paidDaysCount ?? l.daysCount,
      unpaidDaysCount: l.unpaidDaysCount ?? 0,
      sandwichDays: l.sandwichDays ?? 0,
      status: l.status,
      appliedDate: formatDateDDMMYYYY(l.appliedDate) || '-',
      approvedBy: l.status === 'Pending'
        ? 'Pending Review'
        : `${l.status === 'Approved' ? 'Approved by' : 'Rejected by'} ${l.approvedBy || (l.status === 'Approved' ? 'Velmurugan R (CEO)' : 'Pavithra R (HR Manager)')}`,
      approvedAt: formatReviewDateTime(l.approvedAt) || (l.appliedDate ? formatDateDDMMYYYY(l.appliedDate) : '-'),
      reason: l.comment ? `${l.reason || ''} [Rejection Note: ${l.comment}]` : (l.reason || '-')
    }));

    return { columns, data };
  };

  const handleExportCSV = () => {
    const { columns, data } = getLeaveExportData();
    downloadCSV(data, `Leave_Applications_${new Date().toISOString().split('T')[0]}`, columns);
  };

  const handleExportExcel = () => {
    const { columns, data } = getLeaveExportData();
    downloadExcel(data, `Leave_Applications_${new Date().toISOString().split('T')[0]}`, columns);
  };

  const handleExportPDF = () => {
    const { columns, data } = getLeaveExportData();
    downloadPDF(data, 'Leave Applications Register', `Leave_Applications_${new Date().toISOString().split('T')[0]}`, columns);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <h1>{isEmployeeRole ? 'Leave Request' : 'Leave Management System'}</h1>
          <p className="page-subtitle">
            {isEmployeeRole
              ? 'Apply for leave, track approval status, and view your personal leave balance'
              : 'Policy-driven leave engine, automated sandwich calculations, attendance sync, and payroll integration'}
          </p>
        </div>
        {isEmployeeRole && (
          <div className="header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              type="button"
              className="btn btn-outline-primary btn-sm" 
              onClick={openWfhRequestModal}
              style={{ 
                borderColor: '#0E7490', 
                color: '#0E7490', 
                backgroundColor: '#ECFEFF',
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px', 
                fontWeight: 700,
                padding: '8px 16px',
                borderRadius: '10px'
              }}
            >
              <Home size={16} /> Request Work From Home
            </button>
            <button 
              type="button"
              className="btn btn-primary btn-sm" 
              onClick={openLeaveModal}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '10px', padding: '8px 16px' }}
            >
              <Plus size={16} /> Apply Leave Request
            </button>
          </div>
        )}
      </div>

      {/* KPI Overview Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>Pending Approvals</span>
            <div className="kpi-icon-wrapper amber"><Clock size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{pendingCount}</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>Approved Leaves</span>
            <div className="kpi-icon-wrapper emerald"><CheckCircle2 size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{approvedCount}</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>Rejected Requests</span>
            <div className="kpi-icon-wrapper rose"><XCircle size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{rejectedCount}</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>Work From Home (WFH)</span>
            <div className="kpi-icon-wrapper" style={{ backgroundColor: '#CFFAFE', color: '#0E7490' }}><Home size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value" style={{ color: '#0E7490' }}>{wfhTotalCount}</div>
          </div>
        </div>
      </div>

      {/* Table of Requests */}
      <div className="card" style={{ borderRadius: '16px', overflow: 'hidden' }}>
        <h3 className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span>
              {isEmployeeRole ? 'My Applications' : isManagerRole ? `${currentUser.department} Applications` : 'All Leave & WFH Applications'} ({roleScopedLeaves.length})
            </span>
            <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
              Includes Work From Home, Sandwich Days & Pay Breakdown
            </div>
          </div>
          <ExportDropdown
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            onExportCSV={handleExportCSV}
          />
        </h3>
        
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table className="hrms-table" style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: '40px', minWidth: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={paginatedLeaves.length > 0 && paginatedLeaves.every(l => selectedLeaveIds.includes(l.id))}
                    onChange={handleToggleSelectAll}
                    style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                    aria-label="Select all applications"
                  />
                </th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '150px' }}>Applicant</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '140px' }}>Department & Type</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '180px' }}>Duration</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '200px' }}>Pay & Attendance Breakdown</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '100px' }}>Status</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '180px' }}>Reviewed By</th>
                {!isEmployeeRole && (
                  <th style={{ 
                    textAlign: 'right', 
                    whiteSpace: 'nowrap', 
                    minWidth: '180px',
                    paddingRight: '20px'
                  }}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedLeaves.length === 0 ? (
                <tr>
                  <td colSpan={isEmployeeRole ? 7 : 8} style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                    No applications found matching the selected filter.
                  </td>
                </tr>
              ) : (
                paginatedLeaves.map(l => {
                  const isWfh = l.leaveType === 'Work From Home' || 
                    (l.leaveType && l.leaveType.toLowerCase().includes('work from home')) ||
                    (l.leaveType && l.leaveType.toLowerCase() === 'wfh');
                  const hasSandwich = (l.sandwichDays && l.sandwichDays > 0) || l.isSandwichApplied;
                  const isOverridden = l.hrOverride?.isOverridden;
                  const isSelected = selectedLeaveIds.includes(l.id);

                  return (
                    <tr 
                      key={l.id}
                      onClick={() => isEmployeeRole && setInspectLeave(l)}
                      title={isEmployeeRole ? "Click to view application breakdown" : undefined}
                      style={{
                        backgroundColor: isSelected ? '#ECFEFF' : undefined,
                        borderLeft: isSelected ? '4px solid #0E7490' : undefined,
                        transition: 'background-color 0.15s ease',
                        cursor: isEmployeeRole ? 'pointer' : undefined
                      }}
                    >
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', width: '40px' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleLeave(l.id)}
                          style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                          aria-label={`Select application for ${l.employeeName}`}
                        />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>{l.employeeName}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>{l.employeeId}</div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.84rem', marginBottom: '3px' }}>
                          {l.department}
                        </div>
                        {isWfh ? (
                          <span style={{ 
                            fontWeight: 700, 
                            color: '#0E7490', 
                            backgroundColor: '#ECFEFF', 
                            border: '1px solid #A5F3FC',
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            fontSize: '0.74rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Home size={12} /> Work From Home [WFH]
                          </span>
                        ) : (
                          <span style={{ 
                            fontWeight: 700, 
                            color: '#0E7490', 
                            backgroundColor: '#ECFEFF', 
                            border: '1px solid #CFFAFE',
                            padding: '2px 7px', 
                            borderRadius: '6px', 
                            fontSize: '0.74rem' 
                          }}>
                            {l.leaveType}
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                          {formatDateDDMMYYYY(l.startDate)} <span style={{ color: '#94A3B8', fontWeight: 500 }}>to</span> {formatDateDDMMYYYY(l.endDate)}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#0E7490', fontWeight: 700, marginTop: '2px' }}>
                          {l.daysCount} {toNum(l.daysCount) === 1 ? 'day' : 'days'} total
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {isWfh ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                              <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                backgroundColor: '#DCFCE7',
                                color: '#166534',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                ✓ 100% Working Day (Full Pay)
                              </span>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#0E7490', fontWeight: 600 }}>
                              Recorded as [WFH] • Not Absent / Not Leave
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                              {l.unpaidSandwichDays && l.unpaidSandwichDays > 0 ? (
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  backgroundColor: '#FEE2E2',
                                  color: '#DC2626',
                                  padding: '2px 8px',
                                  borderRadius: '6px'
                                }}>
                                  {l.unpaidSandwichDays}d Unpaid LOP
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  backgroundColor: '#DCFCE7',
                                  color: '#166534',
                                  padding: '2px 8px',
                                  borderRadius: '6px'
                                }}>
                                  Paid Leave
                                </span>
                              )}
                              {isOverridden && (
                                <span style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  backgroundColor: '#FEF3C7',
                                  color: '#D97706',
                                  padding: '1px 6px',
                                  borderRadius: '4px'
                                }}>
                                  Overridden
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                              {toNum(l.daysCount) - (l.sandwichDays || 0)}d Applied
                              {hasSandwich && (
                                <span style={{ color: '#0E7490', fontWeight: 700, marginLeft: '4px' }}>
                                  (+{l.sandwichDays}d Sandwich)
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className={`status-pill ${l.status.toLowerCase()}`}>
                          {l.status}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {l.status === 'Pending' ? (
                          <span style={{ 
                            color: '#D97706', 
                            backgroundColor: '#FEF3C7', 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            fontSize: '0.74rem', 
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            ⏳ Awaiting review
                          </span>
                        ) : (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                backgroundColor: l.status === 'Approved' ? '#DCFCE7' : '#FEE2E2',
                                color: l.status === 'Approved' ? '#166534' : '#DC2626',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}>
                                {l.status === 'Approved' ? '✓ Approved by' : '✕ Rejected by'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.84rem', color: '#0F172A', fontWeight: 800 }}>
                              {l.approvedBy || (l.status === 'Approved' ? 'Velmurugan R (CEO)' : 'Pavithra R (HR Manager)')}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                              {formatReviewDateTime(l.approvedAt) || (l.appliedDate ? formatDateDDMMYYYY(l.appliedDate) : '-')}
                            </div>
                            {l.comment && (
                              <div style={{ 
                                fontSize: '0.72rem', 
                                color: '#DC2626', 
                                backgroundColor: '#FFF5F5',
                                border: '1px solid #FED7D7',
                                borderRadius: '4px',
                                padding: '3px 7px',
                                marginTop: '4px', 
                                maxWidth: '240px', 
                                whiteSpace: 'normal',
                                lineHeight: '1.25'
                              }}>
                                <strong>Reason:</strong> {l.comment}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      {!isEmployeeRole && (
                        <td style={{ 
                          textAlign: 'right', 
                          whiteSpace: 'nowrap', 
                          minWidth: '180px',
                          paddingRight: '20px'
                        }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            {/* 1. Pending Approval Actions */}
                            {l.status === 'Pending' && canApprove && (
                              <>
                                <button 
                                  type="button"
                                  className="btn btn-success btn-sm"
                                  onClick={() => approveLeave(l.id, reviewerName)}
                                  style={{ padding: '5px 12px', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(34,197,94,0.2)' }}
                                  title={isWfh ? "Approve Work From Home" : "Approve Leave Request"}
                                >
                                  Approve
                                </button>
                                <button 
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => {
                                    setRejectModalTarget(l);
                                    setRejectComment('');
                                  }}
                                  style={{ padding: '5px 12px', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(239,68,68,0.2)' }}
                                  title="Reject Leave Request"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {/* 2. Re-Approve if Rejected (for HR/CEO) */}
                            {l.status === 'Rejected' && canApprove && (
                              <button
                                type="button"
                                onClick={() => approveLeave(l.id, reviewerName)}
                                className="btn btn-sm"
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '8px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  backgroundColor: '#ECFDF5',
                                  color: '#059669',
                                  border: '1px solid #A7F3D0',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                                title="Re-approve this application"
                              >
                                ✓ Re-Approve
                              </button>
                            )}

                            {/* 3. Revoke if Approved (for HR/CEO) */}
                            {l.status === 'Approved' && canApprove && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectModalTarget(l);
                                  setRejectComment('Decision revoked by HR/CEO');
                                }}
                                className="btn btn-sm"
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '8px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  backgroundColor: '#FEF2F2',
                                  color: '#DC2626',
                                  border: '1px solid #FECACA',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                                title="Revoke / Cancel approval"
                              >
                                ✕ Revoke
                              </button>
                            )}

                            {/* 4. View Details button - icon only */}
                            <button
                              type="button"
                              onClick={() => setInspectLeave(l)}
                              title="View Details"
                              aria-label="View Details"
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#F8FAFC',
                                color: '#0E7490',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                padding: 0,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#ECFEFF';
                                e.currentTarget.style.borderColor = '#0E7490';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#F8FAFC';
                                e.currentTarget.style.borderColor = '#CBD5E1';
                              }}
                            >
                              <Eye size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Standard Pagination Footer strictly [5, 10] */}
        <StandardTablePagination
          currentPage={currentPage}
          totalEntries={displayedLeaves.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={size => {
            setPageSize(size);
            setCurrentPage(1);
          }}
          pageSizeOptions={[5, 10]}
        />
      </div>

      {/* Floating Action Bar per AGENTS.md */}
      <StandardFloatingActionBar
        selectedCount={selectedLeaveIds.length}
        onClearSelection={() => setSelectedLeaveIds([])}
        customActions={
          canApprove ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="action-bar-btn"
                onClick={() => {
                  selectedLeaveIds.forEach(id => approveLeave(id, reviewerName));
                  setSelectedLeaveIds([]);
                }}
                style={{ color: '#86EFAC' }}
              >
                ✓ Approve ({selectedLeaveIds.length})
              </button>
              <button
                type="button"
                className="action-bar-btn danger"
                onClick={() => {
                  selectedLeaveIds.forEach(id => rejectLeave(id, reviewerName));
                  setSelectedLeaveIds([]);
                }}
              >
                ✕ Reject ({selectedLeaveIds.length})
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Rejection Reason Modal */}
      {rejectModalTarget && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '92%', borderRadius: '18px', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '10px', marginBottom: '8px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#DC2626', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✕</span> Reject Leave Request
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                  Please confirm rejection for <strong>{rejectModalTarget.employeeName}</strong> ({rejectModalTarget.employeeId})
                </p>
              </div>
              <button 
                onClick={() => setRejectModalTarget(null)}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #E2E8F0',
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>
            
            <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.82rem' }}>
                <div><strong>Leave Type:</strong> {rejectModalTarget.leaveType} ({rejectModalTarget.daysCount} days)</div>
                <div style={{ marginTop: '3px' }}><strong>Duration:</strong> {formatDateDDMMYYYY(rejectModalTarget.startDate)} to {formatDateDDMMYYYY(rejectModalTarget.endDate)}</div>
                {rejectModalTarget.reason && <div style={{ marginTop: '3px' }}><strong>Applicant Reason:</strong> {rejectModalTarget.reason}</div>}
                <div style={{ marginTop: '6px', color: '#0E7490', fontWeight: 700 }}>
                  <strong>Reviewer:</strong> {reviewerName}
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Rejection Reason / Remarks (Optional)
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={rejectComment}
                  onChange={e => setRejectComment(e.target.value)}
                  placeholder="e.g. Critical project deadline / Insufficient leave balance / Reschedule required"
                  style={{ borderRadius: '10px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRejectModalTarget(null)}
                  style={{ borderRadius: '10px', padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    rejectLeave(rejectModalTarget.id, reviewerName, rejectComment.trim() || undefined);
                    setRejectModalTarget(null);
                  }}
                  style={{ borderRadius: '10px', padding: '8px 20px', fontWeight: 700 }}
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. APPLY LEAVE MODAL WITH REAL-TIME SANDWICH PREVIEW */}
      {/* ======================================================== */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px', width: '92%', maxHeight: '92vh', overflowY: 'auto', borderRadius: '18px', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '10px', marginBottom: '8px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Request Leave</h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                  Select dates to preview real-time sandwich calculations and working days
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowModal(false);
                  if (onCloseQuickAdd) onCloseQuickAdd();
                }}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                {/* Employee selection if Admin/Manager */}
                {!isEmployeeRole && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      APPLICANT EMPLOYEE
                    </label>
                    <select 
                      className="form-control" 
                      value={form.employeeId} 
                      onChange={e => setForm({ ...form, employeeId: e.target.value })}
                      style={{ borderRadius: '10px', backgroundColor: '#f8fafc', fontSize: '0.85rem' }}
                    >
                      {employees.map(e => (
                        <option key={e.id} value={e.employeeId}>{e.firstName} {e.lastName} ({e.employeeId}) - {e.department}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Leave Type Category Selection */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    LEAVE CATEGORY
                  </label>
                  <select 
                    className="form-control" 
                    value={form.leaveType} 
                    onChange={e => setForm({ ...form, leaveType: e.target.value })}
                    style={{ borderRadius: '10px', backgroundColor: '#f8fafc', fontSize: '0.85rem' }}
                    required
                  >
                    {(() => {
                      const options = (masterLeavePolicies && masterLeavePolicies.length > 0)
                        ? masterLeavePolicies.filter(p => p.status === 'Active').flatMap(p => {
                            const isProv = p.applicableEmploymentType === 'Provisional' || p.policyName.toLowerCase().includes('provisional');
                            const policyTag = isProv ? 'Provisional (First 3 Mos)' : 'Confirmed';
                            return (p.leaveTypes || []).map(t => ({
                              id: `${p.id}-${t.id}`,
                              value: t.name,
                              label: `${t.name} (${t.quotaPerYear}d • ${t.isPaid ? 'Paid' : 'Unpaid'}) — [${policyTag}]`
                            }));
                          })
                        : leavePolicies.filter(p => p.status === 'Active').map(p => ({
                            id: p.id,
                            value: p.name,
                            label: `${p.name} (${p.quotaDays} Days/Year • ${p.monthlyAccrual})`
                          }));

                      const finalOptions = options.length > 0 ? options : DEFAULT_LEAVE_CATEGORY_OPTIONS;

                      return finalOptions.map(item => (
                        <option key={item.id} value={item.value}>
                          {item.label}
                        </option>
                      ));
                    })()}
                  </select>
                </div>

                {/* Date Selection */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      FROM DATE (FUTURE DATES ONLY) <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input 
                      className="form-control" 
                      type="date" 
                      value={form.startDate} 
                      min={minRequestDate}
                      onChange={e => {
                        const val = e.target.value;
                        const nextStart = !val || val < minRequestDate ? minRequestDate : val;
                        setForm(prev => ({
                          ...prev,
                          startDate: nextStart,
                          endDate: prev.endDate < nextStart ? nextStart : prev.endDate
                        }));
                      }} 
                      onBlur={() => {
                        if (!form.startDate || form.startDate < minRequestDate) {
                          setForm(prev => ({
                            ...prev,
                            startDate: minRequestDate,
                            endDate: prev.endDate < minRequestDate ? minRequestDate : prev.endDate
                          }));
                        }
                      }}
                      style={{ borderRadius: '10px', backgroundColor: '#f8fafc', fontSize: '0.85rem' }}
                      required 
                    />
                    <span style={{ fontSize: '0.69rem', color: '#64748B', display: 'block', marginTop: '3px' }}>
                      Allowed: {formatDateDDMMYYYY(minRequestDate)} onwards. Past dates blocked.
                    </span>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      TO DATE <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input 
                      className="form-control" 
                      type="date" 
                      value={form.endDate} 
                      min={form.startDate || minRequestDate}
                      onChange={e => {
                        const minEnd = form.startDate || minRequestDate;
                        const val = e.target.value;
                        setForm(prev => ({
                          ...prev,
                          endDate: !val || val < minEnd ? minEnd : val
                        }));
                      }} 
                      onBlur={() => {
                        const minEnd = form.startDate || minRequestDate;
                        if (!form.endDate || form.endDate < minEnd) {
                          setForm(prev => ({ ...prev, endDate: minEnd }));
                        }
                      }}
                      style={{ borderRadius: '10px', backgroundColor: '#f8fafc', fontSize: '0.85rem' }}
                      required 
                    />
                  </div>
                </div>

                {/* Reason Textarea */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    REASON
                  </label>
                  <textarea 
                    className="form-control" 
                    rows={2} 
                    value={form.reason} 
                    onChange={e => setForm({ ...form, reason: e.target.value })} 
                    placeholder="Personal leave, medical reason, etc."
                    style={{ borderRadius: '10px', backgroundColor: '#f8fafc', fontSize: '0.85rem' }}
                  />
                </div>

              </div>

              {/* Modal Footer */}
              <div className="modal-footer" style={{ borderTop: 'none', padding: 0, marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => {
                    setShowModal(false);
                    if (onCloseQuickAdd) onCloseQuickAdd();
                  }}
                  style={{ borderRadius: '10px', padding: '10px 20px' }}
                >
                  Cancel
                </button>

                <button 
                  type="submit" 
                  className="btn btn-primary btn-sm"
                  style={{
                    borderRadius: '10px',
                    padding: '10px 24px',
                    backgroundColor: '#0E7490',
                    borderColor: '#0E7490',
                    fontWeight: 700
                  }}
                >
                  Submit Leave Request ({liveCalculation?.totalDays || 1} Days)
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. DETAIL INSPECTION MODAL (CALCULATION BREAKDOWN) */}
      {/* ======================================================== */}
      {inspectLeave && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '620px', width: '92%', maxHeight: '88vh', overflowY: 'auto', borderRadius: '18px', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                  Leave & Sandwich Calculation Breakdown
                </h3>
                <div style={{ fontSize: '0.82rem', color: '#0E7490', fontWeight: 700, marginTop: '2px' }}>
                  {inspectLeave.employeeName} ({inspectLeave.employeeId}) • {inspectLeave.leaveType}
                </div>
              </div>
              <button 
                onClick={() => setInspectLeave(null)}
                style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Summary Badges */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                backgroundColor: '#F8FAFC',
                padding: '12px',
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Duration</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1E293B' }}>{formatDateDDMMYYYY(inspectLeave.startDate)} → {formatDateDDMMYYYY(inspectLeave.endDate)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Working Days</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1E293B' }}>
                    {inspectLeave.sandwichDetails?.appliedLeaveDays ?? inspectLeave.daysCount}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#0E7490' }}>Sandwich Days</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0E7490' }}>
                    {inspectLeave.sandwichDays || inspectLeave.sandwichDetails?.sandwichDays || 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Total Leave Days</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                    {inspectLeave.daysCount}
                  </div>
                </div>
              </div>

              {/* Policy Applied Info */}
              <div style={{ backgroundColor: '#ECFEFF', padding: '12px 16px', borderRadius: '10px', border: '1px solid #CFFAFE', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0E7490', fontWeight: 700, marginBottom: '4px' }}>
                  <Info size={16} />
                  <span>
                    Policy: {inspectLeave.sandwichDetails?.appliedPolicyName || 'Standard Policy'} (v{inspectLeave.sandwichDetails?.policyVersion || 1})
                  </span>
                </div>
                <div style={{ color: '#475569', fontSize: '0.78rem' }}>
                  Pay Treatment: <strong>{inspectLeave.sandwichDetails?.payTypeApplied?.replace(/_/g, ' ') || 'Same as Applied Leave'}</strong>
                </div>
              </div>

              {/* HR Override Info (Visible only if override applied, with confidential reason hidden for employee!) */}
              {inspectLeave.hrOverride?.isOverridden && (
                <div style={{ backgroundColor: '#FEF3C7', padding: '12px 16px', borderRadius: '10px', border: '1px solid #FDE68A', fontSize: '0.82rem' }}>
                  <div style={{ fontWeight: 800, color: '#D97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sliders size={15} />
                    <span>HR Override Applied by {inspectLeave.hrOverride.overriddenBy}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#78350F', marginTop: '4px' }}>
                    Original: {inspectLeave.hrOverride.originalTotalDays} days ({inspectLeave.hrOverride.originalSandwichDays} sandwich) → Adjusted: {inspectLeave.daysCount} days.
                  </div>
                  {isPrivileged && inspectLeave.hrOverride.internalReason && (
                    <div style={{ marginTop: '6px', padding: '6px 8px', backgroundColor: '#FFFFFF', borderRadius: '6px', fontSize: '0.75rem', color: '#451A03' }}>
                      <strong>Internal HR Reason:</strong> {inspectLeave.hrOverride.internalReason}
                    </div>
                  )}
                </div>
              )}

              {/* Full Day-by-Day Table */}
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 800, color: '#1E293B' }}>
                  Day-by-Day Breakdown
                </h4>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569' }}>Date</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569' }}>Day</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569' }}>Classification / Reason</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', color: '#475569' }}>Sandwich</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569' }}>Pay Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectLeave.sandwichDetails?.breakdown && inspectLeave.sandwichDetails.breakdown.length > 0 ? (
                        inspectLeave.sandwichDetails.breakdown.map((item: SandwichCalculationDayDetail) => (
                          <tr key={item.date} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: item.isSandwich ? '#ECFEFF' : '#FFFFFF' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1E293B' }}>{formatDateDDMMYYYY(item.date)}</td>
                            <td style={{ padding: '8px 12px', color: '#64748B' }}>{item.dayOfWeek}</td>
                            <td style={{ padding: '8px 12px', color: item.isSandwich ? '#0E7490' : '#334155' }}>{item.reason}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              {item.isSandwich ? (
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0E7490', backgroundColor: '#CFFAFE', padding: '2px 6px', borderRadius: '4px' }}>
                                  YES
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>NO</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: item.isPaid ? '#166534' : '#DC2626' }}>
                                {item.isPaid ? 'Paid' : 'Unpaid (LOP)'}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#64748B' }}>
                            {inspectLeave.daysCount} days applied ({inspectLeave.leaveType}).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* Review Audit Box inside Detail Inspection Modal */}
              <div style={{
                backgroundColor: inspectLeave.status === 'Approved' ? '#F0FDF4' : inspectLeave.status === 'Rejected' ? '#FEF2F2' : '#FFFBEB',
                border: `1px solid ${inspectLeave.status === 'Approved' ? '#BBF7D0' : inspectLeave.status === 'Rejected' ? '#FECACA' : '#FDE68A'}`,
                borderRadius: '10px',
                padding: '12px 16px',
                fontSize: '0.82rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ fontWeight: 800, color: inspectLeave.status === 'Approved' ? '#166534' : inspectLeave.status === 'Rejected' ? '#DC2626' : '#D97706' }}>
                    Status: {inspectLeave.status}
                  </div>
                  {inspectLeave.approvedAt && (
                    <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                      {formatReviewDateTime(inspectLeave.approvedAt)}
                    </div>
                  )}
                </div>
                {inspectLeave.status !== 'Pending' && (
                  <div style={{ color: '#1E293B', fontSize: '0.82rem' }}>
                    <strong>Reviewed By:</strong> {inspectLeave.approvedBy || (inspectLeave.status === 'Approved' ? 'Velmurugan R (CEO)' : 'Pavithra R (HR Manager)')}
                  </div>
                )}
                {inspectLeave.comment && (
                  <div style={{ color: '#DC2626', fontSize: '0.78rem', marginTop: '4px' }}>
                    <strong>Remarks:</strong> {inspectLeave.comment}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {inspectLeave.status === 'Rejected' && canApprove && (
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={() => {
                      approveLeave(inspectLeave.id, reviewerName);
                      setInspectLeave(null);
                    }}
                    style={{ borderRadius: '8px', padding: '6px 14px', fontWeight: 700 }}
                  >
                    ✓ Re-Approve Request
                  </button>
                )}
                {inspectLeave.status === 'Approved' && canApprove && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      setRejectModalTarget(inspectLeave);
                      setRejectComment('Decision revoked by HR/CEO');
                      setInspectLeave(null);
                    }}
                    style={{ borderRadius: '8px', padding: '6px 14px', fontWeight: 700 }}
                  >
                    ✕ Revoke Approval
                  </button>
                )}
              </div>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => setInspectLeave(null)}
                style={{ borderRadius: '10px', padding: '8px 18px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. HR OVERRIDE MODAL (AUTHORIZED HR / CEO ONLY) */}
      {/* ======================================================== */}
      {overrideLeave && isPrivileged && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px', width: '92%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '18px', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                  Override Sandwich Calculation
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                  For {overrideLeave.employeeName} ({overrideLeave.employeeId}) • Recorded in Audit Log
                </p>
              </div>
              <button 
                onClick={() => setOverrideLeave(null)}
                style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOverride}>
              <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                {/* Day Selection to Exclude/Include */}
                <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                    MANUALLY EXCLUDE / INCLUDE SPECIFIC DAYS
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {overrideLeave.sandwichDetails?.breakdown?.map((b: SandwichCalculationDayDetail) => {
                      const isExcluded = overrideForm.excludedDates.includes(b.date);
                      return (
                        <div 
                          key={b.date}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            backgroundColor: isExcluded ? '#FEE2E2' : '#FFFFFF',
                            border: isExcluded ? '1px solid #FCA5A5' : '1px solid #E2E8F0',
                            fontSize: '0.8rem'
                          }}
                        >
                          <div>
                            <strong>{formatDateDDMMYYYY(b.date)} ({b.dayOfWeek})</strong>
                            <span style={{ marginLeft: '8px', color: '#64748B' }}>{b.reason}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleOverrideExcludeDate(b.date)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: 'none',
                              backgroundColor: isExcluded ? '#DC2626' : '#0E7490',
                              color: '#FFFFFF'
                            }}
                          >
                            {isExcluded ? 'Excluded (Undo)' : 'Exclude from Leave'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Change Pay Treatment */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                    ADJUST PAY TREATMENT FOR SANDWICH DAYS
                  </label>
                  <select
                    className="form-control"
                    value={overrideForm.adjustedPayType}
                    onChange={e => setOverrideForm({ ...overrideForm, adjustedPayType: e.target.value as SandwichPayType })}
                    style={{ borderRadius: '10px' }}
                  >
                    <option value="SAME_AS_APPLIED_LEAVE">Same as Applied Leave Type</option>
                    <option value="PAID_LEAVE">Force Paid Leave (No Salary Deduction)</option>
                    <option value="UNPAID_LEAVE">Force Unpaid Leave (LOP Salary Deduction)</option>
                  </select>
                </div>

                {/* Adjusted Total Days Count */}
                <div>
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                    FINAL ADJUSTED LEAVE DAYS
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    className="form-control"
                    value={overrideForm.adjustedDaysCount}
                    onChange={e => setOverrideForm({ ...overrideForm, adjustedDaysCount: Number(e.target.value) })}
                    required
                    style={{ borderRadius: '10px' }}
                  />
                </div>

                {/* Mandatory HR Reason (Stored in Audit Log, Hidden from Employee) */}
                <div>
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                    MANDATORY INTERNAL HR OVERRIDE REASON <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea
                    rows={3}
                    className="form-control"
                    placeholder="Enter explicit reason for override (e.g. Executive approval for family emergency, weekend exempt from LOP). Kept private from employee."
                    value={overrideForm.internalReason}
                    onChange={e => setOverrideForm({ ...overrideForm, internalReason: e.target.value })}
                    required
                    style={{ borderRadius: '10px' }}
                  />
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                    This note is strictly confidential and will only appear in management audit trails.
                  </div>
                </div>

              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '16px 0 0', marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setOverrideLeave(null)}
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
                  Apply HR Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* WORK FROM HOME (WFH) REQUEST MODAL */}
      {/* ======================================================== */}
      {showWfhModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px', width: '92%', maxHeight: '92vh', overflowY: 'auto', borderRadius: '18px', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '10px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Home size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Request Work From Home (WFH)</h2>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowWfhModal(false);
                  if (onCloseQuickAdd) onCloseQuickAdd();
                }}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleWfhSubmit}>
              <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Employee selection if Admin/Manager */}
                {!isEmployeeRole && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                      SELECT EMPLOYEE
                    </label>
                    <select
                      className="form-control"
                      value={wfhForm.employeeId}
                      onChange={e => setWfhForm({ ...wfhForm, employeeId: e.target.value })}
                      required
                      style={{ borderRadius: '10px' }}
                    >
                      {employees.map(emp => (
                        <option key={emp.employeeId} value={emp.employeeId}>
                          {emp.firstName} {emp.lastName} ({emp.employeeId} - {emp.department})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Date Selection */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                      START DATE (FUTURE DATES ONLY) <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={wfhForm.startDate}
                      min={minRequestDate}
                      onChange={e => {
                        const val = e.target.value;
                        const s = !val || val < minRequestDate ? minRequestDate : val;
                        setWfhForm(prev => ({
                          ...prev,
                          startDate: s,
                          endDate: prev.endDate < s ? s : prev.endDate
                        }));
                      }}
                      onBlur={() => {
                        if (!wfhForm.startDate || wfhForm.startDate < minRequestDate) {
                          setWfhForm(prev => ({
                            ...prev,
                            startDate: minRequestDate,
                            endDate: prev.endDate < minRequestDate ? minRequestDate : prev.endDate
                          }));
                        }
                      }}
                      required
                      style={{ borderRadius: '10px' }}
                    />
                    <span style={{ fontSize: '0.69rem', color: '#64748B', display: 'block', marginTop: '3px' }}>
                      Allowed: {formatDateDDMMYYYY(minRequestDate)} onwards. Past dates blocked.
                    </span>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                      END DATE <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={wfhForm.endDate}
                      min={wfhForm.startDate || minRequestDate}
                      onChange={e => {
                        const minEnd = wfhForm.startDate || minRequestDate;
                        const val = e.target.value;
                        setWfhForm(prev => ({ ...prev, endDate: !val || val < minEnd ? minEnd : val }));
                      }}
                      onBlur={() => {
                        const minEnd = wfhForm.startDate || minRequestDate;
                        if (!wfhForm.endDate || wfhForm.endDate < minEnd) {
                          setWfhForm(prev => ({ ...prev, endDate: minEnd }));
                        }
                      }}
                      required
                      style={{ borderRadius: '10px' }}
                    />
                  </div>
                </div>

                {/* Total Days */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '10px 14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={16} style={{ color: '#0E7490' }} />
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E293B' }}>
                      Total Remote Days:
                    </span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0E7490' }}>
                      {wfhDaysCount} {wfhDaysCount === 1 ? 'Day' : 'Days'}
                    </span>
                  </div>
                </div>

                {/* Reason */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    REASON FOR WORK FROM HOME <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea
                    rows={3}
                    className="form-control"
                    value={wfhForm.reason}
                    onChange={e => setWfhForm({ ...wfhForm, reason: e.target.value })}
                    required
                    style={{ borderRadius: '10px' }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '16px 0 0', marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowWfhModal(false);
                    if (onCloseQuickAdd) onCloseQuickAdd();
                  }}
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
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Home size={16} /> Submit WFH Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
