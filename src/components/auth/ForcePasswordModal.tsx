import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { Language, User } from '../../types/pos';
import { apiRequest } from '../../lib/api';
import { translations } from '../../i18n/translations';

interface Props {
  lang: Language;
  user: User;
  onPasswordUpdated: (updatedUser: User) => void;
}

export const ForcePasswordModal: React.FC<Props> = ({ lang, onPasswordUpdated }) => {
  const t = translations[lang];
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest<{ user: User }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onPasswordUpdated(res.user);
    } catch (err) {
      setError((err as Error).message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 text-[#F3EFE6]">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-[#293B32] border border-[#384E43]">
            <ShieldAlert className="w-5 h-5 text-[#D6C7A3]" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{t.forcePassTitle}</h2>
          </div>
        </div>
        <p className="text-sm text-[#A7B89A] mb-5 leading-relaxed">{t.forcePassDesc}</p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-950/50 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#D6C7A3] mb-1">
              {t.currentPassword}
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3.5 py-2.5 text-sm text-[#F3EFE6] focus:border-[#A7B89A] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#D6C7A3] mb-1">
              {t.newPassword}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3.5 py-2.5 text-sm text-[#F3EFE6] focus:border-[#A7B89A] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#D6C7A3] mb-1">
              {t.confirmPassword}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3.5 py-2.5 text-sm text-[#F3EFE6] focus:border-[#A7B89A] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-semibold text-[#101A17] hover:bg-[#b8c8ac] disabled:opacity-60 transition-colors cursor-pointer"
          >
            {saving ? '...' : t.updatePassword}
          </button>
        </form>
      </div>
    </div>
  );
};
