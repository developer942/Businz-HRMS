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
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { ExportDropdown } from '../common/ExportDropdown';

export const TaskManagement: React.FC = () => {
  const {
    enhancedTasks,
    currentUser,
    employees,
    markTaskViewed,
    markTaskDailyReportsSeen,
    markModuleNotificationsRead
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

  // Strictly HR / CEO / Super Admin can view company-wide Register, Reports, and Total Tasks KPI row.
  // Regular Employees (including Developers, BDEs, Team Leads, Department Managers) see ONLY:
  // My Tasks, Assigned, Team, and Daily.
  const isManagerOrAdmin = useMemo(() => {
    const role = (currentUser.role || '').trim();
    if (
      role === 'Super Admin' ||
      role === 'CEO' ||
      role === 'HR' ||
      role === 'HR Manager' ||
      role === 'HR Admin'
    ) {
      return true;
    }
    const desig = (currentEmpRecord?.designation || currentUser.designation || '').toLowerCase();
    const dept = (currentEmpRecord?.department || currentUser.department || '').toLowerCase();
    if (desig === 'ceo' || desig.includes('managing director') || dept === 'hr' || dept.includes('human resource')) {
      return true;
    }
    return false;
  }, [currentUser, currentEmpRecord]);

  const myReadKey = useMemo(() => {
    return String(currentUser.employeeId || currentUser.id || currentUser.email || currentUser.name || '')
      .trim()
      .toLowerCase();
  }, [currentUser]);

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
      const codeLower = String(idOrCode).trim().toLowerCase();
      if (currentUser.employeeId && codeLower === String(currentUser.employeeId).trim().toLowerCase()) return true;
      if (currentUser.id && codeLower === String(currentUser.id).trim().toLowerCase()) return true;
      if (currentEmpRecord) {
        if (currentEmpRecord.employeeId && codeLower === String(currentEmpRecord.employeeId).trim().toLowerCase()) return true;
        if (currentEmpRecord.id && codeLower === String(currentEmpRecord.id).trim().toLowerCase()) return true;
      }
    }
    if (name) {
      const raw = String(name);
      const target = raw.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
      const myName = String(currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
      if (target && myName && target === myName) return true;
      if (currentEmpRecord) {
        const empFullName = `${currentEmpRecord.firstName || ''} ${currentEmpRecord.lastName || ''}`.trim().toLowerCase();
        if (target && empFullName && target === empFullName) return true;
      }
      const isCeoUser =
        currentUser.role === 'CEO' ||
        currentUser.role === 'Super Admin' ||
        myName.startsWith('velmurugan');
      if (isCeoUser && (target === 'velmurugan' || target.startsWith('velmurugan ') || raw.toLowerCase().includes('(ceo)'))) {
        return true;
      }
    }
    return false;
  };

  const isTaskAssignedByCurrentUser = (t: (typeof enhancedTasks)[0]) => {
    return (
      matchesCurrentUser(t.assignedById || t.createdById, t.assignedByName || t.assignedBy || t.createdBy)
    );
  };

  const isInvolvedInTask = (t: (typeof enhancedTasks)[0]) => {
    const isAssignee = t.assignees.some(a => matchesCurrentUser(a.employeeId, a.employeeName));
    const isResponsible = matchesCurrentUser(t.responsiblePersonId, t.responsiblePersonName);
    const isAssigner = isTaskAssignedByCurrentUser(t);
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

    const isTaskUnseen = (t: (typeof enhancedTasks)[0]) => {
      if (!myReadKey) return false;
      if (t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED') return false;
      return !(t.viewedBy || []).some(k => String(k).trim().toLowerCase() === myReadKey);
    };

    const unseenRegisterCount = relevantTasks.filter(isTaskUnseen).length;

    const myTasksCount = enhancedTasks.filter(
      t =>
        (t.assignees.some(a => matchesCurrentUser(a.employeeId, a.employeeName)) ||
          matchesCurrentUser(t.responsiblePersonId, t.responsiblePersonName)) &&
        isTaskUnseen(t)
    ).length;

    const assignedByMeCount = enhancedTasks.filter(
      t => isTaskAssignedByCurrentUser(t) && isTaskUnseen(t)
    ).length;

    const teamTasksCount = enhancedTasks.filter(t => {
      const isTeamTask = t.assignmentType === 'Team' || t.assignees.length > 1;
      if (!isTeamTask) return false;
      if (!(isManagerOrAdmin || isInvolvedInTask(t))) return false;
      return isTaskUnseen(t);
    }).length;

    let dailyReportsCount = 0;
    enhancedTasks.forEach(t => {
      if (isManagerOrAdmin || isInvolvedInTask(t)) {
        (t.dailyReports || []).forEach(r => {
          const isSeen = myReadKey
            ? (r.seenBy || []).some(k => String(k).trim().toLowerCase() === myReadKey)
            : true;
          const isMine = matchesCurrentUser(r.employeeId, r.employeeName);
          if (!isSeen && !isMine) {
            dailyReportsCount++;
          }
        });
      }
    });

    return {
      total,
      open,
      inProgress,
      completed,
      overdue,
      dueToday,
      unseenRegisterCount,
      myTasksCount,
      assignedByMeCount,
      teamTasksCount,
      dailyReportsCount
    };
  }, [enhancedTasks, currentUser, currentEmpRecord, isManagerOrAdmin, myReadKey]);

  // Clear unseen badges for the active tab whenever the user opens/views that tab
  useEffect(() => {
    markModuleNotificationsRead?.('tasks');
    if (!myReadKey || !enhancedTasks.length) return;

    const isTaskUnseen = (t: (typeof enhancedTasks)[0]) => {
      if (t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED') return false;
      return !(t.viewedBy || []).some(k => String(k).trim().toLowerCase() === myReadKey);
    };

    if (activeTab === 'register') {
      enhancedTasks.filter(isTaskUnseen).forEach(t => markTaskViewed?.(t.id));
    } else if (activeTab === 'my_tasks') {
      enhancedTasks
        .filter(
          t =>
            (t.assignees.some(a => matchesCurrentUser(a.employeeId, a.employeeName)) ||
              matchesCurrentUser(t.responsiblePersonId, t.responsiblePersonName)) &&
            isTaskUnseen(t)
        )
        .forEach(t => markTaskViewed?.(t.id));
    } else if (activeTab === 'assigned_tasks') {
      enhancedTasks
        .filter(t => isTaskAssignedByCurrentUser(t) && isTaskUnseen(t))
        .forEach(t => markTaskViewed?.(t.id));
    } else if (activeTab === 'team_tasks') {
      enhancedTasks
        .filter(
          t =>
            (t.assignmentType === 'Team' || t.assignees.length > 1) &&
            (isManagerOrAdmin || isInvolvedInTask(t)) &&
            isTaskUnseen(t)
        )
        .forEach(t => markTaskViewed?.(t.id));
    } else if (activeTab === 'daily_reports') {
      enhancedTasks.forEach(t => {
        if ((isManagerOrAdmin || isInvolvedInTask(t)) && t.dailyReports?.length) {
          const hasUnseen = t.dailyReports.some(
            r => !(r.seenBy || []).some(k => String(k).trim().toLowerCase() === myReadKey)
          );
          if (hasUnseen) {
            markTaskDailyReportsSeen?.(t.id);
          }
        }
      });
    }
  }, [activeTab, enhancedTasks.length, myReadKey, isManagerOrAdmin]);

  const handleKpiClick = (status: string, due: string = 'All') => {
    setStatusFilter(status);
    setDueFilter(due);
    setActiveTab(isManagerOrAdmin ? 'register' : 'my_tasks');
  };

  const handleExportTasks = (type: 'excel' | 'pdf' | 'csv') => {
    setShowExportMenu(false);
    const timestamp = new Date().toISOString().split('T')[0];

    if (activeTab === 'daily_reports') {
      const reportRows: any[] = [];
      enhancedTasks.forEach(task => {
        if (!task.dailyReports || task.dailyReports.length === 0) return;
        if (!isManagerOrAdmin && !isInvolvedInTask(task)) return;
        task.dailyReports.forEach(dlr => {
          reportRows.push({
            reportDateFormatted: formatDateDDMMYYYY(dlr.reportDate),
            employeeName: dlr.employeeName,
            employeeDepartment: dlr.employeeDepartment || task.department,
            taskNumber: task.taskNumber,
            taskTitle: task.title,
            assignedByName: task.assignedByName || 'Manager',
            workDoneToday: dlr.workDoneToday,
            processStatus: dlr.processStatus,
            progressFormatted: `${dlr.progressPercentage ?? 0}%`
          });
        });
      });

      if (reportRows.length === 0) {
        alert('No daily report records available to export.');
        return;
      }

      const dlrColumns = [
        { label: 'Report Date', key: 'reportDateFormatted' },
        { label: 'Employee Name', key: 'employeeName' },
        { label: 'Department', key: 'employeeDepartment' },
        { label: 'Task No', key: 'taskNumber' },
        { label: 'Task Title', key: 'taskTitle' },
        { label: 'Assigned By', key: 'assignedByName' },
        { label: 'Work Done / Daily Update', key: 'workDoneToday' },
        { label: 'Stage Status', key: 'processStatus' },
        { label: 'Progress', key: 'progressFormatted' }
      ];

      if (type === 'excel') {
        downloadExcel(reportRows, `VRM_Daily_Task_Reports_${timestamp}`, dlrColumns);
      } else if (type === 'csv') {
        downloadCSV(reportRows, `VRM_Daily_Task_Reports_${timestamp}`, dlrColumns);
      } else {
        downloadPDF(
          reportRows,
          'VRM Daily Task Report Register',
          `VRM_Daily_Task_Reports_${timestamp}`,
          dlrColumns
        );
      }
      return;
    }

    const exportSource = isManagerOrAdmin ? enhancedTasks : enhancedTasks.filter(t => isInvolvedInTask(t));

    if (exportSource.length === 0) {
      alert('No task records available to export.');
      return;
    }

    const columns = [
      { label: 'Task No', key: 'taskNumber' },
      { label: 'Title', key: 'title' },
      { label: 'Category', key: 'taskCategory' },
      { label: 'Department', key: 'department' },
      { label: 'Priority', key: 'priority' },
      { label: 'Assign Type', key: 'assignmentType' },
      { label: 'Assigned By', key: 'assignedByName' },
      { label: 'Responsible Lead', key: 'responsiblePersonName' },
      { label: 'Team Members', key: 'assigneesList' },
      { label: 'Start Date', key: 'startDate' },
      { label: 'Due Date', key: 'dueDate' },
      { label: 'Progress', key: 'progressFormatted' },
      { label: 'Status', key: 'overallStatus' }
    ];

    const data = exportSource.map(t => ({
      ...t,
      startDate: formatDateDDMMYYYY(t.startDate),
      dueDate: formatDateDDMMYYYY(t.dueDate),
      assigneesList: t.assignees.map(a => `${a.employeeName} (${a.individualStatus})`).join(', '),
      progressFormatted: `${t.overallProgress}%`
    }));

    if (type === 'excel') {
      downloadExcel(data, `VRM_Task_Management_${timestamp}`, columns);
    } else if (type === 'csv') {
      downloadCSV(data, `VRM_Task_Management_${timestamp}`, columns);
    } else {
      downloadPDF(
        data,
        'VRM Enterprise Task Management Register',
        `VRM_Task_Register_${timestamp}`,
        columns
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

  const tabsConfig = useMemo(() => {
    const allTabs = [
      {
        id: 'register' as const,
        shortLabel: 'All Tasks',
        desktopLabel: 'All Tasks',
        icon: Calendar,
        count: kpis.unseenRegisterCount,
        adminOnly: true
      },
      {
        id: 'my_tasks' as const,
        shortLabel: 'My Tasks',
        desktopLabel: 'My Tasks',
        icon: CheckSquare,
        count: kpis.myTasksCount,
        adminOnly: false
      },
      {
        id: 'assigned_tasks' as const,
        shortLabel: 'Assigned',
        desktopLabel: 'Assigned',
        icon: UserCheck,
        count: kpis.assignedByMeCount,
        adminOnly: false
      },
      {
        id: 'team_tasks' as const,
        shortLabel: 'Team',
        desktopLabel: 'Team',
        icon: Users,
        count: kpis.teamTasksCount,
        adminOnly: false
      },
      {
        id: 'daily_reports' as const,
        shortLabel: 'Daily',
        desktopLabel: 'Daily',
        icon: BookOpen,
        count: kpis.dailyReportsCount,
        adminOnly: false
      },
      {
        id: 'reports' as const,
        shortLabel: 'Reports',
        desktopLabel: 'Reports',
        icon: BarChart2,
        count: null,
        adminOnly: true
      }
    ];
    return isManagerOrAdmin ? allTabs : allTabs.filter(t => !t.adminOnly);
  }, [isManagerOrAdmin, kpis]);

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

          {/* Standardized Download Symbol Dropdown (Excel, PDF, CSV) */}
          <ExportDropdown
            onExportExcel={() => handleExportTasks('excel')}
            onExportPDF={() => handleExportTasks('pdf')}
            onExportCSV={() => handleExportTasks('csv')}
            label="Download"
          />

          {/* Primary Assign Task Button (+ Icon Button) */}
          <button
            type="button"
            onClick={() => setShowNewTaskModal(true)}
            title="Assign Task"
            aria-label="Assign Task"
            style={{
              width: '36px',
              height: '36px',
              padding: 0,
              borderRadius: '10px',
              border: 'none',
              background: '#0E7490',
              color: '#FFFFFF',
              fontSize: '0.84rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)'
            }}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* DESKTOP COMPACT KPI ROW (Only for Admin / HR / CEO)          */}
      {/* ============================================================ */}
      {isManagerOrAdmin && (
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
              sub: 'All tasks',
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
      )}

      {/* ============================================================ */}
      {/* TABS BAR (Unified Apple-Like Navigation Web & Mobile)        */}
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
            gridTemplateColumns: `repeat(${tabsConfig.length}, minmax(0, 1fr))`,
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
