import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { employeeRepository } from './employeeRepository.js';
const toDatabaseLeaveType = (leaveType) => {
    const rawType = (leaveType || '').toLowerCase();
    if (rawType.includes('sick'))
        return 'Sick Leave';
    if (rawType.includes('emergency'))
        return 'Emergency Leave';
    if (rawType.includes('unpaid') || rawType.includes('loss') || rawType.includes('lop'))
        return 'Unpaid Leave';
    if (rawType.includes('wfh') || rawType.includes('home'))
        return 'Work From Home';
    if (rawType.includes('paid') || rawType.includes('earn') || rawType.includes('annual'))
        return 'Paid Leave';
    return 'Casual Leave';
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
                const cleanEmpId = filters.employeeId.toLowerCase().trim();
                leaves = leaves.filter((r) => r.employeeId?.toLowerCase().trim() === cleanEmpId);
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
            reason: data.reason || 'Personal Leave',
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
        const allLeaves = await this.getLeaves({ employeeId, status: 'Approved' });
        const usedCasual = allLeaves.filter((l) => l.leaveType === 'Casual').reduce((s, l) => s + l.daysCount, 0);
        const usedSick = allLeaves.filter((l) => l.leaveType === 'Sick').reduce((s, l) => s + l.daysCount, 0);
        const usedEarned = allLeaves.filter((l) => l.leaveType === 'Earned').reduce((s, l) => s + l.daysCount, 0);
        return {
            employeeId,
            casual: { total: 12, used: usedCasual, remaining: Math.max(0, 12 - usedCasual) },
            sick: { total: 10, used: usedSick, remaining: Math.max(0, 10 - usedSick) },
            earned: { total: 15, used: usedEarned, remaining: Math.max(0, 15 - usedEarned) },
        };
    }
}
export const leaveRepository = new LeaveRepository();
//# sourceMappingURL=leaveRepository.js.map