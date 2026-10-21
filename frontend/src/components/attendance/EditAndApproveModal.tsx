import React, { useState } from 'react';
import {
  X,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  Edit3,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  DollarSign
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { MissedPunchRequest, OvertimeRequest } from '../../types/attendanceEnterprise';
import { formatCurrency } from '../../utils/numbers';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface EditAndApproveModalProps {
  isOpen: boolean;
  onClose: () => void;
  missedPunchRequest?: MissedPunchRequest | null;
  overtimeRequest?: OvertimeRequest | null;
}

export const EditAndApproveModal: React.FC<EditAndApproveModalProps> = ({
  isOpen,
  onClose,
  missedPunchRequest,
  overtimeRequest
}) => {
  const {
    currentUser,
    approveMissedPunchRequest,
    rejectMissedPunchRequest,
    editAndApproveMissedPunchRequest,
    approveOtRequest,
    rejectOtRequest,
    editAndApproveOtRequest
  } = useHRMS();

  // Missed Punch States
  const [adjustedCheckIn, setAdjustedCheckIn] = useState<string>(
    missedPunchRequest?.requestedCheckIn || '09:00 AM'
  );
  const [adjustedCheckOut, setAdjustedCheckOut] = useState<string>(
    missedPunchRequest?.requestedCheckOut || '06:00 PM'
  );

  // OT Request States
  const [approvedHours, setApprovedHours] = useState<number>(
    overtimeRequest?.requestedOtHours || 0
  );

  const [remarks, setRemarks] = useState<string>('');
  const [rejectionMode, setRejectionMode] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Sync state when props change
  React.useEffect(() => {
    if (missedPunchRequest) {
      setAdjustedCheckIn(missedPunchRequest.requestedCheckIn || '09:00 AM');
      setAdjustedCheckOut(missedPunchRequest.requestedCheckOut || '06:00 PM');
      setRemarks('');
      setRejectionMode(false);
    }
  }, [missedPunchRequest]);

  React.useEffect(() => {
    if (overtimeRequest) {
      setApprovedHours(overtimeRequest.requestedOtHours);
      setRemarks('');
      setRejectionMode(false);
    }
  }, [overtimeRequest]);

  if (!isOpen || (!missedPunchRequest && !overtimeRequest)) return null;

  const reviewerName = currentUser?.name || 'HR Admin';

  const handleApproveOriginal = () => {
    if (missedPunchRequest) {
      approveMissedPunchRequest(missedPunchRequest.id, reviewerName, remarks || 'Approved as requested');
      onClose();
    } else if (overtimeRequest) {
      approveOtRequest(overtimeRequest.id, overtimeRequest.requestedOtHours, reviewerName, remarks || 'Approved full hours as requested');
      onClose();
    }
  };

  const handleApproveAdjusted = () => {
    if (missedPunchRequest) {
      editAndApproveMissedPunchRequest(
        missedPunchRequest.id,
        adjustedCheckIn,
        adjustedCheckOut,
        reviewerName,
        remarks || 'Times adjusted and approved by HR/CEO'
      );
      onClose();
    } else if (overtimeRequest) {
      if (approvedHours < 0) {
        setError('Approved hours cannot be negative.');
        return;
      }
      editAndApproveOtRequest(
        overtimeRequest.id,
        approvedHours,
        reviewerName,
        remarks || `Approved ${approvedHours} hrs (adjusted from requested ${overtimeRequest.requestedOtHours} hrs)`
      );
      onClose();
    }
  };

  const handleReject = () => {
    if (!remarks.trim()) {
      setError('Please provide a reason or remarks for rejection.');
      return;
    }
    if (missedPunchRequest) {
      rejectMissedPunchRequest(missedPunchRequest.id, reviewerName, remarks);
      onClose();
    } else if (overtimeRequest) {
      rejectOtRequest(overtimeRequest.id, reviewerName, remarks);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 tracking-tight">
                {missedPunchRequest ? 'Review & Edit Attendance Request' : 'Review & Override Overtime (OT)'}
              </h2>
              <p className="text-xs text-slate-500">
                Authoritative HR / CEO approval center with hours and time adjustment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Employee & Context Pill */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-base">
                  {missedPunchRequest?.employeeName || overtimeRequest?.employeeName}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-slate-200 text-slate-700">
                  {missedPunchRequest?.department || overtimeRequest?.department}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Target Date: <strong className="text-slate-700">{formatDateDDMMYYYY(missedPunchRequest?.date || overtimeRequest?.date)}</strong>
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-400 block font-mono">
                {missedPunchRequest ? missedPunchRequest.id : overtimeRequest?.id}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Pending Approval
              </span>
            </div>
          </div>

          {/* MISSED PUNCH REQUEST COMPARISON */}
          {missedPunchRequest && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Employee's Submitted Request
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl">
                  <div>
                    <span className="text-slate-400 block">Request Type</span>
                    <span className="font-semibold text-slate-800">{missedPunchRequest.requestType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Requested In / Out</span>
                    <span className="font-semibold text-slate-800">
                      {missedPunchRequest.requestedCheckIn || 'None'} → {missedPunchRequest.requestedCheckOut || 'None'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block">Stated Reason</span>
                    <span className="font-medium text-slate-700">"{missedPunchRequest.reason}"</span>
                  </div>
                  {missedPunchRequest.description && (
                    <div className="col-span-2 text-slate-500 bg-white p-2 rounded-lg border border-slate-200">
                      {missedPunchRequest.description}
                    </div>
                  )}
                </div>
              </div>

              {/* Adjust Punch Timings (HR / CEO Override) */}
              <div className="border border-cyan-200 bg-cyan-50/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-900 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-cyan-700" /> Authorized Punch Adjustment
                  </div>
                  <span className="text-[11px] text-cyan-700 bg-cyan-100 px-2 py-0.5 rounded-full font-medium">
                    Modify prior to approval
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Adjusted Check-In
                    </label>
                    <input
                      type="text"
                      value={adjustedCheckIn}
                      onChange={e => setAdjustedCheckIn(e.target.value)}
                      placeholder="e.g. 09:15 AM"
                      className="w-full px-3 py-2 rounded-xl border border-cyan-300 text-slate-800 font-mono text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Adjusted Check-Out
                    </label>
                    <input
                      type="text"
                      value={adjustedCheckOut}
                      onChange={e => setAdjustedCheckOut(e.target.value)}
                      placeholder="e.g. 06:15 PM"
                      className="w-full px-3 py-2 rounded-xl border border-cyan-300 text-slate-800 font-mono text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-600"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* OVERTIME REQUEST COMPARISON & OVERRIDE */}
          {overtimeRequest && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Overtime Claim Context
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-xl text-center">
                  <div>
                    <span className="text-slate-400 block">Shift End</span>
                    <span className="font-semibold text-slate-800">{overtimeRequest.shiftEnd}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Actual Check-Out</span>
                    <span className="font-semibold text-slate-800">{overtimeRequest.actualCheckOut}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Requested OT</span>
                    <span className="font-bold text-cyan-800 text-sm">{overtimeRequest.requestedOtHours} hrs</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
                  <div className="font-semibold text-slate-800">Reason: {overtimeRequest.reason}</div>
                  {overtimeRequest.workDescription && (
                    <p className="text-slate-600 italic">"{overtimeRequest.workDescription}"</p>
                  )}
                </div>
              </div>

              {/* OT Hours Override */}
              <div className="border border-cyan-200 bg-cyan-50/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-900 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-cyan-700" /> Authoritative Hours Override
                  </div>
                  <span className="text-[11px] text-cyan-700 bg-cyan-100 px-2 py-0.5 rounded-full font-medium">
                    Requested vs Approved preserved
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Requested Hours
                    </label>
                    <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-500 font-bold text-sm">
                      {overtimeRequest.requestedOtHours} hrs
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-cyan-900 mb-1">
                      Approved Hours <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="12"
                      value={approvedHours}
                      onChange={e => setApprovedHours(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-cyan-300 text-cyan-950 font-bold text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Approved Payout
                    </label>
                    <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-sm">
                      {formatCurrency(approvedHours * overtimeRequest.hourlyRate)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* HR / CEO Remarks / Justification Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Review Remarks & Audit Note <span className="text-slate-400 font-normal">(Recorded permanently)</span>
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder={rejectionMode ? "Please enter reason for rejection (required)..." : "Add any adjustment notes, deduction reasons, or approval comments..."}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600 resize-none transition-all"
            />
          </div>

        </div>

        {/* Modal Actions Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setRejectionMode(!rejectionMode)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              rejectionMode
                ? 'bg-slate-200 text-slate-700'
                : 'text-rose-600 hover:bg-rose-50'
            }`}
          >
            <XCircle className="w-4 h-4" /> {rejectionMode ? 'Back to Approval' : 'Reject Request'}
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-white transition-colors"
            >
              Cancel
            </button>

            {rejectionMode ? (
              <button
                type="button"
                onClick={handleReject}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                Confirm Rejection
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleApproveOriginal}
                  className="px-3.5 py-2 rounded-xl border border-cyan-700 text-cyan-800 hover:bg-cyan-50 text-xs font-semibold transition-colors"
                >
                  Approve As Requested
                </button>

                <button
                  type="button"
                  onClick={handleApproveAdjusted}
                  className="px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" /> Save & Approve
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
