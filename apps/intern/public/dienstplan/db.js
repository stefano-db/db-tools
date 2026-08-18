/**
 * Speicherschicht des Dienstplans.
 *
 * Vorher lag alles im localStorage des jeweiligen Rechners — jede Leitung hatte
 * ihren eigenen Plan, und niemand sonst sah ihn. Jetzt liegt er in der
 * gemeinsamen Datenbank, mit derselben Anmeldung wie der Rest der Plattform.
 *
 * Die Oberfläche bleibt unverändert. Sie ruft weiterhin saveData() und
 * loadData(); nur was dahinter passiert, ist ausgetauscht.
 *
 * Zwei Dinge sind bewusst anders als im Original:
 *   - Wochen werden unter ihrem Montagsdatum gespeichert, nicht unter einem
 *     Versatz zur aktuellen Woche. Ein Versatz bedeutet nächste Woche etwas
 *     anderes; die Daten würden mit der Zeit verrutschen.
 *   - Schichten hängen an der Kennung des Mitarbeiters, nicht an seiner Position
 *     in der Liste. Wird jemand gelöscht, verschieben sich sonst alle Schichten
 *     der vergangenen Wochen um eine Zeile.
 */
(function () {
  const CONFIG_URL = '/dienstplan/config.json';
  /** So viele Wochen vor und nach der aktuellen werden vorgeladen. */
  const RANGE = 12;

  let client = null;
  let saveTimer = null;

  function notify(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else console.warn(message);
  }

  async function getClient() {
    if (client) return client;
    const res = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Konfiguration nicht gefunden.');
    const cfg = await res.json();
    if (!cfg.url || !cfg.anonKey) throw new Error('Zugangsdaten fehlen.');
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  /** Montag zu einem Wochenversatz, als YYYY-MM-DD. */
  function mondayFor(offset) {
    const days = window.getWeek(offset);
    const d = days[0];
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }

  const DB = {
    userId: null,
    canEdit: false,
    /**
     * Was zuletzt fuer jede Woche geschrieben oder gelesen wurde: Montagsdatum
     * -> { json, version }. Daran erkennt das Speichern, was sich wirklich
     * geaendert hat, und mit welcher Fassung es aufsetzt.
     */
    stand: new Map(),
    /** Montagsdatum -> Wochenversatz, für den Weg zurück. */
    offsetOf: new Map(),

    async boot(state) {
      const sb = await getClient();

      const { data: userData } = await sb.auth.getUser();
      if (!userData.user) {
        window.location.replace('/?weiter=/dienstplan/');
        return false;
      }
      DB.userId = userData.user.id;

      const [{ data: mayRead }, { data: isLead }, { data: isAdmin }] = await Promise.all([
        sb.rpc('has_module', { p_module: 'dienstplan' }),
        sb.rpc('is_lead'),
        sb.rpc('is_admin'),
      ]);
      if (mayRead !== true) {
        document.body.innerHTML =
          '<div style="padding:48px;font-family:Inter,system-ui">' +
          '<h1>Kein Zugriff auf den Dienstplan</h1>' +
          '<p><a href="/">Zurück zur Übersicht</a></p></div>';
        return false;
      }
      DB.canEdit = isLead === true || isAdmin === true;

      // Zeitraum um die aktuelle Woche herum laden.
      const from = mondayFor(-RANGE);
      const to = mondayFor(RANGE);
      for (let off = -RANGE; off <= RANGE; off++) DB.offsetOf.set(mondayFor(off), off);

      const [empRes, weekRes, setRes] = await Promise.all([
        sb.from('roster_employees').select('*').eq('active', true).order('group_no').order('sort_order'),
        sb.from('roster_weeks').select('*').gte('week_start', from).lte('week_start', to),
        sb.from('roster_settings').select('*').single(),
      ]);
      if (empRes.error) throw new Error(empRes.error.message);

      // Erster Start: die im Editor hinterlegte Belegschaft übernehmen, damit
      // niemand 19 Namen von Hand neu eintippen muss.
      if ((empRes.data ?? []).length === 0 && DB.canEdit) {
        const seed = state.emps.map((e, i) => ({
          name: e.n,
          group_no: e.grp,
          target_days: e.vtg ?? 0,
          sort_order: i,
        }));
        const { data: created, error } = await sb.from('roster_employees').insert(seed).select('*');
        if (error) throw new Error(error.message);
        empRes.data = created;
      }

      state.emps = (empRes.data ?? []).map((r) => ({
        id: r.id,
        n: r.name,
        nc: 'white',
        grp: r.group_no,
        vtg: Number(r.target_days) || 0,
        d: Array.from({ length: 7 }, () => window.mkS('frei')),
        tot: '0:00',
      }));

      // Wochen unter ihrem Versatz ablegen, damit der Editor nichts merkt.
      state.weeks = {};
      DB.stand.clear();
      for (const row of weekRes.data ?? []) {
        const off = DB.offsetOf.get(row.week_start);
        if (off === undefined) continue;
        // Stand und Fassung merken: nur so laesst sich spaeter erkennen, was
        // sich wirklich geaendert hat und auf welcher Fassung es aufsetzt.
        DB.stand.set(row.week_start, {
          json: JSON.stringify(row.data ?? {}),
          version: row.version ?? 1,
        });
        state.weeks[off] = state.emps.map((e) => {
          const saved = row.data?.[e.id];
          return saved
            ? { d: saved.d.map((x) => ({ ...x })), tot: saved.tot }
            : { d: Array.from({ length: 7 }, () => window.mkS('frei')), tot: '0:00' };
        });
      }

      const cfg = setRes.data;
      if (cfg) {
        if (cfg.group_names && Object.keys(cfg.group_names).length) {
          Object.assign(window.GRP_NAMES, cfg.group_names);
        }
        if (cfg.group_colors && Object.keys(cfg.group_colors).length) {
          Object.assign(window.GRP_COLORS, cfg.group_colors);
        }
      }

      return true;
    },

    /**
     * Speichern.
     *
     * Drei Dinge, die vorher fehlten und bei einem Dienstplan nicht fehlen
     * duerfen:
     *
     *  - Es wird nur geschrieben, was sich geaendert hat. Vorher ging bei jeder
     *    Speicherung der gesamte Speicherinhalt hinaus — also auch die 24
     *    Wochen, die man nur beim Blaettern gesehen hat. Hatte inzwischen
     *    jemand anderes eine davon bearbeitet, war seine Arbeit weg, ohne dass
     *    es jemand bemerkte.
     *
     *  - Jede Woche wird mit ihrer Fassungsnummer geschrieben. Hat inzwischen
     *    jemand anderes gespeichert, lehnt die Datenbank ab und schickt den
     *    neuen Stand zurueck, statt ihn ueberschreiben zu lassen.
     *
     *  - Der Zustand wird gemeldet. Vorher sprang die Anzeige sofort auf
     *    „Gespeichert", waehrend die Anfrage noch lief — und blieb dort stehen,
     *    wenn sie fehlschlug.
     */
    save(state) {
      if (!DB.canEdit) return;
      clearTimeout(saveTimer);
      DB.melde('wartet');
      saveTimer = setTimeout(() => DB.schreibe(state), 700);
    },

    /** Wartende Aenderung sofort hinausschicken — etwa beim Schliessen. */
    flush(state) {
      if (!DB.canEdit) return Promise.resolve();
      clearTimeout(saveTimer);
      return DB.schreibe(state);
    },

    melde(zustand, text) {
      if (typeof DB.beiStatus === 'function') DB.beiStatus(zustand, text);
    },

    async schreibe(state) {
      try {
        const sb = await getClient();
        DB.melde('laeuft');

        for (const [off, list] of Object.entries(state.weeks)) {
          const monday = mondayFor(Number(off));
          const data = {};
          state.emps.forEach((e, i) => {
            if (list[i]) data[e.id] = { d: list[i].d, tot: list[i].tot };
          });

          const json = JSON.stringify(data);
          const bekannt = DB.stand.get(monday);
          // Unveraendert gegenueber dem eigenen letzten Stand: nicht anfassen.
          if (bekannt && bekannt.json === json) continue;

          const { data: antwort, error } = await sb.rpc('roster_week_speichern', {
            p_week_start: monday,
            p_data: data,
            p_version: bekannt ? bekannt.version : 0,
          });
          if (error) throw new Error(error.message);

          if (antwort && antwort.ok === false) {
            if (antwort.grund === 'keine_berechtigung') {
              throw new Error('Keine Berechtigung, den Plan zu ändern.');
            }
            // Jemand anderes war schneller. Nicht ueberschreiben, sondern den
            // fremden Stand uebernehmen und sichtbar machen.
            DB.uebernimm(state, Number(off), monday, antwort);
            DB.melde(
              'konflikt',
              'Diese Woche wurde inzwischen von jemand anderem geändert. Der neue Stand ist geladen.',
            );
            continue;
          }

          DB.stand.set(monday, { json, version: (antwort && antwort.version) || 1 });
        }

        const { error: setError } = await sb
          .from('roster_settings')
          .update({
            group_names: window.GRP_NAMES,
            group_colors: window.GRP_COLORS,
            updated_at: new Date().toISOString(),
            updated_by: DB.userId,
          })
          .eq('id', true);
        if (setError) throw new Error(setError.message);

        DB.melde('gespeichert');
      } catch (err) {
        DB.melde('fehler', String((err && err.message) || err));
        notify('⚠️ Nicht gespeichert: ' + ((err && err.message) || err));
      }
    },

    /** Fremden Stand in die laufende Ansicht holen. */
    uebernimm(state, off, monday, antwort) {
      const fremd = antwort.data || {};
      state.weeks[off] = state.emps.map((e) => {
        const eintrag = fremd[e.id];
        return eintrag
          ? { d: eintrag.d, tot: eintrag.tot }
          : { d: Array.from({ length: 7 }, () => ({ status: 'nein', b: '', e: '', std: '' })), tot: '0:00' };
      });
      DB.stand.set(monday, {
        json: JSON.stringify(fremd),
        version: antwort.version,
      });
      if (typeof DB.beiFremderAenderung === 'function') DB.beiFremderAenderung(off);
    },

    /** Mitarbeiterliste abgleichen — nach Anlegen, Löschen oder Umbenennen. */
    async saveEmployees(state) {
      if (!DB.canEdit) return;
      try {
        const sb = await getClient();

        const rows = state.emps.map((e, i) => ({
          id: e.id,
          name: e.n,
          group_no: e.grp,
          target_days: e.vtg ?? 0,
          sort_order: i,
          active: true,
        }));

        const withId = rows.filter((r) => r.id);
        const withoutId = rows.filter((r) => !r.id);

        if (withId.length) {
          const { error } = await sb.from('roster_employees').upsert(withId);
          if (error) throw new Error(error.message);
        }
        if (withoutId.length) {
          const { data, error } = await sb
            .from('roster_employees')
            .insert(withoutId.map(({ id, ...rest }) => rest))
            .select('*');
          if (error) throw new Error(error.message);
          // Kennungen nachtragen, sonst landen die Schichten im Nichts.
          let k = 0;
          state.emps.forEach((e) => {
            if (!e.id && data[k]) e.id = data[k++].id;
          });
        }

        // Entfernte werden stillgelegt, nicht geloescht — vergangene Wochen
        // sollen weiterhin zeigen, wer damals gearbeitet hat.
        const keep = state.emps.map((e) => e.id).filter(Boolean);
        if (keep.length) {
          const { error } = await sb
            .from('roster_employees')
            .update({ active: false })
            .eq('active', true)
            .not('id', 'in', `(${keep.join(',')})`);
          if (error) throw new Error(error.message);
        }
      } catch (err) {
        notify('⚠️ Mitarbeiter nicht gespeichert: ' + err.message);
      }
    },

    /**
     * Änderungen anderer sofort übernehmen. Ohne das säße eine Leitung vor einem
     * Plan, den jemand anderes längst geändert hat, und überschriebe ihn beim
     * nächsten Speichern.
     */
    async watch(onChange) {
      const sb = await getClient();
      sb.channel('dienstplan')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'roster_weeks' }, (payload) => {
          if (payload.new?.updated_by === DB.userId) return; // eigene Änderung
          onChange();
        })
        .subscribe();
    },
  };

  window.DB = DB;
})();
