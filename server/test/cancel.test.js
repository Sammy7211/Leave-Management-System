// server/test/cancel.test.js
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db.js';
import { TEST_PASSWORD, resetDb, createUser, closeDb } from './helpers.js';

const WEEK = { type: 'Annual Leave', from: '2099-03-02', to: '2099-03-06', reason: 'Trip' }; // 5 days

let admin, alice, bob, jane, otieno;

beforeEach(async () => {
  await resetDb();
  admin = await createUser({ name: 'Admin', role: 'admin' });
  alice = await createUser({ name: 'Alice', role: 'manager' });
  bob = await createUser({ name: 'Bob', role: 'hr', managerId: alice.id });
  jane = await createUser({ name: 'Jane', role: 'employee', managerId: alice.id });
  otieno = await createUser({ name: 'Otieno', role: 'employee', managerId: alice.id });
});
after(closeDb);

async function loginAs(user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

async function janeApplies(body = WEEK) {
  const res = await (await loginAs(jane)).post('/api/requests').send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.request;
}

async function approved() {
  const r = await janeApplies();
  await (await loginAs(alice)).post(`/api/requests/${r.id}/decision`).send({ decision: 'approve' });
  await (await loginAs(bob)).post(`/api/requests/${r.id}/decision`).send({ decision: 'approve' });
  return r;
}

const cancel = async (user, id, comment) => (await loginAs(user)).post(`/api/requests/${id}/cancel`).send({ comment });

const annualBalance = async () => {
  const res = await (await loginAs(jane)).post('/api/requests').send({ ...WEEK, from: '2099-06-08', to: '2099-07-17' }); // 30 days: too many
  return res.body.error;
};

test('a pending request can be withdrawn, with no reason needed', async () => {
  const r = await janeApplies();

  const res = await cancel(jane, r.id);

  assert.equal(res.status, 200);
  assert.equal(res.body.request.status, 'Withdrawn');
  assert.deepEqual(
    { ...res.body.request.history.at(-1), at: undefined },
    { status: 'Withdrawn', by: 'Jane (Employee)', comment: '', at: undefined }
  );
});

test('approved leave can be cancelled before it starts, with a reason', async () => {
  const r = await approved();

  const noReason = await cancel(jane, r.id, '  ');
  assert.equal(noReason.status, 400);
  assert.match(noReason.body.error, /say why/);

  const res = await cancel(jane, r.id, 'Trip postponed');
  assert.equal(res.status, 200);
  assert.equal(res.body.request.status, 'Cancelled');
  assert.equal(res.body.request.history.at(-1).comment, 'Trip postponed');
});

test('withdrawn and cancelled days go back to the balance, and the dates are free again', async () => {
  const r1 = await approved();
  assert.match(await annualBalance(), /only have 16 days/);

  await cancel(jane, r1.id, 'Plans changed');
  assert.match(await annualBalance(), /only have 21 days/);

  await janeApplies(); // same dates as the cancelled leave
});

test('leave that has started cannot be cancelled here', async () => {
  const { rows } = await pool.query(
    `INSERT INTO leave_requests (employee_id, applicant_role, leave_type, start_date, end_date, days, reason, status)
     VALUES ($1, 'employee', 'Annual Leave', current_date, current_date + 3, 4, 'Started', 'Approved (Final)') RETURNING id`,
    [jane.id]
  );
  const res = await cancel(jane, rows[0].id, 'Back early');
  assert.equal(res.status, 409);
  assert.match(res.body.error, /contact HR/);
});

test('rejected, withdrawn and cancelled requests cannot be cancelled again', async () => {
  const r = await janeApplies();
  await cancel(jane, r.id);
  assert.equal((await cancel(jane, r.id)).status, 409);

  const r2 = await janeApplies({ ...WEEK, from: '2099-03-09', to: '2099-03-13' });
  await (await loginAs(alice)).post(`/api/requests/${r2.id}/decision`).send({ decision: 'reject', comment: 'No' });
  assert.equal((await cancel(jane, r2.id)).status, 409);
});

test("only the applicant (or an admin) can cancel; others can't, or can't even see it", async () => {
  const r = await janeApplies();

  assert.equal((await cancel(alice, r.id)).status, 403); // line manager can see it but not cancel
  assert.equal((await cancel(bob, r.id)).status, 403);
  assert.equal((await cancel(otieno, r.id)).status, 404);

  const res = await cancel(admin, r.id, 'Jane asked by phone');
  assert.equal(res.status, 200);
  assert.equal(res.body.request.history.at(-1).by, 'Admin (Admin)');
});

test('a withdrawn request can no longer be approved', async () => {
  const r = await janeApplies();
  await cancel(jane, r.id);
  const res = await (await loginAs(alice)).post(`/api/requests/${r.id}/decision`).send({ decision: 'approve' });
  assert.equal(res.status, 409);
});

test('a new holiday does not recount withdrawn or cancelled leave', async () => {
  const r = await janeApplies();
  await cancel(jane, r.id);
  const res = await (await loginAs(admin)).post('/api/policy/holidays').send({ date: '2099-03-04', name: 'Idd-ul-Fitr' });
  assert.equal(res.body.recalculated, 0);
});
