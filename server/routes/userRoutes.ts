import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { db } from '../db.ts';
import {
  ALL_PERMISSIONS,
  type Permission,
  logAudit,
  requireAuth,
  requirePermission,
  requireRole,
} from '../auth.ts';

const router = Router();

const CASHIER_SAFE_PERMISSIONS: Permission[] = [
  'pos.sell',
  'pos.discount',
  'pos.cancel_order',
  'orders.manage',
];

function sanitizePermissions(raw: unknown, allowedList: Permission[]): Permission[] | null {
  if (!Array.isArray(raw)) return null;
  const allowedSet = new Set<string>(allowedList);
  return raw.filter((p): p is Permission => typeof p === 'string' && allowedSet.has(p));
}

router.get('/', requireAuth, requirePermission('users.manage'), (req, res) => {
  const isOwner = req.user!.role === 'owner';

  const users = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.permissions_override_json, u.is_active,
              u.must_change_password, u.created_at, u.last_login_at,
              r.permissions_json as role_permissions_json
       FROM users u
       JOIN roles r ON r.role_key = u.role
       ${isOwner ? '' : "WHERE u.role != 'owner'"}
       ORDER BY CASE u.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, u.id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const formattedUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    is_active: Boolean(u.is_active),
    must_change_password: Boolean(u.must_change_password),
    created_at: u.created_at,
    last_login_at: u.last_login_at,
    permissions: (() => {
      try {
        return JSON.parse(String(u.permissions_override_json || u.role_permissions_json));
      } catch {
        return [];
      }
    })(),
    has_custom_permissions: Boolean(u.permissions_override_json),
  }));

  const roles = (
    db.prepare('SELECT * FROM roles').all() as Array<{
      role_key: string;
      label_en: string;
      label_ckb: string;
      label_ar: string;
      permissions_json: string;
    }>
  ).filter((r) => (isOwner ? true : r.role_key === 'cashier'));

  return res.json({
    users: formattedUsers,
    roles,
    allPermissions: isOwner ? ALL_PERMISSIONS : CASHIER_SAFE_PERMISSIONS,
  });
});

router.post('/', requireAuth, requirePermission('users.manage'), (req, res) => {
  const isOwner = req.user!.role === 'owner';
  const { name, email, password, role, permissions_override } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    permissions_override?: string[] | null;
  };

  if (!name?.trim() || !email?.trim() || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Temporary password must be at least 8 characters' });
  }

  if (!isOwner && role !== 'cashier') {
    return res.status(403).json({ error: 'Only the Owner can create Owner or Admin accounts' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const duplicate = db
    .prepare('SELECT id FROM users WHERE lower(email) = ?')
    .get(normalizedEmail) as { id: number } | undefined;
  if (duplicate) {
    return res.status(409).json({ error: 'An account with this email address already exists' });
  }

  const roleExists = db.prepare('SELECT role_key FROM roles WHERE role_key = ?').get(role);
  if (!roleExists) return res.status(400).json({ error: 'Invalid role' });

  const allowedPerms = isOwner ? ALL_PERMISSIONS : CASHIER_SAFE_PERMISSIONS;
  const sanitizedOverride = sanitizePermissions(permissions_override, allowedPerms);

  const hash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role, permissions_override_json, is_active, must_change_password)
       VALUES (?, ?, ?, ?, ?, 1, 1)`
    )
    .run(
      name.trim(),
      normalizedEmail,
      hash,
      role,
      sanitizedOverride ? JSON.stringify(sanitizedOverride) : null
    );

  const newId = Number(result.lastInsertRowid);
  logAudit(req.user!, 'user_created', 'user', newId, `${normalizedEmail} (${role})`, req.ip || '');
  return res.status(201).json({ id: newId });
});

router.put('/:id', requireAuth, requirePermission('users.manage'), (req, res) => {
  const isOwner = req.user!.role === 'owner';
  const id = Number(req.params.id);
  const { name, email, role, is_active, permissions_override, new_password } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    is_active?: boolean;
    permissions_override?: string[] | null;
    new_password?: string;
  };

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | { id: number; name: string; email: string; role: string; is_active: number }
    | undefined;
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Strict hierarchy enforcement: Admin can never inspect/modify Owner or Admin accounts, nor promote anyone
  if (!isOwner) {
    if (target.role !== 'cashier') {
      return res.status(403).json({ error: 'Only the Owner can modify Owner or Admin accounts' });
    }
    if (role !== undefined && role !== 'cashier') {
      return res.status(403).json({ error: 'Admins cannot promote accounts to Owner or Admin' });
    }
  }

  if (id === req.user!.id && is_active === false) {
    return res.status(400).json({ error: 'Cannot disable your own active account' });
  }

  if (id === req.user!.id && role !== undefined && role !== target.role) {
    return res.status(400).json({ error: 'Cannot change your own role while signed in' });
  }

  // Prevent disabling or demoting the last active owner
  if (target.role === 'owner' && (is_active === false || (role && role !== 'owner'))) {
    const otherOwners = db
      .prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'owner' AND is_active = 1 AND id != ?`)
      .get(id) as { c: number };
    if (otherOwners.c === 0) {
      return res.status(400).json({ error: 'At least one active Owner account is required' });
    }
  }

  let normalizedEmail = target.email;
  if (email !== undefined) {
    normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }
    const duplicate = db
      .prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?')
      .get(normalizedEmail, id) as { id: number } | undefined;
    if (duplicate) {
      return res.status(409).json({ error: 'An account with this email address already exists' });
    }
  }

  const nextRole = role ?? target.role;
  const roleExists = db.prepare('SELECT role_key FROM roles WHERE role_key = ?').get(nextRole);
  if (!roleExists) return res.status(400).json({ error: 'Invalid role' });

  if (new_password !== undefined && new_password.length > 0 && new_password.length < 8) {
    return res.status(400).json({ error: 'Reset password must be at least 8 characters' });
  }

  const allowedPerms = isOwner ? ALL_PERMISSIONS : CASHIER_SAFE_PERMISSIONS;
  const sanitizedOverride =
    permissions_override === null
      ? null
      : permissions_override !== undefined
      ? sanitizePermissions(permissions_override, allowedPerms)
      : undefined;

  db.transaction(() => {
    db.prepare(
      `UPDATE users
       SET name = ?,
           email = ?,
           role = ?,
           is_active = ?,
           permissions_override_json = CASE WHEN ? = 1 THEN ? ELSE permissions_override_json END,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      (name ?? target.name).trim(),
      normalizedEmail,
      nextRole,
      is_active === undefined ? target.is_active : is_active ? 1 : 0,
      sanitizedOverride !== undefined ? 1 : 0,
      sanitizedOverride ? JSON.stringify(sanitizedOverride) : null,
      id
    );

    if (new_password && new_password.length >= 8) {
      const hash = bcrypt.hashSync(new_password, 12);
      db.prepare(
        `UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?`
      ).run(hash, id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }

    if (is_active === false) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
  })();

  const actionNote = [
    `Updated ${normalizedEmail} (${nextRole})`,
    new_password && new_password.length >= 8 ? 'password reset' : '',
    is_active === false ? 'deactivated' : is_active === true && !target.is_active ? 'reactivated' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  logAudit(req.user!, 'user_updated', 'user', id, actionNote, req.ip || '');
  return res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireRole('owner'), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    return res.status(400).json({ error: 'Cannot delete your own active Owner account' });
  }

  const target = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id) as
    | { id: number; name: string; email: string; role: string }
    | undefined;
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (target.role === 'owner') {
    const otherOwners = db
      .prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'owner' AND is_active = 1 AND id != ?`)
      .get(id) as { c: number };
    if (otherOwners.c === 0) {
      return res.status(400).json({ error: 'Cannot delete the last active Owner account' });
    }
  }

  db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  })();

  logAudit(req.user!, 'user_deleted', 'user', id, `Deleted ${target.email} (${target.role})`, req.ip || '');
  return res.json({ ok: true });
});

router.get('/:id/activity', requireAuth, requirePermission('users.manage'), (req, res) => {
  const id = Number(req.params.id);
  const isOwner = req.user!.role === 'owner';

  const target = db
    .prepare('SELECT id, name, email, role, is_active, last_login_at, created_at FROM users WHERE id = ?')
    .get(id) as
    | {
        id: number;
        name: string;
        email: string;
        role: string;
        is_active: number;
        last_login_at: string | null;
        created_at: string;
      }
    | undefined;

  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!isOwner && target.role !== 'cashier') {
    return res.status(403).json({ error: 'Access denied to this account activity' });
  }

  const logs = db
    .prepare(
      `SELECT id, user_id, user_name, action, entity_type, entity_id, details, ip_address, created_at
       FROM audit_logs
       WHERE user_id = ? OR (entity_type = 'user' AND entity_id = ?)
       ORDER BY created_at DESC, id DESC
       LIMIT 80`
    )
    .all(id, String(id));

  const sessionCountRow = db
    .prepare(`SELECT COUNT(*) as c FROM sessions WHERE user_id = ? AND expires_at > datetime('now')`)
    .get(id) as { c: number };

  return res.json({
    user: {
      ...target,
      is_active: Boolean(target.is_active),
    },
    activeSessions: sessionCountRow.c,
    logs,
  });
});

export default router;
