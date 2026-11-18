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
  ExternalLink,
  ShieldAlert,
  Phone,
  X
} from 'lucide-react';
import { crmService } from '../../../services/crmService';
import type { CrmTemplate, CrmTemplateStatus } from '../../../types/crm';
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
    await crmService.saveTemplateDraft(payload);
    loadTemplates();
  };

  const handleSubmitToMeta = async (payload: Partial<CrmTemplate>) => {
    const saved = await crmService.saveTemplateDraft(payload);
    await crmService.submitTemplateToMeta(saved.id);
    loadTemplates();
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
        return { label: 'Draft', cls: 'status-draft' };
      case 'PENDING':
        return { label: 'Pending Review', cls: 'status-pending' };
      case 'APPROVED':
        return { label: 'Approved', cls: 'status-approved' };
      case 'REJECTED':
        return { label: 'Rejected', cls: 'status-rejected' };
      case 'PAUSED':
        return { label: 'Paused', cls: 'status-paused' };
      case 'DISABLED':
        return { label: 'Disabled', cls: 'status-disabled' };
      default:
        return { label: status, cls: 'status-draft' };
    }
  };

  const categories = [
    { key: 'ALL', label: 'All' },
    { key: 'MARKETING', label: 'Marketing' },
    { key: 'UTILITY', label: 'Utility' },
    { key: 'AUTHENTICATION', label: 'Authentication' }
  ];

  return (
    <div className="crm-surface-card">
      {/* Compact Unified Toolbar */}
      <div className="crm-templates-toolbar">
        <div className="crm-templates-toolbar-top">
          <div className="crm-templates-title-group">
            <h3 className="crm-section-heading">WhatsApp Templates</h3>
            <span className="crm-toolbar-count-pill">{filteredTemplates.length}</span>
          </div>

          <div className="crm-toolbar-actions">
            <button
              type="button"
              onClick={handleSyncMeta}
              disabled={syncing}
              className="crm-btn-secondary"
              title="Sync Meta Cloud API Templates"
            >
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              <span>{syncing ? 'Syncing...' : 'Sync Meta'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="crm-btn-primary"
            >
              <Plus size={16} />
              <span>Create Template</span>
            </button>
          </div>
        </div>

        <div className="crm-templates-toolbar-filters">
          <div className="crm-filter-chips" role="tablist" aria-label="Template Categories">
            {categories.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategoryFilter(cat.key)}
                className={`crm-chip ${categoryFilter === cat.key ? 'active' : ''}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="crm-templates-search-controls">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="crm-select-compact"
              aria-label="Filter by template status"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Drafts</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="PAUSED">Paused</option>
              <option value="DISABLED">Disabled</option>
            </select>

            <div className="crm-search-box crm-templates-search">
              <Search size={15} className="crm-search-icon" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadTemplates()}
                className="crm-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="crm-search-clear"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Templates Content */}
      {loading ? (
        <div className="crm-empty-inline">Loading templates...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="crm-empty-inline crm-empty-compact">
          <div className="crm-empty-icon-circle">
            <FileText size={22} />
          </div>
          <h4>No Templates Found</h4>
          <p>Create a Meta WhatsApp template with dynamic variables, headers, and quick-reply buttons.</p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="crm-btn-primary"
            style={{ marginTop: '8px' }}
          >
            <Plus size={15} />
            <span>Create Template</span>
          </button>
        </div>
      ) : (
        <div className="crm-templates-list-grid">
          {filteredTemplates.map(tmpl => {
            const badge = getStatusBadge(tmpl.status);

            return (
              <div key={tmpl.id || tmpl.name} className="crm-template-card">
                <div className="crm-template-card-top">
                  <div className="crm-template-meta">
                    <h4 className="crm-template-name">{tmpl.name}</h4>
                    <div className="crm-template-submeta">
                      <span>{tmpl.category}</span>
                      <span>•</span>
                      <span>{tmpl.language.toUpperCase()}</span>
                    </div>
                  </div>

                  <span className={`crm-template-status-pill ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>

                {tmpl.status === 'REJECTED' && tmpl.rejectionReason && (
                  <div className="crm-template-rejection">
                    <ShieldAlert size={14} />
                    <span><strong>Rejected:</strong> {tmpl.rejectionReason}</span>
                  </div>
                )}

                <div className="crm-template-preview-box">
                  {tmpl.headerType && tmpl.headerType !== 'NONE' && (
                    <div className="crm-template-preview-header">
                      {tmpl.headerType === 'TEXT' ? tmpl.headerContent : `[${tmpl.headerType} Header]`}
                    </div>
                  )}

                  <div className="crm-template-preview-body">
                    {tmpl.bodyText}
                  </div>

                  {tmpl.footerText && (
                    <div className="crm-template-preview-footer">
                      {tmpl.footerText}
                    </div>
                  )}

                  {tmpl.buttons && tmpl.buttons.length > 0 && (
                    <div className="crm-template-preview-buttons">
                      {tmpl.buttons.map((b, idx) => (
                        <div key={idx} className="crm-template-preview-btn">
                          {b.type === 'URL' && <ExternalLink size={11} />}
                          {b.type === 'PHONE_NUMBER' && <Phone size={11} />}
                          <span>{b.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="crm-template-card-actions">
                  <div className="crm-template-primary-actions">
                    {tmpl.status === 'DRAFT' && (
                      <button
                        type="button"
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
                        className="crm-btn-sm-primary"
                      >
                        <Send size={12} />
                        <span>Submit to Meta</span>
                      </button>
                    )}

                    {(tmpl.status === 'DRAFT' || tmpl.status === 'REJECTED') && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(tmpl)}
                        className="crm-btn-sm-outline"
                      >
                        <Edit2 size={12} />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>

                  <div className="crm-template-icon-actions">
                    <button
                      type="button"
                      onClick={() => handleDuplicate(tmpl)}
                      className="crm-row-action-btn"
                      title="Duplicate Template"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tmpl)}
                      className="crm-row-action-btn danger"
                      title="Delete Template"
                    >
                      <Trash2 size={14} />
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
