import { API_BASE_URL } from '../config/api';
import { getTodayKolkata } from '../utils/requestValidation';
import { supabaseDirect } from './supabaseDirectService';

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

export const bulkAssignEmployeesToShift = async (
  shiftId: string,
  employeeIds: string[],
  effectiveFrom: string = getTodayKolkata(),
  shiftName?: string
): Promise<{ success: boolean; updatedCount: number }> => {
  const token = getToken();
  const cleanIds = Array.from(new Set(employeeIds.map(id => String(id).trim()).filter(Boolean)));
  if (cleanIds.length === 0) {
    return { success: false, updatedCount: 0 };
  }

  // 1. Call backend API if available
  try {
    await fetch(`${API_BASE_URL}/shifts/${encodeURIComponent(shiftId)}/assignments`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ employeeIds: cleanIds }),
    });
  } catch {
    // Fallback to direct Supabase below
  }

  // 2. Also persist each assignment directly to shift_assignments and employees.work_shift
  await Promise.all(
    cleanIds.map(async empId => {
      try {
        await supabaseDirect.saveEmployeeShiftAssignment(empId, shiftId, effectiveFrom);
        if (shiftName) {
          await supabaseDirect.updateEmployee(empId, { work_shift: shiftName } as any);
        }
      } catch {
        // Non-fatal per-employee fallback
      }
    })
  );

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('hrms:shift-assignments-changed'));
  }

  return { success: true, updatedCount: cleanIds.length };
};
