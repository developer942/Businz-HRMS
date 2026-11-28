import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { query } from '../config/database.js';
import { employeeRepository } from './employeeRepository.js';
import { getTodayKolkata, REQUEST_REASON_ERROR_MESSAGE, validateRequestReason } from '../utils/requestValidation.js';
const toDatabaseLeaveType = (leaveType) => {
    const rawType = (leaveType || '').toLowerCase();
    if (rawType.includes('sick'))
        return 'Sick Leave';
    if (rawType.includes('emergency'))
        return 'Emergency Leave';
    if (rawType.includes('unpaid') || rawType.includes('loss') || rawType.includes('lop') || rawType.includes('lwp'))
        return 'Unpaid Leave';
    if (rawType.includes('wfh') || rawType.includes('home'))
        return 'Work From Home';
    if (rawType.includes('paid') || rawType.includes('earn') || rawType.includes('annual'))
        return 'Paid Leave';
    return 'Casual Leave';
};
const isWfhLeaveType = (leaveType) => {
    const lt = String(leaveType || '').toLowerCase().trim();
    return (lt.includes('work from home') ||
        lt === 'wfh' ||
        lt.includes('wfh') ||
        lt.includes('wfo') ||
        lt.includes('field visit') ||
        lt.includes('on duty'));
};
const isExplicitUnpaidType = (leaveType) => {
    const lt = String(leaveType || '').toLowerCase().trim();
    return lt.includes('unpaid') || lt.includes('lwp') || lt.includes('loss of pay') || lt.includes('without pay') || lt === 'lop';
};
const isMatchingPolicyLeaveType = (reqType, policyType) => {
    if (!reqType || !policyType)
        return false;
    const r = reqType.toLowerCase().trim();
    const p = policyType.toLowerCase().trim();
    if (r === p)
        return true;
    if (isWfhLeaveType(r) || isWfhLeaveType(p))
        return isWfhLeaveType(r) && isWfhLeaveType(p);
    if (isExplicitUnpaidType(r) || isExplicitUnpaidType(p))
        return isExplicitUnpaidType(r) && isExplicitUnpaidType(p);
    const rClean = r.replace(/[^a-z0-9]/g, '');
    const pClean = p.replace(/[^a-z0-9]/g, '');
    if (rClean === pClean)
        return true;
    const groups = [
        ['sick', 'sl', 'medical'],
        ['earned', 'el', 'annual', 'privilege', 'pl', 'paid leave', 'paid'],
        ['casual', 'cl'],
        ['maternity'],
        ['paternity'],
    ];
    return groups.some((tokens) => tokens.some((t) => r === t || r.includes(t)) && tokens.some((t) => p === t || p.includes(t)));
};
const normalizeDateStr = (val) => {
    if (!val)
        return '';
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s))
        return s.slice(0, 10);
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m)
        return `${m[3]}-${m[2]}-${m[1]}`;
    return '';
};
const isPolicyApplicableToEmp = (policy, emp, employeeId) => {
    if (!policy || String(policy.status || '').toLowerCase() !== 'active')
        return false;
    const normId = String(emp?.employeeId || employeeId || '').trim().toLowerCase();
    const empDept = String(emp?.department || '').trim().toLowerCase();
    const empDesig = String(emp?.designation || '').trim().toLowerCase();
    const empType = String(emp?.employmentType || emp?.employment_type || '').trim().toLowerCase();
    const empGender = String(emp?.gender || '').trim().toLowerCase();
    if (policy.applicableEmployees && policy.applicableEmployees !== 'ALL' && Array.isArray(policy.applicableEmployees) && policy.applicableEmployees.length > 0) {
        if (!policy.applicableEmployees.some((id) => String(id).trim().toLowerCase() === normId))
            return false;
    }
    if (policy.applicableDepartments && policy.applicableDepartments !== 'ALL' && Array.isArray(policy.applicableDepartments) && policy.applicableDepartments.length > 0 && empDept) {
        if (!policy.applicableDepartments.some((d) => String(d).trim().toLowerCase() === empDept))
            return false;
    }
    if (policy.applicableDesignations && policy.applicableDesignations !== 'ALL' && Array.isArray(policy.applicableDesignations) && policy.applicableDesignations.length > 0 && empDesig) {
        if (!policy.applicableDesignations.some((d) => String(d).trim().toLowerCase() === empDesig))
            return false;
    }
    if (policy.applicableEmploymentType && policy.applicableEmploymentType !== 'ALL') {
        const target = String(policy.applicableEmploymentType).trim().toLowerCase();
        const isProv = empType.includes('provisional') || empType.includes('probation');
        if (target === 'provisional' || target === 'probation') {
            if (!isProv)
                return false;
        }
        else if (target === 'confirmed' || target === 'permanent') {
            if (isProv)
                return false;
        }
        else if (empType) {
            const cleanTarget = target.replace(/[^a-z0-9]/g, '');
            const cleanEmp = empType.replace(/[^a-z0-9]/g, '');
            if (!(empType === target || cleanEmp === cleanTarget || empType.includes(target) || target.includes(empType)))
                return false;
        }
    }
    if (policy.applicableGender && policy.applicableGender !== 'ALL' && empGender) {
        if (empGender !== String(policy.applicableGender).trim().toLowerCase())
            return false;
    }
    return true;
};
export class LeaveRepository {
    async getLeaves(filters) {
        if (!isRealSupabaseConfigured()) {
            return [];
        }
        try {
            const supabase = getSupabaseAdmin();
            // 1. Try company_settings leave_requests_data
            const { data: csData } = await supabase
                .from('company_settings')
                .select('setting_val')
                .eq('setting_key', 'leave_requests_data')
                .maybeSingle();
            let leaves = [];
            if (csData?.setting_val && Array.isArray(csData.setting_val)) {
                leaves = csData.setting_val.map((d) => ({
                    id: d.id,
                    employeeId: d.employeeId || d.employee_id,
                    employeeName: d.employeeName || d.employee_name || 'Staff',
                    department: d.department || 'General',
                    leaveType: d.leaveType || d.leave_type || 'Casual',
                    startDate: d.startDate || d.start_date,
                    endDate: d.endDate || d.end_date,
                    daysCount: Number(d.daysCount || d.days_count) || 1,
                    reason: d.reason || '',
                    status: d.status || 'Pending',
                    appliedDate: d.appliedDate || d.applied_date || new Date().toISOString().split('T')[0],
                    approvedBy: d.approvedBy || d.approved_by,
                    approvedAt: d.approvedAt || d.approved_at,
                    comment: d.comment,
                    paidDaysCount: d.paidDaysCount,
                    unpaidDaysCount: d.unpaidDaysCount,
                    sandwichDays: d.sandwichDays,
                    isSandwichApplied: d.isSandwichApplied,
                    hrOverride: d.hrOverride,
                }));
            }
            else {
                // 2. Query leave_requests table
                let query = supabase.from('leave_requests').select('*').order('created_at', { ascending: false });
                if (filters?.employeeId)
                    query = query.eq('employee_id', filters.employeeId);
                if (filters?.status)
                    query = query.eq('status', filters.status);
                const { data, error } = await query;
                if (data && !error && data.length > 0) {
                    leaves = data.map((d) => ({
                        id: d.id,
                        employeeId: d.employee_id,
                        leaveType: d.leave_type || 'Casual',
                        startDate: d.start_date,
                        endDate: d.end_date,
                        daysCount: Number(d.days_count) || 1,
                        reason: d.reason || '',
                        status: d.status || 'Pending',
                        appliedDate: d.applied_date || d.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
                        approvedBy: d.approved_by,
                        approvedAt: d.approved_at,
                        comment: d.comment,
                    }));
                }
            }
            if (filters?.employeeId) {
                const emp = await employeeRepository.getEmployeeById(filters.employeeId).catch(() => null);
                const targetIds = new Set([
                    filters.employeeId,
                    emp?.employeeId,
                    emp?.id,
                ]
                    .filter(Boolean)
                    .map((v) => String(v).toLowerCase().trim()));
                const targetName = emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim().toLowerCase() : '';
                leaves = leaves.filter((r) => {
                    const rEmp = String(r.employeeId || '').toLowerCase().trim();
                    const rName = String(r.employeeName || '').toLowerCase().trim();
                    return targetIds.has(rEmp) || (targetName && rName === targetName);
                });
            }
            if (filters?.status) {
                leaves = leaves.filter((r) => r.status?.toLowerCase() === filters.status?.toLowerCase());
            }
            return leaves;
        }
        catch (err) {
            console.warn('Database error in getLeaves:', err);
            return [];
        }
    }
    async createLeave(data) {
        if (!data.employeeId) {
            throw new Error('employeeId is required to apply for leave');
        }
        const reasonValidation = validateRequestReason(data.reason);
        if (!reasonValidation.valid) {
            throw new Error(reasonValidation.error || REQUEST_REASON_ERROR_MESSAGE);
        }
        const emp = await employeeRepository.getEmployeeById(data.employeeId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : data.employeeId;
        const s = new Date(data.startDate || new Date().toISOString().split('T')[0]);
        const e = new Date(data.endDate || data.startDate || new Date().toISOString().split('T')[0]);
        const diffTime = Math.abs(e.getTime() - s.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        const newRecord = {
            id: `LV-${Date.now()}`,
            employeeId: data.employeeId,
            employeeName: empName,
            department: emp?.department || 'General',
            leaveType: data.leaveType || 'Casual',
            startDate: data.startDate || new Date().toISOString().split('T')[0],
            endDate: data.endDate || new Date().toISOString().split('T')[0],
            daysCount: data.daysCount || days || 1,
            reason: reasonValidation.value,
            status: 'Pending',
            appliedDate: new Date().toISOString().split('T')[0],
        };
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                // 1. Sync to company_settings leave_requests_data
                const { data: csData } = await supabase
                    .from('company_settings')
                    .select('id, setting_val')
                    .eq('setting_key', 'leave_requests_data')
                    .maybeSingle();
                const currentList = Array.isArray(csData?.setting_val) ? csData.setting_val : [];
                currentList.unshift(newRecord);
                if (csData?.id) {
                    await supabase
                        .from('company_settings')
                        .update({ setting_val: currentList, updated_at: new Date().toISOString() })
                        .eq('id', csData.id);
                }
                else {
                    await supabase
                        .from('company_settings')
                        .insert({ setting_key: 'leave_requests_data', setting_val: currentList });
                }
                // 2. Insert to leave_requests table if employee DB id exists
                if (emp?.id) {
                    await supabase.from('leave_requests').insert({
                        employee_id: emp.id,
                        leave_type: toDatabaseLeaveType(newRecord.leaveType),
                        start_date: newRecord.startDate,
                        end_date: newRecord.endDate,
                        days_count: newRecord.daysCount,
                        reason: newRecord.reason,
                        status: newRecord.status,
                    });
                }
            }
            catch (err) {
                console.warn('Could not persist leave to Supabase:', err);
            }
        }
        return newRecord;
    }
    async updateLeaveStatus(id, status, approverName, comment) {
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                // 1. Update in company_settings leave_requests_data
                const { data: csData } = await supabase
                    .from('company_settings')
                    .select('id, setting_val')
                    .eq('setting_key', 'leave_requests_data')
                    .maybeSingle();
                if (csData?.setting_val && Array.isArray(csData.setting_val)) {
                    const leaves = csData.setting_val;
                    const target = leaves.find((l) => l.id === id);
                    if (target) {
                        target.status = status;
                        target.approvedBy = approverName;
                        target.approvedAt = new Date().toISOString();
                        if (comment)
                            target.comment = comment;
                        await supabase
                            .from('company_settings')
                            .update({ setting_val: leaves, updated_at: new Date().toISOString() })
                            .eq('id', csData.id);
                        return target;
                    }
                }
                // 2. Update in leave_requests table
                await supabase
                    .from('leave_requests')
                    .update({
                    status,
                    approved_by: approverName,
                    approved_at: new Date().toISOString(),
                    comment,
                })
                    .eq('id', id);
            }
            catch (err) {
                console.warn('Could not update leave in Supabase:', err);
            }
        }
        return null;
    }
    async getLeaveBalances(employeeId) {
        const emp = await employeeRepository.getEmployeeById(employeeId).catch(() => null);
        const canonicalEmpCode = emp?.employeeId || employeeId;
        const empLeavesAll = await this.getLeaves({ employeeId: canonicalEmpCode });
        let masterPolicies = [];
        let legacyPolicies = [];
        let holidays = [];
        let attendanceRows = [];
        if (isRealSupabaseConfigured()) {
            try {
                const settingsRes = await query(`SELECT setting_key, setting_val
             FROM public.company_settings
            WHERE setting_key IN ('master_leave_policies_data', 'leave_policies_data', 'holiday_policies_data', 'holidays_data', 'holidays')`);
                for (const row of settingsRes.rows || []) {
                    if (row.setting_key === 'master_leave_policies_data' && Array.isArray(row.setting_val)) {
                        masterPolicies = row.setting_val;
                    }
                    else if (row.setting_key === 'leave_policies_data' && Array.isArray(row.setting_val)) {
                        legacyPolicies = row.setting_val;
                    }
                    else if ((row.setting_key === 'holiday_policies_data' || row.setting_key === 'holidays_data' || row.setting_key === 'holidays') &&
                        Array.isArray(row.setting_val) &&
                        holidays.length === 0) {
                        holidays = row.setting_val;
                    }
                }
            }
            catch (err) {
                console.warn('[LeaveRepository] Could not load leave policies from company_settings:', err);
            }
            try {
                if (emp?.id) {
                    const attRes = await query(`SELECT date, shift_date, status, check_in, check_out
               FROM public.attendance_records
              WHERE employee_id = $1::uuid
              ORDER BY date DESC
              LIMIT 400`, [emp.id]);
                    attendanceRows = attRes.rows || [];
                }
            }
            catch (err) {
                console.warn('[LeaveRepository] Could not load employee attendance for LOP computation:', err);
            }
        }
        // Build category quota map identically to Web HRMS `leaveQuotaService.ts`
        const balanceMap = new Map();
        const activeMaster = masterPolicies.filter((p) => isPolicyApplicableToEmp(p, emp, canonicalEmpCode));
        if (activeMaster.length > 0) {
            for (const p of activeMaster) {
                for (const t of Array.isArray(p.leaveTypes) ? p.leaveTypes : []) {
                    const key = String(t.name || '').toLowerCase().trim();
                    if (!key || balanceMap.has(key))
                        continue;
                    const isPaid = t.isPaid !== false;
                    const baseQuota = Number(t.quotaPerYear) || (isPaid ? 1 : 0);
                    const carry = p.allowCarryForward ? Math.min(Number(p.maxCarryForwardDays) || 5, 5) : 0;
                    const annualQuota = isPaid ? baseQuota + carry : Number(t.quotaPerYear) || 12;
                    const code = t.name.includes('(')
                        ? (t.name.split('(')[1]?.replace(')', '').trim() || 'LV')
                        : String(t.name).slice(0, 3).toUpperCase();
                    balanceMap.set(key, {
                        id: `${p.id}-${t.id || key}`,
                        name: t.name,
                        code,
                        isPaid,
                        annualQuota,
                        usedDays: 0,
                        pendingDays: 0,
                        remainingDays: isPaid ? annualQuota : 999,
                        policyName: p.policyName || t.name,
                    });
                }
            }
        }
        else if (legacyPolicies.length > 0) {
            for (const p of legacyPolicies.filter((item) => String(item?.status || 'Active').toLowerCase() === 'active')) {
                const key = String(p.name || '').toLowerCase().trim();
                if (!key || balanceMap.has(key))
                    continue;
                const quota = Number(p.quotaDays) || 7;
                balanceMap.set(key, {
                    id: String(p.id || key),
                    name: p.name,
                    code: p.name.includes('(') ? (p.name.split('(')[1]?.replace(')', '').trim() || 'LV') : 'LV',
                    isPaid: true,
                    annualQuota: quota,
                    usedDays: 0,
                    pendingDays: 0,
                    remainingDays: quota,
                    policyName: p.name,
                });
            }
        }
        if (balanceMap.size === 0) {
            for (const dt of [
                { name: 'Earned Leave (EL)', code: 'EL', quota: 1, isPaid: true },
                { name: 'Sick Leave (SL)', code: 'SL', quota: 1, isPaid: true },
                { name: 'Unpaid Leave (LWP)', code: 'LWP', quota: 12, isPaid: false },
            ]) {
                balanceMap.set(dt.name.toLowerCase(), {
                    id: `default-${dt.code.toLowerCase()}`,
                    name: dt.name,
                    code: dt.code,
                    isPaid: dt.isPaid,
                    annualQuota: dt.quota,
                    usedDays: 0,
                    pendingDays: 0,
                    remainingDays: dt.isPaid ? dt.quota : 999,
                    policyName: 'Company Leave Policy',
                });
            }
        }
        if (!Array.from(balanceMap.values()).some((b) => !b.isPaid)) {
            balanceMap.set('unpaid leave (lwp)', {
                id: 'default-lwp',
                name: 'Unpaid Leave (LWP)',
                code: 'LWP',
                isPaid: false,
                annualQuota: 12,
                usedDays: 0,
                pendingDays: 0,
                remainingDays: 999,
                policyName: 'Unpaid Leave Policy',
            });
        }
        const categories = Array.from(balanceMap.values());
        const paidCategories = categories.filter((c) => c.isPaid);
        const unpaidCategory = categories.find((c) => !c.isPaid);
        const primaryPaidFallback = paidCategories.find((c) => !c.name.toLowerCase().includes('sick')) || paidCategories[0];
        // Allocate Approved & Pending non-WFH leaves chronologically
        const nonWfhLeaves = empLeavesAll.filter((l) => !isWfhLeaveType(l.leaveType));
        const approvedLeaves = nonWfhLeaves
            .filter((l) => String(l.status || '').toLowerCase() === 'approved')
            .sort((a, b) => normalizeDateStr(a.startDate).localeCompare(normalizeDateStr(b.startDate)));
        const pendingLeaves = nonWfhLeaves.filter((l) => String(l.status || '').toLowerCase() === 'pending');
        for (const l of approvedLeaves) {
            const totalDays = Math.max(0.5, Number(l.daysCount) || 1);
            const isOverriddenUnpaid = l.hrOverride?.isOverridden && l.hrOverride?.adjustedPayType === 'UNPAID_LEAVE';
            if (isExplicitUnpaidType(l.leaveType) || isOverriddenUnpaid) {
                unpaidCategory.usedDays += totalDays;
                continue;
            }
            const matchedPaid = paidCategories.find((c) => isMatchingPolicyLeaveType(l.leaveType, c.name)) || primaryPaidFallback;
            if (!matchedPaid) {
                unpaidCategory.usedDays += totalDays;
                continue;
            }
            const explicitUnpaid = Math.max(0, Number(l.unpaidDaysCount) || 0);
            const requestedPaid = l.paidDaysCount !== undefined ? Math.max(0, Number(l.paidDaysCount)) : Math.max(0, totalDays - explicitUnpaid);
            const availableQuota = Math.max(0, matchedPaid.annualQuota - matchedPaid.usedDays);
            const actualPaid = Math.min(requestedPaid, availableQuota);
            const overflowUnpaid = Math.max(0, totalDays - actualPaid);
            matchedPaid.usedDays += actualPaid;
            matchedPaid.remainingDays = Math.max(0, matchedPaid.annualQuota - matchedPaid.usedDays);
            if (overflowUnpaid > 0) {
                unpaidCategory.usedDays += overflowUnpaid;
            }
        }
        for (const l of pendingLeaves) {
            const totalDays = Math.max(0.5, Number(l.daysCount) || 1);
            if (isExplicitUnpaidType(l.leaveType)) {
                unpaidCategory.pendingDays += totalDays;
                continue;
            }
            const matchedPaid = paidCategories.find((c) => isMatchingPolicyLeaveType(l.leaveType, c.name)) || primaryPaidFallback;
            if (matchedPaid) {
                matchedPaid.pendingDays += totalDays;
            }
        }
        for (const c of paidCategories) {
            c.remainingDays = Math.max(0, c.annualQuota - c.usedDays);
        }
        const totalAnnualQuota = paidCategories.reduce((s, c) => s + c.annualQuota, 0);
        const totalPaidUsed = paidCategories.reduce((s, c) => s + c.usedDays, 0);
        const totalPaidPending = paidCategories.reduce((s, c) => s + c.pendingDays, 0);
        const totalPaidRemaining = Math.max(0, totalAnnualQuota - totalPaidUsed);
        const approvedUnpaidDays = unpaidCategory.usedDays;
        // Compute Absent / Rejected Leave LOP for current month (matching Web leaveQuotaService.ts)
        let rejectedLeaveAbsentDays = 0;
        let uninformedAbsentDays = 0;
        const todayStr = getTodayKolkata();
        const currentYear = Number(todayStr.slice(0, 4)) || new Date().getFullYear();
        if (attendanceRows.length > 0) {
            const currentYM = todayStr.slice(0, 7);
            const monthStart = `${currentYM}-01`;
            let earliestAtt = '2099-12-31';
            const attByDate = new Map();
            for (const r of attendanceRows) {
                const d = normalizeDateStr(r.date || r.shift_date);
                if (d) {
                    if (d < earliestAtt)
                        earliestAtt = d;
                    if (!attByDate.has(d))
                        attByDate.set(d, r);
                }
            }
            const empJoin = normalizeDateStr(emp?.joiningDate || emp?.joining_date) || '1970-01-01';
            const holidaySet = new Set();
            for (const h of holidays) {
                if (Array.isArray(h?.holidays)) {
                    for (const sub of h.holidays) {
                        const hd = normalizeDateStr(sub?.date);
                        if (hd)
                            holidaySet.add(hd);
                    }
                }
                else {
                    const hd = normalizeDateStr(h?.date);
                    if (hd)
                        holidaySet.add(hd);
                }
            }
            const isPresent = (dStr) => {
                const rec = attByDate.get(dStr);
                if (!rec)
                    return false;
                const st = String(rec.status || '').toLowerCase();
                if (st === 'absent')
                    return false;
                return Boolean(st === 'present' ||
                    st === 'late' ||
                    st === 'half day' ||
                    st.includes('home') ||
                    st.includes('wfh') ||
                    rec.check_in);
            };
            const hasApproved = (dStr) => empLeavesAll.some((l) => {
                if (String(l.status || '').toLowerCase() !== 'approved')
                    return false;
                const s = normalizeDateStr(l.startDate);
                const e = normalizeDateStr(l.endDate) || s;
                return Boolean(s && dStr >= s && dStr <= e);
            });
            const hasRejected = (dStr) => empLeavesAll.some((l) => {
                if (String(l.status || '').toLowerCase() !== 'rejected')
                    return false;
                const s = normalizeDateStr(l.startDate);
                const e = normalizeDateStr(l.endDate) || s;
                return Boolean(s && dStr >= s && dStr <= e);
            });
            const candidateDates = new Set();
            const [yNum, mNum] = currentYM.split('-').map(Number);
            const todayDay = Number(todayStr.slice(8, 10));
            for (let day = 1; day < todayDay; day++) {
                const dStr = `${yNum}-${String(mNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                if (dStr >= earliestAtt && dStr >= empJoin && dStr >= monthStart)
                    candidateDates.add(dStr);
            }
            for (const l of empLeavesAll.filter((x) => String(x.status || '').toLowerCase() === 'rejected')) {
                const s = normalizeDateStr(l.startDate);
                const e = normalizeDateStr(l.endDate) || s;
                if (!s)
                    continue;
                const cur = new Date(`${s}T12:00:00`);
                const endObj = new Date(`${e}T12:00:00`);
                let guard = 0;
                while (cur <= endObj && guard < 60) {
                    const dStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
                    if (dStr < todayStr && dStr >= earliestAtt && dStr >= empJoin)
                        candidateDates.add(dStr);
                    cur.setDate(cur.getDate() + 1);
                    guard++;
                }
            }
            for (const dStr of candidateDates) {
                const dObj = new Date(`${dStr}T12:00:00`);
                if (dObj.getDay() === 0)
                    continue; // Sunday Weekly Off
                if (holidaySet.has(dStr))
                    continue;
                if (isPresent(dStr) || hasApproved(dStr))
                    continue;
                if (hasRejected(dStr))
                    rejectedLeaveAbsentDays += 1;
                else
                    uninformedAbsentDays += 1;
            }
        }
        const totalUnpaidUsed = approvedUnpaidDays + rejectedLeaveAbsentDays + uninformedAbsentDays;
        unpaidCategory.usedDays = totalUnpaidUsed;
        const findBucket = (tokens) => {
            const cat = paidCategories.find((c) => tokens.some((t) => c.name.toLowerCase().includes(t)));
            return cat
                ? { total: cat.annualQuota, used: cat.usedDays, remaining: cat.remainingDays }
                : { total: 0, used: 0, remaining: 0 };
        };
        return {
            employeeId: canonicalEmpCode,
            year: currentYear,
            totalAnnualQuota,
            totalPaidUsed,
            totalPaidPending,
            totalPaidRemaining,
            totalUnpaidUsed,
            approvedUnpaidDays,
            rejectedLeaveAbsentDays,
            uninformedAbsentDays,
            categories,
            // Backward-compatible keys reflecting real policy buckets (never hardcoded 12/10/15)
            casual: findBucket(['casual', '(cl)']),
            sick: findBucket(['sick', '(sl)']),
            earned: findBucket(['earned', '(el)', 'paid']),
        };
    }
}
export const leaveRepository = new LeaveRepository();
//# sourceMappingURL=leaveRepository.js.map