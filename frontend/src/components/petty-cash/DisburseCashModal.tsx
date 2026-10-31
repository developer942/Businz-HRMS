// VRM Enterprise HRMS - Accounts Cash Disbursement Modal
import React, { useState } from 'react';
import { CreditCard, Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { pettyCashService } from '../../services/pettyCashService';
import type { PettyCashRequest, PettyCashDisbursement, PaymentMode } from '../../types/pettyCash';

interface DisburseCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: PettyCashRequest | null;
  onDisbursed: (disbursement: PettyCashDisbursement) => void;
}

export const DisburseCashModal: React.FC<DisburseCashModalProps> = ({
  isOpen,
  onClose,
  request,
  onDisbursed,
}) => {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (request) {
      setPaymentReference(`VCH-${Date.now().toString().slice(-6)}`);
      setRemarks('');
      setFile(null);
      setError(null);
    }
  }, [request]);

  if (!isOpen || !request) return null;

  const approvedAmount = Number(request.approved_amount || request.requested_amount);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!paymentReference.trim()) {
      setError('Please provide a cash voucher number or transaction reference.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let proofUrl: string | undefined = undefined;
      if (file) {
        setUploading(true);
        try {
          const uploadRes = await pettyCashService.uploadAttachment(file, 'DISBURSEMENT');
          proofUrl = uploadRes.fileUrl;
        } catch (uploadErr) {
          console.warn('[DisburseCashModal] Upload warning, continuing with disbursement:', uploadErr);
        } finally {
          setUploading(false);
        }
      }

      // Requirement: Full approved amount must be disbursed
      const disbursement = await pettyCashService.disburseCash(request.id, {
        disbursedAmount: approvedAmount,
        paymentMode,
        paymentDate,
        paymentReference: paymentReference.trim(),
        remarks: remarks.trim() || undefined,
        paymentProofUrl: proofUrl,
      });

      onDisbursed(disbursement);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record cash disbursement.');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <div className="petty-cash-modal-overlay" onClick={onClose}>
      <div className="petty-cash-modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <CreditCard size={20} color="var(--color-primary-blue)" />
            Disburse Petty Cash — {request.request_number}
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

            <div
              style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>CUSTODIAN BENEFICIARY</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#14532D' }}>{request.custodian_name}</div>
                <div style={{ fontSize: '0.75rem', color: '#166534' }}>ID: {request.custodian_employee_id}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>CEO APPROVED AMOUNT</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#15803D' }}>
                  ₹{approvedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#166534' }}>Must be disbursed in full</div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>
                  Disbursement Amount (₹) <span className="required">*</span>
                </label>
                <input
                  type="number"
                  readOnly
                  className="petty-cash-input"
                  style={{ width: '100%', background: '#F1F5F9', fontWeight: 700 }}
                  value={approvedAmount}
                />
                <div className="field-hint">Partial disbursements are strictly prohibited by policy.</div>
              </div>

              <div className="form-group">
                <label>
                  Payment Mode <span className="required">*</span>
                </label>
                <select
                  className="petty-cash-select"
                  style={{ width: '100%' }}
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  required
                >
                  <option value="Cash">Physical Cash</option>
                  <option value="UPI">UPI (GooglePay / PhonePe / Paytm)</option>
                  <option value="Bank Transfer">Bank Transfer (IMPS / NEFT)</option>
                  <option value="Cheque">Company Cheque</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>
                  Payment Date <span className="required">*</span>
                </label>
                <input
                  type="date"
                  className="petty-cash-input"
                  style={{ width: '100%' }}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  Payment Reference / Voucher # <span className="required">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. VCH-00428 or UPI-UTR-123456"
                  className="petty-cash-input"
                  style={{ width: '100%' }}
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Accounts Remarks</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="e.g. Handed physical cash of ₹10,000 from main safe drawer #2..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Signed Voucher / Bank Transfer Proof (Optional)</label>
              <div className={`upload-dropzone ${file ? 'has-file' : ''}`}>
                <label style={{ cursor: 'pointer', display: 'block' }}>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  {file ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <CheckCircle2 size={18} color="#16A34A" />
                      <span style={{ fontWeight: 600, color: '#166534' }}>{file.name}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <Upload size={20} color="var(--color-primary-blue)" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary-blue)' }}>
                        Upload signed cash payment voucher or transaction slip
                      </span>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading || uploading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || uploading || !paymentReference.trim()}
            >
              {loading || uploading ? 'Confirming Disbursement...' : 'Confirm Cash Given'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
