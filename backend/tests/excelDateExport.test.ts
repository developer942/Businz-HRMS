import { describe, expect, it } from 'vitest';
import { buildExcelWorksheet, formatExportValue } from '../../frontend/src/utils/exportUtils';

describe('date exports', () => {
  it('writes date-only values as real Excel date cells with dd/mm/yyyy formatting', () => {
    const columns = [{ key: 'employee', label: 'Employee' }, { key: 'joiningDate', label: 'Joining Date' }];
    const worksheet = buildExcelWorksheet([{ employee: 'VRM-017', joiningDate: '2026-06-05' }], columns);
    expect(worksheet.B2.t).toBe('d');
    expect(worksheet.B2.v).toBeInstanceOf(Date);
    expect(worksheet.B2.z).toBe('dd/mm/yyyy');
  });

  it('formats date columns for CSV/PDF without changing non-date strings', () => {
    expect(formatExportValue('2026-06-05', { key: 'date', label: 'Date' })).toBe('05/06/2026');
    expect(formatExportValue('2026-06-05', { key: 'reference', label: 'Reference' })).toBe('2026-06-05');
  });
});
