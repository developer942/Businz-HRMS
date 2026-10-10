import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { OvertimeRequest, OvertimeMultiplierType } from '../../types/attendanceEnterprise';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import {
  Timer,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  Download,
  Plus,
  Calendar,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
  X,
  Eye,
  Sliders,
  Sparkles,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { EmployeeOtRequestModal } from '../attendance/EmployeeOtRequestModal';
import { ManualOtEntryModal } from '../attendance/ManualOtEntryModal';
import { ExportDropdown } from '../common/ExportDropdown';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { formatCurrency } from '../../utils/numbers';

interface OvertimeManagementModuleProps {
  openRequestModal?: boolean;
  onCloseQuickAdd?: () => void;
}

export const OvertimeManagementModule: React.FC<OvertimeManagementModuleProps> = ({
  openRequestModal = false,
  onCloseQuickAdd
}) => {
  const {
    currentUser,
    overtimeRequests = [],
    approveOtRequest,
    rejectOtRequest,
    deleteOtRequest,
    addNotification
  } = useHRMS();

  // Role detection
  const isEmployee = currentUser.role === 'Employee';
  const isCeo = currentUser.role === 'CEO';
  const isHrAdmin = currentUser.role === 'HR Admin' || currentUser.role === 'HR Manager' || currentUser.role === 'Super Admin';
  const isDepartmentManager = currentUser.role === 'Department Manager' || currentUser.role === 'Department Head';
  const canApprove = isCeo || isHrAdmin || isDepartmentManager || currentUser.role === 'Management' || currentUser.role === 'ERP Administrator';

  const currentEmpId = currentUser.employeeId || currentUser.id;

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [statusTab, setStatusTab] = useState<string>('All');

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [goToPageInput, setGoToPageInput] = useState<string>('');

  // Row selection state for standardized table floating bar
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  // Modal states
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(openRequestModal);
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [reviewingRequest, setReviewingRequest] = useState<OvertimeRequest | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<OvertimeRequest | null>(null);
  const [detailRequest, setDetailRequest] = useState<OvertimeRequest | null>(null);

  // Review & Approve form state
  const [approvedHours, setApprovedHours] = useState<number>(0);
  const [selectedMultiplier, setSelectedMultiplier] = useState<OvertimeMultiplierType>('1.5x Salary');
  const [reviewRemarks, setReviewRemarks] = useState<string>('');
  const [rejectRemarks, setRejectRemarks] = useState<string>('');
  const [reviewError, setReviewError] = useState<string>('');

  // Close external modal trigger if applicable
  React.useEffect(() => {
    if (openRequestModal) {
      setIsRequestModalOpen(true);
    }
  }, [openRequestModal]);

  const handleCloseRequestModal = () => {
    setIsRequestModalOpen(false);
    if (onCloseQuickAdd) onCloseQuickAdd();
  };

  // Departments list for filter
  const departments = useMemo(() => {
    const set = new Set<string>();
    overtimeRequests.forEach(r => {
      if (r.department) set.add(r.department);
    });
    return ['All', ...Array.from(set)];
  }, [overtimeRequests]);

  // Base list filtered by role (Employee only sees their own; Manager sees their department; HR/CEO sees all)
  const roleFilteredList = useMemo(() => {
    return overtimeRequests.filter(req => {
      if (isEmployee) {
        return req.employeeId === currentEmpId;
      }
      if (isDepartmentManager && currentUser.department) {
        return req.department.toLowerCase() === currentUser.department.toLowerCase();
      }
      return true;
    });
  }, [overtimeRequests, isEmployee, isDepartmentManager, currentEmpId, currentUser.department]);

  // Filtered list based on Search, Department, and Status Tab
  const filteredList = useMemo(() => {
    return roleFilteredList.filter(req => {
      // Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = req.employeeName.toLowerCase().includes(q);
        const matchId = req.employeeId.toLowerCase().includes(q);
        const matchReason = req.reason.toLowerCase().includes(q);
        const matchWork = req.workDescription?.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchReason && !matchWork) return false;
      }

      // Department
      if (selectedDept !== 'All' && req.department !== selectedDept) {
        return false;
      }

      // Status Tab
      if (statusTab === 'Pending') {
        return req.status === 'Pending Approval';
      }
      if (statusTab === 'Approved') {
        return req.status === 'Approved';
      }
      if (statusTab === 'Partially Approved') {
        return req.status === 'Partially Approved';
      }
      if (statusTab === 'Rejected') {
        return req.status === 'Rejected';
      }
      if (statusTab === 'Manual OT') {
        return req.source === 'Manual OT';
      }

      return true;
    });
  }, [roleFilteredList, searchTerm, selectedDept, statusTab]);

  // Metrics calculation
  const totalCount = roleFilteredList.length;
  const pendingCount = roleFilteredList.filter(r => r.status === 'Pending Approval').length;
  const approvedCount = roleFilteredList.filter(r => r.status === 'Approved' || r.status === 'Partially Approved').length;
  const rejectedCount = roleFilteredList.filter(r => r.status === 'Rejected').length;
  const manualCount = roleFilteredList.filter(r => r.source === 'Manual OT').length;

  const totalApprovedHours = useMemo(() => {
    return Math.round(
      roleFilteredList
        .filter(r => r.status === 'Approved' || r.status === 'Partially Approved')
        .reduce((sum, r) => sum + (r.approvedOtHours || 0), 0) * 10
    ) / 10;
  }, [roleFilteredList]);

  const totalEstimatedPayout = useMemo(() => {
    return Math.round(
      roleFilteredList
        .filter(r => r.status === 'Approved' || r.status === 'Partially Approved')
        .reduce((sum, r) => sum + (r.calculatedAmount || (r.approvedOtHours * (r.hourlyRate || 100))), 0)
    );
  }, [roleFilteredList]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredList.length);
  const paginatedList = filteredList.slice(startIndex, endIndex);

  // Table selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRowIds(paginatedList.map(r => r.id));
    } else {
      setSelectedRowIds([]);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedRowIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Open Review Modal
  const handleOpenReview = (req: OvertimeRequest) => {
    setReviewingRequest(req);
    setApprovedHours(req.requestedOtHours);
    setSelectedMultiplier(req.multiplier || '1.5x Salary');
    setReviewRemarks(req.approvedOtHours ? req.reviewRemarks || '' : '');
    setReviewError('');
  };

  // Submit Review Approval
  const handleConfirmApproval = () => {
    if (!reviewingRequest) return;
    if (approvedHours <= 0) {
      setReviewError('Approved hours must be greater than 0.');
      return;
    }

    const reviewerTag = `${currentUser.name} (${currentUser.role})`;
    const defaultRemark = approvedHours < reviewingRequest.requestedOtHours
      ? `Approved ${approvedHours}h of ${reviewingRequest.requestedOtHours}h requested (${selectedMultiplier})`
      : `Approved ${approvedHours}h (${selectedMultiplier})`;

    approveOtRequest(
      reviewingRequest.id,
      approvedHours,
      reviewerTag,
      reviewRemarks.trim() || defaultRemark,
      selectedMultiplier
    );

    setReviewingRequest(null);
  };

  // Open Reject Modal
  const handleOpenReject = (req: OvertimeRequest) => {
    setRejectingRequest(req);
    setRejectRemarks('');
    setReviewError('');
  };

  // Confirm Reject
  const handleConfirmReject = () => {
    if (!rejectingRequest) return;
    if (!rejectRemarks.trim()) {
      setReviewError('Please provide a reason for rejecting this overtime request.');
      return;
    }

    const reviewerTag = `${currentUser.name} (${currentUser.role})`;
    rejectOtRequest(rejectingRequest.id, reviewerTag, rejectRemarks.trim());
    setRejectingRequest(null);
  };

  // Bulk Actions
  const handleBulkApprove = () => {
    const reviewerTag = `${currentUser.name} (${currentUser.role})`;
    selectedRowIds.forEach(id => {
      const target = overtimeRequests.find(r => r.id === id);
      if (target && target.status === 'Pending Approval') {
        approveOtRequest(id, target.requestedOtHours, reviewerTag, `Bulk approved by ${reviewerTag}`, target.multiplier);
      }
    });
    setSelectedRowIds([]);
    addNotification({
      title: 'Bulk Approval Complete',
      message: `Approved ${selectedRowIds.length} overtime requests.`,
      priority: 'Normal',
      category: 'Attendance'
    });
  };

  const handleBulkReject = () => {
    const reviewerTag = `${currentUser.name} (${currentUser.role})`;
    selectedRowIds.forEach(id => {
      const target = overtimeRequests.find(r => r.id === id);
      if (target && target.status === 'Pending Approval') {
        rejectOtRequest(id, reviewerTag, `Bulk rejected by ${reviewerTag}`);
      }
    });
    setSelectedRowIds([]);
    addNotification({
      title: 'Bulk Rejection Complete',
      message: `Rejected ${selectedRowIds.length} overtime requests.`,
      priority: 'Urgent',
      category: 'Attendance'
    });
  };

  // Overtime Export Data & Handlers
  const getOvertimeExportData = () => {
    const columns = [
      { key: 'id', label: 'Request ID' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'employeeName', label: 'Employee Name' },
      { key: 'department', label: 'Department' },
      { key: 'date', label: 'Date' },
      { key: 'shiftEnd', label: 'Shift End' },
      { key: 'actualCheckOut', label: 'Check Out' },
      { key: 'requestedOtHours', label: 'Requested OT (Hrs)' },
      { key: 'approvedOtHours', label: 'Approved OT (Hrs)' },
      { key: 'multiplier', label: 'Multiplier' },
      { key: 'hourlyRate', label: 'Hourly Rate (₹)' },
      { key: 'calculatedAmount', label: 'Payout (₹)' },
      { key: 'status', label: 'Status' },
      { key: 'source', label: 'Source' },
      { key: 'reason', label: 'Reason' },
      { key: 'workDescription', label: 'Work Description' },
      { key: 'reviewedBy', label: 'Reviewed By' }
    ];

    const data = filteredList.map(r => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      department: r.department,
      date: r.date,
      shiftEnd: r.shiftEnd || '-',
      actualCheckOut: r.actualCheckOut || '-',
      requestedOtHours: r.requestedOtHours,
      approvedOtHours: r.approvedOtHours,
      multiplier: r.multiplier,
      hourlyRate: r.hourlyRate || 0,
      calculatedAmount: r.calculatedAmount || 0,
      status: r.status,
      source: r.source || 'Employee Request',
      reason: r.reason || '-',
      workDescription: r.workDescription || '-',
      reviewedBy: r.reviewedBy || '-'
    }));

    return { columns, data };
  };

  const handleExportCsv = () => {
    const { columns, data } = getOvertimeExportData();
    downloadCSV(data, `Overtime_Report_${new Date().toISOString().split('T')[0]}`, columns);
    addNotification({
      title: 'Report Downloaded',
      message: `Exported ${filteredList.length} overtime records to CSV.`,
      priority: 'Normal',
      category: 'Attendance'
    });
  };

  const handleExportExcel = () => {
    const { columns, data } = getOvertimeExportData();
    downloadExcel(data, `Overtime_Report_${new Date().toISOString().split('T')[0]}`, columns);
    addNotification({
      title: 'Report Downloaded',
      message: `Exported ${filteredList.length} overtime records to Excel (.xls).`,
      priority: 'Normal',
      category: 'Attendance'
    });
  };

  const handleExportPdf = () => {
    const { columns, data } = getOvertimeExportData();
    downloadPDF(data, 'Overtime Register & Audit Report', `Overtime_Report_${new Date().toISOString().split('T')[0]}`, columns);
  };

  // Render Status Badge matching exact system tokens
  const renderStatusBadge = (status: OvertimeRequest['status']) => {
    switch (status) {
      case 'Pending Approval':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: '#FEF3C7',
            color: '#B45309',
            border: '1px solid #FDE68A',
            whiteSpace: 'nowrap'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F59E0B' }} />
            Pending Approval
          </span>
        );
      case 'Approved':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: '#DCFCE7',
            color: '#15803D',
            border: '1px solid #BBF7D0',
            whiteSpace: 'nowrap'
          }}>
            <Check size={12} strokeWidth={2.5} />
            Approved
          </span>
        );
      case 'Partially Approved':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: '#ECFEFF',
            color: '#0E7490',
            border: '1px solid #A5F3FC',
            whiteSpace: 'nowrap'
          }}>
            <Sliders size={12} strokeWidth={2.5} />
            Partially Approved
          </span>
        );
      case 'Rejected':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: '#FEE2E2',
            color: '#B91C1C',
            border: '1px solid #FECACA',
            whiteSpace: 'nowrap'
          }}>
            <X size={12} strokeWidth={2.5} />
            Rejected
          </span>
        );
      case 'Manually Added':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: '#F3E8FF',
            color: '#7E22CE',
            border: '1px solid #E9D5FF',
            whiteSpace: 'nowrap'
          }}>
            <Sparkles size={12} strokeWidth={2.5} />
            Manual OT
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* 1. Header Banner matching Dashboard welcome-banner-card */}
      <div className="welcome-banner-card">
        <div>
          <h1 className="welcome-banner-title">
            {isEmployee ? 'My Overtime Requests' : 'Overtime Management'}
          </h1>
          <p className="welcome-banner-subtitle">
            {isEmployee
              ? 'Request overtime hours, track live supervisor approvals, and calculate extra pay.'
              : 'Review, adjust hours, select rate multipliers, and approve employee overtime with multi-tier HR & CEO sign-off.'}
          </p>
        </div>

        {/* Action buttons matching Dashboard button hierarchy */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <ExportDropdown
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPdf}
            onExportCSV={handleExportCsv}
          />

          {canApprove && !isEmployee && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsManualModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '12px',
                padding: '9px 16px',
                fontSize: '0.84rem',
                fontWeight: 600
              }}
            >
              <Sparkles size={15} color="#0E7490" />
              <span>Add Manual OT</span>
            </button>
          )}

          {!isEmployee && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsRequestModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '12px',
                padding: '9px 18px',
                fontSize: '0.84rem',
                fontWeight: 700,
                backgroundColor: '#0E7490',
                borderColor: '#0E7490',
                boxShadow: '0 2px 8px rgba(14, 116, 144, 0.2)'
              }}
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Request Overtime</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Top 4 KPI Cards matching Dashboard kpi-grid & kpi-card layout */}
      <div
        className="kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}
      >
        {/* 1. Total Requests */}
        <div className="kpi-card" onClick={() => setStatusTab('All')}>
          <div className="kpi-card-header">
            <span>TOTAL REQUESTS</span>
            <FileText size={19} color="#64748B" />
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{totalCount}</div>
            <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="kpi-trend-badge green">✓ {approvedCount} Approved</span>
              <span>{rejectedCount} Rejected</span>
            </div>
          </div>
        </div>

        {/* 2. Pending Approvals */}
        <div className="kpi-card" onClick={() => setStatusTab('Pending')}>
          <div className="kpi-card-header">
            <span>PENDING APPROVALS</span>
            <AlertCircle size={19} color={pendingCount > 0 ? '#D97706' : '#64748B'} />
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value" style={{ color: pendingCount > 0 ? '#B45309' : '#0B1A2D' }}>
              {pendingCount}
            </div>
            <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {pendingCount > 0 ? (
                <span className="kpi-trend-badge amber">Needs Review</span>
              ) : (
                <span className="kpi-trend-badge green">✓ Queue Clear</span>
              )}
              <span>{isEmployee ? 'Awaiting supervisor' : 'Awaiting HR/CEO'}</span>
            </div>
          </div>
        </div>

        {/* 3. Approved OT Hours */}
        <div className="kpi-card" onClick={() => setStatusTab('Approved')}>
          <div className="kpi-card-header">
            <span>APPROVED OT HOURS</span>
            <Clock size={19} color="#059669" />
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value" style={{ color: '#059669' }}>
              {totalApprovedHours} <span style={{ fontSize: '1rem', fontWeight: 600, color: '#64748B' }}>hrs</span>
            </div>
            <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="kpi-trend-badge green">↗ Synced</span>
              <span>To Monthly Payroll</span>
            </div>
          </div>
        </div>

        {/* 4. Estimated OT Payout */}
        <div className="kpi-card" onClick={() => setStatusTab('All')}>
          <div className="kpi-card-header">
            <span>ESTIMATED PAYOUT</span>
            <DollarSign size={19} color="#0891B2" />
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value" style={{ color: '#0E7490' }}>
              {formatCurrency(totalEstimatedPayout)}
            </div>
            <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="kpi-trend-badge purple">1.0x / 1.5x / 2.0x</span>
              <span>Calculated Rate</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Filter Controls Card - Unified Single Row Alignment */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: '20px', borderRadius: '14px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'All', label: 'All Requests', count: totalCount },
              { id: 'Pending', label: 'Pending Approval', count: pendingCount },
              { id: 'Approved', label: 'Approved', count: approvedCount },
              { id: 'Partially Approved', label: 'Partially Approved', count: roleFilteredList.filter(r => r.status === 'Partially Approved').length },
              { id: 'Rejected', label: 'Rejected', count: rejectedCount },
              { id: 'Manual OT', label: 'Manual OT', count: manualCount }
            ].map(tab => {
              const active = statusTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setStatusTab(tab.id);
                    setCurrentPage(1);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: active ? '1px solid #0E7490' : '1px solid transparent',
                    backgroundColor: active ? '#ECFEFF' : '#F8FAFC',
                    color: active ? '#0E7490' : '#64748B'
                  }}
                >
                  <span>{tab.label}</span>
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    backgroundColor: active ? '#0E7490' : '#E2E8F0',
                    color: active ? '#FFFFFF' : '#475569',
                    fontWeight: 700
                  }}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Department Filter & Search Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {!isEmployee && (
              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  height: '36px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#334155',
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {departments.map(d => (
                  <option key={d} value={d}>
                    {d === 'All' ? 'All Departments' : d}
                  </option>
                ))}
              </select>
            )}

            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search employee, reason..."
                style={{
                  height: '36px',
                  width: '230px',
                  padding: '6px 12px 6px 32px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.82rem',
                  color: '#0F172A',
                  outline: 'none',
                  backgroundColor: '#FFFFFF',
                  boxSizing: 'border-box'
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94A3B8',
                    padding: 0
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Table Card with standard hrms-table styling */}
      <div className="card" style={{ padding: 0, borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
        <div className="table-responsive" style={{ overflowX: 'auto', width: '100%' }}>
          <table className="hrms-table" style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {canApprove && (
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={paginatedList.length > 0 && selectedRowIds.length === paginatedList.length}
                      onChange={handleSelectAll}
                      style={{ accentColor: '#0E7490', cursor: 'pointer' }}
                    />
                  </th>
                )}
                <th style={{ minWidth: '180px' }}>Employee</th>
                <th style={{ minWidth: '150px' }}>Date & Shift</th>
                <th style={{ minWidth: '130px' }}>Requested vs Approved</th>
                <th style={{ minWidth: '140px' }}>Multiplier & Payout</th>
                <th style={{ minWidth: '200px' }}>Reason & Work Done</th>
                <th style={{ minWidth: '120px' }}>Status</th>
                <th style={{ minWidth: '160px' }}>Approver Info</th>
                <th style={{ minWidth: '170px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={canApprove ? 9 : 8} style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8' }}>
                    <Timer size={40} strokeWidth={1.5} color="#CBD5E1" style={{ marginBottom: '12px' }} />
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#475569' }}>No Overtime Requests Found</div>
                    <div style={{ fontSize: '0.82rem', color: '#94A3B8', marginTop: '4px' }}>
                      {searchTerm || statusTab !== 'All' || selectedDept !== 'All'
                        ? 'Try adjusting your search criteria or status filter.'
                        : 'No overtime requests submitted yet. Click "+ Request Overtime" to submit.'}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedList.map(item => {
                  const isSelected = selectedRowIds.includes(item.id);
                  const isPending = item.status === 'Pending Approval';
                  const initials = item.employeeName
                    .split(' ')
                    .map(n => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <tr
                      key={item.id}
                      className={isSelected ? 'row-selected' : ''}
                      style={{ transition: 'background-color 0.15s ease' }}
                    >
                      {canApprove && (
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectRow(item.id)}
                            style={{ accentColor: '#0E7490', cursor: 'pointer' }}
                          />
                        </td>
                      )}

                      {/* Employee Column */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: '#E0F2FE',
                            color: '#0369A1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 750,
                            fontSize: '0.75rem',
                            flexShrink: 0
                          }}>
                            {initials}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.88rem' }}>
                              {item.employeeName}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>
                              {item.employeeId} • {item.department}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Date & Shift Column */}
                      <td>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                          <Calendar size={13} color="#64748B" />
                          <span>{formatDateDDMMYYYY(item.date)}</span>
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px', whiteSpace: 'nowrap' }}>
                          Out: {item.actualCheckOut || '08:00 PM'} (Shift end {item.shiftEnd || '06:00 PM'})
                        </div>
                      </td>

                      {/* Hours Column */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>
                            {item.status === 'Approved' || item.status === 'Partially Approved'
                              ? `${item.approvedOtHours} hrs`
                              : `${item.requestedOtHours} hrs`}
                          </span>
                          {item.status === 'Partially Approved' && (
                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                              (Req: {item.requestedOtHours}h)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                          {item.source === 'Manual OT' ? 'Manual Addition' : 'Self-Requested'}
                        </div>
                      </td>

                      {/* Multiplier & Payout */}
                      <td>
                        <div style={{ fontWeight: 800, color: '#0E7490', fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
                          ₹{(item.calculatedAmount || (item.approvedOtHours * (item.hourlyRate || 100))).toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px', whiteSpace: 'nowrap' }}>
                          {item.multiplier || '1x Salary'} • {formatCurrency(item.hourlyRate || 100)}/hr
                        </div>
                      </td>

                      {/* Reason & Work Summary */}
                      <td style={{ maxWidth: '240px' }}>
                        <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.reason}
                        </div>
                        {item.workDescription && (
                          <div style={{ fontSize: '0.74rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                            {item.workDescription}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        {renderStatusBadge(item.status)}
                      </td>

                      {/* Approver Info */}
                      <td>
                        {item.reviewedBy ? (
                          <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', whiteSpace: 'nowrap' }}>
                              {item.reviewedBy}
                            </div>
                            {item.reviewRemarks && (
                              <div style={{ fontSize: '0.72rem', color: '#64748B', fontStyle: 'italic', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                                "{item.reviewRemarks}"
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.76rem', color: '#94A3B8', fontWeight: 500 }}>Awaiting review</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {/* Details Button */}
                          <button
                            type="button"
                            onClick={() => setDetailRequest(item)}
                            title="View Full Details"
                            style={{
                              padding: '5px 10px',
                              borderRadius: '8px',
                              border: '1px solid #E2E8F0',
                              backgroundColor: '#FFFFFF',
                              color: '#475569',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.76rem',
                              fontWeight: 600
                            }}
                          >
                            <Eye size={12} />
                            <span>Details</span>
                          </button>

                          {/* Approval Actions for HR / CEO / Managers */}
                          {canApprove && isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenReview(item)}
                                title="Review, adjust hours, and approve"
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '8px',
                                  border: 'none',
                                  backgroundColor: '#0E7490',
                                  color: '#FFFFFF',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  boxShadow: '0 1px 3px rgba(14, 116, 144, 0.2)'
                                }}
                              >
                                <Check size={12} strokeWidth={2.5} />
                                <span>Approve</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenReject(item)}
                                title="Reject Overtime Request"
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '8px',
                                  border: '1px solid #FECACA',
                                  backgroundColor: '#FEF2F2',
                                  color: '#B91C1C',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '0.76rem',
                                  fontWeight: 600
                                }}
                              >
                                <X size={12} strokeWidth={2.5} />
                                <span>Reject</span>
                              </button>
                            </>
                          )}

                          {/* Employee Cancel option if pending */}
                          {isEmployee && isPending && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('Are you sure you want to cancel this overtime request?')) {
                                  deleteOtRequest(item.id);
                                }
                              }}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '8px',
                                border: '1px solid #FECACA',
                                backgroundColor: '#FEF2F2',
                                color: '#B91C1C',
                                cursor: 'pointer',
                                fontSize: '0.76rem',
                                fontWeight: 600
                              }}
                            >
                              Cancel
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

        {/* 5. Standardized Pagination Footer (from .agents/AGENTS.md) */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderTop: '1px solid #E2E8F0',
          backgroundColor: '#FFFFFF',
          gap: '12px',
          fontSize: '0.82rem',
          color: '#64748B'
        }}>
          {/* Left: Rows Per Page restricted to [5, 10] */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                fontSize: '0.82rem',
                color: '#334155',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
            <span>entries</span>
            <span style={{ color: '#CBD5E1' }}>|</span>
            <span>
              Showing {filteredList.length === 0 ? 0 : startIndex + 1} to {endIndex} of {filteredList.length} entries
            </span>
          </div>

          {/* Right: Page Navigation with active page in #0E7490 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {/* First Page */}
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
              style={{
                padding: '5px 8px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: currentPage === 1 ? '#CBD5E1' : '#475569',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ChevronsLeft size={14} />
            </button>

            {/* Prev Page */}
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              style={{
                padding: '5px 8px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: currentPage === 1 ? '#CBD5E1' : '#475569',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ChevronLeft size={14} />
            </button>

            {/* Page number buttons */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, idx, arr) => {
                const prevP = arr[idx - 1];
                const showEllipsis = prevP && p - prevP > 1;
                const isActive = p === currentPage;

                return (
                  <React.Fragment key={p}>
                    {showEllipsis && <span style={{ padding: '0 4px', color: '#94A3B8' }}>...</span>}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p)}
                      style={{
                        minWidth: '30px',
                        height: '30px',
                        borderRadius: '8px',
                        border: isActive ? '1px solid #0E7490' : '1px solid #E2E8F0',
                        backgroundColor: isActive ? '#0E7490' : '#FFFFFF',
                        color: isActive ? '#FFFFFF' : '#475569',
                        fontWeight: isActive ? 750 : 600,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                );
              })}

            {/* Next Page */}
            <button
              type="button"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              style={{
                padding: '5px 8px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: (currentPage === totalPages || totalPages === 0) ? '#CBD5E1' : '#475569',
                cursor: (currentPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ChevronRight size={14} />
            </button>

            {/* Last Page */}
            <button
              type="button"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(totalPages)}
              style={{
                padding: '5px 8px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: (currentPage === totalPages || totalPages === 0) ? '#CBD5E1' : '#475569',
                cursor: (currentPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ChevronsRight size={14} />
            </button>

            {/* Go to page [ ] */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '8px' }}>
              <span style={{ fontSize: '0.78rem' }}>Go to:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={goToPageInput}
                onChange={(e) => setGoToPageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = Number(goToPageInput);
                    if (val >= 1 && val <= totalPages) {
                      setCurrentPage(val);
                      setGoToPageInput('');
                    }
                  }
                }}
                style={{
                  width: '42px',
                  height: '28px',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  textAlign: 'center',
                  fontSize: '0.78rem',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const val = Number(goToPageInput);
                  if (val >= 1 && val <= totalPages) {
                    setCurrentPage(val);
                    setGoToPageInput('');
                  }
                }}
                style={{
                  height: '28px',
                  padding: '0 8px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  color: '#475569',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Go ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Bar for Checked Rows (from .agents/AGENTS.md) */}
      {selectedRowIds.length > 0 && canApprove && (
        <div className="floating-action-bar">
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              borderRadius: '9999px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 700
            }}>
              {selectedRowIds.length}
            </span>
            Selected
          </span>

          <span style={{ opacity: 0.3 }}>|</span>

          <button
            type="button"
            onClick={handleBulkApprove}
            style={{
              backgroundColor: '#10B981',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 14px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Check size={14} />
            <span>Approve Selected</span>
          </button>

          <button
            type="button"
            onClick={handleBulkReject}
            style={{
              backgroundColor: '#EF4444',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 14px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <X size={14} />
            <span>Reject Selected</span>
          </button>

          <span style={{ opacity: 0.3 }}>|</span>

          <button
            type="button"
            onClick={() => setSelectedRowIds([])}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px'
            }}
            title="Deselect All"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Review & Approve Modal (HR Admin & CEO Multi-Tier Review) */}
      {reviewingRequest && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)',
            border: '1px solid #E2E8F0',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Review & Approve Overtime
                  </h3>
                  <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    Signing off as: <strong>{currentUser.name} ({currentUser.role})</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewingRequest(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '16px',
                border: '1px solid #E2E8F0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem' }}>
                    {reviewingRequest.employeeName}
                  </div>
                  <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    ID: {reviewingRequest.employeeId} • {reviewingRequest.department}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '0.78rem', color: '#475569' }}>
                  <div>📅 Date: <strong>{formatDateDDMMYYYY(reviewingRequest.date)}</strong></div>
                  <div>⏰ Checkout: <strong>{reviewingRequest.actualCheckOut || '08:00 PM'}</strong></div>
                  <div>Requested: <strong style={{ color: '#0E7490' }}>{reviewingRequest.requestedOtHours} hrs</strong></div>
                  <div>🏷️ Reason: <strong>{reviewingRequest.reason}</strong></div>
                </div>
                {reviewingRequest.workDescription && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #CBD5E1', fontSize: '0.76rem', color: '#334155' }}>
                    📝 <em>"{reviewingRequest.workDescription}"</em>
                  </div>
                )}
              </div>

              {/* Adjust Approved Hours */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                  Approved Overtime Hours
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="12"
                    value={approvedHours}
                    onChange={(e) => setApprovedHours(parseFloat(e.target.value) || 0)}
                    style={{
                      flex: 1,
                      height: '38px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      color: '#0E7490',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setApprovedHours(reviewingRequest.requestedOtHours)}
                    style={{
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#F8FAFC',
                      color: '#475569',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Match Requested ({reviewingRequest.requestedOtHours}h)
                  </button>
                </div>
                {approvedHours < reviewingRequest.requestedOtHours && approvedHours > 0 && (
                  <div style={{ fontSize: '0.74rem', color: '#B45309', marginTop: '4px' }}>
                    Hours adjusted down by {(reviewingRequest.requestedOtHours - approvedHours).toFixed(1)}h (Partially Approved).
                  </div>
                )}
              </div>

              {/* Multiplier Selection */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                  Overtime Multiplier
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { value: '1x Salary' as OvertimeMultiplierType, label: '1.0x Regular' },
                    { value: '1.5x Salary' as OvertimeMultiplierType, label: '1.5x Overtime' },
                    { value: '2x Salary' as OvertimeMultiplierType, label: '2.0x Holiday' }
                  ].map(m => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setSelectedMultiplier(m.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: selectedMultiplier === m.value ? '2px solid #0E7490' : '1px solid #E2E8F0',
                        backgroundColor: selectedMultiplier === m.value ? '#ECFEFF' : '#FFFFFF',
                        color: selectedMultiplier === m.value ? '#0E7490' : '#475569',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calculated Payout Preview Box */}
              <div style={{
                backgroundColor: '#ECFEFF',
                border: '1px solid #A5F3FC',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0E7490', textTransform: 'uppercase' }}>
                    Approved Payout Preview
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#155E75', marginTop: '2px' }}>
                    {approvedHours} hrs × {formatCurrency(reviewingRequest.hourlyRate || 100)} × {selectedMultiplier === '2x Salary' ? '2.0' : selectedMultiplier === '1.5x Salary' ? '1.5' : '1.0'}
                  </div>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0E7490' }}>
                  ₹{(
                    approvedHours *
                    (reviewingRequest.hourlyRate || 100) *
                    (selectedMultiplier === '2x Salary' ? 2 : selectedMultiplier === '1.5x Salary' ? 1.5 : 1)
                  ).toFixed(2)}
                </div>
              </div>

              {/* Supervisor Remarks */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                  Approval Remarks
                </label>
                <textarea
                  rows={2}
                  value={reviewRemarks}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                  placeholder="e.g. Approved for structural loading completion."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {reviewError && (
                <div style={{ color: '#DC2626', fontSize: '0.76rem', marginBottom: '10px' }}>
                  {reviewError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              backgroundColor: '#F8FAFC'
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setReviewingRequest(null)}
                style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '0.82rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmApproval}
                style={{
                  borderRadius: '8px',
                  padding: '7px 18px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  backgroundColor: '#0E7490',
                  borderColor: '#0E7490'
                }}
              >
                Confirm & Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingRequest && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            border: '1px solid #E2E8F0',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#FEF2F2'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#FEE2E2',
                  color: '#B91C1C',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <X size={16} strokeWidth={2.5} />
                </div>
                <h3 style={{ fontSize: '0.94rem', fontWeight: 800, color: '#991B1B', margin: 0 }}>
                  Reject Overtime Request
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectingRequest(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '14px' }}>
                Reject overtime request for <strong>{rejectingRequest.employeeName}</strong> ({rejectingRequest.requestedOtHours} hrs on {formatDateDDMMYYYY(rejectingRequest.date)})?
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                  Rejection Reason (Required)
                </label>
                <textarea
                  rows={3}
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  placeholder="Provide reason for rejection (e.g. Overtime was not pre-authorized)..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {reviewError && (
                <div style={{ color: '#DC2626', fontSize: '0.76rem' }}>
                  {reviewError}
                </div>
              )}
            </div>

            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              backgroundColor: '#F8FAFC'
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRejectingRequest(null)}
                style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '0.82rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                style={{
                  borderRadius: '8px',
                  padding: '7px 18px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail View Modal */}
      {detailRequest && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            border: '1px solid #E2E8F0',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Timer size={16} />
                </div>
                <h3 style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Overtime Request Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailRequest(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '20px', fontSize: '0.82rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Employee</div>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{detailRequest.employeeName}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{detailRequest.employeeId} • {detailRequest.department}</div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Status</div>
                  <div style={{ marginTop: '3px' }}>{renderStatusBadge(detailRequest.status)}</div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Date</div>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{formatDateDDMMYYYY(detailRequest.date)}</div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Shift & Checkout</div>
                  <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                    Out: {detailRequest.actualCheckOut || '08:00 PM'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Requested Hours</div>
                  <div style={{ fontWeight: 800, color: '#0E7490', fontSize: '0.95rem', marginTop: '2px' }}>
                    {detailRequest.requestedOtHours} hrs
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Approved Hours</div>
                  <div style={{ fontWeight: 800, color: '#16A34A', fontSize: '0.95rem', marginTop: '2px' }}>
                    {detailRequest.approvedOtHours || 0} hrs
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Multiplier</div>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                    {detailRequest.multiplier} ({formatCurrency(detailRequest.hourlyRate || 100)}/hr)
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Payout</div>
                  <div style={{ fontWeight: 800, color: '#0E7490', fontSize: '0.95rem', marginTop: '2px' }}>
                    ₹{(detailRequest.calculatedAmount || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '8px', marginBottom: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Reason</div>
                <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{detailRequest.reason}</div>
                {detailRequest.workDescription && (
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #E2E8F0', color: '#475569', fontSize: '0.76rem' }}>
                    {detailRequest.workDescription}
                  </div>
                )}
              </div>

              {detailRequest.reviewedBy && (
                <div style={{ padding: '10px 12px', backgroundColor: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                  <div style={{ color: '#15803D', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Reviewed By</div>
                  <div style={{ fontWeight: 700, color: '#166534', marginTop: '2px' }}>{detailRequest.reviewedBy}</div>
                  {detailRequest.reviewRemarks && (
                    <div style={{ fontSize: '0.76rem', color: '#166534', marginTop: '2px', fontStyle: 'italic' }}>
                      "{detailRequest.reviewRemarks}"
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{
              padding: '10px 20px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: '#F8FAFC'
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDetailRequest(null)}
                style={{ borderRadius: '8px', padding: '6px 16px', fontSize: '0.8rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee OT Request Modal */}
      <EmployeeOtRequestModal
        isOpen={isRequestModalOpen}
        onClose={handleCloseRequestModal}
      />

      {/* Manual OT Entry Modal */}
      <ManualOtEntryModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
      />
    </div>
  );
};
