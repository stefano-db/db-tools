-- =============================================================================
--  Dienstplan: Zuverlässigkeit
-- -----------------------------------------------------------------------------
--  Wenn der ganze Betrieb über den Plan läuft, sind drei Dinge nicht mehr
--  hinnehmbar, die bisher möglich waren:
--
--   1. Zwei Leitungen arbeiten gleichzeitig, und die zweite Speicherung
--      überschreibt die erste stillschweigend. Der Plan wird als eine JSON-Zeile
--      je Woche geschrieben — wer zuletzt speichert, gewinnt, ohne dass es
--      jemand merkt. Dagegen hilft nur eine Fassungsnummer: Wer speichert, sagt
--      dazu, auf welchem Stand er aufgesetzt hat. Stimmt der nicht mehr, wird
--      abgelehnt statt überschrieben.
--
--   2. Eine versehentlich geleerte Woche war unwiederbringlich. Es gab keine
--      Historie — anders als in der Wartung, wo nichts gelöscht wird. Jede
--      Änderung legt jetzt den vorigen Stand ab.
--
--   3. Der Freigabe-Link bestimmte die laufende Woche in der Zeitzone der
--      Datenbank (UTC). Zwischen Mitternacht und zwei Uhr deutscher Zeit ist
--      dort noch Vortag — der Link zeigte in genau den Stunden, in denen die
--      Spätschicht Feierabend macht, die vergangene Woche.
-- =============================================================================

-- --- 1) Fassungsnummer -------------------------------------------------------
alter table roster_weeks add column if not exists version bigint not null default 1;

comment on column roster_weeks.version is
  'Zählt bei jeder Änderung hoch. Wer speichert, nennt die Fassung, auf der er '
  'aufgesetzt hat; passt sie nicht, wird die Speicherung abgelehnt.';

-- --- 2) Historie -------------------------------------------------------------
create table if not exists roster_week_history (
  id           bigserial primary key,
  week_start   date not null,
  /** Der Stand *vor* der Änderung. */
  data         jsonb not null,
  version      bigint not null,
  replaced_at  timestamptz not null default now(),
  replaced_by  uuid references profiles(id)
);

create index if not exists roster_week_history_idx
  on roster_week_history (week_start, replaced_at desc);

comment on table roster_week_history is
  'Jeder überschriebene Stand einer Woche. Nichts wird gelöscht — eine '
  'versehentlich geleerte Woche laesst sich damit zurueckholen.';

alter table roster_week_history enable row level security;

-- Lesen dürfen Leitungen und Administratoren; geschrieben wird ausschliesslich
-- vom Auslöser weiter unten, nicht von aussen.
drop policy if exists read_lead on roster_week_history;
create policy read_lead on roster_week_history for select to authenticated
  using (public.is_lead() or public.is_admin());

-- --- Auslöser ----------------------------------------------------------------
--  security definer, weil die Historie von aussen nicht beschreibbar ist: der
--  Auslöser soll schreiben duerfen, der Mensch nicht.
create or replace function public.roster_week_versionieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into roster_week_history (week_start, data, version, replaced_by)
  values (old.week_start, old.data, old.version, auth.uid());

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists roster_weeks_versionieren on roster_weeks;
create trigger roster_weeks_versionieren
  before update on roster_weeks
  for each row execute function public.roster_week_versionieren();

-- --- Speichern mit Fassungsprüfung -------------------------------------------
--  Eine Funktion statt eines offenen Updates: sie entscheidet, ob gespeichert
--  wird, und sagt dem Aufrufer klar, was passiert ist. Ohne sie müsste die
--  Oberfläche aus einer leeren Trefferliste raten.
create or replace function public.roster_week_speichern(
  p_week_start date,
  p_data       jsonb,
  p_version    bigint
)
returns jsonb
language plpgsql
security invoker           -- die Rechte der Leitung gelten weiter
set search_path = public
as $$
declare
  v_aktuell bigint;
  v_neu     bigint;
begin
  select version into v_aktuell from roster_weeks where week_start = p_week_start;

  -- Neue Woche: p_version 0 heisst „es gab noch nichts".
  if v_aktuell is null then
    insert into roster_weeks (week_start, data, updated_by)
    values (p_week_start, p_data, auth.uid());
    return jsonb_build_object('ok', true, 'version', 1);
  end if;

  if p_version is distinct from v_aktuell then
    return jsonb_build_object(
      'ok', false, 'grund', 'veraltet',
      'version', v_aktuell, 'data', (select data from roster_weeks where week_start = p_week_start)
    );
  end if;

  update roster_weeks
     set data = p_data, updated_by = auth.uid()
   where week_start = p_week_start
  returning version into v_neu;

  return jsonb_build_object('ok', true, 'version', v_neu);
end $$;

comment on function public.roster_week_speichern(date, jsonb, bigint) is
  'Speichert eine Woche nur, wenn der Aufrufer auf dem aktuellen Stand '
  'aufgesetzt hat. Sonst kommt der neue Stand zurueck, damit die Oberflaeche '
  'ihn zeigen kann, statt fremde Arbeit zu ueberschreiben.';

revoke all on function public.roster_week_speichern(date, jsonb, bigint) from public;
grant execute on function public.roster_week_speichern(date, jsonb, bigint) to authenticated;

-- --- 3) Zeitzone des Freigabe-Links ------------------------------------------
create or replace function public.roster_public(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link   roster_share_links%rowtype;
  v_monday date;
  v_week   roster_weeks%rowtype;
begin
  select * into v_link
    from roster_share_links
   where token = p_token and revoked_at is null;

  if not found then
    return null;
  end if;

  update roster_share_links
     set last_used_at = now(), use_count = use_count + 1
   where token = p_token;

  -- Ortszeit, nicht Datenbankzeit: um 00:30 in Deutschland ist in UTC noch
  -- Vortag, und der Link zeigte dann die vergangene Woche.
  v_monday := date_trunc('week', (now() at time zone 'Europe/Berlin'))::date;

  select * into v_week from roster_weeks where week_start = v_monday;

  return jsonb_build_object(
    'week_start', v_monday,
    'updated_at', v_week.updated_at,
    'settings', (select jsonb_build_object('group_names', group_names, 'group_colors', group_colors)
                   from roster_settings where id),
    'employees', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', id, 'name', name, 'group_no', group_no, 'sort_order', sort_order
                  ) order by group_no, sort_order, name), '[]'::jsonb)
                   from roster_employees where active),
    'data', coalesce(v_week.data, '{}'::jsonb)
  );
end $$;
