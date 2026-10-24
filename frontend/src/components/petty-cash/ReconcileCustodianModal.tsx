// VRM Enterprise HRMS - Safe Custodian Handover & Reconciliation Modal
import React, { useState } from 'react';
import { ArrowLeftRight, AlertCircle, CheckCircle2, X, ShieldAlert } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { pettyCashService } from '../../services/pettyCashService';
import type { PettyCashAccount } from '../../types/pettyCash';

interface ReconcileCustodianModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReconciled: (newAccount: PettyCashAccount) => void;
  activeAccount: PettyCashAccount | null;
}

export const ReconcileCustodianModal: React.FC<ReconcileCustodianModalProps> = ({
  isOpen,
  onClose,
  onReconciled,
  activeAccount,
}) => {
  const { employees, currentUser } = useHRMS();
  const [newEmpId, setNewEmpId] = useState<string>('');
  const [physicalCashCount, setPhysicalCashCount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !activeAccount) return null;

  const currentBalance = Number(activeAccount.current_balance || 0);
  const countedCash = physicalCashCount === '' ? 0 : Number(physicalCashCount);
  const discrepancy = countedCash - currentBalance;

  // Active employees excluding current custodian and current CEO
  const eligibleEmployees = employees.filter(
    (e) =>
      (e.status === 'Active' || !e.status) &&
      e.id !== activeAccount.custodian_id &&
      e.employeeId !== activeAccount.custodian_employee_id
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpId) {
      setError('Please select a new employee custodian.');
      return;
    }

    if (physicalCashCount === '' || isNaN(countedCash) || countedCash < 0) {
      setError('Please enter a valid non-negative physical cash count.');
      return;
    }

    if (!notes.trim()) {
      setError('Reconciliation notes and handover justification are required for audit compliance.');
      return;
    }

    const newEmp = employees.find((e) => e.id === newEmpId || e.employeeId === newEmpId);
    if (!newEmp) {
      setError('Selected replacement employee not found in active records.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const updatedAccount = await pettyCashService.reconcileAndTransferCustodian({
        newEmployeeId: newEmp.id,
        newEmployeeName: `${newEmp.firstName} ${newEmp.lastName}`.trim() || 'New Custodian',
        newEmployeeCode: newEmp.employeeId || newEmp.id,
        physicalCashCount: countedCash,
        reconciliationNotes: notes.trim(),
        witnessCeoOrAccountsId: currentUser.id,
      });

      onReconciled(updatedAccount);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Custodian handover failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="petty-cash-modal-overlay" onClick={onClose}>
      <div className="petty-cash-modal" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <ArrowLeftRight size={20} color="var(--color-primary-blue)" />
            Safe Custodian Handover & Reconciliation
          </h3>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div
              style={{
                background: '#F1F5F9',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  CURRENT CUSTODIAN
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {activeAccount.custodian_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  Code: {activeAccount.custodian_employee_id}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  SYSTEM LEDGER BALANCE
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary-blue)' }}>
                  ₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  Derived from immutable transaction ledger
                </div>
              </div>
            </div>

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
                Physical Cash Counted in Hand (₹) <span className="required">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="petty-cash-input"
                style={{ width: '100%', fontSize: '1.05rem', fontWeight: 700 }}
                placeholder="0.00"
                value={physicalCashCount}
                onChange={(e) => setPhysicalCashCount(e.target.value)}
                required
              />
              <div className="field-hint">
                Enter the exact amount of physical currency in the petty cash drawer/box.
              </div>
            </div>

            {/* Discrepancy Indicator */}
            {physicalCashCount !== '' && (
              <div
                style={{
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: discrepancy === 0 ? '#DCFCE7' : '#FEF3C7',
                  border: `1px solid ${discrepancy === 0 ? '#86EFAC' : '#FDE68A'}`,
                  color: discrepancy === 0 ? '#166534' : '#92400E',
                }}
              >
                {discrepancy === 0 ? (
                  <>
                    <CheckCircle2 size={18} />
                    <span>
                      <strong>Reconciliation Clean:</strong> Physical cash exactly matches ledger balance (₹
                      {currentBalance.toFixed(2)}).
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={18} />
                    <span>
                      <strong>Discrepancy of ₹{Math.abs(discrepancy).toFixed(2)}:</strong>{' '}
                      {discrepancy > 0 ? 'Surplus physical cash found.' : 'Shortage in physical cash drawer.'} Handover
                      notes must explain this variance.
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="form-group">
              <label>
                Select New Custodian <span className="required">*</span>
              </label>
              <select
                className="petty-cash-select"
                style={{ width: '100%' }}
                value={newEmpId}
                onChange={(e) => setNewEmpId(e.target.value)}
                required
              >
                <option value="">-- Choose Successor Custodian --</option>
                {eligibleEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeId || emp.id}) — {emp.designation || 'Staff'}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>
                Mandatory Handover & Reconciliation Notes <span className="required">*</span>
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Detail verification of physical vouchers, counting witnesses, cash count breakdown, and reason for reassignment..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading || !newEmpId || physicalCashCount === ''}>
              {loading ? 'Reconciling & Transferring...' : 'Execute Safe Handover'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
