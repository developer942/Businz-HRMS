// VRM Enterprise HRMS - CEO Assign Petty Cash Custodian Modal
import React, { useState } from 'react';
import { UserCheck, AlertTriangle, X, ShieldAlert, ArrowRight } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { pettyCashService } from '../../services/pettyCashService';
import type { PettyCashAccount } from '../../types/pettyCash';

interface AssignCustodianModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssigned: (account: PettyCashAccount) => void;
  activeAccount: PettyCashAccount | null;
  onOpenReconciliation: () => void;
}

export const AssignCustodianModal: React.FC<AssignCustodianModalProps> = ({
  isOpen,
  onClose,
  onAssigned,
  activeAccount,
  onOpenReconciliation,
}) => {
  const { employees, currentUser } = useHRMS();
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState<number>(1000);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Active employees only
  const activeEmployees = employees.filter(
    (e) => (e.status === 'Active' || !e.status) && e.id !== currentUser.id
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId) {
      setError('Please select an active employee from the directory.');
      return;
    }

    const employee = employees.find((e) => e.id === selectedEmpId || e.employeeId === selectedEmpId);
    if (!employee) {
      setError('Selected employee was not found in active records.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const account = await pettyCashService.assignCustodian({
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`.trim() || 'Custodian',
        employeeCode: employee.employeeId || employee.id,
        lowBalanceThreshold: Number(lowBalanceThreshold) || 1000,
        notes: notes.trim() || undefined,
      });

      onAssigned(account);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to assign custodian');
    } finally {
      setLoading(false);
    }
  };

  const hasExistingAccount = activeAccount && activeAccount.status === 'ACTIVE';

  return (
    <div className="petty-cash-modal-overlay" onClick={onClose}>
      <div className="petty-cash-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <UserCheck size={20} color="var(--color-primary-blue)" />
            Assign Petty Cash Custodian
          </h3>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {hasExistingAccount && (
              <div
                style={{
                  background: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  marginBottom: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400E', fontWeight: 700 }}>
                  <ShieldAlert size={18} />
                  Active Custodian Already Exists
                </div>
                <p style={{ margin: 0, fontSize: '0.825rem', color: '#78350F' }}>
                  <strong>{activeAccount.custodian_name}</strong> currently holds an active petty cash account with an available balance of{' '}
                  <strong>₹{Number(activeAccount.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>.
                </p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400E' }}>
                  As per company financial policy, transferring stewardship requires a mandatory physical cash count and ledger reconciliation before handover.
                </p>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ alignSelf: 'flex-start', marginTop: '4px', borderColor: '#F59E0B', color: '#92400E' }}
                  onClick={() => {
                    onClose();
                    onOpenReconciliation();
                  }}
                >
                  Switch to Safe Custodian Handover & Reconciliation <ArrowRight size={14} />
                </button>
              </div>
            )}

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

            <div className="form-group">
              <label>
                Select Employee Custodian <span className="required">*</span>
              </label>
              <select
                className="petty-cash-select"
                style={{ width: '100%' }}
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                required
              >
                <option value="">-- Choose Active Employee --</option>
                {activeEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeId || emp.id}) — {emp.designation || 'Staff'} - {emp.department || 'General'}
                  </option>
                ))}
              </select>
              <div className="field-hint">
                Only the assigned custodian will be granted authority to request funds and record daily expenses.
              </div>
            </div>

            <div className="form-group">
              <label>Low Balance Alert Threshold (₹)</label>
              <input
                type="number"
                min="100"
                step="100"
                className="petty-cash-input"
                style={{ width: '100%' }}
                value={lowBalanceThreshold}
                onChange={(e) => setLowBalanceThreshold(Number(e.target.value))}
              />
              <div className="field-hint">
                A warning banner will appear when the available cash drops below this amount.
              </div>
            </div>

            <div className="form-group">
              <label>Custodian Notes / Authority Instructions</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Optional notes, department allocation guidelines, or special disbursement rules..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading || !selectedEmpId}>
              {loading ? 'Assigning...' : 'Confirm Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
