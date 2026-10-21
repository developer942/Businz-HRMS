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
