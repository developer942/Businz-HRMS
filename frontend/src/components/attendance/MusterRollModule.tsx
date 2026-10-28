import React, { useState, useMemo, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
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
import { downloadPagarBookMusterRollExcel } from '../../utils/pagarBookMusterRollExporter';
import { normalizeToYYYYMMDD, formatDateDDMMYYYY, formatTimeDisplay } from '../../utils/dateUtils';
import { toNum } from '../../utils/numbers';

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
export type AttendanceStatusCode = 'P' | 'A' | 'H' | 'WFO' | 'FV' | 'FD' | 'L' | 'WO' | 'HD' | 'OD' | 'WFH' | 'ML';

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
  A: { code: 'A', label: 'Absent', badgeBg: '#FEE2E2', badgeColor: '#B91C1C', borderColor: '#FCA5A5', weight: 0.0 },
  H: { code: 'H', label: 'Holiday', badgeBg: '#DBEAFE', badgeColor: '#1E40AF', borderColor: '#93C5FD', weight: 0.0 },
  WFO: { code: 'WFO', label: 'Work From Office', badgeBg: '#E0E7FF', badgeColor: '#4338CA', borderColor: '#A5B4FC', weight: 1.0 },
  FV: { code: 'FV', label: 'Field Visit', badgeBg: '#CFFAFE', badgeColor: '#0E7490', borderColor: '#67E8F9', weight: 1.0 },
  // Backward-compatible aliases mapped strictly to the core 5 statuses
  FD: { code: 'FV', label: 'Field Visit', badgeBg: '#CFFAFE', badgeColor: '#0E7490', borderColor: '#67E8F9', weight: 1.0 },
  OD: { code: 'FV', label: 'Field Visit', badgeBg: '#CFFAFE', badgeColor: '#0E7490', borderColor: '#67E8F9', weight: 1.0 },
  WFH: { code: 'WFO', label: 'Work From Office', badgeBg: '#E0E7FF', badgeColor: '#4338CA', borderColor: '#A5B4FC', weight: 1.0 },
  L: { code: 'A', label: 'Absent', badgeBg: '#FEE2E2', badgeColor: '#B91C1C', borderColor: '#FCA5A5', weight: 0.0 },
  WO: { code: 'H', label: 'Holiday', badgeBg: '#DBEAFE', badgeColor: '#1E40AF', borderColor: '#93C5FD', weight: 0.0 },
  HD: { code: 'P', label: 'Present', badgeBg: '#DCFCE7', badgeColor: '#15803D', borderColor: '#86EFAC', weight: 0.5 },
  ML: { code: 'A', label: 'Absent', badgeBg: '#FEE2E2', badgeColor: '#B91C1C', borderColor: '#FCA5A5', weight: 0.0 }
};

// Exact 5 status items strictly requested by user: Present, Absent, Holiday, WFO, Field Visit
export const DISPLAYED_STATUS_CONFIGS: StatusConfig[] = [
  { code: 'P', label: 'Present', badgeBg: '#DCFCE7', badgeColor: '#15803D', borderColor: '#86EFAC', weight: 1.0 },
  { code: 'A', label: 'Absent', badgeBg: '#FEE2E2', badgeColor: '#B91C1C', borderColor: '#FCA5A5', weight: 0.0 },
  { code: 'H', label: 'Holiday', badgeBg: '#DBEAFE', badgeColor: '#1E40AF', borderColor: '#93C5FD', weight: 0.0 },
  { code: 'WFO', label: 'Work From Office', badgeBg: '#E0E7FF', badgeColor: '#4338CA', borderColor: '#A5B4FC', weight: 1.0 },
  { code: 'FV', label: 'Field Visit', badgeBg: '#CFFAFE', badgeColor: '#0E7490', borderColor: '#67E8F9', weight: 1.0 },
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
  const { employees, attendanceRecords, leaveRequests, currentUser, shifts, holidayPolicies, businessSettings, companyInfo } = useHRMS();

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
  const [exportDropdownOpen, setExportDropdownOpen] = useState<boolean>(false);

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
    employees.forEach(e => { if (e.department) set.add(e.department); });
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
    if (customEdits[editKey]) {
      const edit = customEdits[editKey];
      return {
        status: edit.status,
        checkIn: edit.checkIn,
        checkOut: edit.checkOut,
        workingHours: edit.status === 'P' || edit.status === 'OD' || edit.status === 'WFH' ? '08:45' : edit.status === 'HD' ? '04:15' : '00:00',
        shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
        location: employee.address || 'Corporate HQ',
        remarks: edit.remarks || 'Manually updated'
      };
    }

    // Check Leave Requests
    const leaveRec = leaveRequests.find(l => 
      l.employeeId === employee.employeeId && 
      l.status === 'Approved' && 
      dayItem.dateStr >= l.startDate && 
      dayItem.dateStr <= l.endDate
    );
    if (leaveRec) {
      const lType = (leaveRec.leaveType || '').toLowerCase();
      if (lType.includes('wfo') || lType.includes('office') || lType.includes('wfh') || lType.includes('home')) {
        return {
          status: 'WFO' as AttendanceStatusCode,
          checkIn: '09:00 AM',
          checkOut: '06:00 PM',
          workingHours: '08:30',
          shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
          location: 'Work From Office (Approved)',
          remarks: `WFO: ${leaveRec.reason || 'Approved WFO'}`
        };
      }
      if (lType.includes('field') || lType.includes('visit') || lType.includes('duty')) {
        return {
          status: 'FV' as AttendanceStatusCode,
          checkIn: '09:30 AM',
          checkOut: '06:00 PM',
          workingHours: '08:30',
          shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
          location: 'Field Visit',
          remarks: `Field Visit: ${leaveRec.reason || 'Client/Site Visit'}`
        };
      }
      return {
        status: 'A' as AttendanceStatusCode,
        checkIn: '-',
        checkOut: '-',
        workingHours: '00:00',
        shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
        location: 'On Leave',
        remarks: `${leaveRec.leaveType}: ${leaveRec.reason || 'Approved Leave'}`
      };
    }

    // Check Official Holiday
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

    // Check Sunday / Weekly Off -> Mapped to Holiday
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

    // Check Attendance Records with ID fallback and date normalization
    const empCode = (employee.employeeId || '').toLowerCase().trim();
    const empUid = (employee.id || '').toLowerCase().trim();
    const targetDateNorm = normalizeToYYYYMMDD(dayItem.dateStr);

    const attRec = attendanceRecords.find(a => {
      const aEmp = (a.employeeId || '').toLowerCase().trim();
      const aDate = normalizeToYYYYMMDD(a.date || a.shiftDate);
      return (aEmp === empCode || aEmp === empUid) && aDate === targetDateNorm;
    });

    if (attRec) {
      let code: AttendanceStatusCode = 'P';
      const st = String(attRec.status || '').toLowerCase();
      if (st === 'absent') code = 'A';
      else if (st === 'holiday') code = 'H';
      else if (st.includes('wfo') || st.includes('office') || st.includes('wfh') || st.includes('home')) code = 'WFO';
      else if (st.includes('duty') || st.includes('field') || st.includes('visit') || st.includes('on duty') || attRec.method?.toLowerCase().includes('field')) code = 'FV';
      else code = 'P';

      let whDisplay = '--:--';
      if (attRec.checkIn && attRec.checkOut && attRec.checkOut !== '--:--') {
        const inM = parseTimeToMinutes ? parseTimeToMinutes(attRec.checkIn) : 0;
        const outM = parseTimeToMinutes ? parseTimeToMinutes(attRec.checkOut) : 0;
        let diff = outM - inM;
        if (diff < 0) diff += 24 * 60;
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        whDisplay = `${h}h ${m}m`;
      } else if (toNum(attRec.workingHours) > 0) {
        whDisplay = `${toNum(attRec.workingHours).toFixed(1)} hrs`;
      } else if (attRec.checkIn) {
        whDisplay = 'In Progress';
      }

      return {
        status: code,
        checkIn: formatTimeDisplay(attRec.checkIn, '--:--'),
        checkOut: attRec.checkOut && attRec.checkOut !== '--:--' ? formatTimeDisplay(attRec.checkOut, '--:--') : (attRec.checkIn ? 'In Progress' : '--:--'),
        workingHours: whDisplay,
        shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
        location: attRec.location?.address || employee.address || 'Main Campus',
        remarks: attRec.status === 'Late' ? 'Late Check-in logged' : (code === 'FV' ? 'Field Visit active' : 'Regular Attendance')
      };
    }

    // Unmarked / No attendance record found in database -> Mark as Absent (A)
    return {
      status: 'A' as AttendanceStatusCode,
      checkIn: '-',
      checkOut: '-',
      workingHours: '00:00',
      shift: employee.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
      location: employee.address || 'Corporate HQ',
      remarks: 'No punch recorded'
    };
  };

  // ---------------------------------------------------------------------------
  // 4. FILTERING & COMPUTATION OF SUMMARY TOTALS
  // ---------------------------------------------------------------------------
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
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
    });
  }, [employees, selectedDepartment, selectedLocation, activeSearchQuery, selectedStatusFilter, calendarDays, customEdits]);

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

    filteredEmployees.forEach(emp => {
      calendarDays.forEach(dayItem => {
        const res = getCellAttendance(emp, dayItem);
        switch (res.status) {
          case 'P': presentCount++; break;
          case 'A': absentCount++; break;
          case 'L': leaveCount++; break;
          case 'WO': weeklyOffCount++; break;
          case 'H': holidayCount++; break;
          case 'HD': halfDayCount++; break;
          case 'OD': odCount++; break;
          case 'WFH': wfhCount++; break;
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
      wfhCount
    };
  }, [filteredEmployees, calendarDays, customEdits]);

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
    setEditForm({
      status: data.status,
      checkIn: data.checkIn === '-' ? '09:00 AM' : data.checkIn,
      checkOut: data.checkOut === '-' ? '06:00 PM' : data.checkOut,
      remarks: data.remarks || ''
    });
  };

  const handleSaveCellEdit = () => {
    if (!selectedCellDetail) return;
    const editKey = `${selectedCellDetail.employee.employeeId}_${selectedCellDetail.dateStr}`;
    setCustomEdits(prev => ({
      ...prev,
      [editKey]: {
        status: editForm.status,
        checkIn: editForm.checkIn,
        checkOut: editForm.checkOut,
        remarks: editForm.remarks
      }
    }));
    setSelectedCellDetail(null);
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
      { key: 'totalA', label: 'Absent (A)' },
      { key: 'totalH', label: 'Holiday (H)' },
      { key: 'totalWFO', label: 'Work From Office (WFO)' },
      { key: 'totalFV', label: 'Field Visit (FV)' },
      { key: 'totalRate', label: 'Attendance Rate (%)' }
    ];

    const data: Record<string, any>[] = [];

    filteredEmployees.forEach(emp => {
      let p = 0, a = 0, h = 0, wfo = 0, fv = 0;
      const row: Record<string, any> = {
        empId: emp.employeeId,
        empName: `${emp.firstName} ${emp.lastName}`,
        dept: emp.department,
        desig: emp.designation
      };

      calendarDays.forEach(dayItem => {
        const att = getCellAttendance(emp, dayItem);
        row[`day_${dayItem.dayNum}`] = att.status;
        switch (att.status) {
          case 'P': p++; break;
          case 'A': a++; break;
          case 'H': h++; break;
          case 'WFO': wfo++; break;
          case 'FV':
          case 'FD':
          case 'OD': fv++; break;
          default:
            if (att.status === 'WFH') wfo++;
            else if (att.status === 'L' || att.status === 'ML') a++;
            else if (att.status === 'WO') h++;
            else if (att.status === 'HD') { p += 0.5; a += 0.5; }
            else p++;
            break;
        }
      });

      const workingDays = Math.max(1, calendarDays.length - h);
      const effectivePresent = p + wfo + fv;
      const rate = Math.min(100, Math.round((effectivePresent / workingDays) * 100));

      row.totalP = p;
      row.totalA = a;
      row.totalH = h;
      row.totalWFO = wfo;
      row.totalFV = fv;
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
      businessSettings?.businessName || companyInfo?.companyName || 'BUSINZ'
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

                  {/* Dynamic Total Summary Columns: strictly 5 requested statuses + % Rate */}
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#15803D', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }}>P</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#B91C1C', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }}>A</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#1E40AF', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }}>H</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#4338CA', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }}>WFO</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#0E7490', borderBottom: '2px solid #CBD5E1', borderRight: '1px solid #E2E8F0', textAlign: 'center', minWidth: '44px' }}>FV</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F8FAFC', padding: '10px 8px', fontWeight: 800, color: '#0F172A', borderBottom: '2px solid #CBD5E1', textAlign: 'center', minWidth: '55px' }}>% Rate</th>

                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  // Skeleton Loader Rows
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td colSpan={calendarDays.length + 10} style={{ padding: '16px', textAlign: 'center' }}>
                        <div style={{ height: '20px', backgroundColor: '#E2E8F0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                      </td>
                    </tr>
                  ))
                ) : paginatedEmployees.length === 0 ? (
                  // Empty State
                  <tr>
                    <td colSpan={calendarDays.length + 10} style={{ padding: '48px 16px', textAlign: 'center' }}>
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
                    let p = 0, a = 0, h = 0, wfo = 0, fv = 0;

                    const dayCells = calendarDays.map(dayItem => {
                      const att = getCellAttendance(employee, dayItem);
                      switch (att.status) {
                        case 'P': p++; break;
                        case 'A': a++; break;
                        case 'H': h++; break;
                        case 'WFO': wfo++; break;
                        case 'FV':
                        case 'FD':
                        case 'OD': fv++; break;
                        default:
                          if (att.status === 'WFH') wfo++;
                          else if (att.status === 'L' || att.status === 'ML') a++;
                          else if (att.status === 'WO') h++;
                          else if (att.status === 'HD') { p += 0.5; a += 0.5; }
                          else p++;
                          break;
                      }
                      return { dayItem, att };
                    });

                    const totalWorkingDays = Math.max(1, calendarDays.length - h);
                    const effectivePresent = p + wfo + fv;
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

                        {/* Summary Columns: strictly P, A, H, WFO, FV and % Rate */}
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#15803D', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#F0FDF4' }}>{p}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#B91C1C', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#FEF2F2' }}>{a}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#1E40AF', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#EFF6FF' }}>{h}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#4338CA', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', backgroundColor: '#EEF2FF' }}>{wfo}</td>
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
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  ATTENDANCE STATUS
                </label>
                <select
                  className="form-select"
                  value={editForm.status}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value as AttendanceStatusCode })}
                  style={{ width: '100%', padding: '10px 12px', fontSize: '0.88rem', fontWeight: 700, borderRadius: '10px', border: '1px solid #CBD5E1' }}
                >
                  {DISPLAYED_STATUS_CONFIGS.map(cfg => (
                    <option key={cfg.code} value={cfg.code}>{cfg.code} - {cfg.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                    CHECK-IN TIME
                  </label>
                  <input
                    type="text"
                    value={editForm.checkIn}
                    onChange={e => setEditForm({ ...editForm, checkIn: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', fontSize: '0.86rem', fontWeight: 600, borderRadius: '10px', border: '1px solid #CBD5E1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                    CHECK-OUT TIME
                  </label>
                  <input
                    type="text"
                    value={editForm.checkOut}
                    onChange={e => setEditForm({ ...editForm, checkOut: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', fontSize: '0.86rem', fontWeight: 600, borderRadius: '10px', border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  REMARKS / REASON
                </label>
                <input
                  type="text"
                  placeholder="Enter reason or remark..."
                  value={editForm.remarks}
                  onChange={e => setEditForm({ ...editForm, remarks: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', fontSize: '0.86rem', fontWeight: 500, borderRadius: '10px', border: '1px solid #CBD5E1' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedCellDetail(null)}
                  style={{ padding: '9px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSaveCellEdit}
                  style={{ padding: '9px 20px', borderRadius: '10px', border: 'none', backgroundColor: '#0E7490', color: '#FFFFFF', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Save size={16} /> Save Attendance
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MusterRollModule;
