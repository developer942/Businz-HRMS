import React, { useState, useMemo, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  LoanRecord, 
  LoanRequestStatus, 
  LoanRepaymentInstallment 
} from '../../types/hrms';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { getLocalDateStr } from '../../utils/monthUtils';
import { 
  Banknote, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  UserCheck, 
  ShieldCheck, 
  Calendar, 
  IndianRupee, 
  Calculator,
  FileText, 
  Download, 
  Check, 
  X, 
  ArrowRight,
  TrendingUp,
  CreditCard,
  Receipt,
  Eye,
  Send,
  HelpCircle,
  History,
  SlidersHorizontal,
  Wallet,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { toNum, formatCurrency } from '../../utils/numbers';
import { downloadElementAsPDF, downloadCSV, downloadExcel, downloadPDF, ExportColumn } from '../../utils/exportUtils';
import { ExportDropdown } from '../common/ExportDropdown';
import { StandardTablePagination } from '../common/StandardTablePagination';

interface AdvanceSalaryManagementProps {
  openAddModal?: boolean;
  onCloseQuickAdd?: () => void;
}

export const AdvanceSalaryManagement: React.FC<AdvanceSalaryManagementProps> = ({
  openAddModal = false,
  onCloseQuickAdd
}) => {
  const { 
    currentUser, 
    employees, 
    loanRecords, 
    loanPolicies, 
    activeLoanPolicy, 
    calculateEmployeeLoanEligibility, 
    submitLoanRequest, 
    reviewLoanRequest, 
    disburseLoan, 
    recordManualRepayment 
  } = useHRMS();

  // Role resolution & Permissions
  const isApprovalAuthority = 
    currentUser.role === 'CEO' || 
    currentUser.role === 'Super Admin' || 
    currentUser.role === 'HR Manager' || 
    currentUser.role === 'HR Admin' ||
    (currentUser as any).designation?.toLowerCase().includes('ceo') ||
    (currentUser as any).designation?.toLowerCase().includes('managing director');

  const isAccountsUser = 
    currentUser.role === 'Finance Manager' ||
    (currentUser.department && (currentUser.department.toLowerCase().includes('accounts') || currentUser.department.toLowerCase().includes('finance'))) ||
    (currentUser.designation && (currentUser.designation.toLowerCase().includes('account') || currentUser.designation.toLowerCase().includes('finance')));

  const isEmployeeRole = currentUser.role === 'Employee' && !isAccountsUser && !isApprovalAuthority;
  const isViewingAsEmployee = isEmployeeRole;

  // CEO does not apply for advance salary — hide the request action on the CEO page only
  const isCEOUser =
    currentUser.role === 'CEO' ||
    currentUser.role === 'Super Admin' ||
    (currentUser as any).designation?.toLowerCase().includes('ceo') ||
    (currentUser as any).designation?.toLowerCase().includes('managing director');

  const isHrEmployeeRecord = (employeeId?: string, employeeName?: string) => {
    const nameKey = (employeeName || '').trim().toLowerCase();
    const emp = employees.find(e => {
      const fullName = `${e.firstName} ${e.lastName}`.trim().toLowerCase();
      return Boolean(employeeId && (e.employeeId === employeeId || e.id === employeeId)) || Boolean(nameKey && fullName === nameKey);
    });
    const role = String((emp as any)?.role || '').toLowerCase();
    const dept = String(emp?.department || '').toLowerCase();
    const designation = String(emp?.designation || '').toLowerCase();
    return role.includes('hr') || dept.includes('hr') || dept.includes('human resource') || designation.includes('hr');
  };

  // Target Employee for Personal Advance Salary Application (Strictly own application)
  const targetEmployee = useMemo(() => {
    const found = employees.find(e => 
      (currentUser.employeeId && e.employeeId === currentUser.employeeId) ||
      (currentUser.email && e.email?.toLowerCase().trim() === currentUser.email?.toLowerCase().trim()) ||
      (currentUser.name && `${e.firstName} ${e.lastName}`.trim().toLowerCase() === currentUser.name?.trim().toLowerCase())
    ) || (currentUser.employeeId ? employees.find(e => e.employeeId === currentUser.employeeId) : null) || employees[0];

    if (found) return found;

    return {
      id: currentUser.employeeId || 'EMP-001',
      employeeId: currentUser.employeeId || 'EMP-001',
      firstName: currentUser.name?.split(' ')[0] || 'Admin',
      lastName: currentUser.name?.split(' ').slice(1).join(' ') || 'User',
      email: currentUser.email || 'admin@businz.com',
      department: currentUser.department || 'Management',
      designation: currentUser.designation || currentUser.role || 'Staff',
      basicSalary: 30000,
      joiningDate: '2023-01-01',
      role: currentUser.role || 'Employee'
    } as any;
  }, [employees, currentUser]);

  const targetEmployeeId = targetEmployee?.employeeId || currentUser.employeeId || employees[0]?.employeeId || '';

  // Employee Self-Service Eligibility
  const employeeEligibility = useMemo(() => {
    return calculateEmployeeLoanEligibility(targetEmployee?.employeeId || targetEmployeeId);
  }, [targetEmployee, targetEmployeeId, calculateEmployeeLoanEligibility, activeLoanPolicy, loanRecords]);

  // Employee's own loans
  const myLoans = useMemo(() => {
    const validId = targetEmployee?.employeeId || targetEmployeeId;
    return loanRecords.filter(r => r.employeeId === validId || r.employeeId === targetEmployeeId || (currentUser.email && r.employeeId === currentUser.email));
  }, [loanRecords, targetEmployeeId, targetEmployee, currentUser.email]);

  const myActiveLoans = useMemo(() => {
    return myLoans.filter(r => (r.status === 'Active' || r.status === 'Disbursed') && toNum(r.outstandingBalance) > 0);
  }, [myLoans]);

  const myTotalActiveAmount = myActiveLoans.reduce((sum, r) => sum + toNum(r.disbursedAmount || r.approvedAmount || r.requestedAmount), 0);
  const myTotalOutstanding = myActiveLoans.reduce((sum, r) => sum + toNum(r.outstandingBalance), 0);
  const myTotalMonthlyEMI = myActiveLoans.reduce((sum, r) => sum + toNum(r.monthlyDeduction), 0);

  // Admin Tab & Filter State
  type AdminTab = 'pending' | 'approved' | 'active' | 'rejected' | 'closed' | 'all';
  const [adminTab, setAdminTab] = useState<AdminTab>(isAccountsUser && !isApprovalAuthority ? 'approved' : 'pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  // Standard Pagination State (Strictly [5, 10] per design guidelines)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);


  // Reset page when filters or tab change
  useEffect(() => {
    setCurrentPage(1);
  }, [adminTab, departmentFilter, typeFilter, searchQuery]);


  // Modals & Drawers
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<LoanRecord | null>(null);
  const [reviewModalRecord, setReviewModalRecord] = useState<LoanRecord | null>(null);
  const [isReviewFullScreen, setIsReviewFullScreen] = useState(true);
  const [disbursementModalRecord, setDisbursementModalRecord] = useState<LoanRecord | null>(null);
  const [manualRepaymentModalRecord, setManualRepaymentModalRecord] = useState<LoanRecord | null>(null);
  const [scheduleModalRecord, setScheduleModalRecord] = useState<LoanRecord | null>(null);

  const getLocalDateString = (offsetDays: number = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getFutureRequestDateString = () => getLocalDateString(1);

  // Sync quick add modal trigger from header
  useEffect(() => {
    if (openAddModal && !isCEOUser) {
      openRequestModal();
    }
  }, [openAddModal]);

  // Request Form State
  const [requestFormData, setRequestFormData] = useState<{
    requestType: 'Advance Salary' | 'Employee Loan';
    requestedAmount: number;
    installmentMonths: number;
    purpose: string;
    reasonDetails: string;
    neededByDate: string;
  }>({
    requestType: 'Advance Salary',
    requestedAmount: 30000,
    installmentMonths: 3,
    purpose: 'Emergency Medical & Personal Expense',
    reasonDetails: '',
    neededByDate: getFutureRequestDateString()
  });

  const normalizeRepaymentMonthsInput = (value: string, maxMonths: number, minMonths: number = 1): number => {
    const digitsOnly = value.replace(/\D/g, '');
    if (!digitsOnly) return 0;
    const withoutLeadingZeros = digitsOnly.replace(/^0+/, '') || '0';
    const parsed = Number(withoutLeadingZeros);
    if (!Number.isFinite(parsed)) return minMonths;
    const safeMax = Math.max(maxMonths || 12, minMonths);
    return Math.min(Math.max(parsed, 0), safeMax);
  };

  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const upcomingPayrollCycles = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() + idx, 1);
      const val = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      const full = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      return { val, label: `${full} Cycle` };
    });
  }, []);

  // Review Form State
  const [reviewFormData, setReviewFormData] = useState<{
    action: 'Approve' | 'Reject';
    approvedAmount: number;
    approvedMonths: number;
    monthlyDeduction: number;
    deductionStartMonth: string;
    internalHrNotes: string;
    employeeVisibleNotes: string;
    rejectionReason: string;
  }>({
    action: 'Approve',
    approvedAmount: 0,
    approvedMonths: 0,
    monthlyDeduction: 0,
    deductionStartMonth: 'Nov 2026',
    internalHrNotes: '',
    employeeVisibleNotes: '',
    rejectionReason: 'Request exceeds allowable repayment ratio or eligibility guidelines.'
  });

  // Disbursement Form State
  const [disbursementFormData, setDisbursementFormData] = useState<{
    disbursedDate: string;
    disbursedAmount: number;
    paymentMode: 'NEFT' | 'IMPS' | 'Cheque' | 'Cash';
    transactionRef: string;
    notes: string;
  }>({
    disbursedDate: getTodayDateString(),
    disbursedAmount: 0,
    paymentMode: 'NEFT',
    transactionRef: '',
    notes: 'Disbursed to primary salary account.'
  });

  // Manual Repayment Form State
  const [manualRepaymentFormData, setManualRepaymentFormData] = useState<{
    amount: number;
    repaymentDate: string;
    paymentMode: 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI' | 'NEFT' | 'Other';
    referenceNumber: string;
    notes: string;
  }>({
    amount: 10000,
    repaymentDate: getLocalDateStr(),
    paymentMode: 'Bank Transfer',
    referenceNumber: '',
    notes: 'Direct voluntary repayment received.'
  });

  // Toast / Feedback State
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedbackBanner({ type, message });
    setTimeout(() => setFeedbackBanner(null), 5000);
  };

  // Filtered Records for Admin Table
  const filteredRecords = useMemo(() => {
    return loanRecords.filter(record => {
      // Tab filter
      if (adminTab === 'pending' && record.status !== 'Pending') return false;
      if (adminTab === 'approved' && record.status !== 'Approved') return false;
      if (adminTab === 'active' && record.status !== 'Active' && record.status !== 'Disbursed') return false;
      if (adminTab === 'rejected' && record.status !== 'Rejected') return false;
      if (adminTab === 'closed' && record.status !== 'Closed') return false;

      // Department filter
      if (departmentFilter !== 'ALL' && record.department !== departmentFilter) return false;

      // Type filter
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'Advance Salary') {
          if (record.requestType !== 'Advance Salary' && (record.requestType as string) !== 'Salary Advance') return false;
        } else if (record.requestType !== typeFilter) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = record.employeeName.toLowerCase().includes(q);
        const matchesId = record.employeeId.toLowerCase().includes(q);
        const matchesReqId = record.id.toLowerCase().includes(q);
        const matchesPurpose = record.purpose.toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesReqId && !matchesPurpose) return false;
      }

      return true;
    });
  }, [loanRecords, adminTab, departmentFilter, typeFilter, searchQuery]);

  // Admin KPI metrics
  const adminKPIs = useMemo(() => {
    const totalPending = loanRecords.filter(r => r.status === 'Pending').length;
    const activeList = loanRecords.filter(r => (r.status === 'Active' || r.status === 'Disbursed') && toNum(r.outstandingBalance) > 0);
    const totalActiveCount = activeList.length;
    const totalOutstanding = activeList.reduce((sum, r) => sum + toNum(r.outstandingBalance), 0);
    const thisMonthDeductions = activeList.reduce((sum, r) => sum + toNum(r.monthlyDeduction), 0);
    const closedCount = loanRecords.filter(r => r.status === 'Closed').length;

    return {
      totalPending,
      totalActiveCount,
      totalOutstanding,
      thisMonthDeductions,
      closedCount
    };
  }, [loanRecords]);

  // Display all filtered records directly
  const paginatedRecords = filteredRecords;

  // Export Handlers (Excel, PDF, CSV)
  const getAdvanceExportData = () => {
    const columns = [
      { key: 'id', label: 'Ref ID' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'employeeName', label: 'Employee Name' },
      { key: 'department', label: 'Department' },
      { key: 'requestType', label: 'Type' },
      { key: 'requestedAmount', label: 'Requested (₹)' },
      { key: 'approvedAmount', label: 'Approved (₹)' },
      { key: 'approvedMonths', label: 'Tenure (Mos)' },
      { key: 'monthlyDeduction', label: 'Monthly EMI (₹)' },
      { key: 'outstandingBalance', label: 'Outstanding (₹)' },
      { key: 'status', label: 'Status' },
      { key: 'requestedDate', label: 'Requested Date' }
    ];
    const data = filteredRecords.map(r => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      department: r.department,
      requestType: r.requestType,
      requestedAmount: r.requestedAmount,
      approvedAmount: r.approvedAmount || 0,
      approvedMonths: r.approvedMonths || r.installmentMonths,
      monthlyDeduction: r.monthlyDeduction,
      outstandingBalance: r.outstandingBalance,
      status: r.status,
      requestedDate: formatDateDDMMYYYY(r.requestedDate)
    }));
    return { columns, data };
  };

  const handleExportCSV = () => {
    const { columns, data } = getAdvanceExportData();
    downloadCSV(data, `Loan_Advance_Records_${new Date().toISOString().slice(0, 10)}`, columns);
  };

  const handleExportExcel = () => {
    const { columns, data } = getAdvanceExportData();
    downloadExcel(data, `Loan_Advance_Records_${new Date().toISOString().slice(0, 10)}`, columns);
  };

  const handleExportPDF = () => {
    const { columns, data } = getAdvanceExportData();
    downloadPDF(data, 'Advance Salary Register', `Advance_Salary_Records_${new Date().toISOString().slice(0, 10)}`, columns);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowIds(paginatedRecords.map(r => r.id));
    } else {
      setSelectedRowIds([]);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedRowIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Open Request Modal (Strictly for applicant's own advance salary)
  const openRequestModal = () => {
    const empId = targetEmployee?.employeeId || currentUser?.employeeId || 'EMP-001';
    const elig = calculateEmployeeLoanEligibility(empId);
    const maxAmt = elig.maxEligibleAmount || 50000;
    const requestDate = getFutureRequestDateString();
    const initialAmt = Math.min(20000, maxAmt);
    setRequestFormData({
      requestType: 'Advance Salary',
      requestedAmount: initialAmt,
      // Advance Salary is recovered in full from the next month's salary (single installment)
      installmentMonths: 1,
      purpose: 'Emergency Medical & Personal Expense',
      reasonDetails: '',
      neededByDate: requestDate
    });
    setIsRequestModalOpen(true);
  };

  // Submit Loan Request Handler (Strictly for applicant's own advance salary)
  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const elig = calculateEmployeeLoanEligibility(targetEmployee.employeeId);

    if (!elig.isEligible) {
      showFeedback('error', elig.ineligibleReason || 'You are not eligible to apply for advance salary.');
      return;
    }

    const requestedAmount = toNum(requestFormData.requestedAmount);

    if (requestedAmount <= 0) {
      showFeedback('error', 'Please enter a valid requested amount greater than zero.');
      return;
    }

    if (requestedAmount > elig.maxEligibleAmount) {
      showFeedback('error', `Requested amount exceeds maximum eligible limit of ${formatCurrency(elig.maxEligibleAmount)}.`);
      return;
    }

    const isAdvanceSalary = requestFormData.requestType === 'Advance Salary';
    const minMonths = elig.policy?.minRepaymentMonths ?? 1;
    const maxMonths = elig.policy?.maxRepaymentMonths ?? 12;

    // Advance Salary has no repayment period: it is fully deducted from next month's salary.
    const effectiveMonths = isAdvanceSalary ? 1 : requestFormData.installmentMonths;

    if (
      !isAdvanceSalary && (
        !effectiveMonths ||
        effectiveMonths < minMonths ||
        effectiveMonths > maxMonths
      )
    ) {
      showFeedback('error', `Repayment period must be between ${minMonths} and ${maxMonths} months.`);
      return;
    }

    const minNeededByDate = getFutureRequestDateString();
    if (!requestFormData.neededByDate || requestFormData.neededByDate < minNeededByDate) {
      showFeedback('error', `Funds needed by date must be a future date (${formatDateDDMMYYYY(minNeededByDate)} onwards). Past dates (yesterday, previous months) cannot be requested.`);
      return;
    }

    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const defaultDeductionMonth = nextMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' });

    const res = submitLoanRequest({
      employeeId: targetEmployee.employeeId,
      employeeName: `${targetEmployee.firstName} ${targetEmployee.lastName}`,
      department: targetEmployee.department,
      designation: targetEmployee.designation,
      policyId: elig.policy.id,
      policyName: elig.policy.policyName,
      requestType: requestFormData.requestType,
      basicSalary: toNum(targetEmployee.basicSalary),
      eligibleLimitAmount: elig.maxEligibleAmount,
      requestedAmount,
      installmentMonths: effectiveMonths,
      monthlyDeduction: isAdvanceSalary ? requestedAmount : Math.round(requestedAmount / (effectiveMonths || 1)),
      deductionStartMonth: defaultDeductionMonth,
      purpose: requestFormData.purpose,
      reasonDetails: requestFormData.reasonDetails,
      neededByDate: requestFormData.neededByDate
    });

    if (res.success) {
      showFeedback('success', isAdvanceSalary
        ? `Advance Salary request submitted (Ref: ${res.loanId}). ${formatCurrency(requestedAmount)} will be auto-deducted from your ${defaultDeductionMonth} salary.`
        : `Employee Loan request submitted successfully (Ref: ${res.loanId})!`);
      setIsRequestModalOpen(false);
      if (onCloseQuickAdd) onCloseQuickAdd();
    } else {
      showFeedback('error', res.message);
    }
  };

  // Advance Salary = single full recovery from next month's salary
  const isAdvanceType = (t?: string) => t === 'Advance Salary' || t === 'Salary Advance';

  // Open Review Modal
  const openReviewModal = (record: LoanRecord) => {
    setReviewModalRecord(record);
    const amt = record.approvedAmount || record.requestedAmount;
    const isAdvance = record.requestType === 'Advance Salary' || (record.requestType as string) === 'Salary Advance';
    const months = isAdvance ? 1 : (record.approvedMonths || record.installmentMonths);
    const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    const defaultDeductionMonth = nextMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    setReviewFormData({
      action: 'Approve',
      approvedAmount: amt,
      approvedMonths: months,
      monthlyDeduction: isAdvance ? amt : (record.monthlyDeduction || Math.round(amt / months)),
      deductionStartMonth: record.deductionStartMonth || defaultDeductionMonth,
      internalHrNotes: record.internalHrNotes || '',
      employeeVisibleNotes: record.employeeVisibleNotes || '',
      rejectionReason: record.rejectionReason || 'Request does not meet current organizational loan criteria.'
    });
  };

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModalRecord) return;
    // Approval / rejection is strictly HR & CEO only (Accounts only disburse)
    if (!isApprovalAuthority) {
      showFeedback('error', 'Only HR or CEO can approve or reject advance salary requests.');
      return;
    }
    if (!isCEOUser && isHrEmployeeRecord(reviewModalRecord.employeeId, reviewModalRecord.employeeName)) {
      showFeedback('error', 'HR staff advance salary requests can be approved or rejected only by CEO.');
      return;
    }

    reviewLoanRequest(reviewModalRecord.id, {
      action: reviewFormData.action,
      approvedAmount: reviewFormData.action === 'Approve' ? reviewFormData.approvedAmount : undefined,
      approvedMonths: reviewFormData.action === 'Approve' ? reviewFormData.approvedMonths : undefined,
      monthlyDeduction: reviewFormData.action === 'Approve' ? reviewFormData.monthlyDeduction : undefined,
      deductionStartMonth: reviewFormData.action === 'Approve' ? reviewFormData.deductionStartMonth : undefined,
      internalHrNotes: reviewFormData.internalHrNotes,
      employeeVisibleNotes: reviewFormData.employeeVisibleNotes,
      rejectionReason: reviewFormData.action === 'Reject' ? reviewFormData.rejectionReason : undefined
    });

    showFeedback('success', `Request ${reviewModalRecord.id} successfully ${reviewFormData.action === 'Approve' ? 'Approved' : 'Rejected'}!`);
    setReviewModalRecord(null);
  };

  // Open Disbursement Modal
  const openDisbursementModal = (record: LoanRecord) => {
    setDisbursementModalRecord(record);
    setDisbursementFormData({
      disbursedDate: getTodayDateString(),
      disbursedAmount: record.approvedAmount || record.requestedAmount,
      paymentMode: 'NEFT',
      transactionRef: `NEFT-VRM-${Math.floor(10000000 + Math.random() * 90000000)}`,
      notes: 'Disbursed via bank transfer to employee salary account.'
    });
  };

  const handleDisbursementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disbursementModalRecord) return;
    // Money hand-over is done strictly by the Accounts team after HR/CEO approval
    if (!isAccountsUser) {
      showFeedback('error', 'Only the Accounts team can disburse approved advance salary amounts.');
      return;
    }

    disburseLoan(disbursementModalRecord.id, {
      disbursedDate: disbursementFormData.disbursedDate,
      disbursedAmount: disbursementFormData.disbursedAmount,
      paymentMode: disbursementFormData.paymentMode,
      transactionRef: disbursementFormData.transactionRef,
      notes: disbursementFormData.notes
    });

    showFeedback('success', `Loan ${disbursementModalRecord.id} disbursed successfully! Monthly deductions will commence as scheduled.`);
    setDisbursementModalRecord(null);
  };

  // Open Manual Repayment Modal
  const openManualRepaymentModal = (record: LoanRecord) => {
    setManualRepaymentModalRecord(record);
    setManualRepaymentFormData({
      amount: Math.min(record.monthlyDeduction || 10000, record.outstandingBalance),
      repaymentDate: getLocalDateStr(),
      paymentMode: 'Bank Transfer',
      referenceNumber: `TRX-${Date.now().toString().slice(-6)}`,
      notes: 'Direct repayment received.'
    });
  };

  const handleManualRepaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualRepaymentModalRecord) return;

    recordManualRepayment(manualRepaymentModalRecord.id, {
      amount: Number(manualRepaymentFormData.amount),
      repaymentDate: manualRepaymentFormData.repaymentDate,
      paymentMode: manualRepaymentFormData.paymentMode,
      referenceNumber: manualRepaymentFormData.referenceNumber,
      notes: manualRepaymentFormData.notes
    });

    showFeedback('success', `Manual repayment of ${formatCurrency(manualRepaymentFormData.amount)} recorded successfully!`);
    setManualRepaymentModalRecord(null);
  };

  // Status Badge Formatter
  const renderStatusBadge = (status: LoanRequestStatus) => {
    switch (status) {
      case 'Pending':
      case 'Under Review':
        return (
          <span className="status-pill pending" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} /> {status}
          </span>
        );
      case 'Approved':
        return (
          <span className="status-pill" style={{ backgroundColor: '#CFFAFE', color: '#0891B2', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={12} /> Approved (Pending Disb.)
          </span>
        );
      case 'Active':
      case 'Disbursed':
        return (
          <span className="status-pill approved" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={12} /> Active / Repaying
          </span>
        );
      case 'Closed':
        return (
          <span className="status-pill" style={{ backgroundColor: '#F1F5F9', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Receipt size={12} /> Closed (₹0.00 Bal)
          </span>
        );
      case 'Rejected':
        return (
          <span className="status-pill rejected" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <XCircle size={12} /> Rejected
          </span>
        );
      default:
        return <span className="status-pill pending">{status}</span>;
    }
  };

  const handleDownloadVoucher = (record: LoanRecord) => {
    const columns: ExportColumn[] = [
      { label: 'Parameter', key: 'field' },
      { label: 'Details', key: 'value' }
    ];
    const approvedDate = record.ceoApproval?.approvedAt || record.hrApproval?.approvedAt || record.requestedDate;
    const approver = record.ceoApproval?.approvedBy || record.hrApproval?.approvedBy || 'HR & CEO Executive Approval';
    const data = [
      { field: 'Voucher Reference', value: `ADV-VCHR-${record.id}` },
      { field: 'Sanction / Application Date', value: formatDateDDMMYYYY(approvedDate) },
      { field: 'Employee Code', value: record.employeeId },
      { field: 'Employee Name', value: record.employeeName },
      { field: 'Department', value: record.department },
      { field: 'Designation', value: record.designation },
      { field: 'Advance Request Type', value: record.requestType },
      { field: 'Sanctioned Advance Amount', value: formatCurrency(record.approvedAmount || record.requestedAmount) },
      { field: 'Repayment Tenure', value: `${record.approvedMonths || record.installmentMonths} Months` },
      { field: 'Monthly EMI Recovery', value: formatCurrency(record.monthlyDeduction) },
      { field: 'Current Status', value: record.status },
      { field: 'Approval Authority', value: approver },
      { field: 'Notes / Purpose', value: record.internalHrNotes || record.purpose || 'Approved for advance salary disbursement' }
    ];
    downloadPDF(data, `Advance Salary Payout Voucher - ${record.employeeName}`, `Advance_Voucher_${record.employeeId}_${record.id}`, columns);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '60px' }}>
      {/* Toast Banner */}
      {feedbackBanner && (
        <div style={{
          position: 'fixed',
          top: '84px',
          right: '24px',
          zIndex: 9999,
          padding: '14px 20px',
          borderRadius: '12px',
          backgroundColor: feedbackBanner.type === 'success' ? '#ECFDF5' : '#FEF2F2',
          border: `1px solid ${feedbackBanner.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
          color: feedbackBanner.type === 'success' ? '#065F46' : '#991B1B',
          boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.85rem',
          fontWeight: 700
        }}>
          {feedbackBanner.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedbackBanner.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', marginBottom: '24px' }}>
        <div className="page-title-group" style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>
            {isViewingAsEmployee ? 'My Advance Salary' : 'Advance Salary Management'}
          </h1>
          <p className="page-subtitle" style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0', lineHeight: 1.45 }}>
            {isViewingAsEmployee 
              ? 'Check personal advance salary limits, submit requests, view ongoing EMI deductions, and track remaining advance balances.'
              : 'End-to-end administration for employee advance salaries, eligibility evaluations, multi-stage approvals, disbursements, and automated payroll recoveries.'}
          </p>
        </div>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginTop: '2px' }}>
          {/* Export Report Dropdown (Excel, PDF, CSV) */}
          {!isViewingAsEmployee && (
            <ExportDropdown 
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
              onExportCSV={handleExportCSV}
            />
          )}

          {/* Create / Request Advance Salary Button (hidden for CEO) */}
          {!isCEOUser && (
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={openRequestModal}
            title="Apply for Advance Salary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '12px',
              padding: '9px 18px',
              fontWeight: 700,
              fontSize: '0.84rem',
              backgroundColor: '#0E7490',
              borderColor: '#0E7490',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(14, 116, 144, 0.2)',
              transition: 'all 0.15s ease'
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Request Advance Salary</span>
          </button>
          )}
        </div>
      </div>

      {/* ========================================================
          1. EMPLOYEE SELF-SERVICE VIEW
          ======================================================== */}
      {isViewingAsEmployee ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Employee KPI Cards */}
          <div className="kpi-grid compact" style={{ gap: '10px', marginBottom: '8px' }}>
            <div className="kpi-card compact" style={{ padding: '8px 12px', borderRadius: '10px' }}>
              <div className="kpi-card-header" style={{ marginBottom: '3px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748B' }}>
                  Maximum Eligible Limit
                </span>
                <div className="kpi-icon-wrapper teal"><Calculator size={15} /></div>
              </div>
              <div className="kpi-card-body" style={{ marginTop: '2px' }}>
                <div className="kpi-value" style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.15 }}>
                  {formatCurrency(employeeEligibility.maxEligibleAmount)}
                </div>
                <div className="kpi-caption" style={{ fontSize: '0.68rem', color: '#0E7490', fontWeight: 600, marginTop: '2px' }}>
                  Based on: {employeeEligibility.policy?.maxLoanLimitType === 'SALARY_MULTIPLIER' ? `${employeeEligibility.policy?.maxLoanLimitValue}× Monthly Salary` : 'Salary Formula'}
                </div>
              </div>
            </div>

            <div className="kpi-card compact" style={{ padding: '8px 12px', borderRadius: '10px' }}>
              <div className="kpi-card-header" style={{ marginBottom: '3px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748B' }}>
                  Active Loan Sanctioned
                </span>
                <div className="kpi-icon-wrapper blue"><Banknote size={15} /></div>
              </div>
              <div className="kpi-card-body" style={{ marginTop: '2px' }}>
                <div className="kpi-value" style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.15 }}>
                  {myTotalActiveAmount > 0 ? formatCurrency(myTotalActiveAmount) : 'No Active Loan'}
                </div>
                <div className="kpi-caption" style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                  {myActiveLoans.length} active account{myActiveLoans.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            <div className="kpi-card compact" style={{ padding: '8px 12px', borderRadius: '10px' }}>
              <div className="kpi-card-header" style={{ marginBottom: '3px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748B' }}>
                  Outstanding Balance
                </span>
                <div className="kpi-icon-wrapper amber"><Receipt size={15} /></div>
              </div>
              <div className="kpi-card-body" style={{ marginTop: '2px' }}>
                <div className="kpi-value" style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.15, color: myTotalOutstanding > 0 ? '#B45309' : '#166534' }}>
                  {formatCurrency(myTotalOutstanding)}
                </div>
                <div className="kpi-caption" style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                  Remaining recoverable amount
                </div>
              </div>
            </div>

            <div className="kpi-card compact" style={{ padding: '8px 12px', borderRadius: '10px' }}>
              <div className="kpi-card-header" style={{ marginBottom: '3px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748B' }}>
                  Monthly Deduction (EMI)
                </span>
                <div className="kpi-icon-wrapper purple"><CreditCard size={15} /></div>
              </div>
              <div className="kpi-card-body" style={{ marginTop: '2px' }}>
                <div className="kpi-value" style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.15 }}>
                  {formatCurrency(myTotalMonthlyEMI)}
                </div>
                <div className="kpi-caption" style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                  Next payroll deduction: 31st Oct 2026
                </div>
              </div>
            </div>
          </div>

          {/* Employee Loan Applications & Active Records Table */}
          <div className="card" style={{ borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                  My Advance Salary Accounts
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                  Complete transparent statement of your requested amounts, approved terms, monthly deductions, and settlement status.
                </p>
              </div>
            </div>

            <div className="table-responsive">
              <table className="hrms-table">
                <thead>
                  <tr>
                    <th>Ref ID</th>
                    <th>Request Date</th>
                    <th>Loan Type</th>
                    <th>Requested Amt</th>
                    <th>Approved Amt</th>
                    <th>Tenure</th>
                    <th>Monthly EMI</th>
                    <th>Outstanding</th>
                    <th>Status</th>
                    <th>Schedule</th>
                  </tr>
                </thead>
                <tbody>
                  {myLoans.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
                        <Wallet size={36} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>No Advance Salary Requests Found</div>
                        <p style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>Click "Request Advance Salary" above to submit a new application.</p>
                      </td>
                    </tr>
                  ) : (
                    myLoans.map(loan => (
                      <tr key={loan.id}>
                        <td><strong style={{ color: '#0E7490' }}>{loan.id}</strong></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(loan.requestedDate)}</td>
                        <td><span style={{ fontWeight: 600 }}>{loan.requestType}</span></td>
                        <td>{formatCurrency(loan.requestedAmount)}</td>
                        <td>
                          {loan.approvedAmount ? (
                            <strong style={{ color: '#166534' }}>{formatCurrency(loan.approvedAmount)}</strong>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>Pending</span>
                          )}
                        </td>
                        <td>{loan.approvedMonths || loan.installmentMonths} Mos</td>
                        <td>
                          <strong style={{ color: '#0E7490' }}>
                            {formatCurrency(loan.monthlyDeduction)}
                          </strong>
                        </td>
                        <td>
                          <span style={{ 
                            fontWeight: 800, 
                            color: loan.outstandingBalance > 0 ? '#B45309' : '#166534' 
                          }}>
                            {formatCurrency(loan.outstandingBalance)}
                          </span>
                        </td>
                        <td>{renderStatusBadge(loan.status)}</td>
                        <td>
                          <button 
                            type="button" 
                            className="btn btn-secondary btn-sm"
                            onClick={() => setScheduleModalRecord(loan)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', fontSize: '0.74rem' }}
                          >
                            <Calendar size={13} /> View Schedule
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================
           2. HR & CEO ADMIN MANAGEMENT VIEW
           ======================================================== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Admin KPI Cards (Interactive & Active Highlight) */}
          <div className="kpi-grid compact" style={{ gap: '10px', marginBottom: '8px' }}>
            <div 
              className="kpi-card compact" 
              onClick={() => setAdminTab('pending')} 
              style={{ 
                cursor: 'pointer',
                border: adminTab === 'pending' ? '2px solid #0E7490' : '1px solid #E2E8F0',
                backgroundColor: adminTab === 'pending' ? '#FAFEFF' : '#FFFFFF',
                boxShadow: adminTab === 'pending' ? '0 3px 10px rgba(14, 116, 144, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
                padding: '8px 12px',
                borderRadius: '10px',
                transition: 'all 0.15s ease'
              }}
            >
              <div className="kpi-card-header" style={{ marginBottom: '3px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748B' }}>
                  Pending HR/CEO Reviews
                </span>
                <div className="kpi-icon-wrapper amber"><Clock size={15} /></div>
              </div>
              <div className="kpi-card-body" style={{ marginTop: '2px' }}>
                <div className="kpi-value" style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.15, color: adminKPIs.totalPending > 0 ? '#B45309' : 'inherit' }}>
                  {adminKPIs.totalPending}
                </div>
                <div className="kpi-caption" style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                  Awaiting review & sanction
                </div>
              </div>
            </div>

            <div 
              className="kpi-card compact" 
              onClick={() => setAdminTab('active')} 
              style={{ 
                cursor: 'pointer',
                border: adminTab === 'active' ? '2px solid #0E7490' : '1px solid #E2E8F0',
                backgroundColor: adminTab === 'active' ? '#FAFEFF' : '#FFFFFF',
                boxShadow: adminTab === 'active' ? '0 3px 10px rgba(14, 116, 144, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
                padding: '8px 12px',
                borderRadius: '10px',
                transition: 'all 0.15s ease'
              }}
            >
              <div className="kpi-card-header" style={{ marginBottom: '3px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748B' }}>
                  Active Loan Accounts
                </span>
                <div className="kpi-icon-wrapper teal"><CheckCircle2 size={15} /></div>
              </div>
              <div className="kpi-card-body" style={{ marginTop: '2px' }}>
                <div className="kpi-value" style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.15 }}>
                  {adminKPIs.totalActiveCount}
                </div>
                <div className="kpi-caption" style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                  Under automated salary deduction
                </div>
              </div>
            </div>

            <div 
              className="kpi-card compact" 
              onClick={() => setAdminTab('all')} 
              style={{ 
                cursor: 'pointer',
                border: adminTab === 'all' ? '2px solid #0E7490' : '1px solid #E2E8F0',
                backgroundColor: adminTab === 'all' ? '#FAFEFF' : '#FFFFFF',
                boxShadow: adminTab === 'all' ? '0 3px 10px rgba(14, 116, 144, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
                padding: '8px 12px',
                borderRadius: '10px',
                transition: 'all 0.15s ease'
              }}
            >
              <div className="kpi-card-header" style={{ marginBottom: '3px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748B' }}>
                  Total Outstanding Balance
                </span>
                <div className="kpi-icon-wrapper blue"><Receipt size={15} /></div>
              </div>
              <div className="kpi-card-body" style={{ marginTop: '2px' }}>
                <div className="kpi-value" style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.15 }}>
                  {formatCurrency(adminKPIs.totalOutstanding)}
                </div>
                <div className="kpi-caption" style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                  Total recoverable company asset
                </div>
              </div>
            </div>

            <div 
              className="kpi-card compact"
              style={{ 
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}
            >
              <div className="kpi-card-header" style={{ marginBottom: '3px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748B' }}>
                  Monthly Payroll Deduction Run
                </span>
                <div className="kpi-icon-wrapper emerald"><CreditCard size={15} /></div>
              </div>
              <div className="kpi-card-body" style={{ marginTop: '2px' }}>
                <div className="kpi-value" style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.15 }}>
                  {formatCurrency(adminKPIs.thisMonthDeductions)}
                </div>
                <div className="kpi-caption" style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                  Scheduled payroll deductions
                </div>
              </div>
            </div>
          </div>

          {/* Status Segmented Tabs + Clean Filter Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* 1. Status Navigation Tabs (Pills) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '2px',
              scrollbarWidth: 'none'
            }}>
              {[
                { id: 'pending' as AdminTab, label: 'Pending Reviews', count: adminKPIs.totalPending, icon: Clock },
                { id: 'approved' as AdminTab, label: 'Approved (Ready to Disburse)', count: loanRecords.filter(r => r.status === 'Approved').length, icon: CheckCircle2 },
                { id: 'active' as AdminTab, label: 'Active Loans', count: adminKPIs.totalActiveCount, icon: Banknote },
                { id: 'closed' as AdminTab, label: 'Closed / Repaid', count: adminKPIs.closedCount, icon: Receipt },
                { id: 'rejected' as AdminTab, label: 'Rejected', count: loanRecords.filter(r => r.status === 'Rejected').length, icon: XCircle },
                { id: 'all' as AdminTab, label: 'All Records', count: loanRecords.length, icon: SlidersHorizontal }
              ].map(tab => {
                const isActive = adminTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAdminTab(tab.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      borderRadius: '12px',
                      border: isActive ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                      backgroundColor: isActive ? '#0E7490' : '#FFFFFF',
                      color: isActive ? '#FFFFFF' : '#475569',
                      fontWeight: isActive ? 750 : 600,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? '0 3px 10px rgba(14, 116, 144, 0.2)' : '0 1px 2px rgba(0,0,0,0.02)'
                    }}
                  >
                    <Icon size={15} color={isActive ? '#FFFFFF' : (tab.id === 'pending' && tab.count > 0 ? '#D97706' : '#64748B')} />
                    <span>{tab.label}</span>
                    <span style={{
                      padding: '1px 7px',
                      borderRadius: '9999px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      backgroundColor: isActive 
                        ? 'rgba(255, 255, 255, 0.25)' 
                        : (tab.id === 'pending' && tab.count > 0 ? '#FEF3C7' : '#F1F5F9'),
                      color: isActive 
                        ? '#FFFFFF' 
                        : (tab.id === 'pending' && tab.count > 0 ? '#B45309' : '#475569')
                    }}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 2. Unified Single-Row Filter Toolbar */}
            <div className="card" style={{
              padding: '12px 18px',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              {/* Left group: Search + Department + Loan Type + Clear */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto', flexWrap: 'wrap' }}>
                {/* Search Bar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '7px 12px',
                  minWidth: '240px',
                  flex: '1 1 260px'
                }}>
                  <Search size={15} color="#94A3B8" style={{ flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="Search employee, ID, purpose..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: '0.82rem',
                      color: '#1E293B',
                      width: '100%'
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94A3B8' }}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Department Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <select
                    value={departmentFilter}
                    onChange={e => setDepartmentFilter(e.target.value)}
                    style={{
                      height: '38px',
                      padding: '0 12px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: departmentFilter !== 'ALL' ? '#0E7490' : '#475569',
                      backgroundColor: departmentFilter !== 'ALL' ? '#ECFEFF' : '#FFFFFF',
                      border: departmentFilter !== 'ALL' ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      outline: 'none',
                      minWidth: '160px'
                    }}
                  >
                    <option value="ALL">All Departments</option>
                    {Array.from(new Set(employees.map(e => e.department))).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* Loan Type Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    style={{
                      height: '38px',
                      padding: '0 12px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: typeFilter !== 'ALL' ? '#0E7490' : '#475569',
                      backgroundColor: typeFilter !== 'ALL' ? '#ECFEFF' : '#FFFFFF',
                      border: typeFilter !== 'ALL' ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      outline: 'none',
                      minWidth: '160px'
                    }}
                  >
                    <option value="ALL">All Loan Types</option>
                    <option value="Advance Salary">Advance Salary</option>
                    <option value="Employee Loan">Employee Loan</option>
                  </select>
                </div>

                {/* Clear Filter button */}
                {(departmentFilter !== 'ALL' || typeFilter !== 'ALL' || searchQuery.trim() !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setDepartmentFilter('ALL');
                      setTypeFilter('ALL');
                      setSearchQuery('');
                    }}
                    style={{
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      background: '#F8FAFC',
                      color: '#64748B',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <X size={13} /> Clear
                  </button>
                )}
              </div>

              {/* Showing count */}
              <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Showing <strong style={{ color: '#0E7490' }}>{filteredRecords.length}</strong> of {loanRecords.length} records
              </div>
            </div>
          </div>

          {/* Admin Table adhering to Standard Table Rules */}
          <div className="card" style={{ borderRadius: '16px', overflow: 'hidden' }}>
            <div className="table-responsive">
              <table className="hrms-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Type</th>
                    <th>Requested</th>
                    <th>Eligible Limit</th>
                    <th>Tenure / EMI</th>
                    <th>Active Loans</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--color-text-secondary)' }}>
                        <Banknote size={36} color="#94A3B8" style={{ margin: '0 auto 10px' }} />
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1E293B' }}>No loan requests matching current filter</div>
                        <p style={{ fontSize: '0.8rem', margin: '4px 0 0', color: '#64748B' }}>
                          Try adjusting search terms, department, or selecting another status tab.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map(record => {
                      const isSelected = selectedRowIds.includes(record.id);
                      const empInitials = record.employeeName
                        ? record.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                        : 'EM';
                      return (
                        <tr 
                          key={record.id}
                          style={{
                            backgroundColor: isSelected ? '#ECFEFF' : undefined,
                            borderLeft: isSelected ? '4px solid #0E7490' : undefined
                          }}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                backgroundColor: '#ECFEFF',
                                color: '#0E7490',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                flexShrink: 0
                              }}>
                                {empInitials}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 750, color: 'var(--color-text-primary)', fontSize: '0.86rem' }}>
                                  {record.employeeName}
                                </div>
                                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                  {record.employeeId} • {record.id}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>{record.department}</div>
                            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{record.designation}</span>
                          </td>
                          <td>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              backgroundColor: record.requestType.includes('Advance') ? '#EFF6FF' : '#F5F3FF',
                              color: record.requestType.includes('Advance') ? '#1D4ED8' : '#6D28D9'
                            }}>
                              {(record.requestType as string) === 'Salary Advance' ? 'Advance Salary' : record.requestType}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 750, fontSize: '0.86rem', color: '#0F172A' }}>
                              {formatCurrency(record.requestedAmount)}
                            </div>
                            {record.approvedAmount && record.approvedAmount !== record.requestedAmount && (
                              <div style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700 }}>
                                Sanctioned: {formatCurrency(record.approvedAmount)}
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: '0.82rem', color: '#0E7490', fontWeight: 750 }}>
                              {formatCurrency(record.eligibleLimitAmount)}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.82rem', fontWeight: 650, color: '#1E293B' }}>
                              {record.approvedMonths || record.installmentMonths} Mos
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                              {formatCurrency(record.monthlyDeduction)}/mo
                            </span>
                          </td>
                          <td>
                            <span className="status-pill" style={{ backgroundColor: '#F1F5F9', color: '#334155' }}>
                              {loanRecords.filter(r => r.employeeId === record.employeeId && (r.status === 'Active' || r.status === 'Disbursed')).length} Active
                            </span>
                          </td>
                          <td style={{ fontSize: '0.78rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                            {formatDateDDMMYYYY(record.requestedDate)}
                          </td>
                          <td>{renderStatusBadge(record.status)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                              {/* Pending Review & Accept Action - Strictly HR and CEO only */}
                              {record.status === 'Pending' && (
                                isApprovalAuthority ? (
                                  <button 
                                    type="button" 
                                    className="btn btn-primary btn-sm"
                                    onClick={() => openReviewModal(record)}
                                    style={{ 
                                      padding: '5px 12px', 
                                      fontSize: '0.74rem', 
                                      borderRadius: '8px', 
                                      backgroundColor: '#0E7490', 
                                      borderColor: '#0E7490', 
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px'
                                    }}
                                    title="Review and Accept Request"
                                  >
                                    <Check size={13} strokeWidth={2.5} /> Accept / Review
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '0.72rem', color: '#D97706', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#FEF3C7', border: '1px solid #FDE68A' }}>
                                    Awaiting HR/CEO
                                  </span>
                                )
                              )}

                              {/* Approved Action - Disburse (hand over amount) strictly by Accounts after HR/CEO approval */}
                              {record.status === 'Approved' && (
                                isAccountsUser ? (
                                  <button 
                                    type="button" 
                                    className="btn btn-primary btn-sm"
                                    onClick={() => openDisbursementModal(record)}
                                    style={{ padding: '5px 12px', fontSize: '0.74rem', borderRadius: '8px', backgroundColor: '#0891B2', borderColor: '#0891B2', fontWeight: 700 }}
                                  >
                                    Disburse
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#DCFCE7', border: '1px solid #BBF7D0' }}>
                                    {isApprovalAuthority ? 'Sent to Accounts' : 'Approved by HR/CEO'}
                                  </span>
                                )
                              )}

                              {/* Download Voucher Button - Accessible to Accounts & HR/CEO */}
                              {(record.status === 'Approved' || record.status === 'Active' || record.status === 'Disbursed' || record.status === 'Closed') && (
                                <button 
                                  type="button" 
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleDownloadVoucher(record)}
                                  style={{ 
                                    padding: '5px 9px', 
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
                                  title="Download Official Advance Salary Payout Voucher"
                                >
                                  <Download size={13} /> Voucher
                                </button>
                              )}

                              {/* Active -> Manual Repayment Action (HR/CEO/Accounts) */}
                              {(record.status === 'Active' || record.status === 'Disbursed') && record.outstandingBalance > 0 && (isApprovalAuthority || isAccountsUser) && (
                                <button 
                                  type="button" 
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => openManualRepaymentModal(record)}
                                  style={{ padding: '5px 8px', fontSize: '0.74rem', borderRadius: '8px' }}
                                  title="Record Manual Repayment"
                                >
                                  <IndianRupee size={13} />
                                </button>
                              )}

                              {/* View Details / Dossier */}
                              <button 
                                type="button" 
                                className="btn btn-secondary btn-sm"
                                onClick={() => setSelectedRecordForDetail(record)}
                                style={{ padding: '5px 8px', fontSize: '0.74rem', borderRadius: '8px' }}
                                title="View Dossier & Audits"
                              >
                                <Eye size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Floating Action Bar (Standard VRM Table Rule) */}
          {selectedRowIds.length > 0 && (
            <div style={{
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9000,
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              padding: '12px 24px',
              borderRadius: '9999px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              fontSize: '0.85rem',
              fontWeight: 700
            }}>
              <span>{selectedRowIds.length} Selected</span>
              <span style={{ opacity: 0.4 }}>|</span>
              {isApprovalAuthority && (
              <button 
                type="button"
                onClick={() => {
                  const target = loanRecords.find(r => r.id === selectedRowIds[0] && r.status === 'Pending');
                  if (target) openReviewModal(target);
                  else showFeedback('error', 'Select a Pending request to review.');
                }}
                style={{ background: 'none', border: 'none', color: '#38BDF8', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Review &amp; Accept
              </button>
              )}
              <button 
                type="button"
                onClick={() => setSelectedRowIds([])}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          MODAL 1: REQUEST LOAN MODAL (LIVE VALIDATION & ESTIMATOR)
          ======================================================== */}
      {isRequestModalOpen && (() => {
        const modalEmp = targetEmployee;
        const modalElig = calculateEmployeeLoanEligibility(modalEmp.employeeId);
        const isAdvanceRequest = requestFormData.requestType === 'Advance Salary';
        const nextSalaryMonthLabel = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
          .toLocaleString('en-US', { month: 'long', year: 'numeric' });

        return (
          <div className="modal-overlay" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div className="modal-content" style={{ maxWidth: '640px', width: '100%', borderRadius: '20px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
              {/* Pinned Modal Header */}
              <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', flexShrink: 0 }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                    {isAdvanceRequest ? 'Request Advance Salary' : 'Request Employee Loan'}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: '3px 0 0' }}>
                    Calculated against your monthly salary: {formatCurrency(modalEmp.basicSalary)}
                  </p>
                </div>
                <button 
                  type="button" 
                  onClick={() => {
                    setIsRequestModalOpen(false);
                    if (onCloseQuickAdd) onCloseQuickAdd();
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', padding: 0 }}
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable Modal Body */}
              <div className="modal-body" style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto' }}>
                <form id="advance-salary-request-form" onSubmit={handleRequestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* Ineligibility Alert */}
                  {!modalElig.isEligible && (
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: '#FEF3C7',
                      border: '1px solid #FDE68A',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      fontSize: '0.8rem',
                      color: '#92400E'
                    }}>
                      <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ display: 'block', marginBottom: '2px' }}>Policy Notice:</strong>
                        <span>{modalElig.ineligibleReason}</span>
                      </div>
                    </div>
                  )}

                  {/* Perfectly Balanced Row 1 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Request Type <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <select 
                        className="form-control"
                        value={requestFormData.requestType}
                        onChange={e => {
                          const nextType = e.target.value as 'Advance Salary' | 'Employee Loan';
                          const policyMin = modalElig?.policy?.minRepaymentMonths ?? 1;
                          const policyMax = modalElig?.policy?.maxRepaymentMonths ?? 3;
                          setRequestFormData({
                            ...requestFormData,
                            requestType: nextType,
                            installmentMonths: nextType === 'Advance Salary'
                              ? 1
                              : Math.min(Math.max(3, policyMin), policyMax)
                          });
                        }}
                        style={{ height: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                      >
                        <option value="Advance Salary">Advance Salary</option>
                        <option value="Employee Loan">Employee Loan</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', margin: 0 }}>
                          Requested Amount (₹) <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <span style={{ fontSize: '0.72rem', color: '#0E7490', fontWeight: 600 }}>
                          Max: {formatCurrency(modalElig.maxEligibleAmount || 50000)}
                        </span>
                      </div>
                      <input 
                        type="number"
                        min={modalElig.policy?.minLoanAmount || 1000}
                        max={Math.max(modalElig.maxEligibleAmount || 50000, 10000)}
                        required
                        className="form-control"
                        value={requestFormData.requestedAmount > 0 ? requestFormData.requestedAmount : ''}
                        onChange={e => {
                          const rawValue = e.target.value;
                          setRequestFormData({
                            ...requestFormData,
                            requestedAmount: rawValue === '' ? 0 : Number(rawValue)
                          });
                        }}
                        style={{ height: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  {/* Perfectly Balanced Row 2 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                    {isAdvanceRequest ? (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                          Recovery
                        </label>
                        <div
                          id="advance-salary-recovery-info"
                          style={{
                            minHeight: '42px',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            border: '1px solid #A5F3FC',
                            backgroundColor: '#ECFEFF',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            gap: '2px'
                          }}
                        >
                          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0E7490' }}>
                            Full deduction · {nextSalaryMonthLabel} salary
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {formatCurrency(toNum(requestFormData.requestedAmount))} auto-deducted at next salary credit
                          </span>
                        </div>
                      </div>
                    ) : (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label htmlFor="repayment-period-months" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', margin: 0 }}>
                          Repayment Period (Months) <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          Allowed: {modalElig?.policy?.minRepaymentMonths ?? 1}–{modalElig?.policy?.maxRepaymentMonths ?? 3} mos
                        </span>
                      </div>
                      <input 
                        id="repayment-period-months"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        required
                        className="form-control"
                        value={requestFormData.installmentMonths > 0 ? requestFormData.installmentMonths : ''}
                        onChange={e => {
                          const minM = modalElig?.policy?.minRepaymentMonths ?? 1;
                          const maxM = modalElig?.policy?.maxRepaymentMonths ?? 12;
                          const months = normalizeRepaymentMonthsInput(e.target.value, maxM, minM);
                          setRequestFormData(prev => ({ ...prev, installmentMonths: months }));
                        }}
                        onBlur={() => {
                          const minMonths = modalElig?.policy?.minRepaymentMonths ?? 1;
                          const maxMonths = modalElig?.policy?.maxRepaymentMonths ?? 12;
                          const current = Number(requestFormData.installmentMonths);
                          const months = (!current || isNaN(current) || current < minMonths)
                            ? minMonths
                            : Math.min(current, maxMonths);
                          setRequestFormData(prev => ({ ...prev, installmentMonths: months }));
                        }}
                        style={{ height: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                      />
                    </div>
                    )}

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Funds Needed By Date (Future Date Only) <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <input 
                        type="date"
                        required
                        className="form-control"
                        min={getFutureRequestDateString()}
                        value={requestFormData.neededByDate}
                        onChange={e => {
                          const requestDate = getFutureRequestDateString();
                          const selectedDate = e.target.value;
                          setRequestFormData({
                            ...requestFormData,
                            neededByDate: !selectedDate || selectedDate < requestDate ? requestDate : selectedDate
                          });
                        }}
                        onBlur={() => {
                          const requestDate = getFutureRequestDateString();
                          if (!requestFormData.neededByDate || requestFormData.neededByDate < requestDate) {
                            setRequestFormData(prev => ({
                              ...prev,
                              neededByDate: requestDate
                            }));
                          }
                        }}
                        style={{ height: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                      />
                      <span style={{ fontSize: '0.69rem', color: '#64748B', display: 'block', marginTop: '3px' }}>
                        Allowed: {formatDateDDMMYYYY(getFutureRequestDateString())} onwards. Past dates blocked.
                      </span>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                      Purpose / Reason <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Medical Emergency, Higher Education, Home Renovation"
                      className="form-control"
                      value={requestFormData.purpose}
                      onChange={e => setRequestFormData({ ...requestFormData, purpose: e.target.value })}
                      style={{ height: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                      Additional Details & Notes (Optional)
                    </label>
                    <textarea 
                      rows={2}
                      placeholder="Specify hospital name, admission date, or urgency details..."
                      className="form-control"
                      value={requestFormData.reasonDetails}
                      onChange={e => setRequestFormData({ ...requestFormData, reasonDetails: e.target.value })}
                      style={{ borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem', resize: 'vertical' }}
                    />
                  </div>

                </form>
              </div>

              {/* Pinned Modal Footer (Always Visible) */}
              <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexShrink: 0 }}>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsRequestModalOpen(false);
                    if (onCloseQuickAdd) onCloseQuickAdd();
                  }}
                  style={{ borderRadius: '10px', padding: '9px 18px', fontWeight: 600, fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  form="advance-salary-request-form"
                  className="btn btn-primary"
                  style={{ borderRadius: '10px', padding: '9px 20px', fontWeight: 700, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#0E7490', borderColor: '#0E7490' }}
                >
                  <Send size={15} /> Submit Advance Salary Request
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================
          MODAL 2: HR / CEO REVIEW & APPROVAL MODAL (FULL SCREEN CAPABLE)
          ======================================================== */}
      {reviewModalRecord && (
        <div 
          className="modal-overlay" 
          style={{ 
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            padding: isReviewFullScreen ? '12px' : '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div 
            className="modal-content" 
            style={{ 
              width: isReviewFullScreen ? '98vw' : '90vw',
              maxWidth: isReviewFullScreen ? '1200px' : '780px',
              height: isReviewFullScreen ? '96vh' : 'auto',
              maxHeight: isReviewFullScreen ? '96vh' : '92vh',
              borderRadius: '20px',
              backgroundColor: '#FFFFFF',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Fixed Header */}
            <div className="modal-header" style={{ 
              padding: '18px 28px', 
              borderBottom: '1px solid #E2E8F0', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              flexShrink: 0,
              background: '#FFFFFF',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                <div style={{ 
                  width: '42px', 
                  height: '42px', 
                  borderRadius: '12px', 
                  background: '#ECFEFF', 
                  border: '1px solid #CFFAFE', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <ShieldCheck size={22} color="#0E7490" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0F172A', whiteSpace: 'nowrap' }}>
                      Review Advance Request
                    </h3>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 700, 
                      padding: '2px 8px', 
                      borderRadius: '6px',
                      background: '#F1F5F9',
                      color: '#0E7490',
                      border: '1px solid #CFFAFE',
                      whiteSpace: 'nowrap'
                    }}>
                      {reviewModalRecord.id}
                    </span>
                    <span style={{ 
                      fontSize: '0.72rem', 
                      fontWeight: 700, 
                      padding: '3px 10px', 
                      borderRadius: '9999px',
                      background: '#FEF3C7',
                      color: '#B45309',
                      border: '1px solid #FDE68A',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      flexShrink: 0
                    }}>
                      Pending Review
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '3px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Applicant: <strong style={{ color: '#1E293B' }}>{reviewModalRecord.employeeName}</strong> ({reviewModalRecord.employeeId}) • {reviewModalRecord.department}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button 
                  type="button" 
                  onClick={() => setIsReviewFullScreen(!isReviewFullScreen)}
                  title={isReviewFullScreen ? "Restore modal size" : "Expand to full screen"}
                  style={{ 
                    background: '#F8FAFC', 
                    border: '1px solid #E2E8F0', 
                    cursor: 'pointer', 
                    color: '#64748B',
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isReviewFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button 
                  type="button" 
                  onClick={() => setReviewModalRecord(null)}
                  title="Close"
                  style={{ 
                    background: '#F8FAFC', 
                    border: '1px solid #E2E8F0', 
                    cursor: 'pointer', 
                    color: '#64748B',
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', margin: 0 }}>
              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '24px 28px', 
                background: '#F8FAFC',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
              }}>
                {/* Applicant Dossier Box */}
                <div style={{ 
                  padding: '16px 20px', 
                  backgroundColor: '#FFFFFF', 
                  borderRadius: '14px', 
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'grid',
                  gridTemplateColumns: isReviewFullScreen ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
                  gap: '14px',
                  fontSize: '0.8rem'
                }}>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>Requested Amount</span>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}>{formatCurrency(reviewModalRecord.requestedAmount)}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>Eligible Limit</span>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0E7490' }}>{formatCurrency(reviewModalRecord.eligibleLimitAmount)}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>Tenure Requested</span>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}>{reviewModalRecord.installmentMonths} Months</div>
                  </div>
                  <div style={{ gridColumn: isReviewFullScreen ? 'span 1' : 'span 3', borderLeft: isReviewFullScreen ? '1px solid #E2E8F0' : 'none', paddingLeft: isReviewFullScreen ? '14px' : '0', borderTop: isReviewFullScreen ? 'none' : '1px solid #E2E8F0', paddingTop: isReviewFullScreen ? '0' : '8px' }}>
                    <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>Purpose & Context</span>
                    <div style={{ fontWeight: 650, color: '#334155' }}>{reviewModalRecord.purpose}</div>
                    {reviewModalRecord.reasonDetails && (
                      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '3px', lineHeight: 1.35 }}>{reviewModalRecord.reasonDetails}</div>
                    )}
                  </div>
                </div>

                {/* Action Decision Toggle */}
                <div style={{ 
                  background: '#FFFFFF', 
                  borderRadius: '14px', 
                  border: '1px solid #E2E8F0', 
                  padding: '16px 20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '10px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Select Action Decision
                  </label>
                  <div style={{ display: 'flex', gap: '14px' }}>
                    <button
                      type="button"
                      onClick={() => setReviewFormData({ ...reviewFormData, action: 'Approve' })}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: reviewFormData.action === 'Approve' ? '2px solid #0E7490' : '1px solid #E2E8F0',
                        backgroundColor: reviewFormData.action === 'Approve' ? '#ECFEFF' : '#FFFFFF',
                        color: reviewFormData.action === 'Approve' ? '#0E7490' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <CheckCircle2 size={18} /> Accept / Approve Request
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewFormData({ ...reviewFormData, action: 'Reject' })}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: reviewFormData.action === 'Reject' ? '2px solid #EF4444' : '1px solid #E2E8F0',
                        backgroundColor: reviewFormData.action === 'Reject' ? '#FEF2F2' : '#FFFFFF',
                        color: reviewFormData.action === 'Reject' ? '#DC2626' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <XCircle size={18} /> Reject Request
                    </button>
                  </div>
                </div>

                {/* Form Controls Card */}
                <div style={{ 
                  background: '#FFFFFF', 
                  borderRadius: '14px', 
                  border: '1px solid #E2E8F0', 
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                  {reviewFormData.action === 'Approve' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: isReviewFullScreen ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: '16px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                          Approved Amount (₹) <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <input 
                          type="number"
                          max={reviewModalRecord.eligibleLimitAmount}
                          className="form-control"
                          value={reviewFormData.approvedAmount}
                          onChange={e => {
                            const amt = Number(e.target.value);
                            setReviewFormData({
                              ...reviewFormData,
                              approvedAmount: amt,
                              monthlyDeduction: isAdvanceType(reviewModalRecord.requestType)
                                ? amt
                                : Math.round(amt / (reviewFormData.approvedMonths || 1))
                            });
                          }}
                        />
                      </div>

                      {isAdvanceType(reviewModalRecord.requestType) ? (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                            Recovery
                          </label>
                          <input
                            type="text"
                            readOnly
                            className="form-control"
                            value="Full deduction from next month salary"
                            style={{ backgroundColor: '#ECFEFF', color: '#0E7490', fontWeight: 700, borderColor: '#A5F3FC' }}
                          />
                        </div>
                      ) : (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                          Approved Tenure (Months) <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <input 
                          type="number"
                          min={1}
                          max={36}
                          className="form-control"
                          value={reviewFormData.approvedMonths}
                          onChange={e => {
                            const m = Number(e.target.value);
                            setReviewFormData({
                              ...reviewFormData,
                              approvedMonths: m,
                              monthlyDeduction: Math.round(reviewFormData.approvedAmount / (m || 1))
                            });
                          }}
                        />
                      </div>
                      )}

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                          {isAdvanceType(reviewModalRecord.requestType) ? 'Deduction Amount (₹)' : 'Monthly Deduction (₹)'}
                        </label>
                        <input 
                          type="number"
                          className="form-control"
                          value={reviewFormData.monthlyDeduction}
                          readOnly={isAdvanceType(reviewModalRecord.requestType)}
                          onChange={e => setReviewFormData({ ...reviewFormData, monthlyDeduction: Number(e.target.value) })}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                          Deduction Start Month
                        </label>
                        <select 
                          className="form-control"
                          value={reviewFormData.deductionStartMonth}
                          onChange={e => setReviewFormData({ ...reviewFormData, deductionStartMonth: e.target.value })}
                        >
                          {upcomingPayrollCycles.map(c => (
                            <option key={c.val} value={c.val}>{c.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group" style={{ gridColumn: isReviewFullScreen ? 'span 2' : 'span 2', marginBottom: 0 }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                          Employee Visible Notes
                        </label>
                        <input 
                          type="text"
                          className="form-control"
                          placeholder="e.g. Approved. Funds will be credited after disbursement verification."
                          value={reviewFormData.employeeVisibleNotes}
                          onChange={e => setReviewFormData({ ...reviewFormData, employeeVisibleNotes: e.target.value })}
                        />
                      </div>

                      <div className="form-group" style={{ gridColumn: isReviewFullScreen ? 'span 2' : 'span 2', marginBottom: 0 }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                          Internal HR Confidential Notes
                        </label>
                        <input 
                          type="text"
                          className="form-control"
                          placeholder="Verified salary and employment tenure. Sanction recommended."
                          value={reviewFormData.internalHrNotes}
                          onChange={e => setReviewFormData({ ...reviewFormData, internalHrNotes: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        Rejection Reason <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <textarea 
                        rows={3}
                        className="form-control"
                        required
                        placeholder="Please specify detailed rationale for rejecting this loan request..."
                        value={reviewFormData.rejectionReason}
                        onChange={e => setReviewFormData({ ...reviewFormData, rejectionReason: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Fixed Footer Actions (Always 100% visible) */}
              <div style={{ 
                padding: '16px 28px', 
                borderTop: '1px solid #E2E8F0', 
                background: '#FFFFFF',
                flexShrink: 0,
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Action Selected: <strong style={{ color: reviewFormData.action === 'Approve' ? '#0E7490' : '#DC2626' }}>{reviewFormData.action}</strong>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={() => setReviewModalRecord(null)}
                    style={{ borderRadius: '12px', padding: '10px 20px', fontWeight: 600 }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className={`btn ${reviewFormData.action === 'Approve' ? 'btn-primary' : 'btn-danger'}`}
                    style={{ borderRadius: '12px', padding: '10px 24px', fontWeight: 700 }}
                  >
                    {reviewFormData.action === 'Approve' ? 'Accept & Approve Request' : 'Confirm Rejection'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: LOAN DISBURSEMENT MODAL (FULL SCREEN)
          ======================================================== */}
      {disbursementModalRecord && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            position: 'fixed', inset: 0,
            backgroundColor: '#FFFFFF',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Full Screen Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 32px',
              borderBottom: '1px solid var(--color-border)',
              backgroundColor: '#FFFFFF',
              flexShrink: 0
            }}>
              <div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                  Execute Loan Disbursement
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '3px 0 0' }}>
                  Sanctioned Loan Account: {disbursementModalRecord.id} • {disbursementModalRecord.employeeName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDisbursementModalRecord(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '8px' }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
              <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                <form id="disbursement-form" onSubmit={handleDisbursementSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ padding: '16px', background: '#ECFEFF', borderRadius: '12px', fontSize: '0.85rem', color: '#0E7490', border: '1px solid #A5F3FC' }}>
                    <strong>Important:</strong> Disbursing this loan activates monthly repayment deductions starting from <strong>{disbursementModalRecord.deductionStartMonth || 'Nov 2026'}</strong>.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>Disbursement Date <span style={{ color: '#EF4444' }}>*</span></label>
                      <input
                        type="date" required className="form-control"
                        value={disbursementFormData.disbursedDate}
                        onChange={e => setDisbursementFormData({ ...disbursementFormData, disbursedDate: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>Disbursed Amount (₹) <span style={{ color: '#EF4444' }}>*</span></label>
                      <input
                        type="number" required className="form-control"
                        value={disbursementFormData.disbursedAmount}
                        onChange={e => setDisbursementFormData({ ...disbursementFormData, disbursedAmount: Number(e.target.value) })}
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>Payment Mode <span style={{ color: '#EF4444' }}>*</span></label>
                      <select
                        className="form-control"
                        value={disbursementFormData.paymentMode}
                        onChange={e => setDisbursementFormData({ ...disbursementFormData, paymentMode: e.target.value as any })}
                      >
                        <option value="NEFT">NEFT (Direct Bank Transfer)</option>
                        <option value="IMPS">IMPS (Instant Transfer)</option>
                        <option value="Cheque">Company Cheque</option>
                        <option value="Cash">Cash Voucher</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>Transaction Reference <span style={{ color: '#EF4444' }}>*</span></label>
                      <input
                        type="text" required placeholder="e.g. NEFT-VRM-89217340"
                        className="form-control"
                        value={disbursementFormData.transactionRef}
                        onChange={e => setDisbursementFormData({ ...disbursementFormData, transactionRef: e.target.value })}
                      />
                    </div>

                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>Disbursement Notes</label>
                      <input
                        type="text" className="form-control"
                        value={disbursementFormData.notes}
                        onChange={e => setDisbursementFormData({ ...disbursementFormData, notes: e.target.value })}
                      />
                    </div>
                  </div>
                </form>
              </div>
            </div>

            {/* Fixed Footer */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: '12px',
              padding: '20px 32px',
              borderTop: '1px solid var(--color-border)',
              backgroundColor: '#FFFFFF',
              flexShrink: 0
            }}>
              <button
                type="button" className="btn btn-secondary"
                onClick={() => setDisbursementModalRecord(null)}
                style={{ borderRadius: '12px', minWidth: '120px' }}
              >
                Cancel
              </button>
              <button
                type="submit" form="disbursement-form" className="btn btn-primary"
                style={{ borderRadius: '12px', backgroundColor: '#0E7490', minWidth: '200px' }}
              >
                Confirm Disbursement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 4: MANUAL REPAYMENT MODAL
          ======================================================== */}
      {manualRepaymentModalRecord && (
        <div className="modal-overlay" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-content" style={{ maxWidth: '560px', width: '100%', borderRadius: '20px', backgroundColor: '#FFFFFF', boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Modal Header */}
            <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                  Record Manual Direct Repayment
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Loan Ref: <strong style={{ color: '#0E7490' }}>{manualRepaymentModalRecord.id}</strong></span>
                  <span>•</span>
                  <span>Outstanding: <strong style={{ color: '#0F172A' }}>{formatCurrency(manualRepaymentModalRecord.outstandingBalance)}</strong></span>
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setManualRepaymentModalRecord(null)}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  cursor: 'pointer', 
                  color: '#64748B', 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '8px', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body" style={{ padding: '24px', overflowY: 'auto', flex: '1 1 auto' }}>
              {/* Informative Summary Badge */}
              <div style={{ padding: '12px 16px', backgroundColor: '#ECFEFF', borderRadius: '12px', border: '1px solid #CFFAFE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#0E7490', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Borrower</span>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
                    {manualRepaymentModalRecord.employeeName} <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 500 }}>({manualRepaymentModalRecord.employeeId})</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Current Outstanding</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0E7490' }}>
                    {formatCurrency(manualRepaymentModalRecord.outstandingBalance)}
                  </div>
                </div>
              </div>

              <form id="manual-repayment-form" onSubmit={handleManualRepaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                      Payment Amount (₹) <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input 
                      type="number"
                      min="1"
                      max={manualRepaymentModalRecord.outstandingBalance}
                      required
                      className="form-control"
                      style={{ height: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', padding: '0 14px', fontSize: '0.9rem' }}
                      value={manualRepaymentFormData.amount}
                      onChange={e => setManualRepaymentFormData({ ...manualRepaymentFormData, amount: Number(e.target.value) })}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                      Payment Date <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input 
                      type="date"
                      required
                      className="form-control"
                      style={{ height: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', padding: '0 14px', fontSize: '0.9rem' }}
                      value={manualRepaymentFormData.repaymentDate}
                      onChange={e => setManualRepaymentFormData({ ...manualRepaymentFormData, repaymentDate: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                      Payment Mode <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <select 
                      className="form-control"
                      style={{ height: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', padding: '0 14px', fontSize: '0.9rem', backgroundColor: '#FFFFFF' }}
                      value={manualRepaymentFormData.paymentMode}
                      onChange={e => setManualRepaymentFormData({ ...manualRepaymentFormData, paymentMode: e.target.value as any })}
                    >
                      <option value="Bank Transfer">Bank Transfer (NEFT / IMPS)</option>
                      <option value="UPI">UPI / GPay / PhonePe</option>
                      <option value="Cash">Cash Deposit</option>
                      <option value="Cheque">Bank Cheque</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                      Receipt / Ref Number
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. TRX-020973 or UPI-9218274"
                      className="form-control"
                      style={{ height: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', padding: '0 14px', fontSize: '0.9rem' }}
                      value={manualRepaymentFormData.referenceNumber}
                      onChange={e => setManualRepaymentFormData({ ...manualRepaymentFormData, referenceNumber: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                      Notes / Remarks
                    </label>
                    <input 
                      type="text"
                      placeholder="Direct voluntary repayment received."
                      className="form-control"
                      style={{ height: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', padding: '0 14px', fontSize: '0.9rem' }}
                      value={manualRepaymentFormData.notes}
                      onChange={e => setManualRepaymentFormData({ ...manualRepaymentFormData, notes: e.target.value })}
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexShrink: 0 }}>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setManualRepaymentModalRecord(null)}
                style={{ borderRadius: '10px', padding: '9px 18px', fontWeight: 600, fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                form="manual-repayment-form"
                className="btn btn-primary"
                style={{ borderRadius: '10px', padding: '9px 22px', fontWeight: 700, fontSize: '0.85rem', backgroundColor: '#0E7490', borderColor: '#0E7490' }}
              >
                Record Payment
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 5: REPAYMENT SCHEDULE & AUDIT TRAIL MODAL
          ======================================================== */}
      {(selectedRecordForDetail || scheduleModalRecord) && (
        (() => {
          const rec = selectedRecordForDetail || scheduleModalRecord!;
          return (
            <div className="modal-overlay" style={{ zIndex: 9999 }}>
              <div className="modal-content" style={{ maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.18)' }}>
                <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0' }}>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                      Loan Account Dossier: {rec.id}
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                      <strong style={{ color: '#334155' }}>{rec.employeeName}</strong> ({rec.employeeId}) • {rec.department}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm"
                      onClick={() => downloadElementAsPDF('printable-loan-schedule', `Loan_Schedule_${rec.id}`)}
                      style={{ borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontWeight: 600 }}
                    >
                      <Download size={13} /> PDF
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setSelectedRecordForDetail(null); setScheduleModalRecord(null); }}
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        cursor: 'pointer', 
                        color: '#64748B', 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      title="Close"
                      aria-label="Close"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div 
                  id="printable-loan-schedule" 
                  className="modal-body" 
                  style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}
                >
                  {/* Account Summary Cards */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(4, 1fr)', 
                    gap: '12px', 
                    padding: '16px 20px', 
                    backgroundColor: '#F8FAFC', 
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0'
                  }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Sanctioned:</span>
                      <strong style={{ display: 'block', color: '#0F172A', fontSize: '1.1rem', fontWeight: 800, marginTop: '2px' }}>
                        {formatCurrency(rec.approvedAmount || rec.requestedAmount)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Monthly EMI:</span>
                      <strong style={{ display: 'block', color: '#0E7490', fontSize: '1.1rem', fontWeight: 800, marginTop: '2px' }}>
                        {formatCurrency(rec.monthlyDeduction)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Outstanding:</span>
                      <strong style={{ display: 'block', color: rec.outstandingBalance > 0 ? '#B45309' : '#166534', fontSize: '1.1rem', fontWeight: 800, marginTop: '2px' }}>
                        {formatCurrency(rec.outstandingBalance)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Status:</span>
                      <div style={{ marginTop: '4px' }}>{renderStatusBadge(rec.status)}</div>
                    </div>
                  </div>

                  {/* Monthly Repayment Installments Table */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                        Monthly Repayment Schedule
                      </h4>
                      <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>
                        {rec.repaymentSchedule.length} Installments Total
                      </span>
                    </div>
                    <div className="table-responsive" style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                      <table className="hrms-table" style={{ fontSize: '0.8rem', margin: 0, width: '100%' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#F8FAFC' }}>
                            <th style={{ width: '48px', textAlign: 'center', padding: '10px 12px' }}>#</th>
                            <th style={{ padding: '10px 14px' }}>Month / Cycle</th>
                            <th style={{ textAlign: 'right', padding: '10px 14px' }}>Scheduled EMI</th>
                            <th style={{ textAlign: 'right', padding: '10px 14px' }}>Actual Deducted</th>
                            <th style={{ textAlign: 'right', padding: '10px 14px' }}>Remaining Balance</th>
                            <th style={{ textAlign: 'center', width: '110px', padding: '10px 14px' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rec.repaymentSchedule.map((inst: LoanRepaymentInstallment) => (
                            <tr key={inst.installmentNumber}>
                              <td style={{ textAlign: 'center', color: '#64748B', padding: '12px' }}>{inst.installmentNumber}</td>
                              <td style={{ padding: '12px 14px' }}><strong>{inst.periodMonth}</strong></td>
                              <td style={{ textAlign: 'right', fontWeight: 600, padding: '12px 14px' }}>{formatCurrency(inst.scheduledAmount)}</td>
                              <td style={{ textAlign: 'right', color: inst.actualDeducted > 0 ? '#166534' : '#64748B', fontWeight: 700, padding: '12px 14px' }}>
                                {formatCurrency(inst.actualDeducted)}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, padding: '12px 14px' }}>{formatCurrency(inst.remainingBalance)}</td>
                              <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                                <span className={`status-pill ${inst.status === 'Deducted' ? 'approved' : 'pending'}`}>
                                  {inst.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Audit Trail (Visible to HR/CEO or summarized) */}
                  {!isViewingAsEmployee && rec.auditLogs && rec.auditLogs.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <History size={16} color="#0E7490" /> Audit Log & Lifecycle Trail
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {rec.auditLogs.map((log: any) => (
                          <div 
                            key={log.id} 
                            style={{ 
                              padding: '12px 16px', 
                              backgroundColor: '#F8FAFC', 
                              borderRadius: '12px', 
                              border: '1px solid #E2E8F0',
                              fontSize: '0.78rem'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                              <strong style={{ color: '#0E7490', fontSize: '0.82rem' }}>{log.action}</strong>
                              <span style={{ color: '#64748B', fontSize: '0.72rem' }}>{log.timestamp}</span>
                            </div>
                            <div style={{ color: '#334155', fontWeight: 500 }}>By: {log.performedBy} ({log.performedByRole})</div>
                            {log.newValue && (
                              <div style={{ color: '#166534', marginTop: '3px', fontWeight: 600 }}>{log.newValue}</div>
                            )}
                            {log.notes && (
                              <div style={{ color: '#64748B', fontStyle: 'italic', marginTop: '3px' }}>{log.notes}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div 
                  className="modal-footer" 
                  style={{ 
                    padding: '14px 24px', 
                    borderTop: '1px solid #E2E8F0', 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    backgroundColor: '#F8FAFC',
                    borderBottomLeftRadius: '20px',
                    borderBottomRightRadius: '20px'
                  }}
                >
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => { setSelectedRecordForDetail(null); setScheduleModalRecord(null); }}
                    style={{ borderRadius: '10px', padding: '7px 18px', fontSize: '0.84rem', fontWeight: 600 }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};

export default AdvanceSalaryManagement;
