import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Filter, 
  CheckSquare, 
  Calendar, 
  User, 
  Building, 
  AlertTriangle, 
  Clock, 
  FileText,
  TrendingUp,
  FileCheck
} from 'lucide-react';
import { computeDueStatus, calculateEmployeeTaskMetrics } from '../../types/tasks';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export const TaskReports: React.FC = () => {
  const { enhancedTasks, departments, employees } = useHRMS();

  const [activeReport, setActiveReport] = useState<
    'summary' | 'employee_perf' | 'dept_breakdown' | 'overdue_analysis' | 'escalations' | 'workload_capacity'
  >('summary');

  const [selectedPeriod, setSelectedPeriod] = useState<'all' | 'q3_2026' | 'this_month'>('all');

  // Tasks for reports
  const filteredTasks = enhancedTasks;

  // Report 1: Department Summary
  const departmentSummaryData = useMemo(() => {
    return departments.map(d => {
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
        avgProgress,
        compRate
      };
    });
  }, [departments, enhancedTasks]);

  // Report 2: Employee Task Performance
  const employeePerfData = useMemo(() => {
    return employees.map(emp => {
      const metrics = calculateEmployeeTaskMetrics(emp.employeeId, filteredTasks);
      return {
        employee: emp,
        metrics
      };
    });
  }, [employees, filteredTasks]);

  // Report 4: Overdue Task Analysis
  const overdueAnalysisData = useMemo(() => {
    const today = new Date();

    return filteredTasks.filter(t => {
      const due = computeDueStatus(t.dueDate, t.overallStatus);
      return due === 'Overdue' && t.overallStatus !== 'CLOSED';
    }).map(t => {
      const dueDate = new Date(t.dueDate);
      const daysOverdue = Math.max(1, Math.round((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24)));

      return {
        task: t,
        daysOverdue
      };
    });
  }, [filteredTasks]);


  return (
    <div className="task-reports-container">
      {/* Report Selection Tabs */}
      <div className="tab-container" style={{ marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { id: 'summary', label: 'Department Summary' },
          { id: 'employee_perf', label: 'Employee Scorecard' },
          { id: 'overdue_analysis', label: 'Overdue Deep-Dive' },
          { id: 'workload_capacity', label: 'Workload & Capacity' }
        ].map(r => (
          <button
            key={r.id}
            className={`tab-btn ${activeReport === r.id ? 'active' : ''}`}
            onClick={() => setActiveReport(r.id as any)}
            style={{ fontSize: '0.8rem' }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* REPORT 1: DEPARTMENT SUMMARY */}
      {activeReport === 'summary' && (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Total Tasks</th>
                  <th>Completed</th>
                  <th>In Progress</th>
                  <th>Open</th>
                  <th>Overdue</th>
                  <th>Average Progress</th>
                  <th>Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                {departmentSummaryData.map(d => (
                  <tr key={d.department}>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>{d.department}</td>
                    <td style={{ fontWeight: 600 }}>{d.total}</td>
                    <td style={{ color: '#10b981', fontWeight: 600 }}>{d.completed}</td>
                    <td style={{ color: '#3b82f6' }}>{d.inProgress}</td>
                    <td style={{ color: '#64748b' }}>{d.open}</td>
                    <td style={{ color: d.overdue > 0 ? '#dc2626' : 'inherit', fontWeight: d.overdue > 0 ? 700 : 400 }}>
                      {d.overdue}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '60px', height: '6px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ width: `${d.avgProgress}%`, height: '100%', background: '#3b82f6' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{d.avgProgress}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${d.compRate >= 80 ? 'present' : d.compRate >= 50 ? 'late' : 'rejected'}`} style={{ fontSize: '0.7rem' }}>
                        {d.compRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 2: EMPLOYEE TASK SCORECARD */}
      {activeReport === 'employee_perf' && (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Total Assigned</th>
                  <th>Completed</th>
                  <th>In Progress</th>
                  <th>Overdue</th>
                  <th>Completion Rate</th>
                  <th>Capacity Level</th>
                </tr>
              </thead>
              <tbody>
                {employeePerfData.map(({ employee, metrics }) => (
                  <tr key={employee.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {employee.avatar ? (
                          <img src={employee.avatar} alt={employee.firstName} style={{ width: '28px', height: '28px', borderRadius: '99px' }} />
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
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{employee.designation}</div>
                        </div>
                      </div>
                    </td>
                    <td>{employee.department}</td>
                    <td style={{ fontWeight: 700 }}>{metrics.totalAssigned}</td>
                    <td style={{ color: '#10b981', fontWeight: 600 }}>{metrics.completedTasks}</td>
                    <td style={{ color: '#3b82f6' }}>{metrics.inProgressTasks}</td>
                    <td style={{ color: metrics.overdueTasks > 0 ? '#dc2626' : 'inherit', fontWeight: metrics.overdueTasks > 0 ? 700 : 400 }}>
                      {metrics.overdueTasks}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '60px', height: '6px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ width: `${metrics.completionRate}%`, height: '100%', background: metrics.completionRate >= 70 ? '#10b981' : '#f59e0b' }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{metrics.completionRate}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${
                        metrics.workloadLevel === 'Overloaded' ? 'rejected' :
                        metrics.workloadLevel === 'High' ? 'late' : 'present'
                      }`} style={{ fontSize: '0.68rem' }}>
                        {metrics.workloadLevel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 3: OVERDUE DEEP-DIVE */}
      {activeReport === 'overdue_analysis' && (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Task No & Title</th>
                  <th>Department</th>
                  <th>Responsible Person</th>
                  <th>Due Date</th>
                  <th>Days Overdue</th>
                  <th>Assignees Pending</th>
                </tr>
              </thead>
              <tbody>
                {overdueAnalysisData.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#10b981', fontWeight: 600 }}>
                      ✓ Zero overdue tasks found! Outstanding performance.
                    </td>
                  </tr>
                ) : (
                  overdueAnalysisData.map(({ task, daysOverdue }) => (
                    <tr key={task.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#dc2626' }}>{task.taskNumber}: {task.title}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{task.taskCategory}</div>
                      </td>
                      <td>{task.department}</td>
                      <td>{task.responsiblePersonName}</td>
                      <td style={{ color: '#dc2626', fontWeight: 600 }}>{formatDateDDMMYYYY(task.dueDate)}</td>
                      <td>
                        <span style={{ background: '#fee2e2', color: '#dc2626', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                          +{daysOverdue} days
                        </span>
                      </td>
                      <td>
                        {task.assignees.filter(a => a.individualStatus !== 'Completed').map(a => a.employeeName).join(', ')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}



      {/* REPORT 6: WORKLOAD & CAPACITY */}
      {activeReport === 'workload_capacity' && (
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '14px' }}>Workload Distribution Spectrum</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {['Light', 'Normal', 'High', 'Overloaded'].map(level => {
              const matches = employeePerfData.filter(e => e.metrics.workloadLevel === level);
              return (
                <div key={level} className="card" style={{ padding: '16px', background: '#f8fafc' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{level} Capacity</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '6px 0', color: level === 'Overloaded' ? '#dc2626' : level === 'High' ? '#f59e0b' : '#10b981' }}>
                    {matches.length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Employees in band</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
