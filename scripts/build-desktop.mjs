import { build, Platform } from 'electron-builder';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const output = path.join(root, 'artifacts/desktop'), stage = path.join(output, 'app');
await fs.mkdir(path.join(stage, 'public'), { recursive: true });
await fs.cp(path.join(root, 'desktop'), path.join(stage, 'desktop'), { recursive: true });
for (const file of ['styles.css', 'controls.css', 'icon.svg', 'icon-512.png']) await fs.copyFile(path.join(root, 'public', file), path.join(stage, 'public', file));
await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'pencils-desktop', productName: 'Pencils', desktopName: 'pencils.desktop', version: pkg.version,
  description: 'Pencils desktop workspace', author: 'Pencils', type: 'module', main: 'desktop/main.js', dependencies: {} }, null, 2));
const targets = process.argv.includes('--dir') ? ['dir'] : ['AppImage', 'tar.gz'];
await build({ targets: Platform.LINUX.createTarget(targets), publish: 'never', config: {
  appId: 'app.pencils.desktop', productName: 'Pencils', electronVersion: pkg.devDependencies.electron,
  directories: { app: stage, output }, files: ['desktop/**/*', 'public/**/*', 'package.json', '!node_modules/**/*'], asar: true, npmRebuild: false,
  artifactName: 'Pencils-${version}-${arch}.${ext}',
  linux: { executableName: 'pencils', syncDesktopName: true, icon: path.join(root, 'public/icon-512.png'), category: 'Office', desktop: { entry: { Name: 'Pencils', Comment: 'Documents, cards, boards and planning', StartupWMClass: 'pencils' } } },
} });
console.log(`Desktop build: ${output}`);
