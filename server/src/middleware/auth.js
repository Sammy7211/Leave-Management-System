// server/src/middleware/auth.js
import { SESSION_COOKIE, getSessionUser } from '../auth/sessions.js';

// Attaches the logged-in user (or null) to every request
export async function authenticate(req, res, next) {
  req.user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  next();
}

// Usage: router.get('/x', requireRole('hr', 'admin'), handler)
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}
