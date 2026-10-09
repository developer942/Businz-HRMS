import React, { useState, useEffect, useMemo } from 'react';
import { Employee } from '../../types/hrms';
import { OfferLetterTemplate } from '../../types/offerLetter';
import { INITIAL_OFFER_LETTER_TEMPLATES } from '../../data/offerLetterTemplates';
import { useHRMS } from '../../context/HRMSContext';
import { API_BASE_URL } from '../../config/api';
import { downloadElementAsPDF } from '../../utils/exportUtils';
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
  Printer 
} from 'lucide-react';

interface OfferLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmployee?: Employee | null;
}

const DEFAULT_OFFER_TEMPLATE: OfferLetterTemplate = {
  id: 'TPL-DEFAULT-DYNAMIC',
  name: 'Standard Offer Letter',
  category: 'Full-Time',
  badgeColor: '#0E7490',
  description: 'Standard dynamic employment offer template.',
  subject: 'Offer of Employment - {{designation}}',
  content: `Dear {{candidate_name}},

We are pleased to offer you the position of {{designation}} in the {{department}} department at {{company_name}}.

Your expected date of joining is {{joining_date}}. Your employment type will be {{employment_type}}, and your work location will be {{work_location}}.

Your compensation details are provided in Annexure A. This offer is subject to successful completion of company joining formalities and verification of documents submitted during onboarding.

Please confirm your acceptance by signing this letter. We look forward to welcoming you to {{company_name}}.`
};

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
  const [activeMode, setActiveMode] = useState<'preview' | 'edit' | 'create_template'>('preview');

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

  // Replace placeholders helper
  const replacePlaceholders = (text: string) => {
    if (!currentEmployee) return text;

    const todayStr = formatDateDDMMYYYY(new Date());

    const values: { [key: string]: string } = {
      '{{candidate_name}}': `${currentEmployee.firstName} ${currentEmployee.lastName}`,
      '{{employee_name}}': `${currentEmployee.firstName} ${currentEmployee.lastName}`,
      '{{employee_id}}': currentEmployee.employeeId,
      '{{designation}}': currentEmployee.designation,
      '{{department}}': currentEmployee.department,
      '{{joining_date}}': (currentEmployee.joiningDate ? formatDateDDMMYYYY(currentEmployee.joiningDate) : '') || todayStr,
      '{{employment_type}}': currentEmployee.employmentType || 'Full-Time',
      '{{reporting_manager}}': currentEmployee.reportingManagerName || 'Executive Leadership',
      '{{basic_salary}}': formatCurrency(basicPay),
      '{{monthly_gross}}': formatCurrency(monthlyGross),
      '{{annual_ctc}}': formatCurrency(annualCtc),
      '{{work_location}}': currentEmployee.workLocation || currentEmployee.bankDetails?.branch || 'Head Office',
      '{{company_name}}': documentProfile.companyName,
      '{{issue_date}}': todayStr
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

  if (!isOpen) return null;

  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(customizedContent);
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
    downloadElementAsPDF(
      'printable-offer-letter', 
      `Offer_Letter_${currentEmployee?.firstName || 'Employee'}_${currentEmployee?.employeeId || ''}`,
      documentProfile.companyName
    );
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
    const compensationText = [
      '',
      'Annexure A: Compensation & Benefits Structure',
      ...compensationRows
        .filter(row => row.amount > 0)
        .map(row => `${row.label}: Monthly ${formatCurrency(row.amount)} / Annual ${formatCurrency(row.amount * 12)}`),
      `Total Cost to Company (CTC): Monthly ${formatCurrency(monthlyCtc)} / Annual ${formatCurrency(annualCtc)}`,
    ].join('\n');

    try {
      const response = await fetch(`${API_BASE_URL}/employees/send-offer-letter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          to: currentEmployee.email,
          candidateName: `${currentEmployee.firstName || ''} ${currentEmployee.lastName || ''}`.trim(),
          employeeCode: currentEmployee.employeeId,
          subject: replacePlaceholders(currentTemplate?.subject || DEFAULT_OFFER_TEMPLATE.subject),
          letterBody: `${customizedContent}\n${compensationText}`,
          companyName: documentProfile.companyName,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error?.message || 'Offer letter email could not be sent.');
      }

      setSendStatus({ type: 'success', message: `Offer letter sent to ${currentEmployee.email}` });
      setTimeout(() => setSendStatus(null), 3000);
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
                color: activeMode === 'preview' ? '#0891b2' : '#64748b',
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
              <Eye size={14} color={activeMode === 'preview' ? '#155DFC' : 'currentColor'} /> Preview Document
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('edit')}
              style={{
                border: 'none',
                background: activeMode === 'edit' ? '#ffffff' : 'transparent',
                color: activeMode === 'edit' ? '#155DFC' : '#64748b',
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
              <Edit3 size={14} color={activeMode === 'edit' ? '#155DFC' : 'currentColor'} /> Edit Clauses
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('create_template')}
              style={{
                border: 'none',
                background: activeMode === 'create_template' ? '#ffffff' : 'transparent',
                color: activeMode === 'create_template' ? '#155DFC' : '#64748b',
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
              <Plus size={14} color={activeMode === 'create_template' ? '#155DFC' : 'currentColor'} /> New Template
            </button>
          </div>

        </div>

        {/* TEMPLATE PICKER STRIP */}
        {activeMode !== 'create_template' && (
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
                      border: isSelected ? '1.5px solid #155DFC' : '1px solid #e2e8f0',
                      backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                      color: isSelected ? '#155DFC' : '#475569',
                      fontSize: '0.8rem',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: isSelected ? '0 1px 4px rgba(21, 93, 252, 0.25)' : 'none',
                      transition: 'all 0.15s ease',
                      flexShrink: 0
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '99px', backgroundColor: isSelected ? '#155DFC' : tpl.badgeColor }} />
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
            <div 
              id="printable-offer-letter"
              style={{ 
                backgroundColor: '#ffffff', 
                borderRadius: '8px', 
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)', 
                padding: '40px 48px', 
                maxWidth: '780px', 
                margin: '0 auto',
                fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
                color: '#1e293b',
                lineHeight: 1.65,
                border: '1px solid #e2e8f0'
              }}
            >
              <CompanyHeader
                profile={documentProfile}
                title="Offer Letter"
                subtitle="Official Appointment"
                rightMeta={[
                  { label: 'Ref No', value: `OL-${new Date().getFullYear()}-${currentEmployee?.employeeId || 'EMP'}` },
                  { label: 'Date', value: formatDateDDMMYYYY(new Date()) }
                ]}
              />

              <EmployeeDetailsGrid
                rows={[
                  { label: 'Candidate', value: `${currentEmployee?.firstName || ''} ${currentEmployee?.lastName || ''}`.trim() },
                  { label: 'Employee ID', value: currentEmployee?.employeeId },
                  { label: 'Department', value: currentEmployee?.department },
                  { label: 'Designation', value: currentEmployee?.designation },
                  { label: 'Joining Date', value: formatDateDDMMYYYY(currentEmployee?.joiningDate || currentEmployee?.dateOfJoining) || '—' },
                  { label: 'Employment Type', value: currentEmployee?.employmentType },
                  { label: 'Work Location', value: currentEmployee?.workLocation || currentEmployee?.bankDetails?.branch },
                  { label: 'Email', value: currentEmployee?.email },
                  { label: 'Contact', value: currentEmployee?.phone },
                  { label: 'Residential Address', value: currentEmployee?.address }
                ]}
              />


              {/* Subject */}
              <div style={{ fontWeight: 800, fontSize: '0.94rem', color: '#0f172a', marginBottom: '18px' }}>
                <span style={{ borderBottom: '2px solid #0f172a', paddingBottom: '2px' }}>
                  Subject: {replacePlaceholders(currentTemplate?.subject || DEFAULT_OFFER_TEMPLATE.subject)}
                </span>
              </div>

              {/* Letter Body */}
              <div style={{ fontSize: '0.86rem', whiteSpace: 'pre-line', color: '#334155', marginBottom: '26px' }}>
                {customizedContent}
              </div>

              {/* SALARY & COMPENSATION ANNEXURE */}
              <div style={{ marginTop: '28px', marginBottom: '28px', pageBreakInside: 'avoid' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Annexure A: Compensation & Benefits Structure
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', border: '1px solid #cbd5e1' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>Salary Component</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Monthly (INR)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Annualized (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...compensationRows
                    ].filter(row => row.amount > 0).map(row => (
                      <tr key={row.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '7px 12px' }}>{row.label}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'right' }}>{formatCurrency(row.amount)}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'right' }}>{formatCurrency(row.amount * 12)}</td>
                      </tr>
                    ))}
                    <tr style={{ backgroundColor: '#f0fdf4', fontWeight: 800, color: '#15803d', borderTop: '2px solid #bbf7d0' }}>
                      <td style={{ padding: '9px 12px' }}>Total Cost to Company (CTC)</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>{formatCurrency(monthlyCtc)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>{formatCurrency(annualCtc)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Signature Blocks */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
                <AuthorizedSignatory profile={documentProfile} />

                <div>
                  <div style={{ height: '45px' }}></div>
                  <div style={{ borderTop: '1px dashed #94a3b8', paddingTop: '6px', fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>Candidate Acceptance Signature</div>
                    <div style={{ color: '#64748b' }}>Name: {currentEmployee?.firstName} {currentEmployee?.lastName}</div>
                    <div style={{ color: '#64748b', fontSize: '0.72rem' }}>Date: ________________________</div>
                  </div>
                </div>
              </div>

              <CompanyFooter profile={documentProfile} />

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
                  <button type="submit" className="btn btn-primary btn-sm" style={{ background: 'linear-gradient(135deg, #155DFC, #1d4ed8)', color: '#ffffff', fontWeight: 700, boxShadow: '0 4px 12px rgba(21, 93, 252, 0.35)' }}>
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
              title="Send offer letter from developer@businz.com"
              style={{ background: 'linear-gradient(135deg, #155DFC, #1D4ED8)', color: '#ffffff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(21, 93, 252, 0.28)', border: 'none', opacity: isSendingOffer ? 0.7 : 1 }}
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
