import { describe, expect, it } from 'vitest';
import {
  buildExcelWorksheet,
  buildStyledExcelBuffer,
  formatExportValue
} from '../../frontend/src/utils/exportUtils';
import { buildPagarBookMusterRollExcelData } from '../../frontend/src/utils/pagarBookMusterRollExporter';

describe('date & styled excel exports', () => {
  it('writes date-only values as real Excel date cells with dd/mm/yyyy formatting and bold headers', () => {
    const columns = [
      { key: 'employee', label: 'Employee' },
      { key: 'joiningDate', label: 'Joining Date' }
    ];
    const worksheet = buildExcelWorksheet([{ employee: 'VRM-017', joiningDate: '2026-06-05' }], columns);
    expect(worksheet.B2.t).toBe('d');
    expect(worksheet.B2.v).toBeInstanceOf(Date);
    expect(worksheet.B2.z).toBe('dd/mm/yyyy');

    const styledBuf = buildStyledExcelBuffer([{ employee: 'VRM-017', joiningDate: '2026-06-05' }], columns);
    const xmlStr = Buffer.from(styledBuf).toString('latin1');

    // Verify bold font definition exists in xl/styles.xml
    expect(xmlStr).toContain('<font><b/>');
    // Verify Row 1 header cells A1 and B1 have the bold style attribute applied
    expect(xmlStr).toMatch(/<c r="A1"[^>]*\bs="\d+"/);
    expect(xmlStr).toMatch(/<c r="B1"[^>]*\bs="\d+"/);
  });

  it('formats date columns for CSV/PDF without changing non-date strings', () => {
    expect(formatExportValue('2026-06-05', { key: 'date', label: 'Date' })).toBe('05/06/2026');
    expect(formatExportValue('2026-06-05', { key: 'reference', label: 'Reference' })).toBe('2026-06-05');
  });

  it('builds Attendance Muster Roll Excel with bold headings, employee separator gap rows, OT Amount, and Fine Amount', () => {
    const employees: any[] = [
      {
        id: 'emp-1',
        employeeId: 'VRM-002',
        firstName: 'Manoj Raj',
        lastName: 'Selvaraj',
        department: 'SALES',
        basicSalary: 15000,
        monthlyCtc: 30000,
        bankDetails: { bankName: 'HDFC BANK', accountNumber: '50100902299115', ifscCode: 'HDFC0007315' }
      },
      {
        id: 'emp-2',
        employeeId: 'VRM-003',
        firstName: 'Kaleeshwari',
        lastName: 'Perumal',
        department: 'Production',
        basicSalary: 12000,
        monthlyCtc: 20000,
        bankDetails: { bankName: 'Indian Bank', accountNumber: '7048648048', ifscCode: 'IDIB000P162' }
      }
    ];

    const attendanceRecords: any[] = [
      {
        id: 'att-1',
        employeeId: 'VRM-002',
        employeeName: 'Manoj Raj Selvaraj',
        department: 'SALES',
        date: '2026-11-02',
        checkIn: '09:00',
        checkOut: '20:00',
        workingHours: 11,
        status: 'Present',
        fineAmount: 100
      }
    ];

    const result = buildPagarBookMusterRollExcelData(
      employees,
      attendanceRecords,
      [],
      '2026-11-01',
      '2026-11-02',
      'BUSINZ',
      [],
      []
    );

    const headerRow = result.aoaRows[2];
    expect(headerRow).toContain('Employee Name');
    expect(headerRow).toContain('Employee ID');
    expect(headerRow).toContain('Total OT Amount');
    expect(headerRow).toContain('Total Fine Amount');

    // Employee 1 has 7 rows (indices 3..9): Status, IN, OUT, WH, OT Hrs, OT Amount, Fine Amount
    expect(result.aoaRows[3][1]).toBe('Manoj Raj Selvaraj');
    expect(result.aoaRows[3][7]).toBe('Attendance Status');
    expect(result.aoaRows[8][7]).toBe('OT Amount');
    expect(result.aoaRows[9][7]).toBe('Fine Amount');
    expect(result.aoaRows[9][9]).toBe('₹100');

    // Row index 10 is an empty separator row (gap) before Employee 2 at index 11
    expect(result.aoaRows[10]).toEqual([]);
    expect(result.aoaRows[11][1]).toBe('Kaleeshwari Perumal');

    // Verify bold styles in binary XLSX buffer
    const xmlStr = Buffer.from(result.styledBuffer).toString('latin1');
    expect(xmlStr).toContain('<font><b/>');
    expect(xmlStr).toMatch(/<c r="B3"[^>]*\bs="\d+"/); // Employee Name header bold
    expect(xmlStr).toMatch(/<c r="B4"[^>]*\bs="\d+"/); // Employee 1 Name bold
  });
});
