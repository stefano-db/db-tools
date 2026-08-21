// Motion Graphics im Apple-Stil: cleane Typografie, Blur, sanftes Easing.
// Jedes Preset ist ein Canvas-Renderer - Vorschau UND Export nutzen exakt
// denselben Code (der Export rendert die Frames im Browser vor).

import { evalProps, MOTION_PRESETS, withExit, spring } from './motion.js'

export const MG_PRESETS = [
  {
    id: 'title',
    label: 'Großer Titel',
    fields: ['text', 'sub'],
    defaults: { text: 'Titel', sub: 'Untertitel', color: '#ffffff', accent: '#8e8e93', size: 0.16, speed: 1 }
  },
  {
    id: 'tracking',
    label: 'Spreizen',
    fields: ['text'],
    defaults: { text: 'EINLEITUNG', color: '#ffffff', accent: '#00d3c8', size: 0.10, speed: 1 }
  },
  {
    id: 'lowerthird',
    label: 'Bauchbinde',
    fields: ['text', 'sub'],
    defaults: { text: 'Name', sub: 'Beschreibung', color: '#ffffff', accent: '#00d3c8', size: 0.09, speed: 1 }
  },
  {
    id: 'badge',
    label: 'Kapsel',
    fields: ['text'],
    defaults: { text: 'NEU', color: '#04211f', accent: '#00d3c8', size: 0.08, speed: 1 }
  },
  {
    id: 'line',
    label: 'Linie',
    fields: ['text'],
    defaults: { text: 'Kapitel Eins', color: '#ffffff', accent: '#00d3c8', size: 0.09, speed: 1 }
  },
  {
    id: 'card',
    label: 'Karte',
    fields: ['text', 'sub'],
    defaults: { text: 'Titel', sub: 'Kurze Beschreibung dazu', color: '#ffffff', accent: '#00d3c8', size: 0.09, speed: 1 }
  },
  {
    id: 'buttons',
    label: 'Buttons',
    fields: ['text', 'sub'],
    defaults: { text: 'Jetzt starten', sub: 'Mehr erfahren', color: '#04211f', accent: '#00d3c8', size: 0.07, speed: 1 }
  },
  {
    id: 'callout',
    label: 'Rahmen',
    fields: ['text'],
    defaults: { text: 'Hinweis', color: '#ffffff', accent: '#00d3c8', size: 0.06, speed: 1 }
  },
  {
    id: 'uicard',
    label: 'App-Karte',
    fields: ['text', 'sub'],
    defaults: { text: 'Songtitel', sub: 'Künstler', color: '#ffffff', accent: '#00d3c8', size: 0.1, speed: 1 }
  },
  {
    id: 'notification',
    label: 'Mitteilung',
    fields: ['text', 'sub'],
    defaults: { text: 'Neue Nachricht', sub: 'Hier steht der Text der Mitteilung', color: '#ffffff', accent: '#00d3c8', size: 0.08, speed: 1 }
  },
  {
    id: 'stat',
    label: 'Statistik',
    fields: ['text', 'sub'],
    defaults: { text: '+28 %', sub: 'Wachstum pro Monat', color: '#ffffff', accent: '#00d3c8', size: 0.12, speed: 1 }
  },
  {
    id: 'cursor',
    label: 'Zeiger',
    fields: [],
    defaults: { text: '', color: '#ffffff', accent: '#00d3c8', size: 0.07, speed: 1 }
  },
  {
    id: 'touch',
    label: 'Touch',
    fields: [],
    defaults: { text: '', color: '#ffffff', accent: '#00d3c8', size: 0.08, speed: 1 }
  },
  {
    id: 'focus',
    label: 'Fokus',
    fields: [],
    defaults: { text: '', color: '#ffffff', accent: '#00d3c8', size: 0.08, speed: 1 }
  },
  {
    id: 'arrow',
    label: 'Pfeil',
    fields: ['text'],
    defaults: { text: 'Hier ansehen', color: '#ffffff', accent: '#00d3c8', size: 0.07, speed: 1 }
  }
]

const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif'
const clamp01 = x => Math.min(1, Math.max(0, x))
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3)
const easeOutBack = x => { const c = 1.70158; const t = clamp01(x) - 1; return 1 + (c + 1) * t * t * t + c * t * t }

/** Ein- und Ausstiegs-Fortschritt (0..1) fuer die Cliplaenge. */
function phases (lt, dur, speed) {
  const inDur = Math.min(0.9 / (speed || 1), dur * 0.45)
  const outDur = Math.min(0.6 / (speed || 1), dur * 0.35)
  return {
    pIn: lt === Infinity ? 1 : clamp01(lt / inDur),
    pOut: clamp01((dur - lt) / outDur),
    inDur,
    outDur
  }
}

function fontStr (weight, px) { return `${weight} ${px}px ${FONT}` }

/**
 * Groesse des Elements (unskaliert) in Canvas-Pixeln.
 * ctx dient nur zum Messen.
 */
export function mgMeasure (ctx, mg, H) {
  const px = (mg.size ?? 0.1) * H
  ctx.font = fontStr(700, px)
  const wText = ctx.measureText(mg.text ?? '').width
  switch (mg.preset) {
    case 'title': {
      ctx.font = fontStr(500, px * 0.42)
      const wSub = mg.sub ? ctx.measureText(mg.sub).width : 0
      return { w: Math.max(wText, wSub) + px * 0.4, h: px * (mg.sub ? 2.1 : 1.4) }
    }
    case 'tracking': {
      const spread = px * 0.06 * (mg.text ?? '').length
      return { w: wText + spread + px * 0.6, h: px * 1.5 }
    }
    case 'lowerthird': {
      ctx.font = fontStr(400, px * 0.55)
      const wSub = mg.sub ? ctx.measureText(mg.sub).width : 0
      return { w: Math.max(wText, wSub) + px * 1.2, h: px * (mg.sub ? 2.0 : 1.3) }
    }
    case 'badge': {
      ctx.font = fontStr(700, px * 0.8)
      return { w: ctx.measureText(mg.text ?? '').width + px * 1.6, h: px * 1.5 }
    }
    case 'line': return { w: Math.max(wText * 1.25, px * 3), h: px * 2.0 }
    case 'cursor': return { w: px * 2.4, h: px * 2.4 }
    case 'touch': return { w: px * 2.6, h: px * 2.6 }
    case 'focus': return { w: px * 7, h: px * 4 }
    case 'card': {
      ctx.font = fontStr(400, px * 0.5)
      const wSub = mg.sub ? ctx.measureText(mg.sub).width : 0
      return { w: Math.max(wText, wSub, px * 4) + px * 1.6, h: px * (mg.sub ? 3.6 : 2.8) }
    }
    case 'buttons': {
      ctx.font = fontStr(600, px * 0.7)
      const w1 = ctx.measureText(mg.text ?? '').width + px * 1.4
      const w2 = mg.sub ? ctx.measureText(mg.sub).width + px * 1.4 : 0
      return { w: w1 + (w2 ? w2 + px * 0.5 : 0), h: px * 1.6 }
    }
    case 'callout': return { w: px * 7, h: px * 4.4 }
    case 'notification': {
      ctx.font = fontStr(700, px * 0.62)
      const wT = ctx.measureText(mg.text ?? '').width
      ctx.font = fontStr(400, px * 0.5)
      const wS = mg.sub ? ctx.measureText(mg.sub).width : 0
      return { w: Math.max(px * 6, Math.max(wT, wS) + px * 1.6), h: px * 3.2 }
    }
    case 'stat': {
      ctx.font = fontStr(800, px)
      const wT = ctx.measureText(mg.text ?? '').width
      ctx.font = fontStr(400, px * 0.38)
      const wS = mg.sub ? ctx.measureText(mg.sub).width : 0
      return { w: Math.max(px * 4.6, Math.max(wT, wS) + px * 1.4), h: px * 3.4 }
    }
    case 'uicard': {
      ctx.font = fontStr(700, px * 0.62)
      const wT = ctx.measureText(mg.text ?? '').width
      ctx.font = fontStr(400, px * 0.46)
      const wS = mg.sub ? ctx.measureText(mg.sub).width : 0
      return { w: Math.max(px * 6.4, Math.max(wT, wS) + px * 3.6), h: px * 3.1 }
    }
    case 'arrow': return { w: Math.max(wText + px, px * 5), h: px * 2.4 }
    default: return { w: wText, h: px * 1.4 }
  }
}

/**
 * Preset zeichnen. (cx, cy) = Mittelpunkt, scale = Groessenfaktor,
 * alpha = Gesamt-Deckkraft, lt = lokale Zeit im Clip, dur = Cliplaenge.
 */
export function mgRender (ctx, mg, lt, dur, cx, cy, scale, alpha) {
  const H = ctx.canvas.height
  const W = ctx.canvas.width

  // Versatz (Stagger): Element beginnt spaeter, endet mit dem Clip
  const anim = mg.anim ?? {}
  const delay = Math.max(0, anim.delay ?? 0)
  const ltA = lt - delay
  if (ltA < 0) return

  // Waehlbarer Eingang: ersetzt die eingebaute Entstehung des Presets
  let wrapM = null
  const wp = anim.preset && anim.preset !== 'auto' ? anim.preset : null
  if (wp) {
    const spr = { stiffness: anim.stiffness ?? 220, damping: anim.damping ?? 22, mass: 1 }
    const d2 = anim.dur ?? 0.65
    const make = {
      popIn: () => MOTION_PRESETS.popIn(d2, spr),
      floatUp: () => MOTION_PRESETS.floatUp(d2),
      blurReveal: () => MOTION_PRESETS.blurReveal(d2),
      springPop: () => MOTION_PRESETS.springPop(d2, spr),
      slideL: () => MOTION_PRESETS.slide(d2, -1),
      slideR: () => MOTION_PRESETS.slide(d2, 1)
    }[wp]
    if (make) wrapM = evalProps(make(), ltA)
  }
  if (wrapM) {
    cx += wrapM.x * W
    cy += wrapM.y * H
    scale *= wrapM.scale
    alpha *= wrapM.opacity
    if (alpha <= 0.002) return
  }

  const px = (mg.size ?? 0.1) * H * scale
  const { pIn } = phases(wrapM ? Infinity : ltA, dur, mg.speed)
  const { pOut } = phases(lt, dur, mg.speed)
  const eIn = easeOut(pIn)
  const color = mg.color ?? '#ffffff'
  const accent = mg.accent ?? '#00d3c8'
  const a = alpha * pOut

  ctx.save()
  if (wrapM && wrapM.blur > 0.003) ctx.filter = `blur(${(wrapM.blur * px * 3).toFixed(1)}px)`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  switch (mg.preset) {
    case 'title': {
      // Apple-Keynote-Klassiker: aus der Unschaerfe, minimal groesser startend
      const blur = (1 - eIn) * px * 0.35 + (1 - pOut) * px * 0.25
      const s = 1 + 0.07 * (1 - eIn)
      ctx.globalAlpha = a * eIn
      if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`
      ctx.font = fontStr(700, px * s)
      ctx.fillStyle = color
      ctx.fillText(mg.text ?? '', cx, mg.sub ? cy - px * 0.34 : cy)
      if (mg.sub) {
        const subIn = easeOut(clamp01(pIn * 1.4 - 0.25))
        ctx.globalAlpha = a * subIn
        ctx.font = fontStr(500, px * 0.42 * s)
        ctx.fillStyle = accent
        ctx.fillText(mg.sub, cx, cy + px * 0.52)
      }
      break
    }
    case 'tracking': {
      // Buchstaben schweben aus der Spreizung zusammen
      const text = mg.text ?? ''
      const spacing = px * (0.6 * (1 - eIn) + 0.06)
      ctx.font = fontStr(600, px)
      ctx.fillStyle = color
      ctx.globalAlpha = a * eIn
      const widths = [...text].map(ch => ctx.measureText(ch).width)
      const total = widths.reduce((s, w) => s + w, 0) + spacing * (text.length - 1)
      let x = cx - total / 2
      ;[...text].forEach((ch, i) => {
        ctx.fillText(ch, x + widths[i] / 2, cy)
        x += widths[i] + spacing
      })
      break
    }
    case 'lowerthird': {
      // Balken waechst, Zeilen gleiten nach - links ausgerichtet
      ctx.textAlign = 'left'
      ctx.font = fontStr(700, px)
      const wTitle = ctx.measureText(mg.text ?? '').width
      ctx.font = fontStr(400, px * 0.55)
      const wSub = mg.sub ? ctx.measureText(mg.sub).width : 0
      const blockW = Math.max(wTitle, wSub) + px * 1.2
      const blockH = px * (mg.sub ? 2.0 : 1.3)
      const left = cx - blockW / 2
      const barH = blockH * eIn
      ctx.globalAlpha = a
      ctx.fillStyle = accent
      roundRect(ctx, left, cy - barH / 2, px * 0.14, barH, px * 0.07)
      ctx.fill()
      const slide = px * 0.5 * (1 - eIn)
      const tIn = easeOut(clamp01(pIn * 1.3 - 0.15))
      ctx.globalAlpha = a * tIn
      ctx.fillStyle = color
      ctx.font = fontStr(700, px)
      ctx.fillText(mg.text ?? '', left + px * 0.5 + slide, mg.sub ? cy - px * 0.32 : cy)
      if (mg.sub) {
        const sIn = easeOut(clamp01(pIn * 1.3 - 0.3))
        ctx.globalAlpha = a * sIn
        ctx.font = fontStr(400, px * 0.55)
        ctx.fillStyle = 'rgba(255,255,255,.72)'
        ctx.fillText(mg.sub, left + px * 0.5 + slide * 1.4, cy + px * 0.45)
      }
      break
    }
    case 'badge': {
      // Kapsel ploppt mit leichtem Ueberschwingen auf
      const s = pIn >= 1 ? 1 : 0.5 + 0.5 * easeOutBack(pIn)
      ctx.font = fontStr(700, px * 0.8 * s)
      const w = ctx.measureText(mg.text ?? '').width + px * 1.6 * s
      const h = px * 1.5 * s
      ctx.globalAlpha = a * clamp01(pIn * 2)
      ctx.fillStyle = accent
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2)
      ctx.fill()
      ctx.fillStyle = mg.color ?? '#04211f'
      ctx.fillText(mg.text ?? '', cx, cy + px * 0.03)
      break
    }
    case 'card': {
      // Glas-Karte: skaliert leicht aus der Unschaerfe, Inhalt folgt gestaffelt
      const s = 0.93 + 0.07 * eIn
      const blur = (1 - eIn) * px * 0.3
      ctx.font = fontStr(700, px)
      const wTitle = ctx.measureText(mg.text ?? '').width
      ctx.font = fontStr(400, px * 0.5)
      const wSub = mg.sub ? ctx.measureText(mg.sub).width : 0
      const w = (Math.max(wTitle, wSub, px * 4) + px * 1.6) * s
      const h = px * (mg.sub ? 3.6 : 2.8) * s
      ctx.globalAlpha = a * eIn
      if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`
      ctx.fillStyle = 'rgba(22,22,28,0.86)'
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, px * 0.55 * s)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'
      ctx.lineWidth = Math.max(1, px * 0.03)
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, px * 0.55 * s)
      ctx.stroke()
      // Akzent-Punkt oben links
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(cx - w / 2 + px * 0.7, cy - h / 2 + px * 0.65, px * 0.14, 0, Math.PI * 2)
      ctx.fill()
      const tIn = easeOut(clamp01(pIn * 1.4 - 0.2))
      ctx.globalAlpha = a * tIn
      ctx.fillStyle = color
      ctx.font = fontStr(700, px * s)
      ctx.fillText(mg.text ?? '', cx, mg.sub ? cy - px * 0.5 * s : cy + px * 0.1 * s)
      if (mg.sub) {
        const sIn = easeOut(clamp01(pIn * 1.4 - 0.35))
        ctx.globalAlpha = a * sIn
        ctx.font = fontStr(400, px * 0.5 * s)
        ctx.fillStyle = 'rgba(255,255,255,0.66)'
        ctx.fillText(mg.sub, cx, cy + px * 0.55 * s)
      }
      break
    }
    case 'buttons': {
      // Zwei Kapsel-Buttons, nacheinander aufploppend
      ctx.font = fontStr(600, px * 0.7)
      const w1 = ctx.measureText(mg.text ?? '').width + px * 1.4
      const w2 = mg.sub ? ctx.measureText(mg.sub).width + px * 1.4 : 0
      const gap = w2 ? px * 0.5 : 0
      const total = w1 + gap + w2
      const bh = px * 1.6
      const drawBtn = (bx, bw, filled, label, p) => {
        if (p <= 0) return
        const s = p >= 1 ? 1 : 0.5 + 0.5 * easeOutBack(p)
        const ww = bw * s; const hh = bh * s
        ctx.globalAlpha = a * clamp01(p * 2)
        if (filled) {
          ctx.fillStyle = accent
          roundRect(ctx, bx + (bw - ww) / 2, cy - hh / 2, ww, hh, hh / 2)
          ctx.fill()
          ctx.fillStyle = mg.color ?? '#04211f'
        } else {
          ctx.strokeStyle = accent
          ctx.lineWidth = Math.max(1.5, px * 0.06)
          roundRect(ctx, bx + (bw - ww) / 2, cy - hh / 2, ww, hh, hh / 2)
          ctx.stroke()
          ctx.fillStyle = accent
        }
        ctx.font = fontStr(600, px * 0.7 * s)
        ctx.fillText(label, bx + bw / 2, cy + px * 0.02)
      }
      drawBtn(cx - total / 2, w1, true, mg.text ?? '', pIn * 1.25)
      if (w2) drawBtn(cx - total / 2 + w1 + gap, w2, false, mg.sub, pIn * 1.25 - 0.2)
      break
    }
    case 'callout': {
      // Rahmen zeichnet sich selbst, Beschriftung als Chip an der Kante
      const w = px * 7; const h = px * 4.4
      const r = px * 0.4
      const x0 = cx - w / 2; const y0 = cy - h / 2
      const perimeter = 2 * (w + h)
      ctx.globalAlpha = a
      ctx.strokeStyle = accent
      ctx.lineWidth = Math.max(2, px * 0.09)
      ctx.setLineDash([perimeter])
      ctx.lineDashOffset = perimeter * (1 - eIn)
      roundRect(ctx, x0, y0, w, h, r)
      ctx.stroke()
      ctx.setLineDash([])
      if (mg.text) {
        const tIn = easeOut(clamp01(pIn * 1.6 - 0.5))
        if (tIn > 0) {
          ctx.font = fontStr(600, px * 0.7)
          const cw = ctx.measureText(mg.text).width + px * 0.9
          const chH = px * 1.1
          ctx.globalAlpha = a * tIn
          ctx.fillStyle = accent
          roundRect(ctx, x0 + px * 0.3, y0 - chH / 2, cw, chH, chH / 2)
          ctx.fill()
          ctx.fillStyle = '#04211f'
          ctx.fillText(mg.text, x0 + px * 0.3 + cw / 2, y0 + px * 0.02)
        }
      }
      break
    }
    case 'uicard': {
      // Phase-1-Demo der Motion-Engine: Glas-Karte im Player-Layout,
      // Eingang = Apple Pop In (Feder), Ausgang = weiche Blende.
      const canvasH = ctx.canvas.height
      const m = wrapM
        ? { scale: 1, y: 0, opacity: 1, blur: 0 }
        : evalProps(withExit(MOTION_PRESETS.popIn(0.65 / (mg.speed || 1)), dur, 0.5), ltA)
      const s = m.scale
      ctx.font = fontStr(700, px * 0.62)
      const wT = ctx.measureText(mg.text ?? '').width
      ctx.font = fontStr(400, px * 0.46)
      const wS = mg.sub ? ctx.measureText(mg.sub).width : 0
      const w = Math.max(px * 6.4, Math.max(wT, wS) + px * 3.6) * s
      const h = px * 3.1 * s
      const yOff = m.y * canvasH
      const cyA = cy + yOff
      const alpha2 = alpha * pOut * m.opacity
      if (alpha2 <= 0) break
      ctx.globalAlpha = alpha2
      if (m.blur > 0.003) ctx.filter = `blur(${(m.blur * h).toFixed(1)}px)`

      // Schatten + Glaskoerper
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.45)'
      ctx.shadowBlur = h * 0.25
      ctx.shadowOffsetY = h * 0.06
      ctx.fillStyle = 'rgba(24,24,30,0.88)'
      roundRect(ctx, cx - w / 2, cyA - h / 2, w, h, px * 0.5 * s)
      ctx.fill()
      ctx.restore()
      if (m.blur > 0.003) ctx.filter = `blur(${(m.blur * h).toFixed(1)}px)`
      // helle Innenkante oben (Glas-Highlight)
      const grad = ctx.createLinearGradient(0, cyA - h / 2, 0, cyA - h / 2 + h * 0.5)
      grad.addColorStop(0, 'rgba(255,255,255,0.22)')
      grad.addColorStop(1, 'rgba(255,255,255,0.04)')
      ctx.strokeStyle = grad
      ctx.lineWidth = Math.max(1, px * 0.035 * s)
      roundRect(ctx, cx - w / 2, cyA - h / 2, w, h, px * 0.5 * s)
      ctx.stroke()

      // Cover-Kachel links
      const pad = px * 0.55 * s
      const cover = h - pad * 2
      const cg = ctx.createLinearGradient(cx - w / 2 + pad, cyA - cover / 2, cx - w / 2 + pad + cover, cyA + cover / 2)
      cg.addColorStop(0, accent)
      cg.addColorStop(1, 'rgba(255,255,255,0.25)')
      ctx.fillStyle = cg
      roundRect(ctx, cx - w / 2 + pad, cyA - cover / 2, cover, cover, px * 0.3 * s)
      ctx.fill()

      // Titel + Untertitel
      const tx = cx - w / 2 + pad + cover + pad * 0.8
      ctx.textAlign = 'left'
      ctx.fillStyle = color
      ctx.font = fontStr(700, px * 0.62 * s)
      ctx.fillText(mg.text ?? '', tx, cyA - h * 0.16)
      if (mg.sub) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = fontStr(400, px * 0.46 * s)
        ctx.fillText(mg.sub, tx, cyA + h * 0.08)
      }

      // Play-Dreieck + Fortschrittsbalken, sauber in einer Zeile
      const barY = cyA + h / 2 - pad * 1.05
      const ps = px * 0.26 * s
      const playX = tx
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(playX, barY - ps)
      ctx.lineTo(playX, barY + ps)
      ctx.lineTo(playX + ps * 1.5, barY)
      ctx.closePath(); ctx.fill()
      const barX = playX + ps * 2.4
      const barW = cx + w / 2 - pad - barX
      if (barW > px * 0.5) {
        ctx.lineCap = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'
        ctx.lineWidth = Math.max(1.5, px * 0.07 * s)
        ctx.beginPath(); ctx.moveTo(barX, barY); ctx.lineTo(barX + barW, barY); ctx.stroke()
        ctx.strokeStyle = accent
        const prog = Math.min(1, Math.max(0.05, lt / Math.max(dur, 0.1)))
        ctx.beginPath(); ctx.moveTo(barX, barY); ctx.lineTo(barX + barW * prog, barY); ctx.stroke()
      }
      break
    }
    case 'notification': {
      // iOS-artige Mitteilung: faellt federnd von oben ein
      const canvasH2 = ctx.canvas.height
      const m = wrapM
        ? { y: 0, opacity: 1 }
        : (() => {
            const f = spring({ stiffness: 260, damping: 24, mass: 1 })
            const p = f(ltA)
            return { y: -0.06 * (1 - p), opacity: clamp01(ltA / 0.25) }
          })()
      const cyN = cy + m.y * canvasH2
      ctx.font = fontStr(700, px * 0.62)
      const wT = ctx.measureText(mg.text ?? '').width
      ctx.font = fontStr(400, px * 0.5)
      const wS = mg.sub ? ctx.measureText(mg.sub).width : 0
      const w = Math.max(px * 6, Math.max(wT, wS) + px * 1.6)
      const h = px * 3.2
      ctx.globalAlpha = a * m.opacity
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur = h * 0.2
      ctx.shadowOffsetY = h * 0.05
      ctx.fillStyle = 'rgba(28,28,34,0.92)'
      roundRect(ctx, cx - w / 2, cyN - h / 2, w, h, px * 0.55)
      ctx.fill()
      ctx.restore()
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = Math.max(1, px * 0.03)
      roundRect(ctx, cx - w / 2, cyN - h / 2, w, h, px * 0.55)
      ctx.stroke()
      const left = cx - w / 2 + px * 0.7
      ctx.textAlign = 'left'
      // Kopfzeile: Punkt + App + Zeit
      ctx.fillStyle = accent
      ctx.beginPath(); ctx.arc(left + px * 0.14, cyN - h / 2 + px * 0.62, px * 0.14, 0, Math.PI * 2); ctx.fill()
      ctx.font = fontStr(600, px * 0.38)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fillText('APP', left + px * 0.45, cyN - h / 2 + px * 0.65)
      ctx.textAlign = 'right'
      ctx.fillText('jetzt', cx + w / 2 - px * 0.6, cyN - h / 2 + px * 0.65)
      ctx.textAlign = 'left'
      ctx.fillStyle = color
      ctx.font = fontStr(700, px * 0.62)
      ctx.fillText(mg.text ?? '', left, cyN + px * 0.12)
      if (mg.sub) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = fontStr(400, px * 0.5)
        ctx.fillText(mg.sub, left, cyN + px * 0.85)
      }
      break
    }
    case 'stat': {
      // Statistik: Zahl zaehlt hoch, Balken wachsen gestaffelt
      const num = parseFloat(String(mg.text ?? '').replace(',', '.').replace(/[^\d.-]/g, ''))
      const hasNum = Number.isFinite(num)
      const countE = easeOut(clamp01(ltA / (1.1 / (mg.speed || 1))))
      const shown = hasNum
        ? String(mg.text).replace(/-?[\d.,]+/, String(Math.round(num * countE)))
        : mg.text ?? ''
      ctx.globalAlpha = a * (wrapM ? 1 : easeOut(clamp01(ltA / 0.3)))
      ctx.font = fontStr(800, px)
      ctx.fillStyle = accent
      ctx.fillText(shown, cx, cy - px * 0.85)
      if (mg.sub) {
        ctx.font = fontStr(400, px * 0.38)
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        ctx.fillText(mg.sub, cx, cy - px * 0.05)
      }
      // Mini-Diagramm
      const bars = [0.35, 0.55, 0.45, 0.7, 0.9, 1]
      const bw = px * 0.42
      const gapB = px * 0.22
      const totalW = bars.length * bw + (bars.length - 1) * gapB
      const baseY = cy + px * 1.55
      bars.forEach((bh, i) => {
        const grow = easeOut(clamp01((ltA - i * 0.08) / 0.5))
        const hh = px * 1.1 * bh * grow
        if (hh <= 0) return
        ctx.fillStyle = i === bars.length - 1 ? accent : 'rgba(255,255,255,0.28)'
        roundRect(ctx, cx - totalW / 2 + i * (bw + gapB), baseY - hh, bw, hh, bw * 0.3)
        ctx.fill()
      })
      break
    }
    case 'cursor': {
      // macOS-artiger Zeiger: gleitet heran, klickt (Dip + Ripple), ruht
      const travel = 0.9 / (mg.speed || 1)
      const tClick = travel + 0.25
      const move = easeOut(clamp01(ltA / travel))
      const mx = cx - W * 0.12 * (1 - move)
      const my = cy + H * 0.1 * (1 - move)
      // Klick: kurzes Eindruecken
      const cp = clamp01((ltA - tClick) / 0.28)
      const dip = cp > 0 && cp < 1 ? 1 - 0.15 * Math.sin(cp * Math.PI) : 1
      // Ripple-Ring ab dem Klick
      if (cp > 0 && cp < 1.6) {
        const rp = clamp01((ltA - tClick) / 0.55)
        if (rp > 0 && rp < 1) {
          ctx.globalAlpha = a * 0.55 * (1 - rp)
          ctx.strokeStyle = accent
          ctx.lineWidth = Math.max(1.5, px * 0.08)
          ctx.beginPath()
          ctx.arc(mx, my, px * 0.4 + px * 1.3 * easeOut(rp), 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = a * clamp01(ltA / 0.2)
      const cs = (px / 16) * 1.35 * dip
      ctx.save()
      ctx.translate(mx, my)
      ctx.scale(cs, cs)
      ctx.beginPath()
      ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.lineTo(4.4, 12.5); ctx.lineTo(7, 18.2)
      ctx.lineTo(9.6, 17); ctx.lineTo(7, 11.4); ctx.lineTo(12.6, 11.4)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.lineWidth = 1.6
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      break
    }
    case 'touch': {
      // Fingertipp: Kreis erscheint, tippt, Ripple - wiederholt sich
      const period = 1.7 / (mg.speed || 1)
      const tp = (ltA % period) / period
      const appear = clamp01(ltA / 0.25)
      // Tipp-Phase innerhalb der Periode
      const tap = tp < 0.35 ? Math.sin((tp / 0.35) * Math.PI) : 0
      ctx.globalAlpha = a * appear * (0.35 + 0.25 * tap)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(cx, cy, px * 0.55 * (1 - 0.18 * tap), 0, Math.PI * 2)
      ctx.fill()
      // Ripple nach dem Tipp
      const rp = clamp01((tp - 0.3) / 0.5)
      if (rp > 0 && rp < 1) {
        ctx.globalAlpha = a * appear * 0.5 * (1 - rp)
        ctx.strokeStyle = accent
        ctx.lineWidth = Math.max(1.5, px * 0.07)
        ctx.beginPath()
        ctx.arc(cx, cy, px * 0.6 + px * 1.1 * easeOut(rp), 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'focus': {
      // UI-Fokus: alles abdunkeln, nur ein Fenster bleibt frei und leuchtet
      const w = px * 7
      const h = px * 4
      const r = px * 0.45
      // Fenster zieht sich beim Einstieg von gross auf Ziel zusammen
      const k = 1 + 0.6 * (1 - eIn)
      const wz = w * k; const hz = h * k
      const dimA = 0.55 * eIn * a
      const off = focusCanvas(W, H)
      const octx = off.ctx
      octx.clearRect(0, 0, W, H)
      octx.fillStyle = `rgba(0,0,0,${dimA.toFixed(3)})`
      octx.fillRect(0, 0, W, H)
      octx.globalCompositeOperation = 'destination-out'
      roundRect(octx, cx - wz / 2, cy - hz / 2, wz, hz, r * k)
      octx.fill()
      octx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.drawImage(off.canvas, 0, 0)
      // leuchtender Rahmen ums Fenster
      ctx.globalAlpha = a * eIn
      ctx.strokeStyle = accent
      ctx.lineWidth = Math.max(2, px * 0.07)
      ctx.shadowColor = accent
      ctx.shadowBlur = px * 0.5
      roundRect(ctx, cx - wz / 2, cy - hz / 2, wz, hz, r * k)
      ctx.stroke()
      ctx.shadowBlur = 0
      break
    }
    case 'arrow': {
      // Pfeil waechst zum Ziel, Label schwebt darueber ein
      ctx.font = fontStr(500, px * 0.8)
      const wText2 = ctx.measureText(mg.text ?? '').width
      const len = Math.max(wText2 + px, px * 5)
      const x0 = cx - len / 2
      const grow = len * eIn
      const lw = Math.max(2, px * 0.11)
      ctx.globalAlpha = a
      ctx.strokeStyle = accent
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x0, cy + px * 0.55)
      ctx.lineTo(x0 + grow, cy + px * 0.55)
      ctx.stroke()
      if (eIn > 0.75) {
        const hp = clamp01((eIn - 0.75) / 0.25)
        const hs = px * 0.5 * hp
        ctx.beginPath()
        ctx.moveTo(x0 + grow - hs, cy + px * 0.55 - hs)
        ctx.lineTo(x0 + grow, cy + px * 0.55)
        ctx.lineTo(x0 + grow - hs, cy + px * 0.55 + hs)
        ctx.stroke()
      }
      const tIn = easeOut(clamp01(pIn * 1.4 - 0.25))
      ctx.globalAlpha = a * tIn
      ctx.fillStyle = color
      ctx.fillText(mg.text ?? '', cx, cy - px * 0.35 + px * 0.2 * (1 - tIn))
      break
    }
    case 'line': {
      // Linie faechert aus der Mitte auf, Text steigt darueber
      ctx.font = fontStr(500, px)
      const wText = ctx.measureText(mg.text ?? '').width
      const lineW = Math.max(wText * 1.25, px * 3) * eIn
      ctx.globalAlpha = a * eIn
      ctx.fillStyle = color
      ctx.fillText(mg.text ?? '', cx, cy - px * 0.45 + px * 0.25 * (1 - eIn))
      ctx.fillStyle = accent
      roundRect(ctx, cx - lineW / 2, cy + px * 0.35, lineW, Math.max(2, px * 0.05), px * 0.025)
      ctx.fill()
      break
    }
  }
  ctx.restore()
}

let _focusCanvas = null
function focusCanvas (W, H) {
  if (!_focusCanvas || _focusCanvas.canvas.width !== W || _focusCanvas.canvas.height !== H) {
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    _focusCanvas = { canvas, ctx: canvas.getContext('2d') }
  }
  return _focusCanvas
}

function roundRect (ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
