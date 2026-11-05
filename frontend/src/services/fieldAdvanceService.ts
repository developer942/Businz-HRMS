import { API_BASE_URL } from '../config/api';
import {
  FieldVisitAdvance,
  FieldVisitDetail,
  FieldVisitExpense,
  FieldVisitSettlement,
  FieldVisitBalanceReturn,
  FieldVisitReimbursement,
  FieldVisitFinancialSummary,
  FundingType,
  FieldVisitStatus,
  ExpenseCategory,
} from '../types/fieldAdvance';

const getToken = () =>
  localStorage.getItem('vrm_auth_token') ||
  sessionStorage.getItem('vrm_auth_token') ||
  localStorage.getItem('token');

const getAuthHeaders = (): Record<string, string> => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const fetchFieldVisits = async (filters?: {
  employeeId?: string;
  fundingType?: FundingType;
  status?: FieldVisitStatus | 'all';
  tab?: string;
  search?: string;
}): Promise<FieldVisitAdvance[]> => {
  const query = new URLSearchParams();
  if (filters?.employeeId) query.set('employeeId', filters.employeeId);
  if (filters?.fundingType) query.set('fundingType', filters.fundingType);
  if (filters?.status && filters.status !== 'all') query.set('status', filters.status);
  if (filters?.tab) query.set('tab', filters.tab);
  if (filters?.search) query.set('search', filters.search);

  const qs = query.toString();
  const url = `${API_BASE_URL}/field-advances${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, { headers: getAuthHeaders() });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !Array.isArray(body.data)) {
    throw new Error(body?.error?.message || 'Field visits could not be loaded.');
  }
  return body.data as FieldVisitAdvance[];
};

export const fetchFieldVisitDetail = async (id: string): Promise<FieldVisitDetail> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/${encodeURIComponent(id)}`, {
    headers: getAuthHeaders(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Field visit detail could not be loaded.');
  }
  return body.data as FieldVisitDetail;
};

export const fetchFieldFinancialSummary = async (): Promise<FieldVisitFinancialSummary> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/summary`, {
    headers: getAuthHeaders(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Financial summary could not be loaded.');
  }
  return body.data as FieldVisitFinancialSummary;
};

export const createFieldVisit = async (data: {
  employee_id: string;
  employee_code?: string;
  employee_name: string;
  department_name?: string | null;
  purpose: string;
  client_name?: string;
  destination: string;
  start_date: string;
  end_date: string;
  funding_type: FundingType;
  requested_amount?: number;
  travel_mode?: string | null;
  justification?: string | null;
  remarks?: string | null;
}): Promise<FieldVisitAdvance> => {
  const response = await fetch(`${API_BASE_URL}/field-advances`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Could not create field visit.');
  }
  return body.data as FieldVisitAdvance;
};

export const approveAdvanceApi = async (
  id: string,
  data: {
    decision: 'Approved' | 'Rejected' | 'Correction Requested';
    approved_amount?: number | null;
    reason?: string | null;
  }
): Promise<FieldVisitAdvance> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/${encodeURIComponent(id)}/approve-advance`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Advance approval update failed.');
  }
  return body.data as FieldVisitAdvance;
};

export const disburseAdvanceApi = async (
  id: string,
  data: {
    amount: number;
    payment_method: 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque';
    payment_reference?: string | null;
    proof_reference?: string | null;
    remarks?: string | null;
  }
): Promise<FieldVisitAdvance> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/${encodeURIComponent(id)}/disburse-advance`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Advance disbursement failed.');
  }
  return body.data as FieldVisitAdvance;
};

export const addDailyExpenseApi = async (
  advanceId: string,
  data: {
    expense_date: string;
    category: ExpenseCategory;
    amount: number;
    description: string;
    receipt_url?: string | null;
    payment_method?: string | null;
    remarks?: string | null;
    receipt_file_name?: string | null;
  }
): Promise<FieldVisitExpense> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/${encodeURIComponent(advanceId)}/expenses`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Could not record daily expense.');
  }
  return body.data as FieldVisitExpense;
};

export const updateDailyExpenseApi = async (
  expenseId: string,
  data: Partial<{
    expense_date: string;
    category: ExpenseCategory;
    amount: number;
    description: string;
    receipt_url?: string | null;
    payment_method?: string | null;
    remarks?: string | null;
    receipt_file_name?: string | null;
  }>
): Promise<FieldVisitExpense> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/expenses/${encodeURIComponent(expenseId)}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Could not update daily expense.');
  }
  return body.data as FieldVisitExpense;
};

export const deleteDailyExpenseApi = async (expenseId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/expenses/${encodeURIComponent(expenseId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.error?.message || 'Could not delete expense item.');
  }
};

export const submitSettlementApi = async (
  advanceId: string,
  remarks?: string | null
): Promise<FieldVisitSettlement> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/${encodeURIComponent(advanceId)}/submit-settlement`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ remarks }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Could not submit settlement.');
  }
  return body.data as FieldVisitSettlement;
};

export const reviewSettlementApi = async (
  advanceId: string,
  data: {
    decision: 'Approved' | 'Rejected' | 'Correction Requested';
    approval_reason?: string | null;
    expense_items?: Array<{
      id: string;
      approval_status: 'Approved' | 'Rejected' | 'Correction Requested';
      rejection_reason?: string | null;
    }>;
  }
): Promise<{ visit: FieldVisitAdvance; settlement: FieldVisitSettlement }> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/${encodeURIComponent(advanceId)}/review-settlement`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Settlement review update failed.');
  }
  return body.data;
};

export const reportBalanceReturnApi = async (
  advanceId: string,
  data: {
    employee_reported_amount: number;
    payment_method: 'Cash Handover' | 'Bank Transfer' | 'UPI' | 'Cheque';
    payment_reference?: string | null;
    proof_reference?: string | null;
    handover_date: string;
    employee_remarks?: string | null;
  }
): Promise<FieldVisitBalanceReturn> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/${encodeURIComponent(advanceId)}/report-return`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Could not report balance return.');
  }
  return body.data as FieldVisitBalanceReturn;
};

export const confirmBalanceReturnApi = async (
  returnId: string,
  data: {
    actual_received_amount: number;
    receipt_date: string;
    accounts_remarks?: string | null;
    status: 'Confirmed' | 'Partial Receipt' | 'Mismatch Reported';
  }
): Promise<FieldVisitBalanceReturn> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/returns/${encodeURIComponent(returnId)}/confirm`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Could not confirm balance receipt.');
  }
  return body.data as FieldVisitBalanceReturn;
};

export const disburseReimbursementApi = async (
  advanceId: string,
  data: {
    amount: number;
    payment_method: 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque';
    payment_reference?: string | null;
    proof_reference?: string | null;
    remarks?: string | null;
  }
): Promise<FieldVisitReimbursement> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/${encodeURIComponent(advanceId)}/disburse-reimbursement`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Could not process reimbursement payment.');
  }
  return body.data as FieldVisitReimbursement;
};

export const fetchCeoMasterAnalytics = async (): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/field-advances/master-analytics`, {
    headers: getAuthHeaders(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Could not load master analytics.');
  }
  return body.data;
};

export const fetchDailyExpenses = async (filters?: {
  employeeId?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}): Promise<any[]> => {
  const query = new URLSearchParams();
  if (filters?.employeeId) query.set('employeeId', filters.employeeId);
  if (filters?.category) query.set('category', filters.category);
  if (filters?.startDate) query.set('startDate', filters.startDate);
  if (filters?.endDate) query.set('endDate', filters.endDate);
  if (filters?.status) query.set('status', filters.status);

  const qs = query.toString();
  const response = await fetch(`${API_BASE_URL}/field-advances/daily-expenses${qs ? `?${qs}` : ''}`, {
    headers: getAuthHeaders(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !Array.isArray(body.data)) {
    throw new Error(body?.error?.message || 'Could not load daily expenses.');
  }
  return body.data;
};

