import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  CheckSquare,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ListTodo,
  BarChart2,
  Users,
  UserCheck,
  Download,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  BookOpen,
  Search,
  Calendar
} from 'lucide-react';
import { TaskRegister } from './TaskRegister';
import { MyTasks } from './MyTasks';
import { AssignedTasks } from './AssignedTasks';
import { TeamTasks } from './TeamTasks';
import { TaskReports } from './TaskReports';
import { DailyTaskReportManagement } from './DailyTaskReportManagement';
import { NewTaskForm } from './NewTaskForm';
import { TaskDetailModal } from './TaskDetailModal';
import { computeDueStatus } from '../../types/tasks';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';

export const TaskManagement: React.FC = () => {
  const {
    enhancedTasks,
    currentUser,
    employees
  } = useHRMS();
  const {
    selectedGlobalTaskId,
    setSelectedGlobalTaskId,
    taskTargetTab,
    setTaskTargetTab
  } = useHRMS() as any;

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

  const [activeTab, setActiveTab] = useState<
    'register' | 'my_tasks' | 'assigned_tasks' | 'team_tasks' | 'daily_reports' | 'reports'
  >(isManagerOrAdmin ? 'register' : 'my_tasks');

  useEffect(() => {
    setActiveTab(isManagerOrAdmin ? 'register' : 'my_tasks');
  }, [currentUser.id, currentUser.role, isManagerOrAdmin]);

  useEffect(() => {
    if (taskTargetTab) {
      setActiveTab(taskTargetTab);
      setTaskTargetTab(null);
    }
  }, [taskTargetTab, setTaskTargetTab]);

  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dueFilter, setDueFilter] = useState<string>('All');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedGlobalTaskId) {
      setSelectedTaskId(selectedGlobalTaskId);
      setSelectedGlobalTaskId(null);
    }
  }, [selectedGlobalTaskId, setSelectedGlobalTaskId]);

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

  const isInvolvedInTask = (t: (typeof enhancedTasks)[0]) => {
    const isAssignee = t.assignees.some(a => matchesCurrentUser(a.employeeId, a.employeeName));
    const isResponsible = matchesCurrentUser(t.responsiblePersonId, t.responsiblePersonName);
    const isAssigner = matchesCurrentUser(t.assignedById, t.assignedByName);
    return isAssignee || isResponsible || isAssigner;
  };

  const kpis = useMemo(() => {
    const relevantTasks = isManagerOrAdmin ? enhancedTasks : enhancedTasks.filter(t => isInvolvedInTask(t));

    const total = relevantTasks.length;
    const open = relevantTasks.filter(t => t.overallStatus === 'OPEN').length;
    const inProgress = relevantTasks.filter(
      t =>
        t.overallStatus === 'IN PROGRESS' ||
        t.overallStatus === 'PARTIALLY COMPLETED' ||
        t.overallStatus === 'UNDER REVIEW' ||
        t.overallStatus === 'REOPENED'
    ).length;
    const completed = relevantTasks.filter(
      t => t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED'
    ).length;

    let overdue = 0;
    let dueToday = 0;

    relevantTasks.forEach(t => {
      const dStatus = computeDueStatus(t.dueDate, t.overallStatus);
      if (dStatus === 'Overdue') overdue++;
      if (dStatus === 'Due Today') dueToday++;
    });

    const myTasksCount = enhancedTasks.filter(
      t =>
        t.assignees.some(a => matchesCurrentUser(a.employeeId, a.employeeName)) ||
        matchesCurrentUser(t.responsiblePersonId, t.responsiblePersonName)
    ).length;

    const assignedByMeCount = enhancedTasks.filter(t => matchesCurrentUser(t.assignedById, t.assignedByName)).length;

    const teamTasksCount = enhancedTasks.filter(t => {
      const isTeamTask = t.assignmentType === 'Team' || t.assignees.length > 1;
      if (!isTeamTask) return false;
      if (isManagerOrAdmin) return true;
      return isInvolvedInTask(t);
    }).length;

    let dailyReportsCount = 0;
    enhancedTasks.forEach(t => {
      if (isManagerOrAdmin || isInvolvedInTask(t)) {
        dailyReportsCount += (t.dailyReports || []).length;
      }
    });

    return {
      total,
      open,
      inProgress,
      completed,
      overdue,
      dueToday,
      myTasksCount,
      assignedByMeCount,
      teamTasksCount,
      dailyReportsCount
    };
  }, [enhancedTasks, currentUser, currentEmpRecord, isManagerOrAdmin]);

  const handleKpiClick = (status: string, due: string = 'All') => {
    setStatusFilter(status);
    setDueFilter(due);
    setActiveTab(isManagerOrAdmin ? 'register' : 'my_tasks');
  };

  const handleExportTasks = (type: 'excel' | 'pdf') => {
    setShowExportMenu(false);

    const exportSource = isManagerOrAdmin ? enhancedTasks : enhancedTasks.filter(t => isInvolvedInTask(t));

    if (exportSource.length === 0) {
      alert('No task records available to export.');
      return;
    }

    const columns = [
      { header: 'Task No', key: 'taskNumber' },
      { header: 'Title', key: 'title' },
      { header: 'Category', key: 'taskCategory' },
      { header: 'Department', key: 'department' },
      { header: 'Priority', key: 'priority' },
      { header: 'Assign Type', key: 'assignmentType' },
      { header: 'Assigned By', key: 'assignedByName' },
      { header: 'Responsible Lead', key: 'responsiblePersonName' },
      { header: 'Team Members', key: 'assigneesList' },
      { header: 'Start Date', key: 'startDate' },
      { header: 'Due Date', key: 'dueDate' },
      { header: 'Progress', key: 'progressFormatted' },
      { header: 'Status', key: 'overallStatus' }
    ];

    const data = exportSource.map(t => ({
      ...t,
      startDate: formatDateDDMMYYYY(t.startDate),
      dueDate: formatDateDDMMYYYY(t.dueDate),
      assigneesList: t.assignees.map(a => `${a.employeeName} (${a.individualStatus})`).join(', '),
      progressFormatted: `${t.overallProgress}%`
    }));

    const timestamp = new Date().toISOString().split('T')[0];

    if (type === 'excel') {
      exportToExcel(data, columns, `VRM_Task_Management_${timestamp}`);
    } else {
      exportToPDF(
        data,
        columns,
        'VRM Enterprise Task Management Register',
        `VRM_Task_Register_${timestamp}`,
        `Generated by ${currentUser.name} (${currentUser.role}) • Total Tasks: ${exportSource.length}`
      );
    }
  };

  const focusMobileSearch = () => {
    const searchEl = document.querySelector<HTMLInputElement>(
      '.task-management-module input[type="text"], .task-management-module input[type="search"]'
    );
    if (searchEl) {
      searchEl.focus();
      searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const tabsConfig = [
    {
      id: 'register' as const,
      shortLabel: 'Register',
      desktopLabel: 'Register',
      icon: Calendar,
      count: kpis.total
    },
    {
      id: 'my_tasks' as const,
      shortLabel: 'My Tasks',
      desktopLabel: 'My Tasks',
      icon: CheckSquare,
      count: kpis.myTasksCount
    },
    {
      id: 'assigned_tasks' as const,
      shortLabel: 'Assigned',
      desktopLabel: 'Assigned',
      icon: UserCheck,
      count: kpis.assignedByMeCount
    },
    {
      id: 'team_tasks' as const,
      shortLabel: 'Team',
      desktopLabel: 'Team',
      icon: Users,
      count: kpis.teamTasksCount
    },
    {
      id: 'daily_reports' as const,
      shortLabel: 'Daily',
      desktopLabel: 'Daily',
      icon: BookOpen,
      count: kpis.dailyReportsCount
    },
    {
      id: 'reports' as const,
      shortLabel: 'Reports',
      desktopLabel: 'Reports',
      icon: BarChart2,
      count: null
    }
  ];

  return (
    <div
      className="task-management-module"
      style={{
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}
    >
      {/* ============================================================ */}
      {/* CLEAN & MINIMAL HEADER (Web & Mobile)                        */}
      {/* ============================================================ */}
      <div
        className="task-mgmt-header-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: '#0F172A',
              margin: 0,
              letterSpacing: '-0.02em',
              lineHeight: 1.2
            }}
          >
            Task Management
          </h1>
          <p
            className="desktop-only-block"
            style={{
              fontSize: '0.8rem',
              color: '#64748B',
              margin: '3px 0 0 0',
              fontWeight: 500
            }}
          >
            Assign, track, and review individual &amp; team deliverables across departments
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Mobile Search Icon Button (Matches Reference Image Screen 1) */}
          <button
            type="button"
            onClick={focusMobileSearch}
            className="mobile-only-block"
            title="Search Tasks"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              background: '#F8FAFC',
              color: '#334155',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0
            }}
          >
            <Search size={17} />
          </button>

          {/* Desktop Export Dropdown */}
          <div ref={exportMenuRef} className="desktop-only-block" style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowExportMenu(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '38px',
                padding: '0 14px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 600,
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#334155'
              }}
            >
              <Download size={15} />
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
                  onClick={() => handleExportTasks('excel')}
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
                  onMouseOver={e => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <FileSpreadsheet size={16} color="#16A34A" />
                  <span>Export to Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportTasks('pdf')}
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
                  onMouseOver={e => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <FileText size={16} color="#DC2626" />
                  <span>Export to PDF (.pdf)</span>
                </button>
              </div>
            )}
          </div>

          {/* Primary Assign Task Button (+ on Mobile, + Assign Task on Desktop) */}
          <button
            type="button"
            onClick={() => setShowNewTaskModal(true)}
            title="Assign Task"
            style={{
              height: '38px',
              padding: '0 14px',
              borderRadius: '10px',
              border: 'none',
              background: '#0E7490',
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)'
            }}
          >
            <Plus size={18} strokeWidth={2.5} />
            <span className="desktop-only-inline">Assign Task</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* DESKTOP COMPACT KPI ROW (Hidden on Mobile for Clean Look)    */}
      {/* ============================================================ */}
      <div
        className="desktop-only-block"
        style={{
          width: '100%'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: '12px'
          }}
        >
          {[
            {
              label: isManagerOrAdmin ? 'Total Tasks' : 'My Total Tasks',
              value: kpis.total,
              sub: 'Active register',
              icon: ListTodo,
              iconBg: '#ECFEFF',
              iconColor: '#0E7490',
              active: statusFilter === 'All' && dueFilter === 'All',
              onClick: () => handleKpiClick('All', 'All')
            },
            {
              label: 'Open Tasks',
              value: kpis.open,
              sub: 'Awaiting start',
              icon: Clock,
              iconBg: '#F1F5F9',
              iconColor: '#475569',
              active: statusFilter === 'OPEN' && dueFilter === 'All',
              onClick: () => handleKpiClick('OPEN', 'All')
            },
            {
              label: 'In Progress',
              value: kpis.inProgress,
              sub: 'Active execution',
              icon: CheckSquare,
              iconBg: '#E0F2FE',
              iconColor: '#0284C7',
              active: statusFilter === 'IN PROGRESS' && dueFilter === 'All',
              onClick: () => handleKpiClick('IN PROGRESS', 'All')
            },
            {
              label: 'Completed',
              value: kpis.completed,
              sub: `${kpis.total > 0 ? Math.round((kpis.completed / kpis.total) * 100) : 0}% completion rate`,
              icon: CheckCircle2,
              iconBg: '#DCFCE7',
              iconColor: '#16A34A',
              active: statusFilter === 'COMPLETED' && dueFilter === 'All',
              onClick: () => handleKpiClick('COMPLETED', 'All')
            },
            {
              label: 'Overdue',
              value: kpis.overdue,
              sub: `${kpis.dueToday} due today`,
              icon: AlertTriangle,
              iconBg: '#FEE2E2',
              iconColor: '#DC2626',
              active: dueFilter === 'Overdue',
              onClick: () => handleKpiClick('All', 'Overdue')
            }
          ].map(card => {
            const IconComp = card.icon;
            return (
              <div
                key={card.label}
                onClick={card.onClick}
                style={{
                  background: card.active ? '#F0FDFA' : '#FFFFFF',
                  border: card.active ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '6px',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B' }}>{card.label}</span>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      background: card.iconBg,
                      color: card.iconColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <IconComp size={15} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '1.35rem',
                      fontWeight: 800,
                      color: card.label === 'Overdue' && card.value > 0 ? '#DC2626' : '#0F172A',
                      lineHeight: 1.1
                    }}
                  >
                    {card.value}
                  </span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color: '#64748B',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {card.sub}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================ */}
      {/* ALL 6 TABS BAR (Unified Apple-Like Navigation Web & Mobile)  */}
      {/* Matches Reference Image: Register | My Tasks | Assigned |    */}
      {/* Team | Daily | Reports                                       */}
      {/* ============================================================ */}
      <div
        className="task-unified-six-tabs"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '4px 6px 0 6px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <div
          className="task-six-tabs-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
            gap: '2px',
            width: '100%'
          }}
        >
          {tabsConfig.map(tab => {
            const IconComp = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`task-six-tab-item ${isActive ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  padding: '8px 4px 9px 4px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2.5px solid #0E7490' : '2.5px solid transparent',
                  color: isActive ? '#0E7490' : '#64748B',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  minWidth: 0,
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <IconComp size={17} strokeWidth={isActive ? 2.4 : 1.9} />
                  {tab.count !== null && tab.count > 0 && (
                    <span
                      className="desktop-only-inline"
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: '999px',
                        background: isActive ? '#ECFEFF' : '#F1F5F9',
                        color: isActive ? '#0E7490' : '#475569',
                        border: isActive ? '1px solid #A5F3FC' : '1px solid #E2E8F0'
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '0.73rem',
                    fontWeight: isActive ? 800 : 600,
                    lineHeight: 1.15,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%'
                  }}
                >
                  {tab.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================ */}
      {/* ACTIVE TAB VIEWPORT                                          */}
      {/* ============================================================ */}
      {activeTab === 'register' && (
        <TaskRegister
          onViewTask={id => setSelectedTaskId(id)}
          externalStatusFilter={statusFilter}
          externalDueFilter={dueFilter}
          onClearExternalFilters={() => {
            setStatusFilter('All');
            setDueFilter('All');
          }}
        />
      )}

      {activeTab === 'my_tasks' && <MyTasks onViewTask={id => setSelectedTaskId(id)} />}

      {activeTab === 'assigned_tasks' && <AssignedTasks onViewTask={id => setSelectedTaskId(id)} />}

      {activeTab === 'team_tasks' && <TeamTasks onViewTask={id => setSelectedTaskId(id)} />}

      {activeTab === 'daily_reports' && <DailyTaskReportManagement onViewTask={id => setSelectedTaskId(id)} />}

      {activeTab === 'reports' && <TaskReports />}

      {/* Modals */}
      {showNewTaskModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(3px)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            overflowY: 'auto'
          }}
          onClick={() => setShowNewTaskModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '820px',
              maxHeight: '92vh',
              overflowY: 'auto',
              borderRadius: '18px'
            }}
            onClick={e => e.stopPropagation()}
          >
            <NewTaskForm
              onTaskCreated={taskId => {
                setShowNewTaskModal(false);
                if (taskId) setSelectedTaskId(taskId);
              }}
              onCancel={() => setShowNewTaskModal(false)}
            />
          </div>
        </div>
      )}

      {selectedTaskId && <TaskDetailModal taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />}
    </div>
  );
};
