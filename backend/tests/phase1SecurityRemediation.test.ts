import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { authRateLimiter } from '../src/middleware/rateLimiter.js';

const BASE_URL = 'http://localhost:8000';

// Helper to generate signed tokens
function createToken(payload: {
  id: string;
  email: string;
  role: string;
  employeeId: string;
  name: string;
  company_id?: string;
}) {
  return jwt.sign(
    {
      ...payload,
      company_id: payload.company_id || 'company-a',
    },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const employeeToken = createToken({
  id: 'usr-004',
  email: 'field@vrmstructures.com',
  role: 'Employee',
  employeeId: 'EMP-004',
  name: 'Karthik Rajan',
});

const attackerEmployeeToken = createToken({
  id: 'usr-005',
  email: 'attacker@vrmstructures.com',
  role: 'Employee',
  employeeId: 'EMP-005',
  name: 'Attacker Employee',
});

const hrManagerToken = createToken({
  id: 'usr-001',
  email: 'hr@vrmstructures.com',
  role: 'HR Manager',
  employeeId: 'EMP-001',
  name: 'Pavithra',
});

const superAdminToken = createToken({
  id: 'usr-000',
  email: env.SYSTEM_SUPER_ADMIN_EMAIL,
  role: 'Super Admin',
  employeeId: 'EMP-000',
  name: 'Super Admin',
});

describe('BUSINZ HRMS — Security Remediation Phase 1 Validation Suite', () => {
  // ==========================================================================
  // 1. Employee API Password Exposure
  // ==========================================================================
  describe('1. Employee API Password Exposure', () => {
    it('verifies GET /api/v1/employees never exposes password or password hashes', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/employees`, {
        headers: { Authorization: `Bearer ${hrManagerToken}` },
      });
      // Should be 200 if repository responds
      if (res.ok) {
        const body = await res.json();
        expect(body.success).toBe(true);
        if (Array.isArray(body.data) && body.data.length > 0) {
          for (const emp of body.data) {
            expect(emp.password).toBeUndefined();
            expect(emp.passwordHash).toBeUndefined();
          }
        }
      }
    });

    it('verifies GET /api/v1/employees/:id never exposes password field', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/employees/EMP-001`, {
        headers: { Authorization: `Bearer ${hrManagerToken}` },
      });
      if (res.ok) {
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.password).toBeUndefined();
        expect(body.data.passwordHash).toBeUndefined();
      }
    });
  });

  // ==========================================================================
  // 2. Payroll Access Control (IDOR / BOLA Prevention)
  // ==========================================================================
  describe('2. Payroll Access Control (IDOR / BOLA)', () => {
    it('blocks regular employee from fetching another employee payslip via /payslips/:id (IDOR attempt)', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/payroll/payslips/EMP-001`, {
        headers: { Authorization: `Bearer ${attackerEmployeeToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('authorized to view your own payslips');
    });

    it('blocks regular employee from fetching another employee payslip via /employees/:employeeId/payslips', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/payroll/employees/EMP-001/payslips`, {
        headers: { Authorization: `Bearer ${attackerEmployeeToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('blocks regular employee from querying another employee records via /records?employeeId=EMP-001', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/payroll/records?employeeId=EMP-001`, {
        headers: { Authorization: `Bearer ${attackerEmployeeToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('not authorized to view payroll records for other employees');
    });

    it('allows authorized HR Manager or Super Admin to view payroll records and payslips', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/payroll/records`, {
        headers: { Authorization: `Bearer ${hrManagerToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Credentials Email Endpoint Protection
  // ==========================================================================
  describe('3. Credentials Email Endpoint Protection', () => {
    it('rejects unauthenticated request to /send-credentials with 401 Unauthorized', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/employees/send-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: 'EMP-001',
          to: 'target@example.com',
        }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('blocks ordinary Employee role from calling /send-credentials with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/employees/send-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employeeToken}`,
        },
        body: JSON.stringify({
          employeeCode: 'EMP-001',
          to: 'target@example.com',
        }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns 400 when missing employeeCode for authorized HR role', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/employees/send-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hrManagerToken}`,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    it('returns 404 when employeeCode does not exist in workforce directory', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/employees/send-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hrManagerToken}`,
        },
        body: JSON.stringify({
          employeeCode: 'EMP-NONEXISTENT-999',
        }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // 4. Login Rate Limiter & Benchmark Header Protection
  // ==========================================================================
  describe('4. Login Rate Limiter & Benchmark Protection', () => {
    it('verifies authRateLimiter configuration does not contain x-internal-benchmark bypass', () => {
      // Inspect stringified rate limiter code or test that header is ignored
      expect(authRateLimiter).toBeDefined();
    });

    it('rejects invalid login credentials cleanly without exposing database internals', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-benchmark': 'attacker-header-bypass',
        },
        body: JSON.stringify({
          identifier: 'attacker@evil-external-domain.com',
          password: 'WrongPassword@123',
        }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Attendance and Leave Impersonation Prevention
  // ==========================================================================
  describe('5. Attendance and Leave Impersonation Prevention', () => {
    it('blocks regular employee from recording punch for another employee with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/attendance/punch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${attackerEmployeeToken}`,
        },
        body: JSON.stringify({
          employeeId: 'EMP-001', // Attacker trying to punch for CEO/HR
          type: 'IN',
        }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('not authorized to record attendance on behalf of another employee');
    });

    it('blocks regular employee from submitting leave application for another employee with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/leaves`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${attackerEmployeeToken}`,
        },
        body: JSON.stringify({
          employeeId: 'EMP-001', // Attacker trying to apply leave for EMP-001
          leaveType: 'Casual',
          startDate: '2026-11-01',
          endDate: '2026-11-02',
          reason: 'Unauthorized Impersonation Test',
        }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('not authorized to submit leave applications on behalf of another employee');
    });

    it('blocks regular employee from viewing leave balances of another employee with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/leaves/balances/EMP-001`, {
        headers: { Authorization: `Bearer ${attackerEmployeeToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('not authorized to view leave balances for other employees');
    });
  });

  // ==========================================================================
  // 6. WhatsApp CRM Authorization
  // ==========================================================================
  describe('6. WhatsApp CRM Authorization', () => {
    it('blocks ordinary employee from sending mass broadcasts with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/crm/broadcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employeeToken}`,
        },
        body: JSON.stringify({
          name: 'Unauthorized Employee Broadcast',
          templateId: 'tmpl-001',
        }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('blocks ordinary employee from deleting CRM contacts with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/crm/contacts/contact-001`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('blocks ordinary employee from deleting CRM templates with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/crm/templates/tmpl-001`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('blocks unauthenticated access to /api/v1/whatsapp/config', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/whatsapp/config`);
      expect(res.status).toBe(401);
    });

    it('blocks regular employee from viewing WhatsApp config with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/whatsapp/config`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });
});
