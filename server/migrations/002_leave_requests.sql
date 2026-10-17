-- Leave requests and their status history.

CREATE TABLE leave_requests (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES users(id),
  -- The applicant's role when they applied; decides who reviews the request
  applicant_role  TEXT NOT NULL CHECK (applicant_role IN ('employee', 'manager', 'hr')),
  leave_type      TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL CHECK (end_date >= start_date),
  days            INTEGER NOT NULL CHECK (days > 0),
  reason          TEXT NOT NULL,
  -- Name of the supporting document; the file itself is uploaded in a later phase
  attachment_name TEXT,
  status          TEXT NOT NULL CHECK (status IN (
                    'Pending Manager Approval', 'Pending HR Approval',
                    'Approved by Manager', 'Approved (Final)',
                    'Rejected by Manager', 'Rejected (Final)'
                  )),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX leave_requests_employee_id_idx ON leave_requests (employee_id);
CREATE INDEX leave_requests_status_idx ON leave_requests (status);

-- One row per status change: who made it, when, and why. Rows are never edited.
-- The actor's name and role are copied in, so history stays accurate if they later change.
CREATE TABLE leave_request_history (
  id         SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  actor_id   INTEGER REFERENCES users(id),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  comment    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX leave_request_history_request_id_idx ON leave_request_history (request_id);
