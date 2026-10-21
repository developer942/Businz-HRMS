import { describe, expect, it } from 'vitest';
import { formatDateDDMMYYYY, isValidISODate, normalizeToYYYYMMDD, parseDDMMYYYY } from '../../frontend/src/utils/dateUtils';

describe('shared date utilities', () => {
  it('strictly parses DD/MM/YYYY and validates leap years', () => {
    expect(parseDDMMYYYY('29/02/2024')).toBe('2024-02-29');
    expect(parseDDMMYYYY('29/02/2025')).toBeNull();
    expect(parseDDMMYYYY('5/06/2026')).toBeNull();
    expect(parseDDMMYYYY('31/04/2026')).toBeNull();
  });

  it('formats ISO date-only values without timezone shifts', () => {
    expect(formatDateDDMMYYYY('2026-06-05')).toBe('05/06/2026');
    expect(normalizeToYYYYMMDD('05/06/2026')).toBe('2026-06-05');
    expect(isValidISODate('2026-02-29')).toBe(false);
  });

  it('rejects ambiguous or invalid manual values', () => {
    expect(normalizeToYYYYMMDD('06/05/26')).toBe('');
    expect(normalizeToYYYYMMDD('June 5, 2026')).toBe('');
    expect(formatDateDDMMYYYY('31/02/2026')).toBe('');
  });
});
