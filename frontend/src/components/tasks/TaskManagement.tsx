import React, { useState, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  ListTodo, 
  UserCheck, 
  Users, 
  PlusCircle, 
  Plus,
  BarChart3, 
  CheckSquare,
  Sparkles,
  FileCheck
} from 'lucide-react';

import { TaskRegister } from './TaskRegister';
import { NewTaskForm } from './NewTaskForm';
import { MyTasks } from './MyTasks';
import { AssignedTasks } from './AssignedTasks';
import { TeamTasks } from './TeamTasks';
import { DailyTaskReportManagement } from './DailyTaskReportManagement';
import { TaskDetailModal } from './TaskDetailModal';
import { TaskReports } from './TaskReports';
import { ExportDropdown } from '../common/ExportDropdown';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { computeDueStatus, isTaskAssignedByMe } from '../../types/tasks';

interface TaskManagementProps {
  openAddModal?: boolean;
  onCloseQuickAdd?: () => void;
}

export const TaskManagement: React.FC<TaskManagementProps> = ({ openAddModal, onCloseQuickAdd }) => {
  const { currentUser, enhancedTasks, departments } = useHRMS();

  const isSuperAdmin = currentUser.role === 'Super Admin' || currentUser.role === 'ERP Administrator';
  const isCEO = isSuperAdmin || currentUser.role === 'CEO' || currentUser.designation === 'CEO' || currentUser.employeeId === 'EMP-000';
  const isHR = currentUser.role === 'HR Manager' || currentUser.role === 'HR Admin' || (currentUser as any).department?.toLowerCase().includes('hr');
  const isManager = currentUser.role === 'Department Manager' || currentUser.role === 'Department Head' || currentUser.role === 'Manager';
  const isEmployee = currentUser.role === 'Employee' || currentUser.role === 'Assignee' || (!isCEO && !isHR && !isManager && !isSuperAdmin);

  // Active Tab State - defaults to 'my_tasks' for employees, 'register' for HR/CEO
  const [activeTab, setActiveTab] = useState<
    'register' | 'my_tasks' | 'assigned_tasks' | 'team_tasks' | 'daily_reports' | 'new_task' | 'reports'
  >(() => {
    try {
      const saved = sessionStorage.getItem('vrm_task_active_tab');
      if (saved && ['register', 'my_tasks', 'assigned_tasks', 'team_tasks', 'daily_reports', 'reports'].includes(saved)) {
        if (isEmployee && (saved === 'register' || saved === 'reports')) {
          return 'my_tasks';
        }
        return saved as any;
      }
    } catch (e) {}
    return isEmployee ? 'my_tasks' : 'register';
  });

  const handleTabChange = (tab: 'register' | 'my_tasks' | 'assigned_tasks' | 'team_tasks' | 'daily_reports' | 'new_task' | 'reports') => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem('vrm_task_active_tab', tab);
    } catch (e) {}
  };

  // Selected Task for Detail Modal
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // If user opened via quick add modal trigger
  useEffect(() => {
    if (openAddModal) {
      handleTabChange('new_task');
    }
  }, [openAddModal]);

  // Sync tab when user switches role in demo
  useEffect(() => {
    if (!openAddModal) {
      if (isEmployee && (activeTab === 'register' || activeTab === 'reports')) {
        handleTabChange('my_tasks');
      }
    }
  }, [currentUser.role, isEmployee, openAddModal]);

  const handleTaskCreated = (newTaskId: string) => {
    setSelectedTaskId(newTaskId);
    handleTabChange('assigned_tasks');
    if (onCloseQuickAdd) onCloseQuickAdd();
  };

  const handleCancelCreate = () => {
    handleTabChange(isEmployee ? 'my_tasks' : 'register');
    if (onCloseQuickAdd) onCloseQuickAdd();
  };

  // Structured Export Data calculation based on active tab
  const getStructuredExportData = () => {
    if (activeTab === 'reports') {
      const columns = [
        { key: 'department', label: 'Department' },
        { key: 'total', label: 'Total Tasks' },
        { key: 'completed', label: 'Completed' },
        { key: 'inProgress', label: 'In Progress' },
        { key: 'open', label: 'Open' },
        { key: 'overdue', label: 'Overdue' },
        { key: 'avgProgress', label: 'Avg Progress %' },
        { key: 'compRate', label: 'Completion Rate %' }
      ];
      const data = departments.map(d => {
        const dTasks = enhancedTasks.filter(t => t.department === d.name);
        const total = dTasks.length;
        const completed = dTasks.filter(t => t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED').length;
        const inProgress = dTasks.filter(t => t.overallStatus === 'IN PROGRESS' || t.overallStatus === 'PARTIALLY COMPLETED').length;
        const open = dTasks.filter(t => t.overallStatus === 'OPEN').length;
        const overdue = dTasks.filter(t => computeDueStatus(t.dueDate, t.overallStatus) === 'Overdue').length;
        const avgProgress = total > 0 ? Math.round(dTasks.reduce((sum, t) => sum + t.overallProgress, 0) / total) : 0;
        const compRate = total > 0 ? Math.round((completed / total) * 100) : 100;
        return {
          department: d.name,
          total,
          completed,
          inProgress,
          open,
          overdue,
          avgProgress: `${avgProgress}%`,
          compRate: `${compRate}%`
        };
      });
      return {
        columns,
        data,
        filename: `Task_Analytics_Report_${new Date().toISOString().split('T')[0]}`,
        title: 'Task Module Analytics Report'
      };
    }

    const columns = [
      { key: 'taskNumber', label: 'Task Number' },
      { key: 'title', label: 'Task Title' },
      { key: 'department', label: 'Department' },
      { key: 'responsible', label: 'Responsible Person' },
      { key: 'assignees', label: 'Assignees' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'progress', label: 'Progress %' },
      { key: 'dueStatus', label: 'Due Status' }
    ];

    let tasksToExport = enhancedTasks;
    if (isEmployee) {
      tasksToExport = enhancedTasks.filter(t => 
        t.assignees.some(a => a.employeeId === (currentUser.employeeId || 'EMP-001')) ||
        t.responsiblePersonId === (currentUser.employeeId || 'EMP-001')
      );
    } else if (currentUser.department && (currentUser.role.includes('Manager') || currentUser.role.includes('Head'))) {
      tasksToExport = enhancedTasks.filter(t => t.department === currentUser.department);
    }

    const data = tasksToExport.map(t => ({
      taskNumber: t.taskNumber,
      title: t.title,
      department: t.department,
      responsible: t.responsiblePersonName,
      assignees: t.assignees.map(a => a.employeeName).join(', '),
      dueDate: formatDateDDMMYYYY(t.dueDate),
      priority: t.priority,
      status: t.overallStatus,
      progress: `${t.overallProgress}%`,
      dueStatus: computeDueStatus(t.dueDate, t.overallStatus)
    }));

    return {
      columns,
      data,
      filename: `Task_Register_${new Date().toISOString().split('T')[0]}`,
      title: 'Enterprise Task Register Report'
    };
  };

  const handleExportCSV = () => {
    const { columns, data, filename } = getStructuredExportData();
    downloadCSV(data, filename, columns);
  };

  const handleExportExcel = () => {
    const { columns, data, filename } = getStructuredExportData();
    downloadExcel(data, filename, columns);
  };

  const handleExportPDF = () => {
    const { columns, data, filename, title } = getStructuredExportData();
    downloadPDF(data, title, filename, columns);
  };

  // Count my tasks
  const myTasksCount = enhancedTasks.filter(t => 
    t.assignees.some(a => 
      a.employeeId === (currentUser.employeeId || 'EMP-001') ||
      a.employeeId === currentUser.id ||
      (currentUser.name && a.employeeName?.toLowerCase().includes(currentUser.name.toLowerCase()))
    ) &&
    t.overallStatus !== 'COMPLETED' && t.overallStatus !== 'CLOSED'
  ).length;

  // Count tasks assigned by current user
  const assignedTasksCount = enhancedTasks.filter(t => 
    isTaskAssignedByMe(t, currentUser) &&
    t.overallStatus !== 'COMPLETED' && t.overallStatus !== 'CLOSED'
  ).length;

  // Count team tasks (assigned to 2 or more members)
  const teamTasksCount = enhancedTasks.filter(t => {
    const count = t.assignees ? t.assignees.length : 0;
    if (count <= 1) return false;
    if (!isCEO && !isHR) {
      const currentEmpId = (currentUser.employeeId || currentUser.id || '').toLowerCase().trim();
      const currentName = (currentUser.name || '').toLowerCase().trim();
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
    if (isManager && currentUser.department && t.department !== currentUser.department) return false;
    return t.overallStatus !== 'COMPLETED' && t.overallStatus !== 'CLOSED';
  }).length;

  // Count daily reports visible to the current user
  const dailyReportsCount = enhancedTasks.reduce((acc, t) => {
    const reportCount = t.dailyReports?.length || 0;
    if (reportCount === 0) return acc;

    if (isEmployee) {
      const currentEmpId = (currentUser.employeeId || currentUser.id || '').toLowerCase().trim();
      const currentName = (currentUser.name || '').toLowerCase().trim();
      const isAssignedToMe = t.assignees.some(a => {
        const assigneeEmpId = (a.employeeId || '').toLowerCase().trim();
        const assigneeName = (a.employeeName || '').toLowerCase().trim();
        return (
          (currentEmpId && assigneeEmpId === currentEmpId) ||
          (currentName && assigneeName.includes(currentName))
        );
      });
      const isReporter = t.dailyReports?.some(r => {
        const reporterEmpId = (r.employeeId || '').toLowerCase().trim();
        const reporterName = (r.employeeName || '').toLowerCase().trim();
        return (
          (currentEmpId && reporterEmpId === currentEmpId) ||
          (currentName && reporterName.includes(currentName))
        );
      });
      const isAssigner = isTaskAssignedByMe(t, currentUser);
      return (isAssignedToMe || isReporter || isAssigner) ? acc + reportCount : acc;
    }

    if (isManager && currentUser.department && !isCEO && !isHR && t.department !== currentUser.department) {
      return acc;
    }

    return acc + reportCount;
  }, 0);

  return (
    <div className="task-management-module" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* Standard Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>
            {activeTab === 'assigned_tasks'
              ? 'Assigned Tasks'
              : activeTab === 'team_tasks'
                ? 'Team Tasks'
                : isEmployee 
                  ? (activeTab === 'daily_reports' ? 'Daily Task Reports' : 'My Tasks') 
                  : 'Task Management'}
          </h1>
          <p className="page-subtitle">
            {activeTab === 'assigned_tasks'
              ? `Track deliverables, assignee progress, and status of tasks assigned by you (${currentUser.name})`
              : activeTab === 'team_tasks'
                ? 'Collaborative deliverables assigned to 2 or more team members with independent progress tracking'
                : isEmployee 
                  ? `Personal task workspace — monitor deliverables and submit daily reports (${currentUser.name})`
                  : isCEO 
                    ? 'Assign deliverables, monitor company progress, and review department execution'
                    : 'Assign, track, and monitor department deliverables and task completion progress'}
          </p>
        </div>
        <div className="header-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          {!isEmployee && activeTab !== 'new_task' && (
            <ExportDropdown 
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
              onExportCSV={handleExportCSV}
              label="Download"
              size="sm"
            />
          )}
          {activeTab === 'new_task' ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleTabChange(isEmployee ? 'my_tasks' : 'register')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
            >
              <ListTodo size={16} /> {isEmployee ? 'My Tasks' : 'Task Register'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => handleTabChange('new_task')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, background: '#0E7490', borderColor: '#0E7490' }}
            >
              <Plus size={16} /> Assign Task
            </button>
          )}
        </div>
      </div>

      {/* Top Module Navigation Bar for Managers / CEO / HR */}
      {!isEmployee && (
        <div style={{ 
          padding: '8px 16px', 
          marginBottom: '20px', 
          borderRadius: '16px', 
          background: '#ffffff',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div className="task-module-tabs-bar">
              {[
                { id: 'register', label: 'Task Register', icon: ListTodo },
                { id: 'my_tasks', label: 'My Tasks', icon: UserCheck, badge: myTasksCount },
                { id: 'assigned_tasks', label: 'Assigned Tasks', icon: CheckSquare, badge: assignedTasksCount },
                { id: 'team_tasks', label: 'Team Tasks', icon: Users, badge: teamTasksCount },
                { id: 'daily_reports', label: 'Daily Reports', icon: FileCheck, badge: dailyReportsCount },
                { id: 'reports', label: 'Reports', icon: BarChart3 }
              ].map(t => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;

                return (
                  <button
                    key={t.id}
                    onClick={() => handleTabChange(t.id as any)}
                    style={{ 
                      fontSize: '0.82rem', 
                      padding: '8px 16px', 
                      borderRadius: '10px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '7px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: isActive ? '1px solid #0E7490' : '1px solid transparent',
                      background: isActive ? '#0E7490' : 'transparent',
                      color: isActive ? '#ffffff' : '#475569',
                      boxShadow: isActive ? '0 2px 6px rgba(14, 116, 144, 0.25)' : 'none'
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = '#F8FAFC';
                        e.currentTarget.style.color = '#1E293B';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#475569';
                      }
                    }}
                  >
                    <Icon size={16} />
                    <span>{t.label}</span>
                    {t.badge !== undefined && t.badge > 0 && (
                      <span style={{ 
                        background: isActive ? 'rgba(255, 255, 255, 0.25)' : '#EF4444', 
                        color: '#ffffff', 
                        fontSize: '0.7rem', 
                        fontWeight: 700, 
                        padding: '1px 7px', 
                        borderRadius: '9999px',
                        marginLeft: '2px'
                      }}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Top Navigation for Employees: My Tasks, Assigned Tasks, Team Tasks & Daily Reports */}
      {isEmployee && (
        <div style={{ 
          padding: '8px 16px', 
          marginBottom: '20px', 
          borderRadius: '16px', 
          background: '#ffffff',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)'
        }}>
          <div className="employee-task-tabs-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'my_tasks', label: 'My Tasks', icon: UserCheck, badge: myTasksCount },
              { id: 'assigned_tasks', label: 'Assigned Tasks', icon: CheckSquare, badge: assignedTasksCount },
              { id: 'team_tasks', label: 'Team Tasks', icon: Users, badge: teamTasksCount },
              { id: 'daily_reports', label: 'Daily Reports', icon: FileCheck, badge: dailyReportsCount }
            ].map(t => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;

              return (
                <button
                  key={t.id}
                  onClick={() => handleTabChange(t.id as any)}
                  style={{ 
                    fontSize: '0.82rem', 
                    padding: '8px 16px', 
                    borderRadius: '10px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '7px',
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: isActive ? '1px solid #0E7490' : '1px solid transparent',
                    background: isActive ? '#0E7490' : 'transparent',
                    color: isActive ? '#ffffff' : '#475569',
                    boxShadow: isActive ? '0 2px 6px rgba(14, 116, 144, 0.25)' : 'none'
                  }}
                >
                  <Icon size={16} />
                  <span>{t.label}</span>
                  {t.badge !== undefined && t.badge > 0 && (
                    <span style={{ 
                      background: isActive ? 'rgba(255, 255, 255, 0.25)' : '#0E7490', 
                      color: '#ffffff', 
                      fontSize: '0.7rem', 
                      fontWeight: 700, 
                      padding: '1px 7px', 
                      borderRadius: '9999px',
                      marginLeft: '2px'
                    }}>
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-View Dispatcher */}
      {!isEmployee && activeTab === 'register' && (
        <TaskRegister 
          onSelectTask={(id) => setSelectedTaskId(id)}
          onOpenNewTask={() => handleTabChange('new_task')}
        />
      )}

      {activeTab === 'my_tasks' && (
        <MyTasks 
          onSelectTask={(id) => setSelectedTaskId(id)}
          onSwitchToAssigned={() => handleTabChange('assigned_tasks')}
        />
      )}

      {activeTab === 'assigned_tasks' && (
        <AssignedTasks 
          onSelectTask={(id) => setSelectedTaskId(id)}
          onAssignNewTask={() => handleTabChange('new_task')}
        />
      )}

      {activeTab === 'team_tasks' && (
        <TeamTasks 
          onSelectTask={(id) => setSelectedTaskId(id)}
        />
      )}

      {activeTab === 'daily_reports' && (
        <DailyTaskReportManagement 
          onSelectTask={(id) => setSelectedTaskId(id)}
        />
      )}

      {activeTab === 'new_task' && (
        <NewTaskForm 
          onTaskCreated={handleTaskCreated}
          onCancel={handleCancelCreate}
        />
      )}

      {!isEmployee && activeTab === 'reports' && (
        <TaskReports />
      )}

      {/* Deep 8-Tab Task Detail Modal */}
      {selectedTaskId && (
        <TaskDetailModal 
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
};
