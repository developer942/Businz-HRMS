import { describe, expect, it } from 'vitest';
import {
  isCompanyWideGatewayRole,
  isAssetVisibleToCaller,
  isTaskVisibleToCaller,
} from '../src/controllers/dataGatewayController.js';

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
