import { withTransaction } from '../config/database.js';
import { computeFullPayroll } from './calculationEngine.js';
const isoDate = (value, fallback) => {
    const text = String(value || fallback).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
        throw Object.assign(new Error('Effective date must be a valid YYYY-MM-DD date.'), { statusCode: 400, code: 'INVALID_EFFECTIVE_DATE' });
    }
    return text;
};
const previousDate = (date) => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
};
const amount = (value) => {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw Object.assign(new Error('Salary component values must be non-negative numbers.'), { statusCode: 400, code: 'INVALID_SALARY_COMPONENT' });
    }
    return Number(parsed.toFixed(2));
};
const withoutSecrets = (value) => {
    const copy = JSON.parse(JSON.stringify(value || {}));
    delete copy.password;
    delete copy.mustChangePassword;
    delete copy.officialUsername;
    return copy;
};
const resolveEmployee = async (client, identifier, companyId) => {
    const result = await client.query(`SELECT e.*, d.name AS department_name
       FROM public.employees e
       LEFT JOIN public.departments d ON d.id = e.department_id
      WHERE e.company_id = $1 AND (e.id::text = $2 OR lower(e.employee_id) = lower($2))
      FOR UPDATE OF e`, [companyId, identifier.trim()]);
    if (!result.rows[0]) {
        throw Object.assign(new Error(`Employee ${identifier} was not found in the active company.`), { statusCode: 404, code: 'EMPLOYEE_NOT_FOUND' });
    }
    return result.rows[0];
};
const recalculateDraftPayroll = async (client, employee, structureId, effectiveFrom, salary) => {
    const settingsResult = await client.query(`SELECT * FROM public.payroll_settings ORDER BY updated_at DESC LIMIT 1`);
    const settings = settingsResult.rows[0];
    if (!settings)
        return 0;
    const configResult = await client.query(`SELECT setting_val FROM public.company_settings WHERE setting_key = 'payroll_settings_config' LIMIT 1`);
    const configuredComponents = Array.isArray(configResult.rows[0]?.setting_val?.components)
        ? configResult.rows[0].setting_val.components
        : [];
    const records = await client.query(`SELECT pr.*, pa.working_days, pa.present_days, pa.paid_leave_days, pa.unpaid_leave_days,
            pa.absent_days, pa.half_days, pa.lop_days AS attendance_lop_days, pa.overtime_hours
       FROM public.payroll_records pr
       JOIN public.payroll_runs run ON run.id = pr.payroll_run_id
       LEFT JOIN public.payroll_attendance pa ON pa.payroll_record_id = pr.id
      WHERE pr.employee_id = $1
        AND pr.status = 'DRAFT' AND run.status = 'DRAFT'
        AND make_date(pr.payroll_year, pr.payroll_month, 1) >= date_trunc('month', $2::date)::date
      FOR UPDATE OF pr`, [employee.id, effectiveFrom]);
    for (const row of records.rows) {
        const calculated = computeFullPayroll({
            employeeId: employee.employee_id,
            monthlySalary: salary.monthlySalary,
            basicPercentage: salary.basicPercentage,
            daPercentage: salary.daPercentage,
            conveyancePercentage: salary.conveyancePercentage,
            hraPercentage: salary.hraPercentage,
            payrollMonth: row.payroll_month,
            payrollYear: row.payroll_year,
            withPf: salary.withPf,
            settings: {
                id: settings.id,
                orgKey: settings.org_key,
                pfEnabled: settings.pf_enabled,
                pfRate: Number(settings.pf_rate),
                pfWageCeiling: Number(settings.pf_wage_ceiling),
                pfWageComponents: settings.pf_wage_components,
                esicEnabled: settings.esic_enabled,
                esicRate: Number(settings.esic_rate),
                esicSalaryThreshold: Number(settings.esic_salary_threshold),
                esicWageComponents: settings.esic_wage_components,
                professionalTaxEnabled: settings.professional_tax_enabled,
                professionalTaxAmount: Number(settings.professional_tax_amount),
                lopEnabled: settings.lop_enabled,
                attendanceBonusEnabled: settings.attendance_bonus_enabled,
                overtimeEnabled: settings.overtime_enabled,
                standardWorkingDays: settings.standard_working_days,
                payrollCycleDay: settings.payroll_cycle_day,
            },
            attendance: {
                workingDays: Number(row.working_days ?? settings.standard_working_days ?? 26),
                presentDays: Number(row.present_days ?? settings.standard_working_days ?? 26),
                paidLeaveDays: Number(row.paid_leave_days ?? 0),
                unpaidLeaveDays: Number(row.unpaid_leave_days ?? 0),
                absentDays: Number(row.absent_days ?? 0),
                halfDays: Number(row.half_days ?? 0),
                lopDays: Number(row.attendance_lop_days ?? row.lop_days ?? 0),
                overtimeHours: Number(row.overtime_hours ?? 0),
            },
            earnings: {
                attendanceBonus: Number(row.attendance_bonus ?? 0),
                overtimeAmount: Number(row.overtime_amount ?? 0),
                bonus: Number(row.bonus ?? 0),
                incentive: Number(row.incentive ?? 0),
                commission: Number(row.commission ?? 0),
                otherEarnings: Number(row.other_earnings ?? 0),
            },
            deductions: {
                advanceRecovery: Number(row.advance_recovery ?? 0),
                loanRecovery: Number(row.loan_recovery ?? 0),
                otherDeductions: Number(row.other_deductions ?? 0),
            },
            configuredComponents,
            employeeContext: {
                id: employee.id,
                employeeId: employee.employee_id,
                monthlyCtc: salary.monthlySalary,
                basicSalary: salary.monthlySalary * salary.basicPercentage / 100,
                withPf: salary.withPf,
                payrollMonth: row.payroll_month,
                payrollYear: row.payroll_year,
            },
        });
        await client.query(`UPDATE public.payroll_records SET
         salary_structure_id=$2, basic_salary=$3, da=$4, conveyance=$5, hra=$6,
         gross_salary=$7, pf_base=$8, pf_rate=$9, pf_amount=$10,
         esic_base=$11, esic_rate=$12, esic_amount=$13, professional_tax=$14,
         lop_amount=$15, total_deductions=$16, net_salary=$17,
         needs_recalculation=FALSE, updated_at=NOW()
       WHERE id=$1 AND status='DRAFT'`, [row.id, structureId, calculated.basicSalary, calculated.da, calculated.conveyance,
            calculated.hra, calculated.grossSalary, calculated.pfBase, calculated.pfRate,
            calculated.pfAmount, calculated.esicBase, calculated.esicRate, calculated.esicAmount,
            calculated.professionalTax, calculated.lopAmount, calculated.totalDeductions, calculated.netSalary]);
    }
    return records.rowCount || 0;
};
export class EmployeeProfileSyncService {
    async save(identifier, input, options, actor) {
        const companyId = actor.company_id || input.company_id || input.companyId || 'company-a';
        const today = new Date().toISOString().slice(0, 10);
        const shiftEffectiveFrom = isoDate(options.shiftEffectiveFrom, today);
        const salaryEffectiveFrom = isoDate(options.salaryEffectiveFrom, today);
        const weeklyOffEffectiveFrom = isoDate(options.weeklyOffEffectiveFrom, shiftEffectiveFrom);
        const performer = actor.email || actor.employeeId || actor.id || 'authorized-user';
        return withTransaction(async (client) => {
            const oldEmployee = await resolveEmployee(client, identifier, companyId);
            if (options.expectedVersion !== undefined && Number(oldEmployee.row_version) !== Number(options.expectedVersion)) {
                throw Object.assign(new Error('This employee profile was changed by another user. Reload and apply your changes again.'), {
                    statusCode: 409, code: 'STALE_EMPLOYEE_VERSION', currentVersion: Number(oldEmployee.row_version),
                });
            }
            let departmentId = oldEmployee.department_id;
            if (input.department !== undefined || input.departmentId !== undefined) {
                const department = await client.query(`SELECT id FROM public.departments WHERE id::text=$1 OR lower(name)=lower($2) LIMIT 1`, [String(input.departmentId || ''), String(input.department || '')]);
                if (!department.rows[0])
                    throw Object.assign(new Error('Selected department does not exist.'), { statusCode: 400, code: 'INVALID_DEPARTMENT' });
                departmentId = department.rows[0].id;
            }
            let managerId = oldEmployee.reporting_manager_id;
            if (input.reportingManagerId !== undefined) {
                managerId = null;
                if (input.reportingManagerId) {
                    const manager = await client.query(`SELECT id FROM public.employees WHERE company_id=$1 AND (id::text=$2 OR employee_id=$2) AND id<>$3 LIMIT 1`, [companyId, input.reportingManagerId, oldEmployee.id]);
                    if (!manager.rows[0])
                        throw Object.assign(new Error('Selected reporting manager is invalid.'), { statusCode: 400, code: 'INVALID_REPORTING_MANAGER' });
                    managerId = manager.rows[0].id;
                }
            }
            const profileData = { ...(oldEmployee.profile_data || {}), ...withoutSecrets(input) };
            const updatedResult = await client.query(`UPDATE public.employees SET
          first_name=COALESCE($3,first_name), last_name=COALESCE($4,last_name),
          email=COALESCE($5,email), phone=$6, dob=$7, gender=COALESCE($8,gender),
          address=COALESCE($9,address), department_id=$10, designation=COALESCE($11,designation),
          reporting_manager_id=$12, reporting_manager_name=$13, joining_date=$14,
          employment_type=COALESCE($15,employment_type), status=COALESCE($16,status),
          avatar_url=$17, basic_salary=COALESCE($18,basic_salary),
          allowances_hra=COALESCE($19,allowances_hra), allowances_transport=COALESCE($20,allowances_transport),
          allowances_medical=COALESCE($21,allowances_medical), allowances_special=COALESCE($22,allowances_special),
          bank_name=$23, account_number=$24, ifsc_code=$25, branch=$26,
          attendance_method=COALESCE($27,attendance_method), gps_allowed=COALESCE($28,gps_allowed),
          work_shift=COALESCE($29,work_shift), pan_number=$30, uan_number=$31,
          address_line1=$32, address_line2=$33, city=$34, state=$35, country=$36, pincode=$37,
          highest_qualification=$38, degree_name=$39, specialization=$40, university=$41,
          year_of_passing=$42, grade_percentage=$43, experience_profile=$44,
          total_experience=$45, previous_company=$46, previous_designation=$47,
          previous_department=$48, employment_start_date=$49, employment_end_date=$50,
          last_drawn_salary=$51, previous_company_location=$52,
          profile_data=$53::jsonb,
          account_status=CASE WHEN $16 IN ('Inactive','Terminated') THEN 'DEACTIVATED' ELSE COALESCE($54,account_status) END,
          payroll_eligible=CASE WHEN $16 IN ('Inactive','Terminated') THEN FALSE ELSE COALESCE($55,payroll_eligible) END,
          row_version=row_version+1, updated_at=NOW()
        WHERE id=$1 AND company_id=$2 RETURNING *`, [oldEmployee.id, companyId, input.firstName ?? null, input.lastName ?? null,
                input.email ?? input.personalEmail ?? null, input.phone || null, input.dob || null, input.gender ?? null,
                input.address ?? null, departmentId, input.designation ?? null, managerId, input.reportingManagerName || null,
                input.joiningDate || null, input.employmentType ?? null, input.status ?? null, input.avatar || null,
                input.basicSalary === undefined ? null : amount(input.basicSalary),
                input.allowances?.hra === undefined ? null : amount(input.allowances.hra),
                input.allowances?.transport === undefined ? null : amount(input.allowances.transport),
                input.allowances?.medical === undefined ? null : amount(input.allowances.medical),
                input.allowances?.special === undefined ? null : amount(input.allowances.special),
                input.bankDetails?.bankName || null, input.bankDetails?.accountNumber || null,
                input.bankDetails?.ifscCode?.toUpperCase() || null, input.workLocation || input.bankDetails?.branch || null,
                input.attendanceMethod ?? null, input.gpsAllowed ?? null, input.workShift ?? null,
                input.salaryDetails?.panNumber?.toUpperCase() || null, input.salaryDetails?.uanNumber || null,
                input.currentAddress?.line1 || null, input.currentAddress?.line2 || null, input.currentAddress?.city || null,
                input.currentAddress?.state || null, input.currentAddress?.country || null, input.currentAddress?.pincode || null,
                input.educationalDetails?.highestQualification || null, input.educationalDetails?.degreeName || null,
                input.educationalDetails?.specialization || null, input.educationalDetails?.university || null,
                input.educationalDetails?.yearOfPassing ? Number(input.educationalDetails.yearOfPassing) : null,
                input.educationalDetails?.gradePercentage ? Number(input.educationalDetails.gradePercentage) : null,
                input.experienceDetails?.experienceType || null,
                input.experienceDetails?.totalExperience ? Number(input.experienceDetails.totalExperience) : null,
                input.experienceDetails?.previousCompany || null, input.experienceDetails?.previousDesignation || null,
                input.experienceDetails?.previousDepartment || null, input.experienceDetails?.startDate || null,
                input.experienceDetails?.endDate || null,
                input.experienceDetails?.lastDrawnSalary ? Number(input.experienceDetails.lastDrawnSalary) : null,
                input.experienceDetails?.companyLocation || null, JSON.stringify(profileData),
                input.accountStatus || null, input.payrollEligible ?? null]);
            const updatedEmployee = updatedResult.rows[0];
            const changedFields = Object.keys(input).filter(key => key !== 'password' && key !== 'mustChangePassword');
            let shiftChanged = false;
            let salaryChanged = false;
            let weeklyOffChanged = false;
            let draftPayrollRecalculated = 0;
            if (input.workShift) {
                const shift = await client.query(`SELECT * FROM public.shifts WHERE company_id=$1 AND (id::text=$2 OR lower(shift_name)=lower($2)) LIMIT 1`, [companyId, input.workShift]);
                if (!shift.rows[0])
                    throw Object.assign(new Error('Selected shift does not exist in the company shift master.'), { statusCode: 400, code: 'INVALID_SHIFT' });
                const current = await client.query(`SELECT * FROM public.shift_assignments WHERE employee_id=$1 AND effective_from<=$2
            AND (effective_to IS NULL OR effective_to>=$2) ORDER BY effective_from DESC LIMIT 1 FOR UPDATE`, [oldEmployee.id, shiftEffectiveFrom]);
                if (current.rows[0]?.shift_id !== shift.rows[0].id) {
                    shiftChanged = true;
                    await client.query(`UPDATE public.shift_assignments SET effective_to=$2::date-1, updated_at=NOW()
              WHERE employee_id=$1 AND effective_from<$2 AND (effective_to IS NULL OR effective_to>=$2)`, [oldEmployee.id, shiftEffectiveFrom]);
                    const next = await client.query(`SELECT min(effective_from) AS next_date FROM public.shift_assignments WHERE employee_id=$1 AND effective_from>$2`, [oldEmployee.id, shiftEffectiveFrom]);
                    await client.query(`INSERT INTO public.shift_assignments(company_id,employee_id,shift_id,effective_from,effective_to)
             VALUES($1,$2,$3,$4,CASE WHEN $5::date IS NULL THEN NULL ELSE $5::date-1 END)
             ON CONFLICT(employee_id,effective_from) DO UPDATE SET shift_id=EXCLUDED.shift_id,
               company_id=EXCLUDED.company_id,effective_to=EXCLUDED.effective_to,updated_at=NOW()`, [companyId, oldEmployee.id, shift.rows[0].id, shiftEffectiveFrom, next.rows[0]?.next_date || null]);
                    await client.query(`UPDATE public.attendance_records SET shift_id=$2,
                shift_policy_snapshot=jsonb_build_object('shiftId',$2,'shiftName',$3,'startTime',$4,'endTime',$5,'gracePeriodMins',$6,'overnight',($5::time <= $4::time)),
                late_status=CASE WHEN check_in IS NULL THEN late_status
                  WHEN check_in > (shift_date::timestamp + $4::time + make_interval(mins=>$6)) THEN 'Late (<30m)' ELSE 'On Time' END,
                updated_at=NOW()
              WHERE employee_id=$1 AND shift_date>=$7 AND is_finalized=FALSE`, [oldEmployee.id, shift.rows[0].id, shift.rows[0].shift_name, shift.rows[0].start_time,
                        shift.rows[0].end_time, shift.rows[0].grace_period_mins, shiftEffectiveFrom]);
                }
            }
            const weeklyOff = input.shiftDetails?.weeklyOff;
            if (weeklyOff && weeklyOff !== oldEmployee.profile_data?.shiftDetails?.weeklyOff) {
                weeklyOffChanged = true;
                await client.query(`UPDATE public.employee_weekly_off_assignments SET effective_to=$2::date-1,updated_at=NOW()
            WHERE employee_id=$1 AND effective_from<$2 AND (effective_to IS NULL OR effective_to>=$2)`, [oldEmployee.id, weeklyOffEffectiveFrom]);
                const nextWeeklyOff = await client.query(`SELECT min(effective_from) AS next_date FROM public.employee_weekly_off_assignments
            WHERE employee_id=$1 AND effective_from>$2`, [oldEmployee.id, weeklyOffEffectiveFrom]);
                await client.query(`INSERT INTO public.employee_weekly_off_assignments(company_id,employee_id,schedule_name,effective_from,effective_to,created_by)
           VALUES($1,$2,$3,$4,CASE WHEN $5::date IS NULL THEN NULL ELSE $5::date-1 END,$6)
           ON CONFLICT(employee_id,effective_from) DO UPDATE
           SET schedule_name=EXCLUDED.schedule_name,effective_to=EXCLUDED.effective_to,
               created_by=EXCLUDED.created_by,updated_at=NOW()`, [companyId, oldEmployee.id, weeklyOff, weeklyOffEffectiveFrom, nextWeeklyOff.rows[0]?.next_date || null, performer]);
            }
            const salaryDetails = input.salaryDetails;
            const oldSalary = oldEmployee.profile_data?.salaryDetails || {};
            const hasPayableSalary = salaryDetails && (Number(salaryDetails.monthlyCtc || 0) > 0 || Number(salaryDetails.basicSalary || input.basicSalary || 0) > 0 ||
                Object.values(salaryDetails).some(value => typeof value === 'number' && value > 0));
            if (salaryDetails && hasPayableSalary && JSON.stringify(salaryDetails) !== JSON.stringify(oldSalary)) {
                salaryChanged = true;
                const components = {};
                for (const [key, value] of Object.entries(salaryDetails)) {
                    if (typeof value === 'number' && !['monthlyCtc'].includes(key))
                        components[key] = amount(value);
                }
                const basic = amount(salaryDetails.basicSalary ?? input.basicSalary);
                const da = amount(salaryDetails.da);
                const conveyance = amount(salaryDetails.conveyance);
                const hra = amount(salaryDetails.hra);
                const coreGross = Number((basic + da + conveyance + hra).toFixed(2));
                if (coreGross <= 0 && amount(salaryDetails.monthlyCtc) > 0) {
                    throw Object.assign(new Error('Configured Basic, DA, Conveyance and HRA must define the salary structure.'), { statusCode: 400, code: 'INCOMPLETE_SALARY_STRUCTURE' });
                }
                const pct = (value) => Number((value * 100 / coreGross).toFixed(6));
                const basicPct = pct(basic), daPct = pct(da), conveyancePct = pct(conveyance);
                const hraPct = Number((100 - basicPct - daPct - conveyancePct).toFixed(6));
                await client.query(`UPDATE public.salary_structures SET effective_to=$2::date-1,updated_at=NOW()
            WHERE employee_id=$1 AND effective_from<$2 AND (effective_to IS NULL OR effective_to>=$2)`, [oldEmployee.id, salaryEffectiveFrom]);
                const next = await client.query(`SELECT min(effective_from) next_date FROM public.salary_structures WHERE employee_id=$1 AND effective_from>$2`, [oldEmployee.id, salaryEffectiveFrom]);
                const existingRevision = await client.query(`SELECT id FROM public.salary_structures
            WHERE employee_id=$1 AND effective_from=$2 AND is_active=TRUE FOR UPDATE`, [oldEmployee.id, salaryEffectiveFrom]);
                const salaryArgs = [oldEmployee.id, companyId, coreGross, basicPct, daPct, conveyancePct, hraPct,
                    salaryEffectiveFrom, next.rows[0]?.next_date || null,
                    JSON.stringify({ ...components, monthlyCtc: amount(salaryDetails.monthlyCtc) }),
                    salaryDetails.salaryScheme || null, Boolean(salaryDetails.withPf ?? input.withPf),
                    options.revisionReason || 'Employee profile revision', performer];
                const saved = existingRevision.rows[0]
                    ? await client.query(`UPDATE public.salary_structures SET company_id=$2,monthly_salary=$3,basic_percentage=$4,
                 da_percentage=$5,conveyance_percentage=$6,hra_percentage=$7,
                 effective_to=CASE WHEN $9::date IS NULL THEN NULL ELSE $9::date-1 END,
                 component_values=$10::jsonb,salary_scheme=$11,with_pf=$12,revision_reason=$13,
                 created_by=$14,updated_at=NOW() WHERE id=$1 RETURNING id`, [existingRevision.rows[0].id, ...salaryArgs.slice(1)])
                    : await client.query(`INSERT INTO public.salary_structures(employee_id,company_id,monthly_salary,basic_percentage,da_percentage,
                 conveyance_percentage,hra_percentage,effective_from,effective_to,is_active,component_values,salary_scheme,with_pf,revision_reason,created_by)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9::date IS NULL THEN NULL ELSE $9::date-1 END,TRUE,$10::jsonb,$11,$12,$13,$14)
               RETURNING id`, salaryArgs);
                draftPayrollRecalculated = await recalculateDraftPayroll(client, oldEmployee, saved.rows[0].id, salaryEffectiveFrom, {
                    monthlySalary: coreGross, basicPercentage: basicPct, daPercentage: daPct,
                    conveyancePercentage: conveyancePct, hraPercentage: hraPct,
                    withPf: Boolean(salaryDetails.withPf ?? input.withPf),
                });
            }
            if (Array.isArray(input.documents)) {
                for (const document of input.documents) {
                    if (!document?.name || !document?.url)
                        continue;
                    await client.query(`INSERT INTO public.employee_documents(employee_id,name,type,url,upload_date)
             SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(
               SELECT 1 FROM public.employee_documents WHERE employee_id=$1 AND name=$2 AND url=$4
             )`, [oldEmployee.id, document.name, document.type || null, document.url, document.uploadDate || today]);
                }
            }
            await client.query(`INSERT INTO public.employee_profile_audit_logs(company_id,employee_id,performed_by,changed_fields,old_values,new_values,effective_dates)
         VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`, [companyId, oldEmployee.id, performer, changedFields, JSON.stringify(withoutSecrets(oldEmployee.profile_data || {})),
                JSON.stringify(withoutSecrets(input)), JSON.stringify({ shiftEffectiveFrom, salaryEffectiveFrom, weeklyOffEffectiveFrom })]);
            return {
                employee: { ...profileData, ...updatedEmployee, id: updatedEmployee.id, employeeId: updatedEmployee.employee_id,
                    firstName: updatedEmployee.first_name, lastName: updatedEmployee.last_name, rowVersion: Number(updatedEmployee.row_version),
                    workShift: input.workShift || updatedEmployee.work_shift, department: input.department || oldEmployee.department_name },
                dependencies: { shiftChanged, weeklyOffChanged, salaryChanged, draftPayrollRecalculated },
            };
        });
    }
}
export const employeeProfileSyncService = new EmployeeProfileSyncService();
//# sourceMappingURL=employeeProfileSyncService.js.map