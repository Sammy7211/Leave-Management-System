// server/test/reports.test.js
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { toCsv } from '../src/reports/csv.js';
import { TEST_PASSWORD, resetDb, createUser, closeDb } from './helpers.js';

let admin, alice, bob, jane;

beforeEach(async () => {
  await resetDb();
  admin = await createUser({ name: 'Admin', role: 'admin' });
  alice = await createUser({ name: 'Alice', role: 'manager' });
  bob = await createUser({ name: 'Bob', role: 'hr', managerId: alice.id });
  jane = await createUser({ name: 'Jane', role: 'employee', managerId: alice.id });
});
after(closeDb);

async function loginAs(user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

async function apply(user, body) {
  const res = await (await loginAs(user)).post('/api/requests').send({ type: 'Annual Leave', reason: 'Trip', ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.request;
}

// Parses our CSV output (every field quoted) into arrays, for checking
function parseCsv(text) {
  assert.ok(text.startsWith('\uFEFF'), 'starts with a byte order mark for Excel');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.slice(1);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r' && s[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
  }
  const [header, ...data] = rows;
  return data.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const download = async (agent, path) => {
  const res = await agent.get(path).buffer(true).parse((r, cb) => {
    let data = '';
    r.setEncoding('utf8');
    r.on('data', chunk => { data += chunk; });
    r.on('end', () => cb(null, data));
  });
  return res;
};

test('only HR and admins can download reports', async () => {
  assert.equal((await (await loginAs(jane)).get('/api/reports/requests.csv')).status, 403);
  assert.equal((await (await loginAs(alice)).get('/api/reports/balances.csv')).status, 403);
  assert.equal((await request(app).get('/api/reports/requests.csv')).status, 401);
  assert.equal((await download(await loginAs(bob), '/api/reports/requests.csv?year=2099')).status, 200);
  assert.equal((await download(await loginAs(admin), '/api/reports/balances.csv?year=2099')).status, 200);
});

test('requests report lists the year\'s requests with their latest decision', async () => {
  const r1 = await apply(jane, { from: '2099-03-02', to: '2099-03-06', reason: 'Family visit' });
  await (await loginAs(alice)).post(`/api/requests/${r1.id}/decision`).send({ decision: 'approve', comment: 'Enjoy' });
  await apply(alice, { from: '2099-06-01', to: '2099-06-02' });
  await apply(jane, { from: '2098-03-02', to: '2098-03-03' }); // different year

  const res = await download(await loginAs(admin), '/api/reports/requests.csv?year=2099');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /leave-requests-2099\.csv/);
  const rows = parseCsv(res.body);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { ...rows[0], Submitted: undefined, 'Last Action At': undefined },
    {
      'Staff No': jane.staffNo, Name: 'Jane', Role: 'Employee', 'Line Manager': 'Alice', 'Leave Type': 'Annual Leave',
      From: '2099-03-02', To: '2099-03-06', Days: '5', Status: 'Pending HR Approval', Reason: 'Family visit',
      Attachment: '', Submitted: undefined, 'Last Action By': 'Alice (Manager)', 'Last Action At': undefined, 'Last Comment': 'Enjoy',
    }
  );
  assert.match(rows[0].Submitted, /^\d{4}-\d\d-\d\d \d\d:\d\d$/);
  assert.equal(rows[1].Name, 'Alice');
  assert.equal(rows[1].Role, 'Manager');
});

test('balances report shows each active staff member\'s days per leave type', async () => {
  const r1 = await apply(jane, { from: '2099-03-02', to: '2099-03-06' }); // 5 days
  await (await loginAs(alice)).post(`/api/requests/${r1.id}/decision`).send({ decision: 'approve' });
  await (await loginAs(bob)).post(`/api/requests/${r1.id}/decision`).send({ decision: 'approve' });
  await apply(jane, { from: '2099-06-08', to: '2099-06-09' }); // 2 days pending (Mon–Tue)
  await createUser({ name: 'Gone', role: 'employee', active: false });

  const rows = parseCsv((await download(await loginAs(bob), '/api/reports/balances.csv?year=2099')).body);

  assert.deepEqual(rows.map(r => r.Name), ['Alice', 'Bob', 'Jane']); // no admin, no deactivated staff
  const janeRow = rows.find(r => r.Name === 'Jane');
  assert.equal(janeRow['Line Manager'], 'Alice');
  assert.equal(janeRow['Annual Leave Entitlement'], '21');
  assert.equal(janeRow['Annual Leave Taken'], '5');
  assert.equal(janeRow['Annual Leave Pending'], '2');
  assert.equal(janeRow['Annual Leave Remaining'], '14');
  assert.equal(janeRow['Sick Leave Remaining'], '14');
});

test('an invalid year is refused', async () => {
  const agent = await loginAs(admin);
  assert.equal((await agent.get('/api/reports/requests.csv?year=abc')).status, 400);
  assert.equal((await agent.get('/api/reports/balances.csv?year=1990')).status, 400);
});

test('CSV quoting keeps commas, quotes and line breaks inside their cell', () => {
  const csv = toCsv([['A', 'B'], ['one, two', 'she said "hi"\nthen left']]);
  assert.equal(csv, '\uFEFF"A","B"\r\n"one, two","she said ""hi""\nthen left"\r\n');
});

test('values that Excel would run as formulas are made plain text', async () => {
  await apply(jane, { from: '2099-03-02', to: '2099-03-03', reason: '=HYPERLINK("http://evil.example","Click")' });
  const [row] = parseCsv((await download(await loginAs(admin), '/api/reports/requests.csv?year=2099')).body);
  assert.equal(row.Reason, `'=HYPERLINK("http://evil.example","Click")`);

  assert.equal(toCsv([['-1+2', '@SUM(A1)', '+x', 'fine', -5]]), `\uFEFF"'-1+2","'@SUM(A1)","'+x","fine","-5"\r\n`);
});
