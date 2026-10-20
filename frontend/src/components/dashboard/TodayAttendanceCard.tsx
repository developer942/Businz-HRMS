import React, { useState } from 'react';
import { AttendanceCategoryType } from './AttendanceCategoryModal';

interface TodayAttendanceCardProps {
  total: number;
  present: number;
  absent: number;
  leave: number;
  late?: number;
  onSelectCategory?: (category: AttendanceCategoryType) => void;
  onOpenLeaves?: () => void;
}

export const TodayAttendanceCard: React.FC<TodayAttendanceCardProps> = ({
  total,
  present,
  absent,
  leave,
  late = 0,
  onSelectCategory,
  onOpenLeaves
}) => {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  // SVG parameters optimized to fit perfectly within standard 380px widget card height with 4 legend rows
  const size = 172;
  const cx = size / 2;
  const cy = size / 2;
  const r = 60;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * r;

  // Safe percentages
  const safeTotal = total > 0 ? total : 1;
  const pPct = present / safeTotal;
  const latePct = late / safeTotal;
  const lPct = leave / safeTotal;
  const aPct = absent / safeTotal;

  const gap = safeTotal > 1 ? 2.5 : 0;
  const pLength = Math.max(0, pPct * circumference - (pPct > 0 && safeTotal > 1 ? gap : 0));
  const lateLength = Math.max(0, latePct * circumference - (latePct > 0 && safeTotal > 1 ? gap : 0));
  const lLength = Math.max(0, lPct * circumference - (lPct > 0 && safeTotal > 1 ? gap : 0));
  const aLength = Math.max(0, aPct * circumference - (aPct > 0 && safeTotal > 1 ? gap : 0));

  const pOffset = 0;
  const lateOffset = -(pPct * circumference);
  const lOffset = -((pPct + latePct) * circumference);
  const aOffset = -((pPct + latePct + lPct) * circumference);

  return (
    <div className="dashboard-widget-card">
      {/* Header matching ControlRoom standard card header */}
      <div className="dashboard-widget-header" style={{ marginBottom: '6px' }}>
        <h3 className="dashboard-widget-title">
          ATTENDANCE BY STATUS
        </h3>
        <span className="dashboard-widget-badge">
          {total} TOTAL STAFF
        </span>
      </div>

      {/* Donut & Legend Container - Centered and flexible */}
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
        {/* Donut Chart with Center Count */}
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
              {/* Present Arc (Cyan / Primary Teal #0E7490) */}
              {present > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#0E7490"
                  strokeWidth={hoveredSegment === 'present' ? strokeWidth + 3 : strokeWidth}
                  strokeDasharray={`${pLength} ${circumference}`}
                  strokeDashoffset={pOffset}
                  style={{ 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    opacity: hoveredSegment && hoveredSegment !== 'present' ? 0.65 : 1
                  }}
                  onMouseEnter={() => setHoveredSegment('present')}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onClick={() => onSelectCategory && onSelectCategory('present')}
                >
                  <title>Present: {present} ({((pPct) * 100).toFixed(0)}%)</title>
                </circle>
              )}

              {/* Late Arc (Amber #F59E0B) */}
              {late > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth={hoveredSegment === 'late' ? strokeWidth + 3 : strokeWidth}
                  strokeDasharray={`${lateLength} ${circumference}`}
                  strokeDashoffset={lateOffset}
                  style={{ 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    opacity: hoveredSegment && hoveredSegment !== 'late' ? 0.65 : 1
                  }}
                  onMouseEnter={() => setHoveredSegment('late')}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onClick={() => onSelectCategory && onSelectCategory('late')}
                >
                  <title>Late: {late} ({((latePct) * 100).toFixed(0)}%)</title>
                </circle>
              )}

              {/* Leave Arc (Solar Orange #F97316) */}
              {leave > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#F97316"
                  strokeWidth={hoveredSegment === 'leave' ? strokeWidth + 3 : strokeWidth}
                  strokeDasharray={`${lLength} ${circumference}`}
                  strokeDashoffset={lOffset}
                  style={{ 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    opacity: hoveredSegment && hoveredSegment !== 'leave' ? 0.65 : 1
                  }}
                  onMouseEnter={() => setHoveredSegment('leave')}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onClick={() => onOpenLeaves ? onOpenLeaves() : onSelectCategory && onSelectCategory('total')}
                >
                  <title>On Leave: {leave} ({((lPct) * 100).toFixed(0)}%)</title>
                </circle>
              )}

              {/* Absent Arc (Rose Red #EF4444) */}
              {absent > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth={hoveredSegment === 'absent' ? strokeWidth + 3 : strokeWidth}
                  strokeDasharray={`${aLength} ${circumference}`}
                  strokeDashoffset={aOffset}
                  style={{ 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    opacity: hoveredSegment && hoveredSegment !== 'absent' ? 0.65 : 1
                  }}
                  onMouseEnter={() => setHoveredSegment('absent')}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onClick={() => onSelectCategory && onSelectCategory('absent')}
                >
                  <title>Absent: {absent} ({((aPct) * 100).toFixed(0)}%)</title>
                </circle>
              )}
            </g>

            {/* Center Count */}
            <text
              x={cx}
              y={cy - 2}
              textAnchor="middle"
              fill="#0B1A2D"
              fontSize="26px"
              fontWeight="800"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => onSelectCategory && onSelectCategory('total')}
            >
              {total}
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
              onClick={() => onSelectCategory && onSelectCategory('total')}
            >
              TOTAL STAFF
            </text>
          </svg>
        </div>

        {/* Legend Below Chart (Full Width, Tabular Aligned Columns) */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
          {/* Present */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              cursor: 'pointer',
              padding: '3px 8px',
              borderRadius: '6px',
              transition: 'background 0.15s ease'
            }}
            onClick={() => onSelectCategory && onSelectCategory('present')}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; setHoveredSegment('present'); }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; setHoveredSegment(null); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0E7490', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0B1A2D', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Present
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.80rem', fontWeight: 750, color: '#0B1A2D', minWidth: '32px', textAlign: 'right' }}>
                {((present / safeTotal) * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: '0.80rem', fontWeight: 500, color: '#64748B', minWidth: '18px', textAlign: 'right' }}>
                {present}
              </span>
            </div>
          </div>

          {/* Late */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              cursor: 'pointer',
              padding: '3px 8px',
              borderRadius: '6px',
              transition: 'background 0.15s ease'
            }}
            onClick={() => onSelectCategory && onSelectCategory('late')}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; setHoveredSegment('late'); }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; setHoveredSegment(null); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F59E0B', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0B1A2D', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Late
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.80rem', fontWeight: 750, color: '#0B1A2D', minWidth: '32px', textAlign: 'right' }}>
                {(((late || 0) / safeTotal) * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: '0.80rem', fontWeight: 500, color: '#64748B', minWidth: '18px', textAlign: 'right' }}>
                {late || 0}
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
              padding: '3px 8px',
              borderRadius: '6px',
              transition: 'background 0.15s ease'
            }}
            onClick={() => onOpenLeaves ? onOpenLeaves() : onSelectCategory && onSelectCategory('total')}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; setHoveredSegment('leave'); }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; setHoveredSegment(null); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F97316', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0B1A2D', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                On Leave
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.80rem', fontWeight: 750, color: '#0B1A2D', minWidth: '32px', textAlign: 'right' }}>
                {((leave / safeTotal) * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: '0.80rem', fontWeight: 500, color: '#64748B', minWidth: '18px', textAlign: 'right' }}>
                {leave}
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
              padding: '3px 8px',
              borderRadius: '6px',
              transition: 'background 0.15s ease'
            }}
            onClick={() => onSelectCategory && onSelectCategory('absent')}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; setHoveredSegment('absent'); }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; setHoveredSegment(null); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0B1A2D', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Absent
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.80rem', fontWeight: 750, color: '#0B1A2D', minWidth: '32px', textAlign: 'right' }}>
                {((absent / safeTotal) * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: '0.80rem', fontWeight: 500, color: '#64748B', minWidth: '18px', textAlign: 'right' }}>
                {absent}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
