// VRM Enterprise HRMS - Petty Cash Immutable Ledger & Reports View
import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Calendar,
  Layers,
  FileText,
  AlertCircle,
  Download,
} from 'lucide-react';
import { pettyCashService } from '../../services/pettyCashService';
import type { PettyCashLedgerEntry, PettyCashCategory, PettyCashExpense } from '../../types/pettyCash';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { ExportDropdown } from '../common/ExportDropdown';
import { downloadExcel, downloadPDF, downloadCSV, ExportColumn } from '../../utils/exportUtils';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface PettyCashLedgerReportsViewProps {
  onViewProof?: (url: string, name: string) => void;
}

export const PettyCashLedgerReportsView: React.FC<PettyCashLedgerReportsViewProps> = ({ onViewProof }) => {
  const [ledgerEntries, setLedgerEntries] = useState<PettyCashLedgerEntry[]>([]);
  const [expenses, setExpenses] = useState<PettyCashExpense[]>([]);
  const [categories, setCategories] = useState<PettyCashCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Pagination (Strictly [5, 10] per design system)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Selected rows for table design system
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ledger, expList, cats] = await Promise.all([
        pettyCashService.getLedger({
          transactionType: filterType !== 'ALL' ? filterType : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
        pettyCashService.getExpenses(),
        pettyCashService.getCategories(),
      ]);
      setLedgerEntries(ledger);
      setExpenses(expList);
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load ledger entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterType, startDate, endDate]);

  // Client-side search filtering
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return ledgerEntries;
    const q = searchQuery.toLowerCase().trim();
    return ledgerEntries.filter(
      (e) =>
        e.entry_number.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.created_by_name.toLowerCase().includes(q) ||
        e.transaction_type.toLowerCase().includes(q)
    );
  }, [ledgerEntries, searchQuery]);

  // Aggregate totals from immutable ledger entries
  const aggregates = useMemo(() => {
    let totalCredits = 0;
    let totalDebits = 0;
    filteredEntries.forEach((e) => {
      totalCredits += Number(e.credit_amount || 0);
      totalDebits += Number(e.debit_amount || 0);
    });
    const latestBalance = filteredEntries.length > 0 ? filteredEntries[0].running_balance : 0;
    return {
      totalCredits,
      totalDebits,
      netDisbursed: totalCredits - totalDebits,
      latestBalance,
    };
  }, [filteredEntries]);

  // Paginated slice
  const paginatedEntries = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      return filteredEntries;
    }
    const start = (currentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, currentPage, pageSize]);

  // Toggle selection
  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleAll = () => {
    if (selectedIds.length === paginatedEntries.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedEntries.map((e) => e.id));
    }
  };

  // Export handlers
  const exportColumns: ExportColumn[] = [
    { label: 'Entry #', key: 'entry_number' },
    { label: 'Date', key: 'created_at' },
    { label: 'Transaction Type', key: 'transaction_type' },
    { label: 'Description', key: 'description' },
    { label: 'Credit (₹)', key: 'credit_amount' },
    { label: 'Debit (₹)', key: 'debit_amount' },
    { label: 'Running Balance (₹)', key: 'running_balance' },
    { label: 'Logged By', key: 'created_by_name' },
  ];

  const getExportData = (entries: PettyCashLedgerEntry[]) => {
    return entries.map((e) => ({
      ...e,
      created_at: formatDateDDMMYYYY(e.created_at),
      credit_amount: Number(e.credit_amount) > 0 ? Number(e.credit_amount).toFixed(2) : '-',
      debit_amount: Number(e.debit_amount) > 0 ? Number(e.debit_amount).toFixed(2) : '-',
      running_balance: Number(e.running_balance).toFixed(2),
    }));
  };

  const handleExportExcel = () => {
    downloadExcel(getExportData(filteredEntries), 'Petty_Cash_Financial_Ledger', exportColumns);
  };

  const handleExportPDF = () => {
    downloadPDF(
      getExportData(filteredEntries),
      'Petty Cash Financial Ledger Report',
      'Petty_Cash_Financial_Ledger',
      exportColumns
    );
  };

  const handleExportCSV = () => {
    downloadCSV(getExportData(filteredEntries), 'Petty_Cash_Financial_Ledger', exportColumns);
  };

  return (
    <div>
      {/* KPI Cards for Ledger Summary - Standardized to Leave Management System Style */}
      <div className="kpi-grid" style={{ marginBottom: '20px' }}>
        <div 
          className="kpi-card"
          style={{ 
            border: '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            backgroundColor: '#FFFFFF',
            transition: 'all 0.2s ease',
          }}
          title="Server-verified from immutable transaction chain"
        >
          <div className="kpi-card-header">
            <span style={{ fontWeight: 700, color: '#64748B' }}>LEDGER AUDIT BALANCE</span>
            <div className="kpi-icon-wrapper" style={{ color: '#0E7490' }}><Layers size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value" style={{ color: '#0E7490' }}>
              ₹{aggregates.latestBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div 
          className="kpi-card"
          style={{ 
            border: '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            backgroundColor: '#FFFFFF',
            transition: 'all 0.2s ease',
          }}
          title="All cash receipt confirmations to date"
        >
          <div className="kpi-card-header">
            <span style={{ fontWeight: 700, color: '#64748B' }}>TOTAL CONFIRMED CREDITS</span>
            <div className="kpi-icon-wrapper emerald" style={{ color: '#10B981' }}><ArrowDownLeft size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value" style={{ color: '#059669' }}>
              ₹{aggregates.totalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div 
          className="kpi-card"
          style={{ 
            border: '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            backgroundColor: '#FFFFFF',
            transition: 'all 0.2s ease',
          }}
          title="Vouchered daily operational disbursements"
        >
          <div className="kpi-card-header">
            <span style={{ fontWeight: 700, color: '#64748B' }}>TOTAL EXPENSES DEBITED</span>
            <div className="kpi-icon-wrapper rose" style={{ color: '#EF4444' }}><ArrowUpRight size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value" style={{ color: '#DC2626' }}>
              ₹{aggregates.totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="petty-cash-section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">
            <FileSpreadsheet size={20} color="var(--color-primary-blue)" />
            Petty Cash General Ledger
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ExportDropdown
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
              onExportCSV={handleExportCSV}
              label="Export Ledger"
              variant="primary"
            />
          </div>
        </div>

        <div className="section-filters-bar">
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-secondary)',
              }}
            />
            <input
              type="text"
              placeholder="Search entry #, voucher, employee..."
              className="petty-cash-input"
              style={{ width: '100%', paddingLeft: '36px' }}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <select
            className="petty-cash-select"
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="ALL">All Transaction Types</option>
            <option value="CASH_DISBURSEMENT_CREDIT">Disbursement Credits (+)</option>
            <option value="DAILY_EXPENSE_DEBIT">Expense Debits (-)</option>
            <option value="EXPENSE_REVERSAL_CREDIT">Reversals & Corrections</option>
            <option value="RECONCILIATION_TRANSFER">Custodian Handover</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="date"
              className="petty-cash-input"
              style={{ height: '36px' }}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              title="Start Date"
            />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>to</span>
            <input
              type="date"
              className="petty-cash-input"
              style={{ height: '36px' }}
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              title="End Date"
            />
          </div>
        </div>

        {/* Ledger Table */}
        <div className="petty-cash-table-wrapper">
          <table className="petty-cash-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="petty-cash-checkbox"
                    checked={
                      paginatedEntries.length > 0 &&
                      selectedIds.length === paginatedEntries.length
                    }
                    onChange={handleToggleAll}
                  />
                </th>
                <th>Entry #</th>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Credit (₹)</th>
                <th style={{ textAlign: 'right' }}>Debit (₹)</th>
                <th style={{ textAlign: 'right' }}>Running Balance (₹)</th>
                <th>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '32px' }}>
                    Loading financial ledger...
                  </td>
                </tr>
              ) : paginatedEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
                    No ledger transactions found matching the specified criteria.
                  </td>
                </tr>
              ) : (
                paginatedEntries.map((entry) => {
                  const isSelected = selectedIds.includes(entry.id);
                  const isCredit = Number(entry.credit_amount) > 0;
                  return (
                    <tr key={entry.id} className={isSelected ? 'selected' : ''}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          className="petty-cash-checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRow(entry.id)}
                        />
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{entry.entry_number}</td>
                      <td>{formatDateDDMMYYYY(entry.created_at)}</td>
                      <td>
                        <span
                          className={`status-pill ${
                            entry.transaction_type === 'CASH_DISBURSEMENT_CREDIT'
                              ? 'success'
                              : entry.transaction_type === 'DAILY_EXPENSE_DEBIT'
                              ? 'neutral'
                              : 'info'
                          }`}
                        >
                          {entry.transaction_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ maxWidth: '280px' }}>{entry.description}</td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          color: isCredit ? '#15803D' : 'var(--color-text-secondary)',
                        }}
                      >
                        {isCredit ? `+₹${Number(entry.credit_amount).toFixed(2)}` : '—'}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          color: Number(entry.debit_amount) > 0 ? '#B91C1C' : 'var(--color-text-secondary)',
                        }}
                      >
                        {Number(entry.debit_amount) > 0 ? `-₹${Number(entry.debit_amount).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-primary-blue)' }}>
                        ₹{Number(entry.running_balance).toFixed(2)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{entry.created_by_name}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Standardized Pagination Footer (Strictly [5, 10] rows per page) */}
        <StandardTablePagination
          currentPage={currentPage}
          totalEntries={filteredEntries.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
          pageSizeOptions={[5, 10]}
        />
      </div>

      {/* Floating Action Bar */}
      {selectedIds.length > 0 && (
        <div className="petty-cash-floating-action-bar">
          <span>{selectedIds.length} Selected</span>
          <button
            className="floating-action-btn"
            onClick={() => {
              const selectedData = filteredEntries.filter((e) => selectedIds.includes(e.id));
              downloadExcel(getExportData(selectedData), 'Selected_Petty_Cash_Entries', exportColumns);
            }}
          >
            <Download size={14} /> Export Selected
          </button>
          <button className="floating-action-btn" onClick={() => setSelectedIds([])}>
            ✕ Clear
          </button>
        </div>
      )}
    </div>
  );
};
