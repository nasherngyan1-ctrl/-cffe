import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Crown,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Mail,
  Shield,
} from 'lucide-react';
import type { Language, User } from '../../types/pos';
import { apiRequest, setStoredToken } from '../../lib/api';
import { HERO_BAR_IMAGE } from '../../lib/productImages';
import { getOrCreateDeviceId } from '../../lib/wsClient';
import { translations } from '../../i18n/translations';

type PortalRole = 'owner' | 'admin' | 'cashier';

interface Props {
  lang: Language;
  onChangeLang: (lang: Language) => void;
  onAuthenticated: (user: User, token: string) => void;
}

const REMEMBER_KEY_PREFIX = 'baslune_remember_email_';

const CashRegisterIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M4 13h16l1.5 4.5a1 1 0 0 1-.95 1.32H3.45a1 1 0 0 1-.95-1.32L4 13Z" />
    <path d="M5 13V9.5A1.5 1.5 0 0 1 6.5 8h11A1.5 1.5 0 0 1 19 9.5V13" />
    <path d="M7 8V5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3" />
    <path d="M9 16h6" />
    <path d="M3 19h18v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2Z" />
  </svg>
);

export const LoginView: React.FC<Props> = ({ lang, onChangeLang, onAuthenticated }) => {
  const t = translations[lang];
  const [selectedRole, setSelectedRole] = useState<PortalRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedRole) return;
    const saved = localStorage.getItem(`${REMEMBER_KEY_PREFIX}${selectedRole}`) || '';
    setEmail(saved);
    setRememberEmail(Boolean(saved));
    setPassword('');
    setShowPassword(false);
    setError('');
  }, [selectedRole]);

  const roleCards: Array<{
    role: PortalRole;
    title: string;
    subtitle: string;
    desc: string;
    btnLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    accentText: string;
    subtitleText: string;
    iconBox: string;
    cardStyle: string;
    btnClass: string;
  }> = [
    {
      role: 'owner',
      title: t.ownerCardTitle,
      subtitle: t.ownerCardLabel,
      desc: t.ownerLoginDesc,
      btnLabel: t.ownerLoginBtn,
      icon: Crown,
      accentText: 'text-[#D6C7A3]',
      subtitleText: 'text-[#D6C7A3]/90',
      iconBox: 'bg-[#D6C7A3]/15 border-[#D6C7A3]/45 text-[#D6C7A3]',
      cardStyle:
        'border-[#D6C7A3]/40 hover:border-[#D6C7A3]/80 bg-gradient-to-br from-[#293B32] to-[#1B2A24]',
      btnClass: 'bg-[#D6C7A3] text-[#101A17] hover:bg-[#e3d7ba]',
    },
    {
      role: 'admin',
      title: t.adminCardTitle,
      subtitle: t.adminCardLabel,
      desc: t.adminLoginDesc,
      btnLabel: t.adminLoginBtn,
      icon: Shield,
      accentText: 'text-[#A7B89A]',
      subtitleText: 'text-[#A7B89A]/90',
      iconBox: 'bg-[#A7B89A]/15 border-[#A7B89A]/45 text-[#A7B89A]',
      cardStyle:
        'border-[#A7B89A]/40 hover:border-[#A7B89A]/80 bg-gradient-to-br from-[#293B32] to-[#1B2A24]',
      btnClass: 'bg-[#A7B89A] text-[#101A17] hover:bg-[#b8c8ac]',
    },
    {
      role: 'cashier',
      title: t.cashierCardTitle,
      subtitle: t.cashierCardLabel,
      desc: t.cashierLoginDesc,
      btnLabel: t.cashierLoginBtn,
      icon: CashRegisterIcon,
      accentText: 'text-[#7EB3D6]',
      subtitleText: 'text-[#7EB3D6]/90',
      iconBox: 'bg-[#6FA3C7]/15 border-[#6FA3C7]/45 text-[#7EB3D6]',
      cardStyle:
        'border-[#6FA3C7]/40 hover:border-[#6FA3C7]/80 bg-gradient-to-br from-[#23373B]/70 to-[#1B2A24]',
      btnClass: 'bg-[#6FA3C7] text-[#101A17] hover:bg-[#84b5d6]',
    },
  ];

  const activeCard = roleCards.find((c) => c.role === selectedRole) || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setError('');
    setLoading(true);
    try {
      const normalized = email.trim().toLowerCase();
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: normalized,
          password,
          portalRole: selectedRole,
          deviceName: getOrCreateDeviceId(),
        }),
      });

      if (rememberEmail && normalized) {
        localStorage.setItem(`${REMEMBER_KEY_PREFIX}${selectedRole}`, normalized);
      } else {
        localStorage.removeItem(`${REMEMBER_KEY_PREFIX}${selectedRole}`);
      }

      setStoredToken(res.token);
      onAuthenticated(res.user, res.token);
    } catch (err) {
      setError((err as Error).message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#101A17] text-[#F3EFE6] grid lg:grid-cols-12">
      {/* Left / Account Portal Selection & Role Login Form */}
      <div className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-10 lg:p-12">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1B2A24] border border-[#384E43]">
              <svg viewBox="0 0 36 36" className="w-6 h-6" fill="none">
                <circle cx="18" cy="18" r="12" stroke="#A7B89A" strokeWidth="2.2" />
                <path
                  d="M21 10C16 11 13 14.5 13 18.5C13 22.5 16 26 21 27C17.5 25 16 22 16 18.5C16 15 17.5 12 21 10Z"
                  fill="#D6C7A3"
                />
              </svg>
            </div>
            <div>
              <div className="text-base font-bold tracking-wide">{t.brandName}</div>
              <div className="text-xs text-[#A7B89A]">{t.brandSubtitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-[#1B2A24] p-1 border border-[#2F443A]">
            <Globe className="w-3.5 h-3.5 text-[#A7B89A] mx-1.5" />
            {(['ckb', 'ar', 'en'] as Language[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onChangeLang(code)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  lang === code
                    ? 'bg-[#A7B89A] text-[#101A17] font-semibold'
                    : 'text-[#F3EFE6]/70 hover:text-[#F3EFE6]'
                }`}
              >
                {code === 'ckb' ? 'کوردی' : code === 'ar' ? 'عربي' : 'EN'}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full max-w-2xl mx-auto my-auto py-8">
          {!activeCard ? (
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F3EFE6] mb-2">
                {t.chooseRoleTitle}
              </h1>
              <p className="text-sm text-[#A7B89A] mb-7">{t.chooseRoleSubtitle}</p>

              <div className="grid grid-cols-1 gap-4">
                {roleCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.role}
                      className={`rounded-2xl border p-5 sm:p-6 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-5 ${card.cardStyle}`}
                    >
                      <div className="flex items-start gap-4 min-w-0">
                        <div
                          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${card.iconBox}`}
                        >
                          <Icon className="w-7 h-7" />
                        </div>
                        <div className="min-w-0">
                          <div className={`text-base sm:text-lg font-bold tracking-wide ${card.accentText}`}>
                            {card.title}
                          </div>
                          <div className={`text-xs sm:text-sm font-semibold mt-0.5 ${card.subtitleText}`}>
                            {card.subtitle}
                          </div>
                          <p className="text-xs text-[#F3EFE6]/75 mt-1.5 leading-relaxed max-w-md">
                            {card.desc}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedRole(card.role)}
                        className={`shrink-0 rounded-xl px-6 py-3 text-xs sm:text-sm font-bold tracking-wide transition-colors whitespace-nowrap cursor-pointer ${card.btnClass}`}
                      >
                        {card.btnLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <button
                type="button"
                onClick={() => setSelectedRole(null)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#A7B89A] hover:text-[#F3EFE6] mb-6 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
                <span>{t.backToRoles}</span>
              </button>

              <div className={`flex items-center gap-4 mb-6 p-5 rounded-2xl border ${activeCard.cardStyle}`}>
                <div
                  className={`flex h-13 w-13 shrink-0 items-center justify-center rounded-xl border ${activeCard.iconBox}`}
                >
                  <activeCard.icon className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className={`text-base font-bold tracking-wide ${activeCard.accentText}`}>
                    {activeCard.title}
                  </div>
                  <div className="text-xs text-[#F3EFE6]/80 mt-0.5">{activeCard.subtitle}</div>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-3 text-xs sm:text-sm text-red-200 flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#D6C7A3] mb-1.5">
                    {t.email}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#A7B89A] absolute top-1/2 -translate-y-1/2 start-3.5" />
                    <input
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@baslune.local"
                      className="w-full rounded-xl border border-[#384E43] bg-[#1B2A24] ps-10 pe-4 py-3 text-sm text-[#F3EFE6] placeholder:text-[#A7B89A]/40 focus:border-[#A7B89A] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#D6C7A3] mb-1.5">
                    {t.password}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#A7B89A] absolute top-1/2 -translate-y-1/2 start-3.5" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-[#384E43] bg-[#1B2A24] ps-10 pe-11 py-3 text-sm text-[#F3EFE6] placeholder:text-[#A7B89A]/40 focus:border-[#A7B89A] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? t.hidePassword : t.showPassword}
                      title={showPassword ? t.hidePassword : t.showPassword}
                      className="absolute top-1/2 -translate-y-1/2 end-3 p-1 text-[#A7B89A] hover:text-[#F3EFE6] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-xs text-[#F3EFE6]/85 cursor-pointer select-none py-1">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(e) => setRememberEmail(e.target.checked)}
                    className="rounded border-[#384E43] bg-[#1B2A24] text-[#A7B89A]"
                  />
                  <span>{t.rememberEmail}</span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full rounded-xl py-3.5 text-sm font-bold disabled:opacity-60 transition-colors cursor-pointer ${activeCard.btnClass}`}
                >
                  {loading ? t.signingIn : t.signIn}
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="text-xs text-[#A7B89A]/70 flex items-center justify-between border-t border-[#2F443A] pt-4">
          <span>BASLUNE Specialty Coffee · Local SQLite POS</span>
          <span className="tabular-nums">LAN Terminal Sync</span>
        </div>
      </div>

      {/* Right / Specialty Coffee Showcase */}
      <div className="hidden lg:block lg:col-span-5 relative overflow-hidden bg-[#1B2A24] border-s border-[#2F443A]">
        <img
          src={HERO_BAR_IMAGE}
          alt="BASLUNE Specialty Coffee Bar"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101A17]/95 via-[#101A17]/35 to-transparent" />
        <div className="absolute bottom-10 inset-x-10">
          <div className="text-xs font-medium text-[#D6C7A3] mb-2">
            Self-Hosted · Offline-Ready · Role-Separated Portals
          </div>
          <h2 className="text-2xl font-bold text-[#F3EFE6] max-w-md leading-snug">
            Precision espresso workflows, live kitchen routing, and local SQLite control.
          </h2>
        </div>
      </div>
    </div>
  );
};
