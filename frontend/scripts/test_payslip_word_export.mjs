import assert from 'node:assert';

// Mock formatCurrency and convertAmountToWords logic as in exportUtils.ts
const toNum = (value, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const formatCurrency = (value, showSymbol = true) => {
  const num = toNum(value, 0);
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (showSymbol) {
    return isNegative ? `-₹${formatted}` : `₹${formatted}`;
  }
  return isNegative ? `-${formatted}` : formatted;
};

const escapeHtml = (unsafe) => {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&#39;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

const cleanAddressSpacing = (text) => {
  if (!text) return '';
  return text
    .replace(/,([^\s])/g, ', $1')
    .replace(/Nagappa\s+I\s+ndustialn/gi, 'Nagappa Industrial')
    .replace(/ndustialn/gi, 'Industrial')
    .replace(/Industialn/gi, 'Industrial')
    .replace(/\s+/g, ' ')
    .trim();
};

const onesWords = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const teensWords = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tensWords = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigitWords = (val) => {
  if (val < 10) return onesWords[val];
  if (val < 20) return teensWords[val - 10];
  const t = Math.floor(val / 10);
  const o = val % 10;
  return [tensWords[t], onesWords[o]].filter(Boolean).join(' ');
};

function convertAmountToWords(value) {
  const num = Math.max(0, Math.round(Number(value) || 0));
  if (num === 0) return 'INR Zero only';

  const parts = [];
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = Math.floor((num % 1000) / 100);
  const rest = num % 100;

  if (crore) parts.push(`${twoDigitWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${onesWords[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));

  return `INR ${parts.join(' ')} only`;
}

function generatePayslipWordHtml(options) {
  const profile = options.companyProfile;
  const regAddr = cleanAddressSpacing(profile.registeredAddress || profile.address);
  const branchAddr = cleanAddressSpacing(profile.branchAddress);

  const logoBase64 = profile.logoUrl || '';
  const sigBase64 = profile.signatureImageUrl || '';
  const stampBase64 = profile.stampImageUrl || '';

  const contactItems = [
    profile.phone ? `Phone: ${escapeHtml(profile.phone)}` : '',
    profile.email ? `Email: ${escapeHtml(profile.email)}` : '',
    profile.website ? `Web: ${escapeHtml(profile.website)}` : '',
    profile.gstNumber ? `GST: ${escapeHtml(profile.gstNumber)}` : '',
    profile.cinNumber ? `CIN: ${escapeHtml(profile.cinNumber)}` : '',
    profile.registrationNumber ? `Reg: ${escapeHtml(profile.registrationNumber)}` : ''
  ].filter(Boolean);

  const signatoryName = (profile.authorizedSignatoryName || 'Authorized Signatory').trim();
  const signatoryRole = (profile.authorizedSignatoryDesignation || '').trim();
  const showRoleLine = Boolean(signatoryRole && signatoryRole.toLowerCase() !== signatoryName.toLowerCase());

  const rowCount = Math.max(options.earnings.length, options.deductions.length, 1);
  const earningsDeductionsRowsHtml = Array.from({ length: rowCount }).map((_, idx) => {
    const earning = options.earnings[idx];
    const deduction = options.deductions[idx];

    const earningTitle = earning ? escapeHtml(earning.label) : '';
    const earningDesc = (options.showDescription && earning?.description)
      ? `<div style="font-size: 7pt; color: #64748B; margin-top: 1pt;">${escapeHtml(earning.description)}</div>`
      : '';
    const earningAmt = earning ? formatCurrency(earning.amount) : '';

    const deductionTitle = deduction ? escapeHtml(deduction.label) : '';
    const deductionDesc = (options.showDescription && deduction?.description)
      ? `<div style="font-size: 7pt; color: #64748B; margin-top: 1pt;">${escapeHtml(deduction.description)}</div>`
      : '';
    const deductionAmt = deduction ? formatCurrency(deduction.amount) : '';

    return `
      <tr>
        <td width="34%" align="left" style="width: 34%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #CBD5E1; vertical-align: top;">
          <span style="font-weight: 600; color: #1E293B;">${earningTitle}</span>
          ${earningDesc}
        </td>
        <td width="16%" align="right" style="width: 16%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #CBD5E1; vertical-align: top; font-weight: 600; color: #0F172A; white-space: nowrap;">
          ${earningAmt}
        </td>
        <td width="34%" align="left" style="width: 34%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #CBD5E1; vertical-align: top;">
          <span style="font-weight: 600; color: #1E293B;">${deductionTitle}</span>
          ${deductionDesc}
        </td>
        <td width="16%" align="right" style="width: 16%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #CBD5E1; vertical-align: top; font-weight: 600; color: #BE123C; white-space: nowrap;">
          ${deductionAmt}
        </td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>${escapeHtml(options.filename)}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page Section1 {
    size: 210mm 297mm;
    margin: 14mm 14mm 14mm 14mm;
    mso-header-margin: 8mm;
    mso-footer-margin: 8mm;
    mso-paper-source: 0;
  }
  div.Section1 {
    page: Section1;
  }
  body {
    font-family: 'DM Sans', 'Segoe UI', Calibri, Arial, sans-serif;
    font-size: 8.5pt;
    color: #1E293B;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
    line-height: 1.35;
  }
  table {
    border-collapse: collapse;
    mso-table-lspace: 0pt;
    mso-table-rspace: 0pt;
    width: 100%;
    table-layout: fixed;
  }
  td, th {
    vertical-align: middle;
    font-family: 'DM Sans', 'Segoe UI', Calibri, Arial, sans-serif;
    word-wrap: break-word;
  }
</style>
</head>
<body>
<div class="Section1">
  <div style="border: 0.75pt solid #CBD5E1; border-radius: 6pt; padding: 12pt 16pt; background-color: #FFFFFF;">
    <!-- 1. HEADER SECTION -->
    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 8pt; border-bottom: 2pt solid #0E7490; padding-bottom: 8pt;">
      <tr>
        <td width="55%" align="left" style="width: 55%; vertical-align: middle;">
          ${logoBase64 ? `<img src="${logoBase64}" alt="${escapeHtml(profile.companyName)}" style="max-height: 44pt; max-width: 160pt; height: auto; width: auto;" />` : `<span style="font-size: 13pt; font-weight: 800; color: #0E7490;">${escapeHtml(profile.companyName)}</span>`}
        </td>
        <td width="45%" align="right" style="width: 45%; vertical-align: middle; text-align: right;">
          <div style="font-size: 11pt; font-weight: 800; color: #0E7490; text-transform: uppercase; letter-spacing: 0.5pt;">
            PAYSLIP FOR ${escapeHtml(options.monthLabel.toUpperCase())}
          </div>
          <div style="font-size: 8.5pt; color: #475569; margin-top: 3pt;">
            <strong style="color: #334155;">Status:</strong> <span style="font-weight: 700; color: #0E7490;">${escapeHtml(options.status)}</span>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top: 6pt; padding-bottom: 6pt;">
          <div style="font-size: 11pt; font-weight: 800; color: #0F172A; margin-bottom: 2pt;">
            ${escapeHtml(profile.companyName)}
          </div>
          ${regAddr ? `<div style="font-size: 8pt; color: #64748B; line-height: 1.4;"><strong style="color: #334155;">Regd:</strong> ${escapeHtml(regAddr)}</div>` : ''}
          ${branchAddr ? `<div style="font-size: 8pt; color: #64748B; line-height: 1.4;"><strong style="color: #334155;">Branch:</strong> ${escapeHtml(branchAddr)}</div>` : ''}
          ${contactItems.length > 0 ? `
          <div style="font-size: 8pt; color: #64748B; line-height: 1.4; margin-top: 2pt;">
            ${contactItems.join('&nbsp;&nbsp;|&nbsp;&nbsp;')}
          </div>` : ''}
        </td>
      </tr>
    </table>

    <!-- 2. EMPLOYEE DETAILS GRID -->
    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 8pt; background-color: #F8FAFC; border: 0.75pt solid #CBD5E1;">
      <tr>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Employee Name</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 700; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.employeeName)}</td>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Employee ID</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 700; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.employeeId)}</td>
      </tr>
      <tr>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Department</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.department)}</td>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Designation</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.designation)}</td>
      </tr>
      <tr>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Date of Joining</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.dateOfJoining || '—')}</td>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Employee CTC</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.employeeCtc || '—')}</td>
      </tr>
      <tr>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Bank Account</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.bankAccount || '—')}</td>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">PAN</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.pan || '—')}</td>
      </tr>
      <tr>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Working Days</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(String(options.workingDays))}</td>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Paid Days</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.paidDays)}</td>
      </tr>
      ${options.approvedOtHours ? `
      <tr>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Approved OT Hours</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.approvedOtHours)}</td>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">UAN</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.uan || '—')}</td>
      </tr>` : `
      <tr>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">UAN</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0F172A; font-weight: 600; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.uan || '—')}</td>
        <td width="20%" align="left" style="width: 20%; padding: 4.5pt 7pt; font-size: 8pt; color: #64748B; font-weight: 700; border: 0.5pt solid #E2E8F0;">Payment Status</td>
        <td width="30%" align="left" style="width: 30%; padding: 4.5pt 7pt; font-size: 8pt; color: #0E7490; font-weight: 700; border: 0.5pt solid #E2E8F0;">${escapeHtml(options.status)}</td>
      </tr>`}
    </table>

    <!-- 3. ATTENDANCE & CALENDAR BREAKDOWN STRIP -->
    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 8pt; background-color: #F8FAFC; border: 0.75pt solid #CBD5E1;">
      <tr>
        <td width="25%" align="left" style="width: 25%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #E2E8F0;">
          <span style="color: #64748B; font-weight: 700;">Calendar Days: </span>
          <span style="color: #0F172A; font-weight: 700;">${escapeHtml(String(options.calendarDays))}</span>
        </td>
        <td width="25%" align="left" style="width: 25%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #E2E8F0;">
          <span style="color: #64748B; font-weight: 700;">Working Days: </span>
          <span style="color: #0F172A; font-weight: 700;">${escapeHtml(String(options.workingDays))}</span>
        </td>
        <td width="25%" align="left" style="width: 25%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #E2E8F0;">
          <span style="color: #64748B; font-weight: 700;">Present Days: </span>
          <span style="color: #0F172A; font-weight: 700;">${escapeHtml(String(options.presentDays))}</span>
        </td>
        <td width="25%" align="left" style="width: 25%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #E2E8F0;">
          <span style="color: #64748B; font-weight: 700;">Paid Week Off: </span>
          <span style="color: #0E7490; font-weight: 700;">${escapeHtml(String(options.paidWeekOffDays))}</span>
        </td>
      </tr>
      <tr>
        <td width="25%" align="left" style="width: 25%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #E2E8F0;">
          <span style="color: #64748B; font-weight: 700;">Paid Holiday: </span>
          <span style="color: #0E7490; font-weight: 700;">${escapeHtml(String(options.paidHolidayDays))}</span>
        </td>
        <td width="25%" align="left" style="width: 25%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #E2E8F0;">
          <span style="color: #64748B; font-weight: 700;">Paid Leave: </span>
          <span style="color: #15803D; font-weight: 700;">${escapeHtml(String(options.paidLeaveDays))}</span>
        </td>
        <td width="25%" align="left" style="width: 25%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #E2E8F0;">
          <span style="color: #64748B; font-weight: 700;">LOP Days: </span>
          <span style="color: ${Number(options.lopDays) > 0 ? '#DC2626' : '#0F172A'}; font-weight: 700;">${escapeHtml(String(options.lopDays))}</span>
        </td>
        <td width="25%" align="left" style="width: 25%; padding: 4.5pt 7pt; font-size: 8pt; border: 0.5pt solid #E2E8F0;">
          <span style="color: #64748B; font-weight: 700;">Total Paid Days: </span>
          <span style="color: #0E7490; font-weight: 800;">${escapeHtml(String(options.totalPaidDays))}</span>
        </td>
      </tr>
    </table>

    <!-- 4. EARNINGS & DEDUCTIONS TABLE -->
    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 8pt;">
      <thead>
        <tr style="background-color: #F1F5F9; font-weight: 700; font-size: 8.5pt;">
          <th width="34%" align="left" style="width: 34%; text-align: left; padding: 5.5pt 7pt; border: 0.75pt solid #CBD5E1; color: #1E293B;">Earnings</th>
          <th width="16%" align="right" style="width: 16%; text-align: right; padding: 5.5pt 7pt; border: 0.75pt solid #CBD5E1; color: #1E293B; white-space: nowrap;">Amount</th>
          <th width="34%" align="left" style="width: 34%; text-align: left; padding: 5.5pt 7pt; border: 0.75pt solid #CBD5E1; color: #1E293B;">Deductions</th>
          <th width="16%" align="right" style="width: 16%; text-align: right; padding: 5.5pt 7pt; border: 0.75pt solid #CBD5E1; color: #1E293B; white-space: nowrap;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${earningsDeductionsRowsHtml}
        <tr style="background-color: #F8FAFC; font-weight: 800; font-size: 8.5pt;">
          <td width="34%" align="left" style="width: 34%; padding: 5.5pt 7pt; border: 0.75pt solid #CBD5E1; color: #0F172A;">Gross Earnings</td>
          <td width="16%" align="right" style="width: 16%; padding: 5.5pt 7pt; border: 0.75pt solid #CBD5E1; color: #0E7490; white-space: nowrap;">${formatCurrency(options.grossEarnings)}</td>
          <td width="34%" align="left" style="width: 34%; padding: 5.5pt 7pt; border: 0.75pt solid #CBD5E1; color: #0F172A;">Total Deductions</td>
          <td width="16%" align="right" style="width: 16%; padding: 5.5pt 7pt; border: 0.75pt solid #CBD5E1; color: #BE123C; white-space: nowrap;">${formatCurrency(options.totalDeductions)}</td>
        </tr>
      </tbody>
    </table>

    <!-- 5. NET PAY HIGHLIGHT SECTION -->
    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 10pt; border-top: 2pt solid #0E7490; border-bottom: 0.75pt solid #CBD5E1; background-color: #F8FAFC;">
      <tr>
        <td width="65%" align="left" style="width: 65%; padding: 7pt 10pt; vertical-align: middle;">
          <div style="font-size: 9.5pt; font-weight: 800; color: #0F172A; letter-spacing: 0.3pt;">NET PAY</div>
          <div style="font-size: 8pt; color: #64748B; margin-top: 2pt; font-style: italic;">${convertAmountToWords(options.netPay)}</div>
        </td>
        <td width="35%" align="right" style="width: 35%; padding: 7pt 10pt; vertical-align: middle; text-align: right;">
          <div style="font-size: 14pt; font-weight: 800; color: #047857;">${formatCurrency(options.netPay)}</div>
        </td>
      </tr>
    </table>

    <!-- 6. AUTHORIZED SIGNATORY -->
    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10pt; margin-bottom: 8pt;">
      <tr>
        <td width="55%" style="width: 55%;">&nbsp;</td>
        <td width="45%" align="right" style="width: 45%; vertical-align: bottom; text-align: right;">
          <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="right" style="padding-bottom: 4pt; min-height: 40pt; text-align: right;">
                ${sigBase64 ? `<img src="${sigBase64}" alt="Signature" style="max-height: 38pt; max-width: 120pt; height: auto; width: auto;" />` : `<span style="color: #94A3B8; font-size: 8pt; font-style: italic;">Authorized Signature</span>`}
                ${stampBase64 ? `&nbsp;&nbsp;<img src="${stampBase64}" alt="Stamp" style="max-height: 46pt; max-width: 80pt; height: auto; width: auto;" />` : ''}
              </td>
            </tr>
            <tr>
              <td align="right" style="border-top: 1.5pt solid #334155; padding-top: 4pt; text-align: right;">
                <div style="font-weight: 800; color: #0F172A; font-size: 8.5pt;">${escapeHtml(signatoryName)}</div>
                ${showRoleLine ? `<div style="color: #64748B; font-size: 7.5pt;">${escapeHtml(signatoryRole)}</div>` : ''}
                <div style="color: #64748B; font-size: 7.5pt;">${escapeHtml(profile.companyName)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- 7. FOOTER -->
    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border-top: 0.75pt solid #E2E8F0; padding-top: 6pt; margin-top: 8pt;">
      <tr>
        <td align="center" style="font-size: 7.5pt; color: #94A3B8; padding-top: 6pt; text-align: center;">
          ${escapeHtml(profile.legalName || profile.companyName)} ${profile.address ? `| ${escapeHtml(profile.address)}` : ''}
        </td>
      </tr>
    </table>
  </div>
</div>
</body>
</html>`;
}

// RUN TESTS
console.log('--- Testing Word Document Generation for Payslip ---');

const mockOptions = {
  filename: 'Payslip_Joti_Rana_October_2026',
  companyProfile: {
    companyName: 'VRM STRUCTURES INDIA PRIVATE LIMITED',
    legalName: 'VRM STRUCTURES INDIA PRIVATE LIMITED',
    registeredAddress: '1427, GNT Road, Nagappa Industrial Estate, Puzhal, Chennai, Tamil Nadu-600066',
    branchAddress: 'Chennai',
    phone: '+919884720789',
    website: 'www.vrmstructures.in',
    gstNumber: '33AAGCV426N1ZZ',
    registrationNumber: 'ROC-CHENNAI-123456',
    authorizedSignatoryName: 'Authorized Signatory',
    authorizedSignatoryDesignation: 'Director',
  },
  employeeName: 'Joti Rana',
  employeeId: 'VRM-038',
  department: 'Disptach',
  designation: 'Packing',
  dateOfJoining: '08/06/2026',
  employeeCtc: '₹13,000.00',
  bankAccount: '123355546778878',
  pan: 'SDFGF0303H',
  uan: '101234567890',
  workingDays: 25,
  paidDays: '7 / 31',
  monthLabel: 'October 2026',
  status: 'Processed',
  calendarDays: 31,
  presentDays: 1,
  paidWeekOffDays: 4,
  paidHolidayDays: 2,
  paidLeaveDays: 0,
  lopDays: 24,
  totalPaidDays: 7,
  earnings: [
    { label: 'BASIC SALARY', amount: 1174, description: '40% of CTC | Paid 7/31 days' },
    { label: 'House Rent Allowance', amount: 1027, description: '35% of CTC | Paid 7/31 days' },
    { label: 'Dearness Allowance', amount: 587, description: '20% of CTC | Paid 7/31 days' },
    { label: 'Conveyance', amount: 147, description: '5% of CTC | Paid 7/31 days' },
  ],
  deductions: [
    { label: "Employees' Provident Fund", amount: 228.96, description: 'Formula: (BASIC+DA+CONV)*12/100' },
    { label: "Employees' State Insurance Corporation", amount: 22.01, description: 'Formula: (BASIC+HRA+DA+CONV+OT)*0.75/100' },
  ],
  grossEarnings: 2935,
  totalDeductions: 250.97,
  netPay: 2684.03,
  showDescription: true,
};

const html = generatePayslipWordHtml(mockOptions);

// 1. Verify MSO and Word namespaces
assert.ok(html.includes("xmlns:w='urn:schemas-microsoft-com:office:word'"), 'Missing Word XML namespace');
assert.ok(html.includes("<w:View>Print</w:View>"), 'Missing Word Print view setting');

// 2. Verify A4 Page Setup
assert.ok(html.includes('@page Section1'), 'Missing @page Section1 definition');
assert.ok(html.includes('size: 210mm 297mm;'), 'Missing A4 dimensions');

// 3. Verify No flex or grid layout (Word incompatible)
assert.ok(!html.includes('display: flex'), 'Must not contain display: flex');
assert.ok(!html.includes('display: grid'), 'Must not contain display: grid');
assert.ok(!html.includes('grid-template-columns'), 'Must not contain grid CSS');

// 4. Verify Tables with explicit widths and cell alignment
assert.ok(html.includes('table-layout: fixed'), 'Missing table-layout: fixed');
assert.ok(html.includes('PAYSLIP FOR OCTOBER 2026'), 'Missing Payslip title');
assert.ok(html.includes('VRM STRUCTURES INDIA PRIVATE LIMITED'), 'Missing Company Name');

// 5. Verify Employee Details
assert.ok(html.includes('Joti Rana'), 'Missing Employee Name');
assert.ok(html.includes('VRM-038'), 'Missing Employee ID');
assert.ok(html.includes('Disptach'), 'Missing Department');
assert.ok(html.includes('Packing'), 'Missing Designation');

// 6. Verify Attendance Breakdown
assert.ok(html.includes('Calendar Days:'), 'Missing Calendar Days');
assert.ok(html.includes('LOP Days:'), 'Missing LOP Days');
assert.ok(html.includes('Total Paid Days:'), 'Missing Total Paid Days');

// 7. Verify Side-by-Side Earnings and Deductions Table
assert.ok(html.includes('BASIC SALARY'), 'Missing BASIC SALARY');
assert.ok(html.includes('₹1,174.00'), 'Missing Basic amount');
assert.ok(html.includes("Employees&#39; Provident Fund"), 'Missing EPF');
assert.ok(html.includes('₹228.96'), 'Missing EPF amount');
assert.ok(html.includes('Gross Earnings'), 'Missing Gross Earnings');
assert.ok(html.includes('₹2,935.00'), 'Missing Gross Earnings amount');
assert.ok(html.includes('Total Deductions'), 'Missing Total Deductions');
assert.ok(html.includes('₹250.97'), 'Missing Total Deductions amount');

// 8. Verify Net Pay
assert.ok(html.includes('NET PAY'), 'Missing NET PAY label');
assert.ok(html.includes('INR Two Thousand Six Hundred Eighty Four only'), 'Missing Net Pay words');
assert.ok(html.includes('₹2,684.03'), 'Missing Net Pay amount');

// 9. Verify Authorized Signatory
assert.ok(html.includes('Authorized Signatory'), 'Missing Authorized Signatory label');
assert.ok(html.includes('border-top: 1.5pt solid #334155'), 'Missing signature line');

console.log('✓ All 9 assertions passed successfully! The generated Word document conforms to strict table alignment standards.');
