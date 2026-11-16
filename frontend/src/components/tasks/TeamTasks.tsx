import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useHRMS } from '../../context/HRMSContext';
import {
  Users,
  Eye,
  ChevronDown,
  ChevronRight,
  Trash2,
  X,
  Search,
  Filter
} from 'lucide-react';
import { computeDueStatus, EnhancedTask } from '../../types/tasks';
import { formatDateDayMonthYear } from '../../utils/dateUtils';
import { preventSpaceEnterPropagation } from '../../utils/keyboardUtils';

interface Props {
  onViewTask: (taskId: string) => void;
}

const AVATAR_COLORS = ['#0E7490', '#6366F1', '#0D9488', '#7C3AED', '#2563EB'];

export const TeamTasks: React.FC<Props> = ({ onViewTask }) => {
  const { enhancedTasks, departments, deleteEnhancedTask, currentUser, employees, updateAssigneeProgress } = useHRMS();

  const myEmpRecord = useMemo(() => {
    return employees.find(
      e =>
        e.employeeId === currentUser.employeeId ||
        e.id === currentUser.id ||
        (e.email && currentUser.email && e.email.toLowerCase() === currentUser.email.toLowerCase()) ||
        `${e.firstName} ${e.lastName}`.toLowerCase() === currentUser.name.toLowerCase()
    );
  }, [employees, currentUser]);

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

  const handleMyTeamStatusChange = (
    task: EnhancedTask,
    newStatus: 'Pending' | 'In Process' | 'Under Review' | 'Completed'
  ) => {
    const myAsg = task.assignees.find(a => matchesMe(a.employeeId, a.employeeName));
    if (!myAsg) return;
    const progress =
      newStatus === 'Completed'
        ? 100
        : newStatus === 'Under Review'
        ? 85
        : newStatus === 'In Process'
        ? 50
        : 0;
    updateAssigneeProgress(task.id, myAsg.id || myAsg.employeeId, progress, newStatus);
  };

  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);

  const [showMobileFilterSheet, setShowMobileFilterSheet] = useState(false);
  const [tempStatus, setTempStatus] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [tempPriority, setTempPriority] = useState<string>('ALL');
  const [tempDepartment, setTempDepartment] = useState<string>('All');

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  const isManagerOrAdmin = useMemo(() => {
    return (
      currentUser.role === 'Super Admin' ||
      currentUser.role === 'CEO' ||
      currentUser.role === 'HR' ||
      currentUser.role === 'HR Manager' ||
      currentUser.role === 'HR Admin'
    );
  }, [currentUser.role]);

  const teamTasks = useMemo(() => {
    return enhancedTasks.filter(t => {
      const isTeam = t.assignmentType === 'Team' || t.assignees.length > 1;
      if (!isTeam) return false;

      if (!isManagerOrAdmin) {
        const isInvolved =
          t.assignees.some(a => matchesMe(a.employeeId, a.employeeName)) ||
          matchesMe(t.responsiblePersonId, t.responsiblePersonName) ||
          matchesMe(t.assignedById, t.assignedByName);
        if (!isInvolved) return false;
      }

      if (selectedDepartment !== 'All' && t.department !== selectedDepartment) return false;
      if (filterPriority !== 'ALL' && t.priority !== filterPriority) return false;

      if (filterStatus !== 'ALL') {
        if (filterStatus === 'OPEN' && t.overallStatus !== 'OPEN' && t.overallStatus !== 'REOPENED') return false;
        if (
          filterStatus === 'IN_PROGRESS' &&
          t.overallStatus !== 'IN PROGRESS' &&
          t.overallStatus !== 'PARTIALLY COMPLETED' &&
          t.overallStatus !== 'UNDER REVIEW'
        )
          return false;
        if (filterStatus === 'COMPLETED' && t.overallStatus !== 'COMPLETED' && t.overallStatus !== 'CLOSED')
          return false;
      }

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesNumber = t.taskNumber.toLowerCase().includes(q);
        const matchesLead = t.responsiblePersonName.toLowerCase().includes(q);
        const matchesMember = t.assignees.some(a => a.employeeName.toLowerCase().includes(q));
        if (!matchesTitle && !matchesNumber && !matchesLead && !matchesMember) return false;
      }

      return true;
    });
  }, [enhancedTasks, selectedDepartment, filterStatus, filterPriority, searchQuery, isManagerOrAdmin, currentUser, employees]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDepartment, filterStatus, filterPriority, searchQuery]);

  const activeMobileFilterCount = useMemo(() => {
    let count = 0;
    if (filterStatus !== 'ALL') count++;
    if (filterPriority !== 'ALL') count++;
    if (selectedDepartment !== 'All') count++;
    return count;
  }, [filterStatus, filterPriority, selectedDepartment]);

  const openMobileFilter = () => {
    setTempStatus(filterStatus);
    setTempPriority(filterPriority);
    setTempDepartment(selectedDepartment);
    setShowMobileFilterSheet(true);
  };

  const applyMobileFilter = () => {
    setFilterStatus(tempStatus);
    setFilterPriority(tempPriority);
    setSelectedDepartment(tempDepartment);
    setShowMobileFilterSheet(false);
  };

  const resetAllFilters = () => {
    setFilterStatus('ALL');
    setFilterPriority('ALL');
    setSelectedDepartment('All');
    setTempStatus('ALL');
    setTempPriority('ALL');
    setTempDepartment('All');
    setShowMobileFilterSheet(false);
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTaskIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const totalEntries = teamTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const paginatedTasks = teamTasks.slice(startIndex, startIndex + rowsPerPage);

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
    if (window.confirm(`Are you sure you want to delete ${selectedTaskIds.length} selected team task(s)?`)) {
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

  const getDisplayStatusBadge = (rawStatus: string) => {
    if (rawStatus === 'Completed' || rawStatus === 'COMPLETED' || rawStatus === 'CLOSED') {
      return { label: 'Completed', bg: '#DCFCE7', color: '#15803D', showDot: false };
    }
    if (
      rawStatus === 'In Progress' ||
      rawStatus === 'IN PROGRESS' ||
      rawStatus === 'PARTIALLY COMPLETED' ||
      rawStatus === 'UNDER REVIEW' ||
      rawStatus === 'REOPENED'
    ) {
      return { label: 'In Progress', bg: '#E0F2FE', color: '#0284C7', showDot: false };
    }
    return { label: 'Open', bg: '#E0F2FE', color: '#0E7490', showDot: true };
  };

  const allVisibleSelected =
    paginatedTasks.length > 0 && paginatedTasks.every(t => selectedTaskIds.includes(t.id));

  const renderAvatarCluster = (task: EnhancedTask) => {
    const visibleAssignees = task.assignees.slice(0, 2);
    const extraCount = Math.max(0, task.assignees.length - 2);

    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {visibleAssignees.map((assignee: any, idx: number) => {
          const initial = (assignee.employeeName || 'U').trim().charAt(0).toUpperCase();
          return (
            <div
              key={assignee.employeeId || idx}
              title={`${assignee.employeeName} (${assignee.individualStatus})`}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: AVATAR_COLORS[idx % AVATAR_COLORS.length],
                color: '#FFFFFF',
                fontSize: '0.74rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #FFFFFF',
                marginLeft: idx === 0 ? '0px' : '-7px',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
                zIndex: 3 - idx
              }}
            >
              {initial}
            </div>
          );
        })}
        {extraCount > 0 && (
          <div
            style={{
              minWidth: '28px',
              height: '28px',
              padding: '0 6px',
              borderRadius: '999px',
              background: '#F1F5F9',
              color: '#334155',
              fontSize: '0.7rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #FFFFFF',
              marginLeft: '-6px',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
              zIndex: 1
            }}
          >
            +{extraCount}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="team-tasks-container" style={{ width: '100%' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '340px' }}>
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
                placeholder="Search team tasks, lead, or member..."
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

            <select
              value={selectedDepartment}
              onChange={e => setSelectedDepartment(e.target.value)}
              style={{
                height: '38px',
                padding: '0 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                borderRadius: '10px',
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

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              style={{
                height: '38px',
                padding: '0 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B' }}>
            {teamTasks.length} Team {teamTasks.length === 1 ? 'Task' : 'Tasks'}
          </span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MOBILE SEARCH + FILTER BAR (Matches Reference Image Screen 2)*/}
      {/* ============================================================ */}
      <div className="mobile-only-block" style={{ marginBottom: '12px' }}>
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
              placeholder="Search"
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
                background: '#F8FAFC',
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
              background: activeMobileFilterCount > 0 ? '#ECFEFF' : '#F1F5F9',
              color: activeMobileFilterCount > 0 ? '#0E7490' : '#334155',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              position: 'relative'
            }}
            title="Filter Team Tasks"
          >
            <Filter size={16} />
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
            {selectedDepartment !== 'All' && (
              <span className="mobile-ref-filter-chip">
                {selectedDepartment}
                <button
                  type="button"
                  className="mobile-ref-filter-chip-clear"
                  onClick={() => setSelectedDepartment('All')}
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
      {/* DESKTOP TABLE VIEW (Compact Team Progress + Avatars)         */}
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
        {teamTasks.length === 0 ? (
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
              <Users size={24} />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
              No Team Tasks Found
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748B', maxWidth: '340px' }}>
              Multi-employee team assignments will appear here.
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
                  <th style={{ width: '34px', padding: '12px 4px' }} />
                  <th style={{ width: '120px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Task ID
                  </th>
                  <th style={{ width: '26%', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Task &amp; Department
                  </th>
                  <th style={{ width: '160px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Team Members
                  </th>
                  <th style={{ width: '22%', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Completion Progress
                  </th>
                  <th style={{ width: '125px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Due Date
                  </th>
                  <th style={{ width: '125px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Status
                  </th>
                  <th style={{ width: '80px', padding: '12px 12px', textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map(task => {
                  const isExpanded = expandedTaskIds.includes(task.id);
                  const isSelected = selectedTaskIds.includes(task.id);
                  const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);
                  const completedCount = task.assignees.filter(a => a.individualStatus === 'Completed').length;
                  const totalCount = task.assignees.length;
                  const progressPct =
                    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : task.overallProgress;
                  const sStyle = getDisplayStatusBadge(task.overallStatus);

                  return (
                    <React.Fragment key={task.id}>
                      <tr
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
                        <td style={{ padding: '12px 4px', textAlign: 'center' }} onClick={e => toggleExpand(task.id, e)}>
                          <button
                            type="button"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '4px',
                              color: '#64748B',
                              display: 'inline-flex'
                            }}
                          >
                            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
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
                          <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '2px' }}>
                            {task.department} • Lead: {task.responsiblePersonName}
                          </div>
                        </td>
                        <td style={{ padding: '12px 12px' }}>{renderAvatarCluster(task)}</td>
                        <td style={{ padding: '12px 12px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.73rem',
                              marginBottom: '5px'
                            }}
                          >
                            <span style={{ color: '#475569', fontWeight: 600 }}>
                              {completedCount} of {totalCount} Completed
                            </span>
                            <span style={{ color: '#0F172A', fontWeight: 800 }}>{progressPct}%</span>
                          </div>
                          <div
                            style={{
                              width: '100%',
                              height: '6px',
                              background: '#E2E8F0',
                              borderRadius: '999px',
                              overflow: 'hidden'
                            }}
                          >
                            <div
                              style={{
                                width: `${progressPct}%`,
                                height: '100%',
                                background: '#0E7490',
                                borderRadius: '999px',
                                transition: 'width 0.25s ease'
                              }}
                            />
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
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <span
                            style={{
                              background: sStyle.bg,
                              color: sStyle.color,
                              fontWeight: 700,
                              fontSize: '0.73rem',
                              padding: '4px 10px',
                              borderRadius: '999px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                          >
                            {sStyle.showDot && (
                              <span
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: sStyle.color
                                }}
                              />
                            )}
                            {sStyle.label}
                          </span>
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

                      {isExpanded && (
                        <tr>
                          <td colSpan={9} style={{ background: '#F8FAFC', padding: '12px 24px', borderBottom: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                              Team Member Status Breakdown:
                            </div>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                gap: '8px'
                              }}
                            >
                              {task.assignees.map(a => {
                                const isMe = matchesMe(a.employeeId, a.employeeName);
                                const normStatus =
                                  a.individualStatus === 'Completed'
                                    ? 'Completed'
                                    : a.individualStatus === 'Under Review'
                                    ? 'Under Review'
                                    : a.individualStatus === 'In Progress' || a.individualStatus === 'In Process'
                                    ? 'In Process'
                                    : 'Pending';
                                return (
                                  <div
                                    key={a.id || a.employeeId}
                                    style={{
                                      padding: '8px 12px',
                                      background: '#FFFFFF',
                                      borderRadius: '10px',
                                      border: isMe ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      gap: '8px'
                                    }}
                                  >
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>
                                        {a.employeeName}
                                        {isMe && (
                                          <span style={{ marginLeft: '5px', fontSize: '0.66rem', color: '#0E7490' }}>
                                            (You)
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                        {a.designation || a.department}
                                      </div>
                                    </div>
                                    {isMe && task.overallStatus !== 'CLOSED' ? (
                                      <select
                                        value={normStatus}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => {
                                          e.stopPropagation();
                                          handleMyTeamStatusChange(
                                            task,
                                            e.target.value as 'Pending' | 'In Process' | 'Under Review' | 'Completed'
                                          );
                                        }}
                                        style={{
                                          fontSize: '0.7rem',
                                          fontWeight: 700,
                                          padding: '3px 8px',
                                          borderRadius: '999px',
                                          border: '1px solid #0E7490',
                                          background:
                                            normStatus === 'Completed'
                                              ? '#DCFCE7'
                                              : normStatus === 'Under Review'
                                              ? '#FEF3C7'
                                              : normStatus === 'In Process'
                                              ? '#E0F2FE'
                                              : '#F1F5F9',
                                          color:
                                            normStatus === 'Completed'
                                              ? '#15803D'
                                              : normStatus === 'Under Review'
                                              ? '#D97706'
                                              : normStatus === 'In Process'
                                              ? '#0284C7'
                                              : '#475569',
                                          cursor: 'pointer',
                                          outline: 'none'
                                        }}
                                      >
                                        <option value="Pending">Pending</option>
                                        <option value="In Process">In Process</option>
                                        <option value="Under Review">Under Review</option>
                                        <option value="Completed">Completed</option>
                                      </select>
                                    ) : (
                                      <span
                                        style={{
                                          fontSize: '0.68rem',
                                          fontWeight: 700,
                                          padding: '2px 8px',
                                          borderRadius: '999px',
                                          background:
                                            normStatus === 'Completed'
                                              ? '#DCFCE7'
                                              : normStatus === 'Under Review'
                                              ? '#FEF3C7'
                                              : normStatus === 'In Process'
                                              ? '#E0F2FE'
                                              : '#F1F5F9',
                                          color:
                                            normStatus === 'Completed'
                                              ? '#15803D'
                                              : normStatus === 'Under Review'
                                              ? '#D97706'
                                              : normStatus === 'In Process'
                                              ? '#0284C7'
                                              : '#475569'
                                        }}
                                      >
                                        {normStatus}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
      {/* MOBILE COMPACT TEAM TASK CARDS (Matches Screen 2 Reference)  */}
      {/* Row 1: TSK-2026-005 | In Progress                            */}
      {/* Row 2: Punch in issue                                        */}
      {/* Row 3: [M][A][+8] | Due: 06 Nov 2026                         */}
      {/* Row 4: 2 of 10 Completed | 20%                               */}
      {/* Row 5: Horizontal Teal Progress Bar                          */}
      {/* ============================================================ */}
      <div
        className="mobile-only-block"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          paddingBottom: '12px'
        }}
      >
        {teamTasks.length === 0 ? (
          <div className="mobile-empty-state">
            <div className="mobile-empty-icon">
              <Users size={18} />
            </div>
            <div className="mobile-empty-title">No Team Tasks</div>
            <div className="mobile-empty-desc">Multi-member team tasks will appear here.</div>
          </div>
        ) : (
          teamTasks.map((task: EnhancedTask) => {
            const sStyle = getDisplayStatusBadge(task.overallStatus);
            const completedCount = task.assignees.filter((a: any) => a.individualStatus === 'Completed').length;
            const totalCount = task.assignees.length;
            const progressPct =
              totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : task.overallProgress;

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
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                {/* Row 1: Task ID (left) + Status Pill (right) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0E7490' }}>
                    {task.taskNumber}
                  </span>
                  <span
                    style={{
                      background: sStyle.bg,
                      color: sStyle.color,
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      padding: '3.5px 10px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    {sStyle.showDot && (
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: sStyle.color
                        }}
                      />
                    )}
                    {sStyle.label}
                  </span>
                </div>

                {/* Row 2: Task Title */}
                <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
                  {task.title}
                </div>

                {/* Row 3: Overlapping Avatars (left) + Due: DD Mon YYYY (right) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    marginTop: '2px'
                  }}
                >
                  {renderAvatarCluster(task)}
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B' }}>
                    Due: {formatDateDayMonthYear(task.dueDate)}
                  </span>
                </div>

                {/* Row 4: X of Y Completed (left) + Percentage (right) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    marginTop: '2px'
                  }}
                >
                  <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#475569' }}>
                    {completedCount} of {totalCount} Completed
                  </span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>{progressPct}%</span>
                </div>

                {/* Row 5: Progress Bar */}
                <div
                  style={{
                    width: '100%',
                    height: '7px',
                    borderRadius: '999px',
                    background: '#E2E8F0',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${progressPct}%`,
                      height: '100%',
                      borderRadius: '999px',
                      background: '#0E7490',
                      transition: 'width 0.25s ease'
                    }}
                  />
                </div>
              </div>
            );
          })
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
                <span className="mobile-bottom-sheet-title">Filter Team Tasks</span>
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
