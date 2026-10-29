// Correos con la estética de REPI (D149): G · Atlética sobre fondo oscuro, ícono y marca arriba (una sola imagen, public/icons/mail-header.png), Barlow con respaldo
// Arial (los clientes de correo no cargan fuentes web), botón cian para el enlace y el código destacado. Se arma a partir del
// texto de siempre, que también viaja como versión de texto: ningún correo cambia lo que dice.
const C = { bg: "#0A0F1A", card: "#121A28", line: "#1C2636", ink: "#F4F7FB", muted: "#8A9AAF", cyan: "#00D1FF", navy: "#0B0F14" };
const FONT = "'Barlow', 'Helvetica Neue', Arial, sans-serif";
const DISPLAY = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
const URL_RE = /https?:\/\/[^\s<>"']+/;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Texto del botón según a dónde lleva el enlace. */
export function ctaLabel(url: string) {
  let path = "";
  try { path = new URL(url).pathname; } catch { /* enlace raro: texto genérico */ }
  if (path.startsWith("/activar-admin")) return "Activar administración";
  if (path.startsWith("/activar")) return "Activar mi espacio";
  if (path.startsWith("/tutor")) return "Revisar y decidir";
  if (path.includes("magic-link") || path.startsWith("/api/auth")) return "Entrar a REPI";
  return "Abrir REPI";
}

type Block = { kind: "p"; text: string } | { kind: "code"; label: string | null; code: string } | { kind: "cta"; lead: string; url: string } | { kind: "gap" };

/** Interpreta el texto del correo: líneas, enlaces (botón) y códigos (destacados). */
export function mailBlocks(body: string): Block[] {
  const out: Block[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) { if (out.length && out.at(-1)!.kind !== "gap") out.push({ kind: "gap" }); continue; }
    const url = URL_RE.exec(line)?.[0];
    if (url) {
      // «Abrí <enlace>» o «Revisá y decidí en <enlace>»: el botón ya lo dice; una frase con contenido («Entrá sin contraseña») queda.
      const lead = line.replace(url, "").replace(/\s*[:·-]?\s*$/, "").replace(/\s+en$/i, "").trim();
      out.push({ kind: "cta", lead: /^\S+$/.test(lead) ? "" : lead, url: url.replace(/[.,)]+$/, "") });
      continue;
    }
    const otp = /^(.*?)(\b\d{6}\b)(.*)$/.exec(line);
    if (otp && /c[oó]digo/i.test(line)) {
      const before = otp[1].trim().replace(/[:\s]+$/, ""), after = otp[3].replace(/^\s*[.:,]\s*/, "").trim();
      if (before) out.push({ kind: "p", text: `${before}:` });
      out.push({ kind: "code", label: null, code: otp[2] });
      if (after) out.push({ kind: "p", text: after });
      continue;
    }
    const inv = /^C[oó]digo:\s*([A-Z0-9-]{4,24})\s*$/i.exec(line);
    if (inv) { out.push({ kind: "code", label: "Tu código", code: inv[1] }); continue; }
    out.push({ kind: "p", text: line });
  }
  while (out.at(-1)?.kind === "gap") out.pop();
  return out;
}

export function renderMailHtml(m: { subject: string; body: string }, site = process.env.NEXT_PUBLIC_APP_URL ?? "https://repiclub.com") {
  const base = site.replace(/\/$/, "");
  const blocks = mailBlocks(m.body).map((b) => {
    if (b.kind === "gap") return `<tr><td style="height:8px;line-height:8px;font-size:8px">&nbsp;</td></tr>`;
    if (b.kind === "p") return `<tr><td style="padding:0 0 12px;font:400 16px/1.5 ${FONT};color:${C.ink}">${esc(b.text)}</td></tr>`;
    if (b.kind === "code") return `<tr><td style="padding:4px 0 16px">${b.label ? `<div style="font:600 12px ${FONT};color:${C.muted};text-transform:uppercase;letter-spacing:.08em;padding-bottom:6px">${esc(b.label)}</div>` : ""}<div style="display:inline-block;padding:12px 20px;border-radius:12px;background:${C.bg};border:1px solid ${C.line};font:800 34px/1 ${DISPLAY};letter-spacing:.18em;color:${C.cyan}">${esc(b.code)}</div></td></tr>`;
    return `<tr><td style="padding:4px 0 16px">${b.lead ? `<div style="font:400 16px/1.5 ${FONT};color:${C.ink};padding-bottom:12px">${esc(b.lead)}</div>` : ""}`
      + `<a href="${esc(b.url)}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:${C.cyan};color:${C.navy};font:700 16px ${FONT};text-decoration:none">${esc(ctaLabel(b.url))}</a>`
      + `<div style="font:400 12px/1.5 ${FONT};color:${C.muted};padding-top:10px;word-break:break-all">Si el botón no anda, copiá este enlace: <a href="${esc(b.url)}" style="color:${C.muted}">${esc(b.url)}</a></div></td></tr>`;
  }).join("");
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${esc(m.subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:${C.bg}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">`
    + `<tr><td style="padding:0 4px 16px"><a href="${esc(base)}" style="text-decoration:none"><img src="${esc(base)}/icons/mail-header.png" width="146" height="56" alt="REPI" style="display:block;border:0;color:${C.ink};font:800 22px ${DISPLAY}"></a></td></tr>`
    + `<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:18px;padding:28px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">`
    + `<tr><td style="padding:0 0 16px;font:800 28px/1.1 ${DISPLAY};color:${C.ink};text-transform:uppercase;letter-spacing:-.01em">${esc(m.subject)}</td></tr>${blocks}</table></td></tr>`
    + `<tr><td style="padding:18px 4px 0;font:400 12px/1.5 ${FONT};color:${C.muted}">REPI · Cada repetición cuenta. Es un correo automático: no hace falta responder.<br><a href="${esc(base)}" style="color:${C.muted}">${esc(base.replace(/^https?:\/\//, ""))}</a></td></tr>`
    + `</table></td></tr></table></body></html>`;
}
