# REPI Connect · QA

Actualizado: 28/10/2026 (D126).

## Automático

| Suite | Casos | Resultado |
| --- | --- | --- |
| Dominio `packages/domain/src/connect.test.ts` | estados, transiciones, motivos, prioridad, orden, palabras de riesgo, métricas, formato | 11/11 (dominio total 118/118) |
| Integración `apps/web/tests/connect.test.ts` | circuito completo con contexto del ejercicio y traspaso; seguimiento para el próximo turno y compatibilidad con la cola anterior; dos tomas simultáneas; reintento con la misma clave y pedido duplicado; cancelación antes y durante la atención; turno obligatorio, `not_mine`, cerradas; historial no editable; aislamiento socio / sede / organización / coach privado; gestión sin detalle; bandera apagada; avisos proactivos sin duplicar; demo comercial | 11/11 |
| Regresión web completa (Coach, rutinas, sesiones, historial, acceso, Gym, mensajería, facturación, demo) | — | 192/192 |
| Guardas de base | — | 11/11 |

## Navegador (dev local, 28/10/2026)

- Demo «Entrenador de sala» (escritorio): bandeja «Sala» con traspaso de Lucas, KPIs, equipo con disponibilidad declarada; detalle con historial, contexto y pedidos anteriores; «Aceptar traspaso» → «Resolver» con registro y mensaje al socio.
- Demo «Dueño» (escritorio): «Seguimiento de sala» con 15 pedidos, tiempos, traspasos, opinión, evolución semanal, por sede y uso del equipo.
- Demo «Socio» (375 px): «Pedir ayuda» → «Equipo de sala» → motivo y comentario → tarjeta «Tu pedido: pendiente» → «Mis pedidos» → detalle con línea de tiempo, comentar y cancelar.
- Sin errores de consola ni del servidor.

## Manual pendiente (no verificado todavía)

- Teléfonos reales (iPhone y Android): pedido desde un ejercicio durante el entrenamiento, aviso push al profesor en turno, apertura desde el aviso `/app?pedido=…`.
- Pérdida de conexión del profesor en medio de una acción (el servidor rechaza o aplica entero; falta verlo en un teléfono).
- Sesión vencida durante una acción (la API responde 401 y la app vuelve a ingresar, como el resto de REPI).
- Persona que cambia de organización: los pedidos quedan en el gimnasio donde se crearon; probar con un socio dado de baja.
- Producción: aplicar la migración 0025 y verificar una demo en https://repiclub.com/demo.

## Checklist para activar un piloto

1. Migración 0025 aplicada en Supabase y deploy verificado (`/api/version`).
2. Admin → ficha del gimnasio → «Activar piloto».
3. El dueño invita al equipo de sala y planifica turnos; cada profesor inicia turno en su sede.
4. Un socio de prueba hace un pedido y el equipo lo recorre entero: tomar, atender, registrar, transferir, aceptar, resolver.
5. El dueño ve el pedido en «Seguimiento de sala».
