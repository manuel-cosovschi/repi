# REPI — Auditoría de huecos entre pantallas y funcionalidades faltantes

Revisé los cuatro prototipos actuales: App Alumno v3, Desktop Coach, Desktop Gym y Admin. Para cada uno miré qué datos **produce** una pantalla y qué pantalla los **consume**. Si algo se muestra en un lado pero nadie lo genera, o se genera pero nadie lo ve, cuenta como hueco.

Impacto: 🔴 rompe un circuito clave · 🟠 importante · 🟢 suma valor.

---

## 1. Datos que el coach ve pero el alumno nunca carga (circuito roto)

El dashboard del coach muestra información que hoy la app del alumno no permite registrar. Es el hueco más grande, porque esas pestañas del coach no tienen fuente.

| # | El coach ve… | Falta en la app del alumno | Impacto |
|---|---|---|---|
| 1.1 | **Molestias 0–10** y alerta "molestia 4/10 en hombro" | Reportar dolor o molestia durante o al final de la sesión: zona en el cuerpo, intensidad y en qué ejercicio | 🔴 Es seguridad: el coach no se entera si se lastima |
| 1.2 | **Lesiones** con restricción en el programa | Cargar lesiones y antecedentes en el perfil (con consentimiento de salud) | 🔴 |
| 1.3 | **Check-in diario** (energía, sueño, RPE) | Un check-in de 3 toques antes de entrenar | 🟠 |
| 1.4 | **Notas del alumno** en el registro de sesiones | Campo "¿Cómo te fue?" en el resumen de fin de entrenamiento | 🟠 |
| 1.5 | **RPE de la sesión** y **RIR prescripto** (el constructor tiene RIR) | En la sesión activa solo se cargan kg y reps; falta RIR/RPE por serie, opcional | 🟠 |
| 1.6 | **Nutrición** (macros, kcal, hidratación, comidas, peso) | Todo el registro de comidas e hidratación | 🟠 Pestaña sin fuente. Alternativa: integrarlo con una app de nutrición |
| 1.7 | **Objetivos** con progreso | En la app solo hay "Meta brazo" dentro de Medidas; falta la vista de objetivos acordados con el coach | 🟢 |
| 1.8 | **Salud general** (condiciones, medicación, apto físico) | Ficha de salud del alumno + carga del apto médico | 🟠 Además el apto vencido debería avisar a ambos |
| 1.9 | Botón **"Pedir acceso"** en Salud/Nutrición | En la app no llega la solicitud y no hay dónde aceptarla o rechazarla. Al coach no le queda el estado "Solicitud pendiente" | 🔴 El circuito de consentimiento no cierra |

## 2. Lo que el coach hace y el alumno no recibe

| # | Acción del coach | Hueco | Impacto |
|---|---|---|---|
| 2.1 | Asigna un programa con fecha de inicio | En la app el programa está fijo (Torso A, Piernas, Torso B); no hay pantalla de "programa nuevo asignado", ni aviso, ni vista de las semanas | 🔴 |
| 2.2 | Define el **descanso por ejercicio** | La app usa un descanso global (90 s) en lugar del de cada ejercicio | 🟠 |
| 2.3 | Escribe la **indicación al cliente** | Se ve en Entrenar, pero no en la sesión activa por ejercicio (la nota del coach está fija) | 🟢 |
| 2.4 | Registra un **pago** del alumno | El alumno no ve su plan con el coach, el vencimiento ni el estado (solo informativo) | 🟢 |
| 2.5 | **No hay alta de clientes** en el desktop del coach | Falta "Agregar o invitar cliente" → enlace o QR → el alumno acepta en la app | 🔴 Sin esto no hay forma de empezar |
| 2.6 | Agenda con sesiones presenciales | La app no muestra "Próxima sesión con tu coach"; no hay calendario ni confirmación de asistencia | 🟠 |
| 2.7 | Revisa la técnica | El alumno no puede mandar un **video de técnica** al coach desde la sesión, aunque la subida de video ya existe para los récords | 🟢 Alto valor y fácil de reutilizar |
| 2.8 | Mensajes | Chat sin adjuntos, audios, mensajes a varios alumnos ni plantillas | 🟢 |

## 3. Circuito gimnasio ↔ socio

| # | Hueco | Impacto |
|---|---|---|
| 3.1 | El gym tiene tareas **"Pedido desde la app"**, pero la app no tiene **"Pedir ayuda / cambiar mi rutina / revisar técnica"**. La cola del entrenador de sala no tiene fuente | 🔴 |
| 3.2 | El entrenador de sala edita el **programa institucional**, pero en la app (socio de gym) Entrenar sigue mostrando el programa fijo del coach. Falta que el programa salga del gym, con "actualizado por Agustín hoy" | 🔴 |
| 3.3 | **Reseña del socio:** el pedido de reseña se perdió en la v3 (existía en la v2 del gym) | 🔴 |
| 3.4 | Socio con gym + coach privado: falta un selector de "relación activa" en la app y reglas de qué programa se muestra | 🟠 |
| 3.5 | **"Retirá tu premio en recepción"**: no hay código o QR del premio, ni estado "Entregado", ni rol de recepción que lo marque. Lo mismo para los descuentos "mostrando la app" | 🟠 Falta un **carnet digital / QR del socio** |
| 3.6 | **Asistencia**: el gym mide sesiones y adherencia, pero no está definido cómo sabe que el socio fue (check-in por QR, molinete o sesión registrada) | 🟠 |
| 3.7 | **Desafíos sin cierre**: qué pasa al vencer la fecha (ganador, anuncio, archivo, premio). Falta ranking del desafío, historial de intentos y "mejor marca personal" aunque no supere el récord | 🟠 |
| 3.8 | **Equidad de desafíos**: sin categorías (sexo, edad, peso corporal) los récords absolutos excluyen a la mayoría. Falta aviso de seguridad o deslinde para intentos máximos | 🟠 |
| 3.9 | Validación alternativa: un entrenador de sala que **presenció** el intento podría validarlo sin video. Hoy solo valida gerencia o dueño | 🟢 |
| 3.10 | Novedades y desafíos **por sede** (hoy son globales); vencimiento de descuentos; notificación push al publicar | 🟢 |
| 3.11 | Catálogo: sin disponibilidad, horarios de recepción ni destacar promos | 🟢 |
| 3.12 | La ficha del socio que ve el entrenador de sala no muestra sus intentos ni logros (sirve para motivar en sala) | 🟢 |
| 3.13 | "Entrenadores en sala ahora" en la app del socio, a partir de los turnos activos | 🟢 |
| 3.14 | El gym muestra "Participación en Repi Club 23%", pero Repi Club (feed, rankings, reacciones) no existe | 🟠 |

## 4. Circuito Admin ↔ clientes (coach y gym)

| # | Hueco | Impacto |
|---|---|---|
| 4.1 | **Los números no coinciden**:<br>· Coach: tarjeta "18 × 700 = 12.600", pero el Admin cobra con criterio "máximo del período" (≈19 → 13.300).<br>· Gym: muestra 2.032 facturables (uso real), mientras el Admin cuenta 2.190+.<br>Hay que unificar dos conceptos distintos: **quién cuenta** (definición de facturable) y **cómo se agrega** (máximo / al día / promedio). Los dos deben verse igual en Admin y en la pantalla del cliente | 🔴 |
| 4.2 | Lo que el Admin cambia (plan, día de cobro, descuento, pausa) **no se le comunica al cliente**: falta aviso "Tu suscripción cambia desde el 1/6" y el historial de cambios visible para él | 🟠 |
| 4.3 | Estado de cuenta en el cliente: si el Admin marca "Vencido" o "Pausada", el coach o gym no ve un aviso, ni días de gracia, ni qué pasa con sus alumnos | 🔴 |
| 4.4 | Fin de **prueba**: falta aviso al cliente, conversión a plan pago y qué pasa si no paga | 🟠 |
| 4.5 | Medio de pago, comprobantes y facturas descargables (cliente y Admin); recordatorio de cobro desde el Admin | 🟠 |
| 4.6 | Admin: MRR, ARR, churn, cohortes, soporte, ver la cuenta como el cliente (con auditoría), autor de cada cambio en el log, 2FA | 🟠 |
| 4.7 | Prorrateo de altas y bajas a mitad de mes e impuestos: sin definir | 🟠 |
| 4.8 | "Planes y precios" es solo lectura | 🟢 |

## 5. Huecos dentro de cada superficie

**App del alumno**
- Estados vacíos: sin programa asignado, primer día, sin mensajes, sin novedades del gym. 🟠
- Offline: sin indicador "sin conexión / pendiente de sincronizar / conflicto". 🔴 (brief original)
- Sesión activa:
  - Faltan cambiar un ejercicio por otro, nota por serie, saltar ejercicio, entrada en calor y calculadora de discos. 🟢
  - El temporizador debería avisar con una notificación local cuando la app está en segundo plano. 🟠
- Onboarding: invitación → registro → consentimientos → primera sesión. 🔴
- Configuración: kg/lb, idioma, preferencias de notificaciones, menores de edad. 🟠

**Coach desktop**
- Calendario y asistencia, importar CSV, biblioteca de ejercicios con videos, superseries, tempo y versionado de programas. 🟠
- Reportes: "Informe mensual" en PDF para compartir con el alumno. 🟢
- La pestaña "Pagos" de la ficha no permite registrar el pago (la pantalla general sí). 🟢
- Datos inconsistentes: "Ingresos de mayo ARS 612.000" en el panel vs "Cobrado ARS 574.000" en Pagos; falta aclarar "esperado" vs "cobrado". 🟢
- "Promociones activas: 1" sin pantalla para gestionarlas. 🟢
- Comunidad propia del coach (anuncios y desafíos para sus alumnos), igual que el gym. 🟢

**Gym desktop**
- Centro de notificaciones para el staff (hoy solo hay toasts y badges). 🟠
- Coordinador y recepción sin pantallas. 🟠
- Mensajería entrenador de sala ↔ socio. 🟠

**Transversal**
- **Menores de edad**: consentimiento del tutor; restricciones para fotos, videos de récord y salud. 🔴 Legal.
- Registro de consentimientos aceptados (términos, privacidad) con versión y fecha. 🔴
- Integraciones (Apple Health, Google Fit, relojes) para sueño, pasos y frecuencia cardíaca: alimentarían el check-in solas. 🟢

---

## Prioridad sugerida (lo que más cierra circuitos con menos diseño)

1. **App: reportar molestia/lesión + check-in + nota de sesión + RPE** (1.1–1.5). Da fuente real a lo que ya muestra el coach.
2. **App: solicitudes al gym/coach** ("Pedir ayuda", "Cambiar rutina", "Revisar técnica" con video) (3.1, 2.7).
3. **Coach: alta e invitación de clientes** y aceptación en la app (2.5).
4. **Programa asignado → app** (aviso, semanas, origen gym o coach, descanso por ejercicio) (2.1, 2.2, 3.2, 3.4).
5. **Consentimiento "Pedir acceso" de punta a punta** (1.9).
6. **Facturación unificada** Admin ↔ coach/gym con estado de cuenta y avisos (4.1–4.4).
7. **Reseña del socio en la app v3** (3.3).
8. **Carnet o QR del socio** para premios, descuentos y asistencia (3.5, 3.6).
9. **Cierre de desafíos, categorías y ranking** (3.7, 3.8).
10. Estados vacíos y offline en la app.
