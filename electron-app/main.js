const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const express = require('express');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // IMPORTANTE: Asegúrate de tener este archivo creado (punto 2)
      preload: path.join(__dirname, 'preload.js'), 
    },
  });


  


  mainWindow.loadURL('http://localhost:3000');
}

// --- Manejadores IPC ---
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (result.canceled) return null;

  const folderPath = result.filePaths[0];
  
  // Leemos los archivos de la carpeta
  const files = fs.readdirSync(folderPath);
  
  // Filtramos solo los JSON y enviamos el contenido completo para evitar problemas de rutas
  const examFiles = files.filter(f => f.endsWith('.json')).map(fileName => {
    const fullPath = path.join(folderPath, fileName);
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return { ...content, fileName }; // Añadimos el fileName para el ID
  });

  return examFiles;
});

app.whenReady().then(() => {
  const serverApp = express();
  const appName = 'simulacros-app'; // RECUERDA: Ajusta esto al nombre de tu carpeta dist

  serverApp.use(express.static(path.join(__dirname, appName, 'browser')));

  serverApp.use((req, res, next) => {
    // Si la ruta pide un archivo que existe, que lo sirva express.static
    // Si no, enviamos el index.html para que Angular maneje el routing
    res.sendFile(path.join(__dirname, appName, 'browser', 'index.html'));
  });

  serverApp.listen(3000, () => {
    console.log('Servidor escuchando en http://localhost:3000');
    createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});