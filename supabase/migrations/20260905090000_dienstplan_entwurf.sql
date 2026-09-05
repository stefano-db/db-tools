-- =============================================================================
--  Dienstplan: erst schreiben, dann veroeffentlichen
-- -----------------------------------------------------------------------------
--  Bisher ging jede Eingabe unmittelbar in `data`, und daran haengt der
--  Ausloeser fuer die Meldungen. Wer eine Woche baute, verschickte dabei ein
--  Dutzend Benachrichtigungen an dieselben Leute — fuer Zwischenstaende, die
--  fuenf Minuten spaeter schon wieder anders waren. Nach der dritten solchen
--  Nachricht schaltet man sie ab, und dann kommt auch die eine an, auf die es
--  ankam, nicht mehr durch.
--
--  Jetzt gibt es zwei Staende in derselben Zeile:
--
--    `data`    ist der veroeffentlichte Plan. Ihn sehen die Mitarbeiter, die
--              Wandtafel im Center, das Bild und der Freigabe-Link. Nur seine
--              Aenderung loest Meldungen aus.
--
--    `entwurf` ist der Arbeitsstand der Leitung. null heisst: es liegt nichts
--              Unveroeffentlichtes vor.
--
--  Der Entwurf liegt bewusst in der Datenbank und nicht im Browser: am
--  Dienstplan arbeiten zwei Leitungen, und ein Entwurf, der nur auf einem
--  Rechner lebt, ist nach einem Neuladen weg und fuer die andere unsichtbar.
-- =============================================================================

alter table roster_weeks
  add column if not exists entwurf     jsonb,
  add column if not exists entwurf_von uuid references profiles(id),
  add column if not exists entwurf_am  timestamptz;

comment on column roster_weeks.entwurf is
  'Unveroeffentlichter Arbeitsstand. null = es liegt nichts vor. Aenderungen '
  'hier loesen keine Meldung aus.';

-- --- Historie nur beim veroeffentlichten Stand -------------------------------
--  Sonst schriebe jeder Tastendruck im Entwurf eine Zeile in die Historie —
--  und zwar jedes Mal dieselbe, denn die Historie haelt `data` fest.
create or replace function public.roster_week_versionieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.data is distinct from old.data then
    insert into roster_week_history (week_start, data, version, replaced_by)
    values (old.week_start, old.data, old.version, auth.uid());
  end if;

  -- Die Fassung steigt bei jeder Aenderung, auch am Entwurf: sie schuetzt zwei
  -- gleichzeitig arbeitende Leitungen davor, sich gegenseitig zu ueberschreiben.
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

-- --- Speichern schreibt ab jetzt in den Entwurf ------------------------------
create or replace function public.roster_week_speichern(
  p_week_start date,
  p_data       jsonb,
  p_version    bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_aktuell bigint;
  v_neu     bigint;
  v_zeilen  int;
begin
  if not (public.is_lead() or public.is_admin()) then
    return jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  end if;

  select version into v_aktuell from roster_weeks where week_start = p_week_start;

  -- Neue Woche: es gibt noch keinen veroeffentlichten Plan. `data` bleibt leer,
  -- bis jemand veroeffentlicht — nicht '{}' als Behauptung, sondern als
  -- wahrheitsgemaesse Aussage: bisher steht nichts fest.
  if v_aktuell is null then
    insert into roster_weeks (week_start, data, entwurf, entwurf_von, entwurf_am, updated_by)
    values (p_week_start, '{}'::jsonb, p_data, auth.uid(), now(), auth.uid());
    return jsonb_build_object('ok', true, 'version', 1);
  end if;

  if p_version is distinct from v_aktuell then
    return jsonb_build_object(
      'ok', false, 'grund', 'veraltet',
      'version', v_aktuell,
      'data', (select coalesce(entwurf, data) from roster_weeks where week_start = p_week_start)
    );
  end if;

  update roster_weeks
     set entwurf     = p_data,
         entwurf_von = auth.uid(),
         entwurf_am  = now(),
         updated_by  = auth.uid()
   where week_start = p_week_start
  returning version into v_neu;

  get diagnostics v_zeilen = row_count;
  if v_zeilen = 0 then
    return jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  end if;

  return jsonb_build_object('ok', true, 'version', v_neu);
end $$;

-- --- Veroeffentlichen ---------------------------------------------------------
create or replace function public.roster_week_veroeffentlichen(
  p_week_start date,
  p_version    bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_aktuell bigint;
  v_entwurf jsonb;
  v_neu     bigint;
  v_zeilen  int;
begin
  if not (public.is_lead() or public.is_admin()) then
    return jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  end if;

  select version, entwurf into v_aktuell, v_entwurf
    from roster_weeks where week_start = p_week_start;

  if v_aktuell is null then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;

  if p_version is distinct from v_aktuell then
    return jsonb_build_object(
      'ok', false, 'grund', 'veraltet',
      'version', v_aktuell,
      'data', (select coalesce(entwurf, data) from roster_weeks where week_start = p_week_start)
    );
  end if;

  -- Nichts zu veroeffentlichen ist kein Fehler: zwei Klicks hintereinander
  -- duerfen nicht in einer Fehlermeldung enden.
  if v_entwurf is null then
    return jsonb_build_object('ok', true, 'version', v_aktuell, 'nichts', true);
  end if;

  update roster_weeks
     set data        = v_entwurf,
         entwurf     = null,
         entwurf_von = null,
         entwurf_am  = null,
         updated_by  = auth.uid()
   where week_start = p_week_start
  returning version into v_neu;

  get diagnostics v_zeilen = row_count;
  if v_zeilen = 0 then
    return jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  end if;

  return jsonb_build_object('ok', true, 'version', v_neu);
end $$;

-- --- Entwurf verwerfen --------------------------------------------------------
create or replace function public.roster_week_entwurf_verwerfen(
  p_week_start date,
  p_version    bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_aktuell bigint;
  v_neu     bigint;
begin
  if not (public.is_lead() or public.is_admin()) then
    return jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  end if;

  select version into v_aktuell from roster_weeks where week_start = p_week_start;
  if v_aktuell is null then
    return jsonb_build_object('ok', true, 'version', 0, 'nichts', true);
  end if;

  if p_version is distinct from v_aktuell then
    return jsonb_build_object('ok', false, 'grund', 'veraltet', 'version', v_aktuell);
  end if;

  update roster_weeks
     set entwurf = null, entwurf_von = null, entwurf_am = null, updated_by = auth.uid()
   where week_start = p_week_start
  returning version into v_neu;

  return jsonb_build_object('ok', true, 'version', v_neu);
end $$;

revoke all on function public.roster_week_veroeffentlichen(date, bigint) from public;
grant execute on function public.roster_week_veroeffentlichen(date, bigint) to authenticated;
revoke all on function public.roster_week_entwurf_verwerfen(date, bigint) from public;
grant execute on function public.roster_week_entwurf_verwerfen(date, bigint) to authenticated;

comment on function public.roster_week_veroeffentlichen(date, bigint) is
  'Uebernimmt den Entwurf in den veroeffentlichten Plan. Erst hier gehen die '
  'Meldungen an die Betroffenen hinaus — einmal, mit allen Aenderungen.';
