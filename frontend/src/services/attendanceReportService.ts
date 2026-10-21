import { AttendanceRecord, Employee, HolidayItem, LeaveRequest, Shift, WeeklyScheduleItem } from '../types/hrms';
import { FieldAssignment } from '../types/tracking';
import { isAttendanceExemptEmployee } from '../data/hrmsInitialData';

export type AttendanceClassification = 'Present' | 'Late' | 'On Leave' | 'Field Work' | 'Absent' | 'Not Due' | 'Holiday' | 'Week Off';

export interface AttendanceScope {
  currentUser?: any;
  role?: string;
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  shifts?: Shift[];
  weeklySchedules?: WeeklyScheduleItem[];
  holidayPolicies?: HolidayItem[];
  fieldAssignments?: FieldAssignment[];
  date?: string;
  now?: Date;
  department?: string;
}

export interface AttendanceReportRow {
  employee: Employee;
  attendance?: AttendanceRecord;
  classification: AttendanceClassification;
  reason: string;
}

export interface AttendanceReportResult {
  date: string;
  generatedAt: string;
  rows: AttendanceReportRow[];
  absent: AttendanceReportRow[];
  present: AttendanceReportRow[];
  late: AttendanceReportRow[];
  onLeave: AttendanceReportRow[];
  excluded: AttendanceReportRow[];
}

const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

const key = (value?: string | null) => (value || '').trim().toLowerCase();

const localDate = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);

const localMinutes = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  return Number(parts.find(part => part.type === 'hour')?.value || 0) * 60 + Number(parts.find(part => part.type === 'minute')?.value || 0);
};

const parseMinutes = (value?: string, fallback = 9 * 60) => {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return fallback;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

const isActiveOn = (employee: Employee, date: string) => {
  const joiningDate = (employee.dateOfJoining || employee.joiningDate || '').slice(0, 10);
  return employee.status === 'Active' && (!joiningDate || joiningDate <= date);
};

const matchesEmployee = (employee: Employee, record?: AttendanceRecord) => {
  if (!record) return false;
  return key(employee.employeeId) === key(record.employeeId);
};

const shiftFor = (employee: Employee, shifts: Shift[]) => {
  const assignment = shifts.find(shift => shift.assignments?.some(item => {
    const assignmentEmployeeId = typeof item === 'string' ? item : item?.employeeId;
    return key(assignmentEmployeeId) === key(employee.employeeId) && (typeof item === 'string' || item.status !== 'INACTIVE');
  }));
  if (assignment) return assignment;
  const requested = key(employee.workShift);
  return shifts.find(shift => key(shift.id) === requested || key(shift.shiftName) === requested || (requested && key(shift.shiftName).includes(requested))) || shifts[0];
};

const coversDate = (start?: string, end?: string, date?: string) => {
  const from = (start || '').slice(0, 10);
  const to = (end || start || '').slice(0, 10);
  return !!from && !!date && from <= date && date <= to;
};

const isApprovedLeave = (employee: Employee, leaves: LeaveRequest[], date: string) => leaves.some(leave =>
  leave.status === 'Approved' && key(leave.employeeId) === key(employee.employeeId) && coversDate(leave.startDate, leave.endDate, date)
);

const isHoliday = (employee: Employee, holidays: HolidayItem[], date: string) => holidays.some(holiday => {
  if (!coversDate(holiday.date, holiday.daysCount > 1 ? addDays(holiday.date, holiday.daysCount - 1) : holiday.date, date)) return false;
  const location = key(holiday.applicableLocation);
  return !location || location.includes('all') || location.includes(key(employee.workLocation)) || location.includes(key(employee.department));
});

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const isWeeklyOff = (employee: Employee, schedules: WeeklyScheduleItem[], date: string) => {
  const configured = employee.shiftDetails?.weeklyOff || schedules.find(schedule => schedule.isDefault)?.offDays || schedules[0]?.offDays;
  if (!configured) return false;
  const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
  return configured.toLowerCase().split(/[,/&\s]+/).some(day => day && (weekday === day || weekday.startsWith(day.slice(0, 3))));
};

const hasFieldWork = (employee: Employee, assignments: FieldAssignment[], date: string) => assignments.some(assignment =>
  key(assignment.employeeId) === key(employee.employeeId) && assignment.status !== 'Cancelled' && coversDate(assignment.startDate, assignment.endDate, date)
);

const isDue = (shift: Shift | undefined, date: string, now: Date) => {
  if (!shift) return localMinutes(now) >= 9 * 60 + 15;
  if (localDate(now) !== date) return localDate(now) > date;
  return localMinutes(now) >= parseMinutes(shift.startTime) + Math.max(0, Number(shift.gracePeriodMins) || 0);
};

export const buildAttendanceReport = (scope: AttendanceScope): AttendanceReportResult => {
  const now = scope.now || new Date();
  const date = scope.date || localDate(now);
  const role = key(scope.role || scope.currentUser?.role);
  const userId = key(scope.currentUser?.employeeId || scope.currentUser?.id);
  const userDepartment = key(scope.currentUser?.department);
  const userCompany = key(scope.currentUser?.company_id || scope.currentUser?.companyId);
  const shifts = scope.shifts || [];
  const schedules = scope.weeklySchedules || [];
  const holidays = scope.holidayPolicies || [];
  const assignments = scope.fieldAssignments || [];
  const department = key(scope.department);
  const workforce = scope.employees.filter(employee => {
    if (isAttendanceExemptEmployee(employee) || !isActiveOn(employee, date)) return false;
    const employeeCompany = key(employee.company_id || employee.companyId);
    if (userCompany && employeeCompany && userCompany !== employeeCompany) return false;
    if (department && !key(employee.department).includes(department)) return false;
    if (role === 'employee' || role === 'assignee' || role === 'responsible person') return key(employee.employeeId) === userId;
    if ((role === 'department manager' || role === 'department head' || role === 'manager' || role === 'team leader') && userDepartment) return key(employee.department) === userDepartment;
    return true;
  });

  const reportRows = workforce.map(employee => {
    const shift = shiftFor(employee, shifts);
    const attendance = scope.attendanceRecords.find(record => matchesEmployee(employee, record) && ((record.shiftDate || record.date || '').slice(0, 10) === date));
    const checkedIn = !!attendance?.checkIn;
    if (isApprovedLeave(employee, scope.leaveRequests, date) || attendance?.status === 'On Leave') return { employee, attendance, classification: 'On Leave' as const, reason: 'Approved leave' };
    if (isHoliday(employee, holidays, date)) return { employee, attendance, classification: 'Holiday' as const, reason: 'Company holiday' };
    if (isWeeklyOff(employee, schedules, date)) return { employee, attendance, classification: 'Week Off' as const, reason: 'Scheduled weekly off' };
    if (hasFieldWork(employee, assignments, date)) return { employee, attendance, classification: 'Field Work' as const, reason: 'Active field work assignment' };
    if (checkedIn && attendance?.status === 'Late') return { employee, attendance, classification: 'Late' as const, reason: 'Check-in recorded after shift grace period' };
    if (checkedIn || attendance?.status === 'Present' || attendance?.status === 'Work From Home') return { employee, attendance, classification: 'Present' as const, reason: 'Attendance recorded' };
    if (!isDue(shift, date, now)) return { employee, attendance, classification: 'Not Due' as const, reason: 'Assigned shift has not started or reached grace deadline' };
    return { employee, attendance, classification: 'Absent' as const, reason: 'No check-in after assigned shift grace deadline' };
  });

  return {
    date,
    generatedAt: now.toISOString(),
    rows: reportRows,
    absent: reportRows.filter(row => row.classification === 'Absent'),
    present: reportRows.filter(row => row.classification === 'Present' || row.classification === 'Late' || row.classification === 'Field Work'),
    late: reportRows.filter(row => row.classification === 'Late'),
    onLeave: reportRows.filter(row => row.classification === 'On Leave'),
    excluded: reportRows.filter(row => ['Holiday', 'Week Off', 'Not Due'].includes(row.classification))
  };
};
