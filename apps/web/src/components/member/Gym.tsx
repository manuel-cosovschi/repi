"use client";
// Pestaña «Gym» de App Alumno v4 (SCR-M-19..25): novedades, desafíos con video, recepción informativa, logros,
// carnet QR y Repi Club. Datos reales de /api/me/gym; ningún ranking ni participante simulado.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderSVG } from "uqr";
import { ATTEMPT_VIDEO_LIMITS, CHALLENGE_CATEGORIES, CHALLENGE_UNITS, CLUB_COMMENT_MAX, CLUB_POST_MAX, DIVISIONS, RANK_FILTERS, attemptValueOk, type ChallengeUnit } from "@repi/domain";
import { api } from "@/lib/api";
import { Sheet } from "./Sheet";
import { Ic } from "@/components/ui/Ic";
import { Ambient, useReveal } from "@/components/motion/Ambient";
import { Carousel } from "@/components/motion/Carousel";
import { Check, QrCode, VideoCamera } from "@phosphor-icons/react";

type Home = {
  org: { id: string; name: string }; location: { id: string; name: string; receptionHours: string | null }; safety: string; minorRestricted: boolean; onFloor: string[];
  posts: { id: string; type: "novedad" | "descuento"; title: string; text: string; badge: string | null; imageId: string | null; validUntil: string | null; at: string }[];
  challenges: { id: string; title: string; rule: string; unit: ChallengeUnit; lowerIsBetter: boolean; category: keyof typeof CHALLENGE_CATEGORIES; prize: string; endsOn: string; status: string; record: string; holder: string | null; myBest: string | null; last: { status: string; reason: string | null; value: string } | null }[];
  catalog: { id: string; category: string; name: string; priceArs: number; promo: string | null; highlighted: boolean; available: boolean; imageId: string | null }[];
  achievements: { id: string; kind: string; title: string; detail: string; at: string; unseen: boolean }[];
  locked: { title: string; detail: string }[]; level: { level: number; toNext: number; pct: number }; readyPrizes: number;
  notices: { id: string; kind: string; title: string; body: string; at: string; unseen: boolean }[];
};
type GymTab = "news" | "ch" | "shop" | "logros" | "club";
const dayEs = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d))); };
const ars = (n: number) => `ARS ${n.toLocaleString("es-AR")}`;

export function GymTabView({ offline, flash, onSeen }: { offline: boolean; flash: (t: string) => void; onSeen: () => void }) {
  const [h, setH] = useState<Home | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<GymTab>("news");
  const [up, setUp] = useState<Home["challenges"][number] | null>(null);
  const [rank, setRank] = useState<Home["challenges"][number] | null>(null);
  const [card, setCard] = useState(false);
  const [award, setAward] = useState<Home["notices"][number] | null>(null);
  const load = useCallback(() => api<Home>("/api/me/gym/home").then((x) => { setH(x); setErr(null); return x; }).catch((e) => { setErr(e.message); return null; }), []);
  const rv = useReveal(!!h || !!err || offline);
  useEffect(() => { if (offline) return; void load().then((x) => {
    // Overlay de logro validado (AN-21) con el aviso más reciente sin ver.
    const n = x?.notices.find((y) => y.unseen && y.kind === "attempt_approved");
    if (n) setAward(n);
    else if (x?.notices.some((y) => y.unseen)) { const r = x.notices.find((y) => y.unseen)!; flash(r.title); }
    if (x?.notices.some((y) => y.unseen) || x?.achievements.some((y) => y.unseen)) void api("/api/me/gym/notices/seen", { body: {} }).then(onSeen).catch(() => {});
  }); }, [load, offline]); // eslint-disable-line react-hooks/exhaustive-deps
  if (offline) return <><h1 tabIndex={-1} style={{ marginTop: 6 }}>Tu gym</h1><div className="dashed-card"><span>Sin conexión. La comunidad del gym necesita conexión.</span></div></>;
  if (err) return <><p className="mb-err" role="alert">{err}</p><button type="button" className="ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => void load()}>Reintentar</button></>;
  if (!h) return rv.ambient ? <Ambient label="Cargando tu gym" /> : null;
  return (
    <div className={rv.leaving ? "m03-in" : undefined} style={{ display: "flex", flexDirection: "column", gap: 22, position: "relative" }}>
      {rv.leaving && <Ambient label="Cargando tu gym" leaving />}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}><span style={{ fontSize: 13, color: "#5DE6D8", fontWeight: 600 }}>{h.org.name} · {h.location.name}</span><h1 tabIndex={-1}>Tu gym</h1></div>
      <button type="button" className="hbanner" onClick={() => setCard(true)}>
        <Ic i={QrCode} size={28} color="#00D1FF" />
        <span><b style={{ fontSize: 15 }}>Mi carnet</b><small>{h.readyPrizes ? "Tenés premios para retirar" : "QR para recepción, premios y descuentos"}</small></span>
        {h.readyPrizes > 0 && <span className="pill-cyan">{h.readyPrizes} premio{h.readyPrizes === 1 ? "" : "s"}</span>}
      </button>
      <div className="gtabs" role="tablist" aria-label="Secciones del gym">
        {([["news", "Novedades"], ["ch", "Desafíos"], ["shop", "Recepción"], ["logros", "Logros"], ["club", "Club"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "news" && (
        <>
          {h.onFloor.length > 0 && (
            <div className="floor-now"><span className="mb-muted" style={{ fontSize: 13 }}>En sala ahora</span>
              <div>{h.onFloor.map((n, i) => <span key={i} className="floor-chip"><i aria-hidden="true">{n[0]}</i>{n}<b aria-hidden="true" /></span>)}</div></div>
          )}
          {h.notices.slice(0, 3).map((n) => <div key={n.id} className="hbanner" style={{ cursor: "default" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: n.kind === "attempt_rejected" ? "#EF4444" : "#00D1FF", flex: "none" }} /><span><b>{n.title}</b><small>{n.body}</small></span></div>)}
          {!h.posts.length && <div className="dashed-card" style={{ textAlign: "center" }}><span>{h.org.name} todavía no publicó novedades.</span></div>}
          <Carousel items={h.posts} label={`Novedades de ${h.org.name}`} resetKey={`${h.org.id}:${h.location.id}`} render={(p) => (
            <article className="gpost">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.imageId && <img src={`/api/media/${p.imageId}`} alt="" />}
              <div>
                <span className="gpost-meta"><span className={p.type === "descuento" ? "tag-cyan" : "tag-dark"}>{p.type === "descuento" ? p.badge || "Descuento" : "Novedad"}</span>{new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(p.at))}{p.validUntil ? ` · hasta el ${dayEs(p.validUntil)}` : ""}</span>
                <b>{p.title}</b>{p.text && <p>{p.text}</p>}
              </div>
            </article>
          )} />
        </>
      )}
      {tab === "ch" && (
        <>
          <span className="mb-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>Superá un récord, subí el video y {h.org.name} lo valida. El premio se retira en recepción con tu carnet. {h.safety}</span>
          {h.minorRestricted && <p className="mb-note">Los videos de récord se habilitan cuando tu adulto responsable lo autorice.</p>}
          {!h.challenges.length && <div className="dashed-card"><span>No hay desafíos activos.</span></div>}
          {h.challenges.map((c) => {
            const st = c.last?.status;
            return (
              <article key={c.id} className="gch">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <b style={{ fontSize: 17 }}>{c.title}</b>
                  {c.status === "closed" ? <span className="st-chip mute">Terminado</span> : st === "pending" ? <span className="st-chip warn">En validación</span> : st === "approved" ? <span className="st-chip ok">Validado</span> : st === "rejected" ? <span className="st-chip bad">No aprobado</span> : null}
                </div>
                <span className="mb-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{CHALLENGE_CATEGORIES[c.category]} · {c.rule}</span>
                <div className="gch-boxes">
                  <div><small>{c.status === "closed" ? "Récord final" : "Récord del gym"}</small><strong>{c.record}</strong><small>{c.holder ? `de ${c.holder}` : "Esperando el primer intento"}</small></div>
                  <div><small>Premio</small><span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{c.prize}</span><small>{c.status === "closed" ? "Terminó" : "Hasta"} el {dayEs(c.endsOn)}</small></div>
                </div>
                {st === "rejected" && c.last?.reason && <span style={{ fontSize: 12, color: "#FCA5A5" }}>Motivo: {c.last.reason}</span>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span className="mb-muted">Tu mejor marca: <strong style={{ color: "#F8FAFC" }}>{c.myBest ?? "sin intentos validados"}</strong></span>
                  <button type="button" className="linkbtn" style={{ height: 32 }} onClick={() => setRank(c)}>Ver ranking</button>
                </div>
                {c.status === "active" && st !== "pending" && !h.minorRestricted && (
                  <button type="button" className="cta" style={{ height: 46, fontSize: 15 }} onClick={() => setUp(c)}>
                    <Ic i={VideoCamera} size={18} color="#0B0F14" />
                    {st === "rejected" ? "Intentar de nuevo" : st === "approved" ? "Superar mi marca" : "Subir intento"}
                  </button>
                )}
              </article>
            );
          })}
        </>
      )}
      {tab === "shop" && (
        <>
          <p className="mb-note">Precios de recepción, sólo informativos. Se compra y se paga en el mostrador.{h.location.receptionHours ? ` Horario: ${h.location.receptionHours}.` : ""}</p>
          {!h.catalog.length && <div className="dashed-card"><span>El catálogo de recepción está vacío.</span></div>}
          <div className="gcat">
            {h.catalog.map((i) => (
              <div key={i.id} style={{ opacity: i.available ? 1 : .5 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {i.imageId ? <img src={`/api/media/${i.imageId}`} alt="" /> : <span className="gcat-ph" aria-hidden="true">foto</span>}
                <span className="gcat-body"><small>{i.category}</small><b>{i.name}</b><em>{ars(i.priceArs)}</em>{i.promo && <span className="tag-cyan">{i.promo}</span>}{!i.available && <small>Sin stock</small>}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === "logros" && <Logros h={h} />}
      {tab === "club" && <Club orgId={h.org.id} achievements={h.achievements} flash={flash} />}
      {up && <AttemptSheet c={up} orgId={h.org.id} flash={flash} onClose={(sent) => { setUp(null); if (sent) void load(); }} />}
      {rank && <RankSheet c={rank} onClose={() => setRank(null)} />}
      {card && <CardSheet onClose={() => setCard(false)} />}
      {award && <Award n={award} onClose={() => { setAward(null); setTab("logros"); }} />}
    </div>
  );
}

function Sticker({ on, size = 60 }: { on: boolean; size?: number }) {
  const k = size / 60;
  return (
    <span className="sticker" style={{ width: size + 6, height: size + 6, background: on ? "conic-gradient(#00D1FF,#5DE6D8,#00D1FF)" : "#2D3B4F" }} aria-hidden="true">
      <span style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/icon_r.png" alt="" style={{ left: 16.6 * k, top: 16.4 * k, width: 18.4 * k, height: 28.9 * k, filter: on ? "none" : "grayscale(1) brightness(.6)" }} />
        <i style={{ left: 34.5 * k, top: 14.6 * k, width: 8.9 * k, height: 8.9 * k, background: on ? "#00D1FF" : "#2D3B4F" }} />
      </span>
    </span>
  );
}

function Logros({ h }: { h: Home }) {
  return (
    <>
      <div className="lvl">
        <div><span style={{ fontSize: 22, fontWeight: 600 }}>Nivel {h.level.level}</span><span style={{ fontSize: 13, color: "#5DE6D8" }}>{h.achievements.length} logro{h.achievements.length === 1 ? "" : "s"}</span></div>
        <div className="lvl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={h.level.pct} aria-label="Progreso al próximo nivel"><i style={{ width: `${Math.max(8, h.level.pct)}%` }} /></div>
        <span className="mb-muted" style={{ fontSize: 12 }}>Te falta{h.level.toNext === 1 ? "" : "n"} {h.level.toNext} logro{h.level.toNext === 1 ? "" : "s"} para el nivel {h.level.level + 1}</span>
      </div>
      <div className="stickers">
        {h.achievements.map((a) => <div key={a.id}><Sticker on /><b>{a.title}</b><small>{a.detail}</small></div>)}
        {h.locked.map((a, i) => <div key={i} style={{ opacity: .45 }}><Sticker on={false} /><b>{a.title}</b><small>{a.detail}</small></div>)}
      </div>
      {!h.achievements.length && !h.locked.length && <span className="mb-muted">Tus logros aparecen acá: primer entrenamiento, constancia y marcas validadas.</span>}
    </>
  );
}

function Award({ n, onClose }: { n: Home["notices"][number]; onClose: () => void }) {
  const record = n.title.startsWith("¡Nuevo récord");
  return (
    <div className="award-bg" role="dialog" aria-modal="true" aria-label={n.title} onClick={onClose}>
      <div className="award" onClick={(e) => e.stopPropagation()}>
        <Sticker on size={110} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#5DE6D8" }}>{record ? "Nuevo récord del gym" : "Marca validada"}</span>
        <span style={{ fontSize: 24, fontWeight: 600 }}>{record ? "¡Récord validado!" : "¡Intento validado!"}</span>
        <span style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.5 }}>{n.title.replace(/^.*· /, "")}: {n.body}</span>
        <button type="button" className="cta" onClick={onClose} autoFocus>Ver mis logros</button>
      </div>
    </div>
  );
}

function AttemptSheet({ c, orgId, flash, onClose }: { c: Home["challenges"][number]; orgId: string; flash: (t: string) => void; onClose: (sent: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [div, setDiv] = useState<"F" | "M" | null>(null);
  const [ok, setOk] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const pick = async (f: File | null) => {
    if (!f) return;
    if (!(ATTEMPT_VIDEO_LIMITS.mimes as readonly string[]).includes(f.type) || f.size > ATTEMPT_VIDEO_LIMITS.maxBytes) { flash("El video tiene que ser MP4, MOV o WebM de hasta 80 MB."); return; }
    // Duración: se controla en el teléfono (el servidor valida tipo real y tamaño).
    const u = URL.createObjectURL(f);
    const dur = await new Promise<number>((res) => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => res(v.duration); v.onerror = () => res(NaN); v.src = u; });
    if (Number.isFinite(dur) && dur > ATTEMPT_VIDEO_LIMITS.maxSeconds) { URL.revokeObjectURL(u); flash(`El video puede durar hasta ${ATTEMPT_VIDEO_LIMITS.maxSeconds / 60} minutos.`); return; }
    if (url) URL.revokeObjectURL(url);
    setFile(f); setUrl(u);
  };
  const num = Number(value.replace(",", "."));
  const ready = !!file && attemptValueOk(c.unit, num) && ok;
  const submit = async () => {
    if (!file) { flash("Subí el video del intento."); return; }
    if (!attemptValueOk(c.unit, num)) { flash("Ingresá tu marca."); return; }
    if (!ok) { flash("Confirmá que el video muestra el intento completo."); return; }
    setPct(4);
    try {
      const fd = new FormData(); fd.append("file", file);
      const vid = await new Promise<{ id: string }>((res, rej) => {
        const x = new XMLHttpRequest();
        x.open("POST", `/api/me/gym/attempt-video?org=${orgId}`);
        x.upload.onprogress = (e) => { if (e.lengthComputable) setPct(Math.max(4, Math.round((e.loaded / e.total) * 95))); };
        x.onload = () => { const d = JSON.parse(x.responseText || "{}"); if (x.status < 300) res(d); else rej(new Error(d.error ?? "No se pudo subir el video.")); };
        x.onerror = () => rej(new Error("Sin conexión. Probá de nuevo."));
        x.send(fd);
      });
      await api("/api/me/gym/attempts", { body: { challengeId: c.id, value: num, division: div, videoId: vid.id, confirm: true } });
      setPct(100); setSent(true);
    } catch (e) { setPct(null); flash((e as Error).message); }
  };
  const unitTxt = c.unit === "seg" ? "segundos" : CHALLENGE_UNITS[c.unit];
  return (
    <Sheet title={c.title} closeLabel="Cerrar" onClose={() => (pct !== null && !sent ? undefined : onClose(sent))}>
      {sent ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center", padding: "20px 0" }}>
          <span className="okdot" aria-hidden="true"><Ic i={Check} size={26} color="#00D1FF" /></span>
          <span style={{ fontSize: 20, fontWeight: 600 }}>Enviado para validar</span>
          <span className="mb-muted" style={{ fontSize: 14, lineHeight: 1.5 }}>El equipo revisa el video. Te avisamos cuando lo validen.</span>
          <button type="button" className="ghost" style={{ height: 46, padding: "0 22px" }} onClick={() => onClose(true)}>Listo</button>
        </div>
      ) : pct !== null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "30px 0" }}>
          <span style={{ fontSize: 16, fontWeight: 600, textAlign: "center" }}>Subiendo video…</span>
          <div className="lvl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Subida del video"><i style={{ width: `${pct}%` }} /></div>
        </div>
      ) : (
        <>
          <p className="mb-note"><strong style={{ color: "#F8FAFC" }}>Regla:</strong> {c.rule}</p>
          {!file ? (
            <label className="sheet-video" style={{ height: 150, flexDirection: "column" }}>
              <Ic i={VideoCamera} size={30} color="#00D1FF" />
              <span style={{ fontSize: 15, fontWeight: 600 }}>Grabar o elegir video</span><small className="mb-muted">Que se vea el intento completo, de principio a fin</small>
              <input type="file" accept="video/mp4,video/quicktime,video/webm" capture="environment" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            </label>
          ) : (
            <>
              <video src={url ?? undefined} controls playsInline style={{ width: "100%", maxHeight: 240, borderRadius: 14, background: "#000" }} aria-label="Vista previa del intento" />
              <label className="linkbtn" style={{ alignSelf: "flex-start", position: "relative" }}>Cambiar video<input type="file" accept="video/mp4,video/quicktime,video/webm" capture="environment" onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ position: "absolute", inset: 0, opacity: 0 }} /></label>
            </>
          )}
          <label className="attempt-val">Tu marca<span><input inputMode={c.unit === "kg" ? "decimal" : "numeric"} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="0" aria-label={`Tu marca en ${unitTxt}`} /><em>{unitTxt}</em></span></label>
          <span className="mb-muted" style={{ fontSize: 12 }}>Récord actual: {c.record}{c.lowerIsBetter ? " · gana el menor tiempo" : ""}</span>
          <fieldset className="sheet-group"><legend>Categoría para el ranking (opcional)</legend>
            <div>{(Object.keys(DIVISIONS) as ("F" | "M")[]).map((k) => <button key={k} type="button" aria-pressed={div === k} onClick={() => setDiv(div === k ? null : k)}>{DIVISIONS[k]}</button>)}</div>
          </fieldset>
          <label className="sheet-check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />Confirmo que el video es mío y muestra el intento completo. Lo ve sólo el equipo del gym que valida.</label>
          <button type="button" className="cta" style={{ height: 52, opacity: ready ? 1 : .45 }} onClick={submit}>Enviar para validar</button>
        </>
      )}
    </Sheet>
  );
}

type Rank = { title: string; rows: { pos: number; me: boolean; value: string; name: string; division: string | null }[]; note: string };
function RankSheet({ c, onClose }: { c: Home["challenges"][number]; onClose: () => void }) {
  const [f, setF] = useState<keyof typeof RANK_FILTERS>("all");
  const [r, setR] = useState<Rank | null>(null);
  useEffect(() => { setR(null); api<Rank>(`/api/me/gym/ranking/${c.id}?f=${f}`).then(setR).catch(() => setR({ title: c.title, rows: [], note: "" })); }, [c.id, f]);
  return (
    <Sheet title={`Ranking · ${c.title}`} closeLabel="Cerrar" onClose={onClose}
      groups={[{ label: "Categoría", opts: Object.entries(RANK_FILTERS) as [string, string][], value: f, onPick: (x) => setF(x as keyof typeof RANK_FILTERS) }]}>
      <div className="rank">
        {r?.rows.map((x) => <div key={x.pos + x.name} data-me={x.me ? "1" : undefined}><span className={x.pos <= 3 ? "top" : ""}>{x.pos}</span><b>{x.name}</b><small>{x.division ? DIVISIONS[x.division as "F" | "M"] : ""}</small><strong>{x.value}</strong></div>)}
        {r && !r.rows.length && <span className="mb-muted" style={{ padding: "12px 0" }}>Todavía no hay marcas validadas en esta categoría.</span>}
      </div>
      <span className="mb-muted" style={{ fontSize: 12 }}>{r?.note || "Sólo marcas validadas con video."} «+40» usa tu fecha de nacimiento si la cargaste.</span>
    </Sheet>
  );
}

type CardData = { token: string; ttlMin: number; name: string; place: string; memberNumber: string | null; prizes: { id: string; description: string; challenge: string; code: string; status: string }[] };
function CardSheet({ onClose }: { onClose: () => void }) {
  const [c, setC] = useState<CardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<CardData>("/api/me/gym/card").then(setC).catch((e) => setErr(e.message)), []);
  // El código rota: se renueva antes de vencer mientras el carnet está abierto.
  useEffect(() => { void load(); const t = setInterval(load, 4 * 60_000); return () => clearInterval(t); }, [load]);
  const svg = useMemo(() => (c ? renderSVG(c.token, { border: 1, whiteColor: "#F8FAFC", blackColor: "#0B0F14" }) : ""), [c]);
  return (
    <Sheet title="Mi carnet" sub="Mostralo en recepción para registrar tu ingreso, retirar premios y usar descuentos." closeLabel="Cerrar" onClose={onClose}>
      {err && <p className="mb-err">{err}</p>}
      {c && (
        <>
          <div className="carnet">
            <span style={{ fontSize: 13, color: "#5B6B80" }}>{c.place}</span>
            <span className="qr" role="img" aria-label="Código QR del carnet" dangerouslySetInnerHTML={{ __html: svg }} />
            <span style={{ fontSize: 18, fontWeight: 600 }}>{c.name}</span>
            {c.memberNumber && <span style={{ font: "500 13px var(--font-mono)", color: "#5B6B80" }}>Socio N.º {c.memberNumber}</span>}
            <span style={{ fontSize: 11, color: "#5B6B80" }}>El código cambia cada {c.ttlMin} minutos y no contiene tus datos.</span>
          </div>
          {c.prizes.map((p) => <div key={p.id} className="prize"><span><b>{p.description}</b><small>{p.challenge} · {p.status === "delivered" ? "Entregado" : "Para retirar"}</small></span><em style={{ color: p.status === "delivered" ? "#94A3B8" : "#00D1FF" }}>{p.code}</em></div>)}
        </>
      )}
    </Sheet>
  );
}

// ── Repi Club ───────────────────────────────────────────────────────────────
type ClubState = { joined: boolean; showName: boolean; inRanking: boolean; members: number };
type Pt = { d: string; kg: number; reps: number };
type Payload = { type: "progress"; exercise: string; points: Pt[]; deltaKg: number } | { type: "session"; dayName: string; date: string; minutes: number; sets: number; volumeKg: number; exercises: string[] } | null;
type Post = { id: string; mine: boolean; author: string; authorId: string; kind: string; text: string; at: string; hidden: boolean; achievement: { title: string; detail: string } | null; payload: Payload; applause: number; applauded: boolean;
  comments: { id: string; mine: boolean; author: string; authorId: string; text: string; at: string; hidden: boolean }[] };
type ClubRank = { month: string; inRanking: boolean; rows: { pos: number; name: string; days: number; me: boolean }[]; metric: string };

function Club({ orgId, achievements, flash }: { orgId: string; achievements: Home["achievements"]; flash: (t: string) => void }) {
  const [st, setSt] = useState<ClubState | null>(null);
  const [view, setView] = useState<"feed" | "rank">("feed");
  const [prefs, setPrefs] = useState({ showName: true, inRanking: false });
  const loadSt = useCallback(() => api<ClubState>(`/api/me/gym/club?org=${orgId}`).then((s) => { setSt(s); setPrefs({ showName: s.showName, inRanking: s.inRanking }); }).catch((e) => flash(e.message)), [orgId, flash]);
  useEffect(() => { void loadSt(); }, [loadSt]);
  if (!st) return <span className="mb-muted">Cargando…</span>;
  const join = () => api(`/api/me/gym/club/join?org=${orgId}`, { body: prefs }).then(() => { flash("Te sumaste a Repi Club."); return loadSt(); }).catch((e) => flash(e.message));
  if (!st.joined) return (
    <div className="club-join">
      <b style={{ fontSize: 18 }}>Repi Club</b>
      <span className="mb-muted" style={{ fontSize: 14, lineHeight: 1.5 }}>La comunidad de socios del gym: compartí logros, aplaudí y comentá. Es voluntario. Nunca se publican datos de salud ni tu entrenamiento privado con un coach.</span>
      <label className="sheet-check"><input type="checkbox" checked={prefs.showName} onChange={(e) => setPrefs({ ...prefs, showName: e.target.checked })} />Mostrar mi nombre (nombre e inicial). Si no, figurás como «Socio/a del gym».</label>
      <label className="sheet-check"><input type="checkbox" checked={prefs.inRanking} onChange={(e) => setPrefs({ ...prefs, inRanking: e.target.checked })} />Aparecer en el ranking del mes (días con entrenamiento o ingreso al gym).</label>
      <button type="button" className="cta" onClick={join}>Sumarme</button>
      <span className="mb-muted" style={{ fontSize: 12 }}>{st.members} socio{st.members === 1 ? "" : "s"} en el Club.</span>
    </div>
  );
  return (
    <>
      <div className="gtabs" role="tablist" aria-label="Repi Club">
        <button type="button" role="tab" aria-selected={view === "feed"} onClick={() => setView("feed")}>Publicaciones</button>
        <button type="button" role="tab" aria-selected={view === "rank"} onClick={() => setView("rank")}>Ranking del mes</button>
      </div>
      {view === "feed" ? <Feed orgId={orgId} achievements={achievements} flash={flash} /> : <ClubRankView orgId={orgId} />}
      <ProfileEditor orgId={orgId} flash={flash} />
      <details className="club-prefs"><summary>Mis preferencias del Club</summary>
        <label className="sheet-check"><input type="checkbox" checked={prefs.showName} onChange={(e) => setPrefs({ ...prefs, showName: e.target.checked })} />Mostrar mi nombre</label>
        <label className="sheet-check"><input type="checkbox" checked={prefs.inRanking} onChange={(e) => setPrefs({ ...prefs, inRanking: e.target.checked })} />Aparecer en el ranking</label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="ghost sm" onClick={join}>Guardar</button>
          <button type="button" className="ghost sm" onClick={() => api(`/api/me/gym/club/leave?org=${orgId}`, { body: {} }).then(() => { flash("Saliste de Repi Club."); return loadSt(); }).catch((e) => flash(e.message))}>Salir del Club</button>
        </div>
      </details>
    </>
  );
}

function Feed({ orgId, achievements, flash }: { orgId: string; achievements: Home["achievements"]; flash: (t: string) => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [text, setText] = useState("");
  const [ach, setAch] = useState<string | null>(null);
  const [more, setMore] = useState<Post | null>(null);
  const [share, setShare] = useState<"none" | "ach" | "progress" | "session">("none");
  const [opts, setOpts] = useState<{ exercises: { id: string; name: string; sessions: number }[]; sessions: { id: string; dayName: string; date: string }[] } | null>(null);
  const [exId, setExId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Pt[] | null>(null);
  const [sesId, setSesId] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const q = `?org=${orgId}`;
  const load = useCallback(() => api<Post[]>(`/api/me/gym/club/feed${q}`).then(setPosts).catch((e) => flash(e.message)), [q, flash]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if ((share === "progress" || share === "session") && !opts) api<NonNullable<typeof opts>>(`/api/me/gym/club/exercises${q}`).then(setOpts).catch((e) => flash(e.message)); }, [share, opts, q, flash]);
  useEffect(() => { setPreview(null); if (exId) api<Pt[]>(`/api/me/gym/club/evolution/${exId}${q}`).then(setPreview).catch(() => setPreview([])); }, [exId, q]);
  const reset = () => { setText(""); setAch(null); setExId(null); setSesId(null); setShare("none"); };
  const ready = !!text.trim() || (share === "ach" && !!ach) || (share === "progress" && !!exId && (preview?.length ?? 0) >= 2) || (share === "session" && !!sesId);
  const post = () => api(`/api/me/gym/club/posts${q}`, { body: { text, achievementId: share === "ach" ? ach : null, progressExerciseId: share === "progress" ? exId : null, sessionId: share === "session" ? sesId : null } })
    .then(() => { reset(); flash("Publicado en Repi Club."); return load(); }).catch((e) => flash(e.message));
  const act = (p: Promise<unknown>, ok?: string) => p.then(() => { if (ok) flash(ok); return load(); }).catch((e) => flash(e.message));
  return (
    <>
      <div className="club-compose">
        <textarea rows={2} value={text} maxLength={CLUB_POST_MAX} onChange={(e) => setText(e.target.value)} placeholder="Contale algo al Club" aria-label="Nueva publicación" />
        <div className="club-share" role="radiogroup" aria-label="Qué compartir">
          {([["none", "Sólo texto"], ["progress", "Mi progreso"], ["session", "Un entrenamiento"], ...(achievements.length ? [["ach", "Un logro"]] : [])] as [typeof share, string][]).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={share === k} onClick={() => setShare(k)}>{l}</button>
          ))}
        </div>
        {share === "ach" && (
          <select value={ach ?? ""} onChange={(e) => setAch(e.target.value || null)} aria-label="Elegí un logro">
            <option value="">Elegí un logro</option>
            {achievements.map((a) => <option key={a.id} value={a.id}>{a.title} · {a.detail}</option>)}
          </select>
        )}
        {share === "progress" && (!opts ? <span className="mb-muted">Cargando…</span> : !opts.exercises.length ? <span className="mb-muted" style={{ fontSize: 13 }}>Todavía no registraste ejercicios del programa del gym.</span> : <>
          <select value={exId ?? ""} onChange={(e) => setExId(e.target.value || null)} aria-label="Elegí un ejercicio">
            <option value="">Elegí un ejercicio</option>
            {opts.exercises.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.sessions} entrenamiento{x.sessions === 1 ? "" : "s"}</option>)}
          </select>
          {preview && (preview.length >= 2 ? <Spark points={preview} /> : <span className="mb-muted" style={{ fontSize: 13 }}>Hacen falta al menos dos entrenamientos con ese ejercicio.</span>)}
        </>)}
        {share === "session" && (!opts ? <span className="mb-muted">Cargando…</span> : !opts.sessions.length ? <span className="mb-muted" style={{ fontSize: 13 }}>Todavía no terminaste entrenamientos del programa del gym.</span> : (
          <select value={sesId ?? ""} onChange={(e) => setSesId(e.target.value || null)} aria-label="Elegí un entrenamiento">
            <option value="">Elegí un entrenamiento</option>
            {opts.sessions.map((x) => <option key={x.id} value={x.id}>{x.dayName} · {x.date.split("-").reverse().slice(0, 2).join("/")}</option>)}
          </select>
        ))}
        <button type="button" className="cta sm" style={{ height: 40 }} onClick={() => (ready ? post() : flash("Escribí algo o elegí qué compartir."))}>Publicar</button>
        <small className="mb-muted">Sólo se publica lo que elegís acá. Compartir con tu entrenador no publica nada. Nunca se muestran salud, molestias ni Body Intelligence. Sin enlaces; podés borrar lo tuyo cuando quieras.</small>
      </div>
      {!posts ? <span className="mb-muted">Cargando…</span> : !posts.length ? <div className="dashed-card"><span>Todavía no hay publicaciones. ¡Compartí tu primer logro!</span></div> : posts.map((p) => (
        <article key={p.id} className="club-post">
          <div className="club-head"><button type="button" className="club-author" onClick={() => setProfile(p.authorId)}>{p.author}</button><small className="mb-muted">{new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(p.at))}</small>
            <button type="button" className="linkbtn" aria-label="Más opciones" onClick={() => setMore(p)}>···</button></div>
          {p.hidden && <small style={{ color: "#FCD38A" }}>Oculto por reportes: lo revisa el gym.</small>}
          {p.achievement && <div className="club-ach"><Sticker on size={36} /><span><b>{p.achievement.title}</b><small>{p.achievement.detail}</small></span></div>}
          {p.payload?.type === "progress" && <div className="club-ach club-prog"><span><b>{p.payload.exercise}</b><small>{p.payload.points[0].kg.toLocaleString("es-AR")} → {p.payload.points.at(-1)!.kg.toLocaleString("es-AR")} kg{p.payload.deltaKg > 0 ? ` · +${p.payload.deltaKg.toLocaleString("es-AR")} kg` : ""} en {p.payload.points.length} entrenamientos</small></span><Spark points={p.payload.points} small /></div>}
          {p.payload?.type === "session" && <div className="club-ach"><span><b>Entrenamiento completo · {p.payload.dayName}</b><small>{p.payload.minutes} min · {p.payload.sets} series · {Math.round(p.payload.volumeKg).toLocaleString("es-AR")} kg de volumen</small><small>{p.payload.exercises.join(" · ")}</small></span></div>}
          {p.text && <p>{p.text}</p>}
          <div className="club-actions">
            <button type="button" aria-pressed={p.applauded} onClick={() => act(api(`/api/me/gym/club/posts/${p.id}/applause${q}`, { body: {} }))}>👏 {p.applause > 0 ? p.applause : "Aplaudir"}</button>
          </div>
          {p.comments.map((c) => <div key={c.id} className="club-comment"><b>{c.author}</b> {c.text}{c.hidden && <small> · oculto</small>}
            {c.mine ? <button type="button" className="linkbtn" onClick={() => act(api(`/api/me/gym/club/delete/comment/${c.id}${q}`, { body: {} }))}>Borrar</button>
              : <button type="button" className="linkbtn" onClick={() => act(api(`/api/me/gym/club/report${q}`, { body: { type: "comment", id: c.id, reason: "Contenido inapropiado" } }), "Gracias. El gym lo revisa.")}>Reportar</button>}</div>)}
          {!p.hidden && <CommentBox onSend={(t) => act(api(`/api/me/gym/club/posts/${p.id}/comments${q}`, { body: { text: t } }))} />}
        </article>
      ))}
      {profile && <ProfileSheet orgId={orgId} userId={profile} onClose={() => setProfile(null)} />}
      {more && (
        <Sheet title="Opciones" closeLabel="Cerrar" onClose={() => setMore(null)}>
          {more.mine ? <button type="button" className="ghost" onClick={() => { void act(api(`/api/me/gym/club/delete/post/${more.id}${q}`, { body: {} }), "Publicación borrada."); setMore(null); }}>Borrar mi publicación</button> : (
            <>
              {["Spam", "Contenido ofensivo", "Datos personales expuestos"].map((r) => <button key={r} type="button" className="ghost" onClick={() => { void act(api(`/api/me/gym/club/report${q}`, { body: { type: "post", id: more.id, reason: r } }), "Gracias. El gym lo revisa."); setMore(null); }}>Reportar: {r}</button>)}
              <button type="button" className="ghost" onClick={() => { void act(api(`/api/me/gym/club/block/${more.authorId}${q}`, { body: {} }), "Bloqueado. No vas a ver su contenido."); setMore(null); }}>Bloquear a {more.author}</button>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}

function CommentBox({ onSend }: { onSend: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <form className="club-cbox" onSubmit={(e) => { e.preventDefault(); if (t.trim()) { onSend(t); setT(""); } }}>
      <input value={t} maxLength={CLUB_COMMENT_MAX} onChange={(e) => setT(e.target.value)} placeholder="Comentar" aria-label="Comentar" />
      <button type="submit" disabled={!t.trim()}>Enviar</button>
    </form>
  );
}

/** Ranking del mes con transición FLIP al reordenar (F-RC-03). Respeta «reducir movimiento». */
function ClubRankView({ orgId }: { orgId: string }) {
  const [r, setR] = useState<ClubRank | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const prev = useRef(new Map<string, number>());
  useEffect(() => { api<ClubRank>(`/api/me/gym/club/ranking?org=${orgId}`).then(setR).catch(() => setR(null)); }, [orgId]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    for (const row of [...el.children] as HTMLElement[]) {
      const k = row.dataset.k!, top = row.getBoundingClientRect().top, before = prev.current.get(k);
      if (!reduce && before != null && before !== top) row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.05,.7,.1,1)" });
      prev.current.set(k, top);
    }
  }, [r]);
  if (!r) return <span className="mb-muted">Cargando…</span>;
  return (
    <>
      <span className="mb-muted" style={{ fontSize: 13 }}>{r.metric}. Se actualiza al registrar; no hace falta mirarlo seguido.</span>
      {!r.inRanking && <p className="mb-note">No aparecés en el ranking. Podés sumarte en «Mis preferencias del Club».</p>}
      <div className="rank" ref={box}>
        {r.rows.map((x) => <div key={x.name + x.pos} data-k={x.name} data-me={x.me ? "1" : undefined}><span className={x.pos <= 3 ? "top" : ""}>{x.pos}</span><b>{x.name}</b><small /><strong>{x.days} día{x.days === 1 ? "" : "s"}</strong></div>)}
        {!r.rows.length && <span className="mb-muted" style={{ padding: "12px 0" }}>Nadie se sumó al ranking todavía.</span>}
      </div>
    </>
  );
}

/** Mini gráfico de evolución (serie más pesada por entrenamiento). Texto alternativo con los valores. */
function Spark({ points, small }: { points: Pt[]; small?: boolean }) {
  const W = small ? 96 : 280, H = small ? 36 : 64, pad = 4;
  const ys = points.map((p) => p.kg), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const xy = points.map((p, i) => [pad + (i * (W - 2 * pad)) / Math.max(1, points.length - 1), H - pad - ((p.kg - min) * (H - 2 * pad)) / span] as const);
  const label = `Evolución: ${points.map((p) => `${p.kg.toLocaleString("es-AR")} kg × ${p.reps}`).join(", ")}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ flex: "none" }}>
      <polyline fill="none" stroke="#00D1FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" points={xy.map(([x, y]) => `${x},${y}`).join(" ")} />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === xy.length - 1 ? 3.5 : 2} fill={i === xy.length - 1 ? "#00D1FF" : "#5B6B80"} />)}
    </svg>
  );
}

type ProfileView = { mine: boolean; name: string; bio: string; showcase: { exercise: string; points: Pt[] }[]; monthDays: number | null; posts: number; since: string };
function ProfileSheet({ orgId, userId, onClose }: { orgId: string; userId: string; onClose: () => void }) {
  const [v, setV] = useState<ProfileView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<ProfileView>(`/api/me/gym/club/profile/${userId}?org=${orgId}`).then(setV).catch((e) => setErr(e.message)); }, [orgId, userId]);
  return (
    <Sheet title={v?.name ?? "Perfil"} sub={v ? `En el Club desde ${new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date(v.since))} · ${v.posts} publicaci${v.posts === 1 ? "ón" : "ones"}` : undefined} closeLabel="Cerrar" onClose={onClose}>
      {err && <p className="mb-note">{err}</p>}
      {v && <>
        {v.bio && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>{v.bio}</p>}
        {v.monthDays != null && <div className="club-ach"><span><b>{v.monthDays} día{v.monthDays === 1 ? "" : "s"} entrenando este mes</b><small>Programa del gym</small></span></div>}
        {v.showcase.map((x) => <div key={x.exercise} className="club-ach club-prog"><span><b>{x.exercise}</b><small>Última: {x.points.at(-1)!.kg.toLocaleString("es-AR")} kg × {x.points.at(-1)!.reps}</small></span><Spark points={x.points} small /></div>)}
        {!v.bio && !v.showcase.length && v.monthDays == null && <span className="mb-muted">{v.mine ? "Tu perfil está vacío: elegí qué mostrar en «Mi perfil del Club»." : "Esta persona todavía no eligió qué mostrar."}</span>}
      </>}
    </Sheet>
  );
}

type MyProfile = { bio: string; showLevel: boolean; showcase: string[]; exercises: { id: string; name: string; sessions: number }[] };
function ProfileEditor({ orgId, flash }: { orgId: string; flash: (t: string) => void }) {
  const [p, setP] = useState<MyProfile | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open && !p) api<MyProfile>(`/api/me/gym/club/profile?org=${orgId}`).then(setP).catch((e) => flash(e.message)); }, [open, p, orgId, flash]);
  const toggle = (id: string) => p && setP({ ...p, showcase: p.showcase.includes(id) ? p.showcase.filter((x) => x !== id) : p.showcase.length >= 4 ? (flash("Hasta 4 ejercicios."), p.showcase) : [...p.showcase, id] });
  const save = () => p && api<MyProfile>(`/api/me/gym/club/profile?org=${orgId}`, { body: { bio: p.bio, showLevel: p.showLevel, showcase: p.showcase } }).then((x) => { setP(x); flash("Perfil guardado."); }).catch((e) => flash(e.message));
  return (
    <details className="club-prefs" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}><summary>Mi perfil del Club</summary>
      {!p ? <span className="mb-muted">Cargando…</span> : <>
        <span className="mb-muted" style={{ fontSize: 13 }}>Nada se muestra hasta que lo elijas. Podés sacarlo cuando quieras.</span>
        <label className="club-field">Sobre mí (opcional)<textarea rows={2} maxLength={160} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} placeholder="Ej.: Entreno a la mañana, voy por mi primer 100 en sentadilla" /></label>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Ejercicios que muestro (hasta 4, con su evolución)</span>
        {!p.exercises.length ? <span className="mb-muted" style={{ fontSize: 13 }}>Cuando registres ejercicios del programa del gym, vas a poder elegirlos.</span> : (
          <div className="club-share">{p.exercises.map((x) => <button key={x.id} type="button" aria-pressed={p.showcase.includes(x.id)} onClick={() => toggle(x.id)}>{x.name}</button>)}</div>
        )}
        <label className="sheet-check"><input type="checkbox" checked={p.showLevel} onChange={(e) => setP({ ...p, showLevel: e.target.checked })} />Mostrar cuántos días entrené este mes</label>
        <button type="button" className="ghost sm" style={{ alignSelf: "flex-start" }} onClick={save}>Guardar perfil</button>
      </>}
    </details>
  );
}
