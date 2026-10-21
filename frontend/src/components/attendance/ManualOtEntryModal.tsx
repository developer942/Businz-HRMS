import React, { useState } from 'react';
import {
  X,
  Plus,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { OvertimeRequest } from '../../types/attendanceEnterprise';
import { formatCurrency } from '../../utils/numbers';
import { DateInput } from '../common/DateInput';

interface ManualOtEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManualOtEntryModal: React.FC<ManualOtEntryModalProps> = ({
  isOpen,
  onClose
}) => {
  const { employees, addManualOtEntry, currentUser, attendanceGlobalSettings } = useHRMS();

  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id || '');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [hours, setHours] = useState<number>(2.0);
  const [hourlyRate, setHourlyRate] = useState<number>(
    attendanceGlobalSettings.fixedOtRatePerHour || 100
  );
  const [multiplier, setMultiplier] = useState<OvertimeRequest['multiplier']>('1x Salary');
  const [reason, setReason] = useState<string>('Off-Hours Maintenance & Deployment');
  const [error, setError] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const factor = multiplier === '2x Salary' ? 2 : multiplier === '1.5x Salary' ? 1.5 : 1;
  const calculatedTotal = hours * hourlyRate * factor;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!employeeId) {
      setError('Please select an employee.');
      return;
    }

    if (hours <= 0) {
      setError('Overtime hours must be greater than 0.');
      return;
    }

    if (!reason.trim()) {
      setError('Reason is mandatory for manual OT addition.');
      return;
    }

    const addedBy = `${currentUser?.name} (${currentUser?.role})`;

    const res = addManualOtEntry({
      employeeId,
      date,
      hours,
      hourlyRate,
      multiplier,
      reason,
      addedBy
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
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '540px',
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
              <Plus size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Add Manual Overtime (HR/CEO)
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                Directly credit approved overtime hours into payroll
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
        <form onSubmit={handleSubmit}>
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
                <span>Overtime hours successfully added and synced with attendance and payroll!</span>
              </div>
            )}

            {/* Select Employee */}
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
                Select Employee <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
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
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeId}) — {emp.department}
                  </option>
                ))}
              </select>
            </div>

            {/* Date & Hours Row */}
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
                  Date <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <DateInput
                  value={date}
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
                  OT Hours <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="16"
                  value={hours}
                  onChange={e => setHours(parseFloat(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.9rem',
                    fontWeight: 750,
                    color: '#0E7490',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>
            </div>

            {/* Multiplier Rule & Hourly Base Rate */}
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
                  Multiplier Rule
                </label>
                <select
                  value={multiplier}
                  onChange={e => setMultiplier(e.target.value as OvertimeRequest['multiplier'])}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="1x Salary">1.0x Regular Salary</option>
                  <option value="1.5x Salary">1.5x Overtime Rate</option>
                  <option value="2x Salary">2.0x Double / Holiday</option>
                  <option value="Fixed Amount Per Hour">Fixed Rate (₹/hr)</option>
                </select>
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
                  Hourly Base Rate (₹)
                </label>
                <input
                  type="number"
                  step="10"
                  min="50"
                  value={hourlyRate}
                  onChange={e => setHourlyRate(parseFloat(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: '#1E293B',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Calculated Summary Box */}
            <div
              style={{
                backgroundColor: '#ECFEFF',
                border: '1px solid #A5F3FC',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxSizing: 'border-box'
              }}
            >
              <div>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0E7490', textTransform: 'uppercase', display: 'block' }}>
                  Total OT Payout
                </span>
                <span style={{ fontSize: '0.82rem', color: '#155E75', marginTop: '2px', display: 'block' }}>
                  {hours} hrs @ {formatCurrency(hourlyRate)}/hr ({multiplier})
                </span>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0E7490' }}>
                {formatCurrency(calculatedTotal)}
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
                Reason / Authorized Justification <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Off-Hours Maintenance & Deployment authorized by CEO..."
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
              className="btn btn-primary"
              style={{
                padding: '8px 20px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 700,
                backgroundColor: '#0E7490',
                borderColor: '#0E7490',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)'
              }}
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Credit Overtime</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
