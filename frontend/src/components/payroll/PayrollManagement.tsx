import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { CreditCard, IndianRupee, CheckCircle2, FileText, Download, X, Edit3, ShieldAlert, ShieldCheck, Printer, RefreshCw, Eye } from 'lucide-react';
import { PayrollRecord, Employee } from '../../types/hrms';
import { isOwnerOrCEO } from '../../data/hrmsInitialData';
import { SalaryComponentConfig } from '../../types/settings';
import { toNum, formatCurrency } from '../../utils/numbers';
import { downloadElementAsPDF, downloadElementAsDirectPdf, printElement, downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { ExportDropdown } from '../common/ExportDropdown';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { getMonthInfo } from '../../utils/monthUtils';
import {
  AuthorizedSignatory,
  CompanyFooter,
  CompanyHeader,
  DynamicAmountTable,
  AmountLine,
  EmployeeDetailsGrid,
  NetPaySection,
  buildCompanyDocumentProfile,
  mapPayrollLines
} from '../documents/CompanyDocumentParts';
import {
  resolveEmployeeWithPf,
  isComponentEligible,
  getCalendarDaysInMonth,
  resolvePayrollSalaryDivisor,
  formatPayslipOvertimeForViewer,
  resolveMonthNumber,
  calculateCalendarDayPayrollAttendance
} from '../../services/policyEngine';
import { EmployeeSalaryEligibilityContext } from '../../types/settings';
import { Clock } from 'lucide-react';

export const PayrollManagement: React.FC = () => {
  const { 
    payrollRecords, 
    processPayrollBatch, 
    recalculatePayrollBatch,
    updatePayrollRecordAdvanceDeduction,
    markPayrollRecordsPaid,
    employees, 
    currentUser, 
    hasPermission, 
    businessSettings,
    masterAttendancePolicies,
    masterLeavePolicies,
    activeLoanPolicy,
    loanPolicies,
    loanRecords,
    payrollSettingsConfig,
    companyInfo,
    companyBranches,
    departments,
    overtimeRequests,
    overtimePolicy,
    attendanceRecords,
    leaveRequests,
    holidayPolicies,
    weeklySchedules,
    sandwichPolicies
  } = useHRMS();

  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<PayrollRecord | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);

  // Multi-row selection state
  const [selectedPayslipIds, setSelectedPayslipIds] = useState<string[]>([]);

  // Advance Salary / Loan Recovery ("Others") Editing State
  const [editingAdvance, setEditingAdvance] = useState<{ recordId: string; employeeName: string; currentAmount: number } | null>(null);
  const [advanceInputVal, setAdvanceInputVal] = useState<number>(0);

  // Pagination state (Standardized to [5, 10] per design system)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const documentProfile = useMemo(
    () => buildCompanyDocumentProfile(companyInfo, businessSettings, companyBranches),
    [companyInfo, businessSettings, companyBranches]
  );

  // Define strict approval authority: CEO, Super Admin, HR Manager, HR Admin
  const isApprovalAuthority = 
    ['CEO', 'Super Admin', 'HR Manager', 'HR Admin'].includes(currentUser.role) ||
    (currentUser as any).designation?.toLowerCase().includes('ceo') ||
    (currentUser as any).designation?.toLowerCase().includes('managing director');

  // Define Accounts Department users: Finance Manager or Accounts/Finance department/designation
  const isAccountsUser = 
    currentUser.role === 'Finance Manager' ||
    (currentUser.department && (currentUser.department.toLowerCase().includes('accounts') || currentUser.department.toLowerCase().includes('finance'))) ||
    (currentUser.designation && (currentUser.designation.toLowerCase().includes('account') || currentUser.designation.toLowerCase().includes('finance')));

  // CEO / Managing Director (CEO login uses 'Super Admin')
  const isCEOUser =
    currentUser.role === 'CEO' ||
    currentUser.role === 'Super Admin' ||
    (currentUser as any).designation?.toLowerCase().includes('ceo') ||
    (currentUser as any).designation?.toLowerCase().includes('managing director');

  const isEmployeeRole = currentUser.role === 'Employee' && !isAccountsUser && !isCEOUser && !isApprovalAuthority;
  const isPrivilegedViewer = isApprovalAuthority && !isAccountsUser;
  const canProcessPayroll = isApprovalAuthority && !isAccountsUser;

  // Full payroll register: Visible to CEO/Super Admin, Accounts team, and HR/Approval Authority
  const canViewAllPayroll = isCEOUser || isAccountsUser || isApprovalAuthority;
  // Marking full payroll paid is restricted to CEO or Accounts
  const canMarkPaid = isCEOUser || isAccountsUser;

  const myEmployeeId = (currentUser.employeeId || '').trim().toLowerCase();
  const currentMonthInfo = useMemo(() => getMonthInfo(), []);

  // Compute all available batches sorted by date
  const availableBatches = useMemo(() => {
    const batchMap = new Map<string, { month: string; year: number; label: string }>();
    payrollRecords.forEach(r => {
      if (r.month && r.year) {
        const key = `${r.month} ${r.year}`;
        if (!batchMap.has(key)) {
          batchMap.set(key, { month: r.month, year: Number(r.year), label: key });
        }
      }
    });
    // Ensure current month is always present
    const currKey = `${currentMonthInfo.monthLong} ${currentMonthInfo.year}`;
    if (!batchMap.has(currKey)) {
      batchMap.set(currKey, { month: currentMonthInfo.monthLong, year: currentMonthInfo.year, label: currKey });
    }
    return Array.from(batchMap.values());
  }, [payrollRecords, currentMonthInfo]);

  const [selectedBatch, setSelectedBatch] = useState<string>(() => `${currentMonthInfo.monthLong} ${currentMonthInfo.year}`);

  const activeBatch = useMemo(() => {
    const match = availableBatches.find(b => b.label === selectedBatch);
    if (match) return match;
    const currKey = `${currentMonthInfo.monthLong} ${currentMonthInfo.year}`;
    const currMatch = availableBatches.find(b => b.label === currKey);
    if (currMatch) return currMatch;
    return availableBatches[0] || { month: currentMonthInfo.monthLong, year: currentMonthInfo.year, label: currKey };
  }, [selectedBatch, availableBatches, currentMonthInfo]);

  const activeMonthName = activeBatch.month;
  const activeYear = activeBatch.year;

  const batchCalendarDays = useMemo(
    () => getCalendarDaysInMonth(activeMonthName, activeYear),
    [activeMonthName, activeYear]
  );

  const batchSalaryDivisor = useMemo(
    () =>
      resolvePayrollSalaryDivisor({
        month: activeMonthName,
        year: activeYear,
        divisorMode: payrollSettingsConfig?.salaryDivisorMode || overtimePolicy?.divisorMode || 'FIXED_DAYS',
        fixedDivisorDays: payrollSettingsConfig?.standardWorkingDaysPerMonth || overtimePolicy?.customDivisorDays || 26
      }),
    [activeMonthName, activeYear, payrollSettingsConfig, overtimePolicy]
  );

  const getEmployeeApprovedOt = (p: PayrollRecord) => {
    const recHours = toNum(p.overtimeHours || 0);
    const recAmount = toNum(p.overtimeAmount || 0);
    const recRate = toNum(p.overtimeRate || 0);
    if (recHours > 0 || recAmount > 0) {
      return {
        hours: recHours,
        amount: recAmount,
        rate: recRate || (recHours > 0 ? Math.round((recAmount / recHours) * 100) / 100 : 0)
      };
    }

    const emp = employees.find(e => e.employeeId === p.employeeId || e.id === p.employeeId);
    const targetMonthNum = resolveMonthNumber(p.month || activeMonthName);
    const targetYear = Number(p.year || activeYear);
    const monthPrefix = `${targetYear}-${String(targetMonthNum).padStart(2, '0')}`;
    const targetPayrollMonthLabel = `${p.month || activeMonthName} ${targetYear}`.toLowerCase();

    const seenDates = new Set<string>();
    let totalHours = 0;
    let totalAmount = 0;
    let lastRate = 0;

    (overtimeRequests || []).forEach(ot => {
      if (ot.status !== 'Approved' && ot.status !== 'Paid') return;
      const matchesEmp =
        ot.employeeId === p.employeeId ||
        (emp && (ot.employeeId === emp.id || ot.employeeId === emp.employeeId));
      if (!matchesEmp) return;

      const isCurrentMonthDate = (ot.date || '').startsWith(monthPrefix);
      const isTargetedArrear =
        Boolean(ot.isBackdatedArrear) &&
        (ot.payrollMonth || '').trim().toLowerCase() === targetPayrollMonthLabel;
      if (!isCurrentMonthDate && !isTargetedArrear) return;

      const dedupKey = `${p.employeeId}__${ot.date}`;
      if (seenDates.has(dedupKey)) return;
      seenDates.add(dedupKey);

      const hrs = toNum(ot.approvedHours || ot.requestedHours || 0);
      const amt = toNum(ot.calculatedAmount || 0);
      totalHours += hrs;
      totalAmount += amt;
      if (toNum(ot.appliedRatePerHour) > 0) {
        lastRate = toNum(ot.appliedRatePerHour);
      }
    });

    totalHours = Math.round(totalHours * 100) / 100;
    totalAmount = Math.round(totalAmount);
    return {
      hours: totalHours,
      amount: totalAmount,
      rate: lastRate || (totalHours > 0 ? Math.round((totalAmount / totalHours) * 100) / 100 : 0)
    };
  };

  const visibleRecords = useMemo(() => {
    // 1. Role-based visibility
    let records = canViewAllPayroll
      ? payrollRecords
      : payrollRecords.filter(p => {
          const recEmpId = (p.employeeId || '').trim().toLowerCase();
          if (myEmployeeId) return recEmpId === myEmployeeId;
          return (p.employeeName || '').trim().toLowerCase() === (currentUser.name || '').trim().toLowerCase();
        });

    // Exclude CEO / Owner records from payroll registers and payouts
    records = records.filter(p => {
      const emp = employees.find(e => e.employeeId === p.employeeId || e.id === p.employeeId);
      if (emp && isOwnerOrCEO(emp)) return false;
      const desig = (p.designation || '').toUpperCase();
      const dept = (p.department || '').toUpperCase();
      const empId = (p.employeeId || '').toUpperCase();
      const empName = (p.employeeName || '').toLowerCase();
      if (empId === 'VRM-001' || empId === 'EMP-000') return false;
      if (desig === 'CEO' || dept === 'CEO' || desig.includes('CHIEF EXECUTIVE') || desig.includes('OWNER') || desig.includes('MANAGING DIRECTOR')) return false;
      if (empName.includes('velmurugan')) return false;
      return true;
    });

    // 2. Filter to active batch month and year for full payroll view
    if (canViewAllPayroll && activeBatch) {
      records = records.filter(p => {
        const m = (p.month || '').trim().toLowerCase();
        const y = Number(p.year);
        return m === activeBatch.month.toLowerCase() && (!y || y === activeBatch.year);
      });
    }

    // 3. STRICT DEDUPLICATION: within this batch, ensure each employee appears only ONCE!
    const dedupedMap = new Map<string, PayrollRecord>();
    for (const p of records) {
      const empKey = (p.employeeId || p.id).trim().toLowerCase();
      if (!dedupedMap.has(empKey)) {
        dedupedMap.set(empKey, p);
      } else {
        const existing = dedupedMap.get(empKey)!;
        // Keep the one with non-zero net salary or newer id
        if ((toNum(p.netSalary) > 0 && toNum(existing.netSalary) === 0) || String(p.id) > String(existing.id)) {
          dedupedMap.set(empKey, p);
        }
      }
    }

    return Array.from(dedupedMap.values());
  }, [payrollRecords, canViewAllPayroll, myEmployeeId, currentUser.name, activeBatch]);

  const unpaidVisibleIds = visibleRecords.filter(p => p.status !== 'Paid').map(p => p.id);
  const selectedUnpaidIds = selectedPayslipIds.filter(id => unpaidVisibleIds.includes(id));

  const handleMarkPaid = (ids: string[]) => {
    if (!canMarkPaid || ids.length === 0) return;
    markPayrollRecordsPaid(ids);
    setSelectedPayslipIds(prev => prev.filter(id => !ids.includes(id)));
  };

  const totalEntries = visibleRecords.length;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRecords = visibleRecords.slice(startIndex, startIndex + pageSize);
  const isMobileScreen = typeof window !== 'undefined' && window.innerWidth <= 1024;
  const displayedRecords = (isEmployeeRole || isMobileScreen) ? visibleRecords : paginatedRecords;

  const totalPayout = visibleRecords.reduce((acc, curr) => acc + toNum(curr.netSalary), 0);
  const totalStaffIncluded = new Set(
    visibleRecords.map(record => record.employeeId || record.id).filter(Boolean)
  ).size;
  const processedCount = visibleRecords.filter(p => p.status === 'Processed' || p.status === 'Paid').length;
  const totalBatchOtStats = useMemo(() => {
    return visibleRecords.reduce(
      (acc, rec) => {
        const ot = getEmployeeApprovedOt(rec);
        acc.hours = Math.round((acc.hours + ot.hours) * 100) / 100;
        acc.amount += ot.amount;
        if (ot.hours > 0 || ot.amount > 0) acc.employeesCount += 1;
        return acc;
      },
      { hours: 0, amount: 0, employeesCount: 0 }
    );
  }, [visibleRecords, overtimeRequests]);

  const handleTogglePayslip = (id: string) => {
    setSelectedPayslipIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (paginatedRecords.length > 0 && paginatedRecords.every(p => selectedPayslipIds.includes(p.id))) {
      setSelectedPayslipIds(prev => prev.filter(id => !paginatedRecords.some(p => p.id === id)));
    } else {
      const pageIds = paginatedRecords.map(p => p.id);
      setSelectedPayslipIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const openAdvanceModal = (p: PayrollRecord) => {
    setEditingAdvance({
      recordId: p.id,
      employeeName: p.employeeName,
      currentAmount: toNum(p.advanceDeduction || 0)
    });
    setAdvanceInputVal(toNum(p.advanceDeduction || 0));
  };

  const handleSaveAdvanceDeduction = () => {
    if (editingAdvance) {
      updatePayrollRecordAdvanceDeduction(editingAdvance.recordId, advanceInputVal);
      if (selectedPayslip && selectedPayslip.id === editingAdvance.recordId) {
        setSelectedPayslip(prev => prev ? { ...prev, advanceDeduction: advanceInputVal } : null);
      }
      setEditingAdvance(null);
    }
  };

  // Active Policy visibility flags
  const activeAttPolicy = masterAttendancePolicies.find(p => p.status === 'Active');
  const activeLeavePolicy = masterLeavePolicies.find(p => p.status === 'Active');
  const activeLoanPol = activeLoanPolicy || loanPolicies.find(p => p.status === 'Active');
  const isAttGeneric = activeAttPolicy ? activeAttPolicy.deductionVisibility === 'GENERIC' : true;
  const isLeaveGeneric = activeLeavePolicy ? activeLeavePolicy.deductionVisibility === 'GENERIC' : true;
  const isLoanGeneric = activeLoanPol ? activeLoanPol.payslipVisibility === 'GENERIC' : true;

  // Dynamic Salary Components from Payroll Settings
  const activeEarnings = useMemo(() => {
    return (payrollSettingsConfig?.components || []).filter(c => c.active && c.type === 'EARNING');
  }, [payrollSettingsConfig]);

  const activeDeductions = useMemo(() => {
    return (payrollSettingsConfig?.components || []).filter(c => c.active && c.type === 'DEDUCTION');
  }, [payrollSettingsConfig]);

  // Evaluates a salary component's dynamic value for an employee payroll record
  const getComponentValue = (comp: SalaryComponentConfig, p: PayrollRecord, emp?: Employee): number => {
    // Component must be active and employee must be eligible
    if (!comp.active) return 0;

    const basic = toNum(p.basicSalary);
    const basicComp = activeEarnings.find(c => c.code === 'BASIC' || c.name.toLowerCase().includes('basic'));
    const basicPercent = (basicComp?.calculationMethod === 'PERCENTAGE' && basicComp.defaultValue > 0) ? basicComp.defaultValue : 40;
    const ctc = emp?.salaryDetails?.monthlyCtc || (basicPercent > 0 ? Math.round(basic / (basicPercent / 100)) : basic);

    const eligibilityCtx: EmployeeSalaryEligibilityContext = {
      id: emp?.id || p.employeeId,
      employeeId: emp?.employeeId || p.employeeId,
      monthlyCtc: ctc,
      basicSalary: basic,
      grossSalary: toNum(p.grossSalary) || ctc,
      withPf: p.withPf !== undefined ? p.withPf : (emp ? resolveEmployeeWithPf(emp) : true),
    };

    if (!isComponentEligible(comp, eligibilityCtx)) {
      return 0;
    }

    const code = (comp.code || '').toUpperCase().trim();
    
    // Direct matches if available on PayrollRecord or Employee
    if (code === 'BASIC') {
      return basic;
    }
    if (code === 'DA') {
      if (p.da !== undefined && toNum(p.da) > 0) return toNum(p.da);
    }
    if (code === 'HRA') {
      if (p.hra !== undefined && toNum(p.hra) > 0) return toNum(p.hra);
    }
    if (code === 'CONV' || code === 'CONVEYANCE') {
      if (p.conveyance !== undefined && toNum(p.conveyance) > 0) return toNum(p.conveyance);
    }

    // Check employee allowances object if present
    if (emp && emp.allowances) {
      const custom = (emp.allowances as any)[comp.code.toLowerCase()] ?? (emp.allowances as any)[comp.code];
      if (custom !== undefined && custom !== null && toNum(custom) > 0) {
        return toNum(custom);
      }
    }

    // Calculate dynamically based on component calculationMethod
    if (comp.calculationMethod === 'PERCENTAGE') {
      const basicComp = activeEarnings.find(c => c.code === 'BASIC' || c.name.toLowerCase().includes('basic'));
      const basicPercent = (basicComp?.calculationMethod === 'PERCENTAGE' && basicComp.defaultValue > 0) ? basicComp.defaultValue : 40;
      const ctc = emp?.salaryDetails?.monthlyCtc || (basicPercent > 0 ? Math.round(basic / (basicPercent / 100)) : basic);
      const base = comp.percentageBase === 'BASIC' ? basic : ctc;
      return Math.round((base * (comp.defaultValue || 0)) / 100);
    }

    if (comp.calculationMethod === 'FIXED_AMOUNT') {
      return toNum(comp.defaultValue || 0);
    }

    return 0;
  };

  // Dynamic salary formula banner text
  const salaryFormulaText = useMemo(() => {
    if (activeEarnings.length === 0) {
      return 'Salary Formula: Basic Salary + Allowances (Custom components can be configured in Settings → Payroll Settings)';
    }
    const parts = activeEarnings.map(c => {
      if (c.calculationMethod === 'PERCENTAGE') {
        return `${c.name} (${c.defaultValue}%)`;
      }
      if (c.calculationMethod === 'FIXED_AMOUNT') {
        return `${c.name} (${formatCurrency(c.defaultValue)})`;
      }
      return c.name;
    });
    const totalPercent = activeEarnings
      .filter(c => c.calculationMethod === 'PERCENTAGE' && (c.percentageBase === 'CTC' || !c.percentageBase))
      .reduce((sum, c) => sum + c.defaultValue, 0);
    return `Salary Formula: ${parts.join(' + ')}${totalPercent > 0 ? ` = ${totalPercent}% CTC` : ''}`;
  }, [activeEarnings]);

  const resolveDepartmentName = (rawDept?: string, emp?: Employee): string => {
    const candidate = rawDept || emp?.department || emp?.departmentId;
    if (!candidate) return 'General';
    const matched = departments.find(d => 
      d.id === candidate || 
      d.name.toLowerCase() === String(candidate).toLowerCase() || 
      d.code.toLowerCase() === String(candidate).toLowerCase()
    );
    if (matched) return matched.name;
    if (emp?.department && !emp.department.includes('-')) return emp.department;
    if (candidate.toLowerCase() === '2fa75c7b-6333-4535-b3a7-ea3f6dee1cec' || candidate.toLowerCase().includes('hr')) return 'HR';
    if (candidate.length >= 32 && candidate.includes('-')) return 'General';
    return candidate;
  };

  const getEmployeeForPayroll = (p: PayrollRecord) =>
    employees.find(e => e.employeeId === p.employeeId || e.id === p.employeeId);

  const formatPayrollMonth = (p: PayrollRecord) => {
    const rawMonth = String(p.month || '').trim();
    if (/^\d{4}-\d{2}/.test(rawMonth)) {
      const date = new Date(`${rawMonth.slice(0, 7)}-01T00:00:00`);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    }
    return `${rawMonth || 'Payroll'} ${p.year || ''}`.trim();
  };

  const getRecordCalendarSummary = (p: PayrollRecord) => {
    const emp = getEmployeeForPayroll(p);
    const mNum = resolveMonthNumber(p.month || activeMonthName);
    const yNum = Number(p.year || activeYear);
    const fallbackCalDays = getCalendarDaysInMonth(mNum, yNum);

    if (
      p.calendarDays !== undefined &&
      p.paidWeekOffDays !== undefined &&
      p.paidHolidayDays !== undefined
    ) {
      const calendarDays = toNum(p.calendarDays || p.calendarDaysInMonth) || fallbackCalDays;
      const eligibleDays = toNum(p.eligibleDays ?? calendarDays);
      const workingDays = toNum(p.workingDays ?? p.scheduledWorkingDays);
      const presentDays = toNum(p.presentDays);
      const paidWeekOffDays = toNum(p.paidWeekOffDays);
      const paidHolidayDays = toNum(p.paidHolidayDays);
      const paidLeaveDays = toNum(p.paidLeaveDays ?? p.paidLeaves);
      const lopDays = toNum(p.lopDays ?? p.unpaidLeaves);
      const totalPaidDays = toNum(p.totalPaidDays ?? p.paidDays ?? Math.max(0, eligibleDays - lopDays));
      return {
        calendarDays,
        eligibleDays,
        workingDays,
        presentDays,
        paidWeekOffDays,
        paidHolidayDays,
        paidLeaveDays,
        lopDays,
        totalPaidDays,
      };
    }

    const calc = calculateCalendarDayPayrollAttendance({
      month: mNum,
      year: yNum,
      joiningDate: emp?.joiningDate || emp?.dateOfJoining,
      exitDate: emp?.exitDate || emp?.relievingDate || emp?.lastWorkingDate || emp?.terminationDate,
      weeklyOff: emp?.shiftDetails?.weeklyOff,
      weeklySchedules,
      employeeId: p.employeeId,
      department: emp?.department || p.department,
      holidays: holidayPolicies,
      attendanceRecords,
      leaveRequests,
      sandwichPolicies,
      explicitLopDays: p.lopDays ?? p.unpaidLeaves,
      explicitPaidLeaveDays: p.paidLeaveDays ?? p.paidLeaves,
    });

    return {
      calendarDays: calc.calendarDays,
      eligibleDays: calc.eligibleDays,
      workingDays: calc.workingDays,
      presentDays: calc.presentDays,
      paidWeekOffDays: calc.paidWeekOffDays,
      paidHolidayDays: calc.paidHolidayDays,
      paidLeaveDays: calc.paidLeaveDays,
      lopDays: calc.lopDays,
      totalPaidDays: calc.totalPaidDays,
    };
  };

  const getPayslipRows = (p: PayrollRecord) => {
    const calSummary = getRecordCalendarSummary(p);
    const calendarDays = calSummary.calendarDays;
    const paidDays = calSummary.totalPaidDays;
    const earnings: AmountLine[] = mapPayrollLines(p.earningsBreakdown).map(line => ({
      ...line,
      description: line.description
        ? line.description.replace(/Paid\s+[\d.]+\/[\d.]+\s+days/i, `Paid ${paidDays}/${calendarDays} days`)
        : line.description,
    }));
    const deductions = mapPayrollLines(p.deductionsBreakdown);
    const emp = getEmployeeForPayroll(p);
    const withPf = p.withPf ?? resolveEmployeeWithPf(emp);

    // 1. Ensure all active configured earnings are reflected (e.g. HRA, BASIC, DA, CONV)
    if (activeEarnings.length > 0) {
      const basicAmt = toNum(p.basicSalary) || (emp ? toNum(emp.basicSalary) : 0);
      const basicComp = activeEarnings.find(c => c.code === 'BASIC' || c.name.toLowerCase().includes('basic'));
      const basicPercent = (basicComp?.calculationMethod === 'PERCENTAGE' && basicComp.defaultValue > 0) ? basicComp.defaultValue : 40;
      const totalCtc = toNum(emp?.salaryDetails?.monthlyCtc || (emp as any)?.monthlyCtc) || (basicAmt > 0 && basicPercent > 0 ? Math.round(basicAmt / (basicPercent / 100)) : 15000);
      const factor = calendarDays > 0 ? paidDays / calendarDays : 1;

      activeEarnings.forEach(comp => {
        const compCode = (comp.code || '').trim().toUpperCase();
        const compName = (comp.name || '').trim().toLowerCase();
        const hasComp = earnings.some(e => {
          const lbl = e.label.trim().toLowerCase();
          return lbl.includes(compName) || (compCode && (lbl === compCode.toLowerCase() || lbl.includes(`(${compCode.toLowerCase()})`)));
        });

        if (!hasComp) {
          let compAmt = 0;
          if (compCode === 'HRA' && toNum(p.hra) > 0) {
            compAmt = toNum(p.hra);
          } else if (compCode === 'DA' && toNum(p.da) > 0) {
            compAmt = toNum(p.da);
          } else if ((compCode === 'CONV' || compCode === 'CONVEYANCE') && toNum(p.conveyance) > 0) {
            compAmt = toNum(p.conveyance);
          } else if (comp.calculationMethod === 'PERCENTAGE') {
            const base = comp.percentageBase === 'BASIC' ? basicAmt : totalCtc;
            compAmt = Math.round(((base * (comp.defaultValue || 0)) / 100) * factor);
          } else if (comp.calculationMethod === 'FIXED_AMOUNT') {
            compAmt = Math.round((comp.defaultValue || 0) * factor);
          }

          if (compAmt > 0) {
            earnings.push({
              label: comp.name.trim(),
              amount: compAmt,
              description: comp.calculationMethod === 'PERCENTAGE'
                ? `${comp.defaultValue}% of ${comp.percentageBase || 'CTC'} | Paid ${paidDays}/${calendarDays} days`
                : `Paid ${paidDays}/${calendarDays} days`
            });
          }
        }
      });
    }

    if (earnings.length === 0) {
      const basic = toNum(p.basicSalary);
      const allowances = toNum(p.allowances);
      if (basic > 0) earnings.push({ label: 'Basic Salary', amount: basic, description: `Paid ${paidDays}/${calendarDays} days` });
      if (toNum(p.da) > 0) earnings.push({ label: 'Dearness Allowance', amount: toNum(p.da), description: `Paid ${paidDays}/${calendarDays} days` });
      if (toNum(p.hra) > 0) earnings.push({ label: 'House Rent Allowance', amount: toNum(p.hra), description: `Paid ${paidDays}/${calendarDays} days` });
      if (toNum(p.conveyance) > 0) earnings.push({ label: 'Conveyance Allowance', amount: toNum(p.conveyance), description: `Paid ${paidDays}/${calendarDays} days` });
      if (allowances > 0 && !p.da && !p.hra && !p.conveyance) earnings.push({ label: 'Allowances', amount: allowances, description: `Paid ${paidDays}/${calendarDays} days` });
      if (toNum(p.attendanceBonus) > 0) earnings.push({ label: 'Attendance Bonus', amount: toNum(p.attendanceBonus) });
      if (toNum(p.overtimeAmount) > 0) earnings.push({ label: 'Overtime Earnings', amount: toNum(p.overtimeAmount) });
      if (toNum(p.bonus) > 0) earnings.push({ label: 'Bonus', amount: toNum(p.bonus) });
      if (toNum(p.rewardEarnings) > 0) earnings.push({ label: 'Rewards / Incentives', amount: toNum(p.rewardEarnings) });
    }

    // Apply Payslip Overtime Visibility Settings without altering actual gross/net earnings or statutory disclosures
    const ot = getEmployeeApprovedOt(p);
    const otVisibility = payrollSettingsConfig?.payslipOvertimeVisibility || overtimePolicy?.payslipVisibility;
    if (ot.amount > 0) {
      const otView = formatPayslipOvertimeForViewer({
        overtimeHours: ot.hours,
        overtimeAmount: ot.amount,
        overtimeRate: ot.rate,
        divisorUsed: p.salaryDivisorUsed || batchSalaryDivisor.divisorDays,
        shiftHours: 9,
        visibility: otVisibility
      });
      const otIdx = earnings.findIndex(e => /overtime|\bot\b/i.test(e.label));
      const formattedOtLine: AmountLine = {
        label: otView.showAmount ? otView.label : 'Variable / Extra Duty Allowance',
        amount: ot.amount,
        description: otView.description
      };
      if (otIdx >= 0) {
        earnings[otIdx] = formattedOtLine;
      } else {
        earnings.push(formattedOtLine);
      }
    }

    // 2. Fallback deductions if deductions array was empty
    if (deductions.length === 0) {
      if (toNum(p.epfDeduction) > 0) deductions.push({ label: 'EPF Employee Contribution', amount: toNum(p.epfDeduction), description: 'As per Payroll Settings PF formula' });
      if (toNum(p.esiDeduction) > 0) deductions.push({ label: 'ESIC Employee Contribution', amount: toNum(p.esiDeduction), description: 'As per Payroll Settings ESIC formula' });
      if (toNum(p.professionalTax) > 0) deductions.push({ label: 'Professional Tax', amount: toNum(p.professionalTax) });
      if (toNum(p.taxDeduction) > 0 && deductions.length === 0) deductions.push({ label: 'Statutory / Tax Deductions', amount: toNum(p.taxDeduction) });
      if (toNum(p.lateAttendanceDeduction) > 0) deductions.push({ label: 'Late Attendance Deduction', amount: toNum(p.lateAttendanceDeduction) });
      if (toNum(p.advanceDeduction) > 0) deductions.push({ label: 'Advance Salary / Loan Recovery', amount: toNum(p.advanceDeduction) });
    }

    // 3. Deduplicate Statutory Contributions (prevent EPF & ESIC showing twice)
    const hasPfDeduction = deductions.some(row =>
      /provident|epf|\bpf\b/i.test(row.label)
    );
    const hasEsiDeduction = deductions.some(row =>
      /insurance|esic|\besi\b/i.test(row.label)
    );

    if (withPf) {
      if (!hasPfDeduction && toNum(p.epfDeduction) > 0) {
        deductions.push({ label: 'EPF Employee Contribution', amount: toNum(p.epfDeduction), description: 'As per Payroll Settings PF formula' });
      }
      if (!hasEsiDeduction && toNum(p.esiDeduction) > 0) {
        deductions.push({ label: 'ESIC Employee Contribution', amount: toNum(p.esiDeduction), description: 'As per Payroll Settings ESIC formula' });
      }
    } else {
      if (!hasPfDeduction) {
        deductions.push({ label: 'EPF Employee Contribution', amount: 0, description: 'Exempt (< 6 Months)' });
      }
      if (!hasEsiDeduction) {
        deductions.push({ label: 'ESIC Contribution', amount: 0, description: 'Exempt (< 6 Months)' });
      }
    }

    // Clean up any double additions that might already exist in p.deductionsBreakdown
    const seenDeductions = new Set<string>();
    const uniqueDeductions: AmountLine[] = [];
    for (const d of deductions) {
      const normalizedKey = /provident|epf|\bpf\b/i.test(d.label) ? 'PF_STATUTORY'
        : /insurance|esic|\besi\b/i.test(d.label) ? 'ESI_STATUTORY'
        : d.label.trim().toLowerCase();
      if (!seenDeductions.has(normalizedKey)) {
        seenDeductions.add(normalizedKey);
        uniqueDeductions.push(d);
      }
    }

    const grossEarnings = earnings.reduce((sum, row) => sum + toNum(row.amount), 0) || toNum(p.grossSalary);
    const derivedDeductions = uniqueDeductions.reduce((sum, row) => sum + toNum(row.amount), 0);
    const totalDeductions = toNum(p.totalDeductions) > 0 ? toNum(p.totalDeductions) : derivedDeductions;
    const netPay = Math.max(0, grossEarnings - totalDeductions);

    return {
      earnings,
      deductions: uniqueDeductions,
      grossEarnings,
      totalDeductions,
      netPay,
      calSummary
    };
  };

  // Export Handlers (Excel, PDF, CSV)
  const getPayrollExportData = () => {
    const dynamicColumns = activeEarnings.length > 0
      ? activeEarnings.map(comp => ({
          key: comp.code.toLowerCase(),
          label: `${comp.name}${comp.calculationMethod === 'PERCENTAGE' ? ` (${comp.defaultValue}%)` : ''}`,
          comp
        }))
      : [
          { key: 'basicSalary', label: 'Basic Salary', comp: null },
          { key: 'allowances', label: 'Allowances', comp: null }
        ];

    const columns = [
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'employeeName', label: 'Employee Name' },
      { key: 'department', label: 'Department' },
      { key: 'calendarDays', label: 'Calendar Days' },
      { key: 'workingDays', label: 'Working Days' },
      { key: 'presentDays', label: 'Present Days' },
      { key: 'paidWeekOffDays', label: 'Paid Week Off' },
      { key: 'paidHolidayDays', label: 'Paid Holiday' },
      { key: 'paidLeaveDays', label: 'Paid Leave' },
      { key: 'lopDays', label: 'LOP Days' },
      { key: 'totalPaidDays', label: 'Total Paid Days' },
      ...dynamicColumns.map(d => ({ key: d.key, label: d.label })),
      { key: 'overtimeHours', label: 'Approved OT Hours' },
      { key: 'overtimeAmount', label: 'Approved OT Amount' },
      { key: 'grossSalary', label: 'Gross Salary' },
      { key: 'epfDeduction', label: 'EPF (12%)' },
      { key: 'esiDeduction', label: 'ESIC (0.75%)' },
      { key: 'professionalTax', label: 'PT' },
      { key: 'advanceDeduction', label: 'Advance / Loan EMI' },
      { key: 'totalDeductions', label: 'Deductions' },
      { key: 'netSalary', label: 'Net Pay' },
      { key: 'status', label: 'Status' }
    ];

    const data = visibleRecords.map(p => {
      const emp = employees.find(e => e.employeeId === p.employeeId || e.id === p.employeeId);
      const ot = getEmployeeApprovedOt(p);
      const cal = getRecordCalendarSummary(p);
      const grossVal = toNum(p.grossSalary) || (toNum(p.basicSalary) + toNum(p.allowances) + ot.amount);
      const dedVal = toNum(p.totalDeductions) || (toNum(p.epfDeduction || 0) + toNum(p.esiDeduction || 0) + toNum(p.professionalTax || 0) + toNum(p.advanceDeduction || 0));
      const rowData: Record<string, any> = {
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        department: resolveDepartmentName(p.department, emp),
        calendarDays: cal.calendarDays,
        workingDays: cal.workingDays,
        presentDays: cal.presentDays,
        paidWeekOffDays: cal.paidWeekOffDays,
        paidHolidayDays: cal.paidHolidayDays,
        paidLeaveDays: cal.paidLeaveDays,
        lopDays: cal.lopDays,
        totalPaidDays: cal.totalPaidDays,
        overtimeHours: ot.hours,
        overtimeAmount: ot.amount,
        grossSalary: grossVal,
        advanceDeduction: toNum(p.advanceDeduction || 0),
        epfDeduction: toNum(p.epfDeduction || 0),
        esiDeduction: toNum(p.esiDeduction || 0),
        professionalTax: toNum(p.professionalTax || 0),
        totalDeductions: dedVal,
        netSalary: toNum(p.netSalary),
        status: p.status
      };

      if (activeEarnings.length > 0) {
        dynamicColumns.forEach(d => {
          if (d.comp) {
            rowData[d.key] = getComponentValue(d.comp, p, emp);
          }
        });
      } else {
        rowData.basicSalary = toNum(p.basicSalary);
        rowData.allowances = toNum(p.allowances);
      }

      return rowData;
    });

    return { columns, data };
  };

  const handleExportCSV = () => {
    const { columns, data } = getPayrollExportData();
    downloadCSV(data, `Payroll_Register_${new Date().toISOString().slice(0, 10)}`, columns);
  };

  const handleExportExcel = () => {
    const { columns, data } = getPayrollExportData();
    downloadExcel(data, `Payroll_Register_${new Date().toISOString().slice(0, 10)}`, columns);
  };

  const handleExportPDF = () => {
    const { columns, data } = getPayrollExportData();
    downloadPDF(data, 'Monthly Processed Payroll Register', `Payroll_Register_${new Date().toISOString().slice(0, 10)}`, columns);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">
            {!canViewAllPayroll ? 'My Payroll & Payslips' : 'Payroll Management'}
          </h1>
        </div>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {canProcessPayroll && (
            <>
              <button className="btn btn-primary" onClick={processPayrollBatch}>
                <CreditCard size={16} /> Process {currentMonthInfo.monthLong} Payroll Batch
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => recalculatePayrollBatch(activeMonthName, activeYear, false)}
                title={`Recalculate ${activeMonthName} ${activeYear} processed records using Calendar Day Payroll (Paid/Locked records are preserved)`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderColor: '#0E7490', color: '#0E7490', fontWeight: 700 }}
              >
                <RefreshCw size={15} /> Recalculate {activeMonthName} Batch
              </button>
            </>
          )}
          {canMarkPaid && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={unpaidVisibleIds.length === 0}
                onClick={() => handleMarkPaid(unpaidVisibleIds)}
                style={{ backgroundColor: '#0E7490', borderColor: '#0E7490', opacity: unpaidVisibleIds.length === 0 ? 0.6 : 1 }}
                title="Mark all unpaid salary records as paid"
              >
                <IndianRupee size={16} /> Mark All as Paid ({unpaidVisibleIds.length})
              </button>
            </>
          )}
        </div>
      </div>

      {canProcessPayroll && !canViewAllPayroll && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: '#ECFEFF',
          border: '1px solid #A5F3FC',
          color: '#155E75',
          fontSize: '0.85rem',
          fontWeight: 500
        }}>
          <ShieldAlert size={18} color="#0E7490" />
          <span>
            You can process the payroll batch. The full employee payroll register is visible only to the Accounts team and CEO — below are your own payslips.
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>{canViewAllPayroll ? `Total ${activeMonthName} Net Payout` : 'My Total Net Pay'}</span>
            <div className="kpi-icon-wrapper emerald"><IndianRupee size={20} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{formatCurrency(totalPayout)}</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>{canViewAllPayroll ? 'Total Staff Included' : 'Payslips Available'}</span>
            <div className="kpi-icon-wrapper blue"><CreditCard size={20} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{canViewAllPayroll ? totalStaffIncluded : visibleRecords.length}</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>Processed Payroll Runs</span>
            <div className="kpi-icon-wrapper purple"><CheckCircle2 size={20} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{processedCount}</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>{canViewAllPayroll ? 'Approved Overtime (Batch)' : 'My Approved Overtime'}</span>
            <div className="kpi-icon-wrapper amber"><Clock size={20} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{formatCurrency(totalBatchOtStats.amount)}</div>
            <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
              {totalBatchOtStats.hours} hrs ({totalBatchOtStats.employeesCount} eligible)
            </div>
          </div>
        </div>
      </div>

      {/* Payroll Records Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>
                {!canViewAllPayroll ? 'My Payslips History' : `${activeMonthName} ${activeYear} Processed Salary Batch`}
              </h3>
            </div>
            <span style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              color: '#0E7490',
              backgroundColor: '#ECFEFF',
              border: '1px solid #A5F3FC',
              padding: '4px 10px',
              borderRadius: '999px'
            }}>
              Calendar Month: {batchCalendarDays} Days • Calendar Day Proration (Paid Days / {batchCalendarDays})
            </span>
            {canViewAllPayroll && availableBatches.length > 1 && (
              <select
                value={selectedBatch}
                onChange={e => {
                  setSelectedBatch(e.target.value);
                  setCurrentPage(1);
                  setSelectedPayslipIds([]);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#0E7490',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  outline: 'none'
                }}
                aria-label="Select Salary Batch Month"
              >
                {availableBatches.map(b => (
                  <option key={b.label} value={b.label}>{b.label}</option>
                ))}
              </select>
            )}
          </div>
          {canViewAllPayroll && (
            <ExportDropdown 
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
              onExportCSV={handleExportCSV}
            />
          )}
        </div>

        <div className="table-responsive payroll-desktop-table">
          <table className="hrms-table">
            <thead>
              <tr>
                {!isEmployeeRole && (
                  <th style={{ width: '40px', minWidth: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={displayedRecords.length > 0 && displayedRecords.every(p => selectedPayslipIds.includes(p.id))}
                      onChange={handleToggleSelectAll}
                      style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                      aria-label="Select all payslips"
                    />
                  </th>
                )}
                <th>Employee</th>
                <th>Department</th>
                {activeEarnings.length > 0 ? (
                  activeEarnings.map(comp => (
                    <th key={comp.id}>
                      {comp.name} {comp.calculationMethod === 'PERCENTAGE' ? `(${comp.defaultValue}%)` : ''}
                    </th>
                  ))
                ) : (
                  <>
                    <th>Basic Salary</th>
                    <th>Allowances</th>
                  </>
                )}
                <th>Approved Overtime</th>
                <th>Statutory & Tax</th>
                <th>Payable Days</th>
                <th>Net Salary</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedRecords.length === 0 ? (
                <tr>
                  <td 
                    colSpan={isEmployeeRole ? (activeEarnings.length > 0 ? activeEarnings.length + 7 : 8) : (activeEarnings.length > 0 ? activeEarnings.length + 8 : 9)} 
                    style={{ textAlign: 'center', padding: '36px 20px', color: '#64748B' }}
                  >
                    No payslip records found.
                  </td>
                </tr>
              ) : (
                displayedRecords.map(p => {
                  const isSelected = selectedPayslipIds.includes(p.id);
                  const emp = employees.find(e => e.employeeId === p.employeeId || e.id === p.employeeId);
                  const basic = toNum(p.basicSalary);
                  const statutoryTax = toNum(p.epfDeduction || 0) + toNum(p.esiDeduction || 0) + toNum(p.professionalTax || 0);
                  const ot = getEmployeeApprovedOt(p);
                  const cal = getRecordCalendarSummary(p);

                  return (
                    <tr 
                      key={p.id}
                      style={{
                        backgroundColor: isSelected ? '#ECFEFF' : undefined,
                        borderLeft: isSelected ? '4px solid #0E7490' : undefined,
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {!isEmployeeRole && (
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', width: '40px' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleTogglePayslip(p.id)}
                            style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                            aria-label={`Select payslip for ${p.employeeName}`}
                          />
                        </td>
                      )}
                    <td>
                      <div>
                        <strong>{p.employeeName}</strong>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{p.employeeId}</span>
                          {p.withPf === false ? (
                            <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>
                              No PF (&lt;6M)
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#ECFDF5', color: '#065F46', fontWeight: 600 }}>
                              PF Active
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{resolveDepartmentName(p.department, emp)}</td>
                    {activeEarnings.length > 0 ? (
                      activeEarnings.map(comp => {
                        const val = getComponentValue(comp, p, emp);
                        return (
                          <td key={comp.id}>
                            {formatCurrency(val)}
                          </td>
                        );
                      })
                    ) : (
                      <>
                        <td>{formatCurrency(basic)}</td>
                        <td>+{formatCurrency(p.allowances)}</td>
                      </>
                    )}
                    <td>
                      {ot.hours > 0 || ot.amount > 0 ? (
                        <div>
                          <strong style={{ color: '#0E7490' }}>+{formatCurrency(ot.amount)}</strong>
                          <div style={{ fontSize: '0.72rem', color: '#0369A1', fontWeight: 600 }}>
                            {ot.hours} hrs{ot.rate > 0 ? ` @ ₹${ot.rate}/hr` : ''}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>₹0.00 (0 hrs)</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--accent-rose)' }}>
                      -{formatCurrency(statutoryTax)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>
                        {cal.totalPaidDays} / {cal.calendarDays} days
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                        Work: {cal.workingDays} • Pres: {cal.presentDays} • WO: {cal.paidWeekOffDays}
                        {cal.paidHolidayDays > 0 ? ` • Hol: ${cal.paidHolidayDays}` : ''}
                        {cal.paidLeaveDays > 0 ? ` • PL: ${cal.paidLeaveDays}` : ''}
                        {cal.lopDays > 0 ? ` • LOP: ${cal.lopDays}` : ''}
                      </div>
                    </td>
                    <td><strong style={{ color: 'var(--accent-emerald)', fontSize: '0.95rem' }}>{formatCurrency(p.netSalary)}</strong></td>
                    <td><span className={`status-pill ${p.status === 'Paid' ? 'approved' : 'cyan'}`}>{p.status}</span></td>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setPreviewRecord(p)}
                          title="Payroll Preview"
                          aria-label="Payroll Preview"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            color: '#0E7490'
                          }}
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => setSelectedPayslip(p)}
                          title="View Payslip"
                          aria-label="View Payslip"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            color: '#0E7490'
                          }}
                        >
                          <FileText size={16} />
                        </button>
                        {canMarkPaid && p.status !== 'Paid' && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleMarkPaid([p.id])}
                            title={`Hand over ${formatCurrency(p.netSalary)} to ${p.employeeName} and mark as paid`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              backgroundColor: '#0E7490',
                              borderColor: '#0E7490'
                            }}
                          >
                            <IndianRupee size={13} /> Mark Paid
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

        {/* Mobile Payslip Cards */}
        <div className="payroll-mobile-cards" style={{ padding: '12px' }}>
          {displayedRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
              <FileText size={36} color="#94A3B8" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 750, fontSize: '0.92rem', color: '#1E293B' }}>No Payslips Available</div>
              <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '4px 0 0' }}>No salary records found for the selected period.</p>
            </div>
          ) : (
            displayedRecords.map(p => {
              const emp = employees.find(e => e.employeeId === p.employeeId || e.id === p.employeeId);
              const basic = toNum(p.basicSalary);
              const advance = toNum(p.advanceDeduction || 0);
              const statutoryTax = toNum(p.epfDeduction || 0) + toNum(p.esiDeduction || 0) + toNum(p.professionalTax || 0);
              const cal = getRecordCalendarSummary(p);

              return (
                <div key={p.id} className="mobile-payroll-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>{p.employeeName}</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                        {p.employeeId} • {resolveDepartmentName(p.department, emp)}
                      </div>
                    </div>
                    <span className={`status-pill ${p.status === 'Paid' ? 'approved' : 'cyan'}`}>
                      {p.status}
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#ECFEFF',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #A5F3FC'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#0E7490' }}>Net Salary Payout</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                        Paid {cal.totalPaidDays} / {cal.calendarDays} days (Work: {cal.workingDays}, WO: {cal.paidWeekOffDays}, LOP: {cal.lopDays})
                      </div>
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0E7490' }}>
                      {formatCurrency(p.netSalary)}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px' }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Basic Salary</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B' }}>{formatCurrency(basic)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Approved OT</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0E7490' }}>
                        {(() => {
                          const mobOt = getEmployeeApprovedOt(p);
                          return mobOt.hours > 0 || mobOt.amount > 0
                            ? `+${formatCurrency(mobOt.amount)} (${mobOt.hours}h)`
                            : '₹0.00';
                        })()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Deductions</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E11D48' }}>
                        -{formatCurrency(advance + statutoryTax)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPreviewRecord(p)}
                      style={{ borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Eye size={14} />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedPayslip(p)}
                      style={{ flex: 1, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <FileText size={14} />
                      <span>View Payslip</span>
                    </button>
                    {canMarkPaid && p.status !== 'Paid' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleMarkPaid([p.id])}
                        style={{ borderRadius: '10px', backgroundColor: '#0E7490', borderColor: '#0E7490', fontWeight: 700 }}
                      >
                        <IndianRupee size={14} /> Pay
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Standardized Table Pagination */}
        {!isEmployeeRole && (
          <StandardTablePagination
            currentPage={currentPage}
            totalEntries={totalEntries}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[5, 10]}
          />
        )}
      </div>

      {/* Floating Action Bar per AGENTS.md */}
      {!isEmployeeRole && (
        <StandardFloatingActionBar
          selectedCount={selectedPayslipIds.length}
          onClearSelection={() => setSelectedPayslipIds([])}
          onEdit={selectedPayslipIds.length === 1 ? () => {
            const rec = visibleRecords.find(p => p.id === selectedPayslipIds[0]);
            if (rec) setSelectedPayslip(rec);
          } : undefined}
          customActions={canMarkPaid && selectedUnpaidIds.length > 0 ? (
            <button
              className="action-bar-btn"
              onClick={() => handleMarkPaid(selectedUnpaidIds)}
              title="Mark selected salaries as paid"
            >
              <IndianRupee size={14} />
              <span>Mark Paid ({selectedUnpaidIds.length})</span>
            </button>
          ) : undefined}
        />
      )}

      {/* Modal: Edit Advance / Loan Recovery ("Others") */}
      {editingAdvance && (
        <div className="modal-overlay" style={{ zIndex: 20000 }}>
          <div className="modal-content" style={{ maxWidth: '420px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={18} color="#0E7490" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                  Edit Advance Salary / Loan Recovery
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingAdvance(null)} 
                style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '18px 20px' }}>
              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '0.82rem' }}>
                <div>Employee: <strong>{editingAdvance.employeeName}</strong></div>
                <div style={{ color: '#64748B', marginTop: '2px' }}>Deduction Category: <strong>Others (Advance / Loan Recovery)</strong></div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Monthly Recovery Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  className="form-control"
                  value={advanceInputVal}
                  onChange={(e) => setAdvanceInputVal(Math.max(0, Number(e.target.value) || 0))}
                  style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0E7490', width: '100%' }}
                  placeholder="0"
                  autoFocus
                />
                <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '6px', display: 'block' }}>
                  Adjustable by HR, CEO, and Accounts team. Set to ₹0.00 to pause or defer deduction for this run.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setEditingAdvance(null)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary btn-sm"
                  style={{ backgroundColor: '#0E7490', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={handleSaveAdvanceDeduction}
                >
                  Save Recovery Amount
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payroll Preview Modal (Requirement 11) */}
      {previewRecord && (() => {
        const emp = getEmployeeForPayroll(previewRecord);
        const rows = getPayslipRows(previewRecord);
        const cal = rows.calSummary;
        const monthLabel = formatPayrollMonth(previewRecord);

        return (
          <div className="modal-overlay" style={{ zIndex: 19000 }}>
            <div className="modal-content" style={{ maxWidth: '680px', width: '100%', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
              <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800, color: '#0F172A' }}>
                    Payroll Preview — {previewRecord.employeeName}
                  </h2>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                    {previewRecord.employeeId} • {resolveDepartmentName(previewRecord.department, emp)} • {monthLabel}
                  </div>
                </div>
                <button
                  type="button"
                  className="close-btn"
                  onClick={() => setPreviewRecord(null)}
                  aria-label="Close Preview"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body" style={{ padding: '18px 20px' }}>
                {/* 8-Item Attendance & Calendar Day Breakdown Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                  gap: '10px',
                  marginBottom: '16px'
                }}>
                  {[
                    { label: 'Calendar Days', value: cal.calendarDays, color: '#0F172A', bg: '#F8FAFC' },
                    { label: 'Working Days', value: cal.workingDays, color: '#0F172A', bg: '#F8FAFC' },
                    { label: 'Present Days', value: cal.presentDays, color: '#0369A1', bg: '#F0F9FF' },
                    { label: 'Paid Week Off', value: cal.paidWeekOffDays, color: '#0E7490', bg: '#ECFEFF' },
                    { label: 'Paid Holiday', value: cal.paidHolidayDays, color: '#0E7490', bg: '#ECFEFF' },
                    { label: 'Paid Leave', value: cal.paidLeaveDays, color: '#15803D', bg: '#F0FDF4' },
                    { label: 'LOP Days', value: cal.lopDays, color: cal.lopDays > 0 ? '#DC2626' : '#64748B', bg: cal.lopDays > 0 ? '#FEF2F2' : '#F8FAFC' },
                    { label: 'Total Paid Days', value: `${cal.totalPaidDays} / ${cal.calendarDays}`, color: '#0E7490', bg: '#ECFEFF' }
                  ].map(item => (
                    <div
                      key={item.label}
                      style={{
                        backgroundColor: item.bg,
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '10px 12px'
                      }}
                    >
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: item.color, marginTop: '4px' }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Financial Summary Cards: Gross Salary | Deductions | Net Pay */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: '10px',
                  marginBottom: '16px'
                }}>
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Gross Salary</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0E7490', marginTop: '4px' }}>{formatCurrency(rows.grossEarnings)}</div>
                  </div>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>Deductions</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#E11D48', marginTop: '4px' }}>{formatCurrency(rows.totalDeductions)}</div>
                  </div>
                  <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#065F46', textTransform: 'uppercase' }}>Net Pay</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669', marginTop: '4px' }}>{formatCurrency(rows.netPay)}</div>
                  </div>
                </div>

                <DynamicAmountTable
                  earnings={rows.earnings}
                  deductions={rows.deductions}
                  grossEarnings={rows.grossEarnings}
                  totalDeductions={rows.totalDeductions}
                  showDescription={true}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPreviewRecord(null)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ backgroundColor: '#0E7490', borderColor: '#0E7490', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => {
                      const target = previewRecord;
                      setPreviewRecord(null);
                      setSelectedPayslip(target);
                    }}
                  >
                    <FileText size={14} /> Open Official Payslip
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Printable Payslip Modal */}
      {selectedPayslip && (() => {
        const emp = getEmployeeForPayroll(selectedPayslip);
        const rows = getPayslipRows(selectedPayslip);
        const cal = rows.calSummary;
        const paidDays = cal.totalPaidDays;
        const monthLabel = formatPayrollMonth(selectedPayslip);
        const fileMonth = monthLabel.replace(/\s+/g, '_');

        return (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '780px', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
              <div className="modal-header payslip-modal-header">
                <div className="payslip-modal-header-top">
                  <h2>Official Employee Payslip</h2>
                  <button type="button" className="close-btn payslip-close-mobile" onClick={() => setSelectedPayslip(null)} aria-label="Close">
                    <X size={20} />
                  </button>
                </div>
                <div className="payslip-modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => printElement('printable-payslip-content', `Payslip_${selectedPayslip.employeeName.replace(/\s+/g, '_')}_${fileMonth}`, documentProfile.companyName)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Printer size={14} /> Print
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={async () => {
                      setIsDownloadingPdf(true);
                      try {
                        await downloadElementAsDirectPdf('printable-payslip-content', `Payslip_${selectedPayslip.employeeName.replace(/\s+/g, '_')}_${fileMonth}`, documentProfile.companyName);
                      } catch (err) {
                        console.error('Direct PDF download error:', err);
                      } finally {
                        setIsDownloadingPdf(false);
                      }
                    }}
                    disabled={isDownloadingPdf}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#0E7490', border: 'none', opacity: isDownloadingPdf ? 0.75 : 1 }}
                  >
                    <Download size={14} /> {isDownloadingPdf ? 'Downloading PDF...' : 'Download PDF'}
                  </button>
                  <button type="button" className="close-btn payslip-close-desktop" onClick={() => setSelectedPayslip(null)} aria-label="Close">
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="modal-body" style={{ minWidth: 0, boxSizing: 'border-box' }}>
                <div className="payslip-container" id="printable-payslip-content">
                  <CompanyHeader
                    profile={documentProfile}
                    title={`Payslip for ${monthLabel}`}
                    rightMeta={[
                      { label: 'Status', value: selectedPayslip.status }
                    ]}
                  />

                  {(() => {
                    const basicAmt = toNum(selectedPayslip.basicSalary) || (emp ? toNum(emp.basicSalary) : 0);
                    const basicComp = activeEarnings.find(c => c.code === 'BASIC' || c.name.toLowerCase().includes('basic'));
                    const basicPercent = (basicComp?.calculationMethod === 'PERCENTAGE' && basicComp.defaultValue > 0) ? basicComp.defaultValue : 40;
                    const computedCtc = toNum(emp?.salaryDetails?.monthlyCtc || (emp as any)?.monthlyCtc || emp?.grossSalary) ||
                      (basicAmt > 0 && basicPercent > 0 ? Math.round(basicAmt / (basicPercent / 100)) : 0) ||
                      (paidDays > 0 && cal.calendarDays > 0 ? Math.round((toNum(rows.grossEarnings) / paidDays) * cal.calendarDays) : 0);
                    const payslipOt = getEmployeeApprovedOt(selectedPayslip);
                    const otVis = payrollSettingsConfig?.payslipOvertimeVisibility || overtimePolicy?.payslipVisibility;
                    const showOtHours = (otVis?.showOtHoursOnPayslip ?? true) && payslipOt.hours > 0;

                    return (
                      <>
                        <EmployeeDetailsGrid
                          rows={[
                            { label: 'Employee Name', value: selectedPayslip.employeeName },
                            { label: 'Employee ID', value: selectedPayslip.employeeId },
                            { label: 'Department', value: resolveDepartmentName(selectedPayslip.department, emp) },
                            { label: 'Designation', value: selectedPayslip.designation },
                            { label: 'Date of Joining', value: formatDateDDMMYYYY(emp?.joiningDate || emp?.dateOfJoining) || '—' },
                            { label: 'Employee CTC', value: computedCtc > 0 ? formatCurrency(computedCtc) : '—' },
                            { label: 'Bank Account', value: emp?.bankDetails?.accountNumber },
                            { label: 'PAN', value: emp?.salaryDetails?.panNumber },
                            { label: 'UAN', value: emp?.salaryDetails?.uanNumber },
                            { label: 'Working Days', value: cal.workingDays },
                            { label: 'Paid Days', value: `${cal.totalPaidDays} / ${cal.calendarDays}` },
                            ...(showOtHours ? [{ label: 'Approved OT Hours', value: `${payslipOt.hours} hrs` }] : []),
                            { label: 'Payroll Month', value: monthLabel },
                            { label: 'Payment Status', value: selectedPayslip.status }
                          ]}
                        />

                        {/* Attendance & Calendar Day Breakdown Strip (Printed on Payslip & PDF) */}
                        <div
                          className="employee-details-grid-doc"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                            gap: '6px 12px',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            fontSize: '0.74rem',
                            marginBottom: '12px',
                            pageBreakInside: 'avoid'
                          }}
                        >
                          <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>Calendar Days: </span>
                            <span style={{ color: '#0f172a', fontWeight: 700 }}>{cal.calendarDays}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>Working Days: </span>
                            <span style={{ color: '#0f172a', fontWeight: 700 }}>{cal.workingDays}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>Present Days: </span>
                            <span style={{ color: '#0f172a', fontWeight: 700 }}>{cal.presentDays}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>Paid Week Off: </span>
                            <span style={{ color: '#0E7490', fontWeight: 700 }}>{cal.paidWeekOffDays}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>Paid Holiday: </span>
                            <span style={{ color: '#0E7490', fontWeight: 700 }}>{cal.paidHolidayDays}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>Paid Leave: </span>
                            <span style={{ color: '#15803d', fontWeight: 700 }}>{cal.paidLeaveDays}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>LOP Days: </span>
                            <span style={{ color: cal.lopDays > 0 ? '#dc2626' : '#0f172a', fontWeight: 700 }}>{cal.lopDays}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>Total Paid Days: </span>
                            <span style={{ color: '#0E7490', fontWeight: 800 }}>{cal.totalPaidDays}</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  <DynamicAmountTable
                    earnings={rows.earnings}
                    deductions={rows.deductions}
                    grossEarnings={rows.grossEarnings}
                    totalDeductions={rows.totalDeductions}
                    showDescription={Boolean((payrollSettingsConfig?.payslipOvertimeVisibility || overtimePolicy?.payslipVisibility)?.showOtCalculationDetailsOnPayslip)}
                  />

                  <NetPaySection netPay={rows.netPay} />
                  <AuthorizedSignatory profile={documentProfile} />
                  <CompanyFooter profile={documentProfile} />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Legacy payslip renderer disabled: new renderer above uses processed payroll output only. */}
      {false && (() => {
        const selectedPayslip = null as unknown as PayrollRecord;
        const basicSalary = toNum(selectedPayslip.basicSalary);
        const da = toNum(selectedPayslip.da ?? Math.round(basicSalary * 0.5));
        const conveyance = toNum(selectedPayslip.conveyance ?? Math.round(basicSalary * 0.125));
        const hra = toNum(selectedPayslip.hra ?? Math.round(basicSalary * 0.875));
        const attBonus = toNum(selectedPayslip.attendanceBonus || 0);
        const otAmount = toNum(selectedPayslip.overtimeAmount || 0);
        const rewardBonus = toNum(selectedPayslip.bonus) + toNum(selectedPayslip.rewardEarnings || 0);

        const totalGross = basicSalary + da + conveyance + hra + attBonus + otAmount + rewardBonus;

        const isWithPf = selectedPayslip.withPf !== undefined 
          ? selectedPayslip.withPf 
          : (toNum(selectedPayslip.epfDeduction) > 0);

        const epfDeduction = isWithPf 
          ? toNum(selectedPayslip.epfDeduction || Math.round((basicSalary + da + conveyance) * 0.12))
          : 0;
        const esiDeduction = isWithPf
          ? toNum(selectedPayslip.esiDeduction || (totalGross <= 21000 ? Math.round(totalGross * 0.0075) : 0))
          : 0;
        const ptDeduction = toNum(selectedPayslip.professionalTax || 0);
        const advanceRecovery = toNum(selectedPayslip.advanceDeduction || 0);
        const leaveDeduction = toNum(selectedPayslip.leaveDeduction || 0);
        const lateDeduction = toNum(selectedPayslip.lateAttendanceDeduction || 0);

        const totalDeductions = epfDeduction + esiDeduction + ptDeduction + advanceRecovery + leaveDeduction + lateDeduction;
        const netSalary = Math.max(0, totalGross - totalDeductions);

        return (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '720px' }}>
              <div className="modal-header">
                <h2>Official Employee Payslip</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button"
                    className="btn btn-primary btn-sm" 
                    onClick={() => downloadElementAsPDF('printable-payslip-content', `Payslip_${selectedPayslip.employeeName.replace(/\s+/g, '_')}_${selectedPayslip.month}_${selectedPayslip.year}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#0E7490', border: 'none' }}
                  >
                    <Download size={14} /> Download PDF
                  </button>
                  <button onClick={() => setSelectedPayslip(null)}><X size={20} /></button>
                </div>
              </div>
              <div className="modal-body">
                <div className="payslip-container" id="printable-payslip-content">
                  <div className="payslip-header">
                    <div>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0E7490' }}>
                        {businessSettings?.businessName || 'Businz'}
                      </h2>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {businessSettings?.address || 'Plot 42, Heavy Industrial Growth Estate, Guindy, Chennai, Tamil Nadu - 600032'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>PAYSLIP: {selectedPayslip.month.toUpperCase()} {selectedPayslip.year}</h3>
                    </div>
                  </div>

                  {/* Scheme & Details Banner */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isWithPf ? '#ECFDF5' : '#FFFBEB', border: isWithPf ? '1px solid #A7F3D0' : '1px solid #FDE68A', padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isWithPf ? <ShieldCheck size={16} color="#059669" /> : <ShieldAlert size={16} color="#D97706" />}
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isWithPf ? '#065F46' : '#92400E' }}>
                        Salary Scheme: {isWithPf ? 'With PF & ESIC Deductions (Active)' : 'Without PF & ESIC (Probation / < 6 Months Policy)'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '0.82rem', marginBottom: '20px', backgroundColor: '#f8fafc', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <div><strong>Employee Name:</strong> {selectedPayslip.employeeName}</div>
                    <div><strong>Employee ID:</strong> {selectedPayslip.employeeId}</div>
                    <div><strong>Department:</strong> {selectedPayslip.department}</div>
                    <div><strong>Designation:</strong> {selectedPayslip.designation}</div>
                    <div>
                      <strong>Attendance:</strong> {selectedPayslip.presentDays} / {selectedPayslip.workingDays} days
                      {selectedPayslip.presentDays === selectedPayslip.workingDays && (
                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 600 }}>
                          100% Perfect Attendance
                        </span>
                      )}
                    </div>
                    <div><strong>Payment Status:</strong> <span className="status-pill approved">{selectedPayslip.status}</span></div>
                  </div>

                  <table className="payslip-table">
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9' }}>
                        <th style={{ width: '35%' }}>Earnings & Allowances</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Amount (₹)</th>
                        <th style={{ width: '35%' }}>Deductions & Recoveries</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const emp = employees.find(e => e.employeeId === selectedPayslip.employeeId || e.id === selectedPayslip.employeeId);
                        const earningsList: { label: string; amount: number; isBold?: boolean; isGreen?: boolean; sub?: string }[] = [];

                        if (activeEarnings.length > 0) {
                          activeEarnings.forEach(comp => {
                            earningsList.push({
                              label: `${comp.name} ${comp.calculationMethod === 'PERCENTAGE' ? `(${comp.defaultValue}%)` : ''}`,
                              amount: getComponentValue(comp, selectedPayslip, emp)
                            });
                          });
                        } else {
                          earningsList.push({ label: 'Basic Salary', amount: basicSalary });
                          if (da > 0) earningsList.push({ label: 'Dearness Allowance (DA)', amount: da });
                          if (conveyance > 0) earningsList.push({ label: 'Conveyance Allowance', amount: conveyance });
                          if (hra > 0) earningsList.push({ label: 'House Rent Allowance (HRA)', amount: hra });
                        }

                        if (attBonus > 0) {
                          earningsList.push({ label: 'Attendance Bonus', amount: attBonus, isGreen: true, sub: 'Awarded for 0 LOP in Month' });
                        }
                        if (otAmount > 0) {
                          earningsList.push({ label: 'Overtime Earnings', amount: otAmount });
                        }
                        if (rewardBonus > 0) {
                          earningsList.push({ label: 'Performance Bonus & Rewards', amount: rewardBonus });
                        }

                        const deductionsList: { label: string; amount: number; isRed?: boolean; sub?: string; isExempt?: boolean }[] = [];
                        deductionsList.push({
                          label: 'EPF Employee Contribution (12%)',
                          amount: epfDeduction,
                          isExempt: !isWithPf,
                          sub: !isWithPf ? 'Exempt (< 6 Months)' : undefined
                        });
                        deductionsList.push({
                          label: 'ESIC Contribution (0.75%)',
                          amount: esiDeduction,
                          isExempt: !isWithPf,
                          sub: !isWithPf ? 'Exempt (< 6 Months)' : undefined
                        });
                        if (ptDeduction > 0) {
                          deductionsList.push({ label: 'Professional Tax (PT)', amount: ptDeduction });
                        }
                        if (advanceRecovery > 0) {
                          const remainingBal = loanRecords.find(r => r.employeeId === selectedPayslip.employeeId && (r.status === 'Active' || r.status === 'Disbursed'))?.outstandingBalance;
                          deductionsList.push({
                            label: 'Others (Advance Salary / Loan Recovery)',
                            amount: advanceRecovery,
                            isRed: true,
                            sub: remainingBal ? `Remaining Balance: ${formatCurrency(remainingBal)}` : undefined
                          });
                        }
                        if (leaveDeduction > 0) {
                          deductionsList.push({ label: 'Loss of Pay (Unpaid Leave Deduction)', amount: leaveDeduction, isRed: true });
                        }
                        if (lateDeduction > 0) {
                          deductionsList.push({ label: 'Late Attendance Penalty', amount: lateDeduction, isRed: true });
                        }

                        const maxRows = Math.max(earningsList.length, deductionsList.length);
                        return Array.from({ length: maxRows }).map((_, idx) => {
                          const earn = earningsList[idx];
                          const ded = deductionsList[idx];
                          return (
                            <tr key={idx}>
                              <td>
                                {earn ? (
                                  <>
                                    <span>{earn.label}</span>
                                    {earn.sub && <span style={{ display: 'block', fontSize: '0.68rem', color: '#059669' }}>{earn.sub}</span>}
                                  </>
                                ) : ''}
                              </td>
                              <td style={{ textAlign: 'right', color: earn?.isGreen ? '#059669' : 'inherit', fontWeight: earn?.isGreen ? 700 : 400 }}>
                                {earn ? formatCurrency(earn.amount) : ''}
                              </td>
                              <td>
                                {ded ? (
                                  <>
                                    <span>{ded.label}</span>
                                    {ded.sub && (
                                      <span style={{ display: 'block', fontSize: '0.68rem', color: ded.isExempt ? '#D97706' : '#64748B' }}>
                                        {ded.sub}
                                      </span>
                                    )}
                                  </>
                                ) : ''}
                              </td>
                              <td style={{ 
                                textAlign: 'right', 
                                color: ded?.isRed ? 'var(--accent-rose)' : (ded?.isExempt ? '#94A3B8' : 'inherit'),
                                fontWeight: ded?.isRed ? 600 : 400
                              }}>
                                {ded ? (ded.amount > 0 ? (ded.isRed ? `-${formatCurrency(ded.amount)}` : formatCurrency(ded.amount)) : (ded.isExempt ? '₹0.00' : '₹0.00')) : ''}
                              </td>
                            </tr>
                          );
                        });
                      })()}

                      <tr style={{ fontWeight: 800, backgroundColor: '#f8fafc' }}>
                        <td>Total Gross Earnings</td>
                        <td style={{ textAlign: 'right', color: '#0E7490' }}>{formatCurrency(totalGross)}</td>
                        <td>Total Deductions</td>
                        <td style={{ textAlign: 'right', color: 'var(--accent-rose)' }}>{formatCurrency(totalDeductions)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div style={{ borderTop: '2px solid var(--primary-600)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '1rem', fontWeight: 800 }}>NET PAYABLE SALARY:</span>
                      <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '2px 0 0 0' }}>
                        Direct Bank Transfer to Registered Account
                      </p>
                    </div>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                      {formatCurrency(netSalary)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
