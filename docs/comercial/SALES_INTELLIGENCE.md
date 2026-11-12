# REPI Sales Intelligence 1.0 — Captación de gimnasios (D218)

Estado: **construido y probado en local; sin publicar.** Para producción hace falta el respaldo, aplicar 0056 y la aprobación del titular (ver «Publicación»).

## Qué es

Un módulo de REPI Admin (**Admin › Captación**) que cubre el circuito
Descubrimiento → Investigación → Enriquecimiento → Calificación → Contacto → Respuesta → Seguimiento → Reunión → Propuesta → Cierre.

Se apoya en piezas que ya existen:

- la misma base y el mismo Admin con verificación en dos pasos;
- el job de cada minuto (pg_cron) como programador;
- el módulo Ventas (D209) para los vendedores.

**Nada se envía solo.** Abrir WhatsApp o Gmail no marca el envío: lo confirma una persona con «Lo envié». Una campaña no habilita envíos hasta que el Admin la aprueba.

## Módulos y dónde están

| Módulo | Código | Qué hace |
| --- | --- | --- |
| Lead Discovery | `server/leads/sources.ts`, `pipeline.ts` (`stepDiscovery`) | OpenStreetMap vía Overpass, por zona y radio. |
| Data Enrichment | `sources.ts` (`readOfficialSite`), `pipeline.ts` (`stepEnrich`) | Lee el sitio oficial, respetando robots.txt: inicio y la página de contacto. |
| Identidad y deduplicación | `packages/domain/src/leads.ts` (`matchLead`), `store.ts` (`ingest`) | Separa: mismo negocio, sede de una cadena o posible duplicado para revisar. |
| Procedencia | tabla `lead_fact` | Cada dato con su fuente, fecha y estado; el historial se conserva. |
| Lead Scoring | `leads.ts` (`scoreLead`), `store.ts` (`refreshLead`) | Puntaje 0–100 con 8 factores ponderables y su explicación. |
| CRM | `crm.ts`, `messaging.ts`, UI `AdminLeads.tsx` | Ficha, 19 etapas, notas, tareas, reuniones, exclusiones y «no contactar». |
| Outreach Composer | `packages/domain/src/leads-copy.ts`, `messaging.ts` | 13 variantes por segmento, guarda de afirmaciones y pulido con IA opcional. |
| Campaign Manager | `campaigns.ts` | Arma la lista, vista de aprobación, aprobación con hash, pausa y cierre. |
| Follow-up Engine | `leads.ts` (`nextSequenceStep`), `pipeline.ts` (`stepFollowup`) | Cadencia configurable; se frena ante una respuesta, una baja o una fecha pedida. |
| Reply Intelligence | `leads.ts` (`classifyReply`, `intentPlan`), `messaging.ts` (`recordReply`) | 12 intenciones con su confianza; lo ambiguo va a revisión. |
| Analytics Dashboard | `insights.ts` (`dashboard`) | Captación, comunicación, ventas y productividad. |
| Scheduler | `pipeline.ts` (`leadsTick`) + `/api/cron/notifications` | Un paso por minuto en el horario de Argentina, una vez por día. |
| Repi Sales Agent | `insights.ts` (`askAgent`, `topActions`, `dailySummary`) | Preguntas frecuentes respondidas con consultas a la base; IA sólo con agregados. |
| Exportación | `crm.ts` (`exportCsv`, `exportXls`) | CSV protegido contra fórmulas y Excel con las fuentes de cada dato. |
| Baja | `/baja/[token]`, `/api/baja/[token]` | Enlace firmado en cada email; se confirma con un botón. |

Base de datos: migración **0056** (aditiva), con 10 tablas: `lead_area`, `lead_business`, `lead_fact`, `lead_run`, `lead_campaign`, `lead_message`, `lead_activity`, `lead_task`, `lead_suppression` y `lead_setting`. RLS está activado en todas.

Scripts de la migración:

- aplicación: `scripts/operations/hosted-0056.sql`;
- reversión: `scripts/rollback/0056_lead_intelligence.down.sql`, que se niega si hay datos;
- ensayo: `verify-0056.sh`.

## Reglas que el sistema hace cumplir

- **Datos.**
  - Lo que no está confirmado queda desconocido.
  - Lo visto en un directorio o buscador entra «sin verificar».
  - Lo que carga una persona queda verificado.
  - Un dato de una fuente peor no pisa a uno mejor ni a uno verificado.
  - La cantidad de socios sólo se guarda si alguien la respalda.
- **Duplicados.**
  - Mismo identificador de fuente, teléfono, email o Instagram: es el mismo negocio y se actualiza su expediente.
  - Misma marca (dominio o Instagram) en otra dirección: es una sede de la cadena.
  - Mismo nombre con datos que se contradicen, o que coincide con varios expedientes: va a revisión. Nunca se fusiona solo.
- **Exclusiones.**
  - Clientes de REPI: un gimnasio real con el mismo nombre.
  - Prospectos abiertos en Ventas.
  - Lista importada de exclusiones.
  - «No contactar» se guarda por canal y valor, así que sigue valiendo si el negocio reaparece o se borra el expediente.
- **Puntaje.**
  - Factores: encaje, tamaño, cercanía, contacto verificable, decisor, necesidad tecnológica con evidencia, capacidad e interés.
  - Los pesos se cambian en Ajustes.
  - Tener poca presencia digital no suma como necesidad.
- **Mensajes.**
  - Sólo mencionan funciones con estado «disponible» del catálogo `CLAIMS`, verificado contra `ESTADO_Y_LIMITES.md` y el código. Body Intelligence, aptos médicos y cobro de cuotas figuran como roadmap.
  - Prueba social autorizada por el titular (12/11): «Ya funciona en Smart Center Gym, en Mar del Plata, y estamos en proceso de implementación en varios gimnasios más de Mar del Plata, Balcarce y Tandil.» No se nombra a ningún otro cliente.
  - Precio: se cotiza por socio y se acuerda con cada gimnasio. Sólo la respuesta a una consulta de precios cita los ejemplos del dossier (400 × $200 = $80.000/mes; 500 × $170 = $85.000/mes), aclarando que no son una lista de precios. Ningún otro mensaje da precios ni porcentajes de resultados.
  - El valor de las oportunidades se estima con los tramos del dossier ($200 por socio por debajo de 500 socios, $170 desde 500) y se muestra como estimado.
  - Un texto que no pasa la guarda no se puede aprobar.
- **Envío.**
  - WhatsApp sin consentimiento: siempre manual con wa.me.
  - Email: Gmail o el correo propio, a mano. Por proveedor sólo si el titular lo habilita en Ajustes y la campaña está aprobada, con tope diario. Lleva identificación del remitente y baja en un clic.
  - Instagram: perfil y mensaje para copiar.
- **Respuestas.**
  - La baja manda siempre.
  - «Hablame la semana que viene» crea la tarea para esa fecha y frena la secuencia.
  - Un pedido de precio genera una tarea de cotización a validar; nunca se cotiza solo.
  - Un pedido de demo deja una reunión pendiente con prioridad.
  - Lo ambiguo va a revisión.

## Guía operativa

1. **Zonas** (Ajustes).
   - Las de nivel 1 vienen encendidas: Mar del Plata, Balcarce, Batán y Miramar.
   - Los niveles 2 y 3 se encienden cuando haga falta. Se puede cambiar el nivel, sin tocar código.
2. **Investigar** (Procesos › Investigación).
   - Recorre OpenStreetMap en las zonas encendidas, empezando por las más viejas.
   - Para cargar lo que se investigó a mano (CSV o JSON con fuentes): Leads › Importar.
3. **Enriquecer** (Procesos, o «Leer sitio oficial» en la ficha): completa contactos desde el sitio oficial cuando robots.txt lo permite.
4. **Revisar la cola** (Leads › Cola de contacto).
   - Abrir cada ficha y verificar los datos: «Verificar» o «Descartar».
   - Resolver los posibles duplicados.
   - Marcar exclusiones.
5. **Preparar el contacto.** Desde la ficha, con «Preparar mensaje», o por campaña:
   - Campañas › Nueva.
   - «Armar lista».
   - Revisar los textos.
   - «Enviar a aprobación».
   - Tildar «Revisé…».
   - «Aprobar campaña».
6. **Enviar.**
   - Usar «Abrir WhatsApp con el mensaje», «Abrir en Gmail» o «Abrir el perfil de Instagram».
   - Después, «Lo envié». Recién ahí cuenta como contactado y arranca la cadencia.
7. **Respuestas** (ficha › Registrar una respuesta).
   - Se pega lo que contestó, se clasifica y se aplica el plan.
   - Si quedó «Requiere revisión», se corrige la intención.
8. **Seguimiento.**
   - El proceso diario prepara los seguimientos de los días 3 y 7 como borradores, con tarea.
   - El día 14 cierra la secuencia sin respuesta.
   - Hoy muestra las 5 acciones del día.
9. **Reuniones**: en la ficha, Tarea › Reunión. Abre Google Calendar con el evento cargado, sin API.
10. **Vendedores**: «Asignar a un vendedor» crea el prospecto en Ventas, avisa al vendedor y lo saca de la cola de Captación.
11. **Programación**: Ajustes › Programación diaria (encendida + días + horarios). Sugerido, de lunes a viernes:

    | Hora | Paso |
    | --- | --- |
    | 08:00 | Investigación |
    | 08:30 | Enriquecimiento |
    | 09:00 | Calificación |
    | 09:30 | Preparación |
    | 17:30 | Seguimiento |
    | 18:00 | Informe |

    Cada ejecución queda en Procesos con estadísticas y errores.
12. **Exportar**: Leads › CSV o Excel, con las fuentes de cada dato.

Interruptor de emergencia: `REPI_LEADS=off` apaga rutas y jobs sin tocar datos.

Entrada interna: `POST /api/cron/leads` con `Authorization: Bearer CRON_SECRET` (la clave de Vault). Acepta `{"action":"run","step":"discovery"}` o `{"action":"import","label":…,"rows":[…],"exclusions":[…]}`. Desde Supabase se llama con `net.http_post` y `repi_private.cron_bearer()`, con el rol `repi_app`, sin ver la clave. Nunca envía mensajes.

## Campaña piloto «Repi — Captación Gimnasios Costa Atlántica» (12/11/2026)

- **Investigación:**
  - Se encontraron 95 gimnasios reales: 72 en Mar del Plata, 14 en Miramar, 9 en Balcarce y ninguno en Batán (sólo apareció un polideportivo municipal; no se completó la cantidad).
  - Se hizo con el buscador desde esta sesión. El entorno no permite abrir sitios, así que no se pudo leer ninguna página.
  - Todo quedó **sin verificar**, con la URL de la fuente de cada dato.
- **Resultado en la base local:**
  - 94 expedientes: 90 nuevos y un duplicado que el propio sistema fusionó.
  - 4 posibles duplicados quedaron para revisión.
  - 49 quedaron en la cola de contacto. Del resto, 44 están «pendientes de investigación» porque no tienen ningún canal publicado.
  - Canales: 3 con WhatsApp, 3 con email, 24 con Instagram, 35 con teléfono y 7 con sitio.
  - Ninguno publica la cantidad de socios, así que los puntajes son medios y lo dicen.
- **Exclusión:** Smart Center Gym quedó **excluido: es cliente** (confirmado por el titular el 12/11).
- **Los 10 mejores:** tienen sus mensajes en la campaña «pendiente de aprobación», con el mejor canal de cada uno. **Nada se envió.**
- **El listado de los 30 mejores** (nombre, ciudad, dirección, sitio, teléfono o WhatsApp, email, Instagram, fuentes, puntaje, prioridad, motivo, mensaje, mejor canal, estado y próxima acción) se entregó aparte, en Excel. La investigación para importar está en `docs/comercial/captacion/piloto-costa-atlantica-2026-11-12.json`: 95 negocios, sólo datos comerciales públicos y la fuente de cada uno. Se importa con Leads › Importar.

## Informe de pruebas

- **Dominio** (`leads.test.ts`, 33 pruebas):
  - teléfonos argentinos (formatos con 15 y con 9, sin código de área);
  - identidad, sedes y revisión;
  - procedencia;
  - puntaje y pesos;
  - 10 intenciones y la baja como prioridad;
  - fechas pedidas;
  - plan por intención;
  - cadencia de días hábiles y frenos;
  - etapas;
  - 13 variantes que pasan la guarda;
  - variedad por lead;
  - guarda;
  - wa.me;
  - cálculo de MRR.
- **Integración** (`tests/lead-intelligence.test.ts`, 10 pruebas sobre `repi_test`, con un fetch simulado y sin red):
  - OSM → expediente; re-descubrimiento sin duplicar; misma persona por teléfono en otro formato;
  - sedes; revisión y fusión manual;
  - un dato manual no pisado por un directorio;
  - sitio oficial con robots.txt, sin tomar el email personal;
  - cliente excluido; baja que sobrevive a borrar y re-descubrir;
  - campaña: no se registran envíos antes de aprobar; la aprobación exige confirmar; wa.me; «Lo envié»; seguimiento una sola vez;
  - «la semana que viene»; precio y demo → reunión agendada con enlace de calendario; «no me escriban» → no contactar;
  - agente con 4 preguntas; panel; acciones;
  - asignación a un vendedor;
  - CSV sin fórmulas y Excel;
  - baja por enlace firmado;
  - programador: apagado, horario, una vez por día, sábado.
- **Migración:** `verify-0056.sh` en una base descartable:
  - aplica con los roles de producción (10 tablas con RLS y dueño `repi_app`) sin cambiar la huella de las tablas existentes;
  - un segundo intento falla entero;
  - la reversión se niega con datos;
  - revierte y vuelve a aplicar.
- **Navegador:** Admin › Captación en un iPhone 13 en modo oscuro y en escritorio. Se recorrieron Hoy, Leads, la ficha (contacto, datos, registro de una respuesta), Pipeline, Campañas (vista de aprobación), Panel, Agente, Procesos, Ajustes y Agregar, sin errores, sin respuestas 5xx y sin scroll horizontal.

### Qué no se pudo probar o requiere credenciales

| Integración | Estado |
| --- | --- |
| OpenStreetMap (Overpass) | Implementado y probado con respuestas simuladas. Este contenedor no tiene salida a Internet; en producción (Vercel) debería responder. Hay que verificarlo con «Investigación» después de publicar. |
| Sitios oficiales | Igual que OSM: probado con respuestas simuladas. |
| Gmail API (borradores, hilos, respuestas automáticas) | **No conectada.** No hay credenciales OAuth de Gmail en este entorno. Hoy se usa «Abrir en Gmail», que crea el borrador para enviarlo a mano, y las respuestas se pegan en la ficha. Conectarla necesita un cliente OAuth de Google Workspace y la aprobación del titular. |
| Email por proveedor | Usa el Resend ya configurado. Está **apagado** por defecto y depende del titular (Ajustes › Canales). |
| WhatsApp Business Platform | **No configurada.** Requiere una cuenta verificada en Meta, plantillas aprobadas y consentimiento. Mientras tanto, sólo wa.me manual. |
| Google Calendar | Sin API: un enlace precargado para agregar el evento. |
| IA (pulir mensajes, respuestas ambiguas, preguntas libres al agente) | Usa la OPENAI_API_KEY ya configurada, pero las dos opciones están **apagadas** por defecto. Con o sin IA, la guarda se aplica igual. |
| n8n | No se usó: el programador propio ya corre con el job de cada minuto que existe en producción, y no hace falta un servicio extra. |

## Publicación (pendiente de aprobación)

1. Workflow «Respaldo» en verde (`docs/RESPALDOS.md`).
2. Aplicar `hosted-0056.sql`, que exige 0055 aplicada.
3. Integrar la PR y verificar `/api/version`.
4. En Admin › Captación › Procesos, correr «Investigación» y comprobar que OSM responde.
5. Importar el piloto (JSON con fuentes) y confirmar la exclusión de Smart.
6. Revisar y aprobar la campaña piloto. Para encender la programación diaria, Ajustes.
