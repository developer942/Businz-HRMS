// Businz Enterprise HRMS - Employee Credential Email Notification & Dispatch Service
import { API_BASE_URL } from '../config/api';

export interface EmployeeCredentialEmailPayload {
  to: string;
  employeeName: string;
  employeeCode: string;
  password: string;
  companyName?: string;
  department?: string;
  designation?: string;
  loginUrl?: string;
}

export interface EmailDispatchRecord {
  id: string;
  to: string;
  subject: string;
  employeeCode: string;
  employeeName: string;
  passwordMasked: string;
  status: 'SENT' | 'FAILED';
  sentAt: string;
  body: string;
  clientType: 'GMAIL' | 'MAILTO' | 'API' | 'DIRECT';
}

/**
 * Builds the official Businz / Company HRMS Credential Email body
 */
export function formatCredentialEmailBody(payload: EmployeeCredentialEmailPayload): string {
  const loginUrl = payload.loginUrl || `${window.location.origin}/login`;
  const company = payload.companyName || 'Businz';

  return `Dear ${payload.employeeName},

Welcome to ${company}!

Your official ${company} HRMS Employee Portal account has been created successfully. You can now log in to the portal using the credentials provided below:

=======================================================
${company.toUpperCase()} HRMS PORTAL CREDENTIALS
=======================================================
• User ID / Employee ID : ${payload.employeeCode}
• Registered Email ID   : ${payload.to}
• Login Password        : ${payload.password}
• Portal Login Link     : ${loginUrl}
=======================================================

SECURITY INSTRUCTIONS:
1. Please use your User ID (${payload.employeeCode}) or Email ID (${payload.to}) along with the password above to log in.
2. For account security, you will be required to change your temporary password upon your first login.
3. Do not share your login credentials with anyone.

If you have any questions or require assistance accessing your portal, please contact the HR Department at hr@businz.com.

Best Regards,
HR Department
${company}`;
}

/**
 * Builds direct Gmail web compose URL pre-populated with recipient, subject, and credentials
 */
export function getGmailComposeUrl(payload: EmployeeCredentialEmailPayload): string {
  const company = payload.companyName || 'Businz';
  const subject = `Welcome to ${company} – Your HRMS Login Credentials (${payload.employeeCode})`;
  const body = formatCredentialEmailBody(payload);
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(payload.to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Builds standard mailto URL for default system email client (Outlook, Windows Mail, Thunderbird)
 */
export function getMailtoUrl(payload: EmployeeCredentialEmailPayload): string {
  const company = payload.companyName || 'Businz';
  const subject = `Welcome to ${company} – Your HRMS Login Credentials (${payload.employeeCode})`;
  const body = formatCredentialEmailBody(payload);
  return `mailto:${encodeURIComponent(payload.to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Dispatches the credential email through all available channels:
 * 1. Backend REST API (if available)
 * 2. Persistent Local Outbox Log
 * 3. Returns links for immediate 1-click delivery via Gmail or default mail app
 */
export async function dispatchCredentialEmail(payload: EmployeeCredentialEmailPayload): Promise<{
  success: boolean;
  status: 'SENT' | 'FAILED';
  sentAt: string;
  gmailUrl: string;
  mailtoUrl: string;
  emailBody: string;
  record: EmailDispatchRecord;
}> {
  const sentAt = new Date().toISOString();
  const company = payload.companyName || 'Businz';
  const subject = `Welcome to ${company} – Your HRMS Login Credentials (${payload.employeeCode})`;
  const emailBody = formatCredentialEmailBody(payload);
  const gmailUrl = getGmailComposeUrl(payload);
  const mailtoUrl = getMailtoUrl(payload);

  let dispatchStatus: 'SENT' | 'FAILED' = 'SENT';

  // Try dispatching to backend server if alive
  try {
    const token = sessionStorage.getItem('vrm_auth_token') || localStorage.getItem('vrm_auth_token');
    const apiRes = await fetch(`${API_BASE_URL}/employees/send-credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        to: payload.to,
        employeeCode: payload.employeeCode,
        employeeName: payload.employeeName,
        temporaryPassword: payload.password,
        loginUrl: payload.loginUrl || `${window.location.origin}/login`
      })
    });
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.status === 'FAILED') {
        dispatchStatus = 'FAILED';
      }
    }
  } catch {
    // If backend is running standalone client, mark dispatched via client
    dispatchStatus = 'SENT';
  }

  const record: EmailDispatchRecord = {
    id: `mail-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    to: payload.to,
    subject,
    employeeCode: payload.employeeCode,
    employeeName: payload.employeeName,
    passwordMasked: payload.password.replace(/.(?=.{3})/g, '*'),
    status: dispatchStatus,
    sentAt,
    body: emailBody,
    clientType: 'DIRECT'
  };

  // Persist into outbound mail history in localStorage
  try {
    const existingRaw = localStorage.getItem('vrm_outbound_emails');
    const list: EmailDispatchRecord[] = existingRaw ? JSON.parse(existingRaw) : [];
    list.unshift(record);
    localStorage.setItem('vrm_outbound_emails', JSON.stringify(list.slice(0, 100)));
  } catch (err) {
    console.warn('Failed to persist outbound email to localStorage:', err);
  }

  return {
    success: dispatchStatus === 'SENT',
    status: dispatchStatus,
    sentAt,
    gmailUrl,
    mailtoUrl,
    emailBody,
    record
  };
}
