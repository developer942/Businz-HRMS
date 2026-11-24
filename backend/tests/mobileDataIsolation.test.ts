import { describe, expect, it } from 'vitest';
import {
  isCompanyWideGatewayRole,
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
