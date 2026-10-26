// VRM Enterprise HRMS — Production Payroll API Service
import { API_BASE_URL } from '../config/api';

const API_BASE = (import.meta as any).env?.VITE_PAYROLL_API_BASE || API_BASE_URL;

export interface ApiSalaryStructure {
  id?: string;
  employeeId: string;
  monthlySalary: number;
  basicPercentage: number;
  daPercentage: number;
  conveyancePercentage: number;
  hraPercentage: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  isActive?: boolean;
}

export interface ApiPayrollPreviewRequest {
  employee_id: string;
  payroll_month: number;
  payroll_year: number;
  attendance_bonus?: number;
  overtime_hours?: number;
  overtime_rate?: number;
  bonus?: number;
  incentive?: number;
  commission?: number;
  other_earnings?: number;
  lop_days?: number;
  advance_recovery?: number;
  loan_recovery?: number;
  other_deductions?: number;
}

export interface ApiPayrollPreviewResponse {
  employee_id: string;
  payroll_month: number;
  payroll_year: number;
  salary: {
    basic: number;
    da: number;
    conveyance: number;
    hra: number;
  };
  earnings: {
    attendance_bonus: number;
    overtime: number;
    bonus: number;
    incentive: number;
    commission: number;
    others: number;
    gross: number;
  };
  deductions: {
    pf_base: number;
    pf_rate: number;
    pf: number;
    esic_base: number;
    esic_rate: number;
    esic: number;
    professional_tax: number;
    lop: number;
    advance_recovery: number;
    loan_recovery: number;
    other: number;
    total: number;
  };
  net_salary: number;
  breakdown?: {
    earnings: { name: string; category: string; amount: number; description?: string }[];
    deductions: { name: string; category: string; amount: number; description?: string }[];
  };
}

export interface ApiPayrollRun {
  id: string;
  payrollMonth: number;
  payrollYear: number;
  status: 'DRAFT' | 'PROCESSING' | 'PROCESSED' | 'APPROVED' | 'PAID' | 'CANCELLED';
  totalEmployees: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  processedBy?: string;
  approvedBy?: string;
  processedAt?: string;
  approvedAt?: string;
}

export interface ApiPayslip {
  company: {
    companyName: string;
    legalName: string;
    address: string;
    pan: string;
    gst: string;
  };
  employee: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    department: string;
    designation: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
  };
  payroll: {
    month: number;
    year: number;
    monthName: string;
    workingDays: number;
    presentDays: number;
    lopDays: number;
    status: string;
  };
  earnings: {
    basicSalary: number;
    da: number;
    conveyance: number;
    hra: number;
    attendanceBonus: number;
    overtimeAmount: number;
    bonus: number;
    incentive: number;
    commission: number;
    otherEarnings: number;
    grossSalary: number;
  };
  deductions: {
    pf: number;
    pfRate: number;
    esic: number;
    esicRate: number;
    professionalTax: number;
    lopAmount: number;
    advanceRecovery: number;
    loanRecovery: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  netSalary: number;
}

// Request helper with automatic auth header and error unwrapping
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('vrm_auth_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.success === false) {
    const errorMsg = body?.error?.message || `API error (${response.status}): ${response.statusText}`;
    const err = new Error(errorMsg) as Error & { code?: string; details?: unknown[] };
    err.code = body?.error?.code;
    err.details = body?.error?.details;
    throw err;
  }

  return body.data as T;
}

// ==============================================================================
// PAYROLL API CLIENT EXPORTS
// ==============================================================================

export const payrollApi = {
  // Settings
  async getPayrollSettings() {
    return request<unknown>('/payroll/settings');
  },

  async updatePayrollSettings(payload: Record<string, unknown>) {
    return request<unknown>('/payroll/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async getPayrollComponents() {
    return request<unknown>('/payroll/components');
  },

  async updatePayrollComponents(payload: { components: unknown[] }) {
    return request<unknown>('/payroll/components', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async updatePayrollSettingsConfig(payload: Record<string, unknown>) {
    return request<unknown>('/payroll/components', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Salary Structures
  async getSalaryStructure(employeeId: string): Promise<ApiSalaryStructure> {
    return request<ApiSalaryStructure>(`/employees/${employeeId}/salary-structure`);
  },

  async createSalaryStructure(employeeId: string, payload: ApiSalaryStructure): Promise<ApiSalaryStructure> {
    return request<ApiSalaryStructure>(`/employees/${employeeId}/salary-structure`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateSalaryStructure(employeeId: string, structureId: string, payload: ApiSalaryStructure): Promise<ApiSalaryStructure> {
    return request<ApiSalaryStructure>(`/employees/${employeeId}/salary-structure/${structureId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Authoritative Payroll Preview
  async previewPayroll(payload: ApiPayrollPreviewRequest): Promise<ApiPayrollPreviewResponse> {
    return request<ApiPayrollPreviewResponse>('/payroll/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Payroll Runs (Batch processing)
  async getPayrollRuns(): Promise<ApiPayrollRun[]> {
    return request<ApiPayrollRun[]>('/payroll/runs');
  },

  async getPayrollRun(id: string): Promise<ApiPayrollRun> {
    return request<ApiPayrollRun>(`/payroll/runs/${id}`);
  },

  async createPayrollRun(payload: { payroll_month: number; payroll_year: number }): Promise<ApiPayrollRun> {
    return request<ApiPayrollRun>('/payroll/runs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async processPayrollRun(id: string): Promise<ApiPayrollRun> {
    return request<ApiPayrollRun>(`/payroll/runs/${id}/process`, {
      method: 'POST',
    });
  },

  async approvePayrollRun(id: string): Promise<ApiPayrollRun> {
    return request<ApiPayrollRun>(`/payroll/runs/${id}/approve`, {
      method: 'POST',
    });
  },

  async payPayrollRun(id: string): Promise<ApiPayrollRun> {
    return request<ApiPayrollRun>(`/payroll/runs/${id}/pay`, {
      method: 'POST',
    });
  },

  // Records & Payslips
  async getPayrollRecords(params?: { month?: number; year?: number; employeeId?: string }) {
    const query = new URLSearchParams();
    if (params?.month) query.set('month', String(params.month));
    if (params?.year) query.set('year', String(params.year));
    if (params?.employeeId) query.set('employeeId', params.employeeId);
    return request<unknown[]>(`/payroll/records?${query.toString()}`);
  },

  async getPayslip(idOrEmployeeId: string, month = 8, year = 2026): Promise<ApiPayslip> {
    return request<ApiPayslip>(`/payroll/payslips/${idOrEmployeeId}?month=${month}&year=${year}`);
  },

  // Overtime
  async getOvertime() {
    return request<unknown[]>('/overtime');
  },

  async createOvertime(payload: { employee_id: string; date: string; hours: number; hourly_rate?: number; reason?: string }) {
    return request<unknown>('/overtime', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async approveOvertime(id: string) {
    return request<unknown>(`/overtime/${id}/approve`, {
      method: 'PUT',
    });
  },
};
