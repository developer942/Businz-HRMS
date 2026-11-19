import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const indexHtmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexHtmlPath)) {
  console.error('[generatePublicPolicyHtml] dist/index.html not found.');
  process.exit(1);
}

const baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');

const pages = [
  {
    filename: 'privacy-policy.html',
    url: 'https://hrms.businz.com/privacy-policy',
    title: 'Privacy Policy | BUSINZ HRMS – VRM Structures India Pvt. Ltd.',
    description:
      'Official Privacy Policy for BUSINZ HRMS (https://hrms.businz.com) and its Meta WhatsApp Business Cloud API integration operated by VRM STRUCTURES INDIA PRIVATE LIMITED.',
    bodyHtml: `
      <div style="max-width:960px;margin:0 auto;padding:32px 20px;font-family:sans-serif;color:#1E293B;line-height:1.6;">
        <h1>Privacy Policy – BUSINZ HRMS</h1>
        <p><strong>Operated By:</strong> VRM STRUCTURES INDIA PRIVATE LIMITED (GSTIN: 33AAGCV426N1ZZ)</p>
        <p><strong>Registered Office:</strong> 1427, GNT Road, Nagappa Industrial Estate, Puzhal, Chennai, Tamil Nadu - 600066, India</p>
        <p><strong>Official Phone:</strong> +91 9884720789 | <strong>WhatsApp Business Account:</strong> VRM STRUCTURES (+91 78719 92830) | <strong>Support Email:</strong> developer@businz.com</p>
        <h2>1. Categories of Data Processed</h2>
        <p>BUSINZ HRMS processes employee and workforce profile records, payroll and statutory records, face attendance verification photos and Asia/Kolkata timestamps, field duty GPS coordinates and reverse-geocoded addresses, scanned business visiting cards and customer directory details, and Meta WhatsApp Business Cloud API CRM contacts, consent states, inbound/outbound messages, approved templates, media attachments, and webhook delivery/read statuses.</p>
        <h2>2. Processing Purposes & Service Providers</h2>
        <p>Information is processed strictly for workforce attendance, payroll administration, field visit verification, B2B contact management, and operational WhatsApp Business communications via Meta Platforms, Inc. (WhatsApp Business Cloud API), Hostinger VPS Cloud Infrastructure, Google LLC (Gmail SMTP & Gemini API), and OpenStreetMap Nominatim reverse geocoding. We do not sell personal data or WhatsApp contact details to third parties.</p>
        <h2>3. Retention & Data Deletion</h2>
        <p>Operational records are retained in PostgreSQL for the duration of the employment or business relationship or until removed by a validated deletion request, subject to mandatory Indian statutory retention for employment, payroll, tax, and audit records. Users may request data deletion or WhatsApp opt-out at <a href="https://hrms.businz.com/data-deletion">https://hrms.businz.com/data-deletion</a>.</p>
      </div>
    `,
  },
  {
    filename: 'terms-of-service.html',
    url: 'https://hrms.businz.com/terms-of-service',
    title: 'Terms of Service | BUSINZ HRMS – VRM Structures India Pvt. Ltd.',
    description:
      'Official Terms of Service for BUSINZ HRMS (https://hrms.businz.com) and its Meta WhatsApp Business CRM integration operated by VRM STRUCTURES INDIA PRIVATE LIMITED.',
    bodyHtml: `
      <div style="max-width:960px;margin:0 auto;padding:32px 20px;font-family:sans-serif;color:#1E293B;line-height:1.6;">
        <h1>Terms of Service – BUSINZ HRMS</h1>
        <p><strong>Operated By:</strong> VRM STRUCTURES INDIA PRIVATE LIMITED (GSTIN: 33AAGCV426N1ZZ)</p>
        <p><strong>Registered Office:</strong> 1427, GNT Road, Nagappa Industrial Estate, Puzhal, Chennai, Tamil Nadu - 600066, India</p>
        <p><strong>Official Phone:</strong> +91 9884720789 | <strong>WhatsApp Business Account:</strong> VRM STRUCTURES (+91 78719 92830) | <strong>Support Email:</strong> developer@businz.com</p>
        <h2>1. Authorized Platform Use</h2>
        <p>BUSINZ HRMS is an enterprise workforce management, attendance, payroll, field tracking, business contact scanner, and WhatsApp CRM system operated by VRM STRUCTURES INDIA PRIVATE LIMITED for authorized employees, administrators, customers, and business contacts.</p>
        <h2>2. Account Security & Attendance Integrity</h2>
        <p>Users must safeguard their login credentials and OTP codes, replace temporary onboarding passwords upon first sign-in, and submit genuine live camera captures and GPS coordinates when marking attendance or field visits.</p>
        <h2>3. WhatsApp Business Messaging Compliance</h2>
        <p>All WhatsApp communications sent through BUSINZ HRMS must comply with the Meta WhatsApp Business Messaging Policy. Outbound template broadcasts are restricted to contacts who have not opted out, and recipients may opt out at any time by replying STOP or submitting a request at <a href="https://hrms.businz.com/data-deletion">https://hrms.businz.com/data-deletion</a>.</p>
      </div>
    `,
  },
  {
    filename: 'data-deletion.html',
    url: 'https://hrms.businz.com/data-deletion',
    title: 'User Data Deletion Instructions | BUSINZ HRMS – VRM Structures India Pvt. Ltd.',
    description:
      'Official User Data Deletion and WhatsApp Opt-Out Instructions for BUSINZ HRMS (https://hrms.businz.com) operated by VRM STRUCTURES INDIA PRIVATE LIMITED.',
    bodyHtml: `
      <div style="max-width:960px;margin:0 auto;padding:32px 20px;font-family:sans-serif;color:#1E293B;line-height:1.6;">
        <h1>User Data Deletion Instructions – BUSINZ HRMS</h1>
        <p><strong>Operated By:</strong> VRM STRUCTURES INDIA PRIVATE LIMITED (GSTIN: 33AAGCV426N1ZZ)</p>
        <p><strong>Registered Office:</strong> 1427, GNT Road, Nagappa Industrial Estate, Puzhal, Chennai, Tamil Nadu - 600066, India</p>
        <p><strong>Official Phone:</strong> +91 9884720789 | <strong>WhatsApp Business Account:</strong> VRM STRUCTURES (+91 78719 92830) | <strong>Support Email:</strong> developer@businz.com</p>
        <h2>How to Request Data Deletion or WhatsApp Opt-Out</h2>
        <ol>
          <li><strong>Online Request Form:</strong> Submit your full name, registered WhatsApp phone number or email address, and deletion scope on this page (https://hrms.businz.com/data-deletion) to receive an immediate tracking reference ID (DEL-YYYYMMDD-XXXX) and automatic WhatsApp broadcast opt-out.</li>
          <li><strong>Email Request:</strong> Email <a href="mailto:developer@businz.com">developer@businz.com</a> with subject "Data Deletion Request – BUSINZ HRMS" and your registered phone number or email address.</li>
          <li><strong>WhatsApp Opt-Out:</strong> Reply STOP to our official WhatsApp Business number (+91 78719 92830) or call +91 9884720789.</li>
        </ol>
        <h2>Records Deleted vs. Mandatory Statutory Retention</h2>
        <p>Upon verification, WhatsApp CRM contact profiles, conversation threads, message history, media attachments, and discretionary scanned visiting card entries are deleted. For current or former employees of VRM STRUCTURES INDIA PRIVATE LIMITED, statutory employment history, attendance logs, payroll disbursements, PF/ESI, tax filings, and financial audit records are retained as required under applicable Indian labour, tax, and corporate laws.</p>
      </div>
    `,
  },
];

for (const page of pages) {
  const metaBlock = `
    <title>${page.title}</title>
    <meta name="description" content="${page.description}" />
    <meta property="og:title" content="${page.title}" />
    <meta property="og:description" content="${page.description}" />
    <meta property="og:url" content="${page.url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="BUSINZ HRMS – VRM Structures India Pvt. Ltd." />
    <link rel="canonical" href="${page.url}" />
  `.trim();

  let html = baseHtml.replace(/<title>[\s\S]*?<\/title>/i, metaBlock);
  html = html.replace('<div id="root"></div>', `<div id="root">${page.bodyHtml}</div>`);
  fs.writeFileSync(path.join(distDir, page.filename), html, 'utf8');
  console.log(`[generatePublicPolicyHtml] Generated ${page.filename}`);
}
