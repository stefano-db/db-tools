-- =============================================================================
--  Schließfächer
-- -----------------------------------------------------------------------------
--  Die Fächer stehen schon im Brunswick, farbig als Kacheln. Was dort fehlt,
--  ist alles Übrige: wer wie lange gemietet hat, ob bezahlt wurde, und vor
--  allem — wann etwas ausläuft. Das steht heute auf einem Blatt in einer
--  Klarsichthülle, wird einmal im Jahr abgehakt und fällt dazwischen niemandem
--  auf. Genau dazwischen liegt das Geld.
--
--  Deshalb: dieselben Zustände und Farben wie im Brunswick, damit man im
--  Vorbeigehen vergleichen kann und nicht umlernen muss — und dazu die Fristen,
--  die dort nicht vorkommen.
--
--  Was ablaeuft, wird nicht gespeichert, sondern gerechnet. Ein Feld
--  „abgelaufen" waere am Tag nach dem Setzen schon falsch, und niemand pflegt
--  es nach. Gespeichert wird nur, was jemand entschieden hat: bis wann gemietet
--  ist und ob bezahlt wurde.
-- =============================================================================

create type schliessfach_zustand as enum (
  'frei',        -- im Brunswick weiss: Unbesetzt
  'reserviert',  -- blau
  'vermietet',   -- gruen: Verliehen
  'lager',       -- lila
  'defekt'       -- schraffiert
);

create table if not exists schliessfaecher (
  id           uuid primary key default gen_random_uuid(),
  nummer       int  not null unique check (nummer > 0),
  /** „S", „M", „L" — freies Kuerzel, weil die Groessen im Haus sich aendern. */
  groesse      text not null default 'S',
  zustand      schliessfach_zustand not null default 'frei',

  /** Wer mietet. Auch „Lager" oder „Vereinsfach SV Fellbach" stehen hier. */
  mieter       text,
  /** Telefon oder E-Mail, um vor dem Ablauf erinnern zu koennen. */
  kontakt      text,

  miete_von    date,
  miete_bis    date,
  bezahlt      boolean not null default false,
  /**
   * Im Brunswick orange. Heisst: es steht mehr Guthaben auf dem Fach, als die
   * laufende Miete kostet — meist, weil jemand fuer zwei Jahre gezahlt hat.
   * Kein Fehler, aber man muss es beim Verlaengern wissen.
   */
  ueberzahlung boolean not null default false,

  notiz        text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references profiles(id),

  -- Ein vermietetes Fach ohne Namen ist ein Eingabefehler, kein Zustand.
  constraint mieter_bei_vermietung check (
    zustand <> 'vermietet' or (mieter is not null and length(btrim(mieter)) > 0)
  ),
  constraint zeitraum_sinnvoll check (miete_bis is null or miete_von is null or miete_bis >= miete_von)
);

comment on table schliessfaecher is
  'Vermietung der Schliessfaecher. Zustaende und Farben wie im Brunswick; die '
  'Fristen kommen hinzu, die es dort nicht gibt.';

create index if not exists schliessfaecher_ablauf_idx
  on schliessfaecher (miete_bis) where zustand = 'vermietet';

-- --- Rechte ------------------------------------------------------------------
alter table schliessfaecher enable row level security;

drop policy if exists lesen on schliessfaecher;
create policy lesen on schliessfaecher for select to authenticated
  using (public.has_module('schliessfaecher'));

drop policy if exists pflegen on schliessfaecher;
create policy pflegen on schliessfaecher for all to authenticated
  using (public.can_write_module('schliessfaecher'))
  with check (public.can_write_module('schliessfaecher'));

-- --- Wann etwas faellig wird -------------------------------------------------
--  Die Frist steht in der Datenbank und nicht im Programm: sie ist eine
--  Entscheidung des Hauses („wir sprechen Leute sechs Wochen vorher an"), keine
--  Eigenschaft der Anzeige. Und sie soll sich aendern lassen, ohne dass jemand
--  einen neuen Stand ausliefert.
insert into app_konfiguration (schluessel, wert, notiz) values
  ('schliessfach_frist_tage', '42',
   'Ab wie vielen Tagen vor Ablauf ein Fach als faellig gilt.')
on conflict (schluessel) do nothing;

-- Lesbar fuer alle Angestellten: es ist keine Zahl, die jemand verbergen muss,
-- und die Anzeige braucht sie. Die uebrigen Zeilen bleiben unerreichbar, weil
-- diese Regel nur diese eine Zeile freigibt.
drop policy if exists frist_lesen on app_konfiguration;
create policy frist_lesen on app_konfiguration for select to authenticated
  using (schluessel = 'schliessfach_frist_tage' and public.is_staff());

-- --- Modul -------------------------------------------------------------------
insert into app_modules (key, name_de, path, icon, sort_order, active)
values ('schliessfaecher', 'Schließfächer', '/schliessfaecher', 'lock', 25, true)
on conflict (key) do update
  set name_de = excluded.name_de, path = excluded.path,
      icon = excluded.icon, sort_order = excluded.sort_order, active = excluded.active;

-- Der Counter vermietet sie, also gehoert das Werkzeug dorthin.
insert into department_module_access (department, module_key, can_write) values
  ('counter', 'schliessfaecher', true)
on conflict (department, module_key) do update set can_write = excluded.can_write;

notify pgrst, 'reload schema';
