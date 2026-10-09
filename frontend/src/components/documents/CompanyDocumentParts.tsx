import React from 'react';
import { BusinessProfileSettings, Employee, PayrollComponentLineItem } from '../../types/hrms';
import { CompanyBranch, CompanyInfo } from '../../types/settings';
import { formatCurrency, toNum } from '../../utils/numbers';

export interface CompanyDocumentProfile {
  company_id?: string;
  companyId?: string;
  logoUrl: string;
  companyName: string;
  legalName: string;
  address: string;
  registeredAddress?: string;
  branchAddress?: string;
  email: string;
  phone: string;
  website: string;
  gstNumber: string;
  cinNumber: string;
  registrationNumber: string;
  ownerName: string;
  authorizedSignatoryName: string;
  authorizedSignatoryDesignation: string;
  signatureImageUrl: string;
  stampImageUrl: string;
}

export interface DetailRow {
  label: string;
  value?: React.ReactNode;
}

export interface AmountLine {
  label: string;
  amount: number;
  description?: string;
}

const firstText = (...values: Array<string | undefined | null>) =>
  values.find(value => typeof value === 'string' && value.trim().length > 0)?.trim() || '';

const formatAddress = (branch?: CompanyBranch) => {
  if (!branch) return '';
  const address = branch.address;
  return [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.state,
    address.country,
    address.pincode
  ].filter(Boolean).join(', ');
};

const withoutProtocol = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

export const buildCompanyDocumentProfile = (
  companyInfo: CompanyInfo | undefined,
  businessSettings: BusinessProfileSettings | undefined,
  branches: CompanyBranch[] = []
): CompanyDocumentProfile => {
  const registeredBranch = branches.find(branch => branch.isHeadOffice) || branches[0];
  const secondaryBranch = branches.find(branch => !branch.isHeadOffice);
  const companyName = firstText(companyInfo?.companyName, businessSettings?.businessName, 'Businz');
  const ownerName = firstText(companyInfo?.ownerName, businessSettings?.administrator);
  const signatoryName = firstText(companyInfo?.authorizedSignatoryName, ownerName, businessSettings?.administrator, 'Authorized Signatory');
  const regAddr = firstText(companyInfo?.registeredAddress, formatAddress(registeredBranch), businessSettings?.address);
  const branchAddr = firstText(companyInfo?.branchAddress, formatAddress(secondaryBranch));
  const fullAddress = [regAddr, branchAddr ? `Branch: ${branchAddr}` : ''].filter(Boolean).join(' | ');

  const compId = firstText(companyInfo?.company_id, companyInfo?.id, 'company-a');

  return {
    company_id: compId,
    companyId: compId,
    logoUrl: firstText(companyInfo?.logoUrl, businessSettings?.logoUrl, '/logo.png'),
    companyName,
    legalName: firstText(companyInfo?.legalCompanyName, companyName),
    address: regAddr || fullAddress,
    registeredAddress: regAddr,
    branchAddress: branchAddr,
    email: firstText(companyInfo?.officialEmail, businessSettings?.email),
    phone: firstText(companyInfo?.officialPhone, businessSettings?.phone),
    website: withoutProtocol(firstText(companyInfo?.website, '')),
    gstNumber: firstText(companyInfo?.gstNumber, businessSettings?.gstin),
    cinNumber: firstText(companyInfo?.cinNumber, businessSettings?.cin),
    registrationNumber: firstText(companyInfo?.registrationNumber),
    ownerName,
    authorizedSignatoryName: signatoryName,
    authorizedSignatoryDesignation: firstText(companyInfo?.authorizedSignatoryDesignation, 'Authorized Signatory'),
    signatureImageUrl: firstText(companyInfo?.signatureImageUrl),
    stampImageUrl: firstText(companyInfo?.stampImageUrl)
  };
};

export const fullEmployeeName = (employee?: Employee | null) =>
  [employee?.firstName, employee?.lastName].filter(Boolean).join(' ').trim();

export const CompanyHeader: React.FC<{
  profile: CompanyDocumentProfile;
  title?: string;
  subtitle?: string;
  rightMeta?: DetailRow[];
}> = ({ profile, title, subtitle, rightMeta = [] }) => (
  <div className="company-doc-header-root" style={{ borderBottom: '2px solid #0E7490', paddingBottom: '16px', marginBottom: '18px' }}>
    <div className="company-doc-header-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
      <div className="company-doc-header-left" style={{ display: 'flex', gap: '16px', minWidth: 0, flex: 1, alignItems: 'center' }}>
        {profile.logoUrl && (
          <img
            src={profile.logoUrl}
            alt={`${profile.companyName} logo`}
            className="company-doc-header-logo"
            style={{ width: 'auto', height: 'auto', maxWidth: '200px', maxHeight: '72px', objectFit: 'contain', flexShrink: 0 }}
            onError={event => { event.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="company-doc-header-text" style={{ minWidth: 0 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem', color: '#0f172a', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
            {profile.companyName}
          </h2>
          {profile.registeredAddress && (
            <div style={headerLineStyle}>
              <strong>Regd:</strong> {profile.registeredAddress}
            </div>
          )}
          {!profile.registeredAddress && profile.address && (
            <div style={headerLineStyle}>{profile.address}</div>
          )}
          {profile.branchAddress && (
            <div style={headerLineStyle}>
              <strong>Branch:</strong> {profile.branchAddress}
            </div>
          )}
          {[profile.email, profile.phone, profile.website].filter(Boolean).length > 0 && (
            <div style={headerLineStyle}>
              {[profile.email, profile.phone, profile.website].filter(Boolean).join(' | ')}
            </div>
          )}
          {[
            profile.gstNumber ? `GST: ${profile.gstNumber}` : '',
            profile.cinNumber ? `CIN: ${profile.cinNumber}` : '',
            profile.registrationNumber ? `Reg: ${profile.registrationNumber}` : ''
          ].filter(Boolean).length > 0 && (
            <div style={headerLineStyle}>
              {[
                profile.gstNumber ? `GST: ${profile.gstNumber}` : '',
                profile.cinNumber ? `CIN: ${profile.cinNumber}` : '',
                profile.registrationNumber ? `Reg: ${profile.registrationNumber}` : ''
              ].filter(Boolean).join(' | ')}
            </div>
          )}
        </div>
      </div>
      {(title || rightMeta.length > 0) && (
        <div className="company-doc-header-right" style={{ textAlign: 'right', minWidth: '180px', flexShrink: 0 }}>
          {title && <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>}
          {subtitle && <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>{subtitle}</div>}
          {rightMeta.map(row => (
            <div key={row.label} style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>
              <strong>{row.label}:</strong> {row.value}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

export const EmployeeDetailsGrid: React.FC<{ rows: DetailRow[]; columns?: number }> = ({ rows, columns = 2 }) => (
  <div 
    className="employee-details-grid-doc"
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: '8px 16px',
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '0.8rem',
      marginBottom: '18px'
    }}
  >
    {rows.filter(row => row.value !== undefined && row.value !== null && row.value !== '').map(row => (
      <div key={row.label} style={{ minWidth: 0 }}>
        <span style={{ color: '#64748b', fontWeight: 700 }}>{row.label}: </span>
        <span style={{ color: '#0f172a', fontWeight: 600, overflowWrap: 'break-word' }}>{row.value}</span>
      </div>
    ))}
  </div>
);

// Semantic alias matching specification
export const EmployeeDetails = EmployeeDetailsGrid;

export const DynamicEarningsTable: React.FC<{ earnings: AmountLine[]; total: number }> = ({ earnings, total }) => (
  <div className="payslip-table-wrapper" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '14px' }}>
    <table className="payslip-table" style={{ width: '100%', minWidth: '320px', borderCollapse: 'collapse', marginBottom: '0' }}>
      <thead>
        <tr style={{ backgroundColor: '#f1f5f9' }}>
          <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.82rem', fontWeight: 700, border: '1px solid #e2e8f0' }}>Earnings</th>
          <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '0.82rem', fontWeight: 700, border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Amount (INR)</th>
        </tr>
      </thead>
      <tbody>
        {earnings.map((earning, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '8px 12px', fontSize: '0.8rem', border: '1px solid #e2e8f0' }}><LineLabel line={earning} /></td>
            <td style={{ padding: '8px 12px', fontSize: '0.8rem', textAlign: 'right', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{formatCurrency(earning.amount)}</td>
          </tr>
        ))}
        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
          <td style={{ padding: '8px 12px', fontSize: '0.82rem', border: '1px solid #e2e8f0' }}>Gross Earnings</td>
          <td style={{ padding: '8px 12px', fontSize: '0.82rem', textAlign: 'right', color: '#0E7490', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{formatCurrency(total)}</td>
        </tr>
      </tbody>
    </table>
  </div>
);

export const DynamicDeductionsTable: React.FC<{ deductions: AmountLine[]; total: number }> = ({ deductions, total }) => (
  <div className="payslip-table-wrapper" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '14px' }}>
    <table className="payslip-table" style={{ width: '100%', minWidth: '320px', borderCollapse: 'collapse', marginBottom: '0' }}>
      <thead>
        <tr style={{ backgroundColor: '#f1f5f9' }}>
          <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.82rem', fontWeight: 700, border: '1px solid #e2e8f0' }}>Deductions</th>
          <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '0.82rem', fontWeight: 700, border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Amount (INR)</th>
        </tr>
      </thead>
      <tbody>
        {deductions.map((deduction, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '8px 12px', fontSize: '0.8rem', border: '1px solid #e2e8f0' }}><LineLabel line={deduction} /></td>
            <td style={{ padding: '8px 12px', fontSize: '0.8rem', textAlign: 'right', color: '#be123c', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{formatCurrency(deduction.amount)}</td>
          </tr>
        ))}
        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
          <td style={{ padding: '8px 12px', fontSize: '0.82rem', border: '1px solid #e2e8f0' }}>Total Deductions</td>
          <td style={{ padding: '8px 12px', fontSize: '0.82rem', textAlign: 'right', color: '#be123c', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{formatCurrency(total)}</td>
        </tr>
      </tbody>
    </table>
  </div>
);

export const DynamicAmountTable: React.FC<{
  earnings: AmountLine[];
  deductions: AmountLine[];
  grossEarnings: number;
  totalDeductions: number;
}> = ({ earnings, deductions, grossEarnings, totalDeductions }) => {
  const rowCount = Math.max(earnings.length, deductions.length, 1);
  return (
    <div className="payslip-table-wrapper" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '18px' }}>
      <table className="payslip-table" style={{ width: '100%', minWidth: '480px', borderCollapse: 'collapse', marginBottom: '0' }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9' }}>
            <th style={{ width: '33%', textAlign: 'left', padding: '9px 12px', fontSize: '0.82rem', fontWeight: 700, border: '1px solid #e2e8f0' }}>Earnings</th>
            <th style={{ width: '17%', minWidth: '70px', textAlign: 'right', padding: '9px 12px', fontSize: '0.82rem', fontWeight: 700, border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Amount</th>
            <th style={{ width: '33%', textAlign: 'left', padding: '9px 12px', fontSize: '0.82rem', fontWeight: 700, border: '1px solid #e2e8f0' }}>Deductions</th>
            <th style={{ width: '17%', minWidth: '70px', textAlign: 'right', padding: '9px 12px', fontSize: '0.82rem', fontWeight: 700, border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, index) => {
            const earning = earnings[index];
            const deduction = deductions[index];
            return (
              <tr key={index}>
                <td style={{ padding: '8px 12px', fontSize: '0.8rem', border: '1px solid #e2e8f0' }}>{earning && <LineLabel line={earning} />}</td>
                <td style={{ padding: '8px 12px', fontSize: '0.8rem', textAlign: 'right', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{earning ? formatCurrency(earning.amount) : ''}</td>
                <td style={{ padding: '8px 12px', fontSize: '0.8rem', border: '1px solid #e2e8f0' }}>{deduction && <LineLabel line={deduction} />}</td>
                <td style={{ padding: '8px 12px', fontSize: '0.8rem', textAlign: 'right', color: deduction ? '#be123c' : undefined, border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  {deduction ? formatCurrency(deduction.amount) : ''}
                </td>
              </tr>
            );
          })}
          <tr style={{ fontWeight: 800, backgroundColor: '#f8fafc' }}>
            <td style={{ padding: '9px 12px', fontSize: '0.82rem', border: '1px solid #e2e8f0' }}>Gross Earnings</td>
            <td style={{ padding: '9px 12px', fontSize: '0.82rem', textAlign: 'right', color: '#0E7490', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{formatCurrency(grossEarnings)}</td>
            <td style={{ padding: '9px 12px', fontSize: '0.82rem', border: '1px solid #e2e8f0' }}>Total Deductions</td>
            <td style={{ padding: '9px 12px', fontSize: '0.82rem', textAlign: 'right', color: '#be123c', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{formatCurrency(totalDeductions)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const NetPaySection: React.FC<{ netPay: number }> = ({ netPay }) => (
  <div style={{
    borderTop: '2px solid #0E7490',
    paddingTop: '12px',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '16px',
    alignItems: 'center',
    pageBreakInside: 'avoid'
  }}>
    <div>
      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>NET PAY</div>
      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '3px' }}>{amountToIndianWords(netPay)}</div>
    </div>
    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#047857' }}>{formatCurrency(netPay)}</div>
  </div>
);

export const AuthorizedSignatory: React.FC<{ profile: CompanyDocumentProfile; showStamp?: boolean }> = ({ profile, showStamp = true }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', marginTop: '34px', pageBreakInside: 'avoid' }}>
    <div style={{ minWidth: '220px' }}>
      <div style={{ height: '62px', display: 'flex', alignItems: 'flex-end', gap: '14px' }}>
        {profile.signatureImageUrl ? (
          <img
            src={profile.signatureImageUrl}
            alt="Authorized signature"
            style={{ width: 'auto', height: 'auto', maxHeight: '54px', maxWidth: '170px', objectFit: 'contain' }}
            onError={event => { event.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Signature</span>
        )}
        {showStamp && profile.stampImageUrl && (
          <img
            src={profile.stampImageUrl}
            alt="Company stamp"
            style={{ width: 'auto', height: 'auto', maxHeight: '54px', maxWidth: '96px', objectFit: 'contain' }}
            onError={event => { event.currentTarget.style.display = 'none'; }}
          />
        )}
      </div>
      <div style={{ borderTop: '1px solid #334155', paddingTop: '6px', fontSize: '0.8rem' }}>
        <div style={{ fontWeight: 800, color: '#0f172a' }}>{profile.authorizedSignatoryName}</div>
        <div style={{ color: '#64748b' }}>{profile.authorizedSignatoryDesignation}</div>
        <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{profile.companyName}</div>
      </div>
    </div>
  </div>
);

export const CompanyFooter: React.FC<{ profile: CompanyDocumentProfile }> = ({ profile }) => (
  <div style={{ marginTop: '24px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '0.68rem', color: '#94a3b8', textAlign: 'center' }}>
    {profile.legalName} {profile.address ? `| ${profile.address}` : ''}
  </div>
);

export const mapPayrollLines = (lines?: PayrollComponentLineItem[]): AmountLine[] =>
  (lines || [])
    .filter(line => toNum(line.amount) > 0)
    .map(line => ({ label: line.name, amount: toNum(line.amount), description: line.description }));

export const amountToIndianWords = (value: unknown): string => {
  const num = Math.max(0, Math.round(toNum(value)));
  if (num === 0) return 'INR Zero only';

  const parts: string[] = [];
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = Math.floor((num % 1000) / 100);
  const rest = num % 100;

  if (crore) parts.push(`${twoDigitWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ones[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));

  return `INR ${parts.join(' ')} only`;
};

const LineLabel: React.FC<{ line: AmountLine }> = ({ line }) => (
  <>
    <span>{line.label}</span>
    {line.description && <span style={{ display: 'block', fontSize: '0.68rem', color: '#64748b' }}>{line.description}</span>}
  </>
);

const headerLineStyle: React.CSSProperties = {
  fontSize: '0.74rem',
  color: '#64748b',
  lineHeight: 1.45,
  overflowWrap: 'break-word',
  wordBreak: 'normal'
};

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigitWords = (value: number): string => {
  if (value < 10) return ones[value];
  if (value < 20) return teens[value - 10];
  const ten = Math.floor(value / 10);
  const one = value % 10;
  return [tens[ten], ones[one]].filter(Boolean).join(' ');
};
