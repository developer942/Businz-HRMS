import React, { useState, useEffect } from 'react';
import { CustomerContact, WhatsAppTemplate } from '../../types/customer';
import { customerService } from '../../services/customerService';
import { useHRMS } from '../../context/HRMSContext';
import { 
  X, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  Info,
  Check
} from 'lucide-react';

interface SendWhatsAppModalProps {
  customer: CustomerContact;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SendWhatsAppModal: React.FC<SendWhatsAppModalProps> = ({
  customer,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { currentUser } = useHRMS();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Quick consent record state if opt-in was missing
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [currentConsent, setCurrentConsent] = useState(customer.consentStatus);
  const [consentSource, setConsentSource] = useState('Visiting Card Exchange');
  const [consentPurpose, setConsentPurpose] = useState('Business Communications & Follow-ups');

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setCurrentConsent(customer.consentStatus);
      setError(null);
      setSuccessMessage(null);
      setShowConfirm(false);
    }
  }, [isOpen, customer]);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const list = await customerService.getTemplates(customer.companyId || 'company-a');
      // Filter strictly to approved or active templates
      const approved = list.filter(t => t.status === 'APPROVED' && t.isEnabled !== false);
      setTemplates(approved.length > 0 ? approved : list);
      if (approved.length > 0) {
        setSelectedTemplateId(approved[0].id);
      } else if (list.length > 0) {
        setSelectedTemplateId(list[0].id);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load WhatsApp templates');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  // Auto-fill variables whenever template or customer changes
  useEffect(() => {
    if (selectedTemplate) {
      const vars: Record<string, string> = {};
      const companyName = 'BUSINZ HRMS';

      selectedTemplate.variables.forEach(v => {
        switch (v) {
          case 'customer_name':
            vars[v] = customer.customerName;
            break;
          case 'customer_company':
            vars[v] = customer.companyName || 'your esteemed company';
            break;
          case 'sender_company':
            vars[v] = companyName;
            break;
          case 'employee_name':
            vars[v] = currentUser?.name || 'Our Representative';
            break;
          case 'company_phone':
            vars[v] = '+91 98765 43210';
            break;
          default:
            vars[v] = selectedTemplate.sampleValues?.[v] || '';
        }
      });
      setVariableValues(vars);
    }
  }, [selectedTemplate, customer, currentUser]);

  // Compute rendered message
  const renderMessageBody = () => {
    if (!selectedTemplate) return '';
    let body = selectedTemplate.bodyText;
    selectedTemplate.variables.forEach(v => {
      const val = variableValues[v] || `{{${v}}}`;
      body = body.split(`{{${v}}}`).join(val);
    });
    return body;
  };

  const handleRecordConsent = async () => {
    try {
      setRecordingConsent(true);
      await customerService.recordConsent({
        customerId: customer.id,
        consentStatus: 'Opted In',
        source: consentSource,
        method: 'Physical / Verbal Agreement',
        purpose: consentPurpose,
        notes: `Consent recorded by ${currentUser?.name || 'Employee'} before WhatsApp message dispatch.`
      });
      customer.consentStatus = 'Opted In';
      setCurrentConsent('Opted In');
      setSuccessMessage('Customer consent verified and recorded successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      setError(e.message || 'Failed to record consent');
    } finally {
      setRecordingConsent(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!selectedTemplate) return;
    if (currentConsent !== 'Opted In') {
      setError('Cannot dispatch message: Customer must have an explicit "Opted In" consent record.');
      return;
    }

    try {
      setSending(true);
      setError(null);
      await customerService.sendWhatsApp({
        customerContactId: customer.id,
        templateId: selectedTemplate.id,
        variableValues,
        companyId: customer.companyId || 'company-a'
      });

      setSuccessMessage('WhatsApp message dispatched successfully to Meta Cloud API!');
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (e: any) {
      setError(e.message || 'Failed to send WhatsApp message. Verify Meta credentials in Settings.');
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  };

  if (!isOpen) return null;

  const isOptedIn = currentConsent === 'Opted In';

  return (
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
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '840px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
        border: '1px solid #E7ECF3'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E7ECF3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#F8FAFC'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: '#ECFEFF',
              color: '#0E7490',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Send size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#1E293B' }}>
                Send WhatsApp Message
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748B' }}>
                Meta WhatsApp Business Cloud API Integration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          {/* Customer Summary Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            padding: '16px',
            backgroundColor: '#F8FAFC',
            borderRadius: '12px',
            border: '1px solid #E2E8F0'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>
                Customer Name
              </span>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                {customer.customerName}
              </div>
              {customer.companyName && (
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{customer.companyName}</div>
              )}
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>
                Mobile Number
              </span>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0E7490', marginTop: '2px' }}>
                {customer.contactNumber}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#10B981' }}>Normalized WhatsApp Format</div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>
                Consent Status
              </span>
              <div style={{ marginTop: '4px' }}>
                {isOptedIn ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    backgroundColor: '#DCFCE7',
                    color: '#15803D',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}>
                    <ShieldCheck size={14} /> Opted In
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    backgroundColor: '#FEE2E2',
                    color: '#B91C1C',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}>
                    <ShieldAlert size={14} /> {currentConsent}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Consent Warning & Opt-In Verification */}
          {!isOptedIn && (
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#92400E' }}>
                    WhatsApp Opt-In Permission Required
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#78350F', lineHeight: 1.5 }}>
                    Meta WhatsApp Business Cloud API requires explicit customer consent before sending business-initiated template messages. Possessing a visiting card does not automatically constitute consent.
                  </p>
                </div>
              </div>

              {/* Quick Consent Verification Box */}
              <div style={{
                backgroundColor: '#FFFFFF',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid #FCD34D',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B' }}>
                  Record Verified Customer Consent:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                      Consent Source
                    </label>
                    <input
                      type="text"
                      value={consentSource}
                      onChange={e => setConsentSource(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.85rem'
                      }}
                      placeholder="e.g. In-person Visiting Card Exchange"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                      Agreed Messaging Purpose
                    </label>
                    <input
                      type="text"
                      value={consentPurpose}
                      onChange={e => setConsentPurpose(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.85rem'
                      }}
                      placeholder="e.g. Business Communications"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button
                    onClick={handleRecordConsent}
                    disabled={recordingConsent}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#0E7490',
                      color: '#FFFFFF',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: recordingConsent ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Check size={16} />
                    {recordingConsent ? 'Recording...' : 'Verify & Record Opt-In'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Template Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#1E293B', marginBottom: '6px' }}>
              Select WhatsApp Template:
            </label>
            {loadingTemplates ? (
              <div style={{ padding: '12px', color: '#64748B', fontSize: '0.85rem' }}>Loading templates...</div>
            ) : templates.length === 0 ? (
              <div style={{ padding: '12px', color: '#EF4444', fontSize: '0.85rem' }}>
                No active WhatsApp templates found. Please configure templates under "WhatsApp Templates" first.
              </div>
            ) : (
              <select
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.9rem',
                  color: '#1E293B',
                  backgroundColor: '#FFFFFF',
                  outline: 'none'
                }}
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.templateName} ({t.category}) — {t.language} [{t.status}]
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Variables Configuration */}
          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#1E293B', marginBottom: '8px' }}>
                Dynamic Template Variables:
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '12px',
                padding: '16px',
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                border: '1px solid #E2E8F0'
              }}>
                {selectedTemplate.variables.map(v => (
                  <div key={v}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px', textTransform: 'capitalize' }}>
                      {`{{${v}}}`}
                    </label>
                    <input
                      type="text"
                      value={variableValues[v] || ''}
                      onChange={e => setVariableValues(prev => ({ ...prev, [v]: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.85rem',
                        backgroundColor: '#FFFFFF'
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live WhatsApp Chat Bubble Preview */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E293B' }}>
                Live Message Preview (WhatsApp Chat View):
              </label>
              <span style={{ fontSize: '0.75rem', color: '#0E7490', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Rendered in real-time
              </span>
            </div>

            <div style={{
              backgroundColor: '#EFEAE2',
              backgroundImage: 'radial-gradient(#CBD5E1 0.75px, transparent 0.75px)',
              backgroundSize: '12px 12px',
              borderRadius: '14px',
              padding: '24px 20px',
              display: 'flex',
              justifyContent: 'flex-start'
            }}>
              {/* WhatsApp Bubble */}
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '0px 14px 14px 14px',
                padding: '14px 18px',
                maxWidth: '480px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.15)',
                position: 'relative'
              }}>
                <div style={{
                  whiteSpace: 'pre-line',
                  fontSize: '0.9rem',
                  lineHeight: '1.5',
                  color: '#111827'
                }}>
                  {renderMessageBody() || 'Select a template to view the message preview.'}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '4px',
                  marginTop: '8px',
                  fontSize: '0.7rem',
                  color: '#9CA3AF'
                }}>
                  <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ color: '#0284C7' }}>✓✓</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback messages */}
          {error && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '8px',
              color: '#DC2626',
              fontSize: '0.85rem'
            }}>
              {error}
            </div>
          )}

          {successMessage && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '8px',
              color: '#16A34A',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <CheckCircle2 size={16} />
              {successMessage}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #E7ECF3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '12px',
          backgroundColor: '#FFFFFF'
        }}>
          <button
            onClick={onClose}
            disabled={sending}
            style={{
              padding: '10px 18px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>

          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!isOptedIn || !selectedTemplate || sending}
              style={{
                padding: '10px 22px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: !isOptedIn || !selectedTemplate ? '#CBD5E1' : '#0E7490',
                color: '#FFFFFF',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: !isOptedIn || !selectedTemplate ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: !isOptedIn ? 'none' : '0 2px 4px rgba(14, 116, 144, 0.2)'
              }}
            >
              <Send size={16} />
              Send WhatsApp
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: '#B91C1C', fontWeight: 500 }}>
                Confirm dispatch to {customer.contactNumber}?
              </span>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Back
              </button>
              <button
                onClick={handleSendWhatsApp}
                disabled={sending}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: sending ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {sending ? 'Sending...' : 'Yes, Send Now'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
