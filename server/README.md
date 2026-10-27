# Leave Management API

Node/Express API with a PostgreSQL database. The React app (in the folder above) talks to it through `/api`.

## First-time setup

1. **Install PostgreSQL** (version 16 or later) from <https://www.postgresql.org/download/windows/>.
   Keep the default port 5432 and remember the password you set for the `postgres` user.

2. **Create your settings file.** In this `server` folder, copy `.env.example` to `.env` and fill in:
   - `PGPASSWORD` — the `postgres` password from step 1;
   - `SEED_PASSWORD` — the password you want the demo accounts to have (8+ characters).

   `.env` is ignored by git. Never commit it or share its contents. (`.env.test` holds no
   secrets: tests load `.env` first, then `.env.test` switches to the test database.)

3. **Install, create the databases and tables, and add the demo accounts:**

   ```
   cd server
   npm install
   npm run db:create
   npm run migrate
   npm run seed
   ```

   `db:create` makes `leave_dev` and `leave_test`. `leave_test` is wiped every time the
   tests run, so never point it at real data.

## Running

You need two terminals:

| Terminal | Folder | Command | What it runs |
|---|---|---|---|
| 1 | `server` | `npm run dev` | API on http://localhost:4000 (restarts when you save a file) |
| 2 | project root | `npm start` | React app on http://localhost:3000 |

Log in with any demo account — `employee@example.com`, `manager@example.com`, `hr@example.com`
or `admin@example.com` — using the `SEED_PASSWORD` from your `.env`.

## Tests

```
cd server
npm test
```

This applies migrations to `leave_test` (database settings from `.env`, overridden by `.env.test`) and runs every `*.test.js` file with Node's built-in test runner.

## Changing the database

Never edit a migration that has already been applied. Add a new numbered file to `migrations/`
(e.g. `002_leave_requests.sql`) and run `npm run migrate`.

## API

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/health` | anyone | Server is up |
| POST | `/api/auth/login` | anyone | `{ email, password }` → sets session cookie, returns `{ user }` |
| POST | `/api/auth/logout` | anyone | Ends the session |
| GET | `/api/auth/me` | logged in | Returns `{ user }` for the current session |
| POST | `/api/auth/password` | logged in | `{ currentPassword, newPassword }`; logs out the user's other sessions |
| GET | `/api/requests` | logged in | Requests the user may see: own; managers add direct reports; HR and admin see all |
| POST | `/api/requests` | employee, manager, HR | `{ type, from, to, reason, attachment? }`; server computes days and status |
| POST | `/api/requests/:id/decision` | reviewer | `{ decision: 'approve' \| 'reject', comment }`; comment required to reject |
| GET | `/api/users` | admin | All staff accounts |
| POST | `/api/users` | admin | `{ staffNo, name, email, role, managerId, temporaryPassword }` |
| PATCH | `/api/users/:id` | admin | Any of `{ staffNo, name, email, role, managerId, active }` |
| POST | `/api/users/:id/reset-password` | admin | `{ temporaryPassword }`; logs the user out everywhere |

Users whose password was set by an admin get `403` with `code: "PASSWORD_CHANGE_REQUIRED"`
from every route except `me`, `password` and `logout` until they choose their own.
