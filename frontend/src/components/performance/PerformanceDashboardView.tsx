import React, { useState, useMemo } from 'react';
import { 
  ComputedEmployeePerformance, 
  CompanyPerformanceSummary 
} from './performanceEngine';
import { getMonthInfo } from '../../utils/monthUtils';
import { PerformancePillarBarChart } from './charts/PerformancePillarBarChart';
import { PerformanceSpeedometerGauge } from './charts/PerformanceSpeedometerGauge';
import { DEPARTMENT_TEMPLATES } from '../../data/performanceInitialData';
import { 
  Award, 
  CalendarCheck, 
  CheckCircle2, 
  TrendingUp, 
  Users, 
  Eye, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Download,
  Filter,
  Target,
  Clock,
  Briefcase,
  Layers,
  ChevronDown
} from 'lucide-react';

interface Props {
  companySummary: CompanyPerformanceSummary;
  employeeProfiles: ComputedEmployeePerformance[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  selectedDepartment: string;
  onDepartmentChange: (dept: string) => void;
  selectedEmployeeId: string;
  onEmployeeChange: (empId: string) => void;
  onViewEmployeeDetail: (empId: string) => void;
}

export const PerformanceDashboardView: React.FC<Props> = ({
  companySummary,
  employeeProfiles,
  selectedMonth,
  onMonthChange,
  selectedDepartment,
  onDepartmentChange,
  selectedEmployeeId,
  onEmployeeChange,
  onViewEmployeeDetail
}) => {
  // Sub-tabs: 1. Employee KPI, 2. Attendance, 3. KRI / KRA, 4. Team Leaderboard
  const [activeSubTab, setActiveSubTab] = useState<'kpi' | 'attendance' | 'kri' | 'leaderboard'>('kpi');

  const monthOptions = useMemo(() => {
    const cur = getMonthInfo();
    const opts: { label: string; value: string }[] = [];
    opts.push({ label: `This Month (${cur.label})`, value: cur.fullLabel });

    for (let i = 1; i <= 3; i++) {
      const prevDate = new Date(cur.year, cur.monthIndex - i, 1);
      const prevInfo = getMonthInfo(prevDate);
      opts.push({ label: prevInfo.fullLabel, value: prevInfo.fullLabel });
    }

    const quarter = Math.floor(cur.monthIndex / 3) + 1;
    opts.push({ label: `Q${quarter} ${cur.year}`, value: `Q${quarter} ${cur.year}` });
    return opts;
  }, []);
  
  // Table search & pagination state (strict [5, 10] per design system)
  const [tableSearch, setTableSearch] = useState('');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [goToPageInput, setGoToPageInput] = useState<string>('');

  // Department options strictly from user-configured departments in companySummary
  const departmentOptions = useMemo(() => {
    const depts = companySummary.departmentPerformances.map(d => d.department);
    return ['ALL', ...depts];
  }, [companySummary.departmentPerformances]);

  // Filtered employees for table
  const filteredEmployees = useMemo(() => {
    return employeeProfiles.filter(emp => {
      // Department filter
      if (selectedDepartment !== 'ALL' && emp.department.toLowerCase() !== selectedDepartment.toLowerCase()) {
        return false;
      }
      // Employee filter (from top bar if selected)
      if (selectedEmployeeId !== 'ALL' && emp.employeeId !== selectedEmployeeId) {
        return false;
      }
      // Search
      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase().trim();
        const matchName = emp.name.toLowerCase().includes(q);
        const matchId = emp.employeeId.toLowerCase().includes(q);
        const matchDept = emp.department.toLowerCase().includes(q);
        const matchDesig = emp.designation.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchDept && !matchDesig) return false;
      }
      return true;
    });
  }, [employeeProfiles, selectedDepartment, selectedEmployeeId, tableSearch]);

  // Pagination logic
  const totalEntries = filteredEmployees.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedEmployees = filteredEmployees.slice(startIndex, startIndex + pageSize);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleGoToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(goToPageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      setCurrentPage(p);
      setGoToPageInput('');
    }
  };

  // Get department KPI/KRI data (dynamic fallback for custom user departments)
  const currentDeptTemplate = useMemo(() => {
    const targetDept = selectedDepartment === 'ALL'
      ? (companySummary.departmentPerformances[0]?.department || 'General')
      : selectedDepartment;
    const found = DEPARTMENT_TEMPLATES.find(d => d.department.toLowerCase() === targetDept.toLowerCase());
    if (found) return found;

    return {
      department: targetDept,
      kpis: [
        { title: `${targetDept} Delivery Milestones`, target: '100% on-time', weightage: 35 },
        { title: 'Quality & Process Compliance', target: '98% SLA', weightage: 30 },
        { title: 'Attendance & Shift Regularity', target: '95% attendance', weightage: 20 },
        { title: 'Cross-functional Collaboration', target: 'Zero escalation', weightage: 15 }
      ],
      kras: [
        { title: `${targetDept} Operational Excellence`, description: `Execute core functional deliverables for ${targetDept}`, targetMetric: 'Quarterly target', weightage: 40 },
        { title: 'Punctuality & Shift Regularity', description: 'Maintain attendance integrity and on-time punch records', targetMetric: '95% attendance', weightage: 30 },
        { title: 'Team Impact & Productivity', description: 'Deliver assigned task milestones within defined schedule', targetMetric: 'Zero SLA breach', weightage: 30 }
      ]
    };
  }, [selectedDepartment, companySummary.departmentPerformances]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ======================================================== */}
      {/* TOP HEADER SECTION (Matching Reference Image)            */}
      {/* ======================================================== */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: '#0F172A',
            letterSpacing: '-0.02em',
            margin: 0
          }}>
            Performance Overview
          </h1>
          <p style={{
            fontSize: '0.84rem',
            color: '#64748B',
            fontWeight: 500,
            margin: '3px 0 0'
          }}>
            Your current employee KPI, attendance summary and KRI activity
          </p>
        </div>

        {/* Action Controls Right: Period Selector, Export & Filters */}
        <div className="performance-header-controls">
          {/* Time Selector Dropdown */}
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

          {/* Export Button */}
          <button
            type="button"
            onClick={() => alert(`Exporting Performance & KPI Report for ${selectedMonth}...`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#334155',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
            onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
          >
            <Download size={15} />
            <span>Export</span>
          </button>

          {/* Department Filter Selector */}
          <select
            value={selectedDepartment}
            onChange={e => {
              onDepartmentChange(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: '8px 14px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              fontSize: '0.84rem',
              fontWeight: 600,
              color: '#334155',
              background: '#FFFFFF',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            <option value="ALL">All Departments</option>
            {departmentOptions.filter(d => d !== 'ALL').map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Quick Employee Selector Dropdown */}
          <select
            value={selectedEmployeeId}
            onChange={e => {
              const val = e.target.value;
              onEmployeeChange(val);
              if (val !== 'ALL') {
                onViewEmployeeDetail(val);
              }
            }}
            style={{
              padding: '8px 14px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              fontSize: '0.84rem',
              fontWeight: 600,
              color: '#334155',
              background: '#FFFFFF',
              outline: 'none',
              cursor: 'pointer',
              maxWidth: '180px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            <option value="ALL">All Employees</option>
            {employeeProfiles.map(emp => (
              <option key={emp.employeeId} value={emp.employeeId}>
                {emp.name} ({emp.employeeId})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4 HERO KPI CARDS (Compact Sizing)                        */}
      {/* ======================================================== */}
      <div className="performance-hero-cards-grid">
        {/* CARD 1: PRIMARY TEAL HERO CARD (Matching Blue Hero Card in Image) */}
        <div style={{
          background: 'linear-gradient(135deg, #0E7490 0%, #0891B2 100%)',
          borderRadius: '14px',
          padding: '14px 18px',
          color: '#FFFFFF',
          boxShadow: '0 6px 18px -4px rgba(14, 116, 144, 0.25), 0 2px 6px -2px rgba(14, 116, 144, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Top Row: Title & Circular White Icon Pill */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#E0F2FE' }}>
              Overall KRI Score
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

          {/* Big Number & Trend Badge */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
              {companySummary.overallScore}%
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
              {companySummary.activeEmployeeCount > 0 ? (companySummary.overallScore >= 80 ? 'Grade A+' : companySummary.overallScore >= 70 ? 'Grade B' : companySummary.overallScore > 0 ? 'Grade C' : 'Pending Data') : 'No Staff'}
            </span>
          </div>

          {/* Footer Meta */}
          <div style={{ fontSize: '0.72rem', color: '#CFFAFE', fontWeight: 500 }}>
            {companySummary.activeEmployeeCount} active employee{companySummary.activeEmployeeCount === 1 ? '' : 's'} • {companySummary.overallScore > 0 ? 'Live evaluated' : 'No records yet'}
          </div>
        </div>

        {/* CARD 2: EMPLOYEE KPI TARGET (White Card with Dark Pill) */}
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
              Employee Tasks Met
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
              {companySummary.taskBreakdown.completed}
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 750,
              background: '#EFF6FF',
              color: '#2563EB',
              padding: '2px 7px',
              borderRadius: '9999px'
            }}>
              {companySummary.taskBreakdown.completionPercent}%
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
            {companySummary.taskBreakdown.totalTasks} total tasks • {companySummary.taskBreakdown.pending} pending
          </div>
        </div>

        {/* CARD 3: ATTENDANCE & PUNCTUALITY (White Card with Blue Pill) */}
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
              Attendance Rate
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
              {companySummary.averageAttendance}%
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 750,
              background: '#DCFCE7',
              color: '#15803D',
              padding: '2px 7px',
              borderRadius: '9999px'
            }}>
              {companySummary.attendanceBreakdown.presentPercent}% Present
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
            {companySummary.attendanceBreakdown.totalLogs} check-in logs • {companySummary.attendanceBreakdown.latePercent}% late
          </div>
        </div>

        {/* CARD 4: KRA / KRI RATING (White Card with Teal Circular Pill) */}
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
              KRI / KRA Rating
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
              {(companySummary.overallScore > 0 ? (companySummary.overallScore / 20).toFixed(1) : '0.0')} <span style={{ fontSize: '0.95rem', color: '#64748B', fontWeight: 600 }}>/ 5.0</span>
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 750,
              background: '#ECFEFF',
              color: '#0E7490',
              padding: '2px 7px',
              borderRadius: '9999px'
            }}>
              {companySummary.overallScore >= 90 ? 'Top Tier' : companySummary.overallScore >= 80 ? 'Good' : companySummary.overallScore >= 70 ? 'Average' : companySummary.overallScore > 0 ? 'Needs Attention' : 'Pending Data'}
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
            Evaluated across {companySummary.activeEmployeeCount} team members
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TWO-COLUMN ANALYTICS GRID (Matching Reference Layout)     */}
      {/* ======================================================== */}
      <div className="performance-analytics-grid">
        {/* Left Column: Rounded Pillar Bar Chart with Tooltip */}
        <div style={{ minHeight: '340px' }}>
          <PerformancePillarBarChart
            data={companySummary.monthlyTrend}
            selectedMonth={selectedMonth}
            onSelectMonth={onMonthChange}
            title="Performance Overview"
          />
        </div>

        {/* Right Column: Semi-Circular Radial Speedometer Gauge */}
        <div style={{ minHeight: '340px' }}>
          <PerformanceSpeedometerGauge
            percentage={companySummary.overallScore}
            label="Goal & KRI Achievement"
            leftStat={{
              label: 'Completed Tasks',
              value: `${companySummary.taskBreakdown.completed} / ${companySummary.taskBreakdown.totalTasks}`,
              trend: `${companySummary.taskBreakdown.completionPercent}%`,
              isPositive: companySummary.taskBreakdown.completionPercent >= 50
            }}
            rightStat={{
              label: 'Attendance Score',
              value: `${companySummary.averageAttendance}%`,
              trend: `${companySummary.attendanceBreakdown.presentPercent}%`,
              isPositive: companySummary.averageAttendance >= 75
            }}
          />
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3 USER-REQUESTED DEDICATED SECTIONS / TABS               */}
      {/* 1. Employee KPI | 2. Attendance | 3. KRI | 4. Roster     */}
      {/* ======================================================== */}
      <div className="card" style={{
        borderRadius: '18px',
        padding: '24px',
        border: '1px solid #E7ECF3',
        background: '#FFFFFF',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)'
      }}>
        {/* Navigation Tabs Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '14px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveSubTab('kpi')}
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
                border: activeSubTab === 'kpi' ? '1px solid #0E7490' : '1px solid transparent',
                background: activeSubTab === 'kpi' ? '#ECFEFF' : 'transparent',
                color: activeSubTab === 'kpi' ? '#0E7490' : '#64748B'
              }}
            >
              <Target size={15} />
              <span>1. Employee KPI</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('attendance')}
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
                border: activeSubTab === 'attendance' ? '1px solid #0E7490' : '1px solid transparent',
                background: activeSubTab === 'attendance' ? '#ECFEFF' : 'transparent',
                color: activeSubTab === 'attendance' ? '#0E7490' : '#64748B'
              }}
            >
              <CalendarCheck size={15} />
              <span>2. Attendance</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('kri')}
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
                border: activeSubTab === 'kri' ? '1px solid #0E7490' : '1px solid transparent',
                background: activeSubTab === 'kri' ? '#ECFEFF' : 'transparent',
                color: activeSubTab === 'kri' ? '#0E7490' : '#64748B'
              }}
            >
              <Award size={15} />
              <span>3. Key Result Indicators (KRI)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('leaderboard')}
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
                border: activeSubTab === 'leaderboard' ? '1px solid #0E7490' : '1px solid transparent',
                background: activeSubTab === 'leaderboard' ? '#ECFEFF' : 'transparent',
                color: activeSubTab === 'leaderboard' ? '#0E7490' : '#64748B'
              }}
            >
              <Users size={15} />
              <span>Team Leaderboard</span>
            </button>
          </div>

          <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
            Showing: <strong style={{ color: '#0E7490' }}>{selectedDepartment === 'ALL' ? 'Company All Departments' : selectedDepartment}</strong>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SUBTAB 1: EMPLOYEE KPI SECTION                           */}
        {/* ======================================================== */}
        {activeSubTab === 'kpi' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Active Key Performance Indicators (KPIs)
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748B', margin: '2px 0 0' }}>
                  Core operational and functional KPI targets tracked against real delivery benchmarks
                </p>
              </div>
              <span style={{ fontSize: '0.74rem', background: '#F1F5F9', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, color: '#475569' }}>
                Weightage Model: Standard 100%
              </span>
            </div>

            <div className="table-responsive">
              <table className="hrms-table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>KPI Title</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Department</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Target</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Weightage</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px', width: '220px' }}>Achievement Progress</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px', textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {companySummary.activeEmployeeCount === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B' }}>
                        No active employees found. Add employees in Employee Directory to track KPI progression.
                      </td>
                    </tr>
                  ) : (
                    currentDeptTemplate.kpis.map((kpi, idx) => {
                      const hasSummary = typeof companySummary?.overallScore === 'number' && companySummary.overallScore > 0 && companySummary.activeEmployeeCount > 0;
                      const isAtt = kpi.title.toLowerCase().includes('attendance') || kpi.title.toLowerCase().includes('shift');
                      const isTask = kpi.title.toLowerCase().includes('delivery') || kpi.title.toLowerCase().includes('ticket') || kpi.title.toLowerCase().includes('completion') || kpi.title.toLowerCase().includes('order');
                      const progressVal = hasSummary 
                        ? Math.min(100, isAtt 
                            ? companySummary.averageAttendance 
                            : isTask 
                              ? companySummary.taskBreakdown.completionPercent 
                              : companySummary.overallScore)
                        : 0;
                      const isExceeded = progressVal >= 95;
                      const isOnTrack = progressVal >= 80 && progressVal < 95;

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px' }}>{kpi.title}</div>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#475569', fontWeight: 500 }}>
                            {selectedDepartment === 'ALL' ? currentDeptTemplate.department : selectedDepartment}
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
                              background: hasSummary ? (isExceeded ? '#DCFCE7' : isOnTrack ? '#ECFEFF' : '#FEF3C7') : '#F1F5F9',
                              color: hasSummary ? (isExceeded ? '#15803D' : isOnTrack ? '#0E7490' : '#B45309') : '#64748B'
                            }}>
                              {hasSummary ? (isExceeded ? 'Exceeded' : isOnTrack ? 'On Track' : 'In Progress') : 'Pending Data'}
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

        {/* ======================================================== */}
        {/* SUBTAB 2: ATTENDANCE & PUNCTUALITY SECTION               */}
        {/* ======================================================== */}
        {activeSubTab === 'attendance' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Attendance &amp; Punctuality Reliability
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748B', margin: '2px 0 0' }}>
                  Biometric punch records, shift regularity, and punctuality scores for {selectedMonth}
                </p>
              </div>
              <span style={{
                fontSize: '0.74rem',
                background: companySummary.averageAttendance >= 80 ? '#DCFCE7' : '#F1F5F9',
                color: companySummary.averageAttendance >= 80 ? '#15803D' : '#64748B',
                padding: '4px 10px',
                borderRadius: '6px',
                fontWeight: 700
              }}>
                Company Attendance: {companySummary.averageAttendance}%
              </span>
            </div>

            {/* Attendance Metric Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
              marginBottom: '20px'
            }}>
              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Total Attendance Logs</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {companySummary.attendanceBreakdown.totalLogs} Logs
                </div>
                <div style={{ fontSize: '0.7rem', color: '#10B981', marginTop: '2px', fontWeight: 600 }}>Recorded in system</div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Present Rate</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                  {companySummary.attendanceBreakdown.presentPercent}%
                </div>
                <div style={{ fontSize: '0.7rem', color: '#15803D', marginTop: '2px', fontWeight: 600 }}>
                  {companySummary.averageAttendance}% overall attendance
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Late Marks</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0E7490', marginTop: '4px' }}>
                  {companySummary.attendanceBreakdown.latePercent}%
                </div>
                <div style={{ fontSize: '0.7rem', color: '#0E7490', marginTop: '2px', fontWeight: 600 }}>Punctuality record</div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Authorized Leaves</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7E22CE', marginTop: '4px' }}>
                  {companySummary.attendanceBreakdown.leavePercent}%
                </div>
                <div style={{ fontSize: '0.7rem', color: '#7E22CE', marginTop: '2px', fontWeight: 600 }}>Approved leave status</div>
              </div>
            </div>

            {/* Department Breakdown Table */}
            <div className="table-responsive">
              <table className="hrms-table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Department</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Staff Count</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Attendance Rate</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>On-Time Rate</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px', textAlign: 'right' }}>Attendance Score</th>
                  </tr>
                </thead>
                <tbody>
                  {companySummary.departmentPerformances.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B' }}>
                        No departments found. Add departments in Settings &gt; Company Details or assign employees to departments.
                      </td>
                    </tr>
                  ) : (
                    companySummary.departmentPerformances.map((d, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>{d.department}</td>
                        <td style={{ padding: '12px 16px', color: '#64748B', fontWeight: 600 }}>
                          {d.employeeCount} {d.employeeCount === 1 ? 'Member' : 'Members'}
                        </td>
                        <td style={{ padding: '12px 16px', color: d.attendanceRate > 0 ? '#15803D' : '#94A3B8', fontWeight: 700 }}>
                          {d.attendanceRate}%
                        </td>
                        <td style={{ padding: '12px 16px', color: d.onTimeRate > 0 ? '#0E7490' : '#94A3B8', fontWeight: 700 }}>
                          {d.onTimeRate}%
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: d.employeeCount === 0 
                              ? '#F1F5F9' 
                              : d.attendanceRate === 0 
                                ? '#ECFEFF' 
                                : d.attendanceRate >= 90 
                                  ? '#DCFCE7' 
                                  : d.attendanceRate >= 75 
                                    ? '#ECFEFF' 
                                    : d.attendanceRate >= 60 
                                      ? '#FEF3C7' 
                                      : '#FEE2E2',
                            color: d.employeeCount === 0 
                              ? '#64748B' 
                              : d.attendanceRate === 0 
                                ? '#0E7490' 
                                : d.attendanceRate >= 90 
                                  ? '#15803D' 
                                  : d.attendanceRate >= 75 
                                    ? '#0E7490' 
                                    : d.attendanceRate >= 60 
                                      ? '#B45309' 
                                      : '#DC2626',
                            border: `1px solid ${d.employeeCount === 0 
                              ? '#E2E8F0' 
                              : d.attendanceRate === 0 
                                ? '#CFFAFE' 
                                : d.attendanceRate >= 90 
                                  ? '#BBF7D0' 
                                  : d.attendanceRate >= 75 
                                    ? '#A5F3FC' 
                                    : d.attendanceRate >= 60 
                                      ? '#FDE68A' 
                                      : '#FECACA'}`
                          }}>
                            {d.employeeCount === 0 
                              ? 'No Staff' 
                              : d.attendanceRate === 0 
                                ? 'Pending Logs' 
                                : d.attendanceRate >= 90 
                                  ? 'Grade A+' 
                                  : d.attendanceRate >= 75 
                                    ? 'Grade A' 
                                    : d.attendanceRate >= 60 
                                      ? 'Grade B' 
                                      : 'Needs Focus'}
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

        {/* ======================================================== */}
        {/* SUBTAB 3: KEY RESULT INDICATORS (KRI / KRA) SECTION      */}
        {/* ======================================================== */}
        {activeSubTab === 'kri' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Key Result Indicators (KRI) &amp; Strategic Objectives
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748B', margin: '2px 0 0' }}>
                  High-impact organizational deliverables and KRA targets aligned to company milestones
                </p>
              </div>
              <span style={{ fontSize: '0.74rem', background: '#ECFEFF', color: '#0E7490', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                Quarterly Review Model
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
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px', textAlign: 'right' }}>KRI Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {companySummary.activeEmployeeCount === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B' }}>
                        No active employees found. Add employees in Employee Directory to track KRI performance.
                      </td>
                    </tr>
                  ) : (
                    currentDeptTemplate.kras.map((kra, idx) => (
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
                          background: companySummary.overallScore > 0 ? '#ECFEFF' : '#F1F5F9',
                          color: companySummary.overallScore > 0 ? '#0E7490' : '#64748B',
                          border: `1px solid ${companySummary.overallScore > 0 ? '#A5F3FC' : '#E2E8F0'}`
                        }}>
                          {(companySummary.overallScore > 0 ? (companySummary.overallScore / 20).toFixed(1) : '0.0')} / 5.0
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

        {/* ======================================================== */}
        {/* SUBTAB 4: EMPLOYEE LEADERBOARD & ROSTER                  */}
        {/* ======================================================== */}
        {activeSubTab === 'leaderboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Employee Performance Roster
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748B', margin: '2px 0 0' }}>
                  Select any employee to view their full KPI, Attendance, and KRI analytics
                </p>
              </div>

              {/* Search input */}
              <div style={{ position: 'relative', width: '240px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={e => {
                    setTableSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search employee..."
                  style={{
                    width: '100%',
                    padding: '7px 12px 7px 30px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div className="table-responsive">
              <table className="hrms-table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Employee</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Department</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Attendance</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>KPI Completion</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px' }}>Overall Score</th>
                    <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', padding: '12px 16px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B' }}>
                        No employee performance records found. Add employees in Employee Directory, assign tasks, and log attendance.
                      </td>
                    </tr>
                  ) : (
                    paginatedEmployees.map(emp => (
                      <tr key={emp.employeeId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px' }}>{emp.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>{emp.employeeId} • {emp.designation}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#475569', fontWeight: 500 }}>
                        {emp.department}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#15803D' }}>
                        {emp.attendanceRate}%
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0E7490' }}>
                        {emp.taskCompletionRate}%
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: emp.status.bg,
                          color: emp.status.color,
                          border: `1px solid ${emp.status.borderColor}`
                        }}>
                          {emp.overallScore}% ({emp.status.tier})
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => onViewEmployeeDetail(emp.employeeId)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '8px',
                            border: '1px solid #0E7490',
                            background: '#ECFEFF',
                            color: '#0E7490',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          View Analytics →
                        </button>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #F1F5F9',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#64748B' }}>
                <span>Showing {startIndex + 1} to {Math.min(startIndex + pageSize, totalEntries)} of {totalEntries} employees</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.78rem' }}
                >
                  <option value={5}>5 per page</option>
                  <option value={10}>10 per page</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: '0.78rem', padding: '0 8px', fontWeight: 600, color: '#0E7490' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default PerformanceDashboardView;
