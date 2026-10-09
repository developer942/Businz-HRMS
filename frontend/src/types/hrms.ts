export type Role = 
  | 'Super Admin' 
  | 'CEO'
  | 'Admin'
  | 'HR'
  | 'HR Manager' 
  | 'HR Admin' 
  | 'Department Manager' 
  | 'Department Head'
  | 'Manager'
  | 'Team Leader'
  | 'Employee' 
  | 'Finance Manager'
  | 'Task Creator'
  | 'Assignee'
  | 'Responsible Person'
  | 'Management'
  | 'ERP Administrator'
  | string;

export * from './tasks';
export * from './sandwichLeave';
import { SandwichCalculationResult, HROverrideDetails, SandwichCalculationDayDetail } from './sandwichLeave';
import type {
  LateDeductionResult,
  LeaveDeductionResult,
  StatutoryDeductionsResult,
  RewardEarningsResult
} from '../services/policyEngine';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';

export type ModuleName = 
  | 'dashboard'
  | 'employees'
  | 'face_attendance'
  | 'attendance'
  | 'gps_geofence'
  | 'leaves'
  | 'shifts'
  | 'overtime'
  | 'performance'
  | 'tasks'
  | 'recruitment'
  | 'finance'
  | 'notifications'
  | 'payroll'
  | 'advance_salary'
  | 'reports'
  | 'organization'
  | 'assets'
  | 'settings'
  | 'tracking'
  | 'profile';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar: string;
  department: string;
  designation: string;
  employeeId: string;
  company_id?: string;
  companyId?: string;
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
}

export interface Employee {
  id: string;
  employeeId: string;
  company_id?: string;
  companyId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  address: string;
  department: string;
  designation: string;
  reportingManagerId: string;
  reportingManagerName: string;
  joiningDate: string;
  employmentType: string;
  status: 'Active' | 'Inactive' | 'On Leave' | 'Terminated';
  avatar: string;
  basicSalary: number;
  allowances: {
    hra: number;
    transport: number;
    medical: number;
    special: number;
    da?: number;
    conveyance?: number;
    [key: string]: any;
  };
  withPf?: boolean;
  bankDetails: BankDetails;
  attendanceMethod: 'Face Scan' | 'GPS Location' | 'Manual' | 'Biometric' | 'Exempt';
  gpsAllowed: boolean;
  faceRegistered: boolean;
  facePhotoUrl?: string;
  workShift?: string;
  documents: {
    name: string;
    type: string;
    url: string;
    uploadDate: string;
  }[];

  // ── Backend relationship IDs (Supabase / PostgreSQL UUID FKs) ──
  departmentId?: string;
  designationId?: string;
  branchId?: string;
  employmentTypeId?: string;
  employeeCategoryId?: string;
  gradeId?: string | null;
  grossSalary?: number;
  isActive?: boolean;
  dateOfBirth?: string;   // 'YYYY-MM-DD' (alias of dob)
  dateOfJoining?: string; // 'YYYY-MM-DD' (alias of joiningDate)

  // Extended Comprehensive Onboarding Fields
  personalEmail?: string;
  companyEmail?: string;
  password?: string;
  authUserId?: string;
  mustChangePassword?: boolean;
  accountStatus?: 'ACTIVE' | 'LOCKED' | 'DISABLED' | 'DEACTIVATED';
  credentialEmailStatus?: 'PENDING' | 'SENT' | 'FAILED';
  credentialEmailSentAt?: string;
  lastLoginAt?: string;
  skills?: string[];
  role?: Role | string;
  maritalStatus?: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  bloodGroup?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | '';
  workLocation?: string;
  currentAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  permanentAddress?: {
    sameAsCurrent?: boolean;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  emergencyContact?: {
    name?: string;
    relationship?: string;
    mobile?: string;
    alternateMobile?: string;
  };
  educationalDetails?: {
    highestQualification?: string;
    degreeName?: string;
    specialization?: string;
    university?: string;
    yearOfPassing?: string;
    gradePercentage?: string;
    certificateUrl?: string;
  };
  experienceDetails?: {
    experienceType?: 'Fresher' | 'Experienced';
    totalExperience?: string;
    previousCompany?: string;
    previousDesignation?: string;
    previousDepartment?: string;
    startDate?: string;
    endDate?: string;
    lastDrawnSalary?: string;
    companyLocation?: string;
    experienceCertificateUrl?: string;
    relievingLetterUrl?: string;
  };
  professionalDetails?: {
    previousCompany?: string;
    totalExperience?: string;
    relevantExperience?: string;
    skills?: string[];
    qualification?: string;
    specialization?: string;
  };
  salaryDetails?: {
    salaryStructure?: string;
    monthlyCtc?: number;
    panNumber?: string;
    uanNumber?: string;
    withPf?: boolean;
    salaryScheme?: 'WITH_PF' | 'WITHOUT_PF';
    da?: number;
    conveyance?: number;
    hra?: number;
    basicSalary?: number;
    [key: string]: any;
  };
  shiftDetails?: {
    shiftType?: string;
    weeklyOff?: string;
    holidayCalendar?: string;
    leavePolicy?: string;
  };
  systemAccess?: {
    role?: Role;
    status?: 'Active' | 'Inactive';
    permissions?: string[];
    sendInvite?: boolean;
  };
}

export type AttendanceShiftState = 
  | 'UPCOMING'
  | 'CHECK_IN_AVAILABLE'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'WAITING_FOR_NEXT_SHIFT';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation?: string;
  date: string;
  shiftId?: string;
  shiftDate?: string;
  shiftName?: string;
  checkIn: string | null;
  checkOut: string | null;
  workingHours: number;
  status: 'Present' | 'Absent' | 'Late' | 'Half Day' | 'Work From Home' | 'On Leave' | 'Holiday' | 'Week Off' | 'Missing Punch';
  lateStatus?: 'On Time' | 'Late (<30m)' | 'Severely Late' | 'N/A';
  location?: {
    lat: number;
    lng: number;
    address: string;
    inGeofence: boolean;
  };
  faceVerified?: boolean;
  method?: 'Face Recognition' | 'GPS Check-In' | 'Manual Punch' | 'System Auto';
  
  // Extended Attendance Correction & OT Fields
  otHours?: number;
  calculatedOtHours?: number;
  approvedOtHours?: number;
  otStatus?: 'Pending' | 'Approved' | 'Rejected' | 'Paid';
  otReason?: string;
  halfDayType?: 'First Half' | 'Second Half';
  absentReason?: 'Unauthorized Absence' | 'No Show' | 'Attendance Not Recorded' | 'Other';
  leaveType?: string;
  leaveDuration?: 'Full Day' | 'First Half' | 'Second Half';
  wfhReason?: string;
  wfhSource?: 'Approved WFH Request' | 'HR Assigned' | 'Manual';
  reason?: string;
  breakDurationMinutes?: number;
  lateDurationMinutes?: number;
  earlyCheckoutMinutes?: number;
}

export interface AttendanceAuditLog {
  id: string;
  attendanceId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  reason: string;
  changedBy: string;
  timestamp: string;
}

export interface FaceLog {
  id: string;
  employeeId: string;
  employeeName: string;
  timestamp: string;
  type: 'Check-In' | 'Check-Out';
  status: 'Success' | 'No Match' | 'Spoof Detected';
  photoUrl: string;
  confidenceScore: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  leaveType: 'Casual Leave' | 'Sick Leave' | 'Paid Leave' | 'Unpaid Leave' | 'Work From Home' | string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedDate: string;
  approvedBy?: string;
  approvedAt?: string;
  comment?: string;
  attachmentUrl?: string;
  sandwichDetails?: SandwichCalculationResult;
  hrOverride?: HROverrideDetails;
  isSandwichApplied?: boolean;
  sandwichDays?: number;
  unpaidSandwichDays?: number;
  paidDaysCount?: number;
  unpaidDaysCount?: number;
}

export interface Shift {
  id: string;
  shiftName: string;
  startTime: string; // e.g. "09:00"
  endTime: string;   // e.g. "18:00"
  breakDurationMins: number;
  workingHours: number;
  gracePeriodMins: number;
  assignedEmployeeCount: number; // derived: assignments.length (UI convenience)
  assignments: ShiftAssignment[]; // FK -> hr_shift_assignments
  color: string;
}

export interface ShiftRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  currentShift: string;
  requestedShift: string;
  requestedDate: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  assignedBy: string;
  department: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  dueDate: string;
  status: 'To Do' | 'In Progress' | 'Completed' | 'Overdue';
  createdAt: string;
}

export interface PerformanceScore {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  overallScore: number; // 0-100
  taskCompletionRate: number; // percentage
  attendanceScore: number; // percentage
  goalAchievement: number; // percentage
  managerRating: number; // 1-5
  avatar: string;
  monthlyHistory: { month: string; score: number }[];
}

export interface JobOpening {
  id: string;
  title: string;
  department: string;
  location: string;
  type: 'Full-Time' | 'Part-Time' | 'Contract' | 'Remote';
  experience: string;
  positions: number;
  status: 'Active' | 'Draft' | 'Closed';
  postedDate: string;
  salaryRange: string;
  description: string;
  applicantsCount: number;
}

export interface Candidate {
  id: string;
  jobId: string;
  jobTitle: string;
  name: string;
  email: string;
  phone: string;
  stage: 'Applied' | 'Screening' | 'Shortlisted' | 'Interview' | 'Selected' | 'Hired' | 'Rejected';
  appliedDate: string;
  referrerEmployeeId?: string;
  referrerName?: string;
  resumeUrl?: string;
  rating: number; // 1-5
  notes?: string;
  referralStatus?: 'Pending' | 'Accepted' | 'Rejected';
  referralReviewedBy?: string;
  referralReviewedDate?: string;
  referralReviewNotes?: string;
}

export interface Expense {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  category: 'Travel' | 'Meals' | 'Equipment' | 'Training' | 'Utilities' | 'Other';
  amount: number;
  date: string;
  description: string;
  receiptUrl?: string;
  status: 'Pending Manager' | 'Pending Finance' | 'Approved' | 'Rejected' | 'Reimbursed';
  approvedBy?: string;
  /** Accounts employee who handed over the amount (after HR/CEO approval) */
  reimbursedBy?: string;
  reimbursedDate?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  priority: 'Urgent' | 'Important' | 'Normal';
  category: 'Leave' | 'Shift' | 'Task' | 'Payroll' | 'Recruitment' | 'Announcement' | 'Attendance';
  read: boolean;
  link?: string;
  /** Cross-user delivery: audience groups ('ALL' | 'CEO' | 'HR' | 'ACCOUNTS') */
  targetRoles?: string[];
  /** Cross-user delivery: specific employee IDs / user IDs */
  targetEmployeeIds?: string[];
  /** Sender identity key (excluded from own bell) */
  senderKey?: string;
  /** ISO time the shared notification was created */
  createdAt?: string;
  /** User keys who have read this shared notification */
  readBy?: string[];
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  company_id?: string;
  companyId?: string;
  employeeName: string;
  department: string;
  designation: string;
  month: string;
  year: number;
  basicSalary: number;
  allowances: number;
  da?: number;
  conveyance?: number;
  hra?: number;
  withPf?: boolean;
  bonus: number;
  attendanceBonus?: number;
  taxDeduction: number;
  leaveDeduction: number;
  advanceDeduction?: number;
  epfDeduction?: number;
  esiDeduction?: number;
  professionalTax?: number;
  workingDays: number;
  presentDays: number;
  paidLeaves: number;
  unpaidLeaves: number;
  paidDays?: number;
  lopDays?: number;
  overtimeHours?: number;
  overtimeAmount?: number;
  grossSalary?: number;
  totalDeductions?: number;
  earningsBreakdown?: PayrollComponentLineItem[];
  deductionsBreakdown?: PayrollComponentLineItem[];
  netSalary: number;
  rewardEarnings?: number;
  lateAttendanceDeduction?: number;
  sandwichUnpaidDays?: number;
  sandwichDeduction?: number;
  internalDetails?: PayrollInternalDetails;
  status: 'Pending' | 'Verified' | 'Processed' | 'Paid';
}

export interface PayrollComponentLineItem {
  name: string;
  category?: 'EARNING' | 'DEDUCTION' | string;
  amount: number;
  description?: string;
}

export interface PayrollInternalDetails {
  lateDetails?: LateDeductionResult;
  leaveDetails?: LeaveDeductionResult;
  statutoryDetails?: StatutoryDeductionsResult;
  rewardDetails?: RewardEarningsResult;
}

export interface BranchItem {
  id: string;
  name: string;
  code: string;
  location: string;
  departments: string[];
}

export interface DepartmentItem {
  id: string;
  name: string;
  code: string;
  headName: string;
  headId: string;
  employeeCount: number;
  budget: number;
}

export interface DesignationItem {
  id: string;
  title: string;
  department: string;
  level: string;
}

export type PermissionMatrix = Record<Role, Partial<Record<ModuleName, PermissionAction[]>>>;

export type ApprovalWorkflowFormat = 'HR_ONLY' | 'MANAGER_HR_DUAL' | 'AUTO_APPROVE_LOW';

export interface WorkflowConfig {
  format: ApprovalWorkflowFormat;
  formatName: string;
  allowEmployeeDirectEdit: boolean;
  requireHrAcceptance: boolean;
}

export interface GeofenceConfig {
  enabled: boolean;
  officeName: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  enforceStrictly: boolean;
}

export interface AssetItem {
  id: string;
  assetTag: string;
  name: string;
  category: 'Laptops & Computers' | 'Mobile Devices' | 'Monitors & Displays' | 'Office Furniture' | 'Peripherals & Accessories';
  serialNumber: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  assignedDepartment?: string;
  assignedDate?: string;
  purchaseDate: string;
  purchaseCost: number;
  warrantyExpiry: string;
  status: 'Assigned' | 'Available' | 'Under Maintenance';
  condition: 'New' | 'Good' | 'Fair' | 'Needs Repair';
  notes?: string;
}

export * from './settings';

export type SettingsSubTab = 
  // User Profile
  | 'my_profile'
  | 'profile'
  // The 5 Core Global Settings Sections
  | 'company_details'
  | 'attendance_time'
  | 'leave_management'
  | 'payroll_settings'
  | 'rewards_recognition'
  | 'advance_loan_policy'
  // Legacy aliases for backward compatibility
  | 'business' 
  | 'organization'
  | 'employee_config'
  | 'holiday_calendar'
  | 'payroll' 
  | 'tada_expense'
  | 'approval_workflows'
  | 'recruitment'
  | 'performance_rewards'
  | 'assets'
  | 'roles_permissions'
  | 'notifications'
  | 'general_system'
  | 'integrations'
  | 'attendance' 
  | 'account' 
  | 'tada' 
  | 'rewards';

export interface GradeItem {
  id: string;
  code: string;
  title: string;
  description: string;
  level: number;
}

export interface EmploymentTypeItem {
  id: string;
  name: string;
  code: string;
  status: 'Active' | 'Inactive';
}

export interface EmployeeCategoryItem {
  id: string;
  name: string;
  code: string;
  status: 'Active' | 'Inactive';
}

export interface CustomFieldItem {
  id: string;
  label: string;
  fieldName: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'boolean';
  category: 'Personal' | 'Job' | 'Payroll' | 'Compliance';
  required: boolean;
  options?: string[];
}

export interface DocumentTypeItem {
  id: string;
  name: string;
  code: string;
  mandatory: boolean;
  maxSizeMb: number;
  allowedFormats: string[];
}

export interface EmployeeConfigSettings {
  idFormatPrefix: string;
  idFormatDigits: number;
  idStartingNumber: number;
  autoGenerateId: boolean;
  defaultProbationMonths: number;
  defaultNoticeDays: number;
  autoConfirmProbation: boolean;
  customFields: CustomFieldItem[];
  documentTypes: DocumentTypeItem[];
}

export interface ApprovalWorkflowLevel {
  level: number;
  role: string;
  title: string;
  timeLimitHours?: number;
}

export interface ApprovalWorkflowItem {
  id: string;
  workflowName: string;
  module: 'Leave' | 'Attendance' | 'Advance Salary' | 'Loan' | 'Expense' | 'TA/DA' | 'Recruitment' | 'Asset';
  description: string;
  levels: ApprovalWorkflowLevel[];
  active: boolean;
}

export interface NotificationTriggerConfig {
  id: string;
  event: string;
  module: string;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
  template: string;
}

export interface GeneralSystemConfig {
  language: string;
  theme: string;
  dateFormat: string;
  timeFormat: string;
  currency: string;
  currencySymbol: string;
  tablePagination: 5 | 10;
  auditLogsEnabled: boolean;
}

export interface IntegrationsConfig {
  biometricDevice: {
    enabled: boolean;
    provider: string;
    ipAddress: string;
    port: number;
    syncIntervalMins: number;
    status: 'Connected' | 'Disconnected' | 'Syncing';
  };
  mapsApi: {
    enabled: boolean;
    provider: string;
    apiKey: string;
  };
  emailSmtp: {
    enabled: boolean;
    host: string;
    port: number;
    user: string;
    secure: boolean;
  };
  smsGateway: {
    enabled: boolean;
    provider: string;
    senderId: string;
    apiKey: string;
  };
  whatsappApi: {
    enabled: boolean;
    provider: string;
    phoneNumberId: string;
    apiKey: string;
  };
  accountingSoftware: {
    enabled: boolean;
    software: string;
    syncFormat: string;
    autoExportMonthly: boolean;
  };
  webhooks: {
    enabled: boolean;
    endpointUrl: string;
    secretKey: string;
    subscribedEvents: string[];
  };
}

export interface LeavePolicyItem {
  id: string;
  name: string;
  code: string;
  quotaDays: number;
  monthlyAccrual: string;
  carryForward: string;
  color: string;
  status: 'Active' | 'Inactive';
  description?: string;
}

export interface HolidayItem {
  id: string;
  name: string;
  date: string;
  daysCount: number;
  type: 'Mandatory' | 'Compulsory' | 'State Specific' | 'Festival' | 'Site Specific' | 'Optional' | 'Company Wide' | 'Local Holiday' | 'Special Leave';
  applicableLocation?: string;
  description?: string;
}

export interface AttendancePolicyItem {
  id: string;
  name: string;
  mode: 'Selfie & AI Face Scan' | 'Geofenced Mobile' | 'Biometric Fingerprint' | 'Location Telemetry' | 'Face Scan + Punch Out' | 'Manual Web Punch';
  status: 'Active' | 'Inactive';
  description?: string;
}

export interface WeeklyScheduleItem {
  id: string;
  name: string;
  workingDays: string;
  offDays: string;
  isDefault?: boolean;
}

export interface PolicyDocumentItem {
  id: string;
  title: string;
  category: string;
  version: string;
  updated: string;
  status: 'Active' | 'Archived';
  description?: string;
  fileUrl?: string;
}

export interface GlobalAttendanceConfig {
  trackInOutTime: boolean;
  noAttendanceWithoutPunchOut: boolean;
  allowMultiplePunches: boolean;
  lateGraceMinutes: number;
  maxLateEntriesPerMonth: number;
  latePenaltyDeduction: string;
  trackEarlyOut: boolean;
  earlyOutGraceMinutes: number;
  trackBreaks: boolean;
  maxBreakMinutes: number;
  autoPunchOutAfterHours: number;
  enableAutoApproval: boolean;
  autoApproveDays: number;
  enableOvertime: boolean;
  normalOtMultiplier: number;
  holidayOtMultiplier: number;
  minOtTriggerMinutes: number;
  maxOtHoursPerMonth: number;
  requireOtPreApproval: boolean;
  autoCreditOtToPayroll: boolean;
  compOffMinHoursHalfDay: number;
  compOffMinHoursFullDay: number;
  compOffValidityDays: number;
  compOffMaxAccrualPerMonth: number;
  compOffRequireManagerApproval: boolean;
  compOffAllowEncashment: boolean;
}

export interface BusinessProfileSettings {
  logoUrl: string;
  logoStatus: string;
  businessName: string;
  businessCode: string;
  email: string;
  phone: string;
  type: string;
  address: string;
  gstin: string;
  pan: string;
  cin: string;
  employeeCodeGeneration: string;
  employeeCodePrefix: string;
  employeeCodeSample: string;
  administrator: string;
  currency: string;
  currencySymbol: string;
  currencyCode: string;
  timeZone: string;
  category: string;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankBranch: string;
  emailConfig: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  activeEntity: string;
}

export type LoanRequestStatus = 
  | 'Draft'
  | 'Pending'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Disbursed'
  | 'Active'
  | 'Closed';

export type AdvanceSalaryStatus = LoanRequestStatus | 'Pending HR' | 'Pending CEO' | 'Repaid';

export interface LoanRepaymentInstallment {
  installmentNumber: number;
  periodMonth: string; // e.g. 'Oct 2026'
  scheduledAmount: number;
  actualDeducted: number;
  carriedForwardAmount?: number;
  remainingBalance: number;
  status: 'Pending' | 'Deducted' | 'Partial' | 'Carried Forward' | 'Waived';
  deductedAt?: string;
  payrollBatchId?: string;
}

export interface LoanManualRepayment {
  id: string;
  loanId: string;
  amount: number;
  repaymentDate: string;
  paymentMode: 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI' | 'NEFT' | 'Other';
  referenceNumber?: string;
  recordedBy: string;
  notes?: string;
}

export interface LoanAuditLogEntry {
  id: string;
  loanId: string;
  action: string;
  performedBy: string;
  performedByRole: string;
  timestamp: string;
  previousValue?: string;
  newValue?: string;
  notes?: string;
}

export interface LoanRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  policyId: string;
  policyName: string;
  requestType: 'Advance Salary' | 'Employee Loan' | 'Emergency Loan' | 'Salary Advance' | 'Custom Loan Type';
  
  // Financial details
  basicSalary: number;
  monthlyCtc?: number;
  eligibleLimitAmount: number;
  requestedAmount: number;
  approvedAmount?: number;
  disbursedAmount?: number;
  outstandingBalance: number;
  
  // Repayment details
  installmentMonths: number;
  approvedMonths?: number;
  monthlyDeduction: number;
  deductionStartMonth: string; // e.g. 'Oct 2026'
  
  // Details & Reasons
  purpose: string;
  reasonDetails: string;
  internalHrNotes?: string;
  employeeVisibleNotes?: string;
  rejectionReason?: string;
  
  // Dates & Status
  requestedDate: string;
  neededByDate?: string;
  status: LoanRequestStatus;
  
  // Approvals
  hrApproval?: {
    approvedBy: string;
    approvedAt: string;
    remarks?: string;
    status: 'Approved' | 'Rejected';
  };
  ceoApproval?: {
    approvedBy: string;
    approvedAt: string;
    remarks?: string;
    status: 'Approved' | 'Rejected';
  };
  
  // Disbursement
  disbursementDetails?: {
    disbursedAt: string;
    disbursedBy: string;
    paymentMode: 'NEFT' | 'IMPS' | 'Cheque' | 'Cash';
    transactionRef?: string;
    notes?: string;
  };
  
  // Repayments & Audits
  repaymentSchedule: LoanRepaymentInstallment[];
  manualRepayments?: LoanManualRepayment[];
  auditLogs: LoanAuditLogEntry[];
}

// Backwards compatibility alias
export type AdvanceSalaryRequest = LoanRecord;

// ════════════════════════════════════════════════════════════════
// API PAYLOAD & DTO LAYER  (aligned with Supabase / PostgreSQL)
// ════════════════════════════════════════════════════════════════

export type UUID = string;

export interface EmployeePayload {
  employeeId?: string;             // UUID PK (omitted on INSERT)
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string | null;      // 'YYYY-MM-DD'
  gender: string | null;
  departmentId: string;            // FK -> hr_departments
  designationId: string;           // FK -> hr_designations
  branchId: string;                // FK -> hr_branches
  reportingManagerId: string | null; // FK -> hr_employees
  employmentTypeId: string;        // FK -> hr_employment_types
  employeeCategoryId: string;      // FK -> hr_employee_categories
  gradeId: string | null;          // FK -> hr_grades
  dateOfJoining: string;           // 'YYYY-MM-DD'
  basicSalary: number;             // DOUBLE PRECISION
  grossSalary: number;             // DOUBLE PRECISION
  bankAccountNumber: string | null;
  bankName: string | null;
  ifscCode: string | null;
  isActive: boolean;
}

export interface CreateLeavePayload {
  employeeId: string;              // FK -> hr_employees
  leaveTypeId: string;             // FK -> ht_leave_types
  startDate: string;               // 'YYYY-MM-DD'
  endDate: string;                 // 'YYYY-MM-DD'
  reason: string;
  attachmentUrl?: string;
}

export interface SandwichLeaveCalculation {
  appliedLeaveDays: number;
  weeklyOffDays: number;
  publicHolidayDays: number;
  sandwichDays: number;
  totalDays: number;
  paidDays: number;
  unpaidDays: number;
  isSandwichApplied: boolean;
  appliedPolicyId?: string;
  appliedPolicyName?: string;
  policyVersion?: number;
  payTypeApplied?: string;
  breakdown: SandwichCalculationDayDetail[];
  unpaidSandwichDeductionAmount?: number;
}

export type AttendanceMethodType = 'FACE' | 'GPS' | 'MANUAL' | 'BIOMETRIC';

export interface PunchLocation {
  lat: number;
  lng: number;
  address: string;
  inGeofence: boolean;
}

export interface AttendancePunch {
  id: string;                      // UUID PK
  employeeId: string;              // FK -> hr_employees
  shiftId: string | null;          // FK -> hr_shifts
  punchTime: string;               // ISO timestamp
  punchType: 'IN' | 'OUT';
  method: AttendanceMethodType;
  location: PunchLocation | null;
  faceMatchConfidence: number | null;
  faceSnapshotUrl: string | null;
  createdAt: string;               // ISO timestamp
}

export interface DailyAttendance {
  id: string;                      // UUID PK
  employeeId: string;              // FK -> hr_employees
  shiftId: string | null;          // FK -> hr_shifts
  attendanceDate: string;          // 'YYYY-MM-DD'
  checkInAt: string | null;        // ISO timestamp
  checkOutAt: string | null;       // ISO timestamp
  totalMinutes: number | null;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LATE' | 'WORK_FROM_HOME' | 'ON_LEAVE';
  lateMinutes: number | null;
  overtimeMinutes: number | null;
  isFaceVerified: boolean;
  location: PunchLocation | null;
  approvedById: string | null;     // FK -> hr_employees
  approvedAt: string | null;
}

export interface AttendanceCorrection {
  id: string;                      // UUID PK
  employeeId: string;              // FK -> hr_employees
  attendanceDate: string;          // 'YYYY-MM-DD'
  missingType: 'CHECK_IN' | 'CHECK_OUT' | 'FULL_DAY';
  requestedCheckIn?: string;
  requestedCheckOut?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;             // ISO timestamp
  reviewedById?: string;           // FK -> hr_employees
  reviewedAt?: string;
  hrComment?: string;
}

export interface GPSAttendancePayload {
  employeeId: string;
  lat: number;
  lng: number;
  address: string;
  inGeofence: boolean;
  timestamp: string;               // ISO timestamp
}

export interface FaceAttendancePayload {
  employeeId: string;
  snapshotUrl: string;
  confidence: number;              // 0 - 100
  timestamp: string;               // ISO timestamp
}

export interface ShiftAssignment {
  id: string;                      // UUID PK
  shiftId: string;                 // FK -> hr_shifts
  employeeId: string;              // FK -> hr_employees
  effectiveFrom: string;           // 'YYYY-MM-DD'
  status: 'ACTIVE' | 'INACTIVE';
  assignedById: string;            // FK -> hr_employees
  createdAt: string;               // ISO timestamp
  updatedAt: string;               // ISO timestamp
}

export interface AssetAssignment {
  id: string;                      // UUID PK
  assetId: string;                 // FK -> hr_assets
  employeeId: string;              // FK -> hr_employees
  assignedDate: string;            // 'YYYY-MM-DD'
  returnedDate: string | null;     // 'YYYY-MM-DD'
  conditionAtAssignment: string;
  notes: string | null;
  assignedBy: string;              // FK -> hr_employees
}

export interface CandidatePayload {
  jobId: string;                   // FK -> hr_job_openings
  name: string;
  email: string;
  phone: string;
  stage: Candidate['stage'];
  resumeUrl: string | null;
  rating: number;                  // 1 - 5
  notes: string | null;
  referrerEmployeeId: string | null; // FK -> hr_employees
}

export interface ExpensePayload {
  employeeId: string;              // FK -> hr_employees
  category: Expense['category'];
  amount: number;                  // DOUBLE PRECISION
  date: string;                    // 'YYYY-MM-DD'
  description: string;
  receiptUrl: string | null;
  status: Expense['status'];
  approvedById: string | null;     // FK -> hr_employees
}

export type LoanRequestStatusPayload =
  | 'PENDING'
  | 'HR_APPROVED'
  | 'CEO_APPROVED'
  | 'REJECTED'
  | 'DISBURSED'
  | 'CLOSED';

export interface LoanRequestPayload {
  employeeId: string;              // FK -> hr_employees
  loanPolicyId: string;            // FK -> loan_policies
  requestedAmount: number;         // DOUBLE PRECISION
  approvedAmount: number | null;
  disbursedAmount: number | null;
  outstandingBalance: number;      // DOUBLE PRECISION
  installmentMonths: number;
  monthlyDeduction: number;        // DOUBLE PRECISION
  purpose: string;
  reasonDetails: string;
  neededByDate: string | null;     // 'YYYY-MM-DD'
  status: LoanRequestStatusPayload;
}

export interface NotificationPayload {
  userId: string;                  // FK -> hr_employees (recipient)
  title: string;
  message: string;
  type: NotificationItem['category'];
  readAt: string | null;           // ISO timestamp
  createdAt: string;               // ISO timestamp
}

export interface PolicyVersion {
  policyId: string;
  category: 'Attendance' | 'Leave' | 'Payroll_PF' | 'Payroll_ESIC' | 'Reward' | 'Loan';
  versionNumber: number;
  effectiveFrom: string;           // 'YYYY-MM-DD'
  effectiveTo?: string;            // 'YYYY-MM-DD'
  snapshot: unknown;
}
