import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeVerifiedHrmsQuery } from '../src/controllers/aiController.js';
import { hrmsDataService } from '../src/services/hrmsDataService.js';

const invoke = async (body: any, user: any = { id: 'u1', employeeId: 'EMP-001', company_id: 'company-a', role: 'Super Admin' }) => {
  const req: any = { body, user, dataAccessScope: { level: user.role === 'Employee' ? 'own' : 'all', employeeId: user.employeeId }, headers: {} };
  let status = 200; let response: any;
  const res: any = { status: vi.fn((value: number) => { status = value; return res; }), json: vi.fn((value: any) => { response = value; }) };
  await executeVerifiedHrmsQuery(req, res);
  return { status, response };
};

describe('Pavi authoritative query controller', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns database-verified employee counts without Gemini', async () => {
    vi.spyOn(hrmsDataService, 'getEmployeeCounts').mockResolvedValue({ totalRegistered: 42, activeCount: 40,
      inactiveCount: 2, excludedDuplicateCount: 0, departmentBreakdown: [] });
    const result = await invoke({ intent: 'GET_EMPLOYEE_COUNT', entities: {}, page: 1, pageSize: 10 });
    expect(result.status).toBe(200);
    expect(result.response.data.source).toBe('postgresql');
    expect(result.response.data.text).toContain('42 total');
  });

  it('reports showing count separately from total directory count', async () => {
    vi.spyOn(hrmsDataService, 'searchEmployees').mockResolvedValue({ total: 42, limit: 10, offset: 0, hasMore: true,
      employees: Array.from({ length: 10 }, (_, index) => ({ employee_id: `EMP-${index + 1}` })) });
    const result = await invoke({ intent: 'GET_EMPLOYEE_LIST', entities: {}, page: 1, pageSize: 10 });
    expect(result.response.data.text).toBe('Showing 10 of 42 authorized employees.');
    expect(result.response.data.payload.pagination.total).toBe(42);
    expect(result.response.data.payload.pagination.hasMore).toBe(true);
  });

  it('does not fabricate a result when PostgreSQL is unavailable', async () => {
    vi.spyOn(hrmsDataService, 'getEmployeeCounts').mockRejectedValue(new Error('connection unavailable'));
    const result = await invoke({ intent: 'GET_EMPLOYEE_COUNT', entities: {}, page: 1, pageSize: 10 });
    expect(result.status).toBe(503);
    expect(result.response.error.message).toBe("I couldn't verify this information from the HRMS database.");
  });

  it('keeps employee payroll queries scoped to the authenticated employee', async () => {
    const payroll = vi.spyOn(hrmsDataService, 'getPayrollSummary').mockResolvedValue([]);
    const result = await invoke({ intent: 'GET_PAYROLL', entities: { employeeId: 'EMP-999' }, page: 1, pageSize: 10 },
      { id: 'u1', employeeId: 'EMP-001', company_id: 'company-a', role: 'Employee' });
    expect(result.status).toBe(200);
    expect(payroll).toHaveBeenCalledWith(expect.objectContaining({ level: 'own', employeeId: 'EMP-001' }));
  });
});
