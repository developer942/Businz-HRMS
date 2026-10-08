import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
let databaseAdminClient = null;
let databaseAnonClient = null;
export const isRealSupabaseConfigured = () => {
    return !env.DB_REST_URL.includes('mock-supabase.local') && env.DB_REST_KEY !== 'mock-anon-key';
};
/**
 * Admin database REST client for server-side payroll calculations.
 *
 * The implementation still uses supabase-js because it is the existing PostgREST
 * query client. In VPS deployments it points to our own PostgREST proxy.
 */
export const getSupabaseAdmin = () => {
    if (!databaseAdminClient) {
        databaseAdminClient = createClient(env.DB_REST_URL, env.DB_REST_SERVICE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }
    return databaseAdminClient;
};
/**
 * Standard public database REST client for scoped operations.
 */
export const getSupabaseAnon = () => {
    if (!databaseAnonClient) {
        databaseAnonClient = createClient(env.DB_REST_URL, env.DB_REST_KEY);
    }
    return databaseAnonClient;
};
//# sourceMappingURL=supabase.js.map