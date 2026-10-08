import React, { useState, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { CompanyBranch, CompanyInfo } from '../../types/settings';
import { INITIAL_COMPANY_INFO } from '../../data/settingsInitialData';
import { CountryCodeDropdown } from '../common/CountryCodeDropdown';
import { 
  Building2, 
  MapPin, 
  Layers, 
  Edit3, 
  Plus, 
  Trash2, 
  Save, 
  CheckCircle2, 
  Globe, 
  Mail, 
  Phone, 
  FileText, 
  Clock, 
  Calendar, 
  User, 
  Users, 
  Briefcase, 
  X,
  RefreshCw,
  Upload,
  AlertCircle,
  Image as ImageIcon 
} from 'lucide-react';

type CompanyInfoFormErrors = Partial<Record<keyof CompanyInfo, string>>;

const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim();
const cleanCompanyText = (value: string) => value.replace(/[<>]/g, '').replace(/\s+/g, ' ');
const cleanAlphaNumeric = (value: string, maxLength?: number) => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, maxLength);
const cleanRocNumber = (value: string) => value.replace(/[^A-Za-z0-9/-]/g, '').toUpperCase().slice(0, 30);
const cleanPhoneNumber = (value: string) => value.replace(/\D/g, '').slice(0, 15);
const parsePhoneWithCountryCode = (value?: string) => {
  const raw = (value || '').trim();
  const match = raw.match(/^(\+\d{1,4})\s*(.*)$/);
  const countryCode = match?.[1] || '+91';
  const localNumber = cleanPhoneNumber(match ? match[2] : raw).replace(/^91(?=\d{10}$)/, '').slice(0, countryCode === '+91' ? 10 : 15);
  return { countryCode, localNumber };
};
const formatPhoneWithCountryCode = (countryCode: string, localNumber: string) => {
  const digits = cleanPhoneNumber(localNumber);
  return digits ? `${countryCode} ${digits}` : '';
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
const isValidPan = (value: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value);
const isValidGstin = (value: string) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value);
const isValidCin = (value: string) => /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(value);
const normalizeWebsite = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isValidWebsite = (value: string) => {
  if (!value || !value.trim()) return true;
  try {
    const url = new URL(normalizeWebsite(value));
    return url.hostname.includes('.');
  } catch {
    return false;
  }
};

const createBlankCompanyInfo = (): CompanyInfo => ({
  id: 'comp-root',
  company_id: 'company-a',
  companyCode: '',
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
  logoUrl: '',
  signatureImageUrl: '',
  stampImageUrl: '',
  createdAt: new Date().toISOString(),
  createdBy: 'Admin',
  updatedAt: new Date().toISOString(),
  updatedBy: 'Admin'
});

const optimizeImageFile = (file: File, maxSizeMb: number = 2): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (file.size > maxSizeMb * 1024 * 1024) {
      reject(new Error(`File size exceeds ${maxSizeMb}MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select a file under ${maxSizeMb}MB.`));
      return;
    }

    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read SVG file.'));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) {
        reject(new Error('Failed to read image.'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxDimension = 1200;
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const quality = outputType === 'image/jpeg' ? 0.9 : undefined;
        resolve(canvas.toDataURL(outputType, quality));
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
};

interface CompanyImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
  helperText?: string;
  accept?: string;
  maxSizeMb?: number;
}

const CompanyImageUploadField: React.FC<CompanyImageUploadFieldProps> = ({
  label,
  value,
  onChange,
  helperText = 'PNG, JPG, WEBP, SVG (Max 2MB)',
  accept = 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml',
  maxSizeMb = 2
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, JPEG, WEBP, SVG).');
      return;
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File size exceeds ${maxSizeMb}MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select a file under ${maxSizeMb}MB.`);
      return;
    }

    try {
      setIsProcessing(true);
      const optimizedUrl = await optimizeImageFile(file, maxSizeMb);
      onChange(optimizedUrl);
    } catch (err: any) {
      setError(err?.message || 'Failed to process image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <div>
      <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '6px', display: 'block' }}>
        {label}
      </label>

      {value ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '10px 14px',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div style={{
              width: '64px',
              height: '46px',
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              padding: '2px'
            }}>
              <img
                src={value}
                alt="Preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain'
                }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={14} color="#16A34A" /> Image Selected
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                {helperText}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#0E7490',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Upload size={13} /> Change
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              title="Remove image"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #FCA5A5',
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                cursor: 'pointer'
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: dragOver ? '2px dashed #0E7490' : '1px dashed #CBD5E1',
            borderRadius: '12px',
            backgroundColor: dragOver ? '#ECFEFF' : '#F8FAFC',
            padding: '16px 14px',
            textAlign: 'center',
            cursor: isProcessing ? 'wait' : 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Upload size={18} />
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B' }}>
            {isProcessing ? 'Processing image...' : 'Click to upload or drag & drop'}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
            {helperText}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={onFileInputChange}
        style={{ display: 'none' }}
      />

      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#DC2626',
          fontSize: '0.74rem',
          fontWeight: 600,
          marginTop: '6px'
        }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </div>
  );
};

export const CompanyDetailsSettings: React.FC = () => {
  const { 
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
    policyAuditLogs,
    currentUser,
    hasPermission,
    refreshSettings
  } = useHRMS();

  const isPrivileged = currentUser.role !== 'Employee';
  const [activeTab, setActiveTab] = useState<'info' | 'branches' | 'org'>('info');

  // Edit states for Company Info
  const [infoForm, setInfoForm] = useState<CompanyInfo>(() => {
    const base = companyInfo || INITIAL_COMPANY_INFO;
    const parsedPhone = parsePhoneWithCountryCode(base.officialPhone);
    return {
      ...base,
      companyCode: base.companyCode || '',
      officialPhone: parsedPhone.localNumber
    };
  });
  const [isEditingInfo, setIsEditingInfo] = useState(true);
  const [infoSavedSuccess, setInfoSavedSuccess] = useState(false);
  const [infoErrors, setInfoErrors] = useState<CompanyInfoFormErrors>({});
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [saveSuccessState, setSaveSuccessState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [validationSummary, setValidationSummary] = useState<string | null>(null);
  const [isInfoDirty, setIsInfoDirty] = useState(false);
  const [officialPhoneCountryCode, setOfficialPhoneCountryCode] = useState(
    () => parsePhoneWithCountryCode((companyInfo || INITIAL_COMPANY_INFO).officialPhone).countryCode
  );

  useEffect(() => {
    if (companyInfo && !isInfoDirty && !isSavingInfo) {
      const parsedPhone = parsePhoneWithCountryCode(companyInfo.officialPhone);
      setOfficialPhoneCountryCode(parsedPhone.countryCode);
      setInfoForm({
        ...companyInfo,
        companyCode: companyInfo.companyCode || '',
        officialPhone: parsedPhone.localNumber
      });
    }
  }, [companyInfo, isInfoDirty, isSavingInfo]);

  // Branch Modal State
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<CompanyBranch | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<CompanyBranch | null>(null);
  const [branchForm, setBranchForm] = useState<{
    branchName: string;
    branchCode: string;
    isHeadOffice: boolean;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    country: string;
    pincode: string;
    contactNumber: string;
    email: string;
    branchHr: string;
    workingDays: string[];
  }>({
    branchName: '',
    branchCode: '',
    isHeadOffice: false,
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: 'India',
    pincode: '',
    contactNumber: '',
    email: '',
    branchHr: '',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  });

  // Organization Master Add States
  const [newDept, setNewDept] = useState('');
  const [newDesig, setNewDesig] = useState('');
  const [newEmpType, setNewEmpType] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDept, setNewTeamDept] = useState(orgStructure.departments[0] || 'Engineering');
  const [newTeamLead, setNewTeamLead] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudSaveNotice, setCloudSaveNotice] = useState<string | null>(null);

  const showCloudNotice = (msg: string) => {
    setCloudSaveNotice(msg);
    setTimeout(() => setCloudSaveNotice(null), 3000);
  };

  const handleSyncSettings = async () => {
    setIsSyncing(true);
    await refreshSettings();
    showCloudNotice('Settings refreshed from VPS database!');
    setTimeout(() => setIsSyncing(false), 500);
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetNotice(null);
    setValidationSummary(null);

    const normalizedWebsite = infoForm.website.trim() 
      ? normalizeWebsite(infoForm.website)
      : '';
    const officialPhoneDigits = cleanPhoneNumber(infoForm.officialPhone).slice(0, officialPhoneCountryCode === '+91' ? 10 : 15);

    const normalized: CompanyInfo = {
      ...infoForm,
      companyName: cleanText(infoForm.companyName),
      legalCompanyName: cleanText(infoForm.legalCompanyName),
      companyCode: cleanAlphaNumeric(infoForm.companyCode || '', 10),
      industry: cleanText(infoForm.industry),
      registrationNumber: cleanRocNumber(infoForm.registrationNumber),
      gstNumber: cleanAlphaNumeric(infoForm.gstNumber, 15),
      panNumber: cleanAlphaNumeric(infoForm.panNumber, 10),
      cinNumber: cleanAlphaNumeric(infoForm.cinNumber, 21),
      logoUrl: (infoForm.logoUrl || '').trim(),
      website: normalizedWebsite,
      officialEmail: infoForm.officialEmail.trim().toLowerCase(),
      officialPhone: formatPhoneWithCountryCode(officialPhoneCountryCode, officialPhoneDigits),
      registeredAddress: (infoForm.registeredAddress || '').trim(),
      branchAddress: (infoForm.branchAddress || '').trim(),
      ownerName: cleanCompanyText(infoForm.ownerName || '').trim(),
      authorizedSignatoryName: cleanCompanyText(infoForm.authorizedSignatoryName || '').trim(),
      authorizedSignatoryDesignation: cleanCompanyText(infoForm.authorizedSignatoryDesignation || '').trim(),
      signatureImageUrl: (infoForm.signatureImageUrl || '').trim(),
      stampImageUrl: (infoForm.stampImageUrl || '').trim()
    };

    const errors: CompanyInfoFormErrors = {};
    if (!normalized.companyName.trim()) {
      errors.companyName = 'Company Name (Brand) is required.';
    }
    if (!normalized.companyCode?.trim()) {
      errors.companyCode = 'Company Code / Short Form is required (e.g. ACM, HDFC, SBI).';
    }
    if (normalized.registrationNumber && !/^[A-Z0-9/-]{3,30}$/.test(normalized.registrationNumber)) {
      errors.registrationNumber = 'ROC number must contain only letters, numbers, / or -.';
    }
    if (normalized.gstNumber && !isValidGstin(normalized.gstNumber)) {
      errors.gstNumber = 'Enter valid 15-character GSTIN, e.g. 33ABCDE1234F1Z5.';
    }
    if (normalized.panNumber && !isValidPan(normalized.panNumber)) {
      errors.panNumber = 'Enter valid PAN, e.g. ABCDE1234F.';
    }
    if (normalized.cinNumber && !isValidCin(normalized.cinNumber)) {
      errors.cinNumber = 'Enter valid 21-character CIN.';
    }
    if (normalized.website && !isValidWebsite(normalized.website)) {
      errors.website = 'Enter a valid website URL, e.g. https://company.com or company.com.';
    }
    if (normalized.officialEmail && !isValidEmail(normalized.officialEmail)) {
      errors.officialEmail = 'Enter a valid corporate email address.';
    }
    if (officialPhoneDigits) {
      if (officialPhoneCountryCode === '+91') {
        if (officialPhoneDigits.length !== 10) {
          errors.officialPhone = 'India phone number must be exactly 10 digits.';
        } else if (!/^[6-9]\d{9}$/.test(officialPhoneDigits)) {
          errors.officialPhone = 'India phone number must start with 6, 7, 8, or 9.';
        }
      } else if (officialPhoneDigits.length < 6 || officialPhoneDigits.length > 15) {
        errors.officialPhone = 'Phone number must contain 6 to 15 digits.';
      }
    }

    setInfoForm({ ...normalized, officialPhone: officialPhoneDigits });
    setInfoErrors(errors);

    if (Object.keys(errors).length > 0) {
      const errorCount = Object.keys(errors).length;
      const firstKey = Object.keys(errors)[0] as keyof CompanyInfo;
      setValidationSummary(`Cannot save: ${errorCount} error${errorCount > 1 ? 's' : ''} found (${errors[firstKey]}). Please check highlighted fields above.`);
      const el = document.querySelector(`[data-field="${firstKey}"]`) || document.querySelector(`[name="${firstKey}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el as HTMLElement).focus?.();
      }
      return;
    }

    setIsSavingInfo(true);
    setSaveSuccessState('saving');

    try {
      updateCompanyInfo(normalized);
      setIsInfoDirty(false);
      setSaveSuccessState('saved');
      setInfoSavedSuccess(true);
      showCloudNotice('Company details saved and synchronized across HRMS!');
      setTimeout(() => {
        setSaveSuccessState('idle');
        setInfoSavedSuccess(false);
      }, 3000);
    } catch (err: any) {
      setValidationSummary(`Save failed: ${err?.message || 'Unexpected error'}`);
      setSaveSuccessState('idle');
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleResetChanges = () => {
    setInfoErrors({});
    setValidationSummary(null);
    const restored = companyInfo || createBlankCompanyInfo();
    const parsedPhone = parsePhoneWithCountryCode(restored.officialPhone);
    setOfficialPhoneCountryCode(parsedPhone.countryCode);
    setInfoForm({ ...restored, officialPhone: parsedPhone.localNumber });
    setIsInfoDirty(false);
    setResetNotice('Changes reset to last saved company details.');
    setTimeout(() => setResetNotice(null), 3500);
  };

  const handleClearInfoClick = () => {
    setShowClearConfirmModal(true);
  };

  const handleConfirmClearInfo = () => {
    const blank = createBlankCompanyInfo();
    setInfoErrors({});
    setValidationSummary(null);
    setOfficialPhoneCountryCode('+91');
    setInfoForm(blank);
    setIsInfoDirty(false);
    updateCompanyInfo(blank);
    setShowClearConfirmModal(false);
    setResetNotice('All saved company details have been cleared.');
    showCloudNotice('Company details cleared from database.');
    setTimeout(() => setResetNotice(null), 3500);
  };

  const openAddBranchModal = () => {
    setEditingBranch(null);
    setBranchForm({
      branchName: '',
      branchCode: '',
      isHeadOffice: false,
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      country: 'India',
      pincode: '',
      contactNumber: '',
      email: '',
      branchHr: '',
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    });
    setIsBranchModalOpen(true);
  };

  const openEditBranchModal = (b: CompanyBranch) => {
    setEditingBranch(b);
    setBranchForm({
      branchName: b.branchName,
      branchCode: b.branchCode,
      isHeadOffice: b.isHeadOffice,
      addressLine1: b.address.addressLine1,
      addressLine2: b.address.addressLine2 || '',
      city: b.address.city,
      state: b.address.state,
      country: b.address.country,
      pincode: b.address.pincode,
      contactNumber: b.contactNumber,
      email: b.email,
      branchHr: b.branchHr,
      workingDays: b.workingDays
    });
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchForm.branchName || !branchForm.branchCode) return;

    if (editingBranch) {
      updateCompanyBranch(editingBranch.id, {
        branchName: branchForm.branchName,
        branchCode: branchForm.branchCode,
        isHeadOffice: branchForm.isHeadOffice,
        address: {
          addressLine1: branchForm.addressLine1,
          addressLine2: branchForm.addressLine2,
          city: branchForm.city,
          state: branchForm.state,
          country: branchForm.country,
          pincode: branchForm.pincode
        },
        contactNumber: branchForm.contactNumber,
        email: branchForm.email,
        branchHr: branchForm.branchHr,
        workingDays: branchForm.workingDays,
        workingHours: editingBranch.workingHours
      });
    } else {
      addCompanyBranch({
        branchName: branchForm.branchName,
        branchCode: branchForm.branchCode,
        isHeadOffice: branchForm.isHeadOffice,
        address: {
          addressLine1: branchForm.addressLine1,
          addressLine2: branchForm.addressLine2,
          city: branchForm.city,
          state: branchForm.state,
          country: branchForm.country,
          pincode: branchForm.pincode
        },
        contactNumber: branchForm.contactNumber,
        email: branchForm.email,
        branchHr: branchForm.branchHr,
        workingDays: branchForm.workingDays
      });
    }
    setIsBranchModalOpen(false);
  };

  // Edit Modal State for Org Structure items
  const [editingItem, setEditingItem] = useState<{
    type: 'dept' | 'desig' | 'empType' | 'location';
    oldValue: string;
    newValue: string;
  } | null>(null);

  const handleSaveEditedItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.newValue.trim()) return;
    const trimmed = editingItem.newValue.trim();
    if (editingItem.type === 'dept') {
      editDepartment(editingItem.oldValue, trimmed);
    } else if (editingItem.type === 'desig') {
      editDesignation(editingItem.oldValue, trimmed);
    } else if (editingItem.type === 'empType') {
      editEmploymentType(editingItem.oldValue, trimmed);
    } else if (editingItem.type === 'location') {
      editWorkLocation(editingItem.oldValue, trimmed);
    }
    setEditingItem(null);
  };

  const handleAddDept = () => {
    if (!newDept.trim() || orgStructure.departments.includes(newDept.trim())) return;
    const added = newDept.trim();
    updateOrgStructure({ departments: [...orgStructure.departments, added] });
    setNewDept('');
    showCloudNotice(`Department "${added}" saved to VPS database!`);
  };

  const handleAddDesig = () => {
    if (!newDesig.trim() || orgStructure.designations.includes(newDesig.trim())) return;
    const added = newDesig.trim();
    updateOrgStructure({ designations: [...orgStructure.designations, added] });
    setNewDesig('');
    showCloudNotice(`Designation "${added}" saved to VPS database!`);
  };

  const handleAddEmpType = () => {
    if (!newEmpType.trim() || orgStructure.employmentTypes.includes(newEmpType.trim())) return;
    const added = newEmpType.trim();
    updateOrgStructure({ employmentTypes: [...orgStructure.employmentTypes, added] });
    setNewEmpType('');
    showCloudNotice(`Employment Type "${added}" saved to VPS database!`);
  };

  const handleAddLocation = () => {
    if (!newLocation.trim() || orgStructure.workLocations.includes(newLocation.trim())) return;
    const added = newLocation.trim();
    updateOrgStructure({ workLocations: [...orgStructure.workLocations, added] });
    setNewLocation('');
    showCloudNotice(`Work Location "${added}" saved to VPS database!`);
  };

  const handleRemoveLocation = (locToRemove: string) => {
    removeOrgWorkLocation(locToRemove);
    showCloudNotice(`Location "${locToRemove}" removed.`);
  };

  const handleRemoveDept = (deptToRemove: string) => {
    removeOrgDepartment(deptToRemove);
    showCloudNotice(`Department "${deptToRemove}" removed from VPS database.`);
  };

  const handleRemoveDesig = (desigToRemove: string) => {
    removeOrgDesignation(desigToRemove);
    showCloudNotice(`Designation "${desigToRemove}" removed.`);
  };

  const handleRemoveEmpType = (typeToRemove: string) => {
    removeOrgEmploymentType(typeToRemove);
    showCloudNotice(`Employment type "${typeToRemove}" removed.`);
  };

  const handleAddTeam = () => {
    if (!newTeamName.trim()) return;
    const newTeam = {
      id: `TM-${Date.now()}`,
      name: newTeamName.trim(),
      departmentId: newTeamDept,
      leadEmployeeName: newTeamLead.trim() || 'Unassigned'
    };
    updateOrgStructure({ teams: [...orgStructure.teams, newTeam] });
    setNewTeamName('');
    setNewTeamLead('');
    showCloudNotice(`Team "${newTeam.name}" saved to VPS database!`);
  };

  const setInfoField = <K extends keyof CompanyInfo>(field: K, value: CompanyInfo[K]) => {
    setIsInfoDirty(true);
    setInfoForm(prev => ({ ...prev, [field]: value }));
    setInfoErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const getInfoInputStyle = (field: keyof CompanyInfo, extra?: React.CSSProperties): React.CSSProperties => ({
    ...(extra || {}),
    borderColor: infoErrors[field] ? '#EF4444' : undefined,
    boxShadow: infoErrors[field] ? '0 0 0 3px rgba(239, 68, 68, 0.10)' : undefined
  });

  const renderInfoError = (field: keyof CompanyInfo) => infoErrors[field] ? (
    <div style={{ color: '#DC2626', fontSize: '0.74rem', fontWeight: 600, marginTop: '5px' }}>
      {infoErrors[field]}
    </div>
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Navigation Sub-Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid #E2E8F0',
        paddingBottom: '2px'
      }}>
        <button
          onClick={() => setActiveTab('info')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '10px 10px 0 0',
            border: 'none',
            borderBottom: activeTab === 'info' ? '3px solid #0E7490' : '3px solid transparent',
            backgroundColor: activeTab === 'info' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'info' ? '#0E7490' : '#64748B',
            fontWeight: activeTab === 'info' ? 700 : 500,
            fontSize: '0.88rem',
            cursor: 'pointer'
          }}
        >
          <Building2 size={16} /> A. Basic Company Information
        </button>

        <button
          onClick={() => setActiveTab('branches')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '10px 10px 0 0',
            border: 'none',
            borderBottom: activeTab === 'branches' ? '3px solid #0E7490' : '3px solid transparent',
            backgroundColor: activeTab === 'branches' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'branches' ? '#0E7490' : '#64748B',
            fontWeight: activeTab === 'branches' ? 700 : 500,
            fontSize: '0.88rem',
            cursor: 'pointer'
          }}
        >
          <MapPin size={16} /> B. Address & Branches ({companyBranches.length})
        </button>

        <button
          onClick={() => setActiveTab('org')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '10px 10px 0 0',
            border: 'none',
            borderBottom: activeTab === 'org' ? '3px solid #0E7490' : '3px solid transparent',
            backgroundColor: activeTab === 'org' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'org' ? '#0E7490' : '#64748B',
            fontWeight: activeTab === 'org' ? 700 : 500,
            fontSize: '0.88rem',
            cursor: 'pointer'
          }}
        >
          <Layers size={16} /> C. Organization Structure
        </button>
      </div>

      {infoSavedSuccess && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          backgroundColor: '#DCFCE7',
          color: '#166534',
          borderRadius: '12px',
          fontSize: '0.88rem',
          fontWeight: 600
        }}>
          <CheckCircle2 size={18} /> Company details saved and logged into audit history successfully!
        </div>
      )}

      {/* TAB 1: BASIC COMPANY INFORMATION */}
      {activeTab === 'info' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ marginBottom: '22px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
              Corporate Legal & Identity Profile
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
              Enter registered legal details, tax identifiers, and official corporate channels
            </p>
          </div>

          <form id="company-info-form" noValidate onSubmit={handleSaveInfo} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            
            {/* SUB-SECTION 1: Legal & Brand Identity */}
            <div style={{
              backgroundColor: '#FAFCFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '20px 22px'
            }}>
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={17} color="#0E7490" />
                <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0F172A' }}>
                  1. Legal & Brand Identity
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Company Name (Brand) <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    data-field="companyName"
                    id="company-name-input"
                    className="form-control"
                    value={infoForm.companyName}
                    onChange={e => setInfoField('companyName', cleanCompanyText(e.target.value))}
                    style={getInfoInputStyle('companyName')}
                    placeholder="e.g. Acme Corporation Private Limited"
                  />
                  {renderInfoError('companyName')}
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Legal Registered Entity Name
                  </label>
                  <input
                    type="text"
                    data-field="legalCompanyName"
                    id="legal-company-name-input"
                    className="form-control"
                    value={infoForm.legalCompanyName}
                    onChange={e => setInfoField('legalCompanyName', cleanCompanyText(e.target.value))}
                    style={getInfoInputStyle('legalCompanyName')}
                    placeholder="e.g. Acme Corporation Pvt. Ltd."
                  />
                  {renderInfoError('legalCompanyName')}
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0E7490' }}>
                    Company Code / Short Form (e.g. HDFC, SBI, KVB) <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    data-field="companyCode"
                    id="company-code-input"
                    className="form-control"
                    value={infoForm.companyCode || ''}
                    onChange={e => setInfoField('companyCode', cleanAlphaNumeric(e.target.value, 10))}
                    placeholder="e.g. ACM, HDFC, SBI, KVB"
                    maxLength={10}
                    style={{
                      ...getInfoInputStyle('companyCode'),
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      borderColor: infoErrors.companyCode ? '#EF4444' : '#0E7490',
                      backgroundColor: '#F0FDFA'
                    }}
                  />
                  {renderInfoError('companyCode')}
                  <div style={{ fontSize: '0.72rem', color: '#0E7490', marginTop: '4px', fontWeight: 600 }}>
                    Used as the prefix in Employee ID generation (e.g. {infoForm.companyCode || 'EMP'}-001)
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Company Type
                  </label>
                  <select
                    className="form-control"
                    value={infoForm.companyType}
                    onChange={e => setInfoForm({ ...infoForm, companyType: e.target.value })}
                  >
                    <option value="">Select company type</option>
                    <option value="Private Limited">Private Limited (Pvt. Ltd.)</option>
                    <option value="Public Limited">Public Limited (Ltd.)</option>
                    <option value="Limited Liability Partnership">LLP</option>
                    <option value="Partnership">Partnership</option>
                    <option value="Sole Proprietorship">Sole Proprietorship</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Industry Sector
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={infoForm.industry}
                    onChange={e => setInfoField('industry', cleanCompanyText(e.target.value))}
                    placeholder="e.g. Information Technology, Manufacturing, Retail"
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    ROC Registration Number
                  </label>
                  <input
                    type="text"
                    data-field="registrationNumber"
                    id="roc-number-input"
                    className="form-control"
                    value={infoForm.registrationNumber}
                    onChange={e => setInfoField('registrationNumber', cleanRocNumber(e.target.value))}
                    style={getInfoInputStyle('registrationNumber')}
                    maxLength={30}
                    placeholder="e.g. ROC-CHENNAI-150000"
                  />
                  {renderInfoError('registrationNumber')}
                </div>
              </div>
            </div>

            {/* SUB-SECTION 2: Statutory & Tax Identifiers */}
            <div style={{
              backgroundColor: '#FAFCFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '20px 22px'
            }}>
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={17} color="#0E7490" />
                <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0F172A' }}>
                  2. Statutory & Tax Registration
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    GST Number (GSTIN)
                  </label>
                  <input
                    type="text"
                    data-field="gstNumber"
                    id="gst-number-input"
                    className="form-control"
                    value={infoForm.gstNumber}
                    onChange={e => setInfoField('gstNumber', cleanAlphaNumeric(e.target.value, 15))}
                    style={getInfoInputStyle('gstNumber')}
                    maxLength={15}
                    placeholder="33ABCDE1234F1Z5"
                  />
                  {renderInfoError('gstNumber')}
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    PAN Number
                  </label>
                  <input
                    type="text"
                    data-field="panNumber"
                    id="pan-number-input"
                    className="form-control"
                    value={infoForm.panNumber}
                    onChange={e => setInfoField('panNumber', cleanAlphaNumeric(e.target.value, 10))}
                    style={getInfoInputStyle('panNumber')}
                    maxLength={10}
                    placeholder="ABCDE1234F"
                  />
                  {renderInfoError('panNumber')}
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    CIN Number (Corporate Identification)
                  </label>
                  <input
                    type="text"
                    data-field="cinNumber"
                    id="cin-number-input"
                    className="form-control"
                    value={infoForm.cinNumber}
                    onChange={e => setInfoField('cinNumber', cleanAlphaNumeric(e.target.value, 21))}
                    style={getInfoInputStyle('cinNumber')}
                    maxLength={21}
                    placeholder="U12345TN2020PTC123456"
                  />
                  {renderInfoError('cinNumber')}
                </div>
              </div>
            </div>

            {/* SUB-SECTION 3: Official Communications */}
            <div style={{
              backgroundColor: '#FAFCFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '20px 22px'
            }}>
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={17} color="#0E7490" />
                <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0F172A' }}>
                  3. Official Corporate Communications
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Official Corporate Email
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <Mail size={15} style={{ position: 'absolute', left: '12px', color: '#94A3B8' }} />
                    <input
                      type="email"
                      data-field="officialEmail"
                      id="official-email-input"
                      className="form-control"
                      style={getInfoInputStyle('officialEmail', { paddingLeft: '34px' })}
                      value={infoForm.officialEmail}
                      onChange={e => setInfoField('officialEmail', e.target.value.trim().toLowerCase())}
                      placeholder="contact@company.com"
                    />
                  </div>
                  {renderInfoError('officialEmail')}
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Official Phone Number
                  </label>
                  <div style={{ display: 'flex', alignItems: 'stretch', position: 'relative' }}>
                    <CountryCodeDropdown
                      value={officialPhoneCountryCode}
                      onChange={(dialCode) => {
                        setOfficialPhoneCountryCode(dialCode);
                        setInfoField('officialPhone', cleanPhoneNumber(infoForm.officialPhone).slice(0, dialCode === '+91' ? 10 : 15));
                      }}
                      disabled={isSavingInfo}
                      id="official-phone-country-code"
                      style={{ flexShrink: 0 }}
                    />
                    <Phone size={15} style={{ position: 'absolute', left: '102px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', zIndex: 1 }} />
                    <input
                      type="tel"
                      data-field="officialPhone"
                      id="official-phone-input"
                      className="form-control"
                      style={getInfoInputStyle('officialPhone', {
                        paddingLeft: '34px',
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0
                      })}
                      value={cleanPhoneNumber(infoForm.officialPhone)}
                      onChange={e => setInfoField('officialPhone', cleanPhoneNumber(e.target.value).slice(0, officialPhoneCountryCode === '+91' ? 10 : 15))}
                      inputMode="numeric"
                      maxLength={officialPhoneCountryCode === '+91' ? 10 : 15}
                      placeholder="9876543210"
                    />
                  </div>
                  {renderInfoError('officialPhone')}
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Official Website
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <Globe size={15} style={{ position: 'absolute', left: '12px', color: '#94A3B8' }} />
                    <input
                      type="text"
                      data-field="website"
                      id="official-website-input"
                      className="form-control"
                      style={getInfoInputStyle('website', { paddingLeft: '34px' })}
                      value={infoForm.website}
                      onChange={e => setInfoField('website', e.target.value.trim())}
                      placeholder="https://company.com"
                    />
                  </div>
                  {renderInfoError('website')}
                </div>
              </div>
            </div>

            {/* SUB-SECTION 4: Office Addresses */}
            <div style={{
              backgroundColor: '#FAFCFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '20px 22px'
            }}>
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={17} color="#0E7490" />
                <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0F172A' }}>
                  4. Office & Operating Addresses
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Registered Office Address
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={infoForm.registeredAddress || ''}
                    onChange={e => setInfoField('registeredAddress', e.target.value)}
                    placeholder="e.g. 123 Corporate Park, Tech Corridor, City, State — 600001"
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Branch / Operating Address
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={infoForm.branchAddress || ''}
                    onChange={e => setInfoField('branchAddress', e.target.value)}
                    placeholder="e.g. Phase 2 Industrial Area, City, State — 560100"
                  />
                </div>
              </div>
            </div>

            {/* SUB-SECTION 5: Executive & Authorized Signatories */}
            <div style={{
              backgroundColor: '#FAFCFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '20px 22px'
            }}>
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={17} color="#0E7490" />
                <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0F172A' }}>
                  5. Executive Management & Signatories
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Owner / Director Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={infoForm.ownerName || ''}
                    onChange={e => setInfoField('ownerName', cleanCompanyText(e.target.value))}
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Authorized Signatory Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={infoForm.authorizedSignatoryName || ''}
                    onChange={e => setInfoField('authorizedSignatoryName', cleanCompanyText(e.target.value))}
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Authorized Signatory Designation
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={infoForm.authorizedSignatoryDesignation || ''}
                    onChange={e => setInfoField('authorizedSignatoryDesignation', cleanCompanyText(e.target.value))}
                    placeholder="e.g. Chief Executive Officer & Director"
                  />
                </div>
              </div>
            </div>

            {/* SUB-SECTION 6: Official Media & Document Branding Assets (Upload Cards) */}
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1.5px solid #0E7490',
              borderRadius: '14px',
              padding: '20px 22px',
              boxShadow: '0 2px 8px rgba(14, 116, 144, 0.05)'
            }}>
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ImageIcon size={18} color="#0E7490" />
                  <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                    6. Official Branding & Media Assets (Offer Letter & Payslip)
                  </h4>
                </div>
                <span style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: '#0E7490',
                  backgroundColor: '#ECFEFF',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  border: '1px solid #CFFAFE'
                }}>
                  Maximum 2 MB per file • PNG / JPG / WEBP / SVG
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
                <CompanyImageUploadField
                  label="Company Logo"
                  value={infoForm.logoUrl || ''}
                  onChange={dataUrl => setInfoField('logoUrl', dataUrl)}
                  helperText="PNG, JPG, WEBP, SVG (Max 2MB)"
                  maxSizeMb={2}
                />

                <CompanyImageUploadField
                  label="Authorized Signature Image"
                  value={infoForm.signatureImageUrl || ''}
                  onChange={dataUrl => setInfoField('signatureImageUrl', dataUrl)}
                  helperText="PNG, JPG, WEBP, SVG (Max 2MB)"
                  maxSizeMb={2}
                />

                <CompanyImageUploadField
                  label="Company Stamp Image"
                  value={infoForm.stampImageUrl || ''}
                  onChange={dataUrl => setInfoField('stampImageUrl', dataUrl)}
                  helperText="PNG, JPG, WEBP, SVG (Max 2MB)"
                  maxSizeMb={2}
                />
              </div>
            </div>

            {/* Status alerts right above the buttons */}
            {validationSummary && (
              <div
                id="company-info-validation-alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '12px',
                  color: '#991B1B',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  marginTop: '20px'
                }}
              >
                <AlertCircle size={18} color="#DC2626" style={{ flexShrink: 0 }} />
                <span>{validationSummary}</span>
              </div>
            )}

            {infoSavedSuccess && (
              <div
                id="company-info-success-alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  backgroundColor: '#DCFCE7',
                  border: '1px solid #86EFAC',
                  borderRadius: '12px',
                  color: '#166534',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  marginTop: '20px'
                }}
              >
                <CheckCircle2 size={18} color="#16A34A" style={{ flexShrink: 0 }} />
                <span>Company details saved and synchronized across all HRMS modules successfully!</span>
              </div>
            )}

            {resetNotice && (
              <div
                id="company-info-reset-alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '12px',
                  color: '#1E40AF',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  marginTop: '20px'
                }}
              >
                <CheckCircle2 size={18} color="#2563EB" style={{ flexShrink: 0 }} />
                <span>{resetNotice}</span>
              </div>
            )}

            {/* Bottom Action Bar with Save and Clear Buttons */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '12px',
              marginTop: '24px',
              paddingTop: '20px',
              borderTop: '1px solid #F1F5F9'
            }}>
              <button
                id="clear-company-details-btn"
                type="button"
                onClick={handleClearInfoClick}
                disabled={isSavingInfo}
                style={{
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1px solid #FCA5A5',
                  backgroundColor: '#FEF2F2',
                  color: '#B91C1C',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: isSavingInfo ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={e => !isSavingInfo && (e.currentTarget.style.backgroundColor = '#FEE2E2')}
                onMouseOut={e => !isSavingInfo && (e.currentTarget.style.backgroundColor = '#FEF2F2')}
              >
                Clear Saved Details
              </button>

              <button
                id="save-company-details-btn"
                type="submit"
                disabled={isSavingInfo}
                style={{
                  backgroundColor: saveSuccessState === 'saved' ? '#16A34A' : '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '11px 26px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: isSavingInfo ? 'not-allowed' : 'pointer',
                  boxShadow: saveSuccessState === 'saved'
                    ? '0 4px 14px rgba(22, 163, 74, 0.35)'
                    : '0 4px 14px rgba(14, 116, 144, 0.3)',
                  transition: 'all 0.2s ease',
                  opacity: isSavingInfo ? 0.75 : 1
                }}
                onMouseOver={e => {
                  if (!isSavingInfo && saveSuccessState !== 'saved') {
                    e.currentTarget.style.backgroundColor = '#0891B2';
                  }
                }}
                onMouseOut={e => {
                  if (!isSavingInfo && saveSuccessState !== 'saved') {
                    e.currentTarget.style.backgroundColor = '#0E7490';
                  }
                }}
              >
                {saveSuccessState === 'saving' ? (
                  <>
                    <RefreshCw size={17} style={{ animation: 'spin 1s linear infinite' }} />
                    Saving Details...
                  </>
                ) : saveSuccessState === 'saved' ? (
                  <>
                    <CheckCircle2 size={17} />
                    Saved Successfully!
                  </>
                ) : (
                  <>
                    <Save size={17} />
                    Save Company Details
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: ADDRESS & BRANCHES */}
      {activeTab === 'branches' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                Multi-Branch & Headquarters Network
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                Company hierarchy across Head Office, construction yards, engineering centers, and regional hubs
              </p>
            </div>
            {isPrivileged && (
              <button
                type="button"
                onClick={openAddBranchModal}
                style={{
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 13px',
                  fontWeight: 650,
                  fontSize: '0.80rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: '0 2px 6px rgba(14, 116, 144, 0.2)',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0891B2')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0E7490')}
              >
                <Plus size={14} strokeWidth={2.2} />
                <span>Add Branch</span>
              </button>
            )}
          </div>

          {companyBranches.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E7ECF3',
              color: '#64748B'
            }}>
              <Building2 size={40} color="#94A3B8" style={{ marginBottom: '12px' }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1E293B', marginBottom: '6px' }}>
                No Branches Configured
              </div>
              <div style={{ fontSize: '0.84rem', color: '#64748B', maxWidth: '400px', margin: '0 auto 16px' }}>
                Click the "+ Add Branch" button above to add your primary headquarters or branch offices manually.
              </div>
              {isPrivileged && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={openAddBranchModal}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={15} /> Add First Branch
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
              {companyBranches.map(branch => (
                <div
                  key={branch.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: branch.isHeadOffice ? '2px solid #0E7490' : '1px solid #E7ECF3',
                    padding: '20px',
                    position: 'relative',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                  }}
                >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                        {branch.branchName}
                      </h4>
                      {branch.isHeadOffice && (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          backgroundColor: '#ECFEFF',
                          color: '#0E7490',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          border: '1px solid #A5F3FC'
                        }}>
                          HEAD OFFICE
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
                      Code: {branch.branchCode}
                    </span>
                  </div>

                  {isPrivileged && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 8px' }}
                        onClick={() => openEditBranchModal(branch)}
                        title="Edit Branch"
                      >
                        <Edit3 size={14} />
                      </button>
                      {!branch.isHeadOffice && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', color: '#EF4444' }}
                          onClick={() => setBranchToDelete(branch)}
                          title="Delete Branch"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem', color: '#334155' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <MapPin size={15} color="#0E7490" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>
                      {branch.address.addressLine1}, {branch.address.addressLine2 ? `${branch.address.addressLine2}, ` : ''}
                      {branch.address.city}, {branch.address.state} - {branch.address.pincode}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Phone size={15} color="#64748B" />
                    <span>{branch.contactNumber || 'N/A'}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={15} color="#64748B" />
                    <span>{branch.email || 'N/A'}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={15} color="#64748B" />
                    <span>Branch HR Lead: <strong>{branch.branchHr || 'Unassigned'}</strong></span>
                  </div>

                  {branch.workingHours?.startTime && branch.workingHours?.endTime && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={15} color="#64748B" />
                      <span>Working Hours: <strong>{branch.workingHours.startTime} - {branch.workingHours.endTime}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* TAB 3: ORGANIZATION STRUCTURE */}
      {activeTab === 'org' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>


          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Departments */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={16} color="#0E7490" /> Departments ({orgStructure.departments.length})
                </h4>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Add new department..."
                  value={newDept}
                  onChange={e => setNewDept(e.target.value)}
                  className="form-control form-control-sm"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddDept(); } }}
                />
                <button className="btn btn-primary btn-sm" onClick={handleAddDept}>Add</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {orgStructure.departments.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontStyle: 'italic', padding: '6px 0' }}>
                    No departments added yet. Type above and click Add to create one.
                  </div>
                ) : (
                  orgStructure.departments.map(d => (
                    <span
                      key={d}
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        backgroundColor: '#F1F5F9',
                        color: '#1E293B',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <span>{d}</span>
                      <button
                        type="button"
                        onClick={() => setEditingItem({ type: 'dept', oldValue: d, newValue: d })}
                        title={`Edit ${d}`}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: '#0E7490',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDept(d)}
                        title={`Remove ${d}`}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: '#94A3B8',
                          fontSize: '14px',
                          lineHeight: 1,
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Designations */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Briefcase size={16} color="#0E7490" /> Designations ({orgStructure.designations.length})
                </h4>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Add new designation..."
                  value={newDesig.replace(/[0-9]/g, '')}
                  onChange={e => setNewDesig(e.target.value.replace(/[0-9]/g, ''))}
                  onKeyDown={e => { 
                    if (/^[0-9]$/.test(e.key)) {
                      e.preventDefault();
                      return;
                    }
                    if (e.key === 'Enter') { 
                      e.preventDefault(); 
                      handleAddDesig(); 
                    } 
                  }}
                  className="form-control form-control-sm"
                />
                <button className="btn btn-primary btn-sm" onClick={handleAddDesig}>Add</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {orgStructure.designations.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontStyle: 'italic', padding: '6px 0' }}>
                    No designations added yet. Type above and click Add to create one.
                  </div>
                ) : (
                  orgStructure.designations.map(d => (
                    <span
                      key={d}
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        backgroundColor: '#F1F5F9',
                        color: '#1E293B',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <span>{d}</span>
                      <button
                        type="button"
                        onClick={() => setEditingItem({ type: 'desig', oldValue: d, newValue: d })}
                        title={`Edit ${d}`}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: '#0E7490',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDesig(d)}
                        title={`Remove ${d}`}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: '#94A3B8',
                          fontSize: '14px',
                          lineHeight: 1,
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Employment Types */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={16} color="#0E7490" /> Employment Types ({orgStructure.employmentTypes.length})
                </h4>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Add employment type..."
                  value={newEmpType}
                  onChange={e => setNewEmpType(e.target.value)}
                  className="form-control form-control-sm"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmpType(); } }}
                />
                <button className="btn btn-primary btn-sm" onClick={handleAddEmpType}>Add</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {orgStructure.employmentTypes.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontStyle: 'italic', padding: '6px 0' }}>
                    No employment types added yet. Type above and click Add to create one.
                  </div>
                ) : (
                  orgStructure.employmentTypes.map(e => (
                    <span
                      key={e}
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        backgroundColor: '#ECFEFF',
                        color: '#0E7490',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <span>{e}</span>
                      <button
                        type="button"
                        onClick={() => setEditingItem({ type: 'empType', oldValue: e, newValue: e })}
                        title={`Edit ${e}`}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: '#0E7490',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveEmpType(e)}
                        title={`Remove ${e}`}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: '#0891B2',
                          fontSize: '14px',
                          lineHeight: 1,
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Work Locations */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={16} color="#0E7490" /> Work Locations ({orgStructure.workLocations.length})
                </h4>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Add location (any city/site)..."
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  className="form-control form-control-sm"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLocation(); } }}
                />
                <button className="btn btn-primary btn-sm" onClick={handleAddLocation}>Add</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {orgStructure.workLocations.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontStyle: 'italic', padding: '6px 0' }}>
                    No work locations added yet. Type above and click Add to create one.
                  </div>
                ) : (
                  orgStructure.workLocations.map(l => (
                    <span
                      key={l}
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        backgroundColor: '#FEF3C7',
                        color: '#92400E',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <span>{l}</span>
                      <button
                        type="button"
                        onClick={() => setEditingItem({ type: 'location', oldValue: l, newValue: l })}
                        title={`Edit ${l}`}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: '#92400E',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveLocation(l)}
                        title={`Remove ${l}`}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: '#B45309',
                          fontSize: '14px',
                          lineHeight: 1,
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Teams List */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '20px' }}>
            <h4 style={{ margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={16} color="#0E7490" /> Operational Teams & Squads ({orgStructure.teams.length})
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) 120px', gap: '8px', marginBottom: '14px' }}>
              <input
                type="text"
                placeholder="Team / Squad Name"
                className="form-control form-control-sm"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
              />
              <select
                className="form-control form-control-sm"
                value={newTeamDept}
                onChange={e => setNewTeamDept(e.target.value)}
              >
                {orgStructure.departments.length === 0 ? (
                  <option value="">No departments (Add dept first)</option>
                ) : (
                  orgStructure.departments.map(d => <option key={d} value={d}>{d}</option>)
                )}
              </select>
              <input
                type="text"
                placeholder="Lead Name"
                className="form-control form-control-sm"
                value={newTeamLead}
                onChange={e => setNewTeamLead(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" onClick={handleAddTeam}>Add Team</button>
            </div>

            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Team Name</th>
                  <th>Department</th>
                  <th>Lead / Head</th>
                </tr>
              </thead>
              <tbody>
                {orgStructure.teams.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '24px', color: '#94A3B8', fontStyle: 'italic' }}>
                      No operational teams configured yet. Use the form above to add a team.
                    </td>
                  </tr>
                ) : (
                  orgStructure.teams.map(t => (
                    <tr key={t.id}>
                      <td><strong>{t.name}</strong></td>
                      <td>{t.departmentId}</td>
                      <td>{t.leadEmployeeName || 'Unassigned'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BRANCH CREATE / EDIT MODAL */}
      {isBranchModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3>{editingBranch ? 'Edit Branch Office' : 'Add New Branch'}</h3>
              <button className="close-btn" title="Close" onClick={() => setIsBranchModalOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <form onSubmit={handleSaveBranch}>
              <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label className="form-label">Branch Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={branchForm.branchName}
                    onChange={e => setBranchForm({ ...branchForm, branchName: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Branch Code</label>
                  <input
                    type="text"
                    className="form-control"
                    value={branchForm.branchCode}
                    onChange={e => setBranchForm({ ...branchForm, branchCode: e.target.value })}
                    required
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Address Line 1</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Street / Plot / Highway"
                    value={branchForm.addressLine1}
                    onChange={e => setBranchForm({ ...branchForm, addressLine1: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-control"
                    value={branchForm.city}
                    onChange={e => setBranchForm({ ...branchForm, city: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">State</label>
                  <input
                    type="text"
                    className="form-control"
                    value={branchForm.state}
                    onChange={e => setBranchForm({ ...branchForm, state: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Pincode</label>
                  <input
                    type="text"
                    className="form-control"
                    value={branchForm.pincode}
                    onChange={e => setBranchForm({ ...branchForm, pincode: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Branch Contact Number</label>
                  <input
                    type="text"
                    className="form-control"
                    value={branchForm.contactNumber}
                    onChange={e => setBranchForm({ ...branchForm, contactNumber: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label">Branch Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={branchForm.email}
                    onChange={e => setBranchForm({ ...branchForm, email: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label">Branch HR Lead</label>
                  <input
                    type="text"
                    className="form-control"
                    value={branchForm.branchHr}
                    onChange={e => setBranchForm({ ...branchForm, branchHr: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsBranchModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingBranch ? 'Update Branch' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RENAME / EDIT MODAL FOR ORG STRUCTURE ITEMS */}
      {editingItem && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            maxWidth: '440px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)'
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
              Edit {editingItem.type === 'dept' ? 'Department' : editingItem.type === 'desig' ? 'Designation' : editingItem.type === 'empType' ? 'Employment Type' : 'Work Location'}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#64748B' }}>
              Rename <strong>{editingItem.oldValue}</strong>. Existing employees and records will update automatically.
            </p>
            <form onSubmit={handleSaveEditedItem}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  New Name / Title
                </label>
                <input
                  type="text"
                  value={editingItem.newValue}
                  onChange={e => setEditingItem({ ...editingItem, newValue: e.target.value })}
                  required
                  autoFocus
                  className="form-control"
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingItem(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IN-WEBSITE BRANCH DELETE CONFIRMATION MODAL */}
      {branchToDelete && (
        <div 
          className="modal-overlay" 
          style={{ 
            zIndex: 99999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div 
            className="modal-content" 
            style={{ 
              maxWidth: '460px', 
              width: '90%', 
              borderRadius: '20px', 
              padding: '28px 24px',
              textAlign: 'center',
              backgroundColor: '#FFFFFF',
              boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.15)',
              position: 'relative'
            }}
          >
            <button 
              type="button" 
              onClick={() => setBranchToDelete(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '8px'
              }}
              title="Close modal"
            >
              <X size={20} />
            </button>

            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FEE2E2',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Trash2 size={26} />
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 800, color: '#1E293B' }}>
              Delete Branch Location?
            </h3>
            
            <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: '#64748B', lineHeight: '1.5' }}>
              Are you sure you want to delete <strong style={{ color: '#0F172A' }}>&quot;{branchToDelete.branchName}&quot;</strong> (Code: {branchToDelete.branchCode})? This action will remove this branch from employee assignments and location registries.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: '10px 16px', borderRadius: '12px', fontWeight: 600 }}
                onClick={() => setBranchToDelete(null)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                style={{ 
                  flex: 1, 
                  padding: '10px 16px', 
                  borderRadius: '12px', 
                  fontWeight: 700,
                  backgroundColor: '#EF4444',
                  borderColor: '#EF4444',
                  color: '#FFFFFF'
                }}
                onClick={() => {
                  deleteCompanyBranch(branchToDelete.id);
                  showCloudNotice(`Branch "${branchToDelete.branchName}" removed.`);
                  setBranchToDelete(null);
                }}
              >
                Yes, Delete Branch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Company Info Confirmation Modal */}
      {showClearConfirmModal && (
        <div 
          className="modal-overlay" 
          style={{ 
            zIndex: 99999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            position: 'fixed',
            inset: 0
          }}
        >
          <div 
            className="modal-content" 
            style={{ 
              maxWidth: '460px', 
              width: '90%', 
              borderRadius: '20px', 
              padding: '28px 24px',
              textAlign: 'center',
              backgroundColor: '#FFFFFF',
              boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.15)',
              position: 'relative'
            }}
          >
            <button 
              type="button" 
              onClick={() => setShowClearConfirmModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '8px'
              }}
              title="Close modal"
            >
              <X size={20} />
            </button>

            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Trash2 size={26} />
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 800, color: '#1E293B' }}>
              Clear Saved Company Details?
            </h3>
            
            <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: '#64748B', lineHeight: '1.5' }}>
              Are you sure you want to clear all company fields? All legal names, registration identifiers, contacts, and addresses will be emptied.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: '10px 16px', borderRadius: '12px', fontWeight: 600 }}
                onClick={() => setShowClearConfirmModal(false)}
              >
                Cancel
              </button>
              <button 
                id="confirm-clear-company-btn"
                type="button" 
                className="btn btn-danger" 
                style={{ 
                  flex: 1, 
                  padding: '10px 16px', 
                  borderRadius: '12px', 
                  fontWeight: 700,
                  backgroundColor: '#DC2626',
                  borderColor: '#DC2626',
                  color: '#FFFFFF'
                }}
                onClick={handleConfirmClearInfo}
              >
                Yes, Clear Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

