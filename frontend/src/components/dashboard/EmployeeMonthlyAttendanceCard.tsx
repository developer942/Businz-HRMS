import React, { useState, useMemo } from 'react';
import { X, Calendar, ExternalLink } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { getMonthInfo, isDateInMonth, countLeaveDaysInMonth } from '../../utils/monthUtils';
import { isOwnerOrCEO } from '../../data/hrmsInitialData';
import { buildEmployeeMonthlyAttendanceOtReport } from '../../services/attendanceCalculationEngine';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/numbers';

interface EmployeeMonthlyAttendanceCardProps {
  onOpenAttendance?: () => void;
  onOpenLeaves?: () => void;
}

export const EmployeeMonthlyAttendanceCard: React.FC<EmployeeMonthlyAttendanceCardProps> = ({
  onOpenAttendance,
  onOpenLeaves
}) => {
  const {
    currentUser,
    employees,
    attendanceRecords,
    leaveRequests,
    masterAttendancePolicies,
    overtimeRequests,
    overtimePolicy,
    departmentOtPolicies,
    employeeOtPolicies,
    payrollSettingsConfig,
    shifts
  } = useHRMS();
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);

  const isCeoUser = isOwnerOrCEO(currentUser);

  const userLatePolicy = useMemo(() => {
    return (masterAttendancePolicies || []).find(p => p.status === 'Active');
  }, [masterAttendancePolicies]);

  // Compute monthly stats for current employee for the real current month (month-to-date)
  const { stats, currentEmpObj, monthInfo } = useMemo(() => {
    const month = getMonthInfo();
    const userEmpId = (currentUser.employeeId || currentUser.id || '').trim().toLowerCase();
    const userName = (currentUser.name || '').trim().toLowerCase();
    const userEmail = (currentUser.email || '').trim().toLowerCase();

    const matchedEmpObj = (employees || []).find(e => {
      const eCode = (e.employeeId || '').trim().toLowerCase();
      const eId = (e.id || '').trim().toLowerCase();
      const eEmail = (e.email || '').trim().toLowerCase();
      const eName = `${e.firstName} ${e.lastName}`.trim().toLowerCase();
      return (
        (userEmpId && (eCode === userEmpId || eId === userEmpId)) ||
        (userEmail && eEmail === userEmail) ||
        (userName && eName === userName)
      );
    });

    const validIds = new Set(
      [currentUser.employeeId, currentUser.id, matchedEmpObj?.employeeId, matchedEmpObj?.id]
        .filter(Boolean)
        .map(id => String(id).trim().toLowerCase())
    );
    const validNames = new Set(
      [currentUser.name, matchedEmpObj ? `${matchedEmpObj.firstName} ${matchedEmpObj.lastName}`.trim() : '']
        .filter(Boolean)
        .map(n => String(n).trim().toLowerCase())
    );

    const matchesCurrentUser = (employeeId?: string, employeeName?: string) => {
      const recId = (employeeId || '').trim().toLowerCase();
      if (recId && validIds.has(recId)) return true;

      const recName = (employeeName || '').trim().toLowerCase();
      return !!recName && validNames.has(recName);
    };

    // Filter and deduplicate attendance records by date for current user in the current month
    const byDate = new Map<string, typeof attendanceRecords[number]>();
    for (const a of attendanceRecords) {
      const dateKey = String(a.shiftDate || a.date || '').slice(0, 10);
      if (!dateKey || !isDateInMonth(dateKey, month)) continue;
      if (!matchesCurrentUser(a.employeeId, a.employeeName)) continue;
      const existing = byDate.get(dateKey);
      if (!existing) {
        byDate.set(dateKey, a);
      } else {
        const isManual = String(a.method || '') === 'Manual Punch' || String(a.method || '') === 'Manual Override';
        const existingIsManual = String(existing.method || '') === 'Manual Punch' || String(existing.method || '') === 'Manual Override';
        if (isManual && !existingIsManual) {
          byDate.set(dateKey, a);
        } else if (Boolean(a.checkOut) && !existing.checkOut) {
          byDate.set(dateKey, a);
        }
      }
    }
    const userRecords = Array.from(byDate.values());

    // Check user's approved leaves
    const userLeaves = leaveRequests.filter(l => {
      return matchesCurrentUser(l.employeeId, l.employeeName) && l.status === 'Approved';
    });

    // Month-to-date working days (Sundays = weekly off)
    const totalWorkingDays = month.elapsedWorkingDays;
    
    const userPresentCount = userRecords.filter(r => r.status === 'Present' || r.status === 'Work From Home' || (r.status === 'Late' && r.lateStatus === 'On Time')).length;
    const userLateCount = userRecords.filter(r => (r.status === 'Late' && r.lateStatus !== 'On Time') || r.status === 'Half Day').length;
    const userLeaveCount = userLeaves.reduce((acc, l) => acc + countLeaveDaysInMonth(l.startDate, l.endDate, month), 0);

    const realPresent = userPresentCount;
    const realLeave = userLeaveCount;
    const realLate = userLateCount;
    const realAbsent = Math.max(0, totalWorkingDays - realPresent - realLeave - realLate);

    const attendanceRate = totalWorkingDays > 0 ? Math.min(100, Math.round(((realPresent + (realLate * 0.5)) / totalWorkingDays) * 100)) : 0;

    return {
      currentEmpObj: matchedEmpObj,
      monthInfo: month,
      stats: {
        monthName: month.fullLabel,
        monthLabel: month.labelUpper,
        totalWorkingDays,
        present: realPresent,
        leave: realLeave,
        late: realLate,
        absent: realAbsent,
        attendanceRate
      }
    };
  }, [currentUser, employees, attendanceRecords, leaveRequests]);

  const monthlyOtReport = useMemo(() => {
    return buildEmployeeMonthlyAttendanceOtReport({
      employee: currentEmpObj || currentUser,
      attendanceRecords,
      overtimeRequests,
      overtimePolicy,
      departmentOtPolicies,
      employeeOtPolicies,
      payrollConfig: payrollSettingsConfig,
      shifts,
      month: monthInfo.monthIndex + 1,
      year: monthInfo.year
    });
  }, [
    currentEmpObj,
    currentUser,
    attendanceRecords,
    overtimeRequests,
    overtimePolicy,
    departmentOtPolicies,
    employeeOtPolicies,
    payrollSettingsConfig,
    shifts,
    monthInfo
  ]);

  if (isCeoUser || isOwnerOrCEO(currentEmpObj)) {
    return null;
  }

  const handleOpenMonthlyDetails = () => {
    setIsDetailsModalOpen(true);
  };

  // Donut chart SVG geometry (Big, Bold & Perfectly Proportioned)
  const size = 172;
  const cx = size / 2;
  const cy = size / 2;
  const r = 60;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * r;

  const { totalWorkingDays, present, leave, late, absent, attendanceRate } = stats;
  const safeTotal = totalWorkingDays > 0 ? totalWorkingDays : 1;

  const pPct = present / safeTotal;
  const lPct = leave / safeTotal;
  const hPct = late / safeTotal;
  const aPct = absent / safeTotal;

  const gap = 2.5;
  const pLen = Math.max(0, pPct * circumference - gap);
  const lLen = Math.max(0, lPct * circumference - gap);
  const hLen = Math.max(0, hPct * circumference - gap);
  const aLen = Math.max(0, aPct * circumference - (aPct > 0 ? gap : 0));

  const pOffset = 0;
  const lOffset = -(pPct * circumference);
  const hOffset = -((pPct + lPct) * circumference);
  const aOffset = -((pPct + lPct + hPct) * circumference);

  return (
    <>
    <div
      className="dashboard-widget-card"
      data-testid="employee-monthly-attendance-card"
      onClick={handleOpenMonthlyDetails}
      style={{ cursor: 'pointer' }}
    >
      {/* Header */}
      <div className="dashboard-widget-header" style={{ marginBottom: '8px' }}>
        <h3 className="dashboard-widget-title">
          MY MONTHLY ATTENDANCE
        </h3>
        <span className="dashboard-widget-badge" title={stats.monthName}>
          {stats.monthLabel}
        </span>
      </div>

      {/* Donut & Legend Container */}
      <div 
        className="dashboard-widget-body"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '0',
          overflow: 'visible',
          flex: 1
        }}
      >
        {/* Donut Chart */}
        <div style={{ 
          position: 'relative', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          width: '100%',
          margin: '0 auto'
        }}>
          <svg 
            width={size} 
            height={size} 
            viewBox={`0 0 ${size} ${size}`}
            style={{ overflow: 'visible', display: 'block', margin: '0 auto' }}
          >
            {/* Base Background Track */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
            />

            <g transform={`rotate(-90 ${cx} ${cy})`}>
              {/* 1. Present Arc (#0E7490 Teal) */}
              {present > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#0E7490"
                  strokeWidth={hoveredSegment === 'present' ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${pLen} ${circumference}`}
                  strokeDashoffset={pOffset}
                  style={{ 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    opacity: hoveredSegment && hoveredSegment !== 'present' ? 0.65 : 1
                  }}
                  onMouseEnter={() => setHoveredSegment('present')}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onClick={(e) => { e.stopPropagation(); handleOpenMonthlyDetails(); }}
                >
                  <title>Present: {present} Days</title>
                </circle>
              )}

              {/* 2. On Leave Arc (#F97316 Solar Orange) */}
              {leave > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#F97316"
                  strokeWidth={hoveredSegment === 'leave' ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${lLen} ${circumference}`}
                  strokeDashoffset={lOffset}
                  style={{ 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    opacity: hoveredSegment && hoveredSegment !== 'leave' ? 0.65 : 1
                  }}
                  onMouseEnter={() => setHoveredSegment('leave')}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onClick={(e) => { e.stopPropagation(); onOpenLeaves?.(); }}
                >
                  <title>On Leave: {leave} Days</title>
                </circle>
              )}

              {/* 3. Half Day / Late Arc (#F59E0B Amber) */}
              {late > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth={hoveredSegment === 'late' ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${hLen} ${circumference}`}
                  strokeDashoffset={hOffset}
                  style={{ 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    opacity: hoveredSegment && hoveredSegment !== 'late' ? 0.65 : 1
                  }}
                  onMouseEnter={() => setHoveredSegment('late')}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onClick={(e) => { e.stopPropagation(); handleOpenMonthlyDetails(); }}
                >
                  <title>Late / Half Day: {late} Days</title>
                </circle>
              )}

              {/* 4. Absent Arc (#EF4444 Rose Red) */}
              {absent > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth={hoveredSegment === 'absent' ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${aLen} ${circumference}`}
                  strokeDashoffset={aOffset}
                  style={{ 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    opacity: hoveredSegment && hoveredSegment !== 'absent' ? 0.65 : 1
                  }}
                  onMouseEnter={() => setHoveredSegment('absent')}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onClick={(e) => { e.stopPropagation(); handleOpenMonthlyDetails(); }}
                >
                  <title>Absent: {absent} Days</title>
                </circle>
              )}
            </g>

            {/* Center Rate / Count */}
            <text
              x={cx}
              y={cy - 2}
              textAnchor="middle"
              fill="#0B1A2D"
              fontSize="26px"
              fontWeight="800"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={(e) => { e.stopPropagation(); handleOpenMonthlyDetails(); }}
            >
              {attendanceRate}%
            </text>
            <text
              x={cx}
              y={cy + 15}
              textAnchor="middle"
              fill="#64748B"
              fontSize="9.5px"
              fontWeight="750"
              letterSpacing="0.06em"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={(e) => { e.stopPropagation(); handleOpenMonthlyDetails(); }}
            >
              ATTENDANCE
            </text>
          </svg>
        </div>

        {/* Legend Below Chart */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px' }}>
          {/* Present */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: '6px',
              transition: 'background 0.15s ease'
            }}
            onClick={(e) => { e.stopPropagation(); handleOpenMonthlyDetails(); }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; setHoveredSegment('present'); }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; setHoveredSegment(null); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0E7490', flexShrink: 0 }} />
              <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#0B1A2D' }}>
                Present
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.80rem', fontWeight: 750, color: '#0B1A2D', minWidth: '32px', textAlign: 'right' }}>
                {((present / safeTotal) * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: '0.80rem', fontWeight: 500, color: '#64748B', minWidth: '46px', textAlign: 'right' }}>
                {present} Days
              </span>
            </div>
          </div>

          {/* On Leave */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: '6px',
              transition: 'background 0.15s ease'
            }}
            onClick={(e) => { e.stopPropagation(); onOpenLeaves?.(); }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; setHoveredSegment('leave'); }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; setHoveredSegment(null); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F97316', flexShrink: 0 }} />
              <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#0B1A2D' }}>
                On Leave
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.80rem', fontWeight: 750, color: '#0B1A2D', minWidth: '32px', textAlign: 'right' }}>
                {((leave / safeTotal) * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: '0.80rem', fontWeight: 500, color: '#64748B', minWidth: '46px', textAlign: 'right' }}>
                {leave} Days
              </span>
            </div>
          </div>

          {/* Half Day / Late */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: '6px',
              transition: 'background 0.15s ease'
            }}
            onClick={(e) => { e.stopPropagation(); handleOpenMonthlyDetails(); }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; setHoveredSegment('late'); }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; setHoveredSegment(null); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F59E0B', flexShrink: 0 }} />
              <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#0B1A2D' }}>
                Half Day / Late
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.80rem', fontWeight: 750, color: '#0B1A2D', minWidth: '32px', textAlign: 'right' }}>
                {((late / safeTotal) * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: '0.80rem', fontWeight: 500, color: '#64748B', minWidth: '46px', textAlign: 'right' }}>
                {late} Days
              </span>
            </div>
          </div>

          {/* Absent */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: '6px',
              transition: 'background 0.15s ease'
            }}
            onClick={(e) => { e.stopPropagation(); handleOpenMonthlyDetails(); }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; setHoveredSegment('absent'); }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; setHoveredSegment(null); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444', flexShrink: 0 }} />
              <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#0B1A2D' }}>
                Absent
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.80rem', fontWeight: 750, color: '#0B1A2D', minWidth: '32px', textAlign: 'right' }}>
                {((absent / safeTotal) * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: '0.80rem', fontWeight: 500, color: '#64748B', minWidth: '46px', textAlign: 'right' }}>
                {absent} {absent === 1 ? 'Day' : 'Days'}
              </span>
            </div>
          </div>

          {/* Late Policy Warning System Banner */}
          {userLatePolicy?.warningSystemEnabled && late > 0 && (
            <div style={{
              marginTop: '6px',
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: late > (userLatePolicy.allowedLateCount ?? 3) ? '#FEF2F2' : '#FFFBEB',
              border: `1px solid ${late > (userLatePolicy.allowedLateCount ?? 3) ? '#FECACA' : '#FDE68A'}`,
              fontSize: '0.74rem',
              color: late > (userLatePolicy.allowedLateCount ?? 3) ? '#B91C1C' : '#92400E',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>{late > (userLatePolicy.allowedLateCount ?? 3) ? '⚠️' : '🔔'}</span>
              <span>
                {late > (userLatePolicy.allowedLateCount ?? 3)
                  ? `Late limit exceeded: ${late}/${userLatePolicy.allowedLateCount ?? 3} used this month. Deductions apply.`
                  : `Late warning: ${late} of ${userLatePolicy.allowedLateCount ?? 3} allowed late arrivals used.`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>

    {isDetailsModalOpen && (
      <div
        data-testid="monthly-attendance-details-modal"
        onClick={() => setIsDetailsModalOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          backgroundColor: 'rgba(15, 23, 42, 0.48)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '780px',
            maxHeight: '85vh',
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Modal Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Calendar size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                  Monthly Attendance {monthlyOtReport.showOtFields ? '& Overtime Details' : 'Report'} — {stats.monthName}
                </h3>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                  {currentEmpObj ? `${currentEmpObj.firstName} ${currentEmpObj.lastName}` : currentUser.name} ({currentEmpObj?.employeeId || currentUser.employeeId}) • {currentEmpObj?.department || currentUser.department || 'General'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {onOpenAttendance && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    onOpenAttendance();
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#0E7490',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <span>Full Attendance Log</span>
                  <ExternalLink size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsDetailsModalOpen(false)}
                aria-label="Close modal"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#64748B',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Modal Body: Table */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {monthlyOtReport.rows.length === 0 ? (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                border: '1px dashed #CBD5E1',
                color: '#64748B',
                fontSize: '0.84rem',
                fontWeight: 600
              }}>
                No attendance records found for {stats.monthName}.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', fontSize: '0.72rem', letterSpacing: '0.04em' }}>DATE</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', fontSize: '0.72rem', letterSpacing: '0.04em' }}>SHIFT TIME</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', fontSize: '0.72rem', letterSpacing: '0.04em', textAlign: 'right' }}>SHIFT WORK HRS</th>
                      {monthlyOtReport.showOtFields ? (
                        <>
                          <th style={{ padding: '10px 12px', fontWeight: 800, color: '#0E7490', fontSize: '0.72rem', letterSpacing: '0.04em', textAlign: 'right' }}>OT HRS</th>
                          <th style={{ padding: '10px 12px', fontWeight: 800, color: '#0E7490', fontSize: '0.72rem', letterSpacing: '0.04em', textAlign: 'right' }}>OT AMOUNT</th>
                        </>
                      ) : (
                        <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', fontSize: '0.72rem', letterSpacing: '0.04em', textAlign: 'right' }}>STATUS</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyOtReport.rows.map((row) => (
                      <tr key={row.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>
                          {formatDateDDMMYYYY(row.date)}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#334155' }}>
                          <div style={{ fontWeight: 600 }}>{row.shiftTime}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{row.punchTimeDisplay}</div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                          {row.shiftWorkHrs} hrs
                        </td>
                        {monthlyOtReport.showOtFields ? (
                          <>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: row.otHrs > 0 ? '#0E7490' : '#94A3B8' }}>
                              {row.otHrs > 0 ? `${row.otHrs} hrs` : '0 hrs'}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: row.otAmount > 0 ? '#15803D' : '#94A3B8' }}>
                              {formatCurrency(row.otAmount)}
                            </td>
                          </>
                        ) : (
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: row.status === 'Present' ? '#15803D' : '#64748B' }}>
                            {row.status}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {monthlyOtReport.showOtFields && (
                    <tfoot>
                      <tr style={{ backgroundColor: '#ECFEFF', borderTop: '2px solid #A5F3FC' }}>
                        <td colSpan={3} style={{ padding: '10px 12px', fontWeight: 800, color: '#0E7490', fontSize: '0.76rem' }}>
                          TOTAL APPROVED OT HOURS: {monthlyOtReport.totalApprovedOtHours} hrs
                        </td>
                        <td colSpan={2} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0E7490', fontSize: '0.82rem' }}>
                          TOTAL APPROVED OT AMOUNT: {formatCurrency(monthlyOtReport.totalApprovedOtAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
};
