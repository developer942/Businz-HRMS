import { getApiBaseUrl } from '../config/api';
import { authService } from './authService';
import type {
  FieldAllowanceDecision, FieldAllowanceDetail, FieldAllowanceDistribution, FieldAllowanceRequest,
  FieldAllowanceRequestPayload, FieldAllowanceSummary,
} from '../types/fieldAllowance';

const base = () => `${getApiBaseUrl()}/field-allowance`;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = authService.getToken();
  const response = await fetch(`${base()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = body?.error?.details;
    throw new Error(details?.length ? details.map((item: any) => item.message).filter(Boolean).join(', ') : body?.error?.message || 'Unable to complete the request');
  }
  return body.data as T;
}

const queryString = (filters: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  const value = params.toString();
  return value ? `?${value}` : '';
};

export const fieldAllowanceService = {
  list: (filters: { status?: string; department?: string; search?: string; scope?: 'mine' } = {}) =>
    request<FieldAllowanceRequest[]>(`/requests${queryString(filters)}`),
  detail: (id: string) => request<FieldAllowanceDetail>(`/requests/${id}`),
  create: (payload: FieldAllowanceRequestPayload) => request<FieldAllowanceRequest>('/requests', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: FieldAllowanceRequestPayload) => request<FieldAllowanceRequest>(`/requests/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  decide: (id: string, payload: { decision: FieldAllowanceDecision; approvedAmount?: number; remarks?: string }) =>
    request<FieldAllowanceRequest>(`/requests/${id}/decision`, { method: 'POST', body: JSON.stringify(payload) }),
  distribute: (id: string, payload: { distributedAmount: number; distributionDate: string; paymentMethod: string; referenceNumber?: string; remarks?: string }) =>
    request<FieldAllowanceDistribution>(`/requests/${id}/distributions`, { method: 'POST', body: JSON.stringify(payload) }),
  addDailyReport: (id: string, payload: { expenseDate: string; category: string; amount: number; description: string; attachmentPath?: string }) =>
    request(`/requests/${id}/daily-reports`, { method: 'POST', body: JSON.stringify(payload) }),
  complete: (id: string) => request<FieldAllowanceRequest>(`/requests/${id}/complete`, { method: 'POST' }),
  summary: () => request<FieldAllowanceSummary>('/summary'),
  distributions: (filters: { search?: string; startDate?: string; endDate?: string } = {}) =>
    request<FieldAllowanceDistribution[]>(`/distributions${queryString(filters)}`),
};
