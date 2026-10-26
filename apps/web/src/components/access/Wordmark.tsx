// Wordmark aprobado: PNG original (wm_full.png, sin punto) + punto circular #00D1FF (DEC-01). Nunca texto.
export function Wordmark({ width = 83 }: { width?: number }) {
  return (
    <span className="wm" role="img" aria-label="repi" style={{ width }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/wm_full.png" alt="" width={315} height={154} />
      <i />
    </span>
  );
}
