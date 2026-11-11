import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { AttendanceRecord } from '../../types/hrms';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  User, 
  Filter, 
  Info, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Edit3,
  X
} from 'lucide-react';
import { AttendanceCorrectionModal } from './AttendanceCorrectionModal';
import { formatDateDDMMYYYY, normalizeToYYYYMMDD } from '../../utils/dateUtils';

export const AttendanceCalendarView: React.FC = () => {
  const { employees, attendanceRecords, leaveRequests, currentUser } = useHRMS();
  
  const [selectedEmpId, setSelectedEmpId] = useState<string>(
    currentUser.role === 'Employee' ? (currentUser.employeeId || 'EMP-001') : 'EMP-001'
  );

  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
  const [selectedDayRecord, setSelectedDayRecord] = useState<AttendanceRecord | null>(null);
  const [correctionTargetRecord, setCorrectionTargetRecord] = useState<AttendanceRecord | null>(null);

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth(); // 0-indexed

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun

  const selectedEmployee = employees.find(e => e.employeeId === selectedEmpId) || employees[0];

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  // Helper to format YYYY-MM-DD
  const formatDayString = (dayNum: number) => {
    const mStr = String(month + 1).padStart(2, '0');
    const dStr = String(dayNum).padStart(2, '0');
    return `${year}-${mStr}-${dStr}`;
  };

  // Find attendance for given date & employee
  const getRecordForDate = (dayNum: number) => {
    const dateStr = formatDayString(dayNum);
    return attendanceRecords.find(a => (a.employeeId === selectedEmpId || (selectedEmployee?.id && a.employeeId === selectedEmployee.id)) && normalizeToYYYYMMDD(a.date) === dateStr);
  };

  // Status badge config matching Present, Paid Leave, Unpaid Leave, Absent, Holiday, WFH, Field Visit
  const getStatusBadge = (rec?: AttendanceRecord, dayNum?: number) => {
    const dateStr = dayNum ? formatDayString(dayNum) : (rec?.date || '');
    const approvedLeave = leaveRequests.find(l => {
      if (l.status !== 'Approved') return false;
      const matchEmp = l.employeeId === selectedEmpId || (selectedEmployee?.id && l.employeeId === selectedEmployee.id);
      if (!matchEmp) return false;
      const s = normalizeToYYYYMMDD(l.startDate) || l.startDate;
      const e = normalizeToYYYYMMDD(l.endDate) || l.endDate;
      return dateStr >= s && dateStr <= e;
    });

    if (approvedLeave) {
      const lType = (approvedLeave.leaveType || '').toLowerCase();
      if (lType.includes('wfh') || lType.includes('home') || lType.includes('wfo') || lType.includes('office')) {
        return { code: 'WFH', label: 'Work From Home', color: '#4338CA', bg: '#E0E7FF' };
      }
      if (lType.includes('field') || lType.includes('visit') || lType.includes('duty')) {
        return { code: 'FV', label: 'Field Visit', color: '#0E7490', bg: '#CFFAFE' };
      }
      const isUnpaid = lType.includes('unpaid') || lType.includes('lwp') || lType.includes('loss of pay') || (approvedLeave.paidDaysCount !== undefined && approvedLeave.paidDaysCount <= 0 && (approvedLeave.unpaidDaysCount || 0) > 0);
      if (isUnpaid) {
        return { code: 'UL', label: 'Unpaid Leave (LOP)', color: '#B45309', bg: '#FEF3C7' };
      }
      return { code: 'PL', label: 'Paid Leave', color: '#7E22CE', bg: '#F3E8FF' };
    }

    if (!rec) {
      // Default Sunday check -> Holiday
      const dateObj = new Date(year, month, dayNum || 1);
      const isSunday = dateObj.getDay() === 0;
      if (isSunday) return { code: 'H', label: 'Holiday', color: '#1E40AF', bg: '#DBEAFE' };
      return { code: 'A', label: 'Absent', color: '#B91C1C', bg: '#FEE2E2' };
    }

    const st = (rec.status || '').toLowerCase();
    if (st === 'absent') return { code: 'A', label: 'Absent', color: '#B91C1C', bg: '#FEE2E2' };
    if (st === 'on leave') return { code: 'PL', label: 'Paid Leave', color: '#7E22CE', bg: '#F3E8FF' };
    if (st.includes('wfo') || st.includes('office') || st.includes('wfh') || st.includes('home')) {
      return { code: 'WFH', label: 'Work From Home', color: '#4338CA', bg: '#E0E7FF' };
    }
    if (st.includes('duty') || st.includes('field') || st.includes('visit') || (rec.method || '').toLowerCase().includes('field')) {
      return { code: 'FV', label: 'Field Visit', color: '#0E7490', bg: '#CFFAFE' };
    }
    if (st === 'holiday' || st.includes('week off')) {
      return { code: 'H', label: 'Holiday', color: '#1E40AF', bg: '#DBEAFE' };
    }
    return { code: 'P', label: 'Present', color: '#15803D', bg: '#DCFCE7' };
  };

  const isHRorCEO = 
    currentUser.role === 'Super Admin' || 
    currentUser.role === 'CEO' || 
    currentUser.role === 'HR Manager' || 
    currentUser.role === 'HR Admin' || 
    currentUser.role === 'Management' ||
    currentUser.role === 'Manager' ||
    currentUser.role === 'Department Manager';

  return (
    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px' }}>
      {/* Calendar Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#1E293B' }}>
              Attendance Calendar Matrix
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
              Visual daily attendance badges & interactive date details
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Employee Selector for HR / CEO / Manager */}
          {isHRorCEO && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User className="w-4 h-4" style={{ color: '#64748B' }} />
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#1E293B',
                  backgroundColor: '#F8FAFC'
                }}
              >
                {employees.map(emp => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {emp.firstName} {emp.lastName} ({emp.employeeId}) - {emp.department}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Month / Year Navigator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#F1F5F9', padding: '4px 8px', borderRadius: '10px' }}>
            <button
              onClick={handlePrevMonth}
              style={{ border: 'none', background: 'transparent', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: '#334155' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', minWidth: '130px', textAlign: 'center' }}>
              {monthNames[month]} {year}
            </span>
            <button
              onClick={handleNextMonth}
              style={{ border: 'none', background: 'transparent', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: '#334155' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: '#F8FAFC',
        borderRadius: '12px',
        marginBottom: '20px',
        border: '1px solid #E2E8F0',
        fontSize: '0.75rem',
        fontWeight: 600
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>P</span> Present
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#F3E8FF', color: '#7E22CE', fontWeight: 800 }}>PL</span> Paid Leave
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 800 }}>UL</span> Unpaid Leave (LOP)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#FEE2E2', color: '#B91C1C', fontWeight: 800 }}>A</span> Absent (LOP)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#DBEAFE', color: '#1E40AF', fontWeight: 800 }}>H</span> Holiday
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#E0E7FF', color: '#4338CA', fontWeight: 800 }}>WFH</span> Work From Home
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#CFFAFE', color: '#0E7490', fontWeight: 800 }}>FV</span> Field Visit
        </span>
      </div>

      {/* Calendar Grid Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '8px', textAlign: 'center' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', padding: '6px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid Body */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
        {/* Blank cells for offset */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`blank-${i}`} style={{ height: '76px', backgroundColor: '#F8FAFC', borderRadius: '10px', opacity: 0.4 }} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const dayNum = idx + 1;
          const rec = getRecordForDate(dayNum);
          const badge = getStatusBadge(rec, dayNum);

          return (
            <div
              key={dayNum}
              onClick={() => {
                const dateStr = formatDayString(dayNum);
                const targetRec = rec || {
                  id: `TEMP-${Date.now()}`,
                  employeeId: selectedEmpId,
                  employeeName: selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : 'Employee',
                  department: selectedEmployee?.department || 'Operations',
                  date: dateStr,
                  checkIn: null,
                  checkOut: null,
                  workingHours: 0,
                  status: 'Absent' as const
                };
                setSelectedDayRecord(targetRec);
              }}
              style={{
                height: '76px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0E7490';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                {dayNum}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '6px',
                  backgroundColor: badge.bg,
                  color: badge.color
                }}>
                  {badge.code}
                </span>

                {rec?.workingHours ? (
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B' }}>
                    {rec.workingHours}h
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* DATE DETAIL POPUP MODAL */}
      {selectedDayRecord && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E293B' }}>
                Attendance Detail — {formatDateDDMMYYYY(selectedDayRecord.date)}
              </div>
              <button
                onClick={() => setSelectedDayRecord(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div style={{ backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                {selectedDayRecord.employeeName} ({selectedDayRecord.employeeId})
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '12px' }}>
                Dept: {selectedDayRecord.department}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#64748B' }}>Status:</span>{' '}
                  <strong style={{ color: '#0E7490' }}>{selectedDayRecord.status}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Working Hours:</span>{' '}
                  <strong>{selectedDayRecord.workingHours || 0} hrs</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Check-In:</span>{' '}
                  <strong>{selectedDayRecord.checkIn || 'Missing'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Check-Out:</span>{' '}
                  <strong>{selectedDayRecord.checkOut || 'Missing'}</strong>
                </div>
                {selectedDayRecord.otHours ? (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#64748B' }}>Overtime:</span>{' '}
                    <strong style={{ color: '#7E22CE' }}>{selectedDayRecord.otHours} hrs ({selectedDayRecord.otStatus || 'Pending'})</strong>
                  </div>
                ) : null}
              </div>

              {selectedDayRecord.reason && (
                <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#475569', fontStyle: 'italic', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                  Reason: "{selectedDayRecord.reason}"
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setSelectedDayRecord(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', borderRadius: '8px' }}
              >
                Close
              </button>

              {isHRorCEO && (
                <button
                  onClick={() => {
                    const target = selectedDayRecord;
                    setSelectedDayRecord(null);
                    setCorrectionTargetRecord(target);
                  }}
                  className="btn btn-primary"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    backgroundColor: '#0E7490',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Edit3 className="w-4 h-4" /> Correct Attendance
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CORRECTION MODAL TRIGGER */}
      {correctionTargetRecord && (
        <AttendanceCorrectionModal
          record={correctionTargetRecord}
          onClose={() => setCorrectionTargetRecord(null)}
        />
      )}
    </div>
  );
};
