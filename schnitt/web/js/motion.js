// Motion-Engine, Phase 1.
// Datenmodell und Auswertung sind strikt vom Zeichnen getrennt:
//   MotionProp  = eine animierbare Eigenschaft mit Keyframes
//   evalProps() = wertet einen Satz Eigenschaften zur Zeit t aus
//   Springs     = physikalisch (Steifigkeit / Daempfung / Masse), nicht gefaked
// Alles ist aufloesungsunabhaengig: Werte sind Anteile der Sequenzgroesse.

// ---------------------------------------------------------------- Easing
export const Easing = {
  linear: t => t,
  easeIn: t => t * t * t,
  easeOut: t => 1 - Math.pow(1 - t, 3),
  easeInOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  hold: () => 0
}

/** Kubische Bezier-Kurve wie in CSS: cubicBezier(.2,.9,.3,1) -> f(t). */
export function cubicBezier (x1, y1, x2, y2) {
  const bez = (a, b) => t => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t
  const bx = bez(x1, x2)
  const by = bez(y1, y2)
  return t => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let lo = 0; let hi = 1; let mid = t
    for (let i = 0; i < 24; i++) {          // t -> Kurvenparameter invertieren
      mid = (lo + hi) / 2
      if (bx(mid) < t) lo = mid; else hi = mid
    }
    return by(mid)
  }
}

/**
 * Gedaempfte Feder als geschlossene Loesung.
 * Liefert f(tSek) in 0..~1 (schwingt ueber 1 hinaus und pendelt sich ein).
 */
export function spring ({ stiffness = 220, damping = 24, mass = 1, velocity = 0 } = {}) {
  const w0 = Math.sqrt(stiffness / mass)          // Eigenfrequenz
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    return t => {
      if (t <= 0) return 0
      const decay = Math.exp(-zeta * w0 * t)
      return 1 - decay * (Math.cos(wd * t) + ((zeta * w0 - velocity) / wd) * Math.sin(wd * t))
    }
  }
  return t => {                                    // kritisch/ueberdaempft
    if (t <= 0) return 0
    const decay = Math.exp(-w0 * t)
    return 1 - decay * (1 + (w0 - velocity) * t)
  }
}

/** Wie lange braucht diese Feder, bis sie praktisch ruht? */
export function springDuration (params = {}) {
  const { stiffness = 220, damping = 24, mass = 1 } = params
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  const w0 = Math.sqrt(stiffness / mass)
  return Math.min(4, Math.max(0.25, 4.6 / Math.max(0.15, zeta * w0)))
}

// ------------------------------------------------------------ Keyframes
/**
 * Eine animierbare Eigenschaft.
 * keys: [{ t, v, ease }] - t in Sekunden (relativ zum Clipanfang),
 * ease: Name aus Easing | {bezier:[..]} | {spring:{...}} (gilt fuer das
 * Segment, das bei diesem Keyframe BEGINNT).
 */
export function evalProp (keys, t, fallback = 0) {
  if (!keys || !keys.length) return fallback
  if (t <= keys[0].t) return keys[0].v
  const last = keys[keys.length - 1]
  if (t >= last.t && !last.easeAfter) {
    // Feder am letzten Keyframe darf weiterschwingen
    if (last.ease?.spring) {
      const prev = keys[keys.length - 2]
      if (prev) {
        const f = spring(last.ease.spring)
        return prev.v + (last.v - prev.v) * f(t - prev.t)
      }
    }
    return last.v
  }
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]
    const b = keys[i]
    if (t > b.t) continue
    const seg = Math.max(b.t - a.t, 1e-6)
    const p = (t - a.t) / seg
    let f
    if (b.ease?.spring) {
      // Feder laeuft in Echtzeit ab dem Segmentanfang
      f = spring(b.ease.spring)
      return a.v + (b.v - a.v) * f(t - a.t)
    }
    if (b.ease?.bezier) f = cubicBezier(...b.ease.bezier)
    else f = Easing[b.ease] ?? Easing.easeOut
    return a.v + (b.v - a.v) * f(p)
  }
  return last.v
}

/**
 * Einen ganzen Eigenschaften-Satz auswerten.
 * props: { x: keys, y: keys, scale: keys, rotation: keys, opacity: keys, blur: keys }
 * Rueckgabe mit sinnvollen Standardwerten.
 */
export function evalProps (props, t) {
  return {
    x: evalProp(props?.x, t, 0),            // Anteil der Breite
    y: evalProp(props?.y, t, 0),            // Anteil der Hoehe
    scale: evalProp(props?.scale, t, 1),
    rotation: evalProp(props?.rotation, t, 0),   // Grad
    opacity: evalProp(props?.opacity, t, 1),
    blur: evalProp(props?.blur, t, 0)       // Anteil der Elementgroesse
  }
}

// ------------------------------------------------------ Motion-Presets
/**
 * Vorgefertigte Eingangs-Animationen. dur skaliert das Tempo,
 * out = true haengt eine weiche Ausblendung ans Clipende (dur2).
 */
export const MOTION_PRESETS = {
  /** Apple Pop In: Scale 0.85 -> ueberschwingen -> 1, Y +8% -> 0, Blur raus. */
  popIn (dur = 0.6, spr = null) {
    const s = { spring: spr ?? { stiffness: 220, damping: 22, mass: 1 } }
    return {
      opacity: [{ t: 0, v: 0 }, { t: dur * 0.55, v: 1, ease: 'easeOut' }],
      scale: [{ t: 0, v: 0.85 }, { t: dur, v: 1, ease: s }],
      y: [{ t: 0, v: 0.08 }, { t: dur, v: 0, ease: s }],
      blur: [{ t: 0, v: 0.12 }, { t: dur * 0.8, v: 0, ease: 'easeOut' }]
    }
  },
  /** Float Up: von unten, weiche Verzoegerung. */
  floatUp (dur = 0.7) {
    return {
      opacity: [{ t: 0, v: 0 }, { t: dur * 0.7, v: 1, ease: 'easeOut' }],
      y: [{ t: 0, v: 0.1 }, { t: dur, v: 0, ease: { bezier: [0.16, 1, 0.3, 1] } }]
    }
  },
  /** Blur Reveal: aus der Unschaerfe. */
  blurReveal (dur = 0.8) {
    return {
      opacity: [{ t: 0, v: 0 }, { t: dur * 0.6, v: 1, ease: 'easeOut' }],
      scale: [{ t: 0, v: 0.92 }, { t: dur, v: 1, ease: { bezier: [0.16, 1, 0.3, 1] } }],
      blur: [{ t: 0, v: 0.25 }, { t: dur, v: 0, ease: 'easeOut' }]
    }
  },
  /** Spring Pop: kraeftige Feder ohne Blur. */
  springPop (dur = 0.5, spr = null) {
    const s = { spring: spr ?? { stiffness: 320, damping: 18, mass: 1 } }
    return {
      opacity: [{ t: 0, v: 0 }, { t: dur * 0.35, v: 1, ease: 'easeOut' }],
      scale: [{ t: 0, v: 0.7 }, { t: dur, v: 1, ease: s }]
    }
  },
  /** Apple Slide: seitlich mit sanfter Deceleration. */
  slide (dur = 0.7, dir = 1) {
    return {
      opacity: [{ t: 0, v: 0 }, { t: dur * 0.6, v: 1, ease: 'easeOut' }],
      x: [{ t: 0, v: 0.07 * dir }, { t: dur, v: 0, ease: { bezier: [0.16, 1, 0.3, 1] } }]
    }
  }
}

/** Weiche Standard-Ausblendung an das Ende eines Clips haengen. */
export function withExit (props, clipDur, exitDur = 0.5) {
  const start = Math.max(0, clipDur - exitDur)
  const out = { ...props }
  out.opacity = [...(props.opacity ?? [{ t: 0, v: 1 }])]
  out.opacity.push({ t: start, v: 1, ease: 'linear' }, { t: clipDur, v: 0, ease: 'easeInOut' })
  return out
}
