import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { query } from '../config/database.js';
import { PayrollSettingsModel, PayrollSettingsConfig, SalaryComponentConfig } from '../types/payroll.js';
import { memoryCache } from '../services/cacheService.js';
import { encryptCredential, decryptCredential } from '../utils/crypto.js';
import {
  parseGoogleMapsLink,
  compareOfficeCoordinates,
  buildCanonicalGoogleMapsUrl,
  isValidCoord,
} from '../utils/googleMapsParser.js';

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

  async getPayrollSettingsConfig(): Promise<PayrollSettingsConfig> {
    const cacheKey = 'payroll_settings_config_cache';
    const cached = memoryCache.get<PayrollSettingsConfig>(cacheKey);
    if (cached) return cached;

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('company_settings')
          .select('setting_val')
          .eq('setting_key', 'payroll_settings_config')
          .maybeSingle();

        if (data?.setting_val && typeof data.setting_val === 'object') {
          const config = data.setting_val as PayrollSettingsConfig;
          memoryCache.set(cacheKey, config, 30000);
          return config;
        }
      } catch (err) {
        console.warn('Database error in getPayrollSettingsConfig:', err);
      }
    }

    try {
      const res = await query(
        `SELECT setting_val FROM public.company_settings WHERE setting_key = $1 LIMIT 1`,
        ['payroll_settings_config']
      );
      if (res.rows && res.rows[0]?.setting_val) {
        const config = res.rows[0].setting_val as PayrollSettingsConfig;
        memoryCache.set(cacheKey, config, 30000);
        return config;
      }
    } catch (err: any) {
      console.warn('PostgreSQL query error in getPayrollSettingsConfig:', err.message);
    }

    // Default fallback
    const fallback: PayrollSettingsConfig = {
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

  async updatePayrollSettingsConfig(updates: Partial<PayrollSettingsConfig>): Promise<PayrollSettingsConfig> {
    memoryCache.invalidate('payroll_settings_config_cache');
    const current = await this.getPayrollSettingsConfig();
    const merged: PayrollSettingsConfig = {
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
        } else {
          await supabase
            .from('company_settings')
            .insert({ setting_key: 'payroll_settings_config', setting_val: merged });
        }
      } catch (err) {
        console.warn('Could not save payroll settings config to Supabase:', err);
      }
    }

    try {
      await query(
        `INSERT INTO public.company_settings (setting_key, setting_val, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (setting_key) DO UPDATE
         SET setting_val = $2, updated_at = NOW()`,
        ['payroll_settings_config', JSON.stringify(merged)]
      );
    } catch (err: any) {
      console.warn('PostgreSQL query error in updatePayrollSettingsConfig:', err.message);
    }

    return merged;
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

  private inMemoryGeofenceSettings: any | null = null;

  private enrichGeofencePayload(raw: {
    officeName: string;
    address: string;
    lat: number;
    lng: number;
    radiusMeters: number;
    isEnabled: boolean;
    strictMode: boolean;
    googleMapsLink: string;
    updatedBy?: string;
    updatedAt?: string;
    confirmedBy?: string;
    confirmedAt?: string;
  }) {
    const comparison = compareOfficeCoordinates(raw.lat, raw.lng, raw.googleMapsLink);
    return {
      officeName: raw.officeName,
      address: raw.address,
      latitude: raw.lat,
      longitude: raw.lng,
      centerLat: raw.lat,
      centerLng: raw.lng,
      radiusMeters: raw.radiusMeters,
      isEnabled: raw.isEnabled,
      enabled: raw.isEnabled,
      strictMode: raw.strictMode,
      enforceStrictly: raw.strictMode,
      googleMapsLink: raw.googleMapsLink,
      updatedBy: raw.updatedBy || '',
      updatedAt: raw.updatedAt || '',
      confirmedBy: raw.confirmedBy || raw.updatedBy || '',
      confirmedAt: raw.confirmedAt || raw.updatedAt || '',
      parsedGoogleMapsCoordinates: comparison.parsedCoordinates,
      coordinateDiscrepancyMeters: comparison.discrepancyMeters,
      hasCoordinateDiscrepancy: comparison.hasDiscrepancy,
    };
  }

  async getGeofenceSettings(): Promise<any> {
    // 1. Direct Hostinger VPS PostgreSQL query for company_settings
    try {
      const res = await query(
        `SELECT setting_val, updated_at FROM public.company_settings WHERE setting_key = $1 LIMIT 1`,
        ['geofence_config']
      );
      if (res.rows && res.rows[0]?.setting_val) {
        const v = res.rows[0].setting_val as any;
        const lat = Number(v.centerLat ?? v.latitude ?? 0);
        const lng = Number(v.centerLng ?? v.longitude ?? 0);
        if (isValidCoord(lat, lng)) {
          return this.enrichGeofencePayload({
            officeName: v.officeName || 'VRM Structures India Pvt Ltd',
            address: v.address || v.officeName || '',
            lat,
            lng,
            radiusMeters: Number(v.radiusMeters) || 250,
            isEnabled: v.enabled ?? v.isEnabled ?? true,
            strictMode: v.enforceStrictly ?? v.strictMode ?? true,
            googleMapsLink: v.googleMapsLink || buildCanonicalGoogleMapsUrl(lat, lng),
            updatedBy: v.updatedBy || v.confirmedBy || '',
            updatedAt: v.updatedAt || (res.rows[0].updated_at ? new Date(res.rows[0].updated_at).toISOString() : ''),
            confirmedBy: v.confirmedBy || v.updatedBy || '',
            confirmedAt: v.confirmedAt || v.updatedAt || '',
          });
        }
      }
    } catch (err: any) {
      console.warn('PostgreSQL query error in getGeofenceSettings:', err.message);
    }

    // 2. Direct PostgreSQL query for geofence_config relational table
    try {
      const gfRes = await query(
        `SELECT * FROM public.geofence_config ORDER BY updated_at DESC LIMIT 1`
      );
      if (gfRes.rows && gfRes.rows[0]) {
        const row = gfRes.rows[0];
        const lat = Number(row.center_lat || 0);
        const lng = Number(row.center_lng || 0);
        if (isValidCoord(lat, lng)) {
          return this.enrichGeofencePayload({
            officeName: row.office_name || 'VRM Structures India Pvt Ltd',
            address: row.office_name || '',
            lat,
            lng,
            radiusMeters: Number(row.radius_meters) || 250,
            isEnabled: row.enabled ?? true,
            strictMode: row.enforce_strictly ?? true,
            googleMapsLink: buildCanonicalGoogleMapsUrl(lat, lng),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
          });
        }
      }
    } catch (err: any) {
      console.warn('PostgreSQL query error in geofence_config table:', err.message);
    }

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();

        const { data: csData } = await supabase
          .from('company_settings')
          .select('setting_val, updated_at')
          .eq('setting_key', 'geofence_config')
          .maybeSingle();

        if (csData?.setting_val) {
          const v = csData.setting_val;
          const lat = Number(v.centerLat ?? v.latitude ?? 0);
          const lng = Number(v.centerLng ?? v.longitude ?? 0);
          if (isValidCoord(lat, lng)) {
            return this.enrichGeofencePayload({
              officeName: v.officeName || 'VRM Structures India Pvt Ltd',
              address: v.address || v.officeName || '',
              lat,
              lng,
              radiusMeters: Number(v.radiusMeters) || 250,
              isEnabled: v.enabled ?? v.isEnabled ?? true,
              strictMode: v.enforceStrictly ?? v.strictMode ?? true,
              googleMapsLink: v.googleMapsLink || buildCanonicalGoogleMapsUrl(lat, lng),
              updatedBy: v.updatedBy || v.confirmedBy || '',
              updatedAt: v.updatedAt || csData.updated_at || '',
              confirmedBy: v.confirmedBy || v.updatedBy || '',
              confirmedAt: v.confirmedAt || v.updatedAt || '',
            });
          }
        }

        const { data: gfData } = await supabase
          .from('geofence_config')
          .select('*')
          .maybeSingle();

        if (gfData) {
          const lat = Number(gfData.center_lat || 0);
          const lng = Number(gfData.center_lng || 0);
          if (isValidCoord(lat, lng)) {
            return this.enrichGeofencePayload({
              officeName: gfData.office_name || 'VRM Structures India Pvt Ltd',
              address: gfData.office_name || '',
              lat,
              lng,
              radiusMeters: Number(gfData.radius_meters) || 250,
              isEnabled: gfData.enabled ?? true,
              strictMode: gfData.enforce_strictly ?? true,
              googleMapsLink: buildCanonicalGoogleMapsUrl(lat, lng),
              updatedAt: gfData.updated_at || '',
            });
          }
        }
      } catch (err) {
        console.warn('Database error in getGeofenceSettings:', err);
      }
    }

    if (this.inMemoryGeofenceSettings) {
      return this.inMemoryGeofenceSettings;
    }

    return this.enrichGeofencePayload({
      officeName: 'VRM Structures India Pvt Ltd',
      address: '',
      lat: 13.151660,
      lng: 80.208618,
      radiusMeters: 250,
      isEnabled: true,
      strictMode: true,
      googleMapsLink: 'https://www.google.com/maps?q=13.152218,80.209216',
    });
  }

  async updateGeofenceSettings(updates: any): Promise<any> {
    const current = await this.getGeofenceSettings();
    let lat =
      updates.latitude !== undefined
        ? Number(updates.latitude)
        : updates.centerLat !== undefined
          ? Number(updates.centerLat)
          : current.latitude;
    let lng =
      updates.longitude !== undefined
        ? Number(updates.longitude)
        : updates.centerLng !== undefined
          ? Number(updates.centerLng)
          : current.longitude;

    const rawLink = (updates.googleMapsLink !== undefined ? updates.googleMapsLink : current.googleMapsLink || '').trim();
    const parsedFromLink = rawLink ? parseGoogleMapsLink(rawLink) : null;

    // If the administrator explicitly confirmed the Google Maps link coordinates, or provided only a Google Maps link
    // without explicit lat/lng overrides, synchronize lat/lng from the parsed Google Maps URL.
    const hasExplicitLatLng =
      updates.latitude !== undefined ||
      updates.centerLat !== undefined ||
      updates.longitude !== undefined ||
      updates.centerLng !== undefined;

    if (
      parsedFromLink?.success &&
      parsedFromLink.lat !== null &&
      parsedFromLink.lng !== null &&
      (updates.confirmCoordinateSource === 'google_maps_link' || (!hasExplicitLatLng && updates.googleMapsLink !== undefined))
    ) {
      lat = Number(parsedFromLink.lat.toFixed(6));
      lng = Number(parsedFromLink.lng.toFixed(6));
    } else {
      lat = Number(lat.toFixed(6));
      lng = Number(lng.toFixed(6));
    }

    const radius = Number(updates.radiusMeters ?? current.radiusMeters ?? 250);
    const isEnabled =
      updates.isEnabled !== undefined
        ? Boolean(updates.isEnabled)
        : updates.enabled !== undefined
          ? Boolean(updates.enabled)
          : current.isEnabled;
    const strictMode =
      updates.strictMode !== undefined
        ? Boolean(updates.strictMode)
        : updates.enforceStrictly !== undefined
          ? Boolean(updates.enforceStrictly)
          : current.strictMode;
    const officeName = (updates.officeName || current.officeName || 'VRM Structures India Pvt Ltd').trim();
    const address = (updates.address || current.address || officeName).trim();

    // Synchronize the Google Maps link with the confirmed coordinates unless synchronizeCoordinates is explicitly false
    const shouldSyncLink = updates.synchronizeCoordinates !== false;
    const linkComparison = compareOfficeCoordinates(lat, lng, rawLink);
    const googleMapsLink =
      shouldSyncLink && (linkComparison.hasDiscrepancy || !rawLink)
        ? buildCanonicalGoogleMapsUrl(lat, lng)
        : rawLink || buildCanonicalGoogleMapsUrl(lat, lng);

    const nowIso = new Date().toISOString();
    const actor = updates.confirmedBy || updates.updatedBy || current.updatedBy || 'Authorized Admin';

    const merged = this.enrichGeofencePayload({
      officeName,
      address,
      lat,
      lng,
      radiusMeters: radius,
      isEnabled,
      strictMode,
      googleMapsLink,
      updatedBy: actor,
      updatedAt: nowIso,
      confirmedBy: actor,
      confirmedAt: nowIso,
    });

    this.inMemoryGeofenceSettings = merged;

    const settingVal = {
      enabled: isEnabled,
      centerLat: lat,
      centerLng: lng,
      latitude: lat,
      longitude: lng,
      officeName,
      address,
      radiusMeters: radius,
      enforceStrictly: strictMode,
      googleMapsLink,
      updatedBy: actor,
      updatedAt: nowIso,
      confirmedBy: actor,
      confirmedAt: nowIso,
    };

    // 1. Persist to company_settings (PostgreSQL)
    try {
      await query(
        `INSERT INTO public.company_settings (setting_key, setting_val, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (setting_key) DO UPDATE
         SET setting_val = $2::jsonb, updated_at = NOW()`,
        ['geofence_config', JSON.stringify(settingVal)]
      );
    } catch (err: any) {
      console.warn('PostgreSQL save error in company_settings geofence_config:', err.message);
    }

    // 2. Synchronize to geofence_config table (PostgreSQL)
    try {
      const gfExisting = await query(`SELECT id FROM public.geofence_config LIMIT 1`);
      if (gfExisting.rows && gfExisting.rows[0]) {
        await query(
          `UPDATE public.geofence_config
           SET office_name = $1, center_lat = $2, center_lng = $3, radius_meters = $4, enabled = $5, enforce_strictly = $6, updated_at = NOW()
           WHERE id = $7`,
          [officeName, lat, lng, radius, isEnabled, strictMode, gfExisting.rows[0].id]
        );
      } else {
        await query(
          `INSERT INTO public.geofence_config (office_name, center_lat, center_lng, radius_meters, enabled, enforce_strictly, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [officeName, lat, lng, radius, isEnabled, strictMode]
        );
      }
    } catch (err: any) {
      console.warn('PostgreSQL save error in geofence_config table:', err.message);
    }

    // 3. Keep Supabase in sync if configured
    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
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

        // Also update geofence_config table in Supabase
        const { data: gfSupabase } = await supabase
          .from('geofence_config')
          .select('id')
          .maybeSingle();

        if (gfSupabase?.id) {
          await supabase
            .from('geofence_config')
            .update({
              office_name: officeName,
              center_lat: lat,
              center_lng: lng,
              radius_meters: radius,
              enabled: isEnabled,
              enforce_strictly: strictMode,
              updated_at: new Date().toISOString(),
            })
            .eq('id', gfSupabase.id);
        }
      } catch (err) {
        console.warn('Could not save geofence settings to Supabase:', err);
      }
    }

    return merged;
  }

  async getCompanySmtpConfig(companyId?: string): Promise<CompanySmtpConfig | null> {
    const isCompanyB = companyId === 'company-b' || companyId?.toLowerCase()?.includes('nexus');
    const cId = isCompanyB ? 'company-b' : 'company-a';
    const settingKey = isCompanyB ? 'smtp_config_company-b' : 'smtp_config_company-a';

    // 1. Direct Hostinger VPS PostgreSQL query
    try {
      const res = await query(
        `SELECT setting_val FROM public.company_settings WHERE setting_key = $1 LIMIT 1`,
        [settingKey]
      );
      if (res.rows && res.rows.length > 0 && res.rows[0].setting_val) {
        const val = res.rows[0].setting_val as any;
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
    } catch (err: any) {
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

    // 1. Direct Hostinger VPS PostgreSQL upsert
    try {
      const existingRow = await query(
        `SELECT id FROM public.company_settings WHERE setting_key = $1 LIMIT 1`,
        [settingKey]
      );
      if (existingRow.rows && existingRow.rows.length > 0) {
        await query(
          `UPDATE public.company_settings SET setting_val = $1::jsonb, updated_at = NOW() WHERE setting_key = $2`,
          [JSON.stringify(newConfig), settingKey]
        );
      } else {
        await query(
          `INSERT INTO public.company_settings (setting_key, setting_val, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW())`,
          [settingKey, JSON.stringify(newConfig)]
        );
      }
    } catch (err: any) {
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
