// En tu archivo preload.js de Electron
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('select-folder'),

  // Actualizaciones (ver main.js)
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  openReleasePage: (url) => ipcRenderer.invoke('open-release-page', url),

  /**
   * Suscribe al estado de la actualización (descarga, progreso, listo para
   * instalar). Devuelve la función para darse de baja.
   */
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('update-state', listener);
    return () => ipcRenderer.removeListener('update-state', listener);
  },
});
