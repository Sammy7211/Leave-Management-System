// server/test/requests.test.js
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db.js';
import { TEST_PASSWORD, resetDb, createUser, closeDb } from './helpers.js';

// Mondays in 2099 with no public holidays that week, so Mon–Fri is 5 working days
const WEEK_1 = { from: '2099-03-02', to: '2099-03-06' };
const WEEK_2 = { from: '2099-03-09', to: '2099-03-13' };

let alice, bob, jane, otherManager, otherEmployee, admin;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ name: 'Alice', role: 'manager' });
  bob = await createUser({ name: 'Bob', role: 'hr', managerId: alice.id });
  jane = await createUser({ name: 'Jane', role: 'employee', managerId: alice.id });
  otherManager = await createUser({ name: 'Omar', role: 'manager' });
  otherEmployee = await createUser({ name: 'Otieno', role: 'employee', managerId: otherManager.id });
  admin = await createUser({ name: 'Admin', role: 'admin' });
});
after(closeDb);

async function loginAs(user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

const leave = (overrides = {}) => ({ type: 'Annual Leave', ...WEEK_1, reason: 'Family visit', ...overrides });

async function apply(user, overrides) {
  const agent = await loginAs(user);
  const res = await agent.post('/api/requests').send(leave(overrides));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.request;
}

async function decideAs(user, id, decision, comment = '') {
  const agent = await loginAs(user);
  return agent.post(`/api/requests/${id}/decision`).send({ decision, comment });
}

// --- Applying for leave ---

test('applying creates a request with server-computed days and starting status', async () => {
  const agent = await loginAs(jane);
  // The client's days and status are ignored; the server works them out
  const res = await agent.post('/api/requests').send({ ...leave(), days: 1, status: 'Approved (Final)' });

  assert.equal(res.status, 201);
  assert.deepEqual(
    { ...res.body.request, createdAt: undefined, history: undefined },
    {
      id: 1, employeeId: jane.id, staffNo: jane.staffNo, employee: 'Jane', role: 'Employee',
      type: 'Annual Leave', from: WEEK_1.from, to: WEEK_1.to, days: 5, reason: 'Family visit',
      attachment: null, status: 'Pending Manager Approval', createdAt: undefined, history: undefined,
    }
  );
  assert.equal(res.body.request.history.length, 1);
  assert.deepEqual(
    { ...res.body.request.history[0], at: undefined },
    { status: 'Pending Manager Approval', by: 'Jane (Employee)', comment: 'Submitted', at: undefined }
  );
});

test("a manager's own request goes straight to HR", async () => {
  const created = await apply(alice);
  assert.equal(created.status, 'Pending HR Approval');
  assert.equal(created.role, 'Manager');
});

test('admins cannot apply for leave', async () => {
  const agent = await loginAs(admin);
  assert.equal((await agent.post('/api/requests').send(leave())).status, 403);
});

test('you must be logged in', async () => {
  assert.equal((await request(app).get('/api/requests')).status, 401);
  assert.equal((await request(app).post('/api/requests').send(leave())).status, 401);
});

test('leave rules are enforced on the server', async () => {
  const agent = await loginAs(jane);
  const expectError = async (overrides, pattern) => {
    const res = await agent.post('/api/requests').send(leave(overrides));
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, pattern);
  };

  await expectError({ from: '2020-01-06', to: '2020-01-07' }, /past/);
  await expectError({ from: '2099-03-07', to: '2099-03-08' }, /no working days/); // a weekend
  await expectError({ from: WEEK_1.to, to: WEEK_1.from }, /end date/);
  await expectError({ from: '2099-02-30' }, /valid/);
  await expectError({ type: 'Holiday Leave' }, /leave type/);
  await expectError({ reason: '   ' }, /reason/);
  await expectError({ type: 'Sick Leave' }, /supporting document/); // 5 days of sick leave
  await expectError({ from: '2099-03-02', to: '2099-04-17' }, /only have 21 days/);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM leave_requests');
  assert.equal(rows[0].n, 0);
});

test('sick leave over two days is accepted with a supporting document', async () => {
  const created = await apply(jane, { type: 'Sick Leave', attachment: { name: 'doctors-note.pdf' } });
  assert.deepEqual(created.attachment, { name: 'doctors-note.pdf' });
});

test('overlapping requests are refused unless the earlier one was rejected', async () => {
  const first = await apply(jane);
  const agent = await loginAs(jane);

  const overlapping = await agent.post('/api/requests').send(leave({ from: '2099-03-04', to: '2099-03-10' }));
  assert.equal(overlapping.status, 400);
  assert.match(overlapping.body.error, /overlap/);

  await decideAs(alice, first.id, 'reject', 'Busy week');
  assert.equal((await agent.post('/api/requests').send(leave({ from: '2099-03-04', to: '2099-03-10' }))).status, 201);
});

test('pending and approved days count against the balance', async () => {
  await apply(jane, WEEK_1); // 5
  await apply(jane, WEEK_2); // 10
  await apply(jane, { from: '2099-03-16', to: '2099-03-20' }); // 15
  await apply(jane, { from: '2099-03-23', to: '2099-03-27' }); // 20

  const agent = await loginAs(jane);
  const res = await agent.post('/api/requests').send(leave({ from: '2099-06-08', to: '2099-06-09' }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /only have 1 days/);
  assert.equal((await agent.post('/api/requests').send(leave({ from: '2099-06-08', to: '2099-06-08' }))).status, 201);
});

test('simultaneous submissions cannot overspend the balance', async () => {
  const agent = await loginAs(jane);
  // Four 5-day requests would fit (20 of 21 days); fire five 5-day requests at once
  const weeks = ['2099-03-02', '2099-03-09', '2099-03-16', '2099-03-23', '2099-06-08'];
  const results = await Promise.all(weeks.map(from => {
    const to = from.slice(0, 8) + String(Number(from.slice(8)) + 4).padStart(2, '0');
    return agent.post('/api/requests').send(leave({ from, to }));
  }));

  assert.equal(results.filter(r => r.status === 201).length, 4);
  assert.equal(results.filter(r => r.status === 400).length, 1);
});

// --- Who sees what ---

test('employees see only their own requests; managers add their team; HR and admin see all', async () => {
  await apply(jane);
  await apply(bob);
  await apply(alice);
  await apply(otherEmployee);

  const namesSeenBy = async (user) => {
    const res = await (await loginAs(user)).get('/api/requests');
    assert.equal(res.status, 200);
    return res.body.requests.map(r => r.employee).sort();
  };

  assert.deepEqual(await namesSeenBy(jane), ['Jane']);
  assert.deepEqual(await namesSeenBy(alice), ['Alice', 'Bob', 'Jane']);
  assert.deepEqual(await namesSeenBy(otherManager), ['Otieno']);
  assert.deepEqual(await namesSeenBy(bob), ['Alice', 'Bob', 'Jane', 'Otieno']);
  assert.deepEqual(await namesSeenBy(admin), ['Alice', 'Bob', 'Jane', 'Otieno']);
});

// --- Decisions ---

test('full chain: manager recommends, HR approves, and history records each step', async () => {
  const created = await apply(jane);

  const recommended = await decideAs(alice, created.id, 'approve', 'Fine by me');
  assert.equal(recommended.status, 200);
  assert.equal(recommended.body.request.status, 'Pending HR Approval');

  const approved = await decideAs(bob, created.id, 'approve');
  assert.equal(approved.status, 200);
  assert.equal(approved.body.request.status, 'Approved (Final)');

  assert.deepEqual(
    approved.body.request.history.map(({ status, by, comment }) => ({ status, by, comment })),
    [
      { status: 'Pending Manager Approval', by: 'Jane (Employee)', comment: 'Submitted' },
      { status: 'Pending HR Approval', by: 'Alice (Manager)', comment: 'Fine by me' },
      { status: 'Approved (Final)', by: 'Bob (HR)', comment: '' },
    ]
  );
});

test('rejecting needs a reason', async () => {
  const created = await apply(jane);

  const noReason = await decideAs(alice, created.id, 'reject', '   ');
  assert.equal(noReason.status, 400);

  const withReason = await decideAs(alice, created.id, 'reject', 'Team is short-staffed');
  assert.equal(withReason.body.request.status, 'Rejected by Manager');
  assert.equal(withReason.body.request.history.at(-1).comment, 'Team is short-staffed');
});

test("another team's manager can't see or decide the request", async () => {
  const created = await apply(jane);
  const res = await decideAs(otherManager, created.id, 'approve');
  assert.equal(res.status, 404);
});

test('HR cannot approve before the manager has recommended', async () => {
  const created = await apply(jane);
  const res = await decideAs(bob, created.id, 'approve');
  assert.equal(res.status, 403);
});

test('employees cannot approve, even their own request', async () => {
  const created = await apply(jane);
  assert.equal((await decideAs(jane, created.id, 'approve')).status, 403);
});

test('a decided request cannot be decided again', async () => {
  const created = await apply(jane);
  await decideAs(alice, created.id, 'reject', 'No');
  assert.equal((await decideAs(admin, created.id, 'approve')).status, 409);
});

test('two reviewers acting at once: only one decision is recorded', async () => {
  const created = await apply(alice); // pending HR
  const hr2 = await createUser({ name: 'Second HR', role: 'hr' });
  const [a, b] = await Promise.all([loginAs(bob), loginAs(hr2)]);

  const results = await Promise.all([
    a.post(`/api/requests/${created.id}/decision`).send({ decision: 'approve' }),
    b.post(`/api/requests/${created.id}/decision`).send({ decision: 'reject', comment: 'No cover' }),
  ]);

  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM leave_request_history WHERE request_id = $1', [created.id]);
  assert.equal(rows[0].n, 2); // submitted + one decision
});

test('unknown or malformed request ids are 404', async () => {
  const agent = await loginAs(admin);
  assert.equal((await agent.post('/api/requests/999/decision').send({ decision: 'approve' })).status, 404);
  assert.equal((await agent.post('/api/requests/abc/decision').send({ decision: 'approve' })).status, 404);
});
