# Simulacros

Aplicación de escritorio para practicar exámenes tipo test. Cargas tus propios
bancos de preguntas en JSON desde una carpeta de tu equipo y la aplicación los
corrige aplicando penalización por fallo, tiempo límite y nota de corte, igual
que un examen real.

Funciona **100% en local**: no hay servidor, ni cuentas, ni se envía nada a
internet. Está construida con Angular 20 y empaquetada con Electron.

---

## Índice

- [Características](#características)
- [Instalación (usuarios)](#instalación-usuarios)
- [Formato de los exámenes](#formato-de-los-exámenes)
- [Desarrollo](#desarrollo)
- [Compilar el ejecutable](#compilar-el-ejecutable)
- [Ramas y flujo de trabajo](#ramas-y-flujo-de-trabajo)
- [Publicar una versión (CI/CD)](#publicar-una-versión-cicd)
- [Qué se publica y qué no](#qué-se-publica-y-qué-no)
- [Licencia](#licencia)

---

## Características

- **Exámenes propios en JSON** — se cargan desde cualquier carpeta del equipo con
  el botón *Cargar Carpeta Exámenes*, sin recompilar nada.
- **Tandas aleatorias** — `totalQuestionsToDisplay` extrae N preguntas al azar de
  un banco mayor, y las opciones se barajan en cada intento.
- **Corrección realista** — penalización por fallo configurable, preguntas de
  respuesta única y múltiple, opción de contar o no las respuestas en blanco.
- **Tiempo límite opcional** — con cuenta atrás y aviso en el último minuto.
- **Nota de corte** — porcentaje de aciertos netos necesario para el APTO, con
  nota final sobre 10 y aciertos necesarios para aprobar.
- **Agrupación por unidades** — `groupByUnit` organiza el simulacro por temas.
- **Explicaciones** — cada opción y cada pregunta pueden llevar su justificación,
  que se muestra al corregir.
- **Exportación a PDF** — imprime el resultado con o sin las notas de corrección.
- **Tema claro y oscuro** — se ajusta al del sistema y se recuerda entre sesiones.
- **Guía integrada** — el botón *Cómo crear exámenes* documenta el formato dentro
  de la propia aplicación.

## Instalación (usuarios)

Descarga la última versión desde la página de
[**Releases**](https://github.com/moiss21/simulacros_app/releases):

| Archivo | Para qué sirve |
| --- | --- |
| `Simulacros-Setup-<versión>.exe` | Instalador con acceso directo en el menú de inicio. |
| `Simulacros-<versión>-portable.exe` | Ejecutable directo, sin instalación. |
| `GUIA.md` | Guía de uso y formato de los exámenes. |
| `prompts.txt` | Prompt para generar preguntas con una IA. |
| `examenes-demo.zip` | Examen de prueba y ejemplo de plantilla. |

Windows puede avisar de que el editor es desconocido, porque el binario no está
firmado digitalmente: **Más información → Ejecutar de todas formas**.

El ejecutable llega con dos exámenes de demostración para comprobar que todo
funciona. Para usar los tuyos, crea una carpeta con tus archivos `.json` y
selecciónala desde la aplicación.

## Formato de los exámenes

Cada examen es un único `.json` con dos claves de primer nivel: `examProperties`
(la ficha del examen) y `questions` (el banco de preguntas).

```jsonc
{
  "examProperties": {
    "id": "mi-examen.json",            // identificador, sin barras: usa el nombre del archivo
    "subjectName": "ASIGNATURA",
    "examTitle": "Título del examen",
    "examSummary": "Descripción que se ve antes de empezar.",
    "subjectColor": "#2F6FEB",         // opcional: color de la tarjeta
    "examUnits": ["Unidad 1 - Nombre"], // opcional: solo si agrupas por unidades
    "examConfig": {
      "penaltyRate": 0.5,              // fracción que resta cada fallo (0 = sin penalización)
      "examDurationMinutes": 0,        // 0 = sin temporizador
      "canChangeResponse": true,       // false = la respuesta queda fijada al contestar
      "passingPercentage": 60,         // nota de corte en %
      "totalQuestionsToDisplay": 40,   // preguntas de la tanda activa
      "emptyAnswersCount": false,      // true = las preguntas en blanco penalizan
      "groupByUnit": false             // opcional: agrupa las preguntas por unidad
    }
  },
  "questions": [
    {
      "id": 1,
      "text": "Enunciado de la pregunta",
      "type": "single",                // "single" (una correcta) o "multi" (varias)
      "generalExplanation": "Explicación que se muestra al corregir.",
      "unit": { "unitNumber": 1, "unitName": "Unidad 1 - Nombre" },
      "options": [
        { "text": "Opción correcta", "isCorrect": true,  "explanation": "Por qué lo es." },
        { "text": "Distractor",      "isCorrect": false, "explanation": "Por qué no lo es." }
      ]
    }
  ]
}
```

> Los comentarios `//` del ejemplo **no son válidos en JSON**: están solo para
> documentar cada campo.

La referencia completa está en [src/assets/guia/GUIA.md](src/assets/guia/GUIA.md),
que también se publica en cada Release. El modelo de datos vive en
[src/app/models/exam.model.ts](src/app/models/exam.model.ts), y
[src/assets/exams/prompt.txt](src/assets/exams/prompt.txt) contiene el prompt
afinado para generar preguntas con una IA a partir de un temario.

## Desarrollo

Requisitos: **Node.js 20+** y npm.

```bash
npm install
npm start          # servidor de desarrollo en http://localhost:4200/
npm test           # tests unitarios con Karma
```

En el navegador la aplicación carga los exámenes listados en
`src/assets/exams/index.json`; el botón de cargar carpeta solo funciona dentro
del ejecutable, porque necesita el puente de Electron.

### Estructura

```
src/app/
  home/          Listado de exámenes y carga de carpeta externa
  exam/          Ejecución, corrección y exportación a PDF del simulacro
  exam-legend/   Guía del formato integrada en la aplicación
  services/      ExamService: lectura de exámenes locales o externos
  models/        Tipos del formato de examen
src/assets/
  exams/         index.json (exámenes del build completo) y prompt.txt
  exams-release/ index.json alternativo usado solo en el build de release
  local-exams/   Bancos de preguntas; demo/ son los dos que sí se publican
  guia/          GUIA.md que se empaqueta y se adjunta a los Releases
public/          favicon.ico: icono de la página que sirve Electron
electron-app/    Proceso principal de Electron y configuración de electron-builder
  icon.ico       Icono del .exe, del instalador y de la ventana
scripts/         Compilación del .exe, versionado y verificación del release
```

### Icono de la aplicación

El icono vive en dos sitios, y ambos deben ser el mismo archivo:

| Archivo | Dónde se ve |
| --- | --- |
| `electron-app/icon.ico` | Ejecutable, instalador, desinstalador, acceso directo y ventana de la aplicación. |
| `public/favicon.ico` | Pestaña de la página que Electron sirve en local. |

Debe ser un `.ico` **con una imagen de 256×256**, o electron-builder lo rechaza.
Para cambiarlo, sustituye los dos archivos y recompila.

## Compilar el ejecutable

Hay dos modos de empaquetado:

```bash
npm run electron:build          # incluye TODOS los exámenes de src/assets
npm run electron:build:release  # solo demos + guía + prompts (lo que se publica)
```

Añade `--debug` para abrir las DevTools dentro del `.exe`:
`node scripts/electron-build.js --release --debug`.

El resultado queda en `electron-app/dist/`, como instalador NSIS
(`Simulacros-Setup-<versión>.exe`) y como ejecutable portable
(`Simulacros-<versión>-portable.exe`).

## Ramas y flujo de trabajo

| Rama | Papel |
| --- | --- |
| `feature` | Rama de trabajo, previa a producción. Aquí se integran los cambios del día a día. |
| `main` | Rama final de producción. De aquí salen las versiones publicadas. |

El ciclo habitual:

```bash
# 1. Trabajar e integrar en feature
git checkout feature
git push origin feature          # CI compila y deja el .exe como artefacto

# 2. Promover a producción cuando feature está estable
git checkout main
git merge feature
git push origin main

# 3. Etiquetar sobre main para publicar el Release
git tag v1.2.3
git push origin v1.2.3
```

Los pushes a `feature` **no crean Releases**: solo compilan y dejan el `.exe`
como artefacto de la ejecución, para poder probarlo antes de promover. El
Release público se genera únicamente al empujar la etiqueta.

## Publicar una versión (CI/CD)

Los workflows viven en [.github/workflows/](.github/workflows/):

| Workflow | Cuándo se ejecuta | Qué produce |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | En cada push (incluida `feature`) y cada pull request | Compila el `.exe` y lo deja como artefacto de la ejecución, disponible 30 días. **No** crea Release. |
| [`release.yml`](.github/workflows/release.yml) | Al empujar una etiqueta `v*`, o manualmente | Crea el **Release** de GitHub con los `.exe` descargables, la guía, los prompts y los exámenes de demostración. |

### Publicar desde `main`

```bash
git checkout main
git pull
git tag v1.2.3
git push origin v1.2.3
```

En unos minutos el Release aparece en la pestaña
[Releases](https://github.com/moiss21/simulacros_app/releases) con los
ejecutables listos para descargar.

### Publicar a mano

Desde **Actions → Release → Run workflow**, indicando la versión (`1.2.3`) y, si
procede, marcando *prerelease*. Es la vía para publicar una beta desde `feature`
sin haber promovido todavía a `main`: elige la rama en el desplegable de
*Run workflow* y marca la casilla de prerelease.

### Numeración

El número de versión sale de la etiqueta (`v1.2.3` → `1.2.3`) y
[scripts/set-version.js](scripts/set-version.js) lo propaga a `package.json` y a
`electron-app/package.json` antes de compilar, de modo que aparece en el nombre
de los archivos generados. No hace falta tocar la versión a mano en ningún sitio.

Se sigue [versionado semántico](https://semver.org/lang/es/): `MAJOR.MINOR.PATCH`.

## Qué se publica y qué no

El ejecutable publicado se compila con la configuración `release` de
[angular.json](angular.json), que **excluye los bancos de preguntas reales**.
Solo se empaquetan:

- `src/assets/local-exams/demo/examen-de-prueba.json` — simulacro de 5 preguntas.
- `src/assets/local-exams/demo/ejemplo-plantilla.json` — ejemplo comentado del formato.
- `src/assets/exams/prompt.txt` — prompt de generación de preguntas.
- `src/assets/guia/GUIA.md` — guía de uso y formato.

[scripts/verify-release-assets.js](scripts/verify-release-assets.js) se ejecuta
después de compilar y **aborta el workflow** si se cuela cualquier otro examen,
así que los bancos reales no pueden acabar en un Release por descuido.

Los usuarios cargan sus propios exámenes desde una carpeta local con el botón de
cargar carpeta de la aplicación.

## Licencia

Uso no comercial. Consulta [LICENSE.md](LICENSE.md).
