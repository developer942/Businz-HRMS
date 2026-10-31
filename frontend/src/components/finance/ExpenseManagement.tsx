import React, { useState, useRef, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { DateInput } from '../common/DateInput';
import { 
  IndianRupee, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Image as ImageIcon, 
  Eye, 
  Upload, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  RotateCcw, 
  ExternalLink, 
  Trash2, 
  Check, 
  ShieldCheck, 
  AlertCircle, 
  Search, 
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { toNum, formatCurrency } from '../../utils/numbers';
import { formatDateDDMMYYYY, isValidISODate } from '../../utils/dateUtils';
import { downloadPDF, downloadCSV, downloadExcel, ExportColumn } from '../../utils/exportUtils';
import { ExportDropdown } from '../common/ExportDropdown';
import { Expense } from '../../types/hrms';
import { 
  getTodayKolkata, 
  checkDuplicateExpense, 
  DUPLICATE_REQUEST_ERROR_MESSAGE,
  MAX_EXPENSE_CLAIM_AMOUNT,
  validateExpenseAmount
} from '../../utils/requestValidation';
import { handleFormKeyDown, preventSpaceEnterPropagation } from '../../utils/keyboardUtils';

interface ExpenseManagementProps {
  openAddModal?: boolean;
  onCloseQuickAdd?: () => void;
}

export const ExpenseManagement: React.FC<ExpenseManagementProps> = ({ openAddModal, onCloseQuickAdd }) => {
  const { expenses, addExpense, approveExpense, deleteExpense, currentUser, employees } = useHRMS();
  const [showModal, setShowModal] = useState<boolean>(false);
  const [viewingReceiptExpense, setViewingReceiptExpense] = useState<Expense | null>(null);

  // Lightbox Zoom & Rotate state
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  // Strict approval authority: CEO alone
  const isCEOUser = 
    currentUser.role === 'CEO' || 
    currentUser.role === 'Super Admin' || 
    (currentUser as any).designation?.toLowerCase().includes('ceo') ||
    (currentUser as any).designation?.toLowerCase().includes('managing director');

  const isApprovalAuthority = isCEOUser;

  // Accounts Department users: Finance Manager or Accounts/Finance department/designation
  const isAccountsUser = 
    currentUser.role === 'Finance Manager' ||
    (currentUser.department && (currentUser.department.toLowerCase().includes('accounts') || currentUser.department.toLowerCase().includes('finance'))) ||
    (currentUser.designation && (currentUser.designation.toLowerCase().includes('account') || currentUser.designation.toLowerCase().includes('finance')));

  // Accounts staff have normal employee access in ExpenseManagement (viewing and submitting only their own claims)
  const isEmployeeRole = (currentUser.role === 'Employee' || isAccountsUser) && !isApprovalAuthority;
  const isHrUser = currentUser.role === 'HR Manager' || currentUser.role === 'HR Admin' || currentUser.role === 'HR';
  const canSubmitClaim = isEmployeeRole || isHrUser;
  const canApprove = isApprovalAuthority;
  // Accounts disburse CEO-approved claims in the Accounts Payment Dashboard
  const canDisburse = isAccountsUser;
  const isAccountsOnly = isAccountsUser && !isApprovalAuthority;

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [scopeTab, setScopeTab] = useState<'all' | 'my' | 'approved'>(isEmployeeRole ? 'my' : (isAccountsOnly ? 'approved' : 'all'));

  // Multi-row selection
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  // Pagination per AGENTS.md rules ([5, 10])
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [targetPageInput, setTargetPageInput] = useState<string>('');

  // Form State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expForm, setExpForm] = useState({
    employeeId: currentUser.employeeId || '',
    category: 'Travel' as Expense['category'],
    amount: 1500,
    date: getTodayKolkata(),
    description: '',
    receiptUrl: '',
    fileName: '',
    fileSize: ''
  });
  const [formError, setFormError] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState<boolean>(false);

  React.useEffect(() => {
    if (openAddModal && canSubmitClaim) {
      setShowModal(true);
    }
  }, [openAddModal, canSubmitClaim]);

  React.useEffect(() => {
    if (currentUser.employeeId) {
      setExpForm(prev => ({ ...prev, employeeId: currentUser.employeeId || '' }));
    }
    if (isEmployeeRole) {
      setScopeTab('my');
    }
  }, [currentUser, isEmployeeRole]);

  // Handle local receipt file upload via FileReader
  const handleFileSelection = (file?: File) => {
    if (!file) return;
    setFormError('');

    // Check size (< 8MB)
    if (file.size > 8 * 1024 * 1024) {
      setFormError('File exceeds 8MB limit. Please upload a smaller receipt image.');
      return;
    }

    const sizeKb = Math.round(file.size / 1024);
    const formattedSize = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setExpForm(prev => ({
        ...prev,
        receiptUrl: result,
        fileName: file.name,
        fileSize: formattedSize
      }));
    };
    reader.onerror = () => {
      setFormError('Failed to read file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelection(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelection(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleRemoveReceipt = () => {
    setExpForm(prev => ({
      ...prev,
      receiptUrl: '',
      fileName: '',
      fileSize: ''
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (isSubmittingExpense) return;

    const amountVal = validateExpenseAmount(expForm.amount);
    if (!amountVal.valid) {
      setFormError(amountVal.error || 'Please enter a valid expense amount.');
      return;
    }

    if (!expForm.receiptUrl) {
      setFormError('Please attach a bill or receipt image as proof for the claimed amount.');
      return;
    }

    if (!isValidISODate(expForm.date)) {
      setFormError('Please enter a valid expense date in DD/MM/YYYY format.');
      return;
    }
    if (expForm.date > getTodayKolkata()) {
      setFormError('Future expense dates are not allowed. Please select today or a past date.');
      return;
    }

    const targetEmpId = isEmployeeRole ? (currentUser.employeeId || currentUser.id || '') : expForm.employeeId;
    const emp = employees.find(employee => employee.employeeId === targetEmpId || employee.id === targetEmpId);
    if (!emp) {
      setFormError('Your employee profile could not be found. Please contact HR.');
      return;
    }

    const dupCheck = checkDuplicateExpense(expenses, targetEmpId, expForm.date, expForm.category, Number(expForm.amount));
    if (dupCheck.hasDuplicate) {
      setFormError(dupCheck.error || DUPLICATE_REQUEST_ERROR_MESSAGE);
      return;
    }

    setIsSubmittingExpense(true);
    try {
      const result = await addExpense({
        employeeId: emp.employeeId,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        department: emp.department,
        category: expForm.category,
        amount: Number(expForm.amount),
        date: expForm.date,
        description: expForm.description || `${expForm.category} Business Expense Claim`,
        receiptUrl: expForm.receiptUrl
      });

      if (!result.success) {
        setFormError(result.message || 'Expense claim could not be saved. Please try again.');
        return;
      }

      // Reset & close
      setShowModal(false);
      setExpForm({
        employeeId: currentUser.employeeId || 'EMP-001',
        category: 'Travel',
        amount: 1500,
        date: getTodayKolkata(),
        description: '',
        receiptUrl: '',
        fileName: '',
        fileSize: ''
      });
      if (onCloseQuickAdd) onCloseQuickAdd();
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  // User identity helpers for role scoping
  const userEmpId = (currentUser.employeeId || currentUser.id || '').trim().toLowerCase();
  const userName = (currentUser.name || '').trim().toLowerCase();

  const isUserExpense = (exp: Expense) => {
    const expEmpId = (exp.employeeId || '').trim().toLowerCase();
    const expEmpName = (exp.employeeName || '').trim().toLowerCase();
    if (userEmpId && expEmpId && userEmpId === expEmpId) return true;
    if (userName && expEmpName && (expEmpName === userName || expEmpName.includes(userName) || userName.includes(expEmpName))) return true;
    return false;
  };

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      // Scope filter: if 'approved', show all claims approved for Accounts; if Employee or 'my', show user's own claims
      if (scopeTab === 'approved') {
        if (exp.status !== 'Reimbursed' && exp.status !== 'Approved') return false;
      } else if (isEmployeeRole || scopeTab === 'my') {
        if (!isUserExpense(exp)) return false;
      }

      // Category filter
      if (categoryFilter !== 'ALL' && exp.category !== categoryFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'Pending' && !exp.status.startsWith('Pending')) return false;
        if (statusFilter !== 'Pending' && exp.status !== statusFilter) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchEmp = exp.employeeName.toLowerCase().includes(q) || exp.employeeId.toLowerCase().includes(q);
        const matchDept = exp.department.toLowerCase().includes(q);
        const matchDesc = exp.description.toLowerCase().includes(q);
        const matchCat = exp.category.toLowerCase().includes(q);
        const matchId = exp.id.toLowerCase().includes(q);
        if (!matchEmp && !matchDept && !matchDesc && !matchCat && !matchId) {
          return false;
        }
      }

      return true;
    });
  }, [expenses, scopeTab, isEmployeeRole, userEmpId, userName, categoryFilter, statusFilter, searchQuery]);

  // Pagination calculation
  const totalEntries = filteredExpenses.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedExpenses = filteredExpenses.slice(startIndex, startIndex + pageSize);
  const displayedExpenses = isEmployeeRole ? filteredExpenses : paginatedExpenses;

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleGoToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(targetPageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      setCurrentPage(p);
      setTargetPageInput('');
    }
  };

  // Download official voucher PDF for approved claim
  const handleDownloadVoucher = (exp: Expense) => {
    const columns: ExportColumn[] = [
      { label: 'Parameter', key: 'field' },
      { label: 'Details', key: 'value' }
    ];
    const data = [
      { field: 'Voucher Reference', value: `EXP-VCHR-${exp.id}` },
      { field: 'Claim Date', value: formatDateDDMMYYYY(exp.date) },
      { field: 'Employee Code', value: exp.employeeId },
      { field: 'Employee Name', value: exp.employeeName },
      { field: 'Department', value: exp.department },
      { field: 'Expense Category', value: exp.category },
      { field: 'Claimed Reimbursement Amount', value: `₹${toNum(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
      { field: 'Expense Description', value: exp.description || `${exp.category} Business Expense` },
      { field: 'Current Claim Status', value: exp.status },
      { field: 'Approval Authority (HR / CEO)', value: exp.approvedBy || 'Awaiting HR / CEO Approval' },
      { field: 'Disbursement Status', value: exp.status === 'Reimbursed' ? `Amount handed over by Accounts${exp.reimbursedBy ? ` (${exp.reimbursedBy})` : ''}${exp.reimbursedDate ? ` on ${formatDateDDMMYYYY(exp.reimbursedDate)}` : ''}` : exp.status === 'Approved' ? 'Approved by HR/CEO • Awaiting Accounts Payout' : 'Awaiting HR/CEO Sign-off' },
      { field: 'Bill Proof Attachment', value: exp.receiptUrl ? 'Verified & Digitally Attached in Dossier' : 'No Digital Receipt Attached' }
    ];
    downloadPDF(data, `Expense Reimbursement Voucher - ${exp.employeeName}`, `Expense_Voucher_${exp.employeeId}_${exp.id}`, columns);
  };

  // Export dataset for Accounts and Management
  const getExpenseExportData = (targetExpenses?: Expense[]) => {
    const source = targetExpenses || filteredExpenses;
    const columns: ExportColumn[] = [
      { label: 'Claim ID', key: 'id' },
      { label: 'Date', key: 'date' },
      { label: 'Employee ID', key: 'employeeId' },
      { label: 'Employee Name', key: 'employeeName' },
      { label: 'Department', key: 'department' },
      { label: 'Category', key: 'category' },
      { label: 'Amount (INR)', key: 'amount' },
      { label: 'Status', key: 'status' },
      { label: 'Approved By', key: 'approvedBy' },
      { label: 'Paid By (Accounts)', key: 'reimbursedBy' },
      { label: 'Description', key: 'description' }
    ];
    const data = source.map(e => ({
      id: e.id,
      date: formatDateDDMMYYYY(e.date),
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      department: e.department,
      category: e.category,
      amount: toNum(e.amount).toFixed(2),
      status: e.status,
      approvedBy: e.approvedBy || '-',
      reimbursedBy: e.reimbursedBy || '-',
      description: e.description || ''
    }));
    return { columns, data };
  };

  const handleExportCSV = () => {
    const { columns, data } = getExpenseExportData();
    downloadCSV(data, `Expense_Claims_Register_${new Date().toISOString().slice(0, 10)}`, columns);
  };

  const handleExportExcel = () => {
    const { columns, data } = getExpenseExportData();
    downloadExcel(data, `Expense_Claims_Register_${new Date().toISOString().slice(0, 10)}`, columns);
  };

  const handleExportPDF = () => {
    const { columns, data } = getExpenseExportData();
    downloadPDF(data, 'Corporate Expense Claims & Reimbursements Register', `Expense_Claims_${new Date().toISOString().slice(0, 10)}`, columns);
  };

  const handleExportSelected = () => {
    const selected = expenses.filter(e => selectedRowIds.includes(e.id));
    const { columns, data } = getExpenseExportData(selected);
    downloadExcel(data, `Selected_Expense_Claims_${new Date().toISOString().slice(0, 10)}`, columns);
  };

  // Row selection
  const handleToggleRow = (id: string) => {
    setSelectedRowIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleAll = () => {
    const currentPageIds = paginatedExpenses.map(e => e.id);
    const allSelected = currentPageIds.every(id => selectedRowIds.includes(id));
    if (allSelected) {
      setSelectedRowIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedRowIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  // Batch actions
  const isPendingStatus = (status: Expense['status']) => status === 'Pending Finance' || status === 'Pending Manager';

  // HR / CEO approval → claim moves to Accounts for payout
  const handleBatchApprove = () => {
    if (!canApprove) return;
    expenses
      .filter(e => selectedRowIds.includes(e.id) && isPendingStatus(e.status))
      .forEach(e => approveExpense(e.id, currentUser.name, 'Approved'));
    setSelectedRowIds([]);
  };

  const handleBatchReject = () => {
    if (!canApprove) return;
    expenses
      .filter(e => selectedRowIds.includes(e.id) && isPendingStatus(e.status))
      .forEach(e => approveExpense(e.id, currentUser.name, 'Rejected'));
    setSelectedRowIds([]);
  };

  // Accounts hands over the amount for HR/CEO-approved claims
  const handleMarkPaid = (id: string) => {
    if (!canDisburse) return;
    approveExpense(id, currentUser.name, 'Reimbursed');
  };

  const handleBatchMarkPaid = () => {
    if (!canDisburse) return;
    expenses
      .filter(e => selectedRowIds.includes(e.id) && e.status === 'Approved')
      .forEach(e => approveExpense(e.id, currentUser.name, 'Reimbursed'));
    setSelectedRowIds([]);
  };

  const handleBatchDelete = () => {
    if (!canApprove) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedRowIds.length} selected claim(s)?`)) return;
    selectedRowIds.forEach(id => deleteExpense(id));
    setSelectedRowIds([]);
  };

  const selectedPendingCount = expenses.filter(e => selectedRowIds.includes(e.id) && isPendingStatus(e.status)).length;
  const selectedApprovedCount = expenses.filter(e => selectedRowIds.includes(e.id) && e.status === 'Approved').length;

  // Metric cards calculations: Scoped to employee's own claims for Employee role; company-wide for HR/CEO
  const scopedExpenses = isEmployeeRole ? expenses.filter(isUserExpense) : expenses;
  const totalClaimed = scopedExpenses.reduce((acc, curr) => acc + toNum(curr.amount), 0);
  const pendingFinance = scopedExpenses.filter(e => e.status === 'Pending Finance' || e.status === 'Pending Manager').length;
  const totalReimbursed = scopedExpenses.filter(e => e.status === 'Reimbursed').reduce((acc, curr) => acc + toNum(curr.amount), 0);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="page-title-group">
          <h1>Finance &amp; Expense Claims</h1>
        </div>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>


          {/* Export Dropdown for Accounts and HR/CEO */}
          {!isEmployeeRole && (
            <ExportDropdown 
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
              onExportCSV={handleExportCSV}
            />
          )}

          {canSubmitClaim && (
            <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Submit Expense Claim
            </button>
          )}


        </div>
      </div>

      {/* KPI Cards: Shows personal totals for Employee role */}
      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="kpi-card" style={{ borderRadius: '16px', minWidth: 0, overflow: 'hidden' }}>
          <div className="kpi-card-header">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isEmployeeRole ? 'My Total Claimed Amount' : 'Total Claimed Amount'}
            </span>
            <div className="kpi-icon-wrapper blue" style={{ flexShrink: 0 }}><IndianRupee size={20} /></div>
          </div>
          <div className="kpi-card-body" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div 
              className="kpi-value" 
              title={`₹${totalClaimed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              style={{ 
                color: '#0E7490', 
                fontWeight: 800, 
                minWidth: 0, 
                maxWidth: '100%', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap' 
              }}
            >
              ₹{totalClaimed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isEmployeeRole 
                ? `Across ${scopedExpenses.length} personal claims submitted` 
                : `Across ${expenses.length} claims submitted`}
            </div>
          </div>
        </div>

        <div className="kpi-card" style={{ borderRadius: '16px', minWidth: 0, overflow: 'hidden' }}>
          <div className="kpi-card-header">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isEmployeeRole ? 'My Pending Verification' : 'Pending Review & Verification'}
            </span>
            <div className="kpi-icon-wrapper amber" style={{ flexShrink: 0 }}><FileText size={20} /></div>
          </div>
          <div className="kpi-card-body" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div 
              className="kpi-value" 
              style={{ 
                color: '#D97706', 
                fontWeight: 800, 
                minWidth: 0, 
                maxWidth: '100%', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap' 
              }}
            >
              {pendingFinance}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isEmployeeRole 
                ? 'Your claims awaiting bill audit & reimbursement' 
                : 'Claims awaiting bill audit & reimbursement'}
            </div>
          </div>
        </div>

        <div className="kpi-card" style={{ borderRadius: '16px', minWidth: 0, overflow: 'hidden' }}>
          <div className="kpi-card-header">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isEmployeeRole ? 'My Total Reimbursed Amount' : 'Total Reimbursed Payouts'}
            </span>
            <div className="kpi-icon-wrapper emerald" style={{ flexShrink: 0 }}><CheckCircle2 size={20} /></div>
          </div>
          <div className="kpi-card-body" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div 
              className="kpi-value" 
              title={`₹${totalReimbursed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              style={{ 
                color: '#059669', 
                fontWeight: 800, 
                minWidth: 0, 
                maxWidth: '100%', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap' 
              }}
            >
              ₹{totalReimbursed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isEmployeeRole 
                ? 'Disbursed directly via corporate payroll' 
                : 'Disbursed directly via corporate payroll'}
            </div>
          </div>
        </div>
      </div>

      {/* Directory Table Card - Single Unified Box */}
      <div className="card" style={{ 
        borderRadius: '16px', 
        padding: 0, 
        border: '1px solid #E7ECF3',
        backgroundColor: '#ffffff',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
      }}>
        {/* Table Top Controls: Scope Tabs + Filters */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '16px', 
          padding: '16px 20px',
          borderBottom: '1px solid #F1F5F9',
          backgroundColor: '#ffffff'
        }}>
          {/* Scope Segmented Control */}
          <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '10px' }}>
            {!isEmployeeRole && (
              <>
                <button
                  type="button"
                  onClick={() => { setScopeTab('all'); setCurrentPage(1); }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: scopeTab === 'all' ? '#ffffff' : 'transparent',
                    color: scopeTab === 'all' ? '#0E7490' : '#64748B',
                    boxShadow: scopeTab === 'all' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  All Company Claims ({expenses.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setScopeTab('approved'); setCurrentPage(1); }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: scopeTab === 'approved' ? '#ffffff' : 'transparent',
                    color: scopeTab === 'approved' ? '#0E7490' : '#64748B',
                    boxShadow: scopeTab === 'approved' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Approved for Accounts ({expenses.filter(e => e.status === 'Reimbursed' || e.status === 'Approved').length})
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => { setScopeTab('my'); setCurrentPage(1); }}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: scopeTab === 'my' ? '#ffffff' : 'transparent',
                color: scopeTab === 'my' ? '#0E7490' : '#64748B',
                boxShadow: scopeTab === 'my' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              My Claims ({expenses.filter(isUserExpense).length})
            </button>
          </div>

          {/* Search & Category Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search claimant, ID, reason..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 32px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.82rem',
                  outline: 'none'
                }}
              />
            </div>

            <select
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
              style={{
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '0.82rem',
                color: '#334155',
                background: '#ffffff',
                outline: 'none'
              }}
            >
              <option value="ALL">All Categories</option>
              <option value="Travel">Travel</option>
              <option value="Meals">Meals</option>
              <option value="Equipment">Equipment</option>
              <option value="Training">Training</option>
              <option value="Utilities">Utilities</option>
              <option value="Other">Other</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              style={{
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '0.82rem',
                color: '#334155',
                background: '#ffffff',
                outline: 'none'
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="Pending">Pending Review</option>
              <option value="Approved">Approved (Awaiting Payment)</option>
              <option value="Reimbursed">Paid / Reimbursed</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* Unified Table - Single Box Container (Desktop) */}
        <div className="expense-desktop-table" style={{ overflowX: 'auto', width: '100%' }}>
          <table className="hrms-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {!isEmployeeRole && (
                  <th style={{ width: '40px', minWidth: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={displayedExpenses.length > 0 && displayedExpenses.every(e => selectedRowIds.includes(e.id))}
                      onChange={handleToggleAll}
                      style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </th>
                )}
                <th style={{ whiteSpace: 'nowrap' }}>Claim ID &amp; Employee</th>
                <th style={{ whiteSpace: 'nowrap' }}>Category</th>
                <th style={{ whiteSpace: 'nowrap' }}>Date</th>
                <th style={{ whiteSpace: 'nowrap' }}>Claimed Amount</th>
                <th style={{ whiteSpace: 'nowrap', maxWidth: '240px' }}>Description / Notes</th>
                <th style={{ whiteSpace: 'nowrap' }}>Bill / Receipt Proof</th>
                <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ 
                  textAlign: 'right', 
                  whiteSpace: 'nowrap', 
                  paddingRight: '20px'
                }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={isEmployeeRole ? 8 : 9} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                    <AlertCircle size={28} style={{ margin: '0 auto 8px', color: '#94A3B8' }} />
                    <div style={{ fontWeight: 600 }}>No expense claims found matching the current criteria.</div>
                    {canSubmitClaim && (
                      <button 
                        className="btn btn-primary btn-sm" 
                        style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => setShowModal(true)}
                      >
                        <Plus size={14} /> Submit Your First Expense Claim
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                displayedExpenses.map(exp => {
                  const isSelected = selectedRowIds.includes(exp.id);
                  const isPending = exp.status === 'Pending Finance' || exp.status === 'Pending Manager';

                  return (
                    <tr 
                      key={exp.id}
                      style={{
                        backgroundColor: isSelected ? '#ECFEFF' : undefined,
                        borderLeft: isSelected ? '4px solid #0E7490' : undefined,
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* Checkbox */}
                      {!isEmployeeRole && (
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRow(exp.id)}
                            style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                      )}

                      {/* Employee Info */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.88rem' }}>
                            {exp.employeeName}
                          </span>
                          <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                            {exp.employeeId} • {exp.department}
                          </span>
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '3px 8px', 
                          borderRadius: '6px', 
                          background: '#F1F5F9', 
                          color: '#334155', 
                          fontSize: '0.76rem', 
                          fontWeight: 600 
                        }}>
                          {exp.category}
                        </span>
                      </td>

                      {/* Date */}
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#334155' }}>
                        {formatDateDDMMYYYY(exp.date)}
                      </td>

                      {/* Amount */}
                      <td style={{ maxWidth: '140px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                          <span 
                            title={`₹${toNum(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            style={{ 
                              fontWeight: 800, 
                              color: '#0E7490', 
                              fontSize: '0.94rem',
                              display: 'inline-block',
                              maxWidth: '130px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ₹{toNum(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </td>

                      {/* Description */}
                      <td style={{ maxWidth: '240px' }}>
                        <div style={{ 
                          fontSize: '0.8rem', 
                          color: '#475569', 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis' 
                        }} title={exp.description}>
                          {exp.description || 'No description provided'}
                        </div>
                      </td>

                      {/* Bill / Receipt Proof (Requirement: "and hr site see") */}
                      <td>
                        {exp.receiptUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              setViewingReceiptExpense(exp);
                              setZoom(1);
                              setRotation(0);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 10px',
                              borderRadius: '8px',
                              background: '#ECFEFF',
                              border: '1px solid #A5F3FC',
                              color: '#0E7490',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#CFFAFE'}
                            onMouseLeave={e => e.currentTarget.style.background = '#ECFEFF'}
                            title="Click to inspect and verify uploaded bill receipt"
                          >
                            <Eye size={14} />
                            <span>View Bill Proof</span>
                          </button>
                        ) : (
                          <span style={{ 
                            fontSize: '0.74rem', 
                            color: '#94A3B8', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px' 
                          }}>
                            -- No Proof --
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`status-pill ${
                          exp.status === 'Reimbursed' ? 'success' : 
                          exp.status === 'Approved' ? 'cyan' :
                          exp.status === 'Rejected' ? 'danger' : 'pending'
                        }`} style={{ fontSize: '0.74rem', fontWeight: 600 }}>
                          {exp.status === 'Reimbursed' ? 'Paid' : exp.status === 'Approved' ? 'Approved • Awaiting Payment' : exp.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ 
                        textAlign: 'right', 
                        whiteSpace: 'nowrap',
                        paddingRight: '20px'
                      }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          {isPending ? (
                            isApprovalAuthority ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                <button 
                                  className="btn btn-success btn-sm" 
                                  style={{ padding: '6px 14px', fontSize: '0.78rem', borderRadius: '8px', fontWeight: 700, whiteSpace: 'nowrap' }}
                                  onClick={() => approveExpense(exp.id, currentUser.name, 'Approved')}
                                  title="Approve claim and send to Accounts for payout"
                                >
                                  Approve
                                </button>
                                <button 
                                  className="btn btn-danger btn-sm" 
                                  style={{ padding: '6px 14px', fontSize: '0.78rem', borderRadius: '8px', fontWeight: 700, whiteSpace: 'nowrap' }}
                                  onClick={() => approveExpense(exp.id, currentUser.name, 'Rejected')}
                                  title="Reject claim"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.74rem', color: '#D97706', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#FEF3C7', border: '1px solid #FDE68A' }}>
                                Awaiting HR/CEO
                              </span>
                            )
                          ) : exp.status === 'Approved' ? (
                            canDisburse ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => handleMarkPaid(exp.id)}
                                style={{ padding: '6px 14px', fontSize: '0.78rem', borderRadius: '8px', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#0E7490', borderColor: '#0E7490' }}
                                title={`Approved by ${exp.approvedBy || 'HR/CEO'} — hand over the amount and mark as paid`}
                              >
                                <IndianRupee size={13} /> Mark as Paid
                              </button>
                            ) : (
                              <span
                                style={{ fontSize: '0.74rem', color: '#0E7490', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#ECFEFF', border: '1px solid #A5F3FC' }}
                                title={exp.approvedBy ? `Approved by ${exp.approvedBy}` : 'Approved by HR/CEO'}
                              >
                                {isApprovalAuthority ? 'Sent to Accounts' : 'Approved • Awaiting Payment'}
                              </span>
                            )
                          ) : (
                            <span style={{ 
                              fontSize: '0.74rem', 
                              color: exp.status === 'Reimbursed' ? '#15803D' : '#64748B', 
                              fontWeight: 700, 
                              padding: '3px 8px', 
                              borderRadius: '6px', 
                              background: exp.status === 'Reimbursed' ? '#DCFCE7' : '#F1F5F9',
                              border: exp.status === 'Reimbursed' ? '1px solid #BBF7D0' : '1px solid #E2E8F0'
                            }}
                              title={exp.status === 'Reimbursed' && exp.approvedBy ? `Approved by ${exp.approvedBy}` : undefined}
                            >
                              {exp.status === 'Reimbursed' ? (exp.reimbursedBy ? `Paid by ${exp.reimbursedBy}` : (exp.approvedBy ? `Approved by ${exp.approvedBy}` : 'Paid')) : (exp.status === 'Rejected' ? 'Rejected' : 'Completed')}
                            </span>
                          )}

                          {/* Download Voucher Button - Accessible to Accounts, HR/CEO, and Employees */}
                          {(exp.status === 'Reimbursed' || exp.status === 'Approved') && (
                            <button 
                              type="button" 
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleDownloadVoucher(exp)}
                              style={{ 
                                padding: '5px 10px', 
                                fontSize: '0.74rem', 
                                borderRadius: '8px', 
                                color: '#0E7490', 
                                fontWeight: 700, 
                                border: '1px solid #A5F3FC', 
                                background: '#ECFEFF', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '4px' 
                              }}
                              title="Download Official Expense Reimbursement Payout Voucher"
                            >
                              <Download size={13} /> Voucher
                            </button>
                          )}

                          {/* HR/CEO Delete Action */}
                          {canApprove && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete claim ${exp.id}?`)) {
                                  deleteExpense(exp.id);
                                }
                              }}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                borderRadius: '6px'
                              }}
                              onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                              onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                              title="Delete claim"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Expense Claims Mobile Cards */}
        <div className="expense-mobile-cards" style={{ padding: '12px' }}>
          {displayedExpenses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
              <AlertCircle size={36} color="#94A3B8" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 750, fontSize: '0.92rem', color: '#1E293B' }}>No Expense Claims Found</div>
              <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '4px 0 14px' }}>No claims matching the selected filters.</p>
              {canSubmitClaim && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowModal(true)}
                  style={{ borderRadius: '10px', padding: '8px 16px', fontWeight: 650 }}
                >
                  <Plus size={15} /> Submit Expense Claim
                </button>
              )}
            </div>
          ) : (
            displayedExpenses.map(exp => {
              const isPending = exp.status === 'Pending Finance' || exp.status === 'Pending Manager';
              return (
                <div key={exp.id} className="mobile-expense-card">
                  <div className="mobile-expense-card-header">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 800, color: '#0E7490', fontSize: '0.84rem' }}>{exp.id}</span>
                        <span style={{ fontSize: '0.72rem', background: '#EFF6FF', color: '#1D4ED8', padding: '2px 7px', borderRadius: '6px', fontWeight: 700 }}>
                          {exp.category}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                        {exp.employeeName} • {formatDateDDMMYYYY(exp.date)}
                      </div>
                    </div>
                    <div className="mobile-expense-card-amount">
                      ₹{toNum(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  {exp.description && (
                    <div style={{ fontSize: '0.8rem', color: '#334155', background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', lineHeight: 1.4 }}>
                      {exp.description}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor:
                          exp.status === 'Reimbursed' ? '#DCFCE7' :
                          exp.status === 'Approved' ? '#ECFEFF' :
                          exp.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                        color:
                          exp.status === 'Reimbursed' ? '#15803D' :
                          exp.status === 'Approved' ? '#0E7490' :
                          exp.status === 'Rejected' ? '#B91C1C' : '#B45309',
                        border: `1px solid ${
                          exp.status === 'Reimbursed' ? '#BBF7D0' :
                          exp.status === 'Approved' ? '#A5F3FC' :
                          exp.status === 'Rejected' ? '#FECACA' : '#FDE68A'
                        }`
                      }}>
                        {exp.status === 'Reimbursed' ? 'Paid / Reimbursed' : exp.status}
                      </span>

                      {exp.receiptUrl && (
                        <button
                          type="button"
                          onClick={() => setViewingReceiptExpense(exp)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#F1F5F9',
                            border: '1px solid #E2E8F0',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            color: '#0E7490',
                            fontWeight: 650,
                            cursor: 'pointer'
                          }}
                        >
                          <Eye size={12} /> Receipt
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {(exp.status === 'Reimbursed' || exp.status === 'Approved') && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleDownloadVoucher(exp)}
                          style={{ padding: '4px 8px', fontSize: '0.72rem', borderRadius: '8px' }}
                        >
                          <Download size={12} /> Voucher
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Actions for Approver / Disburser on Mobile */}
                  {isPending && canApprove && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1, borderRadius: '8px', fontWeight: 700 }}
                        onClick={() => approveExpense(exp.id, currentUser.name, 'Approved')}
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        style={{ flex: 1, borderRadius: '8px', fontWeight: 700 }}
                        onClick={() => approveExpense(exp.id, currentUser.name, 'Rejected')}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}

                  {exp.status === 'Approved' && canDisburse && (
                    <div style={{ marginTop: '2px' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ width: '100%', borderRadius: '8px', fontWeight: 700, backgroundColor: '#0E7490' }}
                        onClick={() => handleMarkPaid(exp.id)}
                      >
                        <IndianRupee size={14} /> Mark as Paid
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Standardized Pagination Footer per AGENTS.md (Strictly [5, 10]) */}
        {!isEmployeeRole && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderTop: '1px solid #F1F5F9',
            flexWrap: 'wrap',
            gap: '12px',
            backgroundColor: '#ffffff'
          }}>
            {/* Left: Rows-per-page selector restricted strictly to [5, 10] */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#64748B' }}>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.82rem',
                  color: '#1E293B',
                  background: '#ffffff',
                  outline: 'none'
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
              <span>
                Showing {totalEntries > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + pageSize, totalEntries)} of {totalEntries} entries
              </span>
            </div>

            {/* Right: Page Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  style={{ padding: '4px 8px', minWidth: '32px' }}
                  title="First page"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{ padding: '4px 8px', minWidth: '32px' }}
                  title="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>

                {/* Page numbers */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((p, idx, arr) => {
                    const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
                    return (
                      <React.Fragment key={p}>
                        {showEllipsisBefore && <span style={{ padding: '0 4px', color: '#94A3B8' }}>...</span>}
                        <button
                          type="button"
                          className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => handlePageChange(p)}
                          style={{
                            padding: '4px 10px',
                            minWidth: '32px',
                            backgroundColor: currentPage === p ? '#0E7490' : undefined,
                            borderColor: currentPage === p ? '#0E7490' : undefined,
                            color: currentPage === p ? '#ffffff' : undefined,
                            fontWeight: currentPage === p ? 700 : 500
                          }}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    );
                  })}

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{ padding: '4px 8px', minWidth: '32px' }}
                  title="Next page"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  style={{ padding: '4px 8px', minWidth: '32px' }}
                  title="Last page"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>

              {/* Jump to page */}
              <form onSubmit={handleGoToPage} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Go to:</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={targetPageInput}
                  onChange={e => setTargetPageInput(e.target.value)}
                  placeholder={`${currentPage}`}
                  style={{
                    width: '44px',
                    padding: '3px 6px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.8rem',
                    textAlign: 'center',
                    outline: 'none'
                  }}
                />
                <button type="submit" className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '0.78rem' }}>
                  Go ›
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Bar (Per AGENTS.md table rules) */}
      {!isEmployeeRole && selectedRowIds.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#1E293B',
          color: '#FFFFFF',
          borderRadius: '16px',
          padding: '12px 24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          zIndex: 40,
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            {selectedRowIds.length} Claim{selectedRowIds.length > 1 ? 's' : ''} Selected
          </span>

          {canApprove && selectedPendingCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={handleBatchApprove}
                style={{ borderRadius: '8px', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600 }}
                title="Approve selected pending claims and send to Accounts"
              >
                ✓ Approve Selected ({selectedPendingCount})
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleBatchReject}
                style={{ borderRadius: '8px', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600 }}
              >
                ✕ Reject Selected
              </button>
            </div>
          )}

          {canDisburse && selectedApprovedCount > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleBatchMarkPaid}
              style={{ borderRadius: '8px', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: '#0E7490', borderColor: '#0E7490', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              title="Mark selected HR/CEO-approved claims as paid"
            >
              <IndianRupee size={14} /> Mark as Paid ({selectedApprovedCount})
            </button>
          )}

          {canApprove && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleBatchDelete}
              style={{
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                backgroundColor: '#DC2626',
                border: '1px solid #EF4444',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Delete selected claims permanently"
            >
              <Trash2 size={13} /> Delete Selected ({selectedRowIds.length})
            </button>
          )}

          {!isEmployeeRole && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportSelected}
              style={{
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#FFFFFF',
                backgroundColor: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Export selected claims"
            >
              <Download size={14} /> Export Selected
            </button>
          )}

          <button
            type="button"
            onClick={() => setSelectedRowIds([])}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              padding: '2px 4px'
            }}
            title="Deselect all"
          >
            ✕
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. EMPLOYEE SUBMIT EXPENSE CLAIM MODAL                   */}
      {/* ======================================================== */}
      {showModal && (
        <div className="modal-overlay" style={{ zIndex: 20000 }}>
          <div
            className="modal-content"
            style={{
              maxWidth: '640px',
              width: '95%',
              maxHeight: 'calc(100dvh - 24px)',
              borderRadius: '20px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div className="modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                  Submit Expense Claim
                </h2>
                <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                  Provide expense details and attach a valid bill/receipt proof for verification
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setShowModal(false);
                  if (onCloseQuickAdd) onCloseQuickAdd();
                }}
                style={{ 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '8px', 
                  border: '1px solid #E2E8F0', 
                  background: '#ffffff', 
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#64748B'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden' }}>
              <div className="modal-body" style={{ padding: '24px', overflowY: 'auto', minHeight: 0, flex: 1 }}>
                {formError && (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: '#FEF2F2',
                    border: '1px solid #F87171',
                    color: '#B91C1C',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertCircle size={16} />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Employee Claimant (Read-only, no dropdown arrow) */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                    Employee Claimant
                  </label>
                  {isEmployeeRole ? (
                    <input 
                      type="text"
                      className="form-control" 
                      value={(() => {
                        const targetEmpId = currentUser.employeeId || 'EMP-001';
                        const emp = employees.find(e => e.employeeId === targetEmpId) || employees[0];
                        return emp ? `${emp.firstName} ${emp.lastName} (${emp.employeeId} • ${emp.department})` : targetEmpId;
                      })()} 
                      readOnly
                      style={{ 
                        borderRadius: '10px',
                        backgroundColor: '#F8FAFC',
                        color: '#1E293B',
                        fontWeight: 500,
                        cursor: 'default',
                        backgroundImage: 'none',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none'
                      }}
                    />
                  ) : (
                    <select 
                      className="form-control" 
                      value={expForm.employeeId} 
                      onChange={e => setExpForm({ ...expForm, employeeId: e.target.value })}
                      style={{ 
                        borderRadius: '10px',
                        backgroundImage: 'none',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none'
                      }}
                    >
                      {employees.map(e => (
                        <option key={e.id} value={e.employeeId}>
                          {e.firstName} {e.lastName} ({e.employeeId} • {e.department})
                        </option>
                      ))}
                    </select>
                  )}
                  {isEmployeeRole && (
                    <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                      Claim is registered under your official employee profile
                    </span>
                  )}
                </div>

                {/* Category & Amount */}
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                      Category <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <select 
                      className="form-control" 
                      value={expForm.category} 
                      onChange={e => setExpForm({ ...expForm, category: e.target.value as any })}
                      style={{ borderRadius: '10px' }}
                      required
                    >
                      <option value="Travel">Travel (Transport, Cabs, Fuel)</option>
                      <option value="Meals">Meals &amp; Food Expenses</option>
                      <option value="Equipment">Equipment &amp; Tools</option>
                      <option value="Training">Training &amp; Certifications</option>
                      <option value="Utilities">Utilities &amp; Office Supplies</option>
                      <option value="Other">Other Expenses</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.84rem', margin: 0 }}>
                        Amount (₹) <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <span style={{ fontSize: '0.72rem', color: '#0E7490', fontWeight: 700 }}>
                        Max: ₹1,00,000 (1 Lakh)
                      </span>
                    </div>
                    <div style={{ position: 'relative', marginTop: '6px' }}>
                      <IndianRupee size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#0E7490' }} />
                      <input 
                        className="form-control" 
                        type="number" 
                        inputMode="decimal"
                        min="1" 
                        max={MAX_EXPENSE_CLAIM_AMOUNT}
                        step="0.01" 
                        value={expForm.amount} 
                        onChange={e => setExpForm({ ...expForm, amount: Number(e.target.value) })} 
                        style={{ paddingLeft: '34px', borderRadius: '10px', fontWeight: 700, color: '#0F172A' }}
                        required 
                      />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                      Single expense claim limit: ₹1,00,000 (1 Lakh).
                    </div>
                  </div>
                </div>

                {/* Expense Date */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                    Expense Date <span style={{ color: '#EF4444' }}>*</span>
                  </label>
            <DateInput
                    className="form-control"
                    value={expForm.date}
                    max={getTodayKolkata()}
                    onChange={e => setExpForm({ ...expForm, date: e.target.value })}
                    style={{ borderRadius: '10px' }}
                    required
                  />
                </div>

                {/* Description */}
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                    Description / Purpose of Expense <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea 
                    className="form-control" 
                    rows={2} 
                    value={expForm.description} 
                    onChange={e => setExpForm({ ...expForm, description: e.target.value })} 
                    onKeyDown={preventSpaceEnterPropagation}
                    placeholder="Provide context on where and why this expense was incurred (e.g., Client site travel to Coimbatore)..."
                    style={{ borderRadius: '10px' }}
                    required
                  />
                </div>

                {/* ======================================================== */}
                {/* BILL / RECEIPT IMAGE UPLOAD SECTION                     */}
                {/* ======================================================== */}
                <div style={{
                  padding: '16px',
                  borderRadius: '14px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  marginBottom: '10px'
                }}>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ImageIcon size={16} color="#0E7490" />
                      <span>Upload Bill / Receipt Image Proof <span style={{ color: '#EF4444' }}>*</span></span>
                    </label>
                  </div>

                  {/* Hidden Real File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    accept="image/*,.pdf"
                    style={{ display: 'none' }}
                  />

                  {expForm.receiptUrl ? (
                    /* Attached Image Preview Card */
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '12px',
                      borderRadius: '12px',
                      background: '#FFFFFF',
                      border: '1px solid #0E7490',
                      boxShadow: '0 1px 3px rgba(14, 116, 144, 0.08)'
                    }}>
                      <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid #CBD5E1',
                        flexShrink: 0,
                        backgroundColor: '#F1F5F9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img 
                          src={expForm.receiptUrl} 
                          alt="Receipt Thumbnail" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ 
                            fontSize: '0.82rem', 
                            fontWeight: 700, 
                            color: '#0F172A', 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis' 
                          }}>
                            {expForm.fileName || 'Bill_Receipt_Proof.png'}
                          </span>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '9999px',
                            background: '#DCFCE7',
                            color: '#15803D',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}>
                            <Check size={10} /> Verified
                          </span>
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                          {expForm.fileSize || 'Image Document'} • Proof for {formatCurrency(expForm.amount)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '8px' }}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '8px' }}
                          onClick={handleRemoveReceipt}
                          title="Remove image"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Dropzone / Upload Trigger */
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        padding: '24px 16px',
                        border: isDragOver ? '2px dashed #0E7490' : '2px dashed #CBD5E1',
                        borderRadius: '12px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: isDragOver ? '#ECFEFF' : '#FFFFFF',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Upload 
                        size={28} 
                        style={{ margin: '0 auto 8px', color: isDragOver ? '#0E7490' : '#64748B' }} 
                      />
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#1E293B' }}>
                        Click to browse or drag &amp; drop bill receipt image
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '4px' }}>
                        Supports PNG, JPG, JPEG, WEBP, or PDF (Max 8MB)
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0, position: 'sticky', bottom: 0, zIndex: 2 }}>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => {
                    setShowModal(false);
                    if (onCloseQuickAdd) onCloseQuickAdd();
                  }}
                  style={{ borderRadius: '10px', padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingExpense}
                  className="btn btn-primary btn-sm"
                  style={{ 
                    borderRadius: '10px', 
                    padding: '8px 20px', 
                    fontWeight: 700,
                    opacity: isSubmittingExpense ? 0.7 : 1,
                    cursor: isSubmittingExpense ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSubmittingExpense ? 'Submitting Claim...' : 'Submit Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. HR / CEO BILL RECEIPT PROOF VIEWER / LIGHTBOX MODAL   */}
      {/* ======================================================== */}
      {viewingReceiptExpense && (
        <div className="modal-overlay" style={{ zIndex: 20000, backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)' }}>
          <div style={{ 
            width: '94%', 
            maxWidth: '850px', 
            maxHeight: '92dvh', 
            backgroundColor: '#ffffff', 
            borderRadius: '20px', 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)'
          }}>
            {/* Lightbox Header */}
            <div style={{ 
              padding: '16px 24px', 
              borderBottom: '1px solid #E2E8F0', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                    Bill / Receipt Proof Verification
                  </h3>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    background: '#ECFEFF',
                    color: '#0E7490',
                    border: '1px solid #CFFAFE'
                  }}>
                    {viewingReceiptExpense.id}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Submitted by <strong>{viewingReceiptExpense.employeeName}</strong> ({viewingReceiptExpense.department}) on {formatDateDDMMYYYY(viewingReceiptExpense.date)}
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setViewingReceiptExpense(null)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  background: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748B',
                  fontSize: '16px',
                  fontWeight: 700
                }}
              >
                ✕
              </button>
            </div>

            {/* Claim Verification Summary Banner */}
            <div style={{
              padding: '12px 24px',
              backgroundColor: '#ECFEFF',
              borderBottom: '1px solid #CFFAFE',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              minWidth: 0,
              overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                <div style={{ flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', color: '#0E7490', fontWeight: 600, display: 'block' }}>CATEGORY</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B' }}>{viewingReceiptExpense.category}</span>
                </div>
                <div style={{ minWidth: 0, maxWidth: '240px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#0E7490', fontWeight: 600, display: 'block' }}>CLAIMED AMOUNT</span>
                  <span 
                    title={formatCurrency(viewingReceiptExpense.amount)}
                    style={{ 
                      fontSize: '1.05rem', 
                      fontWeight: 800, 
                      color: '#0E7490',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {formatCurrency(viewingReceiptExpense.amount)}
                  </span>
                </div>
                <div style={{ minWidth: 0, flex: 1, maxWidth: '260px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#0E7490', fontWeight: 600, display: 'block' }}>PURPOSE / NOTES</span>
                  <span 
                    title={viewingReceiptExpense.description}
                    style={{ 
                      fontSize: '0.82rem', 
                      color: '#334155',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {viewingReceiptExpense.description}
                  </span>
                </div>
              </div>

              {/* Verification Callout */}
              <div style={{
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #A5F3FC',
                fontSize: '0.75rem',
                color: '#0E7490',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                maxWidth: '100%',
                minWidth: 0,
                overflow: 'hidden',
                flexShrink: 1
              }}>
                <ShieldCheck size={14} style={{ flexShrink: 0 }} />
                <span 
                  title={`Verify claimed ${formatCurrency(viewingReceiptExpense.amount)} matches bill receipt total`}
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  Verify claimed {formatCurrency(viewingReceiptExpense.amount)} matches bill receipt total
                </span>
              </div>
            </div>

            {/* Viewer Controls Toolbar */}
            <div style={{
              padding: '8px 24px',
              backgroundColor: '#1E293B',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.min(3, prev + 0.25))}
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '5px 10px',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Zoom In"
                >
                  <ZoomIn size={14} /> Zoom In
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.max(0.5, prev - 0.25))}
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '5px 10px',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Zoom Out"
                >
                  <ZoomOut size={14} /> Zoom Out
                </button>
                <button
                  type="button"
                  onClick={() => { setZoom(1); setRotation(0); }}
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '5px 10px',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Reset Zoom"
                >
                  <RotateCcw size={14} /> Reset ({Math.round(zoom * 100)}%)
                </button>
                <button
                  type="button"
                  onClick={() => setRotation(prev => (prev + 90) % 360)}
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '5px 10px',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Rotate 90 degrees"
                >
                  <RotateCw size={14} /> Rotate
                </button>
              </div>

              {/* Open in external tab / view raw */}
              {viewingReceiptExpense.receiptUrl && (
                <a
                  href={viewingReceiptExpense.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: '#A5F3FC',
                    fontSize: '0.76rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    textDecoration: 'none'
                  }}
                >
                  <ExternalLink size={13} /> Open Full In New Tab
                </a>
              )}
            </div>

            {/* Interactive Image Canvas Viewport */}
            <div style={{
              flex: 1,
              minHeight: '400px',
              maxHeight: '520px',
              backgroundColor: '#0F172A',
              overflow: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              position: 'relative'
            }}>
              {viewingReceiptExpense.receiptUrl ? (
                <div style={{
                  transition: 'transform 0.15s ease-out',
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  display: 'inline-block'
                }}>
                  <img
                    src={viewingReceiptExpense.receiptUrl}
                    alt="Receipt Proof"
                    style={{
                      maxWidth: '520px',
                      maxHeight: '480px',
                      borderRadius: '8px',
                      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                      display: 'block',
                      backgroundColor: '#ffffff'
                    }}
                  />
                </div>
              ) : (
                <div style={{ color: '#94A3B8', textAlign: 'center' }}>
                  <AlertCircle size={32} style={{ margin: '0 auto 8px' }} />
                  <div>No receipt image is available for this expense claim.</div>
                </div>
              )}
            </div>

            {/* Lightbox Footer: Direct HR/CEO Approval Actions */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              background: '#F8FAFC'
            }}>
              <div style={{ fontSize: '0.8rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                Status: <strong style={{ color: '#0F172A' }}>{viewingReceiptExpense.status}</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {canApprove && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to delete claim ${viewingReceiptExpense.id}?`)) {
                        deleteExpense(viewingReceiptExpense.id);
                        setViewingReceiptExpense(null);
                      }
                    }}
                    style={{ borderRadius: '10px', padding: '8px 14px', fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    title="Delete claim permanently"
                  >
                    <Trash2 size={14} /> Delete Claim
                  </button>
                )}
                {canApprove && (viewingReceiptExpense.status === 'Pending Finance' || viewingReceiptExpense.status === 'Pending Manager') && (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        approveExpense(viewingReceiptExpense.id, currentUser.name, 'Rejected');
                        setViewingReceiptExpense(null);
                      }}
                      style={{ borderRadius: '10px', padding: '8px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}
                    >
                      <XCircle size={15} /> Reject Claim
                    </button>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      onClick={() => {
                        approveExpense(viewingReceiptExpense.id, currentUser.name, 'Approved');
                        setViewingReceiptExpense(null);
                      }}
                      style={{ 
                        borderRadius: '10px', 
                        padding: '8px 18px', 
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap'
                      }}
                      title={`Approve and send to Accounts for payout (${formatCurrency(viewingReceiptExpense.amount)})`}
                    >
                      <CheckCircle2 size={15} style={{ flexShrink: 0 }} /> 
                      <span>Approve &amp; Send to Accounts</span>
                      <span style={{ 
                        maxWidth: '120px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap', 
                        display: 'inline-block' 
                      }}>
                        ({formatCurrency(viewingReceiptExpense.amount)})
                      </span>
                    </button>
                  </>
                )}
                {canDisburse && viewingReceiptExpense.status === 'Approved' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      handleMarkPaid(viewingReceiptExpense.id);
                      setViewingReceiptExpense(null);
                    }}
                    style={{ 
                      borderRadius: '10px', 
                      padding: '8px 18px', 
                      fontWeight: 700, 
                      backgroundColor: '#0E7490', 
                      borderColor: '#0E7490', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px',
                      whiteSpace: 'nowrap'
                    }}
                    title={`Mark as Paid (${formatCurrency(viewingReceiptExpense.amount)})`}
                  >
                    <IndianRupee size={15} style={{ flexShrink: 0 }} /> 
                    <span>Mark as Paid</span>
                    <span style={{ 
                      maxWidth: '120px', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap', 
                      display: 'inline-block' 
                    }}>
                      ({formatCurrency(viewingReceiptExpense.amount)})
                    </span>
                  </button>
                )}
                {(viewingReceiptExpense.status === 'Reimbursed' || viewingReceiptExpense.status === 'Approved') && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDownloadVoucher(viewingReceiptExpense)}
                    style={{
                      borderRadius: '10px',
                      padding: '8px 16px',
                      fontWeight: 700,
                      color: '#0E7490',
                      background: '#ECFEFF',
                      border: '1px solid #A5F3FC',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <Download size={15} /> Download Voucher
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setViewingReceiptExpense(null)}
                  style={{ borderRadius: '10px', padding: '8px 16px', whiteSpace: 'nowrap' }}
                >
                  Close Viewer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
