// VRM Enterprise HRMS - Custodian Add Daily Expense Modal
import React, { useState, useEffect } from 'react';
import { PlusCircle, Upload, X, CheckCircle2, AlertCircle, IndianRupee } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { pettyCashService } from '../../services/pettyCashService';
import type { PettyCashExpense, PettyCashCategory } from '../../types/pettyCash';

interface AddDailyExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number;
  onExpenseAdded: (result: { expense: PettyCashExpense; newBalance: number; isLowBalance: boolean }) => void;
}

export const AddDailyExpenseModal: React.FC<AddDailyExpenseModalProps> = ({
  isOpen,
  onClose,
  availableBalance,
  onExpenseAdded,
}) => {
  const { currentUser } = useHRMS();
  const [categories, setCategories] = useState<PettyCashCategory[]>([]);
  const [categoryName, setCategoryName] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Card' | 'Other'>('Cash');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      pettyCashService
        .getCategories()
        .then((cats) => {
          const normalized = (cats || []).map((c) => ({
            ...c,
            name: c.name || c.category_name || '',
            category_name: c.category_name || c.name || '',
          }));
          setCategories(normalized);
        })
        .catch(() => {
          // Fallback static categories
          const fallback = [
            { id: 'cat-001', name: 'Tea & Coffee', category_name: 'Tea & Coffee', company_id: 'company-a', is_active: true, is_system_default: true, created_at: '' },
            { id: 'cat-002', name: 'Stationery', category_name: 'Stationery', company_id: 'company-a', is_active: true, is_system_default: true, created_at: '' },
            { id: 'cat-003', name: 'Courier', category_name: 'Courier', company_id: 'company-a', is_active: true, is_system_default: true, created_at: '' },
            { id: 'cat-004', name: 'Local Transport', category_name: 'Local Transport', company_id: 'company-a', is_active: true, is_system_default: true, created_at: '' },
            { id: 'cat-005', name: 'Petrol / Fuel', category_name: 'Petrol / Fuel', company_id: 'company-a', is_active: true, is_system_default: true, created_at: '' },
            { id: 'cat-006', name: 'Office Maintenance', category_name: 'Office Maintenance', company_id: 'company-a', is_active: true, is_system_default: true, created_at: '' },
            { id: 'cat-007', name: 'Cleaning Materials', category_name: 'Cleaning Materials', company_id: 'company-a', is_active: true, is_system_default: true, created_at: '' },
            { id: 'cat-008', name: 'Other', category_name: 'Other', company_id: 'company-a', is_active: true, is_system_default: true, created_at: '' },
          ];
          setCategories(fallback);
        });
      setCategoryName('');
      setCategoryId('');
      setAmount('');
      setReason('');
      setFile(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const numAmount = Number(amount);
  const isOverBudget = numAmount > availableBalance;
  const todayStr = new Date().toISOString().split('T')[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      const valid = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!valid.includes(selected.type)) {
        setError('Proof attachment must be a JPG, PNG, or PDF file.');
        return;
      }
      if (selected.size > 10 * 1024 * 1024) {
        setError('Proof file exceeds safe 10MB limit.');
        return;
      }
      setError(null);
      setFile(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid positive expense amount.');
      return;
    }

    if (numAmount > availableBalance) {
      setError(
        `Insufficient Petty Cash Balance: Amount (₹${numAmount.toFixed(
          2
        )}) exceeds your current available balance of ₹${availableBalance.toFixed(2)}.`
      );
      return;
    }

    if (!reason.trim()) {
      setError('A meaningful reason or vendor description is required.');
      return;
    }

    if (expenseDate > todayStr) {
      setError('Future-dated expenses are not permitted.');
      return;
    }

    const trimmedCategory = categoryName.trim();
    if (!trimmedCategory) {
      setError('Expense Category is required. Please type or select a category.');
      return;
    }

    const category = categories.find(
      (c) => (c.name || c.category_name || '').toLowerCase() === trimmedCategory.toLowerCase()
    );
    const finalCatId = category ? category.id : (categoryId || 'custom');

    try {
      setLoading(true);
      setError(null);

      let billUrl: string | undefined = undefined;
      if (file) {
        setUploading(true);
        try {
          const uploadRes = await pettyCashService.uploadAttachment(file, 'EXPENSE');
          billUrl = uploadRes.fileUrl;
        } catch (uploadErr) {
          console.warn('[AddDailyExpenseModal] Upload warning, continuing with expense:', uploadErr);
        } finally {
          setUploading(false);
        }
      }

      const res = await pettyCashService.recordDailyExpense({
        categoryId: finalCatId,
        categoryName: trimmedCategory,
        amount: numAmount,
        expenseDate,
        reason: reason.trim(),
        paymentMode,
        billAttachmentUrl: billUrl,
      });

      onExpenseAdded(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record daily expense.');
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
            <PlusCircle size={20} color="var(--color-primary-blue)" />
            Record Daily Petty Cash Expense
          </h3>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Real-Time Balance Status Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: isOverBudget ? '#FEF2F2' : '#F0FDFA',
                border: `1px solid ${isOverBudget ? '#FCA5A5' : '#CCFBF1'}`,
                borderRadius: '12px',
                marginBottom: '16px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: isOverBudget ? '#991B1B' : '#0F766E', fontWeight: 600 }}>
                  CURRENT AVAILABLE CASH
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: isOverBudget ? '#DC2626' : '#0E7490',
                  }}
                >
                  ₹{availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>

              {numAmount > 0 && !isOverBudget && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: '#0F766E', fontWeight: 600 }}>BALANCE AFTER EXPENSE</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F766E' }}>
                    ₹{(availableBalance - numAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )}
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>
                  Expense Category <span className="required">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="petty-cash-input"
                    style={{ width: '100%' }}
                    list="petty-cash-category-options"
                    placeholder="Type or select category (e.g. Tea, Fuel, Stationery...)"
                    value={categoryName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCategoryName(val);
                      const matched = categories.find(
                        (c) => (c.name || c.category_name || '').toLowerCase() === val.trim().toLowerCase()
                      );
                      setCategoryId(matched ? matched.id : '');
                    }}
                    required
                    autoComplete="off"
                  />
                  <datalist id="petty-cash-category-options">
                    {categories.map((cat) => {
                      const label = cat.name || cat.category_name;
                      return <option key={cat.id} value={label} />;
                    })}
                  </datalist>
                </div>

                {/* Quick Selection Pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {categories.slice(0, 8).map((cat) => {
                    const cName = cat.name || cat.category_name || '';
                    if (!cName) return null;
                    const isSelected = categoryName.trim().toLowerCase() === cName.toLowerCase();
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setCategoryName(cName);
                          setCategoryId(cat.id);
                        }}
                        style={{
                          padding: '3px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          borderRadius: '9999px',
                          border: isSelected ? '1px solid #0E7490' : '1px solid #E2E8F0',
                          backgroundColor: isSelected ? '#ECFEFF' : '#F8FAFC',
                          color: isSelected ? '#0E7490' : '#475569',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {cName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label>
                  Expense Amount (₹) <span className="required">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.50"
                  max={availableBalance}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="petty-cash-input"
                  style={{
                    width: '100%',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    borderColor: isOverBudget ? '#EF4444' : undefined,
                  }}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>
                  Expense Date <span className="required">*</span>
                </label>
                <input
                  type="date"
                  max={todayStr}
                  className="petty-cash-input"
                  style={{ width: '100%' }}
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Payment Mode</label>
                <select
                  className="petty-cash-select"
                  style={{ width: '100%' }}
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as any)}
                >
                  <option value="Cash">Physical Cash</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="Card">Debit / Company Card</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>
                Reason / Vendor Description <span className="required">*</span>
              </label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="e.g. Refreshments for client executive meeting, 4 copies of blueprint printing..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Bill / Cash Memo / Receipt Proof (JPG / PNG / PDF)</label>
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
                      <span style={{ fontSize: '0.75rem', color: '#65A30D' }}>
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <Upload size={20} color="var(--color-primary-blue)" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary-blue)' }}>
                        Click to take photo or upload vendor receipt
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        Max file size: 10MB
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
              disabled={loading || uploading || !amount || isOverBudget || !reason.trim()}
            >
              {loading || uploading ? 'Recording...' : 'Record & Deduct Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
