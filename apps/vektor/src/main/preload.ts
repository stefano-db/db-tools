import { contextBridge, ipcRenderer } from 'electron';

// Explizite Whitelist: nur diese Funktionen erreichen den Main-Prozess.
contextBridge.exposeInMainWorld('vektor', {
  savePng: (data: ArrayBuffer, suggestedName: string): Promise<{ saved: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export-png', data, suggestedName),
});
