import React, { useState, useMemo, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { FilterReportsModal, FilterReportsState, initialFilterReportsState } from '../common/FilterReportsModal';
import { 
  Calendar, 
  UserX, 
  UserCheck, 
  Clock, 
  LogOut, 
  CircleDot, 
  Timer, 
  ClipboardList, 
  SlidersHorizontal, 
  Download, 
  FileText, 
  Search,
  CheckCircle2,
  AlertCircle,
  Home,
  Flame,
  MapPin,
  X,
  Plus
} from 'lucide-react';
import { toNum } from '../../utils/numbers';
import { formatDateDDMMYYYY, normalizeToYYYYMMDD, formatTimeDisplay } from '../../utils/dateUtils';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { downloadPagarBookMusterRollExcel } from '../../utils/pagarBookMusterRollExporter';
import { ExportDropdown } from '../common/ExportDropdown';
import { MusterRollModule } from './MusterRollModule';
import { ManualAttendanceEntryModal } from './ManualAttendanceEntryModal';
import { AttendanceRecord } from '../../types/hrms';
import { isAttendanceExemptEmployee } from '../../data/hrmsInitialData';

export type ReportTypeKey = 
  | 'muster' 
  | 'absent' 
  | 'present' 
  | 'late' 
  | 'early' 
  | 'halfday' 
  | 'overtime' 
  | 'leave'
  | 'remote';

interface AttendanceReportsViewProps {
  onOpenFilter?: () => void;
  filterReports?: FilterReportsState;
  title?: string;
  subtitle?: string;
}

export const AttendanceReportsView: React.FC<AttendanceReportsViewProps> = ({ 
  onOpenFilter, 
  filterReports: externalFilterReports,
  title,
  subtitle
}) => {
  const { employees, attendanceRecords, leaveRequests, departments, currentUser, shifts, holidayPolicies, businessSettings, companyInfo } = useHRMS();

  const isHrOrCeo =
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'CEO' ||
    currentUser?.role === 'HR Manager' ||
    currentUser?.role === 'HR Admin' ||
    currentUser?.role === 'Management';

  const [isManualAttendanceModalOpen, setIsManualAttendanceModalOpen] = useState<boolean>(false);

  // Filter Modal & Active Filters State
  const [isFilterModalOpen, setIsFilterModalOpen] = useState<boolean>(false);
  const [activeFilters, setActiveFilters] = useState<FilterReportsState>(() => {
    return externalFilterReports || initialFilterReportsState;
  });

  useEffect(() => {
    if (externalFilterReports) {
      setActiveFilters(externalFilterReports);
    }
  }, [externalFilterReports]);

  const handleOpenFilter = () => {
    if (onOpenFilter) onOpenFilter();
    setIsFilterModalOpen(true);
  };

  const handleApplyFilter = (newFilters: FilterReportsState) => {
    setActiveFilters(newFilters);
    setIsFilterModalOpen(false);
  };

  const handleResetFilter = () => {
    setActiveFilters(initialFilterReportsState);
    setIsFilterModalOpen(false);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    count += (activeFilters.branches || []).length;
    count += (activeFilters.departments || []).length;
    const branchDepts = activeFilters.branchDepartments || {};
    Object.values(branchDepts).forEach(depts => {
      count += depts.length;
    });
    count += (activeFilters.shifts || []).length;
    count += (activeFilters.employmentTypes || []).length;
    count += (activeFilters.modesOfWork || []).length;
    return count;
  }, [activeFilters]);

  // Date Range (default: 1st of current month to today)
  const currentMonthInfo = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return {
      monthStart: `${y}-${m}-01`,
      today: `${y}-${m}-${day}`
    };
  }, []);

  const [fromDate, setFromDate] = useState<string>(currentMonthInfo.monthStart);
  const [toDate, setToDate] = useState<string>(currentMonthInfo.today);
  const [selectedReportType, setSelectedReportType] = useState<ReportTypeKey>('muster');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Generate array of date strings between fromDate and toDate
  const dateRangeList = useMemo(() => {
    const normFrom = normalizeToYYYYMMDD(fromDate) || currentMonthInfo.monthStart;
    const normTo = normalizeToYYYYMMDD(toDate) || currentMonthInfo.today;
    const [startStr, endStr] = normFrom <= normTo ? [normFrom, normTo] : [normTo, normFrom];

    const dates: string[] = [];
    try {
      const [y1, m1, d1] = startStr.split('-').map(n => parseInt(n, 10));
      const [y2, m2, d2] = endStr.split('-').map(n => parseInt(n, 10));
      const current = new Date(y1, m1 - 1, d1, 12, 0, 0);
      const end = new Date(y2, m2 - 1, d2, 12, 0, 0);
      let count = 0;
      while (current <= end && count < 366) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${d}`);
        current.setDate(current.getDate() + 1);
        count++;
      }
    } catch {
      dates.push(currentMonthInfo.today);
    }
    return dates.length > 0 ? dates : [currentMonthInfo.today];
  }, [fromDate, toDate, currentMonthInfo]);

  // Filtered employees based on Scope Filters
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (isAttendanceExemptEmployee(emp)) return false;

      // Scope filters: branch
      if (activeFilters.branches && activeFilters.branches.length > 0) {
        const empBranch = (emp.workLocation || (emp as any).branch || '').toLowerCase().trim();
        const matchesBranch = activeFilters.branches.some(b => {
          const target = b.toLowerCase().trim();
          return empBranch === target || empBranch.includes(target) || target.includes(empBranch);
        });
        if (!matchesBranch) return false;
      }

      // Scope filters: department
      if (activeFilters.departments && activeFilters.departments.length > 0) {
        const empDept = (emp.department || '').toLowerCase().trim();
        const matchesDept = activeFilters.departments.some(d => {
          const target = d.toLowerCase().trim();
          return empDept === target || empDept.includes(target) || target.includes(empDept);
        });
        if (!matchesDept) return false;
      }

      // Legacy Scope filters: branch / department
      const branchDepts = activeFilters.branchDepartments || {};
      const activeBranches = Object.keys(branchDepts);
      if (activeBranches.length > 0) {
        let matchesBranchDept = false;
        for (const branch of activeBranches) {
          const depts = branchDepts[branch] || [];
          if (depts.length === 0 || depts.includes(emp.department)) {
            matchesBranchDept = true;
            break;
          }
        }
        if (!matchesBranchDept) return false;
      }

      // Employment types
      if (activeFilters.employmentTypes && activeFilters.employmentTypes.length > 0) {
        if (!activeFilters.employmentTypes.includes(emp.employmentType)) return false;
      }

      // Shift filter based on Company Shifts
      if (activeFilters.shifts && activeFilters.shifts.length > 0) {
        const empShift = emp.workShift || 
          shifts.find(s => s.assignments?.some(a => a.employeeId === emp.employeeId || a.employeeId === emp.id))?.shiftName || 
          shifts[0]?.shiftName;
        const matchesShift = activeFilters.shifts.some(selectedShift => 
          empShift && (
            empShift === selectedShift || 
            empShift.toLowerCase().includes(selectedShift.toLowerCase()) || 
            selectedShift.toLowerCase().includes(empShift.toLowerCase())
          )
        );
        if (!matchesShift) return false;
      }

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
        if (!fullName.includes(q) && !emp.employeeId.toLowerCase().includes(q) && !emp.department.toLowerCase().includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [employees, activeFilters, searchQuery, shifts]);

  // Attendance Records inside date range & matching employees
  const filteredAttendance = useMemo(() => {
    const validEmpCodes = new Set(filteredEmployees.map(e => (e.employeeId || '').toLowerCase().trim()));
    const validEmpUids = new Set(filteredEmployees.map(e => (e.id || '').toLowerCase().trim()));

    const normFrom = normalizeToYYYYMMDD(fromDate) || '1970-01-01';
    const normTo = normalizeToYYYYMMDD(toDate) || '2099-12-31';
    const [startStr, endStr] = normFrom <= normTo ? [normFrom, normTo] : [normTo, normFrom];

    return attendanceRecords.filter(r => {
      const rDate = normalizeToYYYYMMDD(r.date || r.shiftDate);
      if (!rDate) return false;
      const inRange = rDate >= startStr && rDate <= endStr;
      if (!inRange) return false;

      const rEmp = (r.employeeId || '').toLowerCase().trim();
      return validEmpCodes.has(rEmp) || validEmpUids.has(rEmp);
    });
  }, [attendanceRecords, fromDate, toDate, filteredEmployees]);

  // Filtered Leave Requests based on Scope Filters, Search Query, and Date Range
  const filteredLeaveRequests = useMemo(() => {
    return leaveRequests.filter(l => {
      // Scope filters: branch
      if (activeFilters.branches && activeFilters.branches.length > 0) {
        const leaveBranch = ((l as any).workLocation || (l as any).branch || '').toLowerCase().trim();
        if (leaveBranch) {
          const matchesBranch = activeFilters.branches.some(b => {
            const target = b.toLowerCase().trim();
            return leaveBranch === target || leaveBranch.includes(target) || target.includes(leaveBranch);
          });
          if (!matchesBranch) return false;
        }
      }

      // Scope filters: department
      if (activeFilters.departments && activeFilters.departments.length > 0) {
        const leaveDept = (l.department || '').toLowerCase().trim();
        const matchesDept = activeFilters.departments.some(d => {
          const target = d.toLowerCase().trim();
          return leaveDept === target || leaveDept.includes(target) || target.includes(leaveDept);
        });
        if (!matchesDept) return false;
      }

      // Legacy Scope filters: branch / department
      const branchDepts = activeFilters.branchDepartments || {};
      const activeBranches = Object.keys(branchDepts);
      if (activeBranches.length > 0) {
        let matchesBranchDept = false;
        for (const branch of activeBranches) {
          const depts = branchDepts[branch] || [];
          if (depts.length === 0 || depts.includes(l.department)) {
            matchesBranchDept = true;
            break;
          }
        }
        if (!matchesBranchDept) return false;
      }

      // Search Query filter (matches employee name, ID, department, leave type, reason, or status)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (l.employeeName || '').toLowerCase().includes(q);
        const matchesId = (l.employeeId || '').toLowerCase().includes(q);
        const matchesDept = (l.department || '').toLowerCase().includes(q);
        const matchesType = (l.leaveType || '').toLowerCase().includes(q);
        const matchesReason = (l.reason || '').toLowerCase().includes(q);
        const matchesStatus = (l.status || '').toLowerCase().includes(q);

        if (!matchesName && !matchesId && !matchesDept && !matchesType && !matchesReason && !matchesStatus) {
          return false;
        }
      }

      // Date Range overlap check (leave overlaps [fromDate, toDate])
      // Only enforce date boundary if user isn't searching for a specific employee
      if (fromDate && toDate && !searchQuery.trim()) {
        const normFrom = normalizeToYYYYMMDD(fromDate);
        const normTo = normalizeToYYYYMMDD(toDate);
        const [startStr, endStr] = normFrom <= normTo ? [normFrom, normTo] : [normTo, normFrom];
        const leaveStart = normalizeToYYYYMMDD(l.startDate);
        const leaveEnd = normalizeToYYYYMMDD(l.endDate);
        if (leaveStart > endStr || leaveEnd < startStr) {
          return false;
        }
      }

      return true;
    });
  }, [leaveRequests, activeFilters, searchQuery, fromDate, toDate]);

  // Format date display (e.g. 01/09/2026)
  const formatDateDisplay = (isoStr: string) => {
    return formatDateDDMMYYYY(isoStr);
  };

  const isWorkFromHomeRequest = (leaveType?: string): boolean => {
    const type = (leaveType || '').toLowerCase();
    return type.includes('work from home') || type.includes('wfh') || type.includes('home');
  };

  const isRemoteDutyRequest = (leaveType?: string): boolean => {
    const type = (leaveType || '').toLowerCase();
    return (
      isWorkFromHomeRequest(type) ||
      type.includes('field') ||
      type.includes('visit') ||
      type.includes('duty') ||
      type.includes('office') ||
      type.includes('wfo')
    );
  };

  const actualLeaveRequests = filteredLeaveRequests.filter(l => !isWorkFromHomeRequest(l.leaveType));

  // Helper to parse time string like "09:00 AM", "14:30", "2:15 PM" or ISO strings to minutes from midnight
  const parseTimeToMinutes = (timeStr?: string | null): number => {
    if (!timeStr) return 0;
    const clean = String(timeStr).trim();
    if (!clean || clean === '--:--' || clean === '-' || clean === '—' || clean === 'N/A') return 0;

    // Handle full ISO datetime string (e.g. 2026-10-06T12:48:30.277+00:00)
    if (clean.includes('T') || clean.includes('Z') || (clean.includes('-') && clean.includes(':'))) {
      let parsed: Date;
      if (clean.endsWith('Z') || clean.includes('+') || /-[0-9]{2}:?[0-9]{2}$/.test(clean)) {
        parsed = new Date(clean);
      } else {
        parsed = new Date(clean.includes('T') ? (clean.endsWith('Z') ? clean : clean + 'Z') : clean.replace(/\s+/, 'T') + 'Z');
      }
      if (!isNaN(parsed.getTime())) {
        const istStr = parsed.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
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

  // Helper to calculate exact working hours and format nicely
  const getRecordWorkingDuration = (r: AttendanceRecord): { minutes: number; text: string; decimalHours: number; isPending: boolean } => {
    const hasOut = Boolean(r.checkOut && r.checkOut !== '--:--' && r.checkOut.trim() !== '' && !r.checkOut.toLowerCase().includes('progress'));
    if (!hasOut) {
      return { minutes: 0, text: 'In Progress', decimalHours: 0, isPending: true };
    }
    if (r.checkIn && r.checkOut) {
      const inM = parseTimeToMinutes(r.checkIn);
      const outM = parseTimeToMinutes(r.checkOut);
      let diff = outM - inM;
      if (diff < 0) diff += 24 * 60; // overnight shift
      const dec = Math.round((diff / 60) * 10) / 10;
      if (diff < 60) {
        return { minutes: diff, text: `${diff} min${diff === 1 ? '' : 's'}`, decimalHours: dec, isPending: false };
      }
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return { minutes: diff, text: m > 0 ? `${h}h ${m}m` : `${h} hrs`, decimalHours: dec, isPending: false };
    }
    const wh = toNum(r.workingHours);
    if (wh > 0) {
      return { minutes: Math.round(wh * 60), text: `${wh.toFixed(1)} hrs`, decimalHours: wh, isPending: false };
    }
    return { minutes: 0, text: '0 min', decimalHours: 0, isPending: false };
  };

  // Helper to get employee shift details
  const getEmployeeShift = (empId?: string) => {
    const emp = employees.find(e => e.id === empId || e.employeeId === empId);
    const shiftName = emp?.workShift || 'General';
    const matchedShift = shifts.find(s => 
      s.shiftName.toLowerCase() === shiftName.toLowerCase() ||
      shiftName.toLowerCase().includes(s.shiftName.toLowerCase()) ||
      s.shiftName.toLowerCase().includes(shiftName.toLowerCase())
    );
    return {
      name: matchedShift?.shiftName || 'General Shift',
      startTime: matchedShift?.startTime || '09:00 AM',
      endTime: matchedShift?.endTime || '06:00 PM',
      gracePeriodMins: matchedShift?.gracePeriodMins ?? 15,
      totalHours: matchedShift?.workingHours || 9
    };
  };

  const hasCompletedPunchOut = (record: AttendanceRecord): boolean =>
    Boolean(record.checkOut && record.checkOut !== '--:--' && record.checkOut.trim() !== '' && !record.checkOut.toLowerCase().includes('progress'));

  const isLateArrivalRecord = (record: AttendanceRecord): boolean => {
    if (record.status === 'Absent' || record.status === 'Holiday' || record.status === 'Week Off' || record.status === 'On Leave') return false;
    if (record.checkIn && record.checkIn !== '--:--') {
      const shift = getEmployeeShift(record.employeeId);
      const inM = parseTimeToMinutes(record.checkIn);
      const startM = parseTimeToMinutes(shift.startTime);
      if (inM > 0 && startM > 0) {
        return inM > (startM + shift.gracePeriodMins);
      }
    }
    return record.status === 'Late' || (record.lateStatus ? record.lateStatus !== 'On Time' && record.lateStatus !== 'N/A' : false);
  };

  const isEarlyDepartureRecord = (record: AttendanceRecord): boolean => {
    if (record.status === 'Absent') return false;
    if (!hasCompletedPunchOut(record)) return false;

    const shift = getEmployeeShift(record.employeeId);
    const outM = parseTimeToMinutes(record.checkOut);
    const endM = parseTimeToMinutes(shift.endTime);
    if (outM <= 0 || endM <= 0) return false;

    // Early departure is about leaving before shift end. Short duration after a late
    // arrival belongs in Late Arrivals, not Early Departures.
    return outM < endM;
  };

  // Report Types Metadata
  const reportCards = [
    {
      key: 'muster' as ReportTypeKey,
      title: 'Muster Roll',
      subtitle: 'Monthly calendar view',
      icon: <Calendar size={20} color="#0891b2" />,
      iconBg: '#ecfeff'
    },
    {
      key: 'absent' as ReportTypeKey,
      title: 'Absent Report',
      subtitle: 'List of absentees',
      icon: <UserX size={19} color="#ef4444" />,
      iconBg: '#fee2e2'
    },
    {
      key: 'present' as ReportTypeKey,
      title: 'Present Report',
      subtitle: 'List of present employees',
      icon: <UserCheck size={19} color="#10b981" />,
      iconBg: '#dcfce7'
    },
    {
      key: 'late' as ReportTypeKey,
      title: 'Late Arrivals',
      subtitle: 'Tardy check-ins report',
      icon: <Clock size={19} color="#f59e0b" />,
      iconBg: '#fef3c7'
    },
    {
      key: 'early' as ReportTypeKey,
      title: 'Early Departures',
      subtitle: 'Left before shift end',
      icon: <LogOut size={19} color="#06b6d4" />,
      iconBg: '#cffafe'
    },
    {
      key: 'remote' as ReportTypeKey,
      title: 'Field Visit, WFO & WFH',
      subtitle: 'Field, office & home work logs',
      icon: <MapPin size={19} color="#0891b2" />,
      iconBg: '#cffafe'
    },
    {
      key: 'overtime' as ReportTypeKey,
      title: 'Overtime Hours',
      subtitle: 'Calculated overtime list',
      icon: <Flame size={19} color="#f97316" />,
      iconBg: '#ffedd5'
    },
    {
      key: 'leave' as ReportTypeKey,
      title: 'Leave Report',
      subtitle: 'Approved leaves',
      icon: <ClipboardList size={19} color="#64748b" />,
      iconBg: '#f1f5f9'
    }
  ];

  // Export helpers for CSV, Excel, and PDF
  const getStructuredReportData = () => {
    let columns: { key: string; label: string }[] = [];
    let data: Record<string, any>[] = [];

    if (selectedReportType === 'muster') {
      columns = [
        { key: 'empId', label: 'Employee ID' },
        { key: 'name', label: 'Employee Name' },
        { key: 'dept', label: 'Department' },
        ...dateRangeList.map(d => ({ key: `day_${d}`, label: formatDateDisplay(d) })),
        { key: 'present', label: 'Present (P/WFO/FV)' },
        { key: 'absent', label: 'Absent (A)' },
        { key: 'holiday', label: 'Holidays (H)' },
        { key: 'rate', label: 'Attendance %' }
      ];

      filteredEmployees.forEach(emp => {
        const empCode = (emp.employeeId || '').toLowerCase().trim();
        const empUid = (emp.id || '').toLowerCase().trim();
        let pCount = 0;
        let aCount = 0;
        let hCount = 0;
        let eligibleWorkingDays = 0;

        const row: Record<string, any> = {
          empId: emp.employeeId,
          name: `${emp.firstName} ${emp.lastName}`,
          dept: emp.department
        };

        dateRangeList.forEach(d => {
          const isFuture = d > currentMonthInfo.today;
          const dateObj = new Date(d + 'T12:00:00');
          const isSunday = dateObj.getDay() === 0;
          const isHoliday = (holidayPolicies || []).some(h => normalizeToYYYYMMDD(h.date) === d);

          if (isFuture) {
            row[`day_${d}`] = '-';
            return;
          }

          if (isSunday || isHoliday) {
            hCount++;
            row[`day_${d}`] = 'H';
            return;
          }

          eligibleWorkingDays++;

          const rec = filteredAttendance.find(r => {
            const rEmp = (r.employeeId || '').toLowerCase().trim();
            const rDate = normalizeToYYYYMMDD(r.date || r.shiftDate);
            return (rEmp === empCode || rEmp === empUid) && rDate === d;
          });

          const st = (rec?.status || '').toLowerCase();
          const hasPunch = Boolean(rec?.checkIn && rec.checkIn !== '--:--');

          if (st.includes('field') || st.includes('visit') || st.includes('duty') || (rec?.method || '').toLowerCase().includes('field')) {
            pCount++;
            row[`day_${d}`] = 'FV';
          } else if (st.includes('wfo') || st.includes('office')) {
            pCount++;
            row[`day_${d}`] = 'WFO';
          } else if (st === 'present' || st === 'late' || st.includes('home') || hasPunch) {
            pCount++;
            row[`day_${d}`] = 'P';
          } else if (st === 'half day') {
            pCount += 0.5;
            row[`day_${d}`] = 'P';
          } else {
            // Check approved leave
            const isApprovedLeave = filteredLeaveRequests.some(l => {
              const lEmp = (l.employeeId || '').toLowerCase().trim();
              if (lEmp !== empCode && lEmp !== empUid) return false;
              if (l.status !== 'Approved') return false;
              const s = normalizeToYYYYMMDD(l.startDate);
              const e = normalizeToYYYYMMDD(l.endDate) || s;
              return s <= d && e >= d;
            });

            if (isApprovedLeave) {
              aCount++;
              row[`day_${d}`] = 'A';
            } else {
              aCount++;
              row[`day_${d}`] = 'A';
            }
          }
        });

        row.present = pCount;
        row.absent = aCount;
        row.holiday = hCount;
        row.rate = eligibleWorkingDays > 0 ? `${Math.round((pCount / eligibleWorkingDays) * 100)}%` : '100%';
        data.push(row);
      });
    } else if (selectedReportType === 'absent') {
      columns = [
        { key: 'empId', label: 'Employee ID' },
        { key: 'name', label: 'Employee Name' },
        { key: 'dept', label: 'Department' },
        { key: 'date', label: 'Date of Absence' },
        { key: 'phone', label: 'Contact Phone' },
        { key: 'status', label: 'Status' }
      ];

      filteredEmployees.forEach(emp => {
        const empCode = (emp.employeeId || '').toLowerCase().trim();
        const empUid = (emp.id || '').toLowerCase().trim();

        dateRangeList.forEach(d => {
          if (d > currentMonthInfo.today) return;
          const dateObj = new Date(d + 'T12:00:00');
          if (dateObj.getDay() === 0) return; // Sunday Weekly Off
          if ((holidayPolicies || []).some(h => normalizeToYYYYMMDD(h.date) === d)) return; // Official Holiday

          const rec = filteredAttendance.find(r => {
            const rEmp = (r.employeeId || '').toLowerCase().trim();
            const rDate = normalizeToYYYYMMDD(r.date || r.shiftDate);
            return (rEmp === empCode || rEmp === empUid) && rDate === d;
          });

          const recStatus = (rec?.status as string || '').toLowerCase();
          const isPresentOrDuty = Boolean(rec && (
            recStatus === 'present' ||
            recStatus === 'late' ||
            recStatus.includes('wfo') ||
            recStatus.includes('office') ||
            recStatus.includes('field') ||
            recStatus.includes('visit') ||
            recStatus.includes('duty') ||
            recStatus.includes('home') ||
            recStatus === 'half day' ||
            (rec.checkIn && rec.checkIn !== '--:--')
          ));
          if (isPresentOrDuty) return;

          const isLeaveOrDuty = filteredLeaveRequests.some(l => {
            const lEmp = (l.employeeId || '').toLowerCase().trim();
            if (lEmp !== empCode && lEmp !== empUid) return false;
            if (l.status !== 'Approved') return false;
            const s = normalizeToYYYYMMDD(l.startDate);
            const e = normalizeToYYYYMMDD(l.endDate) || s;
            return s <= d && e >= d;
          });
          if (isLeaveOrDuty) return;

          if (!rec || rec.status === 'Absent') {
            data.push({
              empId: emp.employeeId,
              name: `${emp.firstName} ${emp.lastName}`,
              dept: emp.department,
              date: formatDateDisplay(d),
              phone: emp.phone || emp.email || 'N/A',
              status: 'Absent'
            });
          }
        });
      });
    } else if (selectedReportType === 'present') {
      columns = [
        { key: 'empId', label: 'Employee ID' },
        { key: 'name', label: 'Employee Name' },
        { key: 'dept', label: 'Department' },
        { key: 'date', label: 'Date' },
        { key: 'checkIn', label: 'Check In' },
        { key: 'checkOut', label: 'Check Out' },
        { key: 'workingHours', label: 'Working Hours' },
        { key: 'verification', label: 'Verification / Status' }
      ];

      filteredAttendance.filter(r => {
        const st = (r.status || '').toLowerCase();
        const hasPunch = Boolean(r.checkIn && r.checkIn !== '--:--');
        return st === 'present' || st === 'late' || st.includes('wfo') || st.includes('office') || st.includes('field') || st.includes('visit') || st.includes('duty') || st.includes('home') || hasPunch;
      }).forEach(r => {
        const st = (r.status || '').toLowerCase();
        const isField = st.includes('field') || st.includes('visit') || st.includes('duty') || (r.method || '').toLowerCase().includes('field');
        const isWfo = st.includes('wfo') || st.includes('office') || st.includes('home');
        const isLate = isLateArrivalRecord(r);
        const dur = getRecordWorkingDuration(r);

        data.push({
          empId: r.employeeId,
          name: r.employeeName,
          dept: r.department,
          date: formatDateDisplay(r.date),
          checkIn: formatTimeDisplay(r.checkIn, '--:--'),
          checkOut: r.checkOut && r.checkOut !== '--:--' && !r.checkOut.toLowerCase().includes('progress') ? formatTimeDisplay(r.checkOut, '--:--') : 'In Progress',
          workingHours: dur.isPending ? 'In Progress' : dur.text,
          verification: isField ? 'Field Visit' : isWfo ? 'Work From Office (WFO)' : isLate ? 'Late Punch' : (r.method || 'Face Recognition')
        });
      });
    } else if (selectedReportType === 'late') {
      columns = [
        { key: 'empId', label: 'Employee ID' },
        { key: 'name', label: 'Employee Name' },
        { key: 'dept', label: 'Department' },
        { key: 'date', label: 'Date' },
        { key: 'shiftTime', label: 'Shift Time' },
        { key: 'checkIn', label: 'Actual Punch In' },
        { key: 'delay', label: 'Delay Duration' }
      ];
      filteredAttendance.filter(r => {
        return isLateArrivalRecord(r);
      }).forEach(r => {
        const shift = getEmployeeShift(r.employeeId);
        const inM = parseTimeToMinutes(r.checkIn);
        const startM = parseTimeToMinutes(shift.startTime);
        const diff = Math.max(0, inM - startM);
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        data.push({
          empId: r.employeeId,
          name: r.employeeName,
          dept: r.department,
          date: formatDateDisplay(r.date),
          shiftTime: shift.startTime,
          checkIn: formatTimeDisplay(r.checkIn, '--:--'),
          delay: diff > 0 ? (h > 0 ? `+${h}h ${m}m` : `+${m} mins`) : 'On Time'
        });
      });
    } else if (selectedReportType === 'early') {
      columns = [
        { key: 'empId', label: 'Employee ID' },
        { key: 'name', label: 'Employee Name' },
        { key: 'dept', label: 'Department' },
        { key: 'date', label: 'Date' },
        { key: 'shiftTiming', label: 'Shift Timing' },
        { key: 'checkIn', label: 'Punch In' },
        { key: 'checkOut', label: 'Punch Out' },
        { key: 'earlyBy', label: 'Early Departure' },
        { key: 'workingHours', label: 'Working Hours' }
      ];
      filteredAttendance.filter(r => {
        return isEarlyDepartureRecord(r);
      }).forEach(r => {
        const shift = getEmployeeShift(r.employeeId);
        const outM = parseTimeToMinutes(r.checkOut);
        const endM = parseTimeToMinutes(shift.endTime);
        const diff = Math.max(0, endM - outM);
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        const dur = getRecordWorkingDuration(r);
        data.push({
          empId: r.employeeId,
          name: r.employeeName,
          dept: r.department,
          date: formatDateDisplay(r.date),
          shiftTiming: `${shift.startTime} - ${shift.endTime}`,
          checkIn: formatTimeDisplay(r.checkIn, '--:--'),
          checkOut: formatTimeDisplay(r.checkOut, '--:--'),
          earlyBy: h > 0 ? `${h}h ${m}m early` : `${m} mins early`,
          workingHours: dur.text
        });
      });
    } else if (selectedReportType === 'remote') {
      columns = [
        { key: 'empId', label: 'Employee ID' },
        { key: 'name', label: 'Employee Name' },
        { key: 'dept', label: 'Department' },
        { key: 'date', label: 'Date' },
        { key: 'checkIn', label: 'Check In' },
        { key: 'checkOut', label: 'Check Out' },
        { key: 'workingHours', label: 'Working Hours' },
        { key: 'mode', label: 'Deployment / Type' }
      ];
      filteredAttendance.filter(r => {
        const st = (r.status || '').toLowerCase();
        const method = (r.method || '').toLowerCase();
        const isField = st.includes('field') || st.includes('visit') || st.includes('duty') || method.includes('field');
        const isWfo = st.includes('wfo') || st.includes('office');
        const isWfh = st.includes('home');
        const isLeaveMatch = filteredLeaveRequests.some(l => 
          (l.employeeId === r.employeeId) && 
          isRemoteDutyRequest(l.leaveType) &&
          l.status === 'Approved' &&
          l.startDate <= r.date && l.endDate >= r.date
        );
        return isField || isWfo || isWfh || isLeaveMatch;
      }).forEach(r => {
        const st = (r.status || '').toLowerCase();
        const method = (r.method || '').toLowerCase();
        const isField = st.includes('field') || st.includes('visit') || st.includes('duty') || method.includes('field');
        const isWfo = st.includes('wfo') || st.includes('office');
        const dur = getRecordWorkingDuration(r);
        data.push({
          empId: r.employeeId,
          name: r.employeeName,
          dept: r.department,
          date: formatDateDisplay(r.date),
          checkIn: formatTimeDisplay(r.checkIn, '--:--'),
          checkOut: r.checkOut && r.checkOut !== '--:--' && !r.checkOut.toLowerCase().includes('progress') ? formatTimeDisplay(r.checkOut, '--:--') : 'In Progress',
          workingHours: dur.isPending ? 'In Progress' : dur.text,
          mode: isField ? 'Field Visit' : isWfo ? 'Work From Office (WFO)' : 'Work From Home'
        });
      });
      filteredLeaveRequests.filter(l => l.status === 'Approved' && isRemoteDutyRequest(l.leaveType)).forEach(l => {
        const hasAttendanceRow = filteredAttendance.some(r => {
          if (r.employeeId !== l.employeeId) return false;
          const rDate = normalizeToYYYYMMDD(r.date || r.shiftDate);
          const start = normalizeToYYYYMMDD(l.startDate);
          const end = normalizeToYYYYMMDD(l.endDate) || start;
          return !!rDate && rDate >= start && rDate <= end;
        });
        if (hasAttendanceRow) return;

        const mode = isWorkFromHomeRequest(l.leaveType)
          ? 'Work From Home'
          : l.leaveType.toLowerCase().includes('office') || l.leaveType.toLowerCase().includes('wfo')
            ? 'Work From Office (WFO)'
            : 'Field Visit';
        data.push({
          empId: l.employeeId,
          name: l.employeeName,
          dept: l.department,
          date: l.startDate === l.endDate ? formatDateDisplay(l.startDate) : `${formatDateDisplay(l.startDate)} - ${formatDateDisplay(l.endDate)}`,
          checkIn: '--:--',
          checkOut: '--:--',
          workingHours: 'Approved Request',
          mode
        });
      });
    } else if (selectedReportType === 'overtime') {
      columns = [
        { key: 'empId', label: 'Employee ID' },
        { key: 'name', label: 'Employee Name' },
        { key: 'dept', label: 'Department' },
        { key: 'date', label: 'Date' },
        { key: 'standardHours', label: 'Standard Hours' },
        { key: 'totalHours', label: 'Total Hours' },
        { key: 'otHours', label: 'OT Logged' },
        { key: 'rate', label: 'Multiplier' }
      ];
      filteredAttendance.filter(r => {
        if (r.status === 'Absent') return false;
        const dur = getRecordWorkingDuration(r);
        const shift = getEmployeeShift(r.employeeId);
        const hours = dur.decimalHours > 0 ? dur.decimalHours : toNum(r.workingHours);
        const otExplicit = (r as any).approvedOtHours || r.otHours || 0;
        return otExplicit > 0 || hours > (shift.totalHours || 8) + 0.25;
      }).forEach(r => {
        const shift = getEmployeeShift(r.employeeId);
        const dur = getRecordWorkingDuration(r);
        const rawHours = dur.decimalHours > 0 ? dur.decimalHours : toNum(r.workingHours);
        const explicitOt = (r as any).approvedOtHours || r.otHours || 0;
        const calculatedOt = Math.max(0, rawHours - (shift.totalHours || 8));
        const otHrs = explicitOt > 0 ? explicitOt : calculatedOt;
        const totalHours = Math.max(rawHours, (shift.totalHours || 8) + otHrs);
        data.push({
          empId: r.employeeId,
          name: r.employeeName,
          dept: r.department,
          date: formatDateDisplay(r.date),
          standardHours: `${(shift.totalHours || 8).toFixed(1)} hrs`,
          totalHours: `${totalHours.toFixed(1)} hrs`,
          otHours: `+${otHrs.toFixed(1)} hrs`,
          rate: '1.5x Rate'
        });
      });
    } else if (selectedReportType === 'leave') {
      columns = [
        { key: 'empId', label: 'Employee ID' },
        { key: 'name', label: 'Employee Name' },
        { key: 'dept', label: 'Department' },
        { key: 'leaveType', label: 'Leave Type' },
        { key: 'startDate', label: 'From Date' },
        { key: 'endDate', label: 'To Date' },
        { key: 'daysCount', label: 'Days' },
        { key: 'reason', label: 'Reason' },
        { key: 'status', label: 'Status' }
      ];
      actualLeaveRequests.forEach(l => {
        const days = l.daysCount || (() => {
          if (l.startDate && l.endDate) {
            const s = new Date(l.startDate).getTime();
            const e = new Date(l.endDate).getTime();
            return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
          }
          return 1;
        })();
        data.push({
          empId: l.employeeId,
          name: l.employeeName,
          dept: l.department,
          leaveType: l.leaveType,
          startDate: formatDateDisplay(l.startDate),
          endDate: formatDateDisplay(l.endDate),
          daysCount: `${days} ${days === 1 ? 'day' : 'days'}`,
          reason: l.reason || 'Personal Leave',
          status: l.status
        });
      });
    } else {
      columns = [
        { key: 'id', label: 'Record ID' },
        { key: 'empId', label: 'Employee ID' },
        { key: 'name', label: 'Name' },
        { key: 'dept', label: 'Department' },
        { key: 'date', label: 'Date' },
        { key: 'status', label: 'Status' },
        { key: 'workingHours', label: 'Hours' }
      ];
      filteredAttendance.forEach(r => {
        const dur = getRecordWorkingDuration(r);
        data.push({
          id: r.id,
          empId: r.employeeId,
          name: r.employeeName,
          dept: r.department,
          date: formatDateDisplay(r.date),
          status: r.status,
          workingHours: dur.text
        });
      });
    }

    return { columns, data };
  };

  const handleExportCSV = () => {
    const { columns, data } = getStructuredReportData();
    const fStr = normalizeToYYYYMMDD(fromDate);
    const tStr = normalizeToYYYYMMDD(toDate);
    downloadCSV(data, `Attendance_${selectedReportType.toUpperCase()}_Report_${fStr}_to_${tStr}`, columns);
  };

  const handleExportExcel = () => {
    const fStr = normalizeToYYYYMMDD(fromDate);
    const tStr = normalizeToYYYYMMDD(toDate);
    if (selectedReportType === 'muster') {
      downloadPagarBookMusterRollExcel(
        filteredEmployees,
        attendanceRecords,
        leaveRequests,
        fStr,
        tStr,
        businessSettings?.businessName || companyInfo?.companyName || 'BUSINZ'
      );
      return;
    }
    const { columns, data } = getStructuredReportData();
    downloadExcel(data, `Attendance_${selectedReportType.toUpperCase()}_Report_${fStr}_to_${tStr}`, columns);
  };

  const handleExportPDF = () => {
    const { columns, data } = getStructuredReportData();
    const fStr = normalizeToYYYYMMDD(fromDate);
    const tStr = normalizeToYYYYMMDD(toDate);
    downloadPDF(data, `Attendance ${selectedReportType.toUpperCase()} Report (${formatDateDisplay(fromDate)} to ${formatDateDisplay(toDate)})`, `Attendance_${selectedReportType.toUpperCase()}_Report_${fStr}_to_${tStr}`, columns);
  };

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '28px', marginTop: '12px' }}>
      
      {/* 1. Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            {title || 'Attendance Reports'}
          </h1>
          <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '4px 0 0' }}>
            {subtitle || 'Generate detailed attendance, muster roll, and leave reports.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {isHrOrCeo && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsManualAttendanceModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '10px',
                padding: '9px 18px',
                fontSize: '0.84rem',
                fontWeight: 700,
                backgroundColor: '#0E7490',
                borderColor: '#0E7490',
                boxShadow: '0 2px 8px rgba(14, 116, 144, 0.25)',
                color: '#FFFFFF'
              }}
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Manual Attendance</span>
            </button>
          )}

          <ExportDropdown 
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            onExportCSV={handleExportCSV}
            label="Download"
          />
        </div>
      </div>

      {/* 2. FROM DATE / TO DATE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        
        {/* FROM DATE */}
        <div>
          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
            FROM DATE
          </label>
          <div style={{ position: 'relative' }}>
            <input 
              type="date"
              className="form-control"
              value={normalizeToYYYYMMDD(fromDate) || fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '0.88rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontWeight: 600,
                backgroundColor: '#ffffff'
              }}
            />
          </div>
        </div>

        {/* TO DATE */}
        <div>
          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
            TO DATE
          </label>
          <div style={{ position: 'relative' }}>
            <input 
              type="date"
              className="form-control"
              value={normalizeToYYYYMMDD(toDate) || toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '0.88rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontWeight: 600,
                backgroundColor: '#ffffff'
              }}
            />
          </div>
        </div>

      </div>

      {/* 3. SCOPE FILTERS */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
          SCOPE FILTERS
        </label>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: activeFilterCount > 0 ? '#ECFEFF' : '#f8fafc',
          border: activeFilterCount > 0 ? '1px solid #A5F3FC' : '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '12px 18px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <span style={{ fontSize: '0.85rem', color: activeFilterCount > 0 ? '#0E7490' : '#475569', fontWeight: activeFilterCount > 0 ? 700 : 500 }}>
              {activeFilterCount > 0
                ? `Active Filters (${activeFilterCount} selected): Department, shift, and employment filters are applied.`
                : 'Department, shift, employment type, and work mode. Defaults include all filters (can be adjusted).'
              }
            </span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilter}
                style={{
                  marginLeft: '12px',
                  background: 'none',
                  border: 'none',
                  color: '#EF4444',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Reset All Filters
              </button>
            )}
          </div>
          <button 
            type="button"
            onClick={handleOpenFilter}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 16px',
              borderRadius: '8px',
              border: '1.5px solid #0E7490',
              backgroundColor: activeFilterCount > 0 ? '#0E7490' : '#ffffff',
              color: activeFilterCount > 0 ? '#ffffff' : '#0E7490',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(14, 116, 144, 0.15)',
              transition: 'all 0.15s ease'
            }}
          >
            <SlidersHorizontal size={14} color={activeFilterCount > 0 ? '#ffffff' : '#0E7490'} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span style={{
                backgroundColor: '#ffffff',
                color: '#0E7490',
                borderRadius: '9999px',
                padding: '1px 6px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 4. SELECT REPORT TYPE */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }}>
          SELECT REPORT TYPE
        </label>

        <div className="report-type-cards-grid">
          {reportCards.map(card => {
            const isSelected = selectedReportType === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setSelectedReportType(card.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: isSelected ? '2px solid #0E7490' : '1px solid #e2e8f0',
                  backgroundColor: isSelected ? '#ECFEFF' : '#ffffff',
                  boxShadow: isSelected ? '0 2px 8px rgba(14, 116, 144, 0.2)' : '0 1px 2px rgba(0,0,0,0.02)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: card.key === 'muster' ? '8px' : '99px',
                  backgroundColor: card.iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {card.icon}
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: isSelected ? '#0E7490' : '#1e293b' }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: isSelected ? '#155E75' : '#64748b', marginTop: '2px' }}>
                    {card.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* DIVIDER */}
      <hr style={{ border: 'none', borderBottom: '1px solid #e2e8f0', margin: '24px 0' }} />

      {/* 5. GENERATED REPORT DATA TABLE */}
      <div>
        
        {/* Table Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              {reportCards.find(c => c.key === selectedReportType)?.title}
            </h3>
            <span style={{ 
              backgroundColor: '#f0fdf4', 
              color: '#15803d', 
              border: '1px solid #bbf7d0', 
              fontSize: '0.72rem', 
              fontWeight: 700, 
              padding: '2px 8px', 
              borderRadius: '6px' 
            }}>
              {formatDateDisplay(fromDate)} to {formatDateDisplay(toDate)}
            </span>
          </div>

          <div style={{ position: 'relative', minWidth: '260px' }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text"
              placeholder="Search employee, ID, or dept..."
              className="form-control"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px', paddingRight: searchQuery ? '28px' : '12px', fontSize: '0.82rem', padding: '6px 12px 6px 32px', borderRadius: '8px' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Table Content based on Report Type */}
        {selectedReportType === 'muster' ? (
          <MusterRollModule 
            searchQueryProp={searchQuery}
            fromDateProp={fromDate}
            toDateProp={toDate}
          />
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
            {/* B. ABSENT REPORT VIEW */}
          {selectedReportType === 'absent' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Department</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Date of Absence</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Contact Info</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const absentRows: Array<{ emp: any; date: string }> = [];
                  filteredEmployees.forEach(emp => {
                    const empCode = (emp.employeeId || '').toLowerCase().trim();
                    const empUid = (emp.id || '').toLowerCase().trim();

                    dateRangeList.forEach(d => {
                      // 1. Exclude future dates
                      if (d > currentMonthInfo.today) return;

                      // 2. Exclude Sundays (Weekly Off) and Official Company Holidays
                      const dateObj = new Date(d + 'T12:00:00');
                      const isSunday = dateObj.getDay() === 0;
                      const isHoliday = (holidayPolicies || []).some(h => normalizeToYYYYMMDD(h.date) === d);
                      if (isSunday || isHoliday) return;

                      // 3. Find any attendance record for this employee and date
                      const rec = filteredAttendance.find(r => {
                        const rEmp = (r.employeeId || '').toLowerCase().trim();
                        const rDate = normalizeToYYYYMMDD(r.date || r.shiftDate);
                        return (rEmp === empCode || rEmp === empUid) && rDate === d;
                      });

                      // 4. Check if employee is present, late, WFO, Field Visit, or has a valid punch
                      const recStatus = (rec?.status as string || '').toLowerCase();
                      const isPresentOrDuty = Boolean(rec && (
                        recStatus === 'present' ||
                        recStatus === 'late' ||
                        recStatus.includes('wfo') ||
                        recStatus.includes('office') ||
                        recStatus.includes('field') ||
                        recStatus.includes('visit') ||
                        recStatus.includes('duty') ||
                        recStatus.includes('home') ||
                        recStatus === 'half day' ||
                        (rec.checkIn && rec.checkIn !== '--:--')
                      ));
                      if (isPresentOrDuty) return;

                      // 5. Check if employee is on approved leave or WFO/Field Visit
                      const isLeaveOrDuty = filteredLeaveRequests.some(l => {
                        const lEmp = (l.employeeId || '').toLowerCase().trim();
                        if (lEmp !== empCode && lEmp !== empUid) return false;
                        if (l.status !== 'Approved') return false;
                        const s = normalizeToYYYYMMDD(l.startDate);
                        const e = normalizeToYYYYMMDD(l.endDate) || s;
                        return s <= d && e >= d;
                      });
                      if (isLeaveOrDuty) return;

                      // If no punch or marked Absent on a past working day -> Absent!
                      if (!rec || rec.status === 'Absent') {
                        absentRows.push({ emp, date: d });
                      }
                    });
                  });

                  if (absentRows.length === 0) {
                    return (
                      <tr>
                        <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>
                          ✅ No absentees logged for the selected working dates!
                        </td>
                      </tr>
                    );
                  }

                  return absentRows.map((item, idx) => (
                    <tr key={`${item.emp.id}-${item.date}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.emp.firstName} {item.emp.lastName}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{item.emp.employeeId}</div>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>{item.emp.department}</td>
                      <td style={{ padding: '10px 14px', color: '#0f172a', fontWeight: 600 }}>{formatDateDisplay(item.date)}</td>
                      <td style={{ padding: '10px 14px', color: '#64748b' }}>{item.emp.phone || item.emp.email || 'N/A'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '3px 10px', borderRadius: '6px', fontWeight: 700, fontSize: '0.75rem' }}>
                          Absent
                        </span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          )}

          {/* C. PRESENT REPORT VIEW */}
          {selectedReportType === 'present' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Check In</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Check Out</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Working Hours</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Verification / Status</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const presentList = filteredAttendance.filter(r => {
                    const st = (r.status || '').toLowerCase();
                    const hasPunch = Boolean(r.checkIn && r.checkIn !== '--:--');
                    return st === 'present' || st === 'late' || st.includes('wfo') || st.includes('office') || st.includes('field') || st.includes('visit') || st.includes('duty') || st.includes('home') || hasPunch;
                  });

                  if (presentList.length === 0) {
                    return (
                      <tr>
                        <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                          No present records found for this date range.
                        </td>
                      </tr>
                    );
                  }

                  return presentList.map(r => {
                    const st = (r.status || '').toLowerCase();
                    const isWfo = st.includes('wfo') || st.includes('office') || st.includes('home');
                    const isField = st.includes('field') || st.includes('visit') || st.includes('duty') || (r.method || '').toLowerCase().includes('field');
                    const isLate = isLateArrivalRecord(r);
                    const dur = getRecordWorkingDuration(r);

                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.employeeName}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{r.employeeId} • {r.department}</div>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{formatDateDisplay(r.date)}</td>
                        <td style={{ padding: '10px 14px', color: isField ? '#0E7490' : isWfo ? '#4338CA' : isLate ? '#D97706' : '#15803d', fontWeight: 700 }}>
                          {formatTimeDisplay(r.checkIn, '--:--')}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#475569' }}>
                          {r.checkOut && r.checkOut !== '--:--' && !r.checkOut.toLowerCase().includes('progress') ? formatTimeDisplay(r.checkOut, '--:--') : 'In Progress'}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: dur.isPending ? '#0284c7' : '#0f172a' }}>
                          {dur.isPending ? 'In Progress' : dur.text}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isField ? (
                            <span style={{ backgroundColor: '#CFFAFE', color: '#0E7490', border: '1px solid #67E8F9', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                              🚗 Field Visit
                            </span>
                          ) : isWfo ? (
                            <span style={{ backgroundColor: '#E0E7FF', color: '#4338CA', border: '1px solid #A5B4FC', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                              🏢 Work From Office (WFO)
                            </span>
                          ) : isLate ? (
                            <span style={{ backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                              ⏱️ Late Punch
                            </span>
                          ) : (
                            <span style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                              {r.method || 'Face Recognition'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}

          {/* D. LATE REPORT VIEW */}
          {selectedReportType === 'late' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Shift Time</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Actual Punch In</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Delay Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendance.filter(r => {
                  return isLateArrivalRecord(r);
                }).length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>
                      No latecomers recorded in this timeframe!
                    </td>
                  </tr>
                ) : (
                  filteredAttendance.filter(r => {
                    return isLateArrivalRecord(r);
                  }).map(r => {
                    const shift = getEmployeeShift(r.employeeId);
                    const inM = parseTimeToMinutes(r.checkIn);
                    const startM = parseTimeToMinutes(shift.startTime);
                    const diff = Math.max(0, inM - startM);
                    const h = Math.floor(diff / 60);
                    const m = diff % 60;
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.employeeName}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{r.employeeId} • {r.department}</div>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{formatDateDisplay(r.date)}</td>
                        <td style={{ padding: '10px 14px', color: '#64748b' }}>{shift.startTime}</td>
                        <td style={{ padding: '10px 14px', color: '#d97706', fontWeight: 700 }}>{formatTimeDisplay(r.checkIn, '--:--')}</td>
                        <td style={{ padding: '10px 14px', color: '#b45309', fontWeight: 700 }}>
                          {diff > 0 ? (h > 0 ? `+${h}h ${m}m` : `+${m} mins`) : 'On Time'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {/* E. EARLY DEPARTURES REPORT VIEW */}
          {selectedReportType === 'early' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Shift Timing</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Punch In</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Punch Out</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Early Departure</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Working Hours</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const earlyList = filteredAttendance.filter(r => {
                    return isEarlyDepartureRecord(r);
                  });

                  if (earlyList.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#0891b2', fontWeight: 600 }}>
                          No early departures recorded for this date range!
                        </td>
                      </tr>
                    );
                  }

                  return earlyList.map(r => {
                    const shift = getEmployeeShift(r.employeeId);
                    const outM = parseTimeToMinutes(r.checkOut);
                    const endM = parseTimeToMinutes(shift.endTime);
                    const diff = Math.max(0, endM - outM);
                    const h = Math.floor(diff / 60);
                    const m = diff % 60;
                    const dur = getRecordWorkingDuration(r);
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.employeeName}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{r.employeeId} • {r.department}</div>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{formatDateDisplay(r.date)}</td>
                        <td style={{ padding: '10px 14px', color: '#64748b' }}>{shift.startTime} - {shift.endTime}</td>
                        <td style={{ padding: '10px 14px', color: '#0f172a', fontWeight: 600 }}>{formatTimeDisplay(r.checkIn, '--:--')}</td>
                        <td style={{ padding: '10px 14px', color: '#0e7490', fontWeight: 700 }}>{formatTimeDisplay(r.checkOut, '--:--')}</td>
                        <td style={{ padding: '10px 14px', color: '#0891b2', fontWeight: 700 }}>
                          {h > 0 ? `${h}h ${m}m early` : `${m} mins early`}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>{dur.text}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}

          {/* F. FIELD VISIT, WFO & WFH REPORT VIEW */}
          {selectedReportType === 'remote' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Check In</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Check Out</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Working Hours</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Log Type / Deployment</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const attendanceRemoteList = filteredAttendance.filter(r => {
                    const st = (r.status || '').toLowerCase();
                    const method = (r.method || '').toLowerCase();
                    const isField = st.includes('field') || st.includes('visit') || st.includes('duty') || method.includes('field');
                    const isWfo = st.includes('wfo') || st.includes('office');
                    const isWfh = st.includes('home');
                    const isLeaveMatch = filteredLeaveRequests.some(l => 
                      (l.employeeId === r.employeeId) && 
                      isRemoteDutyRequest(l.leaveType) &&
                      l.status === 'Approved' &&
                      l.startDate <= r.date && l.endDate >= r.date
                    );
                    return isField || isWfo || isWfh || isLeaveMatch;
                  });

                  const remoteLeaveList = filteredLeaveRequests.filter(l => {
                    if (l.status !== 'Approved' || !isRemoteDutyRequest(l.leaveType)) return false;
                    return !attendanceRemoteList.some(r => {
                      if (r.employeeId !== l.employeeId) return false;
                      const rDate = normalizeToYYYYMMDD(r.date || r.shiftDate);
                      const start = normalizeToYYYYMMDD(l.startDate);
                      const end = normalizeToYYYYMMDD(l.endDate) || start;
                      return !!rDate && rDate >= start && rDate <= end;
                    });
                  });

                  if (attendanceRemoteList.length === 0 && remoteLeaveList.length === 0) {
                    return (
                      <tr>
                        <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#0e7490', fontWeight: 600 }}>
                          No Field Visit, WFO, or WFH records logged for this date range.
                        </td>
                      </tr>
                    );
                  }

                  const attendanceRows = attendanceRemoteList.map(r => {
                    const st = (r.status || '').toLowerCase();
                    const method = (r.method || '').toLowerCase();
                    const isField = st.includes('field') || st.includes('visit') || st.includes('duty') || method.includes('field');
                    const isWfo = st.includes('wfo') || st.includes('office');
                    const dur = getRecordWorkingDuration(r);

                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.employeeName}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{r.employeeId} • {r.department}</div>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{formatDateDisplay(r.date)}</td>
                        <td style={{ padding: '10px 14px', color: isField ? '#0E7490' : isWfo ? '#4338CA' : '#6D28D9', fontWeight: 700 }}>
                          {formatTimeDisplay(r.checkIn, '--:--')}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#475569' }}>
                          {r.checkOut && r.checkOut !== '--:--' && !r.checkOut.toLowerCase().includes('progress') ? formatTimeDisplay(r.checkOut, '--:--') : 'In Progress'}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: dur.isPending ? '#0284c7' : '#0f172a' }}>
                          {dur.isPending ? 'In Progress' : dur.text}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isField ? (
                            <span style={{ backgroundColor: '#CFFAFE', color: '#0E7490', border: '1px solid #67E8F9', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                              🚗 Field Visit
                            </span>
                          ) : isWfo ? (
                            <span style={{ backgroundColor: '#E0E7FF', color: '#4338CA', border: '1px solid #A5B4FC', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                              🏢 Work From Office (WFO)
                            </span>
                          ) : (
                            <span style={{ backgroundColor: '#EDE9FE', color: '#6D28D9', border: '1px solid #DDD6FE', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                              🏠 Work From Home
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  });

                  const leaveRows = remoteLeaveList.map(l => {
                    const isWfh = isWorkFromHomeRequest(l.leaveType);
                    const isWfo = (l.leaveType || '').toLowerCase().includes('office') || (l.leaveType || '').toLowerCase().includes('wfo');
                    return (
                      <tr key={`remote-leave-${l.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{l.employeeName}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{l.employeeId} - {l.department}</div>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {l.startDate === l.endDate ? formatDateDisplay(l.startDate) : `${formatDateDisplay(l.startDate)} - ${formatDateDisplay(l.endDate)}`}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8', fontWeight: 700 }}>--:--</td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8' }}>--:--</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>Approved Request</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            backgroundColor: isWfh ? '#EDE9FE' : isWfo ? '#E0E7FF' : '#CFFAFE',
                            color: isWfh ? '#6D28D9' : isWfo ? '#4338CA' : '#0E7490',
                            border: `1px solid ${isWfh ? '#DDD6FE' : isWfo ? '#A5B4FC' : '#67E8F9'}`,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}>
                            {isWfh ? 'Work From Home' : isWfo ? 'Work From Office (WFO)' : 'Field Visit'}
                          </span>
                        </td>
                      </tr>
                    );
                  });

                  return [...attendanceRows, ...leaveRows];
                })()}
              </tbody>
            </table>
          )}

          {/* G. HALF-DAY VIEW (IF ACCESSED DIRECTLY) */}
          {selectedReportType === 'halfday' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Session</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Logged Hours</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendance.filter(r => r.status === 'Half Day').length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                      No half-day records for this date range.
                    </td>
                  </tr>
                ) : (
                  filteredAttendance.filter(r => r.status === 'Half Day').map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.employeeName}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{r.employeeId} • {r.department}</div>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{formatDateDisplay(r.date)}</td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>First Half (Morning)</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{toNum(r.workingHours)} hrs</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ backgroundColor: '#f3e8ff', color: '#7e22ce', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                          Half-Day Approved
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* H. OVERTIME VIEW */}
          {selectedReportType === 'overtime' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Standard Hours</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Total Hours</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>OT Logged</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Multiplier</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const otList = filteredAttendance.filter(r => {
                    if (r.status === 'Absent') return false;
                    const dur = getRecordWorkingDuration(r);
                    const shift = getEmployeeShift(r.employeeId);
                    const hours = dur.decimalHours > 0 ? dur.decimalHours : toNum(r.workingHours);
                    const otExplicit = (r as any).approvedOtHours || r.otHours || 0;
                    return otExplicit > 0 || hours > (shift.totalHours || 8) + 0.25;
                  });

                  if (otList.length === 0) {
                    return (
                      <tr>
                        <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                          No overtime logged for this timeframe.
                        </td>
                      </tr>
                    );
                  }

                  return otList.map(r => {
                    const shift = getEmployeeShift(r.employeeId);
                    const dur = getRecordWorkingDuration(r);
                    const rawHours = dur.decimalHours > 0 ? dur.decimalHours : toNum(r.workingHours);
                    const explicitOt = (r as any).approvedOtHours || r.otHours || 0;
                    const calculatedOt = Math.max(0, rawHours - (shift.totalHours || 8));
                    const otHrs = explicitOt > 0 ? explicitOt : calculatedOt;
                    const totalHours = Math.max(rawHours, (shift.totalHours || 8) + otHrs);

                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.employeeName}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{r.employeeId} • {r.department}</div>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{formatDateDisplay(r.date)}</td>
                        <td style={{ padding: '10px 14px', color: '#64748b' }}>{(shift.totalHours || 8).toFixed(1)} hrs</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>{totalHours.toFixed(1)} hrs</td>
                        <td style={{ padding: '10px 14px', color: '#0E7490', fontWeight: 800 }}>+{otHrs.toFixed(1)} hrs</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ backgroundColor: '#ECFEFF', color: '#0E7490', border: '1px solid #A5F3FC', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                            1.5x Rate
                          </span>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}

          {/* I. LEAVE REPORT VIEW */}
          {selectedReportType === 'leave' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Leave Type</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>From Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>To Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Days</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Reason</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {actualLeaveRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                      {searchQuery.trim() ? (
                        <span>No leave requests match "<strong>{searchQuery}</strong>".</span>
                      ) : (
                        <span>No leave requests found for the selected date range.</span>
                      )}
                    </td>
                  </tr>
                ) : (
                  actualLeaveRequests.map(l => {
                    const days = l.daysCount || (() => {
                      if (l.startDate && l.endDate) {
                        const s = new Date(l.startDate).getTime();
                        const e = new Date(l.endDate).getTime();
                        return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
                      }
                      return 1;
                    })();

                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{l.employeeName}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{l.employeeId} • {l.department}</div>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>{l.leaveType}</td>
                        <td style={{ padding: '10px 14px', color: '#475569' }}>{formatDateDisplay(l.startDate)}</td>
                        <td style={{ padding: '10px 14px', color: '#475569' }}>{formatDateDisplay(l.endDate)}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>{days} {days === 1 ? 'day' : 'days'}</td>
                        <td style={{ padding: '10px 14px', color: '#64748b' }}>{l.reason || 'Personal Leave'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ 
                            backgroundColor: l.status === 'Approved' ? '#dcfce7' : l.status === 'Pending' ? '#fef3c7' : '#fee2e2', 
                            color: l.status === 'Approved' ? '#15803d' : l.status === 'Pending' ? '#b45309' : '#b91c1c', 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            fontSize: '0.75rem', 
                            fontWeight: 700 
                          }}>
                            {l.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
          </div>
        )}

      </div>

      <ManualAttendanceEntryModal
        isOpen={isManualAttendanceModalOpen}
        onClose={() => setIsManualAttendanceModalOpen(false)}
      />

      <FilterReportsModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        currentFilters={activeFilters}
        onApply={handleApplyFilter}
        onReset={handleResetFilter}
      />

    </div>
  );
};
