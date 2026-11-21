/**
 * WhatsApp CRM Contacts Directory for BUSINZ HRMS
 * Desktop: Clean CRM Table | Mobile: Native iOS Contacts App List
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  RefreshCw,
  MessageSquare,
  Trash2,
  Edit2,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  User,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { crmService } from '../../../services/crmService';
import type {
  CrmContact,
  CrmContactCategory,
  CrmConsentStatus
} from '../../../types/crm';
import { RecordConsentModal } from './RecordConsentModal';

interface CrmContactsDirectoryProps {
  onStartChat: (contactId: string) => void;
}

export const CrmContactsDirectory: React.FC<CrmContactsDirectoryProps> = ({ onStartChat }) => {
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // Consent Modal
  const [consentModalContact, setConsentModalContact] = useState<CrmContact | null>(null);

  // Filters & Pagination
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<5 | 10>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  // Row Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    companyName: '',
    designation: '',
    category: 'Customers' as CrmContactCategory,
    consentStatus: 'Opted In' as CrmConsentStatus,
    notes: ''
  });
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadContacts();
    }, 150);
    return () => clearTimeout(timer);
  }, [selectedCategory, currentPage, pageSize, searchQuery]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * pageSize;
      const res = await crmService.getContacts({
        category: selectedCategory === 'All' ? undefined : selectedCategory,
        search: searchQuery || undefined,
        limit: pageSize,
        offset
      });
      setContacts(res.contacts);
      setTotalCount(res.total);
    } catch (err) {
      console.error('Failed to load CRM contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadContacts();
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(contacts.map(c => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} selected contact(s)?`)) return;
    try {
      for (const id of selectedIds) {
        await crmService.deleteContact(id);
      }
      setSelectedIds(new Set());
      loadContacts();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleOpenAddModal = () => {
    setEditingContact(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      companyName: '',
      designation: '',
      category: 'Customers',
      consentStatus: 'Opted In',
      notes: ''
    });
    setShowAddModal(true);
  };

  const handleOpenEditModal = (c: CrmContact) => {
    setEditingContact(c);
    setFormData({
      name: c.name,
      phone: c.phone,
      email: c.email || '',
      companyName: c.companyName || '',
      designation: c.designation || '',
      category: c.category,
      consentStatus: c.consentStatus,
      notes: c.notes || ''
    });
    setShowAddModal(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      alert('Name and Phone number are required.');
      return;
    }
    setSaving(true);
    try {
      await crmService.upsertContact({
        ...(editingContact ? { id: editingContact.id } : {}),
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() || undefined,
        companyName: formData.companyName.trim() || undefined,
        designation: formData.designation.trim() || undefined,
        category: formData.category,
        consentStatus: formData.consentStatus,
        notes: formData.notes.trim() || undefined
      });
      setShowAddModal(false);
      loadContacts();
    } catch (err: any) {
      alert(`Failed to save contact: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleJumpPage = () => {
    const p = parseInt(jumpPageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      setCurrentPage(p);
      setJumpPageInput('');
    }
  };

  const categories: { label: string; value: string }[] = [
    { label: 'All', value: 'All' },
    { label: 'Employees', value: 'Employees' },
    { label: 'Scanned Contacts', value: 'Scanned Contacts' },
    { label: 'Customers', value: 'Customers' },
    { label: 'Others', value: 'Others' }
  ];

  const renderConsentIndicator = (status: CrmConsentStatus) => {
    if (status === 'Opted In') {
      return (
        <span className="crm-consent-badge opted-in">
          <ShieldCheck size={13} />
          <span>Opted In</span>
        </span>
      );
    }
    if (status === 'Opted Out') {
      return (
        <span className="crm-consent-badge opted-out">
          <ShieldAlert size={13} />
          <span>Opted Out</span>
        </span>
      );
    }
    return (
      <span className="crm-consent-badge pending">
        <ShieldQuestion size={13} />
        <span>{status || 'Pending'}</span>
      </span>
    );
  };

  return (
    <div className="crm-contacts-view">
      {/* Unified Directory Card */}
      <div className="crm-surface-card">
        {/* Compact Toolbar: Search, Category Pills, Refresh & Add Contact */}
        <div className="crm-directory-toolbar">
          <div className="crm-directory-top-row">
            <form onSubmit={handleSearchSubmit} className="crm-directory-search-form">
              <Search size={15} className="crm-directory-search-icon" />
              <input
                type="text"
                placeholder="Search contacts by name, phone, or company..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="crm-directory-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  aria-label="Clear search"
                  className="crm-directory-search-clear"
                >
                  <X size={13} />
                </button>
              )}
            </form>

            <div className="crm-directory-actions">
              <button
                type="button"
                onClick={loadContacts}
                title="Refresh contacts"
                aria-label="Refresh contacts"
                className="crm-icon-btn bordered"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>

              <button
                type="button"
                onClick={handleOpenAddModal}
                className="crm-primary-btn"
              >
                <Plus size={16} />
                <span>Add Contact</span>
              </button>
            </div>
          </div>

          {/* Horizontal Category Filter Pills */}
          <div className="crm-category-chips-row" role="tablist" aria-label="Contact category filter">
            {categories.map(cat => {
              const isActive = selectedCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setSelectedCategory(cat.value);
                    setCurrentPage(1);
                  }}
                  className={`crm-category-chip ${isActive ? 'active' : ''}`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop Table (>= 768px): Contact, Phone, Category, Consent, Source, Actions */}
        <div className="crm-contacts-desktop-table">
          <table className="crm-clean-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && selectedIds.size === contacts.length}
                    onChange={handleSelectAll}
                    aria-label="Select all contacts on page"
                    style={{ accentColor: '#0E7490', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                </th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Category</th>
                <th>Consent</th>
                <th>Source</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="crm-table-empty-cell">
                    Loading contacts...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="crm-table-empty-cell">
                    No contacts found matching the criteria.
                  </td>
                </tr>
              ) : (
                contacts.map(c => {
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <tr key={c.id} className={isSelected ? 'selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(c.id)}
                          aria-label={`Select ${c.name}`}
                          style={{ accentColor: '#0E7490', width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      </td>

                      <td>
                        <div className="crm-table-contact-cell">
                          <div className="crm-contact-avatar">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="crm-table-contact-name">{c.name}</div>
                            <div className="crm-table-contact-sub">
                              {c.companyName || c.designation || c.email || '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ fontWeight: 500, color: '#17212C', whiteSpace: 'nowrap' }}>
                        {c.phone}
                      </td>

                      <td>
                        <span className="crm-subtle-pill">{c.category}</span>
                      </td>

                      <td>{renderConsentIndicator(c.consentStatus)}</td>

                      <td style={{ color: '#667085', fontSize: '0.8rem' }}>
                        {c.sourceType || 'Direct'}
                      </td>

                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setConsentModalContact(c)}
                            title="Record WhatsApp Consent"
                            aria-label={`Record consent for ${c.name}`}
                            className="crm-icon-btn bordered sm"
                            style={{ color: '#0E7490' }}
                          >
                            <ShieldCheck size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onStartChat(c.id)}
                            title="Start WhatsApp Chat"
                            className="crm-whatsapp-chat-btn"
                          >
                            <MessageSquare size={14} />
                            <span>Chat</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(c)}
                            title="Edit Contact"
                            aria-label={`Edit ${c.name}`}
                            className="crm-icon-btn bordered sm"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Native Contacts List (< 768px) */}
        <div className="crm-contacts-mobile-list">
          {loading ? (
            <div className="crm-mobile-empty-box">Loading contacts...</div>
          ) : contacts.length === 0 ? (
            <div className="crm-mobile-empty-box">
              <User size={28} color="#94A3B8" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#17212C' }}>No contacts found</div>
              <div style={{ fontSize: '0.78rem', color: '#667085', marginTop: '2px' }}>
                Try another search or tap &ldquo;Add Contact&rdquo;.
              </div>
            </div>
          ) : (
            contacts.map(c => (
              <div key={c.id} className="crm-mobile-contact-row">
                <div className="crm-contact-avatar">{c.name.charAt(0).toUpperCase()}</div>

                <div className="crm-mobile-contact-info">
                  <div className="crm-mobile-contact-top">
                    <span className="crm-mobile-contact-name">{c.name}</span>
                    {renderConsentIndicator(c.consentStatus)}
                  </div>
                  {(c.companyName || c.designation || c.category) && (
                    <div className="crm-mobile-contact-company">
                      {c.companyName || c.designation || c.category}
                    </div>
                  )}
                  <div className="crm-mobile-contact-phone">{c.phone}</div>
                </div>

                <div className="crm-mobile-contact-actions">
                  <button
                    type="button"
                    onClick={() => setConsentModalContact(c)}
                    className="crm-mobile-edit-icon-btn"
                    title="Record WhatsApp Consent"
                    aria-label={`Record consent for ${c.name}`}
                    style={{ color: '#0E7490' }}
                  >
                    <ShieldCheck size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartChat(c.id)}
                    className="crm-mobile-chat-icon-btn"
                    title="Chat on WhatsApp"
                    aria-label={`Chat with ${c.name}`}
                  >
                    <MessageSquare size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(c)}
                    className="crm-mobile-edit-icon-btn"
                    title="Edit Contact"
                    aria-label={`Edit ${c.name}`}
                  >
                    <Edit2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Standardized Pagination Footer: Rows strictly [5, 10] */}
        <div className="crm-pagination-bar">
          <div className="crm-pagination-left">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value) as 5 | 10);
                  setCurrentPage(1);
                }}
                aria-label="Rows per page"
                className="crm-pagination-select"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>
            <span>
              Showing {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
            </span>
          </div>

          <div className="crm-pagination-right">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                aria-label="First page"
                className="crm-page-btn"
              >
                <ChevronsLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="crm-page-btn"
              >
                <ChevronLeft size={15} />
              </button>

              <span className="crm-page-active">{currentPage}</span>

              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
                className="crm-page-btn"
              >
                <ChevronRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                aria-label="Last page"
                className="crm-page-btn"
              >
                <ChevronsRight size={15} />
              </button>
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: '#667085' }}>Go to</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpPageInput}
                onChange={e => setJumpPageInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJumpPage()}
                className="crm-page-jump-input"
              />
              <button type="button" onClick={handleJumpPage} className="crm-page-go-btn">
                Go ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="crm-floating-bulk-bar">
          <span style={{ fontWeight: 600, fontSize: '0.84rem' }}>
            {selectedIds.size} Selected
          </span>
          <span style={{ color: '#475569' }}>|</span>
          <button
            type="button"
            onClick={handleDeleteSelected}
            style={{
              background: 'none',
              border: 'none',
              color: '#F87171',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.84rem',
              fontWeight: 600
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
          <span style={{ color: '#475569' }}>|</span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            aria-label="Clear selection"
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {showAddModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAddModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
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
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)',
              border: '1px solid #E5E7EB'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#17212C' }}>
                {editingContact ? 'Edit CRM Contact' : 'Add CRM Contact'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="crm-icon-btn"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveContact} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="crm-form-label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="crm-form-input"
                />
              </div>

              <div>
                <label className="crm-form-label">WhatsApp Phone Number *</label>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  placeholder="e.g. +91 9876543210"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="crm-form-input"
                />
              </div>

              <div className="crm-form-row-2col">
                <div>
                  <label className="crm-form-label">Email</label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="crm-form-input"
                  />
                </div>
                <div>
                  <label className="crm-form-label">Company Name</label>
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    value={formData.companyName}
                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                    className="crm-form-input"
                  />
                </div>
              </div>

              <div className="crm-form-row-2col">
                <div>
                  <label className="crm-form-label">Category</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value as CrmContactCategory })}
                    className="crm-form-input"
                  >
                    <option value="Customers">Customers</option>
                    <option value="Scanned Contacts">Scanned Contacts</option>
                    <option value="Employees">Employees</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                <div>
                  <label className="crm-form-label">Consent Status</label>
                  <select
                    value={formData.consentStatus}
                    onChange={e => setFormData({ ...formData, consentStatus: e.target.value as CrmConsentStatus })}
                    className="crm-form-input"
                  >
                    <option value="Opted In">Opted In</option>
                    <option value="Pending">Pending</option>
                    <option value="Opted Out">Opted Out</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="crm-form-label">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional context or remarks..."
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="crm-form-input"
                  style={{ height: 'auto', minHeight: '68px', paddingTop: '10px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="crm-secondary-btn"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="crm-primary-btn">
                  {saving ? 'Saving...' : editingContact ? 'Update Contact' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record WhatsApp Consent Modal */}
      {consentModalContact && (
        <RecordConsentModal
          contact={consentModalContact}
          isOpen={Boolean(consentModalContact)}
          onClose={() => setConsentModalContact(null)}
          onConsentRecorded={(updatedContact) => {
            setContacts(prev =>
              prev.map(item => (item.id === updatedContact.id ? { ...item, ...updatedContact } : item))
            );
            setConsentModalContact(null);
          }}
        />
      )}
    </div>
  );
};
