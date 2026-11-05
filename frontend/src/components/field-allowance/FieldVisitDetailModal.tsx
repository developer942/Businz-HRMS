import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  ExternalLink,
  Copy,
  CheckCircle2,
  ClipboardCheck,
} from 'lucide-react';
import { FieldVisitDetail, FieldVisitExpense } from '../../types/fieldAdvance';
import { fetchFieldVisitDetail, submitSettlementApi } from '../../services/fieldAdvanceService';
import { DailyExpenseModal } from './DailyExpenseModal';
import {
  ApproveAdvanceModal,
  DisburseAdvanceModal,
  ReviewSettlementModal,
  ReportReturnModal,
  ConfirmReturnModal,
  DisburseReimbursementModal,
} from './AdvanceActionModals';

interface FieldVisitDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  advanceId: string;
  currentUser: any;
  onUpdated: () => void;
}

const formatShortDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export const FieldVisitDetailModal: React.FC<FieldVisitDetailModalProps> = ({
  isOpen,
  onClose,
  advanceId,
  currentUser,
  onUpdated,
}) => {
  const [detail, setDetail] = useState<FieldVisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sub-modals
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FieldVisitExpense | null>(null);
  const [showApproveAdvance, setShowApproveAdvance] = useState(false);
  const [showDisburseAdvance, setShowDisburseAdvance] = useState(false);
  const [showReviewSettlement, setShowReviewSettlement] = useState(false);
  const [showReportReturn, setShowReportReturn] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);
  const [showDisburseReimbursement, setShowDisburseReimbursement] = useState(false);
  const [submittingSettlement, setSubmittingSettlement] = useState(false);

  const isCeo =
    currentUser?.role === 'CEO' ||
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'Director';

  const isHr = Boolean(currentUser?.role?.includes('HR')) && !isCeo;

  const isAccounts =
    currentUser?.role === 'Finance Manager' ||
    currentUser?.role === 'Accountant' ||
    currentUser?.department?.toLowerCase().includes('account') ||
    currentUser?.department?.toLowerCase().includes('finance');

  const isOwnerMatch =
    detail?.visit?.employee_id === currentUser?.employeeId ||
    detail?.visit?.employee_id === currentUser?.id;

  const isEmployeeOwner = !isCeo && isOwnerMatch;

  const isHrClaim =
    isOwnerMatch ||
    Boolean(
      detail?.visit?.department?.toLowerCase().includes('hr') ||
        detail?.visit?.department?.toLowerCase().includes('human resource') ||
        detail?.visit?.department_name?.toLowerCase().includes('hr') ||
        detail?.visit?.department_name?.toLowerCase().includes('human resource')
    );

  const canApproveThisVisit = isCeo || (isHr && !isHrClaim);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFieldVisitDetail(advanceId);
      setDetail(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && advanceId) {
      loadDetail();
    }
  }, [isOpen, advanceId]);

  if (!isOpen) return null;

  const handleActionSuccess = () => {
    loadDetail();
    onUpdated();
  };

  const handleSubmitSettlement = async () => {
    if (!detail) return;
    if (detail.expenses.length === 0) {
      alert('Please add at least one expense before submitting settlement.');
      return;
    }
    if (!window.confirm('Submit this field visit expense report for approval?')) return;

    setSubmittingSettlement(true);
    try {
      await submitSettlementApi(detail.visit.id, null);
      handleActionSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to submit settlement');
    } finally {
      setSubmittingSettlement(false);
    }
  };

  const totalDisbursed = detail?.visit.disbursed_amount || 0;
  const totalExpenses = detail?.expenses.reduce((s, e) => s + Number(e.amount || 0), 0) || 0;
  const balance = totalDisbursed - totalExpenses;

  const handleCopyReport = () => {
    if (!detail) return;
    const lines = [
      `Employee Daily Report — ${detail.visit.employee_name} (${detail.visit.request_number})`,
      `Field Visit: ${detail.visit.purpose} (${detail.visit.destination})`,
      `Allocated Amount: ₹${totalDisbursed.toLocaleString('en-IN')}`,
      `Spent Amount: ₹${totalExpenses.toLocaleString('en-IN')}`,
      `Balance: ${balance > 0 ? `+₹${balance.toLocaleString('en-IN')}` : balance < 0 ? `−₹${Math.abs(balance).toLocaleString('en-IN')}` : '₹0'}`,
      `---`,
      ...detail.expenses.map(
        (e) => `${formatShortDate(e.expense_date)} | ${e.category} | ₹${Number(e.amount).toLocaleString('en-IN')} (${e.description})`
      ),
      `Total Expense: ₹${totalExpenses.toLocaleString('en-IN')}`,
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          background: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 24px 48px -12px rgba(15, 23, 42, 0.22)',
          overflow: 'hidden',
          margin: 'auto',
        }}
      >
        {/* Header matching Image 5: Employee Daily Report */}
        <div
          style={{
            padding: '22px 26px 18px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Employee Daily Report
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#64748B', fontWeight: 500 }}>
              {detail ? `${detail.visit.employee_name} · ${detail.visit.request_number}` : 'Loading...'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '999px',
                background: '#EFF6FF',
                color: '#2563EB',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: '1px solid #BFDBFE',
              }}
            >
              Detail View
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 26px 24px', maxHeight: '78vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748B', fontSize: '0.88rem' }}>
              Loading report details...
            </div>
          ) : error || !detail ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#DC2626', fontSize: '0.88rem' }}>
              {error || 'Could not load field visit details'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Clean Summary Rows (Field Visit, Allocated, Spent, Balance) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.94rem' }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>Field Visit</span>
                  <span style={{ fontWeight: 800, color: '#0F172A' }}>
                    {detail.visit.purpose}
                    {detail.visit.destination ? ` · ${detail.visit.destination}` : ''}
                  </span>
                </div>

                <div style={{ height: '1px', background: '#F1F5F9', margin: '2px 0' }} />

                {detail.visit.requested_amount > 0 && totalDisbursed === 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.92rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Requested Advance</span>
                    <span style={{ fontWeight: 800, color: '#D97706' }}>
                      ₹{Number(detail.visit.requested_amount).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.94rem' }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>Allocated Amount</span>
                  <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}>
                    ₹{totalDisbursed.toLocaleString('en-IN')}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.94rem' }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>Spent Amount</span>
                  <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}>
                    ₹{totalExpenses.toLocaleString('en-IN')}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.94rem' }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>Balance</span>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      color: balance > 0 ? '#059669' : balance < 0 ? '#DC2626' : '#0F172A',
                    }}
                  >
                    {balance > 0
                      ? `+₹${balance.toLocaleString('en-IN')}`
                      : balance < 0
                      ? `−₹${Math.abs(balance).toLocaleString('en-IN')}`
                      : '₹0'}
                  </span>
                </div>
              </div>

              {/* Day-wise Expense Breakdown */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                    Day-wise Expense Breakdown
                  </h3>

                  {isEmployeeOwner &&
                    ['Active', 'Draft', 'Advance Disbursed', 'Settlement Correction Requested'].includes(detail.visit.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingExpense(null);
                          setShowAddExpense(true);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 14px',
                          borderRadius: '10px',
                          border: 'none',
                          background: '#0E7490',
                          color: '#FFFFFF',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={14} />
                        <span>Add Expense</span>
                      </button>
                    )}
                </div>

                {detail.expenses.length === 0 ? (
                  <div
                    style={{
                      padding: '28px 16px',
                      borderRadius: '14px',
                      border: '1px dashed #CBD5E1',
                      background: '#F8FAFC',
                      textAlign: 'center',
                      color: '#64748B',
                      fontSize: '0.84rem',
                    }}
                  >
                    No daily expenses recorded for this visit yet.
                  </div>
                ) : (
                  <div style={{ width: '100%' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '10px 4px', textAlign: 'left', color: '#64748B', fontWeight: 600, fontSize: '0.78rem' }}>
                            Date
                          </th>
                          <th style={{ padding: '10px 8px', textAlign: 'left', color: '#64748B', fontWeight: 600, fontSize: '0.78rem' }}>
                            Expense
                          </th>
                          <th style={{ padding: '10px 4px', textAlign: 'right', color: '#64748B', fontWeight: 600, fontSize: '0.78rem' }}>
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.expenses.map((exp) => (
                          <tr key={exp.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '12px 4px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {formatShortDate(exp.expense_date)}
                            </td>
                            <td style={{ padding: '12px 8px', color: '#0F172A' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700 }}>{exp.category}</span>
                                {exp.description && (
                                  <span style={{ color: '#64748B', fontSize: '0.8rem' }}>· {exp.description}</span>
                                )}
                                {exp.receipt_url && (
                                  <a
                                    href={exp.receipt_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      background: '#ECFDF5',
                                      color: '#059669',
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      textDecoration: 'none',
                                    }}
                                  >
                                    <ExternalLink size={11} />
                                    <span>Bill</span>
                                  </a>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
                              ₹{Number(exp.amount).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: '14px',
                        marginTop: '4px',
                        fontSize: '1rem',
                        fontWeight: 800,
                        color: '#0F172A',
                      }}
                    >
                      <span>Total Expense</span>
                      <span>₹{totalExpenses.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom 2 Full-Width Pill Action Buttons matching Image 5 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '6px' }}>
                {/* Primary Role Action Button */}
                {canApproveThisVisit && detail.visit.status === 'Pending Advance Approval' ? (
                  <button
                    type="button"
                    onClick={() => setShowApproveAdvance(true)}
                    style={{
                      padding: '13px 18px',
                      borderRadius: '999px',
                      border: 'none',
                      background: '#0F172A',
                      color: '#FFFFFF',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <ClipboardCheck size={16} />
                    <span>Review Advance</span>
                  </button>
                ) : canApproveThisVisit && detail.visit.status === 'Settlement Submitted' ? (
                  <button
                    type="button"
                    onClick={() => setShowReviewSettlement(true)}
                    style={{
                      padding: '13px 18px',
                      borderRadius: '999px',
                      border: 'none',
                      background: '#0F172A',
                      color: '#FFFFFF',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <ClipboardCheck size={16} />
                    <span>Review Claims</span>
                  </button>
                ) : isAccounts && detail.visit.status === 'Advance Approved' ? (
                  <button
                    type="button"
                    onClick={() => setShowDisburseAdvance(true)}
                    style={{
                      padding: '13px 18px',
                      borderRadius: '999px',
                      border: 'none',
                      background: '#0E7490',
                      color: '#FFFFFF',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Disburse Advance
                  </button>
                ) : isAccounts && ['Pending Reimbursement', 'Partially Reimbursed'].includes(detail.visit.status) ? (
                  <button
                    type="button"
                    onClick={() => setShowDisburseReimbursement(true)}
                    style={{
                      padding: '13px 18px',
                      borderRadius: '999px',
                      border: 'none',
                      background: '#0E7490',
                      color: '#FFFFFF',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Pay Reimbursement
                  </button>
                ) : isAccounts && detail.balanceReturns.some((r) => r.status === 'Awaiting Confirmation') ? (
                  <button
                    type="button"
                    onClick={() => {
                      const pending = detail.balanceReturns.find((r) => r.status === 'Awaiting Confirmation');
                      setSelectedReturn(pending);
                    }}
                    style={{
                      padding: '13px 18px',
                      borderRadius: '999px',
                      border: 'none',
                      background: '#059669',
                      color: '#FFFFFF',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Confirm Return Receipt
                  </button>
                ) : isEmployeeOwner &&
                  ['Active', 'Draft', 'Advance Disbursed', 'Settlement Correction Requested'].includes(detail.visit.status) &&
                  detail.expenses.length > 0 ? (
                  <button
                    type="button"
                    disabled={submittingSettlement}
                    onClick={handleSubmitSettlement}
                    style={{
                      padding: '13px 18px',
                      borderRadius: '999px',
                      border: 'none',
                      background: '#0E7490',
                      color: '#FFFFFF',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {submittingSettlement ? 'Submitting...' : 'Submit Claim for Approval'}
                  </button>
                ) : isEmployeeOwner && ['Pending Balance Collection', 'Partially Collected'].includes(detail.visit.status) ? (
                  <button
                    type="button"
                    onClick={() => setShowReportReturn(true)}
                    style={{
                      padding: '13px 18px',
                      borderRadius: '999px',
                      border: 'none',
                      background: '#059669',
                      color: '#FFFFFF',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Return Unused Balance
                  </button>
                ) : (
                  <div
                    style={{
                      padding: '13px 18px',
                      borderRadius: '999px',
                      border: '1px solid #E2E8F0',
                      background: '#F8FAFC',
                      color: '#475569',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckCircle2 size={15} style={{ color: '#0E7490' }} />
                    <span>{detail.visit.status}</span>
                  </div>
                )}

                {/* Copy Report Button */}
                <button
                  type="button"
                  onClick={handleCopyReport}
                  style={{
                    padding: '13px 18px',
                    borderRadius: '999px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#0F172A',
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Copy size={15} />
                  <span>{copied ? 'Copied!' : 'Copy Report'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sub Modals */}
        {showAddExpense && detail && (
          <DailyExpenseModal
            isOpen={showAddExpense}
            onClose={() => setShowAddExpense(false)}
            onSaved={handleActionSuccess}
            advanceId={detail.visit.id}
            editingExpense={editingExpense}
          />
        )}

        {showApproveAdvance && detail && (
          <ApproveAdvanceModal
            isOpen={showApproveAdvance}
            onClose={() => setShowApproveAdvance(false)}
            onSuccess={handleActionSuccess}
            visit={detail.visit}
          />
        )}

        {showDisburseAdvance && detail && (
          <DisburseAdvanceModal
            isOpen={showDisburseAdvance}
            onClose={() => setShowDisburseAdvance(false)}
            onSuccess={handleActionSuccess}
            visit={detail.visit}
          />
        )}

        {showReviewSettlement && detail && (
          <ReviewSettlementModal
            isOpen={showReviewSettlement}
            onClose={() => setShowReviewSettlement(false)}
            onSuccess={handleActionSuccess}
            detail={detail}
          />
        )}

        {showReportReturn && detail && (
          <ReportReturnModal
            isOpen={showReportReturn}
            onClose={() => setShowReportReturn(false)}
            onSuccess={handleActionSuccess}
            detail={detail}
          />
        )}

        {selectedReturn && (
          <ConfirmReturnModal
            isOpen={Boolean(selectedReturn)}
            onClose={() => setSelectedReturn(null)}
            onSuccess={handleActionSuccess}
            returnRecord={selectedReturn}
          />
        )}

        {showDisburseReimbursement && detail && (
          <DisburseReimbursementModal
            isOpen={showDisburseReimbursement}
            onClose={() => setShowDisburseReimbursement(false)}
            onSuccess={handleActionSuccess}
            detail={detail}
          />
        )}
      </div>
    </div>
  );
};
