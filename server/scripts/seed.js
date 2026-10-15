// server/scripts/seed.js
// Creates (or resets) the four demo accounts for local development.
// Safe to run repeatedly. All accounts get the password from SEED_PASSWORD.
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const DEMO_USERS = [
  { staffNo: 'EMP001', name: 'Alice', email: 'manager@example.com', role: 'manager' },
  { staffNo: 'EMP002', name: 'Bob', email: 'hr@example.com', role: 'hr' },
  { staffNo: 'EMP003', name: 'Jane Employee', email: 'employee@example.com', role: 'employee' },
  { staffNo: 'EMP004', name: 'Admin User', email: 'admin@example.com', role: 'admin' },
];

async function seed() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Set SEED_PASSWORD in .env (at least 8 characters) before seeding.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to create demo accounts in production.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  for (const u of DEMO_USERS) {
    await pool.query(
      `INSERT INTO users (staff_no, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
         SET staff_no = EXCLUDED.staff_no, name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, active = TRUE`,
      [u.staffNo, u.name, u.email, passwordHash, u.role]
    );
  }

  // Alice manages the employee and HR staff
  await pool.query(
    `UPDATE users SET manager_id = (SELECT id FROM users WHERE staff_no = 'EMP001')
     WHERE staff_no IN ('EMP002', 'EMP003')`
  );

  console.log(`Seeded ${DEMO_USERS.length} demo accounts:`);
  DEMO_USERS.forEach(u => console.log(`  ${u.email} (${u.role})`));
}

seed()
  .catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
