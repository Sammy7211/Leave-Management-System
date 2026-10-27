-- Set when an admin creates an account or resets its password: the user must
-- choose their own password before they can use the system.
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
