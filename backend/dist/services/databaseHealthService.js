import pg from 'pg';
import { env } from '../config/env.js';
import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
const safeMessage = (error) => {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted]');
};
export async function checkDatabaseHealth() {
    const result = {
        configured: Boolean(env.DATABASE_URL) && isRealSupabaseConfigured(),
        postgres: { connected: false },
        databaseRest: { connected: false },
    };
    if (env.DATABASE_URL) {
        const started = Date.now();
        const client = new pg.Client({
            connectionString: env.DATABASE_URL,
            ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
            connectionTimeoutMillis: 5000,
        });
        try {
            await client.connect();
            await client.query('SELECT 1');
            result.postgres = { connected: true, latencyMs: Date.now() - started };
        }
        catch (error) {
            result.postgres = { connected: false, error: safeMessage(error) };
        }
        finally {
            await client.end().catch(() => undefined);
        }
    }
    else {
        result.postgres.error = 'DATABASE_URL is not configured';
    }
    if (isRealSupabaseConfigured()) {
        const started = Date.now();
        try {
            const { error } = await getSupabaseAdmin()
                .from('employees')
                .select('id', { count: 'exact', head: true });
            if (error)
                throw new Error(error.message);
            result.databaseRest = { connected: true, latencyMs: Date.now() - started };
        }
        catch (error) {
            result.databaseRest = { connected: false, error: safeMessage(error) };
        }
    }
    else {
        result.databaseRest.error = 'Database REST API is not configured';
    }
    return result;
}
//# sourceMappingURL=databaseHealthService.js.map