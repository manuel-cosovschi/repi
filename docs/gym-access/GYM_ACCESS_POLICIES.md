# Gym Access · Políticas (D127)

El módulo lo enciende REPI Admin por gimnasio (tarjeta «Control de acceso»). El dueño o una gerencia de todas las sedes eligen el modo en «Acceso y presencia › Política».

| Modo | Qué pide validar | Qué nunca se bloquea |
|---|---|---|
| **Abierto** | Nada | Todo |
| **Híbrido** (por defecto, recomendado) | Iniciar un entrenamiento del programa del gimnasio y registrar sus series | Rutina, historial, progreso, mensajes, privacidad, soporte, exportar datos, Repi Coach |
| **Estricto** | Lo de Híbrido + lo que elija el gimnasio: pedir ayuda al equipo (Connect), intentos de desafío | Igual que Híbrido |

## Parámetros

- **QR**: se renueva cada 15 a 120 s (30 por defecto). Más corto dificulta reenviar una foto; más largo tolera conexiones lentas.
- **Ingreso**: vale 1 a 6 h (3 por defecto). Vence solo; se puede revocar.
- **Ubicación**: apagada (defecto), opcional (dato extra; sin lectura alcanza el QR) u obligatoria (QR + cerca de la sede; sin lectura confiable, valida el equipo). Precisión máxima 150 m, lectura de hasta 120 s, radio de la sede 50 a 1000 m.

## Membresía

- **Vigente hasta** (Accesos): fecha de la cuota. Vencida, el socio ve su rutina pero no inicia entrenamientos del gimnasio.
- Pausar o dar de baja revoca los ingresos vigentes. Reactivar no crea un ingreso: hay que validar.

## Alternativas a la cámara

- Recepción o dueño: «Validar a mano» (búsqueda por nombre) o el carnet en el mostrador.
- Entrenador de sala: «Validar a mano» desde «Mi turno», con el turno iniciado en esa sede.
- Todo queda registrado con quién lo hizo y un motivo optativo sin datos de salud.
