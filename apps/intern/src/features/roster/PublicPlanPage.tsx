import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { repository, type PublicRoster } from '../../data';
import { GROUPS, TvMatrix, normalizeWeek } from './RosterDraftPage';
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

  useEffect(() => {
    document.body.classList.add('db-plan-oeffentlich');
    return () => document.body.classList.remove('db-plan-oeffentlich');
  }, []);

  useEffect(() => {
    let aktiv = true;
    repository
      .publicRoster(token)
      .then((p) => {
        if (!aktiv) return;
        setPlan(p);
        setZustand(p ? 'da' : 'ungueltig');
      })
      .catch(() => aktiv && setZustand('fehler'));
    return () => {
      aktiv = false;
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
      <PlanFlaeche breite={1820}>
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
