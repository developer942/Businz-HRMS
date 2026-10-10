import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { PayrollSettingsModel } from '../types/payroll.js';
import { memoryCache } from '../services/cacheService.js';
import { encryptCredential, decryptCredential } from '../utils/crypto.js';

export interface CompanySmtpConfig {
  companyId: string;
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  senderEmail: string;
  senderName?: string;
  appPasswordEncrypted: string;
  updatedAt?: string;
}

const inMemorySmtpConfigs: Record<string, CompanySmtpConfig> = {};

const SETTINGS_CACHE_KEY = 'payroll_settings_global';
const SETTINGS_TTL_MS = 60000; // 60 seconds

export class SettingsRepository {
  async getSettings(): Promise<PayrollSettingsModel> {
    const cached = memoryCache.get<PayrollSettingsModel>(SETTINGS_CACHE_KEY);
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
          const parsed: PayrollSettingsModel = {
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
      } catch (err) {
        console.warn('Database error in getSettings:', err);
      }
    }

    const emptyDefault: PayrollSettingsModel = {
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

  async updateSettings(updates: Partial<PayrollSettingsModel>): Promise<PayrollSettingsModel> {
    memoryCache.invalidate(SETTINGS_CACHE_KEY);

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const payload: Record<string, unknown> = {};

        if (updates.pfEnabled !== undefined) payload.pf_enabled = updates.pfEnabled;
        if (updates.pfRate !== undefined) payload.pf_rate = updates.pfRate;
        if (updates.pfWageCeiling !== undefined) payload.pf_wage_ceiling = updates.pfWageCeiling;
        if (updates.pfWageComponents !== undefined) payload.pf_wage_components = updates.pfWageComponents;
        if (updates.esicEnabled !== undefined) payload.esic_enabled = updates.esicEnabled;
        if (updates.esicRate !== undefined) payload.esic_rate = updates.esicRate;
        if (updates.esicSalaryThreshold !== undefined) payload.esic_salary_threshold = updates.esicSalaryThreshold;
        if (updates.esicWageComponents !== undefined) payload.esic_wage_components = updates.esicWageComponents;
        if (updates.professionalTaxEnabled !== undefined) payload.professional_tax_enabled = updates.professionalTaxEnabled;
        if (updates.professionalTaxAmount !== undefined) payload.professional_tax_amount = updates.professionalTaxAmount;
        if (updates.lopEnabled !== undefined) payload.lop_enabled = updates.lopEnabled;
        if (updates.attendanceBonusEnabled !== undefined) payload.attendance_bonus_enabled = updates.attendanceBonusEnabled;
        if (updates.overtimeEnabled !== undefined) payload.overtime_enabled = updates.overtimeEnabled;
        if (updates.standardWorkingDays !== undefined) payload.standard_working_days = updates.standardWorkingDays;
        if (updates.payrollCycleDay !== undefined) payload.payroll_cycle_day = updates.payrollCycleDay;

        await supabase
          .from('payroll_settings')
          .update(payload)
          .eq('org_key', 'global');
      } catch (err) {
        console.warn('Could not write settings to Supabase:', err);
      }
    }

    return this.getSettings();
  }

  async getCompanySettings(companyId?: string): Promise<any> {
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
      } catch (err) {
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
      companyCode: 'BUSINZ',
      companyName: 'Businz Technologies Private Limited',
      legalCompanyName: 'Businz Technologies Pvt. Ltd.',
      legalEntity: 'Businz Technologies Pvt. Ltd.',
      logoUrl: '/logo.png',
      address: 'Businz Corporate Park, Tech Corridor, OMR, Chennai, Tamil Nadu — 600096',
      registeredAddress: 'Businz Corporate Park, Tech Corridor, OMR, Chennai, Tamil Nadu — 600096',
      branchAddress: 'Phase 2 Electronic City, Bengaluru, Karnataka — 560100',
      contactEmail: 'contact@businz.com',
      officialEmail: 'contact@businz.com',
      contactPhone: '9876543210',
      officialPhone: '9876543210',
      website: 'https://businz.com',
      taxIdGst: '33ABCDE1234F1Z5',
      gstNumber: '33ABCDE1234F1Z5',
      panNumber: 'AAACB1234F',
      cinNumber: 'U72900TN2022PTC150000',
      registrationNumber: 'ROC-CHENNAI-150000',
      ownerName: 'Velmurukan P',
      authorizedSignatoryName: 'Velmurukan P',
      authorizedSignatoryDesignation: 'Chief Executive Officer & Director',
      signatureImageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=200&q=80',
      stampImageUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=200&q=80',
    };
  }

  async updateCompanySettings(updates: any, companyId?: string): Promise<any> {
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
        } else {
          await supabase
            .from('company_settings')
            .insert({ setting_key: settingKey, setting_val: merged });
        }

        return merged;
      } catch (err) {
        console.warn('Could not save company settings to Supabase:', err);
      }
    }

    return { ...updates, company_id: isCompanyB ? 'company-b' : 'company-a' };
  }

  async getGeofenceSettings(): Promise<any> {
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
      } catch (err) {
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

  async updateGeofenceSettings(updates: any): Promise<any> {
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
        } else {
          await supabase
            .from('company_settings')
            .insert({ setting_key: 'geofence_config', setting_val: settingVal });
        }

        return merged;
      } catch (err) {
        console.warn('Could not save geofence settings to Supabase:', err);
      }
    }

    return updates;
  }

  async getCompanySmtpConfig(companyId?: string): Promise<CompanySmtpConfig | null> {
    const isCompanyB = companyId === 'company-b' || companyId?.toLowerCase()?.includes('nexus');
    const cId = isCompanyB ? 'company-b' : 'company-a';
    const settingKey = isCompanyB ? 'smtp_config_company-b' : 'smtp_config_company-a';

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
          .from('company_settings')
          .select('setting_val')
          .eq('setting_key', settingKey)
          .maybeSingle();

        if (data?.setting_val && typeof data.setting_val === 'object') {
          const val = data.setting_val as any;
          const config: CompanySmtpConfig = {
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
      } catch (err) {
        console.warn('Database error in getCompanySmtpConfig:', err);
      }
    }

    return inMemorySmtpConfigs[cId] || null;
  }

  async saveCompanySmtpConfig(
    companyId: string | undefined,
    updates: {
      smtpHost?: string;
      smtpPort?: number | string;
      secure?: boolean;
      senderEmail: string;
      senderName?: string;
      appPassword?: string;
    }
  ): Promise<CompanySmtpConfig> {
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

    const newConfig: CompanySmtpConfig = {
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
        } else {
          await supabase
            .from('company_settings')
            .insert({ setting_key: settingKey, setting_val: newConfig });
        }
      } catch (err) {
        console.warn('Could not save company SMTP config to Supabase:', err);
      }
    }

    return newConfig;
  }
}

export const settingsRepository = new SettingsRepository();
