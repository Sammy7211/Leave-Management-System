// server/test/auth.test.js
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import app from '../src/app.js';
import { requireRole } from '../src/middleware/auth.js';
import { pool } from '../src/db.js';
import { TEST_PASSWORD, resetDb, createUser, closeDb } from './helpers.js';

beforeEach(resetDb);
after(closeDb);

// A supertest agent keeps cookies between requests, like a browser
async function loginAs(user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

test('logging in sets an httpOnly session cookie and returns the user', async () => {
  const user = await createUser({ name: 'Jane', role: 'employee' });

  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.user, {
    id: user.id, staffNo: user.staffNo, name: 'Jane', email: user.email, role: 'employee', managerId: null,
    mustChangePassword: false,
  });
  const cookie = res.headers['set-cookie'][0];
  assert.match(cookie, /^sid=/);
  assert.match(cookie, /HttpOnly/);
});

test('email is case-insensitive', async () => {
  const user = await createUser();
  const res = await request(app).post('/api/auth/login').send({ email: user.email.toUpperCase(), password: TEST_PASSWORD });
  assert.equal(res.status, 200);
});

test('wrong password and unknown email get the same error', async () => {
  const user = await createUser();

  const wrongPassword = await request(app).post('/api/auth/login').send({ email: user.email, password: 'nope' });
  const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'nope' });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(wrongPassword.body, unknownEmail.body);
});

test('disabled accounts cannot log in', async () => {
  const user = await createUser({ active: false });
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(res.status, 401);
});

test('malformed login requests get a 400', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
  assert.equal(res.status, 400);
});

test('/me returns the logged-in user and never the password hash', async () => {
  const user = await createUser();
  const agent = await loginAs(user);

  const res = await agent.get('/api/auth/me');

  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, user.id);
  assert.equal(JSON.stringify(res.body).includes('password'), false);
});

test('/me without a session is 401', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
});

test('logout ends the session on the server', async () => {
  const user = await createUser();
  const agent = await loginAs(user);

  assert.equal((await agent.post('/api/auth/logout')).status, 204);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM sessions');
  assert.equal(rows[0].n, 0);
});

test('disabling an account ends its existing sessions', async () => {
  const user = await createUser();
  const agent = await loginAs(user);

  await pool.query('UPDATE users SET active = FALSE WHERE id = $1', [user.id]);

  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('expired sessions are rejected', async () => {
  const user = await createUser();
  const agent = await loginAs(user);

  await pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");

  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('requireRole allows listed roles and blocks others', async () => {
  const hr = await createUser({ role: 'hr' });
  const employee = await createUser({ role: 'employee' });

  // A throwaway route on a copy of the app's middleware stack
  const guarded = express();
  guarded.use(app);
  guarded.get('/guarded', requireRole('hr', 'admin'), (req, res) => res.json({ ok: true }));

  const asHr = request.agent(guarded);
  await asHr.post('/api/auth/login').send({ email: hr.email, password: TEST_PASSWORD });
  const asEmployee = request.agent(guarded);
  await asEmployee.post('/api/auth/login').send({ email: employee.email, password: TEST_PASSWORD });

  assert.equal((await asHr.get('/guarded')).status, 200);
  assert.equal((await asEmployee.get('/guarded')).status, 403);
  assert.equal((await request(guarded).get('/guarded')).status, 401);
});

// --- Changing your password ---

test('changing your password: old one stops working, other sessions are logged out', async () => {
  const user = await createUser();
  const laptop = await loginAs(user);
  const phone = await loginAs(user);

  const res = await laptop.post('/api/auth/password').send({ currentPassword: TEST_PASSWORD, newPassword: 'a-brand-new-password' });

  assert.equal(res.status, 200);
  assert.equal((await laptop.get('/api/auth/me')).status, 200); // this session stays logged in
  assert.equal((await phone.get('/api/auth/me')).status, 401); // others are logged out
  assert.equal((await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status, 401);
  assert.equal((await request(app).post('/api/auth/login').send({ email: user.email, password: 'a-brand-new-password' })).status, 200);
});

test('changing your password needs the correct current password and a valid new one', async () => {
  const user = await createUser();
  const agent = await loginAs(user);
  const change = (body) => agent.post('/api/auth/password').send(body);

  assert.match((await change({ currentPassword: 'wrong', newPassword: 'a-brand-new-password' })).body.error, /incorrect/);
  assert.match((await change({ currentPassword: TEST_PASSWORD, newPassword: 'short' })).body.error, /at least 8/);
  assert.match((await change({ currentPassword: TEST_PASSWORD, newPassword: 'x'.repeat(73) })).body.error, /at most 72/);
  assert.match((await change({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })).body.error, /different/);
});

test('a user with a temporary password can only change it until they do', async () => {
  const user = await createUser({ mustChangePassword: true });
  const agent = await loginAs(user);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.mustChangePassword, true);

  const blocked = await agent.get('/api/requests');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');

  await agent.post('/api/auth/password').send({ currentPassword: TEST_PASSWORD, newPassword: 'my-own-password' });
  assert.equal((await agent.get('/api/requests')).status, 200);
  assert.equal((await agent.get('/api/auth/me')).body.user.mustChangePassword, false);
});
