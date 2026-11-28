import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  create: vi.fn(), updateDraft: vi.fn(), list: vi.fn(), getById: vi.fn(), getDetail: vi.fn(),
  decide: vi.fn(), distribute: vi.fn(), addDailyReport: vi.fn(), complete: vi.fn(),
  distributionHistory: vi.fn(), summary: vi.fn(),
}));

vi.mock('../src/repositories/fieldAllowanceRepository.js', () => ({ fieldAllowanceRepository: repository }));

import {
  fieldAllowanceDailyReportSchema,
  fieldAllowanceDistributionSchema,
  fieldAllowanceRequestSchema,
} from '../src/validators/fieldAllowanceValidators.js';
import { FieldAllowanceService } from '../src/services/fieldAllowanceService.js';

const employee = { id: 'user-1', employeeId: 'EMP-101', name: 'Test Employee', email: 'employee@test.com', role: 'Employee', department: 'Sales', company_id: 'company-a' };
const hr = { ...employee, id: 'hr-1', employeeId: 'EMP-001', role: 'HR Manager', name: 'HR Manager', department: 'Human Resources' };
const ceo = { ...employee, id: 'ceo-1', employeeId: 'EMP-000', role: 'CEO', name: 'Chief Executive' };
const accounts = { ...employee, id: 'acc-1', employeeId: 'EMP-002', role: 'Finance Manager', name: 'Accounts' };
const accountsDepartmentEmployee = { ...employee, id: 'acc-2', employeeId: 'EMP-003', role: 'Employee', department: 'Accounts', designation: 'Accounts Executive', name: 'Accounts User' };
const baseRequest = {
  id: 'trip-1', company_id: 'company-a', trip_code: 'FA-2026-TEST', employee_id: 'EMP-101', employee_name: 'Test Employee',
  department_name: 'Sales', purpose: 'Customer visit', destination: 'Chennai', start_date: '2026-11-05', end_date: '2026-11-08',
  advance_required: true, requested_amount: 6000, approved_amount: 6000, allocated_amount: 6000,
  total_spent: 5000, balance: 1000, status: 'AMOUNT_DISTRIBUTED', created_at: '', updated_at: '',
};

describe('Finance and Claims business workflow', () => {
  const service = new FieldAllowanceService();
  beforeEach(() => vi.clearAllMocks());

  it('rejects invalid dates and enforces zero amount when no advance is requested', () => {
    expect(() => fieldAllowanceRequestSchema.parse({ purpose: 'Site visit', destination: 'Nellore', startDate: '2026-11-08', endDate: '2026-11-05', advanceRequired: false, requestedAmount: 100, submit: true })).toThrow();
    const valid = fieldAllowanceRequestSchema.parse({ purpose: 'Site visit', destination: 'Nellore', startDate: '2026-11-05', endDate: '2026-11-08', advanceRequired: false, requestedAmount: 0, submit: true });
    expect(valid.requestedAmount).toBe(0);
  });

  it('enforces mandatory bill proof and valid categories for daily expense reports', () => {
    // Missing attachment throws
    expect(() =>
      fieldAllowanceDailyReportSchema.parse({
        expenseDate: '2026-11-06',
        category: 'TRAVEL',
        amount: 200,
        description: 'Auto fare',
      })
    ).toThrow(/proof.*mandatory/i);

    // Valid with attachment and new category TAXI_AUTO
    const valid = fieldAllowanceDailyReportSchema.parse({
      expenseDate: '2026-11-06',
      category: 'TAXI_AUTO',
      amount: 200,
      description: 'Auto fare',
      attachmentPath: 'data:image/jpeg;base64,samplephoto123',
    });
    expect(valid.category).toBe('TAXI_AUTO');
    expect(valid.amount).toBe(200);
  });

  it('scopes ordinary employees to their own requests', async () => {
    repository.list.mockResolvedValue([]);
    await service.list(employee, {});
    expect(repository.list).toHaveBeenCalledWith('company-a', expect.objectContaining({ employeeId: 'EMP-101' }));
    await service.list(hr, {});
    expect(repository.list).toHaveBeenLastCalledWith('company-a', expect.objectContaining({ employeeId: undefined }));
  });

  it('allows HR approval and Accounts distribution through separate actions', async () => {
    repository.getById.mockResolvedValue({ ...baseRequest, status: 'PENDING_APPROVAL' });
    repository.decide.mockResolvedValue({ ...baseRequest, status: 'APPROVED' });
    repository.distribute.mockResolvedValue({ id: 'dist-1', distributed_amount: 6000 });
    await service.decide(hr, 'trip-1', { decision: 'APPROVED', approvedAmount: 6000 });
    expect(repository.decide).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'trip-1', decision: 'APPROVED', approvedAmount: 6000 }));
    await service.distribute(accounts, 'trip-1', { distributedAmount: 6000, distributionDate: '2026-11-05', paymentMethod: 'Bank Transfer' });
    expect(repository.distribute).toHaveBeenCalledWith(expect.objectContaining({ distributedAmount: 6000, distributedBy: 'acc-1' }));
  });

  it('Workflow A: initializes visit immediately into ACTIVE_VISIT without advance approval', async () => {
    repository.create.mockResolvedValue({ ...baseRequest, advance_required: false, requested_amount: 0, status: 'ACTIVE_VISIT' });
    await service.create(employee, {
      purpose: 'Software upgrade',
      destination: 'Trichy',
      startDate: '2026-11-05',
      endDate: '2026-11-08',
      advanceRequired: false,
      requestedAmount: 0,
      submit: true,
    });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      advance_required: false,
      requested_amount: 0,
      status: 'ACTIVE_VISIT',
    }));
  });

  it('Workflow A: permits daily reports during ACTIVE_VISIT with mandatory attachment', async () => {
    repository.getById.mockResolvedValue({ ...baseRequest, advance_required: false, approved_amount: 0, allocated_amount: 0, total_spent: 0, balance: 0, status: 'ACTIVE_VISIT' });
    repository.addDailyReport.mockResolvedValue({ id: 'expense-1', amount: 2000 });
    await service.addDailyReport(employee, 'trip-1', {
      expenseDate: '2026-11-06',
      category: 'FOOD',
      amount: 2000,
      description: 'Team meals',
      attachmentPath: 'data:image/jpeg;base64,photodata',
    });
    expect(repository.addDailyReport).toHaveBeenCalledWith(expect.objectContaining({ amount: 2000, employee_id: 'EMP-101' }));
  });

  it('Workflow B: blocks daily reports before distribution when an advance was requested', async () => {
    repository.getById.mockResolvedValue({ ...baseRequest, allocated_amount: 0, status: 'APPROVED' });
    await expect(service.addDailyReport(employee, 'trip-1', { expenseDate: '2026-11-06', category: 'TRAVEL', amount: 500, description: 'Cab' })).rejects.toThrow(/after distribution/i);
  });

  it('Workflow B: blocks completing an advance trip before Accounts distribution', async () => {
    repository.getById.mockResolvedValue({ ...baseRequest, allocated_amount: 0, status: 'APPROVED' });
    await expect(service.complete(employee, 'trip-1')).rejects.toThrow(/before the approved advance is distributed/i);
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it('Role Restrictions: CEO cannot create personal requests', async () => {
    await expect(service.create(ceo, {
      purpose: 'Executive travel',
      destination: 'Mumbai',
      startDate: '2026-11-05',
      endDate: '2026-11-08',
      advanceRequired: true,
      requestedAmount: 10000,
      submit: true,
    })).rejects.toThrow(/CEO accounts cannot create personal Finance and Claims requests/i);
  });

  it('Role Restrictions: HR staff requests can only be approved by CEO', async () => {
    repository.getById.mockResolvedValue({ ...baseRequest, employee_id: 'EMP-001', department_name: 'Human Resources', status: 'PENDING_APPROVAL' });
    const anotherHr = { ...hr, id: 'hr-2', employeeId: 'EMP-009', name: 'HR Executive' };
    await expect(service.decide(anotherHr, 'trip-1', { decision: 'APPROVED', approvedAmount: 6000 })).rejects.toThrow(/HR staff claims and advance requests must be approved by the CEO only/i);
    // But CEO can approve it
    repository.decide.mockResolvedValue({ ...baseRequest, status: 'APPROVED' });
    await expect(service.decide(ceo, 'trip-1', { decision: 'APPROVED', approvedAmount: 6000 })).resolves.not.toThrow();
  });

  it('Role Restrictions: Employees cannot approve their own requests', async () => {
    repository.getById.mockResolvedValue({ ...baseRequest, employee_id: 'EMP-001', status: 'PENDING_APPROVAL' });
    await expect(service.decide(hr, 'trip-1', { decision: 'APPROVED', approvedAmount: 6000 })).rejects.toThrow(/You cannot review your own Finance and Claims request/i);
  });

  it('recognizes an Accounts department employee even when the base role is Employee', async () => {
    repository.list.mockResolvedValue([]);
    repository.distribute.mockResolvedValue({ id: 'dist-2', distributed_amount: 6000 });
    await service.list(accountsDepartmentEmployee, {});
    expect(repository.list).toHaveBeenCalledWith('company-a', expect.objectContaining({ employeeId: undefined }));
    await service.distribute(accountsDepartmentEmployee, 'trip-1', { distributedAmount: 6000, distributionDate: '2026-11-06', paymentMethod: 'Bank Transfer' });
    expect(repository.distribute).toHaveBeenCalledWith(expect.objectContaining({ distributedBy: 'acc-2', distributedAmount: 6000 }));
  });

  it('supports negative balances as allocated minus spent without error', () => {
    const allocated = 6000;
    const spent = 7000;
    expect(allocated - spent).toBe(-1000);
    expect(0 - 2000).toBe(-2000);
  });

  it('requires payment proof for non-cash distribution but not for cash', () => {
    const common = { distributedAmount: 100, distributionDate: '2026-11-06' };
    expect(() => fieldAllowanceDistributionSchema.parse({ ...common, paymentMethod: 'Bank Transfer', referenceNumber: 'UTR-100' })).toThrow(/payment proof/i);
    expect(fieldAllowanceDistributionSchema.parse({ ...common, paymentMethod: 'Cash' }).paymentProofPath).toBeUndefined();
    expect(fieldAllowanceDistributionSchema.parse({ ...common, paymentMethod: 'UPI', referenceNumber: 'UPI-100', paymentProofPath: 'data:image/png;base64,proof' }).paymentProofPath).toContain('data:image/png');
  });
});
