// server/src/auth/sessions.js
import { createHash, randomBytes } from 'node:crypto';
import { query } from '../db.js';
import config from '../config.js';

export const SESSION_COOKIE = 'sid';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// Columns safe to send to the browser (never the password hash)
export const PUBLIC_USER_COLUMNS = 'u.id, u.staff_no, u.name, u.email, u.role, u.manager_id, u.must_change_password';

export const toPublicUser = (row) => ({
  id: row.id,
  staffNo: row.staff_no,
  name: row.name,
  email: row.email,
  role: row.role,
  managerId: row.manager_id,
  mustChangePassword: row.must_change_password,
});

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionHours * 60 * 60 * 1000);
  await query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, expiresAt]
  );
  return { token, expiresAt };
}

// The logged-in user for a session token, or null if it's unknown, expired or the account is disabled
export async function getSessionUser(token) {
  if (!token) return null;
  const { rows } = await query(
    `SELECT ${PUBLIC_USER_COLUMNS}
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
    [hashToken(token)]
  );
  return rows[0] ? toPublicUser(rows[0]) : null;
}

// Logs a user out everywhere, optionally keeping one session (e.g. the one changing the password)
export async function deleteUserSessions(userId, { exceptToken } = {}) {
  await query(
    'DELETE FROM sessions WHERE user_id = $1 AND token_hash IS DISTINCT FROM $2',
    [userId, exceptToken ? hashToken(exceptToken) : null]
  );
}

export async function deleteSession(token) {
  if (!token) return;
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}
