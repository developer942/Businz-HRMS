import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  AlertCircle,
  CheckCircle2,
  UploadCloud
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { OvertimeRequest } from '../../types/attendanceEnterprise';
import { formatCurrency } from '../../utils/numbers';
import { handleFormKeyDown, preventSpaceEnterPropagation } from '../../utils/keyboardUtils';
import { DateInput } from '../common/DateInput';

interface EmployeeOtRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
}

export const EmployeeOtRequestModal: React.FC<EmployeeOtRequestModalProps> = ({
  isOpen,
  onClose,
  defaultDate
}) => {
  const { currentUser, attendanceRecords, submitOtRequest, attendanceGlobalSettings } = useHRMS();

  const [date, setDate] = useState<string>(
    defaultDate || new Date().toISOString().split('T')[0]
  );
  const [shiftEnd, setShiftEnd] = useState<string>('06:00 PM');
  const [actualCheckOut, setActualCheckOut] = useState<string>('08:30 PM');
  const [potentialOtHours, setPotentialOtHours] = useState<number>(2.5);
  const [requestedOtHours, setRequestedOtHours] = useState<number>(2.5);
  const [multiplier, setMultiplier] = useState<OvertimeRequest['multiplier']>('1.5x Salary');
  const [hourlyRate, setHourlyRate] = useState<number>(
    attendanceGlobalSettings.fixedOtRatePerHour || 100
  );
  const [reason, setReason] = useState<string>('Critical Project Deadline');
  const [workDescription, setWorkDescription] = useState<string>('');
  const [attachmentFileName, setAttachmentFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Auto-detect check-out from today's attendance if available
  useEffect(() => {
    const empId = currentUser?.employeeId || currentUser?.id;
    if (!empId) return;

    const matchedAtt = attendanceRecords.find(a => a.employeeId === empId && a.date === date);
    if (matchedAtt && matchedAtt.checkOut) {
      setActualCheckOut(matchedAtt.checkOut);
    }
  }, [date, currentUser, attendanceRecords]);

  // Recalculate potential hours
  useEffect(() => {
    const parseTimeToMins = (t: string) => {
      const clean = t.trim();
      let hours = 0;
      let mins = 0;
      if (clean.includes('AM') || clean.includes('PM')) {
        const [timePart, ampm] = clean.split(' ');
        const [h, m] = timePart.split(':').map(Number);
        hours = ampm.toUpperCase() === 'PM' && h < 12 ? h + 12 : (ampm.toUpperCase() === 'AM' && h === 12 ? 0 : h);
        mins = m || 0;
      } else {
        const [h, m] = clean.split(':').map(Number);
        hours = h || 0;
        mins = m || 0;
      }
      return hours * 60 + mins;
    };

    const shiftEndMins = parseTimeToMins(shiftEnd);
    const checkOutMins = parseTimeToMins(actualCheckOut);
    if (checkOutMins > shiftEndMins) {
      const diffHours = Math.round(((checkOutMins - shiftEndMins) / 60) * 10) / 10;
      setPotentialOtHours(diffHours);
      setRequestedOtHours(diffHours);
    } else {
      setPotentialOtHours(0);
      setRequestedOtHours(0);
    }
  }, [shiftEnd, actualCheckOut]);

  if (!isOpen) return null;

  const OT_REASONS = [
    'Critical Project Deadline',
    'Production Deployment & Hotfix',
    'VIP Customer Escalation Support',
    'APAC / US Client Sync Meeting',
    'Inventory / Audit Count Overrun',
    'Urgent Tender & Proposal Submission',
    'Weekend / Holiday Emergency Shift'
  ];

  const factor = multiplier === '2x Salary' ? 2 : multiplier === '1.5x Salary' ? 1.5 : 1;
  const calculatedAmount = requestedOtHours * hourlyRate * factor;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (requestedOtHours <= 0) {
      setError('Requested overtime hours must be greater than 0.');
      return;
    }

    if (!workDescription.trim()) {
      setError('Please provide a detailed summary of work completed during OT.');
      return;
    }

    const employeeId = currentUser?.employeeId || currentUser?.id || 'EMP-001';
    const employeeName = currentUser?.name || 'Employee';
    const department = currentUser?.department || 'Engineering';

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = submitOtRequest({
        employeeId,
        employeeName,
        department,
        date,
        shiftEnd,
        actualCheckOut,
        potentialOtHours,
        requestedOtHours,
        reason,
        workDescription,
        multiplier,
        hourlyRate,
        calculatedAmount,
        attachmentUrl: attachmentFileName ? `uploads/${attachmentFileName}` : undefined
      });

      if (res.success) {
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          onClose();
        }, 1200);
      } else {
        setError(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '560px',
          width: '92%',
          borderRadius: '18px',
          overflow: 'hidden',
          backgroundColor: '#FFFFFF',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
          border: '1px solid #E2E8F0'
        }}
      >
        {/* Modal Header */}
        <div
          className="modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Clock size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Submit Overtime (OT) Request
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                Claim extra hours worked beyond standard shift timings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="close-btn"
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
          <div
            className="modal-body"
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#B91C1C',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {isSuccess && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  color: '#059669',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <CheckCircle2 size={16} color="#059669" style={{ flexShrink: 0 }} />
                <span>Overtime request submitted successfully! Awaiting supervisor approval.</span>
              </div>
            )}

            {/* Date & Shift Timings */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#1E293B',
                    marginBottom: '6px'
                  }}
                >
                  OT Date <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <DateInput
                  value={date}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setDate(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#1E293B',
                    marginBottom: '6px'
                  }}
                >
                  Shift End Time
                </label>
                <input
                  type="text"
                  value={shiftEnd}
                  onChange={e => setShiftEnd(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    color: '#64748B',
                    backgroundColor: '#F8FAFC',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Actual Checkout & Potential OT */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#1E293B',
                    marginBottom: '6px'
                  }}
                >
                  Actual Check-Out Time <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={actualCheckOut}
                  onChange={e => setActualCheckOut(e.target.value)}
                  placeholder="e.g. 08:30 PM"
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#1E293B',
                    marginBottom: '6px'
                  }}
                >
                  Detected Hours
                </label>
                <div
                  style={{
                    height: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    boxSizing: 'border-box'
                  }}
                >
                  {potentialOtHours} hrs detected
                </div>
              </div>
            </div>

            {/* Claim Hours, Multiplier & Payout Box */}
            <div
              style={{
                backgroundColor: '#ECFEFF',
                border: '1px solid #A5F3FC',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '12px',
                boxSizing: 'border-box'
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#0E7490', marginBottom: '4px' }}>
                  Requested OT
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="12"
                  value={requestedOtHours}
                  onChange={e => setRequestedOtHours(parseFloat(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    border: '1px solid #A5F3FC',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    color: '#0E7490',
                    backgroundColor: '#FFFFFF',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#0E7490', marginBottom: '4px' }}>
                  Multiplier
                </label>
                <select
                  value={multiplier}
                  onChange={e => setMultiplier(e.target.value as OvertimeRequest['multiplier'])}
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '4px 6px',
                    borderRadius: '8px',
                    border: '1px solid #A5F3FC',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#0E7490',
                    backgroundColor: '#FFFFFF',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="1x Salary">1.0x Regular</option>
                  <option value="1.5x Salary">1.5x Regular</option>
                  <option value="2x Salary">2.0x Holiday</option>
                  <option value="Fixed Amount Per Hour">Fixed Rate</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#0E7490', marginBottom: '4px' }}>
                  Est. Payout
                </label>
                <div
                  style={{
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #A5F3FC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    color: '#0E7490',
                    fontSize: '0.95rem'
                  }}
                >
                  {formatCurrency(calculatedAmount)}
                </div>
              </div>
            </div>

            {/* Reason */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#1E293B',
                  marginBottom: '6px'
                }}
              >
                Reason / Category <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  color: '#1E293B',
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              >
                {OT_REASONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Detailed Work Description */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#1E293B',
                  marginBottom: '6px'
                }}
              >
                Tasks Completed During Overtime <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea
                rows={3}
                value={workDescription}
                onChange={e => setWorkDescription(e.target.value)}
                onKeyDown={preventSpaceEnterPropagation}
                placeholder="List specific milestones, ticket numbers, or structural activities completed during these extra hours..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem',
                  color: '#1E293B',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            {/* Optional Attachment */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#1E293B',
                  marginBottom: '6px'
                }}
              >
                Deliverable Screenshot / Proof (Optional)
              </label>
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px dashed #CBD5E1',
                  borderRadius: '10px',
                  padding: '12px',
                  cursor: 'pointer',
                  backgroundColor: '#F8FAFC'
                }}
              >
                <UploadCloud size={20} color="#64748B" style={{ marginBottom: '4px' }} />
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
                  {attachmentFileName || 'Upload photo, commit log, or supervisor confirmation'}
                </span>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  accept="image/*,.pdf"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setAttachmentFileName(f.name);
                  }}
                />
              </label>
            </div>
          </div>

          {/* Modal Footer */}
          <div
            className="modal-footer"
            style={{
              padding: '14px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              backgroundColor: '#F8FAFC'
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
              style={{
                padding: '8px 20px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 700,
                backgroundColor: '#0E7490',
                borderColor: '#0E7490',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)',
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit OT Claim'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
