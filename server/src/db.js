// server/src/db.js
import pg from 'pg';
import config from './config.js';

// Return DATE columns as 'YYYY-MM-DD' strings. By default pg turns them into
// JavaScript Dates at local midnight, which can shift the day across time zones.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, value => value);

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const query = (text, params) => pool.query(text, params);

// Runs fn(client) in a transaction: committed if it returns, rolled back if it throws
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
