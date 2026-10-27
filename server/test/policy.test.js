// server/test/policy.test.js
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db.js';
import { TEST_PASSWORD, resetDb, createUser, closeDb } from './helpers.js';

// Mon 2 – Fri 6 March 2099 has no fixed public holidays
const WEEK = { from: '2099-03-02', to: '2099-03-06' };

let admin, alice, jane, asAdmin;

beforeEach(async () => {
  await resetDb();
  admin = await createUser({ name: 'Admin', role: 'admin' });
  alice = await createUser({ name: 'Alice', role: 'manager' });
  jane = await createUser({ name: 'Jane', role: 'employee', managerId: alice.id });
  asAdmin = await loginAs(admin);
});
after(closeDb);

async function loginAs(user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

const janeApplies = async (overrides = {}) =>
  (await loginAs(jane)).post('/api/requests').send({ type: 'Annual Leave', ...WEEK, reason: 'Trip', ...overrides });

const janesRequests = async () => (await (await loginAs(jane)).get('/api/requests')).body.requests;

const leaveTypeId = async (name) => (await pool.query('SELECT id FROM leave_types WHERE name = $1', [name])).rows[0].id;

test('everyone can read the policy; only admins can change it', async () => {
  const asJane = await loginAs(jane);
  const res = await asJane.get('/api/policy');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.leaveTypes.map(t => t.name), [
    'Annual Leave', 'Sick Leave', 'Maternity Leave', 'Paternity Leave', 'Compassionate Leave', 'Study Leave',
  ]);
  assert.deepEqual(res.body.holidays, []);

  assert.equal((await asJane.post('/api/policy/holidays').send({ date: '2099-03-04', name: 'X' })).status, 403);
  assert.equal((await asJane.patch(`/api/policy/leave-types/${await leaveTypeId('Annual Leave')}`).send({ entitlement: 99 })).status, 403);
  assert.equal((await request(app).get('/api/policy')).status, 401);
});

test('a new entitlement applies to balances straight away', async () => {
  await asAdmin.patch(`/api/policy/leave-types/${await leaveTypeId('Annual Leave')}`).send({ entitlement: 3 });

  const res = await janeApplies();
  assert.equal(res.status, 400);
  assert.match(res.body.error, /only have 3 days/);
});

test('admins can add a leave type, and staff can apply for it', async () => {
  const created = await asAdmin.post('/api/policy/leave-types').send({ name: 'Unpaid Leave', entitlement: 30, unit: 'working' });
  assert.equal(created.status, 201);
  assert.equal(created.body.leaveTypes.at(-1).name, 'Unpaid Leave');

  assert.equal((await janeApplies({ type: 'Unpaid Leave' })).status, 201);
});

test('duplicate leave type names are refused', async () => {
  const res = await asAdmin.post('/api/policy/leave-types').send({ name: 'Sick Leave', entitlement: 5, unit: 'working' });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /already a leave type/);
});

test('inactive leave types cannot be applied for but keep their existing requests', async () => {
  assert.equal((await janeApplies({ type: 'Study Leave' })).status, 201);

  await asAdmin.patch(`/api/policy/leave-types/${await leaveTypeId('Study Leave')}`).send({ active: false });

  const res = await janeApplies({ type: 'Study Leave', from: '2099-03-09', to: '2099-03-10' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /valid leave type/);
  assert.equal((await janesRequests())[0].type, 'Study Leave');
});

test('renaming a leave type renames it on existing requests', async () => {
  await janeApplies({ type: 'Study Leave' });
  await asAdmin.patch(`/api/policy/leave-types/${await leaveTypeId('Study Leave')}`).send({ name: 'Training Leave' });

  assert.equal((await janesRequests())[0].type, 'Training Leave');
});

test('the sick-note threshold comes from the policy', async () => {
  assert.equal((await janeApplies({ type: 'Sick Leave' })).status, 400); // 5 days, document required
  await asAdmin.patch(`/api/policy/leave-types/${await leaveTypeId('Sick Leave')}`).send({ attachmentRequiredOver: null });
  assert.equal((await janeApplies({ type: 'Sick Leave' })).status, 201);
});

test('a gazetted holiday is skipped when counting leave', async () => {
  await asAdmin.post('/api/policy/holidays').send({ date: '2099-03-04', name: 'Idd-ul-Fitr' });

  const res = await janeApplies();
  assert.equal(res.status, 201);
  assert.equal(res.body.request.days, 4);
});

test('adding a holiday recounts leave already booked over it, and says why in the history', async () => {
  assert.equal((await janeApplies()).body.request.days, 5);

  const res = await asAdmin.post('/api/policy/holidays').send({ date: '2099-03-04', name: 'Idd-ul-Fitr' });
  assert.equal(res.status, 201);
  assert.equal(res.body.recalculated, 1);

  const [booked] = await janesRequests();
  assert.equal(booked.days, 4);
  assert.equal(booked.status, 'Pending Manager Approval'); // unchanged
  assert.match(booked.history.at(-1).comment, /Days changed from 5 to 4: Idd-ul-Fitr \(2099-03-04\) was made a public holiday/);
  assert.equal(booked.history.at(-1).by, 'Admin (Admin)');

  // Removing it again puts the day back
  const removed = await asAdmin.delete(`/api/policy/holidays/${res.body.holidays[0].id}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.recalculated, 1);
  assert.equal((await janesRequests())[0].days, 5);
});

test('rejected and finished leave is not recounted', async () => {
  const booked = (await janeApplies()).body.request;
  await (await loginAs(alice)).post(`/api/requests/${booked.id}/decision`).send({ decision: 'reject', comment: 'No' });
  // Leave that ended in the past, inserted directly since it can't be applied for
  await pool.query(
    `INSERT INTO leave_requests (employee_id, applicant_role, leave_type, start_date, end_date, days, reason, status)
     VALUES ($1, 'employee', 'Annual Leave', '2020-03-02', '2020-03-06', 5, 'Old', 'Approved (Final)')`,
    [jane.id]
  );

  const first = await asAdmin.post('/api/policy/holidays').send({ date: '2099-03-04', name: 'Idd-ul-Fitr' });
  const second = await asAdmin.post('/api/policy/holidays').send({ date: '2020-03-04', name: 'Old holiday' });

  assert.equal(first.body.recalculated, 0);
  assert.equal(second.body.recalculated, 0);
  const days = (await pool.query('SELECT days FROM leave_requests ORDER BY id')).rows.map(r => r.days);
  assert.deepEqual(days, [5, 5]);
});

test('changing a leave type between working and calendar days recounts its open requests', async () => {
  await janeApplies({ from: '2099-03-02', to: '2099-03-08' }); // Mon–Sun: 5 working days
  const res = await asAdmin.patch(`/api/policy/leave-types/${await leaveTypeId('Annual Leave')}`).send({ unit: 'calendar' });

  assert.equal(res.body.recalculated, 1);
  assert.equal((await janesRequests())[0].days, 7);
});

test('holiday and leave type input is checked', async () => {
  assert.equal((await asAdmin.post('/api/policy/holidays').send({ date: '2099-02-30', name: 'X' })).status, 400);
  assert.equal((await asAdmin.post('/api/policy/holidays').send({ date: '2099-03-04', name: ' ' })).status, 400);
  await asAdmin.post('/api/policy/holidays').send({ date: '2099-03-04', name: 'Idd-ul-Fitr' });
  assert.equal((await asAdmin.post('/api/policy/holidays').send({ date: '2099-03-04', name: 'Duplicate' })).status, 409);
  assert.equal((await asAdmin.delete('/api/policy/holidays/999')).status, 404);

  assert.equal((await asAdmin.post('/api/policy/leave-types').send({ name: 'X', entitlement: -1, unit: 'working' })).status, 400);
  assert.equal((await asAdmin.post('/api/policy/leave-types').send({ name: 'X', entitlement: 5, unit: 'weeks' })).status, 400);
  assert.equal((await asAdmin.patch('/api/policy/leave-types/999').send({ entitlement: 5 })).status, 404);
});
