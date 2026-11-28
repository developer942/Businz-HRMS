import { describe, expect, it } from 'vitest';
import {
  isCompanyWideGatewayRole,
  isAssetVisibleToCaller,
  isTaskVisibleToCaller,
  mergeStandardTaskUpdate,
} from '../src/controllers/dataGatewayController.js';
import { canAccessPettyCash } from '../src/routes/pettyCashRoutes.js';

describe('mobile/backend data gateway task isolation', () => {
  it('allows the responsible employee by employee code', () => {
    expect(isTaskVisibleToCaller({ responsible_person_id: 'EMP-004' }, 'emp-004', '')).toBe(true);
  });

  it('allows nested task assignees used by the legacy enterprise task model', () => {
    expect(
      isTaskVisibleToCaller(
        { task_data: { assignees: [{ employeeId: 'EMP-009' }] } },
        'emp-009',
        ''
      )
    ).toBe(true);
  });

  it('allows a task creator to see a task assigned through the web model', () => {
    expect(isTaskVisibleToCaller({ assigned_by: 'EMP-010' }, 'emp-010', '')).toBe(true);
    expect(isTaskVisibleToCaller({ task_data: { assignedBy: 'EMP-011' } }, 'emp-011', '')).toBe(true);
  });

  it('does not expose another employee task', () => {
    expect(
      isTaskVisibleToCaller(
        { responsible_person_id: 'EMP-002', task_data: { assignees: ['EMP-003'] } },
        'emp-001',
        '7f05bcb8-767a-4e7b-a9d0-0112f78cf217'
      )
    ).toBe(false);
  });

  it('does not treat team managers as company-wide data gateway users', () => {
    expect(isCompanyWideGatewayRole('Manager')).toBe(false);
    expect(isCompanyWideGatewayRole('Department Manager')).toBe(false);
    expect(isCompanyWideGatewayRole('HR Manager')).toBe(true);
    expect(isCompanyWideGatewayRole('Finance Manager')).toBe(true);
  });
});

describe('standard task update restrictions', () => {
  it('accepts progress evidence without allowing ownership or title rewrites', () => {
    const merged = mergeStandardTaskUpdate(
      {
        task_data: {
          title: 'Authoritative task',
          responsiblePersonId: 'EMP-004',
          assignees: [{ employeeId: 'EMP-004' }],
          dailyReports: [],
        },
      },
      {
        title: 'Tampered title',
        responsiblePersonId: 'EMP-999',
        assignees: [{ employeeId: 'EMP-999' }],
        dailyReports: [{ id: 'report-1', workDoneToday: 'Completed review' }],
        attachments: [{ id: 'attachment-1' }],
      },
      'IN PROGRESS',
      60,
      '2026-11-25T12:00:00.000Z'
    );

    expect(merged.title).toBe('Authoritative task');
    expect(merged.responsiblePersonId).toBe('EMP-004');
    expect(merged.assignees).toEqual([{ employeeId: 'EMP-004' }]);
    expect(merged.dailyReports).toHaveLength(1);
    expect(merged.attachments).toHaveLength(1);
    expect(merged.overallStatus).toBe('IN PROGRESS');
    expect(merged.overallProgress).toBe(60);
  });
});

describe('mobile/backend asset isolation', () => {
  it('allows only the employee assigned to an asset for own-data roles', () => {
    const asset = { assigned_employee_id: '8a4d9e4f-6c58-4a96-b98b-09072a1a30b9' };
    expect(isAssetVisibleToCaller(asset, 'emp-004', '8a4d9e4f-6c58-4a96-b98b-09072a1a30b9')).toBe(true);
    expect(isAssetVisibleToCaller(asset, 'emp-005', '2aa1a1fd-2df7-4fdc-931d-babc1a5f27d9')).toBe(false);
  });

  it('supports legacy employee-code assignments without exposing other records', () => {
    expect(isAssetVisibleToCaller({ assignedEmployeeId: 'EMP-009' }, 'emp-009', '')).toBe(true);
    expect(isAssetVisibleToCaller({ assignedEmployeeId: 'EMP-010' }, 'emp-009', '')).toBe(false);
  });
});

describe('petty cash participant isolation', () => {
  const account = {
    custodian_id: 'a68aa574-72f0-40ef-b71f-5650be2bff5c',
    custodian_employee_id: 'VRM-013',
  };

  it('allows finance oversight and the active custodian', () => {
    expect(canAccessPettyCash({ role: 'CEO' }, null)).toBe(true);
    expect(canAccessPettyCash({ role: 'Accountant' }, null)).toBe(true);
    expect(canAccessPettyCash({ role: 'Employee', employeeId: 'vrm-013' }, account)).toBe(true);
  });

  it('denies an unrelated employee', () => {
    expect(canAccessPettyCash({ role: 'Employee', employeeId: 'VRM-014' }, account)).toBe(false);
  });
});
