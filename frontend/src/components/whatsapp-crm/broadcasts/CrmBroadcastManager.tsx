/**
 * WhatsApp CRM Broadcast Manager for BUSINZ HRMS
 * Desktop: Clean Campaign Table | Mobile: Compact Campaign List + 3-Step Wizard
 */

import React, { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  CheckCheck,
  X,
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

  const extractVariables = (tmpl: CrmTemplate | null): number[] => {
    if (!tmpl?.bodyText) return [];
    const matches = tmpl.bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const nums = matches.map(m => parseInt(m.replace(/\D/g, ''), 10));
    return Array.from(new Set(nums)).sort((a, b) => a - b);
  };

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

  const resolveVariableForContact = (varNum: number, contact: CrmContact): string => {
    const mapping = variableMappings[varNum];
    if (!mapping) return '';
    if (mapping.source === 'name') return contact.name || 'Valued Customer';
    if (mapping.source === 'company') return contact.companyName || 'Valued Organization';
    if (mapping.source === 'phone') return contact.phone || '';
    return mapping.customValue || `[Val ${varNum}]`;
  };

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

      await crmService.createBroadcast({
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

  const renderStatusPill = (status?: string) => {
    const norm = (status || 'draft').toLowerCase();
    if (norm === 'completed') {
      return <span className="crm-status-pill approved">Completed</span>;
    }
    if (norm === 'sending') {
      return <span className="crm-status-pill pending">Sending</span>;
    }
    return <span className="crm-status-pill draft">{status || 'Draft'}</span>;
  };

  return (
    <div className="crm-broadcasts-view">
      {/* Unified Broadcasts Card */}
      <div className="crm-surface-card">
        {/* Compact Toolbar */}
        <div className="crm-section-toolbar">
          <div>
            <h2 className="crm-section-title">Broadcast Campaigns</h2>
            <p className="crm-section-subtitle">
              Send approved WhatsApp templates to consented contact segments
            </p>
          </div>

          <div className="crm-section-actions">
            <button
              type="button"
              onClick={loadBroadcasts}
              title="Refresh campaigns"
              aria-label="Refresh campaigns"
              className="crm-icon-btn bordered"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={startNewBroadcastWizard}
              className="crm-primary-btn"
            >
              <Plus size={16} />
              <span>New Broadcast Campaign</span>
            </button>
          </div>
        </div>

        {/* Desktop Table (>= 768px) */}
        <div className="crm-broadcasts-desktop-table">
          <table className="crm-clean-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Template</th>
                <th>Audience</th>
                <th>Recipients</th>
                <th>Delivered</th>
                <th>Read</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="crm-table-empty-cell">
                    Loading campaigns...
                  </td>
                </tr>
              ) : broadcasts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="crm-table-empty-cell">
                    <div className="crm-compact-empty">
                      <Send size={24} style={{ opacity: 0.4, margin: '0 auto 6px' }} />
                      <div style={{ fontWeight: 600, color: '#17212C' }}>No broadcast campaigns yet</div>
                      <div style={{ fontSize: '0.78rem', color: '#667085', marginTop: '2px' }}>
                        Click &ldquo;New Broadcast Campaign&rdquo; to send an approved template.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                broadcasts.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600, color: '#17212C' }}>
                      {b.name || b.campaignName || 'Campaign'}
                    </td>
                    <td style={{ color: '#0E7490', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {b.templateName}
                    </td>
                    <td>
                      <span className="crm-subtle-pill">
                        {b.targetCategory || b.audienceFilter?.category || 'All Contacts'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#17212C' }}>{b.totalRecipients || 0}</td>
                    <td style={{ fontWeight: 600, color: '#16A34A' }}>
                      {b.deliveredCount || b.sentCount || 0}
                    </td>
                    <td style={{ fontWeight: 600, color: '#0284C7' }}>{b.readCount || 0}</td>
                    <td>{renderStatusPill(b.status)}</td>
                    <td style={{ textAlign: 'right', color: '#667085', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Compact Campaign List (< 768px) */}
        <div className="crm-broadcasts-mobile-list">
          {loading ? (
            <div className="crm-mobile-empty-box">Loading campaigns...</div>
          ) : broadcasts.length === 0 ? (
            <div className="crm-mobile-empty-box">
              <Send size={26} color="#94A3B8" style={{ margin: '0 auto 8px', opacity: 0.6 }} />
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#17212C' }}>No campaigns yet</div>
              <div style={{ fontSize: '0.78rem', color: '#667085', marginTop: '2px' }}>
                Tap &ldquo;New Broadcast Campaign&rdquo; above to send a broadcast.
              </div>
            </div>
          ) : (
            broadcasts.map(b => (
              <div key={b.id} className="crm-mobile-broadcast-item">
                <div className="crm-mobile-broadcast-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="crm-mobile-broadcast-name">
                      {b.name || b.campaignName || 'Campaign'}
                    </div>
                    <div className="crm-mobile-broadcast-template">
                      {b.templateName} • {b.targetCategory || b.audienceFilter?.category || 'All'}
                    </div>
                  </div>
                  {renderStatusPill(b.status)}
                </div>

                <div className="crm-mobile-broadcast-metrics">
                  <span>
                    Recipients: <strong>{b.totalRecipients || 0}</strong>
                  </span>
                  <span>
                    Delivered: <strong style={{ color: '#16A34A' }}>{b.deliveredCount || b.sentCount || 0}</strong>
                  </span>
                  <span>
                    Read: <strong style={{ color: '#0284C7' }}>{b.readCount || 0}</strong>
                  </span>
                  <span style={{ marginLeft: 'auto', color: '#667085' }}>
                    {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '—'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Multi-Step Broadcast Campaign Wizard Modal */}
      {showWizard && (
        <div
          className="modal-overlay"
          onClick={() => !isDispatching && setShowWizard(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            padding: '16px'
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '18px',
              padding: '24px',
              width: '700px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
              border: '1px solid #E5E7EB',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '1.12rem', color: '#17212C', fontWeight: 700 }}>
                  New Broadcast Campaign
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#667085' }}>
                  {step === 1 && 'Step 1 of 3: Select Approved Template'}
                  {step === 2 && 'Step 2 of 3: Variables & Message Preview'}
                  {step === 3 && 'Step 3 of 3: Target Audience & Consent Check'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowWizard(false)}
                disabled={isDispatching}
                className="crm-icon-btn"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Stepper Progress Bar */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  style={{
                    flex: 1,
                    height: '4px',
                    borderRadius: '2px',
                    backgroundColor: s <= step ? '#0E7490' : '#E5E7EB',
                    transition: 'background-color 0.2s ease'
                  }}
                />
              ))}
            </div>

            {/* STEP 1: Select Template */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="crm-form-label">Campaign Name *</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder="e.g. Monthly Update 2026"
                    className="crm-form-input"
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="crm-form-label" style={{ marginBottom: 0 }}>
                      Approved Template *
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#0E7490', fontWeight: 600 }}>
                      {templates.length} Approved
                    </span>
                  </div>

                  {templates.length === 0 ? (
                    <div
                      style={{
                        padding: '24px 16px',
                        textAlign: 'center',
                        backgroundColor: '#FEF2F2',
                        borderRadius: '12px',
                        border: '1px solid #FECACA',
                        color: '#991B1B'
                      }}
                    >
                      <AlertCircle size={24} style={{ margin: '0 auto 6px', color: '#DC2626' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>No Approved Templates Found</div>
                      <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#B91C1C' }}>
                        Only Meta-approved templates can be used for broadcast campaigns.
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        maxHeight: '260px',
                        overflowY: 'auto'
                      }}
                    >
                      {templates.map(tmpl => {
                        const isSelected = selectedTemplate?.id === tmpl.id || selectedTemplate?.name === tmpl.name;
                        const varsCount = extractVariables(tmpl).length;

                        return (
                          <div
                            key={tmpl.id || tmpl.name}
                            onClick={() => setSelectedTemplate(tmpl)}
                            style={{
                              padding: '12px 14px',
                              borderRadius: '12px',
                              border: isSelected ? '1.5px solid #0E7490' : '1px solid #E5E7EB',
                              backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                              cursor: 'pointer'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, color: '#17212C', fontSize: '0.88rem', fontFamily: 'monospace' }}>
                                  {tmpl.name}
                                </span>
                                <span className="crm-subtle-pill">{tmpl.category}</span>
                                <span style={{ fontSize: '0.72rem', color: '#667085' }}>({tmpl.language})</span>
                              </div>

                              {varsCount > 0 && (
                                <span style={{ fontSize: '0.7rem', color: '#0E7490', fontWeight: 600 }}>
                                  {varsCount} var{varsCount > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>

                            <div
                              style={{
                                fontSize: '0.8rem',
                                color: '#667085',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                lineHeight: 1.4
                              }}
                            >
                              {tmpl.bodyText || tmpl.rawComponents?.find((c: any) => c.type === 'BODY')?.text || 'Template Body'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!selectedTemplate}
                    className="crm-primary-btn"
                  >
                    <span>Next: Variables &amp; Preview ›</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Map Dynamic Variables & Live Message Preview */}
            {step === 2 && selectedTemplate && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="crm-wizard-step2-grid">
                  {templateVars.length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <Sparkles size={15} color="#0E7490" />
                        <label style={{ fontSize: '0.84rem', fontWeight: 600, color: '#17212C' }}>
                          Map Dynamic Variables
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                        {templateVars.map(v => {
                          const mapping = variableMappings[v] || { source: 'name', customValue: '' };
                          return (
                            <div
                              key={v}
                              style={{
                                padding: '10px 12px',
                                borderRadius: '10px',
                                border: '1px solid #E5E7EB',
                                backgroundColor: '#F8FAFC'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span
                                  style={{
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    fontFamily: 'monospace',
                                    color: '#0E7490',
                                    backgroundColor: '#ECFEFF',
                                    padding: '2px 7px',
                                    borderRadius: '6px'
                                  }}
                                >
                                  {`{{${v}}}`}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: '#667085' }}>Source Field</span>
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
                                className="crm-form-input"
                                style={{ marginBottom: mapping.source === 'custom' ? '8px' : '0' }}
                              >
                                <option value="name">Customer Full Name</option>
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
                                  className="crm-form-input"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '20px',
                        backgroundColor: '#F8FAFC',
                        borderRadius: '12px',
                        border: '1px solid #E5E7EB',
                        textAlign: 'center',
                        color: '#667085'
                      }}
                    >
                      <CheckCircle2 size={26} color="#16A34A" style={{ margin: '0 auto 6px' }} />
                      <div style={{ fontWeight: 600, color: '#17212C', fontSize: '0.88rem' }}>No Variables Required</div>
                      <p style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>
                        This template contains static content.
                      </p>
                    </div>
                  )}

                  {/* Clean WhatsApp Message Preview */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Smartphone size={15} color="#0E7490" />
                      <label style={{ fontSize: '0.84rem', fontWeight: 600, color: '#17212C' }}>
                        Message Preview
                      </label>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderRadius: '14px',
                        padding: '14px',
                        border: '1px solid #E5E7EB'
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: '#DCF8C6',
                          borderRadius: '12px 12px 2px 12px',
                          padding: '11px 13px',
                          border: '1px solid rgba(22, 163, 74, 0.18)',
                          color: '#17212C'
                        }}
                      >
                        {selectedTemplate.headerType && selectedTemplate.headerType !== 'NONE' && (
                          <div
                            style={{
                              marginBottom: '6px',
                              fontWeight: 700,
                              color: '#17212C',
                              fontSize: '0.86rem'
                            }}
                          >
                            {selectedTemplate.headerType === 'TEXT'
                              ? selectedTemplate.headerContent || 'Template Header'
                              : `[${selectedTemplate.headerType} HEADER]`}
                          </div>
                        )}

                        <div
                          style={{
                            fontSize: '0.84rem',
                            color: '#17212C',
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.45
                          }}
                        >
                          {getPreviewBodyText()}
                        </div>

                        {selectedTemplate.footerText && (
                          <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#667085' }}>
                            {selectedTemplate.footerText}
                          </div>
                        )}

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '4px',
                            marginTop: '4px',
                            fontSize: '0.68rem',
                            color: '#667085'
                          }}
                        >
                          <span>11:45 AM</span>
                          <CheckCheck size={13} color="#0284C7" />
                        </div>
                      </div>

                      {Array.isArray(selectedTemplate.buttons) && selectedTemplate.buttons.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '6px' }}>
                          {selectedTemplate.buttons.map((btn: any, bIdx: number) => (
                            <div
                              key={bIdx}
                              style={{
                                backgroundColor: '#FFFFFF',
                                padding: '7px',
                                borderRadius: '8px',
                                textAlign: 'center',
                                fontSize: '0.78rem',
                                color: '#0E7490',
                                fontWeight: 600,
                                border: '1px solid #E5E7EB'
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

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '4px' }}>
                  <button type="button" onClick={() => setStep(1)} className="crm-secondary-btn">
                    ‹ Back
                  </button>
                  <button type="button" onClick={() => setStep(3)} className="crm-primary-btn">
                    <span>Next: Target Audience ›</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Target Audience & Consent Check */}
            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="crm-form-label">Target Audience Segment</label>
                  <select
                    value={targetCategory}
                    onChange={e => setTargetCategory(e.target.value)}
                    className="crm-form-input"
                  >
                    <option value="All">All Contacts</option>
                    <option value="Customers">Customers Only</option>
                    <option value="Scanned Contacts">Scanned Business Cards Only</option>
                    <option value="Employees">Employees Only</option>
                    <option value="Others">Others</option>
                  </select>
                </div>

                {/* Consent Guardrail Summary */}
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E5E7EB',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={18} color="#16A34A" />
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#17212C' }}>
                      Consent &amp; Anti-Spam Check
                    </span>
                  </div>

                  <div className="crm-form-row-2col">
                    <div style={{ padding: '10px 12px', backgroundColor: '#DCFCE7', borderRadius: '10px', border: '1px solid #BBF7D0' }}>
                      <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 600 }}>Eligible (Opted In)</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#15803D', marginTop: '2px' }}>
                        {eligibleCount}
                      </div>
                    </div>

                    <div style={{ padding: '10px 12px', backgroundColor: '#FEE2E2', borderRadius: '10px', border: '1px solid #FECACA' }}>
                      <div style={{ fontSize: '0.74rem', color: '#991B1B', fontWeight: 600 }}>Excluded (Unconsented)</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>
                        {excludedCount}
                      </div>
                    </div>
                  </div>
                </div>

                {isDispatching && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: '#FEF3C7',
                      border: '1px solid #FDE68A',
                      fontSize: '0.82rem',
                      color: '#92400E',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <RefreshCw size={15} className="animate-spin" />
                    <span>{dispatchProgress}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={isDispatching}
                    className="crm-secondary-btn"
                  >
                    ‹ Back
                  </button>

                  <button
                    type="button"
                    onClick={handleDispatchBroadcast}
                    disabled={isDispatching || eligibleCount === 0}
                    className="crm-primary-btn"
                    style={{
                      backgroundColor: eligibleCount > 0 && !isDispatching ? '#16A34A' : '#E5E7EB',
                      color: eligibleCount > 0 && !isDispatching ? '#FFFFFF' : '#94A3B8'
                    }}
                  >
                    <Send size={15} />
                    <span>{isDispatching ? 'Sending...' : `Send Broadcast (${eligibleCount})`}</span>
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
