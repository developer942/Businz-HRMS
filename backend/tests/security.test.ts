import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

const BASE_URL = 'http://localhost:8000';

describe('VRM Enterprise HRMS — Security Hardening & Vulnerability Test Suite', () => {
  // --------------------------------------------------------------------------
  // 1. Unauthenticated Request Blocking (VULN-01 Remediation)
  // --------------------------------------------------------------------------
  it('rejects unauthenticated requests to protected endpoints with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/employees`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('HRMS_UNAUTHENTICATED');
  });

  it('rejects protected payroll endpoints when no token is provided', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/payroll/settings`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('HRMS_UNAUTHENTICATED');
  });

  // --------------------------------------------------------------------------
  // 2. Token Integrity & Forgery Protection
  // --------------------------------------------------------------------------
  it('rejects requests with forged/invalid JWT tokens with 401 Unauthorized', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/employees`, {
      headers: {
        Authorization: 'Bearer invalid.forged.jwt.signature',
      },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('HRMS_TOKEN_INVALID');
  });

  it('accepts requests with authentically signed JWT tokens', async () => {
    // Generate authentic token
    const token = jwt.sign(
      {
        id: 'usr-001',
        email: 'hr@vrmstructures.com',
        role: 'HR Manager',
        employeeId: 'EMP-001',
        name: 'Pavithra',
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('HR Manager');
  });

  // --------------------------------------------------------------------------
  // 3. Authentication & Backdoor Removal (VULN-02 Remediation)
  // --------------------------------------------------------------------------
  it('rejects login with incorrect password', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hr@vrmstructures.com',
        password: 'DefectiveWrongPassword999',
      }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects login for non-existent users', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'attacker@evil-external-domain.com',
        password: 'Password@123',
      }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('authenticates valid users with proper hashed credentials', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pavithra@gmail.com',
        password: 'Password@123',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.user.role).toBe('HR Manager');
  });

  // --------------------------------------------------------------------------
  // 4. Role-Based Access Control (RBAC) Enforcement (VULN-08 Remediation)
  // --------------------------------------------------------------------------
  it('blocks Employee role from performing administrative actions', async () => {
    // Generate token with Employee role
    const employeeToken = jwt.sign(
      {
        id: 'usr-004',
        email: 'field@vrmstructures.com',
        role: 'Employee',
        employeeId: 'EMP-004',
        name: 'Karthik Rajan',
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Attempt to create an employee as standard Employee
    const res = await fetch(`${BASE_URL}/api/v1/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        firstName: 'Malicious',
        email: 'malicious@test.com',
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('HRMS_FORBIDDEN');
  });

  it('blocks Employee role from modifying field tracking assignments', async () => {
    const employeeToken = jwt.sign(
      {
        id: 'usr-004',
        email: 'field@vrmstructures.com',
        role: 'Employee',
        employeeId: 'EMP-004',
        name: 'Karthik Rajan',
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await fetch(`${BASE_URL}/api/v1/tracking/assignments/assign-001`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        status: 'Cancelled',
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('HRMS_FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // 5. Security Headers (Helmet) & Tech Stack Concealment
  // --------------------------------------------------------------------------
  it('hides X-Powered-By header and sets standard security headers', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);

    // X-Powered-By should be stripped by Helmet
    expect(res.headers.get('x-powered-by')).toBeNull();

    // Security headers should be present
    const xContentType = res.headers.get('x-content-type-options');
    expect(xContentType).toBe('nosniff');
  });
});
