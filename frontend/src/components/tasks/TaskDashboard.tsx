import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  CheckSquare, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  Link2, 
  Filter, 
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  Users,
  ChevronRight,
  CheckCircle2,
  X
} from 'lucide-react';
import { computeDueStatus, calculateEmployeeTaskMetrics } from '../../types/tasks';
import { TaskFilterModal, TaskFiltersState, initialTaskFiltersState } from './TaskFilterModal';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface TaskDashboardProps {
  onNavigateTab: (tab: string) => void;
  onSelectTask: (taskId: string) => void;
}

export const TaskDashboard: React.FC<TaskDashboardProps> = ({ onNavigateTab, onSelectTask }) => {
  const { enhancedTasks, departments, employees, currentUser } = useHRMS();

  // Interactive Task Filter Modal State
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [taskFilters, setTaskFilters] = useState<TaskFiltersState>(initialTaskFiltersState);

  const activeFilterCount = 
    taskFilters.departments.length +
    taskFilters.priorities.length +
    taskFilters.statuses.length +
    taskFilters.sources.length +
    (taskFilters.dateRange !== 'all' ? 1 : 0);

  const statusCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const trendCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Scoped tasks based on user role (Department Manager sees their department; Employee sees their tasks)
  const isEmployee = currentUser.role === 'Employee' || currentUser.role === 'Assignee';
  const isManager = currentUser.role === 'Department Manager' || currentUser.role === 'Department Head' || currentUser.role === 'Manager';

  const roleScopedTasks = useMemo(() => {
    if (isEmployee) {
      return enhancedTasks.filter(t => 
        t.assignees.some(a => a.employeeId === (currentUser.employeeId || 'EMP-001')) ||
        t.responsiblePersonId === (currentUser.employeeId || 'EMP-001')
      );
    }
    if (isManager && currentUser.department) {
      return enhancedTasks.filter(t => t.department === currentUser.department);
    }
    return enhancedTasks;
  }, [enhancedTasks, currentUser, isEmployee, isManager]);

  // Apply dashboard interactive filters
  const filteredTasks = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    return roleScopedTasks.filter(task => {
      if (taskFilters.departments.length > 0 && !taskFilters.departments.includes(task.department)) return false;
      if (taskFilters.priorities.length > 0 && !taskFilters.priorities.includes(task.priority)) return false;
      if (taskFilters.statuses.length > 0 && !taskFilters.statuses.includes(task.overallStatus)) return false;
      if (taskFilters.sources.length > 0 && !taskFilters.sources.includes(task.sourceType)) return false;

      if (taskFilters.dateRange === 'today') {
        return task.dueDate === today || task.taskDate === today;
      }
      if (taskFilters.dateRange === 'this_week') {
        if (!task.dueDate) return false;
        const due = new Date(task.dueDate);
        const diffDays = (due.getTime() - now.getTime()) / (1000 * 3600 * 24);
        return diffDays >= -1 && diffDays <= 7;
      }
      if (taskFilters.dateRange === 'this_month') {
        const curMonth = today.slice(0, 7);
        return (task.dueDate && task.dueDate.startsWith(curMonth)) || task.taskDate.startsWith(curMonth);
      }

      return true;
    });
  }, [roleScopedTasks, taskFilters]);

  // Metrics Calculation
  const totalCount = filteredTasks.length;
  const openCount = filteredTasks.filter(t => t.overallStatus === 'OPEN').length;
  const inProgressCount = filteredTasks.filter(t => t.overallStatus === 'IN PROGRESS').length;
  const partiallyCompletedCount = filteredTasks.filter(t => t.overallStatus === 'PARTIALLY COMPLETED').length;
  const completedCount = filteredTasks.filter(t => t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED').length;
  const overdueCount = filteredTasks.filter(t => {
    const dueStat = computeDueStatus(t.dueDate, t.overallStatus);
    return dueStat === 'Overdue' || t.overallStatus === 'OVERDUE';
  }).length;

  const dueThisWeekCount = filteredTasks.filter(t => {
    if (!t.dueDate || t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED') return false;
    const due = new Date(t.dueDate);
    const diff = (due.getTime() - new Date().getTime()) / (1000 * 3600 * 24);
    return diff >= 0 && diff <= 7;
  }).length;

  const momLinkedCount = filteredTasks.filter(t => t.sourceType === 'MOM').length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Management Alert Lists
  const overdueTasksList = useMemo(() => {
    return filteredTasks.filter(t => {
      const dueStat = computeDueStatus(t.dueDate, t.overallStatus);
      return (dueStat === 'Overdue' || t.overallStatus === 'OVERDUE') && t.overallStatus !== 'CLOSED';
    });
  }, [filteredTasks]);

  const criticalTasksList = useMemo(() => {
    return filteredTasks.filter(t => t.priority === 'Urgent' && t.overallStatus !== 'COMPLETED' && t.overallStatus !== 'CLOSED');
  }, [filteredTasks]);

  const dueTodayTasksList = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return filteredTasks.filter(t => t.dueDate === today && t.overallStatus !== 'COMPLETED' && t.overallStatus !== 'CLOSED');
  }, [filteredTasks]);

  const noUpdateTasksList = useMemo(() => {
    return filteredTasks.filter(t => {
      if (t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED') return false;
      return t.overallProgress === 0 || t.updates.length === 0;
    });
  }, [filteredTasks]);

  // Person-Wise Workload Calculation
  const workloadList = useMemo(() => {
    const relevantEmployees = isManager && currentUser.department 
      ? employees.filter(e => e.department === currentUser.department)
      : employees;

    return relevantEmployees.map(emp => {
      const metrics = calculateEmployeeTaskMetrics(emp.employeeId, filteredTasks);
      return {
        employee: emp,
        metrics
      };
    }).filter(item => item.metrics.totalAssigned > 0);
  }, [employees, filteredTasks, isManager, currentUser]);

  // Render Status Canvas Donut Chart
  useEffect(() => {
    const canvas = statusCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 240;
    const height = 240;
    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(2, 2);

    ctx.clearRect(0, 0, width, height);

    const segments = [
      { label: 'Completed', value: completedCount, color: '#10b981' },
      { label: 'In Progress', value: inProgressCount, color: '#3b82f6' },
      { label: 'Partial', value: partiallyCompletedCount, color: '#f59e0b' },
      { label: 'Open', value: openCount, color: '#94a3b8' },
      { label: 'Overdue', value: overdueCount, color: '#ef4444' }
    ];

    const totalSegVal = segments.reduce((acc, s) => acc + s.value, 0) || 1;
    let startAngle = -0.5 * Math.PI;

    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = 85;
    const innerRadius = 55;

    segments.forEach(seg => {
      const sliceAngle = (seg.value / totalSegVal) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, startAngle, startAngle + sliceAngle);
      ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Center text
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${totalCount}`, centerX, centerY - 6);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px Plus Jakarta Sans, sans-serif';
    ctx.fillText('Total Tasks', centerX, centerY + 14);
  }, [completedCount, inProgressCount, partiallyCompletedCount, openCount, overdueCount, totalCount]);

  // Render Completion Velocity Trend Chart
  useEffect(() => {
    const canvas = trendCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 450;
    const height = 200;
    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(2, 2);

    ctx.clearRect(0, 0, width, height);

    const now = new Date();
    const weeks = [4, 3, 2, 1, 0].map(weeksAgo => {
      const d = new Date(now.getTime() - weeksAgo * 7 * 24 * 3600 * 1000);
      const weekLabel = weeksAgo === 0 ? 'This Week' : `${weeksAgo}w ago`;
      const startMs = d.getTime() - 3.5 * 24 * 3600 * 1000;
      const endMs = d.getTime() + 3.5 * 24 * 3600 * 1000;

      const createdInW = filteredTasks.filter(t => {
        const tDate = new Date(t.createdAt || t.taskDate || t.dueDate || now).getTime();
        return tDate >= startMs && tDate <= endMs;
      }).length;

      const completedInW = filteredTasks.filter(t => {
        const isDone = t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED';
        const tDate = new Date(t.updatedAt || t.dueDate || now).getTime();
        return isDone && tDate >= startMs && tDate <= endMs;
      }).length;

      return { label: weekLabel, created: createdInW, completed: completedInW };
    });

    const labels = weeks.map(w => w.label);
    const completedWeekly = weeks.map(w => w.completed);
    const createdWeekly = weeks.map(w => w.created);

    const maxVal = Math.max(...createdWeekly, ...completedWeekly, 10);
    const barW = 28;
    const gap = (width - 60 - labels.length * (barW * 2 + 8)) / (labels.length + 1);

    // Draw gridlines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = 20 + (140 / 4) * i;
      ctx.beginPath();
      ctx.moveTo(35, y);
      ctx.lineTo(width - 15, y);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(maxVal - (maxVal / 4) * i)}`, 30, y + 4);
    }

    labels.forEach((label, idx) => {
      const groupX = 35 + gap + idx * (barW * 2 + 8 + gap);

      // Bar 1: Created
      const h1 = (createdWeekly[idx] / maxVal) * 140;
      const y1 = 160 - h1;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(groupX, y1, barW, h1);

      // Bar 2: Completed
      const h2 = (completedWeekly[idx] / maxVal) * 140;
      const y2 = 160 - h2;
      const grad = ctx.createLinearGradient(0, y2, 0, 160);
      grad.addColorStop(0, '#3b82f6');
      grad.addColorStop(1, '#1d4ed8');
      ctx.fillStyle = grad;
      ctx.fillRect(groupX + barW + 4, y2, barW, h2);

      // X Label
      ctx.fillStyle = '#64748b';
      ctx.font = '10px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, groupX + barW + 2, 180);
    });
  }, [filteredTasks, completedCount, totalCount]);

  return (
    <div className="task-dashboard-container">
      {/* Top Filter & Scope Header */}
      <div className="card" style={{ padding: '12px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            type="button"
            className="att-filter-btn"
            onClick={() => setShowFilterModal(true)}
            style={{ height: '36px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Filter size={15} color="#475569" />
            <span>Filter</span>
            <span className="att-filter-btn-badge">{activeFilterCount}</span>
          </button>

          {/* Active Filter Badges */}
          {activeFilterCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {taskFilters.departments.map(d => (
                <span key={d} style={{ backgroundColor: '#eff6ff', color: '#155DFC', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {d}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => setTaskFilters(prev => ({ ...prev, departments: prev.departments.filter(x => x !== d) }))} />
                </span>
              ))}
              {taskFilters.priorities.map(p => (
                <span key={p} style={{ backgroundColor: '#eff6ff', color: '#155DFC', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {p}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => setTaskFilters(prev => ({ ...prev, priorities: prev.priorities.filter(x => x !== p) }))} />
                </span>
              ))}
              {taskFilters.statuses.map(s => (
                <span key={s} style={{ backgroundColor: '#eff6ff', color: '#155DFC', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Status: {s}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => setTaskFilters(prev => ({ ...prev, statuses: prev.statuses.filter(x => x !== s) }))} />
                </span>
              ))}
              {taskFilters.sources.map(src => (
                <span key={src} style={{ backgroundColor: '#eff6ff', color: '#155DFC', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Source: {src}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => setTaskFilters(prev => ({ ...prev, sources: prev.sources.filter(x => x !== src) }))} />
                </span>
              ))}
              {taskFilters.dateRange !== 'all' && (
                <span style={{ backgroundColor: '#eff6ff', color: '#155DFC', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Date: {taskFilters.dateRange.replace('_', ' ')}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => setTaskFilters(prev => ({ ...prev, dateRange: 'all' }))} />
                </span>
              )}
              <button 
                type="button"
                onClick={() => setTaskFilters(initialTaskFiltersState)}
                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', padding: '2px 6px' }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
          Showing <strong>{filteredTasks.length}</strong> of {roleScopedTasks.length} Tasks
        </span>
      </div>

      {/* Task Filter Modal Component */}
      <TaskFilterModal 
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        currentFilters={taskFilters}
        onApply={(updatedFilters) => setTaskFilters(updatedFilters)}
        onReset={() => setTaskFilters(initialTaskFiltersState)}
      />

      {/* 7 KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '22px' }}>
        <div className="kpi-card" onClick={() => onNavigateTab('register')} style={{ cursor: 'pointer', borderTop: '3px solid #3b82f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>TOTAL TASKS</span>
            <CheckSquare size={16} color="#3b82f6" />
          </div>
          <div className="kpi-value" style={{ fontSize: '1.75rem', margin: '6px 0 2px' }}>{totalCount}</div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Filtered scope</span>
        </div>

        <div className="kpi-card" onClick={() => onNavigateTab('register')} style={{ cursor: 'pointer', borderTop: '3px solid #64748b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>OPEN / NEW</span>
            <Clock size={16} color="#64748b" />
          </div>
          <div className="kpi-value" style={{ fontSize: '1.75rem', margin: '6px 0 2px' }}>{openCount}</div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Awaiting commencement</span>
        </div>

        <div className="kpi-card" onClick={() => onNavigateTab('register')} style={{ cursor: 'pointer', borderTop: '3px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>IN PROGRESS</span>
            <TrendingUp size={16} color="#2563eb" />
          </div>
          <div className="kpi-value" style={{ fontSize: '1.75rem', margin: '6px 0 2px', color: '#2563eb' }}>{inProgressCount + partiallyCompletedCount}</div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{partiallyCompletedCount} partial</span>
        </div>

        <div className="kpi-card" onClick={() => onNavigateTab('register')} style={{ cursor: 'pointer', borderTop: '3px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>COMPLETED</span>
            <CheckCircle2 size={16} color="#10b981" />
          </div>
          <div className="kpi-value" style={{ fontSize: '1.75rem', margin: '6px 0 2px', color: '#10b981' }}>{completedCount}</div>
          <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>{completionRate}% success rate</span>
        </div>

        <div className="kpi-card" onClick={() => onNavigateTab('register')} style={{ cursor: 'pointer', borderTop: '3px solid #ef4444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#dc2626' }}>OVERDUE</span>
            <AlertTriangle size={16} color="#ef4444" />
          </div>
          <div className="kpi-value" style={{ fontSize: '1.75rem', margin: '6px 0 2px', color: '#dc2626' }}>{overdueCount}</div>
          <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600 }}>Action required</span>
        </div>

        <div className="kpi-card" onClick={() => onNavigateTab('register')} style={{ cursor: 'pointer', borderTop: '3px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>DUE THIS WEEK</span>
            <Calendar size={16} color="#f59e0b" />
          </div>
          <div className="kpi-value" style={{ fontSize: '1.75rem', margin: '6px 0 2px', color: '#b45309' }}>{dueThisWeekCount}</div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Next 7 days</span>
        </div>

        <div className="kpi-card" onClick={() => onNavigateTab('mom')} style={{ cursor: 'pointer', borderTop: '3px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>MOM LINKED</span>
            <Link2 size={16} color="#8b5cf6" />
          </div>
          <div className="kpi-value" style={{ fontSize: '1.75rem', margin: '6px 0 2px', color: '#7c3aed' }}>{momLinkedCount}</div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Meeting action items</span>
        </div>
      </div>

      {/* Critical Management Alert Banners */}
      {(overdueTasksList.length > 0 || criticalTasksList.length > 0 || dueTodayTasksList.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px', marginBottom: '22px' }}>
          {overdueTasksList.length > 0 && (
            <div className="card" style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <AlertTriangle size={18} color="#dc2626" />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#991b1b', margin: 0 }}>
                  {overdueTasksList.length} Overdue Tasks Detected
                </h4>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#7f1d1d', marginBottom: '10px' }}>
                Immediate escalation or due date revision required.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {overdueTasksList.slice(0, 2).map(task => (
                  <div 
                    key={task.id} 
                    onClick={() => onSelectTask(task.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{task.taskNumber}: {task.title.slice(0, 32)}...</span>
                    <span style={{ color: '#dc2626', fontWeight: 700 }}>Due: {formatDateDDMMYYYY(task.dueDate)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {criticalTasksList.length > 0 && (
            <div className="card" style={{ background: '#fff7ed', borderLeft: '4px solid #f97316', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <AlertCircle size={18} color="#ea580c" />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#9a3412', margin: 0 }}>
                  {criticalTasksList.length} Urgent Priority Tasks In Flight
                </h4>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#7c2d12', marginBottom: '10px' }}>
                High-impact tasks requiring senior leadership attention.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {criticalTasksList.slice(0, 2).map(task => (
                  <div 
                    key={task.id} 
                    onClick={() => onSelectTask(task.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{task.taskNumber}: {task.title.slice(0, 32)}...</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dueTodayTasksList.length > 0 && (
            <div className="card" style={{ background: '#f0fdf4', borderLeft: '4px solid #10b981', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Clock size={18} color="#059669" />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#065f46', margin: 0 }}>
                  {dueTodayTasksList.length} Tasks Due Today
                </h4>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#064e3b', marginBottom: '10px' }}>
                Final hours for completion before automatic escalation triggers.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {dueTodayTasksList.slice(0, 2).map(task => (
                  <div 
                    key={task.id} 
                    onClick={() => onSelectTask(task.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{task.title.slice(0, 30)}...</span>
                    <span style={{ color: '#059669', fontWeight: 600 }}>{task.department}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Middle Row: Status Donut Chart & Completion Velocity Trend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '20px', marginBottom: '22px' }}>
        {/* Status Distribution */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Task Status Distribution</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>System-derived</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <canvas ref={statusCanvasRef} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#10b981' }} />
              <span>Completed ({completedCount})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#3b82f6' }} />
              <span>In Progress ({inProgressCount})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#f59e0b' }} />
              <span>Partially Done ({partiallyCompletedCount})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#94a3b8' }} />
              <span>Open ({openCount})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#ef4444' }} />
              <span>Overdue ({overdueCount})</span>
            </div>
          </div>
        </div>

        {/* Completion Velocity Chart */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Task Completion Velocity</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Created vs. Completed velocity per week</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '10px', height: '10px', background: '#cbd5e1', borderRadius: '2px' }} /> Created
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '10px', height: '10px', background: '#3b82f6', borderRadius: '2px' }} /> Completed
              </span>
            </div>
          </div>

          <div style={{ width: '100%', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <canvas ref={trendCanvasRef} />
          </div>
        </div>
      </div>

      {/* Bottom Row: Person-Wise Workload & Department Performance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px' }}>
        {/* Person-Wise Workload */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} /> Person-Wise Workload & Completion
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{workloadList.length} Active Assignees</span>
          </div>

          <div className="table-responsive">
            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Assignee</th>
                  <th>Open / Active</th>
                  <th>Overdue</th>
                  <th>Completed</th>
                  <th>Workload Level</th>
                  <th>Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {workloadList.map(({ employee, metrics }) => (
                  <tr key={employee.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {employee.avatar ? (
                          <img 
                            src={employee.avatar} 
                            alt={employee.firstName} 
                            style={{ width: '28px', height: '28px', borderRadius: '99px', objectFit: 'cover' }} 
                          />
                        ) : (
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '99px',
                            backgroundColor: '#eff6ff',
                            color: '#155DFC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            flexShrink: 0,
                            border: '1px solid #dbeafe'
                          }}>
                            {employee.firstName?.[0] || ''}{employee.lastName?.[0] || ''}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{employee.firstName} {employee.lastName}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{employee.department}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{metrics.openTasks + metrics.inProgressTasks}</span>
                    </td>
                    <td>
                      <span style={{ color: metrics.overdueTasks > 0 ? '#dc2626' : 'inherit', fontWeight: metrics.overdueTasks > 0 ? 700 : 400 }}>
                        {metrics.overdueTasks}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>{metrics.completedTasks}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${
                        metrics.workloadLevel === 'Overloaded' ? 'rejected' :
                        metrics.workloadLevel === 'High' ? 'late' : 'present'
                      }`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                        {metrics.workloadLevel}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ width: `${metrics.completionRate}%`, height: '100%', background: metrics.completionRate > 70 ? '#10b981' : '#f59e0b' }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{metrics.completionRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Department Benchmark Comparison */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Department Performance</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Task completion %</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {departments.map(dept => {
              const deptTasks = filteredTasks.filter(t => t.department === dept.name);
              const deptCompleted = deptTasks.filter(t => t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED').length;
              const rate = deptTasks.length > 0 ? Math.round((deptCompleted / deptTasks.length) * 100) : 100;

              return (
                <div key={dept.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600 }}>{dept.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {deptCompleted}/{deptTasks.length}
                    </span>
                  </div>
                  <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${rate}%`, 
                        height: '100%', 
                        background: rate >= 80 ? '#10b981' : rate >= 50 ? '#3b82f6' : '#ef4444',
                        transition: 'width 0.5s ease'
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
            <button 
              className="btn btn-secondary" 
              style={{ width: '100%', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
              onClick={() => onNavigateTab('reports')}
            >
              View Detailed Performance Reports <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
