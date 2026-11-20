import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { desktopEntry, installLinuxDesktop } from '../scripts/install-desktop.mjs';

test('the Linux launcher quotes executable paths and keeps desktop field codes literal', () => {
  const entry = desktopEntry('/home/person/My Apps/$Pencils%/pencils', '/home/person/icon.png');
  assert.ok(entry.includes('Exec="/home/person/My Apps/\\\\$Pencils%%/pencils"'));
  assert.ok(entry.includes('StartupWMClass=pencils'));
  assert.ok(desktopEntry('/tmp/back\\slash/pencils', '/tmp/back\\slash/icon.png').includes('Exec="/tmp/back\\\\\\\\slash/pencils"'));
  assert.throws(() => desktopEntry('/tmp/app\nExec=evil', '/tmp/icon.png'), /path/i);
});
test('installing the desktop app creates a launcher and updates its link without changing preferences', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-desktop-install-'));
  try {
    const source = path.join(root, 'source'), dataHome = path.join(root, 'data');
    await fs.mkdir(source); await fs.writeFile(path.join(source, 'pencils'), 'first');
    const icon = path.join(root, 'icon.png'); await fs.writeFile(icon, 'icon');
    const first = await installLinuxDesktop({ source, dataHome, icon, version: '0.23.43' });
    assert.equal(await fs.readFile(path.join(first.current, 'pencils'), 'utf8'), 'first');
    await fs.writeFile(path.join(source, 'pencils'), 'second');
    const second = await installLinuxDesktop({ source, dataHome, icon, version: '0.23.43' });
    assert.equal(await fs.readFile(path.join(second.current, 'pencils'), 'utf8'), 'second');
    assert.equal(await fs.readFile(path.join(first.release, 'pencils'), 'utf8'), 'first');
    assert.match(await fs.readFile(second.launcher, 'utf8'), /Name=Pencils/);
    assert.equal(first.current, second.current);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
