# Kit de difusión para gimnasios

Piezas listas para imprimir y para redes, para que los alumnos de un gimnasio (o de un coach) entren a REPI y la agreguen a la pantalla de inicio. Marca Concepto 2 · G · Atlética: Barlow y Barlow Condensed, navy, cian y turquesa. Las capturas de `assets/` son de la demo (datos de ejemplo).

La versión general ya está en `salida/general/`. `salida/contacto.jpg` muestra todas las piezas juntas.

## Qué QR usar

- **Versión general** (`salida/general/`): el QR abre `repiclub.com/instalar`, la guía para agregar REPI a inicio. Sirve para cualquier gimnasio o coach, para redes y para entregar en mano.
- **Versión de una sede** (recomendada para lo que se pega dentro del gimnasio): el QR abre el pedido de acceso de esa sede, con la guía de inicio incluida. El enlace sale del panel del gimnasio, en Gym › «Accesos y QR». El paso 2 del folleto cambia a «Creá tu cuenta y pedí acceso».

```bash
node marketing/kit-gimnasios/generar.mjs --gym "Gym Norte" --url "https://repiclub.com/unirse/<código-de-sede>"
```

Con `--logo ruta/al/logo.svg` el cartel de pared lleva «repi × logo del gym» arriba. Ejemplo (Smart Center Gym, sede principal; su logo está redibujado en vector en `assets/smart-center-gym.svg`):

```bash
node marketing/kit-gimnasios/generar.mjs --gym "Smart Center Gym" --url "https://repiclub.com/unirse/tzYB3ida1SAT" --logo marketing/kit-gimnasios/assets/smart-center-gym.svg
```

Se ejecuta desde la raíz del repo y deja todo en `salida/gym-norte/`. Necesita Google Chrome instalado (o la variable `CHROME` con su ruta) y conexión para bajar las fuentes. Sin `--gym` genera la versión general.

## Piezas y cómo imprimirlas

Cada pieza impresa viene en PDF (vectorial, tamaño final, sin márgenes) para la imprenta y en PNG a 300 dpi para ver o mandar por WhatsApp.

| Archivo | Tamaño | Uso | Impresión sugerida |
| --- | --- | --- | --- |
| `cartel-pared-a4` | A4, 210 × 297 mm | Cartel para la pared de la sala con QR grande | Ilustración o cartulina 250–300 g, a sangre. Lo importante queda a más de 18 mm de los bordes: se puede recortar o escalar a otra proporción (por ejemplo 3:4) sin perder nada. |
| `folleto-a5-frente` / `folleto-a5-dorso` | A5, 148 × 210 mm | Folleto para recepción y mostrador | Ilustración 300 g, doble faz, plastificado brillante. Pedir sin sangrado o agregar 3 mm en la imprenta. |
| `sticker-redondo-80mm` | Ø 80 mm | Puertas, heladera, recepción | Vinilo autoadhesivo con laminado, troquelado circular |
| `sticker-maquina-70x50` | 70 × 50 mm | Máquinas, racks y bancos: «Anotá esta serie» | Vinilo con laminado mate (resiste sudor y limpieza) |
| `sticker-espejo-100mm` | 100 × 100 mm | Espejos y columnas de la sala | Vinilo con laminado, puntas redondeadas |
| `vinilo-vidriera-200mm` | 200 × 200 mm | Vidriera o puerta de entrada, mirando hacia afuera | Vinilo de exterior con laminado UV |
| `historia-1080x1920` | 1080 × 1920 px | Historia de Instagram con capturas de la app | Sólo digital |
| `post-1080x1350` | 1080 × 1350 px | Publicación de Instagram o Facebook | Sólo digital |
| `whatsapp-1080x1080` | 1080 × 1080 px | Difusión por WhatsApp y estado | Sólo digital |

Antes de imprimir una tirada, conviene imprimir una prueba y escanear el QR con un iPhone y un Android a la distancia a la que se va a usar. Como regla, un QR se lee hasta unas diez veces su ancho: el del folleto, desde más de medio metro; el del sticker de máquina, de cerca (unos 25 cm).

## Textos para acompañar

**Publicación de Instagram (gimnasio)**

> Ahora tu rutina está en tu teléfono 📲 Con REPI ves el programa del día, anotás cada serie y seguís tu progreso. Escaneá el QR de recepción o entrá a repiclub.com/instalar, agregala a tu pantalla de inicio y listo. No hace falta bajar nada de la tienda.

**Mensaje de WhatsApp a los alumnos**

> ¡Hola! Ya podés usar REPI, la app del gym 💪 Ahí vas a tener tu rutina, anotar tus series y ver tu progreso. Entrá desde el teléfono a <enlace de la sede>, creá tu cuenta y pedí acceso; te aprobamos desde recepción. Después agregala a tu pantalla de inicio (te muestra cómo en el momento).

**Qué decir en recepción (30 segundos)**

> «¿Ya tenés REPI? Escaneá este QR con la cámara. Te creás la cuenta, nosotros te aprobamos y tu rutina te queda en el teléfono. Antes de entrenar la abrís y anotás cada serie.»

## Cómo se arma

`generar.mjs` escribe cada pieza como HTML con la marca, genera el QR con `uqr` (la misma librería que usa la app) y la exporta con Chrome sin ventana: PDF con `--print-to-pdf` y PNG con `--screenshot` a la escala que da 300 dpi. Los textos no prometen resultados ni cifras; cada gimnasio ve sus números en su panel.
