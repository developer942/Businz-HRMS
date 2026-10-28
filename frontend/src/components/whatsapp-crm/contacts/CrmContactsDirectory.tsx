/**
 * WhatsApp CRM Contacts Directory for BUSINZ HRMS
 * Strict VRM Table Design System with Standardized [5, 10] Pagination & Floating Action Bar
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
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
  Tag,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter
} from 'lucide-react';
import { crmService } from '../../../services/crmService';
import type {
  CrmContact,
  CrmContactCategory,
  CrmConsentStatus
} from '../../../types/crm';

interface CrmContactsDirectoryProps {
  onStartChat: (contactId: string) => void;
}

export const CrmContactsDirectory: React.FC<CrmContactsDirectoryProps> = ({ onStartChat }) => {
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

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
    loadContacts();
  }, [selectedCategory, currentPage, pageSize]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Category Pills & Action Bar */}
      <div className="crm-contacts-filter-card">
        {/* Category Pills */}
        <div className="crm-contacts-pills-bar">
          {categories.map(cat => {
            const isActive = selectedCategory === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => {
                  setSelectedCategory(cat.value);
                  setCurrentPage(1);
                }}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '9999px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isActive ? '1px solid #0E7490' : '1px solid #E2E8F0',
                  backgroundColor: isActive ? '#0E7490' : '#FFFFFF',
                  color: isActive ? '#FFFFFF' : '#475569',
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box'
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search & Actions */}
        <div className="crm-contacts-search-actions">
          <form onSubmit={handleSearchSubmit} className="crm-contacts-search-form" style={{ position: 'relative', margin: 0, display: 'flex', alignItems: 'center' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              placeholder="Search by name, phone, company..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="crm-contacts-search-input"
              style={{
                height: '38px',
                padding: '0 14px 0 38px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '0.85rem',
                outline: 'none',
                width: '260px',
                boxSizing: 'border-box'
              }}
            />
          </form>

          <div className="crm-contacts-action-buttons" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={loadContacts}
              title="Refresh"
              className="crm-contacts-refresh-btn"
              style={{
                height: '38px',
                width: '38px',
                padding: 0,
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: '#64748B',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxSizing: 'border-box',
                transition: 'all 0.15s ease'
              }}
            >
              <RefreshCw size={16} />
            </button>

            <button
              onClick={handleOpenAddModal}
              className="crm-contacts-add-btn"
              style={{
                height: '38px',
                padding: '0 18px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                boxSizing: 'border-box',
                transition: 'all 0.15s ease'
              }}
            >
              <Plus size={16} />
              <span>Add Contact</span>
            </button>
          </div>
        </div>
      </div>

      {/* VRM Enterprise Table Container */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div className="table-responsive whatsapp-desktop-table" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '14px 18px', width: '40px', verticalAlign: 'middle' }}>
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && selectedIds.size === contacts.length}
                    onChange={handleSelectAll}
                    style={{ accentColor: '#0E7490', width: '16px', height: '16px', cursor: 'pointer', display: 'block' }}
                  />
                </th>
                <th style={{ padding: '14px 18px', verticalAlign: 'middle' }}>Contact</th>
                <th style={{ padding: '14px 18px', verticalAlign: 'middle' }}>Phone Number</th>
                <th style={{ padding: '14px 18px', verticalAlign: 'middle' }}>Category</th>
                <th style={{ padding: '14px 18px', verticalAlign: 'middle' }}>Consent Status</th>
                <th style={{ padding: '14px 18px', verticalAlign: 'middle' }}>Tags</th>
                <th style={{ padding: '14px 18px', verticalAlign: 'middle' }}>Source</th>
                <th style={{ padding: '14px 18px', textAlign: 'right', verticalAlign: 'middle' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                    Loading contacts...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
                    No contacts found matching the criteria.
                  </td>
                </tr>
              ) : (
                contacts.map(c => {
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: isSelected ? '#ECFEFF' : 'transparent',
                        borderLeft: isSelected ? '4px solid #0E7490' : '4px solid transparent',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '14px 18px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(c.id)}
                          style={{ accentColor: '#0E7490', width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      </td>

                      {/* Contact Info */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: '#0E7490',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: '0.85rem'
                          }}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#1E293B' }}>{c.name}</div>
                            <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                              {c.companyName || c.designation || 'No company'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td style={{ padding: '14px 18px', color: '#334155', fontWeight: 500 }}>
                        {c.phone}
                      </td>

                      {/* Category */}
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          backgroundColor:
                            c.category === 'Employees'
                              ? '#EFF6FF'
                              : c.category === 'Customers'
                              ? '#ECFEFF'
                              : c.category === 'Scanned Contacts'
                              ? '#FEF3C7'
                              : '#F1F5F9',
                          color:
                            c.category === 'Employees'
                              ? '#1D4ED8'
                              : c.category === 'Customers'
                              ? '#0E7490'
                              : c.category === 'Scanned Contacts'
                              ? '#B45309'
                              : '#475569'
                        }}>
                          {c.category}
                        </span>
                      </td>

                      {/* Anti-Spam Consent Status */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {c.consentStatus === 'Opted In' ? (
                            <ShieldCheck size={16} color="#059669" />
                          ) : c.consentStatus === 'Opted Out' ? (
                            <ShieldAlert size={16} color="#DC2626" />
                          ) : (
                            <ShieldQuestion size={16} color="#D97706" />
                          )}
                          <span style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color:
                              c.consentStatus === 'Opted In'
                                ? '#059669'
                                : c.consentStatus === 'Opted Out'
                                ? '#DC2626'
                                : '#D97706'
                          }}>
                            {c.consentStatus}
                          </span>
                        </div>
                      </td>

                      {/* Tags */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {c.tags && c.tags.length > 0 ? (
                            c.tags.map(t => (
                              <span
                                key={t.id}
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '2px 7px',
                                  borderRadius: '9999px',
                                  backgroundColor: '#F1F5F9',
                                  color: '#334155',
                                  border: '1px solid #E2E8F0'
                                }}
                              >
                                {t.name}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: '#CBD5E1', fontSize: '0.75rem' }}>—</span>
                          )}
                        </div>
                      </td>

                      {/* Source */}
                      <td style={{ padding: '14px 18px', color: '#64748B', fontSize: '0.8rem' }}>
                        {c.sourceType || 'Direct'}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => onStartChat(c.id)}
                            title="Start WhatsApp Chat"
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: '#0E7490',
                              color: '#FFFFFF',
                              fontWeight: 600,
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                          >
                            <MessageSquare size={14} />
                            <span>Chat</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(c)}
                            title="Edit Contact"
                            style={{
                              padding: '6px',
                              borderRadius: '8px',
                              border: '1px solid #E2E8F0',
                              backgroundColor: '#FFFFFF',
                              color: '#64748B',
                              cursor: 'pointer'
                            }}
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

        {/* Mobile Contact List Cards */}
        <div className="whatsapp-mobile-cards" style={{ padding: '12px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94A3B8' }}>
              Loading contacts...
            </div>
          ) : contacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
              <User size={36} color="#94A3B8" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 750, fontSize: '0.92rem', color: '#1E293B' }}>No contacts found</div>
              <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '4px 0 14px' }}>Try searching with a different name, phone, or category.</p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleOpenAddModal}
                style={{ borderRadius: '10px', padding: '8px 16px', fontWeight: 650 }}
              >
                <Plus size={15} /> Add Contact
              </button>
            </div>
          ) : (
            contacts.map(c => {
              return (
                <div key={c.id} className="mobile-whatsapp-contact-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        backgroundColor: '#0E7490',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        flexShrink: 0
                      }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 750, color: '#0F172A', fontSize: '0.9rem' }}>{c.name}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B' }}>{c.companyName || c.designation || 'No company'}</div>
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor:
                        c.category === 'Employees'
                          ? '#EFF6FF'
                          : c.category === 'Customers'
                          ? '#ECFEFF'
                          : c.category === 'Scanned Contacts'
                          ? '#FEF3C7'
                          : '#F1F5F9',
                      color:
                        c.category === 'Employees'
                          ? '#1D4ED8'
                          : c.category === 'Customers'
                          ? '#0E7490'
                          : c.category === 'Scanned Contacts'
                          ? '#B45309'
                          : '#475569'
                    }}>
                      {c.category}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '8px 12px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 650, color: '#1E293B' }}>{c.phone}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: c.consentStatus === 'Opted In' ? '#166534' : '#64748B' }}>
                      {c.consentStatus === 'Opted In' ? (
                        <>
                          <ShieldCheck size={14} color="#166534" />
                          <span style={{ fontWeight: 600 }}>Opted In</span>
                        </>
                      ) : (
                        <span>{c.consentStatus}</span>
                      )}
                    </div>
                  </div>

                  {c.tags && c.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {c.tags.map(t => (
                        <span
                          key={t.id}
                          style={{
                            fontSize: '0.68rem',
                            padding: '2px 7px',
                            borderRadius: '9999px',
                            backgroundColor: '#F1F5F9',
                            color: '#334155',
                            border: '1px solid #E2E8F0'
                          }}
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                    <button
                      type="button"
                      onClick={() => onStartChat(c.id)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '10px',
                        border: 'none',
                        backgroundColor: '#0E7490',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <MessageSquare size={14} />
                      <span>Chat on WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(c)}
                      title="Edit Contact"
                      style={{
                        padding: '8px 14px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#FFFFFF',
                        color: '#64748B',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Standardized VRM Pagination Footer: Rows strictly [5, 10] */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid #E7ECF3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: '#FFFFFF'
        }}>
          {/* Left: Selector strictly [5, 10] + Showing X to Y of Z */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.85rem', color: '#64748B' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value) as 5 | 10);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.85rem',
                  outline: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#1E293B'
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>
            <span>
              Showing {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, totalCount)} of {totalCount} entries
            </span>
          </div>

          {/* Right: Page Navigation Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: currentPage === 1 ? '#CBD5E1' : '#475569',
                cursor: currentPage === 1 ? 'default' : 'pointer'
              }}
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: currentPage === 1 ? '#CBD5E1' : '#475569',
                cursor: currentPage === 1 ? 'default' : 'pointer'
              }}
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '0.85rem'
            }}>
              {currentPage}
            </span>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: currentPage === totalPages ? '#CBD5E1' : '#475569',
                cursor: currentPage === totalPages ? 'default' : 'pointer'
              }}
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: currentPage === totalPages ? '#CBD5E1' : '#475569',
                cursor: currentPage === totalPages ? 'default' : 'pointer'
              }}
            >
              <ChevronsRight size={16} />
            </button>

            {/* Jump to Page */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '10px' }}>
              <span style={{ fontSize: '0.82rem', color: '#64748B' }}>Go to</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpPageInput}
                onChange={e => setJumpPageInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJumpPage()}
                style={{
                  width: '44px',
                  padding: '4px 6px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.82rem',
                  textAlign: 'center'
                }}
              />
              <button
                onClick={handleJumpPage}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #0E7490',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Go ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Bar (Fixed at bottom center when rows are checked) */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#1E293B',
          color: '#FFFFFF',
          borderRadius: '12px',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
          zIndex: 1000
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
            {selectedIds.size} Selected
          </span>
          <span style={{ color: '#475569' }}>|</span>
          <button
            onClick={handleDeleteSelected}
            style={{
              background: 'none',
              border: 'none',
              color: '#F87171',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              fontWeight: 600
            }}
          >
            <Trash2 size={15} /> Delete
          </button>
          <span style={{ color: '#475569' }}>|</span>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            padding: '28px',
            width: '480px',
            maxWidth: '90vw',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1.2rem', color: '#1E293B' }}>
              {editingContact ? 'Edit CRM Contact' : 'Add New CRM Contact'}
            </h3>

            <form onSubmit={handleSaveContact} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  WhatsApp Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +91 9876543210"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Company Name
                  </label>
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    value={formData.companyName}
                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value as CrmContactCategory })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="Customers">Customers</option>
                    <option value="Scanned Contacts">Scanned Contacts</option>
                    <option value="Employees">Employees</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Consent Status
                  </label>
                  <select
                    value={formData.consentStatus}
                    onChange={e => setFormData({ ...formData, consentStatus: e.target.value as CrmConsentStatus })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="Opted In">Opted In</option>
                    <option value="Pending">Pending</option>
                    <option value="Opted Out">Opted Out</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional context or remarks..."
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF',
                    color: '#64748B',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: '#0E7490',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    cursor: saving ? 'default' : 'pointer'
                  }}
                >
                  {saving ? 'Saving...' : editingContact ? 'Update Contact' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
