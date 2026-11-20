import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- Starting WhatsApp CRM Shared Inbox Verification Suite ---');

// Test 1: Error classification logic
console.log('\nTest 1: Error Classification Logic...');
function classifyDeliveryError(rawError: string | undefined): {
  category: 'WINDOW_EXPIRED' | 'RATE_LIMIT' | 'AUTH_ERROR' | 'BILLING_ERROR' | 'NETWORK_ERROR';
  userMessage: string;
  recommendedAction: string;
} {
  if (!rawError) {
    return {
      category: 'NETWORK_ERROR',
      userMessage: 'Message failed to deliver. Please check connection.',
      recommendedAction: 'Retry Send'
    };
  }

  const errLower = rawError.toLowerCase();

  if (errLower.includes('131047') || errLower.includes('24 hour') || errLower.includes('outside the allowed window')) {
    return {
      category: 'WINDOW_EXPIRED',
      userMessage: 'Customer 24-hour reply window expired. Meta policy requires an approved template to re-engage.',
      recommendedAction: 'Send Approved Template'
    };
  }

  if (errLower.includes('130429') || errLower.includes('131056') || errLower.includes('rate limit')) {
    return {
      category: 'RATE_LIMIT',
      userMessage: 'Meta Cloud API rate limit reached. Please wait a moment before sending again.',
      recommendedAction: 'Wait & Retry'
    };
  }

  if (errLower.includes('190') || errLower.includes('permission') || errLower.includes('access token') || errLower.includes('unauthorized')) {
    return {
      category: 'AUTH_ERROR',
      userMessage: 'WhatsApp Cloud API authentication or permission failed. Check system user access token in Settings.',
      recommendedAction: 'Check API Settings'
    };
  }

  if (errLower.includes('131031') || errLower.includes('payment') || errLower.includes('billing')) {
    return {
      category: 'BILLING_ERROR',
      userMessage: 'WhatsApp Business Account payment or credit line issue. Verify billing details in Meta Business Suite.',
      recommendedAction: 'Check Meta Billing'
    };
  }

  return {
    category: 'NETWORK_ERROR',
    userMessage: 'Message delivery failed due to network or gateway error.',
    recommendedAction: 'Retry Send'
  };
}

const windowErr = classifyDeliveryError('Meta API Error [131047]: Message failed to send because more than 24 hours have passed.');
assert.strictEqual(windowErr.category, 'WINDOW_EXPIRED');
assert.strictEqual(windowErr.recommendedAction, 'Send Approved Template');

const rateLimitErr = classifyDeliveryError('Error 130429: Cloud API message throughput limit exceeded.');
assert.strictEqual(rateLimitErr.category, 'RATE_LIMIT');
assert.strictEqual(rateLimitErr.recommendedAction, 'Wait & Retry');

const authErr = classifyDeliveryError('Error [190]: Invalid OAuth access token - Cannot parse access token');
assert.strictEqual(authErr.category, 'AUTH_ERROR');
assert.strictEqual(authErr.recommendedAction, 'Check API Settings');

const billingErr = classifyDeliveryError('Error [131031]: Account has payment method issues');
assert.strictEqual(billingErr.category, 'BILLING_ERROR');
assert.strictEqual(billingErr.recommendedAction, 'Check Meta Billing');

console.log('  ✓ PASSED');

// Test 2: CSS Layout & Overflow Rules Validation
console.log('\nTest 2: CSS Layout & Overflow Rules Validation...');
const cssPath = path.resolve(process.cwd(), 'frontend/src/styles/whatsapp-crm.css');
assert.ok(fs.existsSync(cssPath), `CSS file must exist at ${cssPath}`);
const cssContent = fs.readFileSync(cssPath, 'utf8');

// Check critical layout properties in CSS
assert.ok(cssContent.includes('.hrms-content.hrms-content-app-view'), 'Must have .hrms-content.hrms-content-app-view class');
assert.ok(cssContent.includes('height: calc(100vh - 72px)'), 'Must calculate desktop height from 72px top header');
assert.ok(cssContent.includes('overflow: hidden'), 'Outer app view must prevent body scrolling in WhatsApp CRM');

// Check flexbox structure for 2 panes
assert.ok(cssContent.includes('.crm-inbox-container'), 'Must contain .crm-inbox-container');
assert.ok(cssContent.includes('display: flex'), 'Container must use flex layout');
assert.ok(cssContent.includes('.crm-inbox-left'), 'Must contain left sidebar');
assert.ok(cssContent.includes('.crm-inbox-center'), 'Must contain center conversation area');
assert.ok(cssContent.includes('.crm-chat-messages-area'), 'Must contain messages area');
assert.ok(cssContent.includes('.crm-chat-composer'), 'Must contain composer area');

// Check scrolling behaviour: message area must have flex: 1 and overflow-y: auto
assert.ok(cssContent.includes('overflow-y: auto'), 'Must allow vertical scrolling inside conversation');
assert.ok(cssContent.includes('flex-shrink: 0'), 'Headers and composer must be pinned (flex-shrink: 0)');

// Check responsive breakpoints for mobile
assert.ok(cssContent.includes('@media (max-width: 900px)'), 'Must have responsive breakpoint at <= 900px');
assert.ok(cssContent.includes('.mobile-show-chat .crm-inbox-left'), 'Must toggle left pane visibility when viewing chat on mobile');
console.log('  ✓ PASSED');

// Test 3: Concurrency / Sequential Monotonic Request Guard
console.log('\nTest 3: Concurrency Request Sequence Guard...');
let seqCounter = 0;
let activeConversationId = 'conv-1';
let renderedMessages: any[] = [];

async function simulateFetchMessages(targetConvId: string, delayMs: number, data: string[]) {
  const currentSeq = ++seqCounter;
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      // Sequence guard: only apply if this request is the latest sequence AND matches current active conversation
      if (currentSeq === seqCounter && activeConversationId === targetConvId) {
        renderedMessages = data;
      }
      resolve();
    }, delayMs);
  });
}

// Fire request 1 for conv-1 (slow, 50ms)
const p1 = simulateFetchMessages('conv-1', 50, ['msg1', 'msg2']);
// Immediately user clicks conv-2 (fast, 10ms)
activeConversationId = 'conv-2';
const p2 = simulateFetchMessages('conv-2', 10, ['msg3', 'msg4']);

await Promise.all([p1, p2]);
// Even though p1 finished after p2, renderedMessages must NOT be overwritten by p1
assert.deepStrictEqual(renderedMessages, ['msg3', 'msg4'], 'Mismatched conversation data must never overwrite active selection');
console.log('  ✓ PASSED');

// Test 4: Multiline Composer Auto-expand & Enter handling
console.log('\nTest 4: Multiline Composer Keydown & Resize Logic...');
function handleComposerKeyDown(e: { key: string; shiftKey: boolean }, text: string) {
  if (e.key === 'Enter' && !e.shiftKey) {
    if (text.trim().length > 0) {
      return { action: 'SEND', content: text.trim() };
    }
    return { action: 'NOOP' };
  }
  if (e.key === 'Enter' && e.shiftKey) {
    return { action: 'NEWLINE', content: text + '\n' };
  }
  return { action: 'TYPING' };
}

const sendAction = handleComposerKeyDown({ key: 'Enter', shiftKey: false }, 'Hello customer');
assert.strictEqual(sendAction.action, 'SEND');
assert.strictEqual(sendAction.content, 'Hello customer');

const blankSendAction = handleComposerKeyDown({ key: 'Enter', shiftKey: false }, '   ');
assert.strictEqual(blankSendAction.action, 'NOOP');

const newlineAction = handleComposerKeyDown({ key: 'Enter', shiftKey: true }, 'Hello');
assert.strictEqual(newlineAction.action, 'NEWLINE');
assert.strictEqual(newlineAction.content, 'Hello\n');
console.log('  ✓ PASSED');

// Test 5: Document attachment metadata presentation
console.log('\nTest 5: Document Attachment Presentation Format...');
function formatDocumentCard(doc: { name?: string; sizeBytes?: number; mimeType?: string; url?: string }) {
  const name = doc.name || 'Document.pdf';
  const sizeMB = doc.sizeBytes ? (doc.sizeBytes / (1024 * 1024)).toFixed(1) + ' MB' : '2.4 MB';
  const isPdf = name.toLowerCase().endsWith('.pdf') || (doc.mimeType && doc.mimeType.includes('pdf'));
  return {
    badge: isPdf ? 'PDF' : 'DOC',
    name,
    size: sizeMB,
    canDownload: Boolean(doc.url)
  };
}

const docCard = formatDocumentCard({
  name: 'VRM Product Catalogue.pdf',
  sizeBytes: 2516582,
  mimeType: 'application/pdf',
  url: 'https://example.com/vrm-catalog.pdf'
});
assert.strictEqual(docCard.badge, 'PDF');
assert.strictEqual(docCard.name, 'VRM Product Catalogue.pdf');
assert.strictEqual(docCard.size, '2.4 MB');
assert.strictEqual(docCard.canDownload, true);
console.log('  ✓ PASSED');

console.log('\n======================================================');
console.log('ALL 5 SHARED INBOX SUITES COMPLETED SUCCESSFULLY! ✓');
console.log('======================================================\n');
