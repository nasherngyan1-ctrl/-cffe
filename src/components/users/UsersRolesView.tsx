import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Edit2,
  Eye,
  EyeOff,
  Plus,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import type { Language, Permission, User } from '../../types/pos';
import { apiRequest } from '../../lib/api';
import { translations } from '../../i18n/translations';

interface RoleInfo {
  role_key: string;
  label_en: string;
  label_ckb: string;
  label_ar: string;
  permissions_json: string;
}

interface AuditLogRow {
  id: number;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  ip_address: string;
  created_at: string;
}

interface ActivityPayload {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
  };
  activeSessions: number;
  logs: AuditLogRow[];
}

interface Props {
  lang: Language;
  currentUser: User;
}

export const UsersRolesView: React.FC<Props> = ({ lang, currentUser }) => {
  const t = translations[lang];
  const isOwner = currentUser.role === 'owner';

  const [subTab, setSubTab] = useState<'staff' | 'audit'>('staff');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [bannerError, setBannerError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [showCreatePass, setShowCreatePass] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'cashier',
  });

  const [editUser, setEditUser] = useState<{
    id: number;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    permissions: Permission[];
    useCustomPerms: boolean;
    new_password: string;
  } | null>(null);
  const [showResetPass, setShowResetPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [activityModal, setActivityModal] = useState<ActivityPayload | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const getRoleLabel = (roleKey: string) => {
    const matched = roles.find((r) => r.role_key === roleKey);
    if (matched) {
      if (lang === 'ckb') return matched.label_ckb;
      if (lang === 'ar') return matched.label_ar;
      return matched.label_en;
    }
    if (roleKey === 'owner') return t.roleOwner;
    if (roleKey === 'admin') return t.roleAdmin;
    if (roleKey === 'cashier') return t.roleCashier;
    return roleKey;
  };

  const loadData = useCallback(async () => {
    try {
      const uRes = await apiRequest<{
        users: User[];
        roles: RoleInfo[];
        allPermissions: Permission[];
      }>('/api/users');
      setUsers(uRes.users);
      setRoles(uRes.roles);
      setAllPermissions(uRes.allPermissions);

      if (isOwner) {
        const aRes = await apiRequest<{ logs: AuditLogRow[] }>('/api/settings/audit-logs');
        setAuditLogs(aRes.logs);
      }
    } catch (err) {
      setBannerError((err as Error).message);
    }
  }, [isOwner]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/users', { method: 'POST', body: JSON.stringify(createForm) });
      setShowCreate(false);
      setCreateForm({ name: '', email: '', password: '', role: 'cashier' });
      setShowCreatePass(false);
      loadData();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setErrorMsg('');
    try {
      await apiRequest(`/api/users/${editUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editUser.name,
          email: editUser.email,
          role: editUser.role,
          is_active: editUser.is_active,
          permissions_override: editUser.useCustomPerms ? editUser.permissions : null,
          new_password: editUser.new_password.length > 0 ? editUser.new_password : undefined,
        }),
      });
      setEditUser(null);
      setShowResetPass(false);
      loadData();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleToggleActive = async (target: User) => {
    setBannerError('');
    try {
      await apiRequest(`/api/users/${target.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !target.is_active }),
      });
      loadData();
    } catch (err) {
      setBannerError((err as Error).message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBannerError('');
    try {
      await apiRequest(`/api/users/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      setBannerError((err as Error).message);
      setDeleteTarget(null);
    }
  };

  const openActivityModal = async (target: User) => {
    setActivityLoading(true);
    setBannerError('');
    try {
      const data = await apiRequest<ActivityPayload>(`/api/users/${target.id}/activity`);
      setActivityModal(data);
    } catch (err) {
      setBannerError((err as Error).message);
    } finally {
      setActivityLoading(false);
    }
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return t.neverLoggedIn;
    const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return iso;
    return parsed.toLocaleString();
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-[#1B2A24] p-1 rounded-lg border border-[#2F443A]">
          <button
            type="button"
            onClick={() => setSubTab('staff')}
            className={`px-3.5 py-2 rounded-md text-xs font-medium cursor-pointer ${
              subTab === 'staff' ? 'bg-[#A7B89A] text-[#101A17] font-semibold' : 'text-[#F3EFE6]/75'
            }`}
          >
            {t.navUsers}
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => setSubTab('audit')}
              className={`px-3.5 py-2 rounded-md text-xs font-medium cursor-pointer ${
                subTab === 'audit' ? 'bg-[#A7B89A] text-[#101A17] font-semibold' : 'text-[#F3EFE6]/75'
              }`}
            >
              {t.auditLogs}
            </button>
          )}
        </div>

        {subTab === 'staff' && (
          <button
            type="button"
            onClick={() => {
              setErrorMsg('');
              setShowCreatePass(false);
              setShowCreate(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[#A7B89A] px-3.5 py-2 text-xs font-semibold text-[#101A17] hover:bg-[#b8c8ac] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.createEmployee}</span>
          </button>
        )}
      </div>

      {bannerError && (
        <div className="rounded-lg border border-red-400/40 bg-red-950/50 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>{bannerError}</span>
          <button type="button" onClick={() => setBannerError('')} className="text-red-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {subTab === 'staff' && (
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                <th className="pb-2.5 text-start font-medium">{t.employeeLabel}</th>
                <th className="pb-2.5 text-start font-medium">{t.roleLabel}</th>
                <th className="pb-2.5 text-start font-medium">{t.permissionsLabel}</th>
                <th className="pb-2.5 text-start font-medium">{t.lastLogin}</th>
                <th className="pb-2.5 text-start font-medium">{t.status}</th>
                <th className="pb-2.5 text-end font-medium">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#384E43]/60">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id}>
                    <td className="py-3 pe-4">
                      <div className="font-semibold text-[#F3EFE6]">{u.name}</div>
                      <div className="text-xs text-[#A7B89A]">{u.email}</div>
                      {u.must_change_password && (
                        <div className="text-[11px] text-[#D6C7A3] mt-0.5">{t.forcedResetNotice}</div>
                      )}
                    </td>
                    <td className="py-3 pe-4 text-xs font-medium text-[#D6C7A3] whitespace-nowrap">
                      {getRoleLabel(u.role)}
                      {u.has_custom_permissions ? ` (${t.customLabel})` : ''}
                    </td>
                    <td className="py-3 pe-4 text-xs text-[#A7B89A] tabular-nums whitespace-nowrap">
                      {u.permissions.length}
                    </td>
                    <td className="py-3 pe-4 text-xs text-[#F3EFE6]/80 tabular-nums whitespace-nowrap">
                      {formatDateTime(u.last_login_at)}
                    </td>
                    <td className="py-3 pe-4 text-xs whitespace-nowrap">
                      <span className={u.is_active ? 'text-[#A7B89A]' : 'text-red-300'}>
                        {u.is_active ? t.activeStatus : t.disabledStatus}
                      </span>
                    </td>
                    <td className="py-3 text-end">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openActivityModal(u)}
                          disabled={activityLoading}
                          title={t.accountActivity}
                          aria-label={t.accountActivity}
                          className="p-1.5 rounded border border-[#384E43] bg-[#1B2A24] text-[#D6C7A3] hover:border-[#D6C7A3] cursor-pointer"
                        >
                          <Activity className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => handleToggleActive(u)}
                          title={u.is_active ? t.deactivateAccount : t.activateAccount}
                          aria-label={u.is_active ? t.deactivateAccount : t.activateAccount}
                          className="p-1.5 rounded border border-[#384E43] bg-[#1B2A24] text-[#A7B89A] hover:border-[#A7B89A] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMsg('');
                            setShowResetPass(false);
                            setEditUser({
                              id: u.id,
                              name: u.name,
                              email: u.email,
                              role: u.role,
                              is_active: u.is_active,
                              permissions: u.permissions,
                              useCustomPerms: Boolean(u.has_custom_permissions),
                              new_password: '',
                            });
                          }}
                          title={t.edit}
                          aria-label={t.edit}
                          className="p-1.5 rounded border border-[#384E43] bg-[#1B2A24] text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => setDeleteTarget(u)}
                            title={t.deleteEmployee}
                            aria-label={t.deleteEmployee}
                            className="p-1.5 rounded border border-[#384E43] bg-[#1B2A24] text-red-300 hover:border-red-400/70 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'audit' && isOwner && (
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                <th className="pb-2 text-start font-medium">Time</th>
                <th className="pb-2 text-start font-medium">Actor</th>
                <th className="pb-2 text-start font-medium">Action</th>
                <th className="pb-2 text-start font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#384E43]/60">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 text-xs text-[#A7B89A] tabular-nums whitespace-nowrap">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="py-2.5 text-xs font-medium text-[#F3EFE6]">{log.user_name}</td>
                  <td className="py-2.5 text-xs text-[#D6C7A3] font-mono">{log.action}</td>
                  <td className="py-2.5 text-xs text-[#F3EFE6]/80">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3EFE6]">{t.createEmployee}</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-[#A7B89A] hover:text-[#F3EFE6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {errorMsg && (
              <div className="rounded-lg border border-red-400/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {errorMsg}
              </div>
            )}
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.fullNameLabel}</label>
              <input
                required
                placeholder={t.fullNameLabel}
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.email}</label>
              <input
                type="email"
                required
                placeholder="employee@baslune.local"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.password}</label>
              <div className="relative">
                <input
                  type={showCreatePass ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="Min 8 chars"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] ps-3 pe-9 py-2 text-xs text-[#F3EFE6]"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePass((v) => !v)}
                  className="absolute top-1/2 -translate-y-1/2 end-2.5 text-[#A7B89A] hover:text-[#F3EFE6] cursor-pointer"
                >
                  {showCreatePass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.roleLabel}</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              >
                {roles.map((r) => (
                  <option key={r.role_key} value={r.role_key}>
                    {getRoleLabel(r.role_key)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-semibold text-[#101A17] hover:bg-[#b8c8ac] cursor-pointer"
            >
              {t.createEmployee}
            </button>
          </form>
        </div>
      )}

      {/* Edit User & Granular Permissions Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-lg rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#D6C7A3]" />
                <h3 className="text-base font-bold text-[#F3EFE6]">{t.editEmployee}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="text-[#A7B89A] hover:text-[#F3EFE6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {errorMsg && (
              <div className="rounded-lg border border-red-400/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {errorMsg}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.fullNameLabel}</label>
                <input
                  required
                  value={editUser.name}
                  onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.email}</label>
                <input
                  type="email"
                  required
                  value={editUser.email}
                  onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.roleLabel}</label>
              <select
                disabled={!isOwner || editUser.id === currentUser.id}
                value={editUser.role}
                onChange={(e) => {
                  const newRole = e.target.value;
                  const roleRow = roles.find((r) => r.role_key === newRole);
                  const rolePerms = roleRow ? (JSON.parse(roleRow.permissions_json) as Permission[]) : [];
                  setEditUser({
                    ...editUser,
                    role: newRole,
                    permissions: editUser.useCustomPerms ? editUser.permissions : rolePerms,
                  });
                }}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6] disabled:opacity-60"
              >
                {roles.map((r) => (
                  <option key={r.role_key} value={r.role_key}>
                    {getRoleLabel(r.role_key)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs py-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={editUser.id === currentUser.id}
                  checked={editUser.is_active}
                  onChange={(e) => setEditUser({ ...editUser, is_active: e.target.checked })}
                />
                <span>{t.activeStatus}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editUser.useCustomPerms}
                  onChange={(e) => setEditUser({ ...editUser, useCustomPerms: e.target.checked })}
                />
                <span>{t.overridePermissions}</span>
              </label>
            </div>

            {editUser.useCustomPerms && (
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-[#101A17] border border-[#384E43]">
                {allPermissions.map((perm) => {
                  const checked = editUser.permissions.includes(perm);
                  return (
                    <label key={perm} className="flex items-center gap-2 text-xs text-[#F3EFE6] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...editUser.permissions, perm]
                            : editUser.permissions.filter((p) => p !== perm);
                          setEditUser({ ...editUser, permissions: next });
                        }}
                      />
                      <span className="font-mono text-[11px]">{perm}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.resetPasswordHint}</label>
              <div className="relative">
                <input
                  type={showResetPass ? 'text' : 'password'}
                  minLength={8}
                  placeholder="Min 8 chars (optional)"
                  value={editUser.new_password}
                  onChange={(e) => setEditUser({ ...editUser, new_password: e.target.value })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] ps-3 pe-9 py-2 text-xs text-[#F3EFE6]"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPass((v) => !v)}
                  className="absolute top-1/2 -translate-y-1/2 end-2.5 text-[#A7B89A] hover:text-[#F3EFE6] cursor-pointer"
                >
                  {showResetPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-semibold text-[#101A17] hover:bg-[#b8c8ac] cursor-pointer"
            >
              {t.save}
            </button>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-xl border border-red-400/40 bg-[#1B2A24] p-6 space-y-4">
            <h3 className="text-base font-bold text-[#F3EFE6]">{t.deleteEmployee}</h3>
            <p className="text-xs text-[#F3EFE6]/80 leading-relaxed">
              {t.confirmDeleteUser}
            </p>
            <div className="rounded-lg bg-[#101A17] border border-[#384E43] p-3 text-xs">
              <div className="font-semibold text-[#F3EFE6]">{deleteTarget.name}</div>
              <div className="text-[#A7B89A]">{deleteTarget.email}</div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-4 py-2 text-xs font-medium text-[#F3EFE6] cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 cursor-pointer"
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Activity Modal */}
      {activityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-[#D6C7A3]" />
                <div>
                  <h3 className="text-base font-bold text-[#F3EFE6]">
                    {t.accountActivity}: {activityModal.user.name}
                  </h3>
                  <div className="text-xs text-[#A7B89A]">
                    {getRoleLabel(activityModal.user.role)} · {activityModal.user.email}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivityModal(null)}
                className="text-[#A7B89A] hover:text-[#F3EFE6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-[#384E43] bg-[#101A17] p-3">
                <div className="text-[#A7B89A]">{t.lastLogin}</div>
                <div className="font-semibold text-[#F3EFE6] mt-1 tabular-nums">
                  {formatDateTime(activityModal.user.last_login_at)}
                </div>
              </div>
              <div className="rounded-lg border border-[#384E43] bg-[#101A17] p-3">
                <div className="text-[#A7B89A]">{t.activeSessionsLabel}</div>
                <div className="font-semibold text-[#D6C7A3] mt-1 tabular-nums">
                  {activityModal.activeSessions}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg border border-[#384E43] bg-[#101A17] p-3">
              {activityModal.logs.length === 0 ? (
                <div className="text-center py-8 text-xs text-[#A7B89A]">{t.noActivityYet}</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#384E43] text-[#A7B89A]">
                      <th className="pb-2 text-start font-medium">Time</th>
                      <th className="pb-2 text-start font-medium">Action</th>
                      <th className="pb-2 text-start font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#384E43]/50">
                    {activityModal.logs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2 pe-3 text-[#A7B89A] tabular-nums whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="py-2 pe-3 text-[#D6C7A3] font-mono whitespace-nowrap">
                          {log.action}
                        </td>
                        <td className="py-2 text-[#F3EFE6]/85">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
