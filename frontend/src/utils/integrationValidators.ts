// ============================================================================
// BUSINZ HRMS - INTEGRATION SETTINGS FRONTEND VALIDATORS
// ============================================================================

export const numericStringRegex = /^\d+$/;
export const hostnameRegex = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]+(?<!-)(\.(?!-)[A-Za-z0-9-]+(?<!-))*$/;
export const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
export const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
export const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isProhibitedSsrfIp(ipOrHost: string): boolean {
  const clean = ipOrHost.trim().toLowerCase();
  if (clean === '169.254.169.254' || clean.startsWith('169.254.')) return true;
  if (clean === '127.0.0.1' || clean === 'localhost' || clean === '::1' || clean === '0.0.0.0') return true;
  if (clean === '255.255.255.255' || clean.startsWith('224.')) return true;
  return false;
}

export function isValidDeviceHost(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  const clean = val.trim();
  if (/^[a-zA-Z]+:\/\//.test(clean)) return false;
  if (/^[\d.]+$/.test(clean)) {
    return ipv4Regex.test(clean);
  }
  if (clean.includes(':')) {
    return ipv6Regex.test(clean);
  }
  if (clean.includes('.') && hostnameRegex.test(clean)) {
    const parts = clean.split('.');
    const tld = parts[parts.length - 1];
    if (/^\d+$/.test(tld)) return false;
    return true;
  }
  return false;
}

/**
 * Validates a single field within an integration configuration form
 */
export function validateIntegrationField(
  integrationId: string,
  fieldKey: string,
  value: any,
  allVals?: Record<string, any>
): string {
  const raw = typeof value === 'string' ? value : (value !== null && value !== undefined ? String(value) : '');
  const trimmed = raw.trim();

  // ========================================================================
  // 1. WHATSAPP BUSINESS CLOUD API
  // ========================================================================
  if (integrationId === 'whatsapp') {
    if (fieldKey === 'phoneNumberId') {
      if (!trimmed) return 'WhatsApp Phone Number ID is required.';
      if (!numericStringRegex.test(trimmed)) {
        return 'WhatsApp Phone Number ID must contain only digits (0–9). Letters, spaces, and special characters are rejected.';
      }
      return '';
    }
    if (fieldKey === 'wabaId') {
      if (!trimmed) return 'WhatsApp Business Account ID (WABA ID) is required.';
      if (!numericStringRegex.test(trimmed)) {
        return 'WABA ID must contain only digits (0–9). Alphabetic and special characters are rejected.';
      }
      return '';
    }
    if (fieldKey === 'accessToken') {
      if (!trimmed) return 'Permanent System User Access Token is required.';
      return '';
    }
    if (fieldKey === 'webhookSecret') {
      if (!trimmed) return 'Webhook Verification Token is required.';
      return '';
    }
  }

  // ========================================================================
  // 2. META ADS (FACEBOOK & INSTAGRAM LEAD SYNC)
  // ========================================================================
  if (integrationId === 'meta_ads') {
    if (fieldKey === 'businessId') {
      if (!trimmed) return 'Meta Business Manager ID is required.';
      if (!numericStringRegex.test(trimmed)) {
        return 'Meta Business Manager ID must contain only digits (0–9). Letters, spaces, and special characters are rejected.';
      }
      return '';
    }
    if (fieldKey === 'adAccountId') {
      if (!trimmed) return 'Meta Ad Account ID is required.';
      if (!/^(act_)?\d+$/.test(trimmed)) {
        return 'Meta Ad Account ID must be a numeric identifier (e.g. 982710491029 or act_982710491029). Arbitrary alphabetic strings are rejected.';
      }
      return '';
    }
    if (fieldKey === 'pageAccessToken') {
      if (!trimmed) return 'Facebook Page Access Token is required.';
      if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
        return 'Facebook Page Access Token contains invalid characters.';
      }
      return '';
    }
    if (fieldKey === 'pixelId') {
      if (trimmed && !numericStringRegex.test(trimmed)) {
        return 'Meta Conversion Pixel ID must contain digits only. Alphabetic and special characters are rejected.';
      }
      return '';
    }
  }

  // ========================================================================
  // 3. BIOMETRIC ATTENDANCE HARDWARE GATEWAY
  // ========================================================================
  if (integrationId === 'biometrics') {
    if (fieldKey === 'deviceIp') {
      if (!trimmed) return 'Biometric Server / Device IP Address is required.';
      if (/^[a-zA-Z]+:\/\//.test(trimmed)) {
        return 'Invalid IP: URL protocols (http://, https://) are rejected. Enter a raw IPv4 or hostname.';
      }
      if (!isValidDeviceHost(trimmed)) {
        return 'Invalid Device IP Address or Hostname. Enter a valid IPv4 (e.g. 192.168.1.201), IPv6, or DNS hostname. Malformed IPs and arbitrary text are rejected.';
      }
      if (isProhibitedSsrfIp(trimmed)) {
        return 'Security Alert: Prohibited destination host (cloud metadata or loopback IP).';
      }
      return '';
    }
    if (fieldKey === 'devicePort') {
      if (!trimmed) return 'Device TCP Port is required.';
      if (!numericStringRegex.test(trimmed)) {
        return 'Device TCP Port must be an integer containing digits only. Letters and decimals are rejected.';
      }
      const port = parseInt(trimmed, 10);
      if (port < 1 || port > 65535) {
        return 'Device TCP Port must be between 1 and 65535.';
      }
      return '';
    }
    if (fieldKey === 'syncIntervalMins') {
      if (!trimmed) return 'Polling Sync Frequency is required.';
      if (!['5', '15', '30', '60'].includes(trimmed)) {
        return 'Polling Sync Frequency must be one of: 5, 15, 30, or 60 minutes.';
      }
      return '';
    }
    if (fieldKey === 'deviceBrand') {
      if (!trimmed) return 'Device Hardware Brand / Firmware is required.';
      if (trimmed.length < 2) return 'Device Hardware Brand must be at least 2 characters.';
      return '';
    }
  }

  // ========================================================================
  // 4. GOOGLE WORKSPACE / GMAIL SMTP & CALENDAR
  // ========================================================================
  if (integrationId === 'google_workspace') {
    if (fieldKey === 'smtpHost') {
      if (!trimmed) return 'SMTP Relay Server Host is required.';
      if (/^[a-zA-Z]+:\/\//.test(trimmed)) {
        return 'Invalid SMTP Host: URL schemes (https://, http://) are rejected. Enter a valid hostname (e.g. smtp.gmail.com).';
      }
      if (!hostnameRegex.test(trimmed) && !ipv4Regex.test(trimmed)) {
        return 'Invalid SMTP Host: Enter a valid server hostname (e.g. smtp.gmail.com).';
      }
      if (isProhibitedSsrfIp(trimmed)) {
        return 'Security Alert: Prohibited SMTP host (cloud metadata or loopback IP).';
      }
      return '';
    }
    if (fieldKey === 'smtpPort') {
      if (!trimmed) return 'SMTP Port is required.';
      if (!numericStringRegex.test(trimmed)) {
        return 'SMTP Port must be an integer containing digits only. Letters and decimals are rejected.';
      }
      const port = parseInt(trimmed, 10);
      if (port < 1 || port > 65535) {
        return 'SMTP Port must be between 1 and 65535 (commonly 587 for STARTTLS or 465 for SSL).';
      }
      return '';
    }
    if (fieldKey === 'senderEmail') {
      if (!trimmed) return 'Corporate Sender Email Address is required.';
      if (!emailRegex.test(trimmed)) {
        return 'Invalid email address format for Corporate Sender Email.';
      }
      return '';
    }
    if (fieldKey === 'appPassword') {
      // Clean password removing any formatting spaces
      const cleanPass = trimmed.replace(/\s+/g, '');
      if (!cleanPass) return 'Google Account App Password (16-digits) is required.';
      return '';
    }
    if (fieldKey === 'testRecipientEmail') {
      if (trimmed && !emailRegex.test(trimmed)) {
        return 'Invalid email address format for Send Test Email To.';
      }
      return '';
    }
  }

  // ========================================================================
  // 5. TALLY PRIME & ZOHO BOOKS ACCOUNTING SYNC
  // ========================================================================
  if (integrationId === 'tally_zoho') {
    const provider = allVals?.accountingProvider || 'Tally Prime XML Server';

    if (fieldKey === 'serverEndpoint') {
      if (provider === 'Tally Prime XML Server') {
        if (!trimmed) return 'Tally Server IP Address / Endpoint is required for Tally Prime.';
        try {
          const urlObj = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `http://${trimmed}`);
          if (!urlObj.hostname || !urlObj.port) {
            return 'Tally Server Endpoint must include both host and port (e.g. http://192.168.1.100:9000).';
          }
          if (isProhibitedSsrfIp(urlObj.hostname)) {
            return 'Security Alert: Prohibited destination host (cloud metadata or loopback IP).';
          }
        } catch {
          return 'Malformed Tally Server Endpoint URL. Enter valid endpoint (e.g. http://192.168.1.100:9000).';
        }
      }
      return '';
    }
    if (fieldKey === 'companyNameInTally') {
      if (!trimmed) return 'Company Name in Tally / Organization ID is required.';
      if (trimmed.length < 2) return 'Company Name in Tally must be at least 2 characters.';
      return '';
    }
    if (fieldKey === 'autoSyncFrequency') {
      if (!trimmed) return 'Automatic Sync Trigger is required.';
      if (!['Monthly on Payroll Close', 'Weekly Ledger Update', 'Manual'].includes(trimmed)) {
        return 'Invalid sync trigger selected.';
      }
      return '';
    }
  }

  // ========================================================================
  // 6. GOOGLE GEMINI AI
  // ========================================================================
  if (integrationId === 'gemini_ai') {
    if (fieldKey === 'apiKey') {
      if (!trimmed) return 'Google Gemini AI Studio API Key is required.';
      if (trimmed.startsWith('ya29.') || trimmed.startsWith('GOCSPX-') || trimmed.includes('.apps.googleusercontent.com')) {
        return 'Invalid key format: OAuth client secrets are rejected. Enter an API key (starts with "AQ." or "AIzaSy...").';
      }
      return '';
    }
  }

  return '';
}

/**
 * Validates all fields of an integration, returning a map of fieldKey -> errorMessage
 */
export function getIntegrationErrors(
  integrationId: string,
  fields: { key: string; required?: boolean }[],
  values: Record<string, any>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const err = validateIntegrationField(integrationId, field.key, values[field.key], values);
    if (err) {
      errors[field.key] = err;
    }
  }
  return errors;
}
