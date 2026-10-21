import pg from 'pg';
import { env } from './env.js';
const { Pool } = pg;
export const databasePool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
});
databasePool.on('error', (error) => {
    console.error('[PostgreSQL] Unexpected idle client error:', error.message);
});
export const query = (text, values = []) => databasePool.query(text, values);
export const withTransaction = async (work) => {
    const client = await databasePool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
};
const columnCache = new Map();
export const hasDatabaseColumn = async (table, column) => {
    const cacheKey = `${table}.${column}`;
    const cached = columnCache.get(cacheKey);
    if (cached !== undefined)
        return cached;
    const result = await query(`SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`, [table, column]);
    const exists = Boolean(result.rows[0]?.exists);
    columnCache.set(cacheKey, exists);
    return exists;
};
//# sourceMappingURL=database.js.map