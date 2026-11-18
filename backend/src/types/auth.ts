// VRM Enterprise HRMS - Authenticated Context Types

export type UserRole = 
  | 'Super Admin' 
  | 'CEO' 
  | 'Admin'
  | 'HR'
  | 'HR Manager' 
  | 'HR Admin' 
  | 'Department Manager' 
  | 'Department Head'
  | 'Manager'
  | 'Team Leader'
  | 'Employee' 
  | 'Finance Manager'
  | 'Management'
  | 'ERP Administrator'
  | string;

export type AccountStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED' | 'DEACTIVATED';
export type CredentialEmailStatus = 'PENDING' | 'SENT' | 'FAILED';

export type AuthAuditAction = 
  | 'EMPLOYEE_LOGIN_CREATED'
  | 'CREDENTIAL_EMAIL_SENT'
  | 'CREDENTIAL_EMAIL_RESENT'
  | 'TEMPORARY_LOGIN_RESET'
  | 'EMPLOYEE_LOGIN_DISABLED'
  | 'EMPLOYEE_LOGIN_ENABLED'
  | 'EMPLOYEE_LOGIN_DEACTIVATED'
  | 'EMPLOYEE_LOGIN_ACTIVATED'
  | 'PASSWORD_CHANGED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'FORGOT_PASSWORD_ATTEMPT'
  | 'FORGOT_PASSWORD_RATE_LIMITED'
  | 'FORGOT_PASSWORD_NO_EMAIL'
  | 'PASSWORD_RESET_OTP_SENT'
  | 'PASSWORD_RESET_OTP_FAILED'
  | 'PASSWORD_RESET_OTP_VERIFIED'
  | 'PASSWORD_RESET_SUCCESS'
  | 'PASSWORD_CHANGE_NOTIFICATION_SENT'
  | 'EMAIL_OTP_LOGIN_REQUESTED'
  | 'EMAIL_OTP_LOGIN_VERIFIED'
  | 'EMAIL_OTP_LOGIN_FAILED'
  | 'EMAIL_OTP_PRIVILEGED_BLOCKED'
  | 'MOBILE_OTP_LOGIN_REQUESTED'
  | 'MOBILE_OTP_LOGIN_VERIFIED'
  | 'MOBILE_OTP_LOGIN_FAILED'
  | 'MOBILE_OTP_DUPLICATE_NUMBER'
  | 'MOBILE_OTP_PROVIDER_UNAVAILABLE'
  | 'SMS_PROVIDER_CONFIG_UPDATED'
  | 'CREDENTIAL_SETUP_LINK_SENT'
  | 'ATTENDANCE_MANUAL_OVERRIDE'
  | 'LEAVE_MANUAL_OVERRIDE';

export interface AuthAuditLog {
  id: string;
  action: AuthAuditAction;
  employee_id: string;
  performed_by: string;
  performed_at: string;
  metadata?: Record<string, any>;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  employeeId?: string;
  name?: string;
  department?: string;
  designation?: string;
  company_id?: string;
  companyId?: string;
  mustChangePassword?: boolean;
  accountStatus?: AccountStatus;
  credentialEmailStatus?: CredentialEmailStatus;
  credentialEmailSentAt?: string;
  lastLoginAt?: string;
  tokenVersion?: number;
  passwordChangedAt?: string;
  authMethod?: 'password' | 'email_otp' | 'mobile_otp';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

