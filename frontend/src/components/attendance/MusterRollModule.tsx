import React, { useState, useMemo, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { isOwnerOrCEO, isAttendanceExemptEmployee } from '../../data/hrmsInitialData';
import { Employee, AttendanceRecord } from '../../types/hrms';
import { 
  Calendar as CalendarIcon, 
  Search, 
  Filter, 
  RotateCcw, 
  Download, 
  Printer, 
  X, 
  User, 
  Building2, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronLeft, 
  ChevronRight, 
  SlidersHorizontal,
  Edit3,
  Save,
  FileSpreadsheet,
  FileText,
  FileCode,
  Users,
  CalendarCheck,
  UserX,
  CalendarDays
} from 'lucide-react';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { downloadPagarBookMusterRollExcel, resolveEmployeeStandardShiftHours } from '../../utils/pagarBookMusterRollExporter';
import { normalizeToYYYYMMDD, formatDateDDMMYYYY, formatTimeDisplay, formatHoursAndMinutes } from '../../utils/dateUtils';
import { toNum } from '../../utils/numbers';
import { isShiftEnded, resolveEmployeeAssignedShift } from '../../services/shiftAttendanceEngine';
import { resolveOvernightAttendanceSession } from '../../services/attendanceCalculationEngine';
import { correctAttendanceRecord } from '../../services/attendanceApi';
import { 
  format24to12, 
  isValidTimeInput, 
  normalizeTimeString, 
  format12to24 
} from './ManualAttendanceEntryModal';

const parse12Parts = (raw: string, fallback: string = '09:00 AM') => {
  const norm = normalizeTimeString(raw) || normalizeTimeString(fallback) || '09:00 AM';
  const m = norm.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return { hh: '09', mm: '00', mer: 'AM' as 'AM' | 'PM' };
  let hh = String(parseInt(m[1], 10)).padStart(2, '0');
  const mm = m[2];
  const mer = (m[3]?.toUpperCase() || 'AM') as 'AM' | 'PM';
  return { hh, mm, mer };
};

const parseTimeToMinutes = (timeStr?: string | null): number => {
  if (!timeStr) return 0;
  const clean = String(timeStr).trim();
  if (!clean || clean === '--:--' || clean === '-' || clean === '—') return 0;
  if (clean.includes('T') || clean.includes('Z') || (clean.includes('-') && clean.includes(':'))) {
    const d = new Date(clean.endsWith('Z') || clean.includes('+') ? clean : clean + 'Z');
    if (!isNaN(d.getTime())) {
      const istStr = d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
      const parts = istStr.split(':').map(Number);
      let h = parts[0];
      if (h === 24) h = 0;
      return h * 60 + parts[1];
    }
  }
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
};

// Attendance Short Code System
export type AttendanceStatusCode = 'P' | 'A' | 'PL' | 'UL' | 'H' | 'WFO' | 'FV' | 'FD' | 'L' | 'WO' | 'HD' | 'OD' | 'WFH' | 'ML' | '-' | 'NA' | 'MU';

export interface StatusConfig {
  code: AttendanceStatusCode;
  label: string;
  badgeBg: string;
  badgeColor: string;
  borderColor: string;
  weight: number; // Contribution to attendance calculation
}

export const ATTENDANCE_STATUS_CONFIG: Record<string, StatusConfig> = {
  P: { code: 'P', label: 'Present', badgeBg: '#DCFCE7', badgeColor: '#15803D', borderColor: '#86EFAC', weight: 1.0 },
  HD: { code: 'HD', label: 'Half Day', badgeBg: '#FFEDD5', badgeColor: '#C2410C', borderColor: '#FDBA74', weight: 0.5 },
  PL: { code: 'PL', label: 'Paid Leave', badgeBg: '#F3E8FF', badgeColor: '#7E22CE', borderColor: '#D8B4FE', weight: 1.0 },
  UL: { code: 'UL', label: 'Unpaid Leave (LOP)', badgeBg: '#FEF3C7', badgeColor: '#B45309', borderColor: '#FDE68A', weight: 0.0 },
  A: { code: 'A', label: 'Absent (LOP)', badgeBg: '#FEE2E2', badgeColor: '#B91C1C', borderColor: '#FCA5A5', weight: 0.0 },
  H: { code: 'H', label: 'Holiday', badgeBg: '#DBEAFE', badgeColor: '#1E40AF', borderColor: '#93C5FD', weight: 0.0 },
  WFH: { code: 'WFH', label: 'Work From Home', badgeBg: '#E0E7FF', badgeColor: '#4338CA', borderColor: '#A5B4FC', weight: 1.0 },
  FV: { code: 'FV', label: 'Field Visit', badgeBg: '#CFFAFE', badgeColor: '#0E7490', borderColor: '#67E8F9', weight: 1.0 },
  MU: { code: 'MU', label: 'Missed Punch-Out', badgeBg: '#FEF3C7', badgeColor: '#B45309', borderColor: '#FDE68A', weight: 0.0 },
  '-': { code: '-', label: 'Not Employed', badgeBg: '#F8FAFC', badgeColor: '#94A3B8', borderColor: '#E2E8F0', weight: 0.0 },
  NA: { code: 'NA', label: 'Not Applicable', badgeBg: '#F8FAFC', badgeColor: '#94A3B8', borderColor: '#E2E8F0', weight: 0.0 },
  // Backward-compatible aliases
  WFO: { code: 'WFH', label: 'Work From Home', badgeBg: '#E0E7FF', badgeColor: '#4338CA', borderColor: '#A5B4FC', weight: 1.0 },
  FD: { code: 'FV', label: 'Field Visit', badgeBg: '#CFFAFE', badgeColor: '#0E7490', borderColor: '#67E8F9', weight: 1.0 },
  OD: { code: 'FV', label: 'Field Visit', badgeBg: '#CFFAFE', badgeColor: '#0E7490', borderColor: '#67E8F9', weight: 1.0 },
  L: { code: 'PL', label: 'Paid Leave', badgeBg: '#F3E8FF', badgeColor: '#7E22CE', borderColor: '#D8B4FE', weight: 1.0 },
  WO: { code: 'H', label: 'Holiday', badgeBg: '#DBEAFE', badgeColor: '#1E40AF', borderColor: '#93C5FD', weight: 0.0 },
  ML: { code: 'PL', label: 'Paid Leave', badgeBg: '#F3E8FF', badgeColor: '#7E22CE', borderColor: '#D8B4FE', weight: 1.0 }
};

export const DISPLAYED_STATUS_CONFIGS: StatusConfig[] = [
  { code: 'P', label: 'Present', badgeBg: '#DCFCE7', badgeColor: '#15803D', borderColor: '#86EFAC', weight: 1.0 },
  { code: 'HD', label: 'Half Day', badgeBg: '#FFEDD5', badgeColor: '#C2410C', borderColor: '#FDBA74', weight: 0.5 },
  { code: 'PL', label: 'Paid Leave', badgeBg: '#F3E8FF', badgeColor: '#7E22CE', borderColor: '#D8B4FE', weight: 1.0 },
  { code: 'UL', label: 'Unpaid Leave (LOP)', badgeBg: '#FEF3C7', badgeColor: '#B45309', borderColor: '#FDE68A', weight: 0.0 },
  { code: 'A', label: 'Absent (LOP)', badgeBg: '#FEE2E2', badgeColor: '#B91C1C', borderColor: '#FCA5A5', weight: 0.0 },
  { code: 'H', label: 'Holiday', badgeBg: '#DBEAFE', badgeColor: '#1E40AF', borderColor: '#93C5FD', weight: 0.0 },
  { code: 'WFH', label: 'Work From Home', badgeBg: '#E0E7FF', badgeColor: '#4338CA', borderColor: '#A5B4FC', weight: 1.0 },
  { code: 'FV', label: 'Field Visit', badgeBg: '#CFFAFE', badgeColor: '#0E7490', borderColor: '#67E8F9', weight: 1.0 },
  { code: 'MU', label: 'Missed Punch-Out', badgeBg: '#FEF3C7', badgeColor: '#B45309', borderColor: '#FDE68A', weight: 0.0 },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const YEARS = [2024, 2025, 2026, 2027];

interface CustomCellEdit {
  status: AttendanceStatusCode;
  checkIn: string;
  checkOut: string;
  remarks: string;
}

interface MusterRollModuleProps {
  searchQueryProp?: string;
  fromDateProp?: string;
  toDateProp?: string;
}

export const MusterRollModule: React.FC<MusterRollModuleProps> = ({
  searchQueryProp,
  fromDateProp,
  toDateProp
}) => {
  const {
    employees,
    attendanceRecords,
    leaveRequests,
    currentUser,
    shifts,
    holidayPolicies,
    businessSettings,
    companyInfo,
    overtimePolicy,
    departmentOtPolicies,
    employeeOtPolicies,
    payrollSettingsConfig,
    attendancePolicies,
    addManualAttendanceRecord
  } = useHRMS();

  const isHrOrAdmin = isOwnerOrCEO(currentUser) || ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(currentUser?.role || '');

  // ---------------------------------------------------------------------------
  // 1. FILTER STATES (Default: Current Month & Year)
  // ---------------------------------------------------------------------------
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Synchronize fromDateProp to selectedMonth and selectedYear if passed
  useEffect(() => {
    if (fromDateProp) {
      const normFrom = normalizeToYYYYMMDD(fromDateProp);
      const parts = normFrom.split('-');
      if (parts.length === 3) {
        const yr = parseInt(parts[0], 10);
        const mo = parseInt(parts[1], 10) - 1;
        if (!isNaN(yr) && yr > 2000) setSelectedYear(yr);
        if (!isNaN(mo) && mo >= 0 && mo <= 11) setSelectedMonth(mo);
      }
    }
  }, [fromDateProp, toDateProp]);

  // Combine external searchQueryProp and internal searchQuery
  const activeSearchQuery = (searchQueryProp !== undefined ? searchQueryProp : searchQuery).trim().toLowerCase();
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);

  // Loading & Modals State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedEmpDetail, setSelectedEmpDetail] = useState<Employee | null>(null);
  
  // Day Cell Detail & Edit Modal State
  const [selectedCellDetail, setSelectedCellDetail] = useState<{
    employee: Employee;
    dateStr: string;
    dayNum: number;
    dayName: string;
    currentStatus: AttendanceStatusCode;
    checkIn: string;
    checkOut: string;
    workingHours: string;
    shift: string;
    location: string;
    remarks: string;
  } | null>(null);

  const [editForm, setEditForm] = useState<{
    status: AttendanceStatusCode;
    checkIn: string;
    checkOut: string;
    remarks: string;
  }>({ status: 'P', checkIn: '09:00 AM', checkOut: '06:00 PM', remarks: '' });

  // Custom User Edits Map: Key = `empId_dateStr`
  const [customEdits, setCustomEdits] = useState<Record<string, CustomCellEdit>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState<boolean>(false);

  // Time Picker Popover State & Element References
  const [activeTimePicker, setActiveTimePicker] = useState<'checkIn' | 'checkOut' | null>(null);
  const checkInPickerRef = React.useRef<HTMLDivElement>(null);
  const checkOutPickerRef = React.useRef<HTMLDivElement>(null);
  const checkInNativeRef = React.useRef<HTMLInputElement>(null);
  const checkOutNativeRef = React.useRef<HTMLInputElement>(null);

  // Close time picker when clicking outside
  useEffect(() => {
    if (!activeTimePicker) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        activeTimePicker === 'checkIn' &&
        checkInPickerRef.current &&
        !checkInPickerRef.current.contains(target)
      ) {
        setActiveTimePicker(null);
      } else if (
        activeTimePicker === 'checkOut' &&
        checkOutPickerRef.current &&
        !checkOutPickerRef.current.contains(target)
      ) {
        setActiveTimePicker(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeTimePicker]);

  // Resolve shift times for selected employee in modal
  const selectedEmpShift = useMemo(() => {
    if (!selectedCellDetail?.employee) return shifts[0];
    return resolveEmployeeAssignedShift(selectedCellDetail.employee, shifts);
  }, [selectedCellDetail, shifts]);

  const shiftRangeMatch = (selectedCellDetail?.employee?.workShift || '').match(/\(([^)]+)\)/)?.[1]?.trim();
  let resolvedShiftStartTime = selectedEmpShift?.startTime;
  let resolvedShiftEndTime = selectedEmpShift?.endTime;
  if (shiftRangeMatch) {
    const parts = shiftRangeMatch.split('-').map(p => p.trim());
    if (parts[0]) resolvedShiftStartTime = parts[0];
    if (parts[1]) resolvedShiftEndTime = parts[1];
  }
  const shiftStartTimeStr = normalizeTimeString(resolvedShiftStartTime || selectedEmpShift?.startTime || '09:00 AM') || '09:00 AM';
  const shiftEndTimeStr = normalizeTimeString(resolvedShiftEndTime || selectedEmpShift?.endTime || '06:00 PM') || '06:00 PM';

  // Trigger brief skeleton loader on month/year change
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 200);
    return () => clearTimeout(timer);
  }, [selectedMonth, selectedYear, selectedDepartment, selectedLocation, selectedStatusFilter]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDepartment, selectedLocation, selectedStatusFilter, selectedMonth, selectedYear, rowsPerPage]);

  // ---------------------------------------------------------------------------
  // 2. DYNAMIC CALENDAR GENERATION (Handles Leap Years & Short Months)
  // ---------------------------------------------------------------------------
  const calendarDays = useMemo(() => {
    // If fromDateProp and toDateProp are passed, strictly generate calendar columns for that exact date range!
    if (fromDateProp && toDateProp) {
      const normFrom = normalizeToYYYYMMDD(fromDateProp);
      const normTo = normalizeToYYYYMMDD(toDateProp);
      if (normFrom && normTo) {
        const [startStr, endStr] = normFrom <= normTo ? [normFrom, normTo] : [normTo, normFrom];
        const [y1, m1, d1] = startStr.split('-').map(n => parseInt(n, 10));
        const [y2, m2, d2] = endStr.split('-').map(n => parseInt(n, 10));
        const current = new Date(y1, m1 - 1, d1, 12, 0, 0);
        const end = new Date(y2, m2 - 1, d2, 12, 0, 0);
        const result = [];
        let count = 0;
        while (current <= end && count < 62) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          const d = String(current.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${d}`;
          const dayOfWeek = current.getDay(); // 0 = Sun, 6 = Sat
          const dayName = current.toLocaleDateString('en-US', { weekday: 'short' });
          const isSunday = dayOfWeek === 0;
          const isSaturday = dayOfWeek === 6;
          const isHoliday = (holidayPolicies || []).some(h => h.date === dateStr);

          result.push({
            dayNum: current.getDate(),
            dateStr,
            dayName,
            isSunday,
            isSaturday,
            isWeekend: isSunday,
            isHoliday
          });
          current.setDate(current.getDate() + 1);
          count++;
        }
        if (result.length > 0) return result;
      }
    }

    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const result = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(selectedYear, selectedMonth, day, 12, 0, 0);
      const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const isSunday = dayOfWeek === 0;
      const isSaturday = dayOfWeek === 6;
      // Dynamic check against company declared holidays
      const isHoliday = (holidayPolicies || []).some(h => h.date === dateStr);

      result.push({
        dayNum: day,
        dateStr,
        dayName,
        isSunday,
        isSaturday,
        isWeekend: isSunday,
        isHoliday
      });
    }
    return result;
  }, [selectedMonth, selectedYear, holidayPolicies, fromDateProp, toDateProp]);

  // Extract unique departments & locations for filter dropdowns
  const availableDepartments = useMemo(() => {
    const set = new Set<string>();
    employees.filter(e => !isOwnerOrCEO(e)).forEach(e => { if (e.department) set.add(e.department); });
    return Array.from(set).sort();
  }, [employees]);

  const availableLocations = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => { if (e.address) set.add(e.address); });
    return Array.from(set).sort();
  }, [employees]);

  // ---------------------------------------------------------------------------
  // 3. ATTENDANCE RESOLUTION ENGINE PER EMPLOYEE & DAY
  // ---------------------------------------------------------------------------
  const getCellAttendance = (employee: Employee, dayItem: { dayNum: number; dateStr: string; dayName: string; isSunday: boolean; isHoliday: boolean }) => {
    const editKey = `${employee.employeeId}_${dayItem.dateStr}`;
    const editKeyUid = employee.id ? `${employee.id}_${dayItem.dateStr}` : '';
    const edit = customEdits[editKey] || (editKeyUid ? customEdits[editKeyUid] : undefined);
    if (edit) {
      return {
        status: edit.status,
        checkIn: edit.checkIn,
        checkOut: edit.status === 'MU' ? '-' : edit.checkOut,
        workingHours: edit.status === 'P' || edit.status === 'OD' || edit.status === 'WFH' ? '08:45' : edit.status === 'HD' ? '04:15' : '00:00',
        shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
        location: employee.address || 'Corporate HQ',
        remarks: edit.remarks || (edit.status === 'MU' ? 'Missed Punch-Out' : 'Manually updated')
      };
    }

    const empCode = (employee.employeeId || '').toLowerCase().trim();
    const empUid = (employee.id || '').toLowerCase().trim();
    const empFullName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim().toLowerCase();
    const targetDateNorm = normalizeToYYYYMMDD(dayItem.dateStr);

    const attRec = attendanceRecords.find(a => {
      const aEmp = (a.employeeId || '').toLowerCase().trim();
      const aDate = normalizeToYYYYMMDD(a.date || a.shiftDate);
      return (aEmp === empCode || (empUid && aEmp === empUid)) && aDate === targetDateNorm;
    });

    // Check Approved Leave / WFH / Field Visit Requests (with ID, UUID, name & normalized date matching)
    const leaveRec = leaveRequests.find(l => {
      if (l.status !== 'Approved') return false;
      const lEmp = (l.employeeId || '').toLowerCase().trim();
      const lName = (l.employeeName || '').toLowerCase().trim();
      const matchEmp = (empCode && lEmp === empCode) || (empUid && lEmp === empUid) || (empFullName && lName === empFullName);
      if (!matchEmp) return false;
      const lStart = normalizeToYYYYMMDD(l.startDate) || l.startDate;
      const lEnd = normalizeToYYYYMMDD(l.endDate) || l.endDate;
      return targetDateNorm >= lStart && targetDateNorm <= lEnd;
    });

    if (leaveRec) {
      const lType = (leaveRec.leaveType || '').toLowerCase();
      if (lType.includes('wfo') || lType.includes('office') || lType.includes('wfh') || lType.includes('home')) {
        return {
          status: 'WFH' as AttendanceStatusCode,
          checkIn: attRec?.checkIn ? formatTimeDisplay(attRec.checkIn, '09:00 AM') : '09:00 AM',
          checkOut: attRec?.checkOut && attRec.checkOut !== '--:--' ? formatTimeDisplay(attRec.checkOut, '06:00 PM') : '06:00 PM',
          workingHours: attRec && toNum(attRec.workingHours) > 0 ? formatHoursAndMinutes(attRec.workingHours) : '8h 30m',
          shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
          location: 'Work From Home (Approved)',
          remarks: `WFH: ${leaveRec.reason || 'Approved WFH'}`
        };
      }
      if (lType.includes('field') || lType.includes('visit') || lType.includes('duty')) {
        return {
          status: 'FV' as AttendanceStatusCode,
          checkIn: attRec?.checkIn ? formatTimeDisplay(attRec.checkIn, '09:30 AM') : '09:30 AM',
          checkOut: attRec?.checkOut && attRec.checkOut !== '--:--' ? formatTimeDisplay(attRec.checkOut, '06:00 PM') : '06:00 PM',
          workingHours: attRec && toNum(attRec.workingHours) > 0 ? formatHoursAndMinutes(attRec.workingHours) : '8h 30m',
          shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
          location: 'Field Visit',
          remarks: `Field Visit: ${leaveRec.reason || 'Client/Site Visit'}`
        };
      }

      const isExplicitUnpaid = lType.includes('unpaid') || lType.includes('lwp') || lType.includes('loss of pay') || lType.includes('without pay');
      const isOverriddenUnpaid = leaveRec.hrOverride?.adjustedPayType === 'UNPAID_LEAVE';
      const isOverriddenPaid = leaveRec.hrOverride?.adjustedPayType === 'PAID_LEAVE';
      const isZeroPaidDays = leaveRec.paidDaysCount !== undefined && leaveRec.unpaidDaysCount !== undefined && leaveRec.paidDaysCount <= 0 && leaveRec.unpaidDaysCount > 0;
      const isUnpaidLeave = (isExplicitUnpaid || isOverriddenUnpaid || isZeroPaidDays) && !isOverriddenPaid;

      return {
        status: (isUnpaidLeave ? 'UL' : 'PL') as AttendanceStatusCode,
        checkIn: '-',
        checkOut: '-',
        workingHours: '00:00',
        shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
        location: isUnpaidLeave ? 'On Leave (Unpaid - LOP)' : 'On Leave (Paid)',
        remarks: isUnpaidLeave
          ? `${leaveRec.leaveType} (Unpaid / Loss of Pay): ${leaveRec.reason || 'Approved Unpaid Leave'}`
          : `${leaveRec.leaveType} (Paid Leave): ${leaveRec.reason || 'Approved Paid Leave'}`
      };
    }

    // Check explicit Attendance Record first (including HR/CEO overrides on Sundays or Holidays!)
    if (attRec) {
      const st = String(attRec.status || '').toLowerCase().trim();
      const methodLower = String(attRec.method || '').toLowerCase().trim();
      const reasonLower = String(attRec.reason || '').toLowerCase().trim();

      if (st === 'holiday' || st === 'week off' || methodLower.includes('holiday')) {
        return {
          status: 'H' as AttendanceStatusCode,
          checkIn: '-',
          checkOut: '-',
          workingHours: '00:00',
          shift: 'Holiday',
          location: 'Company Wide',
          remarks: attRec.reason || (dayItem.isSunday ? 'Weekly Holiday' : 'Official Public Holiday')
        };
      }

      if (st === 'on leave') {
        return {
          status: 'PL' as AttendanceStatusCode,
          checkIn: '-',
          checkOut: '-',
          workingHours: '00:00',
          shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
          location: 'On Leave',
          remarks: attRec.reason || 'Approved Leave'
        };
      }

      const assignedShift = resolveEmployeeAssignedShift(employee, shifts);
      const hasIn = Boolean(
        attRec.checkIn &&
        attRec.checkIn !== '-' &&
        attRec.checkIn !== '--:--' &&
        String(attRec.checkIn).trim() !== '' &&
        !String(attRec.checkIn).toLowerCase().includes('absent') &&
        !String(attRec.checkIn).toLowerCase().includes('none')
      );
      const hasOut = Boolean(
        attRec.checkOut &&
        attRec.checkOut !== '-' &&
        attRec.checkOut !== '--:--' &&
        String(attRec.checkOut).trim() !== '' &&
        !String(attRec.checkOut).toLowerCase().includes('progress') &&
        !String(attRec.checkOut).toLowerCase().includes('missed') &&
        !String(attRec.checkOut).toLowerCase().includes('none')
      );

      // Evaluate whether the shift has completed
      const shiftEnded = isShiftEnded(dayItem.dateStr, assignedShift);

      let code: AttendanceStatusCode = 'P';
      let isMu = false;

      if (st === 'mu' || st === 'missed punch-out' || st === 'missed punch out' || st === 'missing punch') {
        code = 'MU';
        isMu = true;
      } else if (hasIn && !hasOut && shiftEnded && st !== 'absent' && st !== 'half day' && st !== 'hd') {
        // Recorded Check-In but no Check-Out after applicable shift has ended -> Missed Punch-Out (MU)
        code = 'MU';
        isMu = true;
      } else if (st === 'absent') {
        code = (methodLower.includes('unpaid') || reasonLower.includes('unpaid')) ? 'UL' : 'A';
      } else if (st === 'half day' || st === 'half-day' || st === 'hd') {
        code = 'HD';
      } else if (st.includes('wfo') || st.includes('office') || st.includes('wfh') || st.includes('home')) {
        code = 'WFH';
      } else if (st.includes('duty') || st.includes('field') || st.includes('visit') || st.includes('on duty') || methodLower.includes('field')) {
        code = 'FV';
      } else {
        code = 'P';
      }

      const stdShiftHours = resolveEmployeeStandardShiftHours(employee, shifts);
      let workedDecimalHours = 0;

      let whDisplay = '--:--';
      if (code === 'A' || code === 'UL' || isMu) {
        whDisplay = '00:00';
      } else if (hasIn && hasOut) {
        const inM = parseTimeToMinutes ? parseTimeToMinutes(attRec.checkIn) : 0;
        const outM = parseTimeToMinutes ? parseTimeToMinutes(attRec.checkOut) : 0;
        let diff = outM - inM;
        if (diff < 0) diff += 24 * 60;
        workedDecimalHours = diff / 60;
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        whDisplay = `${h}h ${m}m`;
      } else if (toNum(attRec.workingHours) > 0 && hasOut) {
        workedDecimalHours = toNum(attRec.workingHours);
        whDisplay = `${workedDecimalHours.toFixed(1)} hrs`;
      } else if (hasIn && !shiftEnded) {
        whDisplay = 'In Progress';
      } else {
        whDisplay = '00:00';
      }

      // Automatic Half Day Rule: if worked hours > 0 and < 70% of shift working hours (e.g. < 6.3h / < 6h on a 9h shift), mark as Half Day (HD)
      if (code === 'P' && workedDecimalHours > 0 && workedDecimalHours < stdShiftHours * 0.7) {
        code = 'HD';
      }

      const outDisplay = (code === 'A' || code === 'UL' || isMu)
        ? '-'
        : (hasOut ? formatTimeDisplay(attRec.checkOut, '--:--') : (hasIn && !shiftEnded ? 'In Progress' : '-'));

      return {
        status: code,
        checkIn: (code === 'A' || code === 'UL') ? '-' : formatTimeDisplay(attRec.checkIn, '--:--'),
        checkOut: outDisplay,
        workingHours: whDisplay,
        shift: employee.workShift || assignedShift.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
        location: attRec.location?.address || employee.address || 'Main Campus',
        remarks: attRec.reason || (
          isMu ? 'Missed Punch-Out — Check-in recorded but no Check-out after shift ended' :
          code === 'A' ? 'Marked Absent by HR/CEO' :
          code === 'UL' ? 'Unpaid Leave (LOP)' :
          code === 'HD' ? `Half Day (< 70% of ${stdShiftHours}h shift — 0.5 Day Salary)` :
          attRec.status === 'Late' ? 'Late Check-in logged' :
          code === 'FV' ? 'Field Visit active' :
          code === 'WFH' ? 'Work From Home' :
          hasIn && !shiftEnded ? 'Shift currently in progress' :
          'Regular Attendance'
        )
      };
    }

    // Check Official Holiday (only when not overridden by an explicit attendance record)
    if (dayItem.isHoliday) {
      return {
        status: 'H' as AttendanceStatusCode,
        checkIn: '-',
        checkOut: '-',
        workingHours: '00:00',
        shift: 'Holiday',
        location: 'Company Wide',
        remarks: 'Official Public Holiday'
      };
    }

    // Check Sunday / Weekly Off -> Mapped to Holiday (only when not overridden by an explicit attendance record)
    if (dayItem.isSunday) {
      return {
        status: 'H' as AttendanceStatusCode,
        checkIn: '-',
        checkOut: '-',
        workingHours: '00:00',
        shift: 'Holiday',
        location: 'Offsite',
        remarks: 'Weekly Holiday'
      };
    }

    // Check if employee had a Rejected leave request on this date
    const rejectedLeave = leaveRequests.find(l => {
      if (l.status !== 'Rejected') return false;
      const lEmp = (l.employeeId || '').toLowerCase().trim();
      const lName = (l.employeeName || '').toLowerCase().trim();
      const matchEmp = (empCode && lEmp === empCode) || (empUid && lEmp === empUid) || (empFullName && lName === empFullName);
      if (!matchEmp) return false;
      const lStart = normalizeToYYYYMMDD(l.startDate) || l.startDate;
      const lEnd = normalizeToYYYYMMDD(l.endDate) || l.endDate;
      return targetDateNorm >= lStart && targetDateNorm <= lEnd;
    });

    // Check Employee Joining and Exit Boundaries:
    // If date is strictly before joining date (and no explicit attendance record exists) -> Not Employed / Pre-joining
    const empJoiningIso = normalizeToYYYYMMDD(
      employee.joiningDate ||
      (employee as any).dateOfJoining ||
      (employee as any).profile_data?.joiningDate
    );
    if (empJoiningIso && targetDateNorm < empJoiningIso) {
      return {
        status: '-' as AttendanceStatusCode,
        checkIn: '-',
        checkOut: '-',
        workingHours: '00:00',
        shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
        location: employee.address || 'Corporate HQ',
        remarks: 'Not Employed / Pre-joining'
      };
    }

    const empExitIso = normalizeToYYYYMMDD(
      (employee as any).exitDate ||
      (employee as any).relievingDate ||
      (employee as any).lastWorkingDate
    );
    if (empExitIso && targetDateNorm > empExitIso) {
      return {
        status: '-' as AttendanceStatusCode,
        checkIn: '-',
        checkOut: '-',
        workingHours: '00:00',
        shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
        location: employee.address || 'Corporate HQ',
        remarks: 'Relieved / Post-exit'
      };
    }

    // Unmarked / No attendance record found in database -> Mark as Absent (A - Loss of Pay)
    return {
      status: 'A' as AttendanceStatusCode,
      checkIn: '-',
      checkOut: '-',
      workingHours: '00:00',
      shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
      location: employee.address || 'Corporate HQ',
      remarks: rejectedLeave
        ? `Absent (Loss of Pay) — ${rejectedLeave.leaveType} Request Rejected`
        : 'Uninformed Absent (Loss of Pay) — No punch or approved leave'
    };
  };

  // ---------------------------------------------------------------------------
  // 4. FILTERING & COMPUTATION OF SUMMARY TOTALS
  // ---------------------------------------------------------------------------
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (isOwnerOrCEO(emp) || isAttendanceExemptEmployee(emp)) return false;

      // Strictly show active employees in Muster Roll
      const statusStr = (emp.status || '').toLowerCase().trim();
      const accountStatusStr = ((emp as any).accountStatus || '').toLowerCase().trim();
      const profileStatusStr = ((emp as any).profile_data?.status || '').toLowerCase().trim();
      if (
        statusStr === 'inactive' ||
        statusStr === 'terminated' ||
        accountStatusStr === 'deactivated' ||
        accountStatusStr === 'disabled' ||
        profileStatusStr === 'inactive' ||
        (emp as any).isActive === false ||
        emp.employeeId === 'EMP-000'
      ) {
        return false;
      }
      // Department Filter
      if (selectedDepartment !== 'All' && emp.department !== selectedDepartment) {
        return false;
      }
      // Location Filter
      if (selectedLocation !== 'All' && !(emp.address || '').includes(selectedLocation)) {
        return false;
      }
      // Search Filter (ID, Name, Dept, Designation)
      if (activeSearchQuery) {
        const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
        const empId = (emp.employeeId || '').toLowerCase();
        const dept = (emp.department || '').toLowerCase();
        const desig = (emp.designation || '').toLowerCase();

        if (!fullName.includes(activeSearchQuery) && !empId.includes(activeSearchQuery) && !dept.includes(activeSearchQuery) && !desig.includes(activeSearchQuery)) {
          return false;
        }
      }

      // Status Filter
      if (selectedStatusFilter !== 'All') {
        const hasStatus = calendarDays.some(dayItem => {
          const res = getCellAttendance(emp, dayItem);
          return res.status === selectedStatusFilter;
        });
        if (!hasStatus) return false;
      }

      return true;
    }).sort((a, b) => {
      const matchA = String(a.employeeId || '').match(/(\d+)/);
      const matchB = String(b.employeeId || '').match(/(\d+)/);
      const numA = matchA ? parseInt(matchA[1], 10) : Number.MAX_SAFE_INTEGER;
      const numB = matchB ? parseInt(matchB[1], 10) : Number.MAX_SAFE_INTEGER;
      if (numA !== numB) return numA - numB;
      return String(a.employeeId || '').localeCompare(String(b.employeeId || ''), undefined, { numeric: true });
    });
  }, [employees, attendanceRecords, leaveRequests, selectedDepartment, selectedLocation, activeSearchQuery, selectedStatusFilter, calendarDays, customEdits]);

  // All Filtered Employees
  const paginatedEmployees = filteredEmployees;

  // Compute Overall Dynamic Summary Totals for Compact Cards
  const summaryTotals = useMemo(() => {
    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let weeklyOffCount = 0;
    let holidayCount = 0;
    let halfDayCount = 0;
    let odCount = 0;
    let wfhCount = 0;
    let muCount = 0;

    filteredEmployees.forEach(emp => {
      calendarDays.forEach(dayItem => {
        const res = getCellAttendance(emp, dayItem);
        switch (res.status) {
          case 'P': presentCount++; break;
          case 'A':
          case 'UL': absentCount++; break;
          case 'MU': muCount++; break;
          case 'PL':
          case 'L': leaveCount++; break;
          case 'WO': weeklyOffCount++; break;
          case 'H': holidayCount++; break;
          case 'HD': halfDayCount++; break;
          case 'FV':
          case 'OD': odCount++; break;
          case 'WFH': wfhCount++; break;
          case '-':
          case 'NA': break;
        }
      });
    });

    return {
      totalEmps: filteredEmployees.length,
      presentCount,
      absentCount,
      leaveCount,
      weeklyOffCount,
      holidayCount,
      halfDayCount,
      odCount,
      wfhCount,
      muCount
    };
  }, [filteredEmployees, attendanceRecords, leaveRequests, calendarDays, customEdits]);

  // ---------------------------------------------------------------------------
  // 5. EVENT HANDLERS & EXPORT / PRINT
  // ---------------------------------------------------------------------------
  const handleClearFilters = () => {
    setSelectedMonth(today.getMonth());
    setSelectedYear(today.getFullYear());
    setSelectedDepartment('All');
    setSelectedLocation('All');
    setSelectedStatusFilter('All');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handleOpenCellModal = (employee: Employee, dayItem: { dayNum: number; dateStr: string; dayName: string; isSunday: boolean; isHoliday: boolean }) => {
    const data = getCellAttendance(employee, dayItem);
    const isMu = data.status === 'MU';

    const assignedShift = resolveEmployeeAssignedShift(employee, shifts);
    const rangeMatch = (employee.workShift || '').match(/\(([^)]+)\)/)?.[1]?.trim();
    let sStart = assignedShift?.startTime;
    let sEnd = assignedShift?.endTime;
    if (rangeMatch) {
      const parts = rangeMatch.split('-').map(p => p.trim());
      if (parts[0]) sStart = parts[0];
      if (parts[1]) sEnd = parts[1];
    }
    const defaultIn = normalizeTimeString(sStart || '09:00 AM') || '09:00 AM';
    const defaultOut = normalizeTimeString(sEnd || '06:00 PM') || '06:00 PM';

    setSelectedCellDetail({
      employee,
      dateStr: dayItem.dateStr,
      dayNum: dayItem.dayNum,
      dayName: dayItem.dayName,
      currentStatus: data.status,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      workingHours: data.workingHours,
      shift: data.shift,
      location: data.location,
      remarks: data.remarks
    });
    setValidationError(null);
    setActiveTimePicker(null);

    const hasValidIn = data.checkIn && data.checkIn !== '-' && data.checkIn !== '--:--';
    const hasValidOut = data.checkOut && data.checkOut !== '-' && data.checkOut !== '--:--' && data.checkOut !== 'In Progress';

    setEditForm({
      status: data.status,
      checkIn: hasValidIn ? (normalizeTimeString(data.checkIn) || data.checkIn) : (data.status === 'P' || data.status === 'HD' || isMu ? defaultIn : ''),
      checkOut: isMu ? '' : (hasValidOut ? (normalizeTimeString(data.checkOut) || data.checkOut) : ''),
      remarks: ''
    });
  };

  const handleSaveCellEdit = async () => {
    if (!selectedCellDetail) return;
    const emp = selectedCellDetail.employee;
    const dateStr = selectedCellDetail.dateStr;
    const editKey = `${emp.employeeId}_${dateStr}`;
    const editKeyUid = emp.id ? `${emp.id}_${dateStr}` : '';

    const isHrOrAdmin = isOwnerOrCEO(currentUser) || ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(currentUser?.role || '');
    if (!isHrOrAdmin) {
      setValidationError('Unauthorized: Only HR or CEO administrators can modify attendance records.');
      return;
    }

    const isNonWorking =
      editForm.status === 'A' ||
      editForm.status === 'UL' ||
      editForm.status === 'H' ||
      editForm.status === 'WO' ||
      editForm.status === 'PL' ||
      editForm.status === 'L';

    const isMu = editForm.status === 'MU';

    let cleanCheckIn = isNonWorking ? null : (editForm.checkIn && editForm.checkIn !== '-' && editForm.checkIn !== '--:--' ? (normalizeTimeString(editForm.checkIn) || editForm.checkIn) : null);
    let cleanCheckOut = isNonWorking || isMu ? null : (editForm.checkOut && editForm.checkOut !== '-' && editForm.checkOut !== '--:--' ? (normalizeTimeString(editForm.checkOut) || editForm.checkOut) : null);

    // If status is Present or Half Day, ensure valid checkIn and checkOut exist so it never reverts to MU
    if (!isNonWorking && !isMu && (editForm.status === 'P' || editForm.status === 'HD')) {
      if (!cleanCheckIn) {
        cleanCheckIn = shiftStartTimeStr || '09:00 AM';
      }
      if (!cleanCheckOut) {
        cleanCheckOut = shiftEndTimeStr || '06:00 PM';
      }
    }

    let computedWorkingHours = 0;
    let computedOtHours = 0;

    if (!isNonWorking && !isMu && cleanCheckIn && cleanCheckOut) {
      const session = resolveOvernightAttendanceSession({
        attendanceDate: dateStr,
        checkIn: cleanCheckIn,
        checkOut: cleanCheckOut,
        allowAutoRollSameDateIsoCheckOut: true,
      });
      if (session.isValid) {
        computedWorkingHours = session.workingHours;
        computedOtHours = session.otHours;
      } else {
        const inM = parseTimeToMinutes(cleanCheckIn);
        const outM = parseTimeToMinutes(cleanCheckOut);
        if (inM && outM && outM > inM) {
          computedWorkingHours = parseFloat(((outM - inM) / 60).toFixed(2));
        } else {
          computedWorkingHours = editForm.status === 'HD' ? 4.0 : 8.5;
        }
      }
    } else if (editForm.status === 'HD') {
      computedWorkingHours = 4.0;
    }

    const mappedRecordStatus: AttendanceRecord['status'] =
      editForm.status === 'MU'
        ? 'Missing Punch'
        : editForm.status === 'A' || editForm.status === 'UL'
        ? 'Absent'
        : editForm.status === 'PL' || editForm.status === 'L' || editForm.status === 'ML'
        ? 'On Leave'
        : editForm.status === 'H' || editForm.status === 'WO'
        ? 'Holiday'
        : editForm.status === 'WFH' || editForm.status === 'WFO'
        ? 'Work From Home'
        : editForm.status === 'HD'
        ? 'Half Day'
        : 'Present';

    const reasonToSave = editForm.status === 'MU'
      ? 'Missed Punch-Out'
      : `Regularized from Muster Roll: ${editForm.status}`;

    setIsSavingEdit(true);
    setValidationError(null);

    try {
      // 1. Authoritative Backend Correction via API
      await correctAttendanceRecord({
        employeeId: emp.id || emp.employeeId,
        date: dateStr,
        status: editForm.status === 'MU' ? 'Missed Punch-Out' : mappedRecordStatus,
        checkIn: cleanCheckIn,
        checkOut: cleanCheckOut,
        workingHours: isNonWorking || isMu ? 0 : computedWorkingHours,
        otHours: isNonWorking || isMu ? 0 : computedOtHours,
        reason: reasonToSave,
      }).catch(err => {
        console.warn('[MusterRoll] Backend correctAttendanceRecord warning:', err);
      });

      // 2. Cascade into in-memory HRMS context, audit logs & notifications
      addManualAttendanceRecord({
        employeeId: emp.id || emp.employeeId,
        date: dateStr,
        status: mappedRecordStatus,
        checkIn: cleanCheckIn,
        checkOut: cleanCheckOut,
        workingHours: isNonWorking || isMu ? 0 : (computedWorkingHours > 0 ? computedWorkingHours : (editForm.status === 'HD' ? 4 : 8.5)),
        halfDayType: editForm.status === 'HD' ? 'First Half' : undefined,
        otHours: isNonWorking || isMu ? 0 : computedOtHours,
        reason: reasonToSave,
        addedBy: `${currentUser?.name || 'Admin'} (${currentUser?.role || 'HR/CEO'})`
      });

      // 3. Update custom user edits map for immediate local feedback
      setCustomEdits(prev => {
        const next: Record<string, CustomCellEdit> = {
          ...prev,
          [editKey]: {
            status: editForm.status,
            checkIn: cleanCheckIn || '-',
            checkOut: cleanCheckOut || '-',
            remarks: reasonToSave
          }
        };
        if (editKeyUid) {
          next[editKeyUid] = {
            status: editForm.status,
            checkIn: cleanCheckIn || '-',
            checkOut: cleanCheckOut || '-',
            remarks: reasonToSave
          };
        }
        return next;
      });

      setSelectedCellDetail(null);
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to save attendance correction.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Export Data Preparation
  const prepareExportData = () => {
    const columns = [
      { key: 'empId', label: 'Employee Code' },
      { key: 'empName', label: 'Employee Name' },
      { key: 'dept', label: 'Department' },
      { key: 'desig', label: 'Designation' },
      ...calendarDays.map(d => ({ key: `day_${d.dayNum}`, label: `${String(d.dayNum).padStart(2, '0')} (${d.dayName})` })),
      { key: 'totalP', label: 'Present (P)' },
      { key: 'totalHD', label: 'Half Day (HD)' },
      { key: 'totalPL', label: 'Paid Leave (PL)' },
      { key: 'totalA', label: 'Absent / LOP (A/UL)' },
      { key: 'totalH', label: 'Holiday (H)' },
      { key: 'totalWFH', label: 'Work From Home (WFH)' },
      { key: 'totalFV', label: 'Field Visit (FV)' },
      { key: 'totalMU', label: 'Missed Punch-Out (MU)' },
      { key: 'totalRate', label: 'Attendance Rate (%)' }
    ];

    const data: Record<string, any>[] = [];

    filteredEmployees.forEach(emp => {
      let p = 0, hd = 0, pl = 0, a = 0, h = 0, wfh = 0, fv = 0, mu = 0;
      const row: Record<string, any> = {
        empId: emp.employeeId,
        empName: `${emp.firstName} ${emp.lastName}`,
        dept: emp.department,
        desig: emp.designation
      };

      let notEmployed = 0;
      calendarDays.forEach(dayItem => {
        const att = getCellAttendance(emp, dayItem);
        row[`day_${dayItem.dayNum}`] = att.status;
        switch (att.status) {
          case 'P': p++; break;
          case 'MU': mu++; break;
          case 'PL':
          case 'L':
          case 'ML': pl++; break;
          case 'UL':
          case 'A': a++; break;
          case 'H':
          case 'WO': h++; break;
          case 'WFH':
          case 'WFO': wfh++; break;
          case 'FV':
          case 'FD':
          case 'OD': fv++; break;
          case 'HD': hd++; p += 0.5; a += 0.5; break;
          case '-':
          case 'NA': notEmployed++; break;
          default: p++; break;
        }
      });

      const workingDays = Math.max(1, calendarDays.length - h - notEmployed);
      const effectivePresent = p + pl + wfh + fv;
      const rate = Math.min(100, Math.round((effectivePresent / workingDays) * 100));

      row.totalP = p;
      row.totalHD = hd;
      row.totalPL = pl;
      row.totalA = a;
      row.totalH = h;
      row.totalWFH = wfh;
      row.totalFV = fv;
      row.totalMU = mu;
      row.totalRate = `${rate}%`;

      data.push(row);
    });

    return { columns, data };
  };

  const handleExportCSV = () => {
    const { columns, data } = prepareExportData();
    const fStr = fromDateProp ? normalizeToYYYYMMDD(fromDateProp) : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const tStr = toDateProp ? normalizeToYYYYMMDD(toDateProp) : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(calendarDays.length).padStart(2, '0')}`;
    downloadCSV(data, `Muster_Roll_${fStr}_to_${tStr}`, columns);
    setExportDropdownOpen(false);
  };

  const handleExportExcel = () => {
    const fromDate = fromDateProp ? normalizeToYYYYMMDD(fromDateProp) : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const lastDay = calendarDays.length;
    const toDate = toDateProp ? normalizeToYYYYMMDD(toDateProp) : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    downloadPagarBookMusterRollExcel(
      filteredEmployees,
      attendanceRecords,
      leaveRequests,
      fromDate,
      toDate,
      businessSettings?.businessName || companyInfo?.companyName || 'BUSINZ',
      shifts,
      holidayPolicies,
      {
        overtimePolicy,
        departmentOtPolicies,
        employeeOtPolicies,
        payrollSettingsConfig,
        attendancePolicies
      }
    );
    setExportDropdownOpen(false);
  };

  const handleExportPDF = () => {
    const { columns, data } = prepareExportData();
    const fStr = fromDateProp ? normalizeToYYYYMMDD(fromDateProp) : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const tStr = toDateProp ? normalizeToYYYYMMDD(toDateProp) : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(calendarDays.length).padStart(2, '0')}`;
    downloadPDF(
      data, 
      `Muster Roll Register (${fStr} to ${tStr})`, 
      `Muster_Roll_${fStr}_to_${tStr}`, 
      columns
    );
    setExportDropdownOpen(false);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ backgroundColor: 'transparent', minHeight: 'auto', padding: 0 }} className="muster-roll-wrapper">
      
      {/* Printable CSS Header Override */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .muster-roll-printable-area, .muster-roll-printable-area * {
            visibility: visible;
          }
          .muster-roll-printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="muster-roll-printable-area">
        

        {/* =========================================================================
            UNIFIED MUSTER ROLL CARD (LEGEND + TABLE)
            ========================================================================= */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
          overflow: 'hidden',
          marginBottom: '20px'
        }}>
          {/* Top Integrated Legend Chips Bar */}
          <div className="no-print" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            padding: '12px 16px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0'
          }}>
            {DISPLAYED_STATUS_CONFIGS.map(cfg => (
              <span
                key={cfg.code}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  backgroundColor: cfg.badgeBg,
                  color: cfg.badgeColor,
                  border: `1px solid ${cfg.borderColor}`,
                  fontSize: '0.72rem',
                  fontWeight: 800
                }}
              >
                <strong style={{ minWidth: '18px', textAlign: 'center' }}>{cfg.code}</strong>
                <span>- {cfg.label}</span>
              </span>
            ))}
          </div>
          
          <div className="muster-roll-scroll-container" style={{ overflowX: 'auto', maxHeight: '680px' }}>
            <table className="muster-roll-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC' }}>
                  
                  {/* Sticky Header Columns */}
                  <th className="muster-sticky-code" style={{
                    position: 'sticky',
                    left: 0,
                    top: 0,
                    zIndex: 20,
                    backgroundColor: '#F8FAFC',
                    padding: '12px 14px',
                    fontWeight: 800,
                    color: '#475569',
                    borderBottom: '2px solid #CBD5E1',
                    borderRight: '1px solid #E2E8F0',
                    textAlign: 'left',
                    minWidth: '110px'
                  }}>
                    Emp Code
                  </th>

                  <th className="muster-sticky-name" style={{
                    position: 'sticky',
                    left: '110px',
                    top: 0,
                    zIndex: 20,
                    backgroundColor: '#F8FAFC',
                    padding: '12px 14px',
                    fontWeight: 800,
                    color: '#475569',
                    borderBottom: '2px solid #CBD5E1',
                    borderRight: '2px solid #CBD5E1',
                    textAlign: 'left',
                    minWidth: '170px'
                  }}>
                    Employee Name
                  </th>

                  <th className="muster-hide-mobile" style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    backgroundColor: '#F8FAFC',
                    padding: '12px 14px',
                    fontWeight: 800,
                    color: '#475569',
                    borderBottom: '2px solid #CBD5E1',
                    borderRight: '1px solid #E2E8F0',
                    textAlign: 'left',
                    minWidth: '120px'
                  }}>
                    Department
                  </th>

                  <th className="muster-hide-mobile" style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    backgroundColor: '#F8FAFC',
                    padding: '12px 14px',
                    fontWeight: 800,
                    color: '#475569',
                    borderBottom: '2px solid #CBD5E1',
                    borderRight: '2px solid #CBD5E1',
                    textAlign: 'left',
                    minWidth: '130px'
                  }}>
                    Designation
                  </th>

                  {/* Day Date Header Columns */}
                  {calendarDays.map(dayItem => (
                    <th
                      key={dayItem.dateStr}
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        backgroundColor: dayItem.isSunday ? '#FEF2F2' : dayItem.isHoliday ? '#EFF6FF' : '#F8FAFC',
                        padding: '8px 4px',
                        fontWeight: 800,
                        color: dayItem.isSunday ? '#DC2626' : dayItem.isHoliday ? '#2563EB' : '#334155',
                        borderBottom: '2px solid #CBD5E1',
                        borderRight: '1px solid #E2E8F0',
                        textAlign: 'center',
                        minWidth: '42px',
                        maxWidth: '44px'
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>{String(dayItem.dayNum).padStart(2, '0')}</div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: dayItem.isSunday ? '#EF4444' : '#64748B' }}>
                        {dayItem.dayName}
                      </div>
                    </th>
                  ))}

                  {/* Dynamic Total Summary Columns */}
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#15803D', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }} title="Present">P</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#C2410C', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }} title="Half Day (0.5 Paid / 0.5 LOP)">HD</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#7E22CE', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }} title="Paid Leave">PL</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#B91C1C', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }} title="Absent / Unpaid Leave (Loss of Pay)">A/LOP</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#1E40AF', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }} title="Holiday / Weekly Off">H</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#4338CA', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }} title="Work From Home">WFH</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#0E7490', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }} title="Field Visit">FV</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#0F172A', borderBottom: '2px solid #CBD5E1', textAlign: 'center', minWidth: '55px' }}>% Rate</th>

                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  // Skeleton Loader Rows
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td colSpan={calendarDays.length + 11} style={{ padding: '16px', textAlign: 'center' }}>
                        <div style={{ height: '20px', backgroundColor: '#E2E8F0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                      </td>
                    </tr>
                  ))
                ) : paginatedEmployees.length === 0 ? (
                  // Empty State
                  <tr>
                    <td colSpan={calendarDays.length + 11} style={{ padding: '48px 16px', textAlign: 'center' }}>
                      <div className="muster-empty-sticky-center">
                        <CalendarDays size={42} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#475569' }}>No attendance records found</div>
                        <div style={{ fontSize: '0.84rem', color: '#94A3B8', marginTop: '4px' }}>
                          No employees match the selected department, location, or search filters.
                        </div>
                        <button
                          type="button"
                          onClick={handleClearFilters}
                          style={{
                            marginTop: '16px',
                            padding: '8px 18px',
                            borderRadius: '8px',
                            border: '1px solid #0E7490',
                            backgroundColor: '#ECFEFF',
                            color: '#0E7490',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Reset All Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map(employee => {
                    let p = 0, hd = 0, pl = 0, a = 0, h = 0, wfh = 0, fv = 0, notEmployed = 0;

                    const dayCells = calendarDays.map(dayItem => {
                      const att = getCellAttendance(employee, dayItem);
                      switch (att.status) {
                        case 'P': p++; break;
                        case 'PL':
                        case 'L':
                        case 'ML': pl++; break;
                        case 'UL':
                        case 'A': a++; break;
                        case 'H':
                        case 'WO': h++; break;
                        case 'WFH':
                        case 'WFO': wfh++; break;
                        case 'FV':
                        case 'FD':
                        case 'OD': fv++; break;
                        case 'HD': hd++; p += 0.5; a += 0.5; break;
                        case '-':
                        case 'NA': notEmployed++; break;
                        default: p++; break;
                      }
                      return { dayItem, att };
                    });

                    const totalWorkingDays = Math.max(1, calendarDays.length - h - notEmployed);
                    const effectivePresent = p + pl + wfh + fv;
                    const attendanceRate = Math.min(100, Math.round((effectivePresent / totalWorkingDays) * 100));

                    return (
                      <tr
                        key={employee.id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                      >
                        {/* Sticky Column 1: Emp Code */}
                        <td className="muster-sticky-code" style={{
                          position: 'sticky',
                          left: 0,
                          backgroundColor: '#FFFFFF',
                          zIndex: 5,
                          padding: '10px 14px',
                          borderRight: '1px solid #E2E8F0',
                          borderBottom: '1px solid #F1F5F9',
                          fontWeight: 700,
                          color: '#0E7490',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedEmpDetail(employee)}
                        title="Click to view detailed employee attendance modal"
                        >
                          {employee.employeeId}
                        </td>

                        {/* Sticky Column 2: Emp Name */}
                        <td className="muster-sticky-name" style={{
                          position: 'sticky',
                          left: '110px',
                          backgroundColor: '#FFFFFF',
                          zIndex: 5,
                          padding: '10px 14px',
                          borderRight: '2px solid #CBD5E1',
                          borderBottom: '1px solid #F1F5F9',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedEmpDetail(employee)}
                        title="Click to view detailed employee attendance modal"
                        >
                          <div style={{ fontWeight: 800, color: '#0F172A' }}>
                            {employee.firstName} {employee.lastName}
                          </div>
                          <div className="muster-dept-desig-mobile" style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                            {employee.department} • {employee.designation}
                          </div>
                        </td>

                        {/* Department */}
                        <td className="muster-hide-mobile" style={{ padding: '10px 14px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', color: '#475569' }}>
                          {employee.department}
                        </td>

                        {/* Designation */}
                        <td className="muster-hide-mobile" style={{ padding: '10px 14px', borderRight: '2px solid #CBD5E1', borderBottom: '1px solid #F1F5F9', color: '#64748B' }}>
                          {employee.designation}
                        </td>

                        {/* Daily Matrix Attendance Cells */}
                        {dayCells.map(({ dayItem, att }) => {
                          const cfg = ATTENDANCE_STATUS_CONFIG[att.status] || ATTENDANCE_STATUS_CONFIG.P;
                          return (
                            <td
                              key={dayItem.dateStr}
                              onClick={() => handleOpenCellModal(employee, dayItem)}
                              style={{
                                padding: '6px 2px',
                                borderRight: '1px solid #F1F5F9',
                                borderBottom: '1px solid #F1F5F9',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'transform 0.1s ease'
                              }}
                              title={`Click to edit ${employee.firstName}'s attendance on ${dayItem.dateStr}`}
                            >
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: '32px',
                                  height: '26px',
                                  lineHeight: '26px',
                                  borderRadius: '6px',
                                  backgroundColor: cfg.badgeBg,
                                  color: cfg.badgeColor,
                                  border: `1px solid ${cfg.borderColor}`,
                                  fontWeight: 800,
                                  fontSize: '0.74rem',
                                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                                }}
                              >
                                {cfg.code}
                              </span>
                            </td>
                          );
                        })}

                        {/* Summary Columns: P, HD, PL, A/LOP, H, WFH, FV and % Rate */}
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#15803D', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#F0FDF4' }}>{p}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#C2410C', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#FFF7ED' }}>{hd}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#7E22CE', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#FAF5FF' }}>{pl}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#B91C1C', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#FEF2F2' }}>{a}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#1E40AF', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#EFF6FF' }}>{h}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#4338CA', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#EEF2FF' }}>{wfh}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#0E7490', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#ECFEFF' }}>{fv}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#0F172A', borderBottom: '1px solid #F1F5F9', backgroundColor: '#ECFEFF' }}>{attendanceRate}%</td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>



      </div>

      {/* =========================================================================
          7. MODAL A: EMPLOYEE ATTENDANCE DETAIL PANEL
          ========================================================================= */}
      {selectedEmpDetail && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                  {selectedEmpDetail.firstName} {selectedEmpDetail.lastName}
                </h3>
                <p style={{ fontSize: '0.84rem', color: '#94A3B8', margin: '2px 0 0 0' }}>
                  {selectedEmpDetail.employeeId} &bull; {selectedEmpDetail.designation} &bull; {selectedEmpDetail.department}
                </p>
              </div>
              <button
                onClick={() => setSelectedEmpDetail(null)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#FFFFFF', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body Scrollable */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              
              {/* Employee Information Specs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B' }}>REPORTING MANAGER</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{selectedEmpDetail.reportingManagerName || 'Board of Directors'}</div>
                </div>
                <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B' }}>WORK SHIFT</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{selectedEmpDetail.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)'}</div>
                </div>
                <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B' }}>PRIMARY LOCATION</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{selectedEmpDetail.address || 'Corporate HQ'}</div>
                </div>
              </div>

              {/* Monthly Attendance Breakdown Table */}
              <h4 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
                Daily Log Breakdown - {MONTH_NAMES[selectedMonth]} {selectedYear}
              </h4>

              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Date</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Day</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Status</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Check In</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Check Out</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Working Hours</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendarDays.map(dayItem => {
                      const att = getCellAttendance(selectedEmpDetail, dayItem);
                      const cfg = ATTENDANCE_STATUS_CONFIG[att.status] || ATTENDANCE_STATUS_CONFIG.P;

                      return (
                        <tr key={dayItem.dateStr} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(dayItem.dateStr)}</td>
                          <td style={{ padding: '10px 12px', color: dayItem.isSunday ? '#DC2626' : '#475569', fontWeight: 700 }}>{dayItem.dayName}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '6px', backgroundColor: cfg.badgeBg, color: cfg.badgeColor, fontWeight: 800, fontSize: '0.74rem' }}>
                              {cfg.code} - {cfg.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#334155' }}>{formatTimeDisplay(att.checkIn, '--:--')}</td>
                          <td style={{ padding: '10px 12px', color: '#334155' }}>{formatTimeDisplay(att.checkOut, '--:--')}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A' }}>{att.workingHours}</td>
                          <td style={{ padding: '10px 12px', color: '#64748B' }}>{att.remarks}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setSelectedEmpDetail(null)}
                style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#334155', fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          8. MODAL B: DAY CELL INTERACTION & EDIT ATTENDANCE MODAL
          ========================================================================= */}
      {selectedCellDetail && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            maxWidth: '520px',
            width: '100%',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 22px',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                  Attendance Log: {formatDateDDMMYYYY(selectedCellDetail.dateStr)}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: '2px 0 0 0' }}>
                  {selectedCellDetail.employee.firstName} {selectedCellDetail.employee.lastName} ({selectedCellDetail.employee.employeeId})
                </p>
              </div>
              <button
                onClick={() => setSelectedCellDetail(null)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#FFFFFF', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Edit Form Body */}
            <div style={{ padding: '22px' }}>
              
              {/* Validation / Error banner */}
              {validationError && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{validationError}</span>
                </div>
              )}

              {/* MU Warning Banner */}
              {selectedCellDetail.currentStatus === 'MU' && (
                <div style={{
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '1px', color: '#B45309' }} />
                  <div>
                    <strong style={{ display: 'block', marginBottom: '2px', color: '#92400E' }}>⚠️ Missed Punch-Out (MU):</strong>
                    Check-in was recorded at {selectedCellDetail.checkIn}, but no check-out was logged after shift ended. Enter check-out time and select Present or Half Day to regularize, or retain MU.
                  </div>
                </div>
              )}

              {!isHrOrAdmin && (
                <div style={{
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  marginBottom: '16px',
                  fontWeight: 600
                }}>
                  Read-only view: Only authorized HR or CEO users can regularize or correct attendance.
                </div>
              )}

              {/* ATTENDANCE STATUS SELECTOR */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  ATTENDANCE STATUS
                </label>
                <select
                  className="form-select"
                  value={editForm.status}
                  disabled={!isHrOrAdmin || isSavingEdit}
                  onChange={e => {
                    const newStatus = e.target.value as AttendanceStatusCode;
                    const isNonWork = ['A', 'UL', 'H', 'WO', 'PL', 'L'].includes(newStatus);
                    if (isNonWork) {
                      setEditForm(prev => ({ ...prev, status: newStatus, checkIn: '', checkOut: '' }));
                    } else if (newStatus === 'MU') {
                      setEditForm(prev => ({
                        ...prev,
                        status: newStatus,
                        checkIn: prev.checkIn || shiftStartTimeStr,
                        checkOut: ''
                      }));
                    } else {
                      setEditForm(prev => ({
                        ...prev,
                        status: newStatus,
                        checkIn: prev.checkIn || shiftStartTimeStr,
                        checkOut: prev.checkOut || shiftEndTimeStr
                      }));
                    }
                    setValidationError(null);
                  }}
                  style={{ width: '100%', padding: '10px 12px', fontSize: '0.88rem', fontWeight: 700, borderRadius: '10px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A' }}
                >
                  {DISPLAYED_STATUS_CONFIGS.map(cfg => (
                    <option key={cfg.code} value={cfg.code}>{cfg.code} - {cfg.label}</option>
                  ))}
                </select>
              </div>

              {/* CHECK-IN & CHECK-OUT TIME PICKERS (Manual Attendance Style) */}
              {(() => {
                const isNonWork = ['A', 'UL', 'H', 'WO', 'PL', 'L'].includes(editForm.status);
                const inParts = parse12Parts(editForm.checkIn, shiftStartTimeStr);
                const outParts = parse12Parts(editForm.checkOut, shiftEndTimeStr);

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                    
                    {/* CHECK-IN TIME */}
                    <div style={{ position: 'relative' }} ref={checkInPickerRef}>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                        CHECK-IN TIME
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={isNonWork ? '-' : editForm.checkIn}
                          disabled={!isHrOrAdmin || isSavingEdit || isNonWork}
                          placeholder="e.g. 09:30 AM"
                          readOnly
                          onClick={() => {
                            if (isHrOrAdmin && !isSavingEdit && !isNonWork) {
                              if (!editForm.checkIn.trim()) setEditForm(prev => ({ ...prev, checkIn: shiftStartTimeStr }));
                              setActiveTimePicker(prev => (prev === 'checkIn' ? null : 'checkIn'));
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 38px 10px 12px',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: isNonWork ? '#F1F5F9' : '#FFFFFF',
                            color: isNonWork ? '#94A3B8' : '#0F172A',
                            cursor: isNonWork ? 'not-allowed' : 'pointer',
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          type="button"
                          disabled={!isHrOrAdmin || isSavingEdit || isNonWork}
                          onClick={() => {
                            if (!editForm.checkIn.trim()) setEditForm(prev => ({ ...prev, checkIn: shiftStartTimeStr }));
                            setActiveTimePicker(prev => (prev === 'checkIn' ? null : 'checkIn'));
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
                            cursor: isNonWork ? 'not-allowed' : 'pointer',
                            padding: 0
                          }}
                        >
                          <Clock size={16} />
                        </button>
                      </div>

                      {/* Native time input synchronized */}
                      {!isNonWork && (
                        <input
                          ref={checkInNativeRef}
                          type="time"
                          tabIndex={-1}
                          value={format12to24(editForm.checkIn || shiftStartTimeStr)}
                          onChange={e => {
                            if (e.target.value) {
                              setEditForm(prev => ({ ...prev, checkIn: format24to12(e.target.value) }));
                              setValidationError(null);
                            }
                          }}
                          style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
                        />
                      )}

                      {/* Check-In Popover */}
                      {activeTimePicker === 'checkIn' && !isNonWork && (
                        <div
                          role="dialog"
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            right: 0,
                            zIndex: 100,
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '12px',
                            boxShadow: '0 12px 30px -4px rgba(15, 23, 42, 0.2)',
                            padding: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>Hour</label>
                              <select
                                value={inParts.hh}
                                onChange={e => {
                                  const newTime = `${e.target.value}:${inParts.mm} ${inParts.mer}`;
                                  setEditForm(prev => ({ ...prev, checkIn: newTime }));
                                  setValidationError(null);
                                }}
                                style={{ width: '100%', height: '34px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', backgroundColor: '#FFFFFF' }}
                              >
                                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>Minute</label>
                              <select
                                value={inParts.mm}
                                onChange={e => {
                                  const newTime = `${inParts.hh}:${e.target.value} ${inParts.mer}`;
                                  setEditForm(prev => ({ ...prev, checkIn: newTime }));
                                  setValidationError(null);
                                }}
                                style={{ width: '100%', height: '34px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', backgroundColor: '#FFFFFF' }}
                              >
                                {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>Period</label>
                              <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid #CBD5E1', overflow: 'hidden', height: '34px' }}>
                                {(['AM', 'PM'] as const).map(p => (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => {
                                      const newTime = `${inParts.hh}:${inParts.mm} ${p}`;
                                      setEditForm(prev => ({ ...prev, checkIn: newTime }));
                                      setValidationError(null);
                                    }}
                                    style={{
                                      border: 'none',
                                      padding: '0 10px',
                                      fontSize: '0.78rem',
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
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid #F1F5F9' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditForm(prev => ({ ...prev, checkIn: shiftStartTimeStr }));
                                setValidationError(null);
                              }}
                              style={{ padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, border: '1px solid #CBD5E1', borderRadius: '6px', background: '#F8FAFC', cursor: 'pointer', color: '#475569' }}
                            >
                              Shift Start ({shiftStartTimeStr})
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTimePicker(null)}
                              style={{ padding: '4px 12px', fontSize: '0.74rem', fontWeight: 700, border: 'none', borderRadius: '6px', background: '#0E7490', color: '#FFFFFF', cursor: 'pointer' }}
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* CHECK-OUT TIME */}
                    <div style={{ position: 'relative' }} ref={checkOutPickerRef}>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                        CHECK-OUT TIME {editForm.status === 'MU' && <span style={{ color: '#94A3B8', fontWeight: 500, fontSize: '0.7rem' }}>(Blank for MU)</span>}
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={isNonWork ? '-' : (editForm.checkOut || '')}
                          disabled={!isHrOrAdmin || isSavingEdit || isNonWork}
                          placeholder={editForm.status === 'MU' ? 'Blank for Missed Out' : 'e.g. 06:00 PM'}
                          readOnly
                          onClick={() => {
                            if (isHrOrAdmin && !isSavingEdit && !isNonWork) {
                              if (!editForm.checkOut.trim()) setEditForm(prev => ({ ...prev, checkOut: shiftEndTimeStr }));
                              setActiveTimePicker(prev => (prev === 'checkOut' ? null : 'checkOut'));
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 38px 10px 12px',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: isNonWork ? '#F1F5F9' : '#FFFFFF',
                            color: isNonWork ? '#94A3B8' : (editForm.checkOut ? '#0F172A' : '#94A3B8'),
                            cursor: isNonWork ? 'not-allowed' : 'pointer',
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          type="button"
                          disabled={!isHrOrAdmin || isSavingEdit || isNonWork}
                          onClick={() => {
                            if (!editForm.checkOut.trim()) setEditForm(prev => ({ ...prev, checkOut: shiftEndTimeStr }));
                            setActiveTimePicker(prev => (prev === 'checkOut' ? null : 'checkOut'));
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
                            cursor: isNonWork ? 'not-allowed' : 'pointer',
                            padding: 0
                          }}
                        >
                          <Clock size={16} />
                        </button>
                      </div>

                      {/* Native time input synchronized */}
                      {!isNonWork && (
                        <input
                          ref={checkOutNativeRef}
                          type="time"
                          tabIndex={-1}
                          value={format12to24(editForm.checkOut || shiftEndTimeStr)}
                          onChange={e => {
                            if (e.target.value) {
                              setEditForm(prev => ({ ...prev, checkOut: format24to12(e.target.value) }));
                              setValidationError(null);
                            }
                          }}
                          style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
                        />
                      )}

                      {/* Check-Out Popover */}
                      {activeTimePicker === 'checkOut' && !isNonWork && (
                        <div
                          role="dialog"
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            right: 0,
                            zIndex: 100,
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '12px',
                            boxShadow: '0 12px 30px -4px rgba(15, 23, 42, 0.2)',
                            padding: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>Hour</label>
                              <select
                                value={outParts.hh}
                                onChange={e => {
                                  const newTime = `${e.target.value}:${outParts.mm} ${outParts.mer}`;
                                  setEditForm(prev => ({ ...prev, checkOut: newTime }));
                                  setValidationError(null);
                                }}
                                style={{ width: '100%', height: '34px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', backgroundColor: '#FFFFFF' }}
                              >
                                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>Minute</label>
                              <select
                                value={outParts.mm}
                                onChange={e => {
                                  const newTime = `${outParts.hh}:${e.target.value} ${outParts.mer}`;
                                  setEditForm(prev => ({ ...prev, checkOut: newTime }));
                                  setValidationError(null);
                                }}
                                style={{ width: '100%', height: '34px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', backgroundColor: '#FFFFFF' }}
                              >
                                {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>Period</label>
                              <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid #CBD5E1', overflow: 'hidden', height: '34px' }}>
                                {(['AM', 'PM'] as const).map(p => (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => {
                                      const newTime = `${outParts.hh}:${outParts.mm} ${p}`;
                                      setEditForm(prev => ({ ...prev, checkOut: newTime }));
                                      setValidationError(null);
                                    }}
                                    style={{
                                      border: 'none',
                                      padding: '0 10px',
                                      fontSize: '0.78rem',
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
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid #F1F5F9' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditForm(prev => ({ ...prev, checkOut: shiftEndTimeStr }));
                                  setValidationError(null);
                                }}
                                style={{ padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, border: '1px solid #CBD5E1', borderRadius: '6px', background: '#F8FAFC', cursor: 'pointer', color: '#475569' }}
                              >
                                Shift End ({shiftEndTimeStr})
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditForm(prev => ({ ...prev, checkOut: '' }));
                                  setValidationError(null);
                                }}
                                style={{ padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, border: '1px solid #CBD5E1', borderRadius: '6px', background: '#F8FAFC', cursor: 'pointer', color: '#64748B' }}
                              >
                                Blank (MU)
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveTimePicker(null)}
                              style={{ padding: '4px 12px', fontSize: '0.74rem', fontWeight: 700, border: 'none', borderRadius: '6px', background: '#0E7490', color: '#FFFFFF', cursor: 'pointer' }}
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedCellDetail(null)}
                  disabled={isSavingEdit}
                  style={{ padding: '9px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>

                {isHrOrAdmin && (
                  <button
                    type="button"
                    onClick={handleSaveCellEdit}
                    disabled={isSavingEdit}
                    style={{
                      padding: '9px 20px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: isSavingEdit ? '#0891B2' : '#0E7490',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      cursor: isSavingEdit ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: isSavingEdit ? 0.8 : 1
                    }}
                  >
                    {isSavingEdit ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Save size={16} /> Save Attendance
                      </>
                    )}
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MusterRollModule;
