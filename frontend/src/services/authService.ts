import '../utils/storageGuard';
import type { Role, User } from '../types/hrms';
import { API_BASE_URL } from '../config/api';

const getApiBase = () => `${API_BASE_URL}`;
const TOKEN_KEY = 'vrm_auth_token';
const REFRESH_TOKEN_KEY = 'vrm_refresh_token';
const SESSION_EXPIRED_EVENT = 'hrms:session-expired';
const SESSION_UPDATED_EVENT = 'hrms:session-updated';
const PROACTIVE_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh if access token expires within 5 minutes
const SESSION_REQUEST_TIMEOUT_MS = 8000;

let memoryToken: string | null = null;
let memoryRefreshToken: string | null = null;
let refreshInFlightPromise: Promise<string | null> | null = null;

/**
 * Decodes a JWT payload safely using proper base64url padding and UTF-8 decoding.
 * Fixes the root cause where unpadded base64url strings threw InvalidCharacterError
 * in atob() on ~67% of tokens during network-fallback session restoration.
 */
export const decodeJwtPayload = (token: string | null | undefined): Record<string, any> | null => {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad === 2) b64 += '==';
    else if (pad === 3) b64 += '=';
    else if (pad === 1) return null;

    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const jsonStr =
      typeof TextDecoder !== 'undefined'
        ? new TextDecoder('utf-8').decode(bytes)
        : decodeURIComponent(escape(binary));
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
};

export const isJwtExpired = (token: string | null | undefined, bufferMs = 0): boolean => {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 <= Date.now() + bufferMs;
};

/**
 * Reads the canonical access token from localStorage FIRST (shared across all tabs),
 * falling back to sessionStorage and in-memory state.
 * Fixes the multi-tab race where a stale tab-local sessionStorage token overrode
 * a freshly rotated/re-logged-in localStorage token and triggered a false 401 logout.
 */
const safeGetToken = (): string | null => {
  if (typeof window === 'undefined') return memoryToken;
  try {
    const l = window.localStorage?.getItem(TOKEN_KEY);
    if (l) {
      memoryToken = l;
      return l;
    }
  } catch {}
  try {
    const s = window.sessionStorage?.getItem(TOKEN_KEY);
    if (s) {
      memoryToken = s;
      return s;
    }
  } catch {}
  return memoryToken;
};

const safeGetRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return memoryRefreshToken;
  try {
    const l = window.localStorage?.getItem(REFRESH_TOKEN_KEY);
    if (l) {
      memoryRefreshToken = l;
      return l;
    }
  } catch {}
  try {
    const s = window.sessionStorage?.getItem(REFRESH_TOKEN_KEY);
    if (s) {
      memoryRefreshToken = s;
      return s;
    }
  } catch {}
  return memoryRefreshToken;
};

const safeSetStorageItem = (key: string, value: string, alsoSession = false) => {
  if (key === TOKEN_KEY) {
    memoryToken = value;
  } else if (key === REFRESH_TOKEN_KEY) {
    memoryRefreshToken = value;
  }
  if (typeof window === 'undefined') return;
  if (alsoSession) {
    try {
      window.sessionStorage?.setItem(key, value);
    } catch {}
  }
  try {
    window.localStorage?.setItem(key, value);
    return;
  } catch {
    // QuotaExceededError or SecurityError fallback: clear non-critical keys and retry
    try {
      const keepKeys = new Set([TOKEN_KEY, REFRESH_TOKEN_KEY, 'vrm_hrms_current_user', 'vrm_active_role', 'vrm_active_emp_id', 'vrm_active_module']);
      const keysToDelete: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && !keepKeys.has(k)) keysToDelete.push(k);
      }
      keysToDelete.forEach((k) => {
        try {
          window.localStorage.removeItem(k);
        } catch {}
      });
      window.localStorage?.setItem(key, value);
    } catch {}
  }
};

const safeRemoveStorageItem = (key: string, alsoSession = false) => {
  if (key === TOKEN_KEY) {
    memoryToken = null;
  } else if (key === REFRESH_TOKEN_KEY) {
    memoryRefreshToken = null;
  }
  if (typeof window === 'undefined') return;
  if (alsoSession) {
    try {
      window.sessionStorage?.removeItem(key);
    } catch {}
  }
  try {
    window.localStorage?.removeItem(key);
  } catch {}
};

const emitSessionExpired = (message: string, code?: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message, code } }));
};

const emitSessionUpdated = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT));
};

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
    return safeGetToken();
  },

  getRefreshToken: () => {
    return safeGetRefreshToken();
  },

  clearSession: (reasonMessage?: string, reasonCode?: string) => {
    safeRemoveStorageItem(TOKEN_KEY, true);
    safeRemoveStorageItem(REFRESH_TOKEN_KEY, true);
    safeRemoveStorageItem('vrm_active_role');
    safeRemoveStorageItem('vrm_active_emp_id');
    safeRemoveStorageItem('vrm_hrms_current_user');
    try {
      sessionStorage.removeItem('vrm_task_active_tab');
      sessionStorage.removeItem('vrm_active_module');
    } catch {}
    if (reasonMessage) {
      emitSessionExpired(reasonMessage, reasonCode);
    }
  },

  async logout(): Promise<void> {
    const refreshToken = safeGetRefreshToken();
    const token = safeGetToken();
    try {
      await fetch(`${getApiBase()}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });
    } catch {
      // Offline logout must still clear local credentials immediately
    } finally {
      this.clearSession();
    }
  },

  /**
   * Single-flight token refresh: concurrent 401s or multi-widget mounts share ONE
   * in-flight /auth/refresh request, preventing refresh rotation races.
   * Returns new accessToken on success, null if definitively revoked/expired,
   * or throws on transient network/5xx errors (without clearing session!).
   */
  async refreshAccessToken(): Promise<string | null> {
    if (refreshInFlightPromise) {
      return refreshInFlightPromise;
    }

    refreshInFlightPromise = (async (): Promise<string | null> => {
      const storedRefreshToken = safeGetRefreshToken();
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), SESSION_REQUEST_TIMEOUT_MS) : null;

      try {
        const response = await fetch(`${getApiBase()}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storedRefreshToken ? { refreshToken: storedRefreshToken } : {}),
          ...(controller ? { signal: controller.signal } : {}),
        });

        if (response.status === 401) {
          const body = (await response.json().catch(() => ({}))) as ApiResponse<unknown> & {
            error?: { code?: string; message?: string };
          };
          const code = body?.error?.code || 'REFRESH_TOKEN_EXPIRED';
          const msg = body?.error?.message || 'Your session has expired. Please sign in again.';
          this.clearSession(msg, code);
          return null;
        }

        if (!response.ok) {
          // 500/502/503/504 or transient proxy error — DO NOT log out!
          throw new Error(`Transient session refresh failure (HTTP ${response.status})`);
        }

        const body = (await response.json()) as ApiResponse<{
          accessToken?: string;
          refreshToken?: string;
          user?: AuthUser;
        }>;
        if (!body.data?.accessToken) {
          throw new Error('Refresh response missing accessToken');
        }

        safeSetStorageItem(TOKEN_KEY, body.data.accessToken, true);
        if (body.data.refreshToken) {
          safeSetStorageItem(REFRESH_TOKEN_KEY, body.data.refreshToken, true);
        }
        if (body.data.user?.email) {
          safeSetStorageItem('vrm_hrms_current_user', JSON.stringify(toAppUser(body.data.user)));
        }
        emitSessionUpdated();
        return body.data.accessToken;
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();

    try {
      return await refreshInFlightPromise;
    } finally {
      refreshInFlightPromise = null;
    }
  },

  /**
   * Authenticated fetch wrapper with proactive refresh, single-flight 401 retry,
   * and safe distinction between definitive auth revocation vs transient failures.
   */
  async authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    let token = this.getToken();

    // Proactively refresh access token if expired or expiring within 5 minutes
    if (token && isJwtExpired(token, PROACTIVE_REFRESH_BUFFER_MS)) {
      try {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) token = refreshed;
      } catch {
        // Keep existing token if offline/transiently unreachable; let request proceed or fail cleanly
      }
    }

    const buildHeaders = (bearer: string | null): Headers => {
      const headers = new Headers(init.headers || {});
      if (bearer && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${bearer}`);
      } else if (bearer && headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${bearer}`);
      }
      return headers;
    };

    const response = await fetch(input, {
      ...init,
      credentials: init.credentials || 'include',
      headers: buildHeaders(token),
    });

    if (response.status !== 401) {
      return response;
    }

    // Inspect 401 error code without consuming the caller's response body
    const cloned = response.clone();
    const errBody = (await cloned.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    const errCode = errBody?.error?.code || '';

    if (errCode === 'HRMS_TOKEN_REVOKED' || errCode === 'ACCOUNT_DEACTIVATED') {
      this.clearSession(
        errBody?.error?.message || 'Your session is no longer active. Please sign in again.',
        errCode
      );
      return response;
    }

    // Attempt single-flight refresh on expired/invalid access token and retry once
    if (errCode === 'HRMS_TOKEN_EXPIRED' || errCode === 'HRMS_TOKEN_INVALID' || errCode === 'HRMS_UNAUTHENTICATED' || !errCode) {
      try {
        const freshToken = await this.refreshAccessToken();
        if (freshToken) {
          return await fetch(input, {
            ...init,
            credentials: init.credentials || 'include',
            headers: buildHeaders(freshToken),
          });
        }
      } catch {
        // Transient network error during refresh: do NOT wipe session; return original response
      }
    }

    return response;
  },

  subscribeSessionChanges(callbacks: {
    onSessionExpired?: (message: string, code?: string) => void;
    onSessionUpdated?: () => void;
    onLoggedOutInOtherTab?: () => void;
  }): () => void {
    if (typeof window === 'undefined') return () => {};

    const handleExpired = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string; code?: string }>).detail;
      callbacks.onSessionExpired?.(
        detail?.message || 'Your session has expired. Please sign in again.',
        detail?.code
      );
    };

    const handleUpdated = () => {
      callbacks.onSessionUpdated?.();
    };

    const handleStorage = (ev: StorageEvent) => {
      if (ev.key === TOKEN_KEY) {
        if (!ev.newValue) {
          memoryToken = null;
          memoryRefreshToken = null;
          try {
            window.sessionStorage?.removeItem(TOKEN_KEY);
            window.sessionStorage?.removeItem(REFRESH_TOKEN_KEY);
          } catch {}
          callbacks.onLoggedOutInOtherTab?.();
        } else {
          memoryToken = ev.newValue;
          try {
            window.sessionStorage?.setItem(TOKEN_KEY, ev.newValue);
          } catch {}
          callbacks.onSessionUpdated?.();
        }
      } else if (ev.key === REFRESH_TOKEN_KEY) {
        memoryRefreshToken = ev.newValue;
        try {
          if (ev.newValue) window.sessionStorage?.setItem(REFRESH_TOKEN_KEY, ev.newValue);
          else window.sessionStorage?.removeItem(REFRESH_TOKEN_KEY);
        } catch {}
      }
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    window.addEventListener(SESSION_UPDATED_EVENT, handleUpdated);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
      window.removeEventListener(SESSION_UPDATED_EVENT, handleUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  },

  async login(identifier: string, password: string): Promise<{ user: AuthUser; accessToken: string; refreshToken?: string }> {
    const cleanId = identifier.trim().toLowerCase();
    const cleanPass = password.trim();
    const response = await safeFetch(`${getApiBase()}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: cleanId, password: cleanPass }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Invalid User ID / Email or password.'));
    const body = (await response.json()) as ApiResponse<{ accessToken: string; refreshToken?: string; user: AuthUser }>;
    if (!body.data?.accessToken || !body.data.user) throw new Error('Authentication response was incomplete.');
    safeSetStorageItem(TOKEN_KEY, body.data.accessToken, true);
    if (body.data.refreshToken) {
      safeSetStorageItem(REFRESH_TOKEN_KEY, body.data.refreshToken, true);
    }
    safeSetStorageItem('vrm_hrms_current_user', JSON.stringify(toAppUser(body.data.user)));
    emitSessionUpdated();
    return body.data;
  },

  getCachedSessionUser(allowExpiredForOffline = false): AuthUser | null {
    const token = this.getToken();
    const payload = decodeJwtPayload(token);
    if (payload && !allowExpiredForOffline && typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
      return null;
    }
    if (typeof window !== 'undefined') {
      try {
        const cachedRaw = window.localStorage?.getItem('vrm_hrms_current_user');
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached?.email && (payload || allowExpiredForOffline)) {
            return cached as AuthUser;
          }
        }
      } catch {}
    }
    if (payload?.email) {
      return {
        id: payload.id || payload.employeeId || 'USR-001',
        email: payload.email,
        name: payload.name || 'Employee',
        role: payload.role || 'Employee',
        employeeId: payload.employeeId,
        department: payload.department,
        designation: payload.designation,
        company_id: payload.company_id,
        mustChangePassword: payload.mustChangePassword,
      };
    }
    return null;
  },

  async getCurrentUser(): Promise<AuthUser> {
    let token = this.getToken();
    const refreshToken = this.getRefreshToken();

    // If access token is missing or expired/near-expiry, try refreshing first (supports HttpOnly cookie too)
    if ((!token && refreshToken) || (token && isJwtExpired(token, PROACTIVE_REFRESH_BUFFER_MS))) {
      try {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          token = refreshed;
        } else if (!this.getToken()) {
          throw new Error('Your session has expired. Please sign in again.');
        }
      } catch (refreshErr) {
        // Transient network/server error while refreshing: fall back to cached user if available
        const fallback = this.getCachedSessionUser(true);
        if (fallback) return fallback;
        throw refreshErr;
      }
    }

    if (!token) {
      // One last silent check in case HttpOnly cookie is present after browser cleared localStorage
      try {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          token = refreshed;
        }
      } catch {
        // Offline with no local token -> truly anonymous
      }
    }

    if (!token) throw new Error('No active session');

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), SESSION_REQUEST_TIMEOUT_MS) : null;

    let response: Response;
    try {
      response = await safeFetch(`${getApiBase()}/auth/me`, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch (networkErr) {
      // Temporary network outage / timeout MUST NOT log out a user with a valid session
      const fallbackUser = this.getCachedSessionUser(true);
      if (fallbackUser) return fallbackUser;
      throw networkErr;
    } finally {
      if (timer) clearTimeout(timer);
    }

    // If /auth/me rejected with 401, attempt single-flight refresh before giving up
    if (response.status === 401) {
      const errBody = (await response.clone().json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      const errCode = errBody?.error?.code || '';
      if (errCode === 'HRMS_TOKEN_REVOKED' || errCode === 'ACCOUNT_DEACTIVATED') {
        const msg = errBody?.error?.message || 'Your session has ended. Please sign in again.';
        this.clearSession(msg, errCode);
        throw new Error(msg);
      }

      try {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          const retryRes = await safeFetch(`${getApiBase()}/auth/me`, {
            credentials: 'include',
            headers: { Authorization: `Bearer ${refreshed}` },
          });
          if (retryRes.ok) {
            const retryBody = (await retryRes.json()) as ApiResponse<AuthUser>;
            if (retryBody.data?.email) {
              safeSetStorageItem('vrm_hrms_current_user', JSON.stringify(toAppUser(retryBody.data)));
              return retryBody.data;
            }
          }
        }
      } catch {
        // Network/5xx during refresh: fall back gracefully without clearing session
        const fallbackUser = this.getCachedSessionUser(true);
        if (fallbackUser) return fallbackUser;
      }

      const msg = errBody?.error?.message || 'Your session has expired. Please sign in again.';
      this.clearSession(msg, errCode || 'HRMS_TOKEN_EXPIRED');
      throw new Error(msg);
    }

    if (response.status === 403) {
      // Do NOT clearSession on 403 (e.g. PASSWORD_CHANGE_REQUIRED or role guard)
      const errBody = (await response.clone().json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      const fallbackUser = this.getCachedSessionUser(false);
      if (errBody?.error?.code === 'PASSWORD_CHANGE_REQUIRED' && fallbackUser) {
        return { ...fallbackUser, mustChangePassword: true };
      }
      if (fallbackUser) return fallbackUser;
      throw new Error(errBody?.error?.message || 'Access denied.');
    }

    if (!response.ok) {
      // 500/502/503/504 backend restart / temporary outage -> preserve session!
      const fallbackUser = this.getCachedSessionUser(true);
      if (fallbackUser) return fallbackUser;
      throw new Error(await readError(response, 'Unable to verify session at this moment.'));
    }

    const body = (await response.json()) as ApiResponse<AuthUser>;
    if (!body.data?.email) {
      const fallbackUser = this.getCachedSessionUser(true);
      if (fallbackUser) return fallbackUser;
      throw new Error('Authentication response was incomplete.');
    }
    safeSetStorageItem('vrm_hrms_current_user', JSON.stringify(toAppUser(body.data)));
    return body.data;
  },

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
    const token = this.getToken();
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    const response = await this.authFetch(`${getApiBase()}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Password could not be changed.'));
    const body = (await response.json()) as ApiResponse<{ accessToken?: string; refreshToken?: string }>;
    if (body.data?.accessToken) {
      safeSetStorageItem(TOKEN_KEY, body.data.accessToken, true);
    }
    if (body.data?.refreshToken) {
      safeSetStorageItem(REFRESH_TOKEN_KEY, body.data.refreshToken, true);
    }
    emitSessionUpdated();
  },

  /**
   * Request 6-digit OTP verification code for password reset.
   * Calls backend POST /auth/forgot-password. Never exposes OTP in API response.
   */
  async forgotPassword(emailOrEmployeeId: string): Promise<{
    success: boolean;
    message: string;
    expiresInSeconds: number;
    resendCooldownSeconds: number;
  }> {
    const cleanId = emailOrEmployeeId.trim().toLowerCase();
    const response = await safeFetch(`${getApiBase()}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_or_employee_id: cleanId }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Password reset request failed.'));
    const body = (await response.json()) as ApiResponse<{
      expiresInSeconds?: number;
      resendCooldownSeconds?: number;
    }> & { message?: string };
    return {
      success: true,
      message:
        body.message ||
        'If an active account matches your details, a verification code has been sent to the registered email address.',
      expiresInSeconds: body.data?.expiresInSeconds ?? 300,
      resendCooldownSeconds: body.data?.resendCooldownSeconds ?? 60,
    };
  },

  /**
   * Verifies the 6-digit OTP (5-minute expiry, limited attempts).
   */
  async verifyResetOtp(emailOrEmployeeId: string, otp: string): Promise<{ success: boolean; resetToken: string }> {
    const cleanId = emailOrEmployeeId.trim().toLowerCase();
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
   * Resets the password using the single-use verified resetToken.
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

  /**
   * Retrieves public OTP login capabilities (Email OTP & Mobile SMS OTP status) without exposing credentials.
   */
  async getOtpConfig(): Promise<{
    emailOtpEnabled: boolean;
    mobileOtpEnabled: boolean;
    dltCompliant: boolean;
    mobileOtpStatusMessage: string;
  }> {
    try {
      const response = await safeFetch(`${getApiBase()}/auth/otp-config`);
      if (!response.ok) {
        return {
          emailOtpEnabled: true,
          mobileOtpEnabled: false,
          dltCompliant: false,
          mobileOtpStatusMessage:
            'Mobile OTP login is disabled until an authorized Indian DLT-compliant SMS provider is configured.',
        };
      }
      const body = (await response.json()) as ApiResponse<{
        emailOtpEnabled: boolean;
        mobileOtpEnabled: boolean;
        dltCompliant: boolean;
        mobileOtpStatusMessage: string;
      }>;
      return (
        body.data || {
          emailOtpEnabled: true,
          mobileOtpEnabled: false,
          dltCompliant: false,
          mobileOtpStatusMessage:
            'Mobile OTP login is disabled until an authorized Indian DLT-compliant SMS provider is configured.',
        }
      );
    } catch {
      return {
        emailOtpEnabled: true,
        mobileOtpEnabled: false,
        dltCompliant: false,
        mobileOtpStatusMessage:
          'Mobile OTP login is disabled until an authorized Indian DLT-compliant SMS provider is configured.',
      };
    }
  },

  /**
   * Requests a single-use 5-minute Email OTP for passwordless login.
   */
  async requestEmailOtpLogin(email: string): Promise<{
    success: boolean;
    message: string;
    expiresInSeconds: number;
    resendCooldownSeconds: number;
  }> {
    const cleanEmail = email.trim().toLowerCase();
    const response = await safeFetch(`${getApiBase()}/auth/otp-login/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Unable to send sign-in verification code.'));
    const body = (await response.json()) as ApiResponse<{
      expiresInSeconds?: number;
      resendCooldownSeconds?: number;
    }> & { message?: string };
    return {
      success: true,
      message:
        body.message ||
        'If an eligible employee account matches this email, a one-time sign-in code has been sent.',
      expiresInSeconds: body.data?.expiresInSeconds ?? 300,
      resendCooldownSeconds: body.data?.resendCooldownSeconds ?? 60,
    };
  },

  /**
   * Verifies the 6-digit Email OTP and creates an authenticated session.
   */
  async verifyEmailOtpLogin(email: string, otp: string): Promise<{ user: AuthUser; accessToken: string; refreshToken?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();
    const response = await safeFetch(`${getApiBase()}/auth/otp-login/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, otp: cleanOtp }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Invalid or expired verification code.'));
    const body = (await response.json()) as ApiResponse<{ accessToken: string; refreshToken?: string; user: AuthUser }>;
    if (!body.data?.accessToken || !body.data.user) throw new Error('Authentication response was incomplete.');
    safeSetStorageItem(TOKEN_KEY, body.data.accessToken, true);
    if (body.data.refreshToken) {
      safeSetStorageItem(REFRESH_TOKEN_KEY, body.data.refreshToken, true);
    }
    safeSetStorageItem('vrm_hrms_current_user', JSON.stringify(toAppUser(body.data.user)));
    emitSessionUpdated();
    return body.data;
  },

  /**
   * Requests a single-use 5-minute SMS OTP for verified employee mobile number.
   */
  async requestMobileOtpLogin(mobileNumber: string): Promise<{
    success: boolean;
    message: string;
    normalizedMobile?: string;
    expiresInSeconds: number;
    resendCooldownSeconds: number;
  }> {
    const response = await safeFetch(`${getApiBase()}/auth/mobile-otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile_number: mobileNumber.trim() }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Mobile OTP login is currently unavailable.'));
    const body = (await response.json()) as ApiResponse<{
      normalizedMobile?: string;
      expiresInSeconds?: number;
      resendCooldownSeconds?: number;
    }> & { message?: string };
    return {
      success: true,
      message:
        body.message ||
        'If an active employee account is linked to this verified mobile number, an SMS verification code has been sent.',
      normalizedMobile: body.data?.normalizedMobile,
      expiresInSeconds: body.data?.expiresInSeconds ?? 300,
      resendCooldownSeconds: body.data?.resendCooldownSeconds ?? 60,
    };
  },

  /**
   * Verifies the 6-digit Mobile SMS OTP and creates an authenticated session.
   */
  async verifyMobileOtpLogin(mobileNumber: string, otp: string): Promise<{ user: AuthUser; accessToken: string; refreshToken?: string }> {
    const response = await safeFetch(`${getApiBase()}/auth/mobile-otp/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile_number: mobileNumber.trim(), otp: otp.trim() }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Invalid or expired SMS verification code.'));
    const body = (await response.json()) as ApiResponse<{ accessToken: string; refreshToken?: string; user: AuthUser }>;
    if (!body.data?.accessToken || !body.data.user) throw new Error('Authentication response was incomplete.');
    safeSetStorageItem(TOKEN_KEY, body.data.accessToken, true);
    if (body.data.refreshToken) {
      safeSetStorageItem(REFRESH_TOKEN_KEY, body.data.refreshToken, true);
    }
    safeSetStorageItem('vrm_hrms_current_user', JSON.stringify(toAppUser(body.data.user)));
    emitSessionUpdated();
    return body.data;
  },
};
