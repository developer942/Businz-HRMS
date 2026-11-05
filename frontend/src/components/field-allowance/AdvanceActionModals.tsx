import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { FieldVisitAdvance, FieldVisitDetail, ExpenseApprovalStatus } from '../../types/fieldAdvance';
import {
  approveAdvanceApi,
  disburseAdvanceApi,
  reviewSettlementApi,
  reportBalanceReturnApi,
  confirmBalanceReturnApi,
  disburseReimbursementApi,
} from '../../services/fieldAdvanceService';

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 20000,
  background: 'rgba(15, 23, 42, 0.6)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  overflowY: 'auto',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  background: '#FFFFFF',
  borderRadius: '18px',
  border: '1px solid #E2E8F0',
  boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.15)',
  overflow: 'hidden',
  margin: 'auto',
};

const headerStyle: React.CSSProperties = {
  padding: '18px 22px',
  borderBottom: '1px solid #E2E8F0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: '#F8FAFC',
};

const closeBtnStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  border: '1px solid #E2E8F0',
  background: '#FFFFFF',
  color: '#64748B',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1px solid #CBD5E1',
  fontSize: '0.88rem',
  color: '#0F172A',
  background: '#FFFFFF',
  boxSizing: 'border-box',
  outline: 'none',
};

// -------------------------------------------------------------
// 1. CEO / HR ADVANCE APPROVAL MODAL
// -------------------------------------------------------------
export const ApproveAdvanceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  visit: FieldVisitAdvance;
}> = ({ isOpen, onClose, onSuccess, visit }) => {
  const [decision, setDecision] = useState<'Approved' | 'Rejected' | 'Correction Requested'>('Approved');
  const [approvedAmount, setApprovedAmount] = useState<number>(visit.requested_amount);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await approveAdvanceApi(visit.id, {
        decision,
        approved_amount: decision === 'Approved' ? Number(approvedAmount) : null,
        reason: reason.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Approval failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
              Review Field Visit Advance
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748B' }}>
              {visit.request_number} · {visit.destination}
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.8rem', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div style={{ padding: '14px 16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.84rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748B' }}>Employee</span>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>{visit.employee_name} ({visit.employee_code})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748B' }}>Field Visit</span>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>{visit.purpose} · {visit.destination}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #E2E8F0' }}>
              <span style={{ color: '#64748B', fontWeight: 600 }}>Requested Advance</span>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0E7490' }}>
                ₹{Number(visit.requested_amount || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Decision</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(['Approved', 'Correction Requested', 'Rejected'] as const).map((d) => {
                const active = decision === d;
                const activeBg = d === 'Approved' ? '#059669' : d === 'Rejected' ? '#DC2626' : '#D97706';
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDecision(d)}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      border: active ? `1.5px solid ${activeBg}` : '1px solid #CBD5E1',
                      background: active ? activeBg : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#475569',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    {d === 'Correction Requested' ? 'Correction' : d}
                  </button>
                );
              })}
            </div>
          </div>

          {decision === 'Approved' && (
            <div>
              <label style={labelStyle}>Approved Advance Amount (₹)</label>
              <input
                type="number"
                min="1"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(Number(e.target.value))}
                style={{ ...inputStyle, fontWeight: 800, fontSize: '1rem' }}
                required
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>
              Remarks {decision !== 'Approved' && <span style={{ color: '#DC2626' }}>*</span>}
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Approved as per travel policy"
              style={{ ...inputStyle, resize: 'vertical', minHeight: '68px' }}
              required={decision !== 'Approved'}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                background: '#0E7490',
                color: '#FFFFFF',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Saving...' : 'Confirm Decision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 2. ACCOUNTS ADVANCE DISBURSEMENT MODAL
// -------------------------------------------------------------
export const DisburseAdvanceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  visit: FieldVisitAdvance;
}> = ({ isOpen, onClose, onSuccess, visit }) => {
  const [amount, setAmount] = useState<number>(visit.approved_amount || visit.requested_amount);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque'>('Bank Transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await disburseAdvanceApi(visit.id, {
        amount: Number(amount),
        payment_method: paymentMethod,
        payment_reference: paymentReference.trim() || null,
        remarks: remarks.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Disbursement failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
              Disburse Field Advance
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748B' }}>
              {visit.employee_name} · {visit.request_number}
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.8rem', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div style={{ padding: '14px 16px', background: '#ECFEFF', borderRadius: '12px', border: '1px solid #A5F3FC', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.84rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#475569' }}>Payable To</span>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>{visit.employee_name} ({visit.employee_code})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#475569' }}>Approved Advance</span>
              <span style={{ fontWeight: 800, color: '#0E7490' }}>
                ₹{Number(visit.approved_amount || visit.requested_amount || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Disbursement Amount (₹)</label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              style={{ ...inputStyle, fontWeight: 800, fontSize: '1rem' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                style={inputStyle}
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>UTR / Reference #</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="UTR / Ref #"
                style={inputStyle}
                required={paymentMethod !== 'Cash'}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Remarks (Optional)</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Disbursed to salary account"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                background: '#0E7490',
                color: '#FFFFFF',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Processing...' : 'Confirm Disbursement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 3. CEO / HR SETTLEMENT REVIEW MODAL (SIMPLE & CLEAN)
// -------------------------------------------------------------
export const ReviewSettlementModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  detail: FieldVisitDetail;
}> = ({ isOpen, onClose, onSuccess, detail }) => {
  const [decision, setDecision] = useState<'Approved' | 'Correction Requested' | 'Rejected'>('Approved');
  const [approvalReason, setApprovalReason] = useState('');
  const [itemStatuses, setItemStatuses] = useState<
    Record<string, { approval_status: ExpenseApprovalStatus; rejection_reason?: string }>
  >(() => {
    const map: Record<string, { approval_status: ExpenseApprovalStatus; rejection_reason?: string }> = {};
    detail.expenses.forEach((e) => {
      map[e.id] = { approval_status: 'Approved' };
    });
    return map;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalDisbursed = detail.visit.disbursed_amount || 0;
  const eligibleTotal = detail.expenses.reduce((sum, exp) => {
    const status = itemStatuses[exp.id]?.approval_status || 'Approved';
    return status === 'Approved' ? sum + exp.amount : sum;
  }, 0);

  const finalBalance = totalDisbursed - eligibleTotal;

  const handleToggleItem = (id: string, newStatus: ExpenseApprovalStatus) => {
    setItemStatuses((prev) => ({
      ...prev,
      [id]: { ...prev[id], approval_status: newStatus },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const expense_items = detail.expenses.map((e) => {
        const rawStatus = itemStatuses[e.id]?.approval_status;
        const validStatus: 'Approved' | 'Rejected' | 'Correction Requested' =
          rawStatus === 'Rejected' ? 'Rejected' : rawStatus === 'Correction Requested' ? 'Correction Requested' : 'Approved';
        return {
          id: e.id,
          approval_status: validStatus,
          rejection_reason: itemStatuses[e.id]?.rejection_reason || null,
        };
      });

      await reviewSettlementApi(detail.visit.id, {
        decision,
        approval_reason: approvalReason.trim() || null,
        expense_items,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Settlement review failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: '600px' }}>
        <div style={headerStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
              Review Expense Claims
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748B' }}>
              {detail.visit.employee_name} · {detail.visit.purpose} ({detail.visit.destination})
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '82vh', overflowY: 'auto' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.8rem', fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Clean 3-column Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', padding: '14px 16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div>
              <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Allocated</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                ₹{totalDisbursed.toLocaleString('en-IN')}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Approved Spent</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                ₹{eligibleTotal.toLocaleString('en-IN')}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Balance</div>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  marginTop: '2px',
                  color: finalBalance > 0 ? '#059669' : finalBalance < 0 ? '#DC2626' : '#0F172A',
                }}
              >
                {finalBalance > 0
                  ? `+₹${finalBalance.toLocaleString('en-IN')}`
                  : finalBalance < 0
                  ? `−₹${Math.abs(finalBalance).toLocaleString('en-IN')}`
                  : '₹0'}
              </div>
            </div>
          </div>

          {/* Day-wise Expenses List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                Day-wise Expenses ({detail.expenses.length})
              </span>
              <span style={{ fontSize: '0.74rem', color: '#64748B' }}>Approve or reject each item</span>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', maxHeight: '220px', overflowY: 'auto' }}>
              {detail.expenses.map((exp, idx) => {
                const currentStatus = itemStatuses[exp.id]?.approval_status || 'Approved';
                return (
                  <div
                    key={exp.id}
                    style={{
                      padding: '12px 14px',
                      borderBottom: idx < detail.expenses.length - 1 ? '1px solid #F1F5F9' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      background: '#FFFFFF',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0F172A' }}>
                          ₹{Number(exp.amount).toLocaleString('en-IN')}
                        </span>
                        <span style={{ padding: '2px 8px', background: '#F1F5F9', color: '#334155', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                          {exp.category}
                        </span>
                        <span style={{ fontSize: '0.74rem', color: '#64748B' }}>{exp.expense_date}</span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '3px' }}>{exp.description}</div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleToggleItem(exp.id, 'Approved')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          border: currentStatus === 'Approved' ? '1px solid #059669' : '1px solid #E2E8F0',
                          background: currentStatus === 'Approved' ? '#ECFDF5' : '#FFFFFF',
                          color: currentStatus === 'Approved' ? '#047857' : '#64748B',
                          cursor: 'pointer',
                        }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleItem(exp.id, 'Rejected')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          border: currentStatus === 'Rejected' ? '1px solid #DC2626' : '1px solid #E2E8F0',
                          background: currentStatus === 'Rejected' ? '#FEF2F2' : '#FFFFFF',
                          color: currentStatus === 'Rejected' ? '#B91C1C' : '#64748B',
                          cursor: 'pointer',
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overall Decision */}
          <div>
            <label style={labelStyle}>Final Decision</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(['Approved', 'Correction Requested', 'Rejected'] as const).map((d) => {
                const active = decision === d;
                const activeBg = d === 'Approved' ? '#059669' : d === 'Rejected' ? '#DC2626' : '#D97706';
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDecision(d)}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      border: active ? `1.5px solid ${activeBg}` : '1px solid #CBD5E1',
                      background: active ? activeBg : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#475569',
                      cursor: 'pointer',
                    }}
                  >
                    {d === 'Correction Requested' ? 'Correction' : d}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Remarks (Optional)</label>
            <textarea
              rows={2}
              value={approvalReason}
              onChange={(e) => setApprovalReason(e.target.value)}
              placeholder="e.g. Bills verified and approved."
              style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                background: '#0E7490',
                color: '#FFFFFF',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Saving...' : 'Confirm Decision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 4. EMPLOYEE REPORT RETURN MODAL
// -------------------------------------------------------------
export const ReportReturnModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  detail: FieldVisitDetail;
}> = ({ isOpen, onClose, onSuccess, detail }) => {
  const returnDue = detail.settlement?.return_due || 0;
  const alreadyReturned = detail.settlement?.actual_returned || 0;
  const remainingDue = Math.max(0, returnDue - alreadyReturned);

  const [amount, setAmount] = useState<number>(remainingDue);
  const [paymentMethod, setPaymentMethod] = useState<'Cash Handover' | 'Bank Transfer' | 'UPI' | 'Cheque'>('Cash Handover');
  const [paymentReference, setPaymentReference] = useState('');
  const [handoverDate, setHandoverDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await reportBalanceReturnApi(detail.visit.id, {
        employee_reported_amount: Number(amount),
        payment_method: paymentMethod,
        payment_reference: paymentReference.trim() || null,
        handover_date: handoverDate,
        employee_remarks: remarks.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Report return failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
            Return Unused Balance
          </h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.8rem', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div style={{ padding: '14px 16px', background: '#ECFDF5', borderRadius: '12px', border: '1px solid #A7F3D0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.86rem' }}>
            <span style={{ color: '#065F46', fontWeight: 600 }}>Unused Balance to Return</span>
            <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#047857' }}>₹{remainingDue.toLocaleString('en-IN')}</span>
          </div>

          <div>
            <label style={labelStyle}>Return Amount (₹)</label>
            <input
              type="number"
              min="1"
              max={remainingDue}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              style={{ ...inputStyle, fontWeight: 800 }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Return Mode</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)} style={inputStyle}>
                <option value="Cash Handover">Cash Handover</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={handoverDate} onChange={(e) => setHandoverDate(e.target.value)} style={inputStyle} required />
            </div>
          </div>

          {paymentMethod !== 'Cash Handover' && (
            <div>
              <label style={labelStyle}>UTR / Reference #</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="UPI / Bank reference"
                style={inputStyle}
                required
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>Remarks (Optional)</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Returned to Accounts desk"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#0E7490', color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}>
              {loading ? 'Submitting...' : 'Submit Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 5. ACCOUNTS CONFIRM RETURN MODAL
// -------------------------------------------------------------
export const ConfirmReturnModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  returnRecord: any;
}> = ({ isOpen, onClose, onSuccess, returnRecord }) => {
  const [actualAmount, setActualAmount] = useState<number>(returnRecord.employee_reported_amount);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'Confirmed' | 'Partial Receipt' | 'Mismatch Reported'>('Confirmed');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await confirmBalanceReturnApi(returnRecord.id, {
        actual_received_amount: Number(actualAmount),
        receipt_date: receiptDate,
        accounts_remarks: remarks.trim() || null,
        status,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
            Confirm Returned Balance
          </h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.8rem', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div style={{ padding: '14px 16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '0.84rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Reported Return</span>
              <span style={{ fontWeight: 800, color: '#0F172A' }}>₹{Number(returnRecord.employee_reported_amount || 0).toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Method & Date</span>
              <span style={{ fontWeight: 600, color: '#334155' }}>{returnRecord.payment_method} ({returnRecord.handover_date})</span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Actual Received Amount (₹)</label>
            <input type="number" min="1" value={actualAmount} onChange={(e) => setActualAmount(Number(e.target.value))} style={{ ...inputStyle, fontWeight: 800 }} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Receipt Date</label>
              <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={inputStyle}>
                <option value="Confirmed">Confirmed Full</option>
                <option value="Partial Receipt">Partial Receipt</option>
                <option value="Mismatch Reported">Mismatch</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Remarks (Optional)</label>
            <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Received by Accounts" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#059669', color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}>
              {loading ? 'Confirming...' : 'Confirm Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 6. ACCOUNTS DISBURSE REIMBURSEMENT MODAL
// -------------------------------------------------------------
export const DisburseReimbursementModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  detail: FieldVisitDetail;
}> = ({ isOpen, onClose, onSuccess, detail }) => {
  const reimbDue = detail.settlement?.reimbursement_due || 0;
  const alreadyReimbursed = detail.settlement?.actual_reimbursed || 0;
  const remainingDue = Math.max(0, reimbDue - alreadyReimbursed);

  const [amount, setAmount] = useState<number>(remainingDue);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque'>('Bank Transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await disburseReimbursementApi(detail.visit.id, {
        amount: Number(amount),
        payment_method: paymentMethod,
        payment_reference: paymentReference.trim() || null,
        remarks: remarks.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Reimbursement payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
            Pay Expense Reimbursement
          </h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.8rem', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div style={{ padding: '14px 16px', background: '#FEF2F2', borderRadius: '12px', border: '1px solid #FECACA', fontSize: '0.84rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#7F1D1D' }}>Employee</span>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>{detail.visit.employee_name} ({detail.visit.employee_code})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#7F1D1D', fontWeight: 600 }}>Reimbursement Due</span>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: '#DC2626' }}>₹{remainingDue.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Payout Amount (₹)</label>
            <input type="number" min="1" max={remainingDue} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ ...inputStyle, fontWeight: 800 }} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)} style={inputStyle}>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>UTR / Reference #</label>
              <input type="text" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="UTR #" style={inputStyle} required={paymentMethod !== 'Cash'} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Remarks (Optional)</label>
            <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Credited via IMPS" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#0E7490', color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}>
              {loading ? 'Processing...' : 'Pay Reimbursement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
