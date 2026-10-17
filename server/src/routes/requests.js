// server/src/routes/requests.js
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { LEAVE_TYPES, countLeaveDays, todayISO, validateLeaveRequest } from '../../../src/shared/leaveRules.js';
import { ROLE_LABELS, canView, decide, initialStatus } from '../leave/workflow.js';

const router = Router();
router.use(requireAuth);

// A request with its applicant and full history, in the shape the React app uses
const REQUEST_SELECT = `
  SELECT r.*, u.name AS employee_name, u.staff_no, u.manager_id AS applicant_manager_id,
    COALESCE((
      SELECT json_agg(json_build_object(
        'status', h.status, 'actorName', h.actor_name, 'actorRole', h.actor_role,
        'comment', h.comment, 'at', h.created_at
      ) ORDER BY h.id)
      FROM leave_request_history h WHERE h.request_id = r.id
    ), '[]') AS history
  FROM leave_requests r
  JOIN users u ON u.id = r.employee_id`;

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
  attachment: row.attachment_name ? { name: row.attachment_name } : null,
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
  type: z.enum(Object.keys(LEAVE_TYPES), { error: 'Choose a valid leave type.' }),
  from: isoDate,
  to: isoDate,
  reason: z.string().trim().min(1, 'Please give a reason.').max(1000, 'The reason is too long (1000 characters maximum).'),
  attachment: z.object({ name: z.string().trim().min(1).max(255) }).nullish(),
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

    const errors = validateLeaveRequest(form, { requests: existing, employeeId: applicant.id, today: todayISO() });
    if (errors.length) return { errors };

    const status = initialStatus(applicant.role);
    const { rows } = await db.query(
      `INSERT INTO leave_requests
         (employee_id, applicant_role, leave_type, start_date, end_date, days, reason, attachment_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [applicant.id, applicant.role, form.type, form.from, form.to,
        countLeaveDays(form.type, form.from, form.to), form.reason, form.attachment?.name ?? null, status]
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

export default router;
