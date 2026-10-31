// VRM Enterprise HRMS - CEO Fund Request Approval Modal
import React, { useState } from 'react';
import { CheckCircle2, XCircle, X, FileText, AlertCircle } from 'lucide-react';
import { pettyCashService } from '../../services/pettyCashService';
import type { PettyCashRequest } from '../../types/pettyCash';

interface CeoApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: PettyCashRequest | null;
  currentBalance: number;
  onActionComplete: (updated: PettyCashRequest) => void;
  onViewProof?: (url: string, name: string) => void;
}

export const CeoApprovalModal: React.FC<CeoApprovalModalProps> = ({
  isOpen,
  onClose,
  request,
  currentBalance,
  onActionComplete,
  onViewProof,
}) => {
  const [approvedAmount, setApprovedAmount] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (request) {
      setApprovedAmount(String(request.requested_amount));
      setRemarks('');
      setActionType('APPROVE');
      setError(null);
    }
  }, [request]);

  if (!isOpen || !request) return null;

  const handleSubmit = async (action: 'APPROVE' | 'REJECT') => {
    try {
      setLoading(true);
      setError(null);

      const numAmount = Number(approvedAmount);
      if (action === 'APPROVE' && (isNaN(numAmount) || numAmount <= 0)) {
        setError('Please enter a valid positive approved amount.');
        setLoading(false);
        return;
      }

      const finalRemarks = remarks.trim() || (action === 'APPROVE' ? 'Approved by CEO' : 'Rejected by CEO');

      const updated = await pettyCashService.approveRequest(request.id, {
        action,
        approvedAmount: action === 'APPROVE' ? numAmount : undefined,
        remarks: finalRemarks,
      });

      onActionComplete(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || `Failed to ${action.toLowerCase()} request.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="petty-cash-modal-overlay" onClick={onClose}>
      <div className="petty-cash-modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <CheckCircle2 size={20} color="var(--color-primary-blue)" />
            Review Petty Cash Request — {request.request_number}
          </h3>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

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

          {/* Request Overview Grid */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '18px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                CUSTODIAN EMPLOYEE
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {request.custodian_name || request.employee_name || 'Assigned Custodian'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                ID: {request.custodian_employee_id || request.employee_code || 'N/A'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                CURRENT AVAILABLE CASH
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-primary-blue)' }}>
                ₹{Number(currentBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                In employee hand right now
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                REQUESTED AMOUNT
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1E293B' }}>
                ₹{Number(request.requested_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                REQUEST DATE
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {request.request_date}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Purpose / Operational Reason</label>
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.875rem',
                color: '#334155',
                lineHeight: 1.5,
              }}
            >
              {request.purpose}
            </div>
          </div>

          {request.supporting_document_url && (
            <div className="form-group">
              <label>Supporting Document</label>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => onViewProof?.(request.supporting_document_url!, 'Supporting Document')}
              >
                <FileText size={14} color="var(--color-primary-blue)" /> View Attached Requisition Proof
              </button>
            </div>
          )}

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label>Approved Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              min="1"
              className="petty-cash-input"
              style={{ width: '100%', fontSize: '1.1rem', fontWeight: 700 }}
              value={approvedAmount}
              onChange={(e) => setApprovedAmount(e.target.value)}
            />
            <div className="field-hint">
              CEO can approve the full requested amount or revise if necessary.
            </div>
          </div>

          <div className="form-group">
            <label>CEO Remarks & Directives</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="e.g. Approved for operational procurement. Accounts team to disburse in full via cash/UPI."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn-danger"
            disabled={loading}
            onClick={() => handleSubmit('REJECT')}
          >
            <XCircle size={16} /> Reject Request
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={loading || !approvedAmount}
              onClick={() => handleSubmit('APPROVE')}
            >
              <CheckCircle2 size={16} /> {loading ? 'Processing...' : 'Approve for Disbursement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
