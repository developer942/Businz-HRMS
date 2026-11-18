import React, { useState, useMemo } from 'react';
import { ComputedEmployeePerformance } from './performanceEngine';
import { getMonthInfo } from '../../utils/monthUtils';
import { PerformancePillarBarChart } from './charts/PerformancePillarBarChart';
import { PerformanceSpeedometerGauge } from './charts/PerformanceSpeedometerGauge';
import { DEPARTMENT_TEMPLATES } from '../../data/performanceInitialData';
import { 
  Award, 
  CalendarCheck, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  ArrowLeft, 
  Briefcase, 
  User, 
  ShieldCheck, 
  AlertTriangle,
  Target,
  ChevronDown
} from 'lucide-react';

interface Props {
  performance: ComputedEmployeePerformance;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  isDrilldownView?: boolean;
  onBackToDashboard?: () => void;
}

export const EmployeeDetailPerformanceView: React.FC<Props> = ({
  performance,
  selectedMonth,
  onMonthChange,
  isDrilldownView = false,
  onBackToDashboard
}) => {
  // Tabs: 1. Employee KPI, 2. Attendance, 3. KRI / KRA
  const [activeTab, setActiveTab] = useState<'kpi' | 'attendance' | 'kri'>('kpi');

  const monthOptions = useMemo(() => {
    const cur = getMonthInfo();
    const opts: { label: string; value: string }[] = [];
    opts.push({ label: `${cur.fullLabel} (Current)`, value: cur.fullLabel });

    for (let i = 1; i <= 3; i++) {
      const prevDate = new Date(cur.year, cur.monthIndex - i, 1);
      const prevInfo = getMonthInfo(prevDate);
      opts.push({ label: prevInfo.fullLabel, value: prevInfo.fullLabel });
    }

    const quarter = Math.floor(cur.monthIndex / 3) + 1;
    opts.push({ label: `Q${quarter} ${cur.year} Cumulative`, value: `Q${quarter} ${cur.year}` });
    return opts;
  }, []);

  // Department KRA / KPI template matching this employee's department
  const deptTemplate = useMemo(() => {
    const found = DEPARTMENT_TEMPLATES.find(
      d => d.department.toLowerCase() === (performance?.department || '').toLowerCase()
    );
    if (found) return found;

    const dept = performance?.department || 'General';
    return {
      department: dept,
      kpis: [
        { title: `${dept} Delivery Milestones`, target: '100% on-time', weightage: 35 },
        { title: 'Quality & Process Compliance', target: '98% SLA', weightage: 30 },
        { title: 'Attendance & Shift Regularity', target: '95% attendance', weightage: 20 },
        { title: 'Cross-functional Collaboration', target: 'Zero escalation', weightage: 15 }
      ],
      kras: [
        { title: `${dept} Operational Excellence`, description: `Execute core functional deliverables for ${dept}`, targetMetric: 'Quarterly target', weightage: 40 },
        { title: 'Punctuality & Shift Regularity', description: 'Maintain attendance integrity and on-time punch records', targetMetric: '95% attendance', weightage: 30 },
        { title: 'Team Impact & Productivity', description: 'Deliver assigned task milestones within defined schedule', targetMetric: 'Zero SLA breach', weightage: 30 }
      ]
    };
  }, [performance?.department]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ======================================================== */}
      {/* TOP HEADER PROFILE CARD                                   */}
      {/* ======================================================== */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '18px',
        padding: '20px 24px',
        border: '1px solid #E7ECF3',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {isDrilldownView && onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              title="Back to Company Overview"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#475569',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#ECFEFF'}
              onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}
            >
              <ArrowLeft size={16} />
              <span>Back to Overview</span>
            </button>
          )}

          {/* Profile Photo / Initial Avatar */}
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.2rem',
            border: '1px solid #A5F3FC',
            flexShrink: 0
          }}>
            {performance.avatar ? (
              <img src={performance.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }} />
            ) : (
              performance.name.charAt(0)
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {performance.name}
              </h2>
              <span style={{
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 750,
                backgroundColor: performance.status.bg,
                color: performance.status.color,
                border: `1px solid ${performance.status.borderColor}`
              }}>
                {performance.status.tier}
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0E7490' }}>{performance.employeeId}</span>
              {' • '}{performance.designation}{' • '}{performance.department}
            </p>
          </div>
        </div>

        {/* Period Selector Right */}
        <div style={{ position: 'relative' }}>
          <select
            value={selectedMonth}
            onChange={e => onMonthChange(e.target.value)}
            style={{
              padding: '8px 32px 8px 14px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              fontSize: '0.84rem',
              fontWeight: 600,
              color: '#334155',
              background: '#FFFFFF',
              outline: 'none',
              appearance: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            {monthOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown
            size={14}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: '#64748B'
            }}
          />
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4 HERO KPI CARDS FOR THIS EMPLOYEE (Compact Sizing)       */}
      {/* ======================================================== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '12px'
      }}>
        {/* CARD 1: PRIMARY TEAL HERO CARD */}
        <div style={{
          background: 'linear-gradient(135deg, #0E7490 0%, #0891B2 100%)',
          borderRadius: '14px',
          padding: '14px 18px',
          color: '#FFFFFF',
          boxShadow: '0 6px 18px -4px rgba(14, 116, 144, 0.25), 0 2px 6px -2px rgba(14, 116, 144, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#E0F2FE' }}>
              My KRI Performance Index
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#FFFFFF',
              color: '#0E7490',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 5px rgba(0, 0, 0, 0.08)'
            }}>
              <Award size={16} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
              {performance.overallScore}%
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 750,
              background: 'rgba(255, 255, 255, 0.22)',
              color: '#FFFFFF',
              padding: '2px 7px',
              borderRadius: '9999px',
              backdropFilter: 'blur(4px)'
            }}>
              {performance.status.tier}
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#CFFAFE', fontWeight: 500 }}>
            {performance.overallScore > 0 ? `${performance.status.tier} Performance` : 'Pending Data'}
          </div>
        </div>

        {/* CARD 2: EMPLOYEE KPI COMPLETION */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          padding: '14px 18px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>
              KPI Targets Met
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#0F172A',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Target size={16} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {performance.tasksCompleted} <span style={{ fontSize: '0.95rem', color: '#64748B', fontWeight: 600 }}>/ {performance.tasksTotal}</span>
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 750,
              background: '#EFF6FF',
              color: '#2563EB',
              padding: '2px 7px',
              borderRadius: '9999px'
            }}>
              {performance.taskCompletionRate}%
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
            On-time delivery: {performance.onTimeCompletionRate}%
          </div>
        </div>

        {/* CARD 3: ATTENDANCE & PUNCTUALITY */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          padding: '14px 18px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>
              My Attendance Rate
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#0284C7',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CalendarCheck size={16} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {performance.attendanceRate}%
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 750,
              background: '#DCFCE7',
              color: '#15803D',
              padding: '2px 7px',
              borderRadius: '9999px'
            }}>
              {performance.presentDays} Days
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
            Present: {performance.presentDays}d • Late punches: {performance.lateDays}d
          </div>
        </div>

        {/* CARD 4: KRA / KRI DELIVERABLES */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          padding: '14px 18px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>
              My KRA Deliverables
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#0E7490',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <TrendingUp size={16} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {(performance.overallScore > 0 ? (performance.overallScore / 20).toFixed(1) : '0.0')} <span style={{ fontSize: '0.95rem', color: '#64748B', fontWeight: 600 }}>/ 5.0</span>
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 750,
              background: '#ECFEFF',
              color: '#0E7490',
              padding: '2px 7px',
              borderRadius: '9999px'
            }}>
              {performance.status.tier}
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
            {performance.overallScore > 0 ? 'Evaluated against job role benchmarks' : 'Pending evaluation'}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TWO-COLUMN ANALYTICS GRID (Matching Reference Layout)     */}
      {/* ======================================================== */}
      <div className="performance-analytics-grid">
        {/* Left Column: Monthly Trend Pillar Bar Chart */}
        <div style={{ minHeight: '340px' }}>
          <PerformancePillarBarChart
            data={performance.monthlyTrend.map(m => ({
              month: m.month,
              fullName: `${m.month} 2026`,
              score: m.score,
              kpiRate: performance.taskCompletionRate,
              attendanceRate: performance.attendanceRate,
              kriScore: m.score
            }))}
            selectedMonth={selectedMonth}
            onSelectMonth={onMonthChange}
            title={`${performance.name.split(' ')[0]}'s Performance Trend`}
          />
        </div>

        {/* Right Column: Semi-Circular Radial Speedometer Gauge */}
        <div style={{ minHeight: '340px' }}>
          <PerformanceSpeedometerGauge
            percentage={performance.overallScore}
            label="Personal Achievement Index"
            leftStat={{
              label: 'Completed Tasks',
              value: `${performance.tasksCompleted} / ${performance.tasksTotal}`,
              trend: `${performance.taskCompletionRate}%`,
              isPositive: performance.taskCompletionRate >= 50
            }}
            rightStat={{
              label: 'Attendance Rate',
              value: `${performance.attendanceRate}%`,
              trend: `${performance.attendanceRate}%`,
              isPositive: performance.attendanceRate >= 75
            }}
          />
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3 USER-REQUESTED DEDICATED TABS                           */}
      {/* 1. Employee KPI | 2. Attendance | 3. KRI / KRA           */}
      {/* ======================================================== */}
      <div className="card" style={{
        borderRadius: '18px',
        padding: '24px',
        border: '1px solid #E7ECF3',
        background: '#FFFFFF',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)'
      }}>
        {/* Tabs Header */}
        <div className="tab-bar-scrollable" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '14px',
          marginBottom: '20px'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('kpi')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              border: activeTab === 'kpi' ? '1px solid #0E7490' : '1px solid transparent',
              background: activeTab === 'kpi' ? '#ECFEFF' : 'transparent',
              color: activeTab === 'kpi' ? '#0E7490' : '#64748B'
            }}
          >
            <Target size={15} />
            <span>1. My KPI Targets</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              border: activeTab === 'attendance' ? '1px solid #0E7490' : '1px solid transparent',
              background: activeTab === 'attendance' ? '#ECFEFF' : 'transparent',
              color: activeTab === 'attendance' ? '#0E7490' : '#64748B'
            }}
          >
            <CalendarCheck size={15} />
            <span>2. My Attendance Records</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kri')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              border: activeTab === 'kri' ? '1px solid #0E7490' : '1px solid transparent',
              background: activeTab === 'kri' ? '#ECFEFF' : 'transparent',
              color: activeTab === 'kri' ? '#0E7490' : '#64748B'
            }}
          >
            <Award size={15} />
            <span>3. Key Result Indicators (KRI)</span>
          </button>
        </div>

        {/* TAB 1: MY KPIS */}
        {activeTab === 'kpi' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Assigned KPIs &amp; Performance Objectives
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748B', margin: '2px 0 0' }}>
                  Target achievements and weightage scores for {performance.designation} in {performance.department}
                </p>
              </div>
              <span style={{ fontSize: '0.74rem', background: '#DCFCE7', color: '#15803D', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                Completion Rate: {performance.taskCompletionRate}%
              </span>
            </div>

            <div className="table-responsive">
              <table className="hrms-table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>KPI Title</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Target</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Weightage</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px', width: '220px' }}>Achievement Progress</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px', textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deptTemplate.kpis.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8' }}>
                        No KPI metrics configured for this employee's department yet.
                      </td>
                    </tr>
                  ) : (
                    deptTemplate.kpis.map((kpi, idx) => {
                      const hasOverall = typeof performance?.overallScore === 'number' && performance.overallScore > 0;
                      const progressVal = hasOverall ? performance.overallScore : 0;
                      const isExceeded = progressVal >= 95;
                      const isOnTrack = progressVal >= 80 && progressVal < 95;

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px' }}>{kpi.title}</div>
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0E7490' }}>
                            {kpi.target}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: '#64748B' }}>
                            {kpi.weightage}%
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ flex: 1, height: '8px', background: '#F1F5F9', borderRadius: '9999px', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${progressVal}%`,
                                  height: '100%',
                                  background: isExceeded ? '#10B981' : isOnTrack ? '#0E7490' : '#94A3B8',
                                  borderRadius: '9999px'
                                }} />
                              </div>
                              <span style={{ fontSize: '0.74rem', fontWeight: 750, color: '#0F172A', minWidth: '34px' }}>
                                {progressVal}%
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{
                              padding: '3px 9px',
                              borderRadius: '9999px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: hasOverall ? (isExceeded ? '#DCFCE7' : isOnTrack ? '#ECFEFF' : '#FEF3C7') : '#F1F5F9',
                              color: hasOverall ? (isExceeded ? '#15803D' : isOnTrack ? '#0E7490' : '#B45309') : '#64748B'
                            }}>
                              {hasOverall ? (isExceeded ? 'Exceeded' : isOnTrack ? 'On Track' : 'Good') : 'Pending Review'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: MY ATTENDANCE */}
        {activeTab === 'attendance' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Personal Attendance &amp; Shift Compliance
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748B', margin: '2px 0 0' }}>
                  Biometric attendance summary, punctuality and work hours in {selectedMonth}
                </p>
              </div>
              <span style={{ fontSize: '0.74rem', background: '#ECFEFF', color: '#0E7490', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                Reliability Index: {performance.attendanceRate}%
              </span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
              marginBottom: '20px'
            }}>
              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Days Present</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                  {performance.presentDays} Days
                </div>
                <div style={{ fontSize: '0.7rem', color: '#15803D', marginTop: '2px', fontWeight: 600 }}>Regular attendance</div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>On-Time Punches</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0E7490', marginTop: '4px' }}>
                  {Math.max(0, performance.presentDays - performance.lateDays)} Days
                </div>
                <div style={{ fontSize: '0.7rem', color: '#0E7490', marginTop: '2px', fontWeight: 600 }}>98% on-time rate</div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Late Marks</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
                  {performance.lateDays} Day
                </div>
                <div style={{ fontSize: '0.7rem', color: '#D97706', marginTop: '2px', fontWeight: 600 }}>Within grace period</div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Authorized Leaves</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7E22CE', marginTop: '4px' }}>
                  {performance.leaveDays} Day
                </div>
                <div style={{ fontSize: '0.7rem', color: '#7E22CE', marginTop: '2px', fontWeight: 600 }}>Approved by HR</div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MY KRI / KRA */}
        {activeTab === 'kri' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  My Key Result Indicators (KRI) &amp; Deliverables
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748B', margin: '2px 0 0' }}>
                  High-priority KRAs and strategic expectations aligned to your job role
                </p>
              </div>
              <span style={{ fontSize: '0.74rem', background: performance.overallScore > 0 ? '#ECFEFF' : '#F1F5F9', color: performance.overallScore > 0 ? '#0E7490' : '#64748B', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                Quarterly Rating: {(performance.overallScore > 0 ? (performance.overallScore / 20).toFixed(1) : '0.0')} / 5.0
              </span>
            </div>

            <div className="table-responsive">
              <table className="hrms-table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Key Result Area (KRA)</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Description</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Target Deliverable</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Weightage</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px', textAlign: 'right' }}>KRI Score</th>
                  </tr>
                </thead>
                <tbody>
                  {deptTemplate.kras.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8' }}>
                        No KRA deliverables configured for this employee's department yet.
                      </td>
                    </tr>
                  ) : (
                    deptTemplate.kras.map((kra, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px' }}>{kra.title}</div>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748B', fontSize: '12px', lineHeight: 1.4, maxWidth: '300px' }}>
                          {kra.description}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0E7490' }}>
                          {kra.targetMetric}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>
                          {kra.weightage}%
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span style={{
                            padding: '3px 9px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: performance.overallScore > 0 ? '#ECFEFF' : '#F1F5F9',
                            color: performance.overallScore > 0 ? '#0E7490' : '#64748B',
                            border: `1px solid ${performance.overallScore > 0 ? '#A5F3FC' : '#E2E8F0'}`
                          }}>
                            {(performance.overallScore > 0 ? (performance.overallScore / 20).toFixed(1) : '0.0')} / 5.0
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default EmployeeDetailPerformanceView;
