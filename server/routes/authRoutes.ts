import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { db } from '../db.ts';
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  extractToken,
  getUserFromToken,
  logAudit,
  requireAuth,
} from '../auth.ts';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password, deviceName, portalRole } = req.body as {
    email?: string;
    password?: string;
    deviceName?: string;
    portalRole?: 'owner' | 'admin' | 'cashier';
  };

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (portalRole && !['owner', 'admin', 'cashier'].includes(portalRole)) {
    return res.status(400).json({ error: 'Invalid login portal role' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const userRow = db
    .prepare(
      `SELECT id, name, email, password_hash, role, is_active, must_change_password
       FROM users WHERE email = ?`
    )
    .get(normalizedEmail) as
    | {
        id: number;
        name: string;
        email: string;
        password_hash: string;
        role: string;
        is_active: number;
        must_change_password: number;
      }
    | undefined;

  if (!userRow) {
    logAudit(null, 'login_failed', 'auth', normalizedEmail, 'Unknown email', req.ip || '');
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (!userRow.is_active) {
    logAudit({ id: userRow.id, name: userRow.name }, 'login_blocked', 'auth', userRow.id, 'Disabled account', req.ip || '');
    return res.status(403).json({ error: 'Account is disabled. Contact the Owner or Administrator.' });
  }

  const valid = bcrypt.compareSync(password, userRow.password_hash);
  if (!valid) {
    logAudit({ id: userRow.id, name: userRow.name }, 'login_failed', 'auth', userRow.id, 'Invalid password', req.ip || '');
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (portalRole && userRow.role !== portalRole) {
    logAudit(
      { id: userRow.id, name: userRow.name },
      'login_role_mismatch',
      'auth',
      userRow.id,
      `Attempted ${portalRole} portal with ${userRow.role} account`,
      req.ip || ''
    );
    return res.status(403).json({
      error: `Access denied for this portal. This account is assigned to the ${userRow.role.toUpperCase()} role.`,
    });
  }

  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(userRow.id);

  const ip = (req.ip || req.socket.remoteAddress || '').replace('::ffff:', '');
  const token = createSession(userRow.id, deviceName || 'POS Terminal', ip);
  const authUser = getUserFromToken(token);

  logAudit(
    { id: userRow.id, name: userRow.name },
    'login_success',
    'auth',
    userRow.id,
    `Role: ${userRow.role} · Device: ${deviceName || 'POS Terminal'}`,
    ip
  );

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });

  return res.json({ token, user: authUser });
});

router.post('/logout', (req, res) => {
  const token = extractToken(req);
  if (token) {
    const user = getUserFromToken(token);
    deleteSession(token);
    if (user) {
      logAudit(user, 'logout', 'auth', user.id, '', req.ip || '');
    }
  }
  res.clearCookie(SESSION_COOKIE);
  return res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const userRow = db
    .prepare('SELECT id, name, password_hash FROM users WHERE id = ?')
    .get(req.user!.id) as { id: number; name: string; password_hash: string } | undefined;

  if (!userRow || !bcrypt.compareSync(currentPassword, userRow.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from current password' });
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`
  ).run(newHash, userRow.id);

  logAudit(req.user!, 'password_changed', 'user', userRow.id, 'User updated password', req.ip || '');

  const updatedUser = getUserFromToken(req.sessionToken!);
  return res.json({ ok: true, user: updatedUser });
});

export default router;
