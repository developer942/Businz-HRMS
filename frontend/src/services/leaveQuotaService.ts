import { LeaveRequest } from '../types/hrms';
import { MasterLeavePolicy } from '../types/settings';

export interface EmployeeLeaveTypeBalance {
  id: string;
  name: string;
  code: string;
  isPaid: boolean;
  annualQuota: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  policyName: string;
  policyTag: string;
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
 * Calculates per-category leave balances (Quota, Taken, Remaining) for a given employee
 */
export const getEmployeeLeaveTypeBalances = (
  employeeId?: string,
  employeeName?: string,
  masterLeavePolicies: MasterLeavePolicy[] = [],
  leavePolicies: any[] = [],
  leaveRequests: LeaveRequest[] = []
): EmployeeLeaveTypeBalance[] => {
  const normId = (employeeId || '').trim().toLowerCase();
  const normName = (employeeName || '').trim().toLowerCase();

  // 1. Filter approved and pending leaves for this specific employee
  const empLeaves = leaveRequests.filter(l => {
    const reqEmpId = (l.employeeId || '').trim().toLowerCase();
    const reqEmpName = (l.employeeName || '').trim().toLowerCase();
    return (normId && reqEmpId === normId) || (normName && reqEmpName === normName);
  });

  const approvedLeaves = empLeaves.filter(l => l.status === 'Approved');
  const pendingLeaves = empLeaves.filter(l => l.status === 'Pending');

  const balanceMap = new Map<string, EmployeeLeaveTypeBalance>();
  const activeMasterPolicies = (masterLeavePolicies || []).filter(p => p.status === 'Active');

  if (activeMasterPolicies.length > 0) {
    activeMasterPolicies.forEach(p => {
      const isProv = p.applicableEmploymentType === 'Provisional' || p.policyName.toLowerCase().includes('provisional');
      const policyTag = isProv ? 'Provisional' : 'Confirmed';

      (p.leaveTypes || []).forEach(t => {
        const key = t.name.toLowerCase().trim();
        // If already added and is Unpaid Leave, avoid duplicate display
        if (balanceMap.has(key)) return;

        const usedDays = approvedLeaves
          .filter(l => isMatchingLeaveType(l.leaveType, t.name))
          .reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);

        const pendingDays = pendingLeaves
          .filter(l => isMatchingLeaveType(l.leaveType, t.name))
          .reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);

        const quota = Number(t.quotaPerYear) || (t.isPaid ? 7 : 0);
        const remainingDays = t.isPaid ? Math.max(0, quota - usedDays) : 999;

        const code = t.name.includes('(') 
          ? (t.name.split('(')[1]?.replace(')', '').trim() || 'LV') 
          : t.name.slice(0, 3).toUpperCase();

        balanceMap.set(key, {
          id: `${p.id}-${t.id}`,
          name: t.name,
          code,
          isPaid: t.isPaid,
          annualQuota: quota,
          usedDays,
          pendingDays,
          remainingDays,
          policyName: p.policyName,
          policyTag
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
  leaveRequests: LeaveRequest[] = []
): EmployeeTotalLeaveSummary => {
  const balances = getEmployeeLeaveTypeBalances(employeeId, employeeName, masterLeavePolicies, leavePolicies, leaveRequests);
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
