import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  UserCheck,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  Info,
  Timer,
  Building2,
  AlertTriangle
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { AttendanceRecord } from '../../types/hrms';
import { DateInput } from '../common/DateInput';
import { parseTimeToMinutes } from '../../services/attendanceCalculationEngine';
import { resolveEffectiveLatePolicy } from '../../services/policyEngine';
import { handleFormKeyDown, preventSpaceEnterPropagation } from '../../utils/keyboardUtils';

interface ManualAttendanceEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
  defaultEmployeeId?: string;
}

export const ManualAttendanceEntryModal: React.FC<ManualAttendanceEntryModalProps> = ({
  isOpen,
  onClose,
  defaultDate,
  defaultEmployeeId
}) => {
  const {
    employees,
    attendanceRecords,
    addManualAttendanceRecord,
    currentUser,
    shifts,
    masterAttendancePolicies
  } = useHRMS();

  const [selectedEmpId, setSelectedEmpId] = useState<string>(
    defaultEmployeeId || employees[0]?.id || ''
  );
  const [date, setDate] = useState<string>(
    defaultDate || new Date().toISOString().split('T')[0]
  );
  const [status, setStatus] = useState<AttendanceRecord['status']>('Present');
  const [halfDayType, setHalfDayType] = useState<'First Half' | 'Second Half'>('First Half');
  
  const [checkInTime, setCheckInTime] = useState<string>('09:00 AM');
  const [checkOutTime, setCheckOutTime] = useState<string>('06:00 PM');
  const [isMissedCheckIn, setIsMissedCheckIn] = useState<boolean>(false);
  const [isMissedCheckOut, setIsMissedCheckOut] = useState<boolean>(false);
  
  const [breakDuration, setBreakDuration] = useState<number>(45);
  const [otHours, setOtHours] = useState<number>(0);
  const [reason, setReason] = useState<string>('Missed punch-out: Employee forgot before leaving');
  
  const [error, setError] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Look up selected employee details
  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmpId || e.employeeId === selectedEmpId);
  }, [employees, selectedEmpId]);

  // Look up existing record for this employee and date
  const existingRecord = useMemo(() => {
    if (!selectedEmpId || !date) return null;
    return attendanceRecords.find(
      r => (r.employeeId === selectedEmpId || r.employeeId === selectedEmployee?.employeeId) && r.date === date
    ) || null;
  }, [attendanceRecords, selectedEmpId, selectedEmployee, date]);

  // Resolve employee assigned shift & shift window
  const assignedShift = useMemo(() => {
    if (!selectedEmployee) return shifts[0];
    const empId = selectedEmployee.id;
    const empCode = selectedEmployee.employeeId;
    const empWorkShift = selectedEmployee.workShift;
    return (
      shifts.find(s => s.id === existingRecord?.shiftId) ||
      shifts.find(s => s.shiftName?.toLowerCase() === existingRecord?.shiftName?.toLowerCase()) ||
      (empWorkShift ? shifts.find(s => s.id === empWorkShift || s.shiftName?.toLowerCase() === empWorkShift.toLowerCase()) : null) ||
      shifts.find(s => s.assignments?.some(a => (typeof a === 'string' ? (a === empId || a === empCode) : (a.employeeId === empId || a.employeeId === empCode)))) ||
      shifts[0]
    );
  }, [shifts, selectedEmployee, existingRecord]);

  // Resolve applicable late policy for the selected employee and shift
  const effectiveLatePolicy = useMemo(() => {
    if (!selectedEmployee) return null;
    return resolveEffectiveLatePolicy(
      selectedEmployee,
      masterAttendancePolicies || [],
      assignedShift?.id,
      assignedShift?.shiftName
    ).policy;
  }, [selectedEmployee, masterAttendancePolicies, assignedShift]);

  const shiftStartTimeStr = assignedShift?.startTime || '09:00 AM';
  // Late policy grace period takes precedence over shift grace
  const effectiveGraceMins = (
    effectiveLatePolicy?.graceTimeMinutes ??
    effectiveLatePolicy?.gracePeriodMinutes ??
    15
  );

  const inMins = parseTimeToMinutes(checkInTime);
  const shiftMins = parseTimeToMinutes(shiftStartTimeStr) ?? (9 * 60);
  const isCurrentlyLate = inMins !== null && shiftMins !== null && inMins > (shiftMins + effectiveGraceMins);
  const lateMinutesDiff = inMins !== null && shiftMins !== null ? Math.max(0, inMins - shiftMins) : 0;

  // Sync state when existing record or defaults change
  useEffect(() => {
    if (existingRecord) {
      // Normalize 'Late' to 'Present' so HR can edit timing without getting locked into Late
      setStatus(existingRecord.status === 'Late' ? 'Present' : (existingRecord.status || 'Present'));
      if (existingRecord.checkIn) {
        setCheckInTime(existingRecord.checkIn);
        setIsMissedCheckIn(false);
      } else {
        setIsMissedCheckIn(true);
      }
      if (existingRecord.checkOut) {
        setCheckOutTime(existingRecord.checkOut);
        setIsMissedCheckOut(false);
      } else {
        setIsMissedCheckOut(true);
      }
      if (existingRecord.otHours) {
        setOtHours(existingRecord.otHours);
      }
      if (existingRecord.breakDurationMinutes) {
        setBreakDuration(existingRecord.breakDurationMinutes);
      }
    } else {
      // Default to employee's shift start time if available
      setCheckInTime(shiftStartTimeStr || '09:00 AM');
      setCheckOutTime('06:00 PM');
      setIsMissedCheckIn(false);
      setIsMissedCheckOut(false);
      setOtHours(0);
      setStatus('Present');
    }
  }, [existingRecord, date, selectedEmpId, shiftStartTimeStr]);

  if (!isOpen) return null;

  // Real-time calculation of working hours
  const calculateWorkingHours = (): number => {
    if (status === 'Absent' || status === 'Holiday' || status === 'Week Off') return 0;
    if (status === 'Half Day') return 4.0;
    if (status === 'On Leave') return 0;

    if (isMissedCheckIn || isMissedCheckOut || !checkInTime || !checkOutTime) {
      return 0;
    }

    const parseTime = (timeStr: string) => {
      if (!timeStr) return null;
      const clean = timeStr.trim();
      let hours = 0;
      let mins = 0;
      if (clean.includes('AM') || clean.includes('PM')) {
        const [timePart, ampm] = clean.split(' ');
        const [hh, mm] = timePart.split(':').map(Number);
        hours = ampm.toUpperCase() === 'PM' && hh < 12 ? hh + 12 : (ampm.toUpperCase() === 'AM' && hh === 12 ? 0 : hh);
        mins = mm || 0;
      } else {
        const [hh, mm] = clean.split(':').map(Number);
        hours = hh || 0;
        mins = mm || 0;
      }
      return hours * 60 + mins;
    };

    const inMins = parseTime(checkInTime);
    const outMins = parseTime(checkOutTime);

    if (inMins === null || outMins === null) return 8.0;
    if (outMins < inMins) return 8.0;

    const netMins = Math.max(0, outMins - inMins - (breakDuration || 0));
    return Math.round((netMins / 60) * 10) / 10;
  };

  const calculatedHours = calculateWorkingHours();

  const QUICK_REASONS = [
    'Missed punch-out: Employee forgot before leaving premises',
    'Missed punch-in: Biometric terminal offline / network glitch',
    'On-site emergency plant inspection & fieldwork',
    'Off-site client deployment authorized by Management',
    'Card reader unreadable / scanner fail regularization'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedEmpId) {
      setError('Please select an employee.');
      return;
    }

    if (!date) {
      setError('Please select an attendance date.');
      return;
    }

    if (!reason.trim()) {
      setError('Administrative authorization reason is mandatory.');
      return;
    }

    const finalCheckIn = isMissedCheckIn ? null : checkInTime;
    const finalCheckOut = isMissedCheckOut ? null : checkOutTime;

    // Dynamically evaluate punctuality status
    let statusToSend = status;
    if (status === 'Present' || status === 'Late') {
      if (!isMissedCheckIn && checkInTime) {
        statusToSend = isCurrentlyLate ? 'Late' : 'Present';
      }
    }

    const addedBy = `${currentUser?.name} (${currentUser?.role})`;

    const res = addManualAttendanceRecord({
      employeeId: selectedEmpId,
      date,
      status: statusToSend,
      checkIn: finalCheckIn,
      checkOut: finalCheckOut,
      breakDurationMinutes: breakDuration,
      workingHours: calculatedHours,
      halfDayType: status === 'Half Day' ? halfDayType : undefined,
      otHours: otHours > 0 ? otHours : undefined,
      reason,
      addedBy
    });

    if (res.success) {
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1200);
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '580px',
          width: '92%',
          borderRadius: '18px',
          overflow: 'hidden',
          backgroundColor: '#FFFFFF',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
          border: '1px solid #E2E8F0'
        }}
      >
        {/* Modal Header */}
        <div
          className="modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <UserCheck size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Manual Attendance Entry
                </h2>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                Record or regularize missed check-in & check-out with executive authority
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="close-btn"
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
          <div
            className="modal-body"
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: 'calc(85vh - 140px)',
              overflowY: 'auto'
            }}
          >
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#B91C1C',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {isSuccess && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  color: '#059669',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <CheckCircle2 size={16} color="#059669" style={{ flexShrink: 0 }} />
                <span>Attendance record successfully saved and audit log generated!</span>
              </div>
            )}

            {/* Existing Record Indicator Banner */}
            {existingRecord && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0 }} />
                <div>
                  <strong>Existing log found:</strong> Currently marked as{' '}
                  <span style={{ fontWeight: 700 }}>{existingRecord.status}</span> (In:{' '}
                  {existingRecord.checkIn || 'Missing'}, Out: {existingRecord.checkOut || 'Missing'}).
                  Submitting will update and regularize this entry.
                </div>
              </div>
            )}

            {/* Employee Selection */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#1E293B',
                  marginBottom: '6px'
                }}
              >
                Select Employee <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                value={selectedEmpId}
                onChange={e => setSelectedEmpId(e.target.value)}
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  color: '#1E293B',
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeId}) — {emp.department}
                  </option>
                ))}
              </select>
            </div>

            {/* Date & Status Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#1E293B',
                    marginBottom: '6px'
                  }}
                >
                  Attendance Date <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <DateInput
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#1E293B',
                    marginBottom: '6px'
                  }}
                >
                  Attendance Status <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as AttendanceRecord['status'])}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="Present">Present (Full Day)</option>
                  <option value="Late">Late (Late Arrival)</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Absent">Absent (LOP)</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Work From Home">Work From Home</option>
                </select>
              </div>
            </div>

            {/* Half Day Type (if Half Day selected) */}
            {status === 'Half Day' && (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B' }}>
                  Half Day Session:
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="halfDayType"
                    checked={halfDayType === 'First Half'}
                    onChange={() => setHalfDayType('First Half')}
                  />
                  <span>First Half (Morning)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="halfDayType"
                    checked={halfDayType === 'Second Half'}
                    onChange={() => setHalfDayType('Second Half')}
                  />
                  <span>Second Half (Afternoon)</span>
                </label>
              </div>
            )}

            {/* Check-In & Check-Out Times (if status is Present or Late or Half Day or WFH) */}
            {status !== 'Absent' && status !== 'On Leave' && (
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={15} color="#0E7490" />
                    Punch Timings (In / Out Regularization)
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    Check boxes if punch was missed
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {/* Check In */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B' }}>
                        Check-In Time
                      </label>
                      <label style={{ fontSize: '0.74rem', color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isMissedCheckIn}
                          onChange={e => setIsMissedCheckIn(e.target.checked)}
                        />
                        <span>Missed In</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      disabled={isMissedCheckIn}
                      value={isMissedCheckIn ? 'Missed / Absent' : checkInTime}
                      onChange={e => {
                        const val = e.target.value;
                        setCheckInTime(val);
                        const tMins = parseTimeToMinutes(val);
                        if (tMins !== null && shiftMins !== null) {
                          if (tMins > (shiftMins + effectiveGraceMins)) {
                            setStatus('Late');
                          } else if (status === 'Late') {
                            setStatus('Present');
                          }
                        }
                      }}
                      placeholder="e.g. 09:00 AM"
                      style={{
                        width: '100%',
                        height: '40px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.86rem',
                        fontWeight: 700,
                        color: isMissedCheckIn ? '#94A3B8' : '#0F172A',
                        backgroundColor: isMissedCheckIn ? '#F1F5F9' : '#FFFFFF',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {!isMissedCheckIn && (
                      <>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                          {Array.from(new Set([shiftStartTimeStr, '09:00 AM', '09:30 AM', '10:00 AM'])).filter(Boolean).map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                setCheckInTime(t);
                                const tMins = parseTimeToMinutes(t);
                                if (tMins !== null && shiftMins !== null) {
                                  if (tMins > (shiftMins + effectiveGraceMins)) {
                                    setStatus('Late');
                                  } else if (status === 'Late') {
                                    setStatus('Present');
                                  }
                                }
                              }}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: checkInTime === t ? '#ECFEFF' : '#FFFFFF',
                                color: checkInTime === t ? '#0E7490' : '#64748B',
                                border: checkInTime === t ? '1px solid #0E7490' : '1px solid #CBD5E1',
                                cursor: 'pointer'
                              }}
                            >
                              {t} {t === shiftStartTimeStr ? '(Shift)' : ''}
                            </button>
                          ))}
                        </div>
                        {checkInTime && (
                          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                            {isCurrentlyLate ? (
                              <span style={{ color: '#D97706', display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: '6px' }}>
                                ⚠️ Late Arrival (+{lateMinutesDiff}m) — Shift starts at {shiftStartTimeStr} ({effectiveGraceMins}m grace from Late Policy)
                              </span>
                            ) : (
                              <span style={{ color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#ECFDF5', padding: '2px 8px', borderRadius: '6px' }}>
                                🟢 On Time — Shift starts at {shiftStartTimeStr} ({effectiveGraceMins}m grace from Late Policy)
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Check Out */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B' }}>
                        Check-Out Time
                      </label>
                      <label style={{ fontSize: '0.74rem', color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isMissedCheckOut}
                          onChange={e => setIsMissedCheckOut(e.target.checked)}
                        />
                        <span>Missed Out</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      disabled={isMissedCheckOut}
                      value={isMissedCheckOut ? 'Missed / None' : checkOutTime}
                      onChange={e => setCheckOutTime(e.target.value)}
                      placeholder="e.g. 06:00 PM"
                      style={{
                        width: '100%',
                        height: '40px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.86rem',
                        fontWeight: 700,
                        color: isMissedCheckOut ? '#94A3B8' : '#0F172A',
                        backgroundColor: isMissedCheckOut ? '#F1F5F9' : '#FFFFFF',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {!isMissedCheckOut && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        {['06:00 PM', '06:30 PM', '07:30 PM'].map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setCheckOutTime(t)}
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: checkOutTime === t ? '#ECFEFF' : '#FFFFFF',
                              color: checkOutTime === t ? '#0E7490' : '#64748B',
                              border: '1px solid #CBD5E1',
                              cursor: 'pointer'
                            }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Break & OT Inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', paddingTop: '6px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Break Duration (Minutes)
                    </label>
                    <input
                      type="number"
                      step="5"
                      min="0"
                      max="120"
                      value={breakDuration}
                      onChange={e => setBreakDuration(parseInt(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.84rem',
                        backgroundColor: '#FFFFFF',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Approved OT Hours (Optional)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="12"
                      value={otHours}
                      onChange={e => setOtHours(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        color: otHours > 0 ? '#0E7490' : '#0F172A',
                        backgroundColor: '#FFFFFF',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Reason / Administrative Justification */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#1E293B',
                  marginBottom: '6px'
                }}
              >
                Reason / Executive Authorization <span style={{ color: '#EF4444' }}>*</span>
              </label>

              {/* Quick Reason Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {QUICK_REASONS.map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setReason(q)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: reason === q ? '#E0F2FE' : '#F1F5F9',
                      color: reason === q ? '#0369A1' : '#475569',
                      border: '1px solid transparent',
                      cursor: 'pointer'
                    }}
                  >
                    {q.split(':')[0]}
                  </button>
                ))}
              </div>

              <textarea
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                onKeyDown={preventSpaceEnterPropagation}
                placeholder="Provide detailed justification for manual entry or punch regularization..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem',
                  color: '#1E293B',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div
            className="modal-footer"
            style={{
              padding: '14px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              backgroundColor: '#F8FAFC'
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                padding: '8px 20px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 700,
                backgroundColor: '#0E7490',
                borderColor: '#0E7490',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)'
              }}
            >
              <UserCheck size={15} strokeWidth={2.5} />
              <span>Save Attendance Record</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
