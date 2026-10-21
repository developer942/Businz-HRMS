import React, { useState, useMemo } from 'react';
import { DateInput } from '../common/DateInput';
import {
  CalendarCheck,
  MapPin,
  Search,
  Download,
  CheckCircle2,
  Clock,
  Timer,
  X,
  Filter,
  FileClock,
  Send,
  RotateCcw,
  Calendar as CalendarIcon,
  ShieldCheck,
  Edit3,
  Eye,
  Users,
  AlertTriangle,
  UserCheck,
  UserX,
  Building2,
  ChevronRight,
  Plus,
  ArrowUpDown,
  History,
  Sliders,
  DollarSign,
  Coffee,
  Check,
  ChevronsLeft,
  ChevronLeft,
  ChevronsRight,
  TrendingUp,
  Award,
  AlertCircle
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { AttendanceRecord, AttendanceAuditLog } from '../../types/hrms';
import { formatDateDDMMYYYY, formatTimeDisplay } from '../../utils/dateUtils';
import { AttendanceDetailsDrawer } from './AttendanceDetailsDrawer';
import { AttendanceCorrectionModal } from './AttendanceCorrectionModal';
import { AttendanceCalendarView } from './AttendanceCalendarView';
import { AttendanceAuditLogModal } from './AttendanceAuditLogModal';
import { ReviewOvertimeView } from './ReviewOvertimeView';
import { MissedPunchModal } from './MissedPunchModal';
import { EmployeeOtRequestModal } from './EmployeeOtRequestModal';
import { ManualOtEntryModal } from './ManualOtEntryModal';
import { AttendanceRequestsHub } from './AttendanceRequestsHub';
import { AttendanceTimePickerModal } from './AttendanceTimePickerModal';
import { ManualAttendanceEntryModal } from './ManualAttendanceEntryModal';
import { ExportDropdown } from '../common/ExportDropdown';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { formatCurrency } from '../../utils/numbers';
import { buildAttendanceReport } from '../../services/attendanceReportService';
import { getLocalDateStr } from '../../utils/monthUtils';

export const AttendanceManagementModule: React.FC = () => {
  const {
    attendanceRecords,
    employees,
    departments,
    currentUser,
    markAttendance,
    attendanceAuditLogs,
    missedPunchRequests,
    overtimeRequests,
    attendanceGlobalSettings,
    updateAttendanceGlobalSettings,
    correctAttendanceRecord,
    addNotification,
    shifts,
    leaveRequests,
    weeklySchedules,
    holidayPolicies,
    fieldAssignments
  } = useHRMS();

  // Master Navigation Tabs
  const [activeTab, setActiveTab] = useState<'register' | 'requests' | 'overtime' | 'audit' | 'settings'>('register');
  
  // Register Sub-view toggle (cards is daily staff attendance register from Screenshot 3)
  const [registerViewMode, setRegisterViewMode] = useState<'cards' | 'table' | 'calendar'>('cards');

  // Staff Filter for Daily Register
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('ALL');

  // Interactive Note & Fine Modals
  const [noteModalRecord, setNoteModalRecord] = useState<AttendanceRecord | null>(null);
  const [noteText, setNoteText] = useState<string>('');
  const [fineModalRecord, setFineModalRecord] = useState<AttendanceRecord | null>(null);
  const [fineAmount, setFineAmount] = useState<number>(100);
  const [fineReason, setFineReason] = useState<string>('Late arrival exceeding 30 mins grace period');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [filterOtOnly, setFilterOtOnly] = useState<boolean>(false);

  // Pagination (Restricted strictly to [5, 10] per design system)
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  // Row Selection & Floating Action Bar
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  // Modals & Drawer state
  const [detailsDrawerRecord, setDetailsDrawerRecord] = useState<AttendanceRecord | null>(null);
  const [correctionTargetRecord, setCorrectionTargetRecord] = useState<AttendanceRecord | null>(null);
  const [isMissedPunchModalOpen, setIsMissedPunchModalOpen] = useState<boolean>(false);
  const [isEmployeeOtModalOpen, setIsEmployeeOtModalOpen] = useState<boolean>(false);
  const [isManualOtModalOpen, setIsManualOtModalOpen] = useState<boolean>(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [isManualAttendanceModalOpen, setIsManualAttendanceModalOpen] = useState<boolean>(false);

  // Time Picker Popover / Modal state (Screenshot 1)
  const [timePickerModalData, setTimePickerModalData] = useState<{
    isOpen: boolean;
    employeeName: string;
    date: string;
    checkIn: string;
    checkOut: string;
    recordId: string;
  } | null>(null);

  // Permissions check
  const isHrOrCeo =
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'CEO' ||
    currentUser?.role === 'HR Manager' ||
    currentUser?.role === 'HR Admin';

  const isCeoOrExemptEmp = (empId: string) => {
    const emp = employees.find(e => e.employeeId === empId || e.id === empId);
    return emp?.designation?.toLowerCase().includes('ceo') || emp?.role === 'CEO' || emp?.attendanceMethod === 'Exempt';
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = attendanceRecords.length || 1;
    const presentCount = attendanceRecords.filter(r => r.status === 'Present').length;
    const onTimeCount = attendanceRecords.filter(r => r.status === 'Present' && (!r.lateStatus || r.lateStatus === 'On Time')).length;
    const lateCount = attendanceRecords.filter(r => r.lateStatus && r.lateStatus !== 'On Time' && r.lateStatus !== 'N/A').length;
    const todayReport = buildAttendanceReport({
      currentUser,
      role: currentUser?.role,
      employees,
      attendanceRecords,
      leaveRequests,
      shifts,
      weeklySchedules,
      holidayPolicies,
      fieldAssignments,
      date: getLocalDateStr()
    });
    const absentCount = todayReport.absent.length;
    const halfDayCount = attendanceRecords.filter(r => r.status === 'Half Day').length;
    const leaveCount = attendanceRecords.filter(r => r.status === 'On Leave').length;
    const wfhCount = attendanceRecords.filter(r => r.status === 'Work From Home').length;
    
    // Missing check-outs: checked in but no check out on a day
    const missingCheckOutCount = attendanceRecords.filter(r => r.checkIn && !r.checkOut && r.status === 'Present' && !isCeoOrExemptEmp(r.employeeId)).length;

    // OT metrics
    const totalOtHours = attendanceRecords.reduce((acc, r) => acc + (r.approvedOtHours || r.otHours || 0), 0);
    const pendingRequestsCount = missedPunchRequests.filter(r => r.status === 'Pending').length;
    const pendingOtClaimsCount = overtimeRequests.filter(r => r.status === 'Pending Approval').length;
    const approvedOtPayout = overtimeRequests
      .filter(r => r.status === 'Approved' || r.status === 'Partially Approved')
      .reduce((acc, r) => acc + (r.approvedOtHours * r.hourlyRate), 0);

    return {
      presentCount,
      presentPercent: Math.round((presentCount / total) * 100),
      onTimeCount,
      lateCount,
      absentCount,
      halfDayCount,
      leaveCount,
      wfhCount,
      missingCheckOutCount,
      totalOtHours: Math.round(totalOtHours * 10) / 10,
      pendingRequestsCount,
      pendingOtClaimsCount,
      approvedOtPayout: Math.round(approvedOtPayout)
    };
  }, [attendanceRecords, employees, currentUser, leaveRequests, shifts, weeklySchedules, holidayPolicies, fieldAssignments, missedPunchRequests, overtimeRequests]);

  // Filtered attendance records for Register
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter(rec => {
      if (selectedStatus !== 'All' && rec.status !== selectedStatus) return false;
      if (selectedDept !== 'All' && rec.department !== selectedDept) return false;
      if (selectedDate && rec.date !== selectedDate) return false;
      if (filterOtOnly && !(rec.otHours && rec.otHours > 0)) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = rec.employeeName.toLowerCase().includes(query);
        const matchId = rec.employeeId.toLowerCase().includes(query);
        const matchDept = rec.department?.toLowerCase().includes(query);
        if (!matchName && !matchId && !matchDept) return false;
      }

      return true;
    });
  }, [attendanceRecords, selectedStatus, selectedDept, selectedDate, filterOtOnly, searchQuery]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredRecords.length);
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  // Staff Daily Records for register view
  const staffDailyRecords = useMemo(() => {
    if (selectedStaffFilter !== 'ALL') {
      return attendanceRecords.filter(r => r.employeeId === selectedStaffFilter);
    }
    return paginatedRecords;
  }, [selectedStaffFilter, attendanceRecords, paginatedRecords]);

  // Table selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pageIds = paginatedRecords.map(r => r.id);
      setSelectedRowIds(Array.from(new Set([...selectedRowIds, ...pageIds])));
    } else {
      const pageIds = new Set(paginatedRecords.map(r => r.id));
      setSelectedRowIds(selectedRowIds.filter(id => !pageIds.has(id)));
    }
  };

  const handleRowSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRowIds([...selectedRowIds, id]);
    } else {
      setSelectedRowIds(selectedRowIds.filter(rowId => rowId !== id));
    }
  };

  const isAllPageSelected = paginatedRecords.length > 0 && paginatedRecords.every(r => selectedRowIds.includes(r.id));

  // Quick punch simulation
  const handleQuickPunch = () => {
    const empId = currentUser?.employeeId || currentUser?.id || 'EMP001';
    markAttendance(empId, 'Present', 'Manual Punch');
    addNotification({
      title: 'Punch Registered',
      message: `Checked in successfully for ${currentUser?.name || 'User'} via terminal.`,
      priority: 'Normal',
      category: 'Attendance'
    });
  };

  // Export Handlers (Excel, PDF, CSV)
  const getAttendanceExportData = () => {
    const columns = [
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'employeeName', label: 'Employee Name' },
      { key: 'department', label: 'Department' },
      { key: 'date', label: 'Date' },
      { key: 'status', label: 'Status' },
      { key: 'checkIn', label: 'Check In' },
      { key: 'checkOut', label: 'Check Out' },
      { key: 'workingHours', label: 'Working Hours' },
      { key: 'otHours', label: 'OT Hours' }
    ];
    const data = filteredRecords.map(r => ({
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      department: r.department || '',
      date: formatDateDDMMYYYY(r.date),
      status: r.status,
      checkIn: formatTimeDisplay(r.checkIn, '-'),
      checkOut: formatTimeDisplay(r.checkOut, '-'),
      workingHours: r.workingHours || '-',
      otHours: r.approvedOtHours || r.otHours || 0
    }));
    return { columns, data };
  };

  const handleExportCsv = () => {
    const { columns, data } = getAttendanceExportData();
    downloadCSV(data, `Attendance_Report_${new Date().toISOString().split('T')[0]}`, columns);
  };

  const handleExportExcel = () => {
    const { columns, data } = getAttendanceExportData();
    downloadExcel(data, `Attendance_Report_${new Date().toISOString().split('T')[0]}`, columns);
  };

  const handleExportPDF = () => {
    const { columns, data } = getAttendanceExportData();
    downloadPDF(data, 'Daily Attendance & Timesheet Register', `Attendance_Report_${new Date().toISOString().split('T')[0]}`, columns);
  };

  const getStatusBadgeClass = (status: AttendanceRecord['status']) => {
    switch (status) {
      case 'Present':
        return 'vrm-status-badge vrm-status-present';
      case 'Half Day':
        return 'vrm-status-badge vrm-status-halfday';
      case 'Absent':
        return 'vrm-status-badge vrm-status-absent';
      case 'On Leave':
        return 'vrm-status-badge vrm-status-leave';
      case 'Work From Home':
        return 'vrm-status-badge vrm-status-wfh';
      case 'Holiday':
      case 'Week Off':
        return 'vrm-status-badge vrm-status-default';
      default:
        return 'vrm-status-badge vrm-status-default';
    }
  };

  return (
    <div className="vrm-hub-page">
      
      {/* ── TOP HEADER WITH QUICK ACTIONS ── */}
      <div className="vrm-hub-header">
        <div className="vrm-hub-header-left">
          <div className="vrm-hub-header-icon">
            <CalendarCheck size={24} />
          </div>
          <div>
            <h1 className="vrm-hub-header-title">
              Attendance Management
            </h1>
            <p className="vrm-hub-header-subtitle">
              Centralized clock-in verification, missed punches, overtime approvals, and audit trails
            </p>
          </div>
        </div>

        <div className="vrm-hub-header-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ExportDropdown 
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            onExportCSV={handleExportCsv}
          />

          {isHrOrCeo && (
            <button
              type="button"
              className="vrm-btn vrm-btn-primary"
              onClick={() => setIsManualAttendanceModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '10px',
                padding: '8px 18px',
                fontSize: '0.84rem',
                fontWeight: 700,
                backgroundColor: '#0E7490',
                borderColor: '#0E7490',
                boxShadow: '0 2px 8px rgba(14, 116, 144, 0.25)',
                color: '#FFFFFF'
              }}
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Manual Attendance</span>
            </button>
          )}
        </div>
      </div>

      {/* ── CRITICAL ALERT BANNERS (Clickable) ── */}
      {(stats.missingCheckOutCount > 0 || stats.pendingRequestsCount > 0 || stats.pendingOtClaimsCount > 0) && (
        <div className="vrm-alerts-grid">
          {stats.missingCheckOutCount > 0 && (
            <div
              onClick={() => {
                setActiveTab('register');
                setSelectedStatus('Present');
              }}
              className="vrm-alert-card warning"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="vrm-alert-icon warning">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h4 className="vrm-alert-title">
                    {stats.missingCheckOutCount} Missing Check-Outs
                  </h4>
                  <p className="vrm-alert-desc">Checked in without out-punch (Requires regularisation)</p>
                </div>
              </div>
              <ChevronRight size={18} color="#D97706" />
            </div>
          )}

          {stats.pendingRequestsCount > 0 && (
            <div
              onClick={() => setActiveTab('requests')}
              className="vrm-alert-card info"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="vrm-alert-icon info">
                  <FileClock size={20} />
                </div>
                <div>
                  <h4 className="vrm-alert-title">
                    {stats.pendingRequestsCount} Pending Punch Requests
                  </h4>
                  <p className="vrm-alert-desc">Missed punch regularisations awaiting HR approval</p>
                </div>
              </div>
              <ChevronRight size={18} color="#0E7490" />
            </div>
          )}

          {stats.pendingOtClaimsCount > 0 && (
            <div
              onClick={() => setActiveTab('requests')}
              className="vrm-alert-card purple"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="vrm-alert-icon purple">
                  <DollarSign size={20} />
                </div>
                <div>
                  <h4 className="vrm-alert-title">
                    {stats.pendingOtClaimsCount} Overtime Claims Pending
                  </h4>
                  <p className="vrm-alert-desc">Review logged overtime hours and approve payout</p>
                </div>
              </div>
              <ChevronRight size={18} color="#7C3AED" />
            </div>
          )}
        </div>
      )}

      {/* ── KPI METRICS OVERVIEW (Clean executive grid) ── */}
      <div className="vrm-kpi-hub-grid">
        {/* KPI 1: Present */}
        <div
          onClick={() => { setActiveTab('register'); setSelectedStatus('Present'); }}
          className={`vrm-kpi-hub-card ${selectedStatus === 'Present' && activeTab === 'register' ? 'active' : ''}`}
        >
          <div className="vrm-kpi-hub-top">
            <span className="vrm-kpi-hub-label">Present</span>
            <div className="vrm-kpi-hub-icon-pill" style={{ background: '#DCFCE7', color: '#15803D' }}>
              <UserCheck size={16} />
            </div>
          </div>
          <div className="vrm-kpi-hub-val">{stats.presentCount}</div>
          <div className="vrm-kpi-hub-sub" style={{ color: '#15803D' }}>
            <TrendingUp size={12} /> {stats.presentPercent}% presence
          </div>
        </div>

        {/* KPI 2: On Time */}
        <div
          onClick={() => { setActiveTab('register'); setSelectedStatus('Present'); }}
          className="vrm-kpi-hub-card"
        >
          <div className="vrm-kpi-hub-top">
            <span className="vrm-kpi-hub-label">On Time</span>
            <div className="vrm-kpi-hub-icon-pill" style={{ background: '#ECFEFF', color: '#0E7490' }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="vrm-kpi-hub-val">{stats.onTimeCount}</div>
          <div className="vrm-kpi-hub-sub" style={{ color: '#64748B' }}>
            Punctual arrivals
          </div>
        </div>

        {/* KPI 3: Late Arrivals */}
        <div
          onClick={() => { setActiveTab('register'); setSelectedStatus('Late'); }}
          className={`vrm-kpi-hub-card ${selectedStatus === 'Late' && activeTab === 'register' ? 'active' : ''}`}
        >
          <div className="vrm-kpi-hub-top">
            <span className="vrm-kpi-hub-label">Late</span>
            <div className="vrm-kpi-hub-icon-pill" style={{ background: '#FEF3C7', color: '#D97706' }}>
              <Clock size={16} />
            </div>
          </div>
          <div className="vrm-kpi-hub-val">{stats.lateCount}</div>
          <div className="vrm-kpi-hub-sub" style={{ color: '#D97706' }}>
            &gt;15 min grace
          </div>
        </div>

        {/* KPI 4: Absent */}
        <div
          onClick={() => { setActiveTab('register'); setSelectedStatus('Absent'); }}
          className={`vrm-kpi-hub-card ${selectedStatus === 'Absent' && activeTab === 'register' ? 'active' : ''}`}
        >
          <div className="vrm-kpi-hub-top">
            <span className="vrm-kpi-hub-label">Absent / LOP</span>
            <div className="vrm-kpi-hub-icon-pill" style={{ background: '#FEE2E2', color: '#DC2626' }}>
              <UserX size={16} />
            </div>
          </div>
          <div className="vrm-kpi-hub-val">{stats.absentCount}</div>
          <div className="vrm-kpi-hub-sub" style={{ color: '#DC2626' }}>
            Loss of Pay applied
          </div>
        </div>

        {/* KPI 5: Half Day */}
        <div
          onClick={() => { setActiveTab('register'); setSelectedStatus('Half Day'); }}
          className={`vrm-kpi-hub-card ${selectedStatus === 'Half Day' && activeTab === 'register' ? 'active' : ''}`}
        >
          <div className="vrm-kpi-hub-top">
            <span className="vrm-kpi-hub-label">Half Day</span>
            <div className="vrm-kpi-hub-icon-pill" style={{ background: '#FFEDD5', color: '#C2410C' }}>
              <Coffee size={16} />
            </div>
          </div>
          <div className="vrm-kpi-hub-val">{stats.halfDayCount}</div>
          <div className="vrm-kpi-hub-sub" style={{ color: '#64748B' }}>
            4.0 hrs credit
          </div>
        </div>

        {/* KPI 6: Total OT Hours */}
        <div
          onClick={() => setActiveTab('overtime')}
          className={`vrm-kpi-hub-card ${activeTab === 'overtime' ? 'active' : ''}`}
        >
          <div className="vrm-kpi-hub-top">
            <span className="vrm-kpi-hub-label">Overtime Hours</span>
            <div className="vrm-kpi-hub-icon-pill" style={{ background: '#CFFAFE', color: '#0E7490' }}>
              <Timer size={16} />
            </div>
          </div>
          <div className="vrm-kpi-hub-val">{stats.totalOtHours} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>hrs</span></div>
          <div className="vrm-kpi-hub-sub" style={{ color: '#0E7490' }}>
            Logged extra time
          </div>
        </div>

        {/* KPI 8: Approved OT Payout */}
        <div
          onClick={() => setActiveTab('overtime')}
          className="vrm-kpi-hub-card"
        >
          <div className="vrm-kpi-hub-top">
            <span className="vrm-kpi-hub-label">Approved OT Payout</span>
            <div className="vrm-kpi-hub-icon-pill" style={{ background: '#DCFCE7', color: '#15803D' }}>
              <DollarSign size={16} />
            </div>
          </div>
          <div className="vrm-kpi-hub-val" style={{ color: '#15803D' }}>{formatCurrency(stats.approvedOtPayout)}</div>
          <div className="vrm-kpi-hub-sub" style={{ color: '#15803D' }}>
            Synced to Payroll
          </div>
        </div>
      </div>

      {/* ── 6 MASTER NAVIGATION TABS ── */}
      <div className="vrm-tabs-bar">
        <button
          onClick={() => { setActiveTab('register'); setRegisterViewMode('cards'); }}
          className={`vrm-tab-btn ${activeTab === 'register' && registerViewMode === 'cards' ? 'active' : ''}`}
        >
          <CalendarCheck size={16} /> Daily Attendance (Staff Logs)
        </button>

        <button
          onClick={() => setActiveTab('overtime')}
          className={`vrm-tab-btn ${activeTab === 'overtime' ? 'active' : ''}`}
        >
          <Timer size={16} /> Review Overtime
          {overtimeRequests.filter(r => r.status === 'Pending Approval').length > 0 && (
            <span className="vrm-tab-badge">
              {overtimeRequests.filter(r => r.status === 'Pending Approval').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`vrm-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
        >
          <UserCheck size={16} /> Requests & Approvals Hub
          {(stats.pendingRequestsCount + stats.pendingOtClaimsCount) > 0 && (
            <span className="vrm-tab-badge">
              {stats.pendingRequestsCount + stats.pendingOtClaimsCount}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB 1: ATTENDANCE REGISTER & DAILY LOGS ── */}
      {activeTab === 'register' && (
        <div className="space-y-4">
          
          {/* Sub-view switcher & Filter Controls */}
          <div className="vrm-controls-bar">
            
            {/* Left: View mode toggles */}
            <div className="vrm-view-modes">
              <button
                type="button"
                onClick={() => setRegisterViewMode('cards')}
                className={`vrm-view-mode-btn ${registerViewMode === 'cards' ? 'active' : ''}`}
                style={{ cursor: 'default' }}
              >
                Daily Staff Register
              </button>
            </div>

            {/* Center: Staff Switcher dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748B' }}>Employee:</span>
              <select
                value={selectedStaffFilter}
                onChange={e => setSelectedStaffFilter(e.target.value)}
                className="vrm-filter-select"
                style={{ fontWeight: 700, minWidth: '220px', border: '1.5px solid #0E7490' }}
              >
                <option value="ALL">All Staff (Combined Logs)</option>
                {employees.map(emp => (
                  <option key={emp.employeeId || emp.id} value={emp.employeeId || emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.designation})
                  </option>
                ))}
              </select>
            </div>

            {/* Right: Filters & Search */}
            <div className="vrm-filters-group">
              <div className="vrm-search-box">
                <Search className="vrm-search-icon" size={15} />
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                />
              </div>

              <select
                value={selectedDept}
                onChange={e => { setSelectedDept(e.target.value); setCurrentPage(1); }}
                className="vrm-filter-select"
              >
                <option value="All">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>

              <select
                value={selectedStatus}
                onChange={e => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                className="vrm-filter-select"
              >
                <option value="All">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Half Day">Half Day</option>
                <option value="On Leave">On Leave</option>
                <option value="Work From Home">Work From Home</option>
                <option value="Holiday">Holiday</option>
              </select>

              <DateInput
                value={selectedDate}
                onChange={e => { setSelectedDate(e.target.value); setCurrentPage(1); }}
                className="vrm-filter-date"
              />

              <button
                type="button"
                onClick={() => setFilterOtOnly(!filterOtOnly)}
                className={`vrm-btn ${filterOtOnly ? 'vrm-btn-primary' : 'vrm-btn-secondary'}`}
                style={{ padding: '7px 14px', fontSize: '12px' }}
              >
                OT Only
              </button>

              {isHrOrCeo && (
                <button
                  type="button"
                  onClick={() => setIsManualAttendanceModalOpen(true)}
                  className="vrm-btn vrm-btn-primary"
                  style={{
                    padding: '7px 14px',
                    fontSize: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#0E7490',
                    borderColor: '#0E7490'
                  }}
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>Manual Attendance</span>
                </button>
              )}

              {(searchQuery || selectedDept !== 'All' || selectedStatus !== 'All' || selectedDate || filterOtOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedDept('All');
                    setSelectedStatus('All');
                    setSelectedDate('');
                    setFilterOtOnly(false);
                    setCurrentPage(1);
                  }}
                  className="vrm-btn-icon"
                  title="Reset Filters"
                >
                  <RotateCcw size={15} />
                </button>
              )}
            </div>
          </div>

          {/* VIEW MODE 1: TABLE VIEW */}
          {registerViewMode === 'table' && (
            <div className="vrm-table-card">
              <div className="vrm-table-responsive">
                <table className="vrm-table">
                  <thead>
                    <tr>
                      <th style={{ width: '44px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isAllPageSelected}
                          onChange={e => handleSelectAll(e.target.checked)}
                          className="vrm-checkbox"
                        />
                      </th>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Shift</th>
                      <th>Check In</th>
                      <th>Break</th>
                      <th>Check Out</th>
                      <th>Net Hours</th>
                      <th>OT Hours</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={11} style={{ textAlign: 'center', padding: '40px 16px', color: '#94A3B8' }}>
                          No attendance records found matching filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedRecords.map(rec => {
                        const isSelected = selectedRowIds.includes(rec.id);
                        return (
                          <tr
                            key={rec.id}
                            className={isSelected ? 'selected-row' : ''}
                          >
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => handleRowSelect(rec.id, e.target.checked)}
                                className="vrm-checkbox"
                              />
                            </td>

                            {/* Employee */}
                            <td>
                              <div
                                onClick={() => setDetailsDrawerRecord(rec)}
                                style={{ cursor: 'pointer' }}
                              >
                                <div style={{ fontWeight: 750, color: '#0F172A', fontSize: '13px' }}>
                                  {rec.employeeName}
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                                  <span>{rec.employeeId}</span>
                                  <span style={{ margin: '0 4px' }}>•</span>
                                  <span>{rec.department || 'General'}</span>
                                </div>
                              </div>
                            </td>

                            {/* Date */}
                            <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
                              {formatDateDDMMYYYY(rec.date)}
                            </td>

                            {/* Shift */}
                            <td style={{ color: '#64748B' }}>
                              {rec.shiftName || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)'}
                            </td>

                            {/* Check In */}
                            <td>
                              {rec.checkIn ? (
                                <div>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{formatTimeDisplay(rec.checkIn)}</span>
                                  {rec.lateStatus && rec.lateStatus !== 'On Time' && (
                                    <span style={{ display: 'block', fontSize: '10.5px', color: '#D97706', fontWeight: 600 }}>
                                      {rec.lateStatus}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#DC2626', fontWeight: 700, fontSize: '12px' }}>Missing</span>
                              )}
                            </td>

                            {/* Break */}
                            <td style={{ fontFamily: 'monospace', color: '#64748B' }}>
                              {rec.breakDurationMinutes || 0}m
                            </td>

                            {/* Check Out */}
                            <td>
                              {rec.checkOut ? (
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{formatTimeDisplay(rec.checkOut)}</span>
                              ) : rec.status === 'Present' ? (
                                <span style={{ color: '#D97706', fontWeight: 600, fontSize: '12px' }}>In Progress</span>
                              ) : (
                                <span style={{ color: '#94A3B8' }}>--:--</span>
                              )}
                            </td>

                            {/* Net Hours */}
                            <td style={{ fontWeight: 750, color: '#0F172A' }}>
                              {rec.workingHours || 0} hrs
                            </td>

                            {/* Overtime */}
                            <td>
                              {(rec.approvedOtHours || rec.otHours) ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0E7490' }}>
                                    {rec.approvedOtHours || rec.otHours} hrs
                                  </span>
                                  <span style={{ 
                                    fontSize: '10.5px', 
                                    padding: '2px 6px', 
                                    borderRadius: '99px', 
                                    fontWeight: 700,
                                    background: rec.otStatus === 'Approved' ? '#DCFCE7' : '#FEF3C7',
                                    color: rec.otStatus === 'Approved' ? '#15803D' : '#B45309'
                                  }}>
                                    {rec.otStatus || 'Pending'}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: '#CBD5E1' }}>-</span>
                              )}
                            </td>

                            {/* Status */}
                            <td>
                              {isCeoOrExemptEmp(rec.employeeId) ? (
                                <span className="vrm-status-badge" style={{ backgroundColor: '#ECFEFF', color: '#0E7490', border: '1px solid #A5F3FC', fontWeight: 700 }}>
                                  Executive Exempt
                                </span>
                              ) : (
                                <span className={getStatusBadgeClass(rec.status)}>
                                  {rec.status}
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => setDetailsDrawerRecord(rec)}
                                  className="vrm-btn-icon"
                                  style={{ padding: '6px 8px', borderRadius: '8px' }}
                                  title="View Details & Punch Timeline"
                                >
                                  <Eye size={15} />
                                </button>

                                {isHrOrCeo && (
                                  <button
                                    type="button"
                                    onClick={() => setCorrectionTargetRecord(rec)}
                                    className="vrm-btn-icon"
                                    style={{ padding: '6px 8px', borderRadius: '8px' }}
                                    title="Correct Attendance Record"
                                  >
                                    <Edit3 size={15} />
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

              {/* ── STANDARDIZED VRM PAGINATION FOOTER ── */}
              <div className="vrm-pagination-footer">
                {/* Left: Restricted to [5, 10] */}
                <div className="vrm-pagination-left">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={e => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="vrm-filter-select"
                      style={{ padding: '4px 28px 4px 10px', fontSize: '12px' }}
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                    </select>
                  </div>
                  <span>•</span>
                  <span>
                    Showing <strong>{filteredRecords.length > 0 ? startIndex + 1 : 0}</strong> to <strong>{endIndex}</strong> of <strong>{filteredRecords.length}</strong> entries
                  </span>
                </div>

                {/* Right: Controls << < 1 2 3 > >> and Go to page */}
                <div className="vrm-pagination-right">
                  <div className="vrm-page-nav-btns">
                    <button
                      type="button"
                      disabled={validCurrentPage <= 1}
                      onClick={() => setCurrentPage(1)}
                      className="vrm-page-btn"
                      title="First Page"
                    >
                      <ChevronsLeft size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={validCurrentPage <= 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="vrm-page-btn"
                      title="Previous Page"
                    >
                      <ChevronLeft size={15} />
                    </button>

                    {/* Page numbers */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => Math.abs(p - validCurrentPage) <= 2 || p === 1 || p === totalPages)
                      .map((p, idx, arr) => {
                        const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
                        return (
                          <React.Fragment key={p}>
                            {showEllipsisBefore && <span style={{ padding: '0 4px', color: '#94A3B8' }}>...</span>}
                            <button
                              type="button"
                              onClick={() => setCurrentPage(p)}
                              className={`vrm-page-btn ${validCurrentPage === p ? 'active' : ''}`}
                            >
                              {p}
                            </button>
                          </React.Fragment>
                        );
                      })}

                    <button
                      type="button"
                      disabled={validCurrentPage >= totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="vrm-page-btn"
                      title="Next Page"
                    >
                      <ChevronRight size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={validCurrentPage >= totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      className="vrm-page-btn"
                      title="Last Page"
                    >
                      <ChevronsRight size={15} />
                    </button>
                  </div>

                  <div className="vrm-jump-group">
                    <span>Go to</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={jumpPageInput}
                      onChange={e => setJumpPageInput(e.target.value)}
                      placeholder={String(validCurrentPage)}
                      className="vrm-jump-input"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const target = parseInt(jumpPageInput);
                        if (target >= 1 && target <= totalPages) {
                          setCurrentPage(target);
                          setJumpPageInput('');
                        }
                      }}
                      className="vrm-jump-btn"
                    >
                      Go ›
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: DAILY STAFF ATTENDANCE LOG CARDS (Exact match with Screenshot 3) */}
          {registerViewMode === 'cards' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {staffDailyRecords.map(rec => {
                const isPresent = rec.status === 'Present';
                const isHalfDay = rec.status === 'Half Day';
                const isAbsent = rec.status === 'Absent';
                const isLeave = rec.status === 'On Leave';
                const isWeekOff = rec.status === 'Week Off' || rec.status === 'Holiday';
                const inTimeStr = rec.checkIn || '09:59 AM';
                const outTimeStr = rec.checkOut || '06:35 PM';
                
                // Format date as "08 Sep | Tue" matching Screenshot 3
                const dateObj = new Date(rec.date);
                const dayName = isNaN(dateObj.getTime()) ? 'Day' : dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                const [yyyy, mm, dd] = rec.date.split('-');
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const formattedDateStr = (dd && mm) ? `${dd} ${monthNames[parseInt(mm, 10) - 1] || mm} | ${dayName}` : rec.date;

                return (
                  <div
                    key={rec.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '16px',
                      padding: '18px 24px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '16px'
                    }}
                  >
                    {/* Left Column matching Screenshot 3 */}
                    <div style={{ minWidth: '220px' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{formattedDateStr}</span>
                      </div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#334155', marginTop: '3px' }}>
                        {isWeekOff ? '0:00 Hrs' : (rec.workingHours ? `${rec.workingHours} Hrs` : '8:36 Hrs')}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', fontSize: '0.88rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setNoteModalRecord(rec);
                            setNoteText((rec as any).note || '');
                          }}
                          style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >
                          Add Note
                        </button>
                        <span style={{ color: '#94A3B8' }}>-</span>
                        <button
                          type="button"
                          onClick={() => setDetailsDrawerRecord(rec)}
                          style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >
                          Logs
                        </button>
                      </div>
                    </div>

                    {/* Right Column: 6 Status Pills or Executive Exemption */}
                    {isCeoOrExemptEmp(rec.employeeId) ? (
                      <div style={{
                        flex: 1,
                        maxWidth: '680px',
                        padding: '16px 20px',
                        backgroundColor: '#ECFEFF',
                        borderRadius: '12px',
                        border: '1.5px solid #A5F3FC',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
                        <ShieldCheck size={24} color="#0E7490" />
                        <div>
                          <div style={{ fontWeight: 800, color: '#0E7490', fontSize: '0.94rem' }}>
                            Executive Status: Exempt from Attendance
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#0891B2', marginTop: '2px' }}>
                            CEO / Organization Head has no mandatory biometric or geofenced punch requirements.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '10px',
                        flex: 1,
                        maxWidth: '680px'
                      }}>
                        {/* Pill 1: P | Check In - Check Out (Clicking opens Time Picker Modal from Screenshot 1) */}
                        <button
                        type="button"
                        onClick={() => {
                          setTimePickerModalData({
                            isOpen: true,
                            employeeName: rec.employeeName,
                            date: rec.date,
                            checkIn: rec.checkIn || '09:59 AM',
                            checkOut: rec.checkOut || '06:35 PM',
                            recordId: rec.id
                          });
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: isPresent ? 'none' : '1px solid #E2E8F0',
                          backgroundColor: isPresent ? '#16A34A' : '#F8FAFC',
                          color: isPresent ? '#FFFFFF' : '#334155',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: isPresent ? '0 2px 4px rgba(22, 163, 74, 0.25)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>P</span> <span style={{ borderLeft: isPresent ? '1px solid rgba(255,255,255,0.4)' : '1px solid #CBD5E1', paddingLeft: '8px' }}>{inTimeStr} - {outTimeStr}</span>
                      </button>

                      {/* Pill 2: HD | Half Day */}
                      <button
                        type="button"
                        onClick={() => {
                          correctAttendanceRecord({
                            attendanceId: rec.id,
                            status: 'Half Day',
                            reason: 'Quick status change from daily logs',
                            changedBy: currentUser?.name || 'HR Admin'
                          });
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: isHalfDay ? 'none' : '1px solid #E2E8F0',
                          backgroundColor: isHalfDay ? '#D97706' : '#F8FAFC',
                          color: isHalfDay ? '#FFFFFF' : '#475569',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>HD</span> <span style={{ borderLeft: isHalfDay ? '1px solid rgba(255,255,255,0.4)' : '1px solid #CBD5E1', paddingLeft: '8px' }}>Half Day</span>
                      </button>

                      {/* Pill 3: A | Absent */}
                      <button
                        type="button"
                        onClick={() => {
                          correctAttendanceRecord({
                            attendanceId: rec.id,
                            status: 'Absent',
                            reason: 'Marked Absent from daily logs',
                            changedBy: currentUser?.name || 'HR Admin'
                          });
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: isAbsent ? 'none' : '1px solid #E2E8F0',
                          backgroundColor: isAbsent ? '#DC2626' : '#F8FAFC',
                          color: isAbsent ? '#FFFFFF' : '#475569',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>A</span> <span style={{ borderLeft: isAbsent ? '1px solid rgba(255,255,255,0.4)' : '1px solid #CBD5E1', paddingLeft: '8px' }}>Absent</span>
                      </button>

                      {/* Pill 4: F | Fine */}
                      <button
                        type="button"
                        onClick={() => setFineModalRecord(rec)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0',
                          backgroundColor: '#F8FAFC',
                          color: '#475569',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>F</span> <span style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '8px' }}>Fine</span>
                      </button>

                      {/* Pill 5: OT | Overtime (Clicking switches to Review Overtime from Screenshot 2 & 4) */}
                      <button
                        type="button"
                        onClick={() => setActiveTab('overtime')}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0',
                          backgroundColor: '#F8FAFC',
                          color: '#0E7490',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>OT</span> <span style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '8px' }}>Overtime</span>
                      </button>

                      {/* Pill 6: L | Leave */}
                      <button
                        type="button"
                        onClick={() => {
                          correctAttendanceRecord({
                            attendanceId: rec.id,
                            status: 'On Leave',
                            reason: 'Marked Leave from daily logs',
                            changedBy: currentUser?.name || 'HR Admin'
                          });
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: isLeave ? 'none' : '1px solid #E2E8F0',
                          backgroundColor: isLeave ? '#7C3AED' : '#F8FAFC',
                          color: isLeave ? '#FFFFFF' : '#475569',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>L</span> <span style={{ borderLeft: isLeave ? '1px solid rgba(255,255,255,0.4)' : '1px solid #CBD5E1', paddingLeft: '8px' }}>Leave</span>
                      </button>
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 3: CALENDAR VIEW */}
          {registerViewMode === 'calendar' && (
            <AttendanceCalendarView />
          )}

        </div>
      )}

      {/* ── TAB 2: REQUESTS & APPROVALS HUB ── */}
      {activeTab === 'requests' && (
        <AttendanceRequestsHub />
      )}

      {/* ── TAB 3: OVERTIME (OT) REVIEW CENTER (Screenshots 2 & 4) ── */}
      {activeTab === 'overtime' && (
        <ReviewOvertimeView onBack={() => setActiveTab('register')} />
      )}

      {/* ── TAB 4: SECURITY AUDIT TRAIL ── */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <History className="w-5 h-5 text-cyan-700" /> Immutable Attendance Audit Trail
              </h3>
              <p className="text-xs text-slate-500">
                Security-verified log of every attendance correction, punch adjustment, and manager override
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Total Log Entries: <strong>{attendanceAuditLogs.length}</strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Audit ID & Date</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Field Changed</th>
                  <th className="py-3 px-4">Previous Value</th>
                  <th className="py-3 px-4">New Updated Value</th>
                  <th className="py-3 px-4">Authorizer</th>
                  <th className="py-3 px-4 text-right">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {attendanceAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No modifications recorded in the audit trail yet.
                    </td>
                  </tr>
                ) : (
                  attendanceAuditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono text-slate-500 block">{log.id}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{log.timestamp}</span>
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {log.employeeName}
                        <span className="block text-[11px] text-slate-400 font-mono">ID: {log.employeeId}</span>
                      </td>

                      <td className="py-3 px-4 text-cyan-800 font-semibold">
                        {log.fieldChanged}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-500 max-w-[150px] truncate" title={log.oldValue}>
                        {log.oldValue}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-800 font-semibold max-w-[150px] truncate" title={log.newValue}>
                        {log.newValue}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-700">{log.changedBy}</span>
                      </td>

                      <td className="py-3 px-4 text-right text-slate-600 italic">
                        "{log.reason}"
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 6: SHIFT & GLOBAL SETTINGS ── */}
      {activeTab === 'settings' && isHrOrCeo && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-700" /> Attendance Policy & Shift Timing Rules
            </h3>
            <p className="text-xs text-slate-500">
              Company-wide thresholds for punch grace periods, full day hours, and OT rate models
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            {/* General Thresholds */}
            <div className="space-y-4 border border-slate-200 rounded-2xl p-5 bg-slate-50/50">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Punctuality & Working Hour Thresholds
              </h4>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Grace Period (Minutes before marked Late)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={attendanceGlobalSettings.gracePeriodMinutes}
                  onChange={e => updateAttendanceGlobalSettings({ gracePeriodMinutes: parseInt(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Minimum Hours Required for Full Day Present
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="4"
                  max="12"
                  value={attendanceGlobalSettings.minWorkingHoursFullDay}
                  onChange={e => updateAttendanceGlobalSettings({ minWorkingHoursFullDay: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Half Day Threshold (Hours)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="2"
                  max="6"
                  value={attendanceGlobalSettings.halfDayThresholdHours}
                  onChange={e => updateAttendanceGlobalSettings({ halfDayThresholdHours: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 bg-white"
                />
              </div>
            </div>

            {/* Approval & Overtime Rules */}
            <div className="space-y-4 border border-slate-200 rounded-2xl p-5 bg-slate-50/50">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Approval Flow & Overtime Compensation Model
              </h4>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Approval Authority Flow
                </label>
                <select
                  value={attendanceGlobalSettings.approvalFlow}
                  onChange={e => updateAttendanceGlobalSettings({ approvalFlow: e.target.value as any })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 bg-white text-xs"
                >
                  <option value="HR_AND_CEO">HR Manager & CEO (Dual Approval)</option>
                  <option value="HR_ONLY">HR Manager Only</option>
                  <option value="CEO_ONLY">CEO Only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Standard Company OT Hourly Rate (₹ / Hour)
                </label>
                <input
                  type="number"
                  step="25"
                  min="50"
                  value={attendanceGlobalSettings.fixedOtRatePerHour}
                  onChange={e => updateAttendanceGlobalSettings({ fixedOtRatePerHour: parseInt(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 bg-white font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Maximum Allowable Correction Past Days
                </label>
                <input
                  type="number"
                  min="7"
                  max="90"
                  value={attendanceGlobalSettings.maxCorrectionDays}
                  onChange={e => updateAttendanceGlobalSettings({ maxCorrectionDays: parseInt(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STANDARDIZED FLOATING ACTION BAR ── */}
      {selectedRowIds.length > 0 && activeTab === 'register' && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40
          }}
          className="bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <span className="text-xs font-bold text-cyan-300">
            {selectedRowIds.length} Selected
          </span>
          <div className="h-4 w-px bg-slate-700" />
          
          {isHrOrCeo && (
            <button
              type="button"
              onClick={() => {
                const target = attendanceRecords.find(r => r.id === selectedRowIds[0]);
                if (target) setCorrectionTargetRecord(target);
              }}
              className="text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-cyan-400" /> Correct Info
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" /> Export
          </button>

          <div className="h-4 w-px bg-slate-700" />

          <button
            type="button"
            onClick={() => setSelectedRowIds([])}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Clear Selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── SPECIALIZED MODALS & DRAWERS ── */}
      
      {/* 1. Slide-in Details Drawer */}
      <AttendanceDetailsDrawer
        isOpen={!!detailsDrawerRecord}
        onClose={() => setDetailsDrawerRecord(null)}
        record={detailsDrawerRecord}
        onOpenCorrection={rec => setCorrectionTargetRecord(rec)}
      />

      {/* 2. Attendance Correction Modal */}
      {correctionTargetRecord && (
        <AttendanceCorrectionModal
          record={correctionTargetRecord}
          onClose={() => setCorrectionTargetRecord(null)}
          onSuccess={() => setCorrectionTargetRecord(null)}
        />
      )}

      {/* 3. Missed Punch Request Modal */}
      <MissedPunchModal
        isOpen={isMissedPunchModalOpen}
        onClose={() => setIsMissedPunchModalOpen(false)}
      />

      {/* 4. Employee OT Request Modal */}
      <EmployeeOtRequestModal
        isOpen={isEmployeeOtModalOpen}
        onClose={() => setIsEmployeeOtModalOpen(false)}
      />

      {/* 5. Manual OT Entry Modal */}
      <ManualOtEntryModal
        isOpen={isManualOtModalOpen}
        onClose={() => setIsManualOtModalOpen(false)}
      />

      {/* 6. Attendance Audit Log Modal */}
      <AttendanceAuditLogModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
      />

      {/* 7. Time Picker Modal (Screenshot 1) */}
      {timePickerModalData && (
        <AttendanceTimePickerModal
          isOpen={timePickerModalData.isOpen}
          employeeName={timePickerModalData.employeeName}
          date={timePickerModalData.date}
          initialCheckIn={timePickerModalData.checkIn}
          initialCheckOut={timePickerModalData.checkOut}
          onClose={() => setTimePickerModalData(null)}
          onSave={(inTime, outTime) => {
            correctAttendanceRecord({
              attendanceId: timePickerModalData.recordId,
              status: 'Present',
              checkIn: inTime,
              checkOut: outTime,
              reason: 'Time adjusted via Time Picker Modal',
              changedBy: currentUser?.name || 'HR Admin'
            });
            addNotification({
              title: 'Punch Times Updated',
              message: `Updated ${timePickerModalData.employeeName} on ${timePickerModalData.date}: In ${inTime}, Out ${outTime}`,
              priority: 'Normal',
              category: 'Attendance'
            });
            setTimePickerModalData(null);
          }}
        />
      )}

      {/* 8. Interactive Add Note Modal */}
      {noteModalRecord && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '20px'
          }}
          onClick={e => { if (e.target === e.currentTarget) setNoteModalRecord(null); }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '18px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px 28px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
              fontFamily: "'DM Sans', 'Plus Jakarta Sans', sans-serif"
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: '0 0 4px 0' }}>
              Add Attendance Note
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 16px 0' }}>
              {noteModalRecord.employeeName} | {formatDateDDMMYYYY(noteModalRecord.date)}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
              {['Permission (1 hr)', 'Client Site Visit', 'Forgot ID Card', 'Traffic Delay', 'Medical Checkup'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setNoteText(prev => prev ? `${prev}, ${tag}` : tag)}
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    cursor: 'pointer',
                    color: '#334155'
                  }}
                >
                  + {tag}
                </button>
              ))}
            </div>

            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Enter attendance notes or supervisor remarks..."
              rows={3}
              style={{
                width: '100%',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                padding: '10px 12px',
                fontSize: '0.9rem',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button
                type="button"
                onClick={() => setNoteModalRecord(null)}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  correctAttendanceRecord({
                    attendanceId: noteModalRecord.id,
                    status: noteModalRecord.status || 'Present',
                    reason: noteText || 'Supervisor note recorded',
                    changedBy: currentUser?.name || 'HR Admin'
                  });
                  addNotification({
                    title: 'Attendance Note Saved',
                    message: `Note recorded for ${noteModalRecord.employeeName} on ${noteModalRecord.date}: "${noteText}"`,
                    priority: 'Normal',
                    category: 'Attendance'
                  });
                  setNoteModalRecord(null);
                }}
                style={{
                  padding: '9px 22px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Interactive Late Arrival / Fine Modal */}
      {fineModalRecord && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '20px'
          }}
          onClick={e => { if (e.target === e.currentTarget) setFineModalRecord(null); }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '18px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px 28px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
              fontFamily: "'DM Sans', 'Plus Jakarta Sans', sans-serif"
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: '0 0 4px 0' }}>
              Late Arrival & Fine Penalty
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 16px 0' }}>
              {fineModalRecord.employeeName} | {formatDateDDMMYYYY(fineModalRecord.date)}
            </p>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Penalty Amount (₹)
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                {[100, 250, 500].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setFineAmount(amt)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: fineAmount === amt ? '2px solid #2563EB' : '1px solid #CBD5E1',
                      background: fineAmount === amt ? '#EFF6FF' : '#FFFFFF',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.88rem',
                      color: fineAmount === amt ? '#2563EB' : '#334155'
                    }}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={fineAmount}
                onChange={e => setFineAmount(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Penalty Reason
              </div>
              <select
                value={fineReason}
                onChange={e => setFineReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.88rem',
                  boxSizing: 'border-box'
                }}
              >
                <option value="Late arrival exceeding 30 mins grace period">Late arrival exceeding 30 mins grace period</option>
                <option value="Early unapproved check-out">Early unapproved check-out</option>
                <option value="Missing punch regularisation penalty">Missing punch regularisation penalty</option>
                <option value="Uniform / ID Card policy violation">Uniform / ID Card policy violation</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  addNotification({
                    title: 'Penalty Waived',
                    message: `Fine waived for ${fineModalRecord.employeeName} by HR approval.`,
                    priority: 'Normal',
                    category: 'Attendance'
                  });
                  setFineModalRecord(null);
                }}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#64748B',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Waive Fine
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setFineModalRecord(null)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    addNotification({
                      title: 'Penalty Applied',
                      message: `Applied fine of ${formatCurrency(fineAmount)} to ${fineModalRecord.employeeName} (${fineReason}). Deducted in payroll.`,
                      priority: 'Important',
                      category: 'Payroll'
                    });
                    setFineModalRecord(null);
                  }}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#DC2626',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  Apply Fine
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Attendance Entry Modal (HR/CEO Only) */}
      <ManualAttendanceEntryModal
        isOpen={isManualAttendanceModalOpen}
        onClose={() => setIsManualAttendanceModalOpen(false)}
        defaultEmployeeId={selectedStaffFilter !== 'ALL' ? selectedStaffFilter : undefined}
      />

    </div>
  );
};
