-- =============================================================================
--  Geräte für Meldungen bei geschlossener App
-- -----------------------------------------------------------------------------
--  Eine Meldung, die auf dem Startbildschirm ankommt, kann nicht von der Seite
--  kommen — die läuft dann nicht. Sie wird von einem Dienst verschickt, und der
--  muss wissen, wohin. Genau das steht hier: je Gerät eine Adresse beim
--  Zustelldienst des Herstellers, plus die zwei Schlüssel, mit denen der Inhalt
--  für dieses Gerät verschlüsselt wird.
--
--  Der Inhalt der Meldung wird nirgends gespeichert. Was jemand arbeitet, steht
--  im Dienstplan; hier steht nur, wohin eine Nachricht gehen darf.
-- =============================================================================

create table if not exists push_geraete (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  /** Adresse beim Zustelldienst — je Gerät und Browser eine eigene. */
  endpunkt    text not null unique,
  /** Schlüssel des Geräts für die Verschlüsselung des Inhalts. */
  p256dh      text not null,
  auth        text not null,
  /** Woran man das Gerät wiedererkennt, wenn jemand aufräumen will. */
  bezeichnung text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  /**
   * Fehlversuche in Folge. Der Zustelldienst meldet ein abgemeldetes Gerät mit
   * 404 oder 410; danach wird der Eintrag entfernt. Ohne dieses Aufräumen
   * sammeln sich mit jedem neuen Telefon tote Adressen an.
   */
  fehler      int not null default 0
);

create index if not exists push_geraete_user_idx on push_geraete (user_id);

comment on table push_geraete is
  'Wohin Meldungen gehen duerfen, je Geraet. Kein Inhalt, nur Adresse und '
  'Schluessel.';

alter table push_geraete enable row level security;

-- Jeder verwaltet seine eigenen Geräte. Niemand sonst sieht sie — auch die
-- Leitung nicht: aus der Liste liesse sich ablesen, wer wann welches Geraet
-- benutzt.
drop policy if exists eigene_geraete on push_geraete;
create policy eigene_geraete on push_geraete for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
