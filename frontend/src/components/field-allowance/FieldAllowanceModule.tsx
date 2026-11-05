import React, { useState, useEffect, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  Plus,
  CheckCircle2,
  Calendar,
  Receipt,
  ChevronRight,
  Copy,
  Check,
  ClipboardCheck,
} from 'lucide-react';
import { FieldVisitAdvance, FieldVisitStatus } from '../../types/fieldAdvance';
import {
  fetchFieldVisits,
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
  const isPrivileged = isCeo || isHr || isAccounts || isSuperAdmin;

  // View state: 'employee' | 'ceo_master' | 'approvals' | 'accounts'
  const [currentView, setCurrentView] = useState<'employee' | 'ceo_master' | 'approvals' | 'accounts'>(
    isCeo || isSuperAdmin ? 'ceo_master' : isAccounts ? 'accounts' : isHr ? 'approvals' : 'employee'
  );

  // Simple 4-pill status filter matching Reference Image 4 ('ALL' | 'PENDING' | 'SETTLEMENT' | 'COMPLETED')
  const [pillFilter, setPillFilter] = useState<'ALL' | 'PENDING' | 'SETTLEMENT' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Month & Year Calendar Filter
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() => new Date().getFullYear());

  // Data
  const [visits, setVisits] = useState<FieldVisitAdvance[]>([]);
  const [dailyExpenses, setDailyExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedReport, setCopiedReport] = useState(false);

  // Selected Visit for Detail View
  const [selectedVisitCardId, setSelectedVisitCardId] = useState<string | null>(null);

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
      setShowApplyClaimModal(true);
      onCloseQuickAdd?.();
    }
  }, [openAddModal, isCeo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [visitsData, expensesData] = await Promise.all([
        fetchFieldVisits(),
        fetchDailyExpenses(),
      ]);
      setVisits(visitsData);
      setDailyExpenses(expensesData);
    } catch {
      // ignore error
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

  // Base visits scoped by role/view and date range
  const baseScopedVisits = useMemo(() => {
    return visits.filter(v => {
      if (!matchesDateRange(v.start_date || v.created_at)) return false;
      if (currentView === 'employee') {
        return isUserClaim(v);
      }
      return true;
    });
  }, [visits, currentView, selectedMonth, selectedYear, userEmpId, userAuthId, userName]);

  // Filtered visits by Search + 4 Simple Pills ('ALL' | 'PENDING' | 'SETTLEMENT' | 'COMPLETED')
  const displayedVisits = useMemo(() => {
    return baseScopedVisits.filter(v => {
      if (pillFilter === 'PENDING') {
        const isPending = [
          'Pending Advance Approval',
          'Settlement Submitted',
          'Advance Correction Requested',
          'Settlement Correction Requested',
        ].includes(v.status);
        if (!isPending) return false;
      } else if (pillFilter === 'SETTLEMENT') {
        const isSettlement = [
          'Advance Approved',
          'Advance Disbursed',
          'Active',
          'Pending Balance Collection',
          'Partially Collected',
          'Pending Reimbursement',
          'Partially Reimbursed',
        ].includes(v.status);
        if (!isSettlement) return false;
      } else if (pillFilter === 'COMPLETED') {
        if (v.status !== 'Completed') return false;
      }

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
  }, [baseScopedVisits, pillFilter, searchQuery]);

  // Keep selected card in sync
  useEffect(() => {
    if (displayedVisits.length > 0 && (!selectedVisitCardId || !displayedVisits.some(v => v.id === selectedVisitCardId))) {
      setSelectedVisitCardId(displayedVisits[0].id);
    } else if (displayedVisits.length === 0) {
      setSelectedVisitCardId(null);
    }
  }, [displayedVisits, selectedVisitCardId]);

  const selectedVisit = useMemo(
    () => displayedVisits.find(v => v.id === selectedVisitCardId) || displayedVisits[0] || null,
    [displayedVisits, selectedVisitCardId]
  );

  const selectedVisitExpenses = useMemo(() => {
    if (!selectedVisit) return [];
    return dailyExpenses.filter(e => e.advance_id === selectedVisit.id);
  }, [dailyExpenses, selectedVisit]);

  // KPIs computed from baseScopedVisits
  const kpis = useMemo(() => {
    const members = new Set(baseScopedVisits.map(v => v.employee_id || v.employee_code || v.employee_name)).size;
    const allocated = baseScopedVisits.reduce(
      (s, v) => s + Number(v.disbursed_amount || v.approved_amount || v.requested_amount || 0),
      0
    );
    const spent = baseScopedVisits.reduce((s, v) => s + Number(v.expenses_total || 0), 0);
    const pendingReturns = baseScopedVisits.reduce((s, v) => {
      if (v.return_due && v.return_due > 0 && v.status !== 'Completed') return s + Number(v.return_due);
      const alloc = Number(v.disbursed_amount || v.approved_amount || v.requested_amount || 0);
      const diff = alloc - Number(v.expenses_total || 0);
      if (diff > 0 && v.status !== 'Completed') return s + diff;
      return s;
    }, 0);
    const pendingReimbursements = baseScopedVisits.reduce((s, v) => {
      if (v.reimbursement_due && v.reimbursement_due > 0 && v.status !== 'Completed') return s + Number(v.reimbursement_due);
      const alloc = Number(v.disbursed_amount || v.approved_amount || v.requested_amount || 0);
      const diff = alloc - Number(v.expenses_total || 0);
      if (diff < 0 && v.status !== 'Completed') return s + Math.abs(diff);
      return s;
    }, 0);
    const pendingApprovalsCount = baseScopedVisits.filter(v =>
      ['Pending Advance Approval', 'Settlement Submitted'].includes(v.status)
    ).length;

    return {
      members,
      visitsCount: baseScopedVisits.length,
      allocated,
      spent,
      balance: allocated - spent,
      pendingReturns,
      pendingReimbursements,
      pendingApprovalsCount,
    };
  }, [baseScopedVisits]);

  // Format signed balance string (+₹800 / −₹1,000 / ₹0)
  const formatSignedBalance = (balance: number) => {
    if (balance > 0) return `+₹${balance.toLocaleString('en-IN')}`;
    if (balance < 0) return `−₹${Math.abs(balance).toLocaleString('en-IN')}`;
    return '₹0';
  };

  // Format short date (e.g. "04 Nov")
  const formatShortDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  // Clean Status Pill Style (100% explicit inline styles)
  const getSimpleStatusPill = (status: FieldVisitStatus, balance: number) => {
    if (status === 'Completed') {
      return {
        label: 'Settled',
        bg: '#ECFDF5',
        color: '#059669',
        border: '#A7F3D0',
      };
    }
    if (status === 'Pending Advance Approval' || status === 'Settlement Submitted') {
      return {
        label: 'Pending Approval',
        bg: '#FFF7ED',
        color: '#EA580C',
        border: '#FED7AA',
      };
    }
    if (status === 'Pending Balance Collection' || status === 'Partially Collected' || (balance > 0 && ['Active', 'Advance Disbursed'].includes(status))) {
      return {
        label: 'Pending Return',
        bg: '#EFF6FF',
        color: '#2563EB',
        border: '#BFDBFE',
      };
    }
    if (status === 'Pending Reimbursement' || status === 'Partially Reimbursed' || (balance < 0 && ['Active', 'Advance Disbursed'].includes(status))) {
      return {
        label: 'Pending Reimbursement',
        bg: '#FEF2F2',
        color: '#DC2626',
        border: '#FECACA',
      };
    }
    if (status === 'Advance Approved') {
      return {
        label: 'Advance Approved',
        bg: '#F0FDFA',
        color: '#0E7490',
        border: '#99F6E4',
      };
    }
    if (status === 'Advance Rejected') {
      return {
        label: 'Rejected',
        bg: '#FEF2F2',
        color: '#DC2626',
        border: '#FECACA',
      };
    }
    return {
      label: 'In Progress',
      bg: '#F8FAFC',
      color: '#475569',
      border: '#CBD5E1',
    };
  };

  // Copy Report to Clipboard
  const handleCopyReport = () => {
    if (!selectedVisit) return;
    const allocated = Number(
      selectedVisit.disbursed_amount || selectedVisit.approved_amount || selectedVisit.requested_amount || 0
    );
    const spent = Number(selectedVisit.expenses_total || 0);
    const balance = allocated - spent;

    const lines = [
      `Employee Daily Report`,
      `${selectedVisit.employee_name} · ${selectedVisit.request_number}`,
      `Field Visit: ${selectedVisit.destination || selectedVisit.purpose}`,
      `Allocated Amount: ₹${allocated.toLocaleString('en-IN')}`,
      `Spent Amount: ₹${spent.toLocaleString('en-IN')}`,
      `Balance: ${formatSignedBalance(balance)}`,
      ``,
      `Day-wise Expense Breakdown:`,
      ...(selectedVisitExpenses.length > 0
        ? selectedVisitExpenses.map(
            e =>
              `- ${formatShortDate(e.expense_date)}: ${e.category}${e.description ? ` (${e.description})` : ''} — ₹${Number(
                e.amount || 0
              ).toLocaleString('en-IN')}`
          )
        : ['- No expenses recorded']),
      `Total Expense: ₹${spent.toLocaleString('en-IN')}`,
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    });
  };

  // Export Reports (Excel, CSV, PDF)
  const handleExportReport = (format: 'xlsx' | 'csv' | 'pdf' = 'xlsx') => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const rows = displayedVisits.map(v => {
      const alloc = Number(v.disbursed_amount || v.approved_amount || v.requested_amount || 0);
      const sp = Number(v.expenses_total || 0);
      return {
        ...v,
        allocated_amount: alloc,
        spent_amount: sp,
        balance: alloc - sp,
      };
    });
    const cols: ExportColumn[] = [
      { key: 'request_number', label: 'Trip ID' },
      { key: 'employee_name', label: 'Employee' },
      { key: 'department_name', label: 'Department' },
      { key: 'destination', label: 'Field Visit' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'start_date', label: 'Start Date' },
      { key: 'allocated_amount', label: 'Allocated Amount (₹)' },
      { key: 'spent_amount', label: 'Spent Amount (₹)' },
      { key: 'balance', label: 'Balance (₹)' },
      { key: 'status', label: 'Status' },
    ];
    const filenameBase = 'Field_Allowance_Report';
    const reportTitle = 'Field Allowance & Claims Report';
    if (format === 'csv') {
      downloadCSV(rows, `${filenameBase}_${timestamp}.csv`, cols);
    } else if (format === 'pdf') {
      downloadPDF(rows, reportTitle, `${filenameBase}_${timestamp}.pdf`, cols);
    } else {
      downloadExcel(rows, `${filenameBase}_${timestamp}.xlsx`, cols);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '50px' }}>
      {/* ========================================================= */}
      {/* 1. TOP HEADER & ACTION BAR                                */}
      {/* ========================================================= */}
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
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {currentView === 'employee' ? 'My Field Allowance' : 'Field Allowance & Claims'}
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
            {isCeo
              ? 'Monitor employee field visits, allocated advances, day-wise expenses & settlements'
              : 'Track field visit advances, daily expense breakdowns, and settlements'}
          </p>
        </div>

        {/* Right Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Calendar Month & Year Picker Button + Popup */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              type="button"
              onClick={() => setShowMonthYearPicker(prev => !prev)}
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
                      onClick={() => setPickerYear(y => y - 1)}
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
                      onClick={() => setPickerYear(y => y + 1)}
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
            onExportExcel={() => handleExportReport('xlsx')}
            onExportPDF={() => handleExportReport('pdf')}
            onExportCSV={() => handleExportReport('csv')}
          />

          {!isCeo && (
            <button
              type="button"
              onClick={() => setShowApplyClaimModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                background: '#0E7490',
                color: '#FFFFFF',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.84rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)',
              }}
            >
              <Plus size={16} />
              <span>New Field Visit / Claim</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. PERSPECTIVE SWITCHER FOR HR / ACCOUNTS                 */}
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
              fontSize: '0.82rem',
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
                fontSize: '0.82rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: currentView === 'approvals' ? '#0E7490' : 'transparent',
                color: currentView === 'approvals' ? '#FFFFFF' : '#475569',
              }}
            >
              All Employee Field Visits
            </button>
          )}

          {isAccounts && (
            <button
              type="button"
              onClick={() => setCurrentView('accounts')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.82rem',
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
      {/* 3. COMPACT KPI SUMMARY CARDS (3 + 3 FOR CEO/HR/ACCOUNTS)  */}
      {/* ========================================================= */}
      {currentView !== 'employee' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Total Allocated Members</div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{kpis.visitsCount} field visits in selected period</div>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#2563EB', whiteSpace: 'nowrap' }}>
                {kpis.members}
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Total Allocated Amount</div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Advance allocated for visits</div>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
                ₹{kpis.allocated.toLocaleString('en-IN')}
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Total Spent Amount</div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Recorded daily field expenses</div>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
                ₹{kpis.spent.toLocaleString('en-IN')}
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
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Pending Approvals</div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Awaiting CEO / HR verification</div>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#D97706', whiteSpace: 'nowrap' }}>
                {kpis.pendingApprovalsCount}
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Potential Returns</div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Unused advance to return to Accounts</div>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669', whiteSpace: 'nowrap' }}>
                +₹{kpis.pendingReturns.toLocaleString('en-IN')}
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Potential Reimbursements</div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Overspent / own money owed to staff</div>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#DC2626', whiteSpace: 'nowrap' }}>
                −₹{kpis.pendingReimbursements.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
          }}
        >
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Allocated Amount</div>
              <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Total advance allocated</div>
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
              ₹{kpis.allocated.toLocaleString('en-IN')}
            </div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Spent Amount</div>
              <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Total recorded daily expenses</div>
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
              ₹{kpis.spent.toLocaleString('en-IN')}
            </div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', minHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>Balance</div>
              <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Allocated − Spent</div>
            </div>
            <div
              style={{
                fontSize: '1.15rem',
                fontWeight: 800,
                color: kpis.balance > 0 ? '#059669' : kpis.balance < 0 ? '#DC2626' : '#0F172A',
                whiteSpace: 'nowrap',
              }}
            >
              {formatSignedBalance(kpis.balance)}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. EMPLOYEE FIELD VISITS (MATCHES REFERENCE IMAGE 4)      */}
      {/* ========================================================= */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid #E2E8F0',
          padding: '22px 24px',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header: Employee Field Visits + {count} records */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
            Employee Field Visits
          </h2>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '999px',
              background: '#F1F5F9',
              color: '#334155',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: '1px solid #E2E8F0',
            }}
          >
            {displayedVisits.length} {displayedVisits.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {/* Full-Width Rounded Search Input */}
        <div>
          <input
            type="text"
            placeholder="Search employee or department"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 18px',
              borderRadius: '999px',
              border: '1px solid #CBD5E1',
              background: '#F8FAFC',
              color: '#0F172A',
              fontSize: '0.88rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* 4 Simple Filter Pills: All, Pending, Settlement, Completed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {(
            [
              { id: 'ALL', label: 'All' },
              { id: 'PENDING', label: 'Pending' },
              { id: 'SETTLEMENT', label: 'Settlement' },
              { id: 'COMPLETED', label: 'Completed' },
            ] as const
          ).map(pill => {
            const active = pillFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setPillFilter(pill.id)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '999px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  border: active ? '1px solid #0E7490' : '1px solid transparent',
                  background: active ? '#0E7490' : '#F1F5F9',
                  color: active ? '#FFFFFF' : '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Vertical Stack of Employee Field Visit Cards */}
        {loading ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.88rem' }}>
            Loading field visits...
          </div>
        ) : displayedVisits.length === 0 ? (
          <div
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              background: '#F8FAFC',
              borderRadius: '14px',
              border: '1px dashed #CBD5E1',
              color: '#64748B',
              fontSize: '0.86rem',
            }}
          >
            <Receipt size={32} style={{ margin: '0 auto 8px', color: '#94A3B8' }} />
            <div style={{ fontWeight: 700, color: '#334155' }}>No field visits found</div>
            <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '4px' }}>
              {!isCeo
                ? 'Click "New Field Visit / Claim" above to create a field visit or expense claim.'
                : 'No employee field visits match the current filter.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {displayedVisits.map(visit => {
              const allocated = Number(
                visit.disbursed_amount || visit.approved_amount || visit.requested_amount || 0
              );
              const spent = Number(visit.expenses_total || 0);
              const balance = allocated - spent;
              const isSelected = selectedVisit?.id === visit.id;
              const pill = getSimpleStatusPill(visit.status, balance);

              return (
                <div
                  key={visit.id}
                  onClick={() => setSelectedVisitCardId(visit.id)}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '18px 22px',
                    border: isSelected ? '2px solid #0E7490' : '1px solid #E2E8F0',
                    boxShadow: isSelected
                      ? '0 4px 12px rgba(14, 116, 144, 0.1)'
                      : '0 1px 2px rgba(15, 23, 42, 0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Top Row: Employee Name + Subtitle on Left, Checkmark / Chevron on Right */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '1.06rem', fontWeight: 800, color: '#0F172A' }}>
                        {visit.employee_name || 'Employee'}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '3px' }}>
                        {visit.department_name || 'Operations'} · {visit.destination || visit.purpose}
                      </div>
                    </div>
                    <div style={{ color: isSelected ? '#0E7490' : '#94A3B8', marginTop: '2px' }}>
                      {isSelected ? <CheckCircle2 size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </div>

                  {/* Middle Row: 3 Columns (Allocated, Spent, Balance) */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '16px',
                      marginTop: '16px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Allocated</div>
                      <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0F172A', marginTop: '3px' }}>
                        ₹{allocated.toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Spent</div>
                      <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0F172A', marginTop: '3px' }}>
                        ₹{spent.toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Balance</div>
                      <div
                        style={{
                          fontSize: '1.02rem',
                          fontWeight: 800,
                          marginTop: '3px',
                          color: balance > 0 ? '#059669' : balance < 0 ? '#DC2626' : '#0F172A',
                        }}
                      >
                        {formatSignedBalance(balance)}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Status Pill on Left + View daily report → on Right */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      marginTop: '16px',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '999px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        background: pill.bg,
                        color: pill.color,
                        border: `1px solid ${pill.border}`,
                      }}
                    >
                      {pill.label}
                    </span>

                    <span
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedVisitCardId(visit.id);
                        setSelectedVisitId(visit.id);
                        setShowDetailModal(true);
                      }}
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#475569',
                      }}
                    >
                      View daily report →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 5. EMPLOYEE DAILY REPORT (MATCHES REFERENCE IMAGE 5)      */}
      {/* ========================================================= */}
      {selectedVisit && (() => {
        const allocated = Number(
          selectedVisit.disbursed_amount || selectedVisit.approved_amount || selectedVisit.requested_amount || 0
        );
        const spent = Number(selectedVisit.expenses_total || 0);
        const balance = allocated - spent;

        return (
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              border: '1px solid #E2E8F0',
              padding: '24px 26px',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
            }}
          >
            {/* Header: Employee Daily Report + Detail View Pill */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                  Employee Daily Report
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
                  {selectedVisit.employee_name} · {selectedVisit.request_number}
                </p>
              </div>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: '999px',
                  background: '#EFF6FF',
                  color: '#2563EB',
                  border: '1px solid #BFDBFE',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                Detail View
              </span>
            </div>

            {/* Summary Key-Value Rows */}
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ fontSize: '0.92rem', color: '#475569', fontWeight: 500 }}>Field Visit</span>
                <span style={{ fontSize: '0.96rem', color: '#0F172A', fontWeight: 800 }}>
                  {selectedVisit.destination || selectedVisit.purpose}
                </span>
              </div>

              <div style={{ borderBottom: '1px solid #E2E8F0', margin: '10px 0' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0' }}>
                <span style={{ fontSize: '0.92rem', color: '#475569', fontWeight: 500 }}>Allocated Amount</span>
                <span style={{ fontSize: '1.02rem', color: '#0F172A', fontWeight: 800 }}>
                  ₹{allocated.toLocaleString('en-IN')}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0' }}>
                <span style={{ fontSize: '0.92rem', color: '#475569', fontWeight: 500 }}>Spent Amount</span>
                <span style={{ fontSize: '1.02rem', color: '#0F172A', fontWeight: 800 }}>
                  ₹{spent.toLocaleString('en-IN')}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0' }}>
                <span style={{ fontSize: '0.92rem', color: '#475569', fontWeight: 500 }}>Balance</span>
                <span
                  style={{
                    fontSize: '1.02rem',
                    fontWeight: 800,
                    color: balance > 0 ? '#059669' : balance < 0 ? '#DC2626' : '#0F172A',
                  }}
                >
                  {formatSignedBalance(balance)}
                </span>
              </div>
            </div>

            {/* Day-wise Expense Breakdown */}
            <div style={{ marginTop: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0F172A' }}>
                  Day-wise Expense Breakdown
                </h3>
                {!isCeo &&
                  isUserClaim(selectedVisit) &&
                  ['Active', 'Advance Disbursed', 'Pending Advance Approval', 'Settlement Correction Requested'].includes(
                    selectedVisit.status
                  ) && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveExpenseAdvanceId(selectedVisit.id);
                        setShowAddDailyExpenseModal(true);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 12px',
                        borderRadius: '999px',
                        border: '1px solid #0E7490',
                        background: '#F0FDFA',
                        color: '#0E7490',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={13} />
                      <span>Add Expense</span>
                    </button>
                  )}
              </div>

              {selectedVisitExpenses.length === 0 ? (
                <div
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    background: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    color: '#64748B',
                    fontSize: '0.84rem',
                  }}
                >
                  No daily expenses recorded for this visit yet.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.78rem' }}>
                      <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 600, width: '25%' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 600 }}>Expense</th>
                      <th style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 600, width: '25%' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVisitExpenses.map(exp => (
                      <tr key={exp.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '11px 4px', color: '#334155', fontWeight: 600 }}>
                          {formatShortDate(exp.expense_date)}
                        </td>
                        <td style={{ padding: '11px 4px', color: '#0F172A', fontWeight: 600 }}>
                          <span>{exp.category}</span>
                          {exp.description && exp.description.toLowerCase() !== exp.category.toLowerCase() && (
                            <span style={{ color: '#64748B', fontWeight: 400, fontSize: '0.8rem', marginLeft: '6px' }}>
                              · {exp.description}
                            </span>
                          )}
                          {exp.receipt_url && (
                            <a
                              href={exp.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                marginLeft: '8px',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                color: '#0E7490',
                                textDecoration: 'none',
                              }}
                            >
                              [Proof]
                            </a>
                          )}
                        </td>
                        <td style={{ padding: '11px 4px', textAlign: 'right', color: '#0F172A', fontWeight: 700 }}>
                          ₹{Number(exp.amount || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Total Expense Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '14px',
                  marginTop: '4px',
                  borderTop: '1px solid #E2E8F0',
                }}
              >
                <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>Total Expense</span>
                <span style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
                  ₹{spent.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Bottom 2 Full-Width Pill Buttons (Matches Reference Image 5) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                marginTop: '22px',
              }}
            >
              <button
                type="button"
                onClick={async () => {
                  // If employee owns an active trip with expenses and clicks Submit Claim
                  if (
                    currentView === 'employee' &&
                    ['Active', 'Advance Disbursed', 'Settlement Correction Requested'].includes(selectedVisit.status) &&
                    selectedVisitExpenses.length > 0
                  ) {
                    if (window.confirm('Submit your daily expense report for approval?')) {
                      try {
                        await submitSettlementApi(selectedVisit.id, 'Daily expense report submitted.');
                        loadData();
                        return;
                      } catch {
                        // fallback to detail modal
                      }
                    }
                  }
                  setSelectedVisitId(selectedVisit.id);
                  setShowDetailModal(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  borderRadius: '999px',
                  border: 'none',
                  background: '#0F172A',
                  color: '#FFFFFF',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <ClipboardCheck size={16} />
                <span>
                  {currentView === 'employee'
                    ? ['Active', 'Advance Disbursed', 'Settlement Correction Requested'].includes(selectedVisit.status) &&
                      selectedVisitExpenses.length > 0
                      ? 'Submit Claim'
                      : 'View Report Details'
                    : 'Review Claims'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleCopyReport}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  borderRadius: '999px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copiedReport ? <Check size={16} color="#059669" /> : <Copy size={16} />}
                <span>{copiedReport ? 'Copied!' : 'Copy Report'}</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* 6. MODALS                                                 */}
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
