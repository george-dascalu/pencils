import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function desktopEntry(executable, icon) {
  if ([executable, icon].some(value => typeof value !== 'string' || /[\x00-\x1f]/.test(value))) throw new Error('Invalid launcher path.');
  // Desktop entries unescape string values before unquoting Exec arguments.
  const quoted = executable.replace(/[\\"`$]/g, '\\$&').replaceAll('%', '%%').replaceAll('\\', '\\\\');
  return `[Desktop Entry]\nType=Application\nName=Pencils\nComment=Documents, cards, boards and planning\nExec="${quoted}"\nIcon=${icon.replaceAll('\\', '\\\\')}\nTerminal=false\nCategories=Office;\nStartupWMClass=pencils\nStartupNotify=true\n`;
}

export async function installLinuxDesktop({ source, dataHome, icon, scalableIcon, version }) {
  await fs.access(path.join(source, 'pencils'));
  const releases = path.join(dataHome, 'pencils-desktop/releases');
  const current = path.join(dataHome, 'pencils-desktop/current');
  const launcher = path.join(dataHome, 'applications/pencils.desktop');
  const installedIcon = path.join(dataHome, 'icons/hicolor/512x512/apps/pencils.png');
  await fs.mkdir(releases, { recursive: true });
  const release = await fs.mkdtemp(path.join(releases, `${version.replace(/[^\w.-]/g, '_')}-`));
  try {
    await fs.cp(source, release, { recursive: true, verbatimSymlinks: true });
    await fs.chmod(path.join(release, 'pencils'), 0o755);
    await fs.mkdir(path.dirname(launcher), { recursive: true });
    await fs.mkdir(path.dirname(installedIcon), { recursive: true });
    await fs.copyFile(icon, installedIcon);
    if (scalableIcon) {
      const installedVector = path.join(dataHome, 'icons/hicolor/scalable/apps/pencils.svg');
      await fs.mkdir(path.dirname(installedVector), { recursive: true });
      await fs.copyFile(scalableIcon, installedVector);
    }
    const temporary = `${current}-${process.pid}`;
    await fs.symlink(release, temporary);
    await fs.rename(temporary, current);
    await fs.writeFile(launcher, desktopEntry(path.join(current, 'pencils'), 'pencils'), { mode: 0o755 });
    return { launcher, current, release };
  } catch (error) { throw new Error(`Desktop installation did not finish: ${error.message}`); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'linux') throw new Error('The launcher installer currently supports Linux.');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const dataHome = process.env.XDG_DATA_HOME && path.isAbsolute(process.env.XDG_DATA_HOME) ? process.env.XDG_DATA_HOME : path.join(os.homedir(), '.local/share');
  const result = await installLinuxDesktop({ source: path.join(root, 'artifacts/desktop/linux-unpacked'), dataHome, icon: path.join(root, 'public/icon-512.png'), scalableIcon: path.join(root, 'public/icon.svg'), version: pkg.version });
  console.log(`Installed Pencils. Open it from your applications menu.\nLauncher: ${result.launcher}\nExecutable: ${result.current}/pencils`);
}
