// Enterprise Task Management Module Types & Domain Logic

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type TaskOverallStatus = 
  | 'OPEN' 
  | 'IN PROGRESS' 
  | 'PARTIALLY COMPLETED' 
  | 'COMPLETED' 
  | 'CLOSED' 
  | 'OVERDUE'
  | 'CANCELLED';

export type TaskAssigneeStatus = 
  | 'Pending' 
  | 'In Progress' 
  | 'In Process'
  | 'Under Review' 
  | 'Completed' 
  | 'Blocked';

export type TaskAssigneeRole = 'ASSIGNEE' | 'RESPONSIBLE' | 'ACCOUNTABLE';

export type TaskSourceType = 'Direct' | 'MOM' | 'Audit' | 'Project' | 'Incident';

export type TaskDueStatus = 'On Track' | 'Due Today' | 'Due Tomorrow' | 'Overdue' | 'Completed';

export interface TaskCompletionEvidence {
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  description?: string;
  submittedAt?: string;
}

export interface TaskAssignee {
  id: string;
  taskId: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  employeeDepartment: string;
  employeeAvatar: string;
  role: TaskAssigneeRole;
  individualStatus: TaskAssigneeStatus;
  progressPercentage: number; // 0 - 100
  actualStartDate?: string;
  completedDate?: string;
  latestRemark?: string;
  completionEvidence?: TaskCompletionEvidence;
  assignedAt: string;
  updatedAt: string;
}

// Backend (Supabase) task-assignee payload. employeeId is the PostgreSQL UUID FK.
export interface TaskAssigneePayload {
  taskId: string;
  employeeId: string;
  role: TaskAssigneeRole;
  progress: number;             // 0 - 100
  status: TaskAssigneeStatus;
  assignedAt: string;           // ISO timestamp
  updatedAt: string;            // ISO timestamp
}

export const toTaskAssigneePayload = (a: TaskAssignee): TaskAssigneePayload => ({
  taskId: a.taskId,
  employeeId: a.employeeId,
  role: a.role,
  progress: a.progressPercentage,
  status: a.individualStatus,
  assignedAt: a.assignedAt,
  updatedAt: a.updatedAt
});

export interface TaskUpdateLog {
  id: string;
  taskId: string;
  assigneeId: string;
  employeeId: string;
  employeeName: string;
  employeeAvatar: string;
  status: TaskAssigneeStatus;
  progressPercentage: number;
  remarks: string;
  updatedBy: string;
  updatedAt: string;
}

export interface TaskDailyReport {
  id: string;
  taskId: string;
  reportDate: string; // YYYY-MM-DD
  employeeId: string;
  employeeName: string;
  employeeAvatar?: string;
  employeeDepartment?: string;
  workDoneToday: string;
  planForTomorrow?: string;
  blockersOrIssues?: string;
  hoursSpent?: number;
  processStatus: TaskAssigneeStatus;
  submittedAt: string;
  submittedTo: string[]; // e.g. ['CEO', 'HR Manager', 'Assigner']
  seenBy?: string[];
  seenAt?: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userRole: string;
  content: string;
  attachments?: string[];
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  fileSize: string;
  fileType: string;
  fileUrl: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface TaskLinkItem {
  id: string;
  taskId: string;
  title: string;
  url: string;
  addedBy: string;
  addedAt: string;
}

export interface TaskTimelineEvent {
  id: string;
  taskId: string;
  title: string;
  description: string;
  timestamp: string;
  iconType: 'created' | 'status_change' | 'progress' | 'assigned' | 'evidence' | 'closed' | 'reopened' | 'mom' | 'escalated';
  actorName: string;
}

export interface TaskAuditLog {
  id: string;
  taskId: string;
  taskNumber: string;
  action: string;
  module: string;
  oldValue: string;
  newValue: string;
  performedBy: string;
  performedByRole: string;
  timestamp: string;
}

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  dependsOnTaskNumber: string;
  dependsOnTaskTitle: string;
  type: 'Finish-to-Start' | 'Start-to-Start' | 'Finish-to-Finish';
}

export interface MOMActionItem {
  id: string;
  momId: string;
  momNumber: string;
  itemNumber: string;
  title: string;
  description: string;
  decision: string;
  dueDate: string;
  actionRequired: boolean;
  assignedEmployeeIds: string[];
  department: string;
  priority: TaskPriority;
  status: 'Pending' | 'Task Created' | 'In Progress' | 'Completed' | 'Closed';
  linkedTaskId?: string;
  linkedTaskNumber?: string;
  createdAt: string;
}

export interface MOMMeeting {
  id: string;
  meetingNumber: string;
  meetingTitle: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  location: string;
  department: string;
  organizerName: string;
  attendees: string[];
  summary: string;
  actionItems: MOMActionItem[];
}

export interface TaskMasterItem {
  id: string;
  type: 'TaskType' | 'TaskCategory' | 'Priority' | 'TaskStatus' | 'DueStatus' | 'EscalationLevel' | 'ClosureCategory' | 'DependencyType' | 'ReasonForDelay' | 'ProgressBand';
  name: string;
  code: string;
  color?: string;
  order: number;
  isActive: boolean;
  description?: string;
}

export interface TaskEscalationRule {
  id: string;
  level: number;
  triggerEvent: 'Overdue' | 'NoUpdate' | 'CriticalPending';
  triggerDelayHours: number;
  notifyRoles: string[];
  escalationAction: string;
  isActive: boolean;
}

export interface TaskPerformanceWeights {
  taskCompletionWeight: number; // e.g. 40
  onTimeCompletionWeight: number; // e.g. 25
  attendanceWeight: number; // e.g. 15
  managerRatingWeight: number; // e.g. 10
  goalAchievementWeight: number; // e.g. 10
}

export interface TaskItemEnhanced {
  id: string;
  taskNumber: string; // e.g. TSK-2026-001
  title: string;
  taskDate: string;
  sourceType: TaskSourceType;
  sourceReference?: string;
  momId?: string;
  momItemNumber?: string;
  createdBy: string;
  createdById?: string;
  assignedBy: string;
  assignedById?: string;
  responsiblePersonId: string;
  responsiblePersonName: string;
  department: string;
  taskCategory: string;
  priority: TaskPriority;
  startDate: string;
  dueDate: string;
  reviewDate?: string;
  relatedProject?: string;
  dependencyIds?: string[];
  description: string;
  expectedOutput: string;
  overallProgress: number; // System-derived 0 - 100%
  overallStatus: TaskOverallStatus; // System-derived
  assignees: TaskAssignee[];
  updates: TaskUpdateLog[];
  dailyReports?: TaskDailyReport[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
  links?: TaskLinkItem[];
  timeline: TaskTimelineEvent[];
  auditLogs: TaskAuditLog[];
  viewedBy?: string[];
  viewedAt?: Record<string, string>;
  reminderSentAt?: Record<string, string>;
  editedAt?: string;
  editedBy?: string;
  isReopened?: boolean;
  reopenReason?: string;
  closedAt?: string;
  closedBy?: string;
  closureRemarks?: string;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// Business Logic Functions
// ─────────────────────────────────────────────────────────────

/**
 * System-Derived Overall Task Status & Progress Logic:
 * - IF no assignee started: OPEN (or OVERDUE if past due)
 * - IF any assignee working: IN PROGRESS
 * - IF some completed + some pending: PARTIALLY COMPLETED
 * - IF all required assignees completed: COMPLETED
 * - IF responsible person confirms: CLOSED
 */
export function computeTaskOverallStatusAndProgress(
  assignees: TaskAssignee[], 
  currentStatus: TaskOverallStatus,
  dueDate: string
): { overallStatus: TaskOverallStatus; overallProgress: number } {
  if (!assignees || assignees.length === 0) {
    return { overallStatus: 'OPEN', overallProgress: 0 };
  }

  // Preserve CLOSED state unless explicitly reopened
  if (currentStatus === 'CLOSED') {
    const avg = Math.round(assignees.reduce((acc, a) => acc + (a.progressPercentage || 0), 0) / assignees.length);
    return { overallStatus: 'CLOSED', overallProgress: avg };
  }

  const total = assignees.length;
  const totalProgress = assignees.reduce((acc, a) => acc + (a.progressPercentage || 0), 0);
  const overallProgress = Math.min(100, Math.max(0, Math.round(totalProgress / total)));

  const completedCount = assignees.filter(
    a => a.individualStatus === 'Completed' || a.progressPercentage === 100
  ).length;

  const startedCount = assignees.filter(
    a => a.individualStatus === 'In Progress' || a.individualStatus === 'In Process' || a.individualStatus === 'Under Review' || a.progressPercentage > 0
  ).length;

  const today = new Date().toISOString().split('T')[0];
  const isPastDue = Boolean(dueDate && dueDate < today);

  let overallStatus: TaskOverallStatus;

  if (completedCount === total) {
    overallStatus = 'COMPLETED';
  } else if (completedCount > 0 && completedCount < total) {
    overallStatus = 'PARTIALLY COMPLETED';
  } else if (startedCount > 0) {
    overallStatus = 'IN PROGRESS';
  } else {
    overallStatus = isPastDue ? 'OVERDUE' : 'OPEN';
  }

  return { overallStatus, overallProgress };
}

/**
 * Compute Due Status badge based on due date and status
 */
export function computeDueStatus(dueDate: string, overallStatus: TaskOverallStatus): TaskDueStatus {
  if (overallStatus === 'COMPLETED' || overallStatus === 'CLOSED') {
    return 'Completed';
  }

  if (!dueDate) return 'On Track';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Due Today';
  if (diffDays === 1) return 'Due Tomorrow';
  return 'On Track';
}

/**
 * Calculate dynamic task metrics for an employee
 */
export interface EmployeeTaskMetrics {
  totalAssigned: number;
  openTasks: number;
  inProgressTasks: number;
  partiallyCompletedTasks: number;
  completedTasks: number;
  overdueTasks: number;
  closedTasks: number;
  completionRate: number; // 0 - 100%
  onTimeCompletionRate: number; // 0 - 100%
  averageProgress: number; // 0 - 100%
  workloadLevel: 'Light' | 'Normal' | 'High' | 'Overloaded';
}

export function calculateEmployeeTaskMetrics(
  employeeId: string, 
  tasks: TaskItemEnhanced[]
): EmployeeTaskMetrics {
  const empTasks = tasks.filter(t => 
    t.assignees.some(a => a.employeeId === employeeId) || t.responsiblePersonId === employeeId
  );

  const totalAssigned = empTasks.length;
  if (totalAssigned === 0) {
    return {
      totalAssigned: 0,
      openTasks: 0,
      inProgressTasks: 0,
      partiallyCompletedTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
      closedTasks: 0,
      completionRate: 100,
      onTimeCompletionRate: 100,
      averageProgress: 0,
      workloadLevel: 'Light'
    };
  }

  let completedTasks = 0;
  let onTimeCompleted = 0;
  let overdueTasks = 0;
  let inProgressTasks = 0;
  let openTasks = 0;
  let partiallyCompletedTasks = 0;
  let closedTasks = 0;
  let progressSum = 0;

  const today = new Date().toISOString().split('T')[0];

  empTasks.forEach(task => {
    const assigneeRecord = task.assignees.find(a => a.employeeId === employeeId);
    const individualProgress = assigneeRecord ? assigneeRecord.progressPercentage : task.overallProgress;
    const individualStatus = assigneeRecord ? assigneeRecord.individualStatus : 'Pending';

    progressSum += individualProgress;

    const isCompleted = individualStatus === 'Completed' || individualProgress === 100;
    const isOverdue = !isCompleted && task.dueDate && task.dueDate < today;

    if (task.overallStatus === 'CLOSED') {
      closedTasks++;
      completedTasks++;
      if (assigneeRecord?.completedDate && task.dueDate && assigneeRecord.completedDate <= task.dueDate) {
        onTimeCompleted++;
      } else {
        onTimeCompleted++;
      }
    } else if (isCompleted) {
      completedTasks++;
      if (assigneeRecord?.completedDate && task.dueDate && assigneeRecord.completedDate <= task.dueDate) {
        onTimeCompleted++;
      } else if (!assigneeRecord?.completedDate && task.dueDate && task.dueDate >= today) {
        onTimeCompleted++;
      }
    } else if (isOverdue) {
      overdueTasks++;
    } else if (individualStatus === 'In Progress' || individualProgress > 0) {
      inProgressTasks++;
    } else {
      openTasks++;
    }

    if (task.overallStatus === 'PARTIALLY COMPLETED') {
      partiallyCompletedTasks++;
    }
  });

  const completionRate = Math.round((completedTasks / totalAssigned) * 100);
  const onTimeCompletionRate = completedTasks > 0 ? Math.round((onTimeCompleted / completedTasks) * 100) : 100;
  const averageProgress = Math.round(progressSum / totalAssigned);

  const activeCount = openTasks + inProgressTasks + overdueTasks;
  let workloadLevel: EmployeeTaskMetrics['workloadLevel'] = 'Normal';
  if (activeCount <= 1) workloadLevel = 'Light';
  else if (activeCount <= 3) workloadLevel = 'Normal';
  else if (activeCount <= 5) workloadLevel = 'High';
  else workloadLevel = 'Overloaded';

  return {
    totalAssigned,
    openTasks,
    inProgressTasks,
    partiallyCompletedTasks,
    completedTasks,
    overdueTasks,
    closedTasks,
    completionRate,
    onTimeCompletionRate,
    averageProgress,
    workloadLevel
  };
}

/**
 * Determines whether a task was assigned/created by the specified user
 */
export function isTaskAssignedByMe(task: TaskItemEnhanced, currentUser: any): boolean {
  if (!task || !currentUser) return false;

  const currentEmpId = (currentUser.employeeId || currentUser.id || '').toLowerCase().trim();
  const currentName = (currentUser.name || '').toLowerCase().trim();

  // 1. Check createdById or assignedById
  if ((task as any).createdById && currentEmpId && (task as any).createdById.toLowerCase().trim() === currentEmpId) {
    return true;
  }
  if ((task as any).assignedById && currentEmpId && (task as any).assignedById.toLowerCase().trim() === currentEmpId) {
    return true;
  }

  // 2. Check createdBy string
  const createdBy = (task.createdBy || '').toLowerCase().trim();
  if (currentName && createdBy) {
    if (createdBy === currentName || createdBy.includes(currentName) || currentName.includes(createdBy)) {
      return true;
    }
  }

  // 3. Check assignedBy string (e.g. "AJITH KUMAR (Employee)")
  const assignedBy = (task.assignedBy || '').toLowerCase().trim();
  if (currentName && assignedBy) {
    if (assignedBy.includes(currentName) || currentName.includes(assignedBy)) {
      return true;
    }
  }

  return false;
}
