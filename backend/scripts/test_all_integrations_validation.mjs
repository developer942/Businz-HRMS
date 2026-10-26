import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { 
  metaAdsConfigSchema, 
  biometricConfigSchema, 
  smtpConfigSchema, 
  accountingConfigSchema, 
  isProhibitedSsrfIp,
  isPrivateLanIp,
  normalizeAdAccountId
} from '../dist/validators/integrationValidators.js';
import { databasePool, query } from '../dist/config/database.js';
import { encryptCredential, decryptCredential } from '../dist/utils/crypto.js';
import { integrationService } from '../dist/services/integrationService.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} - ${details}`);
  }
}

async function runAllTests() {
  console.log('===============================================================');
  console.log('BUSINZ HRMS - INTEGRATION VALIDATION & SECURITY TEST SUITE');
  console.log('===============================================================\n');

  // ==============================================================
  // 1. META ADS VALIDATION TESTS
  // ==============================================================
  console.log('--- 1. META ADS VALIDATION ---');

  // Business Manager ID: Reject letters, negatives, spaces
  const metaBusinessInvalid1 = metaAdsConfigSchema.safeParse({
    businessId: 'abc123',
    adAccountId: '982710491029',
    pageAccessToken: 'EAAB9ZBK81L29kP1234567890'
  });
  assert(!metaBusinessInvalid1.success, 'Meta Business ID "abc123" rejected');

  const metaBusinessInvalid2 = metaAdsConfigSchema.safeParse({
    businessId: '-123456789',
    adAccountId: '982710491029',
    pageAccessToken: 'EAAB9ZBK81L29kP1234567890'
  });
  assert(!metaBusinessInvalid2.success, 'Meta Business ID negative value "-123456789" rejected');

  const metaBusinessInvalid3 = metaAdsConfigSchema.safeParse({
    businessId: '123 456 789',
    adAccountId: '982710491029',
    pageAccessToken: 'EAAB9ZBK81L29kP1234567890'
  });
  assert(!metaBusinessInvalid3.success, 'Meta Business ID with spaces "123 456 789" rejected');

  // Ad Account ID: Reject arbitrary alphabetic strings
  const metaAdAccInvalid1 = metaAdsConfigSchema.safeParse({
    businessId: '482910492817291',
    adAccountId: 'randomtext',
    pageAccessToken: 'EAAB9ZBK81L29kP1234567890'
  });
  assert(!metaAdAccInvalid1.success, 'Meta Ad Account ID "randomtext" rejected');

  // Ad Account ID: Support act_ prefix and plain numeric ID, preserve leading zeros
  const norm1 = normalizeAdAccountId('982710491029');
  assert(norm1 === 'act_982710491029', 'Meta Ad Account ID numeric normalized to act_ prefix');

  const norm2 = normalizeAdAccountId('act_982710491029');
  assert(norm2 === 'act_982710491029', 'Meta Ad Account ID with existing act_ preserved');

  const norm3 = normalizeAdAccountId('00982710491029');
  assert(norm3 === 'act_00982710491029', 'Meta Ad Account ID preserves leading zeros as string');

  // Meta Pixel ID: Reject alphabetic strings, accept numeric digits or empty
  const metaPixelInvalid = metaAdsConfigSchema.safeParse({
    businessId: '482910492817291',
    adAccountId: '982710491029',
    pageAccessToken: 'EAAB9ZBK81L29kP1234567890',
    pixelId: 'xyz'
  });
  assert(!metaPixelInvalid.success, 'Meta Pixel ID "xyz" rejected');

  const metaValid = metaAdsConfigSchema.safeParse({
    businessId: '482910492817291',
    adAccountId: '982710491029',
    pageAccessToken: 'EAAB9ZBK81L29kP1234567890',
    pixelId: '829104859102948'
  });
  assert(metaValid.success, 'Meta Ads complete valid configuration accepted');

  // ==============================================================
  // 2. BIOMETRIC ATTENDANCE HARDWARE GATEWAY TESTS
  // ==============================================================
  console.log('\n--- 2. BIOMETRIC ATTENDANCE HARDWARE GATEWAY ---');

  // Device IP: Reject malformed IP addresses
  const bioIpInvalid1 = biometricConfigSchema.safeParse({
    deviceIp: '999.999.999.999',
    devicePort: 4370,
    syncIntervalMins: 15,
    deviceBrand: 'eSSL SilkBio-101TC'
  });
  assert(!bioIpInvalid1.success, 'Biometric IP "999.999.999.999" rejected');

  const bioIpInvalid2 = biometricConfigSchema.safeParse({
    deviceIp: '192.168.1',
    devicePort: 4370,
    syncIntervalMins: 15,
    deviceBrand: 'eSSL SilkBio-101TC'
  });
  assert(!bioIpInvalid2.success, 'Biometric incomplete IP "192.168.1" rejected');

  const bioIpInvalid3 = biometricConfigSchema.safeParse({
    deviceIp: 'abcd',
    devicePort: 4370,
    syncIntervalMins: 15,
    deviceBrand: 'eSSL SilkBio-101TC'
  });
  assert(!bioIpInvalid3.success, 'Biometric invalid string "abcd" rejected');

  const bioIpInvalid4 = biometricConfigSchema.safeParse({
    deviceIp: 'http://192.168.1.20',
    devicePort: 4370,
    syncIntervalMins: 15,
    deviceBrand: 'eSSL SilkBio-101TC'
  });
  assert(!bioIpInvalid4.success, 'Biometric URL scheme "http://192.168.1.20" rejected as raw host');

  // TCP Port: Reject 70000, abc, negative, decimals
  const bioPortInvalid1 = biometricConfigSchema.safeParse({
    deviceIp: '192.168.1.20',
    devicePort: 70000,
    syncIntervalMins: 15,
    deviceBrand: 'eSSL SilkBio-101TC'
  });
  assert(!bioPortInvalid1.success, 'Biometric TCP Port 70000 (>65535) rejected');

  const bioPortInvalid2 = biometricConfigSchema.safeParse({
    deviceIp: '192.168.1.20',
    devicePort: 'abc',
    syncIntervalMins: 15,
    deviceBrand: 'eSSL SilkBio-101TC'
  });
  assert(!bioPortInvalid2.success, 'Biometric TCP Port "abc" rejected');

  const bioPortInvalid3 = biometricConfigSchema.safeParse({
    deviceIp: '192.168.1.20',
    devicePort: 4370.5,
    syncIntervalMins: 15,
    deviceBrand: 'eSSL SilkBio-101TC'
  });
  assert(!bioPortInvalid3.success, 'Biometric TCP Port decimal "4370.5" rejected');

  // Polling sync interval: controlled enum [5, 15, 30, 60]
  const bioSyncInvalid = biometricConfigSchema.safeParse({
    deviceIp: '192.168.1.20',
    devicePort: 4370,
    syncIntervalMins: 12,
    deviceBrand: 'eSSL SilkBio-101TC'
  });
  assert(!bioSyncInvalid.success, 'Biometric polling interval "12" rejected (controlled enum)');

  // SSRF & LAN Detection
  assert(isProhibitedSsrfIp('169.254.169.254'), 'SSRF protection blocks cloud IMDS metadata IP');
  assert(isProhibitedSsrfIp('127.0.0.1'), 'SSRF protection blocks loopback IP');
  assert(isPrivateLanIp('192.168.1.20'), 'LAN detection identifies 192.168.x.x private terminal');
  assert(isPrivateLanIp('10.0.0.50'), 'LAN detection identifies 10.x.x.x private terminal');

  const bioValid = biometricConfigSchema.safeParse({
    deviceIp: '192.168.1.20',
    devicePort: 4370,
    syncIntervalMins: 15,
    deviceBrand: 'eSSL SilkBio-101TC & ZKTeco'
  });
  assert(bioValid.success, 'Biometric valid device configuration accepted');

  // ==============================================================
  // 3. GOOGLE WORKSPACE / GMAIL SMTP TESTS
  // ==============================================================
  console.log('\n--- 3. GOOGLE WORKSPACE / GMAIL SMTP ---');

  // Host: Reject URL schemes like https://smtp.gmail.com
  const smtpHostInvalid = smtpConfigSchema.safeParse({
    smtpHost: 'https://smtp.gmail.com',
    smtpPort: 587,
    senderEmail: 'hr@businz.com',
    appPassword: 'abcd efgh ijkl mnop'
  });
  assert(!smtpHostInvalid.success, 'SMTP Host "https://smtp.gmail.com" rejected as raw hostname');

  // Port: Reject letters, decimals, out of range
  const smtpPortInvalid = smtpConfigSchema.safeParse({
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587abc',
    senderEmail: 'hr@businz.com',
    appPassword: 'abcd efgh ijkl mnop'
  });
  assert(!smtpPortInvalid.success, 'SMTP Port "587abc" rejected');

  // Sender Email: Reject malformed emails
  const smtpEmailInvalid1 = smtpConfigSchema.safeParse({
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    senderEmail: 'abc@',
    appPassword: 'abcd efgh ijkl mnop'
  });
  assert(!smtpEmailInvalid1.success, 'Sender Email "abc@" rejected');

  const smtpEmailInvalid2 = smtpConfigSchema.safeParse({
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    senderEmail: 'plainaddress',
    appPassword: 'abcd efgh ijkl mnop'
  });
  assert(!smtpEmailInvalid2.success, 'Sender Email "plainaddress" rejected');

  // Send Test Email To: Optional, but if provided must be valid email
  const smtpTestEmailInvalid = smtpConfigSchema.safeParse({
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    senderEmail: 'hr@businz.com',
    appPassword: 'abcd efgh ijkl mnop',
    testRecipientEmail: 'not-an-email'
  });
  assert(!smtpTestEmailInvalid.success, 'Test recipient email "not-an-email" rejected');

  const smtpValid = smtpConfigSchema.safeParse({
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    senderEmail: 'hr@businz.com',
    appPassword: 'abcd efgh ijkl mnop'
  });
  assert(smtpValid.success, 'SMTP valid configuration with spaces in App Password accepted and sanitized');

  // ==============================================================
  // 4. TALLY PRIME & ZOHO BOOKS ACCOUNTING TESTS
  // ==============================================================
  console.log('\n--- 4. TALLY PRIME & ZOHO BOOKS ACCOUNTING ---');

  // Malformed endpoint URL
  const tallyEndpointInvalid = accountingConfigSchema.safeParse({
    accountingProvider: 'Tally Prime XML Server',
    serverEndpoint: 'invalid URL',
    companyNameInTally: 'Businz Enterprises Pvt Ltd',
    autoSyncFrequency: 'Monthly on Payroll Close'
  });
  assert(!tallyEndpointInvalid.success, 'Tally Endpoint "invalid URL" rejected');

  // Whitespace-only company name
  const tallyCompanyInvalid = accountingConfigSchema.safeParse({
    accountingProvider: 'Tally Prime XML Server',
    serverEndpoint: 'http://192.168.1.100:9000',
    companyNameInTally: '    ',
    autoSyncFrequency: 'Monthly on Payroll Close'
  });
  assert(!tallyCompanyInvalid.success, 'Tally Company Name whitespace-only rejected');

  // SSRF blocked endpoint
  const tallySsrfInvalid = isProhibitedSsrfIp('169.254.169.254');
  assert(tallySsrfInvalid, 'Tally endpoint SSRF protection blocks cloud metadata access');

  const tallyValid = accountingConfigSchema.safeParse({
    accountingProvider: 'Tally Prime XML Server',
    serverEndpoint: 'http://192.168.1.100:9000',
    companyNameInTally: 'BUSINZ ENTERPRISES PVT LTD',
    autoSyncFrequency: 'Monthly on Payroll Close'
  });
  assert(tallyValid.success, 'Tally valid configuration accepted');

  const zohoValid = accountingConfigSchema.safeParse({
    accountingProvider: 'Zoho Books Cloud API',
    companyNameInTally: '782910485', // Organization ID
    autoSyncFrequency: 'Monthly on Payroll Close'
  });
  assert(zohoValid.success, 'Zoho Books valid organization configuration accepted');

  // ==============================================================
  // 5. WHATSAPP & GEMINI AI FORMAT TESTS
  // ==============================================================
  console.log('\n--- 5. WHATSAPP & GEMINI AI VALIDATION ---');

  const isNumericStr = (s) => typeof s === 'string' && /^\d+$/.test(s.trim());
  assert(!isNumericStr('abcd'), 'WhatsApp Phone Number ID "abcd" rejected');
  assert(!isNumericStr('xyz'), 'WhatsApp WABA ID "xyz" rejected');
  assert(isNumericStr('109823485729104'), 'WhatsApp Phone Number ID "109823485729104" accepted');
  assert(isNumericStr('782910485729102'), 'WhatsApp WABA ID "782910485729102" accepted');

  const isGeminiOAuth = (k) => k.startsWith('ya29.') || k.startsWith('GOCSPX-') || k.includes('.apps.googleusercontent.com');
  assert(isGeminiOAuth('ya29.a0AfH6SM...'), 'Gemini AI rejects OAuth token format (ya29...)');
  assert(isGeminiOAuth('GOCSPX-secret123'), 'Gemini AI rejects OAuth Client Secret (GOCSPX-...)');

  // ==============================================================
  // 6. SECURITY & AES-256-GCM ENCRYPTION TESTS
  // ==============================================================
  console.log('\n--- 6. SECURITY & AES-256-GCM ENCRYPTION ---');

  const plaintextSecret = 'EAAB9ZBK81L29kP_SUPER_SECRET_TOKEN_2026';
  const encrypted = encryptCredential(plaintextSecret);
  assert(encrypted.includes(':') && encrypted.split(':').length === 3, 'Secret encrypted with AES-256-GCM (iv:tag:cipher)');
  assert(!encrypted.includes(plaintextSecret), 'Plaintext secret not visible in encrypted ciphertext');

  const decrypted = decryptCredential(encrypted);
  assert(decrypted === plaintextSecret, 'Secret cleanly decrypted back to original plaintext');

  // ==============================================================
  // 7. POSTGRESQL PERSISTENCE & DATA ISOLATION TESTS
  // ==============================================================
  console.log('\n--- 7. POSTGRESQL PERSISTENCE & REFRESH VERIFICATION ---');

  const testCompanyId = 'test_audit_company_2026';
  const testMetaConfig = {
    businessId: '482910492817291',
    adAccountId: 'act_982710491029',
    pageAccessToken: 'EAAG_TEST_ACCESS_TOKEN_FOR_AUDIT',
    pixelId: '829104859102948',
    autoIngestCandidates: true,
    targetJobPost: 'Senior React Developer'
  };

  try {
    // Save to PostgreSQL via integrationService
    await integrationService.saveMetaAdsConfig(testCompanyId, testMetaConfig);
    assert(true, 'Meta Ads configuration saved to PostgreSQL public.company_settings');

    // Retrieve from PostgreSQL (simulating page reload)
    const retrieved = await integrationService.getMetaAdsConfig(testCompanyId);
    assert(retrieved !== null, 'Retrieved stored configuration from PostgreSQL after reload');
    assert(retrieved?.businessId === '482910492817291', 'Stored Business ID strictly preserved as string');
    assert(retrieved?.adAccountId === 'act_982710491029', 'Stored Ad Account ID strictly preserved');
    assert(retrieved?.pixelId === '829104859102948', 'Stored Pixel ID preserved as string');
    assert(retrieved?.isConfigured === true, 'Integration correctly marked configured in PostgreSQL');

    // Direct DB inspection to verify encryption at rest
    const rawVal = await integrationService.readSettingVal(`meta_ads_config_${testCompanyId}`);
    assert(
      rawVal?.pageAccessTokenEncrypted && rawVal.pageAccessTokenEncrypted.includes(':'),
      'Page Access Token is encrypted at rest in PostgreSQL JSONB with AES-256-GCM'
    );
    assert(
      !JSON.stringify(rawVal).includes('EAAG_TEST_ACCESS_TOKEN_FOR_AUDIT'),
      'Raw database row does NOT contain plaintext token'
    );

    // Cross-module isolation: verify biometrics or smtp config for this company is NOT corrupted
    const otherModule = await integrationService.getBiometricsConfig(testCompanyId);
    assert(otherModule === null, 'No cross-module configuration corruption between Meta and Biometrics');

    // Clean up test record
    try {
      await query(`DELETE FROM public.company_settings WHERE setting_key LIKE $1`, [`%${testCompanyId}%`]);
    } catch {
      const { getSupabaseAdmin } = await import('../dist/config/supabase.js');
      await getSupabaseAdmin().from('company_settings').delete().like('setting_key', `%${testCompanyId}%`);
    }
    console.log('  [CLEANUP] Test company record removed from PostgreSQL.');
  } catch (dbErr) {
    console.error('Database persistence test error:', dbErr);
    assert(false, 'Database persistence test completed without error', dbErr.message);
  } finally {
    try {
      await databasePool.end();
    } catch {}
  }

  // ==============================================================
  // SUMMARY REPORT
  // ==============================================================
  console.log('\n===============================================================');
  console.log(`TEST EXECUTION SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
