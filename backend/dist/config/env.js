import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const rawEnv = {
    ...process.env,
    DB_REST_URL: process.env.DB_REST_URL ?? process.env.SUPABASE_URL,
    DB_REST_KEY: process.env.DB_REST_KEY ?? process.env.SUPABASE_ANON_KEY,
    DB_REST_SERVICE_KEY: process.env.DB_REST_SERVICE_KEY
        ?? process.env.SUPABASE_SERVICE_ROLE_KEY
        ?? process.env.DB_REST_KEY
        ?? process.env.SUPABASE_ANON_KEY,
};
const envSchema = z.object({
    PORT: z.union([z.coerce.number(), z.string()]).default(8000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DB_REST_URL: z.string().url().default('http://localhost:3001'),
    DB_REST_KEY: z.string().default('vps-local-rest-key'),
    DB_REST_SERVICE_KEY: z.string().default('vps-local-rest-key'),
    JWT_SECRET: z.string().default('vrm-hrms-dev-jwt-secret-key-replace-in-production-2026'),
    CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000,*'),
    DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/hrms'),
    DATABASE_SSL: z.enum(['true', 'false']).default('false'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 mins default
    RATE_LIMIT_MAX: z.coerce.number().default(25000), // high capacity for 100+ req/s
});
const parsedEnv = envSchema.safeParse(rawEnv);
if (!parsedEnv.success) {
    console.error('Invalid environment variables:', parsedEnv.error.format());
    process.exit(1);
}
export const env = {
    ...parsedEnv.data,
    // Compatibility aliases while repositories still use the Supabase JS PostgREST client.
    SUPABASE_URL: parsedEnv.data.DB_REST_URL,
    SUPABASE_ANON_KEY: parsedEnv.data.DB_REST_KEY,
    SUPABASE_SERVICE_ROLE_KEY: parsedEnv.data.DB_REST_SERVICE_KEY,
    corsOriginsList: parsedEnv.data.CORS_ORIGINS.split(',').map(s => s.trim()),
};
//# sourceMappingURL=env.js.map