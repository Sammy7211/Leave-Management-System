-- Supporting documents (e.g. sick notes). Stored in the database so they are backed up
-- with everything else and protected by the same access checks. Files are uploaded first,
-- then linked to a request when it is submitted; unlinked uploads are cleaned up after a day.
CREATE TABLE leave_attachments (
  id           SERIAL PRIMARY KEY,
  uploaded_by  INTEGER NOT NULL REFERENCES users(id),
  file_name    TEXT NOT NULL,
  -- Worked out from the file's contents, not trusted from the browser
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL CHECK (size_bytes > 0),
  data         BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX leave_attachments_uploaded_by_idx ON leave_attachments (uploaded_by);

-- Each request has at most one document, and a document belongs to at most one request
ALTER TABLE leave_requests ADD COLUMN attachment_id INTEGER UNIQUE REFERENCES leave_attachments(id);

-- Who opened which document and when. Sick notes are health data under Kenya's
-- Data Protection Act, so access to them is recorded.
CREATE TABLE attachment_access_log (
  id            SERIAL PRIMARY KEY,
  attachment_id INTEGER NOT NULL REFERENCES leave_attachments(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  accessed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX attachment_access_log_attachment_id_idx ON attachment_access_log (attachment_id);
