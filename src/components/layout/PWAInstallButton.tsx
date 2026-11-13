import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface Props {
  label: string;
}

export const PWAInstallButton: React.FC<Props> = ({ label }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="flex items-center gap-2 rounded-lg bg-[#A7B89A] px-3 py-1.5 text-xs font-semibold text-[#101A17] hover:bg-[#b8c8ac] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{label}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-lg border border-[#384E43] bg-[#293B32] px-3 py-1.5 text-xs font-medium text-[#F3EFE6] hover:border-[#A7B89A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#D6C7A3]" />
          <span>{label}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 text-[#F3EFE6]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold">Install BASLUNE POS on iPad / iPhone</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-[#A7B89A] hover:text-[#F3EFE6]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-[#D6C7A3]/90 leading-relaxed">
                1. Tap the <strong>Share</strong> button in Safari toolbar.<br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-[#A7B89A] py-2 text-sm font-semibold text-[#101A17] hover:bg-[#b8c8ac] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
