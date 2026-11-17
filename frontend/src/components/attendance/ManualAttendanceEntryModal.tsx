import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Search,
  Check,
  ChevronDown
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { AttendanceRecord } from '../../types/hrms';
import { isAttendanceExemptEmployee } from '../../data/hrmsInitialData';
import { DateInput } from '../common/DateInput';
import { parseTimeToMinutes } from '../../services/attendanceCalculationEngine';
import { resolveEffectiveLatePolicy } from '../../services/policyEngine';
import { resolveEmployeeAssignedShift } from '../../services/shiftAttendanceEngine';
import { handleFormKeyDown, preventSpaceEnterPropagation } from '../../utils/keyboardUtils';

export const format24to12 = (time24: string): string => {
  if (!time24) return '';
  const parts = time24.trim().split(':');
  if (parts.length < 2) return '';
  let hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  const meridiem = hh >= 12 ? 'PM' : 'AM';
  if (hh === 0) hh = 12;
  else if (hh > 12) hh -= 12;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${meridiem}`;
};

export const isValidTimeInput = (raw: string): boolean => {
  if (!raw || !raw.trim()) return false;
  const clean = raw.trim().replace(/\./g, ':');
  // Standard HH:MM [AM/PM] or H:MM [AM/PM]
  const match = clean.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?\s*(AM|PM|A|P)?$/i);
  if (match) {
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    const mer = match[3]?.toUpperCase();
    if (isNaN(hh) || isNaN(mm) || mm < 0 || mm > 59) return false;
    if (mer) {
      return hh >= 1 && hh <= 12;
    }
    return hh >= 0 && hh <= 23;
  }
  // Compact 3 or 4 digit shorthand e.g. "919a", "0919am", "620p"
  const compact = clean.match(/^(\d{1,2})(\d{2})\s*(AM|PM|A|P)$/i);
  if (compact) {
    const hh = parseInt(compact[1], 10);
    const mm = parseInt(compact[2], 10);
    return hh >= 1 && hh <= 12 && mm >= 0 && mm <= 59;
  }
  return false;
};

export const normalizeTimeString = (raw: string): string => {
  if (!raw || !raw.trim()) return '';
  const clean = raw.trim().replace(/\./g, ':');
  const match = clean.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?\s*(AM|PM|A|P)?$/i);
  if (match) {
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    const merRaw = match[3]?.toUpperCase();
    if (isNaN(hh) || isNaN(mm) || mm < 0 || mm > 59) return '';
    if (merRaw) {
      if (hh < 1 || hh > 12) return '';
      const meridiem = merRaw.startsWith('P') ? 'PM' : 'AM';
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${meridiem}`;
    }
    if (hh < 0 || hh > 23) return '';
    return format24to12(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  const compact = clean.match(/^(\d{1,2})(\d{2})\s*(AM|PM|A|P)$/i);
  if (compact) {
    const hh = parseInt(compact[1], 10);
    const mm = parseInt(compact[2], 10);
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return '';
    const meridiem = compact[3].toUpperCase().startsWith('P') ? 'PM' : 'AM';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${meridiem}`;
  }
  return '';
};

export const format12to24 = (time12: string): string => {
  const norm = normalizeTimeString(time12);
  if (!norm) return '09:00';
  const match = norm.match(/^(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '09:00';
  let hh = parseInt(match[1], 10);
  const mm = match[2];
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hh < 12) hh += 12;
  if (meridiem === 'AM' && hh === 12) hh = 0;
  return `${String(hh).padStart(2, '0')}:${mm}`;
};

export type PunchStatusBadgeType = 'On Time' | 'Late' | 'Early' | 'Not Calculated';

export const evaluatePunchCheckInStatus = (params: {
  checkInTime: string;
  isMissedCheckIn: boolean;
  shiftStartTimeStr: string;
  effectiveGraceMins: number;
  isExempt?: boolean;
}): {
  badge: PunchStatusBadgeType;
  isLate: boolean;
  lateMinutes: number;
  earlyMinutes: number;
} => {
  const { checkInTime, isMissedCheckIn, shiftStartTimeStr, effectiveGraceMins, isExempt } = params;
  if (isMissedCheckIn || !checkInTime || !isValidTimeInput(checkInTime)) {
    return { badge: 'Not Calculated', isLate: false, lateMinutes: 0, earlyMinutes: 0 };
  }
  const normalizedIn = normalizeTimeString(checkInTime);
  const normalizedShift = normalizeTimeString(shiftStartTimeStr) || shiftStartTimeStr;
  const inMins = parseTimeToMinutes(normalizedIn);
  const shiftMins = parseTimeToMinutes(normalizedShift) ?? 9 * 60;
  if (inMins === null || shiftMins === null) {
    return { badge: 'Not Calculated', isLate: false, lateMinutes: 0, earlyMinutes: 0 };
  }
  if (isExempt) {
    return { badge: 'On Time', isLate: false, lateMinutes: 0, earlyMinutes: 0 };
  }
  let diff = inMins - shiftMins;
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;

  if (diff > effectiveGraceMins) {
    return { badge: 'Late', isLate: true, lateMinutes: diff, earlyMinutes: 0 };
  }
  if (diff < 0) {
    return { badge: 'Early', isLate: false, lateMinutes: 0, earlyMinutes: Math.abs(diff) };
  }
  return { badge: 'On Time', isLate: false, lateMinutes: 0, earlyMinutes: 0 };
};

export const calculateNetWorkingHours = (params: {
  status: AttendanceRecord['status'];
  checkInTime: string;
  checkOutTime: string;
  isMissedCheckIn: boolean;
  isMissedCheckOut: boolean;
  breakDurationMinutes: number;
}): number => {
  const { status, checkInTime, checkOutTime, isMissedCheckIn, isMissedCheckOut, breakDurationMinutes } = params;
  if (status === 'Absent' || status === 'Holiday' || status === 'Week Off' || status === 'On Leave') return 0;
  if (status === 'Half Day') return 4.0;
  if (isMissedCheckIn || !checkInTime || !isValidTimeInput(checkInTime)) return 0;
  if (isMissedCheckOut || !checkOutTime || !isValidTimeInput(checkOutTime)) {
    return status === 'Present' || status === 'Work From Home' ? 8.0 : 0;
  }
  const inMins = parseTimeToMinutes(normalizeTimeString(checkInTime));
  const outMins = parseTimeToMinutes(normalizeTimeString(checkOutTime));
  if (inMins === null || outMins === null) return 8.0;
  let totalSpanMins = outMins - inMins;
  if (totalSpanMins < 0) {
    totalSpanMins += 24 * 60; // Overnight shift support
  }
  const netMins = Math.max(0, totalSpanMins - (Number(breakDurationMinutes) || 0));
  return Math.round((netMins / 60) * 10) / 10;
};

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
    masterAttendancePolicies,
    attendanceConfig
  } = useHRMS();

  const [selectedEmpId, setSelectedEmpId] = useState<string>(() => {
    if (defaultEmployeeId) {
      const match = employees.find(e => e.id === defaultEmployeeId || e.employeeId === defaultEmployeeId);
      if (match) return match.id;
    }
    return '';
  });
  const [date, setDate] = useState<string>(
    defaultDate || new Date().toISOString().split('T')[0]
  );
  const [status, setStatus] = useState<AttendanceRecord['status']>('Present');
  const [halfDayType, setHalfDayType] = useState<'First Half' | 'Second Half'>('First Half');
  
  const [checkInTime, setCheckInTime] = useState<string>('');
  const [checkOutTime, setCheckOutTime] = useState<string>('');
  const [isMissedCheckIn, setIsMissedCheckIn] = useState<boolean>(true);
  const [isMissedCheckOut, setIsMissedCheckOut] = useState<boolean>(true);
  
  const [breakDuration, setBreakDuration] = useState<number | string>(45);
  const [otHours, setOtHours] = useState<number>(0);
  
  const [error, setError] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string>('');
  const successTimeoutRef = React.useRef<any>(null);
  const initializedRecordKey = React.useRef<string>('');

  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const employeeDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filtered employees list based on search query (name, employeeId, department, designation)
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const q = searchQuery.toLowerCase().trim();
    return employees.filter(emp => {
      const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase();
      const empId = (emp.employeeId || emp.id || '').toLowerCase();
      const dept = (emp.department || '').toLowerCase();
      const desig = (emp.designation || '').toLowerCase();
      return fullName.includes(q) || empId.includes(q) || dept.includes(q) || desig.includes(q);
    });
  }, [employees, searchQuery]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isDropdownOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isDropdownOpen]);

  // Reset dropdown, search query, and selection when modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      setIsDropdownOpen(false);
      setSearchQuery('');
      setSelectedEmpId('');
    } else if (defaultEmployeeId) {
      const found = employees.find(e => e.id === defaultEmployeeId || e.employeeId === defaultEmployeeId);
      setSelectedEmpId(found ? found.id : '');
    } else {
      setSelectedEmpId('');
    }
  }, [isOpen, defaultEmployeeId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
    return resolveEmployeeAssignedShift(selectedEmployee, shifts);
  }, [shifts, selectedEmployee]);

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

  const [activeTimePicker, setActiveTimePicker] = useState<'checkIn' | 'checkOut' | null>(null);
  const checkInPickerContainerRef = useRef<HTMLDivElement>(null);
  const checkOutPickerContainerRef = useRef<HTMLDivElement>(null);
  const checkInNativeTimeRef = useRef<HTMLInputElement>(null);
  const checkOutNativeTimeRef = useRef<HTMLInputElement>(null);

  const shiftRangeMatch = (selectedEmployee?.workShift || '').match(/\(([^)]+)\)/)?.[1]?.trim();
  let resolvedShiftStartTime = assignedShift?.startTime;
  let resolvedShiftEndTime = assignedShift?.endTime;
  if (shiftRangeMatch) {
    const parts = shiftRangeMatch.split('-').map(p => p.trim());
    if (parts[0]) resolvedShiftStartTime = parts[0];
    if (parts[1]) resolvedShiftEndTime = parts[1];
  }
  const shiftStartTimeStr = normalizeTimeString(resolvedShiftStartTime || assignedShift?.startTime || '09:00 AM') || '09:00 AM';
  const shiftEndTimeStr = normalizeTimeString(resolvedShiftEndTime || assignedShift?.endTime || '06:00 PM') || '06:00 PM';

  // Late policy grace period takes precedence over shift grace
  const effectiveGraceMins = (
    effectiveLatePolicy?.graceTimeMinutes ??
    effectiveLatePolicy?.gracePeriodMinutes ??
    (assignedShift as any)?.gracePeriodMinutes ??
    (assignedShift as any)?.gracePeriodMins ??
    (attendanceConfig?.lateGraceMinutes ?? 40)
  );

  const isExemptFromLate = Boolean(selectedEmployee && isAttendanceExemptEmployee(selectedEmployee));
  const checkInEvaluation = useMemo(() => {
    return evaluatePunchCheckInStatus({
      checkInTime,
      isMissedCheckIn,
      shiftStartTimeStr,
      effectiveGraceMins,
      isExempt: isExemptFromLate
    });
  }, [checkInTime, isMissedCheckIn, shiftStartTimeStr, effectiveGraceMins, isExemptFromLate]);

  const isCurrentlyLate = checkInEvaluation.isLate;
  const lateMinutesDiff = checkInEvaluation.lateMinutes;

  // Close custom time picker popover when clicking outside
  useEffect(() => {
    if (!activeTimePicker) return;
    const handleOutsidePickerClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        activeTimePicker === 'checkIn' &&
        checkInPickerContainerRef.current &&
        !checkInPickerContainerRef.current.contains(target)
      ) {
        setActiveTimePicker(null);
      } else if (
        activeTimePicker === 'checkOut' &&
        checkOutPickerContainerRef.current &&
        !checkOutPickerContainerRef.current.contains(target)
      ) {
        setActiveTimePicker(null);
      }
    };
    document.addEventListener('mousedown', handleOutsidePickerClick);
    return () => document.removeEventListener('mousedown', handleOutsidePickerClick);
  }, [activeTimePicker]);

  // When check-in time is adjusted by HR/CEO to a time within shift start + grace period,
  // automatically update status to 'Present' if it was 'Late'
  useEffect(() => {
    if (!isCurrentlyLate && status === 'Late' && !isMissedCheckIn && checkInTime && isValidTimeInput(checkInTime)) {
      setStatus('Present');
    }
  }, [isCurrentlyLate, status, isMissedCheckIn, checkInTime]);

  // Sync state when existing record or defaults change, without wiping active user edits
  useEffect(() => {
    if (!isOpen) {
      initializedRecordKey.current = '';
      setActiveTimePicker(null);
      return;
    }
    const currentKey = `${selectedEmpId}_${date}`;
    if (initializedRecordKey.current === currentKey) {
      return;
    }
    initializedRecordKey.current = currentKey;

    if (existingRecord) {
      const initialStatus =
        existingRecord.status === 'Absent' || existingRecord.status === 'Missing Punch'
          ? 'Present'
          : existingRecord.status || 'Present';
      setStatus(initialStatus);
      if (existingRecord.checkIn && existingRecord.checkIn !== '--:--' && existingRecord.checkIn !== '-') {
        setCheckInTime(normalizeTimeString(existingRecord.checkIn) || existingRecord.checkIn);
        setIsMissedCheckIn(false);
      } else {
        setCheckInTime(shiftStartTimeStr || '09:00 AM');
        setIsMissedCheckIn(false);
      }
      if (existingRecord.checkOut && existingRecord.checkOut !== '--:--' && existingRecord.checkOut !== '-') {
        setCheckOutTime(normalizeTimeString(existingRecord.checkOut) || existingRecord.checkOut);
        setIsMissedCheckOut(false);
      } else {
        setCheckOutTime(shiftEndTimeStr || '06:00 PM');
        setIsMissedCheckOut(false);
      }
      if (existingRecord.otHours) {
        setOtHours(existingRecord.otHours);
      } else {
        setOtHours(0);
      }
      if (existingRecord.breakDurationMinutes) {
        setBreakDuration(existingRecord.breakDurationMinutes);
      } else {
        setBreakDuration(45);
      }
    } else if (selectedEmpId) {
      // Employee selected with no prior attendance record for this date:
      // Pre-fill with employee's assigned shift start & end times and unlock inputs
      setCheckInTime(shiftStartTimeStr || '09:00 AM');
      setCheckOutTime(shiftEndTimeStr || '06:00 PM');
      setIsMissedCheckIn(false);
      setIsMissedCheckOut(false);
      setOtHours(0);
      setBreakDuration(45);
      setStatus('Present');
    } else {
      setCheckInTime('');
      setCheckOutTime('');
      setIsMissedCheckIn(false);
      setIsMissedCheckOut(false);
      setOtHours(0);
      setBreakDuration(45);
      setStatus('Present');
    }
  }, [isOpen, existingRecord, date, selectedEmpId, shiftStartTimeStr, shiftEndTimeStr]);

  if (!isOpen) return null;

  const effectiveCheckInRaw = checkInTime.trim() || shiftStartTimeStr || '09:00 AM';
  const effectiveCheckOutRaw = checkOutTime.trim() || shiftEndTimeStr || '06:00 PM';

  // Real-time calculation of working hours (supports overnight shifts)
  const calculatedHours = calculateNetWorkingHours({
    status,
    checkInTime: effectiveCheckInRaw,
    checkOutTime: effectiveCheckOutRaw,
    isMissedCheckIn,
    isMissedCheckOut,
    breakDurationMinutes: Number(breakDuration) || 0
  });

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

    if (status !== 'Absent' && status !== 'On Leave') {
      if (!isMissedCheckIn && !isValidTimeInput(effectiveCheckInRaw)) {
        setError('Please enter a valid Check-In time in HH:MM AM/PM format (e.g. 09:00 AM).');
        return;
      }
      if (!isMissedCheckOut && !isValidTimeInput(effectiveCheckOutRaw)) {
        setError('Please enter a valid Check-Out time in HH:MM AM/PM format (e.g. 06:00 PM).');
        return;
      }
    }

    const finalCheckIn = isMissedCheckIn ? null : normalizeTimeString(effectiveCheckInRaw);
    const finalCheckOut = isMissedCheckOut ? null : normalizeTimeString(effectiveCheckOutRaw);

    // If the check-in time is on-time or within grace period, ensure status is recorded as Present
    let statusToSend = status;
    if (!isCurrentlyLate && status === 'Late' && !isMissedCheckIn && finalCheckIn) {
      statusToSend = 'Present';
    }

    const addedBy = `${currentUser?.name} (${currentUser?.role})`;

    const res = addManualAttendanceRecord({
      employeeId: selectedEmpId,
      date,
      status: statusToSend,
      checkIn: finalCheckIn,
      checkOut: finalCheckOut,
      breakDurationMinutes: Number(breakDuration) || 0,
      workingHours: calculatedHours,
      halfDayType: status === 'Half Day' ? halfDayType : undefined,
      otHours: otHours > 0 ? otHours : undefined,
      reason: existingRecord?.reason || 'Manual Attendance Entry',
      addedBy
    });

    if (res.success) {
      const savedName = selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : 'Employee';
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }

      setIsSuccess(true);
      setSaveSuccessMessage(`Attendance record for ${savedName} successfully saved!`);
      // Never auto-close on save: modal remains open until user explicitly clicks top-right 'X' or Cancel
      successTimeoutRef.current = setTimeout(() => {
        setIsSuccess(false);
        setSaveSuccessMessage('');
      }, 3500);
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
                <span>{saveSuccessMessage || 'Attendance record successfully saved and audit log generated!'}</span>
              </div>
            )}


            {/* Employee Selection */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#1E293B',
                    margin: 0
                  }}
                >
                  Select Employee <span style={{ color: '#EF4444' }}>*</span>
                </label>
              </div>
              {/* Custom Searchable Employee Combobox */}
              <div ref={employeeDropdownRef} style={{ position: 'relative' }}>
                <div
                  onClick={() => {
                    if (selectedEmployee && !isDropdownOpen) {
                      setIsDropdownOpen(true);
                    }
                    setTimeout(() => searchInputRef.current?.focus(), 20);
                  }}
                  style={{
                    width: '100%',
                    minHeight: '42px',
                    padding: '6px 12px',
                    borderRadius: '10px',
                    border: isDropdownOpen ? '2px solid #0E7490' : '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    cursor: selectedEmployee && !isDropdownOpen ? 'pointer' : 'text',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    boxShadow: isDropdownOpen ? '0 0 0 3px rgba(14, 116, 144, 0.15)' : 'none'
                  }}
                  role="combobox"
                  aria-expanded={isDropdownOpen}
                  aria-haspopup="listbox"
                  title="Search or select employee"
                >
                  {selectedEmployee && !isDropdownOpen ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: 1 }}>
                      <div
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          backgroundColor: '#ECFEFF',
                          color: '#0E7490',
                          fontWeight: 700,
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid #CFFAFE',
                          flexShrink: 0
                        }}
                      >
                        {selectedEmployee.firstName?.[0] || 'E'}{selectedEmployee.lastName?.[0] || ''}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A', whiteSpace: 'nowrap' }}>
                          {selectedEmployee.firstName} {selectedEmployee.lastName}
                        </span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#0E7490',
                            backgroundColor: '#ECFEFF',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid #CFFAFE',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {selectedEmployee.employeeId}
                        </span>
                        <span style={{ fontSize: '0.76rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                          — {selectedEmployee.department}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <Search size={15} color="#0E7490" style={{ flexShrink: 0, opacity: 0.8 }} />
                      <input
                        ref={searchInputRef}
                        type="text"
                        className="header-search-input"
                        value={searchQuery}
                        onFocus={() => {
                          if (searchQuery.trim().length > 0) {
                            setIsDropdownOpen(true);
                          }
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSearchQuery(val);
                          setIsDropdownOpen(val.trim().length > 0);
                        }}
                        onKeyDown={(e) => {
                          preventSpaceEnterPropagation(e);
                          if (e.key === 'Escape') {
                            setIsDropdownOpen(false);
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (searchQuery.trim() && filteredEmployees.length > 0) {
                              setSelectedEmpId(filteredEmployees[0].id);
                              setIsDropdownOpen(false);
                              setSearchQuery('');
                            }
                          }
                        }}
                        placeholder="Search employee name or ID (e.g. Arun, VRM-013)..."
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          outline: 'none',
                          boxShadow: 'none',
                          padding: 0,
                          fontSize: '0.86rem',
                          fontWeight: 500,
                          color: '#0F172A'
                        }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', flexShrink: 0, marginLeft: '8px' }}>
                    {(selectedEmployee || searchQuery) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEmpId('');
                          setSearchQuery('');
                          setIsDropdownOpen(false);
                          setTimeout(() => searchInputRef.current?.focus(), 30);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px',
                          cursor: 'pointer',
                          color: '#94A3B8',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Clear employee selection"
                      >
                        <X size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDropdownOpen(prev => !prev);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '2px',
                        cursor: 'pointer',
                        color: '#64748B',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Toggle employee list"
                    >
                      <ChevronDown size={16} style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>
                  </div>
                </div>

                {/* Dropdown Menu — only shown after user types in search bar or explicitly clicks arrow */}
                {isDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      backgroundColor: '#FFFFFF',
                      borderRadius: '12px',
                      border: '1px solid #CBD5E1',
                      boxShadow: '0 12px 28px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                      zIndex: 1000,
                      overflow: 'hidden'
                    }}
                  >
                    {/* Results Count Header */}
                    <div
                      style={{
                        padding: '5px 12px',
                        backgroundColor: '#F1F5F9',
                        fontSize: '11px',
                        color: '#64748B',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span>
                        {filteredEmployees.length} of {employees.length} employees
                      </span>
                      {searchQuery && filteredEmployees.length > 0 && (
                        <span style={{ color: '#0E7490', fontSize: '10.5px' }}>Press Enter to select</span>
                      )}
                    </div>

                    {/* Employee Options List */}
                    <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                      {filteredEmployees.length === 0 ? (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                          No employee found matching "<strong>{searchQuery}</strong>"
                        </div>
                      ) : (
                        filteredEmployees.map(emp => {
                          const isSelected = emp.id === selectedEmpId || emp.employeeId === selectedEmpId;
                          return (
                            <div
                              key={emp.id}
                              onClick={() => {
                                setSelectedEmpId(emp.id);
                                setIsDropdownOpen(false);
                                setSearchQuery('');
                              }}
                              style={{
                                padding: '9px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                backgroundColor: isSelected ? '#ECFEFF' : 'transparent',
                                borderLeft: isSelected ? '3px solid #0E7490' : '3px solid transparent',
                                transition: 'background-color 0.12s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div
                                  style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    backgroundColor: isSelected ? '#0E7490' : '#E2E8F0',
                                    color: isSelected ? '#FFFFFF' : '#475569',
                                    fontWeight: 700,
                                    fontSize: '11px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}
                                >
                                  {emp.firstName?.[0] || 'E'}{emp.lastName?.[0] || ''}
                                </div>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.84rem', color: isSelected ? '#0E7490' : '#0F172A' }}>
                                      {emp.firstName} {emp.lastName}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        color: '#0E7490',
                                        backgroundColor: '#ECFEFF',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        border: '1px solid #CFFAFE'
                                      }}
                                    >
                                      {emp.employeeId}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                    {emp.department} {emp.designation ? `• ${emp.designation}` : ''}
                                  </div>
                                </div>
                              </div>
                              {isSelected && <Check size={16} color="#0E7490" />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
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

            {/* Check-In & Check-Out Times — ONLY displayed AFTER an Employee is selected */}
            {Boolean(selectedEmployee) && status !== 'Absent' && status !== 'On Leave' && (() => {
              const parse12Parts = (raw: string, fallback: string) => {
                const norm = normalizeTimeString(raw) || normalizeTimeString(fallback) || '09:00 AM';
                const m = norm.match(/^(\d{2}):(\d{2})\s*(AM|PM)$/i);
                if (!m) return { hh: '09', mm: '00', mer: 'AM' as 'AM' | 'PM' };
                return { hh: m[1], mm: m[2], mer: m[3].toUpperCase() as 'AM' | 'PM' };
              };
              const inParts = parse12Parts(checkInTime, shiftStartTimeStr);
              const outParts = parse12Parts(checkOutTime, shiftEndTimeStr);
              const isCheckInInvalid = !isMissedCheckIn && Boolean(checkInTime.trim()) && !isValidTimeInput(checkInTime);
              const isCheckOutInvalid = !isMissedCheckOut && Boolean(checkOutTime.trim()) && !isValidTimeInput(checkOutTime);

              const badgeStyleMap: Record<typeof checkInEvaluation.badge, { color: string; bg: string; border: string }> = {
                'On Time': { color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
                'Late': { color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
                'Early': { color: '#0E7490', bg: '#ECFEFF', border: '#A5F3FC' },
                'Not Calculated': { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' }
              };
              const currentBadgeTheme = badgeStyleMap[checkInEvaluation.badge];

              return (
                <div
                  data-testid="punch-timings-section"
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
                  <style>{`
                    .punch-timings-grid {
                      display: grid;
                      grid-template-columns: 1fr 1fr;
                      gap: 14px;
                      align-items: start;
                    }
                    @media (max-width: 640px) {
                      .punch-timings-grid {
                        grid-template-columns: 1fr !important;
                      }
                    }
                  `}</style>

                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={15} color="#0E7490" />
                        Punch Timings
                      </span>
                      <span
                        data-testid="punch-shift-grace-summary"
                        style={{ fontSize: '0.76rem', fontWeight: 600, color: '#475569' }}
                      >
                        Shift: {shiftStartTimeStr} – {shiftEndTimeStr} · Grace: {effectiveGraceMins} min
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      Check boxes if punch was missed
                    </span>
                  </div>

                  {/* Check-In and Check-Out Side by Side on Desktop, Stacked on Mobile */}
                  <div className="punch-timings-grid">
                    {/* Check-In Column */}
                    <div ref={checkInPickerContainerRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label htmlFor="manual-checkin-input" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B' }}>
                          Check-In
                        </label>
                        <label style={{ fontSize: '0.74rem', color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isMissedCheckIn}
                            onChange={e => {
                              setIsMissedCheckIn(e.target.checked);
                              if (e.target.checked) setActiveTimePicker(null);
                            }}
                          />
                          <span>Missed In</span>
                        </label>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <input
                          id="manual-checkin-input"
                          aria-label="Check-In"
                          type="text"
                          disabled={isMissedCheckIn}
                          value={isMissedCheckIn ? 'Missed / Absent' : checkInTime}
                          onChange={e => {
                            setCheckInTime(e.target.value);
                            if (error) setError('');
                          }}
                          onBlur={e => {
                            const norm = normalizeTimeString(e.target.value);
                            if (norm && isValidTimeInput(e.target.value)) {
                              setCheckInTime(norm);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const norm = normalizeTimeString(checkInTime);
                              if (norm && isValidTimeInput(checkInTime)) {
                                setCheckInTime(norm);
                              }
                            }
                          }}
                          placeholder={shiftStartTimeStr || '09:00 AM'}
                          style={{
                            width: '100%',
                            height: '40px',
                            padding: '6px 38px 6px 12px',
                            borderRadius: '8px',
                            border: isCheckInInvalid ? '1px solid #EF4444' : '1px solid #CBD5E1',
                            fontSize: '0.86rem',
                            fontWeight: 700,
                            color: isMissedCheckIn ? '#94A3B8' : '#0F172A',
                            backgroundColor: isMissedCheckIn ? '#F1F5F9' : '#FFFFFF',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          type="button"
                          aria-label="Open Check-In time picker"
                          onClick={() => {
                            if (isMissedCheckIn) {
                              setIsMissedCheckIn(false);
                              if (!checkInTime.trim()) setCheckInTime(shiftStartTimeStr || '09:00 AM');
                              setActiveTimePicker('checkIn');
                            } else {
                              if (!checkInTime.trim()) setCheckInTime(shiftStartTimeStr || '09:00 AM');
                              setActiveTimePicker(prev => (prev === 'checkIn' ? null : 'checkIn'));
                            }
                          }}
                          title="Pick check-in time"
                          style={{
                            position: 'absolute',
                            right: '6px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: 'none',
                            background: activeTimePicker === 'checkIn' ? '#ECFEFF' : 'transparent',
                            color: activeTimePicker === 'checkIn' ? '#0E7490' : '#64748B',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0
                          }}
                        >
                          <Clock size={16} />
                        </button>
                        {/* Synchronized native time input for accessibility / test automation */}
                        {!isMissedCheckIn && (
                          <input
                            ref={checkInNativeTimeRef}
                            type="time"
                            aria-label="Pick check-in time"
                            tabIndex={-1}
                            value={format12to24(checkInTime || shiftStartTimeStr)}
                            onChange={e => {
                              if (e.target.value) {
                                setCheckInTime(format24to12(e.target.value));
                                setIsMissedCheckIn(false);
                                if (error) setError('');
                              }
                            }}
                            style={{
                              position: 'absolute',
                              width: '1px',
                              height: '1px',
                              opacity: 0,
                              pointerEvents: 'none',
                              right: '10px',
                              bottom: 0
                            }}
                          />
                        )}

                        {/* Lightweight BUSINZ Time Picker Popover */}
                        {activeTimePicker === 'checkIn' && !isMissedCheckIn && (
                          <div
                            role="dialog"
                            aria-label="Check-In Time Picker"
                            style={{
                              position: 'absolute',
                              top: 'calc(100% + 6px)',
                              left: 0,
                              right: 0,
                              zIndex: 50,
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              borderRadius: '10px',
                              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
                              padding: '10px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}
                          >
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', alignItems: 'center' }}>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Hour</label>
                                <select
                                  aria-label="Check-In Hour"
                                  value={inParts.hh}
                                  onChange={e => {
                                    setIsMissedCheckIn(false);
                                    setCheckInTime(`${e.target.value}:${inParts.mm} ${inParts.mer}`);
                                    if (error) setError('');
                                  }}
                                  style={{
                                    width: '100%',
                                    height: '32px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    padding: '0 6px',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    color: '#0F172A',
                                    backgroundColor: '#FFFFFF'
                                  }}
                                >
                                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Min</label>
                                <select
                                  aria-label="Check-In Minute"
                                  value={inParts.mm}
                                  onChange={e => {
                                    setIsMissedCheckIn(false);
                                    setCheckInTime(`${inParts.hh}:${e.target.value} ${inParts.mer}`);
                                    if (error) setError('');
                                  }}
                                  style={{
                                    width: '100%',
                                    height: '32px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    padding: '0 6px',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    color: '#0F172A',
                                    backgroundColor: '#FFFFFF'
                                  }}
                                >
                                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Period</label>
                                <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid #CBD5E1', overflow: 'hidden', height: '32px' }}>
                                  {(['AM', 'PM'] as const).map(p => (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => {
                                        setIsMissedCheckIn(false);
                                        setCheckInTime(`${inParts.hh}:${inParts.mm} ${p}`);
                                        if (error) setError('');
                                      }}
                                      style={{
                                        border: 'none',
                                        padding: '0 8px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        backgroundColor: inParts.mer === p ? '#0E7490' : '#FFFFFF',
                                        color: inParts.mer === p ? '#FFFFFF' : '#475569'
                                      }}
                                    >
                                        {p}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!checkInTime.trim()) {
                                      setCheckInTime(`${inParts.hh}:${inParts.mm} ${inParts.mer}`);
                                    }
                                    setActiveTimePicker(null);
                                  }}
                                  style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: '#0E7490',
                                  color: '#FFFFFF',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Compact Attendance Status Indicator */}
                      <div style={{ display: 'flex', alignItems: 'center', minHeight: '22px' }}>
                        <span
                          data-testid="checkin-status-badge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '0.73rem',
                            fontWeight: 700,
                            color: currentBadgeTheme.color,
                            backgroundColor: currentBadgeTheme.bg,
                            border: `1px solid ${currentBadgeTheme.border}`
                          }}
                        >
                          {checkInEvaluation.badge}
                        </span>
                      </div>

                      {/* Smart Shift Start Shortcut */}
                      {shiftStartTimeStr && (
                        <div>
                          <button
                            type="button"
                            data-testid="use-shift-start-shortcut"
                            onClick={() => {
                              setIsMissedCheckIn(false);
                              setCheckInTime(shiftStartTimeStr);
                              setActiveTimePicker(null);
                              if (error) setError('');
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '2px 0',
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              color: '#0E7490',
                              cursor: 'pointer',
                              textAlign: 'left',
                              textDecoration: 'none'
                            }}
                          >
                            Use shift start: {shiftStartTimeStr}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Check-Out Column */}
                    <div ref={checkOutPickerContainerRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label htmlFor="manual-checkout-input" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B' }}>
                          Check-Out
                        </label>
                        <label style={{ fontSize: '0.74rem', color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isMissedCheckOut}
                            onChange={e => {
                              setIsMissedCheckOut(e.target.checked);
                              if (e.target.checked) setActiveTimePicker(null);
                            }}
                          />
                          <span>Missed Out</span>
                        </label>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <input
                          id="manual-checkout-input"
                          aria-label="Check-Out"
                          type="text"
                          disabled={isMissedCheckOut}
                          value={isMissedCheckOut ? 'Missed / None' : checkOutTime}
                          onChange={e => {
                            setCheckOutTime(e.target.value);
                            if (error) setError('');
                          }}
                          onBlur={e => {
                            const norm = normalizeTimeString(e.target.value);
                            if (norm && isValidTimeInput(e.target.value)) {
                              setCheckOutTime(norm);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const norm = normalizeTimeString(checkOutTime);
                              if (norm && isValidTimeInput(checkOutTime)) {
                                setCheckOutTime(norm);
                              }
                            }
                          }}
                          placeholder={shiftEndTimeStr || '06:00 PM'}
                          style={{
                            width: '100%',
                            height: '40px',
                            padding: '6px 38px 6px 12px',
                            borderRadius: '8px',
                            border: isCheckOutInvalid ? '1px solid #EF4444' : '1px solid #CBD5E1',
                            fontSize: '0.86rem',
                            fontWeight: 700,
                            color: isMissedCheckOut ? '#94A3B8' : '#0F172A',
                            backgroundColor: isMissedCheckOut ? '#F1F5F9' : '#FFFFFF',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          type="button"
                          aria-label="Open Check-Out time picker"
                          onClick={() => {
                            if (isMissedCheckOut) {
                              setIsMissedCheckOut(false);
                              if (!checkOutTime.trim()) setCheckOutTime(shiftEndTimeStr || '06:00 PM');
                              setActiveTimePicker('checkOut');
                            } else {
                              if (!checkOutTime.trim()) setCheckOutTime(shiftEndTimeStr || '06:00 PM');
                              setActiveTimePicker(prev => (prev === 'checkOut' ? null : 'checkOut'));
                            }
                          }}
                          title="Pick check-out time"
                          style={{
                            position: 'absolute',
                            right: '6px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: 'none',
                            background: activeTimePicker === 'checkOut' ? '#ECFEFF' : 'transparent',
                            color: activeTimePicker === 'checkOut' ? '#0E7490' : '#64748B',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0
                          }}
                        >
                          <Clock size={16} />
                        </button>
                        {/* Synchronized native time input for accessibility / test automation */}
                        {!isMissedCheckOut && (
                          <input
                            ref={checkOutNativeTimeRef}
                            type="time"
                            aria-label="Pick check-out time"
                            tabIndex={-1}
                            value={format12to24(checkOutTime || shiftEndTimeStr)}
                            onChange={e => {
                              if (e.target.value) {
                                setCheckOutTime(format24to12(e.target.value));
                                setIsMissedCheckOut(false);
                                if (error) setError('');
                              }
                            }}
                            style={{
                              position: 'absolute',
                              width: '1px',
                              height: '1px',
                              opacity: 0,
                              pointerEvents: 'none',
                              right: '10px',
                              bottom: 0
                            }}
                          />
                        )}

                        {/* Lightweight BUSINZ Time Picker Popover */}
                        {activeTimePicker === 'checkOut' && !isMissedCheckOut && (
                          <div
                            role="dialog"
                            aria-label="Check-Out Time Picker"
                            style={{
                              position: 'absolute',
                              top: 'calc(100% + 6px)',
                              left: 0,
                              right: 0,
                              zIndex: 50,
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              borderRadius: '10px',
                              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
                              padding: '10px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}
                          >
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', alignItems: 'center' }}>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Hour</label>
                                <select
                                  aria-label="Check-Out Hour"
                                  value={outParts.hh}
                                  onChange={e => {
                                    setIsMissedCheckOut(false);
                                    setCheckOutTime(`${e.target.value}:${outParts.mm} ${outParts.mer}`);
                                    if (error) setError('');
                                  }}
                                  style={{
                                    width: '100%',
                                    height: '32px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    padding: '0 6px',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    color: '#0F172A',
                                    backgroundColor: '#FFFFFF'
                                  }}
                                >
                                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Min</label>
                                <select
                                  aria-label="Check-Out Minute"
                                  value={outParts.mm}
                                  onChange={e => {
                                    setIsMissedCheckOut(false);
                                    setCheckOutTime(`${outParts.hh}:${e.target.value} ${outParts.mer}`);
                                    if (error) setError('');
                                  }}
                                  style={{
                                    width: '100%',
                                    height: '32px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    padding: '0 6px',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    color: '#0F172A',
                                    backgroundColor: '#FFFFFF'
                                  }}
                                >
                                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Period</label>
                                <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid #CBD5E1', overflow: 'hidden', height: '32px' }}>
                                  {(['AM', 'PM'] as const).map(p => (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => {
                                        setIsMissedCheckOut(false);
                                        setCheckOutTime(`${outParts.hh}:${outParts.mm} ${p}`);
                                        if (error) setError('');
                                      }}
                                      style={{
                                        border: 'none',
                                        padding: '0 8px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        backgroundColor: outParts.mer === p ? '#0E7490' : '#FFFFFF',
                                        color: outParts.mer === p ? '#FFFFFF' : '#475569'
                                      }}
                                    >
                                        {p}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!checkOutTime.trim()) {
                                      setCheckOutTime(`${outParts.hh}:${outParts.mm} ${outParts.mer}`);
                                    }
                                    setActiveTimePicker(null);
                                  }}
                                  style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: '#0E7490',
                                  color: '#FFFFFF',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Smart Shift End Shortcut */}
                      {shiftEndTimeStr && (
                        <div>
                          <button
                            type="button"
                            data-testid="use-shift-end-shortcut"
                            onClick={() => {
                              setIsMissedCheckOut(false);
                              setCheckOutTime(shiftEndTimeStr);
                              setActiveTimePicker(null);
                              if (error) setError('');
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '2px 0',
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              color: '#0E7490',
                              cursor: 'pointer',
                              textAlign: 'left',
                              textDecoration: 'none'
                            }}
                          >
                            Use shift end: {shiftEndTimeStr}
                          </button>
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
                      onChange={e => {
                        const val = e.target.value;
                        setBreakDuration(val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
                      }}
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
              );
            })()}
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
                padding: '8px 18px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 600,
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn btn-primary"
              style={{
                padding: '9px 22px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 700,
                backgroundColor: '#0E7490',
                borderColor: '#0E7490',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)'
              }}
              title="Save attendance record (window remains open until you click ✕)"
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
