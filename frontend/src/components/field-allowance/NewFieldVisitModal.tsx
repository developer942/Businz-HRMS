import React, { useState } from 'react';
import { X, Calendar, MapPin, Building, Briefcase, IndianRupee, AlertCircle, ArrowRight } from 'lucide-react';
import { FundingType } from '../../types/fieldAdvance';
import { createFieldVisit } from '../../services/fieldAdvanceService';

interface NewFieldVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  currentUser: any;
}

export const NewFieldVisitModal: React.FC<NewFieldVisitModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  currentUser,
}) => {
  const [fundingType, setFundingType] = useState<FundingType>('advance');
  const [purpose, setPurpose] = useState('');
  const [clientName, setClientName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [requestedAmount, setRequestedAmount] = useState<number | ''>('');
  const [travelMode, setTravelMode] = useState('Train');
  const [justification, setJustification] = useState('');
  const [remarks, setRemarks] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!purpose.trim()) {
      setError('Visit purpose is required');
      return;
    }
    if (!clientName.trim()) {
      setError('Customer / Site name is required');
      return;
    }
    if (!destination.trim()) {
      setError('Destination location is required');
      return;
    }
    if (!startDate || !endDate) {
      setError('Start and End dates are required');
      return;
    }
    if (endDate < startDate) {
      setError('End date cannot be earlier than start date');
      return;
    }

    if (fundingType === 'advance') {
      if (!requestedAmount || Number(requestedAmount) <= 0) {
        setError('Requested advance amount must be greater than ₹0');
        return;
      }
    }

    setLoading(true);
    try {
      await createFieldVisit({
        employee_id: currentUser.employeeId || currentUser.id,
        employee_code: currentUser.employee_code || currentUser.employeeId || '',
        employee_name: currentUser.name || 'Current Employee',
        department_name: currentUser.department || 'Operations',
        purpose: purpose.trim(),
        client_name: clientName.trim(),
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        funding_type: fundingType,
        requested_amount: fundingType === 'advance' ? Number(requestedAmount) : 0,
        travel_mode: travelMode,
        justification: justification.trim() || null,
        remarks: remarks.trim() || null,
      });

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create field visit');
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
        background: 'rgba(15, 23, 42, 0.6)', 
        backdropFilter: 'blur(4px)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '16px',
        overflowY: 'auto'
      }}
    >
      <div 
        className="modal-content" 
        style={{ 
          width: '100%', 
          maxWidth: '640px', 
          background: '#FFFFFF', 
          borderRadius: '20px', 
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', 
          overflow: 'hidden', 
          display: 'flex', 
          flexDirection: 'column', 
          maxHeight: 'calc(100vh - 40px)',
          margin: 'auto'
        }}
      >
        {/* Header */}
        <div 
          className="modal-header" 
          style={{ 
            padding: '18px 24px', 
            borderBottom: '1px solid #E2E8F0', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            background: '#F8FAFC'
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
              New Field Visit Request
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
              Plan site visit, request trip advance or log personal expenses
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
              cursor: 'pointer',
              fontSize: '14px',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div className="modal-body" style={{ padding: '22px 24px', overflowY: 'auto', flex: 1 }}>
            {error && (
              <div 
                style={{ 
                  padding: '12px 14px', 
                  borderRadius: '10px', 
                  background: '#FEF2F2', 
                  border: '1px solid #F87171', 
                  color: '#B91C1C', 
                  fontSize: '0.82rem', 
                  fontWeight: 600, 
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Funding Selector */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                Funding Method
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                {/* Option A */}
                <div
                  onClick={() => setFundingType('advance')}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '14px',
                    border: fundingType === 'advance' ? '2px solid #0E7490' : '1px solid #E2E8F0',
                    background: fundingType === 'advance' ? '#F0FDFA' : '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: fundingType === 'advance' ? '0 2px 6px rgba(14, 116, 144, 0.15)' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.88rem', color: fundingType === 'advance' ? '#0E7490' : '#1E293B' }}>
                      <IndianRupee size={16} color={fundingType === 'advance' ? '#0E7490' : '#64748B'} />
                      <span>Option A: Company Advance</span>
                    </div>
                    <input
                      type="radio"
                      name="fundingType"
                      checked={fundingType === 'advance'}
                      onChange={() => setFundingType('advance')}
                      style={{ accentColor: '#0E7490', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B', lineHeight: 1.4 }}>
                    Request advance funds before travel. Approved by CEO &amp; disbursed by Accounts.
                  </p>
                </div>

                {/* Option B */}
                <div
                  onClick={() => setFundingType('personal')}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '14px',
                    border: fundingType === 'personal' ? '2px solid #0E7490' : '1px solid #E2E8F0',
                    background: fundingType === 'personal' ? '#F0FDFA' : '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: fundingType === 'personal' ? '0 2px 6px rgba(14, 116, 144, 0.15)' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.88rem', color: fundingType === 'personal' ? '#0E7490' : '#1E293B' }}>
                      <Briefcase size={16} color={fundingType === 'personal' ? '#0E7490' : '#64748B'} />
                      <span>Option B: Personal Money</span>
                    </div>
                    <input
                      type="radio"
                      name="fundingType"
                      checked={fundingType === 'personal'}
                      onChange={() => setFundingType('personal')}
                      style={{ accentColor: '#0E7490', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B', lineHeight: 1.4 }}>
                    Spend own funds during visit. Skip advance queue and claim full reimbursement upon return.
                  </p>
                </div>
              </div>
            </div>

            {/* Advance Amount (if Option A) */}
            {fundingType === 'advance' && (
              <div style={{ padding: '16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '14px', marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#92400E', marginBottom: '8px' }}>
                  Requested Advance Amount (₹) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#FFFFFF', border: '1px solid #FCD34D', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
                  <span style={{ padding: '10px 14px', background: '#FEF3C7', borderRight: '1px solid #FCD34D', fontWeight: 800, color: '#B45309', fontSize: '0.9rem' }}>₹</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={requestedAmount}
                    onChange={(e) => setRequestedAmount(e.target.value ? Number(e.target.value) : '')}
                    placeholder="e.g. 6000"
                    style={{ border: 'none', padding: '10px 14px', flex: 1, fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', outline: 'none' }}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#78350F', marginBottom: '4px' }}>Travel Mode</label>
                    <select
                      value={travelMode}
                      onChange={(e) => setTravelMode(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none' }}
                    >
                      <option value="Train">Train</option>
                      <option value="Bus">Bus</option>
                      <option value="Flight">Flight</option>
                      <option value="Personal Two-Wheeler">Personal Two-Wheeler</option>
                      <option value="Company Vehicle">Company Vehicle</option>
                      <option value="Cab / Taxi">Cab / Taxi</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#78350F', marginBottom: '4px' }}>Advance Justification</label>
                    <input
                      type="text"
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      placeholder="e.g. Lodging & transit"
                      style={{ width: '100%', padding: '8px 12px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Purpose & Destination */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Client / Site Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Building size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Apex Industrial Corp"
                    style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none', background: '#FFFFFF' }}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Destination Location <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g. Coimbatore Plant 2"
                    style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none', background: '#FFFFFF' }}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Start Date <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none', background: '#FFFFFF' }}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  End Date <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none', background: '#FFFFFF' }}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Purpose Details */}
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Visit Purpose &amp; Scope <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea
                rows={2}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Machine inspection, client delivery sign-off and service validation"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none', background: '#FFFFFF', resize: 'vertical' }}
                required
              />
            </div>

            {/* Remarks */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>
                Additional Notes
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional notes or hotel booking requirements"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none', background: '#FFFFFF' }}
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div 
            className="modal-footer" 
            style={{ 
              padding: '16px 24px', 
              borderTop: '1px solid #E2E8F0', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'flex-end', 
              gap: '10px', 
              background: '#F8FAFC' 
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ padding: '9px 18px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                padding: '9px 20px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {loading ? (
                'Submitting...'
              ) : (
                <>
                  <span>Create Field Visit</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewFieldVisitModal;