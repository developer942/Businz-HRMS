import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  IndianRupee,
  MapPin,
  Building,
  Upload,
  Image as ImageIcon,
  FileText,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Receipt,
  Camera,
  Info,
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
  fileSize: string;
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

  // Basic Information
  const [purpose, setPurpose] = useState('');
  const [clientName, setClientName] = useState('');
  const [destination, setDestination] = useState('');
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Advance Selection: Yes / No
  const [hasAdvance, setHasAdvance] = useState<boolean>(false);
  const [advanceAmount, setAdvanceAmount] = useState<number | ''>('');
  const [travelMode, setTravelMode] = useState('Train');
  const [remarks, setRemarks] = useState('');

  // Daily Expense Entries
  const [expenses, setExpenses] = useState<ExpenseEntryDraft[]>([]);

  // Submission state & validation
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Add a new blank expense entry
  const handleAddExpenseRow = () => {
    const newEntry: ExpenseEntryDraft = {
      id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      date: startDate || today,
      category: 'Food',
      amount: '',
      description: '',
      receiptUrl: '',
      fileName: '',
      fileSize: '',
    };
    setExpenses(prev => [...prev, newEntry]);
  };

  const handleRemoveExpenseRow = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const handleUpdateExpenseRow = (id: string, field: keyof ExpenseEntryDraft, value: any) => {
    setExpenses(prev =>
      prev.map(e => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  // Handle receipt upload for a specific expense row
  const handleReceiptUpload = (id: string, file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      setError('Receipt file size must be less than 8MB');
      return;
    }
    const sizeKb = Math.round(file.size / 1024);
    const formattedSize = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      handleUpdateExpenseRow(id, 'receiptUrl', dataUrl);
      handleUpdateExpenseRow(id, 'fileName', file.name);
      handleUpdateExpenseRow(id, 'fileSize', formattedSize);
    };
    reader.readAsDataURL(file);
  };

  // Financial Calculations
  const confirmedAdvance = hasAdvance ? Number(advanceAmount || 0) : 0;
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const provisionalBalance = confirmedAdvance - totalExpenses;

  // Determine Scenario automatically
  const detectedScenario = useMemo(() => {
    if (confirmedAdvance > 0 && provisionalBalance > 0) {
      return {
        id: 1,
        title: 'Scenario 1 — Advance with Unused Balance',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        textColor: 'text-emerald-700',
        label: 'Amount to Return to Accounts',
        amount: provisionalBalance,
        explanation: 'After CEO/HR approves eligible expenses, you will return the unused advance to Accounts.',
      };
    } else if (confirmedAdvance === 0) {
      return {
        id: 2,
        title: 'Scenario 2 — Personal Money Expense Claim',
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
        textColor: 'text-blue-700',
        label: 'Reimbursement Due to You',
        amount: Math.abs(provisionalBalance),
        explanation: 'You are spending personal money. After CEO/HR approval, Accounts will pay your reimbursement.',
      };
    } else if (provisionalBalance < 0) {
      return {
        id: 3,
        title: 'Scenario 3 — Expenses Exceed Advance',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
        textColor: 'text-amber-700',
        label: 'Additional Reimbursement Due to You',
        amount: Math.abs(provisionalBalance),
        explanation: 'Your expenses exceed the advance received. Company owes you additional reimbursement upon CEO/HR approval.',
      };
    } else {
      return {
        id: 0,
        title: 'Advance Fully Utilized',
        badgeColor: 'bg-slate-50 text-slate-700 border-slate-200',
        textColor: 'text-slate-700',
        label: 'Net Balance',
        amount: 0,
        explanation: 'Advance received matches total expenses exactly. No return or reimbursement required.',
      };
    }
  }, [confirmedAdvance, totalExpenses, provisionalBalance]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!purpose.trim()) {
      setError('Claim / Visit purpose is required.');
      return;
    }

    const effectiveEndDate = dateMode === 'single' ? startDate : endDate;
    if (!startDate || !effectiveEndDate) {
      setError('Please select valid expense date(s).');
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

    // Validate expenses if any exist
    for (let i = 0; i < expenses.length; i++) {
      const exp = expenses[i];
      if (!exp.amount || Number(exp.amount) <= 0) {
        setError(`Expense entry #${i + 1} has an invalid amount. Amounts must be greater than ₹0.`);
        return;
      }
      if (!exp.description.trim()) {
        setError(`Expense entry #${i + 1} requires a brief description.`);
        return;
      }
      if (!exp.receiptUrl) {
        setError(`Expense entry #${i + 1} (${exp.category}) requires a bill or receipt proof attachment.`);
        return;
      }
    }

    setLoading(true);
    try {
      const fundingType: FundingType = hasAdvance ? 'advance' : 'personal';

      // 1. Create Field Visit Claim
      const visit = await createFieldVisit({
        employee_id: currentUser.employeeId || currentUser.id,
        employee_code: currentUser.employee_code || currentUser.employeeId || '',
        employee_name: currentUser.name || 'Current Employee',
        department_name: currentUser.department || 'Operations',
        purpose: purpose.trim(),
        client_name: clientName.trim() || 'Internal Company Work',
        destination: destination.trim() || 'Work Location',
        start_date: startDate,
        end_date: effectiveEndDate,
        funding_type: fundingType,
        requested_amount: hasAdvance ? Number(advanceAmount) : 0,
        travel_mode: travelMode,
        remarks: remarks.trim() || null,
      });

      // 2. Add each daily expense entry if present
      for (const exp of expenses) {
        await addDailyExpenseApi(visit.id, {
          expense_date: exp.date,
          category: exp.category,
          amount: Number(exp.amount),
          description: exp.description.trim(),
          receipt_url: exp.receiptUrl,
          receipt_file_name: exp.fileName || 'receipt.jpg',
        });
      }

      // 3. If expenses exist, submit for CEO/HR review
      if (expenses.length > 0) {
        await submitSettlementApi(visit.id, remarks.trim() || 'Claim submitted with receipts for CEO/HR approval.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit claim. Please try again.');
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
          maxWidth: '780px',
          background: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 40px)',
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
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
              Apply Expense Claim
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
              One unified form for travel advances, personal expense claims & final settlements
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
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  fontSize: '0.85rem',
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* 1. Claim Purpose & Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Claim Purpose / Visit Purpose <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. On-site customer machine commissioning & trial runs"
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.9rem',
                    color: '#0F172A',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Customer / Site Name <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Building size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94A3B8' }} />
                    <input
                      type="text"
                      placeholder="e.g. Apex Industrial Solutions"
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 36px',
                        borderRadius: '10px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.9rem',
                        color: '#0F172A',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Work Location / Destination <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94A3B8' }} />
                    <input
                      type="text"
                      placeholder="e.g. Coimbatore Plant 2"
                      value={destination}
                      onChange={e => setDestination(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 36px',
                        borderRadius: '10px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.9rem',
                        color: '#0F172A',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Date Selection (Single Day vs Date Range) */}
            <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                  Expense Date / Visit Duration <span style={{ color: '#DC2626' }}>*</span>
                </span>
                <div style={{ display: 'flex', background: '#E2E8F0', padding: '2px', borderRadius: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setDateMode('single')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      background: dateMode === 'single' ? '#FFFFFF' : 'transparent',
                      color: dateMode === 'single' ? '#0F172A' : '#64748B',
                      cursor: 'pointer',
                    }}
                  >
                    Single Date
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateMode('range')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
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
                <div>
                  <input
                    type="date"
                    required
                    value={startDate}
                    max={today}
                    onChange={e => {
                      setStartDate(e.target.value);
                      setEndDate(e.target.value);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.9rem',
                      background: '#FFFFFF',
                      color: '#0F172A',
                      outline: 'none',
                    }}
                  />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>Start Date</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.85rem',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>End Date</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      min={startDate}
                      onChange={e => setEndDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.85rem',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Advance Received: Yes / No Toggle */}
            <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', display: 'block' }}>
                    Company Advance Received?
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Did you receive or do you need advance company money for this visit?
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
                      padding: '6px 14px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: 'none',
                      background: !hasAdvance ? '#0E7490' : 'transparent',
                      color: !hasAdvance ? '#FFFFFF' : '#475569',
                      cursor: 'pointer',
                      boxShadow: !hasAdvance ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    No (Personal Money)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasAdvance(true)}
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: 'none',
                      background: hasAdvance ? '#0E7490' : 'transparent',
                      color: hasAdvance ? '#FFFFFF' : '#475569',
                      cursor: 'pointer',
                      boxShadow: hasAdvance ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Yes (Company Advance)
                  </button>
                </div>
              </div>

              {hasAdvance ? (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    Advance Amount (₹) <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      style={{
                        padding: '10px 14px',
                        background: '#E2E8F0',
                        border: '1.5px solid #CBD5E1',
                        borderRight: 'none',
                        borderTopLeftRadius: '10px',
                        borderBottomLeftRadius: '10px',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        color: '#334155',
                      }}
                    >
                      ₹
                    </div>
                    <input
                      type="number"
                      min="1"
                      required={hasAdvance}
                      placeholder="e.g. 6000"
                      value={advanceAmount}
                      onChange={e => setAdvanceAmount(e.target.value ? Number(e.target.value) : '')}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderTopRightRadius: '10px',
                        borderBottomRightRadius: '10px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: '#0F172A',
                        outline: 'none',
                        background: '#FFFFFF',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#0E7490' }}>
                    <Info size={14} />
                    <span>Advance disbursement must be confirmed by Accounts before final settlement payout.</span>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '8px', fontSize: '0.76rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span>Advance is set to ₹0. Any approved expenses will be reimbursed to you by Accounts.</span>
                </div>
              )}
            </div>

            {/* 4. Daily Expense Entries Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                    Expense Entries ({expenses.length})
                  </h4>
                  <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    Add itemized daily bills and receipts for food, travel, lodging, or transport
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddExpenseRow}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    borderRadius: '8px',
                    border: '1px solid #0E7490',
                    background: '#F0FDFA',
                    color: '#0E7490',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={15} />
                  <span>Add Expense</span>
                </button>
              </div>

              {expenses.length === 0 ? (
                <div
                  style={{
                    border: '1.5px dashed #CBD5E1',
                    borderRadius: '12px',
                    padding: '24px 16px',
                    textAlign: 'center',
                    background: '#F8FAFC',
                  }}
                >
                  <Receipt size={32} style={{ margin: '0 auto 8px', color: '#94A3B8' }} />
                  <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 600, color: '#475569' }}>
                    No expenses added yet
                  </p>
                  <p style={{ margin: '4px 0 12px', fontSize: '0.74rem', color: '#94A3B8' }}>
                    {hasAdvance
                      ? 'You can submit the advance request now, or attach trip expenses if already incurred.'
                      : 'Click "+ Add Expense" to attach your receipts and claim personal reimbursement.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleAddExpenseRow}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      background: '#0E7490',
                      color: '#FFFFFF',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    + Add First Expense
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {expenses.map((exp, idx) => (
                    <div
                      key={exp.id}
                      style={{
                        padding: '14px',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        background: '#FFFFFF',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0E7490' }}>
                          Entry #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExpenseRow(exp.id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#94A3B8',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                          title="Remove this expense"
                        >
                          <Trash2 size={16} className="hover:text-red-600 transition-colors" />
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#64748B', marginBottom: '3px' }}>
                            Expense Date
                          </label>
                          <input
                            type="date"
                            required
                            max={today}
                            value={exp.date}
                            onChange={e => handleUpdateExpenseRow(exp.id, 'date', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.82rem',
                              outline: 'none',
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#64748B', marginBottom: '3px' }}>
                            Category
                          </label>
                          <select
                            value={exp.category}
                            onChange={e => handleUpdateExpenseRow(exp.id, 'category', e.target.value as ExpenseCategory)}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.82rem',
                              background: '#FFFFFF',
                              outline: 'none',
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
                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#64748B', marginBottom: '3px' }}>
                            Amount (₹) <span style={{ color: '#DC2626' }}>*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            required
                            placeholder="e.g. 1000"
                            value={exp.amount}
                            onChange={e => handleUpdateExpenseRow(exp.id, 'amount', e.target.value ? Number(e.target.value) : '')}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              color: '#0F172A',
                              outline: 'none',
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#64748B', marginBottom: '3px' }}>
                          Description / Item Note <span style={{ color: '#DC2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Dinner with client team or train ticket from Chennai"
                          value={exp.description}
                          onChange={e => handleUpdateExpenseRow(exp.id, 'description', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.82rem',
                            outline: 'none',
                          }}
                        />
                      </div>

                      {/* Receipt Upload & Preview */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>
                          Bill / Receipt Proof <span style={{ color: '#DC2626' }}>*</span>
                        </label>
                        {exp.receiptUrl ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              background: '#F0FDFA',
                              border: '1px solid #A7F3D0',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <img
                                src={exp.receiptUrl}
                                alt="Receipt proof"
                                style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px' }}
                              />
                              <div>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#065F46', display: 'block' }}>
                                  {exp.fileName || 'Receipt attached'}
                                </span>
                                <span style={{ fontSize: '0.68rem', color: '#059669' }}>{exp.fileSize || 'Uploaded'}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                handleUpdateExpenseRow(exp.id, 'receiptUrl', '');
                                handleUpdateExpenseRow(exp.id, 'fileName', '');
                                handleUpdateExpenseRow(exp.id, 'fileSize', '');
                              }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.72rem',
                                color: '#DC2626',
                                background: '#FFFFFF',
                                border: '1px solid #FECACA',
                                borderRadius: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '10px',
                              borderRadius: '8px',
                              border: '1.5px dashed #CBD5E1',
                              background: '#F8FAFC',
                              cursor: 'pointer',
                              color: '#475569',
                              fontSize: '0.78rem',
                            }}
                          >
                            <Upload size={16} className="text-teal-600" />
                            <span>Upload Bill / Take Photo (JPEG, PNG, PDF &lt; 8MB)</span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              capture="environment"
                              style={{ display: 'none' }}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleReceiptUpload(exp.id, file);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5. Additional Remarks */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Additional Remarks / Special Justification <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 400 }}>(Optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Any special remarks, client authorizations, or notes for CEO / HR..."
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.85rem',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* 6. Live Automatic Financial Calculation Card */}
            <div
              style={{
                borderRadius: '14px',
                padding: '16px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>
                  Live Financial Settlement Calculation
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${detectedScenario.badgeColor}`}
                >
                  {detectedScenario.title}
                </span>
              </div>

              {/* 3 Metrics Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ background: '#FFFFFF', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block' }}>Advance (A)</span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                    ₹{confirmedAdvance.toLocaleString('en-IN')}
                  </span>
                </div>
                <div style={{ background: '#FFFFFF', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block' }}>Expenses (E)</span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                    ₹{totalExpenses.toLocaleString('en-IN')}
                  </span>
                </div>
                <div
                  style={{
                    background: '#FFFFFF',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid',
                    borderColor:
                      provisionalBalance > 0
                        ? '#A7F3D0'
                        : provisionalBalance < 0
                        ? '#FDE68A'
                        : '#E2E8F0',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block' }}>Provisional Balance</span>
                  <span
                    style={{
                      fontSize: '1.05rem',
                      fontWeight: 800,
                      color:
                        provisionalBalance > 0
                          ? '#059669'
                          : provisionalBalance < 0
                          ? '#D97706'
                          : '#0F172A',
                    }}
                  >
                    {provisionalBalance > 0
                      ? `+₹${provisionalBalance.toLocaleString('en-IN')}`
                      : provisionalBalance < 0
                      ? `-₹${Math.abs(provisionalBalance).toLocaleString('en-IN')}`
                      : '₹0'}
                  </span>
                </div>
              </div>

              {/* Explanatory Banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                }}
              >
                {provisionalBalance > 0 ? (
                  <TrendingDown size={18} className="text-emerald-600 flex-shrink-0" />
                ) : provisionalBalance < 0 ? (
                  <TrendingUp size={18} className="text-amber-600 flex-shrink-0" />
                ) : (
                  <CheckCircle2 size={18} className="text-slate-600 flex-shrink-0" />
                )}
                <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                  <strong>{detectedScenario.label}: ₹{detectedScenario.amount.toLocaleString('en-IN')}. </strong>
                  <span>{detectedScenario.explanation}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Action Bar */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                borderRadius: '10px',
                border: 'none',
                background: '#0E7490',
                color: '#FFFFFF',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 4px 6px -1px rgba(14, 116, 144, 0.25)',
              }}
            >
              {loading ? (
                <span>Submitting Claim...</span>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>
                    {expenses.length === 0
                      ? hasAdvance
                        ? 'Submit Advance Request'
                        : 'Submit Claim'
                      : provisionalBalance > 0
                      ? 'Submit Settlement & Balance Return Request'
                      : provisionalBalance < 0
                      ? 'Submit Reimbursement Claim'
                      : 'Submit Final Settlement'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default ApplyClaimModal;
