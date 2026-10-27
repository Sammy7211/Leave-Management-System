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
  await pool.query(`TRUNCATE users, sessions, leave_requests, leave_request_history, public_holidays, leave_types
                    RESTART IDENTITY CASCADE`);
  // The same starting leave types as migration 004
  await pool.query(`
    INSERT INTO leave_types (name, entitlement, unit, attachment_required_over, sort_order) VALUES
      ('Annual Leave', 21, 'working', NULL, 1), ('Sick Leave', 14, 'working', 2, 2),
      ('Maternity Leave', 90, 'calendar', NULL, 3), ('Paternity Leave', 14, 'calendar', NULL, 4),
      ('Compassionate Leave', 5, 'working', NULL, 5), ('Study Leave', 10, 'working', NULL, 6)`);
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
    mustChangePassword: false,
    ...overrides,
  };
  const { rows } = await pool.query(
    `INSERT INTO users (staff_no, name, email, password_hash, role, active, manager_id, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [user.staffNo, user.name, user.email, passwordHash, user.role, user.active, user.managerId, user.mustChangePassword]
  );
  return { ...user, id: rows[0].id };
}

export const closeDb = () => pool.end();
