import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  CheckSquare, 
  CheckCircle2, 
  Search, 
  Plus, 
  Calendar, 
  AlertCircle, 
  Clock, 
  Eye, 
  Trash2, 
  User, 
  Building,
  ArrowRight,
  Filter,
  Users
} from 'lucide-react';
import { TaskItemEnhanced, TaskAssigneeStatus, computeDueStatus, isTaskAssignedByMe } from '../../types/tasks';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface AssignedTasksProps {
  onSelectTask: (taskId: string) => void;
  onAssignNewTask?: () => void;
}

export const AssignedTasks: React.FC<AssignedTasksProps> = ({ onSelectTask, onAssignNewTask }) => {
  const { enhancedTasks, currentUser, deleteEnhancedTask, departments } = useHRMS();

  // Section Filter State - defaults to 'all' or 'in_progress'
  const [activeSection, setActiveSection] = useState<'all' | 'pending' | 'in_progress' | 'today' | 'completed' | 'overdue'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('All');

  // Multi-row selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const today = new Date().toISOString().split('T')[0];

  // 1. Filter only tasks assigned or created by the current user.
  // My Tasks handles tasks assigned to the current user; keep these tabs separate.
  const assignedByMeTasks = useMemo(() => {
    return enhancedTasks.filter(task => isTaskAssignedByMe(task, currentUser));
  }, [enhancedTasks, currentUser]);

  // 2. Filter by search & department
  const filteredAssignedTasks = useMemo(() => {
    return assignedByMeTasks.filter(task => {
      // Department filter
      if (selectedDept !== 'All' && task.department !== selectedDept) {
        return false;
      }

      // Search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesNo = task.taskNumber.toLowerCase().includes(query);
        const matchesDept = task.department.toLowerCase().includes(query);
        const matchesAssignee = task.assignees.some(a => a.employeeName.toLowerCase().includes(query));
        const matchesResp = task.responsiblePersonName.toLowerCase().includes(query);

        if (!matchesTitle && !matchesNo && !matchesDept && !matchesAssignee && !matchesResp) {
          return false;
        }
      }

      return true;
    });
  }, [assignedByMeTasks, selectedDept, searchTerm]);

  // 3. Section counts (computed before section filtering)
  const sectionCounts = useMemo(() => {
    const list = filteredAssignedTasks;
    return {
      all: list.length,
      pending: list.filter(t => {
        const isCompleted = t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED' || t.overallProgress === 100;
        return (t.overallStatus === 'OPEN' || t.overallProgress === 0) && !isCompleted;
      }).length,
      in_progress: list.filter(t => {
        const isCompleted = t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED' || t.overallProgress === 100;
        return (t.overallStatus === 'IN PROGRESS' || t.overallStatus === 'PARTIALLY COMPLETED' || (t.overallProgress > 0 && t.overallProgress < 100)) && !isCompleted;
      }).length,
      today: list.filter(t => {
        const isCompleted = t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED' || t.overallProgress === 100;
        return t.dueDate === today && !isCompleted;
      }).length,
      completed: list.filter(t => {
        return t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED' || t.overallProgress === 100;
      }).length,
      overdue: list.filter(t => {
        const isCompleted = t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED' || t.overallProgress === 100;
        return computeDueStatus(t.dueDate, t.overallStatus) === 'Overdue' && !isCompleted;
      }).length,
    };
  }, [filteredAssignedTasks, today]);

  // 4. Filter by active section
  const sectionTasks = useMemo(() => {
    return filteredAssignedTasks.filter(task => {
      const isCompleted = task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED' || task.overallProgress === 100;
      const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);

      if (activeSection === 'all') return true;
      if (activeSection === 'pending') {
        return (task.overallStatus === 'OPEN' || task.overallProgress === 0) && !isCompleted;
      }
      if (activeSection === 'in_progress') {
        return (task.overallStatus === 'IN PROGRESS' || task.overallStatus === 'PARTIALLY COMPLETED' || (task.overallProgress > 0 && task.overallProgress < 100)) && !isCompleted;
      }
      if (activeSection === 'today') {
        return task.dueDate === today && !isCompleted;
      }
      if (activeSection === 'completed') {
        return isCompleted;
      }
      if (activeSection === 'overdue') {
        return dueStatus === 'Overdue' && !isCompleted;
      }
      return true;
    });
  }, [filteredAssignedTasks, activeSection, today]);

  // 5. Paginated tasks
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sectionTasks.slice(start, start + pageSize);
  }, [sectionTasks, currentPage, pageSize]);

  // Reset to page 1 on filter changes
  const handleSectionChange = (section: any) => {
    setActiveSection(section);
    setCurrentPage(1);
  };

  const handleToggleTask = (id: string) => {
    setSelectedTaskIds(prev => 
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (paginatedTasks.length > 0 && paginatedTasks.every(t => selectedTaskIds.includes(t.id))) {
      setSelectedTaskIds(prev => prev.filter(id => !paginatedTasks.some(t => t.id === id)));
    } else {
      const pageIds = paginatedTasks.map(t => t.id);
      setSelectedTaskIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedTaskIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedTaskIds.length} task(s)?`)) {
      selectedTaskIds.forEach(id => deleteEnhancedTask(id));
      setSelectedTaskIds([]);
    }
  };

  // Helper for priority color
  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'Urgent':
        return { bg: '#FEE2E2', color: '#EF4444', border: '#FECACA' };
      case 'High':
        return { bg: '#FFEDD5', color: '#EA580C', border: '#FED7AA' };
      case 'Medium':
        return { bg: '#ECFEFF', color: '#0E7490', border: '#CFFAFE' };
      case 'Low':
      default:
        return { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' };
    }
  };

  // Helper for overall status pill
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'CLOSED':
        return { bg: '#DCFCE7', color: '#15803D', label: 'Completed' };
      case 'IN PROGRESS':
        return { bg: '#ECFEFF', color: '#0E7490', label: 'In Progress' };
      case 'PARTIALLY COMPLETED':
        return { bg: '#F3E8FF', color: '#7E22CE', label: 'Partially Completed' };
      case 'OVERDUE':
        return { bg: '#FEE2E2', color: '#DC2626', label: 'Overdue' };
      case 'OPEN':
      default:
        return { bg: '#FEF3C7', color: '#B45309', label: 'To Do' };
    }
  };

  // Helper for assignee individual status badge
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

  return (
    <div className="assigned-tasks-container" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      
      {/* Top Controls: Quick Tabs & Search Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '12px', 
        marginBottom: '20px' 
      }}>
        {/* Quick Filter Section Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Tasks', count: sectionCounts.all },
            { id: 'pending', label: 'To Do', count: sectionCounts.pending },
            { id: 'in_progress', label: 'In Progress', count: sectionCounts.in_progress },
            { id: 'today', label: "Today's Tasks", count: sectionCounts.today },
            { id: 'completed', label: 'Completed', count: sectionCounts.completed },
            { id: 'overdue', label: 'Overdue', count: sectionCounts.overdue }
          ].map(sec => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => handleSectionChange(sec.id)}
                className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                style={{ 
                  fontSize: '0.82rem', 
                  padding: '7px 14px', 
                  borderRadius: '10px', 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isActive ? '#0E7490' : '#ffffff',
                  borderColor: isActive ? '#0E7490' : '#E2E8F0',
                  color: isActive ? '#ffffff' : '#334155',
                  boxShadow: isActive ? '0 2px 5px rgba(14, 116, 144, 0.25)' : 'none',
                  fontWeight: isActive ? 700 : 500,
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{sec.label}</span>
                <span style={{ 
                  background: isActive ? 'rgba(255,255,255,0.25)' : '#F1F5F9', 
                  color: isActive ? '#ffffff' : '#475569', 
                  padding: '1px 7px', 
                  borderRadius: '9999px', 
                  fontSize: '0.72rem', 
                  fontWeight: 700 
                }}>
                  {sec.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Department Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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
              placeholder="Search assigned tasks..."
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

          <select
            value={selectedDept}
            onChange={e => {
              setSelectedDept(e.target.value);
              setCurrentPage(1);
            }}
            className="form-select"
            style={{ 
              fontSize: '0.82rem', 
              height: '36px', 
              borderRadius: '8px', 
              borderColor: '#E2E8F0',
              paddingLeft: '10px',
              paddingRight: '28px',
              cursor: 'pointer'
            }}
          >
            <option value="All">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TASKS TABLE VIEW */}
      <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #E7ECF3', borderRadius: '16px' }}>
        <div className="table-responsive">
          <table className="hrms-table" style={{ width: '100%', minWidth: '810px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ width: '42px', minWidth: '42px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={paginatedTasks.length > 0 && paginatedTasks.every(t => selectedTaskIds.includes(t.id))}
                    onChange={handleToggleSelectAll}
                    style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                    aria-label="Select all tasks on this page"
                  />
                </th>
                <th style={{ minWidth: '220px' }}>Task No & Title</th>
                <th style={{ minWidth: '200px' }}>Assigned To (Assignees)</th>
                <th style={{ minWidth: '130px' }}>Department</th>
                <th style={{ minWidth: '120px' }}>Due Date</th>
                <th style={{ minWidth: '110px' }}>Status</th>
                <th style={{ minWidth: '90px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
                    <CheckSquare size={40} style={{ opacity: 0.3, margin: '0 auto 12px', color: '#0E7490' }} />
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1E293B', marginBottom: '4px' }}>
                      {assignedByMeTasks.length === 0 
                        ? "You haven't assigned any tasks yet" 
                        : "No assigned tasks match your criteria"}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#64748B', maxWidth: '420px', margin: '0 auto 16px' }}>
                      {assignedByMeTasks.length === 0 
                        ? 'Click "+ Assign Task" to delegate tasks to team members and monitor their real-time progress and completion here.'
                        : 'Try adjusting your search filters or switching to another category.'}
                    </div>
                    {onAssignNewTask && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={onAssignNewTask}
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          background: '#0E7490', 
                          borderColor: '#0E7490',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontWeight: 700
                        }}
                      >
                        <Plus size={16} /> Assign New Task
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedTasks.map(task => {
                  const isSelected = selectedTaskIds.includes(task.id);
                  const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);
                  const isOverdue = dueStatus === 'Overdue';
                  const isDueToday = task.dueDate === today;
                  const priorityStyle = getPriorityStyle(task.priority);
                  const statusBadge = getStatusBadgeStyle(task.overallStatus);

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
                      {/* Checkbox */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', width: '42px' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleTask(task.id)}
                          style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                          aria-label={`Select task ${task.taskNumber}`}
                        />
                      </td>

                      {/* Task No & Title */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
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
                          <span style={{ 
                            fontSize: '0.68rem', 
                            fontWeight: 700, 
                            padding: '1px 6px', 
                            borderRadius: '9999px',
                            background: priorityStyle.bg,
                            color: priorityStyle.color,
                            border: `1px solid ${priorityStyle.border}`
                          }}>
                            {task.priority}
                          </span>
                        </div>
                        <div style={{ 
                          fontWeight: 700, 
                          fontSize: '0.88rem', 
                          color: '#0F172A', 
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '280px'
                        }} title={task.title}>
                          {task.title}
                        </div>
                      </td>

                      {/* Assignees with status */}
                      <td style={{ verticalAlign: 'middle' }}>
                        {task.assignees.length === 0 ? (
                          <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Unassigned</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {task.assignees.slice(0, 3).map(asn => {
                              const asnStyle = getAssigneeStatusStyle(asn.individualStatus);
                              const progress = asn.progressPercentage ?? (asn.individualStatus === 'Completed' ? 100 : 0);
                              const isCompleted = asn.individualStatus === 'Completed' || progress === 100;
                              return (
                                <div key={asn.id || asn.employeeId} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <div style={{ 
                                    width: '22px', 
                                    height: '22px', 
                                    borderRadius: '9999px', 
                                    background: isCompleted ? '#16A34A' : '#0E7490', 
                                    color: '#ffffff', 
                                    fontSize: '0.65rem', 
                                    fontWeight: 700, 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}>
                                    {asn.employeeName.charAt(0).toUpperCase()}
                                  </div>
                                  <span style={{ 
                                    fontSize: '0.8rem', 
                                    fontWeight: 600, 
                                    color: '#1E293B',
                                    maxWidth: '120px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }} title={asn.employeeName}>
                                    {asn.employeeName}
                                  </span>
                                  <span style={{ 
                                    fontSize: '0.65rem', 
                                    fontWeight: 700, 
                                    padding: '1px 6px', 
                                    borderRadius: '4px',
                                    background: asnStyle.bg,
                                    color: asnStyle.color,
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {asn.individualStatus || 'Pending'}
                                  </span>
                                </div>
                              );
                            })}
                            {task.assignees.length > 3 && (
                              <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                                +{task.assignees.length - 3} more assignees
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Department */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <span style={{ 
                          fontSize: '0.78rem', 
                          fontWeight: 600, 
                          color: '#475569', 
                          background: '#F8FAFC', 
                          padding: '2px 8px', 
                          borderRadius: '6px',
                          border: '1px solid #E2E8F0'
                        }}>
                          {task.department || 'General'}
                        </span>
                      </td>

                      {/* Due Date */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Calendar size={13} style={{ color: isOverdue ? '#EF4444' : isDueToday ? '#F59E0B' : '#64748B' }} />
                          <span style={{ 
                            fontSize: '0.82rem', 
                            fontWeight: isOverdue || isDueToday ? 700 : 500,
                            color: isOverdue ? '#DC2626' : isDueToday ? '#B45309' : '#1E293B'
                          }}>
                            {formatDateDDMMYYYY(task.dueDate)}
                          </span>
                        </div>
                        {isOverdue && task.overallStatus !== 'COMPLETED' && task.overallStatus !== 'CLOSED' && (
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>
                            Overdue
                          </div>
                        )}
                        {isDueToday && task.overallStatus !== 'COMPLETED' && task.overallStatus !== 'CLOSED' && (
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#B45309', marginTop: '2px' }}>
                            Due Today
                          </div>
                        )}
                      </td>

                      {/* Overall Status */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <span style={{ 
                          fontSize: '0.74rem', 
                          fontWeight: 700, 
                          padding: '3px 9px', 
                          borderRadius: '9999px', 
                          background: statusBadge.bg, 
                          color: statusBadge.color,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
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
                      <td style={{ textAlign: 'right', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => onSelectTask(task.id)}
                            style={{ 
                              padding: '5px 10px', 
                              borderRadius: '6px', 
                              fontSize: '0.75rem', 
                              fontWeight: 600, 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '4px',
                              color: '#0E7490',
                              borderColor: '#CFFAFE',
                              background: '#ECFEFF'
                            }}
                            title="View task details"
                          >
                            <Eye size={13} /> Details
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete task "${task.title}"?`)) {
                                deleteEnhancedTask(task.id);
                              }
                            }}
                            style={{ 
                              padding: '5px 7px', 
                              borderRadius: '6px', 
                              fontSize: '0.75rem', 
                              color: '#94A3B8',
                              borderColor: 'transparent',
                              background: 'transparent'
                            }}
                            title="Delete task"
                            onMouseEnter={e => {
                              e.currentTarget.style.color = '#EF4444';
                              e.currentTarget.style.background = '#FEE2E2';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.color = '#94A3B8';
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Standard Pagination Footer */}
        {sectionTasks.length > 0 && (
          <StandardTablePagination
            currentPage={currentPage}
            totalEntries={sectionTasks.length}
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

      {/* Floating Action Bar */}
      <StandardFloatingActionBar
        selectedCount={selectedTaskIds.length}
        onDelete={handleDeleteSelected}
        onClearSelection={() => setSelectedTaskIds([])}
      />
    </div>
  );
};
