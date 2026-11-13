"use client";
// Avisos del descanso (13/11/2026): sonido (últimos 10 s y hasta arrancar la serie) y notificación al terminar. Los dos son
// opcionales, por dispositivo y apagados de entrada. Se encienden desde el propio temporizador (`RestAlertChips`) y desde
// Perfil → Configuración (`RestAlertSettings`); las dos vistas leen y cambian lo mismo.
import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRinging, BellSlash, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { Ic } from "@/components/ui/Ic";
import { disableRestAlert, enableRestAlert, restAlertState, type RestAlertState } from "@/lib/restAlert";
import { previewRestSound, restSoundServerSnapshot, restSoundSnapshot, setRestSound, subscribeRestSound } from "@/lib/restSound";

export const useRestSound = () => useSyncExternalStore(subscribeRestSound, restSoundSnapshot, restSoundServerSnapshot);

const SOUND_ON = "Listo: suena los últimos 10 segundos y sigue hasta que arranques la serie. Con el teléfono en silencio no suena.";
const NOTIF_ON = "Listo: te avisamos al terminar el descanso si salís de la app.";

/** Estado y acciones de los dos avisos. `onNotif` avisa a quien también guarda ese estado (el entrenamiento). */
function useRestAlerts(flash: (m: string) => void, onNotif?: (s: RestAlertState) => void) {
  const sound = useRestSound();
  const [notif, setNotif] = useState<RestAlertState>("unsupported");
  useEffect(() => { setNotif(restAlertState()); }, []);
  const put = (s: RestAlertState) => { setNotif(s); onNotif?.(s); };
  return {
    sound, notif,
    toggleSound: () => { const on = setRestSound(!sound.on); flash(on ? SOUND_ON : "Sonido del descanso apagado."); },
    toggleNotif: async () => {
      if (notif === "denied") { flash("Las notificaciones están bloqueadas para REPI en este navegador. Se habilitan desde los ajustes del teléfono."); return; }
      if (notif === "on") { disableRestAlert(); put("off"); flash("Notificación del descanso apagada."); return; }
      const st = await enableRestAlert();
      put(st);
      flash(st === "on" ? NOTIF_ON : "Sin permiso de notificaciones no podemos avisarte.");
    },
  };
}

/** En el temporizador del descanso: dos interruptores compactos (el estado se lee en el texto y en el ícono, no sólo en el color). */
export function RestAlertChips({ flash, onNotif }: { flash: (m: string) => void; onNotif?: (s: RestAlertState) => void }) {
  const a = useRestAlerts(flash, onNotif);
  if (!a.sound.supported && a.notif === "unsupported") return null;
  return (
    <div className="rest-alert" role="group" aria-label="Avisos al terminar el descanso">
      <span className="rest-alert-l">Avisarme</span>
      {a.sound.supported && (
        <button type="button" className="rest-chip" role="switch" aria-checked={a.sound.on} aria-label="Sonido en los últimos 10 segundos y al terminar" onClick={a.toggleSound}>
          <Ic i={a.sound.on ? SpeakerHigh : SpeakerSlash} size={16} /><span>Sonido</span><b>{a.sound.on ? "Sí" : "No"}</b>
        </button>
      )}
      {a.notif !== "unsupported" && (
        <button type="button" className="rest-chip" role="switch" aria-checked={a.notif === "on"} aria-disabled={a.notif === "denied" || undefined} aria-label="Notificación al terminar el descanso" onClick={() => void a.toggleNotif()}>
          <Ic i={a.notif === "on" ? BellRinging : BellSlash} size={16} /><span>Notificación</span><b>{a.notif === "on" ? "Sí" : a.notif === "denied" ? "Bloqueada" : "No"}</b>
        </button>
      )}
    </div>
  );
}

/** En Perfil → Configuración: los mismos dos interruptores, con lo que hace cada uno y sus límites dichos sin vueltas. */
export function RestAlertSettings({ flash }: { flash: (m: string) => void }) {
  const a = useRestAlerts(flash);
  if (!a.sound.supported && a.notif === "unsupported") return null;
  return (
    <div className="rest-set" role="group" aria-labelledby="rest-set-h">
      <h3 id="rest-set-h">Avisos del descanso</h3>
      <div className="panel">
        {a.sound.supported && (
          <button type="button" className="prow-dark" role="switch" aria-checked={a.sound.on} onClick={a.toggleSound}>
            <span><span style={{ fontSize: 15, fontWeight: 500 }}>Sonido al terminar el descanso</span>
              <small>Suena los últimos 10 segundos y sigue hasta que arranques la serie (hasta 5 minutos).</small></span>
            <span className="track" aria-hidden="true" />
          </button>
        )}
        {a.notif !== "unsupported" && (
          <button type="button" className="prow-dark" role="switch" aria-checked={a.notif === "on"} aria-disabled={a.notif === "denied" || undefined} onClick={() => void a.toggleNotif()}>
            <span><span style={{ fontSize: 15, fontWeight: 500 }}>Notificación al terminar</span>
              <small>{a.notif === "denied" ? "Bloqueada para REPI en este navegador." : "Si salís de la app durante el descanso. El teléfono puede demorarla."}</small></span>
            <span className="track" aria-hidden="true" />
          </button>
        )}
      </div>
      {a.sound.on && <button type="button" className="linkbtn rest-set-try" onClick={previewRestSound}>Probar el sonido</button>}
      <p className="mb-muted rest-set-note">
        Se guardan en este teléfono y se pueden cambiar también desde el temporizador. El sonido respeta el volumen y el modo silencio.
        Con la pantalla bloqueada, en Android suele seguir sonando; en iPhone el sistema pausa la app y el aviso suena cuando volvés.
      </p>
    </div>
  );
}
