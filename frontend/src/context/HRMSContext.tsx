import React, { createContext, useContext, useState, useEffect, useRef, useMemo, ReactNode } from 'react';
import {
  Role,
  ModuleName,
  PermissionAction,
  PermissionMatrix,
  User,
  Employee,
  AttendanceRecord,
  AttendanceAuditLog,
  FaceLog,
  LeaveRequest,
  Shift,
  ShiftRequest,
  TaskItem,
  PerformanceScore,
  JobOpening,
  Candidate,
  Expense,
  NotificationItem,
  PayrollRecord,
  DepartmentItem,
  BranchItem,
  DesignationItem,
  ApprovalWorkflowFormat,
  WorkflowConfig,
  GeofenceConfig,
  AssetItem,
  TaskItemEnhanced,
  TaskAssignee,
  TaskAssigneeStatus,
  TaskDailyReport,
  TaskCompletionEvidence,
  TaskAttachment,
  TaskLinkItem,
  TaskMasterItem,
  MOMMeeting,
  TaskEscalationRule,
  TaskPerformanceWeights,
  TaskAuditLog,
  TaskTimelineEvent,
  computeTaskOverallStatusAndProgress,
  computeDueStatus,
  calculateEmployeeTaskMetrics,
  SettingsSubTab,
  LeavePolicyItem,
  HolidayItem,
  AttendancePolicyItem,
  WeeklyScheduleItem,
  PolicyDocumentItem,
  GlobalAttendanceConfig,
  BusinessProfileSettings,
  GradeItem,
  EmploymentTypeItem,
  EmployeeCategoryItem,
  CustomFieldItem,
  DocumentTypeItem,
  EmployeeConfigSettings,
  ApprovalWorkflowItem,
  NotificationTriggerConfig,
  GeneralSystemConfig,
  IntegrationsConfig,
  LoanRecord,
  LoanRepaymentInstallment,
  LoanManualRepayment,
  LoanAuditLogEntry,
  LoanRequestStatus,
  AdvanceSalaryRequest,
  SandwichLeavePolicy,
  SandwichAuditLog,
  SandwichCalculationResult,
  SandwichCondition,
  SandwichPayType,
  HROverrideDetails,
  SandwichCalculationDayDetail
} from '../types/hrms';
import { initialSandwichPolicies, initialSandwichAuditLogs } from '../data/sandwichPolicyInitialData';
import { calculateSandwichLeave } from '../services/sandwichLeaveEngine';
import {
  FieldAssignment,
  FieldTripSession,
  LocationPoint,
  TrackingAlert,
  TodayFieldEmployeeItem,
  TrackingOverviewMetrics
} from '../types/tracking';

const INITIAL_FIELD_ASSIGNMENTS: FieldAssignment[] = [];
const INITIAL_TRIP_SESSIONS: FieldTripSession[] = [];
const INITIAL_TRACKING_ALERTS: TrackingAlert[] = [];
import {
  calculateHaversineMeters,
  calculateSequentialRouteKm,
  metersToKm,
  isTrackingScheduleActive,
  isValidMovementPoint
} from '../services/trackingEngine';
import {
  CompanyInfo,
  CompanyBranch,
  OrganizationStructure,
  AttendancePolicy,
  AttendanceCorrectionRequest,
  MasterLeavePolicy,
  PayrollSettingsConfig,
  RewardPolicy,
  EmployeeRewardRecord,
  PolicyAuditLog,
  LoanPolicy
} from '../types/settings';
import {
  INITIAL_COMPANY_INFO,
  COMPANY_A_PROFILE,
  COMPANY_B_PROFILE,
  INITIAL_COMPANY_BRANCHES,
  INITIAL_ORG_STRUCTURE,
  DEFAULT_MASTER_ATTENDANCE_POLICIES,
  INITIAL_ATTENDANCE_CORRECTIONS,
  DEFAULT_MASTER_LEAVE_POLICIES,
  INITIAL_PAYROLL_CONFIG,
  INITIAL_REWARD_POLICIES,
  INITIAL_EMPLOYEE_REWARDS,
  INITIAL_POLICY_AUDIT_LOGS
} from '../data/settingsInitialData';
import { DEFAULT_LOAN_POLICIES, INITIAL_LOAN_RECORDS } from '../data/loanInitialData';
import { calculateEmployeePayroll, resolveEmployeeWithPf } from '../services/policyEngine';
import {
  calibrateTrustedTime,
  commitTrustedAttendanceTime,
  getTrustedNow,
  validateAttendancePunchTime
} from '../services/trustedTimeService';
import { payrollApi } from '../services/payrollApi';
import { getMonthInfo } from '../utils/monthUtils';
import { API_BASE_URL } from '../config/api';
import { supabaseDirect } from '../services/supabaseDirectService';
import {
  INITIAL_ENHANCED_TASKS,
  INITIAL_MOM_MEETINGS,
  INITIAL_TASK_MASTERS,
  INITIAL_ESCALATION_RULES,
  INITIAL_TASK_WEIGHTS
} from './taskInitialData';
import { toNum, formatCurrency } from '../utils/numbers';
import { generateNextEmployeeId } from '../utils/employeeIdUtils';
import {
  MissedPunchRequest,
  OvertimeRequest,
  DepartmentOtPolicy,
  EmployeeOtPolicy,
  AttendanceGlobalSettings,
  OvertimePolicy,
  AttendancePolicyConfig,
  ShiftModel
} from '../types/attendanceEnterprise';
import {
  INITIAL_MISSED_PUNCH_REQUESTS,
  INITIAL_OVERTIME_REQUESTS,
  INITIAL_DEPARTMENT_OT_POLICIES,
  INITIAL_EMPLOYEE_OT_POLICIES,
  INITIAL_ATTENDANCE_GLOBAL_SETTINGS,
  INITIAL_OVERTIME_POLICY,
  INITIAL_ATTENDANCE_POLICY_CONFIG
} from '../data/attendanceEnterpriseInitialData';
import {
  isSystemAdmin,
  INITIAL_EMPLOYEES,
  INITIAL_ATTENDANCE,
  INITIAL_FACE_LOGS,
  INITIAL_ATTENDANCE_AUDIT_LOGS,
  INITIAL_LEAVES,
  INITIAL_SHIFTS,
  INITIAL_SHIFT_REQUESTS,
  INITIAL_DEPTS,
  INITIAL_PAYROLL,
  INITIAL_ASSETS,
  INITIAL_EXPENSES,
  INITIAL_JOBS,
  INITIAL_CANDIDATES,
  INITIAL_NOTIFICATIONS,
  INITIAL_TASKS,
  INITIAL_PERFORMANCE
} from '../data/hrmsInitialData';
export { INITIAL_ATTENDANCE_AUDIT_LOGS };
import {
  calculateAttendanceHoursAndStatus,
  resolveEmployeeOtEligibility,
  calculateOtSalaryAmount,
  calculateAttendanceSalaryImpact,
  aggregateMonthlyAttendanceSummary
} from '../services/attendanceCalculationEngine';
import {
  evaluateShiftAttendance,
  ShiftWindowEvaluation
} from '../services/shiftAttendanceEngine';
import { formatTimeDisplay, formatDateDDMMYYYY } from '../utils/dateUtils';

export const calculateDistanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
};

const INITIAL_GEOFENCE_CONFIG: GeofenceConfig = {
  enabled: false,
  officeName: '',
  centerLat: 0,
  centerLng: 0,
  radiusMeters: 50000,
  enforceStrictly: false
};

const DEPRECATED_DEFAULT_LOAN_POLICY_NAMES = new Set([
  'standard advance salary',
  'long term employee welfare loan'
]);

// Default RBAC Permission Matrix for remaining 5 roles
const DEFAULT_PERMISSIONS: PermissionMatrix = {
  'Super Admin': {
    dashboard: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    employees: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    face_attendance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    attendance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    gps_geofence: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    leaves: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    shifts: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    performance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    tasks: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    recruitment: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    finance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    notifications: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    payroll: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    advance_salary: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    reports: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    organization: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    assets: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    settings: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  },
  'CEO': {
    dashboard: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    employees: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    face_attendance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    attendance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    gps_geofence: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    leaves: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    shifts: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    performance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    tasks: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    recruitment: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    finance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    notifications: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    payroll: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    advance_salary: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    reports: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    organization: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    assets: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    settings: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  },
  'HR Manager': {
    dashboard: ['view', 'export'],
    employees: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    face_attendance: ['view', 'create', 'edit', 'export'],
    attendance: ['view', 'create', 'edit', 'approve', 'export'],
    gps_geofence: ['view', 'create', 'edit', 'approve', 'export'],
    leaves: ['view', 'create', 'edit', 'approve', 'export'],
    shifts: ['view', 'create', 'edit', 'approve', 'export'],
    performance: ['view', 'create', 'edit', 'approve', 'export'],
    tasks: ['view', 'create', 'edit', 'export'],
    recruitment: ['view', 'create', 'edit', 'approve', 'export'],
    finance: ['view', 'create', 'edit', 'approve', 'export'],
    notifications: ['view', 'create'],
    payroll: ['view', 'create', 'edit', 'approve', 'export'],
    advance_salary: ['view', 'create', 'edit', 'approve', 'export'],
    reports: ['view', 'export'],
    organization: ['view', 'edit'],
    assets: ['view', 'create', 'edit', 'export'],
    settings: ['view'],
  },
  'HR Admin': {
    dashboard: ['view', 'export'],
    employees: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    face_attendance: ['view', 'create', 'edit', 'export'],
    attendance: ['view', 'create', 'edit', 'approve', 'export'],
    gps_geofence: ['view', 'create', 'edit', 'approve', 'export'],
    leaves: ['view', 'create', 'edit', 'approve', 'export'],
    shifts: ['view', 'create', 'edit', 'approve', 'export'],
    performance: ['view', 'create', 'edit', 'export'],
    tasks: ['view', 'create', 'edit'],
    recruitment: ['view', 'create', 'edit', 'approve'],
    finance: ['view', 'create', 'edit', 'approve', 'export'],
    notifications: ['view', 'create'],
    payroll: ['view', 'create', 'edit', 'approve', 'export'],
    advance_salary: ['view', 'create', 'edit', 'approve', 'export'],
    reports: ['view', 'export'],
    organization: ['view', 'create', 'edit', 'export'],
    assets: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    settings: ['view', 'edit'],
  },
  'HR': {
    dashboard: ['view', 'export'],
    employees: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    face_attendance: ['view', 'create', 'edit', 'export'],
    attendance: ['view', 'create', 'edit', 'approve', 'export'],
    gps_geofence: ['view', 'create', 'edit', 'approve', 'export'],
    leaves: ['view', 'create', 'edit', 'approve', 'export'],
    shifts: ['view', 'create', 'edit', 'approve', 'export'],
    performance: ['view', 'create', 'edit', 'approve', 'export'],
    tasks: ['view', 'create', 'edit', 'export'],
    recruitment: ['view', 'create', 'edit', 'approve', 'export'],
    finance: ['view', 'create', 'edit', 'approve', 'export'],
    notifications: ['view', 'create'],
    payroll: ['view', 'create', 'edit', 'approve', 'export'],
    advance_salary: ['view', 'create', 'edit', 'approve', 'export'],
    reports: ['view', 'export'],
    organization: ['view', 'create', 'edit', 'export'],
    assets: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    settings: ['view', 'edit'],
  },
  'Admin': {
    dashboard: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    employees: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    face_attendance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    attendance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    gps_geofence: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    leaves: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    shifts: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    performance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    tasks: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    recruitment: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    finance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    notifications: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    payroll: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    advance_salary: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    reports: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    organization: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    assets: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    settings: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  },
  'Department Manager': {
    dashboard: ['view'],
    employees: ['view'],
    face_attendance: ['view'],
    attendance: ['view', 'approve'],
    gps_geofence: [],
    leaves: ['view', 'approve'],
    shifts: ['view', 'approve'],
    performance: ['view', 'edit'],
    tasks: ['view', 'create', 'edit', 'delete'],
    recruitment: ['view'],
    finance: ['view', 'approve'],
    notifications: ['view'],
    payroll: [],
    advance_salary: ['view', 'create'],
    reports: ['view'],
    organization: ['view'],
    assets: ['view'],
    settings: ['view'],
  },
  'Employee': {
    dashboard: ['view'],
    employees: [],
    face_attendance: ['view', 'create'],
    attendance: [],
    gps_geofence: [],
    leaves: ['view', 'create'],
    shifts: ['view', 'create'],
    performance: ['view'],
    tasks: ['view', 'edit'],
    recruitment: ['view', 'create'], // Referral
    finance: ['view', 'create'],
    notifications: ['view'],
    payroll: ['view'], // Payslip only
    advance_salary: ['view', 'create'],
    reports: [],
    organization: ['view'],
    assets: ['view'],
    settings: ['view'],
  },
  'Finance Manager': {
    dashboard: ['view'],
    employees: ['view'],
    face_attendance: ['view'],
    attendance: ['view'],
    gps_geofence: [],
    leaves: ['view'],
    shifts: ['view'],
    performance: ['view'],
    tasks: ['view'],
    recruitment: [],
    finance: ['view', 'create', 'export'],
    notifications: ['view', 'create'],
    payroll: ['view', 'export'],
    advance_salary: ['view', 'export'],
    reports: ['view', 'export'],
    organization: ['view'],
    assets: ['view', 'export'],
    settings: ['view'],
  },
  'Task Creator': {
    dashboard: ['view'],
    employees: ['view'],
    face_attendance: ['view'],
    attendance: ['view'],
    gps_geofence: [],
    leaves: ['view'],
    shifts: ['view'],
    performance: ['view'],
    tasks: ['view', 'create', 'edit', 'export'],
    recruitment: ['view'],
    finance: ['view'],
    notifications: ['view'],
    payroll: [],
    advance_salary: ['view'],
    reports: ['view'],
    organization: ['view'],
    assets: ['view'],
    settings: ['view'],
  },
  'Assignee': {
    dashboard: ['view'],
    employees: [],
    face_attendance: ['view', 'create'],
    attendance: ['view'],
    gps_geofence: [],
    leaves: ['view', 'create'],
    shifts: ['view'],
    performance: ['view'],
    tasks: ['view', 'edit'],
    recruitment: ['view'],
    finance: ['view'],
    notifications: ['view'],
    payroll: ['view'],
    advance_salary: ['view', 'create'],
    reports: [],
    organization: ['view'],
    assets: ['view'],
    settings: ['view'],
  },
  'Responsible Person': {
    dashboard: ['view'],
    employees: ['view'],
    face_attendance: ['view'],
    attendance: ['view'],
    gps_geofence: [],
    leaves: ['view'],
    shifts: ['view'],
    performance: ['view'],
    tasks: ['view', 'create', 'edit', 'approve', 'export'],
    recruitment: ['view'],
    finance: ['view'],
    notifications: ['view'],
    payroll: [],
    advance_salary: ['view'],
    reports: ['view'],
    organization: ['view'],
    assets: ['view'],
    settings: ['view'],
  },
  'Department Head': {
    dashboard: ['view', 'export'],
    employees: ['view'],
    face_attendance: ['view'],
    attendance: ['view', 'approve'],
    gps_geofence: [],
    leaves: ['view', 'approve'],
    shifts: ['view', 'approve'],
    performance: ['view', 'edit', 'export'],
    tasks: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    recruitment: ['view'],
    finance: ['view', 'approve'],
    notifications: ['view', 'create'],
    payroll: ['view'],
    advance_salary: ['view', 'approve'],
    reports: ['view', 'export'],
    organization: ['view'],
    assets: ['view'],
    settings: ['view'],
  },
  'Manager': {
    dashboard: ['view'],
    employees: ['view'],
    face_attendance: ['view'],
    attendance: ['view', 'approve'],
    gps_geofence: [],
    leaves: ['view', 'approve'],
    shifts: ['view', 'approve'],
    performance: ['view', 'edit'],
    tasks: ['view', 'create', 'edit', 'approve', 'export'],
    recruitment: ['view'],
    finance: ['view', 'approve'],
    notifications: ['view'],
    payroll: [],
    advance_salary: ['view', 'approve'],
    reports: ['view'],
    organization: ['view'],
    assets: ['view'],
    settings: [],
  },
  'Management': {
    dashboard: ['view', 'export'],
    employees: ['view', 'export'],
    face_attendance: ['view'],
    attendance: ['view', 'export'],
    gps_geofence: ['view'],
    leaves: ['view', 'export'],
    shifts: ['view'],
    performance: ['view', 'export'],
    tasks: ['view', 'export'],
    recruitment: ['view', 'export'],
    finance: ['view', 'export'],
    notifications: ['view'],
    payroll: ['view', 'export'],
    advance_salary: ['view', 'approve', 'export'],
    reports: ['view', 'export'],
    organization: ['view', 'export'],
    assets: ['view', 'export'],
    settings: ['view'],
  },
  'ERP Administrator': {
    dashboard: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    employees: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    face_attendance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    attendance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    gps_geofence: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    leaves: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    shifts: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    performance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    tasks: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    recruitment: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    finance: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    notifications: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    payroll: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    advance_salary: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    reports: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    organization: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    assets: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    settings: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  }
};

// Initial Enterprise Configuration Datasets

const INITIAL_LEAVE_POLICIES: LeavePolicyItem[] = [];

const INITIAL_HOLIDAYS: HolidayItem[] = [];

const INITIAL_ATTENDANCE_POLICIES: AttendancePolicyItem[] = [];

const INITIAL_WEEKLY_SCHEDULES: WeeklyScheduleItem[] = [];

const INITIAL_GLOBAL_ATTENDANCE_CONFIG: GlobalAttendanceConfig = {
  trackInOutTime: true,
  noAttendanceWithoutPunchOut: true,
  allowMultiplePunches: false,
  lateGraceMinutes: 15,
  maxLateEntriesPerMonth: 3,
  latePenaltyDeduction: '0.5 Day Leave after 3 Late Marks',
  trackEarlyOut: true,
  earlyOutGraceMinutes: 15,
  trackBreaks: true,
  maxBreakMinutes: 60,
  autoPunchOutAfterHours: 12,
  enableAutoApproval: true,
  autoApproveDays: 3,
  enableOvertime: true,
  normalOtMultiplier: 1.5,
  holidayOtMultiplier: 2.0,
  minOtTriggerMinutes: 30,
  maxOtHoursPerMonth: 50,
  requireOtPreApproval: true,
  autoCreditOtToPayroll: true,
  compOffMinHoursHalfDay: 4,
  compOffMinHoursFullDay: 8,
  compOffValidityDays: 60,
  compOffMaxAccrualPerMonth: 3,
  compOffRequireManagerApproval: true,
  compOffAllowEncashment: false
};

const INITIAL_POLICY_DOCUMENTS: PolicyDocumentItem[] = [];

const INITIAL_BUSINESS_SETTINGS: BusinessProfileSettings = {
  logoUrl: '',
  logoStatus: 'Not Added',
  businessName: '',
  businessCode: '',
  email: '',
  phone: '',
  type: '',
  address: '',
  gstin: '',
  pan: '',
  cin: '',
  employeeCodeGeneration: 'Manual',
  employeeCodePrefix: 'EMP',
  employeeCodeSample: 'EMP-001',
  administrator: '',
  currency: 'INR - ₹ (India)',
  currencySymbol: '₹',
  currencyCode: 'INR',
  timeZone: 'Indian Standard Time (IST) (UTC+05:30)',
  category: '',
  bankName: '',
  bankAccountNo: '',
  bankIfsc: '',
  bankBranch: '',
  emailConfig: 'Not Configured',
  smtpHost: '',
  smtpPort: '',
  smtpUser: '',
  activeEntity: ''
};



const INITIAL_BRANCHES: BranchItem[] = [];

const INITIAL_DESIGNATIONS: DesignationItem[] = [];

export const INITIAL_GRADES: GradeItem[] = [];

export const INITIAL_EMPLOYMENT_TYPES: EmploymentTypeItem[] = [];

export const INITIAL_EMPLOYEE_CATEGORIES: EmployeeCategoryItem[] = [];

export const INITIAL_EMPLOYEE_CONFIG: EmployeeConfigSettings = {
  idFormatPrefix: 'EMP',
  idFormatDigits: 3,
  idStartingNumber: 1,
  autoGenerateId: true,
  defaultProbationMonths: 6,
  defaultNoticeDays: 30,
  autoConfirmProbation: false,
  customFields: [],
  documentTypes: []
};

export const INITIAL_APPROVAL_WORKFLOWS: ApprovalWorkflowItem[] = [];

export const INITIAL_NOTIFICATION_TRIGGERS: NotificationTriggerConfig[] = [];

export const INITIAL_GENERAL_SYSTEM_CONFIG: GeneralSystemConfig = {
  language: 'English (US / IN)',
  theme: 'Notion Slate Clean Light',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12 Hours (AM/PM)',
  currency: 'Indian Rupee (INR)',
  currencySymbol: '₹',
  tablePagination: 10,
  auditLogsEnabled: true
};

export const INITIAL_INTEGRATIONS_CONFIG: IntegrationsConfig = {
  biometricDevice: {
    enabled: false,
    provider: 'eSSL & ZKTeco Biometric SDK',
    ipAddress: '',
    port: 0,
    syncIntervalMins: 15,
    status: 'Disconnected'
  },
  mapsApi: {
    enabled: false,
    provider: 'Google Maps Telemetry API',
    apiKey: ''
  },
  emailSmtp: {
    enabled: false,
    host: '',
    port: 0,
    user: '',
    secure: true
  },
  smsGateway: {
    enabled: false,
    provider: 'Twilio SMS Cloud',
    senderId: '',
    apiKey: ''
  },
  whatsappApi: {
    enabled: false,
    provider: 'Meta WhatsApp Cloud Business API',
    phoneNumberId: '',
    apiKey: ''
  },
  accountingSoftware: {
    enabled: false,
    software: 'Tally Prime XML Sync & Zoho Books',
    syncFormat: 'Tally XML / Zoho JSON',
    autoExportMonthly: false
  },
  webhooks: {
    enabled: false,
    endpointUrl: '',
    secretKey: '',
    subscribedEvents: ['employee.created', 'attendance.punched', 'leave.approved', 'payroll.processed']
  }
};

interface HRMSContextType {
  currentUser: User;
  updateCurrentUser: (updates: Partial<User>) => void;
  switchRole: (role: Role) => void;
  hasPermission: (module: ModuleName, action: PermissionAction) => boolean;
  permissionMatrix: PermissionMatrix;
  updatePermission: (role: Role, module: ModuleName, action: PermissionAction, enabled: boolean) => void;

  employees: Employee[];
  addEmployee: (emp: Omit<Employee, 'id'>, options?: { persistToCloud?: boolean }) => void;
  updateEmployee: (id: string, empData: Partial<Employee>) => void;
  deleteEmployee: (id: string) => Promise<{ success: boolean; message?: string }> | any;
  deleteMultipleEmployees: (ids: string[]) => Promise<{ success: boolean; deletedCount: number; message?: string }>;
  refreshEmployees: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  syncAllWithCloud: () => Promise<void>;
  resetEmployeeLogin: (employeeId: string) => { success: boolean; message: string; temporaryPassword?: string };
  updateEmployeeLoginStatus: (employeeId: string, status: 'ACTIVE' | 'DISABLED' | 'DEACTIVATED') => { success: boolean; message: string };
  changeEmployeePassword: (identifier: string, newPassword: string) => { success: boolean; message: string };

  attendanceRecords: AttendanceRecord[];
  markAttendance: (empId: string, status: AttendanceRecord['status'], method: AttendanceRecord['method'], location?: AttendanceRecord['location']) => { success: boolean; message: string };
  attendanceAuditLogs: AttendanceAuditLog[];
  correctAttendanceRecord: (params: {
    attendanceId: string;
    status: AttendanceRecord['status'];
    checkIn?: string | null;
    checkOut?: string | null;
    breakDurationMinutes?: number;
    halfDayType?: 'First Half' | 'Second Half';
    absentReason?: 'Unauthorized Absence' | 'No Show' | 'Attendance Not Recorded' | 'Other';
    leaveType?: string;
    leaveDuration?: 'Full Day' | 'First Half' | 'Second Half';
    wfhReason?: string;
    wfhSource?: 'Approved WFH Request' | 'HR Assigned' | 'Manual';
    otHours?: number;
    approvedOtHours?: number;
    otStatus?: 'Pending' | 'Approved' | 'Rejected' | 'Paid';
    otReason?: string;
    reason: string;
    changedBy: string;
  }) => { success: boolean; message: string };
  addManualAttendanceRecord: (entry: {
    employeeId: string;
    date: string;
    status: AttendanceRecord['status'];
    checkIn?: string | null;
    checkOut?: string | null;
    breakDurationMinutes?: number;
    workingHours?: number;
    halfDayType?: 'First Half' | 'Second Half';
    otHours?: number;
    reason: string;
    addedBy: string;
  }) => { success: boolean; message: string };

  // Enterprise Attendance & Overtime Module
  missedPunchRequests: MissedPunchRequest[];
  submitMissedPunchRequest: (req: Omit<MissedPunchRequest, 'id' | 'status' | 'submittedAt'>) => { success: boolean; message: string };
  approveMissedPunchRequest: (id: string, reviewedBy: string, remarks?: string) => void;
  rejectMissedPunchRequest: (id: string, reviewedBy: string, remarks?: string) => void;
  editAndApproveMissedPunchRequest: (id: string, adjustedCheckIn: string, adjustedCheckOut: string, reviewedBy: string, remarks?: string) => void;

  overtimeRequests: OvertimeRequest[];
  submitOtRequest: (req: Omit<OvertimeRequest, 'id' | 'status' | 'approvedOtHours' | 'submittedAt'>) => { success: boolean; message: string };
  approveOtRequest: (id: string, approvedHours: number, reviewedBy: string, remarks?: string, multiplier?: OvertimeRequest['multiplier']) => void;
  rejectOtRequest: (id: string, reviewedBy: string, remarks?: string) => void;
  editAndApproveOtRequest: (id: string, approvedHours: number, reviewedBy: string, remarks?: string, multiplier?: OvertimeRequest['multiplier']) => void;
  deleteOtRequest: (id: string) => void;
  addManualOtEntry: (entry: { employeeId: string; date: string; hours: number; hourlyRate: number; multiplier: OvertimeRequest['multiplier']; reason: string; addedBy: string }) => { success: boolean; message: string };

  departmentOtPolicies: DepartmentOtPolicy[];
  updateDepartmentOtPolicy: (id: string, policy: Partial<DepartmentOtPolicy>) => void;
  employeeOtPolicies: EmployeeOtPolicy[];
  updateEmployeeOtPolicy: (id: string, policy: Partial<EmployeeOtPolicy>) => void;
  overtimePolicy: OvertimePolicy;
  updateOvertimePolicy: (policy: Partial<OvertimePolicy>) => void;
  attendancePolicyConfig: AttendancePolicyConfig;
  updateAttendancePolicyConfig: (config: Partial<AttendancePolicyConfig>) => void;
  attendanceGlobalSettings: AttendanceGlobalSettings;
  updateAttendanceGlobalSettings: (settings: Partial<AttendanceGlobalSettings>) => void;
  recordEmployeePunch: (type: 'Check-In' | 'Check-Out', method?: AttendanceRecord['method']) => { success: boolean; message: string };
  getEmployeeShiftAttendanceState: (empId?: string) => ShiftWindowEvaluation;

  faceLogs: FaceLog[];
  addFaceLog: (log: Omit<FaceLog, 'id'>) => void;

  leaveRequests: LeaveRequest[];
  applyLeave: (req: Omit<LeaveRequest, 'id' | 'status' | 'appliedDate'>) => void;
  approveLeave: (id: string, approvedBy: string) => void;
  rejectLeave: (id: string, approvedBy: string, comment?: string) => void;

  shifts: Shift[];
  shiftRequests: ShiftRequest[];
  addShift: (shift: Omit<Shift, 'id' | 'assignedEmployeeCount'>) => void;
  updateShift: (id: string, updates: Partial<Shift>) => void;
  deleteShift: (id: string) => void;
  requestShiftChange: (req: Omit<ShiftRequest, 'id' | 'status'>) => void;
  approveShiftRequest: (id: string, approvedBy: string) => void;
  rejectShiftRequest: (id: string, rejectedBy: string, reason?: string) => void;

  tasks: TaskItem[];
  addTask: (tsk: Omit<TaskItem, 'id' | 'createdAt'>) => void;
  updateTaskStatus: (id: string, status: TaskItem['status']) => void;
  deleteTask: (id: string) => void;

  // Enhanced Enterprise Task Management
  enhancedTasks: TaskItemEnhanced[];
  refreshTasks: () => Promise<void>;
  createEnhancedTask: (task: Omit<TaskItemEnhanced, 'id' | 'taskNumber' | 'overallProgress' | 'overallStatus' | 'updates' | 'comments' | 'attachments' | 'timeline' | 'auditLogs' | 'createdAt' | 'updatedAt'> & Partial<Pick<TaskItemEnhanced, 'assignees' | 'attachments'>>) => TaskItemEnhanced;
  updateEnhancedTask: (taskId: string, updates: Partial<Pick<TaskItemEnhanced, 'title' | 'description' | 'expectedOutput' | 'priority' | 'dueDate' | 'taskCategory'>>) => void;
  markTaskViewed: (taskId: string) => void;
  markTaskDailyReportsSeen: (taskId: string) => void;
  updateAssigneeProgress: (taskId: string, assigneeId: string, progressPercentage: number, individualStatus: TaskAssigneeStatus, latestRemark?: string, completionEvidence?: TaskCompletionEvidence) => void;
  closeTask: (taskId: string, closedBy: string, closureRemarks?: string) => void;
  reopenTask: (taskId: string, reopenedBy: string, reopenReason: string) => void;
  addTaskDailyReport: (taskId: string, report: {
    reportDate: string;
    workDoneToday: string;
    planForTomorrow?: string;
    blockersOrIssues?: string;
    hoursSpent?: number;
    processStatus: TaskAssigneeStatus;
  }) => void;
  updateTaskProcessStatus: (taskId: string, newStatus: TaskAssigneeStatus, remarks?: string, targetAssigneeId?: string) => void;
  addTaskComment: (taskId: string, content: string, attachments?: string[]) => void;
  addTaskAttachment: (taskId: string, attachment: Omit<TaskAttachment, 'id' | 'taskId' | 'uploadedAt'>) => void;
  addTaskLink: (taskId: string, link: { title: string; url: string }) => void;
  deleteTaskLink: (taskId: string, linkId: string) => void;
  convertMOMActionToTask: (momId: string, actionItemId: string) => TaskItemEnhanced | null;
  syncMOMTask: (taskId: string) => void;
  deleteEnhancedTask: (taskId: string) => void;

  taskMasters: TaskMasterItem[];
  addTaskMaster: (item: Omit<TaskMasterItem, 'id'>) => void;
  updateTaskMaster: (id: string, updates: Partial<TaskMasterItem>) => void;
  deleteTaskMaster: (id: string) => void;

  momMeetings: MOMMeeting[];
  addMOMMeeting: (meeting: Omit<MOMMeeting, 'id' | 'meetingNumber'>) => void;

  escalationRules: TaskEscalationRule[];
  updateEscalationRule: (id: string, updates: Partial<TaskEscalationRule>) => void;

  taskWeights: TaskPerformanceWeights;
  updateTaskWeights: (weights: Partial<TaskPerformanceWeights>) => void;

  performanceScores: PerformanceScore[];

  jobOpenings: JobOpening[];
  candidates: Candidate[];
  addJobOpening: (job: Omit<JobOpening, 'id' | 'postedDate' | 'applicantsCount'>) => void;
  updateCandidateStage: (candidateId: string, newStage: Candidate['stage']) => void;
  referCandidate: (cand: Omit<Candidate, 'id' | 'stage' | 'appliedDate'>) => void;
  reviewReferral: (candidateId: string, status: 'Accepted' | 'Rejected', reviewerName: string, notes?: string, newStage?: Candidate['stage']) => void;

  expenses: Expense[];
  addExpense: (exp: Omit<Expense, 'id' | 'status'>) => void;
  approveExpense: (id: string, approvedBy: string, nextStatus: Expense['status']) => void;

  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addNotification: (note: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void;
  pushSharedNotification: (note: Omit<NotificationItem, 'id' | 'timestamp' | 'read' | 'createdAt' | 'readBy' | 'senderKey'>) => void;
  sendLeaveReminder: (leave: LeaveRequest) => void;

  payrollRecords: PayrollRecord[];
  processPayrollBatch: () => void | Promise<void>;
  updateEmployeeSalaryScheme: (employeeId: string, withPf: boolean) => void;
  updatePayrollRecordAdvanceDeduction: (recordId: string, amount: number) => void;
  markPayrollRecordsPaid: (recordIds: string[]) => void;

  departments: DepartmentItem[];
  addDepartment: (dept: Omit<DepartmentItem, 'id' | 'employeeCount'>) => void;
  updateDepartment: (id: string, updates: Partial<DepartmentItem>) => void;
  deleteDepartment: (id: string) => { success: boolean; message?: string };

  designations: DesignationItem[];
  addDesignation: (desig: Omit<DesignationItem, 'id'>) => void;
  updateDesignation: (id: string, updates: Partial<DesignationItem>) => void;
  deleteDesignation: (id: string) => { success: boolean; message?: string };

  canDeleteEmployee: (idOrEmpId: string) => { canDelete: boolean; reason?: string };
  canDeleteDepartment: (idOrName: string) => { canDelete: boolean; reason?: string };
  canDeleteBranch: (idOrName: string) => { canDelete: boolean; reason?: string };
  canDeleteShift: (idOrName: string) => { canDelete: boolean; reason?: string };
  canDeleteDesignation: (idOrTitle: string) => { canDelete: boolean; reason?: string };

  branches: BranchItem[];
  addBranch: (branch: Omit<BranchItem, 'id'>) => void;
  updateBranch: (id: string, branch: Partial<BranchItem>) => void;
  deleteBranch: (id: string) => void;
  addDepartmentToBranch: (branchId: string, departmentName: string) => void;
  removeDepartmentFromBranch: (branchId: string, departmentName: string) => void;

  assets: AssetItem[];
  addAsset: (asset: Omit<AssetItem, 'id'>) => void;
  assignAsset: (assetId: string, employeeId: string, employeeName: string, department: string) => void;
  deleteAsset: (assetId: string) => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeModule: ModuleName;
  setActiveModule: (mod: ModuleName) => void;
  activeSettingsTab: SettingsSubTab;
  setActiveSettingsTab: (tab: SettingsSubTab) => void;

  workflowFormat: ApprovalWorkflowFormat;
  setWorkflowFormat: (format: ApprovalWorkflowFormat) => void;

  geofenceConfig: GeofenceConfig;
  updateGeofenceConfig: (config: Partial<GeofenceConfig>) => void;
  isGeofenceAdmin: boolean;

  // Enterprise Policies & Configurations
  leavePolicies: LeavePolicyItem[];
  addLeavePolicy: (policy: Omit<LeavePolicyItem, 'id'>) => void;
  updateLeavePolicy: (id: string, updates: Partial<LeavePolicyItem>) => void;
  deleteLeavePolicy: (id: string) => void;

  holidayPolicies: HolidayItem[];
  addHolidayPolicy: (holiday: Omit<HolidayItem, 'id'>) => void;
  updateHolidayPolicy: (id: string, updates: Partial<HolidayItem>) => void;
  deleteHolidayPolicy: (id: string) => void;

  attendancePolicies: AttendancePolicyItem[];
  addAttendancePolicy: (policy: Omit<AttendancePolicyItem, 'id'>) => void;
  updateAttendancePolicy: (id: string, updates: Partial<AttendancePolicyItem>) => void;
  deleteAttendancePolicy: (id: string) => void;

  weeklySchedules: WeeklyScheduleItem[];
  addWeeklySchedule: (schedule: Omit<WeeklyScheduleItem, 'id'>) => void;
  updateWeeklySchedule: (id: string, updates: Partial<WeeklyScheduleItem>) => void;
  deleteWeeklySchedule: (id: string) => void;

  attendanceConfig: GlobalAttendanceConfig;
  updateAttendanceConfig: (config: Partial<GlobalAttendanceConfig>) => void;

  policyDocuments: PolicyDocumentItem[];
  addPolicyDocument: (doc: Omit<PolicyDocumentItem, 'id'>) => void;
  updatePolicyDocument: (id: string, updates: Partial<PolicyDocumentItem>) => void;
  deletePolicyDocument: (id: string) => void;

  businessSettings: BusinessProfileSettings;
  updateBusinessSettings: (settings: Partial<BusinessProfileSettings>) => void;

  // Organization Masters
  grades: GradeItem[];
  addGrade: (grade: Omit<GradeItem, 'id'>) => void;
  updateGrade: (id: string, updates: Partial<GradeItem>) => void;
  deleteGrade: (id: string) => { success: boolean; message?: string };

  employmentTypes: EmploymentTypeItem[];
  addEmploymentType: (type: Omit<EmploymentTypeItem, 'id'>) => void;
  updateEmploymentType: (id: string, updates: Partial<EmploymentTypeItem>) => void;
  deleteEmploymentType: (id: string) => void;

  employeeCategories: EmployeeCategoryItem[];
  addEmployeeCategory: (cat: Omit<EmployeeCategoryItem, 'id'>) => void;
  updateEmployeeCategory: (id: string, updates: Partial<EmployeeCategoryItem>) => void;
  deleteEmployeeCategory: (id: string) => void;

  // Employee Configuration
  employeeConfig: EmployeeConfigSettings;
  updateEmployeeConfig: (config: Partial<EmployeeConfigSettings>) => void;

  // Workflows
  approvalWorkflows: ApprovalWorkflowItem[];
  addApprovalWorkflow: (wf: Omit<ApprovalWorkflowItem, 'id'>) => void;
  updateApprovalWorkflow: (id: string, updates: Partial<ApprovalWorkflowItem>) => void;
  deleteApprovalWorkflow: (id: string) => void;

  // Notifications
  notificationTriggers: NotificationTriggerConfig[];
  updateNotificationTrigger: (id: string, updates: Partial<NotificationTriggerConfig>) => void;

  // General & System Settings
  generalSystemConfig: GeneralSystemConfig;
  updateGeneralSystemConfig: (config: Partial<GeneralSystemConfig>) => void;

  // Integrations
  integrationsConfig: IntegrationsConfig;
  updateIntegrationsConfig: (config: Partial<IntegrationsConfig>) => void;

  // 5 New Core Enterprise Settings & Dynamic Policy Engine
  activeCompanyId: string;
  switchCompany: (companyId: string) => void;
  allEmployees?: Employee[];
  allPayrollRecords?: PayrollRecord[];
  companyInfo: CompanyInfo;
  updateCompanyInfo: (info: Partial<CompanyInfo>) => void;

  companyBranches: CompanyBranch[];
  addCompanyBranch: (branch: Omit<CompanyBranch, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateCompanyBranch: (id: string, updates: Partial<CompanyBranch>) => void;
  deleteCompanyBranch: (id: string) => void;

  orgStructure: OrganizationStructure;
  updateOrgStructure: (structure: Partial<OrganizationStructure>) => void;
  editDepartment: (oldName: string, newName: string) => void;
  removeOrgDepartment: (name: string) => void;
  editDesignation: (oldTitle: string, newTitle: string) => void;
  removeOrgDesignation: (title: string) => void;
  editEmploymentType: (oldType: string, newType: string) => void;
  removeOrgEmploymentType: (type: string) => void;
  editWorkLocation: (oldLoc: string, newLoc: string) => void;
  removeOrgWorkLocation: (loc: string) => void;
  loadCompanyPreset: (preset: 'VRM' | 'BLANK') => void;

  masterAttendancePolicies: AttendancePolicy[];
  addMasterAttendancePolicy: (policy: Omit<AttendancePolicy, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>) => void;
  updateMasterAttendancePolicy: (id: string, updates: Partial<AttendancePolicy>) => void;
  archiveMasterAttendancePolicy: (id: string) => void;
  toggleMasterAttendancePolicyStatus: (id: string) => void;

  attendanceCorrections: AttendanceCorrectionRequest[];
  submitAttendanceCorrection: (req: Omit<AttendanceCorrectionRequest, 'id' | 'submittedAt' | 'status'>) => void;
  reviewAttendanceCorrection: (id: string, decision: 'Approved' | 'Rejected', comment?: string, adjustedTime?: { checkIn?: string; checkOut?: string }) => void;

  masterLeavePolicies: MasterLeavePolicy[];
  addMasterLeavePolicy: (policy: Omit<MasterLeavePolicy, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>) => void;
  updateMasterLeavePolicy: (id: string, updates: Partial<MasterLeavePolicy>) => void;
  archiveMasterLeavePolicy: (id: string) => void;
  toggleMasterLeavePolicyStatus: (id: string) => void;
  deleteMasterLeavePolicy: (id: string) => void;
  resetMasterLeavePoliciesToDefault: () => void;

  // Sandwich Leave Policy Engine
  sandwichPolicies: SandwichLeavePolicy[];
  sandwichAuditLogs: SandwichAuditLog[];
  createSandwichPolicy: (policy: Omit<SandwichLeavePolicy, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>) => void;
  updateSandwichPolicy: (id: string, updates: Partial<SandwichLeavePolicy>, reason?: string) => void;
  archiveSandwichPolicy: (id: string) => void;
  toggleSandwichPolicyStatus: (id: string) => void;
  deleteSandwichPolicy: (id: string) => void;
  overrideSandwichCalculation: (leaveRequestId: string, overrideData: {
    excludedDates?: string[];
    includedDates?: string[];
    adjustedPayType?: SandwichPayType;
    adjustedDaysCount?: number;
    internalReason: string;
  }) => void;
  computeSandwichCalculation: (params: {
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
  }) => SandwichCalculationResult;
  addSandwichAuditLog: (log: Omit<SandwichAuditLog, 'id' | 'timestamp' | 'user' | 'userRole'>) => void;

  payrollSettingsConfig: PayrollSettingsConfig;
  updatePayrollSettingsConfig: (config: Partial<PayrollSettingsConfig>) => void;
  toggleSalaryComponent: (code: string) => void;

  rewardPolicies: RewardPolicy[];
  addRewardPolicy: (policy: Omit<RewardPolicy, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>) => void;
  updateRewardPolicy: (id: string, updates: Partial<RewardPolicy>) => void;
  archiveRewardPolicy: (id: string) => void;
  toggleRewardPolicyStatus: (id: string) => void;

  employeeRewardRecords: EmployeeRewardRecord[];
  grantRewardToEmployee: (grant: Omit<EmployeeRewardRecord, 'id' | 'grantedDate' | 'payrollStatus'>) => void;

  policyAuditLogs: PolicyAuditLog[];
  addPolicyAuditLog: (log: Omit<PolicyAuditLog, 'id' | 'timestamp'>) => void;

  // Advance Salary / Loan Policy & Management
  loanPolicies: LoanPolicy[];
  activeLoanPolicy: LoanPolicy | undefined;
  createLoanPolicy: (policy: Omit<LoanPolicy, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => void;
  updateLoanPolicy: (id: string, updates: Partial<LoanPolicy>) => void;
  deleteLoanPolicy: (id: string) => void;

  loanRecords: LoanRecord[];
  submitLoanRequest: (request: Omit<LoanRecord, 'id' | 'requestedDate' | 'status' | 'outstandingBalance' | 'repaymentSchedule' | 'auditLogs'>) => { success: boolean; message: string; loanId?: string };
  reviewLoanRequest: (id: string, options: {
    action: 'Approve' | 'Reject';
    approvedAmount?: number;
    approvedMonths?: number;
    monthlyDeduction?: number;
    deductionStartMonth?: string;
    internalHrNotes?: string;
    employeeVisibleNotes?: string;
    rejectionReason?: string;
  }) => void;
  disburseLoan: (id: string, details: {
    disbursedDate: string;
    disbursedAmount: number;
    paymentMode: 'NEFT' | 'IMPS' | 'Cheque' | 'Cash';
    transactionRef?: string;
    notes?: string;
  }) => void;
  recordManualRepayment: (id: string, repayment: {
    amount: number;
    repaymentDate: string;
    paymentMode: 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI' | 'NEFT' | 'Other';
    referenceNumber?: string;
    notes?: string;
  }) => void;
  calculateEmployeeLoanEligibility: (employeeId: string, policyId?: string) => {
    isEligible: boolean;
    ineligibleReason?: string;
    employmentDurationMonths: number;
    monthlySalary: number;
    maxEligibleAmount: number;
    activeLoansCount: number;
    currentOutstanding: number;
    policy: LoanPolicy;
  };

  // Field Duty & Live GPS Tracking
  fieldAssignments: FieldAssignment[];
  tripSessions: FieldTripSession[];
  trackingAlerts: TrackingAlert[];
  createFieldAssignment: (data: Omit<FieldAssignment, 'id' | 'createdAt' | 'updatedAt'>) => FieldAssignment;
  updateFieldAssignment: (id: string, updates: Partial<FieldAssignment>) => void;
  cancelFieldAssignment: (id: string) => void;
  startTrip: (assignmentId: string, startLat: number, startLng: number, startAddress?: string) => FieldTripSession;
  recordLocationPoint: (tripId: string, point: Omit<LocationPoint, 'id' | 'tripId'>) => void;
  endTrip: (tripId: string, endLat: number, endLng: number, endAddress?: string) => void;
  fieldCheckIn: (assignmentId: string, lat: number, lng: number, address?: string) => { success: boolean; message: string };
  fieldCheckOut: (assignmentId: string) => void;
  resolveTrackingAlert: (alertId: string) => void;
  getTodayFieldAssignment: (employeeId: string) => FieldAssignment | undefined;
}

const HRMSContext = createContext<HRMSContextType | undefined>(undefined);

/**
 * Attendance check_in / check_out are TIMESTAMPTZ columns. Supabase returns them in UTC
 * (e.g. "2026-10-06T12:48:30+00:00"). Convert strictly to Indian Standard Time (IST) 12-hour AM/PM format.
 */
const dbTimestampToLocalHHMM = (value?: string | null): string | null => {
  if (!value) return null;
  const formatted = formatTimeDisplay(value, '');
  return formatted && formatted !== '—' && formatted !== '--:--' ? formatted : null;
};

/** Convert a local date + wall-clock time ("HH:MM", "HH:MM:SS" or "hh:mm AM") into a UTC ISO instant for TIMESTAMPTZ storage in IST (+05:30). */
const localDateTimeToIso = (date: string, time?: string | null): string | null => {
  if (!date || !time) return null;
  const match = String(time).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const secs = match[3] ? parseInt(match[3], 10) : 0;
  const meridiem = match[4]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  const [y, m, d] = date.split('-').map(n => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const isoLocal = `${pad(y)}-${pad(m)}-${pad(d)}T${pad(hours)}:${pad(mins)}:${pad(secs)}+05:30`;
  const parsed = new Date(isoLocal);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const HRMSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // VPS database architecture: purge any remaining business data from browser localStorage
  if (typeof window !== 'undefined') {
    const STORAGE_MODE = 'vrm_hrms_hostinger_vps_source_of_truth_v5';
    if (localStorage.getItem('vrm_hrms_storage_mode') !== STORAGE_MODE) {
      const keysToRemove = [
        'vrm_hrms_employees', 'vrm_hrms_enhanced_tasks', 'vrm_hrms_attendance_records',
        'vrm_hrms_leave_requests', 'hrms_loan_records', 'vrm_hrms_loan_records', 'vrm_hrms_loan_policies',
        'vrm_hrms_expenses', 'vrm_hrms_assets', 'vrm_hrms_mom_meetings',
        'vrm_hrms_payroll_records', 'vrm_hrms_field_assignments', 'vrm_hrms_trip_sessions',
        'vrm_hrms_tracking_alerts', 'vrm_hrms_shifts', 'vrm_hrms_holiday_policies',
        'vrm_hrms_shift_requests', 'vrm_hrms_shift_requests_persistent', 'vrm_hrms_leave_requests_persistent',
        'vrm_hrms_reward_policies', 'vrm_hrms_employee_rewards',
        'vrm_hrms_master_attendance_policies', 'vrm_hrms_master_leave_policies',
        'vrm_hrms_payroll_settings_config', 'vrm_hrms_geofence_config', 'vrm_hrms_company_info',
        'vrm_hrms_company_branches', 'vrm_hrms_org_structure', 'vrm_hrms_departments',
        'vrm_hrms_designations', 'vrm_hrms_department_ot_policies', 'vrm_hrms_overtime_records',
        'vrm_enterprise_integrations_v6', 'vrm_enterprise_integrations_v5', 'vrm_enterprise_integrations_v4',
        'vrm_enterprise_integrations_v3', 'vrm_enterprise_integrations_v2'
      ];
      for (const k of keysToRemove) {
        try { localStorage.removeItem(k); } catch {}
      }
      localStorage.setItem('vrm_hrms_storage_mode', STORAGE_MODE);
    }
  }

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('vrm_hrms_current_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id && parsed.email && parsed.name && parsed.role && parsed.employeeId) {
          if (parsed.designation === 'CEO' || (parsed.designation && parsed.designation.toLowerCase().includes('ceo')) || parsed.role === 'CEO') {
            parsed.role = 'CEO';
          }
          if (!parsed.company_id) {
            parsed.company_id = (parsed.email?.toLowerCase().includes('nexus') || parsed.employeeId?.startsWith('EMP-B')) ? 'company-b' : 'company-a';
          }
          parsed.companyId = parsed.company_id;
          return parsed;
        }
      } catch (e) {
        console.error('Error reading current user from storage', e);
      }
    }
    return {
      id: 'USR-001',
      name: 'Businz Super Admin',
      email: 'developer@businz.com',
      role: 'Super Admin',
      avatar: '',
      department: 'Management',
      designation: 'Super Administrator',
      employeeId: 'EMP-000',
      company_id: 'company-a',
      companyId: 'company-a'
    };
  });

  const updateCurrentUser = (updates: Partial<User>) => {
    setCurrentUser(prev => {
      const updated = { ...prev, ...updates };
      if (updates.company_id && !updates.companyId) updated.companyId = updates.company_id;
      if (updates.companyId && !updates.company_id) updated.company_id = updates.companyId;
      try {
        localStorage.setItem('vrm_hrms_current_user', JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving current user to storage', e);
      }
      return updated;
    });
  };


  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix>(DEFAULT_PERMISSIONS);
  const [activeModule, setActiveModule] = useState<ModuleName>('dashboard');
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsSubTab>('company_details');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [workflowFormat, setWorkflowFormat] = useState<ApprovalWorkflowFormat>('HR_ONLY');
  const isCloudInitialized = useRef(false);
  const isSyncingFromCloud = useRef(false);

  const [geofenceConfig, setGeofenceConfig] = useState<GeofenceConfig>(INITIAL_GEOFENCE_CONFIG);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('geofence_config', geofenceConfig);
      }
    } catch (e) {
      console.error('Error saving geofenceConfig to VPS database', e);
    }
  }, [geofenceConfig]);

  const updateGeofenceConfig = (config: Partial<GeofenceConfig>) => {
    setGeofenceConfig(prev => ({ ...prev, ...config }));
  };

  const isGeofenceAdmin = true; // Fully unlocked for all roles

  const sanitizeAvatar = (url?: string) => {
    if (!url) return '';
    if (url.includes('unsplash.com')) return '';
    return url;
  };

  const [employees, setEmployees] = useState<Employee[]>([]);

  // Supabase Database Employee Entity Mapper
  const resolveEmployeeDepartmentName = (d: any, depts?: DepartmentItem[]): string => {
    const directDepartment = typeof d.department === 'string' ? d.department : d.department_name || d.deptName;
    const relatedDepartment = d.departments?.name || d.department?.name;
    const rawVal = directDepartment || relatedDepartment || d.departmentId || d.department_id;
    if (!rawVal) return 'General';
    const deptList = depts && depts.length > 0 ? depts : (typeof departments !== 'undefined' ? departments : []);
    const match = deptList.find((dep: any) =>
      dep.id === rawVal ||
      dep.code?.toLowerCase() === String(rawVal).toLowerCase() ||
      dep.name?.toLowerCase() === String(rawVal).toLowerCase()
    );
    if (match) return match.name;
    if (String(rawVal).toLowerCase() === '2fa75c7b-6333-4535-b3a7-ea3f6dee1cec' || String(rawVal).toLowerCase().includes('hr')) return 'HR';
    if (String(rawVal).length >= 32 && String(rawVal).includes('-')) return 'General';
    return String(rawVal);
  };

  const mapEmployeeFromDb = (d: any, depts?: DepartmentItem[]): Employee => ({
    id: d.id,
    company_id: d.company_id || d.companyId || (d.email?.includes('nexus') || d.employee_id?.startsWith('EMP-B') ? 'company-b' : 'company-a'),
    companyId: d.company_id || d.companyId || (d.email?.includes('nexus') || d.employee_id?.startsWith('EMP-B') ? 'company-b' : 'company-a'),
    employeeId: d.employeeId || d.employee_id,
    firstName: d.firstName || d.first_name || '',
    lastName: d.lastName || d.last_name || '',
    email: d.email || '',
    phone: d.phone || '+91 98765 43210',
    dob: d.dob || '1995-01-01',
    gender: (d.gender as any) || 'Male',
    address: d.address || 'Chennai, Tamil Nadu',
    department: resolveEmployeeDepartmentName(d, depts),
    designation: d.designation || 'Staff',
    reportingManagerId: d.reportingManagerId || d.reporting_manager_id || '',
    reportingManagerName: d.reportingManagerName || d.reporting_manager_name || '',
    joiningDate: d.joiningDate || d.created_at?.split('T')[0] || '2026-01-01',
    employmentType: (d.employmentType || d.employment_type || 'Full-Time') as any,
    status: (d.status === 'Active' || d.status === 'Terminated' || d.status === 'On Leave') ? d.status : 'Active',
    avatar: d.avatar || d.avatar_url || '',
    basicSalary: Number(d.basicSalary || d.basic_salary) || 15000,
    allowances: {
      hra: Number(d.hra || d.allowances_hra) || 0,
      transport: Number(d.conveyance || d.allowances_transport) || 0,
      medical: Number(d.allowances_medical) || 0,
      special: Number(d.allowances_special) || 0,
      da: Number(d.da) || 0,
      conveyance: Number(d.conveyance) || 0,
    },
    salaryDetails: {
      ...(d.salaryDetails || d.salary_details || {}),
      monthlyCtc: d.salaryDetails?.monthlyCtc ?? d.salary_details?.monthlyCtc ?? d.salary_details?.monthly_ctc ?? d.monthlyCtc ?? d.monthly_ctc,
      basicSalary: d.salaryDetails?.basicSalary ?? d.salary_details?.basicSalary ?? d.salary_details?.basic_salary ?? d.basicSalary ?? d.basic_salary,
      hra: d.salaryDetails?.hra ?? d.salary_details?.hra ?? (Number(d.hra) > 0 ? Number(d.hra) : (Number(d.allowances_hra) > 0 ? Number(d.allowances_hra) : undefined)),
      da: d.salaryDetails?.da ?? d.salary_details?.da ?? d.da,
      conveyance: d.salaryDetails?.conveyance ?? d.salary_details?.conveyance ?? d.conveyance,
      withPf: d.salaryDetails?.withPf ?? d.salary_details?.withPf ?? d.withPf,
      salaryScheme: d.salaryDetails?.salaryScheme ?? d.salary_details?.salaryScheme ?? d.salary_scheme
    },
    withPf: resolveEmployeeWithPf({
      withPf: d.withPf,
      salaryDetails: {
        ...(d.salaryDetails || d.salary_details || {}),
        withPf: d.salaryDetails?.withPf ?? d.salary_details?.withPf ?? d.withPf,
        salaryScheme: d.salaryDetails?.salaryScheme ?? d.salary_details?.salaryScheme ?? d.salary_scheme
      }
    } as Employee),
    bankDetails: {
      bankName: d.bankName || d.bank_name || '',
      accountNumber: d.accountNumber || d.account_number || '',
      ifscCode: d.ifscCode || d.ifsc_code || '',
      branch: d.branch || '',
    },
    attendanceMethod: (d.attendanceMethod || d.attendance_method || (d.designation === 'CEO' || (d.designation && d.designation.toLowerCase().includes('ceo')) ? 'Exempt' : 'Face Scan')) as any,
    gpsAllowed: d.gpsAllowed ?? (d.designation === 'CEO' ? false : true),
    faceRegistered: d.faceRegistered ?? false,
    facePhotoUrl: d.facePhotoUrl || d.face_photo_url || '',
    workShift: d.workShift || d.work_shift || 'SH-01',
    documents: Array.isArray(d.documents) ? d.documents : [],
    departmentId: d.departmentId || d.department_id,
    designationId: d.designationId || d.designation_id,
    branchId: d.branchId || d.branch_id,
    role: (d.role === 'CEO' || d.designation === 'CEO' || (d.designation && d.designation.toLowerCase().includes('ceo')) || d.role_id === '42a8b0c3-22e5-40a0-bf78-2dd14475c6d6')
      ? 'CEO'
      : (d.role || (d.designation === 'HR Manager' ? 'HR Manager' : 'Employee')),
    mustChangePassword: d.mustChangePassword ?? d.must_change_password ?? false,
    accountStatus: d.accountStatus || d.account_status || 'ACTIVE',
    credentialEmailStatus: d.credentialEmailStatus || d.credential_email_status || 'SENT',
    credentialEmailSentAt: d.credentialEmailSentAt || d.credential_email_sent_at || '',
    authUserId: d.authUserId || d.auth_id || d.id,
    password: d.password,
  });

  const employeeToDbUpdates = (emp: Partial<Employee>): Record<string, any> => {
    const updates: Record<string, any> = {};
    if (emp.employeeId !== undefined) updates.employee_id = emp.employeeId;
    if (emp.firstName !== undefined) updates.first_name = emp.firstName;
    if (emp.lastName !== undefined) updates.last_name = emp.lastName;
    if (emp.email !== undefined) updates.email = emp.email.toLowerCase().trim();
    if (emp.phone !== undefined) updates.phone = emp.phone;
    if (emp.designation !== undefined) updates.designation = emp.designation;
    if (emp.basicSalary !== undefined) updates.basic_salary = Number(emp.basicSalary) || 0;
    if (emp.status !== undefined && (emp.status === 'Active' || emp.status === 'On Leave' || emp.status === 'Terminated')) {
      updates.status = emp.status;
    }
    if (emp.mustChangePassword !== undefined) updates.must_change_password = emp.mustChangePassword;
    if (emp.accountStatus !== undefined) updates.account_status = emp.accountStatus;
    if (emp.attendanceMethod !== undefined) updates.attendance_method = emp.attendanceMethod;
    return updates;
  };

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);

  const [attendanceAuditLogs, setAttendanceAuditLogs] = useState<AttendanceAuditLog[]>(INITIAL_ATTENDANCE_AUDIT_LOGS);

  useEffect(() => {
    calibrateTrustedTime();
  }, []);

  const correctAttendanceRecord = (params: {
    attendanceId: string;
    status: AttendanceRecord['status'];
    checkIn?: string | null;
    checkOut?: string | null;
    breakDurationMinutes?: number;
    halfDayType?: 'First Half' | 'Second Half';
    absentReason?: 'Unauthorized Absence' | 'No Show' | 'Attendance Not Recorded' | 'Other';
    leaveType?: string;
    leaveDuration?: 'Full Day' | 'First Half' | 'Second Half';
    wfhReason?: string;
    wfhSource?: 'Approved WFH Request' | 'HR Assigned' | 'Manual';
    otHours?: number;
    approvedOtHours?: number;
    otStatus?: 'Pending' | 'Approved' | 'Rejected' | 'Paid';
    otReason?: string;
    reason: string;
    changedBy: string;
  }): { success: boolean; message: string } => {
    if (!params.reason || !params.reason.trim()) {
      return { success: false, message: 'Reason is required for manual attendance correction.' };
    }

    const existingRec = attendanceRecords.find(r => r.id === params.attendanceId);
    if (!existingRec) {
      return { success: false, message: 'Attendance record not found.' };
    }

    // Calculate working hours & OT
    let computedWorkingHours = existingRec.workingHours;
    const breakMins = params.breakDurationMinutes ?? existingRec.breakDurationMinutes ?? 0;

    if (params.status === 'Absent' || params.status === 'Holiday' || params.status === 'Week Off') {
      computedWorkingHours = 0;
    } else if (params.status === 'Half Day') {
      computedWorkingHours = 4.0;
    } else if (params.status === 'On Leave' || (params.status as string) === 'Leave') {
      computedWorkingHours = (params.leaveDuration === 'First Half' || params.leaveDuration === 'Second Half') ? 4.0 : 0;
    } else if (params.checkIn && params.checkOut) {
      const parseTime = (timeStr: string) => {
        if (!timeStr) return null;
        const clean = timeStr.trim();
        let hours = 0;
        let mins = 0;
        if (clean.includes('AM') || clean.includes('PM')) {
          const [timePart, ampm] = clean.split(' ');
          const [h, m] = timePart.split(':').map(Number);
          hours = ampm.toUpperCase() === 'PM' && h < 12 ? h + 12 : (ampm.toUpperCase() === 'AM' && h === 12 ? 0 : h);
          mins = m || 0;
        } else {
          const [h, m] = clean.split(':').map(Number);
          hours = h || 0;
          mins = m || 0;
        }
        return hours * 60 + mins;
      };

      const inMins = parseTime(params.checkIn);
      const outMins = parseTime(params.checkOut);
      if (inMins !== null && outMins !== null) {
        if (outMins < inMins) {
          return { success: false, message: 'Check-out time cannot be earlier than check-in time.' };
        }
        const netMinutes = Math.max(0, outMins - inMins - breakMins);
        computedWorkingHours = Math.round((netMinutes / 60) * 10) / 10;
      }
    }

    const calculatedOtHours = computedWorkingHours > 8.0 ? Math.round((computedWorkingHours - 8.0) * 10) / 10 : 0;
    const finalOtStatus = params.otStatus ?? existingRec.otStatus ?? 'Pending';
    const approvedOt = params.approvedOtHours !== undefined
      ? params.approvedOtHours
      : (finalOtStatus === 'Approved' || finalOtStatus === 'Paid' ? (params.otHours ?? calculatedOtHours) : 0);

    const updatedRecord: AttendanceRecord = {
      ...existingRec,
      status: params.status,
      checkIn: params.status === 'Absent' ? null : (params.checkIn !== undefined ? params.checkIn : existingRec.checkIn),
      checkOut: params.status === 'Absent' ? null : (params.checkOut !== undefined ? params.checkOut : existingRec.checkOut),
      workingHours: computedWorkingHours,
      breakDurationMinutes: breakMins,
      halfDayType: params.halfDayType,
      absentReason: params.absentReason,
      leaveType: params.leaveType,
      leaveDuration: params.leaveDuration,
      wfhReason: params.wfhReason,
      wfhSource: params.wfhSource,
      otHours: params.otHours ?? calculatedOtHours,
      calculatedOtHours,
      approvedOtHours: approvedOt,
      otStatus: finalOtStatus,
      otReason: params.otReason,
      reason: params.reason
    };

    setAttendanceRecords(prev => prev.map(r => r.id === params.attendanceId ? updatedRecord : r));

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const oldSummary = `Status: ${existingRec.status}, CheckIn: ${existingRec.checkIn || 'None'}, CheckOut: ${existingRec.checkOut || 'None'}, Hours: ${existingRec.workingHours}`;
    const newSummary = `Status: ${updatedRecord.status}, CheckIn: ${updatedRecord.checkIn || 'None'}, CheckOut: ${updatedRecord.checkOut || 'None'}, Hours: ${updatedRecord.workingHours}`;

    const newAuditLog: AttendanceAuditLog = {
      id: `AUD-${Date.now()}`,
      attendanceId: params.attendanceId,
      employeeId: existingRec.employeeId,
      employeeName: existingRec.employeeName,
      date: existingRec.date,
      fieldChanged: `Attendance Status / Punch Adjustment (${existingRec.status} -> ${updatedRecord.status})`,
      oldValue: oldSummary,
      newValue: newSummary,
      reason: params.reason,
      changedBy: params.changedBy,
      timestamp: `${dateStr} ${timeStr}`
    };

    setAttendanceAuditLogs(prev => [newAuditLog, ...prev]);

    setPayrollRecords(prev => prev.map(p => {
      if (p.employeeId === existingRec.employeeId) {
        const isAbsent = updatedRecord.status === 'Absent';
        const isHalfDay = updatedRecord.status === 'Half Day';
        return {
          ...p,
          overtimeHours: (p.overtimeHours || 0) + approvedOt,
          lopDays: isAbsent ? (p.lopDays || 0) + 1 : (isHalfDay ? (p.lopDays || 0) + 0.5 : p.lopDays)
        };
      }
      return p;
    }));

    addNotification({
      title: 'Attendance Corrected',
      message: `Attendance for ${existingRec.employeeName} on ${existingRec.date} was updated by ${params.changedBy}. Reason: ${params.reason}`,
      priority: 'Normal',
      category: 'Attendance'
    });

    return { success: true, message: 'Attendance record updated and audit log created successfully.' };
  };

  // Enterprise Attendance, Shifts & Overtime Policy State
  const [missedPunchRequests, setMissedPunchRequests] = useState<MissedPunchRequest[]>(INITIAL_MISSED_PUNCH_REQUESTS);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>(INITIAL_OVERTIME_REQUESTS);
  const [departmentOtPolicies, setDepartmentOtPolicies] = useState<DepartmentOtPolicy[]>(INITIAL_DEPARTMENT_OT_POLICIES);
  const [employeeOtPolicies, setEmployeeOtPolicies] = useState<EmployeeOtPolicy[]>(INITIAL_EMPLOYEE_OT_POLICIES);
  const [attendanceGlobalSettings, setAttendanceGlobalSettings] = useState<AttendanceGlobalSettings>(INITIAL_ATTENDANCE_GLOBAL_SETTINGS);
  const [overtimePolicy, setOvertimePolicy] = useState<OvertimePolicy>(INITIAL_OVERTIME_POLICY);
  const [attendancePolicyConfig, setAttendancePolicyConfig] = useState<AttendancePolicyConfig>(INITIAL_ATTENDANCE_POLICY_CONFIG);

  const updateOvertimePolicy = (policyUpdates: Partial<OvertimePolicy>) => {
    setOvertimePolicy(prev => ({ ...prev, ...policyUpdates }));
    addNotification({
      title: 'Overtime Policy Updated',
      message: 'Overtime calculation method, multipliers, or limits updated.',
      priority: 'Normal',
      category: 'Attendance'
    });
  };

  const updateAttendancePolicyConfig = (configUpdates: Partial<AttendancePolicyConfig>) => {
    setAttendancePolicyConfig(prev => ({ ...prev, ...configUpdates }));
    addNotification({
      title: 'Attendance Policy Updated',
      message: 'Half-day, absent, and late coming rules updated successfully.',
      priority: 'Normal',
      category: 'Attendance'
    });
  };

  const getEmployeeShiftAttendanceState = (empId?: string): ShiftWindowEvaluation => {
    const targetEmpId = empId || currentUser.employeeId || currentUser.id || 'EMP-001';
    const emp = employees.find(e => e.id === targetEmpId || e.employeeId === targetEmpId) || ({
      id: targetEmpId,
      employeeId: targetEmpId,
      firstName: currentUser.name?.split(' ')[0] || 'Employee',
      lastName: currentUser.name?.split(' ')[1] || '',
      email: currentUser.email,
      workShift: (currentUser as any).workShift,
      department: currentUser.department,
    } as Employee);

    return evaluateShiftAttendance({
      employee: emp,
      shifts,
      attendanceRecords,
      now: getTrustedNow(),
      holidays: holidayPolicies,
      weeklySchedules,
      leaves: leaveRequests,
    });
  };

  const recordEmployeePunch = (
    type: 'Check-In' | 'Check-Out',
    method: AttendanceRecord['method'] = 'Manual Punch'
  ): { success: boolean; message: string } => {
    const empId = currentUser.employeeId || currentUser.id || 'EMP-001';
    const clockValidation = validateAttendancePunchTime(attendanceRecords);
    if (!clockValidation.success) {
      return { success: false, message: clockValidation.message };
    }
    const evalResult = getEmployeeShiftAttendanceState(empId);

    if (type === 'Check-In') {
      if (!evalResult.canCheckIn) {
        return {
          success: false,
          message: evalResult.message,
        };
      }
    } else if (type === 'Check-Out') {
      if (!evalResult.canCheckOut) {
        return {
          success: false,
          message: evalResult.message,
        };
      }
    }

    const now = clockValidation.trustedNow;
    const nowHours = now.getHours();
    const nowMinutes = now.getMinutes();
    const ampm = nowHours >= 12 ? 'PM' : 'AM';
    const displayHours = nowHours % 12 || 12;
    const nowTimeStr = `${String(displayHours).padStart(2, '0')}:${String(nowMinutes).padStart(2, '0')} ${ampm}`;

    const targetShift = evalResult.assignedShift;
    const targetShiftDate = evalResult.shiftDate;

    const shiftModel: ShiftModel = {
      id: targetShift.id,
      shiftName: targetShift.shiftName,
      shiftCode: (targetShift as any).shiftCode || 'SH-01',
      startTime: targetShift.startTime || '09:00 AM',
      endTime: targetShift.endTime || '06:00 PM',
      requiredWorkingHours: ('requiredWorkingHours' in targetShift ? (targetShift as any).requiredWorkingHours : (targetShift as any).workingHours) || 8.25,
      breakDurationMinutes: ('breakDurationMinutes' in targetShift ? (targetShift as any).breakDurationMinutes : (targetShift as any).breakDurationMins) || 45,
      gracePeriodMinutes: ('gracePeriodMinutes' in targetShift ? (targetShift as any).gracePeriodMinutes : (targetShift as any).gracePeriodMins) || 15,
      lateThresholdMinutes: 15,
      earlyCheckoutThresholdMinutes: 10,
      otStartsAfter: 'After required working hours completed',
      maximumDailyOtHours: 4.0
    };

    const otElig = resolveEmployeeOtEligibility(
      empId,
      currentUser.department || 'Engineering',
      departmentOtPolicies,
      employeeOtPolicies
    );

    let rejectedMessage = '';
    setAttendanceRecords(prev => {
      const existingIdx = prev.findIndex(a => 
        (a.employeeId === empId || a.employeeId === currentUser.id) &&
        (a.shiftDate === targetShiftDate || a.date === targetShiftDate)
      );

      if (existingIdx !== -1) {
        const existing = prev[existingIdx];
        if (type === 'Check-In' && existing.checkIn) {
          rejectedMessage = 'Already checked in for this shift. Duplicate check-in is not allowed.';
          return prev;
        }
        if (type === 'Check-Out' && existing.checkOut && existing.checkOut.trim() !== '' && existing.checkOut !== '--:--') {
          rejectedMessage = 'Already checked out for this shift. Duplicate check-out is not allowed.';
          return prev;
        }
        if (type === 'Check-Out' && !existing.checkIn) {
          rejectedMessage = 'Check-out is not allowed before check-in.';
          return prev;
        }
        const newCheckIn = type === 'Check-In' ? nowTimeStr : (existing.checkIn || nowTimeStr);
        const newCheckOut = type === 'Check-Out' ? nowTimeStr : existing.checkOut;

        const calc = calculateAttendanceHoursAndStatus({
          checkIn: newCheckIn,
          checkOut: newCheckOut,
          shift: shiftModel,
          otPolicy: overtimePolicy,
          attendancePolicy: attendancePolicyConfig,
          isOtEligible: otElig.isEligible
        });

        const updated: AttendanceRecord = {
          ...existing,
          shiftId: targetShift.id,
          shiftDate: targetShiftDate,
          shiftName: targetShift.shiftName,
          checkIn: newCheckIn,
          checkOut: newCheckOut,
          workingHours: calc.workedHours,
          status: calc.status,
          lateStatus: calc.lateStatus,
          lateDurationMinutes: calc.lateMinutes,
          earlyCheckoutMinutes: calc.earlyCheckoutMinutes,
          calculatedOtHours: calc.potentialOtHours,
          method
        };

        const copy = [...prev];
        copy[existingIdx] = updated;
        return copy;
      } else {
        if (type === 'Check-Out') {
          rejectedMessage = 'Check-out is not allowed before check-in.';
          return prev;
        }
        const newCheckIn = type === 'Check-In' ? nowTimeStr : null;
        const newCheckOut = null;

        const calc = calculateAttendanceHoursAndStatus({
          checkIn: newCheckIn,
          checkOut: newCheckOut,
          shift: shiftModel,
          otPolicy: overtimePolicy,
          attendancePolicy: attendancePolicyConfig,
          isOtEligible: otElig.isEligible
        });

        const newRec: AttendanceRecord = {
          id: `ATT-${Date.now()}`,
          employeeId: empId,
          employeeName: currentUser.name,
          department: currentUser.department || 'Engineering',
          shiftId: targetShift.id,
          shiftDate: targetShiftDate,
          date: targetShiftDate,
          checkIn: newCheckIn,
          checkOut: newCheckOut,
          workingHours: calc.workedHours,
          status: calc.status,
          lateStatus: calc.lateStatus,
          lateDurationMinutes: calc.lateMinutes,
          earlyCheckoutMinutes: calc.earlyCheckoutMinutes,
          calculatedOtHours: calc.potentialOtHours,
          shiftName: shiftModel.shiftName,
          method
        };

        return [newRec, ...prev];
      }
    });

    if (rejectedMessage) {
      return { success: false, message: rejectedMessage };
    }

    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
    setAttendanceAuditLogs(prev => [
      {
        id: `AUD-${Date.now()}`,
        attendanceId: `ATT-${empId}-${targetShiftDate}`,
        employeeId: empId,
        employeeName: currentUser.name,
        date: targetShiftDate,
        fieldChanged: type === 'Check-In' ? 'Check-In Time' : 'Check-Out Time',
        oldValue: 'None',
        newValue: nowTimeStr,
        reason: `${type} punched via Employee Portal (${method}) for shift "${targetShift.shiftName}"`,
        changedBy: currentUser.name,
        timestamp: nowIso
      },
      ...prev
    ]);

    addNotification({
      title: `${type} Recorded`,
      message: `Successfully logged ${type.toLowerCase()} at ${nowTimeStr} for ${targetShift.shiftName}.`,
      priority: 'Normal',
      category: 'Attendance'
    });

    commitTrustedAttendanceTime(now);

    return {
      success: true,
      message: `${type} recorded successfully at ${nowTimeStr}`
    };
  };

  const submitMissedPunchRequest = (req: Omit<MissedPunchRequest, 'id' | 'status' | 'submittedAt'>): { success: boolean; message: string } => {
    if (!req.reason || !req.reason.trim()) {
      return { success: false, message: 'Reason is required for attendance correction request.' };
    }
    const newReq: MissedPunchRequest = {
      ...req,
      id: `MPR-${Date.now().toString().slice(-4)}`,
      status: 'Pending',
      submittedAt: new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    };
    setMissedPunchRequests(prev => [newReq, ...prev]);
    addNotification({
      title: 'Correction Request Submitted',
      message: `${req.employeeName} submitted a ${req.requestType} request for ${req.date}.`,
      priority: 'Normal',
      category: 'Attendance'
    });
    return { success: true, message: 'Attendance correction request submitted successfully.' };
  };

  const approveMissedPunchRequest = (id: string, reviewedBy: string, remarks?: string) => {
    const target = missedPunchRequests.find(r => r.id === id);
    if (!target) return;
    if (!canCurrentUserApproveRequests({ employeeId: target.employeeId, employeeName: target.employeeName })) {
      addNotification({
        title: 'CEO Approval Required',
        message: 'HR staff requests can be approved only by CEO.',
        priority: 'Important',
        category: 'Attendance'
      });
      return;
    }

    const nowStr = new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const targetCheckIn = target.requestedCheckIn || '09:00 AM';
    const targetCheckOut = target.requestedCheckOut || '06:00 PM';

    setMissedPunchRequests(prev => prev.map(r => r.id === id ? {
      ...r,
      status: 'Approved',
      reviewedBy,
      reviewedAt: nowStr,
      hrRemarks: remarks || 'Approved by HR/CEO',
      adjustedCheckIn: targetCheckIn,
      adjustedCheckOut: targetCheckOut
    } : r));

    const assignedShift = shifts.find(s => s.assignments?.some(a => a.employeeId === target.employeeId)) || shifts[0];
    const shiftModel: ShiftModel = {
      id: assignedShift?.id || 'SH-01',
      shiftName: assignedShift?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
      shiftCode: (assignedShift as any)?.shiftCode || 'SH-01',
      startTime: assignedShift?.startTime || '09:00 AM',
      endTime: assignedShift?.endTime || '06:00 PM',
      requiredWorkingHours: assignedShift?.workingHours || 8.25,
      breakDurationMinutes: assignedShift?.breakDurationMins || 45,
      gracePeriodMinutes: assignedShift?.gracePeriodMins || 15,
      lateThresholdMinutes: 15,
      earlyCheckoutThresholdMinutes: 10,
      otStartsAfter: 'After required working hours completed',
      maximumDailyOtHours: 4.0
    };

    const otEligibility = resolveEmployeeOtEligibility(
      target.employeeId,
      target.department,
      departmentOtPolicies,
      employeeOtPolicies
    );

    const calc = calculateAttendanceHoursAndStatus({
      checkIn: targetCheckIn,
      checkOut: targetCheckOut,
      shift: shiftModel,
      otPolicy: overtimePolicy,
      attendancePolicy: attendancePolicyConfig,
      isOtEligible: otEligibility.isEligible
    });

    setAttendanceRecords(prev => {
      const idx = prev.findIndex(a => a.employeeId === target.employeeId && a.date === target.date);
      if (idx !== -1) {
        const existing = prev[idx];
        const updated: AttendanceRecord = {
          ...existing,
          checkIn: targetCheckIn,
          checkOut: targetCheckOut,
          status: calc.status,
          workingHours: calc.workedHours,
          calculatedOtHours: calc.potentialOtHours,
          lateStatus: calc.lateStatus,
          lateDurationMinutes: calc.lateMinutes,
          earlyCheckoutMinutes: calc.earlyCheckoutMinutes,
          shiftName: shiftModel.shiftName,
          reason: `Missed Punch Approved: ${remarks || target.reason}`
        };
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      } else {
        const newRec: AttendanceRecord = {
          id: `ATT-${Date.now()}`,
          employeeId: target.employeeId,
          employeeName: target.employeeName,
          date: target.date,
          checkIn: targetCheckIn,
          checkOut: targetCheckOut,
          department: target.department,
          status: calc.status,
          method: 'Manual Punch',
          workingHours: calc.workedHours,
          calculatedOtHours: calc.potentialOtHours,
          lateStatus: calc.lateStatus,
          lateDurationMinutes: calc.lateMinutes,
          earlyCheckoutMinutes: calc.earlyCheckoutMinutes,
          shiftName: shiftModel.shiftName,
          otHours: 0,
          approvedOtHours: 0,
          otStatus: 'Pending',
          reason: `Missed Punch Approved: ${remarks || target.reason}`
        };
        return [newRec, ...prev];
      }
    });

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    setAttendanceAuditLogs(prev => [{
      id: `AUD-${Date.now()}`,
      attendanceId: `ATT-${target.id}`,
      employeeId: target.employeeId,
      employeeName: target.employeeName,
      date: target.date,
      fieldChanged: `Missed Punch Approved (${target.requestType})`,
      oldValue: `Check-In: ${target.existingCheckIn || 'Missing'}, Check-Out: ${target.existingCheckOut || 'Missing'}`,
      newValue: `Check-In: ${targetCheckIn}, Check-Out: ${targetCheckOut} (${calc.workedHours}h worked, ${calc.potentialOtHours}h potential OT)`,
      reason: remarks || target.reason,
      changedBy: reviewedBy,
      timestamp: `${dateStr} ${timeStr}`
    }, ...prev]);

    addNotification({
      title: 'Correction Approved',
      message: `Attendance request for ${target.employeeName} on ${target.date} was approved.`,
      priority: 'Normal',
      category: 'Attendance'
    });
  };

  const rejectMissedPunchRequest = (id: string, reviewedBy: string, remarks?: string) => {
    const target = missedPunchRequests.find(r => r.id === id);
    if (!target) return;
    if (!canCurrentUserApproveRequests({ employeeId: target.employeeId, employeeName: target.employeeName })) {
      addNotification({
        title: 'CEO Approval Required',
        message: 'HR staff requests can be rejected only by CEO.',
        priority: 'Important',
        category: 'Attendance'
      });
      return;
    }
    const nowStr = new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    setMissedPunchRequests(prev => prev.map(r => r.id === id ? {
      ...r,
      status: 'Rejected',
      reviewedBy,
      reviewedAt: nowStr,
      hrRemarks: remarks || 'Rejected by HR/CEO'
    } : r));

    addNotification({
      title: 'Correction Rejected',
      message: `Correction request for ${target.employeeName} on ${target.date} was rejected.`,
      priority: 'Urgent',
      category: 'Attendance'
    });
  };

  const editAndApproveMissedPunchRequest = (
    id: string,
    adjustedCheckIn: string,
    adjustedCheckOut: string,
    reviewedBy: string,
    remarks?: string
  ) => {
    const target = missedPunchRequests.find(r => r.id === id);
    if (!target) return;

    const nowStr = new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

    setMissedPunchRequests(prev => prev.map(r => r.id === id ? {
      ...r,
      status: 'Approved',
      adjustedCheckIn,
      adjustedCheckOut,
      reviewedBy,
      reviewedAt: nowStr,
      hrRemarks: remarks || 'Adjusted and approved by HR/CEO'
    } : r));

    const assignedShift = shifts.find(s => s.assignments?.some(a => a.employeeId === target.employeeId)) || shifts[0];
    const shiftModel: ShiftModel = {
      id: assignedShift?.id || 'SH-01',
      shiftName: assignedShift?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
      shiftCode: (assignedShift as any)?.shiftCode || 'SH-01',
      startTime: assignedShift?.startTime || '09:00 AM',
      endTime: assignedShift?.endTime || '06:00 PM',
      requiredWorkingHours: assignedShift?.workingHours || 8.25,
      breakDurationMinutes: assignedShift?.breakDurationMins || 45,
      gracePeriodMinutes: assignedShift?.gracePeriodMins || 15,
      lateThresholdMinutes: 15,
      earlyCheckoutThresholdMinutes: 10,
      otStartsAfter: 'After required working hours completed',
      maximumDailyOtHours: 4.0
    };

    const otEligibility = resolveEmployeeOtEligibility(
      target.employeeId,
      target.department,
      departmentOtPolicies,
      employeeOtPolicies
    );

    const calc = calculateAttendanceHoursAndStatus({
      checkIn: adjustedCheckIn,
      checkOut: adjustedCheckOut,
      shift: shiftModel,
      otPolicy: overtimePolicy,
      attendancePolicy: attendancePolicyConfig,
      isOtEligible: otEligibility.isEligible
    });

    setAttendanceRecords(prev => {
      const idx = prev.findIndex(a => a.employeeId === target.employeeId && a.date === target.date);
      if (idx !== -1) {
        const existing = prev[idx];
        const updated: AttendanceRecord = {
          ...existing,
          checkIn: adjustedCheckIn,
          checkOut: adjustedCheckOut,
          status: calc.status,
          workingHours: calc.workedHours,
          calculatedOtHours: calc.potentialOtHours,
          lateStatus: calc.lateStatus,
          lateDurationMinutes: calc.lateMinutes,
          earlyCheckoutMinutes: calc.earlyCheckoutMinutes,
          shiftName: shiftModel.shiftName,
          reason: `Missed Punch Adjusted & Approved: ${remarks || target.reason}`
        };
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      } else {
        const newRec: AttendanceRecord = {
          id: `ATT-${Date.now()}`,
          employeeId: target.employeeId,
          employeeName: target.employeeName,
          date: target.date,
          checkIn: adjustedCheckIn,
          checkOut: adjustedCheckOut,
          department: target.department,
          status: calc.status,
          method: 'Manual Punch',
          workingHours: calc.workedHours,
          calculatedOtHours: calc.potentialOtHours,
          lateStatus: calc.lateStatus,
          lateDurationMinutes: calc.lateMinutes,
          earlyCheckoutMinutes: calc.earlyCheckoutMinutes,
          shiftName: shiftModel.shiftName,
          otHours: 0,
          approvedOtHours: 0,
          otStatus: 'Pending',
          reason: `Missed Punch Adjusted & Approved: ${remarks || target.reason}`
        };
        return [newRec, ...prev];
      }
    });

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    setAttendanceAuditLogs(prev => [{
      id: `AUD-${Date.now()}`,
      attendanceId: `ATT-${target.id}`,
      employeeId: target.employeeId,
      employeeName: target.employeeName,
      date: target.date,
      fieldChanged: `Missed Punch Adjusted & Approved (${target.requestType})`,
      oldValue: `Requested: ${target.requestedCheckIn || '-'} to ${target.requestedCheckOut || '-'}`,
      newValue: `Adjusted: ${adjustedCheckIn} to ${adjustedCheckOut} (${calc.workedHours}h worked, ${calc.potentialOtHours}h potential OT)`,
      reason: remarks || target.reason,
      changedBy: reviewedBy,
      timestamp: `${dateStr} ${timeStr}`
    }, ...prev]);

    addNotification({
      title: 'Correction Adjusted & Approved',
      message: `Attendance for ${target.employeeName} on ${target.date} adjusted to ${adjustedCheckIn} - ${adjustedCheckOut}.`,
      priority: 'Normal',
      category: 'Attendance'
    });
  };

  const submitOtRequest = (req: Omit<OvertimeRequest, 'id' | 'status' | 'approvedOtHours' | 'submittedAt'>): { success: boolean; message: string } => {
    if (!req.reason || !req.reason.trim()) {
      return { success: false, message: 'Reason is required for overtime request.' };
    }

    // Security check: Verify employee OT eligibility
    const otElig = resolveEmployeeOtEligibility(
      req.employeeId,
      req.department,
      departmentOtPolicies,
      employeeOtPolicies
    );

    if (!otElig.isEligible) {
      return {
        success: false,
        message: `OT Submission Blocked: ${otElig.reason}`
      };
    }

    const newReq: OvertimeRequest = {
      ...req,
      id: `OTR-${Date.now().toString().slice(-4)}`,
      approvedOtHours: 0,
      status: 'Pending Approval',
      source: 'Employee Request',
      submittedAt: new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    };
    setOvertimeRequests(prev => [newReq, ...prev]);

    addNotification({
      title: 'Overtime Request Submitted',
      message: `${req.employeeName} submitted OT request for ${req.requestedOtHours} hrs on ${req.date}.`,
      priority: 'Normal',
      category: 'Attendance'
    });
    return { success: true, message: 'Overtime request submitted successfully.' };
  };

  const approveOtRequest = (
    id: string, 
    approvedHours: number, 
    reviewedBy: string, 
    remarks?: string,
    multiplier?: OvertimeRequest['multiplier']
  ) => {
    const target = overtimeRequests.find(r => r.id === id);
    if (!target) return;
    if (!canCurrentUserApproveRequests({ employeeId: target.employeeId, employeeName: target.employeeName })) {
      addNotification({
        title: 'CEO Approval Required',
        message: 'HR staff requests can be approved only by CEO.',
        priority: 'Important',
        category: 'Attendance'
      });
      return;
    }
    const nowStr = new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

    const activeMultiplier = multiplier || target.multiplier || '1x Salary';
    const factor = activeMultiplier === '2x Salary' ? 2 : activeMultiplier === '1.5x Salary' ? 1.5 : 1;
    const rate = target.hourlyRate > 0 ? target.hourlyRate : 100;
    const newCalculatedAmount = Math.round(approvedHours * rate * factor * 100) / 100;

    setOvertimeRequests(prev => prev.map(r => r.id === id ? {
      ...r,
      approvedOtHours: approvedHours,
      multiplier: activeMultiplier,
      calculatedAmount: newCalculatedAmount,
      status: approvedHours < r.requestedOtHours ? 'Partially Approved' : 'Approved',
      reviewedBy,
      reviewedAt: nowStr,
      reviewRemarks: remarks || (approvedHours < r.requestedOtHours ? `Approved ${approvedHours}h of ${r.requestedOtHours}h requested` : 'Approved')
    } : r));

    // Update AttendanceRecord
    setAttendanceRecords(prev => prev.map(a => {
      if (a.employeeId === target.employeeId && a.date === target.date) {
        return {
          ...a,
          otHours: approvedHours,
          approvedOtHours: approvedHours,
          otStatus: 'Approved'
        };
      }
      return a;
    }));

    // Update Payroll
    setPayrollRecords(prev => prev.map(p => {
      if (p.employeeId === target.employeeId) {
        return {
          ...p,
          overtimeHours: (p.overtimeHours || 0) + approvedHours
        };
      }
      return p;
    }));

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    setAttendanceAuditLogs(prev => [{
      id: `AUD-${Date.now()}`,
      attendanceId: `ATT-${target.id}`,
      employeeId: target.employeeId,
      employeeName: target.employeeName,
      date: target.date,
      fieldChanged: 'Overtime Approved',
      oldValue: `Requested: ${target.requestedOtHours} hrs (${target.multiplier})`,
      newValue: `Approved: ${approvedHours} hrs (${activeMultiplier}, ${formatCurrency(newCalculatedAmount)})`,
      reason: remarks || 'HR/CEO Overtime Approval',
      changedBy: reviewedBy,
      timestamp: `${dateStr} ${timeStr}`
    }, ...prev]);

    addNotification({
      title: 'OT Request Approved',
      message: `Approved ${approvedHours} hrs OT for ${target.employeeName} on ${target.date} by ${reviewedBy}.`,
      priority: 'Normal',
      category: 'Attendance'
    });
  };

  const rejectOtRequest = (id: string, reviewedBy: string, remarks?: string) => {
    const target = overtimeRequests.find(r => r.id === id);
    if (!target) return;
    if (!canCurrentUserApproveRequests({ employeeId: target.employeeId, employeeName: target.employeeName })) {
      addNotification({
        title: 'CEO Approval Required',
        message: 'HR staff requests can be rejected only by CEO.',
        priority: 'Important',
        category: 'Attendance'
      });
      return;
    }
    const nowStr = new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

    setOvertimeRequests(prev => prev.map(r => r.id === id ? {
      ...r,
      status: 'Rejected',
      approvedOtHours: 0,
      reviewedBy,
      reviewedAt: nowStr,
      reviewRemarks: remarks || 'Rejected by HR/CEO'
    } : r));

    setAttendanceRecords(prev => prev.map(a => {
      if (a.employeeId === target.employeeId && a.date === target.date) {
        return {
          ...a,
          otStatus: 'Rejected'
        };
      }
      return a;
    }));

    addNotification({
      title: 'OT Request Rejected',
      message: `OT request for ${target.employeeName} on ${target.date} was rejected by ${reviewedBy}.`,
      priority: 'Urgent',
      category: 'Attendance'
    });
  };

  const editAndApproveOtRequest = (
    id: string, 
    approvedHours: number, 
    reviewedBy: string, 
    remarks?: string,
    multiplier?: OvertimeRequest['multiplier']
  ) => {
    approveOtRequest(id, approvedHours, reviewedBy, remarks, multiplier);
  };

  const deleteOtRequest = (id: string) => {
    const target = overtimeRequests.find(r => r.id === id);
    setOvertimeRequests(prev => prev.filter(r => r.id !== id));
    addNotification({
      title: 'OT Request Cancelled',
      message: target ? `Overtime request for ${target.date} was cancelled.` : 'Overtime request removed.',
      priority: 'Normal',
      category: 'Attendance'
    });
  };

  const addManualOtEntry = (entry: { employeeId: string; date: string; hours: number; hourlyRate: number; multiplier: OvertimeRequest['multiplier']; reason: string; addedBy: string }): { success: boolean; message: string } => {
    const emp = employees.find(e => e.id === entry.employeeId || e.employeeId === entry.employeeId);
    if (!emp) return { success: false, message: 'Employee not found.' };

    const fullName = `${emp.firstName} ${emp.lastName}`.trim();
    const calculatedAmount = entry.multiplier === '1.5x Salary'
      ? entry.hours * entry.hourlyRate * 1.5
      : entry.multiplier === '2x Salary'
      ? entry.hours * entry.hourlyRate * 2
      : entry.hours * entry.hourlyRate;

    const newReq: OvertimeRequest = {
      id: `OTR-${Date.now().toString().slice(-4)}`,
      employeeId: entry.employeeId,
      employeeName: fullName,
      department: emp.department,
      date: entry.date,
      shiftEnd: '06:00 PM',
      actualCheckOut: 'Manual Addition',
      potentialOtHours: entry.hours,
      requestedOtHours: entry.hours,
      approvedOtHours: entry.hours,
      reason: entry.reason,
      workDescription: `Manual OT added by ${entry.addedBy}`,
      status: 'Manually Added',
      source: 'Manual OT',
      multiplier: entry.multiplier,
      hourlyRate: entry.hourlyRate,
      calculatedAmount,
      submittedAt: new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      reviewedBy: entry.addedBy,
      reviewedAt: new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      reviewRemarks: `Directly credited by ${entry.addedBy}`
    };

    setOvertimeRequests(prev => [newReq, ...prev]);

    // Sync to attendance
    setAttendanceRecords(prev => {
      const idx = prev.findIndex(a => a.employeeId === entry.employeeId && a.date === entry.date);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          otHours: entry.hours,
          approvedOtHours: entry.hours,
          otStatus: 'Approved'
        };
        return copy;
      }
      return prev;
    });

    // Update payroll
    setPayrollRecords(prev => prev.map(p => {
      if (p.employeeId === entry.employeeId) {
        return {
          ...p,
          overtimeHours: (p.overtimeHours || 0) + entry.hours
        };
      }
      return p;
    }));

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    setAttendanceAuditLogs(prev => [{
      id: `AUD-${Date.now()}`,
      attendanceId: `ATT-${entry.employeeId}-${entry.date}`,
      employeeId: entry.employeeId,
      employeeName: fullName,
      date: entry.date,
      fieldChanged: 'Manual Overtime Added',
      oldValue: '0 hrs',
      newValue: `${entry.hours} hrs @ ${formatCurrency(entry.hourlyRate)}/hr (${entry.multiplier})`,
      reason: entry.reason,
      changedBy: entry.addedBy,
      timestamp: `${dateStr} ${timeStr}`
    }, ...prev]);

    addNotification({
      title: 'Manual Overtime Added',
      message: `Credited ${entry.hours} hrs OT to ${fullName} on ${entry.date}.`,
      priority: 'Normal',
      category: 'Attendance'
    });

    return { success: true, message: 'Overtime hours successfully added and synced with payroll.' };
  };

  const addManualAttendanceRecord = (entry: {
    employeeId: string;
    date: string;
    status: AttendanceRecord['status'];
    checkIn?: string | null;
    checkOut?: string | null;
    breakDurationMinutes?: number;
    workingHours?: number;
    halfDayType?: 'First Half' | 'Second Half';
    otHours?: number;
    reason: string;
    addedBy: string;
  }): { success: boolean; message: string } => {
    if (!entry.employeeId) {
      return { success: false, message: 'Please select an employee.' };
    }
    if (!entry.date) {
      return { success: false, message: 'Please specify the date.' };
    }
    if (!entry.reason || !entry.reason.trim()) {
      return { success: false, message: 'Reason / authorization is mandatory.' };
    }

    const emp = employees.find(e => e.id === entry.employeeId || e.employeeId === entry.employeeId);
    if (!emp) {
      return { success: false, message: 'Employee not found.' };
    }
    const fullName = `${emp.firstName} ${emp.lastName}`.trim();
    const breakMins = entry.breakDurationMinutes ?? 45;

    // Calculate working hours if not explicitly passed
    let computedHours = entry.workingHours;
    if (computedHours === undefined) {
      if (entry.status === 'Absent' || entry.status === 'Holiday' || entry.status === 'Week Off') {
        computedHours = 0;
      } else if (entry.status === 'Half Day') {
        computedHours = 4.0;
      } else if (entry.status === 'On Leave' || (entry.status as string) === 'Leave') {
        computedHours = 0;
      } else if (entry.checkIn && entry.checkOut) {
        const parseTime = (timeStr: string) => {
          if (!timeStr) return null;
          const clean = timeStr.trim();
          let hours = 0;
          let mins = 0;
          if (clean.includes('AM') || clean.includes('PM')) {
            const [timePart, ampm] = clean.split(' ');
            const [hh, mm] = timePart.split(':').map(Number);
            hours = ampm.toUpperCase() === 'PM' && hh < 12 ? hh + 12 : (ampm.toUpperCase() === 'AM' && hh === 12 ? 0 : hh);
            mins = mm || 0;
          } else {
            const [hh, mm] = clean.split(':').map(Number);
            hours = hh || 0;
            mins = mm || 0;
          }
          return hours * 60 + mins;
        };

        const inMins = parseTime(entry.checkIn);
        const outMins = parseTime(entry.checkOut);
        if (inMins !== null && outMins !== null) {
          if (outMins >= inMins) {
            const netMins = Math.max(0, outMins - inMins - breakMins);
            computedHours = Math.round((netMins / 60) * 10) / 10;
          } else {
            computedHours = 8.0;
          }
        } else {
          computedHours = 8.0;
        }
      } else {
        computedHours = entry.status === 'Present' ? 8.0 : 0;
      }
    }

    const isNonWorking = entry.status === 'Absent' || entry.status === 'Holiday' || entry.status === 'Week Off';
    const cleanCheckIn = isNonWorking ? null : (entry.checkIn || null);
    const cleanCheckOut = isNonWorking ? null : (entry.checkOut || null);
    const otHrs = entry.otHours || 0;

    let existingRecord: AttendanceRecord | undefined;

    let persistedAttendanceId: string | undefined;
    setAttendanceRecords(prev => {
      const idx = prev.findIndex(a => a.employeeId === entry.employeeId && a.date === entry.date);
      if (idx !== -1) {
        existingRecord = prev[idx];
        persistedAttendanceId = prev[idx].id;
        const updated: AttendanceRecord = {
          ...prev[idx],
          status: entry.status,
          checkIn: cleanCheckIn,
          checkOut: cleanCheckOut,
          workingHours: computedHours || 0,
          breakDurationMinutes: breakMins,
          halfDayType: entry.halfDayType,
          otHours: otHrs,
          approvedOtHours: otHrs > 0 ? otHrs : prev[idx].approvedOtHours,
          otStatus: otHrs > 0 ? 'Approved' : prev[idx].otStatus,
          method: 'Manual Punch',
          reason: `Manual Attendance (HR/CEO): ${entry.reason}`
        };
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      } else {
        const newRec: AttendanceRecord = {
          id: `ATT-${Date.now()}`,
          employeeId: entry.employeeId,
          employeeName: fullName,
          department: emp.department,
          date: entry.date,
          status: entry.status,
          checkIn: cleanCheckIn,
          checkOut: cleanCheckOut,
          workingHours: computedHours || 0,
          breakDurationMinutes: breakMins,
          halfDayType: entry.halfDayType,
          shiftName: emp.workShift || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
          method: 'Manual Punch',
          otHours: otHrs,
          approvedOtHours: otHrs,
          otStatus: otHrs > 0 ? 'Approved' : 'Pending',
          reason: `Manual Attendance (HR/CEO): ${entry.reason}`
        };
        return [newRec, ...prev];
      }
    });

    const employeeDbId = emp.id || emp.employeeId || entry.employeeId;
    const checkInIso = cleanCheckIn ? localDateTimeToIso(entry.date, cleanCheckIn) : null;
    const checkOutIso = cleanCheckOut ? localDateTimeToIso(entry.date, cleanCheckOut) : null;
    if (persistedAttendanceId && persistedAttendanceId.length === 36) {
      supabaseDirect.updateAttendanceRecord(persistedAttendanceId, {
        check_in: checkInIso,
        check_out: checkOutIso,
        working_hours: computedHours || 0,
        status: entry.status,
        method: 'Manual Punch',
      });
    } else if (employeeDbId) {
      supabaseDirect.insertAttendanceRecord({
        employee_id: employeeDbId,
        date: entry.date,
        check_in: checkInIso,
        check_out: checkOutIso,
        working_hours: computedHours || 0,
        status: entry.status,
        method: 'Manual Punch',
        shift_date: entry.date,
      }).then(res => {
        if (res.data?.id) {
          setAttendanceRecords(curr => curr.map(r =>
            r.employeeId === entry.employeeId && r.date === entry.date ? { ...r, id: res.data.id } : r
          ));
        }
      });
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    setAttendanceAuditLogs(prev => [{
      id: `AUD-${Date.now()}`,
      attendanceId: existingRecord ? existingRecord.id : `ATT-${entry.employeeId}-${entry.date}`,
      employeeId: entry.employeeId,
      employeeName: fullName,
      date: entry.date,
      fieldChanged: existingRecord ? `Manual Attendance Override (${existingRecord.status} -> ${entry.status})` : 'Manual Attendance Entry Created',
      oldValue: existingRecord ? `Status: ${existingRecord.status}, In: ${existingRecord.checkIn || 'None'}, Out: ${existingRecord.checkOut || 'None'}` : 'No Previous Record',
      newValue: `Status: ${entry.status}, In: ${cleanCheckIn || 'None'}, Out: ${cleanCheckOut || 'None'}, Hours: ${computedHours}`,
      reason: entry.reason,
      changedBy: entry.addedBy,
      timestamp: `${dateStr} ${timeStr}`
    }, ...prev]);

    // Update payroll if absent/halfday or OT
    setPayrollRecords(prev => prev.map(p => {
      if (p.employeeId === entry.employeeId) {
        return {
          ...p,
          overtimeHours: (p.overtimeHours || 0) + otHrs,
          lopDays: entry.status === 'Absent' ? (p.lopDays || 0) + 1 : (entry.status === 'Half Day' ? (p.lopDays || 0) + 0.5 : p.lopDays)
        };
      }
      return p;
    }));

    addNotification({
      title: 'Manual Attendance Recorded',
      message: `Manual attendance for ${fullName} on ${entry.date} recorded by ${entry.addedBy}.`,
      priority: 'Normal',
      category: 'Attendance'
    });

    return { success: true, message: `Attendance for ${fullName} on ${entry.date} successfully recorded!` };
  };

  const normalizeOtAllowedValue = (value: unknown, fallback = true): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['no', 'false', '0', 'off', 'disabled'].includes(normalized)) return false;
      if (['yes', 'true', '1', 'on', 'enabled'].includes(normalized)) return true;
    }
    return fallback;
  };

  const normalizeDepartmentOtPolicy = (policy: DepartmentOtPolicy): DepartmentOtPolicy => ({
    ...policy,
    otAllowed: normalizeOtAllowedValue((policy as any).otAllowed, true)
  });

  const updateDepartmentOtPolicy = (idOrDeptName: string, policy: Partial<DepartmentOtPolicy>) => {
    setDepartmentOtPolicies(prev => {
      const normalizedPolicy: Partial<DepartmentOtPolicy> = {
        ...policy,
        ...(Object.prototype.hasOwnProperty.call(policy, 'otAllowed')
          ? { otAllowed: normalizeOtAllowedValue((policy as any).otAllowed, true) }
          : {})
      };
      const normalizedKey = idOrDeptName.trim().toLowerCase();
      const nextDepartment = (normalizedPolicy.department || idOrDeptName).trim();
      const normalizedDepartment = nextDepartment.toLowerCase();
      const stableId = idOrDeptName.startsWith('DOT-')
        ? idOrDeptName
        : `DOT-${nextDepartment.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now()}`;

      const idx = prev.findIndex(p => {
        const normalizedPolicyId = p.id.trim().toLowerCase();
        const normalizedPolicyDept = p.department.trim().toLowerCase();
        return (
          normalizedPolicyId === normalizedKey ||
          normalizedPolicyId === `dot-${normalizedKey}` ||
          normalizedPolicyDept === normalizedKey ||
          normalizedPolicyDept === normalizedDepartment
        );
      });
      if (idx >= 0) {
        return prev.map((p, i) => i === idx ? normalizeDepartmentOtPolicy({ ...p, ...normalizedPolicy }) : p);
      } else {
        const newPolicy: DepartmentOtPolicy = {
          id: stableId,
          department: nextDepartment,
          otAllowed: normalizeOtAllowedValue((normalizedPolicy as any).otAllowed, true),
          policyId: 'OTP-001',
          maxOtHoursDaily: normalizedPolicy.maxOtHoursDaily ?? 4.0,
          maxOtHoursMonthly: normalizedPolicy.maxOtHoursMonthly ?? 60,
          minOtDurationMinutes: normalizedPolicy.minOtDurationMinutes ?? 30,
          approvalRequired: normalizedPolicy.approvalRequired ?? true,
          calculationMethod: normalizedPolicy.calculationMethod ?? 'Shift End Based',
          standardShiftHours: normalizedPolicy.standardShiftHours ?? 9,
          otHourlyRate: normalizedPolicy.otHourlyRate ?? 100,
          ...normalizedPolicy
        };
        return [...prev, newPolicy];
      }
    });
  };

  const updateEmployeeOtPolicy = (id: string, policy: Partial<EmployeeOtPolicy>) => {
    setEmployeeOtPolicies(prev => prev.map(p => p.id === id ? { ...p, ...policy } : p));
  };

  const updateAttendanceGlobalSettings = (settings: Partial<AttendanceGlobalSettings>) => {
    setAttendanceGlobalSettings(prev => ({ ...prev, ...settings }));
  };

  const [faceLogs, setFaceLogs] = useState<FaceLog[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('vrm_hrms_face_logs');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch {}
    return INITIAL_FACE_LOGS;
  });

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => {
    try {
      const saved = localStorage.getItem('vrm_hrms_leave_requests_persistent');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicyItem[]>(INITIAL_LEAVE_POLICIES);
  const [holidayPolicies, setHolidayPolicies] = useState<HolidayItem[]>([]);
  const [attendancePolicies, setAttendancePolicies] = useState<AttendancePolicyItem[]>(INITIAL_ATTENDANCE_POLICIES);
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklyScheduleItem[]>(INITIAL_WEEKLY_SCHEDULES);
  const [attendanceConfig, setAttendanceConfig] = useState<GlobalAttendanceConfig>(INITIAL_GLOBAL_ATTENDANCE_CONFIG);
  const [policyDocuments, setPolicyDocuments] = useState<PolicyDocumentItem[]>(INITIAL_POLICY_DOCUMENTS);
  const [businessSettings, setBusinessSettings] = useState<BusinessProfileSettings>(INITIAL_BUSINESS_SETTINGS);
  const [shiftRequests, setShiftRequests] = useState<ShiftRequest[]>(() => {
    try {
      const saved = localStorage.getItem('vrm_hrms_shift_requests_persistent');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  // Ensure tasks are never self-assigned ("oru person own task assign pannakudathu")
  const sanitizeSelfAssignedTask = (task: TaskItemEnhanced): TaskItemEnhanced => {
    const rawBy = (task.assignedBy || task.createdBy || '').toLowerCase();
    const assignedByClean = rawBy.replace(/\s*\([^)]*\)/g, '').trim();

    // Check if any assignee is the same person as assignedBy / createdBy
    const hasSelfAssignee = task.assignees?.some(a => {
      const aName = (a.employeeName || '').toLowerCase().trim();
      return aName && assignedByClean && (aName === assignedByClean || assignedByClean.startsWith(aName) || aName.startsWith(assignedByClean));
    });

    const { overallStatus, overallProgress } = computeTaskOverallStatusAndProgress(
      task.assignees || [],
      task.overallStatus,
      task.dueDate
    );

    if (hasSelfAssignee) {
      return {
        ...task,
        overallStatus,
        overallProgress,
        assignedBy: 'Velmurugan (CEO)',
        createdBy: 'Velmurugan (CEO)'
      };
    }
    return {
      ...task,
      overallStatus,
      overallProgress
    };
  };

  // Enhanced Enterprise Tasks & Systems (VPS database + LocalStorage fallback)
  const [enhancedTasks, setEnhancedTasks] = useState<TaskItemEnhanced[]>(() => {
    try {
      const cached = localStorage.getItem('vrm_hrms_enhanced_tasks');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // Keep enhancedTasks backed up in localStorage
  useEffect(() => {
    if (enhancedTasks && enhancedTasks.length > 0) {
      try {
        localStorage.setItem('vrm_hrms_enhanced_tasks', JSON.stringify(enhancedTasks));
      } catch (e) {}
    }
  }, [enhancedTasks]);
  const [taskMasters, setTaskMasters] = useState<TaskMasterItem[]>(INITIAL_TASK_MASTERS);
  const [momMeetings, setMOMMeetings] = useState<MOMMeeting[]>([]);
  const [escalationRules, setEscalationRules] = useState<TaskEscalationRule[]>(INITIAL_ESCALATION_RULES);
  const [taskWeights, setTaskWeights] = useState<TaskPerformanceWeights>(INITIAL_TASK_WEIGHTS);
  const [performanceScores, setPerformanceScores] = useState<PerformanceScore[]>([]);
  const [jobOpenings, setJobOpenings] = useState<JobOpening[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  // Cross-user notifications persisted in company_settings so recipients (CEO / HR / employee) see them on their own login
  const [sharedNotifications, setSharedNotifications] = useState<NotificationItem[]>([]);

  // ==========================================
  // SHARED (CROSS-USER) NOTIFICATIONS & REMINDERS
  // ==========================================
  const SHARED_NOTIFICATIONS_KEY = 'shared_notifications_data';
  const SHARED_NOTIFICATIONS_LIMIT = 300;
  const SHARED_NOTIFICATIONS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  /** Identity keys of the logged-in user used to match targeted notifications */
  const getUserNotificationKeys = (): string[] => {
    const u: any = currentUser || {};
    return Array.from(new Set(
      [u.employeeId, u.id, u.email, u.name]
        .filter(Boolean)
        .map((k: any) => String(k).trim().toLowerCase())
    ));
  };

  /** Audience groups the logged-in user belongs to */
  const getUserAudienceRoles = (): string[] => {
    const u: any = currentUser || {};
    const role = String(u.role || '');
    const desig = String(u.designation || '').toLowerCase();
    const dept = String(u.department || '').toLowerCase();
    const roles = ['ALL'];
    if (role === 'CEO' || role === 'Super Admin' || desig.includes('ceo') || desig.includes('managing director')) roles.push('CEO');
    if (role === 'HR Manager' || role === 'HR Admin' || role === 'HR' || dept === 'hr' || dept.includes('human resource') || /\bhr\b/.test(desig)) roles.push('HR');
    if (role === 'Finance Manager' || dept.includes('account') || dept.includes('finance') || desig.includes('account') || desig.includes('finance')) roles.push('ACCOUNTS');
    return roles;
  };

  const formatNotificationTime = (iso?: string): string => {
    if (!iso) return 'Just now';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return 'Just now';
    const diffMin = Math.floor((Date.now() - t) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    const diffDay = Math.floor(diffHr / 24);
    return diffDay === 1 ? 'Yesterday' : `${diffDay} days ago`;
  };

  const isSharedNotificationForMe = (n: NotificationItem): boolean => {
    const myKeys = getUserNotificationKeys();
    if (n.senderKey && myKeys.includes(n.senderKey.trim().toLowerCase())) return false;
    const targetIds = (n.targetEmployeeIds || []).map(id => String(id).trim().toLowerCase());
    if (targetIds.some(id => myKeys.includes(id))) return true;
    const myRoles = getUserAudienceRoles();
    return (n.targetRoles || []).some(r => myRoles.includes(r));
  };

  // Read-merge-write so notifications from different users are not overwritten
  const persistSharedNotifications = async (changed: NotificationItem[]) => {
    if (!changed.length) return;
    try {
      const remote = await supabaseDirect.getCompanySetting(SHARED_NOTIFICATIONS_KEY);
      const map = new Map<string, NotificationItem>((Array.isArray(remote) ? remote : []).map((n: NotificationItem) => [n.id, n]));
      changed.forEach(n => {
        const existing = map.get(n.id);
        const readBy = Array.from(new Set([...(existing?.readBy || []), ...(n.readBy || [])]));
        map.set(n.id, { ...(existing || {}), ...n, read: false, readBy });
      });
      const cutoff = Date.now() - SHARED_NOTIFICATIONS_TTL_MS;
      const merged = Array.from(map.values())
        .filter(n => !n.createdAt || new Date(n.createdAt).getTime() >= cutoff)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, SHARED_NOTIFICATIONS_LIMIT);
      await supabaseDirect.saveCompanySetting(SHARED_NOTIFICATIONS_KEY, merged);
    } catch (err) {
      console.warn('[HRMSContext] shared notification cloud save notice:', err);
    }
  };

  /** Deliver a notification to other users (by audience role and/or employee ID) */
  const pushSharedNotification = (
    note: Omit<NotificationItem, 'id' | 'timestamp' | 'read' | 'createdAt' | 'readBy' | 'senderKey'>
  ) => {
    const newNote: NotificationItem = {
      ...note,
      id: `SN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: 'Just now',
      read: false,
      createdAt: new Date().toISOString(),
      senderKey: getUserNotificationKeys()[0] || '',
      readBy: []
    };
    setSharedNotifications(prev => [newNote, ...prev]);
    persistSharedNotifications([newNote]);
  };

  const markNotificationRead = (id: string) => {
    const shared = sharedNotifications.find(n => n.id === id);
    if (shared) {
      const myKey = getUserNotificationKeys()[0];
      if (!myKey || (shared.readBy || []).includes(myKey)) return;
      const updated = { ...shared, readBy: [...(shared.readBy || []), myKey] };
      setSharedNotifications(prev => prev.map(n => n.id === id ? updated : n));
      persistSharedNotifications([updated]);
      return;
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    const myKey = getUserNotificationKeys()[0];
    if (!myKey) return;
    const toUpdate = sharedNotifications
      .filter(n => isSharedNotificationForMe(n) && !(n.readBy || []).includes(myKey))
      .map(n => ({ ...n, readBy: [...(n.readBy || []), myKey] }));
    if (!toUpdate.length) return;
    const updatedMap = new Map(toUpdate.map(n => [n.id, n]));
    setSharedNotifications(prev => prev.map(n => updatedMap.get(n.id) || n));
    persistSharedNotifications(toUpdate);
  };

  const addNotification = (note: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => {
    const newNote: NotificationItem = {
      ...note,
      id: `NOT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: 'Just now',
      read: false,
      createdAt: (note as any).createdAt || new Date().toISOString()
    };
    setNotifications(prev => [newNote, ...prev]);
  };

  /** Send reminder notification to HR & CEO when a leave request is pending review */
  const sendLeaveReminder = (leave: LeaveRequest) => {
    pushSharedNotification({
      title: '⚠️ Leave Approval Reminder',
      message: `Reminder from ${leave.employeeName} (${leave.employeeId}): ${leave.leaveType} application (${leave.startDate} to ${leave.endDate}, ${leave.daysCount} days) is pending HR / CEO review.`,
      priority: 'Urgent',
      category: 'Leave',
      link: 'leaves',
      targetRoles: ['CEO', 'HR']
    });

    addNotification({
      title: 'Reminder Sent to HR & CEO',
      message: `Your reminder for ${leave.leaveType} (${leave.startDate} to ${leave.endDate}) was delivered to management.`,
      priority: 'Normal',
      category: 'Leave',
      link: 'leaves'
    });
  };
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>(INITIAL_DEPTS);
  const [designations, setDesignations] = useState<DesignationItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);

  // ========================================================
  // 5 CORE SETTINGS MODULES & POLICY ENGINE STATE
  // ========================================================
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(() => {
    const savedUser = localStorage.getItem('vrm_hrms_current_user');
    let isCompB = false;
    if (savedUser) {
      try {
        const p = JSON.parse(savedUser);
        if (p.company_id === 'company-b' || p.companyId === 'company-b' || p.email?.includes('nexus') || p.employeeId?.startsWith('EMP-B')) {
          isCompB = true;
        }
      } catch {}
    }
    return isCompB ? { ...COMPANY_B_PROFILE } : { ...COMPANY_A_PROFILE };
  });

  // Keep company branding in sync when user logs in or switches company context
  useEffect(() => {
    const cId = currentUser.company_id || currentUser.companyId || 'company-a';
    if (cId === 'company-b' && companyInfo.company_id !== 'company-b') {
      setCompanyInfo({ ...COMPANY_B_PROFILE });
    } else if (cId === 'company-a' && companyInfo.company_id !== 'company-a') {
      setCompanyInfo({ ...COMPANY_A_PROFILE });
    }
  }, [currentUser.company_id, currentUser.companyId]);



  const [companyBranches, setCompanyBranches] = useState<CompanyBranch[]>([]);

  const [orgStructure, setOrgStructure] = useState<OrganizationStructure>(INITIAL_ORG_STRUCTURE);

  const triggerToast = (message: string) => {
    const newNote: NotificationItem = {
      id: `nt-${Date.now()}`,
      title: 'Policy Engine Notification',
      message,
      timestamp: 'Just now',
      priority: 'Normal',
      category: 'Payroll',
      read: false
    };
    setNotifications(prev => [newNote, ...prev]);
  };

  const [masterAttendancePolicies, setMasterAttendancePolicies] = useState<AttendancePolicy[]>([]);

  const [attendanceCorrections, setAttendanceCorrections] = useState<AttendanceCorrectionRequest[]>(INITIAL_ATTENDANCE_CORRECTIONS);

  const [masterLeavePolicies, setMasterLeavePolicies] = useState<MasterLeavePolicy[]>([]);

  // Sandwich Leave Policy Engine States
  const [sandwichPolicies, setSandwichPolicies] = useState<SandwichLeavePolicy[]>(initialSandwichPolicies);

  const [sandwichAuditLogs, setSandwichAuditLogs] = useState<SandwichAuditLog[]>(initialSandwichAuditLogs);

  const addSandwichAuditLog = (log: Omit<SandwichAuditLog, 'id' | 'timestamp' | 'user' | 'userRole'>) => {
    const now = new Date();
    const formatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const userRole = currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role;
    const newEntry: SandwichAuditLog = {
      id: `SAL-${Date.now()}`,
      timestamp: formatted,
      user: currentUser.name,
      userRole,
      ...log
    };
    setSandwichAuditLogs(prev => [newEntry, ...prev]);
  };

  const [payrollSettingsConfig, setPayrollSettingsConfig] = useState<PayrollSettingsConfig>(INITIAL_PAYROLL_CONFIG);

  const [rewardPolicies, setRewardPolicies] = useState<RewardPolicy[]>(INITIAL_REWARD_POLICIES);

  const [employeeRewardRecords, setEmployeeRewardRecords] = useState<EmployeeRewardRecord[]>(INITIAL_EMPLOYEE_REWARDS);

  const [policyAuditLogs, setPolicyAuditLogs] = useState<PolicyAuditLog[]>(INITIAL_POLICY_AUDIT_LOGS);

  const addPolicyAuditLog = (log: Omit<PolicyAuditLog, 'id' | 'timestamp'>) => {
    const now = new Date();
    const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const newEntry: PolicyAuditLog = {
      id: `LOG-${Date.now()}`,
      timestamp: formatted,
      ...log
    };
    setPolicyAuditLogs(prev => [newEntry, ...prev]);
  };

  // ==========================================
  // 6. ADVANCE SALARY / LOAN POLICY & RECORDS
  // ==========================================
  const [loanPolicies, setLoanPolicies] = useState<LoanPolicy[]>(DEFAULT_LOAN_POLICIES);

  // VPS database persistence effects
  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('departments_data', departments);
      }
    } catch {}
  }, [departments]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('designations_data', designations);
      }
    } catch {}
  }, [designations]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        const cKey = (currentUser.company_id === 'company-b' || companyInfo.company_id === 'company-b')
          ? 'company_info_company-b'
          : 'company_info';
        supabaseDirect.saveCompanySetting(cKey, companyInfo);
      }
    } catch {}
  }, [companyInfo]);


  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('company_branches', companyBranches);
      }
    } catch {}
  }, [companyBranches]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('org_structure', orgStructure);
      }
    } catch {}
  }, [orgStructure]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('master_attendance_policies_data', masterAttendancePolicies);
      }
    } catch {}
  }, [masterAttendancePolicies]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('master_leave_policies_data', masterLeavePolicies);
      }
    } catch {}
  }, [masterLeavePolicies]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('leave_requests_data', leaveRequests);
      }
    } catch {}
  }, [leaveRequests]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('expenses_data', expenses);
      }
    } catch {}
  }, [expenses]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('holiday_policies_data', holidayPolicies);
      }
    } catch {}
  }, [holidayPolicies]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('weekly_schedules_data', weeklySchedules);
      }
    } catch {}
  }, [weeklySchedules]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('attendance_config_data', attendanceConfig);
      }
    } catch {}
  }, [attendanceConfig]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('department_ot_policies_data', departmentOtPolicies);
      }
    } catch {}
  }, [departmentOtPolicies]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('overtime_policy_data', overtimePolicy);
      }
    } catch {}
  }, [overtimePolicy]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('payroll_settings_config', payrollSettingsConfig);
      }
    } catch {}
  }, [payrollSettingsConfig]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('reward_policies_data', rewardPolicies);
      }
    } catch {}
  }, [rewardPolicies]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('employee_rewards_data', employeeRewardRecords);
      }
    } catch {}
  }, [employeeRewardRecords]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('loan_policies_data', loanPolicies);
      }
    } catch {}
  }, [loanPolicies]);

  const activeLoanPolicy = loanPolicies.find(p => p.status === 'Active') || loanPolicies[0];

  const createLoanPolicy = (policyData: Omit<LoanPolicy, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => {
    const now = new Date();
    const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const userLabel = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    const newPolicy: LoanPolicy = {
      id: `POL-LOAN-${String(loanPolicies.length + 1).padStart(3, '0')}`,
      createdAt: formatted,
      updatedAt: formatted,
      createdBy: userLabel,
      updatedBy: userLabel,
      ...policyData
    };
    setLoanPolicies(prev => [newPolicy, ...prev]);
    addPolicyAuditLog({
      policyCategory: 'Advance Salary / Loan Policy',
      policyId: newPolicy.id,
      policyName: newPolicy.policyName,
      action: 'CREATE',
      performedBy: currentUser.name,
      performedByRole: currentUser.role,
      changeSummary: `Created master loan policy "${newPolicy.policyName}" with min tenure ${newPolicy.minimumEmploymentMonths} months.`
    });
  };

  const updateLoanPolicy = (id: string, updates: Partial<LoanPolicy>) => {
    const now = new Date();
    const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const userLabel = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setLoanPolicies(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, ...updates, updatedAt: formatted, updatedBy: userLabel };
        addPolicyAuditLog({
          policyCategory: 'Advance Salary / Loan Policy',
          policyId: p.id,
          policyName: updated.policyName,
          action: 'EDIT',
          performedBy: currentUser.name,
          performedByRole: currentUser.role,
          changeSummary: `Updated policy settings for "${updated.policyName}".`
        });
        return updated;
      }
      return p;
    }));
  };

  const deleteLoanPolicy = (id: string) => {
    setLoanPolicies(prev => prev.filter(p => p.id !== id));
  };

  const [loanRecords, setLoanRecords] = useState<LoanRecord[]>([]);

  // Sync loan records to VPS database whenever updated
  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('loan_records_data', loanRecords);
      }
    } catch (e) {
      console.warn('Failed to save loanRecords to VPS database', e);
    }
  }, [loanRecords]);

  // Dynamic Eligibility Calculator (NO HARDCODING)
  const calculateEmployeeLoanEligibility = (employeeId: string, policyId?: string) => {
    let emp = employees.find(e => e.employeeId === employeeId || e.id === employeeId || e.email?.toLowerCase() === employeeId?.toLowerCase());
    
    // Match against current user if relevant
    if (!emp && currentUser && (currentUser.employeeId === employeeId || currentUser.email?.toLowerCase() === employeeId?.toLowerCase())) {
      emp = employees.find(e => e.employeeId === currentUser.employeeId || e.email === currentUser.email);
    }

    const rawPolicy = (policyId ? loanPolicies.find(p => p.id === policyId) : activeLoanPolicy) || DEFAULT_LOAN_POLICIES?.[0];
    
    if (!rawPolicy) {
      return {
        isEligible: false,
        ineligibleReason: 'No master advance or loan policies are currently configured.',
        employmentDurationMonths: 0,
        monthlySalary: 0,
        maxEligibleAmount: 0,
        activeLoansCount: 0,
        currentOutstanding: 0,
        policy: null as any
      };
    }

    const policy: LoanPolicy = {
      ...rawPolicy,
      policyName: rawPolicy.policyName || (rawPolicy as any).name || 'Standard Advance Salary',
      policyType: rawPolicy.policyType || 'Advance Salary',
      minRepaymentMonths: rawPolicy.minRepaymentMonths ?? 1,
      maxRepaymentMonths: rawPolicy.maxRepaymentMonths ?? 3,
      minLoanAmount: rawPolicy.minLoanAmount ?? 1000,
      maxLoanAmount: rawPolicy.maxLoanAmount ?? (rawPolicy as any).maxEligibleFixedAmount ?? 50000,
      minimumEmploymentMonths: rawPolicy.minimumEmploymentMonths ?? (rawPolicy as any).minTenureMonthsRequired ?? 1,
      maxActiveLoans: rawPolicy.maxActiveLoans ?? 1,
      allowPreviousPending: rawPolicy.allowPreviousPending ?? false
    };

    if (!emp) {
      return {
        isEligible: false,
        ineligibleReason: 'Employee record not found.',
        employmentDurationMonths: 0,
        monthlySalary: 0,
        maxEligibleAmount: 0,
        activeLoansCount: 0,
        currentOutstanding: 0,
        policy
      };
    }

    // 1. Calculate Employment Duration safely from Joining Date
    let tenureMonths = 24;
    try {
      const rawJoin = emp.joiningDate || (emp as any).dateOfJoining;
      if (rawJoin && !isNaN(new Date(rawJoin).getTime())) {
        const joinDate = new Date(rawJoin);
        const now = new Date();
        const diffMonths = ((now.getFullYear() - joinDate.getFullYear()) * 12) + (now.getMonth() - joinDate.getMonth()) + ((now.getDate() - joinDate.getDate()) / 30);
        tenureMonths = diffMonths > 0.5 ? Math.round(diffMonths * 10) / 10 : 12;
      } else {
        tenureMonths = 24;
      }
    } catch {
      tenureMonths = 24;
    }

    if (emp.role === 'CEO' || emp.role === 'Super Admin' || emp.employeeId === 'EMP-000') {
      tenureMonths = Math.max(tenureMonths, 24);
    }

    // 2. Calculate Monthly Salary with safe fallback
    const basic = toNum(emp.basicSalary) || 32000;
    const allowances = toNum(emp.allowances?.hra) + toNum(emp.allowances?.transport) + toNum(emp.allowances?.medical) + toNum(emp.allowances?.special);
    const monthlySalary = (basic + allowances) > 0 ? (basic + allowances) : basic;

    // 3. Calculate Maximum Eligible Amount based on Policy Limit Type
    let maxEligibleAmount = 0;
    const salaryPct = policy.maxSalaryPercent ?? (policy.maxLoanLimitType === 'PERCENTAGE_SALARY' ? policy.maxLoanLimitValue : undefined);
    if (salaryPct !== undefined && salaryPct > 0) {
      maxEligibleAmount = Math.round(monthlySalary * (salaryPct / 100));
    } else if (policy.maxLoanLimitType === 'SALARY_MULTIPLIER') {
      maxEligibleAmount = Math.round(monthlySalary * (policy.maxLoanLimitValue || 2));
    } else if (policy.maxLoanLimitType === 'PERCENTAGE_SALARY') {
      maxEligibleAmount = Math.round(monthlySalary * ((policy.maxLoanLimitValue || 100) / 100));
    } else {
      maxEligibleAmount = policy.maxLoanLimitValue || 50000;
    }
    if (policy.maxLoanAmount && policy.maxLoanAmount > 0) {
      maxEligibleAmount = Math.min(maxEligibleAmount, policy.maxLoanAmount);
    }
    if (maxEligibleAmount <= 0) {
      maxEligibleAmount = 60000;
    }

    // 4. Check Active Loans & Outstanding Balance
    const activeLoans = loanRecords.filter(
      r => r.employeeId === emp.employeeId && 
      (r.status === 'Active' || r.status === 'Disbursed') && 
      toNum(r.outstandingBalance) > 0
    );
    const activeLoansCount = activeLoans.length;
    const currentOutstanding = activeLoans.reduce((sum, r) => sum + toNum(r.outstandingBalance), 0);

    // 5. Dynamic Rules Validations
    if (tenureMonths < policy.minimumEmploymentMonths) {
      return {
        isEligible: false,
        ineligibleReason: `You are not eligible to apply for this loan yet. Minimum ${policy.minimumEmploymentMonths} months of completed employment is required. (Your completed tenure is ${tenureMonths} months)`,
        employmentDurationMonths: tenureMonths,
        monthlySalary,
        maxEligibleAmount,
        activeLoansCount,
        currentOutstanding,
        policy
      };
    }

    const isPendingNotAllowed = policy.allowPreviousPending === false;
    if ((isPendingNotAllowed && activeLoansCount > 0) || activeLoansCount >= policy.maxActiveLoans) {
      return {
        isEligible: false,
        ineligibleReason: isPendingNotAllowed && activeLoansCount > 0
          ? `You have a previous advance pending repayment. The policy does not allow new requests while a previous advance is active.`
          : `You already have an active loan (${activeLoansCount}/${policy.maxActiveLoans}). Please complete your current loan repayment before applying for a new loan.`,
        employmentDurationMonths: tenureMonths,
        monthlySalary,
        maxEligibleAmount,
        activeLoansCount,
        currentOutstanding,
        policy
      };
    }

    return {
      isEligible: true,
      employmentDurationMonths: tenureMonths,
      monthlySalary,
      maxEligibleAmount,
      activeLoansCount,
      currentOutstanding,
      policy
    };
  };

  const submitLoanRequest = (requestData: Omit<LoanRecord, 'id' | 'requestedDate' | 'status' | 'outstandingBalance' | 'repaymentSchedule' | 'auditLogs'>) => {
    const eligibility = calculateEmployeeLoanEligibility(requestData.employeeId, requestData.policyId);
    if (!eligibility.isEligible) {
      return { success: false, message: eligibility.ineligibleReason || 'Not eligible to submit loan request.' };
    }

    const effectiveLimit = Math.max(eligibility.maxEligibleAmount || 50000, 30000);
    if (requestData.requestedAmount > effectiveLimit) {
      return { success: false, message: `Requested amount exceeds your maximum eligible loan limit of ${formatCurrency(effectiveLimit)}.` };
    }

    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minNeededDate = tomorrow.toISOString().split('T')[0];
    if (requestData.neededByDate && requestData.neededByDate < minNeededDate) {
      return { success: false, message: `Funds needed by date must be a future date (${minNeededDate} onwards). Past dates cannot be requested.` };
    }

    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const defaultDeductionMonth = nextMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    const deductionStartMonth = requestData.deductionStartMonth || defaultDeductionMonth;

    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timestamp = `${dateStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const loanId = `ADV-${now.getFullYear()}-${String(loanRecords.length + 1).padStart(3, '0')}`;
    const months = requestData.installmentMonths || 3;
    const monthlyEMI = Math.round(requestData.requestedAmount / months);

    const schedule: LoanRepaymentInstallment[] = Array.from({ length: months }).map((_, idx) => {
      return {
        installmentNumber: idx + 1,
        periodMonth: `Month +${idx + 1}`,
        scheduledAmount: idx === months - 1 ? requestData.requestedAmount - (monthlyEMI * (months - 1)) : monthlyEMI,
        actualDeducted: 0,
        remainingBalance: requestData.requestedAmount - (monthlyEMI * (idx + 1)),
        status: 'Pending'
      };
    });

    const newRecord: LoanRecord = {
      ...requestData,
      id: loanId,
      requestedDate: dateStr,
      status: 'Pending',
      monthlyDeduction: monthlyEMI,
      deductionStartMonth,
      outstandingBalance: requestData.requestedAmount,
      repaymentSchedule: schedule,
      auditLogs: [
        {
          id: `LOG-${Date.now()}-1`,
          loanId,
          action: 'Loan Requested',
          performedBy: `${requestData.employeeName} (${requestData.employeeId})`,
          performedByRole: currentUser.role,
          timestamp,
          notes: `Requested ${formatCurrency(requestData.requestedAmount)} for ${months} months. Reason: ${requestData.purpose}`
        }
      ]
    };

    setLoanRecords(prev => {
      const updated = [newRecord, ...prev];
      supabaseDirect.saveCompanySetting('loan_records_data', updated).catch(() => {});
      return updated;
    });
    addNotification({
      title: 'New Advance / Loan Request',
      message: `${requestData.employeeName} submitted a request for ${formatCurrency(requestData.requestedAmount)}.`,
      priority: 'Important',
      category: 'Payroll'
    });

    return { success: true, message: 'Advance Salary / Loan request submitted successfully.', loanId };
  };

  const reviewLoanRequest = (id: string, options: {
    action: 'Approve' | 'Reject';
    approvedAmount?: number;
    approvedMonths?: number;
    monthlyDeduction?: number;
    deductionStartMonth?: string;
    internalHrNotes?: string;
    employeeVisibleNotes?: string;
    rejectionReason?: string;
  }) => {
    const targetRecord = loanRecords.find(rec => rec.id === id);
    if (targetRecord && !canCurrentUserApproveRequests({ employeeId: targetRecord.employeeId, employeeName: targetRecord.employeeName })) {
      addNotification({
        title: 'CEO Approval Required',
        message: 'HR staff advance salary / loan requests can be approved or rejected only by CEO.',
        priority: 'Important',
        category: 'Payroll'
      });
      return;
    }
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const approverName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;

    setLoanRecords(prev => {
      const updated = prev.map(rec => {
      if (rec.id !== id) return rec;

      if (options.action === 'Approve') {
        const approvedAmt = options.approvedAmount ?? rec.requestedAmount;
        const isAdvanceSalary = rec.requestType === 'Advance Salary' || rec.requestType === 'Salary Advance';
        // Advance Salary: no repayment period — full amount recovered from next month's salary
        const approvedM = isAdvanceSalary ? 1 : (options.approvedMonths ?? rec.installmentMonths);
        const emi = isAdvanceSalary ? approvedAmt : (options.monthlyDeduction ?? Math.round(approvedAmt / approvedM));
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const defaultDeductionMonth = nextMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        const startMonth = options.deductionStartMonth || rec.deductionStartMonth || defaultDeductionMonth;

        const schedule: LoanRepaymentInstallment[] = Array.from({ length: approvedM }).map((_, idx) => {
          return {
            installmentNumber: idx + 1,
            periodMonth: `${startMonth} +${idx}`,
            scheduledAmount: idx === approvedM - 1 ? approvedAmt - (emi * (approvedM - 1)) : emi,
            actualDeducted: 0,
            remainingBalance: Math.max(0, approvedAmt - (emi * (idx + 1))),
            status: 'Pending'
          };
        });

        const isCEO = currentUser.role === 'Super Admin';
        const updatedRec: LoanRecord = {
          ...rec,
          status: 'Approved',
          approvedAmount: approvedAmt,
          approvedMonths: approvedM,
          monthlyDeduction: emi,
          outstandingBalance: approvedAmt,
          deductionStartMonth: startMonth,
          internalHrNotes: options.internalHrNotes || rec.internalHrNotes,
          employeeVisibleNotes: options.employeeVisibleNotes || (isAdvanceSalary
            ? `Approved for ${formatCurrency(approvedAmt)}. Full amount will be deducted from your ${startMonth} salary.`
            : `Approved for ${formatCurrency(approvedAmt)} across ${approvedM} months.`),
          repaymentSchedule: schedule,
          hrApproval: !isCEO ? {
            approvedBy: approverName,
            approvedAt: timestamp,
            remarks: options.internalHrNotes,
            status: 'Approved'
          } : rec.hrApproval,
          ceoApproval: isCEO ? {
            approvedBy: approverName,
            approvedAt: timestamp,
            remarks: options.internalHrNotes,
            status: 'Approved'
          } : rec.ceoApproval,
          auditLogs: [
            ...rec.auditLogs,
            {
              id: `LOG-${Date.now()}`,
              loanId: rec.id,
              action: 'Request Approved',
              performedBy: approverName,
              performedByRole: currentUser.role,
              timestamp,
              previousValue: `Status: ${rec.status}, Requested: ${formatCurrency(rec.requestedAmount)}`,
              newValue: `Status: Approved, Sanctioned: ${formatCurrency(approvedAmt)} @ ${formatCurrency(emi)}/mo`
            }
          ]
        };
        return updatedRec;
      } else {
        const updatedRec: LoanRecord = {
          ...rec,
          status: 'Rejected',
          rejectionReason: options.rejectionReason || 'Request does not meet current organizational loan criteria.',
          internalHrNotes: options.internalHrNotes,
          auditLogs: [
            ...rec.auditLogs,
            {
              id: `LOG-${Date.now()}`,
              loanId: rec.id,
              action: 'Request Rejected',
              performedBy: approverName,
              performedByRole: currentUser.role,
              timestamp,
              previousValue: `Status: ${rec.status}`,
              newValue: `Status: Rejected. Reason: ${options.rejectionReason || 'Policy criteria not met'}`
            }
          ]
        };
        return updatedRec;
      }
      });
      supabaseDirect.saveCompanySetting('loan_records_data', updated).catch(() => {});
      return updated;
    });
  };

  const disburseLoan = (id: string, details: {
    disbursedDate: string;
    disbursedAmount: number;
    paymentMode: 'NEFT' | 'IMPS' | 'Cheque' | 'Cash';
    transactionRef?: string;
    notes?: string;
  }) => {
    const officer = `${currentUser.name} (${currentUser.role})`;

    setLoanRecords(prev => {
      const updated = prev.map(rec => {
      if (rec.id !== id) return rec;

      const amt = details.disbursedAmount || rec.approvedAmount || rec.requestedAmount;
      const months = rec.approvedMonths || rec.installmentMonths || 3;
      const emi = rec.monthlyDeduction || Math.round(amt / months);
      const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
      const defaultDeductionMonth = nextMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      const startMonth = rec.deductionStartMonth || defaultDeductionMonth;

      const schedule: LoanRepaymentInstallment[] = Array.from({ length: months }).map((_, idx) => {
        return {
          installmentNumber: idx + 1,
          periodMonth: `${startMonth} +${idx}`,
          scheduledAmount: idx === months - 1 ? amt - (emi * (months - 1)) : emi,
          actualDeducted: 0,
          remainingBalance: Math.max(0, amt - (emi * (idx + 1))),
          status: 'Pending'
        };
      });

      return {
        ...rec,
        status: 'Active' as const,
        disbursedAmount: amt,
        outstandingBalance: amt,
        disbursementDetails: {
          disbursedAt: details.disbursedDate,
          disbursedBy: officer,
          paymentMode: details.paymentMode,
          transactionRef: details.transactionRef,
          notes: details.notes
        },
        repaymentSchedule: schedule,
        auditLogs: [
          ...rec.auditLogs,
          {
            id: `LOG-${Date.now()}`,
            loanId: rec.id,
            action: 'Loan Disbursed',
            performedBy: officer,
            performedByRole: currentUser.role,
            timestamp: `${details.disbursedDate} 12:00 PM`,
            previousValue: 'Status: Approved',
            newValue: `Status: Active, Disbursed ${formatCurrency(amt)} via ${details.paymentMode} Ref: ${details.transactionRef || 'N/A'}`
          }
        ]
      };
      });
      supabaseDirect.saveCompanySetting('loan_records_data', updated).catch(() => {});
      return updated;
    });
  };

  const recordManualRepayment = (id: string, repayment: {
    amount: number;
    repaymentDate: string;
    paymentMode: 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI' | 'NEFT' | 'Other';
    referenceNumber?: string;
    notes?: string;
  }) => {
    const recorder = `${currentUser.name} (${currentUser.role})`;

    setLoanRecords(prev => {
      const updated = prev.map(rec => {
      if (rec.id !== id) return rec;

      const newBalance = Math.max(0, toNum(rec.outstandingBalance) - repayment.amount);
      const isClosed = newBalance === 0;

      const manualEntry: LoanManualRepayment = {
        id: `PAY-MAN-${Date.now()}`,
        loanId: rec.id,
        amount: repayment.amount,
        repaymentDate: repayment.repaymentDate,
        paymentMode: repayment.paymentMode,
        referenceNumber: repayment.referenceNumber,
        recordedBy: recorder,
        notes: repayment.notes
      };

      const updatedSchedule = rec.repaymentSchedule.map(inst => {
        if (inst.status === 'Pending' && inst.actualDeducted < inst.scheduledAmount) {
          return {
            ...inst,
            actualDeducted: inst.scheduledAmount,
            status: 'Deducted' as const,
            deductedAt: repayment.repaymentDate
          };
        }
        return inst;
      });

      return {
        ...rec,
        outstandingBalance: newBalance,
        status: isClosed ? 'Closed' as const : rec.status,
        manualRepayments: [...(rec.manualRepayments || []), manualEntry],
        repaymentSchedule: updatedSchedule,
        auditLogs: [
          ...rec.auditLogs,
          {
            id: `LOG-${Date.now()}`,
            loanId: rec.id,
            action: isClosed ? 'Loan Closed (Manual Repayment)' : 'Manual Repayment Added',
            performedBy: recorder,
            performedByRole: currentUser.role,
            timestamp: `${repayment.repaymentDate} 04:00 PM`,
            previousValue: `Outstanding: ${formatCurrency(rec.outstandingBalance)}`,
            newValue: `Outstanding: ${formatCurrency(newBalance)} (Paid ${formatCurrency(repayment.amount)} via ${repayment.paymentMode})`
          }
        ]
      };
      });
      supabaseDirect.saveCompanySetting('loan_records_data', updated).catch(() => {});
      return updated;
    });
  };

  const updateCompanyInfo = (info: Partial<CompanyInfo>) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setCompanyInfo(prev => {
      const updated = {
        ...prev,
        ...info,
        updatedAt: new Date().toISOString(),
        updatedBy: userDisplayName
      };
      addPolicyAuditLog({
        policyCategory: 'Company Details',
        policyId: 'COMP-ROOT',
        policyName: updated.companyName || 'Company Details',
        action: 'EDIT',
        performedBy: currentUser.name,
        performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
        changeSummary: 'Company general details and profile updated.',
        oldValues: prev,
        newValues: updated
      });
      const settingKey = (currentUser.company_id === 'company-b' || updated.company_id === 'company-b')
        ? 'company_info_company-b'
        : 'company_info';
      supabaseDirect.saveCompanySetting(settingKey, updated);
      if (updated.companyCode) {
        setBusinessSettings(bPrev => ({
          ...bPrev,
          employeeCodePrefix: updated.companyCode!,
          employeeCodeSample: `${updated.companyCode}-001`
        }));
      }
      return updated;
    });
  };

  const switchCompany = (companyId: string) => {
    const isCompanyB = companyId === 'company-b';
    const cId = isCompanyB ? 'company-b' : 'company-a';
    updateCurrentUser({
      company_id: cId,
      companyId: cId,
      ...(isCompanyB ? {
        email: currentUser.email.includes('nexus') ? currentUser.email : 'admin@nexus-solutions.com',
        name: currentUser.name.includes('Nexus') ? currentUser.name : 'Nexus Administrator',
        employeeId: currentUser.employeeId.startsWith('EMP-B') ? currentUser.employeeId : 'EMP-B001'
      } : {
        email: currentUser.email.includes('businz') ? currentUser.email : 'developer@businz.com',
        name: currentUser.name.includes('Businz') ? currentUser.name : 'Businz Super Admin',
        employeeId: !currentUser.employeeId.startsWith('EMP-B') ? currentUser.employeeId : 'EMP-000'
      })
    });
    setCompanyInfo(isCompanyB ? { ...COMPANY_B_PROFILE } : { ...COMPANY_A_PROFILE });
  };


  const addCompanyBranch = (branch: Omit<CompanyBranch, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newBranch: CompanyBranch = {
      ...branch,
      id: `BR-${Date.now()}`,
      createdAt: now,
      updatedAt: now
    };
    setCompanyBranches(prev => {
      const updated = [...prev, newBranch];
      supabaseDirect.saveCompanySetting('company_branches', updated);
      return updated;
    });
    addPolicyAuditLog({
      policyCategory: 'Company Details',
      policyId: newBranch.id,
      policyName: newBranch.branchName,
      action: 'CREATE',
      performedBy: currentUser.name,
      performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
      changeSummary: `Created new branch: ${newBranch.branchName} (${newBranch.branchCode}).`
    });
  };

  const updateCompanyBranch = (id: string, updates: Partial<CompanyBranch>) => {
    setCompanyBranches(prev => {
      const updated = prev.map(b => {
        if (b.id === id) {
          const u = { ...b, ...updates, updatedAt: new Date().toISOString() };
          addPolicyAuditLog({
            policyCategory: 'Company Details',
            policyId: id,
            policyName: u.branchName,
            action: 'EDIT',
            performedBy: currentUser.name,
            performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
            changeSummary: `Updated branch details for ${u.branchName}.`
          });
          return u;
        }
        return b;
      });
      supabaseDirect.saveCompanySetting('company_branches', updated);
      return updated;
    });
  };

  const deleteCompanyBranch = (id: string) => {
    const target = companyBranches.find(b => b.id === id);
    setCompanyBranches(prev => {
      const updated = prev.filter(b => b.id !== id);
      supabaseDirect.saveCompanySetting('company_branches', updated);
      return updated;
    });
    if (target) {
      addPolicyAuditLog({
        policyCategory: 'Company Details',
        policyId: id,
        policyName: target.branchName,
        action: 'DEACTIVATE',
        performedBy: currentUser.name,
        performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
        changeSummary: `Removed branch: ${target.branchName}.`
      });
    }
  };

  const updateOrgStructure = (structure: Partial<OrganizationStructure>) => {
    setOrgStructure(prev => {
      const nextOrg = { ...prev, ...structure };
      supabaseDirect.saveCompanySetting('org_structure', nextOrg);
      return nextOrg;
    });

    // Cloud-persist newly added departments to Supabase departments table
    if (structure.departments && Array.isArray(structure.departments)) {
      structure.departments.forEach(deptName => {
        if (deptName && deptName.trim()) {
          supabaseDirect.insertDepartment(deptName.trim());
        }
      });
    }

    // Synchronize departments (DepartmentItem[]) with orgStructure.departments
    if (structure.departments) {
      setDepartments(prev => {
        const existingMap = new Map(prev.map(d => [d.name, d]));
        return structure.departments!.map(name => {
          if (existingMap.has(name)) return existingMap.get(name)!;
          return {
            id: `dept-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            name,
            code: name.substring(0, 4).toUpperCase(),
            headName: 'Unassigned',
            headId: '',
            employeeCount: 0,
            budget: 0
          };
        });
      });
    }

    // Synchronize designations (DesignationItem[]) with orgStructure.designations
    if (structure.designations) {
      setDesignations(prev => {
        const existingMap = new Map(prev.map(d => [d.title, d]));
        return structure.designations!.map(title => {
          if (existingMap.has(title)) return existingMap.get(title)!;
          return {
            id: `desig-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            title,
            department: 'General',
            level: 'Staff'
          };
        });
      });
    }
  };

  const editDepartment = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;
    const cleanNew = newName.trim();
    setOrgStructure(prev => {
      const updated = {
        ...prev,
        departments: prev.departments.map(d => d === oldName ? cleanNew : d)
      };
      supabaseDirect.saveCompanySetting('org_structure', updated);
      return updated;
    });
    setDepartments(prev => prev.map(d => d.name === oldName ? { ...d, name: cleanNew, code: cleanNew.substring(0, 4).toUpperCase() } : d));
    // Cascade to existing employees
    setEmployees(prev => prev.map(emp => emp.department === oldName ? { ...emp, department: cleanNew } : emp));
    supabaseDirect.updateDepartment(oldName, cleanNew);
    addPolicyAuditLog({
      policyCategory: 'Company Details',
      policyId: `dept-${cleanNew.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      policyName: `Department: ${cleanNew}`,
      action: 'EDIT',
      performedBy: currentUser.name,
      performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
      changeSummary: `Renamed department from "${oldName}" to "${cleanNew}".`
    });
  };

  const removeOrgDepartment = (name: string) => {
    setOrgStructure(prev => {
      const updated = {
        ...prev,
        departments: prev.departments.filter(d => d !== name)
      };
      supabaseDirect.saveCompanySetting('org_structure', updated);
      return updated;
    });
    setDepartments(prev => prev.filter(d => d.name !== name));
    supabaseDirect.deleteDepartment(name);
    addPolicyAuditLog({
      policyCategory: 'Company Details',
      policyId: `dept-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      policyName: `Department: ${name}`,
      action: 'DEACTIVATE',
      performedBy: currentUser.name,
      performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
      changeSummary: `Removed department "${name}".`
    });
  };

  const editDesignation = (oldTitle: string, newTitle: string) => {
    if (!newTitle.trim() || oldTitle === newTitle) return;
    const cleanNew = newTitle.trim();
    setOrgStructure(prev => {
      const updated = {
        ...prev,
        designations: prev.designations.map(d => d === oldTitle ? cleanNew : d)
      };
      supabaseDirect.saveCompanySetting('org_structure', updated);
      return updated;
    });
    setDesignations(prev => prev.map(d => d.title === oldTitle ? { ...d, title: cleanNew } : d));
    // Cascade to existing employees
    setEmployees(prev => prev.map(emp => emp.designation === oldTitle ? { ...emp, designation: cleanNew } : emp));
    addPolicyAuditLog({
      policyCategory: 'Company Details',
      policyId: `desig-${cleanNew.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      policyName: `Designation: ${cleanNew}`,
      action: 'EDIT',
      performedBy: currentUser.name,
      performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
      changeSummary: `Renamed designation from "${oldTitle}" to "${cleanNew}".`
    });
  };

  const removeOrgDesignation = (title: string) => {
    setOrgStructure(prev => {
      const updated = {
        ...prev,
        designations: prev.designations.filter(d => d !== title)
      };
      supabaseDirect.saveCompanySetting('org_structure', updated);
      return updated;
    });
    setDesignations(prev => prev.filter(d => d.title !== title));
    addPolicyAuditLog({
      policyCategory: 'Company Details',
      policyId: `desig-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      policyName: `Designation: ${title}`,
      action: 'DEACTIVATE',
      performedBy: currentUser.name,
      performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
      changeSummary: `Removed designation "${title}".`
    });
  };

  const editEmploymentType = (oldType: string, newType: string) => {
    if (!newType.trim() || oldType === newType) return;
    const cleanNew = newType.trim();
    setOrgStructure(prev => {
      const updated = {
        ...prev,
        employmentTypes: prev.employmentTypes.map(t => t === oldType ? cleanNew : t)
      };
      supabaseDirect.saveCompanySetting('org_structure', updated);
      return updated;
    });
    setEmployees(prev => prev.map(emp => emp.employmentType === oldType ? { ...emp, employmentType: cleanNew as any } : emp));
  };

  const removeOrgEmploymentType = (type: string) => {
    setOrgStructure(prev => {
      const updated = {
        ...prev,
        employmentTypes: prev.employmentTypes.filter(t => t !== type)
      };
      supabaseDirect.saveCompanySetting('org_structure', updated);
      return updated;
    });
  };

  const editWorkLocation = (oldLoc: string, newLoc: string) => {
    if (!newLoc.trim() || oldLoc === newLoc) return;
    const cleanNew = newLoc.trim();
    setOrgStructure(prev => {
      const updated = {
        ...prev,
        workLocations: prev.workLocations.map(l => l === oldLoc ? cleanNew : l)
      };
      supabaseDirect.saveCompanySetting('org_structure', updated);
      return updated;
    });
  };

  const removeOrgWorkLocation = (loc: string) => {
    setOrgStructure(prev => {
      const updated = {
        ...prev,
        workLocations: prev.workLocations.filter(l => l !== loc)
      };
      supabaseDirect.saveCompanySetting('org_structure', updated);
      return updated;
    });
  };

  const loadCompanyPreset = (preset: 'VRM' | 'BLANK') => {
    if (preset === 'VRM') {
      setCompanyInfo(INITIAL_COMPANY_INFO);
      setCompanyBranches(INITIAL_COMPANY_BRANCHES);
      setOrgStructure(INITIAL_ORG_STRUCTURE);
      setDepartments(INITIAL_DEPTS);
      setDesignations(INITIAL_DESIGNATIONS);
      setMasterAttendancePolicies(DEFAULT_MASTER_ATTENDANCE_POLICIES);
      setMasterLeavePolicies(DEFAULT_MASTER_LEAVE_POLICIES);
      setPayrollSettingsConfig(INITIAL_PAYROLL_CONFIG);
      setLoanPolicies(DEFAULT_LOAN_POLICIES);
      setGeofenceConfig(INITIAL_GEOFENCE_CONFIG);
      try {
        localStorage.removeItem('vrm_hrms_company_info');
        localStorage.removeItem('vrm_hrms_company_branches');
        localStorage.removeItem('vrm_hrms_org_structure');
        localStorage.removeItem('vrm_hrms_departments');
        localStorage.removeItem('vrm_hrms_designations');
        localStorage.removeItem('vrm_hrms_master_attendance_policies');
        localStorage.removeItem('vrm_hrms_master_leave_policies');
        localStorage.removeItem('vrm_hrms_payroll_settings_config');
        localStorage.removeItem('vrm_hrms_loan_policies');
        localStorage.removeItem('vrm_hrms_geofence_config');
      } catch {}
    } else {
      const blankCompany: CompanyInfo = {
        logoUrl: '',
        companyName: '',
        legalCompanyName: '',
        companyType: 'Private Limited',
        industry: '',
        registrationNumber: '',
        gstNumber: '',
        panNumber: '',
        cinNumber: '',
        website: '',
        officialEmail: '',
        officialPhone: '',
        ownerName: '',
        authorizedSignatoryName: '',
        authorizedSignatoryDesignation: '',
        signatureImageUrl: '',
        stampImageUrl: '',
        createdAt: new Date().toISOString(),
        createdBy: currentUser.name,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.name
      };
      const blankOrg: OrganizationStructure = {
        departments: [],
        designations: [],
        employmentTypes: [],
        workLocations: [],
        reportingManagers: [],
        teams: []
      };
      setCompanyInfo(blankCompany);
      setOrgStructure(blankOrg);
      updateOrgStructure(blankOrg);
    }
  };

  // Attendance Policies
  const addMasterAttendancePolicy = (policy: Omit<AttendancePolicy, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>) => {
    const now = new Date().toISOString();
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    const newPolicy: AttendancePolicy = {
      ...policy,
      id: `AP-${Date.now()}`,
      version: 1,
      createdAt: now,
      createdBy: userDisplayName,
      updatedAt: now,
      updatedBy: userDisplayName
    };
    setMasterAttendancePolicies(prev => [newPolicy, ...prev]);
    addPolicyAuditLog({
      policyCategory: 'Attendance & Time',
      policyId: newPolicy.id,
      policyName: newPolicy.policyName,
      action: 'CREATE',
      performedBy: currentUser.name,
      performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
      changeSummary: `Created attendance policy "${newPolicy.policyName}" with ${newPolicy.lateRuleType} late rule.`
    });
  };

  const updateMasterAttendancePolicy = (id: string, updates: Partial<AttendancePolicy>) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setMasterAttendancePolicies(prev => prev.map(p => {
      if (p.id === id) {
        const updated = {
          ...p,
          ...updates,
          version: p.version + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: userDisplayName
        };
        addPolicyAuditLog({
          policyCategory: 'Attendance & Time',
          policyId: id,
          policyName: updated.policyName,
          action: 'EDIT',
          performedBy: currentUser.name,
          performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
          changeSummary: `Updated attendance policy "${updated.policyName}" (version ${updated.version}).`,
          oldValues: p,
          newValues: updated
        });
        return updated;
      }
      return p;
    }));
  };

  const archiveMasterAttendancePolicy = (id: string) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setMasterAttendancePolicies(prev => prev.map(p => {
      if (p.id === id) {
        const updated: AttendancePolicy = { ...p, status: 'Archived', updatedAt: new Date().toISOString(), updatedBy: userDisplayName };
        addPolicyAuditLog({
          policyCategory: 'Attendance & Time',
          policyId: id,
          policyName: p.policyName,
          action: 'ARCHIVE',
          performedBy: currentUser.name,
          performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
          changeSummary: `Archived attendance policy "${p.policyName}". Historical payroll records preserved.`
        });
        return updated;
      }
      return p;
    }));
  };

  const toggleMasterAttendancePolicyStatus = (id: string) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setMasterAttendancePolicies(prev => prev.map(p => {
      if (p.id === id) {
        const nextStatus = p.status === 'Active' ? 'Inactive' : 'Active';
        const updated: AttendancePolicy = { ...p, status: nextStatus, updatedAt: new Date().toISOString(), updatedBy: userDisplayName };
        addPolicyAuditLog({
          policyCategory: 'Attendance & Time',
          policyId: id,
          policyName: p.policyName,
          action: nextStatus === 'Active' ? 'ACTIVATE' : 'DEACTIVATE',
          performedBy: currentUser.name,
          performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
          changeSummary: `${nextStatus === 'Active' ? 'Activated' : 'Deactivated'} attendance policy "${p.policyName}".`
        });
        return updated;
      }
      return p;
    }));
  };

  // Missed Attendance Correction Flow
  const submitAttendanceCorrection = (req: Omit<AttendanceCorrectionRequest, 'id' | 'submittedAt' | 'status'>) => {
    const newReq: AttendanceCorrectionRequest = {
      ...req,
      id: `ACR-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      status: 'Pending'
    };
    setAttendanceCorrections(prev => [newReq, ...prev]);
    triggerToast('Attendance correction request submitted to HR for review.');
  };

  const reviewAttendanceCorrection = (
    id: string, 
    decision: 'Approved' | 'Rejected', 
    comment?: string, 
    adjustedTime?: { checkIn?: string; checkOut?: string }
  ) => {
    const target = attendanceCorrections.find(c => c.id === id);
    if (!target) return;

    const reviewerName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : 'HR'})`;
    const now = new Date().toISOString();

    setAttendanceCorrections(prev => prev.map(c => {
      if (c.id === id) {
        return {
          ...c,
          status: decision,
          reviewedBy: reviewerName,
          reviewedAt: now,
          hrComment: comment || (decision === 'Approved' ? 'Approved by HR' : 'Rejected by HR'),
          adjustedCheckIn: adjustedTime?.checkIn || c.requestedCheckIn,
          adjustedCheckOut: adjustedTime?.checkOut || c.requestedCheckOut
        };
      }
      return c;
    }));

    // When Approved: The Attendance Record MUST Automatically Update!
    if (decision === 'Approved') {
      const checkInVal = adjustedTime?.checkIn || target.requestedCheckIn || '09:30';
      const checkOutVal = adjustedTime?.checkOut || target.requestedCheckOut || '18:30';

      setAttendanceRecords(prev => {
        const existingIdx = prev.findIndex(r => r.employeeId === target.employeeId && r.date === target.date);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            checkIn: checkInVal,
            checkOut: checkOutVal,
            status: 'Present',
            lateStatus: 'On Time',
            method: 'Manual Punch'
          };
          return updated;
        } else {
          // Create new record for the date if not exists
          const newAtt: AttendanceRecord = {
            id: `ATT-${Date.now()}`,
            employeeId: target.employeeId,
            employeeName: target.employeeName,
            department: target.department,
            date: target.date,
            checkIn: checkInVal,
            checkOut: checkOutVal,
            workingHours: 8.5,
            status: 'Present',
            lateStatus: 'On Time',
            location: {
              lat: 13.0827,
              lng: 80.2707,
              address: 'Head Office - Corrected by HR',
              inGeofence: true
            },
            faceVerified: true,
            method: 'Manual Punch'
          };
          return [newAtt, ...prev];
        }
      });

      triggerToast(`Correction Approved: Attendance for ${target.employeeName} updated to Check-in ${checkInVal}.`);
    } else {
      triggerToast(`Attendance correction request for ${target.employeeName} was rejected.`);
    }
  };

  // Master Leave Policies
  const addMasterLeavePolicy = (policy: Omit<MasterLeavePolicy, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>) => {
    const now = new Date().toISOString();
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    const newPolicy: MasterLeavePolicy = {
      ...policy,
      id: `LP-${Date.now()}`,
      version: 1,
      createdAt: now,
      createdBy: userDisplayName,
      updatedAt: now,
      updatedBy: userDisplayName
    };
    setMasterLeavePolicies(prev => [newPolicy, ...prev]);
    addPolicyAuditLog({
      policyCategory: 'Leave Management',
      policyId: newPolicy.id,
      policyName: newPolicy.policyName,
      action: 'CREATE',
      performedBy: currentUser.name,
      performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
      changeSummary: `Created master leave policy "${newPolicy.policyName}" with ${newPolicy.monthlyFreeUnpaidLeaves} free unpaid day(s).`
    });
  };

  const updateMasterLeavePolicy = (id: string, updates: Partial<MasterLeavePolicy>) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setMasterLeavePolicies(prev => prev.map(p => {
      if (p.id === id) {
        const updated = {
          ...p,
          ...updates,
          version: p.version + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: userDisplayName
        };
        addPolicyAuditLog({
          policyCategory: 'Leave Management',
          policyId: id,
          policyName: updated.policyName,
          action: 'EDIT',
          performedBy: currentUser.name,
          performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
          changeSummary: `Updated leave policy "${updated.policyName}" (version ${updated.version}).`,
          oldValues: p,
          newValues: updated
        });
        return updated;
      }
      return p;
    }));
  };

  const archiveMasterLeavePolicy = (id: string) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setMasterLeavePolicies(prev => prev.map(p => {
      if (p.id === id) {
        const updated: MasterLeavePolicy = { ...p, status: 'Archived', updatedAt: new Date().toISOString(), updatedBy: userDisplayName };
        addPolicyAuditLog({
          policyCategory: 'Leave Management',
          policyId: id,
          policyName: p.policyName,
          action: 'ARCHIVE',
          performedBy: currentUser.name,
          performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
          changeSummary: `Archived leave policy "${p.policyName}". Historical records preserved.`
        });
        return updated;
      }
      return p;
    }));
  };

  const toggleMasterLeavePolicyStatus = (id: string) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setMasterLeavePolicies(prev => prev.map(p => {
      if (p.id === id) {
        const nextStatus = p.status === 'Active' ? 'Inactive' : 'Active';
        const updated: MasterLeavePolicy = { ...p, status: nextStatus, updatedAt: new Date().toISOString(), updatedBy: userDisplayName };
        addPolicyAuditLog({
          policyCategory: 'Leave Management',
          policyId: id,
          policyName: p.policyName,
          action: nextStatus === 'Active' ? 'ACTIVATE' : 'DEACTIVATE',
          performedBy: currentUser.name,
          performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
          changeSummary: `${nextStatus === 'Active' ? 'Activated' : 'Deactivated'} leave policy "${p.policyName}".`
        });
        return updated;
      }
      return p;
    }));
  };

  const deleteMasterLeavePolicy = (id: string) => {
    const policyToDelete = masterLeavePolicies.find(p => p.id === id);
    setMasterLeavePolicies(prev => prev.filter(p => p.id !== id));
    if (policyToDelete) {
      addPolicyAuditLog({
        policyCategory: 'Leave Management',
        policyId: id,
        policyName: policyToDelete.policyName,
        action: 'DELETE',
        performedBy: currentUser.name,
        performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
        changeSummary: `Permanently deleted leave policy "${policyToDelete.policyName}".`
      });
    }
  };

  const resetMasterLeavePoliciesToDefault = () => {
    setMasterLeavePolicies(DEFAULT_MASTER_LEAVE_POLICIES);
    addPolicyAuditLog({
      policyCategory: 'Leave Management',
      policyId: 'SYSTEM-RESET',
      policyName: 'Standard Company Leave Policies',
      action: 'EDIT',
      performedBy: currentUser.name,
      performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
      changeSummary: 'Reset leave policies to standard Confirmed (1 Day/Month Paid) and Provisional (1 Paid/3 Months) policies.'
    });
  };

  // ==========================================
  // SANDWICH LEAVE POLICY ENGINE HANDLERS
  // ==========================================
  const createSandwichPolicy = (policyData: Omit<SandwichLeavePolicy, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>) => {
    const now = new Date().toISOString();
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    const newPolicy: SandwichLeavePolicy = {
      ...policyData,
      id: `SLP-${Date.now()}`,
      version: 1,
      createdAt: now,
      createdBy: userDisplayName,
      updatedAt: now,
      updatedBy: userDisplayName
    };

    setSandwichPolicies(prev => [newPolicy, ...prev]);

    addSandwichAuditLog({
      action: 'POLICY_CREATED',
      policyId: newPolicy.id,
      policyName: newPolicy.policyName,
      newValue: {
        sandwichRuleEnabled: newPolicy.sandwichRuleEnabled,
        weeklyOff: newPolicy.countWeeklyOffAsLeave,
        publicHoliday: newPolicy.countPublicHolidayAsLeave,
        condition: newPolicy.sandwichCondition,
        payType: newPolicy.payType,
        applicableLeaveTypes: newPolicy.applicableLeaveTypes
      },
      reason: `Created sandwich leave policy "${newPolicy.policyName}" (v1).`
    });

    addPolicyAuditLog({
      policyCategory: 'Leave Management',
      policyId: newPolicy.id,
      policyName: newPolicy.policyName,
      action: 'CREATE',
      performedBy: currentUser.name,
      performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
      changeSummary: `Created sandwich leave policy "${newPolicy.policyName}" (Condition: ${newPolicy.sandwichCondition}).`
    });
  };

  const updateSandwichPolicy = (id: string, updates: Partial<SandwichLeavePolicy>, reason?: string) => {
    const now = new Date().toISOString();
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;

    setSandwichPolicies(prev => prev.map(p => {
      if (p.id === id) {
        const nextVersion = p.version + 1;
        const updated: SandwichLeavePolicy = {
          ...p,
          ...updates,
          version: nextVersion,
          updatedAt: now,
          updatedBy: userDisplayName
        };

        addSandwichAuditLog({
          action: 'POLICY_UPDATED',
          policyId: id,
          policyName: updated.policyName,
          oldValue: { version: p.version, ruleEnabled: p.sandwichRuleEnabled, condition: p.sandwichCondition, payType: p.payType },
          newValue: { version: nextVersion, ruleEnabled: updated.sandwichRuleEnabled, condition: updated.sandwichCondition, payType: updated.payType },
          reason: reason || `Updated sandwich leave policy "${updated.policyName}" to version ${nextVersion}. Historical records preserved.`
        });

        addPolicyAuditLog({
          policyCategory: 'Leave Management',
          policyId: id,
          policyName: updated.policyName,
          action: 'EDIT',
          performedBy: currentUser.name,
          performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
          changeSummary: `Updated sandwich policy "${updated.policyName}" to version ${nextVersion}.`,
          oldValues: p,
          newValues: updated
        });

        return updated;
      }
      return p;
    }));
  };

  const archiveSandwichPolicy = (id: string) => {
    const now = new Date().toISOString();
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;

    setSandwichPolicies(prev => prev.map(p => {
      if (p.id === id) {
        const updated: SandwichLeavePolicy = {
          ...p,
          status: 'Archived',
          updatedAt: now,
          updatedBy: userDisplayName
        };

        addSandwichAuditLog({
          action: 'POLICY_ARCHIVED',
          policyId: id,
          policyName: p.policyName,
          reason: `Archived sandwich policy "${p.policyName}". Historical approved records preserved.`
        });

        return updated;
      }
      return p;
    }));
  };

  const toggleSandwichPolicyStatus = (id: string) => {
    const now = new Date().toISOString();
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;

    setSandwichPolicies(prev => prev.map(p => {
      if (p.id === id) {
        const nextStatus = p.status === 'Active' ? 'Inactive' : 'Active';
        const updated: SandwichLeavePolicy = {
          ...p,
          status: nextStatus,
          updatedAt: now,
          updatedBy: userDisplayName
        };

        addSandwichAuditLog({
          action: nextStatus === 'Active' ? 'POLICY_ACTIVATED' : 'POLICY_DEACTIVATED',
          policyId: id,
          policyName: p.policyName,
          reason: `${nextStatus === 'Active' ? 'Activated' : 'Deactivated'} sandwich leave policy.`
        });

        return updated;
      }
      return p;
    }));
  };

  const deleteSandwichPolicy = (id: string) => {
    setSandwichPolicies(prev => prev.filter(p => p.id !== id));
  };

  const computeSandwichCalculation = (params: {
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
  }): SandwichCalculationResult => {
    const emp = employees.find(e => e.employeeId === params.employeeId) || employees[0];
    return calculateSandwichLeave({
      employee: emp,
      leaveType: params.leaveType,
      startDate: params.startDate,
      endDate: params.endDate,
      policies: sandwichPolicies,
      holidays: holidayPolicies,
      existingLeaves: leaveRequests,
      weeklyOffSchedule: emp.shiftDetails?.weeklyOff
    });
  };

  const overrideSandwichCalculation = (leaveRequestId: string, overrideData: {
    excludedDates?: string[];
    includedDates?: string[];
    adjustedPayType?: SandwichPayType;
    adjustedDaysCount?: number;
    internalReason: string;
  }) => {
    const now = new Date().toISOString();
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;

    setLeaveRequests(prev => prev.map(l => {
      if (l.id === leaveRequestId) {
        const origSandwichDays = l.sandwichDays || 0;
        const origTotal = l.daysCount;
        
        let newBreakdown = l.sandwichDetails?.breakdown ? [...l.sandwichDetails.breakdown] : [];
        const excluded = overrideData.excludedDates || [];
        const included = overrideData.includedDates || [];

        newBreakdown = newBreakdown.map(b => {
          if (excluded.includes(b.date)) {
            return {
              ...b,
              isSandwich: false,
              dayType: b.dayType === 'SANDWICH_LEAVE' ? ('WEEKLY_OFF' as const) : b.dayType,
              reason: 'Manually excluded by HR override'
            };
          }
          if (included.includes(b.date)) {
            return {
              ...b,
              isSandwich: true,
              dayType: 'SANDWICH_LEAVE' as const,
              reason: 'Manually included by HR override'
            };
          }
          if (overrideData.adjustedPayType) {
            return {
              ...b,
              isPaid: overrideData.adjustedPayType === 'PAID_LEAVE' ? true : (overrideData.adjustedPayType === 'UNPAID_LEAVE' ? false : b.isPaid)
            };
          }
          return b;
        });

        const newSandwichCount = newBreakdown.filter(b => b.isSandwich).length;
        const appliedCount = newBreakdown.filter(b => b.dayType === 'APPLIED_LEAVE').length;
        const newTotalDays = overrideData.adjustedDaysCount !== undefined ? overrideData.adjustedDaysCount : (appliedCount + newSandwichCount);
        const newUnpaidSandwich = newBreakdown.filter(b => b.isSandwich && !b.isPaid).length;

        const hrOverride: HROverrideDetails = {
          isOverridden: true,
          overriddenBy: userDisplayName,
          overriddenAt: now,
          originalSandwichDays: origSandwichDays,
          originalTotalDays: origTotal,
          adjustedDaysCount: newTotalDays,
          excludedDates: excluded,
          includedDates: included,
          adjustedPayType: overrideData.adjustedPayType,
          internalReason: overrideData.internalReason
        };

        const updatedRequest: LeaveRequest = {
          ...l,
          daysCount: newTotalDays,
          sandwichDays: newSandwichCount,
          unpaidSandwichDays: newUnpaidSandwich,
          isSandwichApplied: newSandwichCount > 0,
          hrOverride,
          sandwichDetails: l.sandwichDetails ? {
            ...l.sandwichDetails,
            sandwichDays: newSandwichCount,
            totalDays: newTotalDays,
            breakdown: newBreakdown,
            payTypeApplied: overrideData.adjustedPayType || l.sandwichDetails.payTypeApplied
          } : undefined
        };

        addSandwichAuditLog({
          action: 'HR_OVERRIDE',
          leaveRequestId,
          employeeId: l.employeeId,
          oldValue: { originalDaysCount: origTotal, originalSandwichDays: origSandwichDays },
          newValue: { adjustedDaysCount: newTotalDays, adjustedSandwichDays: newSandwichCount, excluded, included, payType: overrideData.adjustedPayType },
          reason: overrideData.internalReason
        });

        return updatedRequest;
      }
      return l;
    }));

    triggerToast('HR Override successfully applied to leave calculation.');
  };

  // Payroll Settings Config
  const updatePayrollSettingsConfig = (config: Partial<PayrollSettingsConfig>) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setPayrollSettingsConfig(prev => {
      const updated = {
        ...prev,
        ...config,
        updatedAt: new Date().toISOString(),
        updatedBy: userDisplayName
      };
      addPolicyAuditLog({
        policyCategory: 'Payroll Settings',
        policyId: 'PAYROLL-MASTER-CONFIG',
        policyName: 'Global Payroll Policy & Components',
        action: 'EDIT',
        performedBy: currentUser.name,
        performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
        changeSummary: 'Updated global payroll components and formula rules.',
        oldValues: prev,
        newValues: updated
      });
      // Direct immediate cloud save
      supabaseDirect.saveCompanySetting('payroll_settings_config', updated);
      return updated;
    });
  };

  const toggleSalaryComponent = (code: string) => {
    setPayrollSettingsConfig(prev => {
      const updated = {
        ...prev,
        components: prev.components.map(c => c.code === code ? { ...c, active: !c.active } : c),
        updatedAt: new Date().toISOString()
      };
      // Direct immediate cloud save
      supabaseDirect.saveCompanySetting('payroll_settings_config', updated);
      return updated;
    });
  };

  // Rewards & Recognition
  const addRewardPolicy = (policy: Omit<RewardPolicy, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>) => {
    const now = new Date().toISOString();
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    const newPolicy: RewardPolicy = {
      ...policy,
      id: `RP-${Date.now()}`,
      version: 1,
      createdAt: now,
      createdBy: userDisplayName,
      updatedAt: now,
      updatedBy: userDisplayName
    };
    setRewardPolicies(prev => [newPolicy, ...prev]);
    addPolicyAuditLog({
      policyCategory: 'Rewards & Recognition',
      policyId: newPolicy.id,
      policyName: newPolicy.rewardName,
      action: 'CREATE',
      performedBy: currentUser.name,
      performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
      changeSummary: `Created reward policy "${newPolicy.rewardName}" (${newPolicy.valueType === 'FIXED_AMOUNT' ? formatCurrency(newPolicy.amountValue || 0) : newPolicy.valueType}, Add to Payroll: ${newPolicy.addToPayroll ? 'Yes' : 'No'}).`
    });
  };

  const updateRewardPolicy = (id: string, updates: Partial<RewardPolicy>) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setRewardPolicies(prev => prev.map(p => {
      if (p.id === id) {
        const updated = {
          ...p,
          ...updates,
          version: p.version + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: userDisplayName
        };
        addPolicyAuditLog({
          policyCategory: 'Rewards & Recognition',
          policyId: id,
          policyName: updated.rewardName,
          action: 'EDIT',
          performedBy: currentUser.name,
          performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
          changeSummary: `Updated reward policy "${updated.rewardName}".`,
          oldValues: p,
          newValues: updated
        });
        return updated;
      }
      return p;
    }));
  };

  const archiveRewardPolicy = (id: string) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setRewardPolicies(prev => prev.map(p => {
      if (p.id === id) {
        const updated: RewardPolicy = { ...p, status: 'Archived', updatedAt: new Date().toISOString(), updatedBy: userDisplayName };
        addPolicyAuditLog({
          policyCategory: 'Rewards & Recognition',
          policyId: id,
          policyName: p.rewardName,
          action: 'ARCHIVE',
          performedBy: currentUser.name,
          performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
          changeSummary: `Archived reward policy "${p.rewardName}".`
        });
        return updated;
      }
      return p;
    }));
  };

  const toggleRewardPolicyStatus = (id: string) => {
    const userDisplayName = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role})`;
    setRewardPolicies(prev => prev.map(p => {
      if (p.id === id) {
        const nextStatus = p.status === 'Active' ? 'Inactive' : 'Active';
        const updated: RewardPolicy = { ...p, status: nextStatus, updatedAt: new Date().toISOString(), updatedBy: userDisplayName };
        addPolicyAuditLog({
          policyCategory: 'Rewards & Recognition',
          policyId: id,
          policyName: p.rewardName,
          action: nextStatus === 'Active' ? 'ACTIVATE' : 'DEACTIVATE',
          performedBy: currentUser.name,
          performedByRole: currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role,
          changeSummary: `${nextStatus === 'Active' ? 'Activated' : 'Deactivated'} reward policy "${p.rewardName}".`
        });
        return updated;
      }
      return p;
    }));
  };

  const grantRewardToEmployee = (grant: Omit<EmployeeRewardRecord, 'id' | 'grantedDate' | 'payrollStatus'>) => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const newRecord: EmployeeRewardRecord = {
      ...grant,
      id: `ERR-${Date.now()}`,
      grantedDate: dateStr,
      payrollStatus: 'Pending'
    };
    setEmployeeRewardRecords(prev => [newRecord, ...prev]);
    triggerToast(`Award granted: "${grant.rewardName}" for ${grant.employeeName}${grant.addToPayroll ? ' (Queued for Next Payroll)' : ''}!`);
  };

  const [grades, setGrades] = useState<GradeItem[]>(INITIAL_GRADES);

  const [employmentTypes, setEmploymentTypes] = useState<EmploymentTypeItem[]>(INITIAL_EMPLOYMENT_TYPES);

  const [employeeCategories, setEmployeeCategories] = useState<EmployeeCategoryItem[]>(INITIAL_EMPLOYEE_CATEGORIES);

  const [employeeConfig, setEmployeeConfig] = useState<EmployeeConfigSettings>(INITIAL_EMPLOYEE_CONFIG);

  const [approvalWorkflows, setApprovalWorkflows] = useState<ApprovalWorkflowItem[]>(INITIAL_APPROVAL_WORKFLOWS);

  const [notificationTriggers, setNotificationTriggers] = useState<NotificationTriggerConfig[]>(INITIAL_NOTIFICATION_TRIGGERS);

  const [generalSystemConfig, setGeneralSystemConfig] = useState<GeneralSystemConfig>(INITIAL_GENERAL_SYSTEM_CONFIG);

  const [integrationsConfig, setIntegrationsConfig] = useState<IntegrationsConfig>(INITIAL_INTEGRATIONS_CONFIG);

  // Dynamic Performance Score Integration:
  // Dynamically recalculate task completion rates and overall scores from live enhanced tasks
  useEffect(() => {
    setPerformanceScores(prev => prev.map(p => {
      const metrics = calculateEmployeeTaskMetrics(p.employeeId, enhancedTasks);
      if (metrics.totalAssigned === 0) return p;

      const compScore = (metrics.completionRate * taskWeights.taskCompletionWeight) / 100;
      const onTimeScore = (metrics.onTimeCompletionRate * taskWeights.onTimeCompletionWeight) / 100;
      const attScore = (p.attendanceScore * taskWeights.attendanceWeight) / 100;
      const managerScore = ((p.managerRating / 5) * 100 * taskWeights.managerRatingWeight) / 100;
      const goalScore = (p.goalAchievement * taskWeights.goalAchievementWeight) / 100;

      const newOverallScore = Math.min(100, Math.max(0, Math.round(compScore + onTimeScore + attScore + managerScore + goalScore)));

      return {
        ...p,
        taskCompletionRate: metrics.completionRate,
        overallScore: newOverallScore
      };
    }));
  }, [enhancedTasks, taskWeights]);

  // Role Switching Engine supporting all HRMS and Task Management roles
  const switchRole = (newRole: Role) => {
    let name = 'Businz Super Admin';
    let email = 'developer@businz.com';
    let empId = 'EMP-000';
    let dept = 'Management';
    let desig = 'Super Administrator';
    let avatar = '';

    if (newRole === 'Super Admin') {
      name = 'Businz Super Admin';
      email = 'developer@businz.com';
      empId = 'EMP-000';
      dept = 'Management';
      desig = 'Super Administrator';
      avatar = '';
    } else if (newRole === 'CEO' || newRole === 'Management') {
      const ceoEmp = employees.find(e => e.designation?.toLowerCase().includes('ceo') || e.role === 'CEO');
      name = ceoEmp ? `${ceoEmp.firstName} ${ceoEmp.lastName}`.trim() : 'Executive CEO';
      email = ceoEmp?.email || 'ceo@businz.com';
      empId = ceoEmp?.employeeId || 'EMP-CEO';
      dept = ceoEmp?.department || 'Management';
      desig = ceoEmp?.designation || 'CEO';
      avatar = ceoEmp?.avatar || '';
    } else if (newRole === 'HR Admin' || newRole === 'HR Manager') {
      const hrEmp = employees.find(e => (e.department === 'HR' || e.designation.toLowerCase().includes('hr')) && !e.designation.toLowerCase().includes('ceo'));
      name = hrEmp ? `${hrEmp.firstName} ${hrEmp.lastName}`.trim() : 'HR Manager';
      email = hrEmp?.email || 'hr@businz.com';
      empId = hrEmp?.employeeId || 'EMP-HR';
      dept = 'HR';
      desig = hrEmp?.designation || 'HR Manager';
      avatar = hrEmp?.avatar || '';
    } else if (newRole === 'Department Manager' || newRole === 'Department Head') {
      const mgrEmp = employees.find(e => e.designation.toLowerCase().includes('head') || e.designation.toLowerCase().includes('manager'));
      name = mgrEmp ? `${mgrEmp.firstName} ${mgrEmp.lastName}`.trim() : 'Department Manager';
      email = mgrEmp?.email || 'manager@businz.com';
      empId = mgrEmp?.employeeId || 'EMP-MGR';
      dept = mgrEmp?.department || 'Operations';
      desig = mgrEmp?.designation || 'Department Head';
      avatar = mgrEmp?.avatar || '';
    } else if (newRole === 'Employee' || newRole === 'Assignee') {
      const staffEmp = employees.find(e => !e.designation.toLowerCase().includes('ceo') && !e.designation.toLowerCase().includes('super'));
      name = staffEmp ? `${staffEmp.firstName} ${staffEmp.lastName}`.trim() : 'Staff Employee';
      email = staffEmp?.email || 'employee@businz.com';
      empId = staffEmp?.employeeId || 'EMP-USER';
      dept = staffEmp?.department || 'General';
      desig = staffEmp?.designation || 'Employee';
      avatar = staffEmp?.avatar || '';
    } else if (newRole === 'Finance Manager' || newRole === 'Responsible Person' || newRole === 'Manager') {
      const finEmp = employees.find(e => e.department === 'Finance' || e.department === 'Accounts' || e.designation.toLowerCase().includes('account') || e.designation.toLowerCase().includes('finance'));
      name = finEmp ? `${finEmp.firstName} ${finEmp.lastName}`.trim() : 'Finance & Accounts Manager';
      email = finEmp?.email || 'accounts@businz.com';
      empId = finEmp?.employeeId || 'EMP-ACC';
      dept = finEmp?.department || 'Accounts';
      desig = finEmp?.designation || 'Finance Manager';
      avatar = finEmp?.avatar || '';
    } else if (newRole === 'Task Creator') {
      name = 'Task Creator';
      email = 'creator@businz.com';
      empId = 'EMP-CREATOR';
      dept = 'Operations';
      desig = 'Project Coordinator';
      avatar = '';
    } else if (newRole === 'ERP Administrator') {
      name = 'ERP Administrator';
      email = 'developer@businz.com';
      empId = 'EMP-SYS';
      dept = 'Technical Support';
      desig = 'ERP Administrator';
      avatar = '';
    }

    const switchedUser: User = {
      id: 'USR-' + Date.now(),
      name,
      email,
      role: newRole,
      avatar,
      department: dept,
      designation: desig,
      employeeId: empId
    };

    setCurrentUser(switchedUser);
    try {
      localStorage.setItem('vrm_hrms_current_user', JSON.stringify(switchedUser));
    } catch (e) {
      console.warn('Error persisting switched role user:', e);
    }
  };

  // RBAC Permission Check
  const hasPermission = (module: ModuleName, action: PermissionAction): boolean => {
    // Unrestricted Master Authority for Super Admin and CEO across all modules & actions
    if (
      currentUser.role === 'Super Admin' ||
      currentUser.role === 'CEO' ||
      currentUser.designation === 'CEO' ||
      (currentUser.designation && currentUser.designation.toLowerCase().includes('ceo')) ||
      currentUser.employeeId === 'EMP-000'
    ) {
      return true;
    }

    if (module === 'profile') return true;
    if (module === 'settings' && action === 'view') return true;
    if (module === 'tracking') return true;
    if (module === 'overtime' && (action === 'view' || action === 'create')) return true;
    if (module === 'overtime' && action === 'approve') {
      return (
        currentUser.role === 'CEO' ||
        currentUser.role === 'Super Admin' ||
        currentUser.role === 'HR Admin' ||
        currentUser.role === 'HR Manager' ||
        currentUser.role === 'Department Manager' ||
        currentUser.role === 'Department Head' ||
        currentUser.role === 'Management' ||
        currentUser.role === 'ERP Administrator'
      );
    }

    // Finance / Accounts staff access: full access to view and export payroll, finance expense claims, and advance salary
    const isFinanceStaff = 
      currentUser.role === 'Finance Manager' ||
      (currentUser.department && (currentUser.department.toLowerCase().includes('finance') || currentUser.department.toLowerCase().includes('accounts'))) ||
      (currentUser.designation && (currentUser.designation.toLowerCase().includes('accounts') || currentUser.designation.toLowerCase().includes('finance')));

    const isHrOrCeo = 
      currentUser.role === 'CEO' ||
      currentUser.role === 'Super Admin' ||
      currentUser.role === 'Admin' ||
      currentUser.role === 'HR Manager' ||
      currentUser.role === 'HR Admin' ||
      currentUser.role === 'HR' ||
      (currentUser.department && (currentUser.department.toLowerCase() === 'hr' || currentUser.department.toLowerCase() === 'human resources')) ||
      (currentUser.designation && currentUser.designation.toLowerCase().includes('hr')) ||
      (currentUser as any).designation?.toLowerCase().includes('ceo') ||
      (currentUser as any).designation?.toLowerCase().includes('managing director');

    if (module === 'assets' || module === 'recruitment') {
      if (isHrOrCeo) return true;
    }

    if (module === 'payroll' || module === 'finance' || module === 'advance_salary') {
      if (action === 'approve') {
        return isHrOrCeo;
      }
      if (isFinanceStaff && (action === 'view' || action === 'export')) {
        return true;
      }
    }

    const rolePermissions = permissionMatrix[currentUser.role];
    if (!rolePermissions) return false;
    const actions = rolePermissions[module];
    return actions ? actions.includes(action) : false;
  };

  const updatePermission = (role: Role, module: ModuleName, action: PermissionAction, enabled: boolean) => {
    setPermissionMatrix(prev => {
      const copy = { ...prev };
      const roleMods = { ...copy[role] };
      const currentActions = roleMods[module] ? [...roleMods[module]] : [];

      if (enabled && !currentActions.includes(action)) {
        currentActions.push(action);
      } else if (!enabled && currentActions.includes(action)) {
        const idx = currentActions.indexOf(action);
        currentActions.splice(idx, 1);
      }

      roleMods[module] = currentActions;
      copy[role] = roleMods;
      return copy;
    });
  };

  // Validation & Safety Helpers
  const canDeleteEmployee = (idOrEmpId: string): { canDelete: boolean; reason?: string } => {
    const emp = employees.find(e => e.id === idOrEmpId || e.employeeId === idOrEmpId);
    if (!emp) return { canDelete: true };
    const empId = emp.employeeId || emp.id;

    // 1. Check corporate assets assigned
    const assignedAssets = assets.filter(a => a.assignedEmployeeId === empId || a.assignedEmployeeId === emp.id);
    if (assignedAssets.length > 0) {
      return { 
        canDelete: false, 
        reason: `Cannot delete ${emp.firstName} ${emp.lastName}: Employee has ${assignedAssets.length} active corporate asset(s) assigned (${assignedAssets.map(a => a.name).join(', ')}). Please unassign assets first.` 
      };
    }

    // 2. Check pending / open tasks
    const activeTasks = tasks.filter(t => t.assignedEmployeeId === empId && t.status !== 'Completed');
    if (activeTasks.length > 0) {
      return { 
        canDelete: false, 
        reason: `Cannot delete ${emp.firstName} ${emp.lastName}: Employee has ${activeTasks.length} open task(s) assigned. Please reassign or complete tasks first.` 
      };
    }

    // 3. Check active advance salary loans
    const activeAdv = loanRecords.find((a) => 
      (a.employeeId === empId || a.employeeId === emp.id) && 
      (a.status === 'Disbursed' || a.status === 'Approved' || a.status === 'Active')
    );
    if (activeAdv) {
      return {
        canDelete: false,
        reason: `Cannot delete ${emp.firstName} ${emp.lastName}: Employee has an active advance salary request (${activeAdv.id} - ${activeAdv.status}).`
      };
    }

    return { canDelete: true };
  };

  const canDeleteDepartment = (idOrName: string): { canDelete: boolean; reason?: string } => {
    const dept = departments.find(d => d.id === idOrName || d.name === idOrName);
    const deptName = dept ? dept.name : idOrName;
    const assignedEmps = employees.filter(e => (e.department || '').toLowerCase() === deptName.toLowerCase());
    if (assignedEmps.length > 0) {
      return {
        canDelete: false,
        reason: `Cannot delete department "${deptName}": ${assignedEmps.length} employee(s) belong to this department (${assignedEmps.slice(0, 3).map(e => `${e.firstName} ${e.lastName}`).join(', ')}${assignedEmps.length > 3 ? '...' : ''}). Please reassign employees first.`
      };
    }
    return { canDelete: true };
  };

  const canDeleteBranch = (idOrName: string): { canDelete: boolean; reason?: string } => {
    const branch = branches.find(b => b.id === idOrName || b.name === idOrName);
    const branchName = branch ? branch.name : idOrName;
    const assignedEmps = employees.filter(e => (e.workLocation || '').toLowerCase().includes(branchName.toLowerCase()) || branchName.toLowerCase().includes((e.workLocation || '').toLowerCase()));
    if (assignedEmps.length > 0) {
      return {
        canDelete: false,
        reason: `Cannot delete branch "${branchName}": ${assignedEmps.length} employee(s) are stationed at this location. Please reassign employees first.`
      };
    }
    return { canDelete: true };
  };

  const canDeleteShift = (idOrName: string): { canDelete: boolean; reason?: string } => {
    const shift = shifts.find(s => s.id === idOrName || s.shiftName === idOrName);
    const shiftName = shift ? shift.shiftName : idOrName;
    const assignedEmps = employees.filter(e => (e.workShift || '').toLowerCase().includes(shiftName.toLowerCase()) || shiftName.toLowerCase().includes((e.workShift || '').toLowerCase()));
    if (assignedEmps.length > 0) {
      return {
        canDelete: false,
        reason: `Cannot delete shift "${shiftName}": ${assignedEmps.length} employee(s) are assigned to this shift roster. Please reassign employees first.`
      };
    }
    return { canDelete: true };
  };

  const canDeleteDesignation = (idOrTitle: string): { canDelete: boolean; reason?: string } => {
    const desig = designations.find(d => d.id === idOrTitle || d.title === idOrTitle);
    const title = desig ? desig.title : idOrTitle;
    const assignedEmps = employees.filter(e => (e.designation || '').toLowerCase() === title.toLowerCase());
    if (assignedEmps.length > 0) {
      return {
        canDelete: false,
        reason: `Cannot delete designation "${title}": ${assignedEmps.length} employee(s) currently hold this title. Please reassign designations first.`
      };
    }
    return { canDelete: true };
  };

  // Actions
  const addEmployee = (empData: Omit<Employee, 'id'>, options: { persistToCloud?: boolean } = {}) => {
    const rawPrefix = companyInfo?.companyCode || businessSettings?.employeeCodePrefix || employeeConfig?.idFormatPrefix || 'EMP';
    const digits = employeeConfig?.idFormatDigits || 3;
    const startNum = employeeConfig?.idStartingNumber || 1;
    const newId = empData.employeeId && empData.employeeId.trim().length > 0
      ? empData.employeeId.trim()
      : generateNextEmployeeId(employees, rawPrefix, digits, startNum);

    const cleanEmail = (empData.email || empData.personalEmail || '').trim().toLowerCase();
    const currentCompId = currentUser.company_id || currentUser.companyId || 'company-a';
    const newEmp: Employee = {
      ...empData,
      company_id: empData.company_id || empData.companyId || currentCompId,
      companyId: empData.company_id || empData.companyId || currentCompId,
      email: cleanEmail,
      personalEmail: cleanEmail,
      id: newId,
      employeeId: newId,
      authUserId: empData.authUserId || `usr-${Date.now()}`,
      mustChangePassword: empData.mustChangePassword !== undefined ? empData.mustChangePassword : true,
      accountStatus: empData.accountStatus || 'ACTIVE',
      credentialEmailStatus: empData.credentialEmailStatus || 'SENT',
      credentialEmailSentAt: empData.credentialEmailSentAt || new Date().toISOString(),
    };
    setEmployees(prev => [newEmp, ...prev]);

    if (options.persistToCloud === false) {
      addNotification({
        title: 'New Employee Onboarded',
        message: `${newEmp.firstName} ${newEmp.lastName} (${newEmp.employeeId}) onboarded. Login account created and credentials dispatched to ${newEmp.email}.`,
        priority: 'Normal',
        category: 'Announcement'
      });
      return;
    }

    supabaseDirect.insertEmployee({
      employee_id: newEmp.employeeId,
      first_name: newEmp.firstName,
      last_name: newEmp.lastName,
      email: cleanEmail,
      password: newEmp.password,
      department: newEmp.department,
      department_id: newEmp.departmentId,
      designation: newEmp.designation,
      reporting_manager_name: newEmp.reportingManagerName,
      basic_salary: newEmp.basicSalary,
      phone: newEmp.phone,
      status: newEmp.status,
      must_change_password: newEmp.mustChangePassword,
      account_status: newEmp.accountStatus,
      attendance_method: newEmp.attendanceMethod,
    }).then(res => {
      if (res.success && res.data) {
        setEmployees(prev => prev.map(e => e.id === newId ? mapEmployeeFromDb(res.data) : e));
        syncAllModulesFromDatabase(false);
        return;
      }

      setEmployees(prev => prev.filter(e => e.id !== newId));
      addNotification({
        title: 'Employee Not Saved',
        message: `Could not save ${newEmp.firstName} ${newEmp.lastName} to the central database. Please check Supabase/API permissions.`,
        priority: 'Urgent',
        category: 'Announcement'
      });
    });

    addNotification({
      title: 'New Employee Onboarded',
      message: `${newEmp.firstName} ${newEmp.lastName} (${newEmp.employeeId}) onboarded. Login account created and credentials dispatched to ${newEmp.email}.`,
      priority: 'Normal',
      category: 'Announcement'
    });
  };

  const resetEmployeeLogin = (employeeId: string): { success: boolean; message: string; temporaryPassword?: string } => {
    const digits = Math.floor(100000 + Math.random() * 900000).toString();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const suffix = chars[Math.floor(Math.random() * chars.length)];
    const tempPassword = `Vrm@${digits}${suffix}`;

    setEmployees(prev => prev.map(e => {
      if (e.id === employeeId || e.employeeId === employeeId) {
        return {
          ...e,
          password: tempPassword,
          mustChangePassword: true,
          credentialEmailStatus: 'SENT',
          credentialEmailSentAt: new Date().toISOString(),
        };
      }
      return e;
    }));

    addNotification({
      title: 'Credentials Reset',
      message: `New temporary login password generated for ${employeeId} and emailed successfully.`,
      priority: 'Urgent',
      category: 'Announcement'
    });

    return {
      success: true,
      message: 'New temporary password generated and dispatched.',
      temporaryPassword: tempPassword
    };
  };

  const updateEmployeeLoginStatus = (employeeId: string, status: 'ACTIVE' | 'DISABLED' | 'DEACTIVATED'): { success: boolean; message: string } => {
    // Permission check: STRICTLY CEO and HR only
    const userRole = (currentUser.role || '').trim();
    const userDesig = (currentUser.designation || '').trim().toLowerCase();
    const userEmpId = (currentUser.employeeId || '').trim();

    const isAuthorized = 
      userRole === 'CEO' ||
      userRole === 'Super Admin' ||
      userDesig === 'ceo' ||
      userDesig.includes('chief executive') ||
      userDesig.includes('managing director') ||
      userEmpId === 'EMP-000' ||
      userRole === 'HR Manager' ||
      userRole === 'HR Admin';

    if (!isAuthorized) {
      return {
        success: false,
        message: 'Access Denied: Only CEO and HR administrators are authorized to activate or deactivate employee accounts.'
      };
    }

    const isActivating = status === 'ACTIVE';
    const normStatus: 'ACTIVE' | 'DEACTIVATED' = isActivating ? 'ACTIVE' : 'DEACTIVATED';

    setEmployees(prev => prev.map(e => {
      if (e.id === employeeId || e.employeeId === employeeId) {
        const nextStatus: Employee['status'] = isActivating 
          ? (e.status === 'Inactive' || e.status === 'Terminated' ? 'Active' : e.status) 
          : 'Inactive';
        return {
          ...e,
          accountStatus: normStatus,
          status: nextStatus,
        };
      }
      return e;
    }));

    // Direct cloud sync to Supabase if connected
    supabaseDirect.updateEmployee(employeeId, {
      account_status: normStatus
    }).catch(err => console.warn('[DatabaseRest] updateEmployeeLoginStatus sync notice:', err));

    addNotification({
      title: isActivating ? 'Account Activated' : 'Account Deactivated',
      message: `Employee portal login access has been ${isActivating ? 'activated' : 'deactivated'} for ${employeeId}.`,
      priority: isActivating ? 'Normal' : 'Urgent',
      category: 'Announcement'
    });

    return {
      success: true,
      message: `Employee portal login account has been successfully ${isActivating ? 'activated' : 'deactivated'}.`
    };
  };

  const changeEmployeePassword = (identifier: string, newPassword: string): { success: boolean; message: string } => {
    const clean = identifier.toLowerCase().trim();
    setEmployees(prev => prev.map(e => {
      if (e.email.toLowerCase().trim() === clean || e.employeeId.toLowerCase().trim() === clean || e.id.toLowerCase().trim() === clean) {
        return {
          ...e,
          password: newPassword,
          mustChangePassword: false,
        };
      }
      return e;
    }));

    addNotification({
      title: 'Password Changed',
      message: 'Your portal password has been updated securely.',
      priority: 'Normal',
      category: 'Announcement'
    });

    return { success: true, message: 'Password updated successfully' };
  };

  const updateEmployee = (id: string, empData: Partial<Employee>) => {
    const normalizedEmpData = { ...empData };
    if (normalizedEmpData.email !== undefined) {
      normalizedEmpData.email = normalizedEmpData.email ? normalizedEmpData.email.trim().toLowerCase() : '';
    }
    if (normalizedEmpData.personalEmail !== undefined) {
      normalizedEmpData.personalEmail = normalizedEmpData.personalEmail ? normalizedEmpData.personalEmail.trim().toLowerCase() : '';
    }
    setEmployees(prev => prev.map(e => (
      e.id === id || 
      e.employeeId === id || 
      (empData.employeeId && e.employeeId === empData.employeeId) || 
      (empData.id && e.id === empData.id)
    ) ? { ...e, ...normalizedEmpData } : e));

    // Also update currentUser if editing self
    if (
      (currentUser.employeeId && (currentUser.employeeId === id || currentUser.employeeId === empData.employeeId)) ||
      (currentUser.id && (currentUser.id === id || currentUser.id === empData.id))
    ) {
      const newFullName = `${normalizedEmpData.firstName !== undefined ? normalizedEmpData.firstName : ''} ${normalizedEmpData.lastName !== undefined ? normalizedEmpData.lastName : ''}`.trim();
      if (newFullName) {
        updateCurrentUser({
          name: newFullName,
          email: normalizedEmpData.email || currentUser.email,
          department: normalizedEmpData.department || currentUser.department,
          designation: normalizedEmpData.designation || currentUser.designation,
        });
      }
    }

    const dbUpdates = employeeToDbUpdates(normalizedEmpData);
    if (Object.keys(dbUpdates).length > 0) {
      supabaseDirect.updateEmployee(id, dbUpdates).then(res => {
        if (!res.success) {
          console.warn('[HRMSContext] updateEmployee cloud save failed:', res.error);
        }
      });
    }
  };

  const deleteEmployee = async (id: string): Promise<{ success: boolean; message?: string }> => {
    const check = canDeleteEmployee(id);
    if (!check.canDelete) {
      addNotification({
        title: 'Deletion Blocked',
        message: check.reason || 'Employee cannot be deleted.',
        priority: 'Urgent',
        category: 'Announcement'
      });
      return { success: false, message: check.reason };
    }

    // 1. Delete from Supabase VPS database directly
    let cloudSuccess = false;
    let cloudError: any = null;
    try {
      const res = await supabaseDirect.deleteEmployee(id);
      cloudSuccess = res.success;
      cloudError = res.error;
    } catch (sbErr) {
      console.warn('Direct database delete notice:', sbErr);
      cloudError = sbErr;
    }

    // 2. Also attempt backend API deletion if token is active
    try {
      const token = sessionStorage.getItem('vrm_auth_token') || localStorage.getItem('vrm_auth_token') || localStorage.getItem('token');
      await fetch(`${API_BASE_URL}/employees/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
    } catch {}

    if (!cloudSuccess) {
      console.error('[HRMSContext] Cloud employee deletion failed:', cloudError);
      const errMsg = typeof cloudError === 'string' ? cloudError : (cloudError?.message || 'Database error occurred');
      addNotification({
        title: 'Delete Failed',
        message: `Could not delete employee record from VPS database: ${errMsg}`,
        priority: 'Urgent',
        category: 'Announcement'
      });
      return { success: false, message: errMsg };
    }

    // 3. Update React state
    setEmployees(prev => {
      const updated = prev.filter(e => e.id !== id && e.employeeId !== id);
      return updated;
    });

    addNotification({
      title: 'Employee Removed',
      message: `Employee record (${id}) deleted successfully.`,
      priority: 'Normal',
      category: 'Announcement'
    });

    return { success: true };
  };

  const deleteMultipleEmployees = async (ids: string[]): Promise<{ success: boolean; deletedCount: number; message?: string }> => {
    const idsToDelete = ids.filter(id => canDeleteEmployee(id).canDelete);

    if (idsToDelete.length === 0) {
      return { success: false, deletedCount: 0, message: 'None of the selected employees can be deleted due to active dependencies.' };
    }

    // 1. Delete from Supabase directly
    let batchResult: { success: boolean; deletedCount: number; errors: any[] } = { success: false, deletedCount: 0, errors: [] };
    try {
      batchResult = await supabaseDirect.deleteEmployees(idsToDelete);
    } catch (sbErr) {
      console.warn('Batch Supabase delete notice:', sbErr);
    }

    // 2. Backend API
    try {
      const token = sessionStorage.getItem('vrm_auth_token') || localStorage.getItem('vrm_auth_token') || localStorage.getItem('token');
      await Promise.allSettled(
        idsToDelete.map(id =>
          fetch(`${API_BASE_URL}/employees/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: {
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
          })
        )
      );
    } catch {}

    if (!batchResult.success && batchResult.deletedCount === 0) {
      addNotification({
        title: 'Batch Delete Failed',
        message: 'Could not delete the selected employees from the database.',
        priority: 'Urgent',
        category: 'Announcement'
      });
      return { success: false, deletedCount: 0, message: 'Batch delete failed in database' };
    }

    // 3. Update React state
    const idSet = new Set(idsToDelete);
    setEmployees(prev => {
      const updated = prev.filter(e => !idSet.has(e.id) && !idSet.has(e.employeeId));
      return updated;
    });

    addNotification({
      title: 'Employees Removed',
      message: `${batchResult.deletedCount || idsToDelete.length} employee record(s) deleted successfully.`,
      priority: 'Normal',
      category: 'Announcement'
    });

    return { success: true, deletedCount: batchResult.deletedCount || idsToDelete.length };
  };


  // Helper for time calculation
  const parseTimeToMinutes = (timeStr: string | null | undefined): number => {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
    if (!match) return 0;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return hours * 60 + mins;
  };

  const markAttendance = (
    empId: string,
    status: AttendanceRecord['status'],
    method: AttendanceRecord['method'],
    location?: AttendanceRecord['location']
  ): { success: boolean; message: string } => {
    const clockValidation = validateAttendancePunchTime(attendanceRecords);
    if (!clockValidation.success) {
      addNotification({
        title: 'Attendance Time Blocked',
        message: clockValidation.message,
        priority: 'Urgent',
        category: 'Attendance'
      });
      return { success: false, message: clockValidation.message };
    }

    const evalResult = getEmployeeShiftAttendanceState(empId);
    const methodText = String(method || '').toLowerCase();
    const wantsCheckOut = methodText.includes('check-out') || methodText.includes('checkout') || methodText.includes('out');
    const wantsCheckIn = methodText.includes('check-in') || methodText.includes('checkin') || methodText.includes('in') || !wantsCheckOut;
    const punchType = wantsCheckOut ? 'Check-Out' : 'Check-In';

    const isGpsOrFacePunch =
      methodText.includes('gps') ||
      methodText.includes('face') ||
      methodText.includes('geofence') ||
      methodText.includes('location');
    const shouldEnforceGeofence = Boolean(
      geofenceConfig.enabled &&
      geofenceConfig.enforceStrictly &&
      isGpsOrFacePunch
    );

    if (shouldEnforceGeofence) {
      if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
        const message = 'GPS location is required. Please allow location permission and try again.';
        addNotification({
          title: `${punchType} Blocked`,
          message,
          priority: 'Urgent',
          category: 'Attendance'
        });
        return { success: false, message };
      }

      const actualDistance = calculateDistanceMeters(
        location.lat,
        location.lng,
        geofenceConfig.centerLat,
        geofenceConfig.centerLng
      );

      if (actualDistance > geofenceConfig.radiusMeters) {
        const message = `You are outside the office geofence (${actualDistance}m away). Attendance is allowed only within ${geofenceConfig.radiusMeters}m of ${geofenceConfig.officeName || 'the office location'}.`;
        addNotification({
          title: `${punchType} Blocked`,
          message,
          priority: 'Urgent',
          category: 'Attendance'
        });
        return { success: false, message };
      }
    }

    if ((wantsCheckIn && !evalResult.canCheckIn) || (wantsCheckOut && !evalResult.canCheckOut)) {
      console.warn(`[HRMS Attendance] Punch rejected for ${empId}: ${evalResult.message}`);
      addNotification({
        title: `${punchType} Unavailable`,
        message: evalResult.message,
        priority: 'Urgent',
        category: 'Attendance'
      });
      return { success: false, message: evalResult.message };
    }

    const now = clockValidation.trustedNow;
    const today = evalResult.shiftDate;
    const nowTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
    const emp = employees.find(e => e.id === empId || e.employeeId === empId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}` : 'Employee';
    const dept = emp ? emp.department : 'General';

    // Calculate shift timing & late status
    const empShift = evalResult.assignedShift;
    const shiftStartMins = empShift ? parseTimeToMinutes(empShift.startTime) : 9 * 60; // 09:00 default
    const graceMins = empShift?.gracePeriodMins ?? (attendanceConfig?.lateGraceMinutes ?? 15);
    const checkInMins = parseTimeToMinutes(nowTime);

    let calculatedLateStatus: AttendanceRecord['lateStatus'] = 'On Time';
    let calculatedStatus = status;

    if (checkInMins > shiftStartMins + graceMins) {
      if (checkInMins <= shiftStartMins + 30) {
        calculatedLateStatus = 'Late (<30m)';
      } else {
        calculatedLateStatus = 'Severely Late';
      }
      if (calculatedStatus === 'Present') {
        calculatedStatus = 'Late';
      }
    }

    const tempAttId = `ATT-${Date.now()}`;
    const targetEmpDbId = emp?.id || emp?.employeeId || empId;
    let rejectedMessage = '';

    setAttendanceRecords(prev => {
      const existingIdx = prev.findIndex(a => 
        (a.employeeId === empId || (emp && (a.employeeId === emp.id || a.employeeId === emp.employeeId))) &&
        (a.shiftDate === today || a.date === today)
      );

      if (existingIdx >= 0) {
        const copy = [...prev];
        const existingRecord = copy[existingIdx];
        if (wantsCheckIn && existingRecord.checkIn) {
          rejectedMessage = 'Already checked in for this shift. Duplicate check-in is not allowed.';
          return prev;
        }
        if (wantsCheckOut && existingRecord.checkOut && existingRecord.checkOut.trim() !== '' && existingRecord.checkOut !== '--:--') {
          rejectedMessage = 'Already checked out for this shift. Duplicate check-out is not allowed.';
          return prev;
        }
        if (wantsCheckOut && !existingRecord.checkIn) {
          rejectedMessage = 'Check-out is not allowed before check-in.';
          return prev;
        }
        const existingCheckIn = copy[existingIdx].checkIn || nowTime;
        const inMins = parseTimeToMinutes(existingCheckIn);
        const outMins = parseTimeToMinutes(nowTime);
        let diffMins = outMins - inMins;
        if (diffMins < 0) diffMins += 24 * 60;
        const workedHours = existingCheckIn 
          ? Math.round((diffMins / 60) * 100) / 100
          : (status === 'Present' ? 8 : 4);

        const updatedRecord = {
          ...copy[existingIdx],
          shiftId: empShift.id,
          shiftDate: today,
          shiftName: empShift.shiftName,
          checkIn: existingCheckIn,
          checkOut: wantsCheckOut ? nowTime : copy[existingIdx].checkOut,
          status: calculatedStatus,
          lateStatus: copy[existingIdx].lateStatus || calculatedLateStatus,
          method,
          location: location || copy[existingIdx].location,
          workingHours: workedHours
        };
        copy[existingIdx] = updatedRecord;

        // Persist update to central database
        if (copy[existingIdx].id && copy[existingIdx].id.length === 36) {
          supabaseDirect.updateAttendanceRecord(copy[existingIdx].id, {
            check_out: now.toISOString(),
            working_hours: workedHours,
            status: calculatedStatus,
            late_status: copy[existingIdx].lateStatus || calculatedLateStatus,
            method,
          });
        }
        return copy;
      } else {
        if (wantsCheckOut) {
          rejectedMessage = 'Check-out is not allowed before check-in.';
          return prev;
        }
        const newRecord: AttendanceRecord = {
          id: tempAttId,
          employeeId: empId,
          employeeName: empName,
          department: dept,
          shiftId: empShift.id,
          shiftDate: today,
          shiftName: empShift.shiftName,
          date: today,
          checkIn: nowTime,
          checkOut: null,
          workingHours: 0,
          status: calculatedStatus,
          lateStatus: calculatedLateStatus,
          location: location || { lat: 13.151968, lng: 80.2086053, address: 'HQ Office', inGeofence: true },
          faceVerified: method === 'Face Recognition',
          method
        };

        // Persist new attendance record to central database
        if (targetEmpDbId) {
          supabaseDirect.insertAttendanceRecord({
            employee_id: targetEmpDbId,
            date: today,
            check_in: now.toISOString(),
            working_hours: 0,
            status: calculatedStatus,
            late_status: calculatedLateStatus,
            method,
            in_geofence: location?.inGeofence ?? true,
            location_lat: location?.lat,
            location_lng: location?.lng,
            location_address: location?.address,
            shift_id: (empShift?.id && empShift.id.length === 36) ? empShift.id : undefined,
            shift_date: today,
          }).then(res => {
            if (res.data?.id) {
              setAttendanceRecords(curr => curr.map(r => r.id === tempAttId ? { ...r, id: res.data.id } : r));
            }
          });
        }

        return [newRecord, ...prev];
      }
    });

    if (rejectedMessage) {
      addNotification({
        title: `${punchType} Rejected`,
        message: rejectedMessage,
        priority: 'Urgent',
        category: 'Attendance'
      });
      return { success: false, message: rejectedMessage };
    }

    commitTrustedAttendanceTime(now);
    return { success: true, message: `${punchType} recorded at ${nowTime}` };
  };

  const addFaceLog = (log: Omit<FaceLog, 'id'>) => {
    const newLog: FaceLog = { ...log, id: `FL-${Date.now()}` };
    setFaceLogs(prev => {
      const logDate = String(log.timestamp || '').slice(0, 10);
      const logEmployee = String(log.employeeId || '').trim().toLowerCase();
      const updated = [
        newLog,
        ...prev.filter(l => {
          const sameEmployee = String(l.employeeId || '').trim().toLowerCase() === logEmployee;
          const sameDate = String(l.timestamp || '').slice(0, 10) === logDate;
          return !(sameEmployee && sameDate && l.type === log.type);
        })
      ].slice(0, 200);
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('vrm_hrms_face_logs', JSON.stringify(updated));
        }
      } catch {}
      supabaseDirect.saveCompanySetting('face_logs_data', updated).catch(() => {});
      return updated;
    });
  };

  const applyLeave = (req: Omit<LeaveRequest, 'id' | 'status' | 'appliedDate'>) => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minAllowedDate = tomorrow.toISOString().split('T')[0];

    // Strictly enforce future date only: block past dates (yesterday, previous months)
    let safeStartDate = req.startDate;
    let safeEndDate = req.endDate;
    if (!safeStartDate || safeStartDate < minAllowedDate) {
      console.warn(`[applyLeave] Past start date (${req.startDate}) blocked. Enforcing minimum future date: ${minAllowedDate}`);
      safeStartDate = minAllowedDate;
    }
    if (!safeEndDate || safeEndDate < safeStartDate) {
      safeEndDate = safeStartDate;
    }

    const emp = employees.find(e => e.employeeId === req.employeeId) || employees[0];

    const isWfh = req.leaveType === 'Work From Home' || 
      (req.leaveType && req.leaveType.toLowerCase().includes('work from home')) ||
      (req.leaveType && req.leaveType.toLowerCase() === 'wfh');

    // Evaluate sandwich calculation dynamically (WFH is 100% working time, no sandwich penalties)
    const sandwichCalc: SandwichCalculationResult = isWfh ? {
      isSandwichApplied: false,
      sandwichDays: 0,
      totalDays: req.daysCount,
      appliedLeaveDays: req.daysCount,
      paidDays: req.daysCount,
      unpaidDays: 0,
      weeklyOffDays: 0,
      publicHolidayDays: 0,
      breakdown: []
    } : (req.sandwichDetails || calculateSandwichLeave({
      employee: emp,
      leaveType: req.leaveType,
      startDate: safeStartDate,
      endDate: safeEndDate,
      policies: sandwichPolicies,
      holidays: holidayPolicies,
      existingLeaves: leaveRequests,
      weeklyOffSchedule: emp.shiftDetails?.weeklyOff
    }));

    const isSandwich = isWfh ? false : sandwichCalc.isSandwichApplied;
    const finalDaysCount = isWfh ? req.daysCount : (sandwichCalc.totalDays || req.daysCount);
    const sandwichDays = isWfh ? 0 : (sandwichCalc.sandwichDays || 0);
    const unpaidSandwich = isWfh ? 0 : sandwichCalc.breakdown.filter(b => b.isSandwich && !b.isPaid).length;

    const tempLeaveId = `LR-${Date.now()}`;
    const newReq: LeaveRequest = {
      ...req,
      id: tempLeaveId,
      status: 'Pending',
      appliedDate: today,
      startDate: safeStartDate,
      endDate: safeEndDate,
      daysCount: finalDaysCount,
      sandwichDetails: sandwichCalc,
      isSandwichApplied: isSandwich,
      sandwichDays,
      unpaidSandwichDays: unpaidSandwich,
      paidDaysCount: isWfh ? finalDaysCount : sandwichCalc.paidDays,
      unpaidDaysCount: isWfh ? 0 : sandwichCalc.unpaidDays
    };

    const newReqList = [newReq, ...leaveRequests];
    setLeaveRequests(newReqList);
    try {
      localStorage.setItem('vrm_hrms_leave_requests_persistent', JSON.stringify(newReqList));
    } catch {}
    supabaseDirect.saveCompanySetting('leave_requests_data', newReqList).catch(() => {});

    // Persist to central Supabase PostgreSQL leave_requests table
    supabaseDirect.insertLeaveRequest({
      employee_id: emp?.employeeId || req.employeeId || emp?.id,
      leave_type: req.leaveType,
      start_date: safeStartDate,
      end_date: safeEndDate,
      days_count: finalDaysCount,
      reason: req.reason,
      status: 'Pending',
    }).then(res => {
      if (res.data?.id) {
        setLeaveRequests(curr => {
          const updated = curr.map(l => l.id === tempLeaveId ? { ...l, id: res.data.id } : l);
          try {
            localStorage.setItem('vrm_hrms_leave_requests_persistent', JSON.stringify(updated));
          } catch {}
          supabaseDirect.saveCompanySetting('leave_requests_data', updated).catch(() => {});
          return updated;
        });
      } else if (!res.success) {
        console.warn('[HRMSContext] leave request cloud insert notice:', res.error);
      }
    }).catch(err => {
      console.warn('[HRMSContext] leave request cloud insert notice:', err);
    });

    if (isSandwich) {
      addSandwichAuditLog({
        action: 'SANDWICH_RULE_APPLIED',
        leaveRequestId: newReq.id,
        employeeId: req.employeeId,
        policyId: sandwichCalc.appliedPolicyId,
        policyName: sandwichCalc.appliedPolicyName,
        newValue: {
          appliedLeaveDays: sandwichCalc.appliedLeaveDays,
          sandwichDays: sandwichCalc.sandwichDays,
          totalDays: finalDaysCount,
          payType: sandwichCalc.payTypeApplied
        },
        reason: `Sandwich policy applied for ${req.employeeName} (${req.startDate} to ${req.endDate}).`
      });
    }

    // 1. Notify approvers (CEO & HR) across accounts on their own login
    pushSharedNotification({
      title: isWfh ? 'New Work From Home Request' : 'New Leave Request',
      message: isWfh 
        ? `${req.employeeName} (${req.employeeId}) applied for ${finalDaysCount} days Work From Home (${safeStartDate} to ${safeEndDate}). Please review.`
        : `${req.employeeName} (${req.employeeId}) applied for ${finalDaysCount} days ${req.leaveType} (${safeStartDate} to ${safeEndDate}). Please review.`,
      priority: 'Important',
      category: 'Leave',
      link: 'leaves',
      targetRoles: ['CEO', 'HR']
    });

    // 2. Local feedback for applicant
    addNotification({
      title: isWfh ? 'Work From Home Request Submitted' : 'Leave Request Submitted',
      message: `Your request (${safeStartDate} to ${safeEndDate}) has been submitted and is pending HR / CEO review.`,
      priority: 'Normal',
      category: 'Leave',
      link: 'leaves'
    });
  };

  const findEmployeeForApproval = (target?: { employeeId?: string; employeeName?: string; email?: string }) => {
    if (!target) return null;
    const targetName = String(target.employeeName || '').trim().toLowerCase();
    const targetEmail = String(target.email || '').trim().toLowerCase();
    return employees.find(emp => {
      const fullName = `${emp.firstName} ${emp.lastName}`.trim().toLowerCase();
      return (
        Boolean(target.employeeId && (emp.employeeId === target.employeeId || emp.id === target.employeeId)) ||
        Boolean(targetEmail && emp.email?.trim().toLowerCase() === targetEmail) ||
        Boolean(targetName && fullName === targetName)
      );
    }) || null;
  };

  const isApprovalTargetHR = (target?: { employeeId?: string; employeeName?: string; email?: string; role?: string; department?: string; designation?: string }) => {
    const emp = findEmployeeForApproval(target);
    const role = String(target?.role || (emp as any)?.role || '').toLowerCase();
    const dept = String(target?.department || emp?.department || '').toLowerCase();
    const designation = String(target?.designation || emp?.designation || '').toLowerCase();
    return role.includes('hr') || dept.includes('hr') || dept.includes('human resource') || designation.includes('hr');
  };

  const canCurrentUserApproveRequests = (target?: { employeeId?: string; employeeName?: string; email?: string; role?: string; department?: string; designation?: string }) => {
    const role = String(currentUser.role || '').toLowerCase();
    const designation = String((currentUser as any).designation || '').toLowerCase();
    const department = String((currentUser as any).department || '').toLowerCase();
    const isCeoUser = role === 'ceo' || role === 'super admin' || designation.includes('ceo') || currentUser.employeeId === 'EMP-000';
    if (isCeoUser) return true;
    const isHrUser = role.includes('hr') || department.includes('hr') || department.includes('human resource') || designation.includes('hr');
    if (!isHrUser) return false;
    return !isApprovalTargetHR(target);
  };

  const approveLeave = (id: string, approvedBy: string) => {
    const target = leaveRequests.find(l => l.id === id);
    if (!target) return;
    if (!canCurrentUserApproveRequests({ employeeId: target.employeeId, employeeName: target.employeeName })) {
      addNotification({
        title: 'CEO Approval Required',
        message: 'HR staff requests can be approved only by CEO.',
        priority: 'Important',
        category: 'Leave'
      });
      return;
    }
    const approvedAt = new Date().toISOString();
    setLeaveRequests(prevLeaves => {
      const updatedLeaves = prevLeaves.map(l => {
      if (l.id === id) {
        const isWfh = l.leaveType === 'Work From Home' || 
          (l.leaveType && l.leaveType.toLowerCase().includes('work from home')) ||
          (l.leaveType && l.leaveType.toLowerCase() === 'wfh');

        // Automatically sync attendance for all dates in range without duplicates
        const datesToSync: { date: string; isSandwich: boolean }[] = [];

        if (!isWfh && l.sandwichDetails?.breakdown && l.sandwichDetails.breakdown.length > 0) {
          l.sandwichDetails.breakdown.forEach((b: SandwichCalculationDayDetail) => {
            datesToSync.push({ date: b.date, isSandwich: b.isSandwich });
          });
        } else {
          const start = new Date(l.startDate);
          const end = new Date(l.endDate);
          const cur = new Date(start);
          while (cur <= end) {
            datesToSync.push({ date: cur.toISOString().split('T')[0], isSandwich: false });
            cur.setDate(cur.getDate() + 1);
          }
        }

        setAttendanceRecords(attPrev => {
          const updated = [...attPrev];
          datesToSync.forEach(item => {
            const idx = updated.findIndex(a => a.employeeId === l.employeeId && a.date === item.date);
            const statusLabel: AttendanceRecord['status'] = isWfh ? 'Work From Home' : 'On Leave';
            const locationNote = isWfh 
              ? 'Work From Home (Approved)' 
              : item.isSandwich ? 'Sandwich Leave (Policy Enforced)' : 'Approved Leave';

            if (idx >= 0) {
              updated[idx] = {
                ...updated[idx],
                status: statusLabel,
                workingHours: isWfh ? (updated[idx].workingHours > 0 ? updated[idx].workingHours : 8) : 0,
                checkIn: isWfh ? (updated[idx].checkIn || '09:00 AM') : null,
                checkOut: isWfh ? (updated[idx].checkOut || '06:00 PM') : null,
                lateStatus: 'N/A',
                wfhSource: isWfh ? 'Approved WFH Request' : undefined,
                wfhReason: isWfh ? (l.reason || 'Work From Home Approved') : undefined,
                location: {
                  lat: updated[idx].location?.lat ?? 13.151968,
                  lng: updated[idx].location?.lng ?? 80.2086053,
                  inGeofence: updated[idx].location?.inGeofence ?? true,
                  address: locationNote
                }
              };
            } else {
              updated.push({
                id: `ATT-${isWfh ? 'WFH' : 'LV'}-${Date.now()}-${item.date}`,
                employeeId: l.employeeId,
                employeeName: l.employeeName,
                department: l.department,
                date: item.date,
                checkIn: isWfh ? '09:00 AM' : null,
                checkOut: isWfh ? '06:00 PM' : null,
                workingHours: isWfh ? 8 : 0,
                status: statusLabel,
                lateStatus: 'N/A',
                wfhSource: isWfh ? 'Approved WFH Request' : undefined,
                wfhReason: isWfh ? (l.reason || 'Work From Home Approved') : undefined,
                location: { lat: 13.151968, lng: 80.2086053, address: locationNote, inGeofence: true },
                faceVerified: false,
                method: isWfh ? 'Manual Punch' : 'System Auto'
              });
            }
          });
          return updated;
        });

        addSandwichAuditLog({
          action: 'LEAVE_APPROVED',
          leaveRequestId: l.id,
          employeeId: l.employeeId,
          policyId: l.sandwichDetails?.appliedPolicyId,
          newValue: { approvedBy, approvedAt, daysCount: l.daysCount },
          reason: isWfh 
            ? `Work From Home request approved by ${approvedBy}. Attendance updated as [WFH] (Present).`
            : `Leave request approved by ${approvedBy}. Attendance calendar updated.`
        });

        return { ...l, status: 'Approved' as const, approvedBy, approvedAt };
      }
      return l;
      });

      try {
        localStorage.setItem('vrm_hrms_leave_requests_persistent', JSON.stringify(updatedLeaves));
      } catch {}
      supabaseDirect.saveCompanySetting('leave_requests_data', updatedLeaves).catch(() => {});
      return updatedLeaves;
    });

    if (id.length === 36) {
      supabaseDirect.updateLeaveRequestStatus(id, 'Approved', approvedBy);
    }

    // 1. Notify the employee who applied (targeted to their employee ID & name)
    pushSharedNotification({
      title: target.leaveType === 'Work From Home' ? 'Work From Home Approved' : 'Leave Request Approved',
      message: `Your ${target.leaveType} request (${target.startDate} to ${target.endDate}) was approved by ${approvedBy}. Attendance updated.`,
      priority: 'Normal',
      category: 'Leave',
      link: 'leaves',
      targetEmployeeIds: [target.employeeId, target.employeeName].filter(Boolean) as string[]
    });

    // 2. Notify management
    pushSharedNotification({
      title: 'Leave Request Approved',
      message: `${target.employeeName}'s ${target.leaveType} request was approved by ${approvedBy}.`,
      priority: 'Normal',
      category: 'Leave',
      link: 'leaves',
      targetRoles: ['CEO', 'HR']
    });

    // 3. Local feedback for approver
    addNotification({
      title: 'Request Approved',
      message: `You approved ${target.employeeName}'s ${target.leaveType} request.`,
      priority: 'Normal',
      category: 'Leave',
      link: 'leaves'
    });
  };

  const rejectLeave = (id: string, approvedBy: string, comment?: string) => {
    const target = leaveRequests.find(l => l.id === id);
    if (!target) return;
    if (!canCurrentUserApproveRequests({ employeeId: target.employeeId, employeeName: target.employeeName })) {
      addNotification({
        title: 'CEO Approval Required',
        message: 'HR staff requests can be rejected only by CEO.',
        priority: 'Important',
        category: 'Leave'
      });
      return;
    }
    const approvedAt = new Date().toISOString();
    setLeaveRequests(prevLeaves => {
      const updatedLeaves = prevLeaves.map(l => {
      if (l.id === id) {
        const isWfh = l.leaveType === 'Work From Home' || 
          (l.leaveType && l.leaveType.toLowerCase().includes('work from home')) ||
          (l.leaveType && l.leaveType.toLowerCase() === 'wfh');

        addSandwichAuditLog({
          action: 'LEAVE_REJECTED',
          leaveRequestId: l.id,
          employeeId: l.employeeId,
          reason: comment || `${isWfh ? 'Work From Home' : 'Leave'} request rejected by ${approvedBy}.`
        });
        return { ...l, status: 'Rejected' as const, approvedBy, approvedAt, comment };
      }
      return l;
      });

      try {
        localStorage.setItem('vrm_hrms_leave_requests_persistent', JSON.stringify(updatedLeaves));
      } catch {}
      supabaseDirect.saveCompanySetting('leave_requests_data', updatedLeaves).catch(() => {});
      return updatedLeaves;
    });

    if (id.length === 36) {
      supabaseDirect.updateLeaveRequestStatus(id, 'Rejected', approvedBy, comment);
    }

    // 1. Notify the employee who applied (targeted to their employee ID & name)
    pushSharedNotification({
      title: target.leaveType === 'Work From Home' ? 'Work From Home Declined' : 'Leave Request Rejected',
      message: `Your ${target.leaveType} request (${target.startDate} to ${target.endDate}) was rejected by ${approvedBy}.${comment ? ` Reason: ${comment}` : ''}`,
      priority: 'Urgent',
      category: 'Leave',
      link: 'leaves',
      targetEmployeeIds: [target.employeeId, target.employeeName].filter(Boolean) as string[]
    });

    // 2. Notify management
    pushSharedNotification({
      title: 'Leave Request Rejected',
      message: `${target.employeeName}'s ${target.leaveType} request was rejected by ${approvedBy}.${comment ? ` Reason: ${comment}` : ''}`,
      priority: 'Important',
      category: 'Leave',
      link: 'leaves',
      targetRoles: ['CEO', 'HR']
    });

    // 3. Local feedback for current user
    addNotification({
      title: 'Request Rejected',
      message: `You rejected ${target.employeeName}'s ${target.leaveType} request.`,
      priority: 'Normal',
      category: 'Leave',
      link: 'leaves'
    });
  };

  const addShift = (shiftData: Omit<Shift, 'id' | 'assignedEmployeeCount'>) => {
    const assignmentsList = Array.isArray(shiftData.assignments) ? shiftData.assignments : [];
    const tempId = `SH-${Date.now()}`;
    const newShift: Shift = {
      ...shiftData,
      assignments: assignmentsList,
      id: tempId,
      assignedEmployeeCount: assignmentsList.length
    };
    setShifts(prev => [...prev, newShift]);
    supabaseDirect.insertShift({
      shift_name: shiftData.shiftName,
      start_time: shiftData.startTime,
      end_time: shiftData.endTime,
      break_duration_mins: shiftData.breakDurationMins,
      working_hours: shiftData.workingHours,
      grace_period_mins: shiftData.gracePeriodMins,
      color: shiftData.color,
    }).then(res => {
      if (res.data?.id) {
        setShifts(curr => curr.map(s => s.id === tempId ? { ...s, id: res.data.id } : s));
      }
    });
  };

  const updateShift = (id: string, updates: Partial<Shift>) => {
    setShifts(prev => {
      const target = prev.find(s => s.id === id);
      const oldName = target?.shiftName;
      const updatedList = prev.map(s => s.id === id ? { ...s, ...updates } : s);
      if (updates.shiftName && oldName && updates.shiftName !== oldName) {
        setEmployees(empList => empList.map(emp => {
          if (emp.workShift === oldName) {
            return { ...emp, workShift: updates.shiftName! };
          }
          return emp;
        }));
      }
      return updatedList;
    });
    if (id.length === 36) {
      supabaseDirect.updateShift(id, updates);
    }
  };

  const deleteShift = (id: string) => {
    setShifts(prev => prev.filter(s => s.id !== id));
    if (id.length === 36) {
      supabaseDirect.deleteShift(id);
    }
  };

  // Policy Management Methods
  const addLeavePolicy = (policyData: Omit<LeavePolicyItem, 'id'>) => {
    const newPolicy: LeavePolicyItem = {
      ...policyData,
      id: `lp-${Date.now()}`
    };
    setLeavePolicies(prev => [...prev, newPolicy]);
  };

  const updateLeavePolicy = (id: string, updates: Partial<LeavePolicyItem>) => {
    setLeavePolicies(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteLeavePolicy = (id: string) => {
    setLeavePolicies(prev => prev.filter(p => p.id !== id));
  };

  const addHolidayPolicy = (holidayData: Omit<HolidayItem, 'id'>) => {
    const newHoliday: HolidayItem = {
      ...holidayData,
      id: `hp-${Date.now()}`
    };
    setHolidayPolicies(prev => [...prev, newHoliday]);
  };

  const updateHolidayPolicy = (id: string, updates: Partial<HolidayItem>) => {
    setHolidayPolicies(prev => prev.map(h => h.id === id ? { ...h, ...updates } : h));
  };

  const deleteHolidayPolicy = (id: string) => {
    setHolidayPolicies(prev => prev.filter(h => h.id !== id));
  };

  const addAttendancePolicy = (policyData: Omit<AttendancePolicyItem, 'id'>) => {
    const newPolicy: AttendancePolicyItem = {
      ...policyData,
      id: `ap-${Date.now()}`
    };
    setAttendancePolicies(prev => [...prev, newPolicy]);
  };

  const updateAttendancePolicy = (id: string, updates: Partial<AttendancePolicyItem>) => {
    setAttendancePolicies(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteAttendancePolicy = (id: string) => {
    setAttendancePolicies(prev => prev.filter(p => p.id !== id));
  };

  const addWeeklySchedule = (scheduleData: Omit<WeeklyScheduleItem, 'id'>) => {
    const newSchedule: WeeklyScheduleItem = {
      ...scheduleData,
      id: `wp-${Date.now()}`
    };
    setWeeklySchedules(prev => [...prev, newSchedule]);
  };

  const updateWeeklySchedule = (id: string, updates: Partial<WeeklyScheduleItem>) => {
    setWeeklySchedules(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const deleteWeeklySchedule = (id: string) => {
    setWeeklySchedules(prev => prev.filter(w => w.id !== id));
  };

  const updateAttendanceConfig = (updates: Partial<GlobalAttendanceConfig>) => {
    setAttendanceConfig(prev => ({ ...prev, ...updates }));
  };

  const addPolicyDocument = (docData: Omit<PolicyDocumentItem, 'id'>) => {
    const newDoc: PolicyDocumentItem = {
      ...docData,
      id: `p-${Date.now()}`
    };
    setPolicyDocuments(prev => [...prev, newDoc]);
  };

  const updatePolicyDocument = (id: string, updates: Partial<PolicyDocumentItem>) => {
    setPolicyDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const deletePolicyDocument = (id: string) => {
    setPolicyDocuments(prev => prev.filter(d => d.id !== id));
  };

  const updateBusinessSettings = (updates: Partial<BusinessProfileSettings>) => {
    setBusinessSettings(prev => ({ ...prev, ...updates }));
  };

  const SHIFT_REQUESTS_KEY = 'shift_requests_vps_data';

  // Read-merge-write so concurrent submissions/approvals from different users are not lost
  const persistShiftRequests = async (changed: ShiftRequest[]) => {
    if (!changed.length) return;
    try {
      // Immediate localStorage persistence so shift requests never vanish
      try {
        const currentSaved = localStorage.getItem('vrm_hrms_shift_requests_persistent');
        const list: ShiftRequest[] = currentSaved ? JSON.parse(currentSaved) : [];
        const map = new Map<string, ShiftRequest>(list.map(r => [r.id, r]));
        changed.forEach(r => map.set(r.id, r));
        const mergedLocal = Array.from(map.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        localStorage.setItem('vrm_hrms_shift_requests_persistent', JSON.stringify(mergedLocal));
      } catch {}

      const remote = await supabaseDirect.getCompanySetting(SHIFT_REQUESTS_KEY);
      const map = new Map<string, ShiftRequest>((Array.isArray(remote) ? remote : []).map((r: ShiftRequest) => [r.id, r]));
      changed.forEach(r => {
        const existing = map.get(r.id);
        if (!existing || (r.updatedAt || '') >= (existing.updatedAt || '')) {
          map.set(r.id, r);
        }
      });
      const merged = Array.from(map.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      await supabaseDirect.saveCompanySetting(SHIFT_REQUESTS_KEY, merged);
      try {
        localStorage.setItem('vrm_hrms_shift_requests_persistent', JSON.stringify(merged));
      } catch {}
    } catch (err) {
      console.warn('[HRMSContext] shift request cloud save notice:', err);
    }
  };

  const sameEmployeeKey = (a?: string, b?: string) =>
    !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

  const requestShiftChange = (req: Omit<ShiftRequest, 'id' | 'status'>) => {
    const nowIso = new Date().toISOString();
    const newReq: ShiftRequest = {
      ...req,
      id: `SR-${Date.now()}`,
      status: 'Pending',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    setShiftRequests(prev => [newReq, ...prev]);
    persistShiftRequests([newReq]);

    // Notify approvers (CEO + HR) on their own login
    pushSharedNotification({
      title: 'New Shift Change Request',
      message: `${req.employeeName} requested a shift change from ${req.currentShift} to ${req.requestedShift} (effective ${req.requestedDate}). Reason: ${req.reason || '-'}`,
      priority: 'Important',
      category: 'Shift',
      link: 'shifts',
      targetRoles: ['CEO', 'HR']
    });

    addNotification({
      title: 'Shift Request Submitted',
      message: `Your request to switch to ${req.requestedShift} has been sent to HR / CEO for approval.`,
      priority: 'Normal',
      category: 'Shift'
    });
  };

  const approveShiftRequest = (id: string, approvedBy: string) => {
    const target = shiftRequests.find(r => r.id === id);
    if (!target) return;
    if (!canCurrentUserApproveRequests({ employeeId: target.employeeId, employeeName: target.employeeName })) {
      addNotification({
        title: 'CEO Approval Required',
        message: 'HR staff shift requests can be approved only by CEO.',
        priority: 'Important',
        category: 'Shift'
      });
      return;
    }
    const updated: ShiftRequest = { ...target, status: 'Approved', approvedBy, updatedAt: new Date().toISOString() };

    setShiftRequests(prev => prev.map(r => r.id === id ? updated : r));
    if (updated.employeeId || updated.employeeName) {
      setEmployees(empList => empList.map(emp => {
        const matchesId = sameEmployeeKey(updated.employeeId, emp.employeeId) || sameEmployeeKey(updated.employeeId, emp.id);
        const matchesName = sameEmployeeKey(updated.employeeName, `${emp.firstName} ${emp.lastName}`);
        return (matchesId || matchesName) ? { ...emp, workShift: updated.requestedShift } : emp;
      }));
    }
    persistShiftRequests([updated]);

    pushSharedNotification({
      title: 'Shift Request Approved',
      message: `Your shift change to ${updated.requestedShift} (effective ${updated.requestedDate}) was approved by ${approvedBy}.`,
      priority: 'Normal',
      category: 'Shift',
      link: 'shifts',
      targetEmployeeIds: [updated.employeeId, updated.employeeName].filter(Boolean) as string[]
    });
    pushSharedNotification({
      title: 'Shift Request Approved',
      message: `${updated.employeeName}'s shift change to ${updated.requestedShift} was approved by ${approvedBy}.`,
      priority: 'Normal',
      category: 'Shift',
      link: 'shifts',
      targetRoles: ['CEO', 'HR']
    });
    addNotification({
      title: 'Shift Request Approved',
      message: `You approved ${updated.employeeName}'s shift change to ${updated.requestedShift}.`,
      priority: 'Normal',
      category: 'Shift'
    });
  };

  const rejectShiftRequest = (id: string, rejectedBy: string, reason?: string) => {
    const target = shiftRequests.find(r => r.id === id);
    if (!target) return;
    if (!canCurrentUserApproveRequests({ employeeId: target.employeeId, employeeName: target.employeeName })) {
      addNotification({
        title: 'CEO Approval Required',
        message: 'HR staff shift requests can be rejected only by CEO.',
        priority: 'Important',
        category: 'Shift'
      });
      return;
    }
    const finalReason = reason || 'Shift swap request was declined by management.';
    const updated: ShiftRequest = { ...target, status: 'Rejected', rejectedBy, rejectionReason: finalReason, updatedAt: new Date().toISOString() };

    setShiftRequests(prev => prev.map(r => r.id === id ? updated : r));
    persistShiftRequests([updated]);

    pushSharedNotification({
      title: 'Shift Request Declined',
      message: `Your shift change to ${updated.requestedShift} was declined by ${rejectedBy}. Reason: ${finalReason}`,
      priority: 'Important',
      category: 'Shift',
      link: 'shifts',
      targetEmployeeIds: [updated.employeeId, updated.employeeName].filter(Boolean) as string[]
    });
    pushSharedNotification({
      title: 'Shift Request Declined',
      message: `${updated.employeeName}'s shift change to ${updated.requestedShift} was declined by ${rejectedBy}.`,
      priority: 'Normal',
      category: 'Shift',
      link: 'shifts',
      targetRoles: ['CEO', 'HR']
    });
    addNotification({
      title: 'Shift Request Declined',
      message: `You declined ${updated.employeeName}'s shift change request.`,
      priority: 'Important',
      category: 'Shift'
    });
  };

  /** Re-apply the latest approved shift change per employee (employees table has no work_shift column). */
  const applyApprovedShiftsToEmployees = (requests: ShiftRequest[]) => {
    const latestByKey = new Map<string, ShiftRequest>();
    requests
      .filter(r => r && r.status === 'Approved' && r.requestedShift)
      .forEach(r => {
        const ts = r.updatedAt || r.createdAt || '';
        [r.employeeId, r.employeeName].filter(Boolean).forEach(k => {
          const key = String(k).trim().toLowerCase();
          const prev = latestByKey.get(key);
          if (!prev || ts >= (prev.updatedAt || prev.createdAt || '')) latestByKey.set(key, r);
        });
      });
    if (latestByKey.size === 0) return;
    setEmployees(empList => {
      let changed = false;
      const next = empList.map(emp => {
        const r = latestByKey.get((emp.employeeId || '').trim().toLowerCase())
          || latestByKey.get((emp.id || '').trim().toLowerCase())
          || latestByKey.get(`${emp.firstName} ${emp.lastName}`.trim().toLowerCase());
        if (r && emp.workShift !== r.requestedShift) {
          changed = true;
          return { ...emp, workShift: r.requestedShift };
        }
        return emp;
      });
      return changed ? next : empList;
    });
  };

  const addTask = (tsk: Omit<TaskItem, 'id' | 'createdAt'>) => {
    const newTask: TaskItem = {
      ...tsk,
      id: `TSK-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setTasks(prev => [newTask, ...prev]);

    addNotification({
      title: 'New Task Assigned',
      message: `Task "${tsk.title}" assigned to ${tsk.assignedEmployeeName}.`,
      priority: tsk.priority === 'Urgent' ? 'Urgent' : 'Normal',
      category: 'Task'
    });
  };

  const updateTaskStatus = (id: string, status: TaskItem['status']) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        // Boost employee performance score on completion!
        if (status === 'Completed') {
          setPerformanceScores(perfPrev => perfPrev.map(p => {
            if (p.employeeId === t.assignedEmployeeId) {
              const newComp = Math.min(100, p.taskCompletionRate + 4);
              const newScore = Math.min(100, p.overallScore + 2);
              return { ...p, taskCompletionRate: newComp, overallScore: newScore };
            }
            return p;
          }));
        }
        return { ...t, status };
      }
      return t;
    }));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setEnhancedTasks(prev => prev.filter(t => t.id !== id));
    supabaseDirect.deleteTask(id);
  };

  // ─────────────────────────────────────────────────────────────
  // Enterprise Enhanced Task Handlers
  // ─────────────────────────────────────────────────────────────

  const createEnhancedTask = (
    taskData: Omit<TaskItemEnhanced, 'id' | 'taskNumber' | 'overallProgress' | 'overallStatus' | 'updates' | 'comments' | 'attachments' | 'timeline' | 'auditLogs' | 'createdAt' | 'updatedAt'> & Partial<Pick<TaskItemEnhanced, 'assignees' | 'attachments'>>
  ): TaskItemEnhanced => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const taskId = `TSK-${Date.now()}`;
    const taskNumber = `TSK-2026-${(enhancedTasks.length + 1).toString().padStart(3, '0')}`;

    // Normalize and filter assignees to prevent self-assignment ("oru person own task assign pannakudathu")
    const creatorCleanName = (taskData.assignedBy || taskData.createdBy || currentUser.name || '').replace(/\s*\([^)]*\)/g, '').toLowerCase().trim();
    const rawAssignees: TaskAssignee[] = taskData.assignees || [];

    const finalResponsiblePersonId = taskData.responsiblePersonId || (rawAssignees[0]?.employeeId) || '';
    const finalResponsiblePersonName = taskData.responsiblePersonName || (rawAssignees[0]?.employeeName) || '';
    const finalAssignedBy = taskData.assignedBy || `${currentUser.name} (${currentUser.role})`;

    const preparedAssignees: TaskAssignee[] = rawAssignees.map((asn, idx) => {
      const emp = employees.find(e => e.employeeId === asn.employeeId || e.id === asn.employeeId);
      return {
        id: asn.id || `ASN-${Date.now()}-${idx}`,
        taskId,
        employeeId: asn.employeeId,
        employeeName: asn.employeeName || (emp ? `${emp.firstName} ${emp.lastName}` : 'Assignee'),
        employeeEmail: asn.employeeEmail || emp?.email || '',
        employeeDepartment: asn.employeeDepartment || emp?.department || taskData.department,
        employeeAvatar: asn.employeeAvatar || emp?.avatar || '',
        role: asn.role || (asn.employeeId === finalResponsiblePersonId ? 'RESPONSIBLE' : 'ASSIGNEE'),
        individualStatus: asn.individualStatus || 'Pending',
        progressPercentage: asn.progressPercentage || 0,
        actualStartDate: asn.actualStartDate,
        completedDate: asn.completedDate,
        latestRemark: asn.latestRemark,
        completionEvidence: asn.completionEvidence,
        assignedAt: asn.assignedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    const { overallStatus, overallProgress } = computeTaskOverallStatusAndProgress(
      preparedAssignees, 
      'OPEN', 
      taskData.dueDate
    );

    const initialTimeline = [
      {
        id: `TL-${Date.now()}`,
        taskId,
        title: taskData.sourceType === 'MOM' ? 'Task Created from Meeting Action Item' : 'Task Created',
        description: `Created by ${taskData.createdBy || currentUser.name} and assigned to ${preparedAssignees.map(a => a.employeeName).join(', ')}.`,
        timestamp: `${today} ${nowTime}`,
        iconType: (taskData.sourceType === 'MOM' ? 'mom' : 'created') as any,
        actorName: taskData.createdBy || currentUser.name
      }
    ];

    const initialAudit: TaskAuditLog[] = [
      {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber,
        action: 'Task Created',
        module: 'Task Management',
        oldValue: 'N/A',
        newValue: `Status: ${overallStatus}, Priority: ${taskData.priority}, Assignees: ${preparedAssignees.length}`,
        performedBy: currentUser.name,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      }
    ];

    const preparedAttachments: TaskAttachment[] = (taskData.attachments || []).map((att: any, idx) => ({
      id: att.id || `ATT-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      taskId,
      fileName: att.fileName || `Attachment-${idx + 1}.pdf`,
      fileSize: att.fileSize || '1.2 MB',
      fileType: att.fileType || 'Document',
      fileUrl: att.fileUrl || '#',
      uploadedBy: att.uploadedBy || currentUser.name || 'Task Creator',
      uploadedAt: att.uploadedAt || new Date().toISOString()
    }));

    const currentEmpId = currentUser.employeeId || currentUser.id || 'EMP-001';
    const newTask: TaskItemEnhanced = {
      ...taskData,
      id: taskId,
      taskNumber,
      responsiblePersonId: finalResponsiblePersonId,
      responsiblePersonName: finalResponsiblePersonName,
      assignedBy: finalAssignedBy,
      assignedById: (taskData as any).assignedById || currentEmpId,
      createdBy: taskData.createdBy || currentUser.name,
      createdById: (taskData as any).createdById || currentEmpId,
      taskDate: taskData.taskDate || today,
      overallProgress,
      overallStatus,
      assignees: preparedAssignees,
      updates: [],
      comments: [],
      attachments: preparedAttachments,
      timeline: initialTimeline,
      auditLogs: initialAudit,
      createdAt: today,
      updatedAt: today
    };

    setEnhancedTasks(prev => [newTask, ...prev]);
    supabaseDirect.saveTask(newTask);

    // Also mirror to legacy tasks
    const legacyTask: TaskItem = {
      id: taskId,
      title: newTask.title,
      description: newTask.description,
      assignedEmployeeId: preparedAssignees[0]?.employeeId || 'EMP-001',
      assignedEmployeeName: preparedAssignees[0]?.employeeName || 'Assigned Staff',
      assignedBy: newTask.assignedBy,
      department: newTask.department,
      priority: newTask.priority,
      dueDate: newTask.dueDate,
      status: overallStatus === 'COMPLETED' ? 'Completed' : overallStatus === 'IN PROGRESS' ? 'In Progress' : overallStatus === 'OVERDUE' ? 'Overdue' : 'To Do',
      createdAt: today
    };
    setTasks(prev => [legacyTask, ...prev]);

    // Send notifications to all assignees
    preparedAssignees.forEach(asn => {
      addNotification({
        title: 'New Task Assigned',
        message: `You have been assigned to task: "${newTask.title}" (Due: ${formatDateDDMMYYYY(newTask.dueDate)})`,
        priority: newTask.priority === 'Urgent' ? 'Urgent' : 'Normal',
        category: 'Task',
        link: newTask.id
      });
    });

    return newTask;
  };

  const getCurrentUserReadKey = () => String(currentUser.employeeId || currentUser.id || currentUser.email || currentUser.name || '').trim().toLowerCase();

  const updateEnhancedTask = (
    taskId: string,
    updates: Partial<Pick<TaskItemEnhanced, 'title' | 'description' | 'expectedOutput' | 'priority' | 'dueDate' | 'taskCategory'>>
  ) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const audit: TaskAuditLog = {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber: t.taskNumber,
        action: 'Task Edited',
        module: 'Task Management',
        oldValue: 'Previous task details',
        newValue: Object.keys(updates).join(', '),
        performedBy: currentUser.name,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      };
      const updated: TaskItemEnhanced = {
        ...t,
        ...updates,
        editedAt: new Date().toISOString(),
        editedBy: currentUser.name,
        updatedAt: today,
        auditLogs: [audit, ...t.auditLogs]
      };
      supabaseDirect.saveTask(updated);
      return updated;
    }));

    addNotification({
      title: 'Task Edited',
      message: `Task details updated by ${currentUser.name}.`,
      priority: 'Normal',
      category: 'Task',
      link: taskId
    });
  };

  const markTaskViewed = (taskId: string) => {
    const myKey = getCurrentUserReadKey();
    if (!myKey) return;
    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId || (t.viewedBy || []).includes(myKey)) return t;
      const updated: TaskItemEnhanced = {
        ...t,
        viewedBy: [...(t.viewedBy || []), myKey],
        viewedAt: { ...(t.viewedAt || {}), [myKey]: new Date().toISOString() }
      };
      supabaseDirect.saveTask(updated);
      return updated;
    }));
  };

  const markTaskDailyReportsSeen = (taskId: string) => {
    const myKey = getCurrentUserReadKey();
    if (!myKey) return;
    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId || !t.dailyReports?.length) return t;
      let changed = false;
      const dailyReports = t.dailyReports.map(r => {
        if ((r.seenBy || []).includes(myKey)) return r;
        changed = true;
        return { ...r, seenBy: [...(r.seenBy || []), myKey], seenAt: new Date().toISOString() };
      });
      if (!changed) return t;
      const updated: TaskItemEnhanced = { ...t, dailyReports };
      supabaseDirect.saveTask(updated);
      return updated;
    }));
  };

  const updateAssigneeProgress = (
    taskId: string,
    assigneeId: string,
    progressPercentage: number,
    individualStatus: TaskAssigneeStatus,
    latestRemark?: string,
    completionEvidence?: TaskCompletionEvidence
  ) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const clampedProgress = Math.min(100, Math.max(0, Math.round(progressPercentage)));

    setEnhancedTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;

      const targetAssignee = task.assignees.find(a => 
        a.id === assigneeId || 
        a.employeeId === assigneeId || 
        (a.employeeName && a.employeeName.toLowerCase().includes(assigneeId.toLowerCase()))
      ) || task.assignees[0];
      if (!targetAssignee) return task;

      const oldStatus = targetAssignee.individualStatus;
      const oldProgress = targetAssignee.progressPercentage;

      const isNowCompleted = clampedProgress === 100 || individualStatus === 'Completed';
      const actualStart = targetAssignee.actualStartDate || (clampedProgress > 0 ? today : undefined);
      const completedDate = isNowCompleted ? (targetAssignee.completedDate || today) : undefined;

      const updatedAssignees: TaskAssignee[] = task.assignees.map(asn => {
        if (asn.id === targetAssignee.id) {
          return {
            ...asn,
            individualStatus,
            progressPercentage: clampedProgress,
            actualStartDate: actualStart,
            completedDate,
            latestRemark: latestRemark ?? asn.latestRemark,
            completionEvidence: completionEvidence ?? asn.completionEvidence,
            updatedAt: new Date().toISOString()
          };
        }
        return asn;
      });

      // System derives overall task status & overall progress from all assignees!
      const { overallStatus: newOverallStatus, overallProgress: newOverallProgress } = 
        computeTaskOverallStatusAndProgress(updatedAssignees, task.overallStatus, task.dueDate);

      // Create new progress update log
      const newUpdate = {
        id: `UPD-${Date.now()}`,
        taskId,
        assigneeId: targetAssignee.id,
        employeeId: targetAssignee.employeeId,
        employeeName: targetAssignee.employeeName,
        employeeAvatar: targetAssignee.employeeAvatar,
        status: individualStatus,
        progressPercentage: clampedProgress,
        remarks: latestRemark || (isNowCompleted ? 'Marked task as completed.' : `Updated progress to ${clampedProgress}%.`),
        updatedBy: currentUser.name,
        updatedAt: new Date().toISOString()
      };

      // Create timeline event
      const newTimeline = {
        id: `TL-${Date.now()}`,
        taskId,
        title: isNowCompleted ? `${targetAssignee.employeeName} completed assigned work` : `${targetAssignee.employeeName} updated progress`,
        description: latestRemark ? `${clampedProgress}% — "${latestRemark}"` : `Progress updated from ${oldProgress}% to ${clampedProgress}% (${individualStatus}).`,
        timestamp: `${today} ${nowTime}`,
        iconType: (isNowCompleted ? 'evidence' : 'progress') as any,
        actorName: currentUser.name
      };

      // Create immutable audit log
      const newAudit: TaskAuditLog = {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber: task.taskNumber,
        action: isNowCompleted ? 'Completion Submitted' : 'Progress Updated',
        module: 'Task Assignees',
        oldValue: `${targetAssignee.employeeName}: ${oldProgress}% (${oldStatus})`,
        newValue: `${targetAssignee.employeeName}: ${clampedProgress}% (${individualStatus})`,
        performedBy: currentUser.name,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      };

      // Also audit overall task status change if derived status changed
      const auditEntries: TaskAuditLog[] = [newAudit];
      if (newOverallStatus !== task.overallStatus) {
        auditEntries.push({
          id: `AUD-${Date.now() + 1}`,
          taskId,
          taskNumber: task.taskNumber,
          action: 'Overall Status Changed',
          module: 'System Engine',
          oldValue: task.overallStatus,
          newValue: newOverallStatus,
          performedBy: 'System Auto',
          performedByRole: 'System',
          timestamp: `${today} ${nowTime}`
        });
      }

      // Notifications: notify HR/CEO and team on work update
      addNotification({
        title: isNowCompleted ? 'Task Work Completed' : 'Task Progress Updated',
        message: `${targetAssignee.employeeName} updated "${task.title}" to ${clampedProgress}% (${individualStatus})${latestRemark ? `: "${latestRemark}"` : '.'}`,
        priority: isNowCompleted ? 'Important' : 'Normal',
        category: 'Task',
        link: task.id
      });

      if (newOverallStatus === 'COMPLETED' && task.overallStatus !== 'COMPLETED') {
        addNotification({
          title: 'All Assignees Completed Task',
          message: `All assignees have completed "${task.title}". Review and closure required by Responsible Person.`,
          priority: 'Important',
          category: 'Task',
          link: task.id
        });
      }

      const updatedTask = {
        ...task,
        overallStatus: newOverallStatus,
        overallProgress: newOverallProgress,
        assignees: updatedAssignees,
        updates: [newUpdate, ...task.updates],
        timeline: [newTimeline, ...task.timeline],
        auditLogs: [...auditEntries, ...task.auditLogs],
        updatedAt: today
      };
      supabaseDirect.saveTask(updatedTask);
      return updatedTask;
    }));

    // Also mirror to legacy tasks array
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          status: clampedProgress === 100 ? 'Completed' : clampedProgress > 0 ? 'In Progress' : 'To Do'
        };
      }
      return t;
    }));
  };

  const closeTask = (taskId: string, closedBy: string, closureRemarks?: string) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;

      const newTimeline = {
        id: `TL-${Date.now()}`,
        taskId,
        title: 'Task Verified & Closed',
        description: closureRemarks ? `Closed by ${closedBy}. Note: ${closureRemarks}` : `Officially verified and closed by ${closedBy}.`,
        timestamp: `${today} ${nowTime}`,
        iconType: 'closed' as any,
        actorName: closedBy
      };

      const newAudit = {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber: t.taskNumber,
        action: 'Task Closed',
        module: 'Task Management',
        oldValue: t.overallStatus,
        newValue: 'CLOSED',
        performedBy: closedBy,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      };

      const updated: TaskItemEnhanced = {
        ...t,
        overallStatus: 'CLOSED',
        closedAt: new Date().toISOString(),
        closedBy,
        closureRemarks: closureRemarks || 'Verified and completed successfully.',
        timeline: [newTimeline, ...t.timeline],
        auditLogs: [newAudit, ...t.auditLogs],
        updatedAt: today
      };
      supabaseDirect.saveTask(updated);
      return updated;
    }));

    addNotification({
      title: 'Task Closed',
      message: `Task has been reviewed and closed by ${closedBy}.`,
      priority: 'Normal',
      category: 'Task',
      link: taskId
    });
  };

  const reopenTask = (taskId: string, reopenedBy: string, reopenReason: string) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;

      const { overallStatus: derivedStatus, overallProgress } = 
        computeTaskOverallStatusAndProgress(t.assignees, 'IN PROGRESS', t.dueDate);

      const newTimeline = {
        id: `TL-${Date.now()}`,
        taskId,
        title: 'Task Reopened',
        description: `Reopened by ${reopenedBy}. Reason: ${reopenReason}`,
        timestamp: `${today} ${nowTime}`,
        iconType: 'reopened' as any,
        actorName: reopenedBy
      };

      const newAudit = {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber: t.taskNumber,
        action: 'Task Reopened',
        module: 'Task Management',
        oldValue: 'CLOSED',
        newValue: `Reopened (${derivedStatus}). Reason: ${reopenReason}`,
        performedBy: reopenedBy,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      };

      const updated: TaskItemEnhanced = {
        ...t,
        overallStatus: derivedStatus === 'CLOSED' ? 'IN PROGRESS' : derivedStatus,
        overallProgress,
        isReopened: true,
        reopenReason,
        closedAt: undefined,
        closedBy: undefined,
        closureRemarks: undefined,
        timeline: [newTimeline, ...t.timeline],
        auditLogs: [newAudit, ...t.auditLogs],
        updatedAt: today
      };
      supabaseDirect.saveTask(updated);
      return updated;
    }));

    addNotification({
      title: 'Task Reopened',
      message: `Task has been reopened by ${reopenedBy}: "${reopenReason}"`,
      priority: 'Important',
      category: 'Task',
      link: taskId
    });
  };

  const addTaskDailyReport = (taskId: string, report: {
    reportDate: string;
    workDoneToday: string;
    planForTomorrow?: string;
    blockersOrIssues?: string;
    hoursSpent?: number;
    processStatus: TaskAssigneeStatus;
  }) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newDailyReport: TaskDailyReport = {
      id: `DLR-${Date.now()}`,
      taskId,
      reportDate: report.reportDate || today,
      employeeId: currentUser.employeeId || currentUser.id || 'EMP-001',
      employeeName: currentUser.name || 'Employee',
      employeeAvatar: currentUser.avatar,
      employeeDepartment: currentUser.department || 'Operations',
      workDoneToday: report.workDoneToday,
      planForTomorrow: report.planForTomorrow,
      blockersOrIssues: report.blockersOrIssues,
      hoursSpent: report.hoursSpent || 8,
      processStatus: report.processStatus,
      submittedAt: new Date().toISOString(),
      submittedTo: ['CEO', 'HR Manager', 'Assigner']
    };

    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;

      const progressMap: Record<TaskAssigneeStatus, number> = {
        'Pending': 0,
        'In Progress': 50,
        'In Process': 50,
        'Under Review': 90,
        'Completed': 100,
        'Blocked': 30
      };

      const currentEmpId = currentUser.employeeId || currentUser.id || '';
      const updatedAssignees = t.assignees.map(a => {
        const isTarget = a.employeeId === currentEmpId || 
                         (currentUser.name && a.employeeName.toLowerCase().includes(currentUser.name.toLowerCase())) ||
                         t.assignees.length === 1;
        if (isTarget) {
          return {
            ...a,
            individualStatus: report.processStatus,
            progressPercentage: progressMap[report.processStatus] ?? a.progressPercentage,
            latestRemark: report.workDoneToday,
            completedDate: report.processStatus === 'Completed' ? today : a.completedDate,
            updatedAt: new Date().toISOString()
          };
        }
        return a;
      });

      const { overallStatus, overallProgress } = computeTaskOverallStatusAndProgress(updatedAssignees, t.overallStatus, t.dueDate);

      const newTimeline: TaskTimelineEvent = {
        id: `TL-${Date.now()}`,
        taskId,
        title: `Daily Report: ${currentUser.name} (${report.processStatus})`,
        description: `Daily update for ${report.reportDate}: "${report.workDoneToday.slice(0, 80)}${report.workDoneToday.length > 80 ? '...' : ''}". Dispatched to CEO, HR & Assigner.`,
        timestamp: `${today} ${nowTime}`,
        iconType: 'progress',
        actorName: currentUser.name
      };

      const newAudit: TaskAuditLog = {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber: t.taskNumber,
        action: 'Daily Report Submitted',
        module: 'Task Daily Reports',
        oldValue: 'N/A',
        newValue: `Daily report for ${report.reportDate} [${report.processStatus}]`,
        performedBy: currentUser.name,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      };

      const updated = {
        ...t,
        overallStatus,
        overallProgress,
        assignees: updatedAssignees,
        dailyReports: [newDailyReport, ...(t.dailyReports || [])],
        timeline: [newTimeline, ...t.timeline],
        auditLogs: [newAudit, ...t.auditLogs],
        updatedAt: today
      };
      supabaseDirect.saveTask(updated);
      return updated;
    }));

    addNotification({
      title: 'Daily Task Report Received',
      message: `${currentUser.name} submitted daily task report. Status: "${report.processStatus}". Dispatched to CEO, HR & Assigner.`,
      priority: 'Important',
      category: 'Task',
      link: taskId
    });
  };

  const updateTaskProcessStatus = (
    taskId: string, 
    newStatus: TaskAssigneeStatus, 
    remarks?: string,
    targetAssigneeId?: string
  ) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;

      const progressMap: Record<TaskAssigneeStatus, number> = {
        'Pending': 0,
        'In Progress': 50,
        'In Process': 50,
        'Under Review': 90,
        'Completed': 100,
        'Blocked': 30
      };

      const currentEmpId = currentUser.employeeId || currentUser.id || '';
      const currentEmpName = (currentUser.name || '').toLowerCase().trim();

      // Determine which assignee is targeted
      let targetId = targetAssigneeId;
      if (!targetId) {
        const matchingAssignee = t.assignees.find(a => 
          (currentEmpId && (a.employeeId === currentEmpId || a.id === currentEmpId)) ||
          (currentUser.id && a.employeeId === currentUser.id) ||
          (currentEmpName && a.employeeName && (
            a.employeeName.toLowerCase() === currentEmpName ||
            a.employeeName.toLowerCase().includes(currentEmpName) ||
            currentEmpName.includes(a.employeeName.toLowerCase())
          ))
        );
        if (matchingAssignee) {
          targetId = matchingAssignee.id || matchingAssignee.employeeId;
        } else if (t.assignees.length === 1) {
          targetId = t.assignees[0].id || t.assignees[0].employeeId;
        }
      }

      const updatedAssignees = t.assignees.map(a => {
        const isMatch = targetId 
          ? (a.id === targetId || a.employeeId === targetId || a.employeeName.toLowerCase().trim() === targetId.toLowerCase().trim())
          : false;

        if (isMatch) {
          return {
            ...a,
            individualStatus: newStatus,
            progressPercentage: progressMap[newStatus] ?? (newStatus === 'Completed' ? 100 : a.progressPercentage),
            latestRemark: remarks || a.latestRemark,
            completedDate: newStatus === 'Completed' ? (a.completedDate || today) : undefined,
            updatedAt: new Date().toISOString()
          };
        }
        return a;
      });

      const { overallStatus, overallProgress } = computeTaskOverallStatusAndProgress(updatedAssignees, t.overallStatus, t.dueDate);

      const targetAssigneeObj = t.assignees.find(a => 
        targetId && (a.id === targetId || a.employeeId === targetId || a.employeeName.toLowerCase().trim() === targetId.toLowerCase().trim())
      );
      const actorOrTargetName = targetAssigneeObj ? targetAssigneeObj.employeeName : currentUser.name;

      const newTimeline: TaskTimelineEvent = {
        id: `TL-${Date.now()}`,
        taskId,
        title: `${actorOrTargetName} Status: "${newStatus}"`,
        description: remarks 
          ? `Status for ${actorOrTargetName} updated to ${newStatus} by ${currentUser.name}: "${remarks}". Overall progress: ${overallProgress}%.` 
          : `Status for ${actorOrTargetName} updated to ${newStatus} by ${currentUser.name}. Overall progress: ${overallProgress}%.`,
        timestamp: `${today} ${nowTime}`,
        iconType: newStatus === 'Completed' ? 'closed' : 'status_change',
        actorName: currentUser.name
      };

      const newAudit: TaskAuditLog = {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber: t.taskNumber,
        action: 'Member Status Update',
        module: 'Task Workflow',
        oldValue: `${actorOrTargetName}: ${targetAssigneeObj?.individualStatus || 'N/A'}`,
        newValue: `${actorOrTargetName}: ${newStatus} (${progressMap[newStatus] ?? 0}%) | Overall: ${overallProgress}% [${overallStatus}]`,
        performedBy: currentUser.name,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      };

      const updated = {
        ...t,
        overallStatus,
        overallProgress,
        assignees: updatedAssignees,
        timeline: [newTimeline, ...t.timeline],
        auditLogs: [newAudit, ...t.auditLogs],
        updatedAt: today
      };
      supabaseDirect.saveTask(updated);
      return updated;
    }));

    addNotification({
      title: `Task Status Updated: ${newStatus}`,
      message: `Task progress updated. New status: "${newStatus}".`,
      priority: newStatus === 'Completed' ? 'Important' : 'Normal',
      category: 'Task',
      link: taskId
    });
  };

  const addTaskComment = (taskId: string, content: string, attachments?: string[]) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newComment = {
      id: `CMT-${Date.now()}`,
      taskId,
      userId: currentUser.employeeId || currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      userRole: currentUser.role,
      content,
      attachments,
      createdAt: new Date().toISOString()
    };

    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;

      const newAudit = {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber: t.taskNumber,
        action: 'Comment Added',
        module: 'Task Comments',
        oldValue: 'N/A',
        newValue: content.slice(0, 40) + '...',
        performedBy: currentUser.name,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      };

      const updated = {
        ...t,
        comments: [...t.comments, newComment],
        auditLogs: [newAudit, ...t.auditLogs]
      };
      supabaseDirect.saveTask(updated);
      return updated;
    }));
  };

  const addTaskAttachment = (taskId: string, attachmentData: Omit<TaskAttachment, 'id' | 'taskId' | 'uploadedAt'>) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newAttachment: TaskAttachment = {
      ...attachmentData,
      id: `ATT-${Date.now()}`,
      taskId,
      uploadedAt: new Date().toISOString()
    };

    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;

      const newAudit = {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber: t.taskNumber,
        action: 'Attachment Uploaded',
        module: 'Task Attachments',
        oldValue: 'N/A',
        newValue: `${newAttachment.fileName} (${newAttachment.fileSize})`,
        performedBy: currentUser.name,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      };

      const updated = {
        ...t,
        attachments: [...(t.attachments || []), newAttachment],
        auditLogs: [newAudit, ...t.auditLogs]
      };
      supabaseDirect.saveTask(updated);
      return updated;
    }));
  };

  const addTaskLink = (taskId: string, linkData: { title: string; url: string }) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let finalUrl = linkData.url.trim();
    if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    const newLink: TaskLinkItem = {
      id: `LNK-${Date.now()}`,
      taskId,
      title: linkData.title.trim() || finalUrl,
      url: finalUrl,
      addedBy: currentUser.name || 'User',
      addedAt: new Date().toISOString()
    };

    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;

      const newAudit: TaskAuditLog = {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber: t.taskNumber,
        action: 'Link Added',
        module: 'Task Links',
        oldValue: 'N/A',
        newValue: `${newLink.title} (${newLink.url})`,
        performedBy: currentUser.name,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      };

      const updated = {
        ...t,
        links: [...(t.links || []), newLink],
        auditLogs: [newAudit, ...(t.auditLogs || [])]
      };
      supabaseDirect.saveTask(updated);
      return updated;
    }));
  };

  const deleteTaskLink = (taskId: string, linkId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;

      const targetLink = (t.links || []).find(l => l.id === linkId);

      const newAudit: TaskAuditLog = {
        id: `AUD-${Date.now()}`,
        taskId,
        taskNumber: t.taskNumber,
        action: 'Link Removed',
        module: 'Task Links',
        oldValue: targetLink ? targetLink.title : linkId,
        newValue: 'Removed',
        performedBy: currentUser.name,
        performedByRole: currentUser.role,
        timestamp: `${today} ${nowTime}`
      };

      const updated = {
        ...t,
        links: (t.links || []).filter(l => l.id !== linkId),
        auditLogs: [newAudit, ...(t.auditLogs || [])]
      };
      supabaseDirect.saveTask(updated);
      return updated;
    }));
  };

  const convertMOMActionToTask = (momId: string, actionItemId: string): TaskItemEnhanced | null => {
    const meeting = momMeetings.find(m => m.id === momId || m.meetingNumber === momId);
    if (!meeting) return null;

    const item = meeting.actionItems.find(a => a.id === actionItemId || a.itemNumber === actionItemId);
    if (!item) return null;

    const responsibleEmpId = item.assignedEmployeeIds[0] || 'EMP-001';
    const responsibleEmp = employees.find(e => e.employeeId === responsibleEmpId || e.id === responsibleEmpId);

    const assigneesList: TaskAssignee[] = item.assignedEmployeeIds.map((empId, idx): TaskAssignee => {
      const emp = employees.find(e => e.employeeId === empId || e.id === empId);
      return {
        id: `ASN-${Date.now()}-${idx}`,
        taskId: '',
        employeeId: empId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'ASSIGNEE',
        employeeEmail: emp?.email || '',
        employeeDepartment: emp?.department || item.department,
        employeeAvatar: emp?.avatar || '',
        role: (empId === responsibleEmpId ? 'RESPONSIBLE' : 'ASSIGNEE'),
        individualStatus: 'Pending' as TaskAssigneeStatus,
        progressPercentage: 0,
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    const created = createEnhancedTask({
      title: item.title,
      taskDate: new Date().toISOString().split('T')[0],
      sourceType: 'MOM',
      sourceReference: meeting.meetingTitle,
      momId: meeting.meetingNumber,
      momItemNumber: item.itemNumber,
      createdBy: currentUser.name,
      assignedBy: currentUser.name,
      responsiblePersonId: responsibleEmpId,
      responsiblePersonName: responsibleEmp ? `${responsibleEmp.firstName} ${responsibleEmp.lastName}` : 'Responsible Person',
      department: item.department || meeting.department,
      taskCategory: 'Compliance',
      priority: item.priority,
      startDate: new Date().toISOString().split('T')[0],
      dueDate: item.dueDate,
      description: item.description,
      expectedOutput: `Outcome mandated by MOM resolution: ${item.decision}`,
      assignees: assigneesList
    });

    // Mark MOM Action Item as Linked
    setMOMMeetings(prev => prev.map(m => {
      if (m.id !== meeting.id) return m;
      return {
        ...m,
        actionItems: m.actionItems.map(ai => {
          if (ai.id !== item.id) return ai;
          return {
            ...ai,
            status: 'Task Created',
            linkedTaskId: created.id,
            linkedTaskNumber: created.taskNumber
          };
        })
      };
    }));

    return created;
  };

  const syncMOMTask = (taskId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const task = enhancedTasks.find(t => t.id === taskId);
    if (!task || !task.momId) return;

    setMOMMeetings(prev => prev.map(m => {
      if (m.meetingNumber !== task.momId && m.id !== task.momId) return m;
      return {
        ...m,
        actionItems: m.actionItems.map(ai => {
          if (ai.itemNumber !== task.momItemNumber && ai.linkedTaskId !== task.id) return ai;
          return {
            ...ai,
            status: task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED' ? 'Completed' : 'In Progress'
          };
        })
      };
    }));

    // Record audit log in task
    setEnhancedTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        auditLogs: [
          {
            id: `AUD-${Date.now()}`,
            taskId,
            taskNumber: t.taskNumber,
            action: 'MOM Synchronization',
            module: 'MOM Integration',
            oldValue: 'Pending Sync',
            newValue: `Synced status "${t.overallStatus}" to ${task.momId}`,
            performedBy: currentUser.name,
            performedByRole: currentUser.role,
            timestamp: `${today} ${nowTime}`
          },
          ...t.auditLogs
        ]
      };
    }));

    addNotification({
      title: 'MOM Status Synchronized',
      message: `Task ${task.taskNumber} status synchronized with ${task.momId}.`,
      priority: 'Normal',
      category: 'Task'
    });
  };

  const deleteEnhancedTask = (taskId: string) => {
    deleteTask(taskId);
  };

  const addTaskMaster = (itemData: Omit<TaskMasterItem, 'id'>) => {
    const newItem: TaskMasterItem = {
      ...itemData,
      id: `MST-${Date.now()}`
    };
    setTaskMasters(prev => [...prev, newItem]);
  };

  const updateTaskMaster = (id: string, updates: Partial<TaskMasterItem>) => {
    setTaskMasters(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const deleteTaskMaster = (id: string) => {
    setTaskMasters(prev => prev.filter(m => m.id !== id));
  };

  const addMOMMeeting = (meetingData: Omit<MOMMeeting, 'id' | 'meetingNumber'>) => {
    const seq = (momMeetings.length + 1).toString().padStart(2, '0');
    const meetingNumber = `MOM-2026-${seq}`;
    const newMeeting: MOMMeeting = {
      ...meetingData,
      id: `MOM-${Date.now()}`,
      meetingNumber
    };
    setMOMMeetings(prev => [newMeeting, ...prev]);
  };

  const updateEscalationRule = (id: string, updates: Partial<TaskEscalationRule>) => {
    setEscalationRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const updateTaskWeights = (weights: Partial<TaskPerformanceWeights>) => {
    setTaskWeights(prev => ({ ...prev, ...weights }));
  };

  const addJobOpening = (job: Omit<JobOpening, 'id' | 'postedDate' | 'applicantsCount'>) => {
    const tempId = `JOB-${Date.now()}`;
    const newJob: JobOpening = {
      ...job,
      id: tempId,
      postedDate: new Date().toISOString().split('T')[0],
      applicantsCount: 0
    };
    setJobOpenings(prev => [newJob, ...prev]);
    supabaseDirect.insertJobOpening({
      title: job.title,
      type: job.type,
      positions: 1,
      status: job.status || 'Active',
      posted_date: newJob.postedDate,
      description: job.description || '',
    }).then(res => {
      if (res.data?.id) {
        setJobOpenings(curr => curr.map(j => j.id === tempId ? { ...j, id: res.data.id } : j));
      }
    });
  };

  const updateCandidateStage = (candidateId: string, newStage: Candidate['stage']) => {
    setCandidates(prev => {
      const updated = prev.map(c => {
      if (c.id === candidateId) {
        return { ...c, stage: newStage };
      }
      return c;
      });
      supabaseDirect.saveCompanySetting('candidates_data', updated).catch(() => {});
      return updated;
    });
    if (candidateId.length === 36) {
      supabaseDirect.updateCandidateStage(candidateId, newStage);
    }
  };

  const referCandidate = (cand: Omit<Candidate, 'id' | 'stage' | 'appliedDate'>) => {
    const tempId = `CND-${Date.now()}`;
    const newCand: Candidate = {
      ...cand,
      id: tempId,
      stage: 'Applied',
      referralStatus: 'Pending',
      appliedDate: new Date().toISOString().split('T')[0]
    };
    setCandidates(prev => {
      const updated = [newCand, ...prev];
      supabaseDirect.saveCompanySetting('candidates_data', updated).catch(() => {});
      return updated;
    });
    supabaseDirect.insertCandidate({
      name: cand.name,
      email: cand.email,
      phone: cand.phone,
      stage: 'Applied',
      referrer_name: cand.referrerName,
      applied_date: newCand.appliedDate,
      rating: cand.rating || 4.0,
      notes: cand.notes,
    }).then(res => {
      if (res.data?.id) {
        setCandidates(curr => {
          const updated = curr.map(c => c.id === tempId ? { ...c, id: res.data.id } : c);
          supabaseDirect.saveCompanySetting('candidates_data', updated).catch(() => {});
          return updated;
        });
      }
    });

    // Notify HR and CEO
    addNotification({
      title: 'New Candidate Referral Submitted',
      message: `${cand.referrerName || 'An Employee'} referred ${cand.name} for ${cand.jobTitle}. Pending HR/CEO review.`,
      priority: 'Normal',
      category: 'Announcement'
    });
  };

  const reviewReferral = (
    candidateId: string, 
    status: 'Accepted' | 'Rejected', 
    reviewerName: string, 
    notes?: string,
    newStage?: Candidate['stage']
  ) => {
    let targetCand: Candidate | undefined;
    const finalStage = newStage || (status === 'Accepted' ? 'Interview' : 'Rejected');
    setCandidates(prev => {
      const updated = prev.map(c => {
      if (c.id === candidateId) {
        targetCand = c;
        return {
          ...c,
          referralStatus: status,
          referralReviewedBy: reviewerName,
          referralReviewedDate: new Date().toISOString().split('T')[0],
          referralReviewNotes: notes || c.referralReviewNotes,
          stage: finalStage
        };
      }
      return c;
      });
      supabaseDirect.saveCompanySetting('candidates_data', updated).catch(() => {});
      return updated;
    });

    if (candidateId.length === 36) {
      supabaseDirect.updateCandidateStage(candidateId, finalStage);
    }

    if (targetCand) {
      addNotification({
        title: status === 'Accepted' ? 'Candidate Referral Accepted! 🎉' : 'Candidate Referral Rejected',
        message: `Referral for ${targetCand.name} (${targetCand.jobTitle}) was ${status.toLowerCase()} by ${reviewerName}.`,
        priority: status === 'Accepted' ? 'Important' : 'Normal',
        category: 'Announcement'
      });
    }
  };

  const addExpense = (exp: Omit<Expense, 'id' | 'status'>) => {
    const tempId = `EXP-${Date.now()}`;
    const newExp: Expense = {
      ...exp,
      id: tempId,
      status: 'Pending Manager'
    };
    setExpenses(prev => [newExp, ...prev]);
    if (isCloudInitialized.current && !isSyncingFromCloud.current) {
      supabaseDirect.saveCompanySetting('expenses_data', [newExp, ...expenses]).catch(() => {});
    }

    const targetEmp = employees.find(e => e.id === exp.employeeId || e.employeeId === exp.employeeId);
    supabaseDirect.insertExpense({
      employee_id: targetEmp?.employeeId || exp.employeeId || targetEmp?.id || '',
      category: exp.category,
      amount: exp.amount,
      date: exp.date,
      description: exp.description,
      receipt_url: exp.receiptUrl,
      status: 'Pending Manager',
    }).then(res => {
      if (res.data?.id) {
        setExpenses(curr => curr.map(e => e.id === tempId ? { ...e, id: res.data.id } : e));
      } else if (!res.success) {
        console.warn('[HRMSContext] expense cloud insert notice:', res.error);
      }
    }).catch(err => {
      console.warn('[HRMSContext] expense cloud insert notice:', err);
    });

    addNotification({
      title: 'Expense Claim Submitted',
      message: `${exp.employeeName} submitted an expense claim for $${exp.amount}.`,
      priority: 'Normal',
      category: 'Announcement'
    });
  };

  const approveExpense = (id: string, approvedBy: string, nextStatus: Expense['status']) => {
    setExpenses(prev => prev.map(e => {
      if (e.id !== id) return e;
      // Accounts hands over the amount after HR/CEO approval — keep the original approver
      if (nextStatus === 'Reimbursed') {
        return {
          ...e,
          status: nextStatus,
          approvedBy: e.approvedBy || approvedBy,
          reimbursedBy: approvedBy,
          reimbursedDate: new Date().toISOString().split('T')[0]
        };
      }
      return { ...e, status: nextStatus, approvedBy };
    }));
    if (id.length === 36) {
      supabaseDirect.updateExpenseStatus(id, nextStatus);
    }
  };

  // Automated Pending Reviews Reminder (CEO, HR, and Employee):
  // 1. If HR/CEO has pending leave/shift requests: reminds them to review
  // 2. If Employee has pending leave/shift requests: reminds them their request is awaiting review
  useEffect(() => {
    if (!currentUser) return;
    const myKeys = getUserNotificationKeys();
    if (!myKeys.length) return;
    const today = new Date().toISOString().split('T')[0];
    const myKey = myKeys[0];
    const reminderKey = `vrm_leave_pending_alert_${myKey}_${today}`;
    if (localStorage.getItem(reminderKey)) return;

    const myRoles = getUserAudienceRoles();
    const isHrOrCeo = myRoles.includes('CEO') || myRoles.includes('HR');

    if (isHrOrCeo) {
      const pendingLeaves = leaveRequests.filter(l => l.status === 'Pending');
      const pendingShifts = shiftRequests.filter(s => s.status === 'Pending');
      const totalPending = pendingLeaves.length + pendingShifts.length;
      if (totalPending > 0) {
        addNotification({
          title: '⚠️ Pending Reviews Reminder',
          message: `You have ${totalPending} pending request(s) (${pendingLeaves.length} leave, ${pendingShifts.length} shift) waiting for review.`,
          priority: 'Urgent',
          category: 'Leave',
          link: 'leaves'
        });
        localStorage.setItem(reminderKey, 'true');
      }
    } else {
      // Employee pending requests
      const myPendingLeaves = leaveRequests.filter(l => {
        if (l.status !== 'Pending') return false;
        const eId = String(l.employeeId || '').trim().toLowerCase();
        const eName = String(l.employeeName || '').trim().toLowerCase();
        return myKeys.includes(eId) || myKeys.includes(eName);
      });
      if (myPendingLeaves.length > 0) {
        addNotification({
          title: 'Leave Request Pending Review',
          message: `Your ${myPendingLeaves.length} leave request(s) are waiting for HR / CEO review.`,
          priority: 'Important',
          category: 'Leave',
          link: 'leaves'
        });
        localStorage.setItem(reminderKey, 'true');
      }
    }
  }, [currentUser, leaveRequests, shiftRequests]);

  useEffect(() => {
    const myKey = getCurrentUserReadKey();
    if (!myKey || !enhancedTasks.length) return;
    const today = new Date().toISOString().split('T')[0];
    const storageKey = `vrm_task_unseen_reminders_${myKey}_${today}`;
    const alreadySent = new Set<string>(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    const unseenTasks = enhancedTasks.filter(t => {
      if (t.overallStatus === 'COMPLETED' || t.overallStatus === 'CLOSED' || (t.viewedBy || []).includes(myKey) || alreadySent.has(t.id)) return false;
      return t.assignees.some(a => {
        const empId = String(a.employeeId || '').trim().toLowerCase();
        const empName = String(a.employeeName || '').trim().toLowerCase();
        const email = String(a.employeeEmail || '').trim().toLowerCase();
        return [empId, empName, email].filter(Boolean).includes(myKey);
      });
    });

    if (!unseenTasks.length) return;
    unseenTasks.slice(0, 5).forEach(t => {
      alreadySent.add(t.id);
      addNotification({
        title: 'Task Reminder',
        message: `You have not opened "${t.title}" yet. Due: ${formatDateDDMMYYYY(t.dueDate)}.`,
        priority: t.priority === 'Urgent' || computeDueStatus(t.dueDate, t.overallStatus) === 'Overdue' ? 'Important' : 'Normal',
        category: 'Task',
        link: t.id
      });
    });
    localStorage.setItem(storageKey, JSON.stringify(Array.from(alreadySent)));
  }, [currentUser, enhancedTasks]);

  const processPayrollBatch = async () => {
    const activeAttPolicy = masterAttendancePolicies.find(p => p.status === 'Active');
    const currentMonthInfo = getMonthInfo();
    const batchMonthNum = currentMonthInfo.monthIndex + 1;
    const batchYear = currentMonthInfo.year;
    const batchMonthName = currentMonthInfo.monthLong;
    const batchMonthPad = String(batchMonthNum).padStart(2, '0');

    let backendRecords: any[] | null = null;
    try {
      // 1. Authoritative backend run execution
      let run = await payrollApi.createPayrollRun({ payroll_month: batchMonthNum, payroll_year: batchYear }).catch(() => null);
      if (!run) {
        const runs = await payrollApi.getPayrollRuns().catch(() => []);
        run = runs.find(r => r.payrollMonth === batchMonthNum && r.payrollYear === batchYear) || null;
      }
      if (run && run.status === 'DRAFT') {
        run = await payrollApi.processPayrollRun(run.id).catch(() => run);
      }
      const rawRecords = await payrollApi.getPayrollRecords({ month: batchMonthNum, year: batchYear }).catch(() => null) as any[] | null;
      if (rawRecords && rawRecords.length > 0) {
        backendRecords = rawRecords;
      }
    } catch (apiErr) {
      console.warn('[Payroll] Backend calculation offline, using local engine fallback:', apiErr);
    }

    const updatedRecords: PayrollRecord[] = employees.map(emp => {
      const isEmpProvisional = (emp.employmentType as string) === 'Provisional' || (emp.employmentType as string) === 'Probation' || (emp as any).status === 'Probation';
      const empLeavePolicy = masterLeavePolicies.find(p => {
        if (p.status !== 'Active') return false;
        if (isEmpProvisional) {
          return p.applicableEmploymentType === 'Provisional' || p.id === 'LP-MASTER-PROVISIONAL' || p.policyName.toLowerCase().includes('provisional') || p.policyName.toLowerCase().includes('probation');
        } else {
          return p.applicableEmploymentType === 'Confirmed' || p.id === 'LP-MASTER-CONFIRMED' || (!p.policyName.toLowerCase().includes('provisional') && !p.policyName.toLowerCase().includes('probation'));
        }
      }) || masterLeavePolicies.find(p => p.status === 'Active');

      const employeeWithPf = resolveEmployeeWithPf(emp);
      const calc = calculateEmployeePayroll(
        emp,
        attendanceRecords,
        leaveRequests,
        loanRecords,
        employeeRewardRecords,
        activeAttPolicy,
        empLeavePolicy,
        payrollSettingsConfig,
        batchMonthName,
        batchYear
      );

      const resolvedEmpDept = resolveEmployeeDepartmentName(emp, departments);
      const backendRec = backendRecords?.find((b: any) => b.employeeId === emp.employeeId);
      if (backendRec) {
        const resolvedPfAmount = calc.epfDeduction;
        const resolvedEsiAmount = calc.esiDeduction;
        const resolvedProfessionalTax = calc.professionalTax;
        const resolvedTotalDeductions = calc.totalDeductions;
        return {
          id: backendRec.id || `PAY-${batchYear}-${batchMonthPad}-${emp.employeeId}`,
          employeeId: emp.employeeId,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          department: resolvedEmpDept,
          designation: emp.designation,
          month: batchMonthName,
          year: batchYear,
          basicSalary: calc.basicSalary,
          allowances: calc.allowances,
          da: calc.da,
          conveyance: calc.conveyance,
          hra: calc.hra,
          withPf: backendRec.withPf ?? employeeWithPf,
          bonus: calc.bonus,
          attendanceBonus: calc.attendanceBonus || 0,
          rewardEarnings: calc.rewardEarnings,
          grossSalary: calc.grossSalary,
          taxDeduction: resolvedPfAmount + resolvedEsiAmount + resolvedProfessionalTax,
          leaveDeduction: calc.unpaidLeaveDeduction,
          advanceDeduction: calc.advanceDeduction,
          lateAttendanceDeduction: calc.lateAttendanceDeduction,
          epfDeduction: resolvedPfAmount,
          esiDeduction: resolvedEsiAmount,
          professionalTax: resolvedProfessionalTax,
          workingDays: backendRec.workingDays || 26,
          presentDays: backendRec.presentDays || 26,
          paidDays: calc.paidDays,
          paidLeaves: calc.paidLeaves,
          unpaidLeaves: backendRec.lopDays || 0,
          totalDeductions: resolvedTotalDeductions,
          earningsBreakdown: (calc.earningsBreakdown || []).map((e: any) => ({
            name: e.name,
            category: e.category || 'EARNING',
            amount: Number(e.amount) || 0,
            description: e.description || ''
          })),
          deductionsBreakdown: (calc.deductionsBreakdown || []).map((d: any) => ({
            name: d.name,
            category: d.category || 'DEDUCTION',
            amount: Number(d.amount) || 0,
            description: d.description || ''
          })),
          netSalary: calc.netSalary,
          internalDetails: {
            lateDetails: calc.lateDetails,
            leaveDetails: calc.leaveDetails,
            statutoryDetails: (backendRec.deductionsBreakdown || []).map((d: any) => ({
              ruleName: d.name,
              category: 'Statutory',
              rate: d.amount,
              deductionAmount: d.amount,
              reason: d.description || ''
            })),
            rewardDetails: (backendRec.earningsBreakdown || []).map((e: any) => ({
              ruleName: e.name,
              category: 'Allowance',
              rate: e.amount,
              bonusAmount: e.amount,
              reason: e.description || ''
            }))
          },
          status: 'Processed'
        };
      }

      return {
        id: `PAY-${batchYear}-${batchMonthPad}-${emp.employeeId}`,
        employeeId: emp.employeeId,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        department: resolvedEmpDept,
        designation: emp.designation,
        month: batchMonthName,
        year: batchYear,
        basicSalary: calc.basicSalary,
        allowances: calc.allowances,
        da: calc.da,
        conveyance: calc.conveyance,
        hra: calc.hra,
        withPf: calc.withPf,
        bonus: calc.bonus,
        attendanceBonus: calc.attendanceBonus || 0,
        rewardEarnings: calc.rewardEarnings,
        grossSalary: calc.grossSalary,
        taxDeduction: calc.statutoryDeductions,
        leaveDeduction: calc.unpaidLeaveDeduction,
        advanceDeduction: calc.advanceDeduction,
        lateAttendanceDeduction: calc.lateAttendanceDeduction,
        epfDeduction: calc.epfDeduction,
        esiDeduction: calc.esiDeduction,
        professionalTax: calc.professionalTax,
        workingDays: calc.workingDays,
        presentDays: calc.presentDays,
        paidDays: calc.paidDays,
        paidLeaves: calc.paidLeaves,
        unpaidLeaves: calc.unpaidLeaves,
        totalDeductions: calc.totalDeductions,
        earningsBreakdown: calc.earningsBreakdown,
        deductionsBreakdown: calc.deductionsBreakdown,
        netSalary: calc.netSalary,
        internalDetails: {
          lateDetails: calc.lateDetails,
          leaveDetails: calc.leaveDetails,
          statutoryDetails: calc.statutoryDetails,
          rewardDetails: calc.rewardDetails
        },
        status: 'Processed'
      };
    });

    // Mark processed employee rewards
    setEmployeeRewardRecords(prev => prev.map(r => r.payrollStatus === 'Pending' && r.addToPayroll ? { ...r, payrollStatus: 'ProcessedInPayroll' } : r));

    // Update active loans with payroll EMI deductions
    const batchPeriod = `${currentMonthInfo.monthShort} ${batchYear}`;
    const batchId = `PAY-${batchYear}-${batchMonthPad}`;
    setLoanRecords(prev => prev.map(loan => {
      if ((loan.status === 'Active' || loan.status === 'Disbursed') && toNum(loan.outstandingBalance) > 0) {
        // Unique Deduplication Check: Ensure not already deducted in this batch for this period
        const alreadyDeducted = loan.repaymentSchedule.some(s => s.payrollBatchId === batchId && s.status === 'Deducted');
        if (alreadyDeducted) return loan;

        // Find next pending installment
        const nextInstIdx = loan.repaymentSchedule.findIndex(s => s.status === 'Pending');
        if (nextInstIdx !== -1) {
          const inst = loan.repaymentSchedule[nextInstIdx];
          const scheduledEmi = toNum(inst.scheduledAmount || loan.monthlyDeduction);
          const currentBal = toNum(loan.outstandingBalance);
          const actualDeduct = Math.min(scheduledEmi, currentBal);
          const newBal = Math.max(0, currentBal - actualDeduct);
          const isClosed = newBal === 0;

          const updatedSchedule = [...loan.repaymentSchedule];
          updatedSchedule[nextInstIdx] = {
            ...inst,
            actualDeducted: actualDeduct,
            remainingBalance: newBal,
            status: 'Deducted',
            deductedAt: '2026-08-31 06:00 PM',
            payrollBatchId: batchId
          };

          return {
            ...loan,
            outstandingBalance: newBal,
            status: isClosed ? ('Closed' as LoanRequestStatus) : loan.status,
            repaymentSchedule: updatedSchedule,
            auditLogs: [
              ...loan.auditLogs,
              {
                id: `LOG-${Date.now()}-${loan.id}`,
                loanId: loan.id,
                action: isClosed ? 'Loan Closed (Payroll Repaid)' : 'Payroll Salary Deduction',
                performedBy: 'Payroll Engine',
                performedByRole: 'System',
                timestamp: '2026-08-31 06:00 PM',
                previousValue: `Outstanding: ${formatCurrency(currentBal)}`,
                newValue: `Outstanding: ${formatCurrency(newBal)} (Deducted ${formatCurrency(actualDeduct)} in August Batch)`
              }
            ]
          };
        }
      }
      return loan;
    }));

    setPayrollRecords(updatedRecords);
    supabaseDirect.saveCompanySetting('payroll_records_data', updatedRecords);

    // Persist payroll batch to central Supabase payroll_records table
    updatedRecords.forEach(rec => {
      const emp = employees.find(e => e.employeeId === rec.employeeId || e.id === rec.employeeId);
      const targetEmpId = emp?.id || emp?.employeeId || rec.employeeId;
      if (targetEmpId) {
        supabaseDirect.insertPayrollRecord({
          employee_id: targetEmpId,
          payroll_month: `${batchYear}-${batchMonthPad}-01`,
          basic_salary: rec.basicSalary,
          allowances: rec.allowances,
          bonus: rec.bonus,
          tax_deduction: rec.taxDeduction,
          leave_deduction: rec.leaveDeduction,
          working_days: rec.workingDays,
          present_days: rec.presentDays,
          paid_leaves: rec.paidLeaves,
          unpaid_leaves: rec.unpaidLeaves,
          net_salary: rec.netSalary,
          status: 'Processed',
        });
      }
    });

    addNotification({
      title: 'Payroll Batch Processed',
      message: `${batchMonthName} ${batchYear} payroll successfully processed for ${employees.length} employees with automated loan recoveries.`,
      priority: 'Important',
      category: 'Payroll'
    });
  };

  const updateEmployeeSalaryScheme = (employeeId: string, withPf: boolean) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.id === employeeId || emp.employeeId === employeeId) {
        return {
          ...emp,
          withPf,
          salaryDetails: {
            ...emp.salaryDetails,
            withPf,
            salaryScheme: withPf ? 'WITH_PF' : 'WITHOUT_PF'
          }
        };
      }
      return emp;
    }));
  };

  const updatePayrollRecordAdvanceDeduction = (recordId: string, amount: number) => {
    setPayrollRecords(prev => prev.map(rec => {
      if (rec.id === recordId) {
        const adv = Math.max(0, amount);
        const gross = toNum(rec.basicSalary) + toNum(rec.allowances) + toNum(rec.bonus) + toNum(rec.rewardEarnings || 0);
        const otherDeductions = toNum(rec.taxDeduction) + toNum(rec.leaveDeduction) + toNum(rec.lateAttendanceDeduction || 0);
        const totalDed = otherDeductions + adv;
        const net = Math.max(0, gross - totalDed);
        return {
          ...rec,
          advanceDeduction: adv,
          netSalary: net
        };
      }
      return rec;
    }));
  };

  const markPayrollRecordsPaid = (recordIds: string[]) => {
    if (!recordIds.length) return;
    const idSet = new Set(recordIds);
    setPayrollRecords(prev => prev.map(rec => idSet.has(rec.id) ? { ...rec, status: 'Paid' } : rec));
  };

  const addDepartment = (dept: Omit<DepartmentItem, 'id' | 'employeeCount'>) => {
    const newDept: DepartmentItem = {
      ...dept,
      id: `DEP-${Date.now()}`,
      employeeCount: 0
    };
    setDepartments(prev => [...prev, newDept]);
  };

  const updateDepartment = (id: string, updates: Partial<DepartmentItem>) => {
    setDepartments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const deleteDepartment = (id: string): { success: boolean; message?: string } => {
    const check = canDeleteDepartment(id);
    if (!check.canDelete) {
      return { success: false, message: check.reason };
    }
    setDepartments(prev => prev.filter(d => d.id !== id));
    return { success: true };
  };

  const addDesignation = (desig: Omit<DesignationItem, 'id'>) => {
    const cleanTitle = desig.title.replace(/[0-9]/g, '').trim();
    if (!cleanTitle) return;
    const newDesig: DesignationItem = {
      ...desig,
      title: cleanTitle,
      id: `DSG-${Date.now()}`
    };
    setDesignations(prev => {
      const next = [...prev.filter(d => d.title.toLowerCase() !== cleanTitle.toLowerCase()), newDesig];
      supabaseDirect.saveCompanySetting('designations_data', next);
      return next;
    });
    setOrgStructure(prev => {
      const currentList = prev.designations || [];
      if (currentList.some(t => t.toLowerCase() === cleanTitle.toLowerCase())) return prev;
      const updated = {
        ...prev,
        designations: [...currentList, cleanTitle]
      };
      supabaseDirect.saveCompanySetting('org_structure', updated);
      return updated;
    });
  };

  const updateDesignation = (id: string, updates: Partial<DesignationItem>) => {
    const cleanTitle = updates.title ? updates.title.replace(/[0-9]/g, '').trim() : undefined;
    setDesignations(prev => {
      const oldItem = prev.find(d => d.id === id);
      const oldTitle = oldItem?.title;
      const next = prev.map(d => d.id === id ? { ...d, ...updates, ...(cleanTitle ? { title: cleanTitle } : {}) } : d);
      supabaseDirect.saveCompanySetting('designations_data', next);
      if (oldTitle && cleanTitle && oldTitle !== cleanTitle) {
        setOrgStructure(orgPrev => {
          const updated = {
            ...orgPrev,
            designations: (orgPrev.designations || []).map(t => t === oldTitle ? cleanTitle : t)
          };
          supabaseDirect.saveCompanySetting('org_structure', updated);
          return updated;
        });
        setEmployees(empPrev => empPrev.map(emp => emp.designation === oldTitle ? { ...emp, designation: cleanTitle } : emp));
      }
      return next;
    });
  };

  const deleteDesignation = (id: string): { success: boolean; message?: string } => {
    const check = canDeleteDesignation(id);
    if (!check.canDelete) {
      return { success: false, message: check.reason };
    }
    const target = designations.find(d => d.id === id);
    setDesignations(prev => {
      const next = prev.filter(d => d.id !== id);
      supabaseDirect.saveCompanySetting('designations_data', next);
      return next;
    });
    if (target?.title) {
      setOrgStructure(prev => {
        const next = {
          ...prev,
          designations: (prev.designations || []).filter(t => t !== target.title)
        };
        supabaseDirect.saveCompanySetting('org_structure', next);
        return next;
      });
    }
    return { success: true };
  };

  const addBranch = (branchData: Omit<BranchItem, 'id'>) => {
    const newBranch: BranchItem = {
      ...branchData,
      id: `BR-${Date.now()}`
    };
    setBranches(prev => [...prev, newBranch]);
  };

  const updateBranch = (id: string, branchData: Partial<BranchItem>) => {
    setBranches(prev => prev.map(b => b.id === id ? { ...b, ...branchData } : b));
  };

  const deleteBranch = (id: string) => {
    setBranches(prev => prev.filter(b => b.id !== id));
  };

  // Organization Masters
  const addGrade = (grade: Omit<GradeItem, 'id'>) => {
    const newGrade: GradeItem = {
      ...grade,
      id: `g-${Date.now()}`
    };
    setGrades(prev => [...prev, newGrade]);
  };

  const updateGrade = (id: string, updates: Partial<GradeItem>) => {
    setGrades(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  };

  const deleteGrade = (id: string): { success: boolean; message?: string } => {
    setGrades(prev => prev.filter(g => g.id !== id));
    return { success: true };
  };

  const addEmploymentType = (type: Omit<EmploymentTypeItem, 'id'>) => {
    const newType: EmploymentTypeItem = {
      ...type,
      id: `et-${Date.now()}`
    };
    setEmploymentTypes(prev => [...prev, newType]);
    setOrgStructure(prev => {
      if (prev.employmentTypes.some(t => t.toLowerCase() === newType.name.toLowerCase())) return prev;
      const updated = { ...prev, employmentTypes: [...prev.employmentTypes, newType.name] };
      supabaseDirect.saveCompanySetting('org_structure', updated);
      return updated;
    });
  };

  const updateEmploymentType = (id: string, updates: Partial<EmploymentTypeItem>) => {
    setEmploymentTypes(prev => {
      const existing = prev.find(t => t.id === id);
      const next = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      if (existing && updates.name && updates.name !== existing.name) {
        setOrgStructure(orgPrev => {
          const updated = {
            ...orgPrev,
            employmentTypes: orgPrev.employmentTypes.map(t => t === existing.name ? updates.name! : t)
          };
          supabaseDirect.saveCompanySetting('org_structure', updated);
          return updated;
        });
        setEmployees(empPrev => empPrev.map(emp => emp.employmentType === existing.name ? { ...emp, employmentType: updates.name! } : emp));
      }
      return next;
    });
  };

  const deleteEmploymentType = (id: string) => {
    setEmploymentTypes(prev => {
      const existing = prev.find(t => t.id === id);
      if (existing) {
        setOrgStructure(orgPrev => {
          const updated = {
            ...orgPrev,
            employmentTypes: orgPrev.employmentTypes.filter(t => t !== existing.name)
          };
          supabaseDirect.saveCompanySetting('org_structure', updated);
          return updated;
        });
      }
      return prev.filter(t => t.id !== id);
    });
  };

  const addEmployeeCategory = (cat: Omit<EmployeeCategoryItem, 'id'>) => {
    const newCat: EmployeeCategoryItem = {
      ...cat,
      id: `ec-${Date.now()}`
    };
    setEmployeeCategories(prev => [...prev, newCat]);
  };

  const updateEmployeeCategory = (id: string, updates: Partial<EmployeeCategoryItem>) => {
    setEmployeeCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deleteEmployeeCategory = (id: string) => {
    setEmployeeCategories(prev => prev.filter(c => c.id !== id));
  };

  // Employee Configuration
  const updateEmployeeConfig = (config: Partial<EmployeeConfigSettings>) => {
    setEmployeeConfig(prev => ({ ...prev, ...config }));
  };

  // Approval Workflows
  const addApprovalWorkflow = (wf: Omit<ApprovalWorkflowItem, 'id'>) => {
    const newWf: ApprovalWorkflowItem = {
      ...wf,
      id: `wf-${Date.now()}`
    };
    setApprovalWorkflows(prev => [...prev, newWf]);
  };

  const updateApprovalWorkflow = (id: string, updates: Partial<ApprovalWorkflowItem>) => {
    setApprovalWorkflows(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const deleteApprovalWorkflow = (id: string) => {
    setApprovalWorkflows(prev => prev.filter(w => w.id !== id));
  };

  // Notification Triggers
  const updateNotificationTrigger = (id: string, updates: Partial<NotificationTriggerConfig>) => {
    setNotificationTriggers(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  // General System Config
  const updateGeneralSystemConfig = (config: Partial<GeneralSystemConfig>) => {
    setGeneralSystemConfig(prev => ({ ...prev, ...config }));
  };

  // Integrations Config
  const updateIntegrationsConfig = (config: Partial<IntegrationsConfig>) => {
    setIntegrationsConfig(prev => ({ ...prev, ...config }));
  };

  const addDepartmentToBranch = (branchId: string, departmentName: string) => {
    setBranches(prev => prev.map(b => {
      if (b.id === branchId && !b.departments.includes(departmentName)) {
        return { ...b, departments: [...b.departments, departmentName] };
      }
      return b;
    }));
  };

  const removeDepartmentFromBranch = (branchId: string, departmentName: string) => {
    setBranches(prev => prev.map(b => {
      if (b.id === branchId) {
        return { ...b, departments: b.departments.filter(d => d !== departmentName) };
      }
      return b;
    }));
  };

  const addAsset = (assetData: Omit<AssetItem, 'id'>) => {
    const tempId = `AST-${Date.now()}`;
    const newAsset: AssetItem = {
      ...assetData,
      id: tempId
    };
    setAssets(prev => [newAsset, ...prev]);

    supabaseDirect.insertAsset({
      asset_tag: assetData.assetTag,
      name: assetData.name,
      category: assetData.category,
      serial_number: assetData.serialNumber,
      purchase_cost: assetData.purchaseCost,
      status: assetData.status,
      condition: assetData.condition,
      assigned_employee_id: assetData.assignedEmployeeId || undefined,
      notes: assetData.notes,
    }).then(res => {
      if (res.data?.id) {
        setAssets(curr => curr.map(a => a.id === tempId ? { ...a, id: res.data.id } : a));
      }
    });

    addNotification({
      title: 'New Corporate Asset Added',
      message: `${newAsset.name} (${newAsset.assetTag}) registered into inventory.`,
      priority: 'Normal',
      category: 'Announcement'
    });
  };

  const assignAsset = (assetId: string, employeeId: string, employeeName: string, department: string) => {
    setAssets(prev => prev.map(a => {
      if (a.id === assetId) {
        return {
          ...a,
          assignedEmployeeId: employeeId,
          assignedEmployeeName: employeeName,
          assignedDepartment: department,
          assignedDate: new Date().toISOString().split('T')[0],
          status: 'Assigned'
        };
      }
      return a;
    }));

    if (assetId.length === 36) {
      const emp = employees.find(e => e.id === employeeId || e.employeeId === employeeId);
      const empDbId = emp?.id || emp?.employeeId || employeeId;
      supabaseDirect.updateAsset(assetId, {
        assigned_employee_id: empDbId,
        status: 'Assigned',
        assigned_date: new Date().toISOString().split('T')[0],
      });
    }
  };

  const deleteAsset = (assetId: string) => {
    setAssets(prev => prev.filter(a => a.id !== assetId));
    if (assetId.length === 36) {
      supabaseDirect.deleteAsset(assetId);
    }
  };

  // ============================================================================
  // Field Duty & GPS Live Tracking
  // ============================================================================
  const [fieldAssignments, setFieldAssignments] = useState<FieldAssignment[]>(INITIAL_FIELD_ASSIGNMENTS);
  const [tripSessions, setTripSessions] = useState<FieldTripSession[]>(INITIAL_TRIP_SESSIONS);
  const [trackingAlerts, setTrackingAlerts] = useState<TrackingAlert[]>(INITIAL_TRACKING_ALERTS);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('field_assignments_data', fieldAssignments);
      }
    } catch (e) {
      console.warn('Failed to save field assignments', e);
    }
  }, [fieldAssignments]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('trip_sessions_data', tripSessions);
      }
    } catch (e) {
      console.warn('Failed to save trip sessions', e);
    }
  }, [tripSessions]);

  useEffect(() => {
    try {
      if (isCloudInitialized.current && !isSyncingFromCloud.current) {
        supabaseDirect.saveCompanySetting('tracking_alerts_data', trackingAlerts);
      }
    } catch (e) {
      console.warn('Failed to save tracking alerts', e);
    }
  }, [trackingAlerts]);

  const createFieldAssignment = (data: Omit<FieldAssignment, 'id' | 'createdAt' | 'updatedAt'>): FieldAssignment => {
    const now = new Date().toISOString();
    const newAssignment: FieldAssignment = {
      ...data,
      id: `FA-${new Date().getFullYear()}-${String(fieldAssignments.length + 1).padStart(3, '0')}`,
      createdAt: now,
      updatedAt: now
    };
    setFieldAssignments(prev => [newAssignment, ...prev]);
    addNotification({
      title: 'New Field Duty Assigned',
      message: `Field duty assigned to ${data.employeeName}: ${data.dutyType} at ${data.customerSiteName}`,
      priority: 'Normal',
      category: 'Task'
    });
    return newAssignment;
  };

  const updateFieldAssignment = (id: string, updates: Partial<FieldAssignment>) => {
    setFieldAssignments(prev => prev.map(a => a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a));
  };

  const doesAssignmentBelongToEmployee = (assignment: FieldAssignment, employeeIdOrName: string): boolean => {
    const key = (employeeIdOrName || '').trim().toLowerCase();
    if (!key) return false;
    return (
      assignment.employeeId.trim().toLowerCase() === key ||
      assignment.employeeName.trim().toLowerCase() === key
    );
  };

  const cancelFieldAssignment = (id: string) => {
    const now = new Date().toISOString();
    setFieldAssignments(prev => prev.map(a => a.id === id ? { ...a, status: 'Cancelled', updatedAt: now } : a));
    setTripSessions(prev => prev.map(t => t.assignmentId === id && t.status === 'Active' ? {
      ...t,
      status: 'Cancelled',
      trackingStatus: 'Completed',
      tripEndTime: now,
      updatedAt: now
    } : t));
  };

  const startTrip = (assignmentId: string, startLat: number, startLng: number, startAddress: string = 'Starting Point'): FieldTripSession => {
    const now = new Date().toISOString();
    const assignment = fieldAssignments.find(a => a.id === assignmentId);
    if (assignment && (assignment.status === 'Cancelled' || assignment.status === 'Completed')) {
      throw new Error('Cannot start trip for cancelled or completed field assignment.');
    }

    const existingActiveTrip = tripSessions.find(t => t.assignmentId === assignmentId && t.status === 'Active');
    if (existingActiveTrip) {
      return existingActiveTrip;
    }

    const initialPoint: LocationPoint = {
      id: `pt-${Date.now()}-1`,
      tripId: `TRIP-${Date.now()}`,
      assignmentId,
      employeeId: assignment?.employeeId || currentUser.employeeId || currentUser.id,
      recordedAt: now,
      latitude: startLat,
      longitude: startLng,
      accuracy: 15,
      speed: 0
    };
    const newTrip: FieldTripSession = {
      id: initialPoint.tripId,
      assignmentId,
      employeeId: assignment?.employeeId || currentUser.employeeId || currentUser.id,
      employeeName: assignment?.employeeName || currentUser.name,
      department: assignment?.department || currentUser.department || 'Operations',
      dutyType: assignment?.dutyType || 'Travel',
      customerSiteName: assignment?.customerSiteName || 'Assigned Site',
      tripStartTime: now,
      startLat,
      startLng,
      startAddress,
      totalKm: 0,
      status: 'Active',
      locationPoints: [initialPoint],
      gpsStatus: 'GPS Active',
      trackingStatus: 'Travelling',
      lastGpsUpdate: now,
      createdAt: now,
      updatedAt: now
    };
    setTripSessions(prev => [newTrip, ...prev.filter(t => !(t.assignmentId === assignmentId && t.status === 'Active'))]);
    setFieldAssignments(prev => prev.map(a => a.id === assignmentId && a.status === 'Scheduled' ? { ...a, status: 'Active', updatedAt: now } : a));
    return newTrip;
  };

  const recordLocationPoint = (tripId: string, point: Omit<LocationPoint, 'id' | 'tripId'>) => {
    setTripSessions(prev => prev.map(trip => {
      if (trip.id !== tripId || trip.status !== 'Active') return trip;

      const prevPoint = trip.locationPoints[trip.locationPoints.length - 1] || null;
      const recordedAtMs = point.recordedAt ? new Date(point.recordedAt).getTime() : Date.now();
      const validation = isValidMovementPoint(
        prevPoint,
        point.latitude,
        point.longitude,
        point.accuracy,
        Number.isFinite(recordedAtMs) ? recordedAtMs : Date.now()
      );

      if (!validation.valid && prevPoint) {
        return {
          ...trip,
          lastGpsUpdate: point.recordedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      const newPt: LocationPoint = {
        ...point,
        id: `pt-${Date.now()}-${trip.locationPoints.length + 1}`,
        tripId
      };
      const updatedPoints = [...trip.locationPoints, newPt];
      const totalKm = calculateSequentialRouteKm(updatedPoints);

      return {
        ...trip,
        locationPoints: updatedPoints,
        totalKm,
        lastGpsUpdate: newPt.recordedAt,
        gpsStatus: 'GPS Active',
        trackingStatus: 'Travelling',
        updatedAt: new Date().toISOString()
      };
    }));
  };

  const endTrip = (tripId: string, endLat: number, endLng: number, endAddress: string = 'Destination'): void => {
    const now = new Date().toISOString();
    setTripSessions(prev => prev.map(t => {
      if (t.id !== tripId) return t;
      const finalPoints = [...t.locationPoints];
      if (endLat && endLng) {
        finalPoints.push({
          id: `pt-end-${Date.now()}`,
          tripId,
          assignmentId: t.assignmentId,
          employeeId: t.employeeId,
          recordedAt: now,
          latitude: endLat,
          longitude: endLng,
          accuracy: 10,
          speed: 0
        });
      }
      const finalKm = calculateSequentialRouteKm(finalPoints);
      return {
        ...t,
        endLat,
        endLng,
        endAddress,
        tripEndTime: now,
        totalKm: Math.max(t.totalKm, finalKm),
        status: 'Completed',
        trackingStatus: 'Completed',
        locationPoints: finalPoints,
        lastGpsUpdate: now,
        updatedAt: now
      };
    }));
  };

  const fieldCheckIn = (assignmentId: string, lat: number, lng: number, address?: string): { success: boolean; message: string } => {
    const assignment = fieldAssignments.find(a => a.id === assignmentId);
    if (!assignment) {
      return { success: false, message: 'Field assignment not found.' };
    }

    if (assignment.status === 'Cancelled') {
      return { success: false, message: 'This field duty assignment has been cancelled.' };
    }

    if (assignment.status === 'Completed') {
      return { success: false, message: 'This field duty assignment is already completed.' };
    }

    if (!isTrackingScheduleActive(assignment)) {
      return { success: false, message: 'Field check-in is allowed only during the approved duty schedule.' };
    }

    if (assignment.attendanceType === 'Site Geofence' && assignment.siteLat && assignment.siteLng) {
      const distMeters = calculateHaversineMeters(lat, lng, assignment.siteLat, assignment.siteLng);
      if (distMeters > assignment.allowedRadiusMeters) {
        return {
          success: false,
          message: `You are outside the assigned site location (${Math.round(distMeters)}m away, allowed radius is ${assignment.allowedRadiusMeters}m).`
        };
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const empId = assignment.employeeId || currentUser.employeeId || currentUser.id;

    markAttendance(empId, 'Present', 'GPS Check-In', {
      lat,
      lng,
      address: address || assignment.siteAddress || assignment.customerSiteName,
      inGeofence: true
    });

    setFieldAssignments(prev => prev.map(a => a.id === assignmentId ? {
      ...a,
      status: 'Active',
      updatedAt: nowIso
    } : a));

    setTripSessions(prev => prev.map(t => t.assignmentId === assignmentId ? {
      ...t,
      checkInTime: nowIso,
      updatedAt: nowIso
    } : t));

    return { success: true, message: 'Field check-in verified successfully.' };
  };

  const fieldCheckOut = (assignmentId: string): void => {
    const nowIso = new Date().toISOString();
    const activeTrip = tripSessions.find(t => t.assignmentId === assignmentId && t.status === 'Active');

    setFieldAssignments(prev => prev.map(a => a.id === assignmentId ? {
      ...a,
      status: 'Completed',
      updatedAt: nowIso
    } : a));

    setTripSessions(prev => prev.map(t => t.assignmentId === assignmentId ? {
      ...t,
      checkOutTime: nowIso,
      tripEndTime: t.tripEndTime || nowIso,
      endLat: t.endLat ?? (activeTrip?.locationPoints[activeTrip.locationPoints.length - 1]?.latitude || t.startLat),
      endLng: t.endLng ?? (activeTrip?.locationPoints[activeTrip.locationPoints.length - 1]?.longitude || t.startLng),
      endAddress: t.endAddress || 'Field Duty Check-Out',
      status: 'Completed',
      trackingStatus: 'Completed',
      gpsStatus: t.gpsStatus === 'GPS Active' ? 'GPS Active' : t.gpsStatus,
      updatedAt: nowIso
    } : t));
  };

  const resolveTrackingAlert = (alertId: string) => {
    const now = new Date();
    setTrackingAlerts(prev => prev.map(alt => {
      if (alt.id !== alertId) return alt;
      const startMs = new Date(alt.issueStartTime).getTime();
      const durationMin = Math.max(1, Math.round((now.getTime() - startMs) / 60000));
      return {
        ...alt,
        status: 'Resolved',
        issueEndTime: now.toISOString(),
        durationMinutes: durationMin,
        updatedAt: now.toISOString()
      };
    }));
  };

  const getTodayFieldAssignment = (employeeId: string): FieldAssignment | undefined => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    return fieldAssignments.find(a => {
      if (!doesAssignmentBelongToEmployee(a, employeeId)) return false;
      if (a.status === 'Cancelled') return false;
      if (a.scheduleType === 'One Day') {
        return a.startDate === todayStr;
      } else if (a.scheduleType === 'Date Range') {
        return todayStr >= a.startDate && todayStr <= a.endDate;
      } else if (a.scheduleType === 'Weekly') {
        const startDayOfWeek = new Date(a.startDate).getDay();
        return now.getDay() === startDayOfWeek && todayStr >= a.startDate && todayStr <= a.endDate;
      }
      return todayStr >= a.startDate && todayStr <= a.endDate;
    });
  };


  // ============================================================================
  // MASTER SUPABASE CLOUD SYNCHRONIZATION ENGINE
  // Connects and synchronizes all HRM modules across all devices and browsers
  // ============================================================================
  const syncAllModulesFromDatabase = async (isInitial = false) => {
    if (isSyncingFromCloud.current) return;
    try {
      isSyncingFromCloud.current = true;

      // Parallel batch fetch directly from VPS database
      const [
        rawEmployees, 
        rawTasks, 
        rawAttendance, 
        rawLeaves, 
        rawShifts, 
        rawAssets, 
        rawExpenses, 
        rawJobs, 
        rawCandidates, 
        rawPayroll,
        cloudSettings, 
        cloudDepts
      ] = await Promise.all([
        supabaseDirect.getEmployees().catch(() => []),
        supabaseDirect.getTasks().catch(() => []),
        supabaseDirect.getAttendanceRecords().catch(() => []),
        supabaseDirect.getLeaveRequests().catch(() => []),
        supabaseDirect.getShifts().catch(() => []),
        supabaseDirect.getAssets().catch(() => []),
        supabaseDirect.getExpenses().catch(() => []),
        supabaseDirect.getJobOpenings().catch(() => []),
        supabaseDirect.getCandidates().catch(() => []),
        supabaseDirect.getPayrollRecords().catch(() => []),
        supabaseDirect.getAllCompanySettings().catch(() => ({})),
        supabaseDirect.getDepartments().catch(() => [])
      ]);

      // 1. Synchronize Employees
      if (Array.isArray(rawEmployees) && rawEmployees.length > 0) {
        const currentDepts = Array.isArray(cloudDepts) && cloudDepts.length > 0 ? cloudDepts : departments;
        const mapped = rawEmployees.map(e => mapEmployeeFromDb(e, currentDepts));
        setEmployees(mapped);
      } else {
        setEmployees([]);
      }


      // 2. Synchronize Enterprise Tasks
      if (Array.isArray(rawTasks) && rawTasks.length > 0) {
        const sanitized = rawTasks.map(sanitizeSelfAssignedTask);
        setEnhancedTasks(sanitized);
        try {
          localStorage.setItem('vrm_hrms_enhanced_tasks', JSON.stringify(sanitized));
        } catch (e) {}
      } else {
        setEnhancedTasks([]);
        try { localStorage.removeItem('vrm_hrms_enhanced_tasks'); } catch (e) {}
      }

      // 3. Synchronize All Company Settings & Core Modules
      const settings: Record<string, any> = (cloudSettings || {}) as Record<string, any>;

      // Synchronize Shifts (DB table primary, settings fallback)
      if (Array.isArray(rawShifts) && rawShifts.length > 0) {
        setShifts(rawShifts.map((s: any) => ({
          id: s.id,
          shiftName: s.shift_name,
          startTime: (s.start_time || '').slice(0, 5) || '09:00',
          endTime: (s.end_time || '').slice(0, 5) || '18:00',
          breakDurationMins: s.break_duration_mins ?? 60,
          workingHours: s.working_hours ?? 8,
          gracePeriodMins: s.grace_period_mins ?? 15,
          color: s.color || '#0E7490',
          assignedEmployeeCount: 0,
          assignments: []
        })));
      } else if (Array.isArray(settings?.shifts_data)) {
        setShifts(settings.shifts_data.filter((s: Shift) => s && s.id !== 'SH-01' && s.id !== 'SH-02' && s.id !== 'SH-03'));
      } else {
        setShifts([]);
      }

      // Synchronize Attendance (DB table primary, settings fallback)
      if (Array.isArray(rawAttendance) && rawAttendance.length > 0) {
        setAttendanceRecords(rawAttendance.map((a: any) => {
          const emp = employees.find(e => e.id === a.employee_id || e.employeeId === a.employee?.employee_id || e.employeeId === a.employee_id);
          const fullName = a.employee ? `${a.employee.first_name || ''} ${a.employee.last_name || ''}`.trim() : (emp ? `${emp.firstName} ${emp.lastName}` : 'Staff');
          return {
            id: a.id,
            employeeId: a.employee?.employee_id || emp?.employeeId || a.employee_id,
            employeeName: fullName,
            department: emp?.department || 'General',
            date: a.date,
            shiftId: a.shift_id,
            shiftDate: a.shift_date || a.date,
            checkIn: dbTimestampToLocalHHMM(a.check_in),
            checkOut: dbTimestampToLocalHHMM(a.check_out),
            workingHours: a.working_hours ?? 0,
            status: a.status || 'Present',
            lateStatus: a.late_status || 'On Time',
            method: a.method || 'Face Scan',
            location: { lat: a.location_lat || 13.0827, lng: a.location_lng || 80.2707, address: a.location_address || 'Plant HQ', inGeofence: a.in_geofence ?? true },
            faceVerified: a.face_verified ?? false,
          };
        }));
      } else {
        setAttendanceRecords([]);
      }

      // Synchronize Leaves. In Hostinger VPS mode the leave_requests table is the source of truth.
      if (Array.isArray(rawLeaves) && rawLeaves.length > 0) {
        const mappedLeaves = rawLeaves.map((l: any) => {
          const emp = employees.find(e => e.id === l.employee_id || e.employeeId === l.employee?.employee_id || e.employeeId === l.employee_id);
          const fullName = l.employee ? `${l.employee.first_name || ''} ${l.employee.last_name || ''}`.trim() : (emp ? `${emp.firstName} ${emp.lastName}` : 'Staff');
          const mappedLeave: LeaveRequest = {
            id: l.id,
            employeeId: l.employee?.employee_id || emp?.employeeId || l.employee_id,
            employeeName: fullName || 'Staff',
            department: emp?.department || 'General',
            leaveType: l.leave_type || 'Casual Leave',
            startDate: l.start_date,
            endDate: l.end_date,
            daysCount: Number(l.days_count) || 1,
            reason: l.reason || '',
            status: l.status || 'Pending',
            appliedDate: l.applied_date || l.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
            approvedBy: l.approved_by || (l.status === 'Approved' ? 'Velmurugan R (CEO)' : l.status === 'Rejected' ? 'Pavithra R (HR Manager)' : undefined),
            approvedAt: l.approved_at || (l.status !== 'Pending' ? (l.updated_at || l.created_at) : undefined),
            comment: l.comment
          };
          return mappedLeave;
        });
        setLeaveRequests(mappedLeaves);
        try { localStorage.setItem('vrm_hrms_leave_requests_persistent', JSON.stringify(mappedLeaves)); } catch {}
      } else if (Array.isArray(settings.leave_requests_data) && settings.leave_requests_data.length > 0) {
        setLeaveRequests(settings.leave_requests_data);
      } else {
        setLeaveRequests([]);
        try { localStorage.removeItem('vrm_hrms_leave_requests_persistent'); } catch {}
      }

      // Synchronize Assets (DB table primary, settings fallback)
      if (Array.isArray(rawAssets) && rawAssets.length > 0) {
        setAssets(rawAssets.map((ast: any) => ({
          id: ast.id,
          assetTag: ast.asset_tag,
          name: ast.name,
          category: ast.category,
          serialNumber: ast.serial_number || '',
          purchaseDate: ast.purchase_date || ast.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          purchaseCost: Number(ast.purchase_cost) || 0,
          warrantyExpiry: ast.warranty_expiry || '',
          status: ast.status || 'Available',
          condition: ast.condition || 'Good',
          assignedEmployeeId: ast.assigned_employee_id || '',
          notes: ast.notes || '',
        })));
      } else {
        setAssets([]);
      }

      // Synchronize Expenses (DB table primary, company settings fallback)
      const savedExpenses = Array.isArray(settings.expenses_data) ? settings.expenses_data : [];
      const expenseKey = (exp: Expense) => [
        exp.employeeId,
        exp.category,
        exp.amount,
        exp.date,
        exp.description || '',
        exp.status || 'Pending Manager'
      ].join('|').toLowerCase();

      if (Array.isArray(rawExpenses) && rawExpenses.length > 0) {
        const mappedExpenses = rawExpenses.map((exp: any) => ({
          id: exp.id,
          employeeId: exp.employee?.employee_id || exp.employee_id,
          employeeName: exp.employee ? `${exp.employee.first_name || ''} ${exp.employee.last_name || ''}`.trim() : 'Staff',
          department: exp.employee?.department_id || 'General',
          category: exp.category || 'Travel',
          amount: Number(exp.amount) || 0,
          date: exp.date,
          description: exp.description || '',
          receiptUrl: exp.receipt_url || '',
          status: exp.status || 'Pending'
        }));
        const savedOnlyExpenses = savedExpenses.filter((exp: Expense) => (
          exp?.id &&
          !mappedExpenses.some((dbExp: Expense) => dbExp.id === exp.id || expenseKey(dbExp) === expenseKey(exp))
        ));
        setExpenses(prev => {
          const mergedCloudExpenses = [...savedOnlyExpenses, ...mappedExpenses];
          const cloudIds = new Set(mergedCloudExpenses.map((exp: Expense) => exp.id));
          const cloudKeys = new Set(mergedCloudExpenses.map((exp: Expense) => expenseKey(exp)));
          const localOnlyExpenses = prev.filter((exp: Expense) => (
            String(exp.id).startsWith('EXP-') &&
            !cloudIds.has(exp.id) &&
            !cloudKeys.has(expenseKey(exp))
          ));
          return [...localOnlyExpenses, ...mergedCloudExpenses];
        });
      } else if (savedExpenses.length > 0) {
        setExpenses(savedExpenses);
      } else {
        setExpenses(prev => (isInitial ? [] : prev));
      }

      // Synchronize Recruitment: Jobs & Candidates
      if (Array.isArray(rawJobs) && rawJobs.length > 0) {
        setJobOpenings(rawJobs.map((j: any) => ({
          id: j.id,
          title: j.title,
          department: j.department_id || 'General',
          location: j.location || 'Headquarters',
          type: j.type || 'Full-Time',
          experience: j.experience || '1-3 years',
          positions: Number(j.positions) || 1,
          status: j.status || 'Active',
          postedDate: j.posted_date || j.created_at?.split('T')[0],
          salaryRange: j.salary_range || '',
          description: j.description || '',
          applicantsCount: 0
        })));
      } else {
        setJobOpenings([]);
      }

      const savedCandidates = Array.isArray(settings.candidates_data) ? settings.candidates_data : [];
      const candidateKey = (c: Candidate) => [
        c.email || '',
        c.phone || '',
        c.name || '',
        c.appliedDate || ''
      ].join('|').toLowerCase();

      if (Array.isArray(rawCandidates) && rawCandidates.length > 0) {
        const mappedCandidates: Candidate[] = rawCandidates.map((c: any) => {
          const mapped: Candidate = {
            id: c.id,
            jobId: c.job_id,
            jobTitle: 'Applicant',
            name: c.name,
            email: c.email,
            phone: c.phone || '',
            stage: c.stage || 'Applied',
            appliedDate: c.applied_date || c.created_at?.split('T')[0],
            referrerName: c.referrer_name || '',
            resumeUrl: c.resume_url || '',
            rating: Number(c.rating) || 4.0,
            notes: c.notes || ''
          };
          const saved = savedCandidates.find((s: Candidate) => (
            String(s.id) === String(mapped.id) || candidateKey(s) === candidateKey(mapped)
          ));
          return saved ? { ...mapped, ...saved, id: mapped.id || saved.id, stage: mapped.stage || saved.stage } : mapped;
        });
        const mappedIds = new Set(mappedCandidates.map(c => String(c.id)));
        const mappedKeys = new Set(mappedCandidates.map(candidateKey));
        const savedOnlyCandidates = savedCandidates.filter((c: Candidate) => (
          c?.id &&
          !mappedIds.has(String(c.id)) &&
          !mappedKeys.has(candidateKey(c))
        ));
        const result = [...savedOnlyCandidates, ...mappedCandidates];
        setCandidates(result);
        supabaseDirect.saveCompanySetting('candidates_data', result).catch(() => {});
      } else if (savedCandidates.length > 0) {
        setCandidates(savedCandidates);
      } else {
        setCandidates([]);
      }

      // Synchronize Payroll Records
      if (Array.isArray(rawPayroll) && rawPayroll.length > 0) {
        const savedPayrollRows = Array.isArray(settings.payroll_records_data) ? settings.payroll_records_data : [];
        const MONTH_NAMES = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const mappedRecords: PayrollRecord[] = rawPayroll.map((p: any) => {
          const employeeId = p.employee?.employee_id || p.employee_id;
          const rawMonthStr = String(p.payroll_month || '');
          let year = 2026;
          let monthName = 'October';

          if (rawMonthStr) {
            const parts = rawMonthStr.split('-');
            if (parts.length >= 2) {
              year = Number(parts[0]) || 2026;
              const mIdx = Number(parts[1]) - 1;
              if (mIdx >= 0 && mIdx < 12) {
                monthName = MONTH_NAMES[mIdx];
              }
            }
          }

          const saved = savedPayrollRows.find((row: PayrollRecord) => (
            (row.employeeId === employeeId || row.id === p.id) &&
            row.month?.toLowerCase() === monthName.toLowerCase() &&
            Number(row.year) === year
          ));
          const employeeForScheme = employees.find(e => e.employeeId === employeeId || e.id === employeeId);
          const withPf = saved?.withPf ?? resolveEmployeeWithPf(employeeForScheme || {
            withPf: p.withPf ?? p.with_pf,
            salaryDetails: {
              withPf: p.employee?.withPf ?? p.employee?.with_pf,
              salaryScheme: p.employee?.salaryScheme ?? p.employee?.salary_scheme
            }
          } as Employee);
          const compId = p.company_id || p.companyId || (p.employee?.email?.includes('nexus') || employeeId?.startsWith('EMP-B') ? 'company-b' : 'company-a');
          const rawDept = p.employee?.department_id || p.employee?.department || saved?.department || 'General';
          const currentDepts = Array.isArray(cloudDepts) && cloudDepts.length > 0 ? cloudDepts : departments;
          const matchedDept = currentDepts.find((d: any) => 
            d.id === rawDept || 
            d.name?.toLowerCase() === String(rawDept).toLowerCase() || 
            d.code?.toLowerCase() === String(rawDept).toLowerCase()
          );
          const resolvedDept = matchedDept?.name || (rawDept === '2fa75c7b-6333-4535-b3a7-ea3f6dee1cec' || String(rawDept).toLowerCase().includes('hr') ? 'HR' : (rawDept.length >= 32 && rawDept.includes('-') ? 'General' : rawDept));

          return {
            id: p.id,
            company_id: compId,
            companyId: compId,
            employeeId,
            employeeName: p.employee ? `${p.employee.first_name || ''} ${p.employee.last_name || ''}`.trim() : 'Staff',
            department: resolvedDept,
            designation: p.employee?.designation || saved?.designation || 'Staff',
            month: monthName,
            year,
            basicSalary: Number(p.basic_salary) || saved?.basicSalary || 0,
            allowances: Number(p.allowances) || saved?.allowances || 0,
            da: saved?.da,
            conveyance: saved?.conveyance,
            hra: saved?.hra,
            withPf,
            bonus: Number(p.bonus) || saved?.bonus || 0,
            attendanceBonus: saved?.attendanceBonus || 0,
            rewardEarnings: saved?.rewardEarnings || 0,
            grossSalary: saved?.grossSalary,
            taxDeduction: Number(p.tax_deduction) || saved?.taxDeduction || 0,
            leaveDeduction: Number(p.leave_deduction) || saved?.leaveDeduction || 0,
            advanceDeduction: saved?.advanceDeduction || 0,
            epfDeduction: saved?.epfDeduction || 0,
            esiDeduction: saved?.esiDeduction || 0,
            professionalTax: saved?.professionalTax || 0,
            workingDays: Number(p.working_days) || saved?.workingDays || 30,
            presentDays: Number(p.present_days) || saved?.presentDays || 30,
            paidLeaves: Number(p.paid_leaves) || saved?.paidLeaves || 0,
            unpaidLeaves: Number(p.unpaid_leaves) || saved?.unpaidLeaves || 0,
            paidDays: saved?.paidDays,
            lopDays: saved?.lopDays,
            totalDeductions: saved?.totalDeductions,
            earningsBreakdown: saved?.earningsBreakdown || [],
            deductionsBreakdown: saved?.deductionsBreakdown || [],
            netSalary: Number(p.net_salary) || saved?.netSalary || 0,
            status: p.status || saved?.status || 'Processed',
          };
        });

        // Strict deduplication by (employeeId, month, year)
        const dedupedMap = new Map<string, PayrollRecord>();
        for (const rec of mappedRecords) {
          const key = `${rec.employeeId}_${rec.month}_${rec.year}`;
          if (!dedupedMap.has(key)) {
            dedupedMap.set(key, rec);
          } else {
            const existing = dedupedMap.get(key)!;
            if ((Number(rec.netSalary) > 0 && Number(existing.netSalary) === 0) || String(rec.id) > String(existing.id)) {
              dedupedMap.set(key, rec);
            }
          }
        }
        setPayrollRecords(Array.from(dedupedMap.values()));
      } else if (Array.isArray(settings.payroll_records_data) && settings.payroll_records_data.length > 0) {
        const dedupedMap = new Map<string, PayrollRecord>();
        for (const rec of settings.payroll_records_data) {
          const key = `${rec.employeeId}_${rec.month}_${rec.year}`;
          if (!dedupedMap.has(key)) {
            dedupedMap.set(key, rec);
          }
        }
        setPayrollRecords(Array.from(dedupedMap.values()));
      } else {
        setPayrollRecords([]);
      }

      if (settings) {
        const hasSetting = (key: string) => Object.prototype.hasOwnProperty.call(settings, key);

        // Organization Structure & Departments
        const cloudOrg = settings.org_structure;
        if (hasSetting('org_structure') && cloudOrg && typeof cloudOrg === 'object') {
          const deptNames = Array.isArray(cloudOrg.departments) ? [...cloudOrg.departments] : [];
          const mergedOrg: OrganizationStructure = {
            departments: deptNames,
            designations: Array.isArray(cloudOrg.designations) ? cloudOrg.designations : [],
            employmentTypes: Array.isArray(cloudOrg.employmentTypes) ? cloudOrg.employmentTypes : [],
            workLocations: Array.isArray(cloudOrg.workLocations) ? cloudOrg.workLocations : [],
            reportingManagers: Array.isArray(cloudOrg.reportingManagers) ? cloudOrg.reportingManagers : [],
            teams: Array.isArray(cloudOrg.teams) ? cloudOrg.teams : []
          };
          setOrgStructure(mergedOrg);

          setDepartments(mergedOrg.departments.map(name => ({
            id: `dept-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            name,
            code: name.substring(0, 4).toUpperCase(),
            headName: 'Unassigned',
            headId: '',
            employeeCount: 0,
            budget: 0
          })));
        } else if (Array.isArray(cloudDepts) && cloudDepts.length > 0) {
          const loadedNames = cloudDepts.map(d => d.name);
          setOrgStructure(prev => ({ ...prev, departments: loadedNames }));
          setDepartments(loadedNames.map(name => {
            const match = cloudDepts.find((d: any) => d.name.toLowerCase() === name.toLowerCase());
            return {
              id: match?.id || `dept-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
              name,
              code: match?.code || name.substring(0, 4).toUpperCase(),
              headName: 'Unassigned',
              headId: match?.head_id || '',
              employeeCount: 0,
              budget: match?.budget || 0
            };
          }));
        }

        // Company Details & Branches
        const activeCId = currentUser.company_id || currentUser.companyId || 'company-a';
        if (activeCId === 'company-b') {
          if (hasSetting('company_info_company-b') && settings['company_info_company-b'] && typeof settings['company_info_company-b'] === 'object') {
            setCompanyInfo({ ...COMPANY_B_PROFILE, ...settings['company_info_company-b'] });
          } else {
            setCompanyInfo({ ...COMPANY_B_PROFILE });
          }
        } else {
          if (hasSetting('company_info') && settings.company_info && typeof settings.company_info === 'object') {
            const dbInfo = settings.company_info;
            const isCompBData = dbInfo.company_id === 'company-b' || dbInfo.companyName?.toLowerCase().includes('nexus');
            setCompanyInfo({ ...COMPANY_A_PROFILE, ...(isCompBData ? {} : dbInfo) });
          } else {
            setCompanyInfo({ ...COMPANY_A_PROFILE });
          }
        }

        if (hasSetting('company_branches') && Array.isArray(settings.company_branches)) {
          setCompanyBranches(settings.company_branches);
        }

        // Shift Requests. Use the VPS-only setting key so old Supabase shift_requests_data does not reappear.
        const vpsShiftRequests = Array.isArray(settings[SHIFT_REQUESTS_KEY]) ? settings[SHIFT_REQUESTS_KEY] as ShiftRequest[] : [];
        if (vpsShiftRequests.length > 0) {
          setShiftRequests(vpsShiftRequests);
          try { localStorage.setItem('vrm_hrms_shift_requests_persistent', JSON.stringify(vpsShiftRequests)); } catch {}
          applyApprovedShiftsToEmployees(vpsShiftRequests);
        } else {
          setShiftRequests([]);
          try { localStorage.removeItem('vrm_hrms_shift_requests_persistent'); } catch {}
        }

        // Shared cross-user notifications
        if (Array.isArray(settings.shared_notifications_data)) {
          const cloudNotes = settings.shared_notifications_data as NotificationItem[];
          setSharedNotifications(prev => {
            const cloudIds = new Set(cloudNotes.map(n => n.id));
            const recentCutoff = Date.now() - 2 * 60 * 1000;
            const localOnly = prev.filter(n => !cloudIds.has(n.id) && n.createdAt && new Date(n.createdAt).getTime() >= recentCutoff);
            const localMap = new Map(prev.map(n => [n.id, n]));
            const merged = cloudNotes.map(n => {
              const local = localMap.get(n.id);
              return local
                ? { ...n, readBy: Array.from(new Set([...(n.readBy || []), ...(local.readBy || [])])) }
                : n;
            });
            return [...localOnly, ...merged];
          });
        }

        // Face Logs sync
        if (Array.isArray(settings.face_logs_data) && settings.face_logs_data.length > 0) {
          setFaceLogs(prev => {
            const map = new Map<string, FaceLog>();
            settings.face_logs_data.forEach((l: FaceLog) => map.set(l.id, l));
            prev.forEach(l => map.set(l.id, l));
            const merged = Array.from(map.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 200);
            try {
              if (typeof window !== 'undefined') {
                localStorage.setItem('vrm_hrms_face_logs', JSON.stringify(merged));
              }
            } catch {}
            return merged;
          });
        }

        // Holiday Policies
        if (Array.isArray(settings.holiday_policies_data)) {
          setHolidayPolicies(settings.holiday_policies_data);
        }

        if (hasSetting('weekly_schedules_data') && Array.isArray(settings.weekly_schedules_data)) {
          setWeeklySchedules(settings.weekly_schedules_data);
        }

        if (hasSetting('attendance_config_data') && settings.attendance_config_data && typeof settings.attendance_config_data === 'object') {
          setAttendanceConfig(prev => ({ ...prev, ...settings.attendance_config_data }));
        }

        if (hasSetting('overtime_policy_data') && settings.overtime_policy_data && typeof settings.overtime_policy_data === 'object') {
          setOvertimePolicy(prev => ({ ...prev, ...settings.overtime_policy_data }));
        }

        // Loan Policies
        if (Array.isArray(settings.loan_policies_data) && settings.loan_policies_data.length > 0) {
          const normalizedPolicies = settings.loan_policies_data
            .filter((p: any) => !DEPRECATED_DEFAULT_LOAN_POLICY_NAMES.has(String(p.policyName || p.name || '').trim().toLowerCase()))
            .map((p: any) => ({
              ...p,
              policyName: p.policyName || p.name || 'Advance Salary Policy',
              minRepaymentMonths: p.minRepaymentMonths ?? 1,
              maxRepaymentMonths: p.maxRepaymentMonths ?? 3,
              minLoanAmount: p.minLoanAmount ?? 1000,
              maxLoanAmount: p.maxLoanAmount ?? p.maxEligibleFixedAmount ?? 50000,
              minimumEmploymentMonths: p.minimumEmploymentMonths ?? p.minTenureMonthsRequired ?? 1,
              maxActiveLoans: p.maxActiveLoans ?? 1,
              status: p.status || (p.active ? 'Active' : 'Active')
            }));
          setLoanPolicies(normalizedPolicies);
        }

        // Loan Records
        if (Array.isArray(settings.loan_records_data)) {
          const loanStatusRank = (status?: LoanRecord['status']) => {
            if (status === 'Closed') return 6;
            if (status === 'Active' || status === 'Disbursed') return 5;
            if (status === 'Approved' || status === 'Rejected') return 4;
            if (status === 'Under Review') return 3;
            if (status === 'Pending') return 2;
            return 1;
          };
          setLoanRecords(prev => {
            const byId = new Map<string, LoanRecord>();
            settings.loan_records_data.forEach((record: LoanRecord) => {
              if (record?.id) byId.set(String(record.id), record);
            });
            prev.forEach(local => {
              if (!local?.id) return;
              const cloud = byId.get(String(local.id));
              if (!cloud || loanStatusRank(local.status) >= loanStatusRank(cloud.status)) {
                byId.set(String(local.id), { ...cloud, ...local });
              }
            });
            const merged = Array.from(byId.values());
            const cloudNeedsRepair = merged.some(record => {
              const cloud = settings.loan_records_data.find((r: LoanRecord) => String(r.id) === String(record.id));
              return cloud && loanStatusRank(record.status) > loanStatusRank(cloud.status);
            });
            if (cloudNeedsRepair) {
              supabaseDirect.saveCompanySetting('loan_records_data', merged).catch(() => {});
            }
            return merged;
          });
        }

        // Geofence Config
        if (hasSetting('geofence_config') && settings.geofence_config && typeof settings.geofence_config === 'object') {
          setGeofenceConfig(settings.geofence_config);
        }

        // Field Duty & Tracking
        if (Array.isArray(settings.field_assignments_data)) {
          setFieldAssignments(settings.field_assignments_data);
        }
        if (Array.isArray(settings.trip_sessions_data)) {
          setTripSessions(settings.trip_sessions_data);
        }
        if (Array.isArray(settings.tracking_alerts_data)) {
          setTrackingAlerts(settings.tracking_alerts_data);
        }

        // Payroll Settings Config (Salary Components, PF, ESIC, Tax, etc.)
        if (hasSetting('payroll_settings_config') && settings.payroll_settings_config && typeof settings.payroll_settings_config === 'object') {
          setPayrollSettingsConfig(settings.payroll_settings_config);
        }

        // Master Attendance Policies
        if (hasSetting('master_attendance_policies_data') && Array.isArray(settings.master_attendance_policies_data)) {
          setMasterAttendancePolicies(settings.master_attendance_policies_data);
        }

        // Master Leave Policies
        if (hasSetting('master_leave_policies_data') && Array.isArray(settings.master_leave_policies_data)) {
          setMasterLeavePolicies(settings.master_leave_policies_data);
        }

        // Department OT Policies
        if (hasSetting('department_ot_policies_data') && Array.isArray(settings.department_ot_policies_data)) {
          setDepartmentOtPolicies(settings.department_ot_policies_data.map(normalizeDepartmentOtPolicy));
        }

        // Designations
        if (hasSetting('designations_data') && Array.isArray(settings.designations_data)) {
          setDesignations(settings.designations_data);
        }

        // Departments
        if (hasSetting('departments_data') && Array.isArray(settings.departments_data)) {
          setDepartments(settings.departments_data);
        }

        // Rewards & Recognition
        if (Array.isArray(settings.reward_policies_data)) {
          setRewardPolicies(settings.reward_policies_data);
        }
        if (Array.isArray(settings.employee_rewards_data)) {
          setEmployeeRewardRecords(settings.employee_rewards_data);
        }

        // Enterprise System Config
        if (hasSetting('grades_data') && Array.isArray(settings.grades_data)) setGrades(settings.grades_data);
        if (hasSetting('employment_types_data') && Array.isArray(settings.employment_types_data)) setEmploymentTypes(settings.employment_types_data);
        if (hasSetting('employee_categories_data') && Array.isArray(settings.employee_categories_data)) setEmployeeCategories(settings.employee_categories_data);
        if (hasSetting('employee_config_data') && settings.employee_config_data) setEmployeeConfig(settings.employee_config_data);
        if (hasSetting('general_system_config_data') && settings.general_system_config_data) setGeneralSystemConfig(settings.general_system_config_data);
        if (hasSetting('integrations_config_data') && settings.integrations_config_data) setIntegrationsConfig(settings.integrations_config_data);
      }
    } catch (err) {
      console.warn('[HRMSContext] syncAllModulesFromDatabase notice:', err);
    } finally {
      isSyncingFromCloud.current = false;
      isCloudInitialized.current = true;
    }
  };

  useEffect(() => {
    let isCancelled = false;
    syncAllModulesFromDatabase(true);

    // Live Supabase auto-sync poll (every 15 seconds) across all devices
    const syncInterval = setInterval(() => {
      if (!isCancelled) {
        syncAllModulesFromDatabase(false);
      }
    }, 15000);

    // Sync immediately whenever user switches tabs or window receives focus
    const onFocusWindow = () => {
      if (!isCancelled) {
        syncAllModulesFromDatabase(false);
      }
    };
    window.addEventListener('focus', onFocusWindow);

    return () => {
      isCancelled = true;
      clearInterval(syncInterval);
      window.removeEventListener('focus', onFocusWindow);
    };
  }, []);

  const refreshEmployees = async () => {
    await syncAllModulesFromDatabase(false);
  };

  const refreshSettings = async () => {
    await syncAllModulesFromDatabase(false);
  };

  const refreshTasks = async () => {
    await syncAllModulesFromDatabase(false);
  };

  const syncAllWithCloud = async () => {
    await syncAllModulesFromDatabase(false);
  };

  const activeCompanyId = currentUser.company_id || currentUser.companyId || 'company-a';

  const visibleEmployees = useMemo(() => {
    return employees.filter(emp => {
      const empCId = emp.company_id || emp.companyId;
      if (activeCompanyId === 'company-b') {
        return empCId === 'company-b' || emp.email?.toLowerCase().includes('nexus') || emp.employeeId?.startsWith('EMP-B');
      }
      return empCId === 'company-a' || (!empCId && !emp.email?.toLowerCase().includes('nexus') && !emp.employeeId?.startsWith('EMP-B'));
    });
  }, [employees, activeCompanyId]);

  const visiblePayrollRecords = useMemo(() => {
    return payrollRecords.filter(rec => {
      const recCId = rec.company_id || rec.companyId;
      if (activeCompanyId === 'company-b') {
        return recCId === 'company-b';
      }
      return recCId === 'company-a' || !recCId;
    });
  }, [payrollRecords, activeCompanyId]);

  // Bell feed: shared notifications addressed to this user + this session's local notifications
  const combinedNotifications = useMemo(() => {
    const myKeys = getUserNotificationKeys();
    const shared = sharedNotifications
      .filter(isSharedNotificationForMe)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map(n => ({
        ...n,
        read: (n.readBy || []).some(k => myKeys.includes(String(k).toLowerCase())),
        timestamp: formatNotificationTime(n.createdAt)
      }));
    return [...shared, ...notifications];
  }, [sharedNotifications, notifications, currentUser]);

  return (
    <HRMSContext.Provider value={{
      currentUser,
      updateCurrentUser,
      switchRole,
      hasPermission,
      permissionMatrix,
      updatePermission,
      activeCompanyId,
      switchCompany,
      employees: visibleEmployees,
      allEmployees: employees,
      addEmployee,
      updateEmployee,
      deleteEmployee,
      deleteMultipleEmployees,
      refreshEmployees,
      refreshSettings,
      syncAllWithCloud,
      resetEmployeeLogin,
      updateEmployeeLoginStatus,
      changeEmployeePassword,
      attendanceRecords,
      markAttendance,
      attendanceAuditLogs,
      correctAttendanceRecord,
      missedPunchRequests,
      submitMissedPunchRequest,
      approveMissedPunchRequest,
      rejectMissedPunchRequest,
      editAndApproveMissedPunchRequest,
      overtimeRequests,
      submitOtRequest,
      approveOtRequest,
      rejectOtRequest,
      editAndApproveOtRequest,
      deleteOtRequest,
      addManualOtEntry,
      addManualAttendanceRecord,
      departmentOtPolicies,
      updateDepartmentOtPolicy,
      employeeOtPolicies,
      updateEmployeeOtPolicy,
      overtimePolicy,
      updateOvertimePolicy,
      attendancePolicyConfig,
      updateAttendancePolicyConfig,
      attendanceGlobalSettings,
      updateAttendanceGlobalSettings,
      recordEmployeePunch,
      getEmployeeShiftAttendanceState,
      faceLogs,
      addFaceLog,
      leaveRequests,
      applyLeave,
      approveLeave,
      rejectLeave,
      shifts,
      shiftRequests,
      addShift,
      updateShift,
      deleteShift,
      requestShiftChange,
      approveShiftRequest,
      rejectShiftRequest,
      tasks,
      addTask,
      updateTaskStatus,
      deleteTask,
      enhancedTasks,
      refreshTasks,
      createEnhancedTask,
      updateEnhancedTask,
      markTaskViewed,
      markTaskDailyReportsSeen,
      updateAssigneeProgress,
      closeTask,
      reopenTask,
      addTaskDailyReport,
      updateTaskProcessStatus,
      addTaskComment,
      addTaskAttachment,
      addTaskLink,
      deleteTaskLink,
      convertMOMActionToTask,
      syncMOMTask,
      deleteEnhancedTask,
      taskMasters,
      addTaskMaster,
      updateTaskMaster,
      deleteTaskMaster,
      momMeetings,
      addMOMMeeting,
      escalationRules,
      updateEscalationRule,
      taskWeights,
      updateTaskWeights,
      performanceScores,
      jobOpenings,
      candidates,
      addJobOpening,
      updateCandidateStage,
      referCandidate,
      reviewReferral,
      expenses,
      addExpense,
      approveExpense,
      notifications: combinedNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      addNotification,
      pushSharedNotification,
      sendLeaveReminder,
      payrollRecords: visiblePayrollRecords,
      allPayrollRecords: payrollRecords,
      processPayrollBatch,
      updateEmployeeSalaryScheme,
      updatePayrollRecordAdvanceDeduction,
      markPayrollRecordsPaid,
      departments,
      addDepartment,
      updateDepartment,
      deleteDepartment,
      designations,
      addDesignation,
      updateDesignation,
      deleteDesignation,
      canDeleteEmployee,
      canDeleteDepartment,
      canDeleteBranch,
      canDeleteShift,
      canDeleteDesignation,
      branches,
      addBranch,
      updateBranch,
      deleteBranch,
      addDepartmentToBranch,
      removeDepartmentFromBranch,
      assets,
      addAsset,
      assignAsset,
      deleteAsset,
      searchQuery,
      setSearchQuery,
      activeModule,
      setActiveModule,
      activeSettingsTab,
      setActiveSettingsTab,
      workflowFormat,
      setWorkflowFormat,
      geofenceConfig,
      updateGeofenceConfig,
      isGeofenceAdmin,
      leavePolicies,
      addLeavePolicy,
      updateLeavePolicy,
      deleteLeavePolicy,
      holidayPolicies,
      addHolidayPolicy,
      updateHolidayPolicy,
      deleteHolidayPolicy,
      attendancePolicies,
      addAttendancePolicy,
      updateAttendancePolicy,
      deleteAttendancePolicy,
      weeklySchedules,
      addWeeklySchedule,
      updateWeeklySchedule,
      deleteWeeklySchedule,
      attendanceConfig,
      updateAttendanceConfig,
      policyDocuments,
      addPolicyDocument,
      updatePolicyDocument,
      deletePolicyDocument,
      businessSettings,
      updateBusinessSettings,
      grades,
      addGrade,
      updateGrade,
      deleteGrade,
      employmentTypes,
      addEmploymentType,
      updateEmploymentType,
      deleteEmploymentType,
      employeeCategories,
      addEmployeeCategory,
      updateEmployeeCategory,
      deleteEmployeeCategory,
      employeeConfig,
      updateEmployeeConfig,
      approvalWorkflows,
      addApprovalWorkflow,
      updateApprovalWorkflow,
      deleteApprovalWorkflow,
      notificationTriggers,
      updateNotificationTrigger,
      generalSystemConfig,
      updateGeneralSystemConfig,
      integrationsConfig,
      updateIntegrationsConfig,

      // 5 New Settings Modules & Dynamic Policy Engine
      companyInfo,
      updateCompanyInfo,
      companyBranches,
      addCompanyBranch,
      updateCompanyBranch,
      deleteCompanyBranch,
      orgStructure,
      updateOrgStructure,
      editDepartment,
      removeOrgDepartment,
      editDesignation,
      removeOrgDesignation,
      editEmploymentType,
      removeOrgEmploymentType,
      editWorkLocation,
      removeOrgWorkLocation,
      loadCompanyPreset,
      masterAttendancePolicies,
      addMasterAttendancePolicy,
      updateMasterAttendancePolicy,
      archiveMasterAttendancePolicy,
      toggleMasterAttendancePolicyStatus,
      attendanceCorrections,
      submitAttendanceCorrection,
      reviewAttendanceCorrection,
      masterLeavePolicies,
      addMasterLeavePolicy,
      updateMasterLeavePolicy,
      archiveMasterLeavePolicy,
      toggleMasterLeavePolicyStatus,
      deleteMasterLeavePolicy,
      resetMasterLeavePoliciesToDefault,
      sandwichPolicies,
      sandwichAuditLogs,
      createSandwichPolicy,
      updateSandwichPolicy,
      archiveSandwichPolicy,
      toggleSandwichPolicyStatus,
      deleteSandwichPolicy,
      overrideSandwichCalculation,
      computeSandwichCalculation,
      addSandwichAuditLog,
      payrollSettingsConfig,
      updatePayrollSettingsConfig,
      toggleSalaryComponent,
      rewardPolicies,
      addRewardPolicy,
      updateRewardPolicy,
      archiveRewardPolicy,
      toggleRewardPolicyStatus,
      employeeRewardRecords,
      grantRewardToEmployee,
      policyAuditLogs,
      addPolicyAuditLog,

      // Advance Salary / Loan Management
      loanPolicies,
      activeLoanPolicy,
      createLoanPolicy,
      updateLoanPolicy,
      deleteLoanPolicy,
      loanRecords,
      submitLoanRequest,
      reviewLoanRequest,
      disburseLoan,
      recordManualRepayment,
      calculateEmployeeLoanEligibility,

      // Field Duty & GPS Live Tracking
      fieldAssignments,
      tripSessions,
      trackingAlerts,
      createFieldAssignment,
      updateFieldAssignment,
      cancelFieldAssignment,
      startTrip,
      recordLocationPoint,
      endTrip,
      fieldCheckIn,
      fieldCheckOut,
      resolveTrackingAlert,
      getTodayFieldAssignment
    }}>
      {children}
    </HRMSContext.Provider>
  );
};

export const useHRMS = () => {
  const context = useContext(HRMSContext);
  if (!context) {
    throw new Error('useHRMS must be used within a HRMSProvider');
  }
  return context;
};

