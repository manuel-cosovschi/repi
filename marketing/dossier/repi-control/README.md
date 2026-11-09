# REPI Control · dossier comercial (2 páginas)

Dossier A4 de dos páginas para dueños de gimnasios sobre **REPI Control**, el modo de planificación supervisada de REPI.
Es material comercial: no es un contrato, una factura ni una oferta con condiciones. Revisarlo antes de compartirlo.

| Archivo | Qué es |
| --- | --- |
| `REPI-Control-dossier.pdf` | El PDF generado (A4, 2 páginas, texto seleccionable, Barlow incrustada, enlaces activos a la web y a WhatsApp) |
| `dossier.html` | Fuente del contenido. **Arriba de todo está el bloque de datos editables** (precios y contacto) |
| `dossier.css` | Diseño (G · Atlética: Barlow y Barlow Condensed, paleta navy/cian/turquesa, página clara para imprimir) |
| `render.mjs` | Genera el PDF y las vistas PNG de cada página |
| `capture.mjs` | Vuelve a tomar las capturas reales desde la demo local |
| `assets/` | Capturas (WebP), wordmark original (`wm_full.png`, copia sin cambios de `apps/web/public/brand/`) y fuentes con su licencia OFL |

## Cambiar precios o contacto

Todo vive en un solo bloque, al principio de `dossier.html`, marcado como **DATOS EDITABLES**:

```js
window.DOSSIER = {
  edicion: "Noviembre 2026",
  precios: {
    baseMensual: 30000,      // $ mensuales de base
    porSocioActivo: 95,      // $ por socio activo
    pantallasIncluidas: 1,   // pantallas autorizadas incluidas
    cambioAMedida: 30000,    // $ por pedido de cambio a medida (soporte)
    aclaracion: "Valores de referencia, no contractuales. Sujetos a propuesta personalizada.",
  },
  contacto: { web: "repiclub.com/conoce", webUrl: "https://repiclub.com/conoce", whatsapp: "223 538-3082", whatsappUrl: "https://wa.me/5492235383082" },
};
```

- Los importes se escriben como números, sin puntos (`30000`). El documento los muestra en formato es-AR (`$30.000`) en las
  cifras grandes, en la línea del escenario y en Soporte.
- `pantallasIncluidas` ajusta el singular o plural («1 pantalla autorizada incluida», «2 pantallas autorizadas incluidas»).
- Los precios son un **escenario ilustrativo**. No borrar la etiqueta «Escenario ilustrativo» ni la aclaración.
- El contacto oficial y el costo de los cambios a medida salen de `apps/web/src/lib/contact.ts`: si cambian ahí, cambiarlos acá.

Los textos de cada sección están en `dossier.html`, en orden de lectura. Antes de agregar una capacidad, confirmarla en el código
(ver «De dónde sale cada afirmación»).

## Generar el PDF

Desde la raíz del repo (usa el Chromium instalado en `/opt/pw-browsers/chromium`; otro con `CHROMIUM_PATH=…`; nunca descarga navegadores):

```bash
node marketing/dossier/repi-control/render.mjs --preview /ruta/a/vistas
```

El script carga las fuentes, vuelca los datos editables, controla que nada salga de su página y que no quede ningún dato vacío,
genera `REPI-Control-dossier.pdf` y deja `pagina-1.png` y `pagina-2.png` en la carpeta de `--preview` (por defecto, en la carpeta
temporal del sistema; las vistas no se versionan). Termina con error si algo no entra, si el PDF no tiene exactamente 2 páginas o
si pesa 3 MB o más. Si un texto nuevo no entra, acortarlo: no achicar las letras por debajo de lo que ya hay.

También se puede abrir `dossier.html` en el navegador para ver las dos páginas.

## Renovar las capturas

Con la app local levantada (por ejemplo en el puerto 3240):

```bash
node marketing/dossier/repi-control/capture.mjs http://localhost:3240
```

Usa la demo guiada (entornos ficticios que se borran solos): perfil «control» (Gimnasio Atlas) para la Pantalla de rutinas
— bienvenida sin la lista de personas de la demo, código, PIN y programa de Ana — y perfil «floor» (Gym Norte) para el panel del
equipo con el programa institucional y sus revisiones. Sólo funciona contra `localhost`. La píldora «Demo · datos ficticios»
queda visible a propósito. Si una pantalla no se puede capturar, el script se detiene: nunca reemplazar una captura por una
simulación.

**Pendiente (D216):** las capturas actuales son de la pantalla anterior, de sólo consulta (la del programa muestra el pie «Sólo
para consultar…»). Falta tomar la pantalla con «Consultar mi rutina» / «Registrar mi entrenamiento» y la vista de registro de una
serie, y actualizar `capture.mjs`. El paso 4 de la página 1 usa un esquema tipográfico sin cifras (objetivo del profesor →
sugerencia de REPI → resultado real) en lugar de una captura; los lugares a reemplazar están marcados con «CAPTURA PENDIENTE» en
`dossier.html`.

## De dónde sale cada afirmación

| Afirmación | Fuente |
| --- | --- |
| Sólo personal con permiso de programas crea, edita, asigna y publica; el socio no crea, importa ni edita rutinas ni pide programas a la IA | `apps/web/src/server/gym/routine-policy.ts` |
| Bienvenida → código de 6 números + PIN → «Consultar mi rutina» o «Registrar mi entrenamiento» → programa por días (ejercicios, series, repeticiones, descanso, notas, demostraciones si se cargaron) → «Terminar»; cierre a los 60 s sin uso; nada guardado de la persona en el equipo; QR opcional distinto del de ingreso | `apps/web/src/components/kiosk/KioskApp.tsx` |
| Registro en la pantalla (D216): objetivo del profesor → sugerencia de REPI (Training Intelligence; «Sin referencia suficiente» si no hay historial) → resultado real; mismas tablas e idempotencia que la app (sin duplicados al reintentar); misma sesión si sigue en el teléfono; el socio no cambia ejercicios, series, descansos ni cargas indicadas; la pantalla no muestra salud, notas personales ni contacto | `apps/web/src/server/gym/kiosk-training.ts`, `apps/web/src/server/gym/kiosk.ts` |
| Pantallas registradas y revocadas por dueño o gerencia; códigos y PIN inicial emitidos una vez y revocables; 5 fallos → pausa de 15 min, 10 → anulado hasta reemitir; pausa de la pantalla ante fallos repetidos; sin datos de salud, historial ni contacto; auditoría | `apps/web/src/server/gym/kiosk.ts` |
| Quitar a alguien del equipo o cambiar su rol o sede; sus tareas vuelven a la cola; auditoría | `apps/web/src/server/gym/staff-admin.ts` |
| Soporte incluido, urgencias en 24 h, cambios a medida con costo por pedido; contacto | `apps/web/src/lib/contact.ts` |
| Escenario económico | Indicado por el titular como escenario ilustrativo; no es tarifa contractual |

Fuentes tipográficas: Barlow y Barlow Condensed (SIL OFL, licencias en `assets/fonts/`).
