import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, ShieldAlert, ShieldQuestion, Calendar, FileText, UserCheck, CheckCircle2 } from 'lucide-react';
import { crmService } from '../../../services/crmService';
import { useHRMS } from '../../../context/HRMSContext';
import type { CrmContact, CrmConsentStatus } from '../../../types/crm';

interface RecordConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: CrmContact;
  onConsentRecorded: (updatedContact: CrmContact) => void;
}

const COMMON_SOURCES = [
  'Visiting Card / Trade Fair / Expo',
  'Customer Inbound WhatsApp Request',
  'Physical Form / Signed Agreement',
  'Website Form / Online Inquiry',
  'Verbal / Phone Confirmation',
  'Internal Employment Contract',
  'Other (specify in notes)'
];

export const RecordConsentModal: React.FC<RecordConsentModalProps> = ({
  isOpen,
  onClose,
  contact,
  onConsentRecorded
}) => {
  const { currentUser } = useHRMS();
  const recordedByName = currentUser?.name || currentUser?.employeeId || 'Authorized User';

  const [status, setStatus] = useState<CrmConsentStatus>(contact.consentStatus || 'Unknown');
  const [source, setSource] = useState<string>(
    contact.consentSource || 'Visiting Card / Trade Fair / Expo'
  );
  // Default to current local datetime string YYYY-MM-DDTHH:mm
  const [consentDate, setConsentDate] = useState<string>(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 16);
    return localISOTime;
  });
  const [notes, setNotes] = useState<string>(contact.consentNotes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStatus(contact.consentStatus || 'Unknown');
      setSource(contact.consentSource || 'Visiting Card / Trade Fair / Expo');
      setNotes(contact.consentNotes || '');
      setError(null);
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      setConsentDate((new Date(now.getTime() - offset)).toISOString().slice(0, 16));
    }
  }, [isOpen, contact]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const updated = await crmService.recordConsent(contact.id, {
        consentStatus: status,
        consentDate: consentDate ? new Date(consentDate).toISOString() : new Date().toISOString(),
        source: source.trim(),
        notes: notes.trim() || undefined
      });

      onConsentRecorded(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record WhatsApp consent');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 25000,
        padding: '16px',
        backdropFilter: 'blur(2px)'
      }}
    >
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.05)',
          border: '1px solid #E2E8F0',
          fontFamily: "'DM Sans', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#ECFEFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0E7490'
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>
                Record WhatsApp Consent
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                Audit-trailed permission for WhatsApp Business messaging
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="crm-icon-btn"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94A3B8',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Contact Info Capsule */}
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#F8FAFC',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B' }}>
              {contact.name}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
              {contact.phone} {contact.companyName ? `• ${contact.companyName}` : ''}
            </div>
          </div>
          <div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: '9999px',
                backgroundColor: contact.consentStatus === 'Opted In' ? '#DCFCE7' : contact.consentStatus === 'Opted Out' ? '#FEE2E2' : '#FEF3C7',
                color: contact.consentStatus === 'Opted In' ? '#166534' : contact.consentStatus === 'Opted Out' ? '#991B1B' : '#92400E'
              }}
            >
              Current: {contact.consentStatus}
            </span>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '8px',
              color: '#991B1B',
              fontSize: '0.8rem',
              marginBottom: '16px'
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Status Choice */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
              Consent Status <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {/* Opted In */}
              <button
                type="button"
                onClick={() => setStatus('Opted In')}
                style={{
                  padding: '10px 8px',
                  borderRadius: '10px',
                  border: status === 'Opted In' ? '2px solid #16A34A' : '1px solid #E2E8F0',
                  backgroundColor: status === 'Opted In' ? '#F0FDF4' : '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <ShieldCheck size={18} color="#16A34A" />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534' }}>
                  Opted In
                </span>
                <span style={{ fontSize: '0.68rem', color: '#4B5563' }}>
                  Allows Marketing
                </span>
              </button>

              {/* Opted Out */}
              <button
                type="button"
                onClick={() => setStatus('Opted Out')}
                style={{
                  padding: '10px 8px',
                  borderRadius: '10px',
                  border: status === 'Opted Out' ? '2px solid #DC2626' : '1px solid #E2E8F0',
                  backgroundColor: status === 'Opted Out' ? '#FEF2F2' : '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <ShieldAlert size={18} color="#DC2626" />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991B1B' }}>
                  Opted Out
                </span>
                <span style={{ fontSize: '0.68rem', color: '#4B5563' }}>
                  Revoked
                </span>
              </button>

              {/* Unknown */}
              <button
                type="button"
                onClick={() => setStatus('Unknown')}
                style={{
                  padding: '10px 8px',
                  borderRadius: '10px',
                  border: status === 'Unknown' ? '2px solid #D97706' : '1px solid #E2E8F0',
                  backgroundColor: status === 'Unknown' ? '#FFFBEB' : '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <ShieldQuestion size={18} color="#D97706" />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400E' }}>
                  Unknown
                </span>
                <span style={{ fontSize: '0.68rem', color: '#4B5563' }}>
                  Unverified
                </span>
              </button>
            </div>
          </div>

          {/* Consent Date & Time */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Calendar size={13} color="#0E7490" />
                <span>Consent Date & Time</span>
              </span>
            </label>
            <input
              type="datetime-local"
              value={consentDate}
              onChange={e => setConsentDate(e.target.value)}
              required
              className="crm-form-input"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.84rem',
                color: '#1E293B',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Consent Source */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <FileText size={13} color="#0E7490" />
                <span>Consent Source / Verification Channel</span>
              </span>
            </label>
            <select
              value={COMMON_SOURCES.includes(source) ? source : 'Other (specify in notes)'}
              onChange={e => {
                if (e.target.value !== 'Other (specify in notes)') {
                  setSource(e.target.value);
                } else {
                  setSource('Other / Offline Agreement');
                }
              }}
              className="crm-form-input"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.84rem',
                color: '#1E293B',
                boxSizing: 'border-box',
                backgroundColor: '#FFFFFF',
                marginBottom: '6px'
              }}
            >
              {COMMON_SOURCES.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Supporting Note */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
              Supporting Note / Verification Evidence
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g., Exchanged visiting cards at Renewable Energy Expo; requested product catalogue via WhatsApp."
              rows={3}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.82rem',
                color: '#1E293B',
                boxSizing: 'border-box',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Recorded By User Audit Card */}
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: '#F1F5F9',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.74rem',
              color: '#475569'
            }}
          >
            <UserCheck size={14} color="#0E7490" />
            <span>
              Recorded by: <strong>{recordedByName}</strong> ({currentUser?.role || 'Staff'}) • Audit logged
            </span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '9px 16px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 20px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
              }}
            >
              <CheckCircle2 size={16} />
              <span>{saving ? 'Recording...' : 'Save Consent Record'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
