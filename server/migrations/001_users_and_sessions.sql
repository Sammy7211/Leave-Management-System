-- Staff accounts. Emails are stored lowercase so logins are case-insensitive.
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  staff_no      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('employee', 'manager', 'hr', 'admin')),
  manager_id    INTEGER REFERENCES users(id),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Login sessions. Only a hash of the cookie token is stored, so a leaked
-- database can't be used to hijack sessions. Deleting a row logs that session out.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
