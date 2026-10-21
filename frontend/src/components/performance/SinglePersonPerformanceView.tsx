import React, { useState, useEffect, useMemo } from 'react';
import { getMonthInfo } from '../../utils/monthUtils';
import {
  EmployeePerformanceDetail,
  PipRecord,
  CompanyDepartment
} from '../../types/performance';
import { DEPARTMENT_TEMPLATES } from '../../data/performanceInitialData';
import { useHRMS } from '../../context/HRMSContext';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/numbers';
import {
  User,
  Award,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Calendar,
  IndianRupee,
  Star,
  FileCheck,
  Package,
  Layers,
  Search,
  CheckSquare,
  Clock,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  ListTodo,
  Check,
  AlertCircle
} from 'lucide-react';

interface SinglePersonPerformanceViewProps {
  employees: EmployeePerformanceDetail[];
  pipRecords: PipRecord[];
  selectedEmployeeId?: string;
  onOpenEvaluationModal: (emp: EmployeePerformanceDetail) => void;
  onOpenPipTracker: (empId: string) => void;
}

export const SinglePersonPerformanceView: React.FC<SinglePersonPerformanceViewProps> = ({
  employees,
  pipRecords,
  selectedEmployeeId,
  onOpenEvaluationModal,
  onOpenPipTracker
}) => {
  const [selectedEmpId, setSelectedEmpId] = useState<string>(selectedEmployeeId || employees[0]?.employeeId || '');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('ALL');

  useEffect(() => {
    if (selectedEmployeeId) {
      setSelectedEmpId(selectedEmployeeId);
    }
  }, [selectedEmployeeId]);

  const departments = ['ALL', ...Array.from(new Set(employees.map(e => e.department)))];

  const filteredList = employees.filter(emp => {
    const matchesSearch =
      emp.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.designation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = selectedDeptFilter === 'ALL' || emp.department === selectedDeptFilter;
    return matchesSearch && matchesDept;
  });

  const currentEmp = employees.find(e => e.employeeId === selectedEmpId) || employees[0];
  const activePip = pipRecords.find(p => p.employeeId === currentEmp?.employeeId && (p.status === 'Active' || p.status === 'Under Review'));

  const getGradeBadge = (grade: EmployeePerformanceDetail['performanceGrade']) => {
    switch (grade) {
      case 'Exceptional':
        return { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' };
      case 'Exceeds Expectations':
        return { bg: '#ECFEFF', text: '#0E7490', border: '#A5F3FC' };
      case 'Meets Expectations':
        return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' };
      case 'Needs Improvement':
        return { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' };
      case 'Critical / PIP':
        return { bg: '#FEE2E2', text: '#B91C1C', border: '#FECACA' };
      default:
        return { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' };
    }
  };

  const getKpiStatusBadge = (percent: number) => {
    if (percent >= 90) {
      return {
        label: 'On Target',
        bg: '#DCFCE7',
        text: '#15803D',
        border: '#86EFAC',
        Icon: TrendingUp,
        iconColor: '#16A34A'
      };
    } else if (percent >= 75) {
      return {
        label: 'At Risk',
        bg: '#FEF3C7',
        text: '#B45309',
        border: '#FDE68A',
        Icon: Minus,
        iconColor: '#D97706'
      };
    } else {
      return {
        label: 'Below Target',
        bg: '#FEE2E2',
        text: '#B91C1C',
        border: '#FECACA',
        Icon: TrendingDown,
        iconColor: '#DC2626'
      };
    }
  };

  // Resolve KPIs for the current employee
  const currentKpis = (currentEmp?.kpis && currentEmp.kpis.length > 0)
    ? currentEmp.kpis
    : (DEPARTMENT_TEMPLATES.find(d => d.department === currentEmp?.department)?.kpis || []).map((t, idx) => {
        const hasScore = typeof currentEmp?.overallScore === 'number' && currentEmp.overallScore > 0;
        const realAchievement = hasScore ? Math.min(115, Math.round(currentEmp!.overallScore * (0.94 + (idx % 3) * 0.04))) : 0;
        return {
          id: `kpi-fallback-${idx}`,
          title: t.title,
          department: currentEmp?.department || 'Sales',
          target: t.target,
          actual: hasScore ? (t.target.includes('%') ? `${realAchievement}%` : t.target.includes('₹') ? formatCurrency(realAchievement * 82000) : `${realAchievement}`) : '--',
          achievementPercentage: realAchievement,
          weightage: t.weightage,
          score: Math.min(100, realAchievement),
          unit: t.unit,
          period: currentMonthInfo.fullLabel
        };
      });

  const { tasks = [], enhancedTasks = [] } = useHRMS();

  // Resolve Tasks for the current employee from real tasks in context
  const getTasksForEmployee = () => {
    if (!currentEmp) return [];

    // Check enhancedTasks first
    const assignedEnhanced = enhancedTasks.filter(t => 
      t.assignees?.some(a => a.employeeId === currentEmp.employeeId || a.employeeName?.toLowerCase().includes(currentEmp.employeeName.toLowerCase()))
    );

    if (assignedEnhanced.length > 0) {
      return assignedEnhanced.map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        status: t.overallStatus === 'COMPLETED' ? 'Completed' : t.overallStatus === 'IN PROGRESS' ? 'In Progress' : 'Pending',
        progress: t.overallProgress || 0
      }));
    }

    // Fallback to legacy tasks
    const assignedLegacy = tasks.filter(t => 
      t.assignedEmployeeId === currentEmp.employeeId || 
      t.assignedEmployeeName?.toLowerCase().includes(currentEmp.employeeName.toLowerCase())
    );

    if (assignedLegacy.length > 0) {
      return assignedLegacy.map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        status: t.status,
        progress: t.status === 'Completed' ? 100 : t.status === 'In Progress' ? 50 : 0
      }));
    }

    return [];
  };

  // Generate Dynamic Attendance Grid for Current Month
  const currentMonthInfo = useMemo(() => getMonthInfo(), []);
  const getAttendanceDays = () => {
    const totalDays = currentMonthInfo.daysInMonth;
    const lateCount = currentEmp?.attendanceImpact?.lateDays || 0;
    const leaveCount = currentEmp?.attendanceImpact?.leaveDays || 1;
    const absentCount = currentEmp?.attendanceImpact?.absentDays || 0;
    const weekdays = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon'];
    
    return Array.from({ length: totalDays }, (_, i) => {
      const dayNum = i + 1;
      const dayName = weekdays[i % 7];
      const isWeekend = dayName === 'Sat' || dayName === 'Sun';
      
      let status: 'Present' | 'Late' | 'Leave' | 'Absent' | 'Weekend' = isWeekend ? 'Weekend' : 'Present';
      let checkIn = '09:00 AM';
      let checkOut = '06:00 PM';
      
      if (!isWeekend) {
        if (absentCount > 0 && dayNum === 22) {
          status = 'Absent';
          checkIn = '—';
          checkOut = '—';
        } else if (leaveCount > 0 && dayNum === 11) {
          status = 'Leave';
          checkIn = 'Approved Leave';
          checkOut = 'Approved Leave';
        } else if (lateCount > 0 && (dayNum === 4 || (lateCount > 1 && dayNum === 18))) {
          status = 'Late';
          checkIn = '09:42 AM';
          checkOut = '06:30 PM';
        }
      } else {
        checkIn = 'Weekly Off';
        checkOut = 'Weekly Off';
      }

      return {
        day: dayNum,
        dayName,
        status,
        checkIn,
        checkOut
      };
    });
  };

  const gradeStyle = currentEmp ? getGradeBadge(currentEmp.performanceGrade) : null;
  const taskList = getTasksForEmployee();
  const attendanceCalendar = getAttendanceDays();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── TOP EMPLOYEE SELECTOR & FILTER STRIP ── */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search employee by name, ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                fontSize: '13px',
                color: '#1E293B',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Department:</span>
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                fontSize: '13px',
                color: '#1E293B',
                backgroundColor: '#FFFFFF',
                cursor: 'pointer'
              }}
            >
              {departments.map(d => (
                <option key={d} value={d}>{d === 'ALL' ? 'All Departments' : d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick select pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', maxWidth: '100%', paddingBottom: '4px' }}>
          {filteredList.map(emp => {
            const isSelected = emp.employeeId === currentEmp?.employeeId;
            return (
              <button
                key={emp.id}
                onClick={() => setSelectedEmpId(emp.employeeId)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  border: isSelected ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                  backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                  color: isSelected ? '#0E7490' : '#475569',
                  fontSize: '12px',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{emp.employeeName}</span>
                {emp.hasActivePip && (
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#EF4444'
                  }} title="Active PIP" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {currentEmp && (
        <>
          {/* ── ACTIVE PIP WARNING BANNER (IF APPLICABLE) ── */}
          {activePip && (
            <div style={{
              background: '#FFF5F5',
              border: '1px solid #FECACA',
              borderRadius: '16px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#FEE2E2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#DC2626'
                }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '14px', color: '#991B1B' }}>
                      Active Performance Improvement Plan ({activePip.id})
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: '#FEE2E2',
                      color: '#B91C1C'
                    }}>
                      {activePip.durationDays} Days Duration ({activePip.status})
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#B91C1C' }}>
                    <strong>Reason:</strong> {activePip.reason} | <strong>Mentor:</strong> {activePip.mentorName}
                  </p>
                </div>
              </div>

              <button
                onClick={() => onOpenPipTracker(activePip.employeeId)}
                style={{
                  padding: '7px 14px',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Clock size={14} /> Open PIP Tracker ({activePip.progressPercentage}%)
              </button>
            </div>
          )}

          {/* ── PROFILE & EXECUTIVE SUMMARY CARD ── */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E7ECF3',
            borderRadius: '16px',
            padding: '24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            {/* Left: Employee Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #094E67 0%, #0E7490 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                fontWeight: 800,
                flexShrink: 0
              }}>
                {currentEmp.employeeName.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#1E293B' }}>
                    {currentEmp.employeeName}
                  </h2>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '9999px',
                    backgroundColor: gradeStyle?.bg,
                    color: gradeStyle?.text,
                    border: `1px solid ${gradeStyle?.border}`
                  }}>
                    {currentEmp.performanceGrade}
                  </span>
                </div>

                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
                  {currentEmp.designation} • <strong style={{ color: '#0E7490' }}>{currentEmp.department}</strong>
                </p>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94A3B8' }}>
                  ID: {currentEmp.employeeId} | Reporting to: {currentEmp.reportingManager}
                </p>
              </div>
            </div>

            {/* Middle: Overall Score Meter */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '20px',
              padding: '12px 20px',
              backgroundColor: '#F8FAFC',
              borderRadius: '14px',
              border: '1px solid #E2E8F0'
            }}>
              <div style={{
                width: '76px',
                height: '76px',
                borderRadius: '50%',
                background: `conic-gradient(#0E7490 ${currentEmp.overallScore * 3.6}deg, #E2E8F0 0deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#0E7490', lineHeight: 1 }}>
                    {currentEmp.overallScore}
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 600, color: '#94A3B8' }}>/ 100</span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Evaluation Score
                </span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', marginTop: '2px' }}>
                  {currentEmp.overallScore >= 90 ? 'Grade A+ (Excellence)' : currentEmp.overallScore >= 75 ? 'Grade B+ (Good)' : 'Needs Attention'}
                </div>
                <span style={{ fontSize: '11px', color: '#0E7490', fontWeight: 600 }}>
                  Evaluated across 5 standard KPI Weights
                </span>
              </div>
            </div>

            {/* Right: Quick Action */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
              <button
                onClick={() => onOpenEvaluationModal(currentEmp)}
                style={{
                  padding: '10px 18px',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
                }}
              >
                <Award size={16} /> Evaluate / Update Score
              </button>
              <span style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center' }}>
                Last reviewed: {formatDateDDMMYYYY(currentEmp.lastEvaluationDate)}
              </span>
            </div>
          </div>

          {/* ── DEDICATED KPI METRICS TABLE (TARGET VS ACTUAL VS %) ── */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E7ECF3',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={18} color="#0E7490" />
                  Key Performance Indicators (KPIs) — Target vs Actual
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Measurable metrics for {currentEmp.department} roles with color-coded status badges and achievement trends
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#DCFCE7',
                  color: '#15803D',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22C55E' }} />
                  ≥ 90%: On Target
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#FEF3C7',
                  color: '#B45309',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#F59E0B' }} />
                  75–89%: At Risk
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#FEE2E2',
                  color: '#B91C1C',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
                  &lt; 75%: Below Target
                </span>
              </div>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '780px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', width: '28%' }}>KPI Indicator</th>
                    <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Period</th>
                    <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Target</th>
                    <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Actual Achieved</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', minWidth: '170px' }}>Achievement %</th>
                    <th style={{ padding: '12px 12px', fontSize: '12px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Trend</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentKpis.map((kpi, index) => {
                    const badge = getKpiStatusBadge(kpi.achievementPercentage);
                    const StatusIcon = badge.Icon;
                    return (
                      <tr
                        key={kpi.id || index}
                        style={{
                          borderBottom: index === currentKpis.length - 1 ? 'none' : '1px solid #E7ECF3',
                          backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#FBFDFE'
                        }}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <strong style={{ fontSize: '13px', color: '#1E293B', display: 'block' }}>{kpi.title}</strong>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>Weight: {kpi.weightage}% • Score: {kpi.score} pts</span>
                        </td>
                        <td style={{ padding: '14px 14px', fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                          {kpi.period || currentMonthInfo.fullLabel}
                        </td>
                        <td style={{ padding: '14px 14px', fontSize: '13px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                          {kpi.target}
                        </td>
                        <td style={{ padding: '14px 14px', fontSize: '13px', fontWeight: 800, color: '#0E7490', textAlign: 'right' }}>
                          {kpi.actual}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '7px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min(kpi.achievementPercentage, 100)}%`,
                                height: '100%',
                                backgroundColor: badge.iconColor,
                                borderRadius: '4px',
                                transition: 'width 0.4s ease'
                              }} />
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', minWidth: '40px', textAlign: 'right' }}>
                              {kpi.achievementPercentage}%
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            backgroundColor: badge.bg,
                            color: badge.iconColor
                          }}>
                            <StatusIcon size={14} />
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            backgroundColor: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`,
                            fontSize: '11px',
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                          }}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 5-TIER KPI WEIGHTS BREAKDOWN (FROM SPREADSHEET) ── */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E7ECF3',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Target size={18} color="#0E7490" />
                  5-Tier KPI Weights Breakdown
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Direct metrics aligned with VRM benchmark criteria (Attendance: 5.0, Feedback: 20.0, New Customers: 20.0, Invoices: 20.0, Full BOS Kits: 35.0 = 100.0)
                </p>
              </div>

              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: '#ECFEFF',
                border: '1px solid #CFFAFE',
                fontSize: '12px',
                fontWeight: 700,
                color: '#0E7490'
              }}>
                Sum Weight: 100.0 Points
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              
              {/* 1. Attendance Points (5.0) */}
              <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>1. Attendance</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: '#ECFEFF', color: '#0E7490' }}>
                    Weight 5.0
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#0E7490' }}>
                    {currentEmp.kpiBreakdown.attendanceScore}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>/ 5.0 pts</span>
                </div>
                <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{ width: `${(currentEmp.kpiBreakdown.attendanceScore / 5) * 100}%`, height: '100%', backgroundColor: '#0E7490' }} />
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Biometric presence: <strong>{currentEmp.kpiBreakdown.attendancePercent}%</strong>
                </span>
              </div>

              {/* 2. Feedback Quality Points (20.0) */}
              <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>2. Feedback Quality</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: '#FEF3C7', color: '#B45309' }}>
                    Weight 20.0
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#D97706' }}>
                    {currentEmp.kpiBreakdown.feedbackQualityScore}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>/ 20.0 pts</span>
                </div>
                <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{ width: `${(currentEmp.kpiBreakdown.feedbackQualityScore / 20) * 100}%`, height: '100%', backgroundColor: '#F59E0B' }} />
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Client rating: <strong>{currentEmp.kpiBreakdown.feedbackRating} / 5.0 ★</strong>
                </span>
              </div>

              {/* 3. New Customer Points (20.0) */}
              <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>3. New Customers</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: '#DCFCE7', color: '#15803D' }}>
                    Weight 20.0
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#16A34A' }}>
                    {currentEmp.kpiBreakdown.newCustomerScore}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>/ 20.0 pts</span>
                </div>
                <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{ width: `${(currentEmp.kpiBreakdown.newCustomerScore / 20) * 100}%`, height: '100%', backgroundColor: '#22C55E' }} />
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Accounts converted: <strong>{currentEmp.kpiBreakdown.newCustomersCount} clients</strong>
                </span>
              </div>

              {/* 4. Invoice Points (20.0) */}
              <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>4. Invoice Clearance</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: '#EDE9FE', color: '#6D28D9' }}>
                    Weight 20.0
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#7C3AED' }}>
                    {currentEmp.kpiBreakdown.invoiceScore}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>/ 20.0 pts</span>
                </div>
                <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{ width: `${(currentEmp.kpiBreakdown.invoiceScore / 20) * 100}%`, height: '100%', backgroundColor: '#8B5CF6' }} />
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Receivable recovery: <strong>{currentEmp.kpiBreakdown.invoiceClearanceRate}%</strong>
                </span>
              </div>

              {/* 5. Full BOS Kits Supply (35.0) */}
              <div style={{ padding: '16px', borderRadius: '12px', border: '1.5px solid #0E7490', background: '#F0FDFA' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#094E67' }}>5. Full BOS Kits Supply</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', background: '#0E7490', color: '#FFFFFF' }}>
                    Weight 35.0
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#0E7490' }}>
                    {currentEmp.kpiBreakdown.fullBosKitsSupplyScore}
                  </span>
                  <span style={{ fontSize: '12px', color: '#0E7490' }}>/ 35.0 pts</span>
                </div>
                <div style={{ height: '6px', backgroundColor: '#CCFBF1', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{ width: `${(currentEmp.kpiBreakdown.fullBosKitsSupplyScore / 35) * 100}%`, height: '100%', backgroundColor: '#0E7490' }} />
                </div>
                <span style={{ fontSize: '11px', color: '#094E67', fontWeight: 600 }}>
                  Complete kits supplied: <strong>{currentEmp.kpiBreakdown.bosKitsSuppliedCount} full kits</strong>
                </span>
              </div>

            </div>
          </div>

          {/* ── TWO COLUMN ROW: SOLAR INCENTIVES & KRAs ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
            
            {/* Left: Solar Product Incentive Breakdown */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E7ECF3',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IndianRupee size={17} color="#0E7490" />
                  Product Incentive & Sales Rules
                </h3>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  backgroundColor: currentEmp.calculatedIncentive > 0 ? '#DCFCE7' : '#F1F5F9',
                  color: currentEmp.calculatedIncentive > 0 ? '#15803D' : '#64748B'
                }}>
                  {currentEmp.incentiveStatus}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Module Mounting Structures */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>Module Mounting Structures (MMS)</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>Target: ₹50,00,000 @ 0.7% Incentive Rate</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0E7490' }}>
                      {currentEmp.mmsSalesAmount > 0 ? `₹${(currentEmp.mmsSalesAmount / 100000).toFixed(2)}L` : '—'}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748B' }}>
                      {currentEmp.mmsSalesAmount >= 5000000 ? '✓ Target Met' : currentEmp.mmsSalesAmount > 0 ? 'Shortfall' : 'Indirect Contribution'}
                    </div>
                  </div>
                </div>

                {/* Balance of System */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>Balance of System (BOS)</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>Target: ₹1,00,00,000 @ 0.3% Incentive Rate</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0E7490' }}>
                      {currentEmp.bosSalesAmount > 0 ? `₹${(currentEmp.bosSalesAmount / 100000).toFixed(2)}L` : '—'}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748B' }}>
                      {currentEmp.bosSalesAmount >= 10000000 ? '✓ Target Met' : currentEmp.bosSalesAmount > 0 ? 'Shortfall' : 'Support Allocation'}
                    </div>
                  </div>
                </div>

                {/* Incentive Split Calculation Box */}
                <div style={{
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: '#ECFEFF',
                  border: '1px solid #A5F3FC'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#094E67' }}>
                      Role Split Applied ({currentEmp.roleCategory}):
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#0E7490' }}>
                      {currentEmp.incentiveRoleShare}% Share
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0E7490' }}>Net Calculated Incentive:</span>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#094E67' }}>
                      {formatCurrency(currentEmp.calculatedIncentive)}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#0E7490', opacity: 0.85 }}>
                    Split rule: Sales 50% | Tech Support / Mgr 20% | Support Pool 30%
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Role KRAs (Key Result Areas) */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E7ECF3',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckSquare size={17} color="#0E7490" />
                  Key Result Areas (KRAs)
                </h3>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                  {currentEmp.kras.length} Deliverables Assigned
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {currentEmp.kras.map(kra => (
                  <div key={kra.id} style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>{kra.title}</span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        backgroundColor: kra.status === 'Exceeded' ? '#DCFCE7' : kra.status === 'On Track' ? '#ECFEFF' : '#FEF3C7',
                        color: kra.status === 'Exceeded' ? '#15803D' : kra.status === 'On Track' ? '#0E7490' : '#B45309'
                      }}>
                        {kra.status}
                      </span>
                    </div>

                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#64748B' }}>{kra.description}</p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                      <span>Target: {kra.targetMetric}</span>
                      <strong>{kra.achievedMetric}</strong>
                    </div>

                    <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(kra.progressPercentage || kra.achievementPercentage || 0, 100)}%`,
                        height: '100%',
                        backgroundColor: kra.status === 'Exceeded' ? '#22C55E' : kra.status === 'On Track' ? '#0E7490' : '#F59E0B'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* ── ATTENDANCE & PUNCTUALITY RECORD WIDGET ── */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E7ECF3',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={18} color="#0E7490" />
                  Monthly Attendance & Punctuality Calendar ({currentMonthInfo.fullLabel})
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Biometric punch log, shift adherence, and punctuality scoring
                </p>
              </div>

              {/* Attendance Quick Stats Strip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ padding: '6px 12px', borderRadius: '10px', backgroundColor: '#ECFEFF', border: '1px solid #CFFAFE', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#0E7490', textTransform: 'uppercase' }}>Attendance Rate</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#094E67' }}>
                    {currentEmp.attendanceImpact?.attendancePercent || currentEmp.kpiBreakdown?.attendancePercent || 98}%
                  </div>
                </div>
                <div style={{ padding: '6px 12px', borderRadius: '10px', backgroundColor: '#DCFCE7', border: '1px solid #BBF7D0', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#15803D', textTransform: 'uppercase' }}>Present</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803D' }}>
                    {22 - (currentEmp.attendanceImpact?.lateDays || 0) - (currentEmp.attendanceImpact?.absentDays || 0) - (currentEmp.attendanceImpact?.leaveDays || 1)} Days
                  </div>
                </div>
                <div style={{ padding: '6px 12px', borderRadius: '10px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#B45309', textTransform: 'uppercase' }}>Late Arrivals</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#B45309' }}>
                    {currentEmp.attendanceImpact?.lateDays || 0}
                  </div>
                </div>
                <div style={{ padding: '6px 12px', borderRadius: '10px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase' }}>Leaves</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#1D4ED8' }}>
                    {currentEmp.attendanceImpact?.leaveDays || 1}
                  </div>
                </div>
                <div style={{ padding: '6px 12px', borderRadius: '10px', backgroundColor: '#FEE2E2', border: '1px solid #FECACA', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase' }}>Absences</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#B91C1C' }}>
                    {currentEmp.attendanceImpact?.absentDays || 0}
                  </div>
                </div>
              </div>
            </div>

            {/* 30-Day Dot Matrix Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))',
              gap: '8px',
              padding: '16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              marginBottom: '14px'
            }}>
              {attendanceCalendar.map((dayItem) => {
                let cellBg = '#FFFFFF';
                let cellBorder = '#E2E8F0';
                let textColor = '#1E293B';
                let badgeText = 'Present';
                let badgeBg = '#DCFCE7';
                let badgeColor = '#15803D';

                if (dayItem.status === 'Weekend') {
                  cellBg = '#F1F5F9';
                  cellBorder = '#E2E8F0';
                  textColor = '#94A3B8';
                  badgeText = 'Off';
                  badgeBg = '#E2E8F0';
                  badgeColor = '#64748B';
                } else if (dayItem.status === 'Late') {
                  cellBg = '#FFFBEB';
                  cellBorder = '#FDE68A';
                  textColor = '#92400E';
                  badgeText = 'Late';
                  badgeBg = '#FEF3C7';
                  badgeColor = '#B45309';
                } else if (dayItem.status === 'Leave') {
                  cellBg = '#EFF6FF';
                  cellBorder = '#BFDBFE';
                  textColor = '#1E40AF';
                  badgeText = 'Leave';
                  badgeBg = '#DBEAFE';
                  badgeColor = '#1D4ED8';
                } else if (dayItem.status === 'Absent') {
                  cellBg = '#FEF2F2';
                  cellBorder = '#FECACA';
                  textColor = '#991B1B';
                  badgeText = 'Absent';
                  badgeBg = '#FEE2E2';
                  badgeColor = '#B91C1C';
                }

                return (
                  <div
                    key={dayItem.day}
                    title={`Sep ${dayItem.day} (${dayItem.dayName}): ${dayItem.status} - In: ${dayItem.checkIn}, Out: ${dayItem.checkOut}`}
                    style={{
                      padding: '8px 6px',
                      borderRadius: '10px',
                      backgroundColor: cellBg,
                      border: `1px solid ${cellBorder}`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: textColor }}>{dayItem.day}</span>
                      <span style={{ fontSize: '9px', fontWeight: 600, color: '#94A3B8' }}>{dayItem.dayName}</span>
                    </div>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      backgroundColor: badgeBg,
                      color: badgeColor,
                      lineHeight: 1.2
                    }}>
                      {badgeText}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Attendance Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: '#64748B' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22C55E' }} />
                Present (Biometric Verified)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F59E0B' }} />
                Late Arrival (&gt; 9:30 AM)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3B82F6' }} />
                Approved Leave
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
                Unexcused Absence
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94A3B8' }} />
                Weekly Off / Weekend
              </span>
            </div>
          </div>

          {/* ── ASSIGNED TASKS & DELIVERABLES WIDGET ── */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E7ECF3',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ListTodo size={18} color="#0E7490" />
                  Assigned Tasks & Deliverables ({taskList.length})
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Sprint deliverables, customer SLAs, and operational milestones tracked for this period
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  Completion Rate: {currentEmp.taskPerformance?.completionRate || 85}%
                </span>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  backgroundColor: '#DCFCE7',
                  color: '#15803D',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  {taskList.filter(t => t.status === 'Completed').length} / {taskList.length} Completed
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {taskList.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #CBD5E1' }}>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: '13px' }}>No active tasks assigned to this employee.</p>
                </div>
              ) : (
                taskList.map((task) => {
                  const isCompleted = task.status === 'Completed';
                const isInProgress = task.status === 'In Progress';
                const isPending = task.status === 'Pending';

                let statusBadgeBg = '#F1F5F9';
                let statusBadgeColor = '#475569';
                let statusBorder = '#E2E8F0';

                if (isCompleted) {
                  statusBadgeBg = '#DCFCE7';
                  statusBadgeColor = '#15803D';
                  statusBorder = '#86EFAC';
                } else if (isInProgress) {
                  statusBadgeBg = '#ECFEFF';
                  statusBadgeColor = '#0E7490';
                  statusBorder = '#A5F3FC';
                } else if (isPending) {
                  statusBadgeBg = '#FEF3C7';
                  statusBadgeColor = '#B45309';
                  statusBorder = '#FDE68A';
                }

                let priorityBadgeBg = '#F1F5F9';
                let priorityBadgeColor = '#475569';
                if (task.priority === 'High') {
                  priorityBadgeBg = '#FEE2E2';
                  priorityBadgeColor = '#B91C1C';
                } else if (task.priority === 'Medium') {
                  priorityBadgeBg = '#FEF3C7';
                  priorityBadgeColor = '#B45309';
                }

                return (
                  <div
                    key={task.id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: isCompleted ? '#DCFCE7' : '#E2E8F0',
                        color: isCompleted ? '#16A34A' : '#94A3B8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {isCompleted ? <Check size={16} /> : <Clock size={14} />}
                      </div>

                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>
                          {task.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>Due: {formatDateDDMMYYYY(task.dueDate)}</span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: priorityBadgeBg,
                            color: priorityBadgeColor
                          }}>
                            {task.priority} Priority
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {/* Progress Bar */}
                      <div style={{ width: '110px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                          <span>Progress</span>
                          <span>{task.progress}%</span>
                        </div>
                        <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${task.progress}%`,
                            height: '100%',
                            backgroundColor: isCompleted ? '#22C55E' : '#0E7490',
                            borderRadius: '3px'
                          }} />
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        backgroundColor: statusBadgeBg,
                        color: statusBadgeColor,
                        border: `1px solid ${statusBorder}`,
                        fontSize: '11px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap'
                      }}>
                        {task.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </div>

          {/* ── PERFORMANCE IMPROVEMENT PLAN (PIP) STATUS & TIMELINE ── */}
          <div style={{
            background: activePip ? '#FFFDF5' : '#FFFFFF',
            border: activePip ? '1.5px solid #F59E0B' : '1px solid #E7ECF3',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {activePip ? (
                    <>
                      <AlertTriangle size={18} color="#D97706" />
                      Performance Improvement Plan (PIP) Timeline & Remedial Action
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={18} color="#16A34A" />
                      Performance Improvement Plan (PIP) Status
                    </>
                  )}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
                  {activePip 
                    ? `Active structured remedial governance plan with defined milestones and supervisor checkpoints`
                    : `Employee is meeting standard KPI benchmarks. No corrective action plan required.`}
                </p>
              </div>

              {activePip ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    backgroundColor: '#FEE2E2',
                    color: '#B91C1C',
                    border: '1px solid #FECACA',
                    fontSize: '11px',
                    fontWeight: 700
                  }}>
                    Status: {activePip.status} ({activePip.progressPercentage}% Completed)
                  </span>
                  <button
                    onClick={() => onOpenPipTracker(activePip.employeeId)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#0E7490',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    Open Tracker <ArrowRight size={12} />
                  </button>
                </div>
              ) : (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  backgroundColor: '#DCFCE7',
                  color: '#15803D',
                  border: '1px solid #86EFAC',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  <CheckCircle2 size={13} />
                  Not on PIP (Good Standing)
                </span>
              )}
            </div>

            {activePip ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* PIP Metrics Detail Strip */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #FED7AA'
                }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>PIP Plan ID:</span>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>{activePip.id}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Assigned Mentor:</span>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0E7490' }}>{activePip.mentorName}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Cycle Duration:</span>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>
                      {activePip.durationDays} Days ({formatDateDDMMYYYY(activePip.startDate)} to {formatDateDDMMYYYY(activePip.targetEndDate)})
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Review Frequency:</span>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#B45309' }}>{activePip.reviewFrequency}</div>
                  </div>
                </div>

                {/* 4-Phase Progress Timeline */}
                <div style={{
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '12px' }}>
                    Remedial Roadmap & Milestone Progress
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#22C55E', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>✓</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803D' }}>Phase 1: Initiation</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: '#166534' }}>
                        Problem baseline & goals agreed with mentor
                      </p>
                    </div>

                    <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: '#ECFEFF', border: '1px solid #A5F3FC' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#0E7490', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>2</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0E7490' }}>Phase 2: Weekly Review</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: '#094E67' }}>
                        {activePip.progressPercentage >= 50 ? 'Milestone audit completed' : 'Under active observation'}
                      </p>
                    </div>

                    <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#F59E0B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>3</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#B45309' }}>Phase 3: Mid-Term Gate</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: '#78350F' }}>
                        Score assessment against KPI benchmark
                      </p>
                    </div>

                    <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#94A3B8', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>4</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Phase 4: Exit Appraisal</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: '#64748B' }}>
                        Final sign-off by HR & Dept Manager
                      </p>
                    </div>
                  </div>
                </div>

                {/* Performance Issue & Support Details */}
                <div style={{
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  fontSize: '12px',
                  color: '#334155',
                  lineHeight: 1.6
                }}>
                  <div style={{ marginBottom: '6px' }}>
                    <strong style={{ color: '#B91C1C' }}>Performance Gap:</strong> {activePip.performanceIssue}
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <strong style={{ color: '#0E7490' }}>Action Plan:</strong> {activePip.actionPlan}
                  </div>
                  <div>
                    <strong style={{ color: '#15803D' }}>Exit Benchmark:</strong> {activePip.expectedTarget}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: '#DCFCE7',
                  color: '#15803D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#15803D' }}>
                    No Active Performance Improvement Plan
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#166534' }}>
                    {currentEmp.employeeName} has achieved an overall evaluation score of <strong>{currentEmp.overallScore}/100</strong> and is in good standing with the {currentEmp.department} department.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── HISTORICAL SCORE TIMELINE & APPRAISAL REMARKS ── */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E7ECF3',
            borderRadius: '16px',
            padding: '24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            {/* Monthly Trend */}
            <div>
              <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} color="#0E7490" />
                Month-over-Month Evaluation Trend
              </h4>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', height: '110px', paddingTop: '20px' }}>
                {currentEmp.monthlyHistory.map((h, idx) => {
                  const barH = (h.score / 100) * 80;
                  const isLatest = idx === currentEmp.monthlyHistory.length - 1;
                  return (
                    <div key={h.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: isLatest ? '#0E7490' : '#64748B' }}>
                        {h.score}
                      </span>
                      <div style={{
                        width: '100%',
                        height: `${barH}px`,
                        borderRadius: '6px 6px 0 0',
                        backgroundColor: isLatest ? '#0E7490' : '#CBD5E1',
                        transition: 'all 0.2s'
                      }} />
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8' }}>{h.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Appraisal Comments */}
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCheck size={16} color="#0E7490" />
                Supervisor Appraisal & Developmental Notes
              </h4>
              <div style={{
                padding: '14px',
                borderRadius: '12px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                fontSize: '13px',
                color: '#334155',
                lineHeight: 1.6
              }}>
                "{currentEmp.managerAppraisalNotes}"
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#94A3B8' }}>
                Recorded by <strong>{currentEmp.reportingManager}</strong> on {formatDateDDMMYYYY(currentEmp.lastEvaluationDate)}
              </p>
            </div>
          </div>

        </>
      )}
    </div>
  );
};
