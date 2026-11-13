import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export type Permission =
  | 'dashboard.view'
  | 'pos.sell'
  | 'pos.discount'
  | 'pos.cancel_order'
  | 'orders.manage'
  | 'inventory.view'
  | 'inventory.manage'
  | 'menu.manage'
  | 'reports.view'
  | 'reports.export'
  | 'users.manage'
  | 'settings.manage'
  | 'backups.manage';

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'pos.sell',
  'pos.discount',
  'pos.cancel_order',
  'orders.manage',
  'inventory.view',
  'inventory.manage',
  'menu.manage',
  'reports.view',
  'reports.export',
  'users.manage',
  'settings.manage',
  'backups.manage',
];

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: Permission[];
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

export const SESSION_COOKIE = 'baslune_session';

export function createSession(userId: number, deviceName: string, ipAddress: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days local session
  db.prepare(
    `INSERT INTO sessions (token, user_id, device_name, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(token, userId, deviceName.slice(0, 120), ipAddress.slice(0, 80), expiresAt);
  return token;
}

export function deleteSession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function getUserFromToken(token: string): AuthUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.permissions_override_json,
              u.is_active, u.must_change_password, u.last_login_at,
              r.permissions_json as role_permissions_json,
              s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.role_key = u.role
       WHERE s.token = ?`
    )
    .get(token) as
    | {
        id: number;
        name: string;
        email: string;
        role: string;
        permissions_override_json: string | null;
        is_active: number;
        must_change_password: number;
        last_login_at: string | null;
        role_permissions_json: string;
        expires_at: string;
      }
    | undefined;

  if (!row) return null;
  if (!row.is_active) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    return null;
  }

  let permissions: Permission[] = [];
  try {
    const raw = row.permissions_override_json || row.role_permissions_json;
    permissions = JSON.parse(raw) as Permission[];
  } catch {
    permissions = [];
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    permissions,
    is_active: Boolean(row.is_active),
    must_change_password: Boolean(row.must_change_password),
    last_login_at: row.last_login_at,
  };
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const user = getUserFromToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role === 'owner' || req.user.permissions.includes(permission)) {
      return next();
    }
    return res.status(403).json({ error: `Missing required permission: ${permission}` });
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ error: 'Insufficient role privilege' });
  };
}

export function logAudit(
  user: { id?: number | null; name?: string } | null,
  action: string,
  entityType: string,
  entityId: string | number = '',
  details = '',
  ipAddress = ''
) {
  try {
    db.prepare(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user?.id ?? null,
      user?.name ?? 'System',
      action,
      entityType,
      String(entityId),
      details,
      ipAddress
    );
  } catch (err) {
    console.error('[Audit] Failed to record audit log:', err);
  }
}
