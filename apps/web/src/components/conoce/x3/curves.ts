// Curvas de los trazos de luz (02), la vuelta al punto (08) y el pedido (05). Bézier cuadrática o cúbica muestreada una sola
// vez (24 tramos, al medir en el refresh) en una tabla con largo acumulado: en cada cuadro se interpola en la tabla, sin
// getPointAtLength ni lecturas de diseño.
export type Pt = [number, number];
export type Curve = { d: string; length: number; at: (u: number) => Pt };

const N = 24;

function build(pts: Pt[], d: string): Curve {
  const acc = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) acc[i] = acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const length = acc[pts.length - 1];
  /** Punto a la fracción u (0–1) del largo del trazo. */
  const at = (u: number): Pt => {
    const target = Math.min(1, Math.max(0, u)) * length;
    let i = 1;
    while (i < pts.length - 1 && acc[i] < target) i++;
    const seg = acc[i] - acc[i - 1] || 1, f = (target - acc[i - 1]) / seg;
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
  };
  return { d, length, at };
}

const f1 = (n: number) => n.toFixed(1);

export function quad(a: Pt, c: Pt, b: Pt): Curve {
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) { const t = i / N, m = 1 - t; pts.push([m * m * a[0] + 2 * m * t * c[0] + t * t * b[0], m * m * a[1] + 2 * m * t * c[1] + t * t * b[1]]); }
  return build(pts, `M${f1(a[0])},${f1(a[1])} Q${f1(c[0])},${f1(c[1])} ${f1(b[0])},${f1(b[1])}`);
}

export function cubic(a: Pt, c1: Pt, c2: Pt, b: Pt): Curve {
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, m = 1 - t, k0 = m * m * m, k1 = 3 * m * m * t, k2 = 3 * m * t * t, k3 = t * t * t;
    pts.push([k0 * a[0] + k1 * c1[0] + k2 * c2[0] + k3 * b[0], k0 * a[1] + k1 * c1[1] + k2 * c2[1] + k3 * b[1]]);
  }
  return build(pts, `M${f1(a[0])},${f1(a[1])} C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(b[0])},${f1(b[1])}`);
}

/** Trazo orgánico de a hacia b: una cúbica con los controles corridos hacia un costado (no una línea radial recta). `bend`
 *  es la fracción del largo que se abre la curva; el signo elige el lado. */
export function organic(a: Pt, b: Pt, bend = 0.28): Curve {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const o = len * bend;
  return cubic(a, [a[0] + dx * 0.25 + nx * o, a[1] + dy * 0.25 + ny * o], [a[0] + dx * 0.7 + nx * o * 0.55, a[1] + dy * 0.7 + ny * o * 0.55], b);
}
