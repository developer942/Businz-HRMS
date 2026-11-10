import bcrypt from 'bcrypt';
import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { memoryCache } from '../services/cacheService.js';
function mapDbRowToEmployee(data) {
    const rawProfile = typeof data.profile_data === 'object' && data.profile_data !== null ? { ...data.profile_data } : {};
    delete rawProfile.password;
    delete rawProfile.plainPassword;
    delete rawProfile.passwordHash;
    delete rawProfile.password_hash;
    if (rawProfile.systemAccess && typeof rawProfile.systemAccess === 'object') {
        rawProfile.systemAccess = { ...rawProfile.systemAccess };
        delete rawProfile.systemAccess.password;
    }
    const profile = rawProfile;
    const cleanPortalPassword = (profile.portalPassword && !String(profile.portalPassword).startsWith('$2'))
        ? String(profile.portalPassword)
        : ((data.password && !String(data.password).startsWith('$2')) ? String(data.password) : 'Password@123');
    const basic = Number(data.basic_salary ?? profile.basicSalary) || 0;
    const explicitCtc = Number(profile.salaryDetails?.monthlyCtc || profile.monthlyCtc || data.gross_salary || profile.grossSalary || 0);
    const derivedCtc = explicitCtc > 0 ? explicitCtc : (basic > 0 ? Math.round(basic / 0.4) : 0);
    const gross = derivedCtc > 0 ? derivedCtc : (basic > 0 ? Math.round(basic / 0.4) : 0);
    const todayIso = new Date().toISOString().slice(0, 10);
    const rawUpcomingShift = profile.upcomingShift || profile.shiftDetails?.upcomingShift || null;
    const rawUpcomingEffectiveFrom = profile.upcomingShiftEffectiveFrom || profile.shiftDetails?.upcomingShiftEffectiveFrom || null;
    const isUpcomingDue = Boolean(rawUpcomingShift && rawUpcomingEffectiveFrom && String(rawUpcomingEffectiveFrom).slice(0, 10) <= todayIso);
    const resolvedWorkShift = isUpcomingDue
        ? rawUpcomingShift
        : (data.work_shift || profile.workShift || profile.shiftDetails?.assignedShift || undefined);
    const resolvedUpcomingShift = isUpcomingDue ? null : rawUpcomingShift;
    const resolvedUpcomingEffectiveFrom = isUpcomingDue ? null : rawUpcomingEffectiveFrom;
    const resolvedHra = Number(data.allowances_hra ?? profile.allowances?.hra ?? profile.salaryDetails?.hra ?? (derivedCtc > 0 ? Math.round(derivedCtc * 0.35) : 0));
    const resolvedTransport = Number(data.allowances_transport ?? profile.allowances?.transport ?? profile.salaryDetails?.conveyance ?? (derivedCtc > 0 ? Math.round(derivedCtc * 0.05) : 0));
    const resolvedDa = Number(profile.allowances?.da ?? profile.salaryDetails?.da ?? (derivedCtc > 0 ? Math.round(derivedCtc * 0.20) : 0));
    const resolvedMedical = Number(data.allowances_medical ?? profile.allowances?.medical ?? 0);
    const resolvedSpecial = Number(data.allowances_special ?? profile.allowances?.special ?? 0);
    return {
        ...profile,
        id: data.id,
        employeeId: data.employee_id,
        firstName: data.first_name || profile.firstName || '',
        lastName: data.last_name || profile.lastName || '',
        email: data.email || profile.email || '',
        department: data.department?.name || data.departments?.name || profile.department || data.department || 'General',
        departmentId: data.department_id || profile.departmentId || undefined,
        designation: data.designation || profile.designation || 'Staff',
        reportingManagerId: data.reporting_manager_id || profile.reportingManagerId || undefined,
        reportingManagerName: data.reporting_manager_name || profile.reportingManagerName || undefined,
        employmentType: profile.employmentType || data.employment_type || 'Full-Time',
        dob: data.dob ? String(data.dob).slice(0, 10) : (profile.dob || undefined),
        gender: data.gender || profile.gender || undefined,
        basicSalary: basic,
        grossSalary: gross,
        allowances: {
            hra: resolvedHra,
            transport: resolvedTransport,
            medical: resolvedMedical,
            special: resolvedSpecial,
            da: resolvedDa,
            conveyance: resolvedTransport,
        },
        bankName: data.bank_name || profile.bankDetails?.bankName || undefined,
        accountNumber: data.account_number || profile.bankDetails?.accountNumber || undefined,
        ifscCode: data.ifsc_code || profile.bankDetails?.ifscCode || undefined,
        bankDetails: {
            ...(profile.bankDetails || {}),
            bankName: data.bank_name || profile.bankDetails?.bankName || '',
            accountNumber: data.account_number || profile.bankDetails?.accountNumber || '',
            ifscCode: data.ifsc_code || profile.bankDetails?.ifscCode || '',
            branch: data.branch || profile.bankDetails?.branch || '',
        },
        salaryDetails: {
            ...(profile.salaryDetails || {}),
            monthlyCtc: derivedCtc,
            basicSalary: basic,
            hra: resolvedHra,
            da: resolvedDa,
            conveyance: resolvedTransport,
            withPf: profile.salaryDetails?.withPf ?? true,
            salaryScheme: profile.salaryDetails?.salaryScheme || 'WITH_PF',
            panNumber: data.pan_number || profile.salaryDetails?.panNumber || profile.panNumber || '',
            uanNumber: data.uan_number || profile.salaryDetails?.uanNumber || profile.uanNumber || '',
        },
        mustChangePassword: data.must_change_password ?? false,
        portalPassword: cleanPortalPassword,
        password: cleanPortalPassword,
        accountStatus: data.account_status,
        credentialEmailStatus: data.credential_email_status,
        credentialEmailSentAt: data.credential_email_sent_at,
        lastLoginAt: data.last_login_at,
        status: profile.status || data.status || 'Active',
        phone: data.phone || profile.phone || undefined,
        branch: data.branch || profile.workLocation || undefined,
        workLocation: data.branch || profile.workLocation || undefined,
        joiningDate: data.joining_date ? String(data.joining_date).slice(0, 10) : (profile.joiningDate || undefined),
        attendanceMethod: data.attendance_method || profile.attendanceMethod || 'Face Scan',
        gpsAllowed: data.gps_allowed ?? profile.gpsAllowed ?? true,
        workShift: resolvedWorkShift,
        upcomingShift: resolvedUpcomingShift,
        upcomingShiftEffectiveFrom: resolvedUpcomingEffectiveFrom,
        shiftEffectiveFrom: profile.shiftEffectiveFrom || profile.shiftDetails?.effectiveFrom || undefined,
        salaryEffectiveFrom: profile.salaryEffectiveFrom || profile.salaryDetails?.effectiveFrom || undefined,
        shiftDetails: {
            ...(profile.shiftDetails || {}),
            assignedShift: resolvedWorkShift || profile.shiftDetails?.assignedShift || 'General Shift',
            shiftType: resolvedWorkShift || profile.shiftDetails?.shiftType || 'General Shift',
            upcomingShift: resolvedUpcomingShift,
            upcomingShiftEffectiveFrom: resolvedUpcomingEffectiveFrom,
        },
        shiftId: data.shift_id || undefined,
        panNumber: data.pan_number || profile.salaryDetails?.panNumber || undefined,
        uanNumber: data.uan_number || profile.salaryDetails?.uanNumber || undefined,
        addressLine1: data.address_line1 || profile.currentAddress?.line1 || undefined,
        addressLine2: data.address_line2 || profile.currentAddress?.line2 || undefined,
        city: data.city || profile.currentAddress?.city || undefined,
        state: data.state || profile.currentAddress?.state || undefined,
        country: data.country || profile.currentAddress?.country || undefined,
        pincode: data.pincode || profile.currentAddress?.pincode || undefined,
        currentAddress: {
            ...(profile.currentAddress || {}),
            line1: data.address_line1 || profile.currentAddress?.line1 || '',
            line2: data.address_line2 || profile.currentAddress?.line2 || '',
            city: data.city || profile.currentAddress?.city || '',
            state: data.state || profile.currentAddress?.state || '',
            country: data.country || profile.currentAddress?.country || 'India',
            pincode: data.pincode || profile.currentAddress?.pincode || '',
        },
        permanentAddress: profile.permanentAddress || {
            sameAsCurrent: true,
            line1: data.address_line1 || profile.currentAddress?.line1 || '',
            line2: data.address_line2 || profile.currentAddress?.line2 || '',
            city: data.city || profile.currentAddress?.city || '',
            state: data.state || profile.currentAddress?.state || '',
            country: data.country || profile.currentAddress?.country || 'India',
            pincode: data.pincode || profile.currentAddress?.pincode || '',
        },
        emergencyContact: profile.emergencyContact || {
            name: data.emergency_contact_name || '',
            relationship: data.emergency_contact_relationship || 'Parent',
            mobile: data.emergency_contact_phone || '',
            alternateMobile: '',
        },
        highestQualification: data.highest_qualification || profile.educationalDetails?.highestQualification || undefined,
        degreeName: data.degree_name || profile.educationalDetails?.degreeName || undefined,
        specialization: data.specialization || profile.educationalDetails?.specialization || undefined,
        university: data.university || profile.educationalDetails?.university || undefined,
        yearOfPassing: data.year_of_passing || profile.educationalDetails?.yearOfPassing || undefined,
        gradePercentage: data.grade_percentage != null ? Number(data.grade_percentage) : (profile.educationalDetails?.gradePercentage || undefined),
        experienceProfile: data.experience_profile || profile.experienceDetails?.experienceType || undefined,
        totalExperience: data.total_experience != null ? Number(data.total_experience) : (profile.experienceDetails?.totalExperience || undefined),
        previousCompany: data.previous_company || profile.experienceDetails?.previousCompany || undefined,
        previousDesignation: data.previous_designation || profile.experienceDetails?.previousDesignation || undefined,
        previousDepartment: data.previous_department || profile.experienceDetails?.previousDepartment || undefined,
        employmentStartDate: data.employment_start_date || profile.experienceDetails?.startDate || undefined,
        employmentEndDate: data.employment_end_date || profile.experienceDetails?.endDate || undefined,
        lastDrawnSalary: data.last_drawn_salary != null ? Number(data.last_drawn_salary) : (profile.experienceDetails?.lastDrawnSalary || undefined),
        previousCompanyLocation: data.previous_company_location || profile.experienceDetails?.companyLocation || undefined,
        rowVersion: Number(data.row_version ?? profile.rowVersion ?? 1),
        profile_data: profile,
    };
}
export class EmployeeRepository {
    async getEmployeeById(idOrEmpId) {
        if (!idOrEmpId || typeof idOrEmpId !== 'string')
            return null;
        const cleanId = idOrEmpId.trim();
        // High-speed memory cache check
        const cacheKey = `emp_${cleanId}`;
        const cached = memoryCache.get(cacheKey);
        if (cached)
            return cached;
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
                let query = supabase
                    .from('employees')
                    .select('*, department:departments!employees_department_id_fkey(name)');
                if (isUuid) {
                    query = query.or(`id.eq.${cleanId},employee_id.eq.${cleanId}`);
                }
                else {
                    query = query.eq('employee_id', cleanId);
                }
                const { data, error } = await query.maybeSingle();
                if (data && !error) {
                    const emp = mapDbRowToEmployee(data);
                    memoryCache.set(cacheKey, emp, 30000);
                    return emp;
                }
            }
            catch (err) {
                console.warn('Database error in getEmployeeById:', err);
            }
        }
        return null;
    }
    async findByEmail(email) {
        if (!email)
            return null;
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
            }
            catch (err) {
                console.warn('Database error in findByEmail:', err);
            }
        }
        return null;
    }
    async findByEmployeeId(empId) {
        if (!empId)
            return null;
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
            }
            catch (err) {
                console.warn('Database error in findByEmployeeId:', err);
            }
        }
        return null;
    }
    async getAllEmployees() {
        const cacheKey = 'employees_all_active';
        const cached = memoryCache.get(cacheKey);
        if (cached)
            return cached;
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
            }
            catch (err) {
                console.warn('Database error in getAllEmployees:', err);
            }
        }
        return [];
    }
    async getSalaryStructure(employeeId, asOfDate = new Date().toISOString().slice(0, 10)) {
        if (!employeeId)
            return null;
        const cleanId = employeeId.trim();
        const cacheKey = `ss_${cleanId}_${asOfDate}`;
        const cached = memoryCache.get(cacheKey);
        if (cached)
            return cached;
        const emp = await this.getEmployeeById(cleanId);
        if (!emp)
            return null;
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data, error } = await supabase
                    .from('salary_structures')
                    .select('*')
                    .eq('employee_id', emp.id)
                    .eq('is_active', true)
                    .lte('effective_from', asOfDate)
                    .or(`effective_to.is.null,effective_to.gte.${asOfDate}`)
                    .order('effective_from', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (data && !error) {
                    const struct = {
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
            }
            catch (err) {
                console.warn('Database error in getSalaryStructure:', err);
            }
        }
        return null;
    }
    async saveSalaryStructure(employeeId, structure) {
        const emp = await this.getEmployeeById(employeeId);
        const key = emp ? emp.employeeId : employeeId;
        const record = {
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
                const previousDate = new Date(`${record.effectiveFrom}T12:00:00Z`);
                previousDate.setUTCDate(previousDate.getUTCDate() - 1);
                // Close only the revision that overlaps the new effective date. Future
                // revisions remain scheduled and finalized payroll remains immutable.
                await supabase
                    .from('salary_structures')
                    .update({ effective_to: previousDate.toISOString().slice(0, 10) })
                    .eq('employee_id', emp.id)
                    .lt('effective_from', record.effectiveFrom)
                    .or(`effective_to.is.null,effective_to.gte.${record.effectiveFrom}`);
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
            }
            catch (err) {
                console.warn('Could not persist salary structure to Supabase:', err);
            }
        }
        return record;
    }
    async getEmployees(filters) {
        let list = await this.getAllEmployees();
        if (filters?.department && filters.department !== 'All') {
            list = list.filter((e) => e.department.toLowerCase() === filters.department?.toLowerCase());
        }
        if (filters?.search) {
            const q = filters.search.toLowerCase();
            list = list.filter((e) => e.firstName.toLowerCase().includes(q) ||
                e.lastName.toLowerCase().includes(q) ||
                e.employeeId.toLowerCase().includes(q) ||
                e.email.toLowerCase().includes(q));
        }
        return list;
    }
    async createEmployee(data) {
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
        let roleId = data.roleId;
        if (!roleId) {
            const { data: roleData } = await supabase
                .from('roles')
                .select('id')
                .eq('key', 'employee')
                .maybeSingle();
            roleId = roleData?.id || '965e3410-4ab8-4930-9740-89aa34216ac3';
        }
        let deptId = data.departmentId || data.department_id;
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
        const basicVal = Number(data.basicSalary || data.basic_salary || 0);
        const explicitCtcVal = Number(data.salaryDetails?.monthlyCtc || data.monthlyCtc || data.monthly_ctc || data.grossSalary || data.gross_salary || 0);
        const resolvedCtcVal = explicitCtcVal > 0 ? explicitCtcVal : (basicVal > 0 ? Math.round(basicVal / 0.4) : 0);
        const rawPlainPassword = (data.password && !data.password.startsWith('$2'))
            ? data.password
            : (data.portalPassword && !data.portalPassword.startsWith('$2')
                ? data.portalPassword
                : 'Password@123');
        const insertPayload = {
            employee_id: empId,
            first_name: data.firstName || '',
            last_name: data.lastName || '',
            email: (data.email || '').toLowerCase().trim(),
            basic_salary: basicVal,
            designation: data.designation || 'Staff',
            department_id: deptId || null,
            phone: data.phone || data.mobile || null,
            dob: data.dob || data.profile_data?.dob || null,
            gender: data.gender || data.profile_data?.gender || 'Male',
            joining_date: data.joiningDate || data.joining_date || data.profile_data?.joiningDate || null,
            employment_type: data.employmentType || data.employment_type || data.profile_data?.employmentType || 'Full-Time',
            work_shift: data.workShift || data.work_shift || data.shift || 'SH-01',
            branch: data.branch || data.workLocation || null,
            role_id: roleId,
            status: data.status || 'Active',
            attendance_method: data.attendanceMethod || 'Face Scan',
            gps_allowed: data.gpsAllowed ?? data.gps_allowed ?? true,
            allowances_hra: Number(data.hra ?? data.allowances?.hra ?? data.salaryDetails?.hra ?? data.allowances_hra ?? (resolvedCtcVal > 0 ? Math.round(resolvedCtcVal * 0.35) : 0)),
            allowances_transport: Number(data.conveyance ?? data.transport ?? data.allowances?.transport ?? data.salaryDetails?.conveyance ?? data.allowances_transport ?? (resolvedCtcVal > 0 ? Math.round(resolvedCtcVal * 0.05) : 0)),
            allowances_medical: Number(data.medical ?? data.allowances?.medical ?? data.allowances_medical ?? 0),
            allowances_special: Number(data.special ?? data.allowances?.special ?? data.allowances_special ?? 0),
            must_change_password: data.mustChangePassword ?? true,
            account_status: data.accountStatus || 'ACTIVE',
            credential_email_status: data.credentialEmailStatus || 'PENDING',
            password: (data.password && /^\$2[aby]\$\d{2}\$/.test(data.password))
                ? data.password
                : await bcrypt.hash(rawPlainPassword, 12),
        };
        // Banking & Statutory
        const bankName = data.bankName || data.bankDetails?.bankName;
        if (bankName !== undefined)
            insertPayload.bank_name = bankName;
        const accountNumber = data.accountNumber || data.bankDetails?.accountNumber;
        if (accountNumber !== undefined)
            insertPayload.account_number = String(accountNumber);
        const ifscCode = data.ifscCode || data.bankDetails?.ifscCode;
        if (ifscCode !== undefined)
            insertPayload.ifsc_code = ifscCode;
        const panNumber = data.panNumber || data.salaryDetails?.panNumber || data.pan;
        if (panNumber !== undefined)
            insertPayload.pan_number = panNumber;
        const uanNumber = data.uanNumber || data.salaryDetails?.uanNumber || data.uan;
        if (uanNumber !== undefined)
            insertPayload.uan_number = String(uanNumber);
        // Current Address
        const addressLine1 = data.addressLine1 || data.line1 || data.currentLine1 || data.currentAddress?.line1;
        if (addressLine1 !== undefined)
            insertPayload.address_line1 = addressLine1;
        const addressLine2 = data.addressLine2 || data.line2 || data.currentLine2 || data.currentAddress?.line2;
        if (addressLine2 !== undefined)
            insertPayload.address_line2 = addressLine2;
        const city = data.city || data.currentCity || data.currentAddress?.city;
        if (city !== undefined)
            insertPayload.city = city;
        const state = data.state || data.currentState || data.currentAddress?.state;
        if (state !== undefined)
            insertPayload.state = state;
        const country = data.country || data.currentCountry || data.currentAddress?.country;
        if (country !== undefined)
            insertPayload.country = country;
        const pincode = data.pincode || data.currentPincode || data.currentAddress?.pincode;
        if (pincode !== undefined)
            insertPayload.pincode = String(pincode);
        // Educational Qualifications
        const highestQualification = data.highestQualification || data.qualification || data.educationalDetails?.highestQualification;
        if (highestQualification !== undefined)
            insertPayload.highest_qualification = highestQualification;
        const degreeName = data.degreeName || data.courseName || data.educationalDetails?.degreeName;
        if (degreeName !== undefined)
            insertPayload.degree_name = degreeName;
        const specialization = data.specialization || data.educationalDetails?.specialization;
        if (specialization !== undefined)
            insertPayload.specialization = specialization;
        const university = data.university || data.institution || data.educationalDetails?.university;
        if (university !== undefined)
            insertPayload.university = university;
        const yearOfPassing = data.yearOfPassing !== undefined ? Number(data.yearOfPassing) : data.educationalDetails?.yearOfPassing ? Number(data.educationalDetails.yearOfPassing) : undefined;
        if (yearOfPassing !== undefined && !isNaN(yearOfPassing))
            insertPayload.year_of_passing = yearOfPassing;
        const gradePercentage = data.gradePercentage !== undefined ? Number(data.gradePercentage) : data.educationalDetails?.gradePercentage ? Number(data.educationalDetails.gradePercentage) : undefined;
        if (gradePercentage !== undefined && !isNaN(gradePercentage))
            insertPayload.grade_percentage = gradePercentage;
        // Experience Details
        const experienceProfile = data.experienceProfile || data.experienceType || data.experienceDetails?.experienceType;
        if (experienceProfile !== undefined)
            insertPayload.experience_profile = experienceProfile;
        const totalExperience = data.totalExperience !== undefined ? Number(data.totalExperience) : data.experienceDetails?.totalExperience ? Number(data.experienceDetails.totalExperience) : undefined;
        if (totalExperience !== undefined && !isNaN(totalExperience))
            insertPayload.total_experience = totalExperience;
        const previousCompany = data.previousCompany || data.previousCompanyName || data.experienceDetails?.previousCompany;
        if (previousCompany !== undefined)
            insertPayload.previous_company = previousCompany;
        const previousDesignation = data.previousDesignation || data.experienceDetails?.previousDesignation;
        if (previousDesignation !== undefined)
            insertPayload.previous_designation = previousDesignation;
        const previousDepartment = data.previousDepartment || data.experienceDetails?.previousDepartment;
        if (previousDepartment !== undefined)
            insertPayload.previous_department = previousDepartment;
        const employmentStartDate = data.employmentStartDate || data.startDate || data.expStartDate || data.experienceDetails?.startDate;
        if (employmentStartDate !== undefined)
            insertPayload.employment_start_date = employmentStartDate;
        const employmentEndDate = data.employmentEndDate || data.endDate || data.expEndDate || data.experienceDetails?.endDate;
        if (employmentEndDate !== undefined)
            insertPayload.employment_end_date = employmentEndDate;
        const lastDrawnSalary = data.lastDrawnSalary !== undefined ? Number(data.lastDrawnSalary) : data.experienceDetails?.lastDrawnSalary ? Number(data.experienceDetails.lastDrawnSalary) : undefined;
        if (lastDrawnSalary !== undefined && !isNaN(lastDrawnSalary))
            insertPayload.last_drawn_salary = lastDrawnSalary;
        const previousCompanyLocation = data.previousCompanyLocation || data.companyLocation || data.experienceDetails?.companyLocation;
        if (previousCompanyLocation !== undefined)
            insertPayload.previous_company_location = previousCompanyLocation;
        // Build comprehensive profile_data JSONB to ensure 100% data preservation
        const structuredProfile = {
            ...(typeof data.profile_data === 'object' && data.profile_data !== null ? data.profile_data : {}),
            portalPassword: rawPlainPassword,
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            email: (data.email || '').toLowerCase().trim(),
            personalEmail: data.personalEmail || data.personal_email || (data.email || '').toLowerCase().trim(),
            phone: data.phone || data.mobile || null,
            dob: insertPayload.dob,
            gender: insertPayload.gender,
            department: data.department || 'General',
            designation: data.designation || 'Staff',
            joiningDate: insertPayload.joining_date,
            employmentType: insertPayload.employment_type,
            workLocation: insertPayload.branch,
            workShift: insertPayload.work_shift,
            attendanceMethod: insertPayload.attendance_method,
            gpsAllowed: insertPayload.gps_allowed,
            currentAddress: data.currentAddress || {
                line1: insertPayload.address_line1 || '',
                line2: insertPayload.address_line2 || '',
                city: insertPayload.city || '',
                state: insertPayload.state || '',
                country: insertPayload.country || 'India',
                pincode: insertPayload.pincode || '',
            },
            permanentAddress: data.permanentAddress || {
                sameAsCurrent: true,
                line1: insertPayload.address_line1 || '',
                line2: insertPayload.address_line2 || '',
                city: insertPayload.city || '',
                state: insertPayload.state || '',
                country: insertPayload.country || 'India',
                pincode: insertPayload.pincode || '',
            },
            emergencyContact: data.emergencyContact || {
                name: data.emergencyName || data.emergency_contact_name || '',
                relationship: data.emergencyRelationship || data.emergency_contact_relationship || 'Parent',
                mobile: data.emergencyMobile || data.emergency_contact_phone || '',
                alternateMobile: data.emergencyAltMobile || '',
            },
            bankDetails: data.bankDetails || {
                bankName: insertPayload.bank_name || '',
                accountNumber: insertPayload.account_number || '',
                ifscCode: insertPayload.ifsc_code || '',
                branch: insertPayload.branch || insertPayload.city || '',
            },
            salaryDetails: {
                ...(data.salaryDetails || {}),
                monthlyCtc: resolvedCtcVal,
                basicSalary: basicVal,
                hra: insertPayload.allowances_hra,
                da: Number(data.salaryDetails?.da || (resolvedCtcVal > 0 ? Math.round(resolvedCtcVal * 0.20) : 0)),
                conveyance: insertPayload.allowances_transport,
                salaryScheme: data.salaryDetails?.salaryScheme || (data.withPf ? 'WITH_PF' : 'WITHOUT_PF'),
                withPf: data.withPf ?? data.salaryDetails?.withPf ?? true,
                panNumber: insertPayload.pan_number || '',
                uanNumber: insertPayload.uan_number || '',
            },
            educationalDetails: data.educationalDetails || {
                highestQualification: insertPayload.highest_qualification || '',
                degreeName: insertPayload.degree_name || '',
                specialization: insertPayload.specialization || '',
                university: insertPayload.university || '',
                yearOfPassing: insertPayload.year_of_passing ? String(insertPayload.year_of_passing) : '',
                gradePercentage: insertPayload.grade_percentage ? String(insertPayload.grade_percentage) : '',
            },
            experienceDetails: data.experienceDetails || {
                experienceType: insertPayload.experience_profile || 'Fresher',
                totalExperience: insertPayload.total_experience ? String(insertPayload.total_experience) : '0',
                previousCompany: insertPayload.previous_company || '',
                previousDesignation: insertPayload.previous_designation || '',
                previousDepartment: insertPayload.previous_department || '',
                startDate: insertPayload.employment_start_date || '',
                endDate: insertPayload.employment_end_date || '',
                lastDrawnSalary: insertPayload.last_drawn_salary ? String(insertPayload.last_drawn_salary) : '',
                companyLocation: insertPayload.previous_company_location || '',
            },
            professionalDetails: data.professionalDetails || {
                skills: data.skills || [],
            },
        };
        insertPayload.profile_data = structuredProfile;
        const insertRes = await supabase.from('employees').insert(insertPayload).select('*, department:departments!employees_department_id_fkey(name)').single();
        if (insertRes.error || !insertRes.data) {
            throw new Error(`Failed to create employee in database: ${insertRes.error?.message || 'Unknown database error'}`);
        }
        memoryCache.invalidatePattern('emp_');
        memoryCache.invalidatePattern('ss_');
        memoryCache.invalidate('employees_all_active');
        return mapDbRowToEmployee(insertRes.data);
    }
    async updateEmployee(id, updates) {
        const emp = await this.getEmployeeById(id);
        if (!emp)
            return null;
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const payload = {};
                if (updates.firstName !== undefined)
                    payload.first_name = updates.firstName;
                if (updates.lastName !== undefined)
                    payload.last_name = updates.lastName;
                if (updates.email !== undefined)
                    payload.email = updates.email ? updates.email.toLowerCase().trim() : '';
                if (updates.basicSalary !== undefined)
                    payload.basic_salary = updates.basicSalary;
                if (updates.designation !== undefined)
                    payload.designation = updates.designation;
                if (updates.status !== undefined)
                    payload.status = updates.status;
                if (updates.phone !== undefined)
                    payload.phone = updates.phone;
                if (updates.branch !== undefined)
                    payload.branch = updates.branch;
                if (updates.workShift !== undefined)
                    payload.work_shift = updates.workShift;
                if (updates.attendanceMethod !== undefined)
                    payload.attendance_method = updates.attendanceMethod;
                if (updates.gpsAllowed !== undefined)
                    payload.gps_allowed = updates.gpsAllowed;
                if (updates.accountStatus !== undefined)
                    payload.account_status = updates.accountStatus;
                // Banking & Statutory
                const bankName = updates.bankName || updates.bankDetails?.bankName;
                if (bankName !== undefined)
                    payload.bank_name = bankName;
                const accountNumber = updates.accountNumber || updates.bankDetails?.accountNumber;
                if (accountNumber !== undefined)
                    payload.account_number = String(accountNumber);
                const ifscCode = updates.ifscCode || updates.bankDetails?.ifscCode;
                if (ifscCode !== undefined)
                    payload.ifsc_code = ifscCode;
                const panNumber = updates.panNumber || updates.salaryDetails?.panNumber || updates.pan;
                if (panNumber !== undefined)
                    payload.pan_number = panNumber;
                const uanNumber = updates.uanNumber || updates.salaryDetails?.uanNumber || updates.uan;
                if (uanNumber !== undefined)
                    payload.uan_number = String(uanNumber);
                // Address
                const addressLine1 = updates.addressLine1 || updates.line1 || updates.currentLine1 || updates.currentAddress?.line1;
                if (addressLine1 !== undefined)
                    payload.address_line1 = addressLine1;
                const addressLine2 = updates.addressLine2 || updates.line2 || updates.currentLine2 || updates.currentAddress?.line2;
                if (addressLine2 !== undefined)
                    payload.address_line2 = addressLine2;
                const city = updates.city || updates.currentCity || updates.currentAddress?.city;
                if (city !== undefined)
                    payload.city = city;
                const state = updates.state || updates.currentState || updates.currentAddress?.state;
                if (state !== undefined)
                    payload.state = state;
                const country = updates.country || updates.currentCountry || updates.currentAddress?.country;
                if (country !== undefined)
                    payload.country = country;
                const pincode = updates.pincode || updates.currentPincode || updates.currentAddress?.pincode;
                if (pincode !== undefined)
                    payload.pincode = String(pincode);
                // Educational
                const highestQualification = updates.highestQualification || updates.qualification || updates.educationalDetails?.highestQualification;
                if (highestQualification !== undefined)
                    payload.highest_qualification = highestQualification;
                const degreeName = updates.degreeName || updates.courseName || updates.educationalDetails?.degreeName;
                if (degreeName !== undefined)
                    payload.degree_name = degreeName;
                const specialization = updates.specialization || updates.educationalDetails?.specialization;
                if (specialization !== undefined)
                    payload.specialization = specialization;
                const university = updates.university || updates.institution || updates.educationalDetails?.university;
                if (university !== undefined)
                    payload.university = university;
                const yearOfPassing = updates.yearOfPassing !== undefined ? Number(updates.yearOfPassing) : updates.educationalDetails?.yearOfPassing ? Number(updates.educationalDetails.yearOfPassing) : undefined;
                if (yearOfPassing !== undefined && !isNaN(yearOfPassing))
                    payload.year_of_passing = yearOfPassing;
                const gradePercentage = updates.gradePercentage !== undefined ? Number(updates.gradePercentage) : updates.educationalDetails?.gradePercentage ? Number(updates.educationalDetails.gradePercentage) : undefined;
                if (gradePercentage !== undefined && !isNaN(gradePercentage))
                    payload.grade_percentage = gradePercentage;
                // Experience
                const experienceProfile = updates.experienceProfile || updates.experienceType || updates.experienceDetails?.experienceType;
                if (experienceProfile !== undefined)
                    payload.experience_profile = experienceProfile;
                const totalExperience = updates.totalExperience !== undefined ? Number(updates.totalExperience) : updates.experienceDetails?.totalExperience ? Number(updates.experienceDetails.totalExperience) : undefined;
                if (totalExperience !== undefined && !isNaN(totalExperience))
                    payload.total_experience = totalExperience;
                const previousCompany = updates.previousCompany || updates.previousCompanyName || updates.experienceDetails?.previousCompany;
                if (previousCompany !== undefined)
                    payload.previous_company = previousCompany;
                const previousDesignation = updates.previousDesignation || updates.experienceDetails?.previousDesignation;
                if (previousDesignation !== undefined)
                    payload.previous_designation = previousDesignation;
                const previousDepartment = updates.previousDepartment || updates.experienceDetails?.previousDepartment;
                if (previousDepartment !== undefined)
                    payload.previous_department = previousDepartment;
                const employmentStartDate = updates.employmentStartDate || updates.startDate || updates.expStartDate || updates.experienceDetails?.startDate;
                if (employmentStartDate !== undefined)
                    payload.employment_start_date = employmentStartDate;
                const employmentEndDate = updates.employmentEndDate || updates.endDate || updates.expEndDate || updates.experienceDetails?.endDate;
                if (employmentEndDate !== undefined)
                    payload.employment_end_date = employmentEndDate;
                const lastDrawnSalary = updates.lastDrawnSalary !== undefined ? Number(updates.lastDrawnSalary) : updates.experienceDetails?.lastDrawnSalary ? Number(updates.experienceDetails.lastDrawnSalary) : undefined;
                if (lastDrawnSalary !== undefined && !isNaN(lastDrawnSalary))
                    payload.last_drawn_salary = lastDrawnSalary;
                const previousCompanyLocation = updates.previousCompanyLocation || updates.companyLocation || updates.experienceDetails?.companyLocation;
                if (previousCompanyLocation !== undefined)
                    payload.previous_company_location = previousCompanyLocation;
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
                // Merge profile_data so JSONB remains completely up-to-date
                const existingProfile = emp.profile_data || {};
                payload.profile_data = {
                    ...existingProfile,
                    ...(updates.profile_data || {}),
                    ...(updates.currentAddress ? { currentAddress: { ...(existingProfile.currentAddress || {}), ...updates.currentAddress } } : {}),
                    ...(updates.permanentAddress ? { permanentAddress: { ...(existingProfile.permanentAddress || {}), ...updates.permanentAddress } } : {}),
                    ...(updates.emergencyContact ? { emergencyContact: { ...(existingProfile.emergencyContact || {}), ...updates.emergencyContact } } : {}),
                    ...(updates.bankDetails ? { bankDetails: { ...(existingProfile.bankDetails || {}), ...updates.bankDetails } } : {}),
                    ...(updates.salaryDetails ? { salaryDetails: { ...(existingProfile.salaryDetails || {}), ...updates.salaryDetails } } : {}),
                    ...(updates.educationalDetails ? { educationalDetails: { ...(existingProfile.educationalDetails || {}), ...updates.educationalDetails } } : {}),
                    ...(updates.experienceDetails ? { experienceDetails: { ...(existingProfile.experienceDetails || {}), ...updates.experienceDetails } } : {}),
                };
                if (updates.password && !updates.password.startsWith('$2')) {
                    payload.password = await bcrypt.hash(updates.password, 12);
                    payload.profile_data.portalPassword = updates.password;
                }
                else if (updates.portalPassword && !updates.portalPassword.startsWith('$2')) {
                    payload.password = await bcrypt.hash(updates.portalPassword, 12);
                    payload.profile_data.portalPassword = updates.portalPassword;
                }
                await supabase
                    .from('employees')
                    .update(payload)
                    .eq('id', emp.id);
                memoryCache.invalidatePattern('emp_');
                memoryCache.invalidatePattern('ss_');
                memoryCache.invalidate('employees_all_active');
                return await this.getEmployeeById(emp.id);
            }
            catch (err) {
                console.warn('Could not update employee in Supabase:', err);
            }
        }
        return null;
    }
    async deleteEmployee(id) {
        if (!id)
            return false;
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
                }
                else {
                    deleteQuery = deleteQuery.eq('employee_id', cleanId);
                }
                const { error } = await deleteQuery;
                if (!error) {
                    return true;
                }
                else {
                    console.warn('Could not delete employee from Supabase:', error);
                }
            }
            catch (err) {
                console.warn('Supabase delete exception:', err);
            }
        }
        return false;
    }
}
export const employeeRepository = new EmployeeRepository();
//# sourceMappingURL=employeeRepository.js.map