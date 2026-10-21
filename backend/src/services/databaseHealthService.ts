import { env } from '../config/env.js';
import { databasePool } from '../config/database.js';

export interface DatabaseHealth {
  configured: boolean;
  postgres: { connected: boolean; latencyMs?: number; error?: string };
}

const safeMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Unknown database error';
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted]');
};

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const result: DatabaseHealth = {
    configured: Boolean(env.DATABASE_URL),
    postgres: { connected: false },
  };

  if (env.DATABASE_URL) {
    const started = Date.now();
    try {
      await databasePool.query('SELECT 1');
      result.postgres = { connected: true, latencyMs: Date.now() - started };
    } catch (error) {
      result.postgres = { connected: false, error: safeMessage(error) };
    }
  } else {
    result.postgres.error = 'DATABASE_URL is not configured';
  }

  return result;
}
