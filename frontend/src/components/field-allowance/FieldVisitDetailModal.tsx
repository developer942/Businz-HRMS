import React, { useState, useEffect } from 'react';
import {
  X,
  IndianRupee,
  Calendar,
  MapPin,
  Building,
  Plus,
  Send,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  ExternalLink,
  ShieldCheck,
  DollarSign,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Receipt,
  User,
  History,
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

  // Sub-modals
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FieldVisitExpense | null>(null);
  const [showApproveAdvance, setShowApproveAdvance] = useState(false);
  const [showDisburseAdvance, setShowDisburseAdvance] = useState(false);
  const [showReviewSettlement, setShowReviewSettlement] = useState(false);
  const [showReportReturn, setShowReportReturn] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);
  const [showDisburseReimbursement, setShowDisburseReimbursement] = useState(false);
  const [submitRemarks, setSubmitRemarks] = useState('');
  const [submittingSettlement, setSubmittingSettlement] = useState(false);

  // User roles
  const isCeo =
    currentUser?.role === 'CEO' ||
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'Director';

  const isHr = Boolean(currentUser?.role?.includes('HR')) && !isCeo;

  const isCeoOrHr = isCeo || isHr;

  const isAccounts =
    currentUser?.role === 'Finance Manager' ||
    currentUser?.role === 'Accountant' ||
    currentUser?.department?.toLowerCase().includes('account') ||
    currentUser?.department?.toLowerCase().includes('finance');

  const isOwnerMatch =
    detail?.visit?.employee_id === currentUser?.employeeId ||
    detail?.visit?.employee_id === currentUser?.id;

  // CEO must never create or submit employee expense claims
  const isEmployeeOwner = !isCeo && isOwnerMatch;

  // HR cannot approve their own request or any HR employee's request
  const isHrClaim =
    isOwnerMatch ||
    Boolean(
      detail?.visit?.department?.toLowerCase().includes('hr') ||
        detail?.visit?.department?.toLowerCase().includes('human resource')
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
    if (!window.confirm('Submit this field visit settlement for CEO / HR review?')) return;

    setSubmittingSettlement(true);
    try {
      await submitSettlementApi(detail.visit.id, submitRemarks.trim() || null);
      handleActionSuccess();
    } catch (err: any) {
      alert(err.message || 'Settlement submission failed');
    } finally {
      setSubmittingSettlement(false);
    }
  };

  // Financial calculations
  const totalDisbursed = detail?.visit?.disbursed_amount || 0;
  const totalExpenses = detail?.expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
  const provisionalBalance = totalDisbursed - totalExpenses;
  const settlement = detail?.settlement;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
      <div className="modal-content" style={{ background: '#FFFFFF', borderRadius: '20px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', border: '1px solid #E2E8F0', width: '100%', maxWidth: '880px', maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: 'auto' }}>
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-slate-800 text-sm">
              {detail?.visit?.request_number || 'Loading...'}
            </span>
            {detail && (
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  detail.visit.funding_type === 'advance'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'bg-purple-50 text-purple-700 border border-purple-200'
                }`}
              >
                {detail.visit.funding_type === 'advance' ? 'Option A: Advance' : 'Option B: Personal Money'}
              </span>
            )}
            {detail && (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  detail.visit.status === 'Completed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : detail.visit.status === 'Active'
                    ? 'bg-teal-100 text-teal-800'
                    : detail.visit.status.includes('Pending')
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {detail.visit.status}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs">Loading field visit details...</div>
          ) : error || !detail ? (
            <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error || 'Field visit could not be loaded.'}</span>
            </div>
          ) : (
            <>
              {/* Trip Overview Card */}
              <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 text-[11px] block">Employee</span>
                    <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mt-0.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {detail.visit.employee_name}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {detail.visit.employee_code} • {detail.visit.department_name}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[11px] block">Customer / Site</span>
                    <span className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mt-0.5">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      {detail.visit.client_name}
                    </span>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {detail.visit.destination}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[11px] block">Travel Period</span>
                    <span className="font-semibold text-slate-800 text-xs flex items-center gap-1.5 mt-0.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {detail.visit.start_date} to {detail.visit.end_date}
                    </span>
                    {detail.visit.travel_mode && (
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Mode: {detail.visit.travel_mode}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-400 text-[11px] block">Purpose</span>
                    <p className="text-slate-700 text-xs font-medium mt-0.5 line-clamp-2">
                      {detail.visit.purpose}
                    </p>
                  </div>
                </div>
              </div>

              {/* UNIFIED FINANCIAL BALANCE CARD (MANDATORY SECTION 7 & 8) */}
              <div className="p-4 sm:p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl shadow-md border border-slate-700/50">
                <div className="flex items-center justify-between pb-3 border-b border-slate-700/60 mb-3">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-teal-400" />
                    <span className="font-bold text-xs tracking-wide uppercase text-slate-300">
                      Trip Financial Balance & Reconciliation
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Formula: Balance = Advance − Expenses
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Confirmed Advance A */}
                  <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                    <span className="text-[11px] text-slate-400 block">Confirmed Advance (A)</span>
                    <span className="text-base sm:text-lg font-bold text-white mt-0.5 block">
                      ₹{totalDisbursed.toLocaleString()}
                    </span>
                    {detail.visit.funding_type === 'advance' && (
                      <span className="text-[10px] text-slate-400 block mt-1">
                        Req: ₹{detail.visit.requested_amount.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Total Recorded Expenses D */}
                  <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                    <span className="text-[11px] text-slate-400 block">Recorded Expenses (D)</span>
                    <span className="text-base sm:text-lg font-bold text-teal-300 mt-0.5 block">
                      ₹{totalExpenses.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      {detail.expenses.length} bills logged
                    </span>
                  </div>

                  {/* Provisional Balance B = A - D (Negative Allowed) */}
                  <div
                    className={`p-3 rounded-xl border ${
                      provisionalBalance < 0
                        ? 'bg-amber-950/40 border-amber-500/30'
                        : provisionalBalance > 0
                        ? 'bg-teal-950/40 border-teal-500/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 block">Provisional Balance (B)</span>
                    <span
                      className={`text-base sm:text-lg font-bold mt-0.5 block ${
                        provisionalBalance < 0
                          ? 'text-amber-400'
                          : provisionalBalance > 0
                          ? 'text-teal-400'
                          : 'text-white'
                      }`}
                    >
                      {provisionalBalance < 0
                        ? `−₹${Math.abs(provisionalBalance).toLocaleString()}`
                        : provisionalBalance > 0
                        ? `+₹${provisionalBalance.toLocaleString()}`
                        : '₹0'}
                    </span>
                    <span className="text-[10px] text-slate-300 block mt-1">
                      {provisionalBalance < 0
                        ? 'Excess Expense (Reimbursement)'
                        : provisionalBalance > 0
                        ? 'Unused Advance (Return)'
                        : 'Balanced'}
                    </span>
                  </div>

                  {/* Settlement Status / Approved Outcome */}
                  <div className="p-3 bg-white/5 rounded-xl border border-white/10 flex flex-col justify-between">
                    <span className="text-[11px] text-slate-400 block">Settlement Status</span>
                    {settlement ? (
                      <div>
                        <span className="text-xs font-bold text-white block">
                          {settlement.settlement_status}
                        </span>
                        {settlement.return_due > 0 && (
                          <span className="text-[11px] text-teal-400 font-semibold block mt-0.5">
                            Return Due: ₹{(settlement.return_due - settlement.actual_returned).toLocaleString()}
                          </span>
                        )}
                        {settlement.reimbursement_due > 0 && (
                          <span className="text-[11px] text-amber-400 font-semibold block mt-0.5">
                            Reimb. Due: ₹
                            {(settlement.reimbursement_due - settlement.actual_reimbursed).toLocaleString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Awaiting Settlement Submission</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Daily Expenses Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Trip Expense Log ({detail.expenses.length})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      All itemized expenses incurred during the field visit
                    </p>
                  </div>
                  {isEmployeeOwner &&
                    ['Active', 'Draft', 'Settlement Correction Requested'].includes(
                      detail.visit.status
                    ) && (
                      <button
                        onClick={() => {
                          setEditingExpense(null);
                          setShowAddExpense(true);
                        }}
                        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Daily Expense</span>
                      </button>
                    )}
                </div>

                {detail.expenses.length === 0 ? (
                  <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                    <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-600">No expenses recorded yet</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Log travel, hotel, food and customer visit bills
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                    {detail.expenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/60 transition"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 text-sm">
                              ₹{exp.amount.toLocaleString()}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {exp.category}
                            </span>
                            <span className="text-[11px] text-slate-400">{exp.expense_date}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                                exp.approval_status === 'Approved'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : exp.approval_status === 'Rejected'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {exp.approval_status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">{exp.description}</p>
                          {exp.rejection_reason && (
                            <p className="text-[11px] text-rose-600">
                              Reason: {exp.rejection_reason}
                            </p>
                          )}
                        </div>

                        {exp.receipt_url && (
                          <a
                            href={exp.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg self-start sm:self-auto"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>View Bill</span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ACTION WORKFLOW CONTEXT BUTTONS */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  <span className="font-bold block text-slate-700">Next Action:</span>
                  {detail.visit.status === 'Pending Advance Approval' &&
                    'Awaiting CEO / HR review and authorization of requested trip advance.'}
                  {detail.visit.status === 'Advance Approved' &&
                    'Advance approved. Ready for Accounts payment disbursement.'}
                  {detail.visit.status === 'Active' &&
                    'Trip ongoing. Employee can record expenses and submit final settlement.'}
                  {detail.visit.status === 'Settlement Submitted' &&
                    'Settlement submitted. CEO / HR can review and approve eligible claims.'}
                  {detail.visit.status === 'Pending Balance Collection' &&
                    'Approved. Employee to return remaining advance balance to Accounts.'}
                  {detail.visit.status === 'Pending Reimbursement' &&
                    'Approved. Accounts to disburse excess expense reimbursement to employee.'}
                  {detail.visit.status === 'Completed' &&
                    'Financial settlement fully completed and reconciled.'}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* CEO / HR Actions */}
                  {canApproveThisVisit && detail.visit.status === 'Pending Advance Approval' && (
                    <button
                      onClick={() => setShowApproveAdvance(true)}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                    >
                      Review & Approve Advance
                    </button>
                  )}

                  {isHr && isHrClaim && detail.visit.status === 'Pending Advance Approval' && (
                    <span className="px-3 py-1.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-[11px] font-bold">
                      CEO Approval Required (HR Request)
                    </span>
                  )}

                  {/* Accounts Advance Disbursement */}
                  {isAccounts && detail.visit.status === 'Advance Approved' && (
                    <button
                      onClick={() => setShowDisburseAdvance(true)}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Disburse Advance Money</span>
                    </button>
                  )}

                  {/* Employee Submit Settlement */}
                  {isEmployeeOwner &&
                    ['Active', 'Draft', 'Settlement Correction Requested'].includes(
                      detail.visit.status
                    ) && (
                      <button
                        onClick={handleSubmitSettlement}
                        disabled={submittingSettlement || detail.expenses.length === 0}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit Final Settlement</span>
                      </button>
                    )}

                  {/* CEO / HR Settlement Review */}
                  {canApproveThisVisit && detail.visit.status === 'Settlement Submitted' && (
                    <button
                      onClick={() => setShowReviewSettlement(true)}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Review & Approve Settlement</span>
                    </button>
                  )}

                  {isHr && isHrClaim && detail.visit.status === 'Settlement Submitted' && (
                    <span className="px-3 py-1.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-[11px] font-bold">
                      CEO Settlement Approval Required (HR Request)
                    </span>
                  )}

                  {/* Employee Report Return (Scenario 1) */}
                  {isEmployeeOwner &&
                    ['Pending Balance Collection', 'Partially Collected'].includes(
                      detail.visit.status
                    ) && (
                      <button
                        onClick={() => setShowReportReturn(true)}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>Report Advance Return</span>
                      </button>
                    )}

                  {/* Accounts Confirm Return Receipt (Scenario 1) */}
                  {isAccounts &&
                    detail.balanceReturns.some((r) => r.status === 'Awaiting Confirmation') && (
                      <button
                        onClick={() => {
                          const pending = detail.balanceReturns.find(
                            (r) => r.status === 'Awaiting Confirmation'
                          );
                          setSelectedReturn(pending);
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                      >
                        Confirm Received Cash/Bank Return
                      </button>
                    )}

                  {/* Accounts Disburse Reimbursement (Scenario 2 & 3) */}
                  {isAccounts &&
                    ['Pending Reimbursement', 'Partially Reimbursed'].includes(
                      detail.visit.status
                    ) && (
                      <button
                        onClick={() => setShowDisburseReimbursement(true)}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                      >
                        <IndianRupee className="w-3.5 h-3.5" />
                        <span>Pay Expense Reimbursement</span>
                      </button>
                    )}
                </div>
              </div>

              {/* Audit Log / History Timeline */}
              {detail.auditLogs.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    <span>Audit & Activity Trail</span>
                  </h4>
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-40 overflow-y-auto text-[11px]">
                    {detail.auditLogs.map((log) => (
                      <div key={log.id} className="p-2.5 flex items-center justify-between text-slate-600">
                        <div>
                          <span className="font-semibold text-slate-800">{log.action}</span>
                          {log.actor_name && <span className="ml-1 text-slate-500">by {log.actor_name}</span>}
                          {log.new_status && (
                            <span className="ml-1 text-teal-700 font-medium">→ {log.new_status}</span>
                          )}
                        </div>
                        <span className="text-slate-400">{log.created_at.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
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
