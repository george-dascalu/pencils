// Render every raster from the vector master, without enlarging an existing PNG.
// Run: node scripts/build-icons.mjs (uses the installed Playwright Chromium).
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const svg = await fs.readFile(path.join(publicDir, 'icon.svg'), 'utf8');
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size, opaque] of [['icon-1024.png', 1024], ['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180, true], ['icon-maskable-512.png', 512, true]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${opaque ? '#204b3b' : 'transparent'}}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({ path: path.join(publicDir, file), omitBackground: !opaque });
    console.log(`${file}: ${size}×${size}`);
  }
} finally { await browser.close(); }
