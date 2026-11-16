import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useHRMS } from '../../context/HRMSContext';
import {
  CheckSquare,
  Eye,
  Trash2,
  X,
  Search,
  SlidersHorizontal
} from 'lucide-react';
import { computeDueStatus, EnhancedTask, TaskPriority } from '../../types/tasks';
import { formatShortDateDayMonth, formatDateDayMonthYear } from '../../utils/dateUtils';
import { preventSpaceEnterPropagation } from '../../utils/keyboardUtils';

interface Props {
  onViewTask: (taskId: string) => void;
}

export const MyTasks: React.FC<Props> = ({ onViewTask }) => {
  const { enhancedTasks, currentUser, employees, departments, deleteEnhancedTask, updateAssigneeProgress } = useHRMS();

  const handleQuickStatusChange = (
    task: EnhancedTask,
    newStatus: 'Pending' | 'In Process' | 'Under Review' | 'Completed'
  ) => {
    const progress =
      newStatus === 'Completed'
        ? 100
        : newStatus === 'Under Review'
        ? 85
        : newStatus === 'In Process'
        ? 50
        : 0;
    const targetAssignee =
      task.assignees.find(a => a.employeeId === selectedEmployeeId || a.employeeId === currentUser.employeeId) ||
      task.assignees[0];
    if (targetAssignee) {
      updateAssigneeProgress(task.id, targetAssignee.id || targetAssignee.employeeId, progress, newStatus);
    }
  };

  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'COMPLETED'>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterDepartment, setFilterDepartment] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [showMobileFilterSheet, setShowMobileFilterSheet] = useState(false);
  const [tempStatus, setTempStatus] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'COMPLETED'>('ALL');
  const [tempPriority, setTempPriority] = useState<string>('ALL');
  const [tempDepartment, setTempDepartment] = useState<string>('ALL');

  const isManagerOrAdmin = useMemo(() => {
    return (
      currentUser.role === 'Super Admin' ||
      currentUser.role === 'CEO' ||
      currentUser.role === 'HR' ||
      currentUser.role === 'Manager'
    );
  }, [currentUser.role]);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(() => {
    if (isManagerOrAdmin) return 'ALL';
    if (currentUser.employeeId) return currentUser.employeeId;
    const match = employees.find(
      e =>
        (e.email && currentUser.email && e.email.toLowerCase() === currentUser.email.toLowerCase()) ||
        `${e.firstName} ${e.lastName}`.toLowerCase() === currentUser.name.toLowerCase()
    );
    return match ? match.employeeId : 'ALL';
  });

  useEffect(() => {
    if (isManagerOrAdmin) {
      setSelectedEmployeeId('ALL');
    } else if (currentUser.employeeId) {
      setSelectedEmployeeId(currentUser.employeeId);
    } else {
      const match = employees.find(
        e =>
          (e.email && currentUser.email && e.email.toLowerCase() === currentUser.email.toLowerCase()) ||
          `${e.firstName} ${e.lastName}`.toLowerCase() === currentUser.name.toLowerCase()
      );
      setSelectedEmployeeId(match ? match.employeeId : 'ALL');
    }
  }, [currentUser.id, currentUser.employeeId, currentUser.email, currentUser.name, isManagerOrAdmin, employees]);

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  const myTasks = useMemo(() => {
    if (!isManagerOrAdmin) {
      const myEmpRecord = employees.find(
        e =>
          e.employeeId === currentUser.employeeId ||
          e.id === currentUser.id ||
          (e.email && currentUser.email && e.email.toLowerCase() === currentUser.email.toLowerCase()) ||
          `${e.firstName} ${e.lastName}`.toLowerCase() === currentUser.name.toLowerCase()
      );

      const matchesMe = (idOrCode?: string, name?: string) => {
        if (idOrCode) {
          if (idOrCode === currentUser.employeeId || idOrCode === currentUser.id) return true;
          if (myEmpRecord && (idOrCode === myEmpRecord.employeeId || idOrCode === myEmpRecord.id)) return true;
        }
        if (name) {
          const target = name.trim().toLowerCase();
          if (target === currentUser.name.trim().toLowerCase()) return true;
          if (myEmpRecord && target === `${myEmpRecord.firstName} ${myEmpRecord.lastName}`.trim().toLowerCase()) {
            return true;
          }
        }
        return false;
      };

      return enhancedTasks.filter(
        t =>
          t.assignees.some(a => matchesMe(a.employeeId, a.employeeName)) ||
          matchesMe(t.responsiblePersonId, t.responsiblePersonName)
      );
    }

    if (selectedEmployeeId === 'ALL') {
      return enhancedTasks;
    }

    const selectedEmpObj = employees.find(e => e.employeeId === selectedEmployeeId || e.id === selectedEmployeeId);
    const fullName = selectedEmpObj
      ? `${selectedEmpObj.firstName} ${selectedEmpObj.lastName}`.trim().toLowerCase()
      : '';

    return enhancedTasks.filter(t => {
      const isAssignee = t.assignees.some(
        a =>
          a.employeeId === selectedEmployeeId ||
          (selectedEmpObj && a.employeeId === selectedEmpObj.id) ||
          (fullName && a.employeeName.trim().toLowerCase() === fullName)
      );
      const isResponsible =
        t.responsiblePersonId === selectedEmployeeId ||
        (selectedEmpObj && t.responsiblePersonId === selectedEmpObj.id) ||
        (fullName && t.responsiblePersonName.trim().toLowerCase() === fullName);
      return isAssignee || isResponsible;
    });
  }, [enhancedTasks, selectedEmployeeId, employees, isManagerOrAdmin, currentUser]);

  const filteredMyTasks = useMemo(() => {
    return myTasks.filter(t => {
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesNumber = t.taskNumber.toLowerCase().includes(q);
        const matchesDept = t.department.toLowerCase().includes(q);
        if (!matchesTitle && !matchesNumber && !matchesDept) return false;
      }

      if (filterDepartment !== 'ALL' && t.department !== filterDepartment) return false;
      if (filterPriority !== 'ALL' && t.priority !== filterPriority) return false;

      if (filterStatus === 'ALL') return true;

      let myStatus: string = t.overallStatus;
      if (selectedEmployeeId !== 'ALL') {
        const myAssignee = t.assignees.find(a => a.employeeId === selectedEmployeeId);
        if (myAssignee) {
          if (myAssignee.individualStatus === 'Open' || myAssignee.individualStatus === 'Pending' || myAssignee.individualStatus === 'Not Started')
            myStatus = 'OPEN';
          else if (myAssignee.individualStatus === 'Under Review')
            myStatus = 'UNDER REVIEW';
          else if (myAssignee.individualStatus === 'In Progress' || myAssignee.individualStatus === 'In Process')
            myStatus = 'IN PROGRESS';
          else if (myAssignee.individualStatus === 'Completed')
            myStatus = 'COMPLETED';
        }
      }

      if (filterStatus === 'OPEN') return myStatus === 'OPEN' || myStatus === 'REOPENED';
      if (filterStatus === 'IN_PROGRESS')
        return myStatus === 'IN PROGRESS' || myStatus === 'PARTIALLY COMPLETED';
      if (filterStatus === 'UNDER_REVIEW')
        return myStatus === 'UNDER REVIEW';
      if (filterStatus === 'COMPLETED') return myStatus === 'COMPLETED' || myStatus === 'CLOSED';
      return true;
    });
  }, [myTasks, filterStatus, filterPriority, filterDepartment, selectedEmployeeId, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterPriority, filterDepartment, selectedEmployeeId, searchQuery]);

  const activeMobileFilterCount = useMemo(() => {
    let count = 0;
    if (filterStatus !== 'ALL') count++;
    if (filterPriority !== 'ALL') count++;
    if (filterDepartment !== 'ALL') count++;
    return count;
  }, [filterStatus, filterPriority, filterDepartment]);

  const openMobileFilter = () => {
    setTempStatus(filterStatus);
    setTempPriority(filterPriority);
    setTempDepartment(filterDepartment);
    setShowMobileFilterSheet(true);
  };

  const applyMobileFilter = () => {
    setFilterStatus(tempStatus);
    setFilterPriority(tempPriority);
    setFilterDepartment(tempDepartment);
    setShowMobileFilterSheet(false);
  };

  const resetAllFilters = () => {
    setFilterStatus('ALL');
    setFilterPriority('ALL');
    setFilterDepartment('ALL');
    setTempStatus('ALL');
    setTempPriority('ALL');
    setTempDepartment('ALL');
    setShowMobileFilterSheet(false);
  };

  const totalEntries = filteredMyTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const paginatedTasks = filteredMyTasks.slice(startIndex, startIndex + rowsPerPage);

  const toggleSelectAll = () => {
    const visibleIds = paginatedTasks.map(t => t.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTaskIds.includes(id));
    if (allVisibleSelected) {
      setSelectedTaskIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedTaskIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleSelectRow = (id: string, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
    setSelectedTaskIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const handleBulkEdit = () => {
    if (selectedTaskIds.length > 0) {
      onViewTask(selectedTaskIds[0]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedTaskIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedTaskIds.length} selected task(s)?`)) {
      selectedTaskIds.forEach(id => {
        deleteEnhancedTask?.(id);
      });
      setSelectedTaskIds([]);
    }
  };

  const handleJumpToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      setJumpPageInput('');
    }
  };

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

  const getPriorityBadgeStyle = (p: TaskPriority) => {
    switch (p) {
      case 'Urgent':
        return { bg: '#FEE2E2', color: '#DC2626', label: 'Urgent' };
      case 'High':
        return { bg: '#FEF3C7', color: '#D97706', label: 'High' };
      case 'Medium':
        return { bg: '#EFF6FF', color: '#2563EB', label: 'Medium' };
      default:
        return { bg: '#DCFCE7', color: '#15803D', label: 'Low' };
    }
  };

  const getDisplayStatusBadge = (rawStatus: string) => {
    if (rawStatus === 'Completed' || rawStatus === 'COMPLETED' || rawStatus === 'CLOSED') {
      return { label: 'Completed', bg: '#DCFCE7', color: '#15803D', showDot: false };
    }
    if (rawStatus === 'Under Review' || rawStatus === 'UNDER REVIEW') {
      return { label: 'Under Review', bg: '#FEF3C7', color: '#D97706', showDot: false };
    }
    if (
      rawStatus === 'In Progress' ||
      rawStatus === 'In Process' ||
      rawStatus === 'IN PROGRESS' ||
      rawStatus === 'PARTIALLY COMPLETED' ||
      rawStatus === 'REOPENED'
    ) {
      return { label: 'In Process', bg: '#E0F2FE', color: '#0284C7', showDot: false };
    }
    return { label: 'Pending', bg: '#F1F5F9', color: '#475569', showDot: true };
  };

  const allVisibleSelected =
    paginatedTasks.length > 0 && paginatedTasks.every(t => selectedTaskIds.includes(t.id));

  return (
    <div className="my-tasks-container" style={{ width: '100%' }}>
      {/* ============================================================ */}
      {/* DESKTOP FILTER BAR                                           */}
      {/* ============================================================ */}
      <div
        className="desktop-only-block"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '12px 14px',
          marginBottom: '14px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {isManagerOrAdmin && (
              <select
                value={selectedEmployeeId}
                onChange={e => setSelectedEmployeeId(e.target.value)}
                style={{
                  height: '38px',
                  padding: '0 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#0F172A',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Employees ({enhancedTasks.length})</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.employeeId}>
                    {emp.firstName} {emp.lastName} ({emp.department})
                  </option>
                ))}
              </select>
            )}

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { key: 'ALL', label: 'All', count: myTasks.length },
                {
                  key: 'OPEN',
                  label: 'Pending',
                  count: myTasks.filter(t => {
                    const m = t.assignees.find(a => a.employeeId === selectedEmployeeId);
                    return m
                      ? m.individualStatus === 'Open' || m.individualStatus === 'Pending' || m.individualStatus === 'Not Started'
                      : t.overallStatus === 'OPEN';
                  }).length
                },
                {
                  key: 'IN_PROGRESS',
                  label: 'In Process',
                  count: myTasks.filter(t => {
                    const m = t.assignees.find(a => a.employeeId === selectedEmployeeId);
                    return m
                      ? m.individualStatus === 'In Progress' || m.individualStatus === 'In Process'
                      : t.overallStatus === 'IN PROGRESS' || t.overallStatus === 'PARTIALLY COMPLETED';
                  }).length
                },
                {
                  key: 'UNDER_REVIEW',
                  label: 'Under Review',
                  count: myTasks.filter(t => {
                    const m = t.assignees.find(a => a.employeeId === selectedEmployeeId);
                    return m
                      ? m.individualStatus === 'Under Review'
                      : t.overallStatus === 'UNDER REVIEW';
                  }).length
                },
                {
                  key: 'COMPLETED',
                  label: 'Completed',
                  count: myTasks.filter(t => {
                    const m = t.assignees.find(a => a.employeeId === selectedEmployeeId);
                    return m
                      ? m.individualStatus === 'Completed'
                      : t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED';
                  }).length
                }
              ].map(chip => {
                const isActive = filterStatus === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setFilterStatus(chip.key as any)}
                    style={{
                      height: '36px',
                      padding: '0 12px',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      border: isActive ? '1px solid #0E7490' : '1px solid #E2E8F0',
                      background: isActive ? '#0E7490' : '#FFFFFF',
                      color: isActive ? '#FFFFFF' : '#475569',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{chip.label}</span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '1px 6px',
                        borderRadius: '999px',
                        background: isActive ? 'rgba(255,255,255,0.2)' : '#F1F5F9',
                        color: isActive ? '#FFFFFF' : '#475569'
                      }}
                    >
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ position: 'relative', minWidth: '220px', flex: '0 1 260px' }}>
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
              placeholder="Search my tasks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={preventSpaceEnterPropagation}
              style={{
                width: '100%',
                height: '38px',
                paddingLeft: '36px',
                paddingRight: '12px',
                fontSize: '0.82rem',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MOBILE SEARCH + FILTER BAR                                   */}
      {/* ============================================================ */}
      <div className="mobile-only-block" style={{ marginBottom: '10px' }}>
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
              placeholder="Search tasks..."
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
            title="Filter My Tasks"
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

        {activeMobileFilterCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {filterStatus !== 'ALL' && (
              <span className="mobile-ref-filter-chip">
                {filterStatus === 'IN_PROGRESS' ? 'In Progress' : filterStatus}
                <button type="button" className="mobile-ref-filter-chip-clear" onClick={() => setFilterStatus('ALL')}>
                  <X size={12} />
                </button>
              </span>
            )}
            {filterPriority !== 'ALL' && (
              <span className="mobile-ref-filter-chip">
                {filterPriority}
                <button type="button" className="mobile-ref-filter-chip-clear" onClick={() => setFilterPriority('ALL')}>
                  <X size={12} />
                </button>
              </span>
            )}
            {filterDepartment !== 'ALL' && (
              <span className="mobile-ref-filter-chip">
                {filterDepartment}
                <button
                  type="button"
                  className="mobile-ref-filter-chip-clear"
                  onClick={() => setFilterDepartment('ALL')}
                >
                  <X size={12} />
                </button>
              </span>
            )}
            <button type="button" className="mobile-filter-reset-all-btn" onClick={resetAllFilters}>
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* DESKTOP TABLE VIEW                                           */}
      {/* ============================================================ */}
      <div
        className="desktop-only-block"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
        }}
      >
        {filteredMyTasks.length === 0 ? (
          <div
            style={{
              padding: '48px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px'
              }}
            >
              <CheckSquare size={24} />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
              No Tasks Assigned
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748B', maxWidth: '340px' }}>
              No tasks match the selected filters.
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table className="hrms-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ width: '40px', textAlign: 'center', padding: '12px 8px' }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      style={{ accentColor: '#0E7490', width: '15px', height: '15px', cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ width: '125px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Task ID
                  </th>
                  <th style={{ width: '30%', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Task &amp; Department
                  </th>
                  <th style={{ width: '18%', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Assigned By
                  </th>
                  <th style={{ width: '125px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Due Date
                  </th>
                  <th style={{ width: '95px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Priority
                  </th>
                  <th style={{ width: '140px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    My Status
                  </th>
                  <th style={{ width: '80px', padding: '12px 12px', textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map(task => {
                  const myAssignee = task.assignees.find(a => a.employeeId === selectedEmployeeId);
                  const currentStatus = myAssignee ? myAssignee.individualStatus : task.overallStatus;
                  const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);
                  const isSelected = selectedTaskIds.includes(task.id);
                  const pStyle = getPriorityBadgeStyle(task.priority);
                  const sStyle = getDisplayStatusBadge(currentStatus);

                  return (
                    <tr
                      key={task.id}
                      onClick={() => onViewTask(task.id)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background-color 0.12s ease'
                      }}
                    >
                      <td
                        style={{
                          textAlign: 'center',
                          padding: '12px 8px',
                          borderLeft: isSelected ? '4px solid #0E7490' : '4px solid transparent'
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => toggleSelectRow(task.id, e)}
                          style={{ accentColor: '#0E7490', width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.78rem', color: '#0E7490' }}>
                          {task.taskNumber}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px', minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            color: '#0F172A',
                            fontSize: '0.85rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {task.title}
                        </div>
                        <div
                          style={{
                            fontSize: '0.74rem',
                            color: '#64748B',
                            marginTop: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {task.department} {task.taskCategory ? `• ${task.taskCategory}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px', minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#1E293B',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {task.assignedByName}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                          Lead: {task.responsiblePersonName}
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: dueStatus === 'Overdue' ? '#DC2626' : '#334155'
                          }}
                        >
                          {formatDateDayMonthYear(task.dueDate)}
                        </div>
                        {dueStatus === 'Overdue' && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#DC2626' }}>Overdue</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span
                          style={{
                            background: pStyle.bg,
                            color: pStyle.color,
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            display: 'inline-block'
                          }}
                        >
                          {pStyle.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px' }} onClick={e => e.stopPropagation()}>
                        <select
                          value={sStyle.label}
                          onChange={e =>
                            handleQuickStatusChange(
                              task,
                              e.target.value as 'Pending' | 'In Process' | 'Under Review' | 'Completed'
                            )
                          }
                          style={{
                            background: sStyle.bg,
                            color: sStyle.color,
                            fontWeight: 700,
                            fontSize: '0.73rem',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            border: '1px solid rgba(148, 163, 184, 0.25)',
                            cursor: 'pointer',
                            outline: 'none'
                          }}
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Process">In Process</option>
                          <option value="Under Review">Under Review</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onViewTask(task.id);
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            background: '#F8FAFC',
                            color: '#0E7490',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Eye size={13} /> Daily Report
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

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
                style={{ width: '62px', height: '30px', padding: '2px 6px', fontSize: '0.78rem', borderRadius: '6px' }}
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

      {/* ============================================================ */}
      {/* MOBILE CARD LIST (Matches Reference Image Screen 1)          */}
      {/* ============================================================ */}
      <div
        className="mobile-only-block"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          paddingBottom: '12px'
        }}
      >
        {filteredMyTasks.length === 0 ? (
          <div className="mobile-empty-state">
            <div className="mobile-empty-icon">
              <CheckSquare size={18} />
            </div>
            <div className="mobile-empty-title">No Tasks Found</div>
            <div className="mobile-empty-desc">Adjust your search or filters to view your tasks.</div>
          </div>
        ) : (
          filteredMyTasks.map((task: EnhancedTask) => {
            const myAssignee = task.assignees.find((a: any) => a.employeeId === selectedEmployeeId);
            const currentStatus = myAssignee ? myAssignee.individualStatus : task.overallStatus;
            const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);
            const pStyle = getPriorityBadgeStyle(task.priority);
            const sStyle = getDisplayStatusBadge(currentStatus);

            return (
              <div
                key={task.id}
                onClick={() => onViewTask(task.id)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px',
                  padding: '14px 16px',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                {/* Row 1: Task ID (left) + Priority Badge (right) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0E7490' }}>
                    {task.taskNumber}
                  </span>
                  <span
                    style={{
                      background: pStyle.bg,
                      color: pStyle.color,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2.5px 9px',
                      borderRadius: '6px',
                      lineHeight: 1.2
                    }}
                  >
                    {pStyle.label}
                  </span>
                </div>

                {/* Row 2: Task Title */}
                <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
                  {task.title}
                </div>

                {/* Row 3: Department • Due 17 Nov (left) + Status Pill (right) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    marginTop: '2px'
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      color: dueStatus === 'Overdue' ? '#DC2626' : '#64748B',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {task.department || 'General'} • Due {formatShortDateDayMonth(task.dueDate)}
                  </span>

                  <select
                    value={sStyle.label}
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                      e.stopPropagation();
                      handleQuickStatusChange(
                        task,
                        e.target.value as 'Pending' | 'In Process' | 'Under Review' | 'Completed'
                      );
                    }}
                    style={{
                      background: sStyle.bg,
                      color: sStyle.color,
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      padding: '3.5px 10px',
                      borderRadius: '999px',
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                      flexShrink: 0,
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Process">In Process</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ============================================================ */}
      {/* MOBILE BOTTOM SHEET FILTER                                   */}
      {/* ============================================================ */}
      {showMobileFilterSheet &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="mobile-bottom-sheet-backdrop" onClick={() => setShowMobileFilterSheet(false)}>
            <div className="mobile-bottom-sheet-panel" onClick={e => e.stopPropagation()}>
              <div className="mobile-bottom-sheet-handle" />
              <div className="mobile-bottom-sheet-header">
                <span className="mobile-bottom-sheet-title">Filter My Tasks</span>
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
                  <div className="mobile-filter-group-title">Task Status</div>
                  <div className="mobile-filter-chips-grid">
                    {[
                      { id: 'ALL', label: 'All' },
                      { id: 'OPEN', label: 'Open' },
                      { id: 'IN_PROGRESS', label: 'In Progress' },
                      { id: 'COMPLETED', label: 'Completed' }
                    ].map(st => (
                      <button
                        key={st.id}
                        type="button"
                        className={`mobile-filter-select-chip ${tempStatus === st.id ? 'selected' : ''}`}
                        onClick={() => setTempStatus(st.id as any)}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mobile-filter-group-title">Priority</div>
                  <div className="mobile-filter-chips-grid">
                    {['ALL', 'Urgent', 'High', 'Medium', 'Low'].map(pr => (
                      <button
                        key={pr}
                        type="button"
                        className={`mobile-filter-select-chip ${tempPriority === pr ? 'selected' : ''}`}
                        onClick={() => setTempPriority(pr)}
                      >
                        {pr === 'ALL' ? 'All Priorities' : pr}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mobile-filter-group-title">Department</div>
                  <div className="mobile-filter-chips-grid">
                    <button
                      type="button"
                      className={`mobile-filter-select-chip ${tempDepartment === 'ALL' ? 'selected' : ''}`}
                      onClick={() => setTempDepartment('ALL')}
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
              </div>
              <div className="mobile-bottom-sheet-footer">
                <button type="button" className="mobile-sheet-btn-reset" onClick={resetAllFilters}>
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

      {/* Floating Bulk Action Bar */}
      {selectedTaskIds.length > 0 && (
        <div
          className="floating-action-bar"
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#1E293B',
            color: '#FFFFFF',
            padding: '10px 20px',
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
            zIndex: 1000
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#CFFAFE' }}>
            {selectedTaskIds.length} Selected
          </span>
          <span style={{ color: '#475569' }}>|</span>
          <button
            type="button"
            onClick={handleBulkEdit}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600
            }}
          >
            <span>✏️ Edit Info</span>
          </button>
          {isManagerOrAdmin && (
            <>
              <span style={{ color: '#475569' }}>|</span>
              <button
                type="button"
                onClick={handleBulkDelete}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FCA5A5',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600
                }}
              >
                <Trash2 size={14} />
                <span>🗑️ Delete</span>
              </button>
            </>
          )}
          <span style={{ color: '#475569' }}>|</span>
          <button
            type="button"
            onClick={() => setSelectedTaskIds([])}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '2px'
            }}
            title="Clear Selection"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
