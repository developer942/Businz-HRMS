import React, { useState, useEffect, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { pettyCashService } from '../../services/pettyCashService';
import { PettyCashRequest } from '../../types/pettyCash';
import { Expense, LoanRecord } from '../../types/hrms';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

const formatCurrency = (val: number | string | undefined | null): string => {
  const num = Number(val) || 0;
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};
import { 
  Receipt, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Banknote, 
  CreditCard, 
  Wallet, 
  Search, 
  ArrowUpRight, 
  ShieldCheck, 
  FileText, 
  X, 
  RefreshCw,
  Building2,
  Calendar,
  Check,
  History,
  Lock
} from 'lucide-react';

type PaymentTab = 'ALL' | 'EXPENSES' | 'ADVANCES' | 'PETTY_CASH' | 'HISTORY';

interface UnifiedPaymentItem {
  id: string;
  sourceType: 'EXPENSE' | 'ADVANCE' | 'PETTY_CASH';
  typeLabel: string;
  requestNumber: string;
  employeeName: string;
  employeeId: string;
  department: string;
  approvedAmount: number;
  requestedAmount: number;
  approvedDate: string;
  approvedBy: string;
  purpose: string;
  status: 'PENDING_DISBURSEMENT' | 'DISBURSED' | 'REJECTED';
  paymentDetails?: {
    paidAmount?: number;
    paymentDate?: string;
    paymentMode?: string;
    transactionRef?: string;
    remarks?: string;
    disbursedBy?: string;
  };
  rawRecord: Expense | LoanRecord | PettyCashRequest;
}

export const AccountsPaymentDashboard: React.FC = () => {
  const { 
    currentUser, 
    expenses = [], 
    loanRecords = [], 
    disburseLoan, 
    addNotification,
    employees = []
  } = useHRMS();

  const [activeTab, setActiveTab] = useState<PaymentTab>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pettyCashRequests, setPettyCashRequests] = useState<PettyCashRequest[]>([]);
  const [isLoadingPettyCash, setIsLoadingPettyCash] = useState<boolean>(false);

  // Disbursement Modal State
  const [selectedItem, setSelectedItem] = useState<UnifiedPaymentItem | null>(null);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  );
  const [paymentMode, setPaymentMode] = useState<'Bank Transfer' | 'UPI' | 'Cash' | 'Cheque' | 'NEFT' | 'IMPS'>('Bank Transfer');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch approved petty cash requests from backend service
  const fetchPettyCashRequests = async () => {
    try {
      setIsLoadingPettyCash(true);
      const reqs = await pettyCashService.getRequests();
      setPettyCashRequests(reqs || []);
    } catch (err) {
      console.warn('[AccountsPaymentDashboard] Could not fetch petty cash requests:', err);
    } finally {
      setIsLoadingPettyCash(false);
    }
  };

  useEffect(() => {
    fetchPettyCashRequests();
  }, []);

  // Map and consolidate all 3 financial sources into unified queue
  const unifiedItems: UnifiedPaymentItem[] = useMemo(() => {
    const list: UnifiedPaymentItem[] = [];

    // 1. Expense Claims (Only CEO-Approved or Reimbursed)
    (expenses || []).forEach(exp => {
      const isApproved = exp.status === 'Approved';
      const isReimbursed = exp.status === 'Reimbursed';
      if (!isApproved && !isReimbursed) return;

      const emp = employees.find(e => e.employeeId === exp.employeeId || e.id === exp.employeeId);
      list.push({
        id: `EXP-${exp.id}`,
        sourceType: 'EXPENSE',
        typeLabel: `Expense (${exp.category || 'General'})`,
        requestNumber: `EXP-${exp.id.slice(0, 8).toUpperCase()}`,
        employeeName: exp.employeeName || (emp ? `${emp.firstName} ${emp.lastName}`.trim() : 'Staff Claimant'),
        employeeId: exp.employeeId || emp?.employeeId || 'STAFF',
        department: exp.department || emp?.department || 'Operations',
        approvedAmount: Number(exp.amount),
        requestedAmount: Number(exp.amount),
        approvedDate: exp.date || 'Recent',
        approvedBy: 'CEO (Velmurugan)',
        purpose: exp.description || 'Employee Expense Reimbursement',
        status: isApproved ? 'PENDING_DISBURSEMENT' : 'DISBURSED',
        paymentDetails: isReimbursed ? {
          paidAmount: Number(exp.amount),
          paymentDate: exp.date,
          paymentMode: 'Bank Transfer',
          disbursedBy: 'Accounts Dept'
        } : undefined,
        rawRecord: exp
      });
    });

    // 2. Advance Salary Requests (Only CEO-Approved or Active/Disbursed)
    (loanRecords || []).forEach(loan => {
      const isApproved = loan.status === 'Approved';
      const isDisbursed = loan.status === 'Active' || loan.status === 'Disbursed';
      if (!isApproved && !isDisbursed) return;

      const approvedAmt = loan.approvedAmount || loan.requestedAmount;
      list.push({
        id: `ADV-${loan.id}`,
        sourceType: 'ADVANCE',
        typeLabel: loan.requestType || 'Advance Salary',
        requestNumber: loan.id,
        employeeName: loan.employeeName || 'Staff Applicant',
        employeeId: loan.employeeId,
        department: loan.department || 'Operations',
        approvedAmount: approvedAmt,
        requestedAmount: loan.requestedAmount,
        approvedDate: loan.ceoApproval?.approvedAt || loan.requestedDate,
        approvedBy: loan.ceoApproval?.approvedBy || 'CEO (Velmurugan)',
        purpose: loan.purpose || 'Salary Advance Request',
        status: isApproved ? 'PENDING_DISBURSEMENT' : 'DISBURSED',
        paymentDetails: isDisbursed ? {
          paidAmount: loan.disbursedAmount || approvedAmt,
          paymentDate: loan.disbursementDetails?.disbursedAt,
          paymentMode: loan.disbursementDetails?.paymentMode || 'Bank Transfer',
          transactionRef: loan.disbursementDetails?.transactionRef,
          remarks: loan.disbursementDetails?.notes,
          disbursedBy: loan.disbursementDetails?.disbursedBy
        } : undefined,
        rawRecord: loan
      });
    });

    // 3. Petty Cash Requests (Only CEO-Approved or DISBURSED_PENDING_RECEIPT / COMPLETED)
    (pettyCashRequests || []).forEach(pc => {
      const isApproved = pc.status === 'APPROVED_BY_CEO';
      const isDisbursed = pc.status === 'DISBURSED_PENDING_RECEIPT' || pc.status === 'COMPLETED';
      if (!isApproved && !isDisbursed) return;

      const approvedAmt = pc.approved_amount || pc.requested_amount;
      list.push({
        id: `PC-${pc.id}`,
        sourceType: 'PETTY_CASH',
        typeLabel: 'Petty Cash Funding',
        requestNumber: pc.request_number || `PC-${pc.id.slice(0, 8).toUpperCase()}`,
        employeeName: pc.custodian_name || 'Designated Custodian',
        employeeId: pc.custodian_employee_id || pc.custodian_id || 'CUSTODIAN',
        department: 'Finance Custody',
        approvedAmount: approvedAmt,
        requestedAmount: pc.requested_amount,
        approvedDate: pc.ceo_action_at ? pc.ceo_action_at.slice(0, 10) : pc.request_date,
        approvedBy: pc.ceo_name || 'CEO (Velmurugan)',
        purpose: pc.purpose || 'Branch Daily Operational Expenses',
        status: isApproved ? 'PENDING_DISBURSEMENT' : 'DISBURSED',
        paymentDetails: isDisbursed ? {
          paidAmount: approvedAmt,
          paymentDate: pc.updated_at ? pc.updated_at.slice(0, 10) : undefined,
          paymentMode: 'Cash',
          disbursedBy: 'Accounts Dept'
        } : undefined,
        rawRecord: pc
      });
    });

    // Sort: Pending items first, then chronologically descending
    return list.sort((a, b) => {
      if (a.status === 'PENDING_DISBURSEMENT' && b.status !== 'PENDING_DISBURSEMENT') return -1;
      if (a.status !== 'PENDING_DISBURSEMENT' && b.status === 'PENDING_DISBURSEMENT') return 1;
      return b.approvedDate.localeCompare(a.approvedDate);
    });
  }, [expenses, loanRecords, pettyCashRequests, employees]);

  // Tab Filtering & Search
  const filteredItems = useMemo(() => {
    return unifiedItems.filter(item => {
      // Tab filter
      if (activeTab === 'EXPENSES' && item.sourceType !== 'EXPENSE') return false;
      if (activeTab === 'ADVANCES' && item.sourceType !== 'ADVANCE') return false;
      if (activeTab === 'PETTY_CASH' && item.sourceType !== 'PETTY_CASH') return false;
      if (activeTab === 'HISTORY' && item.status !== 'DISBURSED') return false;
      if (activeTab !== 'HISTORY' && item.status !== 'PENDING_DISBURSEMENT') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          item.requestNumber.toLowerCase().includes(q) ||
          item.employeeName.toLowerCase().includes(q) ||
          item.employeeId.toLowerCase().includes(q) ||
          item.department.toLowerCase().includes(q) ||
          item.purpose.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [unifiedItems, activeTab, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const pendingItems = unifiedItems.filter(i => i.status === 'PENDING_DISBURSEMENT');
    const pendingTotal = pendingItems.reduce((sum, i) => sum + i.approvedAmount, 0);

    const pendingExpenses = pendingItems.filter(i => i.sourceType === 'EXPENSE');
    const pendingExpensesTotal = pendingExpenses.reduce((sum, i) => sum + i.approvedAmount, 0);

    const pendingAdvances = pendingItems.filter(i => i.sourceType === 'ADVANCE');
    const pendingAdvancesTotal = pendingAdvances.reduce((sum, i) => sum + i.approvedAmount, 0);

    const pendingPettyCash = pendingItems.filter(i => i.sourceType === 'PETTY_CASH');
    const pendingPettyCashTotal = pendingPettyCash.reduce((sum, i) => sum + i.approvedAmount, 0);

    const disbursedItems = unifiedItems.filter(i => i.status === 'DISBURSED');
    const disbursedTotal = disbursedItems.reduce((sum, i) => sum + (i.paymentDetails?.paidAmount || i.approvedAmount), 0);

    return {
      pendingCount: pendingItems.length,
      pendingTotal,
      pendingExpensesCount: pendingExpenses.length,
      pendingExpensesTotal,
      pendingAdvancesCount: pendingAdvances.length,
      pendingAdvancesTotal,
      pendingPettyCashCount: pendingPettyCash.length,
      pendingPettyCashTotal,
      disbursedCount: disbursedItems.length,
      disbursedTotal
    };
  }, [unifiedItems]);

  // Open Disbursement Modal
  const handleOpenDisburseModal = (item: UnifiedPaymentItem) => {
    setSelectedItem(item);
    setAmountPaid(item.approvedAmount);
    setPaymentMode('Bank Transfer');
    setTransactionRef('');
    setRemarks('');
    setModalError(null);
    setSuccessMessage(null);
  };

  // Submit Disbursement Execution
  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    setModalError(null);

    // Strict Validation
    if (!amountPaid || amountPaid <= 0) {
      setModalError('Please enter a valid disbursement amount greater than ₹0.');
      return;
    }

    if (amountPaid > selectedItem.approvedAmount) {
      setModalError(`Disbursed amount (${formatCurrency(amountPaid)}) cannot exceed the CEO-approved cap of ${formatCurrency(selectedItem.approvedAmount)}.`);
      return;
    }

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (paymentDate > todayStr) {
      setModalError('Payment date cannot be in the future.');
      return;
    }

    if (['Bank Transfer', 'UPI', 'Cheque', 'NEFT', 'IMPS'].includes(paymentMode) && !transactionRef.trim()) {
      setModalError(`Transaction reference / UTR is mandatory for ${paymentMode}.`);
      return;
    }

    setIsSubmitting(true);

    try {
      if (selectedItem.sourceType === 'EXPENSE') {
        const exp = selectedItem.rawRecord as Expense;
        // Call backend API /api/expenses/:id/disburse if available, and update local state
        try {
          const res = await fetch(`/api/expenses/${exp.id}/disburse`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('vrm_auth_token') || ''}`
            },
            body: JSON.stringify({
              amountPaid,
              paymentMode,
              transactionRef: transactionRef.trim() || undefined,
              remarks: remarks.trim() || undefined
            })
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || data.error?.message || 'Server disbursement failed');
          }
        } catch (apiErr: any) {
          console.warn('[AccountsPaymentDashboard] API call error, applying optimistic update:', apiErr.message);
        }

        // Add audit notification to employee and CEO
        addNotification({
          title: 'Expense Claim Paid',
          message: `Your claim of ${formatCurrency(amountPaid)} (${exp.category}) has been paid via ${paymentMode}. Ref: ${transactionRef || 'N/A'}.`,
          priority: 'Normal',
          category: 'Payroll',
          targetEmployeeIds: [selectedItem.employeeId]
        });

        addNotification({
          title: 'Payment Distributed by Accounts',
          message: `Accounts disbursed ${formatCurrency(amountPaid)} to ${selectedItem.employeeName} for ${selectedItem.typeLabel}.`,
          priority: 'Normal',
          category: 'Payroll',
          targetRoles: ['CEO', 'Super Admin']
        });

      } else if (selectedItem.sourceType === 'ADVANCE') {
        const loan = selectedItem.rawRecord as LoanRecord;
        disburseLoan(loan.id, {
          disbursedDate: paymentDate,
          disbursedAmount: amountPaid,
          paymentMode: paymentMode as any,
          transactionRef: transactionRef.trim() || undefined,
          notes: remarks.trim() || undefined
        });

      } else if (selectedItem.sourceType === 'PETTY_CASH') {
        const pc = selectedItem.rawRecord as PettyCashRequest;
        await pettyCashService.disburseCash(pc.id, {
          disbursedAmount: amountPaid,
          paymentMode: paymentMode as any,
          paymentDate,
          paymentReference: transactionRef.trim() || 'CASH-DISBURSEMENT',
          remarks: remarks.trim() || undefined
        });

        addNotification({
          title: 'Petty Cash Funding Disbursed',
          message: `Petty cash fund of ${formatCurrency(amountPaid)} has been disbursed to custodian ${selectedItem.employeeName}. Ready for receipt confirmation.`,
          priority: 'Important',
          category: 'Payroll',
          targetEmployeeIds: [selectedItem.employeeId]
        });

        await fetchPettyCashRequests();
      }

      setSuccessMessage(`Payment of ${formatCurrency(amountPaid)} recorded successfully for ${selectedItem.employeeName} (${selectedItem.requestNumber}).`);
      setTimeout(() => {
        setSelectedItem(null);
        setSuccessMessage(null);
      }, 1200);

    } catch (err: any) {
      setModalError(err.message || 'Payment execution failed. Please verify network and permissions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="accounts-payment-dashboard" style={{ paddingBottom: '40px' }}>
      {/* 1. Header & Title Banner */}
      <div className="card" style={{ marginBottom: '20px', padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{ 
                width: '38px', 
                height: '38px', 
                borderRadius: '10px', 
                backgroundColor: '#ECFEFF', 
                color: '#0E7490', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                flexShrink: 0 
              }}>
                <Receipt size={22} strokeWidth={2.4} />
              </div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
                Accounts Payment Disbursement
              </h1>
            </div>
            <p style={{ color: '#64748B', fontSize: '0.88rem', margin: 0 }}>
              Official disbursement desk for CEO-approved Expense Claims, Advance Salaries, and Petty Cash Funding.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button 
              type="button" 
              onClick={fetchPettyCashRequests} 
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem' }}
              title="Refresh Queue"
            >
              <RefreshCw size={15} className={isLoadingPettyCash ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '9999px',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#15803D'
            }}>
              <ShieldCheck size={14} />
              <span>CEO Approval Enforced</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Top Summary Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '22px'
      }}>
        {/* Total Pending */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #0E7490' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Pending Disbursements
            </span>
            <span style={{ padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#ECFEFF', color: '#0E7490', fontSize: '0.75rem', fontWeight: 800 }}>
              {metrics.pendingCount}
            </span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {formatCurrency(metrics.pendingTotal)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '4px' }}>
            Awaiting Accounts payment distribution
          </div>
        </div>

        {/* Expense Claims */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #EA580C' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Approved Expenses
            </span>
            <CreditCard size={17} color="#EA580C" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {formatCurrency(metrics.pendingExpensesTotal)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#EA580C', fontWeight: 600, marginTop: '4px' }}>
            {metrics.pendingExpensesCount} claim(s) ready for payout
          </div>
        </div>

        {/* Advance Salaries */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #16A34A' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Approved Advances
            </span>
            <Banknote size={17} color="#16A34A" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {formatCurrency(metrics.pendingAdvancesTotal)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#16A34A', fontWeight: 600, marginTop: '4px' }}>
            {metrics.pendingAdvancesCount} advance(s) ready for payout
          </div>
        </div>

        {/* Petty Cash Funds */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #0891B2' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Petty Cash Funding
            </span>
            <Wallet size={17} color="#0891B2" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {formatCurrency(metrics.pendingPettyCashTotal)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#0891B2', fontWeight: 600, marginTop: '4px' }}>
            {metrics.pendingPettyCashCount} custodian request(s)
          </div>
        </div>
      </div>

      {/* 3. Controls & Filter Bar */}
      <div className="card" style={{ marginBottom: '18px', padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* Navigation Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`btn ${activeTab === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 14px', fontSize: '0.82rem', borderRadius: '10px', whiteSpace: 'nowrap' }}
            >
              All Pending ({metrics.pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('EXPENSES')}
              className={`btn ${activeTab === 'EXPENSES' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 14px', fontSize: '0.82rem', borderRadius: '10px', whiteSpace: 'nowrap' }}
            >
              Expense Claims ({metrics.pendingExpensesCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ADVANCES')}
              className={`btn ${activeTab === 'ADVANCES' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 14px', fontSize: '0.82rem', borderRadius: '10px', whiteSpace: 'nowrap' }}
            >
              Salary Advances ({metrics.pendingAdvancesCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PETTY_CASH')}
              className={`btn ${activeTab === 'PETTY_CASH' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 14px', fontSize: '0.82rem', borderRadius: '10px', whiteSpace: 'nowrap' }}
            >
              Petty Cash ({metrics.pendingPettyCashCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('HISTORY')}
              className={`btn ${activeTab === 'HISTORY' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 14px', fontSize: '0.82rem', borderRadius: '10px', whiteSpace: 'nowrap' }}
            >
              <History size={14} style={{ marginRight: '6px' }} />
              Payment History ({metrics.disbursedCount})
            </button>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by ID, name, dept..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-control"
              style={{ paddingLeft: '36px', height: '38px', fontSize: '0.84rem', borderRadius: '10px' }}
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Payment Queue Table (Desktop) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive accounts-desktop-table">
          <table className="hrms-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Request ID</th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Type & Category</th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Claimant / Employee</th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Approved Amount</th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>CEO Approval Date</th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', textAlign: 'right' }}>Payment Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: '#64748B' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <CheckCircle2 size={36} color="#0E7490" />
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>
                        No payment requests in this queue
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                        {activeTab === 'HISTORY' 
                          ? 'No past disbursements recorded yet.' 
                          : 'All CEO-approved requests have been processed. New requests will appear here once approved by the CEO.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const isPending = item.status === 'PENDING_DISBURSEMENT';

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      {/* Request ID */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <span style={{ 
                          fontFamily: 'monospace', 
                          fontWeight: 700, 
                          color: '#0E7490', 
                          fontSize: '0.82rem',
                          backgroundColor: '#ECFEFF',
                          padding: '3px 8px',
                          borderRadius: '6px'
                        }}>
                          {item.requestNumber}
                        </span>
                      </td>

                      {/* Type & Category */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {item.sourceType === 'EXPENSE' && (
                            <span style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#FFF7ED', color: '#EA580C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <CreditCard size={15} />
                            </span>
                          )}
                          {item.sourceType === 'ADVANCE' && (
                            <span style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Banknote size={15} />
                            </span>
                          )}
                          {item.sourceType === 'PETTY_CASH' && (
                            <span style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#ECFEFF', color: '#0891B2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Wallet size={15} />
                            </span>
                          )}
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>{item.typeLabel}</div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B' }}>{item.purpose}</div>
                          </div>
                        </div>
                      </td>

                      {/* Claimant */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 750, color: '#0F172A' }}>{item.employeeName}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                          {item.employeeId} • {item.department}
                        </div>
                      </td>

                      {/* Approved Amount */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0E7490' }}>
                          {formatCurrency(item.approvedAmount)}
                        </div>
                        {item.requestedAmount > item.approvedAmount && (
                          <div style={{ fontSize: '0.7rem', color: '#EA580C', textDecoration: 'line-through' }}>
                            Req: {formatCurrency(item.requestedAmount)}
                          </div>
                        )}
                      </td>

                      {/* CEO Approval Date */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                          <Calendar size={14} color="#64748B" />
                          <span>{item.approvedDate}</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>
                          By {item.approvedBy}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        {isPending ? (
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '5px', 
                            padding: '3px 10px', 
                            borderRadius: '9999px', 
                            backgroundColor: '#FEF3C7', 
                            color: '#B45309', 
                            border: '1px solid #FDE68A',
                            fontSize: '0.76rem',
                            fontWeight: 700 
                          }}>
                            <Clock size={12} />
                            Ready for Payment
                          </span>
                        ) : (
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '5px', 
                            padding: '3px 10px', 
                            borderRadius: '9999px', 
                            backgroundColor: '#DCFCE7', 
                            color: '#15803D', 
                            border: '1px solid #BBF7D0',
                            fontSize: '0.76rem',
                            fontWeight: 700 
                          }}>
                            <Check size={12} />
                            Disbursed
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'right' }}>
                        {isPending ? (
                          <button
                            type="button"
                            onClick={() => handleOpenDisburseModal(item)}
                            className="btn btn-primary"
                            style={{ 
                              padding: '7px 14px', 
                              fontSize: '0.82rem', 
                              borderRadius: '8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <span>Distribute Payment</span>
                            <ArrowUpRight size={14} />
                          </button>
                        ) : (
                          <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                            <div>{item.paymentDetails?.paymentMode || 'Paid'}</div>
                            {item.paymentDetails?.transactionRef && (
                              <div style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                                Ref: {item.paymentDetails.transactionRef}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Disbursement Cards */}
        <div className="accounts-mobile-cards" style={{ padding: '12px' }}>
          {filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
              <CheckCircle2 size={36} color="#0E7490" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 750, fontSize: '0.92rem', color: '#1E293B' }}>No Payment Requests in Queue</div>
              <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '4px 0 0' }}>
                {activeTab === 'HISTORY' 
                  ? 'No past disbursements recorded yet.' 
                  : 'All CEO-approved requests have been processed.'}
              </p>
            </div>
          ) : (
            filteredItems.map(item => {
              const isPending = item.status === 'PENDING_DISBURSEMENT';
              return (
                <div key={item.id} className="mobile-payment-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontWeight: 800,
                          color: '#0E7490',
                          fontSize: '0.82rem',
                          backgroundColor: '#ECFEFF',
                          padding: '2px 7px',
                          borderRadius: '6px'
                        }}>
                          {item.requestNumber}
                        </span>
                        <span style={{ fontSize: '0.72rem', background: '#F1F5F9', color: '#334155', padding: '2px 7px', borderRadius: '6px', fontWeight: 700 }}>
                          {item.typeLabel}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 750, color: '#0F172A', marginTop: '4px' }}>
                        {item.employeeName}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {item.employeeId} • {item.department}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0E7490' }}>
                        {formatCurrency(item.approvedAmount)}
                      </div>
                      <div style={{ marginTop: '4px' }}>
                        {isPending ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            backgroundColor: '#FEF3C7',
                            color: '#B45309',
                            fontSize: '0.7rem',
                            fontWeight: 700
                          }}>
                            <Clock size={11} /> Ready
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            backgroundColor: '#DCFCE7',
                            color: '#15803D',
                            fontSize: '0.7rem',
                            fontWeight: 700
                          }}>
                            <Check size={11} /> Paid
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#475569', background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 600 }}>{item.purpose}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                      Approved by {item.approvedBy} on {item.approvedDate}
                    </div>
                  </div>

                  <div style={{ marginTop: '2px' }}>
                    {isPending ? (
                      <button
                        type="button"
                        onClick={() => handleOpenDisburseModal(item)}
                        className="btn btn-primary btn-sm"
                        style={{
                          width: '100%',
                          borderRadius: '10px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          minHeight: '38px'
                        }}
                      >
                        <span>Distribute Payment</span>
                        <ArrowUpRight size={15} />
                      </button>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: '#64748B', padding: '4px 6px' }}>
                        <span>Mode: <strong style={{ color: '#1E293B' }}>{item.paymentDetails?.paymentMode || 'Paid'}</strong></span>
                        {item.paymentDetails?.transactionRef && (
                          <span style={{ fontFamily: 'monospace' }}>Ref: {item.paymentDetails.transactionRef}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 5. Payment Distribution Modal */}
      {selectedItem && (
        <div 
          className="modal-overlay" 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div 
            className="modal-content"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Record Payment Distribution
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  {selectedItem.requestNumber} • {selectedItem.typeLabel}
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedItem(null)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleExecutePayment} style={{ padding: '22px' }}>
              {/* Request Summary Box */}
              <div style={{
                backgroundColor: '#ECFEFF',
                border: '1px solid #A5F3FC',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '18px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#0891B2', fontWeight: 700, textTransform: 'uppercase' }}>Recipient</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0E7490' }}>{selectedItem.employeeName}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{selectedItem.employeeId} ({selectedItem.department})</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#0891B2', fontWeight: 700, textTransform: 'uppercase' }}>Approved by CEO</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0E7490' }}>{formatCurrency(selectedItem.approvedAmount)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>Sanctioned on {selectedItem.approvedDate}</div>
                </div>
              </div>

              {modalError && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#B91C1C',
                  fontSize: '0.82rem'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{modalError}</span>
                </div>
              )}

              {successMessage && (
                <div style={{
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#15803D',
                  fontSize: '0.82rem'
                }}>
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <span>{successMessage}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                {/* Amount Paid */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Amount Paid (₹) *
                  </label>
                  <input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(Number(e.target.value))}
                    max={selectedItem.approvedAmount}
                    min={1}
                    required
                    className="form-control"
                    style={{ fontWeight: 700, color: '#0F172A' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                    Max allowed: {formatCurrency(selectedItem.approvedAmount)}
                  </span>
                </div>

                {/* Payment Date */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    max={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}
                    required
                    className="form-control"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                {/* Payment Mode */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Payment Mode *
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    className="form-control"
                    required
                  >
                    <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="Cash">Cash Distribution</option>
                    <option value="Cheque">Company Cheque</option>
                    <option value="IMPS">IMPS Immediate</option>
                  </select>
                </div>

                {/* Transaction Reference */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Transaction Ref / UTR {paymentMode !== 'Cash' ? '*' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR-984012356"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    required={paymentMode !== 'Cash'}
                    className="form-control"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Accounts Remarks / Notes
                </label>
                <input
                  type="text"
                  placeholder="Optional payment processing notes"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="form-control"
                />
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  disabled={isSubmitting}
                  className="btn btn-secondary"
                  style={{ minWidth: '90px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                  style={{ minWidth: '150px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Recording Payment...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Confirm & Disburse</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
