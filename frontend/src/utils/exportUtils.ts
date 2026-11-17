// @ts-ignore
import html2canvas from 'html2canvas';
/**
 * Universal Cross-Platform Export Utilities for Businz Enterprise HRM
 * Fully compatible with Apple Mac (macOS, Safari, Apple Numbers), Windows (Microsoft Excel, Acrobat), iOS, and Android.
 * 
 * 1. Excel: Genuine OpenXML binary (.xlsx) using SheetJS - Opens natively in Apple Numbers & Excel
 * 2. CSV: Universal CSV with UTF-8 BOM - Preserves special characters and INR symbols
 * 3. PDF: High-fidelity vector PDF (.pdf) using jsPDF & autoTable - Native multi-page rendering
 * 4. Element PDF: Print/Save engine with hidden iframe to bypass Safari macOS pop-up blockers
 */

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY, isValidISODate, parseDDMMYYYY } from './dateUtils';

export interface ExportColumn {
  key: string;
  label: string;
}

const escapeCsv = (val: any): string => {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
};

const isDateColumn = (column: ExportColumn): boolean => {
  const words = `${column.key} ${column.label}`
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  return words.some(word => ['date', 'dob', 'birthday', 'timestamp', 'created', 'updated', 'submitted', 'reviewed'].includes(word));
};

const parseExportDate = (value: unknown): { date: Date; includesTime: boolean } | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { date: value, includesTime: true };
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  if (isValidISODate(clean)) {
    const [year, month, day] = clean.split('-').map(Number);
    return { date: new Date(year, month - 1, day), includesTime: false };
  }
  const parsedDmy = parseDDMMYYYY(clean);
  if (parsedDmy) {
    const [year, month, day] = parsedDmy.split('-').map(Number);
    return { date: new Date(year, month - 1, day), includesTime: false };
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(clean)) {
    const date = new Date(clean);
    if (!Number.isNaN(date.getTime())) return { date, includesTime: true };
  }
  return null;
};

export const formatExportValue = (value: unknown, column: ExportColumn): unknown => {
  if (value === null || value === undefined) return '';
  if (!isDateColumn(column)) return value;
  const parsed = parseExportDate(value);
  if (!parsed) return value;
  return parsed.includesTime ? formatDateTimeDDMMYYYY(parsed.date) : formatDateDDMMYYYY(parsed.date);
};

export interface XlsxBoldStyleOptions {
  /** 1-based row numbers where every cell in the row should be styled bold (defaults to [1]) */
  boldRows?: number[];
  /** Specific cell coordinates (e.g. 'A4', 'B4', 'H5') that should be styled bold */
  boldCells?: string[];
}

const CRC32_LOOKUP_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_LOOKUP_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function readUInt16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readUInt32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset]) |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    ((buf[offset + 3] << 24) >>> 0)
  ) >>> 0;
}

function writeUInt32LE(buf: Uint8Array, value: number, offset: number): void {
  const v = value >>> 0;
  buf[offset] = v & 0xFF;
  buf[offset + 1] = (v >>> 8) & 0xFF;
  buf[offset + 2] = (v >>> 16) & 0xFF;
  buf[offset + 3] = (v >>> 24) & 0xFF;
}

/**
 * Injects genuine OpenXML bold font & cellXf styles into a SheetJS .xlsx binary buffer
 * so that all header rows (and any specified label/identifier cells) open in BOLD
 * in Microsoft Excel, Apple Numbers, Google Sheets, and LibreOffice.
 */
export function applyBoldStylesToXlsxBuffer(
  rawBuffer: ArrayBuffer | Uint8Array,
  options?: XlsxBoldStyleOptions
): Uint8Array {
  const input = rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer);
  const boldRowSet = new Set<number>(options?.boldRows && options.boldRows.length > 0 ? options.boldRows : [1]);
  const boldCellSet = new Set<string>((options?.boldCells || []).map(c => c.toUpperCase()));

  try {
    interface ZipLocalEntry {
      header: Uint8Array;
      nameBytes: Uint8Array;
      extraBytes: Uint8Array;
      dataBytes: Uint8Array;
      name: string;
      newOffset: number;
    }

    interface ZipCentralEntry {
      header: Uint8Array;
      nameBytes: Uint8Array;
      extraBytes: Uint8Array;
      commentBytes: Uint8Array;
      name: string;
    }

    const decoder = new TextDecoder('utf-8');
    const encoder = new TextEncoder();
    const localEntries: ZipLocalEntry[] = [];
    let offset = 0;

    while (offset + 30 <= input.length && readUInt32LE(input, offset) === 0x04034B50) {
      const method = readUInt16LE(input, offset + 8);
      if (method !== 0) {
        // Fallback safely if compressed entries are encountered
        return input;
      }
      const csize = readUInt32LE(input, offset + 18);
      const fnlen = readUInt16LE(input, offset + 26);
      const exlen = readUInt16LE(input, offset + 28);
      const header = input.slice(offset, offset + 30);
      const nameStart = offset + 30;
      const extraStart = nameStart + fnlen;
      const dataStart = extraStart + exlen;
      const nextOffset = dataStart + csize;
      if (nextOffset > input.length) return input;

      const nameBytes = input.slice(nameStart, extraStart);
      const extraBytes = input.slice(extraStart, dataStart);
      const dataBytes = input.slice(dataStart, nextOffset);
      const name = decoder.decode(nameBytes);

      localEntries.push({
        header,
        nameBytes,
        extraBytes,
        dataBytes,
        name,
        newOffset: 0
      });
      offset = nextOffset;
    }

    const centralEntries: ZipCentralEntry[] = [];
    while (offset + 46 <= input.length && readUInt32LE(input, offset) === 0x02014B50) {
      const fnlen = readUInt16LE(input, offset + 28);
      const exlen = readUInt16LE(input, offset + 30);
      const cmlen = readUInt16LE(input, offset + 32);
      const header = input.slice(offset, offset + 46);
      const nameStart = offset + 46;
      const extraStart = nameStart + fnlen;
      const commentStart = extraStart + exlen;
      const nextOffset = commentStart + cmlen;
      if (nextOffset > input.length) return input;

      const nameBytes = input.slice(nameStart, extraStart);
      const extraBytes = input.slice(extraStart, commentStart);
      const commentBytes = input.slice(commentStart, nextOffset);
      const name = decoder.decode(nameBytes);

      centralEntries.push({
        header,
        nameBytes,
        extraBytes,
        commentBytes,
        name
      });
      offset = nextOffset;
    }

    if (offset + 22 > input.length || readUInt32LE(input, offset) !== 0x06054B50) {
      return input;
    }
    const eocdBytes = input.slice(offset);

    const stylesEntry = localEntries.find(e => e.name === 'xl/styles.xml');
    if (!stylesEntry) return input;

    let stylesXml = decoder.decode(stylesEntry.dataBytes);
    const fontsMatch = stylesXml.match(/<fonts count="(\d+)">([\s\S]*?)<\/fonts>/);
    const cellXfsMatch = stylesXml.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
    if (!fontsMatch || !cellXfsMatch) return input;

    const origFontCount = parseInt(fontsMatch[1], 10);
    const boldFontId = origFontCount;
    const boldFontXml = `<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`;
    stylesXml = stylesXml.replace(
      /<fonts count="\d+">[\s\S]*?<\/fonts>/,
      `<fonts count="${origFontCount + 1}">${fontsMatch[2]}${boldFontXml}</fonts>`
    );

    const origXfCount = parseInt(cellXfsMatch[1], 10);
    const boldXfId = origXfCount;
    const boldXfXml = `<xf numFmtId="0" fontId="${boldFontId}" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>`;
    stylesXml = stylesXml.replace(
      /<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/,
      `<cellXfs count="${origXfCount + 1}">${cellXfsMatch[2]}${boldXfXml}</cellXfs>`
    );

    stylesEntry.dataBytes = encoder.encode(stylesXml);

    for (const entry of localEntries) {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name)) continue;
      let sheetXml = decoder.decode(entry.dataBytes);

      sheetXml = sheetXml.replace(
        /<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g,
        (fullRow, rStr, rowAttrs, rowInner) => {
          const rowNum = parseInt(rStr, 10);
          const isEntireRowBold = boldRowSet.has(rowNum);

          const updatedInner = rowInner.replace(
            /<c r="([A-Z]+\d+)"([^>]*?)(\/?)>/g,
            (fullCell: string, cellRef: string, cellAttrs: string, selfClose: string) => {
              if (!isEntireRowBold && !boldCellSet.has(cellRef.toUpperCase())) {
                return fullCell;
              }
              let nextAttrs = cellAttrs;
              if (/\bs="\d+"/.test(nextAttrs)) {
                nextAttrs = nextAttrs.replace(/\bs="\d+"/, `s="${boldXfId}"`);
              } else {
                nextAttrs = ` s="${boldXfId}"${nextAttrs}`;
              }
              return `<c r="${cellRef}"${nextAttrs}${selfClose}>`;
            }
          );

          return `<row r="${rStr}"${rowAttrs}>${updatedInner}</row>`;
        }
      );

      entry.dataBytes = encoder.encode(sheetXml);
    }

    // Recompute CRC32, sizes, and offsets for all entries
    const entryByName = new Map<string, ZipLocalEntry>();
    let currentOffset = 0;
    for (const entry of localEntries) {
      entry.newOffset = currentOffset;
      const crc = computeCrc32(entry.dataBytes);
      const size = entry.dataBytes.length;
      writeUInt32LE(entry.header, crc, 14);
      writeUInt32LE(entry.header, size, 18);
      writeUInt32LE(entry.header, size, 22);
      entryByName.set(entry.name, entry);
      currentOffset += entry.header.length + entry.nameBytes.length + entry.extraBytes.length + size;
    }

    const cdStartOffset = currentOffset;
    let cdTotalSize = 0;
    for (const cd of centralEntries) {
      const matched = entryByName.get(cd.name);
      if (matched) {
        const crc = readUInt32LE(matched.header, 14);
        const size = matched.dataBytes.length;
        writeUInt32LE(cd.header, crc, 16);
        writeUInt32LE(cd.header, size, 20);
        writeUInt32LE(cd.header, size, 24);
        writeUInt32LE(cd.header, matched.newOffset, 42);
      }
      cdTotalSize += cd.header.length + cd.nameBytes.length + cd.extraBytes.length + cd.commentBytes.length;
    }

    writeUInt32LE(eocdBytes, cdTotalSize, 12);
    writeUInt32LE(eocdBytes, cdStartOffset, 16);

    const totalOutputLength = cdStartOffset + cdTotalSize + eocdBytes.length;
    const output = new Uint8Array(totalOutputLength);
    let writePos = 0;

    for (const entry of localEntries) {
      output.set(entry.header, writePos); writePos += entry.header.length;
      output.set(entry.nameBytes, writePos); writePos += entry.nameBytes.length;
      output.set(entry.extraBytes, writePos); writePos += entry.extraBytes.length;
      output.set(entry.dataBytes, writePos); writePos += entry.dataBytes.length;
    }

    for (const cd of centralEntries) {
      output.set(cd.header, writePos); writePos += cd.header.length;
      output.set(cd.nameBytes, writePos); writePos += cd.nameBytes.length;
      output.set(cd.extraBytes, writePos); writePos += cd.extraBytes.length;
      output.set(cd.commentBytes, writePos); writePos += cd.commentBytes.length;
    }

    output.set(eocdBytes, writePos);
    return output;
  } catch (err) {
    console.warn('Could not apply bold styles to XLSX buffer, returning unstyled buffer:', err);
    return input;
  }
}

export const buildExcelWorksheet = (data: Record<string, any>[], cols: ExportColumn[]): XLSX.WorkSheet => {
  const sheetData = data.map(item => {
    const row: Record<string, any> = {};
    cols.forEach(column => {
      const raw = item[column.key];
      const parsed = isDateColumn(column) ? parseExportDate(raw) : null;
      row[column.label] = parsed?.date ?? (raw !== null && raw !== undefined ? raw : '');
    });
    return row;
  });
  const worksheet = XLSX.utils.json_to_sheet(sheetData, { cellDates: true });
  cols.forEach((column, columnIndex) => {
    const headerAddr = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    if (worksheet[headerAddr]) {
      (worksheet[headerAddr] as any).s = { font: { bold: true } };
    }
    if (!isDateColumn(column)) return;
    data.forEach((item, rowIndex) => {
      const parsed = parseExportDate(item[column.key]);
      if (!parsed) return;
      const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex });
      if (worksheet[address]) worksheet[address].z = parsed.includesTime ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy';
    });
  });
  worksheet['!cols'] = cols.map(column => {
    const maxValLen = Math.max(column.label.length, ...data.slice(0, 50).map(item => String(item[column.key] ?? '').length));
    return { wch: Math.min(Math.max(maxValLen + 4, 14), 45) };
  });
  return worksheet;
};

/**
 * Downloads data as a universal CSV file with UTF-8 BOM
 * Guaranteed to open cleanly in Excel, Numbers, and text editors on Mac and Windows without encoding issues.
 */
export function downloadCSV(
  data: Record<string, any>[],
  filename: string,
  columns?: ExportColumn[]
): void {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const cols = columns && columns.length > 0
    ? columns
    : Object.keys(data[0]).map(k => ({ key: k, label: k }));

  const headers = cols.map(c => escapeCsv(c.label)).join(',');
  const rows = data.map(item => cols.map(c => escapeCsv(formatExportValue(item[c.key], c))).join(','));

  // UTF-8 BOM (\uFEFF) ensures Excel & Numbers on macOS/Windows properly display INR symbols and unicode
  const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const cleanFilename = filename.replace(/\.(csv|xlsx?)$/i, '') + '.csv';
  triggerFileDownload(blob, cleanFilename);
}

/**
 * Downloads data as a genuine binary OpenXML Excel workbook (.xlsx)
 * Opens natively in:
 * - Apple Numbers on MacBook (macOS)
 * - Microsoft Excel for Mac
 * - Microsoft Excel on Windows (without XML/extension warnings)
 * - Google Sheets & Mobile Excel
 */
export function buildStyledExcelBuffer(
  data: Record<string, any>[],
  columns?: ExportColumn[]
): Uint8Array {
  const cols = columns && columns.length > 0
    ? columns
    : Object.keys(data[0] || {}).map(k => ({ key: k, label: k }));
  const ws = buildExcelWorksheet(data, cols);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  const rawBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return applyBoldStylesToXlsxBuffer(rawBuffer, { boldRows: [1] });
}

export function downloadExcel(
  data: Record<string, any>[],
  filename: string,
  columns?: ExportColumn[]
): void {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const styledBuffer = buildStyledExcelBuffer(data, columns);
  const cleanFilename = filename.replace(/\.(xlsx?|xls)$/i, '') + '.xlsx';

  const blob = new Blob([styledBuffer as unknown as BlobPart], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  triggerFileDownload(blob, cleanFilename);
}

export function exportToExcel(
  data: Record<string, any>[],
  secondArg: string | Array<{ key: string; label?: string; header?: string }>,
  thirdArg?: string | Array<{ key: string; label?: string; header?: string }>
): void {
  const filename = typeof secondArg === 'string' ? secondArg : (typeof thirdArg === 'string' ? thirdArg : 'Report');
  const rawCols = Array.isArray(secondArg) ? secondArg : (Array.isArray(thirdArg) ? thirdArg : undefined);
  const cols = rawCols?.map(c => ({ key: c.key, label: c.label || c.header || c.key }));
  downloadExcel(data, filename, cols);
}

export function exportToPDF(
  data: Record<string, any>[],
  secondArg: string | Array<{ key: string; label?: string; header?: string }>,
  thirdArg?: string,
  fourthArg?: string | Array<{ key: string; label?: string; header?: string }>,
  fifthArg?: string
): void {
  if (Array.isArray(secondArg)) {
    const cols = secondArg.map(c => ({ key: c.key, label: c.label || c.header || c.key }));
    const title = thirdArg || 'Report';
    const filename = typeof fourthArg === 'string' ? fourthArg : 'Report';
    downloadPDF(data, title, filename, cols, fifthArg || 'Businz');
  } else {
    const title = secondArg || 'Report';
    const filename = thirdArg || 'Report';
    const rawCols = Array.isArray(fourthArg) ? fourthArg : undefined;
    const cols = rawCols?.map(c => ({ key: c.key, label: c.label || c.header || c.key }));
    downloadPDF(data, title, filename, cols, fifthArg || 'Businz');
  }
}

export const exportToCSV = downloadCSV;

/**
 * Generates an official, publication-quality vector PDF document (.pdf)
 * Compatible with Apple Mac Preview, Adobe Acrobat, Safari, Chrome, and mobile devices.
 */
export function downloadPDF(
  data: Record<string, any>[],
  title: string,
  filename: string,
  columns?: ExportColumn[],
  companyName: string = 'Businz'
): void {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const cols = columns && columns.length > 0
    ? columns
    : Object.keys(data[0] || {}).map(k => ({ key: k, label: k }));

  const isLandscape = cols.length > 5;
  const isWideTable = cols.length > 12;

  // Dynamically size page width for wide tables (e.g., 17-31 day Muster Roll reports) so columns never wrap mid-word
  const pdfFormat: string | [number, number] = !isWideTable
    ? 'a4'
    : cols.length <= 20
    ? 'a3'
    : [Math.max(1190.55, 320 + cols.length * 30), 841.89];

  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: pdfFormat
  });

  const primaryTeal: [number, number, number] = [14, 116, 144]; // #0E7490
  const leftMargin = isWideTable ? 28 : 36;

  // 1. Company Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryTeal);
  doc.text(companyName, leftMargin, 36);

  // 2. Report Title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59); // Slate 800
  doc.text(title, leftMargin, 54);

  // 3. Metadata Subtitle
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // Slate 500
  const dateStr = formatDateDDMMYYYY(new Date());
  doc.text(`Generated: ${dateStr} • Total Records: ${data.length}`, leftMargin, 68);

  // 4. Format column labels cleanly so wide tables don't break mid-word
  const formatPdfHeaderLabel = (col: ExportColumn): string => {
    const rawLabel = String(col.label || '').trim();
    if (!isWideTable) return rawLabel;

    // Compact DD/MM/YYYY date headers to DD/MM in wide Muster Roll tables
    const dmyMatch = rawLabel.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmyMatch) {
      return `${dmyMatch[1]}/${dmyMatch[2]}`;
    }
    const dayParenMatch = rawLabel.match(/^(\d{2})\s*\(([A-Za-z]+)\)$/);
    if (dayParenMatch) {
      return `${dayParenMatch[1]}\n${dayParenMatch[2]}`;
    }
    if (rawLabel === 'Present (P/WFH/FV)') return 'Present\n(P/WFH/FV)';
    if (rawLabel === 'Absent (A)') return 'Absent\n(A)';
    if (rawLabel === 'Holidays (H)') return 'Holidays\n(H)';
    if (rawLabel === 'Attendance %' || rawLabel === 'Attendance Rate (%)') return 'Att. %';
    if (rawLabel === 'Present (P)') return 'Present\n(P)';
    if (rawLabel === 'Half Day (HD)') return 'Half Day\n(HD)';
    if (rawLabel === 'Paid Leave (PL)') return 'Paid Leave\n(PL)';
    if (rawLabel === 'Absent / LOP (A/UL)') return 'Absent\n(A/UL)';
    if (rawLabel === 'Holiday (H)') return 'Holiday\n(H)';
    if (rawLabel === 'Work From Home (WFH)') return 'WFH';
    if (rawLabel === 'Field Visit (FV)') return 'Field\nVisit';
    return rawLabel;
  };

  // 5. Build intelligent per-column alignment & minimum widths
  const columnStyles: Record<number, any> = {};
  const colAlignments: Record<number, 'left' | 'center' | 'right'> = {};

  cols.forEach((col, idx) => {
    const keyLower = String(col.key || '').toLowerCase();
    const labelLower = String(col.label || '').toLowerCase();

    if (keyLower === 'sno' || labelLower === 's.no' || labelLower === 's.n.' || labelLower === '#') {
      colAlignments[idx] = 'center';
      columnStyles[idx] = { halign: 'center', cellWidth: isWideTable ? 30 : 34 };
    } else if (
      keyLower === 'empid' ||
      keyLower === 'employeeid' ||
      labelLower === 'employee id' ||
      labelLower === 'employee code' ||
      labelLower === 'record id'
    ) {
      colAlignments[idx] = 'center';
      columnStyles[idx] = { halign: 'center', minCellWidth: isWideTable ? 58 : 66 };
    } else if (
      keyLower === 'name' ||
      keyLower === 'empname' ||
      keyLower === 'employeename' ||
      labelLower.includes('employee name')
    ) {
      colAlignments[idx] = 'left';
      columnStyles[idx] = { halign: 'left', minCellWidth: isWideTable ? 110 : 115 };
    } else if (
      keyLower === 'dept' ||
      keyLower === 'department' ||
      keyLower === 'desig' ||
      keyLower === 'designation' ||
      labelLower === 'department' ||
      labelLower === 'designation'
    ) {
      colAlignments[idx] = 'left';
      columnStyles[idx] = { halign: 'left', minCellWidth: isWideTable ? 74 : 82 };
    } else if (
      keyLower.startsWith('day_') ||
      /^\d{2}\/\d{2}(\/\d{4})?$/.test(col.label) ||
      /^\d{2}\s*\([A-Za-z]+\)$/.test(col.label)
    ) {
      colAlignments[idx] = 'center';
      columnStyles[idx] = { halign: 'center', minCellWidth: 26 };
    } else if (
      keyLower === 'present' ||
      keyLower === 'absent' ||
      keyLower === 'holiday' ||
      keyLower === 'rate' ||
      keyLower.startsWith('total') ||
      labelLower.includes('amount') ||
      labelLower.includes('hours') ||
      labelLower.includes('present') ||
      labelLower.includes('absent') ||
      labelLower.includes('holiday') ||
      labelLower.includes('attendance %') ||
      labelLower.includes('rate')
    ) {
      colAlignments[idx] = 'center';
      columnStyles[idx] = { halign: 'center', minCellWidth: isWideTable ? 46 : 56 };
    } else {
      colAlignments[idx] = 'left';
    }
  });

  const tableHead = [cols.map(c => formatPdfHeaderLabel(c))];
  const tableBody = data.map(item => cols.map(c => {
    const val = formatExportValue(item[c.key], c);
    return val !== null && val !== undefined && val !== '' ? String(val) : '-';
  }));

  const renderTable = typeof autoTable === 'function' ? autoTable : ((autoTable as any)?.default || (autoTable as any)?.autoTable);
  renderTable(doc, {
    startY: 80,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: primaryTeal,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: isWideTable ? 7.8 : 8.5,
      valign: 'middle',
      halign: 'left'
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: isWideTable ? 7.6 : 8,
      valign: 'middle'
    },
    columnStyles,
    alternateRowStyles: {
      fillColor: [248, 250, 252] // #F8FAFC
    },
    styles: {
      overflow: 'linebreak',
      cellPadding: isWideTable ? 3.8 : 4.5,
      lineColor: [226, 232, 240], // #E2E8F0
      lineWidth: 0.5
    },
    margin: { top: 38, right: leftMargin, bottom: 34, left: leftMargin },
    didParseCell: (hookData: any) => {
      const colIdx = hookData.column?.index;
      if (colIdx !== undefined && colAlignments[colIdx]) {
        hookData.cell.styles.halign = colAlignments[colIdx];
      }
      // Color-code short attendance status codes in Muster Roll PDF cells
      if (hookData.section === 'body' && colIdx !== undefined) {
        const colDef = cols[colIdx];
        if (colDef && (String(colDef.key).startsWith('day_') || isWideTable)) {
          const rawText = String(hookData.cell.raw || '').trim().toUpperCase();
          if (rawText === 'P' || rawText === '1P') {
            hookData.cell.styles.textColor = [21, 128, 61]; // Green
            hookData.cell.styles.fontStyle = 'bold';
          } else if (rawText === 'A' || rawText === 'UL') {
            hookData.cell.styles.textColor = [185, 28, 28]; // Red
            hookData.cell.styles.fontStyle = 'bold';
          } else if (rawText === 'H' || rawText === 'WO') {
            hookData.cell.styles.textColor = [30, 64, 175]; // Blue
            hookData.cell.styles.fontStyle = 'bold';
          } else if (rawText === 'HD') {
            hookData.cell.styles.textColor = [194, 65, 12]; // Orange
            hookData.cell.styles.fontStyle = 'bold';
          } else if (rawText === 'PL' || rawText === 'WFH' || rawText === 'FV') {
            hookData.cell.styles.textColor = [14, 116, 144]; // Teal
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
    didDrawPage: () => {
      // Clean footer on every page
      const pageSize = doc.internal.pageSize;
      const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(`${companyName} • Confidential Enterprise Report`, leftMargin, pageHeight - 15);
      const pageStr = `Page ${doc.internal.pages.length - 1}`;
      const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
      doc.text(pageStr, pageWidth - leftMargin - doc.getTextWidth(pageStr), pageHeight - 15);
    }
  });

  const cleanFilename = filename.replace(/\.(pdf|xlsx?|csv)$/i, '') + '.pdf';
  doc.save(cleanFilename);
}

/**
 * Directly downloads an HTML element (e.g. Payslip) as a PDF file
 * without opening the browser print dialog.
 * Ensures single-page documents (like Payslips) always fit cleanly on 1 A4 page
 * without slicing rows or signatures across pages.
 */
export async function downloadElementAsDirectPdf(
  elementId: string,
  filename: string,
  companyName: string = 'Businz'
): Promise<void> {
  const elem = document.getElementById(elementId);
  if (!elem) {
    console.error(`Document content "${elementId}" not found.`);
    return;
  }

  try {
    const canvas = await html2canvas(elem, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: Math.max(elem.scrollWidth || 780, 960),
      onclone: (clonedDoc) => {
        const clonedElem = clonedDoc.getElementById(elementId);
        if (clonedElem) {
          clonedElem.style.width = '740px';
          clonedElem.style.maxWidth = '740px';
          clonedElem.style.padding = '18px 22px';
          clonedElem.style.margin = '0 auto';
          clonedElem.style.boxSizing = 'border-box';
          const desktopTables = clonedElem.querySelectorAll<HTMLElement>('.payslip-table-desktop');
          desktopTables.forEach(t => { t.style.display = 'block'; });
          const mobileTables = clonedElem.querySelectorAll<HTMLElement>('.payslip-tables-mobile');
          mobileTables.forEach(t => { t.style.display = 'none'; });
        }
      }
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.96);

    // Standard A4 dimensions in points: 595.28 x 841.89
    const pdfWidth = 595.28;
    const pdfHeight = 841.89;
    const margin = 20;
    const maxWidth = pdfWidth - margin * 2;
    const maxHeight = pdfHeight - margin * 2;
    const rawHeight = (canvas.height * maxWidth) / canvas.width;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4'
    });

    const isSinglePageTarget =
      elementId.toLowerCase().includes('payslip') ||
      elementId.toLowerCase().includes('receipt') ||
      rawHeight <= maxHeight * 1.55;

    if (rawHeight <= maxHeight) {
      doc.addImage(imgData, 'JPEG', margin, margin, maxWidth, rawHeight, undefined, 'FAST');
    } else if (isSinglePageTarget) {
      // Scale proportionally so the entire Payslip fits cleanly onto 1 single A4 page without cropping
      const scaleRatio = maxHeight / rawHeight;
      const drawWidth = maxWidth * scaleRatio;
      const drawHeight = maxHeight;
      const offsetX = margin + (maxWidth - drawWidth) / 2;
      doc.addImage(imgData, 'JPEG', offsetX, margin, drawWidth, drawHeight, undefined, 'FAST');
    } else {
      let heightLeft = rawHeight;
      let position = margin;

      doc.addImage(imgData, 'JPEG', margin, position, maxWidth, rawHeight, undefined, 'FAST');
      heightLeft -= maxHeight;

      while (heightLeft > 5) {
        position = heightLeft - rawHeight + margin;
        doc.addPage();
        doc.addImage(imgData, 'JPEG', margin, position, maxWidth, rawHeight, undefined, 'FAST');
        heightLeft -= maxHeight;
      }
    }

    const cleanFilename = (filename || 'Document').replace(/\.pdf$/i, '') + '.pdf';
    doc.save(cleanFilename);
  } catch (err) {
    console.warn('html2canvas direct PDF download failed, falling back to print dialog:', err);
    printElement(elementId, filename, companyName);
  }
}

/**
 * Downloads element as a direct PDF binary file (never opens print dialog).
 */
export async function downloadElementAsPDF(
  elementId: string,
  filename: string,
  companyName: string = 'Businz'
): Promise<void> {
  return downloadElementAsDirectPdf(elementId, filename, companyName);
}

/**
 * Opens native browser print dialog for an element.
 */
export function printElement(
  elementId: string,
  title: string,
  companyName: string = 'Businz'
): void {
  const elem = document.getElementById(elementId);
  if (!elem) {
    alert(`Document content "${elementId}" not found.`);
    return;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} - ${escapeHtml(companyName)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;700&display=swap');
    
    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      font-family: 'Plus Jakarta Sans', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #0F172A;
      padding: 12px;
      margin: 0;
      background: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .payslip-container {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 16px 20px !important;
      max-width: 760px;
      margin: 0 auto;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .payslip-table-desktop {
      display: block !important;
    }

    .payslip-tables-mobile {
      display: none !important;
    }

    img {
      max-width: 100%;
      height: auto;
      object-fit: contain !important;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: auto;
    }

    th, td {
      word-wrap: break-word;
    }

    .company-doc-header-root,
    .employee-details-grid-doc,
    .company-netpay-section,
    .company-authorized-signatory {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    @media print {
      @page {
        margin: 8mm;
        size: A4 portrait;
      }
      html, body {
        padding: 0;
        margin: 0;
        width: 100%;
      }
      .payslip-container {
        max-width: 100% !important;
        padding: 14px 18px !important;
        border: 1px solid #cbd5e1 !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .no-print {
        display: none !important;
      }
      .page-break-avoid {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  ${elem.outerHTML}
  <div class="no-print" style="margin-top: 24px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 24px; background: #0E7490; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px;">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`;


  // Use hidden iframe first to prevent Apple Safari pop-up blockers
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
        }, 1200);
      }, 350);
      return;
    }
  } catch (err) {
    console.warn('Iframe print failed, falling back to window.open:', err);
  }

  // Fallback to window.open
  const pdfWindow = window.open('', '_blank', 'width=900,height=750');
  if (pdfWindow) {
    pdfWindow.document.open();
    pdfWindow.document.write(html);
    pdfWindow.document.close();
    setTimeout(() => {
      pdfWindow.print();
    }, 400);
  } else {
    alert('Pop-up was blocked. Please allow pop-ups in Safari / Chrome to save as PDF.');
  }
}

function escapeHtml(unsafe: string): string {
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&#39;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface GenerateOfferLetterPdfOptions {
  companyName: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyWebsite?: string;
  logoUrl?: string;
  signatureImageUrl?: string;
  stampImageUrl?: string;
  candidateName: string;
  employeeId?: string;
  designation: string;
  department: string;
  joiningDate: string;
  employmentType?: string;
  workLocation?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  salutation?: string;
  candidateAddress?: string;
  acceptanceDeadline?: string;
  offerDate?: string;
  refNo?: string;
  signatoryName?: string;
  signatoryDesignation?: string;
  compensationRows: Array<{ label: string; amount: number }>;
  monthlyCtc: number;
  annualCtc: number;
  customizedClauses?: string;
}

interface LoadedImageInfo {
  dataUrl: string;
  format: 'PNG' | 'JPEG';
  width: number;
  height: number;
  aspectRatio: number;
}

async function safeLoadImage(src?: string, trimWhitespace = false): Promise<LoadedImageInfo | null> {
  if (!src || typeof src !== 'string' || !src.trim()) return null;
  const cleanSrc = src.trim();

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      if (cleanSrc.startsWith('data:image/')) {
        const isJpeg = cleanSrc.includes('image/jpeg') || cleanSrc.includes('image/jpg');
        resolve({
          dataUrl: cleanSrc,
          format: isJpeg ? 'JPEG' : 'PNG',
          width: 100,
          height: 100,
          aspectRatio: 1,
        });
      } else {
        resolve(null);
      }
    }, 2500);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const naturalW = img.naturalWidth || img.width || 100;
        const naturalH = img.naturalHeight || img.height || 100;
        const canvas = document.createElement('canvas');
        canvas.width = naturalW;
        canvas.height = naturalH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          if (cleanSrc.startsWith('data:image/')) {
            const isJpeg = cleanSrc.includes('image/jpeg') || cleanSrc.includes('image/jpg');
            resolve({
              dataUrl: cleanSrc,
              format: isJpeg ? 'JPEG' : 'PNG',
              width: naturalW,
              height: naturalH,
              aspectRatio: naturalW / naturalH,
            });
          } else {
            resolve(null);
          }
          return;
        }
        ctx.drawImage(img, 0, 0);

        let exportCanvas = canvas;
        let exportW = naturalW;
        let exportH = naturalH;

        if (trimWhitespace) {
          try {
            const imgData = ctx.getImageData(0, 0, naturalW, naturalH);
            const data = imgData.data;
            let minX = naturalW;
            let minY = naturalH;
            let maxX = -1;
            let maxY = -1;

            for (let y = 0; y < naturalH; y++) {
              for (let x = 0; x < naturalW; x++) {
                const idx = (y * naturalW + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];

                const isTransparent = a < 25;
                const isPureWhite = r > 248 && g > 248 && b > 248 && a > 230;

                if (!isTransparent && !isPureWhite) {
                  if (x < minX) minX = x;
                  if (x > maxX) maxX = x;
                  if (y < minY) minY = y;
                  if (y > maxY) maxY = y;
                }
              }
            }

            if (maxX >= minX && maxY >= minY) {
              const pad = 4;
              const cropX = Math.max(0, minX - pad);
              const cropY = Math.max(0, minY - pad);
              const cropW = Math.min(naturalW - cropX, (maxX - minX + 1) + pad * 2);
              const cropH = Math.min(naturalH - cropY, (maxY - minY + 1) + pad * 2);

              const croppedCanvas = document.createElement('canvas');
              croppedCanvas.width = cropW;
              croppedCanvas.height = cropH;
              const croppedCtx = croppedCanvas.getContext('2d');
              if (croppedCtx) {
                croppedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                exportCanvas = croppedCanvas;
                exportW = cropW;
                exportH = cropH;
              }
            }
          } catch {
            // fallback gracefully to standard uncropped canvas
          }
        }

        const isJpeg = cleanSrc.toLowerCase().endsWith('.jpg') || cleanSrc.toLowerCase().endsWith('.jpeg') || cleanSrc.startsWith('data:image/jpeg');
        const format: 'PNG' | 'JPEG' = isJpeg ? 'JPEG' : 'PNG';
        const mime = isJpeg ? 'image/jpeg' : 'image/png';
        const dataUrl = exportCanvas.toDataURL(mime);
        resolve({
          dataUrl,
          format,
          width: exportW,
          height: exportH,
          aspectRatio: exportW / exportH,
        });
      } catch (e) {
        if (cleanSrc.startsWith('data:image/')) {
          const isJpeg = cleanSrc.includes('image/jpeg') || cleanSrc.includes('image/jpg');
          resolve({
            dataUrl: cleanSrc,
            format: isJpeg ? 'JPEG' : 'PNG',
            width: img.naturalWidth || 100,
            height: img.naturalHeight || 100,
            aspectRatio: (img.naturalWidth || 100) / (img.naturalHeight || 100),
          });
        } else {
          resolve(null);
        }
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      if (cleanSrc.startsWith('data:image/')) {
        const isJpeg = cleanSrc.includes('image/jpeg') || cleanSrc.includes('image/jpg');
        resolve({
          dataUrl: cleanSrc,
          format: isJpeg ? 'JPEG' : 'PNG',
          width: 100,
          height: 100,
          aspectRatio: 1,
        });
      } else {
        resolve(null);
      }
    };

    img.src = cleanSrc;
  });
}

/**
 * Builds the official 2-page Offer Letter jsPDF instance with crisp alignment and zero excessive blank gaps
 */
export async function buildOfferLetterJsPdf(opts: GenerateOfferLetterPdfOptions): Promise<jsPDF> {
  const [logoImg, sigImg, stampImg] = await Promise.all([
    safeLoadImage(opts.logoUrl, true),
    safeLoadImage(opts.signatureImageUrl, true),
    safeLoadImage(opts.stampImageUrl, true),
  ]);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 38;
  const contentWidth = pageWidth - margin * 2;
  const primaryTeal: [number, number, number] = [14, 116, 144]; // #0E7490

  const todayStr = opts.offerDate || formatDateDDMMYYYY(new Date());
  const refCode = opts.refNo || `OL-${new Date().getFullYear()}-${opts.employeeId || 'EMP'}`;
  const deadlineStr = opts.acceptanceDeadline || formatDateDDMMYYYY(new Date(Date.now() + 7 * 86400000));
  const renderTable = typeof autoTable === 'function' ? autoTable : ((autoTable as any)?.default || (autoTable as any)?.autoTable);

  const drawHeader = (docInstance: any) => {
    // Teal vertical accent bar
    docInstance.setFillColor(...primaryTeal);
    docInstance.rect(margin, 28, 3.5, 36, 'F');

    docInstance.setFontSize(12);
    docInstance.setFont('helvetica', 'bold');
    docInstance.setTextColor(15, 23, 42);
    docInstance.text(opts.companyName || 'Businz Technologies Private Limited', margin + 10, 40);

    docInstance.setFontSize(7.8);
    docInstance.setFont('helvetica', 'normal');
    docInstance.setTextColor(100, 116, 139);
    const addrText = opts.companyAddress || 'Corporate Headquarters & Registered Office';
    const addrMaxW = logoImg ? contentWidth - 175 : contentWidth - 12;
    const addrLines = docInstance.splitTextToSize(addrText, addrMaxW).slice(0, 2);
    docInstance.text(addrLines, margin + 10, 52);

    // Company logo on top right
    if (logoImg) {
      try {
        const maxLogoH = 42;
        const maxLogoW = 160;
        let logoW = maxLogoH * logoImg.aspectRatio;
        let logoH = maxLogoH;
        if (logoW > maxLogoW) {
          logoW = maxLogoW;
          logoH = logoW / logoImg.aspectRatio;
        }
        const logoX = pageWidth - margin - logoW;
        const logoY = 25 + (maxLogoH - logoH) / 2;
        docInstance.addImage(logoImg.dataUrl, logoImg.format, logoX, logoY, logoW, logoH, undefined, 'FAST');
      } catch (err) {
        console.warn('Could not add logo to PDF:', err);
      }
    }

    docInstance.setDrawColor(...primaryTeal);
    docInstance.setLineWidth(1.2);
    docInstance.line(margin, 72, pageWidth - margin, 72);
    docInstance.setLineWidth(0.5);
  };

  const drawFooter = (docInstance: any, pageNum: number, totalPages = 2) => {
    docInstance.setDrawColor(226, 232, 240);
    docInstance.setLineWidth(0.6);
    docInstance.line(margin, pageHeight - 32, pageWidth - margin, pageHeight - 32);

    docInstance.setFontSize(7.5);
    docInstance.setFont('helvetica', 'normal');
    docInstance.setTextColor(148, 163, 184);

    const contactStr = [
      opts.companyEmail || 'developer@businz.com',
      opts.companyPhone || '+91 9876543210',
      opts.companyWebsite || 'https://businz.com'
    ].filter(Boolean).join('  |  ');

    docInstance.text(contactStr, margin, pageHeight - 19);
    const pStr = `Page ${pageNum} of ${totalPages}`;
    docInstance.text(pStr, pageWidth - margin - docInstance.getTextWidth(pStr), pageHeight - 19);
  };

  const drawFormattedClause = (
    docInstance: any,
    clauseText: string,
    x: number,
    startY: number,
    maxW: number,
    fontSize = 8.4,
    lineH = 11.4
  ): number => {
    docInstance.setFontSize(fontSize);
    docInstance.setFont('helvetica', 'normal');
    const lines: string[] = docInstance.splitTextToSize(clauseText, maxW);
    const prefixMatch = clauseText.match(/^(\d+\.\s*[^:]+:)\s*(.*)$/);
    let curY = startY;

    for (let i = 0; i < lines.length; i++) {
      const lineStr = lines[i];
      if (i === 0 && prefixMatch) {
        const prefix = prefixMatch[1];
        if (lineStr.startsWith(prefix)) {
          docInstance.setFont('helvetica', 'bold');
          docInstance.setTextColor(15, 23, 42);
          docInstance.text(prefix, x, curY);
          const prefixW = docInstance.getTextWidth(prefix + ' ');
          const rest = lineStr.slice(prefix.length).trimStart();
          if (rest) {
            docInstance.setFont('helvetica', 'normal');
            docInstance.setTextColor(51, 65, 85);
            docInstance.text(rest, x + prefixW, curY);
          }
        } else {
          docInstance.setFont('helvetica', 'bold');
          docInstance.setTextColor(15, 23, 42);
          docInstance.text(lineStr, x, curY);
        }
      } else {
        docInstance.setFont('helvetica', 'normal');
        docInstance.setTextColor(51, 65, 85);
        docInstance.text(lineStr, x, curY);
      }
      curY += lineH;
    }

    return curY;
  };

  const defaultClauses = [
    `1. Nature of Employment: Your employment will be on a ${opts.employmentType || 'Full-Time'} basis.`,
    `2. Probation: The probation period will be 3 months, subject to the company policy.`,
    `3. Working Hours: Your work schedule will be 6 days per week, from 09:30 AM to 06:30 PM, with 1 hour of break time. Attendance, absences and reporting will follow the applicable company policy.`,
    `4. Remuneration: Your fixed gross monthly remuneration will be INR ${opts.monthlyCtc.toLocaleString('en-IN')}. Performance incentives, if any, will be governed by company policy. Details of the agreed compensation structure appear in Annexure A.`,
    `5. Performance Review and Statutory Benefits: Your performance will be reviewed after the completion of probation. Salary revisions and statutory contributions such as PF, ESI and other applicable benefits will be governed by applicable law and approved company policies.`,
    `6. Company Assets and Expense Claims: Company-provided assets, if any, are for authorized work purposes. Approved business expenses must be submitted under the company expense policy to ${opts.companyEmail || 'expenses@businz.com'}.`,
    `7. Roles and Responsibilities: Your core responsibilities are listed below and may be reasonably updated according to business needs: Core departmental deliverables and role objectives designated by management.`,
    `8. Date of Joining: Your proposed joining date is ${opts.joiningDate || todayStr}.`,
    `9. Performance and Monitoring: Your performance may be evaluated against role objectives and key result areas in accordance with company policy.`,
    `10. Notice Period: The applicable notice period is 30 days, subject to the employment agreement and applicable law.`,
    `11. Minimum Service Commitment: Any minimum service commitment or bond will apply only if specifically agreed in a separate, valid agreement: Standard service commitment terms as applicable.`,
    `12. Non-Disclosure Agreement: You may be required to sign a confidentiality or non-disclosure agreement as applicable to the role.`,
    `13. Reference and Background Checks: This offer is subject to satisfactory verification of employment history, credentials and any required background checks.`,
    `14. Location and Transfer: Your initial work location is ${opts.workLocation || 'Head Office'}. Any transfer or remote-work arrangement will follow written company policy and applicable terms.`,
    `15. Fitness for Work: You must be able to perform essential role duties, with reasonable accommodations where required by applicable law.`,
    `16. Official Travel: Business travel, when required, will be reimbursed as per the approved travel and expense policy.`,
    `17. Contact Information: You are responsible for informing HR promptly about changes to your residential address and contact information.`,
    `18. Attendance and Leave: You must follow attendance procedures and seek leave approval according to the company leave policy.`,
    `19. Holidays and Leave Entitlement: Leave eligibility, public holidays and any probation-related conditions will follow applicable law and company policy.`,
    `20. Confidentiality: During and after employment, you must protect confidential company and customer information as required by applicable agreements and law.`,
    `21. Intellectual Property: Ownership and use of work-related intellectual property will be governed by the applicable employment and intellectual-property agreements.`,
    `22. Termination: Employment may be terminated under the agreed terms, applicable law and documented disciplinary procedures.`,
    `23. Handover of Company Property: On separation, you must return all company assets, access credentials, records and other property in accordance with the handover policy.`,
    `24. Code of Conduct and Disciplinary Process: You must comply with lawful company rules, conduct standards and documented disciplinary procedures.`,
    `25. Accuracy of Information: All information and documents provided during recruitment must be accurate. Material misrepresentations may be addressed under company policy and applicable law.`
  ];

  const parsedCustomClauses = (() => {
    if (!opts.customizedClauses || !opts.customizedClauses.trim()) return defaultClauses;
    const rawLines = opts.customizedClauses
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.includes('EMPLOYMENT TERMS & CONDITIONS'));
    const clauses: string[] = [];
    let current = '';
    for (const line of rawLines) {
      if (/^\d+\./.test(line)) {
        if (current) clauses.push(current);
        current = line;
      } else if (current) {
        current += ' ' + line;
      } else {
        clauses.push(line);
      }
    }
    if (current) clauses.push(current);
    return clauses.length >= 5 ? clauses : defaultClauses;
  })();

  const page1Clauses = parsedCustomClauses.slice(0, 17);
  const page2Clauses = parsedCustomClauses.slice(17);

  // ================= PAGE 1 =================
  drawHeader(doc);

  let y = 90;
  doc.setFontSize(11.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('OFFER OF EMPLOYMENT', margin, y);

  doc.setFontSize(8.2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  const metaRight = `Ref: ${refCode}   |   Date: ${todayStr}`;
  doc.text(metaRight, pageWidth - margin - doc.getTextWidth(metaRight), y);

  y += 10;
  // Candidate Recipient Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 46, 5, 5, 'FD');

  doc.setFontSize(8.4);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`To: ${opts.candidateName}`, margin + 10, y + 14);

  if (opts.employeeId) {
    const empTag = `Employee ID: ${opts.employeeId}`;
    doc.setFontSize(7.8);
    doc.setTextColor(...primaryTeal);
    doc.text(empTag, pageWidth - margin - 10 - doc.getTextWidth(empTag), y + 14);
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const candAddr = (opts.candidateAddress || 'Candidate Residential Address').replace(/\s+/g, ' ').trim();
  doc.text(doc.splitTextToSize(candAddr, contentWidth - 20)[0] || candAddr, margin + 10, y + 26);
  doc.text(`Contact: ${opts.candidatePhone || '—'}     |     Email: ${opts.candidateEmail || '—'}`, margin + 10, y + 38);

  y += 60;
  doc.setFontSize(8.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Subject: Offer of Employment — ${opts.designation} (${opts.department || 'Operations'})`, margin, y);

  y += 14;
  doc.setFontSize(8.4);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(`Dear ${opts.salutation || 'Mr./Ms.'} ${opts.candidateName},`, margin, y);

  y += 12;
  const introText = `We are pleased to offer you the position of ${opts.designation} in the ${opts.department || 'Operations'} department at ${opts.companyName}, subject to the terms and conditions set forth below.`;
  const introLines = doc.splitTextToSize(introText, contentWidth);
  doc.text(introLines, margin, y);
  y += introLines.length * 11.2 + 6;

  doc.setFontSize(8.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryTeal);
  doc.text('EMPLOYMENT TERMS & CONDITIONS', margin, y);
  doc.setDrawColor(...primaryTeal);
  doc.setLineWidth(0.8);
  doc.line(margin, y + 3, pageWidth - margin, y + 3);
  doc.setLineWidth(0.5);
  y += 14;

  for (const clause of page1Clauses) {
    y = drawFormattedClause(doc, clause, margin, y, contentWidth, 8.3, 11.2) + 4.2;
  }

  // ================= PAGE 2 =================
  doc.addPage();
  drawHeader(doc);
  y = 90;

  if (page2Clauses.length > 0) {
    doc.setFontSize(8.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryTeal);
    doc.text('EMPLOYMENT TERMS & CONDITIONS (CONTINUED)', margin, y);
    doc.setDrawColor(...primaryTeal);
    doc.setLineWidth(0.8);
    doc.line(margin, y + 3, pageWidth - margin, y + 3);
    doc.setLineWidth(0.5);
    y += 14;

    for (const clause of page2Clauses) {
      y = drawFormattedClause(doc, clause, margin, y, contentWidth, 8.3, 11.1) + 3.8;
    }
    y += 6;
  }

  // ================= ANNEXURE A (COMPENSATION & BENEFITS) ON PAGE 2 =================
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryTeal);
  doc.text('ANNEXURE A — COMPENSATION & BENEFITS STRUCTURE', margin, y);
  doc.setDrawColor(...primaryTeal);
  doc.setLineWidth(0.8);
  doc.line(margin, y + 3, pageWidth - margin, y + 3);
  doc.setLineWidth(0.5);

  y += 13;
  doc.setFontSize(7.9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Employee: ${opts.candidateName}   |   Designation: ${opts.designation}   |   Effective From: ${opts.joiningDate || todayStr}`,
    margin,
    y
  );
  y += 7;

  const tableHead = [['Salary Component', 'Monthly (INR)', 'Annual (INR)']];
  const tableBody = opts.compensationRows.map(r => [
    r.label,
    `INR ${r.amount.toLocaleString('en-IN')}`,
    `INR ${(r.amount * 12).toLocaleString('en-IN')}`
  ]);

  tableBody.push([
    'TOTAL COST TO COMPANY (CTC)',
    `INR ${opts.monthlyCtc.toLocaleString('en-IN')}`,
    `INR ${opts.annualCtc.toLocaleString('en-IN')}`
  ]);

  renderTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: primaryTeal,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.2,
      cellPadding: 4.5,
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 7.9,
      cellPadding: 4.2,
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.52 },
      1: { cellWidth: contentWidth * 0.24, halign: 'right' },
      2: { cellWidth: contentWidth * 0.24, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: margin, right: margin },
    didParseCell: (data: any) => {
      if (data.section === 'head' && data.column.index > 0) {
        data.cell.styles.halign = 'right';
      }
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 253, 244];
        data.cell.styles.textColor = [22, 101, 52];
      }
    }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 125;
  y = finalY + 11;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('• Compensation Notes: All salary components are subject to applicable statutory deductions (EPF, ESIC, PT, TDS).', margin, y);
  y += 10;
  doc.text(`• Statutory Compliance: Benefits and deductions are governed by Indian labor laws. Issued on ${todayStr}.`, margin, y);

  // ================= ACCEPTANCE & AUTHORIZATION BLOCK =================
  y += 16;
  if (y + 135 > pageHeight - 36) {
    doc.addPage();
    drawHeader(doc);
    y = 90;
  }

  doc.setFontSize(9.2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryTeal);
  doc.text('ACCEPTANCE & AUTHORIZATION', margin, y);
  doc.setDrawColor(...primaryTeal);
  doc.setLineWidth(0.8);
  doc.line(margin, y + 3, pageWidth - margin, y + 3);
  doc.setLineWidth(0.5);

  y += 13;
  doc.setFontSize(7.9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(
    `Please confirm your acceptance of this Offer of Employment by ${deadlineStr}. We look forward to welcoming you to ${opts.companyName}.`,
    margin,
    y
  );
  y += 10;

  const boxWidth = (contentWidth - 16) / 2;
  const boxHeight = 108;
  const leftBoxX = margin;
  const rightBoxX = margin + boxWidth + 16;

  // Left Box: Company Authorization
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(leftBoxX, y, boxWidth, boxHeight, 5, 5, 'FD');

  doc.setFontSize(8.2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`For ${opts.companyName}`, leftBoxX + 10, y + 14);

  const sigStampTopY = y + 18;
  const sigStampAreaH = 46;

  if (sigImg) {
    try {
      const maxSigH = 38;
      const maxSigW = 115;
      let sigW = maxSigH * sigImg.aspectRatio;
      let sigH = maxSigH;
      if (sigW > maxSigW) {
        sigW = maxSigW;
        sigH = sigW / sigImg.aspectRatio;
      }
      const sigX = leftBoxX + 10;
      const sigY = sigStampTopY + (sigStampAreaH - sigH);
      doc.addImage(sigImg.dataUrl, sigImg.format, sigX, sigY, sigW, sigH, undefined, 'FAST');
    } catch (err) {
      console.warn('Could not add signature to PDF:', err);
    }
  }

  if (stampImg) {
    try {
      const maxStampH = 46;
      const maxStampW = 76;
      let stampW = maxStampH * stampImg.aspectRatio;
      let stampH = maxStampH;
      if (stampW > maxStampW) {
        stampW = maxStampW;
        stampH = stampW / stampImg.aspectRatio;
      }
      const stampX = leftBoxX + boxWidth - stampW - 12;
      const stampY = sigStampTopY + (sigStampAreaH - stampH);
      doc.addImage(stampImg.dataUrl, stampImg.format, stampX, stampY, stampW, stampH, undefined, 'FAST');
    } catch (err) {
      console.warn('Could not add stamp to PDF:', err);
    }
  }

  const lineY = sigStampTopY + sigStampAreaH + 4;
  doc.setDrawColor(203, 213, 225);
  doc.line(leftBoxX + 10, lineY, leftBoxX + boxWidth - 10, lineY);

  const cleanSigName = (opts.signatoryName || 'Authorized Signatory').trim();
  const rawSigDesig = (opts.signatoryDesignation || 'HR Management').trim();
  const cleanSigDesig = rawSigDesig.toLowerCase() === cleanSigName.toLowerCase() ? 'HR Management & Administration' : rawSigDesig;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(cleanSigName, leftBoxX + 10, lineY + 11);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(cleanSigDesig, leftBoxX + 10, lineY + 21);
  doc.text('Official Seal / Digital Stamp', leftBoxX + 10, lineY + 31);

  // Right Box: Candidate Acceptance
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(rightBoxX, y, boxWidth, boxHeight, 5, 5, 'FD');

  doc.setFontSize(8.2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Candidate Acceptance & Acknowledgement', rightBoxX + 10, y + 14);

  doc.setFontSize(7.4);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const ackLines = doc.splitTextToSize(
    'I have read, understood, and accept all terms and conditions of employment and Annexure A stated in this Offer Letter.',
    boxWidth - 20
  );
  doc.text(ackLines, rightBoxX + 10, y + 26);

  doc.setDrawColor(203, 213, 225);
  doc.line(rightBoxX + 10, lineY, rightBoxX + boxWidth - 10, lineY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Candidate: ${opts.candidateName}`, rightBoxX + 10, lineY + 11);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Signature of Candidate', rightBoxX + 10, lineY + 21);
  doc.text(`Date: ________________________`, rightBoxX + 10, lineY + 31);

  const totalPagesCount = doc.getNumberOfPages();
  for (let p = 1; p <= totalPagesCount; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPagesCount);
  }

  return doc;
}

/**
 * Generates an official Offer Letter PDF matching the corporate template
 * Returns Base64 encoded PDF string
 */
export async function generateOfferLetterPdfBase64(opts: GenerateOfferLetterPdfOptions): Promise<string> {
  const doc = await buildOfferLetterJsPdf(opts);
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split(',')[1];
  return base64;
}

/**
 * Triggers direct vector PDF download of the official Offer Letter
 */
export async function downloadOfferLetterPdf(opts: GenerateOfferLetterPdfOptions, filename?: string): Promise<void> {
  const doc = await buildOfferLetterJsPdf(opts);
  const targetName = (filename || `Offer_Letter_${opts.candidateName.replace(/\s+/g, '_')}_${opts.employeeId || 'EMP'}`).replace(/\.pdf$/i, '') + '.pdf';
  doc.save(targetName);
}

/**
 * Opens the vector Offer Letter PDF directly for native printing without DOM page-break cropping
 */
export async function printOfferLetterPdf(opts: GenerateOfferLetterPdfOptions): Promise<void> {
  const doc = await buildOfferLetterJsPdf(opts);
  doc.autoPrint();
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const printWin = window.open(blobUrl, '_blank');
  if (!printWin) {
    const targetName = `Offer_Letter_${opts.candidateName.replace(/\s+/g, '_')}_${opts.employeeId || 'EMP'}.pdf`;
    doc.save(targetName);
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

