# Schritt 3 – Seitenstruktur und Benutzerführung

Leitgedanke: Der Mechaniker steht mit einem Tablet in der Hand hinter den Maschinen.
Jede Interaktion muss mit dem Daumen bedienbar sein, ohne Zoom, ohne Suchen.
Der komplette Montagsablauf soll unter fünf Minuten dauern.

---

## Navigation

Eine feste Kopfzeile mit fünf Zielen. Auf dem Tablet als Tab-Leiste, auf dem Desktop
als Seitenleiste. Mehr Ebenen gibt es nicht — alles Weitere sind Detailansichten.

| Bereich | Route | Zweck |
|---|---|---|
| Dashboard | `/wartung/` | Was ist heute zu tun? |
| Frame-Stände | `/wartung/eingabe` | Wöchentliche Erfassung |
| Wartung | `/wartung/bahn/:nr` | Checkliste und Abschluss |
| Historie | `/wartung/historie` | Nachweis und Suche |
| Einstellungen | `/wartung/einstellungen` | nur Admin sichtbar |

Zusätzlich global erreichbar: **Defekt melden** als Aktionsknopf in der Kopfzeile,
weil das jederzeit spontan passiert.

---

## 1. Dashboard

### Kopfbereich — Zusammenfassung

Eine Zeile mit fünf Zahlen, je als große Ziffer mit Beschriftung darunter.
Anklickbar, filtert die Liste darunter.

```
18 Bahnen    🔴 2 fällig    🟡 4 bald fällig    🟢 11 OK    ❓ 1 ungeklärt
```

Darunter, nur wenn zutreffend, zwei Hinweisbänder:

- `⚠ 3 Bahnen ohne Ablesung seit 12 Tagen` → führt direkt zur Eingabemaske
- `🔧 2 offene Defekte` → führt zur Defektliste

### Hauptbereich — „Diese Woche relevant"

Eine Liste von Bahnkarten, sortiert nach Dringlichkeit. Die Sortierung ist in
`compareLanes()` implementiert und lautet:

1. Bahnen mit **überfälliger** Wartung (die am stärksten überfällige zuerst)
2. Bahnen mit **exakt fälliger** Wartung
3. Bahnen mit **ungeklärtem** Wartungsstand oder ohne Ablesung
4. Bahnen mit **bald fälliger** Wartung (die knappste zuerst)
5. Alle übrigen Bahnen
6. Außer Betrieb genommene Bahnen (ganz am Ende, ausgegraut)

Bahnen mit Handlungsbedarf werden als volle Karte dargestellt, unauffällige Bahnen
weiter unten als kompakte Zeile. So steht oben nur, was wirklich zählt.

**Karte mit Handlungsbedarf:**

```
🔴 Bahn 7                                     105.430 Frames
   2 Wartungen fällig                         abgelesen 12.08.2026

   ● 25k   Fällig — 2.450 Frames überfällig
   ● 100k  Fällig
   ○ 50k   OK — noch 18.300
   ○ 500k  OK — noch 210.400
                                        [ Wartung öffnen → ]
```

**Kompakte Zeile ohne Handlungsbedarf:**

```
🟢 Bahn 1   84.250   25k ✓  50k 🟡 noch 4.800 (ca. 2 Wochen)  100k ✓  500k ✓
```

### Statusdarstellung

Nie nur Farbe. Jeder Status besteht immer aus **Farbe + Symbol + Text**:

| Status | Farbe | Symbol | Text |
|---|---|---|---|
| OK | grün | ● | `OK — noch 16.300` |
| Bald fällig | gelb | ▲ | `Bald fällig — noch 3.420 (ca. 2 Wochen)` |
| Fällig | rot | ■ | `Fällig` |
| Überfällig | rot | ■ | `Fällig — 2.450 Frames überfällig` |
| Unbekannt | grau | ? | `Wartungsstand unbekannt — bitte prüfen` |
| Keine Ablesung | grau | – | `Noch keine Frame-Eingabe` |

---

## 2. Frame-Stände eintragen

Die meistgenutzte Maske. Ziel: 18 Zahlen ohne Scrollen-Suchen, ohne Maus.

```
Wöchentliche Frame-Stände                     Ablesedatum: [ 17.08.2026 ]

  Bahn      Letzter Stand    Neuer Stand        Zuwachs
  Bahn 1    84.250           [    86.310 ]      +2.060   ✓
  Bahn 2    72.120           [    74.400 ]      +2.280   ✓
  Bahn 3    91.440           [           ]
  ...
  Bahn 18   68.900           [    68.900 ]      +0       ⚠ unverändert

                                    [ 18 Stände speichern ]
```

Bedienregeln:

- Eingabefelder mit `inputmode="numeric"`, Ziffernblock erscheint automatisch
- `Enter` und `Tab` springen zur nächsten Bahn, Reihenfolge ist die Bahnnummer
- Der Zuwachs wird live berechnet und sofort geprüft
- Teilweises Speichern ist erlaubt: leere Felder werden übersprungen, nicht verworfen
- Alles wird in einem einzigen Vorgang gespeichert; bei fehlender Verbindung
  wandert der Vorgang in die Offline-Warteschlange und geht später von selbst raus

### Prüfungen beim Speichern

| Fall | Verhalten |
|---|---|
| Wert **niedriger** als bisher | Blockierender Dialog (siehe unten) |
| Zuwachs > 3× der üblichen Wochenrate | Gelbe Warnung, Speichern trotzdem möglich |
| Zuwachs > absolutes Maximum (Standard 20.000) | Gelbe Warnung mit Tippfehler-Hinweis |
| Zuwachs = 0 | Grauer Hinweis „unverändert" — meist korrekt bei Ruhetagen |

### Dialog: Zähler niedriger als zuvor

```
Bahn 12: neuer Stand 1.240, bisher 318.640

Der neue Frame-Stand ist niedriger als der bisherige Stand.
Wurde der Zähler zurückgesetzt oder ausgetauscht?

  [ Abbrechen und korrigieren ]
  [ Zähler wurde zurückgesetzt ]
```

Bei „zurückgesetzt" folgt eine kurze Nachfrage — Grund (Reset / Zähler getauscht /
Pinsetter getauscht) und optional eine Notiz. Daraus entsteht eine neue Zähler-Epoche
mit `cumulative_offset = 318.640` und `counter_start = 1.240`.

**Wichtig für den Mechaniker sichtbar:** ein Hinweis, dass die Wartungshistorie dabei
vollständig erhalten bleibt. Genau an dieser Stelle entsteht sonst die Angst, etwas
kaputtzumachen.

---

## 3. Wartungsansicht einer Bahn

Erreichbar per Klick auf jede Bahn. Aufbau von oben nach unten:

```
← Zurück          Bahn 7          Bahnpaar 7-8

  105.430 Frames                  zuletzt abgelesen 12.08.2026
  ca. 2.100 Frames pro Woche

  ┌─ Fällige Wartung ───────────────────────────────────┐
  │ ■ 25.000 Frames        2.450 Frames überfällig      │
  │ ■ 100.000 Frames       fällig                       │
  └─────────────────────────────────────────────────────┘

  ┌─ Nicht fällig ──────────────────────────────────────┐
  │ ● 50.000 Frames        noch 18.300 (ca. 9 Wochen)   │
  │ ● 500.000 Frames       noch 210.400                 │
  └─────────────────────────────────────────────────────┘

  Offene Defekte (1)
  🔧 „Ball Elevator macht Geräusche" — gemeldet 09.08.2026

  Letzte Wartungen ›
```

Jeder fällige Block ist aufklappbar und enthält die Checkliste.

### Checkliste und Kaskade

Beim Öffnen der 100k-Wartung:

```
100.000 Frames — Wartung durchführen

  Aufgaben dieses Intervalls
  [✓] String-Wagon-Kette und Kettenführungen auf Verschleiß prüfen
  [✓] String-Wagon-Kette und Pivot Link schmieren
  [ ] Centering Cones und String Rollers auf Verschleiß prüfen
  [ ] Motorriemen des String Wagons prüfen
  [ ] Gate String auf Verschleiß prüfen

  ☑ Kleinere Intervalle mit erledigen
     Wird mitgemacht, weil du ohnehin an der Maschine bist.

     50.000 Frames
     [ ] Spannung der Pin-Schnüre prüfen und bei Bedarf einstellen
     [ ] Antriebsriemen des Ball Elevators prüfen      ⟨ Bahn 7-8 ⟩

     25.000 Frames
     [ ] Pins und Pin-Schnüre auf Verschleiß prüfen

  Mitarbeiter  [ Marco ▾ ]
  Notiz        [ String an Pin 7 beschädigt – nächste Woche tauschen. ]

                                      [ Wartung abschließen ]
```

Details, die im Alltag den Unterschied machen:

- Jede Aufgabe hat **drei** Zustände. Tippen schaltet auf erledigt; ein langer Druck
  bzw. das Symbol rechts setzt „nicht zutreffend" (nötig etwa beim Ball-Elevator-Riemen
  ohne Surface Return).
- Aufgaben mit Bahnpaar-Bezug tragen sichtbar den Vermerk `⟨ Bahn 7-8 ⟩` und werden
  beim Abschluss auf beide Bahnen geschrieben.
- Die Kaskade lässt sich als Ganzes abwählen, und jede kaskadierte Aufgabe zusätzlich
  einzeln. Wird ein Block vollständig abgewählt, entsteht für dieses Intervall auch
  kein Eintrag — der Anker bleibt stehen.
- Der Knopf ist **immer** anklickbar. Sind Aufgaben offen, heißt er
  **„Mit Abweichung abschließen"**, färbt sich gelb und verlangt eine Notiz.
  Das ist bewusst so: ein blockierter Knopf erzeugt nur falsche Häkchen.

### Bestätigung nach dem Abschluss

```
✓ Bahn 7 — 100k-Wartung abgeschlossen bei 105.430 Frames
  Nächste 100k-Wartung bei ca. 205.430 Frames (ca. Mai 2027)

  Mit erledigt: 50k und 25k
  Nächste 25k-Wartung bei ca. 130.430 Frames (ca. 12 Wochen)
```

---

## 4. Historie

Zwei Einstiege, dieselbe Komponente.

**Pro Bahn** (aus der Bahnansicht heraus) und **zentral** über die Navigation.
Filterleiste: Bahn · Wartungsintervall · Zeitraum · Mitarbeiter. Filter stehen in der
URL, damit ein Aufruf teilbar und der Zurück-Knopf brauchbar bleibt.

```
| Datum      | Bahn | Frames  | Wartung | Mitarbeiter | |
| 14.08.2026 | 4    | 127.450 | 25k     | Marco       | ⚠ Abweichung
| 03.06.2026 | 4    | 102.120 | 25k     | Marco       |
| 15.03.2026 | 4    | 101.340 | 100k    | Marco       |
| 15.03.2026 | 4    | 101.340 | 50k     | Marco       | ↳ mitkaskadiert
```

Kaskadierte Einträge stehen eingerückt unter ihrem Ursprung, statt die Liste zu fluten.
Ein Klick öffnet die Detailansicht mit allen Aufgaben und ihrem jeweiligen Ergebnis
(erledigt / nicht zutreffend / offen), der Notiz, dem Frame-Stand und dem Mitarbeiter.

Stornierte Einträge bleiben sichtbar, durchgestrichen, mit Stornogrund.

---

## 5. Einstellungen (Admin)

Vier Karteireiter:

1. **Bahnen** — Nummer, Bahnpaar, Status (aktiv / außer Betrieb / Renovierung)
2. **Wartungstypen** — Intervalle in Frames, zusätzliches Kalenderintervall in Tagen,
   Kaskadierung an/aus
3. **Aufgaben** — Titel, Reihenfolge, Geltungsbereich (Bahn / Bahnpaar), aktiv/inaktiv.
   Löschen gibt es nicht, nur Deaktivieren — sonst zerfällt die Historie.
4. **Allgemein** — Zählertyp und Einheit, Vorwarnzeit in Wochen, Plausibilitätsgrenzen,
   Benutzer und Rollen

Zusätzlich ein eigener Bereich **Korrekturen**: fehlerhafte Frame-Eingaben suchen und
richtigstellen. Die alte Zeile bleibt sichtbar und durchgestrichen, daneben steht die
Korrektur mit Grund, Zeitpunkt und Bearbeiter.

---

## 6. Ersteinrichtung

Ein Assistent, der einmalig durch alle 18 Bahnen führt. Pro Bahn eine Zeile:

```
Bahn 4
  Aktueller Frame-Stand         [ 127.450 ]

  Letzte Wartung bei Frame-Stand
  25k    [ 118.200 ]   ☐ unbekannt
  50k    [  98.000 ]   ☐ unbekannt
  100k   [         ]   ☑ unbekannt
  500k   [         ]   ☑ unbekannt
```

Angekreuztes „unbekannt" schreibt **keinen** Anker (kein Wert, nicht die Null). Diese
Kombination erscheint danach auf dem Dashboard dauerhaft als
`? Wartungsstand unbekannt — bitte prüfen`, bis der Mechaniker die Wartung einmal
regulär durchführt und damit den Anker setzt.

---

## Ablauf am Montagmorgen

1. App öffnen → Dashboard zeigt sofort den Zustand der letzten Woche
2. „Frame-Stände eintragen" → 18 Zahlen, ein Speichern
3. Dashboard rechnet neu und zeigt die Arbeitsliste
4. Erste rote Bahn antippen → Checkliste → abhaken → Notiz → abschließen
5. Zurück zum Dashboard, die Bahn ist grün, die nächste steht oben

Vier Bildschirme, kein Menü dazwischen.
