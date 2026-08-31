/**
 * Fija la misma versión en el package.json raíz y en el de electron-app.
 * electron-builder toma de ahí el nombre de los artefactos y la versión del .exe.
 *
 * Uso: node scripts/set-version.js 1.2.3
 */
const fs = require("fs");
const path = require("path");

const version = (process.argv[2] || "").replace(/^v/, "").trim();

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`ERROR: versión inválida: "${process.argv[2]}". Se esperaba algo como 1.2.3`);
  process.exit(1);
}

const targets = [
  path.join(__dirname, "..", "package.json"),
  path.join(__dirname, "..", "electron-app", "package.json"),
];

for (const file of targets) {
  const raw = fs.readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const pkg = JSON.parse(raw);
  pkg.version = version;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2).split("\n").join(eol) + eol);
  console.log(`✔ ${path.relative(path.join(__dirname, ".."), file)} -> ${version}`);
}
