import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { AttendanceList } from './AttendanceList';
import { FilterReportsModal, FilterReportsState, initialFilterReportsState } from '../common/FilterReportsModal';
import { 
  BarChart2, 
  TrendingUp, 
  ExternalLink, 
  Filter, 
  Info, 
  RotateCw, 
  Clock, 
  CalendarDays, 
  FileText, 
  Headphones, 
  X, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  ChevronRight,
  Calendar
} from 'lucide-react';

import { AttendanceReportsView } from './AttendanceReportsView';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface ActivityPoint {
  time: string;
  count: number;
  label: string;
}

export const AttendanceHub: React.FC = () => {
  const { 
    currentUser, 
    employees, 
    attendanceRecords, 
    leaveRequests, 
    approveLeave, 
    rejectLeave, 
    setActiveModule, 
    markAttendance, 
    attendanceCorrections, 
    reviewAttendanceCorrection,
    shifts
  } = useHRMS();

  // Navigation Sub-view: Defaults to Attendance Reports
  const [activeSubView, setActiveSubView] = useState<'reports' | 'insights' | 'manage'>('manage');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [filterReports, setFilterReports] = useState<FilterReportsState>(initialFilterReportsState);

  // Modals for Pending Approvals
  const [activeApprovalModal, setActiveApprovalModal] = useState<'leaves' | 'regularisations' | 'docs' | 'helpdesk' | null>(null);
  const isCEO = currentUser.role === 'CEO' || currentUser.role === 'Super Admin' || (currentUser as any).designation?.toLowerCase().includes('ceo') || currentUser.employeeId === 'EMP-000';
  const isHRApprover = currentUser.role === 'HR Admin' || currentUser.role === 'HR Manager' || currentUser.role === 'HR' || (currentUser as any).department?.toLowerCase().includes('hr');



  // Document verification items
  const [docApprovals, setDocApprovals] = useState<{ id: string; employee: string; empId: string; docType: string; date: string; status: string }[]>([]);

  // Helpdesk tickets
  const [helpdeskTickets, setHelpdeskTickets] = useState<{ id: string; employee: string; subject: string; category: string; date: string; status: string }[]>([]);

  // Real-time hover state on chart
  const [hoveredPoint, setHoveredPoint] = useState<ActivityPoint | null>(null);

  // Today's formatted date string e.g. "2026-09-02 (Wed) Today"
  const formattedToday = (() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = days[d.getDay()];
    return `${year}-${month}-${day} (${dayName}) Today`;
  })();

  // Extract list of selected branches & departments
  const selectedBranchDepts = Object.entries(filterReports.branchDepartments || {}).flatMap(([branch, depts]) => 
    depts.map(dept => ({ branch, dept }))
  );

  // Filter count badge
  const activeFilterCount = 
    (filterReports.branches || []).length +
    (filterReports.departments || []).length +
    selectedBranchDepts.length + 
    filterReports.shifts.length + 
    filterReports.employmentTypes.length + 
    filterReports.modesOfWork.length;

  // Master employees list for calculating metric stats
  const baseEmployees = employees;

  // Dynamically filter employees according to active filter criteria
  const activeEmployees = baseEmployees.filter(emp => {
    // 1. Branch filter
    if (filterReports.branches && filterReports.branches.length > 0) {
      const empBranch = (emp.workLocation || (emp as any).branch || '').toLowerCase().trim();
      const matchesBranch = filterReports.branches.some(b => {
        const target = b.toLowerCase().trim();
        return empBranch === target || empBranch.includes(target) || target.includes(empBranch);
      });
      if (!matchesBranch) return false;
    }

    // 2. Department filter
    if (filterReports.departments && filterReports.departments.length > 0) {
      const empDept = (emp.department || '').toLowerCase().trim();
      const matchesDept = filterReports.departments.some(d => {
        const target = d.toLowerCase().trim();
        return empDept === target || empDept.includes(target) || target.includes(empDept);
      });
      if (!matchesDept) return false;
    }

    // 3. Legacy Branch & Department filter
    if (selectedBranchDepts.length > 0) {
      const match = selectedBranchDepts.some(({ dept }) => 
        emp.department.toLowerCase().includes(dept.toLowerCase()) || 
        dept.toLowerCase().includes(emp.department.toLowerCase())
      );
      if (!match) return false;
    }

    // 2. Employment Type filter
    if (filterReports.employmentTypes.length > 0) {
      if (emp.employmentType && !filterReports.employmentTypes.includes(emp.employmentType)) {
        return false;
      }
    }

    // 3. Shift filter based on Company Shifts
    if (filterReports.shifts && filterReports.shifts.length > 0) {
      const empShift = emp.workShift || 
        shifts.find(s => s.assignments?.some(a => a.employeeId === emp.employeeId || a.employeeId === emp.id))?.shiftName || 
        shifts[0]?.shiftName;
      const matchesShift = filterReports.shifts.some(selectedShift => 
        empShift && (
          empShift === selectedShift || 
          empShift.toLowerCase().includes(selectedShift.toLowerCase()) || 
          selectedShift.toLowerCase().includes(empShift.toLowerCase())
        )
      );
      if (!matchesShift) return false;
    }

    return true;
  });

  const totalStaffCount = activeEmployees.length;
  const filteredEmpIds = new Set(activeEmployees.map(e => e.employeeId));

  // Real-time metrics based on records and leaves
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecords = attendanceRecords
    .filter(r => r.date === todayStr)
    .filter(r => filteredEmpIds.has(r.employeeId));

  const clockedInRecords = todayRecords.filter(r => r.checkIn && !r.checkOut);
  const completedRecords = todayRecords.filter(r => r.checkIn && r.checkOut);
  const presentRecords = todayRecords.filter(r => r.status === 'Present' || r.status === 'Work From Home' || r.status === 'Late');
  const leavesToday = leaveRequests.filter(l => l.status === 'Approved' && l.startDate <= todayStr && l.endDate >= todayStr && filteredEmpIds.has(l.employeeId));
  const earlyCheckouts = todayRecords.filter(r => r.checkOut && (r.workingHours > 0 && r.workingHours < 7.5));
  const missedCheckouts = todayRecords.filter(r => r.checkIn && !r.checkOut && new Date().getHours() >= 19);

  // Counts
  const clockedInCount = clockedInRecords.length;
  const leaveCount = leavesToday.length;
  const earlyClockoutCount = earlyCheckouts.length;
  const presentCount = presentRecords.length;
  // If no one is present/clocked in yet, absent is totalStaffCount - presentCount - leaveCount
  const absentCount = Math.max(0, totalStaffCount - presentCount - leaveCount);
  const missedClockoutCount = missedCheckouts.length;

  // Percentages
  const clockedInPct = totalStaffCount > 0 ? Math.round((clockedInCount / totalStaffCount) * 100) : 0;
  const leavePct = totalStaffCount > 0 ? Math.round((leaveCount / totalStaffCount) * 100) : 0;
  const earlyPct = totalStaffCount > 0 ? Math.round((earlyClockoutCount / totalStaffCount) * 100) : 0;
  const presentPct = totalStaffCount > 0 ? Math.round((presentCount / totalStaffCount) * 100) : 0;
  const absentPct = totalStaffCount > 0 ? Math.round((absentCount / totalStaffCount) * 100) : 100;
  const missedPct = totalStaffCount > 0 ? Math.round((missedClockoutCount / totalStaffCount) * 100) : 0;

  // Timeline Activity Chart Points (06:00 to 22:00) calculated from real today attendance punches
  const activityData: ActivityPoint[] = useMemo(() => {
    const parseHour = (timeStr?: string | null) => {
      if (!timeStr) return -1;
      const parts = timeStr.split(':').map(Number);
      return isNaN(parts[0]) ? -1 : parts[0];
    };

    const slots = [
      { time: '06:00', start: 6, end: 8, label: 'Early Shift In' },
      { time: '08:00', start: 8, end: 10, label: 'Morning Shift Start' },
      { time: '10:00', start: 10, end: 12, label: 'Peak Punch Window' },
      { time: '12:00', start: 12, end: 14, label: 'Mid-Day Sync' },
      { time: '14:00', start: 14, end: 16, label: 'Post-Lunch Window' },
      { time: '16:00', start: 16, end: 18, label: 'Afternoon Check' },
      { time: '18:00', start: 18, end: 20, label: 'Evening Shift Out' },
      { time: '20:00', start: 20, end: 22, label: 'Overtime Clock-Out' },
      { time: '22:00', start: 22, end: 24, label: 'Night Shift Transition' }
    ];

    return slots.map(s => {
      const count = todayRecords.filter(r => {
        const inH = parseHour(r.checkIn);
        const outH = parseHour(r.checkOut);
        if (s.start >= 18) {
          return (outH >= s.start && outH < s.end) || (inH >= s.start && inH < s.end);
        }
        return inH >= s.start && inH < s.end;
      }).length;

      return {
        time: s.time,
        count,
        label: s.label
      };
    });
  }, [todayRecords]);

  // Refresh action
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };

  // Pending leaves count
  const pendingLeavesList = leaveRequests.filter(l => l.status === 'Pending');



  // Render Sub-Views
  if (activeSubView === 'manage') {
    return (
      <div>
        <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button 
            className="att-manage-btn"
            onClick={() => setActiveSubView('insights')}
            style={{ fontWeight: 700 }}
          >
            ← Back to Attendance Insights
          </button>
        </div>
        <AttendanceList onBackToInsights={() => setActiveSubView('insights')} />
      </div>
    );
  }

  return (
    <div className="att-container" style={{ paddingBottom: '40px' }}>
      

      {/* 1. SUB-VIEW: ATTENDANCE REPORTS (DEFAULT) */}
      {activeSubView === 'reports' && (
        <AttendanceReportsView 
          onOpenFilter={() => setShowFilterModal(true)} 
          filterReports={filterReports} 
        />
      )}

      {/* 2. SUB-VIEW: LIVE INSIGHTS */}
      {activeSubView === 'insights' && (
        <>
          {/* FILTER ROW */}
          <div className="att-filter-row">
        <div className="att-filter-status">
          {activeFilterCount === 0 ? (
            'No filter applied'
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: '#475569' }}>Filtered by:</span>
              {(filterReports.branches || []).map(branch => (
                <span key={branch} className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Branch: {branch}
                  <X 
                    size={12} 
                    style={{ cursor: 'pointer' }} 
                    onClick={() => setFilterReports(prev => ({ ...prev, branches: prev.branches.filter(b => b !== branch) }))} 
                  />
                </span>
              ))}

              {(filterReports.departments || []).map(dept => (
                <span key={dept} className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Dept: {dept}
                  <X 
                    size={12} 
                    style={{ cursor: 'pointer' }} 
                    onClick={() => setFilterReports(prev => ({ ...prev, departments: prev.departments.filter(d => d !== dept) }))} 
                  />
                </span>
              ))}

              {selectedBranchDepts.map(({ branch, dept }) => (
                <span key={`${branch}-${dept}`} className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {branch}: {dept}
                  <X 
                    size={12} 
                    style={{ cursor: 'pointer' }} 
                    onClick={() => {
                      const currentBranchDepts = (filterReports.branchDepartments || {})[branch] || [];
                      const updated = currentBranchDepts.filter(d => d !== dept);
                      const newBranchDepts = { ...(filterReports.branchDepartments || {}) };
                      if (updated.length === 0) delete newBranchDepts[branch];
                      else newBranchDepts[branch] = updated;
                      setFilterReports(prev => ({ ...prev, branchDepartments: newBranchDepts }));
                    }} 
                  />
                </span>
              ))}

              {filterReports.shifts.map(shift => (
                <span key={shift} className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {shift.split(' ')[0]} Shift
                  <X 
                    size={12} 
                    style={{ cursor: 'pointer' }} 
                    onClick={() => setFilterReports(prev => ({ ...prev, shifts: prev.shifts.filter(s => s !== shift) }))} 
                  />
                </span>
              ))}

              {filterReports.employmentTypes.map(empType => (
                <span key={empType} className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {empType}
                  <X 
                    size={12} 
                    style={{ cursor: 'pointer' }} 
                    onClick={() => setFilterReports(prev => ({ ...prev, employmentTypes: prev.employmentTypes.filter(t => t !== empType) }))} 
                  />
                </span>
              ))}

              {filterReports.modesOfWork.map(mode => (
                <span key={mode} className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {mode.split(' ')[0]}
                  <X 
                    size={12} 
                    style={{ cursor: 'pointer' }} 
                    onClick={() => setFilterReports(prev => ({ ...prev, modesOfWork: prev.modesOfWork.filter(m => m !== mode) }))} 
                  />
                </span>
              ))}

              <button 
                onClick={() => setFilterReports(initialFilterReportsState)}
                style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Reset All
              </button>
            </div>
          )}
        </div>

        <button 
          className="att-filter-btn"
          onClick={() => setShowFilterModal(true)}
        >
          <Filter size={14} color="#64748b" />
          <span>Filter</span>
          <span className="att-filter-btn-badge">{activeFilterCount}</span>
        </button>
      </div>

      {/* 4. 6 METRIC KPI CARDS */}
      <div className="att-metric-grid">
        
        {/* Card 1: Users Clocked In */}
        <div className="att-metric-card accent-orange">
          <div className="att-metric-header">
            <span className="att-metric-title">Users Clocked In (%)</span>
            <span title="Percentage of total workforce that currently have active clocked-in punch status">
              <Info size={15} className="att-metric-info-icon" />
            </span>
          </div>
          <div className="att-metric-value">{clockedInPct}%</div>
          <div className="att-metric-footer">
            <span className="att-metric-dot orange"></span>
            <span>{clockedInCount} clocked in</span>
          </div>
        </div>

        {/* Card 2: Leave & Off */}
        <div className="att-metric-card accent-blue">
          <div className="att-metric-header">
            <span className="att-metric-title">Leave & Off (%)</span>
            <span title="Percentage of employees on sanctioned leave, weekly off, or holiday today">
              <Info size={15} className="att-metric-info-icon" />
            </span>
          </div>
          <div className="att-metric-value">{leavePct}%</div>
          <div className="att-metric-footer">
            <span className="att-metric-dot blue"></span>
            <span>{leaveCount} on leave & off</span>
          </div>
        </div>

        {/* Card 3: Early Clock Out */}
        <div className="att-metric-card accent-teal">
          <div className="att-metric-header">
            <span className="att-metric-title">Early Clock Out (%)</span>
            <span title="Percentage of employees who completed check-out before standard shift conclusion">
              <Info size={15} className="att-metric-info-icon" />
            </span>
          </div>
          <div className="att-metric-value">{earlyPct}%</div>
          <div className="att-metric-footer">
            <span className="att-metric-dot teal"></span>
            <span>{earlyClockoutCount} early clock out</span>
          </div>
        </div>

        {/* Card 4: Present */}
        <div className="att-metric-card accent-green">
          <div className="att-metric-header">
            <span className="att-metric-title">Present (%)</span>
            <span title="Workforce attendance compliance rate: employees present in office or remote">
              <Info size={15} className="att-metric-info-icon" />
            </span>
          </div>
          <div className="att-metric-value">{presentPct}%</div>
          <div className="att-metric-footer">
            <span className="att-metric-dot green"></span>
            <span>{presentCount} present</span>
          </div>
        </div>

        {/* Card 5: Absent */}
        <div className="att-metric-card accent-red">
          <div className="att-metric-header">
            <span className="att-metric-title">Absent (%)</span>
            <span title="Employees not checked in and without approved leave request">
              <Info size={15} className="att-metric-info-icon" />
            </span>
          </div>
          <div className="att-metric-value">{absentPct}%</div>
          <div className="att-metric-footer">
            <span className="att-metric-dot red"></span>
            <span>{absentCount} full absent</span>
          </div>
        </div>

        {/* Card 6: Miss Clock Out */}
        <div className="att-metric-card accent-slate">
          <div className="att-metric-header">
            <span className="att-metric-title">Miss Clock Out (%)</span>
            <span title="Employees who logged in but did not register evening check-out punch">
              <Info size={15} className="att-metric-info-icon" />
            </span>
          </div>
          <div className="att-metric-value">{missedPct}%</div>
          <div className="att-metric-footer">
            <span className="att-metric-dot slate"></span>
            <span>{missedClockoutCount} missed clock out</span>
          </div>
        </div>

      </div>

      {/* 5. MAIN CONTENT SPLIT: Real Time Activity (Left) & Pending Approvals (Right) */}
      <div className="att-main-split">
          
          {/* Left Column: Real time attendance activity */}
          <div className="att-activity-card">
            <div className="att-activity-header">
              <h2 className="att-activity-title">Real time attendance activity</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  className={`att-refresh-btn ${isRefreshing ? 'spinning' : ''}`}
                  onClick={handleRefresh}
                  title="Refresh Live Data"
                >
                  <RotateCw size={15} />
                </button>
              </div>
            </div>

            {/* Interactive Timeline Area SVG Chart */}
            <div className="att-chart-container">
              <svg 
                viewBox="0 0 700 220" 
                style={{ width: '100%', height: '220px', overflow: 'visible' }}
              >
                <defs>
                  <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0.00" />
                  </linearGradient>
                </defs>

                {/* Horizontal Scale Grid Lines */}
                {[0, 1, 2, 3, 4].map((gridVal, i) => {
                  const yPos = 180 - (i * 40);
                  return (
                    <g key={i}>
                      <line 
                        x1="35" 
                        y1={yPos} 
                        x2="680" 
                        y2={yPos} 
                        stroke="#e2e8f0" 
                        strokeWidth="1" 
                        strokeDasharray="4 4" 
                      />
                      <text 
                        x="20" 
                        y={yPos + 4} 
                        fill="#94a3b8" 
                        fontSize="11" 
                        fontWeight="600" 
                        textAnchor="end"
                      >
                        {gridVal}
                      </text>
                    </g>
                  );
                })}

                {/* X Axis Baseline */}
                <line x1="35" y1="180" x2="680" y2="180" stroke="#cbd5e1" strokeWidth="1.5" />

                {/* Area Fill */}
                {(() => {
                  const points = activityData.map((d, index) => {
                    const x = 50 + (index * (610 / (activityData.length - 1)));
                    const y = 180 - (d.count * 40);
                    return { x, y };
                  });

                  if (points.length === 0) return null;

                  // Build smooth SVG path
                  let dPath = `M ${points[0].x} ${points[0].y}`;
                  for (let i = 0; i < points.length - 1; i++) {
                    const curr = points[i];
                    const next = points[i + 1];
                    const cpX = (curr.x + next.x) / 2;
                    dPath += ` C ${cpX} ${curr.y}, ${cpX} ${next.y}, ${next.x} ${next.y}`;
                  }

                  const areaPath = `${dPath} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`;

                  return (
                    <>
                      <path d={areaPath} fill="url(#attendanceGradient)" />
                      <path d={dPath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
                    </>
                  );
                })()}

                {/* Interactive Points & X-Labels */}
                {activityData.map((pt, idx) => {
                  const x = 50 + (idx * (610 / (activityData.length - 1)));
                  const y = 180 - (pt.count * 40);
                  const isHovered = hoveredPoint?.time === pt.time;

                  return (
                    <g key={pt.time}>
                      {/* X Label */}
                      <text 
                        x={x} 
                        y="202" 
                        fill="#64748b" 
                        fontSize="11" 
                        fontWeight="600" 
                        textAnchor="middle"
                      >
                        {pt.time}
                      </text>

                      {/* Point Circle */}
                      <circle 
                        cx={x} 
                        cy={y} 
                        r={isHovered ? 6 : 4} 
                        fill="#ffffff" 
                        stroke="#2563eb" 
                        strokeWidth={isHovered ? 3 : 2}
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                        onMouseEnter={() => setHoveredPoint(pt)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Chart Tooltip Overlay */}
              {hoveredPoint && (
                <div style={{
                  position: 'absolute',
                  top: '20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#0f172a',
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  zIndex: 20
                }}>
                  <Clock size={13} color="#60a5fa" />
                  <span><strong>{hoveredPoint.time}</strong>: {hoveredPoint.count} employee(s) active ({hoveredPoint.label})</span>
                </div>
              )}

              {/* Realtime Live Ticker Footer */}
              <div style={{ 
                marginTop: '10px', 
                padding: '8px 12px', 
                background: '#ffffff', 
                borderRadius: '8px', 
                border: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                  <span>Face AI & GPS sensors sync active across 3 office gates</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Pending approvals */}
          <div className="att-approvals-card">
            <h2 className="att-approvals-title">Pending approvals</h2>

            <div className="att-approvals-list">
              
              {/* Item 1: Leaves */}
              <div 
                className="att-approval-item"
                onClick={() => setActiveApprovalModal('leaves')}
                title="Click to review leave approvals"
              >
                <div className="att-approval-left">
                  <div className="att-approval-icon-circle leaves">
                    <Clock size={20} />
                  </div>
                  <div className="att-approval-meta">
                    <div className="att-approval-name">Leaves</div>
                    <div className="att-approval-desc">Leave pending approvals</div>
                  </div>
                </div>
                <div className="att-count-badge">
                  {String(pendingLeavesList.length).padStart(2, '0')}
                </div>
              </div>

              {/* Item 2: Regularisations */}
              <div 
                className="att-approval-item"
                onClick={() => setActiveApprovalModal('regularisations')}
                title="Click to review attendance regularisations"
              >
                <div className="att-approval-left">
                  <div className="att-approval-icon-circle regularisations">
                    <CalendarDays size={20} />
                  </div>
                  <div className="att-approval-meta">
                    <div className="att-approval-name">Regularisations</div>
                    <div className="att-approval-desc">Regularisation pending approval</div>
                  </div>
                </div>
                <div className="att-count-badge">
                  {String(attendanceCorrections.filter(c => c.status === 'Pending').length).padStart(2, '0')}
                </div>
              </div>

              {/* Item 3: User Doc Approval */}
              <div 
                className="att-approval-item"
                onClick={() => setActiveApprovalModal('docs')}
                title="Click to verify KYC documents"
              >
                <div className="att-approval-left">
                  <div className="att-approval-icon-circle user-doc">
                    <FileText size={20} />
                  </div>
                  <div className="att-approval-meta">
                    <div className="att-approval-name">User Doc Approval</div>
                    <div className="att-approval-desc">Bank, Photo & Doc updates</div>
                  </div>
                </div>
                <div className="att-count-badge">
                  {String(docApprovals.filter(d => d.status === 'Pending').length).padStart(2, '0')}
                </div>
              </div>

              {/* Item 4: Helpdesk */}
              <div 
                className="att-approval-item"
                onClick={() => setActiveApprovalModal('helpdesk')}
                title="Click to review helpdesk tickets"
              >
                <div className="att-approval-left">
                  <div className="att-approval-icon-circle helpdesk">
                    <Headphones size={20} />
                  </div>
                  <div className="att-approval-meta">
                    <div className="att-approval-name">Helpdesk</div>
                    <div className="att-approval-desc">Helpdesk ticket pending approval</div>
                  </div>
                </div>
                <div className="att-count-badge">
                  {String(helpdeskTickets.filter(t => t.status === 'Pending').length).padStart(2, '0')}
                </div>
              </div>

            </div>
          </div>

        </div>
        </>
      )}



      {/* FILTER REPORTS MODAL (Exact from screenshot) */}
      <FilterReportsModal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        currentFilters={filterReports}
        onApply={(newFilters) => setFilterReports(newFilters)}
        onReset={() => setFilterReports(initialFilterReportsState)}
      />

      {/* APPROVAL MODALS: LEAVES, REGULARISATIONS, DOCS, HELPDESK */}
      {activeApprovalModal === 'leaves' && (
        <div className="modal-overlay" onClick={() => setActiveApprovalModal(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Pending Leave Approvals</h3>
              <button onClick={() => setActiveApprovalModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>
              {pendingLeavesList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  <CheckCircle2 size={36} color="#16a34a" style={{ margin: '0 auto 10px' }} />
                  <p>No pending leave requests requiring approval.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {pendingLeavesList.map(l => (
                    <div key={l.id} style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{l.employeeName}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{l.leaveType} • {formatDateDDMMYYYY(l.startDate)} to {formatDateDDMMYYYY(l.endDate)} ({l.daysCount} days)</div>
                        <div style={{ fontSize: '0.76rem', color: '#334155', marginTop: '4px' }}>Reason: {l.reason}</div>
                      </div>
                      {(isCEO || isHRApprover) && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            className="btn btn-primary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#16a34a' }}
                            onClick={() => approveLeave(l.id, currentUser.name)}
                          >
                            Approve
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#ef4444' }}
                            onClick={() => rejectLeave(l.id, currentUser.name, 'Rejected by CEO')}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REGULARISATIONS MODAL */}
      {activeApprovalModal === 'regularisations' && (
        <div className="modal-overlay" onClick={() => setActiveApprovalModal(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Attendance Regularisation Approvals</h3>
              <button onClick={() => setActiveApprovalModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {attendanceCorrections.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                    No attendance regularisation requests found.
                  </div>
                ) : (
                  attendanceCorrections.map(req => (
                    <div key={req.id} style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>{req.employeeName}</span>
                          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>({req.employeeId})</span>
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: '9999px',
                            backgroundColor: req.status === 'Approved' ? '#DCFCE7' : req.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                            color: req.status === 'Approved' ? '#166534' : req.status === 'Rejected' ? '#991B1B' : '#92400E'
                          }}>
                            {req.status}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#0E7490', fontWeight: 600 }}>
                          {req.missingType} on {formatDateDDMMYYYY(req.date)} (Req: {req.requestedCheckIn || '--:--'} - {req.requestedCheckOut || '--:--'})
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>
                          <strong>Reason:</strong> {req.reason}
                        </div>
                      </div>
                      {req.status === 'Pending' ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            className="btn btn-primary btn-sm"
                            style={{ padding: '5px 10px', fontSize: '0.75rem', background: '#16A34A', border: 'none', color: '#FFF' }}
                            onClick={() => reviewAttendanceCorrection(req.id, 'Approved', 'Approved by HR via Attendance Hub')}
                          >
                            Approve
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '5px 10px', fontSize: '0.75rem', color: '#EF4444', borderColor: '#FECACA' }}
                            onClick={() => reviewAttendanceCorrection(req.id, 'Rejected', 'Declined by HR')}
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#64748B', fontStyle: 'italic' }}>
                          {req.hrComment || req.status}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* USER DOC APPROVAL MODAL */}
      {activeApprovalModal === 'docs' && (
        <div className="modal-overlay" onClick={() => setActiveApprovalModal(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Employee Document / KYC Approvals</h3>
              <button onClick={() => setActiveApprovalModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {docApprovals.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                    No employee KYC documents or bank proofs pending verification.
                  </div>
                ) : (
                  docApprovals.map(doc => (
                    <div key={doc.id} style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{doc.employee} ({doc.empId})</div>
                        <div style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>{doc.docType}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Submitted on: {formatDateDDMMYYYY(doc.date)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className="btn btn-primary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#16a34a' }}
                          onClick={() => setDocApprovals(prev => prev.filter(d => d.id !== doc.id))}
                        >
                          Verify & Accept
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#ef4444' }}
                          onClick={() => setDocApprovals(prev => prev.filter(d => d.id !== doc.id))}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HELPDESK MODAL */}
      {activeApprovalModal === 'helpdesk' && (
        <div className="modal-overlay" onClick={() => setActiveApprovalModal(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Helpdesk Pending Tickets</h3>
              <button onClick={() => setActiveApprovalModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {helpdeskTickets.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                    No pending attendance or device helpdesk tickets.
                  </div>
                ) : (
                  helpdeskTickets.map(tkt => (
                    <div key={tkt.id} style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{tkt.subject}</div>
                        <div style={{ fontSize: '0.78rem', color: '#0284c7' }}>Category: {tkt.category} • Raised by: {tkt.employee}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Date: {formatDateDDMMYYYY(tkt.date)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className="btn btn-primary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={() => setHelpdeskTickets(prev => prev.filter(t => t.id !== tkt.id))}
                        >
                          Resolve Ticket
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default AttendanceHub;
