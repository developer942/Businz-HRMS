import React, { useState, useRef } from 'react';
import { CustomerContact, ExtractedCardDetails, WhatsAppConsentStatus, FieldVerificationStatus } from '../../types/customer';
import { customerService } from '../../services/customerService';
import { prepareImageForOcr, analyzeImageQuality, ImageQualityReport } from '../../utils/cardImageProcessor';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { useHRMS } from '../../context/HRMSContext';
import { VisitingCardScannerModal, ScanResult } from './VisitingCardScannerModal';
import {
  CustomerContactErrors,
  CustomerContactValues,
  CustomerField,
  normalizePhoneNumber,
  normalizeWebsite,
  validateCustomerContact,
  validateCustomerField
} from '../../utils/customerContactValidation';
import {
  Camera,
  Upload,
  FileText,
  Check,
  RotateCcw,
  RotateCw,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  User,
  Building,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  Globe,
  ZoomIn,
  Crop,
  X
} from 'lucide-react';

const FieldBadge: React.FC<{
  status?: FieldVerificationStatus;
  evidence?: string;
  reviewReason?: string;
}> = ({ status, evidence, reviewReason }) => {
  if (!status) return null;
  if (status === 'not_found') {
    return (
      <span
        title="Not detected on visiting card"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '0.68rem',
          fontWeight: 600,
          color: '#64748B',
          backgroundColor: '#F1F5F9',
          padding: '2px 8px',
          borderRadius: '9999px',
          marginLeft: '8px'
        }}
      >
        Not Found
      </span>
    );
  }

  if (status === 'valid') {
    return (
      <span
        title={evidence ? `Verified against card text: "${evidence}"` : 'Verified valid format'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '0.68rem',
          fontWeight: 600,
          color: '#15803D',
          backgroundColor: '#DCFCE7',
          padding: '2px 8px',
          borderRadius: '9999px',
          marginLeft: '8px'
        }}
      >
        <Check size={10} strokeWidth={3} /> Valid
      </span>
    );
  }

  return (
    <span
      title={reviewReason || (evidence ? `Card evidence: "${evidence}"` : 'Requires manual review')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '0.68rem',
        fontWeight: 600,
        color: '#B45309',
        backgroundColor: '#FEF3C7',
        padding: '2px 8px',
        borderRadius: '9999px',
        marginLeft: '8px'
      }}
    >
      <AlertTriangle size={10} strokeWidth={2.5} /> Needs Review
    </span>
  );
};

interface AddCustomerViewProps {
  onCustomerSaved?: (customer: CustomerContact) => void;
  onNavigateToRecords?: () => void;
}

export const AddCustomerView: React.FC<AddCustomerViewProps> = ({
  onCustomerSaved,
  onNavigateToRecords
}) => {
  const { currentUser } = useHRMS();

  // Mode Selection: 'camera' | 'upload' | 'manual'
  const [, setCaptureMode] = useState<'camera' | 'upload' | 'manual'>('camera');

  // Visiting Card Image state
  const [originalImageBase64, setOriginalImageBase64] = useState<string | null>(null);
  const [cardImageBase64, setCardImageBase64] = useState<string | null>(null);
  const [, setCardMimeType] = useState<string>('image/jpeg');
  const [previewTab, setPreviewTab] = useState<'cropped' | 'original'>('cropped');
  const [isScannerModalOpen, setIsScannerModalOpen] = useState<boolean>(false);
  const [scannerInitialTab, setScannerInitialTab] = useState<'camera' | 'upload'>('camera');
  const [scannerInitialStep, setScannerInitialStep] = useState<'capture' | 'crop'>('capture');
  const [, setQualityReport] = useState<ImageQualityReport | null>(null);
  const [isImageZoomed, setIsImageZoomed] = useState<boolean>(false);
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [ocrSuccess, setOcrSuccess] = useState<boolean>(false);
  const [ocrDetails, setOcrDetails] = useState<ExtractedCardDetails | null>(null);
  const pageFileInputRef = useRef<HTMLInputElement>(null);

  // Form Fields
  const customerId = 'Assigned when saved';
  const [customerName, setCustomerName] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [designation, setDesignation] = useState<string>('');
  const [contactNumber, setContactNumber] = useState<string>('');
  const [alternateContactNumber, setAlternateContactNumber] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [website, setWebsite] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // WhatsApp Consent (Strictly defaults to 'Unknown')
  const [consentStatus, setConsentStatus] = useState<WhatsAppConsentStatus>('Unknown');
  const [consentSource] = useState<string>('Visiting Card Submission');
  const [consentPurpose] = useState<string>('Business Communications & Product Updates');

  // Duplicate Warning Modal state
  const [duplicateWarning, setDuplicateWarning] = useState<CustomerContact | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<CustomerContact | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CustomerContactErrors>({});
  const [touchedFields, setTouchedFields] = useState<Partial<Record<CustomerField, boolean>>>({});
  const customerNameRef = useRef<HTMLInputElement>(null);
  const companyNameRef = useRef<HTMLInputElement>(null);
  const designationRef = useRef<HTMLInputElement>(null);
  const contactNumberRef = useRef<HTMLInputElement>(null);
  const alternateContactNumberRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const websiteRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);
  const ocrRequestIdRef = useRef(0);
  const userEditedFieldsRef = useRef<Set<CustomerField>>(new Set());
  const editVersionsRef = useRef<Record<CustomerField, number>>({
    customerName: 0,
    companyName: 0,
    designation: 0,
    contactNumber: 0,
    alternateContactNumber: 0,
    email: 0,
    website: 0,
    address: 0,
    notes: 0
  });

  const currentValues = (): CustomerContactValues => ({
    customerName,
    companyName,
    designation,
    contactNumber,
    alternateContactNumber,
    email,
    website,
    address,
    notes
  });

  const updateField = (field: CustomerField, value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    userEditedFieldsRef.current.add(field);
    editVersionsRef.current[field] += 1;
    setter(value);
    if (touchedFields[field]) {
      setFieldErrors(previous => ({ ...previous, [field]: validateCustomerField(field, value) }));
    }
  };

  const validateOnBlur = (field: CustomerField, value: string) => {
    setTouchedFields(previous => ({ ...previous, [field]: true }));
    setFieldErrors(previous => ({ ...previous, [field]: validateCustomerField(field, value) }));
  };

  const badgeStatus = (field: CustomerField, value: string, ocrStatus?: FieldVerificationStatus): FieldVerificationStatus | undefined => {
    if (!ocrDetails) return undefined;
    if (editVersionsRef.current[field] > 0) {
      if (!value.trim()) return 'not_found';
      return validateCustomerField(field, value) ? 'needs_review' : 'valid';
    }
    return ocrStatus;
  };

  // Interactive image rotation in high resolution
  const handleRotateImage = async (degrees: number) => {
    if (!cardImageBase64) return;
    try {
      const img = new Image();
      img.src = cardImageBase64;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const isRotated90or270 = Math.abs(degrees) === 90 || Math.abs(degrees) === 270;
      canvas.width = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
      canvas.height = isRotated90or270 ? img.naturalWidth : img.naturalHeight;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setCardImageBase64(rotatedDataUrl);
      triggerOcr(rotatedDataUrl, 'image/jpeg');
    } catch (err) {
      console.warn('Image rotation error:', err);
    }
  };

  // Direct File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
      setErrorMessage('Please upload a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const raw = reader.result as string;
      try {
        const prepared = await prepareImageForOcr(raw);
        const report = analyzeImageQuality(prepared.canvas);
        setCardImageBase64(prepared.dataUrl);
        setOriginalImageBase64(prepared.dataUrl);
        setQualityReport(report);
        setPreviewTab('cropped');
        triggerOcr(prepared.dataUrl, 'image/jpeg');
      } catch {
        setCardImageBase64(raw);
        setOriginalImageBase64(raw);
        triggerOcr(raw, file.type);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleOpenScanner = (tab: 'camera' | 'upload' = 'camera', step: 'capture' | 'crop' = 'capture') => {
    setScannerInitialTab(tab);
    setScannerInitialStep(step);
    setIsScannerModalOpen(true);
  };

  const handleScanComplete = (result: ScanResult) => {
    setOriginalImageBase64(result.originalImageBase64);
    setCardImageBase64(result.croppedImageBase64);
    setCardMimeType(result.mimeType);
    setQualityReport(result.qualityReport);
    setPreviewTab('cropped');
    triggerOcr(result.croppedImageBase64, result.mimeType);
  };

  // Trigger OCR Extraction
  const triggerOcr = async (imageBase64: string, mimeType: string) => {
    const requestId = ++ocrRequestIdRef.current;
    const startingVersions = { ...editVersionsRef.current };
    setOcrLoading(true);
    setOcrSuccess(false);
    setErrorMessage(null);
    try {
      const extracted = await customerService.scanCardOcr(imageBase64, mimeType);
      if (requestId !== ocrRequestIdRef.current) return;
      setOcrDetails(extracted);
      setOcrSuccess(true);

      const applyOcrValue = (field: CustomerField, value: string | null | undefined, setter: React.Dispatch<React.SetStateAction<string>>) => {
        if (value && !userEditedFieldsRef.current.has(field) && editVersionsRef.current[field] === startingVersions[field]) setter(value);
      };

      const person = extracted.person_name || extracted.customerName;
      applyOcrValue('customerName', person, setCustomerName);

      const comp = extracted.company_name || extracted.companyName;
      applyOcrValue('companyName', comp, setCompanyName);

      applyOcrValue('designation', extracted.designation, setDesignation);

      if (extracted.phone_numbers && extracted.phone_numbers.length > 0) {
        applyOcrValue('contactNumber', extracted.phone_numbers[0], setContactNumber);
        if (extracted.phone_numbers.length > 1) {
          applyOcrValue('alternateContactNumber', extracted.phone_numbers[1], setAlternateContactNumber);
        }
      } else if (extracted.contactNumber) {
        applyOcrValue('contactNumber', extracted.contactNumber, setContactNumber);
        if (extracted.alternateContactNumber) {
          applyOcrValue('alternateContactNumber', extracted.alternateContactNumber, setAlternateContactNumber);
        }
      }

      if (extracted.emails && extracted.emails.length > 0) {
        applyOcrValue('email', extracted.emails[0], setEmail);
      } else if (extracted.email) {
        applyOcrValue('email', extracted.email, setEmail);
      }

      applyOcrValue('address', extracted.address, setAddress);
      applyOcrValue('website', extracted.website, setWebsite);
      applyOcrValue('notes', extracted.notes, setNotes);
    } catch (err: any) {
      setErrorMessage(`OCR Notice: ${err.message || 'Auto-extraction failed'}. You can still review and enter fields manually.`);
    } finally {
      if (requestId === ocrRequestIdRef.current) setOcrLoading(false);
    }
  };

  const handleRetake = () => {
    setCardImageBase64(null);
    setOriginalImageBase64(null);
    setOcrDetails(null);
    setOcrSuccess(false);
    setQualityReport(null);
    handleOpenScanner('camera');
  };

  // Save Customer Flow
  const handleSubmit = async (bypassDuplicate = false) => {
    if (saving) return;
    setErrorMessage(null);
    const values = currentValues();
    const errors = validateCustomerContact(values);
    const allTouched = Object.keys(values).reduce<Partial<Record<CustomerField, boolean>>>((result, field) => {
      result[field as CustomerField] = true;
      return result;
    }, {});
    setTouchedFields(allTouched);
    setFieldErrors(errors);
    const firstInvalid = (Object.keys(values) as CustomerField[]).find(field => errors[field]);
    if (firstInvalid) {
      const refs: Partial<Record<CustomerField, React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>>> = {
        customerName: customerNameRef,
        companyName: companyNameRef,
        designation: designationRef,
        contactNumber: contactNumberRef,
        alternateContactNumber: alternateContactNumberRef,
        email: emailRef,
        website: websiteRef,
        address: addressRef
      };
      refs[firstInvalid]?.current?.focus();
      setErrorMessage('Please correct the highlighted customer details before saving.');
      return;
    }

    try {
      setSaving(true);
      if (!bypassDuplicate) {
        const check = await customerService.checkDuplicate(contactNumber, currentUser?.company_id || 'company-a');
        if (check.isDuplicate && check.existingCustomer) {
          setDuplicateWarning(check.existingCustomer);
          return;
        }
      }
      const normalizedPrimary = normalizePhoneNumber(contactNumber)!;
      const normalizedAlternate = alternateContactNumber.trim() ? normalizePhoneNumber(alternateContactNumber)! : undefined;
      const normalizedWebsite = website.trim() ? normalizeWebsite(website)! : undefined;
      const payload: Partial<CustomerContact> = {
        customerName: customerName.trim(),
        companyName: companyName.trim() || undefined,
        designation: designation.trim() || undefined,
        contactNumber: normalizedPrimary,
        alternateContactNumber: normalizedAlternate,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        website: normalizedWebsite,
        notes: notes.trim() || undefined,
        visitingCardUrl: cardImageBase64 || undefined,
        consentStatus,
        consentTimestamp: consentStatus === 'Opted In' ? new Date().toISOString() : undefined,
        consentSource: consentStatus === 'Opted In' ? consentSource : undefined,
        consentPurpose: consentStatus === 'Opted In' ? consentPurpose : undefined
      };

      const saved = await customerService.saveCustomer(payload);
      setSavedSuccess(saved);
      onCustomerSaved?.(saved);
      setDuplicateWarning(null);
    } catch (err: any) {
      if (err.existingCustomer) {
        setDuplicateWarning(err.existingCustomer);
      } else {
        setErrorMessage(err.message || 'Failed to save customer record');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetForm = () => {
    setCustomerName('');
    setCompanyName('');
    setDesignation('');
    setContactNumber('');
    setAlternateContactNumber('');
    setEmail('');
    setAddress('');
    setWebsite('');
    setNotes('');
    setConsentStatus('Unknown');
    setCardImageBase64(null);
    setOriginalImageBase64(null);
    setOcrDetails(null);
    setOcrSuccess(false);
    setSavedSuccess(null);
    setDuplicateWarning(null);
    setCaptureMode('camera');
    setFieldErrors({});
    setTouchedFields({});
    ocrRequestIdRef.current += 1;
    userEditedFieldsRef.current.clear();
    (Object.keys(editVersionsRef.current) as CustomerField[]).forEach(field => {
      editVersionsRef.current[field] = 0;
    });
  };

  return (
    <div className="customer-add-view-wrapper">
      {/* Hidden Direct File Input for One-Tap Photo Upload */}
      <input
        ref={pageFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Success Notification Banner */}
      {savedSuccess && (
        <div
          style={{
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: '14px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '9999px',
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <CheckCircle2 size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#065F46', fontSize: '0.96rem' }}>
                Customer Record Saved Successfully
              </div>
              <div style={{ fontSize: '0.82rem', color: '#047857', marginTop: '2px' }}>
                <strong>{savedSuccess.customerName}</strong> ({savedSuccess.customerId}) has been added to the directory.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleResetForm}
              style={{
                minHeight: '40px',
                padding: '0 14px',
                borderRadius: '10px',
                backgroundColor: '#FFFFFF',
                color: '#065F46',
                border: '1px solid #A7F3D0',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Add Another
            </button>
            <button
              type="button"
              onClick={onNavigateToRecords}
              style={{
                minHeight: '40px',
                padding: '0 16px',
                borderRadius: '10px',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              View Directory
            </button>
          </div>
        </div>
      )}

      {/* Main Content Layout: Split on Desktop when card is present, Single clean stack on Mobile */}
      <div className={`customer-add-layout ${cardImageBase64 ? 'has-card' : ''}`}>
        {/* Visiting Card Preview Column (Shown when a card has been captured/uploaded) */}
        {cardImageBase64 && (
          <div className="customer-card-preview-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E293B', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={15} color="#0E7490" />
                <span>Scanned Visiting Card</span>
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleRotateImage(90)}
                  title="Rotate 90°"
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    color: '#475569',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.73rem',
                    fontWeight: 600
                  }}
                >
                  <RotateCw size={13} /> Rotate
                </button>
                <button
                  type="button"
                  onClick={() => setIsImageZoomed(true)}
                  style={{
                    background: '#ECFEFF',
                    border: '1px solid #BAE6FD',
                    borderRadius: '8px',
                    color: '#0E7490',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.73rem',
                    fontWeight: 600
                  }}
                >
                  <ZoomIn size={13} /> Zoom
                </button>
              </div>
            </div>

            <div
              style={{
                position: 'relative',
                borderRadius: '14px',
                overflow: 'hidden',
                border: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
                textAlign: 'center'
              }}
            >
              <img
                src={cardImageBase64}
                alt="Visiting Card Preview"
                style={{
                  width: '100%',
                  maxHeight: '240px',
                  objectFit: 'contain',
                  display: 'block',
                  cursor: 'zoom-in'
                }}
                onClick={() => setIsImageZoomed(true)}
              />

              {/* Floating Edit/Crop Button on Bottom-Right of Card Image */}
              <button
                type="button"
                onClick={() => handleOpenScanner('camera', 'crop')}
                title="Adjust Card Crop"
                aria-label="Adjust Card Crop"
                style={{
                  position: 'absolute',
                  right: '10px',
                  bottom: '10px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '9999px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  color: '#0F172A',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <Crop size={15} />
              </button>

              {ocrLoading && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.88)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    color: '#0E7490',
                    fontWeight: 600,
                    fontSize: '0.85rem'
                  }}
                >
                  <Loader2 size={24} className="animate-spin" />
                  <span>Extracting card details with AI OCR...</span>
                </div>
              )}
            </div>

            {/* OCR Extraction Status Banner (Matches Screen 4 Reference) */}
            {ocrSuccess && !ocrLoading && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#DCFCE7',
                  border: '1px solid #BBF7D0',
                  color: '#15803D',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span>Details extracted successfully</span>
              </div>
            )}

            {/* Retake / Upload New Card Action */}
            <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={handleRetake}
                style={{
                  minHeight: '40px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={13} /> Rescan Card
              </button>
              <button
                type="button"
                onClick={() => pageFileInputRef.current?.click()}
                style={{
                  minHeight: '40px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1px solid #A5F3FC',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Upload size={13} /> Replace Photo
              </button>
            </div>

            {/* Transcribed Card Text Drawer */}
            {(ocrDetails?.raw_text || (ocrDetails?.visibleTextBlocks && ocrDetails.visibleTextBlocks.length > 0)) && (
              <div style={{ marginTop: '14px', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Transcribed Card Text
                </div>
                <div
                  style={{
                    fontSize: '0.74rem',
                    backgroundColor: '#F8FAFC',
                    color: '#334155',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    lineHeight: 1.45,
                    maxHeight: '110px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-line'
                  }}
                >
                  {ocrDetails.raw_text || ocrDetails.visibleTextBlocks?.join(' • ')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Customer Form Surface */}
        <div className="customer-form-surface">
          {/* Top Action Bar: Scan Card & Upload Photo (Matches Screen 2 Reference) */}
          <div className="customer-form-top-bar">
            <div className="customer-form-heading">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {cardImageBase64 ? 'Review & Save Contact' : 'Scan / Add Card'}
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0 0' }}>
                {cardImageBase64
                  ? 'Verify extracted details before saving to the directory'
                  : 'Capture a visiting card with AI OCR or enter contact details below'}
              </p>
            </div>

            <div className="customer-scan-upload-actions">
              <button
                type="button"
                onClick={() => handleOpenScanner('camera')}
                className="customer-action-scan-btn"
              >
                <Camera size={16} />
                <span>Scan Card</span>
              </button>

              <button
                type="button"
                onClick={() => pageFileInputRef.current?.click()}
                className="customer-action-upload-btn"
              >
                <Upload size={16} />
                <span>Upload Photo</span>
              </button>
            </div>
          </div>

          {errorMessage && (
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '10px',
                color: '#DC2626',
                fontSize: '0.84rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertTriangle size={17} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Balanced Form Grid: 2 Columns on Desktop, 1 Column on Mobile */}
          <div className="customer-form-grid">
            {/* Customer ID (Auto-generated) */}
            <div className="customer-field-group">
              <label className="customer-field-label" style={{ color: '#64748B' }}>
                Customer ID (Auto-Generated)
              </label>
              <input
                type="text"
                value={customerId}
                disabled
                className="customer-form-input disabled"
              />
            </div>

            {/* Customer Name * */}
            <div className="customer-field-group">
              <div className="customer-field-label-row">
                <label className="customer-field-label">
                  Customer Name <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <FieldBadge
                  status={badgeStatus('customerName', customerName, ocrDetails?.fields?.customerName?.status)}
                  evidence={ocrDetails?.fields?.customerName?.evidence}
                  reviewReason={ocrDetails?.fields?.customerName?.reviewReason}
                />
              </div>
              <div className="customer-input-icon-wrap">
                <User
                  size={16}
                  color={ocrDetails?.fields?.customerName?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'}
                  className="customer-input-leading-icon"
                />
                <input
                  ref={customerNameRef}
                  type="text"
                  value={customerName}
                  onChange={e => updateField('customerName', e.target.value, setCustomerName)}
                  onBlur={() => validateOnBlur('customerName', customerName)}
                  maxLength={120}
                  aria-invalid={Boolean(fieldErrors.customerName)}
                  placeholder="e.g. Rajesh Kumar"
                  style={{ paddingLeft: '46px' }}
                  className={`customer-form-input with-icon ${
                    fieldErrors.customerName
                      ? 'error'
                      : badgeStatus('customerName', customerName, ocrDetails?.fields?.customerName?.status) === 'needs_review'
                      ? 'warning'
                      : ''
                  }`}
                />
              </div>
              {fieldErrors.customerName && <div className="customer-field-error">{fieldErrors.customerName}</div>}
              {badgeStatus('customerName', customerName, ocrDetails?.fields?.customerName?.status) === 'needs_review' &&
                ocrDetails?.fields?.customerName?.reviewReason && (
                  <div className="customer-field-review-hint">
                    <AlertTriangle size={12} />
                    <span>{ocrDetails?.fields?.customerName?.reviewReason}</span>
                    {ocrDetails?.fields?.customerName?.evidence && !customerName && (
                      <button
                        type="button"
                        onClick={() => updateField('customerName', ocrDetails?.fields?.customerName?.evidence || '', setCustomerName)}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#0E7490', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        Use &ldquo;{ocrDetails?.fields?.customerName?.evidence}&rdquo;
                      </button>
                    )}
                  </div>
                )}
            </div>

            {/* Company Name */}
            <div className="customer-field-group">
              <div className="customer-field-label-row">
                <label className="customer-field-label">Company Name</label>
                <FieldBadge
                  status={badgeStatus('companyName', companyName, ocrDetails?.fields?.companyName?.status)}
                  evidence={ocrDetails?.fields?.companyName?.evidence}
                  reviewReason={ocrDetails?.fields?.companyName?.reviewReason}
                />
              </div>
              <div className="customer-input-icon-wrap">
                <Building
                  size={16}
                  color={ocrDetails?.fields?.companyName?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'}
                  className="customer-input-leading-icon"
                />
                <input
                  ref={companyNameRef}
                  type="text"
                  value={companyName}
                  onChange={e => updateField('companyName', e.target.value, setCompanyName)}
                  onBlur={() => validateOnBlur('companyName', companyName)}
                  maxLength={160}
                  aria-invalid={Boolean(fieldErrors.companyName)}
                  placeholder="e.g. Apex Technologies Ltd"
                  style={{ paddingLeft: '46px' }}
                  className={`customer-form-input with-icon ${
                    fieldErrors.companyName
                      ? 'error'
                      : badgeStatus('companyName', companyName, ocrDetails?.fields?.companyName?.status) === 'needs_review'
                      ? 'warning'
                      : ''
                  }`}
                />
              </div>
              {fieldErrors.companyName && <div className="customer-field-error">{fieldErrors.companyName}</div>}
              {badgeStatus('companyName', companyName, ocrDetails?.fields?.companyName?.status) === 'needs_review' &&
                ocrDetails?.fields?.companyName?.reviewReason && (
                  <div className="customer-field-review-hint">
                    <AlertTriangle size={12} />
                    <span>{ocrDetails?.fields?.companyName?.reviewReason}</span>
                    {ocrDetails?.fields?.companyName?.evidence && !companyName && (
                      <button
                        type="button"
                        onClick={() => updateField('companyName', ocrDetails?.fields?.companyName?.evidence || '', setCompanyName)}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#0E7490', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        Use &ldquo;{ocrDetails?.fields?.companyName?.evidence}&rdquo;
                      </button>
                    )}
                  </div>
                )}
            </div>

            {/* Designation */}
            <div className="customer-field-group">
              <div className="customer-field-label-row">
                <label className="customer-field-label">Designation</label>
                <FieldBadge
                  status={badgeStatus('designation', designation, ocrDetails?.fields?.designation?.status)}
                  evidence={ocrDetails?.fields?.designation?.evidence}
                  reviewReason={ocrDetails?.fields?.designation?.reviewReason}
                />
              </div>
              <div className="customer-input-icon-wrap">
                <Briefcase
                  size={16}
                  color={ocrDetails?.fields?.designation?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'}
                  className="customer-input-leading-icon"
                />
                <input
                  ref={designationRef}
                  type="text"
                  value={designation}
                  onChange={e => updateField('designation', e.target.value, setDesignation)}
                  onBlur={() => validateOnBlur('designation', designation)}
                  maxLength={120}
                  aria-invalid={Boolean(fieldErrors.designation)}
                  placeholder="e.g. Managing Director"
                  style={{ paddingLeft: '46px' }}
                  className={`customer-form-input with-icon ${
                    fieldErrors.designation
                      ? 'error'
                      : badgeStatus('designation', designation, ocrDetails?.fields?.designation?.status) === 'needs_review'
                      ? 'warning'
                      : ''
                  }`}
                />
              </div>
              {fieldErrors.designation && <div className="customer-field-error">{fieldErrors.designation}</div>}
            </div>

            {/* Multiple Phone Numbers Detected - Pill Selector */}
            {ocrDetails?.phone_numbers && ocrDetails.phone_numbers.length > 1 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '12px 14px'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  Multiple Phone Numbers Detected ({ocrDetails.phone_numbers.length}) — Select Primary WhatsApp Number:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {ocrDetails.phone_numbers.map((ph, idx) => {
                    const isSelected = contactNumber === ph;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          updateField('contactNumber', ph, setContactNumber);
                          const alt = ocrDetails.phone_numbers?.find(p => p !== ph);
                          if (alt) updateField('alternateContactNumber', alt, setAlternateContactNumber);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '9999px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: isSelected ? '1.5px solid #0E7490' : '1px solid #CBD5E1',
                          backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                          color: isSelected ? '#0E7490' : '#475569'
                        }}
                      >
                        <Phone size={12} />
                        <span>{ph}</span>
                        {isSelected ? (
                          <span style={{ fontSize: '0.65rem', backgroundColor: '#0E7490', color: '#FFFFFF', padding: '1px 6px', borderRadius: '9999px' }}>
                            Primary
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>Set Primary</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Contact Number * */}
            <div className="customer-field-group">
              <div className="customer-field-label-row">
                <label className="customer-field-label">
                  Contact Number (WhatsApp) <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <FieldBadge
                  status={badgeStatus('contactNumber', contactNumber, ocrDetails?.fields?.contactNumber?.status)}
                  evidence={ocrDetails?.fields?.contactNumber?.evidence}
                  reviewReason={ocrDetails?.fields?.contactNumber?.reviewReason}
                />
              </div>
              <div className="customer-input-icon-wrap">
                <Phone
                  size={16}
                  color={ocrDetails?.fields?.contactNumber?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'}
                  className="customer-input-leading-icon"
                />
                <input
                  ref={contactNumberRef}
                  type="tel"
                  inputMode="tel"
                  value={contactNumber}
                  onChange={e => updateField('contactNumber', e.target.value, setContactNumber)}
                  onBlur={() => validateOnBlur('contactNumber', contactNumber)}
                  maxLength={40}
                  aria-invalid={Boolean(fieldErrors.contactNumber)}
                  placeholder="e.g. +91 98765 43210"
                  style={{ paddingLeft: '46px' }}
                  className={`customer-form-input with-icon ${
                    fieldErrors.contactNumber
                      ? 'error'
                      : badgeStatus('contactNumber', contactNumber, ocrDetails?.fields?.contactNumber?.status) === 'needs_review'
                      ? 'warning'
                      : ''
                  }`}
                />
              </div>
              {fieldErrors.contactNumber && <div className="customer-field-error">{fieldErrors.contactNumber}</div>}
              {badgeStatus('contactNumber', contactNumber, ocrDetails?.fields?.contactNumber?.status) === 'needs_review' &&
                ocrDetails?.fields?.contactNumber?.reviewReason && (
                  <div className="customer-field-review-hint">
                    <AlertTriangle size={12} />
                    <span>{ocrDetails?.fields?.contactNumber?.reviewReason}</span>
                  </div>
                )}
            </div>

            {/* Alternate Contact Number */}
            <div className="customer-field-group">
              <div className="customer-field-label-row">
                <label className="customer-field-label">Alternate Contact Number</label>
                <FieldBadge
                  status={badgeStatus('alternateContactNumber', alternateContactNumber, ocrDetails?.fields?.alternateContactNumber?.status)}
                  evidence={ocrDetails?.fields?.alternateContactNumber?.evidence}
                  reviewReason={ocrDetails?.fields?.alternateContactNumber?.reviewReason}
                />
              </div>
              <div className="customer-input-icon-wrap">
                <Phone size={16} color="#94A3B8" className="customer-input-leading-icon" />
                <input
                  ref={alternateContactNumberRef}
                  type="tel"
                  inputMode="tel"
                  value={alternateContactNumber}
                  onChange={e => updateField('alternateContactNumber', e.target.value, setAlternateContactNumber)}
                  onBlur={() => validateOnBlur('alternateContactNumber', alternateContactNumber)}
                  maxLength={40}
                  aria-invalid={Boolean(fieldErrors.alternateContactNumber)}
                  placeholder="e.g. 044-24567890"
                  style={{ paddingLeft: '46px' }}
                  className={`customer-form-input with-icon ${
                    fieldErrors.alternateContactNumber
                      ? 'error'
                      : badgeStatus('alternateContactNumber', alternateContactNumber, ocrDetails?.fields?.alternateContactNumber?.status) === 'needs_review'
                      ? 'warning'
                      : ''
                  }`}
                />
              </div>
              {fieldErrors.alternateContactNumber && <div className="customer-field-error">{fieldErrors.alternateContactNumber}</div>}
            </div>

            {/* Multiple Email Addresses Detected - Pill Selector */}
            {ocrDetails?.emails && ocrDetails.emails.length > 1 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '12px 14px'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  Multiple Email Addresses Detected ({ocrDetails.emails.length}) — Choose Primary Email:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {ocrDetails.emails.map((em, idx) => {
                    const isSelected = email === em;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => updateField('email', em, setEmail)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '9999px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: isSelected ? '1.5px solid #0E7490' : '1px solid #CBD5E1',
                          backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                          color: isSelected ? '#0E7490' : '#475569'
                        }}
                      >
                        <Mail size={12} />
                        <span>{em}</span>
                        {isSelected && (
                          <span style={{ fontSize: '0.65rem', backgroundColor: '#0E7490', color: '#FFFFFF', padding: '1px 6px', borderRadius: '9999px' }}>
                            Selected
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Email Address */}
            <div className="customer-field-group">
              <div className="customer-field-label-row">
                <label className="customer-field-label">Email Address</label>
                <FieldBadge
                  status={badgeStatus('email', email, ocrDetails?.fields?.email?.status)}
                  evidence={ocrDetails?.fields?.email?.evidence}
                  reviewReason={ocrDetails?.fields?.email?.reviewReason}
                />
              </div>
              <div className="customer-input-icon-wrap">
                <Mail
                  size={16}
                  color={ocrDetails?.fields?.email?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'}
                  className="customer-input-leading-icon"
                />
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={e => updateField('email', e.target.value, setEmail)}
                  onBlur={() => validateOnBlur('email', email)}
                  maxLength={254}
                  aria-invalid={Boolean(fieldErrors.email)}
                  placeholder="e.g. rajesh@apex.com"
                  style={{ paddingLeft: '46px' }}
                  className={`customer-form-input with-icon ${
                    fieldErrors.email
                      ? 'error'
                      : badgeStatus('email', email, ocrDetails?.fields?.email?.status) === 'needs_review'
                      ? 'warning'
                      : ''
                  }`}
                />
              </div>
              {fieldErrors.email && <div className="customer-field-error">{fieldErrors.email}</div>}
              {badgeStatus('email', email, ocrDetails?.fields?.email?.status) === 'needs_review' &&
                ocrDetails?.fields?.email?.reviewReason && (
                  <div className="customer-field-review-hint">
                    <AlertTriangle size={12} />
                    <span>{ocrDetails?.fields?.email?.reviewReason}</span>
                  </div>
                )}
            </div>

            {/* Website */}
            <div className="customer-field-group">
              <div className="customer-field-label-row">
                <label className="customer-field-label">Website</label>
                <FieldBadge
                  status={badgeStatus('website', website, ocrDetails?.fields?.website?.status)}
                  evidence={ocrDetails?.fields?.website?.evidence}
                  reviewReason={ocrDetails?.fields?.website?.reviewReason}
                />
              </div>
              <div className="customer-input-icon-wrap">
                <Globe
                  size={16}
                  color={ocrDetails?.fields?.website?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'}
                  className="customer-input-leading-icon"
                />
                <input
                  ref={websiteRef}
                  type="url"
                  inputMode="url"
                  value={website}
                  onChange={e => updateField('website', e.target.value, setWebsite)}
                  onBlur={() => validateOnBlur('website', website)}
                  maxLength={2048}
                  aria-invalid={Boolean(fieldErrors.website)}
                  placeholder="e.g. www.apextechnologies.in"
                  style={{ paddingLeft: '46px' }}
                  className={`customer-form-input with-icon ${
                    fieldErrors.website
                      ? 'error'
                      : badgeStatus('website', website, ocrDetails?.fields?.website?.status) === 'needs_review'
                      ? 'warning'
                      : ''
                  }`}
                />
              </div>
              {fieldErrors.website && <div className="customer-field-error">{fieldErrors.website}</div>}
              {badgeStatus('website', website, ocrDetails?.fields?.website?.status) === 'needs_review' &&
                ocrDetails?.fields?.website?.reviewReason && (
                  <div className="customer-field-review-hint">
                    <AlertTriangle size={12} />
                    <span>{ocrDetails?.fields?.website?.reviewReason}</span>
                  </div>
                )}
            </div>

            {/* Full Address / Location */}
            <div className="customer-field-group full-span">
              <div className="customer-field-label-row">
                <label className="customer-field-label">Full Address / Location</label>
                <FieldBadge
                  status={badgeStatus('address', address, ocrDetails?.fields?.address?.status)}
                  evidence={ocrDetails?.fields?.address?.evidence}
                  reviewReason={ocrDetails?.fields?.address?.reviewReason}
                />
              </div>
              <div className="customer-input-icon-wrap textarea-wrap">
                <MapPin
                  size={16}
                  color={ocrDetails?.fields?.address?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'}
                  className="customer-input-leading-icon textarea-icon"
                />
                <textarea
                  ref={addressRef}
                  value={address}
                  onChange={e => updateField('address', e.target.value, setAddress)}
                  onBlur={() => validateOnBlur('address', address)}
                  maxLength={1000}
                  aria-invalid={Boolean(fieldErrors.address)}
                  rows={2}
                  placeholder="e.g. Plot No 42, Guindy Industrial Estate, Chennai 600032"
                  style={{ paddingLeft: '46px' }}
                  className={`customer-form-textarea with-icon ${
                    fieldErrors.address
                      ? 'error'
                      : badgeStatus('address', address, ocrDetails?.fields?.address?.status) === 'needs_review'
                      ? 'warning'
                      : ''
                  }`}
                />
              </div>
              {fieldErrors.address && <div className="customer-field-error">{fieldErrors.address}</div>}
              {badgeStatus('address', address, ocrDetails?.fields?.address?.status) === 'needs_review' &&
                ocrDetails?.fields?.address?.reviewReason && (
                  <div className="customer-field-review-hint">
                    <AlertTriangle size={12} />
                    <span>{ocrDetails?.fields?.address?.reviewReason}</span>
                  </div>
                )}
            </div>

            {/* Attribution Meta Fields */}
            <div className="customer-field-group">
              <label className="customer-field-label" style={{ color: '#64748B' }}>
                Collected By (Logged-in Employee)
              </label>
              <input
                type="text"
                value={currentUser?.name || 'Field Officer'}
                disabled
                className="customer-form-input disabled"
              />
            </div>

            <div className="customer-field-group">
              <label className="customer-field-label" style={{ color: '#64748B' }}>
                Collection Date
              </label>
              <input
                type="text"
                value={formatDateDDMMYYYY(new Date())}
                disabled
                className="customer-form-input disabled"
              />
            </div>
          </div>

          {/* Bottom Form Actions */}
          <div className="customer-form-actions">
            {cardImageBase64 && (
              <button
                type="button"
                onClick={handleRetake}
                className="customer-form-secondary-btn"
              >
                <RotateCcw size={15} />
                <span>Rescan</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleResetForm}
              className="customer-form-secondary-btn"
            >
              <span>Clear Form</span>
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={saving}
              className="customer-form-save-btn"
            >
              <Check size={17} />
              <span>{saving ? 'Saving...' : 'Save Customer'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Duplicate Customer Warning Dialog Modal */}
      {duplicateWarning && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            padding: '16px'
          }}
        >
          <div
            className="modal-content"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '500px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #E7ECF3'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#FEF3C7',
                  color: '#D97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1E293B' }}>
                  Duplicate Contact Warning
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                  A customer with this phone number already exists
                </p>
              </div>
            </div>

            <div
              style={{
                padding: '14px 16px',
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                marginBottom: '20px'
              }}
            >
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '4px' }}>Existing Record:</div>
              <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0F172A' }}>
                {duplicateWarning.customerName}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#0E7490', marginTop: '2px', fontWeight: 600 }}>
                ID: {duplicateWarning.customerId} • Phone: {duplicateWarning.contactNumber}
              </div>
              {duplicateWarning.companyName && (
                <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '2px' }}>
                  Company: {duplicateWarning.companyName}
                </div>
              )}
              <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: '6px' }}>
                Collected by {duplicateWarning.collectedByName} on{' '}
                {formatDateDDMMYYYY(duplicateWarning.collectedDate) || duplicateWarning.collectedDate}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                style={{
                  minHeight: '44px',
                  padding: '0 18px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flex: '1 1 auto'
                }}
              >
                Cancel &amp; Review
              </button>

              <button
                type="button"
                onClick={() => handleSubmit(true)}
                style={{
                  minHeight: '44px',
                  padding: '0 18px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flex: '1 1 auto'
                }}
              >
                Save Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Modal for Visiting Card Preview */}
      {isImageZoomed && cardImageBase64 && (
        <div
          className="modal-overlay"
          onClick={() => setIsImageZoomed(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20001,
            padding: '16px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '90vh',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '12px', gap: '12px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1E293B' }}>Visiting Card High-Resolution View</span>
              <button
                type="button"
                onClick={() => setIsImageZoomed(false)}
                aria-label="Close zoom preview"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={previewTab === 'cropped' ? cardImageBase64 : originalImageBase64 || cardImageBase64}
              alt="Visiting Card Zoomed"
              style={{
                maxWidth: '86vw',
                maxHeight: '76vh',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />
          </div>
        </div>
      )}

      {/* Full-Screen Apple-Style Visiting Card Scanner Modal */}
      <VisitingCardScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => {
          setIsScannerModalOpen(false);
        }}
        onScanComplete={handleScanComplete}
        initialMode={scannerInitialTab}
        existingImage={originalImageBase64 || cardImageBase64 || undefined}
        initialStep={scannerInitialStep}
      />
    </div>
  );
};
