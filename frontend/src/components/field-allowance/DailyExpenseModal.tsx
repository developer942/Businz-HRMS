import React, { useState, useRef } from 'react';
import { X, Upload, Camera, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ExpenseCategory, FieldVisitExpense } from '../../types/fieldAdvance';
import { addDailyExpenseApi, updateDailyExpenseApi } from '../../services/fieldAdvanceService';

const CATEGORIES: ExpenseCategory[] = [
  'Travel',
  'Bus',
  'Train',
  'Taxi / Auto',
  'Fuel',
  'Food',
  'Accommodation / Room',
  'Parking',
  'Toll',
  'Other',
];

const PAYMENT_METHODS = ['Company Advance', 'Cash', 'UPI', 'Bank Transfer', 'Personal Card / Own Money'];

interface DailyExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  advanceId: string;
  editingExpense?: FieldVisitExpense | null;
  onSaved: () => void;
}

export const DailyExpenseModal: React.FC<DailyExpenseModalProps> = ({
  isOpen,
  onClose,
  advanceId,
  editingExpense,
  onSaved,
}) => {
  const [expenseDate, setExpenseDate] = useState(
    editingExpense?.expense_date || new Date().toISOString().split('T')[0]
  );
  const [category, setCategory] = useState<ExpenseCategory>(editingExpense?.category || 'Travel');
  const [amount, setAmount] = useState<number | ''>(editingExpense?.amount || '');
  const [description, setDescription] = useState(editingExpense?.description || '');
  const [paymentMethod, setPaymentMethod] = useState(editingExpense?.payment_method || 'Company Advance');
  const [remarks, setRemarks] = useState(editingExpense?.remarks || '');
  const [receiptUrl, setReceiptUrl] = useState(editingExpense?.receipt_url || '');
  const [receiptFileName, setReceiptFileName] = useState(editingExpense?.receipt_file_name || '');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPG, JPEG, PNG, WEBP, and PDF files are allowed.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Receipt file size must be 8 MB or less.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setReceiptUrl(dataUrl);
      setReceiptFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!amount || Number(amount) <= 0) {
      setError('Amount must be greater than ₹0');
      return;
    }
    if (!description.trim()) {
      setError('Expense description is required');
      return;
    }

    setLoading(true);
    try {
      if (editingExpense) {
        await updateDailyExpenseApi(editingExpense.id, {
          expense_date: expenseDate,
          category,
          amount: Number(amount),
          description: description.trim(),
          payment_method: paymentMethod,
          remarks: remarks.trim() || null,
          receipt_url: receiptUrl.trim() || null,
          receipt_file_name: receiptFileName || (receiptUrl ? 'Receipt Attachment' : null),
        });
      } else {
        await addDailyExpenseApi(advanceId, {
          expense_date: expenseDate,
          category,
          amount: Number(amount),
          description: description.trim(),
          payment_method: paymentMethod,
          remarks: remarks.trim() || null,
          receipt_url: receiptUrl.trim() || null,
          receipt_file_name: receiptFileName || (receiptUrl ? 'Receipt Attachment' : null),
        });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save expense');
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
          maxWidth: '520px',
          background: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden',
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
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
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
              {editingExpense ? 'Edit Daily Expense' : 'Add Daily Field Expense'}
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#64748B' }}>
              Record travel, food, accommodation, or transport expense with proof
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
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: '#FEF2F2',
                  border: '1px solid #F87171',
                  color: '#B91C1C',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Date & Category */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Expense Date <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.84rem', outline: 'none', background: '#FFFFFF' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Expense Category <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.84rem', outline: 'none', background: '#FFFFFF' }}
                  required
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount & Payment Method */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Amount (₹) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', overflow: 'hidden' }}>
                  <span style={{ padding: '9px 12px', background: '#F8FAFC', borderRight: '1px solid #CBD5E1', fontWeight: 800, color: '#0E7490', fontSize: '0.85rem' }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0.5"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                    placeholder="e.g. 1000"
                    style={{ border: 'none', padding: '9px 12px', flex: 1, fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', outline: 'none' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.84rem', outline: 'none', background: '#FFFFFF' }}
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Description <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Bus ticket Chennai to Nellore / Hotel stay / Client lunch"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.83rem', outline: 'none', background: '#FFFFFF', resize: 'vertical' }}
                required
              />
            </div>

            {/* Proof / Bill / Receipt Upload */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Proof / Bill / Receipt Upload (JPG, PNG, WEBP, PDF)
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: '1px dashed #0E7490',
                    background: '#F0FDFA',
                    color: '#0E7490',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={14} />
                  <span>Upload Bill / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    color: '#334155',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Camera size={14} />
                  <span>Mobile Camera</span>
                </button>
              </div>

              {receiptUrl && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <CheckCircle2 size={15} style={{ color: '#059669', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#065F46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {receiptFileName || 'Receipt Proof Attached'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptUrl('');
                      setReceiptFileName('');
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#DC2626',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* Remarks */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>
                Optional Notes / Invoice Ref
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Bill #INV-1094 or remarks"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none', background: '#FFFFFF' }}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div
            style={{
              padding: '14px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              background: '#F8FAFC',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ padding: '8px 18px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, background: '#0E7490', color: '#FFFFFF', border: 'none' }}
            >
              {loading ? 'Saving...' : editingExpense ? 'Save Changes' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DailyExpenseModal;
