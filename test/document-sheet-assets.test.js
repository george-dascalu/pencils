import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { staticAssets } from '../server/static-assets.js';
test('the lazy spreadsheet engine is served from its build in development and production', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-sheet-assets-'));
  try {
    const publicDir = path.join(dir, 'public'), builtDir = path.join(dir, 'dist');
    await fs.mkdir(publicDir);await fs.mkdir(path.join(builtDir, 'vendor/sheets'), { recursive: true });
    await fs.writeFile(path.join(builtDir, 'vendor/sheets/deps.js'), 'export const sheet = true;');
    for (const production of [false, true]) {
      const serve = staticAssets({ publicDir, builtDir, vendor: {}, mime: { '.js': 'text/javascript' }, production });
      const response = { writeHead(status, headers) { this.status = status;this.headers = headers; }, end(body) { this.body = body; } };
      assert.equal(await serve({ method: 'GET', headers: {} }, response, '/vendor/sheets/deps.js', {}), true);
      assert.equal(response.status, 200);assert.equal(response.body.toString(), 'export const sheet = true;');
      assert.equal(await serve({ method: 'GET', headers: {} }, response, '/vendor/sheets/../../secret', {}), false);
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
