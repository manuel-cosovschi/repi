// Tiempos máximos del lado del servidor (incidente 07/11: un pedido de /api/admin esperó 300 s algo que nunca terminaba).
// Una promesa de JavaScript no se puede cancelar: el límite deja de esperarla y avisa con un error claro. Lo que siga corriendo
// queda acotado por el maxDuration de la ruta.

export class DeadlineError extends Error {
  constructor(readonly what: string, readonly ms: number) {
    super(`${what}: sin respuesta en ${Math.round(ms / 1000)} s`);
    this.name = "DeadlineError";
  }
}

/** La promesa, o DeadlineError si no termina en `ms`. No deja temporizadores colgados ni rechazos sin atender. */
export function withDeadline<T>(p: Promise<T>, ms: number, what = "operación"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DeadlineError(what, ms)), Math.max(0, ms)); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** Tiempos de REPI Admin y del cron por minuto: el aviso al usuario llega antes del corte duro de la función (maxDuration). */
export const ADMIN_DEADLINE_MS = 25_000;
export const CRON_DEADLINE_MS = 45_000;
/** Trabajo posterior a la respuesta (after): avisos por email, cola de push. Nunca mantiene viva la función hasta el corte. */
export const AFTER_DEADLINE_MS = 20_000;
