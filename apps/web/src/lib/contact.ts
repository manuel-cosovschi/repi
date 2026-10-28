// Contacto público de REPI y condiciones de soporte, confirmados por el titular el 27/10/2026 (D109). Una sola fuente
// para el sitio, Ayuda y las páginas legales: cambiar acá cambia en todos lados.
/** Dirección pública canónica: la usan los carteles impresos, que no pueden depender del entorno donde se generan. */
export const SITE = { url: "https://repiclub.com", install: "https://repiclub.com/instalar" } as const;

export const CONTACT = {
  email: "sovare.studio@gmail.com",
  phoneLabel: "223 538-3082",
  whatsapp: "https://wa.me/5492235383082",
} as const;

export const SUPPORT = {
  urgentHours: 24,
  customFee: "$ 30.000",
  urgent: "La app no funciona o un error te impide trabajar. Te respondemos dentro de las 24 horas.",
  included: "Avisanos cualquier error o duda de uso. Está incluido en tu acuerdo, sin costo extra.",
  custom: "Mantenimiento o cambios a medida para tu gimnasio o tu trabajo como coach. Se cobran aparte: $ 30.000 por pedido, acordado antes de hacerlo.",
} as const;
