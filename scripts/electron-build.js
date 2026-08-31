const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { tittle } = require("./scripts-assets/tittle");
const { exportToExeTittle } = require("./scripts-assets/export-tittle");

const isDebug = process.argv.includes("--debug");
/* Modo release: empaqueta solo los examenes de demostracion, la guia y los prompts */
const isRelease = process.argv.includes("--release");

// Colores ANSI para la terminal
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

// Configuración de rutas (Normalizadas con __dirname)
const ANGULAR_JSON = path.join(__dirname, "..", "angular.json");

/* Nombre real del proyecto Angular -> carpeta de salida de "ng build" */
function resolveAngularDist() {
  const config = JSON.parse(fs.readFileSync(ANGULAR_JSON, "utf8"));
  const projectName = Object.keys(config.projects)[0];
  const outputPath =
    config.projects[projectName].architect?.build?.options?.outputPath ||
    path.join("dist", projectName);

  return path.join(__dirname, "..", outputPath);
}

const ANGULAR_DIST = resolveAngularDist();
const ELECTRON_APP = path.join(__dirname, "..", "electron-app");
const APP_FOLDER = path.join(ELECTRON_APP, "simulacros-app");
const MAIN_FILE = path.join(ELECTRON_APP, "main.js");
const DIST_PATH = path.join(ELECTRON_APP, "dist");

console.log(tittle)
console.log(exportToExeTittle)

console.log(`\n${CYAN}🚀 INICIANDO COMPILACIÓN DE ELECTRON${RESET}`);
console.log(`${CYAN}----------------------------------------${RESET}`);
if (isDebug) {
  console.log(`🔧 Modo Depuración (Debug): ${GREEN}ACTIVADO${RESET}`);
} else {
  console.log(`🔧 Modo Debug: ${YELLOW}DESACTIVADO${RESET}`);
  console.log(`${YELLOW}⚠️ Las DevTools NO se abrirán al ejecutar el .exe si necesitas debugear fallos.${RESET}`);
}
if (isRelease) {
  console.log(`📚 Contenido: ${GREEN}SOLO demos + guía + prompts${RESET} (modo release)`);
} else {
  console.log(`📚 Contenido: ${YELLOW}TODOS los exámenes de src/assets${RESET}`);
}
console.log(`${CYAN}----------------------------------------${RESET}`);

/* =================================================================
   1. Compilación de producción de Angular
================================================================= */
console.log(`\n${MAGENTA}📦 [1/2] Compilando el frontend de Angular...${RESET}`);
const NG_BUILD = isRelease
  ? "ng build --configuration production,release"
  : "ng build";
execSync(NG_BUILD, { stdio: "inherit" });

/* =================================================================
   2. Limpieza de la carpeta de destino de Electron (Silencioso)
================================================================= */
if (fs.existsSync(APP_FOLDER)) {
  execSync(`rimraf "${APP_FOLDER}"`, { stdio: "ignore" });
}

/* =================================================================
   3. Copiar dist de Angular a la carpeta de ejecución de Electron (Silencioso)
================================================================= */
if (!fs.existsSync(ANGULAR_DIST)) {
  console.log(`
${RED}ERROR: No se encontro la salida de Angular en:${RESET} ${ANGULAR_DIST}`);
  process.exit(1);
}

execSync(`cpx "${ANGULAR_DIST}/**/*" "${APP_FOLDER}"`, { stdio: "ignore" });

/* =================================================================
   4. Parche en tiempo de ejecución para DevTools (Silencioso)
================================================================= */
let main = fs.readFileSync(MAIN_FILE, "utf8");

if (isDebug) {
  if (!main.includes("openDevTools")) {
    main = main.replace(
      "function createWindow() {",
      `function createWindow() {\n  mainWindow.webContents.openDevTools();`
    );
  }
} else {
  main = main.replace(/mainWindow\.webContents\.openDevTools\(\);?/g, "");
}

fs.writeFileSync(MAIN_FILE, main);

/* =================================================================
   5. Empaquetado de Electron (electron-builder)
================================================================= */
console.log(`\n${MAGENTA}📦 [2/2] Empaquetando la aplicación nativa...${RESET}`);
/* electron-builder necesita las dependencias instaladas dentro de electron-app */
if (!fs.existsSync(path.join(ELECTRON_APP, "node_modules"))) {
  console.log(`${YELLOW}Instalando dependencias de electron-app (primera vez)...${RESET}`);
  execSync("npm install", { cwd: ELECTRON_APP, stdio: "inherit" });
}

execSync("npm run dist", { cwd: ELECTRON_APP, stdio: "inherit" });

/* =================================================================
   6. Localizar el ejecutable generado
================================================================= */
console.log(`\n${CYAN}🔎 Buscando ejecutable en el directorio de salida...${RESET}`);

function findExe(dir) {
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir);

  /* Coincidencia directa (salida de electron-builder para Windows) */
  const direct = entries.find((f) => f.endsWith(".exe"));
  if (direct) {
    return path.join(dir, direct);
  }

  /* Búsqueda recursiva de respaldo (win-unpacked u otros destinos) */
  for (const entry of entries) {
    const full = path.join(dir, entry);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        const result = findExe(full);
        if (result) return result;
      }
    } catch (_) {}
  }

  return null;
}

const exePath = findExe(DIST_PATH);

/* =================================================================
   7. Reporte final por consola
================================================================= */
console.log(`\n${CYAN}========================================${RESET}`);
console.log(`${GREEN}✨ COMPILACIÓN FINALIZADA CON ÉXITO ✨${RESET}`);
console.log(`${CYAN}========================================${RESET}`);

if (exePath) {
  console.log(`\n${GREEN}📦 DETALLES DEL ARCHIVO GENERADO:${RESET}`);
  console.log(`🔹 ${YELLOW}Nombre del ejecutable:${RESET}  ${path.basename(exePath)}`);
  console.log(`🔹 ${YELLOW}Carpeta de salida:${RESET}     ${path.dirname(exePath)}\n`);
} else {
  console.log(`\n${RED}❌ ERROR: No se encontró ningún archivo ejecutable (.exe) en dist/${RESET}`);
  console.log(`${YELLOW}Revisa los logs superiores de electron-builder para más detalles.${RESET}\n`);
}