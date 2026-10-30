"use client";
// Comunidad del gym, Validaciones, mostrador de recepción y moderación de Repi Club
// (REPI Desktop Gym.dc.html · sc.community / sc.validations). Datos reales de /api/gym/[orgId].
import { useRef, useState } from "react";
import { CHALLENGE_CATEGORIES, CHALLENGE_UNITS, IMAGE_LIMITS, SAFETY_NOTE, type ChallengeUnit } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Head, fmt, nf, useAct, useLoad, when, type Shell } from "./shared";

type Post = { id: string; type: "novedad" | "descuento"; title: string; text: string; badge: string | null; imageId: string | null; validUntil: string | null; sede: string; expired: boolean; createdAt: string };
type Ch = { id: string; title: string; rule: string; unit: ChallengeUnit; lowerIsBetter: boolean; category: keyof typeof CHALLENGE_CATEGORIES; prize: string; endsOn: string; status: string; sede: string; record: string; holder: string | null; participants: number; pending: number };
type Item = { id: string; category: string; name: string; priceArs: number; promo: string | null; highlighted: boolean; available: boolean; imageId: string | null; sede: string };
type Com = { canPublish: boolean; canCatalog: boolean; allLocations: boolean; locations: { id: string; name: string; receptionHours: string | null }[]; posts: Post[]; challenges: Ch[]; catalog: Item[] };
const CATS = ["Suplementos", "Bebidas", "Snacks", "Alimentos", "Indumentaria"];
const isoDay = (iso: string) => iso.split("-").reverse().join("/");
const ars = (n: number) => `ARS ${n.toLocaleString("es-AR")}`;

/** Achica la imagen en el navegador antes de subirla (como el prototipo: 900 px, JPEG). */
async function shrink(file: File, max = 900): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo procesar la imagen."))), "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}
function useImage(orgId: string, flash: (t: string) => void) {
  const [img, setImg] = useState<{ id: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!(IMAGE_LIMITS.mimes as readonly string[]).includes(f.type)) { flash("La imagen tiene que ser JPG, PNG o WebP."); return; }
    setBusy(true);
    try {
      const blob = await shrink(f);
      const fd = new FormData(); fd.append("file", new File([blob], "imagen.jpg", { type: "image/jpeg" }));
      const res = await fetch(`/api/gym/${orgId}/community/images`, { method: "POST", body: fd, credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo subir la imagen.");
      setImg({ id: data.id, preview: URL.createObjectURL(blob) });
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return { img, setImg, busy, pick };
}

function LocField({ com, value, onChange }: { com: Com; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">Dónde se publica
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ height: 42, borderRadius: 10, border: "1px solid #C9D2DD", padding: "0 10px", font: "400 14px var(--font-ui)" }}>
        {com.allLocations && <option value="">Todas las sedes</option>}
        {com.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  );
}

export function CommunityScreen({ shell }: { shell: Shell }) {
  const c = useLoad<Com>(`/api/gym/${shell.orgId}/community`);
  const caps = shell.ctx.caps;
  const tabs = ([["news", "Novedades y descuentos"], ["ch", "Desafíos"], ["shop", "Recepción"], ["club", "Repi Club"]] as const)
    .filter(([k]) => (k === "shop" ? caps.includes("catalog.publish") : k === "club" ? caps.includes("club.moderate") : caps.includes("community.publish")));
  const [tab, setTab] = useState<(typeof tabs)[number][0]>(tabs[0]?.[0] ?? "shop");
  return (
    <>
      <Head kicker={`Se publica en la pestaña «Gym» de la app de los socios de ${shell.ctx.org.name}`} title="Comunidad" />
      <div className="tabs" role="tablist" aria-label="Comunidad">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      {c.err && <p role="alert" className="err-box">{c.err}</p>}
      {!c.data ? <p className="muted">Cargando…</p> : (
        <>
          {tab === "news" && <News shell={shell} com={c.data} reload={c.reload} />}
          {tab === "ch" && <Challenges shell={shell} com={c.data} reload={c.reload} />}
          {tab === "shop" && <Shop shell={shell} com={c.data} reload={c.reload} />}
          {tab === "club" && <><RankingScreens shell={shell} /><ClubModeration shell={shell} /></>}
        </>
      )}
    </>
  );
}

function News({ shell, com, reload }: { shell: Shell; com: Com; reload: () => void }) {
  const [type, setType] = useState<"novedad" | "descuento">("novedad");
  const [d, setD] = useState({ title: "", text: "", badge: "", validUntil: "", loc: com.allLocations ? "" : com.locations[0]?.id ?? "" });
  const im = useImage(shell.orgId, shell.flash);
  const fileRef = useRef<HTMLInputElement>(null);
  const { busy, run } = useAct(shell.flash);
  const publish = () => run("pub", () => api(`/api/gym/${shell.orgId}/community/posts`, { body: { type, title: d.title, text: d.text, badge: d.badge || null, validUntil: d.validUntil || null, locationId: d.loc || null, imageId: im.img?.id ?? null } }), "Publicado. Ya aparece en la app de los socios.")
    .then((r) => { if (r) { setD({ ...d, title: "", text: "", badge: "", validUntil: "" }); im.setImg(null); reload(); } });
  return (
    <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", alignItems: "start" }}>
      <section className="card">
        <h2>Nueva publicación</h2>
        <div className="seg" role="tablist" aria-label="Tipo">{([["novedad", "Novedad"], ["descuento", "Descuento"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={type === k} onClick={() => setType(k)}>{l}</button>)}</div>
        <label className="field">Título<input value={d.title} maxLength={120} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <label className="field">Texto<textarea className="note" rows={3} value={d.text} maxLength={1000} onChange={(e) => setD({ ...d, text: e.target.value })} /></label>
        {type === "descuento" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="field" style={{ flex: "1 1 160px" }}>Etiqueta<input value={d.badge} maxLength={30} placeholder="20% OFF" onChange={(e) => setD({ ...d, badge: e.target.value })} /></label>
            <label className="field" style={{ flex: "1 1 160px" }}>Vence<input type="date" value={d.validUntil} onChange={(e) => setD({ ...d, validUntil: e.target.value })} /></label>
          </div>
        )}
        <LocField com={com} value={d.loc} onChange={(v) => setD({ ...d, loc: v })} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" className="btn sm" aria-busy={im.busy || undefined} onClick={() => fileRef.current?.click()}>{im.img ? "Cambiar imagen" : "Agregar imagen"}</button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => im.pick(e.target.files?.[0])} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {im.img && <img src={im.img.preview} alt="Vista previa" style={{ height: 56, borderRadius: 8 }} />}
        </div>
        <button type="button" className="btn pri" aria-busy={busy === "pub" || undefined} aria-disabled={d.title.trim().length < 3} onClick={() => d.title.trim().length >= 3 ? publish() : shell.flash("Escribí un título.")}>Publicar en la app</button>
      </section>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {com.posts.map((p) => (
          <section key={p.id} className="card" style={{ padding: 0, overflow: "hidden", gap: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.imageId ? <img src={`/api/media/${p.imageId}`} alt="" style={{ width: "100%", height: 150, objectFit: "cover" }} /> : <div className="gy-noimg">sin imagen</div>}
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={`chip ${p.type === "descuento" ? "warn" : "info"}`}>{p.type === "descuento" ? p.badge || "Descuento" : "Novedad"}</span>
                <span className="muted">{fmt(p.createdAt)} · {p.sede}{p.validUntil ? ` · vence ${isoDay(p.validUntil)}` : ""}</span>
                {p.expired && <span className="chip mute">Vencido · no se muestra</span>}
              </div>
              <b style={{ fontSize: 16 }}>{p.title}</b>
              {p.text && <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>{p.text}</span>}
              <div><button type="button" className="btn sm" onClick={() => window.confirm(`¿Quitar «${p.title}»? Deja de verse en la comunidad.`) && api(`/api/gym/${shell.orgId}/community/posts/${p.id}`, { body: {} }).then(() => { shell.flash("Publicación quitada."); reload(); }).catch((e) => shell.flash(e.message))}>Quitar</button></div>
            </div>
          </section>
        ))}
        {!com.posts.length && <div className="empty">Todavía no publicaste novedades.</div>}
      </div>
    </div>
  );
}

function Challenges({ shell, com, reload }: { shell: Shell; com: Com; reload: () => void }) {
  const [d, setD] = useState({ title: "", rule: "", unit: "reps" as ChallengeUnit, lower: false, category: "fuerza" as keyof typeof CHALLENGE_CATEGORIES, prize: "", endsOn: "", loc: com.allLocations ? "" : com.locations[0]?.id ?? "" });
  const { busy, run } = useAct(shell.flash);
  const [remove, setRemove] = useState<Ch | null>(null);
  const ok = d.title.trim().length >= 3 && d.prize.trim().length >= 2 && d.rule.trim().length >= 10 && !!d.endsOn;
  const publish = () => run("ch", () => api(`/api/gym/${shell.orgId}/community/challenges`, { body: { title: d.title, rule: d.rule, unit: d.unit, lowerIsBetter: d.unit === "seg" && d.lower, category: d.category, prize: d.prize, endsOn: d.endsOn, locationId: d.loc || null } }), "Desafío publicado en la app.")
    .then((r) => { if (r) { setD({ ...d, title: "", rule: "", prize: "", endsOn: "" }); reload(); } });
  return (
    <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", alignItems: "start" }}>
      <section className="card">
        <h2>Nuevo desafío</h2>
        <label className="field">Nombre<input value={d.title} maxLength={80} placeholder="Dominadas máximas" onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <label className="field">Reglas: cómo debe verse el intento en el video<textarea className="note" rows={2} value={d.rule} maxLength={400} onChange={(e) => setD({ ...d, rule: e.target.value })} /></label>
        <div className="pills" role="group" aria-label="Se mide en">{(Object.keys(CHALLENGE_UNITS) as ChallengeUnit[]).map((u) => <button key={u} type="button" className="pill" aria-pressed={d.unit === u} onClick={() => setD({ ...d, unit: u })}>{CHALLENGE_UNITS[u]}</button>)}</div>
        {d.unit === "seg" && <label className="mrow" style={{ border: "1px solid #E2E8F0" }}><input type="checkbox" checked={d.lower} onChange={(e) => setD({ ...d, lower: e.target.checked })} /><span style={{ fontSize: 14 }}>Gana el menor tiempo (por ejemplo, remo 500 m)</span></label>}
        <div className="pills" role="group" aria-label="Categoría">{(Object.keys(CHALLENGE_CATEGORIES) as (keyof typeof CHALLENGE_CATEGORIES)[]).map((k) => <button key={k} type="button" className="pill" aria-pressed={d.category === k} onClick={() => setD({ ...d, category: k })}>{CHALLENGE_CATEGORIES[k]}</button>)}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label className="field" style={{ flex: "2 1 200px" }}>Premio<input value={d.prize} maxLength={120} placeholder="Shaker REPI" onChange={(e) => setD({ ...d, prize: e.target.value })} /></label>
          <label className="field" style={{ flex: "1 1 140px" }}>Termina<input type="date" value={d.endsOn} onChange={(e) => setD({ ...d, endsOn: e.target.value })} /></label>
        </div>
        <LocField com={com} value={d.loc} onChange={(v) => setD({ ...d, loc: v })} />
        <span className="muted" style={{ lineHeight: 1.45 }}>Todo intento de récord requiere video subido desde la app. El premio se retira en recepción. No se piden ni muestran datos de salud. Los socios ven este aviso: «{SAFETY_NOTE}»</span>
        <button type="button" className="btn pri" aria-busy={busy === "ch" || undefined} aria-disabled={!ok} onClick={() => ok ? publish() : shell.flash("Completá nombre, reglas, premio y fecha de fin.")}>Publicar desafío</button>
      </section>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {com.challenges.map((c) => (
          <section key={c.id} className="card" style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
            <div style={{ flex: "2 1 240px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><span className="chip info">{CHALLENGE_CATEGORIES[c.category]}</span><span className={`chip ${c.status === "active" ? "ok" : "mute"}`}>{c.status === "active" ? "Activo" : "Cerrado"}</span><span className="muted">{c.sede}</span></div>
              <b style={{ fontSize: 16 }}>{c.title}</b>
              <span className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>{c.rule}</span>
              <span style={{ fontSize: 13 }}>Premio: {c.prize} · {c.status === "active" ? "termina" : "terminó"} {isoDay(c.endsOn)}</span>
            </div>
            <div style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", gap: 2 }}><span className="muted">{c.status === "active" ? "Récord vigente" : "Récord final"}</span><strong style={{ fontSize: 22 }}>{c.record}</strong><span className="muted">{c.holder ? `de ${c.holder}` : "Esperando el primer intento"}</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
              <span className="muted">{nf(c.participants)} participantes</span>
              {c.pending > 0 && <button type="button" className="btn sm pri" onClick={() => shell.go("validations")}>{c.pending} por validar</button>}
              {c.status === "active" && <button type="button" className="btn sm" onClick={() => setRemove(c)}>Quitar</button>}
            </div>
          </section>
        ))}
        {!com.challenges.length && <div className="empty">Todavía no hay desafíos.</div>}
      </div>
      {remove && (
        <Modal label="Quitar desafío" onClose={() => setRemove(null)}>
          <div className="mhead"><h2>Quitar «{remove.title}»</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => setRemove(null)}>×</button></div>
          <p style={{ margin: 0, lineHeight: 1.5 }}>Deja de verse en la app.{remove.pending ? ` Los ${remove.pending} intentos pendientes se rechazan con el motivo «El gym retiró el desafío» y cada socio recibe el aviso.` : ""} Los récords y logros ya validados se conservan.</p>
          <div className="mfoot"><button type="button" className="btn" onClick={() => setRemove(null)}>Cancelar</button>
            <button type="button" className="btn pri" onClick={() => api(`/api/gym/${shell.orgId}/community/challenges/${remove.id}`, { body: {} }).then(() => { shell.flash("Desafío quitado."); setRemove(null); reload(); }).catch((e) => shell.flash(e.message))}>Quitar desafío</button></div>
        </Modal>
      )}
    </div>
  );
}

function Shop({ shell, com, reload }: { shell: Shell; com: Com; reload: () => void }) {
  const [d, setD] = useState({ name: "", category: CATS[0], price: "", promo: "", highlighted: false, loc: com.allLocations ? "" : com.locations[0]?.id ?? "" });
  const im = useImage(shell.orgId, shell.flash);
  const fileRef = useRef<HTMLInputElement>(null);
  const [hours, setHours] = useState<Record<string, string>>(Object.fromEntries(com.locations.map((l) => [l.id, l.receptionHours ?? ""])));
  const { busy, run } = useAct(shell.flash);
  const add = () => run("add", () => api(`/api/gym/${shell.orgId}/community/catalog`, { body: { name: d.name, category: d.category, priceArs: Number(d.price), promo: d.promo || null, highlighted: d.highlighted, locationId: d.loc || null, imageId: im.img?.id ?? null } }), "Producto agregado al catálogo informativo.")
    .then((r) => { if (r) { setD({ ...d, name: "", price: "", promo: "", highlighted: false }); im.setImg(null); reload(); } });
  const patch = (i: Item, p: Partial<Item>) => api(`/api/gym/${shell.orgId}/community/catalog`, { body: { id: i.id, name: i.name, category: i.category, priceArs: i.priceArs, promo: i.promo, highlighted: p.highlighted ?? i.highlighted, available: p.available ?? i.available } }).then(reload).catch((e) => shell.flash(e.message));
  return (
    <>
      <div className="banner"><span>Catálogo informativo de recepción. Los socios ven precios y promociones, pero compran y pagan en el mostrador: la app no procesa pagos.</span></div>
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="card">
            <h2>Agregar producto</h2>
            <label className="field">Nombre<input value={d.name} maxLength={80} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
            <div className="pills" role="group" aria-label="Categoría">{CATS.map((c) => <button key={c} type="button" className="pill" aria-pressed={d.category === c} onClick={() => setD({ ...d, category: c })}>{c}</button>)}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label className="field" style={{ flex: "1 1 120px" }}>Precio ARS<input inputMode="numeric" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value.replace(/\D/g, "") })} /></label>
              <label className="field" style={{ flex: "2 1 160px" }}>Promo (opcional)<input value={d.promo} maxLength={40} onChange={(e) => setD({ ...d, promo: e.target.value })} /></label>
            </div>
            <label className="mrow" style={{ border: "1px solid #E2E8F0" }}><input type="checkbox" checked={d.highlighted} onChange={(e) => setD({ ...d, highlighted: e.target.checked })} /><span style={{ fontSize: 14 }}>Destacar en la app</span></label>
            <LocField com={com} value={d.loc} onChange={(v) => setD({ ...d, loc: v })} />
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button type="button" className="btn sm" aria-busy={im.busy || undefined} onClick={() => fileRef.current?.click()}>{im.img ? "Foto lista ✓" : "Agregar foto"}</button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => im.pick(e.target.files?.[0])} />
            </div>
            <button type="button" className="btn pri" aria-busy={busy === "add" || undefined} onClick={() => d.name.trim() && Number(d.price) > 0 ? add() : shell.flash("Completá nombre y precio.")}>Agregar al catálogo</button>
          </section>
          <section className="card">
            <h2>Horario de recepción</h2>
            {com.locations.map((l) => (
              <div key={l.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="field" style={{ flex: "1 1 200px" }}>{l.name}<input value={hours[l.id] ?? ""} maxLength={120} placeholder="Lun a vie 6 a 22 · sáb 9 a 14" onChange={(e) => setHours({ ...hours, [l.id]: e.target.value })} /></label>
                <button type="button" className="btn sm" onClick={() => run("h" + l.id, () => api(`/api/gym/${shell.orgId}/community/hours`, { body: { loc: l.id, hours: hours[l.id] ?? "" } }), "Horario guardado.")}>Guardar</button>
              </div>
            ))}
          </section>
        </div>
        <div className="gy-catalog">
          {com.catalog.map((i) => (
            <section key={i.id} className="card" style={{ padding: 0, overflow: "hidden", gap: 0, opacity: i.available ? 1 : .6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i.imageId ? <img src={`/api/media/${i.imageId}`} alt="" style={{ width: "100%", height: 100, objectFit: "cover" }} /> : <div className="gy-noimg" style={{ height: 70 }}>foto producto</div>}
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="lbl-up">{i.category}</span><b style={{ fontSize: 14 }}>{i.name}</b><span style={{ fontWeight: 600, color: "#006B88" }}>{ars(i.priceArs)}</span>
                {i.promo && <span className="chip info" style={{ alignSelf: "flex-start" }}>{i.promo}</span>}
                <span className="muted">{i.sede}</span>
                <label style={{ fontSize: 12, display: "flex", gap: 6 }}><input type="checkbox" checked={i.available} onChange={(e) => patch(i, { available: e.target.checked })} />Disponible</label>
                <label style={{ fontSize: 12, display: "flex", gap: 6 }}><input type="checkbox" checked={i.highlighted} onChange={(e) => patch(i, { highlighted: e.target.checked })} />Destacado</label>
                <button type="button" className="btn sm" onClick={() => window.confirm("¿Quitar este producto del catálogo?") && api(`/api/gym/${shell.orgId}/community/catalog/${i.id}`, { body: {} }).then(reload).catch((e) => shell.flash(e.message))}>Quitar</button>
              </div>
            </section>
          ))}
          {!com.catalog.length && <div className="empty">El catálogo está vacío.</div>}
        </div>
      </div>
    </>
  );
}

// ── Validaciones (SCR-GC-02) ────────────────────────────────────────────────
type Att = { id: string; member: string; challenge: string; rule: string; value: string; record: string; wouldBeRecord: boolean; videoId: string; at: string; status: string; reason: string | null; newRecord: boolean; decidedBy: string | null; decidedAt: string | null };
const REASONS = ["No se ve el intento completo", "No cumple la regla", "Video poco claro"];

export function ValidationsScreen({ shell }: { shell: Shell }) {
  const v = useLoad<{ pending: Att[]; done: Att[] }>(`/api/gym/${shell.orgId}/validations`);
  const [why, setWhy] = useState<Record<string, string>>({});
  const { busy, run } = useAct(shell.flash);
  const decide = (a: Att, approve: boolean) => run(a.id, () => api<{ newRecord: boolean; prize?: boolean }>(`/api/gym/${shell.orgId}/validations/${a.id}`, { body: { approve, reason: approve ? null : why[a.id] ?? null } }),
    (r) => { const x = r as { newRecord: boolean; prize?: boolean }; return approve ? (x.newRecord ? `Nuevo récord de ${a.member}. Le llega el aviso, el logro${x.prize ? " y el premio para retirar en recepción" : ""}.` : `Marca de ${a.member} validada. No supera el récord vigente: queda como logro.`) : `Intento rechazado. ${a.member} recibe el motivo.`; })
    .then(() => { v.reload(); shell.refreshBadges(); });
  return (
    <>
      <Head kicker="Intentos de récord enviados desde la app con video de prueba" title="Validaciones" />
      {v.err && <p role="alert" className="err-box">{v.err}</p>}
      {v.data && !v.data.pending.length && <div className="empty">No hay intentos por validar. Cuando un socio suba un video, aparece acá.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {v.data?.pending.map((a) => (
          <section key={a.id} className="card" style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, padding: 16 }}>
            <video src={`/api/media/${a.videoId}`} controls preload="metadata" playsInline style={{ flex: "1 1 300px", maxWidth: 420, maxHeight: 320, borderRadius: 12, background: "#0B0F14" }} aria-label={`Video del intento de ${a.member}`} />
            <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><b style={{ fontSize: 16 }}>{a.member} · {a.challenge}</b><span className="muted">{when(a.at)}</span></div>
              <div style={{ display: "flex", gap: 10 }}>
                <div className="stat" style={{ flex: 1 }}><span>Marca declarada</span><strong>{a.value}</strong></div>
                <div className="stat" style={{ flex: 1 }}><span>Récord vigente</span><strong>{a.record}</strong></div>
              </div>
              <span className={`chip ${a.wouldBeRecord ? "ok" : "mute"}`} style={{ alignSelf: "flex-start" }}>{a.wouldBeRecord ? "Si se aprueba, es nuevo récord" : "Si se aprueba, no supera el récord"}</span>
              <span className="muted" style={{ lineHeight: 1.45 }}>Regla: {a.rule}</span>
              <div className="pills" role="group" aria-label="Motivo de rechazo">{REASONS.map((r) => <button key={r} type="button" className="pill" aria-pressed={why[a.id] === r} onClick={() => setWhy({ ...why, [a.id]: why[a.id] === r ? "" : r })}>{r}</button>)}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn" aria-busy={busy === a.id || undefined} onClick={() => why[a.id] ? decide(a, false) : shell.flash("Elegí el motivo del rechazo.")}>Rechazar</button>
                <button type="button" className="btn pri" aria-busy={busy === a.id || undefined} onClick={() => decide(a, true)}>{a.wouldBeRecord ? "Aprobar récord" : "Validar marca"}</button>
              </div>
            </div>
          </section>
        ))}
      </div>
      <section className="card">
        <h2>Resueltos · 30 días</h2>
        {v.data?.done.map((a) => (
          <div key={a.id} className="trow"><span style={{ flex: 1 }}>{a.member} · {a.challenge} · <b>{a.value}</b>{a.newRecord ? " · nuevo récord" : ""}</span>
            <span className="muted">{a.status === "approved" ? `${a.decidedBy ?? ""} · ${when(a.decidedAt)}` : a.reason}</span>
            <span className={`chip ${a.status === "approved" ? "ok" : "bad"}`}>{a.status === "approved" ? "Aprobado" : "Rechazado"}</span></div>
        ))}
        {v.data && !v.data.done.length && <span className="muted">Todavía no hay validaciones resueltas.</span>}
        <span className="muted">Los videos se borran 90 días después de la decisión. La marca y el logro quedan.</span>
      </section>
    </>
  );
}

// ── Mostrador de recepción: carnet, ingreso y premios (F-GC-06/07/08) ───────
type Card = { gymMemberId: string; name: string; location: string; active: boolean; otherLocation: boolean; lastVisit: string | null; prizes: { id: string; description: string; challenge: string; code: string }[] };

export function DeskCard({ shell }: { shell: Shell }) {
  const [token, setToken] = useState("");
  const [card, setCard] = useState<Card | null>(null);
  const { busy, run } = useAct(shell.flash);
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const verify = () => run("v", () => api<Card>(`/api/gym/${shell.orgId}/desk/verify`, { body: { token } })).then((r) => setCard((r as Card) ?? null));
  return (
    <section className="card">
      <h2>Carnet del socio</h2>
      <span className="muted">Escaneá el QR del carnet con el lector o pegá el código que muestra la app. El código cambia cada 5 minutos y no contiene datos personales.</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label className="search" style={{ flex: "1 1 260px" }}><input value={token} onChange={(e) => { setToken(e.target.value); setCard(null); }} onKeyDown={(e) => { if (e.key === "Enter" && token.trim()) verify(); }} placeholder="RC1.…" aria-label="Código del carnet" /></label>
        <button type="button" className="btn pri" aria-busy={busy === "v" || undefined} onClick={() => token.trim() ? verify() : shell.flash("Pegá o escaneá el código del carnet.")}>Verificar</button>
      </div>
      {card && (
        <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span><b style={{ fontSize: 16 }}>{card.name}</b><br /><small className="muted">{card.location}{card.otherLocation ? " · otra sede" : ""} · última visita {card.lastVisit ? when(card.lastVisit) : "—"}</small></span>
            <span className={`chip ${card.active ? "ok" : "bad"}`}>{card.active ? "Socio activo" : "Inactivo"}</span>
          </div>
          {card.active && loc && <button type="button" className="btn" style={{ alignSelf: "flex-start" }} aria-busy={busy === "in" || undefined}
            onClick={() => run("in", () => api<{ duplicate: boolean }>(`/api/gym/${shell.orgId}/desk/checkin`, { body: { token, loc } }), (r) => (r as { duplicate: boolean }).duplicate ? "Ya tenía un ingreso registrado en las últimas 2 horas." : `Ingreso de ${card.name.split(" ")[0]} registrado.`)}>Registrar ingreso</button>}
          {card.prizes.map((p) => (
            <div key={p.id} className="trow"><span style={{ flex: 1 }}><b>{p.description}</b> · {p.challenge} <span style={{ font: "600 12px var(--font-mono)", color: "#006B88" }}>{p.code}</span></span>
              <button type="button" className="btn sm pri" onClick={() => run(p.id, () => api(`/api/gym/${shell.orgId}/desk/prizes/${p.id}`, { body: {} }), "Premio entregado. El socio recibe el aviso.").then(() => setCard({ ...card, prizes: card.prizes.filter((x) => x.id !== p.id) }))}>Entregar</button></div>
          ))}
          {!card.prizes.length && <span className="muted">Sin premios para retirar.</span>}
        </div>
      )}
    </section>
  );
}

// ── Moderación de Repi Club (F-RC-05) ───────────────────────────────────────
type Rep = { type: "post" | "comment"; id: string; text: string; author: string; at: string; status: string; reports: number; reasons: string[]; open: boolean };
function ClubModeration({ shell }: { shell: Shell }) {
  const r = useLoad<Rep[]>(`/api/gym/${shell.orgId}/club`);
  const { run } = useAct(shell.flash);
  const act = (x: Rep, outcome: "keep" | "remove") => run(x.id, () => api(`/api/gym/${shell.orgId}/club/${x.type}/${x.id}`, { body: { outcome } }), outcome === "remove" ? "Contenido retirado. Queda en el historial." : "Se mantiene visible.").then(r.reload);
  return (
    <section className="card">
      <h2>Reportes de Repi Club</h2>
      <span className="muted">Con 3 reportes de personas distintas el contenido se oculta hasta que lo revises. El staff no edita lo que escribió el socio.</span>
      {r.err && <p role="alert" className="err-box">{r.err}</p>}
      {r.data?.map((x) => (
        <div key={x.type + x.id} className="trow" style={{ alignItems: "flex-start" }}>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>“{x.text || "Logro publicado"}”<small className="muted">{x.type === "post" ? "Publicación" : "Comentario"} de {x.author} · {when(x.at)} · {x.reports} reporte{x.reports === 1 ? "" : "s"}: {x.reasons.join(", ")}</small></span>
          <span className={`chip ${x.status === "hidden" ? "warn" : x.status === "removed" ? "bad" : "ok"}`}>{x.status === "hidden" ? "Oculto" : x.status === "removed" ? "Retirado" : "Visible"}</span>
          {x.open && <><button type="button" className="btn sm" onClick={() => act(x, "keep")}>Mantener</button><button type="button" className="btn sm pri" onClick={() => act(x, "remove")}>Retirar</button></>}
        </div>
      ))}
      {r.data && !r.data.length && <span className="muted">Sin reportes.</span>}
    </section>
  );
}
// ── Pantalla del ranking en la sala (D146) ──────────────────────────────────
type Screen = { id: string; name: string; createdAt: string; lastSeenAt: string | null };
function RankingScreens({ shell }: { shell: Shell }) {
  const manage = shell.ctx.roles.some((r) => r === "owner" || r === "manager");
  const r = useLoad<{ screens: Screen[] }>(manage ? `/api/gym/${shell.orgId}/club/screens` : null);
  const { busy, run } = useAct(shell.flash);
  const [name, setName] = useState("TV de la sala");
  const [link, setLink] = useState<string | null>(null);
  if (!manage) return null;
  const create = () => run("new", () => api<{ link: string }>(`/api/gym/${shell.orgId}/club/screens`, { body: { name } }), "Pantalla creada. Abrí el enlace en la TV.")
    .then((x) => { if (x) { setLink((x as { link: string }).link); void r.reload(); } });
  const revoke = (s: Screen) => { if (window.confirm(`¿Revocar «${s.name}»? Esa pantalla deja de mostrar el ranking.`)) void run(s.id, () => api(`/api/gym/${shell.orgId}/club/screens/${s.id}/revoke`, { body: {} }), "Pantalla revocada.").then(r.reload); };
  return (
    <section className="card">
      <h2>Pantalla del ranking</h2>
      <span className="muted">Mostrá en una TV o tablet de la sala el ranking por ejercicio en vivo. Rota de ejercicio cada 20 segundos y aparecen sólo los socios que eligieron «Aparecer en el ranking».</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>Nombre<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        <button type="button" className="btn pri" aria-busy={busy === "new" || undefined} onClick={() => void create()}>Crear pantalla</button>
      </div>
      {link && (
        <div className="gy-warn" role="status" style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Abrí este enlace en la TV (se muestra una sola vez; si lo perdés, creá otra pantalla):</span>
          <code style={{ wordBreak: "break-all" }}>{link}</code>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn sm" onClick={() => void navigator.clipboard?.writeText(link).then(() => shell.flash("Enlace copiado."), () => shell.flash("No se pudo copiar: copialo a mano."))}>Copiar enlace</button>
            <a className="btn sm" href={link} target="_blank" rel="noreferrer">Abrir acá</a>
          </span>
        </div>
      )}
      {r.err && <p role="alert" className="err-box">{r.err}</p>}
      {r.data?.screens.map((s) => (
        <div key={s.id} className="trow">
          <span style={{ flex: 1 }}>{s.name}<br /><small className="muted">{s.lastSeenAt ? `Vista ${when(s.lastSeenAt)}` : "Todavía no se abrió"}</small></span>
          <button type="button" className="btn sm" aria-busy={busy === s.id || undefined} onClick={() => revoke(s)}>Revocar</button>
        </div>
      ))}
    </section>
  );
}
export { ars };
