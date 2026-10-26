import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('backend/.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'Axz5RVjrkQCPmcj1gK8ki09z9mRqgMRD4U7n/c4V9jgIUV5m4PZTR7UkD6FYLYhP';
const API_URL = 'http://localhost:8000/api/v1/whatsapp';

// Sign an admin token
const testUser = {
  id: 'system-super-admin',
  userId: 'system-super-admin',
  employeeId: 'EMP-000',
  email: 'developer@businz.com',
  role: 'Super Admin',
  company_id: 'company-a',
  companyId: 'company-a',
  assignedBranch: 'HQ'
};

const token = jwt.sign(testUser, JWT_SECRET, { expiresIn: '1h' });

async function runTests() {
  console.log('--- BUSINZ HRMS WHATSAPP VALIDATION TEST SUITE ---\n');
  let passed = 0;
  let total = 0;

  async function testCase(name, body, expectedStatus, expectedSnippet) {
    total++;
    try {
      const res = await fetch(`${API_URL}/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      const isStatusMatch = res.status === expectedStatus;
      const responseStr = JSON.stringify(data);
      const isSnippetMatch = expectedSnippet ? responseStr.includes(expectedSnippet) : true;

      if (isStatusMatch && isSnippetMatch) {
        console.log(`✅ [PASS] ${name}`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${name}`);
        console.error(`   Status: expected ${expectedStatus}, got ${res.status}`);
        console.error(`   Body: ${responseStr}`);
      }
    } catch (e) {
      console.error(`❌ [ERROR] ${name}: ${e.message}`);
    }
  }

  // 1. Enter "abc" into Phone Number ID -> Rejected
  await testCase(
    'Test 1: Non-numeric Phone Number ID ("abc") rejected',
    {
      phoneNumberId: 'abc',
      wabaId: '782910485729102',
      accessToken: 'EAAG9ZCK1k3k8BO...',
      webhookSecret: 'businz_wa_secret_123'
    },
    400,
    'WhatsApp Phone Number ID must contain only digits (0–9)'
  );

  // 2. Alphabetic Phone Number ID with mixed chars ("vjhjh") -> Rejected
  await testCase(
    'Test 2: Alphabetic Phone Number ID ("vjhjh") rejected',
    {
      phoneNumberId: 'vjhjh',
      wabaId: '782910485729102',
      accessToken: 'EAAG9ZCK1k3k8BO...',
      webhookSecret: 'businz_wa_secret_123'
    },
    400,
    'WhatsApp Phone Number ID must contain only digits (0–9)'
  );

  // 3. Enter "abc123" into WABA ID -> Rejected
  await testCase(
    'Test 3: Alphanumeric WABA ID ("abc123") rejected',
    {
      phoneNumberId: '109823485729104',
      wabaId: 'abc123',
      accessToken: 'EAAG9ZCK1k3k8BO...',
      webhookSecret: 'businz_wa_secret_123'
    },
    400,
    'WhatsApp Business Account ID (WABA ID) must contain only digits (0–9)'
  );

  // 4. Alphabetic WABA ID ("nbmbm") -> Rejected
  await testCase(
    'Test 4: Alphabetic WABA ID ("nbmbm") rejected',
    {
      phoneNumberId: '109823485729104',
      wabaId: 'nbmbm',
      accessToken: 'EAAG9ZCK1k3k8BO...',
      webhookSecret: 'businz_wa_secret_123'
    },
    400,
    'WhatsApp Business Account ID (WABA ID) must contain only digits (0–9)'
  );

  // 5. Empty Access Token -> Validation error
  await testCase(
    'Test 5: Empty Access Token rejected',
    {
      phoneNumberId: '109823485729104',
      wabaId: '782910485729102',
      accessToken: '',
      webhookSecret: 'businz_wa_secret_123'
    },
    400,
    'Permanent Access Token is required'
  );

  // 6. Empty Webhook Verification Token -> Validation error
  await testCase(
    'Test 6: Empty Webhook Verification Token rejected',
    {
      phoneNumberId: '109823485729104',
      wabaId: '782910485729102',
      accessToken: 'EAAG9ZCK1k3k8BO...',
      webhookSecret: ''
    },
    400,
    'Webhook Verification Token is required'
  );

  // 7. Valid numeric format with dummy Meta credentials -> Passes format validation, fails Meta Graph API handshake with clear error
  await testCase(
    'Test 7: Valid numeric format accepted by format check, handshake fails with Meta API reason',
    {
      phoneNumberId: '123456789012345',
      wabaId: '782910485729102',
      accessToken: 'EAAG_dummy_invalid_token_12345',
      webhookSecret: 'businz_wa_token_sec'
    },
    400,
    'HANDSHAKE_FAILED'
  );

  // 8. POST /config rejects non-numeric Phone ID
  total++;
  try {
    const res = await fetch(`${API_URL}/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        phoneNumberId: 'vjhjh',
        wabaId: '782910485729102',
        accessToken: 'EAAG123',
        webhookSecret: 'sec'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 400 && JSON.stringify(data).includes('WhatsApp Phone Number ID must contain only digits')) {
      console.log('✅ [PASS] Test 8: POST /config rejects invalid Phone Number ID ("vjhjh")');
      passed++;
    } else {
      console.error('❌ [FAIL] Test 8: POST /config should reject "vjhjh"');
    }
  } catch (e) {
    console.error('❌ [ERROR] Test 8:', e.message);
  }

  // 9. POST /config rejects non-numeric WABA ID
  total++;
  try {
    const res = await fetch(`${API_URL}/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        phoneNumberId: '109823485729104',
        wabaId: 'nbmbm',
        accessToken: 'EAAG123',
        webhookSecret: 'sec'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 400 && JSON.stringify(data).includes('must contain only digits')) {
      console.log('✅ [PASS] Test 9: POST /config rejects invalid WABA ID ("nbmbm")');
      passed++;
    } else {
      console.error('❌ [FAIL] Test 9: POST /config should reject "nbmbm"');
      console.error('   Status:', res.status, 'Body:', JSON.stringify(data));
    }
  } catch (e) {
    console.error('❌ [ERROR] Test 9:', e.message);
  }

  // 10. GET /config security check: Access token is NEVER returned
  total++;
  try {
    const res = await fetch(`${API_URL}/config`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 && data.success && data.data && !('accessToken' in data.data)) {
      console.log('✅ [PASS] Test 10: GET /config never exposes accessToken to client');
      passed++;
    } else {
      console.error('❌ [FAIL] Test 10: GET /config exposed token or failed');
    }
  } catch (e) {
    console.error('❌ [ERROR] Test 10:', e.message);
  }

  console.log(`\nResults: ${passed}/${total} tests passed.`);
}

runTests();
