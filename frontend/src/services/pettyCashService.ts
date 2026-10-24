// VRM Enterprise HRMS - Petty Cash Frontend Service
import { getApiBaseUrl } from '../config/api';
import { authService } from './authService';
import type {
  PettyCashAccount,
  PettyCashRequest,
  PettyCashDisbursement,
  PettyCashReceipt,
  PettyCashExpense,
  PettyCashLedgerEntry,
  PettyCashCategory,
  PettyCashAuditLog,
  PettyCashDashboardSummary,
  AssignCustodianPayload,
  ReconcileCustodianPayload,
  CreatePettyCashRequestPayload,
  CeoApprovalPayload,
  DisburseCashPayload,
  ConfirmReceiptPayload,
  AddExpensePayload,
} from '../types/pettyCash';

const API_BASE = `${getApiBaseUrl()}/petty-cash`;

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  details?: any;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authService.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;

  if (!response.ok) {
    const errorMsg =
      body.message ||
      body.error ||
      (Array.isArray(body.details) ? body.details.map((d: any) => d.message).join(', ') : null) ||
      `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return body.data;
}

export const pettyCashService = {
  // 1. Custodian & Account
  async getActiveCustodianAccount(): Promise<PettyCashAccount | null> {
    return request<PettyCashAccount | null>('/custodian/active');
  },

  async getAccountHistory(): Promise<PettyCashAccount[]> {
    return request<PettyCashAccount[]>('/custodian/history');
  },

  async assignCustodian(payload: AssignCustodianPayload): Promise<PettyCashAccount> {
    return request<PettyCashAccount>('/custodian/assign', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async reconcileAndTransferCustodian(payload: ReconcileCustodianPayload): Promise<PettyCashAccount> {
    return request<PettyCashAccount>('/custodian/reconcile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // 2. Fund Requests
  async requestPettyCash(payload: CreatePettyCashRequestPayload): Promise<PettyCashRequest> {
    return request<PettyCashRequest>('/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getRequests(filters?: { status?: string; employeeId?: string }): Promise<PettyCashRequest[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.employeeId) params.set('employeeId', filters.employeeId);
    const qs = params.toString();
    return request<PettyCashRequest[]>(`/requests${qs ? `?${qs}` : ''}`);
  },

  async approveRequest(requestId: string, payload: CeoApprovalPayload): Promise<PettyCashRequest> {
    return request<PettyCashRequest>(`/requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // 3. Disbursements (Accounts)
  async disburseCash(requestId: string, payload: DisburseCashPayload): Promise<PettyCashDisbursement> {
    return request<PettyCashDisbursement>(`/requests/${requestId}/disburse`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getDisbursements(filters?: { status?: string }): Promise<PettyCashDisbursement[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString();
    return request<PettyCashDisbursement[]>(`/disbursements${qs ? `?${qs}` : ''}`);
  },

  // 4. Receipt Confirmation (Custodian)
  async confirmCashReceipt(
    payload: ConfirmReceiptPayload
  ): Promise<{ receipt: PettyCashReceipt; newBalance: number }> {
    return request<{ receipt: PettyCashReceipt; newBalance: number }>('/receipts/confirm', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        idempotencyKey: payload.idempotencyKey || `rcp-idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      }),
    });
  },

  // 5. Daily Expenses (Custodian)
  async recordDailyExpense(
    payload: AddExpensePayload
  ): Promise<{ expense: PettyCashExpense; newBalance: number; isLowBalance: boolean }> {
    return request<{ expense: PettyCashExpense; newBalance: number; isLowBalance: boolean }>('/expenses', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        idempotencyKey: payload.idempotencyKey || `exp-idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      }),
    });
  },

  async getExpenses(filters?: {
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    isReversed?: boolean;
    flaggedOnly?: boolean;
  }): Promise<PettyCashExpense[]> {
    const params = new URLSearchParams();
    if (filters?.categoryId) params.set('categoryId', filters.categoryId);
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    if (filters?.isReversed !== undefined) params.set('isReversed', String(filters.isReversed));
    if (filters?.flaggedOnly !== undefined) params.set('flaggedOnly', String(filters.flaggedOnly));
    const qs = params.toString();
    return request<PettyCashExpense[]>(`/expenses${qs ? `?${qs}` : ''}`);
  },

  async reverseExpense(
    expenseId: string,
    reason: string
  ): Promise<{ expense: PettyCashExpense; restoredBalance: number }> {
    return request<{ expense: PettyCashExpense; restoredBalance: number }>(`/expenses/${expenseId}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async flagExpense(expenseId: string, reviewNotes?: string): Promise<PettyCashExpense> {
    return request<PettyCashExpense>(`/expenses/${expenseId}/flag`, {
      method: 'POST',
      body: JSON.stringify({ reviewNotes }),
    });
  },

  // 6. Categories
  async getCategories(): Promise<PettyCashCategory[]> {
    return request<PettyCashCategory[]>('/categories');
  },

  async createCategory(categoryName: string, description?: string): Promise<PettyCashCategory> {
    return request<PettyCashCategory>('/categories', {
      method: 'POST',
      body: JSON.stringify({ categoryName, description }),
    });
  },

  // 7. Ledger
  async getLedger(filters?: {
    transactionType?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PettyCashLedgerEntry[]> {
    const params = new URLSearchParams();
    if (filters?.transactionType) params.set('transactionType', filters.transactionType);
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    const qs = params.toString();
    return request<PettyCashLedgerEntry[]>(`/ledger${qs ? `?${qs}` : ''}`);
  },

  // 8. Dashboards & Reports
  async getDashboardSummary(): Promise<PettyCashDashboardSummary> {
    return request<PettyCashDashboardSummary>('/dashboard/summary');
  },

  async getReports(params: {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
    employeeId?: string;
  }): Promise<{
    summary: {
      totalCredits: number;
      totalDebits: number;
      availableBalance: number;
      expenseCount: number;
      creditCount: number;
    };
    categoryWise: Record<string, number>;
    dailyBreakdown: Record<string, number>;
    expenses: PettyCashExpense[];
    disbursements: PettyCashDisbursement[];
    ledger: PettyCashLedgerEntry[];
  }> {
    const q = new URLSearchParams();
    if (params.startDate) q.set('startDate', params.startDate);
    if (params.endDate) q.set('endDate', params.endDate);
    if (params.categoryId) q.set('categoryId', params.categoryId);
    if (params.employeeId) q.set('employeeId', params.employeeId);
    const qs = q.toString();
    return request<any>(`/reports/ledger${qs ? `?${qs}` : ''}`);
  },

  // 9. File Upload
  async uploadAttachment(
    file: File,
    entityType: 'REQUEST' | 'DISBURSEMENT' | 'EXPENSE' | 'RECONCILIATION' = 'EXPENSE'
  ): Promise<{ fileUrl: string; originalFileName: string; fileSize: number }> {
    const token = authService.getToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);

    const response = await fetch(`${API_BASE}/attachments/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.message || 'File upload failed');
    }
    return body.data;
  },
};
