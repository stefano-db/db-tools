// Icon-Bibliothek: schlichte Linien-Icons, keine Emojis.
const svg = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`

export const ICON = {
  // Kategorien
  media: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M3 16.5l5-4.5 4.5 4 3.5-3 5 4.5"/>'),
  text: svg('<path d="M6 7V5h12v2M12 5v14M9.5 19h5"/>'),
  mg: svg('<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><circle cx="19" cy="18" r="2"/>'),
  trans: svg('<rect x="3" y="3" width="10" height="10" rx="2.5"/><rect x="11" y="11" width="10" height="10" rx="2.5"/>'),
  fx: svg('<path d="M3 12c2.6-5.4 5.2 5.4 7.8 0s5.2 5.4 7.8 0"/>'),

  // Werkzeuge
  cut: svg('<circle cx="6" cy="6.5" r="2.2"/><circle cx="6" cy="17.5" r="2.2"/><path d="M7.8 8L20 19M7.8 16L20 5"/>'),
  trash: svg('<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5M10 11v6M14 11v6"/>'),
  magnet: svg('<path d="M7 3v7a5 5 0 0010 0V3"/><path d="M7 7h3.5M13.5 7H17"/>'),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  zoomIn: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20.5 20.5L16 16M8.5 11h5M11 8.5v5"/>'),
  zoomOut: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20.5 20.5L16 16M8.5 11h5"/>'),
  fit: svg('<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),

  // Wiedergabe
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>'),
  pause: svg('<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/>'),
  skipBack: svg('<path d="M6.5 5v14" /><path d="M19 5.5v13L9 12z" fill="currentColor" stroke="none"/>'),

  // Kopfzeile
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>'),
  save: svg('<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 4v5h7M8 20v-6h8v6"/>'),
  exportIcon: svg('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>'),
  folder: svg('<path d="M3 7a2 2 0 012-2h4l2 2.5h9a1.5 1.5 0 011.5 1.5V17a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5"/>'),

  // Spuren
  eye: svg('<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.4"/>'),
  eyeOff: svg('<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z"/><path d="M4 4l16 16"/>'),
  sound: svg('<path d="M4.5 9.5v5h3.5l4.5 3.5v-12L8 9.5H4.5z"/><path d="M16 9a4.5 4.5 0 010 6"/>'),
  soundOff: svg('<path d="M4.5 9.5v5h3.5l4.5 3.5v-12L8 9.5H4.5z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>'),

  // Uebergaenge
  tCut: svg('<circle cx="6" cy="6.5" r="2.2"/><circle cx="6" cy="17.5" r="2.2"/><path d="M7.8 8L20 19M7.8 16L20 5"/>'),
  tFade: svg('<rect x="3.5" y="3.5" width="11" height="11" rx="2.5" stroke-dasharray="2.5 2.5"/><rect x="9.5" y="9.5" width="11" height="11" rx="2.5"/>'),
  tBlack: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 000 17z" fill="currentColor" stroke="none"/>'),
  tLeft: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M15.5 12H8M11 9l-3 3 3 3"/>'),
  tRight: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M8.5 12H16M13 9l3 3-3 3"/>'),
  tUp: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M12 15.5V8.5M9 11.5l3-3 3 3"/>'),
  tCircle: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" stroke-dasharray="2.5 2"/>'),

  // Effekte
  fxNone: svg('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'),
  fxRight: svg('<path d="M3.5 12H18M14.5 8l4 4-4 4"/>'),
  fxLeft: svg('<path d="M20.5 12H6M9.5 8l-4 4 4 4"/>'),

  // Grafik-Vorlagen
  mgTitle: svg('<path d="M5 7V5h14v2M12 5v10"/><path d="M8 19h8" stroke-dasharray="1.5 2"/>'),
  mgTracking: svg('<path d="M4 12h1.5M9 12h1.5M14 12h1.5M19 12h1"/><path d="M4 6h16M4 18h16" stroke-dasharray="1 3"/>'),
  mgLower: svg('<path d="M5 8v8"/><path d="M9 9.5h11M9 14.5h7"/>'),
  mgBadge: svg('<rect x="3.5" y="8.5" width="17" height="7" rx="3.5"/>'),
  mgLine: svg('<path d="M7 9h10"/><path d="M4.5 15h15"/>'),
  mgCard: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9.5h8M8 12.5h5"/><rect x="8" y="15" width="5" height="2" rx="1" fill="currentColor" stroke="none"/>'),
  mgButtons: svg('<rect x="3" y="9" width="8.5" height="6" rx="3"/><rect x="13.5" y="9" width="7.5" height="6" rx="3"/>'),
  mgCallout: svg('<rect x="4" y="6" width="16" height="12" rx="2.5" stroke-dasharray="3 2.5"/>'),
  mgArrow: svg('<path d="M4 12h13M13 6.5L19.5 12 13 17.5"/>'),
  mgUiCard: svg('<rect x="4" y="3.5" width="16" height="17" rx="3"/><rect x="7" y="6.5" width="10" height="5.5" rx="1.5"/><path d="M7 15h10M7 17.5h6"/>'),
  mgCursor: svg('<path d="M6 3l12 10.5-5.5.8 3 5.7-2.8 1.5-3-5.8-3.7 4z" fill="currentColor" stroke="none"/>'),
  mgTouch: svg('<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="7.5" stroke-dasharray="3 3"/>'),
  duck: svg('<path d="M12 3v7M9 7l3 3 3-3"/><path d="M3 16c2.5-4.5 5 4.5 7.5 0s5 4.5 7.5 0"/>'),
  mgFocus: svg('<path d="M8 4H5a1 1 0 00-1 1v3M16 4h3a1 1 0 011 1v3M8 20H5a1 1 0 01-1-1v-3M16 20h3a1 1 0 001-1v-3"/><rect x="8.5" y="9" width="7" height="6" rx="1.5"/>')
}
