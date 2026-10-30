export const APP_VERSION = '0.20.24';

export function watchAppVersion(onVersion) {
  let checking = false;
  async function check() {
    if (checking || document.hidden) return;
    checking = true;
    try {
      const response = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const { version } = await response.json();
      if (typeof version === 'string' && /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) onVersion(version);
    } catch { /* A connectivity failure is shown by the workspace's save state. */ }
    finally { checking = false; }
  }
  check();
  const timer = setInterval(check, 60000);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('online', check);
  window.addEventListener('focus', check);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); window.removeEventListener('online', check); window.removeEventListener('focus', check); };
}
