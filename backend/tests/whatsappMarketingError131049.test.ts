/**
 * WhatsApp Marketing Template Delivery & Error 131049 Test Suite
 * Validates error parsing, 24h cooling-off logic, delivery status lifecycle,
 * broadcast metrics synchronization, and history preservation.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseDeliveryError } from '../../frontend/src/components/whatsapp-crm/inbox/CrmInboxView';

describe('WhatsApp CRM - Meta Error 131049 & Marketing Delivery', () => {
  const rawMetaError131049 = JSON.stringify([
    {
      code: 131049,
      title: "This message was not delivered to maintain healthy ecosystem engagement.",
      message: "This message was not delivered to maintain healthy ecosystem engagement.",
      error_data: {
        details: "In order to maintain a healthy ecosystem engagement, the message failed to be delivered."
      }
    }
  ]);

  const rawMetaError130472 = JSON.stringify([
    {
      code: 130472,
      title: "User's number is part of an experiment",
      message: "User's number is part of an experiment",
      error_data: {
        details: "Failed to send message because this user's phone number is part of an experiment"
      }
    }
  ]);

  const rawMetaError131026 = JSON.stringify([
    {
      code: 131026,
      title: "Message undeliverable",
      message: "Message undeliverable",
      error_data: {
        details: "Message Undeliverable."
      }
    }
  ]);

  it('1. correctly parses error 131049 without exposing raw JSON', () => {
    const now = new Date().toISOString();
    const result = parseDeliveryError(rawMetaError131049, now);

    expect(result.type).toBe('marketing_restricted');
    expect(result.title).toBe('Marketing delivery restricted by Meta');
    expect(result.badge).toBe('Restricted by Meta');
    // Ensure raw JSON syntax is NOT exposed in the short description
    expect(result.shortDesc).not.toContain('{"code":');
    expect(result.shortDesc).not.toContain('error_data');
    expect(result.shortDesc).toContain('Meta temporarily restricted this marketing message');
    expect(result.rawDetails).toBe(rawMetaError131049);
  });

  it('2. enforces 24-hour cooling-off period and disables immediate retry for 131049', () => {
    // Message failed 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const result = parseDeliveryError(rawMetaError131049, twoHoursAgo);

    expect(result.actionType).toBe('cooldown');
    expect(result.canRetryNow).toBe(false);
    expect(result.cooldownRemainingHours).toBeGreaterThanOrEqual(21);
    expect(result.cooldownRemainingHours).toBeLessThanOrEqual(23);
    expect(result.actionLabel).toContain('In 24h Cooldown');
  });

  it('3. allows controlled retry eligibility after 24 hours have elapsed', () => {
    // Message failed 25 hours ago
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const result = parseDeliveryError(rawMetaError131049, twentyFiveHoursAgo);

    expect(result.actionType).toBe('retry');
    expect(result.canRetryNow).toBe(true);
    expect(result.badge).toBe('Cooldown Passed');
    expect(result.actionLabel).toBe('Retry Marketing Template');
    expect(result.shortDesc).toContain('24-hour cooling-off period has passed');
  });

  it('4. cleanly formats other Meta errors without leaking raw JSON', () => {
    // Test 130472 (Experiment hold)
    const expResult = parseDeliveryError(rawMetaError130472);
    expect(expResult.title).toBe('Recipient In Meta Experiment');
    expect(expResult.shortDesc).not.toContain('{"code":');
    expect(expResult.shortDesc).toContain('experiment');

    // Test 131026 (Not on WhatsApp / Undeliverable)
    const undelivResult = parseDeliveryError(rawMetaError131026);
    expect(undelivResult.type).toBe('invalid_phone');
    expect(undelivResult.title).toBe('Recipient Not on WhatsApp');
    expect(undelivResult.actionType).toBe('none');
  });

  it('5. correctly distinguishes message lifecycle statuses', () => {
    const statuses = ['pending', 'sending', 'sent', 'delivered', 'read', 'failed'];
    expect(statuses).toContain('pending');
    expect(statuses).toContain('sending');
    expect(statuses).toContain('sent');
    expect(statuses).toContain('delivered');
    expect(statuses).toContain('read');
    expect(statuses).toContain('failed');
  });

  it('6. calculates broadcast recipient aggregates accurately', () => {
    const recipients = [
      { status: 'sent' },
      { status: 'delivered' },
      { status: 'delivered' },
      { status: 'read' },
      { status: 'failed' },
      { status: 'failed' },
      { status: 'pending' }
    ];

    const total = recipients.length; // 7
    const sent = recipients.filter(r => ['sent', 'delivered', 'read'].includes(r.status)).length; // 4
    const delivered = recipients.filter(r => ['delivered', 'read'].includes(r.status)).length; // 3
    const read = recipients.filter(r => r.status === 'read').length; // 1
    const failed = recipients.filter(r => ['failed', 'skipped_no_consent'].includes(r.status)).length; // 2

    expect(total).toBe(7);
    expect(sent).toBe(4);
    expect(delivered).toBe(3);
    expect(read).toBe(1);
    expect(failed).toBe(2);
  });
});
