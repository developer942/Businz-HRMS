import { API_BASE_URL } from '../config/api';
import { Expense } from '../types/hrms';

const getToken = () => localStorage.getItem('vrm_auth_token') || sessionStorage.getItem('vrm_auth_token') || localStorage.getItem('token');

export const createExpenseClaim = async (expense: Omit<Expense, 'id' | 'status'>): Promise<Expense> => {
  const response = await fetch(`${API_BASE_URL}/expenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
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
  const response = await fetch(`${API_BASE_URL}/expenses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !Array.isArray(body.data)) {
    throw new Error(body?.error?.message || 'Expense claims could not be loaded.');
  }
  return body.data as Expense[];
};

export const approveExpenseApi = async (id: string): Promise<Expense> => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/expenses/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.error?.message || 'Expense claim approval failed.');
  }
  return body.data as Expense;
};

export const rejectExpenseApi = async (id: string, rejectionReason: string): Promise<Expense> => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/expenses/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
  transactionRef?: string;
  remarks?: string;
}): Promise<Expense> => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/expenses/${encodeURIComponent(id)}/disburse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(details),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.error?.message || 'Expense claim disbursement recording failed.');
  }
  return body.data as Expense;
};
