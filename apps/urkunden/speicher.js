/**
 * Speicher für die freie Fassung des Urkundensystems.
 *
 * Dieselben Aufrufe wie die Fassung in der Plattform — boot, saveEvents,
 * saveSettings, saveBackground, clearBackground, cleanup. Die Oberfläche merkt
 * vom Unterschied nichts.
 *
 * Abgelegt wird im Browser, nicht auf einem Server. Das hat zwei Folgen, die
 * man kennen muss:
 *
 *   Jeder Rechner führt seine eigenen Events. Was am Counter angelegt wird,
 *   sieht der Rechner im Büro nicht. Für einen Abend mit einem Gerät ist das
 *   richtig; für zwei Leute, die gleichzeitig an derselben Liste arbeiten,
 *   nicht — dafür gibt es die Fassung in der Plattform.
 *
 *   Wer die Browserdaten löscht, löscht die Events mit. Deshalb werden sie
 *   beim Verlassen nicht stillschweigend weggeräumt, sondern erst nach der
 *   eingestellten Frist.
 */
(function () {
  'use strict';

  const SCHLUESSEL = {
    events: 'db-urkunden-events',
    einstellungen: 'db-urkunden-einstellungen',
    hintergrund: 'db-urkunden-hintergrund',
  };

  /** Aufbewahrungsdauer in Tagen — wie in der Plattform. */
  const FRIST_TAGE = 7;

  function melde(text, art) {
    if (typeof window.toast === 'function') window.toast(text, art);
  }

  /**
   * Lesen und Schreiben scheitern in manchen Lagen, ohne dass die Seite etwas
   * dafür kann: privates Fenster, gesperrte Website-Daten, voller Speicher.
   * Die Oberfläche soll dann weiterlaufen und nicht mit einer Ausnahme stehen
   * bleiben — nur sagen, dass nichts gesichert wurde.
   */
  function lies(schluessel, ersatz) {
    try {
      const roh = localStorage.getItem(schluessel);
      return roh ? JSON.parse(roh) : ersatz;
    } catch {
      return ersatz;
    }
  }

  function schreib(schluessel, wert) {
    try {
      localStorage.setItem(schluessel, JSON.stringify(wert));
      return true;
    } catch (err) {
      melde(
        err && err.name === 'QuotaExceededError'
          ? 'Der Speicher des Browsers ist voll. Alte Events löschen oder ein kleineres Hintergrundbild wählen.'
          : 'Konnte nicht gespeichert werden — der Browser lässt keine Daten zu.',
        'error',
      );
      return false;
    }
  }

  let uhr = null;

  const DB = {
    userId: 'lokal',

    async boot(S) {
      S.evs = lies(SCHLUESSEL.events, []);

      const cfg = lies(SCHLUESSEL.einstellungen, null);
      if (cfg) {
        if (cfg.fields && Object.keys(cfg.fields).length) S.cfs = cfg.fields;
        S.clf = cfg.locked === true;
        S.rm = cfg.mode || 'total';
      }

      const bg = lies(SCHLUESSEL.hintergrund, null);
      if (bg) S.cbg = bg;

      return true;
    },

    /**
     * Gesammelt und leicht verzögert: die Oberfläche ruft save() bei jeder
     * Punkteingabe, und jedes Mal den ganzen Bestand zu schreiben und zu
     * verpacken macht die Eingabe spürbar zäh.
     */
    saveEvents(events) {
      clearTimeout(uhr);
      uhr = setTimeout(() => schreib(SCHLUESSEL.events, events || []), 300);
    },

    async saveSettings({ fields, locked, mode }) {
      schreib(SCHLUESSEL.einstellungen, { fields, locked, mode });
    },

    async saveBackground(dataUrl) {
      if (!schreib(SCHLUESSEL.hintergrund, dataUrl)) {
        throw new Error('Das Hintergrundbild passt nicht in den Speicher des Browsers.');
      }
    },

    async clearBackground() {
      try {
        localStorage.removeItem(SCHLUESSEL.hintergrund);
      } catch {
        /* nichts zu tun — dann war auch nichts gespeichert */
      }
    },

    /**
     * Events, die älter sind als die Frist, entfernen. Gibt die Anzahl zurück,
     * damit die Oberfläche es melden kann.
     */
    async cleanup() {
      const alle = lies(SCHLUESSEL.events, []);
      const grenze = Date.now() - FRIST_TAGE * 24 * 60 * 60 * 1000;
      const bleibt = alle.filter((ev) => {
        const wann = ev && (ev.ca || Date.parse(ev.dt || ''));
        // Ohne verwertbares Datum bleibt der Eintrag. Lieber einer zu viel als
        // ein gelöschter, den jemand noch brauchte.
        return !wann || Number.isNaN(wann) || wann > grenze;
      });
      const weg = alle.length - bleibt.length;
      if (weg > 0) schreib(SCHLUESSEL.events, bleibt);
      return weg;
    },
  };

  window.DB = DB;
})();
