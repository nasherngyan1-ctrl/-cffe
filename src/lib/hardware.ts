import { useEffect, useRef } from 'react';
import type { Order, ShopSettings } from '../types/pos';

// Web Serial API minimal typings
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
}

let activeSerialPort: SerialPortLike | null = null;

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export async function connectThermalPrinterSerial(): Promise<{ ok: boolean; message: string }> {
  if (!isWebSerialSupported()) {
    return {
      ok: false,
      message: 'Web Serial API unavailable in this browser. Use 80mm browser thermal printing or Chromium.',
    };
  }
  try {
    const navSerial = (navigator as unknown as { serial: { requestPort: () => Promise<SerialPortLike> } }).serial;
    const port = await navSerial.requestPort();
    await port.open({ baudRate: 9600 });
    activeSerialPort = port;
    return { ok: true, message: 'Thermal serial printer connected (9600 baud).' };
  } catch (err) {
    return { ok: false, message: (err as Error).message || 'Printer connection cancelled.' };
  }
}

async function sendEscPosBytes(bytes: Uint8Array): Promise<boolean> {
  if (!activeSerialPort || !activeSerialPort.writable) return false;
  const writer = activeSerialPort.writable.getWriter();
  try {
    await writer.write(bytes);
    return true;
  } finally {
    writer.releaseLock();
  }
}

// Standard ESC/POS RJ11 Cash Drawer Kick Pulse: ESC p 0 25 250
export async function triggerCashDrawer(): Promise<{ ok: boolean; mode: 'serial' | 'simulated'; message: string }> {
  const pulse = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  if (activeSerialPort) {
    const sent = await sendEscPosBytes(pulse);
    if (sent) {
      return { ok: true, mode: 'serial', message: 'Cash drawer kick pulse (ESC p 0) sent via serial.' };
    }
  }
  return {
    ok: true,
    mode: 'simulated',
    message: 'Cash drawer pulse queued (connect ESC/POS serial printer to actuate physical RJ11 solenoid).',
  };
}

export async function printEscPosReceipt(order: Order, settings: ShopSettings): Promise<boolean> {
  if (!activeSerialPort) {
    window.print();
    return true;
  }
  const encoder = new TextEncoder();
  const lines: string[] = [
    settings.shop_name || 'BASLUNE Specialty Coffee',
    settings.address || '',
    settings.phone || '',
    '--------------------------------',
    `Order: ${order.order_number}`,
    `Date : ${new Date(order.created_at).toLocaleString()}`,
    `Type : ${order.order_type.toUpperCase()}`,
    '--------------------------------',
    ...order.items.map(
      (i) => `${i.quantity}x ${i.product_name}  ${i.line_total.toLocaleString()} ${settings.currency || 'IQD'}`
    ),
    '--------------------------------',
    `TOTAL: ${order.total_amount.toLocaleString()} ${settings.currency || 'IQD'}`,
    `PAID (${order.payment_method.toUpperCase()})`,
    '',
    settings.receipt_footer || 'Thank you for visiting BASLUNE',
    '\n\n\n',
  ];
  const initCmd = new Uint8Array([0x1b, 0x40]);
  const textBytes = encoder.encode(lines.join('\n'));
  const cutCmd = new Uint8Array([0x1d, 0x56, 0x41, 0x03]);
  const payload = new Uint8Array(initCmd.length + textBytes.length + cutCmd.length);
  payload.set(initCmd, 0);
  payload.set(textBytes, initCmd.length);
  payload.set(cutCmd, initCmd.length + textBytes.length);
  return sendEscPosBytes(payload);
}

// Keyboard-wedge USB / Bluetooth HID Barcode Scanner listener
export function useBarcodeScanner(enabled: boolean, onScan: (code: string) => void) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isInput) return;

      const now = Date.now();
      if (now - lastKeyTimeRef.current > 80) {
        bufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        if (code.length >= 4) {
          onScanRef.current(code);
        }
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
