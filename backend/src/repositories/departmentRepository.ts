import { getSupabaseAdmin } from '../config/supabase.js';

export interface DepartmentRecord {
  id: string;
  name: string;
  code: string;
  head_id: string | null;
  head_name?: string | null;
  budget: number;
  employee_count?: number;
  created_at: string;
  updated_at: string;
}

export class DepartmentRepository {
  async getAll(): Promise<DepartmentRecord[]> {
    const supabase = getSupabaseAdmin();

    // 1. Fetch departments
    const { data: depts, error } = await supabase
      .from('departments')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch departments: ${error.message}`);
    }

    // 2. Fetch employee count per department
    const { data: emps } = await supabase
      .from('employees')
      .select('id, department_id, department, first_name, last_name, status');

    const empCountMap = new Map<string, number>();
    const headMap = new Map<string, string>();

    if (Array.isArray(emps)) {
      for (const e of emps) {
        if (e.id) {
          headMap.set(e.id, `${e.first_name || ''} ${e.last_name || ''}`.trim());
        }
        if (e.status !== 'Terminated' && e.status !== 'Inactive') {
          if (e.department_id) {
            empCountMap.set(e.department_id, (empCountMap.get(e.department_id) || 0) + 1);
          }
          if (e.department) {
            const clean = e.department.trim().toLowerCase();
            empCountMap.set(clean, (empCountMap.get(clean) || 0) + 1);
          }
        }
      }
    }

    return (depts || []).map(d => ({
      ...d,
      budget: Number(d.budget) || 0,
      head_name: d.head_id ? headMap.get(d.head_id) || 'Unassigned' : 'Unassigned',
      employee_count: empCountMap.get(d.id) || empCountMap.get(d.name?.trim().toLowerCase()) || 0
    }));
  }

  async getById(id: string): Promise<DepartmentRecord | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return {
      ...data,
      budget: Number(data.budget) || 0
    };
  }

  async create(payload: { name: string; code?: string; budget?: number; head_id?: string | null }): Promise<DepartmentRecord> {
    const supabase = getSupabaseAdmin();
    const cleanName = payload.name.trim();
    if (!cleanName) {
      throw new Error('Department name is required');
    }

    // Check for existing department with same name
    const { data: existing } = await supabase
      .from('departments')
      .select('*')
      .ilike('name', cleanName)
      .maybeSingle();

    if (existing) {
      return {
        ...existing,
        budget: Number(existing.budget) || 0
      };
    }

    let cleanCode = (payload.code || cleanName.substring(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanCode) cleanCode = 'DEPT';

    // Verify code uniqueness
    const { data: codeCheck } = await supabase
      .from('departments')
      .select('id')
      .eq('code', cleanCode)
      .maybeSingle();

    if (codeCheck) {
      cleanCode = `${cleanCode.substring(0, 2)}${Math.floor(10 + Math.random() * 90)}`;
    }

    const insertData: any = {
      name: cleanName,
      code: cleanCode,
      budget: payload.budget ?? 0,
      head_id: payload.head_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: created, error } = await supabase
      .from('departments')
      .insert(insertData)
      .select()
      .single();

    if (error || !created) {
      throw new Error(`Failed to create department: ${error?.message || 'Unknown database error'}`);
    }

    // Synchronize org_structure in company_settings
    await this.syncOrgStructure(cleanName, 'ADD');

    return {
      ...created,
      budget: Number(created.budget) || 0,
      employee_count: 0
    };
  }

  async update(id: string, updates: { name?: string; code?: string; budget?: number; head_id?: string | null }): Promise<DepartmentRecord> {
    const supabase = getSupabaseAdmin();
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Department with ID ${id} not found`);
    }

    const patchPayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) {
      patchPayload.name = updates.name.trim();
    }
    if (updates.code !== undefined) {
      patchPayload.code = updates.code.trim().toUpperCase();
    }
    if (updates.budget !== undefined) {
      patchPayload.budget = Number(updates.budget) || 0;
    }
    if (updates.head_id !== undefined) {
      patchPayload.head_id = updates.head_id || null;
    }

    const { data: updated, error } = await supabase
      .from('departments')
      .update(patchPayload)
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      throw new Error(`Failed to update department: ${error?.message || 'Unknown database error'}`);
    }

    // If name changed, synchronize org_structure and cascade to employees
    if (updates.name && updates.name.trim() !== existing.name) {
      const cleanNewName = updates.name.trim();
      await this.syncOrgStructure(cleanNewName, 'RENAME', existing.name);

      // Cascade update to employees table
      await supabase
        .from('employees')
        .update({ department: cleanNewName })
        .eq('department_id', id);

      await supabase
        .from('employees')
        .update({ department: cleanNewName })
        .ilike('department', existing.name);
    }

    return {
      ...updated,
      budget: Number(updated.budget) || 0
    };
  }

  async delete(id: string): Promise<{ success: boolean; reason?: string }> {
    const supabase = getSupabaseAdmin();
    const existing = await this.getById(id);
    if (!existing) {
      return { success: false, reason: 'Department not found' };
    }

    // Check if any employees are currently in this department
    const { data: empById } = await supabase
      .from('employees')
      .select('id, first_name, last_name')
      .eq('department_id', id)
      .neq('status', 'Terminated')
      .limit(5);

    if (empById && empById.length > 0) {
      return {
        success: false,
        reason: `Cannot delete department "${existing.name}". It is assigned to ${empById.length}+ active employees (e.g. ${empById[0].first_name} ${empById[0].last_name}). Please reassign employees first.`
      };
    }

    const { data: empByName } = await supabase
      .from('employees')
      .select('id, first_name, last_name')
      .ilike('department', existing.name)
      .neq('status', 'Terminated')
      .limit(5);

    if (empByName && empByName.length > 0) {
      return {
        success: false,
        reason: `Cannot delete department "${existing.name}". It is assigned to active employees. Please reassign employees first.`
      };
    }

    // Delete from departments table
    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete department: ${error.message}`);
    }

    // Remove from org_structure
    await this.syncOrgStructure(existing.name, 'REMOVE');

    return { success: true };
  }

  private async syncOrgStructure(deptName: string, action: 'ADD' | 'RENAME' | 'REMOVE', oldName?: string) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: settingRow } = await supabase
        .from('company_settings')
        .select('*')
        .eq('setting_key', 'org_structure')
        .maybeSingle();

      let org = settingRow?.setting_val;
      if (!org || typeof org !== 'object') {
        org = { departments: [], designations: [], workLocations: [], employmentTypes: [] };
      }
      let depts: string[] = Array.isArray(org.departments) ? [...org.departments] : [];

      if (action === 'ADD') {
        if (!depts.some(d => d.toLowerCase() === deptName.toLowerCase())) {
          depts.push(deptName);
        }
      } else if (action === 'RENAME' && oldName) {
        depts = depts.map(d => d.toLowerCase() === oldName.toLowerCase() ? deptName : d);
      } else if (action === 'REMOVE') {
        depts = depts.filter(d => d.toLowerCase() !== deptName.toLowerCase());
      }

      const updatedOrg = { ...org, departments: depts };
      if (settingRow?.id) {
        await supabase
          .from('company_settings')
          .update({ setting_val: updatedOrg, updated_at: new Date().toISOString() })
          .eq('id', settingRow.id);
      } else {
        await supabase
          .from('company_settings')
          .insert({
            setting_key: 'org_structure',
            setting_val: updatedOrg,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
    } catch (err) {
      console.warn('[DepartmentRepository] syncOrgStructure notice:', err);
    }
  }
}

export const departmentRepository = new DepartmentRepository();
