const { contextBridge, ipcRenderer } = require('electron');

// This preload belongs only to the bundled connection window. The workspace has no preload.
contextBridge.exposeInMainWorld('pencilsConnection', Object.freeze({
  state: () => ipcRenderer.invoke('pencils:connection-state'),
  connect: (server) => ipcRenderer.invoke('pencils:connect', server),
  cancel: () => ipcRenderer.invoke('pencils:cancel-connection'),
}));
