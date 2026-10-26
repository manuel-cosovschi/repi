# REPI — PROMPT MAESTRO DEFINITIVO, VISUALMENTE FIEL A LA REFERENCIA APROBADA

## PRIORIDAD ABSOLUTA: LA IMAGEN ORIGINAL ES LA ÚNICA FUENTE DE VERDAD VISUAL

La imagen `00_ORIGINAL/REPI_MARCA_APROBADA_REFERENCIA_MAESTRA.png` adjunta por el propietario de Repi contiene **el diseño exacto elegido**. **No la reinterpretés**. Toda divergencia de logo, isotipo, tipografía visual, navegación, composición, color, contraste, densidad, bordes o jerarquía se considera un error de implementación a corregir. Leé y observá la imagen COMPLETA primero, antes de escribir componentes.

### Jerarquía de fuentes para identidad visual (de mayor a menor autoridad)

1. **La imagen maestra aportada por el propietario** (`00_ORIGINAL/...png`).
2. Sus **recortes pixel exactos** en `01_MARCA`, `02_ENTRENADOR` y `03_ALUMNO`. Los recortes NO son diseños nuevos: conservan los mismos píxeles.
3. Reglas explícitas de color y tipografía expresadas más abajo, en tanto coincidan con la imagen.
4. Descripciones textuales del comportamiento de nuevas pantallas.

**Ignorá y NO reutilices los diseños anteriores del kit `REPI_Kit_Antigravity`:** los archivos `repi_wordmark_white.svg`, `repi_wordmark_dark.svg`, `repi_app_icon.svg`, las pantallas antiguas generadas separadamente y los rediseños son APROXIMACIONES RECHAZADAS POR EL USUARIO. No sirven como guía de identidad y nunca tienen prioridad sobre esta imagen.

### Reglas inequívocas del logo

- Logotipo `repi` blanco, minúsculas, redondeado, grueso, geometría **exacta como la captura**, incluyendo unión de letras, altura de x, forma de la `e`, descendente de la `p`, la forma de la `r` y el punto cian de la `i`.
- El isotipo es **la `r` blanca geométrica exacta de la referencia, acompañada del punto cian** en la misma posición; no usar una `r` normal en Inter Tight ni otro símbolo.
- La tipografía **de UI** es Inter Tight; **el logo no es Inter Tight renderizado como texto**. No reconstruir el logo escribiendo la palabra en una fuente genérica.
- Mientras no exista un vector fiel trazado y verificado, **usar directamente el PNG del recorte original del logotipo sobre fondo compatible**. Si se necesita fondo transparente o vector: trazado controlado del contorno original, contrastar superposición con la captura, pedir revisión de geometría final antes de reemplazar el asset; jamás sustituirlo con un logo parecido.
- No redibujar la app icon con estilos propios. Tomar el `icono_principal_recorte.png` como **referencia estricta** y verificar la posición/forma de la `r`, del punto y del borde del cuadrado oscuro.

### Guía de UI exacta extraída visualmente

- Pantalla entrenador: sidebar azul-negro oscuro, marca pequeña en blanco/cian arriba, línea activa cian y resaltado azul profundo, fondo de contenido blanco cálido, tipografía negra en negrita Inter Tight, tarjetas blancas con radio bajo/medio, borde gris casi invisible, separación compacta pero respirable, KPI en fila, botón primario cian brillante con texto blanco; composición general tal como `dashboard_original_exacto.png`.
- Constructor: MISMO sidebar oscuro, fondo claro, pantalla ancha tipo editor, columna izquierda de biblioteca de ejercicios con miniaturas y filtros, editor a la derecha con series, repetición, pausa e iconos pequeños. NO convertirlo en tarjetas gigantes ni en estética diferente.
- Alumno: fondo navy-negruzco, encabezado tipográfico blanco (logo o título), tarjetas muy oscuras pero diferenciadas, highlights cian, barra de navegación inferior en oscuro, indicadores cian, controles y gráficas compactos; composición precisa de `inicio_original_exacto.png`, `entrenamiento_original_exacto.png`, `progreso_original_exacto.png`.
- Perfil alumno (entrenador): panel BLANCO con nombre+avatar, status verde semántico, tabs compactas, línea de progreso celeste y lista de entrenamientos con check verdes, tal como `perfil_alumno_original_exacto.png`.
- **No copiar literalmente errores menores de texto** de la imagen generada: conservar el diseño mientras corregís ortografía, accesibilidad, semántica y textos legibles en producto.

### Verificación visual obligatoria con navegador

En cada vista aprobada:

1. Ejecutar app local con datos de demostración no reales.
2. Abrir la referencia original y la captura actual al mismo tamaño de viewport; comparar lado a lado.
3. Evaluar geometría del logo, icono, tipografía, densidad, sidebar, bordes, espaciados, colores, jerarquía, cards, gráficos y navegación.
4. Producir capturas reales del navegador y listado de diferencias.
5. Corregir iterativamente las diferencias observadas ANTES de dar la pantalla por terminada.
6. Para nuevas pantallas sin imagen de referencia, extender el sistema visual existente, no inventar otro.
7. NO declarar «igual» si no comparaste las capturas reales; reconocer límites de exactitud del raster.

**Importante:** los archivos individuales fueron extraídos DIRECTAMENTE de la imagen del usuario, sin diseño generativo adicional. La fidelidad de los recortes está garantizada; la recreación en código debe verificarse y no tiene garantía automática de identidad píxel-perfect.

---

## ARCHIVOS NUEVOS QUE TENÉS QUE INSPECCIONAR

- `00_ORIGINAL/REPI_MARCA_APROBADA_REFERENCIA_MAESTRA.png` — referencia visual única, completa.
- `01_MARCA/logo_original_exacto.png` — wordmark y tagline en panel original.
- `01_MARCA/icono_y_variantes_exacto.png` — variantes de icono incluidas en panel original.
- `01_MARCA/icono_principal_recorte.png` — icono principal extraído del mismo panel.
- `01_MARCA/paleta_original_exacta.png` — colores y uso, en panel original.
- `01_MARCA/tipografia_original_exacta.png` — Inter Tight y jerarquías, en panel original.
- `02_ENTRENADOR/dashboard_original_exacto.png` — sidebar, dashboard completo.
- `02_ENTRENADOR/constructor_original_exacto.png` — editor de entrenamientos.
- `02_ENTRENADOR/perfil_alumno_original_exacto.png` — ficha de alumno.
- `03_ALUMNO/inicio_original_exacto.png` — inicio alumno, vista oscura.
- `03_ALUMNO/entrenamiento_original_exacto.png` — set logging y temporizador.
- `03_ALUMNO/progreso_original_exacto.png` — métricas y gráfico.
- `03_ALUMNO/vista_app_icono_original_exacto.png` — presentación del icono en pantalla de móvil.

Mantené todas las especificaciones funcionales, técnicas y de seguridad que siguen. Si hay conflicto visual con una descripción genérica, **prevalece la imagen maestra**. No copies pantallas como fondos: implementá componentes y datos reales.

---

## 1. VISIÓN Y PROPUESTA DE VALOR

**Repi** es un SaaS B2B2C para entrenadores personales que gestionan alumnos presenciales, online o híbridos. Centraliza lo que hoy suelen organizar con WhatsApp, planillas, PDFs y notas: cartera de alumnos, objetivos, programación, asistencia, entrenamiento registrado, comunicación, cuotas, reportes y alertas.

**Cliente pagador:** entrenador independiente u organización. **Usuario final:** alumno invitado por su entrenador. El alumno no le paga directamente a Repi. El entrenador puede absorber el costo o incorporarlo al precio de su servicio. Futuro: gimnasios con varios entrenadores y clientes compartidos con permisos controlados.

Promesa funcional:

- Para el entrenador: **«Todos tus alumnos y tu negocio en un lugar»**. Menos trabajo administrativo y mejor seguimiento.
- Para el alumno: **«Tu entrenamiento, claro y simple»**. Abrir la app, hacer su rutina, registrar series y ver progresos.

**North Star inicial:** alumnos que registraron al menos una sesión válida en los últimos 7 días *por entrenador activo*, además de retención mensual de entrenadores. Medir activación «entrenador creó alumno + publicó rutina + alumno completó sesión», D7/D30, adherencia, tiempos de registro de serie, errores de sincronización y coste de servicio por alumno.

**Posicionamiento:** una aplicación premium y cercana, sencilla en uso y viable en precio para Argentina/LatAm. No copiar ni prometer funcionalidades de competidores sin verificarlas.

### Modelo comercial

Hipótesis inicial: **ARS $700 por alumno activo facturable al mes**. No es un precio aprobado ni definitivo. Configurable por admin desde base de datos. Soportar escalones, mínimo de facturación, prueba gratuita, cupones, descuentos, impuestos, precios históricos y moneda. No hardcodear importes. Nunca usar coma flotante para dinero. Definir reglas claras para altas, bajas, pausas y prorrateos. Cobrar al **entrenador**, no procesar micropagos individuales de $700. Separar estrictamente **cobros del entrenador a sus alumnos** de **suscripción del entrenador a Repi**.

---

## 2. DISEÑO VISUAL DEFINITIVO

### Marca y logo

Wordmark propio `repi`, todo en minúsculas, formas geométricas redondeadas, amable pero premium, en blanco cálido sobre fondo profundo o casi negro sobre fondo claro. El punto de la letra `i` es cian `#00D1FF`. El logo es un **asset dedicado**, no simplemente escribir «repi» con la tipografía de interfaz.

Isotipo: una `r` minúscula blanca estilizada, de trazo grueso, curva redonda y punto cian arriba a la derecha, encerrada en cuadrado oscuro de esquinas grandes. Debe funcionar como app icon, favicon, avatar y PWA. Convertir a SVG optimizado y PNG derivados en tamaños adecuados (16, 32, 180, 192, 512 y máscara), con variante monocromática de ser necesaria. Garantizar clearspace y fidelidad a referencias.

### Colores inamovibles de identidad

- Fondo profundo: `#0B0F14`.
- Superficie oscura: `#1A2433`.
- Superficie secundaria: `#2D3B4F`.
- Acento principal: `#00D1FF`.
- Acento secundario: `#5DE6D8`.
- Blanco cálido: `#F8FAFC`.

Completar tokens semánticos accesibles para texto, bordes, tarjetas, hover, focus, éxito, advertencia y error. El cian **no se utiliza para todo**: reservarlo a CTAs, selección, focos, indicadores importantes y datos destacados. Evitar neon green, glow exagerado, gradientes decorativos, sombras pesadas y sobrecarga de gráficos. Si un uso de cian falla WCAG AA, ajustar contraste/contexto sin cambiar el color de marca.

### Tipografía de UI

**Inter Tight** para toda la interfaz, no necesariamente para el logo custom. Cargar familia legalmente, evitar fuentes externas bloqueantes, usar subset y font-display apropiado. Pesos 400/500/600/700/800. Display 40–48 px, H1 28–32, H2 20–24, H3 16–18, body 14–16, caption 12–13 (no reducir texto esencial al extremo). Números tabulares en finanzas, cronómetros y métricas. Excelente espaciado y jerarquía, diseño en español rioplatense.

### Dualidad de interfaces

**Entrenador: Premium Light**. Base blanco cálido/neutral muy claro, sidebar azul muy oscuro, cards claras, bordes delicados, datos fáciles de explorar en pantallas grandes, acciones rápidas y tablas bien diseñadas. Debe ser excelente también en móvil.

**Alumno: Performance Dark**. Base oscura, superficies elevadas de azul grafito, tipografía blanca, acento cian medido, CTA grande, tactilidad y facilidad con una mano. Debe sentirse como app fitness premium, no como dashboard administrativo reducido.

Ambas experiencias: mismos tokens, geometrías, radio 12–18px en tarjetas (ajustar según referencia), iconos consistentes (por ejemplo Lucide), motion sutil 120–250ms, reduced-motion, estados hover/focus/pressed/disabled/skeleton/empty/error/success. Responsive real 375/390/430/768/1024/1440px. Textos fluidos sin truncamiento ni overflow. Contraste WCAG 2.2 AA y áreas táctiles generosas. No depender solo del color.

### Usar las imágenes como especificaciones, no como fondos

Reconstruir interfaces **con HTML/CSS/componentes reales**; NO insertar capturas como fondos de pantallas o poner botones encima de una imagen. Crear componentes y tokens reutilizables. Navegación y acciones deben funcionar.

---

## 3. INVENTARIO DE PRODUCTO COMPLETO

### 3.1 Sitio público y activación

Landing, beneficios, cómo funciona, precios configurables, FAQs, contacto, términos/privacidad, registro, login, verificación de email, olvidé contraseña, recuperación, estados de error, CTA de prueba. SEO técnico y accesibilidad. No inventar testimonios ni métricas de mercado. Español Argentina por defecto; preparar localización a otros idiomas.

**Onboarding del entrenador:** registro → email verificado → perfil profesional → organización/espacio → preferencias → primer alumno → primera plantilla/programa → asignar → dashboard. Mostrar progreso sin pedir datos innecesarios, guardar el estado, permitir retomar. **Onboarding alumno:** recibe enlace seguro → registro/login → aceptación explícita de invitación → datos mínimos y consentimientos correspondientes → programa asignado → primera sesión.

### 3.2 Workspace del entrenador

**Inicio:** KPIs de alumnos activos, adherencia semanal, sesiones completadas, alertas de baja actividad, próximo calendario, notas pendientes, pagos, actividad reciente y acciones rápidas. Datos reales; definiciones de métricas explícitas. Alertas útiles, no saturación.

**Alumnos:** listado con búsqueda, filtros, paginación y columnas configurables; alta, edición, invitación, pausa, reactivación, archivado, baja lógica. Importación CSV con preview, validación, deduplicación y reporte de errores. Perfil: datos básicos, objetivos, experiencia, disponibilidad, notas privadas, restricciones declaradas solo si son necesarias y con tratamiento apropiado; programa actual, sesiones, registros, adherencia, asistencia, progresión, medidas, fotos privadas, cuotas y mensajes. Control de acceso granular.

**Ejercicios:** biblioteca propia con categorías, grupo muscular, patrón de movimiento, equipamiento, bilateral/unilateral, instrucciones, variantes, medios con licencias claras, favoritos, ejercicios personales de cada organización. Búsqueda inmediata; no scraping ni material sin licencia.

**Constructor de entrenamientos:** clases `Programa → versión → semanas → días → ejercicios → prescripciones de series`. Prescripción completa: sets, reps/rangos, kg/carga/unidades, RPE, RIR, tempo, descanso, duración, distancia, calentamiento, notas, superseries, biseries, circuitos, unilateral, series especiales y sustituciones. Duplicar día/semana/programa, plantillas, borradores, preview como alumno, publicación, asignación a alumno(s), edición de futuras sesiones. Sin drag-and-drop obligatorio; teclado, botones y accesibilidad. Evitar que editar un programa modifique el pasado.

**Calendario/asistencia:** vistas semana/mes, sesiones programadas, sesiones completadas, cancelaciones, ausencias, registro manual por entrenador. Separar asistencia presencial de entrenamiento registrado desde la app.

**Progreso:** peso/medidas (opcionales), volumen de entrenamiento por ejercicio/grupo con fórmula documentada, frecuencia, adherencia, récords, cargas históricas, registros por serie, fotos privadas, comparaciones entre períodos. Distinguir datos registrados y estimados, evitar comparaciones matemáticamente inválidas. Cargas en kg por defecto y conversiones a lb sin perder precisión.

**Mensajes y notificaciones:** chat básico entrenador–alumno, notificaciones in-app, email y Web Push opcional, plantillas de recordatorios, preferencia individual, reportes de entrega. Evitar capacidades invasivas o spam. Restricción de permisos por relación activa.

**Pagos que el entrenador recibe de alumnos:** planes/cantidad de sesiones, precio del entrenador, vencimientos, marcar pago manual, historial de cobros, pendientes, vencidos, recordatorios y resumen mensual. No prometer facturación fiscal automática. Pagos online de alumnos es futuro, activable solo con integración real.

**Configuración:** perfil, marca del entrenador dentro de límites (foto, nombre comercial, color opcional sin alterar identidad núcleo), privacidad, notificaciones, facturación Repi, exportación y eliminación de cuenta. Futuro: página pública de captación por entrenador y checkout de sus servicios.

### 3.3 App del alumno

**Inicio:** saludo, entrenamiento de hoy, próxima sesión, semana visual, progreso, mensajes del entrenador, CTA «Comenzar entrenamiento». **Rutina/programa:** calendario, ejercicios, descripción, instrucciones y valores previos.

**Entrenamiento activo (la UX más importante):** iniciar → ejercicio → ver prescripción/registro anterior → introducir carga/reps/RPE/RIR/tiempo según tipo → marcar serie hecha en un toque → temporizador de descanso con pausar, omitir, +30s → siguiente ejercicio → pausar/reanudar → terminar y ver resumen. Gran objetivo: registrar una serie en pocos toques, sin scroll tedioso ni modales constantes. Inputs utilizables con una mano, teclado numérico apropiado, haptic opcional donde se admita, confirmaciones sin interrumpir. Mostrar estado autosave y sincronización.

**Entrenamiento offline:** guardar localmente en IndexedDB, cola de mutaciones, IDs estables/idempotentes, reintentos al reconectar, sincronización también cuando vuelve el foco (no depender de background sync universal), prevención de duplicados. Resolver conflictos si se edita la misma sesión desde dos dispositivos; advertir y preservar los registros. Nunca descartar series en silencio. Limitar datos sensibles que se guardan offline.

**Fin de sesión:** duración, ejercicios, series, comentarios, PRs reales/estimados indicados, resumen sin gamificación infantil. **Progreso:** fuerza/volumen/constancia/medidas, historial y objetivos. **Mensajes:** chat con su entrenador. **Perfil:** datos básicos, permisos, privacidad, exportación y borrado. Alumno con múltiples entrenadores futuro: modelar la relación sin duplicar el User.

### 3.4 Administración interna Repi

Acceso aislado y auditado de plataforma: entrenadores, organizaciones, planes, tarifas, alumnos facturables, suscripciones, facturas internas, cobros, uso y coste estimado de IA, tickets de soporte, feature flags, estadísticas, errores y salud del sistema. Métricas MRR, ARR, ARPA, churn e ingresos recibidos **con fórmulas definidas**. No mezclar ingresos de entrenadores con ingresos de Repi. Opcional exportación futura a Sovare HQ, pero **no crear dependencia ni identidad compartida**.

---

## 4. FACTURACIÓN Y REGLAS DE NEGOCIO

La **fuente de verdad** de precios debe ser persistente y versionada: `Plan`, `PricingTier`, `PriceVersion`, `CoachSubscription`, `BillingPeriod`, `BillableClientSnapshot`, `Invoice`, `InvoiceLine`, `PaymentTransaction`, `BillingEvent`, `Coupon` (si se implementa), `WebhookEvent`.

**Alumno activo deportivo ≠ alumno activo facturable.** Propuesta inicial de facturable: relación entrenador–alumno aceptada, acceso habilitado y vigente en el período; una semana sin entrenar NO quita facturación. Formalizar reglas para invitados sin aceptar, pausas, archivados, cierres de mes y prorrateos. El admin puede modificar precios para nuevas altas con fecha efectiva; mantener facturas históricas inmutables. Utilizar centavos/enteros o decimal exacto; transacciones e idempotencia; impedir cargos duplicados.

**Cobros:** adaptador independiente del proveedor. Para Argentina, evaluar integración real con Mercado Pago y modalidad de suscripciones disponible actualmente. Nunca publicar keys, ni almacenar tarjetas. Webhooks autenticados, deduplicados y procesados desde backend; el regreso del navegador no acredita un pago. En ausencia de credenciales, generar facturación interna y modo sandbox claramente señalizado, sin activar pagos reales. Diferenciar factura interna de comprobante fiscal legal.

**Precios iniciales solo como hipótesis:** ARS $700/alumno/mes. No imponer tramos o mínimo arbitrario en producción; exponer configuración flexible y dejar valores de demo explícitamente identificados. Presentar al entrenador estimado siguiente cobro y motivo de variaciones.

---

## 5. ARQUITECTURA RECOMENDADA

Preferencia por **monolito modular TypeScript**, sin microservicios prematuros:

- Frontend + backend: Next.js App Router actual estable, React, TypeScript `strict`, Tailwind CSS y primitives accesibles (Radix/shadcn cuando ayuden). Elegir TanStack Query si hay beneficios claros; React Hook Form + Zod para formularios.
- Base de datos: PostgreSQL administrado + Prisma ORM (o alternativa justificada), migraciones versionadas, índices y transacciones.
- Autenticación: biblioteca mantenida y compatible, verificación de correo, restablecimiento de contraseña, sesiones seguras, expiración/revocación y protección antiabuso.
- API: endpoints tipados REST u opción equivalente cuidadosamente documentada; lógica de dominio fuera de componentes; validación cliente y servidor.
- Jobs: cola transaccional/outbox para notificaciones, recordatorios, facturación y tareas asíncronas; reintentos con idempotencia.
- Almacenamiento: objetos privados para fotos/progreso y medios; URLs firmadas, permisos y políticas de retención.
- PWA: manifest, service worker, assets, instalación, estrategia de caché, notificaciones con soporte por plataforma y comportamiento offline acotado.
- Entorno: dev, test, staging y prod; seeds de DEMO aisladas; logs estructurados sin PII, error tracking y backups.

Usar pnpm si es viable, estructura simple por dominios, por ejemplo:

```
apps/web/
packages/ui/
packages/domain/
packages/database/
packages/validation/
packages/config/
docs/
tests/integration/
tests/e2e/
```

Antes de fijar dependencias comprobar versiones estables, compatibilidad y mantenimiento actual. Priorizar complejidad mínima. Crear `README.md`, `.env.example` y scripts de arranque; `pnpm dev`, `test`, `typecheck`, `lint`, `build` deben funcionar con su configuración documentada.

### Entidades de dominio sugeridas

**Identidad:** User, Account, Session, Organization, OrganizationMember, CoachProfile, ClientProfile, CoachClientRelationship, Invitation, Role/Permission.

**Entrenamiento:** Exercise, ExerciseMedia, MuscleGroup, Equipment, WorkoutTemplate, WorkoutTemplateVersion, WorkoutDay, WorkoutExercise, SetPrescription, TrainingProgram, ProgramVersion, ProgramAssignment, ScheduledWorkout, WorkoutSession, WorkoutSessionExercise, SetLog, PersonalRecord.

**Seguimiento:** ClientGoal, AttendanceRecord, BodyMeasurement, ProgressPhoto, ClientCheckIn, CoachPrivateNote.

**Negocio entrenador:** ClientMembership, ClientInvoice, ClientPayment, PaymentReminder.

**SaaS Repi:** SubscriptionPlan, PricingTier, PriceVersion, CoachSubscription, BillingPeriod, BillableClientSnapshot, Invoice, InvoiceLine, PaymentTransaction, BillingEvent, WebhookEvent.

**Comunicaciones y plataforma:** Conversation, Message, Notification, NotificationPreference, PushSubscription, AuditLog, FeatureFlag, BackgroundJob, IdempotencyKey, AIUsageEvent, SupportRequest.

No crear tablas por obligación si una estructura más sencilla satisface requisitos; justificar diseño, relaciones, índices, soft deletes y controles de acceso. Mantener histórico de versiones de programas y snapshots de facturación.

### Multi-tenant y permisos

Cada entrenador trabaja dentro de un espacio/organización. Nunca confiar en `organizationId` o `clientId` recibidos sin validar pertenencia y capacidad. Servidor debe verificar cada lectura, escritura y descarga privada. Roles: plataforma admin, owner de organización, entrenador y alumno. Preparar relaciones muchos-a-muchos para un alumno con varios entrenadores en futuro. Probar intentos de IDOR/BOLA/BFLA y permisos verticales/horizontales. No resolver multi-tenancy solo con filtros frontend.

---

## 6. IA (DESPUÉS DEL NÚCLEO MVP)

El asistente IA ayuda al entrenador; **no lo sustituye**.

Casos: resúmenes de adherencia, alertas de alumnos sin sesiones, borradores de mensajes, sugerencias revisables de programación y explicación de datos. Calcular métricas **determinísticamente** primero; usar LLM solo para interpretación/redacción cuando se justifique. Abstracción de proveedores, prompts versionados, outputs estructurados, validación, limites por plan, tracking de tokens y coste; feature flag para activar/desactivar sin romper flujo. No compartir datos de salud/lesiones ni fotos sin base legal apropiada y permisos. Mostrar fuentes/datos usados, distinguir hipótesis de hechos. Toda modificación de rutina o comunicación generada por IA exige revisión y confirmación del entrenador. No diagnosticar ni prescribir tratamiento.

---

## 7. PRIVACIDAD, SEGURIDAD Y CALIDAD

Aplicar las recomendaciones actuales de OWASP para web y API; controles CSRF según sesión, XSS, validación de archivos MIME/tamaño, rate limits, contraseña/sesión robustas, scopes y autorización por objeto, backups, retención, logs sin datos sensibles, auditoría y secreto solo servidor. Fotos de progreso y lesiones/restricciones merecen protección reforzada; minimización, consentimiento cuando corresponda y revisión legal para Ley argentina 25.326 y normas vigentes antes del lanzamiento. La app no debe sugerir diagnósticos ni dar a entender que es un dispositivo médico. Exportación y solicitudes de eliminación de datos con preservación de obligaciones legítimas.

Accesibilidad WCAG 2.2 AA en flujos importantes. Cuidar viewport seguro y safe areas de iPhone, navegación con teclado y lector de pantalla, reduced-motion, feedback sin solo color, errores claros y botones alcanzables. No mostrar datos de salud en notificaciones en pantalla bloqueada.

Rendimiento: evitar N+1, consultas paginadas, índices, carga bajo demanda, optimización de imágenes, imágenes privadas con autorización, Core Web Vitals medidos. Sentry/equivalente solo con configuración explícita y sin transmitir datos sensibles involuntariamente.

---

## 8. PRUEBAS, VERIFICACIÓN VISUAL Y CRITERIOS DE ACEPTACIÓN

**Testing:** Vitest + React Testing Library para lógica/UI, pruebas API/DB integración, Playwright E2E y tests de seguridad/tenancy; verificar con navegador integrado Antigravity y producir walkthrough con capturas REALES (no regeneraciones artísticas) para móvil y escritorio.

E2E obligatorios:

1. Entrenador crea cuenta → verifica email en entorno test → completa onboarding → crea alumno → envía invitación → crea programa → publica y asigna.
2. Alumno acepta invitación → inicia sesión → ve programa → inicia entrenamiento → registra pesos/reps → usa descanso → finaliza → ve sesión en historial; entrenador ve progreso.
3. Duplicar programa / editar versión nueva **no altera** datos históricos.
4. Cliente intenta abrir datos de otra organización → 403/404 autorizado, jamás filtrar datos ajenos.
5. Alumno inicia sin conexión → registra varias series → recarga → recupera conexión → sincronización **una sola vez** sin perder datos.
6. Facturación cuenta alumnos según regla → crea snapshot → calcula importe exacto → reintentar webhook no duplica pago.
7. Registrar y anular pago manual del alumno con auditoría; no afecta facturación Repi.
8. Formularios y navegación responsive 375/390/430/768/1024/1440px; sin overflow; lector de pantalla/teclado, contraste y estados de error.
9. Login, cambio/recuperación de contraseña y expiración/revocación de invitaciones/sesiones.
10. Mensajería entre relaciones válidas con verificación de permisos.

**Definition of Done:** pantalla conforme al diseño + acción real + persistencia + permisos + validaciones + errores + móvil + tests + documentación. No marcar una función «terminada» si depende de mocks, una API inexistente o un botón inerte. Las referencias visuales deberán compararse con capturas reales de interfaz renderizada; crear checklist de diferencias y corregirlas.

**Datos de demo:** incluir seeds ficticias rotuladas como DEMO, nunca mezclar con usuarios reales ni declarar métricas históricas falsas.

---

## 9. IMPLEMENTACIÓN POR FASES Y PRIORIZACIÓN

### Fase 0 — Descubrimiento y UX final

Inspeccionar kit/repo, comprobar versiones actuales y riesgos, sitemap, user journeys, componentes y tokens, esquema de dominio, backlog y Definition of Done. Generar artefacto de Antigravity `Implementation Plan`. Si hay repo existente, no sobrescribir trabajo sin evaluar. Mostrar progreso del plan, pero **no detenerse** después de planificar.

### Fase 1 — Fundaciones ejecutables

Setup Next.js/TypeScript, DB y migraciones, auth+roles+tenant, layout light del entrenador / dark del alumno, design system y assets, routing, CI, test base, semillas demo. Verificar con navegador y captura comparativa.

### Fase 2 — Núcleo entrenador MVP

CRUD de alumnos, invitaciones, biblioteca de ejercicios, constructor de rutinas/programas versionados, asignación, dashboard con datos reales, perfiles. Completar E2E entrenador → asignación.

### Fase 3 — Núcleo alumno MVP

Onboarding, inicio, vista de programa, sesión activa, registro de series, temporizador, historial, progreso esencial, autosave y offline. Completar E2E alumno → sesión completa → actualización entrenador.

### Fase 4 — Modelo comercial MVP

Cuotas manuales del entrenador, métricas, motor de facturación Repi por alumno, tarifas configurables, billing snapshots, panel mínimo de admin y pantalla de suscripción. Integración pasarela en sandbox solo si documentada; pago real requiere credenciales/autorización.

### Fase 5 — Comunicación y crecimiento

Chat básico, notificaciones in-app, email, Web Push cuando proceda, recordatorios, importación CSV robusta y onboarding pulido.

### Fase 6 — IA y diferenciadores

Alertas deterministas, asistente opcional, reportes, costes/limites y aprobación humana. Futuro multi-coach y página pública del entrenador se implementan después de validar necesidad.

### Fase 7 — Preparación de producción

Revisión OWASP, accesibilidad, backup/restore, logs, monitoreo, stress básico, tests y walkthroughs, deploy staging, SEO y políticas legales revisables. **No desplegar públicamente sin consentimiento.**

**MVP que importa:** entrenador puede registrarse, agregar alumnos, crear/asignar rutina, alumno puede registrar sesiones y progresos y el entrenador puede cobrar su suscripción Repi. Enfocar calidad de esos flujos antes de aumentar pantallas y funcionalidades secundarias.

---

## 10. DOCUMENTACIÓN PERMANENTE Y FORMA DE TRABAJO ANTIGRAVITY

Archivos obligatorios y vivos:

- `README.md` — instalación reproducible, comandos, estructura.
- `docs/PRODUCT.md` — requisitos, alcance MVP/futuro, métricas y personas.
- `docs/BRAND.md` — fuentes visuales, tokens, logo, comportamiento responsive.
- `docs/ARCHITECTURE.md` — componentes, ADRs, límites de dominio, decisión stack.
- `docs/DATABASE.md` — entidades, restricciones, relaciones, migraciones.
- `docs/API.md` — endpoints y auth.
- `docs/BILLING.md` — fórmulas y políticas por alumno.
- `docs/SECURITY.md` — threat model, privacidad, checklist.
- `docs/TESTING.md` — cobertura, pasos E2E y resultados.
- `docs/DEPLOYMENT.md` — staging, prod, migraciones, backups, rollback.
- `IMPLEMENTATION_STATUS.md` — tareas hechas/en curso/bloqueadas, próximos pasos y pruebas pasadas/fallidas.
- `DECISIONS.md` — decisiones técnicas y supuestos.

Usar artifacts y walkthroughs de Antigravity para justificar avances: plan, diffs, capturas browser, resultado de tests, checklist visual y deuda técnica. Si el contexto/tokens se agotan, dejar `IMPLEMENTATION_STATUS.md` listo para reanudar **en una nueva ejecución**, con siguiente tarea concreta. No prometer tareas ejecutadas si no lo están. Un error de test exige corrección, no deshabilitar test por comodidad.

### Modo de ejecución

- Autonomía alta para instalar dependencias razonables, escribir/refactorizar código, diseñar componentes e implementar módulos.
- No gastar dinero, comprar servicios, publicar en producción, enviar emails reales ni cargar datos personales reales sin aprobación.
- Si un proveedor requiere claves, crear `.env.example`, adaptador y documentación; no exponer secretos.
- Intentar siempre ejecutar el proyecto y navegar flujos reales; si no es posible, dejar bloqueante exacto y alternativas verificadas.
- Diseñar y desarrollar **en el mismo proyecto**. No entregar solo Figma, ni solo imágenes, ni solo arquitectura. Las referencias adjuntas deben transformarse en producto funcional.

---

## 11. ENTREGABLE FINAL

Se considera listo para prueba piloto cuando existen:

1. Repositorio funcional, arranque documentado y migraciones reproducibles.
2. Identidad Repi Concepto 2 respetada con logo/isotipo/colores/Inter Tight, UI entrenador light y alumno dark.
3. Flujos completos y persistidos entrenador → alumno → sesión → progreso.
4. PWA instalable con salvaguarda de datos de entrenamiento y sincronización.
5. Control real de roles, multi-tenancy y seguridad básica.
6. Sistema de facturación por alumno activo configurable, separado de los pagos de alumnos.
7. Panel admin interno mínimo y métricas honestas.
8. Tests pasando, browser walkthrough y comparación con los PNG adjuntos.
9. Documentos de continuidad y pendientes exactos.
10. Preparación para piloto con 3–5 entrenadores y alumnos reales, solo después de revisión de privacidad y configuración operativa.

**INICIÁ AHORA:** auditá el repositorio y todos los archivos del kit, creá tu plan de ejecución y comenzá a construir la Fase 1. Priorizá la calidad del flujo completo y la correspondencia visual, sin pararte al generar solamente diseños, documentación o un plan.

**REPI — Cada repetición cuenta.**
