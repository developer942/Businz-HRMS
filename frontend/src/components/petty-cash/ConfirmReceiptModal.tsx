// VRM Enterprise HRMS - Custodian Cash Receipt Confirmation Modal
import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, X, ShieldCheck } from 'lucide-react';
import { pettyCashService } from '../../services/pettyCashService';
import type { PettyCashDisbursement, PettyCashReceipt } from '../../types/pettyCash';

interface ConfirmReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  disbursement: PettyCashDisbursement | null;
  onConfirmed: (receipt: PettyCashReceipt, newBalance: number) => void;
  onDisputed: (receipt: PettyCashReceipt) => void;
}

export const ConfirmReceiptModal: React.FC<ConfirmReceiptModalProps> = ({
  isOpen,
  onClose,
  disbursement,
  onConfirmed,
  onDisputed,
}) => {
  const [action, setAction] = useState<'CONFIRM' | 'DISPUTE'>('CONFIRM');
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (disbursement) {
      setReceivedAmount(String(disbursement.disbursed_amount));
      setAction('CONFIRM');
      setDiscrepancyReason('');
      setError(null);
    }
  }, [disbursement]);

  if (!isOpen || !disbursement) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      const amount = Number(receivedAmount);
      if (action === 'DISPUTE' && !discrepancyReason.trim()) {
        setError('Please describe the discrepancy reason or explain why cash was not received.');
        setLoading(false);
        return;
      }

      const res = await pettyCashService.confirmCashReceipt({
        disbursementId: disbursement.id,
        action,
        amountReceived: action === 'CONFIRM' ? amount : undefined,
        discrepancyReason: action === 'DISPUTE' ? discrepancyReason.trim() : undefined,
      });

      if (action === 'CONFIRM') {
        onConfirmed(res.receipt, res.newBalance);
      } else {
        onDisputed(res.receipt);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to process receipt confirmation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="petty-cash-modal-overlay" onClick={onClose}>
      <div className="petty-cash-modal" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <ShieldCheck size={20} color="var(--color-primary-blue)" />
            Cash Received Confirmation — {disbursement.disbursement_number}
          </h3>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div
                style={{
                  background: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                }}
              >
                {error}
              </div>
            )}

            {/* Disbursement Details Card */}
            <div
              style={{
                background: '#ECFEFF',
                border: '1px solid #CFFAFE',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#0E7490', fontWeight: 600 }}>DISBURSED BY ACCOUNTS</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#155E75' }}>
                  {disbursement.disbursed_by_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#0E7490' }}>Date: {disbursement.payment_date}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#0E7490', fontWeight: 600 }}>DISBURSED AMOUNT</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0E7490' }}>
                  ₹{Number(disbursement.disbursed_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#0E7490' }}>
                  Mode: {disbursement.payment_mode} ({disbursement.payment_reference})
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Confirmation Action</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: `1.5px solid ${action === 'CONFIRM' ? '#0E7490' : '#E2E8F0'}`,
                    background: action === 'CONFIRM' ? '#F0FDFA' : '#FFFFFF',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  <input
                    type="radio"
                    name="confirmAction"
                    checked={action === 'CONFIRM'}
                    onChange={() => setAction('CONFIRM')}
                    style={{ accentColor: '#0E7490' }}
                  />
                  <CheckCircle2 size={16} color="#0E7490" />
                  Confirm Cash Received
                </label>

                <label
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: `1.5px solid ${action === 'DISPUTE' ? '#EF4444' : '#E2E8F0'}`,
                    background: action === 'DISPUTE' ? '#FEF2F2' : '#FFFFFF',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  <input
                    type="radio"
                    name="confirmAction"
                    checked={action === 'DISPUTE'}
                    onChange={() => setAction('DISPUTE')}
                    style={{ accentColor: '#EF4444' }}
                  />
                  <AlertTriangle size={16} color="#EF4444" />
                  Report Discrepancy
                </label>
              </div>
            </div>

            {action === 'CONFIRM' ? (
              <div className="form-group">
                <label>
                  Confirmed Amount Received (₹) <span className="required">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  readOnly
                  className="petty-cash-input"
                  style={{ width: '100%', fontSize: '1.1rem', fontWeight: 700, background: '#F8FAFC' }}
                  value={receivedAmount}
                />
                <div className="field-hint">
                  Clicking confirm will atomically credit your petty cash account balance by ₹
                  {Number(disbursement.disbursed_amount).toFixed(2)}.
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label>
                  Discrepancy Details / Explanation <span className="required">*</span>
                </label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Explain why the disbursement is disputed (e.g. Physical cash envelope contained ₹8,000 instead of ₹10,000, or cash was not received)..."
                  value={discrepancyReason}
                  onChange={(e) => setDiscrepancyReason(e.target.value)}
                  required
                />
                <div className="field-hint" style={{ color: '#DC2626' }}>
                  Petty cash balance will NOT be credited until Accounts and CEO investigate and resolve the dispute.
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className={action === 'CONFIRM' ? 'btn-primary' : 'btn-danger'}
              disabled={loading}
            >
              {loading
                ? 'Processing...'
                : action === 'CONFIRM'
                ? 'Confirm & Credit Balance'
                : 'Submit Discrepancy Dispute'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
