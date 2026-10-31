import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  User,
  Filter,
  ChevronDown,
  Upload,
  FileText,
  ChevronLeft
} from 'lucide-react';
import { LeaveRequest, SandwichCalculationResult, SandwichPayType, SandwichCalculationDayDetail } from '../../types/hrms';
import { isLeaveTypePaid } from '../../services/sandwichLeaveEngine';
import { toNum } from '../../utils/numbers';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../../utils/dateUtils';
import { 
  getTodayKolkata, 
  validateDateRange, 
  checkDuplicateLeaveRequest, 
  PAST_DATE_ERROR_MESSAGE, 
  DUPLICATE_REQUEST_ERROR_MESSAGE, 
  INVALID_DATE_RANGE_ORDER_MESSAGE,
  REQUEST_REASON_ERROR_MESSAGE,
  validateRequestReason
} from '../../utils/requestValidation';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { DateInput } from '../common/DateInput';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { ExportDropdown } from '../common/ExportDropdown';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { handleFormKeyDown, preventSpaceEnterPropagation } from '../../utils/keyboardUtils';

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
    deleteLeaveRequest,
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

  const isEmployeeRole = currentUser.role === 'Employee' || currentUser.role === 'Staff' || currentUser.role === 'Assignee';
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
  const formatReviewDateTime = (value?: string) => formatDateTimeDDMMYYYY(value);
  const minRequestDate = getTodayKolkata();
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [isSubmittingWfh, setIsSubmittingWfh] = useState(false);
  const [leaveReasonError, setLeaveReasonError] = useState<string | null>(null);
  const [wfhReasonError, setWfhReasonError] = useState<string | null>(null);
  const leaveReasonRef = useRef<HTMLTextAreaElement>(null);
  const wfhReasonRef = useRef<HTMLTextAreaElement>(null);

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
  const [isQuotaExpanded, setIsQuotaExpanded] = useState<boolean>(false);

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

  const handleWfhSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const reasonValidation = validateRequestReason(wfhForm.reason);
    if (!reasonValidation.valid) {
      setWfhReasonError(reasonValidation.error || REQUEST_REASON_ERROR_MESSAGE);
      wfhReasonRef.current?.focus();
      return;
    }

    const currentMin = getTodayKolkata();

    // Rule 1: Validate date range (authoritative Asia/Kolkata check)
    const rangeCheck = validateDateRange(wfhForm.startDate, wfhForm.endDate);
    if (!rangeCheck.isValid) {
      alert(rangeCheck.error || PAST_DATE_ERROR_MESSAGE);
      return;
    }

    const targetEmpId = isEmployeeRole ? currentEmployeeId : wfhForm.employeeId;
    const emp = employees.find(e => e.employeeId === targetEmpId || e.id === targetEmpId) || currentEmployee || employees[0];

    // Rule 2: Prevent duplicate or overlapping active (Pending / Approved) leave requests
    const dupCheck = checkDuplicateLeaveRequest(leaveRequests, targetEmpId, wfhForm.startDate, wfhForm.endDate);
    if (dupCheck.hasDuplicate) {
      alert(dupCheck.error || DUPLICATE_REQUEST_ERROR_MESSAGE);
      return;
    }

    if (isSubmittingWfh) return;
    setIsSubmittingWfh(true);

    try {
      applyLeave({
        employeeId: targetEmpId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : currentEmployeeName,
        department: emp?.department || currentUser.department || 'General',
        leaveType: 'Work From Home',
        startDate: wfhForm.startDate,
        endDate: wfhForm.endDate,
        daysCount: wfhDaysCount,
        reason: reasonValidation.value!
      });

      setShowWfhModal(false);
      if (onCloseQuickAdd) onCloseQuickAdd();
      setWfhForm(prev => ({
        ...prev,
        startDate: minRequestDate,
        endDate: minRequestDate,
        reason: ''
      }));
    } finally {
      setIsSubmittingWfh(false);
    }
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
    if (isEmployeeRole || (typeof window !== 'undefined' && window.innerWidth <= 1024)) {
      return displayedLeaves;
    }
    const startIndex = (currentPage - 1) * pageSize;
    return displayedLeaves.slice(startIndex, startIndex + pageSize);
  }, [displayedLeaves, currentPage, pageSize, isEmployeeRole]);

  const [form, setForm] = useState<{
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
    attachmentUrl: string;
    attachmentName?: string;
    isHalfDay: boolean;
    halfDayType: 'First Half' | 'Second Half';
  }>({
    employeeId: currentEmployeeId,
    leaveType: leavePolicies[0]?.name || 'Casual Leave (CL)',
    startDate: minRequestDate,
    endDate: minRequestDate,
    reason: '',
    attachmentUrl: '',
    attachmentName: '',
    isHalfDay: false,
    halfDayType: 'First Half'
  });

  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [leaveSuccessBanner, setLeaveSuccessBanner] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit. Please choose a smaller file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm(prev => ({
        ...prev,
        attachmentUrl: (reader.result as string) || '',
        attachmentName: file.name
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = () => {
    setForm(prev => ({ ...prev, attachmentUrl: '', attachmentName: '' }));
  };

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
      reason: '',
      attachmentUrl: '',
      attachmentName: '',
      isHalfDay: false,
      halfDayType: 'First Half'
    }));
    setDateRangeError(null);
    setDuplicateError(null);
    setLeaveReasonError(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDateRangeError(null);
    setDuplicateError(null);

    const reasonValidation = validateRequestReason(form.reason);
    if (!reasonValidation.valid) {
      setLeaveReasonError(reasonValidation.error || REQUEST_REASON_ERROR_MESSAGE);
      leaveReasonRef.current?.focus();
      return;
    }

    // Rule 1: Validate date range (authoritative Asia/Kolkata check)
    const effectiveEndDate = form.isHalfDay ? form.startDate : form.endDate;
    const rangeCheck = validateDateRange(form.startDate, effectiveEndDate);
    if (!rangeCheck.isValid) {
      setDateRangeError(rangeCheck.error || PAST_DATE_ERROR_MESSAGE);
      return;
    }

    const targetEmpId = isEmployeeRole ? currentEmployeeId : form.employeeId;
    const emp = employees.find(e => e.employeeId === targetEmpId || e.id === targetEmpId) || currentEmployee || employees[0];

    // Rule 2: Prevent duplicate or overlapping active (Pending / Approved) leave requests
    const dupCheck = checkDuplicateLeaveRequest(leaveRequests, targetEmpId, form.startDate, effectiveEndDate);
    if (dupCheck.hasDuplicate) {
      setDuplicateError(dupCheck.error || DUPLICATE_REQUEST_ERROR_MESSAGE);
      return;
    }

    if (isSubmittingLeave) return;
    setIsSubmittingLeave(true);

    try {
      const computedDays = form.isHalfDay ? 0.5 : (liveCalculation?.totalDays || 1);
      const leaveReason = form.isHalfDay
        ? `[Half Day - ${form.halfDayType}] ${reasonValidation.value!}`
        : reasonValidation.value!;

      await applyLeave({
        employeeId: targetEmpId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : currentEmployeeName,
        department: emp?.department || currentUser.department || 'General',
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: effectiveEndDate,
        daysCount: computedDays,
        reason: leaveReason,
        attachmentUrl: form.attachmentUrl || undefined,
        halfDayType: form.isHalfDay ? form.halfDayType : undefined,
        sandwichDetails: form.isHalfDay ? undefined : (liveCalculation || undefined)
      });

      setLeaveSuccessBanner(`Leave request for ${computedDays} day(s) submitted successfully!`);
      setShowModal(false);
      if (onCloseQuickAdd) onCloseQuickAdd();
    } catch (err: any) {
      alert(`Submission failed: ${err?.message || 'Please check your connection and try again.'}`);
    } finally {
      setIsSubmittingLeave(false);
    }
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
      {leaveSuccessBanner && (
        <div style={{
          backgroundColor: '#DCFCE7',
          border: '1px solid #86EFAC',
          color: '#166534',
          padding: '12px 16px',
          borderRadius: '12px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.88rem',
          fontWeight: 600
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✅</span>
            <span>{leaveSuccessBanner}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setLeaveSuccessBanner(null)}
            style={{ background: 'transparent', border: 'none', color: '#166534', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}
      <div className="page-header">
        <div className="page-title-group">
          <h1>{isEmployeeRole ? 'Leave Request' : 'Leave Management System'}</h1>
          
        </div>
        {isEmployeeRole && (
          <div className="header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                padding: '7px 12px',
                borderRadius: '10px',
                fontSize: '0.8rem'
              }}
            >
              <Home size={15} /> Request WFH
            </button>
            <button 
              type="button"
              className="btn btn-primary btn-sm" 
              onClick={openLeaveModal}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '10px', padding: '7px 14px', fontSize: '0.8rem', fontWeight: 700 }}
            >
              <Plus size={15} /> Apply Leave
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
          padding: '14px 16px',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CalendarDays size={18} color="#0E7490" />
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                My Leave Balance ({new Date().getFullYear()})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
                Paid Balance: <strong style={{ color: '#0E7490', fontSize: '0.92rem' }}>{myLeaveSummary.totalPaidRemaining} Days Left</strong> ({myLeaveSummary.totalPaidUsed} taken)
              </div>
              <button
                type="button"
                className="leave-quota-toggle-btn"
                onClick={() => setIsQuotaExpanded(prev => !prev)}
                style={{
                  background: '#ECFEFF',
                  border: '1px solid #CFFAFE',
                  color: '#0E7490',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isQuotaExpanded ? 'Hide Quotas ▲' : 'View Quotas ▼'}
              </button>
            </div>
          </div>

          <div 
            className={`leave-quota-grid ${isQuotaExpanded ? 'expanded' : ''}`}
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}
          >
            {myLeaveSummary.balances.filter(b => b.isPaid).map(b => (
              <div 
                key={b.id} 
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B' }}>{b.name}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                    Quota: {b.annualQuota}d • Taken: {b.usedDays}d
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: b.remainingDays > 0 ? '#0E7490' : '#DC2626' }}>
                    {b.remainingDays}
                  </div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748B' }}>Days Left</div>
                </div>
              </div>
            ))}

            <div 
              style={{
                backgroundColor: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '10px',
                padding: '10px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400E' }}>Loss of Pay (Unpaid)</div>
                <div style={{ fontSize: '0.72rem', color: '#B45309', marginTop: '2px' }}>
                  Deducted from salary like Absent
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: myLeaveSummary.totalUnpaidUsed > 0 ? '#DC2626' : '#92400E' }}>
                  {myLeaveSummary.totalUnpaidUsed}
                </div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#92400E' }}>Days Taken</div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
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

            {/* Header Controls: Search Bar, Status Filter Dropdown & Export Dropdown */}
            {!isEmployeeRole && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {/* Search Bar */}
                <div style={{ position: 'relative', minWidth: '220px' }}>
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

                {/* Status Filter Dropdown */}
                <div style={{ position: 'relative', minWidth: '175px' }}>
                  <Filter size={13} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#0E7490', pointerEvents: 'none' }} />
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as any);
                      setCurrentPage(1);
                    }}
                    style={{
                      width: '100%',
                      height: '36px',
                      paddingLeft: '30px',
                      paddingRight: '28px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#1E293B',
                      backgroundColor: '#F8FAFC',
                      outline: 'none',
                      cursor: 'pointer',
                      appearance: 'none',
                      WebkitAppearance: 'none',
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
                    aria-label="Filter applications by status"
                  >
                    <option value="ALL">All Applications ({tabCounts.all})</option>
                    <option value="Pending">Pending ({tabCounts.pending})</option>
                    <option value="Approved">Approved ({tabCounts.approved})</option>
                    <option value="Rejected">Rejected ({tabCounts.rejected})</option>
                    <option value="WFH">Work From Home ({tabCounts.wfh})</option>
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748B', pointerEvents: 'none' }} />
                </div>

                <ExportDropdown
                  onExportExcel={handleExportExcel}
                  onExportPDF={handleExportPDF}
                  onExportCSV={handleExportCSV}
                />
              </div>
            )}
          </div>
        </div>
        
        {/* Streamlined Clean Table */}
        <div className="leave-desktop-table" style={{ overflowX: 'auto', width: '100%' }}>
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
                <th style={{ whiteSpace: 'nowrap', minWidth: '140px' }}>Leave Type</th>
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
                            {/* Pending Approval Actions */}
                            {l.status === 'Pending' && canApprove && (
                              <>
                                <button 
                                  type="button"
                                  onClick={() => approveLeave(l.id, reviewerName)}
                                  style={{ 
                                    height: '28px',
                                    padding: '0 12px', 
                                    fontWeight: 700, 
                                    fontSize: '0.74rem', 
                                    borderRadius: '8px',
                                    backgroundColor: '#ECFDF5',
                                    color: '#059669',
                                    border: '1px solid #A7F3D0',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#D1FAE5';
                                    e.currentTarget.style.borderColor = '#6EE7B7';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#ECFDF5';
                                    e.currentTarget.style.borderColor = '#A7F3D0';
                                  }}
                                  title={isWfh ? "Approve Work From Home" : "Approve Leave Request"}
                                >
                                  Approve
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => {
                                    setRejectModalTarget(l);
                                    setRejectComment('');
                                  }}
                                  style={{ 
                                    height: '28px',
                                    padding: '0 12px', 
                                    fontWeight: 700, 
                                    fontSize: '0.74rem', 
                                    borderRadius: '8px',
                                    backgroundColor: '#FEF2F2',
                                    color: '#DC2626',
                                    border: '1px solid #FECACA',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#FEE2E2';
                                    e.currentTarget.style.borderColor = '#FCA5A5';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#FEF2F2';
                                    e.currentTarget.style.borderColor = '#FECACA';
                                  }}
                                  title="Reject Leave Request"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {/* Re-Approve if Rejected */}
                            {l.status === 'Rejected' && canApprove && (
                              <button
                                type="button"
                                onClick={() => approveLeave(l.id, reviewerName)}
                                style={{
                                  height: '28px',
                                  padding: '0 12px',
                                  borderRadius: '8px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  backgroundColor: '#ECFDF5',
                                  color: '#059669',
                                  border: '1px solid #A7F3D0',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#D1FAE5';
                                  e.currentTarget.style.borderColor = '#6EE7B7';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#ECFDF5';
                                  e.currentTarget.style.borderColor = '#A7F3D0';
                                }}
                                title="Re-approve this application"
                              >
                                Re-Approve
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
                                  height: '28px',
                                  padding: '0 12px',
                                  borderRadius: '8px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  backgroundColor: '#FEF2F2',
                                  color: '#DC2626',
                                  border: '1px solid #FECACA',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#FEE2E2';
                                  e.currentTarget.style.borderColor = '#FCA5A5';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#FEF2F2';
                                  e.currentTarget.style.borderColor = '#FECACA';
                                }}
                                title="Revoke / Cancel approval"
                              >
                                Revoke
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

        {/* Mobile Leave Cards */}
        <div className="leave-mobile-cards">
          {paginatedLeaves.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#64748B' }}>No applications found</div>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '4px' }}>Try adjusting your status filter or search query.</div>
            </div>
          ) : (
            paginatedLeaves.map((l, index) => {
              const serialNo = isEmployeeRole ? (index + 1) : ((currentPage - 1) * pageSize + index + 1);
              const isWfh = l.leaveType === 'Work From Home' || 
                (l.leaveType && l.leaveType.toLowerCase().includes('work from home')) ||
                (l.leaveType && l.leaveType.toLowerCase() === 'wfh');
              const isSelected = selectedLeaveIds.includes(l.id);
              
              const statusBg = l.status === 'Approved' ? '#DCFCE7' : l.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7';
              const statusColor = l.status === 'Approved' ? '#15803D' : l.status === 'Rejected' ? '#B91C1C' : '#B45309';

              return (
                <div 
                  key={l.id} 
                  className={`mobile-leave-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => openInspectLeaveModal(l)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                        #{serialNo}
                      </span>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 700, 
                        color: isWfh ? '#0E7490' : '#1E293B', 
                        backgroundColor: isWfh ? '#ECFEFF' : '#F1F5F9',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        border: isWfh ? '1px solid #CFFAFE' : '1px solid #E2E8F0'
                      }}>
                        {l.leaveType}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      backgroundColor: statusBg,
                      color: statusColor,
                      padding: '2px 8px',
                      borderRadius: '9999px'
                    }}>
                      {l.status}
                    </span>
                  </div>

                  {!isEmployeeRole && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                      <span style={{ fontWeight: 700, color: '#0F172A' }}>{l.employeeName}</span>
                      <span style={{ color: '#64748B', fontSize: '0.74rem' }}>{l.department || l.employeeId}</span>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.75rem', backgroundColor: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid #F1F5F9' }}>
                    <div>
                      <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: 500 }}>Duration</div>
                      <div style={{ fontWeight: 700, color: '#0E7490' }}>
                        {l.daysCount} {l.daysCount === 1 ? 'Day' : 'Days'}
                        {l.halfDayType ? ` (${l.halfDayType})` : ''}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: 500 }}>Dates</div>
                      <div style={{ fontWeight: 600, color: '#1E293B' }}>
                        {formatDateDDMMYYYY(l.startDate)} - {formatDateDDMMYYYY(l.endDate)}
                      </div>
                    </div>
                  </div>

                  {l.reason && (
                    <div style={{ fontSize: '0.74rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, color: '#64748B' }}>Reason: </span>
                      {l.reason}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #F1F5F9' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                      Applied: {formatDateDDMMYYYY(l.appliedDate || l.startDate)}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                      {l.status === 'Pending' && canApprove && (
                        <>
                          <button
                            type="button"
                            onClick={() => approveLeave(l.id, reviewerName)}
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              borderRadius: '6px',
                              backgroundColor: '#ECFDF5',
                              color: '#059669',
                              border: '1px solid #A7F3D0',
                              cursor: 'pointer'
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectModalTarget(l);
                              setRejectComment('');
                            }}
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              borderRadius: '6px',
                              backgroundColor: '#FEF2F2',
                              color: '#DC2626',
                              border: '1px solid #FECACA',
                              cursor: 'pointer'
                            }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => openInspectLeaveModal(l)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          backgroundColor: '#FFFFFF',
                          color: '#0E7490',
                          border: '1px solid #E2E8F0',
                          cursor: 'pointer'
                        }}
                      >
                        Details →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
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
                  Approve ({selectedLeaveIds.length})
                </button>
                <button
                  type="button"
                  className="action-bar-btn danger"
                  onClick={() => {
                    selectedLeaveIds.forEach(id => rejectLeave(id, reviewerName));
                    setSelectedLeaveIds([]);
                  }}
                >
                  Reject ({selectedLeaveIds.length})
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
                  Reject Leave Request
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
                <X size={15} />
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
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '10px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    if (onCloseQuickAdd) onCloseQuickAdd();
                  }}
                  className="modal-back-arrow-btn"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#1E293B'
                  }}
                  title="Back"
                  aria-label="Back"
                >
                  <ChevronLeft size={22} strokeWidth={2.4} />
                </button>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Apply for Leave</h2>
                  <p className="desktop-only-text" style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                    Select dates to preview real-time sandwich calculations and working days
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowModal(false);
                  if (onCloseQuickAdd) onCloseQuickAdd();
                }}
                style={{
                  width: '32px',
                  height: '32px',
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
            
            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
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

                {/* Inline Validation Alerts */}
                {dateRangeError && (
                  <div style={{
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '0.8rem',
                    color: '#B91C1C',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>⚠️</span>
                    <span>{dateRangeError}</span>
                  </div>
                )}

                {duplicateError && (
                  <div style={{
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '0.8rem',
                    color: '#B91C1C',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>⚠️</span>
                    <span>{duplicateError}</span>
                  </div>
                )}

                {/* Date Selection */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      FROM DATE (FUTURE DATES ONLY) <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <DateInput
                      className="form-control" 
                      value={form.startDate} 
                      min={minRequestDate}
                      onChange={e => {
                        const val = e.target.value;
                        const nextStart = !val || val < minRequestDate ? minRequestDate : val;
                        setForm(prev => ({
                          ...prev,
                          startDate: nextStart,
                          endDate: prev.isHalfDay ? nextStart : (prev.endDate < nextStart ? nextStart : prev.endDate)
                        }));
                        if (dateRangeError) setDateRangeError(null);
                        if (duplicateError) setDuplicateError(null);
                      }} 
                      onBlur={() => {
                        if (!form.startDate || form.startDate < minRequestDate) {
                          setForm(prev => ({
                            ...prev,
                            startDate: minRequestDate,
                            endDate: prev.isHalfDay ? minRequestDate : (prev.endDate < minRequestDate ? minRequestDate : prev.endDate)
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
                      TO DATE {form.isHalfDay ? '(LOCKED FOR HALF DAY)' : ''} <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <DateInput
                      className="form-control" 
                      value={form.isHalfDay ? form.startDate : form.endDate} 
                      min={form.startDate || minRequestDate}
                      disabled={form.isHalfDay}
                      onChange={e => {
                        if (form.isHalfDay) return;
                        const minEnd = form.startDate || minRequestDate;
                        const val = e.target.value;
                        setForm(prev => ({
                          ...prev,
                          endDate: !val || val < minEnd ? minEnd : val
                        }));
                        if (dateRangeError) setDateRangeError(null);
                        if (duplicateError) setDuplicateError(null);
                      }} 
                      onBlur={() => {
                        if (form.isHalfDay) return;
                        const minEnd = form.startDate || minRequestDate;
                        if (!form.endDate || form.endDate < minEnd) {
                          setForm(prev => ({ ...prev, endDate: minEnd }));
                        }
                      }}
                      style={{ 
                        borderRadius: '10px', 
                        backgroundColor: form.isHalfDay ? '#F1F5F9' : '#f8fafc', 
                        fontSize: '0.85rem',
                        cursor: form.isHalfDay ? 'not-allowed' : 'auto'
                      }}
                      required 
                    />
                    {form.isHalfDay && (
                      <span style={{ fontSize: '0.69rem', color: '#0E7490', display: 'block', marginTop: '3px', fontWeight: 600 }}>
                        Single day applies automatically for half-day requests.
                      </span>
                    )}
                  </div>
                </div>

                {/* Half Day Selection Toggle */}
                <div style={{
                  backgroundColor: form.isHalfDay ? '#ECFEFF' : '#F8FAFC',
                  border: `1px solid ${form.isHalfDay ? '#A5F3FC' : '#E2E8F0'}`,
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 700, fontSize: '0.84rem', color: '#1E293B' }}>
                      <input 
                        type="checkbox"
                        checked={form.isHalfDay}
                        onChange={e => {
                          const checked = e.target.checked;
                          setForm(prev => ({
                            ...prev,
                            isHalfDay: checked,
                            endDate: checked ? prev.startDate : prev.endDate
                          }));
                          if (dateRangeError) setDateRangeError(null);
                          if (duplicateError) setDuplicateError(null);
                        }}
                        style={{ width: '18px', height: '18px', accentColor: '#0E7490', cursor: 'pointer' }}
                      />
                      <span>Apply for Half Day Leave (0.5 Day)</span>
                    </label>
                    {form.isHalfDay && (
                      <span style={{ fontSize: '0.72rem', backgroundColor: '#CFFAFE', color: '#0E7490', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
                        0.5 Day Leave
                      </span>
                    )}
                  </div>

                  {form.isHalfDay && (
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B' }}>Select Session:</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '0.82rem', color: '#334155' }}>
                        <input 
                          type="radio" 
                          name="halfDaySession" 
                          value="First Half"
                          checked={form.halfDayType === 'First Half'}
                          onChange={() => setForm(prev => ({ ...prev, halfDayType: 'First Half' }))}
                          style={{ accentColor: '#0E7490' }}
                        />
                        <span>First Half (Morning)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '0.82rem', color: '#334155' }}>
                        <input 
                          type="radio" 
                          name="halfDaySession" 
                          value="Second Half"
                          checked={form.halfDayType === 'Second Half'}
                          onChange={() => setForm(prev => ({ ...prev, halfDayType: 'Second Half' }))}
                          style={{ accentColor: '#0E7490' }}
                        />
                        <span>Second Half (Afternoon)</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Reason Textarea */}
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', margin: 0 }}>
                      REASON <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>
                      {(form.reason || '').length}/250
                    </span>
                  </div>
                  <textarea 
                    ref={leaveReasonRef}
                    className="form-control" 
                    rows={2} 
                    value={form.reason} 
                    onChange={e => {
                      setForm({ ...form, reason: e.target.value });
                      if (leaveReasonError) setLeaveReasonError(null);
                    }}
                    onBlur={() => {
                      const result = validateRequestReason(form.reason);
                      setLeaveReasonError(result.valid ? null : result.error || REQUEST_REASON_ERROR_MESSAGE);
                    }}
                    onKeyDown={preventSpaceEnterPropagation}
                    placeholder="Personal leave, medical reason, family event, etc."
                    required
                    maxLength={500}
                    aria-invalid={Boolean(leaveReasonError)}
                    aria-describedby="leave-reason-error"
                    style={{ borderRadius: '10px', backgroundColor: '#f8fafc', fontSize: '0.85rem', borderColor: leaveReasonError ? '#DC2626' : undefined }}
                  />
                  {leaveReasonError && <div id="leave-reason-error" style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '4px' }}>{leaveReasonError}</div>}
                </div>

                {/* Supporting Document Upload (Optional) */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>SUPPORTING DOCUMENT (OPTIONAL)</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 500, color: '#94A3B8' }}>PDF, PNG, JPG up to 5MB</span>
                  </label>
                  
                  {form.attachmentUrl ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      backgroundColor: '#F0FDFA',
                      border: '1px solid #99F6E4',
                      borderRadius: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <FileText size={16} color="#0E7490" />
                        <span style={{ fontSize: '0.82rem', color: '#0F766E', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {form.attachmentName || 'Attached Document'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveAttachment}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#DC2626',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Remove attachment"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <input
                        type="file"
                        id="leave-supporting-document"
                        accept=".pdf,image/png,image/jpeg,image/jpg"
                        onChange={handleFileUpload}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          cursor: 'pointer',
                          zIndex: 2
                        }}
                      />
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '16px 14px',
                        backgroundColor: '#F8FAFC',
                        border: '1.5px dashed #CBD5E1',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease'
                      }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Upload size={18} color="#0E7490" strokeWidth={2.4} />
                        </div>
                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B' }}>Upload File</span>
                        <span style={{ fontSize: '0.74rem', color: '#64748B' }}>PDF, JPG, PNG (Max 5MB)</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Sandwich / Half-Day Calculation Preview Banner */}
                {form.isHalfDay ? (
                  <div style={{
                    backgroundColor: '#ECFEFF',
                    border: '1px solid #A5F3FC',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '0.82rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800, color: '#0E7490', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sliders size={15} color="#0E7490" />
                        <span>Half Day Session: {form.halfDayType} ({form.startDate ? formatDateDDMMYYYY(form.startDate) : ''})</span>
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0E7490' }}>
                        0.5 Day
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#0E7490', marginTop: '4px' }}>
                      Deducted as 0.5 working day. Weekly off / sandwich rules are not applicable to single half days.
                    </div>
                  </div>
                ) : liveCalculation ? (
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
                ) : null}

              </div>

              {/* Modal Footer */}
              <div className="modal-footer" style={{ borderTop: 'none', padding: 0, marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => {
                    setShowModal(false);
                    if (onCloseQuickAdd) onCloseQuickAdd();
                  }}
                  style={{ borderRadius: '10px', padding: '10px 20px', minHeight: '44px' }}
                >
                  Cancel
                </button>

                <button 
                  type="submit" 
                  disabled={isSubmittingLeave}
                  className="btn btn-primary btn-sm"
                  style={{
                    borderRadius: '10px',
                    padding: '10px 24px',
                    backgroundColor: '#0E7490',
                    borderColor: '#0E7490',
                    fontWeight: 700,
                    minHeight: '44px'
                  }}
                >
                  {isSubmittingLeave 
                    ? 'Submitting...' 
                    : `Submit Leave Request (${form.isHalfDay ? 0.5 : (liveCalculation?.totalDays || 1)} Days)`}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. DETAIL INSPECTION MODAL (CALCULATION BREAKDOWN) */}
      {/* ======================================================== */}
      {inspectLeave && (() => {
        const isWfhInspect = inspectLeave.leaveType === 'Work From Home' || 
          (inspectLeave.leaveType && inspectLeave.leaveType.toLowerCase().includes('work from home')) ||
          (inspectLeave.leaveType && inspectLeave.leaveType.toLowerCase() === 'wfh');
        const isExplicitUnpaid = !isLeaveTypePaid(inspectLeave.leaveType);
        const isOverriddenUnpaid = inspectLeave.hrOverride?.adjustedPayType === 'UNPAID_LEAVE';
        const isOverriddenPaid = inspectLeave.hrOverride?.adjustedPayType === 'PAID_LEAVE';
        const isUnpaidInspect = (
          isExplicitUnpaid || 
          isOverriddenUnpaid || 
          (inspectLeave.unpaidDaysCount !== undefined && inspectLeave.unpaidDaysCount > 0 && inspectLeave.paidDaysCount === 0) || 
          (inspectLeave.sandwichDetails && inspectLeave.sandwichDetails.paidDays === 0 && inspectLeave.sandwichDetails.unpaidDays > 0)
        ) && !isOverriddenPaid;

        const calcData = inspectCalculation || inspectLeave.sandwichDetails;
        const workingDays = calcData?.appliedLeaveDays ?? inspectLeave.daysCount;
        const sandwichDays = calcData?.sandwichDays ?? inspectLeave.sandwichDays ?? 0;
        const totalDays = calcData?.totalDays ?? inspectLeave.daysCount;

        return (
          <div className="modal-overlay" style={{ zIndex: 1050 }}>
            <div className="modal-content" style={{ maxWidth: '680px', width: '94%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '20px', padding: '26px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)' }}>
              
              {/* Header with Applicant Avatar, Info and Status */}
              <div style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '16px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: '#ECFEFF',
                    color: '#0E7490',
                    border: '1px solid #A5F3FC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    flexShrink: 0,
                    letterSpacing: '0.5px'
                  }}>
                    {getInitials(inspectLeave.employeeName)}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1.20rem', fontWeight: 800, color: '#0F172A' }}>
                        {inspectLeave.employeeName}
                      </h3>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '2px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        borderRadius: '999px',
                        backgroundColor: inspectLeave.status === 'Approved' ? '#DCFCE7' : inspectLeave.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                        color: inspectLeave.status === 'Approved' ? '#166534' : inspectLeave.status === 'Rejected' ? '#DC2626' : '#B45309'
                      }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: inspectLeave.status === 'Approved' ? '#22C55E' : inspectLeave.status === 'Rejected' ? '#EF4444' : '#F59E0B'
                        }} />
                        {inspectLeave.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{inspectLeave.employeeId}</span>
                      <span>•</span>
                      <span>{inspectLeave.department || 'General'}</span>
                      <span>•</span>
                      <span style={{
                        fontWeight: 700,
                        color: isUnpaidInspect ? '#DC2626' : '#0E7490',
                        backgroundColor: isUnpaidInspect ? '#FEF2F2' : '#ECFEFF',
                        padding: '1px 7px',
                        borderRadius: '4px'
                      }}>
                        {inspectLeave.leaveType}
                      </span>
                    </div>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={() => setInspectLeave(null)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                    color: '#64748B',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F1F5F9';
                    e.currentTarget.style.color = '#0F172A';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                    e.currentTarget.style.color = '#64748B';
                  }}
                  title="Close modal"
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 4 Clean Stats Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '10px'
                }}>
                  <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '12px 14px'
                  }}>
                    <div style={{ fontSize: '0.70rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Applied Date
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                      {formatDisplayDate(inspectLeave.appliedDate || inspectLeave.startDate)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '2px' }}>
                      Submission date
                    </div>
                  </div>

                  <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '12px 14px'
                  }}>
                    <div style={{ fontSize: '0.70rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Leave Period
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0E7490', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formatDisplayDateRange(inspectLeave.startDate, inspectLeave.endDate)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#0E7490', fontWeight: 600, marginTop: '2px' }}>
                      {workingDays} {toNum(workingDays) === 1 ? 'Working Day' : 'Working Days'}
                    </div>
                  </div>

                  <div style={{
                    backgroundColor: sandwichDays > 0 ? '#FFFBEB' : '#F8FAFC',
                    border: `1px solid ${sandwichDays > 0 ? '#FDE68A' : '#E2E8F0'}`,
                    borderRadius: '12px',
                    padding: '12px 14px'
                  }}>
                    <div style={{ fontSize: '0.70rem', fontWeight: 700, color: sandwichDays > 0 ? '#B45309' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Sandwich Days
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: sandwichDays > 0 ? '#D97706' : '#0F172A', marginTop: '4px' }}>
                      {sandwichDays} {toNum(sandwichDays) === 1 ? 'Day' : 'Days'}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: sandwichDays > 0 ? '#B45309' : '#94A3B8', fontWeight: sandwichDays > 0 ? 600 : 400, marginTop: '2px' }}>
                      {sandwichDays > 0 ? 'Weekend / Holiday' : 'No sandwich impact'}
                    </div>
                  </div>

                  <div style={{
                    backgroundColor: isUnpaidInspect ? '#FEF2F2' : '#F0FDF4',
                    border: `1px solid ${isUnpaidInspect ? '#FECACA' : '#BBF7D0'}`,
                    borderRadius: '12px',
                    padding: '12px 14px'
                  }}>
                    <div style={{ fontSize: '0.70rem', fontWeight: 700, color: isUnpaidInspect ? '#DC2626' : '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Total Leave Days
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: isUnpaidInspect ? '#DC2626' : '#166534', marginTop: '4px' }}>
                      {totalDays} {toNum(totalDays) === 1 ? 'Day' : 'Days'}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: isUnpaidInspect ? '#DC2626' : '#166534', fontWeight: 600, marginTop: '2px' }}>
                      {isWfhInspect ? '100% Paid (WFH)' : isUnpaidInspect ? 'Loss of Pay (LOP)' : 'Paid Leave'}
                    </div>
                  </div>
                </div>

                {/* HR Override Info */}
                {inspectLeave.hrOverride?.isOverridden && (
                  <div style={{ backgroundColor: '#FEF3C7', padding: '12px 16px', borderRadius: '12px', border: '1px solid #FDE68A', fontSize: '0.82rem' }}>
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

                {/* Day-by-Day Policy Breakdown Table */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Day-by-Day Policy Breakdown
                    </h4>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                      {calcData?.breakdown?.length || 1} {calcData?.breakdown?.length === 1 ? 'Day Recorded' : 'Days Recorded'}
                    </span>
                  </div>
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</th>
                          <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Day</th>
                          <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Classification / Policy Note</th>
                          <th style={{ padding: '9px 14px', textAlign: 'center', color: '#64748B', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sandwich</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748B', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pay Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcData?.breakdown && calcData.breakdown.length > 0 ? (
                          calcData.breakdown.map((item: SandwichCalculationDayDetail) => (
                            <tr key={item.date} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: item.isSandwich ? '#ECFEFF' : '#FFFFFF' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                {formatDisplayDate(item.date)}
                              </td>
                              <td style={{ padding: '10px 14px', color: '#475569', fontWeight: 500 }}>
                                {item.dayOfWeek}
                              </td>
                              <td style={{ padding: '10px 14px', color: item.isSandwich ? '#0E7490' : '#334155', fontWeight: item.isSandwich ? 700 : 500 }}>
                                {item.reason}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                {item.isSandwich ? (
                                  <span style={{ fontSize: '0.70rem', fontWeight: 800, color: '#0E7490', backgroundColor: '#CFFAFE', padding: '2px 8px', borderRadius: '6px' }}>
                                    Sandwich
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: item.isPaid ? '#DCFCE7' : '#FEE2E2',
                                  color: item.isPaid ? '#166534' : '#DC2626'
                                }}>
                                  {item.isPaid ? 'Paid' : 'Unpaid (LOP)'}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} style={{ padding: '18px 14px', textAlign: 'center', color: '#64748B' }}>
                              {inspectLeave.daysCount} days applied ({inspectLeave.leaveType}).
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Applicant Reason Note Card */}
                <div style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '14px 16px'
                }}>
                  <div style={{ fontSize: '0.70rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Applicant Reason / Note
                  </div>
                  <div style={{ fontSize: '0.88rem', color: '#0F172A', fontWeight: 600, fontStyle: 'italic' }}>
                    “{inspectLeave.reason || 'Personal reasons / General leave'}”
                  </div>
                </div>

                {/* Review Audit Box if already reviewed */}
                {inspectLeave.status !== 'Pending' && (
                  <div style={{
                    backgroundColor: inspectLeave.status === 'Approved' ? '#F0FDF4' : '#FEF2F2',
                    border: `1px solid ${inspectLeave.status === 'Approved' ? '#BBF7D0' : '#FECACA'}`,
                    borderRadius: '12px',
                    padding: '14px 16px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: inspectLeave.status === 'Approved' ? '#166534' : '#DC2626', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Decision: {inspectLeave.status}
                      </div>
                      {inspectLeave.approvedAt && (
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {formatReviewDateTime(inspectLeave.approvedAt)}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.84rem', color: '#1E293B', fontWeight: 700, marginTop: '2px' }}>
                      Reviewed by {inspectLeave.approvedBy || (inspectLeave.status === 'Approved' ? 'Velmurugan R (CEO)' : 'Pavithra R (HR Manager)')}
                    </div>
                    {inspectLeave.comment && (
                      <div style={{ fontSize: '0.80rem', color: '#DC2626', backgroundColor: '#FFFFFF', padding: '6px 10px', borderRadius: '6px', border: '1px solid #FECACA', marginTop: '6px' }}>
                        <strong>Remarks:</strong> {inspectLeave.comment}
                      </div>
                    )}
                  </div>
                )}

                {/* Approver Remarks Input (For Reviewer when approving or rejecting) */}
                {canApprove && (
                  <div style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '14px 16px'
                  }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <span>✍️</span> Approver Remarks / Review Note
                    </label>
                    <textarea
                      rows={2}
                      value={inspectRemarks}
                      onChange={e => setInspectRemarks(e.target.value)}
                      placeholder="Enter reason or remarks for approval, rejection, or cancellation..."
                      style={{
                        width: '100%',
                        borderRadius: '8px',
                        fontSize: '0.84rem',
                        padding: '10px 12px',
                        border: '1px solid #CBD5E1',
                        resize: 'vertical',
                        backgroundColor: '#F8FAFC',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                        e.currentTarget.style.borderColor = '#0E7490';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(14,116,144,0.1)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.backgroundColor = '#F8FAFC';
                        e.currentTarget.style.borderColor = '#CBD5E1';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Clean Standard Modal Footer */}
              <div style={{
                marginTop: '22px',
                paddingTop: '16px',
                borderTop: '1px solid #F1F5F9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <button 
                  type="button"
                  onClick={() => setInspectLeave(null)}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                    e.currentTarget.style.borderColor = '#CBD5E1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#E2E8F0';
                  }}
                >
                  Close
                </button>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>

                  {inspectLeave.status === 'Pending' && canApprove && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          rejectLeave(inspectLeave.id, reviewerName, inspectRemarks.trim() || 'Rejected by Reviewer');
                          setInspectLeave(null);
                        }}
                        style={{
                          height: '38px',
                          padding: '0 20px',
                          borderRadius: '10px',
                          border: '1px solid #FECACA',
                          backgroundColor: '#FEF2F2',
                          color: '#DC2626',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#FEE2E2';
                          e.currentTarget.style.borderColor = '#FCA5A5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#FEF2F2';
                          e.currentTarget.style.borderColor = '#FECACA';
                        }}
                        title="Reject this leave request"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          approveLeave(inspectLeave.id, reviewerName, inspectRemarks.trim() || undefined);
                          setInspectLeave(null);
                        }}
                        style={{
                          height: '38px',
                          padding: '0 22px',
                          borderRadius: '10px',
                          border: '1px solid #A7F3D0',
                          backgroundColor: '#ECFDF5',
                          color: '#059669',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#D1FAE5';
                          e.currentTarget.style.borderColor = '#6EE7B7';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#ECFDF5';
                          e.currentTarget.style.borderColor = '#A7F3D0';
                        }}
                        title="Approve this leave request"
                      >
                        Approve
                      </button>
                    </>
                  )}

                  {inspectLeave.status === 'Rejected' && canApprove && (
                    <button
                      type="button"
                      onClick={() => {
                        approveLeave(inspectLeave.id, reviewerName, inspectRemarks.trim() || undefined);
                        setInspectLeave(null);
                      }}
                      style={{
                        height: '38px',
                        padding: '0 20px',
                        borderRadius: '10px',
                        border: '1px solid #A7F3D0',
                        backgroundColor: '#ECFDF5',
                        color: '#059669',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#D1FAE5';
                        e.currentTarget.style.borderColor = '#6EE7B7';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#ECFDF5';
                        e.currentTarget.style.borderColor = '#A7F3D0';
                      }}
                      title="Re-approve this application"
                    >
                      Re-Approve Request
                    </button>
                  )}

                  {inspectLeave.status === 'Approved' && canApprove && (
                    <button
                      type="button"
                      onClick={() => {
                        rejectLeave(inspectLeave.id, reviewerName, inspectRemarks.trim() || 'Decision revoked by HR/CEO');
                        setInspectLeave(null);
                      }}
                      style={{
                        height: '38px',
                        padding: '0 20px',
                        borderRadius: '10px',
                        border: '1px solid #FECACA',
                        backgroundColor: '#FEF2F2',
                        color: '#DC2626',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#FEE2E2';
                        e.currentTarget.style.borderColor = '#FCA5A5';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#FEF2F2';
                        e.currentTarget.style.borderColor = '#FECACA';
                      }}
                      title="Revoke approval"
                    >
                      Revoke Approval
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        );
      })()}

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
                type="button"
                onClick={() => setOverrideLeave(null)}
                style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOverride} onKeyDown={handleFormKeyDown}>
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
                    onKeyDown={preventSpaceEnterPropagation}
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
          <div className="modal-content" style={{ maxWidth: '560px', width: '95%', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', borderRadius: '18px', padding: '20px' }}>
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
                  width: '32px',
                  height: '32px',
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

            <form onSubmit={handleWfhSubmit} onKeyDown={handleFormKeyDown}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                      START DATE (FUTURE DATES ONLY) <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <DateInput
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
                    <DateInput
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
                    ref={wfhReasonRef}
                    rows={3}
                    className="form-control"
                    value={wfhForm.reason}
                    onChange={e => {
                      setWfhForm({ ...wfhForm, reason: e.target.value });
                      if (wfhReasonError) setWfhReasonError(null);
                    }}
                    onBlur={() => {
                      const result = validateRequestReason(wfhForm.reason);
                      setWfhReasonError(result.valid ? null : result.error || REQUEST_REASON_ERROR_MESSAGE);
                    }}
                    onKeyDown={preventSpaceEnterPropagation}
                    required
                    maxLength={500}
                    aria-invalid={Boolean(wfhReasonError)}
                    aria-describedby="wfh-reason-error"
                    style={{ borderRadius: '10px', borderColor: wfhReasonError ? '#DC2626' : undefined }}
                  />
                  {wfhReasonError && <div id="wfh-reason-error" style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '4px' }}>{wfhReasonError}</div>}
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '16px 0 0', marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowWfhModal(false);
                    if (onCloseQuickAdd) onCloseQuickAdd();
                  }}
                  style={{ borderRadius: '10px', padding: '10px 18px', minHeight: '44px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWfh}
                  className="btn btn-primary"
                  style={{
                    backgroundColor: '#0E7490',
                    borderColor: '#0E7490',
                    borderRadius: '10px',
                    padding: '10px 22px',
                    fontWeight: 700,
                    minHeight: '44px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Home size={16} /> {isSubmittingWfh ? 'Submitting...' : 'Submit WFH Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
