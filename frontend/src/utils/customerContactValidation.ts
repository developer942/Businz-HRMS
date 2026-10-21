import { parsePhoneNumberFromString } from 'libphonenumber-js';

export type CustomerField = 'customerName' | 'companyName' | 'designation' | 'contactNumber' | 'alternateContactNumber' | 'email' | 'website' | 'address' | 'notes';

export interface CustomerContactValues {
  customerName: string;
  companyName: string;
  designation: string;
  contactNumber: string;
  alternateContactNumber: string;
  email: string;
  website: string;
  address: string;
  notes: string;
}

export type CustomerContactErrors = Partial<Record<CustomerField, string>>;

const hasLetter = /\p{L}/u;
const validPersonName = /^[\p{L}\p{M}\s.'’\-]+$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

export const normalizePhoneNumber = (value: string): string | null => {
  try {
    const parsed = parsePhoneNumberFromString(value.trim(), 'IN');
    return parsed?.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
};

export const normalizeWebsite = (value: string): string | null => {
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

export const validateCustomerField = (field: CustomerField, value: string): string | undefined => {
  const trimmed = value.trim();
  if (field === 'customerName') {
    if (!trimmed) return 'Customer Name is required.';
    if (trimmed.length > 120) return 'Customer Name must be 120 characters or fewer.';
    if (!hasLetter.test(trimmed) || !validPersonName.test(trimmed)) return 'Enter a valid name using letters, initials, spaces, apostrophes, periods, or hyphens.';
  }
  if (field === 'companyName' && trimmed.length > 160) return 'Company Name must be 160 characters or fewer.';
  if (field === 'designation') {
    if (trimmed.length > 120) return 'Designation must be 120 characters or fewer.';
    if (trimmed && !hasLetter.test(trimmed)) return 'Designation must contain letters.';
  }
  if (field === 'contactNumber') {
    if (!trimmed) return 'Primary Contact Number is required.';
    if (trimmed.length > 40 || !normalizePhoneNumber(trimmed)) return 'Enter a valid phone number. India is used when no country code is provided.';
  }
  if (field === 'alternateContactNumber' && trimmed && (trimmed.length > 40 || !normalizePhoneNumber(trimmed))) return 'Enter a valid alternate mobile or landline number.';
  if (field === 'email' && trimmed && (trimmed.length > 254 || !emailPattern.test(trimmed))) return 'Enter a valid email address.';
  if (field === 'website' && trimmed) {
    if (trimmed.length > 2048) return 'Website must be 2048 characters or fewer.';
    if (!normalizeWebsite(trimmed)) return 'Enter a valid website using http or https.';
  }
  if (field === 'address' && value.length > 1000) return 'Address must be 1000 characters or fewer.';
  if (field === 'notes' && value.length > 2000) return 'Notes must be 2000 characters or fewer.';
  return undefined;
};

export const validateCustomerContact = (values: CustomerContactValues): CustomerContactErrors => {
  const fields = Object.keys(values) as CustomerField[];
  return fields.reduce<CustomerContactErrors>((errors, field) => {
    const error = validateCustomerField(field, values[field]);
    if (error) errors[field] = error;
    return errors;
  }, {});
};

