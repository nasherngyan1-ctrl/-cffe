import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [serverReachable, setServerReachable] = useState(true);

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const probe = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        setServerReachable(res.ok);
      } catch {
        setServerReachable(false);
      }
    };

    probe();
    const timer = window.setInterval(probe, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(timer);
    };
  }, []);

  return {
    browserOnline,
    serverReachable,
    isOffline: !serverReachable,
  };
}
