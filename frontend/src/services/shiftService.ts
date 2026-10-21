import { API_BASE_URL } from '../config/api';
import { getTodayKolkata } from '../utils/requestValidation';

export interface ShiftAssignmentEmployee {
  id: string;
  employeeId: string;
  name: string;
  department?: string;
}

export interface ShiftAssignmentSummary {
  shiftId: string;
  shiftName: string;
  count: number;
  employees: ShiftAssignmentEmployee[];
}

const getToken = () => localStorage.getItem('vrm_auth_token') || sessionStorage.getItem('vrm_auth_token') || localStorage.getItem('token');

export const getShiftAssignmentSummary = async (): Promise<ShiftAssignmentSummary[]> => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/shifts/assignment-summary?date=${encodeURIComponent(getTodayKolkata())}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !Array.isArray(body.data)) {
    throw new Error(body?.error?.message || 'Unable to load assigned staff counts.');
  }
  return body.data;
};
