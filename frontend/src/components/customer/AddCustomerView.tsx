import React, { useState, useRef, useEffect } from 'react';
import { CustomerContact, ExtractedCardDetails, WhatsAppConsentStatus, FieldVerificationStatus } from '../../types/customer';
import { customerService } from '../../services/customerService';
import { getStoredGeminiOcrModel } from '../../services/geminiApiService';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { useHRMS } from '../../context/HRMSContext';
import { VisitingCardScannerModal, ScanResult } from './VisitingCardScannerModal';
import { ImageQualityReport } from '../../utils/cardImageProcessor';
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
  Phone, 
  Mail, 
  MapPin, 
  Globe, 
  ShieldCheck, 
  ShieldAlert,
  HelpCircle,
  Eye,
  Trash2,
  ZoomIn,
  Crop,
  Layers,
  Sliders,
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
          fontSize: '0.7rem',
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
          fontSize: '0.7rem',
          fontWeight: 600,
          color: '#15803D',
          backgroundColor: '#DCFCE7',
          padding: '2px 8px',
          borderRadius: '9999px',
          marginLeft: '8px'
        }}
      >
        <Check size={11} strokeWidth={3} /> Valid
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
        fontSize: '0.7rem',
        fontWeight: 600,
        color: '#B45309',
        backgroundColor: '#FEF3C7',
        padding: '2px 8px',
        borderRadius: '9999px',
        marginLeft: '8px'
      }}
    >
      <AlertTriangle size={11} strokeWidth={2.5} /> Needs Review
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
  const [captureMode, setCaptureMode] = useState<'camera' | 'upload' | 'manual'>('manual');

  // Visiting Card Image state
  const [originalImageBase64, setOriginalImageBase64] = useState<string | null>(null);
  const [cardImageBase64, setCardImageBase64] = useState<string | null>(null);
  const [cardMimeType, setCardMimeType] = useState<string>('image/jpeg');
  const [previewTab, setPreviewTab] = useState<'cropped' | 'original'>('cropped');
  const [isScannerModalOpen, setIsScannerModalOpen] = useState<boolean>(false);
  const [scannerInitialTab, setScannerInitialTab] = useState<'camera' | 'upload'>('camera');
  const [scannerInitialStep, setScannerInitialStep] = useState<'capture' | 'crop'>('capture');
  const [qualityReport, setQualityReport] = useState<ImageQualityReport | null>(null);
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
  const [consentSource, setConsentSource] = useState<string>('Visiting Card Submission');
  const [consentMethod, setConsentMethod] = useState<string>('Physical Visiting Card');
  const [consentPurpose, setConsentPurpose] = useState<string>('Business Communications & Product Updates');

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

  // Step 3: Interactive image rotation in high resolution
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

  // 2. Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
      setErrorMessage('Please upload a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCardImageBase64(result);
      triggerOcr(result, file.type);
    };
    reader.readAsDataURL(file);
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

  // 3. Trigger OCR Extraction
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

      // Distinguish multiple phone numbers without combining
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

      // Distinguish multiple emails
      if (extracted.emails && extracted.emails.length > 0) {
        applyOcrValue('email', extracted.emails[0], setEmail);
      } else if (extracted.email) {
        applyOcrValue('email', extracted.email, setEmail);
      }

      applyOcrValue('address', extracted.address, setAddress);
      applyOcrValue('website', extracted.website, setWebsite);
      applyOcrValue('notes', extracted.notes, setNotes);
    } catch (err: any) {
      // Failed scans must NOT lose entered details
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

  // 4. Save Customer Flow
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
    setCaptureMode('manual');
    setFieldErrors({});
    setTouchedFields({});
    ocrRequestIdRef.current += 1;
    userEditedFieldsRef.current.clear();
    (Object.keys(editVersionsRef.current) as CustomerField[]).forEach(field => { editVersionsRef.current[field] = 0; });
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Banner Card */}
      <div className="customer-card-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', width: '100%' }}>
          <div style={{ minWidth: 0, flex: '1 1 240px' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#1E293B', margin: '0 0 4px 0', lineHeight: 1.25 }}>
              Add New Customer
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0, wordBreak: 'break-word' }}>
              Capture customer visiting card via camera or file upload with instant AI OCR, or enter details manually.
            </p>
          </div>

          {/* Mode Selector Segmented Tabs */}
          <div className="customer-mode-selector">
            <button
              type="button"
              onClick={() => { setCaptureMode('camera'); handleOpenScanner('camera'); }}
              className="customer-mode-btn"
              style={{
                backgroundColor: captureMode === 'camera' ? '#0E7490' : 'transparent',
                color: captureMode === 'camera' ? '#FFFFFF' : '#475569',
                boxShadow: captureMode === 'camera' ? '0 1px 3px rgba(14, 116, 144, 0.35)' : 'none'
              }}
            >
              <Camera size={14} style={{ flexShrink: 0 }} />
              <span>Scan Card</span>
            </button>

            <button
              type="button"
              onClick={() => { setCaptureMode('upload'); handleOpenScanner('upload'); }}
              className="customer-mode-btn"
              style={{
                backgroundColor: captureMode === 'upload' ? '#0E7490' : 'transparent',
                color: captureMode === 'upload' ? '#FFFFFF' : '#475569',
                boxShadow: captureMode === 'upload' ? '0 1px 3px rgba(14, 116, 144, 0.35)' : 'none'
              }}
            >
              <Upload size={14} style={{ flexShrink: 0 }} />
              <span>Upload Photo</span>
            </button>

            <button
              type="button"
              onClick={() => { setCaptureMode('manual'); }}
              className="customer-mode-btn"
              style={{
                backgroundColor: captureMode === 'manual' ? '#0E7490' : 'transparent',
                color: captureMode === 'manual' ? '#FFFFFF' : '#475569',
                boxShadow: captureMode === 'manual' ? '0 1px 3px rgba(14, 116, 144, 0.35)' : 'none'
              }}
            >
              <FileText size={14} style={{ flexShrink: 0 }} />
              <span>Manual Entry</span>
            </button>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {savedSuccess && (
        <div style={{
          backgroundColor: '#ECFDF5',
          border: '1px solid #A7F3D0',
          borderRadius: '16px',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#10B981',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#065F46', fontSize: '1.05rem' }}>
                Customer Record Saved Successfully!
              </div>
              <div style={{ fontSize: '0.85rem', color: '#047857', marginTop: '2px' }}>
                <strong>{savedSuccess.customerName}</strong> ({savedSuccess.customerId}) has been saved to the database.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleResetForm}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                backgroundColor: '#FFFFFF',
                color: '#065F46',
                border: '1px solid #A7F3D0',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Add Another Customer
            </button>
            <button
              onClick={onNavigateToRecords}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              View in Customer Records
            </button>
          </div>
        </div>
      )}



      {/* Main Content Area: Side-by-Side Split when card is present */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: cardImageBase64 ? 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' : '1fr',
        gap: '20px',
        alignItems: 'start',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Left Column: Sticky Visiting Card Preview & Tools (when card is captured) */}
        {cardImageBase64 && (
          <div className="customer-card-box" style={{
            position: 'sticky',
            top: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={16} color="#0E7490" />
                Visiting Card Preview
              </span>
              <button
                type="button"
                onClick={() => setIsImageZoomed(true)}
                style={{ background: 'none', border: 'none', color: '#0E7490', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}
              >
                <ZoomIn size={14} /> Full View
              </button>
            </div>

            <div style={{
              position: 'relative',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
              textAlign: 'center'
            }}>
              <img
                src={cardImageBase64}
                alt="Visiting Card Preview"
                style={{
                  width: '100%',
                  maxHeight: '300px',
                  objectFit: 'contain',
                  display: 'block',
                  cursor: 'zoom-in'
                }}
                onClick={() => setIsImageZoomed(true)}
              />
              {ocrLoading && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  backdropFilter: 'blur(2px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  color: '#0E7490',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}>
                  <Loader2 size={24} className="animate-spin" />
                  Analyzing Card Layout...
                </div>
              )}
            </div>

            {/* Action Toolbar */}
            <div style={{ marginTop: '12px' }}>
              <button
                type="button"
                onClick={handleRetake}
                title="Retake or Upload New Card"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #FCA5A5',
                  backgroundColor: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <RotateCcw size={14} /> Retake
              </button>
            </div>

            {/* Stage A Transcribed Text Drawer */}
            {(ocrDetails?.raw_text || (ocrDetails?.visibleTextBlocks && ocrDetails.visibleTextBlocks.length > 0)) && (
              <div style={{ marginTop: '16px', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Transcribed Card Text
                </div>
                <div style={{
                  fontSize: '0.72rem',
                  backgroundColor: '#F8FAFC',
                  color: '#334155',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  lineHeight: 1.45,
                  maxHeight: '120px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-line'
                }}>
                  {ocrDetails.raw_text || ocrDetails.visibleTextBlocks?.join(' • ')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Right Column: Main Customer Form */}
        <div className="customer-card-box">
          <div style={{ marginBottom: '18px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#1E293B', margin: 0 }}>
              Customer Details
            </h3>
          </div>

          {/* Active Mode Banner: Camera Scanner */}
          {!cardImageBase64 && captureMode === 'camera' && (
            <div style={{
              backgroundColor: '#ECFEFF',
              border: '1px solid #A5F3FC',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'space-between',
              flexDirection: 'column',
              gap: '12px',
              marginBottom: '20px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Camera size={20} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#0E7490', fontSize: '0.95rem' }}>
                    Camera Card Scanner Mode
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#155E75', marginTop: '2px', wordBreak: 'break-word' }}>
                    Capture visiting card via camera with automatic edge detection & AI text extraction.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => handleOpenScanner('camera')}
                  style={{
                    flex: '1 1 140px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: '#0E7490',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(14, 116, 144, 0.25)'
                  }}
                >
                  <Camera size={14} /> Open Camera Scanner
                </button>
                <button
                  type="button"
                  onClick={() => { setCaptureMode('upload'); handleOpenScanner('upload'); }}
                  style={{
                    flex: '1 1 140px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: '#FFFFFF',
                    color: '#0E7490',
                    border: '1px solid #A5F3FC',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Upload size={14} /> Upload Photo Instead
                </button>
              </div>
            </div>
          )}

          {/* Active Mode Banner: File Upload Dropzone */}
          {!cardImageBase64 && captureMode === 'upload' && (
            <div
              onClick={() => pageFileInputRef.current?.click()}
              style={{
                backgroundColor: '#F8FAFC',
                border: '2px dashed #CBD5E1',
                borderRadius: '12px',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                marginBottom: '20px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'border-color 0.15s ease'
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
                    setErrorMessage('Please upload a valid image file (JPG, PNG, or WEBP).');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = reader.result as string;
                    setCardImageBase64(result);
                    triggerOcr(result, file.type);
                  };
                  reader.readAsDataURL(file);
                }
              }}
            >
              <input
                ref={pageFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Upload size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.95rem' }}>
                  Click to Browse or Drag & Drop Visiting Card Photo
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                  Supports JPG, PNG, WEBP. Fast AI OCR will automatically populate fields.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); pageFileInputRef.current?.click(); }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    backgroundColor: '#0E7490',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Upload size={14} /> Select File
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleOpenScanner('upload'); }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    border: '1px solid #CBD5E1',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Crop size={14} /> Open Scanner & Cropper
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '10px',
              color: '#DC2626',
              fontSize: '0.875rem',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertTriangle size={18} />
              {errorMessage}
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
            gap: '16px',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            {/* Customer ID (Auto-generated) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
                Customer ID (Auto-Generated)
              </label>
              <input
                type="text"
                value={customerId}
                disabled
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#F1F5F9',
                  color: '#64748B',
                  fontSize: '0.9rem',
                  fontWeight: 600
                }}
              />
            </div>

            {/* Customer Name * with FieldBadge */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                  Customer Name *
                </label>
                <FieldBadge
                  status={badgeStatus('customerName', customerName, ocrDetails?.fields?.customerName?.status)}
                  evidence={ocrDetails?.fields?.customerName?.evidence}
                  reviewReason={ocrDetails?.fields?.customerName?.reviewReason}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  ref={customerNameRef}
                  type="text"
                  value={customerName}
                  onChange={e => updateField('customerName', e.target.value, setCustomerName)}
                  onBlur={() => validateOnBlur('customerName', customerName)}
                  maxLength={120}
                  aria-invalid={Boolean(fieldErrors.customerName)}
                  placeholder="e.g. Rajesh Kumar"
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '10px',
                    border: fieldErrors.customerName ? '1.5px solid #DC2626' : badgeStatus('customerName', customerName, ocrDetails?.fields?.customerName?.status) === 'needs_review' ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                    backgroundColor: badgeStatus('customerName', customerName, ocrDetails?.fields?.customerName?.status) === 'needs_review' ? '#FFFBEB' : '#FFFFFF',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <User size={16} color={ocrDetails?.fields?.customerName?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'} style={{ position: 'absolute', left: '12px', top: '13px' }} />
              </div>
              {fieldErrors.customerName && <div style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '4px' }}>{fieldErrors.customerName}</div>}
              {badgeStatus('customerName', customerName, ocrDetails?.fields?.customerName?.status) === 'needs_review' && ocrDetails?.fields?.customerName?.reviewReason && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#B45309', marginTop: '4px' }}>
                  <AlertTriangle size={12} />
                  <span>{ocrDetails?.fields?.customerName?.reviewReason}</span>
                  {ocrDetails?.fields?.customerName?.evidence && !customerName && (
                    <button
                      type="button"
                      onClick={() => updateField('customerName', ocrDetails?.fields?.customerName?.evidence || '', setCustomerName)}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#0E7490', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                    >
                      Use "{ocrDetails?.fields?.customerName?.evidence}"
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Company Name with FieldBadge */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                  Company Name
                </label>
                <FieldBadge
                  status={badgeStatus('companyName', companyName, ocrDetails?.fields?.companyName?.status)}
                  evidence={ocrDetails?.fields?.companyName?.evidence}
                  reviewReason={ocrDetails?.fields?.companyName?.reviewReason}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  ref={companyNameRef}
                  type="text"
                  value={companyName}
                  onChange={e => updateField('companyName', e.target.value, setCompanyName)}
                  onBlur={() => validateOnBlur('companyName', companyName)}
                  maxLength={160}
                  aria-invalid={Boolean(fieldErrors.companyName)}
                  placeholder="e.g. Apex Technologies Ltd"
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '10px',
                    border: fieldErrors.companyName ? '1.5px solid #DC2626' : badgeStatus('companyName', companyName, ocrDetails?.fields?.companyName?.status) === 'needs_review' ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                    backgroundColor: badgeStatus('companyName', companyName, ocrDetails?.fields?.companyName?.status) === 'needs_review' ? '#FFFBEB' : '#FFFFFF',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <Building size={16} color={ocrDetails?.fields?.companyName?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'} style={{ position: 'absolute', left: '12px', top: '13px' }} />
              </div>
              {fieldErrors.companyName && <div style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '4px' }}>{fieldErrors.companyName}</div>}
              {badgeStatus('companyName', companyName, ocrDetails?.fields?.companyName?.status) === 'needs_review' && ocrDetails?.fields?.companyName?.reviewReason && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#B45309', marginTop: '4px' }}>
                  <AlertTriangle size={12} />
                  <span>{ocrDetails?.fields?.companyName?.reviewReason}</span>
                  {ocrDetails?.fields?.companyName?.evidence && !companyName && (
                    <button
                      type="button"
                      onClick={() => updateField('companyName', ocrDetails?.fields?.companyName?.evidence || '', setCompanyName)}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#0E7490', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                    >
                      Use "{ocrDetails?.fields?.companyName?.evidence}"
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Designation with FieldBadge */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                  Designation
                </label>
                <FieldBadge
                  status={badgeStatus('designation', designation, ocrDetails?.fields?.designation?.status)}
                  evidence={ocrDetails?.fields?.designation?.evidence}
                  reviewReason={ocrDetails?.fields?.designation?.reviewReason}
                />
              </div>
              <input
                ref={designationRef}
                type="text"
                value={designation}
                onChange={e => updateField('designation', e.target.value, setDesignation)}
                onBlur={() => validateOnBlur('designation', designation)}
                maxLength={120}
                aria-invalid={Boolean(fieldErrors.designation)}
                placeholder="e.g. Managing Director / Procurement Lead"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: fieldErrors.designation ? '1.5px solid #DC2626' : badgeStatus('designation', designation, ocrDetails?.fields?.designation?.status) === 'needs_review' ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                  backgroundColor: badgeStatus('designation', designation, ocrDetails?.fields?.designation?.status) === 'needs_review' ? '#FFFBEB' : '#FFFFFF',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              {fieldErrors.designation && <div style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '4px' }}>{fieldErrors.designation}</div>}
            </div>

            {/* Multiple Phone Numbers Detected - Pill Selector */}
            {ocrDetails?.phone_numbers && ocrDetails.phone_numbers.length > 1 && (
              <div style={{
                gridColumn: '1 / -1',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '12px 16px'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  Multiple Phone Numbers Detected ({ocrDetails.phone_numbers.length}) — Click to select Primary (WhatsApp) Number:
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
                          padding: '6px 14px',
                          borderRadius: '9999px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: isSelected ? '1.5px solid #0E7490' : '1px solid #CBD5E1',
                          backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                          color: isSelected ? '#0E7490' : '#475569',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Phone size={12} />
                        {ph}
                        {isSelected ? (
                          <span style={{ fontSize: '0.65rem', backgroundColor: '#0E7490', color: '#FFFFFF', padding: '1px 6px', borderRadius: '9999px' }}>
                            Primary
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>Set as Primary</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Contact Number * with FieldBadge */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                  Contact Number (WhatsApp) *
                </label>
                <FieldBadge
                  status={badgeStatus('contactNumber', contactNumber, ocrDetails?.fields?.contactNumber?.status)}
                  evidence={ocrDetails?.fields?.contactNumber?.evidence}
                  reviewReason={ocrDetails?.fields?.contactNumber?.reviewReason}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  ref={contactNumberRef}
                  type="text"
                  inputMode="tel"
                  value={contactNumber}
                  onChange={e => updateField('contactNumber', e.target.value, setContactNumber)}
                  onBlur={() => validateOnBlur('contactNumber', contactNumber)}
                  maxLength={40}
                  aria-invalid={Boolean(fieldErrors.contactNumber)}
                  placeholder="e.g. +91 98765 43210"
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '10px',
                    border: fieldErrors.contactNumber ? '1.5px solid #DC2626' : badgeStatus('contactNumber', contactNumber, ocrDetails?.fields?.contactNumber?.status) === 'needs_review' ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                    backgroundColor: badgeStatus('contactNumber', contactNumber, ocrDetails?.fields?.contactNumber?.status) === 'needs_review' ? '#FFFBEB' : '#FFFFFF',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <Phone size={16} color={ocrDetails?.fields?.contactNumber?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'} style={{ position: 'absolute', left: '12px', top: '13px' }} />
              </div>
              {fieldErrors.contactNumber && <div style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '4px' }}>{fieldErrors.contactNumber}</div>}
              {badgeStatus('contactNumber', contactNumber, ocrDetails?.fields?.contactNumber?.status) === 'needs_review' && ocrDetails?.fields?.contactNumber?.reviewReason && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#B45309', marginTop: '4px' }}>
                  <AlertTriangle size={12} />
                  <span>{ocrDetails?.fields?.contactNumber?.reviewReason}</span>
                </div>
              )}
            </div>

            {/* Alternate Contact Number with FieldBadge */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                  Alternate Contact Number
                </label>
                <FieldBadge
                  status={badgeStatus('alternateContactNumber', alternateContactNumber, ocrDetails?.fields?.alternateContactNumber?.status)}
                  evidence={ocrDetails?.fields?.alternateContactNumber?.evidence}
                  reviewReason={ocrDetails?.fields?.alternateContactNumber?.reviewReason}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  ref={alternateContactNumberRef}
                  type="text"
                  inputMode="tel"
                  value={alternateContactNumber}
                  onChange={e => updateField('alternateContactNumber', e.target.value, setAlternateContactNumber)}
                  onBlur={() => validateOnBlur('alternateContactNumber', alternateContactNumber)}
                  maxLength={40}
                  aria-invalid={Boolean(fieldErrors.alternateContactNumber)}
                  placeholder="e.g. 044-24567890"
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '10px',
                    border: fieldErrors.alternateContactNumber ? '1.5px solid #DC2626' : badgeStatus('alternateContactNumber', alternateContactNumber, ocrDetails?.fields?.alternateContactNumber?.status) === 'needs_review' ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                    backgroundColor: badgeStatus('alternateContactNumber', alternateContactNumber, ocrDetails?.fields?.alternateContactNumber?.status) === 'needs_review' ? '#FFFBEB' : '#FFFFFF',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <Phone size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '13px' }} />
              </div>
              {fieldErrors.alternateContactNumber && <div style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '4px' }}>{fieldErrors.alternateContactNumber}</div>}
            </div>

            {/* Multiple Email Addresses Detected - Pill Selector */}
            {ocrDetails?.emails && ocrDetails.emails.length > 1 && (
              <div style={{
                gridColumn: '1 / -1',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '12px 16px'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  Multiple Email Addresses Detected ({ocrDetails.emails.length}) — Click to choose Primary Email:
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
                          padding: '6px 14px',
                          borderRadius: '9999px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: isSelected ? '1.5px solid #0E7490' : '1px solid #CBD5E1',
                          backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                          color: isSelected ? '#0E7490' : '#475569',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Mail size={12} />
                        {em}
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

            {/* Email Address with FieldBadge */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                  Email Address
                </label>
                <FieldBadge
                  status={badgeStatus('email', email, ocrDetails?.fields?.email?.status)}
                  evidence={ocrDetails?.fields?.email?.evidence}
                  reviewReason={ocrDetails?.fields?.email?.reviewReason}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={e => updateField('email', e.target.value, setEmail)}
                  onBlur={() => validateOnBlur('email', email)}
                  maxLength={254}
                  aria-invalid={Boolean(fieldErrors.email)}
                  placeholder="e.g. rajesh@apex.com"
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '10px',
                    border: fieldErrors.email ? '1.5px solid #DC2626' : badgeStatus('email', email, ocrDetails?.fields?.email?.status) === 'needs_review' ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                    backgroundColor: badgeStatus('email', email, ocrDetails?.fields?.email?.status) === 'needs_review' ? '#FFFBEB' : '#FFFFFF',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <Mail size={16} color={ocrDetails?.fields?.email?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'} style={{ position: 'absolute', left: '12px', top: '13px' }} />
              </div>
              {fieldErrors.email && <div style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '4px' }}>{fieldErrors.email}</div>}
              {badgeStatus('email', email, ocrDetails?.fields?.email?.status) === 'needs_review' && ocrDetails?.fields?.email?.reviewReason && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#B45309', marginTop: '4px' }}>
                  <AlertTriangle size={12} />
                  <span>{ocrDetails?.fields?.email?.reviewReason}</span>
                </div>
              )}
            </div>

            {/* Website with FieldBadge */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                  Website
                </label>
                <FieldBadge
                  status={badgeStatus('website', website, ocrDetails?.fields?.website?.status)}
                  evidence={ocrDetails?.fields?.website?.evidence}
                  reviewReason={ocrDetails?.fields?.website?.reviewReason}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  ref={websiteRef}
                  type="text"
                  value={website}
                  onChange={e => updateField('website', e.target.value, setWebsite)}
                  onBlur={() => validateOnBlur('website', website)}
                  maxLength={2048}
                  aria-invalid={Boolean(fieldErrors.website)}
                  placeholder="e.g. www.apextechnologies.in"
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '10px',
                    border: fieldErrors.website ? '1.5px solid #DC2626' : badgeStatus('website', website, ocrDetails?.fields?.website?.status) === 'needs_review' ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                    backgroundColor: badgeStatus('website', website, ocrDetails?.fields?.website?.status) === 'needs_review' ? '#FFFBEB' : '#FFFFFF',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <Globe size={16} color={ocrDetails?.fields?.website?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'} style={{ position: 'absolute', left: '12px', top: '13px' }} />
              </div>
              {fieldErrors.website && <div style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '4px' }}>{fieldErrors.website}</div>}
              {badgeStatus('website', website, ocrDetails?.fields?.website?.status) === 'needs_review' && ocrDetails?.fields?.website?.reviewReason && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#B45309', marginTop: '4px' }}>
                  <AlertTriangle size={12} />
                  <span>{ocrDetails?.fields?.website?.reviewReason}</span>
                </div>
              )}
            </div>

            {/* Full Address with FieldBadge */}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                  Full Address / Location
                </label>
                <FieldBadge
                  status={badgeStatus('address', address, ocrDetails?.fields?.address?.status)}
                  evidence={ocrDetails?.fields?.address?.evidence}
                  reviewReason={ocrDetails?.fields?.address?.reviewReason}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <textarea
                  ref={addressRef}
                  value={address}
                  onChange={e => updateField('address', e.target.value, setAddress)}
                  onBlur={() => validateOnBlur('address', address)}
                  maxLength={1000}
                  aria-invalid={Boolean(fieldErrors.address)}
                  rows={2}
                  placeholder="e.g. Plot No 42, Guindy Industrial Estate, Chennai 600032"
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '10px',
                    border: fieldErrors.address ? '1.5px solid #DC2626' : badgeStatus('address', address, ocrDetails?.fields?.address?.status) === 'needs_review' ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                    backgroundColor: badgeStatus('address', address, ocrDetails?.fields?.address?.status) === 'needs_review' ? '#FFFBEB' : '#FFFFFF',
                    fontSize: '0.9rem',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
                <MapPin size={16} color={ocrDetails?.fields?.address?.status === 'needs_review' ? '#F59E0B' : '#94A3B8'} style={{ position: 'absolute', left: '12px', top: '14px' }} />
              </div>
              {fieldErrors.address && <div style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '4px' }}>{fieldErrors.address}</div>}
              {badgeStatus('address', address, ocrDetails?.fields?.address?.status) === 'needs_review' && ocrDetails?.fields?.address?.reviewReason && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#B45309', marginTop: '4px' }}>
                  <AlertTriangle size={12} />
                  <span>{ocrDetails?.fields?.address?.reviewReason}</span>
                </div>
              )}
            </div>

          {/* Attribution Meta Fields */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
              Collected By (Logged-in Employee)
            </label>
            <input
              type="text"
              value={currentUser?.name || 'Field Officer'}
              disabled
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#F1F5F9',
                color: '#475569',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
              Collection Date
            </label>
            <input
              type="text"
              value={formatDateDDMMYYYY(new Date())}
              disabled
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#F1F5F9',
                color: '#475569',
                fontSize: '0.875rem'
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{
          marginTop: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: '12px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <button
            type="button"
            onClick={handleResetForm}
            style={{
              padding: '10px 18px',
              borderRadius: '12px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              flex: '1 1 auto',
              textAlign: 'center'
            }}
          >
            Clear Form
          </button>

          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={saving}
            style={{
              padding: '10px 24px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: saving ? '#94A3B8' : '#0E7490',
              color: '#FFFFFF',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(14, 116, 144, 0.25)',
              flex: '2 1 auto'
            }}
          >
            <Check size={18} />
            {saving ? 'Saving to Database...' : 'Save Customer'}
          </button>
        </div>
      </div>
    </div>

      {/* Duplicate Customer Warning Dialog Modal */}
      {duplicateWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '520px',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #E7ECF3'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1E293B' }}>
                  Duplicate Contact Warning
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
                  A customer with this phone number already exists
                </p>
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '6px' }}>Existing Record:</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
                {duplicateWarning.customerName}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#0E7490', marginTop: '2px' }}>
                ID: {duplicateWarning.customerId} • Phone: {duplicateWarning.contactNumber}
              </div>
              {duplicateWarning.companyName && (
                <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '2px' }}>
                  Company: {duplicateWarning.companyName}
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '6px' }}>
                Collected by {duplicateWarning.collectedByName} on {duplicateWarning.collectedDate}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setDuplicateWarning(null)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel & Review
              </button>

              <button
                onClick={() => handleSubmit(true)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Proceed & Save Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Modal for Visiting Card Preview */}
      {isImageZoomed && cardImageBase64 && (
        <div
          onClick={() => setIsImageZoomed(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '12px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1E293B' }}>Card High-Resolution Inspection</span>
              <button
                onClick={() => setIsImageZoomed(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>
            <img
              src={previewTab === 'cropped' ? cardImageBase64 : (originalImageBase64 || cardImageBase64)}
              alt="Visiting Card Zoomed"
              style={{
                maxWidth: '85vw',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />
          </div>
        </div>
      )}

      {/* High-Precision Apple-style Visiting Card Scanner Modal */}
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
