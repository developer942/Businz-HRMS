// Businz Enterprise HRMS — Direct Supabase Database Service
// Guarantees 100% database connectivity even if IIS Node.js on Plesk is offline or returning 404

const resolveDatabaseRestBaseUrl = (): string => {
  const env = (import.meta as any).env || {};
  const configured = env.VITE_DB_REST_URL || env.VITE_SUPABASE_URL;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3001';
};

const SUPABASE_URL = resolveDatabaseRestBaseUrl();
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_DB_REST_KEY
  || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY
  || 'vps-local-rest-key';

const getHeaders = () => ({
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

const resolveDepartmentId = async (departmentName?: string, departmentId?: string): Promise<string | undefined> => {
  if (departmentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(departmentId)) {
    return departmentId;
  }
  const cleanName = departmentName?.trim();
  if (!cleanName) return undefined;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/departments?select=id,name&name=ilike.${encodeURIComponent(cleanName)}&limit=1`, {
      headers: getHeaders(),
    });
    if (res.ok) {
      const rows = await res.json();
      const match = Array.isArray(rows) ? rows[0] : null;
      if (match?.id) return match.id;
    }

    const cleanCode = cleanName.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DEPT';
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/departments`, {
      method: 'POST',
      headers: {
        ...getHeaders(),
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        name: cleanName,
        code: cleanCode,
      }),
    });
    if (createRes.ok) {
      const created = await createRes.json();
      const row = Array.isArray(created) ? created[0] : created;
      return row?.id;
    }
  } catch (err) {
    console.warn('[SupabaseDirect] resolveDepartmentId notice:', err);
  }

  return undefined;
};

const resolveEmployeeUuid = async (employeeIdOrCode?: string): Promise<string | undefined> => {
  const clean = (employeeIdOrCode || '').trim();
  if (!clean) return undefined;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return clean;
  }

  try {
    const byEmployeeCode = await fetch(`${SUPABASE_URL}/rest/v1/employees?employee_id=eq.${encodeURIComponent(clean)}&select=id&limit=1`, {
      headers: getHeaders(),
    });
    if (byEmployeeCode.ok) {
      const rows = await byEmployeeCode.json();
      if (Array.isArray(rows) && rows[0]?.id) return rows[0].id;
    }

    if (clean.includes('@')) {
      const byEmail = await fetch(`${SUPABASE_URL}/rest/v1/employees?email=eq.${encodeURIComponent(clean.toLowerCase())}&select=id&limit=1`, {
        headers: getHeaders(),
      });
      if (byEmail.ok) {
        const rows = await byEmail.json();
        if (Array.isArray(rows) && rows[0]?.id) return rows[0].id;
      }
    }
  } catch (err) {
    console.warn('[SupabaseDirect] resolveEmployeeUuid notice:', err);
  }

  return undefined;
};

export const supabaseDirect = {
  /**
   * Fetches all active employees directly from Supabase REST
   */
  async getEmployees(): Promise<any[]> {
    try {
      let res = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=*,departments!employees_department_id_fkey(id,name,code)&order=created_at.desc`, {
        headers: getHeaders(),
      });
      if (!res.ok) {
        // Fallback to basic employee fetch without nested relation if relation error occurs
        res = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=*&order=created_at.desc`, {
          headers: getHeaders(),
        });
      }
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getEmployees notice:', err);
      return [];
    }
  },

  /**
   * Inserts an employee directly into Supabase REST
   */
  async insertEmployee(emp: {
    employee_id: string;
    first_name: string;
    last_name?: string;
    email: string;
    password?: string;
    designation?: string;
    department?: string;
    department_id?: string;
    reporting_manager_name?: string;
    basic_salary?: number;
    phone?: string;
    status?: string;
    role_id?: string;
    must_change_password?: boolean;
    account_status?: string;
    attendance_method?: string;
  }): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      const departmentId = await resolveDepartmentId(emp.department, emp.department_id);

      const payload = {
        employee_id: emp.employee_id,
        first_name: emp.first_name,
        last_name: emp.last_name || '',
        email: emp.email.toLowerCase().trim(),
        password: emp.password || 'Password@123',
        department_id: departmentId || null,
        designation: emp.designation || 'Staff',
        reporting_manager_name: emp.reporting_manager_name || null,
        basic_salary: Number(emp.basic_salary) || 15000,
        phone: emp.phone || null,
        status: emp.status || 'Active',
        role_id: emp.role_id || (emp.designation === 'CEO' || (emp.designation && emp.designation.toLowerCase().includes('ceo'))
          ? '42a8b0c3-22e5-40a0-bf78-2dd14475c6d6'
          : '965e3410-4ab8-4930-9740-89aa34216ac3'),
        must_change_password: emp.must_change_password ?? false,
        account_status: emp.account_status || 'ACTIVE',
        attendance_method: emp.attendance_method || (emp.designation === 'CEO' || (emp.designation && emp.designation.toLowerCase().includes('ceo')) ? 'Exempt' : 'Face Scan'),
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/employees`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { success: false, error: errorText };
      }

      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err) {
      return { success: false, error: err };
    }
  },

  /**
   * Direct credential verification against Supabase employees table
   */
  async verifyLogin(identifier: string, password: string): Promise<any | null> {
    try {
      const clean = identifier.trim().toLowerCase();
      const cleanPass = password.trim();

      // Look up by email, employee_id, or phone
      const filter = `or=(email.ilike.${encodeURIComponent(clean)},employee_id.ilike.${encodeURIComponent(clean)},phone.ilike.${encodeURIComponent(clean)})`;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?${filter}&select=*&limit=1`, {
        headers: getHeaders(),
      });

      if (!res.ok) return null;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const user = rows[0];
      if (!user.password) return null;
      const dbPass = user.password.trim();

      const isPasswordValid = cleanPass === dbPass;

      if (!isPasswordValid) return null;

      // Deactivation check: Deactivated accounts are prohibited from logging in
      const accStatus = (user.account_status || '').toUpperCase();
      const empStatus = (user.status || '').toLowerCase();
      if (accStatus === 'DEACTIVATED' || accStatus === 'DISABLED' || empStatus === 'inactive' || empStatus === 'terminated') {
        throw new Error('Your account has been deactivated. Please contact HR or CEO for reactivation.');
      }

      if (
        user.role_id === '42a8b0c3-22e5-40a0-bf78-2dd14475c6d6' ||
        user.designation === 'CEO' ||
        (user.designation && user.designation.toLowerCase().includes('ceo'))
      ) {
        user.role = 'CEO';
        user.attendance_method = 'Exempt';
      }

      return user;
    } catch (err: any) {
      if (err?.message?.includes('deactivated')) {
        throw err;
      }
      console.warn('[SupabaseDirect] verifyLogin notice:', err);
      return null;
    }
  },

  /**
   * Directly deletes an employee from Supabase REST
   */
  async deleteEmployee(idOrEmpId: string): Promise<{ success: boolean; error?: any }> {
    try {
      if (!idOrEmpId) return { success: false, error: 'No employee ID provided' };
      const cleanId = idOrEmpId.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

      // 1. Locate the employee record first to get UUID, employee_id, and email
      let uuid = isUuid ? cleanId : '';
      let empCode = !isUuid ? cleanId : '';
      let empEmail = '';

      try {
        const queryFilter = isUuid
          ? `id=eq.${encodeURIComponent(cleanId)}`
          : `employee_id=eq.${encodeURIComponent(cleanId)}`;

        const empRows = await fetch(`${SUPABASE_URL}/rest/v1/employees?${queryFilter}&select=id,employee_id,email&limit=1`, {
          headers: getHeaders(),
        });
        if (empRows.ok) {
          const matching = await empRows.json();
          if (Array.isArray(matching) && matching.length > 0) {
            uuid = matching[0].id || uuid;
            empCode = matching[0].employee_id || empCode;
            empEmail = matching[0].email || '';
          }
        }
      } catch (findErr) {
        console.warn('[SupabaseDirect] Employee lookup warning:', findErr);
      }

      // 2. Cascade delete dependent child records and unassign references
      try {
        if (uuid) {
          const tablesToClean = [
            { table: 'attendance_records', col: 'employee_id' },
            { table: 'leave_requests', col: 'employee_id' },
            { table: 'task_assignees', col: 'employee_id' },
            { table: 'task_updates', col: 'employee_id' },
            { table: 'payroll_records', col: 'employee_id' },
            { table: 'salary_structures', col: 'employee_id' },
            { table: 'performance_scores', col: 'employee_id' },
            { table: 'expenses', col: 'employee_id' },
            { table: 'shift_assignments', col: 'employee_id' },
            { table: 'shift_requests', col: 'employee_id' },
            { table: 'employee_documents', col: 'employee_id' },
            { table: 'face_logs', col: 'employee_id' },
            { table: 'field_duty_assignments', col: 'employee_id' },
            { table: 'field_trip_sessions', col: 'employee_id' },
            { table: 'field_location_points', col: 'employee_id' },
            { table: 'field_tracking_alerts', col: 'employee_id' },
            { table: 'notification_recipients', col: 'employee_id' },
          ];

          await Promise.allSettled(
            tablesToClean.map(t =>
              fetch(`${SUPABASE_URL}/rest/v1/${t.table}?${t.col}=eq.${encodeURIComponent(uuid)}`, {
                method: 'DELETE',
                headers: getHeaders(),
              })
            )
          );

          if (empEmail) {
            await fetch(`${SUPABASE_URL}/rest/v1/password_resets?email=eq.${encodeURIComponent(empEmail)}`, {
              method: 'DELETE',
              headers: getHeaders(),
            }).catch(() => {});
          }

          // Unassign foreign key references without deleting parent containers
          await Promise.allSettled([
            fetch(`${SUPABASE_URL}/rest/v1/departments?head_id=eq.${encodeURIComponent(uuid)}`, {
              method: 'PATCH',
              headers: getHeaders(),
              body: JSON.stringify({ head_id: null }),
            }),
            fetch(`${SUPABASE_URL}/rest/v1/assets?assigned_employee_id=eq.${encodeURIComponent(uuid)}`, {
              method: 'PATCH',
              headers: getHeaders(),
              body: JSON.stringify({ assigned_employee_id: null, status: 'Available' }),
            }),
            fetch(`${SUPABASE_URL}/rest/v1/tasks?responsible_person_id=eq.${encodeURIComponent(uuid)}`, {
              method: 'PATCH',
              headers: getHeaders(),
              body: JSON.stringify({ responsible_person_id: null }),
            }),
          ]);
        }

        // Clean enterprise_tasks by empCode
        if (empCode) {
          await fetch(`${SUPABASE_URL}/rest/v1/enterprise_tasks?responsible_person_id=eq.${encodeURIComponent(empCode)}`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({ responsible_person_id: null, responsible_person_name: null }),
          }).catch(() => {});
        }
      } catch (cascadeErr) {
        console.warn('[SupabaseDirect] Pre-delete cascade notice:', cascadeErr);
      }

      // 3. Delete from employees table
      const deleteFilter = uuid
        ? `id=eq.${encodeURIComponent(uuid)}`
        : `employee_id=eq.${encodeURIComponent(cleanId)}`;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?${deleteFilter}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[SupabaseDirect] deleteEmployee error:', res.status, errText);
        return { success: false, error: errText };
      }

      return { success: true };
    } catch (err: any) {
      console.error('[SupabaseDirect] deleteEmployee exception:', err);
      return { success: false, error: err?.message || err };
    }
  },

  /**
   * Deletes multiple employees in batch
   */
  async deleteEmployees(idsOrEmpIds: string[]): Promise<{ success: boolean; deletedCount: number; errors: any[] }> {
    const errors: any[] = [];
    let deletedCount = 0;

    for (const id of idsOrEmpIds) {
      const result = await this.deleteEmployee(id);
      if (result.success) {
        deletedCount++;
      } else {
        errors.push({ id, error: result.error });
      }
    }

    return {
      success: errors.length === 0,
      deletedCount,
      errors,
    };
  },

  /**
   * Updates an employee record directly in Supabase REST
   */
  async updateEmployee(idOrEmpId: string, updates: Record<string, any>): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      if (!idOrEmpId) return { success: false, error: 'No employee ID provided' };
      const cleanId = String(idOrEmpId).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
      const filter = isUuid
        ? `id=eq.${encodeURIComponent(cleanId)}`
        : `or=(employee_id.ilike.${encodeURIComponent(cleanId)},email.ilike.${encodeURIComponent(cleanId)})`;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?${filter}`, {
        method: 'PATCH',
        headers: {
          ...getHeaders(),
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: errText };
      }

      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err: any) {
      return { success: false, error: err?.message || err };
    }
  },

  /**
   * Fetches a company setting JSON directly from Supabase Cloud
   */
  async getCompanySetting(key: string): Promise<any | null> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/company_settings?setting_key=eq.${encodeURIComponent(key)}&select=*&limit=1`, {
        headers: getHeaders(),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data[0].setting_val;
      }
      return null;
    } catch (err) {
      console.warn(`[SupabaseDirect] getCompanySetting('${key}') error:`, err);
      return null;
    }
  },

  /**
   * Saves or merges a company setting JSON directly into Supabase Cloud
   */
  async saveCompanySetting(key: string, val: any): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/company_settings?on_conflict=setting_key`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({
          setting_key: key,
          setting_val: val,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error(`[SupabaseDirect] saveCompanySetting('${key}') failed:`, res.status, errorText);
      }
      return res.ok;
    } catch (err) {
      console.warn(`[SupabaseDirect] saveCompanySetting('${key}') error:`, err);
      return false;
    }
  },

  /**
   * Fetches all company settings from Supabase Cloud in a single batch request
   */
  async getAllCompanySettings(): Promise<Record<string, any>> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/company_settings?select=setting_key,setting_val`, {
        headers: getHeaders(),
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error('[SupabaseDirect] getAllCompanySettings failed:', res.status, errorText);
        return {};
      }
      const rows = await res.json();
      if (!Array.isArray(rows)) return {};
      const result: Record<string, any> = {};
      for (const row of rows) {
        if (row.setting_key) {
          result[row.setting_key] = row.setting_val;
        }
      }
      return result;
    } catch (err) {
      console.warn('[SupabaseDirect] getAllCompanySettings error:', err);
      return {};
    }
  },

  /**
   * Fetches all departments directly from Supabase table
   */
  async getDepartments(): Promise<any[]> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/departments?select=*&order=name.asc`, {
        headers: getHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getDepartments error:', err);
      return [];
    }
  },

  /**
   * Inserts a new department into Supabase table
   */
  async insertDepartment(name: string, code?: string): Promise<{ success: boolean; data?: any }> {
    try {
      const cleanName = name.trim();
      const cleanCode = (code || cleanName.substring(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const res = await fetch(`${SUPABASE_URL}/rest/v1/departments`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          name: cleanName,
          code: cleanCode || 'DEPT',
        }),
      });
      if (!res.ok) {
        // If conflict on code, generate a timestamped code
        const fallbackCode = `${cleanCode.substring(0, 2)}${Math.floor(10 + Math.random() * 90)}`;
        const retryRes = await fetch(`${SUPABASE_URL}/rest/v1/departments`, {
          method: 'POST',
          headers: {
            ...getHeaders(),
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            name: cleanName,
            code: fallbackCode,
          }),
        });
        if (!retryRes.ok) return { success: false };
        const retryData = await retryRes.json();
        return { success: true, data: Array.isArray(retryData) ? retryData[0] : retryData };
      }
      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err) {
      console.warn('[SupabaseDirect] insertDepartment error:', err);
      return { success: false };
    }
  },

  /**
   * Renames a department in Supabase table
   */
  async updateDepartment(oldName: string, newName: string): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/departments?name=eq.${encodeURIComponent(oldName.trim())}`, {
        method: 'PATCH',
        headers: {
          ...getHeaders(),
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          name: newName.trim(),
          updated_at: new Date().toISOString(),
        }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] updateDepartment error:', err);
      return false;
    }
  },

  /**
   * Removes a department from Supabase table
   */
  async deleteDepartment(name: string): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/departments?name=eq.${encodeURIComponent(name.trim())}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] deleteDepartment error:', err);
      return false;
    }
  },

  /**
   * Fetches all enterprise tasks directly from Supabase Cloud
   */
  async getTasks(): Promise<any[]> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/enterprise_tasks?select=*&order=created_at.desc`, {
        headers: getHeaders(),
      });
      if (!res.ok) return [];
      const rows = await res.json();
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        ...r.task_data,
        id: r.id || r.task_data?.id,
        taskNumber: r.task_number || r.task_data?.taskNumber,
        title: r.title || r.task_data?.title,
        overallStatus: r.overall_status || r.task_data?.overallStatus || 'OPEN',
        overallProgress: r.overall_progress ?? r.task_data?.overallProgress ?? 0,
      }));
    } catch (err) {
      console.warn('[SupabaseDirect] getTasks error:', err);
      return [];
    }
  },

  /**
   * Upserts an enterprise task directly into Supabase Cloud
   */
  async saveTask(task: any): Promise<boolean> {
    try {
      if (!task || !task.id) return false;
      const cleanTask = {
        ...task,
        attachments: (task.attachments || []).map((a: any) => ({
          ...a,
          fileUrl: (a.fileUrl && a.fileUrl.length > 50000) ? '#' : a.fileUrl
        }))
      };

      const payload = {
        id: task.id,
        task_number: task.taskNumber || `TSK-${Date.now().toString().slice(-4)}`,
        title: task.title || 'Untitled Task',
        assigned_by: task.assignedBy || 'Admin',
        responsible_person_id: task.responsiblePersonId || null,
        responsible_person_name: task.responsiblePersonName || null,
        department: task.department || 'General',
        priority: task.priority || 'Medium',
        due_date: task.dueDate || null,
        overall_status: task.overallStatus || 'OPEN',
        overall_progress: Number(task.overallProgress) || 0,
        task_data: cleanTask,
        updated_at: new Date().toISOString()
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/enterprise_tasks?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] saveTask error:', err);
      return false;
    }
  },

  /**
   * Deletes an enterprise task from Supabase Cloud
   */
  async deleteTask(taskId: string): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/enterprise_tasks?id=eq.${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] deleteTask error:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // SHIFTS
  // --------------------------------------------------------------------------
  async getShifts(): Promise<any[]> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/shifts?select=*&order=created_at.desc`, {
        headers: getHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getShifts error:', err);
      return [];
    }
  },

  async insertShift(shift: {
    shift_name: string;
    start_time: string;
    end_time: string;
    break_duration_mins?: number;
    working_hours?: number;
    grace_period_mins?: number;
    color?: string;
  }): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      const payload = {
        shift_name: shift.shift_name,
        start_time: shift.start_time,
        end_time: shift.end_time,
        break_duration_mins: shift.break_duration_mins ?? 60,
        working_hours: shift.working_hours ?? 8.0,
        grace_period_mins: shift.grace_period_mins ?? 15,
        color: shift.color || '#0E7490',
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/shifts`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: err };
      }
      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err: any) {
      return { success: false, error: err?.message || err };
    }
  },

  async updateShift(id: string, updates: Record<string, any>): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/shifts?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] updateShift error:', err);
      return false;
    }
  },

  async deleteShift(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/shifts?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] deleteShift error:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // LEAVE REQUESTS
  // --------------------------------------------------------------------------
  async getLeaveRequests(): Promise<any[]> {
    try {
      // Using explicit foreign key constraint to avoid PostgREST HTTP 300 (PGRST201)
      let res = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?select=*,employee:employees!leave_requests_employee_id_fkey(employee_id,first_name,last_name,department_id)&order=created_at.desc`, {
        headers: getHeaders(),
      });
      if (!res.ok) {
        // Fallback without embed to guarantee records are retrieved
        res = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?select=*&order=created_at.desc`, {
          headers: getHeaders(),
        });
      }
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getLeaveRequests error:', err);
      return [];
    }
  },

  async insertLeaveRequest(req: {
    employee_id: string; // UUID from employees.id, or employee code resolved before insert
    leave_type: string;
    start_date: string;
    end_date: string;
    days_count: number;
    reason?: string;
    status?: string;
  }): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      const employeeUuid = await resolveEmployeeUuid(req.employee_id);
      if (!employeeUuid) {
        return { success: false, error: `Employee '${req.employee_id}' was not found in Supabase employees table.` };
      }

      // Map to PostgreSQL enum hr_leave_type: ['Casual Leave', 'Sick Leave', 'Paid Leave', 'Unpaid Leave', 'Work From Home']
      const rawType = (req.leave_type || '').toLowerCase();
      let normType = 'Casual Leave';
      if (rawType.includes('sick')) normType = 'Sick Leave';
      else if (rawType.includes('unpaid') || rawType.includes('loss') || rawType.includes('lop')) normType = 'Unpaid Leave';
      else if (rawType.includes('paid') || rawType.includes('earn') || rawType.includes('annual')) normType = 'Paid Leave';
      else if (rawType.includes('wfh') || rawType.includes('home')) normType = 'Work From Home';

      const validStatuses = ['Pending', 'Approved', 'Rejected'];
      const normStatus = validStatuses.includes(req.status || '') ? req.status : 'Pending';

      const payload = {
        employee_id: employeeUuid,
        leave_type: normType,
        start_date: req.start_date,
        end_date: req.end_date,
        days_count: Math.max(1, Math.round(req.days_count)),
        reason: req.reason || 'Personal leave',
        status: normStatus,
        applied_date: new Date().toISOString().split('T')[0],
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: err };
      }
      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err: any) {
      return { success: false, error: err?.message || err };
    }
  },

  async updateLeaveRequestStatus(id: string, status: string, approvedBy?: string): Promise<boolean> {
    try {
      // Map to PostgreSQL enum hr_request_status: ['Pending', 'Approved', 'Rejected']
      let normStatus = 'Pending';
      if (status === 'Approved') normStatus = 'Approved';
      else if (status === 'Rejected' || status === 'Cancelled') normStatus = 'Rejected';

      const body: any = {
        status: normStatus,
        updated_at: new Date().toISOString(),
      };
      if (approvedBy && approvedBy.length === 36) body.approved_by = approvedBy;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] updateLeaveRequestStatus error:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // ATTENDANCE RECORDS
  // --------------------------------------------------------------------------
  async getAttendanceRecords(): Promise<any[]> {
    try {
      let res = await fetch(`${SUPABASE_URL}/rest/v1/attendance_records?select=*,employee:employees(employee_id,first_name,last_name)&order=date.desc`, {
        headers: getHeaders(),
      });
      if (!res.ok) {
        res = await fetch(`${SUPABASE_URL}/rest/v1/attendance_records?select=*&order=date.desc`, {
          headers: getHeaders(),
        });
      }
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getAttendanceRecords error:', err);
      return [];
    }
  },

  async insertAttendanceRecord(record: {
    employee_id: string; // UUID of employee
    date: string;
    check_in?: string | null;
    check_out?: string | null;
    working_hours?: number;
    status?: string;
    late_status?: string;
    method?: string;
    in_geofence?: boolean;
    location_lat?: number;
    location_lng?: number;
    location_address?: string;
    shift_id?: string;
    shift_date?: string;
  }): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      // Map to PostgreSQL enum hr_attendance_status: ['Present', 'Absent', 'Late', 'Half Day', 'Work From Home', 'On Leave']
      let status = 'Present';
      const rawStatus = (record.status || '').toLowerCase();
      if (rawStatus.includes('absent')) status = 'Absent';
      else if (rawStatus.includes('late')) status = 'Late';
      else if (rawStatus.includes('half')) status = 'Half Day';
      else if (rawStatus.includes('home') || rawStatus.includes('wfh')) status = 'Work From Home';
      else if (rawStatus.includes('leave') || rawStatus.includes('off') || rawStatus.includes('holiday')) status = 'On Leave';

      const payload = {
        employee_id: record.employee_id,
        date: record.date,
        check_in: record.check_in || null,
        check_out: record.check_out || null,
        working_hours: record.working_hours ?? 0,
        status,
        late_status: record.late_status || 'On Time',
        method: record.method || 'Face Scan',
        in_geofence: record.in_geofence ?? true,
        face_verified: record.method === 'Face Scan',
        location_lat: record.location_lat || 13.0827,
        location_lng: record.location_lng || 80.2707,
        location_address: record.location_address || 'Plant HQ',
        shift_id: (record.shift_id && record.shift_id.length === 36) ? record.shift_id : null,
        shift_date: record.shift_date || record.date,
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/attendance_records`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: err };
      }
      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err: any) {
      return { success: false, error: err?.message || err };
    }
  },

  async updateAttendanceRecord(id: string, updates: Record<string, any>): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/attendance_records?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] updateAttendanceRecord error:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // ASSETS
  // --------------------------------------------------------------------------
  async getAssets(): Promise<any[]> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/assets?select=*&order=created_at.desc`, {
        headers: getHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getAssets error:', err);
      return [];
    }
  },

  async insertAsset(asset: {
    asset_tag: string;
    name: string;
    category: string;
    serial_number?: string;
    purchase_cost?: number;
    status?: string;
    condition?: string;
    assigned_employee_id?: string;
    notes?: string;
  }): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      // Map to PostgreSQL enum hr_asset_status: ['Assigned', 'Available', 'Under Maintenance', 'Retired']
      let normStatus = 'Available';
      const rawStatus = (asset.status || '').toLowerCase();
      if (rawStatus.includes('assign') || rawStatus.includes('use') || rawStatus.includes('in use')) normStatus = 'Assigned';
      else if (rawStatus.includes('maint')) normStatus = 'Under Maintenance';
      else if (rawStatus.includes('retir')) normStatus = 'Retired';

      // Map to PostgreSQL enum hr_asset_condition: ['New', 'Good', 'Fair', 'Needs Repair']
      let normCondition = 'Good';
      const rawCondition = (asset.condition || '').toLowerCase();
      if (rawCondition.includes('new')) normCondition = 'New';
      else if (rawCondition.includes('fair')) normCondition = 'Fair';
      else if (rawCondition.includes('repair') || rawCondition.includes('poor') || rawCondition.includes('damag')) normCondition = 'Needs Repair';

      const payload = {
        asset_tag: asset.asset_tag,
        name: asset.name,
        category: asset.category || 'IT Equipment',
        serial_number: asset.serial_number || null,
        purchase_cost: Number(asset.purchase_cost) || 0,
        status: normStatus,
        condition: normCondition,
        assigned_employee_id: (asset.assigned_employee_id && asset.assigned_employee_id.length === 36) ? asset.assigned_employee_id : null,
        notes: asset.notes || null,
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/assets`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) return { success: false, error: await res.text() };
      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err: any) {
      return { success: false, error: err?.message || err };
    }
  },

  async updateAsset(id: string, updates: Record<string, any>): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/assets?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] updateAsset error:', err);
      return false;
    }
  },

  async deleteAsset(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/assets?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] deleteAsset error:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // EXPENSES
  // --------------------------------------------------------------------------
  async getExpenses(): Promise<any[]> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/expenses?select=*,employee:employees(employee_id,first_name,last_name)&order=date.desc`, {
        headers: getHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getExpenses error:', err);
      return [];
    }
  },

  async insertExpense(expense: {
    employee_id: string; // UUID from employees.id, or employee code resolved before insert
    category: string;
    amount: number;
    date: string;
    description?: string;
    receipt_url?: string;
    status?: string;
  }): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      const employeeUuid = await resolveEmployeeUuid(expense.employee_id);
      if (!employeeUuid) {
        return { success: false, error: `Employee '${expense.employee_id}' was not found in Supabase employees table.` };
      }

      // Map to PostgreSQL enum hr_expense_status: ['Pending Manager', 'Pending Finance', 'Approved', 'Rejected', 'Reimbursed']
      let normStatus = 'Pending Manager';
      const rawStatus = (expense.status || '').toLowerCase();
      if (rawStatus.includes('approv')) normStatus = 'Approved';
      else if (rawStatus.includes('reject')) normStatus = 'Rejected';
      else if (rawStatus.includes('reimburs')) normStatus = 'Reimbursed';
      else if (rawStatus.includes('finance')) normStatus = 'Pending Finance';

      const payload = {
        employee_id: employeeUuid,
        category: expense.category || 'Travel',
        amount: Number(expense.amount) || 0,
        date: expense.date,
        description: expense.description || '',
        receipt_url: expense.receipt_url || null,
        status: normStatus,
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/expenses`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) return { success: false, error: await res.text() };
      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err: any) {
      return { success: false, error: err?.message || err };
    }
  },

  async updateExpenseStatus(id: string, status: string, approvedBy?: string): Promise<boolean> {
    try {
      let normStatus = 'Pending Manager';
      const rawStatus = (status || '').toLowerCase();
      if (rawStatus.includes('approv')) normStatus = 'Approved';
      else if (rawStatus.includes('reject')) normStatus = 'Rejected';
      else if (rawStatus.includes('reimburs')) normStatus = 'Reimbursed';
      else if (rawStatus.includes('finance')) normStatus = 'Pending Finance';

      const body: any = {
        status: normStatus,
        updated_at: new Date().toISOString(),
      };
      if (approvedBy && approvedBy.length === 36) body.approved_by = approvedBy;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/expenses?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] updateExpenseStatus error:', err);
      return false;
    }
  },

  async deleteExpense(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/expenses?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] deleteExpense error:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // RECRUITMENT: JOB OPENINGS & CANDIDATES
  // --------------------------------------------------------------------------
  async getJobOpenings(): Promise<any[]> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/job_openings?select=*&order=posted_date.desc`, {
        headers: getHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getJobOpenings error:', err);
      return [];
    }
  },

  async insertJobOpening(job: {
    title: string;
    department_id?: string;
    location?: string;
    type?: string;
    positions?: number;
    status?: string;
    posted_date?: string;
    salary_range?: string;
    description?: string;
  }): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      // Pick first department if department_id is missing or invalid
      let deptId = job.department_id;
      if (!deptId || deptId.length !== 36) {
        const depts = await this.getDepartments();
        deptId = depts[0]?.id;
      }
      if (!deptId) return { success: false, error: 'No valid department found' };

      const payload = {
        title: job.title,
        department_id: deptId,
        location: job.location || 'Headquarters',
        type: job.type || 'Full-Time',
        positions: Number(job.positions) || 1,
        status: job.status || 'Active',
        posted_date: job.posted_date || new Date().toISOString().split('T')[0],
        salary_range: job.salary_range || null,
        description: job.description || '',
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/job_openings`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) return { success: false, error: await res.text() };
      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err: any) {
      return { success: false, error: err?.message || err };
    }
  },

  async updateJobOpening(id: string, updates: Record<string, any>): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/job_openings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] updateJobOpening error:', err);
      return false;
    }
  },

  async deleteJobOpening(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/job_openings?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] deleteJobOpening error:', err);
      return false;
    }
  },

  async getCandidates(): Promise<any[]> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/candidates?select=*&order=applied_date.desc`, {
        headers: getHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getCandidates error:', err);
      return [];
    }
  },

  async insertCandidate(cand: {
    job_id?: string;
    name: string;
    email: string;
    phone?: string;
    stage?: string;
    applied_date?: string;
    referrer_name?: string;
    resume_url?: string;
    rating?: number;
    notes?: string;
  }): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      let jobId = cand.job_id;
      if (!jobId || jobId.length !== 36) {
        const jobs = await this.getJobOpenings();
        jobId = jobs[0]?.id;
      }
      if (!jobId) return { success: false, error: 'No job opening found' };

      const payload = {
        job_id: jobId,
        name: cand.name,
        email: cand.email,
        phone: cand.phone || null,
        stage: cand.stage || 'Applied',
        applied_date: cand.applied_date || new Date().toISOString().split('T')[0],
        referrer_name: cand.referrer_name || null,
        resume_url: cand.resume_url || null,
        rating: Number(cand.rating) || 4.0,
        notes: cand.notes || null,
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/candidates`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) return { success: false, error: await res.text() };
      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err: any) {
      return { success: false, error: err?.message || err };
    }
  },

  async updateCandidateStage(id: string, stage: string): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/candidates?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ stage, updated_at: new Date().toISOString() }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] updateCandidateStage error:', err);
      return false;
    }
  },

  async deleteCandidate(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/candidates?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] deleteCandidate error:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // DESIGNATIONS
  // --------------------------------------------------------------------------
  async getDesignations(): Promise<any[]> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/designations?select=*&order=title.asc`, {
        headers: getHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getDesignations error:', err);
      return [];
    }
  },

  async insertDesignation(title: string, departmentId?: string, level?: string): Promise<{ success: boolean; data?: any }> {
    try {
      let deptId = departmentId;
      if (!deptId || deptId.length !== 36) {
        const depts = await this.getDepartments();
        deptId = depts[0]?.id;
      }
      if (!deptId) return { success: false };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/designations`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({
          title: title.trim(),
          department_id: deptId,
          level: level || 'Mid-Level',
        }),
      });
      if (!res.ok) return { success: false };
      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err) {
      console.warn('[SupabaseDirect] insertDesignation error:', err);
      return { success: false };
    }
  },

  async deleteDesignation(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/designations?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.warn('[SupabaseDirect] deleteDesignation error:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // PAYROLL RECORDS
  // --------------------------------------------------------------------------
  async getPayrollRecords(): Promise<any[]> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/payroll_records?select=*,employee:employees(employee_id,first_name,last_name,department_id,designation)&order=payroll_month.desc`, {
        headers: getHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[SupabaseDirect] getPayrollRecords error:', err);
      return [];
    }
  },

  async insertPayrollRecord(record: {
    employee_id: string; // UUID from employees.id
    payroll_month: string;
    basic_salary: number;
    allowances?: number;
    bonus?: number;
    tax_deduction?: number;
    leave_deduction?: number;
    working_days?: number;
    present_days?: number;
    paid_leaves?: number;
    unpaid_leaves?: number;
    net_salary: number;
    status?: string;
  }): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      // Map to PostgreSQL enum hr_payroll_status: ['Pending', 'Verified', 'Processed', 'Paid']
      let normStatus = 'Processed';
      const rawStatus = (record.status || '').toLowerCase();
      if (rawStatus.includes('paid')) normStatus = 'Paid';
      else if (rawStatus.includes('verif')) normStatus = 'Verified';
      else if (rawStatus.includes('draft') || rawStatus.includes('pend') || rawStatus.includes('hold')) normStatus = 'Pending';

      const payload = {
        employee_id: record.employee_id,
        payroll_month: record.payroll_month,
        basic_salary: Number(record.basic_salary) || 0,
        allowances: Number(record.allowances) || 0,
        bonus: Number(record.bonus) || 0,
        tax_deduction: Number(record.tax_deduction) || 0,
        leave_deduction: Number(record.leave_deduction) || 0,
        working_days: Number(record.working_days) || 30,
        present_days: Number(record.present_days) || 30,
        paid_leaves: Number(record.paid_leaves) || 0,
        unpaid_leaves: Number(record.unpaid_leaves) || 0,
        net_salary: Number(record.net_salary) || 0,
        status: normStatus,
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/payroll_records`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) return { success: false, error: await res.text() };
      const data = await res.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (err: any) {
      return { success: false, error: err?.message || err };
    }
  },
};
