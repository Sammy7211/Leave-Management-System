// server/test/attachments.test.js
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db.js';
import { cleanFileName } from '../src/attachments/files.js';
import { TEST_PASSWORD, resetDb, createUser, closeDb } from './helpers.js';

// Small files with the right "magic number" at the start
const PDF = Buffer.from('%PDF-1.4\n% a tiny test document\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest of image')]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....[Content_Types].xml....word/document.xml')]);

// Mon–Fri, 5 working days: needs a document for sick leave
const SICK_WEEK = { type: 'Sick Leave', from: '2099-03-02', to: '2099-03-06', reason: 'Flu' };

let admin, alice, bob, jane, omar, otieno;

beforeEach(async () => {
  await resetDb();
  admin = await createUser({ name: 'Admin', role: 'admin' });
  alice = await createUser({ name: 'Alice', role: 'manager' });
  bob = await createUser({ name: 'Bob', role: 'hr', managerId: alice.id });
  jane = await createUser({ name: 'Jane', role: 'employee', managerId: alice.id });
  omar = await createUser({ name: 'Omar', role: 'manager' });
  otieno = await createUser({ name: 'Otieno', role: 'employee', managerId: omar.id });
});
after(closeDb);

async function loginAs(user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

const upload = (agent, content, name) => agent
  .post(`/api/attachments?name=${encodeURIComponent(name)}`)
  .set('Content-Type', 'application/octet-stream')
  .send(content);

// Collects a binary response body into a Buffer
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function janeSubmitsSickNote() {
  const agent = await loginAs(jane);
  const uploaded = await upload(agent, PDF, 'sick note.pdf');
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  const created = await agent.post('/api/requests').send({ ...SICK_WEEK, attachmentId: uploaded.body.attachment.id });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.request;
}

test('a sick note is uploaded, linked to the request and shown with it', async () => {
  const agent = await loginAs(jane);
  const uploaded = await upload(agent, PDF, 'sick note.pdf');

  assert.equal(uploaded.status, 201);
  assert.deepEqual(uploaded.body.attachment, { id: 1, name: 'sick note.pdf', size: PDF.length, type: 'application/pdf' });

  const created = await agent.post('/api/requests').send({ ...SICK_WEEK, attachmentId: 1 });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.request.attachment, { id: 1, name: 'sick note.pdf', size: PDF.length, type: 'application/pdf' });
});

test('sick leave over the limit still needs a document', async () => {
  const res = await (await loginAs(jane)).post('/api/requests').send(SICK_WEEK);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /supporting document/);
});

test('only PDF, images and Word documents are accepted, checked by their contents', async () => {
  const agent = await loginAs(jane);
  const expectRefused = async (content, name, pattern) => {
    const res = await upload(agent, content, name);
    assert.equal(res.status, 400, `${name}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error, pattern);
  };

  await expectRefused(Buffer.from('<script>alert(1)</script>'), 'note.pdf', /Only PDF/); // not really a PDF
  await expectRefused(Buffer.from('MZ\x90\x00 an exe'), 'program.exe', /Only PDF/);
  await expectRefused(PDF, 'note.png', /don't match its name/); // a PDF renamed .png
  await expectRefused(Buffer.alloc(0), 'empty.pdf', /empty/);

  assert.equal((await upload(agent, PNG, 'photo.PNG')).status, 201);
  assert.equal((await upload(agent, DOCX, 'letter.docx')).status, 201);
});

test('files over 5 MB are refused', async () => {
  const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
  const res = await upload(await loginAs(jane), big, 'big.pdf');
  assert.equal(res.status, 413);
  assert.match(res.body.error, /5 MB/);
});

test("you can't attach someone else's upload, or reuse one already on a request", async () => {
  const theirs = await upload(await loginAs(otieno), PDF, 'theirs.pdf');
  const asJane = await loginAs(jane);

  const stolen = await asJane.post('/api/requests').send({ ...SICK_WEEK, attachmentId: theirs.body.attachment.id });
  assert.equal(stolen.status, 400);
  assert.match(stolen.body.error, /could not be found/);

  const first = await janeSubmitsSickNote();
  const reused = await asJane.post('/api/requests').send({ ...SICK_WEEK, from: '2099-03-09', to: '2099-03-13', attachmentId: first.attachment.id });
  assert.equal(reused.status, 400);
});

test('the applicant, their line manager, HR and admins can download it; others cannot', async () => {
  const created = await janeSubmitsSickNote();
  const path = `/api/requests/${created.id}/attachment`;

  for (const user of [jane, alice, bob, admin]) {
    const res = await (await loginAs(user)).get(path).buffer(true).parse(binary);
    assert.equal(res.status, 200, user.name);
    assert.ok(res.body.equals(PDF), 'returns the exact file');
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.match(res.headers['content-disposition'], /^attachment; filename="sick note.pdf"/);
    assert.equal(res.headers['cache-control'], 'no-store');
  }

  for (const user of [omar, otieno]) {
    assert.equal((await (await loginAs(user)).get(path)).status, 404, user.name);
  }
  assert.equal((await request(app).get(path)).status, 401);
});

test('every download is logged', async () => {
  const created = await janeSubmitsSickNote();
  await (await loginAs(bob)).get(`/api/requests/${created.id}/attachment`);
  await (await loginAs(alice)).get(`/api/requests/${created.id}/attachment`);
  await (await loginAs(omar)).get(`/api/requests/${created.id}/attachment`); // refused, so not logged

  const { rows } = await pool.query(
    'SELECT u.name FROM attachment_access_log l JOIN users u ON u.id = l.user_id ORDER BY l.id'
  );
  assert.deepEqual(rows.map(r => r.name), ['Bob', 'Alice']);
});

test('requests without a document give 404 on download', async () => {
  const res = await (await loginAs(jane)).post('/api/requests').send({ type: 'Annual Leave', from: '2099-03-02', to: '2099-03-03', reason: 'Trip' });
  assert.equal((await (await loginAs(jane)).get(`/api/requests/${res.body.request.id}/attachment`)).status, 404);
});

test('abandoned uploads are cleaned up after a day, and waiting uploads are capped', async () => {
  const agent = await loginAs(jane);
  await upload(agent, PDF, 'old.pdf');
  await pool.query("UPDATE leave_attachments SET created_at = now() - interval '2 days'");
  await upload(agent, PDF, 'new.pdf'); // triggers the clean-up
  const { rows } = await pool.query('SELECT file_name FROM leave_attachments');
  assert.deepEqual(rows.map(r => r.file_name), ['new.pdf']);

  for (let i = 0; i < 9; i++) await upload(agent, PDF, `extra${i}.pdf`); // 10 waiting now
  const res = await upload(agent, PDF, 'one-too-many.pdf');
  assert.equal(res.status, 429);
});

test('linked documents are never cleaned up', async () => {
  await janeSubmitsSickNote();
  await pool.query("UPDATE leave_attachments SET created_at = now() - interval '30 days'");
  await upload(await loginAs(jane), PNG, 'trigger.png');
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM leave_attachments');
  assert.equal(rows[0].n, 2);
});

test('file names are cleaned', () => {
  assert.equal(cleanFileName('C:\\Users\\jane\\Desktop\\note.pdf'), 'note.pdf');
  assert.equal(cleanFileName('../../etc/passwd'), 'passwd');
  assert.equal(cleanFileName('bad"name<>.pdf'), 'badname.pdf');
  assert.equal(cleanFileName('   '), 'document');
  assert.equal(cleanFileName(`${'a'.repeat(200)}.pdf`), `${'a'.repeat(96)}.pdf`);
});

test('non-English file names download correctly', async () => {
  const agent = await loginAs(jane);
  const uploaded = await upload(agent, PDF, 'barua ya daktari – Wanjirũ.pdf');
  const created = await agent.post('/api/requests').send({ ...SICK_WEEK, attachmentId: uploaded.body.attachment.id });
  const res = await agent.get(`/api/requests/${created.body.request.id}/attachment`);
  assert.match(res.headers['content-disposition'], /filename\*=UTF-8''barua%20ya%20daktari%20%E2%80%93%20Wanjir%C5%A9\.pdf/);
});
