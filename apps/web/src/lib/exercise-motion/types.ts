// REPI Exercise Motion 1.0 (D220): tipos del motor de demostraciones. Todo es vectorial y propio de REPI: un cuerpo
// articulado (cinemática inversa de dos segmentos por miembro) que se mueve entre poses clave escritas a mano para cada
// ejercicio, con el equipamiento dibujado alrededor. Unidades del mundo: centímetros, y hacia arriba, piso en y = 0.

export type Vec = [number, number];

/** Vista lateral (plano sagital, la figura mira a +x) o frontal (plano frontal, la figura mira al observador). */
export type View = "side" | "front";

/**
 * Lado de cada miembro. En la vista lateral `near` es el lado que mira al observador y `far` el de atrás. En la frontal
 * `near` es el lado derecho de la figura (queda a la izquierda de la pantalla, x negativa) y `far` el izquierdo.
 */
export type Side = "near" | "far";
export type Pair<T> = { near: T; far?: T };

export type Pose = {
  /** Centro de la articulación de la cadera (o punto medio entre ambas en la vista frontal). */
  pelvis: Vec;
  /**
   * Inclinación del tronco en grados desde la vertical. Lateral: + hacia adelante (90 = boca abajo, cabeza a +x; −90 = boca
   * arriba, cabeza a −x). Frontal: + inclina hacia el lado `far`.
   */
  trunk: number;
  /**
   * Flexión de la columna (vista lateral), en grados: la mitad superior del tronco gira respecto de la inferior (+ = se enrolla
   * hacia adelante, como en un crunch). 0 = tronco recto.
   */
  curl?: number;
  /** Cabeza respecto del tronco, en grados (+ = mentón hacia adelante). */
  head?: number;
  /** Punto de agarre de cada mano. */
  hand: Pair<Vec>;
  /** Tobillo de cada pie. */
  foot: Pair<Vec>;
  /** Inclinación de la planta en grados (+ = puntas abajo / flexión plantar; 90 = pie apuntando al piso). */
  footTilt?: Partial<Record<Side, number>>;
  /** Hacia dónde apunta la rodilla o el codo (dirección en el mundo) cuando la cinemática inversa tiene dos soluciones. */
  knee?: Partial<Record<Side, Vec>>;
  elbow?: Partial<Record<Side, Vec>>;
  /**
   * Escorzo: largo aparente de cada segmento (1 = completo). Sirve para un miembro que apunta hacia el observador, como el
   * muslo de una persona sentada vista de frente. Vale para los dos lados.
   */
  scale?: Partial<Record<"thigh" | "shin" | "upperArm" | "foreArm", number>>;
  /** Valores animados del equipamiento (por ejemplo, el recorrido del carro de la prensa). */
  props?: Record<string, number>;
};

export type Ease = "inOut" | "in" | "out" | "linear";
export type Key = { t: number; pose: Pose; ease?: Ease; /** Rótulo de la fase que empieza en esta pose. */ say?: string };

/**
 * Un valor del equipamiento: fijo, o ligado a un punto del cuerpo en cada cuadro («hand.near», «foot.far», «knee.near»,
 * «elbow.near», «shoulder», «hip», «head», «chest», «pelvis») o a un valor animado («props.sled»).
 */
export type Bind = number | Vec | string;
export type Prop = { kind: string; layer?: "back" | "mid" | "front"; [k: string]: Bind | Bind[] | boolean | undefined };

export type MotionSpec = {
  view: View;
  /** Duración de una repetición completa en segundos (el ciclo se repite). */
  seconds: number;
  keys: Key[];
  props: Prop[];
  /**
   * Cámara cenital (desde arriba), para movimientos en el plano horizontal de alguien acostado o inclinado (aperturas,
   * pájaros). Se escribe como una vista frontal (la figura «parada», mirando al observador) y se dibuja girada 90°: la cabeza
   * queda a la izquierda. Sin piso ni sombra.
   */
  camera?: "top";
  /** Encuadre opcional en el mundo [x, y, ancho, alto]; si falta, se calcula con todo el recorrido. */
  frame?: [number, number, number, number];
};

/** Primitiva de dibujo en coordenadas de pantalla (y hacia abajo). `cls` define el color por tema (motion.css). */
export type Prim =
  | { el: "path"; d: string; cls: string; o?: number }
  | { el: "circle"; cx: number; cy: number; r: number; cls: string; o?: number }
  | { el: "line"; x1: number; y1: number; x2: number; y2: number; cls: string; w?: number; o?: number };
