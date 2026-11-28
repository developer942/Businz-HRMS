import { describe, expect, it } from 'vitest';
import { crmMessageSender } from '../src/services/whatsapp/crmMessageSender.js';

describe('WhatsApp template sending and rendering contract', () => {
  it('exposes the dedicated template message sender', () => {
    expect(crmMessageSender.sendTemplateMessage).toBeTypeOf('function');
  });
});
