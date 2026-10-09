import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Users, 
  CheckCircle2, 
  Search, 
  Eye,
  AlertCircle,
  Clock
} from 'lucide-react';
import { computeDueStatus, TaskAssigneeStatus } from '../../types/tasks';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { StandardTablePagination } from '../common/StandardTablePagination';

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
        return { bg: '#F3E8FF', color: '#7E22CE', label: 'Partially Completed' };
      case 'OVERDUE':
        return { bg: '#FEE2E2', color: '#DC2626', label: 'Overdue' };
      case 'OPEN':
      default:
        return { bg: '#FEF3C7', color: '#B45309', label: 'To Do' };
    }
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
