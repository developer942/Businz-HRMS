import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, AlertCircle, IndianRupee, ArrowRight, ShieldCheck, DollarSign } from 'lucide-react';
import { FieldVisitAdvance, FieldVisitDetail, ExpenseApprovalStatus } from '../../types/fieldAdvance';
import {
  approveAdvanceApi,
  disburseAdvanceApi,
  reviewSettlementApi,
  reportBalanceReturnApi,
  confirmBalanceReturnApi,
  disburseReimbursementApi,
} from '../../services/fieldAdvanceService';

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
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 20000, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflowY: "auto" }}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm">Review Field Visit Advance</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-lg">{error}</div>}
          <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Employee:</span>
              <span className="font-semibold text-slate-800">{visit.employee_name} ({visit.employee_code})</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Purpose:</span>
              <span className="font-semibold text-slate-800">{visit.purpose}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Requested Advance:</span>
              <span className="font-bold text-teal-700">₹{visit.requested_amount.toLocaleString()}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Decision</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Approved', 'Correction Requested', 'Rejected'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDecision(d)}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-lg border text-center transition ${decision === d
                    ? d === 'Approved'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : d === 'Rejected'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-amber-600 text-white border-amber-600'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {decision === 'Approved' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Approved Advance Amount (₹)</label>
              <input
                type="number"
                min="1"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Remarks {decision !== 'Approved' && <span className="text-rose-500">*</span>}
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Approved as per travel policy"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none"
              required={decision !== 'Approved'}
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Confirm Decision'}
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
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 20000, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflowY: "auto" }}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm">Disburse Field Visit Advance</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-lg">{error}</div>}
          <div className="p-3 bg-teal-50/50 border border-teal-100 rounded-xl text-xs space-y-1">
            <div className="flex justify-between text-slate-600">
              <span>Payable to:</span>
              <span className="font-bold text-slate-800">{visit.employee_name} ({visit.employee_code})</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Approved Amount:</span>
              <span className="font-bold text-teal-800">₹{(visit.approved_amount || visit.requested_amount).toLocaleString()}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Disbursement Amount (₹)</label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="Cash">Cash Handover</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / UTR #</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="UTR/Cheque #"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                required={paymentMethod !== 'Cash'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Accounts Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Paid via corporate account"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm disabled:opacity-50"
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
// 3. CEO / HR SETTLEMENT REVIEW MODAL (ITEM-BY-ITEM & BULK)
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
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 20000, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflowY: "auto" }}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Review Field Visit Settlement</h3>
            <p className="text-xs text-slate-500">
              {detail.visit.employee_name} • {detail.visit.client_name} ({detail.visit.destination})
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-lg">{error}</div>}

          {/* Financial Calculation Banner */}
          <div className="grid grid-cols-3 gap-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">Confirmed Advance (A)</span>
              <span className="font-bold text-slate-800 text-sm">₹{totalDisbursed.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Eligible Expenses (E)</span>
              <span className="font-bold text-teal-700 text-sm">₹{eligibleTotal.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Settlement Balance (F = A - E)</span>
              <span
                className={`font-bold text-sm ${finalBalance > 0 ? 'text-teal-700' : finalBalance < 0 ? 'text-amber-700' : 'text-slate-700'
                  }`}
              >
                {finalBalance > 0
                  ? `+₹${finalBalance.toLocaleString()} (Return Due)`
                  : finalBalance < 0
                    ? `−₹${Math.abs(finalBalance).toLocaleString()} (Reimbursement Due)`
                    : '₹0 (Reconciled)'}
              </span>
            </div>
          </div>

          {/* Expense Items Item-by-item verification */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">Trip Expenses Verification</label>
              <div className="text-[11px] text-slate-500">
                {detail.expenses.length} item(s) recorded
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {detail.expenses.map((exp) => {
                const currentStatus = itemStatuses[exp.id]?.approval_status || 'Approved';
                return (
                  <div key={exp.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">₹{exp.amount.toLocaleString()}</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                          {exp.category}
                        </span>
                        <span className="text-slate-400 text-[11px]">{exp.expense_date}</span>
                      </div>
                      <p className="text-slate-600 truncate text-[11px] mt-0.5">{exp.description}</p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleItem(exp.id, 'Approved')}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition ${currentStatus === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800 font-bold'
                          : 'bg-slate-100 text-slate-500 hover:bg-emerald-50'
                          }`}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleItem(exp.id, 'Rejected')}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition ${currentStatus === 'Rejected'
                          ? 'bg-rose-100 text-rose-800 font-bold'
                          : 'bg-slate-100 text-slate-500 hover:bg-rose-50'
                          }`}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Decision */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Settlement Decision</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Approved', 'Correction Requested', 'Rejected'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDecision(d)}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-lg border text-center transition ${decision === d
                    ? d === 'Approved'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : d === 'Rejected'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-amber-600 text-white border-amber-600'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Approval Reason / Feedback</label>
            <textarea
              rows={2}
              value={approvalReason}
              onChange={(e) => setApprovalReason(e.target.value)}
              placeholder="e.g. Bills verified against visit scope. Final approved."
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Confirm Settlement Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 4. EMPLOYEE REPORT RETURN MODAL (SCENARIO 1)
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
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 20000, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflowY: "auto" }}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm">Return Unused Advance to Accounts</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-lg">{error}</div>}
          <div className="p-3 bg-teal-50/50 border border-teal-100 rounded-xl text-xs space-y-1">
            <div className="flex justify-between text-slate-600">
              <span>Unused Balance Due:</span>
              <span className="font-bold text-teal-800">₹{remainingDue.toLocaleString()}</span>
            </div>
            {alreadyReturned > 0 && (
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Already Returned:</span>
                <span>₹{alreadyReturned.toLocaleString()}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Handover Amount (₹)</label>
            <input
              type="number"
              min="1"
              max={remainingDue}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Return Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
              >
                <option value="Cash Handover">Cash Handover</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={handoverDate}
                onChange={(e) => setHandoverDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                required
              />
            </div>
          </div>

          {paymentMethod !== 'Cash Handover' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">UTR / Payment Reference</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="UPI ref or bank transfer ref"
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Handed cash to cashier"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Report Return'}
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
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 20000, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflowY: "auto" }}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm">Confirm Returned Advance Balance</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-lg">{error}</div>}
          <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
            <div className="flex justify-between text-slate-500">
              <span>Reported Amount:</span>
              <span className="font-bold text-slate-800">₹{returnRecord.employee_reported_amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Method & Date:</span>
              <span>{returnRecord.payment_method} ({returnRecord.handover_date})</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Actual Received Amount (₹)</label>
            <input
              type="number"
              min="1"
              value={actualAmount}
              onChange={(e) => setActualAmount(Number(e.target.value))}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Date</label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Confirmation Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
              >
                <option value="Confirmed">Confirmed Full</option>
                <option value="Partial Receipt">Partial Receipt</option>
                <option value="Mismatch Reported">Mismatch</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Cash received in safe"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm disabled:opacity-50"
            >
              {loading ? 'Confirming...' : 'Confirm Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 6. ACCOUNTS DISBURSE REIMBURSEMENT MODAL (SCENARIO 2 & 3)
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
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 20000, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflowY: "auto" }}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm">Disburse Expense Reimbursement</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-lg">{error}</div>}
          <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-xl text-xs space-y-1">
            <div className="flex justify-between text-slate-600">
              <span>Employee:</span>
              <span className="font-bold text-slate-800">{detail.visit.employee_name} ({detail.visit.employee_code})</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Reimbursement Due:</span>
              <span className="font-bold text-amber-900">₹{remainingDue.toLocaleString()}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payout Amount (₹)</label>
            <input
              type="number"
              min="1"
              max={remainingDue}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / UTR #</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="UTR #"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                required={paymentMethod !== 'Cash'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Credited via IMPS"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Disburse Reimbursement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};