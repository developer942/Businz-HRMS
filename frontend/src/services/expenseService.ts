import { API_BASE_URL } from '../config/api';
import { Expense } from '../types/hrms';
import { authService } from './authService';

const getToken = () => authService.getToken();

export const createExpenseClaim = async (expense: Omit<Expense, 'id' | 'status'>): Promise<Expense> => {
  const response = await authService.authFetch(`${API_BASE_URL}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employeeId: expense.employeeId,
      category: expense.category,
      amount: expense.amount,
      date: expense.date,
      description: expense.description,
      receiptUrl: expense.receiptUrl,
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Expense claim could not be saved. Please try again.');
  }
  return body.data as Expense;
};

export const fetchExpenseClaims = async (): Promise<Expense[]> => {
  const token = getToken();
  if (!token) throw new Error('Authentication is required to load expense claims.');
  const response = await authService.authFetch(`${API_BASE_URL}/expenses`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !Array.isArray(body.data)) {
    throw new Error(body?.error?.message || 'Expense claims could not be loaded.');
  }
  return body.data as Expense[];
};

const expenseReceiptCache = new Map<string, { receiptUrl: string; paymentProofPath: string }>();

export const fetchExpenseReceipt = async (
  expenseId: string
): Promise<{ receiptUrl: string; paymentProofPath: string }> => {
  const cached = expenseReceiptCache.get(expenseId);
  if (cached) return cached;
  const response = await authService.authFetch(`${API_BASE_URL}/expenses/${encodeURIComponent(expenseId)}/receipt`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.error?.message || 'Expense receipt could not be loaded.');
  }
  const result = {
    receiptUrl: body.data.receiptUrl || '',
    paymentProofPath: body.data.paymentProofPath || '',
  };
  expenseReceiptCache.set(expenseId, result);
  return result;
};

export const approveExpenseApi = async (id: string): Promise<Expense> => {
  const response = await authService.authFetch(`${API_BASE_URL}/expenses/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.error?.message || 'Expense claim approval failed.');
  }
  return body.data as Expense;
};

export const rejectExpenseApi = async (id: string, rejectionReason: string): Promise<Expense> => {
  const response = await authService.authFetch(`${API_BASE_URL}/expenses/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejectionReason }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.error?.message || 'Expense claim rejection failed.');
  }
  return body.data as Expense;
};

export const disburseExpenseApi = async (id: string, details: {
  amountPaid: number;
  paymentMode: string;
  paymentDate?: string;
  transactionRef?: string;
  paymentProofPath?: string;
  remarks?: string;
}): Promise<Expense> => {
  const response = await authService.authFetch(`${API_BASE_URL}/expenses/${encodeURIComponent(id)}/disburse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.error?.message || 'Expense claim disbursement recording failed.');
  }
  expenseReceiptCache.delete(id);
  return body.data as Expense;
};
