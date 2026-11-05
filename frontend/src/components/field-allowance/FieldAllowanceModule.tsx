import React, { useState, useEffect, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  IndianRupee,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Calendar,
  MapPin,
  User,
  Receipt,
  Banknote,
  Send,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Eye,
  Briefcase,
  RotateCcw,
} from 'lucide-react';
import { FieldVisitAdvance, FieldVisitStatus, FieldVisitExpense } from '../../types/fieldAdvance';
import {
  fetchFieldVisits,
  fetchCeoMasterAnalytics,
  fetchDailyExpenses,
  submitSettlementApi,
} from '../../services/fieldAdvanceService';
import { NewFieldVisitModal } from './NewFieldVisitModal';
import { RequestAdvanceModal } from './RequestAdvanceModal';
import { ApplyClaimModal } from './ApplyClaimModal';
import { DailyExpenseModal } from './DailyExpenseModal';
import { FieldVisitDetailModal } from './FieldVisitDetailModal';
import {
  ApproveAdvanceModal,
  DisburseAdvanceModal,
} from './AdvanceActionModals';
import { ExportDropdown } from '../common/ExportDropdown';
import { downloadExcel, downloadCSV, downloadPDF, ExportColumn } from '../../utils/exportUtils';

interface FieldAllowanceModuleProps {
  openAddModal?: boolean;
  onCloseQuickAdd?: () => void;
}

export const FieldAllowanceModule: React.FC<FieldAllowanceModuleProps> = ({
  openAddModal,
  onCloseQuickAdd,
}) => {
  const { currentUser } = useHRMS();

  // Role detection
  const isCeo =
    currentUser.role === 'CEO' ||
    (currentUser as any).designation?.toLowerCase().includes('ceo') ||
    (currentUser as any).designation?.toLowerCase().includes('managing director') ||
    currentUser.employeeId === 'EMP-000' ||
    currentUser.employeeId === 'VRM-001';

  const isHr =
    !isCeo &&
    (currentUser.role?.includes('HR') ||
      currentUser.department?.toLowerCase() === 'hr' ||
      currentUser.department?.toLowerCase().includes('human resource') ||
      currentUser.designation?.toLowerCase().includes('hr'));

  const isAccounts =
    !isCeo &&
    (currentUser.role === 'Finance Manager' ||
      currentUser.role === 'Accountant' ||
      currentUser.department?.toLowerCase().includes('account') ||
      currentUser.department?.toLowerCase().includes('finance') ||
      currentUser.designation?.toLowerCase().includes('account') ||
      currentUser.designation?.toLowerCase().includes('finance'));

  const isSuperAdmin = currentUser.role === 'Super Admin' || currentUser.role === 'Admin';
  const isCeoOrHr = isCeo || isHr || isSuperAdmin;
  const isPrivileged = isCeo || isHr || isAccounts || isSuperAdmin;

  // View state: 'employee' | 'ceo_master' | 'approvals' | 'accounts'
  const [currentView, setCurrentView] = useState<'employee' | 'ceo_master' | 'approvals' | 'accounts'>(
    isCeo ? 'ceo_master' : isAccounts ? 'accounts' : 'employee'
  );

  // Employee Sub-tabs
  const [employeeTab, setEmployeeTab] = useState<'dashboard' | 'my_requests' | 'my_expenses' | 'pending' | 'history'>('dashboard');

  // CEO Sub-tabs
  const [ceoTab, setCeoTab] = useState<'overview' | 'daily_expenses' | 'consolidated_claims'>('overview');

  // Approvals Sub-tabs
  const [approvalTab, setApprovalTab] = useState<'pending' | 'approved' | 'rejected' | 'history'>('pending');

  // Accounts Sub-tabs
  const [accountsTab, setAccountsTab] = useState<'advances' | 'reimbursements' | 'collections' | 'completed' | 'history'>('advances');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() => new Date().getFullYear());

  // Data
  const [visits, setVisits] = useState<FieldVisitAdvance[]>([]);
  const [dailyExpenses, setDailyExpenses] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive Selection for CEO Detail View & Employee Active Trip
  const [selectedCeoVisitId, setSelectedCeoVisitId] = useState<string | null>(null);
  const [selectedEmployeeTripId, setSelectedEmployeeTripId] = useState<string | null>(null);

  // Modals state
  const [showNewFieldVisitModal, setShowNewFieldVisitModal] = useState(false);
  const [showRequestAdvanceModal, setShowRequestAdvanceModal] = useState(false);
  const [showApplyClaimModal, setShowApplyClaimModal] = useState(false);
  const [showAddDailyExpenseModal, setShowAddDailyExpenseModal] = useState(false);
  const [activeExpenseAdvanceId, setActiveExpenseAdvanceId] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Action Modals
  const [actionVisit, setActionVisit] = useState<FieldVisitAdvance | null>(null);
  const [showApproveAdvanceModal, setShowApproveAdvanceModal] = useState(false);
  const [showDisburseAdvanceModal, setShowDisburseAdvanceModal] = useState(false);

  useEffect(() => {
    if (openAddModal && !isCeo) {
      setShowNewFieldVisitModal(true);
      onCloseQuickAdd?.();
    }
  }, [openAddModal, isCeo]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [visitsData, expensesData] = await Promise.all([
        fetchFieldVisits(),
        fetchDailyExpenses(),
      ]);
      setVisits(visitsData);
      setDailyExpenses(expensesData);

      if (isCeo || isHr || isAccounts || isSuperAdmin) {
        try {
          const analyticsData = await fetchCeoMasterAnalytics();
          setAnalytics(analyticsData);
        } catch {
          // ignore if employee
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load field allowance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentView]);

  // User identity for scoping
  const userEmpId = (currentUser.employeeId || currentUser.id || '').trim().toLowerCase();
  const userAuthId = (currentUser.id || '').trim().toLowerCase();
  const userName = (currentUser.name || '').trim().toLowerCase();

  const isUserClaim = (visit: FieldVisitAdvance) => {
    const vEmpId = (visit.employee_id || '').trim().toLowerCase();
    const vEmpCode = (visit.employee_code || '').trim().toLowerCase();
    const vEmpName = (visit.employee_name || '').trim().toLowerCase();

    if (userEmpId && (vEmpId === userEmpId || vEmpCode === userEmpId)) return true;
    if (userAuthId && (vEmpId === userAuthId || vEmpCode === userAuthId)) return true;
    if (userName && vEmpName && vEmpName === userName) return true;
    return false;
  };

  const isHrEmployeeClaim = (visit: FieldVisitAdvance) => {
    const dept = (visit.department_name || '').toLowerCase();
    const name = (visit.employee_name || '').toLowerCase();
    return dept === 'hr' || dept.includes('human resource') || name.includes(' hr');
  };

  // Employee's own visits
  const myVisits = useMemo(() => visits.filter(isUserClaim), [visits, userEmpId, userAuthId, userName]);

  // Set default selected employee trip & CEO trip when visits change
  useEffect(() => {
    if (myVisits.length > 0 && (!selectedEmployeeTripId || !myVisits.some(v => v.id === selectedEmployeeTripId))) {
      const activeTrip = myVisits.find(v => ['Active', 'Advance Disbursed', 'Pending Advance Approval', 'Settlement Submitted', 'Pending Reimbursement', 'Pending Balance Collection'].includes(v.status)) || myVisits[0];
      setSelectedEmployeeTripId(activeTrip.id);
    }
  }, [myVisits, selectedEmployeeTripId]);

  // Date range filter helper (Month & Year)
  const matchesDateRange = (dateStr?: string) => {
    if (!dateStr || (selectedMonth === 'all' && selectedYear === 'all')) return true;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;
    if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) {
      return false;
    }
    if (selectedMonth !== 'all' && d.getMonth() + 1 !== Number(selectedMonth)) {
      return false;
    }
    return true;
  };

  // CEO Filtered Visits
  const ceoFilteredVisits = useMemo(() => {
    return visits.filter(v => {
      if (!matchesDateRange(v.start_date || v.created_at)) return false;
      if (departmentFilter !== 'ALL' && (v.department_name || '') !== departmentFilter) return false;
      if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          v.request_number.toLowerCase().includes(q) ||
          v.purpose.toLowerCase().includes(q) ||
          (v.employee_name || '').toLowerCase().includes(q) ||
          (v.destination || '').toLowerCase().includes(q) ||
          (v.department_name || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [visits, selectedMonth, selectedYear, departmentFilter, statusFilter, searchQuery]);

  useEffect(() => {
    if (ceoFilteredVisits.length > 0 && (!selectedCeoVisitId || !ceoFilteredVisits.some(v => v.id === selectedCeoVisitId))) {
      setSelectedCeoVisitId(ceoFilteredVisits[0].id);
    }
  }, [ceoFilteredVisits, selectedCeoVisitId]);

  const selectedCeoVisit = useMemo(
    () => ceoFilteredVisits.find(v => v.id === selectedCeoVisitId) || ceoFilteredVisits[0] || null,
    [ceoFilteredVisits, selectedCeoVisitId]
  );

  const selectedCeoVisitExpenses = useMemo(() => {
    if (!selectedCeoVisit) return [];
    return dailyExpenses.filter(e => e.advance_id === selectedCeoVisit.id);
  }, [dailyExpenses, selectedCeoVisit]);

  const selectedEmployeeTrip = useMemo(
    () => myVisits.find(v => v.id === selectedEmployeeTripId) || myVisits[0] || null,
    [myVisits, selectedEmployeeTripId]
  );

  const selectedEmployeeTripExpenses = useMemo(() => {
    if (!selectedEmployeeTrip) return [];
    return dailyExpenses.filter(e => e.advance_id === selectedEmployeeTrip.id);
  }, [dailyExpenses, selectedEmployeeTrip]);

  // Employee Aggregate KPIs
  const employeeKpis = useMemo(() => {
    const allocated = myVisits.reduce((sum, v) => sum + Number(v.disbursed_amount || 0), 0);
    const spent = myVisits.reduce((sum, v) => sum + Number(v.expenses_total || 0), 0);
    const balance = allocated - spent;
    return { allocated, spent, balance };
  }, [myVisits]);

  // CEO Dynamic KPIs based on filtered visits
  const ceoComputedKpis = useMemo(() => {
    const members = new Set(ceoFilteredVisits.map(v => v.employee_id || v.employee_code || v.employee_name)).size;
    const allocated = ceoFilteredVisits.reduce((s, v) => s + Number(v.disbursed_amount || 0), 0);
    const spent = ceoFilteredVisits.reduce((s, v) => s + Number(v.expenses_total || 0), 0);
    const pendingDisbursements = ceoFilteredVisits
      .filter(v => v.status === 'Advance Approved')
      .reduce((s, v) => s + Number(v.approved_amount || v.requested_amount || 0), 0);
    const pendingReturns = ceoFilteredVisits.reduce((s, v) => {
      if (v.return_due && v.return_due > 0 && v.status !== 'Completed') return s + Number(v.return_due);
      const diff = Number(v.disbursed_amount || 0) - Number(v.expenses_total || 0);
      if (diff > 0 && v.status !== 'Completed') return s + diff;
      return s;
    }, 0);
    const pendingReimbursements = ceoFilteredVisits.reduce((s, v) => {
      if (v.reimbursement_due && v.reimbursement_due > 0 && v.status !== 'Completed') return s + Number(v.reimbursement_due);
      const diff = Number(v.disbursed_amount || 0) - Number(v.expenses_total || 0);
      if (diff < 0 && v.status !== 'Completed') return s + Math.abs(diff);
      return s;
    }, 0);
    const totalPendingAmount = pendingDisbursements + pendingReturns + pendingReimbursements;
    const pendingApprovalsCount = ceoFilteredVisits.filter(v =>
      ['Pending Advance Approval', 'Settlement Submitted'].includes(v.status)
    ).length;

    return {
      members,
      visitsCount: ceoFilteredVisits.length,
      allocated,
      spent,
      pendingDisbursements,
      pendingReturns,
      pendingReimbursements,
      totalPendingAmount,
      pendingApprovalsCount,
    };
  }, [ceoFilteredVisits]);

  // Filtered Visits for Table Views
  const filteredVisits = useMemo(() => {
    return visits.filter(visit => {
      if (!matchesDateRange(visit.start_date || visit.created_at)) return false;
      if (currentView === 'employee') {
        if (!isUserClaim(visit)) return false;
        if (employeeTab === 'my_requests') {
          if (visit.funding_type !== 'advance' && visit.status === 'Completed') return false;
        } else if (employeeTab === 'pending') {
          const isPending = [
            'Pending Advance Approval',
            'Advance Approved',
            'Settlement Submitted',
            'Pending Balance Collection',
            'Partially Collected',
            'Pending Reimbursement',
            'Partially Reimbursed',
          ].includes(visit.status);
          if (!isPending) return false;
        } else if (employeeTab === 'history') {
          const isHistory = ['Completed', 'Advance Rejected', 'Cancelled'].includes(visit.status);
          if (!isHistory) return false;
        }
      } else if (currentView === 'approvals') {
        if (approvalTab === 'pending') {
          if (!['Pending Advance Approval', 'Settlement Submitted'].includes(visit.status)) return false;
        } else if (approvalTab === 'approved') {
          if (!['Advance Approved', 'Advance Disbursed', 'Active', 'Pending Balance Collection', 'Pending Reimbursement'].includes(visit.status)) return false;
        } else if (approvalTab === 'rejected') {
          if (visit.status !== 'Advance Rejected') return false;
        }
      } else if (currentView === 'accounts') {
        if (accountsTab === 'advances') {
          if (visit.status !== 'Advance Approved') return false;
        } else if (accountsTab === 'collections') {
          if (!['Pending Balance Collection', 'Partially Collected'].includes(visit.status)) return false;
        } else if (accountsTab === 'reimbursements') {
          if (!['Pending Reimbursement', 'Partially Reimbursed'].includes(visit.status)) return false;
        } else if (accountsTab === 'completed') {
          if (visit.status !== 'Completed') return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          visit.request_number.toLowerCase().includes(q) ||
          visit.purpose.toLowerCase().includes(q) ||
          (visit.employee_name || '').toLowerCase().includes(q) ||
          (visit.client_name || '').toLowerCase().includes(q) ||
          (visit.destination || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [visits, currentView, employeeTab, approvalTab, accountsTab, searchQuery, selectedMonth, selectedYear, userEmpId, userAuthId, userName]);

  // Filtered Daily Expenses
  const filteredDailyExpenses = useMemo(() => {
    return dailyExpenses.filter(exp => {
      if (currentView === 'employee') {
        const parentVisit = visits.find(v => v.id === exp.advance_id);
        if (!parentVisit || !isUserClaim(parentVisit)) return false;
      }
      if (categoryFilter !== 'ALL' && exp.category !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && exp.approval_status !== statusFilter) return false;
      if (!matchesDateRange(exp.expense_date)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          (exp.description || '').toLowerCase().includes(q) ||
          (exp.employee_name || '').toLowerCase().includes(q) ||
          (exp.category || '').toLowerCase().includes(q) ||
          (exp.request_number || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [dailyExpenses, visits, currentView, categoryFilter, statusFilter, selectedMonth, selectedYear, searchQuery]);

  // Format signed balance string (+₹1,000 / −₹1,000 / ₹0)
  const formatSignedBalance = (balance: number) => {
    if (balance > 0) return `+₹${balance.toLocaleString('en-IN')}`;
    if (balance < 0) return `−₹${Math.abs(balance).toLocaleString('en-IN')}`;
    return '₹0';
  };

  const getBalanceDisplay = (visit: FieldVisitAdvance) => {
    const advance = Number(visit.disbursed_amount || 0);
    const expenses = Number(visit.expenses_total || 0);
    const provisional = advance - expenses;

    if (visit.return_due && visit.return_due > 0) {
      return {
        label: `+₹${visit.return_due.toLocaleString('en-IN')} (Return Due)`,
        color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      };
    }
    if (visit.reimbursement_due && visit.reimbursement_due > 0) {
      return {
        label: `−₹${visit.reimbursement_due.toLocaleString('en-IN')} (Reimburse Due)`,
        color: 'text-rose-700 bg-rose-50 border-rose-200',
      };
    }
    if (provisional > 0) {
      return {
        label: `+₹${provisional.toLocaleString('en-IN')} (Unused Balance)`,
        color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      };
    } else if (provisional < 0) {
      return {
        label: `−₹${Math.abs(provisional).toLocaleString('en-IN')} (Overspent / Claim)`,
        color: 'text-rose-700 bg-rose-50 border-rose-200',
      };
    }
    return {
      label: '₹0 (Settled)',
      color: 'text-slate-600 bg-slate-50 border-slate-200',
    };
  };

  const getStatusBadge = (status: FieldVisitStatus) => {
    switch (status) {
      case 'Pending Advance Approval':
        return { label: 'Pending Advance Approval', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'Settlement Submitted':
        return { label: 'Pending Expense Approval', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'Advance Approved':
        return { label: 'Advance Approved', bg: 'bg-teal-50 text-teal-700 border-teal-200' };
      case 'Advance Disbursed':
      case 'Active':
        return { label: 'In Progress', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'Pending Balance Collection':
      case 'Partially Collected':
        return { label: 'Balance Return Pending', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'Pending Reimbursement':
      case 'Partially Reimbursed':
        return { label: 'Reimbursement Pending', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'Completed':
        return { label: 'Completed', bg: 'bg-emerald-50 text-emerald-800 border-emerald-300' };
      case 'Advance Rejected':
        return { label: 'Rejected', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'Settlement Correction Requested':
      case 'Advance Correction Requested':
        return { label: 'Clarification Needed', bg: 'bg-orange-50 text-orange-700 border-orange-200' };
      default:
        return { label: status, bg: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  // Export Reports (Excel, CSV, PDF)
  const handleExportReport = (reportType: string, format: 'xlsx' | 'csv' | 'pdf' = 'xlsx') => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const runExport = (rows: any[], filenameBase: string, cols: ExportColumn[], reportTitle: string) => {
      if (format === 'csv') {
        downloadCSV(rows, `${filenameBase}_${timestamp}.csv`, cols);
      } else if (format === 'pdf') {
        downloadPDF(rows, reportTitle, `${filenameBase}_${timestamp}.pdf`, cols);
      } else {
        downloadExcel(rows, `${filenameBase}_${timestamp}.xlsx`, cols);
      }
    };

    if (reportType === 'daily_expenses') {
      const cols: ExportColumn[] = [
        { key: 'expense_date', label: 'Date' },
        { key: 'employee_name', label: 'Employee' },
        { key: 'department_name', label: 'Department' },
        { key: 'request_number', label: 'Trip ID' },
        { key: 'purpose', label: 'Trip / Purpose' },
        { key: 'category', label: 'Category' },
        { key: 'amount', label: 'Amount (₹)' },
        { key: 'description', label: 'Description' },
        { key: 'approval_status', label: 'Status' },
      ];
      runExport(filteredDailyExpenses, 'Field_Allowance_Daily_Expenses', cols, 'Field Allowance — Daily Expenses Report');
    } else if (reportType === 'selected_employee' && selectedCeoVisit) {
      const rows = selectedCeoVisitExpenses.map(e => ({
        employee_name: selectedCeoVisit.employee_name,
        department_name: selectedCeoVisit.department_name,
        trip: `${selectedCeoVisit.purpose} (${selectedCeoVisit.destination})`,
        allocated: selectedCeoVisit.disbursed_amount || 0,
        spent_total: selectedCeoVisit.expenses_total || 0,
        balance: (selectedCeoVisit.disbursed_amount || 0) - (selectedCeoVisit.expenses_total || 0),
        expense_date: e.expense_date,
        category: e.category,
        amount: e.amount,
        description: e.description,
        proof: e.receipt_url ? 'Yes' : 'No',
        status: selectedCeoVisit.status,
      }));
      const cols: ExportColumn[] = [
        { key: 'employee_name', label: 'Employee' },
        { key: 'department_name', label: 'Department' },
        { key: 'trip', label: 'Trip' },
        { key: 'allocated', label: 'Allocated (₹)' },
        { key: 'spent_total', label: 'Total Spent (₹)' },
        { key: 'balance', label: 'Balance (₹)' },
        { key: 'expense_date', label: 'Expense Date' },
        { key: 'category', label: 'Expense Category' },
        { key: 'amount', label: 'Expense Amount (₹)' },
        { key: 'description', label: 'Description' },
        { key: 'proof', label: 'Proof Uploaded' },
        { key: 'status', label: 'Status' },
      ];
      runExport(
        rows,
        `${(selectedCeoVisit.employee_name || 'Employee').replace(/\s+/g, '_')}_Field_Report`,
        cols,
        `Field Allowance Report — ${selectedCeoVisit.employee_name}`
      );
    } else {
      const targetList = currentView === 'ceo_master' ? ceoFilteredVisits : filteredVisits;
      const rows = targetList.map(v => ({
        ...v,
        balance: (v.disbursed_amount || 0) - (v.expenses_total || 0),
      }));
      const cols: ExportColumn[] = [
        { key: 'request_number', label: 'Trip ID' },
        { key: 'employee_name', label: 'Employee' },
        { key: 'department_name', label: 'Department' },
        { key: 'purpose', label: 'Purpose' },
        { key: 'destination', label: 'Destination' },
        { key: 'start_date', label: 'Start Date' },
        { key: 'end_date', label: 'End Date' },
        { key: 'funding_type', label: 'Funding Type' },
        { key: 'requested_amount', label: 'Requested Advance (₹)' },
        { key: 'disbursed_amount', label: 'Allocated Advance (₹)' },
        { key: 'expenses_total', label: 'Spent Amount (₹)' },
        { key: 'balance', label: 'Balance (₹)' },
        { key: 'status', label: 'Status' },
      ];
      runExport(rows, 'Field_Allowance_Summary_Report', cols, 'Field Allowance & Claims Summary Report');
    }
  };

  const uniqueDepartments = useMemo(() => {
    const set = new Set<string>();
    visits.forEach(v => {
      if (v.department_name) set.add(v.department_name);
    });
    return Array.from(set);
  }, [visits]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '50px' }}>
      {/* ========================================================= */}
      {/* 1. TOP HEADER & ACTION BAR                                */}
      {/* ========================================================= */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {currentView === 'employee' ? 'My Field Allowance' : 'Field Allowance & Claims'}
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
            {isCeo
              ? 'CEO Dashboard · HRMS — Monitor company-wide field advances, daily expense proofs & settlements'
              : isAccounts && currentView === 'accounts'
              ? 'Accounts Settlement Desk — Disburse approved advances, collect unused balances & pay reimbursements'
              : 'Track allocated field advances, record daily trip expenses with proof, and settle balances or reimbursements'}
          </p>
        </div>

        {/* Right Controls: Strictly NO claim/advance creation options for CEO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {currentView === 'ceo_master' && (
            <>
              {/* Calendar Month & Year Picker Button + Popup */}
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  type="button"
                  onClick={() => setShowMonthYearPicker((prev) => !prev)}
                  title={
                    selectedMonth === 'all' && selectedYear === 'all'
                      ? 'Select Month & Year'
                      : selectedMonth !== 'all' && selectedYear !== 'all'
                      ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(selectedMonth) - 1]} ${selectedYear}`
                      : selectedMonth !== 'all'
                      ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(selectedMonth) - 1]}`
                      : `Year ${selectedYear}`
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    padding: 0,
                    borderRadius: '10px',
                    border: selectedMonth !== 'all' || selectedYear !== 'all' ? '1.5px solid #0E7490' : '1px solid #CBD5E1',
                    background: selectedMonth !== 'all' || selectedYear !== 'all' ? '#ECFEFF' : '#FFFFFF',
                    color: '#0E7490',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <Calendar size={17} style={{ color: '#0E7490' }} />
                </button>

                {showMonthYearPicker && (
                  <>
                    <div
                      onClick={() => setShowMonthYearPicker(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 1040 }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        right: 0,
                        zIndex: 1050,
                        width: '250px',
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      {/* Year Selector Header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 6px',
                          background: '#F8FAFC',
                          borderRadius: '8px',
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setPickerYear((y) => y - 1)}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#FFFFFF',
                            color: '#334155',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          }}
                        >
                          ‹
                        </button>
                        <span
                          onClick={() => {
                            setSelectedYear(String(pickerYear));
                            setSelectedMonth('all');
                            setShowMonthYearPicker(false);
                          }}
                          title="Click to filter entire year"
                          style={{
                            fontSize: '0.9rem',
                            fontWeight: 800,
                            color: '#0F172A',
                            cursor: 'pointer',
                          }}
                        >
                          {pickerYear}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPickerYear((y) => y + 1)}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#FFFFFF',
                            color: '#334155',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          }}
                        >
                          ›
                        </button>
                      </div>

                      {/* 3x4 Month Grid */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '6px',
                        }}
                      >
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((mLabel, idx) => {
                          const mNum = String(idx + 1);
                          const isSelected = selectedMonth === mNum && selectedYear === String(pickerYear);
                          return (
                            <button
                              key={mLabel}
                              type="button"
                              onClick={() => {
                                setSelectedMonth(mNum);
                                setSelectedYear(String(pickerYear));
                                setShowMonthYearPicker(false);
                              }}
                              style={{
                                padding: '7px 4px',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                border: isSelected ? '1px solid #0E7490' : '1px solid #F1F5F9',
                                background: isSelected ? '#0E7490' : '#F8FAFC',
                                color: isSelected ? '#FFFFFF' : '#334155',
                                cursor: 'pointer',
                              }}
                            >
                              {mLabel}
                            </button>
                          );
                        })}
                      </div>

                      {/* Quick Actions Footer */}
                      <div style={{ display: 'flex', gap: '6px', paddingTop: '6px', borderTop: '1px solid #F1F5F9' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            setPickerYear(now.getFullYear());
                            setSelectedYear(String(now.getFullYear()));
                            setSelectedMonth(String(now.getMonth() + 1));
                            setShowMonthYearPicker(false);
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            borderRadius: '7px',
                            border: '1px solid #CBD5E1',
                            background: '#FFFFFF',
                            color: '#0E7490',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          This Month
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMonth('all');
                            setSelectedYear('all');
                            setShowMonthYearPicker(false);
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            borderRadius: '7px',
                            border: '1px solid #CBD5E1',
                            background: '#F8FAFC',
                            color: '#475569',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          All Time
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <ExportDropdown
                label="Download"
                onExportExcel={() => handleExportReport('summary', 'xlsx')}
                onExportPDF={() => handleExportReport('summary', 'pdf')}
                onExportCSV={() => handleExportReport('summary', 'csv')}
              />
            </>
          )}

          {!isCeo && (
            <>
              <button
                type="button"
                onClick={() => setShowNewFieldVisitModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 16px',
                  background: '#FFFFFF',
                  color: '#0E7490',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  border: '1.5px solid #0E7490',
                  cursor: 'pointer',
                }}
              >
                <MapPin size={16} />
                <span>New Field Visit (Advance / No Advance)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowApplyClaimModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  background: '#0E7490',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(14, 116, 144, 0.25)',
                }}
              >
                <Plus size={16} />
                <span>Submit Expense Claim</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. ROLE PERSPECTIVE SWITCHER (HR / ACCOUNTS ONLY)         */}
      {/* ========================================================= */}
      {isPrivileged && !isCeo && !isSuperAdmin && (
        <div
          style={{
            display: 'inline-flex',
            background: '#F1F5F9',
            padding: '4px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            width: 'fit-content',
            flexWrap: 'wrap',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setCurrentView('employee')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.83rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: currentView === 'employee' ? '#0E7490' : 'transparent',
              color: currentView === 'employee' ? '#FFFFFF' : '#475569',
            }}
          >
            My Field Allowance
          </button>

          {isHr && (
            <button
              type="button"
              onClick={() => setCurrentView('approvals')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.83rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: currentView === 'approvals' ? '#0E7490' : 'transparent',
                color: currentView === 'approvals' ? '#FFFFFF' : '#475569',
              }}
            >
              Approval Inbox ({visits.filter(v => ['Pending Advance Approval', 'Settlement Submitted'].includes(v.status)).length})
            </button>
          )}

          {isAccounts && (
            <button
              type="button"
              onClick={() => setCurrentView('accounts')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.83rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: currentView === 'accounts' ? '#0E7490' : 'transparent',
                color: currentView === 'accounts' ? '#FFFFFF' : '#475569',
              }}
            >
              Accounts Settlement Desk
            </button>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. CEO FIELD ALLOWANCE OVERVIEW (MATCHES REFERENCE HTML)  */}
      {/* ========================================================= */}
      {currentView === 'ceo_master' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 6 UNIFORM COMPACT KPI CARDS (3 + 3 SMALL CARDS, IDENTICAL SIZE) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
              }}
            >
              {/* Card 1: Total Allocated Members */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Total Allocated Members</div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{ceoComputedKpis.visitsCount} field visits in selected period</div>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#2563EB', whiteSpace: 'nowrap' }}>
                  {ceoComputedKpis.members}
                </div>
              </div>

              {/* Card 2: Total Allocated Amount */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Total Allocated Amount</div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Advance disbursed by Accounts</div>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
                  ₹{ceoComputedKpis.allocated.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Card 3: Total Spent Amount */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Total Spent Amount</div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Recorded daily field expenses</div>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
                  ₹{ceoComputedKpis.spent.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
              }}
            >
              {/* Card 4: Pending Approvals */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Pending Approvals</div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Awaiting CEO / HR verification</div>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#D97706', whiteSpace: 'nowrap' }}>
                  {ceoComputedKpis.pendingApprovalsCount}
                </div>
              </div>

              {/* Card 5: Potential Returns */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Potential Returns</div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Unused advance to return to Accounts</div>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669', whiteSpace: 'nowrap' }}>
                  +₹{ceoComputedKpis.pendingReturns.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Card 6: Potential Reimbursements */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Potential Reimbursements</div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Overspent / own money owed to staff</div>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#DC2626', whiteSpace: 'nowrap' }}>
                  −₹{ceoComputedKpis.pendingReimbursements.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>

          {/* CEO Mode Sub-tabs + Filters */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {([
                { id: 'overview', label: 'Employee Field Visits & Detail View' },
                { id: 'daily_expenses', label: `All Daily Expenses (${filteredDailyExpenses.length})` },
                { id: 'consolidated_claims', label: `All Claims Table (${ceoFilteredVisits.length})` },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCeoTab(tab.id)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: ceoTab === tab.id ? '#0E7490' : '#F1F5F9',
                    color: ceoTab === tab.id ? '#FFFFFF' : '#475569',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.78rem', background: '#FFFFFF' }}
              >
                <option value="ALL">All Departments</option>
                {uniqueDepartments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <div style={{ position: 'relative', width: '210px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                <input
                  type="text"
                  placeholder="Search employee or trip..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 30px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.78rem',
                    outline: 'none',
                    background: '#FFFFFF',
                  }}
                />
              </div>
            </div>
          </div>

          {/* CEO INTERACTIVE OVERVIEW: 2-COLUMN EMPLOYEE CARDS + DETAIL VIEW */}
          {ceoTab === 'overview' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B' }}>
                  Employee Field Visits
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Click any employee card to inspect their daily expense report below
                </span>
              </div>

              {ceoFilteredVisits.length === 0 ? (
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '40px', textAlign: 'center', color: '#64748B' }}>
                  No field allowance visits match the current filter.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                    gap: '14px',
                  }}
                >
                  {ceoFilteredVisits.map(visit => {
                    const allocated = Number(visit.disbursed_amount || 0);
                    const spent = Number(visit.expenses_total || 0);
                    const balance = allocated - spent;
                    const isSelected = selectedCeoVisit?.id === visit.id;
                    const st = getStatusBadge(visit.status);
                    const initials = (visit.employee_name || 'EM')
                      .split(' ')
                      .map(p => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div
                        key={visit.id}
                        onClick={() => setSelectedCeoVisitId(visit.id)}
                        style={{
                          background: '#FFFFFF',
                          borderRadius: '14px',
                          padding: '16px 18px',
                          border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                          boxShadow: isSelected ? '0 0 0 3px rgba(37, 99, 235, 0.12)' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: '#EFF6FF',
                                color: '#2563EB',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A' }}>
                                {visit.employee_name}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                {visit.department_name || 'Operations'} · Trip: {visit.destination || visit.purpose}
                              </div>
                            </div>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${st.bg}`}>
                            {st.label}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '8px',
                            paddingTop: '12px',
                            borderTop: '1px solid #F1F5F9',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Allocated</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                              ₹{allocated.toLocaleString('en-IN')}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Spent</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                              ₹{spent.toLocaleString('en-IN')}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Balance</div>
                            <div
                              style={{
                                fontSize: '0.95rem',
                                fontWeight: 800,
                                marginTop: '2px',
                                color: balance > 0 ? '#059669' : balance < 0 ? '#DC2626' : '#475569',
                              }}
                            >
                              {formatSignedBalance(balance)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SELECTED EMPLOYEE DAILY REPORT — DETAIL VIEW */}
              {selectedCeoVisit && (() => {
                const allocated = Number(selectedCeoVisit.disbursed_amount || 0);
                const spent = Number(selectedCeoVisit.expenses_total || 0);
                const balance = allocated - spent;
                const st = getStatusBadge(selectedCeoVisit.status);

                return (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B' }}>
                        Employee Daily Report — Detail View
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        Showing: <strong>{selectedCeoVisit.employee_name}</strong> ({selectedCeoVisit.request_number})
                      </span>
                    </div>

                    <div
                      style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '22px',
                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                            {selectedCeoVisit.employee_name} — Field Allowance
                          </h3>
                          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                            Trip: {selectedCeoVisit.destination} ({selectedCeoVisit.purpose}) · {selectedCeoVisit.start_date} to {selectedCeoVisit.end_date}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${st.bg}`}>
                          {st.label}
                        </span>
                      </div>

                      {/* 3 KPI Boxes */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                          gap: '12px',
                          paddingBottom: '18px',
                          borderBottom: '1px solid #E2E8F0',
                        }}
                      >
                        <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Allocated Amount</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                            ₹{allocated.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Spent Amount</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                            ₹{spent.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Balance</div>
                          <div
                            style={{
                              fontSize: '1.35rem',
                              fontWeight: 800,
                              marginTop: '4px',
                              color: balance > 0 ? '#059669' : balance < 0 ? '#DC2626' : '#0F172A',
                            }}
                          >
                            {formatSignedBalance(balance)}
                          </div>
                        </div>
                      </div>

                      {/* Daily Expense Report List */}
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>Daily Expense Report</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: '999px', background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                            Proof Verified
                          </span>
                        </div>

                        {selectedCeoVisitExpenses.length === 0 ? (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem', background: '#F8FAFC', borderRadius: '10px' }}>
                            No daily expenses recorded for this trip yet.
                          </div>
                        ) : (
                          <div>
                            {selectedCeoVisitExpenses.map(exp => (
                              <div
                                key={exp.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '11px 0',
                                  borderBottom: '1px solid #F1F5F9',
                                  fontSize: '0.86rem',
                                }}
                              >
                                <div>
                                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{exp.category}</span>
                                  <span style={{ color: '#64748B', fontSize: '0.78rem', marginLeft: '8px' }}>
                                    {exp.description} ({exp.expense_date})
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, color: '#0F172A' }}>
                                  <span>₹{Number(exp.amount).toLocaleString('en-IN')}</span>
                                  {exp.receipt_url ? (
                                    <a
                                      href={exp.receipt_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="View Uploaded Receipt Proof"
                                      style={{
                                        width: '22px',
                                        height: '22px',
                                        borderRadius: '6px',
                                        background: '#ECFDF5',
                                        border: '1px solid #A7F3D0',
                                        color: '#059669',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.72rem',
                                        textDecoration: 'none',
                                      }}
                                    >
                                      ✓
                                    </a>
                                  ) : (
                                    <span
                                      title="Receipt proof pending"
                                      style={{
                                        width: '22px',
                                        height: '22px',
                                        borderRadius: '6px',
                                        background: '#ECFDF5',
                                        border: '1px solid #A7F3D0',
                                        color: '#059669',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.72rem',
                                      }}
                                    >
                                      ✓
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: '12px',
                            marginTop: '4px',
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            color: '#0F172A',
                          }}
                        >
                          <span>Total Spent</span>
                          <span>₹{spent.toLocaleString('en-IN')}</span>
                        </div>

                        {/* Settlement Callout */}
                        <div
                          style={{
                            marginTop: '14px',
                            padding: '12px 14px',
                            borderRadius: '12px',
                            background: balance < 0 ? '#FEF2F2' : balance > 0 ? '#ECFDF5' : '#EFF6FF',
                            border: balance < 0 ? '1px solid #FECACA' : balance > 0 ? '1px solid #A7F3D0' : '1px solid #BFDBFE',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                          }}
                        >
                          <AlertCircle
                            size={17}
                            style={{
                              color: balance < 0 ? '#DC2626' : balance > 0 ? '#059669' : '#2563EB',
                              flexShrink: 0,
                              marginTop: '2px',
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0F172A' }}>
                              {balance < 0
                                ? `Reimbursement Required: ₹${Math.abs(balance).toLocaleString('en-IN')}`
                                : balance > 0
                                ? `Returnable Balance: ₹${balance.toLocaleString('en-IN')}`
                                : 'Exact Spend: ₹0 Settlement Difference'}
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '2px' }}>
                              {balance < 0
                                ? 'Employee spent more than advance (or used own money). Subject to expense approval; payment released by Accounts.'
                                : balance > 0
                                ? 'Employee spent less than advance. Unused balance to be returned to Accounts and confirmed.'
                                : 'Allocated advance matches recorded expenses.'}
                            </div>
                          </div>
                        </div>

                        {/* CEO Detail Action Buttons */}
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVisitId(selectedCeoVisit.id);
                              setShowDetailModal(true);
                            }}
                            style={{
                              padding: '9px 16px',
                              borderRadius: '10px',
                              border: 'none',
                              background: '#2563EB',
                              color: '#FFFFFF',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                            }}
                          >
                            Review & Verify Claim Details
                          </button>

                          {selectedCeoVisit.status === 'Pending Advance Approval' && (
                            <button
                              type="button"
                              onClick={() => {
                                setActionVisit(selectedCeoVisit);
                                setShowApproveAdvanceModal(true);
                              }}
                              style={{
                                padding: '9px 16px',
                                borderRadius: '10px',
                                border: 'none',
                                background: '#059669',
                                color: '#FFFFFF',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                              }}
                            >
                              Approve / Reject Advance
                            </button>
                          )}

                          <ExportDropdown
                            label="Download"
                            onExportExcel={() => handleExportReport('selected_employee', 'xlsx')}
                            onExportPDF={() => handleExportReport('selected_employee', 'pdf')}
                            onExportCSV={() => handleExportReport('selected_employee', 'csv')}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* CEO All Daily Expenses Tab */}
          {ceoTab === 'daily_expenses' && (
            <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0F172A' }}>
                  All Employee Daily Expense Records ({filteredDailyExpenses.length})
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  >
                    <option value="ALL">All Categories</option>
                    <option value="Travel">Travel</option>
                    <option value="Bus">Bus</option>
                    <option value="Train">Train</option>
                    <option value="Taxi / Auto">Taxi / Auto</option>
                    <option value="Fuel">Fuel</option>
                    <option value="Food">Food</option>
                    <option value="Accommodation / Room">Accommodation / Room</option>
                    <option value="Parking">Parking</option>
                    <option value="Toll">Toll</option>
                    <option value="Other">Other</option>
                  </select>
                  <ExportDropdown
                    label="Download"
                    onExportExcel={() => handleExportReport('daily_expenses', 'xlsx')}
                    onExportPDF={() => handleExportReport('daily_expenses', 'pdf')}
                    onExportCSV={() => handleExportReport('daily_expenses', 'csv')}
                  />
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Date</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Employee</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Department</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Category</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Description</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Amount</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Proof</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDailyExpenses.map(exp => (
                      <tr key={exp.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px' }}>{exp.expense_date}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>{exp.employee_name}</td>
                        <td style={{ padding: '10px 14px', color: '#64748B' }}>{exp.department_name}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {exp.category}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>{exp.description}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0F172A' }}>
                          ₹{Number(exp.amount).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {exp.receipt_url ? (
                            <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0E7490', fontWeight: 700 }}>
                              View Proof
                            </a>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {exp.approval_status || 'Recorded'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CEO Consolidated Claims Table */}
          {ceoTab === 'consolidated_claims' && (
            <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Trip ID</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Employee</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Trip & Destination</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Allocated</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Spent</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Balance</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ceoFilteredVisits.map(visit => {
                    const bal = getBalanceDisplay(visit);
                    const st = getStatusBadge(visit.status);
                    return (
                      <tr key={visit.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700 }}>{visit.request_number}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          {visit.employee_name}
                          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>{visit.department_name}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600 }}>{visit.purpose}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{visit.destination}</div>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>₹{(visit.disbursed_amount || 0).toLocaleString('en-IN')}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>₹{(visit.expenses_total || 0).toLocaleString('en-IN')}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${bal.color}`}>{bal.label}</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${st.bg}`}>{st.label}</span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVisitId(visit.id);
                              setShowDetailModal(true);
                            }}
                            style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
                          >
                            Review Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. EMPLOYEE / APPROVALS / ACCOUNTS VIEW                   */}
      {/* ========================================================= */}
      {currentView !== 'ceo_master' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* EMPLOYEE 3 KPI CARDS + INTERACTIVE MY FIELD ALLOWANCE CARD */}
          {currentView === 'employee' && (
            <>
              {/* 3 Top Summary Cards: Allocated Amount, Spent Amount, Balance */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '14px',
                }}
              >
                <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Allocated Amount
                  </span>
                  <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                    ₹{employeeKpis.allocated.toLocaleString('en-IN')}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Actual advance disbursed by Accounts</span>
                </div>

                <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Spent Amount
                  </span>
                  <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                    ₹{employeeKpis.spent.toLocaleString('en-IN')}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Total recorded daily field expenses</span>
                </div>

                <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Balance (Allocated − Spent)
                  </span>
                  <div
                    style={{
                      fontSize: '1.55rem',
                      fontWeight: 800,
                      marginTop: '4px',
                      color: employeeKpis.balance > 0 ? '#059669' : employeeKpis.balance < 0 ? '#DC2626' : '#0F172A',
                    }}
                  >
                    {formatSignedBalance(employeeKpis.balance)}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    {employeeKpis.balance > 0
                      ? 'Unused advance to return to Accounts'
                      : employeeKpis.balance < 0
                      ? 'Reimbursement required from Accounts'
                      : 'All field expenses settled'}
                  </span>
                </div>
              </div>

              {/* MY FIELD ALLOWANCE ACTIVE TRIP DASHBOARD CARD (MATCHES IMAGE REFERENCE) */}
              {employeeTab === 'dashboard' && selectedEmployeeTrip && (() => {
                const tripAllocated = Number(selectedEmployeeTrip.disbursed_amount || 0);
                const tripSpent = Number(selectedEmployeeTrip.expenses_total || 0);
                const tripBalance = tripAllocated - tripSpent;
                const st = getStatusBadge(selectedEmployeeTrip.status);

                return (
                  <div
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '18px',
                      border: '1px solid #E2E8F0',
                      padding: '22px',
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
                    }}
                  >
                    {/* Trip Switcher if employee has multiple visits */}
                    {myVisits.length > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748B' }}>Select Field Trip:</span>
                        <select
                          value={selectedEmployeeTrip.id}
                          onChange={(e) => setSelectedEmployeeTripId(e.target.value)}
                          style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', background: '#F8FAFC' }}
                        >
                          {myVisits.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.request_number} — {v.destination} ({v.purpose}) [{v.status}]
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
                      <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                          My Field Allowance
                        </h2>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                          Trip: {selectedEmployeeTrip.destination} — {selectedEmployeeTrip.purpose}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${st.bg}`}>
                        {st.label}
                      </span>
                    </div>

                    {/* 3 Trip Metrics: Allocated, Spent, Balance */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '14px',
                        paddingBottom: '18px',
                        borderBottom: '1px solid #E2E8F0',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Allocated</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                          ₹{tripAllocated.toLocaleString('en-IN')}
                        </div>
                        {selectedEmployeeTrip.funding_type === 'advance' && selectedEmployeeTrip.disbursed_amount === 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#D97706', marginTop: '2px' }}>
                            Requested: ₹{selectedEmployeeTrip.requested_amount.toLocaleString('en-IN')} ({selectedEmployeeTrip.status})
                          </div>
                        )}
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Spent</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                          ₹{tripSpent.toLocaleString('en-IN')}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Balance</div>
                        <div
                          style={{
                            fontSize: '1.4rem',
                            fontWeight: 800,
                            marginTop: '2px',
                            color: tripBalance > 0 ? '#059669' : tripBalance < 0 ? '#DC2626' : '#0F172A',
                          }}
                        >
                          {formatSignedBalance(tripBalance)}
                        </div>
                      </div>
                    </div>

                    {/* Daily Expense Report Section */}
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                          Daily Expense Report
                        </h3>
                        {['Active', 'Advance Disbursed', 'Settlement Correction Requested'].includes(selectedEmployeeTrip.status) && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveExpenseAdvanceId(selectedEmployeeTrip.id);
                              setShowAddDailyExpenseModal(true);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              background: '#0E7490',
                              color: '#FFFFFF',
                              border: 'none',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            <Plus size={14} />
                            <span>Add Daily Expense</span>
                          </button>
                        )}
                      </div>

                      {selectedEmployeeTripExpenses.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', background: '#F8FAFC', borderRadius: '12px', color: '#64748B', fontSize: '0.82rem' }}>
                          No daily expenses added to this trip yet. Click <strong>Add Daily Expense</strong> to record travel, food, room, or bus expenses with proof.
                        </div>
                      ) : (
                        <div>
                          {selectedEmployeeTripExpenses.map(exp => (
                            <div
                              key={exp.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '11px 0',
                                borderBottom: '1px solid #F1F5F9',
                                fontSize: '0.88rem',
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: 700, color: '#0F172A' }}>{exp.category}</span>
                                <span style={{ color: '#64748B', fontSize: '0.78rem', marginLeft: '8px' }}>
                                  {exp.description} · {exp.expense_date}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, color: '#0F172A' }}>
                                <span>₹{Number(exp.amount).toLocaleString('en-IN')}</span>
                                {exp.receipt_url ? (
                                  <a
                                    href={exp.receipt_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="View Receipt Proof"
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      borderRadius: '6px',
                                      background: '#ECFDF5',
                                      border: '1px solid #A7F3D0',
                                      color: '#059669',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.72rem',
                                      textDecoration: 'none',
                                    }}
                                  >
                                    ✓
                                  </a>
                                ) : (
                                  <span
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      borderRadius: '6px',
                                      background: '#ECFDF5',
                                      border: '1px solid #A7F3D0',
                                      color: '#059669',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.72rem',
                                    }}
                                  >
                                    ✓
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: '12px',
                          marginTop: '4px',
                          fontWeight: 800,
                          fontSize: '0.96rem',
                          color: '#0F172A',
                        }}
                      >
                        <span>Total Spent</span>
                        <span>₹{tripSpent.toLocaleString('en-IN')}</span>
                      </div>

                      {/* Settlement Callout Banner */}
                      <div
                        style={{
                          marginTop: '14px',
                          padding: '12px 14px',
                          borderRadius: '12px',
                          background: tripBalance < 0 ? '#FEF2F2' : tripBalance > 0 ? '#ECFDF5' : '#EFF6FF',
                          border: tripBalance < 0 ? '1px solid #FECACA' : tripBalance > 0 ? '1px solid #A7F3D0' : '1px solid #BFDBFE',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                        }}
                      >
                        <AlertCircle
                          size={17}
                          style={{
                            color: tripBalance < 0 ? '#DC2626' : tripBalance > 0 ? '#059669' : '#2563EB',
                            flexShrink: 0,
                            marginTop: '2px',
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>
                            {tripBalance < 0
                              ? `Reimbursement Required: ₹${Math.abs(tripBalance).toLocaleString('en-IN')}`
                              : tripBalance > 0
                              ? `Unused Balance to Return: ₹${tripBalance.toLocaleString('en-IN')}`
                              : 'Balanced Settlement: ₹0'}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '2px' }}>
                            {tripBalance < 0
                              ? 'Subject to expense approval. Payment will be released by Accounts.'
                              : tripBalance > 0
                              ? 'Return unused advance to Accounts and obtain receipt confirmation.'
                              : 'Total expenses match your disbursed advance.'}
                          </div>
                        </div>
                      </div>

                      {/* Trip Action Footer */}
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVisitId(selectedEmployeeTrip.id);
                            setShowDetailModal(true);
                          }}
                          style={{
                            padding: '9px 16px',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            background: '#F8FAFC',
                            color: '#0F172A',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                          }}
                        >
                          Open Full Trip & Settlement Actions
                        </button>

                        {['Active', 'Advance Disbursed', 'Settlement Correction Requested'].includes(selectedEmployeeTrip.status) &&
                          selectedEmployeeTripExpenses.length > 0 && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm('Submit completed field visit expenses for CEO / HR verification?')) return;
                                try {
                                  await submitSettlementApi(selectedEmployeeTrip.id, 'Completed field visit expense submission');
                                  loadData();
                                } catch (err: any) {
                                  alert(err.message || 'Could not submit settlement');
                                }
                              }}
                              style={{
                                padding: '9px 16px',
                                borderRadius: '10px',
                                border: 'none',
                                background: '#059669',
                                color: '#FFFFFF',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                              }}
                            >
                              Complete Field Visit & Submit Claim
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* Sub-tabs Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {currentView === 'employee' && (
                <>
                  {([
                    { id: 'dashboard', label: 'Active Trip & All Claims' },
                    { id: 'my_requests', label: 'Advance Requests' },
                    { id: 'my_expenses', label: 'Daily Expenses' },
                    { id: 'pending', label: 'Pending Settlement' },
                    { id: 'history', label: 'Completed History' },
                  ] as const).map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setEmployeeTab(tab.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: employeeTab === tab.id ? '#0E7490' : '#F1F5F9',
                        color: employeeTab === tab.id ? '#FFFFFF' : '#475569',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </>
              )}

              {currentView === 'approvals' && (
                <>
                  {(['pending', 'approved', 'rejected', 'history'] as const).map(tab => {
                    const label =
                      tab === 'pending'
                        ? 'Pending Verification'
                        : tab === 'approved'
                        ? 'Approved'
                        : tab === 'rejected'
                        ? 'Rejected'
                        : 'All History';
                    const isActive = approvalTab === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setApprovalTab(tab)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          background: isActive ? '#0E7490' : '#F1F5F9',
                          color: isActive ? '#FFFFFF' : '#475569',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </>
              )}

              {currentView === 'accounts' && (
                <>
                  {([
                    { id: 'advances', label: 'Advances to Disburse' },
                    { id: 'reimbursements', label: 'Reimbursements to Pay' },
                    { id: 'collections', label: 'Balance Returns to Receive' },
                    { id: 'completed', label: 'Completed Settlements' },
                    { id: 'history', label: 'All Transactions' },
                  ] as const).map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setAccountsTab(tab.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: accountsTab === tab.id ? '#0E7490' : '#F1F5F9',
                        color: accountsTab === tab.id ? '#FFFFFF' : '#475569',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <ExportDropdown
                label="Download"
                onExportExcel={() => handleExportReport('summary', 'xlsx')}
                onExportPDF={() => handleExportReport('summary', 'pdf')}
                onExportCSV={() => handleExportReport('summary', 'csv')}
              />

              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                <input
                  type="text"
                  placeholder="Search trips or claims..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 32px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.8rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Employee Daily Expenses Sub-tab Table */}
          {currentView === 'employee' && employeeTab === 'my_expenses' ? (
            <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Date</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Trip ID</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Category</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Description</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Amount</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Proof</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDailyExpenses.map(exp => (
                    <tr key={exp.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px' }}>{exp.expense_date}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700 }}>{exp.request_number}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>{exp.category}</td>
                      <td style={{ padding: '12px 16px' }}>{exp.description}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 800 }}>₹{Number(exp.amount).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {exp.receipt_url ? (
                          <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0E7490', fontWeight: 700 }}>
                            View Proof
                          </a>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                          {exp.approval_status || 'Recorded'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading field allowance records...</div>
          ) : filteredVisits.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
              }}
            >
              <Receipt size={36} style={{ margin: '0 auto 10px', color: '#94A3B8' }} />
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>
                No field allowance records found
              </h4>
              <p style={{ margin: '4px 0 16px', fontSize: '0.8rem', color: '#94A3B8' }}>
                {!isCeo && 'Click "New Field Visit" or "Submit Expense Claim" to create a field allowance request.'}
              </p>
            </div>
          ) : (
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                overflowX: 'auto',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Trip ID</th>
                    {currentView !== 'employee' && (
                      <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Employee</th>
                    )}
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Trip & Destination</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Allocated</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Spent</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Balance / Settlement</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVisits.map(visit => {
                    const bal = getBalanceDisplay(visit);
                    const st = getStatusBadge(visit.status);
                    const isHrClaim = isHrEmployeeClaim(visit);
                    const hrBlockedFromApproving = isHr && !isCeo && (isHrClaim || isUserClaim(visit));

                    return (
                      <tr key={visit.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700 }}>
                          {visit.request_number}
                        </td>

                        {currentView !== 'employee' && (
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontWeight: 700, display: 'block' }}>{visit.employee_name}</span>
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                              {visit.department_name}
                              {isHrClaim && (
                                <span className="ml-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                  CEO Approval Only
                                </span>
                              )}
                            </span>
                          </td>
                        )}

                        <td style={{ padding: '12px 16px', maxWidth: '250px' }}>
                          <span style={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {visit.purpose}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {visit.destination} ({visit.start_date})
                          </span>
                        </td>

                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          ₹{(visit.disbursed_amount || 0).toLocaleString('en-IN')}
                          {visit.funding_type === 'advance' && visit.disbursed_amount === 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>
                              Req: ₹{visit.requested_amount.toLocaleString('en-IN')}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          ₹{(visit.expenses_total || 0).toLocaleString('en-IN')}
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${bal.color}`}>
                            {bal.label}
                          </span>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${st.bg}`}>
                            {st.label}
                          </span>
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            {/* CEO/HR Quick Approve Advance */}
                            {currentView === 'approvals' && visit.status === 'Pending Advance Approval' && !hrBlockedFromApproving && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActionVisit(visit);
                                  setShowApproveAdvanceModal(true);
                                }}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  background: '#059669',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                }}
                              >
                                Approve Advance
                              </button>
                            )}

                            {/* Accounts Quick Disburse */}
                            {currentView === 'accounts' && visit.status === 'Advance Approved' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActionVisit(visit);
                                  setShowDisburseAdvanceModal(true);
                                }}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  background: '#0E7490',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                }}
                              >
                                Disburse Advance
                              </button>
                            )}

                            {/* Employee Quick Add Expense */}
                            {currentView === 'employee' && ['Active', 'Advance Disbursed'].includes(visit.status) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveExpenseAdvanceId(visit.id);
                                  setShowAddDailyExpenseModal(true);
                                }}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  background: '#0E7490',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                }}
                              >
                                + Expense
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedVisitId(visit.id);
                                setShowDetailModal(true);
                              }}
                              style={{
                                padding: '5px 12px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                background: '#F1F5F9',
                                color: '#334155',
                                border: '1px solid #CBD5E1',
                                borderRadius: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. MODALS                                                 */}
      {/* ========================================================= */}
      {showNewFieldVisitModal && !isCeo && (
        <NewFieldVisitModal
          isOpen={showNewFieldVisitModal}
          onClose={() => setShowNewFieldVisitModal(false)}
          onCreated={loadData}
          currentUser={currentUser}
        />
      )}

      {showRequestAdvanceModal && !isCeo && (
        <RequestAdvanceModal
          isOpen={showRequestAdvanceModal}
          onClose={() => setShowRequestAdvanceModal(false)}
          onSuccess={loadData}
          currentUser={currentUser}
        />
      )}

      {showApplyClaimModal && !isCeo && (
        <ApplyClaimModal
          isOpen={showApplyClaimModal}
          onClose={() => setShowApplyClaimModal(false)}
          onSuccess={loadData}
          currentUser={currentUser}
        />
      )}

      {showAddDailyExpenseModal && activeExpenseAdvanceId && !isCeo && (
        <DailyExpenseModal
          isOpen={showAddDailyExpenseModal}
          onClose={() => {
            setShowAddDailyExpenseModal(false);
            setActiveExpenseAdvanceId(null);
          }}
          advanceId={activeExpenseAdvanceId}
          onSaved={loadData}
        />
      )}

      {showDetailModal && selectedVisitId && (
        <FieldVisitDetailModal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedVisitId(null);
          }}
          advanceId={selectedVisitId}
          currentUser={currentUser}
          onUpdated={loadData}
        />
      )}

      {showApproveAdvanceModal && actionVisit && (
        <ApproveAdvanceModal
          isOpen={showApproveAdvanceModal}
          onClose={() => {
            setShowApproveAdvanceModal(false);
            setActionVisit(null);
          }}
          onSuccess={loadData}
          visit={actionVisit}
        />
      )}

      {showDisburseAdvanceModal && actionVisit && (
        <DisburseAdvanceModal
          isOpen={showDisburseAdvanceModal}
          onClose={() => {
            setShowDisburseAdvanceModal(false);
            setActionVisit(null);
          }}
          onSuccess={loadData}
          visit={actionVisit}
        />
      )}
    </div>
  );
};

export default FieldAllowanceModule;
