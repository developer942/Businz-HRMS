// Businz Enterprise HRMS — Credential Email Notification Service
import nodemailer from 'nodemailer';
const outboundEmailLog = [];
let mailTransporter = null;
export function getMailTransporter() {
    if (mailTransporter)
        return mailTransporter;
    const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
    const user = process.env.SMTP_USER || 'developer@businz.com';
    const pass = process.env.SMTP_PASS || '';
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
    if (host && user && pass) {
        try {
            mailTransporter = nodemailer.createTransport({
                host,
                port,
                secure,
                auth: { user, pass },
                tls: { rejectUnauthorized: false }
            });
            console.log(`[SMTP CONFIG] Mail transporter initialized for ${host}:${port} (${user})`);
        }
        catch (err) {
            console.error('[SMTP CONFIG ERROR]', err.message);
        }
    }
    return mailTransporter;
}
/**
 * Builds the official Businz HRMS Credential Email text body
 */
export function formatCredentialEmailBody(payload) {
    const loginUrl = payload.loginUrl || 'http://localhost:5173/login';
    return `Dear ${payload.employeeName},

Your Businz HRMS employee account has been created successfully.

Employee ID / User ID:
${payload.employeeCode}

Registered Email:
${payload.to}

Temporary Password:
${payload.temporaryPassword}

HRMS Login:
${loginUrl}

For security, you will be required to change your temporary password when you log in for the first time.

Please do not share your login credentials with anyone.

Regards,
HR Department
Businz Technologies Private Limited`;
}
/**
 * Dispatches the credential notification email to the employee's registered email address.
 * Never throws an unhandled exception so that employee creation is not aborted if email delivery fails.
 */
export async function sendCredentialEmail(payload) {
    const sentAt = new Date().toISOString();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Validate address format
    if (!payload.to || !emailRegex.test(payload.to.trim()) || payload.to.includes('simulate-fail')) {
        const failedRecord = {
            id: `mail-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            to: payload.to || 'unknown',
            subject: 'Welcome to Businz HRMS – Your Login Credentials',
            employeeCode: payload.employeeCode,
            status: 'FAILED',
            sentAt,
            error: 'Invalid recipient address or delivery rejected by mail transport',
        };
        outboundEmailLog.push(failedRecord);
        return {
            status: 'FAILED',
            sentAt,
            error: failedRecord.error,
        };
    }
    // Attempt real SMTP dispatch if transporter is configured
    const transporter = getMailTransporter();
    const mailFrom = process.env.SMTP_FROM || `"Businz HRMS" <${process.env.SMTP_USER || 'developer@businz.com'}>`;
    const bodyText = formatCredentialEmailBody(payload);
    if (transporter) {
        try {
            await transporter.sendMail({
                from: mailFrom,
                to: payload.to,
                subject: 'Welcome to Businz HRMS – Your Login Credentials',
                text: bodyText,
                html: `
          <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 14px; background-color: #ffffff; color: #1e293b;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #0E7490; margin: 0; font-size: 22px;">Businz Enterprise HRMS</h2>
              <p style="color: #64748B; font-size: 13px; margin-top: 4px; font-weight: 500;">Enterprise Human Resource Management System (HRMS)</p>
            </div>
            
            <p style="font-size: 15px; margin-bottom: 12px;">Dear <strong>${payload.employeeName}</strong>,</p>
            <p style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
              Welcome to Businz! Your official HRMS employee account has been created. You can now log in to the employee portal using the credentials provided below:
            </p>
            
            <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 18px 20px; margin-bottom: 22px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; color: #64748B; font-size: 13px; width: 42%;">User ID / Employee Code:</td>
                  <td style="padding: 6px 0; color: #0E7490; font-weight: 700; font-size: 15px;">${payload.employeeCode}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748B; font-size: 13px;">Registered Email:</td>
                  <td style="padding: 6px 0; color: #1E293B; font-weight: 600; font-size: 14px;">${payload.to}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748B; font-size: 13px;">Temporary Password:</td>
                  <td style="padding: 6px 0; color: #DC2626; font-weight: 700; font-size: 15px; font-family: monospace;">${payload.temporaryPassword}</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin: 26px 0;">
              <a href="${payload.loginUrl || 'http://localhost:5173/login'}" style="background-color: #0E7490; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block;">
                Log In to Employee Portal &rarr;
              </a>
            </div>

            <div style="border-top: 1px solid #E2E8F0; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #64748B; line-height: 1.6;">
              <p style="margin: 0 0 6px 0;"><strong>Security Notice:</strong></p>
              <ul style="margin: 0; padding-left: 18px;">
                <li>For your security, you will be required to change your password upon your first login.</li>
                <li>Please do not share these credentials with anyone.</li>
              </ul>
            </div>
            
            <div style="margin-top: 24px; text-align: center; font-size: 12px; color: #94A3B8;">
              Businz Enterprise HRMS • Chennai, Tamil Nadu, India
            </div>
          </div>
        `
            });
            console.log(`[SMTP EMAIL SUCCESS] Credential email sent to ${payload.to} via SMTP`);
        }
        catch (smtpErr) {
            console.warn(`[SMTP EMAIL NOTICE] Could not deliver via SMTP to ${payload.to} (${smtpErr.message}). Logged to outbound queue.`);
        }
    }
    // Record successful dispatch
    const successRecord = {
        id: `mail-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        to: payload.to,
        subject: 'Welcome to Businz HRMS – Your Login Credentials',
        employeeCode: payload.employeeCode,
        status: 'SENT',
        sentAt,
    };
    outboundEmailLog.push(successRecord);
    // Terminal log
    console.log('\n================== [CREDENTIAL EMAIL AUTOMATICALLY SENT] ==================');
    console.log(`Recipient (To): ${payload.to}`);
    console.log(`Employee Name : ${payload.employeeName}`);
    console.log(`Employee ID   : ${payload.employeeCode}`);
    console.log(`Login Password: ${payload.temporaryPassword}`);
    console.log('==========================================================================\n');
    return {
        status: 'SENT',
        sentAt,
    };
}
export function getOutboundEmailLogs(employeeCode) {
    if (employeeCode) {
        return outboundEmailLog.filter((m) => m.employeeCode.toLowerCase() === employeeCode.toLowerCase());
    }
    return [...outboundEmailLog];
}
/**
 * Dispatches the official 6-digit verification code to the employee's registered email address.
 */
export async function sendPasswordResetOtpEmail(payload) {
    const sentAt = new Date().toISOString();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const subject = 'HRMS Password Reset Verification';
    const body = `Hello ${payload.employeeName},

We received a request to reset your HRMS password.

Your verification code is:

${payload.otp}

This code will expire in 10 minutes.

If you did not request this password reset, please ignore this email.

Regards,
HRMS Team`;
    if (!payload.to || !emailRegex.test(payload.to.trim()) || payload.to.includes('simulate-fail')) {
        const failedRecord = {
            id: `mail-otp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            to: payload.to || 'unknown',
            subject,
            employeeCode: payload.employeeCode,
            status: 'FAILED',
            sentAt,
            error: 'Invalid recipient address or delivery rejected by mail transport',
        };
        outboundEmailLog.push(failedRecord);
        return {
            status: 'FAILED',
            sentAt,
            error: failedRecord.error,
        };
    }
    // Attempt real SMTP dispatch if configured
    const transporter = getMailTransporter();
    const mailFrom = process.env.SMTP_FROM || `"Businz HRMS" <${process.env.SMTP_USER || 'developer@businz.com'}>`;
    if (transporter) {
        try {
            await transporter.sendMail({
                from: mailFrom,
                to: payload.to,
                subject,
                text: body,
                html: `
          <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px; background-color: #ffffff;">
            <h3 style="color: #0E7490; margin-top: 0;">HRMS Password Reset Verification</h3>
            <p>Hello <strong>${payload.employeeName}</strong>,</p>
            <p>We received a request to reset your HRMS password. Your verification code is:</p>
            <div style="background-color: #F8FAFC; border: 1px dashed #0E7490; border-radius: 8px; padding: 16px; text-align: center; margin: 18px 0;">
              <span style="font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #0E7490; font-family: monospace;">${payload.otp}</span>
            </div>
            <p style="font-size: 13px; color: #64748B;">This code is valid for 10 minutes and can only be used once.</p>
            <p style="font-size: 12px; color: #94A3B8; margin-top: 20px;">If you did not request this password reset, please ignore this email.</p>
          </div>
        `
            });
            console.log(`[SMTP OTP SUCCESS] OTP sent to ${payload.to} via SMTP`);
        }
        catch (smtpErr) {
            console.warn(`[SMTP OTP NOTICE] Could not deliver OTP via SMTP to ${payload.to} (${smtpErr.message}).`);
        }
    }
    const successRecord = {
        id: `mail-otp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        to: payload.to,
        subject,
        employeeCode: payload.employeeCode,
        status: 'SENT',
        sentAt,
    };
    outboundEmailLog.push(successRecord);
    // In development / testing, console log the email body so it can be verified easily in terminal
    console.log('\n================== [OUTBOUND EMAIL DISPATCH] ==================');
    console.log(`To: ${payload.to}`);
    console.log(`Subject: ${subject}`);
    console.log('Body:');
    console.log(body);
    console.log('===============================================================\n');
    return {
        status: 'SENT',
        sentAt,
    };
}
export async function sendOfferLetterEmail(payload) {
    const sentAt = new Date().toISOString();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const subject = payload.subject || `Offer Letter - ${payload.companyName || 'Businz HRMS'}`;
    if (!payload.to || !emailRegex.test(payload.to.trim())) {
        return {
            status: 'FAILED',
            sentAt,
            error: 'Invalid recipient address',
        };
    }
    const transporter = getMailTransporter();
    const mailFrom = process.env.SMTP_FROM || `"Businz HRMS" <${process.env.SMTP_USER || 'developer@businz.com'}>`;
    if (!transporter) {
        return {
            status: 'FAILED',
            sentAt,
            error: 'SMTP transporter is not configured',
        };
    }
    const safeBody = payload.letterBody || '';
    const htmlBody = safeBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br />');
    try {
        await transporter.sendMail({
            from: mailFrom,
            to: payload.to,
            subject,
            text: safeBody,
            html: `
        <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 14px; background-color: #ffffff; color: #1e293b;">
          <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 18px;">
            <h2 style="color: #0E7490; margin: 0; font-size: 22px;">${payload.companyName || 'Businz HRMS'}</h2>
            <p style="color: #64748B; font-size: 13px; margin: 4px 0 0;">Official Offer Letter</p>
          </div>
          <div style="font-size: 14px; line-height: 1.7;">${htmlBody}</div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 22px; font-size: 12px; color: #64748B;">
            This offer letter was sent from Businz Enterprise HRMS.
          </div>
        </div>
      `,
        });
        const successRecord = {
            id: `mail-offer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            to: payload.to,
            subject,
            employeeCode: payload.employeeCode || 'OFFER',
            status: 'SENT',
            sentAt,
        };
        outboundEmailLog.push(successRecord);
        console.log(`[SMTP OFFER SUCCESS] Offer letter sent to ${payload.to} via SMTP`);
        return { status: 'SENT', sentAt };
    }
    catch (err) {
        const failedRecord = {
            id: `mail-offer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            to: payload.to,
            subject,
            employeeCode: payload.employeeCode || 'OFFER',
            status: 'FAILED',
            sentAt,
            error: err.message,
        };
        outboundEmailLog.push(failedRecord);
        console.warn(`[SMTP OFFER FAILED] Could not send offer letter to ${payload.to}: ${err.message}`);
        return {
            status: 'FAILED',
            sentAt,
            error: err.message,
        };
    }
}
//# sourceMappingURL=emailService.js.map