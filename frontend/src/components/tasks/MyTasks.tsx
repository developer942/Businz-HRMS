import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  CheckCircle2, 
  Sliders, 
  User, 
  Paperclip, 
  FileText 
} from 'lucide-react';
import { TaskItemEnhanced, TaskAssigneeStatus, computeDueStatus, isTaskAssignedByMe } from '../../types/tasks';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface MyTasksProps {
  onSelectTask: (taskId: string) => void;
  onSwitchToAssigned?: () => void;
}

export const MyTasks: React.FC<MyTasksProps> = ({ onSelectTask, onSwitchToAssigned }) => {
  const { enhancedTasks, currentUser } = useHRMS();

  // Default directly to 'pending' (To Do) so newly created tasks appear immediately
  const [activeSection, setActiveSection] = useState<'all' | 'pending' | 'in_progress' | 'today' | 'completed' | 'overdue'>('pending');

  // Multi-row selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

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

  // Count tasks assigned by the current user to others
  const assignedByMeCount = useMemo(() => {
    return enhancedTasks.filter(t => isTaskAssignedByMe(t, currentUser)).length;
  }, [enhancedTasks, currentUser]);

  // Section categorization
  const sectionTasks = useMemo(() => {
    return myAssignedTasks.filter(task => {
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
  }, [myAssignedTasks, activeSection, currentEmpId, today]);

  const handleToggleSelectAll = () => {
    if (sectionTasks.length > 0 && sectionTasks.every(t => selectedTaskIds.includes(t.id))) {
      setSelectedTaskIds(prev => prev.filter(id => !sectionTasks.some(t => t.id === id)));
    } else {
      const pageIds = sectionTasks.map(t => t.id);
      setSelectedTaskIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  return (
    <div className="my-tasks-container">

      {/* Section Quick Tabs */}
      <div className="task-filter-chips-bar" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[
          { id: 'pending', label: 'To Do', count: myAssignedTasks.filter(t => {
            const a = getAssigneeForTask(t);
            return (a?.individualStatus === 'Pending' || (a?.progressPercentage || 0) === 0 || t.overallStatus === 'OPEN') && a?.individualStatus !== 'Completed';
          }).length },
          { id: 'in_progress', label: 'In Progress', count: myAssignedTasks.filter(t => {
            const a = getAssigneeForTask(t);
            return (a?.individualStatus === 'In Progress' || a?.individualStatus === 'In Process' || (a?.progressPercentage || 0) > 0) && a?.progressPercentage !== 100 && a?.individualStatus !== 'Completed';
          }).length },
          { id: 'today', label: "Today's Tasks", count: myAssignedTasks.filter(t => {
            const a = getAssigneeForTask(t);
            return t.dueDate === today && a?.progressPercentage !== 100 && a?.individualStatus !== 'Completed';
          }).length },
          { id: 'completed', label: 'Completed', count: myAssignedTasks.filter(t => {
            const a = getAssigneeForTask(t);
            return a?.individualStatus === 'Completed' || a?.progressPercentage === 100 || t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED';
          }).length },
          { id: 'overdue', label: 'Overdue', count: myAssignedTasks.filter(t => {
            const a = getAssigneeForTask(t);
            return computeDueStatus(t.dueDate, t.overallStatus) === 'Overdue' && a?.progressPercentage !== 100 && a?.individualStatus !== 'Completed';
          }).length },
          { id: 'all', label: 'All Tasks', count: myAssignedTasks.length }
        ].map(sec => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id as any)}
            className={`btn ${activeSection === sec.id ? 'btn-primary' : 'btn-secondary'}`}
            style={{ 
              fontSize: '0.82rem', 
              padding: '7px 14px', 
              borderRadius: '8px', 
              background: activeSection === sec.id ? '#0E7490' : undefined,
              borderColor: activeSection === sec.id ? '#0E7490' : undefined
            }}
          >
            {sec.label} <span style={{ opacity: 0.85, marginLeft: '6px', background: activeSection === sec.id ? 'rgba(255,255,255,0.25)' : '#E2E8F0', color: activeSection === sec.id ? '#fff' : '#475569', padding: '1px 7px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700 }}>{sec.count}</span>
          </button>
        ))}

      </div>

      {/* TASKS LIST VIEW */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {sectionTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={40} style={{ opacity: 0.35, margin: '0 auto 12px', color: '#0E7490', display: 'block' }} />
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1E293B', marginBottom: '4px' }}>
              No {activeSection === 'all' ? '' : activeSection.replace('_', ' ')} tasks found
            </div>
            <div style={{ fontSize: '0.84rem', color: '#64748B' }}>
              You are all caught up!
            </div>
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
          <div className="table-responsive">
            <table className="hrms-table" style={{ width: '100%', minWidth: '920px' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px', minWidth: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={sectionTasks.length > 0 && sectionTasks.every(t => selectedTaskIds.includes(t.id))}
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
                {sectionTasks.map(task => {
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

                        {/* Expected Deliverable criteria badge */}
                        {task.expectedOutput && (
                          <div style={{ marginTop: '5px' }}>
                            <span style={{ fontSize: '0.7rem', color: '#166534', background: '#DCFCE7', border: '1px solid #BBF7D0', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <strong>Deliverable:</strong> {task.expectedOutput.length > 85 ? `${task.expectedOutput.slice(0, 85)}...` : task.expectedOutput}
                            </span>
                          </div>
                        )}

                        {/* Attachments chips */}
                        {task.attachments && task.attachments.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0E7490', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Paperclip size={12} /> {task.attachments.length} Attachment{task.attachments.length > 1 ? 's' : ''}:
                            </span>
                            {task.attachments.map(att => (
                              <a
                                key={att.id}
                                href={att.fileUrl}
                                download={att.fileName}
                                style={{
                                  fontSize: '0.68rem',
                                  color: '#0E7490',
                                  background: '#ECFEFF',
                                  border: '1px solid #CFFAFE',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  textDecoration: 'none',
                                  fontWeight: 600
                                }}
                                title={`Download ${att.fileName}`}
                              >
                                <FileText size={12} /> {att.fileName}
                              </a>
                            ))}
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
                })
              }
            </tbody>
          </table>
        </div>
      )}
      </div>

      {/* Floating Action Bar per AGENTS.md */}
      <StandardFloatingActionBar
        selectedCount={selectedTaskIds.length}
        onClearSelection={() => setSelectedTaskIds([])}
        onEdit={selectedTaskIds.length === 1 ? () => onSelectTask(selectedTaskIds[0]) : undefined}
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
