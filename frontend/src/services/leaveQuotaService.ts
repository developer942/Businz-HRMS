import { LeaveRequest, Employee } from '../types/hrms';
import { MasterLeavePolicy } from '../types/settings';

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
  balances: EmployeeLeaveTypeBalance[];
}

/**
 * Normalizes and checks if a leave request's type matches a policy leave type
 */
export const isMatchingLeaveType = (reqType?: string, policyType?: string): boolean => {
  if (!reqType || !policyType) return false;
  const r = reqType.toLowerCase().trim();
  const p = policyType.toLowerCase().trim();
  if (r === p) return true;

  // Exact normalized match (removing punctuation, spaces, brackets)
  const rClean = r.replace(/[^a-z0-9]/g, '');
  const pClean = p.replace(/[^a-z0-9]/g, '');
  if (rClean === pClean) return true;

  // Keyword token mapping
  const categories = [
    { key: 'sick', tokens: ['sick', 'sl', 'medical'] },
    { key: 'earned', tokens: ['earned', 'el', 'annual', 'privilege', 'pl'] },
    { key: 'casual', tokens: ['casual', 'cl'] },
    { key: 'maternity', tokens: ['maternity'] },
    { key: 'paternity', tokens: ['paternity'] },
    { key: 'wfh', tokens: ['work from home', 'wfh'] },
    { key: 'unpaid', tokens: ['unpaid', 'lwp', 'loss of pay', 'lop'] }
  ];

  for (const cat of categories) {
    const rHas = cat.tokens.some(t => r.includes(t));
    const pHas = cat.tokens.some(t => p.includes(t));
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
  const normId = (employeeId || employee?.employeeId || '').trim().toLowerCase();
  const normName = (employeeName || (employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : '')).trim().toLowerCase();

  // 1. Filter approved and pending leaves for this specific employee
  const empLeaves = leaveRequests.filter(l => {
    const reqEmpId = (l.employeeId || '').trim().toLowerCase();
    const reqEmpName = (l.employeeName || '').trim().toLowerCase();
    return (normId && reqEmpId === normId) || (normName && reqEmpName === normName);
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
        // If already added, avoid duplicate display
        if (balanceMap.has(key)) return;

        const usedDays = approvedLeaves
          .filter(l => isMatchingLeaveType(l.leaveType, t.name))
          .reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);

        const pendingDays = pendingLeaves
          .filter(l => isMatchingLeaveType(l.leaveType, t.name))
          .reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);

        const baseQuota = Number(t.quotaPerYear) || (t.isPaid ? 7 : 0);

        // Carry Forward Calculation
        const allowCarryForward = Boolean(p.allowCarryForward);
        const maxCarryForwardDays = allowCarryForward ? (Number(p.maxCarryForwardDays) || 5) : 0;
        // In an active period, carry forward adds eligible rollover days (capped at maxCarryForwardDays)
        const carriedForwardDays = allowCarryForward ? Math.min(maxCarryForwardDays, 5) : 0;
        const annualQuota = baseQuota + carriedForwardDays;

        const remainingDays = t.isPaid ? Math.max(0, annualQuota - usedDays) : 999;

        // Leave Encashment Calculation
        const allowEncashment = Boolean(p.allowEncashment);
        const maxEncashableDays = allowEncashment ? (Number(p.maxEncashableDays) || 10) : 0;
        const minBalanceForEncashment = allowEncashment ? (Number(p.minBalanceForEncashment) || 0) : 0;
        const encashableDays = allowEncashment && t.isPaid
          ? Math.max(0, Math.min(maxEncashableDays, remainingDays - minBalanceForEncashment))
          : 0;

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
          encashableDays,
          minBalanceForEncashment,
          usedDays,
          pendingDays,
          remainingDays,
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
        const usedDays = approvedLeaves
          .filter(l => isMatchingLeaveType(l.leaveType, p.name))
          .reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);

        const pendingDays = pendingLeaves
          .filter(l => isMatchingLeaveType(l.leaveType, p.name))
          .reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);

        const quota = Number(p.quotaDays) || 14;
        const remainingDays = Math.max(0, quota - usedDays);

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
          usedDays,
          pendingDays,
          remainingDays,
          policyName: p.name,
          policyTag: 'Confirmed'
        });
      }
    });
  }

  // Ensure default fallback categories if none configured
  if (balanceMap.size === 0) {
    const defaultTypes = [
      { name: 'Casual Leave (CL)', quota: 7, isPaid: true },
      { name: 'Sick Leave (SL)', quota: 7, isPaid: true },
      { name: 'Unpaid Leave (LWP)', quota: 12, isPaid: false }
    ];
    defaultTypes.forEach((dt, idx) => {
      const usedDays = approvedLeaves
        .filter(l => isMatchingLeaveType(l.leaveType, dt.name))
        .reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);
      const remainingDays = dt.isPaid ? Math.max(0, dt.quota - usedDays) : 999;
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
        usedDays,
        pendingDays: 0,
        remainingDays,
        policyName: 'Default Policy',
        policyTag: 'Standard'
      });
    });
  }

  // Ensure Unpaid Leave (LWP) is present
  const hasUnpaid = Array.from(balanceMap.values()).some(b => !b.isPaid);
  if (!hasUnpaid) {
    const usedDays = approvedLeaves
      .filter(l => {
        const lt = (l.leaveType || '').toLowerCase();
        return lt.includes('unpaid') || lt.includes('lwp') || lt.includes('loss of pay');
      })
      .reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);

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
      usedDays,
      pendingDays: 0,
      remainingDays: 999,
      policyName: 'Unpaid Leave Policy',
      policyTag: 'All Employees'
    });
  }

  return Array.from(balanceMap.values());
};

/**
 * Calculates total combined leave summary (Annual Quota, Total Paid Remaining, Total Paid Taken)
 */
export const getEmployeeTotalLeaveSummary = (
  employeeId?: string,
  employeeName?: string,
  masterLeavePolicies: MasterLeavePolicy[] = [],
  leavePolicies: any[] = [],
  leaveRequests: LeaveRequest[] = [],
  employee?: Partial<Employee>
): EmployeeTotalLeaveSummary => {
  const balances = getEmployeeLeaveTypeBalances(employeeId, employeeName, masterLeavePolicies, leavePolicies, leaveRequests, employee);
  const paidBalances = balances.filter(b => b.isPaid);

  const totalAnnualQuota = paidBalances.reduce((sum, b) => sum + b.annualQuota, 0);
  const totalPaidUsed = paidBalances.reduce((sum, b) => sum + b.usedDays, 0);
  const totalPaidPending = paidBalances.reduce((sum, b) => sum + b.pendingDays, 0);
  const totalPaidRemaining = Math.max(0, totalAnnualQuota - totalPaidUsed);

  const unpaidBalances = balances.filter(b => !b.isPaid);
  const totalUnpaidUsed = unpaidBalances.reduce((sum, b) => sum + b.usedDays, 0);

  return {
    totalAnnualQuota,
    totalPaidUsed,
    totalPaidPending,
    totalPaidRemaining,
    totalUnpaidUsed,
    balances
  };
};
