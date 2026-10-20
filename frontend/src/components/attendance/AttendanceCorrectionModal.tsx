import React, { useState, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { AttendanceRecord } from '../../types/hrms';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { parseTimeToMinutes } from '../../services/attendanceCalculationEngine';
import { handleFormKeyDown, preventSpaceEnterPropagation } from '../../utils/keyboardUtils';
import { 
  X, 
  Clock, 
  Calendar, 
  User, 
  Building2, 
  Briefcase, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert, 
  HelpCircle,
  FileText,
  Timer,
  ChevronRight,
  Info
} from 'lucide-react';

interface AttendanceCorrectionModalProps {
  record: AttendanceRecord | null;
  onClose: () => void;
  onSuccess?: () => void;
}

type AttendanceCorrectionModalInnerProps = Omit<AttendanceCorrectionModalProps, 'record'> & {
  record: AttendanceRecord;
};

export const AttendanceCorrectionModal: React.FC<AttendanceCorrectionModalProps> = (props) => {
  if (!props.record) return null;
  return <AttendanceCorrectionModalInner {...props} record={props.record} />;
};

const AttendanceCorrectionModalInner: React.FC<AttendanceCorrectionModalInnerProps> = ({
  record,
  onClose,
  onSuccess
}) => {
  const { currentUser, correctAttendanceRecord, leavePolicies, shifts } = useHRMS();

  // Role authorization check (HR, HR Manager, CEO, Super Admin, Management, Manager)
  const isAuthorized = 
    currentUser.role === 'Super Admin' || 
    currentUser.role === 'CEO' || 
    currentUser.role === 'HR Manager' || 
    currentUser.role === 'HR Admin' || 
    currentUser.role === 'Management' ||
    currentUser.role === 'Manager' ||
    currentUser.role === 'Department Manager';

  // Resolve employee assigned shift & shift window
  const assignedShift = shifts.find(s => s.id === record.shiftId) ||
    shifts.find(s => s.shiftName.toLowerCase() === record.shiftName?.toLowerCase()) ||
    shifts.find(s => s.assignments?.some(a => (typeof a === 'string' ? a === record.employeeId : a.employeeId === record.employeeId))) ||
    shifts[0];
  const shiftStartTimeStr = assignedShift?.startTime || '09:00 AM';
  const shiftGraceMins = assignedShift?.gracePeriodMins ?? 15;

  // State management
  const [selectedStatus, setSelectedStatus] = useState<AttendanceRecord['status']>(
    record.status === 'Late' ? 'Present' : (record.status || 'Present')
  );
  const [checkInTime, setCheckInTime] = useState<string>(record.checkIn || '09:00 AM');
  const [checkOutTime, setCheckOutTime] = useState<string>(record.checkOut || '06:00 PM');
  const [breakDuration, setBreakDuration] = useState<number>(record.breakDurationMinutes || 45);

  const inMins = parseTimeToMinutes(checkInTime);
  const shiftMins = parseTimeToMinutes(shiftStartTimeStr) ?? 9 * 60;
  const isCurrentlyLate = inMins !== null && inMins > (shiftMins + shiftGraceMins);
  const lateMinutesDiff = inMins !== null && shiftMins !== null ? Math.max(0, inMins - shiftMins) : 0;

  // Status specific states
  const [halfDayType, setHalfDayType] = useState<'First Half' | 'Second Half'>(record.halfDayType || 'First Half');
  const [absentReason, setAbsentReason] = useState<'Unauthorized Absence' | 'No Show' | 'Attendance Not Recorded' | 'Other'>(
    record.absentReason || 'Attendance Not Recorded'
  );
  const [leaveType, setLeaveType] = useState<string>(record.leaveType || 'Casual Leave');
  const [leaveDuration, setLeaveDuration] = useState<'Full Day' | 'First Half' | 'Second Half'>(record.leaveDuration || 'Full Day');
  
  const [wfhReason, setWfhReason] = useState<string>(record.wfhReason || '');
  const [wfhSource, setWfhSource] = useState<'Approved WFH Request' | 'HR Assigned' | 'Manual'>(record.wfhSource || 'HR Assigned');

  // OT Management
  const [otHours, setOtHours] = useState<number>(record.otHours || 0);
  const [approvedOtHours, setApprovedOtHours] = useState<number>(record.approvedOtHours || 0);
  const [otStatus, setOtStatus] = useState<'Pending' | 'Approved' | 'Rejected' | 'Paid'>(record.otStatus || 'Pending');
  const [otReason, setOtReason] = useState<string>(record.otReason || '');

  // General Reason (Mandatory)
  const [reason, setReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Confirmation step modal
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Auto-calculate preview hours
  const calculatePreviewHours = () => {
    if (selectedStatus === 'Absent' || selectedStatus === 'Holiday' || selectedStatus === 'Week Off') return 0;
    if (selectedStatus === 'Half Day') return 4.0;
    if (selectedStatus === 'On Leave' || (selectedStatus as string) === 'Leave') {
      return (leaveDuration === 'First Half' || leaveDuration === 'Second Half') ? 4.0 : 0;
    }

    if (!checkInTime || !checkOutTime) return record.workingHours || 0;

    const parseTimeStr = (tStr: string) => {
      if (!tStr) return 0;
      const clean = tStr.trim();
      let h = 0, m = 0;
      if (clean.includes('AM') || clean.includes('PM')) {
        const [timePart, ampm] = clean.split(' ');
        const [hh, mm] = timePart.split(':').map(Number);
        h = ampm.toUpperCase() === 'PM' && hh < 12 ? hh + 12 : (ampm.toUpperCase() === 'AM' && hh === 12 ? 0 : hh);
        m = mm || 0;
      } else {
        const [hh, mm] = clean.split(':').map(Number);
        h = hh || 0;
        m = mm || 0;
      }
      return h * 60 + m;
    };

    const inMins = parseTimeStr(checkInTime);
    const outMins = parseTimeStr(checkOutTime);
    if (outMins < inMins) return 0;

    const netMins = Math.max(0, outMins - inMins - breakDuration);
    return Math.round((netMins / 60) * 10) / 10;
  };

  const previewHours = calculatePreviewHours();
  const calculatedOtPreview = previewHours > 8.0 ? Math.round((previewHours - 8.0) * 10) / 10 : 0;

  // Auto-update OT hours preview when hours change
  useEffect(() => {
    if (calculatedOtPreview > 0 && otHours === 0) {
      setOtHours(calculatedOtPreview);
    }
  }, [calculatedOtPreview]);

  const handleValidationAndProceed = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!reason.trim()) {
      setErrorMsg('Mandatory Reason Required: Please enter the justification for this attendance correction.');
      return;
    }

    if ((selectedStatus === 'Present' || selectedStatus === 'Late' || selectedStatus === 'Work From Home' || selectedStatus === 'Missing Punch') && checkInTime && checkOutTime) {
      const parseTimeStr = (tStr: string) => {
        const clean = tStr.trim();
        let h = 0, m = 0;
        if (clean.includes('AM') || clean.includes('PM')) {
          const [timePart, ampm] = clean.split(' ');
          const [hh, mm] = timePart.split(':').map(Number);
          h = ampm.toUpperCase() === 'PM' && hh < 12 ? hh + 12 : (ampm.toUpperCase() === 'AM' && hh === 12 ? 0 : hh);
          m = mm || 0;
        } else {
          const [hh, mm] = clean.split(':').map(Number);
          h = hh || 0;
          m = mm || 0;
        }
        return h * 60 + m;
      };

      if (parseTimeStr(checkOutTime) < parseTimeStr(checkInTime)) {
        setErrorMsg('Check-out time cannot be earlier than check-in time.');
        return;
      }
    }

    setShowConfirmation(true);
  };

  const handleConfirmSave = () => {
    setIsSubmitting(true);
    const actorInfo = `${currentUser.name} (${currentUser.role})`;

    // Automatically resolve whether target status is Present or Late based on effective Check-In time vs Shift
    let statusToSend = selectedStatus;
    if (statusToSend === 'Present' || statusToSend === 'Late') {
      statusToSend = isCurrentlyLate ? 'Late' : 'Present';
    }

    const result = correctAttendanceRecord({
      attendanceId: record.id,
      status: statusToSend,
      checkIn: selectedStatus === 'Absent' ? null : checkInTime,
      checkOut: selectedStatus === 'Absent' ? null : checkOutTime,
      breakDurationMinutes: breakDuration,
      halfDayType: selectedStatus === 'Half Day' ? halfDayType : undefined,
      absentReason: selectedStatus === 'Absent' ? absentReason : undefined,
      leaveType: selectedStatus === 'On Leave' || (selectedStatus as string) === 'Leave' ? leaveType : undefined,
      leaveDuration: selectedStatus === 'On Leave' || (selectedStatus as string) === 'Leave' ? leaveDuration : undefined,
      wfhReason: selectedStatus === 'Work From Home' ? wfhReason : undefined,
      wfhSource: selectedStatus === 'Work From Home' ? wfhSource : undefined,
      otHours: otHours,
      approvedOtHours: approvedOtHours,
      otStatus: otStatus,
      otReason: otReason,
      reason: reason,
      changedBy: actorInfo
    });

    setIsSubmitting(false);

    if (result.success) {
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setErrorMsg(result.message);
      setShowConfirmation(false);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div className="modal-content" style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '780px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid var(--color-border)'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#0E7490',
          color: '#FFFFFF',
          padding: '20px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Clock className="w-5 h-5" style={{ color: '#CFFAFE' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                Correct Attendance & Punch Override
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#CFFAFE', margin: '4px 0 0 0', opacity: 0.9 }}>
              Authorized HR / CEO Control Panel — Changes recalculate working hours, OT, and payroll in real-time.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              color: '#FFFFFF',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {!isAuthorized ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              backgroundColor: '#FEF2F2',
              borderRadius: '12px',
              border: '1px solid #FEE2E2'
            }}>
              <ShieldAlert className="w-12 h-12" style={{ color: '#EF4444', margin: '0 auto 12px auto' }} />
              <h3 style={{ color: '#991B1B', fontWeight: 700, margin: '0 0 8px 0' }}>Access Restricted</h3>
              <p style={{ color: '#7F1D1D', fontSize: '0.9rem', margin: 0 }}>
                Only authorized HR Managers, Department Managers, and CEO/Super Admins have permissions to directly perform attendance corrections.
              </p>
            </div>
          ) : (
            <form onSubmit={handleValidationAndProceed} onKeyDown={handleFormKeyDown}>
              {/* Employee & Record Information Card */}
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                padding: '16px 20px',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                    Employee
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                    {record.employeeName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#0E7490', fontWeight: 600 }}>
                    {record.employeeId}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                    Dept & Shift
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                    {record.department}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Shift: {record.shiftName || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                    Date & Current Status
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                    {formatDateDDMMYYYY(record.date)}
                  </div>
                  <span style={{
                    display: 'inline-block',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: record.status === 'Present' ? '#DCFCE7' : record.status === 'Absent' ? '#FEE2E2' : '#FEF3C7',
                    color: record.status === 'Present' ? '#15803D' : record.status === 'Absent' ? '#B91C1C' : '#B45309',
                    marginTop: '2px'
                  }}>
                    Current: {record.status}
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                    Current Check-In / Out
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                    In: {record.checkIn || 'Missing'} | Out: {record.checkOut || 'Missing'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Hours: {record.workingHours || 0} hrs
                  </div>
                </div>
              </div>

              {/* Error Message Alert */}
              {errorMsg && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '20px'
                }}>
                  <AlertCircle className="w-5 h-5" style={{ flexShrink: 0, color: '#EF4444' }} />
                  <div>{errorMsg}</div>
                </div>
              )}

              {/* 1. Status Selector Dropdown */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
                  Target Attendance Status <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as AttendanceRecord['status'])}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  <option value="Present">Present (Standard On-site Work / On Time)</option>
                  <option value="Late">Late (Late Arrival)</option>
                  <option value="Missing Punch">Missing Punch (Missing Check-In / Check-Out Correction)</option>
                  <option value="Half Day">Half Day (First Half / Second Half)</option>
                  <option value="Absent">Absent (Unauthorized / No Show)</option>
                  <option value="On Leave">Leave (Casual / Sick / Earned / Paid Leave)</option>
                  <option value="Work From Home">Work From Home (WFH)</option>
                  <option value="Holiday">Holiday</option>
                  <option value="Week Off">Week Off</option>
                </select>
              </div>

              {/* 2. DYNAMIC STATUS FIELDS */}

              {/* STATUS: PRESENT / LATE / WFH / MISSING PUNCH */}
              {(selectedStatus === 'Present' || selectedStatus === 'Late' || selectedStatus === 'Work From Home' || selectedStatus === 'Missing Punch') && (
                <div style={{
                  backgroundColor: '#F1F5F9',
                  borderRadius: '12px',
                  padding: '18px',
                  marginBottom: '20px',
                  border: '1px solid #E2E8F0'
                }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0E7490', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock className="w-4 h-4" /> Check-In / Check-Out Timings & Break
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                        Check-In Time
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 09:00 AM"
                        value={checkInTime}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCheckInTime(val);
                          const userInMins = parseTimeToMinutes(val);
                          if (userInMins !== null) {
                            const isLateNow = userInMins > (shiftMins + shiftGraceMins);
                            if (!isLateNow && selectedStatus === 'Late') {
                              setSelectedStatus('Present');
                            } else if (isLateNow && selectedStatus === 'Present') {
                              setSelectedStatus('Late');
                            }
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: isCurrentlyLate ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                          fontSize: '0.9rem',
                          color: '#1E293B',
                          backgroundColor: '#FFFFFF'
                        }}
                      />
                      {checkInTime && inMins !== null && (
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          marginTop: '5px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: isCurrentlyLate ? '#D97706' : '#16A34A'
                        }}>
                          {isCurrentlyLate ? (
                            <>
                              <AlertCircle size={13} style={{ color: '#D97706', flexShrink: 0 }} />
                              <span>Late: +{lateMinutesDiff}m (Shift starts {shiftStartTimeStr})</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={13} style={{ color: '#16A34A', flexShrink: 0 }} />
                              <span>On Time (Shift {shiftStartTimeStr})</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                        Check-Out Time
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 06:00 PM"
                        value={checkOutTime}
                        onChange={(e) => setCheckOutTime(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.9rem',
                          color: '#1E293B',
                          backgroundColor: '#FFFFFF'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                        Break Duration (mins)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="180"
                        value={breakDuration}
                        onChange={(e) => setBreakDuration(Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.9rem',
                          color: '#1E293B',
                          backgroundColor: '#FFFFFF'
                        }}
                      />
                    </div>
                  </div>

                  {/* Calculated Working Hours Preview */}
                  <div style={{
                    marginTop: '14px',
                    padding: '10px 14px',
                    backgroundColor: '#ECFEFF',
                    borderRadius: '8px',
                    border: '1px solid #A5F3FC',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.85rem'
                  }}>
                    <span style={{ color: '#0E7490', fontWeight: 600 }}>
                      Calculated Net Working Hours:
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0891B2' }}>
                      {previewHours} hrs
                    </span>
                  </div>

                  {/* WFH specific fields */}
                  {selectedStatus === 'Work From Home' && (
                    <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                          WFH Reason / Project Details
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Remote development sprint"
                          value={wfhReason}
                          onChange={(e) => setWfhReason(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                          WFH Source
                        </label>
                        <select
                          value={wfhSource}
                          onChange={(e) => setWfhSource(e.target.value as any)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.875rem'
                          }}
                        >
                          <option value="Approved WFH Request">Approved WFH Request</option>
                          <option value="HR Assigned">HR Assigned</option>
                          <option value="Manual">Manual Override</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STATUS: HALF DAY */}
              {selectedStatus === 'Half Day' && (
                <div style={{
                  backgroundColor: '#FFFBEB',
                  borderRadius: '12px',
                  padding: '18px',
                  marginBottom: '20px',
                  border: '1px solid #FDE68A'
                }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#B45309', margin: '0 0 14px 0' }}>
                    Half Day Configuration
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#78350F', marginBottom: '6px' }}>
                        Half Day Shift Type
                      </label>
                      <select
                        value={halfDayType}
                        onChange={(e) => setHalfDayType(e.target.value as any)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #FCD34D',
                          fontSize: '0.9rem',
                          fontWeight: 600
                        }}
                      >
                        <option value="First Half">First Half (Morning Session)</option>
                        <option value="Second Half">Second Half (Afternoon Session)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#78350F', marginBottom: '6px' }}>
                        Working Hours Fixed
                      </label>
                      <input
                        type="text"
                        disabled
                        value="4.0 Hours"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #FCD34D',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          backgroundColor: '#FEF3C7',
                          color: '#92400E'
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STATUS: ABSENT */}
              {selectedStatus === 'Absent' && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  borderRadius: '12px',
                  padding: '18px',
                  marginBottom: '20px',
                  border: '1px solid #FEE2E2'
                }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#B91C1C', margin: '0 0 14px 0' }}>
                    Absent Reason Category
                  </h4>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#991B1B', marginBottom: '6px' }}>
                      Primary Reason for Absence
                    </label>
                    <select
                      value={absentReason}
                      onChange={(e) => setAbsentReason(e.target.value as any)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #FCA5A5',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        backgroundColor: '#FFFFFF'
                      }}
                    >
                      <option value="Unauthorized Absence">Unauthorized Absence (Uninformed)</option>
                      <option value="No Show">No Show (Scheduled shift missed)</option>
                      <option value="Attendance Not Recorded">Attendance Not Recorded</option>
                      <option value="Other">Other / Personal Emergency</option>
                    </select>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#7F1D1D' }}>
                    * Note: Marking Absent sets Working Hours to 0 and OT to 0. LOP / salary deduction will be applied according to configured payroll policy.
                  </div>
                </div>
              )}

              {/* STATUS: LEAVE */}
              {(selectedStatus === 'On Leave' || (selectedStatus as string) === 'Leave') && (
                <div style={{
                  backgroundColor: '#F0FDF4',
                  borderRadius: '12px',
                  padding: '18px',
                  marginBottom: '20px',
                  border: '1px solid #BBF7D0'
                }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#15803D', margin: '0 0 14px 0' }}>
                    Leave Mapping Details
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#166534', marginBottom: '6px' }}>
                        Leave Type
                      </label>
                      <select
                        value={leaveType}
                        onChange={(e) => setLeaveType(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #86EFAC',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          backgroundColor: '#FFFFFF'
                        }}
                      >
                        <option value="Casual Leave">Casual Leave (CL)</option>
                        <option value="Sick Leave">Sick Leave (SL)</option>
                        <option value="Earned Leave">Earned Leave (EL)</option>
                        <option value="Paid Leave">Paid Leave (PL)</option>
                        <option value="Unpaid Leave">Unpaid Leave (LWP)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#166534', marginBottom: '6px' }}>
                        Leave Duration
                      </label>
                      <select
                        value={leaveDuration}
                        onChange={(e) => setLeaveDuration(e.target.value as any)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #86EFAC',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          backgroundColor: '#FFFFFF'
                        }}
                      >
                        <option value="Full Day">Full Day</option>
                        <option value="First Half">First Half</option>
                        <option value="Second Half">Second Half</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. OVERTIME (OT) SECTION (When applicable) */}
              {(selectedStatus === 'Present' || selectedStatus === 'Work From Home' || selectedStatus === 'Missing Punch') && (
                <div style={{
                  backgroundColor: '#FAF5FF',
                  borderRadius: '12px',
                  padding: '18px',
                  marginBottom: '20px',
                  border: '1px solid #E9D5FF'
                }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#7E22CE', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Timer className="w-4 h-4" /> Overtime (OT) Management
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B21A8', marginBottom: '4px' }}>
                        Calculated Extra Hours
                      </label>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#581C87', padding: '6px 0' }}>
                        {calculatedOtPreview} hrs
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B21A8', marginBottom: '4px' }}>
                        Approved OT Hours
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="12"
                        value={approvedOtHours}
                        onChange={(e) => setApprovedOtHours(Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid #D8B4FE',
                          fontSize: '0.875rem',
                          fontWeight: 700
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B21A8', marginBottom: '4px' }}>
                        OT Approval Status
                      </label>
                      <select
                        value={otStatus}
                        onChange={(e) => setOtStatus(e.target.value as any)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid #D8B4FE',
                          fontSize: '0.85rem',
                          fontWeight: 600
                        }}
                      >
                        <option value="Pending">Pending Review</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Paid">Paid in Payroll</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B21A8', marginBottom: '4px' }}>
                      OT Reason / Task Description
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Urgent machine maintenance or project deadline"
                      value={otReason}
                      onChange={(e) => setOtReason(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid #D8B4FE',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 4. MANDATORY REASON FIELD */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
                  Correction Reason / Justification <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this attendance status or punch is being manually modified by HR/CEO (e.g. Employee forgot to punch out at main gate terminal)..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={preventSpaceEnterPropagation}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.9rem',
                    color: '#1E293B',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  style={{ padding: '10px 20px', borderRadius: '10px', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    padding: '10px 24px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    backgroundColor: '#0E7490',
                    borderColor: '#0E7490',
                    color: '#FFFFFF'
                  }}
                >
                  Review & Save Correction →
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* CONFIRMATION DIALOG */}
      {showConfirmation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px 28px',
            maxWidth: '500px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: '#CFFAFE',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1E293B' }}>
                  Confirm Attendance Override
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  Immutable Audit Log Creation
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.5, marginBottom: '20px' }}>
              Are you sure you want to update this attendance record for <strong>{record.employeeName}</strong> on <strong>{formatDateDDMMYYYY(record.date)}</strong> to <strong>{selectedStatus}</strong>?
            </p>

            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '0.85rem',
              color: '#334155',
              border: '1px solid #E2E8F0',
              marginBottom: '20px'
            }}>
              <strong>Reason:</strong> "{reason}"
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmation(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 18px', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmSave}
                className="btn btn-primary"
                style={{
                  padding: '8px 22px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  backgroundColor: '#0E7490',
                  borderColor: '#0E7490',
                  color: '#FFFFFF'
                }}
              >
                {isSubmitting ? 'Saving...' : 'Confirm Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
