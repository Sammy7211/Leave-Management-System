// server/src/routes/policy.js
// Leave types and gazetted public holidays. Everyone can read them; only admins change them.
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, handle, parseBody, parseId } from '../http.js';
import { loadPolicy, recalculateOpenRequests } from '../leave/policy.js';

const router = Router();

const friendlyDbError = (err) => {
  if (err.code === '23505' && err.constraint === 'leave_types_name_key') {
    return new HttpError(409, 'There is already a leave type with that name.');
  }
  if (err.code === '23505' && err.constraint === 'public_holidays_date_key') {
    return new HttpError(409, 'There is already a holiday on that date.');
  }
  return err;
};
const adminHandle = (fn) => handle(fn, friendlyDbError);

// GET /api/policy: { leaveTypes, holidays }
router.get('/', requireAuth, async (req, res) => {
  res.json(await loadPolicy({ query }));
});

const leaveTypeFields = {
  name: z.string().trim().min(1, 'Enter a name.').max(60, 'Names are at most 60 characters.'),
  entitlement: z.number({ error: 'Enter the days per year as a number.' }).int().min(0).max(366, 'At most 366 days per year.'),
  unit: z.enum(['working', 'calendar'], { error: 'Choose working days or calendar days.' }),
  attachmentRequiredOver: z.number().int().min(0).nullable(),
  active: z.boolean(),
};
const createLeaveTypeSchema = z.object({
  ...leaveTypeFields,
  attachmentRequiredOver: leaveTypeFields.attachmentRequiredOver.default(null),
  active: leaveTypeFields.active.default(true),
});
const updateLeaveTypeSchema = z.object(leaveTypeFields).partial();

// POST /api/policy/leave-types
router.post('/leave-types', requireRole('admin'), adminHandle(async (req, res) => {
  const t = parseBody(createLeaveTypeSchema, req.body);
  await query(
    `INSERT INTO leave_types (name, entitlement, unit, attachment_required_over, active, sort_order)
     VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(sort_order), 0) + 1 FROM leave_types))`,
    [t.name, t.entitlement, t.unit, t.attachmentRequiredOver, t.active]
  );
  res.status(201).json(await loadPolicy({ query }));
}));

// PATCH /api/policy/leave-types/:id. Changing the unit recounts that type's open requests.
router.patch('/leave-types/:id', requireRole('admin'), adminHandle(async (req, res) => {
  const id = parseId(req.params.id, 'Leave type not found.');
  const changes = parseBody(updateLeaveTypeSchema, req.body);

  const result = await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM leave_types WHERE id = $1 FOR UPDATE', [id]);
    const current = rows[0];
    if (!current) throw new HttpError(404, 'Leave type not found.');

    const next = {
      name: changes.name ?? current.name,
      entitlement: changes.entitlement ?? current.entitlement,
      unit: changes.unit ?? current.unit,
      attachmentRequiredOver: changes.attachmentRequiredOver !== undefined
        ? changes.attachmentRequiredOver : current.attachment_required_over,
      active: changes.active ?? current.active,
    };
    await db.query(
      `UPDATE leave_types SET name = $1, entitlement = $2, unit = $3, attachment_required_over = $4, active = $5
       WHERE id = $6`,
      [next.name, next.entitlement, next.unit, next.attachmentRequiredOver, next.active, id]
    );

    const policy = await loadPolicy(db);
    const recalculated = next.unit === current.unit ? 0 : await recalculateOpenRequests(
      db, policy, req.user,
      `${next.name} now counts ${next.unit === 'calendar' ? 'calendar days' : 'working days'}.`,
      { leaveType: next.name }
    );
    return { ...policy, recalculated };
  });
  res.json(result);
}));

const holidaySchema = z.object({
  date: z.iso.date({ error: 'Enter a valid date.' }),
  name: z.string().trim().min(1, 'Enter the holiday name.').max(100, 'Names are at most 100 characters.'),
});

// POST /api/policy/holidays: add a gazetted holiday; booked leave over that date is recounted
router.post('/holidays', requireRole('admin'), adminHandle(async (req, res) => {
  const h = parseBody(holidaySchema, req.body);
  const result = await withTransaction(async (db) => {
    await db.query('INSERT INTO public_holidays (date, name) VALUES ($1, $2)', [h.date, h.name]);
    const policy = await loadPolicy(db);
    const recalculated = await recalculateOpenRequests(db, policy, req.user, `${h.name} (${h.date}) was made a public holiday.`);
    return { ...policy, recalculated };
  });
  res.status(201).json(result);
}));

// DELETE /api/policy/holidays/:id: e.g. a holiday entered on the wrong date
router.delete('/holidays/:id', requireRole('admin'), adminHandle(async (req, res) => {
  const id = parseId(req.params.id, 'Holiday not found.');
  const result = await withTransaction(async (db) => {
    const { rows } = await db.query('DELETE FROM public_holidays WHERE id = $1 RETURNING date, name', [id]);
    if (!rows[0]) throw new HttpError(404, 'Holiday not found.');
    const policy = await loadPolicy(db);
    const recalculated = await recalculateOpenRequests(
      db, policy, req.user, `${rows[0].name} (${rows[0].date}) is no longer a public holiday.`
    );
    return { ...policy, recalculated };
  });
  res.json(result);
}));

export default router;
