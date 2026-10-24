// VRM Enterprise HRMS - CEO Petty Cash Management View
import React, { useState } from 'react';
import {
  UserCheck,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  Layers,
  Search,
  RefreshCw,
  Plus,
  ArrowLeftRight,
} from 'lucide-react';
import type {
  PettyCashAccount,
  PettyCashRequest,
  PettyCashExpense,
  PettyCashLedgerEntry,
} from '../../types/pettyCash';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { pettyCashService } from '../../services/pettyCashService';

interface PettyCashCeoViewProps {
  activeAccount: PettyCashAccount | null;
  requests: PettyCashRequest[];
  expenses: PettyCashExpense[];
  ledger: PettyCashLedgerEntry[];
  onOpenAssignCustodian: () => void;
  onOpenReconcile: () => void;
  onSelectRequestForApproval: (request: PettyCashRequest) => void;
  onViewProof: (url: string, title: string) => void;
  onRefresh: () => void;
}

export const PettyCashCeoView: React.FC<PettyCashCeoViewProps> = ({
  activeAccount,
  requests,
  expenses,
  ledger,
  onOpenAssignCustodian,
  onOpenReconcile,
  onSelectRequestForApproval,
  onViewProof,
  onRefresh,
}) => {
  const [requestFilter, setRequestFilter] = useState<string>('ALL');
  const [expenseSearch, setExpenseSearch] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reversal dialog state
  const [selectedExpenseForReversal, setSelectedExpenseForReversal] = useState<PettyCashExpense | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [reversing, setReversing] = useState<boolean>(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  const pendingRequests = requests.filter((r) => r.status === 'PENDING_CEO_APPROVAL');

  const filteredRequests = requests.filter((r) => {
    if (requestFilter === 'ALL') return true;
    return r.status === requestFilter;
  });

  const filteredExpenses = expenses.filter((exp) => {
    if (!expenseSearch.trim()) return true;
    const q = expenseSearch.toLowerCase();
    return (
      exp.expense_number.toLowerCase().includes(q) ||
      exp.reason.toLowerCase().includes(q) ||
      exp.category_name.toLowerCase().includes(q) ||
      exp.custodian_name.toLowerCase().includes(q)
    );
  });

  const paginatedExpenses = filteredExpenses.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleExecuteReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpenseForReversal || !reversalReason.trim()) {
      setReversalError('A valid audit reason is required for reversing an expense.');
      return;
    }

    try {
      setReversing(true);
      setReversalError(null);
      await pettyCashService.reverseExpense(selectedExpenseForReversal.id, reversalReason.trim());
      setSelectedExpenseForReversal(null);
      setReversalReason('');
      onRefresh();
    } catch (err: any) {
      setReversalError(err.message || 'Failed to reverse expense.');
    } finally {
      setReversing(false);
    }
  };

  const currentBalance = Number(activeAccount?.current_balance || 0);
  const totalReceived = Number(activeAccount?.total_cash_received || 0);
  const totalSpent = Number(activeAccount?.total_spent || 0);
  const isLowBalance =
    activeAccount &&
    currentBalance > 0 &&
    currentBalance <= Number(activeAccount.low_balance_threshold || 1000);

  return (
    <div>
      {/* Low Balance Warning Banner */}
      {isLowBalance && (
        <div className="low-balance-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span>
              <strong>Low Petty Cash Alert:</strong> Current balance (₹{currentBalance.toFixed(2)}) has fallen below the
              threshold (₹{Number(activeAccount.low_balance_threshold).toFixed(2)}). Fund replenishment may be required soon.
            </span>
          </div>
        </div>
      )}

      {/* CEO Executive KPI Cards */}
      <div className="petty-cash-kpi-grid">
        <div className="petty-cash-kpi-card hero-card">
          <div className="kpi-header">
            <span className="kpi-label">AVAILABLE PETTY CASH</span>
            <div className="kpi-icon-pill">
              <Layers size={20} />
            </div>
          </div>
          <div className="kpi-value">
            ₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="kpi-meta">
            Custodian: {activeAccount ? activeAccount.custodian_name : 'No custodian assigned'}
          </div>
        </div>

        <div className="petty-cash-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">PENDING CEO APPROVALS</span>
            <div className="kpi-icon-pill" style={{ color: '#D97706', background: '#FEF3C7' }}>
              <Clock size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: pendingRequests.length > 0 ? '#B45309' : '#1E293B' }}>
            {pendingRequests.length}
          </div>
          <div className="kpi-meta">Awaiting your approval before Accounts disbursement</div>
        </div>

        <div className="petty-cash-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">TOTAL ALLOCATED TO DATE</span>
            <div className="kpi-icon-pill" style={{ color: '#16A34A', background: '#DCFCE7' }}>
              <ShieldCheck size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#15803D' }}>
            ₹{totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="kpi-meta">Cumulative confirmed credits</div>
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
          <div className="kpi-meta">Verified daily operational expenses</div>
        </div>
      </div>

      {/* Custodian Management Card */}
      <div className="petty-cash-section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">
            <UserCheck size={20} color="var(--color-primary-blue)" />
            Petty Cash Custodian Stewardship
          </h3>

          <div style={{ display: 'flex', gap: '10px' }}>
            {activeAccount ? (
              <button className="btn-secondary" onClick={onOpenReconcile}>
                <ArrowLeftRight size={16} /> Reassign with Reconciliation
              </button>
            ) : (
              <button className="btn-primary" onClick={onOpenAssignCustodian}>
                <Plus size={16} /> Assign Petty Cash Custodian
              </button>
            )}
          </div>
        </div>

        {activeAccount ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              padding: '16px',
              background: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                ASSIGNED STEWARD
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {activeAccount.custodian_name}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                Employee ID: {activeAccount.custodian_employee_id} • Assigned on: {formatDateDDMMYYYY(activeAccount.assignment_date)}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span className="status-pill success">ACTIVE STEWARDSHIP</span>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Low Balance Alert: ₹{Number(activeAccount.low_balance_threshold).toFixed(2)}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-secondary)' }}>
            <p style={{ margin: '0 0 12px 0' }}>No employee is currently assigned as Petty Cash Custodian.</p>
            <button className="btn-primary btn-sm" onClick={onOpenAssignCustodian}>
              <Plus size={14} /> Assign Employee
            </button>
          </div>
        )}
      </div>

      {/* Pending CEO Approvals Table */}
      <div className="petty-cash-section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">
            <Clock size={20} color="var(--color-primary-blue)" />
            Petty Cash Fund Requests
            {pendingRequests.length > 0 && <span className="tab-badge">{pendingRequests.length} Pending</span>}
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              className="petty-cash-select"
              style={{ height: '36px' }}
              value={requestFilter}
              onChange={(e) => setRequestFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_CEO_APPROVAL">Pending CEO Approval</option>
              <option value="APPROVED_BY_CEO">Approved by CEO</option>
              <option value="DISBURSED_PENDING_RECEIPT">Disbursed (Pending Receipt)</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED_BY_CEO">Rejected</option>
            </select>
            <button className="btn-secondary btn-sm" onClick={onRefresh} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="petty-cash-table-wrapper">
          <table className="petty-cash-table">
            <thead>
              <tr>
                <th>Request #</th>
                <th>Custodian Employee</th>
                <th>Date</th>
                <th>Purpose</th>
                <th style={{ textAlign: 'right' }}>Requested Amount (₹)</th>
                <th>Proof</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary)' }}>
                    No fund requests found.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{req.request_number}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{req.custodian_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        {req.custodian_employee_id}
                      </div>
                    </td>
                    <td>{req.request_date}</td>
                    <td style={{ maxWidth: '240px' }}>{req.purpose}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>
                      ₹{Number(req.requested_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      {req.supporting_document_url ? (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => onViewProof(req.supporting_document_url!, 'Requisition Proof')}
                        >
                          <FileText size={12} /> View
                        </button>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>None</span>
                      )}
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
                    <td style={{ textAlign: 'center' }}>
                      {req.status === 'PENDING_CEO_APPROVAL' ? (
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => onSelectRequestForApproval(req)}
                        >
                          Review & Decide
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                          {req.ceo_remarks || 'Decided'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Expenses Oversight Table with Authorized Reversals */}
      <div className="petty-cash-section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">
            <TrendingDown size={20} color="var(--color-primary-blue)" />
            Custodian Daily Expenses Audit Log
          </h3>

          <div style={{ position: 'relative', width: '260px' }}>
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
              placeholder="Search expenses, category..."
              className="petty-cash-input"
              style={{ width: '100%', paddingLeft: '32px', height: '36px' }}
              value={expenseSearch}
              onChange={(e) => {
                setExpenseSearch(e.target.value);
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
                <th>Reason / Vendor</th>
                <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                <th>Receipt Proof</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Audit Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary)' }}>
                    No daily expenses recorded yet.
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
                    <td style={{ maxWidth: '240px' }}>{exp.reason}</td>
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
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>No proof</span>
                      )}
                    </td>
                    <td>
                      {exp.is_reversed ? (
                        <span className="status-pill danger" title={exp.reversal_reason}>
                          REVERSED
                        </span>
                      ) : (
                        <span className="status-pill success">VERIFIED</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!exp.is_reversed && (
                        <button
                          className="btn-secondary btn-sm"
                          style={{ color: '#EF4444', borderColor: '#FCA5A5' }}
                          onClick={() => {
                            setSelectedExpenseForReversal(exp);
                            setReversalReason('');
                            setReversalError(null);
                          }}
                        >
                          Reverse & Restore
                        </button>
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

      {/* Authorized Reversal Modal */}
      {selectedExpenseForReversal && (
        <div className="petty-cash-modal-overlay" onClick={() => setSelectedExpenseForReversal(null)}>
          <div className="petty-cash-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#EF4444' }}>
                <AlertTriangle size={20} />
                Authorize Expense Reversal
              </h3>
              <button className="modal-close-btn" onClick={() => setSelectedExpenseForReversal(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteReversal}>
              <div className="modal-body">
                {reversalError && (
                  <div
                    style={{
                      background: '#FEE2E2',
                      border: '1px solid #FCA5A5',
                      color: '#991B1B',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      fontSize: '0.85rem',
                      marginBottom: '16px',
                    }}
                  >
                    {reversalError}
                  </div>
                )}

                <p style={{ margin: '0 0 14px 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  You are reversing expense{' '}
                  <strong>{selectedExpenseForReversal.expense_number}</strong> of{' '}
                  <strong style={{ color: '#B91C1C' }}>
                    ₹{Number(selectedExpenseForReversal.amount).toFixed(2)}
                  </strong>
                  . As per financial audit compliance, this will write an immutable reversal credit entry into the
                  ledger and restore the funds to the custodian balance. Historical entries will remain intact.
                </p>

                <div className="form-group">
                  <label>
                    Mandatory Audit Reversal Reason <span className="required">*</span>
                  </label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="e.g. Duplicate bill submission or erroneous amount entered by custodian..."
                    value={reversalReason}
                    onChange={(e) => setReversalReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSelectedExpenseForReversal(null)}
                  disabled={reversing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={reversing || !reversalReason.trim()}
                >
                  {reversing ? 'Reversing...' : 'Confirm Audited Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
