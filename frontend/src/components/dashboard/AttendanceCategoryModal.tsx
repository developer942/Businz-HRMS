import React, { useState } from 'react';
import { Employee, AttendanceRecord, LeaveRequest, Shift, WeeklyScheduleItem, HolidayItem } from '../../types/hrms';
import { FieldAssignment } from '../../types/tracking';
import { buildAttendanceReport } from '../../services/attendanceReportService';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { formatTimeDisplay, formatDateDDMMYYYY } from '../../utils/dateUtils';
import { getLocalDateStr } from '../../utils/monthUtils';
import { ExportDropdown } from '../common/ExportDropdown';
import { isAttendanceExemptEmployee } from '../../data/hrmsInitialData';
import { 
  X, 
  Search, 
  Download, 
  FileSpreadsheet,
  FileText,
  Users, 
  UserCheck, 
  UserX, 
  LogOut, 
  Clock, 
  ExternalLink, 
  Building2 
} from 'lucide-react';

export type AttendanceCategoryType = 'total' | 'absent' | 'present' | 'early' | 'missed' | 'late';

interface CategoryItem {
  employee: Employee;
  attendance?: AttendanceRecord;
  checkIn: string;
  checkOut: string;
  hours: number | string;
  statusLabel: string;
  statusType: 'success' | 'danger' | 'warning' | 'info' | 'purple';
  note?: string;
}

interface AttendanceCategoryModalProps {
  category: AttendanceCategoryType;
  onClose: () => void;
  onSelectEmployee: (employee: Employee) => void;
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  shifts?: Shift[];
  weeklySchedules?: WeeklyScheduleItem[];
  holidayPolicies?: HolidayItem[];
  fieldAssignments?: FieldAssignment[];
  currentUser?: any;
}

export const AttendanceCategoryModal: React.FC<AttendanceCategoryModalProps> = ({
  category,
  onClose,
  onSelectEmployee,
  employees,
  attendanceRecords,
  leaveRequests = [],
  shifts = [],
  weeklySchedules = [],
  holidayPolicies = [],
  fieldAssignments = [],
  currentUser
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('all');

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Category Configuration
  const config = {
    total: {
      title: 'Total Workforce Directory',
      subtitle: 'Complete list of all enrolled active staff members across departments',
      icon: <Users size={22} color="#0e7490" />,
      accentColor: '#0e7490',
      badgeBg: '#e0f2fe',
      badgeColor: '#0369a1'
    },
    absent: {
      title: 'Absent Employees Today',
      subtitle: 'Employees who have not checked in today and have no approved leave',
      icon: <UserX size={22} color="#ef4444" />,
      accentColor: '#ef4444',
      badgeBg: '#fee2e2',
      badgeColor: '#b91c1c'
    },
    present: {
      title: 'Present & Clocked-In Employees',
      subtitle: 'Workforce currently active on-site or working remotely today',
      icon: <UserCheck size={22} color="#10b981" />,
      accentColor: '#10b981',
      badgeBg: '#dcfce7',
      badgeColor: '#15803d'
    },
    early: {
      title: 'Early Clock Out Departures',
      subtitle: 'Employees who completed evening check-out before standard shift completion',
      icon: <LogOut size={22} color="#f59e0b" />,
      accentColor: '#f59e0b',
      badgeBg: '#fef3c7',
      badgeColor: '#b45309'
    },
    missed: {
      title: 'Miss Clock Out / Pending Punches',
      subtitle: 'Employees who checked in today but have not yet registered an evening punch-out',
      icon: <Clock size={22} color="#8b5cf6" />,
      accentColor: '#8b5cf6',
      badgeBg: '#ede9fe',
      badgeColor: '#6d28d9'
    },
    late: {
      title: 'Late Arrivals Today',
      subtitle: 'Employees who clocked in after the shift start time / grace window today',
      icon: <Clock size={22} color="#f59e0b" />,
      accentColor: '#f59e0b',
      badgeBg: '#fef3c7',
      badgeColor: '#b45309'
    }
  }[category];

  // Resolve Category Items dynamically (exclude owners/system accounts from attendance workforce)
  const workforceEmployees = employees.filter(emp => !isAttendanceExemptEmployee(emp));
  const todayStr = getLocalDateStr();
  const normalizeKey = (value?: string | null) => (value || '').trim().toLowerCase();
  const employeeFullName = (emp: Employee) => `${emp.firstName} ${emp.lastName}`.trim();
  const doesLeaveMatchEmployee = (leave: LeaveRequest, emp: Employee) => {
    const leaveId = normalizeKey(leave.employeeId);
    const empId = normalizeKey(emp.employeeId);
    if (leaveId && empId && leaveId === empId) return true;

    const leaveName = normalizeKey(leave.employeeName);
    const fullName = normalizeKey(employeeFullName(emp));
    return !!leaveName && !!fullName && leaveName === fullName;
  };
  const doesLeaveCoverToday = (leave: LeaveRequest) => {
    const start = (leave.startDate || '').slice(0, 10);
    const end = (leave.endDate || leave.startDate || '').slice(0, 10);
    return leave.status === 'Approved' && !!start && start <= todayStr && todayStr <= end;
  };

  const categoryItems: CategoryItem[] = workforceEmployees.map(emp => {
    const att = attendanceRecords.find(a => 
      a.employeeId === emp.employeeId || 
      `${emp.firstName} ${emp.lastName}`.trim().toLowerCase() === (a.employeeName || '').trim().toLowerCase()
    );

    const isCheckedIn = !!(att && att.checkIn);
    const isCheckedOut = !!(att && att.checkOut);
    const isEarly = isCheckedOut && ((att.workingHours > 0 && att.workingHours < 7.5) || att.status === 'Half Day');
    const isMissed = isCheckedIn && !isCheckedOut;
    const isPresent = isCheckedIn && (att.status === 'Present' || att.status === 'Work From Home' || att.status === 'Late');
    const isOnApprovedLeave = leaveRequests.some(l => doesLeaveMatchEmployee(l, emp) && doesLeaveCoverToday(l));

    let statusLabel = 'Absent';
    let statusType: CategoryItem['statusType'] = 'danger';
    let note = '';

    if (isEarly) {
      statusLabel = 'Early Clock Out';
      statusType = 'warning';
      note = `${att?.workingHours || 5.5} hrs (Left early)`;
    } else if (isMissed) {
      statusLabel = 'Miss Clock Out';
      statusType = 'purple';
      note = 'Pending evening punch';
    } else if (isPresent) {
      statusLabel = att?.status || 'Present';
      statusType = 'success';
      note = att?.method || 'Face Recognition';
    } else if (att?.status === 'On Leave' || isOnApprovedLeave) {
      statusLabel = 'On Leave';
      statusType = 'info';
      note = 'Sanctioned leave';
    } else {
      statusLabel = 'Absent';
      statusType = 'danger';
      note = 'No check-in recorded';
    }

    return {
      employee: emp,
      attendance: att,
      checkIn: formatTimeDisplay(att?.checkIn, '—'),
      checkOut: formatTimeDisplay(att?.checkOut, '—'),
      hours: att?.workingHours ? `${att.workingHours} hrs` : '0 hrs',
      statusLabel,
      statusType,
      note
    };
  });

  const attendanceReport = buildAttendanceReport({
    currentUser,
    role: currentUser?.role,
    employees: workforceEmployees,
    attendanceRecords,
    leaveRequests,
    shifts,
    weeklySchedules,
    holidayPolicies,
    fieldAssignments,
    date: todayStr
  });
  const absentEmployeeIds = new Set(attendanceReport.absent.map(row => row.employee.employeeId));

  // Filter for the requested category
  const filteredByCategory = categoryItems.filter(item => {
    if (category === 'total') return true;
    if (category === 'present') {
      return item.attendance && (
        item.attendance.status === 'Present' || 
        item.attendance.status === 'Work From Home' || 
        item.attendance.status === 'Late' ||
        !!item.attendance.checkIn
      );
    }
    if (category === 'early') {
      return item.attendance && item.attendance.checkOut && (
        (item.attendance.workingHours > 0 && item.attendance.workingHours < 7.5) || 
        item.attendance.status === 'Half Day'
      );
    }
    if (category === 'missed') {
      return item.attendance && item.attendance.checkIn && !item.attendance.checkOut;
    }
    if (category === 'late') {
      return item.attendance && (
        item.attendance.status === 'Late' ||
        (item.attendance.lateStatus && item.attendance.lateStatus.toLowerCase().includes('late') && item.attendance.lateStatus !== 'On Time')
      );
    }
    if (category === 'absent') {
      return absentEmployeeIds.has(item.employee.employeeId);
    }
    return true;
  });

  // Departments list for dropdown
  const departments = Array.from(new Set(workforceEmployees.map(e => e.department).filter(Boolean)));

  // Apply user search & department filtering
  const displayedItems = filteredByCategory.filter(item => {
    const matchesSearch = 
      `${item.employee.firstName} ${item.employee.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.employee.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.employee.department.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept = selectedDept === 'all' || item.employee.department === selectedDept;

    return matchesSearch && matchesDept;
  });

  const exportColumns = [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Employee Name' },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'checkIn', label: 'Check In' },
    { key: 'checkOut', label: 'Check Out' },
    { key: 'hours', label: 'Work Hours' },
    { key: 'statusLabel', label: 'Status' },
    { key: 'phone', label: 'Contact Phone' }
  ];

  const getExportData = () => displayedItems.map(item => ({
    employeeId: item.employee.employeeId,
    name: `${item.employee.firstName} ${item.employee.lastName}`,
    department: item.employee.department,
    designation: item.employee.designation,
    checkIn: item.checkIn,
    checkOut: item.checkOut,
    hours: item.hours,
    statusLabel: item.statusLabel,
    phone: item.employee.phone || 'N/A'
  }));

  const handleExportCSV = () => {
    downloadCSV(getExportData(), `VRM_${category.toUpperCase()}_List_${new Date().toISOString().split('T')[0]}`, exportColumns);
  };

  const handleExportExcel = () => {
    downloadExcel(getExportData(), `VRM_${category.toUpperCase()}_List_${new Date().toISOString().split('T')[0]}`, exportColumns);
  };

  const handleExportPDF = () => {
    downloadPDF(getExportData(), `VRM ${config.title} Register`, `VRM_${category.toUpperCase()}_List_${new Date().toISOString().split('T')[0]}`, exportColumns);
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: '24px'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '1080px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div 
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div 
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                backgroundColor: config.badgeBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {config.icon}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  {config.title}
                </h2>
                <span 
                  style={{
                    backgroundColor: config.badgeBg,
                    color: config.badgeColor,
                    padding: '2px 10px',
                    borderRadius: '9999px',
                    fontSize: '0.8rem',
                    fontWeight: 700
                  }}
                >
                  {filteredByCategory.length} Employees
                </span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                {config.subtitle}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ExportDropdown 
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
              onExportCSV={handleExportCSV}
              label="Download"
            />
            <button 
              onClick={onClose}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#f1f5f9',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                cursor: 'pointer',
                transition: 'background-color 0.15s'
              }}
              title="Close (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div 
          style={{
            padding: '14px 24px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}
        >
          <div style={{ position: 'relative', flex: 1, maxWidth: '380px' }}>
            <Search 
              size={16} 
              color="#94a3b8" 
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} 
            />
            <input 
              type="text"
              placeholder="Search by name, ID, or department..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none',
                backgroundColor: '#f8fafc'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b' }}>Department:</span>
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                backgroundColor: '#ffffff',
                color: '#334155',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Departments ({filteredByCategory.length})</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>

        {/* TABLE CONTENT */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 24px 20px 24px' }}>
          {displayedItems.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <Users size={48} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <h4 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#475569', margin: '0 0 6px 0' }}>
                No employees found
              </h4>
              <p style={{ fontSize: '0.84rem', margin: 0 }}>
                No employees matching your criteria were found in this category.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr 
                  style={{ 
                    position: 'sticky', 
                    top: 0, 
                    backgroundColor: '#ffffff', 
                    borderBottom: '2px solid #e2e8f0', 
                    color: '#475569', 
                    textAlign: 'left',
                    zIndex: 10 
                  }}
                >
                  <th style={{ padding: '12px 14px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700 }}>Department</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700 }}>Check-In</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700 }}>Check-Out</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700 }}>Hours</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedItems.map((item, idx) => {
                  const avatarLetter = item.employee.firstName ? item.employee.firstName[0].toUpperCase() : 'E';
                  return (
                    <tr 
                      key={item.employee.id || item.employee.employeeId || idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background-color 0.15s',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      onClick={() => onSelectEmployee(item.employee)}
                    >
                      {/* Employee Info */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div 
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              backgroundColor: '#0e7490',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.85rem'
                            }}
                          >
                            {avatarLetter}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>
                              {item.employee.firstName} {item.employee.lastName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {item.employee.employeeId} • {item.employee.designation}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td style={{ padding: '12px 14px' }}>
                        <span 
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: '#f1f5f9',
                            color: '#334155',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600
                          }}
                        >
                          <Building2 size={12} color="#64748b" />
                          {item.employee.department}
                        </span>
                      </td>

                      {/* Check-In */}
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: item.checkIn !== '—' ? '#0f172a' : '#94a3b8' }}>
                        {formatTimeDisplay(item.checkIn, '—')}
                      </td>

                      {/* Check-Out */}
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: item.checkOut !== '—' ? '#0f172a' : '#94a3b8' }}>
                        {formatTimeDisplay(item.checkOut, '—')}
                      </td>

                      {/* Hours */}
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0e7490' }}>
                        {item.hours}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 14px' }}>
                        <div>
                          <span 
                            className={`badge ${
                              item.statusType === 'success' ? 'badge-success' :
                              item.statusType === 'danger' ? 'badge-danger' :
                              item.statusType === 'warning' ? 'badge-warning' :
                              item.statusType === 'purple' ? 'badge-info' : 'badge-secondary'
                            }`}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '9999px',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              display: 'inline-block'
                            }}
                          >
                            {item.statusLabel}
                          </span>
                          {item.note && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                              {item.note}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onSelectEmployee(item.employee);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#ecfeff',
                            color: '#0e7490',
                            border: '1px solid #a5f3fc',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Profile <ExternalLink size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* FOOTER */}
        <div 
          style={{
            padding: '14px 24px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.82rem',
            color: '#64748b'
          }}
        >
          <div>
            Showing <strong>{displayedItems.length}</strong> of <strong>{filteredByCategory.length}</strong> {config.title}
          </div>
          <button 
            onClick={onClose}
            className="btn btn-secondary btn-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
