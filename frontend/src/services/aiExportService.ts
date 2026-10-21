import { TableColumn, MetricCardItem } from '../types/aiAssistant';
import { downloadCSV, downloadExcel, downloadPDF } from '../utils/exportUtils';
import { formatDateTimeDDMMYYYY } from '../utils/dateUtils';

/**
 * Exports data to an Excel (.xls) file with formatted styling
 */
export function exportToExcel(
  rows: Record<string, any>[],
  columns: TableColumn[],
  fileNamePrefix: string = 'HRMS_Report'
): void {
  if (!rows || rows.length === 0) {
    alert('No active data available to export.');
    return;
  }
  const cols = columns.map(c => ({ key: c.key, label: c.label }));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadExcel(rows, `${fileNamePrefix}_${timestamp}`, cols);
}

/**
 * Exports data to a standard CSV file with UTF-8 BOM
 */
export function exportToCSV(
  rows: Record<string, any>[],
  columns: TableColumn[],
  fileNamePrefix: string = 'HRMS_Report'
): void {
  if (!rows || rows.length === 0) {
    alert('No active data available to export.');
    return;
  }
  const cols = columns.map(c => ({ key: c.key, label: c.label }));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadCSV(rows, `${fileNamePrefix}_${timestamp}`, cols);
}

/**
 * Generates an official, publication-quality PDF report document
 */
export function exportToPDF(
  rows: Record<string, any>[],
  columns: TableColumn[],
  title: string = 'Businz Enterprise HRMS Report',
  metrics?: MetricCardItem[],
  appliedFilters?: Record<string, string | undefined>
): void {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    // Mac Safari / iOS popup blocked fallback: Generate vector PDF directly
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadPDF(rows, title, `${title.replace(/\s+/g, '_')}_${timestamp}`, columns.map(c => ({ key: c.key, label: c.label })));
    return;
  }

  const dateGenerated = formatDateTimeDDMMYYYY(new Date());
  const filterList = appliedFilters 
    ? Object.entries(appliedFilters).filter(([_, v]) => Boolean(v)).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join(' | ')
    : 'None';

  const headerKeys = columns.length > 0 ? columns.map(c => c.key) : Object.keys(rows[0] || {});
  const headerLabels = columns.length > 0 ? columns.map(c => c.label) : headerKeys;

  const metricCardsHtml = metrics && metrics.length > 0
    ? `<div style="display: flex; gap: 16px; margin-bottom: 24px;">
        ${metrics.map(m => `
          <div style="flex: 1; padding: 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;">
            <div style="font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 600;">${m.label}</div>
            <div style="font-size: 22px; font-weight: 700; color: #0E7490; margin-top: 4px;">${m.value}</div>
            ${m.subtext ? `<div style="font-size: 11px; color: #94A3B8; margin-top: 2px;">${m.subtext}</div>` : ''}
          </div>
        `).join('')}
      </div>`
    : '';

  const tableHeaderHtml = headerLabels.map(l => `<th style="padding: 10px 12px; text-align: left; background: #0E7490; color: #ffffff; font-size: 12px; font-weight: 600; border-bottom: 2px solid #0891B2;">${l}</th>`).join('');

  const tableBodyHtml = rows.map((row, idx) => `
    <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}; border-bottom: 1px solid #E2E8F0;">
      ${headerKeys.map(k => `<td style="padding: 10px 12px; font-size: 12px; color: #1E293B;">${row[k] ?? '-'}</td>`).join('')}
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} - VRM HRMS</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
            color: #1E293B;
            padding: 32px;
            background: #ffffff;
            margin: 0;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0E7490;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .brand {
            font-size: 24px;
            font-weight: 700;
            color: #0E7490;
            letter-spacing: -0.5px;
          }
          .meta {
            text-align: right;
            font-size: 11px;
            color: #64748B;
          }
          .filter-bar {
            background: #ECFEFF;
            border-left: 4px solid #0E7490;
            padding: 10px 16px;
            font-size: 12px;
            color: #0E7490;
            margin-bottom: 24px;
            border-radius: 4px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
          }
          .footer {
            margin-top: 40px;
            padding-top: 16px;
            border-top: 1px solid #E2E8F0;
            font-size: 11px;
            color: #94A3B8;
            display: flex;
            justify-content: space-between;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">BUSINZ ENTERPRISE HRMS</div>
            <div style="font-size: 15px; font-weight: 600; color: #334155; margin-top: 4px;">${title}</div>
          </div>
          <div class="meta">
            <div>Generated: ${dateGenerated}</div>
            <div>Authorized Corporate AI Assistant</div>
          </div>
        </div>

        <div class="filter-bar">
          ${filterList !== 'None' ? `<strong>Active Filters:</strong> ${filterList}` : '<strong>Report Scope:</strong> Full Authorized HRMS Dataset'}
        </div>

        ${metricCardsHtml}

        <table>
          <thead>
            <tr>${tableHeaderHtml}</tr>
          </thead>
          <tbody>
            ${tableBodyHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>Businz • Confidential HRMS Report</div>
          <div>Page 1 of 1</div>
        </div>

        <div class="no-print" style="margin-top: 30px; text-align: center;">
          <button onclick="window.print()" style="padding: 10px 24px; background: #0E7490; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
            Save as PDF
          </button>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 600);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
