import bcrypt from 'bcrypt';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database.js';
import { BCRYPT_ROUNDS, isBcryptPasswordHash, scrubProfilePasswordFields } from '../repositories/authRepository.js';

export interface PasswordMigrationInspectionReport {
  totalEmployees: number;
  alreadyHashedCount: number;
  plaintextPasswordCount: number;
  emptyPasswordCount: number;
  profileDataPasswordLeakCount: number;
  companySettingsPasswordLeakCount: number;
  affectedEmployeeCodes: string[];
}

export interface PasswordMigrationExecutionReport {
  dryRun: boolean;
  backupCreated: boolean;
  totalEmployees: number;
  alreadyHashedCount: number;
  migratedToBcryptCount: number;
  verifiedBcryptCount: number;
  profileDataScrubbedCount: number;
  companySettingsScrubbedCount: number;
  remainingPlaintextCount: number;
}

export interface PasswordMigrationRollbackReport {
  restoredEmployeeCount: number;
  restoredCompanySettings: boolean;
}

export interface MigrationDbAdapter {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
  withTransaction?: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
}

function hasSecretFieldsInObject(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const rec = obj as Record<string, any>;
  if (
    rec.password !== undefined ||
    rec.plainPassword !== undefined ||
    rec.passwordHash !== undefined ||
    rec.password_hash !== undefined
  ) {
    return true;
  }
  if (
    rec.systemAccess &&
    typeof rec.systemAccess === 'object' &&
    (rec.systemAccess.password !== undefined ||
      rec.systemAccess.plainPassword !== undefined ||
      rec.systemAccess.passwordHash !== undefined ||
      rec.systemAccess.password_hash !== undefined)
  ) {
    return true;
  }
  return false;
}

/**
 * Read-only inspection of password storage state across employees and company_settings.
 * Never logs or returns actual password or hash strings.
 */
export async function inspectPasswordMigrationState(
  dbAdapter?: MigrationDbAdapter
): Promise<PasswordMigrationInspectionReport> {
  const execQuery = dbAdapter?.query ?? query;
  const empRes = await execQuery(
    `SELECT id, employee_id, password, profile_data FROM public.employees ORDER BY employee_id ASC`
  );

  let alreadyHashedCount = 0;
  let plaintextPasswordCount = 0;
  let emptyPasswordCount = 0;
  let profileDataPasswordLeakCount = 0;
  const affectedEmployeeCodes: string[] = [];

  for (const row of empRes.rows as any[]) {
    const rawPass = String(row.password || '');
    if (!rawPass) {
      emptyPasswordCount++;
    } else if (isBcryptPasswordHash(rawPass)) {
      alreadyHashedCount++;
    } else {
      plaintextPasswordCount++;
      if (row.employee_id) affectedEmployeeCodes.push(String(row.employee_id));
    }

    if (hasSecretFieldsInObject(row.profile_data)) {
      profileDataPasswordLeakCount++;
    }
  }

  let companySettingsPasswordLeakCount = 0;
  const csRes = await execQuery(
    `SELECT setting_val FROM public.company_settings WHERE setting_key = 'employee_profiles_data' LIMIT 1`
  );
  if (csRes.rows.length > 0) {
    let profiles = csRes.rows[0].setting_val || {};
    if (typeof profiles === 'string') {
      try {
        profiles = JSON.parse(profiles);
      } catch {
        profiles = {};
      }
    }
    if (profiles && typeof profiles === 'object' && !Array.isArray(profiles)) {
      for (const entry of Object.values(profiles)) {
        if (hasSecretFieldsInObject(entry)) {
          companySettingsPasswordLeakCount++;
        }
      }
    }
  }

  return {
    totalEmployees: empRes.rows.length,
    alreadyHashedCount,
    plaintextPasswordCount,
    emptyPasswordCount,
    profileDataPasswordLeakCount,
    companySettingsPasswordLeakCount,
    affectedEmployeeCodes,
  };
}

/**
 * Executes atomic backup, bcrypt (cost 12) migration, company_settings password scrubbing,
 * and post-migration verification inside a single PostgreSQL transaction.
 */
export async function executePasswordMigration(
  options: { dryRun?: boolean; dbAdapter?: MigrationDbAdapter } = {}
): Promise<PasswordMigrationExecutionReport> {
  const dryRun = options.dryRun ?? false;
  if (dryRun) {
    const inspection = await inspectPasswordMigrationState(options.dbAdapter);
    return {
      dryRun: true,
      backupCreated: false,
      totalEmployees: inspection.totalEmployees,
      alreadyHashedCount: inspection.alreadyHashedCount,
      migratedToBcryptCount: inspection.plaintextPasswordCount,
      verifiedBcryptCount: inspection.alreadyHashedCount + inspection.plaintextPasswordCount,
      profileDataScrubbedCount: inspection.profileDataPasswordLeakCount,
      companySettingsScrubbedCount: inspection.companySettingsPasswordLeakCount,
      remainingPlaintextCount: 0,
    };
  }

  const runTx =
    options.dbAdapter?.withTransaction ??
    (options.dbAdapter
      ? async <T>(fn: (client: any) => Promise<T>) => fn(options.dbAdapter)
      : withTransaction);

  return runTx(async (client: PoolClient): Promise<PasswordMigrationExecutionReport> => {
    // 1. Create pre-migration backup tables (idempotent, preserves original snapshot)
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.employees_auth_backup_pre_hash (
        id UUID PRIMARY KEY,
        employee_id TEXT NOT NULL,
        password_backup TEXT,
        must_change_password BOOLEAN,
        backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS public.company_settings_backup_pre_hash (
        setting_key TEXT PRIMARY KEY,
        setting_val JSONB,
        backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO public.employees_auth_backup_pre_hash (id, employee_id, password_backup, must_change_password)
      SELECT id, employee_id, password, must_change_password
      FROM public.employees
      ON CONFLICT (id) DO NOTHING
    `);

    await client.query(`
      INSERT INTO public.company_settings_backup_pre_hash (setting_key, setting_val)
      SELECT setting_key, setting_val
      FROM public.company_settings
      WHERE setting_key = 'employee_profiles_data'
      ON CONFLICT (setting_key) DO NOTHING
    `);

    // Lock down backup tables from PostgREST roles
    try {
      await client.query(`
        REVOKE ALL ON TABLE public.employees_auth_backup_pre_hash FROM PUBLIC, web_anon, anon, authenticated;
        REVOKE ALL ON TABLE public.company_settings_backup_pre_hash FROM PUBLIC, web_anon, anon, authenticated;
      `);
    } catch {
      // Ignore if specific roles do not exist in test database
    }

    // 2. Lock and migrate employees rows
    const empRes = await client.query(
      `SELECT id, employee_id, password, profile_data FROM public.employees ORDER BY employee_id ASC FOR UPDATE`
    );

    let alreadyHashedCount = 0;
    let migratedToBcryptCount = 0;
    let verifiedBcryptCount = 0;
    let profileDataScrubbedCount = 0;

    for (const row of empRes.rows as any[]) {
      const rawPass = String(row.password || '');
      let nextPass = rawPass;
      let passUpdated = false;

      if (rawPass) {
        if (isBcryptPasswordHash(rawPass)) {
          alreadyHashedCount++;
          verifiedBcryptCount++;
        } else {
          const hashed = await bcrypt.hash(rawPass, BCRYPT_ROUNDS);
          const verified = await bcrypt.compare(rawPass, hashed);
          if (!verified) {
            throw new Error(`Bcrypt verification failed during migration for employee ${row.employee_id}`);
          }
          nextPass = hashed;
          passUpdated = true;
          migratedToBcryptCount++;
          verifiedBcryptCount++;
        }
      }

      let nextProfileData = row.profile_data;
      let profileUpdated = false;
      if (hasSecretFieldsInObject(row.profile_data)) {
        nextProfileData = scrubProfilePasswordFields(row.profile_data);
        profileUpdated = true;
        profileDataScrubbedCount++;
      }

      if (passUpdated && profileUpdated) {
        await client.query(
          `UPDATE public.employees SET password = $1, profile_data = $2::jsonb, updated_at = NOW() WHERE id = $3`,
          [nextPass, JSON.stringify(nextProfileData), row.id]
        );
      } else if (passUpdated) {
        await client.query(
          `UPDATE public.employees SET password = $1, updated_at = NOW() WHERE id = $2`,
          [nextPass, row.id]
        );
      } else if (profileUpdated) {
        await client.query(
          `UPDATE public.employees SET profile_data = $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(nextProfileData), row.id]
        );
      }
    }

    // 3. Scrub plaintext passwords from company_settings.employee_profiles_data
    let companySettingsScrubbedCount = 0;
    const csRes = await client.query(
      `SELECT setting_val FROM public.company_settings WHERE setting_key = 'employee_profiles_data' FOR UPDATE`
    );
    if (csRes.rows.length > 0) {
      let profiles = csRes.rows[0].setting_val || {};
      if (typeof profiles === 'string') {
        try {
          profiles = JSON.parse(profiles);
        } catch {
          profiles = {};
        }
      }
      if (profiles && typeof profiles === 'object' && !Array.isArray(profiles)) {
        const cleanedProfiles: Record<string, any> = {};
        for (const [key, entry] of Object.entries(profiles)) {
          if (hasSecretFieldsInObject(entry)) {
            companySettingsScrubbedCount++;
          }
          cleanedProfiles[key] = scrubProfilePasswordFields(entry as Record<string, any>);
        }
        await client.query(
          `UPDATE public.company_settings SET setting_val = $1::jsonb, updated_at = NOW() WHERE setting_key = 'employee_profiles_data'`,
          [JSON.stringify(cleanedProfiles)]
        );
      }
    }

    // 4. Verify zero plaintext passwords remain in employees
    const verifyRes = await client.query(`SELECT password FROM public.employees WHERE password IS NOT NULL AND password <> ''`);
    let remainingPlaintextCount = 0;
    for (const r of verifyRes.rows as any[]) {
      if (!isBcryptPasswordHash(String(r.password || ''))) {
        remainingPlaintextCount++;
      }
    }
    if (remainingPlaintextCount > 0) {
      throw new Error(`Migration verification failed: ${remainingPlaintextCount} non-bcrypt password(s) remain.`);
    }

    return {
      dryRun: false,
      backupCreated: true,
      totalEmployees: empRes.rows.length,
      alreadyHashedCount,
      migratedToBcryptCount,
      verifiedBcryptCount,
      profileDataScrubbedCount,
      companySettingsScrubbedCount,
      remainingPlaintextCount,
    };
  });
}

/**
 * Rollback procedure: Restores employees.password and must_change_password from
 * public.employees_auth_backup_pre_hash inside a single transaction.
 */
export async function rollbackPasswordMigration(
  dbAdapter?: MigrationDbAdapter
): Promise<PasswordMigrationRollbackReport> {
  const runTx =
    dbAdapter?.withTransaction ??
    (dbAdapter
      ? async <T>(fn: (client: any) => Promise<T>) => fn(dbAdapter)
      : withTransaction);

  return runTx(async (client: PoolClient): Promise<PasswordMigrationRollbackReport> => {
    const backupRows = await client.query(
      `SELECT id, employee_id, password_backup, must_change_password FROM public.employees_auth_backup_pre_hash`
    );
    if (!backupRows.rows.length) {
      throw new Error('Rollback aborted: public.employees_auth_backup_pre_hash is empty or does not exist.');
    }

    let restoredEmployeeCount = 0;
    for (const row of backupRows.rows as any[]) {
      const res = await client.query(
        `UPDATE public.employees
         SET password = $1, must_change_password = COALESCE($2, must_change_password), updated_at = NOW()
         WHERE id = $3`,
        [row.password_backup, row.must_change_password, row.id]
      );
      restoredEmployeeCount += res.rowCount || 0;
    }

    return {
      restoredEmployeeCount,
      restoredCompanySettings: false,
    };
  });
}
