# QR permanente de REPI (remera ATICMA Awards 2026 y otros impresos)

El código abre **https://repiclub.com/qr**. Esa dirección no cambia; el destino se cambia en el sitio, sin reimprimir (ver `docs/comercial/EXPERIENCE_HUB.md` §2). Hoy lleva a la presentación `/conoce` medida como «remera · aticma-2026».

| Archivo | Uso |
| --- | --- |
| `repi-qr-navy-sobre-blanco.svg` / `.png` | Prenda o fondo claro. **Vectorial (SVG) para la estampa.** |
| `repi-qr-blanco-sobre-navy.svg` / `.png` | Prenda navy u oscura (módulos claros sobre fondo oscuro). |

- **Especificaciones:** versión 3 (29 × 29 módulos más un margen de 2), corrección de errores **Q** (tolera cerca del 25 % de daño o arrugas). PNG de 3000 px.
- **Verificado:** las dos variantes se leyeron y devolvieron `https://repiclub.com/qr` con el mismo lector de QR que usa la app (jsQR).
- **Tamaño en la remera:** al menos 6 × 6 cm para que se lea a 60 cm; en la espalda, 10–12 cm se lee a más de un metro.
- **Estampa:**
  - Respetar el margen blanco (o navy) alrededor del código; sin logos encima del código.
  - Contraste alto. En serigrafía, sin degradados ni transparencias.
- **Antes de la tirada:** imprimir una prueba en la tela real y escanear con un iPhone y un Android, con la prenda puesta (la tela se estira).
- **Otros materiales:** pueden usar `repiclub.com/qr/folleto`, `/qr/stand`, `/qr/gimnasios` o `/qr/entrenadores`, así cada pieza se mide por separado. Generarlos igual: `renderSVG(url, { ecc: "Q", border: 2 })` de la librería `uqr`.
