import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { repository, type PublicRoster } from '../../data';
import { GROUPS, TvMatrix, normalizeWeek, tafelBreite } from './RosterDraftPage';
import { PlanFlaeche } from './PlanFlaeche';
import {
  addDays,
  emptyWeek,
  isoDate,
  isoWeekNumber,
  mondayOf,
  type ShiftDay,
} from './rosterModel';

/**
 * Der Dienstplan hinter einem Freigabe-Link.
 *
 * Ohne Anmeldung erreichbar — gedacht fuer die Signal-Gruppe und die
 * Fernseher. Was hier ankommt, hat die Datenbank ausgesucht: genau die
 * laufende Woche, keine Konten, keine E-Mail-Adressen, nichts aus der Planung
 * fuer spaeter. Ein widerrufener oder erfundener Link bekommt dieselbe
 * Antwort wie ein unbekannter, damit man nicht durch Ausprobieren erfaehrt,
 * welche Tokens es gibt.
 */
export function PublicPlanPage() {
  const { token = '' } = useParams();
  const [plan, setPlan] = useState<PublicRoster | null>(null);
  const [zustand, setZustand] = useState<'laedt' | 'da' | 'ungueltig' | 'fehler'>('laedt');
  /** Gesetzt, wenn gerade der gespeicherte Stand gezeigt wird statt eines frischen. */
  const [ausGedaechtnis, setAusGedaechtnis] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('db-plan-oeffentlich');
    return () => document.body.classList.remove('db-plan-oeffentlich');
  }, []);

  /**
   * Laden — und den letzten guten Stand behalten.
   *
   * Diese Seite haengt an einer Wand und laeuft tagelang. Zwei Dinge muessen
   * deshalb sitzen:
   *
   *  - Sie holt sich regelmaessig neue Daten. Ein Plan von gestern, der wie
   *    heute aussieht, ist schlimmer als gar keiner.
   *  - Faellt das Netz aus, zeigt sie den letzten bekannten Stand mit
   *    Zeitangabe statt einer Fehlermeldung. Wer davorsteht, braucht die
   *    Schichten, nicht die Nachricht, dass gerade etwas klemmt.
   *
   * Was sie NICHT tut: einen zurueckgezogenen Link aus dem Gedaechtnis
   * bedienen. Sagt der Server „ungueltig", ist Schluss — sonst waere das
   * Zurueckziehen wirkungslos. Und aelter als einen Tag wird nichts gezeigt.
   */
  useEffect(() => {
    let aktiv = true;
    const schluessel = `dienstplan-stand-${token}`;
    const HOECHSTALTER = 24 * 60 * 60 * 1000;

    const holen = () => {
      repository
        .publicRoster(token)
        .then((p) => {
          if (!aktiv) return;
          if (p) {
            setPlan(p);
            setZustand('da');
            setAusGedaechtnis(null);
            try {
              localStorage.setItem(schluessel, JSON.stringify({ p, wann: Date.now() }));
            } catch {
              // Kein Speicherplatz: dann eben ohne Gedaechtnis weiterlaufen.
            }
          } else {
            // Ausdrueckliche Absage — der Link gilt nicht mehr.
            try {
              localStorage.removeItem(schluessel);
            } catch {
              /* egal */
            }
            setPlan(null);
            setZustand('ungueltig');
          }
        })
        .catch(() => {
          if (!aktiv) return;
          try {
            const roh = localStorage.getItem(schluessel);
            const alt = roh ? JSON.parse(roh) : null;
            if (alt && Date.now() - alt.wann < HOECHSTALTER) {
              setPlan(alt.p);
              setZustand('da');
              setAusGedaechtnis(new Date(alt.wann).toLocaleString('de-DE'));
              return;
            }
          } catch {
            /* dann eben die Fehlermeldung */
          }
          setZustand((z) => (z === 'da' ? 'da' : 'fehler'));
        });
    };

    holen();
    const takt = window.setInterval(holen, 60000);
    const beiSichtbar = () => document.visibilityState === 'visible' && holen();
    document.addEventListener('visibilitychange', beiSichtbar);

    return () => {
      aktiv = false;
      window.clearInterval(takt);
      document.removeEventListener('visibilitychange', beiSichtbar);
    };
  }, [token]);

  // Der Link zeigt immer die laufende Woche; das Montagsdatum kommt von der
  // Datenbank, damit Geraet und Server nicht auseinanderlaufen.
  const monday = useMemo(
    () => (plan?.weekStart ? new Date(`${plan.weekStart}T00:00:00`) : mondayOf(new Date())),
    [plan?.weekStart],
  );
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const todayIndex = useMemo(() => {
    const heute = isoDate(new Date());
    return days.findIndex((d) => isoDate(d) === heute);
  }, [days]);

  const employees = useMemo(
    () =>
      (plan?.employees ?? [])
        .filter((e) => GROUPS.some((g) => g.no === e.groupNo))
        .map((e) => ({ id: e.id, name: e.name, groupNo: e.groupNo, targetHours: 0 })),
    [plan],
  );

  const weekOf = (id: string): ShiftDay[] => {
    const eintrag = plan?.data?.[id]?.d;
    return Array.isArray(eintrag) ? normalizeWeek(eintrag) : emptyWeek();
  };

  if (zustand === 'laedt') {
    return <Hinweis text="Dienstplan wird geladen…" />;
  }
  if (zustand === 'ungueltig') {
    return (
      <Hinweis
        titel="Dieser Link gilt nicht mehr"
        text="Er wurde zurückgezogen oder war nie gültig. Frag deine Leitung nach einem neuen."
      />
    );
  }
  if (zustand === 'fehler') {
    return <Hinweis titel="Der Plan ist gerade nicht erreichbar" text="Bitte später noch einmal versuchen." />;
  }

  return (
    <div className="flex h-screen flex-col bg-lw-bg text-lw-text">
      {ausGedaechtnis && (
        <div className="bg-lw-warn/15 px-4 py-1.5 text-center text-sm font-semibold text-lw-warn">
          ▲ Keine Verbindung — angezeigt wird der Stand von {ausGedaechtnis}
        </div>
      )}
      <PlanFlaeche breite={tafelBreite(employees.length)}>
        <TvMatrix
          employees={employees}
          days={days}
          todayIndex={todayIndex}
          weekOf={weekOf}
          woche={`KW ${isoWeekNumber(monday)}`}
        />
      </PlanFlaeche>
    </div>
  );
}

function Hinweis({ titel, text }: { titel?: string; text: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-lw-bg px-6 text-center text-lw-text">
      <div>
        {titel && <h1 className="mb-2 text-2xl font-bold">{titel}</h1>}
        <p className="text-lw-text2">{text}</p>
      </div>
    </div>
  );
}
