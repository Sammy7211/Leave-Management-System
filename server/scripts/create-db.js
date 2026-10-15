// server/scripts/create-db.js
// Creates the development and test databases if they don't exist yet.
// Connects to the built-in "postgres" database to do it.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import pg from 'pg';

const dbName = (url) => new URL(url).pathname.slice(1);

async function createDatabases() {
  const devUrl = process.env.DATABASE_URL;
  const testEnv = parseEnv(await readFile(new URL('../.env.test', import.meta.url), 'utf8'));
  const names = [dbName(devUrl), dbName(testEnv.DATABASE_URL)];

  const adminUrl = new URL(devUrl);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();

  try {
    for (const name of names) {
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected database name "${name}".`);
      const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      if (rowCount) {
        console.log(`Database ${name} already exists.`);
      } else {
        await client.query(`CREATE DATABASE ${name}`);
        console.log(`Created database ${name}.`);
      }
    }
  } finally {
    await client.end();
  }
}

createDatabases().catch(err => {
  if (err.code === '28P01') {
    console.error('PostgreSQL rejected the password. Check PGPASSWORD in server/.env.');
  } else if (err.code === 'ECONNREFUSED') {
    console.error('Cannot connect to PostgreSQL on localhost:5432. Is the service running?');
  } else {
    console.error(err.message);
  }
  process.exitCode = 1;
});
