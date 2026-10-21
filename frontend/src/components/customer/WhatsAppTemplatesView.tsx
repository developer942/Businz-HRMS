import React, { useState, useEffect } from 'react';
import { WhatsAppTemplate, WhatsAppTemplateCategory } from '../../types/customer';
import { customerService } from '../../services/customerService';
import { useHRMS } from '../../context/HRMSContext';
import { 
  MessageSquare, 
  Plus, 
  Send, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Copy, 
  Edit3, 
  Trash2, 
  X,
  Check,
  Power,
  Eye,
  Info
} from 'lucide-react';

export const WhatsAppTemplatesView: React.FC = () => {
  const { currentUser } = useHRMS();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create / Edit modal state
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);

  // Template Form Fields
  const [templateName, setTemplateName] = useState('');
  const [category, setCategory] = useState<WhatsAppTemplateCategory>('MARKETING');
  const [language, setLanguage] = useState('en_US');
  const [bodyText, setBodyText] = useState('');
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({
    customer_name: 'Rajesh Kumar',
    customer_company: 'Apex Logistics',
    sender_company: 'Businz Technologies',
    employee_name: 'Priya Sharma',
    company_phone: '+91 98765 43210'
  });

  const availableVariables = [
    { key: 'customer_name', label: 'Customer Name', sample: 'Rajesh Kumar' },
    { key: 'customer_company', label: 'Customer Company', sample: 'Apex Logistics' },
    { key: 'sender_company', label: 'Sender Company', sample: 'Businz Technologies' },
    { key: 'employee_name', label: 'Employee Name', sample: 'Priya Sharma' },
    { key: 'company_phone', label: 'Company Phone', sample: '+91 98765 43210' }
  ];

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const list = await customerService.getTemplates(currentUser?.company_id || 'company-a');
      setTemplates(list);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch WhatsApp templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [currentUser]);

  const insertVariable = (varKey: string) => {
    const placeholder = `{{${varKey}}}`;
    setBodyText(prev => prev + placeholder);
  };

  const handleOpenNew = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setCategory('MARKETING');
    setLanguage('en_US');
    setBodyText('Hello {{customer_name}},\n\nGreetings from {{sender_company}}!\n\nThank you for connecting with {{employee_name}} today. We look forward to staying in touch.\n\nBest Regards,\n{{sender_company}} Team');
    setShowEditor(true);
  };

  const handleOpenEdit = (t: WhatsAppTemplate) => {
    setEditingTemplate(t);
    setTemplateName(t.templateName);
    setCategory(t.category);
    setLanguage(t.language);
    setBodyText(t.bodyText);
    setSampleValues(t.sampleValues || {});
    setShowEditor(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      setError('Template Name is required.');
      return;
    }
    if (!bodyText.trim()) {
      setError('Message body is required.');
      return;
    }

    // Extract variables from bodyText
    const foundVars: string[] = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = regex.exec(bodyText)) !== null) {
      if (!foundVars.includes(match[1])) {
        foundVars.push(match[1]);
      }
    }

    try {
      setError(null);
      await customerService.saveTemplate({
        id: editingTemplate?.id,
        companyId: currentUser?.company_id || 'company-a',
        templateName: templateName.trim(),
        category,
        language,
        bodyText,
        variables: foundVars,
        sampleValues,
        status: editingTemplate?.status || 'DRAFT',
        isEnabled: true
      });

      setSuccess('Template saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
      setShowEditor(false);
      fetchTemplates();
    } catch (e: any) {
      setError(e.message || 'Failed to save template');
    }
  };

  const handleSubmitToMeta = async (t: WhatsAppTemplate) => {
    try {
      setSubmittingId(t.id);
      setError(null);
      const res = await customerService.submitTemplateToMeta(t.id, currentUser?.company_id || 'company-a');
      setSuccess(`Template "${t.templateName}" submitted to Meta for review (Status: ${res.status})!`);
      setTimeout(() => setSuccess(null), 4000);
      fetchTemplates();
    } catch (e: any) {
      setError(e.message || 'Failed to submit template to Meta. Please verify WABA credentials in Settings.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleSyncStatus = async (t: WhatsAppTemplate) => {
    try {
      setSyncingId(t.id);
      setError(null);
      const res = await customerService.syncTemplateStatus(t.id);
      setSuccess(`Synced "${t.templateName}" with Meta: Status is ${res.status}`);
      setTimeout(() => setSuccess(null), 3000);
      fetchTemplates();
    } catch (e: any) {
      setError(e.message || 'Status sync error');
    } finally {
      setSyncingId(null);
    }
  };

  // Live rendered preview
  const getRenderedPreview = () => {
    let text = bodyText;
    Object.entries(sampleValues).forEach(([k, v]) => {
      text = text.split(`{{${k}}}`).join(v);
    });
    return text;
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#DCFCE7',
            color: '#15803D',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <CheckCircle2 size={12} /> Approved
          </span>
        );
      case 'PENDING':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#FEF3C7',
            color: '#B45309',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <Clock size={12} /> Pending Meta Review
          </span>
        );
      case 'REJECTED':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#FEE2E2',
            color: '#B91C1C',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <AlertTriangle size={12} /> Rejected by Meta
          </span>
        );
      default:
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#F1F5F9',
            color: '#475569',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            Draft (Not Submitted)
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header Card */}
      <div className="customer-card-box" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#1E293B', margin: '0 0 4px 0', lineHeight: 1.25 }}>
            WhatsApp Templates
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0, wordBreak: 'break-word' }}>
            Create, manage and submit pre-approved Meta WhatsApp Cloud API templates with dynamic customer personalization.
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 18px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#0E7490',
            color: '#FFFFFF',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)',
            whiteSpace: 'nowrap'
          }}
        >
          <Plus size={16} /> Create New Template
        </button>
      </div>

      {error && (
        <div style={{
          padding: '14px 18px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '12px',
          color: '#DC2626',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '14px 18px',
          backgroundColor: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: '12px',
          color: '#16A34A',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}

      {/* Templates Table Card */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E7ECF3' }}>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Template Name</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Category</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Language</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Meta Identifier</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Approval Status</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Version</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                    Loading WhatsApp templates...
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: '4px' }}>
                      No Templates Configured
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>
                      Click "Create New Template" to draft and submit a template to Meta.
                    </div>
                  </td>
                </tr>
              ) : (
                templates.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 600, color: '#1E293B' }}>
                      {t.templateName}
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: t.category === 'MARKETING' ? '#EFF6FF' : '#F0FDF4',
                        color: t.category === 'MARKETING' ? '#1D4ED8' : '#15803D',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        {t.category}
                      </span>
                    </td>

                    <td style={{ padding: '14px 18px', color: '#64748B' }}>
                      {t.language}
                    </td>

                    <td style={{ padding: '14px 18px', color: '#0E7490', fontFamily: 'monospace' }}>
                      {t.metaTemplateName}
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      {renderStatusBadge(t.status)}
                    </td>

                    <td style={{ padding: '14px 18px', color: '#64748B' }}>
                      v{t.version || 1}
                    </td>

                    <td style={{ padding: '14px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleOpenEdit(t)}
                          title="Edit Template"
                          style={{
                            border: 'none',
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.8rem'
                          }}
                        >
                          <Edit3 size={14} /> Edit
                        </button>

                        {t.status === 'DRAFT' && (
                          <button
                            onClick={() => handleSubmitToMeta(t)}
                            disabled={submittingId === t.id}
                            title="Submit to Meta"
                            style={{
                              border: 'none',
                              backgroundColor: '#0E7490',
                              color: '#FFFFFF',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              cursor: submittingId === t.id ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.8rem',
                              fontWeight: 600
                            }}
                          >
                            <Send size={13} />
                            {submittingId === t.id ? 'Submitting...' : 'Submit to Meta'}
                          </button>
                        )}

                        <button
                          onClick={() => handleSyncStatus(t)}
                          disabled={syncingId === t.id}
                          title="Check Meta Status"
                          style={{
                            border: 'none',
                            backgroundColor: '#F1F5F9',
                            color: '#0E7490',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            cursor: syncingId === t.id ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.8rem'
                          }}
                        >
                          <RefreshCw size={13} className={syncingId === t.id ? 'animate-spin' : ''} />
                          Check Status
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Template Dual-Pane Modal */}
      {showEditor && (
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
            maxWidth: '1050px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
            border: '1px solid #E7ECF3'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #E7ECF3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1E293B' }}>
                    {editingTemplate ? 'Edit WhatsApp Template' : 'Create WhatsApp Template'}
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                    Dual-pane editor with live WhatsApp bubble preview & sample data
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowEditor(false)}
                style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body - Dual Pane */}
            <div style={{
              padding: '24px',
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr',
              gap: '24px'
            }}>
              {/* Left Pane: Template Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', marginBottom: '6px' }}>
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="e.g. Customer Welcome"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', marginBottom: '6px' }}>
                      Category (Meta-Compliant) *
                    </label>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value as WhatsAppTemplateCategory)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.85rem',
                        backgroundColor: '#FFFFFF'
                      }}
                    >
                      <option value="MARKETING">Marketing (Offers, Welcome, Intros)</option>
                      <option value="UTILITY">Utility (Follow-ups, Updates, Alerts)</option>
                      <option value="AUTHENTICATION">Authentication (OTPs)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', marginBottom: '6px' }}>
                      Language *
                    </label>
                    <select
                      value={language}
                      onChange={e => setLanguage(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.85rem',
                        backgroundColor: '#FFFFFF'
                      }}
                    >
                      <option value="en_US">English (US)</option>
                      <option value="en_GB">English (UK)</option>
                      <option value="ta">Tamil (தமிழ்)</option>
                      <option value="hi">Hindi (हिंदी)</option>
                    </select>
                  </div>
                </div>

                {/* Variable Chips Inserter */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                      Insert Dynamic Personalization Variables:
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Click chip to insert</span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {availableVariables.map(v => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '8px',
                          border: '1px solid #CFFAFE',
                          backgroundColor: '#ECFEFF',
                          color: '#0E7490',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        + {`{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Body Text Area */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', marginBottom: '6px' }}>
                    Message Body Content *
                  </label>
                  <textarea
                    rows={8}
                    value={bodyText}
                    onChange={e => setBodyText(e.target.value)}
                    placeholder="Type message content here..."
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.9rem',
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                    Variables inside double brackets like <code>{'{{customer_name}}'}</code> are automatically mapped to Meta numeric placeholders during API submission.
                  </div>
                </div>
              </div>

              {/* Right Pane: Live WhatsApp Chat Bubble Preview */}
              <div style={{
                backgroundColor: '#F8FAFC',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>
                    Live WhatsApp Preview
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: '#0E7490', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Customer view
                  </span>
                </div>

                {/* WhatsApp Chat Canvas */}
                <div style={{
                  backgroundColor: '#E5DDD5',
                  backgroundImage: 'radial-gradient(#CBD5E1 0.75px, transparent 0.75px)',
                  backgroundSize: '12px 12px',
                  borderRadius: '12px',
                  padding: '20px 16px',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'flex-start'
                }}>
                  <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '0px 14px 14px 14px',
                    padding: '14px 16px',
                    maxWidth: '100%',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.15)',
                    position: 'relative'
                  }}>
                    <div style={{
                      whiteSpace: 'pre-line',
                      fontSize: '0.875rem',
                      lineHeight: '1.5',
                      color: '#111827'
                    }}>
                      {getRenderedPreview() || 'Your message preview will appear here.'}
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
                      <span>12:45 PM</span>
                      <span style={{ color: '#0284C7' }}>✓✓</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '6px' }}>
                    Meta Sample Test Values:
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#64748B' }}>customer_name</span>
                      <input
                        type="text"
                        value={sampleValues['customer_name'] || ''}
                        onChange={e => setSampleValues(p => ({ ...p, customer_name: e.target.value }))}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#64748B' }}>sender_company</span>
                      <input
                        type="text"
                        value={sampleValues['sender_company'] || ''}
                        onChange={e => setSampleValues(p => ({ ...p, sender_company: e.target.value }))}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
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
                onClick={() => setShowEditor(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                onClick={handleSaveTemplate}
                style={{
                  padding: '10px 22px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
                }}
              >
                <Check size={16} /> Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
