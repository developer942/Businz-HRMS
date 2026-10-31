// VRM Enterprise HRMS - Core HR Domain Types

export interface Department {
  id: string;
  name: string;
  code: string;
  headId?: string;
  budget?: number;
  created_at?: string;
}

export interface Designation {
  id: string;
  title: string;
  departmentId: string;
  level?: string;
}

export interface EmployeeFullRecord {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dob?: string;
  gender?: 'Male' | 'Female' | 'Other';
  address?: string;
  department: string;
  departmentId?: string;
  designation: string;
  designationId?: string;
  reportingManagerId?: string;
  reportingManagerName?: string;
  joiningDate: string;
  employmentType: 'Full-Time' | 'Part-Time' | 'Contract' | 'Intern' | 'Provisional';
  status: 'Active' | 'On Leave' | 'Terminated';
  avatar?: string;
  basicSalary: number;
  grossSalary: number;
  da?: number;
  conveyance?: number;
  hra?: number;
  withPf?: boolean;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branch?: string;
  attendanceMethod?: 'Face Attendance' | 'Face Scan' | 'Biometric Fingerprint' | 'Biometric' | 'Flexible' | 'GPS Location' | 'Manual' | 'Exempt';
  gpsAllowed?: boolean;
  faceRegistered?: boolean;
  facePhotoUrl?: string;
  workShift?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceLogRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string; // YYYY-MM-DD
  checkIn?: string; // ISO or HH:mm
  checkOut?: string;
  workingHours: number;
  status: 'Present' | 'Absent' | 'Late' | 'Half Day' | 'On Duty' | 'On Leave' | 'Work From Home';
  lateStatus?: string;
  lateDurationMinutes?: number;
  method: 'Face Scan' | 'Face Recognition' | 'GPS Location' | 'Manual' | 'Biometric' | 'Field Duty';
  inGeofence: boolean;
  shiftId?: string;
  shiftDate?: string;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  notes?: string;
  checkInPhoto?: string;
  checkOutPhoto?: string;
  createdAt?: string;
  monthlyLateCount?: number;
  allowedLateCount?: number;
  penaltyType?: 'NONE' | 'WARNING' | 'HALF_DAY' | 'LOP';
  deductionDays?: number;
  warningMessage?: string | null;
}

export type AttendanceShiftState =
  | 'UPCOMING'
  | 'CHECK_IN_AVAILABLE'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'WAITING_FOR_NEXT_SHIFT';

export type ShiftWindowState = AttendanceShiftState;

export interface ShiftWindowEvaluation {
  employeeId?: string;
  state: AttendanceShiftState;
  assignedShift: ShiftRecord;
  shiftDate: string; // YYYY-MM-DD
  shiftStartDateTime: string;
  shiftEndDateTime: string;
  earlyCheckInDateTime: string;
  graceEndDateTime?: string;
  checkInOpenDateTime?: string;
  canCheckIn: boolean;
  canCheckOut: boolean;
  isWithinGrace?: boolean;
  isLateCheckIn?: boolean;
  message: string;
  countdownSeconds: number;
  activeAttendance?: AttendanceLogRecord;
  todayRecord?: AttendanceLogRecord;
  shiftStartDisplay?: string;
  shiftEndDisplay?: string;
  checkInOpenDisplay?: string;
  gracePeriodMins?: number;
  lateAfterDisplay?: string;
  expectedStatus?: 'Present' | 'Late';
  timeZone?: string;
  isHoliday?: boolean;
  holidayName?: string;
  isOnApprovedLeave?: boolean;
  leaveType?: string;
  latePolicy?: {
    id: string;
    policyName: string;
    graceTimeMinutes: number;
    allowedLateCount: number;
    warningSystemEnabled: boolean;
    halfDayRuleEnabled: boolean;
    halfDayThresholdCount: number;
    lopRuleEnabled: boolean;
    lopThresholdCount: number;
  };
}

export interface AttendanceTodaySummary {
  totalEmployees: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  onDutyCount: number;
  attendancePercentage: number;
}

export interface LeaveRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
  department?: string;
  leaveType: 'Casual' | 'Casual Leave' | 'Sick' | 'Sick Leave' | 'Earned' | 'Earned Leave' | 'Paid Leave' | 'Emergency' | 'Emergency Leave' | 'Maternity' | 'Paternity' | 'Unpaid' | 'Unpaid Leave' | 'Work From Home';
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  daysCount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  appliedDate: string;
  approvedBy?: string;
  approvedAt?: string;
  comment?: string;
}

export interface LeaveBalance {
  employeeId: string;
  casual: { total: number; used: number; remaining: number };
  sick: { total: number; used: number; remaining: number };
  earned: { total: number; used: number; remaining: number };
}

export interface ShiftRecord {
  id: string;
  shiftName: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  breakDurationMins: number;
  workingHours: number;
  gracePeriodMins: number;
  color: string;
  assignedEmployeeCount?: number;
  assignments?: string[]; // Array of employeeIds
}

export interface CompanySettings {
  companyName: string;
  legalEntity: string;
  taxIdGst: string;
  pfRegistrationNumber?: string;
  esiRegistrationNumber?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  contactEmail: string;
  contactPhone: string;
  website?: string;
}

export interface GeofenceSettings {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  officeName: string;
  address: string;
  isEnabled: boolean;
  strictMode: boolean;
}
