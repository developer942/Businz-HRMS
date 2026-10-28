import React, { useState, useEffect } from 'react';
import { CustomerContact } from '../../types/customer';
import { customerService } from '../../services/customerService';
import { useHRMS } from '../../context/HRMSContext';
import { downloadExcel, ExportColumn } from '../../utils/exportUtils';
import { SendWhatsAppModal } from './SendWhatsAppModal';
import { 
  Search, 
  Filter, 
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
  UserCheck,
  Building,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Check,
  AlertCircle
} from 'lucide-react';

interface CustomerRecordsViewProps {
  onOpenSendWhatsApp?: (customer: CustomerContact) => void;
  onNavigateToAddCustomer?: () => void;
}

export const CustomerRecordsView: React.FC<CustomerRecordsViewProps> = ({
  onOpenSendWhatsApp,
  onNavigateToAddCustomer
}) => {
  const { currentUser, hasPermission } = useHRMS();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [consentFilter, setConsentFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
  }, [searchQuery, employeeFilter, consentFilter, dateFrom, dateTo, page, pageSize]);

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
      collected_date: c.collectedDate,
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
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 9px',
            borderRadius: '9999px',
            backgroundColor: '#DCFCE7',
            color: '#15803D',
            fontSize: '0.75rem',
            fontWeight: 600
          }}>
            <ShieldCheck size={12} /> Opted In
          </span>
        );
      case 'Not Opted In':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 9px',
            borderRadius: '9999px',
            backgroundColor: '#FEE2E2',
            color: '#B91C1C',
            fontSize: '0.75rem',
            fontWeight: 600
          }}>
            <ShieldAlert size={12} /> Not Opted In
          </span>
        );
      default:
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 9px',
            borderRadius: '9999px',
            backgroundColor: '#FEF3C7',
            color: '#B45309',
            fontSize: '0.75rem',
            fontWeight: 600
          }}>
            <HelpCircle size={12} /> Unknown
          </span>
        );
    }
  };

  // Message status badge
  const renderMessageStatusBadge = (status?: string) => {
    if (!status) {
      return <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>None</span>;
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
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '9999px',
        backgroundColor: c.bg,
        color: c.text,
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'capitalize'
      }}>
        {status}
      </span>
    );
  };

  const isAllSelected = customers.length > 0 && customers.every(c => selectedIds.has(c.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
      {/* Search & Filter Toolbar Card */}
      <div className="customer-card-box" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          width: '100%'
        }}>
          <div style={{ minWidth: 0, flex: '1 1 240px' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1E293B', lineHeight: 1.25 }}>
              Customer Records Directory
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748B', wordBreak: 'break-word' }}>
              Search, filter, export customer contacts and initiate approved WhatsApp communications.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleExportExcel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#1E293B',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Download size={15} /> Export Excel (.xlsx)
            </button>

            {onNavigateToAddCustomer && (
              <button
                onClick={onNavigateToAddCustomer}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)',
                  whiteSpace: 'nowrap'
                }}
              >
                + Add Customer
              </button>
            )}
          </div>
        </div>

        {/* Quick Search */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '460px', boxSizing: 'border-box' }}>
          <input
            type="text"
            placeholder="Search by Name, Company, or Phone..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '11px' }} />
        </div>
      </div>

      {/* Main Standardized Table Card */}
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
                <th style={{ padding: '14px 16px', width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                </th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600 }}>Customer ID</th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600 }}>Customer Name</th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600 }}>Company</th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600 }}>Designation</th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600 }}>Contact Number</th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600 }}>Email</th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600 }}>Collected By</th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600 }}>Consent</th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600 }}>WhatsApp Status</th>
                <th style={{ padding: '14px 16px', color: '#64748B', fontWeight: 600, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                    Loading customer records...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: '4px' }}>
                      No Customer Records Found
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>
                      Try adjusting your search filters or click "+ Add Customer" to capture a new record.
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
                      <td style={{ padding: '14px 16px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(c.id)}
                          style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </td>

                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0E7490' }}>
                        {c.customerId}
                      </td>

                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1E293B' }}>
                        {c.customerName}
                      </td>

                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        {c.companyName || '-'}
                      </td>

                      <td style={{ padding: '14px 16px', color: '#64748B' }}>
                        {c.designation || '-'}
                      </td>

                      <td style={{ padding: '14px 16px', fontWeight: 500, color: '#0F172A' }}>
                        {c.contactNumber}
                      </td>

                      <td style={{ padding: '14px 16px', color: '#64748B' }}>
                        {c.email || '-'}
                      </td>

                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        {c.collectedByName}
                      </td>

                      <td style={{ padding: '14px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>
                        {c.collectedDate}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        {renderConsentBadge(c.consentStatus)}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        {renderMessageStatusBadge(c.lastMessageStatus)}
                      </td>

                      {/* Row Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => setViewCustomer(c)}
                            title="View Customer"
                            style={{
                              border: 'none',
                              backgroundColor: '#F1F5F9',
                              color: '#475569',
                              padding: '6px',
                              borderRadius: '8px',
                              cursor: 'pointer'
                            }}
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            onClick={() => openEditModal(c)}
                            title="Edit Customer"
                            style={{
                              border: 'none',
                              backgroundColor: '#F1F5F9',
                              color: '#475569',
                              padding: '6px',
                              borderRadius: '8px',
                              cursor: 'pointer'
                            }}
                          >
                            <Edit3 size={15} />
                          </button>

                          {c.visitingCardUrl && (
                            <button
                              onClick={() => setCardModalUrl(c.visitingCardUrl || null)}
                              title="View Visiting Card"
                              style={{
                                border: 'none',
                                backgroundColor: '#ECFEFF',
                                color: '#0E7490',
                                padding: '6px',
                                borderRadius: '8px',
                                cursor: 'pointer'
                              }}
                            >
                              <CreditCard size={15} />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              if (onOpenSendWhatsApp) {
                                onOpenSendWhatsApp(c);
                              } else {
                                setSendWhatsAppCustomer(c);
                              }
                            }}
                            title="Send WhatsApp Message"
                            style={{
                              border: 'none',
                              backgroundColor: '#DCFCE7',
                              color: '#15803D',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: 600,
                              fontSize: '0.75rem'
                            }}
                          >
                            <Send size={13} /> Send
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

        {/* Standardized Pagination Footer (Phase 4 & AGENTS.md) */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #E7ECF3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          backgroundColor: '#FFFFFF'
        }}>
          {/* Left: Rows Per Page [5, 10] */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748B' }}>Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '0.85rem',
                backgroundColor: '#FFFFFF',
                color: '#1E293B',
                cursor: 'pointer'
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
            <span style={{ fontSize: '0.85rem', color: '#64748B' }}>
              Showing {totalRecords === 0 ? 0 : (page - 1) * pageSize + 1} to{' '}
              {Math.min(page * pageSize, totalRecords)} of {totalRecords} entries
            </span>
          </div>

          {/* Right: Page Navigation Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              style={{
                padding: '6px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: page <= 1 ? '#CBD5E1' : '#475569',
                cursor: page <= 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronsLeft size={16} />
            </button>

            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                padding: '6px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: page <= 1 ? '#CBD5E1' : '#475569',
                cursor: page <= 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={16} />
            </button>

            {/* Page number pill */}
            <span style={{
              padding: '6px 12px',
              borderRadius: '8px',
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.85rem'
            }}>
              {page}
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                padding: '6px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: page >= totalPages ? '#CBD5E1' : '#475569',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronRight size={16} />
            </button>

            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              style={{
                padding: '6px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: page >= totalPages ? '#CBD5E1' : '#475569',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronsRight size={16} />
            </button>

            {/* Go to page input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Go to:</span>
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
                  width: '50px',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.8rem',
                  textAlign: 'center'
                }}
              />
              <button
                onClick={() => {
                  const p = parseInt(goToPageInput, 10);
                  if (p >= 1 && p <= totalPages) setPage(p);
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
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

      {/* Floating Action Bar (Fixed at bottom center per Design System) */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          padding: '12px 24px',
          borderRadius: '50px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          zIndex: 900,
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            {selectedIds.size} Selected
          </span>

          <div style={{ width: '1px', height: '18px', backgroundColor: '#334155' }} />

          <button
            onClick={() => {
              const first = customers.find(c => selectedIds.has(c.id));
              if (first) setSendWhatsAppCustomer(first);
            }}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#38BDF8',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Send size={15} /> Send WhatsApp
          </button>

          <div style={{ width: '1px', height: '18px', backgroundColor: '#334155' }} />

          <button
            onClick={handleExportExcel}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#4ADE80',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Download size={15} /> Export Selected
          </button>

          <div style={{ width: '1px', height: '18px', backgroundColor: '#334155' }} />

          <button
            onClick={() => setSelectedIds(new Set())}
            title="Deselect All"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* View Customer Details Modal */}
      {viewCustomer && (
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
            maxWidth: '640px',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                  <User size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1E293B' }}>
                    {viewCustomer.customerName}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: '#0E7490', fontWeight: 600 }}>
                    {viewCustomer.customerId}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setViewCustomer(null)}
                style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.875rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Company Name</span>
                <strong>{viewCustomer.companyName || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Designation</span>
                <strong>{viewCustomer.designation || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Contact Number</span>
                <strong style={{ color: '#0E7490' }}>{viewCustomer.contactNumber}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Alternate Number</span>
                <strong>{viewCustomer.alternateContactNumber || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Email Address</span>
                <strong>{viewCustomer.email || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Website</span>
                <strong>{viewCustomer.website || '-'}</strong>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Full Address</span>
                <strong>{viewCustomer.address || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Collected By</span>
                <strong>{viewCustomer.collectedByName}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Collected Date</span>
                <strong>{viewCustomer.collectedDate}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>WhatsApp Consent</span>
                {renderConsentBadge(viewCustomer.consentStatus)}
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Last Message Status</span>
                {renderMessageStatusBadge(viewCustomer.lastMessageStatus)}
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setViewCustomer(null)}
                style={{
                  padding: '9px 18px',
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
            maxWidth: '640px',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1E293B' }}>
                Edit Customer Info ({editCustomer.customerId})
              </h3>
              <button
                onClick={() => setEditCustomer(null)}
                style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>
                  Company Name
                </label>
                <input
                  type="text"
                  value={editCompany}
                  onChange={e => setEditCompany(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>
                  Designation
                </label>
                <input
                  type="text"
                  value={editDesignation}
                  onChange={e => setEditDesignation(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>
                  Contact Number *
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>
                  Full Address
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setEditCustomer(null)}
                style={{
                  padding: '9px 18px',
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
                onClick={handleSaveEdit}
                disabled={savingEdit}
                style={{
                  padding: '9px 20px',
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
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            padding: '20px',
            maxWidth: '600px',
            width: '100%',
            position: 'relative',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <button
              onClick={() => setCardModalUrl(null)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                border: 'none',
                background: '#F1F5F9',
                borderRadius: '50%',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={18} />
            </button>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1E293B' }}>
              Original Visiting Card Image
            </h4>
            <img
              src={cardModalUrl}
              alt="Visiting Card"
              style={{ width: '100%', borderRadius: '12px', display: 'block', objectFit: 'contain', maxHeight: '70vh' }}
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
