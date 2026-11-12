# Activar REPI Control en un gimnasio

> **Regla del titular:** no se activa en ningún gimnasio real sin su autorización expresa, gimnasio por gimnasio. Las demos no
> cuentan como gimnasios reales.

## 1. Antes

- Contrato del gimnasio cargado en REPI Admin (Clientes).
- El dueño entiende qué cambia para sus socios:
  - dejan de crear, importar, editar y entrenar rutinas propias dentro de ese gimnasio;
  - no piden rutinas ni ajustes a la IA dentro de ese gimnasio;
  - el resto sigue igual.
- Lo que ya guardaron no se borra y vuelve a estar disponible si el gimnasio vuelve a «Normal».
- Si un socio entrena además con un coach personal, ahí conserva sus rutinas.
- Hardware a cargo del gimnasio: tablet o monitor táctil con navegador actualizado y wifi estable. Conviene un soporte fijo, el modo
  quiosco del sistema (Android «Fijar pantalla», iPadOS «Acceso guiado») y el navegador en pantalla completa.
- Cada socio que vaya a usar la pantalla necesita su cuenta de socio en ese gimnasio, porque los programas se asignan a socios.
  Se da de alta como hoy: QR de la sede, invitación o recepción. El socio no necesita instalar la app ni recordar email o
  contraseña para la pantalla.

## 2. REPI Admin (sólo personal de REPI)

En **Clientes › el gimnasio › REPI Control · planificación supervisada**:

1. **Activar supervisado.** Pide confirmación. Queda auditado (`routine_policy.supervised`).
2. **Pantalla de consulta de rutinas › Habilitar.** Queda auditado (`kiosk.enabled`).

Las dos cosas son independientes. Se puede habilitar la pantalla sin supervisar, aunque comercialmente va con REPI Control.
Para volver atrás se usa el mismo botón. Deshabilitar la pantalla cierra al instante las consultas abiertas.

## 3. El gimnasio

| Quién | Dónde | Qué hace |
| --- | --- | --- |
| Dueño o gerencia | **Pantalla de rutinas** | **Registrar pantalla**: el enlace se muestra una sola vez; se abre en la tablet y queda autorizada. **Revocar** cuando haga falta. |
| Recepción, gerencia o dueño | Ficha del socio › **Pantalla de rutinas** | **Emitir código y PIN**: se muestran una sola vez para entregarlos o imprimirlos. **Generar nuevo PIN** anula el anterior. **Revocar**. |
| Coordinación y sala (permiso de programas) | Ficha del socio › programa | Arman, cambian y asignan el programa. Cada guardado es una versión nueva; la pantalla siempre muestra la vigente. |
| Dueño y gerencia | **Equipo** › Gestionar acceso | Quitan a alguien del equipo o le cambian rol o sede (STF-09). Sus tareas vuelven a la cola. |

El socio que usa la app ve su código en «Tu gym» y puede elegir su propio PIN. Nunca ve el PIN de nadie, ni el suyo una vez emitido.

## 4. Comprobar

- En la tablet: **Empezar**, código, PIN, **Consultar mi rutina** (objetivos del profesor, sugerencia de REPI y última vez) y
  **Terminar**, que deja la pantalla libre.
- **Registrar mi entrenamiento:** elegir el día, abrir un ejercicio, confirmar lo hecho y ver «Guardado». Volver a entrar con el
  código y el PIN muestra lo guardado; la ficha del socio lo marca como «Pantalla del gimnasio».
- Si la consulta queda abierta, se cierra sola a los 60 segundos sin uso.
- En la app de un socio de ese gimnasio:
  - no aparecen «Mis rutinas» ni «No vino el profe»;
  - sí puede registrar su entrenamiento asignado.
- Auditoría del gimnasio: los intentos bloqueados quedan como `routine_policy.blocked` y las identificaciones como `kiosk.*`.

## 5. Volver a «Normal»

En REPI Admin, **Volver a normal**. No borra nada; las rutinas propias guardadas vuelven a aparecer. Las pantallas y
credenciales quedan registradas; si además se deshabilita la pantalla, dejan de funcionar hasta volver a habilitarla.

## 6. Comercial

- **Precios:** no se publican. El dossier editable está en `marketing/dossier/repi-control/`, con un escenario ilustrativo que
  hay que revisar antes de compartirlo.
- **Contactos:** los de /conoce traen la modalidad elegida (REPI Completo, REPI Control o «todavía no sé»), visible en
  REPI Admin › Contactos.
