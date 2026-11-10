// server/src/routes/requests.js
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { countLeaveDays, todayISO, validateLeaveRequest } from '../../../src/shared/leaveRules.js';
import { loadPolicy } from '../leave/policy.js';
import { ROLE_LABELS, canView, decide, initialStatus } from '../leave/workflow.js';
import { attachmentDisposition } from '../attachments/files.js';

const router = Router();
router.use(requireAuth);

// A request with its applicant and full history, in the shape the React app uses
const REQUEST_SELECT = `
  SELECT r.*, u.name AS employee_name, u.staff_no, u.manager_id AS applicant_manager_id,
    att.file_name AS att_name, att.content_type AS att_type, att.size_bytes AS att_size,
    COALESCE((
      SELECT json_agg(json_build_object(
        'status', h.status, 'actorName', h.actor_name, 'actorRole', h.actor_role,
        'comment', h.comment, 'at', h.created_at
      ) ORDER BY h.id)
      FROM leave_request_history h WHERE h.request_id = r.id
    ), '[]') AS history
  FROM leave_requests r
  JOIN users u ON u.id = r.employee_id
  LEFT JOIN leave_attachments att ON att.id = r.attachment_id`;

// The document's details (never its contents). Requests from before uploads existed
// may have only a file name, with no file stored.
const toApiAttachment = (row) => {
  if (row.attachment_id) return { id: row.attachment_id, name: row.att_name, size: row.att_size, type: row.att_type };
  if (row.attachment_name) return { id: null, name: row.attachment_name };
  return null;
};

const toApiRequest = (row) => ({
  id: row.id,
  employeeId: row.employee_id,
  staffNo: row.staff_no,
  employee: row.employee_name,
  role: ROLE_LABELS[row.applicant_role],
  type: row.leave_type,
  from: row.start_date,
  to: row.end_date,
  days: row.days,
  reason: row.reason,
  attachment: toApiAttachment(row),
  status: row.status,
  createdAt: row.created_at,
  history: row.history.map(h => ({
    status: h.status,
    by: `${h.actorName} (${ROLE_LABELS[h.actorRole]})`,
    at: h.at,
    comment: h.comment,
  })),
});

// Fields the workflow needs, from a REQUEST_SELECT row
const toWorkflowRequest = (row) => ({
  employeeId: row.employee_id,
  applicantManagerId: row.applicant_manager_id,
  applicantRole: row.applicant_role,
  status: row.status,
});

const findRequest = async (db, id, { lock = false } = {}) => {
  const { rows } = await db.query(`${REQUEST_SELECT} WHERE r.id = $1 ${lock ? 'FOR UPDATE OF r' : ''}`, [id]);
  return rows[0];
};

const addHistory = (db, requestId, status, actor, comment = '') => db.query(
  `INSERT INTO leave_request_history (request_id, status, actor_id, actor_name, actor_role, comment)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [requestId, status, actor.id, actor.name, actor.role, comment]
);

// GET /api/requests: everything the user may see.
// Employees see their own; managers also see their team's; HR and admins see all.
router.get('/', async (req, res) => {
  const { id, role } = req.user;
  const seesAll = role === 'hr' || role === 'admin';
  const { rows } = await query(
    `${REQUEST_SELECT}
     ${seesAll ? '' : 'WHERE r.employee_id = $1 OR u.manager_id = $1'}
     ORDER BY r.start_date DESC, r.id DESC`,
    seesAll ? [] : [id]
  );
  res.json({ requests: rows.map(toApiRequest) });
});

const isoDate = z.iso.date({ error: 'Dates must be valid and in YYYY-MM-DD format.' });

const createSchema = z.object({
  type: z.string({ error: 'Choose a valid leave type.' }).trim().min(1, 'Choose a valid leave type.'), // checked against the policy below
  from: isoDate,
  to: isoDate,
  reason: z.string().trim().min(1, 'Please give a reason.').max(1000, 'The reason is too long (1000 characters maximum).'),
  // From POST /api/attachments, uploaded just before submitting
  attachmentId: z.number({ error: 'Invalid attachment.' }).int().positive().nullish(),
});

// POST /api/requests: apply for leave. The server works out the days and the
// starting status, and checks the same rules the form does.
router.post('/', async (req, res) => {
  if (req.user.role === 'admin') {
    return res.status(403).json({ error: 'Admin accounts cannot apply for leave.' });
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const form = parsed.data;
  const applicant = req.user;

  const created = await withTransaction(async (db) => {
    // Lock the applicant's row so two submissions at once can't both pass the balance check
    await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [applicant.id]);
    const { rows: existing } = await db.query(
      `SELECT employee_id AS "employeeId", leave_type AS type, start_date AS "from",
              end_date AS "to", days, status
       FROM leave_requests WHERE employee_id = $1`,
      [applicant.id]
    );

    // The document must be one this user uploaded that isn't already on another request
    let attachment = null;
    if (form.attachmentId) {
      const { rows: found } = await db.query(
        `SELECT a.id FROM leave_attachments a
         WHERE a.id = $1 AND a.uploaded_by = $2
           AND NOT EXISTS (SELECT 1 FROM leave_requests r WHERE r.attachment_id = a.id)
         FOR UPDATE`,
        [form.attachmentId, applicant.id]
      );
      if (!found[0]) return { errors: ['The attached file could not be found. Please attach it again.'] };
      attachment = found[0];
    }

    const policy = await loadPolicy(db);
    const errors = validateLeaveRequest(
      { ...form, attachment },
      { requests: existing, employeeId: applicant.id, policy, today: todayISO() }
    );
    if (errors.length) return { errors };

    const status = initialStatus(applicant.role);
    const { rows } = await db.query(
      `INSERT INTO leave_requests
         (employee_id, applicant_role, leave_type, start_date, end_date, days, reason, attachment_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [applicant.id, applicant.role, form.type, form.from, form.to,
        countLeaveDays(form.type, form.from, form.to, policy), form.reason, attachment?.id ?? null, status]
    );
    await addHistory(db, rows[0].id, status, applicant, 'Submitted');
    return { request: await findRequest(db, rows[0].id) };
  });

  if (created.errors) {
    return res.status(400).json({ error: created.errors[0], errors: created.errors });
  }
  res.status(201).json({ request: toApiRequest(created.request) });
});

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject'], { error: 'Decision must be "approve" or "reject".' }),
  comment: z.string().trim().max(1000, 'The comment is too long (1000 characters maximum).').default(''),
});

// POST /api/requests/:id/decision: approve or reject. The server decides what
// status that leads to, based on who is acting and where the request is in the chain.
router.post('/:id/decision', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Request not found.' });

  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { decision, comment } = parsed.data;
  if (decision === 'reject' && !comment) {
    return res.status(400).json({ error: 'Please give a reason for rejecting this request.' });
  }

  const result = await withTransaction(async (db) => {
    // Locking the row means two reviewers clicking at once can't both act on it
    const row = await findRequest(db, id, { lock: true });
    if (!row || !canView(req.user, toWorkflowRequest(row))) {
      return { error: 'Request not found.', httpStatus: 404 };
    }

    const outcome = decide({ actor: req.user, request: toWorkflowRequest(row), decision });
    if (outcome.error) return outcome;

    await db.query('UPDATE leave_requests SET status = $1, updated_at = now() WHERE id = $2', [outcome.status, id]);
    await addHistory(db, id, outcome.status, req.user, comment);
    return { request: await findRequest(db, id) };
  });

  if (result.error) return res.status(result.httpStatus).json({ error: result.error });
  res.json({ request: toApiRequest(result.request) });
});

// GET /api/requests/:id/attachment: download the supporting document. Only people who
// can see the request may, and every download is logged (sick notes are health data).
router.get('/:id/attachment', async (req, res) => {
  const id = Number(req.params.id);
  const row = Number.isInteger(id) && id > 0 ? await findRequest({ query }, id) : null;
  if (!row || !canView(req.user, toWorkflowRequest(row)) || !row.attachment_id) {
    return res.status(404).json({ error: 'Document not found.' });
  }

  const { rows } = await query('SELECT file_name, content_type, data FROM leave_attachments WHERE id = $1', [row.attachment_id]);
  await query('INSERT INTO attachment_access_log (attachment_id, user_id) VALUES ($1, $2)', [row.attachment_id, req.user.id]);

  res.set({
    'Content-Type': rows[0].content_type,
    // Always download rather than open in the browser, and never cache health data
    'Content-Disposition': attachmentDisposition(rows[0].file_name),
    'Cache-Control': 'no-store',
  });
  res.send(rows[0].data);
});

export default router;
