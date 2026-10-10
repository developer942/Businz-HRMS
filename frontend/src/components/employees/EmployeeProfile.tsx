import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { Employee, Role } from '../../types/hrms';
import { SalaryComponentConfig } from '../../types/settings';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { 
  X, 
  User, 
  Briefcase, 
  CreditCard, 
  FileText,
  Mail,
  MapPin,
  Building,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  Download,
  KeyRound,
  Power,
  FolderPlus,
  GraduationCap,
  Edit3,
  Save,
  Eye,
  EyeOff,
  Upload,
  Trash2,
  Camera,
  Calendar,
  Lock,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { OfferLetterModal } from './OfferLetterModal';
import { buildPayrollFormulaContext, calculateConfiguredDeductionLines, calculateSalaryBreakdown } from '../../services/policyEngine';
import { formatCurrency } from '../../utils/numbers';
import { rbacService } from '../../services/rbacService';
import { getInitialRBACState } from '../../services/rbacService';
import { dispatchCredentialEmail } from '../../services/emailDispatchService';
import { 
  HIGHEST_QUALIFICATION_OPTIONS, 
  DEGREE_OPTIONS_BY_QUALIFICATION, 
  ALL_DEGREE_OPTIONS, 
  normalizeQualification 
} from './AddEmployeeModal';
import { CountryCodeDropdown } from '../common/CountryCodeDropdown';
import { COUNTRY_CODES } from '../../data/countryCodes';

interface EmployeeProfileProps {
  employee: Employee;
  onClose: () => void;
  initialTab?: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const PASSING_YEARS = Array.from(
  { length: CURRENT_YEAR - 1960 + 1 },
  (_, i) => String(CURRENT_YEAR - i)
);

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

const extractLocalDigits = (raw: string | undefined | null, dialCode: string = '+91'): string => {
  if (!raw) return '';
  let str = String(raw).trim();
  if (str.startsWith('+')) {
    str = str.replace(/^\+[0-9]{1,4}\s*/, '');
  }
  let digits = str.replace(/\D/g, '');
  const codeDigits = dialCode.replace(/\D/g, '');
  if (codeDigits && digits.startsWith(codeDigits) && dialCode === '+91' && digits.length === 12) {
    digits = digits.slice(codeDigits.length);
  }
  return digits;
};

export const EmployeeProfile: React.FC<EmployeeProfileProps> = ({ 
  employee, 
  onClose, 
  initialTab = 'all' 
}) => {
  const { 
    currentUser, 
    hasPermission, 
    updateEmployee,
    resetEmployeeLogin,
    updateEmployeeLoginStatus,
    departments,
    designations,
    branches,
    shifts,
    leavePolicies,
    weeklySchedules,
    holidayPolicies,
    employees,
    payrollSettingsConfig,
    employmentTypes,
    orgStructure,
    companyBranches
  } = useHRMS();

  // Dynamic salary components from Settings → Payroll Settings
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


  const [currentEmp, setCurrentEmp] = useState<Employee>(employee);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [showOfferLetterModal, setShowOfferLetterModal] = useState<boolean>(false);
  const [imgError, setImgError] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // System credentials management states
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  const [showStatusConfirmModal, setShowStatusConfirmModal] = useState<boolean>(false);
  const [statusToSet, setStatusToSet] = useState<'ACTIVE' | 'DEACTIVATED' | 'DISABLED'>('DEACTIVATED');
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);
  const [profilePhoneCountryCode, setProfilePhoneCountryCode] = useState('+91');
  const [profileEmergencyCountryCode, setProfileEmergencyCountryCode] = useState('+91');
  const [profileAltEmergencyCountryCode, setProfileAltEmergencyCountryCode] = useState('+91');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Permission strictly restricted to CEO and HR administrators only (no other roles allowed)
  const canActivateOrDeactivate = Boolean(
    currentUser?.role === 'CEO' || 
    currentUser?.designation === 'CEO' ||
    (currentUser?.designation && currentUser.designation.toLowerCase().includes('ceo')) ||
    currentUser?.role === 'Super Admin' || 
    currentUser?.employeeId === 'EMP-000' ||
    currentUser?.role === 'HR Admin' || 
    currentUser?.role === 'HR Manager'
  );

  // Check if current user is CEO or authorized HR administrator
  const isCEOorHR = Boolean(
    canActivateOrDeactivate || 
    currentUser?.role === 'ERP Administrator' || 
    hasPermission('employees', 'edit')
  );

  const isSuperAdminOrCEO = Boolean(
    currentUser?.role === 'CEO' || 
    currentUser?.designation === 'CEO' ||
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'ERP Administrator'
  );

  const isHR = Boolean(
    currentUser?.role === 'HR Admin' || 
    currentUser?.role === 'HR Manager' || 
    currentUser?.designation?.toLowerCase().includes('hr') ||
    currentUser?.department?.toLowerCase() === 'hr' ||
    currentUser?.department?.toLowerCase() === 'human resources'
  );

  const isSelf = Boolean(
    (currentUser?.id && (currentUser.id === currentEmp.id || currentUser.id === (currentEmp as any).authUserId)) ||
    (currentUser?.employeeId && (currentUser.employeeId === currentEmp.employeeId || currentUser.employeeId === currentEmp.id)) ||
    (currentUser?.email && currentEmp.email && currentUser.email.toLowerCase() === currentEmp.email.toLowerCase())
  );

  // Super Admin, CEO, and HR can see all passwords; employees can see their own password
  const canViewPassword = isSuperAdminOrCEO || isHR || isCEOorHR || isSelf;

  // Sync internal state if prop employee updates
  useEffect(() => {
    setCurrentEmp(employee);

    // Parse country codes from employee contact data if available
    if (employee.phone?.startsWith('+')) {
      const matched = COUNTRY_CODES.find(c => employee.phone?.startsWith(c.dialCode));
      if (matched) setProfilePhoneCountryCode(matched.dialCode);
    } else {
      setProfilePhoneCountryCode('+91');
    }
    if (employee.emergencyContact?.mobile?.startsWith('+')) {
      const matched = COUNTRY_CODES.find(c => employee.emergencyContact?.mobile?.startsWith(c.dialCode));
      if (matched) setProfileEmergencyCountryCode(matched.dialCode);
    } else {
      setProfileEmergencyCountryCode('+91');
    }
    if (employee.emergencyContact?.alternateMobile?.startsWith('+')) {
      const matched = COUNTRY_CODES.find(c => employee.emergencyContact?.alternateMobile?.startsWith(c.dialCode));
      if (matched) setProfileAltEmergencyCountryCode(matched.dialCode);
    } else {
      setProfileAltEmergencyCountryCode('+91');
    }

    setFormData(getInitialFormData(employee));
    const d = employee.educationalDetails?.degreeName;
    setIsCustomDegree(Boolean(d && !ALL_DEGREE_OPTIONS.includes(d)));
  }, [employee]);

  // 18+ DOB constraint
  const maxDobDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split('T')[0];
  }, []);

  // Form State initialized from employee data
  const getInitialFormData = (emp: Employee) => {
    const isEmpCEO = emp.role === 'CEO' || emp.department === 'CEO' || emp.designation === 'CEO';
    const initialPhoneCode = emp.phone?.startsWith('+') 
      ? (COUNTRY_CODES.find(c => emp.phone?.startsWith(c.dialCode))?.dialCode || '+91')
      : '+91';
    const initialEmCode = emp.emergencyContact?.mobile?.startsWith('+')
      ? (COUNTRY_CODES.find(c => emp.emergencyContact?.mobile?.startsWith(c.dialCode))?.dialCode || '+91')
      : '+91';
    const initialAltEmCode = emp.emergencyContact?.alternateMobile?.startsWith('+')
      ? (COUNTRY_CODES.find(c => emp.emergencyContact?.alternateMobile?.startsWith(c.dialCode))?.dialCode || '+91')
      : '+91';

    return {
      // 1. Personal Details
      firstName: emp.firstName || '',
      lastName: emp.lastName || '',
      employeeId: emp.employeeId || emp.id || '',
      gender: (emp.gender || 'Male') as 'Male' | 'Female' | 'Other',
      dob: emp.dob || '1996-05-15',
      phone: extractLocalDigits(emp.phone, initialPhoneCode),
      personalEmail: emp.personalEmail || emp.email || '',
      maritalStatus: (emp.maritalStatus || 'Single') as 'Single' | 'Married' | 'Divorced' | 'Widowed',
      avatar: emp.avatar || '',

      // 2. Employment & Organization
      joiningDate: emp.joiningDate || new Date().toISOString().split('T')[0],
      department: emp.department || (isEmpCEO ? 'CEO' : (departments[0]?.name || 'HR')),
      designation: emp.designation || (isEmpCEO ? 'CEO' : (designations[0]?.title || 'HR Manager')),
      employmentType: emp.employmentType || defaultEmploymentType,
      reportingManagerId: isEmpCEO ? '' : (emp.reportingManagerId || employees[0]?.employeeId || 'EMP-001'),
      reportingManagerName: isEmpCEO ? 'Self / Board of Directors' : (emp.reportingManagerName || (employees[0] ? `${employees[0].firstName} ${employees[0].lastName}`.trim() : 'Executive Office')),
      workLocation: emp.workLocation || defaultWorkLocation,
      status: (emp.status || 'Active') as Employee['status'],

      // 3. Address & Emergency Contacts
      currentLine1: emp.currentAddress?.line1 || (typeof emp.address === 'string' ? emp.address.split(',')[0] || '' : ''),
      currentLine2: emp.currentAddress?.line2 || '',
      currentCity: emp.currentAddress?.city || 'Chennai',
      currentState: emp.currentAddress?.state || 'Tamil Nadu',
      currentCountry: emp.currentAddress?.country || 'India',
      currentPincode: emp.currentAddress?.pincode || '600001',
      sameAsCurrent: emp.permanentAddress?.sameAsCurrent ?? true,
      permanentLine1: emp.permanentAddress?.line1 || emp.currentAddress?.line1 || '',
      permanentLine2: emp.permanentAddress?.line2 || emp.currentAddress?.line2 || '',
      permanentCity: emp.permanentAddress?.city || emp.currentAddress?.city || 'Chennai',
      permanentState: emp.permanentAddress?.state || emp.currentAddress?.state || 'Tamil Nadu',
      permanentCountry: emp.permanentAddress?.country || emp.currentAddress?.country || 'India',
      permanentPincode: emp.permanentAddress?.pincode || emp.currentAddress?.pincode || '600001',
      emergencyName: emp.emergencyContact?.name || '',
      emergencyRelationship: emp.emergencyContact?.relationship || 'Parent',
      emergencyMobile: extractLocalDigits(emp.emergencyContact?.mobile, initialEmCode),
      emergencyAltMobile: extractLocalDigits(emp.emergencyContact?.alternateMobile, initialAltEmCode),

      // 4. Educational Details
      qualification: normalizeQualification(emp.educationalDetails?.highestQualification || emp.professionalDetails?.qualification),
      degreeName: emp.educationalDetails?.degreeName || 'B.E / B.Tech (Engineering / Technology)',
      specialization: emp.educationalDetails?.specialization || emp.professionalDetails?.specialization || 'Structural Engineering',
      university: emp.educationalDetails?.university || 'Anna University',
      yearOfPassing: emp.educationalDetails?.yearOfPassing || '2023',
      gradePercentage: emp.educationalDetails?.gradePercentage || '8.4 CGPA',

      // 5. Work Experience & Skills
      experienceType: (emp.experienceDetails?.experienceType || 'Experienced') as 'Fresher' | 'Experienced',
      totalExperience: isEmpCEO ? (emp.experienceDetails?.totalExperience || 'Executive Leadership') : (emp.experienceDetails?.totalExperience || emp.professionalDetails?.totalExperience || '3 Years'),
      relevantExperience: isEmpCEO ? 'Executive Leadership' : (emp.professionalDetails?.relevantExperience || '3 Years'),
      previousCompany: isEmpCEO ? (emp.experienceDetails?.previousCompany || 'N/A') : (emp.experienceDetails?.previousCompany || emp.professionalDetails?.previousCompany || 'L&T Construction'),
      previousDesignation: isEmpCEO ? (emp.experienceDetails?.previousDesignation || 'Director / Executive') : (emp.experienceDetails?.previousDesignation || 'Project Engineer'),
      previousDepartment: isEmpCEO ? (emp.experienceDetails?.previousDepartment || 'Executive') : (emp.experienceDetails?.previousDepartment || 'Civil & Structural'),
      expStartDate: isEmpCEO ? '' : (emp.experienceDetails?.startDate || '2023-06-01'),
      expEndDate: isEmpCEO ? '' : (emp.experienceDetails?.endDate || '2026-08-31'),
      lastDrawnSalary: isEmpCEO ? 'Exempt' : (emp.experienceDetails?.lastDrawnSalary || '₹45,000 / month'),
      previousCompanyLocation: isEmpCEO ? 'N/A' : (emp.experienceDetails?.companyLocation || 'Chennai, Tamil Nadu'),
      skills: Array.isArray(emp.professionalDetails?.skills) 
        ? emp.professionalDetails.skills.join(', ') 
        : (emp.skills ? emp.skills.join(', ') : (isEmpCEO ? 'Enterprise Strategy, Executive Leadership, Corporate Governance' : 'Civil Engineering, AutoCAD, Project Management, Quality Control')),

      // 6. Salary & Bank Details
      salaryStructure: isEmpCEO ? 'Exempt (CEO)' : (emp.salaryDetails?.salaryStructure || 'Standard Industrial CTC'),
      salaryScheme: (emp.salaryDetails?.salaryScheme || (emp.withPf ? 'WITH_PF' : 'WITHOUT_PF')) as 'WITH_PF' | 'WITHOUT_PF',
      withPf: isEmpCEO ? false : Boolean(emp.withPf ?? emp.salaryDetails?.withPf),
      monthlyCtc: isEmpCEO ? (emp.salaryDetails?.monthlyCtc ?? 0) : Number(emp.salaryDetails?.monthlyCtc || (emp.basicSalary ? emp.basicSalary * 2.5 : 25000)),
      basicSalary: isEmpCEO ? (emp.salaryDetails?.basicSalary ?? 0) : Number(emp.salaryDetails?.basicSalary || emp.basicSalary || 10000),
      da: isEmpCEO ? (emp.salaryDetails?.da ?? 0) : Number(emp.salaryDetails?.da ?? emp.allowances?.da ?? 5000),
      conveyance: isEmpCEO ? (emp.salaryDetails?.conveyance ?? 0) : Number(emp.salaryDetails?.conveyance ?? emp.allowances?.conveyance ?? 1250),
      hra: isEmpCEO ? (emp.salaryDetails?.hra ?? 0) : Number(emp.salaryDetails?.hra ?? emp.allowances?.hra ?? 8750),
      transport: Number(emp.allowances?.transport || 0),
      medical: Number(emp.allowances?.medical || 0),
      special: Number(emp.allowances?.special || 0),
      customComponents: ((emp.allowances as any) || {}) as Record<string, number>,
      panNumber: emp.salaryDetails?.panNumber || (isEmpCEO ? '' : 'ABCDE1234F'),
      uanNumber: emp.salaryDetails?.uanNumber || (isEmpCEO ? '' : '101492817261'),
      bankName: emp.bankDetails?.bankName || (isEmpCEO ? '' : 'HDFC Bank'),
      accountNumber: emp.bankDetails?.accountNumber || (isEmpCEO ? '' : '50100492817261'),
      ifscCode: emp.bankDetails?.ifscCode || (isEmpCEO ? '' : 'HDFC0001234'),
      branch: emp.bankDetails?.branch || (isEmpCEO ? '' : 'Mount Road Branch'),

      // 7. Shift & Attendance Policies
      attendanceMethod: (isEmpCEO ? 'Exempt' : (emp.attendanceMethod || 'Face Scan')) as Employee['attendanceMethod'],
      shift: isEmpCEO ? 'Exempt' : (emp.workShift || emp.shiftDetails?.shiftType || shifts[0]?.shiftName || ''),
      weeklyOff: isEmpCEO ? 'Flexible' : (emp.shiftDetails?.weeklyOff || 'Sunday'),
      holidayCalendar: emp.shiftDetails?.holidayCalendar || 'Tamil Nadu Industrial Calendar (14 Days)',
      leavePolicy: isEmpCEO ? 'Exempt' : (emp.shiftDetails?.leavePolicy || 'Standard 18 Casual + 12 Medical + 10 Earned'),
      gpsAllowed: Boolean(emp.gpsAllowed ?? true),

      // 8. Documents
      documents: emp.documents && emp.documents.length > 0 ? emp.documents : (isEmpCEO ? [] : [
        { name: '10th_Marksheet_SSLC.pdf', type: 'PDF', uploadDate: '2026-09-04', url: '#' },
        { name: '12th_Diploma_Certificate.pdf', type: 'PDF', uploadDate: '2026-09-04', url: '#' },
        { name: 'Degree_Certificate_Civil.pdf', type: 'PDF', uploadDate: '2026-09-04', url: '#' },
        { name: 'PAN_Card_Verified.pdf', type: 'PDF', uploadDate: '2026-09-04', url: '#' },
        { name: 'Aadhaar_Card_Front_Back.pdf', type: 'PDF', uploadDate: '2026-09-04', url: '#' }
      ]),

      // 9. System Access & Security
      officialUsername: (emp as any).officialUsername || emp.employeeId || emp.id,
      role: (isEmpCEO ? 'CEO' : (emp.systemAccess?.role || emp.role || 'Employee')) as Role,
      accountStatus: ((emp.accountStatus as any) || (emp.status === 'Terminated' || emp.status === 'Inactive' ? 'DEACTIVATED' : 'ACTIVE')) as 'ACTIVE' | 'DEACTIVATED' | 'DISABLED',
      password: (emp as any).password || emp.password || 'Password@123',
      mustChangePassword: Boolean(emp.mustChangePassword ?? false),
      credentialEmailStatus: emp.credentialEmailStatus || 'SENT',
      credentialEmailSentAt: emp.credentialEmailSentAt || '14 Sep 2026, 09:15 AM'
    };
  };

  const [formData, setFormData] = useState(getInitialFormData(currentEmp));
  const [salaryInputDrafts, setSalaryInputDrafts] = useState<Record<string, string>>({});
  const [isCustomDegree, setIsCustomDegree] = useState<boolean>(() => {
    const d = currentEmp.educationalDetails?.degreeName;
    return Boolean(d && !ALL_DEGREE_OPTIONS.includes(d));
  });

  const salaryInputValue = (key: string, value: number) => (
    Object.prototype.hasOwnProperty.call(salaryInputDrafts, key) ? salaryInputDrafts[key] : value
  );

  const parseSalaryLikeNumber = (value: string): number | null => {
    const match = value.replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/);
    return match ? Number(match[0]) : null;
  };

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

  // Sync permanent address when sameAsCurrent changes
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

  // Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle Form Change
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
  };

  const handleQualificationChange = (newQual: string) => {
    setIsCustomDegree(false);
    const defaultDeg = DEGREE_OPTIONS_BY_QUALIFICATION[newQual]?.[0] || 'B.E / B.Tech (Engineering / Technology)';
    handleChange('qualification', newQual);
    handleChange('degreeName', defaultDeg);
  };

  // CTC Auto-breakdown helper
  const handleCtcChange = (rawValue: string) => {
    setSalaryDraft('monthlyCtc', rawValue);
    const ctcVal = rawValue === '' ? 0 : Number(rawValue);
    const ctc = Math.max(0, ctcVal);
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

  // Component direct adjustment
  const handleSalaryComponentChange = (field: 'basicSalary' | 'da' | 'conveyance' | 'hra', rawValue: string) => {
    setSalaryDraft(field, rawValue);
    const val = rawValue === '' ? 0 : Number(rawValue);
    const num = Math.max(0, val);
    setFormData(prev => {
      const updated = { ...prev, [field]: num };
      const total = updated.basicSalary + updated.da + updated.conveyance + updated.hra;
      return {
        ...updated,
        monthlyCtc: total
      };
    });
  };

  const configuredSalaryBreakdown = useMemo(() => {
    return calculateSalaryBreakdown(formData.monthlyCtc || 0, activeEarnings);
  }, [formData.monthlyCtc, activeEarnings]);

  const salaryComponentValues = useMemo(() => {
    if (activeEarnings.length === 0) {
      return {
        basicSalary: formData.basicSalary || 0,
        da: formData.da || 0,
        conveyance: formData.conveyance || 0,
        hra: formData.hra || 0,
        customComponents: formData.customComponents || {},
        grossSalary: formData.monthlyCtc || 0
      };
    }

    return {
      basicSalary: configuredSalaryBreakdown.basicSalary,
      da: configuredSalaryBreakdown.da,
      conveyance: configuredSalaryBreakdown.conveyance,
      hra: configuredSalaryBreakdown.hra,
      customComponents: configuredSalaryBreakdown.customComponents,
      grossSalary: configuredSalaryBreakdown.grossSalary
    };
  }, [activeEarnings.length, configuredSalaryBreakdown, formData]);

  // Dynamic statutory and configured deduction calculations (from Settings)
  const statutoryCalc = useMemo(() => {
    const basic = salaryComponentValues.basicSalary || 0;
    const da = salaryComponentValues.da || 0;
    const conv = salaryComponentValues.conveyance || 0;
    const hra = salaryComponentValues.hra || 0;
    const ctc = formData.monthlyCtc || 0;

    const gross = activeEarnings.length > 0
      ? salaryComponentValues.grossSalary
      : ctc;

    const formulaContext = buildPayrollFormulaContext({
      basic,
      da,
      conveyance: conv,
      hra,
      gross,
      ctc,
      customContext: salaryComponentValues.customComponents || {}
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
  }, [formData.monthlyCtc, formData.salaryScheme, payrollSettingsConfig, activeEarnings, activeDeductions, salaryComponentValues]);

  const isSalaryExemptRole =
    formData.role === 'CEO' ||
    formData.department === 'CEO' ||
    formData.designation === 'CEO' ||
    currentEmp.role === 'CEO' ||
    currentEmp.department === 'CEO';
  const esicLimit = payrollSettingsConfig?.esicPolicy?.grossSalaryLimit || 21000;
  const schemePillLabel = isSalaryExemptRole
    ? 'OWNER / SALARY EXEMPT'
    : formData.salaryScheme === 'WITH_PF'
      ? statutoryCalc.isEsicExempt
        ? `PF ENROLLED / ESIC EXEMPT (> ${formatCurrency(esicLimit)})`
        : 'PF & ESIC ENROLLED'
      : 'WITHOUT PF & ESIC';
  const schemeDisplayLabel = formData.salaryScheme === 'WITH_PF'
    ? statutoryCalc.isEsicExempt
      ? `Statutory PF Active / ESIC Exempt (Gross > ${formatCurrency(esicLimit)})`
      : 'Statutory PF & ESIC Scheme (Active)'
    : 'Without PF & ESIC (Exempt Scheme)';
  const deductionsSchemeLabel = formData.salaryScheme === 'WITH_PF'
    ? statutoryCalc.isEsicExempt
      ? 'PF Enrolled / ESIC Exempt'
      : 'PF & ESIC Enrolled'
    : 'Exempt Scheme';

  // Avatar upload
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        handleChange('avatar', result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddDocument = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1 * 1024 * 1024) {
      alert(`Document "${file.name}" exceeds the maximum allowed size of 1 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please upload a file up to 1 MB.`);
      return;
    }

    const sizeInKb = Math.round(file.size / 1024);
    const sizeFormatted = sizeInKb > 1024 ? `${(sizeInKb / 1024).toFixed(1)} MB` : `${sizeInKb} KB`;

    const newDoc = {
      name: file.name,
      type: file.name.split('.').pop()?.toUpperCase() || 'FILE',
      uploadDate: new Date().toISOString().split('T')[0],
      url: '#'
    };

    setFormData(prev => ({
      ...prev,
      documents: [...prev.documents, newDoc]
    }));
  };

  const handleRemoveDocument = (index: number) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.filter((_, idx) => idx !== index)
    }));
  };

  // Copy helper
  const handleCopy = (text: string, fieldKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 1800);
  };

  // Save changes
  const handleSaveChanges = () => {
    // Validate First Name
    const cleanFname = (formData.firstName || '').trim();
    if (!cleanFname) {
      alert('First Name is required.');
      return;
    }
    if (cleanFname.length < 2) {
      alert('First Name must be at least 2 characters.');
      return;
    }
    if (cleanFname.length > 15) {
      alert('First Name cannot exceed 15 characters.');
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(cleanFname)) {
      alert('First Name must contain letters and spaces only. Numbers and invalid symbols are not allowed.');
      return;
    }
    if (/(.)\1{3,}/i.test(cleanFname)) {
      alert('First Name contains invalid repetitive characters.');
      return;
    }
    if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(cleanFname.replace(/[\s.'-]/g, ''))) {
      alert('Please enter a realistic First Name.');
      return;
    }

    // Validate Last Name
    const cleanLname = (formData.lastName || '').trim();
    if (cleanLname) {
      if (cleanLname.length > 15) {
        alert('Last Name cannot exceed 15 characters.');
        return;
      }
      if (!/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(cleanLname)) {
        alert('Last Name must contain letters and spaces only.');
        return;
      }
      if (/(.)\1{3,}/i.test(cleanLname)) {
        alert('Last Name contains invalid repetitive characters.');
        return;
      }
      if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(cleanLname.replace(/[\s.'-]/g, ''))) {
        alert('Please enter a realistic Last Name.');
        return;
      }
    }

    // Validate Phone
    const cleanPhone = extractLocalDigits(formData.phone, profilePhoneCountryCode);
    if (cleanPhone) {
      if (profilePhoneCountryCode === '+91') {
        if (cleanPhone.length !== 10) {
          alert('Phone number must contain exactly 10 digits.');
          return;
        }
        if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
          alert('Phone number must contain exactly 10 digits starting with 6, 7, 8, or 9.');
          return;
        }
        if (/^(\d)\1{9}$/.test(cleanPhone)) {
          alert('Please enter a realistic mobile phone number.');
          return;
        }
      } else {
        if (cleanPhone.length < 6 || cleanPhone.length > 15) {
          alert('International phone number must contain between 6 and 15 digits.');
          return;
        }
      }
    }

    // Validate Emergency Numbers
    const cleanEmergencyMobile = extractLocalDigits(formData.emergencyMobile, profileEmergencyCountryCode);
    if (cleanEmergencyMobile) {
      if (profileEmergencyCountryCode === '+91') {
        if (cleanEmergencyMobile.length !== 10) {
          alert('Emergency Contact Number must contain exactly 10 digits.');
          return;
        }
        if (!/^[6-9]\d{9}$/.test(cleanEmergencyMobile)) {
          alert('Emergency Contact Number must contain exactly 10 digits starting with 6, 7, 8, or 9.');
          return;
        }
      } else {
        if (cleanEmergencyMobile.length < 6 || cleanEmergencyMobile.length > 15) {
          alert('Emergency Contact Number must contain between 6 and 15 digits.');
          return;
        }
      }
    }
    const cleanEmergencyAltMobile = extractLocalDigits(formData.emergencyAltMobile, profileAltEmergencyCountryCode);
    if (cleanEmergencyAltMobile) {
      if (profileAltEmergencyCountryCode === '+91') {
        if (cleanEmergencyAltMobile.length !== 10) {
          alert('Alternate Emergency Number must contain exactly 10 digits.');
          return;
        }
        if (!/^[6-9]\d{9}$/.test(cleanEmergencyAltMobile)) {
          alert('Alternate Emergency Number must contain exactly 10 digits starting with 6, 7, 8, or 9.');
          return;
        }
      } else {
        if (cleanEmergencyAltMobile.length < 6 || cleanEmergencyAltMobile.length > 15) {
          alert('Alternate Emergency Number must contain between 6 and 15 digits.');
          return;
        }
      }
    }

    // Validate Basic Salary
    if (formData.basicSalary !== undefined && Number(formData.basicSalary) < 0) {
      alert('Basic salary cannot be negative.');
      return;
    }

    if (formData.dob) {
      const birthDate = new Date(formData.dob);
      const today = new Date();
      const ageInYears = (today.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (ageInYears < 18) {
        alert('Employee must be at least 18 years of age (Date of Birth indicates under 18).');
        return;
      }
    }

    if (formData.currentCity && !/^[a-zA-Z\s]+$/.test(formData.currentCity.trim())) {
      alert('City must contain letters and spaces only.');
      return;
    }
    if (formData.currentState && !/^[a-zA-Z\s]+$/.test(formData.currentState.trim())) {
      alert('State must contain letters and spaces only.');
      return;
    }
    if (formData.currentCountry && !/^[a-zA-Z\s]+$/.test(formData.currentCountry.trim())) {
      alert('Country must contain letters and spaces only.');
      return;
    }
    if (formData.currentPincode && !/^[0-9]{6}$/.test(formData.currentPincode.trim())) {
      alert('Pincode must be exactly 6 digits.');
      return;
    }
    if (!formData.sameAsCurrent) {
      if (formData.permanentCity && !/^[a-zA-Z\s]+$/.test(formData.permanentCity.trim())) {
        alert('Permanent City must contain letters and spaces only.');
        return;
      }
      if (formData.permanentPincode && !/^[0-9]{6}$/.test(formData.permanentPincode.trim())) {
        alert('Permanent Pincode must be exactly 6 digits.');
        return;
      }
    }
    if (formData.university && !/^[a-zA-Z\s&.\-]+$/.test(formData.university.trim())) {
      alert('University must contain valid characters (letters and spaces only).');
      return;
    }
    if (formData.gradePercentage) {
      const gp = parseFloat(formData.gradePercentage);
      if (isNaN(gp) || gp < 0 || gp > 100) {
        alert('Grade / Percentage must be a valid number between 0 and 100.');
        return;
      }
    }
    if (formData.totalExperience) {
      const exp = parseFloat(formData.totalExperience);
      if (isNaN(exp) || exp < 0) {
        alert('Total experience must be a non-negative number.');
        return;
      }
    }
    if (formData.expStartDate && formData.expEndDate) {
      if (new Date(formData.expEndDate) < new Date(formData.expStartDate)) {
        alert('Employment end date cannot be earlier than start date.');
        return;
      }
    }
    if (formData.lastDrawnSalary?.trim()) {
      const sal = parseSalaryLikeNumber(formData.lastDrawnSalary);
      if (sal !== null && (!Number.isFinite(sal) || sal <= 0)) {
        alert('Last drawn salary must be a positive number.');
        return;
      }
    }
    if (formData.bankName && !/[a-zA-Z]/.test(formData.bankName.trim())) {
      alert('Bank name must contain letters and cannot be numeric-only.');
      return;
    }
    if (formData.accountNumber && !/^[0-9]{9,18}$/.test(formData.accountNumber.trim())) {
      alert('Account number must be between 9 and 18 digits.');
      return;
    }
    if (formData.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifscCode.trim().toUpperCase())) {
      alert('Invalid IFSC format.');
      return;
    }
    if (formData.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formData.panNumber.trim().toUpperCase())) {
      alert('Invalid PAN format.');
      return;
    }
    if (formData.uanNumber && !/^[0-9]{12}$/.test(formData.uanNumber.trim())) {
      alert('UAN must be exactly 12 digits.');
      return;
    }

    const cleanEmail = (formData.personalEmail || '').trim().toLowerCase();
    if (!cleanEmail) {
      alert('Email ID is required.');
      return;
    }
    const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    if (!emailRegex.test(cleanEmail) || /\s/.test(formData.personalEmail)) {
      alert('Please enter a valid email ID.');
      return;
    }
    const isDuplicateEmail = employees.some(
      e => e.id !== currentEmp.id && e.employeeId !== currentEmp.employeeId && e.email?.toLowerCase().trim() === cleanEmail
    );
    if (isDuplicateEmail) {
      alert('Email ID already exists.');
      return;
    }

    const updatedData: Partial<Employee> = {
      firstName: cleanFname,
      lastName: cleanLname,
      phone: cleanPhone ? (profilePhoneCountryCode === '+91' ? cleanPhone : `${profilePhoneCountryCode} ${cleanPhone}`) : '',
      personalEmail: cleanEmail,
      email: cleanEmail,
      gender: formData.gender,
      dob: formData.dob,
      maritalStatus: formData.maritalStatus,
      avatar: formData.avatar,

      joiningDate: formData.joiningDate,
      department: formData.department,
      designation: formData.designation,
      employmentType: formData.employmentType,
      reportingManagerId: formData.reportingManagerId,
      reportingManagerName: formData.reportingManagerName,
      workLocation: formData.workLocation,
      status: formData.status,

      address: `${formData.currentLine1}, ${formData.currentCity}, ${formData.currentState} - ${formData.currentPincode}`,
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
        line1: formData.sameAsCurrent ? formData.currentLine1 : formData.permanentLine1,
        line2: formData.sameAsCurrent ? formData.currentLine2 : formData.permanentLine2,
        city: formData.sameAsCurrent ? formData.currentCity : formData.permanentCity,
        state: formData.sameAsCurrent ? formData.currentState : formData.permanentState,
        country: formData.sameAsCurrent ? formData.currentCountry : formData.permanentCountry,
        pincode: formData.sameAsCurrent ? formData.currentPincode : formData.permanentPincode
      },
      emergencyContact: {
        name: formData.emergencyName,
        relationship: formData.emergencyRelationship,
        mobile: cleanEmergencyMobile ? (profileEmergencyCountryCode === '+91' ? cleanEmergencyMobile : `${profileEmergencyCountryCode} ${cleanEmergencyMobile}`) : '',
        alternateMobile: cleanEmergencyAltMobile ? (profileAltEmergencyCountryCode === '+91' ? cleanEmergencyAltMobile : `${profileAltEmergencyCountryCode} ${cleanEmergencyAltMobile}`) : ''
      },

      educationalDetails: {
        highestQualification: formData.qualification,
        degreeName: formData.degreeName,
        specialization: formData.specialization,
        university: formData.university,
        yearOfPassing: formData.yearOfPassing,
        gradePercentage: formData.gradePercentage
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
        companyLocation: formData.previousCompanyLocation
      },
      professionalDetails: {
        previousCompany: formData.previousCompany,
        totalExperience: formData.totalExperience,
        relevantExperience: formData.relevantExperience,
        skills: formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean),
        qualification: formData.qualification,
        specialization: formData.specialization
      },

      basicSalary: Number(salaryComponentValues.basicSalary),
      withPf: formData.withPf,
      allowances: {
        hra: Number(salaryComponentValues.hra),
        da: Number(salaryComponentValues.da),
        conveyance: Number(salaryComponentValues.conveyance),
        transport: Number(formData.transport || 0),
        medical: Number(formData.medical || 0),
        special: Number(formData.special || 0),
        ...(salaryComponentValues.customComponents || {})
      },
      salaryDetails: {
        salaryStructure: formData.salaryStructure,
        salaryScheme: formData.salaryScheme,
        withPf: formData.withPf,
        monthlyCtc: Number(formData.monthlyCtc),
        basicSalary: Number(salaryComponentValues.basicSalary),
        da: Number(salaryComponentValues.da),
        conveyance: Number(salaryComponentValues.conveyance),
        hra: Number(salaryComponentValues.hra),
        panNumber: formData.panNumber,
        uanNumber: formData.uanNumber,
        ...(salaryComponentValues.customComponents || {})
      },
      bankDetails: {
        bankName: formData.bankName,
        accountNumber: formData.accountNumber,
        ifscCode: formData.ifscCode,
        branch: formData.branch
      },

      attendanceMethod: formData.attendanceMethod,
      workShift: formData.shift,
      gpsAllowed: formData.gpsAllowed,
      shiftDetails: {
        shiftType: formData.shift,
        weeklyOff: formData.weeklyOff,
        holidayCalendar: formData.holidayCalendar,
        leavePolicy: formData.leavePolicy
      },

      documents: formData.documents,
      accountStatus: formData.accountStatus,
      password: formData.password,
      mustChangePassword: formData.mustChangePassword,
      systemAccess: {
        role: formData.role,
        status: (formData.accountStatus === 'ACTIVE' ? 'Active' : 'Inactive') as 'Active' | 'Inactive',
        permissions: (formData.role === 'CEO' || formData.department === 'CEO' || formData.designation === 'CEO')
          ? ['Dashboard', 'Employees', 'Attendance', 'Leaves', 'Payroll', 'Projects', 'Recruitment', 'Performance', 'Reports', 'Settings', 'CEO', 'All']
          : (currentEmp.systemAccess?.permissions || ['Dashboard', 'Attendance', 'Leaves', 'Tasks']),
        sendInvite: false
      }
    };

    updateEmployee(currentEmp.id || currentEmp.employeeId, updatedData);
    setCurrentEmp(prev => ({ ...prev, ...updatedData }));
    setFormData(prev => ({
      ...prev,
      firstName: cleanFname,
      lastName: cleanLname,
      personalEmail: cleanEmail,
      phone: cleanPhone ? (profilePhoneCountryCode === '+91' ? cleanPhone : `${profilePhoneCountryCode} ${cleanPhone}`) : prev.phone
    }));
    setIsEditing(false);
    setSalaryInputDrafts({});
    setSaveNotice('Employee onboarding details and salary updated successfully.');
    setTimeout(() => setSaveNotice(null), 5000);
  };

  const handleCancelEditing = () => {
    setFormData(getInitialFormData(currentEmp));
    setSalaryInputDrafts({});
    const d = currentEmp.educationalDetails?.degreeName;
    setIsCustomDegree(Boolean(d && !ALL_DEGREE_OPTIONS.includes(d)));
    setIsEditing(false);
  };

  // Reset Credentials Action
  const handleConfirmResetLogin = async () => {
    setIsProcessingAction(true);
    try {
      const res = resetEmployeeLogin(currentEmp.employeeId || currentEmp.id);
      if (res && res.success) {
        const tempPass = res.temporaryPassword || currentEmp.password || '';
        const destEmail = (currentEmp.personalEmail || currentEmp.email).toLowerCase();
        
        await dispatchCredentialEmail({
          to: destEmail,
          employeeName: `${currentEmp.firstName} ${currentEmp.lastName}`.trim(),
          employeeCode: currentEmp.employeeId || currentEmp.id,
          password: tempPass,
          department: currentEmp.department,
          designation: currentEmp.designation,
          loginUrl: `${window.location.origin}/login`
        });

        setFormData(prev => ({
          ...prev,
          password: tempPass,
          mustChangePassword: true,
          credentialEmailStatus: 'SENT',
          credentialEmailSentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', Today'
        }));
        setCurrentEmp(prev => ({
          ...prev,
          password: tempPass,
          mustChangePassword: true,
          credentialEmailStatus: 'SENT',
          credentialEmailSentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', Today'
        }));
        setSaveNotice(`Login credentials reset successfully. User ID: ${currentEmp.employeeId || currentEmp.id} | Password: ${tempPass} (Dispatched to ${destEmail})`);
      }
    } catch (err) {
      console.error(err);
      setSaveNotice('Failed to reset credentials.');
    } finally {
      setIsProcessingAction(false);
      setShowResetConfirmModal(false);
      setTimeout(() => setSaveNotice(null), 6000);
    }
  };

  // Toggle Login Account Status (Activate vs Deactivate)
  const handleConfirmStatusToggle = async () => {
    setIsProcessingAction(true);
    try {
      const isDeactivating = statusToSet === 'DEACTIVATED' || statusToSet === 'DISABLED';
      const normStatus: 'ACTIVE' | 'DEACTIVATED' = isDeactivating ? 'DEACTIVATED' : 'ACTIVE';
      const res = updateEmployeeLoginStatus(currentEmp.employeeId || currentEmp.id, normStatus);
      if (res && res.success) {
        const nextStatus: Employee['status'] = isDeactivating ? 'Inactive' : 'Active';
        setFormData(prev => ({
          ...prev,
          accountStatus: normStatus,
          status: nextStatus
        }));
        setCurrentEmp(prev => ({
          ...prev,
          accountStatus: normStatus,
          status: nextStatus
        }));
        setSaveNotice(`Employee portal login access has been successfully ${isDeactivating ? 'deactivated' : 'activated'}.`);
      } else if (res && !res.success) {
        setSaveNotice(res.message || 'Failed to update account status.');
      }
    } catch (err) {
      console.error(err);
      setSaveNotice('Failed to update account status.');
    } finally {
      setIsProcessingAction(false);
      setShowStatusConfirmModal(false);
      setTimeout(() => setSaveNotice(null), 6000);
    }
  };

  // Avatar Renderer
  const renderAvatar = () => {
    const avatarSrc = isEditing ? formData.avatar : currentEmp.avatar;
    const isValidUrl = Boolean(
      avatarSrc && 
      (avatarSrc.startsWith('http') || avatarSrc.startsWith('/') || avatarSrc.startsWith('data:image'))
    );
    const initials = `${formData.firstName?.[0] || ''}${formData.lastName?.[0] || ''}`.toUpperCase() || 'EM';

    return (
      <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
        {isValidUrl && !imgError ? (
          <img 
            src={avatarSrc} 
            alt={`${formData.firstName} ${formData.lastName}`} 
            onError={() => setImgError(true)}
            style={{ 
              width: '46px', 
              height: '46px', 
              borderRadius: '13px', 
              border: '2px solid rgba(14, 116, 144, 0.6)', 
              objectFit: 'cover',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25), 0 0 0 2px rgba(14, 116, 144, 0.2)',
              display: 'block'
            }} 
          />
        ) : (
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '13px',
            background: 'linear-gradient(135deg, #0891B2 0%, #0E7490 60%, #164E63 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.05rem',
            fontWeight: 800,
            letterSpacing: '0.02em',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25), 0 0 0 2px rgba(14, 116, 144, 0.2)',
            fontFamily: "'Plus Jakarta Sans', sans-serif"
          }}>
            {initials}
          </div>
        )}

        {isEditing && (
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            title="Upload Photo"
            style={{
              position: 'absolute',
              bottom: '-3px',
              right: '-3px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#0E7490',
              border: '2px solid #FFFFFF',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
            }}
          >
            <Camera size={10} />
          </button>
        )}
        <input 
          type="file" 
          ref={avatarInputRef} 
          onChange={handleAvatarUpload} 
          accept="image/*" 
          style={{ display: 'none' }} 
        />
      </div>
    );
  };



  // Helper styles
  const cardStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    border: '1px solid #E2E8F0',
    padding: '24px 28px',
    boxShadow: '0 2px 10px -2px rgba(15, 23, 42, 0.04)',
    marginBottom: '24px'
  };

  const cardHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '16px',
    marginBottom: '20px',
    borderBottom: '1px solid #F1F5F9',
    flexWrap: 'wrap',
    gap: '12px'
  };

  const sectionBadgeStyle: React.CSSProperties = {
    fontSize: '1.05rem',
    fontWeight: 800,
    color: '#000000',
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    fontWeight: 800,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  };

  const viewValueStyle: React.CSSProperties = {
    fontSize: '0.94rem',
    fontWeight: 700,
    color: '#0F172A',
    wordBreak: 'break-word',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 13px',
    borderRadius: '10px',
    border: '1px solid #CBD5E1',
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
    fontSize: '0.88rem',
    fontWeight: 600,
    outline: 'none',
    transition: 'all 0.15s ease'
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer'
  };

  // ---------------------------------------------------------------------------
  // SECTION RENDERERS (Clean, Standard Software UI, No AI Watermarks)
  // ---------------------------------------------------------------------------

  // SECTION 1: Personal Information
  const renderPersonalSection = () => (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={sectionBadgeStyle}>01</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              Personal Information
            </h3>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
            Basic demographic identity, contact channels, and civil status
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px' }}>
        {/* First Name */}
        <div>
          <label style={labelStyle}>First Name</label>
          {isEditing ? (
            <input 
              type="text" 
              maxLength={15}
              value={formData.firstName} 
              onChange={(e) => handleChange('firstName', e.target.value)} 
              onKeyDown={(e) => {
                if (e.key.length === 1 && !/^[a-zA-Z\s.'-]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                }
              }}
              style={inputStyle} 
              placeholder="First name"
            />
          ) : (
            <div style={viewValueStyle}>{currentEmp.firstName || '—'}</div>
          )}
        </div>

        {/* Last Name */}
        <div>
          <label style={labelStyle}>Last Name</label>
          {isEditing ? (
            <input 
              type="text" 
              maxLength={15}
              value={formData.lastName} 
              onChange={(e) => handleChange('lastName', e.target.value)} 
              onKeyDown={(e) => {
                if (e.key.length === 1 && !/^[a-zA-Z\s.'-]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                }
              }}
              style={inputStyle} 
              placeholder="Last name"
            />
          ) : (
            <div style={viewValueStyle}>{currentEmp.lastName || '—'}</div>
          )}
        </div>

        {/* Employee ID */}
        <div>
          <label style={labelStyle}>Employee ID</label>
          <div style={{ ...viewValueStyle, color: '#0E7490', fontFamily: 'monospace', fontWeight: 800 }}>
            {formData.employeeId}
            <button
              type="button"
              onClick={() => handleCopy(formData.employeeId, 'empId')}
              title="Copy ID"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '2px' }}
            >
              {copiedField === 'empId' ? <Check size={14} color="#059669" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Gender */}
        <div>
          <label style={labelStyle}>Gender</label>
          {isEditing ? (
            <select 
              value={formData.gender} 
              onChange={(e) => handleChange('gender', e.target.value)} 
              style={selectStyle}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          ) : (
            <div style={viewValueStyle}>{currentEmp.gender || '—'}</div>
          )}
        </div>

        {/* Date of Birth */}
        <div>
          <label style={labelStyle}>Date of Birth</label>
          {isEditing ? (
            <div>
              <input 
                type="date" 
                value={formData.dob} 
                onChange={(e) => handleChange('dob', e.target.value)} 
                max={maxDobDate}
                style={inputStyle} 
              />
            </div>
          ) : (
            <div style={viewValueStyle}>
              {currentEmp.dob ? formatDateDDMMYYYY(currentEmp.dob) : '—'}
            </div>
          )}
        </div>

        {/* Marital Status */}
        <div>
          <label style={labelStyle}>Marital Status</label>
          {isEditing ? (
            <select 
              value={formData.maritalStatus} 
              onChange={(e) => handleChange('maritalStatus', e.target.value)} 
              style={selectStyle}
            >
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
              <option value="Widowed">Widowed</option>
            </select>
          ) : (
            <div style={viewValueStyle}>{currentEmp.maritalStatus || '—'}</div>
          )}
        </div>

        {/* Primary Mobile Phone */}
        <div>
          <label style={labelStyle}>Primary Phone</label>
          {isEditing ? (
            <div style={{ display: 'flex', alignItems: 'stretch', position: 'relative' }}>
              <CountryCodeDropdown
                value={profilePhoneCountryCode}
                onChange={(dialCode) => setProfilePhoneCountryCode(dialCode)}
              />
              <input 
                type="tel" 
                inputMode="numeric"
                autoComplete="tel"
                maxLength={profilePhoneCountryCode === '+91' ? 10 : 15}
                value={extractLocalDigits(formData.phone, profilePhoneCountryCode).slice(0, profilePhoneCountryCode === '+91' ? 10 : 15)} 
                onKeyDown={(e) => {
                  if (
                    !/^[0-9]$/.test(e.key) &&
                    !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) &&
                    !e.ctrlKey &&
                    !e.metaKey
                  ) {
                    e.preventDefault();
                  }
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasteText = e.clipboardData.getData('text');
                  const limit = profilePhoneCountryCode === '+91' ? 10 : 15;
                  const sanitized = extractLocalDigits(pasteText, profilePhoneCountryCode).slice(0, limit);
                  handleChange('phone', sanitized);
                }}
                onChange={(e) => {
                  const limit = profilePhoneCountryCode === '+91' ? 10 : 15;
                  const val = extractLocalDigits(e.target.value, profilePhoneCountryCode).slice(0, limit);
                  handleChange('phone', val);
                }} 
                style={{
                  ...inputStyle,
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  flex: 1
                }} 
                placeholder={profilePhoneCountryCode === '+91' ? "9876543210" : "Enter mobile number"}
              />
            </div>
          ) : (
            <div style={viewValueStyle}>
              {currentEmp.phone ? (currentEmp.phone.startsWith('+') ? currentEmp.phone : `+91 ${currentEmp.phone}`) : '—'}
            </div>
          )}
        </div>

        {/* Email ID */}
        <div>
          <label style={labelStyle}>Email ID <span style={{ color: '#EF4444' }}>*</span></label>
          {isEditing ? (
            <input 
              type="email" 
              value={formData.personalEmail} 
              onChange={(e) => {
                const cleanEmail = e.target.value.toLowerCase().replace(/\s/g, '');
                handleChange('personalEmail', cleanEmail);
              }}
              onKeyDown={(e) => {
                if (e.key === ' ') {
                  e.preventDefault();
                }
              }}
              onBlur={() => {
                handleChange('personalEmail', (formData.personalEmail || '').trim().toLowerCase());
              }}
              style={inputStyle} 
              placeholder="e.g. employee@gmail.com"
              required
            />
          ) : (
            <div style={viewValueStyle}>{formData.personalEmail || currentEmp.email || '—'}</div>
          )}
        </div>
      </div>
    </div>
  );

  // SECTION 2: Employment & Organization
  const renderEmploymentSection = () => (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={sectionBadgeStyle}>02</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              Employment & Organization
            </h3>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
            Corporate hierarchy, designation, branch unit, and official status
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px' }}>
        {/* Department */}
        <div>
          <label style={labelStyle}>Department</label>
          {isEditing ? (
            <select 
              value={formData.department} 
              onChange={(e) => handleChange('department', e.target.value)} 
              style={selectStyle}
            >
              {departments.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          ) : (
            <div style={viewValueStyle}>{currentEmp.department}</div>
          )}
        </div>

        {/* Designation */}
        <div>
          <label style={labelStyle}>Designation / Role</label>
          {isEditing ? (
            <select 
              value={formData.designation.replace(/[0-9]/g, '')} 
              onChange={(e) => handleChange('designation', e.target.value.replace(/[0-9]/g, ''))} 
              style={selectStyle}
            >
              {designations.map(des => {
                const clean = des.title.replace(/[0-9]/g, '').trim();
                return (
                  <option key={des.id} value={clean}>{clean}</option>
                );
              })}
            </select>
          ) : (
            <div style={viewValueStyle}>{currentEmp.designation}</div>
          )}
        </div>

        {/* Employment Type */}
        <div>
          <label style={labelStyle}>Employment Type</label>
          {isEditing ? (
            <select 
              value={formData.employmentType} 
              onChange={(e) => handleChange('employmentType', e.target.value)} 
              style={selectStyle}
            >
              {employmentTypeOptions.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          ) : (
            <div style={viewValueStyle}>
              <span style={{
                backgroundColor: '#F1F5F9',
                border: '1px solid #E2E8F0',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '0.82rem',
                fontWeight: 700
              }}>
                {currentEmp.employmentType || 'Full-Time'}
              </span>
            </div>
          )}
        </div>

        {/* Joining Date */}
        <div>
          <label style={labelStyle}>Date of Joining</label>
          {isEditing ? (
            <input 
              type="date" 
              value={formData.joiningDate} 
              onChange={(e) => handleChange('joiningDate', e.target.value)} 
              style={inputStyle} 
            />
          ) : (
            <div style={viewValueStyle}>
              {currentEmp.joiningDate ? formatDateDDMMYYYY(currentEmp.joiningDate) : '—'}
            </div>
          )}
        </div>

        {/* Reporting Manager */}
        <div>
          <label style={labelStyle}>Reporting Manager</label>
          {isEditing ? (
            <select 
              value={formData.reportingManagerId} 
              onChange={(e) => {
                const selId = e.target.value;
                const m = employees.find(emp => emp.employeeId === selId || emp.id === selId);
                setFormData(prev => ({
                  ...prev,
                  reportingManagerId: selId,
                  reportingManagerName: m ? `${m.firstName} ${m.lastName}`.trim() : prev.reportingManagerName
                }));
              }} 
              style={selectStyle}
            >
              {employees.map(emp => (
                <option key={emp.employeeId} value={emp.employeeId}>
                  {emp.firstName} {emp.lastName} ({emp.employeeId}) - {emp.designation}
                </option>
              ))}
            </select>
          ) : (
            <div style={viewValueStyle}>
              {formData.reportingManagerName || currentEmp.reportingManagerName || 'Executive Office'} 
              <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
                ({formData.reportingManagerId || currentEmp.reportingManagerId || 'EMP-001'})
              </span>
            </div>
          )}
        </div>

        {/* Work Location / Branch */}
        <div>
          <label style={labelStyle}>Work Location / Branch</label>
          {isEditing ? (
            <select 
              value={formData.workLocation} 
              onChange={(e) => handleChange('workLocation', e.target.value)} 
              style={selectStyle}
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
          ) : (
            <div style={viewValueStyle}>
              {formData.workLocation || currentEmp.workLocation || '—'}
            </div>
          )}
        </div>

        {/* Employment Status */}
        <div>
          <label style={labelStyle}>Employment Status</label>
          {isEditing ? (
            <select 
              value={formData.status} 
              onChange={(e) => handleChange('status', e.target.value)} 
              style={selectStyle}
            >
              <option value="Active">Active</option>
              <option value="On Leave">On Leave</option>
              <option value="Terminated">Terminated</option>
            </select>
          ) : (
            <div style={viewValueStyle}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: currentEmp.status === 'Active' ? '#DCFCE7' : '#FEE2E2',
                color: currentEmp.status === 'Active' ? '#15803D' : '#DC2626',
                border: `1px solid ${currentEmp.status === 'Active' ? '#BBF7D0' : '#FECACA'}`,
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 700
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: currentEmp.status === 'Active' ? '#22C55E' : '#EF4444'
                }} />
                {currentEmp.status}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // SECTION 3: Address & Emergency Contacts
  const renderAddressSection = () => (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={sectionBadgeStyle}>03</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              Address & Emergency Contacts
            </h3>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
            Current residence, permanent domicile, and immediate emergency responders
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {/* Current Address Card */}
        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px' }}>
          <h4 style={{ margin: '0 0 14px 0', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={16} color="#0E7490" /> Current Residential Address
          </h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Address Line 1</label>
              {isEditing ? (
                <input 
                  type="text" 
                  value={formData.currentLine1} 
                  onChange={(e) => handleChange('currentLine1', e.target.value)} 
                  onKeyDown={handleAddressLineKeyDown}
                  style={inputStyle} 
                  placeholder="Door No, Street Name"
                />
              ) : (
                <div style={viewValueStyle}>{formData.currentLine1 || '—'}</div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Address Line 2 (Optional)</label>
              {isEditing ? (
                <input 
                  type="text" 
                  value={formData.currentLine2} 
                  onChange={(e) => handleChange('currentLine2', e.target.value)} 
                  onKeyDown={handleAddressLineKeyDown}
                  style={inputStyle} 
                  placeholder="Area / Landmark"
                />
              ) : (
                <div style={viewValueStyle}>{formData.currentLine2 || '—'}</div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>City</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    value={formData.currentCity} 
                    onChange={(e) => handleChange('currentCity', e.target.value)} 
                    onKeyDown={handleLettersOnlyKeyDown}
                    style={inputStyle} 
                    placeholder="City (Letters only)"
                  />
                ) : (
                  <div style={viewValueStyle}>{formData.currentCity || '—'}</div>
                )}
              </div>
              <div>
                <label style={labelStyle}>State</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    value={formData.currentState} 
                    onChange={(e) => handleChange('currentState', e.target.value)} 
                    onKeyDown={handleLettersOnlyKeyDown}
                    style={inputStyle} 
                    placeholder="State (Letters only)"
                  />
                ) : (
                  <div style={viewValueStyle}>{formData.currentState || '—'}</div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Country</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    value={formData.currentCountry} 
                    onChange={(e) => handleChange('currentCountry', e.target.value)} 
                    onKeyDown={handleLettersOnlyKeyDown}
                    style={inputStyle} 
                    placeholder="Country (Letters only)"
                  />
                ) : (
                  <div style={viewValueStyle}>{formData.currentCountry || '—'}</div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Pincode</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    inputMode="numeric"
                    maxLength={6}
                    value={formData.currentPincode} 
                    onChange={(e) => handleChange('currentPincode', e.target.value)} 
                    onKeyDown={handleDigitsOnlyKeyDown}
                    style={inputStyle} 
                    placeholder="6-digit Pincode"
                  />
                ) : (
                  <div style={viewValueStyle}>{formData.currentPincode || '—'}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Permanent Address Card */}
        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building size={16} color="#0E7490" /> Permanent Address
            </h4>
            {isEditing && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748B', cursor: 'pointer', fontWeight: 600 }}>
                <input 
                  type="checkbox" 
                  checked={formData.sameAsCurrent} 
                  onChange={(e) => handleChange('sameAsCurrent', e.target.checked)} 
                  style={{ accentColor: '#0E7490' }}
                />
                Same as Current
              </label>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Address Line 1</label>
              {isEditing && !formData.sameAsCurrent ? (
                <input 
                  type="text" 
                  value={formData.permanentLine1} 
                  onChange={(e) => handleChange('permanentLine1', e.target.value)} 
                  onKeyDown={handleAddressLineKeyDown}
                  style={inputStyle} 
                  placeholder="House / Flat No, Street Name"
                />
              ) : (
                <div style={viewValueStyle}>
                  {formData.sameAsCurrent ? formData.currentLine1 : (formData.permanentLine1 || '—')}
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Address Line 2 (Optional)</label>
              {isEditing && !formData.sameAsCurrent ? (
                <input 
                  type="text" 
                  value={formData.permanentLine2} 
                  onChange={(e) => handleChange('permanentLine2', e.target.value)} 
                  onKeyDown={handleAddressLineKeyDown}
                  style={inputStyle} 
                  placeholder="Apartment, Landmark, Area"
                />
              ) : (
                <div style={viewValueStyle}>
                  {formData.sameAsCurrent ? formData.currentLine2 : (formData.permanentLine2 || '—')}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>City</label>
                {isEditing && !formData.sameAsCurrent ? (
                  <input 
                    type="text" 
                    value={formData.permanentCity} 
                    onChange={(e) => handleChange('permanentCity', e.target.value)} 
                    onKeyDown={handleLettersOnlyKeyDown}
                    style={inputStyle} 
                    placeholder="City (Letters only)"
                  />
                ) : (
                  <div style={viewValueStyle}>
                    {formData.sameAsCurrent ? formData.currentCity : (formData.permanentCity || '—')}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>State</label>
                {isEditing && !formData.sameAsCurrent ? (
                  <input 
                    type="text" 
                    value={formData.permanentState} 
                    onChange={(e) => handleChange('permanentState', e.target.value)} 
                    onKeyDown={handleLettersOnlyKeyDown}
                    style={inputStyle} 
                    placeholder="State (Letters only)"
                  />
                ) : (
                  <div style={viewValueStyle}>
                    {formData.sameAsCurrent ? formData.currentState : (formData.permanentState || '—')}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Country</label>
                {isEditing && !formData.sameAsCurrent ? (
                  <input 
                    type="text" 
                    value={formData.permanentCountry} 
                    onChange={(e) => handleChange('permanentCountry', e.target.value)} 
                    onKeyDown={handleLettersOnlyKeyDown}
                    style={inputStyle} 
                    placeholder="Country (Letters only)"
                  />
                ) : (
                  <div style={viewValueStyle}>
                    {formData.sameAsCurrent ? formData.currentCountry : (formData.permanentCountry || '—')}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Pincode</label>
                {isEditing && !formData.sameAsCurrent ? (
                  <input 
                    type="text" 
                    inputMode="numeric"
                    maxLength={6}
                    value={formData.permanentPincode} 
                    onChange={(e) => handleChange('permanentPincode', e.target.value)} 
                    onKeyDown={handleDigitsOnlyKeyDown}
                    style={inputStyle} 
                    placeholder="6-digit Pincode"
                  />
                ) : (
                  <div style={viewValueStyle}>
                    {formData.sameAsCurrent ? formData.currentPincode : (formData.permanentPincode || '—')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Contact Information Bar */}
      <div style={{ 
        marginTop: '20px', 
        backgroundColor: '#ECFEFF', 
        borderRadius: '14px', 
        border: '1px solid #CFFAFE', 
        padding: '18px 20px' 
      }}>
        <h4 style={{ margin: '0 0 14px 0', fontSize: '0.88rem', fontWeight: 800, color: '#0E7490' }}>
          Immediate Emergency Contact Person
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Contact Person Name</label>
            {isEditing ? (
              <input 
                type="text" 
                value={formData.emergencyName} 
                onChange={(e) => handleChange('emergencyName', e.target.value)} 
                onKeyDown={handleLettersOnlyKeyDown}
                style={inputStyle} 
                placeholder="Name (Letters only)"
              />
            ) : (
              <div style={viewValueStyle}>{formData.emergencyName || '—'}</div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Relationship</label>
            {isEditing ? (
              <select 
                value={formData.emergencyRelationship} 
                onChange={(e) => handleChange('emergencyRelationship', e.target.value)} 
                style={selectStyle}
              >
                <option value="Parent">Parent</option>
                <option value="Spouse">Spouse</option>
                <option value="Sibling">Sibling</option>
                <option value="Relative">Relative</option>
                <option value="Friend">Friend</option>
                <option value="Other">Other</option>
              </select>
            ) : (
              <div style={viewValueStyle}>{formData.emergencyRelationship || '—'}</div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Primary Emergency Mobile</label>
            {isEditing ? (
              <div style={{ display: 'flex', alignItems: 'stretch', position: 'relative' }}>
                <CountryCodeDropdown
                  value={profileEmergencyCountryCode}
                  onChange={(dialCode) => setProfileEmergencyCountryCode(dialCode)}
                />
                <input 
                  type="tel" 
                  value={extractLocalDigits(formData.emergencyMobile, profileEmergencyCountryCode)} 
                  onChange={(e) => {
                    const limit = profileEmergencyCountryCode === '+91' ? 10 : 15;
                    const val = extractLocalDigits(e.target.value, profileEmergencyCountryCode).slice(0, limit);
                    handleChange('emergencyMobile', val);
                  }} 
                  style={{
                    ...inputStyle,
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    flex: 1
                  }} 
                  placeholder={profileEmergencyCountryCode === '+91' ? "9876543210" : "Enter emergency number"}
                />
              </div>
            ) : (
              <div style={viewValueStyle}>{formData.emergencyMobile || '—'}</div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Alternate Contact (Optional)</label>
            {isEditing ? (
              <div style={{ display: 'flex', alignItems: 'stretch', position: 'relative' }}>
                <CountryCodeDropdown
                  value={profileAltEmergencyCountryCode}
                  onChange={(dialCode) => setProfileAltEmergencyCountryCode(dialCode)}
                />
                <input 
                  type="tel" 
                  value={extractLocalDigits(formData.emergencyAltMobile, profileAltEmergencyCountryCode)} 
                  onChange={(e) => {
                    const limit = profileAltEmergencyCountryCode === '+91' ? 10 : 15;
                    const val = extractLocalDigits(e.target.value, profileAltEmergencyCountryCode).slice(0, limit);
                    handleChange('emergencyAltMobile', val);
                  }} 
                  style={{
                    ...inputStyle,
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    flex: 1
                  }} 
                  placeholder={profileAltEmergencyCountryCode === '+91' ? "9876543210" : "Enter alternate number"}
                />
              </div>
            ) : (
              <div style={viewValueStyle}>{formData.emergencyAltMobile || '—'}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // SECTION 4: Education & Qualifications
  const renderEducationSection = () => (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={sectionBadgeStyle}>04</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              Educational Qualifications
            </h3>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
            Highest academic attainment, university credentials, and pass-out records
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px' }}>
        <div>
          <label style={labelStyle}>Highest Qualification</label>
          {isEditing ? (
            <select 
              value={formData.qualification} 
              onChange={(e) => handleQualificationChange(e.target.value)} 
              style={selectStyle}
            >
              <option value="UG">UG</option>
              <option value="PG">PG</option>
              <option value="Diploma">Diploma</option>
              <option value="Others">Others</option>
            </select>
          ) : (
            <div style={viewValueStyle}>{formData.qualification || '—'}</div>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Degree / Course Name</label>
            {isEditing && isCustomDegree ? (
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
          {isEditing ? (
            isCustomDegree ? (
              <input 
                type="text" 
                value={formData.degreeName} 
                onChange={(e) => handleChange('degreeName', e.target.value.replace(/[^a-zA-Z0-9\s&.\-()/]/g, ''))} 
                onKeyDown={handleCompanyKeyDown}
                style={inputStyle} 
                placeholder="Enter Degree / Course Name"
                autoFocus
              />
            ) : (
              <select
                value={formData.degreeName}
                onChange={(e) => {
                  if (e.target.value === '__CUSTOM__') {
                    setIsCustomDegree(true);
                    handleChange('degreeName', '');
                  } else {
                    setIsCustomDegree(false);
                    handleChange('degreeName', e.target.value);
                  }
                }}
                style={selectStyle}
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
            )
          ) : (
            <div style={viewValueStyle}>{formData.degreeName || '—'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Specialization / Stream <span style={{ color: '#EF4444' }}>*</span></label>
          {isEditing ? (
            <input 
              type="text" 
              value={formData.specialization} 
              onChange={(e) => handleChange('specialization', e.target.value.replace(/[^a-zA-Z\s&.\-]/g, ''))} 
              onKeyDown={handleUniversityKeyDown}
              style={inputStyle} 
              placeholder="e.g. Mechanical / CSE (Letters only)"
              required
            />
          ) : (
            <div style={viewValueStyle}>{formData.specialization || '—'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>University / Institution</label>
          {isEditing ? (
            <input 
              type="text" 
              value={formData.university} 
              onChange={(e) => handleChange('university', e.target.value)} 
              onKeyDown={handleUniversityKeyDown}
              style={inputStyle} 
              placeholder="e.g. Anna University (Letters only)"
            />
          ) : (
            <div style={viewValueStyle}>{formData.university || '—'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Year of Passing</label>
          {isEditing ? (
            <select 
              value={formData.yearOfPassing} 
              onChange={(e) => handleChange('yearOfPassing', e.target.value)} 
              style={selectStyle}
            >
              <option value="">Select Passing Year</option>
              {PASSING_YEARS.map(yr => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          ) : (
            <div style={viewValueStyle}>{formData.yearOfPassing || '—'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Grade / CGPA / Score</label>
          {isEditing ? (
            <input 
              type="text" 
              inputMode="decimal"
              maxLength={6}
              value={formData.gradePercentage} 
              onChange={(e) => handleChange('gradePercentage', e.target.value)} 
              onKeyDown={handleDecimalKeyDown(formData.gradePercentage)}
              style={inputStyle} 
              placeholder="e.g. 84.50 (0 to 100)"
            />
          ) : (
            <div style={viewValueStyle}>
              <span style={{
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                border: '1px solid #BBF7D0',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 700
              }}>
                {formData.gradePercentage || '—'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // SECTION 5: Work Experience & Professional Skills
  const renderExperienceSection = () => (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={sectionBadgeStyle}>05</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              Prior Experience & Professional Skills
            </h3>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
            Track record, former employers, compensation history, and core technical skills
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px' }}>
        <div>
          <label style={labelStyle}>Profile Classification</label>
          {isEditing ? (
            <select 
              value={formData.experienceType} 
              onChange={(e) => handleChange('experienceType', e.target.value)} 
              style={selectStyle}
            >
              <option value="Experienced">Experienced</option>
              <option value="Fresher">Fresher</option>
            </select>
          ) : (
            <div style={viewValueStyle}>
              <span style={{
                backgroundColor: formData.experienceType === 'Experienced' ? '#ECFEFF' : '#FEF3C7',
                color: formData.experienceType === 'Experienced' ? '#0E7490' : '#B45309',
                border: `1px solid ${formData.experienceType === 'Experienced' ? '#CFFAFE' : '#FDE68A'}`,
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 700
              }}>
                {formData.experienceType}
              </span>
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Total Experience (Years)</label>
          {isEditing ? (
            <div>
              <input 
                type="text" 
                inputMode="decimal"
                maxLength={5}
                value={formData.totalExperience ? formData.totalExperience.toString() : ''} 
                onChange={(e) => handleChange('totalExperience', e.target.value)} 
                onKeyDown={handleDecimalKeyDown(formData.totalExperience)}
                style={inputStyle} 
                placeholder="e.g. 2.5 (Years)"
              />
            </div>
          ) : (
            <div style={viewValueStyle}>
              {formData.totalExperience 
                ? `${formData.totalExperience} Years`
                : '—'}
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Previous Company / Employer</label>
          {isEditing ? (
            <input 
              type="text" 
              value={formData.previousCompany} 
              onChange={(e) => handleChange('previousCompany', e.target.value)} 
              onKeyDown={handleCompanyKeyDown}
              style={inputStyle} 
              placeholder="Company name"
            />
          ) : (
            <div style={viewValueStyle}>{formData.previousCompany || '—'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Previous Designation</label>
          {isEditing ? (
            <div>
              <input 
                type="text" 
                value={formData.previousDesignation} 
                onChange={(e) => handleChange('previousDesignation', e.target.value)} 
                onKeyDown={handleCompanyKeyDown}
                style={inputStyle} 
                placeholder="e.g. Site Engineer"
              />
            </div>
          ) : (
            <div style={viewValueStyle}>{formData.previousDesignation || '—'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Previous Department</label>
          {isEditing ? (
            <input 
              type="text" 
              value={formData.previousDepartment} 
              onChange={(e) => handleChange('previousDepartment', e.target.value)} 
              style={inputStyle} 
              placeholder="Department"
            />
          ) : (
            <div style={viewValueStyle}>{formData.previousDepartment || '—'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Last Drawn Monthly Salary</label>
          {isEditing ? (
            <input 
              type="text" 
              inputMode="decimal"
              maxLength={12}
              value={formData.lastDrawnSalary} 
              onChange={(e) => handleChange('lastDrawnSalary', e.target.value)} 
              onKeyDown={handleDecimalKeyDown(formData.lastDrawnSalary)}
              style={inputStyle} 
              placeholder="e.g. 35000"
            />
          ) : (
            <div style={viewValueStyle}>{formData.lastDrawnSalary || '—'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Previous Company Location</label>
          {isEditing ? (
            <input 
              type="text" 
              value={formData.previousCompanyLocation} 
              onChange={(e) => handleChange('previousCompanyLocation', e.target.value)} 
              style={inputStyle} 
              placeholder="City, State"
            />
          ) : (
            <div style={viewValueStyle}>{formData.previousCompanyLocation || '—'}</div>
          )}
        </div>
      </div>

      {/* Skills Pill List */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
        <label style={labelStyle}>Core Skills & Competencies (Comma Separated)</label>
        {isEditing ? (
          <input 
            type="text" 
            value={formData.skills} 
            onChange={(e) => handleChange('skills', e.target.value)} 
            style={inputStyle} 
            placeholder="AutoCAD, Structural Design, Site Supervision, Quality Audits"
          />
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
            {formData.skills.split(',').map((sk: string, idx: number) => {
              const clean = sk.trim();
              if (!clean) return null;
              return (
                <span 
                  key={idx}
                  style={{
                    backgroundColor: '#F1F5F9',
                    color: '#334155',
                    border: '1px solid #CBD5E1',
                    padding: '4px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 650
                  }}
                >
                  {clean}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // SECTION 6: Salary Structure & Bank Details (FULL EDIT FOR CEO & HR)
  const renderSalarySection = () => (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={sectionBadgeStyle}>06</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              Salary Structure & Bank Details
            </h3>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
            Statutory payroll compliance, gross CTC, allowances breakdown, and banking coordinates
          </p>
        </div>

        {/* Scheme Pill */}
        <div>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: isSalaryExemptRole ? '#ECFEFF' : (formData.salaryScheme === 'WITH_PF' ? '#DCFCE7' : '#FEF3C7'),
            color: isSalaryExemptRole ? '#0E7490' : (formData.salaryScheme === 'WITH_PF' ? '#15803D' : '#B45309'),
            border: `1px solid ${isSalaryExemptRole ? '#0E7490' : (formData.salaryScheme === 'WITH_PF' ? '#BBF7D0' : '#FDE68A')}`,
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '0.78rem',
            fontWeight: 800
          }}>
            {schemePillLabel}
          </span>
        </div>
      </div>

      {isSalaryExemptRole && (
        <div style={{
          backgroundColor: '#ECFEFF',
          border: '1.5px solid #0E7490',
          borderRadius: '12px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0E7490', fontSize: '0.95rem' }}>
              Chief Executive Officer — Salary Exempt
            </div>
            <div style={{ fontSize: '0.8rem', color: '#155E75', marginTop: '2px' }}>
              As Chief Executive Officer, standard employee monthly salary, payroll deductions, and statutory CTC allocations are not applicable.
            </div>
          </div>
        </div>
      )}

      {/* TOP SALARY SUMMARY HERO */}
      <div style={{
        backgroundColor: '#F8FAFC',
        borderRadius: '14px',
        border: '1px solid #E2E8F0',
        padding: '20px 24px',
        marginBottom: '22px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            TOTAL MONTHLY CTC
          </div>
          {isEditing ? (
            <div style={{ marginTop: '6px' }}>
              <input 
                type="number" 
                value={salaryInputValue('monthlyCtc', formData.monthlyCtc)} 
                onChange={(e) => handleCtcChange(e.target.value)} 
                style={{ ...inputStyle, fontSize: '1.2rem', fontWeight: 800, color: '#0E7490' }}
                placeholder="Monthly CTC"
              />
              <span style={{ fontSize: '0.72rem', color: '#0E7490', marginTop: '4px', display: 'block' }}>
                {activeEarnings.length > 0
                  ? `Configured Components: ${activeEarnings.map(c => `${c.name} (${c.calculationMethod === 'PERCENTAGE' ? `${c.defaultValue}%` : 'Fixed'})`).join(', ')}`
                  : 'Auto-splits: 40% Basic, 20% DA, 5% Conveyance, 35% HRA'}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0E7490', letterSpacing: '-0.02em', marginTop: '4px' }}>
              {(formData.role === 'CEO' || formData.department === 'CEO' || formData.designation === 'CEO' || currentEmp.role === 'CEO' || currentEmp.department === 'CEO') && formData.monthlyCtc === 0 ? (
                <span style={{ color: '#0E7490', fontSize: '1.05rem', fontWeight: 800 }}>Exempt</span>
              ) : (
                <>
                  {formatCurrency(formData.monthlyCtc)}
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginLeft: '6px' }}>/ month</span>
                </>
              )}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ANNUAL CTC (ESTIMATED)
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
            {(formData.role === 'CEO' || formData.department === 'CEO' || formData.designation === 'CEO' || currentEmp.role === 'CEO' || currentEmp.department === 'CEO') && formData.monthlyCtc === 0 ? (
              <span style={{ color: '#64748B', fontSize: '1.05rem', fontWeight: 700 }}>Exempt</span>
            ) : (
              <>
                {formatCurrency(formData.monthlyCtc * 12)}
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginLeft: '6px' }}>/ annum</span>
              </>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            STATUTORY SCHEME SELECTION
          </div>
          {isEditing ? (
            <select 
              value={formData.salaryScheme} 
              onChange={(e) => {
                const scheme = e.target.value as 'WITH_PF' | 'WITHOUT_PF';
                setFormData(prev => ({
                  ...prev,
                  salaryScheme: scheme,
                  withPf: scheme === 'WITH_PF'
                }));
              }} 
              style={{ ...selectStyle, marginTop: '4px' }}
            >
              <option value="WITHOUT_PF">WITHOUT PF (Gross CTC Direct)</option>
              <option value="WITH_PF">WITH PF ({payrollSettingsConfig.pfPolicy?.calculationType === 'PERCENTAGE' ? `${payrollSettingsConfig.pfPolicy?.percentage}%` : 'Statutory'} PF & ESIC)</option>
            </select>
          ) : (
            <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0F172A', marginTop: '6px' }}>
              {schemeDisplayLabel}
            </div>
          )}
        </div>
      </div>

      {/* ALLOWANCES BREAKDOWN GRID */}
      <h4 style={{ margin: '0 0 14px 0', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
        Monthly Earnings & Allowance Breakdown
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {activeEarnings.length > 0 ? (
          activeEarnings.map(comp => {
            const compVal = salaryComponentValues.customComponents?.[comp.code] ?? 0;
            const badge = comp.calculationMethod === 'PERCENTAGE'
              ? `(${comp.defaultValue}% of ${comp.percentageBase || 'CTC'})`
              : comp.calculationMethod === 'FIXED_AMOUNT'
              ? `(Fixed ${formatCurrency(comp.defaultValue || 0)})`
              : `(fx: ${comp.formula || 'Formula'})`;

            return (
              <div key={comp.id} style={{ backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '14px' }}>
                <label style={labelStyle}>{comp.name} {badge}</label>
                {isEditing ? (
                  <input 
                    type="number" 
                    value={salaryInputValue(`component:${comp.code}`, compVal)} 
                    readOnly
                    title="Calculated from Payroll Settings. Change Monthly CTC or Payroll Settings to update this component."
                    style={{ ...inputStyle, backgroundColor: '#F1F5F9', cursor: 'not-allowed' }} 
                  />
                ) : (
                  <div style={viewValueStyle}>{formatCurrency(compVal)}</div>
                )}
              </div>
            );
          })
        ) : (
          <div style={{ gridColumn: '1 / -1', padding: '16px', backgroundColor: '#F0FDFA', borderRadius: '12px', border: '1px solid #CCFBF1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#0E7490' }}>
              <AlertCircle size={18} />
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                No dynamic earning components configured in Settings → Payroll Settings.
              </span>
            </div>
            <div style={{ maxWidth: '280px' }}>
              <label style={labelStyle}>Basic Salary (₹)</label>
              {isEditing ? (
                <input
                  type="number"
                  value={salaryInputValue('basicSalary', formData.basicSalary)}
                  onChange={(e) => handleSalaryComponentChange('basicSalary', e.target.value)}
                  style={inputStyle}
                />
              ) : (
                <div style={viewValueStyle}>{formatCurrency(formData.basicSalary)}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* STATUTORY DEDUCTIONS & NET TAKE-HOME PREVIEW */}
      <div style={{
        backgroundColor: '#F8FAFC',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Statutory & Configured Deductions (Dynamic from Settings)
          </h4>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: formData.salaryScheme === 'WITH_PF' ? '#0E7490' : '#D97706' }}>
            {deductionsSchemeLabel}
          </span>
        </div>

        {formData.salaryScheme === 'WITH_PF' ? (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              marginBottom: '12px'
            }}>
              {/* EPF Contribution */}
              {statutoryCalc.pfActive !== false && (
                <div style={{ backgroundColor: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                      EPF Contribution
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 700 }}>
                      Deduction
                    </span>
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
                    {formatCurrency(statutoryCalc.epfDeduction)}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={statutoryCalc.epfRule}>
                    {statutoryCalc.epfRule}
                  </div>
                </div>
              )}

              {/* ESIC Contribution */}
              {statutoryCalc.esicActive !== false && (
                <div style={{ backgroundColor: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                      ESIC Contribution
                    </span>
                    <span style={{ fontSize: '0.68rem', color: statutoryCalc.isEsicExempt ? '#64748B' : '#DC2626', fontWeight: 700 }}>
                      {statutoryCalc.isEsicExempt ? 'Exempt' : 'Deduction'}
                    </span>
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: statutoryCalc.isEsicExempt ? '#64748B' : '#DC2626', marginTop: '2px' }}>
                    {statutoryCalc.isEsicExempt ? 'Exempt (> ₹21,000.00)' : formatCurrency(statutoryCalc.esiDeduction)}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={statutoryCalc.esiRule}>
                    {statutoryCalc.esiRule}
                  </div>
                </div>
              )}

              {/* Configured Deductions */}
              {statutoryCalc.configuredDeductions.map(ded => (
                <div key={ded.id} style={{ backgroundColor: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                      {ded.name}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 700 }}>
                      Deduction
                    </span>
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
                    {formatCurrency(ded.amount)}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '2px' }}>
                    {ded.description}
                  </div>
                </div>
              ))}

              {/* Professional Tax (if enabled) */}
              {statutoryCalc.ptActive !== false && statutoryCalc.professionalTax > 0 && !statutoryCalc.configuredDeductions.some(d => d.code === 'PT' || d.name.toLowerCase().includes('professional tax')) && (
                <div style={{ backgroundColor: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                      Professional Tax (PT)
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 700 }}>
                      State
                    </span>
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
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
              padding: '10px 14px',
              backgroundColor: '#ECFEFF',
              borderRadius: '8px',
              border: '1px solid #CFFAFE',
              fontSize: '0.84rem'
            }}>
              <div style={{ color: '#0E7490', fontWeight: 700 }}>
                Total Monthly Deductions: <span style={{ color: '#DC2626', fontWeight: 800 }}>{formatCurrency(statutoryCalc.totalDeductions)}</span>
              </div>
              <div style={{ color: '#0E7490', fontWeight: 700 }}>
                Estimated Net In-Hand: <span style={{ color: '#059669', fontWeight: 900, fontSize: '0.96rem' }}>{formatCurrency(statutoryCalc.netTakeHome)}</span>
              </div>
            </div>
          </>
        ) : (
          <div style={{
            fontSize: '0.82rem',
            color: '#64748B',
            padding: '8px 0'
          }}>
            Employee is currently enrolled under the <strong>Without PF & ESIC Scheme</strong>. Total Net Disbursal equals Gross CTC {formatCurrency(statutoryCalc.gross)} / month.
          </div>
        )}
      </div>

      {/* BANK DETAILS & STATUTORY NUMBERS */}
      <h4 style={{ margin: '0 0 14px 0', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
        Bank Disbursal Coordinates & Statutory Identification
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Bank Name</label>
          {isEditing ? (
            <input 
              type="text" 
              value={formData.bankName} 
              onChange={(e) => handleChange('bankName', e.target.value)} 
              onKeyDown={handleLettersOnlyKeyDown}
              style={inputStyle} 
              placeholder="e.g. HDFC Bank (Letters only)"
            />
          ) : (
            <div style={viewValueStyle}>{formData.bankName || '—'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Account Number</label>
          {isEditing ? (
            <input 
              type="text" 
              inputMode="numeric"
              maxLength={18}
              value={formData.accountNumber} 
              onChange={(e) => handleChange('accountNumber', e.target.value)} 
              onKeyDown={handleDigitsOnlyKeyDown}
              style={inputStyle} 
              placeholder="9 to 18 digit Account Number"
            />
          ) : (
            <div style={{ ...viewValueStyle, fontFamily: 'monospace', color: '#0E7490' }}>
              {formData.accountNumber || '—'}
              <button
                type="button"
                onClick={() => handleCopy(formData.accountNumber, 'accNo')}
                title="Copy Account Number"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '2px' }}
              >
                {copiedField === 'accNo' ? <Check size={14} color="#059669" /> : <Copy size={14} />}
              </button>
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>IFSC Code</label>
          {isEditing ? (
            <input 
              type="text" 
              maxLength={11}
              value={formData.ifscCode} 
              onChange={(e) => handleChange('ifscCode', e.target.value.toUpperCase())} 
              onKeyDown={handleAlphanumericKeyDown}
              style={{ ...inputStyle, textTransform: 'uppercase' }} 
              placeholder="11-character IFSC (e.g. SBIN0001234)"
            />
          ) : (
            <div style={{ ...viewValueStyle, fontFamily: 'monospace' }}>
              {formData.ifscCode || '—'}
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Bank Branch</label>
          {isEditing ? (
            <input 
              type="text" 
              value={formData.branch} 
              onChange={(e) => handleChange('branch', e.target.value)} 
              style={inputStyle} 
              placeholder="Branch name"
            />
          ) : (
            <div style={viewValueStyle}>{formData.branch || '—'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>PAN Card Number</label>
          {isEditing ? (
            <input 
              type="text" 
              maxLength={10}
              value={formData.panNumber} 
              onChange={(e) => handleChange('panNumber', e.target.value.toUpperCase())} 
              onKeyDown={handleAlphanumericKeyDown}
              style={{ ...inputStyle, textTransform: 'uppercase' }} 
              placeholder="10-character PAN (e.g. ABCDE1234F)"
            />
          ) : (
            <div style={{ ...viewValueStyle, fontFamily: 'monospace', fontWeight: 800 }}>
              {formData.panNumber || '—'}
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>UAN / PF Number</label>
          {isEditing ? (
            <input 
              type="text" 
              inputMode="numeric"
              maxLength={12}
              value={formData.uanNumber} 
              onChange={(e) => handleChange('uanNumber', e.target.value)} 
              onKeyDown={handleDigitsOnlyKeyDown}
              style={inputStyle} 
              placeholder="12-digit UAN (e.g. 101234567890)"
            />
          ) : (
            <div style={{ ...viewValueStyle, fontFamily: 'monospace' }}>
              {formData.uanNumber || '—'}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // SECTION 7: Shift & Attendance Policies
  const renderShiftPolicySection = () => (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={sectionBadgeStyle}>07</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              Shift & Attendance Policies
            </h3>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
            Attendance verification protocol, shift rosters, weekly off, and leave allocations
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px' }}>
        <div>
          <label style={labelStyle}>Attendance Verification Method</label>
          {isEditing ? (
            <select 
              value={formData.attendanceMethod} 
              onChange={(e) => handleChange('attendanceMethod', e.target.value)} 
              style={selectStyle}
            >
              <option value="Face Scan">Face Scan</option>
              <option value="GPS Geofence">GPS Geofence</option>
              <option value="Biometric Device">Biometric Device</option>
              <option value="Manual Punch">Manual Punch</option>
              <option value="Exempt">Exempt</option>
            </select>
          ) : (
            <div style={viewValueStyle}>
              <span style={{
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                border: '1px solid #CFFAFE',
                padding: '3px 10px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 700
              }}>
                {formData.attendanceMethod}
              </span>
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Work Shift Assigned</label>
          {isEditing ? (
            <select 
              value={formData.shift} 
              onChange={(e) => handleChange('shift', e.target.value)} 
              style={selectStyle}
            >
              {shifts.length === 0 ? (
                <option value="">No Shifts Configured</option>
              ) : (
                shifts.map(s => (
                  <option key={s.id} value={s.shiftName}>{s.shiftName}</option>
                ))
              )}
            </select>
          ) : (
            <div style={viewValueStyle}>{formData.shift || 'No Shift Assigned'}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Weekly Off Schedule</label>
          {isEditing ? (
            <select 
              value={formData.weeklyOff} 
              onChange={(e) => handleChange('weeklyOff', e.target.value)} 
              style={selectStyle}
            >
              {weeklySchedules.map(w => (
                <option key={w.id} value={w.name}>{w.name}</option>
              ))}
            </select>
          ) : (
            <div style={viewValueStyle}>{formData.weeklyOff}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Assigned Holiday Calendar</label>
          {isEditing ? (
            <select 
              value={formData.holidayCalendar} 
              onChange={(e) => handleChange('holidayCalendar', e.target.value)} 
              style={selectStyle}
            >
              {holidayPolicies.map(h => (
                <option key={h.id} value={h.name}>{h.name}</option>
              ))}
            </select>
          ) : (
            <div style={viewValueStyle}>{formData.holidayCalendar}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Assigned Leave Policy</label>
          {isEditing ? (
            <select 
              value={formData.leavePolicy} 
              onChange={(e) => handleChange('leavePolicy', e.target.value)} 
              style={selectStyle}
            >
              {leavePolicies.map(lp => (
                <option key={lp.id} value={lp.name}>{lp.name}</option>
              ))}
            </select>
          ) : (
            <div style={viewValueStyle}>{formData.leavePolicy}</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>GPS Remote Punch Permission</label>
          {isEditing ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
              <input 
                type="checkbox" 
                checked={formData.gpsAllowed} 
                onChange={(e) => handleChange('gpsAllowed', e.target.checked)} 
                style={{ accentColor: '#0E7490' }}
              />
              Allow Mobile App GPS Check-in
            </label>
          ) : (
            <div style={viewValueStyle}>
              <span style={{
                backgroundColor: formData.gpsAllowed ? '#DCFCE7' : '#FEE2E2',
                color: formData.gpsAllowed ? '#15803D' : '#DC2626',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 700
              }}>
                {formData.gpsAllowed ? 'Allowed' : 'Restricted'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // SECTION 8: Documents & Verification Attachments
  const renderDocumentsSection = () => (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={sectionBadgeStyle}>08</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              Corporate Verification Documents
            </h3>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
            Employee verification certificates, KYC identity files, and relieving letters (Max size: 1 MB per document)
          </p>
        </div>

        {isEditing && (
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '9px',
                fontSize: '0.8rem',
                fontWeight: 700,
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <Upload size={14} /> Upload Document
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleAddDocument} 
              style={{ display: 'none' }} 
            />
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {formData.documents.map((doc, idx) => (
          <div 
            key={idx}
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <FileText size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ 
                  fontSize: '0.86rem', 
                  fontWeight: 700, 
                  color: '#0F172A', 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis' 
                }}>
                  {doc.name}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <span style={{ backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 800 }}>
                    {doc.type}
                  </span>
                  <span>•</span>
                  <span>Uploaded: {formatDateDDMMYYYY(doc.uploadDate || '2026-09-04')}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <a
                href={doc.url || '#'}
                download={doc.name}
                onClick={(e) => {
                  if (doc.url === '#') {
                    e.preventDefault();
                    alert(`Downloading simulated corporate document: ${doc.name}`);
                  }
                }}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#0E7490',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  textDecoration: 'none'
                }}
                title="Download / View"
              >
                <Download size={14} />
              </a>

              {isEditing && (
                <button
                  type="button"
                  onClick={() => handleRemoveDocument(idx)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#DC2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  title="Remove Document"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // SECTION 9: System Access & Login Credentials
  const renderSystemAccessSection = () => {
    const destEmail = (currentEmp.personalEmail || currentEmp.email).toLowerCase();
    const destPassword = formData.password || currentEmp.password || '';
    return (
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={sectionBadgeStyle}>09</span>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                System Access & Portal Credentials
              </h3>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
              Employee portal credentials, authentication status, and dispatch tracking
            </p>
          </div>

          {isCEOorHR && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '9px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  border: '1px solid #A5F3FC',
                  cursor: 'pointer'
                }}
              >
                <KeyRound size={14} /> Reset & Dispatch Credentials
              </button>

              {canActivateOrDeactivate && (
                <button
                  type="button"
                  id="btn-toggle-account-status"
                  onClick={() => {
                    setStatusToSet(formData.accountStatus === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE');
                    setShowStatusConfirmModal(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '9px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    backgroundColor: formData.accountStatus === 'ACTIVE' ? '#FEF2F2' : '#ECFDF5',
                    color: formData.accountStatus === 'ACTIVE' ? '#DC2626' : '#059669',
                    border: `1px solid ${formData.accountStatus === 'ACTIVE' ? '#FECACA' : '#A7F3D0'}`,
                    cursor: 'pointer'
                  }}
                >
                  <Power size={14} /> {formData.accountStatus === 'ACTIVE' ? 'Deactivate Account' : 'Activate Account'}
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px' }}>
          {/* User ID */}
          <div>
            <label style={labelStyle}>Portal Login User ID</label>
            <div style={{ ...viewValueStyle, fontFamily: 'monospace', color: '#0E7490', fontWeight: 800 }}>
              {formData.employeeId}
            </div>
          </div>

          {/* Portal Username */}
          <div>
            <label style={labelStyle}>Official Username</label>
            {isEditing ? (
              <input 
                type="text" 
                value={formData.officialUsername} 
                onChange={(e) => handleChange('officialUsername', e.target.value)} 
                style={inputStyle} 
              />
            ) : (
              <div style={viewValueStyle}>{formData.officialUsername}</div>
            )}
          </div>

          {/* Account Status */}
          <div>
            <label style={labelStyle}>Portal Account Status</label>
            <div style={viewValueStyle}>
              <span style={{
                backgroundColor: formData.accountStatus === 'ACTIVE' ? '#DCFCE7' : '#FEE2E2',
                color: formData.accountStatus === 'ACTIVE' ? '#15803D' : '#DC2626',
                border: `1px solid ${formData.accountStatus === 'ACTIVE' ? '#BBF7D0' : '#FECACA'}`,
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 700
              }}>
                {formData.accountStatus === 'ACTIVE' ? 'ACTIVE' : 'DEACTIVATED'}
              </span>
            </div>
          </div>

          {/* Password (Visible to Super Admin, CEO, HR, and Employee Self) */}
          <div>
            <label style={labelStyle}>Portal Login Password</label>
            {canViewPassword ? (
              isEditing ? (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    value={formData.password || ''} 
                    onChange={(e) => handleChange('password', e.target.value)} 
                    style={{
                      ...inputStyle,
                      paddingRight: '42px',
                      fontFamily: showPassword ? "'JetBrains Mono', 'Fira Code', monospace" : 'inherit',
                      letterSpacing: showPassword ? '0.04em' : 'normal',
                      fontWeight: 600
                    }} 
                    placeholder="Enter employee portal password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'none',
                      border: 'none',
                      color: '#64748B',
                      cursor: 'pointer',
                      padding: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '6px'
                    }}
                    title={showPassword ? 'Hide Password' : 'Show Password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{
                    ...viewValueStyle,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <Lock size={15} color="#0E7490" style={{ flexShrink: 0 }} />
                      <span style={{
                        color: '#0F172A',
                        fontWeight: 700,
                        fontSize: '0.86rem',
                        fontFamily: showPassword ? "'JetBrains Mono', 'Fira Code', monospace" : 'inherit',
                        letterSpacing: showPassword ? '0.04em' : '0.15em'
                      }}>
                        {showPassword ? (formData.password || currentEmp.password || 'Password@123') : '••••••••••••'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {/* Toggle Visibility */}
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid #E2E8F0',
                          backgroundColor: '#FFFFFF',
                          color: '#475569',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        title={showPassword ? 'Hide password' : 'View password'}
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span>{showPassword ? 'Hide' : 'Show'}</span>
                      </button>

                      {/* Copy Password */}
                      <button
                        type="button"
                        onClick={() => handleCopy(formData.password || currentEmp.password || 'Password@123', 'portalPassword')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid #A5F3FC',
                          backgroundColor: copiedField === 'portalPassword' ? '#DCFCE7' : '#ECFEFF',
                          color: copiedField === 'portalPassword' ? '#15803D' : '#0E7490',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        title="Copy Password"
                      >
                        {copiedField === 'portalPassword' ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedField === 'portalPassword' ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '0.68rem',
                      backgroundColor: '#ECFEFF',
                      color: '#0E7490',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontWeight: 700,
                      border: '1px solid #CFFAFE'
                    }}>
                      {isSuperAdminOrCEO ? 'Super Admin / CEO Access' : isHR ? 'HR Manager Access' : 'Your Password'}
                    </span>
                    <span>Visible to Super Admin, CEO, HR, and the employee.</span>
                  </div>
                </div>
              )
            ) : (
              <div>
                <div style={{
                  ...viewValueStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  padding: '8px 12px',
                  borderRadius: '10px'
                }}>
                  <span style={{ color: '#64748B', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Lock size={15} color="#94A3B8" />
                    <span>•••••••••••• (Protected)</span>
                  </span>
                  <span style={{ fontSize: '0.70rem', backgroundColor: '#F1F5F9', color: '#64748B', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                    Restricted
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
                  Password is only viewable by Super Admin, CEO, HR, and this employee.
                </div>
              </div>
            )}
          </div>

          {/* Must Change Password */}
          <div>
            <label style={labelStyle}>Force Password Reset on Next Login</label>
            {isEditing ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
                <input 
                  type="checkbox" 
                  checked={formData.mustChangePassword} 
                  onChange={(e) => handleChange('mustChangePassword', e.target.checked)} 
                  style={{ accentColor: '#0E7490' }}
                />
                Require Password Change
              </label>
            ) : (
              <div style={viewValueStyle}>
                {formData.mustChangePassword ? 'Yes (Mandatory)' : 'No (Normal Access)'}
              </div>
            )}
          </div>

          {/* User Role Assignment & Access Governance (Section 5 Requirement) */}
          <div style={{
            gridColumn: '1 / -1',
            backgroundColor: '#F8FAFC',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            marginTop: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <ShieldCheck size={18} color="#0E7490" />
              <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0F172A' }}>
                User Role Assignment & Permission Governance
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              {/* Role: [Select Role] */}
              <div>
                <label style={labelStyle}>Role <span style={{ color: '#EF4444' }}>*</span></label>
                {isEditing ? (
                  <select 
                    value={formData.role} 
                    onChange={(e) => handleChange('role', e.target.value as Role)} 
                    style={selectStyle}
                  >
                    <option value="CEO">CEO</option>
                    <option value="HR">HR</option>
                    <option value="Admin">Admin</option>
                    <option value="Manager">Manager</option>
                    <option value="Team Leader">Team Leader</option>
                    <option value="Employee">Employee</option>
                    <option value="Super Admin">Super Admin</option>
                    <option value="HR Admin">HR Admin</option>
                    <option value="HR Manager">HR Manager</option>
                    <option value="Department Manager">Department Manager</option>
                  </select>
                ) : (
                  <div style={viewValueStyle}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      backgroundColor: '#ECFEFF',
                      color: '#0E7490',
                      border: '1px solid #A5F3FC',
                      padding: '3px 10px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.82rem'
                    }}>
                      <ShieldCheck size={14} /> {formData.role || 'Employee'}
                    </span>
                  </div>
                )}
              </div>

              {/* Department: [Select Department] */}
              <div>
                <label style={labelStyle}>Department <span style={{ color: '#EF4444' }}>*</span></label>
                {isEditing ? (
                  <select 
                    value={formData.department} 
                    onChange={(e) => handleChange('department', e.target.value)} 
                    style={selectStyle}
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                ) : (
                  <div style={viewValueStyle}>{formData.department || 'Operations'}</div>
                )}
              </div>

              {/* Reporting Manager: [Select Manager] */}
              <div>
                <label style={labelStyle}>Reporting Manager <span style={{ color: '#EF4444' }}>*</span></label>
                {isEditing ? (
                  <select 
                    value={formData.reportingManagerId} 
                    onChange={(e) => {
                      const selId = e.target.value;
                      const m = employees.find(emp => emp.employeeId === selId || emp.id === selId);
                      setFormData(prev => ({
                        ...prev,
                        reportingManagerId: selId,
                        reportingManagerName: m ? `${m.firstName} ${m.lastName}`.trim() : prev.reportingManagerName
                      }));
                    }} 
                    style={selectStyle}
                  >
                    {employees.map(emp => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.firstName} {emp.lastName} ({emp.employeeId})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={viewValueStyle}>
                    {formData.reportingManagerName || currentEmp.reportingManagerName || 'Executive Office'}
                    <span style={{ fontSize: '0.74rem', color: '#64748B', marginLeft: '6px' }}>
                      ({formData.reportingManagerId || currentEmp.reportingManagerId || 'EMP-001'})
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Automatically applied permissions for selected role */}
            {(() => {
              const rbacStore = getInitialRBACState();
              const roleKey = Object.keys(rbacStore.permissionsByRole).find(k => 
                rbacStore.permissionsByRole[k].roleName.toLowerCase() === (formData.role || 'Employee').toLowerCase()
              );
              const config = roleKey ? rbacStore.permissionsByRole[roleKey] : undefined;
              const dataAccessScope = config ? config.dataAccess : ((formData.role === 'CEO' || formData.role === 'Super Admin' || formData.role === 'HR') ? 'all' : (formData.role === 'Manager' || formData.role === 'Team Leader' ? 'team' : 'own'));
              const activeModCount = config ? Object.keys(config.modulePermissions).filter(m => config.modulePermissions[m].length > 0).length : 6;
              const specialCount = config ? config.specialPermissions.length : 0;

              return (
                <div style={{
                  marginTop: '12px',
                  padding: '12px 14px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={15} color="#0E7490" />
                      <span>Role Permissions Configured: <strong>{activeModCount} HRMS Modules Authorized</strong></span>
                      {specialCount > 0 && <span style={{ color: '#0E7490' }}>• {specialCount} Special Authorities</span>}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                      Selecting role automatically applies the security permissions & policies configured in Settings &gt; Roles &amp; Permissions.
                    </div>
                  </div>

                  <div>
                    <span style={{
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: '9999px',
                      backgroundColor: dataAccessScope === 'all' ? '#DCFCE7' : (dataAccessScope === 'team' ? '#FEF3C7' : '#F1F5F9'),
                      color: dataAccessScope === 'all' ? '#15803D' : (dataAccessScope === 'team' ? '#B45309' : '#475569')
                    }}>
                      Data Access: {dataAccessScope === 'all' ? 'All Employee Data' : (dataAccessScope === 'team' ? 'Own + Team Data' : (dataAccessScope === 'department' ? 'Department Data' : 'Own Data Only'))}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Credential Dispatch Status */}
          <div>
            <label style={labelStyle}>Credential Email Status</label>
            <div style={viewValueStyle}>
              <span style={{
                backgroundColor: formData.credentialEmailStatus === 'SENT' ? '#DCFCE7' : '#FEE2E2',
                color: formData.credentialEmailStatus === 'SENT' ? '#15803D' : '#DC2626',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700
              }}>
                {formData.credentialEmailStatus}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
                ({formData.credentialEmailSentAt})
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-hidden flex flex-col"
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        zIndex: 9999, 
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* =========================================================================
          1. ENTERPRISE HEADER BANNER
          ========================================================================= */}
      <div 
        style={{ 
          background: 'linear-gradient(135deg, #0F172A 0%, #082F49 50%, #0E7490 100%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '18px 36px',
          flexShrink: 0,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div style={{ 
          maxWidth: '1440px', 
          width: '100%', 
          margin: '0 auto', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          {/* Left: Avatar + Identification details */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {renderAvatar()}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ 
                  fontSize: '1.45rem', 
                  fontWeight: 800, 
                  color: '#FFFFFF', 
                  margin: 0, 
                  letterSpacing: '-0.02em',
                  fontFamily: "'Plus Jakarta Sans', sans-serif"
                }}>
                  {formData.firstName} {formData.lastName}
                </h2>
                <span style={{ 
                  backgroundColor: 'rgba(14, 116, 144, 0.4)', 
                  border: '1px solid rgba(56, 189, 248, 0.35)', 
                  color: '#BAE6FD', 
                  fontSize: '0.76rem', 
                  padding: '2px 10px', 
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontFamily: 'monospace'
                }}>
                  {formData.employeeId}
                </span>
              </div>

              {/* Subtitle / Metadata row */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                marginTop: '6px', 
                marginBottom: '8px', 
                flexWrap: 'wrap',
                fontSize: '0.82rem',
                color: '#CBD5E1',
                fontWeight: 500
              }}>
                <span style={{ 
                  color: '#F8FAFC', 
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <Briefcase size={14} color="#38BDF8" /> {formData.designation}
                </span>
                <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
                <span style={{ 
                  color: '#CBD5E1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <Building size={14} color="#A78BFA" /> {formData.department}
                </span>
                <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
                <span style={{ 
                  color: '#94A3B8',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <Clock size={14} color="#FBBF24" /> {formData.shift}
                </span>
              </div>

              {/* Status Badges Row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: formData.status === 'Active' ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                  color: formData.status === 'Active' ? '#4ADE80' : '#F87171',
                  border: `1px solid ${formData.status === 'Active' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.74rem',
                  fontWeight: 700
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: formData.status === 'Active' ? '#22C55E' : '#EF4444'
                  }} />
                  {formData.status}
                </span>

                <span style={{ 
                  fontSize: '0.74rem', 
                  background: 'rgba(255, 255, 255, 0.09)', 
                  border: '1px solid rgba(255, 255, 255, 0.18)', 
                  padding: '3px 10px', 
                  borderRadius: '9999px', 
                  color: '#F1F5F9',
                  fontWeight: 650
                }}>
                  {formData.employmentType}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Actions (CEO/HR Edit Toggle, Offer Letter, Close) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* CEO / HR Edit Mode Controls */}
            {isCEOorHR && (
              <>
                {isEditing ? (
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    title="Save Changes"
                    aria-label="Save Changes"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      backgroundColor: '#0E7490',
                      color: '#FFFFFF',
                      border: '1px solid #38BDF8',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(14, 116, 144, 0.4)',
                      transition: 'all 0.18s ease',
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#0891B2';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#0E7490';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <Save size={18} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    title="Edit Details"
                    aria-label="Edit Details"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(14, 116, 144, 0.25)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      color: '#38BDF8',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      backdropFilter: 'blur(10px)',
                      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)',
                      transition: 'all 0.18s ease',
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(14, 116, 144, 0.45)';
                      e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.6)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(14, 116, 144, 0.25)';
                      e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <Edit3 size={18} color="#38BDF8" />
                  </button>
                )}
              </>
            )}

            {/* Offer Letter Button (Icon Only) */}
            <button
              type="button"
              onClick={() => setShowOfferLetterModal(true)}
              title="Generate Offer Letter"
              aria-label="Generate Offer Letter"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.09)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)',
                transition: 'all 0.18s ease',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.18)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.09)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <FileText size={18} color="#38BDF8" />
            </button>

            {/* Close / Back Button (Icon Only) */}
            <button 
              type="button"
              onClick={onClose} 
              title="Close Full Page (Esc)"
              aria-label="Close"
              style={{ 
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                flexShrink: 0,
                backdropFilter: 'blur(10px)',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.28)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.22)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <X size={19} />
            </button>
          </div>
        </div>
      </div>



      {/* =========================================================================
          3. MAIN SCROLLABLE DOSSIER (ONE BY ONE SEQUENTIAL CARDS)
          ========================================================================= */}
      <div 
        className="modal-body" 
        style={{ 
          padding: '28px 36px 64px 36px', 
          overflowY: 'auto', 
          flex: 1, 
          backgroundColor: '#F7F9FC' 
        }}
      >
        <div style={{ maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
          {/* Notification / Toast Banner */}
          {saveNotice && (
            <div style={{
              marginBottom: '20px',
              padding: '14px 18px',
              borderRadius: '12px',
              backgroundColor: '#ECFEFF',
              border: '1px solid #0E7490',
              color: '#0E7490',
              fontSize: '0.88rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 10px rgba(14, 116, 144, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={18} />
                <span>{saveNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setSaveNotice(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0E7490' }}
              >
                <X size={16} />
              </button>
            </div>
          )}


          {/* RENDER SECTIONS ONE BY ONE */}
          {renderPersonalSection()}
          {renderEmploymentSection()}
          {renderAddressSection()}
          {renderEducationSection()}
          {renderExperienceSection()}
          {renderSalarySection()}
          {renderShiftPolicySection()}
          {renderDocumentsSection()}
          {renderSystemAccessSection()}
        </div>
      </div>

      {/* =========================================================================
          4. SUB-MODALS (OFFER LETTER, RESET CONFIRM, STATUS TOGGLE)
          ========================================================================= */}

      {/* Offer Letter Modal */}
      {showOfferLetterModal && (
        <OfferLetterModal
          isOpen={showOfferLetterModal}
          onClose={() => setShowOfferLetterModal(false)}
          initialEmployee={currentEmp}
        />
      )}

      {/* Confirm Password Reset Modal */}
      {showResetConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '460px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #E2E8F0'
          }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              Reset Portal Login Credentials?
            </h4>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.84rem', color: '#64748B', lineHeight: 1.5 }}>
              This will generate a fresh secure temporary password and dispatch login instructions to <strong>{currentEmp.email}</strong>. The employee will be prompted to create a new password on their next login.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                disabled={isProcessingAction}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResetLogin}
                disabled={isProcessingAction}
                style={{
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {isProcessingAction ? 'Processing...' : 'Confirm & Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Status Toggle Modal */}
      {showStatusConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '460px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #E2E8F0'
          }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              {(statusToSet === 'DEACTIVATED' || statusToSet === 'DISABLED') ? 'Deactivate Portal Login Access?' : 'Activate Portal Login Access?'}
            </h4>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.84rem', color: '#64748B', lineHeight: 1.5 }}>
              {(statusToSet === 'DEACTIVATED' || statusToSet === 'DISABLED')
                ? `Are you sure you want to deactivate portal login privileges for ${currentEmp.firstName} ${currentEmp.lastName}? They will be immediately locked out of mobile and web portals.`
                : `Are you sure you want to activate portal login access for ${currentEmp.firstName} ${currentEmp.lastName}?`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowStatusConfirmModal(false)}
                disabled={isProcessingAction}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStatusToggle}
                disabled={isProcessingAction}
                style={{
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  backgroundColor: (statusToSet === 'DEACTIVATED' || statusToSet === 'DISABLED') ? '#DC2626' : '#059669',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {isProcessingAction ? 'Processing...' : (statusToSet === 'DEACTIVATED' || statusToSet === 'DISABLED') ? 'Deactivate Account' : 'Activate Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
