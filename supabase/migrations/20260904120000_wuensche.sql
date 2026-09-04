-- =============================================================================
--  Wuensche: was sich die Mannschaft von der Plattform wuenscht
-- -----------------------------------------------------------------------------
--  Bisher kamen Wuensche zwischen Tuer und Angel: jemand sagt am Counter, was
--  fehlt, und es haengt daran, ob sich der Richtige daran erinnert. Damit
--  gewinnt, wer am lautesten oder zuletzt gefragt hat, nicht der beste Einfall.
--
--  Drei Dinge machen daraus ein Werkzeug statt eines Briefkastens:
--
--    Zustimmen. Ein Wunsch, den zwoelf Leute unterschreiben, ist etwas anderes
--    als einer, den einer hatte. Ohne diese Zahl kann die Leitung nur raten,
--    was sich lohnt.
--
--    Ein Stand. Offen, geplant, umgesetzt, abgelehnt. Ein Briefkasten ohne
--    Rueckmeldung wird nach dem dritten Mal nicht mehr benutzt.
--
--    Eine Antwort. Auch und gerade beim Ablehnen — ein Nein mit Begruendung
--    haelt jemanden bei der Stange, ein Schweigen nicht.
-- =============================================================================

create table if not exists feature_wuensche (
  id               uuid primary key default gen_random_uuid(),
  titel            text not null check (length(btrim(titel)) between 3 and 120),
  beschreibung     text,
  -- Aus welchem Bereich der Wunsch kommt. Beim Anlegen aus dem Profil
  -- uebernommen, damit niemand es eintippen muss.
  bereich          department,
  -- Bewusst text und kein Aufzaehlungstyp: welche Staende es gibt, ist eine
  -- Frage der Arbeitsweise und aendert sich eher als das Schema.
  status           text not null default 'offen'
                   check (status in ('offen', 'geplant', 'umgesetzt', 'abgelehnt')),
  eingereicht_von  uuid references profiles(id),
  eingereicht_am   timestamptz not null default now(),
  antwort          text,
  beantwortet_von  uuid references profiles(id),
  beantwortet_am   timestamptz,
  updated_at       timestamptz not null default now(),
  -- Eine Antwort ohne Datum waere nicht einzuordnen, ein Datum ohne Antwort
  -- eine leere Behauptung.
  constraint antwort_vollstaendig check ((antwort is null) = (beantwortet_am is null))
);

create index if not exists feature_wuensche_offen_idx
  on feature_wuensche (eingereicht_am desc) where status = 'offen';

-- --- Zustimmung --------------------------------------------------------------
--  Eine Stimme je Person und Wunsch; der Primaerschluessel setzt das durch,
--  nicht die Oberflaeche. Zuruecknehmen heisst loeschen — deshalb ist das hier
--  die einzige Tabelle im Bestand mit einer delete-Regel.
create table if not exists feature_stimmen (
  wunsch_id  uuid not null references feature_wuensche(id) on delete cascade,
  profil_id  uuid not null references profiles(id) on delete cascade,
  gestimmt_am timestamptz not null default now(),
  primary key (wunsch_id, profil_id)
);

alter table feature_wuensche enable row level security;
alter table feature_stimmen  enable row level security;

-- Lesen darf jeder Angestellte: ein Wunsch, den nur die Leitung sieht, wird
-- zweimal eingereicht.
create policy lesen on feature_wuensche for select to authenticated
  using (public.is_staff());

create policy einreichen on feature_wuensche for insert to authenticated
  with check (public.is_staff() and eingereicht_von = auth.uid());

-- Den eigenen Wunsch nachbessern, solange niemand ihn bearbeitet hat. Status
-- und Antwort bleiben dabei tabu — dafuer ist die Regel darunter da.
create policy eigenen_aendern on feature_wuensche for update to authenticated
  using (eingereicht_von = auth.uid() and status = 'offen' and antwort is null)
  with check (eingereicht_von = auth.uid() and status = 'offen' and antwort is null);

create policy leitung_bearbeiten on feature_wuensche for update to authenticated
  using (public.is_lead() or public.is_admin())
  with check (public.is_lead() or public.is_admin());

create policy stimmen_lesen on feature_stimmen for select to authenticated
  using (public.is_staff());

create policy stimmen_geben on feature_stimmen for insert to authenticated
  with check (public.is_staff() and profil_id = auth.uid());

create policy stimme_zuruecknehmen on feature_stimmen for delete to authenticated
  using (profil_id = auth.uid());

-- --- Zaehlstand --------------------------------------------------------------
--  Als View statt als Spalte: eine mitgefuehrte Zahl geht irgendwann ausein-
--  ander mit dem, was in der Stimmentabelle steht, und dann glaubt man der
--  falschen. Gezaehlt wird beim Lesen.
create or replace view v_feature_wuensche as
  select
    w.*,
    coalesce(s.stimmen, 0)                        as stimmen,
    p.display_name                                as eingereicht_von_name,
    a.display_name                                as beantwortet_von_name
  from feature_wuensche w
  left join (
    select wunsch_id, count(*)::int as stimmen
    from feature_stimmen group by wunsch_id
  ) s on s.wunsch_id = w.id
  left join profiles p on p.id = w.eingereicht_von
  left join profiles a on a.id = w.beantwortet_von;

-- Die View laeuft mit den Rechten des Aufrufers, nicht des Erstellers. Ohne
-- das umginge sie die Regeln oben — sie waere ein Loch neben der Tuer.
alter view v_feature_wuensche set (security_invoker = true);

comment on table feature_wuensche is
  'Wuensche der Mannschaft an die Plattform. Jeder darf lesen und einreichen, '
  'nur die Leitung setzt Stand und Antwort.';
