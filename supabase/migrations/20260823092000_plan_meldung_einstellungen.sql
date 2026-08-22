-- =============================================================================
--  Einstellungen für den Versand — in einer Tabelle statt am Server
-- -----------------------------------------------------------------------------
--  Der erste Anlauf legte Adresse und Geheimwort als Datenbankparameter ab.
--  Das geht auf Supabase nicht: die Rolle, mit der man arbeitet, darf keine
--  Parameter der Datenbank setzen (permission denied to set parameter).
--
--  Also eine Tabelle. Sie hat Zeilenrechte, aber bewusst keine einzige Regel:
--  damit kommt über die Schnittstelle niemand heran — weder lesend noch
--  schreibend, unabhängig von der Rolle. Erreichbar ist sie nur aus dem
--  SQL-Editor und aus Funktionen, die mit Besitzerrechten laufen. Genau das
--  ist hier gewollt, denn in ihr steht das Geheimwort, mit dem sich der Ruf an
--  den Versanddienst ausweist.
-- =============================================================================

create table if not exists app_konfiguration (
  schluessel text primary key,
  wert       text not null,
  notiz      text,
  updated_at timestamptz not null default now()
);

comment on table app_konfiguration is
  'Werte, die der Betrieb braucht und niemand sehen soll. Ohne Zeilenregeln '
  'und damit ueber die Schnittstelle unerreichbar.';

alter table app_konfiguration enable row level security;
-- Keine Richtlinie: das ist die Absicht, kein Versehen.

-- =============================================================================
--  Der Auslöser liest jetzt von dort
-- =============================================================================
create or replace function public.plan_meldung_ausloesen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_geheim text;
begin
  select wert into v_url from app_konfiguration where schluessel = 'meldung_url';
  select wert into v_geheim from app_konfiguration where schluessel = 'meldung_secret';

  -- Ohne Einstellungen geschieht nichts. So laesst sich der Versand abschalten,
  -- ohne den Ausloeser zu entfernen, und ein frisch aufgesetztes Abbild der
  -- Datenbank verschickt nicht versehentlich Meldungen.
  if v_url is null or v_geheim is null then
    return null;
  end if;

  -- Hat sich am Inhalt nichts geaendert, gibt es nichts zu melden.
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-plan-secret', v_geheim
    ),
    body := jsonb_build_object(
      'week_start', new.week_start,
      'data', new.data,
      'old_data', case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end
    )
  );

  return null;
end $$;

comment on function public.plan_meldung_ausloesen() is
  'Stoesst den Versand der Meldungen an. Adresse und Geheimwort stehen in '
  'app_konfiguration; fehlt eines, geschieht nichts.';
