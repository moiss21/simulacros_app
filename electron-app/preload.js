// En tu archivo preload.js de Electron
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('select-folder'),

  // Comprobación de actualizaciones (ver main.js)
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openReleasePage: (url) => ipcRenderer.invoke('open-release-page', url),
});
