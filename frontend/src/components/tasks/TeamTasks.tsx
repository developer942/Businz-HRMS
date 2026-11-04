import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Users, 
  CheckCircle2, 
  Search, 
  Eye,
  AlertCircle,
  Clock,
  Calendar
} from 'lucide-react';
import { computeDueStatus, TaskAssigneeStatus } from '../../types/tasks';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { MobileFilterSheet } from '../common/MobileFilterSheet';
import { X, Filter } from 'lucide-react';

interface TeamTasksProps {
  onSelectTask: (taskId: string) => void;
}

export const TeamTasks: React.FC<TeamTasksProps> = ({ onSelectTask }) => {
  const { enhancedTasks, departments, currentUser } = useHRMS();

  const isSuperAdmin = currentUser.role === 'Super Admin' || currentUser.role === 'ERP Administrator';
  const isCEO = isSuperAdmin || currentUser.role === 'CEO' || currentUser.designation === 'CEO' || currentUser.employeeId === 'EMP-000';
  const isHR = currentUser.role === 'HR Manager' || currentUser.role === 'HR Admin' || (currentUser as any).department?.toLowerCase().includes('hr');
  const isManager = currentUser.role === 'Department Manager' || currentUser.role === 'Department Head' || currentUser.role === 'Manager';
  const isBroadAccess = isCEO || isHR;
  const targetDept = isManager ? currentUser.department : 'All';
  const currentEmpId = (currentUser.employeeId || currentUser.id || '').toLowerCase().trim();
  const currentName = (currentUser.name || '').toLowerCase().trim();

  const [selectedDept, setSelectedDept] = useState<string>(targetDept || 'All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState<boolean>(false);

  // Scoped tasks: Only include tasks assigned to more than 1 member (> 1 assignees)
  // Requirement: "IF A TASK IS ASSIGNED TO MORE THAN ONE PERON IT SHOULD COME UNDER TEAM TASK"
  const teamTasks = useMemo(() => {
    return enhancedTasks.filter(t => {
      // Must have more than 1 member assigned (2 or more members)
      const assigneeCount = t.assignees ? t.assignees.length : 0;
      if (assigneeCount <= 1) return false;

      if (!isBroadAccess) {
        const isAssignedToMe = t.assignees.some(a => {
          const assigneeEmpId = (a.employeeId || '').toLowerCase().trim();
          const assigneeName = (a.employeeName || '').toLowerCase().trim();
          return (
            (currentEmpId && assigneeEmpId === currentEmpId) ||
            (currentName && (assigneeName === currentName || assigneeName.includes(currentName) || currentName.includes(assigneeName)))
          );
        });
        if (!isAssignedToMe) return false;
      }

      if (isBroadAccess && selectedDept !== 'All' && t.department !== selectedDept) return false;
      if (!isBroadAccess && isManager && currentUser.department && t.department !== currentUser.department) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesNo = t.taskNumber.toLowerCase().includes(q);
        const matchesDept = t.department.toLowerCase().includes(q);
        const matchesLead = t.responsiblePersonName.toLowerCase().includes(q);
        const matchesAssignee = t.assignees.some(a => a.employeeName.toLowerCase().includes(q));
        if (!matchesTitle && !matchesNo && !matchesDept && !matchesLead && !matchesAssignee) {
          return false;
        }
      }

      return true;
    });
  }, [enhancedTasks, selectedDept, isManager, isBroadAccess, currentUser, currentEmpId, currentName, searchTerm]);

  // Paginated tasks
  const paginatedTasks = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      return teamTasks;
    }
    const start = (currentPage - 1) * pageSize;
    return teamTasks.slice(start, start + pageSize);
  }, [teamTasks, currentPage, pageSize]);

  // Assignee individual status badge styling
  const getAssigneeStatusStyle = (status?: TaskAssigneeStatus) => {
    switch (status) {
      case 'Completed':
        return { bg: '#DCFCE7', color: '#166534' };
      case 'In Progress':
      case 'In Process':
        return { bg: '#ECFEFF', color: '#0E7490' };
      case 'Under Review':
        return { bg: '#EDE9FE', color: '#6D28D9' };
      case 'Blocked':
        return { bg: '#FEE2E2', color: '#991B1B' };
      case 'Pending':
      default:
        return { bg: '#F1F5F9', color: '#475569' };
    }
  };

  // Overall task status pill styling
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'CLOSED':
        return { bg: '#DCFCE7', color: '#15803D', label: 'Completed' };
      case 'IN PROGRESS':
        return { bg: '#ECFEFF', color: '#0E7490', label: 'In Progress' };
      case 'PARTIALLY COMPLETED':
        return { bg: '#ECFEFF', color: '#0E7490', label: 'In Progress' };
      case 'OVERDUE':
        return { bg: '#FEE2E2', color: '#DC2626', label: 'Overdue' };
      case 'OPEN':
      default:
        return { bg: '#FEF3C7', color: '#B45309', label: 'To Do' };
    }
  };

  // Helper for friendly due text (e.g. "Due Tomorrow", "Due Today", "Oct 28, 2024")
  const getFriendlyDueText = (dueDateStr: string, overallStatus: string) => {
    if (!dueDateStr) return 'No due date';
    const today = new Date().toISOString().split('T')[0];
    const tomorrowObj = new Date();
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrow = tomorrowObj.toISOString().split('T')[0];
    const isCompleted = overallStatus === 'COMPLETED' || overallStatus === 'CLOSED';

    if (dueDateStr === today) return 'Due Today';
    if (dueDateStr === tomorrow) return 'Due Tomorrow';
    if (dueDateStr < today && !isCompleted) return `Overdue (${formatDateDDMMYYYY(dueDateStr)})`;

    try {
      const parts = dueDateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    } catch (e) {}

    return formatDateDDMMYYYY(dueDateStr);
  };

  const getPriorityConfig = (priority: string) => {
    const p = (priority || 'Normal').toLowerCase();
    if (p === 'urgent' || p === 'high') {
      return { label: p === 'urgent' ? 'Urgent' : 'High Priority', bg: '#FEE2E2', text: '#EF4444' };
    }
    if (p === 'medium') {
      return { label: 'Medium', bg: '#FEF3C7', text: '#D97706' };
    }
    return { label: 'Normal', bg: '#DCFCE7', text: '#16A34A' };
  };

  const getStatusConfig = (status: string) => {
    const s = (status || 'Pending').toLowerCase();
    if (s.includes('completed') || s.includes('closed')) {
      return { label: 'Completed', dotColor: '#16A34A', bg: '#DCFCE7', text: '#15803D' };
    }
    if (s.includes('progress') || s.includes('process')) {
      return { label: 'In Progress', dotColor: '#2563EB', bg: '#EFF6FF', text: '#2563EB' };
    }
    if (s.includes('review')) {
      return { label: 'Under Review', dotColor: '#7C3AED', bg: '#F5F3FF', text: '#7C3AED' };
    }
    if (s.includes('overdue')) {
      return { label: 'Overdue', dotColor: '#DC2626', bg: '#FEF2F2', text: '#DC2626' };
    }
    return { label: 'To Do', dotColor: '#F59E0B', bg: '#FFFBEB', text: '#D97706' };
  };

  return (
    <div className="team-tasks-container" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* Top Search & Filter Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '12px', 
        marginBottom: '16px' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            background: '#ECFEFF',
            color: '#0E7490',
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>
              Team Tasks ({teamTasks.length})
            </h3>
            <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
              Tasks assigned to 2 or more members with independent progress tracking
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search 
              size={15} 
              style={{ 
                position: 'absolute', 
                left: '10px', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                color: '#94A3B8' 
              }} 
            />
            <input
              type="text"
              placeholder="Search team tasks..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="form-control"
              style={{ 
                paddingLeft: '32px', 
                fontSize: '0.82rem', 
                height: '36px',
                borderRadius: '8px',
                borderColor: '#E2E8F0'
              }}
            />
          </div>

          {/* Department Filter */}
          {isBroadAccess && (
            <select 
              value={selectedDept} 
              onChange={e => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
              className="form-select"
              style={{ 
                fontSize: '0.82rem', 
                fontWeight: 600,
                color: '#0F172A',
                height: '36px', 
                borderRadius: '8px',
                borderColor: '#CBD5E1',
                paddingLeft: '12px',
                paddingRight: '32px',
                backgroundColor: '#FFFFFF',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
              }}
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Mobile Compact Search & Filter Toolbar (< 768px) */}
      <div className="mobile-only-block" style={{ marginBottom: '12px' }}>
        <div className="mobile-search-filter-bar">
          <div className="mobile-search-input-wrap">
            <Search 
              size={15} 
              style={{ 
                position: 'absolute', 
                left: '10px', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                color: '#94A3B8' 
              }} 
            />
            <input
              type="text"
              placeholder="Search team tasks..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="mobile-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  display: 'flex',
                  padding: 0
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {isBroadAccess && (
            <button
              type="button"
              className={`mobile-filter-trigger-btn ${selectedDept !== 'All' ? 'has-filters' : ''}`}
              onClick={() => setIsFilterSheetOpen(true)}
              aria-label="Open filter options"
            >
              <Filter size={15} />
              <span>Dept</span>
              {selectedDept !== 'All' && (
                <span className="mobile-tab-badge" style={{ background: '#0E7490', color: '#FFFFFF', padding: '1px 5px', fontSize: '0.66rem' }}>
                  1
                </span>
              )}
            </button>
          )}
        </div>

        {/* Active Filter Chips */}
        {selectedDept !== 'All' && (
          <div className="mobile-active-filter-chips">
            <span className="mobile-filter-chip">
              <span>Dept: {selectedDept}</span>
              <button
                type="button"
                className="mobile-filter-chip-clear"
                onClick={() => {
                  setSelectedDept('All');
                  setCurrentPage(1);
                }}
                aria-label="Remove department filter"
              >
                <X size={12} />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Mobile Filter Bottom Sheet */}
      <MobileFilterSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="Filter by Department"
        onReset={() => {
          setSelectedDept('All');
          setCurrentPage(1);
        }}
        onApply={() => {
          setCurrentPage(1);
        }}
      >
        <div>
          <div className="mobile-filter-group-title">Department</div>
          <div className="mobile-filter-chips-grid">
            <button
              type="button"
              className={`mobile-filter-select-chip ${selectedDept === 'All' ? 'selected' : ''}`}
              onClick={() => setSelectedDept('All')}
            >
              All Departments
            </button>
            {departments.map(d => (
              <button
                key={d.id}
                type="button"
                className={`mobile-filter-select-chip ${selectedDept === d.name ? 'selected' : ''}`}
                onClick={() => setSelectedDept(d.name)}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
      </MobileFilterSheet>

      {/* Mobile Section Header (< 768px): CURRENT TASKS (N) + Sort */}
      <div className="mobile-only-block" style={{ marginBottom: '10px' }}>
        <div className="mobile-task-section-header">
          <span className="mobile-task-section-title">
            CURRENT TASKS ({teamTasks.length})
          </span>
          <span className="mobile-task-section-sort">
            Sort by Due Date
          </span>
        </div>
      </div>

      {/* Actionable Team Tasks Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #E7ECF3', borderRadius: '16px' }}>
        {paginatedTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 20px', color: '#64748B' }}>
            <Users size={40} style={{ opacity: 0.35, margin: '0 auto 12px', color: '#0E7490', display: 'block' }} />
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1E293B', marginBottom: '4px' }}>
              No team tasks found
            </div>
            <div style={{ fontSize: '0.84rem', color: '#64748B' }}>
              Tasks assigned to 2 or more members will appear here automatically.
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 768px) */}
            <div className="task-desktop-table">
              <div className="table-responsive no-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <table className="hrms-table" style={{ width: '100%', minWidth: '840px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={{ minWidth: '220px' }}>Task No & Title</th>
                  <th style={{ minWidth: '240px' }}>Team Assignees (Individual Status)</th>
                  <th style={{ minWidth: '130px' }}>Responsible Lead</th>
                  <th style={{ minWidth: '110px' }}>Due Date</th>
                  <th style={{ minWidth: '130px' }}>Status</th>
                  <th style={{ textAlign: 'right', minWidth: '80px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map(task => {
                  const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);
                  const isOverdue = dueStatus === 'Overdue';
                  const statusBadge = getStatusBadgeStyle(task.overallStatus);

                  return (
                    <tr 
                      key={task.id}
                      style={{ transition: 'background-color 0.15s ease', cursor: 'pointer' }}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('button')) return;
                        onSelectTask(task.id);
                      }}
                    >
                      {/* Task No & Title */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                          <span style={{ 
                            fontSize: '0.72rem', 
                            fontWeight: 700, 
                            color: '#0E7490', 
                            background: '#ECFEFF', 
                            padding: '1px 6px', 
                            borderRadius: '4px',
                            border: '1px solid #CFFAFE'
                          }}>
                            {task.taskNumber}
                          </span>
                          <span className={`priority-pill ${task.priority.toLowerCase()}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                            {task.priority}
                          </span>
                        </div>
                        <div 
                          style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0F172A', cursor: 'pointer', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={task.title}
                          onClick={() => onSelectTask(task.id)}
                        >
                          {task.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                          {task.taskCategory} • {task.department}
                        </div>
                      </td>

                      {/* Team Assignees with Independent Progress & Status */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {task.assignees.map(a => {
                            const isCompleted = a.individualStatus === 'Completed' || (a.progressPercentage || 0) === 100;
                            const progress = a.progressPercentage ?? (isCompleted ? 100 : 0);
                            const asnStyle = getAssigneeStatusStyle(a.individualStatus);

                            return (
                              <div key={a.id || a.employeeId} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '9999px',
                                  background: isCompleted ? '#16A34A' : '#0E7490',
                                  color: '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  flexShrink: 0
                                }}>
                                  {a.employeeName.charAt(0).toUpperCase()}
                                </div>
                                <span style={{ 
                                  fontWeight: 600, 
                                  fontSize: '0.78rem', 
                                  color: '#1E293B', 
                                  maxWidth: '120px', 
                                  overflow: 'hidden', 
                                  textOverflow: 'ellipsis', 
                                  whiteSpace: 'nowrap' 
                                }} title={a.employeeName}>
                                  {a.employeeName}
                                </span>
                                <span style={{
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: asnStyle.bg,
                                  color: asnStyle.color,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {a.individualStatus || 'Pending'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      {/* Responsible Lead */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <span style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 600 }}>
                          {task.responsiblePersonName}
                        </span>
                      </td>

                      {/* Due Date */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <span style={{ 
                          fontSize: '0.78rem', 
                          color: isOverdue ? '#dc2626' : '#1e293b', 
                          fontWeight: isOverdue ? 700 : 500 
                        }}>
                          {formatDateDDMMYYYY(task.dueDate)}
                        </span>
                        {isOverdue && (
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#DC2626' }}>
                            Overdue
                          </div>
                        )}
                      </td>

                      {/* Overall Status */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <span style={{ 
                          fontSize: '0.72rem', 
                          fontWeight: 700, 
                          padding: '3px 8px', 
                          borderRadius: '9999px', 
                          background: statusBadge.bg, 
                          color: statusBadge.color,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          whiteSpace: 'nowrap'
                        }}>
                          {task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED' ? (
                            <CheckCircle2 size={12} />
                          ) : isOverdue ? (
                            <AlertCircle size={12} />
                          ) : (
                            <Clock size={12} />
                          )}
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                        <button 
                          type="button"
                          className="btn btn-sm"
                          onClick={() => onSelectTask(task.id)}
                          title="View Task Details"
                          aria-label="View Task Details"
                          style={{
                            padding: '5px 10px',
                            borderRadius: '6px',
                            border: '1px solid #CFFAFE',
                            background: '#ECFEFF',
                            color: '#0E7490',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = '#0E7490';
                            e.currentTarget.style.color = '#FFFFFF';
                            e.currentTarget.style.borderColor = '#0E7490';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = '#ECFEFF';
                            e.currentTarget.style.color = '#0E7490';
                            e.currentTarget.style.borderColor = '#CFFAFE';
                          }}
                        >
                          <Eye size={13} /> Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards View (< 768px): Exact Apple-Style Reference Cards */}
      <div className="task-mobile-cards" style={{ padding: '0 2px' }}>
        {paginatedTasks.map(task => {
          const priorityConfig = getPriorityConfig(task.priority);
          const statusConfig = getStatusConfig(task.overallStatus);
          const friendlyDue = getFriendlyDueText(task.dueDate, task.overallStatus);

          return (
            <div
              key={task.id}
              className="mobile-ref-task-card"
              onClick={() => onSelectTask(task.id)}
            >
              {/* Header: Priority + Department | Status Pill with Dot */}
              <div className="mobile-ref-card-header">
                <div className="mobile-ref-card-tags">
                  <span 
                    className="mobile-ref-priority-tag"
                    style={{
                      backgroundColor: priorityConfig.bg,
                      color: priorityConfig.text
                    }}
                  >
                    {priorityConfig.label}
                  </span>
                  {task.department && (
                    <span className="mobile-ref-dept-tag">
                      {task.department}
                    </span>
                  )}
                </div>

                <span 
                  className="mobile-ref-status-pill"
                  style={{
                    backgroundColor: statusConfig.bg,
                    color: statusConfig.text
                  }}
                >
                  <span 
                    className="ref-status-dot"
                    style={{ backgroundColor: statusConfig.dotColor }}
                  />
                  {statusConfig.label}
                </span>
              </div>

              {/* Card Title */}
              <div className="mobile-ref-card-title">
                {task.title}
              </div>

              {/* Card Description */}
              {task.description ? (
                <div className="mobile-ref-card-desc">
                  {task.description}
                </div>
              ) : (
                <div className="mobile-ref-card-desc" style={{ color: '#64748B' }}>
                  Team ({task.assignees.length}): {task.assignees.map(a => a.employeeName).join(', ')}
                </div>
              )}

              {/* Card Footer: Due Date | Assignee Avatar Cluster */}
              <div className="mobile-ref-card-footer">
                <div className="mobile-ref-due-date">
                  <Calendar size={14} color="#64748B" />
                  <span>{friendlyDue}</span>
                </div>

                <div className="mobile-ref-avatars-cluster">
                  {task.assignees.slice(0, 3).map((a, idx) => (
                    <div 
                      key={a.id || a.employeeId || idx}
                      className={`mobile-ref-avatar-circle ${idx > 0 ? 'secondary' : ''}`}
                      title={`${a.employeeName} (${a.individualStatus || 'Pending'})`}
                    >
                      {(a.employeeName || 'A').charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {task.assignees.length > 3 && (
                    <div 
                      className="mobile-ref-avatar-circle secondary" 
                      style={{ fontSize: '0.62rem', fontWeight: 700 }}
                      title={`+${task.assignees.length - 3} more`}
                    >
                      +{task.assignees.length - 3}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  )}

        {/* Standard Pagination Footer */}
        {teamTasks.length > 0 && (
          <StandardTablePagination
            currentPage={currentPage}
            totalEntries={teamTasks.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            pageSizeOptions={[5, 10]}
          />
        )}
      </div>
    </div>
  );
};
