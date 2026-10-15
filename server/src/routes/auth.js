// server/src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import config from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import {
  SESSION_COOKIE, PUBLIC_USER_COLUMNS, toPublicUser, createSession, deleteSession,
} from '../auth/sessions.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

// Compared against when the email doesn't exist, so a wrong email takes as long
// as a wrong password and response times don't reveal which accounts exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

// Slow down password guessing: 10 attempts per 15 minutes per IP address
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: () => config.isTest,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

const cookieOptions = {
  httpOnly: true, // page JavaScript can't read it
  sameSite: 'lax',
  secure: config.isProduction, // HTTPS only once deployed
  path: '/',
};

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter a valid email and password.' });
  }
  const { email, password } = parsed.data;

  const { rows } = await query(
    `SELECT ${PUBLIC_USER_COLUMNS}, u.password_hash FROM users u WHERE u.email = $1 AND u.active`,
    [email]
  );
  const user = rows[0];
  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const { token, expiresAt } = await createSession(user.id);
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
  res.json({ user: toPublicUser(user) });
});

router.post('/logout', async (req, res) => {
  await deleteSession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
