# REPI · Commercial Sales Kit 2026 — dossier para gimnasios

Material de venta para dueños y gerencia de gimnasios. **No se publica en el sitio ni se envía a clientes sin autorización del titular.** Es material comercial: no es un contrato, una factura ni una oferta con condiciones.

## Entregables

| Archivo | Qué es |
| --- | --- |
| `salida/REPI_DOSSIER_COMERCIAL_GIMNASIOS.pdf` | Dossier A4 de 11 páginas: problema → solución → socio → entrenadores → dueño → diferencial → inversión → cuota → inventario → implementación → cierre |
| `salida/REPI_RESUMEN_COMERCIAL_GIMNASIOS.pdf` | Resumen de una página para el primer contacto |
| `paginas/` | Vista PNG de cada página (para revisar o mandar una página suelta) |
| `capturas/` | Capturas reales de la demo guiada (datos ficticios), usadas en los PDF |
| `fuente/precios.json` | Precios ilustrativos, cuota de ejemplo, contacto y destino del QR |
| `fuente/generar.mjs` | Genera los dos PDF y las vistas por página |
| `fuente/capturas.mjs` | Vuelve a tomar las capturas desde la app local |
| `FUNCIONALIDADES_VERIFICADAS.md` | Qué capacidad se usa, con qué estado y de dónde sale |

Los PDF tienen texto seleccionable, fuentes Barlow incrustadas, gráficos vectoriales, enlaces activos (sitio, WhatsApp con mensaje precargado, email) y un QR verificado (decodificado en la revisión) a `repiclub.com/conoce/gimnasios` con UTM `dossier`.

## Cómo actualizar precios o textos

1. Editar `fuente/precios.json`. Los dos escenarios y la cuota recalculan todos los números (porcentajes, diferencia, puntos del gráfico, recupero). Los valores actuales (400 × $200 y 500 × $170, cuota $60.000) son **ejemplos ilustrativos** provistos por el titular; no agregar tarifas para otros tamaños sin confirmación.
2. Los textos de cada página están en `fuente/generar.mjs` (una sección por página). Cualquier funcionalidad nueva primero va a `FUNCIONALIDADES_VERIFICADAS.md` con su evidencia.
3. Generar desde la raíz del repo:

```bash
node marketing/dossier-gimnasios-2026/fuente/generar.mjs
```

El script avisa si algún contenido no entra en su página y deja las vistas en `paginas/` (necesita `pdftoppm`). Revisar todas las páginas antes de compartir.

## Versión personalizada por vendedor

```bash
node marketing/dossier-gimnasios-2026/fuente/generar.mjs --ref V-AB12CD --asesor "Nombre Apellido"
```

`--ref` agrega el código comercial del vendedor al QR y al enlace (`?ref=`), para que el contacto quede registrado con su origen (REPI Sales Force, D209). `--asesor` muestra el nombre en el cierre. No se agregan teléfonos ni emails personales: el contacto sigue siendo el oficial. Guardar la copia generada con otro nombre antes de volver a generar la general.

## Cómo renovar las capturas

Con la app local levantada (`pnpm build && pnpm start`, base `repi_dev`), desde la raíz:

```bash
node marketing/dossier-gimnasios-2026/fuente/capturas.mjs http://localhost:3000
```

Usa la demo guiada (entorno ficticio por visita, se borra a las 6 h), oculta la píldora de la demo y sólo funciona contra `localhost`. Si una pantalla no se puede capturar, el generador se detiene: nunca reemplazar una captura por una simulación.

## Reglas que respeta el material

- Sólo capacidades disponibles; lo que se activa por gimnasio o está en primera etapa lo dice. Lo que está en desarrollo aparece sólo en «En evolución».
- Sin promesas de retención, ingresos, bajas o resultados físicos; sin testimonios ni cifras de clientes. Smart Center Gym aparece en una línea, sin métricas (nombre autorizado, D205/D206).
- Los importes son ejemplos; se factura la cantidad de socios acordada, no los usuarios activos; impuestos y condiciones según la propuesta.
- Marca: wordmark original con su punto cian, Barlow y Barlow Condensed, paleta navy/cian/turquesa y fondo hueso.

Fuentes: Barlow y Barlow Condensed (SIL OFL, licencias en `fuente/assets/`).
