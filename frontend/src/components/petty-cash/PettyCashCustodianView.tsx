// VRM Enterprise HRMS - Assigned Petty Cash Custodian Dashboard View
import React, { useState } from 'react';
import {
  Wallet,
  Send,
  PlusCircle,
  ShieldCheck,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  BellRing,
  ArrowRight,
} from 'lucide-react';
import type {
  PettyCashAccount,
  PettyCashRequest,
  PettyCashDisbursement,
  PettyCashExpense,
  PettyCashLedgerEntry,
} from '../../types/pettyCash';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { StandardTablePagination } from '../common/StandardTablePagination';

interface PettyCashCustodianViewProps {
  activeAccount: PettyCashAccount | null;
  requests: PettyCashRequest[];
  disbursements: PettyCashDisbursement[];
  expenses: PettyCashExpense[];
  ledger: PettyCashLedgerEntry[];
  onOpenRequestModal: () => void;
  onOpenAddExpenseModal: () => void;
  onOpenConfirmReceiptModal: (disbursement: PettyCashDisbursement) => void;
  onViewProof: (url: string, title: string) => void;
  onRefresh: () => void;
}

export const PettyCashCustodianView: React.FC<PettyCashCustodianViewProps> = ({
  activeAccount,
  requests,
  disbursements,
  expenses,
  ledger,
  onOpenRequestModal,
  onOpenAddExpenseModal,
  onOpenConfirmReceiptModal,
  onViewProof,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'EXPENSES' | 'REQUESTS'>('EXPENSES');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const currentBalance = Number(activeAccount?.current_balance || 0);
  const totalReceived = Number(activeAccount?.total_cash_received || 0);
  const totalSpent = Number(activeAccount?.total_spent || 0);
  const lowThreshold = Number(activeAccount?.low_balance_threshold || 1000);
  const isLowBalance = activeAccount && currentBalance <= lowThreshold;

  // Check for disbursements pending receipt confirmation by this custodian
  const pendingReceiptDisbursements = disbursements.filter(
    (d) => d.status === 'PENDING_RECEIPT'
  );

  const pendingRequestsCount = requests.filter(
    (r) => r.status === 'PENDING_CEO_APPROVAL'
  ).length;

  const filteredExpenses = expenses.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.expense_number.toLowerCase().includes(q) ||
      e.category_name.toLowerCase().includes(q) ||
      e.reason.toLowerCase().includes(q)
    );
  });

  const paginatedExpenses = filteredExpenses.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const paginatedRequests = requests.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div>
      {/* Pending Cash Receipt Action Banner */}
      {pendingReceiptDisbursements.length > 0 && (
        <div className="action-prompt-card">
          <div className="action-prompt-left">
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: '#0E7490',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BellRing size={22} />
            </div>
            <div className="action-prompt-text">
              <h4>Accounts Cash Disbursement Ready for Confirmation!</h4>
              <p>
                Accounts has disbursed ₹
                {Number(pendingReceiptDisbursements[0].disbursed_amount).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                })}{' '}
                via {pendingReceiptDisbursements[0].payment_mode} (Ref: {pendingReceiptDisbursements[0].payment_reference}
                ). Please verify physical/bank receipt to credit your available balance.
              </p>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={() => onOpenConfirmReceiptModal(pendingReceiptDisbursements[0])}
          >
            <ShieldCheck size={16} /> Confirm Receipt Now
          </button>
        </div>
      )}

      {/* Low Balance Warning */}
      {isLowBalance && (
        <div className="low-balance-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span>
              <strong>Low Petty Cash Balance:</strong> Available cash (₹{currentBalance.toFixed(2)}) is below your alert
              threshold of ₹{lowThreshold.toFixed(2)}. Consider requesting replenishment.
            </span>
          </div>
          <button className="btn-secondary btn-sm" onClick={onOpenRequestModal}>
            <Send size={12} /> Request Funds
          </button>
        </div>
      )}

      {/* Hero Balance & Custodian Metrics */}
      <div className="petty-cash-kpi-grid">
        <div className="petty-cash-kpi-card hero-card">
          <div className="kpi-header">
            <span className="kpi-label">AVAILABLE PETTY CASH</span>
            <div className="kpi-icon-pill">
              <Wallet size={20} />
            </div>
          </div>
          <div className="kpi-value">
            ₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="kpi-meta">Ready for daily operational expenses</div>
        </div>

        <div className="petty-cash-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">TOTAL CASH RECEIVED</span>
            <div className="kpi-icon-pill" style={{ color: '#16A34A', background: '#DCFCE7' }}>
              <ShieldCheck size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#15803D' }}>
            ₹{totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="kpi-meta">All confirmed disbursements to date</div>
        </div>

        <div className="petty-cash-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">TOTAL SPENT & VOUCHERED</span>
            <div className="kpi-icon-pill" style={{ color: '#DC2626', background: '#FEE2E2' }}>
              <TrendingDown size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#B91C1C' }}>
            ₹{totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="kpi-meta">Recorded daily expenses</div>
        </div>

        <div className="petty-cash-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">PENDING CEO REQUESTS</span>
            <div className="kpi-icon-pill" style={{ color: '#D97706', background: '#FEF3C7' }}>
              <Clock size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: pendingRequestsCount > 0 ? '#B45309' : '#1E293B' }}>
            {pendingRequestsCount}
          </div>
          <div className="kpi-meta">Under CEO review</div>
        </div>
      </div>

      {/* Main Operations Section Card */}
      <div className="petty-cash-section-card">
        <div className="section-card-header">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`petty-cash-tab-btn ${activeTab === 'EXPENSES' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('EXPENSES');
                setCurrentPage(1);
              }}
            >
              Daily Expenses ({expenses.length})
            </button>
            <button
              className={`petty-cash-tab-btn ${activeTab === 'REQUESTS' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('REQUESTS');
                setCurrentPage(1);
              }}
            >
              Fund Requisition History ({requests.length})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn-secondary" onClick={onOpenRequestModal}>
              <Send size={15} /> Request Petty Cash
            </button>
            <button
              className="btn-primary"
              onClick={onOpenAddExpenseModal}
              disabled={currentBalance <= 0}
              title={currentBalance <= 0 ? 'Cannot record expense without available balance' : undefined}
            >
              <PlusCircle size={15} /> Add Daily Expense
            </button>
          </div>
        </div>

        {activeTab === 'EXPENSES' ? (
          <div>
            <div className="section-filters-bar">
              <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-secondary)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search expenses, reason..."
                  className="petty-cash-input"
                  style={{ width: '100%', paddingLeft: '32px', height: '36px' }}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            <div className="petty-cash-table-wrapper">
              <table className="petty-cash-table">
                <thead>
                  <tr>
                    <th>Expense #</th>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Reason / Vendor Description</th>
                    <th>Payment Mode</th>
                    <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                    <th>Bill Proof</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary)' }}>
                        No daily expenses recorded yet. Click <strong>"+ Add Daily Expense"</strong> above to record an expense.
                      </td>
                    </tr>
                  ) : (
                    paginatedExpenses.map((exp) => (
                      <tr key={exp.id}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{exp.expense_number}</td>
                        <td>{formatDateDDMMYYYY(exp.expense_date)}</td>
                        <td>
                          <span className="status-pill neutral">{exp.category_name}</span>
                        </td>
                        <td style={{ maxWidth: '260px' }}>{exp.reason}</td>
                        <td>{exp.payment_mode || 'Cash'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: exp.is_reversed ? '#94A3B8' : '#B91C1C' }}>
                          {exp.is_reversed ? <del>₹{Number(exp.amount).toFixed(2)}</del> : `₹${Number(exp.amount).toFixed(2)}`}
                        </td>
                        <td>
                          {exp.bill_attachment_url ? (
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => onViewProof(exp.bill_attachment_url!, `Expense Proof - ${exp.expense_number}`)}
                            >
                              <FileText size={12} /> View Bill
                            </button>
                          ) : (
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>None</span>
                          )}
                        </td>
                        <td>
                          {exp.is_reversed ? (
                            <span className="status-pill danger" title={exp.reversal_reason}>
                              REVERSED
                            </span>
                          ) : exp.flagged_for_review ? (
                            <span className="status-pill warning" title={exp.review_notes}>
                              FLAGGED FOR REVIEW
                            </span>
                          ) : (
                            <span className="status-pill success">DEDUCTED</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <StandardTablePagination
              currentPage={currentPage}
              totalEntries={filteredExpenses.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setCurrentPage(1);
              }}
              pageSizeOptions={[5, 10]}
            />
          </div>
        ) : (
          <div>
            <div className="petty-cash-table-wrapper">
              <table className="petty-cash-table">
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Date</th>
                    <th>Purpose</th>
                    <th style={{ textAlign: 'right' }}>Requested (₹)</th>
                    <th style={{ textAlign: 'right' }}>Approved (₹)</th>
                    <th>Status</th>
                    <th>CEO Remarks</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary)' }}>
                        No fund requests submitted yet. Click <strong>"Request Petty Cash"</strong> to request replenishment.
                      </td>
                    </tr>
                  ) : (
                    paginatedRequests.map((req) => {
                      const matchingDisbursement = disbursements.find(
                        (d) => d.request_id === req.id && d.status === 'PENDING_RECEIPT'
                      );
                      return (
                        <tr key={req.id}>
                          <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{req.request_number}</td>
                          <td>{req.request_date}</td>
                          <td style={{ maxWidth: '240px' }}>{req.purpose}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            ₹{Number(req.requested_amount).toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#15803D' }}>
                            {req.approved_amount ? `₹${Number(req.approved_amount).toFixed(2)}` : '—'}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${
                                req.status === 'PENDING_CEO_APPROVAL'
                                  ? 'warning'
                                  : req.status === 'APPROVED_BY_CEO'
                                  ? 'info'
                                  : req.status === 'COMPLETED'
                                  ? 'success'
                                  : req.status === 'REJECTED_BY_CEO'
                                  ? 'danger'
                                  : 'neutral'
                              }`}
                            >
                              {req.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            {req.ceo_remarks || '—'}
                          </td>
                          <td>
                            {matchingDisbursement ? (
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => onOpenConfirmReceiptModal(matchingDisbursement)}
                              >
                                Confirm Receipt
                              </button>
                            ) : req.status === 'COMPLETED' ? (
                              <span style={{ fontSize: '0.8rem', color: '#16A34A', fontWeight: 600 }}>
                                <CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                Credited
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <StandardTablePagination
              currentPage={currentPage}
              totalEntries={requests.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setCurrentPage(1);
              }}
              pageSizeOptions={[5, 10]}
            />
          </div>
        )}
      </div>
    </div>
  );
};
