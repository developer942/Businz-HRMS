import type { Role, User } from '../types/hrms';
import { API_BASE_URL } from '../config/api';

const getApiBase = () => `${API_BASE_URL}`;
const TOKEN_KEY = 'vrm_auth_token';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  employeeId?: string;
  department?: string;
  designation?: string;
  company_id?: string;
  companyId?: string;
  mustChangePassword?: boolean;
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: { message?: string };
}

const normalizeRole = (role?: string): Role => {
  switch (role) {
    case 'CEO':
      return 'CEO';
    case 'Super Admin':
      return 'Super Admin';
    case 'HR Manager':
      return 'HR Manager';
    case 'HR Admin':
      return 'HR Admin';
    case 'Department Head':
      return 'Department Head';
    case 'Department Manager':
      return 'Department Manager';
    case 'Finance Manager':
    case 'Manager':
    case 'Management':
    case 'ERP Administrator':
      return role;
    default:
      return 'Employee';
  }
};

export const resolveEmployeeRole = (row: any): Role => {
  if (!row) return 'Employee';
  const r = (row.role || '').trim();
  const d = (row.designation || '').trim().toLowerCase();
  const roleId = row.role_id || '';

  // Explicit Employee role priority: standard employees always retain Employee role
  if (r === 'Employee') {
    return 'Employee';
  }

  if (
    r === 'CEO' || 
    d === 'ceo' || 
    d.includes('chief executive') || 
    d.includes('managing director') || 
    roleId === '42a8b0c3-22e5-40a0-bf78-2dd14475c6d6'
  ) {
    return 'CEO';
  }
  if (r === 'Super Admin' || d.includes('super admin') || roleId === 'c4f29eb9-d1ae-4d1e-a7ff-15908b2afd59') {
    return 'Super Admin';
  }
  if (r === 'HR Manager' || r === 'HR Admin' || d.includes('hr manager') || d.includes('hr admin') || roleId === '778f15fb-584e-4452-9768-eb305fd09966') {
    return 'HR Manager';
  }
  if (r === 'Finance Manager' || roleId === 'd89d1984-d3ff-4d30-9f0e-3cda85b32e0a') {
    return 'Finance Manager';
  }
  if (r === 'Department Manager' || r === 'Department Head' || roleId === 'eba38dd1-c2c8-4ca9-9cb4-e64292100d09') {
    return 'Department Manager';
  }
  if (r) return normalizeRole(r);
  return 'Employee';
};

export const isCeoOrHrUser = (user?: any): boolean => {
  if (!user) return false;
  const role = (user.role || '').trim();
  const designation = (user.designation || '').trim().toLowerCase();
  const department = (user.department || '').trim().toLowerCase();
  const empId = (user.employeeId || '').trim();

  // CEO / Super Admin / Management / Managing Director
  if (
    role === 'Super Admin' ||
    role === 'CEO' ||
    role === 'Management' ||
    role === 'ERP Administrator' ||
    role === 'Admin' ||
    designation === 'ceo' ||
    designation.includes('chief executive') ||
    designation.includes('managing director') ||
    designation.includes('director') ||
    empId === 'EMP-000'
  ) {
    return true;
  }

  // HR Admin / HR Manager / HR Staff
  if (
    role === 'HR Admin' ||
    role === 'HR Manager' ||
    role === 'HR' ||
    designation.includes('hr') ||
    designation.includes('human resource') ||
    department === 'hr' ||
    department.includes('human resource') ||
    empId === 'EMP-006' || // Pavithra S (HR Manager)
    empId === 'EMP-008'
  ) {
    return true;
  }

  return false;
};

export const toAppUser = (user: AuthUser): User => {
  const compId = user.company_id || user.companyId || (user.email?.toLowerCase().includes('nexus') || user.email?.toLowerCase().includes('companyb') ? 'company-b' : 'company-a');
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    avatar: '',
    employeeId: user.employeeId || '',
    department: user.department || 'General',
    designation: user.designation || user.role || 'Employee',
    company_id: compId,
    companyId: compId,
  };
};

const readError = async (response: Response, fallback: string): Promise<string> => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (response.status === 404) {
      return `Backend API endpoint not found (HTTP 404). Please ensure the Node.js backend is running on the server.`;
    }
    if (response.status >= 500) {
      return `Backend server error (HTTP ${response.status}). Please check server logs.`;
    }
    return `Server responded with HTTP ${response.status}. Please check backend connection.`;
  }
  const body = (await response.json().catch(() => ({}))) as ApiResponse<unknown>;
  return body.error?.message || fallback;
};

const safeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  try {
    return await fetch(input, init);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Cannot connect to backend API (${getApiBase()}). Please ensure the backend server is started and accessible.`);
    }
    throw err;
  }
};

export const authService = {
  getToken: () => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  },

  clearSession: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('vrm_active_role');
    localStorage.removeItem('vrm_active_emp_id');
    localStorage.removeItem('vrm_hrms_current_user');
    try {
      sessionStorage.removeItem('vrm_task_active_tab');
    } catch {}
  },

  async login(identifier: string, password: string): Promise<{ user: AuthUser; accessToken: string }> {
    const cleanId = identifier.trim().toLowerCase();
    const cleanPass = password.trim();
    const response = await safeFetch(`${getApiBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: cleanId, password: cleanPass }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Invalid User ID / Email or password.'));
    const body = (await response.json()) as ApiResponse<{ accessToken: string; user: AuthUser }>;
    if (!body.data?.accessToken || !body.data.user) throw new Error('Authentication response was incomplete.');
    sessionStorage.setItem(TOKEN_KEY, body.data.accessToken);
    localStorage.setItem(TOKEN_KEY, body.data.accessToken);
    localStorage.setItem('vrm_hrms_current_user', JSON.stringify(toAppUser(body.data.user)));
    return body.data;
  },

  async getCurrentUser(): Promise<AuthUser> {
    const token = this.getToken();
    if (!token) throw new Error('No active session');

    const response = await safeFetch(`${getApiBase()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      this.clearSession();
      throw new Error(await readError(response, 'Your session has expired. Please sign in again.'));
    }
    const body = (await response.json()) as ApiResponse<AuthUser>;
    if (!body.data?.email) {
      this.clearSession();
      throw new Error('Authentication response was incomplete.');
    }
    localStorage.setItem('vrm_hrms_current_user', JSON.stringify(toAppUser(body.data)));
    return body.data;
  },

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
    const token = this.getToken();
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    const response = await safeFetch(`${getApiBase()}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
    if (!response.ok) throw new Error(await readError(response, 'Password could not be changed.'));
    const body = (await response.json()) as ApiResponse<{ accessToken?: string }>;
    if (body.data?.accessToken) {
      sessionStorage.setItem(TOKEN_KEY, body.data.accessToken);
      localStorage.setItem(TOKEN_KEY, body.data.accessToken);
    }
  },

  /**
   * Request 6-digit OTP verification code for password reset.
   * Calls backend POST /auth/forgot-password with graceful offline fallback.
   */
  async forgotPassword(emailOrEmployeeId: string): Promise<{
    success: boolean;
    message: string;
    recipientMasked?: string;
    simulatedOtp?: string;
    employeeName?: string;
  }> {
    const cleanId = emailOrEmployeeId.trim().toLowerCase();
    const response = await safeFetch(`${getApiBase()}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_or_employee_id: cleanId }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Password reset request failed.'));
    const body = (await response.json()) as ApiResponse<{ recipientMasked?: string }>;
    return {
      success: true,
      message: 'If this account exists, a verification code has been sent.',
      recipientMasked: body.data?.recipientMasked,
    };
  },

  /**
   * Verifies the 6-digit OTP.
   * Calls backend POST /auth/verify-reset-otp with graceful offline fallback.
   */
  async verifyResetOtp(emailOrEmployeeId: string, otp: string): Promise<{ success: boolean; resetToken: string }> {
    const cleanId = emailOrEmployeeId.trim();
    const cleanOtp = otp.trim();

    const response = await safeFetch(`${getApiBase()}/auth/verify-reset-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_or_employee_id: cleanId, otp: cleanOtp }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Invalid or expired verification code.'));
    const body = (await response.json()) as ApiResponse<{ resetToken: string }>;
    if (!body.data?.resetToken) throw new Error('Password reset response was incomplete.');
    return { success: true, resetToken: body.data.resetToken };
  },

  /**
   * Resets the password using the verified resetToken.
   * Calls backend POST /auth/reset-password with graceful offline fallback.
   */
  async resetPassword(resetToken: string, newPassword: string, confirmPassword: string): Promise<void> {
    if (newPassword !== confirmPassword) {
      throw new Error('New password and confirmation do not match.');
    }

    const response = await safeFetch(`${getApiBase()}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reset_token: resetToken,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to reset password.'));
  },
};


