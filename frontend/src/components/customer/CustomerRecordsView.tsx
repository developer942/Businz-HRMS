import React, { useState, useEffect } from 'react';
import { CustomerContact } from '../../types/customer';
import { customerService } from '../../services/customerService';
import { useHRMS } from '../../context/HRMSContext';
import { downloadExcel, ExportColumn } from '../../utils/exportUtils';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { SendWhatsAppModal } from './SendWhatsAppModal';
import {
  Search,
  Download,
  Eye,
  Edit3,
  CreditCard,
  Send,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Users,
  Phone,
  Mail,
  Camera,
  User
} from 'lucide-react';

interface CustomerRecordsViewProps {
  refreshTrigger?: number;
  onOpenSendWhatsApp?: (customer: CustomerContact) => void;
  onNavigateToAddCustomer?: () => void;
}

export const CustomerRecordsView: React.FC<CustomerRecordsViewProps> = ({
  refreshTrigger = 0,
  onOpenSendWhatsApp,
  onNavigateToAddCustomer
}) => {
  const { currentUser } = useHRMS();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [employeeFilter] = useState('');
  const [consentFilter, setConsentFilter] = useState('');
  const [dateFrom] = useState('');
  const [dateTo] = useState('');

  // Pagination (Strictly [5, 10] per design system spec)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [goToPageInput, setGoToPageInput] = useState('');

  // Data & Loading
  const [customers, setCustomers] = useState<CustomerContact[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Row Selection (for Floating Action Bar)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [viewCustomer, setViewCustomer] = useState<CustomerContact | null>(null);
  const [editCustomer, setEditCustomer] = useState<CustomerContact | null>(null);
  const [cardModalUrl, setCardModalUrl] = useState<string | null>(null);
  const [sendWhatsAppCustomer, setSendWhatsAppCustomer] = useState<CustomerContact | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const res = await customerService.getCustomers({
        search: searchQuery,
        employeeName: employeeFilter,
        consentStatus: consentFilter,
        collectedFrom: dateFrom,
        collectedTo: dateTo,
        page,
        pageSize,
        companyId: currentUser?.company_id || 'company-a'
      });

      setCustomers(res.customers || []);
      setTotalRecords(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [searchQuery, employeeFilter, consentFilter, dateFrom, dateTo, page, pageSize, refreshTrigger]);

  // Checkbox Selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allCurrent = new Set(customers.map(c => c.id));
      setSelectedIds(allCurrent);
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Excel Export
  const handleExportExcel = () => {
    if (customers.length === 0) {
      alert('No customer records to export.');
      return;
    }

    const exportData = customers.map((c, idx) => ({
      s_no: idx + 1,
      customer_id: c.customerId,
      customer_name: c.customerName,
      company_name: c.companyName || '-',
      designation: c.designation || '-',
      contact_number: c.contactNumber,
      alternate_contact_number: c.alternateContactNumber || '-',
      email_address: c.email || '-',
      full_address: c.address || '-',
      website: c.website || '-',
      collected_by: c.collectedByName,
      collected_date: formatDateDDMMYYYY(c.collectedDate) || c.collectedDate || '',
      whatsapp_consent_status: c.consentStatus,
      last_whatsapp_status: c.lastMessageStatus || 'No Message'
    }));

    const columns: ExportColumn[] = [
      { key: 's_no', label: 'S.No' },
      { key: 'customer_id', label: 'Customer ID' },
      { key: 'customer_name', label: 'Customer Name' },
      { key: 'company_name', label: 'Company Name' },
      { key: 'designation', label: 'Designation' },
      { key: 'contact_number', label: 'Contact Number' },
      { key: 'alternate_contact_number', label: 'Alternate Contact Number' },
      { key: 'email_address', label: 'Email Address' },
      { key: 'full_address', label: 'Full Address' },
      { key: 'website', label: 'Website' },
      { key: 'collected_by', label: 'Collected By' },
      { key: 'collected_date', label: 'Collected Date' },
      { key: 'whatsapp_consent_status', label: 'WhatsApp Consent Status' },
      { key: 'last_whatsapp_status', label: 'Last WhatsApp Message Status' }
    ];

    const today = new Date().toISOString().split('T')[0];
    downloadExcel(exportData, `BUSINZ_Customer_Data_${today}.xlsx`, columns);
  };

  // Start Edit Customer
  const openEditModal = (c: CustomerContact) => {
    setEditCustomer(c);
    setEditName(c.customerName);
    setEditCompany(c.companyName || '');
    setEditDesignation(c.designation || '');
    setEditPhone(c.contactNumber);
    setEditEmail(c.email || '');
    setEditAddress(c.address || '');
  };

  const handleSaveEdit = async () => {
    if (!editCustomer) return;
    try {
      setSavingEdit(true);
      await customerService.saveCustomer({
        id: editCustomer.id,
        customerId: editCustomer.customerId,
        companyId: editCustomer.companyId,
        customerName: editName.trim(),
        companyName: editCompany.trim() || undefined,
        designation: editDesignation.trim() || undefined,
        contactNumber: editPhone.trim(),
        email: editEmail.trim() || undefined,
        address: editAddress.trim() || undefined,
        collectedById: editCustomer.collectedById,
        collectedByName: editCustomer.collectedByName,
        collectedDate: editCustomer.collectedDate,
        consentStatus: editCustomer.consentStatus
      });
      setEditCustomer(null);
      fetchRecords();
    } catch (err: any) {
      alert(`Error updating customer: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  // Consent badge render
  const renderConsentBadge = (status: string) => {
    switch (status) {
      case 'Opted In':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 9px',
              borderRadius: '9999px',
              backgroundColor: '#DCFCE7',
              color: '#15803D',
              fontSize: '0.73rem',
              fontWeight: 600,
              whiteSpace: 'nowrap'
            }}
          >
            <ShieldCheck size={12} /> Opted In
          </span>
        );
      case 'Not Opted In':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 9px',
              borderRadius: '9999px',
              backgroundColor: '#FEE2E2',
              color: '#B91C1C',
              fontSize: '0.73rem',
              fontWeight: 600,
              whiteSpace: 'nowrap'
            }}
          >
            <ShieldAlert size={12} /> Not Opted In
          </span>
        );
      default:
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 9px',
              borderRadius: '9999px',
              backgroundColor: '#FEF3C7',
              color: '#B45309',
              fontSize: '0.73rem',
              fontWeight: 600,
              whiteSpace: 'nowrap'
            }}
          >
            <HelpCircle size={12} /> Unknown
          </span>
        );
    }
  };

  // Message status badge
  const renderMessageStatusBadge = (status?: string) => {
    if (!status) {
      return <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>None</span>;
    }
    const colors: Record<string, { bg: string; text: string }> = {
      read: { bg: '#DBEAFE', text: '#1D4ED8' },
      delivered: { bg: '#DCFCE7', text: '#15803D' },
      sent: { bg: '#ECFEFF', text: '#0E7490' },
      accepted: { bg: '#F3E8FF', text: '#6D28D9' },
      queued: { bg: '#FEF3C7', text: '#B45309' },
      failed: { bg: '#FEE2E2', text: '#B91C1C' }
    };
    const c = colors[status.toLowerCase()] || { bg: '#F1F5F9', text: '#475569' };
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '9999px',
          backgroundColor: c.bg,
          color: c.text,
          fontSize: '0.73rem',
          fontWeight: 600,
          textTransform: 'capitalize',
          whiteSpace: 'nowrap'
        }}
      >
        {status}
      </span>
    );
  };

  const isAllSelected = customers.length > 0 && customers.every(c => selectedIds.has(c.id));

  return (
    <div className="customer-directory-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
      {/* Unified Table & Directory Card */}
      <div className="customer-unified-table-card">
        {/* Clean Toolbar: Search, Consent Filter, Total Contacts, Export Excel, Scan/Add Card */}
        <div className="customer-card-toolbar">
          <div className="customer-toolbar-left">
            <div className="customer-search-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search
                size={16}
                className="customer-search-icon"
                style={{ position: 'absolute', left: '13px', color: '#64748B', pointerEvents: 'none', zIndex: 1 }}
              />
              <input
                type="text"
                placeholder="Search by Name, Company, Phone..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="customer-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  className="customer-search-clear"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Consent Filter */}
            <select
              value={consentFilter}
              onChange={e => {
                setConsentFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by consent status"
              className="customer-filter-select"
            >
              <option value="">All Consent Status</option>
              <option value="Opted In">Opted In</option>
              <option value="Not Opted In">Not Opted In</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>

          <div className="customer-toolbar-right">
            <div className="customer-count-pill">
              <Users size={14} />
              <span>
                {totalRecords} {totalRecords === 1 ? 'Contact' : 'Contacts'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleExportExcel}
              className="customer-btn-secondary customer-export-btn"
              title="Export Excel"
              aria-label="Export Excel"
            >
              <Download size={15} />
              <span className="customer-export-btn-label">Export Excel</span>
            </button>

            {onNavigateToAddCustomer && (
              <button
                type="button"
                onClick={onNavigateToAddCustomer}
                className="customer-btn-primary customer-scan-cta-btn"
              >
                <Camera size={15} />
                <span>Scan / Add Card</span>
              </button>
            )}
          </div>
        </div>

        {/* Desktop Professional Table (>= 768px) */}
        <div className="customer-desktop-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E7ECF3' }}>
                <th style={{ padding: '12px 14px', width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    aria-label="Select all contacts on page"
                    style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                </th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>Customer ID</th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600 }}>Customer Name</th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600 }}>Company</th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600 }}>Designation</th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>Contact Number</th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600 }}>Email</th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600 }}>Collected By</th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>Date</th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>Consent</th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>WhatsApp Status</th>
                <th style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} style={{ padding: '44px 20px', textAlign: 'center', color: '#64748B' }}>
                    Loading customer records...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: '56px 20px', textAlign: 'center', color: '#64748B' }}>
                    <div style={{ fontSize: '0.96rem', fontWeight: 600, color: '#1E293B', marginBottom: '4px' }}>
                      No Customer Records Found
                    </div>
                    <div style={{ fontSize: '0.84rem' }}>
                      Try adjusting your search filters or click &ldquo;Scan / Add Card&rdquo; to add a contact.
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map(c => {
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      style={{
                        backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                        borderLeft: isSelected ? '4px solid #0E7490' : '4px solid transparent',
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(c.id)}
                          aria-label={`Select ${c.customerName}`}
                          style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </td>

                      <td style={{ padding: '13px 14px', fontWeight: 600, color: '#0E7490', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        {c.customerId}
                      </td>

                      <td style={{ padding: '13px 14px', fontWeight: 600, color: '#1E293B', verticalAlign: 'middle', maxWidth: '200px', overflowWrap: 'break-word' }}>
                        {c.customerName}
                      </td>

                      <td style={{ padding: '13px 14px', color: '#475569', verticalAlign: 'middle', maxWidth: '220px', overflowWrap: 'break-word' }}>
                        {c.companyName || '-'}
                      </td>

                      <td style={{ padding: '13px 14px', color: '#64748B', verticalAlign: 'middle', maxWidth: '180px', overflowWrap: 'break-word' }}>
                        {c.designation || '-'}
                      </td>

                      <td style={{ padding: '13px 14px', fontWeight: 500, color: '#0F172A', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        {c.contactNumber}
                      </td>

                      <td style={{ padding: '13px 14px', color: '#64748B', verticalAlign: 'middle', maxWidth: '220px', overflowWrap: 'anywhere' }}>
                        {c.email || '-'}
                      </td>

                      <td style={{ padding: '13px 14px', color: '#475569', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        {c.collectedByName}
                      </td>

                      <td style={{ padding: '13px 14px', color: '#64748B', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        {formatDateDDMMYYYY(c.collectedDate) || c.collectedDate || '-'}
                      </td>

                      <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
                        {renderConsentBadge(c.consentStatus)}
                      </td>

                      <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
                        {renderMessageStatusBadge(c.lastMessageStatus)}
                      </td>

                      {/* Row Actions */}
                      <td style={{ padding: '13px 14px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setViewCustomer(c)}
                            title="View Customer"
                            style={{
                              border: '1px solid #E2E8F0',
                              backgroundColor: '#F8FAFC',
                              color: '#334155',
                              padding: '6px 9px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.76rem',
                              fontWeight: 600
                            }}
                          >
                            <Eye size={14} />
                            <span>View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            title="Edit Customer"
                            style={{
                              border: '1px solid #E2E8F0',
                              backgroundColor: '#F8FAFC',
                              color: '#334155',
                              padding: '6px 9px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.76rem',
                              fontWeight: 600
                            }}
                          >
                            <Edit3 size={14} />
                            <span>Edit</span>
                          </button>

                          {c.visitingCardUrl && (
                            <button
                              type="button"
                              onClick={() => setCardModalUrl(c.visitingCardUrl || null)}
                              title="View Visiting Card"
                              style={{
                                border: '1px solid #BAE6FD',
                                backgroundColor: '#ECFEFF',
                                color: '#0E7490',
                                padding: '6px 9px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.76rem',
                                fontWeight: 600
                              }}
                            >
                              <CreditCard size={14} />
                              <span>Card</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Native Contact Card List (< 768px) */}
        <div className="customer-mobile-list">
          {loading ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', fontSize: '0.88rem' }}>
              Loading customer records...
            </div>
          ) : customers.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: '#64748B' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                No Customer Records Found
              </div>
              <div style={{ fontSize: '0.8rem', lineHeight: 1.45 }}>
                Try adjusting your search filters or tap &ldquo;Scan / Add Card&rdquo; to add a contact.
              </div>
            </div>
          ) : (
            customers.map(c => {
              const isSelected = selectedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  className={`customer-mobile-card ${isSelected ? 'selected' : ''}`}
                >
                  {/* Top Row: Checkbox + Customer ID on Left, Consent & WhatsApp Status on Right */}
                  <div className="customer-mobile-card-top">
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        minHeight: '28px'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(c.id)}
                        style={{ accentColor: '#0E7490', cursor: 'pointer', width: '17px', height: '17px', margin: 0 }}
                      />
                      <span className="customer-mobile-id">{c.customerId}</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {renderConsentBadge(c.consentStatus)}
                      {c.lastMessageStatus && renderMessageStatusBadge(c.lastMessageStatus)}
                    </div>
                  </div>

                  {/* Body: Name, Company/Designation, Phone & Email, Collected By & Date */}
                  <div className="customer-mobile-card-body">
                    <div className="customer-mobile-name">{c.customerName}</div>
                    {(c.companyName || c.designation) && (
                      <div className="customer-mobile-sub">
                        {c.companyName ? c.companyName : ''}
                        {c.companyName && c.designation ? ' • ' : ''}
                        {c.designation ? c.designation : ''}
                      </div>
                    )}

                    <div className="customer-mobile-contact-row">
                      <div className="customer-mobile-contact-item">
                        <Phone size={13} color="#0E7490" style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>{c.contactNumber}</span>
                      </div>
                      {c.email && (
                        <div className="customer-mobile-contact-item">
                          <Mail size={13} color="#64748B" style={{ flexShrink: 0 }} />
                          <span style={{ color: '#475569', overflowWrap: 'anywhere' }}>{c.email}</span>
                        </div>
                      )}
                    </div>

                    <div className="customer-mobile-meta-row">
                      <span>By: {c.collectedByName}</span>
                      <span>{formatDateDDMMYYYY(c.collectedDate) || c.collectedDate}</span>
                    </div>
                  </div>

                  {/* Touch-Friendly Action Buttons (42-44px height) */}
                  <div className="customer-mobile-card-actions">
                    <button
                      type="button"
                      onClick={() => setViewCustomer(c)}
                      className="customer-mobile-action-btn"
                      title="View Details"
                    >
                      <Eye size={14} />
                      <span>View</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(c)}
                      className="customer-mobile-action-btn"
                      title="Edit Customer"
                    >
                      <Edit3 size={14} />
                      <span>Edit</span>
                    </button>
                    {c.visitingCardUrl && (
                      <button
                        type="button"
                        onClick={() => setCardModalUrl(c.visitingCardUrl || null)}
                        className="customer-mobile-action-btn card"
                        title="View Visiting Card"
                      >
                        <CreditCard size={14} />
                        <span>Card</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Responsive Pagination Footer (Visible on both Desktop and Mobile) */}
        <div className="customer-pagination-footer">
          {/* Left: Rows Per Page [5, 10] + Entry Summary */}
          <div className="customer-pagination-left">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', color: '#64748B' }}>Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                aria-label="Rows per page"
                style={{
                  padding: '5px 10px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.82rem',
                  backgroundColor: '#FFFFFF',
                  color: '#1E293B',
                  cursor: 'pointer'
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
              Showing {totalRecords === 0 ? 0 : (page - 1) * pageSize + 1} to{' '}
              {Math.min(page * pageSize, totalRecords)} of {totalRecords} entries
            </span>
          </div>

          {/* Right: Page Navigation Controls */}
          <div className="customer-pagination-right">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page <= 1}
                aria-label="First page"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: page <= 1 ? '#CBD5E1' : '#475569',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronsLeft size={15} />
              </button>

              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: page <= 1 ? '#CBD5E1' : '#475569',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronLeft size={15} />
              </button>

              <span
                style={{
                  minWidth: '34px',
                  height: '34px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {page}
              </span>

              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: page >= totalPages ? '#CBD5E1' : '#475569',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronRight size={15} />
              </button>

              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                aria-label="Last page"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: page >= totalPages ? '#CBD5E1' : '#475569',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronsRight size={15} />
              </button>
            </div>

            {/* Go to page input */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Go to:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={goToPageInput}
                onChange={e => setGoToPageInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const p = parseInt(goToPageInput, 10);
                    if (p >= 1 && p <= totalPages) setPage(p);
                  }
                }}
                style={{
                  width: '48px',
                  height: '34px',
                  padding: '0 6px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.8rem',
                  textAlign: 'center'
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const p = parseInt(goToPageInput, 10);
                  if (p >= 1 && p <= totalPages) setPage(p);
                }}
                style={{
                  height: '34px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '0.76rem',
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

      {/* Floating Action Bar (Fixed above bottom nav) */}
      {selectedIds.size > 0 && (
        <div className="customer-floating-action-bar">
          <span style={{ fontSize: '0.84rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {selectedIds.size} Selected
          </span>

          <div style={{ width: '1px', height: '18px', backgroundColor: '#334155' }} />

          <button
            type="button"
            onClick={() => {
              const first = customers.find(c => selectedIds.has(c.id));
              if (first) {
                if (onOpenSendWhatsApp) {
                  onOpenSendWhatsApp(first);
                } else {
                  setSendWhatsAppCustomer(first);
                }
              }
            }}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#38BDF8',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Send size={14} /> Send WhatsApp
          </button>

          <div style={{ width: '1px', height: '18px', backgroundColor: '#334155' }} />

          <button
            type="button"
            onClick={handleExportExcel}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#4ADE80',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Download size={14} /> Export
          </button>

          <div style={{ width: '1px', height: '18px', backgroundColor: '#334155' }} />

          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            title="Deselect All"
            aria-label="Deselect All"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '2px',
              display: 'inline-flex',
              alignItems: 'center'
            }}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* View Customer Details Modal */}
      {viewCustomer && (
        <div
          className="modal-overlay"
          onClick={() => setViewCustomer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
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
              borderRadius: '20px',
              width: '100%',
              maxWidth: '600px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #E7ECF3'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    backgroundColor: '#ECFEFF',
                    color: '#0E7490',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <User size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1E293B', overflowWrap: 'break-word' }}>
                    {viewCustomer.customerName}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: '#0E7490', fontWeight: 600 }}>
                    {viewCustomer.customerId}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewCustomer(null)}
                aria-label="Close"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#64748B',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="customer-modal-detail-grid">
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Company Name</span>
                <strong style={{ color: '#0F172A', overflowWrap: 'break-word' }}>{viewCustomer.companyName || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Designation</span>
                <strong style={{ color: '#0F172A', overflowWrap: 'break-word' }}>{viewCustomer.designation || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Contact Number</span>
                <strong style={{ color: '#0E7490' }}>{viewCustomer.contactNumber}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Alternate Number</span>
                <strong style={{ color: '#0F172A' }}>{viewCustomer.alternateContactNumber || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Email Address</span>
                <strong style={{ color: '#0F172A', overflowWrap: 'anywhere' }}>{viewCustomer.email || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Website</span>
                <strong style={{ color: '#0F172A', overflowWrap: 'anywhere' }}>{viewCustomer.website || '-'}</strong>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Full Address</span>
                <strong style={{ color: '#0F172A', overflowWrap: 'break-word' }}>{viewCustomer.address || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Collected By</span>
                <strong style={{ color: '#0F172A' }}>{viewCustomer.collectedByName}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Collected Date</span>
                <strong style={{ color: '#0F172A' }}>{formatDateDDMMYYYY(viewCustomer.collectedDate) || viewCustomer.collectedDate || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '4px' }}>WhatsApp Consent</span>
                {renderConsentBadge(viewCustomer.consentStatus)}
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '4px' }}>Last Message Status</span>
                {renderMessageStatusBadge(viewCustomer.lastMessageStatus)}
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setViewCustomer(null)}
                style={{
                  minHeight: '42px',
                  padding: '0 20px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editCustomer && (
        <div
          className="modal-overlay"
          onClick={() => setEditCustomer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
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
              borderRadius: '20px',
              width: '100%',
              maxWidth: '600px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #E7ECF3'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1E293B' }}>
                Edit Customer ({editCustomer.customerId})
              </h3>
              <button
                type="button"
                onClick={() => setEditCustomer(null)}
                aria-label="Close"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#64748B',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="customer-modal-detail-grid">
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{ width: '100%', minHeight: '44px', padding: '8px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Company Name
                </label>
                <input
                  type="text"
                  value={editCompany}
                  onChange={e => setEditCompany(e.target.value)}
                  style={{ width: '100%', minHeight: '44px', padding: '8px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Designation
                </label>
                <input
                  type="text"
                  value={editDesignation}
                  onChange={e => setEditDesignation(e.target.value)}
                  style={{ width: '100%', minHeight: '44px', padding: '8px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Contact Number *
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  style={{ width: '100%', minHeight: '44px', padding: '8px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  style={{ width: '100%', minHeight: '44px', padding: '8px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Full Address
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  style={{ width: '100%', minHeight: '44px', padding: '8px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditCustomer(null)}
                style={{
                  minHeight: '44px',
                  padding: '0 18px',
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
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                style={{
                  minHeight: '44px',
                  padding: '0 22px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  cursor: savingEdit ? 'not-allowed' : 'pointer'
                }}
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visiting Card Image Preview Modal */}
      {cardModalUrl && (
        <div
          className="modal-overlay"
          onClick={() => setCardModalUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(4px)',
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
              borderRadius: '20px',
              padding: '20px',
              maxWidth: '600px',
              width: '100%',
              position: 'relative',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>
                Visiting Card Preview
              </h4>
              <button
                type="button"
                onClick={() => setCardModalUrl(null)}
                aria-label="Close card preview"
                style={{
                  width: '36px',
                  height: '36px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748B'
                }}
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={cardModalUrl}
              alt="Visiting Card"
              style={{ width: '100%', borderRadius: '12px', display: 'block', objectFit: 'contain', maxHeight: '72vh', backgroundColor: '#F8FAFC' }}
            />
          </div>
        </div>
      )}

      {/* Send WhatsApp Modal */}
      {sendWhatsAppCustomer && (
        <SendWhatsAppModal
          customer={sendWhatsAppCustomer}
          isOpen={Boolean(sendWhatsAppCustomer)}
          onClose={() => setSendWhatsAppCustomer(null)}
          onSuccess={() => {
            fetchRecords();
          }}
        />
      )}
    </div>
  );
};
