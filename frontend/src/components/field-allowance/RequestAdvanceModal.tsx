import React, { useState } from 'react';
import { X, Calendar, MapPin, Building, IndianRupee, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { createFieldVisit } from '../../services/fieldAdvanceService';
import { getTodayKolkata } from '../../utils/requestValidation';

interface RequestAdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser: any;
}

export const RequestAdvanceModal: React.FC<RequestAdvanceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
}) => {
  const today = getTodayKolkata();

  const [purpose, setPurpose] = useState('');
  const [clientName, setClientName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [requestedAmount, setRequestedAmount] = useState<number | ''>('');
  const [travelMode, setTravelMode] = useState('Train');
  const [remarks, setRemarks] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isHr =
    currentUser.role?.includes('HR') ||
    currentUser.department?.toLowerCase().includes('hr') ||
    currentUser.department?.toLowerCase().includes('human resource');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!purpose.trim()) {
      setError('Work / Field visit purpose is required.');
      return;
    }
    if (!destination.trim()) {
      setError('Travel destination is required.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Please select valid start and end dates.');
      return;
    }
    if (endDate < startDate) {
      setError('End date cannot be earlier than start date.');
      return;
    }
    if (!requestedAmount || Number(requestedAmount) <= 0) {
      setError('Please enter a valid requested advance amount greater than ₹0.');
      return;
    }

    setLoading(true);
    try {
      await createFieldVisit({
        employee_id: currentUser.employeeId || currentUser.id,
        employee_code: currentUser.employee_code || currentUser.employeeId || '',
        employee_name: currentUser.name || 'Current Employee',
        department_name: currentUser.department || (isHr ? 'Human Resources' : 'Operations'),
        purpose: purpose.trim(),
        client_name: clientName.trim() || 'Internal Company Work',
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        funding_type: 'advance',
        requested_amount: Number(requestedAmount),
        travel_mode: travelMode,
        remarks: remarks.trim() || null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit advance request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: '620px',
          background: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 40px)',
          margin: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
              Request Company Advance
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
              {isHr
                ? 'HR advance request — will be routed strictly to CEO for approval'
                : 'Apply for travel advance funds prior to company work or field trip'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  fontSize: '0.85rem',
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Read-Only Employee Meta */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                background: '#F8FAFC',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
              }}
            >
              <div>
                <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}>Employee Name</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                  {currentUser.name || 'Current User'}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}>Employee ID</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>
                  {currentUser.employeeId || currentUser.employee_code || 'EMP-001'}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}>Department</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                  {currentUser.department || 'Operations'}
                </span>
              </div>
            </div>

            {/* Purpose */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Work / Field Visit Purpose <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Machinery installation, testing and client training"
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.9rem',
                  color: '#0F172A',
                  outline: 'none',
                }}
              />
            </div>

            {/* Client & Destination */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Customer / Site Name <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 400 }}>(Optional)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Building size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94A3B8' }} />
                  <input
                    type="text"
                    placeholder="e.g. Apex Industrial Solutions"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 36px',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.9rem',
                      color: '#0F172A',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Travel Location <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94A3B8' }} />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Coimbatore, Tamil Nadu"
                    value={destination}
                    onChange={e => setDestination(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 36px',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.9rem',
                      color: '#0F172A',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Visit Start Date <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Visit End Date <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  min={startDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Requested Advance Amount */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Requested Advance Amount (₹) <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    padding: '10px 16px',
                    background: '#E2E8F0',
                    border: '1.5px solid #CBD5E1',
                    borderRight: 'none',
                    borderTopLeftRadius: '10px',
                    borderBottomLeftRadius: '10px',
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  ₹
                </div>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 6000"
                  value={requestedAmount}
                  onChange={e => setRequestedAmount(e.target.value ? Number(e.target.value) : '')}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderTopRightRadius: '10px',
                    borderBottomRightRadius: '10px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#0F172A',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Reason / Notes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Reason / Breakdown Notes <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 400 }}>(Optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Lodging ₹3,000, Transit ₹2,000, Food ₹1,000..."
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.85rem',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Routing Notice */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#F0FDFA',
                border: '1px solid #A7F3D0',
                fontSize: '0.78rem',
                color: '#065F46',
              }}
            >
              <Info size={16} style={{ flexShrink: 0 }} />
              <span>
                {isHr
                  ? 'Policy rule: As an HR employee, your request requires CEO approval before Accounts disbursement.'
                  : 'Workflow: Employee Requests → CEO/HR Approves → Accounts Distributes → Status becomes Advance Distributed.'}
              </span>
            </div>
          </div>

          {/* Footer Action Bar */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                borderRadius: '10px',
                border: 'none',
                background: '#0E7490',
                color: '#FFFFFF',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 4px 6px -1px rgba(14, 116, 144, 0.25)',
              }}
            >
              {loading ? (
                <span>Submitting...</span>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Submit Advance Request</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default RequestAdvanceModal;
