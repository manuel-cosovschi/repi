"""Genera docs/PRODUCT_INVENTORY.json y docs/PRODUCT_INVENTORY.md.

Fuentes: features.json del handoff (93 IDs originales, sin modificar) + hallazgos
nuevos documentados abajo con su localizador exacto. El estado técnico del
repositorio se mantiene en REPO_STATUS; actualizarlo sólo con evidencia
registrada en docs/IMPLEMENTATION_STATUS.md.

Uso: python3 -I scripts/inventory/build_inventory.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
HANDOFF = ROOT / "handoff/fuentes/extraido/repi-app-mobile-prototype/project"
SPEC = HANDOFF / "REPI_COMPLETE_DESIGN_HANDOFF"

# Diseño disponible según el handoff (no es estado de implementación).
DESIGN = {
    "designed": "diseño aprobado (assets)",
    "interactive_prototype": "prototipo interactivo",
    "partially_designed": "diseño parcial",
    "specified_not_designed": "sin diseño",
    "static_mockup": "maqueta estática",
}

# Certeza de producto: confirmado / documentado / propuesto / en_conflicto / retirado.
CONFIRMED = {
    "F-BR-01", "F-BR-02", "F-BI-02", "F-PR-01", "F-PR-05", "F-CO-04", "F-CO-05", "F-CO-06",
    "F-CO-08", "F-GC-01", "F-GC-02", "F-GC-03", "F-GC-04", "F-GC-05", "F-BL-01",
    # Anexo 26/10/2026: base facturable, precio por cliente y alta comercial confirmados (D57–D59)
    "F-BL-02", "F-BL-03", "F-AD-02", "F-AD-03",
    # Chat 30/10/2026: el titular pide que el profe de sala valide el récord en persona (D165, cierra D23)
    "F-HX-12",
}
CONFLICT = {
    "F-GT-01": "DEC-09 gating por turno vs trabajo remoto (D08)",
    "F-RV-02": "INC-01 umbral n=5 vs n=10; 'rango 95%' sin método",
    "F-MO-02": "GAP-24: selector de relación activa sin regla de programa",
}

# Estado técnico en ESTE repositorio. Default: sin_implementar.
# Valores: sin_implementar / estatico / interactivo_local / simulado / integrado / persistente / probado.
REPO_STATUS = {
    # Etapa 1 · evidencia en docs/IMPLEMENTATION_STATUS.md
    "F-BR-01": "integrado", "F-ID-01": "probado", "F-ID-02": "persistente", "F-ID-03": "probado",
    "F-ID-04": "probado", "F-ID-05": "probado", "F-ID-06": "probado", "F-ID-07": "integrado",
    "F-ID-08": "probado", "F-ID-09": "probado", "F-ID-10": "probado", "F-ID-11": "probado",
    "F-ID-12": "probado", "F-ID-13": "probado", "F-ID-14": "probado", "F-ID-15": "probado",
    "F-ID-16": "persistente", "F-ID-17": "persistente", "F-ID-18": "persistente", "F-ID-19": "estatico",
    "F-ID-20": "probado", "F-MO-01": "persistente", "F-CO-13": "persistente", "F-GR-01": "persistente",
    # Etapa 2 · núcleo coach→programa→alumno
    "F-CL-01": "probado", "F-CL-02": "probado", "F-CL-03": "probado", "F-CL-04": "probado", "F-CL-05": "probado",
    "F-CL-06": "persistente", "F-CL-11": "probado", "F-CL-12": "probado", "F-CL-15": "integrado", "F-CL-16": "probado", "F-CL-07": "probado",
    "F-CO-01": "persistente", "F-CO-02": "probado", "F-CO-05": "probado", "F-CO-08": "probado", "F-CO-09": "integrado",
    "F-HX-04": "probado", "F-HX-05": "integrado",
    # Etapa 4 · seguimiento y consentimiento
    "F-CL-08": "probado", "F-CL-09": "probado", "F-CL-10": "probado", "F-CL-13": "probado", "F-CL-15": "probado",
    "F-PR-01": "probado", "F-PR-05": "probado", "F-PR-06": "probado", "F-CO-06": "probado", "F-CO-14": "probado",
    "F-CO-15": "probado", "F-CO-18": "probado",
    # Etapa 5 · operación del gym, gestión, reseñas y mensajería (D40/D41)
    "F-GT-01": "probado", "F-GT-02": "probado", "F-GT-03": "probado", "F-GT-04": "probado",
    "F-GM-01": "integrado", "F-GM-02": "integrado", "F-GM-03": "probado", "F-GM-04": "integrado", "F-GM-05": "integrado", "F-GM-06": "persistente",
    "F-GP-01": "probado", "F-GP-02": "integrado", "F-GP-03": "integrado", "F-GP-04": "probado", "F-GP-05": "integrado",
    "F-RV-01": "probado", "F-RV-02": "probado", "F-RV-03": "probado", "F-RV-04": "probado", "F-RV-05": "integrado", "F-RV-06": "probado",
    "F-GO-01": "integrado", "F-GO-02": "integrado", "F-GO-03": "integrado", "F-GR-01": "integrado",
    "F-MS-01": "probado", "F-MS-02": "probado", "F-HX-27": "probado", "F-HX-09": "probado", "F-MO-02": "probado",
    # Etapa 6 · comunidad del gym y Repi Club
    "F-GC-01": "probado", "F-GC-02": "probado", "F-GC-03": "probado", "F-GC-04": "probado", "F-GC-05": "probado",
    "F-GC-06": "probado", "F-GC-07": "probado", "F-GC-08": "integrado", "F-GC-09": "probado",
    "F-HX-10": "probado", "F-HX-11": "integrado", "F-HX-13": "probado", "F-HX-14": "integrado", "F-HX-15": "integrado", "F-HX-16": "integrado",
    "F-RC-01": "probado", "F-RC-02": "probado", "F-RC-03": "probado", "F-RC-05": "probado",
    # Anexo 26/10/2026 · alta comercial, condiciones por cliente, QR de sede y push (sin cobros reales)
    "F-AD-02": "probado", "F-AD-03": "probado", "F-BL-02": "integrado", "F-BL-03": "integrado", "F-NT-02": "integrado",
    # 27/10/2026 · evidencia en docs/IMPLEMENTATION_STATUS.md (D75–D79) y tests (privacy, denied, training, gym)
    "F-PR-02": "probado", "F-PR-03": "probado", "F-PR-04": "probado", "F-AD-01": "probado", "F-CL-14": "probado",
    "F-BL-01": "probado", "F-CO-17": "probado", "F-HX-06": "probado", "F-CO-04": "integrado",
    # 30/10/2026 · validación en sala sin video (D165, tests/community.test.ts)
    "F-HX-12": "probado",
    # 30/10/2026 · nivel y trofeos con desbloqueo 3D (D166, tests/levels.test.ts, packages/domain/src/levels.test.ts)
    "F-RC-04": "probado",
}

NEW = [
    # id, nombre, módulo, rol, fuente, diseño, certeza, propósito/regla, aceptación, dependencias
    ("F-ID-04", "Verificación de email por código de 6 dígitos + reenvío", "Identidad", "Todos",
     "REPI Acceso.dc.html · paso verify (V.verify)", "prototipo interactivo", "documentado",
     "Cuenta no verificada no entra a espacios. Código numérico de 6 dígitos con vencimiento.",
     "Código incorrecto/vencido rechazado; reenvío limitado; verificado persiste.", "F-ID-01"),
    ("F-ID-05", "Recuperación de contraseña por código (15 min) con respuesta no enumerable", "Identidad", "Todos",
     "REPI Acceso.dc.html · rec1/rec2/rec3", "prototipo interactivo", "documentado",
     "Mismo mensaje exista o no la cuenta; código vence en 15 min; al cambiar se cierran otras sesiones.",
     "Email inexistente responde igual; tras reset las sesiones previas quedan revocadas.", "F-ID-01"),
    ("F-ID-06", "Verificación en dos pasos (TOTP) obligatoria para Admin REPI y dueños", "Identidad", "REPI Admin, dueño",
     "REPI Acceso.dc.html · twofa ('Obligatoria para administración de REPI y dueños')", "prototipo interactivo", "documentado",
     "TOTP de app autenticadora, 10 códigos de respaldo, confiar dispositivo 30 días.",
     "Admin/dueño sin 2FA no accede a su superficie; código de respaldo de un solo uso.", "F-ID-01"),
    ("F-ID-07", "Ingreso con Google, Apple y enlace mágico por email", "Identidad", "Todos",
     "REPI Acceso.dc.html · social[]", "prototipo interactivo", "documentado",
     "Proveedores externos requieren credenciales; sin ellas el botón informa no disponible.",
     "Sin credenciales no se simula ingreso; con credenciales vincula a la misma cuenta por email verificado.", "F-ID-01, D20"),
    ("F-ID-08", "Selector de espacio post-ingreso desde relaciones reales", "Identidad / multi-organización", "Todos",
     "REPI Acceso.dc.html · workspace ('Los datos de cada uno no se mezclan')", "prototipo interactivo", "confirmado",
     "Lista sólo relaciones y membresías vigentes del usuario; cada espacio con su contexto.",
     "Usuario sin relación ajena no ve ese espacio; cambio de espacio no mezcla datos.", "F-MO-01"),
    ("F-ID-09", "Registro de dueño de gimnasio (nombre, CUIT, sedes, socios aprox.)", "Identidad / Gym", "Dueño",
     "REPI Acceso.dc.html · gym1/gym2/gymDone", "prototipo interactivo", "documentado",
     "Crea organización y membresía de dueño; acepta Términos, Privacidad y Acuerdo de tratamiento de datos.",
     "CUIT con dígito verificador válido; organización persistida; dueño con 2FA pendiente.", "F-ID-01, F-ID-15"),
    ("F-ID-10", "Invitar equipo del gym por email y rol en el alta", "Identidad / Gym", "Dueño",
     "REPI Acceso.dc.html · gym3 (Gerente, Coordinador, Entrenador de sala, Recepción)", "prototipo interactivo", "documentado",
     "Cada invitación tiene rol, sede, emisor, vencimiento y estado; permisos por rol, no por cargo.",
     "Invitación persistida con código; expira/revoca; aceptarla crea StaffMembership.", "F-ID-09, D10"),
    ("F-ID-11", "Aceptar invitación de staff (código) con alcance explicado", "Identidad / Gym", "Staff gym",
     "REPI Acceso.dc.html · invite (staff) ('No vas a ver mensajes privados ni datos de salud')", "prototipo interactivo", "documentado",
     "Muestra organización, rol, sede y emisor reales de la invitación.",
     "Código inválido/vencido/revocado rechazado; aceptación única.", "F-ID-10"),
    ("F-ID-12", "Alta de socio: buscar gym/sede o QR de recepción + verificación en padrón", "Identidad / Gym", "Socio",
     "REPI Acceso.dc.html · member1/member2/memberPending", "prototipo interactivo", "documentado",
     "Busca DNI en padrón cargado por el gym; si no está, crea pedido a recepción.",
     "DNI en padrón → relación gym_member; fuera de padrón → pedido pendiente visible; sin enumerar padrón.", "F-GR-01, F-CO-11"),
    ("F-ID-13", "Menores: edad por nacimiento, <13 bloqueado, 13–17 con autorización de adulto", "Identidad / privacidad", "Alumno menor, tutor",
     "REPI Acceso.dc.html · inv1/tutor/tutorWait; Auditoría de huecos §Transversal 🔴", "prototipo interactivo", "en_conflicto",
     "Hasta autorización: entrena; fotos, videos de récord y salud desactivados; nombre en rankings sólo si el adulto lo permite.",
     "Adulto aprueba por enlace propio; restricciones aplicadas en servidor. Edades y base legal pendientes (D13).", "D13"),
    ("F-ID-14", "Consentimiento inicial al coach por tipo de dato con versión", "Privacidad", "Alumno",
     "REPI Acceso.dc.html · consent (entrenamientos fijo; medidas, salud, nutrición, fotos opcionales)", "prototipo interactivo", "confirmado",
     "Default sin compartir lo sensible; registra destinatario, ítems, versión de términos y fecha.",
     "Grant persistido por relación; revocable; no se hereda a otros contextos.", "F-PR-01, D12"),
    ("F-ID-15", "Registro de aceptación de Términos/Privacidad/DPA con versión y fecha", "Privacidad / legal", "Todos",
     "REPI Acceso.dc.html · checks terms; Auditoría de huecos §Transversal 🔴", "prototipo interactivo", "documentado",
     "Cada aceptación queda en registro inmutable (documento, versión, fecha, cuenta).",
     "No se crea cuenta sin aceptación; versión registrada. Textos legales pendientes (D21).", "D21"),
    ("F-ID-16", "Ingreso de código de invitación y lectura de QR", "Identidad", "Alumno, staff",
     "REPI Acceso.dc.html · code ('Escanear QR')", "prototipo interactivo", "documentado",
     "El tipo de invitación sale del registro, no del prefijo del código.",
     "Código de 6 caracteres sin ambigüedad; rate limit; QR abre el mismo flujo.", "F-ID-03"),
    ("F-ID-17", "'Ya tengo cuenta': sumar relación nueva a cuenta existente", "Identidad / multi-organización", "Alumno, staff",
     "REPI Acceso.dc.html · invite.secondary ('Tu historial se mantiene')", "prototipo interactivo", "confirmado",
     "Una persona = una cuenta; la invitación se acepta tras ingresar.", "No se duplica User; relación nueva aparece en el selector.", "F-ID-08"),
    ("F-ID-18", "Perfil profesional del coach + prueba de 30 días sin tarjeta", "Identidad / Coach", "Coach",
     "REPI Acceso.dc.html · coach2/coachDone", "prototipo interactivo", "en_conflicto",
     "Nombre comercial, especialidad, modalidad, cantidad de alumnos. Precio ARS 700 es hipótesis (DEC-16).",
     "Perfil persistido; texto de precio marcado DEMO hasta decisión comercial.", "D03"),
    ("F-ID-19", "Checklist de puesta en marcha post-registro (coach y gym)", "Onboarding", "Coach, dueño",
     "REPI Acceso.dc.html · coachDone/gymDone", "prototipo interactivo", "documentado",
     "Coach: invitar, crear programa, asignar. Gym: sedes, importar socios, QR de recepción.",
     "Pasos reflejan estado real; retomables.", "F-CO-13, F-GO-03"),
    ("F-ID-20", "Reglas de contraseña con feedback en vivo", "Identidad", "Todos",
     "REPI Acceso.dc.html · pwRules (8+, número, letra)", "prototipo interactivo", "documentado",
     "Mismas reglas en cliente y servidor.", "Servidor rechaza contraseña débil aunque el cliente falle.", "F-ID-01"),
    ("F-CL-08", "Check-in antes de entrenar (3 toques)", "Entrenamiento / salud", "Alumno",
     "REPI App Alumno v4.dc.html ('Check-in antes de entrenar', '¿Cómo llegás hoy?'); Auditoría 1.3", "prototipo interactivo", "documentado",
     "Alimenta check-in del coach con fecha y fuente.", "Persistido; visible al coach sólo con relación/grant.", "F-CO-04"),
    ("F-CL-09", "Reportar molestia (zona, intensidad 0–10, ejercicio) con aviso no-diagnóstico", "Entrenamiento / salud", "Alumno",
     "REPI App Alumno v4.dc.html ('Reportar molestia'); Auditoría 1.1 🔴", "prototipo interactivo", "documentado",
     "Seguridad: el coach recibe alerta; REPI no diagnostica.", "Llega a la bandeja del coach con grant de salud; sin grant, sólo alerta sin detalle (a decidir D06/D12).", "F-CO-06, F-CO-14"),
    ("F-CL-10", "Lesiones y antecedentes en perfil del alumno", "Salud", "Alumno",
     "REPI App Alumno v4.dc.html ('Agregar lesión o antecedente'); Auditoría 1.2", "prototipo interactivo", "documentado",
     "Dato sensible con consentimiento.", "Visible a coach sólo con grant salud.", "F-PR-05"),
    ("F-CL-11", "Nota y RPE de sesión al finalizar", "Entrenamiento", "Alumno",
     "REPI App Alumno v4.dc.html ('Después de entrenar', 'Elegí el esfuerzo de la sesión'); Auditoría 1.4/1.5", "prototipo interactivo", "documentado",
     "Alimenta registro de sesiones del coach.", "Persistido con la sesión.", "F-CL-05"),
    ("F-CL-12", "RIR opcional por serie", "Entrenamiento", "Alumno",
     "REPI App Alumno v4.dc.html ('Reps en reserva'); Auditoría 1.5", "prototipo interactivo", "documentado",
     "Prescripto vs realizado distintos.", "Opcional; no bloquea completar serie.", "F-CL-03"),
    ("F-CL-13", "Solicitudes del alumno: pedir ayuda, cambiar rutina, revisar técnica (video opcional)", "Entrenamiento / Gym / Coach", "Alumno, socio",
     "REPI App Alumno v4.dc.html ('Cambiar mi rutina', 'Revisar mi técnica', 'Adjuntar video (opcional)'); Auditoría 3.1 🔴, 2.7", "prototipo interactivo", "documentado",
     "A coach o a equipo de sala; estados enviado/en curso/resuelto; no incluye mensajes privados.",
     "Pedido llega como tarea al destinatario correcto y cambia de estado en ambos lados.", "F-GT-02, F-CO-14"),
    ("F-CL-14", "Aviso de programa nuevo/actualizado con autor", "Entrenamiento", "Alumno",
     "REPI App Alumno v4.dc.html ('Programa nuevo', 'actualizó tu programa'); Auditoría 2.1/3.2 🔴", "prototipo interactivo", "documentado",
     "El programa sale de la relación activa (coach o gym).", "Asignación genera aviso; versión anterior consultable.", "F-CO-08, F-GT-03"),
    ("F-CL-15", "Estado vacío sin programa + 'Pedir mi programa'", "Entrenamiento", "Alumno",
     "REPI App Alumno v4.dc.html ('Todavía no tenés programa'); GAP-20", "prototipo interactivo", "documentado",
     "Inicio útil sin programa.", "Pedido llega a coach/equipo de sala.", "F-CL-13"),
    ("F-CL-16", "Indicador offline / pendiente de sincronizar / guardado en el teléfono", "Entrenamiento", "Alumno",
     "REPI App Alumno v4.dc.html ('Sin conexión...', 'series pendientes', 'Simular sin conexión'); GAP-02", "prototipo interactivo (simulado)", "documentado",
     "Estados reales de sync; la simulación del prototipo no acredita offline.", "Ver F-CL-07.", "F-CL-07"),
    ("F-PR-06", "Solicitudes de acceso del coach recibidas en la app: aceptar/rechazar", "Privacidad", "Alumno, coach",
     "REPI App Alumno v4.dc.html ('Solicitudes de acceso', 'Quiere ver tu'); Desktop Coach ('Solicitud enviada · esperando respuesta', 'Rechazada por el alumno'); Auditoría 1.9 🔴", "prototipo interactivo", "confirmado",
     "Destinatario, alcance, motivo, vencimiento; aceptación crea grant; rechazo visible al coach.", "Circuito cerrado en ambas superficies; revocación efectiva.", "F-PR-01, F-ID-14"),
    ("F-RV-06", "Reseña del socio en la app (v4)", "Reseñas", "Socio",
     "REPI App Alumno v4.dc.html ('¿Cómo te atendió', 'Trato profesional', visibilidad sin nombre); GAP-07", "prototipo interactivo", "documentado",
     "Reemplaza la falta en v3; reglas de cadencia siguen como supuesto.", "Ver F-RV-01.", "F-RV-01"),
    ("F-GC-06", "Carnet digital / QR del socio", "Gym", "Socio, recepción",
     "REPI App Alumno v4.dc.html ('Socia N.º', 'QR para recepción, premios y descuentos'); Auditoría 3.5", "prototipo interactivo", "documentado",
     "Para premios, descuentos y asistencia; QR no expone datos personales.", "QR firmado/rotativo; recepción lo valida.", "F-GR-01"),
    ("F-GC-07", "Premio listo para retirar / entregado", "Comunidad gym", "Socio, recepción",
     "REPI App Alumno v4.dc.html ('Premio listo para retirar', 'Premio entregado'); Auditoría 3.5", "prototipo interactivo", "documentado",
     "Entrega marcada por recepción; no es comercio electrónico.", "Estado sincronizado socio/recepción.", "F-GC-02, F-GR-01"),
    ("F-GC-08", "Asistencia por check-in de molinete/QR", "Gym", "Socio, gym",
     "REPI App Alumno v4.dc.html ('Prototipo: simular ingreso por molinete'); Auditoría 3.6", "prototipo interactivo (simulado)", "propuesto",
     "Asistencia es entidad propia, no sinónimo de sesión registrada.", "Fuente de asistencia definida (D22).", "D22"),
    ("F-GC-09", "Mejor marca personal en desafío", "Comunidad gym", "Socio",
     "REPI App Alumno v4.dc.html ('Tu mejor marca:'); Auditoría 3.7", "prototipo interactivo", "documentado",
     "Intento válido ≠ récord; mejor marca propia aunque no supere el récord.", "Derivado de intentos validados.", "F-GC-03"),
    ("F-CO-13", "Invitar cliente desde el coach (enlace/código) con estados", "Coach / identidad", "Coach",
     "REPI Desktop Coach.dc.html ('Invitar cliente', 'Invitación pendiente', 'Rechazada por el alumno'); Auditoría 2.5 🔴", "prototipo interactivo", "documentado",
     "El alumno acepta y elige qué compartir; empieza a facturar con programa asignado (D01).", "Invitación persistida, expira, se revoca; aceptación crea coach_client.", "F-ID-03"),
    ("F-CO-14", "Bandeja 'Pedidos de alumnos' (pedidos, molestias, invitaciones) con 'Marcar resuelto'", "Coach", "Coach",
     "REPI Desktop Coach.dc.html ('Pedidos de alumnos', 'Marcar resuelto')", "prototipo interactivo", "documentado",
     "Fuente: app del alumno.", "Estados sincronizados con la app.", "F-CL-09, F-CL-13"),
    ("F-CO-15", "Solicitud de acceso del coach con motivo y estado", "Coach / privacidad", "Coach",
     "REPI Desktop Coach.dc.html ('Para adaptar ejercicios a tus molestias.', 'Acceso concedido')", "prototipo interactivo", "confirmado",
     "Ver F-PR-06.", "Ver F-PR-06.", "F-PR-06"),
    ("F-CO-16", "Informe mensual para el alumno (PDF en la app)", "Coach", "Coach, alumno",
     "REPI Desktop Coach.dc.html ('Informe mensual', 'No incluye datos de salud salvo que lo marques')", "prototipo interactivo", "documentado",
     "Sin salud por defecto.", "Informe generado desde datos persistidos.", "F-CL-06"),
    ("F-CO-17", "Ingresos esperado vs cobrado", "Pagos coach", "Coach",
     "REPI Desktop Coach.dc.html ('Esperado en mayo', 'Cobrado ARS 574.000'); Auditoría §Coach", "prototipo interactivo", "documentado",
     "Dos métricas con definición.", "Valores derivados de cargos/pagos registrados.", "F-BL-01"),
    ("F-BL-05", "Aviso al cliente de cambio de suscripción, fin de prueba y criterio de conteo", "Facturación SaaS", "Coach, dueño",
     "REPI Desktop Coach.dc.html ('Cambio en tu suscripción:', 'Termina el 31 may', 'máximo del período'); Auditoría 4.1–4.4 🔴", "prototipo interactivo", "en_conflicto",
     "Lo que Admin cambia se comunica con fecha efectiva.", "Aviso y historial visibles al cliente.", "F-AD-03, D01, D02"),
    ("F-CO-18", "Molestias y check-ins recientes en la ficha", "Coach", "Coach",
     "REPI Desktop Coach.dc.html ('Molestias y check-ins recientes', 'Revisar ejercicios que cargan la zona')", "prototipo interactivo", "documentado",
     "Datos con productor/fecha; salud con grant.", "Sin seeds presentados como datos reales.", "F-CL-08, F-CL-09"),
]

# Requisitos de la Auditoría de huecos sin prototipo propio (fuente: 'REPI Auditoría de huecos.md').
AUDIT_GAPS = [
    ("F-HX-01", "Registro de nutrición del alumno o integración", "1.6"), ("F-HX-02", "Vista de objetivos acordados en la app", "1.7"),
    ("F-HX-03", "Ficha de salud + apto médico con aviso de vencimiento", "1.8"), ("F-HX-04", "Descanso por ejercicio desde la prescripción", "2.2"),
    ("F-HX-05", "Indicación del coach por ejercicio en sesión activa", "2.3"), ("F-HX-06", "Plan y estado de pago con el coach visible al alumno", "2.4"),
    ("F-HX-07", "Próxima sesión presencial, calendario y confirmación de asistencia", "2.6"), ("F-HX-08", "Chat con adjuntos, audios, difusión y plantillas", "2.8"),
    ("F-HX-09", "Selector de relación activa gym/coach y regla de programa", "3.4"), ("F-HX-10", "Cierre de desafíos: ganador, anuncio, archivo, ranking, historial", "3.7"),
    ("F-HX-11", "Categorías de desafíos y deslinde de seguridad", "3.8"), ("F-HX-12", "Validación presencial sin video por entrenador de sala", "3.9"),
    ("F-HX-13", "Novedades/desafíos por sede, vencimiento de descuentos, push al publicar", "3.10"), ("F-HX-14", "Catálogo con disponibilidad, horarios y promos destacadas", "3.11"),
    ("F-HX-15", "Intentos y logros en la ficha del socio (sala)", "3.12"), ("F-HX-16", "'Entrenadores en sala ahora' en la app", "3.13"),
    ("F-HX-17", "Estado de cuenta del cliente: vencido/pausada, gracia, efecto en alumnos", "4.3"), ("F-HX-18", "Medio de pago, comprobantes, facturas descargables, recordatorio", "4.5"),
    ("F-HX-19", "Admin: cohortes, soporte, ver como cliente con auditoría, autor en log, 2FA", "4.6"), ("F-HX-20", "Prorrateo e impuestos", "4.7"),
    ("F-HX-21", "Sesión activa: sustituir ejercicio, nota por serie, saltar, entrada en calor, calculadora de discos", "5 App"),
    ("F-HX-22", "Notificación local del temporizador en segundo plano", "5 App"), ("F-HX-23", "Configuración: kg/lb, idioma, notificaciones, menores", "5 App"),
    ("F-HX-24", "Promociones del coach gestionables", "5 Coach"), ("F-HX-25", "Comunidad propia del coach (anuncios y desafíos)", "5 Coach"),
    ("F-HX-26", "Centro de notificaciones del staff gym", "5 Gym"), ("F-HX-27", "Mensajería entrenador de sala ↔ socio", "5 Gym"),
    ("F-HX-28", "Integraciones Apple Health / Google Fit / relojes", "Transversal"),
]

RETIRED = [
    ("R-01", "Membresías e ingresos del gym (gym→socio)", "DEC-10; 19_NEW_FEATURES §Elementos retirados"),
    ("R-02", "Persona 'socia (móvil)' dentro del desktop del gym", "DEC-11"),
    ("R-03", "Enlaces 'App del alumno →' desde desktops coach/gym", "DEC-11"),
    ("R-04", "Autoalta de coach y gym con prueba automática de 30 días", "Anexo 26/10/2026 §3 (D59)"),
    ("R-05", "Alta de socio por DNI contra padrón obligatorio", "Anexo 26/10/2026 §5 (D60)"),
    ("R-06", "Precios de referencia ARS 700 por alumno, tramos y mínimos por defecto", "Anexo 26/10/2026 §9 (D58)"),
]


def base(**kw):
    row = {
        "id": "", "nombre": "", "fuente": "", "modulo": "", "rol": "", "proposito_regla": "",
        "pantallas": [], "diseno": "", "certeza": "documentado", "conflicto": None,
        "estado_tecnico": "sin_implementar", "dependencias": "", "aceptacion": "", "pendiente": "",
        "origen": "",
    }
    row.update(kw)
    row["estado_tecnico"] = REPO_STATUS.get(row["id"], row["estado_tecnico"])
    return row


# Nombres del handoff superados por decisiones posteriores (el handoff no se modifica). Tipografía oficial y definitiva:
# Barlow / Barlow Condensed (G · Atlética, REPI_SELECCION_VISUAL.md); Inter Tight quedó descartada (confirmado 27/10/2026).
NAME_FIX = {"F-BR-01": "Identidad Concepto 2 (wordmark, isotipo, paleta) con tipografía Barlow (G · Atlética)"}


def main():
    feats = json.loads((SPEC / "features.json").read_text(encoding="utf-8"))["features"]
    rows = []
    for f in feats:
        fid = f["id"]
        acc = f.get("acceptance") or ""
        rows.append(base(
            id=fid, nombre=NAME_FIX.get(fid, f["name"]), fuente="features.json · " + fid, modulo=f["module"], rol=f["roles"],
            pantallas=f.get("screens", []), diseno=DESIGN.get(f["status"], f["status"]),
            certeza="en_conflicto" if fid in CONFLICT else ("confirmado" if fid in CONFIRMED else "documentado"),
            conflicto=CONFLICT.get(fid), dependencias=f.get("dependencies", ""),
            aceptacion=acc if acc and acc != "—" else "", origen=f.get("origin", ""),
            pendiente="" if acc and acc != "—" else "Criterio de aceptación vacío en el handoff: definir",
        ))
    # Ajustes por el handoff nuevo (delta documentado en docs/DECISIONS.md §Delta).
    delta = {
        "F-ID-01": ("prototipo interactivo", "REPI Acceso.dc.html (nuevo): login email/contraseña, social, enlace, recuperación, 2FA"),
        "F-ID-02": ("prototipo interactivo", "REPI Acceso.dc.html · choose→coach1→verify→coach2→coachDone"),
        "F-ID-03": ("prototipo interactivo", "REPI Acceso.dc.html · code→invite→inv1→verify→consent→appDone"),
        "F-RV-01": ("prototipo interactivo", "REPI App Alumno v4.dc.html: prompt de reseña restituido"),
        "F-MO-02": ("diseño parcial", "v4 no agrega selector de relación; sigue GAP-24"),
    }
    for r in rows:
        if r["id"] in delta:
            r["diseno"], note = delta[r["id"]]
            r["fuente"] += " · " + note
    for (fid, name, mod, rol, src, dis, cert, rule, acc, deps) in NEW:
        rows.append(base(id=fid, nombre=name, fuente=src, modulo=mod, rol=rol, proposito_regla=rule,
                         diseno=dis, certeza=cert, aceptacion=acc, dependencias=deps, origen="handoff-2026-10-25-nuevo",
                         conflicto=CONFLICT.get(fid)))
    for (fid, name, ref) in AUDIT_GAPS:
        rows.append(base(id=fid, nombre=name, fuente="REPI Auditoría de huecos.md · " + ref, modulo="Auditoría de huecos",
                         diseno="sin diseño", certeza="propuesto", origen="auditoria-huecos",
                         pendiente="Requisito propuesto por auditoría de diseño; requiere diseño y criterio"))
    for (fid, name, ref) in RETIRED:
        rows.append(base(id=fid, nombre=name, fuente=ref, modulo="Retirado", certeza="retirado",
                         estado_tecnico="no_aplica", origen="retirado", pendiente="No reactivar"))

    out = ROOT / "docs"
    out.mkdir(exist_ok=True)
    (out / "PRODUCT_INVENTORY.json").write_text(json.dumps({"generado_por": "scripts/inventory/build_inventory.py", "total": len(rows), "items": rows}, ensure_ascii=False, indent=1), encoding="utf-8")

    cnt = {}
    for r in rows:
        cnt[r["estado_tecnico"]] = cnt.get(r["estado_tecnico"], 0) + 1
    lines = [
        "# Inventario de producto REPI",
        "",
        "Generado por `scripts/inventory/build_inventory.py` desde `features.json` (93 IDs) y los hallazgos del handoff 2026-10-25. No editar a mano: editar el script.",
        "",
        "Ejes separados: **certeza** (confirmado/documentado/propuesto/en_conflicto/retirado), **diseño** disponible en el handoff y **estado técnico en este repo** (sin_implementar/estatico/interactivo_local/simulado/integrado/persistente/probado).",
        "",
        f"Total: **{len(rows)}** entradas. Estado técnico: " + ", ".join(f"{k} {v}" for k, v in sorted(cnt.items())) + ".",
        "",
        "| ID | Funcionalidad | Módulo | Rol | Certeza | Diseño | Estado repo | Fuente | Aceptación / pendiente |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    esc = lambda s: (s or "").replace("|", "\\|").replace("\n", " ")
    for r in rows:
        cert = r["certeza"] + (f" ({r['conflicto']})" if r["conflicto"] else "")
        acc = r["aceptacion"] or r["pendiente"]
        lines.append(f"| {r['id']} | {esc(r['nombre'])} | {esc(r['modulo'])} | {esc(r['rol'])} | {esc(cert)} | {esc(r['diseno'])} | {r['estado_tecnico']} | {esc(r['fuente'])} | {esc(acc)} |")
    (out / "PRODUCT_INVENTORY.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(len(rows), cnt)


if __name__ == "__main__":
    main()
