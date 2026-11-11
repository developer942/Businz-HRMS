import { LeaveRequest, Employee, AttendanceRecord, HolidayItem } from '../types/hrms';
import { MasterLeavePolicy } from '../types/settings';
import { normalizeToYYYYMMDD } from '../utils/dateUtils';
import { getTodayKolkata } from '../utils/requestValidation';

export interface EmployeeLeaveTypeBalance {
  id: string;
  name: string;
  code: string;
  isPaid: boolean;
  annualQuota: number;
  baseQuota: number;
  carriedForwardDays: number;
  allowCarryForward: boolean;
  maxCarryForwardDays: number;
  allowEncashment: boolean;
  maxEncashableDays: number;
  encashableDays: number;
  minBalanceForEncashment: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  policyName: string;
  policyTag: string;
  applicableScope?: string;
}

export interface EmployeeTotalLeaveSummary {
  totalAnnualQuota: number;
  totalPaidUsed: number;
  totalPaidPending: number;
  totalPaidRemaining: number;
  totalUnpaidUsed: number;
  approvedUnpaidDays: number;
  rejectedLeaveAbsentDays: number;
  uninformedAbsentDays: number;
  balances: EmployeeLeaveTypeBalance[];
}

export const isWfhOrRemoteLeaveType = (leaveType?: string): boolean => {
  const lt = (leaveType || '').toLowerCase().trim();
  return (
    lt.includes('work from home') ||
    lt === 'wfh' ||
    lt.includes('wfh') ||
    lt.includes('wfo') ||
    lt.includes('work from office') ||
    lt.includes('field visit') ||
    lt.includes('on duty')
  );
};

export const isExplicitUnpaidLeaveType = (leaveType?: string): boolean => {
  const lt = (leaveType || '').toLowerCase().trim();
  return lt.includes('unpaid') || lt.includes('lwp') || lt.includes('loss of pay') || lt.includes('without pay') || lt === 'lop';
};

/**
 * Normalizes and checks if a leave request's type matches a policy leave type
 */
export const isMatchingLeaveType = (reqType?: string, policyType?: string): boolean => {
  if (!reqType || !policyType) return false;
  const r = reqType.toLowerCase().trim();
  const p = policyType.toLowerCase().trim();
  if (r === p) return true;

  // Guard: WFH / Remote Duty never matches regular leave policies
  const rWfh = isWfhOrRemoteLeaveType(r);
  const pWfh = isWfhOrRemoteLeaveType(p);
  if (rWfh || pWfh) return rWfh && pWfh;

  // Guard: Unpaid / LWP strictly matches only Unpaid / LWP policies (prevent 'unpaid leave' matching 'paid leave')
  const rUnpaid = isExplicitUnpaidLeaveType(r);
  const pUnpaid = isExplicitUnpaidLeaveType(p);
  if (rUnpaid || pUnpaid) return rUnpaid && pUnpaid;

  // Exact normalized match (removing punctuation, spaces, brackets)
  const rClean = r.replace(/[^a-z0-9]/g, '');
  const pClean = p.replace(/[^a-z0-9]/g, '');
  if (rClean === pClean) return true;

  // Keyword token mapping
  const categories = [
    { key: 'sick', tokens: ['sick', 'sl', 'medical'] },
    { key: 'earned', tokens: ['earned', 'el', 'annual', 'privilege', 'pl', 'paid leave', 'paid'] },
    { key: 'casual', tokens: ['casual', 'cl'] },
    { key: 'maternity', tokens: ['maternity'] },
    { key: 'paternity', tokens: ['paternity'] },
  ];

  for (const cat of categories) {
    const rHas = cat.tokens.some(t => r === t || r.includes(t));
    const pHas = cat.tokens.some(t => p === t || p.includes(t));
    if (rHas && pHas) return true;
  }

  return false;
};

/**
 * Evaluates whether a MasterLeavePolicy applies to an employee based on:
 * - Specific employee IDs (applicableEmployees)
 * - Department (applicableDepartments)
 * - Designation (applicableDesignations)
 * - Employment Type (applicableEmploymentType: Confirmed / Provisional / Contract / Intern)
 * - Gender (applicableGender: Male / Female)
 */
export const isPolicyApplicableToEmployee = (
  policy: MasterLeavePolicy,
  employee?: Partial<Employee>,
  employeeId?: string,
  _employeeName?: string
): boolean => {
  const normId = (employee?.employeeId || employee?.id || employeeId || '').trim().toLowerCase();
  const empDept = (employee?.department || '').trim().toLowerCase();
  const empDesig = (employee?.designation || '').trim().toLowerCase();
  const empType = (employee?.employmentType || '').trim().toLowerCase();
  const empGender = (employee?.gender || '').trim().toLowerCase();

  // 1. Employee Specific Matching
  if (policy.applicableEmployees && policy.applicableEmployees !== 'ALL') {
    if (Array.isArray(policy.applicableEmployees) && policy.applicableEmployees.length > 0) {
      const match = policy.applicableEmployees.some(id => id.trim().toLowerCase() === normId);
      if (!match) return false;
    }
  }

  // 2. Department Matching
  if (policy.applicableDepartments && policy.applicableDepartments !== 'ALL') {
    if (Array.isArray(policy.applicableDepartments) && policy.applicableDepartments.length > 0) {
      if (empDept) {
        const match = policy.applicableDepartments.some(d => d.trim().toLowerCase() === empDept);
        if (!match) return false;
      }
    }
  }

  // 3. Designation Matching
  if (policy.applicableDesignations && policy.applicableDesignations !== 'ALL') {
    if (Array.isArray(policy.applicableDesignations) && policy.applicableDesignations.length > 0) {
      if (empDesig) {
        const match = policy.applicableDesignations.some(d => d.trim().toLowerCase() === empDesig);
        if (!match) return false;
      }
    }
  }

  // 4. Employment Type Matching
  if (policy.applicableEmploymentType && policy.applicableEmploymentType !== 'ALL') {
    const targetType = policy.applicableEmploymentType.trim().toLowerCase();
    const cleanTarget = targetType.replace(/[^a-z0-9]/g, '');
    const cleanEmp = empType.replace(/[^a-z0-9]/g, '');

    const isEmpProvisional = empType.includes('provisional') || empType.includes('probation');
    if (targetType === 'provisional' || targetType === 'probation') {
      if (!isEmpProvisional) return false;
    } else if (targetType === 'confirmed' || targetType === 'permanent') {
      if (isEmpProvisional) return false;
    } else if (empType) {
      const isMatch = empType === targetType ||
                      cleanEmp === cleanTarget ||
                      empType.includes(targetType) ||
                      targetType.includes(empType) ||
                      (Boolean(cleanEmp && cleanTarget) && (cleanEmp.includes(cleanTarget) || cleanTarget.includes(cleanEmp)));
      if (!isMatch) return false;
    }
  }

  // 5. Gender Matching (e.g. Maternity / Paternity)
  if (policy.applicableGender && policy.applicableGender !== 'ALL') {
    if (empGender && empGender !== policy.applicableGender.toLowerCase()) {
      return false;
    }
  }

  return true;
};

/**
 * Calculates per-category leave balances (Quota, Taken, Remaining) for a given employee
 * taking into account policy applicability, carry forward rollovers, and encashment rights.
 */
export const getEmployeeLeaveTypeBalances = (
  employeeId?: string,
  employeeName?: string,
  masterLeavePolicies: MasterLeavePolicy[] = [],
  leavePolicies: any[] = [],
  leaveRequests: LeaveRequest[] = [],
  employee?: Partial<Employee>
): EmployeeLeaveTypeBalance[] => {
  const normEmpCode = (employee?.employeeId || employeeId || '').trim().toLowerCase();
  const normEmpUuid = (employee?.id || '').trim().toLowerCase();
  const normName = (employeeName || (employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : '')).trim().toLowerCase();

  // 1. Filter approved and pending leaves for this specific employee (excluding WFH / Field Visit)
  const empLeaves = leaveRequests.filter(l => {
    if (isWfhOrRemoteLeaveType(l.leaveType)) return false;
    const reqEmpId = (l.employeeId || '').trim().toLowerCase();
    const reqEmpName = (l.employeeName || '').trim().toLowerCase();
    return (
      (normEmpCode && reqEmpId === normEmpCode) ||
      (normEmpUuid && reqEmpId === normEmpUuid) ||
      (normName && reqEmpName === normName)
    );
  });

  const approvedLeaves = empLeaves.filter(l => l.status === 'Approved');
  const pendingLeaves = empLeaves.filter(l => l.status === 'Pending');

  const balanceMap = new Map<string, EmployeeLeaveTypeBalance>();

  // 2. Filter active master policies that strictly match this employee's scope
  const activeMasterPolicies = (masterLeavePolicies || []).filter(p => {
    if (p.status !== 'Active') return false;
    return isPolicyApplicableToEmployee(p, employee, employeeId, employeeName);
  });

  if (activeMasterPolicies.length > 0) {
    activeMasterPolicies.forEach(p => {
      const isProv = p.applicableEmploymentType === 'Provisional' || p.policyName.toLowerCase().includes('provisional');
      const policyTag = isProv ? 'Provisional' : (p.applicableEmploymentType || 'Confirmed');

      (p.leaveTypes || []).forEach(t => {
        const key = t.name.toLowerCase().trim();
        if (balanceMap.has(key)) return;

        const baseQuota = Number(t.quotaPerYear) || (t.isPaid ? 7 : 0);
        const allowCarryForward = Boolean(p.allowCarryForward);
        const maxCarryForwardDays = allowCarryForward ? (Number(p.maxCarryForwardDays) || 5) : 0;
        const carriedForwardDays = allowCarryForward ? Math.min(maxCarryForwardDays, 5) : 0;
        const annualQuota = baseQuota + carriedForwardDays;

        const allowEncashment = Boolean(p.allowEncashment);
        const maxEncashableDays = allowEncashment ? (Number(p.maxEncashableDays) || 10) : 0;
        const minBalanceForEncashment = allowEncashment ? (Number(p.minBalanceForEncashment) || 0) : 0;

        const code = t.name.includes('(')
          ? (t.name.split('(')[1]?.replace(')', '').trim() || 'LV')
          : t.name.slice(0, 3).toUpperCase();

        balanceMap.set(key, {
          id: `${p.id}-${t.id}`,
          name: t.name,
          code,
          isPaid: t.isPaid,
          annualQuota,
          baseQuota,
          carriedForwardDays,
          allowCarryForward,
          maxCarryForwardDays,
          allowEncashment,
          maxEncashableDays,
          encashableDays: 0,
          minBalanceForEncashment,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: t.isPaid ? annualQuota : 999,
          policyName: p.policyName,
          policyTag,
          applicableScope: p.applicableDepartments !== 'ALL'
            ? `Dept: ${Array.isArray(p.applicableDepartments) ? p.applicableDepartments.join(', ') : p.applicableDepartments}`
            : (p.applicableGender && p.applicableGender !== 'ALL' ? `${p.applicableGender} Only` : 'All Staff')
        });
      });
    });
  } else if (leavePolicies && leavePolicies.length > 0) {
    leavePolicies.filter(p => p.status === 'Active').forEach(p => {
      const key = p.name.toLowerCase().trim();
      if (!balanceMap.has(key)) {
        const quota = Number(p.quotaDays) || 14;
        balanceMap.set(key, {
          id: p.id,
          name: p.name,
          code: p.name.includes('(') ? (p.name.split('(')[1]?.replace(')', '').trim() || 'LV') : 'LV',
          isPaid: true,
          annualQuota: quota,
          baseQuota: quota,
          carriedForwardDays: 0,
          allowCarryForward: false,
          maxCarryForwardDays: 0,
          allowEncashment: false,
          maxEncashableDays: 0,
          encashableDays: 0,
          minBalanceForEncashment: 0,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: quota,
          policyName: p.name,
          policyTag: 'Confirmed'
        });
      }
    });
  }

  // Ensure default fallback categories if none configured
  if (balanceMap.size === 0) {
    const defaultTypes = [
      { name: 'Earned Leave (EL)', quota: 7, isPaid: true },
      { name: 'Sick Leave (SL)', quota: 7, isPaid: true },
      { name: 'Unpaid Leave (LWP)', quota: 12, isPaid: false }
    ];
    defaultTypes.forEach((dt, idx) => {
      balanceMap.set(dt.name.toLowerCase(), {
        id: `def-${idx}`,
        name: dt.name,
        code: dt.name.includes('(') ? (dt.name.split('(')[1]?.replace(')', '').trim() || 'LV') : 'LV',
        isPaid: dt.isPaid,
        annualQuota: dt.quota,
        baseQuota: dt.quota,
        carriedForwardDays: 0,
        allowCarryForward: false,
        maxCarryForwardDays: 0,
        allowEncashment: false,
        maxEncashableDays: 0,
        encashableDays: 0,
        minBalanceForEncashment: 0,
        usedDays: 0,
        pendingDays: 0,
        remainingDays: dt.isPaid ? dt.quota : 999,
        policyName: 'Default Policy',
        policyTag: 'Standard'
      });
    });
  }

  // Ensure Unpaid Leave (LWP) is present
  const hasUnpaid = Array.from(balanceMap.values()).some(b => !b.isPaid);
  if (!hasUnpaid) {
    balanceMap.set('unpaid leave (lwp)', {
      id: 'default-lwp',
      name: 'Unpaid Leave (LWP)',
      code: 'LWP',
      isPaid: false,
      annualQuota: 12,
      baseQuota: 12,
      carriedForwardDays: 0,
      allowCarryForward: false,
      maxCarryForwardDays: 0,
      allowEncashment: false,
      maxEncashableDays: 0,
      encashableDays: 0,
      minBalanceForEncashment: 0,
      usedDays: 0,
      pendingDays: 0,
      remainingDays: 999,
      policyName: 'Unpaid Leave Policy',
      policyTag: 'All Employees'
    });
  }

  const allBalances = Array.from(balanceMap.values());
  const paidCategories = allBalances.filter(b => b.isPaid);
  const unpaidCategory = allBalances.find(b => !b.isPaid)!;
  const primaryPaidFallback =
    paidCategories.find(b => !b.name.toLowerCase().includes('sick')) ||
    paidCategories[0];

  // 3. Allocate Approved Leaves (chronologically so quota consumption is accurate)
  const sortedApproved = [...approvedLeaves].sort((a, b) =>
    normalizeToYYYYMMDD(a.startDate).localeCompare(normalizeToYYYYMMDD(b.startDate))
  );

  sortedApproved.forEach(l => {
    const totalDays = Math.max(0.5, Number(l.daysCount) || 1);
    const isOverriddenUnpaid = l.hrOverride?.isOverridden && l.hrOverride?.adjustedPayType === 'UNPAID_LEAVE';

    if (isExplicitUnpaidLeaveType(l.leaveType) || isOverriddenUnpaid) {
      unpaidCategory.usedDays += totalDays;
      return;
    }

    const matchedPaid =
      paidCategories.find(b => isMatchingLeaveType(l.leaveType, b.name)) ||
      primaryPaidFallback;

    if (!matchedPaid) {
      unpaidCategory.usedDays += totalDays;
      return;
    }

    const explicitUnpaid = Math.max(0, Number(l.unpaidDaysCount) || 0);
    const requestedPaid = l.paidDaysCount !== undefined
      ? Math.max(0, Number(l.paidDaysCount))
      : Math.max(0, totalDays - explicitUnpaid);

    const availablePaidQuota = Math.max(0, matchedPaid.annualQuota - matchedPaid.usedDays);
    const actualPaidDays = Math.min(requestedPaid, availablePaidQuota);
    const overflowUnpaidDays = Math.max(0, totalDays - actualPaidDays);

    matchedPaid.usedDays += actualPaidDays;
    matchedPaid.remainingDays = Math.max(0, matchedPaid.annualQuota - matchedPaid.usedDays);

    if (overflowUnpaidDays > 0) {
      unpaidCategory.usedDays += overflowUnpaidDays;
    }
  });

  // 4. Allocate Pending Leaves
  pendingLeaves.forEach(l => {
    const totalDays = Math.max(0.5, Number(l.daysCount) || 1);
    if (isExplicitUnpaidLeaveType(l.leaveType)) {
      unpaidCategory.pendingDays += totalDays;
      return;
    }
    const matchedPaid =
      paidCategories.find(b => isMatchingLeaveType(l.leaveType, b.name)) ||
      primaryPaidFallback;
    if (matchedPaid) {
      matchedPaid.pendingDays += totalDays;
    }
  });

  // 5. Finalize remainingDays and encashableDays
  allBalances.forEach(b => {
    if (b.isPaid) {
      b.remainingDays = Math.max(0, b.annualQuota - b.usedDays);
      b.encashableDays = b.allowEncashment
        ? Math.max(0, Math.min(b.maxEncashableDays, b.remainingDays - b.minBalanceForEncashment))
        : 0;
    }
  });

  return allBalances;
};

/**
 * Calculates total combined leave summary (Annual Quota, Total Paid Remaining, Total Paid Taken,
 * and Loss of Pay including Approved Unpaid Leaves, Rejected Leave Absences, and Uninformed Absences)
 */
export const getEmployeeTotalLeaveSummary = (
  employeeId?: string,
  employeeName?: string,
  masterLeavePolicies: MasterLeavePolicy[] = [],
  leavePolicies: any[] = [],
  leaveRequests: LeaveRequest[] = [],
  employee?: Partial<Employee>,
  attendanceRecords: AttendanceRecord[] = [],
  holidayPolicies: HolidayItem[] = []
): EmployeeTotalLeaveSummary => {
  const balances = getEmployeeLeaveTypeBalances(employeeId, employeeName, masterLeavePolicies, leavePolicies, leaveRequests, employee);
  const paidBalances = balances.filter(b => b.isPaid);

  const totalAnnualQuota = paidBalances.reduce((sum, b) => sum + b.annualQuota, 0);
  const totalPaidUsed = paidBalances.reduce((sum, b) => sum + b.usedDays, 0);
  const totalPaidPending = paidBalances.reduce((sum, b) => sum + b.pendingDays, 0);
  const totalPaidRemaining = Math.max(0, totalAnnualQuota - totalPaidUsed);

  const unpaidBalances = balances.filter(b => !b.isPaid);
  const approvedUnpaidDays = unpaidBalances.reduce((sum, b) => sum + b.usedDays, 0);

  let rejectedLeaveAbsentDays = 0;
  let uninformedAbsentDays = 0;

  const normEmpCode = (employee?.employeeId || employeeId || '').trim().toLowerCase();
  const normEmpUuid = (employee?.id || '').trim().toLowerCase();
  const normName = (employeeName || (employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : '')).trim().toLowerCase();

  // Compute Rejected-Leave Absences & Uninformed Absences when attendance records are available
  if (Array.isArray(attendanceRecords) && attendanceRecords.length > 0 && (normEmpCode || normEmpUuid || normName)) {
    const todayStr = getTodayKolkata();
    const currentYearMonth = todayStr.slice(0, 7); // YYYY-MM
    const monthStart = `${currentYearMonth}-01`;

    // Find earliest date in attendanceRecords so we never count dates before system tracking began
    let earliestSystemDate = '2099-12-31';
    for (const r of attendanceRecords) {
      const d = normalizeToYYYYMMDD(r.date || r.shiftDate);
      if (d && d < earliestSystemDate) earliestSystemDate = d;
    }

    const empJoinDate = normalizeToYYYYMMDD(employee?.joiningDate || (employee as any)?.dateOfJoining) || '1970-01-01';
    const holidaySet = new Set(
      (holidayPolicies || []).map(h => normalizeToYYYYMMDD(h.date)).filter(Boolean)
    );

    const empAllLeaves = leaveRequests.filter(l => {
      const reqEmpId = (l.employeeId || '').trim().toLowerCase();
      const reqEmpName = (l.employeeName || '').trim().toLowerCase();
      return (
        (normEmpCode && reqEmpId === normEmpCode) ||
        (normEmpUuid && reqEmpId === normEmpUuid) ||
        (normName && reqEmpName === normName)
      );
    });

    const isEmployeePresentOnDate = (dateStr: string): boolean => {
      const rec = attendanceRecords.find(a => {
        const aEmp = (a.employeeId || '').trim().toLowerCase();
        const aName = (a.employeeName || '').trim().toLowerCase();
        const aDate = normalizeToYYYYMMDD(a.date || a.shiftDate);
        const empMatch =
          (normEmpCode && aEmp === normEmpCode) ||
          (normEmpUuid && aEmp === normEmpUuid) ||
          (normName && aName === normName);
        return empMatch && aDate === dateStr;
      });
      if (!rec) return false;
      const st = (rec.status || '').toLowerCase();
      if (st === 'absent') return false;
      return Boolean(
        st === 'present' ||
        st === 'late' ||
        st === 'half day' ||
        st.includes('wfh') ||
        st.includes('home') ||
        st.includes('wfo') ||
        st.includes('office') ||
        st.includes('field') ||
        st.includes('visit') ||
        st.includes('duty') ||
        (rec.checkIn && rec.checkIn !== '--:--' && rec.checkIn !== '-')
      );
    };

    const hasApprovedLeaveOnDate = (dateStr: string): boolean => {
      return empAllLeaves.some(l => {
        if (l.status !== 'Approved') return false;
        const s = normalizeToYYYYMMDD(l.startDate);
        const e = normalizeToYYYYMMDD(l.endDate) || s;
        return Boolean(s && dateStr >= s && dateStr <= e);
      });
    };

    const hasRejectedLeaveOnDate = (dateStr: string): boolean => {
      return empAllLeaves.some(l => {
        if (l.status !== 'Rejected') return false;
        const s = normalizeToYYYYMMDD(l.startDate);
        const e = normalizeToYYYYMMDD(l.endDate) || s;
        return Boolean(s && dateStr >= s && dateStr <= e);
      });
    };

    // Collect all past candidate dates to inspect:
    // 1. All past dates in the current month (from monthStart up to yesterday)
    // 2. Any past dates covered by a Rejected leave request for this employee
    const candidateDates = new Set<string>();
    const [y, m] = currentYearMonth.split('-').map(Number);
    const todayDay = parseInt(todayStr.slice(8, 10), 10);
    for (let day = 1; day < todayDay; day++) {
      const dStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (dStr >= earliestSystemDate && dStr >= empJoinDate && dStr >= monthStart) {
        candidateDates.add(dStr);
      }
    }

    empAllLeaves.filter(l => l.status === 'Rejected').forEach(l => {
      const s = normalizeToYYYYMMDD(l.startDate);
      const e = normalizeToYYYYMMDD(l.endDate) || s;
      if (!s) return;
      const cur = new Date(s + 'T12:00:00');
      const endObj = new Date(e + 'T12:00:00');
      let safety = 0;
      while (cur <= endObj && safety < 60) {
        const dStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (dStr < todayStr && dStr >= earliestSystemDate && dStr >= empJoinDate) {
          candidateDates.add(dStr);
        }
        cur.setDate(cur.getDate() + 1);
        safety++;
      }
    });

    candidateDates.forEach(dStr => {
      const dObj = new Date(dStr + 'T12:00:00');
      if (dObj.getDay() === 0) return; // Sunday Weekly Off
      if (holidaySet.has(dStr)) return; // Official Public Holiday
      if (isEmployeePresentOnDate(dStr)) return; // Punched in / Present
      if (hasApprovedLeaveOnDate(dStr)) return; // Covered by Approved Leave or WFH

      if (hasRejectedLeaveOnDate(dStr)) {
        rejectedLeaveAbsentDays += 1;
      } else {
        uninformedAbsentDays += 1;
      }
    });
  }

  const totalUnpaidUsed = approvedUnpaidDays + rejectedLeaveAbsentDays + uninformedAbsentDays;

  // Also reflect totalUnpaidUsed on the Unpaid Leave balance item so callers inspecting balances see it
  const unpaidBalItem = balances.find(b => !b.isPaid);
  if (unpaidBalItem) {
    unpaidBalItem.usedDays = totalUnpaidUsed;
  }

  return {
    totalAnnualQuota,
    totalPaidUsed,
    totalPaidPending,
    totalPaidRemaining,
    totalUnpaidUsed,
    approvedUnpaidDays,
    rejectedLeaveAbsentDays,
    uninformedAbsentDays,
    balances
  };
};
