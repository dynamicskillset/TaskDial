import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db';

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: string;
  ver: number;       // token_version
  iat: number;
  exp: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error('JWT_SECRET is not set in environment');
  }
  return secret;
}

export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.access_token;

  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // DB check: is_active, token_version, not deleted
  const user = getDb().prepare(
    'SELECT id, email, role, is_active, token_version, deleted_at FROM users WHERE id = ?'
  ).get(payload.sub) as {
    id: string; email: string; role: string;
    is_active: number; token_version: number; deleted_at: string | null;
  } | undefined;

  if (!user || !user.is_active || user.deleted_at || user.token_version !== payload.ver) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  req.user = { id: user.id, email: user.email, role: user.role, tokenVersion: user.token_version };
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

export function signAccessToken(user: { id: string; email: string; role: string; token_version: number }): string {
  const expiresIn = parseInt(process.env.JWT_ACCESS_EXPIRES || '3600', 10);
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, ver: user.token_version },
    getJwtSecret(),
    { expiresIn }
  );
}
