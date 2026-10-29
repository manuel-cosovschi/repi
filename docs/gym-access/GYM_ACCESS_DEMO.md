# Gym Access · Demo (D127)

La demo (`POST /api/demo`) crea una sandbox aislada con:

- **Gym Norte** (Palermo y Belgrano): control de acceso **activo en modo Híbrido**, ubicación de Palermo cargada (sin exigirla). Pantalla de recepción y validaciones sintéticas de 7 días (QR, equipo, QR + ubicación, rechazos por QR vencido y sin membresía).
- **Gym Sur**: otro gimnasio, sin relación con Valentina, para probar que un QR de otra organización se rechaza.
- **Agustín Pérez Coach**: Valentina entrena con él sin validar nada (Repi Coach no cambia).

## Recorridos

- **Dueño (Martín)**: «Acceso y presencia» → Panel (validados, rechazos, vigentes con «Revocar»), «Mostrar QR de ingreso» a pantalla completa, Política, «Pantallas y sedes» (crear pantalla y abrir el enlace en otra pestaña o tablet), «Validar a mano». «Accesos» → «Vigente hasta».
- **Socio (Valentina)**: Entrenar → elegir Gym Norte → «Check-in requerido» → «Usar el QR de Gym Norte» (el servidor genera el QR real de la sede, igual que la tablet) → «Acceso presencial habilitado» → comenzar. «Probar el QR de otro gimnasio» → rechazo «No tenés una membresía en este gimnasio».
- **Entrenador de sala (Sofía)**: «Mi turno» → «Validar un ingreso a mano».

Los atajos de la demo sólo funcionan para cuentas de la demo (`demoQr`).
