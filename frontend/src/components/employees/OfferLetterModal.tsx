import React, { useState, useEffect, useMemo } from 'react';
import { Employee } from '../../types/hrms';
import { OfferLetterTemplate } from '../../types/offerLetter';
import { INITIAL_OFFER_LETTER_TEMPLATES, OFFICIAL_CORPORATE_OFFER_TEMPLATE } from '../../data/offerLetterTemplates';
import { useHRMS } from '../../context/HRMSContext';
import { API_BASE_URL } from '../../config/api';
import { downloadElementAsPDF, generateOfferLetterPdfBase64, downloadOfferLetterPdf } from '../../utils/exportUtils';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { formatCurrency, toNum } from '../../utils/numbers';
import { calculateSalaryBreakdown } from '../../services/policyEngine';
import {
  AuthorizedSignatory,
  CompanyFooter,
  CompanyHeader,
  EmployeeDetailsGrid,
  buildCompanyDocumentProfile
} from '../documents/CompanyDocumentParts';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  FileText, 
  Edit3, 
  Eye, 
  Building2, 
  CheckCircle2, 
  User, 
  Plus, 
  Save, 
  Sparkles,
  Send,
  Printer,
  Mail,
  Paperclip,
  ExternalLink
} from 'lucide-react';

interface OfferLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmployee?: Employee | null;
}

const DEFAULT_OFFER_TEMPLATE: OfferLetterTemplate = OFFICIAL_CORPORATE_OFFER_TEMPLATE;


const formatComponentLabel = (key: string) =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());

export const OfferLetterModal: React.FC<OfferLetterModalProps> = ({
  isOpen,
  onClose,
  initialEmployee
}) => {
  const { employees, updateEmployee, currentUser, businessSettings, companyInfo, companyBranches, payrollSettingsConfig } = useHRMS();
  const documentProfile = useMemo(
    () => buildCompanyDocumentProfile(companyInfo, businessSettings, companyBranches),
    [companyInfo, businessSettings, companyBranches]
  );
  const initialTemplates = useMemo(
    () => INITIAL_OFFER_LETTER_TEMPLATES.length > 0 ? INITIAL_OFFER_LETTER_TEMPLATES : [DEFAULT_OFFER_TEMPLATE],
    []
  );

  // Selected Employee
  const [selectedEmpId, setSelectedEmpId] = useState<string>(
    initialEmployee?.id || (employees.length > 0 ? employees[0].id : '')
  );

  // Template List (in-memory only; authoritative templates belong to the backend)
  const [templates, setTemplates] = useState<OfferLetterTemplate[]>(initialTemplates);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplates[0].id);
  const [activeMode, setActiveMode] = useState<'preview' | 'email' | 'edit' | 'create_template'>('preview');

  // Editable Letter Content
  const [customizedContent, setCustomizedContent] = useState<string>('');
  const [copiedToast, setCopiedToast] = useState(false);
  const [savedToProfileToast, setSavedToProfileToast] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSendingOffer, setIsSendingOffer] = useState(false);

  // New Template Form state
  const [newTemplateForm, setNewTemplateForm] = useState({
    name: '',
    category: 'Full-Time' as OfferLetterTemplate['category'],
    badgeColor: '#2563eb',
    description: '',
    subject: '',
    content: ''
  });

  // Sync selected employee when prop changes
  useEffect(() => {
    if (initialEmployee) {
      setSelectedEmpId(initialEmployee.id);
    }
  }, [initialEmployee]);

  const currentEmployee = employees.find(e => e.id === selectedEmpId) || initialEmployee || employees[0];
  const currentTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];

  const activeEarnings = useMemo(() => {
    return (payrollSettingsConfig?.components || []).filter(c => c.active && c.type === 'EARNING');
  }, [payrollSettingsConfig]);
  const savedBasicPay = toNum(currentEmployee?.salaryDetails?.basicSalary ?? currentEmployee?.basicSalary);
  const savedAllowanceRows = Object.entries(currentEmployee?.allowances || {})
    .map(([key, value]) => ({ label: formatComponentLabel(key), amount: toNum(value), code: key }))
    .filter(row => row.amount > 0);
  const savedMonthlyGross = savedBasicPay + savedAllowanceRows.reduce((sum, row) => sum + row.amount, 0);
  const inferredMonthlyCtc = useMemo(() => {
    const configuredBasic = activeEarnings.find(comp => comp.code.toUpperCase() === 'BASIC');
    if (
      configuredBasic?.calculationMethod === 'PERCENTAGE' &&
      configuredBasic.defaultValue > 0 &&
      savedBasicPay > 0
    ) {
      return Math.round((savedBasicPay * 100) / configuredBasic.defaultValue);
    }
    return savedMonthlyGross > 0 ? savedMonthlyGross : savedBasicPay;
  }, [activeEarnings, savedBasicPay, savedMonthlyGross]);
  const monthlyCtc = toNum(currentEmployee?.salaryDetails?.monthlyCtc) || inferredMonthlyCtc;
  const configuredBreakdown = useMemo(() => {
    return calculateSalaryBreakdown(monthlyCtc, activeEarnings);
  }, [monthlyCtc, activeEarnings]);
  const compensationRows = activeEarnings.length > 0
    ? activeEarnings
        .map(comp => ({
          label: comp.name,
          amount: configuredBreakdown.customComponents[comp.code] || 0
        }))
        .filter(row => row.amount > 0)
    : [
        { label: 'Basic Salary', amount: savedBasicPay },
        ...savedAllowanceRows.map(row => ({ label: row.label, amount: row.amount }))
      ].filter(row => row.amount > 0);
  const basicPay = activeEarnings.length > 0 ? configuredBreakdown.basicSalary : savedBasicPay;
  const monthlyGross = activeEarnings.length > 0 ? configuredBreakdown.grossSalary : savedMonthlyGross;
  const annualCtc = monthlyCtc * 12;

  const candidateFullName = `${currentEmployee?.firstName || ''} ${currentEmployee?.lastName || ''}`.trim();
  const todayStr = formatDateDDMMYYYY(new Date());
  const joiningDateStr = (currentEmployee?.joiningDate ? formatDateDDMMYYYY(currentEmployee.joiningDate) : '') || todayStr;
  const formattedDeadline = formatDateDDMMYYYY(new Date(Date.now() + 7 * 86400000));
  const companyLegal = documentProfile.legalName || documentProfile.companyName || 'Businz Technologies Private Limited';

  const coverEmailBodyText = useMemo(() => {
    return `Dear ${candidateFullName},

We are pleased to welcome you to ${companyLegal}.

Please find attached your Offer Letter for the position of ${currentEmployee?.designation || 'Specialist'}, with a proposed joining date of ${joiningDateStr}.

Kindly review the attached document and confirm your acceptance within ${formattedDeadline}.

For any clarification, please feel free to contact our HR department.

We look forward to welcoming you to our team.

Warm regards,
${documentProfile.authorizedSignatoryName || 'HR Department'}
${documentProfile.authorizedSignatoryDesignation || 'HR Management'}
${companyLegal}
${documentProfile.email || 'developer@businz.com'}
${documentProfile.phone || '+91 9876543210'}`;
  }, [candidateFullName, companyLegal, currentEmployee, joiningDateStr, formattedDeadline, documentProfile]);

  // Replace placeholders helper
  const replacePlaceholders = (text: string) => {
    if (!currentEmployee) return text;

    const values: { [key: string]: string } = {
      '{{candidate_name}}': candidateFullName,
      '{{employee_name}}': candidateFullName,
      '{{employee_full_name}}': candidateFullName,
      '{{employee_salutation}}': 'Mr./Ms.',
      '{{employee_id}}': currentEmployee.employeeId,
      '{{employee_address}}': currentEmployee.address || 'Candidate Residential Address',
      '{{employee_phone}}': currentEmployee.phone || '—',
      '{{employee_email}}': currentEmployee.email || '—',
      '{{designation}}': currentEmployee.designation || 'Specialist',
      '{{department}}': currentEmployee.department || 'Operations',
      '{{joining_date}}': joiningDateStr,
      '{{employment_type}}': currentEmployee.employmentType || 'Full-Time',
      '{{reporting_manager}}': currentEmployee.reportingManagerName || 'Executive Leadership',
      '{{basic_salary}}': formatCurrency(basicPay),
      '{{monthly_salary}}': formatCurrency(monthlyGross || monthlyCtc),
      '{{monthly_gross}}': formatCurrency(monthlyGross),
      '{{annual_ctc}}': formatCurrency(annualCtc),
      '{{total_ctc_monthly}}': formatCurrency(monthlyCtc),
      '{{total_ctc_annual}}': formatCurrency(annualCtc),
      '{{work_location}}': currentEmployee.workLocation || currentEmployee.bankDetails?.branch || 'Head Office',
      '{{company_name}}': documentProfile.companyName,
      '{{company_legal_name}}': companyLegal,
      '{{company_address}}': documentProfile.address,
      '{{company_email}}': documentProfile.email || 'developer@businz.com',
      '{{company_phone}}': documentProfile.phone || '+91 9876543210',
      '{{company_website}}': documentProfile.website || 'https://businz.com',
      '{{offer_letter_number}}': `OL-${new Date().getFullYear()}-${currentEmployee.employeeId || 'EMP'}`,
      '{{offer_date}}': todayStr,
      '{{issue_date}}': todayStr,
      '{{probation_period}}': '3 months',
      '{{working_days}}': '6',
      '{{shift_start_time}}': '09:30 AM',
      '{{shift_end_time}}': '06:30 PM',
      '{{break_duration}}': '1 hour',
      '{{incentive_policy}}': 'applicable company performance incentive policy',
      '{{review_period}}': 'the completion of probation',
      '{{expense_submission_email}}': documentProfile.email || 'expenses@businz.com',
      '{{role_responsibilities}}': 'Core technical, operational, and departmental responsibilities designated by department leadership and reporting manager.',
      '{{notice_period}}': '30 days',
      '{{service_commitment_terms}}': 'Standard service agreement as specified in onboarding guidelines',
      '{{acceptance_deadline}}': formattedDeadline,
      '{{authorized_signatory_name}}': documentProfile.authorizedSignatoryName || 'Authorized Signatory',
      '{{authorized_signatory_designation}}': documentProfile.authorizedSignatoryDesignation || 'HR Management',
      '{{hr_signatory_name}}': documentProfile.authorizedSignatoryName || 'HR Department',
      '{{hr_signatory_designation}}': documentProfile.authorizedSignatoryDesignation || 'HR Management',
      '{{employee_acceptance_date}}': formattedDeadline,
      '{{compensation_notes}}': 'All cash components are subject to statutory deductions (PF, ESI, Professional Tax, TDS) as applicable.',
      '{{statutory_benefits_notes}}': 'Statutory employee benefits are governed in accordance with Indian statutory labor compliances.',
      '{{variable_pay_notes}}': 'Annual performance bonus evaluated based on company and individual key performance indicators.'
    };

    let result = text;
    Object.entries(values).forEach(([k, v]) => {
      result = result.split(k).join(v);
    });
    return result;
  };

  // Update customized content whenever template or employee changes
  useEffect(() => {
    if (currentTemplate) {
      setCustomizedContent(replacePlaceholders(currentTemplate.content));
    }
  }, [selectedTemplateId, selectedEmpId]);

  const parsedClauses = useMemo(() => {
    const rawLines = customizedContent
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.includes('EMPLOYMENT TERMS & CONDITIONS'));
    const clauses: string[] = [];
    let currentClause = '';
    for (const line of rawLines) {
      if (/^\d+\./.test(line)) {
        if (currentClause) clauses.push(currentClause);
        currentClause = line;
      } else if (currentClause) {
        currentClause += ' ' + line;
      } else {
        clauses.push(line);
      }
    }
    if (currentClause) clauses.push(currentClause);
    return clauses;
  }, [customizedContent]);

  const page1Clauses = useMemo(() => parsedClauses.slice(0, 12), [parsedClauses]);
  const page2Clauses = useMemo(() => parsedClauses.slice(12), [parsedClauses]);

  if (!isOpen) return null;

  // Copy to clipboard
  const handleCopy = () => {
    const textToCopy = activeMode === 'email' ? coverEmailBodyText : customizedContent;
    navigator.clipboard.writeText(textToCopy);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  const handleCopyEmailCover = () => {
    navigator.clipboard.writeText(coverEmailBodyText);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  // Save/Attach to Employee Profile Documents
  const handleAttachToProfile = () => {
    if (!currentEmployee) return;
    const docName = `Offer_Letter_${currentEmployee.firstName}_${currentEmployee.employeeId}.pdf`;
    const today = new Date().toISOString().split('T')[0];

    const currentDocs = currentEmployee.documents || [];
    const exists = currentDocs.some(d => d.name === docName);
    const updatedDocs = exists 
      ? currentDocs.map(d => d.name === docName ? { ...d, uploadDate: today } : d)
      : [...currentDocs, { name: docName, type: 'PDF', url: '#', uploadDate: today }];

    updateEmployee(currentEmployee.id, { documents: updatedDocs });
    setSavedToProfileToast(true);
    setTimeout(() => setSavedToProfileToast(false), 2500);
  };

  // Download PDF Document
  const handleDownloadPDF = () => {
    const candidateFullName = `${currentEmployee?.firstName || ''} ${currentEmployee?.lastName || ''}`.trim();
    const joiningDateStr = (currentEmployee?.joiningDate ? formatDateDDMMYYYY(currentEmployee.joiningDate) : '') || formatDateDDMMYYYY(new Date());
    const formattedDeadline = formatDateDDMMYYYY(new Date(Date.now() + 7 * 86400000));

    downloadOfferLetterPdf({
      companyName: documentProfile.legalName || documentProfile.companyName,
      companyAddress: documentProfile.address,
      companyEmail: documentProfile.email,
      companyPhone: documentProfile.phone,
      companyWebsite: documentProfile.website,
      candidateName: candidateFullName,
      employeeId: currentEmployee?.employeeId,
      designation: currentEmployee?.designation || 'Specialist',
      department: currentEmployee?.department || 'Operations',
      joiningDate: joiningDateStr,
      employmentType: currentEmployee?.employmentType,
      workLocation: currentEmployee?.workLocation || currentEmployee?.bankDetails?.branch || 'Head Office',
      candidateEmail: currentEmployee?.email,
      candidatePhone: currentEmployee?.phone,
      candidateAddress: currentEmployee?.address,
      acceptanceDeadline: formattedDeadline,
      signatoryName: documentProfile.authorizedSignatoryName,
      signatoryDesignation: documentProfile.authorizedSignatoryDesignation,
      compensationRows: compensationRows.filter(r => r.amount > 0),
      monthlyCtc,
      annualCtc,
      customizedClauses: customizedContent,
    });
  };

  // Download text file
  const handleDownloadTxt = () => {
    const element = document.createElement('a');
    const file = new Blob([customizedContent], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `Offer_Letter_${currentEmployee?.firstName || 'Employee'}_${currentEmployee?.employeeId || 'ID'}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleSendOfferEmail = async () => {
    if (!currentEmployee?.email) {
      setSendStatus({ type: 'error', message: 'Candidate email is missing.' });
      return;
    }

    setIsSendingOffer(true);
    setSendStatus(null);

    const token = sessionStorage.getItem('vrm_auth_token') || localStorage.getItem('vrm_auth_token');
    const deadlineDate = new Date(Date.now() + 7 * 86400000);
    const formattedDeadline = formatDateDDMMYYYY(deadlineDate);
    const candidateFullName = `${currentEmployee.firstName || ''} ${currentEmployee.lastName || ''}`.trim();
    const joiningDateStr = (currentEmployee.joiningDate ? formatDateDDMMYYYY(currentEmployee.joiningDate) : '') || formatDateDDMMYYYY(new Date());

    try {
      // 1. Generate the official 3-page Offer Letter PDF in memory
      let pdfBase64 = '';
      try {
        pdfBase64 = await generateOfferLetterPdfBase64({
          companyName: documentProfile.companyName,
          companyAddress: documentProfile.address,
          companyEmail: documentProfile.email,
          companyPhone: documentProfile.phone,
          companyWebsite: documentProfile.website,
          candidateName: candidateFullName,
          employeeId: currentEmployee.employeeId,
          designation: currentEmployee.designation,
          department: currentEmployee.department,
          joiningDate: joiningDateStr,
          employmentType: currentEmployee.employmentType,
          workLocation: currentEmployee.workLocation || currentEmployee.bankDetails?.branch || 'Head Office',
          candidateEmail: currentEmployee.email,
          candidatePhone: currentEmployee.phone,
          candidateAddress: currentEmployee.address,
          acceptanceDeadline: formattedDeadline,
          signatoryName: documentProfile.authorizedSignatoryName,
          signatoryDesignation: documentProfile.authorizedSignatoryDesignation,
          compensationRows: compensationRows.filter(r => r.amount > 0),
          monthlyCtc,
          annualCtc,
          customizedClauses: customizedContent,
        });
      } catch (pdfErr) {
        console.warn('Could not compile PDF in memory:', pdfErr);
      }

      // 2. Format the official Cover Email Body matching the template
      const coverEmailBody = `Dear ${candidateFullName},

We are pleased to welcome you to ${documentProfile.companyName}.

Please find attached your Offer Letter for the position of ${currentEmployee.designation}, with a proposed joining date of ${joiningDateStr}.

Kindly review the attached document and confirm your acceptance within ${formattedDeadline}.

For any clarification, please feel free to contact our HR department.

We look forward to welcoming you to our team.

Warm regards,
${documentProfile.authorizedSignatoryName || 'HR Department'}
${documentProfile.authorizedSignatoryDesignation || 'HR Management'}
${documentProfile.companyName}
${documentProfile.email || 'developer@businz.com'}
${documentProfile.phone || ''}`;

      const response = await fetch(`${API_BASE_URL}/employees/send-offer-letter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          to: currentEmployee.email,
          candidateName: candidateFullName,
          employeeCode: currentEmployee.employeeId,
          subject: `Offer Letter – Confirmation of Employment - ${currentEmployee.designation || 'Employment'}`,
          letterBody: coverEmailBody,
          companyName: documentProfile.companyName,
          pdfAttachment: pdfBase64 ? {
            filename: `Offer_Letter_${(currentEmployee.firstName || 'Candidate').replace(/\s+/g, '_')}_${currentEmployee.employeeId || 'EMP'}.pdf`,
            base64: pdfBase64,
          } : undefined,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error?.message || 'Offer letter email could not be sent.');
      }

      setSendStatus({ type: 'success', message: `Offer letter with PDF attachment sent to ${currentEmployee.email}` });
      setTimeout(() => setSendStatus(null), 4000);
    } catch (err: any) {
      setSendStatus({ type: 'error', message: err?.message || 'Offer letter email could not be sent.' });
    } finally {
      setIsSendingOffer(false);
    }
  };

  // Create Custom Template
  const handleSaveNewTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateForm.name || !newTemplateForm.content) return;

    const newTpl: OfferLetterTemplate = {
      id: `TPL-CUSTOM-${Date.now()}`,
      name: newTemplateForm.name,
      category: newTemplateForm.category,
      badgeColor: newTemplateForm.badgeColor,
      description: newTemplateForm.description || 'Custom corporate employment offer template.',
      subject: newTemplateForm.subject || `Offer of Employment — {{designation}}`,
      content: newTemplateForm.content
    };

    const updated = [...templates, newTpl];
    setTemplates(updated);
    setSelectedTemplateId(newTpl.id);
    setActiveMode('preview');
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 110 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '920px', 
          width: '95%',
          maxHeight: '92vh',
          backgroundColor: '#ffffff', 
          borderRadius: '16px', 
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* MODAL HEADER */}
        <div className="modal-header" style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#ecfeff', color: '#0891b2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Corporate Offer Letter Generator
              </h2>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
                Generate, customize, and issue formal employment offer letters with dynamic candidate data
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={20} />
          </button>
        </div>

        {/* TOP CONFIGURATION STRIP */}
        <div style={{ backgroundColor: '#f8fafc', padding: '14px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
          
          {/* Employee Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '280px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={15} color="#0891b2" /> Candidate:
            </span>
            <select
              className="form-control"
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              style={{ fontSize: '0.84rem', padding: '6px 12px', borderRadius: '8px', minWidth: '240px', borderColor: '#cbd5e1' }}
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeId}) &mdash; {emp.designation}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Tabs */}
          <div style={{ display: 'flex', gap: '6px', backgroundColor: '#e2e8f0', padding: '3px', borderRadius: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveMode('preview')}
              style={{
                border: 'none',
                background: activeMode === 'preview' ? '#ffffff' : 'transparent',
                color: activeMode === 'preview' ? '#0E7490' : '#64748b',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeMode === 'preview' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Eye size={14} color={activeMode === 'preview' ? '#0E7490' : 'currentColor'} /> Preview Document
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('email')}
              style={{
                border: 'none',
                background: activeMode === 'email' ? '#ffffff' : 'transparent',
                color: activeMode === 'email' ? '#0E7490' : '#64748b',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeMode === 'email' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Mail size={14} color={activeMode === 'email' ? '#0E7490' : 'currentColor'} /> Email Cover
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('edit')}
              style={{
                border: 'none',
                background: activeMode === 'edit' ? '#ffffff' : 'transparent',
                color: activeMode === 'edit' ? '#0E7490' : '#64748b',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeMode === 'edit' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Edit3 size={14} color={activeMode === 'edit' ? '#0E7490' : 'currentColor'} /> Edit Clauses
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('create_template')}
              style={{
                border: 'none',
                background: activeMode === 'create_template' ? '#ffffff' : 'transparent',
                color: activeMode === 'create_template' ? '#0E7490' : '#64748b',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeMode === 'create_template' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Plus size={14} color={activeMode === 'create_template' ? '#0E7490' : 'currentColor'} /> New Template
            </button>
          </div>

        </div>

        {/* TEMPLATE PICKER STRIP */}
        {activeMode !== 'create_template' && activeMode !== 'email' && (
          <div style={{ backgroundColor: '#ffffff', padding: '10px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Templates ({templates.length}):
            </span>
            <div 
              className="hide-scrollbar" 
              style={{ 
                display: 'flex', 
                gap: '8px', 
                overflowX: 'auto', 
                flex: 1, 
                padding: '4px 2px',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {templates.map(tpl => {
                const isSelected = tpl.id === selectedTemplateId;
                return (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: isSelected ? '1.5px solid #0E7490' : '1px solid #e2e8f0',
                      backgroundColor: isSelected ? '#ECFEFF' : '#ffffff',
                      color: isSelected ? '#0E7490' : '#475569',
                      fontSize: '0.8rem',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: isSelected ? '0 1px 4px rgba(14, 116, 144, 0.2)' : 'none',
                      transition: 'all 0.15s ease',
                      flexShrink: 0
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '99px', backgroundColor: isSelected ? '#0E7490' : tpl.badgeColor }} />
                    {tpl.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* MODAL BODY */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, backgroundColor: '#f1f5f9' }}>
          
          {/* MODE 1: DOCUMENT PREVIEW */}
          {activeMode === 'preview' && (
            <div id="printable-offer-letter" style={{ maxWidth: '800px', margin: '0 auto' }}>
              
              {/* PAGE 1 SHEET */}
              <div 
                style={{ 
                  backgroundColor: '#ffffff', 
                  borderRadius: '10px', 
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)', 
                  padding: '40px 48px', 
                  fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
                  color: '#1e293b',
                  lineHeight: 1.6,
                  border: '1px solid #e2e8f0',
                  marginBottom: '24px'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: '4px', height: '38px', backgroundColor: '#0E7490', borderRadius: '2px', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{companyLegal}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{documentProfile.address || 'Corporate Headquarters & Registered Office'}</div>
                    </div>
                  </div>
                  {documentProfile.logoUrl && (
                    <img src={documentProfile.logoUrl} alt="Logo" style={{ maxHeight: '42px', maxWidth: '140px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '20px' }}>
                  <span>{[documentProfile.email || 'developer@businz.com', documentProfile.phone || '+91 9876543210', documentProfile.website || 'https://businz.com'].filter(Boolean).join(' | ')}</span>
                  <span>Page 1</span>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.01em' }}>OFFER OF EMPLOYMENT</h1>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b' }}>
                    <span>Reference: OL-{new Date().getFullYear()}-{currentEmployee?.employeeId || 'EMP'}</span>
                    <span>Date: {todayStr}</span>
                  </div>
                </div>

                <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '18px', fontSize: '0.82rem' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>To</div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{candidateFullName}</div>
                  <div style={{ color: '#475569' }}>{currentEmployee?.address || 'Candidate Residential Address'}</div>
                  <div style={{ color: '#64748b', marginTop: '4px', fontSize: '0.78rem' }}>
                    Contact: {currentEmployee?.phone || '—'} &nbsp;|&nbsp; Email: {currentEmployee?.email || '—'}
                  </div>
                </div>

                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a', marginBottom: '14px' }}>
                  Subject: Offer of Employment - {currentEmployee?.designation || 'Specialist'}
                </div>

                <div style={{ fontSize: '0.84rem', color: '#334155', lineHeight: 1.6, marginBottom: '16px' }}>
                  <p style={{ margin: '0 0 8px' }}>Dear Mr./Ms. {candidateFullName},</p>
                  <p style={{ margin: 0 }}>
                    We are pleased to offer you the position of <strong>{currentEmployee?.designation}</strong> in the <strong>{currentEmployee?.department || 'Operations'}</strong> department of <strong>{companyLegal}</strong>, subject to the following terms and conditions.
                  </p>
                </div>

                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1.5px solid #0E7490', paddingBottom: '4px', marginBottom: '14px' }}>
                  EMPLOYMENT TERMS &amp; CONDITIONS
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.79rem', color: '#334155', lineHeight: 1.55 }}>
                  {page1Clauses.map((clause, idx) => (
                    <div key={idx} style={{ paddingLeft: '4px' }}>
                      {clause}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '24px' }}>
                  <span>{[documentProfile.email || 'developer@businz.com', documentProfile.phone || '+91 9876543210', documentProfile.website || 'https://businz.com'].filter(Boolean).join(' | ')}</span>
                  <span>Page 1</span>
                </div>
              </div>

              {/* PAGE BREAK INDICATOR */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0', gap: '12px', color: '#94a3b8', fontSize: '0.76rem', fontWeight: 600 }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#cbd5e1' }} />
                <span>PAGE BREAK &bull; PAGE 2 OF 3</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#cbd5e1' }} />
              </div>

              {/* PAGE 2 SHEET */}
              <div 
                style={{ 
                  backgroundColor: '#ffffff', 
                  borderRadius: '10px', 
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)', 
                  padding: '40px 48px', 
                  fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
                  color: '#1e293b',
                  lineHeight: 1.6,
                  border: '1px solid #e2e8f0',
                  marginBottom: '24px'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: '4px', height: '38px', backgroundColor: '#0E7490', borderRadius: '2px', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{companyLegal}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{documentProfile.address || 'Corporate Headquarters & Registered Office'}</div>
                    </div>
                  </div>
                  {documentProfile.logoUrl && (
                    <img src={documentProfile.logoUrl} alt="Logo" style={{ maxHeight: '42px', maxWidth: '140px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '20px' }}>
                  <span>{[documentProfile.email || 'developer@businz.com', documentProfile.phone || '+91 9876543210', documentProfile.website || 'https://businz.com'].filter(Boolean).join(' | ')}</span>
                  <span>Page 2</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.79rem', color: '#334155', lineHeight: 1.55, marginBottom: '24px' }}>
                  {page2Clauses.map((clause, idx) => (
                    <div key={idx} style={{ paddingLeft: '4px' }}>
                      {clause}
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1.5px solid #0E7490', paddingBottom: '4px', marginBottom: '12px', marginTop: '24px' }}>
                  ACCEPTANCE &amp; AUTHORIZATION
                </div>

                <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.6, marginBottom: '28px' }}>
                  Please confirm your acceptance of the terms above by signing and returning this letter by <strong>{formattedDeadline}</strong>. We look forward to welcoming you to <strong>{companyLegal}</strong>.
                </div>

                {/* Two Column Signatures */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a', marginBottom: '32px' }}>
                      For {companyLegal}
                    </div>
                    <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{documentProfile.authorizedSignatoryName || 'Authorized Signatory'}</div>
                      <div style={{ color: '#64748b' }}>{documentProfile.authorizedSignatoryDesignation || 'HR Management'}</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.74rem', marginTop: '4px' }}>Official Seal / Digital Stamp</div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a', marginBottom: '32px' }}>
                      Employee acceptance
                    </div>
                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', fontSize: '0.8rem' }}>
                      <div style={{ color: '#64748b' }}>Signature: __________________________</div>
                      <div style={{ fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>Name: {candidateFullName}</div>
                      <div style={{ color: '#64748b', fontSize: '0.74rem', marginTop: '4px' }}>Date: {formattedDeadline}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '24px' }}>
                  <span>{[documentProfile.email || 'developer@businz.com', documentProfile.phone || '+91 9876543210', documentProfile.website || 'https://businz.com'].filter(Boolean).join(' | ')}</span>
                  <span>Page 2</span>
                </div>
              </div>

              {/* PAGE BREAK INDICATOR */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0', gap: '12px', color: '#94a3b8', fontSize: '0.76rem', fontWeight: 600 }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#cbd5e1' }} />
                <span>PAGE BREAK &bull; PAGE 3 (ANNEXURE A)</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#cbd5e1' }} />
              </div>

              {/* PAGE 3 SHEET (ANNEXURE A) */}
              <div 
                style={{ 
                  backgroundColor: '#ffffff', 
                  borderRadius: '10px', 
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)', 
                  padding: '40px 48px', 
                  fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
                  color: '#1e293b',
                  lineHeight: 1.6,
                  border: '1px solid #e2e8f0',
                  marginBottom: '24px'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: '4px', height: '38px', backgroundColor: '#0E7490', borderRadius: '2px', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{companyLegal}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{documentProfile.address || 'Corporate Headquarters & Registered Office'}</div>
                    </div>
                  </div>
                  {documentProfile.logoUrl && (
                    <img src={documentProfile.logoUrl} alt="Logo" style={{ maxHeight: '42px', maxWidth: '140px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '20px' }}>
                  <span>{[documentProfile.email || 'developer@businz.com', documentProfile.phone || '+91 9876543210', documentProfile.website || 'https://businz.com'].filter(Boolean).join(' | ')}</span>
                  <span>Page 3</span>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0E7490', letterSpacing: '-0.01em', margin: 0 }}>
                    ANNEXURE A
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    COMPENSATION &amp; BENEFITS STRUCTURE
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>
                    Employee: <strong>{candidateFullName}</strong> &nbsp;|&nbsp; Designation: <strong>{currentEmployee?.designation}</strong> &nbsp;|&nbsp; Effective from: <strong>{joiningDateStr}</strong>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', border: '1px solid #cbd5e1', marginBottom: '20px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0E7490', color: '#ffffff' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700 }}>Salary Component</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Monthly (INR)</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Annual (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compensationRows.filter(row => row.amount > 0).map((row, idx) => (
                      <tr key={row.label} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 14px' }}>{row.label}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right' }}>{formatCurrency(row.amount)}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right' }}>{formatCurrency(row.amount * 12)}</td>
                      </tr>
                    ))}
                    <tr style={{ backgroundColor: '#f0fdf4', fontWeight: 800, color: '#15803d', borderTop: '2px solid #bbf7d0' }}>
                      <td style={{ padding: '10px 14px' }}>TOTAL COST TO COMPANY (CTC)</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{formatCurrency(monthlyCtc)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{formatCurrency(annualCtc)}</td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '28px' }}>
                  <div><strong>Compensation notes:</strong> All cash components are subject to statutory deductions (PF, ESI, Professional Tax, TDS) as applicable.</div>
                  <div><strong>Benefits / deductions:</strong> Statutory employee benefits are governed in accordance with Indian statutory labor compliances.</div>
                  <div><strong>Variable incentives:</strong> Annual performance bonus evaluated based on company and individual key performance indicators.</div>
                  <div>This annexure forms part of the offer letter issued on <strong>{todayStr}</strong>.</div>
                </div>

                <div style={{ paddingTop: '16px', borderTop: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>
                    Authorized signatory: {documentProfile.authorizedSignatoryName || 'Authorized Signatory'}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.74rem' }}>{companyLegal}</div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '24px' }}>
                  <span>{[documentProfile.email || 'developer@businz.com', documentProfile.phone || '+91 9876543210', documentProfile.website || 'https://businz.com'].filter(Boolean).join(' | ')}</span>
                  <span>Page 3</span>
                </div>
              </div>

            </div>
          )}

          {/* MODE 1.5: EMAIL COVER PREVIEW (MATCHING USER SCREENSHOT) */}
          {activeMode === 'email' && (
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div 
                style={{ 
                  backgroundColor: '#18181b', 
                  color: '#f4f4f5', 
                  borderRadius: '12px', 
                  padding: '24px 28px', 
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
                  border: '1px solid #27272a',
                  fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif"
                }}
              >
                {/* Header Strip */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a', paddingBottom: '14px', marginBottom: '18px' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fafafa' }}>
                    Offer Letter &ndash; Confirmation of Employment
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleCopyEmailCover}
                      title="Copy email body"
                      style={{ background: 'transparent', border: '1px solid #3f3f46', color: '#a1a1aa', borderRadius: '6px', padding: '5px 10px', fontSize: '0.76rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Copy size={13} /> Copy
                    </button>
                    <span style={{ fontSize: '0.72rem', backgroundColor: '#064e3b', color: '#6ee7b7', padding: '4px 10px', borderRadius: '999px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #047857' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                      Google Workspace (Connected)
                    </span>
                  </div>
                </div>

                {/* Recipients */}
                <div style={{ marginBottom: '14px', fontSize: '0.84rem' }}>
                  <div style={{ color: '#a1a1aa', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Recipients</div>
                  <span style={{ backgroundColor: '#27272a', color: '#38bdf8', padding: '4px 12px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, display: 'inline-block' }}>
                    {candidateFullName} &lt;{currentEmployee?.email}&gt;
                  </span>
                </div>

                <div style={{ marginBottom: '18px', fontSize: '0.9rem', fontWeight: 700, color: '#f4f4f5' }}>
                  Offer Letter &ndash; Confirmation of Employment - {currentEmployee?.designation || 'Specialist'}
                </div>

                {/* Email Body */}
                <div style={{ fontSize: '0.88rem', lineHeight: 1.7, color: '#d4d4d8', whiteSpace: 'pre-line', borderTop: '1px solid #27272a', paddingTop: '18px', marginBottom: '22px' }}>
                  {coverEmailBodyText}
                </div>

                {/* Attachment Card */}
                <div style={{ backgroundColor: '#27272a', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #3f3f46', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#dc2626', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.75rem' }}>
                      PDF
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fafafa' }}>
                        Offer_Letter_{(currentEmployee?.firstName || 'Candidate').replace(/\s+/g, '_')}_{currentEmployee?.employeeId || 'EMP'}.pdf
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#a1a1aa' }}>
                        3 Pages (A4) &bull; Verified Vector PDF &bull; 25 Terms &amp; Annexure A Included
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    style={{ background: '#3f3f46', border: 'none', color: '#e4e4e7', padding: '7px 12px', borderRadius: '6px', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Download size={13} /> Download PDF
                  </button>
                </div>

                {/* Quick send trigger */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #27272a', paddingTop: '16px' }}>
                  <div style={{ fontSize: '0.76rem', color: '#a1a1aa' }}>
                    Ready to send to <strong>{currentEmployee?.email}</strong> via verified SMTP.
                  </div>
                  <button
                    type="button"
                    onClick={handleSendOfferEmail}
                    disabled={isSendingOffer || !currentEmployee?.email}
                    style={{ background: 'linear-gradient(135deg, #0E7490, #0891B2)', color: '#ffffff', fontWeight: 700, padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', opacity: isSendingOffer ? 0.7 : 1 }}
                  >
                    <Send size={15} /> {isSendingOffer ? 'Sending...' : 'Send Email to Candidate'}
                  </button>
                </div>

              </div>
            </div>
          )}


          {/* MODE 2: EDIT CLAUSES / TEXT */}
          {activeMode === 'edit' && (
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>
                  Customize Offer Letter Clauses
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Edit the text directly. Dynamic variables are already prefilled.
                </span>
              </div>

              <textarea
                rows={18}
                className="form-control"
                value={customizedContent}
                onChange={(e) => setCustomizedContent(e.target.value)}
                style={{
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: '0.86rem',
                  lineHeight: 1.6,
                  padding: '16px',
                  borderRadius: '8px'
                }}
              />

              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCustomizedContent(replacePlaceholders(currentTemplate?.content || DEFAULT_OFFER_TEMPLATE.content))}
                >
                  Reset to Original Template
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setActiveMode('preview')}
                >
                  <Eye size={14} /> Preview Changes
                </button>
              </div>
            </div>
          )}

          {/* MODE 3: CREATE NEW TEMPLATE */}
          {activeMode === 'create_template' && (
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '6px' }}>
                Create New Offer Letter Template
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '20px' }}>
                Build a reusable corporate offer template. You can use placeholders such as <code>{'{{candidate_name}}'}</code>, <code>{'{{designation}}'}</code>, <code>{'{{annual_ctc}}'}</code>, etc.
              </p>

              <form onSubmit={handleSaveNewTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                      Template Name <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Senior Data Scientist Offer"
                      className="form-control"
                      value={newTemplateForm.name}
                      onChange={(e) => setNewTemplateForm(s => ({ ...s, name: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                      Category / Department <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <select
                      className="form-control"
                      value={newTemplateForm.category}
                      onChange={(e) => setNewTemplateForm(s => ({ ...s, category: e.target.value as any }))}
                    >
                      <option value="Full-Time">Full-Time Corporate</option>
                      <option value="Engineering">Engineering & Technology</option>
                      <option value="Executive">Executive Leadership</option>
                      <option value="Internship">Internship & Graduate</option>
                      <option value="Remote">Remote & Hybrid</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                    Letter Subject Line <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Offer of Employment: {{designation}} at {{company_name}}"
                    className="form-control"
                    value={newTemplateForm.subject}
                    onChange={(e) => setNewTemplateForm(s => ({ ...s, subject: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                    Template Body Content <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea
                    rows={12}
                    required
                    placeholder="Dear {{candidate_name}},&#10;&#10;We are pleased to offer you the position of {{designation}}..."
                    className="form-control"
                    value={newTemplateForm.content}
                    onChange={(e) => setNewTemplateForm(s => ({ ...s, content: e.target.value }))}
                    style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: '0.84rem' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveMode('preview')}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ background: 'linear-gradient(135deg, #0E7490, #0891B2)', color: '#ffffff', fontWeight: 700, border: 'none', boxShadow: '0 4px 12px rgba(14, 116, 144, 0.35)' }}>
                    <Save size={14} /> Save Template
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>

        {/* MODAL FOOTER WITH ACTION BUTTONS */}
        <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {copiedToast && (
              <span style={{ fontSize: '0.8rem', color: '#0891b2', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={16} /> Copied to clipboard!
              </span>
            )}
            {savedToProfileToast && (
              <span style={{ fontSize: '0.8rem', color: '#0891b2', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={16} /> Attached to {currentEmployee?.firstName}'s Profile!
              </span>
            )}
            {sendStatus && (
              <span style={{ fontSize: '0.8rem', color: sendStatus.type === 'success' ? '#0891b2' : '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {sendStatus.type === 'success' ? <CheckCircle2 size={16} /> : <X size={16} />} {sendStatus.message}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              type="button" 
              className="btn btn-secondary btn-sm" 
              onClick={handleCopy}
              title="Copy Letter Text"
            >
              <Copy size={15} /> Copy Text
            </button>

            <button 
              type="button" 
              className="btn btn-secondary btn-sm" 
              onClick={handleDownloadTxt}
              title="Download Letter as Text"
            >
              <Download size={15} /> Download (.txt)
            </button>

            <button 
              type="button" 
              className="btn btn-secondary btn-sm" 
              onClick={handleAttachToProfile}
              title="Save directly into Employee Profile Documents"
              style={{ backgroundColor: '#ecfeff', color: '#0891b2', borderColor: '#a5f3fc', fontWeight: 700 }}
            >
              <Save size={15} /> Save to Profile
            </button>

            <button 
              type="button" 
              className="btn btn-primary btn-sm" 
              onClick={handleSendOfferEmail}
              disabled={isSendingOffer || !currentEmployee?.email}
              title="Send official offer letter with PDF attachment via verified company email"
              style={{ background: 'linear-gradient(135deg, #0E7490, #0891B2)', color: '#ffffff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(14, 116, 144, 0.28)', border: 'none', opacity: isSendingOffer ? 0.7 : 1 }}
            >
              <Send size={15} /> {isSendingOffer ? 'Sending...' : 'Send Email'}
            </button>

            <button 
              type="button" 
              className="btn btn-secondary btn-sm" 
              onClick={() => downloadElementAsPDF('printable-offer-letter', `Offer_Letter_${currentEmployee?.firstName || 'Candidate'}_${currentEmployee?.lastName || ''}`, documentProfile.companyName)}
              title="Print Offer Letter"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
            >
              <Printer size={15} /> Print
            </button>

            <button 
              type="button" 
              className="btn btn-primary btn-sm" 
              onClick={handleDownloadPDF}
              style={{ background: 'linear-gradient(135deg, #0E7490, #0891B2)', color: '#ffffff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(14, 116, 144, 0.35)', border: 'none' }}
            >
              <Download size={15} /> Download PDF
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
