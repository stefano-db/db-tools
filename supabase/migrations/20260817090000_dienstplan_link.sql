-- =============================================================================
--  Freigabe-Link für den Dienstplan
-- -----------------------------------------------------------------------------
--  Zweck: ein Link, der ohne Anmeldung die laufende Woche zeigt — angepinnt in
--  der Signal-Gruppe und offen auf den Fernsehern im Center.
--
--  Sicherheitsentscheidungen:
--    - Die Tabellen bleiben zu. Ohne Anmeldung kommt niemand an roster_weeks;
--      ausgeliefert wird ausschliesslich über eine Funktion, die genau eine
--      Woche in genau der noetigen Form zurueckgibt.
--    - Der Link zeigt immer die *laufende* Woche. Er kann also nicht benutzt
--      werden, um in der Planung fuer uebernaechste Woche mitzulesen.
--    - Jederzeit widerrufbar, und es kann mehrere geben (Fernseher, Gruppe),
--      damit man einen einzelnen zurueckziehen kann, ohne die anderen zu stoeren.
--    - Kein Zugriff auf Konten, E-Mail-Adressen oder sonstige Daten.
-- =============================================================================

create table roster_share_links (
  token       text primary key default encode(gen_random_bytes(24), 'hex'),
  label       text not null check (length(btrim(label)) > 0),
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  last_used_at timestamptz,
  use_count   bigint not null default 0
);

comment on table roster_share_links is
  'Links, die den Dienstplan ohne Anmeldung zeigen. Jeder Link kann einzeln '
  'widerrufen werden; sichtbar ist immer nur die laufende Woche.';

alter table roster_share_links enable row level security;

-- Anlegen und widerrufen duerfen Leitungen und Administratoren.
create policy manage_links on roster_share_links for all to authenticated
  using (public.is_lead() or public.is_admin())
  with check (public.is_lead() or public.is_admin());

-- =============================================================================
--  Ausgabe für den Link
-- -----------------------------------------------------------------------------
--  Bewusst eine einzige Funktion statt offener Leserechte: sie entscheidet, was
--  hinausgeht, und protokolliert die Nutzung. Bei ungueltigem oder widerrufenem
--  Token kommt NULL — kein Hinweis darauf, ob es den Token je gab.
-- =============================================================================

create or replace function public.roster_public(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link  roster_share_links%rowtype;
  v_monday date;
  v_week  roster_weeks%rowtype;
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

  -- Montag der laufenden Woche (ISO: Woche beginnt am Montag)
  v_monday := date_trunc('week', current_date)::date;

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

comment on function public.roster_public(text) is
  'Liefert die laufende Woche fuer einen gueltigen Freigabe-Link. Gibt NULL '
  'zurueck, wenn der Link unbekannt oder widerrufen ist.';

revoke all on function public.roster_public(text) from public;
grant execute on function public.roster_public(text) to anon, authenticated;
