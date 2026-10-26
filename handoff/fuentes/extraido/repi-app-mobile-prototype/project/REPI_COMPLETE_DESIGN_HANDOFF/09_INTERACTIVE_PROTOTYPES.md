# 09 · Prototipos interactivos

Todos son **Design Components** (`.dc.html`): HTML autocontenido que carga `support.js` (runtime del entorno de diseño) y monta plantilla + clase lógica. Son fuente editable de referencia, **no** código de producción (no React de producción, sin backend).

## Cómo ejecutarlos
1. Servir la carpeta `prototypes/` con un servidor estático (necesario para localStorage/IndexedDB compartidos y módulos): `npx serve prototypes` o `python3 -m http.server -d prototypes`.
2. Abrir cada `.dc.html`. Requiere internet para Google Fonts y three.js (unpkg, `three@0.160.0`).
3. Para el flujo de récords: abrir **App Alumno v3** y **Desktop Gym** en dos pestañas del **mismo navegador**. Restablecer datos: Desktop Gym › Comunidad › "Prototipo: restablecer datos".

## Índice
| Archivo | Superficie | Pantallas | Controles de prototipo |
|---|---|---|---|
| `REPI App Alumno v3.dc.html` (canónico) | App alumno | SCR-M-01..25 | Panel lateral de flujos; props: alumnoTipo (gym/personal), introMode (auto/first/quick/off), restDuration, bodyModel (generico/ajustado), startScreen, showFlowPanel |
| `REPI Motion Intro.dc.html` | Conceptos intro | SCR-MI-01..03 | Reproducir, modo (primer inicio/regular/reducido), 0,25× |
| `REPI Desktop Gym.dc.html` | Gym (entrenador, gerente, dueño) | SCR-GT-*, SCR-GM-*, SCR-GC-*, SCR-GO-*, SCR-GX-* | Barra "ver como" (Agustín, Sofía, Lucía, Martín); prop startPersona |
| `REPI Desktop Coach.dc.html` | Coach | SCR-C-*, SCR-CX-01 | — |
| `REPI Admin.dc.html` | REPI Admin | SCR-A-*, SCR-AX-01 | — |
| `repi-shared.js` | Store de prototipo | — | localStorage (`repi_gym_*`, `repi_member_*`) + IndexedDB `repi_proofs` |
| `legacy/REPI App Alumno v1.dc.html` | App alumno v1 | sin motion | — |
| `legacy/REPI App Alumno v2.dc.html` | App alumno v2 | + motion, sin pestaña Gym | — |
| `legacy/REPI Escritorio (incompleto).dc.html` | Desktop unificado | Solo plantilla, **sin lógica** | No funcional |

## Qué es real vs simulado
- Real en el navegador: navegación, estado, cálculos, gráficos, temporizador por reloj, three.js, subida de video local (IndexedDB), imágenes redimensionadas (data URL), notificaciones cross-tab (evento storage).
- Simulado: cámara de captura guiada, reconstrucción 3D, exportar/eliminar datos, importar CSV, enviar solicitudes de acceso, respuestas del chat, pagos, autenticación, persistencia en servidor.

## Datos de demo
Ficticios: Gym Norte (Palermo, Belgrano, Caballito), personas Agustín Pérez, Sofía Ramírez, Lucía Méndez, Martín Ruiz, Valentina Gómez; coach con 6 clientes; admin con 4 gyms y 4 coaches. Fechas mayo 2026.

## Capturas
No se incluyen capturas exhaustivas (solo `screenshots/` de referencia si existen). La fuente editable es el `.dc.html`.
