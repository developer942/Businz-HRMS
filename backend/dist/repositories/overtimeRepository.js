import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { isCeoOrOwnerEmployee } from '../services/calculationEngine.js';
export class OvertimeRepository {
    async getAllOvertime() {
        if (!isRealSupabaseConfigured()) {
            return [];
        }
        try {
            const supabase = getSupabaseAdmin();
            const { data } = await supabase
                .from('company_settings')
                .select('setting_val')
                .eq('setting_key', 'overtime_records_data')
                .maybeSingle();
            if (data?.setting_val && Array.isArray(data.setting_val)) {
                return data.setting_val;
            }
        }
        catch (err) {
            console.warn('Database error in getAllOvertime:', err);
        }
        return [];
    }
    async getApprovedOvertimeForMonth(employeeId, month, year) {
        if (isCeoOrOwnerEmployee({ employeeId })) {
            return [];
        }
        const all = await this.getAllOvertime();
        const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
        return all.filter(ot => !isCeoOrOwnerEmployee({ employeeId: ot.employeeId }) &&
            ot.status === 'APPROVED' &&
            ot.employeeId?.toLowerCase().trim() === employeeId.toLowerCase().trim() &&
            ot.date.startsWith(monthPrefix));
    }
    async createOvertime(record) {
        if (isCeoOrOwnerEmployee({ employeeId: record.employeeId })) {
            throw new Error('CEO is the company owner and is exempt from overtime calculation and records.');
        }
        const amount = Number((record.hours * record.hourlyRate).toFixed(2));
        const newRecord = {
            id: `ot-${Date.now()}`,
            ...record,
            amount,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
        };
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const current = await this.getAllOvertime();
                const updated = [newRecord, ...current];
                const { data: existing } = await supabase
                    .from('company_settings')
                    .select('id')
                    .eq('setting_key', 'overtime_records_data')
                    .maybeSingle();
                if (existing?.id) {
                    await supabase
                        .from('company_settings')
                        .update({ setting_val: updated, updated_at: new Date().toISOString() })
                        .eq('id', existing.id);
                }
                else {
                    await supabase
                        .from('company_settings')
                        .insert({ setting_key: 'overtime_records_data', setting_val: updated });
                }
            }
            catch (err) {
                console.warn('Could not insert overtime record to Supabase:', err);
            }
        }
        return newRecord;
    }
    async approveOvertime(id, approverName) {
        const now = new Date().toISOString();
        const all = await this.getAllOvertime();
        const target = all.find(r => r.id === id);
        if (!target)
            return null;
        target.status = 'APPROVED';
        target.approvedBy = approverName;
        target.approvedAt = now;
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data: existing } = await supabase
                    .from('company_settings')
                    .select('id')
                    .eq('setting_key', 'overtime_records_data')
                    .maybeSingle();
                if (existing?.id) {
                    await supabase
                        .from('company_settings')
                        .update({ setting_val: all, updated_at: new Date().toISOString() })
                        .eq('id', existing.id);
                }
            }
            catch (err) {
                console.warn('Could not approve overtime in Supabase:', err);
            }
        }
        return target;
    }
}
export const overtimeRepository = new OvertimeRepository();
//# sourceMappingURL=overtimeRepository.js.map