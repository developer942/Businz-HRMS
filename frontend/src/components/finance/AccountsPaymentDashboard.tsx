import React, { useState, useEffect, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { pettyCashService } from '../../services/pettyCashService';
import { fieldAllowanceService } from '../../services/fieldAllowanceService';
import { disburseExpenseApi } from '../../services/expenseService';
import { PettyCashRequest, PettyCashDisbursement } from '../../types/pettyCash';
import type { FieldAllowanceDistribution, FieldAllowanceRequest } from '../../types/fieldAllowance';
import { Expense, LoanRecord, PayrollRecord, Employee } from '../../types/hrms';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { ExportDropdown } from '../common/ExportDropdown';
import { CalendarMonthYearFilter, matchesCalendarMonthYear } from '../common/CalendarMonthYearFilter';
import { ProofViewerModal } from '../petty-cash/ProofViewerModal';
import { downloadCSV, downloadExcel, downloadPDF, ExportColumn } from '../../utils/exportUtils';
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
  X,
  RefreshCw,
  Calendar,
  Check,
  History,
  MapPin,
  IndianRupee,
  Eye,
  FileText,
  Upload,
} from 'lucide-react';

const formatCurrency = (val: number | string | undefined | null): string => {
  const num = Number(val) || 0;
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

/**
 * Resolves the actual approver name & role (e.g. "Velmurugan M (CEO)" or "Pavithra R (HR)")
 * so that "By HR / CEO" is never displayed.
 */
const resolveApproverLabel = (rawApprover: string | undefined | null, employees: Employee[]): string => {
  const cleaned = String(rawApprover || '').trim();
  if (cleaned && cleaned.toLowerCase() !== 'hr / ceo' && cleaned.toLowerCase() !== 'hr/ceo') {
    if (cleaned.includes('(')) return cleaned;
    const lower = cleaned.toLowerCase();
    if (lower === 'ceo' || lower === 'hr') return cleaned.toUpperCase();

    const matchedEmp = employees.find(
      (e) =>
        `${e.firstName} ${e.lastName}`.trim().toLowerCase() === lower ||
        (e.employeeId && e.employeeId.toLowerCase() === lower) ||
        (e.id && e.id.toLowerCase() === lower)
    );
    if (matchedEmp) {
      const fullName = `${matchedEmp.firstName} ${matchedEmp.lastName}`.trim();
      const desig = String(matchedEmp.designation || '').toLowerCase();
      const dept = String(matchedEmp.department || '').toLowerCase();
      if (desig.includes('ceo') || desig.includes('managing director') || desig.includes('founder') || matchedEmp.employeeId === 'VRM-001') {
        return `${fullName} (CEO)`;
      }
      if (desig.includes('hr') || dept.includes('hr')) {
        return `${fullName} (HR)`;
      }
      return `${fullName} (${matchedEmp.designation || 'Approver'})`;
    }
    if (lower.includes('velmurugan')) return `${cleaned} (CEO)`;
    if (lower.includes('pavithra')) return `${cleaned} (HR)`;
    return cleaned;
  }

  // Fallback: look up CEO from employees directory so we show actual CEO name & role instead of "HR / CEO"
  const ceoEmp = employees.find((e) => {
    const desig = String(e.designation || '').toLowerCase();
    return desig.includes('ceo') || desig.includes('managing director') || e.employeeId === 'VRM-001';
  });
  if (ceoEmp) {
    return `${ceoEmp.firstName} ${ceoEmp.lastName}`.trim() + ' (CEO)';
  }
  return 'Velmurugan M (CEO)';
};

type PaymentTab = 'ALL' | 'SALARY' | 'EXPENSES' | 'ADVANCES' | 'PETTY_CASH' | 'FIELD_ALLOWANCE' | 'HISTORY';

export interface EmployeeProofAttachment {
  label: string;
  url: string;
  amount?: number;
  date?: string;
}

interface UnifiedPaymentItem {
  id: string;
  sourceType: 'SALARY' | 'EXPENSE' | 'ADVANCE' | 'PETTY_CASH' | 'FIELD_ALLOWANCE';
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
  employeeProofs: EmployeeProofAttachment[];
  paymentDetails?: {
    paidAmount?: number;
    paymentDate?: string;
    paymentMode?: string;
    transactionRef?: string;
    paymentProofPath?: string;
    remarks?: string;
    disbursedBy?: string;
  };
  rawRecord: Expense | LoanRecord | PettyCashRequest | FieldAllowanceRequest | PayrollRecord;
}

export const AccountsPaymentDashboard: React.FC = () => {
  const {
    expenses = [],
    loanRecords = [],
    payrollRecords = [],
    approveExpense,
    disburseLoan,
    markPayrollRecordsPaid,
    addNotification,
    employees = [],
    currentUser,
  } = useHRMS();

  const [activeTab, setActiveTab] = useState<PaymentTab>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  const [pettyCashRequests, setPettyCashRequests] = useState<PettyCashRequest[]>([]);
  const [pettyCashDisbursements, setPettyCashDisbursements] = useState<PettyCashDisbursement[]>([]);
  const [fieldAllowanceRequests, setFieldAllowanceRequests] = useState<FieldAllowanceRequest[]>([]);
  const [fieldAllowanceDistributions, setFieldAllowanceDistributions] = useState<FieldAllowanceDistribution[]>([]);

  // Proof Viewer Modal State
  const [proofViewer, setProofViewer] = useState<{
    isOpen: boolean;
    url: string;
    title: string;
    allProofs?: EmployeeProofAttachment[];
  }>({
    isOpen: false,
    url: '',
    title: '',
  });

  // Disbursement Modal State
  const [selectedItem, setSelectedItem] = useState<UnifiedPaymentItem | null>(null);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  );
  const [paymentMode, setPaymentMode] = useState<'Bank Transfer' | 'UPI' | 'Cash' | 'Cheque' | 'NEFT' | 'IMPS'>('Bank Transfer');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [paymentProofPath, setPaymentProofPath] = useState<string>('');
  const [paymentProofName, setPaymentProofName] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPettyCashRequests = async () => {
    try {
      const [reqs, disbs] = await Promise.all([
        pettyCashService.getRequests().catch(() => []),
        pettyCashService.getDisbursements().catch(() => []),
      ]);
      setPettyCashRequests(reqs || []);
      setPettyCashDisbursements(disbs || []);
    } catch (err) {
      console.warn('[AccountsPaymentDashboard] Could not fetch petty cash requests:', err);
    }
  };

  const fetchFieldAllowancePayments = async () => {
    try {
      const [requests, distributions] = await Promise.all([
        fieldAllowanceService.list(),
        fieldAllowanceService.distributions(),
      ]);
      setFieldAllowanceRequests(requests || []);
      setFieldAllowanceDistributions(distributions || []);
    } catch (err) {
      console.warn('[AccountsPaymentDashboard] Could not fetch field allowance payments:', err);
    }
  };

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetchPettyCashRequests();
      void fetchFieldAllowancePayments();
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  // Map and consolidate all financial sources into one Accounts payment queue
  const unifiedItems: UnifiedPaymentItem[] = useMemo(() => {
    const list: UnifiedPaymentItem[] = [];

    // 1. Expense Claims (Only Approved or Reimbursed)
    (expenses || []).forEach((exp) => {
      const isApproved = exp.status === 'Approved';
      const isReimbursed = exp.status === 'Reimbursed';
      if (!isApproved && !isReimbursed) return;

      const emp = employees.find((e) => e.employeeId === exp.employeeId || e.id === exp.employeeId);
      const employeeProofs: EmployeeProofAttachment[] = [];
      if (exp.receiptUrl) {
        employeeProofs.push({
          label: `${exp.category || 'Expense'} Bill / Receipt`,
          url: exp.receiptUrl,
          amount: Number(exp.amount),
          date: exp.date,
        });
      }

      list.push({
        id: `EXP-${exp.id}`,
        sourceType: 'EXPENSE',
        typeLabel: `Expense (${exp.category || 'General'})`,
        requestNumber: exp.id.startsWith('EXP-') ? exp.id : `EXP-${exp.id.slice(0, 8).toUpperCase()}`,
        employeeName: exp.employeeName || (emp ? `${emp.firstName} ${emp.lastName}`.trim() : 'Staff Claimant'),
        employeeId: exp.employeeId || emp?.employeeId || 'STAFF',
        department: exp.department || emp?.department || 'Operations',
        approvedAmount: Number(exp.amount),
        requestedAmount: Number(exp.amount),
        approvedDate: (exp.approvedAt || exp.date || 'Recent').slice(0, 10),
        approvedBy: resolveApproverLabel(exp.approvedBy, employees),
        purpose: exp.description || 'Employee Expense Reimbursement',
        status: isApproved ? 'PENDING_DISBURSEMENT' : 'DISBURSED',
        employeeProofs,
        paymentDetails: isReimbursed
          ? {
              paidAmount: Number(exp.disbursedAmount || exp.amount),
              paymentDate: exp.reimbursedDate || exp.date,
              paymentMode: exp.paymentMode || 'Bank Transfer',
              transactionRef: exp.transactionRef,
              paymentProofPath: exp.paymentProofUrl,
              remarks: exp.paymentRemarks,
              disbursedBy: exp.reimbursedBy || 'Accounts Dept',
            }
          : undefined,
        rawRecord: exp,
      });
    });

    // 2. Advance Salary Requests (Only Approved or Active/Disbursed)
    (loanRecords || []).forEach((loan) => {
      const isApproved = loan.status === 'Approved';
      const isDisbursed = loan.status === 'Active' || loan.status === 'Disbursed';
      if (!isApproved && !isDisbursed) return;

      const approvedAmt = loan.approvedAmount || loan.requestedAmount;
      const employeeProofs: EmployeeProofAttachment[] = [];
      if ((loan as any).supportingDocumentUrl || (loan as any).attachmentUrl) {
        employeeProofs.push({
          label: 'Advance Supporting Document',
          url: (loan as any).supportingDocumentUrl || (loan as any).attachmentUrl,
          amount: approvedAmt,
          date: loan.requestedDate,
        });
      }

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
        approvedBy: resolveApproverLabel(loan.ceoApproval?.approvedBy, employees),
        purpose: loan.purpose || 'Salary Advance Request',
        status: isApproved ? 'PENDING_DISBURSEMENT' : 'DISBURSED',
        employeeProofs,
        paymentDetails: isDisbursed
          ? {
              paidAmount: loan.disbursedAmount || approvedAmt,
              paymentDate: loan.disbursementDetails?.disbursedAt,
              paymentMode: loan.disbursementDetails?.paymentMode || 'Bank Transfer',
              transactionRef: loan.disbursementDetails?.transactionRef,
              paymentProofPath: loan.disbursementDetails?.paymentProofUrl,
              remarks: loan.disbursementDetails?.notes,
              disbursedBy: loan.disbursementDetails?.disbursedBy,
            }
          : undefined,
        rawRecord: loan,
      });
    });

    // 3. Petty Cash Requests (Only CEO-Approved or DISBURSED_PENDING_RECEIPT / COMPLETED)
    const pcDisbByReqId = new Map(
      (pettyCashDisbursements || []).map((d) => [d.request_id, d])
    );
    (pettyCashRequests || []).forEach((pc) => {
      const isApproved = pc.status === 'APPROVED_BY_CEO';
      const isDisbursed = pc.status === 'DISBURSED_PENDING_RECEIPT' || pc.status === 'COMPLETED';
      if (!isApproved && !isDisbursed) return;

      const approvedAmt = pc.approved_amount || pc.requested_amount;
      const disb = pcDisbByReqId.get(pc.id);
      const employeeProofs: EmployeeProofAttachment[] = [];
      if (pc.supporting_document_url) {
        employeeProofs.push({
          label: 'Petty Cash Requisition Proof',
          url: pc.supporting_document_url,
          amount: approvedAmt,
          date: pc.request_date,
        });
      }

      list.push({
        id: `PC-${pc.id}`,
        sourceType: 'PETTY_CASH',
        typeLabel: 'Petty Cash Funding',
        requestNumber: pc.request_number || `PC-${pc.id.slice(0, 8).toUpperCase()}`,
        employeeName: pc.employee_name || pc.custodian_name || 'Designated Custodian',
        employeeId: pc.employee_code || pc.custodian_employee_id || pc.employee_id || 'CUSTODIAN',
        department: 'Finance Custody',
        approvedAmount: approvedAmt,
        requestedAmount: pc.requested_amount,
        approvedDate: pc.ceo_action_at ? pc.ceo_action_at.slice(0, 10) : pc.request_date,
        approvedBy: resolveApproverLabel(pc.ceo_name, employees),
        purpose: pc.purpose || 'Branch Daily Operational Expenses',
        status: isApproved ? 'PENDING_DISBURSEMENT' : 'DISBURSED',
        employeeProofs,
        paymentDetails: isDisbursed
          ? {
              paidAmount: disb?.disbursed_amount || approvedAmt,
              paymentDate: disb?.payment_date || (pc.updated_at ? pc.updated_at.slice(0, 10) : undefined),
              paymentMode: disb?.payment_mode || 'Cash',
              transactionRef: disb?.payment_reference,
              paymentProofPath: disb?.payment_proof_url,
              remarks: disb?.remarks,
              disbursedBy: disb?.disbursed_by_name || 'Accounts Dept',
            }
          : undefined,
        rawRecord: pc,
      });
    });

    // 4. Field Allowance advances & balance settlements
    const fieldDistributionByRequest = new Map(
      (fieldAllowanceDistributions || []).map((distribution) => [distribution.request_id, distribution])
    );
    (fieldAllowanceRequests || []).forEach((request) => {
      // Collect all daily expense bill proofs uploaded by the employee
      const tripProofs: EmployeeProofAttachment[] = [];
      if (Array.isArray(request.daily_reports)) {
        request.daily_reports.forEach((rep) => {
          if (rep.attachment_path) {
            tripProofs.push({
              label: `${rep.category} — ${rep.description || 'Daily Expense'}`,
              url: rep.attachment_path,
              amount: Number(rep.amount || 0),
              date: rep.expense_date,
            });
          }
        });
      }
      if (request.balance_return_proof_path) {
        tripProofs.push({
          label: `${request.trip_code} Balance Settlement Proof`,
          url: request.balance_return_proof_path,
          amount: Number(request.returned_amount || 0),
          date: request.balance_returned_at?.slice(0, 10),
        });
      }

      // 4a. Initial Advance Disbursement (when advance_required is true)
      if (request.advance_required) {
        const isApproved = request.status === 'APPROVED';
        const isDisbursed = ['AMOUNT_DISTRIBUTED', 'IN_PROGRESS', 'COMPLETED'].includes(request.status);
        if (isApproved || isDisbursed) {
          const distribution = fieldDistributionByRequest.get(request.id);
          list.push({
            id: `FA-${request.id}`,
            sourceType: 'FIELD_ALLOWANCE',
            typeLabel: 'Finance & Claim Advance',
            requestNumber: request.trip_code,
            employeeName: request.employee_name,
            employeeId: request.employee_id,
            department: request.department_name || 'Operations',
            approvedAmount: Number(request.approved_amount || 0),
            requestedAmount: Number(request.requested_amount || 0),
            approvedDate: (request.decided_at || request.updated_at || request.created_at).slice(0, 10),
            approvedBy: resolveApproverLabel(request.decided_by_name, employees),
            purpose: `${request.purpose} · ${request.destination}`,
            status: isApproved ? 'PENDING_DISBURSEMENT' : 'DISBURSED',
            employeeProofs: tripProofs,
            paymentDetails: isDisbursed
              ? {
                  paidAmount: Number(distribution?.distributed_amount || request.allocated_amount || request.approved_amount),
                  paymentDate: distribution?.distribution_date,
                  paymentMode: distribution?.payment_method || 'Paid',
                  transactionRef: distribution?.reference_number || undefined,
                  paymentProofPath: distribution?.payment_proof_path || undefined,
                  remarks: distribution?.remarks || undefined,
                  disbursedBy: distribution?.distributor_name || 'Accounts Dept',
                }
              : undefined,
            rawRecord: request,
          });
        }
      }

      // 4b. Field Allowance remaining balance / trip settlement submitted by employee to Accounts
      const returnedAmt = Number(request.returned_amount || 0);
      const unspentDiff = Math.abs(Number(request.allocated_amount || 0) - Number(request.total_spent || 0));
      const settlementAmount = returnedAmt > 0 ? returnedAmt : unspentDiff;

      if (
        settlementAmount > 0 &&
        (request.balance_return_status === 'SUBMITTED_TO_ACCOUNTS' ||
          request.balance_return_status === 'RECEIVED_BY_ACCOUNTS')
      ) {
        const isPendingReceipt = request.balance_return_status === 'SUBMITTED_TO_ACCOUNTS';
        const isEmployeeReimbursement = Number(request.total_spent || 0) > Number(request.allocated_amount || 0);
        list.push({
          id: `FA-RET-${request.id}`,
          sourceType: 'FIELD_ALLOWANCE',
          typeLabel: isEmployeeReimbursement
            ? 'Finance & Claim Expense Settlement'
            : 'Finance & Claim Balance Return',
          requestNumber: `${request.trip_code}-STL`,
          employeeName: request.employee_name,
          employeeId: request.employee_id,
          department: request.department_name || 'Operations',
          approvedAmount: settlementAmount,
          requestedAmount: settlementAmount,
          approvedDate: (request.balance_returned_at || request.updated_at || request.created_at).slice(0, 10),
          approvedBy: resolveApproverLabel(request.decided_by_name, employees),
          purpose: `Allocated: ${formatCurrency(request.allocated_amount)} · Spent: ${formatCurrency(request.total_spent)} · ${
            isEmployeeReimbursement ? 'Reimbursement Due' : 'Unspent Balance Return'
          } (${request.purpose} - ${request.destination})`,
          status: isPendingReceipt ? 'PENDING_DISBURSEMENT' : 'DISBURSED',
          employeeProofs: tripProofs,
          paymentDetails: !isPendingReceipt
            ? {
                paidAmount: settlementAmount,
                paymentDate: (request.balance_received_at || request.updated_at || '').slice(0, 10),
                paymentMode: request.balance_return_mode || 'Cash',
                transactionRef: request.balance_return_reference || undefined,
                paymentProofPath: request.balance_return_proof_path || undefined,
                remarks: request.balance_return_remarks || 'Balance settled by Accounts',
                disbursedBy: request.balance_received_by_name || 'Accounts Dept',
              }
            : undefined,
          rawRecord: request,
        });
      }
    });

    // 5. Payroll Salaries forwarded to Accounts for disbursement
    (payrollRecords || []).forEach((pay) => {
      const isPendingDisbursement = pay.status === 'Sent to Accounts';
      const isDisbursed = pay.status === 'Paid';
      if (!isPendingDisbursement && !isDisbursed) return;

      const netAmt = Number(pay.netSalary || 0);
      list.push({
        id: `SAL-${pay.id}`,
        sourceType: 'SALARY',
        typeLabel: `Salary Payout (${pay.month} ${pay.year})`,
        requestNumber: pay.id.startsWith('PAY-') ? pay.id : `SAL-${pay.id.slice(0, 8).toUpperCase()}`,
        employeeName: pay.employeeName || 'Employee',
        employeeId: pay.employeeId,
        department: pay.department || 'General',
        approvedAmount: netAmt,
        requestedAmount: Number(pay.grossSalary || netAmt),
        approvedDate: pay.sentToAccountsAt
          ? pay.sentToAccountsAt.slice(0, 10)
          : pay.lockedAt
          ? pay.lockedAt.slice(0, 10)
          : `${pay.year}-${String(pay.month).slice(0, 3)}`,
        approvedBy: resolveApproverLabel(pay.sentToAccountsBy || pay.lockedBy, employees),
        purpose: `${pay.month} ${pay.year} Monthly Net Salary Distribution`,
        status: isPendingDisbursement ? 'PENDING_DISBURSEMENT' : 'DISBURSED',
        employeeProofs: [],
        paymentDetails: isDisbursed
          ? {
              paidAmount: pay.disbursementDetails?.paidAmount ?? netAmt,
              paymentDate: pay.disbursementDetails?.paymentDate || (pay.lockedAt ? pay.lockedAt.slice(0, 10) : undefined),
              paymentMode: pay.disbursementDetails?.paymentMode || 'Bank Transfer',
              transactionRef: pay.disbursementDetails?.transactionRef,
              paymentProofPath: pay.disbursementDetails?.paymentProofPath,
              remarks: pay.disbursementDetails?.remarks,
              disbursedBy: pay.disbursementDetails?.disbursedBy || pay.lockedBy || 'Accounts Dept',
            }
          : undefined,
        rawRecord: pay,
      });
    });

    return list.sort((a, b) => {
      if (a.status === 'PENDING_DISBURSEMENT' && b.status !== 'PENDING_DISBURSEMENT') return -1;
      if (a.status !== 'PENDING_DISBURSEMENT' && b.status === 'PENDING_DISBURSEMENT') return 1;
      return b.approvedDate.localeCompare(a.approvedDate);
    });
  }, [
    expenses,
    loanRecords,
    payrollRecords,
    pettyCashRequests,
    pettyCashDisbursements,
    fieldAllowanceRequests,
    fieldAllowanceDistributions,
    employees,
  ]);

  // Tab Filtering, Month/Year Filtering & Search
  const filteredItems = useMemo(() => {
    return unifiedItems.filter((item) => {
      if (activeTab === 'SALARY' && item.sourceType !== 'SALARY') return false;
      if (activeTab === 'EXPENSES' && item.sourceType !== 'EXPENSE' && item.sourceType !== 'FIELD_ALLOWANCE') return false;
      if (activeTab === 'ADVANCES' && item.sourceType !== 'ADVANCE') return false;
      if (activeTab === 'PETTY_CASH' && item.sourceType !== 'PETTY_CASH') return false;
      if (activeTab === 'FIELD_ALLOWANCE' && item.sourceType !== 'FIELD_ALLOWANCE') return false;
      if (activeTab === 'HISTORY' && item.status !== 'DISBURSED') return false;
      if (activeTab !== 'HISTORY' && item.status !== 'PENDING_DISBURSEMENT') return false;

      // Month & Year Filter
      const targetDate =
        activeTab === 'HISTORY' && item.paymentDetails?.paymentDate
          ? item.paymentDetails.paymentDate
          : item.approvedDate;
      if (!matchesCalendarMonthYear(targetDate, selectedMonth, selectedYear)) {
        return false;
      }

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
  }, [unifiedItems, activeTab, selectedMonth, selectedYear, searchQuery]);

  // Aggregate Metrics (respecting selected Month & Year filter)
  const metrics = useMemo(() => {
    const dateFiltered = unifiedItems.filter((i) =>
      matchesCalendarMonthYear(i.paymentDetails?.paymentDate || i.approvedDate, selectedMonth, selectedYear)
    );
    const pendingItems = dateFiltered.filter((i) => i.status === 'PENDING_DISBURSEMENT');
    const pendingTotal = pendingItems.reduce((sum, i) => sum + i.approvedAmount, 0);

    const pendingSalaries = pendingItems.filter((i) => i.sourceType === 'SALARY');
    const pendingSalariesTotal = pendingSalaries.reduce((sum, i) => sum + i.approvedAmount, 0);

    const pendingExpenses = pendingItems.filter((i) => i.sourceType === 'EXPENSE');
    const pendingExpensesTotal = pendingExpenses.reduce((sum, i) => sum + i.approvedAmount, 0);

    const pendingAdvances = pendingItems.filter((i) => i.sourceType === 'ADVANCE');
    const pendingAdvancesTotal = pendingAdvances.reduce((sum, i) => sum + i.approvedAmount, 0);

    const pendingPettyCash = pendingItems.filter((i) => i.sourceType === 'PETTY_CASH');
    const pendingPettyCashTotal = pendingPettyCash.reduce((sum, i) => sum + i.approvedAmount, 0);

    const pendingFieldAllowance = pendingItems.filter((i) => i.sourceType === 'FIELD_ALLOWANCE');
    const pendingFieldAllowanceTotal = pendingFieldAllowance.reduce((sum, i) => sum + i.approvedAmount, 0);

    const disbursedItems = dateFiltered.filter((i) => i.status === 'DISBURSED');
    const disbursedTotal = disbursedItems.reduce(
      (sum, i) => sum + (i.paymentDetails?.paidAmount || i.approvedAmount),
      0
    );

    return {
      pendingCount: pendingItems.length,
      pendingTotal,
      pendingSalaryCount: pendingSalaries.length,
      pendingSalaryTotal: pendingSalariesTotal,
      pendingSalaryRecordIds: pendingSalaries.map((s) => (s.rawRecord as PayrollRecord).id),
      pendingExpensesCount: pendingExpenses.length,
      pendingExpensesTotal,
      pendingAdvancesCount: pendingAdvances.length,
      pendingAdvancesTotal,
      pendingPettyCashCount: pendingPettyCash.length,
      pendingPettyCashTotal,
      pendingFieldAllowanceCount: pendingFieldAllowance.length,
      pendingFieldAllowanceTotal,
      disbursedCount: disbursedItems.length,
      disbursedTotal,
    };
  }, [unifiedItems, selectedMonth, selectedYear]);

  // Open Disbursement Modal
  const handleOpenDisburseModal = (item: UnifiedPaymentItem) => {
    setSelectedItem(item);
    setAmountPaid(item.approvedAmount);
    if (item.id.startsWith('FA-RET-')) {
      const req = item.rawRecord as FieldAllowanceRequest;
      const mode = (req.balance_return_mode as any) || 'Cash';
      setPaymentMode(mode);
      setTransactionRef(req.balance_return_reference || '');
    } else {
      setPaymentMode('Bank Transfer');
      setTransactionRef('');
    }
    setPaymentProofPath('');
    setPaymentProofName('');
    setRemarks('');
    setModalError(null);
    setSuccessMessage(null);
  };

  const handlePaymentProof = (file?: File) => {
    if (!file) {
      setPaymentProofPath('');
      setPaymentProofName('');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setModalError('Distribution proof must be 3 MB or smaller.');
      return;
    }
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setModalError('Upload an image (PNG/JPG) or PDF distribution proof.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPaymentProofPath(String(reader.result || ''));
      setPaymentProofName(file.name);
      setModalError(null);
    };
    reader.onerror = () => setModalError('Unable to read the selected distribution proof.');
    reader.readAsDataURL(file);
  };

  // Submit Disbursement Execution
  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    setModalError(null);

    if (!amountPaid || amountPaid <= 0) {
      setModalError('Please enter a valid disbursement amount greater than ₹0.');
      return;
    }

    if (amountPaid > selectedItem.approvedAmount) {
      setModalError(
        `Disbursed amount (${formatCurrency(amountPaid)}) cannot exceed the approved cap of ${formatCurrency(
          selectedItem.approvedAmount
        )}.`
      );
      return;
    }

    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (paymentDate > todayStr) {
      setModalError('Payment date cannot be in the future.');
      return;
    }

    if (['Bank Transfer', 'UPI', 'Cheque', 'NEFT', 'IMPS'].includes(paymentMode) && !transactionRef.trim()) {
      setModalError(`Transaction reference / UTR is mandatory for ${paymentMode}.`);
      return;
    }

    if (
      selectedItem.sourceType === 'FIELD_ALLOWANCE' &&
      !selectedItem.id.startsWith('FA-RET-') &&
      paymentMode !== 'Cash' &&
      !paymentProofPath
    ) {
      setModalError('Distribution proof is mandatory for non-cash distribution.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (selectedItem.sourceType === 'EXPENSE') {
        const exp = selectedItem.rawRecord as Expense;
        try {
          await disburseExpenseApi(exp.id, {
            amountPaid,
            paymentMode,
            paymentDate,
            transactionRef: transactionRef.trim() || undefined,
            paymentProofPath: paymentProofPath || undefined,
            remarks: remarks.trim() || undefined,
          });
        } catch (apiErr: any) {
          console.warn('[AccountsPaymentDashboard] API call warning, applying state update:', apiErr.message);
        }

        approveExpense(exp.id, currentUser.name || 'Accounts Dept', 'Reimbursed', {
          paymentDetails: {
            amountPaid,
            paymentMode: (paymentMode === 'NEFT' || paymentMode === 'IMPS' ? 'Bank Transfer' : paymentMode) as any,
            transactionRef: transactionRef.trim() || undefined,
            remarks: remarks.trim() || undefined,
            paymentProofUrl: paymentProofPath || undefined,
          },
        });

        addNotification({
          title: 'Expense Claim Paid',
          message: `Your claim of ${formatCurrency(amountPaid)} (${exp.category}) has been paid via ${paymentMode}. Ref: ${
            transactionRef || 'N/A'
          }.`,
          priority: 'Normal',
          category: 'Payroll',
          targetEmployeeIds: [selectedItem.employeeId],
        });

        addNotification({
          title: 'Payment Distributed by Accounts',
          message: `Accounts disbursed ${formatCurrency(amountPaid)} to ${selectedItem.employeeName} for ${selectedItem.typeLabel}.`,
          priority: 'Normal',
          category: 'Payroll',
          targetRoles: ['CEO', 'Super Admin'],
        });
      } else if (selectedItem.sourceType === 'ADVANCE') {
        const loan = selectedItem.rawRecord as LoanRecord;
        disburseLoan(loan.id, {
          disbursedDate: paymentDate,
          disbursedAmount: amountPaid,
          paymentMode: paymentMode as any,
          transactionRef: transactionRef.trim() || undefined,
          notes: remarks.trim() || undefined,
          paymentProofUrl: paymentProofPath || undefined,
        });
      } else if (selectedItem.sourceType === 'PETTY_CASH') {
        const pc = selectedItem.rawRecord as PettyCashRequest;
        await pettyCashService.disburseCash(pc.id, {
          disbursedAmount: amountPaid,
          paymentMode: paymentMode as any,
          paymentDate,
          paymentReference: transactionRef.trim() || 'CASH-DISBURSEMENT',
          remarks: remarks.trim() || undefined,
          paymentProofUrl: paymentProofPath || undefined,
        });

        addNotification({
          title: 'Petty Cash Funding Disbursed',
          message: `Petty cash fund of ${formatCurrency(amountPaid)} has been disbursed to custodian ${selectedItem.employeeName}. Ready for receipt confirmation.`,
          priority: 'Important',
          category: 'Payroll',
          targetEmployeeIds: [selectedItem.employeeId],
        });

        await fetchPettyCashRequests();
      } else if (selectedItem.sourceType === 'FIELD_ALLOWANCE') {
        const allowance = selectedItem.rawRecord as FieldAllowanceRequest;
        if (selectedItem.id.startsWith('FA-RET-')) {
          await fieldAllowanceService.confirmBalance(allowance.id, {
            paymentMethod: paymentMode,
            referenceNumber: transactionRef.trim() || (paymentMode === 'Cash' ? 'CASH-SETTLEMENT' : undefined),
            paymentProofPath: paymentProofPath || undefined,
            remarks: remarks.trim() || `Balance settlement confirmed via ${paymentMode}`,
          });
          addNotification({
            title: 'Claim Balance Settled by Accounts',
            message: `Accounts settled your balance of ${formatCurrency(amountPaid)} for field visit ${allowance.trip_code}.`,
            priority: 'Normal',
            category: 'Payroll',
            targetEmployeeIds: [selectedItem.employeeId],
          });
        } else {
          await fieldAllowanceService.distribute(allowance.id, {
            distributedAmount: amountPaid,
            distributionDate: paymentDate,
            paymentMethod: paymentMode,
            referenceNumber: transactionRef.trim() || (paymentMode === 'Cash' ? 'CASH-DISBURSEMENT' : undefined),
            paymentProofPath: paymentProofPath || undefined,
            remarks: remarks.trim() || undefined,
          });

          addNotification({
            title: 'Claim Payment Distributed',
            message: `${formatCurrency(amountPaid)} was distributed for field visit ${allowance.trip_code}. Daily expense reporting is now enabled.`,
            priority: 'Important',
            category: 'Payroll',
            targetEmployeeIds: [selectedItem.employeeId],
          });
        }

        await fetchFieldAllowancePayments();
      } else if (selectedItem.sourceType === 'SALARY') {
        const payRec = selectedItem.rawRecord as PayrollRecord;
        markPayrollRecordsPaid([payRec.id], {
          paidAmount: amountPaid,
          paymentDate,
          paymentMode,
          transactionRef: transactionRef.trim() || undefined,
          paymentProofPath: paymentProofPath || undefined,
          remarks: remarks.trim() || undefined,
          disbursedBy: currentUser.name || 'Accounts Dept',
        });

        addNotification({
          title: 'Salary Distributed by Accounts',
          message: `Your ${payRec.month} ${payRec.year} salary of ${formatCurrency(amountPaid)} has been distributed via ${paymentMode}.`,
          priority: 'Important',
          category: 'Payroll',
          targetEmployeeIds: [selectedItem.employeeId],
        });
      }

      setSuccessMessage(
        `Payment of ${formatCurrency(amountPaid)} recorded successfully for ${selectedItem.employeeName} (${selectedItem.requestNumber}).`
      );
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

  const openProofViewer = (proofs: EmployeeProofAttachment[], startIdx = 0) => {
    if (!proofs || proofs.length === 0) return;
    const target = proofs[startIdx] || proofs[0];
    setProofViewer({
      isOpen: true,
      url: target.url,
      title: `${target.label}${target.amount ? ` (${formatCurrency(target.amount)})` : ''}`,
      allProofs: proofs,
    });
  };

  const exportColumns: ExportColumn[] = [
    { label: 'Request Number', key: 'requestNumber' },
    { label: 'Employee Name', key: 'employeeName' },
    { label: 'Employee ID', key: 'employeeId' },
    { label: 'Department', key: 'department' },
    { label: 'Payment Type', key: 'typeLabel' },
    { label: 'Approved Amount (₹)', key: 'approvedAmountFormatted' },
    { label: 'Requested Amount (₹)', key: 'requestedAmountFormatted' },
    { label: 'Approval Date', key: 'approvedDateFormatted' },
    { label: 'Approved By', key: 'approvedBy' },
    { label: 'Status', key: 'statusLabel' },
    { label: 'Payment Mode', key: 'paymentMode' },
    { label: 'Reference / UTR', key: 'transactionRef' },
    { label: 'Disbursement Date', key: 'paidDateFormatted' },
    { label: 'Purpose / Remarks', key: 'purpose' },
  ];

  const getExportData = (items: UnifiedPaymentItem[]) => {
    return items.map((item) => ({
      ...item,
      approvedAmountFormatted: Number(item.approvedAmount || 0).toFixed(2),
      requestedAmountFormatted: Number(item.requestedAmount || 0).toFixed(2),
      approvedDateFormatted: item.approvedDate ? formatDateDDMMYYYY(item.approvedDate) : '-',
      statusLabel:
        item.status === 'DISBURSED' ? 'Disbursed' : item.status === 'REJECTED' ? 'Rejected' : 'Pending Disbursement',
      paymentMode: item.paymentDetails?.paymentMode || '-',
      transactionRef: item.paymentDetails?.transactionRef || '-',
      paidDateFormatted: item.paymentDetails?.paymentDate ? formatDateDDMMYYYY(item.paymentDetails.paymentDate) : '-',
    }));
  };

  const handleExportCSV = () => {
    const data = getExportData(filteredItems);
    downloadCSV(data, `Accounts_Payment_Disbursements_${new Date().toISOString().slice(0, 10)}`, exportColumns);
  };

  const handleExportExcel = () => {
    const data = getExportData(filteredItems);
    downloadExcel(data, `Accounts_Payment_Disbursements_${new Date().toISOString().slice(0, 10)}`, exportColumns);
  };

  const handleExportPDF = () => {
    const data = getExportData(filteredItems);
    downloadPDF(
      data,
      'Accounts Payment Disbursement Register',
      `Accounts_Payment_Disbursements_${new Date().toISOString().slice(0, 10)}`,
      exportColumns
    );
  };

  return (
    <div className="accounts-payment-dashboard" style={{ paddingBottom: '40px' }}>
      {/* 1. Header & Title Banner */}
      <div className="card" style={{ marginBottom: '20px', padding: '24px 28px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Receipt size={22} strokeWidth={2.4} />
              </div>
              <h1
                style={{
                  fontSize: '1.45rem',
                  fontWeight: 800,
                  color: '#0F172A',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                Accounts Payment Disbursement
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <CalendarMonthYearFilter
              month={selectedMonth}
              year={selectedYear}
              onMonthChange={setSelectedMonth}
              onYearChange={setSelectedYear}
              allowAll
            />

            {metrics.pendingSalaryCount > 0 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  markPayrollRecordsPaid(metrics.pendingSalaryRecordIds, {
                    paymentDate,
                    paymentMode: 'Bank Transfer',
                    remarks: 'Bulk salary distribution by Accounts Department',
                    disbursedBy: currentUser.name || 'Accounts Dept',
                  });
                }}
                style={{
                  backgroundColor: '#0E7490',
                  borderColor: '#0E7490',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <IndianRupee size={16} />
                <span>Distribute All Salaries ({metrics.pendingSalaryCount})</span>
              </button>
            )}
            <ExportDropdown
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
              onExportCSV={handleExportCSV}
              label="Download"
              variant="secondary"
            />
          </div>
        </div>
      </div>

      {/* 2. Top Summary Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        {/* Total Pending */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #0E7490' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Pending Disbursements
            </span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '9999px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
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

        {/* Salary Payouts */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #0284C7' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Salary Payouts
            </span>
            <IndianRupee size={17} color="#0284C7" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {formatCurrency(metrics.pendingSalaryTotal)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#0284C7', fontWeight: 600, marginTop: '4px' }}>
            {metrics.pendingSalaryCount} salary record(s) ready for payout
          </div>
        </div>

        {/* Finance & Claims */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #EA580C' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Approved Claims
            </span>
            <CreditCard size={17} color="#EA580C" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {formatCurrency(metrics.pendingExpensesTotal + metrics.pendingFieldAllowanceTotal)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#EA580C', fontWeight: 600, marginTop: '4px' }}>
            {metrics.pendingExpensesCount + metrics.pendingFieldAllowanceCount} claim(s) ready for payout
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
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
              onClick={() => setActiveTab('SALARY')}
              className={`btn ${activeTab === 'SALARY' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 14px', fontSize: '0.82rem', borderRadius: '10px', whiteSpace: 'nowrap' }}
            >
              Salary Payouts ({metrics.pendingSalaryCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('EXPENSES')}
              className={`btn ${activeTab === 'EXPENSES' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 14px', fontSize: '0.82rem', borderRadius: '10px', whiteSpace: 'nowrap' }}
            >
              Finance & Claims ({metrics.pendingExpensesCount + metrics.pendingFieldAllowanceCount})
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
            <Search
              size={16}
              color="#94A3B8"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
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
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                }}
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
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                  Request ID
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                  Type & Category
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                  Claimant / Employee
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                  Approved Amount
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                  Approval Date
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                  Employee Proof
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                  Status
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    color: '#64748B',
                    textTransform: 'uppercase',
                    textAlign: 'right',
                  }}
                >
                  Payment Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: '#64748B' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <CheckCircle2 size={36} color="#0E7490" />
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>
                        No payment requests in this queue
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                        {activeTab === 'HISTORY'
                          ? 'No past disbursements recorded yet.'
                          : 'All approved requests have been processed. New requests will appear here after approval.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isPending = item.status === 'PENDING_DISBURSEMENT';
                  const isBalanceReturn = item.id.startsWith('FA-RET-');

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      {/* Request ID */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#0E7490',
                            fontSize: '0.82rem',
                            backgroundColor: '#ECFEFF',
                            padding: '3px 8px',
                            borderRadius: '6px',
                          }}
                        >
                          {item.requestNumber}
                        </span>
                      </td>

                      {/* Type & Category */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {item.sourceType === 'SALARY' && (
                            <span
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                backgroundColor: '#E0F2FE',
                                color: '#0284C7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <IndianRupee size={15} />
                            </span>
                          )}
                          {item.sourceType === 'EXPENSE' && (
                            <span
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                backgroundColor: '#FFF7ED',
                                color: '#EA580C',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <CreditCard size={15} />
                            </span>
                          )}
                          {item.sourceType === 'ADVANCE' && (
                            <span
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                backgroundColor: '#F0FDF4',
                                color: '#16A34A',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <Banknote size={15} />
                            </span>
                          )}
                          {item.sourceType === 'PETTY_CASH' && (
                            <span
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                backgroundColor: '#ECFEFF',
                                color: '#0891B2',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <Wallet size={15} />
                            </span>
                          )}
                          {item.sourceType === 'FIELD_ALLOWANCE' && (
                            <span
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                backgroundColor: '#F5F3FF',
                                color: '#7C3AED',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <MapPin size={15} />
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

                      {/* Approval Date & Actual Approver */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.82rem',
                            color: '#334155',
                            fontWeight: 600,
                          }}
                        >
                          <Calendar size={14} color="#64748B" />
                          <span>{item.approvedDate}</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>
                          By {item.approvedBy}
                        </div>
                      </td>

                      {/* Employee Uploaded Proof */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        {item.employeeProofs.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => openProofViewer(item.employeeProofs, 0)}
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '5px 10px',
                              fontSize: '0.76rem',
                              borderRadius: '8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              color: '#0E7490',
                              borderColor: '#A5F3FC',
                              backgroundColor: '#ECFEFF',
                              fontWeight: 700,
                            }}
                          >
                            <Eye size={13} />
                            <span>
                              {item.employeeProofs.length === 1
                                ? 'View Proof'
                                : `View Proofs (${item.employeeProofs.length})`}
                            </span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>No Proof</span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        {isPending ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 10px',
                              borderRadius: '9999px',
                              backgroundColor: '#FEF3C7',
                              color: '#B45309',
                              border: '1px solid #FDE68A',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                            }}
                          >
                            <Clock size={12} />
                            {isBalanceReturn ? 'Pending Settlement' : 'Ready for Payment'}
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 10px',
                              borderRadius: '9999px',
                              backgroundColor: '#DCFCE7',
                              color: '#15803D',
                              border: '1px solid #BBF7D0',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                            }}
                          >
                            <Check size={12} />
                            {isBalanceReturn ? 'Accounts Settled' : 'Disbursed'}
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
                              gap: '6px',
                            }}
                          >
                            <span>{isBalanceReturn ? 'Settle Balance' : 'Distribute Payment'}</span>
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
                            {item.paymentDetails?.paymentProofPath && (
                              <button
                                type="button"
                                onClick={() =>
                                  setProofViewer({
                                    isOpen: true,
                                    url: item.paymentDetails!.paymentProofPath!,
                                    title: `Distribution Proof — ${item.requestNumber}`,
                                  })
                                }
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  color: '#0E7490',
                                  fontWeight: 700,
                                  marginTop: '3px',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                }}
                              >
                                View Distribution Proof
                              </button>
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
            <div
              style={{
                textAlign: 'center',
                padding: '36px 16px',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
              }}
            >
              <CheckCircle2 size={36} color="#0E7490" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 750, fontSize: '0.92rem', color: '#1E293B' }}>No Payment Requests in Queue</div>
              <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '4px 0 0' }}>
                {activeTab === 'HISTORY'
                  ? 'No past disbursements recorded yet.'
                  : 'All approved requests have been processed.'}
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isPending = item.status === 'PENDING_DISBURSEMENT';
              const isBalanceReturn = item.id.startsWith('FA-RET-');
              return (
                <div key={item.id} className="mobile-payment-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            color: '#0E7490',
                            fontSize: '0.82rem',
                            backgroundColor: '#ECFEFF',
                            padding: '2px 7px',
                            borderRadius: '6px',
                          }}
                        >
                          {item.requestNumber}
                        </span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            background: '#F1F5F9',
                            color: '#334155',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            fontWeight: 700,
                          }}
                        >
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
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              backgroundColor: '#FEF3C7',
                              color: '#B45309',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}
                          >
                            <Clock size={11} /> {isBalanceReturn ? 'Settlement' : 'Ready'}
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              backgroundColor: '#DCFCE7',
                              color: '#15803D',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}
                          >
                            <Check size={11} /> {isBalanceReturn ? 'Settled' : 'Paid'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: '#475569',
                      background: '#F8FAFC',
                      padding: '8px 10px',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{item.purpose}</div>
                    <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600, marginTop: '2px' }}>
                      By {item.approvedBy} • {item.approvedDate}
                    </div>
                  </div>

                  {item.employeeProofs.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => openProofViewer(item.employeeProofs, 0)}
                        className="btn btn-secondary btn-sm"
                        style={{
                          width: '100%',
                          borderRadius: '8px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color: '#0E7490',
                          borderColor: '#A5F3FC',
                          backgroundColor: '#ECFEFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        <Eye size={14} />
                        <span>
                          View Employee Proof{item.employeeProofs.length > 1 ? `s (${item.employeeProofs.length})` : ''}
                        </span>
                      </button>
                    </div>
                  )}

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
                          minHeight: '38px',
                        }}
                      >
                        <span>{isBalanceReturn ? 'Settle Balance' : 'Distribute Payment'}</span>
                        <ArrowUpRight size={15} />
                      </button>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.76rem',
                          color: '#64748B',
                          padding: '4px 6px',
                        }}
                      >
                        <span>
                          Mode: <strong style={{ color: '#1E293B' }}>{item.paymentDetails?.paymentMode || 'Paid'}</strong>
                        </span>
                        {item.paymentDetails?.transactionRef && (
                          <span style={{ fontFamily: 'monospace' }}>Ref: {item.paymentDetails.transactionRef}</span>
                        )}
                        {item.paymentDetails?.paymentProofPath && (
                          <button
                            type="button"
                            onClick={() =>
                              setProofViewer({
                                isOpen: true,
                                url: item.paymentDetails!.paymentProofPath!,
                                title: `Distribution Proof — ${item.requestNumber}`,
                              })
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#0E7490',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            View Proof
                          </button>
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

      {/* 5. Record Payment Distribution / Settlement Modal */}
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
            padding: '16px',
          }}
        >
          <div
            className="modal-content"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '540px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '18px 22px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  {selectedItem.id.startsWith('FA-RET-')
                    ? 'Settle Claim Balance'
                    : 'Record Payment Distribution'}
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
              <div
                style={{
                  backgroundColor: '#ECFEFF',
                  border: '1px solid #A5F3FC',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  marginBottom: '14px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#0891B2', fontWeight: 700, textTransform: 'uppercase' }}>
                    {selectedItem.id.startsWith('FA-RET-') ? 'Employee' : 'Recipient'}
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0E7490' }}>
                    {selectedItem.employeeName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    {selectedItem.employeeId} ({selectedItem.department})
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#0891B2', fontWeight: 700, textTransform: 'uppercase' }}>
                    {selectedItem.id.startsWith('FA-RET-') ? 'Settlement Amount' : 'Approved Amount'}
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0E7490' }}>
                    {formatCurrency(selectedItem.approvedAmount)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>
                    By {selectedItem.approvedBy} • {selectedItem.approvedDate}
                  </div>
                </div>
              </div>

              {/* Employee Uploaded Proof Section inside Disbursement Modal */}
              {selectedItem.employeeProofs.length > 0 && (
                <div
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      color: '#334155',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Employee Uploaded Bill / Proof ({selectedItem.employeeProofs.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedItem.employeeProofs.map((proof, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => openProofViewer(selectedItem.employeeProofs, idx)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid #A5F3FC',
                          backgroundColor: '#ECFEFF',
                          color: '#0E7490',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <FileText size={13} />
                        <span>
                          {proof.label}
                          {proof.amount ? ` (${formatCurrency(proof.amount)})` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {modalError && (
                <div
                  style={{
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#B91C1C',
                    fontSize: '0.82rem',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{modalError}</span>
                </div>
              )}

              {successMessage && (
                <div
                  style={{
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#15803D',
                    fontSize: '0.82rem',
                  }}
                >
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <span>{successMessage}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                {/* Amount Paid */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    {selectedItem.id.startsWith('FA-RET-') ? 'Amount Settled (₹) *' : 'Amount Paid (₹) *'}
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
                    max={new Intl.DateTimeFormat('en-CA', {
                      timeZone: 'Asia/Kolkata',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    }).format(new Date())}
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

              {/* Distribution Proof Upload (Available for ALL Payment Types!) */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  <Upload size={14} color="#0E7490" />
                  <span>
                    Distribution Proof / Payment Receipt{' '}
                    {selectedItem.sourceType === 'FIELD_ALLOWANCE' &&
                    !selectedItem.id.startsWith('FA-RET-') &&
                    paymentMode !== 'Cash'
                      ? '*'
                      : '(Upload Image / PDF)'}
                  </span>
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  onChange={(event) => handlePaymentProof(event.target.files?.[0])}
                  required={
                    selectedItem.sourceType === 'FIELD_ALLOWANCE' &&
                    !selectedItem.id.startsWith('FA-RET-') &&
                    paymentMode !== 'Cash'
                  }
                  className="form-control"
                  style={{ padding: '7px 10px', fontSize: '0.78rem' }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: paymentProofName ? '#15803D' : '#64748B',
                      fontWeight: paymentProofName ? 700 : 400,
                    }}
                  >
                    {paymentProofName
                      ? `✓ ${paymentProofName} attached`
                      : 'Attach bank transfer screenshot, UPI receipt, cash voucher, or PDF (max 3 MB).'}
                  </span>
                  {paymentProofPath && (
                    <button
                      type="button"
                      onClick={() =>
                        setProofViewer({
                          isOpen: true,
                          url: paymentProofPath,
                          title: paymentProofName || 'Attached Distribution Proof',
                        })
                      }
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0E7490',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Preview
                    </button>
                  )}
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
                  style={{
                    minWidth: '150px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Recording Payment...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>{selectedItem.id.startsWith('FA-RET-') ? 'Confirm & Settle' : 'Confirm & Disburse'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Proof Viewer Modal */}
      <ProofViewerModal
        isOpen={proofViewer.isOpen}
        onClose={() => setProofViewer({ isOpen: false, url: '', title: '' })}
        title={proofViewer.title}
        fileUrl={proofViewer.url}
      />
    </div>
  );
};
