// VRM Enterprise HRMS - Request Petty Cash Fund Modal (Custodian)
import React, { useState } from 'react';
import { Send, Upload, X, FileText, CheckCircle2 } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { pettyCashService } from '../../services/pettyCashService';
import type { PettyCashRequest } from '../../types/pettyCash';

interface RequestPettyCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestCreated: (request: PettyCashRequest) => void;
  currentBalance: number;
}

export const RequestPettyCashModal: React.FC<RequestPettyCashModalProps> = ({
  isOpen,
  onClose,
  onRequestCreated,
  currentBalance,
}) => {
  const { currentUser } = useHRMS();
  const [requestedAmount, setRequestedAmount] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split('T')[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!validTypes.includes(selected.type)) {
        setError('Supporting file must be a JPG, PNG, or PDF.');
        return;
      }
      if (selected.size > 10 * 1024 * 1024) {
        setError('Attachment exceeds the 10MB safe size limit.');
        return;
      }
      setError(null);
      setFile(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(requestedAmount);

    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid positive fund amount (minimum ₹1.00).');
      return;
    }

    if (!purpose.trim()) {
      setError('A meaningful purpose or justification is required.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let attachmentUrl: string | undefined = undefined;
      if (file) {
        setUploading(true);
        try {
          const uploadRes = await pettyCashService.uploadAttachment(file, 'REQUEST');
          attachmentUrl = uploadRes.fileUrl;
        } catch (uploadErr) {
          console.warn('[RequestPettyCashModal] Upload warning, continuing with request:', uploadErr);
        } finally {
          setUploading(false);
        }
      }

      const newRequest = await pettyCashService.requestPettyCash({
        requestedAmount: amount,
        purpose: purpose.trim(),
        requestDate: todayStr,
        supportingDocumentUrl: attachmentUrl,
      });

      onRequestCreated(newRequest);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit fund request.');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <div className="petty-cash-modal-overlay" onClick={onClose}>
      <div className="petty-cash-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <Send size={20} color="var(--color-primary-blue)" />
            Request Petty Cash Funds
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

            {/* Read-Only Custodian Info */}
            <div className="form-row" style={{ marginBottom: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Custodian Employee Name</label>
                <input
                  type="text"
                  readOnly
                  className="petty-cash-input"
                  style={{ width: '100%', background: '#F1F5F9', color: '#475569' }}
                  value={currentUser.name || currentUser.email}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Employee ID / Code</label>
                <input
                  type="text"
                  readOnly
                  className="petty-cash-input"
                  style={{ width: '100%', background: '#F1F5F9', color: '#475569' }}
                  value={currentUser.employeeId || currentUser.id}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>
                  Requested Amount (₹) <span className="required">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  inputMode="decimal"
                  placeholder="e.g. 10000.00"
                  className="petty-cash-input"
                  style={{ width: '100%', fontSize: '1.1rem', fontWeight: 700 }}
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                  required
                />
                <div className="field-hint">
                  Current cash on hand: ₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="form-group">
                <label>Request Date</label>
                <input
                  type="date"
                  className="petty-cash-input"
                  style={{ width: '100%' }}
                  defaultValue={todayStr}
                  readOnly
                />
              </div>
            </div>

            <div className="form-group">
              <label>
                Purpose / Operational Reason <span className="required">*</span>
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Explain the operational needs (e.g., Office pantry provisions, urgent client courier, stationery refill)..."
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Optional Supporting Attachment (JPG / PNG / PDF)</label>
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
                      <CheckCircle2 size={20} color="#16A34A" />
                      <span style={{ fontWeight: 600, color: '#166534' }}>{file.name}</span>
                      <span style={{ fontSize: '0.75rem', color: '#65A30D' }}>
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <Upload size={24} color="var(--color-primary-blue)" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary-blue)' }}>
                        Click to upload estimate or requisition quote
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        Max safe size: 10MB
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
              disabled={loading || uploading || !requestedAmount || !purpose.trim()}
            >
              {loading || uploading ? 'Submitting to CEO...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
