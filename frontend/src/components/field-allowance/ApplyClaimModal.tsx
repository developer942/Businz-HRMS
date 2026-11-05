import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  MapPin,
  Building,
  Upload,
  AlertCircle,
  CheckCircle2,
  Receipt,
} from 'lucide-react';
import { ExpenseCategory, FundingType } from '../../types/fieldAdvance';
import {
  createFieldVisit,
  addDailyExpenseApi,
  submitSettlementApi,
} from '../../services/fieldAdvanceService';
import { getTodayKolkata } from '../../utils/requestValidation';

interface ExpenseEntryDraft {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number | '';
  description: string;
  receiptUrl: string;
  fileName: string;
}

interface ApplyClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser: any;
}

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

export const ApplyClaimModal: React.FC<ApplyClaimModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
}) => {
  const today = getTodayKolkata();

  const [purpose, setPurpose] = useState('');
  const [clientName, setClientName] = useState('');
  const [destination, setDestination] = useState('');
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const [hasAdvance, setHasAdvance] = useState<boolean>(false);
  const [advanceAmount, setAdvanceAmount] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');

  const [expenses, setExpenses] = useState<ExpenseEntryDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddExpenseRow = () => {
    setExpenses(prev => [
      ...prev,
      {
        id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        date: startDate || today,
        category: 'Travel',
        amount: '',
        description: '',
        receiptUrl: '',
        fileName: '',
      },
    ]);
  };

  const handleRemoveExpenseRow = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const handleUpdateExpenseRow = (id: string, field: keyof ExpenseEntryDraft, value: any) => {
    setExpenses(prev => prev.map(e => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const handleReceiptUpload = (id: string, file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      setError('Receipt file size must be less than 8MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      handleUpdateExpenseRow(id, 'receiptUrl', dataUrl);
      handleUpdateExpenseRow(id, 'fileName', file.name);
    };
    reader.readAsDataURL(file);
  };

  const allocatedAdvance = hasAdvance ? Number(advanceAmount || 0) : 0;
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const balance = allocatedAdvance - totalExpenses;

  const formatBalance = (val: number) => {
    if (val > 0) return `+₹${val.toLocaleString('en-IN')}`;
    if (val < 0) return `−₹${Math.abs(val).toLocaleString('en-IN')}`;
    return '₹0';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!purpose.trim()) {
      setError('Please enter the field visit purpose.');
      return;
    }

    const effectiveEndDate = dateMode === 'single' ? startDate : endDate;
    if (!startDate || !effectiveEndDate) {
      setError('Please select valid date(s).');
      return;
    }
    if (dateMode === 'range' && effectiveEndDate < startDate) {
      setError('End date cannot be earlier than start date.');
      return;
    }

    if (hasAdvance && (!advanceAmount || Number(advanceAmount) <= 0)) {
      setError('Please enter a valid advance amount greater than ₹0.');
      return;
    }

    for (let i = 0; i < expenses.length; i++) {
      const exp = expenses[i];
      if (!exp.amount || Number(exp.amount) <= 0) {
        setError(`Expense #${i + 1} needs a valid amount greater than ₹0.`);
        return;
      }
      if (!exp.description.trim()) {
        setError(`Expense #${i + 1} needs a brief description.`);
        return;
      }
    }

    setLoading(true);
    try {
      const fundingType: FundingType = hasAdvance ? 'advance' : 'personal';

      const visit = await createFieldVisit({
        employee_id: currentUser.employeeId || currentUser.id,
        employee_code: currentUser.employee_code || currentUser.employeeId || '',
        employee_name: currentUser.name || 'Current Employee',
        department_name: currentUser.department || 'Operations',
        purpose: purpose.trim(),
        client_name: clientName.trim() || 'Field Visit',
        destination: destination.trim() || purpose.trim(),
        start_date: startDate,
        end_date: effectiveEndDate,
        funding_type: fundingType,
        requested_amount: hasAdvance ? Number(advanceAmount) : 0,
        travel_mode: 'Bus',
        remarks: remarks.trim() || null,
      });

      for (const exp of expenses) {
        await addDailyExpenseApi(visit.id, {
          expense_date: exp.date,
          category: exp.category,
          amount: Number(exp.amount),
          description: exp.description.trim(),
          receipt_url: exp.receiptUrl || null,
          receipt_file_name: exp.fileName || (exp.receiptUrl ? 'receipt.jpg' : null),
        });
      }

      if (expenses.length > 0) {
        await submitSettlementApi(visit.id, remarks.trim() || 'Daily expense report submitted.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
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
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          background: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 32px)',
          margin: 'auto',
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
              New Field Visit &amp; Expense Claim
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
              Request a field visit advance or log daily trip expenses
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Trip / Route & Purpose */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Field Visit Route / Location <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={15} style={{ position: 'absolute', left: '12px', top: '11px', color: '#94A3B8' }} />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chennai → Nellore"
                    value={destination}
                    onChange={e => {
                      setDestination(e.target.value);
                      if (!purpose) setPurpose(e.target.value);
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 34px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem',
                      color: '#0F172A',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Visit Purpose <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Building size={15} style={{ position: 'absolute', left: '12px', top: '11px', color: '#94A3B8' }} />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Client site visit / Service"
                    value={purpose}
                    onChange={e => setPurpose(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 34px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem',
                      color: '#0F172A',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Date Selection */}
            <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                  Visit Date <span style={{ color: '#DC2626' }}>*</span>
                </span>
                <div style={{ display: 'flex', background: '#E2E8F0', padding: '2px', borderRadius: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setDateMode('single')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: 'none',
                      background: dateMode === 'single' ? '#FFFFFF' : 'transparent',
                      color: dateMode === 'single' ? '#0F172A' : '#64748B',
                      cursor: 'pointer',
                    }}
                  >
                    Single Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateMode('range')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: 'none',
                      background: dateMode === 'range' ? '#FFFFFF' : 'transparent',
                      color: dateMode === 'range' ? '#0F172A' : '#64748B',
                      cursor: 'pointer',
                    }}
                  >
                    Date Range
                  </button>
                </div>
              </div>

              {dateMode === 'single' ? (
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    setEndDate(e.target.value);
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    background: '#FFFFFF',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', marginBottom: '4px' }}>From</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.82rem',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', marginBottom: '4px' }}>To</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      min={startDate}
                      onChange={e => setEndDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.82rem',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Advance Amount Toggle */}
            <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', display: 'block' }}>
                    Allocated Advance
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    Did you receive or need company advance for this trip?
                  </span>
                </div>
                <div style={{ display: 'flex', background: '#E2E8F0', padding: '3px', borderRadius: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setHasAdvance(false);
                      setAdvanceAmount('');
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: 'none',
                      background: !hasAdvance ? '#0E7490' : 'transparent',
                      color: !hasAdvance ? '#FFFFFF' : '#475569',
                      cursor: 'pointer',
                    }}
                  >
                    No Advance (₹0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasAdvance(true)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: 'none',
                      background: hasAdvance ? '#0E7490' : 'transparent',
                      color: hasAdvance ? '#FFFFFF' : '#475569',
                      cursor: 'pointer',
                    }}
                  >
                    Yes (Advance)
                  </button>
                </div>
              </div>

              {hasAdvance && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Advance Amount (₹) <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required={hasAdvance}
                    placeholder="e.g. 6000"
                    value={advanceAmount}
                    onChange={e => setAdvanceAmount(e.target.value ? Number(e.target.value) : '')}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      color: '#0F172A',
                      background: '#FFFFFF',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Day-wise Expenses */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', display: 'block' }}>
                    Day-wise Expense Breakdown ({expenses.length})
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    Add travel, food, room, or bus expenses
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddExpenseRow}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #0E7490',
                    background: '#F0FDFA',
                    color: '#0E7490',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  <span>Add Expense</span>
                </button>
              </div>

              {expenses.length === 0 ? (
                <div
                  style={{
                    border: '1px dashed #CBD5E1',
                    borderRadius: '12px',
                    padding: '18px 14px',
                    textAlign: 'center',
                    background: '#F8FAFC',
                  }}
                >
                  <Receipt size={24} style={{ margin: '0 auto 6px', color: '#94A3B8' }} />
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                    No daily expenses added yet
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>
                    You can submit an advance request now or click "+ Add Expense" to attach daily bills.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {expenses.map((exp, idx) => (
                    <div
                      key={exp.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        background: '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0E7490' }}>
                          Expense #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExpenseRow(exp.id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#DC2626',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', marginBottom: '3px' }}>
                            Date
                          </label>
                          <input
                            type="date"
                            required
                            value={exp.date}
                            onChange={e => handleUpdateExpenseRow(exp.id, 'date', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.8rem',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', marginBottom: '3px' }}>
                            Expense Type
                          </label>
                          <select
                            value={exp.category}
                            onChange={e => handleUpdateExpenseRow(exp.id, 'category', e.target.value as ExpenseCategory)}
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.8rem',
                              background: '#FFFFFF',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          >
                            {CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', marginBottom: '3px' }}>
                            Amount (₹)
                          </label>
                          <input
                            type="number"
                            min="1"
                            required
                            placeholder="1000"
                            value={exp.amount}
                            onChange={e => handleUpdateExpenseRow(exp.id, 'amount', e.target.value ? Number(e.target.value) : '')}
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              color: '#0F172A',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          required
                          placeholder="Brief note (e.g. Bus travel, Hotel stay, Food)"
                          value={exp.description}
                          onChange={e => handleUpdateExpenseRow(exp.id, 'description', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.8rem',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />

                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '7px 12px',
                            borderRadius: '8px',
                            border: exp.receiptUrl ? '1px solid #A7F3D0' : '1px dashed #CBD5E1',
                            background: exp.receiptUrl ? '#ECFDF5' : '#F8FAFC',
                            color: exp.receiptUrl ? '#059669' : '#475569',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {exp.receiptUrl ? <CheckCircle2 size={14} /> : <Upload size={14} />}
                          <span>{exp.receiptUrl ? 'Proof Added' : 'Attach Bill'}</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleReceiptUpload(exp.id, file);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Clean 3-Column Summary (Allocated / Spent / Balance) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                padding: '14px 16px',
                borderRadius: '12px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Allocated</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                  ₹{allocatedAdvance.toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Spent</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                  ₹{totalExpenses.toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Balance</div>
                <div
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    marginTop: '2px',
                    color: balance > 0 ? '#059669' : balance < 0 ? '#DC2626' : '#0F172A',
                  }}
                >
                  {formatBalance(balance)}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '14px 24px',
              borderTop: '1px solid #E2E8F0',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '9px 18px',
                borderRadius: '999px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '9px 22px',
                borderRadius: '999px',
                border: 'none',
                background: '#0E7490',
                color: '#FFFFFF',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ApplyClaimModal;
