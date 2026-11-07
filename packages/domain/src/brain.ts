// AC3 · REPI Intelligence Core («brain»). Punto de entrada único del dominio puro: el servidor y la interfaz importan
// `@repi/domain/brain`. No se reexporta desde `index.ts` para no mezclar nombres con los módulos anteriores
// (p. ej. `rankAlternatives` de session-changes).
export * from "./brain/types";
export * from "./brain/quiet";
export * from "./brain/util";
export * from "./brain/safety";
export * from "./brain/memory";
export * from "./brain/intents";
export * from "./brain/actions";
export * from "./brain/session";
export * from "./brain/relevance";
export * from "./brain/answers";
export * from "./brain/context";
