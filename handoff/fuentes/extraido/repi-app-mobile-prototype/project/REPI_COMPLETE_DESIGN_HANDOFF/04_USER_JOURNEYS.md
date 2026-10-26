# 04 · Recorridos de usuario

Leyenda de estado: ✅ prototipado de punta a punta · ◐ parcial · ✕ no diseñado.

## J-01 Coach independiente — alta a cobro ◐
Entrada: sitio público ✕ → registro/onboarding ✕ → **Panel (SCR-C-01)** ✅ → Clientes (SCR-C-02) ✅ → alta de cliente ✕ → **Constructor (SCR-C-03)**: nombrar programa, días (editables), ejercicios desde biblioteca, series/reps/RIR/descanso ✅ → **Asignar (SCR-CX-01)** a 1..n clientes con fecha de inicio ✅ → monitorear (pestañas Resumen/Rendimiento/Rutinas/Progreso/Salud/Nutrición/Mi cuerpo) ✅ → Mensajes ✅ → **Pagos**: registrar pago manual ✅ → ver suscripción REPI ✅.
Permisos: solo sus clientes; Salud/Nutrición/Cuerpo bloqueados sin Grant → "Pedir acceso". Errores: asignar sin clientes (validación). Final: cliente con programa y copia propia.

## J-02 Alumno — sesión completa ✅ (sin invitación ✕)
Invitación/registro ✕ → Intro (1ª vez completa, luego corta) → **Inicio** → Comenzar → **Sesión activa**: ver serie anterior, ajustar kg/reps, Completar serie (pulso) → descanso circular (pausar/+30s/saltar) → siguiente serie/ejercicio → Finalizar → **Resumen** (PR solo si supera registro previo; celebración desactivable) → Progreso.
Errores: sin conexión ✕ (no diseñado). Final: sesión registrada.

## J-03 Body Intelligence ✅ (subida de documentos ✕)
Inicio/Progreso → Mi cuerpo · intro → consentimiento por tipo (≥1) → método (bloqueado si falta consentimiento) → **manual** (medidas + quién midió) o **fotos** (4 poses, chequeo de calidad, fallo de nitidez simulado, revisión, repetir) o **3D experimental** (procesa → fallo honesto → usar modelo de referencia / reintentar) → **visor 3D** (rotar, zoom, vistas, capas, regiones, panel de región) → comparar fechas → Perfil: compartir con coach por tipo → coach ve en SCR-C-02g.
Alternativa: "Ahora no" vuelve a Inicio sin afectar el entrenamiento.

## J-04 Entrenador de sala — turno ✅ (Flujo B)
Selector de espacio → **Mi turno** → Iniciar turno → Cola → Tomar T-1041 → Abrir socio → Editar programa (motivo + "completar tarea") → tarea completada, revisión registrada, atribución en Mi desempeño. Sin turno: acciones bloqueadas con aviso.

## J-05 Traspaso ✅ (Flujo C)
Agustín: Terminar turno → seleccionar tareas, editar resumen saneado, elegir Sofía → turno cerrado, tareas "traspaso pendiente" → ver como Sofía: Traspasos recibidos → Aceptar → en "Asignadas a mí" → iniciar turno → completar.

## J-06 Gerente — revisión de desempeño ✅ (Flujo D)
Panel → Performance Center → período/turno/categoría → Definiciones → seleccionar 2–3 → Comparar con contexto → Detalle de entrenador → reseñas y tareas.

## J-07 Protección de privacidad ✅ (Flujo F)
Detalle de entrenador → "Fuera del alcance de gestión" → Ver → acceso no disponible + evento en Reseñas › Historial de accesos.

## J-08 Dueño — revisión ejecutiva ✅ (Flujo G, sin ingresos gym→socio por DEC-10)
Ejecutivo → adopción → Sedes (métrica conmutable) → clic sede → Performance Center filtrado → Comunidad → Facturación REPI (simular definición).

## J-09 Cuenta multi-organización ✅ (Flujo H)
Agustín en Gym Norte → switcher → Agustín Pérez Coach (desktop coach) → gestiona clientes privados con permisos separados.

## J-10 Socio con gym + coach ◐ (Flujo I)
Prototipado en Gym v2 (persona móvil, retirada). App v3: tweak `alumnoTipo` muestra/oculta pestaña Gym; selector de relación dentro de la app ✕ (GAP-24).

## J-11 Alta de gym ◐ (Flujo J)
Configuración › Puesta en marcha: pasos completos simulados → Importar CSV (simulado) → Activar (bloqueado hasta importar). Registro real ✕.

## J-12 Reseña del socio ◐ (Flujo E)
Prototipado en Gym v2: completar tarea elegible → invitación opcional → calificación + dimensiones + comentario + "quién la ve" → aparece en Reseñas (gerente) y Mi desempeño (sin nombre). **No está en App v3** (GAP-07). Moderación y respuesta ✅.

## J-13 Récord de desafío con video ✅ (v3)
Gerente/dueño: Comunidad › Desafíos → publicar (regla, unidad, premio, fin) → App v3: Gym › Desafíos → Subir intento → video + marca + confirmación → enviado ("En revisión") → Desktop: aviso + insignia Validaciones → ver video, comparar con récord → Aprobar (actualiza récord si lo supera) / Rechazar con motivo → App: notificación; aprobado = overlay de logro + sticker + nivel; rechazado = motivo + reintentar. Premio se retira en recepción.
Errores: sin video / sin marca / sin confirmación (validación); fallo al guardar video. Requiere ambas pestañas en el mismo navegador (prototipo).

## J-14 Comunidad del gym ✅ (v3)
Gerente publica novedad o descuento con imagen y producto en catálogo → socio lo ve en Gym › Novedades / Recepción (informativo, sin pago).

## J-15 REPI Admin — suscripción ✅ (v4)
Resumen → Clientes (filtro gym/coach, estado) → Ficha → cambiar plan/tramos/mínimo/descuento/día de cobro/criterio de conteo/estado → cálculo en vivo → Guardar (log, rige desde el próximo cobro) → Cobros → Marcar pagado. Alta: Nuevo cliente → prueba con plan por defecto.

## J-16 Repi Club ✕ · J-17 Checkout de pagos ✕ · J-18 Onboarding coach/alumno ✕ · J-19 IA ✕
