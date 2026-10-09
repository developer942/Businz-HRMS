import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { SalaryStructureInput } from '../types/payroll.js';
import { memoryCache } from '../services/cacheService.js';

import { AccountStatus, CredentialEmailStatus } from '../types/auth.js';

export interface EmployeeRecord {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  designation: string;
  basicSalary: number;
  grossSalary: number;
  da?: number;
  conveyance?: number;
  hra?: number;
  withPf?: boolean;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  authUserId?: string;
  mustChangePassword?: boolean;
  accountStatus?: AccountStatus;
  credentialEmailStatus?: CredentialEmailStatus;
  credentialEmailSentAt?: string;
  lastLoginAt?: string;
  status?: string;
  phone?: string;
  branch?: string;
  joiningDate?: string;
  attendanceMethod?: string;
  workShift?: string;
  shiftId?: string;
  password?: string;
  panNumber?: string;
  uanNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  highestQualification?: string;
  degreeName?: string;
  specialization?: string;
  university?: string;
  yearOfPassing?: number;
  gradePercentage?: number;
  experienceProfile?: string;
  totalExperience?: number;
  previousCompany?: string;
  previousDesignation?: string;
  previousDepartment?: string;
  employmentStartDate?: string;
  employmentEndDate?: string;
  lastDrawnSalary?: number;
  previousCompanyLocation?: string;
  currentAddress?: any;
  educationalDetails?: any;
  experienceDetails?: any;
  bankDetails?: any;
  salaryDetails?: any;
}

export interface EmployeeSalaryStructureRecord extends SalaryStructureInput {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
  withPf?: boolean;
}

function mapDbRowToEmployee(data: any): EmployeeRecord {
  const basic = Number(data.basic_salary) || 0;
  const gross = Number(data.gross_salary) || basic || 0;
  return {
    id: data.id,
    employeeId: data.employee_id,
    firstName: data.first_name || '',
    lastName: data.last_name || '',
    email: data.email || '',
    department: data.department?.name || data.departments?.name || data.department || 'General',
    designation: data.designation || 'Staff',
    basicSalary: basic,
    grossSalary: gross,
    bankName: data.bank_name || undefined,
    accountNumber: data.account_number || undefined,
    ifscCode: data.ifsc_code || undefined,
    password: data.password || undefined,
    mustChangePassword: data.must_change_password ?? false,
    accountStatus: data.account_status,
    credentialEmailStatus: data.credential_email_status,
    credentialEmailSentAt: data.credential_email_sent_at,
    lastLoginAt: data.last_login_at,
    status: data.status || 'Active',
    phone: data.phone || undefined,
    branch: data.branch || undefined,
    joiningDate: data.joining_date || undefined,
    attendanceMethod: data.attendance_method || 'Face Scan',
    workShift: data.work_shift || undefined,
    shiftId: data.shift_id || undefined,
    panNumber: data.pan_number || undefined,
    uanNumber: data.uan_number || undefined,
    addressLine1: data.address_line1 || undefined,
    addressLine2: data.address_line2 || undefined,
    city: data.city || undefined,
    state: data.state || undefined,
    country: data.country || undefined,
    pincode: data.pincode || undefined,
    highestQualification: data.highest_qualification || undefined,
    degreeName: data.degree_name || undefined,
    specialization: data.specialization || undefined,
    university: data.university || undefined,
    yearOfPassing: data.year_of_passing || undefined,
    gradePercentage: data.grade_percentage != null ? Number(data.grade_percentage) : undefined,
    experienceProfile: data.experience_profile || undefined,
    totalExperience: data.total_experience != null ? Number(data.total_experience) : undefined,
    previousCompany: data.previous_company || undefined,
    previousDesignation: data.previous_designation || undefined,
    previousDepartment: data.previous_department || undefined,
    employmentStartDate: data.employment_start_date || undefined,
    employmentEndDate: data.employment_end_date || undefined,
    lastDrawnSalary: data.last_drawn_salary != null ? Number(data.last_drawn_salary) : undefined,
    previousCompanyLocation: data.previous_company_location || undefined,
  };
}

export class EmployeeRepository {
  async getEmployeeById(idOrEmpId: string): Promise<EmployeeRecord | null> {
    if (!idOrEmpId || typeof idOrEmpId !== 'string') return null;
    const cleanId = idOrEmpId.trim();

    // High-speed memory cache check
    const cacheKey = `emp_${cleanId}`;
    const cached = memoryCache.get<EmployeeRecord>(cacheKey);
    if (cached) return cached;

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
        let query = supabase
          .from('employees')
          .select('*, department:departments!employees_department_id_fkey(name)');

        if (isUuid) {
          query = query.or(`id.eq.${cleanId},employee_id.eq.${cleanId}`);
        } else {
          query = query.eq('employee_id', cleanId);
        }

        const { data, error } = await query.maybeSingle();

        if (data && !error) {
          const emp = mapDbRowToEmployee(data);
          memoryCache.set(cacheKey, emp, 30000);
          return emp;
        }
      } catch (err) {
        console.warn('Database error in getEmployeeById:', err);
      }
    }

    return null;
  }

  async findByEmail(email: string): Promise<EmployeeRecord | null> {
    if (!email) return null;
    const clean = email.toLowerCase().trim();

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('employees')
          .select('*, department:departments!employees_department_id_fkey(name)')
          .ilike('email', clean)
          .maybeSingle();

        if (data && !error) {
          return mapDbRowToEmployee(data);
        }
      } catch (err) {
        console.warn('Database error in findByEmail:', err);
      }
    }

    return null;
  }

  async findByEmployeeId(empId: string): Promise<EmployeeRecord | null> {
    if (!empId) return null;
    const clean = empId.toLowerCase().trim();

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('employees')
          .select('*, department:departments!employees_department_id_fkey(name)')
          .ilike('employee_id', clean)
          .maybeSingle();

        if (data && !error) {
          return mapDbRowToEmployee(data);
        }
      } catch (err) {
        console.warn('Database error in findByEmployeeId:', err);
      }
    }

    return null;
  }

  async getAllEmployees(): Promise<EmployeeRecord[]> {
    const cacheKey = 'employees_all_active';
    const cached = memoryCache.get<EmployeeRecord[]>(cacheKey);
    if (cached) return cached;

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('employees')
          .select('*, department:departments!employees_department_id_fkey(name)')
          .eq('status', 'Active')
          .order('created_at', { ascending: true });

        if (data && !error) {
          const list = data
            .filter(d => d.employee_id !== 'EMP-000' && !['admin@businz.com', 'developer@businz.com'].includes((d.email || '').toLowerCase()))
            .map(mapDbRowToEmployee);

          memoryCache.set(cacheKey, list, 30000);
          return list;
        }
      } catch (err) {
        console.warn('Database error in getAllEmployees:', err);
      }
    }

    return [];
  }

  async getSalaryStructure(employeeId: string): Promise<EmployeeSalaryStructureRecord | null> {
    if (!employeeId) return null;
    const cleanId = employeeId.trim();
    const cacheKey = `ss_${cleanId}`;
    const cached = memoryCache.get<EmployeeSalaryStructureRecord>(cacheKey);
    if (cached) return cached;

    const emp = await this.getEmployeeById(cleanId);
    if (!emp) return null;

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('salary_structures')
          .select('*')
          .eq('employee_id', emp.id)
          .eq('is_active', true)
          .maybeSingle();

        if (data && !error) {
          const struct: EmployeeSalaryStructureRecord = {
            id: data.id,
            employeeId: emp.employeeId,
            monthlySalary: Number(data.monthly_salary) || 0,
            basicPercentage: Number(data.basic_percentage) || 0,
            daPercentage: Number(data.da_percentage) || 0,
            conveyancePercentage: Number(data.conveyance_percentage) || 0,
            hraPercentage: Number(data.hra_percentage) || 0,
            effectiveFrom: data.effective_from,
            effectiveTo: data.effective_to,
            isActive: data.is_active,
          };
          memoryCache.set(cacheKey, struct, 30000);
          return struct;
        }
      } catch (err) {
        console.warn('Database error in getSalaryStructure:', err);
      }
    }

    return null;
  }

  async saveSalaryStructure(
    employeeId: string,
    structure: SalaryStructureInput & { effectiveFrom?: string; effectiveTo?: string | null }
  ): Promise<EmployeeSalaryStructureRecord> {
    const emp = await this.getEmployeeById(employeeId);
    const key = emp ? emp.employeeId : employeeId;

    const record: EmployeeSalaryStructureRecord = {
      id: `ss-${key}-${Date.now()}`,
      employeeId: key,
      monthlySalary: structure.monthlySalary,
      basicPercentage: structure.basicPercentage,
      daPercentage: structure.daPercentage,
      conveyancePercentage: structure.conveyancePercentage,
      hraPercentage: structure.hraPercentage,
      withPf: structure.withPf !== undefined ? structure.withPf : (emp?.withPf !== undefined ? emp.withPf : true),
      effectiveFrom: structure.effectiveFrom || new Date().toISOString().split('T')[0],
      effectiveTo: structure.effectiveTo || null,
      isActive: true,
    };

    memoryCache.invalidate(`ss_${key}`);
    memoryCache.invalidate(`ss_${employeeId}`);

    if (isRealSupabaseConfigured() && emp) {
      try {
        const supabase = getSupabaseAdmin();
        // Deactivate old structures
        await supabase
          .from('salary_structures')
          .update({ is_active: false })
          .eq('employee_id', emp.id);

        // Insert new active structure
        const res = await supabase.from('salary_structures').insert({
          employee_id: emp.id,
          monthly_salary: structure.monthlySalary,
          basic_percentage: structure.basicPercentage,
          da_percentage: structure.daPercentage,
          conveyance_percentage: structure.conveyancePercentage,
          hra_percentage: structure.hraPercentage,
          effective_from: record.effectiveFrom,
          is_active: true,
        }).select('id').single();

        if (res.data?.id) {
          record.id = res.data.id;
        }
      } catch (err) {
        console.warn('Could not persist salary structure to Supabase:', err);
      }
    }

    return record;
  }

  async getEmployees(filters?: { department?: string; status?: string; search?: string }): Promise<EmployeeRecord[]> {
    let list = await this.getAllEmployees();

    if (filters?.department && filters.department !== 'All') {
      list = list.filter((e) => e.department.toLowerCase() === filters.department?.toLowerCase());
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (e) =>
          e.firstName.toLowerCase().includes(q) ||
          e.lastName.toLowerCase().includes(q) ||
          e.employeeId.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q)
      );
    }

    return list;
  }

  async createEmployee(data: Partial<EmployeeRecord>): Promise<EmployeeRecord> {
    if (!isRealSupabaseConfigured()) {
      throw new Error('Database connection required to create employees.');
    }

    const supabase = getSupabaseAdmin();

    let empId = data.employeeId;
    if (!empId) {
      let maxNum = 0;
      const { data: allEmpIds } = await supabase
        .from('employees')
        .select('employee_id');
      if (allEmpIds && allEmpIds.length > 0) {
        const numbers = allEmpIds
          .map(e => {
            const match = (e.employee_id || '').match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
          })
          .filter(n => !isNaN(n));
        if (numbers.length > 0) {
          maxNum = Math.max(...numbers);
        }
      }
      empId = `EMP-${(maxNum + 1).toString().padStart(3, '0')}`;
    }

    let roleId = (data as any).roleId;
    if (!roleId) {
      const { data: roleData } = await supabase
        .from('roles')
        .select('id')
        .eq('key', 'employee')
        .maybeSingle();
      roleId = roleData?.id || '965e3410-4ab8-4930-9740-89aa34216ac3';
    }

    let deptId = (data as any).departmentId || (data as any).department_id;
    if (!deptId && data.department) {
      const { data: deptData } = await supabase
        .from('departments')
        .select('id')
        .ilike('name', data.department.trim())
        .maybeSingle();
      if (deptData?.id) {
        deptId = deptData.id;
      }
    }

    const insertPayload: any = {
      employee_id: empId,
      first_name: data.firstName || '',
      last_name: data.lastName || '',
      email: (data.email || '').toLowerCase().trim(),
      basic_salary: data.basicSalary || 0,
      designation: data.designation || 'Staff',
      department_id: deptId || null,
      phone: data.phone || null,
      branch: data.branch || null,
      role_id: roleId,
      status: data.status || 'Active',
      attendance_method: data.attendanceMethod || 'Face Scan',
      must_change_password: data.mustChangePassword ?? true,
      account_status: data.accountStatus || 'ACTIVE',
      credential_email_status: data.credentialEmailStatus || 'PENDING',
      password: data.password || null,
    };

    // Banking & Statutory
    const bankName = data.bankName || data.bankDetails?.bankName;
    if (bankName !== undefined) insertPayload.bank_name = bankName;

    const accountNumber = data.accountNumber || data.bankDetails?.accountNumber;
    if (accountNumber !== undefined) insertPayload.account_number = String(accountNumber);

    const ifscCode = data.ifscCode || data.bankDetails?.ifscCode;
    if (ifscCode !== undefined) insertPayload.ifsc_code = ifscCode;

    const panNumber = data.panNumber || data.salaryDetails?.panNumber || (data as any).pan;
    if (panNumber !== undefined) insertPayload.pan_number = panNumber;

    const uanNumber = data.uanNumber || data.salaryDetails?.uanNumber || (data as any).uan;
    if (uanNumber !== undefined) insertPayload.uan_number = String(uanNumber);

    // Current Address
    const addressLine1 = data.addressLine1 || (data as any).line1 || (data as any).currentLine1 || data.currentAddress?.line1;
    if (addressLine1 !== undefined) insertPayload.address_line1 = addressLine1;

    const addressLine2 = data.addressLine2 || (data as any).line2 || (data as any).currentLine2 || data.currentAddress?.line2;
    if (addressLine2 !== undefined) insertPayload.address_line2 = addressLine2;

    const city = data.city || (data as any).currentCity || data.currentAddress?.city;
    if (city !== undefined) insertPayload.city = city;

    const state = data.state || (data as any).currentState || data.currentAddress?.state;
    if (state !== undefined) insertPayload.state = state;

    const country = data.country || (data as any).currentCountry || data.currentAddress?.country;
    if (country !== undefined) insertPayload.country = country;

    const pincode = data.pincode || (data as any).currentPincode || data.currentAddress?.pincode;
    if (pincode !== undefined) insertPayload.pincode = String(pincode);

    // Educational Qualifications
    const highestQualification = data.highestQualification || (data as any).qualification || data.educationalDetails?.highestQualification;
    if (highestQualification !== undefined) insertPayload.highest_qualification = highestQualification;

    const degreeName = data.degreeName || (data as any).courseName || data.educationalDetails?.degreeName;
    if (degreeName !== undefined) insertPayload.degree_name = degreeName;

    const specialization = data.specialization || data.educationalDetails?.specialization;
    if (specialization !== undefined) insertPayload.specialization = specialization;

    const university = data.university || (data as any).institution || data.educationalDetails?.university;
    if (university !== undefined) insertPayload.university = university;

    const yearOfPassing = data.yearOfPassing !== undefined ? Number(data.yearOfPassing) : data.educationalDetails?.yearOfPassing ? Number(data.educationalDetails.yearOfPassing) : undefined;
    if (yearOfPassing !== undefined && !isNaN(yearOfPassing)) insertPayload.year_of_passing = yearOfPassing;

    const gradePercentage = data.gradePercentage !== undefined ? Number(data.gradePercentage) : data.educationalDetails?.gradePercentage ? Number(data.educationalDetails.gradePercentage) : undefined;
    if (gradePercentage !== undefined && !isNaN(gradePercentage)) insertPayload.grade_percentage = gradePercentage;

    // Experience Details
    const experienceProfile = data.experienceProfile || (data as any).experienceType || data.experienceDetails?.experienceType;
    if (experienceProfile !== undefined) insertPayload.experience_profile = experienceProfile;

    const totalExperience = data.totalExperience !== undefined ? Number(data.totalExperience) : data.experienceDetails?.totalExperience ? Number(data.experienceDetails.totalExperience) : undefined;
    if (totalExperience !== undefined && !isNaN(totalExperience)) insertPayload.total_experience = totalExperience;

    const previousCompany = data.previousCompany || (data as any).previousCompanyName || data.experienceDetails?.previousCompany;
    if (previousCompany !== undefined) insertPayload.previous_company = previousCompany;

    const previousDesignation = data.previousDesignation || data.experienceDetails?.previousDesignation;
    if (previousDesignation !== undefined) insertPayload.previous_designation = previousDesignation;

    const previousDepartment = data.previousDepartment || data.experienceDetails?.previousDepartment;
    if (previousDepartment !== undefined) insertPayload.previous_department = previousDepartment;

    const employmentStartDate = data.employmentStartDate || (data as any).startDate || (data as any).expStartDate || data.experienceDetails?.startDate;
    if (employmentStartDate !== undefined) insertPayload.employment_start_date = employmentStartDate;

    const employmentEndDate = data.employmentEndDate || (data as any).endDate || (data as any).expEndDate || data.experienceDetails?.endDate;
    if (employmentEndDate !== undefined) insertPayload.employment_end_date = employmentEndDate;

    const lastDrawnSalary = data.lastDrawnSalary !== undefined ? Number(data.lastDrawnSalary) : data.experienceDetails?.lastDrawnSalary ? Number(data.experienceDetails.lastDrawnSalary) : undefined;
    if (lastDrawnSalary !== undefined && !isNaN(lastDrawnSalary)) insertPayload.last_drawn_salary = lastDrawnSalary;

    const previousCompanyLocation = data.previousCompanyLocation || (data as any).companyLocation || data.experienceDetails?.companyLocation;
    if (previousCompanyLocation !== undefined) insertPayload.previous_company_location = previousCompanyLocation;

    const insertRes = await supabase.from('employees').insert(insertPayload).select('*, department:departments!employees_department_id_fkey(name)').single();
    if (insertRes.error || !insertRes.data) {
      throw new Error(`Failed to create employee in database: ${insertRes.error?.message || 'Unknown database error'}`);
    }

    memoryCache.invalidatePattern('emp_');
    memoryCache.invalidatePattern('ss_');
    memoryCache.invalidate('employees_all_active');

    return mapDbRowToEmployee(insertRes.data);
  }

  async updateEmployee(id: string, updates: Partial<EmployeeRecord>): Promise<EmployeeRecord | null> {
    const emp = await this.getEmployeeById(id);
    if (!emp) return null;

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const payload: any = {};
        if (updates.firstName !== undefined) payload.first_name = updates.firstName;
        if (updates.lastName !== undefined) payload.last_name = updates.lastName;
        if (updates.email !== undefined) payload.email = updates.email ? updates.email.toLowerCase().trim() : '';
        if (updates.basicSalary !== undefined) payload.basic_salary = updates.basicSalary;
        if (updates.designation !== undefined) payload.designation = updates.designation;
        if (updates.status !== undefined) payload.status = updates.status;
        if (updates.phone !== undefined) payload.phone = updates.phone;
        if (updates.branch !== undefined) payload.branch = updates.branch;
        if (updates.password !== undefined) payload.password = updates.password;
        if (updates.mustChangePassword !== undefined) payload.must_change_password = updates.mustChangePassword;
        if (updates.accountStatus !== undefined) payload.account_status = updates.accountStatus;

        // Banking & Statutory
        const bankName = updates.bankName || updates.bankDetails?.bankName;
        if (bankName !== undefined) payload.bank_name = bankName;

        const accountNumber = updates.accountNumber || updates.bankDetails?.accountNumber;
        if (accountNumber !== undefined) payload.account_number = String(accountNumber);

        const ifscCode = updates.ifscCode || updates.bankDetails?.ifscCode;
        if (ifscCode !== undefined) payload.ifsc_code = ifscCode;

        const panNumber = updates.panNumber || updates.salaryDetails?.panNumber || (updates as any).pan;
        if (panNumber !== undefined) payload.pan_number = panNumber;

        const uanNumber = updates.uanNumber || updates.salaryDetails?.uanNumber || (updates as any).uan;
        if (uanNumber !== undefined) payload.uan_number = String(uanNumber);

        // Address
        const addressLine1 = updates.addressLine1 || (updates as any).line1 || (updates as any).currentLine1 || updates.currentAddress?.line1;
        if (addressLine1 !== undefined) payload.address_line1 = addressLine1;

        const addressLine2 = updates.addressLine2 || (updates as any).line2 || (updates as any).currentLine2 || updates.currentAddress?.line2;
        if (addressLine2 !== undefined) payload.address_line2 = addressLine2;

        const city = updates.city || (updates as any).currentCity || updates.currentAddress?.city;
        if (city !== undefined) payload.city = city;

        const state = updates.state || (updates as any).currentState || updates.currentAddress?.state;
        if (state !== undefined) payload.state = state;

        const country = updates.country || (updates as any).currentCountry || updates.currentAddress?.country;
        if (country !== undefined) payload.country = country;

        const pincode = updates.pincode || (updates as any).currentPincode || updates.currentAddress?.pincode;
        if (pincode !== undefined) payload.pincode = String(pincode);

        // Educational
        const highestQualification = updates.highestQualification || (updates as any).qualification || updates.educationalDetails?.highestQualification;
        if (highestQualification !== undefined) payload.highest_qualification = highestQualification;

        const degreeName = updates.degreeName || (updates as any).courseName || updates.educationalDetails?.degreeName;
        if (degreeName !== undefined) payload.degree_name = degreeName;

        const specialization = updates.specialization || updates.educationalDetails?.specialization;
        if (specialization !== undefined) payload.specialization = specialization;

        const university = updates.university || (updates as any).institution || updates.educationalDetails?.university;
        if (university !== undefined) payload.university = university;

        const yearOfPassing = updates.yearOfPassing !== undefined ? Number(updates.yearOfPassing) : updates.educationalDetails?.yearOfPassing ? Number(updates.educationalDetails.yearOfPassing) : undefined;
        if (yearOfPassing !== undefined && !isNaN(yearOfPassing)) payload.year_of_passing = yearOfPassing;

        const gradePercentage = updates.gradePercentage !== undefined ? Number(updates.gradePercentage) : updates.educationalDetails?.gradePercentage ? Number(updates.educationalDetails.gradePercentage) : undefined;
        if (gradePercentage !== undefined && !isNaN(gradePercentage)) payload.grade_percentage = gradePercentage;

        // Experience
        const experienceProfile = updates.experienceProfile || (updates as any).experienceType || updates.experienceDetails?.experienceType;
        if (experienceProfile !== undefined) payload.experience_profile = experienceProfile;

        const totalExperience = updates.totalExperience !== undefined ? Number(updates.totalExperience) : updates.experienceDetails?.totalExperience ? Number(updates.experienceDetails.totalExperience) : undefined;
        if (totalExperience !== undefined && !isNaN(totalExperience)) payload.total_experience = totalExperience;

        const previousCompany = updates.previousCompany || (updates as any).previousCompanyName || updates.experienceDetails?.previousCompany;
        if (previousCompany !== undefined) payload.previous_company = previousCompany;

        const previousDesignation = updates.previousDesignation || updates.experienceDetails?.previousDesignation;
        if (previousDesignation !== undefined) payload.previous_designation = previousDesignation;

        const previousDepartment = updates.previousDepartment || updates.experienceDetails?.previousDepartment;
        if (previousDepartment !== undefined) payload.previous_department = previousDepartment;

        const employmentStartDate = updates.employmentStartDate || (updates as any).startDate || (updates as any).expStartDate || updates.experienceDetails?.startDate;
        if (employmentStartDate !== undefined) payload.employment_start_date = employmentStartDate;

        const employmentEndDate = updates.employmentEndDate || (updates as any).endDate || (updates as any).expEndDate || updates.experienceDetails?.endDate;
        if (employmentEndDate !== undefined) payload.employment_end_date = employmentEndDate;

        const lastDrawnSalary = updates.lastDrawnSalary !== undefined ? Number(updates.lastDrawnSalary) : updates.experienceDetails?.lastDrawnSalary ? Number(updates.experienceDetails.lastDrawnSalary) : undefined;
        if (lastDrawnSalary !== undefined && !isNaN(lastDrawnSalary)) payload.last_drawn_salary = lastDrawnSalary;

        const previousCompanyLocation = updates.previousCompanyLocation || (updates as any).companyLocation || updates.experienceDetails?.companyLocation;
        if (previousCompanyLocation !== undefined) payload.previous_company_location = previousCompanyLocation;

        if (updates.department !== undefined) {
          const { data: deptData } = await supabase
            .from('departments')
            .select('id')
            .ilike('name', updates.department.trim())
            .maybeSingle();
          if (deptData?.id) {
            payload.department_id = deptData.id;
          }
        }

        await supabase
          .from('employees')
          .update(payload)
          .eq('id', emp.id);

        memoryCache.invalidatePattern('emp_');
        memoryCache.invalidatePattern('ss_');
        memoryCache.invalidate('employees_all_active');

        return await this.getEmployeeById(emp.id);
      } catch (err) {
        console.warn('Could not update employee in Supabase:', err);
      }
    }

    return null;
  }

  async deleteEmployee(id: string): Promise<boolean> {
    if (!id) return false;
    const cleanId = id.trim();

    memoryCache.invalidatePattern('emp_');
    memoryCache.invalidatePattern('ss_');
    memoryCache.invalidate('employees_all_active');

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
        let deleteQuery = supabase.from('employees').delete();
        if (isUuid) {
          deleteQuery = deleteQuery.or(`id.eq.${cleanId},employee_id.eq.${cleanId}`);
        } else {
          deleteQuery = deleteQuery.eq('employee_id', cleanId);
        }
        const { error } = await deleteQuery;
        if (!error) {
          return true;
        } else {
          console.warn('Could not delete employee from Supabase:', error);
        }
      } catch (err) {
        console.warn('Supabase delete exception:', err);
      }
    }

    return false;
  }
}

export const employeeRepository = new EmployeeRepository();
