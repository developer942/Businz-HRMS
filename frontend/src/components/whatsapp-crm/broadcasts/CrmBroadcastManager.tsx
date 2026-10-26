/**
 * WhatsApp CRM Broadcast Manager for BUSINZ HRMS
 * Multi-Step Broadcast Campaign Wizard with Anti-Spam Consent Guardrail
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import React, { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Eye,
  CheckCheck,
  X,
  FileText,
  Sparkles,
  Smartphone
} from 'lucide-react';
import { crmService } from '../../../services/crmService';
import type { CrmBroadcast, CrmContact, CrmTemplate } from '../../../types/crm';

interface VariableMapping {
  source: 'name' | 'company' | 'phone' | 'custom';
  customValue: string;
}

export const CrmBroadcastManager: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<CrmBroadcast[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Wizard state
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [campaignName, setCampaignName] = useState<string>('');
  const [templates, setTemplates] = useState<CrmTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CrmTemplate | null>(null);

  // Dynamic variable mappings: { [varNumber: number]: VariableMapping }
  const [variableMappings, setVariableMappings] = useState<{ [key: number]: VariableMapping }>({});

  // Audience targeting
  const [targetCategory, setTargetCategory] = useState<string>('All');
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [eligibleCount, setEligibleCount] = useState<number>(0);
  const [excludedCount, setExcludedCount] = useState<number>(0);

  // Sending status
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [dispatchProgress, setDispatchProgress] = useState<string>('');

  useEffect(() => {
    loadBroadcasts();
  }, []);

  const loadBroadcasts = async () => {
    setLoading(true);
    try {
      const data = await crmService.getBroadcasts();
      setBroadcasts(data);
    } catch (err) {
      console.error('Failed to load broadcasts:', err);
    } finally {
      setLoading(false);
    }
  };

  const startNewBroadcastWizard = async () => {
    setShowWizard(true);
    setStep(1);
    setCampaignName(`Broadcast ${new Date().toLocaleDateString()}`);
    try {
      const tmpls = await crmService.getTemplates();
      // Strictly prevent sending unapproved templates by filtering for APPROVED only
      const approvedOnly = tmpls.filter((t: any) => (t.status || '').toUpperCase() === 'APPROVED');
      setTemplates(approvedOnly);
      if (approvedOnly.length > 0) {
        setSelectedTemplate(approvedOnly[0]);
      } else {
        setSelectedTemplate(null);
      }
    } catch (err) {
      console.error('Failed to load templates for broadcast:', err);
    }
  };

  // Helper to extract sequential {{1}}, {{2}} variables from bodyText
  const extractVariables = (tmpl: CrmTemplate | null): number[] => {
    if (!tmpl?.bodyText) return [];
    const matches = tmpl.bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const nums = matches.map(m => parseInt(m.replace(/\D/g, ''), 10));
    return Array.from(new Set(nums)).sort((a, b) => a - b);
  };

  // When selectedTemplate changes, initialize variable mappings
  useEffect(() => {
    if (!selectedTemplate) {
      setVariableMappings({});
      return;
    }
    const vars = extractVariables(selectedTemplate);
    const initial: { [key: number]: VariableMapping } = {};
    vars.forEach((v, idx) => {
      const defaultSource = idx === 0 ? 'name' : idx === 1 ? 'company' : 'custom';
      const exampleVal = selectedTemplate.bodyExampleValues?.[idx] || '';
      initial[v] = {
        source: defaultSource,
        customValue: exampleVal || `Sample ${v}`
      };
    });
    setVariableMappings(initial);
  }, [selectedTemplate]);

  // When step 3 is active or target category changes, calculate eligible audience
  useEffect(() => {
    if (showWizard && step >= 3) {
      calculateAudience();
    }
  }, [showWizard, step, targetCategory]);

  const calculateAudience = async () => {
    try {
      const res = await crmService.getContacts({
        category: targetCategory === 'All' ? undefined : targetCategory,
        limit: 500
      });
      const all = res.contacts;
      setContacts(all);
      const eligible = all.filter(c => c.consentStatus === 'Opted In');
      setEligibleCount(eligible.length);
      setExcludedCount(all.length - eligible.length);
    } catch (err) {
      console.error('Error calculating audience:', err);
    }
  };

  // Resolve variable value for a specific recipient
  const resolveVariableForContact = (varNum: number, contact: CrmContact): string => {
    const mapping = variableMappings[varNum];
    if (!mapping) return '';
    if (mapping.source === 'name') return contact.name || 'Valued Customer';
    if (mapping.source === 'company') return contact.companyName || 'Valued Organization';
    if (mapping.source === 'phone') return contact.phone || '';
    return mapping.customValue || `[Val ${varNum}]`;
  };

  // Generate live preview text with sample variable substitution
  const getPreviewBodyText = (): string => {
    if (!selectedTemplate?.bodyText) return '';
    let text = selectedTemplate.bodyText;
    const vars = extractVariables(selectedTemplate);
    vars.forEach(v => {
      const mapping = variableMappings[v];
      let sampleVal = 'Alex Morgan';
      if (mapping) {
        if (mapping.source === 'name') sampleVal = 'Alex Morgan';
        else if (mapping.source === 'company') sampleVal = 'Acme Corp';
        else if (mapping.source === 'phone') sampleVal = '+91 98765 43210';
        else sampleVal = mapping.customValue || `[Var ${v}]`;
      }
      text = text.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), sampleVal);
    });
    return text;
  };

  const handleDispatchBroadcast = async () => {
    if (!selectedTemplate || eligibleCount === 0) return;
    setIsDispatching(true);
    setDispatchProgress('Initializing broadcast campaign...');

    try {
      const eligible = contacts.filter(c => c.consentStatus === 'Opted In');
      const vars = extractVariables(selectedTemplate);

      // 1. Record broadcast in backend PostgreSQL database
      const createdBroadcast = await crmService.createBroadcast({
        name: campaignName.trim() || `Broadcast ${new Date().toLocaleDateString()}`,
        templateName: selectedTemplate.name,
        templateLanguage: selectedTemplate.language || 'en',
        templateVariables: variableMappings,
        audienceFilter: { category: targetCategory },
        status: 'sending',
        totalRecipients: eligible.length
      });

      let successCount = 0;
      let failCount = 0;

      // 2. Dispatch template message to each opted-in contact
      for (let i = 0; i < eligible.length; i++) {
        const contact = eligible[i];
        setDispatchProgress(`Dispatching message ${i + 1} of ${eligible.length} to ${contact.name}...`);

        const bodyParameters = vars.map(v => resolveVariableForContact(v, contact));

        try {
          await crmService.sendTemplateMessage({
            contactId: contact.id,
            recipientPhone: contact.phone,
            recipientName: contact.name,
            templateName: selectedTemplate.name,
            language: selectedTemplate.language || 'en',
            category: selectedTemplate.category,
            bodyParameters
          });
          successCount++;
        } catch (dispatchErr) {
          console.warn(`Failed sending to ${contact.phone}:`, dispatchErr);
          failCount++;
        }
      }

      alert(`Broadcast Completed!\n\n${successCount} messages delivered successfully.\n${failCount} failed.`);
      setShowWizard(false);
      loadBroadcasts();
    } catch (err: any) {
      alert(`Broadcast dispatch error: ${err.message}`);
    } finally {
      setIsDispatching(false);
      setDispatchProgress('');
    }
  };

  const templateVars = extractVariables(selectedTemplate);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div className="crm-templates-header-card">
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: '1.25rem', color: '#1E293B', fontWeight: 600 }}>
            Broadcast Campaigns
          </h3>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748B' }}>
            Dispatch Meta-approved WhatsApp template messages to customer segments with automated consent filtering.
          </p>
        </div>

        <div className="crm-broadcasts-header-actions">
          <button
            onClick={loadBroadcasts}
            title="Refresh Broadcasts"
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              color: '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <RefreshCw size={16} />
          </button>

          <button
            onClick={startNewBroadcastWizard}
            className="crm-broadcasts-new-btn"
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(14,116,144,0.2)',
              whiteSpace: 'nowrap'
            }}
          >
            <Plus size={18} />
            <span>New Broadcast Campaign</span>
          </button>
        </div>
      </div>

      {/* Broadcast Campaigns Table */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div className="table-responsive" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '14px 20px' }}>Campaign</th>
                <th style={{ padding: '14px 20px' }}>Template</th>
                <th style={{ padding: '14px 20px' }}>Audience Target</th>
                <th style={{ padding: '14px 20px' }}>Recipients</th>
                <th style={{ padding: '14px 20px' }}>Delivered</th>
                <th style={{ padding: '14px 20px' }}>Read</th>
                <th style={{ padding: '14px 20px' }}>Status</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Sent At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                    Loading campaigns...
                  </td>
                </tr>
              ) : broadcasts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
                    <Send size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                    <div style={{ fontWeight: 600, color: '#475569', fontSize: '1rem' }}>No broadcast campaigns dispatched yet</div>
                    <div style={{ fontSize: '0.82rem', marginTop: '4px', color: '#94A3B8' }}>
                      Click "+ New Broadcast Campaign" above to dispatch approved Meta templates.
                    </div>
                  </td>
                </tr>
              ) : (
                broadcasts.map(b => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '14px 20px', fontWeight: 600, color: '#1E293B' }}>
                      {b.name || b.campaignName || 'Campaign'}
                    </td>
                    <td style={{ padding: '14px 20px', color: '#0E7490', fontFamily: 'monospace' }}>
                      {b.templateName}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        backgroundColor: '#ECFEFF',
                        color: '#0E7490',
                        fontWeight: 600
                      }}>
                        {b.targetCategory || b.audienceFilter?.category || 'All Contacts'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', color: '#334155', fontWeight: 600 }}>
                      {b.totalRecipients || 0}
                    </td>
                    <td style={{ padding: '14px 20px', color: '#059669', fontWeight: 600 }}>
                      {b.deliveredCount || b.sentCount || 0}
                    </td>
                    <td style={{ padding: '14px 20px', color: '#0891B2', fontWeight: 600 }}>
                      {b.readCount || 0}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '3px 9px',
                        borderRadius: '9999px',
                        backgroundColor:
                          b.status === 'completed'
                            ? '#DCFCE7'
                            : b.status === 'sending'
                            ? '#FEF3C7'
                            : '#F1F5F9',
                        color:
                          b.status === 'completed'
                            ? '#166534'
                            : b.status === 'sending'
                            ? '#92400E'
                            : '#475569',
                        fontWeight: 600
                      }}>
                        {b.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', color: '#64748B', fontSize: '0.8rem' }}>
                      {b.createdAt ? new Date(b.createdAt).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Step Broadcast Campaign Modal */}
      {showWizard && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            padding: '28px',
            width: '720px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.25rem', color: '#1E293B', fontWeight: 700 }}>
                  Create Broadcast Campaign
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
                  {step === 1 && 'Step 1 of 3: Select Approved Template'}
                  {step === 2 && 'Step 2 of 3: Map Dynamic Variables & Live Preview'}
                  {step === 3 && 'Step 3 of 3: Audience Targeting & Consent Verification'}
                </span>
              </div>
              <button
                onClick={() => setShowWizard(false)}
                disabled={isDispatching}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Stepper Progress Bar */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  style={{
                    flex: 1,
                    height: '4px',
                    borderRadius: '2px',
                    backgroundColor: s <= step ? '#0E7490' : '#E2E8F0',
                    transition: 'all 0.25s ease'
                  }}
                />
              ))}
            </div>

            {/* STEP 1: Select Template */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Campaign Name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder="e.g. Diwali Offer Announcement 2026"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                      Select Approved Meta WhatsApp Template <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#0E7490', fontWeight: 600 }}>
                      {templates.length} Approved Available
                    </span>
                  </div>

                  {templates.length === 0 ? (
                    <div style={{
                      padding: '28px',
                      textAlign: 'center',
                      backgroundColor: '#FEF2F2',
                      borderRadius: '12px',
                      border: '1px solid #FECACA',
                      color: '#991B1B'
                    }}>
                      <AlertCircle size={28} style={{ margin: '0 auto 8px', color: '#EF4444' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No Meta-Approved Templates Found</div>
                      <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: '#B91C1C' }}>
                        To prevent account policy violations, broadcasts can only be sent using templates that have been reviewed and approved by Meta.
                      </p>
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      maxHeight: '280px',
                      overflowY: 'auto',
                      paddingRight: '4px'
                    }}>
                      {templates.map(tmpl => {
                        const isSelected = selectedTemplate?.id === tmpl.id || selectedTemplate?.name === tmpl.name;
                        const varsCount = extractVariables(tmpl).length;

                        return (
                          <div
                            key={tmpl.id || tmpl.name}
                            onClick={() => setSelectedTemplate(tmpl)}
                            style={{
                              padding: '14px',
                              borderRadius: '12px',
                              border: isSelected ? '2px solid #0E7490' : '1px solid #E2E8F0',
                              backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.92rem', fontFamily: 'monospace' }}>
                                  {tmpl.name}
                                </span>
                                <span style={{
                                  fontSize: '0.7rem',
                                  padding: '2px 8px',
                                  borderRadius: '9999px',
                                  backgroundColor: '#DCFCE7',
                                  color: '#166534',
                                  fontWeight: 600
                                }}>
                                  {tmpl.category}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                  ({tmpl.language})
                                </span>
                              </div>

                              {varsCount > 0 && (
                                <span style={{
                                  fontSize: '0.72rem',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: '#E0F2FE',
                                  color: '#0369A1',
                                  fontWeight: 600
                                }}>
                                  {varsCount} variable{varsCount > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>

                            <div style={{
                              fontSize: '0.82rem',
                              color: '#475569',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              lineHeight: '1.4'
                            }}>
                              {tmpl.bodyText || tmpl.rawComponents?.find((c: any) => c.type === 'BODY')?.text || 'Template Body'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!selectedTemplate}
                    style={{
                      padding: '10px 22px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: selectedTemplate ? '#0E7490' : '#E2E8F0',
                      color: selectedTemplate ? '#FFFFFF' : '#94A3B8',
                      fontWeight: 600,
                      cursor: selectedTemplate ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>Next: Variables & Preview</span>
                    <span>›</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Map Dynamic Variables & Live Message Preview */}
            {step === 2 && selectedTemplate && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: templateVars.length > 0 ? '1.1fr 0.9fr' : '1fr', gap: '20px' }}>
                  {/* Left Column: Variable Mappings */}
                  {templateVars.length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <Sparkles size={16} color="#0E7490" />
                        <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1E293B' }}>
                          Map Dynamic Variables
                        </label>
                      </div>
                      <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#64748B' }}>
                        Map each template placeholder to contact fields or enter custom static text.
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '340px', overflowY: 'auto' }}>
                        {templateVars.map(v => {
                          const mapping = variableMappings[v] || { source: 'name', customValue: '' };

                          return (
                            <div
                              key={v}
                              style={{
                                padding: '12px 14px',
                                borderRadius: '12px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: '#F8FAFC'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  fontFamily: 'monospace',
                                  color: '#0E7490',
                                  backgroundColor: '#ECFEFF',
                                  padding: '2px 8px',
                                  borderRadius: '6px'
                                }}>
                                  {`{{${v}}}`}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                  Source Field
                                </span>
                              </div>

                              <select
                                value={mapping.source}
                                onChange={e => {
                                  const src = e.target.value as any;
                                  setVariableMappings(prev => ({
                                    ...prev,
                                    [v]: { ...mapping, source: src }
                                  }));
                                }}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  borderRadius: '8px',
                                  border: '1px solid #CBD5E1',
                                  fontSize: '0.85rem',
                                  backgroundColor: '#FFFFFF',
                                  marginBottom: mapping.source === 'custom' ? '8px' : '0'
                                }}
                              >
                                <option value="name">Customer Full Name (e.g. Alex Morgan)</option>
                                <option value="company">Customer Company Name</option>
                                <option value="phone">Customer Phone Number</option>
                                <option value="custom">Custom Static Text...</option>
                              </select>

                              {mapping.source === 'custom' && (
                                <input
                                  type="text"
                                  value={mapping.customValue}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setVariableMappings(prev => ({
                                      ...prev,
                                      [v]: { ...mapping, customValue: val }
                                    }));
                                  }}
                                  placeholder={`Enter text for {{${v}}}...`}
                                  style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.85rem',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '24px',
                      backgroundColor: '#F8FAFC',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      textAlign: 'center',
                      color: '#64748B'
                    }}>
                      <CheckCircle2 size={32} color="#059669" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.95rem' }}>No Variables Required</div>
                      <p style={{ margin: '6px 0 0', fontSize: '0.82rem' }}>
                        This template contains static content and will be sent identically to all recipients.
                      </p>
                    </div>
                  )}

                  {/* Right Column: Live WhatsApp Message Preview */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <Smartphone size={16} color="#0E7490" />
                      <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1E293B' }}>
                        Live Message Preview
                      </label>
                    </div>

                    <div style={{
                      backgroundColor: '#EFEAE2',
                      borderRadius: '16px',
                      padding: '16px',
                      backgroundImage: 'radial-gradient(#CBD5E1 0.75px, transparent 0.75px)',
                      backgroundSize: '12px 12px',
                      border: '1px solid #CBD5E1'
                    }}>
                      <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '12px',
                        borderTopLeftRadius: '2px',
                        padding: '12px 14px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        maxWidth: '100%'
                      }}>
                        {/* Header preview */}
                        {selectedTemplate.headerType && selectedTemplate.headerType !== 'NONE' && (
                          <div style={{
                            marginBottom: '8px',
                            fontWeight: 700,
                            color: '#1E293B',
                            fontSize: '0.9rem',
                            borderBottom: '1px solid #F1F5F9',
                            paddingBottom: '4px'
                          }}>
                            {selectedTemplate.headerType === 'TEXT'
                              ? selectedTemplate.headerContent || 'Template Header'
                              : `[${selectedTemplate.headerType} HEADER]`}
                          </div>
                        )}

                        {/* Body Preview */}
                        <div style={{
                          fontSize: '0.88rem',
                          color: '#1E293B',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.45'
                        }}>
                          {getPreviewBodyText()}
                        </div>

                        {/* Footer preview */}
                        {selectedTemplate.footerText && (
                          <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#94A3B8' }}>
                            {selectedTemplate.footerText}
                          </div>
                        )}

                        {/* Message Meta */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '4px',
                          marginTop: '6px',
                          fontSize: '0.68rem',
                          color: '#94A3B8'
                        }}>
                          <span>11:45 AM</span>
                          <CheckCheck size={14} color="#0891B2" />
                        </div>
                      </div>

                      {/* Interactive Buttons Preview */}
                      {Array.isArray(selectedTemplate.buttons) && selectedTemplate.buttons.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                          {selectedTemplate.buttons.map((btn: any, bIdx: number) => (
                            <div
                              key={bIdx}
                              style={{
                                backgroundColor: '#FFFFFF',
                                padding: '8px',
                                borderRadius: '8px',
                                textAlign: 'center',
                                fontSize: '0.82rem',
                                color: '#0E7490',
                                fontWeight: 600,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                              }}
                            >
                              {btn.text || `Button ${bIdx + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <button
                    onClick={() => setStep(1)}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#FFFFFF',
                      color: '#64748B',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    ‹ Back to Templates
                  </button>

                  <button
                    onClick={() => setStep(3)}
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
                      gap: '6px'
                    }}
                  >
                    <span>Next: Target Audience</span>
                    <span>›</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Select Audience & Anti-Spam Check & Dispatch */}
            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Select Target Audience Segment
                  </label>
                  <select
                    value={targetCategory}
                    onChange={e => setTargetCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                      backgroundColor: '#FFFFFF'
                    }}
                  >
                    <option value="All">All Contacts</option>
                    <option value="Customers">Customers Only</option>
                    <option value="Scanned Contacts">Scanned Business Cards Only</option>
                    <option value="Employees">Employees Only</option>
                    <option value="Others">Others</option>
                  </select>
                </div>

                {/* Consent Safety Box */}
                <div style={{
                  padding: '16px',
                  borderRadius: '14px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={20} color="#0E7490" />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1E293B' }}>
                      Anti-Spam Consent Guardrail
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px 14px', backgroundColor: '#ECFDF5', borderRadius: '10px', border: '1px solid #A7F3D0' }}>
                      <div style={{ fontSize: '0.78rem', color: '#065F46', fontWeight: 600 }}>Eligible (Opted In)</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669', marginTop: '2px' }}>
                        {eligibleCount}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#047857' }}>Valid messaging consent confirmed</div>
                    </div>

                    <div style={{ padding: '12px 14px', backgroundColor: '#FEF2F2', borderRadius: '10px', border: '1px solid #FECACA' }}>
                      <div style={{ fontSize: '0.78rem', color: '#991B1B', fontWeight: 600 }}>Excluded (Pending / Opt-out)</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>
                        {excludedCount}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#B91C1C' }}>Shielded from promotional messages</div>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B', lineHeight: '1.4' }}>
                    Meta WhatsApp Cloud API policy enforces strict anti-spam compliance. Contacts without confirmed opt-in consent are automatically excluded to preserve sender quality rating.
                  </p>
                </div>

                {/* Campaign Summary Card */}
                <div style={{ padding: '14px 16px', borderRadius: '12px', backgroundColor: '#F0FDFA', border: '1px solid #CCFBF1' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '0.92rem', color: '#0F766E', fontWeight: 700 }}>
                    Campaign Summary
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.84rem', color: '#134E4A' }}>
                    <div><strong>Campaign:</strong> {campaignName}</div>
                    <div><strong>Template:</strong> {selectedTemplate?.name} ({selectedTemplate?.language})</div>
                    <div><strong>Audience:</strong> {targetCategory}</div>
                    <div><strong>Recipients:</strong> {eligibleCount} recipients</div>
                  </div>
                </div>

                {isDispatching && (
                  <div style={{
                    padding: '12px',
                    borderRadius: '10px',
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #FDE68A',
                    fontSize: '0.85rem',
                    color: '#92400E',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>{dispatchProgress}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <button
                    onClick={() => setStep(2)}
                    disabled={isDispatching}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#FFFFFF',
                      color: '#64748B',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    ‹ Back to Variables
                  </button>

                  <button
                    onClick={handleDispatchBroadcast}
                    disabled={isDispatching || eligibleCount === 0}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: eligibleCount > 0 && !isDispatching ? '#0E7490' : '#E2E8F0',
                      color: eligibleCount > 0 && !isDispatching ? '#FFFFFF' : '#94A3B8',
                      fontWeight: 600,
                      cursor: eligibleCount > 0 && !isDispatching ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Send size={16} />
                    <span>{isDispatching ? 'Dispatching...' : `Dispatch Broadcast (${eligibleCount} Recipients)`}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
