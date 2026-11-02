import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
const outdir = 'dist/public/vendor/sheets';
const result = await build({
  entryPoints: { deps: 'public/document-sheet-deps.js' },
  outdir, bundle: true, format: 'esm', metafile: true,
  target: ['chrome110', 'safari16.4', 'firefox115'], minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
// Ship the licences/notices of every package included in the standalone engine.
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes('node_modules/')) continue;
  let dir = path.dirname(path.resolve(input));
  while (dir !== path.dirname(dir)) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name && pkg.version) { packages.set(dir, pkg); break; }
    } catch { /* A source subdirectory need not have a package manifest. */ }
    dir = path.dirname(dir);
  }
}
const notices = [];
for (const [dir, pkg] of [...packages].sort((a,b)=>a[1].name.localeCompare(b[1].name))) {
  const files = (await fs.readdir(dir)).filter(name => /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i.test(name));
  const texts = await Promise.all(files.map(async name => `${name}\n${await fs.readFile(path.join(dir,name),'utf8')}`));
  notices.push(`${pkg.name} ${pkg.version}\nLicence: ${pkg.license || 'See package notices'}\n${texts.join('\n\n')}`);
}
await fs.writeFile(path.join(outdir,'THIRD_PARTY_LICENSES.txt'),notices.join('\n\n========================================\n\n'));
