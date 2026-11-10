// server/src/leave/policy.js
// Loads the leave policy (leave types + gazetted holidays) and keeps booked leave in step with it.
import { countLeaveDays, todayISO } from '../../../src/shared/leaveRules.js';

export const toApiLeaveType = (row) => ({
  id: row.id,
  name: row.name,
  entitlement: row.entitlement,
  unit: row.unit,
  attachmentRequiredOver: row.attachment_required_over,
  active: row.active,
});

// The policy in the shape src/shared/leaveRules.js expects
export async function loadPolicy(db) {
  const [types, holidays] = await Promise.all([
    db.query('SELECT * FROM leave_types ORDER BY sort_order, id'),
    db.query('SELECT id, date, name FROM public_holidays ORDER BY date'),
  ]);
  return {
    leaveTypes: types.rows.map(toApiLeaveType),
    holidays: holidays.rows,
  };
}

// Recounts the days of leave that hasn't finished yet (and wasn't rejected, withdrawn or cancelled) after the
// policy changes, e.g. a holiday is gazetted inside someone's booked leave. Each change
// is recorded in the request's history. Only requests of `leaveType` if given.
// Returns how many requests changed.
export async function recalculateOpenRequests(db, policy, actor, reason, { leaveType } = {}) {
  const { rows } = await db.query(
    `SELECT id, leave_type, start_date, end_date, days, status
     FROM leave_requests
     WHERE end_date >= $1 AND status NOT LIKE '%Rejected%' AND status NOT IN ('Withdrawn', 'Cancelled')
       AND ($2::text IS NULL OR leave_type = $2)
     FOR UPDATE`,
    [todayISO(), leaveType ?? null]
  );

  let changed = 0;
  for (const r of rows) {
    const days = countLeaveDays(r.leave_type, r.start_date, r.end_date, policy);
    if (days === r.days) continue;
    await db.query('UPDATE leave_requests SET days = $1, updated_at = now() WHERE id = $2', [days, r.id]);
    await db.query(
      `INSERT INTO leave_request_history (request_id, status, actor_id, actor_name, actor_role, comment)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [r.id, r.status, actor.id, actor.name, actor.role, `Days changed from ${r.days} to ${days}: ${reason}`]
    );
    changed++;
  }
  return changed;
}
