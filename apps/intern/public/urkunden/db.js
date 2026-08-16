/**
 * Speicherschicht des Urkundensystems.
 *
 * Vorher lag alles im localStorage des jeweiligen Browsers: jeder sah nur seine
 * eigenen Events, auf einem anderen Gerät war nichts da. Jetzt liegen die Daten
 * in derselben Datenbank wie der Rest der Plattform — mit derselben Anmeldung
 * und denselben Rechten.
 *
 * Die Oberfläche bleibt unverändert. Sie ruft weiterhin save(), saveCF() und
 * cleanup() auf; nur was dahinter passiert, ist ausgetauscht.
 */
(function () {
  const CONFIG_URL = '/urkunden/config.json';

  let client = null;
  let saveTimer = null;
  let lastError = null;

  /** Meldung einblenden, falls die Oberfläche schon bereit ist. */
  function notify(message, type) {
    if (typeof window.toast === 'function') window.toast(message, type);
    else console.warn(message);
  }

  async function getClient() {
    if (client) return client;
    const res = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Konfiguration nicht gefunden.');
    const cfg = await res.json();
    if (!cfg.url || !cfg.anonKey) throw new Error('Zugangsdaten fehlen.');
    // Kein eigener storageKey: die Sitzung liegt unter demselben Schluessel wie
    // in der Plattform, sonst gilt man hier als nicht angemeldet.
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  /** Datenbankzeile -> Form, die die Anwendung im Speicher hält. */
  function toEvent(row) {
    const data = row.data || {};
    return {
      id: row.id,
      name: row.name,
      dt: row.event_date,
      st: row.status || 'new',
      pl: data.pl || [],
      docs: data.docs || [],
      ca: data.ca || Date.parse(row.created_at) || Date.now(),
    };
  }

  function toRow(ev, userId) {
    return {
      id: ev.id,
      name: ev.name,
      event_date: ev.dt,
      status: ev.st || 'new',
      data: { pl: ev.pl || [], docs: ev.docs || [], ca: ev.ca || Date.now() },
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };
  }

  const DB = {
    userId: null,

    /**
     * Anmeldung prüfen und Daten laden. Ohne Sitzung geht es zurück zur
     * Plattform — die Anmeldemaske steht dort, es gibt hier keine zweite.
     */
    async boot(S) {
      const sb = await getClient();

      const { data: userData } = await sb.auth.getUser();
      if (!userData.user) {
        window.location.replace('/?weiter=/urkunden/');
        return false;
      }
      DB.userId = userData.user.id;

      const { data: allowed, error: rightsError } = await sb.rpc('has_module', {
        p_module: 'urkunden',
      });
      if (rightsError) throw new Error(rightsError.message);
      if (allowed !== true) {
        document.body.innerHTML =
          '<div style="padding:48px;font-family:system-ui;color:#eee;background:#1a1a1d;min-height:100vh">' +
          '<h1>Kein Zugriff auf die Urkunden</h1>' +
          '<p>Dein Konto ist für dieses Werkzeug nicht freigeschaltet. ' +
          'Ein Administrator kann das ändern.</p>' +
          '<p><a style="color:#e8b64c" href="/">Zurück zur Übersicht</a></p></div>';
        return false;
      }

      const [eventsRes, settingsRes] = await Promise.all([
        sb.from('cert_events').select('*').order('event_date', { ascending: false }),
        sb.from('cert_settings').select('*').single(),
      ]);
      if (eventsRes.error) throw new Error(eventsRes.error.message);

      S.evs = (eventsRes.data || []).map(toEvent);

      const cfg = settingsRes.data;
      if (cfg) {
        if (cfg.fields && Object.keys(cfg.fields).length) S.cfs = cfg.fields;
        S.clf = cfg.locked === true;
        S.rm = cfg.default_ranking_mode || 'total';
        if (cfg.background_path) {
          const { data: signed } = await sb.storage
            .from('cert-backgrounds')
            .createSignedUrl(cfg.background_path, 60 * 60 * 8);
          if (signed?.signedUrl) S.cbg = signed.signedUrl;
        }
      }
      return true;
    },

    /**
     * Alle Events sichern. Gesammelt und leicht verzögert, weil die Oberfläche
     * bei jeder Punkteingabe save() ruft — sonst gäbe es pro Tastendruck eine
     * Anfrage.
     */
    saveEvents(events) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try {
          const sb = await getClient();
          const rows = (events || []).map((ev) => toRow(ev, DB.userId));

          if (rows.length) {
            const { error } = await sb.from('cert_events').upsert(rows);
            if (error) throw new Error(error.message);
          }

          // In der Oberfläche gelöschte Events auch in der Datenbank entfernen.
          const keep = rows.map((r) => r.id);
          const del = sb.from('cert_events').delete();
          const { error: delError } = keep.length
            ? await del.not('id', 'in', `(${keep.join(',')})`)
            : await del.neq('id', '00000000-0000-0000-0000-000000000000');
          if (delError) throw new Error(delError.message);

          if (lastError) {
            lastError = null;
            notify('Verbindung wieder da — gespeichert.', 'success');
          }
        } catch (err) {
          lastError = err;
          notify('Nicht gespeichert: ' + err.message, 'error');
        }
      }, 600);
    },

    async saveSettings({ fields, locked, mode }) {
      try {
        const sb = await getClient();
        const { error } = await sb
          .from('cert_settings')
          .update({
            fields: fields ?? {},
            locked: locked === true,
            default_ranking_mode: mode || 'total',
            updated_at: new Date().toISOString(),
            updated_by: DB.userId,
          })
          .eq('id', true);
        if (error) throw new Error(error.message);
      } catch (err) {
        notify('Einstellung nicht gespeichert: ' + err.message, 'error');
      }
    },

    /** Hintergrundbild zentral ablegen, damit alle dasselbe Layout drucken. */
    async saveBackground(dataUrl) {
      const sb = await getClient();
      const blob = await (await fetch(dataUrl)).blob();
      const path = `hintergrund-${Date.now()}.jpg`;
      const { error } = await sb.storage.from('cert-backgrounds').upload(path, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: true,
      });
      if (error) throw new Error(error.message);
      await sb.from('cert_settings').update({ background_path: path }).eq('id', true);
      return path;
    },

    async clearBackground() {
      const sb = await getClient();
      await sb.from('cert_settings').update({ background_path: null }).eq('id', true);
    },

    /** Aufräumen erledigt die Datenbank — dieselbe Regel für alle. */
    async cleanup() {
      const sb = await getClient();
      const { data, error } = await sb.rpc('cert_cleanup');
      if (error) throw new Error(error.message);
      return data || 0;
    },

    async signOut() {
      const sb = await getClient();
      await sb.auth.signOut();
      window.location.replace('/');
    },
  };

  window.DB = DB;
})();
