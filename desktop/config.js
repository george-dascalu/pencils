import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SERVER = 'http://localhost:3000';

export function normalizeServerURL(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error('Enter a Pencils server address.');
  let address = value.trim();
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(address)) address = `http://${address}`;
  let url;
  try { url = new URL(address); } catch { throw new Error('Enter a valid server address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Use the server address only, without a path, password, query or bookmark.');
  return url.origin;
}

export function navigationAllowed(value, server) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && url.origin === server && !url.username && !url.password;
  } catch { return false; }
}

export function externalURL(value) {
  if (typeof value !== 'string' || /[\x00-\x20]/.test(value) || value.length > 8192) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function restoreBounds(saved = {}, area) {
  const finite = (value, fallback) => Number.isFinite(value) ? Math.round(value) : fallback;
  const width = Math.min(area.width, Math.max(640, finite(saved.width, 1280)));
  const height = Math.min(area.height, Math.max(480, finite(saved.height, 760)));
  const x = Math.max(area.x, Math.min(area.x + area.width - width, finite(saved.x, area.x + (area.width - width) / 2)));
  const y = Math.max(area.y, Math.min(area.y + area.height - height, finite(saved.y, area.y + (area.height - height) / 2)));
  return { width, height, x, y };
}

export function readPreferences(dir) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'desktop.json'), 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}

export function writePreferences(dir, data) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'desktop.json'), temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}
