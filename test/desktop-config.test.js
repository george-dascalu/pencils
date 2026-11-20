import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeServerURL, navigationAllowed, externalURL, restoreBounds, readPreferences, writePreferences } from '../desktop/config.js';

test('desktop connections accept server origins, including LAN HTTP, without credentials or hidden paths', () => {
  assert.equal(normalizeServerURL(' localhost:3000 '), 'http://localhost:3000');
  assert.equal(normalizeServerURL('https://pencils.example/'), 'https://pencils.example');
  assert.equal(normalizeServerURL('http://192.168.1.20:3000'), 'http://192.168.1.20:3000');
  assert.equal(normalizeServerURL('http://[::1]:3000'), 'http://[::1]:3000');
  for (const url of ['', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com/?token=x', 'https://example.com/#secret']) {
    assert.throws(() => normalizeServerURL(url), /server|address/i, url);
  }
});

test('only the chosen origin can navigate the desktop workspace; unsafe links never reach the operating system', () => {
  const origin = 'https://pencils.example';
  assert.equal(navigationAllowed(`${origin}/#project/123/calendar`, origin), true);
  for (const url of ['https://pencils.example.evil.test/', 'http://pencils.example/', 'file:///etc/passwd', 'data:text/html,hi', 'https://other.test', 'https://user:pass@pencils.example']) assert.equal(navigationAllowed(url, origin), false, url);
  assert.equal(externalURL('https://example.com/path'), 'https://example.com/path');
  assert.equal(externalURL('mailto:hello@example.com'), 'mailto:hello@example.com');
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'pencils://whatever', 'https://user:pass@example.com', '\nhttps://example.com']) assert.equal(externalURL(url), null, url);
});

test('restored windows fit the current monitor even after removing a display', () => {
  const area = { x: 0, y: 0, width: 1280, height: 800 };
  assert.deepEqual(restoreBounds({ x: 2500, y: -200, width: 1800, height: 1200 }, area), { x: 0, y: 0, width: 1280, height: 800 });
  assert.deepEqual(restoreBounds({ x: 100, y: 50, width: 900, height: 600 }, area), { x: 100, y: 50, width: 900, height: 600 });
  assert.deepEqual(restoreBounds({ width: -5, height: NaN }, area), { width: 640, height: 760, x: 320, y: 20 });
});

test('desktop preferences survive restart and malformed files fall back without touching workspace data', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-desktop-config-'));
  try {
    assert.deepEqual(await readPreferences(dir), {});
    await writePreferences(dir, { server: 'http://localhost:3000', bounds: { width: 1000, height: 700 }, maximized: true });
    assert.equal((await readPreferences(dir)).server, 'http://localhost:3000');
    assert.equal((await readPreferences(dir)).maximized, true);
    await fs.writeFile(path.join(dir, 'desktop.json'), '{bad');
    assert.deepEqual(await readPreferences(dir), {});
    await fs.writeFile(path.join(dir, 'desktop.json'), 'null');
    assert.deepEqual(await readPreferences(dir), {});
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
