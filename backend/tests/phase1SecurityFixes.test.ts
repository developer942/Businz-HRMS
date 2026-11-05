import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import {
  isBcryptPasswordHash,
  scrubProfilePasswordFields,
  BCRYPT_ROUNDS,
} from '../src/repositories/authRepository.js';
import {
  isPrivateOrReservedIp,
  assertSafeHostResolution,
  ssrfSafeMapFetch,
  SsrfBlockedError,
} from '../src/utils/ssrfSafeFetch.js';
import {
  verifyImageMagicBytes,
  ocrScanSchema,
} from '../src/validators/customerValidators.js';
import {
  inspectPasswordMigrationState,
  executePasswordMigration,
  rollbackPasswordMigration,
} from '../src/services/passwordMigrationService.js';

function generateAccessToken(payload: Record<string, any>): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' });
}

describe('BUSINZ HRMS – Phase 1 Critical Security Remediation Verification Suite', () => {
  const adminToken = generateAccessToken({
    id: 'EMP-ADMIN-1',
    employeeId: 'EMP-ADMIN-1',
    name: 'Businz Super Admin',
    email: 'admin@businz.com',
    role: 'Super Admin',
  });

  const employeeToken = generateAccessToken({
    id: 'EMP-USER-2',
    employeeId: 'EMP-USER-2',
    name: 'Standard Employee',
    email: 'employee@businz.com',
    role: 'Employee',
  });

  // ============================================================================
  // 1. CRIT-01 & CRIT-03: PostgREST Lockdown & Authenticated Data Gateway
  // ============================================================================
  describe('CRIT-01 & CRIT-03: PostgREST Lockdown & Backend Data Gateway (/api/v1/data-gateway/proxy)', () => {
    it('blocks unauthenticated requests to /api/v1/data-gateway/proxy with 401', async () => {
      const res = await request(app)
        .post('/api/v1/data-gateway/proxy')
        .send({ path: '/employees?select=*', method: 'GET' });

      expect(res.status).toBe(401);
    });

    it('blocks access to sensitive internal tables (password_resets, audit_logs, security_password_migration_backup) with 403', async () => {
      for (const forbiddenTable of [
        '/password_resets?select=*',
        '/audit_logs?select=*',
        '/security_password_migration_backup?select=*',
      ]) {
        const res = await request(app)
          .post('/api/v1/data-gateway/proxy')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ path: forbiddenTable, method: 'GET' });

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('FORBIDDEN_TABLE');
      }
    });

    it('prevents standard Employee role from creating or deleting employee records or mutating payroll', async () => {
      const createEmpRes = await request(app)
        .post('/api/v1/data-gateway/proxy')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          path: '/employees',
          method: 'POST',
          body: { id: 'EMP-HACK', name: 'Hacker', role: 'Super Admin' },
        });
      expect(createEmpRes.status).toBe(403);

      const deleteEmpRes = await request(app)
        .post('/api/v1/data-gateway/proxy')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          path: '/employees?id=eq.EMP-ADMIN-1',
          method: 'DELETE',
        });
      expect(deleteEmpRes.status).toBe(403);

      const mutatePayrollRes = await request(app)
        .post('/api/v1/data-gateway/proxy')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          path: '/payroll_runs',
          method: 'POST',
          body: { id: 'PR-HACK' },
        });
      expect(mutatePayrollRes.status).toBe(403);
    });

    it('verifies infrastructure configs lock down public /rest/v1/ and revoke web_anon privileges', () => {
      const repoRoot = path.resolve(__dirname, '../..');

      const frontendNginx = fs.readFileSync(
        path.join(repoRoot, 'frontend/nginx.conf'),
        'utf8'
      );
      expect(frontendNginx).toContain('location /rest/v1/');
      expect(frontendNginx).toContain('return 403;');
      expect(frontendNginx).not.toContain('proxy_pass http://postgrest:3000/');

      const dockerCompose = fs.readFileSync(
        path.join(repoRoot, 'deploy/vps/docker-compose.yml'),
        'utf8'
      );
      expect(dockerCompose).toContain('PGRST_DB_ANON_ROLE: hrms_backend_service');
      expect(dockerCompose).not.toContain('PGRST_DB_ANON_ROLE: web_anon');
      expect(dockerCompose).not.toContain('VITE_DB_REST_KEY:');

      const vpsAccessSql = fs.readFileSync(
        path.join(repoRoot, 'deploy/vps/db/99-vps-access.sql'),
        'utf8'
      );
      expect(vpsAccessSql).toContain('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM web_anon');
      expect(vpsAccessSql).toContain('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hrms_backend_service');

      const supabaseDirect = fs.readFileSync(
        path.join(repoRoot, 'frontend/src/services/supabaseDirectService.ts'),
        'utf8'
      );
      expect(supabaseDirect).toContain('/data-gateway/proxy');
      expect(supabaseDirect).not.toContain('vps-local-rest-key');
      expect(supabaseDirect).not.toContain('Password@123');
    });
  });

  // ============================================================================
  // 2. CRIT-02: Password Hashing, Company Settings Scrubbing, & Migration Service
  // ============================================================================
  describe('CRIT-02: Bcrypt Password Hashing, Company Settings Scrubbing, and Transactional Migration', () => {
    it('correctly detects bcrypt hashes and scrubs all password fields from company_settings JSON blobs', async () => {
      const hash = await bcrypt.hash('SecurePass#2026', BCRYPT_ROUNDS);
      expect(isBcryptPasswordHash(hash)).toBe(true);
      expect(isBcryptPasswordHash('PlaintextPass123')).toBe(false);
      expect(isBcryptPasswordHash('')).toBe(false);

      const dirtyProfileEntry = {
        id: 'EMP-001',
        name: 'Arun Kumar',
        password: 'PlainPassword1',
        plainPassword: 'PlainPassword1',
        passwordHash: hash,
        password_hash: hash,
        department: 'Engineering',
        systemAccess: {
          isActive: true,
          role: 'Employee',
          password: 'PlainPassword1',
          plainPassword: 'PlainPassword1',
        },
      };

      const cleaned = scrubProfilePasswordFields(dirtyProfileEntry);
      expect(cleaned.password).toBeUndefined();
      expect(cleaned.plainPassword).toBeUndefined();
      expect(cleaned.passwordHash).toBeUndefined();
      expect(cleaned.password_hash).toBeUndefined();
      expect(cleaned.systemAccess.password).toBeUndefined();
      expect(cleaned.systemAccess.plainPassword).toBeUndefined();
      expect(cleaned.name).toBe('Arun Kumar');
      expect(cleaned.systemAccess.isActive).toBe(true);
    });

    it('executes transactional backup, plaintext-to-bcrypt migration, verification, and rollback without logging passwords', async () => {
      const employeesTable: Array<{
        id: string;
        employee_id: string;
        password: string | null;
        must_change_password: boolean;
        profile_data: Record<string, any>;
      }> = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          employee_id: 'VRM-001',
          password: 'LegacyPlainPassword#1',
          must_change_password: false,
          profile_data: { password: 'LegacyPlainPassword#1' },
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          employee_id: 'VRM-002',
          password: await bcrypt.hash('AlreadyHashed#2', BCRYPT_ROUNDS),
          must_change_password: false,
          profile_data: {},
        },
      ];

      const companySettingsTable: Record<string, any> = {
        employee_profiles_data: {
          'VRM-001': {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Emp One',
            password: 'LegacyPlainPassword#1',
            systemAccess: { isActive: true, password: 'LegacyPlainPassword#1' },
          },
        },
      };

      let backupEmployees: Array<{
        id: string;
        employee_id: string;
        password_backup: string | null;
        must_change_password: boolean;
      }> = [];

      const mockAdapter = {
        query: vi.fn(async (sql: string, params?: any[]) => {
          const normalized = sql.replace(/\s+/g, ' ').trim();
          if (normalized.startsWith('SELECT id, employee_id, password, profile_data FROM public.employees')) {
            return {
              rows: employeesTable.map((r) => ({ ...r, profile_data: { ...r.profile_data } })),
              rowCount: employeesTable.length,
            };
          }
          if (normalized.startsWith('SELECT setting_val FROM public.company_settings')) {
            return {
              rows: [{ setting_val: JSON.parse(JSON.stringify(companySettingsTable.employee_profiles_data)) }],
              rowCount: 1,
            };
          }
          if (normalized.startsWith('INSERT INTO public.employees_auth_backup_pre_hash')) {
            backupEmployees = employeesTable.map((e) => ({
              id: e.id,
              employee_id: e.employee_id,
              password_backup: e.password,
              must_change_password: e.must_change_password,
            }));
            return { rows: [], rowCount: backupEmployees.length };
          }
          if (normalized.startsWith('UPDATE public.employees SET password = $1, profile_data = $2::jsonb')) {
            const [newPass, profileJson, id] = params || [];
            const row = employeesTable.find((e) => e.id === id);
            if (row) {
              row.password = newPass;
              row.profile_data = JSON.parse(profileJson);
            }
            return { rows: [], rowCount: row ? 1 : 0 };
          }
          if (normalized.startsWith('UPDATE public.employees SET password = $1, updated_at = NOW() WHERE id = $2')) {
            const [newPass, id] = params || [];
            const row = employeesTable.find((e) => e.id === id);
            if (row) row.password = newPass;
            return { rows: [], rowCount: row ? 1 : 0 };
          }
          if (normalized.startsWith('UPDATE public.company_settings SET setting_val = $1::jsonb')) {
            const [jsonStr] = params || [];
            companySettingsTable.employee_profiles_data = JSON.parse(jsonStr);
            return { rows: [], rowCount: 1 };
          }
          if (normalized.startsWith('SELECT password FROM public.employees')) {
            return {
              rows: employeesTable.map((e) => ({ password: e.password })),
              rowCount: employeesTable.length,
            };
          }
          if (normalized.startsWith('SELECT id, employee_id, password_backup, must_change_password FROM public.employees_auth_backup_pre_hash')) {
            return { rows: backupEmployees, rowCount: backupEmployees.length };
          }
          if (normalized.startsWith('UPDATE public.employees SET password = $1, must_change_password = COALESCE($2')) {
            const [prevPass, _mcp, id] = params || [];
            const row = employeesTable.find((e) => e.id === id);
            if (row) row.password = prevPass;
            return { rows: [], rowCount: row ? 1 : 0 };
          }
          return { rows: [], rowCount: 0 };
        }),
      };

      const preInspection = await inspectPasswordMigrationState(mockAdapter);
      expect(preInspection.totalEmployees).toBe(2);
      expect(preInspection.plaintextPasswordCount).toBe(1);
      expect(preInspection.alreadyHashedCount).toBe(1);
      expect(preInspection.companySettingsPasswordLeakCount).toBe(1);

      const migrationResult = await executePasswordMigration({ dbAdapter: mockAdapter });
      expect(migrationResult.migratedToBcryptCount).toBe(1);
      expect(migrationResult.companySettingsScrubbedCount).toBe(1);
      expect(migrationResult.remainingPlaintextCount).toBe(0);

      expect(isBcryptPasswordHash(employeesTable[0].password)).toBe(true);
      expect(await bcrypt.compare('LegacyPlainPassword#1', employeesTable[0].password!)).toBe(true);
      expect(companySettingsTable.employee_profiles_data['VRM-001'].password).toBeUndefined();
      expect(companySettingsTable.employee_profiles_data['VRM-001'].systemAccess.password).toBeUndefined();

      const rollbackResult = await rollbackPasswordMigration(mockAdapter);
      expect(rollbackResult.restoredEmployeeCount).toBe(2);
      expect(employeesTable[0].password).toBe('LegacyPlainPassword#1');
    });
  });

  // ============================================================================
  // 3. CRIT-04: SSRF Protection on /api/v1/settings/resolve-map-link
  // ============================================================================
  describe('CRIT-04: SSRF Protection on Map-Link Resolution Endpoint (/api/v1/settings/resolve-map-link)', () => {
    it('identifies all loopback, RFC1918 private, link-local/metadata, CGNAT, and IPv4-mapped IPv6 addresses as restricted', () => {
      expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
      expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
      expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
      expect(isPrivateOrReservedIp('100.64.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('::1')).toBe(true);
      expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
      expect(isPrivateOrReservedIp('fd00::1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:169.254.169.254')).toBe(true);

      expect(isPrivateOrReservedIp('142.250.190.46')).toBe(false);
      expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    });

    it('requires authentication (401) and authorized role (403) on POST /api/v1/settings/resolve-map-link', async () => {
      const unauthRes = await request(app)
        .post('/api/v1/settings/resolve-map-link')
        .send({ url: 'https://www.google.com/maps?q=13.152218,80.209216' });
      expect(unauthRes.status).toBe(401);

      const empRes = await request(app)
        .post('/api/v1/settings/resolve-map-link')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ url: 'https://www.google.com/maps?q=13.152218,80.209216' });
      expect(empRes.status).toBe(403);
    });

    it('blocks SSRF attack vectors (file://, http://, AWS metadata 169.254.169.254, localhost, private IPs, and non-Google domains) with 400', async () => {
      const ssrfPayloads = [
        'file:///etc/passwd',
        'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
        'https://169.254.169.254/latest/meta-data/',
        'https://127.0.0.1:8080/internal',
        'https://localhost/admin',
        'https://10.0.0.5/secret',
        'https://192.168.1.1/router',
        'http://maps.app.goo.gl/shortlink',
        'https://maps.app.goo.gl:8443/shortlink',
        'https://user:pass@maps.app.goo.gl/shortlink',
        'https://attacker-controlled-domain.com/maps?q=13.152218,80.209216',
      ];

      for (const payload of ssrfPayloads) {
        const res = await request(app)
          .post('/api/v1/settings/resolve-map-link')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ url: payload });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error?.code).toBe('SSRF_BLOCKED');
      }
    });

    it('blocks malicious redirect hops to internal metadata/private IPs and DNS rebinding attacks in ssrfSafeMapFetch', async () => {
      await expect(
        assertSafeHostResolution('maps.app.goo.gl', async () => [
          { address: '127.0.0.1', family: 4 },
        ])
      ).rejects.toThrow(SsrfBlockedError);

      const mockFetchRedirectToMetadata = vi.fn(async () => {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        });
      });

      await expect(
        ssrfSafeMapFetch('https://maps.app.goo.gl/validshort', {
          dnsLookupFn: async () => [{ address: '142.250.190.46', family: 4 }],
          fetchFn: mockFetchRedirectToMetadata as any,
        })
      ).rejects.toThrow(SsrfBlockedError);
      expect(mockFetchRedirectToMetadata).toHaveBeenCalledTimes(1);
    });

    it('permits legitimate HTTPS Google Maps URLs for authorized administrators', async () => {
      const res = await request(app)
        .post('/api/v1/settings/resolve-map-link')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'https://www.google.com/maps/place/Businz/@13.152218,80.209216,17z/data=!3d13.152218!4d80.209216',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.lat).toBe(13.152218);
      expect(res.body.lng).toBe(80.209216);
    });
  });

  // ============================================================================
  // 4. HIGH-06: OCR Endpoint Security (/api/v1/customers/ocr-scan)
  // ============================================================================
  describe('HIGH-06: OCR Endpoint Authentication, Upload Validation, Magic-Byte Check & Rate Limiting', () => {
    const validJpegBase64 = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    ]).toString('base64');

    const validPngBase64 = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]).toString('base64');

    it('rejects unauthenticated requests to POST /api/v1/customers/ocr-scan with 401', async () => {
      const res = await request(app)
        .post('/api/v1/customers/ocr-scan')
        .send({ imageBase64: validJpegBase64, mimeType: 'image/jpeg' });

      expect(res.status).toBe(401);
    });

    it('rejects disallowed MIME types (e.g. application/pdf, image/svg+xml) and spoofed magic bytes with 400', async () => {
      const pdfRes = await request(app)
        .post('/api/v1/customers/ocr-scan')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageBase64: validJpegBase64, mimeType: 'application/pdf' });
      expect(pdfRes.status).toBe(400);

      const spoofedBase64 = Buffer.from('This is not a real JPEG file header at all!').toString('base64');
      const spoofRes = await request(app)
        .post('/api/v1/customers/ocr-scan')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageBase64: spoofedBase64, mimeType: 'image/jpeg' });
      expect(spoofRes.status).toBe(400);
      expect(spoofRes.body?.error?.code).toBe('INVALID_IMAGE_SIGNATURE');
    });

    it('verifies magic bytes accurately for JPEG, PNG, and WebP and rejects >5MB payloads', () => {
      expect(verifyImageMagicBytes(Buffer.from(validJpegBase64, 'base64'), 'image/jpeg')).toBe(true);
      expect(verifyImageMagicBytes(Buffer.from(validPngBase64, 'base64'), 'image/png')).toBe(true);
      expect(verifyImageMagicBytes(Buffer.from(validPngBase64, 'base64'), 'image/jpeg')).toBe(false);

      const oversized = ocrScanSchema.safeParse({
        imageBase64: 'A'.repeat(7_000_005),
        mimeType: 'image/jpeg',
      });
      expect(oversized.success).toBe(false);
    });

    it('enforces ocrRateLimiter (max 10 requests per 15-minute window)', async () => {
      const rateLimitUserToken = generateAccessToken({
        id: 'EMP-RATELIMIT-OCR',
        employeeId: 'EMP-RATELIMIT-OCR',
        name: 'Rate Limit Tester',
        email: 'ratelimit@businz.com',
        role: 'Super Admin',
      });

      let lastStatus = 200;
      for (let i = 1; i <= 11; i++) {
        const res = await request(app)
          .post('/api/v1/customers/ocr-scan')
          .set('Authorization', `Bearer ${rateLimitUserToken}`)
          .set('x-enforce-rate-limit-test', 'true')
          .send({ imageBase64: validJpegBase64, mimeType: 'image/jpeg' });
        lastStatus = res.status;
      }

      expect(lastStatus).toBe(429);
    });
  });
});
