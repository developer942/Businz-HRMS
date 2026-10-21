import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, auditLogMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditLogMock: vi.fn(),
}));

vi.mock('../src/config/env.js', () => ({
  env: {
    SYSTEM_SUPER_ADMIN_EMAIL: 'developer@businz.com',
    SYSTEM_SUPER_ADMIN_PASSWORD: 'test-only-system-password',
    JWT_SECRET: 'test-jwt-secret-that-is-long-enough',
  },
}));

vi.mock('../src/config/database.js', () => ({
  hasDatabaseColumn: vi.fn(),
  query: queryMock,
}));

vi.mock('../src/repositories/auditRepository.js', () => ({
  auditRepository: { recordLog: auditLogMock },
}));

import { authRepository } from '../src/repositories/authRepository.js';

describe('environment-backed system Super Admin', () => {
  beforeEach(() => {
    queryMock.mockReset();
    auditLogMock.mockReset();
  });

  it('authenticates by email or EMP-000 without querying employees', async () => {
    const byEmail = await authRepository.findByIdentifier('DEVELOPER@BUSINZ.COM');
    const byCode = await authRepository.findByIdentifier('emp-000');

    expect(byEmail).toMatchObject({
      email: 'developer@businz.com',
      employeeId: 'EMP-000',
      role: 'Super Admin',
      isSystemAccount: true,
      accountStatus: 'ACTIVE',
    });
    expect(byCode).toMatchObject({ id: 'system-super-admin', role: 'Super Admin' });
    expect(queryMock).not.toHaveBeenCalled();
    await expect(authRepository.verifyPassword('test-only-system-password', byEmail?.passwordHash, byEmail?.plainPassword)).resolves.toBe(true);
  });

  it('records login audit without creating or updating an employee row', async () => {
    const account = await authRepository.findByIdentifier('developer@businz.com');
    expect(account).not.toBeNull();

    await authRepository.recordLoginSuccess(account!);

    expect(auditLogMock).toHaveBeenCalledWith(
      'LOGIN_SUCCESS',
      'EMP-000',
      'developer@businz.com',
      expect.objectContaining({ lastLoginAt: expect.any(String) }),
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does not lock out the system administrator when audit storage is unavailable', async () => {
    const account = await authRepository.findByIdentifier('EMP-000');
    auditLogMock.mockRejectedValueOnce(new Error('database unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(authRepository.recordLoginSuccess(account!)).resolves.toBeUndefined();

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('audit record could not be persisted'),
      'database unavailable',
    );
    expect(queryMock).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it('keeps the environment-managed password out of employee password changes', async () => {
    const result = await authRepository.changePassword(
      'developer@businz.com',
      'test-only-system-password',
      'ReplacementPassword@2026',
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('server configuration');
    expect(queryMock).not.toHaveBeenCalled();
  });
});
