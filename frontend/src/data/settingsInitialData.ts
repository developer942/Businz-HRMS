// VRM Enterprise HRM - Initial Settings & Policy Configuration Data
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
  PolicyAuditLog 
} from '../types/settings';
import { Employee, PayrollRecord } from '../types/hrms';


export const COMPANY_A_PROFILE: CompanyInfo = {
  id: 'comp-a',
  company_id: 'company-a',
  companyCode: '',
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
  registeredAddress: '',
  branchAddress: '',
  ownerName: '',
  authorizedSignatoryName: '',
  authorizedSignatoryDesignation: '',
  signatureImageUrl: '',
  stampImageUrl: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'System',
  updatedAt: new Date().toISOString(),
  updatedBy: 'System'
};

export const COMPANY_B_PROFILE: CompanyInfo = {
  id: 'comp-b',
  company_id: 'company-b',
  companyCode: '',
  logoUrl: '',
  companyName: '',
  legalCompanyName: '',
  companyType: '',
  industry: '',
  registrationNumber: '',
  gstNumber: '',
  panNumber: '',
  cinNumber: '',
  website: '',
  officialEmail: '',
  officialPhone: '',
  registeredAddress: '',
  branchAddress: '',
  ownerName: '',
  authorizedSignatoryName: '',
  authorizedSignatoryDesignation: '',
  signatureImageUrl: '',
  stampImageUrl: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'System',
  updatedAt: new Date().toISOString(),
  updatedBy: 'System'
};

export const INITIAL_COMPANY_INFO: CompanyInfo = {
  ...COMPANY_A_PROFILE
};

export const INITIAL_COMPANY_BRANCHES: CompanyBranch[] = [];

export const INITIAL_ORG_STRUCTURE: OrganizationStructure = {
  departments: [],
  designations: [],
  employmentTypes: [],
  workLocations: [],
  reportingManagers: [],
  teams: []
};

export const DEFAULT_MASTER_ATTENDANCE_POLICIES: AttendancePolicy[] = [
  {
    id: 'AP-DEFAULT-001',
    policyName: 'Standard Corporate Attendance Policy',
    applicableDepartments: 'ALL',
    applicableDesignations: 'ALL',
    applicableShifts: 'ALL',
    applicableEmployees: 'ALL',
    graceTimeMinutes: 40,
    allowedLateCount: 3,
    warningSystemEnabled: true,
    halfDayRuleEnabled: true,
    halfDayThresholdCount: 4,
    lopRuleEnabled: true,
    lopThresholdCount: 6,
    lateRuleType: 'COUNT_BASED',
    status: 'Active',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'System',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'System'
  }
];

export const INITIAL_ATTENDANCE_CORRECTIONS: AttendanceCorrectionRequest[] = [];

export const DEFAULT_MASTER_LEAVE_POLICIES: MasterLeavePolicy[] = [];

export const INITIAL_PAYROLL_CONFIG: PayrollSettingsConfig = {
  components: [],

  pfPolicy: {
    active: false,
    calculationType: 'PERCENTAGE',
    percentage: 0,
    calculationBase: 'BASIC',
    formula: '',
    effectiveDate: '',
    version: 1
  },

  esicPolicy: {
    active: false,
    percentage: 0,
    grossSalaryLimit: 0,
    formula: '',
    effectiveDate: '',
    version: 1
  },

  incrementPolicy: {
    active: false,
    cycle: '',
    effectiveMonth: 'April',
    standardBaseIncrement: 0,
    allowManagerRecommendation: false,
    slabs: []
  },

  standardWorkingDaysPerMonth: 26,
  payrollCycleDay: 1,
  enableProfessionalTax: false,
  standardPtAmount: 0,
  updatedAt: new Date().toISOString(),
  updatedBy: ''
};

export const INITIAL_REWARD_POLICIES: RewardPolicy[] = [];

export const INITIAL_EMPLOYEE_REWARDS: EmployeeRewardRecord[] = [];

export const INITIAL_POLICY_AUDIT_LOGS: PolicyAuditLog[] = [];

export const SAMPLE_COMPANY_A_EMPLOYEES: Employee[] = [];

export const SAMPLE_COMPANY_B_EMPLOYEES: Employee[] = [];

export const SAMPLE_COMPANY_A_PAYROLL: PayrollRecord[] = [];

export const SAMPLE_COMPANY_B_PAYROLL: PayrollRecord[] = [];
