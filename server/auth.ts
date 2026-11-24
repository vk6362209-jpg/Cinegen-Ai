import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { createId, db, DbUserRow, toUserPublic } from './db.ts';
import type { UserPublic } from '../src/types/cinegen.ts';

declare global {
  namespace Express {
    interface Request {
      user?: UserPublic;
      sessionToken?: string;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt
  );
  return token;
}

export function revokeSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function getUserBySessionToken(token: string): UserPublic | null {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token) as DbUserRow | undefined;
  return row ? toUserPublic(row) : null;
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const user = getUserBySessionToken(token);
  if (!user) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Administrator privileges required.' });
      return;
    }
    next();
  });
}

export function hasAnyAdminAccount(): boolean {
  const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as {
    count: number;
  };
  return row.count > 0;
}

export function isEnvAdminPasscodeConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
}

export function verifyEnvAdminPasscode(candidate: string): boolean {
  const envPass = process.env.ADMIN_PASSCODE?.trim();
  if (!envPass) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(envPass);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function registerNewUser(params: {
  email: string;
  name: string;
  password: string;
  role?: 'user' | 'admin';
  plan?: 'free' | 'basic' | 'pro' | 'premium';
  initialCredits?: number;
}): { user: UserPublic; token: string } {
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    throw new Error('An account with this email already exists.');
  }
  const id = createId('usr');
  const passwordHash = hashPassword(params.password);
  const role = params.role ?? 'user';
  const plan = params.plan ?? 'free';
  const credits = params.initialCredits ?? 100;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, plan, credits)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, normalizedEmail, params.name.trim(), passwordHash, role, plan, credits);

    db.prepare(
      `INSERT INTO credit_transactions (id, user_id, amount, balance_after, type, description)
       VALUES (?, ?, ?, ?, 'grant', ?)`
    ).run(createId('ctx'), id, credits, credits, 'Welcome starter credits');
  });
  tx();

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUserRow;
  const token = createSession(id);
  return { user: toUserPublic(row), token };
}
