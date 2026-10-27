// server/src/auth/passwords.js
import bcrypt from 'bcryptjs';
import { z } from 'zod';

// bcrypt only uses the first 72 bytes of a password, so longer ones are refused
// rather than silently cut short
export const passwordSchema = z.string()
  .min(8, 'Passwords must be at least 8 characters.')
  .refine(p => Buffer.byteLength(p) <= 72, 'Passwords must be at most 72 characters.');

export const hashPassword = (password) => bcrypt.hash(password, 12);
