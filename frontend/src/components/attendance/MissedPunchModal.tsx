import React, { useState } from 'react';
import {
  X,
  Clock,
  Calendar,
  AlertCircle,
  FileText,
  UploadCloud,
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { MissedPunchRequestType } from '../../types/attendanceEnterprise';
import { AttendanceTimePickerModal } from './AttendanceTimePickerModal';
import { parseTimeToMinutes } from '../../services/attendanceCalculationEngine';
import { handleFormKeyDown, preventSpaceEnterPropagation } from '../../utils/keyboardUtils';

interface MissedPunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
  defaultType?: MissedPunchRequestType;
}

export const MissedPunchModal: React.FC<MissedPunchModalProps> = ({
  isOpen,
  onClose,
  defaultDate,
  defaultType = 'Missed Check-Out'
}) => {
  const { currentUser, submitMissedPunchRequest, attendanceRecords } = useHRMS();

  const [date, setDate] = useState<string>(
    defaultDate || new Date().toISOString().split('T')[0]
  );
  const [requestType, setRequestType] = useState<MissedPunchRequestType>(defaultType);
  const [checkInTime, setCheckInTime] = useState<string>('09:00 AM');
  const [checkOutTime, setCheckOutTime] = useState<string>('07:15 PM');
  const [reason, setReason] = useState<string>('Forgot to check out');
  const [description, setDescription] = useState<string>('');
  const [attachmentFileName, setAttachmentFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Time picker modal state
  const [timePickerTarget, setTimePickerTarget] = useState<'in' | 'out' | null>(null);

  if (!isOpen) return null;

  const REQUEST_TYPES: { id: MissedPunchRequestType; label: string; desc: string }[] = [
    { id: 'Missed Check-Out', label: 'Missed Check-Out', desc: 'Checked in but forgot to punch out' },
    { id: 'Missed Check-In', label: 'Missed Check-In', desc: 'Arrived on time but forgot to punch in' },
    { id: 'Missing Attendance', label: 'Missing Attendance', desc: 'Full day attendance not recorded' },
    { id: 'Wrong Check-In', label: 'Wrong Check-In', desc: 'System registered incorrect arrival time' },
    { id: 'Wrong Check-Out', label: 'Wrong Check-Out', desc: 'System registered incorrect departure' },
    { id: 'Other Attendance Issue', label: 'Other Issue', desc: 'Terminal glitch or official outstation duty' }
  ];

  const REASON_OPTIONS = [
    'Forgot to check out',
    'Forgot to check in',
    'Biometric Scanner Glitch / Not Recognizing',
    'Client Site Meeting Delay',
    'Internet & Power Outage at Branch',
    'Official Duty / Outdoor Assignment',
    'Work From Home / Remote Deployment',
    'Transportation Delay',
    'Other (Explained Below)'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!date) {
      setError('Please select the attendance date.');
      return;
    }

    if (!reason.trim()) {
      setError('Please select or specify a reason.');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a brief description of the issue.');
      return;
    }

    // Validation: Check-Out cannot be before Check-In
    const needsIn = requestType !== 'Missed Check-Out';
    const needsOut = requestType !== 'Missed Check-In';

    if (needsIn && needsOut) {
      const inMins = parseTimeToMinutes(checkInTime);
      const outMins = parseTimeToMinutes(checkOutTime);
      if (inMins !== null && outMins !== null && outMins <= inMins) {
        setError('Validation Error: Requested Check-Out time cannot be earlier than or equal to Check-In time.');
        return;
      }
    }

    const employeeId = currentUser?.employeeId || currentUser?.id || 'EMP-001';
    const employeeName = currentUser?.name || 'Employee';
    const department = currentUser?.department || 'Engineering';

    // Find existing attendance punches for reference
    const matchedRecord = attendanceRecords.find(a => a.employeeId === employeeId && a.date === date);

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = submitMissedPunchRequest({
        employeeId,
        employeeName,
        department,
        date,
        requestType,
        existingCheckIn: matchedRecord?.checkIn || null,
        existingCheckOut: matchedRecord?.checkOut || null,
        requestedCheckIn: needsIn ? checkInTime : (matchedRecord?.checkIn || '09:00 AM'),
        requestedCheckOut: needsOut ? checkOutTime : (matchedRecord?.checkOut || '06:00 PM'),
        reason,
        description,
        attachmentUrl: attachmentFileName ? `uploads/${attachmentFileName}` : undefined
      });

      if (res.success) {
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          onClose();
        }, 1400);
      } else {
        setError(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulatedFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachmentFileName(e.target.files[0].name);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800 tracking-tight">
                  Request Attendance Correction
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  Attendance Issue?
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Submit correction details. Will be routed for HR / CEO Approval.
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

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Request submitted! Status: <strong>PENDING HR/CEO REVIEW</strong></span>
            </div>
          )}

          {/* Request Type Selector (6 types per Section 3) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Request Type <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {REQUEST_TYPES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setRequestType(t.id)}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    requestType === t.id
                      ? 'bg-cyan-50 border-cyan-600 text-cyan-900 shadow-sm ring-1 ring-cyan-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-800">{t.label}</div>
                  <div className="text-[10px] text-slate-400 line-clamp-1">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Date Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Attendance Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent transition-all"
              required
            />
          </div>

          {/* Requested Punch Times */}
          <div className="grid grid-cols-2 gap-3">
            {requestType !== 'Missed Check-Out' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Requested Check-In <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setTimePickerTarget('in')}
                  className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 text-sm hover:border-cyan-600 bg-white"
                >
                  <span className="font-mono font-bold text-cyan-900">{checkInTime}</span>
                  <Clock className="w-4 h-4 text-cyan-700" />
                </button>
              </div>
            )}

            {requestType !== 'Missed Check-In' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Requested Check-Out <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setTimePickerTarget('out')}
                  className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 text-sm hover:border-cyan-600 bg-white"
                >
                  <span className="font-mono font-bold text-cyan-900">{checkOutTime}</span>
                  <Clock className="w-4 h-4 text-cyan-700" />
                </button>
              </div>
            )}
          </div>

          {/* Reason Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Reason <span className="text-rose-500">*</span>
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 bg-white"
              required
            >
              {REASON_OPTIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Description Textarea */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Description / Circumstances <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={preventSpaceEnterPropagation}
              placeholder="e.g. I completed my work but forgot to check out at 07:15 PM."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 transition-all resize-none"
              required
            />
          </div>

          {/* Attachment (File upload preview) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Attachment (Optional proof, supervisor email, or travel voucher)
            </label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-cyan-700" />
                <span>Upload File</span>
                <input
                  type="file"
                  onChange={handleSimulatedFileUpload}
                  className="hidden"
                  accept=".png,.jpg,.jpeg,.pdf"
                />
              </label>
              {attachmentFileName ? (
                <span className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {attachmentFileName}
                </span>
              ) : (
                <span className="text-xs text-slate-400">No document chosen (Max 5MB)</span>
              )}
            </div>
          </div>

          {/* Informative Status Banner */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-cyan-700 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-700">Audit Compliance:</span> Employee cannot directly edit finalized attendance records. Upon submission, request enters <strong>PENDING HR/CEO REVIEW</strong>. Once approved, the record is automatically recalculated and logged in the immutable audit trail.
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-semibold shadow-sm flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" /> {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>

        {/* Time Picker Sub-modal */}
        {timePickerTarget && (
          <AttendanceTimePickerModal
            isOpen={true}
            employeeName={currentUser?.name || 'Employee'}
            date={date}
            initialCheckIn={checkInTime}
            initialCheckOut={checkOutTime}
            onClose={() => setTimePickerTarget(null)}
            onSave={(inT, outT) => {
              if (inT) setCheckInTime(inT);
              if (outT) setCheckOutTime(outT);
              setTimePickerTarget(null);
            }}
          />
        )}
      </div>
    </div>
  );
};
