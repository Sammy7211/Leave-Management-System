// server/src/routes/attachments.js
// Uploading supporting documents. The file is sent as the raw request body, with its
// name in the ?name= query parameter; it's linked to a leave request when that's submitted.
// Downloads are in routes/requests.js, where access to the request is checked.
import express, { Router } from 'express';
import { withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { MAX_ATTACHMENT_BYTES, checkFile, cleanFileName } from '../attachments/files.js';

const router = Router();

// Unlinked uploads (e.g. the form was abandoned) are deleted after a day, and each
// person can have only a few waiting at once, so uploads can't fill the database
const MAX_WAITING_UPLOADS = 10;

router.post(
  '/',
  requireAuth,
  express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }),
  async (req, res) => {
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot apply for leave.' });
    }
    const fileName = cleanFileName(req.query.name);
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const check = checkFile(body, fileName);
    if (check.error) return res.status(400).json({ error: check.error });

    const result = await withTransaction(async (db) => {
      await db.query(
        `DELETE FROM leave_attachments a
         WHERE a.created_at < now() - interval '1 day'
           AND NOT EXISTS (SELECT 1 FROM leave_requests r WHERE r.attachment_id = a.id)`
      );
      // Lock the user's row so parallel uploads are counted one at a time
      await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      const { rows: waiting } = await db.query(
        `SELECT count(*)::int AS n FROM leave_attachments a
         WHERE a.uploaded_by = $1 AND NOT EXISTS (SELECT 1 FROM leave_requests r WHERE r.attachment_id = a.id)`,
        [req.user.id]
      );
      if (waiting[0].n >= MAX_WAITING_UPLOADS) return { tooMany: true };

      const { rows } = await db.query(
        `INSERT INTO leave_attachments (uploaded_by, file_name, content_type, size_bytes, data)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.user.id, fileName, check.mime, body.length, body]
      );
      return { id: rows[0].id };
    });

    if (result.tooMany) {
      return res.status(429).json({ error: 'You have too many uploaded files waiting. Submit or cancel your leave request, then try again tomorrow.' });
    }
    res.status(201).json({ attachment: { id: result.id, name: fileName, size: body.length, type: check.mime } });
  }
);

export default router;
