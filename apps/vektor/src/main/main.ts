import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    title: 'Vektor',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// Einziger IPC-Endpunkt in M0: PNG unter einem vom Nutzer gewählten Pfad speichern.
ipcMain.handle('export-png', async (event, data: ArrayBuffer, suggestedName: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { saved: false };
  const safeName = path.basename(String(suggestedName)) || 'export.png';
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: safeName,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  });
  if (canceled || !filePath) return { saved: false };
  await writeFile(filePath, Buffer.from(data));
  return { saved: true, filePath };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
