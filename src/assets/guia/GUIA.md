# Guía de uso — Simulacros

Esta versión distribuida **no incluye bancos de preguntas reales**. Solo se
empaquetan dos exámenes de demostración, esta guía y los prompts de generación:

| Recurso | Ruta dentro de la aplicación |
| --- | --- |
| Examen de prueba (5 preguntas) | `assets/local-exams/examen-de-prueba.json` |
| Ejemplo comentado del formato | `assets/local-exams/ejemplo-plantilla.json` |
| Prompts de generación | `assets/exams/prompt.txt` |
| Esta guía | `assets/guia/GUIA.md` |

Tus propios exámenes se cargan desde una carpeta de tu equipo, así que nunca
salen de tu ordenador ni viajan en el instalador.

---

## 1. Instalar y abrir

1. Descarga desde la sección **Releases** de GitHub el archivo de la última versión:
   - `Simulacros-Setup-<versión>.exe` → instalador con acceso directo.
   - `Simulacros-<versión>-portable.exe` → ejecutable directo, sin instalar.
2. Windows puede mostrar el aviso *"Windows protegió su PC"* porque el binario no
   está firmado digitalmente. Pulsa **Más información → Ejecutar de todas formas**.
3. Al abrir verás los dos exámenes de demostración. Úsalos para comprobar que todo
   funciona antes de cargar los tuyos.

## 2. Cargar tus propios exámenes

1. Crea una carpeta en tu equipo (por ejemplo `C:\Mis simulacros`).
2. Copia dentro todos los archivos `.json` de tus exámenes (sin subcarpetas: la
   aplicación lee los `.json` que estén directamente en la carpeta elegida).
3. En la aplicación, usa el botón de **cargar carpeta** y selecciona ese directorio.
4. La lista de exámenes pasa a mostrar los tuyos en lugar de los de demostración.

## 3. Modos de examen

Antes de empezar, la pantalla previa deja elegir dos cosas independientes. Se
combinan libremente, así que hay cuatro formas de hacer el mismo simulacro.

**Preguntas**

- **Todas a la vez** — se listan todas y las respondes en el orden que quieras.
- **Una a una** — solo una en pantalla, con botones de anterior y siguiente.
  Puedes ir y volver: lo ya respondido se conserva.

**Corrección**

- **Al final** — ves todas las soluciones al pulsar TERMINAR Y CORREGIR.
- **Pregunta a pregunta** — cada pregunta gana un botón *Comprobar respuesta*
  que la corrige en el sitio, con su explicación y su puntuación.

Al comprobar una pregunta queda **bloqueada**: no se puede cambiar la respuesta
después de haber visto la solución. De lo contrario la nota final no significaría
nada. Las demás preguntas siguen editables con normalidad.

Elijas lo que elijas, al terminar el examen se listan **todas** las preguntas con
su corrección, y el PDF sale completo.

Para estudiar conviene *una a una* con corrección *pregunta a pregunta*: fijas
cada concepto en el momento. Para simular el examen real, *todas a la vez* con
corrección *al final*.

## 4. Formato de un examen

Cada examen es un único archivo `.json` con dos claves de primer nivel:
`examProperties` (la ficha del examen) y `questions` (el banco de preguntas).

```jsonc
{
  "examProperties": {
    "id": "mi-examen.json",           // identificador, usa el nombre del archivo
    "subjectName": "ASIGNATURA",      // nombre corto del bloque o asignatura
    "examTitle": "Título del examen",
    "examSummary": "Descripción que se ve antes de empezar.",
    "subjectColor": "#2F6FEB",        // opcional: color de la tarjeta
    "examUnits": [                     // opcional: solo si agrupas por unidades
      "Unidad 1 - Nombre",
      "Unidad 2 - Nombre"
    ],
    "examConfig": {
      "penaltyRate": 0.5,             // fracción que resta cada fallo (0 = sin penalización)
      "examDurationMinutes": 0,       // 0 = sin temporizador
      "canChangeResponse": true,      // false = la respuesta queda fijada al contestar
      "passingPercentage": 60,        // nota de corte en %
      "totalQuestionsToDisplay": 40,  // preguntas de la tanda activa
      "emptyAnswersCount": false,     // true = las preguntas en blanco penalizan
      "groupByUnit": false            // opcional: agrupa las preguntas por unidad
    }
  },
  "questions": [
    {
      "id": 1,
      "text": "Enunciado de la pregunta",
      "type": "single",               // "single" (una correcta) o "multi" (varias)
      "generalExplanation": "Explicación que se muestra al corregir.",
      "unit": {                        // opcional, requiere groupByUnit y examUnits
        "unitNumber": 1,
        "unitName": "Unidad 1 - Nombre"
      },
      "options": [
        { "text": "Opción correcta",   "isCorrect": true,  "explanation": "Por qué es correcta." },
        { "text": "Distractor 1",      "isCorrect": false, "explanation": "Por qué no lo es." },
        { "text": "Distractor 2",      "isCorrect": false, "explanation": "Por qué no lo es." },
        { "text": "Distractor 3",      "isCorrect": false, "explanation": "Por qué no lo es." }
      ]
    }
  ]
}
```

### Reglas prácticas

- `totalQuestionsToDisplay` puede ser menor que el número de preguntas del banco:
  se usa para sacar tandas más cortas de un banco grande.
- En las preguntas `multi` marca `isCorrect: true` en todas las opciones válidas.
- `explanation` es opcional en cada opción, pero recomendable: es lo que convierte
  el simulacro en material de estudio.
- Los comentarios `//` del ejemplo anterior **no son válidos en JSON**: están solo
  para explicar cada campo. Tu archivo real no debe llevarlos.
- Valida el archivo antes de usarlo. Con Node instalado:
  `node -e "JSON.parse(require('fs').readFileSync('mi-examen.json','utf8'))"`

## 5. Generar preguntas con una IA

El archivo `assets/exams/prompt.txt` contiene el prompt afinado para generar
preguntas de calidad a partir de un temario. El flujo recomendado:

1. Pega el prompt de `prompt.txt` en tu asistente de IA.
2. Adjunta el temario, apuntes o documento de referencia.
3. Indica cuántas preguntas quieres y, si procede, las unidades a cubrir.
4. Pide la salida directamente en el formato JSON de la sección 4.
5. Guarda el resultado como `.json` en tu carpeta de simulacros y cárgalo.

Conviene revisar siempre las preguntas generadas: la IA puede producir
distractores ambiguos o respuestas correctas discutibles.

## 6. Compilar tu propia versión

Si prefieres empaquetar el ejecutable con tus exámenes ya incluidos, clona el
repositorio y ejecuta:

```bash
npm install
npm run electron:build        # incluye todos los exámenes de src/assets
npm run electron:build:release # solo demos, guía y prompts (lo que se publica)
```

El ejecutable queda en `electron-app/dist/`.
