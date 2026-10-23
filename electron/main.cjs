// Electron entry point: serves the built Vite app (dist/) from a custom app:// scheme
// so absolute paths like /worker.min.js resolve, and localStorage persists between launches.
const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'LedgerLens',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // Open any external links in the default browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL('app://ledgerlens/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', request => {
    const { pathname } = new URL(request.url);
    const filePath = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!filePath.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
