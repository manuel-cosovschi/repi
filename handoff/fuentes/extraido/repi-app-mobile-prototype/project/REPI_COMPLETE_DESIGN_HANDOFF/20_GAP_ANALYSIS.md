# 20 · Análisis de brechas

Severidad: Alta = bloquea MVP o requiere validación legal/científica · Media = necesaria para V1/V2 · Baja = limpieza.

| ID | Severidad | Área | Brecha | Siguiente paso |
|---|---|---|---|---|
| GAP-01 | Alta | Identidad | Autenticación, onboarding de coach y de alumno no diseñados | Diseñar flujos (brief 3.1) |
| GAP-02 | Alta | Entrenamiento | Offline/sincronización sin estados de UI (pendiente, conflicto, error) | Diseñar estados + reglas |
| GAP-03 | Alta | Facturación | Definición de "facturable" inconsistente entre Coach, Gym y Admin | Decisión comercial única |
| GAP-04 | Alta | Legal | Datos de salud, nutrición, fotos, video de récords: requieren revisión legal (Ley 25.326) | Revisión legal antes de piloto |
| GAP-05 | Alta | Body Intelligence | Reconstrucción 3D personalizada, métricas de composición y extracción de PDFs sin validar científicamente | Investigación científica separada |
| GAP-06 | Media | Repi Club | Feed social, reacciones, rankings, trofeos y moderación del Club no diseñados | Diseñar (ver SCR-N-09) |
| GAP-07 | Media | Reseñas | El flujo de reseña del socio existía en gym v2 (persona móvil) y fue retirado; falta en App Alumno v3 | Agregar prompt de reseña en app v3 |
| GAP-08 | Media | Nutrición | El coach ve nutrición, pero la captura de comidas/hidratación del lado alumno no está diseñada | Diseñar registro en app |
| GAP-09 | Media | Salud | Captura de lesiones/molestias/check-in diario del lado alumno no diseñada (datos mostrados al coach son de ejemplo) | Diseñar en app |
| GAP-10 | Media | Programación | Versionado de programas, superseries, tempo, RPE por serie, sustituciones y preview como alumno no prototipados | Extender constructor |
| GAP-11 | Media | Biblioteca | Gestión de ejercicios (CRUD, medios, licencias) no diseñada; miniaturas son placeholders | Diseñar + conseguir medios licenciados |
| GAP-12 | Media | Roles | Recepción y coordinador sin pantallas propias | Diseñar o confirmar reutilización |
| GAP-13 | Media | Pagos | Checkout/pasarela, cupones, promociones del coach no diseñados (solo KPI "1 promo activa") | Diseñar tras decisión de proveedor |
| GAP-14 | Media | Admin | Feature flags, soporte, salud del sistema, costos IA, MRR/ARR/churn; edición de planes por defecto | Diseñar |
| GAP-15 | Media | Notificaciones | Preferencias, push, email no diseñados | Diseñar |
| GAP-16 | Baja | Legacy | REPI Escritorio.dc.html: plantilla sin lógica, datos "Núcleo"/oct-nov, umbral n=10 | Descartar o tomar solo como referencia |
| GAP-17 | Baja | Handoff previo | developer-handoff v3 conserva secciones de membresías/ingresos del gym (ya marcadas como superadas) | Usar este paquete como fuente |
| GAP-18 | Baja | Prototipo | repi-shared.js comparte datos solo entre pestañas del mismo navegador (localStorage/IndexedDB) | En producción: backend + push |
| GAP-19 | Baja | Fechas demo | Prototipos usan mayo 2026; fecha actual oct 2026 | Unificar seeds DEMO |
| GAP-20 | Baja | Empty/error states | Varias pantallas móviles sin empty state (Inicio sin programa, Mensajes vacío, Novedades vacía) | Completar |
| GAP-21 | Media | Motion | KPI count-up, FLIP, trofeo 3D, estados de pago, mensajería, sonido/háptica: solo especificados | Diseñar con Club/pagos |
| GAP-22 | Media | Responsive | Mobile del desktop (<768) usa drawer + filas que envuelven; no revisado visualmente en 375/390/430 para todas las pantallas; grilla de turnos y tablas admin con scroll horizontal | QA responsive |
| GAP-23 | Baja | Accesibilidad | Navegación por teclado básica (focus-visible, Esc en modales); sin trap de foco ni anuncios ARIA live completos | Auditoría WCAG 2.2 |
| GAP-24 | Media | Multi-organización | Cambio real de relación gym/coach dentro de la app alumno v3 no prototipado (solo tweak alumnoTipo) | Diseñar selector de relación |

## Inconsistencias detectadas
- **INC-01** Umbral de muestra de reseñas: 5 (Desktop Gym) vs 10 (Escritorio legacy).
- **INC-02** Definición de facturable distinta en Coach (relación activa + programa), Gym (uso real ≥1 entrenamiento, contrato) y Admin (máximo / al día de cobro / promedio).
- **INC-03** Handoff previo (assets/previous-handoff) aún describe membresías/ingresos del gym; superado por DEC-10.
- **INC-04** Brief original pide botón cian con texto blanco; diseño usa texto oscuro (DEC-03).
- **INC-05** Datos demo: "Gym Norte" y mayo 2026 en prototipos actuales vs "Núcleo" y oct/nov en legacy.
- **INC-06** El coach mantiene cobros manuales a sus clientes (brief original) mientras que el gym no gestiona cobros (DEC-10): es intencional, pero debe explicitarse en producto.
- **INC-07** Flujo de reseña del socio y relación dual gym+coach fueron prototipados en Gym v2 y retirados con la persona móvil; no están en App Alumno v3.
