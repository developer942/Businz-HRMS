import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { FilterReportsModal, FilterReportsState, initialFilterReportsState } from '../common/FilterReportsModal';
import { EmployeeProfile } from '../employees/EmployeeProfile';
import { AttendanceCategoryModal, AttendanceCategoryType } from './AttendanceCategoryModal';
import { TodayAttendanceCard } from './TodayAttendanceCard';
import { EmployeeMonthlyAttendanceCard } from './EmployeeMonthlyAttendanceCard';
import { Employee, AttendanceRecord, LeaveRequest, TaskItem, HolidayItem } from '../../types/hrms';
import { formatDateDDMMYYYY, formatTimeDisplay } from '../../utils/dateUtils';
import { getMonthInfo, getLocalDateStr, isDateInMonth, countLeaveDaysInMonth } from '../../utils/monthUtils';
import { isAttendanceExemptEmployee } from '../../data/hrmsInitialData';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  LogOut,
  TrendingUp, 
  Calendar, 
  CalendarDays,
  CalendarCheck,
  Gift, 
  Award,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Filter,
  CheckSquare,
  ChevronRight,
  X
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { 
    currentUser, 
    employees, 
    attendanceRecords, 
    leaveRequests, 
    tasks, 
    approveLeave,
    rejectLeave,
    setActiveModule,
    hasPermission,
    shifts,
    faceLogs,
    holidayPolicies
  } = useHRMS();

  const isCEO = 
    currentUser.role === 'CEO' || 
    currentUser.role === 'Super Admin' || 
    currentUser.designation === 'CEO' || 
    (currentUser.designation && currentUser.designation.toLowerCase().includes('ceo')) || 
    currentUser.employeeId === 'EMP-000';
  const isHRApprover = currentUser.role === 'HR Admin' || currentUser.role === 'HR Manager' || currentUser.role === 'HR' || (currentUser.department && currentUser.department.toLowerCase().includes('hr'));
  const canApproveLeave = isCEO || isHRApprover;
  const isEmployee = currentUser.role === 'Employee' && !isCEO;
  const [profileModalEmployee, setProfileModalEmployee] = useState<Employee | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<AttendanceCategoryType | null>(null);
  const todayStr = getLocalDateStr();

  const normalizeKey = (value?: string | null) => (value || '').trim().toLowerCase();
  const employeeFullName = (emp: Employee) => `${emp.firstName} ${emp.lastName}`.trim();
  const attendanceRecordDate = (record: AttendanceRecord) => (record.shiftDate || record.date || '').slice(0, 10);
  const isTodayAttendanceRecord = (record: AttendanceRecord) => attendanceRecordDate(record) === todayStr;
  const doesAttendanceMatchEmployee = (record: AttendanceRecord, emp: Employee) => {
    const recId = normalizeKey(record.employeeId);
    const empId = normalizeKey(emp.employeeId);
    if (recId && empId && recId === empId) return true;

    const recName = normalizeKey(record.employeeName);
    const fullName = normalizeKey(employeeFullName(emp));
    return !!recName && !!fullName && recName === fullName;
  };
  const doesLeaveCoverToday = (leave: LeaveRequest) => {
    const start = (leave.startDate || '').slice(0, 10);
    const end = (leave.endDate || leave.startDate || '').slice(0, 10);
    return leave.status === 'Approved' && !!start && start <= todayStr && todayStr <= end;
  };
  const doesLeaveMatchEmployee = (leave: LeaveRequest, emp: Employee) => {
    const leaveId = normalizeKey(leave.employeeId);
    const empId = normalizeKey(emp.employeeId);
    if (leaveId && empId && leaveId === empId) return true;

    const leaveName = normalizeKey(leave.employeeName);
    const fullName = normalizeKey(employeeFullName(emp));
    return !!leaveName && !!fullName && leaveName === fullName;
  };

  // Current user's individual attendance metrics for Employee Dashboard
  const employeeAttendanceStats = useMemo(() => {
    const month = getMonthInfo();
    const userEmpId = (currentUser.employeeId || currentUser.id || '').trim().toLowerCase();
    const userName = (currentUser.name || '').trim().toLowerCase();

    const matchesCurrentUser = (employeeId?: string, employeeName?: string) => {
      const recId = (employeeId || '').trim().toLowerCase();
      if (userEmpId && recId && userEmpId === recId) return true;

      const recName = (employeeName || '').trim().toLowerCase();
      return !!userName && !!recName && recName === userName;
    };

    // Match today's attendance record (local today date or shiftDate)
    const todayRecord = attendanceRecords.find(a => {
      const recId = (a.employeeId || '').trim().toLowerCase();
      const recName = (a.employeeName || '').trim().toLowerCase();
      return matchesCurrentUser(recId, recName) && isTodayAttendanceRecord(a);
    });

    // Match today's biometric face scan
    const todayFace = (faceLogs || []).find(f => {
      const fId = (f.employeeId || '').trim().toLowerCase();
      const fName = (f.employeeName || '').trim().toLowerCase();
      return matchesCurrentUser(fId, fName) && f.timestamp.startsWith(todayStr);
    });

    // Match leaves
    const userLeaves = leaveRequests.filter(l => {
      const lId = (l.employeeId || '').trim().toLowerCase();
      const lName = (l.employeeName || '').trim().toLowerCase();
      return matchesCurrentUser(lId, lName) && l.status === 'Approved';
    });

    // Current month attendance records only
    const userRecords = attendanceRecords.filter(a => {
      if (!isDateInMonth(a.shiftDate || a.date, month)) return false;
      const recId = (a.employeeId || '').trim().toLowerCase();
      const recName = (a.employeeName || '').trim().toLowerCase();
      return matchesCurrentUser(recId, recName);
    });

    const totalWorkingDays = month.elapsedWorkingDays;
    const userPresentCount = userRecords.filter(r => r.status === 'Present' || r.status === 'Work From Home').length;
    const userLateCount = userRecords.filter(r => r.status === 'Late' || r.status === 'Half Day').length;
    const userLeaveCount = userLeaves.reduce((acc, l) => acc + countLeaveDaysInMonth(l.startDate, l.endDate, month), 0);

    const realPresent = userPresentCount;
    const realLeave = userLeaveCount;
    const realLate = userLateCount;
    const attendanceRate = totalWorkingDays > 0 ? Math.min(100, Math.round(((realPresent + (realLate * 0.5)) / totalWorkingDays) * 100)) : 0;

    // Current shift
    const userShift = (shifts || []).find(s => 
      s.assignments?.some(a => a.employeeId?.trim().toLowerCase() === userEmpId)
    ) || (shifts || [])[0];

    const rawShiftName = userShift?.shiftName || 'Shift 1';
    const cleanShiftName = rawShiftName.includes('(') ? rawShiftName.split('(')[0].trim() : rawShiftName;

    // Today punch time (Real data only: '--:--' if not punched in)
    const checkInTime = formatTimeDisplay(todayRecord?.checkIn || todayFace?.timestamp, '--:--');
    const todayStatus = todayRecord?.status || (todayFace ? 'Present' : 'Not Marked');

    return {
      todayStatus,
      checkInTime,
      attendanceRate,
      adjPresent: realPresent,
      totalWorkingDays,
      adjLeave: realLeave,
      remainingLeaves: Math.max(0, 14 - realLeave),
      shiftName: cleanShiftName,
      shiftTimes: userShift ? `${userShift.startTime} - ${userShift.endTime}` : '--:--',
      monthLabel: month.label
    };
  }, [currentUser, attendanceRecords, leaveRequests, faceLogs, shifts, todayStr]);

  // Dynamically calculate upcoming holidays from holiday policies (from today onwards)
  const upcomingHolidaysList = useMemo(() => {
    if (!holidayPolicies || holidayPolicies.length === 0) return [];
    const todayStr = getLocalDateStr();

    // Priority 1: Holidays from today onwards
    const futureHolidays = [...holidayPolicies]
      .filter(h => h.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (futureHolidays.length > 0) return futureHolidays.slice(0, 5);

    // Fallback: Latest upcoming/future holidays
    return [...holidayPolicies].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [holidayPolicies]);

  const formatHolidayInfo = (holiday: HolidayItem) => {
    try {
      const [y, m, d] = holiday.date.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const day = String(d).padStart(2, '0');
      const month = dateObj.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
      const year = y;
      const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const dateText = `${day} ${month} ${year} (${weekday})`;
      
      let typeLabel = 'Company Holiday';
      if (holiday.type === 'Compulsory' || holiday.type === 'Mandatory') {
        typeLabel = 'Paid Company Holiday';
      } else if (holiday.type === 'Local Holiday') {
        typeLabel = 'Local / Special Holiday';
      } else if (holiday.type === 'Special Leave') {
        typeLabel = 'Special Declared Leave';
      } else if (holiday.type === 'Festival') {
        typeLabel = 'Festival Holiday';
      } else {
        typeLabel = `${holiday.type} Holiday`;
      }

      // Calculate days until holiday
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(y, m - 1, d);
      targetDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const countdownText = diffDays === 0 ? 'Today!' : diffDays === 1 ? 'Tomorrow' : diffDays > 1 ? `In ${diffDays} days` : null;

      return { day, month, year, weekday, dateText, typeLabel, countdownText };
    } catch {
      return { 
        day: '01', 
        month: 'HOL', 
        year: 2026, 
        weekday: 'Holiday', 
        dateText: holiday.date, 
        typeLabel: 'Company Holiday',
        countdownText: null 
      };
    }
  };

  const getEmployeeForLeave = (l: LeaveRequest): Employee => {
    const found = employees.find(e => 
      (l.employeeId && e.employeeId === l.employeeId) ||
      `${e.firstName} ${e.lastName}`.trim().toLowerCase() === l.employeeName.trim().toLowerCase() ||
      e.firstName.toLowerCase() === l.employeeName.trim().toLowerCase()
    );
    if (found) return found;

    const nameParts = (l.employeeName || 'Staff Member').trim().split(' ');
    const firstName = nameParts[0] || 'Staff';
    const lastName = nameParts.slice(1).join(' ') || 'Member';

    return {
      id: l.employeeId || `EMP-TEMP-${Date.now()}`,
      employeeId: l.employeeId || 'EMP-TEMP',
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@vrm.com`,
      phone: '+91 98401 23456',
      dob: '1993-05-15',
      gender: 'Female',
      address: 'Businz HQ, Chennai',
      department: l.department || 'Operations',
      designation: 'Executive',
      reportingManagerId: employees[0]?.employeeId || 'EMP-000',
      reportingManagerName: employees[0] ? `${employees[0].firstName} ${employees[0].lastName}`.trim() : 'Velmurugan',
      joiningDate: '2023-06-15',
      employmentType: 'Full-Time',
      status: 'Active',
      avatar: '',
      basicSalary: 45000,
      allowances: { hra: 18000, transport: 4000, medical: 3000, special: 8000 },
      bankDetails: { bankName: 'HDFC Bank', accountNumber: '****5566', ifscCode: 'HDFC0001234', branch: 'Chennai' },
      attendanceMethod: 'Face Scan',
      gpsAllowed: true,
      faceRegistered: true,
      documents: []
    };
  };

  // Filter Reports State (matching reference filter modal)
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [filterReports, setFilterReports] = useState<FilterReportsState>(initialFilterReportsState);

  const selectedBranchDepts = Object.entries(filterReports.branchDepartments || {}).flatMap(([branch, depts]) => 
    depts.map(dept => ({ branch, dept }))
  );

  const activeFilterCount = 
    (filterReports.branches || []).length +
    (filterReports.departments || []).length +
    selectedBranchDepts.length + 
    filterReports.shifts.length + 
    filterReports.employmentTypes.length + 
    filterReports.modesOfWork.length;

  // Filtered workforce (exclude Super Admin / Businz Admin)
  const filteredEmployees = employees.filter(emp => {
    if (
      emp.employeeId === 'EMP-000' || 
      emp.email?.toLowerCase() === 'admin@businz.com' ||
      emp.email?.toLowerCase() === 'developer@businz.com' ||
      emp.designation === 'Super Administrator'
    ) {
      return false;
    }
    // Dynamic Branch Filter
    if (filterReports.branches && filterReports.branches.length > 0) {
      const empBranch = (emp.workLocation || (emp as any).branch || '').toLowerCase().trim();
      const matchesBranch = filterReports.branches.some(b => {
        const target = b.toLowerCase().trim();
        return empBranch === target || empBranch.includes(target) || target.includes(empBranch);
      });
      if (!matchesBranch) return false;
    }
    // Dynamic Department Filter
    if (filterReports.departments && filterReports.departments.length > 0) {
      const empDept = (emp.department || '').toLowerCase().trim();
      const matchesDept = filterReports.departments.some(d => {
        const target = d.toLowerCase().trim();
        return empDept === target || empDept.includes(target) || target.includes(empDept);
      });
      if (!matchesDept) return false;
    }
    if (selectedBranchDepts.length > 0) {
      const match = selectedBranchDepts.some(({ dept }) => 
        emp.department.toLowerCase().includes(dept.toLowerCase()) || 
        dept.toLowerCase().includes(emp.department.toLowerCase())
      );
      if (!match) return false;
    }
    if (filterReports.employmentTypes.length > 0) {
      if (emp.employmentType && !filterReports.employmentTypes.includes(emp.employmentType)) {
        return false;
      }
    }
    if (filterReports.shifts && filterReports.shifts.length > 0) {
      const empShift = emp.workShift || 
        shifts.find(s => s.assignments?.some(a => a.employeeId === emp.employeeId || a.employeeId === emp.id))?.shiftName || 
        shifts[0]?.shiftName;
      const matchesShift = filterReports.shifts.some(selectedShift => 
        empShift && (
          empShift === selectedShift || 
          empShift.toLowerCase().includes(selectedShift.toLowerCase()) || 
          selectedShift.toLowerCase().includes(empShift.toLowerCase())
        )
      );
      if (!matchesShift) return false;
    }
    return true;
  });

  const attendanceWorkforceEmployees = filteredEmployees.filter(emp => !isAttendanceExemptEmployee(emp));
  const filteredEmpIds = new Set(attendanceWorkforceEmployees.map(e => e.employeeId));
  const hasActiveFilters = activeFilterCount > 0;

  // Compute live stats from context data matching AttendanceCategoryModal logic
  const todayAttendanceRecords = attendanceRecords.filter(isTodayAttendanceRecord);
  const filteredAttendance = hasActiveFilters
    ? todayAttendanceRecords.filter(a => filteredEmpIds.has(a.employeeId))
    : todayAttendanceRecords;

  const totalStaff = attendanceWorkforceEmployees.length;

  const presentEmployees = attendanceWorkforceEmployees.filter(emp => {
    const att = filteredAttendance.find(a => doesAttendanceMatchEmployee(a, emp));
    return att && (
      att.status === 'Present' || 
      att.status === 'Work From Home' || 
      att.status === 'Late' ||
      !!att.checkIn
    );
  });

  const earlyEmployees = attendanceWorkforceEmployees.filter(emp => {
    const att = filteredAttendance.find(a => doesAttendanceMatchEmployee(a, emp));
    return att && att.checkOut && (
      (att.workingHours > 0 && att.workingHours < 7.5) || 
      att.status === 'Half Day'
    );
  });

  const missClockOutEmployees = attendanceWorkforceEmployees.filter(emp => {
    const att = filteredAttendance.find(a => doesAttendanceMatchEmployee(a, emp));
    return att && att.checkIn && !att.checkOut;
  });

  const absentEmployees = attendanceWorkforceEmployees.filter(emp => {
    const att = filteredAttendance.find(a => doesAttendanceMatchEmployee(a, emp));
    const isPres = att && (
      att.status === 'Present' || 
      att.status === 'Work From Home' || 
      att.status === 'Late' ||
      !!att.checkIn
    );
    const isLeave = att?.status === 'On Leave' || leaveRequests.some(l => doesLeaveMatchEmployee(l, emp) && doesLeaveCoverToday(l));
    return !isPres && !isLeave;
  });

  const presentToday = presentEmployees.length;
  const absentToday = absentEmployees.length;
  const earlyClockOut = earlyEmployees.length;
  const missClockOut = missClockOutEmployees.length;
  
  const pendingLeaves = leaveRequests.filter(l => l.status === 'Pending');
  const dueTasks = tasks.filter(t => t.status !== 'Completed');

  // Filter tasks belonging strictly to currently logged in user (for Employee & HR Dashboard)
  const isTaskAssignedToUser = (task: TaskItem): boolean => {
    const userEmpId = (currentUser.employeeId || currentUser.id || '').trim().toLowerCase();
    const userName = (currentUser.name || '').trim().toLowerCase();
    const taskEmpId = (task.assignedEmployeeId || '').trim().toLowerCase();
    const taskEmpName = (task.assignedEmployeeName || '').trim().toLowerCase();

    // Match by Employee ID
    if (userEmpId && taskEmpId && userEmpId === taskEmpId) return true;

    // Match by Employee Name (exact or substring match)
    if (userName && taskEmpName) {
      if (taskEmpName === userName) return true;
      if (taskEmpName.includes(userName) || userName.includes(taskEmpName)) return true;
    }

    return false;
  };

  const ownTasks = tasks.filter(t => isTaskAssignedToUser(t) && t.status !== 'Completed');
  const displayedTasks = isCEO ? dueTasks : ownTasks;

  // Metrics for Today's Attendance Donut Card
  const totalAttendanceCount = totalStaff;
  const donutPresent = presentToday;
  const donutLeave = attendanceWorkforceEmployees.filter(emp =>
    filteredAttendance.some(a => doesAttendanceMatchEmployee(a, emp) && a.status === 'On Leave') ||
    leaveRequests.some(l => doesLeaveMatchEmployee(l, emp) && doesLeaveCoverToday(l))
  ).length;
  const donutAbsent = Math.max(0, totalAttendanceCount - donutPresent - donutLeave);

  // Dynamic Celebrations derived from real employees
  const celebrations = useMemo(() => {
    const today = new Date();
    const curMonth = today.getMonth() + 1;
    const curDay = today.getDate();
    const results: Array<{ id: string; name: string; type: 'Birthday' | 'Anniversary'; label: string }> = [];

    employees.forEach(emp => {
      if (emp.dob) {
        const parts = emp.dob.split('-').map(Number);
        const m = parts[1];
        const d = parts[2];
        if (m === curMonth && Math.abs(d - curDay) <= 7) {
          results.push({
            id: `bday-${emp.id}`,
            name: `${emp.firstName} ${emp.lastName}`.trim(),
            type: 'Birthday',
            label: d === curDay ? 'Birthday Today! 🎂' : `Birthday on ${d}/${m} 🎂`
          });
        }
      }
      if (emp.joiningDate) {
        const parts = emp.joiningDate.split('-').map(Number);
        const y = parts[0];
        const m = parts[1];
        const d = parts[2];
        const years = today.getFullYear() - y;
        if (years > 0 && m === curMonth && Math.abs(d - curDay) <= 7) {
          results.push({
            id: `anniv-${emp.id}`,
            name: `${emp.firstName} ${emp.lastName}`.trim(),
            type: 'Anniversary',
            label: `${years} Year${years > 1 ? 's' : ''} Work Anniversary 🎉`
          });
        }
      }
    });

    return results;
  }, [employees]);

  return (
    <div>
      {/* Welcome Banner Card (ControlRoom Style) */}
      <div className="welcome-banner-card">
        <div>
          <h1 className="welcome-banner-title">Welcome back, {currentUser.name}!</h1>
          <p className="welcome-banner-subtitle">
            Here is your workforce output overview, attendance progress & shift efficiency metrics for today.
          </p>
        </div>
        <div className="welcome-banner-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!isEmployee && (
            <>
              <button 
                type="button" 
                className="att-filter-btn"
                onClick={() => setShowFilterModal(true)}
                title="Filter Attendance"
                aria-label="Filter Attendance"
                style={{ 
                  borderRadius: '12px', 
                  width: activeFilterCount > 0 ? 'auto' : '40px',
                  height: '40px',
                  padding: activeFilterCount > 0 ? '0 10px' : 0, 
                  fontSize: '0.84rem', 
                  fontWeight: 600, 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '6px',
                  border: activeFilterCount > 0 ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                  backgroundColor: activeFilterCount > 0 ? '#ECFEFF' : '#FFFFFF',
                  color: activeFilterCount > 0 ? '#0E7490' : '#475569',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Filter size={17} color={activeFilterCount > 0 ? '#0E7490' : '#475569'} />
                {activeFilterCount > 0 && (
                  <span className="att-filter-btn-badge">{activeFilterCount}</span>
                )}
              </button>
              <button 
                type="button"
                className="btn btn-secondary" 
                onClick={() => setActiveModule('attendance')}
                title="View Attendance Reports"
                aria-label="View Reports"
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  padding: 0,
                  borderRadius: '12px', 
                  fontWeight: 600, 
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.15s ease'
                }}
              >
                <TrendingUp size={17} />
              </button>
            </>
          )}
          {!isCEO && (
            <button 
              type="button"
              className="btn btn-primary" 
              onClick={() => setActiveModule('face_attendance')}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                borderRadius: '12px', 
                padding: '9px 18px', 
                fontWeight: 700, 
                fontSize: '0.84rem', 
                backgroundColor: '#0E7490', 
                borderColor: '#0E7490',
                boxShadow: '0 2px 8px rgba(14, 116, 144, 0.2)'
              }}
            >
              <UserCheck size={16} strokeWidth={2.5} /> <span>Face Scan</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Chips Bar */}
      {activeFilterCount > 0 && !isEmployee && (
        <div className="card" style={{ padding: '10px 16px', marginBottom: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.82rem' }}>
            <span style={{ fontWeight: 700, color: '#475569' }}>Active Filters ({activeFilterCount}):</span>
            {(filterReports.branches || []).map(branch => (
              <span key={branch} className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Branch: {branch}
                <X 
                  size={12} 
                  style={{ cursor: 'pointer' }} 
                  onClick={() => setFilterReports(prev => ({ ...prev, branches: prev.branches.filter(b => b !== branch) }))} 
                />
              </span>
            ))}
            {(filterReports.departments || []).map(dept => (
              <span key={dept} className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Dept: {dept}
                <X 
                  size={12} 
                  style={{ cursor: 'pointer' }} 
                  onClick={() => setFilterReports(prev => ({ ...prev, departments: prev.departments.filter(d => d !== dept) }))} 
                />
              </span>
            ))}
            {selectedBranchDepts.map(({ branch, dept }) => (
              <span key={`${branch}-${dept}`} className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {branch}: {dept}
                <X 
                  size={12} 
                  style={{ cursor: 'pointer' }} 
                  onClick={() => {
                    const currentBranchDepts = (filterReports.branchDepartments || {})[branch] || [];
                    const updated = currentBranchDepts.filter(d => d !== dept);
                    const newBranchDepts = { ...(filterReports.branchDepartments || {}) };
                    if (updated.length === 0) delete newBranchDepts[branch];
                    else newBranchDepts[branch] = updated;
                    setFilterReports(prev => ({ ...prev, branchDepartments: newBranchDepts }));
                  }} 
                />
              </span>
            ))}
            {filterReports.shifts.map(shift => (
              <span key={shift} className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {shift}
                <X 
                  size={12} 
                  style={{ cursor: 'pointer' }} 
                  onClick={() => setFilterReports(prev => ({ ...prev, shifts: prev.shifts.filter(s => s !== shift) }))} 
                />
              </span>
            ))}
            {filterReports.employmentTypes.map(empType => (
              <span key={empType} className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {empType}
                <X 
                  size={12} 
                  style={{ cursor: 'pointer' }} 
                  onClick={() => setFilterReports(prev => ({ ...prev, employmentTypes: prev.employmentTypes.filter(t => t !== empType) }))} 
                />
              </span>
            ))}
            {filterReports.modesOfWork.map(mode => (
              <span key={mode} className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {mode.split(' ')[0]}
                <X 
                  size={12} 
                  style={{ cursor: 'pointer' }} 
                  onClick={() => setFilterReports(prev => ({ ...prev, modesOfWork: prev.modesOfWork.filter(m => m !== mode) }))} 
                />
              </span>
            ))}
            <button 
              onClick={() => setFilterReports(initialFilterReportsState)}
              style={{ fontSize: '0.78rem', color: '#0891b2', fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Reset All
            </button>
          </div>
        </div>
      )}

      {/* Top 5 KPI Cards: Unified Metric Card Layout matching AdvanceSalary */}
      <div 
        className="kpi-grid compact"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: '10px',
          marginBottom: '16px'
        }}
      >
        {isEmployee ? (
          <>
            {/* 1. Today's Attendance Status */}
            <div 
              className="kpi-card compact"
              onClick={() => setActiveModule('face_attendance')}
              style={{ cursor: 'pointer' }}
            >
              <div className="kpi-card-header">
                <span>TODAY'S STATUS</span>
                <UserCheck size={15} color="#059669" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: '#059669' }}>
                  {employeeAttendanceStats.todayStatus}
                </div>
                <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="kpi-trend-badge green">In: {employeeAttendanceStats.checkInTime}</span>
                  <span>Face Verified</span>
                </div>
              </div>
            </div>

            {/* 2. Monthly Attendance Rate */}
            <div 
              className="kpi-card compact"
              onClick={() => setActiveModule('face_attendance')}
              style={{ cursor: 'pointer' }}
            >
              <div className="kpi-card-header">
                <span>MONTHLY ATTENDANCE</span>
                <CalendarCheck size={15} color="#0891B2" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: '#0E7490' }}>
                  {employeeAttendanceStats.attendanceRate}%
                </div>
                <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="kpi-trend-badge green" style={{ border: 'none' }}>↗ Consistent</span>
                  <span>{employeeAttendanceStats.monthLabel}</span>
                </div>
              </div>
            </div>

            {/* 3. Present Days */}
            <div 
              className="kpi-card compact"
              onClick={() => setActiveModule('face_attendance')}
              style={{ cursor: 'pointer' }}
            >
              <div className="kpi-card-header">
                <span>PRESENT DAYS</span>
                <CheckCircle2 size={15} color="#10B981" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: '#0F172A' }}>
                  {employeeAttendanceStats.adjPresent} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>/ {employeeAttendanceStats.totalWorkingDays}</span>
                </div>
                <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="kpi-trend-badge green" style={{ border: 'none' }}>Days On Duty</span>
                  <span>This Month</span>
                </div>
              </div>
            </div>

            {/* 4. My Rostered Shift */}
            <div 
              className="kpi-card compact"
              onClick={() => setActiveModule('shifts')}
              style={{ cursor: 'pointer' }}
            >
              <div className="kpi-card-header">
                <span>MY SHIFT TIMINGS</span>
                <Clock size={15} color="#F59E0B" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ fontSize: '1.14rem', color: '#B45309', whiteSpace: 'nowrap' }}>
                  {employeeAttendanceStats.shiftTimes}
                </div>
                <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="kpi-trend-badge amber">{employeeAttendanceStats.shiftName}</span>
                  <span>9h Regular</span>
                </div>
              </div>
            </div>

            {/* 5. Available Leave Balance */}
            <div 
              className="kpi-card compact"
              onClick={() => setActiveModule('leaves')}
              style={{ cursor: 'pointer' }}
            >
              <div className="kpi-card-header">
                <span>LEAVE BALANCE</span>
                <CalendarDays size={15} color="#8B5CF6" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: '#7C3AED' }}>
                  {employeeAttendanceStats.remainingLeaves} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>Days</span>
                </div>
                <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="kpi-trend-badge purple">{employeeAttendanceStats.adjLeave} Days Taken</span>
                  <span>Annual Balance</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 1. Total Staff */}
            <div 
              className="kpi-card compact"
              onClick={() => setSelectedCategory('total')}
            >
              <div className="kpi-card-header">
                <span>TOTAL STAFF</span>
                <Users size={15} color="#64748B" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value">{totalStaff}</div>
                <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="kpi-trend-badge green">↗ 12.4%</span>
                  <span>5 Active Depts</span>
                </div>
              </div>
            </div>

            {/* 2. Present Today */}
            <div 
              className="kpi-card compact"
              onClick={() => setSelectedCategory('present')}
            >
              <div className="kpi-card-header">
                <span>PRESENT TODAY</span>
                <UserCheck size={15} color="#059669" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: '#059669' }}>{presentToday}</div>
                <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="kpi-trend-badge green">↗ 3.2%</span>
                  <span>Active On Duty</span>
                </div>
              </div>
            </div>

            {/* 3. Absent Today */}
            <div 
              className="kpi-card compact"
              onClick={() => setSelectedCategory('absent')}
            >
              <div className="kpi-card-header">
                <span>ABSENT TODAY</span>
                <UserX size={15} color="#DC2626" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: absentToday > 0 ? '#DC2626' : 'inherit' }}>
                  {absentToday}
                </div>
                <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="kpi-trend-badge red">↘ 1.5%</span>
                  <span>Unplanned Leave</span>
                </div>
              </div>
            </div>

            {/* 4. Early Punch Out */}
            <div 
              className="kpi-card compact"
              onClick={() => setSelectedCategory('early')}
            >
              <div className="kpi-card-header">
                <span>EARLY PUNCH OUT</span>
                <LogOut size={15} color="#D97706" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: earlyClockOut > 0 ? '#B45309' : 'inherit' }}>
                  {earlyClockOut}
                </div>
                <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="kpi-trend-badge amber">Left Early</span>
                  <span>Before Shift End</span>
                </div>
              </div>
            </div>

            {/* 5. Missed Punch */}
            <div 
              className="kpi-card compact"
              onClick={() => setSelectedCategory('missed')}
            >
              <div className="kpi-card-header">
                <span>MISSED PUNCH</span>
                <Clock size={15} color="#8B5CF6" />
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value" style={{ color: missClockOut > 0 ? '#7C3AED' : 'inherit' }}>
                  {missClockOut}
                </div>
                <div className="kpi-caption" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="kpi-trend-badge purple">Pending</span>
                  <span>No Evening Punch</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Second Row Widgets (ControlRoom Uniform Grid: Same Size All Boxes) */}
      <div className="dashboard-widget-grid">
        {/* 1. Today's Attendance Donut Card (Employee view shows own Monthly Attendance Chart) */}
        {isEmployee ? (
          <EmployeeMonthlyAttendanceCard
            onOpenAttendance={() => setActiveModule('face_attendance')}
            onOpenLeaves={() => setActiveModule('leaves')}
          />
        ) : (
          <TodayAttendanceCard
            total={totalAttendanceCount}
            present={donutPresent}
            absent={donutAbsent}
            leave={donutLeave}
            onSelectCategory={(cat) => setSelectedCategory(cat)}
            onOpenLeaves={() => setActiveModule('leaves')}
          />
        )}

        {/* 2. Employee: My Leave & Time-Off Hub vs Admin: Pending Leave Approvals */}
        {isEmployee ? (
          <div className="dashboard-widget-card">
            <div className="dashboard-widget-header">
              <h3 
                className="dashboard-widget-title"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={() => setActiveModule('leaves')}
              >
                <CalendarDays size={16} color="#0891B2" />
                <span>UPCOMING HOLIDAYS</span>
              </h3>
            </div>

            <div 
              className="dashboard-widget-body"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                padding: '0'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
                {upcomingHolidaysList.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px', color: '#64748B' }}>
                    <Calendar size={32} color="#CBD5E1" />
                    <p style={{ fontSize: '0.84rem', margin: 0, fontWeight: 500 }}>No upcoming holidays scheduled</p>
                  </div>
                ) : (
                  upcomingHolidaysList.map((h, idx) => {
                    const { day, month, weekday, typeLabel, countdownText } = formatHolidayInfo(h);
                    return (
                      <div 
                        key={`${h.id}-${idx}`}
                        onClick={() => setActiveModule('leaves')}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '11px', 
                          padding: '8px 12px', 
                          background: idx === 0 
                            ? 'linear-gradient(135deg, #ECFEFF 0%, #F0FDFA 50%, #FFFFFF 100%)' 
                            : '#F8FAFC', 
                          border: idx === 0 ? '1.5px solid #CFFAFE' : '1px solid #E2E8F0', 
                          borderRadius: '12px',
                          boxShadow: idx === 0 ? '0 2px 6px rgba(14, 116, 144, 0.05)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        title="Click to view full Holiday & Leave Calendar"
                      >
                        {/* Modern Calendar Date Tile */}
                        <div style={{
                          width: '42px',
                          height: '44px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          boxShadow: '0 2px 4px rgba(14, 116, 144, 0.12)',
                          border: '1px solid #BAE6FD',
                          background: '#FFFFFF',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          flexShrink: 0
                        }}>
                          <div style={{
                            width: '100%',
                            background: 'linear-gradient(135deg, #0E7490, #0891B2)',
                            color: '#FFFFFF',
                            fontSize: '0.60rem',
                            fontWeight: 800,
                            textAlign: 'center',
                            padding: '2px 0',
                            letterSpacing: '0.06em'
                          }}>
                            {month}
                          </div>
                          <div style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.05rem',
                            fontWeight: 800,
                            color: '#0F172A',
                            lineHeight: 1
                          }}>
                            {day}
                          </div>
                        </div>

                        {/* Content Details */}
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>

                          <div style={{ 
                            fontSize: '0.82rem', 
                            fontWeight: 800, 
                            color: '#0F172A', 
                            marginTop: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {h.name}
                          </div>

                          <div style={{ 
                            fontSize: '0.68rem', 
                            color: '#64748B', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            marginTop: '1px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            <span>{weekday}</span>
                            <span>•</span>
                            <span style={{ color: '#0E7490', fontWeight: 600 }}>{typeLabel}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Admin / CEO: Pending Leave Approvals */
          <div className="dashboard-widget-card">
            <div className="dashboard-widget-header">
              <h3 className="dashboard-widget-title">
                <Calendar size={18} />
                <span>Pending Leaves ({pendingLeaves.length})</span>
              </h3>
              <button 
                className="dashboard-widget-link"
                onClick={() => setActiveModule('leaves')}
              >
                Manage →
              </button>
            </div>

            <div className="dashboard-widget-body">
              {pendingLeaves.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px' }}>
                  <Calendar size={30} color="#94A3B8" />
                  <p style={{ fontSize: '0.84rem', color: '#64748B', margin: 0, fontWeight: 500 }}>
                    No pending leave approvals
                  </p>
                  <button 
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.78rem', padding: '4px 12px', marginTop: '4px' }}
                    onClick={() => setActiveModule('leaves')}
                  >
                    Leave Management →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {pendingLeaves.map((l, idx) => (
                    <div 
                      key={`${l.id}-${idx}`} 
                      onClick={() => setActiveModule('leaves')}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        transition: 'all 0.15s ease',
                        cursor: 'pointer'
                      }}
                      title="Click to open in Leave Management"
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span 
                          style={{ 
                            fontWeight: 700, 
                            fontSize: '0.86rem', 
                            color: '#0E7490'
                          }}
                        >
                          {l.employeeName}
                        </span>
                        <span className="status-pill pending" style={{ fontSize: '0.68rem', padding: '1px 7px', border: 'none' }}>{l.leaveType}</span>
                      </div>
                      <p 
                        style={{ fontSize: '0.75rem', color: '#64748B', margin: '0 0 6px 0' }}
                      >
                        {formatDateDDMMYYYY(l.startDate)} to {formatDateDDMMYYYY(l.endDate)} ({l.daysCount} {l.daysCount === 1 ? 'day' : 'days'})
                      </p>
                      {canApproveLeave ? (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                          <button 
                            className="btn btn-success btn-sm" 
                            style={{ width: '28px', height: '24px', minWidth: '28px', padding: 0, borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              approveLeave(l.id, `${currentUser.name} (${currentUser.role})`);
                            }}
                            title="Approve"
                            aria-label="Approve"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                          <button 
                            className="btn btn-danger btn-sm" 
                            style={{ width: '28px', height: '24px', minWidth: '28px', padding: 0, borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              rejectLeave(l.id, `${currentUser.name} (${currentUser.role})`);
                            }}
                            title="Reject"
                            aria-label="Reject"
                          >
                            <XCircle size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="status-pill pending" style={{ fontSize: '0.72rem', display: 'block', textAlign: 'center' }}>
                          Awaiting HR Approval
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Tasks: Tasks Due Soon (CEO) vs My Tasks (Employee & HR) */}
        <div className="dashboard-widget-card">
          <div className="dashboard-widget-header">
            <h3 
              className="dashboard-widget-title"
              style={{ cursor: 'pointer' }}
              onClick={() => setActiveModule('tasks')}
              title={isCEO ? "Click to view all tasks" : "Click to view your assigned tasks"}
            >
              <CheckSquare size={16} color="#0891B2" />
              <span>{isCEO ? `Tasks Due Soon (${dueTasks.length})` : `My Tasks (${ownTasks.length})`}</span>
            </h3>
            <button 
              className="dashboard-widget-link"
              onClick={() => setActiveModule('tasks')}
            >
              Manage →
            </button>
          </div>

          <div className="dashboard-widget-body">
            {displayedTasks.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px' }}>
                <CheckSquare size={30} color="#94A3B8" />
                <p style={{ fontSize: '0.84rem', color: '#64748B', margin: 0, fontWeight: 500 }}>
                  {isCEO ? 'No upcoming tasks due' : 'No pending tasks assigned to you'}
                </p>
                <button 
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.78rem', padding: '4px 12px', marginTop: '4px' }}
                  onClick={() => setActiveModule('tasks')}
                >
                  {isCEO ? 'Go to Tasks →' : 'Go to My Tasks →'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {displayedTasks.map((t, idx) => (
                  <div key={`${t.id}-${idx}`} style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '6px',
                    minHeight: '64px',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span 
                        style={{ 
                          fontWeight: 700, 
                          fontSize: '0.84rem', 
                          color: '#0B1A2D',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minWidth: 0,
                          flex: 1
                        }}
                        title={t.title}
                      >
                        {t.title}
                      </span>
                      <span 
                        className={`priority-pill ${t.priority.toLowerCase()}`} 
                        style={{ fontSize: '0.68rem', padding: '1px 7px', flexShrink: 0, whiteSpace: 'nowrap' }}
                      >
                        {t.priority}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '0.74rem', color: '#64748B', minWidth: 0 }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                        {isCEO ? `Assigned: ${t.assignedEmployeeName}` : `Assigned by: ${t.assignedBy || 'Management'}`}
                      </span>
                      <span style={{ fontWeight: 600, color: '#D97706', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        Due: {formatDateDDMMYYYY(t.dueDate)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 4. Celebrations */}
        <div className="dashboard-widget-card">
          <div className="dashboard-widget-header">
            <h3 className="dashboard-widget-title">
              <Gift size={16} color="#D97706" />
              <span>Celebrations</span>
            </h3>
            <span className="dashboard-widget-badge" style={{ color: '#D97706', backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }}>
              {celebrations.length} This Week
            </span>
          </div>

          <div className="dashboard-widget-body">
            {celebrations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748B', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Gift size={32} color="#CBD5E1" style={{ marginBottom: '10px' }} />
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#475569' }}>No celebrations this week</div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '4px' }}>Upcoming birthdays and work anniversaries will appear here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {celebrations.map((c: { id: string; name: string; type: 'Birthday' | 'Anniversary'; label: string }) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      backgroundColor: c.type === 'Birthday' ? '#FEF3C7' : '#EEF2FF',
                      border: `1px solid ${c.type === 'Birthday' ? '#FDE68A' : '#E0E7FF'}`,
                      borderRadius: '10px'
                    }}
                  >
                    {c.type === 'Birthday' ? <Gift size={22} color="#D97706" /> : <Award size={22} color="#4338CA" />}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: c.type === 'Birthday' ? '#92400E' : '#3730A3' }}>{c.name}</div>
                      <div style={{ fontSize: '0.75rem', color: c.type === 'Birthday' ? '#B45309' : '#4338CA' }}>{c.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FILTER REPORTS MODAL */}
      <FilterReportsModal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        currentFilters={filterReports}
        onApply={(newFilters) => setFilterReports(newFilters)}
        onReset={() => setFilterReports(initialFilterReportsState)}
      />

      {/* FULL-PAGE EMPLOYEE PROFILE FOCUSED ON LEAVE HISTORY */}
      {profileModalEmployee && (() => {
        const liveEmp = employees.find(e => (e.id && (e.id === profileModalEmployee.id || e.id === profileModalEmployee.employeeId)) || (e.employeeId && (e.employeeId === profileModalEmployee.employeeId || e.employeeId === profileModalEmployee.id))) || profileModalEmployee;
        return (
          <EmployeeProfile
            employee={liveEmp}
            onClose={() => setProfileModalEmployee(null)}
            initialTab="leave"
          />
        );
      })()}

      {/* ATTENDANCE CATEGORY FULL MODAL (TOTAL, ABSENT, PRESENT, EARLY, MISSED) */}
      {selectedCategory && (
        <AttendanceCategoryModal
          category={selectedCategory}
          onClose={() => setSelectedCategory(null)}
          onSelectEmployee={(emp) => {
            setSelectedCategory(null);
            setProfileModalEmployee(emp);
          }}
          employees={filteredEmployees}
          attendanceRecords={filteredAttendance}
          leaveRequests={leaveRequests}
        />
      )}
    </div>
  );
};
