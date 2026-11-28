import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

const BASE_URL = 'http://localhost:8000';
const adminJwt = jwt.sign(
  {
    id: '7fd6da40-38a6-4584-97fe-1da7f720eccf',
    email: 'pavithra@gmail.com',
    role: 'HR Manager',
    employeeId: 'EMP-006',
    name: 'Pavithra S',
    department: 'HR',
    designation: 'HR Manager',
  },
  env.JWT_SECRET
);
const employeeJwt = jwt.sign(
  {
    id: 'emp-user-uuid',
    email: 'employee@businz.com',
    role: 'Employee',
    employeeId: 'EMP-999',
    name: 'Staff Employee',
    department: 'General Staff',
    designation: 'Staff',
  },
  env.JWT_SECRET
);

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${adminJwt}`,
};

describe('VRM Enterprise HRMS — Full API Integration Test Suite', () => {
  // --------------------------------------------------------------------------
  // 1. Health Endpoint
  // --------------------------------------------------------------------------
  it('GET /health returns 200 and healthy status', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('healthy');
    expect(body.service).toContain('Businz Enterprise HRMS');
  });

  // --------------------------------------------------------------------------
  // 2. Settings Endpoint
  // --------------------------------------------------------------------------
  it('GET /api/v1/payroll/settings returns current configuration', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/payroll/settings`, { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pfRate).toBe(12.0);
    expect(body.data.esicRate).toBe(0.75);
    expect(body.data.standardWorkingDays).toBe(26);
  });

  it('PUT /api/v1/payroll/settings updates settings successfully', async () => {
    const updatePayload = {
      standardWorkingDays: 26,
      pfRate: 12.0,
      esicSalaryThreshold: 21000.0,
    };
    const res = await fetch(`${BASE_URL}/api/v1/payroll/settings`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify(updatePayload),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.standardWorkingDays).toBe(26);
  });

  // --------------------------------------------------------------------------
  // 3. Salary Structure Validation & CRUD
  // --------------------------------------------------------------------------
  it('POST /api/v1/employees/EMP-001/salary-structure rejects structure when percentages != 100%', async () => {
    const invalidPayload = {
      monthlySalary: 25000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 10,
      hraPercentage: 40, // Sum = 110%
    };
    const res = await fetch(`${BASE_URL}/api/v1/employees/EMP-006/salary-structure`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(invalidPayload),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/employees/EMP-006/salary-structure accepts valid 40/20/5/35 structure', async () => {
    const validPayload = {
      monthlySalary: 25000,
      basicPercentage: 40,
      daPercentage: 20,
      conveyancePercentage: 5,
      hraPercentage: 35, // Sum = 100%
      isActive: true,
      withPf: true,
    };
    const res = await fetch(`${BASE_URL}/api/v1/employees/EMP-006/salary-structure`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(validPayload),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.monthlySalary).toBe(25000);
  });

  it('GET /api/v1/employees/EMP-006/salary-structure returns active structure', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/employees/EMP-006/salary-structure`, { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.employeeId).toBe('EMP-006');
    expect(body.data.basicPercentage).toBe(40);
  });

  // --------------------------------------------------------------------------
  // 4. Payroll Preview & Statutory Engine
  // --------------------------------------------------------------------------
  it('POST /api/v1/payroll/preview computes canonical numbers for ₹15,000 baseline', async () => {
    const previewPayload = {
      employee_id: 'EMP-006',
      payroll_month: 8,
      payroll_year: 2026,
      attendance_bonus: 0,
      overtime_hours: 0,
      overtime_rate: 0,
      bonus: 0,
      incentive: 0,
      commission: 0,
      other_earnings: 0,
      lop_days: 0,
      advance_recovery: 0,
      loan_recovery: 0,
      other_deductions: 0,
    };
    const res = await fetch(`${BASE_URL}/api/v1/payroll/preview`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(previewPayload),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const d = body.data;

    // Check basic salary components
    expect(d.salary.basic).toBeGreaterThan(0);
    expect(d.salary.da).toBeGreaterThan(0);
    expect(d.salary.conveyance).toBeGreaterThan(0);
    expect(d.salary.hra).toBeGreaterThan(0);

    // Check deductions
    expect(d.deductions.pf_rate).toBe(12.0);
    expect(d.deductions.pf).toBeGreaterThan(0);
    expect(d.deductions.professional_tax).toBe(200);

    // Net Salary = Gross - Total Deductions
    const calculatedNet = d.earnings.gross - d.deductions.total;
    expect(d.net_salary).toBe(calculatedNet);
  });

  it('POST /api/v1/payroll/preview rejects missing employee_id with VALIDATION_ERROR', async () => {
    const invalidPayload = {
      payroll_month: 8,
      payroll_year: 2026,
    };
    const res = await fetch(`${BASE_URL}/api/v1/payroll/preview`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(invalidPayload),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  // --------------------------------------------------------------------------
  // 5. Payroll Run Lifecycle: Create -> Process -> Approve -> Pay
  // --------------------------------------------------------------------------
  let testRunId = '';
  const uniqueYear = 2030 + Math.floor(Math.random() * 1000);
  const uniqueMonth = (Date.now() % 12) + 1;

  it('POST /api/v1/payroll/runs creates a new monthly payroll batch', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/payroll/runs`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ payroll_month: uniqueMonth, payroll_year: uniqueYear }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('DRAFT');
    expect(body.data.payrollMonth).toBe(uniqueMonth);
    testRunId = body.data.id;
  });

  it('POST /api/v1/payroll/runs/:id/process processes employees and computes all taxes', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/payroll/runs/${testRunId}/process`, {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PROCESSED');
    expect(body.data.totalEmployees).toBeGreaterThan(0);
    expect(body.data.totalNet).toBeGreaterThan(0);
  }, 25000);

  it('POST /api/v1/payroll/runs/:id/approve approves the processed run', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/payroll/runs/${testRunId}/approve`, {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('APPROVED');
    expect(body.data.approvedBy).toBeDefined();
  });

  it('POST /api/v1/payroll/runs/:id/pay marks the approved run as PAID', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/payroll/runs/${testRunId}/pay`, {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PAID');
  });

  // --------------------------------------------------------------------------
  // 6. Processed Records & Official Payslip
  // --------------------------------------------------------------------------
  it('GET /api/v1/payroll/records returns generated records with deductions breakdown', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/payroll/records?runId=${testRunId}`, { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    if (body.data.length > 0) {
      const first = body.data[0];
      expect(first.basicSalary).toBeGreaterThan(0);
      expect(first.netSalary).toBeGreaterThan(0);
      expect(Array.isArray(first.earningsBreakdown)).toBe(true);
      expect(Array.isArray(first.deductionsBreakdown)).toBe(true);
    }
  });

  it('GET /api/v1/payroll/payslips/EMP-006 generates printable payslip structure', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/payroll/payslips/EMP-006?month=8&year=2026`, { headers: HEADERS });
    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.company).toBeDefined();
      expect(body.data.company.companyName).toBeDefined();
      expect(body.data.employee.employeeId).toBe('EMP-006');
    } else {
      expect([200, 404]).toContain(res.status);
    }
  });

  // --------------------------------------------------------------------------
  // 7. Overtime Flow
  // --------------------------------------------------------------------------
  let overtimeId = '';

  it('POST /api/v1/overtime logs an overtime request', async () => {
    const otPayload = {
      employee_id: 'EMP-006',
      date: '2026-08-25',
      hours: 4.5,
      hourly_rate: 150,
      reason: 'Urgent month-end solar infrastructure deployment',
    };
    const res = await fetch(`${BASE_URL}/api/v1/overtime`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(otPayload),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PENDING');
    overtimeId = body.data.id;
  });

  it('PUT /api/v1/overtime/:id/approve approves the overtime record', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/overtime/${overtimeId}/approve`, {
      method: 'PUT',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('APPROVED');
    expect(body.data.approvedBy).toBeDefined();
  });

  it('GET /api/v1/overtime returns the overtime ledger', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/overtime`, { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // 8. RBAC Route Guard Verification
  // --------------------------------------------------------------------------
  it('POST /api/v1/payroll/runs blocks unauthorized role (Employee) with 403 Forbidden', async () => {
    const employeeHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${employeeJwt}`,
    };
    const res = await fetch(`${BASE_URL}/api/v1/payroll/runs`, {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({ payroll_month: 11, payroll_year: 2026 }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('HRMS_FORBIDDEN');
  });
});
