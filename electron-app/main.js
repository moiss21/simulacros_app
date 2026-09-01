const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const express = require('express');
const path = require('path');
const fs = require('fs');

let mainWindow;

/* --- Actualizaciones -------------------------------------------------------
   Hay dos caminos, y el segundo sólo entra cuando el primero no es posible:

   1. AUTOMÁTICO (electron-updater). En la versión instalada con el instalador
      NSIS, la actualización se descarga sola en segundo plano y se aplica al
      reiniciar. El usuario no tiene que bajar ningún .exe a mano.

   2. AVISO MANUAL (API de GitHub). El ejecutable portable no admite
      actualización en el sitio, y en desarrollo no existe app-update.yml. En
      esos casos sólo se avisa de que hay versión nueva y se abre la página de
      descargas en el navegador.

   Los binarios se publican en un repositorio PÚBLICO aparte del código: la API
   de GitHub responde 404 a cualquier consulta sin credenciales sobre un
   repositorio privado, y meter un token dentro del .exe lo dejaría a la vista
   de cualquiera que abra el asar.
   ------------------------------------------------------------------------ */
const GITHUB_REPO = 'moiss21/simulacros-releases';
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

/* Se consulta la LISTA de releases y no /releases/latest a propósito:
   - /releases/latest responde 404 tanto si no hay ninguna versión publicada
     como si el repositorio no es visible (privado, renombrado o movido), y esos
     dos casos necesitan mensajes distintos.
   - /releases devuelve [] cuando no hay versiones, así que un 404 aquí sólo
     puede querer decir que el repositorio no es accesible.
   - /releases/latest además ignora las prereleases; aquí se filtran a mano. */
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`;
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

/* La descarga la lanza electron-updater por su cuenta; la instalación no, para
   no cortar un examen a medias: se avisa y el usuario decide cuándo reiniciar. */
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

/**
 * Último estado conocido de la actualización. El renderer lo recibe por
 * `update-state` en cuanto cambia, y puede pedirlo entero con `get-update-state`
 * (por ejemplo si la ventana se recarga en mitad de una descarga).
 */
let updateState = { status: 'idle', currentVersion: app.getVersion() };

function publishUpdateState(state) {
  // Se reemplaza entero en vez de fusionar: si no, el porcentaje de una
  // descarga anterior seguiría vivo en un estado que ya no lo tiene.
  updateState = { currentVersion: app.getVersion(), ...state };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-state', updateState);
  }

  return updateState;
}

autoUpdater.on('checking-for-update', () => publishUpdateState({ status: 'checking' }));

autoUpdater.on('update-available', (info) =>
  publishUpdateState({ status: 'downloading', latestVersion: info.version, percent: 0 })
);

autoUpdater.on('update-not-available', () => publishUpdateState({ status: 'up-to-date' }));

autoUpdater.on('download-progress', (progress) =>
  publishUpdateState({
    status: 'downloading',
    latestVersion: updateState.latestVersion,
    percent: Math.round(progress.percent),
  })
);

autoUpdater.on('update-downloaded', (info) =>
  publishUpdateState({ status: 'ready-to-install', latestVersion: info.version })
);

/* Un fallo del actualizador automático no puede dejar a la aplicación sin
   saber si hay versión nueva: se cae al aviso manual. */
autoUpdater.on('error', () => {
  void runFallbackCheck();
});

/**
 * Comprobación manual contra la API de GitHub. Nunca lanza: si no hay conexión
 * o GitHub no responde, deja estado 'error' y la aplicación sigue igual.
 */
async function checkGithubReleases() {
  const currentVersion = app.getVersion();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Simulacros/${currentVersion}`,
      },
      signal: controller.signal,
    });

    // La petición va sin credenciales, así que GitHub responde 404 (no 401) a
    // todo repositorio que no sea público. Es un caso de configuración, no un
    // fallo de red ni una falta de versiones, y se informa como tal.
    if (response.status === 404) {
      return { status: 'repo-unavailable', currentVersion, httpStatus: 404 };
    }
    if (!response.ok) {
      return { status: 'error', currentVersion, httpStatus: response.status };
    }

    const releases = await response.json();

    // Sólo cuentan las versiones finales: los borradores ni siquiera se ven sin
    // credenciales y una prerelease no debe ofrecerse como actualización.
    const published = (Array.isArray(releases) ? releases : []).filter(
      (release) => release && !release.draft && !release.prerelease && release.tag_name
    );

    if (published.length === 0) return { status: 'no-releases', currentVersion };

    // La API ordena por fecha de creación, no por número de versión: republicar
    // una corrección de una versión antigua no debe adelantar a la más nueva.
    const latest = published.reduce((best, release) =>
      compareVersions(release.tag_name, best.tag_name) > 0 ? release : best
    );
    const latestVersion = String(latest.tag_name).replace(/^v/, '');

    return {
      status:
        compareVersions(latestVersion, currentVersion) > 0 ? 'update-available' : 'up-to-date',
      currentVersion,
      latestVersion,
      releaseUrl: latest.html_url || RELEASES_URL,
      publishedAt: latest.published_at || null,
    };
  } catch (error) {
    // Sin conexión, DNS caído o se agotó el tiempo de espera.
    return {
      status: 'error',
      currentVersion,
      reason: error && error.name === 'AbortError' ? 'timeout' : 'network',
    };
  } finally {
    clearTimeout(timer);
  }
}

/* El evento 'error' y el rechazo de checkForUpdates() saltan por el mismo
   fallo, así que el aviso manual se protege para no lanzarse por duplicado. */
let fallbackInFlight = false;

async function runFallbackCheck() {
  if (fallbackInFlight) return updateState;
  fallbackInFlight = true;

  try {
    return publishUpdateState(await checkGithubReleases());
  } finally {
    fallbackInFlight = false;
  }
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
 * Lanza la comprobación. Devuelve el estado en ese momento, pero el renderer no
 * depende de él: los cambios posteriores (descarga, progreso, listo para
 * instalar) llegan solos por el canal `update-state`.
 */
ipcMain.handle('check-for-updates', async () => {
  // Sin empaquetar no existe app-update.yml, así que electron-updater no puede
  // trabajar: en desarrollo se usa directamente el aviso manual.
  if (!app.isPackaged) return runFallbackCheck();

  publishUpdateState({ status: 'checking' });

  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // El listener de 'error' ya habrá lanzado el aviso manual; se espera a que
    // termine para devolver un estado definitivo y no uno a medias.
    return runFallbackCheck();
  }

  return updateState;
});

/** Estado actual, para que el renderer se sincronice al cargar. */
ipcMain.handle('get-update-state', () => updateState);

/**
 * Cierra la aplicación e instala la actualización ya descargada. Sólo tiene
 * sentido tras un 'update-downloaded'; en cualquier otro momento no hace nada.
 */
ipcMain.handle('install-update', () => {
  if (updateState.status !== 'ready-to-install') return false;

  // (silencioso, relanzar despues). El instalador es de tipo asistido, pero en
  // una actualizacion NSIS recibe --updated y reutiliza la ruta ya instalada:
  // no hay nada que preguntar, asi que ensenar el asistente solo estorbaria.
  autoUpdater.quitAndInstall(true, true);
  return true;
});

/**
 * Abre la página de descargas en el navegador del sistema. Solo se permiten
 * URLs del repositorio de publicación: el renderer no puede abrir una dirección
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