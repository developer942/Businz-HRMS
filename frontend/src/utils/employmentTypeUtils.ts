export const ALLOWED_EMPLOYMENT_TYPES = [
  'Full-Time',
  'Part-Time',
  'Contract',
  'Intern',
  'Permanent',
  'Probation',
  'Temporary',
] as const;

export type AllowedEmploymentType = typeof ALLOWED_EMPLOYMENT_TYPES[number];

/**
 * Maps any submitted raw employment type value (such as "Permanent", "FULL TIME", "INTERN", "Part Time", "Contract", "Probation", etc.)
 * to the exact PostgreSQL hr_employment_type enum string.
 */
export function mapToCanonicalEmploymentType(raw: unknown): AllowedEmploymentType {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'Full-Time';
  }
  const trimmed = raw.trim();
  const normalized = trimmed.toLowerCase().replace(/[\s_-]+/g, ' ');

  if (normalized === 'permanent' || normalized.includes('permanent')) {
    return 'Permanent';
  }
  if (normalized === 'full time' || normalized === 'fulltime' || normalized.includes('full') || normalized.includes('regular')) {
    return 'Full-Time';
  }
  if (normalized === 'part time' || normalized === 'parttime' || normalized.includes('part')) {
    return 'Part-Time';
  }
  if (normalized === 'intern' || normalized === 'internship' || normalized.includes('intern')) {
    return 'Intern';
  }
  if (normalized === 'contract' || normalized === 'contractor' || normalized.includes('contract')) {
    return 'Contract';
  }
  if (normalized === 'probation' || normalized === 'provisional' || normalized.includes('probation') || normalized.includes('provisional') || normalized.includes('trainee')) {
    return 'Probation';
  }
  if (normalized === 'temporary' || normalized === 'temp' || normalized.includes('temporary')) {
    return 'Temporary';
  }

  const directMatch = ALLOWED_EMPLOYMENT_TYPES.find(t => t.toLowerCase() === trimmed.toLowerCase());
  if (directMatch) return directMatch;

  return 'Full-Time';
}
