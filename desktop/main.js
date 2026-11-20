import { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, net, screen, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_SERVER, normalizeServerURL, navigationAllowed, externalURL, restoreBounds, readPreferences, writePreferences } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const connectionURL = pathToFileURL(path.join(here, 'connection.html')).href;
const icon = path.join(here, '../public/icon-512.png');
app.setName('Pencils');
if (process.env.PENCILS_DESKTOP_USER_DATA) app.setPath('userData', path.resolve(process.env.PENCILS_DESKTOP_USER_DATA));
app.setDesktopName('pencils.desktop');

let workspace = null, connection = null, preferences = {}, server = '', connecting = false, automatic = false, problem = '';
const secure = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false };
const background = () => nativeTheme.shouldUseDarkColors ? '#1e2521' : '#f9f9f5';
const persist = () => writePreferences(app.getPath('userData'), preferences);
function bringForward(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function openExternal(value) {
  const url = externalURL(value);
  if (url) shell.openExternal(url).catch(() => dialog.showErrorBox('Could not open link', 'Your default browser could not open this address.'));
}
function savedServer() {
  try { return normalizeServerURL(process.env.PENCILS_SERVER_URL || preferences.server || DEFAULT_SERVER); }
  catch { return DEFAULT_SERVER; }
}
function connectionSender(event) {
  if (!connection || event.sender !== connection.webContents || event.senderFrame !== connection.webContents.mainFrame || event.senderFrame.url !== connectionURL)
    throw new Error('This action is only available from the connection window.');
}
function rememberWindow() {
  if (!workspace || workspace.isDestroyed()) return;
  preferences.bounds = workspace.getNormalBounds();
  preferences.maximized = workspace.isMaximized();
  try { persist(); } catch (error) { console.error('Could not save desktop window:', error.message); }
}
function showConnection(message = '', auto = false) {
  if (connection && !connection.isDestroyed()) return bringForward(connection);
  problem = message; automatic = auto;
  connection = new BrowserWindow({ width: 510, height: 370, minWidth: 390, minHeight: 320, title: 'Connect to Pencils', icon, show: false, autoHideMenuBar: true,
    parent: workspace || undefined, backgroundColor: background(), webPreferences: { ...secure, preload: path.join(here, 'preload.cjs') } });
  connection.setMenu(null);
  connection.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  connection.webContents.on('will-navigate', event => event.preventDefault());
  connection.once('ready-to-show', () => { if (!auto) bringForward(connection); });
  connection.on('closed', () => { connection = null; });
  void connection.loadURL(connectionURL);
}
function allowPopup(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const guard = (event, url) => {
    if (url !== 'about:blank' && !(externalURL(url)?.startsWith('https:') || navigationAllowed(url, server))) event.preventDefault();
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('will-attach-webview', event => event.preventDefault());
}
function createWorkspace() {
  const bounds = preferences.bounds && typeof preferences.bounds === 'object' ? preferences.bounds : {};
  const area = Number.isFinite(bounds.x) && Number.isFinite(bounds.y) ? screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea : screen.getPrimaryDisplay().workArea;
  workspace = new BrowserWindow({ ...restoreBounds(bounds, area), minWidth: 640, minHeight: 480, title: 'Pencils', icon, show: false,
    autoHideMenuBar: true, backgroundColor: background(), webPreferences: secure });
  if (preferences.maximized) workspace.maximize();
  const win = workspace, contents = win.webContents;
  const guard = (event, url) => {
    if (!navigationAllowed(url, server)) { event.preventDefault(); openExternal(url); }
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', (event, url) => { if (!navigationAllowed(url, server)) event.preventDefault(); });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(({ url, frameName }) => {
    // Miro's existing sign-in flow opens a blank window then navigates it after requesting OAuth.
    // It stays sandboxed and unprivileged; ordinary external links use the default browser.
    if (url === 'about:blank' && frameName === 'pencils-miro' && BrowserWindow.getAllWindows().length < 4)
      return { action: 'allow', overrideBrowserWindowOptions: { width: 720, height: 780, autoHideMenuBar: true, webPreferences: secure } };
    if (navigationAllowed(url, server)) void contents.loadURL(url).catch(() => {});
    else openExternal(url);
    return { action: 'deny' };
  });
  contents.on('did-create-window', child => { child.setMenu(null); allowPopup(child.webContents); });
  contents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Keep editing', 'Leave'], defaultId: 0, cancelId: 0, title: 'Unsaved changes', message: 'This page has changes that have not been saved. Leave it?' });
    if (choice === 1) event.preventDefault();
  });
  contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !connecting) showConnection('The server could not be reached. Check that it is running, then reconnect.');
  });
  contents.on('render-process-gone', () => showConnection('The workspace stopped responding. Reconnect to reopen it.'));
  win.on('close', rememberWindow);
  win.on('closed', () => { if (workspace === win) workspace = null; });
  return win;
}
async function connect(value) {
  if (connecting) return { ok: false, error: 'A connection is already in progress.' };
  connecting = true;
  const previous = server;
  let created = false;
  try {
    const chosen = normalizeServerURL(value);
    const response = await net.fetch(`${chosen}/api/health`, { signal: AbortSignal.timeout(10000), redirect: 'error', credentials: 'omit' });
    const health = response.ok && await response.json();
    if (!health?.ok || typeof health.version !== 'string') throw new Error('This address did not respond as a Pencils server.');
    server = chosen;
    if (!workspace) { createWorkspace(); created = true; }
    await workspace.loadURL(`${chosen}/`);
    preferences.server = chosen;
    persist();
    bringForward(workspace);
    // Let the local renderer receive the result before closing its window.
    setTimeout(() => connection?.close(), 50);
    return { ok: true };
  } catch (error) {
    server = previous;
    if (created && workspace) { workspace.destroy(); workspace = null; }
    bringForward(connection);
    return { ok: false, error: /server|address|bookmark/i.test(error.message) ? error.message : 'Could not connect. Check the server address and that Pencils is running, then try again.' };
  } finally { connecting = false; }
}
function menus() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Connect to server…', click: () => showConnection() },
      { label: 'Open in browser', click: () => openExternal(workspace?.webContents.getURL() || savedServer()) },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'toggleDevTools' }] },
    { label: 'Help', submenu: [{ label: 'About Pencils', click: () => dialog.showMessageBox({ type: 'info', title: 'Pencils', message: `Pencils Desktop ${app.getVersion()}`, detail: `Connected to ${server || savedServer()}.\nYour workspace and data live on your Pencils server.` }) }] },
  ]));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => bringForward(connection || workspace));
  app.on('activate', () => { if (workspace || connection) bringForward(connection || workspace); else showConnection('', true); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.whenReady().then(() => {
    preferences = readPreferences(app.getPath('userData'));
    // Remote pages have no desktop bridge and can request only user-initiated clipboard access
    // or fullscreen. Camera, microphone, geolocation, arbitrary devices and notifications stay off.
    const permitted = (contents, permission, details = {}) => contents && navigationAllowed(details.requestingUrl || contents.getURL(), server) &&
      (permission === 'fullscreen' || permission === 'clipboard-sanitized-write');
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(permitted(contents, permission, details)));
    session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => permitted(contents, permission, details));
    session.defaultSession.on('will-download', (_event, item) => item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) }));
    ipcMain.handle('pencils:connection-state', event => { connectionSender(event); return { server: savedServer(), automatic, error: problem, connected: !!workspace, version: app.getVersion() }; });
    ipcMain.handle('pencils:connect', (event, value) => { connectionSender(event); return connect(value); });
    ipcMain.handle('pencils:cancel-connection', event => { connectionSender(event); connection.close(); });
    menus(); showConnection('', true);
  }).catch(error => { dialog.showErrorBox('Pencils could not start', error.message); app.quit(); });
}
