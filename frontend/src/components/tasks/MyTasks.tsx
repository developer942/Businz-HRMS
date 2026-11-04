import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  CheckCircle2,
  Calendar, 
  Sliders, 
  User,
  Search,
  Filter,
  X
} from 'lucide-react';
import { TaskItemEnhanced, TaskAssigneeStatus, computeDueStatus, isTaskAssignedByMe } from '../../types/tasks';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { MobileFilterSheet } from '../common/MobileFilterSheet';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface MyTasksProps {
  onSelectTask: (taskId: string) => void;
  onSwitchToAssigned?: () => void;
}

export const MyTasks: React.FC<MyTasksProps> = ({ onSelectTask, onSwitchToAssigned }) => {
  const { enhancedTasks, currentUser } = useHRMS();

  // Default directly to 'pending' (To Do) so newly created tasks appear immediately
  const [activeSection, setActiveSection] = useState<'all' | 'pending' | 'in_progress' | 'today' | 'completed' | 'overdue'>('pending');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Multi-row selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState<boolean>(false);

  const handleToggleTask = (id: string) => {
    setSelectedTaskIds(prev => 
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    );
  };

  const currentEmpId = currentUser.employeeId || currentUser.id || 'EMP-001';

  // Helper to reliably find the logged-in employee's assignee record on a task
  const getAssigneeForTask = (task: TaskItemEnhanced) => {
    return task.assignees.find(a => 
      a.employeeId === currentEmpId ||
      a.employeeId === currentUser.id ||
      (currentUser.name && a.employeeName?.toLowerCase().includes(currentUser.name.toLowerCase()))
    ) || task.assignees[0];
  };

  // Tasks assigned to the current employee to execute
  const myAssignedTasks = useMemo(() => {
    return enhancedTasks.filter(task => 
      task.assignees.some(a => 
        a.employeeId === currentEmpId ||
        a.employeeId === currentUser.id ||
        (currentUser.name && a.employeeName?.toLowerCase().includes(currentUser.name.toLowerCase()))
      ) ||
      task.responsiblePersonId === currentEmpId ||
      task.responsiblePersonId === currentUser.id
    );
  }, [enhancedTasks, currentEmpId, currentUser]);

  const today = new Date().toISOString().split('T')[0];

  // Live count summary for each status section
  const sectionCounts = useMemo(() => {
    return {
      pending: myAssignedTasks.filter(t => {
        const a = getAssigneeForTask(t);
        return (a?.individualStatus === 'Pending' || (a?.progressPercentage || 0) === 0 || t.overallStatus === 'OPEN') && a?.individualStatus !== 'Completed';
      }).length,
      in_progress: myAssignedTasks.filter(t => {
        const a = getAssigneeForTask(t);
        return (a?.individualStatus === 'In Progress' || a?.individualStatus === 'In Process' || (a?.progressPercentage || 0) > 0) && a?.progressPercentage !== 100 && a?.individualStatus !== 'Completed';
      }).length,
      today: myAssignedTasks.filter(t => {
        const a = getAssigneeForTask(t);
        return t.dueDate === today && a?.progressPercentage !== 100 && a?.individualStatus !== 'Completed';
      }).length,
      completed: myAssignedTasks.filter(t => {
        const a = getAssigneeForTask(t);
        return a?.individualStatus === 'Completed' || a?.progressPercentage === 100 || t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED';
      }).length,
      overdue: myAssignedTasks.filter(t => {
        const a = getAssigneeForTask(t);
        return computeDueStatus(t.dueDate, t.overallStatus) === 'Overdue' && a?.progressPercentage !== 100 && a?.individualStatus !== 'Completed';
      }).length,
      all: myAssignedTasks.length
    };
  }, [myAssignedTasks, today, currentEmpId]);

  // Count tasks assigned by the current user to others
  const assignedByMeCount = useMemo(() => {
    return enhancedTasks.filter(t => isTaskAssignedByMe(t, currentUser)).length;
  }, [enhancedTasks, currentUser]);

  // Section categorization and search filtering
  const sectionTasks = useMemo(() => {
    return myAssignedTasks.filter(task => {
      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesNo = task.taskNumber.toLowerCase().includes(q);
        const matchesTitle = task.title.toLowerCase().includes(q);
        const matchesDept = task.department?.toLowerCase().includes(q);
        const matchesLead = task.responsiblePersonName?.toLowerCase().includes(q);
        if (!matchesNo && !matchesTitle && !matchesDept && !matchesLead) {
          return false;
        }
      }

      const myAssignee = getAssigneeForTask(task);
      const isCompleted = myAssignee?.individualStatus === 'Completed' || (myAssignee?.progressPercentage || 0) === 100 || task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED';
      const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);

      if (activeSection === 'all') {
        return true;
      }
      if (activeSection === 'pending') {
        return (
          myAssignee?.individualStatus === 'Pending' || 
          (myAssignee?.progressPercentage || 0) === 0 || 
          task.overallStatus === 'OPEN'
        ) && !isCompleted;
      }
      if (activeSection === 'today') {
        return task.dueDate === today && !isCompleted;
      }
      if (activeSection === 'in_progress') {
        return (myAssignee?.individualStatus === 'In Progress' || myAssignee?.individualStatus === 'In Process' || (myAssignee?.progressPercentage || 0) > 0) && !isCompleted;
      }
      if (activeSection === 'completed') {
        return isCompleted;
      }
      if (activeSection === 'overdue') {
        return dueStatus === 'Overdue' && !isCompleted;
      }
      return true;
    });
  }, [myAssignedTasks, activeSection, currentEmpId, today, searchTerm]);

  // Paginated tasks (on mobile screens, show all section tasks without pagination slicing)
  
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
      return { label: 'In Review', dotColor: '#7C3AED', bg: '#FAF5FF', text: '#7C3AED' };
    }
    return { label: 'To Do', dotColor: '#D97706', bg: '#FEF3C7', text: '#B45309' };
  };

  const paginatedTasks = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      return sectionTasks;
    }
    const start = (currentPage - 1) * pageSize;
    return sectionTasks.slice(start, start + pageSize);
  }, [sectionTasks, currentPage, pageSize]);

  const handleToggleSelectAll = () => {
    if (paginatedTasks.length > 0 && paginatedTasks.every(t => selectedTaskIds.includes(t.id))) {
      setSelectedTaskIds(prev => prev.filter(id => !paginatedTasks.some(t => t.id === id)));
    } else {
      const pageIds = paginatedTasks.map(t => t.id);
      setSelectedTaskIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  return (
    <div className="my-tasks-container">

      {/* Top Controls: Status Dropdown & Search Bar */}
      <div className="my-tasks-filters-bar" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '12px', 
        marginBottom: '20px' 
      }}>
        {/* Status Dropdown Filter */}
        <div className="my-tasks-filter-select-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label 
            htmlFor="my-tasks-status-filter"
            style={{ fontSize: '0.84rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Filter size={15} style={{ color: '#0E7490' }} />
            <span>Status:</span>
          </label>
          <select
            id="my-tasks-status-filter"
            value={activeSection}
            onChange={e => {
              setActiveSection(e.target.value as any);
              setCurrentPage(1);
            }}
            className="form-select"
            aria-label="Filter my tasks by status"
            style={{ 
              fontSize: '0.84rem', 
              fontWeight: 600,
              color: '#0F172A',
              height: '38px', 
              borderRadius: '8px', 
              borderColor: '#CBD5E1', 
              paddingLeft: '12px', 
              paddingRight: '32px', 
              minWidth: '200px',
              backgroundColor: '#FFFFFF', 
              cursor: 'pointer', 
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)' 
            }}
          >
            <option value="pending">To Do ({sectionCounts.pending})</option>
            <option value="in_progress">In Progress ({sectionCounts.in_progress})</option>
            <option value="today">Today's Tasks ({sectionCounts.today})</option>
            <option value="completed">Completed ({sectionCounts.completed})</option>
            <option value="overdue">Overdue ({sectionCounts.overdue})</option>
            <option value="all">All Tasks ({sectionCounts.all})</option>
          </select>
        </div>

        {/* Search Box */}
        <div className="my-tasks-search-group" style={{ position: 'relative', width: '240px' }}>
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
            placeholder="Search my tasks..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="form-control"
            style={{ 
              paddingLeft: '32px', 
              paddingRight: searchTerm ? '28px' : '10px',
              fontSize: '0.82rem', 
              height: '38px',
              borderRadius: '8px',
              borderColor: '#CBD5E1'
            }}
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
      </div>

      {/* Mobile Compact Search & Filter Toolbar (< 768px) */}
      <div className="mobile-only-block" style={{ marginBottom: '6px' }}>
        <div className="mobile-search-filter-bar">
          <div className="mobile-search-input-wrap">
            <Search 
              size={15} 
              style={{ 
                position: 'absolute', 
                left: '12px', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                color: '#94A3B8' 
              }} 
            />
            <input
              type="text"
              placeholder="Search my tasks..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="mobile-search-input"
              style={{ borderRadius: '12px', height: '40px', paddingLeft: '34px' }}
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
                  right: '10px',
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

          <button
            type="button"
            className={`mobile-filter-trigger-btn ${activeSection !== 'all' ? 'has-filters' : ''}`}
            onClick={() => setIsFilterSheetOpen(true)}
            aria-label="Open filter options"
            style={{ borderRadius: '12px', height: '40px', padding: '0 14px' }}
          >
            <Filter size={15} />
            <span>Filters</span>
            {activeSection !== 'all' && (
              <span className="mobile-tab-badge" style={{ background: '#0E7490', color: '#FFFFFF', padding: '1px 6px', fontSize: '0.68rem' }}>
                1
              </span>
            )}
          </button>
        </div>

        {/* Active Filter Chips & Reset All */}
        {activeSection !== 'all' && (
          <div className="mobile-active-filter-chips-row">
            <span className="mobile-ref-filter-chip">
              <span>Status: {
                activeSection === 'pending' ? 'To Do' :
                activeSection === 'in_progress' ? 'In Progress' :
                activeSection === 'today' ? "Today's Tasks" :
                activeSection === 'completed' ? 'Completed' :
                activeSection === 'overdue' ? 'Overdue' : 'All'
              }</span>
              <button
                type="button"
                className="mobile-ref-filter-chip-clear"
                onClick={() => {
                  setActiveSection('all');
                  setCurrentPage(1);
                }}
                aria-label="Remove status filter"
              >
                <X size={12} />
              </button>
            </span>
            <button
              type="button"
              className="mobile-filter-reset-all-btn"
              onClick={() => {
                setActiveSection('all');
                setSearchTerm('');
                setCurrentPage(1);
              }}
            >
              Reset all
            </button>
          </div>
        )}

        {/* Current Tasks Section Header */}
        <div className="mobile-task-section-header">
          <span className="mobile-task-section-title">
            CURRENT TASKS ({sectionTasks.length})
          </span>
          <span className="mobile-task-section-sort">
            Sort by Due Date
          </span>
        </div>
      </div>

      {/* Mobile Filter Bottom Sheet */}
      <MobileFilterSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="Filter Tasks by Status"
        onReset={() => {
          setActiveSection('all');
          setCurrentPage(1);
        }}
        onApply={() => {
          setCurrentPage(1);
        }}
      >
        <div>
          <div className="mobile-filter-group-title">Status Option</div>
          <div className="mobile-filter-chips-grid">
            {[
              { id: 'pending', label: `To Do (${sectionCounts.pending})` },
              { id: 'in_progress', label: `In Progress (${sectionCounts.in_progress})` },
              { id: 'today', label: `Today's Tasks (${sectionCounts.today})` },
              { id: 'completed', label: `Completed (${sectionCounts.completed})` },
              { id: 'overdue', label: `Overdue (${sectionCounts.overdue})` },
              { id: 'all', label: `All Tasks (${sectionCounts.all})` }
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`mobile-filter-select-chip ${activeSection === opt.id ? 'selected' : ''}`}
                onClick={() => {
                  setActiveSection(opt.id as any);
                  setCurrentPage(1);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </MobileFilterSheet>

      {/* TASKS LIST VIEW */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {sectionTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={40} style={{ opacity: 0.35, margin: '0 auto 12px', color: '#0E7490', display: 'block' }} />
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1E293B', marginBottom: '4px' }}>
              {searchTerm 
                ? `No tasks matching "${searchTerm}"`
                : `No ${activeSection === 'all' ? '' : activeSection.replace('_', ' ')} tasks found`}
            </div>
            <div style={{ fontSize: '0.84rem', color: '#64748B' }}>
              {searchTerm ? 'Try adjusting your search query' : 'You are all caught up!'}
            </div>
            {(searchTerm || activeSection !== 'pending') && (
              <div style={{ marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setActiveSection('pending');
                    setCurrentPage(1);
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Reset Filters
                </button>
              </div>
            )}
            {onSwitchToAssigned && assignedByMeCount > 0 && (
              <div style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={onSwitchToAssigned}
                  className="btn btn-primary btn-sm"
                  style={{
                    background: '#0E7490',
                    borderColor: '#0E7490',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    padding: '8px 16px',
                    borderRadius: '8px'
                  }}
                >
                  View Tasks Assigned by You ({assignedByMeCount}) →
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 768px) */}
            <div className="task-desktop-table">
              <div className="table-responsive">
                <table className="hrms-table" style={{ width: '100%', minWidth: '920px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px', minWidth: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={paginatedTasks.length > 0 && paginatedTasks.every(t => selectedTaskIds.includes(t.id))}
                          onChange={handleToggleSelectAll}
                          style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                          aria-label="Select all tasks"
                        />
                      </th>
                      <th>Task No & Title</th>
                      <th>Priority</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTasks.map(task => {
                      const myAssignee = getAssigneeForTask(task);
                      const myStatus = myAssignee?.individualStatus || 'Pending';
                      const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);
                      const isSelected = selectedTaskIds.includes(task.id);

                      return (
                        <tr 
                          key={task.id} 
                          style={{
                            backgroundColor: isSelected ? '#ECFEFF' : undefined,
                            borderLeft: isSelected ? '4px solid #0E7490' : undefined,
                            transition: 'background-color 0.15s ease',
                            cursor: 'pointer'
                          }}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('input[type="checkbox"]') || target.closest('button')) return;
                            onSelectTask(task.id);
                          }}
                        >
                          <td style={{ textAlign: 'center', verticalAlign: 'middle', width: '40px' }} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleTask(task.id)}
                              style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                              aria-label={`Select task ${task.taskNumber}`}
                            />
                          </td>
                          <td>
                            <div 
                              style={{ fontWeight: 700, color: '#0E7490', cursor: 'pointer', fontSize: '0.88rem' }}
                              onClick={() => onSelectTask(task.id)}
                            >
                              {task.taskNumber}: {task.title}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Lead: <strong>{task.responsiblePersonName}</strong> • {task.department} • Assigned by: {task.assignedBy || task.createdBy}
                            </div>

                            {/* Task Description / Scope preview */}
                            {task.description && (
                              <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '4px', lineHeight: 1.4, maxWidth: '460px' }}>
                                {task.description.length > 130 ? `${task.description.slice(0, 130)}...` : task.description}
                              </div>
                            )}
                          </td>

                          <td>
                            <span className={`priority-pill ${task.priority.toLowerCase()}`} style={{ fontSize: '0.72rem' }}>
                              {task.priority}
                            </span>
                          </td>

                          <td>
                            <span style={{ fontSize: '0.78rem', color: dueStatus === 'Overdue' ? '#dc2626' : 'inherit', fontWeight: dueStatus === 'Overdue' ? 700 : 400 }}>
                              {formatDateDDMMYYYY(task.dueDate)}
                            </span>
                          </td>

                          <td>
                            <span className={`status-pill ${
                              myStatus === 'Completed' ? 'present' :
                              myStatus === 'In Progress' || myStatus === 'In Process' ? 'late' :
                              myStatus === 'Under Review' ? 'pending' : 'half-day'
                            }`} style={{ fontSize: '0.74rem', whiteSpace: 'nowrap', display: 'inline-block', fontWeight: 600 }}>
                              {myStatus}
                            </span>
                          </td>

                          <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button 
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => onSelectTask(task.id)}
                                style={{ 
                                  fontSize: '0.75rem', 
                                  padding: '5px 12px', 
                                  background: '#0E7490', 
                                  borderColor: '#0E7490', 
                                  fontWeight: 700,
                                  borderRadius: '8px'
                                }}
                              >
                                Update Status
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards View (< 768px): Exact Apple-Style Reference Cards */}
            <div className="task-mobile-cards" style={{ padding: '0 2px' }}>
              {paginatedTasks.map(task => {
                const myAssignee = getAssigneeForTask(task);
                const myStatus = myAssignee?.individualStatus || 'Pending';
                const isSelected = selectedTaskIds.includes(task.id);
                const priorityConfig = getPriorityConfig(task.priority);
                const statusConfig = getStatusConfig(myStatus);
                const friendlyDue = getFriendlyDueText(task.dueDate, task.overallStatus);
                const initialLetter = (currentUser.name || task.responsiblePersonName || 'U').charAt(0).toUpperCase();

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
                    {task.description && (
                      <div className="mobile-ref-card-desc">
                        {task.description}
                      </div>
                    )}

                    {/* Card Footer: Due Date | Assignee Avatar Circle */}
                    <div className="mobile-ref-card-footer">
                      <div className="mobile-ref-due-date">
                        <Calendar size={14} color="#64748B" />
                        <span>{friendlyDue}</span>
                      </div>

                      <div className="mobile-ref-avatars-cluster">
                        {task.assignees.length > 1 && (
                          <div className="mobile-ref-avatar-circle secondary" title={task.assignees[1]?.employeeName}>
                            {(task.assignees[1]?.employeeName || 'A').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="mobile-ref-avatar-circle" title={task.responsiblePersonName || currentUser.name}>
                          {initialLetter}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Standard Table Pagination */}
      {sectionTasks.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <StandardTablePagination
            currentPage={currentPage}
            pageSize={pageSize}
            totalEntries={sectionTasks.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      {/* Floating Action Bar per AGENTS.md */}
      <StandardFloatingActionBar
        selectedCount={selectedTaskIds.length}
        onClearSelection={() => setSelectedTaskIds([])}
        onEdit={
          selectedTaskIds.length === 1 &&
          (() => {
            const t = sectionTasks.find(item => item.id === selectedTaskIds[0]);
            const isSuperAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'ERP Administrator';
            return t ? (isTaskAssignedByMe(t, currentUser) || isSuperAdmin) : false;
          })()
            ? () => onSelectTask(selectedTaskIds[0])
            : undefined
        }
        customActions={
          <button
            type="button"
            className="action-bar-btn"
            onClick={() => {
              const first = sectionTasks.find(t => selectedTaskIds.includes(t.id));
              if (first) {
                onSelectTask(first.id);
              }
            }}
          >
            <Sliders size={14} />
            <span>Update Status</span>
          </button>
        }
      />
    </div>
  );
};
