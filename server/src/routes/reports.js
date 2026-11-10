// server/src/routes/reports.js
// CSV reports for HR and admins, built from the database rather than whatever a browser has loaded.
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { handle, parseBody } from '../http.js';
import { getBalances } from '../../../src/shared/leaveRules.js';
import { loadPolicy } from '../leave/policy.js';
import { ROLE_LABELS } from '../leave/workflow.js';
import { formatDateTime, sendCsv } from '../reports/csv.js';

const router = Router();
router.use(requireRole('hr', 'admin'));

const yearSchema = z.object({
  year: z.coerce.number({ error: 'Choose a valid year.' }).int().min(2000, 'Choose a valid year.').max(2100, 'Choose a valid year.')
    .default(() => new Date().getFullYear()),
});

// A request belongs to the year it starts in, as in the balance rules
const yearRange = (year) => [`${year}-01-01`, `${year}-12-31`];

// GET /api/reports/requests.csv?year=2026: every leave request starting in that year
router.get('/requests.csv', handle(async (req, res) => {
  const { year } = parseBody(yearSchema, req.query);
  const { rows } = await query(
    `SELECT r.*, u.staff_no, u.name, m.name AS manager_name, att.file_name AS att_name,
            last.actor_name, last.actor_role, last.comment, last.created_at AS last_at
     FROM leave_requests r
     JOIN users u ON u.id = r.employee_id
     LEFT JOIN users m ON m.id = u.manager_id
     LEFT JOIN leave_attachments att ON att.id = r.attachment_id
     LEFT JOIN LATERAL (
       SELECT actor_name, actor_role, comment, created_at FROM leave_request_history h
       WHERE h.request_id = r.id ORDER BY h.id DESC LIMIT 1
     ) last ON TRUE
     WHERE r.start_date BETWEEN $1 AND $2
     ORDER BY r.start_date, u.name, r.id`,
    yearRange(year)
  );

  sendCsv(res, `leave-requests-${year}.csv`, [
    ['Staff No', 'Name', 'Role', 'Line Manager', 'Leave Type', 'From', 'To', 'Days', 'Status',
      'Reason', 'Attachment', 'Submitted', 'Last Action By', 'Last Action At', 'Last Comment'],
    ...rows.map(r => [
      r.staff_no, r.name, ROLE_LABELS[r.applicant_role], r.manager_name ?? '', r.leave_type,
      r.start_date, r.end_date, r.days, r.status, r.reason, r.att_name ?? r.attachment_name ?? '',
      formatDateTime(r.created_at),
      r.actor_name ? `${r.actor_name} (${ROLE_LABELS[r.actor_role]})` : '',
      r.last_at ? formatDateTime(r.last_at) : '',
      r.comment ?? '',
    ]),
  ]);
}));

// GET /api/reports/balances.csv?year=2026: taken, pending and remaining days per
// active staff member (admins excluded, as they can't apply) and active leave type
router.get('/balances.csv', handle(async (req, res) => {
  const { year } = parseBody(yearSchema, req.query);
  const [policy, staff, requests] = await Promise.all([
    loadPolicy({ query }),
    query(
      `SELECT u.id, u.staff_no, u.name, u.role, m.name AS manager_name
       FROM users u LEFT JOIN users m ON m.id = u.manager_id
       WHERE u.active AND u.role <> 'admin'
       ORDER BY u.name`
    ),
    query(
      `SELECT employee_id AS "employeeId", leave_type AS type, start_date AS "from", days, status
       FROM leave_requests WHERE start_date BETWEEN $1 AND $2`,
      yearRange(year)
    ),
  ]);

  const types = policy.leaveTypes.filter(t => t.active);
  sendCsv(res, `leave-balances-${year}.csv`, [
    ['Staff No', 'Name', 'Role', 'Line Manager',
      ...types.flatMap(t => [`${t.name} Entitlement`, `${t.name} Taken`, `${t.name} Pending`, `${t.name} Remaining`])],
    ...staff.rows.map(u => [
      u.staff_no, u.name, ROLE_LABELS[u.role], u.manager_name ?? '',
      ...getBalances(requests.rows, u.id, year, policy)
        .flatMap(b => [b.entitlement, b.used, b.pending, Math.max(b.remaining, 0)]),
    ]),
  ]);
}));

export default router;
