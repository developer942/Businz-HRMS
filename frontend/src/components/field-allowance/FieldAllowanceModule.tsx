// VRM Enterprise HRMS - Field Allowance Management Module (Petty Cash Unified UI)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Search,
  Send,
  ShieldCheck,
  TrendingDown,
  WalletCards,
  X,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { fieldAllowanceService } from '../../services/fieldAllowanceService';
import type {
  FieldAllowanceDecision,
  FieldAllowanceDetail,
  FieldAllowanceRequest,
  FieldAllowanceRequestPayload,
  FieldAllowanceStatus,
  FieldAllowanceSummary,
} from '../../types/fieldAllowance';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { ExportDropdown } from '../common/ExportDropdown';
import { downloadCSV, downloadExcel, downloadPDF, ExportColumn } from '../../utils/exportUtils';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { ProofViewerModal } from '../petty-cash/ProofViewerModal';
import '../petty-cash/PettyCash.css';
import './FieldAllowance.css';

const STATUS_LABELS: Record<FieldAllowanceStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  CORRECTION_REQUESTED: 'Correction Requested',
  REJECTED: 'Rejected',
  APPROVED: 'Approved',
  AMOUNT_DISTRIBUTED: 'Amount Distributed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

const getStatusPillClass = (status: FieldAllowanceStatus): string => {
  switch (status) {
    case 'PENDING_APPROVAL':
    case 'CORRECTION_REQUESTED':
      return 'warning';
    case 'APPROVED':
    case 'AMOUNT_DISTRIBUTED':
      return 'info';
    case 'IN_PROGRESS':
      return 'purple';
    case 'COMPLETED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    default:
      return 'neutral';
  }
};

const formatInr = (value: number): string =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayIso = () => new Date().toISOString().slice(0, 10);

export const FieldAllowanceModule: React.FC = () => {
  const { currentUser } = useHRMS();
  const role = currentUser.role || '';
  const isManagement = [
    'CEO',
    'Super Admin',
    'Admin',
    'HR',
    'HR Manager',
    'HR Admin',
    'Management',
    'ERP Administrator',
  ].includes(role);

  const roleKey = role.trim().toLowerCase();
  const departmentKey = (currentUser.department || '').trim().toLowerCase();
  const designationKey = (currentUser.designation || '').trim().toLowerCase();
  const isAccountsUser =
    ['finance manager', 'finance', 'accountant', 'accounts', 'accounts manager', 'accounts executive'].includes(
      roleKey
    ) ||
    departmentKey.includes('accounts') ||
    departmentKey.includes('finance') ||
    designationKey.includes('account') ||
    designationKey.includes('finance');

  // Data state
  const [rows, setRows] = useState<FieldAllowanceRequest[]>([]);
  const [summary, setSummary] = useState<FieldAllowanceSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Unified Single-Page Filter & Pagination State
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Modals State (Petty Cash style modals instead of full-screen page swaps)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false);
  const [editingDetail, setEditingDetail] = useState<FieldAllowanceDetail | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<FieldAllowanceDetail | null>(null);
  const [proofViewer, setProofViewer] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: '',
  });

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 4500);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [requestRows, summaryData] = await Promise.all([
        fieldAllowanceService.list(isAccountsUser && !isManagement ? { scope: 'mine' } : {}),
        isManagement ? fieldAllowanceService.summary().catch(() => null) : Promise.resolve(null),
      ]);
      setRows(requestRows);
      setSummary(summaryData);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to load Field Allowance records.');
    } finally {
      setLoading(false);
    }
  }, [isAccountsUser, isManagement]);

  useEffect(() => {
    const handle = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(handle);
  }, [refresh]);

  const openDetailModal = async (row: FieldAllowanceRequest) => {
    try {
      setBusy(true);
      const freshDetail = await fieldAllowanceService.detail(row.id);
      setSelectedDetail(freshDetail);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to load trip details.');
    } finally {
      setBusy(false);
    }
  };

  const openEditModal = async (rowOrDetail: FieldAllowanceRequest | FieldAllowanceDetail) => {
    try {
      setBusy(true);
      const full =
        'daily_reports' in rowOrDetail ? rowOrDetail : await fieldAllowanceService.detail(rowOrDetail.id);
      setEditingDetail(full);
      setSelectedDetail(null);
      setIsRequestModalOpen(true);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to load request for editing.');
    } finally {
      setBusy(false);
    }
  };

  // Computed KPI Metrics
  const kpiMetrics = useMemo(() => {
    const totalRequests = summary?.total_requests ?? rows.length;
    const pendingApproval =
      summary?.pending_approval ?? rows.filter((r) => r.status === 'PENDING_APPROVAL').length;
    const approvedRequests =
      summary?.approved_requests ??
      rows.filter((r) => ['APPROVED', 'AMOUNT_DISTRIBUTED', 'IN_PROGRESS', 'COMPLETED'].includes(r.status)).length;
    const activeTrips =
      summary?.active_trips ??
      rows.filter((r) => ['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(r.status)).length;
    const totalDistributed =
      summary?.total_distributed_amount ?? rows.reduce((sum, r) => sum + Number(r.allocated_amount || 0), 0);
    const totalSpent =
      summary?.total_spent_amount ?? rows.reduce((sum, r) => sum + Number(r.total_spent || 0), 0);
    const netBalance = totalDistributed - totalSpent;

    return {
      totalRequests,
      pendingApproval,
      approvedRequests,
      activeTrips,
      totalDistributed,
      totalSpent,
      netBalance,
    };
  }, [rows, summary]);

  // Filtered rows on the unified single page
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const term = search.trim().toLowerCase();
      const matchesSearch =
        !term ||
        [row.employee_name, row.employee_id, row.trip_code, row.purpose, row.destination, row.department_name].some(
          (val) => val?.toLowerCase().includes(term)
        );
      if (!matchesSearch) return false;

      if (statusFilter === 'ALL' || !statusFilter) return true;
      if (statusFilter === 'ACTIVE_VISITS') {
        return ['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(row.status);
      }
      return row.status === statusFilter;
    });
  }, [rows, search, statusFilter]);

  const paginatedRows = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      return filteredRows;
    }
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Export configuration (matching Petty Cash)
  const exportColumns: ExportColumn[] = [
    { label: 'Trip #', key: 'trip_code' },
    { label: 'Employee Name', key: 'employee_name' },
    { label: 'Employee ID', key: 'employee_id' },
    { label: 'Department', key: 'department_name' },
    { label: 'Purpose', key: 'purpose' },
    { label: 'Destination', key: 'destination' },
    { label: 'Start Date', key: 'start_date_fmt' },
    { label: 'End Date', key: 'end_date_fmt' },
    { label: 'Requested (₹)', key: 'requested_fmt' },
    { label: 'Allocated (₹)', key: 'allocated_fmt' },
    { label: 'Spent (₹)', key: 'spent_fmt' },
    { label: 'Balance (₹)', key: 'balance_fmt' },
    { label: 'Status', key: 'status_label' },
  ];

  const getExportData = () =>
    filteredRows.map((r) => ({
      ...r,
      start_date_fmt: formatDateDDMMYYYY(r.start_date),
      end_date_fmt: formatDateDDMMYYYY(r.end_date),
      requested_fmt: Number(r.requested_amount || 0).toFixed(2),
      allocated_fmt: Number(r.allocated_amount || 0).toFixed(2),
      spent_fmt: Number(r.total_spent || 0).toFixed(2),
      balance_fmt: Number(r.balance || 0).toFixed(2),
      status_label: STATUS_LABELS[r.status] || r.status,
    }));

  const handleExportCSV = () => {
    downloadCSV(getExportData(), `Field_Allowance_Report_${todayIso()}`, exportColumns);
  };
  const handleExportExcel = () => {
    downloadExcel(getExportData(), `Field_Allowance_Report_${todayIso()}`, exportColumns);
  };
  const handleExportPDF = () => {
    downloadPDF(
      getExportData(),
      'Field Allowance Register & Approvals',
      `Field_Allowance_Report_${todayIso()}`,
      exportColumns
    );
  };

  return (
    <div className="petty-cash-container">
      {/* Toast Notification */}
      {feedback && (
        <div
          style={{
            position: 'fixed',
            top: '84px',
            right: '24px',
            zIndex: 25000,
            background: feedback.type === 'success' ? '#0F766E' : '#B91C1C',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {feedback.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'transparent', border: 'none', color: '#FFFFFF', cursor: 'pointer', padding: 0 }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Main Header (Petty Cash Management Style) */}
      <div className="petty-cash-header">
        <div className="petty-cash-title-group">
          <h1>
            <WalletCards size={28} color="var(--color-primary-blue)" />
            {isManagement ? 'Field Allowance Management' : 'My Field Allowance'}
          </h1>
        </div>

        <div className="petty-cash-actions-group">
          {!isManagement && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditingDetail(null);
                setIsRequestModalOpen(true);
              }}
              title="New Field Allowance Request"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>Request Field Allowance</span>
            </button>
          )}

          <ExportDropdown
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            onExportCSV={handleExportCSV}
            label="Download"
            variant="secondary"
          />
        </div>
      </div>

      {/* Standardized KPI Cards (Petty Cash Style - Clickable Filters) */}
      {isManagement ? (
        <div className="kpi-grid" style={{ marginBottom: '20px' }}>
          <div
            className="kpi-card"
            onClick={() => {
              setStatusFilter('ALL');
              setCurrentPage(1);
            }}
            style={{
              cursor: 'pointer',
              border: statusFilter === 'ALL' ? '2px solid #0E7490' : '1px solid #E7ECF3',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              backgroundColor: statusFilter === 'ALL' ? '#ECFEFF' : '#FFFFFF',
              transition: 'all 0.2s ease',
            }}
            title="Click to view all Field Allowance requests"
          >
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: '#64748B' }}>TOTAL REQUESTS</span>
              <div className="kpi-icon-wrapper" style={{ color: '#0E7490' }}>
                <Layers size={16} />
              </div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#0E7490' }}>
                {kpiMetrics.totalRequests}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                Approved: {kpiMetrics.approvedRequests} • Active Trips: {kpiMetrics.activeTrips}
              </div>
            </div>
          </div>

          <div
            className="kpi-card"
            onClick={() => {
              setStatusFilter((prev) => (prev === 'PENDING_APPROVAL' ? 'ALL' : 'PENDING_APPROVAL'));
              setCurrentPage(1);
            }}
            style={{
              cursor: 'pointer',
              border: statusFilter === 'PENDING_APPROVAL' ? '2px solid #F59E0B' : '1px solid #E7ECF3',
              boxShadow:
                statusFilter === 'PENDING_APPROVAL'
                  ? '0 4px 14px rgba(245,158,11,0.15)'
                  : '0 1px 3px rgba(0,0,0,0.03)',
              backgroundColor: statusFilter === 'PENDING_APPROVAL' ? '#FFFBEB' : '#FFFFFF',
              transition: 'all 0.2s ease',
            }}
            title="Click to filter Pending Approvals"
          >
            <div className="kpi-card-header">
              <span
                style={{
                  fontWeight: 700,
                  color: statusFilter === 'PENDING_APPROVAL' ? '#B45309' : '#64748B',
                }}
              >
                PENDING APPROVALS
              </span>
              <div className="kpi-icon-wrapper amber" style={{ color: '#D97706' }}>
                <Clock size={16} />
              </div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#D97706' }}>
                {kpiMetrics.pendingApproval}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#92400E', marginTop: '2px' }}>
                Click to review pending requests
              </div>
            </div>
          </div>

          <div
            className="kpi-card"
            onClick={() => {
              setStatusFilter((prev) => (prev === 'ACTIVE_VISITS' ? 'ALL' : 'ACTIVE_VISITS'));
              setCurrentPage(1);
            }}
            style={{
              cursor: 'pointer',
              border: statusFilter === 'ACTIVE_VISITS' ? '2px solid #059669' : '1px solid #E7ECF3',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              backgroundColor: statusFilter === 'ACTIVE_VISITS' ? '#ECFDF5' : '#FFFFFF',
              transition: 'all 0.2s ease',
            }}
            title="Click to filter Active Field Visits"
          >
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: '#64748B' }}>TOTAL DISTRIBUTED</span>
              <div className="kpi-icon-wrapper emerald" style={{ color: '#10B981' }}>
                <ShieldCheck size={16} />
              </div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#059669' }}>
                {formatInr(kpiMetrics.totalDistributed)}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                {kpiMetrics.activeTrips} Active Trip{kpiMetrics.activeTrips === 1 ? '' : 's'} in Progress
              </div>
            </div>
          </div>

          <div
            className="kpi-card"
            style={{
              border: '1px solid #E7ECF3',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              backgroundColor: '#FFFFFF',
            }}
          >
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: '#64748B' }}>TOTAL SPENT & VOUCHERED</span>
              <div className="kpi-icon-wrapper rose" style={{ color: '#EF4444' }}>
                <TrendingDown size={16} />
              </div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#DC2626' }}>
                {formatInr(kpiMetrics.totalSpent)}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                Unspent Balance: {formatInr(kpiMetrics.netBalance)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="kpi-grid" style={{ marginBottom: '20px' }}>
          <div className="kpi-card" style={{ border: '1px solid #E7ECF3', backgroundColor: '#FFFFFF' }}>
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: '#64748B' }}>AVAILABLE ADVANCE BALANCE</span>
              <div className="kpi-icon-wrapper" style={{ color: '#0E7490' }}>
                <WalletCards size={16} />
              </div>
            </div>
            <div className="kpi-card-body">
              <div
                className="kpi-value"
                style={{ color: kpiMetrics.netBalance < 0 ? '#DC2626' : '#0E7490' }}
              >
                {formatInr(kpiMetrics.netBalance)}
              </div>
            </div>
          </div>

          <div className="kpi-card" style={{ border: '1px solid #E7ECF3', backgroundColor: '#FFFFFF' }}>
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: '#64748B' }}>ALLOCATED ADVANCE</span>
              <div className="kpi-icon-wrapper emerald" style={{ color: '#10B981' }}>
                <ShieldCheck size={16} />
              </div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#059669' }}>
                {formatInr(kpiMetrics.totalDistributed)}
              </div>
            </div>
          </div>

          <div className="kpi-card" style={{ border: '1px solid #E7ECF3', backgroundColor: '#FFFFFF' }}>
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: '#64748B' }}>TOTAL SPENT & VOUCHERED</span>
              <div className="kpi-icon-wrapper rose" style={{ color: '#EF4444' }}>
                <TrendingDown size={16} />
              </div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#DC2626' }}>
                {formatInr(kpiMetrics.totalSpent)}
              </div>
            </div>
          </div>

          <div
            className="kpi-card"
            onClick={() => {
              setStatusFilter((prev) => (prev === 'PENDING_APPROVAL' ? 'ALL' : 'PENDING_APPROVAL'));
              setCurrentPage(1);
            }}
            style={{
              cursor: 'pointer',
              border: statusFilter === 'PENDING_APPROVAL' ? '2px solid #F59E0B' : '1px solid #E7ECF3',
              backgroundColor: statusFilter === 'PENDING_APPROVAL' ? '#FFFBEB' : '#FFFFFF',
            }}
          >
            <div className="kpi-card-header">
              <span style={{ fontWeight: 700, color: '#64748B' }}>PENDING REQUESTS</span>
              <div className="kpi-icon-wrapper amber" style={{ color: '#D97706' }}>
                <Clock size={16} />
              </div>
            </div>
            <div className="kpi-card-body">
              <div className="kpi-value" style={{ color: '#D97706' }}>
                {kpiMetrics.pendingApproval}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified Single-Page Requests, Approvals & Active Visits Section Card */}
      <div className="petty-cash-section-card">
        <div className="section-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3 className="section-card-title">
              <FileText size={20} color="var(--color-primary-blue)" />
              {isManagement
                ? 'Field Allowance Overview & Approvals'
                : 'My Field Allowance Requests & Visits'}
              {kpiMetrics.pendingApproval > 0 && (
                <span className="tab-badge">{kpiMetrics.pendingApproval} Pending</span>
              )}
            </h3>

            {/* Quick Filter Pills on the Single Page */}
            <div className="fa-filter-pills">
              {[
                { key: 'ALL', label: `All (${rows.length})` },
                {
                  key: 'PENDING_APPROVAL',
                  label: `Pending Approval (${rows.filter((r) => r.status === 'PENDING_APPROVAL').length})`,
                },
                {
                  key: 'ACTIVE_VISITS',
                  label: `Active Visits (${
                    rows.filter((r) => ['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(r.status)).length
                  })`,
                },
                {
                  key: 'APPROVED',
                  label: `Approved (${rows.filter((r) => r.status === 'APPROVED').length})`,
                },
                {
                  key: 'COMPLETED',
                  label: `Completed (${rows.filter((r) => r.status === 'COMPLETED').length})`,
                },
              ].map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  className={`fa-filter-pill ${statusFilter === pill.key ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter(pill.key);
                    setCurrentPage(1);
                  }}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search & Status Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: '240px', flex: 1 }}>
              <Search
                size={16}
                color="var(--color-text-secondary)"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                className="petty-cash-input"
                style={{ width: '100%', paddingLeft: '36px', height: '38px' }}
                placeholder="Search employee, trip #, purpose, city..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <select
              className="petty-cash-select"
              style={{ height: '38px' }}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="AMOUNT_DISTRIBUTED">Amount Distributed</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CORRECTION_REQUESTED">Correction Requested</option>
              <option value="REJECTED">Rejected</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <Loader2 size={24} className="fa-spin" style={{ margin: '0 auto 10px', display: 'block' }} />
            Loading Field Allowance records...
          </div>
        ) : (
          <>
            {/* Desktop Table (Petty Cash Table Design) */}
            <div className="petty-cash-table-wrapper fa-desktop-table">
              <table className="petty-cash-table">
                <thead>
                  <tr>
                    <th>Trip #</th>
                    {(isManagement || isAccountsUser) && <th>Employee</th>}
                    <th>Purpose & Destination</th>
                    <th>Trip Dates</th>
                    <th style={{ textAlign: 'right' }}>Requested (₹)</th>
                    <th style={{ textAlign: 'right' }}>Allocated (₹)</th>
                    <th style={{ textAlign: 'right' }}>Spent (₹)</th>
                    <th style={{ textAlign: 'right' }}>Balance (₹)</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isManagement || isAccountsUser ? 10 : 9}
                        style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)' }}
                      >
                        No field allowance records found matching the selected filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0F172A' }}>
                          {row.trip_code}
                        </td>

                        {(isManagement || isAccountsUser) && (
                          <td>
                            <div style={{ fontWeight: 700, color: '#0F172A' }}>{row.employee_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                              {row.employee_id} • {row.department_name || 'Operations'}
                            </div>
                          </td>
                        )}

                        <td style={{ maxWidth: '240px' }}>
                          <div style={{ fontWeight: 650, color: '#1E293B' }}>{row.purpose}</div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--color-text-secondary)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              marginTop: '2px',
                            }}
                          >
                            <MapPin size={12} color="#0E7490" />
                            <span>
                              {row.destination}
                              {row.customer_site_name ? ` (${row.customer_site_name})` : ''}
                            </span>
                          </div>
                        </td>

                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.82rem' }}>
                            {formatDateDDMMYYYY(row.start_date)}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                            to {formatDateDDMMYYYY(row.end_date)}
                            {row.travel_mode ? ` • ${row.travel_mode}` : ''}
                          </div>
                        </td>

                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#334155' }}>
                          {row.advance_required ? formatInr(row.requested_amount) : 'No Advance'}
                        </td>

                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#0E7490' }}>
                          {formatInr(row.allocated_amount)}
                        </td>

                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>
                          {formatInr(row.total_spent)}
                        </td>

                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 800,
                            color: row.balance < 0 ? '#DC2626' : '#15803D',
                          }}
                        >
                          {formatInr(row.balance)}
                        </td>

                        <td>
                          <span className={`status-pill ${getStatusPillClass(row.status)}`}>
                            {STATUS_LABELS[row.status]}
                          </span>
                        </td>

                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {isManagement && row.status === 'PENDING_APPROVAL' ? (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() => openDetailModal(row)}
                              disabled={busy}
                            >
                              Review & Decide
                            </button>
                          ) : isAccountsUser && row.status === 'APPROVED' && row.advance_required ? (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() => openDetailModal(row)}
                              disabled={busy}
                            >
                              Distribute Cash
                            </button>
                          ) : !isManagement &&
                            !isAccountsUser &&
                            ['DRAFT', 'CORRECTION_REQUESTED'].includes(row.status) ? (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() => openEditModal(row)}
                              disabled={busy}
                            >
                              Edit & Submit
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => openDetailModal(row)}
                              disabled={busy}
                            >
                              <Eye size={13} /> View Details
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (<= 768px) */}
            <div className="fa-mobile-cards">
              {paginatedRows.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: '#94A3B8',
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  No field allowance records found.
                </div>
              ) : (
                paginatedRows.map((row) => (
                  <div key={row.id} className="fa-mobile-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700, color: '#0E7490' }}>
                          {row.trip_code}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0F172A', marginTop: '2px' }}>
                          {row.purpose}
                        </div>
                        {(isManagement || isAccountsUser) && (
                          <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>
                            {row.employee_name} ({row.employee_id}) • {row.department_name || 'Operations'}
                          </div>
                        )}
                      </div>
                      <span className={`status-pill ${getStatusPillClass(row.status)}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '10px',
                        fontSize: '0.78rem',
                        color: '#475569',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={13} color="#0E7490" /> {row.destination}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CalendarDays size={13} color="#64748B" /> {formatDateDDMMYYYY(row.start_date)} –{' '}
                        {formatDateDDMMYYYY(row.end_date)}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px',
                        padding: '10px',
                        background: '#F8FAFC',
                        borderRadius: '10px',
                        border: '1px solid #F1F5F9',
                        fontSize: '0.75rem',
                      }}
                    >
                      <div>
                        <div style={{ color: '#64748B' }}>Allocated</div>
                        <div style={{ fontWeight: 800, color: '#0E7490', marginTop: '2px' }}>
                          {formatInr(row.allocated_amount)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#64748B' }}>Spent</div>
                        <div style={{ fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
                          {formatInr(row.total_spent)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#64748B' }}>Balance</div>
                        <div
                          style={{
                            fontWeight: 800,
                            color: row.balance < 0 ? '#DC2626' : '#15803D',
                            marginTop: '2px',
                          }}
                        >
                          {formatInr(row.balance)}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={
                        isManagement && row.status === 'PENDING_APPROVAL' ? 'btn-primary' : 'btn-secondary'
                      }
                      style={{ width: '100%' }}
                      onClick={() => openDetailModal(row)}
                    >
                      {isManagement && row.status === 'PENDING_APPROVAL' ? 'Review & Decide' : 'View Trip Details'}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Standardized Pagination Footer */}
            <StandardTablePagination
              currentPage={currentPage}
              totalEntries={filteredRows.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
              pageSizeOptions={[5, 10]}
            />
          </>
        )}
      </div>

      {/* Modal 1: Create / Edit Field Allowance Request Modal (Petty Cash Modal Style) */}
      {isRequestModalOpen && (
        <FieldAllowanceRequestModal
          user={currentUser}
          initial={editingDetail}
          busy={busy}
          onClose={() => {
            setIsRequestModalOpen(false);
            setEditingDetail(null);
          }}
          onSave={async (payload) => {
            setBusy(true);
            try {
              if (editingDetail) {
                await fieldAllowanceService.update(editingDetail.id, payload);
              } else {
                await fieldAllowanceService.create(payload);
              }
              showToast('success', payload.submit ? 'Field Allowance request submitted for approval.' : 'Draft saved.');
              setIsRequestModalOpen(false);
              setEditingDetail(null);
              await refresh();
            } catch (err) {
              showToast('error', err instanceof Error ? err.message : 'Unable to save request.');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {/* Modal 2: Review, Approve, Distribute & Daily Expenses Modal (Petty Cash Modal Style) */}
      {selectedDetail && (
        <FieldAllowanceDetailModal
          detail={selectedDetail}
          isManagement={isManagement}
          isAccounts={isAccountsUser}
          busy={busy}
          onClose={() => setSelectedDetail(null)}
          onEdit={() => openEditModal(selectedDetail)}
          onViewProof={(url, title) => setProofViewer({ isOpen: true, url, title })}
          onActionSuccess={async (message) => {
            try {
              setBusy(true);
              const fresh = await fieldAllowanceService.detail(selectedDetail.id);
              setSelectedDetail(fresh);
              await refresh();
              showToast('success', message);
            } catch (err) {
              showToast('error', err instanceof Error ? err.message : 'Unable to refresh trip details.');
            } finally {
              setBusy(false);
            }
          }}
          onActionError={(msg) => showToast('error', msg)}
        />
      )}

      {/* Modal 3: Bill / Proof Viewer Modal */}
      <ProofViewerModal
        isOpen={proofViewer.isOpen}
        onClose={() => setProofViewer({ isOpen: false, url: '', title: '' })}
        title={proofViewer.title}
        fileUrl={proofViewer.url}
      />
    </div>
  );
};

// ============================================================================
// MODAL 1: NEW / EDIT FIELD ALLOWANCE REQUEST MODAL
// ============================================================================
interface FieldAllowanceRequestModalProps {
  user: any;
  initial?: FieldAllowanceDetail | null;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: FieldAllowanceRequestPayload) => void;
}

const FieldAllowanceRequestModal: React.FC<FieldAllowanceRequestModalProps> = ({
  user,
  initial,
  busy,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState({
    purpose: initial?.purpose || '',
    customerSiteName: initial?.customer_site_name || '',
    destination: initial?.destination || '',
    startDate: initial?.start_date || todayIso(),
    endDate: initial?.end_date || todayIso(),
    travelMode: initial?.travel_mode || '',
    description: initial?.description || '',
    advanceRequired: initial?.advance_required ?? true,
    requestedAmount: initial?.advance_required ? String(initial.requested_amount) : '',
  });
  const [validationError, setValidationError] = useState<string>('');

  const updateField = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (shouldSubmit: boolean) => {
    if (!form.purpose.trim() || !form.destination.trim() || !form.startDate || !form.endDate) {
      setValidationError('Please complete Purpose, Destination, Start Date, and End Date.');
      return;
    }
    if (form.endDate < form.startDate) {
      setValidationError('End date cannot be earlier than Start date.');
      return;
    }
    const amount = form.advanceRequired ? Number(form.requestedAmount) : 0;
    if (amount < 0 || (form.advanceRequired && (isNaN(amount) || amount <= 0))) {
      setValidationError('Please enter a valid positive requested advance amount.');
      return;
    }
    setValidationError('');
    onSave({ ...form, requestedAmount: amount, submit: shouldSubmit });
  };

  return (
    <div className="petty-cash-modal-overlay" onClick={onClose}>
      <div className="petty-cash-modal" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <WalletCards size={20} color="var(--color-primary-blue)" />
            {initial ? `Update Field Allowance — ${initial.trip_code}` : 'Request Field Allowance'}
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {validationError && (
            <div
              style={{
                background: '#FEE2E2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '0.84rem',
                marginBottom: '16px',
              }}
            >
              {validationError}
            </div>
          )}

          {/* Employee Context Strip */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '12px 16px',
              marginBottom: '18px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              fontSize: '0.8rem',
            }}
          >
            <div>
              <div style={{ color: '#64748B', fontSize: '0.7rem', fontWeight: 600 }}>EMPLOYEE</div>
              <div style={{ fontWeight: 700, color: '#0F172A' }}>{user.name}</div>
            </div>
            <div>
              <div style={{ color: '#64748B', fontSize: '0.7rem', fontWeight: 600 }}>EMPLOYEE ID</div>
              <div style={{ fontWeight: 700, color: '#0F172A' }}>{user.employeeId || '—'}</div>
            </div>
            <div>
              <div style={{ color: '#64748B', fontSize: '0.7rem', fontWeight: 600 }}>DEPARTMENT</div>
              <div style={{ fontWeight: 700, color: '#0F172A' }}>{user.department || 'Operations'}</div>
            </div>
          </div>

          <div className="form-group">
            <label>
              Visit Purpose <span className="required">*</span>
            </label>
            <input
              type="text"
              className="petty-cash-input"
              style={{ width: '100%' }}
              maxLength={200}
              value={form.purpose}
              onChange={(e) => updateField('purpose', e.target.value)}
              placeholder="e.g. Client site inspection & project discussion"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>
                Work Location / Destination <span className="required">*</span>
              </label>
              <input
                type="text"
                className="petty-cash-input"
                style={{ width: '100%' }}
                value={form.destination}
                onChange={(e) => updateField('destination', e.target.value)}
                placeholder="e.g. Chennai / Bengaluru"
              />
            </div>

            <div className="form-group">
              <label>Customer / Site Name</label>
              <input
                type="text"
                className="petty-cash-input"
                style={{ width: '100%' }}
                value={form.customerSiteName}
                onChange={(e) => updateField('customerSiteName', e.target.value)}
                placeholder="Optional client or site name"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>
                Start Date <span className="required">*</span>
              </label>
              <input
                type="date"
                className="petty-cash-input"
                style={{ width: '100%' }}
                value={form.startDate}
                onChange={(e) => updateField('startDate', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>
                End Date <span className="required">*</span>
              </label>
              <input
                type="date"
                min={form.startDate}
                className="petty-cash-input"
                style={{ width: '100%' }}
                value={form.endDate}
                onChange={(e) => updateField('endDate', e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Travel Mode</label>
              <select
                className="petty-cash-select"
                style={{ width: '100%' }}
                value={form.travelMode}
                onChange={(e) => updateField('travelMode', e.target.value)}
              >
                <option value="">Select Travel Mode (Optional)</option>
                <option value="Company Vehicle">Company Vehicle</option>
                <option value="Train">Train</option>
                <option value="Flight">Flight</option>
                <option value="Bus">Bus</option>
                <option value="Cab">Cab</option>
                <option value="Own Vehicle">Own Vehicle</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label>
                Advance Required? <span className="required">*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={form.advanceRequired ? 'btn-primary' : 'btn-secondary'}
                  style={{ flex: 1 }}
                  onClick={() => updateField('advanceRequired', true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={!form.advanceRequired ? 'btn-primary' : 'btn-secondary'}
                  style={{ flex: 1 }}
                  onClick={() => {
                    updateField('advanceRequired', false);
                    updateField('requestedAmount', '');
                  }}
                >
                  No
                </button>
              </div>
            </div>
          </div>

          {form.advanceRequired && (
            <div className="form-group">
              <label>
                Requested Advance Amount (₹) <span className="required">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                className="petty-cash-input"
                style={{ width: '100%', fontSize: '1.05rem', fontWeight: 700 }}
                value={form.requestedAmount}
                onChange={(e) => updateField('requestedAmount', e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Description / Operational Remarks</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Add any visit notes, accommodation details, or client instructions..."
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => handleSubmit(false)}
            disabled={busy}
          >
            Save Draft
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleSubmit(true)}
            disabled={busy}
          >
            <Send size={15} /> {busy ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MODAL 2: UNIFIED TRIP REVIEW, APPROVAL, DISTRIBUTION & DAILY EXPENSES MODAL
// ============================================================================
interface FieldAllowanceDetailModalProps {
  detail: FieldAllowanceDetail;
  isManagement: boolean;
  isAccounts: boolean;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onViewProof: (url: string, title: string) => void;
  onActionSuccess: (message: string) => Promise<void>;
  onActionError: (message: string) => void;
}

const FieldAllowanceDetailModal: React.FC<FieldAllowanceDetailModalProps> = ({
  detail,
  isManagement,
  isAccounts,
  busy,
  onClose,
  onEdit,
  onViewProof,
  onActionSuccess,
  onActionError,
}) => {
  const [approvedAmount, setApprovedAmount] = useState<string>(String(detail.requested_amount || 0));
  const [decisionRemarks, setDecisionRemarks] = useState<string>('');
  const [distribution, setDistribution] = useState({
    distributedAmount: String(detail.approved_amount || detail.requested_amount || 0),
    distributionDate: todayIso(),
    paymentMethod: 'Bank Transfer',
    referenceNumber: '',
    paymentProofPath: '',
    remarks: '',
  });
  const [expense, setExpense] = useState({
    expenseDate:
      todayIso() >= detail.start_date && todayIso() <= detail.end_date ? todayIso() : detail.start_date,
    category: 'TRAVEL',
    amount: '',
    description: '',
    attachmentPath: '',
    fileName: '',
  });
  const [localBusy, setLocalBusy] = useState<boolean>(false);

  useEffect(() => {
    setApprovedAmount(String(detail.requested_amount || 0));
    setDecisionRemarks('');
    setDistribution((prev) => ({
      ...prev,
      distributedAmount: String(detail.approved_amount || detail.requested_amount || 0),
    }));
  }, [detail.id, detail.requested_amount, detail.approved_amount]);

  const isWorking = busy || localBusy;

  const canAddExpense =
    !isManagement &&
    !isAccounts &&
    (['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(detail.status) ||
      (!detail.advance_required && detail.status === 'APPROVED'));

  const handleDecision = async (decision: FieldAllowanceDecision) => {
    if (decision !== 'APPROVED' && !decisionRemarks.trim()) {
      onActionError('Please enter remarks explaining why the request was rejected or requires correction.');
      return;
    }
    const numApproved = decision === 'APPROVED' ? Number(approvedAmount || 0) : 0;
    if (decision === 'APPROVED' && detail.advance_required && (isNaN(numApproved) || numApproved < 0)) {
      onActionError('Please enter a valid approved amount.');
      return;
    }
    try {
      setLocalBusy(true);
      await fieldAllowanceService.decide(detail.id, {
        decision,
        approvedAmount: numApproved,
        remarks:
          decisionRemarks.trim() ||
          (decision === 'APPROVED' ? 'Approved by Management' : 'Updated by Management'),
      });
      await onActionSuccess(
        decision === 'APPROVED'
          ? `Request ${detail.trip_code} approved.`
          : decision === 'CORRECTION_REQUESTED'
          ? `Correction requested for ${detail.trip_code}.`
          : `Request ${detail.trip_code} rejected.`
      );
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to record approval decision.');
    } finally {
      setLocalBusy(false);
    }
  };

  const handleDistribute = async () => {
    const numDist = Number(distribution.distributedAmount);
    if (isNaN(numDist) || numDist <= 0) {
      onActionError('Please enter a valid positive amount to distribute.');
      return;
    }
    if (distribution.paymentMethod !== 'Cash' && !distribution.paymentProofPath) {
      onActionError('Please attach payment proof for non-cash distributions (Bank Transfer / UPI / Cheque).');
      return;
    }
    try {
      setLocalBusy(true);
      await fieldAllowanceService.distribute(detail.id, {
        ...distribution,
        distributedAmount: numDist,
      });
      await onActionSuccess(`Advance of ${formatInr(numDist)} distributed for ${detail.trip_code}.`);
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to record advance distribution.');
    } finally {
      setLocalBusy(false);
    }
  };

  const handleAddDailyExpense = async () => {
    const numAmt = Number(expense.amount);
    if (isNaN(numAmt) || numAmt <= 0 || !expense.description.trim()) {
      onActionError('Please enter a valid expense amount and description.');
      return;
    }
    try {
      setLocalBusy(true);
      await fieldAllowanceService.addDailyReport(detail.id, {
        expenseDate: expense.expenseDate,
        category: expense.category,
        amount: numAmt,
        description: expense.description.trim(),
        attachmentPath: expense.attachmentPath || undefined,
      });
      setExpense((prev) => ({ ...prev, amount: '', description: '', attachmentPath: '', fileName: '' }));
      await onActionSuccess('Daily expense added successfully.');
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to add daily expense.');
    } finally {
      setLocalBusy(false);
    }
  };

  const handleCompleteVisit = async () => {
    try {
      setLocalBusy(true);
      await fieldAllowanceService.complete(detail.id);
      await onActionSuccess(`Field visit ${detail.trip_code} marked as Completed.`);
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to complete field visit.');
    } finally {
      setLocalBusy(false);
    }
  };

  const handleFileRead = (
    file: File | undefined,
    onLoaded: (dataUrl: string, name: string) => void
  ) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      onActionError('Proof file must be 2 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onLoaded(String(reader.result || ''), file.name);
    reader.readAsDataURL(file);
  };

  return (
    <div className="petty-cash-modal-overlay" onClick={onClose}>
      <div className="petty-cash-modal" style={{ maxWidth: '760px' }} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h3 className="modal-title">
              <WalletCards size={20} color="var(--color-primary-blue)" />
              {detail.trip_code} — {detail.purpose}
            </h3>
            <span className={`status-pill ${getStatusPillClass(detail.status)}`}>
              {STATUS_LABELS[detail.status]}
            </span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Workflow Stepper */}
          <div className="fa-workflow-steps">
            <span className="fa-workflow-step done">
              <span className="fa-step-dot">✓</span> 1. Requested
            </span>
            <span
              className={`fa-workflow-step ${
                !['DRAFT', 'PENDING_APPROVAL', 'CORRECTION_REQUESTED', 'REJECTED'].includes(detail.status)
                  ? 'done'
                  : ''
              }`}
            >
              <span className="fa-step-dot">2</span> Approval
            </span>
            <span className={`fa-workflow-step ${detail.allocated_amount > 0 ? 'done' : ''}`}>
              <span className="fa-step-dot">3</span> Distributed
            </span>
            <span
              className={`fa-workflow-step ${
                ['IN_PROGRESS', 'COMPLETED'].includes(detail.status) || detail.daily_reports.length > 0 ? 'done' : ''
              }`}
            >
              <span className="fa-step-dot">4</span> Daily Expenses ({detail.daily_reports.length})
            </span>
            <span className={`fa-workflow-step ${detail.status === 'COMPLETED' ? 'done' : ''}`}>
              <span className="fa-step-dot">5</span> Completed
            </span>
          </div>

          {/* Trip & Financial Overview Box (Petty Cash CeoApprovalModal Style) */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '18px',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '12px',
                paddingBottom: '14px',
                borderBottom: '1px solid #E2E8F0',
                marginBottom: '14px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>EMPLOYEE</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                  {detail.employee_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  {detail.employee_id} • {detail.department_name || 'Operations'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>DESTINATION & SITE</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                  {detail.destination}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  {detail.customer_site_name || 'Standard Field Visit'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>TRIP DATES & MODE</div>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                  {formatDateDDMMYYYY(detail.start_date)} – {formatDateDDMMYYYY(detail.end_date)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Mode: {detail.travel_mode || 'Not specified'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>REQUESTED ADVANCE</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                  {detail.advance_required ? formatInr(detail.requested_amount) : 'No Advance'}
                </div>
                {detail.approved_amount > 0 && (
                  <div style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 600 }}>
                    Approved: {formatInr(detail.approved_amount)}
                  </div>
                )}
              </div>
            </div>

            {/* 3 Financial Metrics Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ background: '#FFFFFF', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>ALLOCATED AMOUNT</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0E7490', marginTop: '2px' }}>
                  {formatInr(detail.allocated_amount)}
                </div>
              </div>
              <div style={{ background: '#FFFFFF', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>SPENT AMOUNT</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
                  {formatInr(detail.total_spent)}
                </div>
              </div>
              <div style={{ background: '#FFFFFF', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>CURRENT BALANCE</div>
                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    color: detail.balance < 0 ? '#DC2626' : '#15803D',
                    marginTop: '2px',
                  }}
                >
                  {formatInr(detail.balance)}
                </div>
              </div>
            </div>

            {detail.description && (
              <div style={{ marginTop: '12px', fontSize: '0.82rem', color: '#475569' }}>
                <strong>Remarks:</strong> {detail.description}
              </div>
            )}
          </div>

          {/* 1. MANAGEMENT APPROVAL DECISION SECTION (Petty Cash CeoApprovalModal Style) */}
          {isManagement && detail.status === 'PENDING_APPROVAL' && (
            <div
              style={{
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '18px',
              }}
            >
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 800, color: '#92400E' }}>
                Review & Approval Decision
              </h4>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Approved Advance Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="petty-cash-input"
                    style={{ width: '100%', fontWeight: 700, fontSize: '1rem' }}
                    value={approvedAmount}
                    onChange={(e) => setApprovedAmount(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Approval / Rejection Remarks</label>
                  <input
                    type="text"
                    className="petty-cash-input"
                    style={{ width: '100%' }}
                    placeholder="Add remarks (required for Reject / Correction)"
                    value={decisionRemarks}
                    onChange={(e) => setDecisionRemarks(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  disabled={isWorking}
                  onClick={() => handleDecision('REJECTED')}
                >
                  <XCircle size={14} /> Reject Request
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={isWorking}
                  onClick={() => handleDecision('CORRECTION_REQUESTED')}
                >
                  Request Correction
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={isWorking}
                  onClick={() => handleDecision('APPROVED')}
                >
                  <CheckCircle2 size={14} /> Approve Request
                </button>
              </div>
            </div>
          )}

          {/* 2. ACCOUNTS ADVANCE DISTRIBUTION SECTION */}
          {isAccounts && detail.status === 'APPROVED' && detail.advance_required && (
            <div
              style={{
                background: '#ECFEFF',
                border: '1px solid #A5F3FC',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '18px',
              }}
            >
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 800, color: '#0E7490' }}>
                Distribute Approved Advance ({formatInr(detail.approved_amount)})
              </h4>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Amount Distributed (₹) *</label>
                  <input
                    type="number"
                    min="0.01"
                    max={detail.approved_amount}
                    className="petty-cash-input"
                    style={{ width: '100%', fontWeight: 700 }}
                    value={distribution.distributedAmount}
                    onChange={(e) => setDistribution({ ...distribution, distributedAmount: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Distribution Date *</label>
                  <input
                    type="date"
                    className="petty-cash-input"
                    style={{ width: '100%' }}
                    value={distribution.distributionDate}
                    onChange={(e) => setDistribution({ ...distribution, distributionDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Payment Method *</label>
                  <select
                    className="petty-cash-select"
                    style={{ width: '100%' }}
                    value={distribution.paymentMethod}
                    onChange={(e) => setDistribution({ ...distribution, paymentMethod: e.target.value })}
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Reference / UTR Number</label>
                  <input
                    type="text"
                    className="petty-cash-input"
                    style={{ width: '100%' }}
                    placeholder="UTR / UPI Ref"
                    value={distribution.referenceNumber}
                    onChange={(e) => setDistribution({ ...distribution, referenceNumber: e.target.value })}
                  />
                </div>
              </div>
              {distribution.paymentMethod !== 'Cash' && (
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Payment Proof (Required for non-cash) *</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="petty-cash-input"
                    style={{ width: '100%', padding: '6px' }}
                    onChange={(e) =>
                      handleFileRead(e.target.files?.[0], (url) =>
                        setDistribution((prev) => ({ ...prev, paymentProofPath: url }))
                      )
                    }
                  />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={isWorking}
                  onClick={handleDistribute}
                >
                  <CheckCircle2 size={14} /> Confirm Advance Distribution
                </button>
              </div>
            </div>
          )}

          {/* 3.DAILY EXPENSE REPORTS TABLE */}
          <div style={{ marginBottom: canAddExpense ? '18px' : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>
                Daily Expense Reports ({detail.daily_reports.length})
              </h4>
              <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                Day-wise spending & supporting bills
              </span>
            </div>

            <div className="petty-cash-table-wrapper" style={{ marginBottom: 0 }}>
              <table className="petty-cash-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                    <th style={{ textAlign: 'center' }}>Bill / Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.daily_reports.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#94A3B8' }}>
                        No daily expenses logged for this trip yet.
                      </td>
                    </tr>
                  ) : (
                    detail.daily_reports.map((item) => (
                      <tr key={item.id}>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {formatDateDDMMYYYY(item.expense_date)}
                        </td>
                        <td>
                          <span className="status-pill neutral">{item.category}</span>
                        </td>
                        <td>{item.description}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                          {formatInr(item.amount)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {item.attachment_path ? (
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() =>
                                onViewProof(item.attachment_path!, `${item.category} Expense Proof`)
                              }
                            >
                              <FileText size={12} /> View Proof
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.76rem', color: '#94A3B8' }}>No Bill</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. ADD DAILY EXPENSE FORM (For Employee during Active Visit) */}
          {canAddExpense && (
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', fontWeight: 700, color: '#0F172A' }}>
                Add Daily Expense Entry
              </h4>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Expense Date *</label>
                  <input
                    type="date"
                    min={detail.start_date}
                    max={detail.end_date}
                    className="petty-cash-input"
                    style={{ width: '100%' }}
                    value={expense.expenseDate}
                    onChange={(e) => setExpense({ ...expense, expenseDate: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Category *</label>
                  <select
                    className="petty-cash-select"
                    style={{ width: '100%' }}
                    value={expense.category}
                    onChange={(e) => setExpense({ ...expense, category: e.target.value })}
                  >
                    <option value="TRAVEL">Travel</option>
                    <option value="FOOD">Food</option>
                    <option value="ROOM">Room / Lodging</option>
                    <option value="BUS">Bus</option>
                    <option value="FUEL">Fuel</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Amount (₹) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="petty-cash-input"
                    style={{ width: '100%', fontWeight: 700 }}
                    placeholder="0.00"
                    value={expense.amount}
                    onChange={(e) => setExpense({ ...expense, amount: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Description / Purpose *</label>
                  <input
                    type="text"
                    className="petty-cash-input"
                    style={{ width: '100%' }}
                    placeholder="What was this expense for?"
                    value={expense.description}
                    onChange={(e) => setExpense({ ...expense, description: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Bill / Receipt Proof (Optional)</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="petty-cash-input"
                    style={{ width: '100%', padding: '6px' }}
                    onChange={(e) =>
                      handleFileRead(e.target.files?.[0], (url, name) =>
                        setExpense((prev) => ({ ...prev, attachmentPath: url, fileName: name }))
                      )
                    }
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={isWorking || !expense.amount || !expense.description.trim()}
                  onClick={handleAddDailyExpense}
                >
                  <Plus size={14} /> Add Expense Entry
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div>
            {!isManagement &&
              !isAccounts &&
              ['DRAFT', 'CORRECTION_REQUESTED'].includes(detail.status) && (
                <button type="button" className="btn-primary btn-sm" onClick={onEdit} disabled={isWorking}>
                  <FileText size={14} /> Edit & Resubmit Request
                </button>
              )}

            {canAddExpense && (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={handleCompleteVisit}
                disabled={isWorking}
              >
                <CheckCircle2 size={14} /> Complete Field Visit
              </button>
            )}
          </div>

          <button type="button" className="btn-secondary" onClick={onClose} disabled={isWorking}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldAllowanceModule;
