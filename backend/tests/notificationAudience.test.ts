import { describe, expect, it } from 'vitest';
import {
  isNotificationVisibleToUser,
  notificationAudienceRoles,
  notificationIdentityKeys,
} from '../src/controllers/notificationController.js';

const employee = {
  id: 'uuid-1',
  employeeId: 'EMP-001',
  email: 'employee@example.com',
  name: 'Employee One',
  role: 'Employee',
};

describe('notification audience isolation', () => {
  it('normalizes all authenticated employee identities', () => {
    expect(notificationIdentityKeys(employee)).toContain('emp-001');
    expect(notificationIdentityKeys(employee)).toContain('employee@example.com');
  });

  it('shows an employee-targeted notification only to that employee', () => {
    const notification = { targetEmployeeIds: ['EMP-001'], targetRoles: [] };
    expect(isNotificationVisibleToUser(notification, employee)).toBe(true);
    expect(isNotificationVisibleToUser(notification, { ...employee, employeeId: 'EMP-002', id: 'uuid-2' })).toBe(false);
  });

  it('maps finance department users to the Accounts audience', () => {
    const accounts = { ...employee, role: 'Employee', department: 'Finance' };
    expect(notificationAudienceRoles(accounts)).toContain('ACCOUNTS');
    expect(isNotificationVisibleToUser({ targetRoles: ['ACCOUNTS'] }, accounts)).toBe(true);
  });

  it('does not deliver a notification back to its sender', () => {
    expect(isNotificationVisibleToUser({
      senderKey: 'EMP-001',
      targetRoles: ['ALL'],
    }, employee)).toBe(false);
  });
});
