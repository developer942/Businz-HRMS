// VRM Enterprise HRMS - Approval & Notification Routing Engine
// Resolves designated approvers, multi-stage approval sequences,
// and ensures notifications route strictly to eligible personnel.

import { Employee } from '../types/hrms';

export interface ApproverResolutionResult {
  targetRoles: string[];
  targetEmployeeIds: string[];
  stageLabel: string;
  isManagerStage: boolean;
  isFinalStage: boolean;
  approverDescription: string;
}

/**
 * Resolves the eligible approver(s) for a given employee and request module
 */
export function resolveApproversForRequest(params: {
  employee: Employee | null | undefined;
  module: 'leaves' | 'attendance' | 'tasks' | 'advance_salary' | 'field_allowance' | 'petty_cash' | 'shifts';
  stage?: number; // 1 = initial, 2 = intermediate/management, 3 = accounts/disbursement
  allEmployees?: Employee[];
}): ApproverResolutionResult {
  const { employee, module, stage = 1, allEmployees = [] } = params;

  // 1. Check if employee is in HR / Management
  const isHrEmployee = employee ? (
    (employee.department || '').toLowerCase().includes('hr') ||
    (employee.department || '').toLowerCase().includes('human resource') ||
    (employee.designation || '').toLowerCase().includes('hr') ||
    (employee.role || '').toLowerCase().includes('hr')
  ) : false;

  // HR staff requests must ALWAYS be approved by CEO
  if (isHrEmployee) {
    return {
      targetRoles: ['CEO'],
      targetEmployeeIds: [],
      stageLabel: 'CEO Review',
      isManagerStage: false,
      isFinalStage: true,
      approverDescription: 'CEO Approval',
    };
  }

  // 2. Stage 3 (Accounts Payment / Disbursement)
  if (stage >= 3 || (module === 'advance_salary' && stage === 2)) {
    return {
      targetRoles: ['ACCOUNTS'],
      targetEmployeeIds: [],
      stageLabel: 'Accounts Settlement',
      isManagerStage: false,
      isFinalStage: true,
      approverDescription: 'Accounts Department (Disbursement)',
    };
  }

  // 3. Stage 2 (HR / Management Final Sign-Off)
  if (stage === 2) {
    return {
      targetRoles: ['HR', 'CEO'],
      targetEmployeeIds: [],
      stageLabel: 'HR & Management Approval',
      isManagerStage: false,
      isFinalStage: true,
      approverDescription: 'HR / CEO Approval',
    };
  }

  // 4. Stage 1 (Direct Reporting Manager)
  if (employee && employee.reportingManagerId) {
    const mgrId = String(employee.reportingManagerId).trim().toLowerCase();
    const manager = allEmployees.find(e =>
      String(e.id || '').toLowerCase() === mgrId ||
      String(e.employeeId || '').toLowerCase() === mgrId
    );

    // If active manager found and is distinct from employee
    if (manager && String(manager.id).toLowerCase() !== String(employee.id).toLowerCase() && manager.status !== 'Terminated') {
      return {
        targetRoles: [],
        targetEmployeeIds: [manager.employeeId, manager.id].filter(Boolean),
        stageLabel: `Reporting Manager (${manager.firstName} ${manager.lastName})`,
        isManagerStage: true,
        isFinalStage: false,
        approverDescription: `${manager.firstName} ${manager.lastName} (Reporting Manager)`,
      };
    }
  }

  // 5. Fallback: If no reporting manager configured, route to HR & CEO
  return {
    targetRoles: ['HR', 'CEO'],
    targetEmployeeIds: [],
    stageLabel: 'HR / CEO Review',
    isManagerStage: false,
    isFinalStage: true,
    approverDescription: 'HR & CEO Review',
  };
}
