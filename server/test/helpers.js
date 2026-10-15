// server/test/helpers.js
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

export const TEST_PASSWORD = 'correct-horse-battery';

// Low bcrypt cost keeps the tests fast; production hashes use cost 12
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

if (!/test/i.test(process.env.DATABASE_URL || '')) {
  throw new Error('Tests wipe the database: DATABASE_URL in .env.test must point at a database with "test" in its name.');
}

export async function resetDb() {
  await pool.query('TRUNCATE users, sessions RESTART IDENTITY CASCADE');
}

let counter = 0;
export async function createUser(overrides = {}) {
  counter++;
  const user = {
    staffNo: `T${counter}`,
    name: `Test User ${counter}`,
    email: `user${counter}@example.com`,
    role: 'employee',
    active: true,
    managerId: null,
    ...overrides,
  };
  const { rows } = await pool.query(
    `INSERT INTO users (staff_no, name, email, password_hash, role, active, manager_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [user.staffNo, user.name, user.email, passwordHash, user.role, user.active, user.managerId]
  );
  return { ...user, id: rows[0].id };
}

export const closeDb = () => pool.end();
