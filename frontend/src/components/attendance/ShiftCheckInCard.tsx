import React, { useState, useEffect, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Clock, 
  LogIn, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Timer, 
  ArrowRight,
  ShieldCheck,
  Building,
  Info
} from 'lucide-react';
import { ShiftWindowEvaluation, formatShiftCountdown } from '../../services/shiftAttendanceEngine';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface ShiftCheckInCardProps {
  employeeId?: string;
  onOpenFaceAttendance?: () => void;
  compact?: boolean;
}

export const ShiftCheckInCard: React.FC<ShiftCheckInCardProps> = ({
  employeeId,
  onOpenFaceAttendance,
  compact = false
}) => {
  const { 
    currentUser, 
    getEmployeeShiftAttendanceState, 
    recordEmployeePunch,
    attendanceRecords 
  } = useHRMS();

  const targetEmpId = employeeId || currentUser.employeeId || currentUser.id || 'EMP-001';

  // State to force re-render every second for real-time countdown & status transitions
  const [ticker, setTicker] = useState<number>(0);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTicker(prev => prev + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Compute shift evaluation dynamically based on current time & records
  const shiftEval: ShiftWindowEvaluation = useMemo(() => {
    return getEmployeeShiftAttendanceState(targetEmpId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetEmpId, ticker, attendanceRecords]);

  // Handle punch click
  const handlePunch = async (type: 'Check-In' | 'Check-Out') => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = recordEmployeePunch(type, 'Manual Punch');
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || `Failed to record ${type}` });
    } finally {
      setActionLoading(false);
      // Auto-clear feedback after 5 seconds
      setTimeout(() => {
        setFeedback(null);
      }, 5000);
    }
  };

  // Status badge config
  const statusMeta = useMemo(() => {
    switch (shiftEval.state) {
      case 'CHECK_IN_AVAILABLE':
        return {
          label: 'Check In Available',
          bg: '#ECFDF5',
          text: '#047857',
          border: '#A7F3D0',
          dot: '#10B981',
          pulse: true
        };
      case 'CHECKED_IN':
        return {
          label: 'Shift In Progress',
          bg: '#ECFEFF',
          text: '#0E7490',
          border: '#A5F3FC',
          dot: '#06B6D4',
          pulse: true
        };
      case 'COMPLETED':
        return {
          label: 'Shift Completed',
          bg: '#F1F5F9',
          text: '#475569',
          border: '#CBD5E1',
          dot: '#64748B',
          pulse: false
        };
      case 'WAITING_FOR_NEXT_SHIFT':
        return {
          label: 'Waiting For Next Shift',
          bg: '#F5F3FF',
          text: '#6D28D9',
          border: '#DDD6FE',
          dot: '#8B5CF6',
          pulse: false
        };
      case 'UPCOMING':
      default:
        return {
          label: 'Upcoming Shift',
          bg: '#FFFBEB',
          text: '#B45309',
          border: '#FDE68A',
          dot: '#F59E0B',
          pulse: false
        };
    }
  }, [shiftEval.state]);

  // Format countdown string
  const countdownFormatted = useMemo(() => {
    const now = new Date();
    let target = shiftEval.earlyCheckInDateTime;
    if (shiftEval.state === 'WAITING_FOR_NEXT_SHIFT' || shiftEval.state === 'COMPLETED') {
      target = shiftEval.earlyCheckInDateTime;
    }
    const diffSecs = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
    return formatShiftCountdown(diffSecs);
  }, [shiftEval]);

  const isExecutiveCEO = currentUser.role === 'CEO' || currentUser.designation?.toLowerCase().includes('ceo');
  if (isExecutiveCEO) {
    return (
      <div 
        className="shift-checkin-card"
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1.5px solid #E7ECF3',
          padding: compact ? '16px' : '22px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Executive Attendance Status</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, backgroundColor: '#ECFEFF', color: '#0E7490', padding: '2px 8px', borderRadius: '99px', border: '1px solid #A5F3FC' }}>
                Exempt
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '3px' }}>
              As CEO / Head of Organization, you are exempt from shift check-in timers, face scans, and GPS punches.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="shift-checkin-card"
      style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        padding: compact ? '16px' : '22px 24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Top Accent Line */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: shiftEval.canCheckIn 
            ? 'linear-gradient(90deg, #10B981, #0E7490)' 
            : shiftEval.canCheckOut 
            ? 'linear-gradient(90deg, #0E7490, #F59E0B)' 
            : 'linear-gradient(90deg, #94A3B8, #CBD5E1)'
        }} 
      />

      {/* Header: Shift Title, Shift Date, and Status Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span 
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Clock size={12} color="#0E7490" />
              {shiftEval.assignedShift.shiftName}
            </span>
            {shiftEval.isNightShift && (
              <span 
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  background: '#1E293B',
                  color: '#F8FAFC',
                  padding: '2px 8px',
                  borderRadius: '9999px'
                }}
              >
                Night Shift (Overnight)
              </span>
            )}
          </div>
          <h3 
            style={{ 
              margin: 0, 
              fontSize: '18px', 
              fontWeight: 700, 
              color: '#1E293B',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {shiftEval.shiftTimingDisplay}
          </h3>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Calendar size={13} color="#94A3B8" />
            <span>Shift Date: <strong style={{ color: '#334155' }}>{formatDateDDMMYYYY(shiftEval.shiftDate)}</strong></span>
          </div>
        </div>

        {/* Dynamic Status Badge */}
        <div 
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '9999px',
            background: statusMeta.bg,
            border: `1px solid ${statusMeta.border}`,
            color: statusMeta.text,
            fontSize: '12px',
            fontWeight: 700,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
          }}
        >
          <span 
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusMeta.dot,
              display: 'inline-block',
              boxShadow: statusMeta.pulse ? `0 0 0 2px ${statusMeta.border}` : 'none'
            }}
          />
          {statusMeta.label}
        </div>
      </div>

      {/* 3-Hour Check-In Window Visual Timeline */}
      <div 
        style={{
          background: '#F8FAFC',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
          <span style={{ color: '#475569', fontWeight: 600 }}>Shift Window Rules</span>
          <span style={{ color: '#0E7490', fontWeight: 700 }}>
            3-Hour Early Check-In Active
          </span>
        </div>

        {/* Stepper / Timeline */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
            position: 'relative'
          }}
        >
          {/* Step 1: 3-Hour Early Window */}
          <div 
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              background: shiftEval.canCheckIn || shiftEval.state === 'CHECKED_IN' || shiftEval.state === 'COMPLETED' ? '#ECFDF5' : '#FFFFFF',
              border: `1px solid ${shiftEval.canCheckIn ? '#10B981' : '#E2E8F0'}`,
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748B', fontWeight: 700 }}>
              Early Check-In (-3h)
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: shiftEval.canCheckIn ? '#047857' : '#1E293B', marginTop: '2px' }}>
              {shiftEval.availabilityDisplay.replace('Check In available from ', '')}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
              Window Opens
            </div>
          </div>

          {/* Step 2: Shift Start */}
          <div 
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              background: shiftEval.state === 'CHECKED_IN' ? '#ECFEFF' : '#FFFFFF',
              border: `1px solid ${shiftEval.state === 'CHECKED_IN' ? '#0E7490' : '#E2E8F0'}`,
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748B', fontWeight: 700 }}>
              Official Start
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
              {shiftEval.shiftStartDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
              Grace: {shiftEval.assignedShift.gracePeriodMins} mins
            </div>
          </div>

          {/* Step 3: Shift End */}
          <div 
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              background: shiftEval.state === 'COMPLETED' || shiftEval.state === 'WAITING_FOR_NEXT_SHIFT' ? '#F1F5F9' : '#FFFFFF',
              border: `1px solid ${shiftEval.state === 'COMPLETED' ? '#64748B' : '#E2E8F0'}`,
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748B', fontWeight: 700 }}>
              Shift Close
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
              {shiftEval.shiftEndDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
              Checkout
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Status / Countdown Notice Banner */}
      <div 
        style={{
          borderRadius: '10px',
          padding: '12px 14px',
          background: shiftEval.canCheckIn 
            ? '#F0FDF4' 
            : shiftEval.canCheckOut 
            ? '#F0F9FF' 
            : shiftEval.state === 'WAITING_FOR_NEXT_SHIFT' || shiftEval.state === 'COMPLETED'
            ? '#F8FAFC'
            : '#FFFBEB',
          border: `1px solid ${
            shiftEval.canCheckIn 
              ? '#BBF7D0' 
              : shiftEval.canCheckOut 
              ? '#BAE6FD' 
              : shiftEval.state === 'WAITING_FOR_NEXT_SHIFT' || shiftEval.state === 'COMPLETED'
              ? '#E2E8F0'
              : '#FDE68A'
          }`,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        {shiftEval.canCheckIn ? (
          <CheckCircle2 size={18} color="#15803D" style={{ flexShrink: 0 }} />
        ) : shiftEval.canCheckOut ? (
          <ShieldCheck size={18} color="#0369A1" style={{ flexShrink: 0 }} />
        ) : shiftEval.state === 'WAITING_FOR_NEXT_SHIFT' || shiftEval.state === 'COMPLETED' ? (
          <Info size={18} color="#64748B" style={{ flexShrink: 0 }} />
        ) : (
          <Timer size={18} color="#D97706" style={{ flexShrink: 0 }} />
        )}

        <div style={{ flex: 1 }}>
          <div 
            style={{ 
              fontSize: '13px', 
              fontWeight: 600, 
              color: shiftEval.canCheckIn 
                ? '#166534' 
                : shiftEval.canCheckOut 
                ? '#075985' 
                : shiftEval.state === 'WAITING_FOR_NEXT_SHIFT' || shiftEval.state === 'COMPLETED'
                ? '#334155'
                : '#92400E' 
            }}
          >
            {shiftEval.message}
          </div>

          {(shiftEval.state === 'UPCOMING' || shiftEval.state === 'WAITING_FOR_NEXT_SHIFT') && (
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Check-In Window Opens In:</span>
              <strong 
                style={{ 
                  color: '#0E7490', 
                  fontFamily: 'monospace', 
                  fontSize: '13px',
                  background: '#FFFFFF',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  border: '1px solid #CBD5E1'
                }}
              >
                {countdownFormatted}
              </strong>
            </div>
          )}
        </div>
      </div>

      {/* Inline Feedback Toast */}
      {feedback && (
        <div 
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: feedback.type === 'success' ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${feedback.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
            color: feedback.type === 'success' ? '#065F46' : '#991B1B'
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Action Buttons: Check-In and Check-Out */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '2px' }}>
        {/* CHECK IN BUTTON */}
        <button
          type="button"
          onClick={() => handlePunch('Check-In')}
          disabled={!shiftEval.canCheckIn || actionLoading}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 18px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: shiftEval.canCheckIn && !actionLoading ? 'pointer' : 'not-allowed',
            border: 'none',
            background: shiftEval.canCheckIn ? '#0E7490' : '#E2E8F0',
            color: shiftEval.canCheckIn ? '#FFFFFF' : '#94A3B8',
            transition: 'all 0.2s ease',
            boxShadow: shiftEval.canCheckIn ? '0 2px 4px rgba(14, 116, 144, 0.2)' : 'none'
          }}
          title={
            shiftEval.canCheckIn 
              ? 'Click to Check In' 
              : shiftEval.state === 'UPCOMING'
              ? `Check In disabled until ${shiftEval.earlyCheckInDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : shiftEval.state === 'CHECKED_IN'
              ? 'Already Checked In for this shift'
              : 'Shift completed. Check In disabled.'
          }
        >
          <LogIn size={16} />
          <span>{actionLoading ? 'Recording...' : 'Check In'}</span>
        </button>

        {/* CHECK OUT BUTTON */}
        <button
          type="button"
          onClick={() => handlePunch('Check-Out')}
          disabled={!shiftEval.canCheckOut || actionLoading}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 18px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: shiftEval.canCheckOut && !actionLoading ? 'pointer' : 'not-allowed',
            border: shiftEval.canCheckOut ? '1px solid #EA580C' : '1px solid #E2E8F0',
            background: shiftEval.canCheckOut ? '#FFF7ED' : '#F8FAFC',
            color: shiftEval.canCheckOut ? '#C2410C' : '#94A3B8',
            transition: 'all 0.2s ease'
          }}
          title={
            shiftEval.canCheckOut
              ? 'Click to Check Out and complete your shift'
              : 'Check Out only available after checking in'
          }
        >
          <LogOut size={16} />
          <span>Check Out</span>
        </button>
      </div>

      {/* Footer / Face Attendance Link */}
      {onOpenFaceAttendance && (
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderTop: '1px solid #F1F5F9',
            paddingTop: '12px',
            fontSize: '12px',
            color: '#64748B'
          }}
        >
          <span>Prefer biometric verification?</span>
          <button
            type="button"
            onClick={onOpenFaceAttendance}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#0E7490',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              borderRadius: '6px'
            }}
          >
            <span>Open Face Scan</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
};
