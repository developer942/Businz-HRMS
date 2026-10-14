import React, { useState, useMemo, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { getEmployeeLeaveTypeBalances, getEmployeeTotalLeaveSummary } from '../../services/leaveQuotaService';
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
  Calendar,
  Layers,
  Check,
  DollarSign,
  Home,
  Bell,
  Search,
  X,
  User
} from 'lucide-react';
import { LeaveRequest, SandwichCalculationResult, SandwichPayType, SandwichCalculationDayDetail } from '../../types/hrms';
import { isLeaveTypePaid } from '../../services/sandwichLeaveEngine';
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
    weeklySchedules,
    computeSandwichCalculation,
    overrideSandwichCalculation,
    sendLeaveReminder
  } = useHRMS();

  const [reminderSentSet, setReminderSentSet] = useState<Set<string>>(new Set());

  const handleSendReminder = (l: LeaveRequest) => {
    sendLeaveReminder(l);
    setReminderSentSet(prev => new Set(prev).add(l.id));
  };

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
  const [inspectRemarks, setInspectRemarks] = useState<string>('');
  const [overrideLeave, setOverrideLeave] = useState<LeaveRequest | null>(null);
  const [rejectModalTarget, setRejectModalTarget] = useState<LeaveRequest | null>(null);
  const [rejectComment, setRejectComment] = useState<string>('');

  const openInspectLeaveModal = (l: LeaveRequest) => {
    setInspectLeave(l);
    setInspectRemarks(l.comment || '');
  };

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

  // Status Filter Tab & Search State
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Pending' | 'Approved' | 'Rejected' | 'WFH'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const getInitials = (name?: string) => {
    if (!name) return 'EM';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatDisplayDate = (d?: string) => {
    if (!d) return '-';
    try {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (d.includes('/')) {
        const parts = d.split('/');
        if (parts.length === 3) {
          const mIdx = parseInt(parts[1], 10) - 1;
          return `${parts[0]} ${monthNames[mIdx] || parts[1]} ${parts[2]}`;
        }
      } else if (d.includes('-')) {
        const parts = d.split('-');
        if (parts.length === 3) {
          const mIdx = parseInt(parts[1], 10) - 1;
          return `${parts[2]} ${monthNames[mIdx] || parts[1]} ${parts[0]}`;
        }
      }
      return formatDateDDMMYYYY(d);
    } catch {
      return formatDateDDMMYYYY(d);
    }
  };

  const formatDisplayDateRange = (start?: string, end?: string) => {
    if (!start && !end) return '-';
    if (!start) return formatDisplayDate(end);
    if (!end || start === end) return formatDisplayDate(start);
    const startFormatted = formatDisplayDate(start);
    const endFormatted = formatDisplayDate(end);
    const startParts = startFormatted.split(' ');
    const endParts = endFormatted.split(' ');
    if (startParts.length === 3 && endParts.length === 3 && startParts[1] === endParts[1] && startParts[2] === endParts[2]) {
      return `${startParts[0]} – ${endParts[0]} ${endParts[1]} ${endParts[2]}`;
    }
    return `${startFormatted} – ${endFormatted}`;
  };

  const tabCounts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let wfh = 0;
    roleScopedLeaves.forEach(l => {
      if (l.status === 'Pending') pending++;
      else if (l.status === 'Approved') approved++;
      else if (l.status === 'Rejected') rejected++;
      const isWfh = l.leaveType === 'Work From Home' || 
        (l.leaveType && l.leaveType.toLowerCase().includes('work from home')) ||
        (l.leaveType && l.leaveType.toLowerCase() === 'wfh');
      if (isWfh) wfh++;
    });
    return { all: roleScopedLeaves.length, pending, approved, rejected, wfh };
  }, [roleScopedLeaves]);

  const filteredLeaves = useMemo(() => {
    return roleScopedLeaves.filter(l => {
      if (statusFilter === 'Pending' && l.status !== 'Pending') return false;
      if (statusFilter === 'Approved' && l.status !== 'Approved') return false;
      if (statusFilter === 'Rejected' && l.status !== 'Rejected') return false;
      if (statusFilter === 'WFH') {
        const isWfh = l.leaveType === 'Work From Home' || 
          (l.leaveType && l.leaveType.toLowerCase().includes('work from home')) ||
          (l.leaveType && l.leaveType.toLowerCase() === 'wfh');
        if (!isWfh) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (l.employeeName || '').toLowerCase().includes(q);
        const matchId = (l.employeeId || '').toLowerCase().includes(q);
        const matchDept = (l.department || '').toLowerCase().includes(q);
        const matchType = (l.leaveType || '').toLowerCase().includes(q);
        const matchReason = (l.reason || '').toLowerCase().includes(q);
        if (!matchName && !matchId && !matchDept && !matchType && !matchReason) return false;
      }

      return true;
    });
  }, [roleScopedLeaves, statusFilter, searchQuery]);

  const displayedLeaves = filteredLeaves;

  // Standard Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  const paginatedLeaves = useMemo(() => {
    if (isEmployeeRole) return displayedLeaves;
    const startIndex = (currentPage - 1) * pageSize;
    return displayedLeaves.slice(startIndex, startIndex + pageSize);
  }, [displayedLeaves, currentPage, pageSize, isEmployeeRole]);

  const [form, setForm] = useState({
    employeeId: currentEmployeeId,
    leaveType: leavePolicies[0]?.name || 'Casual Leave (CL)',
    startDate: minRequestDate,
    endDate: minRequestDate,
    reason: '',
    attachmentUrl: ''
  });

  const targetEmpId = form.employeeId || currentEmployeeId;
  const selectedApplicant = employees.find(e => e.employeeId === targetEmpId || e.id === targetEmpId) || currentEmployee;
  const applicantName = selectedApplicant ? `${selectedApplicant.firstName} ${selectedApplicant.lastName}`.trim() : (isEmployeeRole ? currentUser.name : '');

  const applicantLeaveBalances = useMemo(() => {
    return getEmployeeLeaveTypeBalances(
      targetEmpId,
      applicantName,
      masterLeavePolicies,
      leavePolicies,
      leaveRequests,
      selectedApplicant
    );
  }, [targetEmpId, applicantName, masterLeavePolicies, leavePolicies, leaveRequests, selectedApplicant]);

  const myLeaveSummary = useMemo(() => {
    return getEmployeeTotalLeaveSummary(
      currentUser.employeeId,
      currentUser.name,
      masterLeavePolicies,
      leavePolicies,
      leaveRequests,
      currentEmployee
    );
  }, [currentUser.employeeId, currentUser.name, masterLeavePolicies, leavePolicies, leaveRequests, currentEmployee]);

  // Synchronize form.leaveType default to first available balance type
  useEffect(() => {
    if (applicantLeaveBalances.length > 0 && !applicantLeaveBalances.some(b => b.name === form.leaveType)) {
      setForm(prev => ({ ...prev, leaveType: applicantLeaveBalances[0].name }));
    }
  }, [applicantLeaveBalances, form.leaveType]);

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

  // Live Dynamic Sandwich Calculation for the active inspection modal
  const inspectCalculation: SandwichCalculationResult | null = useMemo(() => {
    if (!inspectLeave) return null;
    const isWfh = inspectLeave.leaveType === 'Work From Home' || 
      (inspectLeave.leaveType && inspectLeave.leaveType.toLowerCase().includes('work from home')) ||
      (inspectLeave.leaveType && inspectLeave.leaveType.toLowerCase() === 'wfh');
    if (isWfh) return null;

    try {
      return computeSandwichCalculation({
        employeeId: inspectLeave.employeeId,
        leaveType: inspectLeave.leaveType,
        startDate: inspectLeave.startDate,
        endDate: inspectLeave.endDate
      });
    } catch (e) {
      console.error('Error calculating inspection sandwich preview', e);
      return inspectLeave.sandwichDetails || null;
    }
  }, [inspectLeave, computeSandwichCalculation, sandwichPolicies, weeklySchedules]);

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

      {/* Employee Personal Leave Balance Overview Strip */}
      {isEmployeeRole && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CalendarDays size={18} color="#0E7490" />
              <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                My Leave Balance & Quotas ({new Date().getFullYear()})
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
              Total Available Paid Balance: <strong style={{ color: '#0E7490', fontSize: '0.95rem' }}>{myLeaveSummary.totalPaidRemaining} Days Left</strong> ({myLeaveSummary.totalPaidUsed} Taken of {myLeaveSummary.totalAnnualQuota}d Annual Quota)
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {myLeaveSummary.balances.filter(b => b.isPaid).map(b => (
              <div 
                key={b.id} 
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B' }}>{b.name}</div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                    Quota: {b.annualQuota}d • Taken: {b.usedDays}d
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: b.remainingDays > 0 ? '#0E7490' : '#DC2626' }}>
                    {b.remainingDays}
                  </div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B' }}>Days Left</div>
                </div>
              </div>
            ))}

            <div 
              style={{
                backgroundColor: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400E' }}>Loss of Pay (Unpaid)</div>
                <div style={{ fontSize: '0.74rem', color: '#B45309', marginTop: '2px' }}>
                  Deducted from salary like Absent
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: myLeaveSummary.totalUnpaidUsed > 0 ? '#DC2626' : '#92400E' }}>
                  {myLeaveSummary.totalUnpaidUsed}
                </div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400E' }}>Days Taken</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Overview Cards - Hidden for Employee role, visible for Admin/HR/Manager */}
      {/* KPI Overview Cards - Interactive Filter Cards for Admin/HR/Manager */}
      {!isEmployeeRole && (
        <div className="kpi-grid" style={{ marginBottom: '20px' }}>
          <div 
            className="kpi-card" 
            onClick={() => setStatusFilter(prev => prev === 'Pending' ? 'ALL' : 'Pending')}
            style={{ 
              cursor: 'pointer',
              border: statusFilter === 'Pending' ? '2px solid #F59E0B' : '1px solid #E7ECF3',
              boxShadow: statusFilter === 'Pending' ? '0 4px 14px rgba(245,158,11,0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease',
              backgroundColor: statusFilter === 'Pending' ? '#FFFBEB' : '#FFFFFF'
            }}
            title="Click to filter by Pending Approvals"
          >
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: statusFilter === 'Pending' ? '#B45309' : '#64748B' }}>Pending Approvals</span>
              <div className="kpi-icon-wrapper amber"><Clock size={16} /></div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#D97706' }}>{pendingCount}</div>
            </div>
          </div>

          <div 
            className="kpi-card"
            onClick={() => setStatusFilter(prev => prev === 'Approved' ? 'ALL' : 'Approved')}
            style={{ 
              cursor: 'pointer',
              border: statusFilter === 'Approved' ? '2px solid #10B981' : '1px solid #E7ECF3',
              boxShadow: statusFilter === 'Approved' ? '0 4px 14px rgba(16,185,129,0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease',
              backgroundColor: statusFilter === 'Approved' ? '#F0FDF4' : '#FFFFFF'
            }}
            title="Click to filter by Approved Leaves"
          >
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: statusFilter === 'Approved' ? '#047857' : '#64748B' }}>Approved Leaves</span>
              <div className="kpi-icon-wrapper emerald"><CheckCircle2 size={16} /></div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#059669' }}>{approvedCount}</div>
            </div>
          </div>

          <div 
            className="kpi-card"
            onClick={() => setStatusFilter(prev => prev === 'Rejected' ? 'ALL' : 'Rejected')}
            style={{ 
              cursor: 'pointer',
              border: statusFilter === 'Rejected' ? '2px solid #EF4444' : '1px solid #E7ECF3',
              boxShadow: statusFilter === 'Rejected' ? '0 4px 14px rgba(239,68,68,0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease',
              backgroundColor: statusFilter === 'Rejected' ? '#FEF2F2' : '#FFFFFF'
            }}
            title="Click to filter by Rejected Requests"
          >
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: statusFilter === 'Rejected' ? '#B91C1C' : '#64748B' }}>Rejected Requests</span>
              <div className="kpi-icon-wrapper rose"><XCircle size={16} /></div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#DC2626' }}>{rejectedCount}</div>
            </div>
          </div>

          <div 
            className="kpi-card"
            onClick={() => setStatusFilter(prev => prev === 'WFH' ? 'ALL' : 'WFH')}
            style={{ 
              cursor: 'pointer',
              border: statusFilter === 'WFH' ? '2px solid #0E7490' : '1px solid #E7ECF3',
              boxShadow: statusFilter === 'WFH' ? '0 4px 14px rgba(14,116,144,0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease',
              backgroundColor: statusFilter === 'WFH' ? '#ECFEFF' : '#FFFFFF'
            }}
            title="Click to filter by Work From Home"
          >
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: statusFilter === 'WFH' ? '#0E7490' : '#64748B' }}>Work From Home (WFH)</span>
              <div className="kpi-icon-wrapper" style={{ backgroundColor: '#CFFAFE', color: '#0E7490' }}><Home size={16} /></div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#0E7490' }}>{wfhTotalCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* Table of Requests */}
      <div className="card" style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)' }}>
        {/* Modern Clean Header with Title, Search & Export */}
        <div style={{ padding: '20px 24px 16px 24px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>
                  {isEmployeeRole ? 'My Applications' : isManagerRole ? `${currentUser.department} Applications` : 'All Leave & WFH Applications'}
                </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, backgroundColor: '#ECFEFF', color: '#0E7490', padding: '2px 8px', borderRadius: '999px', border: '1px solid #CFFAFE' }}>
                  {filteredLeaves.length}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>
                Includes Work From Home, Sandwich Days & Pay Breakdown
              </div>
            </div>

            {/* Search Bar & Export Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', minWidth: '240px' }}>
                <Search size={14} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search applicant, ID, type..."
                  style={{
                    width: '100%',
                    height: '36px',
                    paddingLeft: '32px',
                    paddingRight: searchQuery ? '28px' : '12px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.82rem',
                    color: '#1E293B',
                    backgroundColor: '#F8FAFC',
                    outline: 'none',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#0E7490';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(14,116,144,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                    e.currentTarget.style.borderColor = '#E2E8F0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: '#94A3B8',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {!isEmployeeRole && (
                <ExportDropdown
                  onExportExcel={handleExportExcel}
                  onExportPDF={handleExportPDF}
                  onExportCSV={handleExportCSV}
                />
              )}
            </div>
          </div>

          {/* Interactive Status Segmented Filter Tabs */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', overflowX: 'auto', paddingBottom: '2px' }}>
            {[
              { key: 'ALL', label: 'All Applications', count: tabCounts.all },
              { key: 'Pending', label: 'Pending', count: tabCounts.pending },
              { key: 'Approved', label: 'Approved', count: tabCounts.approved },
              { key: 'Rejected', label: 'Rejected', count: tabCounts.rejected },
              { key: 'WFH', label: 'Work From Home', count: tabCounts.wfh }
            ].map(tab => {
              const isActive = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key as any)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '0.80rem',
                    fontWeight: 700,
                    border: isActive ? '1px solid #0E7490' : '1px solid #E2E8F0',
                    backgroundColor: isActive ? '#0E7490' : '#FFFFFF',
                    color: isActive ? '#FFFFFF' : '#475569',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: isActive ? '0 1px 3px rgba(14,116,144,0.2)' : 'none'
                  }}
                >
                  <span>{tab.label}</span>
                  <span style={{
                    fontSize: '0.70rem',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: '999px',
                    backgroundColor: isActive ? 'rgba(255,255,255,0.22)' : '#F1F5F9',
                    color: isActive ? '#FFFFFF' : '#475569'
                  }}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Streamlined Clean Table */}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table className="hrms-table" style={{ width: '100%', minWidth: '940px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {!isEmployeeRole && (
                  <th style={{ width: '40px', minWidth: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={paginatedLeaves.length > 0 && paginatedLeaves.every(l => selectedLeaveIds.includes(l.id))}
                      onChange={handleToggleSelectAll}
                      style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                      aria-label="Select all applications"
                    />
                  </th>
                )}
                <th style={{ width: '45px', minWidth: '45px', textAlign: 'center' }}>#</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '220px' }}>Applicant</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '180px' }}>Type & Reason</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '220px' }}>Dates & Duration</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '110px' }}>Applied On</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '180px' }}>Status & Review</th>
                {!isEmployeeRole && (
                  <th style={{ 
                    textAlign: 'right', 
                    whiteSpace: 'nowrap', 
                    minWidth: '160px',
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
                  <td colSpan={isEmployeeRole ? 6 : 8} style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
                    <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#64748B' }}>No applications found</div>
                    <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '4px' }}>
                      Try adjusting your status filter or search query.
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLeaves.map((l, index) => {
                  const serialNo = isEmployeeRole ? (index + 1) : ((currentPage - 1) * pageSize + index + 1);
                  const isWfh = l.leaveType === 'Work From Home' || 
                    (l.leaveType && l.leaveType.toLowerCase().includes('work from home')) ||
                    (l.leaveType && l.leaveType.toLowerCase() === 'wfh');
                  const hasSandwich = (l.sandwichDays && l.sandwichDays > 0) || l.isSandwichApplied;
                  const isOverridden = l.hrOverride?.isOverridden;
                  const isSelected = selectedLeaveIds.includes(l.id);

                  // Determine pay classification (paid vs unpaid / Loss of Pay)
                  const isExplicitUnpaid = !isLeaveTypePaid(l.leaveType);
                  const isOverriddenUnpaid = l.hrOverride?.adjustedPayType === 'UNPAID_LEAVE';
                  const isOverriddenPaid = l.hrOverride?.adjustedPayType === 'PAID_LEAVE';

                  const isUnpaid = (
                    isExplicitUnpaid || 
                    isOverriddenUnpaid || 
                    (l.unpaidDaysCount !== undefined && l.unpaidDaysCount > 0 && l.paidDaysCount === 0) || 
                    (l.sandwichDetails && l.sandwichDetails.paidDays === 0 && l.sandwichDetails.unpaidDays > 0)
                  ) && !isOverriddenPaid;

                  const unpaidDaysTotal = isUnpaid
                    ? toNum(l.daysCount)
                    : (l.unpaidSandwichDays || l.sandwichDetails?.unpaidDays || l.unpaidDaysCount || 0);

                  const isPartiallyUnpaid = !isUnpaid && !isWfh && unpaidDaysTotal > 0;

                  return (
                    <tr 
                      key={l.id}
                      onClick={() => isEmployeeRole && openInspectLeaveModal(l)}
                      title={isEmployeeRole ? "Click to view application breakdown" : undefined}
                      style={{
                        backgroundColor: isSelected ? '#ECFEFF' : undefined,
                        borderLeft: isSelected ? '4px solid #0E7490' : undefined,
                        transition: 'background-color 0.15s ease',
                        cursor: isEmployeeRole ? 'pointer' : undefined
                      }}
                    >
                      {!isEmployeeRole && (
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', width: '40px' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleLeave(l.id)}
                            style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                            aria-label={`Select application for ${l.employeeName}`}
                          />
                        </td>
                      )}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', width: '45px', color: '#94A3B8', fontWeight: 700, fontSize: '0.80rem' }}>
                        {serialNo}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: '#ECFEFF',
                            color: '#0E7490',
                            border: '1px solid #A5F3FC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            flexShrink: 0,
                            letterSpacing: '0.5px'
                          }}>
                            {getInitials(l.employeeName)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {l.employeeName}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', marginTop: '1px' }}>
                              <span style={{ fontWeight: 600 }}>{l.employeeId}</span>
                              <span style={{ color: '#CBD5E1' }}>•</span>
                              <span>{l.department || 'General'}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                          {isWfh ? (
                            <span style={{ 
                              fontWeight: 700, 
                              color: '#0E7490', 
                              backgroundColor: '#ECFEFF', 
                              border: '1px solid #A5F3FC',
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.74rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <Home size={12} /> Work From Home
                            </span>
                          ) : isUnpaid ? (
                            <span style={{ 
                              fontWeight: 700, 
                              color: '#DC2626', 
                              backgroundColor: '#FEF2F2', 
                              border: '1px solid #FECACA',
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.74rem' 
                            }}>
                              {l.leaveType}
                            </span>
                          ) : (
                            <span style={{ 
                              fontWeight: 700, 
                              color: '#0E7490', 
                              backgroundColor: '#ECFEFF', 
                              border: '1px solid #CFFAFE',
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.74rem' 
                            }}>
                              {l.leaveType}
                            </span>
                          )}
                          {l.reason && (
                            <div style={{ 
                              fontSize: '0.73rem', 
                              color: '#64748B', 
                              fontStyle: 'italic',
                              maxWidth: '190px', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap' 
                            }} title={`Reason: ${l.reason}`}>
                              “{l.reason}”
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                          <Calendar size={13} style={{ color: '#0E7490', flexShrink: 0 }} />
                          <span>{formatDisplayDateRange(l.startDate, l.endDate)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: isUnpaid ? '#DC2626' : '#0E7490',
                            backgroundColor: isUnpaid ? '#FEF2F2' : '#ECFEFF',
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}>
                            {l.daysCount} {toNum(l.daysCount) === 1 ? 'day' : 'days'}
                          </span>
                          {isWfh ? (
                            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#166534', backgroundColor: '#DCFCE7', padding: '1px 6px', borderRadius: '4px' }}>
                              Full Pay
                            </span>
                          ) : isUnpaid ? (
                            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#DC2626', backgroundColor: '#FEE2E2', padding: '1px 6px', borderRadius: '4px' }}>
                              Loss of Pay
                            </span>
                          ) : isPartiallyUnpaid ? (
                            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#DC2626', backgroundColor: '#FEE2E2', padding: '1px 6px', borderRadius: '4px' }}>
                              {unpaidDaysTotal}d LOP
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#166534', backgroundColor: '#DCFCE7', padding: '1px 6px', borderRadius: '4px' }}>
                              Paid
                            </span>
                          )}
                          {hasSandwich && (
                            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#D97706', backgroundColor: '#FEF3C7', padding: '1px 6px', borderRadius: '4px' }}>
                              +{l.sandwichDays}d Sandwich
                            </span>
                          )}
                          {isOverridden && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#FEF3C7', color: '#D97706', padding: '1px 5px', borderRadius: '4px' }}>
                              HR Override
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                          {formatDisplayDate(l.appliedDate || l.startDate)}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                          <span 
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '2px 9px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              borderRadius: '999px',
                              backgroundColor: l.status === 'Approved' ? '#DCFCE7' : l.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                              color: l.status === 'Approved' ? '#166534' : l.status === 'Rejected' ? '#DC2626' : '#B45309'
                            }}
                          >
                            <span style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: l.status === 'Approved' ? '#22C55E' : l.status === 'Rejected' ? '#EF4444' : '#F59E0B'
                            }} />
                            {l.status}
                          </span>
                          {l.status === 'Pending' ? (
                            <span style={{ fontSize: '0.71rem', color: '#94A3B8', fontStyle: 'italic', marginTop: '2px' }}>
                              Awaiting HR/CEO review
                            </span>
                          ) : (
                            <div style={{ marginTop: '1px' }}>
                              <div style={{ fontSize: '0.74rem', color: '#334155', fontWeight: 600 }}>
                                {l.approvedBy || (l.status === 'Approved' ? 'Velmurugan R (CEO)' : 'Pavithra R (HR)')}
                              </div>
                              <div style={{ fontSize: '0.69rem', color: '#94A3B8' }}>
                                {formatReviewDateTime(l.approvedAt) || (l.appliedDate ? formatDisplayDate(l.appliedDate) : '')}
                              </div>
                            </div>
                          )}
                          {l.comment && (
                            <div style={{ 
                              fontSize: '0.70rem', 
                              color: '#DC2626', 
                              backgroundColor: '#FEF2F2',
                              border: '1px solid #FECACA',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              marginTop: '2px', 
                              maxWidth: '180px', 
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }} title={l.comment}>
                              Note: {l.comment}
                            </div>
                          )}
                        </div>
                      </td>
                      {!isEmployeeRole && (
                        <td style={{ 
                          textAlign: 'right', 
                          whiteSpace: 'nowrap', 
                          minWidth: '160px',
                          paddingRight: '20px'
                        }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            {/* Pending Approval Actions */}
                            {l.status === 'Pending' && canApprove && (
                              <>
                                <button 
                                  type="button"
                                  onClick={() => approveLeave(l.id, reviewerName)}
                                  style={{ 
                                    height: '30px',
                                    padding: '0 12px', 
                                    fontWeight: 700, 
                                    fontSize: '0.76rem', 
                                    borderRadius: '8px',
                                    backgroundColor: '#10B981',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 1px 2px rgba(16,185,129,0.2)',
                                    transition: 'all 0.15s ease'
                                  }}
                                  title={isWfh ? "Approve Work From Home" : "Approve Leave Request"}
                                >
                                  <Check size={13} /> Approve
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => {
                                    setRejectModalTarget(l);
                                    setRejectComment('');
                                  }}
                                  style={{ 
                                    height: '30px',
                                    padding: '0 12px', 
                                    fontWeight: 700, 
                                    fontSize: '0.76rem', 
                                    borderRadius: '8px',
                                    backgroundColor: '#EF4444',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 1px 2px rgba(239,68,68,0.2)',
                                    transition: 'all 0.15s ease'
                                  }}
                                  title="Reject Leave Request"
                                >
                                  <X size={13} /> Reject
                                </button>
                              </>
                            )}

                            {/* Re-Approve if Rejected */}
                            {l.status === 'Rejected' && canApprove && (
                              <button
                                type="button"
                                onClick={() => approveLeave(l.id, reviewerName)}
                                style={{
                                  height: '30px',
                                  padding: '0 10px',
                                  borderRadius: '8px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  backgroundColor: '#ECFDF5',
                                  color: '#059669',
                                  border: '1px solid #A7F3D0',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  transition: 'all 0.15s ease'
                                }}
                                title="Re-approve this application"
                              >
                                <Check size={13} /> Re-Approve
                              </button>
                            )}

                            {/* Revoke if Approved */}
                            {l.status === 'Approved' && canApprove && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectModalTarget(l);
                                  setRejectComment('Decision revoked by HR/CEO');
                                }}
                                style={{
                                  height: '30px',
                                  padding: '0 10px',
                                  borderRadius: '8px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  backgroundColor: '#FEF2F2',
                                  color: '#DC2626',
                                  border: '1px solid #FECACA',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  transition: 'all 0.15s ease'
                                }}
                                title="Revoke / Cancel approval"
                              >
                                <X size={13} /> Revoke
                              </button>
                            )}

                            {/* View Details button */}
                            <button
                              type="button"
                              onClick={() => openInspectLeaveModal(l)}
                              title="View application details"
                              aria-label="View Details"
                              style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: '#FFFFFF',
                                color: '#0E7490',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                padding: 0,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#ECFEFF';
                                e.currentTarget.style.borderColor = '#0E7490';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#FFFFFF';
                                e.currentTarget.style.borderColor = '#E2E8F0';
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

        {/* Standard Pagination Footer strictly [5, 10] - hidden in employee page view */}
        {!isEmployeeRole && (
          <StandardTablePagination
            currentPage={currentPage}
            totalEntries={filteredLeaves.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={size => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            pageSizeOptions={[5, 10]}
          />
        )}
      </div>

      {/* Floating Action Bar per AGENTS.md */}
      {!isEmployeeRole && (
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
      )}

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
                    {applicantLeaveBalances.map(item => (
                      <option key={item.id} value={item.name}>
                        {item.isPaid 
                          ? `${item.name} — ${item.remainingDays} Day(s) Left (${item.usedDays} used of ${item.annualQuota}d) [Paid]`
                          : `${item.name} — Unpaid (Loss of Pay / Salary Deduction)`
                        }
                      </option>
                    ))}
                  </select>
                </div>

                {/* Real-time Leave Balance Banner for Selected Category */}
                {(() => {
                  const selectedBal = applicantLeaveBalances.find(b => b.name === form.leaveType) || applicantLeaveBalances[0];
                  if (!selectedBal) return null;
                  const requestedDays = liveCalculation?.totalDays || 1;
                  const isOverQuota = selectedBal.isPaid && requestedDays > selectedBal.remainingDays;

                  return (
                    <div style={{
                      backgroundColor: selectedBal.isPaid ? '#F0FDFA' : '#FFFBEB',
                      border: `1px solid ${selectedBal.isPaid ? '#99F6E4' : '#FDE68A'}`,
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: selectedBal.isPaid ? '#0F766E' : '#B45309', textTransform: 'uppercase' }}>
                            {selectedBal.name} Balance Status
                          </span>
                          <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                            {selectedBal.isPaid ? (
                              <>
                                Annual Quota: <strong>{selectedBal.annualQuota} Days</strong>
                                {selectedBal.carriedForwardDays > 0 && (
                                  <span style={{ color: '#0E7490', fontWeight: 700, marginLeft: '4px' }}>
                                    (+{selectedBal.carriedForwardDays}d carried forward)
                                  </span>
                                )}
                                {' '}• Already Taken: <strong>{selectedBal.usedDays} Days</strong>
                                {selectedBal.allowEncashment && selectedBal.encashableDays > 0 && (
                                  <span style={{ color: '#D97706', fontWeight: 700, marginLeft: '4px' }}>
                                    • Encashable: {selectedBal.encashableDays}d
                                  </span>
                                )}
                              </>
                            ) : (
                              <>Loss of Pay: Deducted from monthly salary like an Absent day</>
                            )}
                          </div>
                        </div>
                        {selectedBal.isPaid && (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: selectedBal.remainingDays > 0 ? '#0F766E' : '#DC2626' }}>
                              {selectedBal.remainingDays}
                            </div>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0F766E' }}>
                              Days Available
                            </div>
                          </div>
                        )}
                      </div>

                      {isOverQuota && (
                        <div style={{
                          backgroundColor: '#FEF2F2',
                          border: '1px solid #FECACA',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '0.75rem',
                          color: '#B91C1C',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '4px'
                        }}>
                          <span>⚠️</span>
                          <span>
                            You are requesting {requestedDays} days, but only {selectedBal.remainingDays} paid days are remaining. The remaining {requestedDays - selectedBal.remainingDays} day(s) will be treated as <strong>Unpaid Leave (Loss of Pay)</strong> and deducted from salary.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

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

                {/* Live Sandwich Rule Preview Info Banner */}
                {liveCalculation && (
                  <div style={{
                    backgroundColor: liveCalculation.sandwichDays > 0 ? '#ECFEFF' : '#F8FAFC',
                    border: `1px solid ${liveCalculation.sandwichDays > 0 ? '#A5F3FC' : '#E2E8F0'}`,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '0.82rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800, color: liveCalculation.sandwichDays > 0 ? '#0E7490' : '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sliders size={15} color="#0E7490" />
                        <span>
                          {liveCalculation.sandwichDays > 0
                            ? `Sandwich Rule Applied: ${liveCalculation.appliedLeaveDays} Working Days + ${liveCalculation.sandwichDays} Sandwich Days`
                            : `${liveCalculation.appliedLeaveDays} Working Days (Sandwich Rule OFF / Excluded)`}
                        </span>
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0E7490' }}>
                        {liveCalculation.totalDays} Total {liveCalculation.totalDays === 1 ? 'Day' : 'Days'}
                      </div>
                    </div>
                    {liveCalculation.sandwichDays > 0 ? (
                      <div style={{ fontSize: '0.75rem', color: '#0E7490', marginTop: '4px' }}>
                        Intervening weekly off or public holiday converted to leave under active Corporate Sandwich Policy.
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                        Weekly offs and holidays are excluded from leave deduction.
                      </div>
                    )}
                  </div>
                )}

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
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '8px',
                backgroundColor: '#F8FAFC',
                padding: '12px',
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Applied Date</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0E7490' }}>
                    {formatDateDDMMYYYY(inspectLeave.appliedDate || inspectLeave.startDate) || '-'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Duration</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1E293B' }}>{formatDateDDMMYYYY(inspectLeave.startDate)} → {formatDateDDMMYYYY(inspectLeave.endDate)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Working Days</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1E293B' }}>
                    {(inspectCalculation || inspectLeave.sandwichDetails)?.appliedLeaveDays ?? inspectLeave.daysCount}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#0E7490' }}>Sandwich Days</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0E7490' }}>
                    {(inspectCalculation || inspectLeave.sandwichDetails)?.sandwichDays ?? inspectLeave.sandwichDays ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Total Leave Days</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                    {(inspectCalculation || inspectLeave.sandwichDetails)?.totalDays ?? inspectLeave.daysCount}
                  </div>
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
                      {(inspectCalculation || inspectLeave.sandwichDetails)?.breakdown && (inspectCalculation || inspectLeave.sandwichDetails)!.breakdown.length > 0 ? (
                        (inspectCalculation || inspectLeave.sandwichDetails)!.breakdown.map((item: SandwichCalculationDayDetail) => (
                          <tr key={item.date} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: item.isSandwich ? '#ECFEFF' : '#FFFFFF' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1E293B' }}>{formatDateDDMMYYYY(item.date)}</td>
                            <td style={{ padding: '8px 12px', color: '#64748B' }}>{item.dayOfWeek}</td>
                            <td style={{ padding: '8px 12px', color: item.isSandwich ? '#0E7490' : '#334155', fontWeight: item.isSandwich ? 700 : 500 }}>{item.reason}</td>
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

                {/* Employee Leave Reason */}
                <div style={{
                  backgroundColor: '#FFFFFF',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  marginTop: '8px',
                  marginBottom: '8px'
                }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '2px' }}>
                    Employee Leave Reason
                  </div>
                  <div style={{ fontSize: '0.86rem', color: '#0F172A', fontWeight: 600 }}>
                    {inspectLeave.reason || 'Personal reasons / General leave'}
                  </div>
                </div>

                {inspectLeave.status !== 'Pending' && (
                  <div style={{ color: '#1E293B', fontSize: '0.82rem' }}>
                    <strong>Reviewed By:</strong> {inspectLeave.approvedBy || (inspectLeave.status === 'Approved' ? 'Velmurugan R (CEO)' : 'Pavithra R (HR Manager)')}
                  </div>
                )}
                {inspectLeave.comment && (
                  <div style={{ color: '#DC2626', fontSize: '0.78rem', marginTop: '4px' }}>
                    <strong>Approver Remarks:</strong> {inspectLeave.comment}
                  </div>
                )}
              </div>

              {/* Add Reason / Approver Remarks (HR / CEO Reviewer) */}
              {canApprove && (
                <div style={{ marginTop: '12px', backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', textTransform: 'uppercase' }}>
                    <span>📝</span> Add Reason / Approver Remarks
                  </label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={inspectRemarks}
                    onChange={e => setInspectRemarks(e.target.value)}
                    placeholder="Enter reason or remarks for approval, rejection, or cancellation..."
                    style={{
                      width: '100%',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      padding: '8px 12px',
                      border: '1px solid #CBD5E1',
                      resize: 'vertical',
                      backgroundColor: '#FFFFFF'
                    }}
                  />
                </div>
              )}
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* 1. Pending Approval Actions inside Modal */}
                {inspectLeave.status === 'Pending' && canApprove && (
                  <>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      onClick={() => {
                        approveLeave(inspectLeave.id, reviewerName, inspectRemarks.trim() || undefined);
                        setInspectLeave(null);
                      }}
                      style={{
                        borderRadius: '8px',
                        padding: '7px 16px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 1px 3px rgba(34,197,94,0.3)',
                        cursor: 'pointer'
                      }}
                      title="Approve this leave request"
                    >
                      <CheckCircle2 size={16} />
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        rejectLeave(inspectLeave.id, reviewerName, inspectRemarks.trim() || 'Rejected by Reviewer');
                        setInspectLeave(null);
                      }}
                      style={{
                        borderRadius: '8px',
                        padding: '7px 16px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 1px 3px rgba(239,68,68,0.3)',
                        cursor: 'pointer'
                      }}
                      title="Reject this leave request"
                    >
                      <XCircle size={16} />
                      Reject
                    </button>
                  </>
                )}

                {/* 2. Re-Approve if Rejected */}
                {inspectLeave.status === 'Rejected' && canApprove && (
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={() => {
                      approveLeave(inspectLeave.id, reviewerName, inspectRemarks.trim() || undefined);
                      setInspectLeave(null);
                    }}
                    style={{ borderRadius: '8px', padding: '7px 16px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    ✓ Re-Approve Request
                  </button>
                )}

                {/* 3. Revoke if Approved */}
                {inspectLeave.status === 'Approved' && canApprove && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      rejectLeave(inspectLeave.id, reviewerName, inspectRemarks.trim() || 'Decision revoked by HR/CEO');
                      setInspectLeave(null);
                    }}
                    style={{ borderRadius: '8px', padding: '7px 16px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
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
