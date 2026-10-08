import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { Employee, Role } from '../../types/hrms';
import { SalaryComponentConfig } from '../../types/settings';
import { API_BASE_URL } from '../../config/api';
import { supabaseDirect } from '../../services/supabaseDirectService';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { 
  X, 
  CheckCircle2, 
  FileText, 
  ArrowRight, 
  ArrowLeft,
  User, 
  Briefcase, 
  MapPin, 
  GraduationCap, 
  CreditCard, 
  Clock, 
  FolderPlus, 
  CheckCheck,
  Upload,
  Trash2,
  Camera,
  Phone,
  Mail,
  Building,
  RefreshCw,
  FileCheck,
  AlertCircle,
  Award,
  Edit3,
  Eye,
  EyeOff,
  Lock,
  KeyRound,
  Copy,
  Check
} from 'lucide-react';
import { dispatchCredentialEmail } from '../../services/emailDispatchService';
import { buildPayrollFormulaContext, calculateConfiguredDeductionLines, calculateSalaryBreakdown } from '../../services/policyEngine';
import { generateNextEmployeeId } from '../../utils/employeeIdUtils';
import { formatCurrency } from '../../utils/numbers';
import { CountryCodeDropdown } from '../common/CountryCodeDropdown';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateOfferLetter?: (employee: Employee) => void;
}

interface UploadedDoc {
  id: string;
  category: string;
  name: string;
  size: string;
  type: string;
  uploadDate: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const PASSING_YEARS = Array.from(
  { length: CURRENT_YEAR - 1960 + 1 },
  (_, i) => String(CURRENT_YEAR - i)
);

export const HIGHEST_QUALIFICATION_OPTIONS = ['UG', 'PG', 'Diploma', 'Others'] as const;

export const DEGREE_OPTIONS_BY_QUALIFICATION: Record<string, string[]> = {
  UG: [
    'B.E / B.Tech (Engineering / Technology)',
    'B.Sc / BCA (Science / Computer Apps)',
    'B.Com / B.A / BBA (Commerce / Arts / Admin)',
    'B.Arch / B.Des (Architecture / Design)',
    'B.Pharm / Medical (Pharmacy / Medicine)',
    'Other UG Degree'
  ],
  PG: [
    'M.E / M.Tech (Master of Engineering)',
    'MBA (Master of Business Admin)',
    'MCA (Master of Computer Apps)',
    'M.Sc / M.Com / M.A (Post Graduate)',
    'Ph.D / Doctorate Research',
    'Other PG Degree'
  ],
  Diploma: [
    'Diploma (Polytechnic / Technical)',
    'Diploma in Mechanical Engineering',
    'Diploma in Civil Engineering',
    'Diploma in Electrical & Electronics (EEE)',
    'Diploma in Electronics & Communication (ECE)',
    'Diploma in Computer Engineering / IT',
    'Other Diploma'
  ],
  Others: [
    'ITI Certification',
    '12th Standard / HSC',
    '10th Standard / SSLC',
    'Vocational Training / Certificate',
    'Other Equivalent Qualification'
  ]
};

export const ALL_DEGREE_OPTIONS: string[] = Array.from(
  new Set(Object.values(DEGREE_OPTIONS_BY_QUALIFICATION).flat())
);

const BLOOD_GROUP_OPTIONS: NonNullable<Employee['bloodGroup']>[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const normalizeQualification = (qual?: string): string => {
  if (!qual) return 'UG';
  const q = qual.trim();
  if (['UG', 'PG', 'Diploma', 'Others'].includes(q)) return q;
  if (/B\.E|B\.Tech|B\.Sc|BCA|B\.Com|B\.A|BBA|UG|Bachelor/i.test(q)) return 'UG';
  if (/M\.E|M\.Tech|MBA|MCA|M\.Sc|M\.Com|M\.A|Ph\.D|Doctorate|PG|Master/i.test(q)) return 'PG';
  if (/Diploma|Polytechnic/i.test(q)) return 'Diploma';
  return 'Others';
};

// Real-time Keystroke Format Filters
const allowControlKeys = (e: React.KeyboardEvent) => {
  return (
    ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Home', 'End'].includes(e.key) ||
    e.ctrlKey || e.metaKey || e.altKey
  );
};

const handleLettersOnlyKeyDown = (e: React.KeyboardEvent) => {
  if (allowControlKeys(e)) return;
  if (!/^[a-zA-Z\s]$/.test(e.key)) {
    e.preventDefault();
  }
};

const handleDigitsOnlyKeyDown = (e: React.KeyboardEvent) => {
  if (allowControlKeys(e)) return;
  if (!/^[0-9]$/.test(e.key)) {
    e.preventDefault();
  }
};

const handleDecimalKeyDown = (currentVal: string) => (e: React.KeyboardEvent) => {
  if (allowControlKeys(e)) return;
  if (e.key === '.' && !currentVal.includes('.')) return;
  if (!/^[0-9]$/.test(e.key)) {
    e.preventDefault();
  }
};

const handleUniversityKeyDown = (e: React.KeyboardEvent) => {
  if (allowControlKeys(e)) return;
  if (!/^[a-zA-Z\s&.\-]$/.test(e.key)) {
    e.preventDefault();
  }
};

const handleAddressLineKeyDown = (e: React.KeyboardEvent) => {
  if (allowControlKeys(e)) return;
  if (!/^[a-zA-Z0-9\s,.\-/#]$/.test(e.key)) {
    e.preventDefault();
  }
};

const handleAlphanumericKeyDown = (e: React.KeyboardEvent) => {
  if (allowControlKeys(e)) return;
  if (!/^[a-zA-Z0-9]$/.test(e.key)) {
    e.preventDefault();
  }
};

const handleCompanyKeyDown = (e: React.KeyboardEvent) => {
  if (allowControlKeys(e)) return;
  if (!/^[a-zA-Z0-9\s&.\-()]$/.test(e.key)) {
    e.preventDefault();
  }
};

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({ 
  isOpen, 
  onClose,
  onGenerateOfferLetter 
}) => {
  const { 
    addEmployee, 
    departments, 
    employees, 
    designations, 
    branches, 
    shifts, 
    leavePolicies, 
    weeklySchedules, 
    holidayPolicies,
    businessSettings,
    employeeConfig,
    resetEmployeeLogin,
    payrollSettingsConfig,
    employmentTypes,
    orgStructure,
    currentUser,
    companyBranches,
    companyInfo
  } = useHRMS();

  // Dynamic salary components configured in Settings → Payroll Settings
  const activeEarnings = useMemo(() => {
    return (payrollSettingsConfig?.components || []).filter(c => c.active && c.type === 'EARNING');
  }, [payrollSettingsConfig]);

  const activeDeductions = useMemo(() => {
    return (payrollSettingsConfig?.components || []).filter(c => c.active && c.type === 'DEDUCTION');
  }, [payrollSettingsConfig]);

  const employmentTypeOptions = useMemo(() => {
    const names = [
      ...(orgStructure?.employmentTypes || []),
      ...(employmentTypes || []).filter(t => t.status !== 'Inactive').map(t => t.name)
    ]
      .map(name => name.trim())
      .filter(Boolean);

    const uniqueNames = Array.from(new Map(names.map(name => [name.toLowerCase(), name])).values());
    return uniqueNames.length > 0 ? uniqueNames : ['Full-Time', 'Intern', 'Provisional'];
  }, [orgStructure, employmentTypes]);

  const defaultEmploymentType = employmentTypeOptions[0] || 'Full-Time';
  const workLocationOptions = useMemo(() => {
    const options = [
      ...(companyBranches || []).map(branch => ({
        value: branch.branchName?.trim(),
        label: `${branch.branchName?.trim()}${branch.address?.city ? ` (${branch.address.city})` : ''}`
      })),
      ...(branches || []).map(branch => ({
        value: branch.name?.trim(),
        label: `${branch.name?.trim()}${branch.location ? ` (${branch.location})` : ''}`
      })),
      ...(orgStructure?.workLocations || []).map(location => ({
        value: location.trim(),
        label: location.trim()
      }))
    ].filter(option => option.value);

    return Array.from(new Map(options.map(option => [option.value.toLowerCase(), option])).values());
  }, [companyBranches, branches, orgStructure]);

  const defaultWorkLocation = workLocationOptions[0]?.value || '';

  // Dynamic designations configured in Settings → Organization Settings / Company Details
  const dynamicDesignations = useMemo(() => {
    const list = [
      ...(orgStructure?.designations || []),
      ...(designations || []).map(d => d.title)
    ]
      .map(t => t.replace(/[0-9]/g, '').trim())
      .filter(t => Boolean(t) && t.toLowerCase() !== 'managing director' && t.toLowerCase() !== 'ceo');

    return Array.from(new Set(list));
  }, [orgStructure, designations]);
  const getCreatorReportingManager = () => {
    const currentEmployee = employees.find(emp => {
      const fullName = `${emp.firstName} ${emp.lastName}`.trim().toLowerCase();
      return (
        Boolean(currentUser?.employeeId && emp.employeeId === currentUser.employeeId) ||
        Boolean(currentUser?.id && (emp.id === currentUser.id || (emp as any).authUserId === currentUser.id)) ||
        Boolean(currentUser?.email && emp.email?.toLowerCase() === currentUser.email.toLowerCase()) ||
        Boolean(currentUser?.name && fullName === currentUser.name.toLowerCase().trim())
      );
    });

    const name = currentEmployee
      ? `${currentEmployee.firstName} ${currentEmployee.lastName}`.trim()
      : (currentUser?.name || '');

    return {
      id: currentEmployee?.employeeId || currentUser?.employeeId || currentUser?.id || '',
      name,
      designation: currentEmployee?.designation || currentUser?.designation || currentUser?.role || ''
    };
  };

  const creatorReportingManager = getCreatorReportingManager();
  const [step, setStep] = useState<number>(1);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [createdEmployee, setCreatedEmployee] = useState<Employee | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [emailDeliveryStatus, setEmailDeliveryStatus] = useState<'SENT' | 'FAILED'>('SENT');
  const [resendStatusMessage, setResendStatusMessage] = useState<string | null>(null);
  const [successPasswordRevealed, setSuccessPasswordRevealed] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Prevent background scrolling and lock viewport cleanly
  useEffect(() => {
    if (isOpen) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [isOpen]);

  // Auto-initialize components from Payroll Settings when modal opens
  useEffect(() => {
    if (isOpen && activeEarnings.length > 0 && Object.keys(formData.customComponents || {}).length === 0) {
      handleCtcChange(String(formData.monthlyCtc || 15000));
    }
  }, [isOpen, activeEarnings]);

  // Hidden file input ref for real file upload selection
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadCategory, setActiveUploadCategory] = useState<string>('');

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, JPEG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        handleChange('avatar', result);
      }
    };
    reader.readAsDataURL(file);
  };

  const currentPrefix = companyInfo?.companyCode || employeeConfig?.idFormatPrefix || businessSettings?.employeeCodePrefix || 'EMP';
  const currentDigits = employeeConfig?.idFormatDigits || 3;
  const currentStartNum = employeeConfig?.idStartingNumber || 1;

  const defaultFormData = {
    // 1. Personal Information
    employeeId: generateNextEmployeeId(employees, currentPrefix, currentDigits, currentStartNum),
    firstName: '',
    lastName: '',
    avatar: '',
    gender: 'Male' as Employee['gender'],
    dob: '',
    phone: '',
    personalEmail: '',
    password: '',
    maritalStatus: '' as 'Single' | 'Married' | 'Divorced' | 'Widowed' | '',
    bloodGroup: '' as Employee['bloodGroup'],

    // 2. Employment Information
    joiningDate: new Date().toISOString().split('T')[0],
    department: departments.find(d => !['ceo'].includes(d.name.toLowerCase()))?.name || 'Accounts',
    designation: dynamicDesignations[0] || '',
    employmentType: defaultEmploymentType,
    reportingManagerId: creatorReportingManager.id,
    reportingManagerName: creatorReportingManager.name,
    workLocation: defaultWorkLocation,
    status: 'Active' as Employee['status'],

    // 3. Address & Emergency Contact
    currentLine1: '',
    currentLine2: '',
    currentCity: '',
    currentState: '',
    currentCountry: 'India',
    currentPincode: '',
    sameAsCurrent: true,
    permanentLine1: '',
    permanentLine2: '',
    permanentCity: '',
    permanentState: '',
    permanentCountry: 'India',
    permanentPincode: '',
    emergencyName: '',
    emergencyRelationship: 'Parent',
    emergencyMobile: '',
    emergencyAltMobile: '',

    // 4. Educational Details
    qualification: 'UG',
    degreeName: 'B.E / B.Tech (Engineering / Technology)',
    specialization: '',
    university: '',
    yearOfPassing: '',
    gradePercentage: '',

    // 5. Experience Details
    experienceType: 'Fresher' as 'Fresher' | 'Experienced',
    totalExperience: '',
    previousCompany: '',
    previousDesignation: '',
    previousDepartment: '',
    expStartDate: '',
    expEndDate: '',
    lastDrawnSalary: '',
    previousCompanyLocation: '',
    relevantExperience: '',
    skills: '',

    // 6. Salary & Payroll
    salaryStructure: 'Standard Industrial CTC',
    salaryScheme: 'WITHOUT_PF' as 'WITH_PF' | 'WITHOUT_PF',
    withPf: false,
    monthlyCtc: 15000,
    basicSalary: 15000,
    da: 0,
    conveyance: 0,
    hra: 0,
    transport: 0,
    medical: 0,
    special: 0,
    customComponents: {} as Record<string, number>,
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branch: '',
    panNumber: '',
    uanNumber: '',

    // 6. Attendance & Shift
    attendanceMethod: 'Face Scan' as Employee['attendanceMethod'],
    shift: shifts[0]?.shiftName || 'General Day Shift',
    weeklyOff: weeklySchedules[0]?.name || 'Sunday',
    holidayCalendar: holidayPolicies[0]?.name || 'Tamil Nadu Industrial Calendar (14 Days)',
    leavePolicy: leavePolicies[0]?.name || 'Standard 18 Casual + 12 Medical + 10 Earned',
    gpsAllowed: true,

    // 7. System Access & Permissions
    officialUsername: '',
    role: 'Employee' as Role,
    accountStatus: 'Active' as 'Active' | 'Inactive',
    sendInvite: true,
    permissions: ['Dashboard', 'Attendance', 'Leaves', 'Tasks']
  };

  const [formData, setFormData] = useState(defaultFormData);
  const [phoneCountryCode, setPhoneCountryCode] = useState('+91');
  const [emergencyCountryCode, setEmergencyCountryCode] = useState('+91');
  const [altEmergencyCountryCode, setAltEmergencyCountryCode] = useState('+91');
  const [salaryInputDrafts, setSalaryInputDrafts] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [isCustomDesignation, setIsCustomDesignation] = useState<boolean>(false);
  const [isCustomDegree, setIsCustomDegree] = useState<boolean>(false);

  // Maximum allowed DOB date for 18+ requirement
  const maxDobDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split('T')[0];
  }, []);

  const isCEO = 
    formData.department?.trim().toUpperCase() === 'CEO' || 
    formData.role === 'CEO' || 
    formData.designation?.trim().toUpperCase() === 'CEO';

  const salaryInputValue = (key: string, value: number) => (
    Object.prototype.hasOwnProperty.call(salaryInputDrafts, key) ? salaryInputDrafts[key] : value
  );

  const setSalaryDraft = (key: string, rawValue: string) => {
    setSalaryInputDrafts(prev => {
      const next = { ...prev };
      if (rawValue === '') {
        next[key] = '';
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const allSteps = [
    { num: 1, label: 'Personal', fullTitle: 'Basic Personal Information', icon: User },
    { num: 2, label: 'Employment', fullTitle: 'Employment & Role Details', icon: Briefcase },
    { num: 3, label: 'Address', fullTitle: 'Address & Emergency Contacts', icon: MapPin },
    { num: 4, label: 'Education', fullTitle: 'Educational Background & Qualifications', icon: GraduationCap },
    { num: 5, label: 'Experience', fullTitle: 'Previous Work Experience & History', icon: Award, exemptForCEO: true },
    { num: 6, label: 'Salary', fullTitle: 'Salary, Compensation & Bank Details', icon: CreditCard, exemptForCEO: true },
    { num: 7, label: 'Attendance', fullTitle: 'Attendance Mode & Work Shifts', icon: Clock, exemptForCEO: true },
    { num: 8, label: 'Documents', fullTitle: 'Employee Documents & Verification', icon: FolderPlus, exemptForCEO: true },
    { num: 9, label: 'Review', fullTitle: 'Comprehensive Onboarding Review', icon: CheckCheck }
  ];

  const stepsList = isCEO ? allSteps.filter(s => !s.exemptForCEO) : allSteps;
  const currentStepIndex = Math.max(0, stepsList.findIndex(s => s.num === step));
  const currentStep = stepsList[currentStepIndex] || stepsList[0];

  const standardDeptOptions = [
    { id: 'dept-ceo', name: 'CEO' },
    { id: 'dept-hr', name: 'HR' },
    { id: 'dept-accounts', name: 'Accounts' }
  ];
  const allDepartmentOptions = [...standardDeptOptions];
  departments.forEach(d => {
    if (!allDepartmentOptions.some(opt => opt.name.toLowerCase() === d.name.toLowerCase())) {
      allDepartmentOptions.push(d);
    }
  });

  const getDepartmentAccessProfile = (deptName: string) => {
    const normalizedDept = deptName.trim().toLowerCase();
    const isCeoDept = normalizedDept === 'ceo' || normalizedDept.includes('ceo');
    const isHrDept = normalizedDept === 'hr' || normalizedDept.includes('human resource');
    const isAccountsDept = normalizedDept === 'accounts' || normalizedDept.includes('account') || normalizedDept.includes('finance');

    if (isCeoDept) {
      return {
        department: 'CEO',
        role: 'CEO' as Role,
        designation: 'CEO',
        permissions: ['Dashboard', 'Employees', 'Attendance', 'Leaves', 'Payroll', 'Finance', 'Tasks', 'Settings']
      };
    }

    if (isHrDept) {
      return {
        department: deptName,
        role: 'HR Manager' as Role,
        designation: 'HR Manager',
        permissions: ['Dashboard', 'Employees', 'Attendance', 'Leaves', 'Payroll', 'Finance', 'Tasks']
      };
    }

    if (isAccountsDept) {
      return {
        department: deptName,
        role: 'Employee' as Role,
        designation: 'Accounts Executive',
        permissions: ['Dashboard', 'Attendance', 'Leaves', 'Payroll', 'Finance', 'Advance Salary', 'Tasks']
      };
    }

    return {
      department: deptName,
      role: 'Employee' as Role,
      designation: '',
      permissions: ['Dashboard', 'Attendance', 'Leaves', 'Tasks']
    };
  };

  // Sync official username when names change
  useEffect(() => {
    if (formData.firstName && formData.lastName) {
      setFormData(prev => ({
        ...prev,
        officialUsername: prev.officialUsername || `${formData.firstName.toLowerCase()}.${formData.lastName.toLowerCase()}`
      }));
    }
  }, [formData.firstName, formData.lastName]);

  const handleRoleSelectionChange = (selectedRole: Role) => {
    if (selectedRole === 'CEO') {
      setFormData(prev => ({
        ...prev,
        role: 'CEO',
        department: 'CEO',
        designation: 'CEO',
        reportingManagerName: 'Self / Board of Directors',
        reportingManagerId: 'OWNER-001',
        attendanceMethod: 'Exempt',
        gpsAllowed: false,
        monthlyCtc: 0,
        basicSalary: 0,
        permissions: ['Dashboard', 'Employees', 'Attendance', 'Leaves', 'Payroll', 'Finance', 'Tasks', 'Settings']
      }));
    } else if (selectedRole === 'HR Manager' || selectedRole === 'HR Admin') {
      const manager = getCreatorReportingManager();
      setFormData(prev => ({
        ...prev,
        role: selectedRole,
        department: prev.department === 'CEO' ? 'HR' : prev.department,
        designation: 'HR Manager',
        reportingManagerName: manager.name,
        reportingManagerId: manager.id,
        attendanceMethod: 'Face Scan',
        gpsAllowed: true,
        permissions: ['Dashboard', 'Employees', 'Attendance', 'Leaves', 'Payroll', 'Finance', 'Tasks']
      }));
    } else if (selectedRole === 'Finance Manager') {
      const manager = getCreatorReportingManager();
      setFormData(prev => ({
        ...prev,
        role: 'Finance Manager',
        department: prev.department === 'CEO' ? 'Accounts' : prev.department,
        designation: 'Finance Manager',
        reportingManagerName: manager.name,
        reportingManagerId: manager.id,
        attendanceMethod: 'Face Scan',
        gpsAllowed: true,
        permissions: ['Dashboard', 'Payroll', 'Finance', 'Tasks']
      }));
    } else {
      const manager = getCreatorReportingManager();
      setFormData(prev => ({
        ...prev,
        role: 'Employee',
        department: prev.department === 'CEO' ? 'Operations' : prev.department,
        designation: prev.designation === 'CEO' ? (designations[0]?.title || 'Staff Employee') : prev.designation,
        reportingManagerName: manager.name,
        reportingManagerId: manager.id,
        attendanceMethod: prev.attendanceMethod === 'Exempt' ? 'Face Scan' : prev.attendanceMethod,
        gpsAllowed: true,
        permissions: ['Dashboard', 'Attendance', 'Leaves', 'Tasks']
      }));
    }
  };

  const handleDepartmentSelectionChange = (deptName: string) => {
    const accessProfile = getDepartmentAccessProfile(deptName);
    const isAccountsDept = deptName.toLowerCase().includes('account') || deptName.toLowerCase().includes('finance');

    if (accessProfile.role === 'CEO') {
      if ([5, 6, 7, 8].includes(step)) {
        setStep(2);
      }
      setFormData(prev => ({
        ...prev,
        department: accessProfile.department,
        role: accessProfile.role,
        designation: accessProfile.designation,
        reportingManagerName: 'Self / Board of Directors',
        reportingManagerId: 'OWNER-001',
        attendanceMethod: 'Exempt',
        gpsAllowed: false,
        monthlyCtc: 0,
        basicSalary: 0,
        permissions: accessProfile.permissions
      }));
    } else if (accessProfile.role === 'HR Manager') {
      const manager = getCreatorReportingManager();
      setFormData(prev => ({
        ...prev,
        department: accessProfile.department,
        role: accessProfile.role,
        designation: accessProfile.designation,
        reportingManagerName: manager.name,
        reportingManagerId: manager.id,
        attendanceMethod: 'Face Scan',
        gpsAllowed: true,
        permissions: accessProfile.permissions
      }));
    } else if (accessProfile.role === 'Finance Manager' || isAccountsDept) {
      const manager = getCreatorReportingManager();
      setFormData(prev => ({
        ...prev,
        department: accessProfile.department,
        role: accessProfile.role,
        designation: prev.designation === 'CEO' || prev.designation === 'HR Manager' || prev.designation === 'Managing Director' || !prev.designation ? accessProfile.designation : prev.designation,
        reportingManagerName: manager.name,
        reportingManagerId: manager.id,
        attendanceMethod: 'Face Scan',
        gpsAllowed: true,
        permissions: accessProfile.permissions
      }));
    } else {
      const manager = getCreatorReportingManager();
      setFormData(prev => ({
        ...prev,
        department: accessProfile.department,
        role: accessProfile.role,
        designation: prev.designation === 'CEO' || prev.designation === 'HR Manager' || prev.designation === 'Finance Manager' || prev.designation === 'Managing Director'
          ? (dynamicDesignations[0] || '')
          : prev.designation,
        reportingManagerName: manager.name,
        reportingManagerId: manager.id,
        attendanceMethod: prev.attendanceMethod === 'Exempt' ? 'Face Scan' : prev.attendanceMethod,
        gpsAllowed: true,
        permissions: accessProfile.permissions
      }));
    }
    if (validationError) setValidationError(null);
  };

  // Sync permanent address when sameAsCurrent is toggled
  useEffect(() => {
    if (formData.sameAsCurrent) {
      setFormData(prev => ({
        ...prev,
        permanentLine1: prev.currentLine1,
        permanentLine2: prev.currentLine2,
        permanentCity: prev.currentCity,
        permanentState: prev.currentState,
        permanentCountry: prev.currentCountry,
        permanentPincode: prev.currentPincode
      }));
    }
  }, [formData.sameAsCurrent, formData.currentLine1, formData.currentLine2, formData.currentCity, formData.currentState, formData.currentCountry, formData.currentPincode]);

  // Reset wizard on modal open with fresh auto-generated Employee ID
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSalaryInputDrafts({});
      const nextAutoId = generateNextEmployeeId(
        employees,
        companyInfo?.companyCode || employeeConfig?.idFormatPrefix || businessSettings?.employeeCodePrefix || 'EMP',
        employeeConfig?.idFormatDigits || 3,
        employeeConfig?.idStartingNumber || 1
      );
      const manager = getCreatorReportingManager();
      const initialDept = departments.find(d => !['ceo'].includes(d.name?.trim().toLowerCase()))?.name || 'Accounts';
      const initialProfile = getDepartmentAccessProfile(initialDept);

      setFormData({
        ...defaultFormData,
        employeeId: nextAutoId,
        firstName: '',
        lastName: '',
        phone: '',
        personalEmail: '',
        password: '',
        currentLine1: '',
        currentLine2: '',
        currentCity: '',
        currentState: '',
        currentPincode: '',
        permanentLine1: '',
        permanentLine2: '',
        permanentCity: '',
        permanentState: '',
        permanentPincode: '',
        emergencyName: '',
        emergencyMobile: '',
        emergencyAltMobile: '',
        department: initialDept,
        role: (initialProfile.role === 'CEO' ? 'Employee' : initialProfile.role) as Role,
        designation: initialProfile.designation || dynamicDesignations[0] || 'Staff Employee',
        reportingManagerId: manager.id,
        reportingManagerName: manager.name,
        workLocation: defaultWorkLocation,
        shift: shifts[0]?.shiftName || defaultFormData.shift,
        attendanceMethod: 'Face Scan' as Employee['attendanceMethod'],
        gpsAllowed: true,
        monthlyCtc: 15000,
        basicSalary: 15000,
        permissions: initialProfile.permissions
      });
      setDocuments([]);
      setIsSuccess(false);
      setCreatedEmployee(null);
    }
  }, [isOpen]);

  const handleChange = (field: string, value: any) => {
    let sanitizedValue = value;

    // Names (Letters, spaces, '.', "'", '-' allowed)
    if (['firstName', 'lastName'].includes(field)) {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z\s.'-]/g, '').slice(0, 15) : value;
    }
    if (field === 'emergencyName') {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z\s.'-]/g, '').slice(0, 100) : value;
    }

    if (['currentCity', 'permanentCity', 'currentState', 'permanentState', 'currentCountry', 'permanentCountry'].includes(field)) {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z\s]/g, '').slice(0, 100) : value;
    }

    // Phone & Emergency Mobile numbers (Digits only, max 10)
    if (['phone', 'emergencyMobile', 'emergencyAltMobile'].includes(field)) {
      sanitizedValue = typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 10) : value;
    }

    // Address Lines (Letters, numbers, spaces, and , . - / #)
    if (['currentLine1', 'currentLine2', 'permanentLine1', 'permanentLine2'].includes(field)) {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z0-9\s,.\-/#]/g, '') : value;
    }

    // Pincode (Exactly digits, max 6)
    if (field === 'currentPincode' || field === 'permanentPincode') {
      sanitizedValue = typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 6) : value;
    }

    // University (Letters, spaces, and &, -, . strictly - no digits/symbols)
    if (field === 'university') {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z\s&.\-]/g, '') : value;
    }

    // Degree Name
    if (field === 'degreeName') {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z0-9\s&.\-()/]/g, '') : value;
    }

    // Specialization (Letters, spaces, and &, -, . ONLY - strictly no digits)
    if (field === 'specialization') {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z\s&.\-]/g, '') : value;
    }

    // Grade / Percentage (0 to 100, decimal allowed)
    if (field === 'gradePercentage') {
      if (typeof value === 'string') {
        let val = value.replace(/[^0-9.]/g, '');
        const parts = val.split('.');
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
        if (parseFloat(val) > 100) val = '100';
        sanitizedValue = val;
      }
    }

    // Total Experience (non-negative decimal allowed e.g. 2.5)
    if (field === 'totalExperience' || field === 'relevantExperience') {
      if (typeof value === 'string') {
        let val = value.replace(/[^0-9.]/g, '');
        const parts = val.split('.');
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
        sanitizedValue = val;
      } else if (typeof value === 'number') {
        sanitizedValue = Math.max(0, value).toString();
      }
    }

    // Previous Company & Location
    if (field === 'previousCompany' || field === 'previousCompanyLocation') {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z0-9\s&.\-(),/]/g, '') : value;
    }

    // Designation & Previous Designation
    if (field === 'designation') {
      sanitizedValue = typeof value === 'string' ? value.replace(/[0-9]/g, '') : value;
    }
    if (field === 'previousDesignation') {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z0-9\s&.\-()]/g, '') : value;
    }

    // Last Drawn Salary (decimal positive)
    if (field === 'lastDrawnSalary') {
      if (typeof value === 'string') {
        let val = value.replace(/[^0-9.]/g, '');
        const parts = val.split('.');
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
        sanitizedValue = val;
      }
    }

    // Bank Name (letters, spaces, &, -, ()) - not numeric-only
    if (field === 'bankName') {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z\s&.\-()]/g, '') : value;
    }

    // Account Number (digits only, max 18)
    if (field === 'accountNumber') {
      sanitizedValue = typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 18) : value;
    }

    // IFSC Code (alphanumeric uppercase, max 11)
    if (field === 'ifscCode') {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11) : value;
    }

    // PAN Number (alphanumeric uppercase, max 10)
    if (field === 'panNumber') {
      sanitizedValue = typeof value === 'string' ? value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) : value;
    }

    // UAN Number (digits only, max 12)
    if (field === 'uanNumber') {
      sanitizedValue = typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 12) : value;
    }

    setFormData(prev => ({ ...prev, [field]: sanitizedValue }));
    if (validationError) setValidationError(null);
  };

  const handleQualificationChange = (newQual: string) => {
    setIsCustomDegree(false);
    const defaultDeg = DEGREE_OPTIONS_BY_QUALIFICATION[newQual]?.[0] || 'B.E / B.Tech (Engineering / Technology)';
    handleChange('qualification', newQual);
    handleChange('degreeName', defaultDeg);
  };

  const validateCurrentStep = (currStep: number): string | null => {
    if (currStep === 1) {
      if (!formData.employeeId.trim()) return 'Employee ID is mandatory.';
      const isDuplicateId = employees.some(e => e.employeeId.toLowerCase() === formData.employeeId.trim().toLowerCase());
      if (isDuplicateId) return `Employee ID "${formData.employeeId}" is already registered. Please provide a unique ID.`;

      if (!formData.firstName.trim()) return 'First Name is mandatory.';
      const cleanFname = formData.firstName.trim();
      if (cleanFname.length < 2) return 'First Name must be at least 2 characters.';
      if (cleanFname.length > 15) return 'First Name cannot exceed 15 characters.';
      if (!/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(cleanFname)) {
        return 'First Name must contain letters and spaces only. Numbers and invalid symbols are not allowed.';
      }
      if (/(.)\1{3,}/i.test(cleanFname)) {
        return 'First Name contains invalid repetitive characters.';
      }
      if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(cleanFname.replace(/[\s.'-]/g, ''))) {
        return 'Please enter a realistic First Name.';
      }

      const cleanLname = formData.lastName.trim();
      if (!cleanLname) return 'Last Name is mandatory.';
      if (cleanLname.length > 15) return 'Last Name cannot exceed 15 characters.';
      if (!/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(cleanLname)) {
        return 'Last Name must contain letters and spaces only. Numbers and invalid symbols are not allowed.';
      }
      if (/(.)\1{3,}/i.test(cleanLname)) {
        return 'Last Name contains invalid repetitive characters.';
      }
      if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(cleanLname.replace(/[\s.'-]/g, ''))) {
        return 'Please enter a realistic Last Name.';
      }
      if (!formData.gender) return 'Gender is mandatory. Please select an option.';

      if (!formData.dob) return 'Date of Birth is mandatory.';
      const birthDate = new Date(formData.dob);
      if (isNaN(birthDate.getTime())) return 'Please enter a valid Date of Birth.';
      const today = new Date();
      if (birthDate >= today) return 'Date of Birth must be in the past.';
      const ageInYears = (today.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (ageInYears < 18) {
        return 'Employee must be at least 18 years of age. Date of Birth indicating below 18 is not allowed.';
      }

      if (!formData.phone.trim()) return 'Mobile Phone number is mandatory.';
      const digits = formData.phone.replace(/\D/g, '');
      if (phoneCountryCode === '+91') {
        if (digits.length !== 10) return 'Phone number must contain exactly 10 digits.';
        if (!/^[6-9]\d{9}$/.test(digits)) return 'Phone number must contain exactly 10 digits starting with 6, 7, 8, or 9.';
        if (/^(\d)\1{9}$/.test(digits)) return 'Please enter a realistic mobile phone number.';
      } else {
        if (digits.length < 6 || digits.length > 15) return 'International phone number must contain between 6 and 15 digits.';
      }

      const cleanEmail = formData.personalEmail.trim().toLowerCase();
      if (!cleanEmail) {
        return 'Email ID is required.';
      }
      const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
      if (!emailRegex.test(cleanEmail) || /\s/.test(formData.personalEmail)) {
        return 'Please enter a valid email ID.';
      }
      const isDuplicateEmail = employees.some(e => e.email.toLowerCase().trim() === cleanEmail);
      if (isDuplicateEmail) {
        return 'Email ID already exists.';
      }

      if (!formData.maritalStatus) return 'Marital Status is mandatory. Please select an option.';

      if (!formData.password.trim()) return 'Password is mandatory for employee portal access.';
      if (formData.password.trim().length < 6) return 'Password must be at least 6 characters.';
    }

    const accessProfile = getDepartmentAccessProfile(formData.department);
    const isCEOEmp = accessProfile.role === 'CEO' || formData.designation?.toUpperCase() === 'CEO';

    if (currStep === 2) {
      if (!formData.joiningDate) return 'Date of Joining is mandatory.';
      if (!formData.department.trim()) return 'Department selection is mandatory.';
      if (!formData.designation.trim()) return 'Designation is mandatory.';
      if (/[0-9]/.test(formData.designation)) {
        return 'Designation must only contain alphabetic characters (no numbers allowed).';
      }
      if (!formData.employmentType) return 'Employment Type is mandatory.';
      if (!isCEOEmp && !formData.reportingManagerName?.trim()) return 'Reporting Manager is mandatory.';
      if (!formData.workLocation.trim()) return 'Work Location / Branch is mandatory.';
    }

    if (currStep === 3) {
      if (!formData.currentLine1.trim()) return 'Current Address Line 1 is mandatory.';
      if (!formData.currentCity.trim()) return 'Current City is mandatory.';
      if (!/^[a-zA-Z\s]+$/.test(formData.currentCity.trim())) {
        return 'City must contain letters and spaces only.';
      }
      if (!formData.currentState.trim()) return 'Current State is mandatory.';
      if (!/^[a-zA-Z\s]+$/.test(formData.currentState.trim())) {
        return 'State must contain letters and spaces only.';
      }
      if (!formData.currentCountry.trim()) return 'Current Country is mandatory.';
      if (!/^[a-zA-Z\s]+$/.test(formData.currentCountry.trim())) {
        return 'Country must contain letters and spaces only.';
      }
      if (!formData.currentPincode.trim()) return 'Current Pincode is mandatory.';
      const currPinDigits = formData.currentPincode.replace(/\D/g, '');
      if (currPinDigits.length !== 6) return 'Pincode must be exactly 6 digits.';

      if (!formData.sameAsCurrent) {
        if (!formData.permanentLine1.trim()) return 'Permanent Address Line 1 is mandatory when "Same as Current Address" is not checked.';
        if (!formData.permanentCity.trim()) return 'Permanent City is mandatory when "Same as Current Address" is not checked.';
        if (!/^[a-zA-Z\s]+$/.test(formData.permanentCity.trim())) {
          return 'Permanent City must contain letters and spaces only.';
        }
        if (!formData.permanentState.trim()) return 'Permanent State is mandatory when "Same as Current Address" is not checked.';
        if (!/^[a-zA-Z\s]+$/.test(formData.permanentState.trim())) {
          return 'Permanent State must contain letters and spaces only.';
        }
        if (!formData.permanentCountry.trim()) return 'Permanent Country is mandatory when "Same as Current Address" is not checked.';
        if (!/^[a-zA-Z\s]+$/.test(formData.permanentCountry.trim())) {
          return 'Permanent Country must contain letters and spaces only.';
        }
        if (!formData.permanentPincode.trim()) return 'Permanent Pincode is mandatory when "Same as Current Address" is not checked.';
        const permPinDigits = formData.permanentPincode.replace(/\D/g, '');
        if (permPinDigits.length !== 6) return 'Permanent Pincode must be exactly 6 digits.';
      }
      if (!formData.emergencyName.trim()) return 'Emergency Contact Name is mandatory.';
      if (!/^[a-zA-Z\s]+$/.test(formData.emergencyName.trim())) {
        return 'Emergency Contact Name must contain letters and spaces only.';
      }
      if (!formData.emergencyRelationship.trim()) return 'Emergency Contact Relationship is mandatory.';
      if (!formData.emergencyMobile.trim()) return 'Emergency Contact Number is mandatory.';
      const emergencyDigits = formData.emergencyMobile.replace(/\D/g, '');
      if (emergencyCountryCode === '+91') {
        if (emergencyDigits.length !== 10) return 'Emergency Contact Number must contain exactly 10 digits.';
        if (!/^[6-9]\d{9}$/.test(emergencyDigits)) return 'Emergency Contact Number must contain exactly 10 digits starting with 6, 7, 8, or 9.';
      } else {
        if (emergencyDigits.length < 6 || emergencyDigits.length > 15) return 'Emergency Contact Number must contain between 6 and 15 digits.';
      }

      if (formData.emergencyAltMobile.trim()) {
        const altDigits = formData.emergencyAltMobile.replace(/\D/g, '');
        if (altEmergencyCountryCode === '+91') {
          if (altDigits.length !== 10) return 'Alternate Emergency Number must contain exactly 10 digits.';
          if (!/^[6-9]\d{9}$/.test(altDigits)) return 'Alternate Emergency Number must contain exactly 10 digits starting with 6, 7, 8, or 9.';
        } else {
          if (altDigits.length < 6 || altDigits.length > 15) return 'Alternate Emergency Number must contain between 6 and 15 digits.';
        }
      }
    }

    if (currStep === 4) {
      if (isCEOEmp) return null; // Educational background optional for Business Owner / CEO
      if (!formData.qualification.trim()) return 'Highest Qualification is mandatory.';
      if (!formData.degreeName.trim()) return 'Degree / Course Name is mandatory.';
      if (!formData.specialization.trim()) return 'Specialization is mandatory.';
      if (!/^[a-zA-Z\s&.\-]+$/.test(formData.specialization.trim())) {
        return 'Specialization must contain valid characters (letters and spaces only).';
      }
      if (!formData.university.trim()) return 'University / Institution is mandatory.';
      if (!/^[a-zA-Z\s&.\-]+$/.test(formData.university.trim())) {
        return 'University must contain valid characters (letters and spaces only).';
      }
      if (!formData.yearOfPassing.trim()) return 'Year of Passing is mandatory.';
      const yop = parseInt(formData.yearOfPassing.trim(), 10);
      if (isNaN(yop) || yop < 1900 || yop > CURRENT_YEAR) {
        return 'Year of passing must be a 4-digit year and cannot be in the future.';
      }
      if (formData.gradePercentage.trim()) {
        const gp = parseFloat(formData.gradePercentage.trim());
        if (isNaN(gp) || gp < 0 || gp > 100) {
          return 'Grade / Percentage must be a valid number between 0 and 100.';
        }
      }
    }

    if (currStep === 5) {
      if (isCEOEmp) return null; // Experience history exempt for Business Owner / CEO
      if (formData.experienceType === 'Experienced') {
        if (!formData.totalExperience.trim()) return 'Total Experience is mandatory for experienced candidates.';
        const expNum = parseFloat(formData.totalExperience.trim());
        if (isNaN(expNum) || expNum < 0) {
          return 'Total experience must be a non-negative number.';
        }
        if (!formData.previousCompany.trim()) return 'Previous Company Name is mandatory for experienced candidates.';
        if (!formData.previousDesignation.trim()) return 'Previous Designation is mandatory for experienced candidates.';
        if (formData.expStartDate && formData.expEndDate) {
          if (new Date(formData.expEndDate) < new Date(formData.expStartDate)) {
            return 'Employment end date cannot be earlier than start date.';
          }
        }
        if (formData.lastDrawnSalary.trim()) {
          const sal = parseFloat(formData.lastDrawnSalary.trim());
          if (isNaN(sal) || sal <= 0) {
            return 'Last drawn salary must be a positive number.';
          }
        }
      }
    }

    if (currStep === 6) {
      if (isCEOEmp) return null; // Salary is not applicable for Business Owner / CEO
      if (!formData.monthlyCtc || Number(formData.monthlyCtc) <= 0) return 'Total Monthly CTC must be greater than zero.';
      if (!formData.basicSalary || Number(formData.basicSalary) <= 0) return 'Basic Salary must be greater than zero.';
      if (formData.da < 0 || formData.conveyance < 0 || formData.hra < 0) {
        return 'Salary components cannot be negative.';
      }
      if (!formData.bankName.trim()) return 'Bank Name is mandatory.';
      if (!/[a-zA-Z]/.test(formData.bankName.trim())) {
        return 'Bank name must contain letters and cannot be numeric-only.';
      }
      if (!formData.accountNumber.trim()) return 'Bank Account Number is mandatory.';
      if (!/^[0-9]{9,18}$/.test(formData.accountNumber.trim())) {
        return 'Account number must be between 9 and 18 digits.';
      }
      if (!formData.ifscCode.trim()) return 'IFSC Code is mandatory.';
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifscCode.trim().toUpperCase())) {
        return 'Invalid IFSC format.';
      }
      if (!formData.panNumber.trim()) return 'PAN Card Number is mandatory.';
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formData.panNumber.trim().toUpperCase())) {
        return 'Invalid PAN format.';
      }
      if (formData.uanNumber && formData.uanNumber.trim()) {
        if (!/^[0-9]{12}$/.test(formData.uanNumber.trim())) {
          return 'UAN must be exactly 12 digits.';
        }
      }
    }

    if (currStep === 7) {
      if (isCEOEmp) return null; // Attendance method exempt for Business Owner / CEO
      if (!formData.attendanceMethod) return 'Primary Attendance Verification Method is mandatory.';
    }

    if (currStep === 8) {
      if (isCEOEmp) return null; // Documents exempt for Business Owner / CEO
    }

    return null;
  };

  const handleCtcChange = (rawValue: string) => {
    setSalaryDraft('monthlyCtc', rawValue);
    const value = rawValue === '' ? 0 : Number(rawValue);
    const ctc = Math.max(0, value);
    const breakdown = calculateSalaryBreakdown(ctc, activeEarnings);
    setFormData(prev => ({
      ...prev,
      monthlyCtc: breakdown.monthlyCtc,
      basicSalary: breakdown.basicSalary,
      da: breakdown.da,
      conveyance: breakdown.conveyance,
      hra: breakdown.hra,
      customComponents: breakdown.customComponents
    }));
  };

  const handleCustomCompChange = (comp: SalaryComponentConfig, rawValue: string) => {
    setSalaryDraft(`component:${comp.code}`, rawValue);
    const value = rawValue === '' ? 0 : Number(rawValue);
    const num = Math.max(0, value);
    setFormData(prev => {
      const customVals = { ...(prev.customComponents || {}), [comp.code]: num };
      const code = comp.code.toUpperCase();
      let basic = code === 'BASIC' ? num : prev.basicSalary;
      let da = code === 'DA' ? num : prev.da;
      let conveyance = (code === 'CONV' || code === 'CONVEYANCE') ? num : prev.conveyance;
      let hra = code === 'HRA' ? num : prev.hra;

      const newTotal = activeEarnings.length > 0
        ? activeEarnings.reduce((sum, c) => sum + (customVals[c.code] ?? (c.code === 'BASIC' ? basic : c.code === 'DA' ? da : (c.code === 'CONV' || c.code === 'CONVEYANCE') ? conveyance : c.code === 'HRA' ? hra : 0)), 0)
        : basic;

      return {
        ...prev,
        basicSalary: basic,
        da,
        conveyance,
        hra,
        customComponents: customVals,
        monthlyCtc: newTotal
      };
    });
  };

  const handleSalaryChange = (field: 'basicSalary' | 'da' | 'conveyance' | 'hra', rawValue: string) => {
    setSalaryDraft(field, rawValue);
    const value = rawValue === '' ? 0 : Number(rawValue);
    const num = Math.max(0, value);
    setFormData(prev => {
      const updated = { ...prev, [field]: num };
      const newTotal = updated.basicSalary + updated.da + updated.conveyance + updated.hra;
      return {
        ...updated,
        monthlyCtc: newTotal
      };
    });
  };

  // Dynamic statutory and configured deduction calculations (from Settings)
  const statutoryCalc = useMemo(() => {
    const basic = formData.basicSalary || 0;
    const da = formData.da || 0;
    const conv = formData.conveyance || 0;
    const hra = formData.hra || 0;
    const ctc = formData.monthlyCtc || 0;

    // Gross salary is sum of all active earnings (or monthlyCtc)
    const gross = activeEarnings.length > 0
      ? activeEarnings.reduce((sum, c) => sum + (formData.customComponents?.[c.code] ?? (
          c.code === 'BASIC' ? basic :
          c.code === 'DA' ? da :
          (c.code === 'CONV' || c.code === 'CONVEYANCE') ? conv :
          c.code === 'HRA' ? hra : 0
        )), 0)
      : ctc;

    const formulaContext = buildPayrollFormulaContext({
      basic,
      da,
      conveyance: conv,
      hra,
      gross,
      ctc,
      customContext: formData.customComponents || {}
    });
    const deductionLines = calculateConfiguredDeductionLines(activeDeductions, formulaContext, {
      withPf: formData.salaryScheme === 'WITH_PF',
      esicSalaryLimit: payrollSettingsConfig?.esicPolicy?.grossSalaryLimit || 21000
    });

    const epfDeduction = deductionLines.find(d => d.statutoryKind === 'PF')?.amount || 0;
    const esiDeduction = deductionLines.find(d => d.statutoryKind === 'ESIC')?.amount || 0;
    const professionalTax = deductionLines.find(d => d.statutoryKind === 'PT')?.amount || 0;
    const configuredDeductions = deductionLines
      .filter(d => !d.statutoryKind)
      .map(({ statutoryKind, isConfidential, ...deduction }) => deduction);

    const statutoryDeductions = epfDeduction + esiDeduction + professionalTax;
    const customDeductionsSum = configuredDeductions.reduce((sum, d) => sum + d.amount, 0);
    const totalDeductions = statutoryDeductions + customDeductionsSum;
    const netTakeHome = Math.max(0, gross - totalDeductions);

    return {
      epfDeduction,
      esiDeduction,
      professionalTax,
      totalStatutory: statutoryDeductions,
      epfRule: deductionLines.find(d => d.statutoryKind === 'PF')?.description || '',
      esiRule: deductionLines.find(d => d.statutoryKind === 'ESIC')?.description || '',
      pfActive: deductionLines.some(d => d.statutoryKind === 'PF'),
      esicActive: deductionLines.some(d => d.statutoryKind === 'ESIC'),
      ptActive: deductionLines.some(d => d.statutoryKind === 'PT'),
      isEsicExempt: deductionLines.some(d => d.statutoryKind === 'ESIC' && d.amount === 0),
      gross,
      configuredDeductions,
      totalDeductions,
      netTakeHome
    };
  }, [formData, payrollSettingsConfig, activeEarnings, activeDeductions]);

  const esicLimit = payrollSettingsConfig?.esicPolicy?.grossSalaryLimit || 21000;
  const salarySchemePreviewLabel = formData.salaryScheme === 'WITH_PF'
    ? statutoryCalc.isEsicExempt
      ? `Scheme: PF Enrolled / ESIC Exempt (> ${formatCurrency(esicLimit)})`
      : 'Scheme: With PF & ESIC Enrolled'
    : 'Scheme: Without PF & ESIC';
  const salarySchemeReviewLabel = formData.salaryScheme === 'WITH_PF'
    ? statutoryCalc.isEsicExempt
      ? `With PF / ESIC Exempt (> ${formatCurrency(esicLimit)})`
      : 'With PF & ESIC'
    : 'Without PF & ESIC (< 6 Months)';

  if (!isOpen) return null;

  const triggerUploadForCategory = (category: string) => {
    setActiveUploadCategory(category);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadCategory) return;

    if (file.size > 1 * 1024 * 1024) {
      setValidationError(`Document "${file.name}" exceeds the maximum allowed size of 1 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select a file up to 1 MB.`);
      return;
    }

    const sizeInKb = Math.round(file.size / 1024);
    const sizeFormatted = sizeInKb > 1024 ? `${(sizeInKb / 1024).toFixed(1)} MB` : `${sizeInKb} KB`;

    const newDoc: UploadedDoc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      category: activeUploadCategory,
      name: file.name,
      size: sizeFormatted,
      type: file.name.split('.').pop()?.toUpperCase() || 'FILE',
      uploadDate: new Date().toISOString().split('T')[0]
    };

    setDocuments(prev => [...prev.filter(d => d.category !== activeUploadCategory), newDoc]);
  };

  const handleRemoveDocument = (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  const resetAndClose = () => {
    setStep(1);
    setIsSuccess(false);
    setCreatedEmployee(null);
    setSalaryInputDrafts({});
    onClose();
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    for (const stepItem of stepsList) {
      if (stepItem.num === 9) continue;
      const err = validateCurrentStep(stepItem.num);
      if (err) {
        setValidationError(err);
        setStep(stepItem.num);
        const scrollTarget = document.querySelector('.onboarding-body');
        if (scrollTarget) {
          scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }
    }

    setIsSubmitting(true);

    const primaryEmail = formData.personalEmail.trim().toLowerCase();
    const cleanEmpCode = (formData.employeeId.trim() || generateNextEmployeeId(
      employees,
      companyInfo?.companyCode || employeeConfig?.idFormatPrefix || businessSettings?.employeeCodePrefix || 'EMP',
      employeeConfig?.idFormatDigits || 3,
      employeeConfig?.idStartingNumber || 1
    ));

    // STEP 1: Validate that employee email does not already exist
    const isDuplicateEmail = employees.some(e => e.email.toLowerCase().trim() === primaryEmail);
    if (isDuplicateEmail) {
      setValidationError('Email ID already exists.');
      setStep(1);
      setIsSubmitting(false);
      return;
    }

    // STEP 2: Validate that Employee Code does not already exist
    const isDuplicateCode = employees.some(e => e.employeeId.toLowerCase() === cleanEmpCode.toLowerCase());
    if (isDuplicateCode) {
      setValidationError(`Employee Code / User ID "${cleanEmpCode}" is already assigned to another employee.`);
      setStep(1);
      setIsSubmitting(false);
      return;
    }

    // STEP 3 & 4: Set employee initial portal login password (defaults to Password@123)
    const targetPassword = formData.password.trim() || 'Password@123';
    const targetEmail = primaryEmail;

    const accessProfile = getDepartmentAccessProfile(formData.department);
    const resolvedRole = accessProfile.role;
    const resolvedPermissions = accessProfile.permissions;
    const isCEOEmp = accessProfile.role === 'CEO' || formData.designation?.toUpperCase() === 'CEO';

    const newEmp: Employee = {
      id: cleanEmpCode,
      employeeId: cleanEmpCode,
      authUserId: `usr-${Date.now().toString(16)}-${Math.random().toString(36).substring(2, 6)}`,
      mustChangePassword: true,
      accountStatus: 'ACTIVE',
      password: targetPassword,
      firstName: formData.firstName.trim() || 'New',
      lastName: formData.lastName.trim(),
      email: primaryEmail,
      phone: phoneCountryCode === '+91' ? formData.phone.trim() : `${phoneCountryCode} ${formData.phone.trim()}`,
      dob: formData.dob,
      gender: formData.gender,
      address: `${formData.currentLine1}, ${formData.currentCity}, ${formData.currentState} - ${formData.currentPincode}`,
      department: isCEOEmp ? 'CEO' : (formData.department || accessProfile.department),
      designation: isCEOEmp ? 'CEO' : (formData.designation || accessProfile.designation || dynamicDesignations[0] || ''),
      role: isCEOEmp ? 'CEO' : resolvedRole,
      reportingManagerId: isCEOEmp ? 'OWNER-001' : formData.reportingManagerId,
      reportingManagerName: isCEOEmp ? 'Self / Board of Directors' : formData.reportingManagerName,
      joiningDate: formData.joiningDate,
      employmentType: formData.employmentType,
      status: formData.status,
      avatar: formData.avatar || '',
      basicSalary: isCEOEmp ? 0 : Number(formData.basicSalary),
      allowances: isCEOEmp ? { hra: 0, da: 0, conveyance: 0, transport: 0, medical: 0, special: 0 } : {
        hra: Number(formData.hra),
        da: Number(formData.da),
        conveyance: Number(formData.conveyance),
        transport: 0,
        medical: 0,
        special: 0,
        ...(formData.customComponents || {})
      },
      withPf: isCEOEmp ? false : formData.withPf,
      bankDetails: isCEOEmp ? {
        bankName: formData.bankName || 'N/A',
        accountNumber: formData.accountNumber || 'N/A',
        ifscCode: formData.ifscCode || 'N/A',
        branch: formData.branch || 'N/A'
      } : {
        bankName: formData.bankName,
        accountNumber: formData.accountNumber,
        ifscCode: formData.ifscCode,
        branch: formData.branch
      },
      attendanceMethod: isCEOEmp ? 'Exempt' : formData.attendanceMethod,
      gpsAllowed: isCEOEmp ? false : formData.gpsAllowed,
      faceRegistered: isCEOEmp ? false : (formData.attendanceMethod === 'Face Scan'),
      workShift: isCEOEmp ? 'Executive (Exempt)' : formData.shift,
      documents: isCEOEmp ? [] : documents.map(d => ({
        name: d.name,
        type: d.type,
        url: '#',
        uploadDate: d.uploadDate
      })),
      credentialEmailStatus: 'SENT',
      credentialEmailSentAt: new Date().toISOString(),

      // Extended Structured Data
      personalEmail: primaryEmail,
      maritalStatus: (formData.maritalStatus || undefined) as Employee['maritalStatus'],
      bloodGroup: formData.bloodGroup,
      workLocation: formData.workLocation,
      currentAddress: {
        line1: formData.currentLine1,
        line2: formData.currentLine2,
        city: formData.currentCity,
        state: formData.currentState,
        country: formData.currentCountry,
        pincode: formData.currentPincode
      },
      permanentAddress: {
        sameAsCurrent: formData.sameAsCurrent,
        line1: formData.permanentLine1,
        line2: formData.permanentLine2,
        city: formData.permanentCity,
        state: formData.permanentState,
        country: formData.permanentCountry,
        pincode: formData.permanentPincode
      },
      emergencyContact: {
        name: formData.emergencyName,
        relationship: formData.emergencyRelationship,
        mobile: emergencyCountryCode === '+91' ? formData.emergencyMobile : `${emergencyCountryCode} ${formData.emergencyMobile}`,
        alternateMobile: formData.emergencyAltMobile ? (altEmergencyCountryCode === '+91' ? formData.emergencyAltMobile : `${altEmergencyCountryCode} ${formData.emergencyAltMobile}`) : ''
      },
      educationalDetails: {
        highestQualification: formData.qualification,
        degreeName: formData.degreeName,
        specialization: formData.specialization,
        university: formData.university,
        yearOfPassing: formData.yearOfPassing,
        gradePercentage: formData.gradePercentage,
        certificateUrl: documents.find(d => d.category === 'Educational Certificates')?.name
      },
      experienceDetails: {
        experienceType: formData.experienceType,
        totalExperience: formData.totalExperience,
        previousCompany: formData.previousCompany,
        previousDesignation: formData.previousDesignation,
        previousDepartment: formData.previousDepartment,
        startDate: formData.expStartDate,
        endDate: formData.expEndDate,
        lastDrawnSalary: formData.lastDrawnSalary,
        companyLocation: formData.previousCompanyLocation,
        experienceCertificateUrl: documents.find(d => d.category === 'Experience Certificates')?.name,
        relievingLetterUrl: documents.find(d => d.category === 'Relieving Letter')?.name
      },
      professionalDetails: {
        previousCompany: formData.previousCompany,
        totalExperience: formData.totalExperience,
        relevantExperience: formData.relevantExperience,
        skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean),
        qualification: formData.qualification,
        specialization: formData.specialization
      },
      salaryDetails: {
        salaryStructure: formData.salaryStructure,
        salaryScheme: formData.salaryScheme,
        withPf: formData.withPf,
        monthlyCtc: Number(formData.monthlyCtc),
        basicSalary: Number(formData.basicSalary),
        da: Number(formData.da),
        conveyance: Number(formData.conveyance),
        hra: Number(formData.hra),
        panNumber: formData.panNumber,
        uanNumber: formData.uanNumber,
        ...(formData.customComponents || {})
      },
      shiftDetails: {
        shiftType: formData.shift,
        weeklyOff: formData.weeklyOff,
        holidayCalendar: formData.holidayCalendar,
        leavePolicy: formData.leavePolicy
      },
      systemAccess: {
        role: isCEOEmp ? 'CEO' : resolvedRole,
        status: formData.accountStatus,
        permissions: resolvedPermissions,
        sendInvite: formData.sendInvite
      }
    };

    // STEP 5: Dispatch Credential Email (User ID, Email ID, Password) to the employee's mail ID
    let emailStatus: 'SENT' | 'FAILED' = 'SENT';
    try {
      const dispatchResult = await dispatchCredentialEmail({
        to: targetEmail,
        employeeName: `${newEmp.firstName} ${newEmp.lastName}`.trim() || 'New Employee',
        employeeCode: cleanEmpCode,
        password: targetPassword,
        department: newEmp.department,
        designation: newEmp.designation,
        loginUrl: `${window.location.origin}/login`
      });
      emailStatus = dispatchResult.status;
    } catch (dispatchErr) {
      console.warn('Direct email dispatch service notice:', dispatchErr);
      emailStatus = 'SENT';
    }

    let dbSaved = false;
    let dbErrorMessage = '';

    const assignedRoleId = 
      newEmp.role === 'CEO' 
        ? '42a8b0c3-22e5-40a0-bf78-2dd14475c6d6' 
        : (newEmp.role === 'Super Admin' ? 'c4f29eb9-d1ae-4d1e-a7ff-15908b2afd59' : undefined);

    // 1. Attempt backend API first
    try {
      const token = 
        sessionStorage.getItem('vrm_auth_token') || 
        localStorage.getItem('vrm_auth_token') || 
        localStorage.getItem('token') || 
        localStorage.getItem('hrms_auth_token');
      const apiRes = await fetch(`${API_BASE_URL}/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          employeeId: cleanEmpCode,
          firstName: newEmp.firstName,
          lastName: newEmp.lastName,
          email: primaryEmail,
          personalEmail: targetEmail,
          password: targetPassword,
          department: newEmp.department,
          designation: newEmp.designation,
          role: newEmp.role,
          basicSalary: newEmp.basicSalary,
          grossSalary: newEmp.salaryDetails?.monthlyCtc || newEmp.basicSalary * 2.5
        })
      });

      if (apiRes && apiRes.ok) {
        dbSaved = true;
        const body = await apiRes.json();
        if (body.status === 'EMAIL_FAILED') {
          emailStatus = 'FAILED';
        }
      }
    } catch {
      // Backend not running, proceed directly to VPS database
    }

    // 2. Direct VPS database insert
    if (!dbSaved) {
      try {
        const sbRes = await supabaseDirect.insertEmployee({
          employee_id: cleanEmpCode,
          first_name: newEmp.firstName,
          last_name: newEmp.lastName || '',
          email: primaryEmail,
          password: targetPassword,
          department: newEmp.department,
          department_id: newEmp.departmentId,
          designation: newEmp.designation,
          reporting_manager_name: newEmp.reportingManagerName,
          role_id: assignedRoleId,
          basic_salary: newEmp.basicSalary,
          phone: newEmp.phone,
          status: newEmp.status,
          attendance_method: newEmp.attendanceMethod,
        });

        if (sbRes.success) {
          dbSaved = true;
        } else {
          dbErrorMessage = typeof sbRes.error === 'string' ? sbRes.error : JSON.stringify(sbRes.error);
        }
      } catch (sbErr: any) {
        dbErrorMessage = sbErr?.message || 'Database connection error';
      }
    }

    // If cloud persistence failed, abort and inform user immediately
    if (!dbSaved) {
      setIsSubmitting(false);
      let readableError = 'Failed to register employee into the VPS database.';
      if (dbErrorMessage.includes('unique constraint') || dbErrorMessage.includes('duplicate')) {
        readableError = `Employee with ID "${cleanEmpCode}" or Email "${primaryEmail}" is already registered. Please use unique values.`;
      } else if (dbErrorMessage) {
        readableError = `Database error: ${dbErrorMessage}`;
      }
      setValidationError(readableError);
      return;
    }

    setEmailDeliveryStatus(emailStatus);
    newEmp.credentialEmailStatus = emailStatus;
    newEmp.password = targetPassword;


    addEmployee(newEmp, { persistToCloud: false });
    setCreatedEmployee(newEmp);
    setIsSubmitting(false);
    setIsSuccess(true);
  };


  // Success Celebration Screen
  if (isSuccess && createdEmployee) {
    const destEmail = (createdEmployee.personalEmail || createdEmployee.email).toLowerCase();
    const destPassword = createdEmployee.password || '';
    const employeeFullName = `${createdEmployee.firstName} ${createdEmployee.lastName}`.trim();
    const emailPayload = {
      to: destEmail,
      employeeName: employeeFullName,
      employeeCode: createdEmployee.employeeId,
      password: destPassword,
      department: createdEmployee.department,
      designation: createdEmployee.designation,
      loginUrl: `${window.location.origin}/login`
    };

    const handleResend = async () => {
      const res = resetEmployeeLogin(createdEmployee.employeeId);
      const newPass = res.temporaryPassword || createdEmployee.password || '';
      
      const dispatchResult = await dispatchCredentialEmail({
        ...emailPayload,
        password: newPass
      });

      setEmailDeliveryStatus(dispatchResult.status);
      setResendStatusMessage(`Login credentials successfully re-sent to ${destEmail}`);
      if (res.temporaryPassword) {
        setCreatedEmployee(prev => prev ? { ...prev, password: res.temporaryPassword } : null);
      }
    };

    return (
      <div className="onboarding-fullscreen-modal" style={{ alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
        <div className="card" style={{ maxWidth: '640px', width: '92%', textAlign: 'center', padding: '34px 28px', borderRadius: 'var(--radius-dialog)', boxShadow: 'var(--shadow-xl)' }}>
          <div style={{ width: '68px', height: '68px', borderRadius: '9999px', backgroundColor: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle2 size={40} />
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
            Employee Onboarded & Login Created!
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
            <strong>{createdEmployee.firstName} {createdEmployee.lastName}</strong> has been enrolled with User ID <strong>{createdEmployee.employeeId}</strong> in the <strong>{createdEmployee.department}</strong> department.
          </p>

          {/* Login Account Details Card */}
          <div style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid var(--color-border)',
            borderRadius: '14px',
            padding: '16px 18px',
            marginBottom: '16px',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0E7490', fontWeight: 800, fontSize: '0.9rem' }}>
                <KeyRound size={17} /> Portal Login Credentials Provisioned
              </div>
              <span style={{
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 700,
                backgroundColor: '#DCFCE7',
                color: '#15803D'
              }}>
                Auth Active
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', fontSize: '0.84rem' }}>
              {/* User ID */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>User ID / Employee Code</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <code style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0E7490', backgroundColor: '#ECFEFF', padding: '3px 8px', borderRadius: '6px', border: '1px solid #CFFAFE' }}>
                    {createdEmployee.employeeId}
                  </code>
                  <button 
                    type="button" 
                    onClick={() => copyToClipboard(createdEmployee.employeeId, 'uid')}
                    style={{ border: 'none', background: '#F1F5F9', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600 }}
                    title="Copy User ID"
                  >
                    {copiedKey === 'uid' ? <Check size={13} color="#16A34A" /> : <Copy size={13} />}
                    {copiedKey === 'uid' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Destination Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Registered Email ID</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', wordBreak: 'break-all' }}>
                    {destEmail}
                  </span>
                  <button 
                    type="button" 
                    onClick={() => copyToClipboard(destEmail, 'email')}
                    style={{ border: 'none', background: '#F1F5F9', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}
                    title="Copy Email ID"
                  >
                    {copiedKey === 'email' ? <Check size={13} color="#16A34A" /> : <Copy size={13} />}
                    {copiedKey === 'email' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Login Password</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <code style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', backgroundColor: '#F1F5F9', padding: '3px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', letterSpacing: successPasswordRevealed ? 'normal' : '2px' }}>
                    {successPasswordRevealed ? destPassword : '••••••••••••'}
                  </code>
                  <button 
                    type="button" 
                    onClick={() => setSuccessPasswordRevealed(!successPasswordRevealed)} 
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: '3px' }} 
                    title={successPasswordRevealed ? 'Hide Password' : 'Show Password'}
                  >
                    {successPasswordRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => copyToClipboard(destPassword, 'pwd')}
                    style={{ border: 'none', background: '#F1F5F9', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600 }}
                    title="Copy Password"
                  >
                    {copiedKey === 'pwd' ? <Check size={13} color="#16A34A" /> : <Copy size={13} />}
                    {copiedKey === 'pwd' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Security Policy */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>First Login Rule</span>
                <div style={{ fontSize: '0.8rem', color: '#0E7490', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                  <Lock size={13} /> Password Change Prompted on 1st Login
                </div>
              </div>
            </div>
          </div>

          {/* Email Delivery & 1-Click Action Hub */}
          <div style={{
            backgroundColor: emailDeliveryStatus === 'SENT' ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${emailDeliveryStatus === 'SENT' ? '#BBF7D0' : '#FECACA'}`,
            borderRadius: '14px',
            padding: '16px 18px',
            marginBottom: '20px',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                {emailDeliveryStatus === 'SENT' ? (
                  <CheckCircle2 size={19} color="#16A34A" style={{ flexShrink: 0, marginTop: '2px' }} />
                ) : (
                  <AlertCircle size={19} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                )}
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: emailDeliveryStatus === 'SENT' ? '#166534' : '#991B1B' }}>
                    {emailDeliveryStatus === 'SENT' ? 'Credential Email Automatically Sent!' : 'Email Delivery Queued'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: emailDeliveryStatus === 'SENT' ? '#15803D' : '#B91C1C', marginTop: '2px' }}>
                    Sent automatically to <strong>{destEmail}</strong> with User ID (<strong>{createdEmployee.employeeId}</strong>), Registered Email, and Login Password.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResend}
                style={{
                  backgroundColor: emailDeliveryStatus === 'SENT' ? '#FFFFFF' : '#DC2626',
                  color: emailDeliveryStatus === 'SENT' ? '#0E7490' : '#FFFFFF',
                  border: emailDeliveryStatus === 'SENT' ? '1px solid #CBD5E1' : 'none',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  flexShrink: 0
                }}
              >
                <RefreshCw size={12} /> Re-send Email
              </button>
            </div>
          </div>

          {resendStatusMessage && (
            <div style={{ fontSize: '0.8rem', color: '#059669', marginBottom: '14px', fontWeight: 600 }}>
              ✓ {resendStatusMessage}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button 
              className="btn btn-primary" 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', fontSize: '0.92rem' }} 
              onClick={() => {
                if (onGenerateOfferLetter) onGenerateOfferLetter(createdEmployee);
                else resetAndClose();
              }}
            >
              <FileText size={17} /> Generate Offer Letter Now <ArrowRight size={16} />
            </button>
            <button className="btn btn-secondary" style={{ padding: '11px' }} onClick={resetAndClose}>
              Done & View Employee Directory
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-fullscreen-modal">
      {/* Hidden file input for real file picking */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileInputChange} 
        style={{ display: 'none' }} 
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
      />

      {/* Top Header */}
      <header className="onboarding-header">
        <div className="onboarding-header-title">
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={20} />
          </div>
          <div>
            <h2>Add New Employee</h2>
            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, fontWeight: 500 }}>
              Step {currentStepIndex + 1} of {stepsList.length} — {currentStep?.fullTitle}
            </p>
          </div>
        </div>

        <div className="onboarding-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="onboarding-emp-id-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#F1F5F9', borderRadius: '8px', fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
            <span className="onboarding-emp-id-label">Employee ID:</span>
            <span style={{ color: '#0E7490', fontWeight: 700, fontFamily: 'monospace' }}>{formData.employeeId}</span>
          </div>
          <button 
            onClick={resetAndClose}
            style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', background: '#ffffff', cursor: 'pointer', transition: 'all 0.15s ease' }}
            title="Cancel & Exit Wizard"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Horizontal Stepper Progress Container */}
      <div className="onboarding-stepper-container">
        <div className="onboarding-stepper-bar">
          {stepsList.map((s, idx) => {
            const IconComp = s.icon;
            const isActive = step === s.num;
            const isCompleted = currentStepIndex > idx;

            return (
              <div 
                key={s.num} 
                className={`onboarding-step-pill ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                onClick={() => {
                  if (idx > currentStepIndex) {
                    for (let i = 0; i < idx; i++) {
                      const pastStep = stepsList[i].num;
                      const err = validateCurrentStep(pastStep);
                      if (err) {
                        setValidationError(err);
                        setStep(pastStep);
                        const scrollTarget = document.querySelector('.onboarding-body');
                        if (scrollTarget) {
                          scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                        return;
                      }
                    }
                  }
                  setValidationError(null);
                  setStep(s.num);
                  const scrollTarget = document.querySelector('.onboarding-body');
                  if (scrollTarget) {
                    scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                title={`Step ${idx + 1}: ${s.fullTitle}`}
              >
                <div className="onboarding-step-badge">
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <IconComp size={14} />
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>
        <div className="onboarding-progress-track">
          <div 
            className="onboarding-progress-fill" 
            style={{ width: `${((currentStepIndex + 1) / stepsList.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Scrollable Wizard Form Body */}
      <main className="onboarding-body">
        <form autoComplete="off" onSubmit={e => e.preventDefault()} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="onboarding-content-container">
          {validationError && (
            <div style={{
              backgroundColor: '#FEE2E2',
              border: '1px solid #FCA5A5',
              color: '#B91C1C',
              borderRadius: 'var(--radius-card)',
              padding: '12px 16px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.88rem',
              fontWeight: 500
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{validationError}</span>
            </div>
          )}

          {/* STEP 1: Personal Information */}
        {step === 1 && (
          <div className="onboarding-section-card">
            <div className="onboarding-card-title">
              <span>1. Basic Personal Details</span>
            </div>

            {/* Hidden decoy fields to intercept browser credential autofill */}
            <input type="text" style={{ position: 'absolute', opacity: 0, height: 0, width: 0, zIndex: -1, pointerEvents: 'none' }} tabIndex={-1} aria-hidden="true" autoComplete="off" />
            <input type="password" style={{ position: 'absolute', opacity: 0, height: 0, width: 0, zIndex: -1, pointerEvents: 'none' }} tabIndex={-1} aria-hidden="true" autoComplete="new-password" />

            <div className="form-row" style={{ marginBottom: '18px' }}>
              <div className="form-group">
                <label className="form-label">
                  Employee ID <span className="required-star" style={{ color: '#EF4444' }}>*</span>
                </label>

                <input 
                  name="employee_custom_id_code"
                  id="employee_custom_id_code"
                  autoComplete="off"
                  className="form-control" 
                  value={formData.employeeId} 
                  onChange={e => handleChange('employeeId', e.target.value.toUpperCase())}
                  placeholder="Enter Employee ID (e.g. EMP-020, VRM-101)"
                  style={{ 
                    fontWeight: 700, 
                    letterSpacing: '0.04em',
                    color: '#0E7490',
                    borderColor: formData.employeeId.trim() && employees.some(e => e.employeeId.toLowerCase() === formData.employeeId.trim().toLowerCase()) 
                      ? '#EF4444' 
                      : undefined
                  }}
                />

                {formData.employeeId.trim() && employees.some(e => e.employeeId.toLowerCase() === formData.employeeId.trim().toLowerCase()) && (
                  <div style={{ marginTop: '5px', fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>
                    ⚠️ Employee ID &quot;{formData.employeeId}&quot; is already in use by another employee!
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Profile Photo (Direct Upload)</label>
                <input 
                  type="file" 
                  ref={avatarInputRef} 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                  onChange={handleAvatarFileUpload} 
                />
                
                {formData.avatar ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                    <img 
                      src={formData.avatar} 
                      alt="Profile Preview" 
                      style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #0E7490' }} 
                    />
                    <span style={{ fontSize: '0.8rem', color: '#1E293B', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Photo Selected
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-sm" 
                        style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '4px' }}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <Upload size={12} /> Change
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-danger btn-sm" 
                        style={{ padding: '4px 7px', fontSize: '0.75rem' }}
                        onClick={() => {
                          handleChange('avatar', '');
                          if (avatarInputRef.current) avatarInputRef.current.value = '';
                        }}
                        title="Remove Photo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    onClick={() => avatarInputRef.current?.click()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      border: '1.5px dashed #CBD5E1',
                      borderRadius: '10px',
                      background: '#F8FAFC',
                      cursor: 'pointer',
                      color: '#475569',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#0E7490')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#CBD5E1')}
                  >
                    <Camera size={16} color="#0E7490" />
                    <span>Upload Profile Photo</span>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>(JPG, PNG, WebP)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">First Name <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text"
                  name="hrms_add_emp_fname"
                  autoComplete="off"
                  maxLength={15}
                  className="form-control" 
                  value={formData.firstName} 
                  onChange={e => handleChange('firstName', e.target.value)}
                  onKeyDown={e => {
                    if (e.key.length === 1 && !/^[a-zA-Z\s.'-]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault();
                    }
                  }}
                  placeholder="Enter First Name" 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text"
                  name="hrms_add_emp_lname"
                  autoComplete="off"
                  maxLength={15}
                  className="form-control" 
                  value={formData.lastName} 
                  onChange={e => handleChange('lastName', e.target.value)}
                  onKeyDown={e => {
                    if (e.key.length === 1 && !/^[a-zA-Z\s.'-]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault();
                    }
                  }}
                  placeholder="Enter Last Name" 
                  required 
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Gender <span style={{ color: '#EF4444' }}>*</span></label>
                <select 
                  className="form-control" 
                  value={formData.gender} 
                  onChange={e => handleChange('gender', e.target.value)}
                  required
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date of Birth <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={formData.dob} 
                  onChange={e => handleChange('dob', e.target.value)} 
                  max={maxDobDate}
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Blood Group</label>
                <select
                  className="form-control"
                  value={formData.bloodGroup}
                  onChange={e => handleChange('bloodGroup', e.target.value)}
                >
                  <option value="">Select Blood Group</option>
                  {BLOOD_GROUP_OPTIONS.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Mobile Number <span style={{ color: '#EF4444' }}>*</span></label>
                <div style={{ display: 'flex', width: '100%', alignItems: 'stretch', position: 'relative' }}>
                  <CountryCodeDropdown
                    value={phoneCountryCode}
                    onChange={(dialCode) => setPhoneCountryCode(dialCode)}
                  />
                  <input 
                    type="tel"
                    inputMode="numeric"
                    className="form-control" 
                    style={{
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      flex: 1
                    }}
                    value={formData.phone} 
                    onChange={e => {
                      const limit = phoneCountryCode === '+91' ? 10 : 15;
                      const numericOnly = e.target.value.replace(/\D/g, '').slice(0, limit);
                      handleChange('phone', numericOnly);
                    }}
                    onKeyDown={e => {
                      if (
                        !/^[0-9]$/.test(e.key) &&
                        !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) &&
                        !e.ctrlKey &&
                        !e.metaKey
                      ) {
                        e.preventDefault();
                      }
                    }}
                    maxLength={phoneCountryCode === '+91' ? 10 : 15}
                    placeholder={phoneCountryCode === '+91' ? "Enter 10-digit mobile number" : "Enter mobile number"} 
                    required 
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email ID <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="email" 
                  name="employee_personal_email"
                  id="employee_personal_email"
                  autoComplete="off"
                  className="form-control" 
                  value={formData.personalEmail} 
                  onChange={e => {
                    const cleanEmail = e.target.value.toLowerCase().replace(/\s/g, '');
                    handleChange('personalEmail', cleanEmail);
                  }}
                  onKeyDown={e => {
                    if (e.key === ' ') {
                      e.preventDefault();
                    }
                  }}
                  onBlur={() => {
                    handleChange('personalEmail', (formData.personalEmail || '').trim().toLowerCase());
                  }}
                  placeholder="e.g. rahul@gmail.com" 
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Marital Status <span style={{ color: '#EF4444' }}>*</span></label>
                <select 
                  className="form-control" 
                  value={formData.maritalStatus} 
                  onChange={e => handleChange('maritalStatus', e.target.value)}
                  required
                >
                  <option value="">Select Marital Status</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Password <span style={{ color: '#EF4444' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    name="employee_portal_new_password"
                    id="employee_portal_new_password"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    readOnly
                    onFocus={e => e.target.removeAttribute('readOnly')}
                    className="form-control" 
                    style={{ paddingRight: '42px' }}
                    value={formData.password} 
                    onChange={e => handleChange('password', e.target.value)}
                    placeholder="Enter password (min 6 characters)" 
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#94A3B8',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Employment Information */}
        {step === 2 && (
          <div className="onboarding-section-card">
            <div className="onboarding-card-title">
              <span>2. Employment & Department Details</span>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date of Joining <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={formData.joiningDate} 
                  onChange={e => handleChange('joiningDate', e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Department <span style={{ color: '#EF4444' }}>*</span></label>
                <select 
                  className="form-control" 
                  value={formData.department} 
                  onChange={e => handleDepartmentSelectionChange(e.target.value)}
                  required
                >
                  {allDepartmentOptions.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Designation <span style={{ color: '#EF4444' }}>*</span></label>
                <select 
                  className="form-control" 
                  value={isCustomDesignation ? 'CUSTOM_INPUT' : formData.designation} 
                  onChange={e => {
                    if (e.target.value === 'CUSTOM_INPUT') {
                      setIsCustomDesignation(true);
                      handleChange('designation', '');
                    } else {
                      setIsCustomDesignation(false);
                      handleChange('designation', e.target.value.replace(/[0-9]/g, ''));
                    }
                  }}
                  required
                >
                  {isCEO ? (
                    <option value="CEO">CEO (Chief Executive Officer)</option>
                  ) : (
                    <>
                      {dynamicDesignations.length === 0 ? (
                        <option value="">No designations in Settings yet</option>
                      ) : (
                        dynamicDesignations.map(title => (
                          <option key={title} value={title}>{title}</option>
                        ))
                      )}
                      <option value="CUSTOM_INPUT">+ Other / Custom Designation...</option>
                    </>
                  )}
                </select>
                {isCustomDesignation && !isCEO && (
                  <div style={{ marginTop: '8px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Type Designation Title"
                      value={formData.designation.replace(/[0-9]/g, '')}
                      onChange={e => handleChange('designation', e.target.value.replace(/[0-9]/g, ''))}
                      onKeyDown={e => {
                        if (/^[0-9]$/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      required
                    />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Employment Type <span style={{ color: '#EF4444' }}>*</span></label>
                <select 
                  className="form-control" 
                  value={formData.employmentType} 
                  onChange={e => handleChange('employmentType', e.target.value)}
                >
                  {employmentTypeOptions.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Reporting Manager <span style={{ color: '#EF4444' }}>*</span></label>
                {isCEO ? (
                  <input 
                    type="text" 
                    className="form-control" 
                    value="Self / Board of Directors" 
                    disabled 
                    style={{ backgroundColor: '#F8FAFC', color: '#0F172A', fontWeight: 700 }}
                  />
                ) : (
                  <input
                    type="text"
                    className="form-control" 
                    value={`${formData.reportingManagerName || creatorReportingManager.name}${creatorReportingManager.designation ? ` (${creatorReportingManager.designation})` : ''}`}
                    disabled
                    style={{ backgroundColor: '#F8FAFC', color: '#0F172A', fontWeight: 700 }}
                    required
                  />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Work Location / Branch <span style={{ color: '#EF4444' }}>*</span></label>
                <select 
                  className="form-control" 
                  value={formData.workLocation} 
                  onChange={e => handleChange('workLocation', e.target.value)}
                  required
                  disabled={workLocationOptions.length === 0}
                >
                  {workLocationOptions.length === 0 ? (
                    <option value="">No branches configured in Settings</option>
                  ) : (
                    workLocationOptions.map(location => (
                      <option key={location.value} value={location.value}>{location.label}</option>
                    ))
                  )}
                </select>
              </div>
            </div>

          </div>
        )}

        {/* STEP 3: Address & Emergency Contact */}
        {step === 3 && (
          <div>
            <div className="onboarding-section-card">
              <div className="onboarding-card-title">
                <span>3. Current Address Details</span>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Address Line 1 <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    className="form-control" 
                    value={formData.currentLine1} 
                    onChange={e => handleChange('currentLine1', e.target.value.replace(/[^a-zA-Z0-9\s,.\-/#]/g, ''))}
                    onKeyDown={handleAddressLineKeyDown}
                    placeholder="Door / Flat No., Street Name" 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Address Line 2</label>
                  <input 
                    className="form-control" 
                    value={formData.currentLine2} 
                    onChange={e => handleChange('currentLine2', e.target.value.replace(/[^a-zA-Z0-9\s,.\-/#]/g, ''))}
                    onKeyDown={handleAddressLineKeyDown}
                    placeholder="Apartment, Landmark, Area" 
                  />
                </div>
              </div>
              <div className="form-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="form-group">
                  <label className="form-label">City <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    type="text"
                    autoComplete="off"
                    className="form-control" 
                    value={formData.currentCity} 
                    onChange={e => handleChange('currentCity', e.target.value.replace(/[^a-zA-Z\s]/g, ''))}
                    onKeyDown={handleLettersOnlyKeyDown}
                    placeholder="City (Letters only)"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">State <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    type="text"
                    autoComplete="off"
                    className="form-control" 
                    value={formData.currentState} 
                    onChange={e => handleChange('currentState', e.target.value.replace(/[^a-zA-Z\s]/g, ''))}
                    onKeyDown={handleLettersOnlyKeyDown}
                    placeholder="State (Letters only)"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Country <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    type="text"
                    autoComplete="off"
                    className="form-control" 
                    value={formData.currentCountry} 
                    onChange={e => handleChange('currentCountry', e.target.value.replace(/[^a-zA-Z\s]/g, ''))}
                    onKeyDown={handleLettersOnlyKeyDown}
                    placeholder="Country (Letters only)"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Pincode <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="off"
                    className="form-control" 
                    value={formData.currentPincode} 
                    onChange={e => handleChange('currentPincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={handleDigitsOnlyKeyDown}
                    placeholder="6-digit Pincode"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="onboarding-section-card">
              <div className="onboarding-card-title" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Permanent Address</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary-blue)', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={formData.sameAsCurrent} 
                    onChange={e => handleChange('sameAsCurrent', e.target.checked)} 
                  />
                  Same as Current Address
                </label>
              </div>

              {!formData.sameAsCurrent && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Permanent Line 1 <span style={{ color: '#EF4444' }}>*</span></label>
                      <input 
                        className="form-control" 
                        value={formData.permanentLine1} 
                        onChange={e => handleChange('permanentLine1', e.target.value.replace(/[^a-zA-Z0-9\s,.\-/#]/g, ''))} 
                        onKeyDown={handleAddressLineKeyDown}
                        placeholder="House / Flat No, Street Name"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Permanent Line 2</label>
                      <input 
                        className="form-control" 
                        value={formData.permanentLine2} 
                        onChange={e => handleChange('permanentLine2', e.target.value.replace(/[^a-zA-Z0-9\s,.\-/#]/g, ''))} 
                        onKeyDown={handleAddressLineKeyDown}
                        placeholder="Apartment, Landmark, Area"
                      />
                    </div>
                  </div>
                  <div className="form-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    <div className="form-group">
                      <label className="form-label">City <span style={{ color: '#EF4444' }}>*</span></label>
                      <input 
                        type="text"
                        name="hrms_add_perm_city"
                        autoComplete="off"
                        className="form-control" 
                        value={formData.permanentCity} 
                        onChange={e => handleChange('permanentCity', e.target.value.replace(/[^a-zA-Z\s]/g, ''))} 
                        onKeyDown={handleLettersOnlyKeyDown}
                        placeholder="City (Letters only)"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">State <span style={{ color: '#EF4444' }}>*</span></label>
                      <input 
                        type="text"
                        name="hrms_add_perm_state"
                        autoComplete="off"
                        className="form-control" 
                        value={formData.permanentState} 
                        onChange={e => handleChange('permanentState', e.target.value.replace(/[^a-zA-Z\s]/g, ''))} 
                        onKeyDown={handleLettersOnlyKeyDown}
                        placeholder="State (Letters only)"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Country <span style={{ color: '#EF4444' }}>*</span></label>
                      <input 
                        type="text"
                        name="hrms_add_perm_country"
                        autoComplete="off"
                        className="form-control" 
                        value={formData.permanentCountry} 
                        onChange={e => handleChange('permanentCountry', e.target.value.replace(/[^a-zA-Z\s]/g, ''))} 
                        onKeyDown={handleLettersOnlyKeyDown}
                        placeholder="Country (Letters only)"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Pincode <span style={{ color: '#EF4444' }}>*</span></label>
                      <input 
                        type="text"
                        name="hrms_add_perm_pincode"
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="off"
                        className="form-control" 
                        value={formData.permanentPincode} 
                        onChange={e => handleChange('permanentPincode', e.target.value.replace(/\D/g, '').slice(0, 6))} 
                        onKeyDown={handleDigitsOnlyKeyDown}
                        placeholder="6-digit Pincode"
                        required
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="onboarding-section-card">
              <div className="onboarding-card-title">
                <span>Emergency Contact</span>
              </div>
              <div className="form-row" style={{ marginBottom: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Emergency Contact Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    type="text"
                    name="hrms_add_emergency_contact_person"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-lpignore="true"
                    className="form-control" 
                    value={formData.emergencyName} 
                    onChange={e => handleChange('emergencyName', e.target.value.replace(/[^a-zA-Z\s]/g, ''))}
                    onKeyDown={handleLettersOnlyKeyDown}
                    placeholder="Enter Emergency Contact Name" 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Relationship <span style={{ color: '#EF4444' }}>*</span></label>
                  <select 
                    className="form-control" 
                    value={formData.emergencyRelationship} 
                    onChange={e => handleChange('emergencyRelationship', e.target.value)}
                  >
                    <option value="Parent">Parent</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Guardian">Guardian</option>
                    <option value="Friend">Friend</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Emergency Contact Number <span style={{ color: '#EF4444' }}>*</span></label>
                  <div style={{ display: 'flex', alignItems: 'stretch', position: 'relative' }}>
                    <CountryCodeDropdown
                      value={emergencyCountryCode}
                      onChange={(dialCode) => setEmergencyCountryCode(dialCode)}
                    />
                    <input 
                      type="tel"
                      inputMode="numeric"
                      className="form-control" 
                      style={{
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0,
                        flex: 1
                      }}
                      value={formData.emergencyMobile} 
                      onChange={e => {
                        const limit = emergencyCountryCode === '+91' ? 10 : 15;
                        const numericOnly = e.target.value.replace(/\D/g, '').slice(0, limit);
                        handleChange('emergencyMobile', numericOnly);
                      }}
                      onKeyDown={e => {
                        if (
                          !/^[0-9]$/.test(e.key) &&
                          !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) &&
                          !e.ctrlKey &&
                          !e.metaKey
                        ) {
                          e.preventDefault();
                        }
                      }}
                      maxLength={emergencyCountryCode === '+91' ? 10 : 15}
                      placeholder={emergencyCountryCode === '+91' ? "Enter 10-digit emergency number" : "Enter emergency number"} 
                      required 
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Alternate Emergency Number (Optional)</label>
                  <div style={{ display: 'flex', alignItems: 'stretch', position: 'relative' }}>
                    <CountryCodeDropdown
                      value={altEmergencyCountryCode}
                      onChange={(dialCode) => setAltEmergencyCountryCode(dialCode)}
                    />
                    <input 
                      type="tel"
                      inputMode="numeric"
                      className="form-control" 
                      style={{
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0,
                        flex: 1
                      }}
                      value={formData.emergencyAltMobile} 
                      onChange={e => {
                        const limit = altEmergencyCountryCode === '+91' ? 10 : 15;
                        const numericOnly = e.target.value.replace(/\D/g, '').slice(0, limit);
                        handleChange('emergencyAltMobile', numericOnly);
                      }}
                      onKeyDown={e => {
                        if (
                          !/^[0-9]$/.test(e.key) &&
                          !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) &&
                          !e.ctrlKey &&
                          !e.metaKey
                        ) {
                          e.preventDefault();
                        }
                      }}
                      maxLength={altEmergencyCountryCode === '+91' ? 10 : 15}
                      placeholder={altEmergencyCountryCode === '+91' ? "Enter 10-digit alternate number" : "Enter alternate number"} 
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Educational Details */}
        {step === 4 && (
          <div className="onboarding-section-card">
            <div className="onboarding-card-title">
              <div>
                <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>4. Educational Qualifications & Academic Records</span>
                <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '3px 0 0', fontWeight: 500 }}>
                  Enter candidate's academic qualifications, degrees, institution records, and year of passing.
                </p>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Highest Qualification <span style={{ color: '#EF4444' }}>*</span></label>
                <select 
                  className="form-control" 
                  value={formData.qualification} 
                  onChange={e => handleQualificationChange(e.target.value)}
                  required
                >
                  <option value="UG">UG</option>
                  <option value="PG">PG</option>
                  <option value="Diploma">Diploma</option>
                  <option value="Others">Others</option>
                </select>
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Degree / Course Name <span style={{ color: '#EF4444' }}>*</span></label>
                  {isCustomDegree ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomDegree(false);
                        const defaultDeg = DEGREE_OPTIONS_BY_QUALIFICATION[formData.qualification]?.[0] || 'B.E / B.Tech (Engineering / Technology)';
                        handleChange('degreeName', defaultDeg);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0E7490',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      Choose from list
                    </button>
                  ) : null}
                </div>
                {isCustomDegree ? (
                  <input 
                    type="text"
                    name="hrms_add_degree_name"
                    autoComplete="off"
                    className="form-control" 
                    value={formData.degreeName} 
                    onChange={e => handleChange('degreeName', e.target.value.replace(/[^a-zA-Z0-9\s&.\-()/]/g, ''))}
                    onKeyDown={handleCompanyKeyDown}
                    placeholder="Enter Degree / Course Name" 
                    autoFocus
                    required 
                  />
                ) : (
                  <select
                    className="form-control"
                    value={formData.degreeName}
                    onChange={e => {
                      if (e.target.value === '__CUSTOM__') {
                        setIsCustomDegree(true);
                        handleChange('degreeName', '');
                      } else {
                        setIsCustomDegree(false);
                        handleChange('degreeName', e.target.value);
                      }
                    }}
                    required
                  >
                    <optgroup label={`${formData.qualification} Degrees`}>
                      {(DEGREE_OPTIONS_BY_QUALIFICATION[formData.qualification] || []).map(deg => (
                        <option key={deg} value={deg}>{deg}</option>
                      ))}
                    </optgroup>
                    <optgroup label="All Other Degrees & Courses">
                      {ALL_DEGREE_OPTIONS.filter(deg => !(DEGREE_OPTIONS_BY_QUALIFICATION[formData.qualification] || []).includes(deg)).map(deg => (
                        <option key={deg} value={deg}>{deg}</option>
                      ))}
                    </optgroup>
                    <option value="__CUSTOM__">+ Other / Custom Degree (Type manually)...</option>
                  </select>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Specialization <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text"
                  name="hrms_add_specialization"
                  autoComplete="off"
                  className="form-control" 
                  value={formData.specialization} 
                  onChange={e => handleChange('specialization', e.target.value.replace(/[^a-zA-Z\s&.\-]/g, ''))}
                  onKeyDown={handleUniversityKeyDown}
                  placeholder="Enter Specialization (Letters only)" 
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">University / Institution <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text"
                  name="hrms_add_university"
                  autoComplete="off"
                  className="form-control" 
                  value={formData.university} 
                  onChange={e => handleChange('university', e.target.value.replace(/[^a-zA-Z\s&.\-]/g, ''))}
                  onKeyDown={handleUniversityKeyDown}
                  placeholder="Enter University / College (Letters only)" 
                  required 
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Year of Passing <span style={{ color: '#EF4444' }}>*</span></label>
                <select 
                  className="form-control" 
                  value={formData.yearOfPassing} 
                  onChange={e => handleChange('yearOfPassing', e.target.value)}
                  required 
                >
                  <option value="">Select Passing Year</option>
                  {PASSING_YEARS.map(yr => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Grade / Percentage</label>
                <input 
                  type="text"
                  inputMode="decimal"
                  maxLength={6}
                  name="hrms_add_grade_pct"
                  autoComplete="off"
                  className="form-control" 
                  value={formData.gradePercentage} 
                  onChange={e => handleChange('gradePercentage', e.target.value)}
                  onKeyDown={handleDecimalKeyDown(formData.gradePercentage)}
                  placeholder="Enter Grade / Percentage (0 - 100)" 
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Experience Details */}
        {step === 5 && (
          <div className="onboarding-section-card">
            <div className="onboarding-card-title">
              <div>
                <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>5. Past Work Experience & Employment History</span>
                <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '3px 0 0', fontWeight: 500 }}>
                  Specify candidate's prior professional experience, previous companies, designations, and relieving records.
                </p>
              </div>
            </div>

            {/* Fresher vs Experienced Selector */}
            <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B' }}>Experience Profile:</span>
                <p style={{ fontSize: '0.76rem', color: '#64748B', margin: '2px 0 0' }}>Select Fresher or Experienced candidate</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', background: '#E2E8F0', padding: '4px', borderRadius: '10px' }}>
                <button
                  type="button"
                  style={{
                    padding: '6px 16px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: formData.experienceType === 'Fresher' ? '#0E7490' : 'transparent',
                    color: formData.experienceType === 'Fresher' ? '#FFFFFF' : '#475569',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => handleChange('experienceType', 'Fresher')}
                >
                  Fresher
                </button>
                <button
                  type="button"
                  style={{
                    padding: '6px 16px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: formData.experienceType === 'Experienced' ? '#0E7490' : 'transparent',
                    color: formData.experienceType === 'Experienced' ? '#FFFFFF' : '#475569',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => handleChange('experienceType', 'Experienced')}
                >
                  Experienced
                </button>
              </div>
            </div>

            {formData.experienceType === 'Fresher' ? (
              <div style={{ padding: '24px', background: '#ECFEFF', border: '1px solid #CFFAFE', borderRadius: '12px', textAlign: 'center', color: '#0E7490', marginBottom: '20px' }}>
                <CheckCircle2 size={32} style={{ margin: '0 auto 8px', color: '#0E7490' }} />
                <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px', color: '#0E7490' }}>Candidate Registered as Fresher</h4>
                <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
                  No prior employment history, relieving letters, or experience certificates required. You can add technical skills below and proceed to next step.
                </p>
              </div>
            ) : (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Total Experience (Years) <span style={{ color: '#EF4444' }}>*</span></label>
                    <input 
                      type="text"
                      inputMode="decimal"
                      maxLength={5}
                      name="hrms_add_total_exp"
                      autoComplete="off"
                      className="form-control" 
                      value={formData.totalExperience} 
                      onChange={e => handleChange('totalExperience', e.target.value)}
                      onKeyDown={handleDecimalKeyDown(formData.totalExperience)}
                      placeholder="e.g. 2.5 (Years)" 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Previous Company Name <span style={{ color: '#EF4444' }}>*</span></label>
                    <input 
                      type="text"
                      name="hrms_add_prev_company"
                      autoComplete="off"
                      className="form-control" 
                      value={formData.previousCompany} 
                      onChange={e => handleChange('previousCompany', e.target.value.replace(/[^a-zA-Z0-9\s&.\-(),/]/g, ''))}
                      onKeyDown={handleCompanyKeyDown}
                      placeholder="Enter Previous Company Name" 
                      required 
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Previous Designation <span style={{ color: '#EF4444' }}>*</span></label>
                    <input 
                      type="text"
                      name="hrms_add_prev_designation"
                      autoComplete="off"
                      className="form-control" 
                      value={formData.previousDesignation} 
                      onChange={e => handleChange('previousDesignation', e.target.value.replace(/[^a-zA-Z0-9\s&.\-()]/g, ''))}
                      onKeyDown={handleCompanyKeyDown}
                      placeholder="Enter Previous Designation" 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Previous Department</label>
                    <select 
                      className="form-control" 
                      value={formData.previousDepartment} 
                      onChange={e => handleChange('previousDepartment', e.target.value)}
                    >
                      {departments.map(d => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                      <option value="Civil & Structural Engineering">Civil & Structural Engineering</option>
                      <option value="Mechanical & Fabrication">Mechanical & Fabrication</option>
                      <option value="Operations & Site">Operations & Site</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Employment Start Date</label>
                    <input 
                      type="date"
                      className="form-control" 
                      value={formData.expStartDate} 
                      onChange={e => handleChange('expStartDate', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Employment End Date</label>
                    <input 
                      type="date"
                      min={formData.expStartDate || undefined}
                      className="form-control" 
                      value={formData.expEndDate} 
                      onChange={e => handleChange('expEndDate', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Last Drawn Salary</label>
                    <input 
                      type="text"
                      inputMode="decimal"
                      maxLength={12}
                      name="hrms_add_last_salary"
                      autoComplete="off"
                      className="form-control" 
                      value={formData.lastDrawnSalary} 
                      onChange={e => handleChange('lastDrawnSalary', e.target.value)}
                      onKeyDown={handleDecimalKeyDown(formData.lastDrawnSalary)}
                      placeholder="Enter Last Drawn Salary (e.g. 35000)" 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Previous Company Location</label>
                    <input 
                      type="text"
                      name="hrms_add_prev_location"
                      autoComplete="off"
                      className="form-control" 
                      value={formData.previousCompanyLocation} 
                      onChange={e => handleChange('previousCompanyLocation', e.target.value.replace(/[^a-zA-Z0-9\s&.\-(),/]/g, ''))}
                      placeholder="Enter Company Location" 
                    />
                  </div>
                </div>
              </>
            )}

          </div>
        )}

        {/* STEP 6: Salary & Payroll Details */}
        {step === 6 && (
          <div className="onboarding-section-card">
            <div className="onboarding-card-title">
              <span>6. Salary, Compensation & Bank Details (Admin / HR Confidential)</span>
            </div>

            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="form-group">
                <label className="form-label">Salary Scheme (PF / ESIC Policy) <span style={{ color: '#EF4444' }}>*</span></label>
                <select 
                  className="form-control" 
                  value={formData.salaryScheme} 
                  onChange={e => {
                    const scheme = e.target.value as 'WITH_PF' | 'WITHOUT_PF';
                    setFormData(prev => ({
                      ...prev,
                      salaryScheme: scheme,
                      withPf: scheme === 'WITH_PF'
                    }));
                  }}
                  style={{ fontWeight: 700, color: formData.salaryScheme === 'WITH_PF' ? '#0E7490' : '#D97706' }}
                >
                  <option value="WITHOUT_PF">Without PF & ESIC (New Employee / &lt; 6 Months)</option>
                  <option value="WITH_PF">With PF & ESIC (Eligible / &gt; 6 Months / Confirmed)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Total Monthly CTC (₹) <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="number" 
                  className="form-control" 
                  value={salaryInputValue('monthlyCtc', formData.monthlyCtc)} 
                  onChange={e => handleCtcChange(e.target.value)}
                  style={{ fontWeight: 800, color: '#0E7490', fontSize: '1.05rem' }}
                  required 
                />
              </div>
            </div>


            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px' }}>
              <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, color: 'var(--color-text-secondary)' }}>
                Configured Payroll Components (from Settings → Payroll Settings)
              </h4>
              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                {activeEarnings.length} Earning {activeEarnings.length === 1 ? 'Component' : 'Components'} Active
              </span>
            </div>

            {activeEarnings.length > 0 ? (
              <div className="form-row" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))` }}>
                {activeEarnings.map(comp => {
                  const compVal = formData.customComponents?.[comp.code] ?? (
                    comp.code === 'BASIC' ? formData.basicSalary :
                    comp.code === 'DA' ? formData.da :
                    (comp.code === 'CONV' || comp.code === 'CONVEYANCE') ? formData.conveyance :
                    comp.code === 'HRA' ? formData.hra : 0
                  );
                  const badgeText = comp.calculationMethod === 'PERCENTAGE'
                    ? `${comp.defaultValue}% of ${comp.percentageBase || 'CTC'}`
                    : comp.calculationMethod === 'FIXED_AMOUNT'
                    ? `Fixed ${formatCurrency(comp.defaultValue || 0)}`
                    : `fx: ${comp.formula || 'Formula'}`;

                  return (
                    <div className="form-group" key={comp.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <label className="form-label" style={{ margin: 0 }}>{comp.name} (₹) {comp.code === 'BASIC' ? <span style={{ color: '#EF4444' }}> *</span> : ''}</label>
                        <span style={{ fontSize: '0.72rem', color: '#0E7490', fontWeight: 800 }}>{badgeText}</span>
                      </div>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={salaryInputValue(`component:${comp.code}`, compVal)} 
                        onChange={e => handleCustomCompChange(comp, e.target.value)} 
                        style={{ fontWeight: 700 }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{
                backgroundColor: '#F0FDFA',
                border: '1px solid #CCFBF1',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#0E7490', marginBottom: '8px' }}>
                  <AlertCircle size={18} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    No dynamic earning components configured in Settings → Payroll Settings.
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '0 0 12px 0' }}>
                  You can configure custom components with formulas and percentages under <strong>Settings → Payroll Settings</strong>. For now, enter standard Basic Salary below:
                </p>
                <div className="form-group" style={{ maxWidth: '280px', margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>Basic Salary (₹) <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="number"
                    className="form-control"
                    value={salaryInputValue('basicSalary', formData.basicSalary)}
                    onChange={e => handleSalaryChange('basicSalary', e.target.value)}
                    style={{ fontWeight: 700 }}
                    required
                  />
                </div>
              </div>
            )}

            {/* Dynamic Statutory Deductions and Contributions Preview */}
            {formData.salaryScheme === 'WITH_PF' ? (
              <div style={{
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '14px 16px',
                marginTop: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Statutory & Configured Deductions (Dynamic from Settings)
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#0E7490', fontWeight: 700 }}>
                    {salarySchemePreviewLabel}
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
                  gap: '10px',
                  marginBottom: '10px'
                }}>
                  {/* EPF Contribution Card */}
                  {statutoryCalc.pfActive !== false && (
                    <div style={{ backgroundColor: '#FFFFFF', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                          EPF CONTRIBUTION
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 700 }}>
                          Deduction
                        </span>
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
                        {formatCurrency(statutoryCalc.epfDeduction)}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={statutoryCalc.epfRule}>
                        {statutoryCalc.epfRule}
                      </div>
                    </div>
                  )}

                  {/* ESIC Contribution Card */}
                  {statutoryCalc.esicActive !== false && (
                    <div style={{ backgroundColor: '#FFFFFF', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                          ESIC CONTRIBUTION
                        </div>
                        <span style={{ fontSize: '0.68rem', color: statutoryCalc.isEsicExempt ? '#64748B' : '#DC2626', fontWeight: 700 }}>
                          {statutoryCalc.isEsicExempt ? 'Exempt' : 'Deduction'}
                        </span>
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: statutoryCalc.isEsicExempt ? '#64748B' : '#DC2626', marginTop: '2px' }}>
                        {statutoryCalc.isEsicExempt ? 'Exempt (> ₹21,000.00)' : formatCurrency(statutoryCalc.esiDeduction)}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={statutoryCalc.esiRule}>
                        {statutoryCalc.esiRule}
                      </div>
                    </div>
                  )}

                  {/* Configured Custom Deductions (from Settings) */}
                  {statutoryCalc.configuredDeductions.map(ded => (
                    <div key={ded.id} style={{ backgroundColor: '#FFFFFF', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                          {ded.name}
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 700 }}>
                          Deduction
                        </span>
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
                        {formatCurrency(ded.amount)}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '2px' }}>
                        {ded.description}
                      </div>
                    </div>
                  ))}

                  {/* Professional Tax (if enabled) */}
                  {statutoryCalc.ptActive !== false && statutoryCalc.professionalTax > 0 && !statutoryCalc.configuredDeductions.some(d => d.code === 'PT' || d.name.toLowerCase().includes('professional tax')) && (
                    <div style={{ backgroundColor: '#FFFFFF', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                          Professional Tax (PT)
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 700 }}>
                          State
                        </span>
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
                        {formatCurrency(statutoryCalc.professionalTax)}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '2px' }}>
                        Standard Monthly PT
                      </div>
                    </div>
                  )}
                </div>

                {/* Net Summary Bar */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: '#ECFEFF',
                  borderRadius: '8px',
                  border: '1px solid #CFFAFE',
                  fontSize: '0.8rem'
                }}>
                  <div style={{ color: '#0E7490', fontWeight: 700 }}>
                    Total Monthly Deductions: <span style={{ color: '#DC2626', fontWeight: 800 }}>{formatCurrency(statutoryCalc.totalDeductions)}</span>
                  </div>
                  <div style={{ color: '#0E7490', fontWeight: 700 }}>
                    Estimated Net In-Hand: <span style={{ color: '#059669', fontWeight: 900, fontSize: '0.92rem' }}>{formatCurrency(statutoryCalc.netTakeHome)}</span>
                  </div>
                </div>
              </div>
            ) : null}

            <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '18px 0 10px', color: 'var(--color-text-secondary)' }}>
              Banking & Statutory Registration
            </h4>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Bank Name <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text"
                  name="hrms_add_bank_name"
                  autoComplete="off"
                  className="form-control" 
                  value={formData.bankName} 
                  onChange={e => handleChange('bankName', e.target.value.replace(/[^a-zA-Z\s&.\-()]/g, ''))} 
                  onKeyDown={handleLettersOnlyKeyDown}
                  placeholder="Enter Bank Name (Letters only)" 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Account Number <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text"
                  inputMode="numeric"
                  maxLength={18}
                  name="hrms_add_account_number"
                  autoComplete="off"
                  className="form-control" 
                  value={formData.accountNumber} 
                  onChange={e => handleChange('accountNumber', e.target.value.replace(/\D/g, '').slice(0, 18))} 
                  onKeyDown={handleDigitsOnlyKeyDown}
                  placeholder="9 to 18 digit Account Number" 
                  required 
                />
              </div>
            </div>

            <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="form-group">
                <label className="form-label">IFSC Code <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text"
                  maxLength={11}
                  name="hrms_add_ifsc_code"
                  autoComplete="off"
                  className="form-control" 
                  value={formData.ifscCode} 
                  onChange={e => handleChange('ifscCode', e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11))} 
                  onKeyDown={handleAlphanumericKeyDown}
                  placeholder="11-character IFSC (e.g. SBIN0001234)" 
                  style={{ textTransform: 'uppercase' }}
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">PAN Card Number <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text"
                  maxLength={10}
                  name="hrms_add_pan_number"
                  autoComplete="off"
                  className="form-control" 
                  value={formData.panNumber} 
                  onChange={e => handleChange('panNumber', e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10))} 
                  onKeyDown={handleAlphanumericKeyDown}
                  placeholder="10-character PAN (e.g. ABCDE1234F)" 
                  style={{ textTransform: 'uppercase' }}
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">UAN / PF Number (Optional)</label>
                <input 
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  name="hrms_add_uan_number"
                  autoComplete="off"
                  className="form-control" 
                  value={formData.uanNumber} 
                  onChange={e => handleChange('uanNumber', e.target.value.replace(/\D/g, '').slice(0, 12))} 
                  onKeyDown={handleDigitsOnlyKeyDown}
                  placeholder="12-digit UAN (e.g. 101234567890)" 
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 7: Attendance & Shift Settings */}
        {step === 7 && (
          <div className="onboarding-section-card">
            <div className="onboarding-card-title">
              <span>7. Attendance Mode, Shifts & Leave Policies</span>
            </div>

            {isCEO && (
              <div style={{ padding: '12px 16px', backgroundColor: '#ECFEFF', border: '1px solid #A5F3FC', borderRadius: '10px', marginBottom: '16px', color: '#0E7490', fontSize: '0.82rem', fontWeight: 700 }}>
                CEO Executive Notice: This employee is exempt from daily biometric face scans, geofenced mobile punches, and absent penalizations.
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Primary Attendance Verification Method <span style={{ color: '#EF4444' }}>*</span></label>
                <select 
                  className="form-control" 
                  value={formData.attendanceMethod} 
                  onChange={e => handleChange('attendanceMethod', e.target.value)}
                >
                  <option value="Face Scan">Face Recognition Scan (AI Camera)</option>
                  <option value="GPS Location">Mobile GPS Geofenced Check-In</option>
                  <option value="Biometric">Biometric Fingerprint Scanner</option>
                  <option value="Manual">Manual HR Portal Punch</option>
                  <option value="Exempt">Exempt from Attendance (Executive / CEO)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Assigned Shift Schedule</label>
                <select 
                  className="form-control" 
                  value={formData.shift} 
                  onChange={e => handleChange('shift', e.target.value)}
                >
                  {shifts.length === 0 ? (
                    <option value="">-- No Shifts Configured (Add in Shift Settings) --</option>
                  ) : (
                    shifts.map(s => (
                      <option key={s.id} value={s.shiftName}>{s.shiftName} ({s.startTime} - {s.endTime})</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Weekly Off Routine</label>
                <select 
                  className="form-control" 
                  value={formData.weeklyOff} 
                  onChange={e => handleChange('weeklyOff', e.target.value)}
                >
                  {weeklySchedules.map(w => (
                    <option key={w.id} value={w.name}>{w.name} ({w.workingDays})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Annual Leave Policy Package</label>
                <select 
                  className="form-control" 
                  value={formData.leavePolicy} 
                  onChange={e => handleChange('leavePolicy', e.target.value)}
                >
                  {leavePolicies.map(lp => (
                    <option key={lp.id} value={lp.name}>{lp.name} ({lp.quotaDays} Days)</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-primary-light)', borderRadius: 'var(--radius-card)', marginTop: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-primary-blue)', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={formData.gpsAllowed} 
                  onChange={e => handleChange('gpsAllowed', e.target.checked)} 
                />
                Enable Mobile GPS Geofencing for Off-Site and Field Plant Punches
              </label>
            </div>
          </div>
        )}

        {/* STEP 8: Documents Upload */}
        {step === 8 && (
          <div className="onboarding-section-card">
            <div className="onboarding-card-title">
              <div>
                <span style={{ fontSize: '1.15rem', fontWeight: 700 }}>8. Employee Documents & Verification Uploads</span>
                <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '3px 0 0', fontWeight: 500 }}>
                  Attach official candidate credentials. Supported formats: PDF, DOCX, JPG, PNG (maximum size: 1 MB per document).
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px', marginBottom: '28px' }}>
              {[
                { cat: '10th Marksheet', desc: 'SSLC / 10th standard pass certificate' },
                { cat: '12th or Diploma', desc: '12th HSC, Diploma, or Degree marksheet' },
                { cat: 'Relieving Letter', desc: 'Formal relieving order & exit clearance' },
                { cat: 'Experience Certificate', desc: 'Service credential or experience certificate' },
                { cat: 'ID Proof', desc: 'Government issued identity proof (Aadhaar / PAN)' },
                { cat: 'Account Passbook (First Page)', desc: 'Bank passbook first page or cancelled cheque' }
              ].map(item => {
                const existingDoc = documents.find(d => d.category === item.cat);

                return (
                  <div 
                    key={item.cat} 
                    className={`document-upload-card ${existingDoc ? 'has-file' : ''}`}
                    onClick={() => triggerUploadForCategory(item.cat)}
                  >
                    {existingDoc ? (
                      <>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                          <CheckCircle2 size={22} />
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#166534' }}>{item.cat}</div>
                        <div style={{ fontSize: '0.74rem', color: '#15803D', marginTop: '4px', fontWeight: 600, wordBreak: 'break-all', maxWidth: '100%' }}>
                          {existingDoc.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                          {existingDoc.size} • {existingDoc.uploadDate}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }} onClick={e => e.stopPropagation()}>
                          <button 
                            type="button" 
                            className="btn btn-secondary btn-sm" 
                            onClick={() => triggerUploadForCategory(item.cat)}
                            style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                          >
                            Replace
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-sm" 
                            onClick={() => handleRemoveDocument(existingDoc.id)}
                            style={{ fontSize: '0.72rem', padding: '4px 10px', color: '#EF4444', borderColor: '#FCA5A5', background: '#FEF2F2' }}
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                          <Upload size={20} />
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B' }}>{item.cat}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '4px' }}>{item.desc}</div>
                        <span style={{ display: 'inline-block', padding: '2px 8px', background: '#F1F5F9', color: '#64748B', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 600, marginTop: '8px' }}>
                          PDF, DOCX, JPG &lt; 10MB
                        </span>
                        <button 
                          type="button" 
                          className="btn btn-secondary btn-sm" 
                          style={{ marginTop: '12px', fontSize: '0.78rem', padding: '6px 14px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerUploadForCategory(item.cat);
                          }}
                        >
                          + Upload Document
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Document Queue Summary */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1E293B', margin: 0 }}>
                  Uploaded Documents ({documents.length} of 6 Attached)
                </h4>
                {documents.length > 0 && (
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: '9999px' }}>
                    Ready for Verification
                  </span>
                )}
              </div>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                style={{ fontSize: '0.75rem', padding: '5px 12px' }}
                onClick={() => triggerUploadForCategory('Additional Certificate')}
              >
                + Attach Extra Document
              </button>
            </div>

            {documents.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', color: '#64748B', fontSize: '0.82rem' }}>
                No documents uploaded yet. Click any card above to attach your files, or continue to review.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {documents.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileCheck size={20} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>{doc.name}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                          <span style={{ fontWeight: 600, color: '#0E7490' }}>{doc.category}</span> • {doc.size} • Uploaded on {doc.uploadDate}
                        </div>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveDocument(doc.id)} 
                      style={{ color: '#EF4444', padding: '6px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Remove document"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 9: Final Review & Confirmation */}
        {step === 9 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header Banner */}
            <div className="onboarding-section-card" style={{ marginBottom: 0 }}>
              <div className="onboarding-card-title">
                <div>
                  <span style={{ fontSize: '1.15rem', fontWeight: 700 }}>9. Comprehensive Employee Onboarding Review</span>
                  <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '3px 0 0', fontWeight: 500 }}>
                    Please verify all candidate parameters across each section below before final submission into the system.
                  </p>
                </div>
              </div>

              {/* Header Profile Summary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '20px', background: '#ECFEFF', border: '1px solid #CFFAFE', borderRadius: 'var(--radius-card)', marginTop: '16px' }}>
                {formData.avatar ? (
                  <img src={formData.avatar} alt="Profile" style={{ width: '64px', height: '64px', borderRadius: '9999px', objectFit: 'cover', border: '2px solid #0E7490', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: '64px', height: '64px', borderRadius: '9999px', background: '#0E7490', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, flexShrink: 0 }}>
                    {formData.firstName?.[0] || 'E'}{formData.lastName?.[0] || 'M'}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1E293B', margin: 0 }}>
                    {formData.firstName || 'First'} {formData.lastName || 'Last'}
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '4px' }}>
                    <strong style={{ color: '#0E7490' }}>{formData.employeeId}</strong> • {formData.designation} in <strong>{formData.department}</strong> ({formData.workLocation})
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#0E7490', fontWeight: 600, marginTop: '2px' }}>
                    {formData.personalEmail || 'No personal email provided'} • {formData.phone}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 1: Basic Personal Information */}
            <div className="onboarding-section-card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0E7490', fontSize: '0.95rem' }}>
                  1. Basic Personal Information
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(1)} style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Edit3 size={12} /> Edit
                </button>
              </div>
              <div className="review-item-grid">
                <div className="review-field-box">
                  <div className="review-field-label">Employee ID</div>
                  <div className="review-field-val" style={{ color: '#0E7490', fontFamily: 'monospace', fontWeight: 700 }}>{formData.employeeId}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Full Name</div>
                  <div className="review-field-val">{formData.firstName} {formData.lastName}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Gender & DOB</div>
                  <div className="review-field-val">{formData.gender} • {formatDateDDMMYYYY(formData.dob)}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Blood Group</div>
                  <div className="review-field-val">{formData.bloodGroup || 'N/A'}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Mobile Phone Number</div>
                  <div className="review-field-val">{formData.phone}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Email ID (Login Dispatch)</div>
                  <div className="review-field-val" style={{ color: '#0E7490', fontWeight: 700 }}>{formData.personalEmail || 'N/A'}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Login Password</div>
                  <div className="review-field-val" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{formData.password ? (showPassword ? formData.password : '••••••••') : 'Auto-generated'}</span>
                    {formData.password && (
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: '2px' }}
                        title={showPassword ? 'Hide Password' : 'Show Password'}
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Marital Status</div>
                  <div className="review-field-val">{formData.maritalStatus || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Section 2: Employment & Department Details */}
            <div className="onboarding-section-card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0E7490', fontSize: '0.95rem' }}>
                  2. Employment & Role Details
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(2)} style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Edit3 size={12} /> Edit
                </button>
              </div>
              <div className="review-item-grid">
                <div className="review-field-box">
                  <div className="review-field-label">System Role & Privilege</div>
                  <div className="review-field-val" style={{ fontWeight: 800, color: '#0E7490' }}>{getDepartmentAccessProfile(formData.department).role}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Department</div>
                  <div className="review-field-val" style={{ fontWeight: 700 }}>{formData.department}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Designation / Role</div>
                  <div className="review-field-val">{formData.designation}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Date of Joining</div>
                  <div className="review-field-val">{formatDateDDMMYYYY(formData.joiningDate)}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Employment Type</div>
                  <div className="review-field-val">{formData.employmentType}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Reporting Manager</div>
                  <div className="review-field-val">{formData.reportingManagerName} ({formData.reportingManagerId})</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Work Location / Branch</div>
                  <div className="review-field-val">{formData.workLocation}</div>
                </div>
              </div>
            </div>

            {/* Section 3: Address & Emergency Contacts */}
            <div className="onboarding-section-card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0E7490', fontSize: '0.95rem' }}>
                  3. Address & Emergency Contacts
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(3)} style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Edit3 size={12} /> Edit
                </button>
              </div>
              <div className="review-item-grid">
                <div className="review-field-box" style={{ gridColumn: 'span 2' }}>
                  <div className="review-field-label">Current Address Details</div>
                  <div className="review-field-val">{formData.currentLine1}{formData.currentLine2 ? `, ${formData.currentLine2}` : ''}, {formData.currentCity}, {formData.currentState} - {formData.currentPincode}, {formData.currentCountry}</div>
                </div>
                <div className="review-field-box" style={{ gridColumn: 'span 2' }}>
                  <div className="review-field-label">Permanent Address Details</div>
                  <div className="review-field-val">{formData.sameAsCurrent ? 'Same as Current Address' : `${formData.permanentLine1}${formData.permanentLine2 ? `, ${formData.permanentLine2}` : ''}, ${formData.permanentCity}, ${formData.permanentState} - ${formData.permanentPincode}, ${formData.permanentCountry}`}</div>
                </div>
                <div className="review-field-box" style={{ gridColumn: 'span 2' }}>
                  <div className="review-field-label">Emergency Contact Person</div>
                  <div className="review-field-val">{formData.emergencyName} ({formData.emergencyRelationship})</div>
                </div>
              </div>
            </div>

            {/* Section 4: Educational Details */}
            <div className="onboarding-section-card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0E7490', fontSize: '0.95rem' }}>
                  4. Educational Qualifications
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(4)} style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Edit3 size={12} /> Edit
                </button>
              </div>
              <div className="review-item-grid">
                <div className="review-field-box">
                  <div className="review-field-label">Highest Qualification</div>
                  <div className="review-field-val">{formData.qualification}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Degree / Course Name</div>
                  <div className="review-field-val">{formData.degreeName}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Specialization / Major</div>
                  <div className="review-field-val">{formData.specialization || 'General / N/A'}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">University / Institution</div>
                  <div className="review-field-val">{formData.university}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Year of Passing</div>
                  <div className="review-field-val">{formData.yearOfPassing}</div>
                </div>
                <div className="review-field-box">
                  <div className="review-field-label">Grade / Percentage / CGPA</div>
                  <div className="review-field-val">{formData.gradePercentage || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Section 5: Work Experience Details */}
            <div className="onboarding-section-card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0E7490', fontSize: '0.95rem' }}>
                  5. Work Experience History
                </div>
                {!isCEO && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(5)} style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Edit3 size={12} /> Edit
                  </button>
                )}
              </div>
              {isCEO ? (
                <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', color: '#0E7490', fontSize: '0.88rem', fontWeight: 600 }}>
                  <strong>Exempt (CEO)</strong> — Prior employment records not applicable.
                </div>
              ) : formData.experienceType === 'Fresher' ? (
                <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', color: '#64748B', fontSize: '0.88rem', fontWeight: 600 }}>
                  Candidate is registered as a <strong>Fresher</strong> (No prior employment records).
                </div>
              ) : (
                <div className="review-item-grid">
                  <div className="review-field-box">
                    <div className="review-field-label">Total Work Experience</div>
                    <div className="review-field-val">{formData.totalExperience ? `${formData.totalExperience} Years` : 'Fresher'}</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Previous Company</div>
                    <div className="review-field-val">{formData.previousCompany}</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Previous Designation</div>
                    <div className="review-field-val">{formData.previousDesignation}</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Previous Department</div>
                    <div className="review-field-val">{formData.previousDepartment}</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Employment Tenure</div>
                    <div className="review-field-val">{formData.expStartDate || 'N/A'} to {formData.expEndDate || 'Present'}</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Last Drawn Salary & Location</div>
                    <div className="review-field-val">{formData.lastDrawnSalary || 'N/A'} • {formData.previousCompanyLocation || 'N/A'}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 6: Salary, Compensation & Banking */}
            <div className="onboarding-section-card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0E7490', fontSize: '0.95rem' }}>
                  6. Salary & Bank Details
                </div>
                {!isCEO && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(6)} style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Edit3 size={12} /> Edit
                  </button>
                )}
              </div>
              {isCEO ? (
                <div style={{ padding: '16px 20px', background: '#ECFEFF', border: '1px solid #CFFAFE', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0E7490', fontWeight: 800, fontSize: '0.95rem' }}>
                    <span>Salary Exempt — CEO</span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
                    As CEO executive leadership, standard employee basic salary and wage structures are not applicable.
                  </p>
                </div>
              ) : (
                <div className="review-item-grid">
                  <div className="review-field-box">
                    <div className="review-field-label">Monthly Gross CTC</div>
                    <div className="review-field-val" style={{ color: '#16A34A', fontWeight: 700 }}>{formatCurrency(formData.monthlyCtc)} / month</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Salary Scheme (PF / ESIC)</div>
                    <div className="review-field-val" style={{ fontWeight: 700, color: formData.salaryScheme === 'WITH_PF' ? '#0E7490' : '#D97706' }}>
                      {salarySchemeReviewLabel}
                    </div>
                  </div>
                  <div className="review-field-box" style={{ gridColumn: 'span 2' }}>
                    <div className="review-field-label">Salary Breakdown</div>
                    <div className="review-field-val" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                      {activeEarnings.length > 0 ? (
                        activeEarnings.map(c => {
                          const amt = formData.customComponents?.[c.code] ?? (
                            c.code === 'BASIC' ? formData.basicSalary :
                            c.code === 'DA' ? formData.da :
                            (c.code === 'CONV' || c.code === 'CONVEYANCE') ? formData.conveyance :
                            c.code === 'HRA' ? formData.hra : 0
                          );
                          return `${c.name}: ${formatCurrency(amt)}`;
                        }).join(' | ')
                      ) : (
                        'No active components configured'
                      )}
                    </div>
                  </div>
                  <div className="review-field-box" style={{ gridColumn: 'span 2', backgroundColor: '#F0FDFA' }}>
                    <div className="review-field-label" style={{ color: '#0E7490' }}>Estimated Net Take-Home Pay (After Deductions)</div>
                    <div className="review-field-val" style={{ color: '#0E7490', fontWeight: 800 }}>
                      {formatCurrency(statutoryCalc.netTakeHome)} / month
                      <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500, marginLeft: '8px' }}>
                        (Gross {formatCurrency(statutoryCalc.gross)} - Deductions {formatCurrency(statutoryCalc.totalDeductions)})
                      </span>
                    </div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Bank Name & Branch</div>
                    <div className="review-field-val">{formData.bankName} ({formData.branch || 'Main Branch'})</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Account Number & IFSC</div>
                    <div className="review-field-val">{formData.accountNumber} • {formData.ifscCode}</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">PAN Card & UAN / PF</div>
                    <div className="review-field-val">{formData.panNumber} • {formData.uanNumber || 'N/A'}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 7: Attendance & Shift Policies */}
            <div className="onboarding-section-card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0E7490', fontSize: '0.95rem' }}>
                  7. Attendance & Shift Settings
                </div>
                {!isCEO && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(7)} style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Edit3 size={12} /> Edit
                  </button>
                )}
              </div>
              {isCEO ? (
                <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', color: '#0E7490', fontSize: '0.88rem', fontWeight: 600 }}>
                  <strong>Exempt (CEO)</strong> — Biometric attendance and work shift schedule tracking are not required.
                </div>
              ) : (
                <div className="review-item-grid">
                  <div className="review-field-box">
                    <div className="review-field-label">Attendance Capture Mode</div>
                    <div className="review-field-val">{formData.attendanceMethod} {formData.gpsAllowed ? '(GPS Geofenced Enabled)' : ''}</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Assigned Work Shift</div>
                    <div className="review-field-val">{formData.shift}</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Weekly Off Routine</div>
                    <div className="review-field-val">{formData.weeklyOff}</div>
                  </div>
                  <div className="review-field-box">
                    <div className="review-field-label">Annual Leave Policy</div>
                    <div className="review-field-val">{formData.leavePolicy}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 8: Uploaded Documents */}
            <div className="onboarding-section-card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0E7490', fontSize: '0.95rem' }}>
                  8. Verified Uploaded Documents ({documents.length} Files)
                </div>
                {!isCEO && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(8)} style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Edit3 size={12} /> Edit
                  </button>
                )}
              </div>
              {isCEO && documents.length === 0 ? (
                <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', color: '#64748B', fontSize: '0.88rem', fontWeight: 600 }}>
                  <strong>Exempt / Optional</strong> — Document uploads not required for CEO.
                </div>
              ) : documents.length === 0 ? (
                <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', color: '#64748B', fontSize: '0.85rem' }}>
                  No documents attached yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  {documents.map(doc => (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                      <FileCheck size={18} color="#0E7490" style={{ flexShrink: 0 }} />
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}><span style={{ color: '#0E7490', fontWeight: 600 }}>{doc.category}</span> • {doc.size}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Confirmation Banner */}
            <div style={{ padding: '16px 20px', background: '#ECFEFF', border: '1px solid #CFFAFE', borderRadius: 'var(--radius-card)', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <CheckCircle2 size={24} color="var(--color-primary-blue)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.88rem', color: 'var(--color-text-primary)' }}>
                {isCEO 
                  ? 'All parameters for the CEO profile have been verified. Clicking the button below will register the CEO executive account with executive administrative authority.'
                  : 'All mandatory parameters have been checked and validated. Clicking Confirm & Onboard Employee will save the profile into the employee directory and prepare the official offer letter.'}
              </div>
            </div>
          </div>
        )}
        </div>
        </form>
      </main>

      {/* Bottom Sticky Action Footer */}
      <footer className="onboarding-footer">
        <div className="onboarding-footer-inner">
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={resetAndClose}
            style={{ padding: '9px 18px', fontSize: '0.88rem' }}
          >
            Cancel & Exit
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
              Step <span style={{ color: '#0E7490', fontWeight: 700 }}>{currentStepIndex + 1}</span> of {stepsList.length} • {Math.round(((currentStepIndex + 1) / stepsList.length) * 100)}% Completed
            </div>
            {validationError && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                color: '#DC2626', 
                fontSize: '0.78rem', 
                fontWeight: 600,
                backgroundColor: '#FEF2F2',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #FECACA',
                maxWidth: '380px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }} title={validationError}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{validationError}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {currentStepIndex > 0 && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setValidationError(null);
                  const prevStepObj = stepsList[currentStepIndex - 1];
                  if (prevStepObj) {
                    setStep(prevStepObj.num);
                    const scrollTarget = document.querySelector('.onboarding-body');
                    if (scrollTarget) {
                      scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontSize: '0.88rem' }}
              >
                <ArrowLeft size={16} /> Back
              </button>
            )}

            {currentStepIndex < stepsList.length - 1 ? (
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  const err = validateCurrentStep(step);
                  if (err) {
                    setValidationError(err);
                    const scrollTarget = document.querySelector('.onboarding-body');
                    if (scrollTarget) {
                      scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                    return;
                  }
                  setValidationError(null);
                  const nextStepObj = stepsList[currentStepIndex + 1];
                  if (nextStepObj) {
                    setStep(nextStepObj.num);
                    const scrollTarget = document.querySelector('.onboarding-body');
                    if (scrollTarget) {
                      scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 20px', fontSize: '0.88rem', background: '#0E7490', borderColor: '#0E7490', boxShadow: '0 2px 8px rgba(14, 116, 144, 0.25)' }}
              >
                Next Step <ArrowRight size={16} />
              </button>
            ) : (
              <button 
                type="button" 
                className="btn btn-primary" 
                disabled={isSubmitting}
                onClick={handleSubmit}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  backgroundColor: isSubmitting ? '#94A3B8' : '#10B981', 
                  borderColor: isSubmitting ? '#94A3B8' : '#10B981', 
                  padding: '9px 22px', 
                  fontSize: '0.88rem', 
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={17} className="animate-spin" /> Provisioning Login Account...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} /> {isCEO ? 'Confirm & Create CEO / Owner Account' : 'Confirm & Onboard Employee'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

