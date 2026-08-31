/**
 * Red de seguridad del build de release.
 *
 * Comprueba que la carpeta que electron-builder va a empaquetar contiene
 * ÚNICAMENTE los recursos permitidos: el examen de prueba, el ejemplo de
 * plantilla, la guía y los prompts. Si se cuela cualquier banco de preguntas
 * real, el proceso falla antes de publicar nada.
 *
 * Uso: node scripts/verify-release-assets.js
 */
const fs = require("fs");
const path = require("path");

const ASSETS_DIR = path.join(
  __dirname,
  "..",
  "electron-app",
  "simulacros-app",
  "browser",
  "assets"
);

/* Rutas exactas permitidas (relativas a browser/assets, con "/" como separador) */
const ALLOWED_FILES = new Set([
  "exams/index.json",
  "exams/prompt.txt",
  "guia/GUIA.md",
  "local-exams/examen-de-prueba.json",
  "local-exams/ejemplo-plantilla.json",
]);

/* Prefijos permitidos: cualquier archivo bajo estas rutas es válido */
const ALLOWED_PREFIXES = [];

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory()
      ? listFiles(full, base)
      : [path.relative(base, full).split(path.sep).join("/")];
  });
}

if (!fs.existsSync(ASSETS_DIR)) {
  console.error(`ERROR: no existe la carpeta de assets empaquetados: ${ASSETS_DIR}`);
  console.error('Ejecuta antes "npm run electron:build:release".');
  process.exit(1);
}

const files = listFiles(ASSETS_DIR);
const intrusos = files.filter(
  (f) => !ALLOWED_FILES.has(f) && !ALLOWED_PREFIXES.some((p) => f.startsWith(p))
);

if (intrusos.length > 0) {
  console.error("\n❌ El build de release contiene recursos NO permitidos:\n");
  intrusos.forEach((f) => console.error(`   - assets/${f}`));
  console.error(
    "\nRevisa la configuración \"release\" de angular.json: solo deben empaquetarse" +
      "\nlos exámenes de demostración, la guía y los prompts.\n"
  );
  process.exit(1);
}

/* El índice de exámenes tampoco puede apuntar fuera de la carpeta de demos */
const indexPath = path.join(ASSETS_DIR, "exams", "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const fueraDeDemo = index.filter((entry) => !ALLOWED_FILES.has(`local-exams/${entry}`));

if (fueraDeDemo.length > 0) {
  console.error("\n❌ assets/exams/index.json referencia exámenes fuera de demo/:\n");
  fueraDeDemo.forEach((f) => console.error(`   - ${f}`));
  process.exit(1);
}

console.log("\n✔ Contenido empaquetado verificado. Archivos incluidos:\n");
files.sort().forEach((f) => console.log(`   assets/${f}`));
console.log(`\n✔ ${files.length} archivo(s), ningún examen real incluido.\n`);
