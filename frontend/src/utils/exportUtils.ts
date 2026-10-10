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
import { formatDateDDMMYYYY } from './dateUtils';

export interface ExportColumn {
  key: string;
  label: string;
}

const escapeCsv = (val: any): string => {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
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
  const rows = data.map(item => cols.map(c => escapeCsv(item[c.key])).join(','));

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
export function downloadExcel(
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

  // Create clean array of row objects with human-readable headers
  const sheetData = data.map(item => {
    const row: Record<string, any> = {};
    cols.forEach(c => {
      const raw = item[c.key];
      row[c.label] = raw !== null && raw !== undefined ? raw : '';
    });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(sheetData);

  // Auto-calculate column widths for great readability on Mac & Windows
  ws['!cols'] = cols.map(c => {
    const maxValLen = Math.max(
      c.label.length,
      ...data.slice(0, 50).map(d => String(d[c.key] ?? '').length)
    );
    return { wch: Math.min(Math.max(maxValLen + 4, 14), 45) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');

  const cleanFilename = filename.replace(/\.(xlsx?|xls)$/i, '') + '.xlsx';

  // Generate binary XLSX buffer and download with official OpenXML MIME type
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  triggerFileDownload(blob, cleanFilename);
}

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

  // Landscape for wider tables, Portrait for standard tables
  const isLandscape = cols.length > 5;
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const primaryTeal: [number, number, number] = [14, 116, 144]; // #0E7490

  // 1. Company Header
  doc.setFontSize(16);
  doc.setTextColor(...primaryTeal);
  doc.text(companyName, 40, 38);

  // 2. Report Title
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59); // Slate 800
  doc.text(title, 40, 56);

  // 3. Metadata Subtitle
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // Slate 500
  const dateStr = formatDateDDMMYYYY(new Date());
  doc.text(`Generated: ${dateStr} • Total Records: ${data.length}`, 40, 70);

  // 4. Build Structured Table
  const tableHead = [cols.map(c => c.label)];
  const tableBody = data.map(item => cols.map(c => {
    const val = item[c.key];
    return val !== null && val !== undefined ? String(val) : '-';
  }));

  const renderTable = typeof autoTable === 'function' ? autoTable : ((autoTable as any)?.default || (autoTable as any)?.autoTable);
  renderTable(doc, {
    startY: 82,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: primaryTeal,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left'
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 8
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252] // #F8FAFC
    },
    styles: {
      overflow: 'linebreak',
      cellPadding: 4.5,
      lineColor: [226, 232, 240], // #E2E8F0
      lineWidth: 0.5
    },
    margin: { top: 40, right: 36, bottom: 36, left: 36 },
    didDrawPage: () => {
      // Clean footer on every page
      const pageSize = doc.internal.pageSize;
      const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`${companyName} • Confidential Enterprise Report`, 36, pageHeight - 16);
      const pageStr = `Page ${doc.internal.pages.length - 1}`;
      const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
      doc.text(pageStr, pageWidth - 36 - doc.getTextWidth(pageStr), pageHeight - 16);
    }
  });

  const cleanFilename = filename.replace(/\.(pdf|xlsx?|csv)$/i, '') + '.pdf';
  doc.save(cleanFilename);
}

/**
 * Downloads a specific styled DOM element (like Payslip, Offer Letter, Attendance Slip) as PDF
 * Built with hidden iframe to bypass Apple Mac Safari pop-up blockers seamlessly.
 */
export function downloadElementAsPDF(
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
      padding: 16px;
      margin: 0;
      background: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    img {
      max-width: 100%;
      height: auto;
      object-fit: contain !important;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
    }

    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }

    th, td {
      word-wrap: break-word;
    }

    @media print {
      @page {
        margin: 10mm;
        size: A4 portrait;
      }
      body {
        padding: 0;
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

export const printElement = downloadElementAsPDF;

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

/**
 * Builds the official 3-page Offer Letter jsPDF instance matching corporate template
 */
export function buildOfferLetterJsPdf(opts: GenerateOfferLetterPdfOptions): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const primaryTeal: [number, number, number] = [14, 116, 144]; // #0E7490

  const todayStr = opts.offerDate || formatDateDDMMYYYY(new Date());
  const refCode = opts.refNo || `OL-${new Date().getFullYear()}-${opts.employeeId || 'EMP'}`;
  const deadlineStr = opts.acceptanceDeadline || formatDateDDMMYYYY(new Date(Date.now() + 7 * 86400000));
  const renderTable = typeof autoTable === 'function' ? autoTable : ((autoTable as any)?.default || (autoTable as any)?.autoTable);

  const drawHeader = (docInstance: any) => {
    // Teal vertical accent bar
    docInstance.setFillColor(...primaryTeal);
    docInstance.rect(margin, 36, 4, 30, 'F');

    docInstance.setFontSize(13);
    docInstance.setFont('helvetica', 'bold');
    docInstance.setTextColor(15, 23, 42);
    docInstance.text(opts.companyName || 'Businz Technologies Private Limited', margin + 12, 49);

    docInstance.setFontSize(8);
    docInstance.setFont('helvetica', 'normal');
    docInstance.setTextColor(100, 116, 139);
    docInstance.text(opts.companyAddress || 'Corporate Headquarters & Registered Office', margin + 12, 62);

    docInstance.setDrawColor(226, 232, 240);
    docInstance.line(margin, 76, pageWidth - margin, 76);
  };

  const drawFooter = (docInstance: any, pageNum: number) => {
    docInstance.setDrawColor(226, 232, 240);
    docInstance.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);

    docInstance.setFontSize(7.5);
    docInstance.setFont('helvetica', 'normal');
    docInstance.setTextColor(148, 163, 184);

    const contactStr = [
      opts.companyEmail || 'developer@businz.com',
      opts.companyPhone || '+91 9876543210',
      opts.companyWebsite || 'https://businz.com'
    ].filter(Boolean).join(' | ');

    docInstance.text(contactStr, margin, pageHeight - 20);
    const pStr = `Page ${pageNum}`;
    docInstance.text(pStr, pageWidth - margin - docInstance.getTextWidth(pStr), pageHeight - 20);
  };

  // ================= PAGE 1 =================
  drawHeader(doc);

  let y = 96;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('OFFER OF EMPLOYMENT', margin, y);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Reference: ${refCode}`, margin, y + 14);
  const dateMeta = `Date: ${todayStr}`;
  doc.text(dateMeta, pageWidth - margin - doc.getTextWidth(dateMeta), y + 14);

  y += 34;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('To', margin, y);

  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.text(opts.candidateName, margin, y);
  y += 11;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(opts.candidateAddress || 'Candidate Residential Address', margin, y);
  y += 11;
  doc.text(`Contact: ${opts.candidatePhone || '—'}   Email: ${opts.candidateEmail || '—'}`, margin, y);

  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Subject: Offer of Employment - ${opts.designation}`, margin, y);

  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(`Dear ${opts.salutation || 'Mr./Ms.'} ${opts.candidateName},`, margin, y);

  y += 12;
  const introText = `We are pleased to offer you the position of ${opts.designation} in the ${opts.department || 'Operations'} department of ${opts.companyName}, subject to the following terms and conditions.`;
  const introLines = doc.splitTextToSize(introText, contentWidth);
  doc.text(introLines, margin, y);
  y += introLines.length * 11 + 6;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryTeal);
  doc.text('EMPLOYMENT TERMS & CONDITIONS', margin, y);
  y += 12;

  const page1Clauses = [
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
    `12. Non-Disclosure Agreement: You may be required to sign a confidentiality or non-disclosure agreement as applicable to the role.`
  ];

  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  for (const clause of page1Clauses) {
    const lines = doc.splitTextToSize(clause, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 9.5 + 3.5;
  }

  drawFooter(doc, 1);

  // ================= PAGE 2 =================
  doc.addPage();
  drawHeader(doc);
  y = 96;

  const page2Clauses = [
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

  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  for (const clause of page2Clauses) {
    const lines = doc.splitTextToSize(clause, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 9.5 + 3.5;
  }

  y += 14;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryTeal);
  doc.text('ACCEPTANCE & AUTHORIZATION', margin, y);

  y += 14;
  doc.setFontSize(8.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  const acceptNote = `Please confirm your acceptance of the terms above by signing and returning this letter by ${deadlineStr}. We look forward to welcoming you to ${opts.companyName}.`;
  const acceptLines = doc.splitTextToSize(acceptNote, contentWidth);
  doc.text(acceptLines, margin, y);
  y += acceptLines.length * 11 + 24;

  // Signatory & Candidate columns
  const colWidth = (contentWidth - 40) / 2;
  const col2X = margin + colWidth + 40;

  // Left column: Company
  doc.setFont('helvetica', 'bold');
  doc.text(`For ${opts.companyName}`, margin, y);
  doc.text('Employee acceptance', col2X, y);

  y += 36;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, margin + colWidth, y);
  doc.line(col2X, y, col2X + colWidth, y);

  y += 12;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(opts.signatoryName || 'Authorized Signatory', margin, y);
  doc.text(`Signature: __________________________`, col2X, y);

  y += 11;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(opts.signatoryDesignation || 'HR Management', margin, y);
  doc.text(`Name: ${opts.candidateName}`, col2X, y);

  y += 11;
  doc.text('Official Seal / Digital Stamp', margin, y);
  doc.text(`Date: ______________________________`, col2X, y);

  drawFooter(doc, 2);

  // ================= PAGE 3 (ANNEXURE A) =================
  doc.addPage();
  drawHeader(doc);
  y = 96;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryTeal);
  doc.text('ANNEXURE A', margin, y);

  y += 14;
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('COMPENSATION & BENEFITS STRUCTURE', margin, y);

  y += 14;
  doc.setFontSize(8.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Employee: ${opts.candidateName}   |   Designation: ${opts.designation}   |   Effective from: ${opts.joiningDate || todayStr}`, margin, y);

  y += 12;
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
      fontSize: 8.5,
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 8,
      cellPadding: 6,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: margin, right: margin },
    didParseCell: (data: any) => {
      // Highlight the last row (TOTAL COST TO COMPANY)
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 253, 244]; // Soft green
        data.cell.styles.textColor = [22, 101, 52];
      }
    }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 160;
  y = finalY + 20;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Compensation notes: All cash components are subject to statutory deductions (PF, ESI, Professional Tax, TDS) as applicable.', margin, y);
  y += 12;
  doc.text('Benefits / deductions: Statutory employee benefits are governed in accordance with Indian statutory labor compliances.', margin, y);
  y += 12;
  doc.text(`This annexure forms part of the offer letter issued on ${todayStr}.`, margin, y);

  y += 30;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Authorized Signatory: ${opts.signatoryName || 'Authorized Signatory'}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`${opts.companyName}`, margin, y + 12);

  drawFooter(doc, 3);

  return doc;
}

/**
 * Generates an official 3-page Offer Letter PDF matching the corporate template
 * Returns Base64 encoded PDF string
 */
export async function generateOfferLetterPdfBase64(opts: GenerateOfferLetterPdfOptions): Promise<string> {
  const doc = buildOfferLetterJsPdf(opts);
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split(',')[1];
  return base64;
}

/**
 * Triggers direct vector PDF download of the official 3-page Offer Letter
 */
export function downloadOfferLetterPdf(opts: GenerateOfferLetterPdfOptions, filename?: string): void {
  const doc = buildOfferLetterJsPdf(opts);
  const targetName = (filename || `Offer_Letter_${opts.candidateName.replace(/\s+/g, '_')}_${opts.employeeId || 'EMP'}`).replace(/\.pdf$/i, '') + '.pdf';
  doc.save(targetName);
}

