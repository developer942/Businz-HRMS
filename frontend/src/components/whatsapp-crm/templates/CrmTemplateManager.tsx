/**
 * WhatsApp CRM Template Manager for BUSINZ HRMS
 * Live Meta Cloud API Template Synchronization, Template Creator & Management
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Plus,
  Copy,
  Edit2,
  Trash2,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  ShieldAlert,
  Info,
  Phone,
  MessageSquare
} from 'lucide-react';
import { crmService } from '../../../services/crmService';
import type { CrmTemplate, CrmTemplateCategory, CrmTemplateStatus } from '../../../types/crm';
import { CrmTemplateEditorModal } from './CrmTemplateEditorModal';

export const CrmTemplateManager: React.FC = () => {
  const [templates, setTemplates] = useState<CrmTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal State
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<CrmTemplate | null>(null);

  useEffect(() => {
    loadTemplates();
  }, [categoryFilter, statusFilter]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await crmService.getTemplates({
        category: categoryFilter === 'ALL' ? undefined : categoryFilter,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: searchQuery || undefined
      });
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncMeta = async () => {
    setSyncing(true);
    try {
      const updated = await crmService.syncMetaTemplates();
      setTemplates(updated);
      alert(`Synchronized ${updated.length} templates with Meta Cloud API.`);
    } catch (err: any) {
      alert(`Sync Failed: ${err.message || 'Error connecting to Meta'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveDraft = async (payload: Partial<CrmTemplate>) => {
    try {
      const saved = await crmService.saveTemplateDraft(payload);
      loadTemplates();
    } catch (err: any) {
      throw err;
    }
  };

  const handleSubmitToMeta = async (payload: Partial<CrmTemplate>) => {
    try {
      const saved = await crmService.saveTemplateDraft(payload);
      await crmService.submitTemplateToMeta(saved.id);
      loadTemplates();
    } catch (err: any) {
      throw err;
    }
  };

  const handleDuplicate = async (tmpl: CrmTemplate) => {
    try {
      const duplicated = await crmService.duplicateTemplate(tmpl.id);
      loadTemplates();
      setEditingTemplate(duplicated);
      setIsEditorOpen(true);
    } catch (err: any) {
      alert(`Failed to duplicate template: ${err.message}`);
    }
  };

  const handleDelete = async (tmpl: CrmTemplate) => {
    const isMeta = tmpl.status === 'APPROVED' || tmpl.status === 'PENDING';
    const msg = isMeta
      ? `Permanently delete "${tmpl.name}" from Meta WhatsApp Cloud API and local database?`
      : `Delete local template draft "${tmpl.name}"?`;

    if (!window.confirm(msg)) return;

    try {
      await crmService.deleteTemplate(tmpl.id);
      loadTemplates();
    } catch (err: any) {
      alert(`Delete Failed: ${err.message}`);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingTemplate(null);
    setIsEditorOpen(true);
  };

  const handleOpenEditModal = (tmpl: CrmTemplate) => {
    setEditingTemplate(tmpl);
    setIsEditorOpen(true);
  };

  const filteredTemplates = templates.filter(t => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.bodyText.toLowerCase().includes(q);
  });

  const getStatusBadge = (status: CrmTemplateStatus) => {
    switch (status) {
      case 'DRAFT':
        return { label: 'Draft (Local)', bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' };
      case 'PENDING':
        return { label: 'Pending Meta Review', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' };
      case 'APPROVED':
        return { label: 'Approved', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
      case 'REJECTED':
        return { label: 'Rejected by Meta', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
      case 'PAUSED':
        return { label: 'Paused', bg: '#FFEDD5', color: '#C2410C', border: '#FED7AA' };
      case 'DISABLED':
        return { label: 'Disabled', bg: '#E2E8F0', color: '#475569', border: '#CBD5E1' };
      default:
        return { label: status, bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div className="crm-templates-header-card">
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: '1.25rem', color: '#1E293B', fontWeight: 600 }}>
            WhatsApp Message Templates
          </h3>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748B' }}>
            Create, test, and manage Meta Cloud API templates with dynamic variables, headers, and interactive buttons.
          </p>
        </div>

        {/* Action Buttons: Create Template beside Sync Meta Templates */}
        <div className="crm-templates-header-actions">
          <button
            onClick={handleSyncMeta}
            disabled={syncing}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              color: '#0E7490',
              fontWeight: 600,
              cursor: syncing ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.88rem'
            }}
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Syncing...' : 'Sync Meta Templates'}</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(14,116,144,0.2)'
            }}
          >
            <Plus size={18} />
            <span>Create Template</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="crm-templates-filter-card">
        {/* Category Pills */}
        <div className="crm-templates-category-pills">
          {['ALL', 'MARKETING', 'UTILITY', 'AUTHENTICATION'].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '6px 14px',
                borderRadius: '9999px',
                border: categoryFilter === cat ? '1px solid #0E7490' : '1px solid #E2E8F0',
                backgroundColor: categoryFilter === cat ? '#0E7490' : '#FFFFFF',
                color: categoryFilter === cat ? '#FFFFFF' : '#475569',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Status Dropdown & Search */}
        <div className="crm-templates-search-group">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="crm-templates-status-select"
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '0.85rem',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              outline: 'none'
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Drafts (Local)</option>
            <option value="PENDING">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="PAUSED">Paused</option>
            <option value="DISABLED">Disabled</option>
          </select>

          <div className="crm-templates-search-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadTemplates()}
              className="crm-templates-search-input"
              style={{
                padding: '8px 12px 8px 34px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>
          Loading templates...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '60px 20px',
          textAlign: 'center',
          color: '#94A3B8',
          border: '1px solid #E7ECF3'
        }}>
          <FileText size={42} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <h4 style={{ margin: '0 0 6px', color: '#475569' }}>No Templates Found</h4>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            Click <strong>"Create Template"</strong> to create a new WhatsApp message template.
          </p>
        </div>
      ) : (
        <div className="crm-templates-cards-grid">
          {filteredTemplates.map(tmpl => {
            const badge = getStatusBadge(tmpl.status);

            return (
              <div
                key={tmpl.id || tmpl.name}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E7ECF3',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
              >
                {/* Card Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1E293B', fontFamily: 'monospace' }}>
                      {tmpl.name}
                    </h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#64748B' }}>
                      <span>Lang: {tmpl.language}</span>
                      <span>•</span>
                      <span style={{ fontWeight: 600 }}>{tmpl.category}</span>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '0.72rem',
                    padding: '3px 9px',
                    borderRadius: '9999px',
                    backgroundColor: badge.bg,
                    color: badge.color,
                    border: `1px solid ${badge.border}`,
                    fontWeight: 600,
                    whiteSpace: 'nowrap'
                  }}>
                    {badge.label}
                  </span>
                </div>

                {/* Rejection Alert Banner if Rejected */}
                {tmpl.status === 'REJECTED' && tmpl.rejectionReason && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px'
                  }}>
                    <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>Rejection Reason:</strong> {tmpl.rejectionReason}
                    </div>
                  </div>
                )}

                {/* Body Content Preview Box */}
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.85rem',
                  color: '#334155',
                  lineHeight: '1.45',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {tmpl.headerType && tmpl.headerType !== 'NONE' && (
                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.88rem' }}>
                      {tmpl.headerType === 'TEXT' ? tmpl.headerContent : `[${tmpl.headerType} Header]`}
                    </div>
                  )}

                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {tmpl.bodyText}
                  </div>

                  {tmpl.footerText && (
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
                      {tmpl.footerText}
                    </div>
                  )}

                  {/* Buttons Preview */}
                  {tmpl.buttons && tmpl.buttons.length > 0 && (
                    <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '8px', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {tmpl.buttons.map((b, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '4px 8px',
                            textAlign: 'center',
                            color: '#0E7490',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '4px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          {b.type === 'URL' && <ExternalLink size={11} />}
                          {b.type === 'PHONE_NUMBER' && <Phone size={11} />}
                          <span>{b.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {/* Submit to Meta if Draft */}
                    {tmpl.status === 'DRAFT' && (
                      <button
                        onClick={async () => {
                          if (window.confirm(`Submit "${tmpl.name}" to Meta Cloud API for review?`)) {
                            try {
                              await crmService.submitTemplateToMeta(tmpl.id);
                              loadTemplates();
                            } catch (err: any) {
                              alert(`Submission Failed: ${err.message}`);
                            }
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: '#0E7490',
                          color: '#FFFFFF',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Send size={12} />
                        <span>Submit to Meta</span>
                      </button>
                    )}

                    {/* Edit Draft or Rejected */}
                    {(tmpl.status === 'DRAFT' || tmpl.status === 'REJECTED') && (
                      <button
                        onClick={() => handleOpenEditModal(tmpl)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFFFFF',
                          color: '#334155',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Edit2 size={12} />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {/* Duplicate */}
                    <button
                      onClick={() => handleDuplicate(tmpl)}
                      title="Duplicate Template"
                      style={{
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#FFFFFF',
                        color: '#64748B',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <Copy size={13} />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(tmpl)}
                      title="Delete Template"
                      style={{
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid #FEE2E2',
                        backgroundColor: '#FFFFFF',
                        color: '#EF4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template Editor Modal */}
      {isEditorOpen && (
        <CrmTemplateEditorModal
          isOpen={isEditorOpen}
          initialTemplate={editingTemplate}
          onClose={() => setIsEditorOpen(false)}
          onSaveDraft={handleSaveDraft}
          onSubmitToMeta={handleSubmitToMeta}
        />
      )}
    </div>
  );
};
