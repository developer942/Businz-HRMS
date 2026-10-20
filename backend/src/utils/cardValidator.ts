export type FieldVerificationStatus = 'valid' | 'needs_review' | 'not_found';

export interface CardFieldEvidence {
  value: string | null;
  evidence: string;
  status: FieldVerificationStatus;
  reviewReason?: string;
}

export interface ValidatedCardResult {
  person_name?: string | null;
  customerName: string;
  designation?: string | null;
  company_name?: string | null;
  companyName: string;
  phone_numbers: string[];
  contactNumber: string;
  alternateContactNumber: string;
  emails: string[];
  email: string;
  address: string;
  website: string;
  raw_text: string;
  review_required_fields: string[];
  notes: string;
  fields: {
    customerName: CardFieldEvidence;
    companyName: CardFieldEvidence;
    designation: CardFieldEvidence;
    contactNumber: CardFieldEvidence;
    alternateContactNumber: CardFieldEvidence;
    email: CardFieldEvidence;
    website: CardFieldEvidence;
    address: CardFieldEvidence;
  };
  visibleTextBlocks: string[];
  overallStatus: 'valid' | 'needs_review' | 'unclear_image';
  reviewSummary: string[];
  validFieldsCount: number;
  totalFieldsCount: number;
  extractionEngine: 'gemini' | 'rule_based' | 'tesseract';
  modelUsed?: string;
}

/**
 * Validates extracted customer name according to Step 6 rules:
 * - Reject phone numbers, emails, websites
 * - Reject icon-only and random-symbol values
 * - Allow Indian initials such as S. Sangeetha
 * - Preserve valid Unicode names
 */
export function validateCustomerName(
  rawName: string | null | undefined,
  evidence: string = ''
): CardFieldEvidence {
  const text = (rawName || '').trim();
  const ev = (evidence || text).trim();

  if (!text) {
    return { value: null, evidence: ev, status: 'not_found' };
  }

  // Reject if it contains an email
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(text)) {
    return { value: null, evidence: ev, status: 'needs_review', reviewReason: 'Contains email address rather than a person name' };
  }

  // Reject if it matches a website
  if (/(www\.[a-z0-9-]+\.[a-z]{2,}|https?:\/\/[a-z0-9-]+)/i.test(text)) {
    return { value: null, evidence: ev, status: 'needs_review', reviewReason: 'Contains website URL' };
  }

  // Reject if it contains phone digits (5 or more digits)
  if (/\d{5,}/.test(text)) {
    return { value: null, evidence: ev, status: 'needs_review', reviewReason: 'Contains numeric phone data' };
  }

  // Reject if purely random symbols, punctuation, or OCR noise
  if (/^[^a-zA-Z\u0900-\u0DFF]+$/.test(text)) {
    return { value: null, evidence: ev, status: 'needs_review', reviewReason: 'Contains only random symbols' };
  }

  // Reject single/two-character isolated noise (like "ISI", "nN", "2 -=")
  const lettersOnly = text.replace(/[^a-zA-Z\u0900-\u0DFF]/g, '');
  if (lettersOnly.length < 3) {
    return { value: null, evidence: ev, status: 'needs_review', reviewReason: 'Name text is too short or ambiguous' };
  }

  // Clean extra spaces around dots in Indian initials: "S. Sangeetha" or "S.Sangeetha" -> "S. Sangeetha"
  const cleanedName = text
    .replace(/\s+/g, ' ')
    .replace(/([A-Z])\.\s*([A-Z])/g, '$1. $2')
    .replace(/^[^a-zA-Z\u0900-\u0DFF]+/, '')
    .replace(/[^a-zA-Z\u0900-\u0DFF.]+$/, '')
    .trim();

  // Pattern allowing initials (e.g., S. Sangeetha, K.R. Narayanan) and multi-word names
  const validNameRegex = /^([A-Z]\.?\s*)+[A-Za-z\u0900-\u0DFF\s.'-]+$/i;
  const isAllCapAbbrev = /^[A-Z]{2,4}$/.test(cleanedName); // Like "ISI" or "IBM"

  if (isAllCapAbbrev) {
    return { value: cleanedName, evidence: ev, status: 'needs_review', reviewReason: 'Appears to be an acronym or OCR noise' };
  }

  if (validNameRegex.test(cleanedName) || cleanedName.length >= 3) {
    return { value: cleanedName, evidence: ev, status: 'valid' };
  }

  return { value: cleanedName, evidence: ev, status: 'needs_review', reviewReason: 'Format requires manual verification' };
}

/**
 * Validates company name:
 * - Remove unrelated OCR noise (e.g. leading "2 -=5")
 * - Preserve legitimate punctuation and business suffixes (PVT LTD, PRIVATE LIMITED, etc.)
 */
export function validateCompanyName(
  rawCompany: string | null | undefined,
  evidence: string = ''
): CardFieldEvidence {
  const text = (rawCompany || '').trim();
  const ev = (evidence || text).trim();

  if (!text) {
    return { value: null, evidence: ev, status: 'not_found' };
  }

  // Strip leading OCR artifacts like "2 -=5", bullets, dashes
  let cleaned = text
    .replace(/^[0-9\s\-=_•|*~:]+/, '')
    .replace(/\s*\.?\s*[a-z]{1,2}$/, '')
    .replace(/[0-9\s\-=_•|*~:]+$/, '')
    .trim();

  // If cleaning stripped everything
  if (!cleaned || cleaned.length < 2) {
    return { value: null, evidence: ev, status: 'needs_review', reviewReason: 'Company name was unreadable or noisy' };
  }

  // Check for common legitimate business entity keywords
  const businessEntityRegex = /\b(PVT\.?\s*LTD\.?|PRIVATE\s+LIMITED|LIMITED|LLP|INC\.?|CORP\.?|ENTERPRISES?|INDUSTRIES?|STRUCTURES?|SOLUTIONS?|TECHNOLOGIES?|SYSTEMS?|COMPANY|CO\.)\b/i;
  const hasEntityMarker = businessEntityRegex.test(cleaned);

  // If it's mostly garbage punctuation
  const symbolCount = (cleaned.match(/[^a-zA-Z0-9\s.&'-]/g) || []).length;
  if (symbolCount > 3) {
    return { value: cleaned, evidence: ev, status: 'needs_review', reviewReason: 'Contains unusual characters or OCR noise' };
  }

  return {
    value: cleaned,
    evidence: ev,
    status: hasEntityMarker || cleaned.length >= 3 ? 'valid' : 'needs_review',
    reviewReason: hasEntityMarker || cleaned.length >= 3 ? undefined : 'Uncertain company entity structure'
  };
}

/**
 * Validates contact numbers:
 * - Normalize valid Indian and international numbers (+91 XXXXX XXXXX)
 * - Keep original recognized value for review
 */
export function validateContactNumber(
  rawPhone: string | null | undefined,
  evidence: string = ''
): CardFieldEvidence {
  const text = (rawPhone || '').trim();
  const ev = (evidence || text).trim();

  if (!text) {
    return { value: null, evidence: ev, status: 'not_found' };
  }

  // Extract all digits
  const digits = text.replace(/\D/g, '');

  // Indian mobile check: 10 digits starting with 6,7,8,9
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    const formatted = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    return { value: formatted, evidence: ev, status: 'valid' };
  }

  // If 12 digits starting with 91 (e.g. 919884630789)
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    const mobile = digits.slice(2);
    const formatted = `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
    return { value: formatted, evidence: ev, status: 'valid' };
  }

  // If 11 digits starting with 0
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    const mobile = digits.slice(1);
    const formatted = `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
    return { value: formatted, evidence: ev, status: 'valid' };
  }

  // Landline or international format (e.g. 044-24567890 or 8-15 digits)
  if (digits.length >= 7 && digits.length <= 15) {
    return { value: text, evidence: ev, status: 'valid' };
  }

  return { value: text, evidence: ev, status: 'needs_review', reviewReason: 'Phone number length or format appears unusual' };
}

/**
 * Validates email addresses
 */
export function validateEmail(
  rawEmail: string | null | undefined,
  evidence: string = ''
): CardFieldEvidence {
  const text = (rawEmail || '').trim().toLowerCase();
  const ev = (evidence || text).trim();

  if (!text) {
    return { value: null, evidence: ev, status: 'not_found' };
  }

  // Standard email regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (emailRegex.test(text)) {
    return { value: text, evidence: ev, status: 'valid' };
  }

  // Try extracting email substring if embedded with noise
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (match) {
    return { value: match[0], evidence: ev, status: 'valid' };
  }

  return { value: text, evidence: ev, status: 'needs_review', reviewReason: 'Malformed email address' };
}

/**
 * Validates website URLs
 */
export function validateWebsite(
  rawWebsite: string | null | undefined,
  evidence: string = ''
): CardFieldEvidence {
  const text = (rawWebsite || '').trim();
  const ev = (evidence || text).trim();

  if (!text) {
    return { value: null, evidence: ev, status: 'not_found' };
  }

  // Clean leading spaces or bullet symbols
  const cleaned = text.replace(/^[•\-|*:\s]+/, '').trim().toLowerCase();

  // Pattern for valid web domains
  const domainPattern = /^(https?:\/\/)?(www\.)?[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+(\/[^\s]*)?$/i;
  if (domainPattern.test(cleaned)) {
    const formatted = cleaned.startsWith('http') ? cleaned : (cleaned.startsWith('www.') ? cleaned : `www.${cleaned}`);
    return { value: formatted, evidence: ev, status: 'valid' };
  }

  // Substring domain match
  const match = cleaned.match(/(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?/);
  if (match && !match[0].includes('@')) {
    return { value: match[0], evidence: ev, status: 'valid' };
  }

  return { value: cleaned, evidence: ev, status: 'needs_review', reviewReason: 'Malformed website address' };
}

/**
 * Validates postal/office address:
 * - Detect obvious corrupted text
 * - Preserve readable address components
 * - Flag ambiguity
 */
export function validateAddress(
  rawAddress: string | null | undefined,
  evidence: string = ''
): CardFieldEvidence {
  const text = (rawAddress || '').trim();
  const ev = (evidence || text).trim();

  if (!text) {
    return { value: null, evidence: ev, status: 'not_found' };
  }

  // Clean leading junk
  const cleaned = text.replace(/^[•\-|*:=~]+\s*/, '').trim();

  // Address indicators
  const hasPinCode = /\b\d{3}\s?\d{3}\b/.test(cleaned);
  const addressKeywords = [
    'No.', 'No:', 'No ', 'Road', 'Rd', 'Street', 'St', 'Avenue', 'Ave', 'Lane',
    'Nagar', 'Estate', 'Industrial', 'Floor', 'Block', 'Plot', 'Chennai', 'Bangalore',
    'Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Kolkata', 'Coimbatore', 'Tamil Nadu',
    'India', 'Near', 'Opp', 'Sector', 'Phase'
  ];
  const hasKeyword = addressKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(cleaned));

  // Check character entropy / corruption ratio
  const weirdChars = (cleaned.match(/[=~_^{}[\]|\\]/g) || []).length;
  if (weirdChars >= 3) {
    return { value: cleaned, evidence: ev, status: 'needs_review', reviewReason: 'Contains corrupted OCR symbols' };
  }

  // Unbalanced parentheses or stray brackets are typical signs of OCR fragments
  const openParens = (cleaned.match(/\(/g) || []).length;
  const closeParens = (cleaned.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    return { value: cleaned, evidence: ev, status: 'needs_review', reviewReason: 'Contains unbalanced brackets or corrupted text' };
  }

  // If it has pincode or multiple verified address keywords (e.g. Road + Industrial + City), mark valid
  const matchedKeywords = addressKeywords.filter(kw => new RegExp(`\\b${kw}\\b`, 'i').test(cleaned));
  if (hasPinCode || matchedKeywords.length >= 2) {
    return { value: cleaned, evidence: ev, status: 'valid' };
  }

  return { value: cleaned, evidence: ev, status: 'needs_review', reviewReason: 'Incomplete or unverified address' };
}

/**
 * Validates designation
 */
export function validateDesignation(
  rawDesig: string | null | undefined,
  evidence: string = ''
): CardFieldEvidence {
  const text = (rawDesig || '').trim();
  const ev = (evidence || text).trim();

  if (!text) {
    return { value: null, evidence: ev, status: 'not_found' };
  }

  const cleaned = text.replace(/^[•\-|*:=~]+\s*/, '').trim();
  if (/\d{4,}/.test(cleaned)) {
    return { value: null, evidence: ev, status: 'needs_review', reviewReason: 'Designation contains numeric data' };
  }

  return { value: cleaned, evidence: ev, status: 'valid' };
}

/**
 * Master validation pipeline for full card result
 */
export function validateExtractedCardData(
  rawResult: {
    customerName?: string | null;
    companyName?: string | null;
    designation?: string | null;
    contactNumber?: string | null;
    alternateContactNumber?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
    notes?: string | null;
    evidence?: Record<string, string>;
    visibleTextBlocks?: string[];
    [key: string]: any;
  },
  engine: 'gemini' | 'rule_based' | 'tesseract' = 'gemini'
): ValidatedCardResult {
  const ev = rawResult.evidence || {};

  const rawName = rawResult.customerName !== undefined ? rawResult.customerName : rawResult.customer_name;
  const rawCompany = rawResult.companyName !== undefined ? rawResult.companyName : rawResult.company_name;
  const rawDesig = rawResult.designation !== undefined ? rawResult.designation : rawResult.job_title;
  const rawPhone = rawResult.contactNumber !== undefined ? rawResult.contactNumber : (rawResult.contact_number || rawResult.phone);
  const rawAltPhone = rawResult.alternateContactNumber !== undefined ? rawResult.alternateContactNumber : (rawResult.alternate_contact_number || rawResult.alternate_number);
  const rawEmail = rawResult.email;
  const rawWebsite = rawResult.website;
  const rawAddress = rawResult.address;

  const nameField = validateCustomerName(rawName, ev.customerName || ev.customer_name);
  const companyField = validateCompanyName(rawCompany, ev.companyName || ev.company_name);
  const desigField = validateDesignation(rawDesig, ev.designation);
  const phoneField = validateContactNumber(rawPhone, ev.contactNumber || ev.contact_number);
  const altPhoneField = validateContactNumber(rawAltPhone, ev.alternateContactNumber || ev.alternate_number);
  const emailField = validateEmail(rawEmail, ev.email);
  const webField = validateWebsite(rawWebsite, ev.website);
  const addrField = validateAddress(rawAddress, ev.address);

  const reviewSummary: string[] = [];
  if (nameField.status === 'needs_review') reviewSummary.push(`Customer Name: ${nameField.reviewReason || 'Needs review'}`);
  if (companyField.status === 'needs_review') reviewSummary.push(`Company Name: ${companyField.reviewReason || 'Needs review'}`);
  if (phoneField.status === 'needs_review') reviewSummary.push(`Contact Number: ${phoneField.reviewReason || 'Needs review'}`);
  if (emailField.status === 'needs_review') reviewSummary.push(`Email: ${emailField.reviewReason || 'Needs review'}`);
  if (webField.status === 'needs_review') reviewSummary.push(`Website: ${webField.reviewReason || 'Needs review'}`);
  if (addrField.status === 'needs_review') reviewSummary.push(`Address: ${addrField.reviewReason || 'Needs review'}`);

  // Support phone_numbers array without combining
  const candidatePhones: string[] = [];
  if (Array.isArray(rawResult.phone_numbers)) {
    candidatePhones.push(...rawResult.phone_numbers.map((p: any) => String(p).trim()).filter(Boolean));
  }
  if (phoneField.value && !candidatePhones.includes(phoneField.value)) {
    candidatePhones.unshift(phoneField.value);
  }
  if (altPhoneField.value && !candidatePhones.includes(altPhoneField.value)) {
    candidatePhones.push(altPhoneField.value);
  }

  const validatedPhones: string[] = [];
  for (const p of candidatePhones) {
    const valRes = validateContactNumber(p);
    if (valRes.value && !validatedPhones.includes(valRes.value)) {
      validatedPhones.push(valRes.value);
    }
  }

  // Support emails array
  const candidateEmails: string[] = [];
  if (Array.isArray(rawResult.emails)) {
    candidateEmails.push(...rawResult.emails.map((e: any) => String(e).trim()).filter(Boolean));
  }
  if (emailField.value && !candidateEmails.includes(emailField.value)) {
    candidateEmails.unshift(emailField.value);
  }
  const validatedEmails: string[] = [];
  for (const em of candidateEmails) {
    const valRes = validateEmail(em);
    if (valRes.value && !validatedEmails.includes(valRes.value)) {
      validatedEmails.push(valRes.value);
    }
  }

  // review_required_fields[]
  const reviewRequiredFields: string[] = [];
  if (nameField.status === 'needs_review') reviewRequiredFields.push('person_name');
  if (companyField.status === 'needs_review') reviewRequiredFields.push('company_name');
  if (desigField.status === 'needs_review') reviewRequiredFields.push('designation');
  if (phoneField.status === 'needs_review') reviewRequiredFields.push('phone_numbers');
  if (emailField.status === 'needs_review') reviewRequiredFields.push('emails');
  if (webField.status === 'needs_review') reviewRequiredFields.push('website');
  if (addrField.status === 'needs_review') reviewRequiredFields.push('address');
  if (Array.isArray(rawResult.review_required_fields)) {
    for (const f of rawResult.review_required_fields) {
      if (!reviewRequiredFields.includes(f)) reviewRequiredFields.push(f);
    }
  }

  const allFieldList = [nameField, companyField, desigField, phoneField, emailField, webField, addrField];
  const validFieldsCount = allFieldList.filter(f => f.status === 'valid').length;
  const totalFieldsCount = allFieldList.length;

  const hasAnyValid = validFieldsCount > 0;
  const needsReviewCount = allFieldList.filter(f => f.status === 'needs_review').length;

  let overallStatus: 'valid' | 'needs_review' | 'unclear_image' = 'valid';
  if (!hasAnyValid && needsReviewCount > 0) {
    overallStatus = 'unclear_image';
  } else if (needsReviewCount > 0) {
    overallStatus = 'needs_review';
  }

  const rawTextCombined = rawResult.raw_text || rawResult.rawText || (rawResult.visibleTextBlocks ? rawResult.visibleTextBlocks.join('\n') : '');

  return {
    person_name: nameField.value || null,
    customerName: nameField.value || '',
    designation: desigField.value || null,
    company_name: companyField.value || null,
    companyName: companyField.value || '',
    phone_numbers: validatedPhones,
    contactNumber: validatedPhones[0] || phoneField.value || '',
    alternateContactNumber: validatedPhones[1] || altPhoneField.value || '',
    emails: validatedEmails,
    email: validatedEmails[0] || emailField.value || '',
    website: webField.value || '',
    address: addrField.value || '',
    raw_text: rawTextCombined,
    review_required_fields: reviewRequiredFields,
    notes: rawResult.notes || '',
    fields: {
      customerName: nameField,
      companyName: companyField,
      designation: desigField,
      contactNumber: phoneField,
      alternateContactNumber: altPhoneField,
      email: emailField,
      website: webField,
      address: addrField
    },
    visibleTextBlocks: rawResult.visibleTextBlocks || [],
    overallStatus,
    reviewSummary,
    validFieldsCount,
    totalFieldsCount,
    extractionEngine: engine,
    modelUsed: rawResult.modelUsed || (engine === 'gemini' ? (rawResult.ocrModel || 'gemini-3.7-flash') : undefined)
  };
}
