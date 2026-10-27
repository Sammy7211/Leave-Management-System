-- Leave types and gazetted public holidays, editable by admins.

CREATE TABLE leave_types (
  id                       SERIAL PRIMARY KEY,
  name                     TEXT NOT NULL UNIQUE,
  -- Days per calendar year
  entitlement              INTEGER NOT NULL CHECK (entitlement BETWEEN 0 AND 366),
  -- 'working' skips weekends and public holidays; 'calendar' counts every day
  unit                     TEXT NOT NULL CHECK (unit IN ('working', 'calendar')),
  -- A supporting document is required above this many days; NULL means never
  attachment_required_over INTEGER CHECK (attachment_required_over >= 0),
  -- Inactive types can't be applied for, but existing requests keep them
  active                   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order               INTEGER NOT NULL DEFAULT 0
);

-- Starting values, previously hard-coded in the app. Based on the Employment Act
-- minimums; confirm them against KALRO's HR policy.
INSERT INTO leave_types (name, entitlement, unit, attachment_required_over, sort_order) VALUES
  ('Annual Leave',        21, 'working',  NULL, 1),
  ('Sick Leave',          14, 'working',  2,    2),
  ('Maternity Leave',     90, 'calendar', NULL, 3),
  ('Paternity Leave',     14, 'calendar', NULL, 4),
  ('Compassionate Leave',  5, 'working',  NULL, 5),
  ('Study Leave',         10, 'working',  NULL, 6);

-- Every request must name a real leave type; renaming a type renames it on its requests too
ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_leave_type_fkey
  FOREIGN KEY (leave_type) REFERENCES leave_types (name) ON UPDATE CASCADE;

-- Holidays announced each year that can't be calculated, e.g. Idd-ul-Fitr or
-- one-off national days. Fixed-date holidays and Easter are worked out in code.
CREATE TABLE public_holidays (
  id   SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL
);

-- When a holiday is added after leave was booked, the request's days are
-- recalculated, which can bring a one-day request down to zero days
ALTER TABLE leave_requests DROP CONSTRAINT leave_requests_days_check;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_days_check CHECK (days >= 0);
