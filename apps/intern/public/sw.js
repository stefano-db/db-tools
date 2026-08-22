/**
 * Dienst im Hintergrund.
 *
 * Er läuft auch dann, wenn niemand die Seite offen hat — das ist der ganze
 * Zweck: eine Meldung, die auf dem Startbildschirm ankommt, kann nicht von der
 * Seite selbst kommen, denn die läuft dann nicht.
 *
 * Er tut bewusst wenig. Alles, was er anzeigt, hat der Server schon
 * entschieden; hier wird nur ausgepackt und dargestellt. Je weniger hier
 * geschieht, desto weniger kann schiefgehen an einer Stelle, die niemand sieht.
 */

self.addEventListener('install', () => {
  // Sofort übernehmen statt auf das Schließen aller Fenster zu warten.
  self.skipWaiting();
});

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(self.clients.claim());
});

/**
 * Wohin ein Tippen führen darf.
 *
 * Nur auf diese Seite, nie nach draußen. Der Weg kommt aus der Meldung, und
 * eine Meldung kommt über fremde Rechner — die von Apple und Google. Ohne
 * diese Schranke wäre ein Fingertipp auf eine gefälschte Meldung ein Sprung
 * auf eine fremde Seite, die aussieht wie diese hier und nach dem Passwort
 * fragt. Zwei Schrägstriche am Anfang zählen als draußen: //fremde.seite ist
 * eine vollständige Adresse, keine Unterseite.
 */
function nurHier(ziel) {
  return typeof ziel === 'string' && ziel.startsWith('/') && !ziel.startsWith('//')
    ? ziel
    : '/dienstplan';
}

self.addEventListener('push', (ereignis) => {
  let inhalt = { titel: 'Dream Bowl', text: 'Es gibt eine Änderung.', ziel: '/dienstplan' };
  try {
    if (ereignis.data) inhalt = { ...inhalt, ...ereignis.data.json() };
  } catch {
    // Kein JSON? Dann bleibt die allgemeine Meldung stehen — lieber eine
    // schlichte Nachricht als gar keine.
  }

  ereignis.waitUntil(
    self.registration.showNotification(inhalt.titel, {
      body: inhalt.text,
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      // Gleiche Kennung: eine neue Meldung ersetzt die alte, statt sich zu
      // stapeln. Wer zehnmal etwas ändert, soll nicht zehn Zeilen erzeugen.
      tag: 'dienstplan',
      renotify: true,
      data: { ziel: nurHier(inhalt.ziel) },
    }),
  );
});

self.addEventListener('notificationclick', (ereignis) => {
  ereignis.notification.close();
  const ziel = nurHier(ereignis.notification.data?.ziel);

  ereignis.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenster) => {
      // Ist die App schon offen, dorthin wechseln statt ein zweites Fenster
      // aufzumachen.
      for (const f of fenster) {
        if ('focus' in f) {
          f.navigate?.(ziel);
          return f.focus();
        }
      }
      return self.clients.openWindow(ziel);
    }),
  );
});
