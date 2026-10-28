import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const res = await client.query(`
  SELECT table_name, column_name, data_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name IN ('expenses', 'advance_salary_records', 'petty_cash_requests', 'petty_cash_disbursements')
  ORDER BY table_name, ordinal_position;
`);
console.log(JSON.stringify(res.rows, null, 2));
await client.end();
