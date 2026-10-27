// server/src/middleware/auth.js
import { SESSION_COOKIE, getSessionUser } from '../auth/sessions.js';

// Attaches the logged-in user (or null) to every request
export async function authenticate(req, res, next) {
  req.user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  next();
}

// Any logged-in user, even one who still has to change their password.
// Only for the routes needed to do that: who am I, change password, log out.
export function requireSession(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  next();
}

// A logged-in user who has set their own password. Use for everything else.
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  if (req.user.mustChangePassword) {
    return res.status(403).json({ error: 'Please change your password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

// Usage: router.get('/x', requireRole('hr', 'admin'), handler)
export function requireRole(...roles) {
  return (req, res, next) => requireAuth(req, res, () => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  });
}
