// VRM Enterprise HRMS - Accounts / Finance Petty Cash Disbursement View
import React, { useState } from 'react';
import {
  CreditCard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  Send,
  Flag,
  ArrowRight,
  TrendingDown,
  Layers,
} from 'lucide-react';
import type {
  PettyCashAccount,
  PettyCashRequest,
  PettyCashDisbursement,
  PettyCashExpense,
} from '../../types/pettyCash';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { pettyCashService } from '../../services/pettyCashService';

interface PettyCashAccountsViewProps {
  activeAccount: PettyCashAccount | null;
  requests: PettyCashRequest[];
  disbursements: PettyCashDisbursement[];
  expenses: PettyCashExpense[];
  onOpenDisburseModal: (request: PettyCashRequest) => void;
  onViewProof: (url: string, title: string) => void;
  onRefresh: () => void;
}

export const PettyCashAccountsView: React.FC<PettyCashAccountsViewProps> = ({
  activeAccount,
  requests,
  disbursements,
  expenses,
  onOpenDisburseModal,
  onViewProof,
  onRefresh,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'DISBURSEMENTS' | 'EXPENSES'>('DISBURSEMENTS');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [flaggingExpense, setFlaggingExpense] = useState<PettyCashExpense | null>(null);
  const [flagNotes, setFlagNotes] = useState<string>('');
  const [submittingFlag, setSubmittingFlag] = useState<boolean>(false);

  // Filter requests that are approved by CEO and awaiting cash disbursement
  const approvedRequestsToDisburse = requests.filter(
    (r) => r.status === 'APPROVED_BY_CEO'
  );

  const pendingReceiptDisbursements = disbursements.filter(
    (d) => d.status === 'PENDING_RECEIPT'
  );

  const completedDisbursements = disbursements.filter(
    (d) => d.status === 'CONFIRMED'
  );

  const handleFlagExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flaggingExpense) return;

    try {
      setSubmittingFlag(true);
      await pettyCashService.flagExpense(flaggingExpense.id, flagNotes.trim());
      setFlaggingExpense(null);
      setFlagNotes('');
      onRefresh();
    } catch (err) {
      console.error('Failed to flag expense:', err);
    } finally {
      setSubmittingFlag(false);
    }
  };

  const currentBalance = Number(activeAccount?.current_balance || 0);
  const totalAllocated = Number(activeAccount?.total_cash_received || 0);
  const totalExpenses = Number(activeAccount?.total_spent || 0);

  return (
    <div>
      {/* Accounts KPI Metrics */}
      <div className="petty-cash-kpi-grid">
        <div className="petty-cash-kpi-card hero-card">
          <div className="kpi-header">
            <span className="kpi-label">ACTIVE PETTY CASH BALANCE</span>
            <div className="kpi-icon-pill">
              <Layers size={20} />
            </div>
          </div>
          <div className="kpi-value">
            ₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="kpi-meta">
            Custodian: {activeAccount ? activeAccount.custodian_name : 'None'}
          </div>
        </div>

        <div className="petty-cash-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">APPROVED FOR DISBURSEMENT</span>
            <div className="kpi-icon-pill" style={{ color: '#0E7490', background: '#CFFAFE' }}>
              <Clock size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: approvedRequestsToDisburse.length > 0 ? '#0E7490' : '#1E293B' }}>
            {approvedRequestsToDisburse.length}
          </div>
          <div className="kpi-meta">CEO approved requests ready to disburse</div>
        </div>

        <div className="petty-cash-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">PENDING EMPLOYEE RECEIPT</span>
            <div className="kpi-icon-pill" style={{ color: '#D97706', background: '#FEF3C7' }}>
              <Send size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: pendingReceiptDisbursements.length > 0 ? '#B45309' : '#1E293B' }}>
            {pendingReceiptDisbursements.length}
          </div>
          <div className="kpi-meta">Cash given; awaiting employee confirmation</div>
        </div>

        <div className="petty-cash-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">TOTAL OPERATIONAL EXPENSES</span>
            <div className="kpi-icon-pill" style={{ color: '#DC2626', background: '#FEE2E2' }}>
              <TrendingDown size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#B91C1C' }}>
            ₹{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="kpi-meta">Vouchered and audited in ledger</div>
        </div>
      </div>

      {/* CEO Approved Requests Waiting for Disbursement */}
      <div className="petty-cash-section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">
            <CreditCard size={20} color="var(--color-primary-blue)" />
            Pending Cash Disbursements (CEO Approved)
            {approvedRequestsToDisburse.length > 0 && (
              <span className="tab-badge" style={{ background: '#DCFCE7', color: '#166534' }}>
                {approvedRequestsToDisburse.length} Ready
              </span>
            )}
          </h3>
        </div>

        <div className="petty-cash-table-wrapper">
          <table className="petty-cash-table">
            <thead>
              <tr>
                <th>Request #</th>
                <th>Custodian Employee</th>
                <th>Approved Date</th>
                <th>Purpose</th>
                <th style={{ textAlign: 'right' }}>Approved Amount (₹)</th>
                <th>CEO Remarks</th>
                <th style={{ textAlign: 'center' }}>Disbursement Action</th>
              </tr>
            </thead>
            <tbody>
              {approvedRequestsToDisburse.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary)' }}>
                    No CEO-approved requests pending cash disbursement.
                  </td>
                </tr>
              ) : (
                approvedRequestsToDisburse.map((req) => (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{req.request_number}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{req.custodian_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        {req.custodian_employee_id}
                      </div>
                    </td>
                    <td>{formatDateDDMMYYYY(req.ceo_action_at || req.updated_at)}</td>
                    <td style={{ maxWidth: '240px' }}>{req.purpose}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#15803D' }}>
                      ₹{Number(req.approved_amount || req.requested_amount).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                      {req.ceo_remarks || 'Approved'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn-primary btn-sm" onClick={() => onOpenDisburseModal(req)}>
                        <CreditCard size={14} /> Record Cash Given
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Secondary Tabs: Disbursements History vs Expenses Oversight */}
      <div className="petty-cash-section-card">
        <div className="section-card-header">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`petty-cash-tab-btn ${activeSubTab === 'DISBURSEMENTS' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('DISBURSEMENTS')}
            >
              Disbursement Log ({disbursements.length})
            </button>
            <button
              className={`petty-cash-tab-btn ${activeSubTab === 'EXPENSES' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('EXPENSES')}
            >
              Daily Expense Review ({expenses.length})
            </button>
          </div>
        </div>

        {activeSubTab === 'DISBURSEMENTS' ? (
          <div className="petty-cash-table-wrapper">
            <table className="petty-cash-table">
              <thead>
                <tr>
                  <th>Disbursement #</th>
                  <th>Date</th>
                  <th>Disbursed By</th>
                  <th>Payment Mode</th>
                  <th>Reference #</th>
                  <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                  <th>Receipt Proof</th>
                  <th>Confirmation Status</th>
                </tr>
              </thead>
              <tbody>
                {disbursements.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary)' }}>
                      No disbursements recorded yet.
                    </td>
                  </tr>
                ) : (
                  disbursements.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{d.disbursement_number}</td>
                      <td>{formatDateDDMMYYYY(d.payment_date)}</td>
                      <td>{d.disbursed_by_name}</td>
                      <td>
                        <span className="status-pill neutral">{d.payment_mode}</span>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{d.payment_reference}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-primary-blue)' }}>
                        ₹{Number(d.disbursed_amount).toFixed(2)}
                      </td>
                      <td>
                        {d.payment_proof_url ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => onViewProof(d.payment_proof_url!, 'Disbursement Voucher')}
                          >
                            <FileText size={12} /> Voucher
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>None</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            d.status === 'CONFIRMED'
                              ? 'success'
                              : d.status === 'DISPUTED'
                              ? 'danger'
                              : 'warning'
                          }`}
                        >
                          {d.status === 'PENDING_RECEIPT'
                            ? 'Awaiting Employee Receipt'
                            : d.status === 'CONFIRMED'
                            ? 'Receipt Confirmed'
                            : 'Disputed Mismatch'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="petty-cash-table-wrapper">
            <table className="petty-cash-table">
              <thead>
                <tr>
                  <th>Expense #</th>
                  <th>Date</th>
                  <th>Custodian</th>
                  <th>Category</th>
                  <th>Reason</th>
                  <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                  <th>Receipt Proof</th>
                  <th>Review Status</th>
                  <th style={{ textAlign: 'center' }}>Review Action</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary)' }}>
                      No expenses submitted yet.
                    </td>
                  </tr>
                ) : (
                  expenses.map((exp) => (
                    <tr key={exp.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{exp.expense_number}</td>
                      <td>{formatDateDDMMYYYY(exp.expense_date)}</td>
                      <td>{exp.custodian_name}</td>
                      <td>
                        <span className="status-pill neutral">{exp.category_name}</span>
                      </td>
                      <td style={{ maxWidth: '240px' }}>{exp.reason}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#B91C1C' }}>
                        ₹{Number(exp.amount).toFixed(2)}
                      </td>
                      <td>
                        {exp.bill_attachment_url ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => onViewProof(exp.bill_attachment_url!, `Expense Bill - ${exp.expense_number}`)}
                          >
                            <FileText size={12} /> View Bill
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>No bill</span>
                        )}
                      </td>
                      <td>
                        {exp.flagged_for_review ? (
                          <span className="status-pill warning" title={exp.review_notes}>
                            FLAGGED
                          </span>
                        ) : exp.is_reversed ? (
                          <span className="status-pill danger">REVERSED</span>
                        ) : (
                          <span className="status-pill success">CLEAR</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {!exp.flagged_for_review && !exp.is_reversed && (
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => {
                              setFlaggingExpense(exp);
                              setFlagNotes('');
                            }}
                          >
                            <Flag size={12} /> Flag for CEO
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Flag Expense Dialog */}
      {flaggingExpense && (
        <div className="petty-cash-modal-overlay" onClick={() => setFlaggingExpense(null)}>
          <div className="petty-cash-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#D97706' }}>
                <Flag size={20} />
                Flag Expense for Investigation
              </h3>
              <button className="modal-close-btn" onClick={() => setFlaggingExpense(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleFlagExpense}>
              <div className="modal-body">
                <p style={{ margin: '0 0 14px 0', fontSize: '0.875rem' }}>
                  Flagging expense <strong>{flaggingExpense.expense_number}</strong> (₹
                  {Number(flaggingExpense.amount).toFixed(2)}) will highlight it on the CEO dashboard for review.
                  Ordinary review does NOT trigger another balance deduction.
                </p>

                <div className="form-group">
                  <label>Discrepancy / Review Notes</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="e.g. GST missing on vendor receipt, or bill amount exceeds standard quote..."
                    value={flagNotes}
                    onChange={(e) => setFlagNotes(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setFlaggingExpense(null)}
                  disabled={submittingFlag}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submittingFlag || !flagNotes.trim()}>
                  {submittingFlag ? 'Flagging...' : 'Confirm Flag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
