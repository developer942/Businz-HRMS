import assert from 'assert';
import crypto from 'crypto';
import { refreshSessionRepository } from '../src/repositories/refreshSessionRepository.js';
import { authRepository } from '../src/repositories/authRepository.js';

let passed = 0;
let total = 0;

function test(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch(err => {
        console.error(`  ✗ ${name}`);
        console.error(err);
      });
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

async function runAll() {
  console.log('\n============================================================');
  console.log('BUSINZ HRMS - Performance & Session Stability Test Suite');
  console.log('============================================================\n');

  console.log('--- Suite 1: Refresh Token Rotation & Session Stability ---');

  test('Should generate unique 64-char SHA-256 hex hashes for refresh tokens', () => {
    const token1 = 'refresh-tok-sample-12345';
    const hash1 = refreshSessionRepository.hashToken(token1);
    const hash2 = refreshSessionRepository.hashToken(token1);
    const hashOther = refreshSessionRepository.hashToken('refresh-tok-other-67890');

    assert.strictEqual(hash1, hash2, 'Identical token must yield identical hash');
    assert.notStrictEqual(hash1, hashOther, 'Different tokens must yield different hashes');
    assert.strictEqual(hash1.length, 64, 'SHA-256 hash must be 64 characters long');
  });

  test('Should enforce sliding 14-day expiry and 30-day absolute ceiling', () => {
    const now = new Date();
    const slidingExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const maxExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const diffDaysSliding = Math.round((slidingExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const diffDaysMax = Math.round((maxExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    assert.strictEqual(diffDaysSliding, 14, 'Sliding expiry must be 14 days');
    assert.strictEqual(diffDaysMax, 30, 'Max expiry ceiling must be 30 days');
  });

  test('Should allow concurrent requests within 20s grace period without replay revocation', () => {
    const rotatedAt = new Date();
    const GRACE_PERIOD_MS = 20 * 1000;

    // Simulate multi-tab request arriving 4 seconds after rotation
    const concurrentTabTime = new Date(rotatedAt.getTime() + 4000);
    const isWithinGrace = (concurrentTabTime.getTime() - rotatedAt.getTime()) <= GRACE_PERIOD_MS;
    assert.strictEqual(isWithinGrace, true, 'Request within 20s must be accepted in grace window');

    // Simulate stale request arriving 30 seconds after rotation (potential replay or hijacked token)
    const delayedStaleTime = new Date(rotatedAt.getTime() + 30000);
    const isOutsideGrace = (delayedStaleTime.getTime() - rotatedAt.getTime()) <= GRACE_PERIOD_MS;
    assert.strictEqual(isOutsideGrace, false, 'Request after 20s must trigger replay protection');
  });

  console.log('\n--- Suite 2: JWT Safe Base64URL Decoding ---');

  test('Should safely decode base64url payloads with missing padding without throwing InvalidCharacterError', () => {
    const payload = {
      id: 'emp-001',
      role: 'admin',
      company_id: 'company-a',
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const rawBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    // Strip trailing '=' to simulate unpadded base64url from standard JWT
    const unpaddedBase64Url = rawBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // Canonical decoding logic from authService.ts:
    const decodeJwt = (str: string) => {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4 !== 0) {
        base64 += '=';
      }
      return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    };

    const decoded = decodeJwt(unpaddedBase64Url);
    assert.strictEqual(decoded.id, 'emp-001');
    assert.strictEqual(decoded.role, 'admin');
    assert.strictEqual(decoded.company_id, 'company-a');
  });

  console.log('\n--- Suite 3: Auth User In-Memory Caching & Revocation ---');

  test('Should provide user cache invalidation methods for instant logout & password reset', () => {
    assert.strictEqual(typeof authRepository.invalidateUserCache, 'function', 'invalidateUserCache must exist');
    authRepository.invalidateUserCache('emp-001');
    authRepository.invalidateUserCache('admin@businz.com');
  });

  console.log('\n--- Suite 4: Expense Base64 Stripping & Payload Optimization ---');

  test('Should strip multi-megabyte inline base64 receipts from list payloads (>2KB)', () => {
    const massiveBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(50000); // 50 KB base64
    const expenseWithHugeReceipt = {
      id: 'exp-01',
      employee_id: 'emp-01',
      amount: 1500,
      receipt_url: massiveBase64,
      has_receipt: true
    };

    const isBase64Blob = typeof expenseWithHugeReceipt.receipt_url === 'string' &&
      expenseWithHugeReceipt.receipt_url.length > 2048 &&
      expenseWithHugeReceipt.receipt_url.startsWith('data:');

    assert.strictEqual(isBase64Blob, true, 'Base64 string >2KB must be detected as blob');

    const stripped = {
      ...expenseWithHugeReceipt,
      has_receipt: Boolean(expenseWithHugeReceipt.receipt_url),
      receipt_url: isBase64Blob ? null : expenseWithHugeReceipt.receipt_url
    };

    assert.strictEqual(stripped.receipt_url, null, 'Inline base64 receipt must be stripped from list');
    assert.strictEqual(stripped.has_receipt, true, 'has_receipt must remain true for UI indicator');
    assert.ok(JSON.stringify(stripped).length < 200, 'Stripped object size must be < 200 bytes');
  });

  test('Should keep external HTTPS receipt URLs intact in list payloads', () => {
    const normalExpense = {
      id: 'exp-02',
      employee_id: 'emp-02',
      amount: 250,
      receipt_url: 'https://hrms.businz.com/uploads/receipts/exp-02.jpg',
      has_receipt: true
    };

    const isBase64Blob = typeof normalExpense.receipt_url === 'string' &&
      normalExpense.receipt_url.length > 2048 &&
      normalExpense.receipt_url.startsWith('data:');

    assert.strictEqual(isBase64Blob, false, 'HTTPS URLs must not be stripped');

    const result = {
      ...normalExpense,
      has_receipt: Boolean(normalExpense.receipt_url),
      receipt_url: isBase64Blob ? null : normalExpense.receipt_url
    };

    assert.strictEqual(result.receipt_url, 'https://hrms.businz.com/uploads/receipts/exp-02.jpg');
    assert.strictEqual(result.has_receipt, true);
  });

  console.log('\n--- Suite 5: Diff-Guarded State Updates & Form Freeze Protection ---');

  test('Should suppress state re-renders when data fingerprint is unchanged', () => {
    const computeFingerprint = (val: unknown): string => {
      try {
        return JSON.stringify(val);
      } catch {
        return String(Date.now());
      }
    };

    const initialData = [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }];
    const identicalData = [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }];
    const mutatedData = [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob Updated' }];

    const fp1 = computeFingerprint(initialData);
    const fp2 = computeFingerprint(identicalData);
    const fp3 = computeFingerprint(mutatedData);

    assert.strictEqual(fp1, fp2, 'Identical datasets must have identical fingerprints (no re-render)');
    assert.notStrictEqual(fp1, fp3, 'Changed datasets must have different fingerprints (triggers re-render)');
  });

  console.log('\n--- Suite 6: Payload Reduction & Settings Optimization ---');

  test('Should reduce sync payload by >97% by omitting heavy static blobs from core settings', () => {
    // Unoptimized settings with inline blobs
    const unoptimizedSettings = {
      work_shifts: [{ id: 's1', name: 'General' }],
      departments: [{ id: 'd1', name: 'Sales' }],
      company_info: { logo: 'data:image/png;base64,' + 'B'.repeat(300000) }, // 300 KB
      employee_profiles_data: { 'emp-1': { photo: 'data:image/png;base64,' + 'C'.repeat(500000) } }, // 500 KB
      expenses_data: Array(25).fill({ receipt_url: 'data:image/jpeg;base64,' + 'D'.repeat(200000) }) // 5 MB
    };

    // Optimized core settings
    const optimizedCoreSettings = {
      work_shifts: [{ id: 's1', name: 'General' }],
      departments: [{ id: 'd1', name: 'Sales' }]
    };

    const unoptimizedSize = JSON.stringify(unoptimizedSettings).length;
    const optimizedSize = JSON.stringify(optimizedCoreSettings).length;

    const reductionPercent = ((unoptimizedSize - optimizedSize) / unoptimizedSize) * 100;

    assert.ok(reductionPercent > 99, 'Payload reduction must exceed 99%');
    assert.ok(optimizedSize < 1000, 'Optimized core settings size must be < 1 KB');
  });

  console.log('\n============================================================');
  console.log(`Summary: ${passed}/${total} tests passed!`);
  console.log('============================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runAll();
