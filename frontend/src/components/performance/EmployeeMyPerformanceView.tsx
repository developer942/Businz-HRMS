import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  EmployeePerformanceDetail,
  PipRecord,
  GoalItem,
  PerformanceReviewRecord
} from '../../types/performance';
import { PerformanceTerminologyTooltip } from './PerformanceTerminologyTooltip';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import {
  User,
  Target,
  Award,
  TrendingUp,
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle2,
  Star,
  Layers,
  FileText,
  ShieldAlert,
  ThumbsUp,
  Sliders,
  Check,
  Building2
} from 'lucide-react';

interface EmployeeMyPerformanceViewProps {
  employees: EmployeePerformanceDetail[];
  pipRecords: PipRecord[];
  goals: GoalItem[];
  reviews: PerformanceReviewRecord[];
  onUpdateGoalProgress?: (goalId: string, newProgress: number) => void;
}

export const EmployeeMyPerformanceView: React.FC<EmployeeMyPerformanceViewProps> = ({
  employees,
  pipRecords,
  goals,
  reviews,
  onUpdateGoalProgress
}) => {
  const { currentUser } = useHRMS();

  // Find the logged-in employee record matching ID, name, or fallback to first employee
  const currentEmp = employees.find(e => 
    (currentUser.employeeId && e.employeeId.toLowerCase() === currentUser.employeeId.toLowerCase()) ||
    e.employeeName.toLowerCase().includes(currentUser.name.toLowerCase().split(' ')[0])
  ) || employees[0];

  // Active Tab for Employee Self-Service
  const [activeTab, setActiveTab] = useState<'overview' | 'goals' | 'kra' | 'kpi' | 'reviews' | 'pip' | 'history'>('overview');

  // Goals for this employee
  const [empGoals, setEmpGoals] = useState<GoalItem[]>(() =>
    goals.filter(g => g.employeeId === currentEmp.employeeId || g.employeeName === currentEmp.employeeName)
  );

  // PIP record for this employee (if assigned)
  const myPip = pipRecords.find(p => p.employeeId === currentEmp.employeeId);

  // Reviews for this employee
  const myReviews = reviews.filter(r => r.employeeId === currentEmp.employeeId);

  // Goal progress update modal state
  const [updatingGoal, setUpdatingGoal] = useState<GoalItem | null>(null);
  const [sliderProgress, setSliderProgress] = useState<number>(0);

  const handleSaveGoalProgress = () => {
    if (!updatingGoal) return;
    setEmpGoals(prev => prev.map(g => {
      if (g.id !== updatingGoal.id) return g;
      const updatedProg = sliderProgress;
      return {
        ...g,
        currentProgress: updatedProg,
        status: updatedProg === 100 ? 'Completed' : g.status
      };
    }));
    if (onUpdateGoalProgress) {
      onUpdateGoalProgress(updatingGoal.id, sliderProgress);
    }
    setUpdatingGoal(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      
      {/* ── EMPLOYEE PROFILE HEADER CARD ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          {/* Employee Avatar & Basic Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              fontWeight: 800,
              boxShadow: '0 4px 10px rgba(14, 116, 144, 0.25)'
            }}>
              {currentEmp.employeeName.charAt(0)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.02em' }}>
                  {currentEmp.employeeName}
                </h1>
                <span style={{
                  padding: '3px 8px',
                  borderRadius: '9999px',
                  backgroundColor: currentEmp.overallScore >= 80 ? '#DCFCE7' : '#FEF3C7',
                  color: currentEmp.overallScore >= 80 ? '#15803D' : '#B45309',
                  fontSize: '11px',
                  fontWeight: 750
                }}>
                  {currentEmp.performanceStatus}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                <strong>{currentEmp.employeeId}</strong> • {currentEmp.designation} • Department: <strong>{currentEmp.department}</strong> • Reporting to: <strong>{currentEmp.reportingManager}</strong>
              </p>
            </div>
          </div>

          {/* Clean Overall Score Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            backgroundColor: '#ECFEFF',
            border: '1px solid #A5F3FC',
            padding: '12px 20px',
            borderRadius: '14px'
          }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Overall Score
              </span>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0E7490', lineHeight: '1.1' }}>
                {currentEmp.overallScore}%
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803D', display: 'block' }}>
                {currentEmp.performanceGrade}
              </span>
              <span style={{ fontSize: '11px', color: '#64748B' }}>
                Evaluation Q3 2026
              </span>
            </div>
          </div>
        </div>

        {/* ── CLEAN TAB BAR (PILLS MATCHING ADVANCE SALARY MANAGEMENT) ── */}
        <div style={{
          display: 'flex',
          gap: '8px',
          borderTop: '1px solid #F1F5F9',
          paddingTop: '16px',
          marginTop: '20px',
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '8px 16px',
              borderRadius: '12px',
              border: activeTab === 'overview' ? '1px solid #0E7490' : '1px solid #E2E8F0',
              backgroundColor: activeTab === 'overview' ? '#0E7490' : '#FFFFFF',
              color: activeTab === 'overview' ? '#FFFFFF' : '#475569',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'overview' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: 'all 0.15s ease'
            }}
          >
            <Award size={15} />
            <span>My Performance</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('goals')}
            style={{
              padding: '8px 16px',
              borderRadius: '12px',
              border: activeTab === 'goals' ? '1px solid #0E7490' : '1px solid #E2E8F0',
              backgroundColor: activeTab === 'goals' ? '#0E7490' : '#FFFFFF',
              color: activeTab === 'goals' ? '#FFFFFF' : '#475569',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'goals' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: 'all 0.15s ease'
            }}
          >
            <Target size={15} />
            <span>My Goals ({empGoals.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kra')}
            style={{
              padding: '8px 16px',
              borderRadius: '12px',
              border: activeTab === 'kra' ? '1px solid #0E7490' : '1px solid #E2E8F0',
              backgroundColor: activeTab === 'kra' ? '#0E7490' : '#FFFFFF',
              color: activeTab === 'kra' ? '#FFFFFF' : '#475569',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'kra' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: 'all 0.15s ease'
            }}
          >
            <Layers size={15} />
            <span>My KRA</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kpi')}
            style={{
              padding: '8px 16px',
              borderRadius: '12px',
              border: activeTab === 'kpi' ? '1px solid #0E7490' : '1px solid #E2E8F0',
              backgroundColor: activeTab === 'kpi' ? '#0E7490' : '#FFFFFF',
              color: activeTab === 'kpi' ? '#FFFFFF' : '#475569',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'kpi' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: 'all 0.15s ease'
            }}
          >
            <TrendingUp size={15} />
            <span>My KPI</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reviews')}
            style={{
              padding: '8px 16px',
              borderRadius: '12px',
              border: activeTab === 'reviews' ? '1px solid #0E7490' : '1px solid #E2E8F0',
              backgroundColor: activeTab === 'reviews' ? '#0E7490' : '#FFFFFF',
              color: activeTab === 'reviews' ? '#FFFFFF' : '#475569',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'reviews' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: 'all 0.15s ease'
            }}
          >
            <FileText size={15} />
            <span>My Reviews</span>
          </button>

          {/* Conditional My PIP tab (Visible ONLY if assigned) */}
          {myPip && (
            <button
              type="button"
              onClick={() => setActiveTab('pip')}
              style={{
                padding: '8px 16px',
                borderRadius: '12px',
                border: activeTab === 'pip' ? '1px solid #D97706' : '1px solid #FDE68A',
                backgroundColor: activeTab === 'pip' ? '#D97706' : '#FEF3C7',
                color: activeTab === 'pip' ? '#FFFFFF' : '#B45309',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: 'all 0.15s ease'
              }}
            >
              <AlertTriangle size={15} />
              <span>My PIP Plan</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            style={{
              padding: '8px 16px',
              borderRadius: '12px',
              border: activeTab === 'history' ? '1px solid #0E7490' : '1px solid #E2E8F0',
              backgroundColor: activeTab === 'history' ? '#0E7490' : '#FFFFFF',
              color: activeTab === 'history' ? '#FFFFFF' : '#475569',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'history' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: 'all 0.15s ease'
            }}
          >
            <Clock size={15} />
            <span>My History</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: MY PERFORMANCE OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 4 Score Breakdown Cards (Matching AdvanceSalary KPI Cards) */}
          <div 
            className="kpi-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px'
            }}
          >
            {/* KRA Breakdown */}
            <div className="kpi-card">
              <div className="kpi-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>KRA SCORE</span>
                  <PerformanceTerminologyTooltip term="KRA" />
                </div>
                <Layers size={20} color="#0E7490" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: '#0E7490' }}>
                  {currentEmp.kraScore}%
                </div>
                <div className="kpi-caption">Key Result Areas weighted</div>
              </div>
            </div>

            {/* KPI Breakdown */}
            <div className="kpi-card">
              <div className="kpi-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>KPI SCORE</span>
                  <PerformanceTerminologyTooltip term="KPI" />
                </div>
                <TrendingUp size={20} color="#16A34A" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: '#16A34A' }}>
                  {currentEmp.kpiScore}%
                </div>
                <div className="kpi-caption">Measurable metrics score</div>
              </div>
            </div>

            {/* Goals Score */}
            <div className="kpi-card">
              <div className="kpi-card-header">
                <span>GOALS PROGRESS</span>
                <Target size={20} color="#7C3AED" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value">
                  {currentEmp.goalScore}%
                </div>
                <div className="kpi-caption">Quarterly milestone pacing</div>
              </div>
            </div>

            {/* Task Performance */}
            <div className="kpi-card">
              <div className="kpi-card-header">
                <span>TASK COMPLETION</span>
                <CheckCircle2 size={20} color="#2563EB" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: '#2563EB' }}>
                  {currentEmp.taskScore}%
                </div>
                <div className="kpi-caption">
                  {currentEmp.taskPerformance.tasksCompleted} / {currentEmp.taskPerformance.tasksAssigned} Completed
                </div>
              </div>
            </div>
          </div>

          {/* Attendance & Task Integration Impact */}
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E7ECF3',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>
              Attendance & Task Impact on Performance
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {/* Attendance */}
              <div style={{ backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>Attendance Record</span>
                  <strong style={{ fontSize: '14px', color: '#0E7490' }}>
                    {currentEmp.attendanceImpact.attendancePercent}%
                  </strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: '#64748B', marginTop: '8px' }}>
                  <div>Late Days: <strong>{currentEmp.attendanceImpact.lateDays}</strong></div>
                  <div>Absent Days: <strong>{currentEmp.attendanceImpact.absentDays}</strong></div>
                  <div>Leaves Taken: <strong>{currentEmp.attendanceImpact.leaveDays}</strong></div>
                  <div>Overtime Hours: <strong>{currentEmp.attendanceImpact.overtimeHours}h</strong></div>
                </div>
              </div>

              {/* Tasks */}
              <div style={{ backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>Task Execution</span>
                  <strong style={{ fontSize: '14px', color: '#16A34A' }}>
                    {currentEmp.taskPerformance.completionRate}%
                  </strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: '#64748B', marginTop: '8px' }}>
                  <div>Tasks Assigned: <strong>{currentEmp.taskPerformance.tasksAssigned}</strong></div>
                  <div>Completed: <strong>{currentEmp.taskPerformance.tasksCompleted}</strong></div>
                  <div>Overdue Tasks: <strong style={{ color: currentEmp.taskPerformance.overdueTasks > 0 ? '#B91C1C' : '#15803D' }}>{currentEmp.taskPerformance.overdueTasks}</strong></div>
                  <div>Completion Rate: <strong>{currentEmp.taskPerformance.completionRate}%</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: MY GOALS ── */}
      {activeTab === 'goals' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>
                My Personal Performance Goals ({empGoals.length})
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
                Update your progress slider as you complete milestones. Approved goals reflect in quarterly appraisal.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {empGoals.map(g => (
              <div
                key={g.id}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '14px'
                }}
              >
                <div style={{ flex: 1, minWidth: '260px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '14px', color: '#1E293B' }}>{g.goalName}</strong>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: g.status === 'Completed' ? '#DCFCE7' : '#ECFEFF',
                      color: g.status === 'Completed' ? '#15803D' : '#0E7490',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      {g.status}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#64748B' }}>{g.description}</p>
                  <span style={{ fontSize: '11px', color: '#0E7490', fontWeight: 700 }}>
                    Target: {g.targetMetric} • Due Date: {formatDateDDMMYYYY(g.dueDate)}
                  </span>
                </div>

                <div style={{ width: '220px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                    <span>Progress</span>
                    <span>{g.currentProgress}%</span>
                  </div>
                  <div style={{ height: '7px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${g.currentProgress}%`,
                      height: '100%',
                      backgroundColor: g.currentProgress >= 100 ? '#16A34A' : '#0E7490',
                      borderRadius: '4px'
                    }} />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setUpdatingGoal(g);
                    setSliderProgress(g.currentProgress);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#ECFEFF',
                    border: '1px solid #A5F3FC',
                    color: '#0E7490',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Sliders size={13} />
                  <span>Update Progress</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: MY KRA ── */}
      {activeTab === 'kra' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>
                  My Assigned Key Result Areas (KRAs)
                </h3>
                <PerformanceTerminologyTooltip term="KRA" />
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
                These are your primary areas of responsibility and expected results for {currentEmp.department}.
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>KRA Area</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Weightage</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Target Metric</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Achievement</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Score</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentEmp.kras.map(kra => (
                  <tr key={kra.id} style={{ borderBottom: '1px solid #E7ECF3' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <strong style={{ fontSize: '13px', color: '#1E293B', display: 'block' }}>{kra.title}</strong>
                      <span style={{ fontSize: '11px', color: '#64748B' }}>{kra.description}</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0E7490' }}>
                      {kra.weightage}%
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#334155' }}>
                      {kra.targetMetric}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#1E293B' }}>
                      {kra.achievedMetric}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0E7490' }}>
                      {kra.score || 90}%
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '9999px', backgroundColor: '#DCFCE7', color: '#15803D', fontSize: '11px', fontWeight: 700 }}>
                        {kra.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: MY KPI ── */}
      {activeTab === 'kpi' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>
                  My Key Performance Indicators (KPIs)
                </h3>
                <PerformanceTerminologyTooltip term="KPI" />
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
                Detailed breakdown of targets, actual values, and progress percentages
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Indicator</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Target</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Actual</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', minWidth: '160px' }}>Achievement Progress</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Weightage</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {(currentEmp.kpis || []).map(kpi => (
                  <tr key={kpi.id} style={{ borderBottom: '1px solid #E7ECF3' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1E293B' }}>{kpi.title}</td>
                    <td style={{ padding: '12px 14px', color: '#475569' }}>{kpi.target}</td>
                    <td style={{ padding: '12px 14px', color: '#1E293B', fontWeight: 700 }}>{kpi.actual}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(kpi.achievementPercentage, 100)}%`,
                            height: '100%',
                            backgroundColor: kpi.achievementPercentage >= 90 ? '#16A34A' : '#0E7490',
                            borderRadius: '4px'
                          }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B' }}>
                          {kpi.achievementPercentage}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0E7490' }}>
                      {kpi.weightage}%
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#1E293B' }}>
                      {kpi.score}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 5: MY REVIEWS ── */}
      {activeTab === 'reviews' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>
            My Appraisal Reviews & Feedback
          </h3>

          {myReviews.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              No completed reviews logged for this cycle yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {myReviews.map(rev => (
                <div
                  key={rev.id}
                  style={{
                    padding: '20px',
                    borderRadius: '14px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <strong style={{ fontSize: '15px', color: '#1E293B' }}>{rev.reviewPeriodLabel}</strong>
                      <span style={{ display: 'block', fontSize: '12px', color: '#64748B' }}>
                        Reviewed by {rev.reviewerName} ({rev.reviewerRole}) on {formatDateDDMMYYYY(rev.reviewDate)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} size={15} fill={s <= rev.rating ? '#F59E0B' : 'transparent'} color={s <= rev.rating ? '#F59E0B' : '#CBD5E1'} />
                      ))}
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', marginLeft: '6px' }}>
                        {rev.rating} – {rev.ratingLabel}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '12px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 800, color: '#16A34A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ThumbsUp size={13} /> Strengths
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#334155' }}>
                        {rev.strengths.map((str, i) => <li key={i}>{str}</li>)}
                      </ul>
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 800, color: '#D97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={13} /> Areas for Improvement
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#334155' }}>
                        {rev.areasForImprovement.map((imp, i) => <li key={i}>{imp}</li>)}
                      </ul>
                    </div>
                  </div>

                  <div style={{ marginTop: '14px', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#475569', fontStyle: 'italic' }}>
                      "Manager feedback: {rev.managerComments}"
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 6: MY PIP (ONLY IF ASSIGNED) ── */}
      {activeTab === 'pip' && myPip && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <div style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#D97706', textTransform: 'uppercase' }}>
                Active Improvement Plan
              </span>
              <span style={{ padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#FEF3C7', color: '#B45309', fontSize: '11px', fontWeight: 700 }}>
                {myPip.status}
              </span>
            </div>
            <h3 style={{ margin: '4px 0 2px', fontSize: '18px', fontWeight: 800, color: '#1E293B' }}>
              Performance Improvement Plan (PIP) Guidance
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748B' }}>
              This structured coaching plan is designed to help you succeed with direct mentoring and clear targets.
            </p>
          </div>

          {/* 5 Clear Questions for the Employee */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* 1. What is the problem? */}
            <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '14px 16px' }}>
              <strong style={{ fontSize: '13px', color: '#92400E', display: 'block', marginBottom: '4px' }}>
                1. What is the problem?
              </strong>
              <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', lineHeight: '1.45' }}>
                {myPip.performanceIssue || myPip.reason}
              </p>
            </div>

            {/* 2. What should improve? */}
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px' }}>
              <strong style={{ fontSize: '13px', color: '#0E7490', display: 'block', marginBottom: '4px' }}>
                2. What should improve?
              </strong>
              <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', lineHeight: '1.45' }}>
                {myPip.improvementArea || myPip.focusAreas.join('; ')}
              </p>
            </div>

            {/* 3. What is the target? */}
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px' }}>
              <strong style={{ fontSize: '13px', color: '#15803D', display: 'block', marginBottom: '4px' }}>
                3. What is the target?
              </strong>
              <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', lineHeight: '1.45' }}>
                {myPip.expectedTarget}
              </p>
            </div>

            {/* 4. What support is provided? */}
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px' }}>
              <strong style={{ fontSize: '13px', color: '#7C3AED', display: 'block', marginBottom: '4px' }}>
                4. What support is provided?
              </strong>
              <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', lineHeight: '1.45' }}>
                {myPip.supportRequired} (Mentor: {myPip.mentorName})
              </p>
            </div>

            {/* 5. When will it be reviewed? */}
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px' }}>
              <strong style={{ fontSize: '13px', color: '#0E7490', display: 'block', marginBottom: '4px' }}>
                5. When will it be reviewed?
              </strong>
              <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', lineHeight: '1.45' }}>
                Review Frequency: <strong>{myPip.reviewFrequency}</strong> with <strong>{myPip.assignedReviewer}</strong>. Final date: <strong>{formatDateDDMMYYYY(myPip.targetEndDate)}</strong>.
              </p>
            </div>

          </div>

          {/* Action Milestones */}
          <div>
            <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>
              Milestones Checklist
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {myPip.milestones.map(m => (
                <div key={m.id} style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: m.status === 'Completed' ? '#F0FDF4' : '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '5px', backgroundColor: m.status === 'Completed' ? '#16A34A' : '#FFFFFF', border: m.status === 'Completed' ? 'none' : '2px solid #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}>
                      {m.status === 'Completed' && <Check size={12} strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', textDecoration: m.status === 'Completed' ? 'line-through' : 'none' }}>
                      {m.title}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>Due: {formatDateDDMMYYYY(m.targetDate)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 7: MY PERFORMANCE HISTORY (TIMELINE & SVG CHART) ── */}
      {activeTab === 'history' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>
            My Performance History & Growth Trend
          </h3>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748B' }}>
            Historical evaluation progression across quarterly appraisal cycles
          </p>

          {/* Clean SVG Trend Chart */}
          <div style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase' }}>
                Score Progression
              </span>
              <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: 700 }}>
                ↑ Positive Improvement Trend
              </span>
            </div>

            {/* SVG Line Chart */}
            <div style={{ width: '100%', height: '140px' }}>
              <svg viewBox="0 0 500 120" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                {/* Horizontal Gridlines */}
                <line x1="40" y1="20" x2="480" y2="20" stroke="#E2E8F0" strokeDasharray="3 3" />
                <line x1="40" y1="60" x2="480" y2="60" stroke="#E2E8F0" strokeDasharray="3 3" />
                <line x1="40" y1="100" x2="480" y2="100" stroke="#E2E8F0" />

                {/* Data Points */}
                {/* 2026 Q1: 78% (y: 65), 2026 Q2: 84% (y: 45), 2026 Q3: 92% (y: 25) */}
                <polyline
                  fill="none"
                  stroke="#0E7490"
                  strokeWidth="3"
                  points="90,75 250,55 420,25"
                />

                {/* Point Dots */}
                <circle cx="90" cy="75" r="5" fill="#0E7490" />
                <circle cx="250" cy="55" r="5" fill="#0E7490" />
                <circle cx="420" cy="25" r="6" fill="#16A34A" />

                {/* Value Tags */}
                <text x="90" y="65" textAnchor="middle" fontSize="11" fontWeight="700" fill="#475569">
                  78%
                </text>
                <text x="250" y="45" textAnchor="middle" fontSize="11" fontWeight="700" fill="#475569">
                  84%
                </text>
                <text x="420" y="15" textAnchor="middle" fontSize="12" fontWeight="800" fill="#15803D">
                  {currentEmp.overallScore}%
                </text>

                {/* X Axis Labels */}
                <text x="90" y="115" textAnchor="middle" fontSize="11" fill="#64748B">2026 Q1</text>
                <text x="250" y="115" textAnchor="middle" fontSize="11" fill="#64748B">2026 Q2</text>
                <text x="420" y="115" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0E7490">2026 Q3 (Current)</text>
              </svg>
            </div>
          </div>

          {/* Timeline List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#ECFEFF', border: '1px solid #A5F3FC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: '13px', color: '#1E293B' }}>2026 Q3 — {currentEmp.overallScore}%</strong>
                <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Current Quarter Evaluation • Grade: {currentEmp.performanceGrade}</span>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0E7490' }}>Active Cycle</span>
            </div>

            <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: '13px', color: '#1E293B' }}>2026 Q2 — 84%</strong>
                <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Completed on July 4, 2026 • Rating: 4.2 / 5.0</span>
              </div>
              <span style={{ fontSize: '12px', color: '#15803D', fontWeight: 700 }}>Verified</span>
            </div>

            <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: '13px', color: '#1E293B' }}>2026 Q1 — 78%</strong>
                <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Completed on April 2, 2026 • Rating: 3.8 / 5.0</span>
              </div>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>Archived</span>
            </div>
          </div>
        </div>
      )}

      {/* ── GOAL PROGRESS UPDATE MODAL ── */}
      {updatingGoal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '420px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>
              Update Goal Progress
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748B' }}>
              {updatingGoal.goalName}
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>Current Completion:</span>
              <strong style={{ fontSize: '16px', color: '#0E7490' }}>{sliderProgress}%</strong>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={sliderProgress}
              onChange={e => setSliderProgress(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#0E7490', cursor: 'pointer', marginBottom: '16px' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setUpdatingGoal(null)}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGoalProgress}
                style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', backgroundColor: '#0E7490', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Save Progress
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
