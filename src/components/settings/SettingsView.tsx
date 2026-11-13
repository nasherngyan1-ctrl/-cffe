import React, { useCallback, useEffect, useState } from 'react';
import {
  Database,
  Download,
  HardDrive,
  Network,
  Printer,
  RotateCcw,
  Save,
  Wifi,
} from 'lucide-react';
import type { Language, ShopSettings } from '../../types/pos';
import { apiRequest } from '../../lib/api';
import {
  connectThermalPrinterSerial,
  isWebSerialSupported,
  triggerCashDrawer,
} from '../../lib/hardware';
import { formatLocalDateTime, translations } from '../../i18n/translations';

interface BackupFile {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

interface LanInfo {
  hostname: string;
  port: number;
  lanAddresses: Array<{ interface: string; address: string }>;
  connectedDevices: Array<{
    deviceId: string;
    userName: string;
    role: string;
    connectedAt: string;
    ip: string;
  }>;
}

interface Props {
  lang: Language;
  onChangeLang: (lang: Language) => void;
  settings: ShopSettings;
  onSettingsSaved: (updated: ShopSettings) => void;
}

export const SettingsView: React.FC<Props> = ({
  lang,
  onChangeLang,
  settings,
  onSettingsSaved,
}) => {
  const t = translations[lang];
  const [form, setForm] = useState<ShopSettings>(settings);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [lanInfo, setLanInfo] = useState<LanInfo | null>(null);
  const [notice, setNotice] = useState('');

  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const loadExtras = useCallback(async () => {
    try {
      const [bRes, lRes] = await Promise.all([
        apiRequest<{ backups: BackupFile[] }>('/api/settings/backups'),
        apiRequest<LanInfo>('/api/settings/lan-info'),
      ]);
      setBackups(bRes.backups);
      setLanInfo(lRes);
    } catch {
      // handled
    }
  }, []);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(form) });
      onSettingsSaved(form);
      if (form.default_language === 'ckb' || form.default_language === 'ar' || form.default_language === 'en') {
        onChangeLang(form.default_language);
      }
      setNotice('Settings saved locally to SQLite.');
      window.setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleCreateBackup = async () => {
    setErrorMsg('');
    try {
      await apiRequest('/api/settings/backups', { method: 'POST' });
      setNotice('Local SQLite backup snapshot created.');
      loadExtras();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    setErrorMsg('');
    try {
      await apiRequest('/api/settings/backups/restore', {
        method: 'POST',
        body: JSON.stringify({ filename }),
      });
      setNotice(`Restored database snapshot: ${filename}`);
      loadExtras();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-6">
      {errorMsg && (
        <div className="rounded-lg border border-red-400/40 bg-red-950/50 px-4 py-2.5 text-xs text-red-200">
          {errorMsg}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-[#A7B89A]/50 bg-[#293B32] px-4 py-2.5 text-xs text-[#D6C7A3]">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shop, Currency, Tax & Receipt Settings */}
        <form
          onSubmit={handleSaveSettings}
          className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-4"
        >
          <h2 className="text-base font-bold text-[#F3EFE6]">{t.shopSettingsTitle}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.shopNameLabel}</label>
              <input
                value={form.shop_name || ''}
                onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.currencyLabel}</label>
              <input
                value={form.currency || 'IQD'}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.customerPhone}</label>
              <input
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.language}</label>
              <select
                value={form.default_language || lang}
                onChange={(e) => setForm({ ...form, default_language: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              >
                <option value="ckb">کوردی سۆرانی (Default RTL)</option>
                <option value="ar">العربية (RTL)</option>
                <option value="en">English (LTR)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.taxRateLabel}</label>
              <input
                type="number"
                step="0.1"
                value={form.tax_rate || '0'}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.serviceChargeRateLabel}</label>
              <input
                type="number"
                step="0.1"
                value={form.service_charge_rate || '0'}
                onChange={(e) => setForm({ ...form, service_charge_rate: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.addressLabel}</label>
            <input
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.receiptFooterLabel}</label>
            <input
              value={form.receipt_footer || ''}
              onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-semibold text-[#101A17] cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{t.saveSettings}</span>
          </button>
        </form>

        {/* Hardware Readiness & Setup */}
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-[#D6C7A3]" />
            <h2 className="text-base font-bold text-[#F3EFE6]">{t.hardwareReadinessTitle}</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={async () => {
                const res = await connectThermalPrinterSerial();
                setNotice(res.message);
              }}
              className="rounded-lg border border-[#384E43] bg-[#1B2A24] p-3 text-start hover:border-[#A7B89A] cursor-pointer"
            >
              <div className="text-xs font-semibold text-[#F3EFE6]">Connect ESC/POS Printer</div>
              <div className="text-[11px] text-[#A7B89A] mt-0.5">
                {isWebSerialSupported()
                  ? 'Web Serial ready (9600 baud USB/Serial)'
                  : 'Use browser 80mm print dialog'}
              </div>
            </button>

            <button
              type="button"
              onClick={async () => {
                const res = await triggerCashDrawer();
                setNotice(res.message);
              }}
              className="rounded-lg border border-[#384E43] bg-[#1B2A24] p-3 text-start hover:border-[#A7B89A] cursor-pointer"
            >
              <div className="text-xs font-semibold text-[#F3EFE6]">Test Cash Drawer Kick</div>
              <div className="text-[11px] text-[#A7B89A] mt-0.5">
                Sends ESC p 0 pulse (RJ11 via printer)
              </div>
            </button>
          </div>

          <div className="rounded-lg bg-[#101A17] border border-[#384E43] p-4 text-xs text-[#F3EFE6]/85 space-y-2 leading-relaxed">
            <div className="font-semibold text-[#D6C7A3]">Local Hardware Setup Guide</div>
            <p>
              <strong>1. 80mm Thermal Printer:</strong> Connect via USB/LAN. Click "Connect ESC/POS Printer" in Chromium for direct serial printing, or enable kiosk silent printing (`--kiosk-printing`) with our built-in 80mm `@media print` thermal layout.
            </p>
            <p>
              <strong>2. RJ11 Cash Drawer:</strong> Plug the cash drawer RJ11 cable into the back of the thermal printer. Completing cash or split payments automatically dispatches the `0x1B 0x70 0x00 0x19 0xFA` drawer kick command.
            </p>
            <p>
              <strong>3. USB / Bluetooth Barcode Scanner:</strong> Configure your scanner in Keyboard HID mode with CR/Enter suffix. Scan any product SKU/barcode directly on the Cashier POS screen to auto-add to cart.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Split: Backups & LAN Multi-Device */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Local SQLite Backups */}
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#A7B89A]" />
              <h2 className="text-base font-bold text-[#F3EFE6]">{t.backupsTitle}</h2>
            </div>
            <button
              type="button"
              onClick={handleCreateBackup}
              className="flex items-center gap-1.5 rounded-lg bg-[#A7B89A] px-3 py-1.5 text-xs font-semibold text-[#101A17] cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{t.createBackup}</span>
            </button>
          </div>

          <div className="divide-y divide-[#384E43] max-h-64 overflow-y-auto">
            {backups.map((b) => (
              <div key={b.filename} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-mono text-[#F3EFE6] truncate">{b.filename}</div>
                  <div className="text-[11px] text-[#A7B89A] tabular-nums">
                    {(b.sizeBytes / 1024).toFixed(1)} KB · {formatLocalDateTime(b.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`/api/settings/backups/download/${encodeURIComponent(b.filename)}`}
                    className="p-1.5 rounded border border-[#384E43] bg-[#1B2A24] text-[#F3EFE6]"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRestoreBackup(b.filename)}
                    className="flex items-center gap-1 rounded border border-amber-400/40 bg-amber-950/30 px-2.5 py-1 text-[11px] text-amber-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{t.restoreBackup}</span>
                  </button>
                </div>
              </div>
            ))}
            {backups.length === 0 && (
              <p className="py-4 text-xs text-[#A7B89A]">
                Automatic local backups run every 6 hours, or click "{t.createBackup}" now.
              </p>
            )}
          </div>
        </div>

        {/* LAN Multi-Device & Offline Limitation Transparency */}
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-[#D6C7A3]" />
            <h2 className="text-base font-bold text-[#F3EFE6]">{t.lanSyncTitle}</h2>
          </div>

          {lanInfo && (
            <div className="space-y-3 text-xs">
              <div className="rounded-lg bg-[#101A17] border border-[#384E43] p-3 space-y-1.5">
                <div className="text-[#A7B89A]">Connect 5+ tablets/terminals on the same Wi-Fi/LAN via:</div>
                {lanInfo.lanAddresses.map((a) => (
                  <div key={a.address} className="font-mono text-[#D6C7A3]">
                    http://{a.address}:{lanInfo.port} ({a.interface})
                  </div>
                ))}
                {lanInfo.lanAddresses.length === 0 && (
                  <div className="font-mono text-[#D6C7A3]">http://localhost:{lanInfo.port}</div>
                )}
              </div>

              <div>
                <div className="text-[#A7B89A] mb-1.5 flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-[#A7B89A]" />
                  <span>Active WebSocket Terminals ({lanInfo.connectedDevices.length})</span>
                </div>
                <div className="divide-y divide-[#384E43]/60">
                  {lanInfo.connectedDevices.map((d, idx) => (
                    <div key={`${d.deviceId}-${idx}`} className="py-1.5 flex justify-between tabular-nums">
                      <span className="text-[#F3EFE6]">
                        {d.deviceId} · {d.userName} ({d.role})
                      </span>
                      <span className="text-[#A7B89A]">{d.ip}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-[#101A17] border border-[#384E43] p-3 text-[11px] text-[#A7B89A] leading-relaxed">
            <strong className="text-[#D6C7A3]">Offline Limitation Note:</strong> When the internet disconnects, all LAN devices continue sharing the same SQLite database normally over local Wi-Fi/Ethernet. However, if the local BASLUNE server machine itself is powered off or unreachable, each PWA terminal queues new sales independently in IndexedDB with duplicate-safe `client_tx_id` keys and cannot see other terminals&apos; offline sales until the local server reconnects.
          </div>
        </div>
      </div>
    </div>
  );
};
