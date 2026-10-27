// server/src/routes/users.js
// Staff accounts, managed by admins.
import { Router } from 'express';
import { z } from 'zod';
import { withTransaction, query } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { deleteUserSessions } from '../auth/sessions.js';
import { hashPassword, passwordSchema } from '../auth/passwords.js';

const router = Router();
router.use(requireRole('admin'));

const ROLES = ['employee', 'manager', 'hr', 'admin'];
// Only these roles have a line manager; managers' own leave goes to HR
const ROLES_WITH_MANAGER = ['employee', 'hr'];

const USER_SELECT = `
  SELECT u.id, u.staff_no, u.name, u.email, u.role, u.manager_id, u.active,
         u.must_change_password, u.created_at, m.name AS manager_name
  FROM users u LEFT JOIN users m ON m.id = u.manager_id`;

const toApiUser = (row) => ({
  id: row.id,
  staffNo: row.staff_no,
  name: row.name,
  email: row.email,
  role: row.role,
  managerId: row.manager_id,
  managerName: row.manager_name,
  active: row.active,
  mustChangePassword: row.must_change_password,
  createdAt: row.created_at,
});

const fields = {
  staffNo: z.string().trim().min(1, 'Enter a staff number.').max(20, 'Staff numbers are at most 20 characters.'),
  name: z.string().trim().min(1, 'Enter a name.').max(100, 'Names are at most 100 characters.'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  role: z.enum(ROLES, { error: 'Choose a valid role.' }),
  managerId: z.number().int().positive().nullable(),
  active: z.boolean(),
};

const createSchema = z.object({
  staffNo: fields.staffNo,
  name: fields.name,
  email: fields.email,
  role: fields.role,
  managerId: fields.managerId.default(null),
  temporaryPassword: passwordSchema,
});

const updateSchema = z.object({
  staffNo: fields.staffNo,
  name: fields.name,
  email: fields.email,
  role: fields.role,
  managerId: fields.managerId,
  active: fields.active,
}).partial();

const resetPasswordSchema = z.object({ temporaryPassword: passwordSchema });

// Thrown inside a transaction to roll it back and send a specific error
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const parseId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'User not found.');
  return id;
};

const parseBody = (schema, body) => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  return parsed.data;
};

// Checks a user's role / line manager / active combination is allowed
async function checkUserRules(db, { id, role, managerId, active }) {
  if (managerId !== null) {
    if (!ROLES_WITH_MANAGER.includes(role)) {
      throw new HttpError(400, 'Only employees and HR staff have a line manager.');
    }
    if (managerId === id) {
      throw new HttpError(400, 'Someone cannot be their own line manager.');
    }
    const { rows } = await db.query('SELECT role, active FROM users WHERE id = $1', [managerId]);
    if (!rows[0] || !rows[0].active || rows[0].role !== 'manager') {
      throw new HttpError(400, 'The line manager must be an active user with the Manager role.');
    }
  }

  // A manager who still has active staff can't stop being a manager, or the
  // staff's requests would have nobody to review them
  if (id && (role !== 'manager' || !active)) {
    const { rows } = await db.query(
      'SELECT count(*)::int AS n FROM users WHERE manager_id = $1 AND active',
      [id]
    );
    if (rows[0].n > 0) {
      throw new HttpError(409, `This person is the line manager of ${rows[0].n} active staff. Assign them a new line manager first.`);
    }
  }
}

// Unique constraint violations get a readable message
function friendlyDbError(err) {
  if (err.code === '23505') {
    if (err.constraint === 'users_email_key') return new HttpError(409, 'Another account already uses that email address.');
    if (err.constraint === 'users_staff_no_key') return new HttpError(409, 'Another account already uses that staff number.');
  }
  return err;
}

const findUser = async (db, id) => (await db.query(`${USER_SELECT} WHERE u.id = $1`, [id])).rows[0];

// Wraps a handler so HttpErrors become JSON responses
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const e = friendlyDbError(err);
    if (!(e instanceof HttpError)) throw e;
    res.status(e.status).json({ error: e.message });
  }
};

// GET /api/users: everyone, active first, by name
router.get('/', async (req, res) => {
  const { rows } = await query(`${USER_SELECT} ORDER BY u.active DESC, u.name`);
  res.json({ users: rows.map(toApiUser) });
});

// POST /api/users: create an account with a temporary password the user must change
router.post('/', handle(async (req, res) => {
  const input = parseBody(createSchema, req.body);
  const passwordHash = await hashPassword(input.temporaryPassword);

  const created = await withTransaction(async (db) => {
    await checkUserRules(db, { id: null, role: input.role, managerId: input.managerId, active: true });
    const { rows } = await db.query(
      `INSERT INTO users (staff_no, name, email, password_hash, role, manager_id, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
      [input.staffNo, input.name, input.email, passwordHash, input.role, input.managerId]
    );
    return findUser(db, rows[0].id);
  });
  res.status(201).json({ user: toApiUser(created) });
}));

// PATCH /api/users/:id: change any of staff number, name, email, role, line manager, active
router.patch('/:id', handle(async (req, res) => {
  const id = parseId(req.params.id);
  const changes = parseBody(updateSchema, req.body);

  if (id === req.user.id && ((changes.role && changes.role !== 'admin') || changes.active === false)) {
    throw new HttpError(400, 'You cannot remove your own admin access or deactivate your own account.');
  }

  const updated = await withTransaction(async (db) => {
    // Lock the row so two admins editing at once can't break the rules between them
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id]);
    const current = rows[0];
    if (!current) throw new HttpError(404, 'User not found.');

    const next = {
      staffNo: changes.staffNo ?? current.staff_no,
      name: changes.name ?? current.name,
      email: changes.email ?? current.email,
      role: changes.role ?? current.role,
      managerId: changes.managerId !== undefined ? changes.managerId : current.manager_id,
      active: changes.active ?? current.active,
    };
    // Changing to a role without a line manager clears it, unless one was given explicitly
    if (!ROLES_WITH_MANAGER.includes(next.role) && changes.managerId === undefined) {
      next.managerId = null;
    }
    await checkUserRules(db, { id, ...next });

    await db.query(
      `UPDATE users SET staff_no = $1, name = $2, email = $3, role = $4, manager_id = $5, active = $6
       WHERE id = $7`,
      [next.staffNo, next.name, next.email, next.role, next.managerId, next.active, id]
    );
    if (!next.active) await db.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    return findUser(db, id);
  });
  res.json({ user: toApiUser(updated) });
}));

// POST /api/users/:id/reset-password: set a temporary password and log the user out everywhere
router.post('/:id/reset-password', handle(async (req, res) => {
  const id = parseId(req.params.id);
  const { temporaryPassword } = parseBody(resetPasswordSchema, req.body);
  if (id === req.user.id) {
    throw new HttpError(400, 'Use "Change password" to change your own password.');
  }

  const { rowCount } = await query(
    'UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2',
    [await hashPassword(temporaryPassword), id]
  );
  if (!rowCount) throw new HttpError(404, 'User not found.');
  await deleteUserSessions(id);
  res.json({ user: toApiUser(await findUser({ query }, id)) });
}));

export default router;
