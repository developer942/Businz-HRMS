import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.union([z.coerce.number(), z.string()]).default(8000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url().default('http://localhost:3001'),
  SUPABASE_ANON_KEY: z.string().default('vps-local-rest-key'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('vps-local-rest-key'),
  JWT_SECRET: z.string().default('vrm-hrms-dev-jwt-secret-key-replace-in-production-2026'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000,*'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/hrms'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 mins default
  RATE_LIMIT_MAX: z.coerce.number().default(25000), // high capacity for 100+ req/s
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = {
  ...parsedEnv.data,
  corsOriginsList: parsedEnv.data.CORS_ORIGINS.split(',').map(s => s.trim()),
};
