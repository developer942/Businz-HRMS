import { parsePhoneNumberFromString } from 'libphonenumber-js';

const hasLetter = /\p{L}/u;
const validPersonName = /^[\p{L}\p{M}\s.'’\-]+$/u;

export const isValidCustomerName = (value: string) => hasLetter.test(value) && validPersonName.test(value);
export const hasUnicodeLetter = (value: string) => hasLetter.test(value);

export const normalizeCustomerPhone = (value: string): string | null => {
  try {
    const parsed = parsePhoneNumberFromString(value.trim(), 'IN');
    return parsed?.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
};

export const normalizeCustomerWebsite = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
};
