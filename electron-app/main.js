const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const express = require('express');
const path = require('path');
const fs = require('fs');

let mainWindow;

/* --- Comprobación de actualizaciones -------------------------------------
   Se consulta el último Release publicado en GitHub y se compara con la
   versión instalada. La aplicación NO descarga ni instala nada: si hay una
   versión nueva, se avisa y se abre la página de descargas en el navegador.
   ------------------------------------------------------------------------ */
const GITHUB_REPO = 'moiss21/simulacros_app';
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const UPDATE_CHECK_TIMEOUT_MS = 8000;

/**
 * Compara dos versiones semánticas.
 * @returns > 0 si `a` es posterior a `b`, < 0 si es anterior, 0 si son iguales.
 */
function compareVersions(a, b) {
  const split = (value) => {
    const [core, pre = ''] = String(value).trim().replace(/^v/, '').split('-');
    return { nums: core.split('.').map((n) => parseInt(n, 10) || 0), pre };
  };

  const left = split(a);
  const right = split(b);

  for (let i = 0; i < 3; i++) {
    const diff = (left.nums[i] || 0) - (right.nums[i] || 0);
    if (diff !== 0) return diff;
  }

  // Mismo número de versión: una prerelease es anterior a la versión final.
  if (left.pre && !right.pre) return -1;
  if (!left.pre && right.pre) return 1;
  return left.pre.localeCompare(right.pre);
}

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

/**
 * Consulta el último Release publicado. Nunca lanza: si no hay conexión o
 * GitHub no responde, devuelve estado 'error' y la aplicación sigue igual.
 */
ipcMain.handle('check-for-updates', async () => {
  const currentVersion = app.getVersion();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Simulacros/${currentVersion}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    // 404 = el repositorio todavía no tiene ningún Release publicado. No es un
    // fallo de red, así que se distingue para no dar un mensaje equivocado.
    if (response.status === 404) return { status: 'no-releases', currentVersion };
    if (!response.ok) return { status: 'error', currentVersion };

    const release = await response.json();
    const latestVersion = String(release.tag_name || '').replace(/^v/, '');
    if (!latestVersion) return { status: 'error', currentVersion };

    return {
      status: compareVersions(latestVersion, currentVersion) > 0 ? 'update-available' : 'up-to-date',
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url || RELEASES_URL,
      publishedAt: release.published_at || null,
    };
  } catch {
    return { status: 'error', currentVersion };
  }
});

/**
 * Abre la página de descargas en el navegador del sistema. Solo se permiten
 * URLs del propio repositorio: el renderer no puede abrir una dirección
 * arbitraria a través de este canal.
 */
ipcMain.handle('open-release-page', async (_event, url) => {
  const isOwnRepo =
    typeof url === 'string' && url.startsWith(`https://github.com/${GITHUB_REPO}/`);

  await shell.openExternal(isOwnRepo ? url : RELEASES_URL);
});

app.whenReady().then(() => {
  const serverApp = express();
  const appName = 'simulacros-app'; // RECUERDA: Ajusta esto al nombre de tu carpeta dist

  /* Todo se sirve sin caché. Al ser un servidor local el ahorro sería nulo,
     y en cambio Electron conserva su caché HTTP entre versiones: sin esto,
     después de actualizar la aplicación se seguiría mostrando la interfaz y
     los exámenes de la versión anterior. */
  const noCache = (res) => res.setHeader('Cache-Control', 'no-store');

  serverApp.use(
    express.static(path.join(__dirname, appName, 'browser'), {
      etag: false,
      lastModified: false,
      setHeaders: noCache,
    })
  );

  serverApp.use((req, res, next) => {
    // Si la ruta pide un archivo que existe, que lo sirva express.static
    // Si no, enviamos el index.html para que Angular maneje el routing
    noCache(res);
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