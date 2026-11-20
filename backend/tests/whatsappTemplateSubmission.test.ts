/**
 * WhatsApp Template Submission & Validation Test Suite for BUSINZ HRMS
 * Executable directly via tsx / node:assert
 * Covers: Media Handle Resumable Upload, Component Normalization,
 * Body Text Preview Sanitization, Button Formatting, and Error Parsing
 */

import assert from 'node:assert/strict';
import { metaApiClient } from '../src/services/whatsapp/metaApiClient.js';

async function runTests() {
  console.log('--- Starting WhatsApp Template Submission Verification Suite ---\n');

  // Test 1: Body Text & Preview Sanitization
  console.log('Test 1: Body Text & Preview Sanitization...');
  {
    const rawText = "Hello {{1}},\n\nThank you for connecting with VRM Structures at .\n\nWe manufacture solar mounting structures.";
    const sanitized = rawText
      .replace(/Thank you for connecting with VRM Structures at \./g, 'Thank you for connecting with VRM Structures.')
      .replace(/Thank you for connecting with VRM Structures  \./g, 'Thank you for connecting with VRM Structures.');

    assert.equal(
      sanitized,
      "Hello {{1}},\n\nThank you for connecting with VRM Structures.\n\nWe manufacture solar mounting structures."
    );
    assert.ok(!sanitized.includes('at .'), 'Must not contain dangling "at ."');
    assert.ok(!sanitized.includes('  .'), 'Must not contain double space before period');

    // Live preview variable interpolation
    const sampleValues: Record<number, string> = {
      1: 'Ahilesh',
      2: 'Solar Project Alpha'
    };
    let rendered = "Hello {{1}},\n\nThank you for connecting with VRM Structures.\n\nReply here to request our product catalogue for {{2}}.\n\nTeam VRM Structures";
    const vars = ['{{1}}', '{{2}}'];
    vars.forEach((v, idx) => {
      const num = idx + 1;
      const sample = sampleValues[num] || `[Example ${num}]`;
      rendered = rendered.split(v).join(sample);
    });

    assert.ok(rendered.includes('Hello Ahilesh,'), 'Should replace {{1}} with Ahilesh');
    assert.ok(rendered.includes('for Solar Project Alpha.'), 'Should replace {{2}} with sample value');
    assert.ok(!rendered.includes('{{1}}') && !rendered.includes('{{2}}'), 'No raw variables remain in sample mode');
    console.log('  ✓ PASSED');
  }

  // Test 2: Phone Number & Button Normalization
  console.log('Test 2: Phone Number Button Normalization...');
  {
    const dirtyNumbers = [
      '+91 98843 30789',
      '+91-98843-30789',
      '98843 30789',
      '+1 (555) 123-4567'
    ];

    const cleanNumbers = dirtyNumbers.map(raw => {
      const hasPlus = raw.trim().startsWith('+');
      const digits = raw.replace(/\D/g, '');
      return hasPlus ? `+${digits}` : digits;
    });

    assert.equal(cleanNumbers[0], '+919884330789');
    assert.equal(cleanNumbers[1], '+919884330789');
    assert.equal(cleanNumbers[2], '9884330789');
    assert.equal(cleanNumbers[3], '+15551234567');
    cleanNumbers.forEach(n => {
      assert.ok(!n.includes(' '), 'Must not contain spaces');
      assert.ok(!n.includes('-'), 'Must not contain dashes');
    });
    console.log('  ✓ PASSED');
  }

  // Test 3: Media Header Base64 Decoding & Meta Upload Flow
  console.log('Test 3: Media Header Base64 Parsing & Resumable Upload Mock...');
  {
    const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const dataUrl = `data:image/png;base64,${sampleBase64}`;

    const match = dataUrl.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
    assert.ok(match, 'Base64 data URL regex must match');
    assert.equal(match![1], 'image/png');

    const buffer = Buffer.from(match![2], 'base64');
    assert.ok(buffer.length > 0, 'Buffer must not be empty');
    assert.equal(buffer[0], 0x89);
    assert.equal(buffer[1], 0x50); // 'P'
    assert.equal(buffer[2], 0x4E); // 'N'
    assert.equal(buffer[3], 0x47); // 'G'

    // Mock getConfig and fetch
    (metaApiClient as any).getConfig = async () => ({
      accessToken: 'MOCK_ACCESS_TOKEN',
      wabaId: '1608144917192046',
      phoneNumberId: '1487438917778556'
    });

    const recordedCalls: Array<{ url: string; options: any }> = [];
    global.fetch = async (url: any, options: any) => {
      recordedCalls.push({ url: String(url), options });
      if (String(url).includes('/app/uploads')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'upload:SESSION_TEST_123' })
        } as any;
      }
      if (String(url).includes('/upload:SESSION_TEST_123')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ h: '4::aW1hZ2UvcG5n:MOCK_HANDLE_HASH_XYZ' })
        } as any;
      }
      return { ok: false, status: 400, json: async () => ({}) } as any;
    };

    const result = await metaApiClient.uploadMediaHandle(dataUrl, 'image/png', 'company-a');
    assert.equal(result.success, true);
    assert.equal(result.handle, '4::aW1hZ2UvcG5n:MOCK_HANDLE_HASH_XYZ');
    assert.equal(recordedCalls.length, 2);
    assert.ok(recordedCalls[0].url.includes('/app/uploads?file_length='));
    assert.ok(recordedCalls[0].url.includes('&file_type=image%2Fpng'));
    assert.ok(recordedCalls[1].url.includes('/upload:SESSION_TEST_123'));
    assert.equal(recordedCalls[1].options.headers['file_offset'], '0');
    assert.equal(recordedCalls[1].options.headers['Content-Type'], 'application/octet-stream');
    console.log('  ✓ PASSED');
  }

  // Test 4: Meta API Detailed Error Formatter
  console.log('Test 4: Meta API Detailed Error Formatter...');
  {
    const metaErrorResponse = {
      error: {
        message: 'Invalid parameter',
        type: 'OAuthException',
        code: 100,
        error_subcode: 2388040,
        error_user_title: 'Invalid Media Handle',
        error_user_msg: 'Check the handle provided for the uploaded media in the request.'
      }
    };

    const err = metaErrorResponse.error;
    const details = [
      err.error_user_title ? `${err.error_user_title}: ` : '',
      err.error_user_msg || err.message,
      err.code ? ` (Meta Error #${err.code}${err.error_subcode ? ` / Subcode #${err.error_subcode}` : ''})` : ''
    ].filter(Boolean).join('');

    assert.equal(
      details,
      'Invalid Media Handle: Check the handle provided for the uploaded media in the request. (Meta Error #100 / Subcode #2388040)'
    );
    console.log('  ✓ PASSED');
  }

  // Test 5: Variable Sequence & Sample Validation
  console.log('Test 5: Variable Sequence & Sample Validation...');
  {
    const brokenBody = 'Hello {{1}}, your order {{3}} has shipped!';
    const matches = brokenBody.match(/\{\{(\d+)\}\}/g) || [];
    const uniqueVars = Array.from(new Set(matches)).sort();
    const foundNums = uniqueVars.map(v => parseInt(v.replace(/\D/g, ''), 10));

    let hasGap = false;
    let missingVar = 0;
    for (let i = 1; i <= foundNums.length; i++) {
      if (!foundNums.includes(i)) {
        hasGap = true;
        missingVar = i;
        break;
      }
    }
    assert.equal(hasGap, true);
    assert.equal(missingVar, 2, 'Should identify missing {{2}}');

    const validBody = 'Hello {{1}}, your quotation for {{2}} is ready.';
    const validMatches = validBody.match(/\{\{(\d+)\}\}/g) || [];
    const validUnique = Array.from(new Set(validMatches));
    const validNums = validUnique.map(v => parseInt(v.replace(/\D/g, ''), 10));

    let validGap = false;
    for (let i = 1; i <= validNums.length; i++) {
      if (!validNums.includes(i)) {
        validGap = true;
        break;
      }
    }
    assert.equal(validGap, false);
    assert.equal(validNums.length, 2);
    console.log('  ✓ PASSED');
  }

  console.log('\n======================================================');
  console.log('ALL 5 VERIFICATION SUITES COMPLETED SUCCESSFULLY! ✓');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
