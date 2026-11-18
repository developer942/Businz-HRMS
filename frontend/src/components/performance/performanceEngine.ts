import { Employee, AttendanceRecord, TaskItemEnhanced } from '../../types/hrms';
import { getMonthInfo } from '../../utils/monthUtils';

// ========================================================
// 1. CONFIGURABLE PERFORMANCE SCORING WEIGHTS
// ========================================================
export interface PerformanceScoringConfig {
  nonSales: {
    attendanceWeight: number;      // 0.30 (30%)
    taskCompletionWeight: number;  // 0.40 (40%)
    onTimeCompletionWeight: number;// 0.30 (30%)
  };
  sales: {
    attendanceWeight: number;      // 0.20 (20%)
    taskCompletionWeight: number;  // 0.20 (20%)
    onTimeCompletionWeight: number;// 0.10 (10%)
    salesTargetWeight: number;     // 0.50 (50%)
  };
}

export const DEFAULT_PERFORMANCE_WEIGHTS: PerformanceScoringConfig = {
  nonSales: {
    attendanceWeight: 0.30,
    taskCompletionWeight: 0.40,
    onTimeCompletionWeight: 0.30
  },
  sales: {
    attendanceWeight: 0.20,
    taskCompletionWeight: 0.20,
    onTimeCompletionWeight: 0.10,
    salesTargetWeight: 0.50
  }
};

// ========================================================
// 2. STATUS TIERS PER SPECIFICATION
// ========================================================
export type PerformanceStatusTier = 'Excellent' | 'Good' | 'Average' | 'Needs Attention' | 'Pending Data';

export interface PerformanceStatusInfo {
  tier: PerformanceStatusTier;
  color: string;
  bg: string;
  borderColor: string;
}

export const getPerformanceStatus = (score: number, hasRecords: boolean = true): PerformanceStatusInfo => {
  if (!hasRecords || score === 0) {
    return { tier: 'Pending Data', color: '#64748B', bg: '#F1F5F9', borderColor: '#E2E8F0' };
  }
  if (score >= 90) {
    return { tier: 'Excellent', color: '#15803D', bg: '#DCFCE7', borderColor: '#86EFAC' };
  }
  if (score >= 80) {
    return { tier: 'Good', color: '#0E7490', bg: '#ECFEFF', borderColor: '#A5F3FC' };
  }
  if (score >= 70) {
    return { tier: 'Average', color: '#D97706', bg: '#FEF3C7', borderColor: '#FDE68A' };
  }
  return { tier: 'Needs Attention', color: '#B91C1C', bg: '#FEE2E2', borderColor: '#FECACA' };
};

// ========================================================
// 3. SOLAR SALES DATA MODEL (Dynamic / Extensible)
// ========================================================
export interface EmployeeSalesMetric {
  employeeId: string;
  employeeName: string;
  designation: string;
  monthlyTarget: number;    // in ₹
  monthlyAchieved: number;  // in ₹
  achievementRate: number;  // in %
}

export const SALES_TEAM_METRICS: EmployeeSalesMetric[] = [];

export const COMPANY_SALES_SUMMARY = {
  totalTarget: 0,
  totalAchieved: 0,
  achievementRate: 0
};

// ========================================================
// 4. COMPUTED EMPLOYEE PERFORMANCE PROFILE
// ========================================================
export interface ComputedEmployeePerformance {
  employeeId: string;
  name: string;
  department: string;
  designation: string;
  avatar?: string;
  isSales: boolean;
  
  // Base KPIs
  attendanceRate: number;        // in %
  taskCompletionRate: number;    // in %
  onTimeCompletionRate: number;  // in %
  salesTargetRate: number | null;// in % or null for non-sales
  salesTargetAmount?: number;
  salesAchievedAmount?: number;

  // Task count breakdown
  tasksTotal: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksOverdue: number;

  // Attendance breakdown
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  lateDays: number;
  onTimeAttendanceRate: number; // in %

  // Overall Performance Score (0 - 100)
  overallScore: number;
  status: PerformanceStatusInfo;

  // Monthly trend (Jan - Sep)
  monthlyTrend: { month: string; score: number }[];
}

export interface DepartmentPerformanceSummary {
  department: string;
  employeeCount: number;
  averageScore: number;
  attendanceRate: number;
  onTimeRate: number;
  taskCompletionRate: number;
  status: PerformanceStatusInfo;
}

export interface CompanyPerformanceSummary {
  overallScore: number;
  averageAttendance: number;
  taskCompletionRate: number;
  salesTargetAchievement: number;
  activeEmployeeCount: number;

  // Attendance breakdown
  attendanceBreakdown: {
    presentPercent: number;
    absentPercent: number;
    leavePercent: number;
    latePercent: number;
    totalLogs: number;
  };

  // Task breakdown
  taskBreakdown: {
    totalTasks: number;
    completed: number;
    pending: number;
    overdue: number;
    completionPercent: number;
  };

  // Department scores
  departmentPerformances: DepartmentPerformanceSummary[];

  // Dynamic monthly trend for bar chart
  monthlyTrend: {
    month: string;
    fullName: string;
    score: number;
    kpiRate: number;
    attendanceRate: number;
    kriScore: number;
  }[];

  // Insights
  topPerformer: ComputedEmployeePerformance | null;
  bestDepartment: DepartmentPerformanceSummary | null;
  needsAttentionCount: number;
  overdueTasksCount: number;
}

// ========================================================
// 5. CALCULATION ENGINE LOGIC
// ========================================================

/**
 * Calculates a single employee's performance based on real attendance, tasks & sales
 */
export const calculateSingleEmployeePerformance = (
  emp: Employee,
  attendanceRecords: AttendanceRecord[],
  enhancedTasks: TaskItemEnhanced[],
  weights: PerformanceScoringConfig = DEFAULT_PERFORMANCE_WEIGHTS
): ComputedEmployeePerformance => {
  if (!emp) {
    return {
      employeeId: '',
      name: '',
      department: '',
      designation: '',
      isSales: false,
      attendanceRate: 0,
      taskCompletionRate: 0,
      onTimeCompletionRate: 0,
      salesTargetRate: null,
      tasksTotal: 0,
      tasksCompleted: 0,
      tasksPending: 0,
      tasksOverdue: 0,
      presentDays: 0,
      absentDays: 0,
      leaveDays: 0,
      lateDays: 0,
      onTimeAttendanceRate: 0,
      overallScore: 0,
      status: getPerformanceStatus(0, false),
      monthlyTrend: []
    };
  }

  const isSales = emp.department?.toLowerCase() === 'sales';
  const targetEmpCode = (emp.employeeId || '').trim().toLowerCase();
  const targetEmpUuid = (emp.id || '').trim().toLowerCase();

  // 1. Attendance calculation strictly from real attendance records
  const empAttLogs = (attendanceRecords || []).filter((a) => {
    const recEmpId = (a.employeeId || '').trim().toLowerCase();
    return Boolean(recEmpId && (recEmpId === targetEmpCode || (targetEmpUuid && recEmpId === targetEmpUuid)));
  });
  const totalAttLogs = empAttLogs.length;

  let presentDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let lateDays = 0;

  empAttLogs.forEach(log => {
    if (log.status === 'Present' || log.status === 'Late' || log.status === 'Work From Home') presentDays++;
    else if (log.status === 'Absent') absentDays++;
    else if (log.status === 'On Leave' || log.status === 'Half Day') leaveDays++;
    
    if (log.status === 'Late' || (log.lateStatus && log.lateStatus.includes('Late'))) lateDays++;
  });

  // Calculate Attendance % (0% if no records logged yet)
  let attendanceRate = totalAttLogs > 0
    ? Math.round(((presentDays + (leaveDays * 0.5)) / totalAttLogs) * 100)
    : 0;
  if (attendanceRate > 100) attendanceRate = 100;

  // Real On-Time Attendance %
  const onTimeAttendanceRate = totalAttLogs > 0
    ? Math.round((Math.max(0, presentDays - lateDays) / totalAttLogs) * 100)
    : 0;

  // 2. Task metrics strictly from assigned tasks
  const assignedTasks = (enhancedTasks || []).filter((t) => {
    const respId = (t.responsiblePersonId || '').trim().toLowerCase();
    if (respId && (respId === targetEmpCode || (targetEmpUuid && respId === targetEmpUuid))) {
      return true;
    }
    return Boolean(
      t.assignees?.some((a) => {
        const aId = (a.employeeId || '').trim().toLowerCase();
        return Boolean(aId && (aId === targetEmpCode || (targetEmpUuid && aId === targetEmpUuid)));
      })
    );
  });

  let tasksTotal = assignedTasks.length;
  let tasksCompleted = 0;
  let tasksPending = 0;
  let tasksOverdue = 0;
  let onTimeTasks = 0;

  const todayStr = new Date().toISOString().split('T')[0];

  assignedTasks.forEach(task => {
    const assignee = task.assignees?.find((a) => {
      const aId = (a.employeeId || '').trim().toLowerCase();
      return Boolean(aId && (aId === targetEmpCode || (targetEmpUuid && aId === targetEmpUuid)));
    });
    const isDone = assignee?.individualStatus === 'Completed' || task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED';
    const isTaskOverdue = task.dueDate ? (task.dueDate < todayStr && task.overallStatus !== 'COMPLETED' && task.overallStatus !== 'CLOSED') : false;

    if (isDone) {
      tasksCompleted++;
      if (!isTaskOverdue) onTimeTasks++;
    } else {
      tasksPending++;
      if (isTaskOverdue) tasksOverdue++;
    }
  });

  const taskCompletionRate = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
  const onTimeCompletionRate = tasksCompleted > 0
    ? Math.round((onTimeTasks / tasksCompleted) * 100)
    : 0;

  // 3. Sales target
  let salesTargetRate: number | null = null;
  let salesTargetAmount: number | undefined;
  let salesAchievedAmount: number | undefined;

  // 4. Score formula strictly from actual records
  let overallScore = 0;
  const hasAttendance = totalAttLogs > 0;
  const hasTasks = tasksTotal > 0;

  if (hasAttendance && hasTasks) {
    overallScore = Math.round(
      (attendanceRate * weights.nonSales.attendanceWeight) +
      (taskCompletionRate * weights.nonSales.taskCompletionWeight) +
      (onTimeCompletionRate * weights.nonSales.onTimeCompletionWeight)
    );
  } else if (hasAttendance && !hasTasks) {
    overallScore = attendanceRate;
  } else if (!hasAttendance && hasTasks) {
    overallScore = Math.round((taskCompletionRate * 0.6) + (onTimeCompletionRate * 0.4));
  } else {
    overallScore = 0;
  }

  // Bound between 0 and 100
  overallScore = Math.max(0, Math.min(100, overallScore));

  const status = getPerformanceStatus(overallScore, hasAttendance || hasTasks);

  // 5. Monthly Trend generation (May - Dec, matching current month)
  const monthConfigs = [
    { month: 'May', key: '2026-05' },
    { month: 'Jun', key: '2026-06' },
    { month: 'Jul', key: '2026-07' },
    { month: 'Aug', key: '2026-08' },
    { month: 'Sep', key: '2026-09' },
    { month: 'Oct', key: '2026-10' },
    { month: 'Nov', key: '2026-11' },
    { month: 'Dec', key: '2026-12' },
  ];
  const currentMonthKey = getMonthInfo().monthKey;
  const monthlyTrend = monthConfigs.map((m) => ({
    month: m.month,
    score: m.key === currentMonthKey ? overallScore : 0,
  }));

  return {
    employeeId: emp.employeeId,
    name: `${emp.firstName} ${emp.lastName}`.trim(),
    department: emp.department || 'General',
    designation: emp.designation || 'Staff',
    avatar: emp.avatar,
    isSales,
    attendanceRate,
    taskCompletionRate,
    onTimeCompletionRate,
    salesTargetRate,
    salesTargetAmount,
    salesAchievedAmount,
    tasksTotal,
    tasksCompleted,
    tasksPending,
    tasksOverdue,
    presentDays,
    absentDays,
    leaveDays,
    lateDays,
    onTimeAttendanceRate,
    overallScore,
    status,
    monthlyTrend
  };
};

/**
 * Computes all employee and company-wide performance summaries for CEO / HR
 */
export const calculateCompanyPerformance = (
  employees: Employee[],
  attendanceRecords: AttendanceRecord[],
  enhancedTasks: TaskItemEnhanced[],
  configuredDepartments: string[] = [],
  weights: PerformanceScoringConfig = DEFAULT_PERFORMANCE_WEIGHTS
): {
  employeeProfiles: ComputedEmployeePerformance[];
  companySummary: CompanyPerformanceSummary;
} => {
  // Filter active employees (excluding system account if needed)
  const activeEmps = (employees || []).filter(e => e.status === 'Active');

  const employeeProfiles = activeEmps.map(emp =>
    calculateSingleEmployeePerformance(emp, attendanceRecords, enhancedTasks, weights)
  );

  // 1. Company Overall Score
  const empsWithScore = employeeProfiles.filter(e => e.overallScore > 0);
  const overallScore = empsWithScore.length > 0
    ? Math.round(empsWithScore.reduce((sum, e) => sum + e.overallScore, 0) / empsWithScore.length)
    : (employeeProfiles.length > 0 ? Math.round(employeeProfiles.reduce((sum, e) => sum + e.overallScore, 0) / employeeProfiles.length) : 0);

  // 2. Average Attendance
  const empsWithAtt = employeeProfiles.filter(e => e.attendanceRate > 0);
  const averageAttendance = empsWithAtt.length > 0
    ? Math.round(empsWithAtt.reduce((sum, e) => sum + e.attendanceRate, 0) / empsWithAtt.length)
    : 0;

  // 3. Average Task Completion
  const empsWithTasks = employeeProfiles.filter(e => e.tasksTotal > 0);
  const taskCompletionRate = empsWithTasks.length > 0
    ? Math.round(empsWithTasks.reduce((sum, e) => sum + e.taskCompletionRate, 0) / empsWithTasks.length)
    : 0;

  // 4. Sales Target Achievement
  const salesTargetAchievement = 0;

  // 5. Attendance Breakdown strictly from records
  const totalPresent = employeeProfiles.reduce((sum, e) => sum + e.presentDays, 0);
  const totalAbsent = employeeProfiles.reduce((sum, e) => sum + e.absentDays, 0);
  const totalLeave = employeeProfiles.reduce((sum, e) => sum + e.leaveDays, 0);
  const totalLate = employeeProfiles.reduce((sum, e) => sum + e.lateDays, 0);
  const totalLogs = totalPresent + totalAbsent + totalLeave;

  const attendanceBreakdown = {
    presentPercent: totalLogs > 0 ? Math.round((totalPresent / totalLogs) * 100) : 0,
    absentPercent: totalLogs > 0 ? Math.round((totalAbsent / totalLogs) * 100) : 0,
    leavePercent: totalLogs > 0 ? Math.round((totalLeave / totalLogs) * 100) : 0,
    latePercent: totalLogs > 0 ? Math.round((totalLate / totalLogs) * 100) : 0,
    totalLogs
  };

  // 6. Task Breakdown strictly from tasks
  const totalTasks = employeeProfiles.reduce((sum, e) => sum + e.tasksTotal, 0);
  const completedTasks = employeeProfiles.reduce((sum, e) => sum + e.tasksCompleted, 0);
  const pendingTasks = employeeProfiles.reduce((sum, e) => sum + e.tasksPending, 0);
  const overdueTasks = employeeProfiles.reduce((sum, e) => sum + e.tasksOverdue, 0);

  const taskBreakdown = {
    totalTasks,
    completed: completedTasks,
    pending: pendingTasks,
    overdue: overdueTasks,
    completionPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  };

  // 7. Department Performances across ONLY user-configured departments in Settings OR actual employee departments
  const employeeDepts = Array.from(new Set(
    employeeProfiles
      .filter(e => e.employeeId !== 'EMP-000')
      .map(e => e.department)
      .filter(Boolean)
  ));
  const distinctDepts = (configuredDepartments && configuredDepartments.length > 0)
    ? Array.from(new Set([
        ...configuredDepartments.filter(Boolean),
        ...employeeDepts
      ]))
    : employeeDepts;

  const departmentPerformances: DepartmentPerformanceSummary[] = distinctDepts.map(deptName => {
    const deptEmployees = employeeProfiles.filter(
      e => e.department.toLowerCase() === deptName.toLowerCase()
    );

    if (deptEmployees.length > 0) {
      const avgScore = Math.round(deptEmployees.reduce((s, e) => s + e.overallScore, 0) / deptEmployees.length);
      const avgAtt = Math.round(deptEmployees.reduce((s, e) => s + e.attendanceRate, 0) / deptEmployees.length);
      const avgOnTime = Math.round(deptEmployees.reduce((s, e) => s + e.onTimeAttendanceRate, 0) / deptEmployees.length);
      const avgTask = Math.round(deptEmployees.reduce((s, e) => s + e.taskCompletionRate, 0) / deptEmployees.length);

      return {
        department: deptName,
        employeeCount: deptEmployees.length,
        averageScore: avgScore,
        attendanceRate: avgAtt,
        onTimeRate: avgOnTime,
        taskCompletionRate: avgTask,
        status: getPerformanceStatus(avgScore, avgScore > 0 || avgAtt > 0 || avgTask > 0)
      };
    }

    return {
      department: deptName,
      employeeCount: 0,
      averageScore: 0,
      attendanceRate: 0,
      onTimeRate: 0,
      taskCompletionRate: 0,
      status: getPerformanceStatus(0, false)
    };
  });

  // 8. Dynamic monthly progression for bar chart (May - Dec)
  const monthConfigs = [
    { month: 'May', fullName: 'May 2026', key: '2026-05' },
    { month: 'Jun', fullName: 'June 2026', key: '2026-06' },
    { month: 'Jul', fullName: 'July 2026', key: '2026-07' },
    { month: 'Aug', fullName: 'August 2026', key: '2026-08' },
    { month: 'Sep', fullName: 'September 2026', key: '2026-09' },
    { month: 'Oct', fullName: 'October 2026', key: '2026-10' },
    { month: 'Nov', fullName: 'November 2026', key: '2026-11' },
    { month: 'Dec', fullName: 'December 2026', key: '2026-12' },
  ];

  const currentMonthKey = getMonthInfo().monthKey;
  const monthlyTrend = monthConfigs.map(m => {
    if (m.key === currentMonthKey) {
      return {
        month: m.month,
        fullName: m.fullName,
        score: overallScore,
        kpiRate: taskBreakdown.completionPercent,
        attendanceRate: averageAttendance,
        kriScore: overallScore
      };
    }
    return {
      month: m.month,
      fullName: m.fullName,
      score: 0,
      kpiRate: 0,
      attendanceRate: 0,
      kriScore: 0
    };
  });

  // 9. Quick Insights
  const sortedProfiles = [...employeeProfiles].filter(e => e.overallScore > 0).sort((a, b) => b.overallScore - a.overallScore);
  const topPerformer = sortedProfiles[0] || (employeeProfiles[0] || null);

  const sortedDepts = [...departmentPerformances].filter(d => d.employeeCount > 0).sort((a, b) => b.averageScore - a.averageScore);
  const bestDepartment = sortedDepts[0] || null;

  const needsAttentionCount = employeeProfiles.filter(e => e.overallScore > 0 && e.overallScore < 70).length;
  const overdueTasksCount = taskBreakdown.overdue;

  return {
    employeeProfiles,
    companySummary: {
      overallScore,
      averageAttendance,
      taskCompletionRate,
      salesTargetAchievement,
      activeEmployeeCount: activeEmps.length,
      attendanceBreakdown,
      taskBreakdown,
      departmentPerformances,
      monthlyTrend,
      topPerformer,
      bestDepartment,
      needsAttentionCount,
      overdueTasksCount
    }
  };
};
