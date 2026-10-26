import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { query } from '../config/database.js';
import { memoryCache } from '../services/cacheService.js';
import { encryptCredential } from '../utils/crypto.js';
const inMemorySmtpConfigs = {};
const SETTINGS_CACHE_KEY = 'payroll_settings_global';
const SETTINGS_TTL_MS = 60000; // 60 seconds
export class SettingsRepository {
    async getSettings() {
        const cached = memoryCache.get(SETTINGS_CACHE_KEY);
        if (cached) {
            return cached;
        }
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data, error } = await supabase
                    .from('payroll_settings')
                    .select('*')
                    .eq('org_key', 'global')
                    .maybeSingle();
                if (data && !error) {
                    const parsed = {
                        id: data.id,
                        orgKey: data.org_key,
                        pfEnabled: data.pf_enabled ?? false,
                        pfRate: Number(data.pf_rate) || 12.0,
                        pfWageCeiling: Number(data.pf_wage_ceiling) || 15000.0,
                        pfWageComponents: data.pf_wage_components || {
                            basic: true,
                            da: true,
                            conveyance: true,
                            hra: false,
                            attendance_bonus: false,
                            overtime: false,
                            other_earnings: false,
                        },
                        esicEnabled: data.esic_enabled ?? false,
                        esicRate: Number(data.esic_rate) || 0.75,
                        esicSalaryThreshold: Number(data.esic_salary_threshold) || 21000.0,
                        esicWageComponents: data.esic_wage_components || {
                            basic: true,
                            da: true,
                            conveyance: true,
                            hra: true,
                            attendance_bonus: true,
                            overtime: true,
                            other_earnings: true,
                        },
                        professionalTaxEnabled: data.professional_tax_enabled ?? false,
                        professionalTaxAmount: Number(data.professional_tax_amount) || 0,
                        lopEnabled: data.lop_enabled ?? true,
                        attendanceBonusEnabled: data.attendance_bonus_enabled ?? false,
                        overtimeEnabled: data.overtime_enabled ?? false,
                        standardWorkingDays: Number(data.standard_working_days) || 26,
                        payrollCycleDay: Number(data.payroll_cycle_day) || 1,
                    };
                    memoryCache.set(SETTINGS_CACHE_KEY, parsed, SETTINGS_TTL_MS);
                    return parsed;
                }
            }
            catch (err) {
                console.warn('Database error in getSettings:', err);
            }
        }
        const emptyDefault = {
            id: 'global',
            orgKey: 'global',
            pfEnabled: false,
            pfRate: 12.0,
            pfWageCeiling: 15000.0,
            pfWageComponents: {
                basic: true,
                da: true,
                conveyance: true,
                hra: false,
                attendance_bonus: false,
                overtime: false,
                other_earnings: false,
            },
            esicEnabled: false,
            esicRate: 0.75,
            esicSalaryThreshold: 21000.0,
            esicWageComponents: {
                basic: true,
                da: true,
                conveyance: true,
                hra: true,
                attendance_bonus: true,
                overtime: true,
                other_earnings: true,
            },
            professionalTaxEnabled: false,
            professionalTaxAmount: 0,
            lopEnabled: true,
            attendanceBonusEnabled: false,
            overtimeEnabled: false,
            standardWorkingDays: 26,
            payrollCycleDay: 1,
        };
        return emptyDefault;
    }
    async updateSettings(updates) {
        memoryCache.invalidate(SETTINGS_CACHE_KEY);
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const payload = {};
                if (updates.pfEnabled !== undefined)
                    payload.pf_enabled = updates.pfEnabled;
                if (updates.pfRate !== undefined)
                    payload.pf_rate = updates.pfRate;
                if (updates.pfWageCeiling !== undefined)
                    payload.pf_wage_ceiling = updates.pfWageCeiling;
                if (updates.pfWageComponents !== undefined)
                    payload.pf_wage_components = updates.pfWageComponents;
                if (updates.esicEnabled !== undefined)
                    payload.esic_enabled = updates.esicEnabled;
                if (updates.esicRate !== undefined)
                    payload.esic_rate = updates.esicRate;
                if (updates.esicSalaryThreshold !== undefined)
                    payload.esic_salary_threshold = updates.esicSalaryThreshold;
                if (updates.esicWageComponents !== undefined)
                    payload.esic_wage_components = updates.esicWageComponents;
                if (updates.professionalTaxEnabled !== undefined)
                    payload.professional_tax_enabled = updates.professionalTaxEnabled;
                if (updates.professionalTaxAmount !== undefined)
                    payload.professional_tax_amount = updates.professionalTaxAmount;
                if (updates.lopEnabled !== undefined)
                    payload.lop_enabled = updates.lopEnabled;
                if (updates.attendanceBonusEnabled !== undefined)
                    payload.attendance_bonus_enabled = updates.attendanceBonusEnabled;
                if (updates.overtimeEnabled !== undefined)
                    payload.overtime_enabled = updates.overtimeEnabled;
                if (updates.standardWorkingDays !== undefined)
                    payload.standard_working_days = updates.standardWorkingDays;
                if (updates.payrollCycleDay !== undefined)
                    payload.payroll_cycle_day = updates.payrollCycleDay;
                await supabase
                    .from('payroll_settings')
                    .update(payload)
                    .eq('org_key', 'global');
            }
            catch (err) {
                console.warn('Could not write settings to Supabase:', err);
            }
        }
        return this.getSettings();
    }
    async getPayrollSettingsConfig() {
        const cacheKey = 'payroll_settings_config_cache';
        const cached = memoryCache.get(cacheKey);
        if (cached)
            return cached;
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data, error } = await supabase
                    .from('company_settings')
                    .select('setting_val')
                    .eq('setting_key', 'payroll_settings_config')
                    .maybeSingle();
                if (data?.setting_val && typeof data.setting_val === 'object') {
                    const config = data.setting_val;
                    memoryCache.set(cacheKey, config, 30000);
                    return config;
                }
            }
            catch (err) {
                console.warn('Database error in getPayrollSettingsConfig:', err);
            }
        }
        try {
            const res = await query(`SELECT setting_val FROM public.company_settings WHERE setting_key = $1 LIMIT 1`, ['payroll_settings_config']);
            if (res.rows && res.rows[0]?.setting_val) {
                const config = res.rows[0].setting_val;
                memoryCache.set(cacheKey, config, 30000);
                return config;
            }
        }
        catch (err) {
            console.warn('PostgreSQL query error in getPayrollSettingsConfig:', err.message);
        }
        // Default fallback
        const fallback = {
            components: [
                { id: 'c-basic', name: 'BASIC SALARY', code: 'BASIC', type: 'EARNING', calculationMethod: 'PERCENTAGE', defaultValue: 40, percentageBase: 'CTC', isStatutory: false, active: true, isConfidential: false, description: 'Basic Salary component', eligibilityType: 'ALL' },
                { id: 'c-hra', name: 'House Rent Allowance', code: 'HRA', type: 'EARNING', calculationMethod: 'PERCENTAGE', defaultValue: 35, percentageBase: 'CTC', isStatutory: false, active: true, isConfidential: false, description: 'HRA allowance', eligibilityType: 'ALL' },
                { id: 'c-da', name: 'Dearness Allowance', code: 'DA', type: 'EARNING', calculationMethod: 'PERCENTAGE', defaultValue: 20, percentageBase: 'CTC', isStatutory: false, active: true, isConfidential: false, description: 'DA allowance', eligibilityType: 'ALL' },
                { id: 'c-conv', name: 'Conveyance', code: 'CONV', type: 'EARNING', calculationMethod: 'PERCENTAGE', defaultValue: 5, percentageBase: 'CTC', isStatutory: false, active: true, isConfidential: false, description: 'Conveyance allowance', eligibilityType: 'ALL' },
                { id: 'c-pf', name: 'Employees\' Provident Fund', code: 'ERF', type: 'DEDUCTION', calculationMethod: 'FORMULA', defaultValue: 0, formula: '(BASIC+HRA+CONV)*12/100', percentageBase: 'GROSS', isStatutory: true, active: true, isConfidential: false, description: 'Provident Fund', eligibilityType: 'ALL' },
                { id: 'c-esic', name: 'Employees\' State Insurance Corporation', code: 'ESIC', type: 'DEDUCTION', calculationMethod: 'FORMULA', defaultValue: 0, formula: '(BASIC+HRA+DA+CONV+OT)*0.75/100', percentageBase: 'GROSS', isStatutory: true, active: true, isConfidential: false, description: 'Statutory ESIC', eligibilityType: 'ALL', eligibilityLimit: 21000 },
            ]
        };
        return fallback;
    }
    async updatePayrollSettingsConfig(updates) {
        memoryCache.invalidate('payroll_settings_config_cache');
        const current = await this.getPayrollSettingsConfig();
        const merged = {
            ...current,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data: existing } = await supabase
                    .from('company_settings')
                    .select('id')
                    .eq('setting_key', 'payroll_settings_config')
                    .maybeSingle();
                if (existing?.id) {
                    await supabase
                        .from('company_settings')
                        .update({ setting_val: merged, updated_at: new Date().toISOString() })
                        .eq('id', existing.id);
                }
                else {
                    await supabase
                        .from('company_settings')
                        .insert({ setting_key: 'payroll_settings_config', setting_val: merged });
                }
            }
            catch (err) {
                console.warn('Could not save payroll settings config to Supabase:', err);
            }
        }
        try {
            await query(`INSERT INTO public.company_settings (setting_key, setting_val, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (setting_key) DO UPDATE
         SET setting_val = $2, updated_at = NOW()`, ['payroll_settings_config', JSON.stringify(merged)]);
        }
        catch (err) {
            console.warn('PostgreSQL query error in updatePayrollSettingsConfig:', err.message);
        }
        return merged;
    }
    async getCompanySettings(companyId) {
        const isCompanyB = companyId === 'company-b' || companyId?.toLowerCase()?.includes('nexus');
        const settingKey = isCompanyB ? 'company_info_company-b' : 'company_info';
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data } = await supabase
                    .from('company_settings')
                    .select('setting_val')
                    .eq('setting_key', settingKey)
                    .maybeSingle();
                if (data?.setting_val && typeof data.setting_val === 'object') {
                    return {
                        company_id: isCompanyB ? 'company-b' : 'company-a',
                        ...data.setting_val
                    };
                }
            }
            catch (err) {
                console.warn('Database error in getCompanySettings:', err);
            }
        }
        if (isCompanyB) {
            return {
                company_id: 'company-b',
                companyCode: 'NEXUS',
                companyName: 'Nexus Industrial Solutions Ltd',
                legalCompanyName: 'Nexus Industrial Solutions Limited',
                logoUrl: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?auto=format&fit=crop&w=200&q=80',
                address: 'Nexus Towers, Industrial Area, Sector 62, Noida, Uttar Pradesh — 201309',
                registeredAddress: 'Nexus Towers, Industrial Area, Sector 62, Noida, Uttar Pradesh — 201309',
                branchAddress: 'MIDC Industrial Estate, Andheri East, Mumbai, Maharashtra — 400093',
                contactEmail: 'info@nexus-solutions.com',
                officialEmail: 'info@nexus-solutions.com',
                contactPhone: '9123456789',
                officialPhone: '9123456789',
                website: 'https://nexus-solutions.com',
                taxIdGst: '09AAACN1234F1Z2',
                gstNumber: '09AAACN1234F1Z2',
                cinNumber: 'L74140UP2019PLC112233',
                registrationNumber: 'ROC-KANPUR-112233',
                ownerName: 'Rajeshwar Singhania',
                authorizedSignatoryName: 'Ananya Deshmukh',
                authorizedSignatoryDesignation: 'Vice President — Human Resources',
                signatureImageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
                stampImageUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=200&q=80',
            };
        }
        return {
            company_id: 'company-a',
            companyCode: '',
            companyName: '',
            legalCompanyName: '',
            legalEntity: '',
            logoUrl: '',
            address: '',
            registeredAddress: '',
            branchAddress: '',
            contactEmail: '',
            officialEmail: '',
            contactPhone: '',
            officialPhone: '',
            website: '',
            taxIdGst: '',
            gstNumber: '',
            panNumber: '',
            cinNumber: '',
            registrationNumber: '',
            ownerName: '',
            authorizedSignatoryName: '',
            authorizedSignatoryDesignation: '',
            signatureImageUrl: '',
            stampImageUrl: '',
        };
    }
    async updateCompanySettings(updates, companyId) {
        const isCompanyB = (companyId || updates?.company_id) === 'company-b' || updates?.companyName?.toLowerCase()?.includes('nexus');
        const settingKey = isCompanyB ? 'company_info_company-b' : 'company_info';
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const current = await this.getCompanySettings(isCompanyB ? 'company-b' : 'company-a');
                const merged = { ...current, ...updates, company_id: isCompanyB ? 'company-b' : 'company-a' };
                const { data: existing } = await supabase
                    .from('company_settings')
                    .select('id')
                    .eq('setting_key', settingKey)
                    .maybeSingle();
                if (existing?.id) {
                    await supabase
                        .from('company_settings')
                        .update({ setting_val: merged, updated_at: new Date().toISOString() })
                        .eq('id', existing.id);
                }
                else {
                    await supabase
                        .from('company_settings')
                        .insert({ setting_key: settingKey, setting_val: merged });
                }
                return merged;
            }
            catch (err) {
                console.warn('Could not save company settings to Supabase:', err);
            }
        }
        return { ...updates, company_id: isCompanyB ? 'company-b' : 'company-a' };
    }
    async getGeofenceSettings() {
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                // 1. Try company_settings geofence_config
                const { data: csData } = await supabase
                    .from('company_settings')
                    .select('setting_val')
                    .eq('setting_key', 'geofence_config')
                    .maybeSingle();
                if (csData?.setting_val) {
                    const v = csData.setting_val;
                    return {
                        officeName: v.officeName || '',
                        address: v.officeName || '',
                        latitude: v.centerLat || 0,
                        longitude: v.centerLng || 0,
                        radiusMeters: v.radiusMeters || 200,
                        isEnabled: v.enabled ?? true,
                        strictMode: v.enforceStrictly ?? false,
                    };
                }
                // 2. Try geofence_config table
                const { data: gfData } = await supabase
                    .from('geofence_config')
                    .select('*')
                    .maybeSingle();
                if (gfData) {
                    return {
                        officeName: gfData.office_name || '',
                        address: gfData.office_name || '',
                        latitude: gfData.center_lat || 0,
                        longitude: gfData.center_lng || 0,
                        radiusMeters: gfData.radius_meters || 200,
                        isEnabled: gfData.enabled ?? true,
                        strictMode: gfData.enforce_strictly ?? false,
                    };
                }
            }
            catch (err) {
                console.warn('Database error in getGeofenceSettings:', err);
            }
        }
        return {
            officeName: '',
            address: '',
            latitude: 0,
            longitude: 0,
            radiusMeters: 200,
            isEnabled: false,
            strictMode: false,
        };
    }
    async updateGeofenceSettings(updates) {
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const current = await this.getGeofenceSettings();
                const merged = { ...current, ...updates };
                const settingVal = {
                    enabled: merged.isEnabled,
                    centerLat: merged.latitude,
                    centerLng: merged.longitude,
                    officeName: merged.officeName,
                    radiusMeters: merged.radiusMeters,
                    enforceStrictly: merged.strictMode,
                };
                const { data: existing } = await supabase
                    .from('company_settings')
                    .select('id')
                    .eq('setting_key', 'geofence_config')
                    .maybeSingle();
                if (existing?.id) {
                    await supabase
                        .from('company_settings')
                        .update({ setting_val: settingVal, updated_at: new Date().toISOString() })
                        .eq('id', existing.id);
                }
                else {
                    await supabase
                        .from('company_settings')
                        .insert({ setting_key: 'geofence_config', setting_val: settingVal });
                }
                return merged;
            }
            catch (err) {
                console.warn('Could not save geofence settings to Supabase:', err);
            }
        }
        return updates;
    }
    async getCompanySmtpConfig(companyId) {
        const isCompanyB = companyId === 'company-b' || companyId?.toLowerCase()?.includes('nexus');
        const cId = isCompanyB ? 'company-b' : 'company-a';
        const settingKey = isCompanyB ? 'smtp_config_company-b' : 'smtp_config_company-a';
        // 1. Direct Hostinger VPS PostgreSQL query
        try {
            const res = await query(`SELECT setting_val FROM public.company_settings WHERE setting_key = $1 LIMIT 1`, [settingKey]);
            if (res.rows && res.rows.length > 0 && res.rows[0].setting_val) {
                const val = res.rows[0].setting_val;
                const config = {
                    companyId: cId,
                    smtpHost: val.smtpHost || (val.senderEmail?.includes('@gmail.com') || val.senderEmail?.includes('businz.com') ? 'smtp.gmail.com' : 'smtp.gmail.com'),
                    smtpPort: Number(val.smtpPort) || 587,
                    secure: val.secure ?? (Number(val.smtpPort) === 465),
                    senderEmail: val.senderEmail || '',
                    senderName: val.senderName || '',
                    appPasswordEncrypted: val.appPasswordEncrypted || '',
                    updatedAt: val.updatedAt || new Date().toISOString(),
                };
                inMemorySmtpConfigs[cId] = config;
                return config;
            }
        }
        catch (err) {
            console.warn('PostgreSQL query error in getCompanySmtpConfig:', err.message);
        }
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data } = await supabase
                    .from('company_settings')
                    .select('setting_val')
                    .eq('setting_key', settingKey)
                    .maybeSingle();
                if (data?.setting_val && typeof data.setting_val === 'object') {
                    const val = data.setting_val;
                    const config = {
                        companyId: cId,
                        smtpHost: val.smtpHost || (val.senderEmail?.includes('@gmail.com') || val.senderEmail?.includes('businz.com') ? 'smtp.gmail.com' : 'smtp.gmail.com'),
                        smtpPort: Number(val.smtpPort) || 587,
                        secure: val.secure ?? (Number(val.smtpPort) === 465),
                        senderEmail: val.senderEmail || '',
                        senderName: val.senderName || '',
                        appPasswordEncrypted: val.appPasswordEncrypted || '',
                        updatedAt: val.updatedAt || new Date().toISOString(),
                    };
                    inMemorySmtpConfigs[cId] = config;
                    return config;
                }
            }
            catch (err) {
                console.warn('Database error in getCompanySmtpConfig:', err);
            }
        }
        return inMemorySmtpConfigs[cId] || null;
    }
    async saveCompanySmtpConfig(companyId, updates) {
        const isCompanyB = companyId === 'company-b' || companyId?.toLowerCase()?.includes('nexus');
        const cId = isCompanyB ? 'company-b' : 'company-a';
        const settingKey = isCompanyB ? 'smtp_config_company-b' : 'smtp_config_company-a';
        const existing = await this.getCompanySmtpConfig(cId);
        const cleanHost = (updates.smtpHost || '').trim() || (updates.senderEmail?.includes('gmail') || updates.senderEmail?.includes('businz') ? 'smtp.gmail.com' : 'smtp.gmail.com');
        const cleanPort = Number(updates.smtpPort) || (cleanHost.includes('gmail') ? 587 : 465);
        const isSecure = updates.secure !== undefined ? Boolean(updates.secure) : cleanPort === 465;
        const cleanEmail = (updates.senderEmail || '').trim();
        let encryptedPassword = existing?.appPasswordEncrypted || '';
        if (updates.appPassword && updates.appPassword.trim()) {
            // Strip any spaces from Google App Password
            const normalizedPassword = updates.appPassword.replace(/\s+/g, '').trim();
            encryptedPassword = encryptCredential(normalizedPassword);
        }
        const newConfig = {
            companyId: cId,
            smtpHost: cleanHost,
            smtpPort: cleanPort,
            secure: isSecure,
            senderEmail: cleanEmail,
            senderName: updates.senderName || (isCompanyB ? 'Nexus Industrial Solutions' : 'Businz HRMS'),
            appPasswordEncrypted: encryptedPassword,
            updatedAt: new Date().toISOString(),
        };
        inMemorySmtpConfigs[cId] = newConfig;
        // 1. Direct Hostinger VPS PostgreSQL upsert
        try {
            const existingRow = await query(`SELECT id FROM public.company_settings WHERE setting_key = $1 LIMIT 1`, [settingKey]);
            if (existingRow.rows && existingRow.rows.length > 0) {
                await query(`UPDATE public.company_settings SET setting_val = $1::jsonb, updated_at = NOW() WHERE setting_key = $2`, [JSON.stringify(newConfig), settingKey]);
            }
            else {
                await query(`INSERT INTO public.company_settings (setting_key, setting_val, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW())`, [settingKey, JSON.stringify(newConfig)]);
            }
        }
        catch (err) {
            console.warn('PostgreSQL save error in saveCompanySmtpConfig:', err.message);
        }
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data: dbExisting } = await supabase
                    .from('company_settings')
                    .select('id')
                    .eq('setting_key', settingKey)
                    .maybeSingle();
                if (dbExisting?.id) {
                    await supabase
                        .from('company_settings')
                        .update({ setting_val: newConfig, updated_at: new Date().toISOString() })
                        .eq('id', dbExisting.id);
                }
                else {
                    await supabase
                        .from('company_settings')
                        .insert({ setting_key: settingKey, setting_val: newConfig });
                }
            }
            catch (err) {
                console.warn('Could not save company SMTP config to Supabase:', err);
            }
        }
        return newConfig;
    }
}
export const settingsRepository = new SettingsRepository();
//# sourceMappingURL=settingsRepository.js.map