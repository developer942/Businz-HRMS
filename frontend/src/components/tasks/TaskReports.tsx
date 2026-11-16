import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  CheckSquare,
  User,
  Building,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  ChevronDown
} from 'lucide-react';
import { computeDueStatus, calculateEmployeeTaskMetrics } from '../../types/tasks';
import { formatDateDDMMYYYY, formatDateDayMonthYear } from '../../utils/dateUtils';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { preventSpaceEnterPropagation } from '../../utils/keyboardUtils';

export const TaskReports: React.FC = () => {
  const { enhancedTasks, departments, employees, currentUser } = useHRMS();

  const [activeReport, setActiveReport] = useState<
    'summary' | 'employee_perf' | 'overdue_analysis' | 'workload_capacity'
  >('summary');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scopedTasks = useMemo(() => {
    return enhancedTasks.filter(t => {
      if (selectedDept !== 'ALL' && t.department !== selectedDept) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchNo = t.taskNumber.toLowerCase().includes(q);
        const matchDept = t.department.toLowerCase().includes(q);
        const matchResp = (t.responsiblePersonName || '').toLowerCase().includes(q);
        if (!matchTitle && !matchNo && !matchDept && !matchResp) return false;
      }
      return true;
    });
  }, [enhancedTasks, selectedDept, searchQuery]);

  // Report KPI Overview
  const kpiOverview = useMemo(() => {
    const total = scopedTasks.length;
    const pending = scopedTasks.filter(t => t.overallStatus === 'OPEN' || t.overallStatus === 'REOPENED').length;
    const inProcess = scopedTasks.filter(
      t => t.overallStatus === 'IN PROGRESS' || t.overallStatus === 'PARTIALLY COMPLETED'
    ).length;
    const underReview = scopedTasks.filter(t => t.overallStatus === 'UNDER REVIEW').length;
    const completed = scopedTasks.filter(t => t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED').length;
    const overdue = scopedTasks.filter(
      t => computeDueStatus(t.dueDate, t.overallStatus) === 'Overdue' && t.overallStatus !== 'CLOSED'
    ).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 100;

    return { total, pending, inProcess, underReview, completed, overdue, completionRate };
  }, [scopedTasks]);

  // Report 1: Department Summary
  const departmentSummaryData = useMemo(() => {
    return departments
      .filter(d => selectedDept === 'ALL' || d.name === selectedDept)
      .map(d => {
        const dTasks = scopedTasks.filter(t => t.department === d.name);
        const total = dTasks.length;
        const pending = dTasks.filter(t => t.overallStatus === 'OPEN' || t.overallStatus === 'REOPENED').length;
        const inProcess = dTasks.filter(
          t => t.overallStatus === 'IN PROGRESS' || t.overallStatus === 'PARTIALLY COMPLETED'
        ).length;
        const underReview = dTasks.filter(t => t.overallStatus === 'UNDER REVIEW').length;
        const completed = dTasks.filter(t => t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED').length;
        const overdue = dTasks.filter(
          t => computeDueStatus(t.dueDate, t.overallStatus) === 'Overdue' && t.overallStatus !== 'CLOSED'
        ).length;
        const avgProgress =
          total > 0 ? Math.round(dTasks.reduce((sum, t) => sum + t.overallProgress, 0) / total) : 0;
        const compRate = total > 0 ? Math.round((completed / total) * 100) : 100;

        return {
          department: d.name,
          total,
          pending,
          inProcess,
          underReview,
          completed,
          overdue,
          avgProgress,
          compRate
        };
      });
  }, [departments, scopedTasks, selectedDept]);

  // Report 2: Employee Task Performance
  const employeePerfData = useMemo(() => {
    return employees
      .filter(emp => {
        if (selectedDept !== 'ALL' && emp.department !== selectedDept) return false;
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
          if (
            !fullName.includes(q) &&
            !(emp.department || '').toLowerCase().includes(q) &&
            !(emp.designation || '').toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        return true;
      })
      .map(emp => {
        const metrics = calculateEmployeeTaskMetrics(emp.employeeId, enhancedTasks);
        return {
          employee: emp,
          metrics
        };
      });
  }, [employees, enhancedTasks, selectedDept, searchQuery]);

  // Report 3: Overdue Task Analysis
  const overdueAnalysisData = useMemo(() => {
    const today = new Date();
    return scopedTasks
      .filter(t => {
        const due = computeDueStatus(t.dueDate, t.overallStatus);
        return due === 'Overdue' && t.overallStatus !== 'CLOSED';
      })
      .map(t => {
        const dueDate = new Date(t.dueDate);
        const daysOverdue = Math.max(1, Math.round((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24)));
        return {
          task: t,
          daysOverdue
        };
      });
  }, [scopedTasks]);

  const handleExportCurrentReport = (type: 'excel' | 'pdf') => {
    setShowExportMenu(false);
    const timestamp = new Date().toISOString().split('T')[0];

    if (activeReport === 'summary') {
      const cols = [
        { header: 'Department', key: 'department' },
        { header: 'Total Tasks', key: 'total' },
        { header: 'Pending', key: 'pending' },
        { header: 'In Process', key: 'inProcess' },
        { header: 'Under Review', key: 'underReview' },
        { header: 'Completed', key: 'completed' },
        { header: 'Overdue', key: 'overdue' },
        { header: 'Avg Progress', key: 'avgProgressStr' },
        { header: 'Completion Rate', key: 'compRateStr' }
      ];
      const rows = departmentSummaryData.map(d => ({
        ...d,
        avgProgressStr: `${d.avgProgress}%`,
        compRateStr: `${d.compRate}%`
      }));
      if (type === 'excel') exportToExcel(rows, cols, `Task_Department_Summary_${timestamp}`);
      else exportToPDF(rows, cols, 'Task Department Summary Report', `Task_Department_Summary_${timestamp}`);
    } else if (activeReport === 'employee_perf' || activeReport === 'workload_capacity') {
      const cols = [
        { header: 'Employee ID', key: 'empId' },
        { header: 'Employee Name', key: 'empName' },
        { header: 'Department', key: 'dept' },
        { header: 'Designation', key: 'desig' },
        { header: 'Total Assigned', key: 'totalAssigned' },
        { header: 'Completed', key: 'completedTasks' },
        { header: 'In Process', key: 'inProgressTasks' },
        { header: 'Overdue', key: 'overdueTasks' },
        { header: 'Completion Rate', key: 'compRateStr' },
        { header: 'Workload Level', key: 'workloadLevel' }
      ];
      const rows = employeePerfData.map(({ employee, metrics }) => ({
        empId: employee.employeeId,
        empName: `${employee.firstName} ${employee.lastName}`,
        dept: employee.department,
        desig: employee.designation,
        totalAssigned: metrics.totalAssigned,
        completedTasks: metrics.completedTasks,
        inProgressTasks: metrics.inProgressTasks,
        overdueTasks: metrics.overdueTasks,
        compRateStr: `${metrics.completionRate}%`,
        workloadLevel: metrics.workloadLevel
      }));
      if (type === 'excel') exportToExcel(rows, cols, `Employee_Task_Scorecard_${timestamp}`);
      else exportToPDF(rows, cols, 'Employee Task Scorecard Report', `Employee_Task_Scorecard_${timestamp}`);
    } else {
      const cols = [
        { header: 'Task ID', key: 'taskNo' },
        { header: 'Task Name', key: 'title' },
        { header: 'Department', key: 'dept' },
        { header: 'Responsible Person', key: 'resp' },
        { header: 'End Date', key: 'dueDateStr' },
        { header: 'Days Overdue', key: 'daysOverdueStr' }
      ];
      const rows = overdueAnalysisData.map(({ task, daysOverdue }) => ({
        taskNo: task.taskNumber,
        title: task.title,
        dept: task.department,
        resp: task.responsiblePersonName,
        dueDateStr: formatDateDDMMYYYY(task.dueDate),
        daysOverdueStr: `+${daysOverdue} days`
      }));
      if (type === 'excel') exportToExcel(rows, cols, `Overdue_Tasks_Report_${timestamp}`);
      else exportToPDF(rows, cols, 'Overdue Tasks Analysis Report', `Overdue_Tasks_Report_${timestamp}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
      {/* ============================================================ */}
      {/* STATUS BREAKDOWN KPI STRIP                                   */}
      {/* ============================================================ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
          gap: '10px'
        }}
      >
        {[
          { label: 'Total Tasks', value: kpiOverview.total, color: '#0F172A', bg: '#FFFFFF' },
          { label: 'Pending', value: kpiOverview.pending, color: '#475569', bg: '#FFFFFF' },
          { label: 'In Process', value: kpiOverview.inProcess, color: '#0284C7', bg: '#FFFFFF' },
          { label: 'Under Review', value: kpiOverview.underReview, color: '#D97706', bg: '#FFFFFF' },
          { label: 'Completed', value: kpiOverview.completed, color: '#16A34A', bg: '#FFFFFF' },
          { label: 'Completion Rate', value: `${kpiOverview.completionRate}%`, color: '#0E7490', bg: '#ECFEFF' }
        ].map((card, idx) => (
          <div
            key={idx}
            style={{
              background: card.bg,
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '12px 14px',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)'
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>
              {card.label}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: card.color, lineHeight: 1.1 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* ============================================================ */}
      {/* REPORT SUB-TABS & FILTER BAR                                 */}
      {/* ============================================================ */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)'
        }}
      >
        {/* Left: Segmented Report Type Tabs */}
        <div
          style={{
            display: 'inline-flex',
            background: '#F1F5F9',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            flexWrap: 'wrap',
            gap: '2px'
          }}
        >
          {[
            { id: 'summary', label: 'Department Summary' },
            { id: 'employee_perf', label: 'Employee Scorecard' },
            { id: 'overdue_analysis', label: 'Overdue Tasks' },
            { id: 'workload_capacity', label: 'Team Capacity' }
          ].map(tab => {
            const isActive = activeReport === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveReport(tab.id as any)}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isActive ? '#0E7490' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#475569',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right: Search + Department Filter + Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '200px' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              placeholder="Search report..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={preventSpaceEnterPropagation}
              style={{
                width: '100%',
                height: '36px',
                paddingLeft: '30px',
                paddingRight: '10px',
                borderRadius: '9px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                fontSize: '0.78rem',
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <select
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
            style={{
              height: '36px',
              padding: '0 10px',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: '9px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          <div ref={exportMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowExportMenu(prev => !prev)}
              style={{
                height: '36px',
                padding: '0 12px',
                borderRadius: '9px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                color: '#0E7490',
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Download size={14} />
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
                  minWidth: '180px',
                  zIndex: 80,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                <button
                  type="button"
                  onClick={() => handleExportCurrentReport('excel')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <FileSpreadsheet size={15} color="#16A34A" />
                  <span>Export to Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCurrentReport('pdf')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <FileText size={15} color="#DC2626" />
                  <span>Export to PDF (.pdf)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* REPORT 1: DEPARTMENT SUMMARY                                 */}
      {/* ============================================================ */}
      {activeReport === 'summary' && (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
          }}
        >
          <div className="desktop-only-block" style={{ width: '100%' }}>
            <table className="hrms-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ width: '22%', padding: '12px 14px' }}>Department</th>
                  <th style={{ width: '10%', padding: '12px 10px' }}>Total</th>
                  <th style={{ width: '10%', padding: '12px 10px' }}>Pending</th>
                  <th style={{ width: '11%', padding: '12px 10px' }}>In Process</th>
                  <th style={{ width: '12%', padding: '12px 10px' }}>Under Review</th>
                  <th style={{ width: '11%', padding: '12px 10px' }}>Completed</th>
                  <th style={{ width: '14%', padding: '12px 10px' }}>Avg Progress</th>
                  <th style={{ width: '10%', padding: '12px 14px', textAlign: 'right' }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {departmentSummaryData.map(d => (
                  <tr key={d.department} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0F172A' }}>{d.department}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: '#334155' }}>{d.total}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 600, color: '#64748B' }}>{d.pending}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: '#0284C7' }}>{d.inProcess}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: '#D97706' }}>{d.underReview}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: '#16A34A' }}>{d.completed}</td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            flex: 1,
                            height: '7px',
                            background: '#E2E8F0',
                            borderRadius: '999px',
                            overflow: 'hidden'
                          }}
                        >
                          <div
                            style={{
                              width: `${d.avgProgress}%`,
                              height: '100%',
                              background: '#0E7490',
                              borderRadius: '999px'
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A' }}>
                          {d.avgProgress}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <span
                        style={{
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          background: d.compRate >= 80 ? '#DCFCE7' : d.compRate >= 50 ? '#FEF3C7' : '#FEE2E2',
                          color: d.compRate >= 80 ? '#15803D' : d.compRate >= 50 ? '#D97706' : '#DC2626'
                        }}
                      >
                        {d.compRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-only-block" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {departmentSummaryData.map(d => (
              <div
                key={d.department}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.92rem', color: '#0F172A' }}>{d.department}</strong>
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      background: '#ECFEFF',
                      color: '#0E7490'
                    }}
                  >
                    {d.compRate}% Done
                  </span>
                </div>
                <div style={{ width: '100%', height: '7px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${d.avgProgress}%`, height: '100%', background: '#0E7490', borderRadius: '999px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', fontSize: '0.73rem', color: '#64748B', paddingTop: '4px' }}>
                  <div><strong style={{ color: '#0F172A', display: 'block' }}>{d.total}</strong>Total</div>
                  <div><strong style={{ color: '#475569', display: 'block' }}>{d.pending}</strong>Pending</div>
                  <div><strong style={{ color: '#0284C7', display: 'block' }}>{d.inProcess + d.underReview}</strong>Active</div>
                  <div><strong style={{ color: '#16A34A', display: 'block' }}>{d.completed}</strong>Done</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* REPORT 2 & 4: EMPLOYEE SCORECARD & TEAM CAPACITY             */}
      {/* ============================================================ */}
      {(activeReport === 'employee_perf' || activeReport === 'workload_capacity') && (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
          }}
        >
          <div className="desktop-only-block" style={{ width: '100%' }}>
            <table className="hrms-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ width: '25%', padding: '12px 14px' }}>Employee</th>
                  <th style={{ width: '15%', padding: '12px 10px' }}>Department</th>
                  <th style={{ width: '10%', padding: '12px 10px' }}>Assigned</th>
                  <th style={{ width: '10%', padding: '12px 10px' }}>In Process</th>
                  <th style={{ width: '10%', padding: '12px 10px' }}>Completed</th>
                  <th style={{ width: '16%', padding: '12px 10px' }}>Completion Rate</th>
                  <th style={{ width: '14%', padding: '12px 14px', textAlign: 'right' }}>Workload</th>
                </tr>
              </thead>
              <tbody>
                {employeePerfData.map(({ employee, metrics }) => (
                  <tr key={employee.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: '#ECFEFF',
                            color: '#0E7490',
                            border: '1px solid #BAE6FD',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            flexShrink: 0
                          }}
                        >
                          {employee.firstName?.[0] || 'U'}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.83rem', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {employee.firstName} {employee.lastName}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {employee.designation}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 10px', fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                      {employee.department}
                    </td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: '#0F172A' }}>{metrics.totalAssigned}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: '#0284C7' }}>{metrics.inProgressTasks}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: '#16A34A' }}>{metrics.completedTasks}</td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '7px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${metrics.completionRate}%`,
                              height: '100%',
                              background: '#0E7490',
                              borderRadius: '999px'
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0F172A' }}>
                          {metrics.completionRate}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background:
                            metrics.workloadLevel === 'Overloaded'
                              ? '#FEE2E2'
                              : metrics.workloadLevel === 'High'
                              ? '#FEF3C7'
                              : '#DCFCE7',
                          color:
                            metrics.workloadLevel === 'Overloaded'
                              ? '#DC2626'
                              : metrics.workloadLevel === 'High'
                              ? '#D97706'
                              : '#15803D'
                        }}
                      >
                        {metrics.workloadLevel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-only-block" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {employeePerfData.map(({ employee, metrics }) => (
              <div
                key={employee.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                      {employee.firstName} {employee.lastName}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      {employee.department} • {employee.designation}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      background: '#ECFEFF',
                      color: '#0E7490'
                    }}
                  >
                    {metrics.completionRate}%
                  </span>
                </div>
                <div style={{ width: '100%', height: '7px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${metrics.completionRate}%`, height: '100%', background: '#0E7490', borderRadius: '999px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#64748B' }}>
                  <span>Assigned: <strong style={{ color: '#0F172A' }}>{metrics.totalAssigned}</strong></span>
                  <span>In Process: <strong style={{ color: '#0284C7' }}>{metrics.inProgressTasks}</strong></span>
                  <span>Done: <strong style={{ color: '#16A34A' }}>{metrics.completedTasks}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* REPORT 3: OVERDUE ANALYSIS                                   */}
      {/* ============================================================ */}
      {activeReport === 'overdue_analysis' && (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
          }}
        >
          {overdueAnalysisData.length === 0 ? (
            <div style={{ padding: '42px 20px', textAlign: 'center', color: '#16A34A', fontWeight: 700 }}>
              <CheckSquare size={28} style={{ marginBottom: '6px' }} />
              <div>No overdue tasks found — all deliverables are on schedule!</div>
            </div>
          ) : (
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {overdueAnalysisData.map(({ task, daysOverdue }) => (
                <div
                  key={task.id}
                  style={{
                    background: '#FFFBFB',
                    border: '1px solid #FECACA',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                      <span style={{ color: '#0E7490', marginRight: '6px' }}>{task.taskNumber}</span>
                      {task.title}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '3px' }}>
                      {task.department} • Lead: <strong>{task.responsiblePersonName}</strong> • Due{' '}
                      {formatDateDayMonthYear(task.dueDate)}
                    </div>
                  </div>
                  <span
                    style={{
                      background: '#FEE2E2',
                      color: '#DC2626',
                      fontWeight: 800,
                      fontSize: '0.74rem',
                      padding: '4px 10px',
                      borderRadius: '999px'
                    }}
                  >
                    +{daysOverdue} days overdue
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
