import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  FileText,
  Trash2,
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Lock,
  Database,
  Server,
} from 'lucide-react';
import { API_BASE_URL } from '../../config/api';

export type PublicPolicyRoute = '/privacy-policy' | '/terms-of-service' | '/data-deletion';

export function resolvePublicPolicyRoute(pathname: string): PublicPolicyRoute | null {
  const clean = (pathname || '').trim().toLowerCase().replace(/\/+$/, '');
  if (clean === '/privacy-policy') return '/privacy-policy';
  if (clean === '/terms-of-service') return '/terms-of-service';
  if (clean === '/data-deletion') return '/data-deletion';
  return null;
}

export const VERIFIED_OPERATOR_DETAILS = {
  platformName: 'BUSINZ HRMS',
  platformUrl: 'https://hrms.businz.com',
  legalEntityName: 'VRM STRUCTURES INDIA PRIVATE LIMITED',
  companyType: 'Private Limited',
  companyCode: 'VRM',
  gstin: '33AAGCV426N1ZZ',
  registeredAddress: '1427, GNT Road, Nagappa Industrial Estate, Puzhal, Chennai, Tamil Nadu - 600066, India',
  officialPhone: '+91 9884720789',
  whatsappBusinessName: 'VRM STRUCTURES',
  whatsappBusinessNumber: '+91 78719 92830',
  supportEmail: 'developer@businz.com',
  corporateWebsite: 'https://www.vrmstructures.in',
  lastUpdated: '19 November 2026',
};

interface PublicPolicyPagesProps {
  route: PublicPolicyRoute;
  onNavigate: (targetPath: string) => void;
}

export const PublicPolicyPages: React.FC<PublicPolicyPagesProps> = ({ route, onNavigate }) => {
  const [fullName, setFullName] = useState('');
  const [contactIdentifier, setContactIdentifier] = useState('');
  const [requestScope, setRequestScope] = useState('whatsapp_crm');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    referenceId: string;
    submittedAt: string;
    message: string;
    immediateOptOutApplied?: boolean;
  } | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (route === '/privacy-policy') {
      document.title = 'Privacy Policy | BUSINZ HRMS – VRM Structures India Pvt. Ltd.';
    } else if (route === '/terms-of-service') {
      document.title = 'Terms of Service | BUSINZ HRMS – VRM Structures India Pvt. Ltd.';
    } else if (route === '/data-deletion') {
      document.title = 'User Data Deletion Instructions | BUSINZ HRMS – VRM Structures India Pvt. Ltd.';
    }
  }, [route]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  const handleDeletionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitResult(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setSubmitError('Please enter your full name.');
      return;
    }
    if (!contactIdentifier.trim() || contactIdentifier.trim().length < 5) {
      setSubmitError('Please enter your registered WhatsApp phone number or email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/public/data-deletion-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          contactIdentifier: contactIdentifier.trim(),
          requestScope,
          details: details.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message || 'Unable to submit request. Please email developer@businz.com directly.');
      }
      setSubmitResult(json.data);
      setFullName('');
      setContactIdentifier('');
      setDetails('');
    } catch (err: any) {
      setSubmitError(err?.message || 'Unable to submit request at this moment. Please email developer@businz.com.');
    } finally {
      setSubmitting(false);
    }
  };

  const sectionCardStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #E7ECF3',
    borderRadius: '16px',
    padding: '28px',
    marginBottom: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
  };

  const h2Style: React.CSSProperties = {
    fontSize: '1.2rem',
    fontWeight: 700,
    color: '#1E293B',
    margin: '0 0 12px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  };

  const pStyle: React.CSSProperties = {
    fontSize: '0.94rem',
    lineHeight: 1.7,
    color: '#334155',
    margin: '0 0 12px 0',
  };

  const ulStyle: React.CSSProperties = {
    margin: '0 0 12px 0',
    paddingLeft: '20px',
    color: '#334155',
    fontSize: '0.92rem',
    lineHeight: 1.7,
  };

  return (
    <div
      data-testid="public-policy-page"
      style={{
        minHeight: '100vh',
        backgroundColor: '#F7F9FC',
        color: '#1E293B',
        fontFamily: "'DM Sans', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Public Header */}
      <header
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E7ECF3',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: '1040px',
            margin: '0 auto',
            padding: '14px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.95rem',
                letterSpacing: '0.02em',
              }}
            >
              VRM
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1E293B', lineHeight: 1.2 }}>
                {VERIFIED_OPERATOR_DETAILS.platformName}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
                {VERIFIED_OPERATOR_DETAILS.legalEntityName}
              </div>
            </div>
          </div>

          <nav
            aria-label="Public Policy Navigation"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <a
              href="/privacy-policy"
              onClick={(e) => handleNavClick(e, '/privacy-policy')}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 600,
                textDecoration: 'none',
                backgroundColor: route === '/privacy-policy' ? '#0E7490' : '#F1F5F9',
                color: route === '/privacy-policy' ? '#FFFFFF' : '#334155',
              }}
            >
              Privacy Policy
            </a>
            <a
              href="/terms-of-service"
              onClick={(e) => handleNavClick(e, '/terms-of-service')}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 600,
                textDecoration: 'none',
                backgroundColor: route === '/terms-of-service' ? '#0E7490' : '#F1F5F9',
                color: route === '/terms-of-service' ? '#FFFFFF' : '#334155',
              }}
            >
              Terms of Service
            </a>
            <a
              href="/data-deletion"
              onClick={(e) => handleNavClick(e, '/data-deletion')}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 600,
                textDecoration: 'none',
                backgroundColor: route === '/data-deletion' ? '#0E7490' : '#F1F5F9',
                color: route === '/data-deletion' ? '#FFFFFF' : '#334155',
              }}
            >
              Data Deletion
            </a>
            <a
              href="/"
              onClick={(e) => handleNavClick(e, '/')}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 600,
                textDecoration: 'none',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ArrowLeft size={14} /> Sign In Portal
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content Container */}
      <main style={{ maxWidth: '1040px', width: '100%', margin: '0 auto', padding: '32px 20px', flex: 1, boxSizing: 'border-box' }}>
        {/* Title Banner */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E7ECF3',
            borderLeft: '5px solid #0E7490',
            borderRadius: '16px',
            padding: '28px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '9999px',
              backgroundColor: '#ECFEFF',
              color: '#0E7490',
              fontSize: '0.76rem',
              fontWeight: 700,
              marginBottom: '12px',
            }}
          >
            {route === '/privacy-policy' && <ShieldCheck size={14} />}
            {route === '/terms-of-service' && <FileText size={14} />}
            {route === '/data-deletion' && <Trash2 size={14} />}
            <span>Official Compliance & Data Governance Document</span>
          </div>

          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>
            {route === '/privacy-policy' && 'Privacy Policy'}
            {route === '/terms-of-service' && 'Terms of Service'}
            {route === '/data-deletion' && 'User Data Deletion Instructions'}
          </h1>

          <p style={{ fontSize: '0.92rem', color: '#64748B', margin: 0, lineHeight: 1.6 }}>
            Applicable to <strong>{VERIFIED_OPERATOR_DETAILS.platformName}</strong> (
            <a href={VERIFIED_OPERATOR_DETAILS.platformUrl} style={{ color: '#0E7490', textDecoration: 'none' }}>
              {VERIFIED_OPERATOR_DETAILS.platformUrl}
            </a>
            ) and its official Meta WhatsApp Business Cloud API integration operated by{' '}
            <strong>{VERIFIED_OPERATOR_DETAILS.legalEntityName}</strong>. Last updated: {VERIFIED_OPERATOR_DETAILS.lastUpdated}.
          </p>
        </div>

        {/* =====================================================================
            ROUTE 1: /privacy-policy
            ===================================================================== */}
        {route === '/privacy-policy' && (
          <>
            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <Building2 size={20} color="#0E7490" />
                1. Operator Identity & Scope
              </h2>
              <p style={pStyle}>
                This Privacy Policy explains how <strong>{VERIFIED_OPERATOR_DETAILS.legalEntityName}</strong> (GSTIN:{' '}
                <code>{VERIFIED_OPERATOR_DETAILS.gstin}</code>), having its registered office at{' '}
                <em>{VERIFIED_OPERATOR_DETAILS.registeredAddress}</em> (&ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or
                &ldquo;our&rdquo;), collects, uses, stores, and protects personal and business information through the{' '}
                <strong>{VERIFIED_OPERATOR_DETAILS.platformName}</strong> application hosted at{' '}
                <code>{VERIFIED_OPERATOR_DETAILS.platformUrl}</code> and our connected Meta WhatsApp Business account{' '}
                <strong>{VERIFIED_OPERATOR_DETAILS.whatsappBusinessName}</strong> (<code>{VERIFIED_OPERATOR_DETAILS.whatsappBusinessNumber}</code>).
              </p>
              <p style={{ ...pStyle, marginBottom: 0 }}>
                This policy applies to our employees, job applicants, contractors, customers, business contacts whose visiting cards or
                contact details are recorded in our CRM directory, and individuals who communicate with us via WhatsApp.
              </p>
            </section>

            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <Database size={20} color="#0E7490" />
                2. Categories of Data We Collect & Process
              </h2>
              <p style={pStyle}>
                Based on the active modules in BUSINZ HRMS, we process the following categories of data:
              </p>
              <ul style={ulStyle}>
                <li>
                  <strong>Employee & Workforce Profile Data:</strong> Full name, employee code (e.g., <code>VRM-XXX</code>), gender, date of
                  birth, marital status, mobile number, email address, current and permanent residential addresses, emergency contact
                  details, educational qualifications, prior employment history, department, designation, shift assignment, reporting
                  manager, and uploaded onboarding/identity documents.
                </li>
                <li>
                  <strong>Payroll, Statutory & Financial Records:</strong> Basic salary, allowances (HRA, transport, medical, special),
                  gross/CTC structure, payslips, bank account number, IFSC code, bank branch, PAN number, UAN/Provident Fund details,
                  overtime records, business expense claims, petty cash entries, and salary advance/loan repayment schedules.
                </li>
                <li>
                  <strong>Face Attendance & Field GPS Location Data:</strong> Check-in and check-out timestamps (recorded in{' '}
                  <code>Asia/Kolkata</code> timezone), live camera photographs captured at punch-in and punch-out for facial verification,
                  GPS latitude and longitude coordinates, location accuracy in meters, office geofence validation status, reverse-geocoded
                  street/area addresses, and route location points logged during active field duty sessions.
                </li>
                <li>
                  <strong>Business Contact Scanner & Customer Directory Data:</strong> Contact names, company names, designations, phone
                  numbers, WhatsApp numbers, email addresses, business addresses, GST numbers, visiting card images, OCR-extracted card
                  fields, and customer site visit logs captured by authorized staff.
                </li>
                <li>
                  <strong>WhatsApp Business Cloud API & CRM Messaging Data:</strong> Phone numbers (normalized in E.164 format), profile
                  names, contact category (<code>HRMS_EMPLOYEE</code>, <code>VISITING_CARD</code>, <code>CUSTOMER</code>,{' '}
                  <code>MANUAL</code>), messaging consent status (<code>OPTED_IN</code>, <code>OPTED_OUT</code>, <code>UNKNOWN</code>),
                  inbound and outbound message text, approved WhatsApp template messages, media attachments (images, PDFs/documents, audio,
                  video URLs and metadata), Meta message identifiers (<code>wamid</code>), conversation state, and message delivery/read
                  status timestamps received via Meta webhooks.
                </li>
                <li>
                  <strong>Authentication & Security Audit Logs:</strong> Bcrypt-hashed account passwords, one-time verification codes (email
                  or mobile OTP), session tokens, role-based access control (RBAC) logs, and attendance/policy modification audit trails.
                </li>
              </ul>
            </section>

            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <MessageSquare size={20} color="#0E7490" />
                3. How We Use Information & WhatsApp Integration Practices
              </h2>
              <p style={pStyle}>We process personal and business data strictly for legitimate workforce and business operations:</p>
              <ul style={ulStyle}>
                <li>
                  <strong>Workforce & Attendance Administration:</strong> Recording daily shift attendance, verifying presence at office
                  geofences or assigned field sites, calculating working hours and eligible overtime, and processing leave requests.
                </li>
                <li>
                  <strong>Payroll & Statutory Compliance:</strong> Calculating monthly salaries, statutory deductions, overtime payouts,
                  reimbursements, and generating employee payslips.
                </li>
                <li>
                  <strong>WhatsApp Business Communications:</strong> Sending and receiving operational notifications (such as attendance
                  confirmations, leave approval status, payslip alerts, and business/customer support messages) and approved WhatsApp
                  template broadcasts to opted-in contacts via the official Meta WhatsApp Business Cloud API.
                </li>
                <li>
                  <strong>Security & Access Control:</strong> Enforcing role-based permissions across Employee, HR, Accounts, Manager, and
                  CEO roles, preventing unauthorized access, and maintaining immutable audit logs.
                </li>
              </ul>
              <p style={{ ...pStyle, marginBottom: 0 }}>
                We do <strong>not</strong> sell, rent, or trade employee personal data, WhatsApp phone numbers, or chat logs to third-party
                data brokers or external advertisers.
              </p>
            </section>

            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <Server size={20} color="#0E7490" />
                4. Service Providers & Third-Party Integrations
              </h2>
              <p style={pStyle}>
                To operate BUSINZ HRMS, data is processed through the following technical infrastructure and service providers:
              </p>
              <ul style={ulStyle}>
                <li>
                  <strong>Meta Platforms, Inc. (WhatsApp Business Cloud API):</strong> Processes outbound and inbound WhatsApp messages,
                  approved message templates, media attachments, and delivery/read status webhooks via <code>graph.facebook.com</code> in
                  accordance with Meta&rsquo;s WhatsApp Business terms.
                </li>
                <li>
                  <strong>Hostinger VPS Cloud Infrastructure:</strong> Hosts our isolated application servers and PostgreSQL database
                  supporting <code>https://hrms.businz.com</code>.
                </li>
                <li>
                  <strong>Google LLC (Gmail SMTP & Google Gemini API):</strong> Delivers transactional authentication emails (login OTPs,
                  password resets, and system notifications via <code>smtp.gmail.com</code>) and provides optional AI-assisted visiting card
                  OCR extraction and HR assistant queries when initiated by authorized users.
                </li>
                <li>
                  <strong>OpenStreetMap Nominatim Service:</strong> Resolves attendance and field duty GPS coordinates into readable street
                  and locality names.
                </li>
              </ul>
            </section>

            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <Lock size={20} color="#0E7490" />
                5. Data Security, Retention & Deletion
              </h2>
              <ul style={ulStyle}>
                <li>
                  <strong>Security Controls:</strong> All web and API traffic is encrypted over HTTPS/TLS. User passwords are stored as
                  salted <code>bcrypt</code> hashes. Database access is restricted through an authenticated, role-based backend data gateway
                  that redacts sensitive salary, banking, and personal identity fields from unauthorized roles.
                </li>
                <li>
                  <strong>Data Retention:</strong> Operational HR, attendance, payroll, and CRM records are stored in our PostgreSQL database
                  for the duration of the employment or business relationship, or until removed by an authorized administrator or a validated
                  deletion request. The system does not apply an automatic time-based purge schedule to active database tables. Employment,
                  attendance, payroll, tax, and statutory records must be retained where required under applicable Indian labour, tax, and
                  corporate laws.
                </li>
                <li>
                  <strong>Data Deletion & Opt-Out Rights:</strong> Any user or WhatsApp contact may opt out of WhatsApp communications or
                  request deletion of their contact profile and message history by following the procedure on our{' '}
                  <a
                    href="/data-deletion"
                    onClick={(e) => handleNavClick(e, '/data-deletion')}
                    style={{ color: '#0E7490', fontWeight: 600 }}
                  >
                    User Data Deletion Instructions
                  </a>{' '}
                  page.
                </li>
              </ul>
            </section>
          </>
        )}

        {/* =====================================================================
            ROUTE 2: /terms-of-service
            ===================================================================== */}
        {route === '/terms-of-service' && (
          <>
            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <FileText size={20} color="#0E7490" />
                1. Acceptance of Terms & Platform Purpose
              </h2>
              <p style={pStyle}>
                These Terms of Service govern access to and use of <strong>{VERIFIED_OPERATOR_DETAILS.platformName}</strong> (
                <code>{VERIFIED_OPERATOR_DETAILS.platformUrl}</code>) and its integrated WhatsApp Business communication channels operated
                by <strong>{VERIFIED_OPERATOR_DETAILS.legalEntityName}</strong>.
              </p>
              <p style={{ ...pStyle, marginBottom: 0 }}>
                BUSINZ HRMS is an enterprise workforce management, attendance, payroll, field tracking, business contact scanner, and
                WhatsApp CRM platform provided for authorized employees, administrators, customers, and business contacts of{' '}
                <strong>{VERIFIED_OPERATOR_DETAILS.legalEntityName}</strong>.
              </p>
            </section>

            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <Lock size={20} color="#0E7490" />
                2. Account Access, Authentication & User Responsibilities
              </h2>
              <ul style={ulStyle}>
                <li>
                  <strong>Authorized Access Only:</strong> Login access to BUSINZ HRMS is restricted to onboarded employees, management, HR,
                  and accounting personnel assigned an active account by {VERIFIED_OPERATOR_DETAILS.legalEntityName}.
                </li>
                <li>
                  <strong>Credential Security:</strong> Users must replace temporary onboarding passwords upon first sign-in, maintain the
                  confidentiality of their password and OTP codes, and immediately report any suspected unauthorized access to HR or{' '}
                  <code>{VERIFIED_OPERATOR_DETAILS.supportEmail}</code>.
                </li>
                <li>
                  <strong>Accurate Attendance & Field Reporting:</strong> Employees must submit genuine live camera captures and accurate GPS
                  locations when marking attendance or logging field visits. Attempting to spoof GPS locations, reuse photographs, or mark
                  attendance on behalf of another person is strictly prohibited and subject to disciplinary action.
                </li>
              </ul>
            </section>

            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <MessageSquare size={20} color="#0E7490" />
                3. WhatsApp Business CRM & Messaging Terms
              </h2>
              <ul style={ulStyle}>
                <li>
                  <strong>Compliance with Meta Policies:</strong> All communications sent through the integrated WhatsApp CRM module must
                  comply with the Meta WhatsApp Business Messaging Policy and applicable Indian telecommunications regulations.
                </li>
                <li>
                  <strong>Consent & Template Usage:</strong> Outbound WhatsApp broadcasts and template notifications may only be sent to
                  employees, customers, or business contacts who have provided valid contact details and have not opted out (
                  <code>consent_status != OPTED_OUT</code>). Free-form replies are permitted only within the 24-hour customer service window
                  following an inbound user message; outside that window, only Meta-approved templates may be used.
                </li>
                <li>
                  <strong>Opt-Out Respect:</strong> Recipients may opt out of WhatsApp communications at any time by replying{' '}
                  <code>STOP</code> on WhatsApp or by submitting a request at{' '}
                  <a
                    href="/data-deletion"
                    onClick={(e) => handleNavClick(e, '/data-deletion')}
                    style={{ color: '#0E7490', fontWeight: 600 }}
                  >
                    /data-deletion
                  </a>
                  . Authorized staff must never override or message a contact who has opted out.
                </li>
              </ul>
            </section>

            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <ShieldCheck size={20} color="#0E7490" />
                4. Confidentiality, Availability & Governing Law
              </h2>
              <ul style={ulStyle}>
                <li>
                  <strong>Confidential Business Information:</strong> Employee directory records, payroll structures, customer contact
                  lists, and internal task records accessed within BUSINZ HRMS are confidential property of{' '}
                  {VERIFIED_OPERATOR_DETAILS.legalEntityName} and may only be used for authorized job duties.
                </li>
                <li>
                  <strong>Account Suspension:</strong> Accounts of inactive or terminated personnel, or accounts involved in security or
                  policy violations, may be deactivated immediately by HR or the CEO.
                </li>
                <li>
                  <strong>Governing Law & Jurisdiction:</strong> These Terms are governed by the laws of India, and any disputes shall be
                  subject to the exclusive jurisdiction of the courts in Chennai, Tamil Nadu, India.
                </li>
              </ul>
            </section>
          </>
        )}

        {/* =====================================================================
            ROUTE 3: /data-deletion
            ===================================================================== */}
        {route === '/data-deletion' && (
          <>
            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <Trash2 size={20} color="#0E7490" />
                1. How to Request Data Deletion or WhatsApp Opt-Out
              </h2>
              <p style={pStyle}>
                In accordance with Meta Platform Terms and data protection requirements, individuals whose phone number, WhatsApp messages,
                visiting card details, or personal profile are stored in <strong>{VERIFIED_OPERATOR_DETAILS.platformName}</strong> may
                request deletion of their data or opt out of WhatsApp communications using any of the following verified methods:
              </p>
              <ol style={{ ...ulStyle, paddingLeft: '22px' }}>
                <li>
                  <strong>Submit the Online Data Deletion Request Form Below:</strong> Enter your full name, your registered WhatsApp phone
                  number or email address, and select the data scope to receive an immediate tracking reference ID (<code>DEL-YYYYMMDD-XXXX</code>).
                  If you select WhatsApp CRM deletion/opt-out, your phone number is immediately marked as <code>OPTED_OUT</code> in our
                  database to block outbound template broadcasts while our administrator completes the deletion review.
                </li>
                <li>
                  <strong>Email Request:</strong> Send an email to{' '}
                  <a href={`mailto:${VERIFIED_OPERATOR_DETAILS.supportEmail}?subject=Data%20Deletion%20Request%20-%20BUSINZ%20HRMS`} style={{ color: '#0E7490', fontWeight: 600 }}>
                    {VERIFIED_OPERATOR_DETAILS.supportEmail}
                  </a>{' '}
                  with the subject line <code>&ldquo;Data Deletion Request – BUSINZ HRMS&rdquo;</code> and include your registered phone
                  number or email address.
                </li>
                <li>
                  <strong>Direct WhatsApp Opt-Out:</strong> Reply <code>STOP</code> or <code>UNSUBSCRIBE</code> to our official WhatsApp
                  Business number (<strong>{VERIFIED_OPERATOR_DETAILS.whatsappBusinessNumber}</strong>) or call our office at{' '}
                  <strong>{VERIFIED_OPERATOR_DETAILS.officialPhone}</strong>.
                </li>
              </ol>
            </section>

            {/* Interactive Online Data Deletion Request Form */}
            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <CheckCircle2 size={20} color="#0E7490" />
                2. Submit an Online Data Deletion / Opt-Out Request
              </h2>
              <p style={pStyle}>
                Use this form to log a formal data deletion or WhatsApp opt-out request directly with{' '}
                <strong>{VERIFIED_OPERATOR_DETAILS.legalEntityName}</strong>. No login is required.
              </p>

              {submitError && (
                <div
                  role="alert"
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#B91C1C',
                    fontSize: '0.88rem',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{submitError}</span>
                </div>
              )}

              {submitResult && (
                <div
                  role="status"
                  data-testid="deletion-request-confirmation"
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    color: '#166534',
                    fontSize: '0.9rem',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                    Request Recorded — Reference ID: <code>{submitResult.referenceId}</code>
                  </div>
                  <div style={{ lineHeight: 1.6 }}>{submitResult.message}</div>
                </div>
              )}

              <form onSubmit={handleDeletionSubmit} style={{ display: 'grid', gap: '16px', maxWidth: '640px' }}>
                <div>
                  <label
                    htmlFor="del-full-name"
                    style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}
                  >
                    Full Name *
                  </label>
                  <input
                    id="del-full-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="del-contact-id"
                    style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}
                  >
                    Registered WhatsApp Phone Number or Email Address *
                  </label>
                  <input
                    id="del-contact-id"
                    type="text"
                    required
                    value={contactIdentifier}
                    onChange={(e) => setContactIdentifier(e.target.value)}
                    placeholder="e.g. +91 98765 43210 or name@example.com"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="del-scope"
                    style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}
                  >
                    Records Requested for Deletion *
                  </label>
                  <select
                    id="del-scope"
                    value={requestScope}
                    onChange={(e) => setRequestScope(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.9rem',
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="whatsapp_crm">WhatsApp CRM Contact, Consent & Message History</option>
                    <option value="visiting_card">Scanned Visiting Card / Business Contact Directory Entry</option>
                    <option value="employee_account">Non-Statutory Employee Profile / App Data</option>
                    <option value="all">All Eligible Personal & WhatsApp Records</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="del-details"
                    style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}
                  >
                    Additional Context (Optional)
                  </label>
                  <textarea
                    id="del-details"
                    rows={3}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Specify any details to help us locate your record..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      padding: '12px 22px',
                      borderRadius: '12px',
                      border: 'none',
                      backgroundColor: '#0E7490',
                      color: '#FFFFFF',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {submitting ? 'Submitting Request...' : 'Submit Data Deletion Request'}
                  </button>
                </div>
              </form>
            </section>

            {/* What Is Deleted vs Retained */}
            <section style={sectionCardStyle}>
              <h2 style={h2Style}>
                <Database size={20} color="#0E7490" />
                3. Records Eligible for Deletion vs. Mandatory Statutory Retention
              </h2>
              <p style={pStyle}>
                When a deletion request is verified, we distinguish between discretionary CRM/communication records (which are deleted) and
                statutory employment/financial records (which must be retained by law):
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                      <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Data Category</th>
                      <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Action Upon Verified Request</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                        WhatsApp CRM Contact, Chat Threads & Media Attachments (<code>crm_contacts</code>, <code>crm_conversations</code>,{' '}
                        <code>crm_messages</code>)
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        <strong>Deleted / Opted Out:</strong> Contact is immediately marked <code>OPTED_OUT</code> to stop outbound messages,
                        and conversation/message logs and uploaded media references are permanently deleted from the CRM tables upon review.
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                        Scanned Visiting Cards & Business Contact Directory Entries (<code>customers</code>)
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        <strong>Deleted:</strong> Removed from the contact directory and card storage unless tied to an active commercial
                        invoice or ongoing contract.
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                        Employee Payroll, Attendance, Tax, PF/ESI & Loan/Expense Ledgers (<code>employees</code>,{' '}
                        <code>attendance_records</code>, <code>payroll_records</code>, <code>expenses</code>)
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        <strong>Retained as Required by Law:</strong> For current or former employees of{' '}
                        {VERIFIED_OPERATOR_DETAILS.legalEntityName}, core employment history, attendance logs, salary disbursements,
                        provident fund/tax filings, and financial audit records must be retained to comply with applicable Indian labour,
                        income tax, and corporate laws. Non-essential profile fields or login access are deactivated upon exit.
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                        Deletion Request Log & Security Audit Trail
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        <strong>Retained Minimal Record:</strong> A minimal log of the deletion request reference ID and fulfillment date is
                        retained to demonstrate compliance and prevent re-import of opted-out numbers.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* Shared Verified Contact & Operator Card on All 3 Pages */}
        <section style={sectionCardStyle}>
          <h2 style={h2Style}>
            <Phone size={20} color="#0E7490" />
            Verified Business Operator & Contact Details
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
              fontSize: '0.88rem',
              color: '#334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Building2 size={18} color="#0E7490" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700, color: '#0F172A' }}>Legal Entity / Data Controller</div>
                <div>{VERIFIED_OPERATOR_DETAILS.legalEntityName}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>GSTIN: {VERIFIED_OPERATOR_DETAILS.gstin}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <MapPin size={18} color="#0E7490" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700, color: '#0F172A' }}>Registered Office Address</div>
                <div>{VERIFIED_OPERATOR_DETAILS.registeredAddress}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Mail size={18} color="#0E7490" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700, color: '#0F172A' }}>Email & Telephone Contact</div>
                <div>
                  Email:{' '}
                  <a href={`mailto:${VERIFIED_OPERATOR_DETAILS.supportEmail}`} style={{ color: '#0E7490', fontWeight: 600 }}>
                    {VERIFIED_OPERATOR_DETAILS.supportEmail}
                  </a>
                </div>
                <div>Office Phone: {VERIFIED_OPERATOR_DETAILS.officialPhone}</div>
                <div>
                  WhatsApp Business: {VERIFIED_OPERATOR_DETAILS.whatsappBusinessName} ({VERIFIED_OPERATOR_DETAILS.whatsappBusinessNumber})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Globe size={18} color="#0E7490" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700, color: '#0F172A' }}>Official Websites</div>
                <div>
                  HRMS Portal:{' '}
                  <a href={VERIFIED_OPERATOR_DETAILS.platformUrl} style={{ color: '#0E7490' }}>
                    {VERIFIED_OPERATOR_DETAILS.platformUrl}
                  </a>
                </div>
                <div>
                  Corporate Website:{' '}
                  <a href={VERIFIED_OPERATOR_DETAILS.corporateWebsite} target="_blank" rel="noreferrer" style={{ color: '#0E7490' }}>
                    {VERIFIED_OPERATOR_DETAILS.corporateWebsite}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Public Footer */}
      <footer
        style={{
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #E7ECF3',
          padding: '20px',
          fontSize: '0.82rem',
          color: '#64748B',
        }}
      >
        <div
          style={{
            maxWidth: '1040px',
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            © {new Date().getFullYear()} {VERIFIED_OPERATOR_DETAILS.legalEntityName}. All rights reserved.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            <a
              href="/privacy-policy"
              onClick={(e) => handleNavClick(e, '/privacy-policy')}
              style={{ color: '#0E7490', textDecoration: 'none', fontWeight: 600 }}
            >
              Privacy Policy
            </a>
            <a
              href="/terms-of-service"
              onClick={(e) => handleNavClick(e, '/terms-of-service')}
              style={{ color: '#0E7490', textDecoration: 'none', fontWeight: 600 }}
            >
              Terms of Service
            </a>
            <a
              href="/data-deletion"
              onClick={(e) => handleNavClick(e, '/data-deletion')}
              style={{ color: '#0E7490', textDecoration: 'none', fontWeight: 600 }}
            >
              Data Deletion
            </a>
            <a
              href="/"
              onClick={(e) => handleNavClick(e, '/')}
              style={{ color: '#475569', textDecoration: 'none', fontWeight: 600 }}
            >
              Employee Sign In
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
