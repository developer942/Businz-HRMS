import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useHRMS } from '../../context/HRMSContext';
import {
  FileText,
  Search,
  Calendar,
  Download,
  FileSpreadsheet,
  Eye,
  RotateCcw,
  ChevronDown,
  SlidersHorizontal,
  X,
  LayoutList,
  Table as TableIcon
} from 'lucide-react';
import { formatDateDDMMYYYY, formatDateDayMonthYear } from '../../utils/dateUtils';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { preventSpaceEnterPropagation } from '../../utils/keyboardUtils';
import type { TaskAssigneeStatus } from '../../types/tasks';

interface Props {
  onViewTask: (taskId: string) => void;
}

export interface FlattenedDailyReportRow {
  reportId: string;
  taskId: string;
  taskNumber: string;
  taskTitle: string;
  taskCategory: string;
  taskDepartment: string;
  assignedByName: string;
  responsiblePersonName: string;
  employeeId: string;
  employeeName: string;
  employeeDepartment: string;
  reportDate: string;
  workDoneToday: string;
  processStatus: TaskAssigneeStatus;
  progressPercentage: number;
  submittedAt: string;
}

export const DailyTaskReportManagement: React.FC<Props> = ({ onViewTask }) => {
  const { enhancedTasks, employees, departments, currentUser, addTaskDailyReport, updateAssigneeProgress } = useHRMS();

  const [showAddReportModal, setShowAddReportModal] = useState(false);
  const [newReportTaskId, setNewReportTaskId] = useState<string>('');
  const [newReportDate, setNewReportDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [newReportStatus, setNewReportStatus] = useState<'Pending' | 'In Process' | 'Under Review' | 'Completed'>('In Process');
  const [newReportWorkDone, setNewReportWorkDone] = useState<string>('');

  const currentEmpRecord = useMemo(() => {
    return employees.find(
      e =>
        e.employeeId === currentUser.employeeId ||
        e.id === currentUser.id ||
        (e.email && currentUser.email && e.email.toLowerCase() === currentUser.email.toLowerCase()) ||
        `${e.firstName} ${e.lastName}`.toLowerCase() === currentUser.name.toLowerCase()
    );
  }, [employees, currentUser]);

  const isManagerOrAdmin = useMemo(() => {
    if (
      currentUser.role === 'Super Admin' ||
      currentUser.role === 'CEO' ||
      currentUser.role === 'HR' ||
      currentUser.role === 'Manager'
    ) {
      return true;
    }
    const desig = (currentEmpRecord?.designation || currentUser.designation || '').toLowerCase();
    return desig.includes('head') || desig.includes('manager') || desig.includes('lead') || desig.includes('director');
  }, [currentUser, currentEmpRecord]);

  const [reportScope, setReportScope] = useState<'all' | 'my_reports' | 'team_reports'>(
    isManagerOrAdmin ? 'all' : 'my_reports'
  );
  const [desktopViewMode, setDesktopViewMode] = useState<'timeline' | 'table'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [showMobileFilterSheet, setShowMobileFilterSheet] = useState(false);
  const [tempStatus, setTempStatus] = useState<string>('All');
  const [tempDepartment, setTempDepartment] = useState<string>('All');
  const [tempDateFrom, setTempDateFrom] = useState<string>('');
  const [tempDateTo, setTempDateTo] = useState<string>('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReportScope(isManagerOrAdmin ? 'all' : 'my_reports');
  }, [currentUser.id, currentUser.role, isManagerOrAdmin]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const matchesCurrentUser = (idOrCode?: string, name?: string) => {
    if (idOrCode) {
      if (idOrCode === currentUser.employeeId || idOrCode === currentUser.id) return true;
      if (currentEmpRecord && (idOrCode === currentEmpRecord.employeeId || idOrCode === currentEmpRecord.id)) return true;
    }
    if (name) {
      const target = name.trim().toLowerCase();
      if (target === currentUser.name.trim().toLowerCase()) return true;
      if (
        currentEmpRecord &&
        target === `${currentEmpRecord.firstName} ${currentEmpRecord.lastName}`.trim().toLowerCase()
      )
        return true;
    }
    return false;
  };

  const allReportRows = useMemo<FlattenedDailyReportRow[]>(() => {
    const rows: FlattenedDailyReportRow[] = [];

    enhancedTasks.forEach(task => {
      if (!task.dailyReports || task.dailyReports.length === 0) return;

      const isUserInvolvedInTask =
        task.assignees.some(a => matchesCurrentUser(a.employeeId, a.employeeName)) ||
        matchesCurrentUser(task.responsiblePersonId, task.responsiblePersonName) ||
        matchesCurrentUser(task.assignedById, task.assignedByName);

      if (!isManagerOrAdmin && !isUserInvolvedInTask) return;

      task.dailyReports.forEach(dlr => {
        rows.push({
          reportId: dlr.id,
          taskId: task.id,
          taskNumber: task.taskNumber,
          taskTitle: task.title,
          taskCategory: task.taskCategory || 'General Administration',
          taskDepartment: task.department,
          assignedByName: task.assignedByName || 'Manager',
          responsiblePersonName: task.responsiblePersonName || 'Unassigned',
          employeeId: dlr.employeeId,
          employeeName: dlr.employeeName,
          employeeDepartment: dlr.employeeDepartment || task.department,
          reportDate: dlr.reportDate,
          workDoneToday: dlr.workDoneToday,
          processStatus: dlr.processStatus,
          progressPercentage: dlr.progressPercentage ?? 0,
          submittedAt: dlr.submittedAt || ''
        });
      });
    });

    return rows.sort((a, b) => {
      if (b.reportDate !== a.reportDate) return b.reportDate.localeCompare(a.reportDate);
      return (b.submittedAt || '').localeCompare(a.submittedAt || '');
    });
  }, [enhancedTasks, currentUser, currentEmpRecord, isManagerOrAdmin]);

  const filteredReports = useMemo(() => {
    return allReportRows.filter(row => {
      if (reportScope === 'my_reports') {
        if (!matchesCurrentUser(row.employeeId, row.employeeName)) return false;
      } else if (reportScope === 'team_reports') {
        const isMyOwn = matchesCurrentUser(row.employeeId, row.employeeName);
        if (!isManagerOrAdmin && isMyOwn) return false;
      }

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesTaskNo = row.taskNumber.toLowerCase().includes(q);
        const matchesTaskTitle = row.taskTitle.toLowerCase().includes(q);
        const matchesEmp = row.employeeName.toLowerCase().includes(q);
        const matchesWork = row.workDoneToday.toLowerCase().includes(q);
        const matchesDept = row.employeeDepartment.toLowerCase().includes(q);
        if (!matchesTaskNo && !matchesTaskTitle && !matchesEmp && !matchesWork && !matchesDept) return false;
      }

      if (selectedDepartment !== 'All' && row.employeeDepartment !== selectedDepartment && row.taskDepartment !== selectedDepartment) {
        return false;
      }

      if (selectedEmployee !== 'All') {
        const empObj = employees.find(e => e.employeeId === selectedEmployee || e.id === selectedEmployee);
        const empFullName = empObj ? `${empObj.firstName} ${empObj.lastName}`.trim().toLowerCase() : '';
        const matchesEmpFilter =
          row.employeeId === selectedEmployee ||
          (empObj && row.employeeId === empObj.id) ||
          (empFullName && row.employeeName.trim().toLowerCase() === empFullName);
        if (!matchesEmpFilter) return false;
      }

      if (selectedStatus !== 'All' && row.processStatus !== selectedStatus) {
        return false;
      }

      if (dateFrom && row.reportDate < dateFrom) return false;
      if (dateTo && row.reportDate > dateTo) return false;

      return true;
    });
  }, [
    allReportRows,
    reportScope,
    searchQuery,
    selectedDepartment,
    selectedEmployee,
    selectedStatus,
    dateFrom,
    dateTo,
    employees,
    isManagerOrAdmin
  ]);

  // Group filtered reports by reportDate for Screen 3 layout ("10 Nov 2026", "09 Nov 2026")
  const groupedByDate = useMemo(() => {
    const groups: { dateStr: string; formattedDate: string; items: FlattenedDailyReportRow[] }[] = [];
    const map = new Map<string, FlattenedDailyReportRow[]>();

    filteredReports.forEach(item => {
      const key = item.reportDate || 'Unknown';
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    });

    map.forEach((items, dateStr) => {
      groups.push({
        dateStr,
        formattedDate: formatDateDayMonthYear(dateStr),
        items
      });
    });

    return groups;
  }, [filteredReports]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reportScope, searchQuery, selectedDepartment, selectedEmployee, selectedStatus, dateFrom, dateTo]);

  const activeMobileFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStatus !== 'All') count++;
    if (selectedDepartment !== 'All') count++;
    if (dateFrom || dateTo) count++;
    return count;
  }, [selectedStatus, selectedDepartment, dateFrom, dateTo]);

  const openMobileFilter = () => {
    setTempStatus(selectedStatus);
    setTempDepartment(selectedDepartment);
    setTempDateFrom(dateFrom);
    setTempDateTo(dateTo);
    setShowMobileFilterSheet(true);
  };

  const applyMobileFilter = () => {
    setSelectedStatus(tempStatus);
    setSelectedDepartment(tempDepartment);
    setDateFrom(tempDateFrom);
    setDateTo(tempDateTo);
    setShowMobileFilterSheet(false);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedDepartment('All');
    setSelectedEmployee('All');
    setSelectedStatus('All');
    setDateFrom('');
    setDateTo('');
    setTempStatus('All');
    setTempDepartment('All');
    setTempDateFrom('');
    setTempDateTo('');
    setShowMobileFilterSheet(false);
  };

  const totalEntries = filteredReports.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const paginatedReports = filteredReports.slice(startIndex, startIndex + rowsPerPage);

  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, safeCurrentPage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const handleJumpToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      setJumpPageInput('');
    }
  };

  const handleExportReports = (type: 'excel' | 'pdf') => {
    setShowExportMenu(false);

    if (filteredReports.length === 0) {
      alert('No daily task reports available to export for the current filters.');
      return;
    }

    const columns = [
      { header: 'Report Date', key: 'reportDateFormatted' },
      { header: 'Employee Name', key: 'employeeName' },
      { header: 'Department', key: 'employeeDepartment' },
      { header: 'Task No', key: 'taskNumber' },
      { header: 'Task Title', key: 'taskTitle' },
      { header: 'Assigned By', key: 'assignedByName' },
      { header: 'Work Done / Daily Update', key: 'workDoneToday' },
      { header: 'Stage Status', key: 'processStatus' },
      { header: 'Progress', key: 'progressFormatted' }
    ];

    const data = filteredReports.map(r => ({
      ...r,
      reportDateFormatted: formatDateDDMMYYYY(r.reportDate),
      progressFormatted: `${r.progressPercentage}%`
    }));

    const timestamp = new Date().toISOString().split('T')[0];

    if (type === 'excel') {
      exportToExcel(data, columns, `VRM_Daily_Task_Reports_${timestamp}`);
    } else {
      exportToPDF(
        data,
        columns,
        'VRM Daily Task Report Register',
        `VRM_Daily_Task_Reports_${timestamp}`,
        `Generated by ${currentUser.name} (${currentUser.role}) • Total Reports: ${filteredReports.length}`
      );
    }
  };

  const getEmployeeAvatar = (empId: string, empName: string) => {
    const emp = employees.find(
      e =>
        e.employeeId === empId ||
        e.id === empId ||
        `${e.firstName} ${e.lastName}`.trim().toLowerCase() === empName.trim().toLowerCase()
    );
    if (emp?.avatar) {
      return (
        <img
          src={emp.avatar}
          alt={empName}
          style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      );
    }
    const initials = empName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('');
    return (
      <div
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: '#0F172A',
          color: '#FFFFFF',
          fontSize: '0.62rem',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {initials || 'U'}
      </div>
    );
  };

  const renderDateGroupedFeed = () => {
    if (groupedByDate.length === 0) {
      return (
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '42px 20px',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#ECFEFF',
              color: '#0E7490',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 10px auto'
            }}
          >
            <FileText size={20} />
          </div>
          <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
            No Daily Reports Found
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
            Submit daily updates inside any task or adjust your filters.
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '12px' }}>
        {groupedByDate.map(group => (
          <div key={group.dateStr} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Date Pill Header (Matches Reference Image Screen 3: "10 Nov 2026", "09 Nov 2026") */}
            <div>
              <span
                style={{
                  display: 'inline-block',
                  background: '#E2E8F0',
                  color: '#0F172A',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  padding: '5px 14px',
                  borderRadius: '999px',
                  letterSpacing: '-0.01em'
                }}
              >
                {group.formattedDate}
              </span>
            </div>

            {/* Cards under this date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {group.items.map(row => (
                <div
                  key={row.reportId}
                  onClick={() => onViewTask(row.taskId)}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  {/* Line 1: TSK-2026-011 • HRMS Corrections */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.3 }}>
                      <span style={{ color: '#0E7490', fontWeight: 800 }}>{row.taskNumber}</span>
                      <span style={{ color: '#94A3B8', margin: '0 6px' }}>•</span>
                      <span style={{ color: '#0F172A', fontWeight: 800 }}>{row.taskTitle}</span>
                    </div>

                    <span
                      className="desktop-only-inline"
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2.5px 9px',
                        borderRadius: '999px',
                        background:
                          row.processStatus === 'Completed'
                            ? '#DCFCE7'
                            : row.processStatus === 'In Process'
                              ? '#E0F2FE'
                              : '#F1F5F9',
                        color:
                          row.processStatus === 'Completed'
                            ? '#15803D'
                            : row.processStatus === 'In Process'
                              ? '#0284C7'
                              : '#475569'
                      }}
                    >
                      {row.processStatus}
                    </span>
                  </div>

                  {/* Line 2: Avatar + Employee Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {getEmployeeAvatar(row.employeeId, row.employeeName)}
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                      {row.employeeName}
                    </span>
                    {row.employeeDepartment && (
                      <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 500 }}>
                        • {row.employeeDepartment}
                      </span>
                    )}
                  </div>

                  {/* Line 3: Work Done Body */}
                  <div
                    style={{
                      fontSize: '0.84rem',
                      color: '#334155',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-line',
                      paddingTop: '2px'
                    }}
                  >
                    {row.workDoneToday}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
      {/* ============================================================ */}
      {/* DESKTOP FILTER & CONTROLS BAR                                */}
      {/* ============================================================ */}
      <div
        className="desktop-only-block"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '12px 14px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          {/* Left: Scope Pill Tabs + Search + Dropdowns */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
            <div
              style={{
                display: 'inline-flex',
                background: '#F1F5F9',
                padding: '3px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0'
              }}
            >
              {[
                ...(isManagerOrAdmin ? [{ id: 'all', label: 'All' }] : []),
                { id: 'my_reports', label: 'My Reports' },
                { id: 'team_reports', label: 'Team' }
              ].map(tab => {
                const isActive = reportScope === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setReportScope(tab.id as any)}
                    style={{
                      height: '30px',
                      padding: '0 12px',
                      borderRadius: '7px',
                      border: 'none',
                      background: isActive ? '#0E7490' : 'transparent',
                      color: isActive ? '#FFFFFF' : '#475569',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '280px' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94A3B8',
                  pointerEvents: 'none'
                }}
              />
              <input
                type="text"
                placeholder="Search task, employee, work..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={preventSpaceEnterPropagation}
                style={{
                  width: '100%',
                  height: '36px',
                  paddingLeft: '32px',
                  paddingRight: '10px',
                  borderRadius: '9px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  fontSize: '0.8rem',
                  color: '#0F172A',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <select
              value={selectedDepartment}
              onChange={e => setSelectedDepartment(e.target.value)}
              style={{
                height: '36px',
                padding: '0 10px',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '9px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>

            {isManagerOrAdmin && (
              <select
                value={selectedEmployee}
                onChange={e => setSelectedEmployee(e.target.value)}
                style={{
                  height: '36px',
                  padding: '0 10px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  borderRadius: '9px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  color: '#334155',
                  cursor: 'pointer',
                  maxWidth: '170px'
                }}
              >
                <option value="All">All Employees</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.employeeId}>
                    {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </select>
            )}

            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              title="From Date"
              style={{
                height: '36px',
                padding: '0 8px',
                fontSize: '0.76rem',
                borderRadius: '9px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                color: '#334155'
              }}
            />

            {(searchQuery || selectedDepartment !== 'All' || selectedEmployee !== 'All' || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={handleResetFilters}
                style={{
                  height: '36px',
                  padding: '0 10px',
                  borderRadius: '9px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  color: '#64748B',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <RotateCcw size={12} /> Reset
              </button>
            )}
          </div>

          {/* Right: Add Daily Report + View Switcher (Timeline vs Table) + Export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                if (!newReportTaskId && enhancedTasks.length > 0) {
                  setNewReportTaskId(enhancedTasks[0].id);
                }
                setShowAddReportModal(true);
              }}
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: '9px',
                border: 'none',
                background: '#0E7490',
                color: '#FFFFFF',
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.2)'
              }}
            >
              <span>+ Add Daily Report</span>
            </button>
            <div
              style={{
                display: 'inline-flex',
                background: '#F1F5F9',
                padding: '3px',
                borderRadius: '9px',
                border: '1px solid #E2E8F0'
              }}
            >
              <button
                type="button"
                onClick={() => setDesktopViewMode('timeline')}
                title="Grouped Timeline View"
                style={{
                  height: '30px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: desktopViewMode === 'timeline' ? '#FFFFFF' : 'transparent',
                  color: desktopViewMode === 'timeline' ? '#0E7490' : '#64748B',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  boxShadow: desktopViewMode === 'timeline' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                <LayoutList size={14} /> Cards
              </button>
              <button
                type="button"
                onClick={() => setDesktopViewMode('table')}
                title="Table View"
                style={{
                  height: '30px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: desktopViewMode === 'table' ? '#FFFFFF' : 'transparent',
                  color: desktopViewMode === 'table' ? '#0E7490' : '#64748B',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  boxShadow: desktopViewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                <TableIcon size={14} /> Table
              </button>
            </div>

            <div ref={exportMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowExportMenu(prev => !prev)}
                style={{
                  height: '36px',
                  padding: '0 12px',
                  borderRadius: '9px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  color: '#0E7490',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <Download size={14} />
                <span>Export</span>
                <ChevronDown size={13} />
              </button>

              {showExportMenu && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 6px)',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.12)',
                    minWidth: '185px',
                    zIndex: 100,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleExportReports('excel')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#1E293B',
                      textAlign: 'left',
                      width: '100%'
                    }}
                  >
                    <FileSpreadsheet size={16} color="#16A34A" />
                    <span>Export to Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportReports('pdf')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#1E293B',
                      textAlign: 'left',
                      width: '100%'
                    }}
                  >
                    <FileText size={16} color="#DC2626" />
                    <span>Export to PDF (.pdf)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MOBILE SEARCH + FILTER BAR                                   */}
      {/* ============================================================ */}
      <div className="mobile-only-block">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              placeholder="Search daily reports..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={preventSpaceEnterPropagation}
              style={{
                width: '100%',
                height: '40px',
                paddingLeft: '36px',
                paddingRight: searchQuery ? '30px' : '12px',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                fontSize: '0.84rem',
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box'
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
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  padding: '4px',
                  cursor: 'pointer',
                  display: 'flex'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!newReportTaskId && enhancedTasks.length > 0) {
                setNewReportTaskId(enhancedTasks[0].id);
              }
              setShowAddReportModal(true);
            }}
            style={{
              height: '40px',
              padding: '0 12px',
              borderRadius: '12px',
              border: 'none',
              background: '#0E7490',
              color: '#FFFFFF',
              fontSize: '0.76rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap'
            }}
          >
            + Report
          </button>
          <button
            type="button"
            onClick={openMobileFilter}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              border: activeMobileFilterCount > 0 ? '1px solid #0E7490' : '1px solid #E2E8F0',
              background: activeMobileFilterCount > 0 ? '#ECFEFF' : '#FFFFFF',
              color: activeMobileFilterCount > 0 ? '#0E7490' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              position: 'relative'
            }}
            title="Filter Daily Reports"
          >
            <SlidersHorizontal size={16} />
            {activeMobileFilterCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {activeMobileFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MOBILE VIEW: DATE-GROUPED DAILY REPORTS (Matches Screen 3)   */}
      {/* ============================================================ */}
      <div className="mobile-only-block">{renderDateGroupedFeed()}</div>

      {/* ============================================================ */}
      {/* DESKTOP VIEW: TIMELINE CARDS OR FITTED TABLE                 */}
      {/* ============================================================ */}
      <div className="desktop-only-block">
        {desktopViewMode === 'timeline' ? (
          renderDateGroupedFeed()
        ) : (
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
            }}
          >
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table className="hrms-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ width: '115px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Report Date
                    </th>
                    <th style={{ width: '190px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Employee
                    </th>
                    <th style={{ width: '24%', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Task ID &amp; Title
                    </th>
                    <th style={{ padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Work Done / Daily Update
                    </th>
                    <th style={{ width: '120px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Status
                    </th>
                    <th style={{ width: '80px', padding: '12px 12px', textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedReports.map(row => (
                    <tr
                      key={row.reportId}
                      onClick={() => onViewTask(row.taskId)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: '#FFFFFF'
                      }}
                    >
                      <td style={{ padding: '12px 12px', fontWeight: 700, color: '#0F172A', fontSize: '0.8rem' }}>
                        {formatDateDayMonthYear(row.reportDate)}
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {getEmployeeAvatar(row.employeeId, row.employeeName)}
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                color: '#0F172A',
                                fontSize: '0.8rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {row.employeeName}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{row.employeeDepartment}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px', minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: '#0E7490', fontSize: '0.76rem' }}>{row.taskNumber}</div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: '#0F172A',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {row.taskTitle}
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: '#334155',
                            lineHeight: 1.45,
                            whiteSpace: 'pre-line'
                          }}
                        >
                          {row.workDoneToday}
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3.5px 9px',
                            borderRadius: '999px',
                            background:
                              row.processStatus === 'Completed'
                                ? '#DCFCE7'
                                : row.processStatus === 'In Process'
                                  ? '#E0F2FE'
                                  : '#F1F5F9',
                            color:
                              row.processStatus === 'Completed'
                                ? '#15803D'
                                : row.processStatus === 'In Process'
                                  ? '#0284C7'
                                  : '#475569'
                          }}
                        >
                          {row.processStatus}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onViewTask(row.taskId);
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            background: '#F8FAFC',
                            color: '#0E7490',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Eye size={13} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Standardized Pagination Footer */}
            <div
              className="standard-pagination-footer"
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #E7ECF3',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                background: '#FAFCFF'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: '#64748B' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Rows per page:</span>
                  <select
                    value={rowsPerPage}
                    onChange={e => {
                      setRowsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="form-control"
                    style={{
                      width: '62px',
                      height: '30px',
                      padding: '2px 6px',
                      fontSize: '0.78rem',
                      borderRadius: '6px'
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                  </select>
                </div>
                <span>
                  Showing <strong>{totalEntries === 0 ? 0 : startIndex + 1}</strong> to{' '}
                  <strong>{Math.min(startIndex + rowsPerPage, totalEntries)}</strong> of <strong>{totalEntries}</strong>{' '}
                  entries
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={safeCurrentPage === 1}
                    onClick={() => setCurrentPage(1)}
                    style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '28px' }}
                  >
                    &lt;&lt;
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={safeCurrentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '28px' }}
                  >
                    &lt;
                  </button>
                  {getPageNumbers().map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCurrentPage(num)}
                      className="btn btn-sm"
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        minWidth: '30px',
                        backgroundColor: num === safeCurrentPage ? '#0E7490' : '#FFFFFF',
                        color: num === safeCurrentPage ? '#FFFFFF' : '#1E293B',
                        border: num === safeCurrentPage ? '1px solid #0E7490' : '1px solid #E2E8F0',
                        fontWeight: num === safeCurrentPage ? 700 : 500
                      }}
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '28px' }}
                  >
                    &gt;
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '28px' }}
                  >
                    &gt;&gt;
                  </button>
                </div>

                <form onSubmit={handleJumpToPage} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Go to page</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={jumpPageInput}
                    onChange={e => setJumpPageInput(e.target.value)}
                    onKeyDown={preventSpaceEnterPropagation}
                    className="form-control"
                    style={{
                      width: '48px',
                      height: '30px',
                      padding: '2px 6px',
                      fontSize: '0.78rem',
                      textAlign: 'center',
                      borderRadius: '6px'
                    }}
                  />
                  <button
                    type="submit"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '4px 10px', fontSize: '0.75rem', height: '30px' }}
                  >
                    Go &rsaquo;
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Sheet Filter Modal */}
      {showMobileFilterSheet &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="mobile-bottom-sheet-backdrop" onClick={() => setShowMobileFilterSheet(false)}>
            <div className="mobile-bottom-sheet-panel" onClick={e => e.stopPropagation()}>
              <div className="mobile-bottom-sheet-handle" />
              <div className="mobile-bottom-sheet-header">
                <span className="mobile-bottom-sheet-title">Filter Daily Reports</span>
                <button
                  type="button"
                  onClick={() => setShowMobileFilterSheet(false)}
                  style={{ background: 'none', border: 'none', color: '#64748B', padding: '4px', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mobile-bottom-sheet-body">
                <div>
                  <div className="mobile-filter-group-title">Report Scope</div>
                  <div className="mobile-filter-chips-grid">
                    {[
                      ...(isManagerOrAdmin ? [{ id: 'all', label: 'All Reports' }] : []),
                      { id: 'my_reports', label: 'My Reports' },
                      { id: 'team_reports', label: 'Team Reports' }
                    ].map(sc => (
                      <button
                        key={sc.id}
                        type="button"
                        className={`mobile-filter-select-chip ${reportScope === sc.id ? 'selected' : ''}`}
                        onClick={() => setReportScope(sc.id as any)}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mobile-filter-group-title">Stage Status</div>
                  <div className="mobile-filter-chips-grid">
                    {['All', 'Not Started', 'In Process', 'Under Review', 'Completed'].map(st => (
                      <button
                        key={st}
                        type="button"
                        className={`mobile-filter-select-chip ${tempStatus === st ? 'selected' : ''}`}
                        onClick={() => setTempStatus(st)}
                      >
                        {st === 'All' ? 'All Statuses' : st}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mobile-filter-group-title">Department</div>
                  <div className="mobile-filter-chips-grid">
                    <button
                      type="button"
                      className={`mobile-filter-select-chip ${tempDepartment === 'All' ? 'selected' : ''}`}
                      onClick={() => setTempDepartment('All')}
                    >
                      All Departments
                    </button>
                    {departments.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        className={`mobile-filter-select-chip ${tempDepartment === d.name ? 'selected' : ''}`}
                        onClick={() => setTempDepartment(d.name)}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mobile-filter-group-title">Date Range</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>
                        From
                      </span>
                      <input
                        type="date"
                        value={tempDateFrom}
                        onChange={e => setTempDateFrom(e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '0 8px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.78rem'
                        }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>
                        To
                      </span>
                      <input
                        type="date"
                        value={tempDateTo}
                        onChange={e => setTempDateTo(e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '0 8px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.78rem'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mobile-bottom-sheet-footer">
                <button type="button" className="mobile-sheet-btn-reset" onClick={handleResetFilters}>
                  Reset
                </button>
                <button type="button" className="mobile-sheet-btn-apply" onClick={applyMobileFilter}>
                  Apply Filters
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ============================================================ */}
      {/* ADD DAILY REPORT MODAL                                       */}
      {/* ============================================================ */}
      {showAddReportModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(3px)',
            zIndex: 1060,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowAddReportModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '500px',
              background: '#FFFFFF',
              borderRadius: '18px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.14)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Add Task Daily Report
                </h3>
                <p style={{ fontSize: '0.74rem', color: '#64748B', margin: '2px 0 0 0' }}>
                  Submit your daily work progress and update task status
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddReportModal(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#64748B',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                if (!newReportTaskId || !newReportWorkDone.trim()) return;
                addTaskDailyReport(newReportTaskId, {
                  reportDate: newReportDate,
                  workDoneToday: newReportWorkDone.trim(),
                  processStatus: newReportStatus,
                  hoursSpent: 8
                });
                const targetTask = enhancedTasks.find(t => t.id === newReportTaskId);
                if (targetTask) {
                  const progress =
                    newReportStatus === 'Completed'
                      ? 100
                      : newReportStatus === 'Under Review'
                      ? 85
                      : newReportStatus === 'In Process'
                      ? 50
                      : 0;
                  const myAsg =
                    targetTask.assignees.find(a => matchesCurrentUser(a.employeeId, a.employeeName)) ||
                    targetTask.assignees[0];
                  if (myAsg) {
                    updateAssigneeProgress(targetTask.id, myAsg.id || myAsg.employeeId, progress, newReportStatus);
                  }
                }
                setNewReportWorkDone('');
                setShowAddReportModal(false);
              }}
              style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', marginBottom: '5px' }}>
                  Select Task <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={newReportTaskId}
                  onChange={e => setNewReportTaskId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 10px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#0F172A'
                  }}
                >
                  {enhancedTasks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.taskNumber} — {t.title} ({t.department})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', marginBottom: '5px' }}>
                    Report Date <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={newReportDate}
                    onChange={e => setNewReportDate(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: '40px',
                      padding: '0 10px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#0F172A',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', marginBottom: '5px' }}>
                    Update Status <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={newReportStatus}
                    onChange={e => setNewReportStatus(e.target.value as any)}
                    style={{
                      width: '100%',
                      height: '40px',
                      padding: '0 10px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: '#0E7490'
                    }}
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Process">In Process</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', marginBottom: '5px' }}>
                  Work Done Today <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="1. Describe completed items and progress..."
                  value={newReportWorkDone}
                  onChange={e => setNewReportWorkDone(e.target.value)}
                  onKeyDown={preventSpaceEnterPropagation}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    color: '#0F172A',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddReportModal(false)}
                  style={{
                    height: '38px',
                    padding: '0 16px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    height: '38px',
                    padding: '0 18px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#0E7490',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Save Daily Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
