-- =============================================================================
--  Chat / Hilfe
-- -----------------------------------------------------------------------------
--  Ziel ist am Ende eine KI, die Fragen zur Arbeit und zum Programm beantwortet
--  und neue Leute einarbeitet. Der Weg dorthin führt aber nicht über das
--  Sprachmodell, sondern über das Wissen: ein Modell ohne Kenntnis des Hauses
--  erfindet Antworten, und eine erfundene Auskunft über Arbeitszeiten oder
--  Maschinen ist schlimmer als keine.
--
--  Deshalb zuerst der Wissensspeicher und die Suche darin. Beides kostet nichts
--  und beantwortet ab dem ersten Eintrag echte Fragen. Kommt später ein
--  Sprachmodell dazu, bekommt es genau diese Treffer als Grundlage vorgesetzt —
--  es formuliert dann, statt zu raten. Der Speicher ist also keine Zwischen-
--  loesung, sondern der bleibende Teil.
--
--  Zweiter Zweck: Jede Frage wird mitgeschrieben, auch die unbeantwortete.
--  Woran es im Haus hakt, steht sonst nirgends — und genau daraus entsteht
--  später das Einarbeitungsprogramm.
-- =============================================================================

-- --- Wissen ------------------------------------------------------------------
create table chat_wissen (
  id          uuid primary key default gen_random_uuid(),
  titel       text not null check (length(btrim(titel)) > 0),
  inhalt      text not null check (length(btrim(inhalt)) > 0),
  /** Nur für einen Bereich gedacht? NULL heisst: geht alle an. */
  bereich     department,
  schlagworte text[] not null default '{}',
  aktiv       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id)
);

-- Volltext auf Deutsch: „Schichten" findet „Schicht", „Bahnen" findet „Bahn".
-- Der Titel wiegt am schwersten, dann die Schlagworte, dann der Text.
alter table chat_wissen add column suchtext tsvector
  generated always as (
    setweight(to_tsvector('german', coalesce(titel, '')), 'A') ||
    setweight(to_tsvector('german', array_to_string(schlagworte, ' ')), 'B') ||
    setweight(to_tsvector('german', coalesce(inhalt, '')), 'C')
  ) stored;

create index chat_wissen_suche_idx on chat_wissen using gin (suchtext);

comment on table chat_wissen is
  'Was der Chat weiss. Gepflegt von Leitungen und Administratoren; die Suche '
  'darin ist die Grundlage jeder Antwort — auch spaeter, wenn ein Sprachmodell '
  'die Formulierung uebernimmt.';

-- --- Fragen ------------------------------------------------------------------
create table chat_fragen (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete set null,
  frage       text not null,
  /** Wie viele Wissenseintraege gepasst haben. 0 heisst: Luecke. */
  treffer     int not null default 0,
  /** Rueckmeldung des Fragenden, falls gegeben. */
  geholfen    boolean,
  created_at  timestamptz not null default now()
);

create index chat_fragen_offen_idx on chat_fragen (created_at desc) where treffer = 0;

comment on table chat_fragen is
  'Jede gestellte Frage, auch die unbeantwortete. Zeigt, wo das Wissen fehlt.';

-- =============================================================================
--  Rechte
-- -----------------------------------------------------------------------------
--  Lesen darf jeder Angestellte: der Chat ist fuer alle da, unabhaengig vom
--  Bereich. Pflegen duerfen Leitungen und Administratoren.
-- =============================================================================
alter table chat_wissen enable row level security;
alter table chat_fragen enable row level security;

create policy lesen_alle on chat_wissen for select to authenticated
  using (public.is_staff() and aktiv);

create policy pflegen_leitung on chat_wissen for all to authenticated
  using (public.is_lead() or public.is_admin())
  with check (public.is_lead() or public.is_admin());

-- Die eigene Frage darf jeder stellen und sehen; die Leitung sieht alle, sonst
-- bliebe die Luecke im Wissen unentdeckt.
create policy eigene_fragen on chat_fragen for insert to authenticated
  with check (user_id = auth.uid());
create policy eigene_lesen on chat_fragen for select to authenticated
  using (user_id = auth.uid() or public.is_lead() or public.is_admin());
create policy eigene_rueckmeldung on chat_fragen for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
--  Suche
-- -----------------------------------------------------------------------------
--  Eine Funktion statt einer Abfrage in der Oberflaeche: die Rangfolge gehoert
--  dorthin, wo der Index liegt. websearch_to_tsquery versteht ganze Saetze —
--  der Mitarbeiter tippt eine Frage, keine Suchbegriffe.
-- =============================================================================
create or replace function public.chat_suche(p_frage text, p_grenze int default 4)
returns table (id uuid, titel text, inhalt text, bereich department, rang real)
language sql
stable
security invoker
set search_path = public
as $$
  select w.id, w.titel, w.inhalt, w.bereich,
         ts_rank(w.suchtext, websearch_to_tsquery('german', p_frage)) as rang
    from chat_wissen w
   where w.aktiv
     and w.suchtext @@ websearch_to_tsquery('german', p_frage)
   order by rang desc
   limit greatest(p_grenze, 1);
$$;

comment on function public.chat_suche(text, int) is
  'Passende Wissenseintraege zu einer Frage, beste zuerst. Grundlage der '
  'Antwort — heute unmittelbar, spaeter als Vorlage fuer das Sprachmodell.';

revoke all on function public.chat_suche(text, int) from public;
grant execute on function public.chat_suche(text, int) to authenticated;

-- =============================================================================
--  Erste Eintraege
-- -----------------------------------------------------------------------------
--  Ein leerer Chat beantwortet nichts und wird nicht wieder geoeffnet. Diese
--  Eintraege beschreiben das Programm selbst — das ist das Wissen, das heute
--  schon feststeht und nicht erst gesammelt werden muss.
-- =============================================================================
insert into chat_wissen (titel, inhalt, schlagworte) values
('Dienstplan ansehen',
 'Den aktuellen Plan findest du in der Seitenleiste unter „Dienstplan". Deine eigenen Schichten stehen zusätzlich auf der Übersicht unter „Nächste Schicht" und „Diese Woche". Am Fernseher im Center hängt derselbe Plan. Wenn dort keine Schicht steht, ist dein Konto noch keinem Namen im Plan zugeordnet — das erledigt deine Bereichsleitung in der Verwaltung.',
 array['dienstplan','schicht','arbeitszeit','plan','woche']),

('Dienstplan ändern',
 'Ändern dürfen nur Bereichsleitungen und Administratoren. Öffne den Dienstplan, klicke auf einen Tag und trage Beginn und Ende ein — Kurzschreibweise genügt, „930" wird zu 09:30. Oben links steht, ob gespeichert wurde: „Wird gespeichert…" und dann „Gespeichert". Steht dort rot „NICHT gespeichert", ist nichts angekommen.',
 array['dienstplan','ändern','bearbeiten','schicht eintragen','leitung']),

('Frühere Stände des Dienstplans zurückholen',
 'Im Dienstplan oben rechts auf „🕘 Verlauf". Dort stehen die früheren Stände der angezeigten Woche mit Zeitpunkt und Urheber. „Wiederherstellen" holt einen davon zurück; der jetzige Stand bleibt dabei erhalten und lässt sich genauso zurückholen.',
 array['verlauf','rückgängig','wiederherstellen','gelöscht','fehler']),

('Passwort vergessen',
 'Wenn du dich mit deiner E-Mail-Adresse anmeldest, kannst du dir auf der Anmeldeseite selbst einen Link schicken lassen — „Passwort vergessen?" unter dem Anmelden-Knopf. Meldest du dich mit einem Benutzernamen an, wendest du dich an deine Bereichsleitung; sie kann in der Verwaltung ein neues Passwort setzen.',
 array['passwort','anmelden','login','vergessen','zugang']),

('Bahnwartung: Frame-Stände eintragen',
 'Modul „Bahnwartung", Reiter „Frame-Stände". Trage je Bahn den Zählerstand ein, den die Maschine anzeigt; die Eingabetaste springt zur nächsten Bahn. Die App rechnet selbst aus, wie viele Frames seit der letzten Wartung gelaufen sind. Unplausible Werte werden angezeigt, bevor gespeichert wird.',
 array['bahnwartung','frames','zähler','eintragen','wartung']),

('Bahnwartung: Wann ist eine Wartung fällig',
 'Gewartet wird nach gelaufenen Frames, nicht nach Datum: 25.000, 50.000, 100.000 und 500.000. Entscheidend ist der Abstand zur letzten Wartung, nicht der Zählerstand selbst. Das Dashboard zeigt fällige Bahnen zuerst. „Zu prüfen" heisst, dass die Angaben nicht zusammenpassen — dann stimmt entweder die Ablesung oder der Wartungseintrag nicht.',
 array['wartung','fällig','intervall','frames','bahn']),

('Defekt melden',
 'In der Bahnwartung oben rechts „Defekt melden". Bahn auswählen, kurz beschreiben was ist, Dringlichkeit wählen. Die Meldung erscheint sofort auf dem Dashboard und geht nicht in der Wartungsplanung unter.',
 array['defekt','störung','kaputt','melden','reparatur']),

('Dienstplan teilen und drucken',
 'Im Dienstplan-Entwurf unter „Teilen & Drucken": Ein Bild für die Signal-Gruppe, ein Link zum Anpinnen, der immer die laufende Woche zeigt, oder Drucken auf A4 quer. Im Druckfenster statt eines Druckers „Als PDF sichern" wählen, wenn du eine Datei brauchst.',
 array['teilen','drucken','signal','pdf','a4']);
