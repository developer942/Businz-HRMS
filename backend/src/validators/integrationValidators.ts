import { z } from 'zod';

// ============================================================================
// 1. HELPER REGEX PATTERNS & SANITIZATION
// ============================================================================

// Digits-only string (avoids IEEE-754 precision loss on large IDs)
export const numericStringRegex = /^\d+$/;

// Standard Hostname regex (RFC 1123) - strictly prohibits protocols (http://, https://)
export const hostnameRegex = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]+(?<!-)(\.(?!-)[A-Za-z0-9-]+(?<!-))*$/;

// IPv4 address regex
export const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// IPv6 address regex
export const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

// Standard RFC 5322 compatible email regex
export const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// SSRF Prohibited IP detection (Cloud IMDS, loopback, link-local)
export function isProhibitedSsrfIp(ipOrHost: string): boolean {
  const clean = ipOrHost.trim().toLowerCase();
  if (clean === '169.254.169.254' || clean.startsWith('169.254.')) return true; // AWS/GCP/Azure IMDS
  if (clean === '127.0.0.1' || clean === 'localhost' || clean === '::1' || clean === '0.0.0.0') return true;
  if (clean === '255.255.255.255' || clean.startsWith('224.')) return true; // Multicast/broadcast
  return false;
}

// Check if an IP is a private LAN address (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
export function isPrivateLanIp(ip: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  const match172 = ip.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (match172) {
    const secondOctet = parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
}

// Validates device IP, IPv6, or DNS hostname while strictly rejecting malformed IPs (e.g. 999.999.999.999, 192.168.1, abcd)
export function isValidDeviceHost(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  const clean = val.trim();
  // Reject URL protocols
  if (/^[a-zA-Z]+:\/\//.test(clean)) return false;

  // 1. If it consists solely of numbers and dots, it MUST be a valid IPv4 address
  if (/^[\d.]+$/.test(clean)) {
    return ipv4Regex.test(clean);
  }

  // 2. Check IPv6
  if (clean.includes(':')) {
    return ipv6Regex.test(clean);
  }

  // 3. DNS Hostname: must have at least one dot (e.g. terminal.local, biometric.corp.lan, host.com)
  // and match hostnameRegex. Single word like "abcd" is rejected!
  if (clean.includes('.') && hostnameRegex.test(clean)) {
    const parts = clean.split('.');
    const tld = parts[parts.length - 1];
    if (/^\d+$/.test(tld)) return false; // numeric TLD like 999 is invalid
    return true;
  }

  return false;
}

// Normalizes Meta Ad Account ID to act_<digits> format preserving leading zeros
export function normalizeAdAccountId(val: string): string {
  const digits = val.trim().replace(/^act_/, '');
  return `act_${digits}`;
}

// ============================================================================
// 2. META ADS SCHEMAS
// ============================================================================

export const metaAdsConfigSchema = z.object({
  businessId: z.string({ required_error: 'Meta Business Manager ID is required.' })
    .trim()
    .min(1, 'Meta Business Manager ID is required.')
    .regex(numericStringRegex, 'Meta Business Manager ID must contain only digits (0–9). Letters, spaces, and special characters are rejected.'),
  
  adAccountId: z.string({ required_error: 'Meta Ad Account ID is required.' })
    .trim()
    .min(1, 'Meta Ad Account ID is required.')
    .refine((val) => {
      // Must be numeric digits, optionally prefixed with 'act_'
      return /^(act_)?\d+$/.test(val);
    }, 'Meta Ad Account ID must be a numeric identifier (e.g. 982710491029 or act_982710491029). Arbitrary alphabetic strings are rejected.')
    .transform((val) => {
      // Normalize to standard act_<digits> format required by Meta Graph API
      const digits = val.replace(/^act_/, '');
      return `act_${digits}`;
    }),

  pageAccessToken: z.string({ required_error: 'Facebook Page Access Token is required.' })
    .trim()
    .min(10, 'Facebook Page Access Token is required.')
    .regex(/^[A-Za-z0-9_.-]+$/, 'Facebook Page Access Token contains invalid characters.'),

  pixelId: z.string().trim()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || numericStringRegex.test(val), {
      message: 'Meta Conversion Pixel ID must contain digits only. Alphabetic and special characters are rejected.'
    }),

  autoIngestCandidates: z.boolean().optional().default(false),
  targetJobPost: z.string().optional().default('')
});

// ============================================================================
// 3. BIOMETRIC ATTENDANCE GATEWAY SCHEMAS
// ============================================================================

export const biometricConfigSchema = z.object({
  deviceIp: z.string({ required_error: 'Biometric Server / Device IP Address is required.' })
    .trim()
    .min(1, 'Biometric Server / Device IP Address is required.')
    .refine((val) => isValidDeviceHost(val), {
      message: 'Invalid Device IP Address or Hostname. Enter a valid IPv4 (e.g. 192.168.1.201), IPv6, or DNS hostname without URL protocols. Malformed IPs and arbitrary text are rejected.'
    })
    .refine((val) => !isProhibitedSsrfIp(val), {
      message: 'Restricted host: Prohibited loopback or cloud metadata address.'
    }),

  devicePort: z.union([z.string(), z.number()])
    .transform((val) => {
      const str = String(val).trim();
      return str;
    })
    .refine((val) => /^\d+$/.test(val), {
      message: 'Device TCP Port must be an integer containing digits only. Letters and decimals are rejected.'
    })
    .transform((val) => parseInt(val, 10))
    .refine((port) => port >= 1 && port <= 65535, {
      message: 'Device TCP Port must be between 1 and 65535.'
    }),

  syncIntervalMins: z.union([z.string(), z.number()])
    .transform((val) => Number(val))
    .refine((val) => [5, 15, 30, 60].includes(val), {
      message: 'Polling Sync Frequency must be one of the supported intervals: 5, 15, 30, or 60 minutes.'
    }),

  deviceBrand: z.string({ required_error: 'Device Hardware Brand / Firmware is required.' })
    .trim()
    .min(2, 'Device Hardware Brand / Model name must be at least 2 characters.')
    .max(100, 'Device Hardware Brand must not exceed 100 characters.')
    .regex(/^[a-zA-Z0-9\s&.\-_/()+,]+$/, 'Device Hardware Brand contains invalid characters.'),

  autoSyncMusterRoll: z.boolean().optional().default(false)
});

// ============================================================================
// 4. GOOGLE WORKSPACE / GMAIL SMTP SCHEMAS
// ============================================================================

export const smtpConfigSchema = z.object({
  smtpHost: z.string({ required_error: 'SMTP Relay Server Host is required.' })
    .trim()
    .min(1, 'SMTP Relay Server Host is required.')
    .refine((val) => {
      // Must NOT contain protocol schemes
      if (/^[a-zA-Z]+:\/\//.test(val)) return false;
      return hostnameRegex.test(val) || ipv4Regex.test(val);
    }, 'Invalid SMTP Host: Enter a valid hostname (e.g. smtp.gmail.com). URL schemes like https:// are rejected.')
    .refine((val) => !isProhibitedSsrfIp(val), {
      message: 'Restricted SMTP Host: Prohibited cloud metadata or loopback host.'
    }),

  smtpPort: z.union([z.string(), z.number()])
    .transform((val) => String(val).trim())
    .refine((val) => /^\d+$/.test(val), {
      message: 'SMTP Port must be an integer containing digits only. Letters and decimals are rejected.'
    })
    .transform((val) => parseInt(val, 10))
    .refine((port) => port >= 1 && port <= 65535, {
      message: 'SMTP Port must be between 1 and 65535 (commonly 587 for STARTTLS or 465 for SSL).'
    }),

  senderEmail: z.string({ required_error: 'Corporate Sender Email Address is required.' })
    .trim()
    .min(1, 'Corporate Sender Email Address is required.')
    .refine((val) => emailRegex.test(val), {
      message: 'Invalid email address format for Corporate Sender Email.'
    }),

  appPassword: z.string().optional().or(z.literal(''))
    .transform((val) => (val || '').replace(/\s+/g, '').trim()),

  senderName: z.string().trim().max(100).optional().default('Businz HRMS'),
  secure: z.boolean().optional(),
  testRecipientEmail: z.string().trim().optional().or(z.literal(''))
    .refine((val) => !val || emailRegex.test(val), {
      message: 'Invalid email format for Send Test Email To.'
    })
});

// ============================================================================
// 5. TALLY PRIME & ZOHO BOOKS ACCOUNTING SCHEMAS
// ============================================================================

export const accountingConfigSchema = z.object({
  accountingProvider: z.enum([
    'Tally Prime XML Server',
    'Zoho Books Cloud API',
    'QuickBooks Online'
  ], {
    errorMap: () => ({ message: 'Unsupported accounting platform selected.' })
  }),

  serverEndpoint: z.string().trim().optional().or(z.literal('')),
  companyNameInTally: z.string().trim().optional().or(z.literal('')),
  organizationId: z.string().trim().optional().or(z.literal('')),
  authToken: z.string().trim().optional().or(z.literal('')),
  autoSyncFrequency: z.enum([
    'Monthly on Payroll Close',
    'Weekly Ledger Update',
    'Manual'
  ], {
    errorMap: () => ({ message: 'Invalid sync frequency trigger.' })
  })
}).superRefine((data, ctx) => {
  if (data.accountingProvider === 'Tally Prime XML Server') {
    if (!data.serverEndpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['serverEndpoint'],
        message: 'Tally Server IP Address / Endpoint is required for Tally Prime.'
      });
    } else {
      const ep = data.serverEndpoint.trim();
      // Ensure structured endpoint format (e.g. http://192.168.1.100:9000 or http://hostname:port)
      try {
        const parsed = new URL(ep.startsWith('http://') || ep.startsWith('https://') ? ep : `http://${ep}`);
        if (!parsed.hostname || !parsed.port) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['serverEndpoint'],
            message: 'Tally Server Endpoint must include both host and port (e.g. http://192.168.1.100:9000).'
          });
        }
        if (isProhibitedSsrfIp(parsed.hostname)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['serverEndpoint'],
            message: 'Restricted Tally Endpoint: Prohibited cloud metadata or loopback IP.'
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['serverEndpoint'],
          message: 'Malformed Tally Server Endpoint URL. Enter valid endpoint (e.g. http://192.168.1.100:9000).'
        });
      }
    }

    if (!data.companyNameInTally) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['companyNameInTally'],
        message: 'Company Name in Tally is required for XML synchronization.'
      });
    } else if (data.companyNameInTally.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['companyNameInTally'],
        message: 'Company Name in Tally must be at least 2 characters.'
      });
    }
  }

  if (data.accountingProvider === 'Zoho Books Cloud API') {
    const orgId = data.organizationId || data.companyNameInTally;
    if (!orgId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationId'],
        message: 'Zoho Books Organization ID is required.'
      });
    } else if (!/^[A-Za-z0-9_-]+$/.test(orgId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationId'],
        message: 'Invalid Zoho Books Organization ID format.'
      });
    }
  }
});
