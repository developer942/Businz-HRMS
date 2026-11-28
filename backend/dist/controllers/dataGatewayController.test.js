import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../config/database.js', () => ({
    query: vi.fn(),
}));
import { query } from '../config/database.js';
import { resolveEffectiveGatewayRoles, mergeLoanRecordsSetting, proxyDataGatewayRequest, } from './dataGatewayController.js';
import { rbacRepository } from '../repositories/rbacRepository.js';
describe('dataGatewayController — Asset permissions & Advance Salary persistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe('resolveEffectiveGatewayRoles', () => {
        it('recognizes department-based HR staff even when JWT role is Employee', () => {
            const roles = resolveEffectiveGatewayRoles({
                userRole: 'Employee',
                callerEmpCode: 'vrm-010',
                callerDepartment: 'HR',
                callerDesignation: 'HR Executive',
            });
            expect(roles.isHrAdmin).toBe(true);
            expect(roles.isPrivileged).toBe(true);
            expect(roles.isCeoUser).toBe(false);
        });
        it('recognizes Accounts/Finance staff by department or designation', () => {
            const roles = resolveEffectiveGatewayRoles({
                userRole: 'Employee',
                callerEmpCode: 'vrm-032',
                callerDepartment: 'Accounts',
                callerDesignation: 'Senior Accountant',
            });
            expect(roles.isFinanceAdmin).toBe(true);
            expect(roles.isHrAdmin).toBe(false);
        });
        it('keeps standard non-HR, non-Finance employees unprivileged', () => {
            const roles = resolveEffectiveGatewayRoles({
                userRole: 'Employee',
                callerEmpCode: 'vrm-026',
                callerDepartment: 'DEVELOPER',
                callerDesignation: 'SENIOR',
            });
            expect(roles.isCeoUser).toBe(false);
            expect(roles.isHrAdmin).toBe(false);
            expect(roles.isFinanceAdmin).toBe(false);
            expect(roles.isPrivileged).toBe(false);
        });
    });
    describe('mergeLoanRecordsSetting', () => {
        const existing = [
            {
                id: 'ADV-2026-001',
                employeeId: 'VRM-026',
                employeeName: 'Annamalaiyar AR',
                requestedAmount: 10000,
                status: 'Pending',
            },
            {
                id: 'ADV-2026-002',
                employeeId: 'VRM-027',
                employeeName: 'Ahilesh K',
                requestedAmount: 5000,
                status: 'Approved',
            },
        ];
        it('prevents a stale empty write from wiping existing advance salary requests', () => {
            const merged = mergeLoanRecordsSetting({
                existing,
                incoming: [],
                canManageLoans: false,
                callerEmpCode: 'vrm-026',
                callerUuid: 'uuid-026',
                callerName: 'annamalaiyar ar',
            });
            expect(merged).toHaveLength(2);
            expect(merged.map((r) => r.id)).toEqual(['ADV-2026-001', 'ADV-2026-002']);
        });
        it('allows a standard employee to append only their own Pending request without altering colleagues', () => {
            const merged = mergeLoanRecordsSetting({
                existing,
                incoming: [
                    {
                        id: 'ADV-2026-003',
                        employeeId: 'VRM-026',
                        employeeName: 'Annamalaiyar AR',
                        requestedAmount: 7500,
                        status: 'Approved', // Attempted self-approval must be coerced to Pending
                    },
                    {
                        id: 'ADV-2026-004',
                        employeeId: 'VRM-099',
                        employeeName: 'Someone Else',
                        requestedAmount: 99999,
                        status: 'Pending',
                    },
                ],
                canManageLoans: false,
                callerEmpCode: 'vrm-026',
                callerUuid: 'uuid-026',
                callerName: 'annamalaiyar ar',
            });
            expect(merged).toHaveLength(3);
            expect(merged[0].id).toBe('ADV-2026-003');
            expect(merged[0].status).toBe('Pending');
            expect(merged.find((r) => r.id === 'ADV-2026-004')).toBeUndefined();
        });
        it('preserves concurrent new requests when HR/CEO approves an older snapshot', () => {
            const merged = mergeLoanRecordsSetting({
                existing,
                incoming: [
                    {
                        id: 'ADV-2026-001',
                        employeeId: 'VRM-026',
                        employeeName: 'Annamalaiyar AR',
                        requestedAmount: 10000,
                        status: 'Approved',
                    },
                ],
                canManageLoans: true,
                callerEmpCode: 'vrm-001',
                callerUuid: 'uuid-ceo',
                callerName: 'velmurugan m',
            });
            expect(merged).toHaveLength(2);
            expect(merged.find((r) => r.id === 'ADV-2026-001')?.status).toBe('Approved');
            expect(merged.find((r) => r.id === 'ADV-2026-002')?.status).toBe('Approved');
        });
    });
    describe('proxyDataGatewayRequest GET /assets', () => {
        it('never returns 403 for an authenticated employee on GET /assets even if RBAC assets is empty', async () => {
            vi.mocked(query).mockResolvedValueOnce({
                rows: [
                    {
                        id: 'uuid-emp-26',
                        employee_id: 'VRM-026',
                        first_name: 'Annamalaiyar',
                        last_name: 'AR',
                        designation: 'SENIOR',
                        department_name: 'DEVELOPER',
                    },
                ],
            });
            vi.spyOn(rbacRepository, 'getRolePermissions').mockReturnValueOnce({
                roleId: 'role-employee',
                roleName: 'Employee',
                dataAccess: 'own',
                modulePermissions: { assets: [] },
                specialPermissions: [],
                updatedAt: new Date().toISOString(),
                updatedBy: 'Test',
            });
            const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify([
                    { id: 'ast-1', name: 'Laptop A', assigned_employee_id: 'uuid-emp-26' },
                    { id: 'ast-2', name: 'Phone B', assigned_employee_id: 'uuid-other' },
                ]),
            });
            const req = {
                user: {
                    id: 'uuid-emp-26',
                    employeeId: 'VRM-026',
                    email: 'annamalaiyar@businz.com',
                    name: 'Annamalaiyar AR',
                    role: 'Employee',
                },
                body: { path: '/assets?select=*', method: 'GET' },
            };
            const jsonMock = vi.fn();
            const statusMock = vi.fn(() => ({ json: jsonMock }));
            const res = { status: statusMock };
            const next = vi.fn();
            await proxyDataGatewayRequest(req, res, next);
            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith({
                success: true,
                data: [{ id: 'ast-1', name: 'Laptop A', assigned_employee_id: 'uuid-emp-26' }],
            });
            fetchMock.mockRestore();
        });
        it('returns all company assets for department-based HR staff (no 403)', async () => {
            vi.mocked(query).mockResolvedValueOnce({
                rows: [
                    {
                        id: 'uuid-hr-10',
                        employee_id: 'VRM-010',
                        first_name: 'Pavithra',
                        last_name: 'Ravi',
                        designation: 'HR Executive',
                        department_name: 'HR',
                    },
                ],
            });
            const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify([
                    { id: 'ast-1', name: 'Laptop A', assigned_employee_id: 'uuid-emp-26' },
                    { id: 'ast-2', name: 'Phone B', assigned_employee_id: 'uuid-hr-10' },
                ]),
            });
            const req = {
                user: {
                    id: 'uuid-hr-10',
                    employeeId: 'VRM-010',
                    email: 'pavithra@businz.com',
                    name: 'Pavithra Ravi',
                    role: 'Employee',
                },
                body: { path: '/assets?select=*', method: 'GET' },
            };
            const jsonMock = vi.fn();
            const statusMock = vi.fn(() => ({ json: jsonMock }));
            const res = { status: statusMock };
            const next = vi.fn();
            await proxyDataGatewayRequest(req, res, next);
            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith({
                success: true,
                data: [
                    { id: 'ast-1', name: 'Laptop A', assigned_employee_id: 'uuid-emp-26' },
                    { id: 'ast-2', name: 'Phone B', assigned_employee_id: 'uuid-hr-10' },
                ],
            });
            fetchMock.mockRestore();
        });
    });
});
//# sourceMappingURL=dataGatewayController.test.js.map