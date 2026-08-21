// Schnitt - Oberflaeche mit Medienablage und beliebig vielen Spuren.
// Spur-Regeln: "Video 1" (unterste Videospur) ist magnetisch und traegt die
// Uebergaenge. Alle weiteren Spuren sind frei - Clips liegen, wo man sie
// hinlegt; Videospuren stapeln sich von unten nach oben, Tonspuren mischen sich.

import { MG_PRESETS, mgMeasure, mgRender } from './mg.js'
import { ICON } from './icons.js'
import { evalProp } from './motion.js'

const $ = s => document.querySelector(s)
const api = async (path, body) => {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined)
  return res.json()
}

const TRANSITION_ICONS = {
  none: ICON.tCut, fade: ICON.tFade, fadeblack: ICON.tBlack, wipeleft: ICON.tLeft,
  wiperight: ICON.tRight, slideup: ICON.tUp, circleopen: ICON.tCircle
}
const MG_ICONS = {
  title: ICON.mgTitle, tracking: ICON.mgTracking, lowerthird: ICON.mgLower,
  badge: ICON.mgBadge, line: ICON.mgLine, card: ICON.mgCard, buttons: ICON.mgButtons,
  callout: ICON.mgCallout, arrow: ICON.mgArrow, uicard: ICON.mgUiCard,
  notification: ICON.mgCard, stat: ICON.fx,
  cursor: ICON.mgCursor, touch: ICON.mgTouch, focus: ICON.mgFocus
}
const IMAGE_DEFAULT_DUR = 5
const LABEL_W = 78

// ---------------------------------------------------------------- Zustand
const state = {
  project: null,
  transitions: [],
  selectedClip: null,
  time: 0,
  playing: false,
  pxPerSec: 60,
  viewZoom: 1,
  snapOn: true,
  seamTarget: null,
  dragClipId: null
}

const els = {
  preview: $('#preview'), previewWrap: $('#previewWrap'), emptyHint: $('#emptyHint'),
  bigPlay: $('#bigPlay'), transport: $('#transport'), timecode: $('#timecode'),
  btnPlay: $('#btnPlay'), timelineArea: $('#timelineArea'), tlScroll: $('#tlScroll'),
  tracks: $('#tracks'), ruler: $('#ruler'), playhead: $('#playhead'),
  inspector: $('#inspector'), libItems: $('#libItems'), libHint: $('#libHint'),
  ghost: $('#dragGhost')
}
let ctx = els.preview.getContext('2d')

const clipDur = c => Math.max(0, c.out - c.in)
const clipEnd = c => c.start + clipDur(c)
const trackById = id => state.project.tracks.find(t => t.id === id)
const videoTracks = () => state.project.tracks.filter(t => t.type === 'video')
const audioTracks = () => state.project.tracks.filter(t => t.type === 'audio')
const mediaOf = c => state.project.media.find(m => m.id === c.mediaId)
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const newClipId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function projectDuration () {
  let max = 0
  for (const t of state.project.tracks) for (const c of t.clips) max = Math.max(max, clipEnd(c))
  return max
}

function findClip (clipId) {
  for (const t of state.project.tracks) {
    const c = t.clips.find(c => c.id === clipId)
    if (c) return { track: t, clip: c }
  }
  return null
}

/** Magnetische Hauptspur (Video 1). */
function repack () {
  const clips = trackById('V1').clips
  clips.sort((a, b) => a.start - b.start)
  let cursor = 0
  clips.forEach((c, i) => {
    if (i === 0) { c.transition = { type: 'none', duration: 0 }; c.start = 0 }
    else {
      const t = c.transition ?? { type: 'none', duration: 0 }
      const overlap = t.type !== 'none'
        ? Math.min(t.duration || 0.5, clipDur(clips[i - 1]) * 0.9, clipDur(c) * 0.9)
        : 0
      if (t.type !== 'none') c.transition.duration = Math.round(overlap * 100) / 100
      c.start = Math.max(0, cursor - overlap)
    }
    cursor = clipEnd(c)
  })
}

// ------------------------------------------------------- Vorschau-Engine
const videoPool = new Map()   // clip.id -> <video> (Proxy)
const imagePool = new Map()   // media.id -> <img>

function videoFor (clip) {
  let v = videoPool.get(clip.id)
  if (v) return v
  const media = mediaOf(clip)
  if (!media) return null
  v = document.createElement('video')
  v.src = media.proxy ? `/cache/${media.proxy}` : `/original?id=${media.id}`
  v.preload = 'auto'
  v.muted = true
  v.playsInline = true
  videoPool.set(clip.id, v)
  return v
}

function imageFor (media) {
  let img = imagePool.get(media.id)
  if (img) return img
  img = new Image()
  img.src = `/original?id=${media.id}`
  imagePool.set(media.id, img)
  return img
}

const activeClips = (track, t) =>
  track.clips.filter(c => t >= c.start - 0.001 && t < clipEnd(c) - 0.001)

function syncVideo (clip, t) {
  const v = videoFor(clip)
  if (!v) return null
  const local = clip.in + (t - clip.start)
  if (state.playing) {
    if (Math.abs(v.currentTime - local) > 0.18) v.currentTime = local
    if (v.paused) v.play().catch(() => {})
  } else {
    if (!v.paused) v.pause()
    if (Math.abs(v.currentTime - local) > 0.02) v.currentTime = local
  }
  return v
}

function fadeAlpha (clip, t) {
  const local = t - clip.start
  const dur = clipDur(clip)
  let a = kfValues(clip, t).opacity
  if (clip.fadeIn > 0 && local < clip.fadeIn) a *= local / clip.fadeIn
  if (clip.fadeOut > 0 && local > dur - clip.fadeOut) a *= Math.max(0, (dur - local) / clip.fadeOut)
  return Math.max(0, Math.min(1, a))
}

const EFFECTS = [
  { id: 'none',    label: 'Keiner',        icon: ICON.fxNone },
  { id: 'zoomin',  label: 'Näher',         icon: ICON.zoomIn },
  { id: 'zoomout', label: 'Weiter weg',    icon: ICON.zoomOut },
  { id: 'panlr',   label: 'Nach rechts',   icon: ICON.fxRight },
  { id: 'panrl',   label: 'Nach links',    icon: ICON.fxLeft },
  { id: 'floaty',  label: 'Auf und ab',    icon: ICON.fx }
]

const TEXT_PRESETS = [
  { id: 'standard', label: 'Standard', style: { font: 'sans', bold: false, size: 0.07, color: '#ffffff', stroke: 0, strokeColor: '#000000', bg: null, bgAlpha: 0.65, shadow: 0.15, shadowColor: '#000000' } },
  { id: 'titel', label: 'Titel', style: { font: 'sans', bold: true, size: 0.12, color: '#ffffff', stroke: 0.09, strokeColor: '#000000', bg: null, bgAlpha: 0.65, shadow: 0, shadowColor: '#000000' } },
  { id: 'untertitel', label: 'Untertitel', style: { font: 'sans', bold: false, size: 0.055, color: '#ffffff', stroke: 0, strokeColor: '#000000', bg: '#000000', bgAlpha: 0.65, shadow: 0, shadowColor: '#000000' } },
  { id: 'neon', label: 'Neon', style: { font: 'sans', bold: true, size: 0.1, color: '#b6fef8', stroke: 0, strokeColor: '#000000', bg: null, bgAlpha: 0.65, shadow: 0.6, shadowColor: '#00d3c8' } },
  { id: 'retro', label: 'Retro', style: { font: 'serif', bold: true, size: 0.11, color: '#ffd83d', stroke: 0.1, strokeColor: '#c0271f', bg: null, bgAlpha: 0.65, shadow: 0, shadowColor: '#000000' } },
  { id: 'elegant', label: 'Elegant', style: { font: 'serif', bold: false, size: 0.085, color: '#ffffff', stroke: 0, strokeColor: '#000000', bg: null, bgAlpha: 0.65, shadow: 0.2, shadowColor: '#000000' } },
  { id: 'marker', label: 'Marker', style: { font: 'sans', bold: true, size: 0.08, color: '#141414', stroke: 0, strokeColor: '#000000', bg: '#ffe33d', bgAlpha: 1, shadow: 0, shadowColor: '#000000' } },
  { id: 'schreibmaschine', label: 'Typo', style: { font: 'mono', bold: false, size: 0.07, color: '#f2f2f2', stroke: 0, strokeColor: '#000000', bg: '#000000', bgAlpha: 0.5, shadow: 0, shadowColor: '#000000' } }
]
let lastTextPreset = TEXT_PRESETS[0]

const TEXT_FONT_STACK = {
  sans: '"Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'Menlo, "Courier New", monospace'
}

const isText = clip => clip.type === 'text'
const isMg = clip => clip.type === 'mg'

function textFontCss (style, px) {
  return `${style.bold ? '700' : '400'} ${px}px ${TEXT_FONT_STACK[style.font ?? 'sans'] ?? TEXT_FONT_STACK.sans}`
}

/** Groesse des Textblocks in Canvas-Pixeln (fuer Rahmen, Klicks, Rendering). */
function measureText (clip, fxScale = 1) {
  const st = clip.style ?? {}
  const H = els.preview.height
  const px = Math.max(6, (st.size ?? 0.07) * H * (clip.scale ?? 1) * fxScale)
  const lineH = px * 1.3
  const lines = String(clip.text ?? '').split('\n')
  ctx.font = textFontCss(st, px)
  let w = 0
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width)
  const pad = st.bg ? px * 0.28 : 0
  return { px, lineH, lines, w: w + pad * 2, h: lines.length * lineH + pad * 2, pad }
}

function hexToRgba (hex, alpha) {
  const c = (hex ?? '#000000').replace('#', '')
  const n = parseInt(c.slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Einblende-Animation eines Textes: Versatz, Deckkraft, sichtbare Zeichen. */
function textAnimState (clip, t) {
  const anim = clip.anim ?? { type: 'none', dur: 0.8 }
  const W = els.preview.width; const H = els.preview.height
  if (!anim.type || anim.type === 'none') return { dx: 0, dy: 0, alpha: 1, chars: Infinity }
  const lt = Math.max(0, t - clip.start)
  const p = Math.min(1, lt / Math.max(anim.dur, 0.05))
  const rest = Math.pow(1 - p, 2)          // sanft auslaufend
  switch (anim.type) {
    case 'slideup': return { dx: 0, dy: H * 0.08 * rest, alpha: p, chars: Infinity }
    case 'slidedown': return { dx: 0, dy: -H * 0.08 * rest, alpha: p, chars: Infinity }
    case 'slideleft': return { dx: -W * 0.06 * rest, dy: 0, alpha: p, chars: Infinity }
    case 'slideright': return { dx: W * 0.06 * rest, dy: 0, alpha: p, chars: Infinity }
    case 'type': {
      const total = String(clip.text ?? '').replace(/\n/g, '').length
      return { dx: 0, dy: 0, alpha: 1, chars: Math.max(1, Math.ceil(total * p)) }
    }
    default: return { dx: 0, dy: 0, alpha: 1, chars: Infinity }
  }
}

function drawTextClip (clip, t, alphaMul = 1, tctx = ctx) {
  const st = clip.style ?? {}
  const kv = kfValues(clip, t)
  const fx = effectTransform(clip, t)
  const anim = textAnimState(clip, t)
  const m = measureText(clip, fx.scaleMul * (kv.scale / (clip.scale ?? 1)))
  if (anim.chars !== Infinity) {
    // Tippen: nur die ersten Zeichen zeigen (zeilenuebergreifend)
    let remaining = anim.chars
    m.lines = m.lines.map(line => {
      const part = line.slice(0, Math.max(0, remaining))
      remaining -= line.length
      return part
    })
  }
  const W = tctx.canvas.width; const H = tctx.canvas.height
  const cx = W / 2 + kv.x * W + fx.dx + anim.dx
  const cy = H / 2 + kv.y * H + fx.dy + anim.dy
  const alpha = alphaMul * fadeAlpha(clip, t) * anim.alpha
  if (alpha <= 0) return

  const ctx0 = ctx_swap(tctx)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = textFontCss(st, m.px)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  m.lines.forEach((line, i) => {
    const y = cy - m.h / 2 + m.pad + (i + 0.5) * m.lineH
    if (st.bg) {
      const lw = ctx.measureText(line).width
      ctx.fillStyle = hexToRgba(st.bg, st.bgAlpha ?? 0.65)
      ctx.fillRect(cx - lw / 2 - m.pad, y - m.lineH / 2, lw + m.pad * 2, m.lineH)
    }
  })
  m.lines.forEach((line, i) => {
    const y = cy - m.h / 2 + m.pad + (i + 0.5) * m.lineH
    if (st.shadow > 0) {
      ctx.shadowColor = hexToRgba(st.shadowColor ?? '#000000', 0.85)
      ctx.shadowBlur = st.shadow * m.px * 0.9
      ctx.shadowOffsetX = st.shadow > 0.3 ? 0 : m.px * 0.045
      ctx.shadowOffsetY = st.shadow > 0.3 ? 0 : m.px * 0.045
    }
    if ((st.stroke ?? 0) > 0) {
      ctx.lineWidth = st.stroke * m.px
      ctx.strokeStyle = st.strokeColor ?? '#000000'
      ctx.lineJoin = 'round'
      ctx.strokeText(line, cx, y)
    }
    ctx.fillStyle = st.color ?? '#ffffff'
    ctx.fillText(line, cx, y)
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
  })
  ctx.restore()
  ctx_swap(ctx0)
}

/** ctx-Variable umschalten (fuer das Vorrendern von Texten auf eigene Canvas). */
function ctx_swap (next) {
  const prev = ctx
  ctx = next
  return prev
}

// ------------------------------------------------------------- Farbe
const LOOKS = [
  { id: 'none', label: 'Original', v: { bright: 0, contrast: 0, sat: 0, temp: 0 } },
  { id: 'film', label: 'Film', v: { bright: 0, contrast: 0.12, sat: -0.1, temp: 0.1 } },
  { id: 'tealorange', label: 'Teal & Orange', v: { bright: 0, contrast: 0.1, sat: 0.15, temp: 0.25 } },
  { id: 'punch', label: 'Kraftvoll', v: { bright: 0.02, contrast: 0.2, sat: 0.25, temp: 0 } },
  { id: 'warm', label: 'Warm', v: { bright: 0.05, contrast: 0, sat: 0.05, temp: 0.35 } },
  { id: 'kalt', label: 'Kühl', v: { bright: 0, contrast: 0.05, sat: -0.05, temp: -0.3 } },
  { id: 'vintage', label: 'Vintage', v: { bright: 0.05, contrast: -0.12, sat: -0.25, temp: 0.2 } },
  { id: 'pastell', label: 'Pastell', v: { bright: 0.1, contrast: -0.15, sat: -0.2, temp: 0.05 } },
  { id: 'sw', label: 'Schwarzweiß', v: { bright: 0, contrast: 0.1, sat: -1, temp: 0 } }
]

const colorActive = clip => {
  const c = clip.color
  return c && (c.bright || c.contrast || c.sat || c.temp)
}

/** CSS-Filterkette - Mathematik identisch mit colorFilters() im Export. */
function colorFilterCss (clip) {
  const c = clip.color ?? {}
  const parts = []
  if (c.bright) parts.push(`brightness(${(1 + c.bright).toFixed(3)})`)
  if (c.contrast) parts.push(`contrast(${(1 + c.contrast).toFixed(3)})`)
  if (c.sat) parts.push(`saturate(${Math.max(0, 1 + c.sat).toFixed(3)})`)
  return parts.join(' ')
}

// Zwischenspeicher fuers isolierte Einfaerben
let _colCanvas = null
function colCanvas (w, h) {
  if (!_colCanvas) {
    const canvas = document.createElement('canvas')
    _colCanvas = { canvas, ctx: canvas.getContext('2d') }
  }
  if (_colCanvas.canvas.width < w || _colCanvas.canvas.height < h) {
    _colCanvas.canvas.width = Math.max(_colCanvas.canvas.width, Math.ceil(w))
    _colCanvas.canvas.height = Math.max(_colCanvas.canvas.height, Math.ceil(h))
  }
  return _colCanvas
}

/**
 * Quelle mit Farbkorrektur an die Ziel-Position zeichnen.
 * Waerme als Soft-Light-Toenung (Export nutzt die aequivalente Farbbalance).
 */
function drawSourceColored (target, source, r, clip) {
  if (!colorActive(clip)) { target.drawImage(source, r.x, r.y, r.w, r.h); return }
  const w = Math.max(2, Math.round(r.w))
  const h = Math.max(2, Math.round(r.h))
  const cc = colCanvas(w, h)
  cc.ctx.clearRect(0, 0, w, h)
  cc.ctx.filter = colorFilterCss(clip) || 'none'
  cc.ctx.drawImage(source, 0, 0, w, h)
  cc.ctx.filter = 'none'
  const t = clip.color.temp ?? 0
  if (t) {
    cc.ctx.save()
    cc.ctx.globalCompositeOperation = 'soft-light'
    cc.ctx.globalAlpha = Math.min(1, Math.abs(t) * 0.9)
    cc.ctx.fillStyle = t > 0 ? 'rgb(255,166,90)' : 'rgb(96,156,255)'
    cc.ctx.fillRect(0, 0, w, h)
    // Toenung nur dort, wo das Bild deckend ist
    cc.ctx.globalCompositeOperation = 'destination-in'
    cc.ctx.globalAlpha = 1
    cc.ctx.filter = colorFilterCss(clip) || 'none'
    cc.ctx.drawImage(source, 0, 0, w, h)
    cc.ctx.restore()
    cc.ctx.filter = 'none'
  }
  target.drawImage(cc.canvas, 0, 0, w, h, r.x, r.y, r.w, r.h)
}

// ------------------------------------------------------------- Keyframes
const kfActive = clip => Boolean(clip.keyframes &&
  ['x', 'y', 'scale', 'opacity'].some(p => clip.keyframes[p]?.length))

/** Statische Werte, ggf. von Keyframes ueberschrieben (t = Projektzeit). */
function kfValues (clip, t) {
  const kf = clip.keyframes
  const lt = t - clip.start
  const get = (prop, fallback) =>
    kf?.[prop]?.length ? evalProp(kf[prop], lt, fallback) : fallback
  return {
    x: get('x', clip.x ?? 0),
    y: get('y', clip.y ?? 0),
    scale: get('scale', clip.scale ?? 1),
    opacity: get('opacity', clip.opacity ?? 1)
  }
}

/** Keyframe fuer eine Eigenschaft setzen/aktualisieren (lt = Zeit im Clip). */
function setKf (clip, prop, lt, value) {
  clip.keyframes = clip.keyframes ?? {}
  const keys = clip.keyframes[prop] = clip.keyframes[prop] ?? []
  const near = keys.find(k => Math.abs(k.t - lt) < 0.05)
  if (near) near.v = value
  else {
    keys.push({ t: Math.max(0, Math.round(lt * 100) / 100), v: value, ease: 'easeInOut' })
    keys.sort((a, b) => a.t - b.t)
  }
}

/** Sanfte Dauer-Bewegung - Formeln identisch mit dem Export (lib/export.mjs). */
function effectTransform (clip, t) {
  const fx = clip.effect ?? {}
  const amount = Math.min(1, Math.max(0, fx.amount ?? 0.5))
  const dur = clipDur(clip)
  const lt = Math.min(Math.max(t - clip.start, 0), dur)
  const p = dur > 0 ? lt / dur : 0
  const W = els.preview.width; const H = els.preview.height
  let dx = 0; let dy = 0; let scaleMul = 1
  if (clip.type === 'text' && (fx.type === 'zoomin' || fx.type === 'zoomout')) return { dx, dy, scaleMul }
  switch (fx.type) {
    case 'zoomin': scaleMul = 1 + 0.15 * amount * p; break
    case 'zoomout': scaleMul = 1 + 0.15 * amount * (1 - p); break
    case 'panlr': dx = W * 0.12 * amount * (p - 0.5); break
    case 'panrl': dx = -W * 0.12 * amount * (p - 0.5); break
    case 'floaty': dy = H * 0.03 * amount * Math.sin(2 * Math.PI * lt / 4); break
  }
  return { dx, dy, scaleMul }
}

/** Wo (und wie gross) ein Clip im Bild liegt - in Canvas-Koordinaten. */
function rectFor (clip, t = state.time) {
  const kv = kfValues(clip, t)
  if (isMg(clip)) {
    const fx = effectTransform(clip, t)
    const m = mgMeasure(ctx, clip.mg ?? {}, els.preview.height)
    const W = els.preview.width; const H = els.preview.height
    const k = kv.scale * fx.scaleMul
    return {
      x: W / 2 + kv.x * W + fx.dx - (m.w * k) / 2,
      y: H / 2 + kv.y * H + fx.dy - (m.h * k) / 2,
      w: m.w * k,
      h: m.h * k
    }
  }
  if (isText(clip)) {
    const fx = effectTransform(clip, t)
    const m = measureText(clip, fx.scaleMul * (kv.scale / (clip.scale ?? 1)))
    const W = els.preview.width; const H = els.preview.height
    return {
      x: W / 2 + kv.x * W + fx.dx - m.w / 2,
      y: H / 2 + kv.y * H + fx.dy - m.h / 2,
      w: m.w,
      h: m.h
    }
  }
  const media = mediaOf(clip)
  if (!media || !media.width) return null
  const W = els.preview.width; const H = els.preview.height
  const fx = effectTransform(clip, t)
  const fit = Math.min(W / media.width, H / media.height) * kv.scale * fx.scaleMul
  const w = media.width * fit; const h = media.height * fit
  return {
    x: (W - w) / 2 + kv.x * W + fx.dx,
    y: (H - h) / 2 + kv.y * H + fx.dy,
    w,
    h
  }
}

/** Motion-Graphic auf einen beliebigen Kontext zeichnen (Vorschau + Export). */
function mgDrawTo (targetCtx, clip, t, alphaMul = 1) {
  const W = targetCtx.canvas.width; const H = targetCtx.canvas.height
  const kv = kfValues(clip, t)
  const fx = effectTransform(clip, t)
  const lt = Math.max(0, t - clip.start)
  const alpha = alphaMul * fadeAlpha(clip, t)
  if (alpha <= 0) return
  mgRender(
    targetCtx, clip.mg ?? {}, lt, clipDur(clip),
    W / 2 + kv.x * W + fx.dx,
    H / 2 + kv.y * H + fx.dy,
    kv.scale * fx.scaleMul,
    alpha
  )
}

function drawClip (clip, t, alpha = 1) {
  if (isMg(clip)) { mgDrawTo(ctx, clip, t, alpha); return }
  if (isText(clip)) { drawTextClip(clip, t, alpha) ; return }
  const media = mediaOf(clip)
  if (!media) return
  let source
  if (media.isImage) {
    const img = imageFor(media)
    if (!img.complete || !img.naturalWidth) return
    source = img
  } else {
    const v = syncVideo(clip, t)
    if (!v || v.readyState < 2) return
    source = v
  }
  const r = rectFor(clip, t)
  if (!r) return
  ctx.globalAlpha = alpha * fadeAlpha(clip, t)
  drawSourceColored(ctx, source, r, clip)
  ctx.globalAlpha = 1
}

function drawTransition (prev, next, t) {
  const W = els.preview.width; const H = els.preview.height
  const d = next.transition.duration || 0.5
  const p = Math.max(0, Math.min(1, (t - next.start) / d))
  const type = next.transition.type

  if (type === 'fadeblack') {
    if (p < 0.5) drawClip(prev, t, 1 - p * 2)
    else drawClip(next, t, p * 2 - 1)
    return
  }
  if (type === 'fade') { drawClip(prev, t, 1); drawClip(next, t, p); return }

  drawClip(prev, t, 1)
  ctx.save()
  if (type === 'wiperight') { ctx.beginPath(); ctx.rect(0, 0, W * p, H); ctx.clip(); drawClip(next, t, 1) }
  else if (type === 'wipeleft') { ctx.beginPath(); ctx.rect(W * (1 - p), 0, W * p, H); ctx.clip(); drawClip(next, t, 1) }
  else if (type === 'circleopen') {
    ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * p, 0, Math.PI * 2); ctx.clip(); drawClip(next, t, 1)
  } else if (type === 'slideup') {
    ctx.translate(0, H * (1 - p)); drawClip(next, t, 1)
  } else { drawClip(next, t, p) }
  ctx.restore()
}

function renderFrame () {
  ctx.fillStyle = state.project?.settings.background ?? '#000'
  ctx.fillRect(0, 0, els.preview.width, els.preview.height)
  if (!state.project) return
  const t = state.time

  // Videospuren von unten nach oben stapeln; V1 traegt die Uebergaenge
  for (const track of videoTracks()) {
    if (track.hidden) continue
    const act = activeClips(track, t)
    if (track.id === 'V1' && act.length >= 2 && act[1].transition?.type !== 'none') {
      drawTransition(act[0], act[1], t)
    } else {
      for (const clip of act) drawClip(clip, t)
    }
  }

}

function screenScale () {
  const rect = els.preview.getBoundingClientRect()
  return rect.width > 0 ? els.preview.width / rect.width : 1
}

function handlePoints (r) {
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]
}

/** DOM-Auswahlrahmen: liegt ueber dem grauen Bereich, wird nie vom Videobild abgeschnitten. */
function updateSelBox () {
  const box = $('#selBox')
  const clip = selectedVisibleClip()
  if (!clip) { box.hidden = true; return }
  const r = rectFor(clip, state.time)
  if (!r) { box.hidden = true; return }
  const cRect = els.preview.getBoundingClientRect()
  const wRect = els.previewWrap.getBoundingClientRect()
  if (cRect.width === 0) { box.hidden = true; return }
  const k = cRect.width / els.preview.width
  box.hidden = false
  box.style.left = `${cRect.left - wRect.left + r.x * k}px`
  box.style.top = `${cRect.top - wRect.top + r.y * k}px`
  box.style.width = `${Math.max(0, r.w * k - 4)}px`
  box.style.height = `${Math.max(0, r.h * k - 4)}px`
}

function syncAudio () {
  const t = state.time
  const audible = new Set()
  // Laeuft gerade hoerbarer Ton auf einer Videospur? Dann Musik absenken.
  const speechActive = (state.project?.tracks ?? []).some(tr =>
    tr.type === 'video' && !tr.hidden &&
    activeClips(tr, t).some(c => {
      const m = mediaOf(c)
      return m?.hasAudio && (c.volume ?? 1) > 0
    }))
  for (const track of state.project?.tracks ?? []) {
    if (track.hidden) continue
    for (const clip of activeClips(track, t)) {
      const media = mediaOf(clip)
      if (!media?.hasAudio) continue
      const v = syncVideo(clip, t)
      if (!v) continue
      v.muted = !state.playing
      let vol = Math.max(0, Math.min(1, (clip.volume ?? 1) * fadeAlpha(clip, t) / Math.max(clip.opacity ?? 1, 0.001)))
      if (track.type === 'audio' && track.duck && speechActive) vol *= 0.25
      v.volume = vol
      audible.add(clip.id)
    }
  }
  for (const [clipId, v] of videoPool) {
    if (!audible.has(clipId)) {
      v.muted = true
      const found = findClip(clipId)
      if (!found || t < found.clip.start || t >= clipEnd(found.clip)) { if (!v.paused) v.pause() }
    }
  }
}

let lastTick = 0
function loop (now) {
  requestAnimationFrame(loop)
  if (state.playing) {
    state.time += (now - lastTick) / 1000
    const total = projectDuration()
    if (state.time >= total) { state.time = total; setPlaying(false) }
    updatePlayhead()
    updateTimecode()
  }
  lastTick = now
  renderFrame()
  updateSelBox()
  syncAudio()
}
requestAnimationFrame(now => { lastTick = now; loop(now) })

function setPlaying (on) {
  state.playing = on
  els.btnPlay.innerHTML = on ? ICON.pause : ICON.play
  els.bigPlay.hidden = on || !state.project?.media.length
  if (!on) for (const v of videoPool.values()) { v.pause(); v.muted = true }
}

function seek (t) {
  state.time = Math.max(0, Math.min(t, projectDuration()))
  updatePlayhead(); updateTimecode()
  if (!$('#graphPanel').hidden) renderGraph()
}

// ------------------------------------------------------------ Timeline
function updatePlayhead () {
  els.playhead.style.left = `${LABEL_W + state.time * state.pxPerSec}px`
}
function updateTimecode () {
  els.timecode.textContent = `${fmt(state.time)} / ${fmt(projectDuration())}`
}

function renderRuler (total, width) {
  const step = state.pxPerSec > 45 ? 1 : 5
  let html = ''
  for (let s = 0; s <= total + step; s += step) {
    html += `<div class="ruler-mark" style="left:${LABEL_W + s * state.pxPerSec}px">${fmt(s)}</div>`
  }
  els.ruler.innerHTML = html
  els.ruler.style.width = `${width}px`
}

function clipHtml (clip, track) {
  const media = mediaOf(clip)
  const isSel = state.selectedClip?.clipId === clip.id
  const isDrag = state.dragClipId === clip.id
  let bg = ''
  let extra = ''
  let name = media?.name ?? '?'
  if (isMg(clip)) { extra = ' mg-clip'; name = clip.mg?.text || 'Grafik' }
  else if (isText(clip)) { extra = ' text-clip'; name = String(clip.text ?? '').split('\n')[0] || 'Text' }
  else if (media?.isImage && media.poster) { bg = `background-image:url(/cache/${media.poster});`; extra = ' image-clip' }
  else if (media?.thumbs) bg = `background-image:url(/cache/${media.thumbs});`
  else if (media?.waveform) { bg = `background-image:url(/cache/${media.waveform});`; extra = ' audio-clip' }
  let kfMarks = ''
  if (clip.keyframes) {
    const times = [...new Set(Object.values(clip.keyframes).flat().map(k => Math.round(k.t * 100) / 100))]
    kfMarks = times.map(t =>
      `<i class="kf" data-kf-t="${t}" style="left:${t * state.pxPerSec}px" title="Keyframe bei ${t.toFixed(2)}s – Klick: hinspringen, Alt-Klick: löschen"></i>`
    ).join('')
  }
  return `<div class="clip${isSel ? ' selected' : ''}${isDrag ? ' dragging' : ''}${extra}"
    data-clip="${clip.id}"
    style="left:${clip.start * state.pxPerSec}px;width:${Math.max(clipDur(clip) * state.pxPerSec, 14)}px;${bg}">
    ${clip.fadeIn > 0 ? '<span class="fadebadge in">◢</span>' : ''}
    ${clip.fadeOut > 0 ? '<span class="fadebadge out">◣</span>' : ''}
    ${kfMarks}
    <div class="edge left"></div><div class="edge right"></div>
    <div class="name">${name}</div>
  </div>`
}

function renderTimeline () {
  if (!state.project) return
  const hasAny = state.project.media.length > 0
  els.emptyHint.hidden = hasAny
  els.transport.hidden = !hasAny
  els.timelineArea.hidden = !hasAny
  els.bigPlay.hidden = state.playing || !hasAny
  $('#previewZoombar').hidden = !hasAny
  renderLibrary()
  if (!hasAny) return

  const total = Math.max(projectDuration(), 10)
  const contentW = LABEL_W + total * state.pxPerSec + 260
  renderRuler(total, contentW)

  // Anzeige: Videospuren von oben (hoechste) nach unten (V1), darunter Ton
  const display = [...videoTracks()].reverse().concat(audioTracks())
  let html = ''
  for (const track of display) {
    const removable = track.id !== 'V1'
    const eyeIcon = track.type === 'video'
      ? (track.hidden ? ICON.eyeOff : ICON.eye)
      : (track.hidden ? ICON.soundOff : ICON.sound)
    const eyeTitle = track.type === 'video'
      ? (track.hidden ? 'Spur wieder einblenden' : 'Spur ausblenden')
      : (track.hidden ? 'Spur wieder hörbar machen' : 'Spur stummschalten')
    const duckBtn = track.type === 'audio'
      ? `<button class="duck${track.duck ? ' on' : ''}" data-duck="${track.id}"
           title="${track.duck ? 'Auto-Ducking aktiv: Musik weicht dem Video-Ton' : 'Auto-Ducking: Musik automatisch absenken, wenn Video-Ton läuft'}">${ICON.duck}</button>`
      : ''
    html += `<div class="track ${track.type}${track.hidden ? ' hidden-track' : ''}" data-track="${track.id}" style="width:${contentW}px">
      <div class="track-label"><span>${track.label}</span>
        <div class="lrow"><button class="eye${track.hidden ? ' off' : ''}" data-eye="${track.id}" title="${eyeTitle}">${eyeIcon}</button>${duckBtn}</div>
        ${removable ? `<button class="rm" data-rmtrack="${track.id}" title="Spur entfernen">✕ entfernen</button>` : ''}
      </div>
      <div class="lane" data-track="${track.id}">`
    for (const clip of track.clips) html += clipHtml(clip, track)
    if (track.id === 'V1') {
      track.clips.forEach((clip, i) => {
        if (i === 0) return
        const has = clip.transition?.type !== 'none'
        html += `<div class="seam${has ? ' has' : ''}" data-seam-for="${clip.id}"
          style="left:${(clip.start + (has ? clip.transition.duration / 2 : 0)) * state.pxPerSec}px">
          <div class="dot">${has ? TRANSITION_ICONS[clip.transition.type] ?? '✦' : '+'}</div>
        </div>`
      })
    }
    html += '</div></div>'
  }
  els.tracks.innerHTML = html
  updatePlayhead(); updateTimecode(); updateRangeBar()
}

// ------------------------------------------------------------- Ablage
function renderLibrary () {
  const media = state.project?.media ?? []
  els.libHint.hidden = media.length > 0
  els.libItems.innerHTML = media.map(m => {
    const kind = m.isImage ? ICON.media : m.hasVideo ? ICON.play : ICON.sound
    const visual = m.poster
      ? `<img src="/cache/${m.poster}" draggable="false">`
      : `<div class="li-audio">${ICON.sound}</div>`
    return `<div class="lib-item" data-media="${m.id}">
      ${visual}
      <span class="li-kind">${kind}</span>
      ${!m.isImage ? `<span class="li-dur">${fmt(m.duration)}</span>` : ''}
      <button class="li-rm" data-rmmedia="${m.id}" title="Aus der Ablage entfernen">✕</button>
      <div class="li-name">${m.name}</div>
    </div>`
  }).join('')
}

/** Clip aus einem Ablage-Element erzeugen und auf eine Spur legen. */
function insertClip (media, trackId, at) {
  const track = trackById(trackId)
  if (!track) return null
  const clip = {
    id: newClipId(),
    mediaId: media.id,
    start: Math.max(0, at),
    in: 0,
    out: media.isImage ? IMAGE_DEFAULT_DUR : media.duration,
    volume: 1, scale: 1, x: 0, y: 0, opacity: 1, fadeIn: 0, fadeOut: 0,
    transition: { type: 'none', duration: 0.5 }
  }
  track.clips.push(clip)
  if (track.id === 'V1') repack()
  else track.clips.sort((a, b) => a.start - b.start)
  return clip
}

function defaultTrackFor (media) {
  return media.hasVideo ? 'V1' : (audioTracks()[0]?.id ?? 'A1')
}

els.libItems.addEventListener('dblclick', e => {
  const item = e.target.closest('.lib-item')
  if (!item) return
  const media = state.project.media.find(m => m.id === item.dataset.media)
  if (!media) return
  const trackId = defaultTrackFor(media)
  const end = trackById(trackId).clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
  const clip = insertClip(media, trackId, end)
  renderTimeline(); selectClip(clip.id); scheduleAutosave()
})

els.libItems.addEventListener('click', e => {
  const rm = e.target.closest('[data-rmmedia]')
  if (!rm) return
  const media = state.project.media.find(m => m.id === rm.dataset.rmmedia)
  const used = state.project.tracks.reduce((n, t) => n + t.clips.filter(c => c.mediaId === media.id).length, 0)
  if (used > 0 && !confirm(`„${media.name}" wird ${used}× benutzt. Trotzdem entfernen?`)) return
  for (const t of state.project.tracks) t.clips = t.clips.filter(c => c.mediaId !== media.id)
  state.project.media = state.project.media.filter(m => m.id !== media.id)
  repack(); selectClip(null); renderTimeline(); scheduleAutosave()
})

// Ziehen aus der Ablage auf eine Spur
let libDrag = null
els.libItems.addEventListener('pointerdown', e => {
  if (e.target.closest('[data-rmmedia]')) return
  const item = e.target.closest('.lib-item')
  if (!item) return
  const media = state.project.media.find(m => m.id === item.dataset.media)
  if (!media) return
  libDrag = { media, started: false, startX: e.clientX, startY: e.clientY }
  els.libItems.setPointerCapture(e.pointerId)
})

document.addEventListener('pointermove', e => {
  if (!libDrag) return
  if (!libDrag.started) {
    if (Math.hypot(e.clientX - libDrag.startX, e.clientY - libDrag.startY) < 6) return
    libDrag.started = true
    const m = libDrag.media
    els.ghost.innerHTML = m.poster ? `<img src="/cache/${m.poster}">` : `<div class="g-audio">${ICON.sound}</div>`
    els.ghost.hidden = false
  }
  els.ghost.style.left = `${e.clientX + 10}px`
  els.ghost.style.top = `${e.clientY + 10}px`
  document.querySelectorAll('.lane.droptarget').forEach(l => l.classList.remove('droptarget'))
  const lane = laneAt(e)
  if (lane && trackById(lane.dataset.track)?.type === (libDrag.media.hasVideo ? 'video' : 'audio')) {
    lane.classList.add('droptarget')
    const sn = snapTime(timeAt(e), null, e.altKey)
    if (sn.snapped) showSnapLine(sn.t); else hideSnapLine()
  } else hideSnapLine()
})

document.addEventListener('pointerup', e => {
  if (!libDrag) return
  const drag = libDrag
  libDrag = null
  els.ghost.hidden = true
  document.querySelectorAll('.lane.droptarget').forEach(l => l.classList.remove('droptarget'))
  if (!drag.started) return
  const lane = laneAt(e)
  if (!lane) return
  hideSnapLine()
  const track = trackById(lane.dataset.track)
  const wantType = drag.media.hasVideo ? 'video' : 'audio'
  if (track?.type !== wantType) return
  const clip = insertClip(drag.media, track.id, snapTime(timeAt(e), null, e.altKey).t)
  renderTimeline(); if (clip) selectClip(clip.id); scheduleAutosave()
})

function laneAt (e) {
  return document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.lane') ?? null
}
function timeAt (e) {
  const rect = els.tracks.getBoundingClientRect()
  return Math.max(0, (e.clientX - rect.left - LABEL_W) / state.pxPerSec)
}

// ---------------------------------------------------- Auswahl & Inspektor
function selectClip (clipId) {
  state.selectedClip = clipId ? { clipId } : null
  const found = clipId ? findClip(clipId) : null
  els.inspector.hidden = !found
  $('#splitInsp').hidden = !found
  if (found) {
    const { clip, track } = found
    const media = mediaOf(clip)
    $('#inspTitle').textContent = isMg(clip)
      ? `${clip.mg?.text || 'Grafik'}`
      : isText(clip)
        ? `„${(String(clip.text ?? '').split('\n')[0] || 'Text').slice(0, 22)}“`
        : (media?.name ?? 'Clip')
    $('#inVolume').value = clip.volume; $('#volOut').textContent = `${Math.round(clip.volume * 100)} %`
    $('#inScale').value = clip.scale; $('#scaleOut').textContent = `${Math.round(clip.scale * 100)} %`
    $('#inOpacity').value = clip.opacity; $('#opacityOut').textContent = `${Math.round((1 - clip.opacity) * 100)} %`
    $('#inFadeIn').value = clip.fadeIn; $('#fadeInOut').textContent = clip.fadeIn > 0 ? `${clip.fadeIn.toFixed(1)} s` : 'aus'
    $('#inFadeOut').value = clip.fadeOut; $('#fadeOutOut').textContent = clip.fadeOut > 0 ? `${clip.fadeOut.toFixed(1)} s` : 'aus'
    document.querySelector('[data-prop=volume]').style.display = media?.hasAudio ? '' : 'none'
    const visual = track.type === 'video'
    document.querySelector('[data-prop=scale]').style.display = visual ? '' : 'none'
    document.querySelector('[data-prop=opacity]').style.display = visual ? '' : 'none'
    updateColorBox(clip, track)
  }
  if (!clipId) $('#colorBox').hidden = true
  updateKfPanel()
  renderGraph()
  refreshPanels()
  renderTimeline()
}

// ---------------------------------------- Linkes Panel: Tabs & Anwenden
document.querySelectorAll('.ltab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.ltab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    for (const page of document.querySelectorAll('.tabpage')) {
      page.hidden = page.id !== `page-${tab.dataset.tab}`
    }
    refreshPanels()
  }
})

function selectedVideoClip () {
  const found = state.selectedClip && findClip(state.selectedClip.clipId)
  return found && found.track.type === 'video' ? found : null
}

/** Bewegungs-Panel (links): wirkt auf das ausgewaehlte Element. */
function renderFxPanel () {
  const grid = $('#fxGrid')
  const found = selectedVideoClip()
  const note = $('#fxNote')
  grid.innerHTML = ''
  for (const fx of EFFECTS) {
    const b = document.createElement('button')
    b.className = found && (found.clip.effect?.type ?? 'none') === fx.id ? 'selected' : ''
    b.innerHTML = `<span class="icon">${fx.icon}</span>${fx.label}`
    b.onclick = () => {
      const cur = selectedVideoClip()
      if (!cur) {
        note.hidden = false
        note.textContent = 'Wähle zuerst ein Element in Vorschau oder Timeline aus.'
        return
      }
      note.hidden = true
      cur.clip.effect = { type: fx.id, amount: Number($('#inFxAmount').value) }
      renderFxPanel()
      scheduleAutosave()
      if (fx.id !== 'none') { seek(cur.clip.start); setPlaying(true) }
    }
    grid.appendChild(b)
  }
  if (found) {
    $('#inFxAmount').value = found.clip.effect?.amount ?? 0.5
    $('#fxOut').textContent = `${Math.round((found.clip.effect?.amount ?? 0.5) * 100)} %`
  }
}

$('#inFxAmount').addEventListener('input', e => {
  const found = selectedVideoClip()
  if (!found) return
  found.clip.effect = { type: found.clip.effect?.type ?? 'none', amount: Number(e.target.value) }
  $('#fxOut').textContent = `${Math.round(Number(e.target.value) * 100)} %`
})
$('#inFxAmount').addEventListener('change', scheduleAutosave)

// ---------------------------------------------------- Text-Panel
function selectedTextClip () {
  const found = state.selectedClip && findClip(state.selectedClip.clipId)
  return found && isText(found.clip) ? found : null
}

function addTextClip () {
  const t = state.time
  const dur = 3
  // freie Overlay-Spur suchen, sonst neue anlegen
  let track = videoTracks().find(tr =>
    tr.id !== 'V1' && !tr.clips.some(c => t < clipEnd(c) && t + dur > c.start))
  if (!track) { addTrack('video'); track = videoTracks().at(-1) }
  const clip = {
    id: newClipId(),
    type: 'text',
    mediaId: null,
    text: 'Dein Text',
    style: structuredClone(lastTextPreset.style),
    anim: { type: 'none', dur: 0.8 },
    start: t, in: 0, out: dur,
    volume: 0, scale: 1, x: 0, y: 0.3, opacity: 1, fadeIn: 0, fadeOut: 0,
    transition: { type: 'none', duration: 0 },
    effect: { type: 'none', amount: 0.5 }
  }
  track.clips.push(clip)
  track.clips.sort((a, b) => a.start - b.start)
  renderTimeline()
  selectClip(clip.id)
  $('#textInput').focus()
  $('#textInput').select()
  scheduleAutosave()
}
$('#btnAddText').onclick = addTextClip

function renderTextPanel () {
  const found = selectedTextClip()
  $('#textEditBox').hidden = !found
  $('#textHint').hidden = Boolean(found)
  const grid = $('#textPresetGrid')
  grid.innerHTML = ''
  for (const preset of TEXT_PRESETS) {
    const b = document.createElement('button')
    const st = preset.style
    b.className = found?.clip.style?.preset === preset.id ? 'selected' : ''
    b.textContent = preset.label
    b.style.fontFamily = TEXT_FONT_STACK[st.font]
    b.style.fontWeight = st.bold ? '700' : '400'
    b.style.color = st.color
    if (st.bg) b.style.background = hexToRgba(st.bg, st.bgAlpha ?? 0.65)
    if (st.stroke > 0) b.style.webkitTextStroke = `1px ${st.strokeColor}`
    if (st.shadow > 0.3) b.style.textShadow = `0 0 8px ${st.shadowColor}`
    b.onclick = () => {
      lastTextPreset = preset
      const cur = selectedTextClip()
      if (cur) {
        cur.clip.style = { ...structuredClone(preset.style), preset: preset.id }
        renderTextPanel(); scheduleAutosave()
      } else {
        addTextClip()
        const neu = selectedTextClip()
        if (neu) { neu.clip.style = { ...structuredClone(preset.style), preset: preset.id }; renderTextPanel() }
      }
    }
    grid.appendChild(b)
  }
  if (!found) return
  const st = found.clip.style ?? {}
  $('#textInput').value = found.clip.text ?? ''
  $('#textFont').value = st.font ?? 'sans'
  $('#textBold').checked = Boolean(st.bold)
  $('#textSize').value = st.size ?? 0.07
  $('#textSizeOut').textContent = `${Math.round((st.size ?? 0.07) * 100)} %`
  $('#textColor').value = st.color ?? '#ffffff'
  $('#textStrokeColor').value = st.strokeColor ?? '#000000'
  $('#textStroke').value = st.stroke ?? 0
  $('#textStrokeOut').textContent = (st.stroke ?? 0) > 0 ? `${Math.round(st.stroke * 100)} %` : 'aus'
  $('#textBgOn').checked = Boolean(st.bg)
  $('#textBgColor').value = st.bg ?? '#000000'
  $('#textAnim').value = found.clip.anim?.type ?? 'none'
  $('#textAnimDur').value = found.clip.anim?.dur ?? 0.8
  $('#textAnimDurOut').textContent = `${(found.clip.anim?.dur ?? 0.8).toFixed(1)} s`
}

function bindTextControl (sel, apply, refreshTimeline = false) {
  $(sel).addEventListener('input', e => {
    const found = selectedTextClip()
    if (!found) return
    found.clip.style = found.clip.style ?? {}
    apply(found.clip, e.target)
    if (refreshTimeline) renderTimeline()
  })
  $(sel).addEventListener('change', scheduleAutosave)
}
bindTextControl('#textInput', (c, el) => { c.text = el.value }, true)
bindTextControl('#textFont', (c, el) => { c.style.font = el.value; delete c.style.preset })
bindTextControl('#textBold', (c, el) => { c.style.bold = el.checked; delete c.style.preset })
bindTextControl('#textSize', (c, el) => {
  c.style.size = Number(el.value); delete c.style.preset
  $('#textSizeOut').textContent = `${Math.round(Number(el.value) * 100)} %`
})
bindTextControl('#textColor', (c, el) => { c.style.color = el.value; delete c.style.preset })
bindTextControl('#textStrokeColor', (c, el) => { c.style.strokeColor = el.value; delete c.style.preset })
bindTextControl('#textStroke', (c, el) => {
  c.style.stroke = Number(el.value); delete c.style.preset
  $('#textStrokeOut').textContent = Number(el.value) > 0 ? `${Math.round(Number(el.value) * 100)} %` : 'aus'
})
bindTextControl('#textBgOn', (c, el) => { c.style.bg = el.checked ? $('#textBgColor').value : null; delete c.style.preset })
bindTextControl('#textBgColor', (c, el) => { if ($('#textBgOn').checked) c.style.bg = el.value; delete c.style.preset })
bindTextControl('#textAnim', (c, el) => {
  c.anim = { type: el.value, dur: Number($('#textAnimDur').value) || 0.8 }
  if (el.value !== 'none') { seek(c.start); setPlaying(true) }
})
bindTextControl('#textAnimDur', (c, el) => {
  c.anim = { type: c.anim?.type ?? 'none', dur: Number(el.value) }
  $('#textAnimDurOut').textContent = `${Number(el.value).toFixed(1)} s`
})

// ---------------------------------------------------- Motion Graphics
let lastMgPreset = MG_PRESETS[0]

function selectedMgClip () {
  const found = state.selectedClip && findClip(state.selectedClip.clipId)
  return found && isMg(found.clip) ? found : null
}

function addMgClip (preset = lastMgPreset) {
  const t = state.time
  const dur = 4
  let track = videoTracks().find(tr =>
    tr.id !== 'V1' && !tr.clips.some(c => t < clipEnd(c) && t + dur > c.start))
  if (!track) { addTrack('video'); track = videoTracks().at(-1) }
  const clip = {
    id: newClipId(),
    type: 'mg',
    mediaId: null,
    mg: { preset: preset.id, ...structuredClone(preset.defaults) },
    start: t, in: 0, out: dur,
    volume: 0, scale: 1, x: 0, y: 0, opacity: 1, fadeIn: 0, fadeOut: 0,
    transition: { type: 'none', duration: 0 },
    effect: { type: 'none', amount: 0.5 },
    anim: { type: 'none', dur: 0.8 }
  }
  track.clips.push(clip)
  track.clips.sort((a, b) => a.start - b.start)
  renderTimeline(); selectClip(clip.id); scheduleAutosave()
  seek(t); setPlaying(true)
}
$('#btnAddMg').onclick = () => addMgClip()

function renderMgPanel () {
  const found = selectedMgClip()
  $('#mgEditBox').hidden = !found
  $('#mgHint').hidden = Boolean(found)
  const grid = $('#mgPresetGrid')
  grid.innerHTML = ''
  for (const preset of MG_PRESETS) {
    const b = document.createElement('button')
    b.className = found?.clip.mg?.preset === preset.id ? 'selected' : ''
    b.innerHTML = `<span class="icon">${MG_ICONS[preset.id] ?? ICON.mg}</span>${preset.label}`
    b.onclick = () => {
      lastMgPreset = preset
      const cur = selectedMgClip()
      if (cur) {
        const keep = cur.clip.mg
        cur.clip.mg = { preset: preset.id, ...structuredClone(preset.defaults), text: keep.text, accent: keep.accent }
        renderMgPanel(); scheduleAutosave()
        seek(cur.clip.start); setPlaying(true)
      } else {
        addMgClip(preset)
      }
    }
    grid.appendChild(b)
  }
  if (!found) return
  const mg = found.clip.mg
  const preset = MG_PRESETS.find(p => p.id === mg.preset) ?? MG_PRESETS[0]
  $('#mgText').value = mg.text ?? ''
  $('#mgText').closest('.panel-field').style.display = preset.fields.includes('text') ? '' : 'none'
  $('#mgSubWrap').style.display = preset.fields.includes('sub') ? '' : 'none'
  $('#mgSub').value = mg.sub ?? ''
  $('#mgColor').value = mg.color ?? '#ffffff'
  $('#mgAccent').value = mg.accent ?? '#00d3c8'
  $('#mgSize').value = mg.size ?? 0.1
  $('#mgSizeOut').textContent = `${Math.round((mg.size ?? 0.1) * 100)} %`
  $('#mgSpeed').value = mg.speed ?? 1
  $('#mgSpeedOut').textContent = `${(mg.speed ?? 1).toFixed(1)}×`
  const anim = mg.anim ?? {}
  $('#mgAnim').value = anim.preset ?? 'auto'
  $('#mgAnimDur').value = anim.dur ?? 0.65
  $('#mgAnimDurOut').textContent = `${(anim.dur ?? 0.65).toFixed(2).replace('.', ',')} s`
  $('#mgStiff').value = anim.stiffness ?? 220
  $('#mgStiffOut').textContent = String(anim.stiffness ?? 220)
  $('#mgDamp').value = anim.damping ?? 22
  $('#mgDampOut').textContent = String(anim.damping ?? 22)
  $('#mgDelay').value = anim.delay ?? 0
  $('#mgDelayOut').textContent = `${(anim.delay ?? 0).toFixed(2).replace('.', ',')} s`
  const springy = ['popIn', 'springPop'].includes(anim.preset)
  $('#mgSpringRows').style.display = springy ? '' : 'none'
}

function mgAnimOf (clip) {
  clip.mg.anim = clip.mg.anim ?? { preset: 'auto', dur: 0.65, stiffness: 220, damping: 22, delay: 0 }
  return clip.mg.anim
}

function bindMgControl (sel, apply) {
  $(sel).addEventListener('input', e => {
    const found = selectedMgClip()
    if (!found) return
    apply(found.clip.mg, e.target)
    renderTimeline()
  })
  $(sel).addEventListener('change', scheduleAutosave)
}
bindMgControl('#mgText', (mg, el) => { mg.text = el.value })
bindMgControl('#mgSub', (mg, el) => { mg.sub = el.value })
bindMgControl('#mgColor', (mg, el) => { mg.color = el.value })
bindMgControl('#mgAccent', (mg, el) => { mg.accent = el.value })
bindMgControl('#mgSize', (mg, el) => {
  mg.size = Number(el.value)
  $('#mgSizeOut').textContent = `${Math.round(mg.size * 100)} %`
})
bindMgControl('#mgSpeed', (mg, el) => {
  mg.speed = Number(el.value)
  $('#mgSpeedOut').textContent = `${mg.speed.toFixed(1)}×`
})
$('#mgAnim').addEventListener('input', e => {
  const found = selectedMgClip()
  if (!found) return
  mgAnimOf(found.clip).preset = e.target.value
  $('#mgSpringRows').style.display = ['popIn', 'springPop'].includes(e.target.value) ? '' : 'none'
  seek(found.clip.start); setPlaying(true)
})
$('#mgAnim').addEventListener('change', scheduleAutosave)
bindMgControl('#mgAnimDur', (mg, el) => {
  mg.anim = mg.anim ?? {}; mg.anim.dur = Number(el.value)
  $('#mgAnimDurOut').textContent = `${Number(el.value).toFixed(2).replace('.', ',')} s`
})
bindMgControl('#mgStiff', (mg, el) => {
  mg.anim = mg.anim ?? {}; mg.anim.stiffness = Number(el.value)
  $('#mgStiffOut').textContent = el.value
})
bindMgControl('#mgDamp', (mg, el) => {
  mg.anim = mg.anim ?? {}; mg.anim.damping = Number(el.value)
  $('#mgDampOut').textContent = el.value
})
bindMgControl('#mgDelay', (mg, el) => {
  mg.anim = mg.anim ?? {}; mg.anim.delay = Number(el.value)
  $('#mgDelayOut').textContent = `${Number(el.value).toFixed(2).replace('.', ',')} s`
})

/**
 * Grafiken UND Bild-Clips mit Bewegungseffekt als transparente PNG-Folgen
 * vorrendern. Der Browser rechnet subpixelgenau - dadurch sind Zoom und
 * Schweben im Export genauso butterweich wie in der Vorschau.
 * Liefert die Liste der vorgerenderten Clip-IDs.
 */
async function preRenderMg (onNote) {
  const clips = []
  for (const track of state.project.tracks) {
    if (track.type !== 'video' || track.hidden) continue
    for (const c of track.clips) {
      if (isMg(c)) { clips.push(c); continue }
      if (track.id === 'V1') continue
      // Bilder mit Effekt/Keyframes und Texte mit Keyframes: im Browser rendern
      const animated = (c.effect?.type && c.effect.type !== 'none') || kfActive(c)
      if (mediaOf(c)?.isImage && animated) { clips.push(c); continue }
      if (isText(c) && kfActive(c)) clips.push(c)
    }
  }
  if (!clips.length) return []
  const fps = state.project.settings.fps
  const W = state.project.settings.width
  const H = state.project.settings.height
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const c2 = canvas.getContext('2d')

  // Bilder fertig laden, bevor Frames entstehen
  for (const clip of clips) {
    const media = mediaOf(clip)
    if (media?.isImage) {
      const img = imageFor(media)
      try { await img.decode() } catch {}
    }
  }

  // Zweite Leinwand fuer Motion-Blur-Abtastungen
  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = W; sampleCanvas.height = H
  const sctx = sampleCanvas.getContext('2d')

  const drawElement = (target, clip, media, t) => {
    if (isMg(clip)) {
      mgDrawTo(target, clip, t, 1)
    } else if (isText(clip)) {
      drawTextClip(clip, t, 1, target)
    } else {
      const img = imageFor(media)
      const r = rectFor(clip, t)   // enthaelt Effekt/Keyframes, subpixelgenau
      if (img.complete && img.naturalWidth && r) {
        target.globalAlpha = fadeAlpha(clip, t)
        drawSourceColored(target, img, r, clip)
        target.globalAlpha = 1
      }
    }
  }

  const motionBlur = state.exportMotionBlur !== false
  const SAMPLES = 4               // Verschluss 180 Grad: halbes Frame-Intervall
  const shutter = 0.5 / fps

  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci]
    const media = mediaOf(clip)
    const frames = Math.max(2, Math.ceil(clipDur(clip) * fps) + 1)
    let batch = []
    let batchStart = 0
    for (let i = 0; i < frames; i++) {
      const t = clip.start + i / fps
      c2.clearRect(0, 0, W, H)
      if (motionBlur) {
        // Mehrere Abtastungen mitteln (1/(k+1)-Trick: deckende Flaechen
        // bleiben deckend, nur bewegte Kanten verwischen)
        for (let k = 0; k < SAMPLES; k++) {
          sctx.clearRect(0, 0, W, H)
          drawElement(sctx, clip, media, t + (k / Math.max(1, SAMPLES - 1)) * shutter)
          c2.globalAlpha = 1 / (k + 1)
          c2.drawImage(sampleCanvas, 0, 0)
        }
        c2.globalAlpha = 1
      } else {
        drawElement(c2, clip, media, t)
      }
      batch.push(canvas.toDataURL('image/png').split(',')[1])
      if (batch.length >= 6 || i === frames - 1) {
        await api('/api/mg/frames', { clipId: clip.id, start: batchStart, frames: batch, reset: batchStart === 0 })
        batchStart = i + 1
        batch = []
        onNote?.(`Element ${ci + 1}/${clips.length} wird vorbereitet … ${Math.round(((i + 1) / frames) * 100)} %`)
      }
    }
  }
  return clips.map(c => c.id)
}

// ---------------------------------------------------- Untertitel
function subtitleTrack () {
  let track = videoTracks().find(t => t.label === 'Untertitel')
  if (!track) {
    addTrack('video')
    track = videoTracks().at(-1)
    track.label = 'Untertitel'
  }
  return track
}

function insertSubtitles (segments) {
  if (!segments.length) return 0
  const preset = TEXT_PRESETS.find(p => p.id === 'untertitel')
  const track = subtitleTrack()
  for (const seg of segments) {
    track.clips.push({
      id: newClipId(),
      type: 'text',
      subtitle: true,
      mediaId: null,
      text: seg.text,
      style: { ...structuredClone(preset.style), preset: 'untertitel' },
      anim: { type: 'none', dur: 0.8 },
      start: Math.max(0, seg.start),
      in: 0,
      out: Math.max(0.3, seg.end - seg.start),
      volume: 0, scale: 1, x: 0, y: 0.38, opacity: 1, fadeIn: 0, fadeOut: 0,
      transition: { type: 'none', duration: 0 },
      effect: { type: 'none', amount: 0.5 }
    })
  }
  track.clips.sort((a, b) => a.start - b.start)
  renderTimeline(); scheduleAutosave()
  return segments.length
}

$('#btnAutoSubs').onclick = async () => {
  const note = $('#subsNote')
  note.hidden = false
  if (!state.whisper) {
    note.textContent = 'Die Spracherkennung ist auf diesem Rechner noch nicht eingerichtet.'
    return
  }
  setPlaying(false)
  const btn = $('#btnAutoSubs')
  btn.disabled = true
  note.textContent = 'Ton wird vorbereitet …'
  try {
    const { jobId } = await api('/api/subtitles/run', { project: state.project, language: 'de' })
    await new Promise((resolve, reject) => {
      const poll = setInterval(async () => {
        const job = await api(`/api/job/${jobId}`)
        note.textContent = `${job.note} … ${job.percent ?? 0} %`
        if (job.state === 'fertig') {
          clearInterval(poll)
          const n = insertSubtitles(job.segments ?? [])
          note.textContent = n > 0
            ? `✓ ${n} Untertitel auf der Spur „Untertitel“ eingefügt – jeder ist als Text-Clip bearbeitbar.`
            : 'Keine Sprache gefunden.'
          resolve()
        }
        if (job.state === 'fehler') { clearInterval(poll); note.textContent = `Fehler: ${job.note}`; resolve() }
      }, 600)
    })
  } finally {
    btn.disabled = false
  }
}

$('#btnSrtImport').onclick = async () => {
  const note = $('#subsNote')
  const { segments } = await api('/api/subtitles/srt', {})
  if (!segments?.length) return
  const n = insertSubtitles(segments)
  note.hidden = false
  note.textContent = `✓ ${n} Untertitel aus der SRT-Datei eingefügt.`
}

/** Uebergangs-Panel (links): wirkt auf den ausgewaehlten Clip der Hauptspur. */
function transTarget () {
  const found = state.selectedClip && findClip(state.selectedClip.clipId)
  if (!found || found.track.id !== 'V1') return null
  const idx = found.track.clips.indexOf(found.clip)
  return idx > 0 ? found.clip : null
}

function renderTransPanel () {
  const grid = $('#transPanelGrid')
  const target = transTarget()
  const note = $('#transNote')
  grid.innerHTML = ''
  for (const t of state.transitions) {
    const b = document.createElement('button')
    b.className = target && target.transition?.type === t.id ? 'selected' : ''
    b.dataset.trans = t.id
    b.innerHTML = `<span class="icon">${TRANSITION_ICONS[t.id] ?? '✦'}</span>${t.label}`
    b.onclick = () => {
      if (transDragConsumed) { transDragConsumed = false; return }
      const dur = Number($('#ltransDur').value)
      const cur = transTarget()
      if (cur) {
        note.hidden = true
        cur.transition = { type: t.id, duration: dur }
        repack(); renderTimeline(); renderTransPanel(); scheduleAutosave()
        if (t.id !== 'none') { seek(Math.max(0, cur.start - 0.7)); setPlaying(true) }
        return
      }
      // Ausgewaehlter Clip auf freier Spur: Blende zum Vorgaenger
      const found = state.selectedClip && findClip(state.selectedClip.clipId)
      if (found && found.track.type === 'video' && found.track.id !== 'V1') {
        const idx = found.track.clips.indexOf(found.clip)
        const prev = found.track.clips[idx - 1]
        if (prev && Math.abs(found.clip.start - clipEnd(prev)) < 0.6) {
          applyOverlayBlend(prev, found.clip, found.track, dur)
          note.hidden = false
          note.textContent = 'Weiche Blende zum vorherigen Clip eingefügt ✓'
          renderTimeline(); scheduleAutosave()
          seek(Math.max(0, found.clip.start - 0.7)); setPlaying(true)
          return
        }
      }
      note.hidden = false
      note.textContent = 'Wähle einen Clip aus, der einen Nachbarn hat – oder zieh die Karte direkt auf die Schnittstelle.'
    }
    grid.appendChild(b)
  }
  if (target?.transition?.duration) {
    $('#ltransDur').value = target.transition.duration
    $('#ltransOut').textContent = `${String(target.transition.duration).replace('.', ',')} s`
  }
}

$('#ltransDur').addEventListener('input', e => {
  $('#ltransOut').textContent = `${String(e.target.value).replace('.', ',')} s`
  const cur = transTarget()
  if (cur && cur.transition.type !== 'none') {
    cur.transition.duration = Number(e.target.value)
    repack(); renderTimeline()
  }
})
$('#ltransDur').addEventListener('change', scheduleAutosave)

// Uebergaenge aus der Sammlung per Ziehen auf eine Schnittstelle legen
let transDrag = null
let transDragConsumed = false

function nearestBoundary (e) {
  const rect = els.tlScroll.getBoundingClientRect()
  if (e.clientY < rect.top || e.clientY > rect.bottom ||
      e.clientX < rect.left || e.clientX > rect.right) return null
  const t = timeAt(e)
  let best = null
  const consider = cand => { if (!best || cand.d < best.d) best = cand }

  // Bevorzugt die Spur direkt unter dem Mauszeiger, sonst alle Videospuren
  const laneTrack = trackById(laneAt(e)?.dataset.track ?? '')
  const searchTracks = laneTrack?.type === 'video' ? [laneTrack] : videoTracks()

  for (const track of searchTracks) {
    const clips = track.clips
    for (let i = 1; i < clips.length; i++) {
      const a = clips[i - 1]
      const b = clips[i]
      if (track.id === 'V1') {
        const bt = b.start + (b.transition?.type !== 'none' ? b.transition.duration / 2 : 0)
        consider({ mode: 'v1', clip: b, d: Math.abs(bt - t), bt })
      } else {
        // Overlay-Naht: nur wenn die Clips (fast) aneinanderstossen
        if (Math.abs(b.start - clipEnd(a)) > 0.35) continue
        const bt = (clipEnd(a) + b.start) / 2
        consider({ mode: 'overlay', a, b, track, d: Math.abs(bt - t), bt })
      }
    }
  }
  return best && best.d * state.pxPerSec < 90 ? best : null
}

/** Auf freien Spuren wird ein Uebergang zur weichen Alpha-Blende mit Ueberlappung. */
function applyOverlayBlend (a, b, track, dur) {
  const maxDur = Math.min(dur, clipDur(a) * 0.5, clipDur(b) * 0.5)
  b.start = Math.max(0, clipEnd(a) - maxDur)
  a.fadeOut = Math.max(a.fadeOut ?? 0, maxDur)
  b.fadeIn = Math.max(b.fadeIn ?? 0, maxDur)
  track.clips.sort((x, y) => x.start - y.start)
}

$('#transPanelGrid').addEventListener('pointerdown', e => {
  const b = e.target.closest('button[data-trans]')
  if (!b) return
  transDrag = { type: b.dataset.trans, started: false, startX: e.clientX, startY: e.clientY }
  $('#transPanelGrid').setPointerCapture(e.pointerId)
})

document.addEventListener('pointermove', e => {
  if (!transDrag) return
  if (!transDrag.started) {
    if (Math.hypot(e.clientX - transDrag.startX, e.clientY - transDrag.startY) < 6) return
    transDrag.started = true
    els.ghost.innerHTML = `<div class="g-audio" style="font-size:22px">${TRANSITION_ICONS[transDrag.type] ?? '✦'}</div>`
    els.ghost.hidden = false
  }
  els.ghost.style.left = `${e.clientX + 10}px`
  els.ghost.style.top = `${e.clientY + 10}px`
  const hit = nearestBoundary(e)
  transDrag.target = hit?.clip ?? null
  if (hit) showSnapLine(hit.bt); else hideSnapLine()
})

document.addEventListener('pointerup', e => {
  if (!transDrag) return
  const drag = transDrag
  transDrag = null
  els.ghost.hidden = true
  hideSnapLine()
  if (!drag.started) return
  transDragConsumed = true
  const hit = nearestBoundary(e)
  const note = $('#transNote')
  if (!hit) {
    note.hidden = false
    note.textContent = 'Lass den Übergang dort los, wo zwei Clips aneinanderstoßen.'
    return
  }
  const dur = Number($('#ltransDur').value)
  if (hit.mode === 'v1') {
    hit.clip.transition = { type: drag.type, duration: dur }
    repack()
    note.hidden = true
    if (drag.type !== 'none') { seek(Math.max(0, hit.clip.start - 0.7)); setPlaying(true) }
  } else {
    applyOverlayBlend(hit.a, hit.b, hit.track, dur)
    note.hidden = false
    note.textContent = drag.type === 'fade' || drag.type === 'none'
      ? 'Weiche Blende eingefügt ✓'
      : 'Auf Überlagerungs-Spuren wird daraus eine weiche Blende ✓'
    seek(Math.max(0, hit.b.start - 0.7)); setPlaying(true)
  }
  renderTimeline(); renderTransPanel(); scheduleAutosave()
})

function refreshPanels () {
  if (!$('#page-fx').hidden) renderFxPanel()
  if (!$('#page-trans').hidden) renderTransPanel()
  if (!$('#page-text').hidden) renderTextPanel()
  if (!$('#page-mg').hidden) renderMgPanel()
}

// ------------------------------------------------ Render-Bereich
function getRange () {
  const r = state.project?.range
  return r && r.out > r.in + 0.05 ? r : null
}

function updateRangeBar () {
  const bar = $('#rangeBar')
  const r = getRange()
  $('#btnRange').classList.toggle('active', Boolean(r))
  if (!r) { bar.hidden = true; return }
  bar.hidden = false
  bar.style.left = `${LABEL_W + r.in * state.pxPerSec}px`
  bar.style.width = `${(r.out - r.in) * state.pxPerSec}px`
}

$('#btnRange').onclick = () => {
  if (getRange()) {
    state.project.range = null
  } else {
    const total = projectDuration()
    // Standard: rund um den Abspielkopf, sonst alles
    state.project.range = total > 0.2
      ? { in: 0, out: total }
      : null
  }
  updateRangeBar(); scheduleAutosave()
}

let rangeDrag = null
$('#rangeBar').addEventListener('pointerdown', e => {
  const handle = e.target.closest('.range-handle')
  if (!handle) return
  e.stopPropagation()
  rangeDrag = { side: handle.classList.contains('left') ? 'in' : 'out' }
  els.tlScroll.setPointerCapture(e.pointerId)
})
els.tlScroll.addEventListener('pointermove', e => {
  if (!rangeDrag) return
  const r = state.project.range
  if (!r) { rangeDrag = null; return }
  const t = snapTime(timeAt(e), null, e.altKey).t
  if (rangeDrag.side === 'in') r.in = Math.max(0, Math.min(t, r.out - 0.1))
  else r.out = Math.min(projectDuration(), Math.max(t, r.in + 0.1))
  updateRangeBar()
})
els.tlScroll.addEventListener('pointerup', () => {
  if (rangeDrag) { rangeDrag = null; scheduleAutosave() }
})

// Einrasten-Schalter in der Timeline-Werkzeugleiste
$('#btnSnap').onclick = () => {
  state.snapOn = !state.snapOn
  $('#btnSnap').classList.toggle('active', state.snapOn)
}

// Farb-Bereich im Inspector
function colorOf (clip) {
  clip.color = clip.color ?? { bright: 0, contrast: 0, sat: 0, temp: 0, look: 'none' }
  return clip.color
}

function updateColorBox (clip, track) {
  const box = $('#colorBox')
  const ok = clip && track?.type === 'video' && mediaOf(clip)
  box.hidden = !ok
  if (!ok) return
  const c = clip.color ?? { bright: 0, contrast: 0, sat: 0, temp: 0, look: 'none' }
  renderLookChips(clip)
  const setVal = (id, out, v, pct = true) => {
    $(id).value = v
    $(out).textContent = pct ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}` : String(v)
  }
  setVal('#colBright', '#colBrightOut', c.bright ?? 0)
  setVal('#colContrast', '#colContrastOut', c.contrast ?? 0)
  setVal('#colSat', '#colSatOut', c.sat ?? 0)
  setVal('#colTemp', '#colTempOut', c.temp ?? 0)
}

/** Look als CSS-Filter fuer die Vorschau-Kacheln (Waerme angenaehert). */
function lookChipCss (v) {
  const parts = []
  if (v.bright) parts.push(`brightness(${1 + v.bright})`)
  if (v.contrast) parts.push(`contrast(${1 + v.contrast})`)
  if (v.sat !== 0) parts.push(`saturate(${Math.max(0, 1 + v.sat)})`)
  if (v.temp > 0) parts.push(`sepia(${(v.temp * 0.45).toFixed(2)}) saturate(1.15)`)
  if (v.temp < 0) parts.push(`hue-rotate(${Math.round(v.temp * -28)}deg)`)
  return parts.join(' ')
}

function renderLookChips (clip) {
  const wrap = $('#lookChips')
  const media = mediaOf(clip)
  const poster = media?.poster ? `/cache/${media.poster}` : null
  wrap.innerHTML = ''
  for (const look of LOOKS) {
    const b = document.createElement('button')
    b.className = 'lookchip' + ((clip.color?.look ?? 'none') === look.id ? ' selected' : '')
    const visual = poster
      ? `<img src="${poster}" draggable="false" style="filter:${lookChipCss(look.v)}">`
      : `<div class="ph" style="filter:${lookChipCss(look.v)}"></div>`
    b.innerHTML = `${visual}<span>${look.label}</span>`
    b.onclick = () => {
      clip.color = { ...look.v, look: look.id }
      updateColorBox(clip, findClip(clip.id)?.track)
      renderFrame(); scheduleAutosave()
    }
    wrap.appendChild(b)
  }
  $('#colState').textContent = clip.color?.look === 'custom' ? 'Eigene Einstellung' : ''
}

function bindColor (id, out, prop) {
  $(id).addEventListener('input', e => {
    const found = state.selectedClip && findClip(state.selectedClip.clipId)
    if (!found) return
    const c = colorOf(found.clip)
    c[prop] = Number(e.target.value)
    c.look = 'custom'
    const v = c[prop]
    $(out).textContent = `${v > 0 ? '+' : ''}${Math.round(v * 100)}`
    document.querySelectorAll('.lookchip').forEach(x => x.classList.remove('selected'))
    $('#colState').textContent = 'Eigene Einstellung'
    renderFrame()
  })
  $(id).addEventListener('change', scheduleAutosave)
}
bindColor('#colBright', '#colBrightOut', 'bright')
bindColor('#colContrast', '#colContrastOut', 'contrast')
bindColor('#colSat', '#colSatOut', 'sat')
bindColor('#colTemp', '#colTempOut', 'temp')

function bindSlider (input, outSel, apply, format) {
  $(input).addEventListener('input', e => {
    const found = state.selectedClip && findClip(state.selectedClip.clipId)
    if (!found) return
    const val = Number(e.target.value)
    apply(found.clip, val)
    $(outSel).textContent = format(val)
    renderFrame()
  })
  $(input).addEventListener('change', () => { renderTimeline(); scheduleAutosave() })
}
bindSlider('#inVolume', '#volOut', (c, v) => { c.volume = v }, v => `${Math.round(v * 100)} %`)
bindSlider('#inScale', '#scaleOut', (c, v) => { c.scale = v }, v => `${Math.round(v * 100)} %`)
bindSlider('#inOpacity', '#opacityOut', (c, v) => { c.opacity = v }, v => `${Math.round((1 - v) * 100)} %`)
bindSlider('#inFadeIn', '#fadeInOut', (c, v) => { c.fadeIn = v }, v => v > 0 ? `${v.toFixed(1)} s` : 'aus')
bindSlider('#inFadeOut', '#fadeOutOut', (c, v) => { c.fadeOut = v }, v => v > 0 ? `${v.toFixed(1)} s` : 'aus')

// ---------------------------------------------------- Keyframe-Steuerung
function kfEligible (found) {
  if (!found || found.track.type !== 'video' || found.track.id === 'V1') return false
  const c = found.clip
  return isText(c) || isMg(c) || mediaOf(c)?.isImage
}

function addKeyframeHere () {
  const found = state.selectedClip && findClip(state.selectedClip.clipId)
  if (!kfEligible(found)) return
  const c = found.clip
  const lt = state.time - c.start
  if (lt < -0.001 || lt > clipDur(c) + 0.001) return
  const kv = kfValues(c, state.time)
  setKf(c, 'x', lt, kv.x)
  setKf(c, 'y', lt, kv.y)
  setKf(c, 'scale', lt, kv.scale)
  setKf(c, 'opacity', lt, kv.opacity)
  renderTimeline(); updateKfPanel(); scheduleAutosave()
}

function clearKeyframes () {
  const found = state.selectedClip && findClip(state.selectedClip.clipId)
  if (!found) return
  // Aktuellen Zustand als statische Werte uebernehmen
  const kv = kfValues(found.clip, state.time)
  Object.assign(found.clip, { x: kv.x, y: kv.y, scale: kv.scale, opacity: kv.opacity })
  delete found.clip.keyframes
  renderTimeline(); updateKfPanel(); scheduleAutosave()
}

function updateKfPanel () {
  const found = state.selectedClip && findClip(state.selectedClip.clipId)
  const box = $('#kfBox')
  if (!box) return
  const ok = kfEligible(found)
  box.hidden = !ok
  if (!ok) return
  const n = found.clip.keyframes
    ? new Set(Object.values(found.clip.keyframes).flat().map(k => Math.round(k.t * 100))).size
    : 0
  $('#kfCount').textContent = n > 0 ? `${n} Keyframes` : 'Keine Keyframes'
}

$('#btnKfAdd').onclick = addKeyframeHere
$('#btnKfClear').onclick = clearKeyframes

// ---------------------------------------------------- Graph-Editor
const graph = { prop: 'x', sel: -1, drag: null }
const PROP_RANGES = { x: [-1, 1], y: [-1, 1], scale: [0, 4], opacity: [0, 1] }
const gCanvas = $('#graphCanvas')
const gctx = gCanvas.getContext('2d')

function graphClip () {
  const found = state.selectedClip && findClip(state.selectedClip.clipId)
  return found && kfEligible(found) ? found.clip : null
}

function openGraph () {
  $('#graphPanel').hidden = false
  renderGraph()
  // nach dem Layout nochmal mit korrekter Breite zeichnen
  requestAnimationFrame(renderGraph)
}
window.addEventListener('resize', () => { if (!$('#graphPanel').hidden) renderGraph() })
function closeGraph () { $('#graphPanel').hidden = true }
$('#btnKfGraph').onclick = () => { $('#graphPanel').hidden ? openGraph() : closeGraph() }
$('#btnGraphClose').onclick = closeGraph

document.querySelectorAll('.gprop').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.gprop').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
    graph.prop = b.dataset.gprop
    graph.sel = -1
    renderGraph()
  }
})

/** Zeit/Wert <-> Pixel im Graph. */
function gMap (clip) {
  const dpr = window.devicePixelRatio || 1
  const W = gCanvas.width; const H = gCanvas.height
  const padL = 44 * dpr; const padR = 16 * dpr; const padT = 12 * dpr; const padB = 16 * dpr
  const dur = Math.max(clipDur(clip), 0.001)
  const keys = clip.keyframes?.[graph.prop] ?? []
  let [vMin, vMax] = PROP_RANGES[graph.prop]
  if (keys.length) {
    const vs = keys.map(k => k.v)
    vMin = Math.min(vMin, ...vs); vMax = Math.max(vMax, ...vs)
  }
  const span = Math.max(vMax - vMin, 0.1)
  vMin -= span * 0.12; vMax += span * 0.12
  return {
    tx: t => padL + (t / dur) * (W - padL - padR),
    ty: v => H - padB - ((v - vMin) / (vMax - vMin)) * (H - padT - padB),
    xt: x => ((x - padL) / (W - padL - padR)) * dur,
    yv: y => vMin + ((H - padB - y) / (H - padT - padB)) * (vMax - vMin),
    dur, vMin, vMax, dpr
  }
}

function renderGraph () {
  if ($('#graphPanel').hidden) return
  const clip = graphClip()
  const dpr = window.devicePixelRatio || 1
  const cssW = gCanvas.clientWidth || 800
  gCanvas.width = Math.round(cssW * dpr)
  gCanvas.height = Math.round(150 * dpr)
  gctx.clearRect(0, 0, gCanvas.width, gCanvas.height)
  gctx.fillStyle = '#131318'
  gctx.fillRect(0, 0, gCanvas.width, gCanvas.height)
  if (!clip) {
    gctx.fillStyle = '#6c6c7c'
    gctx.font = `${12 * dpr}px -apple-system, sans-serif`
    gctx.textAlign = 'center'
    gctx.fillText('Wähle ein Element mit Keyframes aus.', gCanvas.width / 2, gCanvas.height / 2)
    return
  }
  const m = gMap(clip)
  const keys = clip.keyframes?.[graph.prop] ?? []
  const fallback = graph.prop === 'scale' ? (clip.scale ?? 1)
    : graph.prop === 'opacity' ? (clip.opacity ?? 1)
    : (clip[graph.prop] ?? 0)

  // Raster + Nulllinie/Wertachse
  gctx.strokeStyle = 'rgba(255,255,255,0.06)'
  gctx.lineWidth = 1
  for (const v of [m.vMin + (m.vMax - m.vMin) * 0.25, (m.vMin + m.vMax) / 2, m.vMin + (m.vMax - m.vMin) * 0.75]) {
    gctx.beginPath(); gctx.moveTo(m.tx(0), m.ty(v)); gctx.lineTo(m.tx(m.dur), m.ty(v)); gctx.stroke()
  }
  gctx.fillStyle = '#6c6c7c'
  gctx.font = `${10 * m.dpr}px -apple-system, sans-serif`
  gctx.textAlign = 'right'
  const fmtV = v => graph.prop === 'scale' || graph.prop === 'opacity' ? `${Math.round(v * 100)}%` : v.toFixed(2)
  gctx.fillText(fmtV(m.vMax), m.tx(0) - 6 * m.dpr, m.ty(m.vMax) + 8 * m.dpr)
  gctx.fillText(fmtV(m.vMin), m.tx(0) - 6 * m.dpr, m.ty(m.vMin))

  // Abspielkopf
  const lt = state.time - clip.start
  if (lt >= 0 && lt <= m.dur) {
    gctx.strokeStyle = 'rgba(255,255,255,0.35)'
    gctx.beginPath(); gctx.moveTo(m.tx(lt), 0); gctx.lineTo(m.tx(lt), gCanvas.height); gctx.stroke()
  }

  // Kurve
  gctx.strokeStyle = '#00e0d2'
  gctx.lineWidth = 2 * m.dpr
  gctx.beginPath()
  const N = 220
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * m.dur
    const v = keys.length ? evalProp(keys, t, fallback) : fallback
    const x = m.tx(t); const y = m.ty(v)
    i === 0 ? gctx.moveTo(x, y) : gctx.lineTo(x, y)
  }
  gctx.stroke()

  // Keyframe-Punkte
  keys.forEach((k, i) => {
    const x = m.tx(k.t); const y = m.ty(k.v)
    gctx.save()
    gctx.translate(x, y)
    gctx.rotate(Math.PI / 4)
    const s = (i === graph.sel ? 7 : 5.5) * m.dpr
    gctx.fillStyle = i === graph.sel ? '#00e0d2' : '#fff'
    gctx.strokeStyle = 'rgba(0,0,0,0.6)'
    gctx.lineWidth = 1.5 * m.dpr
    gctx.fillRect(-s / 2, -s / 2, s, s)
    gctx.strokeRect(-s / 2, -s / 2, s, s)
    gctx.restore()
  })
}

function gPoint (e) {
  // Ueber das echte Verhaeltnis mappen - Canvas- und CSS-Groesse
  // koennen nach Layout-Aenderungen auseinanderlaufen
  const r = gCanvas.getBoundingClientRect()
  return {
    x: (e.clientX - r.left) * (gCanvas.width / Math.max(r.width, 1)),
    y: (e.clientY - r.top) * (gCanvas.height / Math.max(r.height, 1))
  }
}

function gHit (clip, p) {
  const m = gMap(clip)
  const keys = clip.keyframes?.[graph.prop] ?? []
  for (let i = 0; i < keys.length; i++) {
    if (Math.hypot(p.x - m.tx(keys[i].t), p.y - m.ty(keys[i].v)) < 16 * m.dpr) return i
  }
  return -1
}

const EASE_TO_UI = e => (e && typeof e === 'object' && e.spring) ? 'spring' : (e ?? 'easeInOut')
const UI_TO_EASE = v => v === 'spring' ? { spring: { stiffness: 220, damping: 22, mass: 1 } } : v

gCanvas.addEventListener('pointerdown', e => {
  const clip = graphClip()
  if (!clip) return
  const p = gPoint(e)
  const keys = clip.keyframes?.[graph.prop] ?? []
  const hit = gHit(clip, p)
  if (hit >= 0) {
    if (e.altKey) {
      keys.splice(hit, 1)
      if (!keys.length) delete clip.keyframes[graph.prop]
      graph.sel = -1
      renderGraph(); renderTimeline(); updateKfPanel(); scheduleAutosave()
      return
    }
    graph.sel = hit
    $('#gEase').value = EASE_TO_UI(keys[hit].ease)
    graph.drag = { i: hit }
    try { gCanvas.setPointerCapture(e.pointerId) } catch {}
    renderGraph()
  }
})

gCanvas.addEventListener('pointermove', e => {
  if (!graph.drag) return
  const clip = graphClip()
  if (!clip) return
  const m = gMap(clip)
  const keys = clip.keyframes[graph.prop]
  const k = keys[graph.drag.i]
  const p = gPoint(e)
  const tMin = graph.drag.i > 0 ? keys[graph.drag.i - 1].t + 0.03 : 0
  const tMax = graph.drag.i < keys.length - 1 ? keys[graph.drag.i + 1].t - 0.03 : m.dur
  k.t = Math.min(tMax, Math.max(tMin, m.xt(p.x)))
  const [lo, hi] = PROP_RANGES[graph.prop]
  k.v = Math.min(Math.max(m.yv(p.y), lo - 1), hi + 3)
  renderGraph()
})

gCanvas.addEventListener('pointerup', () => {
  if (!graph.drag) return
  graph.drag = null
  renderTimeline(); updateKfPanel(); scheduleAutosave()
})

gCanvas.addEventListener('dblclick', e => {
  const clip = graphClip()
  if (!clip) return
  const m = gMap(clip)
  const p = gPoint(e)
  const t = Math.min(m.dur, Math.max(0, m.xt(p.x)))
  const keys = clip.keyframes?.[graph.prop] ?? []
  const fallback = graph.prop === 'scale' ? (clip.scale ?? 1)
    : graph.prop === 'opacity' ? (clip.opacity ?? 1)
    : (clip[graph.prop] ?? 0)
  const v = keys.length ? evalProp(keys, t, fallback) : fallback
  setKf(clip, graph.prop, t, v)
  renderGraph(); renderTimeline(); updateKfPanel(); scheduleAutosave()
})

$('#gEase').addEventListener('change', e => {
  const clip = graphClip()
  if (!clip || graph.sel < 0) return
  const keys = clip.keyframes?.[graph.prop]
  if (!keys?.[graph.sel]) return
  keys[graph.sel].ease = UI_TO_EASE(e.target.value)
  renderGraph(); scheduleAutosave()
})

// ------------------------------------------------- Ziehen, Trimmen, Nähte
let drag = null
let scrub = false

/** Einrasten: an Kanten ALLER Spuren, am Abspielkopf und am Anfang.
    Alt-Taste gedrueckt = Einrasten vorübergehend aus. */
function snapTime (t, ignoreId, disabled = false) {
  if (disabled || !state.snapOn) return { t, snapped: false }
  const threshold = 10 / state.pxPerSec
  let best = null
  const consider = cand => {
    const d = Math.abs(t - cand)
    if (d < threshold && (!best || d < best.d)) best = { cand, d }
  }
  consider(0)
  consider(state.time)
  for (const tr of state.project.tracks) {
    for (const c of tr.clips) {
      if (c.id === ignoreId) continue
      consider(c.start)
      consider(clipEnd(c))
    }
  }
  return best ? { t: best.cand, snapped: true } : { t, snapped: false }
}

function showSnapLine (t) {
  const line = $('#snapLine')
  line.hidden = false
  line.style.left = `${LABEL_W + t * state.pxPerSec}px`
}
function hideSnapLine () { $('#snapLine').hidden = true }

els.tlScroll.addEventListener('pointerdown', e => {
  const seamEl = e.target.closest('.seam')
  if (seamEl) { openTransitionPicker(seamEl); return }
  const rmTrack = e.target.closest('[data-rmtrack]')
  if (rmTrack) { removeTrack(rmTrack.dataset.rmtrack); return }
  const eye = e.target.closest('[data-eye]')
  if (eye) {
    const track = trackById(eye.dataset.eye)
    track.hidden = !track.hidden
    renderTimeline(); renderFrame(); scheduleAutosave()
    return
  }
  const duckBtn = e.target.closest('[data-duck]')
  if (duckBtn) {
    const track = trackById(duckBtn.dataset.duck)
    track.duck = !track.duck
    renderTimeline(); scheduleAutosave()
    return
  }

  const kfEl = e.target.closest('.kf')
  if (kfEl) {
    const holder = findClip(kfEl.closest('.clip').dataset.clip)
    if (holder) {
      const t = Number(kfEl.dataset.kfT)
      if (e.altKey) {
        for (const prop of Object.keys(holder.clip.keyframes ?? {})) {
          holder.clip.keyframes[prop] = holder.clip.keyframes[prop].filter(k => Math.abs(k.t - t) > 0.03)
          if (!holder.clip.keyframes[prop].length) delete holder.clip.keyframes[prop]
        }
        if (!Object.keys(holder.clip.keyframes ?? {}).length) delete holder.clip.keyframes
        renderTimeline(); updateKfPanel(); scheduleAutosave()
      } else {
        selectClip(holder.clip.id)
        seek(holder.clip.start + t)
      }
    }
    return
  }
  const clipEl = e.target.closest('.clip')
  if (!clipEl) {
    // Auf Zeitleiste oder freier Flaeche: Abspielkopf packen und frei ziehen
    if (e.target.closest('.lane') || e.target.closest('#ruler')) {
      if (state.playing) setPlaying(false)
      seek(timeAt(e))
      scrub = true
      els.tlScroll.setPointerCapture(e.pointerId)
    }
    selectClip(null)
    return
  }

  const found = findClip(clipEl.dataset.clip)
  if (!found) return
  selectClip(found.clip.id)
  const edge = e.target.classList.contains('edge') ? (e.target.classList.contains('left') ? 'left' : 'right') : null
  drag = {
    clip: found.clip, track: found.track, edge,
    startX: e.clientX,
    orig: { start: found.clip.start, in: found.clip.in, out: found.clip.out },
    moved: false
  }
  state.dragClipId = edge ? null : found.clip.id
  els.tlScroll.setPointerCapture(e.pointerId)
})

els.tlScroll.addEventListener('pointermove', e => {
  if (scrub) { seek(timeAt(e)); return }
  if (!drag) return
  const dx = (e.clientX - drag.startX) / state.pxPerSec
  if (Math.abs(dx) > 0.02) drag.moved = true
  const c = drag.clip
  const media = mediaOf(c)
  const freeLength = !media || media?.isImage   // Bilder und Texte: beliebig lang
  const maxOut = freeLength ? 1e9 : (media?.duration ?? drag.orig.out)

  if (drag.edge === 'left') {
    if (freeLength) {
      // Bilder haben kein "Material" - linke Kante verschiebt nur den Anfang
      let shift = Math.min(dx, clipDur(c) - 0.2)
      const sn = snapTime(drag.orig.start + shift, c.id, e.altKey)
      if (sn.snapped && sn.t - drag.orig.start <= clipDur(c) - 0.2) {
        shift = sn.t - drag.orig.start; showSnapLine(sn.t)
      } else hideSnapLine()
      c.start = Math.max(0, drag.orig.start + shift)
      c.out = drag.orig.out - shift
    } else {
      let nIn = Math.max(0, Math.min(drag.orig.in + dx, drag.orig.out - 0.2))
      const edgePos = drag.orig.start + (nIn - drag.orig.in)
      const sn = snapTime(edgePos, c.id, e.altKey)
      if (sn.snapped) {
        const nIn2 = drag.orig.in + (sn.t - drag.orig.start)
        if (nIn2 >= 0 && nIn2 <= drag.orig.out - 0.2) { nIn = nIn2; showSnapLine(sn.t) }
        else hideSnapLine()
      } else hideSnapLine()
      c.start = drag.orig.start + (nIn - drag.orig.in)
      c.in = nIn
    }
  } else if (drag.edge === 'right') {
    let nOut = Math.max(drag.orig.in + 0.2, Math.min(drag.orig.out + dx, maxOut))
    const edgePos = c.start + (nOut - c.in)
    const sn = snapTime(edgePos, c.id, e.altKey)
    if (sn.snapped) {
      const nOut2 = c.in + (sn.t - c.start)
      if (nOut2 >= drag.orig.in + 0.2 && nOut2 <= maxOut) { nOut = nOut2; showSnapLine(sn.t) }
      else hideSnapLine()
    } else hideSnapLine()
    c.out = nOut
  } else {
    let nStart = Math.max(0, drag.orig.start + dx)
    if (drag.track.id !== 'V1') {
      const dur = clipDur(c)
      const s1 = snapTime(nStart, c.id, e.altKey)
      const s2 = snapTime(nStart + dur, c.id, e.altKey)
      if (s1.snapped && (!s2.snapped || Math.abs(s1.t - nStart) <= Math.abs(s2.t - (nStart + dur)))) {
        nStart = s1.t; showSnapLine(s1.t)
      } else if (s2.snapped) {
        nStart = Math.max(0, s2.t - dur); showSnapLine(s2.t)
      } else hideSnapLine()
    }
    c.start = nStart

    // Spurwechsel: Clip vertikal auf eine andere passende Spur ziehen
    const lane = laneAt(e)
    if (lane && lane.dataset.track !== drag.track.id) {
      const target = trackById(lane.dataset.track)
      if (target && target.type === drag.track.type && !((isText(c) || isMg(c)) && target.id === 'V1')) {
        drag.track.clips = drag.track.clips.filter(x => x.id !== c.id)
        if (drag.track.id === 'V1') repack()
        target.clips.push(c)
        target.clips.sort((a, b) => a.start - b.start)
        drag.track = target
      }
    }
  }
  if (drag.track.id === 'V1' && drag.edge) repack()
  renderTimeline()
})

els.tlScroll.addEventListener('pointerup', () => {
  hideSnapLine()
  scrub = false
  if (!drag) return
  if (drag.track.id === 'V1') repack()
  state.dragClipId = null
  drag = null
  renderTimeline()
  scheduleAutosave()
})

// ---------------------------------------------------------------- Spuren
function addTrack (type) {
  const list = type === 'video' ? videoTracks() : audioTracks()
  const prefix = type === 'video' ? 'V' : 'A'
  const nums = list.map(t => Number(t.id.replace(/^\D+/, '')) || 0)
  const n = Math.max(0, ...nums) + 1
  const label = `${type === 'video' ? 'Video' : 'Ton'} ${list.length + 1}`
  const track = { id: `${prefix}${n}`, type, label, clips: [] }
  if (type === 'video') {
    const lastVideoIdx = state.project.tracks.findLastIndex(t => t.type === 'video')
    state.project.tracks.splice(lastVideoIdx + 1, 0, track)
  } else {
    state.project.tracks.push(track)
  }
  renderTimeline(); scheduleAutosave()
}

function removeTrack (trackId) {
  const track = trackById(trackId)
  if (!track || track.id === 'V1') return
  if (track.clips.length > 0 &&
      !confirm(`Spur „${track.label}" mit ${track.clips.length} Clip(s) wirklich entfernen?`)) return
  state.project.tracks = state.project.tracks.filter(t => t.id !== trackId)
  if (audioTracks().length === 0) {
    state.project.tracks.push({ id: 'A1', type: 'audio', label: 'Ton 1', clips: [] })
  }
  selectClip(null); renderTimeline(); scheduleAutosave()
}

$('#btnAddVideoTrack').onclick = () => addTrack('video')
$('#btnAddAudioTrack').onclick = () => addTrack('audio')

// ---------------------------------------------------- Uebergangs-Auswahl
function openTransitionPicker (seamEl) {
  const found = findClip(seamEl.dataset.seamFor)
  if (!found) return
  state.seamTarget = found.clip
  const picker = $('#transitionPicker')
  const grid = $('#transitionGrid')
  grid.innerHTML = ''
  for (const t of state.transitions) {
    const b = document.createElement('button')
    b.className = found.clip.transition?.type === t.id ? 'selected' : ''
    b.innerHTML = `<span class="icon">${TRANSITION_ICONS[t.id] ?? '✦'}</span>${t.label}`
    b.onclick = () => {
      found.clip.transition = { type: t.id, duration: Number($('#transDur').value) }
      repack(); renderTimeline(); scheduleAutosave()
      grid.querySelectorAll('button').forEach(x => x.classList.remove('selected'))
      b.classList.add('selected')
      seek(Math.max(0, found.clip.start - 0.7)); setPlaying(true)
    }
    grid.appendChild(b)
  }
  $('#transDur').value = found.clip.transition?.duration || 0.5
  $('#transDurOut').textContent = `${String($('#transDur').value).replace('.', ',')} s`
  const rect = seamEl.getBoundingClientRect()
  picker.hidden = false
  picker.style.left = `${Math.min(Math.max(rect.left - 140, 10), innerWidth - 320)}px`
  picker.style.top = `${Math.max(10, rect.top - picker.offsetHeight - 12)}px`
}

$('#transDur').addEventListener('input', e => {
  $('#transDurOut').textContent = `${String(e.target.value).replace('.', ',')} s`
  if (state.seamTarget && state.seamTarget.transition.type !== 'none') {
    state.seamTarget.transition.duration = Number(e.target.value)
    repack(); renderTimeline()
  }
})

document.addEventListener('pointerdown', e => {
  if (!$('#transitionPicker').hidden && !e.target.closest('#transitionPicker') && !e.target.closest('.seam')) {
    $('#transitionPicker').hidden = true
    state.seamTarget = null
  }
}, true)

// ------------------------------------------------------------- Import
async function addFiles (paths) {
  if (!paths.length) return
  const toast = $('#importToast')
  toast.hidden = false
  const { jobId } = await api('/api/import', { paths })
  const poll = setInterval(async () => {
    const job = await api(`/api/job/${jobId}`)
    $('#importNote').textContent = job.note || `Wird vorbereitet … ${job.done}/${job.total}`
    if (job.state === 'fertig') {
      clearInterval(poll)
      toast.hidden = true
      // Neu importiertes Material landet nur in der Ablage -
      // auf die Timeline kommt es per Ziehen oder Doppelklick.
      for (const media of job.media) state.project.media.push(media)
      renderTimeline(); scheduleAutosave()
      if (job.errors?.length) alert('Einige Dateien gingen nicht:\n' + job.errors.join('\n'))
    }
  }, 400)
}

async function pickAndAdd () {
  const { paths } = await api('/api/pick', {})
  addFiles(paths)
}
$('#btnAdd').onclick = pickAndAdd

;['dragover', 'dragenter'].forEach(ev => els.previewWrap.addEventListener(ev, e => {
  e.preventDefault(); els.previewWrap.classList.add('dragover')
}))
;['dragleave', 'drop'].forEach(ev => els.previewWrap.addEventListener(ev, e => {
  e.preventDefault(); els.previewWrap.classList.remove('dragover')
}))
els.previewWrap.addEventListener('drop', () => pickAndAdd())

// --------------------------------------------------------- Werkzeuge
function splitAtPlayhead () {
  const t = state.time
  let target = null
  if (state.selectedClip) {
    const found = findClip(state.selectedClip.clipId)
    if (found && t > found.clip.start && t < clipEnd(found.clip)) target = found
  }
  if (!target) {
    for (const track of [...videoTracks()].reverse().concat(audioTracks())) {
      const hit = activeClips(track, t).pop()
      if (hit) { target = { track, clip: hit }; break }
    }
  }
  if (!target) return
  const { track, clip } = target
  const offset = t - clip.start
  if (offset < 0.15 || offset > clipDur(clip) - 0.15) return
  const idx = track.clips.indexOf(clip)
  const freeLen = isText(clip) || isMg(clip) || mediaOf(clip)?.isImage
  const right = {
    ...structuredClone(clip),
    id: newClipId(),
    in: freeLen ? 0 : clip.in + offset,
    out: freeLen ? clipDur(clip) - offset : clip.out,
    start: t,
    fadeIn: 0,
    transition: { type: 'none', duration: 0.5 }
  }
  if (freeLen) clip.out = offset
  else clip.out = clip.in + offset
  clip.fadeOut = 0
  track.clips.splice(idx + 1, 0, right)
  if (track.id === 'V1') repack()
  renderTimeline(); selectClip(right.id); scheduleAutosave()
}

function deleteSelected () {
  if (!state.selectedClip) return
  const found = findClip(state.selectedClip.clipId)
  if (!found) return
  found.track.clips = found.track.clips.filter(c => c.id !== found.clip.id)
  videoPool.get(found.clip.id)?.remove()
  videoPool.delete(found.clip.id)
  if (found.track.id === 'V1') repack()
  selectClip(null); renderTimeline(); scheduleAutosave()
}

$('#btnSplit').onclick = splitAtPlayhead
$('#btnDelete').onclick = deleteSelected
$('#btnPlay').onclick = () => setPlaying(!state.playing)
$('#bigPlay').onclick = () => setPlaying(true)
$('#btnBack').onclick = () => seek(0)

document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing) }
  if (e.key === 's' || e.key === 'S') splitAtPlayhead()
  if (e.key === 'k' || e.key === 'K') addKeyframeHere()
  if (e.key === 'i' || e.key === 'I') {
    const total = projectDuration()
    const r = state.project.range ?? { in: 0, out: total }
    r.in = Math.min(state.time, r.out - 0.1)
    state.project.range = r
    updateRangeBar(); scheduleAutosave()
  }
  if (e.key === 'o' || e.key === 'O') {
    const total = projectDuration()
    const r = state.project.range ?? { in: 0, out: total }
    r.out = Math.max(state.time, r.in + 0.1)
    state.project.range = r
    updateRangeBar(); scheduleAutosave()
  }
  if (e.key === 'Backspace' || e.key === 'Delete') deleteSelected()
  if (e.key === 'ArrowLeft') seek(state.time - (e.shiftKey ? 1 : 1 / 30))
  if (e.key === 'ArrowRight') seek(state.time + (e.shiftKey ? 1 : 1 / 30))
})

// ------------------------------------------------------ Speichern/Export
let autosaveTimer = null
function scheduleAutosave () {
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(saveProject, 2000)
}
async function saveProject () {
  if (!state.project?.media.length) return
  state.project.name = $('#projectName').value || 'Mein Video'
  await api('/api/project/save', { project: state.project })
}
$('#btnSave').onclick = async () => {
  await saveProject()
  $('#btnSave').innerHTML = 'Gespeichert ✓'
  setTimeout(() => { applyIcons() }, 1500)
}
$('#projectName').addEventListener('change', scheduleAutosave)

$('#btnExport').onclick = () => {
  if (!state.project?.media.length) { alert('Füge zuerst Videos hinzu.'); return }
  setPlaying(false)
  // Einstellungen zeigen, erst danach rendern
  $('#expFilename').value = $('#projectName').value
  const range = getRange()
  $('#expRangeNote').textContent = range
    ? `Es wird nur der Bereich ${fmt(range.in)} – ${fmt(range.out)} exportiert.`
    : ''
  const { width: W, height: H } = state.project.settings
  $('#expResNote').textContent = `Projekt: ${W} × ${H}`
  $('#exportSetup').hidden = false
}
$('#btnExpCancel').onclick = () => { $('#exportSetup').hidden = true }

$('#btnExpStart').onclick = async () => {
  $('#exportSetup').hidden = true
  await saveProject()
  const overlay = $('#exportOverlay')
  overlay.hidden = false
  const range = getRange()
  $('#exportTitle').textContent = range
    ? `Bereich ${fmt(range.in)} – ${fmt(range.out)} wird erstellt …`
    : 'Video wird erstellt …'
  $('#btnShowFile').hidden = true; $('#btnCloseExport').hidden = true
  $('#exportBar').style.width = '0%'

  state.exportMotionBlur = $('#expMotionBlur').checked
  // Grafiken zuerst im Browser vorrendern (pixelgenau wie die Vorschau)
  let preRendered = []
  try {
    preRendered = await preRenderMg(note => { $('#exportNote').textContent = note })
  } catch (e) {
    $('#exportTitle').textContent = 'Grafiken konnten nicht vorbereitet werden'
    $('#exportNote').textContent = e.message
    $('#btnCloseExport').hidden = false
    return
  }

  // Aufloesung: Breite waehlen, Hoehe folgt dem Seitenverhaeltnis
  const { width: W, height: H } = state.project.settings
  const resSel = $('#expRes').value
  let scaleTo = null
  if (resSel !== 'project') {
    const targetW = Number(resSel)
    if (targetW !== W) {
      scaleTo = { w: Math.round(targetW / 2) * 2, h: Math.max(2, Math.round((H * targetW / W) / 2) * 2) }
    }
  }

  const { jobId } = await api('/api/export', {
    project: state.project,
    quality: $('#expQuality').value,
    filename: $('#expFilename').value || $('#projectName').value,
    scaleTo,
    preRendered,
    loudness: $('#expLoudness').checked
  })
  const poll = setInterval(async () => {
    const job = await api(`/api/job/${jobId}`)
    $('#exportBar').style.width = `${job.percent ?? 0}%`
    $('#exportNote').textContent = job.note ?? ''
    if (job.state === 'fertig') {
      clearInterval(poll)
      $('#exportTitle').textContent = 'Fertig ✓'
      $('#btnShowFile').hidden = false
      $('#btnCloseExport').hidden = false
      $('#btnShowFile').onclick = () => api('/api/reveal', { file: job.file })
    }
    if (job.state === 'fehler') {
      clearInterval(poll)
      $('#exportTitle').textContent = 'Da ging etwas schief'
      $('#btnCloseExport').hidden = false
    }
  }, 500)
}
$('#btnCloseExport').onclick = () => { $('#exportOverlay').hidden = true }

// -------------------------------------------- Anfassen im Vorschaubild
let previewDrag = null

function canvasPoint (e) {
  const rect = els.preview.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (els.preview.width / rect.width),
    y: (e.clientY - rect.top) * (els.preview.height / rect.height)
  }
}

/** Welcher Eck-Griff des Clips liegt unter dem Punkt? */
function handleAt (clip, p) {
  const r = rectFor(clip)
  if (!r) return null
  const grab = 12 * screenScale()
  const pts = handlePoints(r)
  for (let i = 0; i < pts.length; i++) {
    if (Math.abs(p.x - pts[i][0]) < grab && Math.abs(p.y - pts[i][1]) < grab) return i
  }
  return null
}

/** Oberstes sichtbares Element unter dem Punkt (oben liegende Spuren zuerst). */
function clipAtPoint (p) {
  const t = state.time
  for (const track of [...videoTracks()].reverse()) {
    if (track.hidden) continue
    for (const clip of [...activeClips(track, t)].reverse()) {
      const r = rectFor(clip)
      if (r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return clip
    }
  }
  return null
}

function selectedVisibleClip () {
  const sel = state.selectedClip && findClip(state.selectedClip.clipId)
  if (!sel || sel.track.type !== 'video') return null
  if (state.time < sel.clip.start - 0.001 || state.time >= clipEnd(sel.clip)) return null
  return sel.clip
}

els.previewWrap.addEventListener('pointerdown', e => {
  if (!state.project?.media.length) return
  if (e.target.closest('button') || e.target.closest('.zoombar')) return
  const p = canvasPoint(e)

  const selClip = selectedVisibleClip()
  if (selClip) {
    const h = handleAt(selClip, p)
    if (h !== null) {
      const r = rectFor(selClip)
      const cx = r.x + r.w / 2; const cy = r.y + r.h / 2
      previewDrag = {
        mode: 'scale', clip: selClip,
        center: { x: cx, y: cy },
        startDist: Math.max(1, Math.hypot(p.x - cx, p.y - cy)),
        origScale: kfValues(selClip, state.time).scale
      }
      els.previewWrap.setPointerCapture(e.pointerId)
      return
    }
  }

  const hit = clipAtPoint(p)
  if (hit) {
    if (state.selectedClip?.clipId !== hit.id) selectClip(hit.id)
    const kvHit = kfValues(hit, state.time)
    previewDrag = {
      mode: 'move', clip: hit,
      start: p,
      orig: { x: kvHit.x, y: kvHit.y }
    }
    els.previewWrap.classList.add('grabbing')
    els.previewWrap.setPointerCapture(e.pointerId)
  } else {
    selectClip(null)
  }
})

els.previewWrap.addEventListener('pointermove', e => {
  if (previewDrag) {
    const p = canvasPoint(e)
    const c = previewDrag.clip
    const lt = state.time - c.start
    if (previewDrag.mode === 'move') {
      let nx = previewDrag.orig.x + (p.x - previewDrag.start.x) / els.preview.width
      let ny = previewDrag.orig.y + (p.y - previewDrag.start.y) / els.preview.height
      // Sanftes Einrasten an der Bildmitte
      if (Math.abs(nx) < 0.012) nx = 0
      if (Math.abs(ny) < 0.012) ny = 0
      if (c.keyframes?.x?.length || c.keyframes?.y?.length) {
        // Auto-Key: mit Keyframes wird die Bewegung an der Abspielposition verankert
        setKf(c, 'x', lt, nx)
        setKf(c, 'y', lt, ny)
      } else {
        c.x = nx; c.y = ny
      }
    } else {
      const dist = Math.hypot(p.x - previewDrag.center.x, p.y - previewDrag.center.y)
      const ns = Math.min(5, Math.max(0.05, previewDrag.origScale * dist / previewDrag.startDist))
      if (c.keyframes?.scale?.length) setKf(c, 'scale', lt, ns)
      else c.scale = ns
    }
    return
  }
  // Mauszeiger-Rueckmeldung
  if (!state.project?.media.length) return
  const p = canvasPoint(e)
  const selClip = selectedVisibleClip()
  if (selClip && handleAt(selClip, p) !== null) els.previewWrap.style.cursor = 'nwse-resize'
  else if (clipAtPoint(p)) els.previewWrap.style.cursor = 'grab'
  else els.previewWrap.style.cursor = ''
})

els.previewWrap.addEventListener('pointerup', () => {
  if (!previewDrag) return
  const clip = previewDrag.clip
  previewDrag = null
  els.previewWrap.classList.remove('grabbing')
  selectClip(clip.id)     // Regler rechts aktualisieren
  scheduleAutosave()
})

// ------------------------------------------------------------- Zoomen
const PPS_MIN = 8; const PPS_MAX = 300

function setTimelineZoom (pps, anchorClientX = null) {
  pps = Math.min(PPS_MAX, Math.max(PPS_MIN, pps))
  if (pps === state.pxPerSec) return
  const old = state.pxPerSec
  let anchorTime = state.time
  if (anchorClientX !== null) {
    const rect = els.tracks.getBoundingClientRect()
    anchorTime = Math.max(0, (anchorClientX - rect.left - LABEL_W) / old)
  }
  state.pxPerSec = pps
  renderTimeline()
  els.tlScroll.scrollLeft += anchorTime * (pps - old)
}

function zoomFit () {
  const total = Math.max(projectDuration(), 1)
  const avail = els.tlScroll.clientWidth - LABEL_W - 60
  setTimelineZoom(avail / total)
  els.tlScroll.scrollLeft = 0
}

els.tlScroll.addEventListener('wheel', e => {
  // Mausrad/vertikales Wischen = zoomen. Seitliches Wischen und
  // Shift+Rad = normales horizontales Scrollen.
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
  e.preventDefault()
  const speed = e.ctrlKey || e.metaKey ? 0.01 : 0.004
  const factor = Math.exp(-e.deltaY * speed)
  setTimelineZoom(state.pxPerSec * factor, e.clientX)
}, { passive: false })

$('#btnZoomIn').onclick = () => setTimelineZoom(state.pxPerSec * 1.4)
$('#btnZoomOut').onclick = () => setTimelineZoom(state.pxPerSec / 1.4)
$('#btnZoomFit').onclick = zoomFit

// Vorschau-Zoom: 1 = eingepasst
const previewScroll = $('#previewScroll')

function applyViewZoom () {
  const c = els.preview
  if (state.viewZoom === 1) {
    c.style.width = ''; c.style.height = ''
    c.style.maxWidth = ''; c.style.maxHeight = ''
    return
  }
  const availW = previewScroll.clientWidth - 28
  const availH = previewScroll.clientHeight - 28
  const fit = Math.min(availW / c.width, availH / c.height)
  c.style.maxWidth = 'none'; c.style.maxHeight = 'none'
  c.style.width = `${Math.max(40, c.width * fit * state.viewZoom)}px`
  c.style.height = `${Math.max(24, c.height * fit * state.viewZoom)}px`
}

function setViewZoom (z) {
  state.viewZoom = Math.min(8, Math.max(0.25, z))
  applyViewZoom()
}

els.previewWrap.addEventListener('wheel', e => {
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
  e.preventDefault()
  const speed = e.ctrlKey || e.metaKey ? 0.01 : 0.004
  setViewZoom(state.viewZoom * Math.exp(-e.deltaY * speed))
}, { passive: false })

document.querySelectorAll('#previewZoombar [data-pz]').forEach(b => {
  b.onclick = () => {
    if (b.dataset.pz === 'fit') setViewZoom(1)
    else setViewZoom(state.viewZoom * (b.dataset.pz === 'in' ? 1.3 : 1 / 1.3))
  }
})
window.addEventListener('resize', applyViewZoom)

// ------------------------------------------------- Film-Einstellungen
function openSettings () {
  const s = state.project.settings
  const preset = `${s.width}x${s.height}`
  const presetEl = $('#setPreset')
  const known = [...presetEl.options].some(o => o.value === preset)
  presetEl.value = known ? preset : 'custom'
  $('#customSize').hidden = presetEl.value !== 'custom'
  $('#setW').value = s.width
  $('#setH').value = s.height
  $('#setFps').value = String(s.fps)
  $('#setBg').value = s.background ?? '#000000'
  $('#settingsOverlay').hidden = false
}

$('#btnSettings').onclick = openSettings
$('#setPreset').addEventListener('change', e => {
  $('#customSize').hidden = e.target.value !== 'custom'
  if (e.target.value !== 'custom') {
    const [w, h] = e.target.value.split('x').map(Number)
    $('#setW').value = w
    $('#setH').value = h
  }
})
$('#btnSettingsCancel').onclick = () => { $('#settingsOverlay').hidden = true }
$('#btnSettingsSave').onclick = () => {
  const s = state.project.settings
  const even = n => Math.max(240, Math.min(7680, Math.round(n / 2) * 2))
  s.width = even(Number($('#setW').value) || 1920)
  s.height = even(Number($('#setH').value) || 1080)
  s.fps = Number($('#setFps').value) || 30
  s.background = $('#setBg').value
  els.preview.width = s.width
  els.preview.height = s.height
  $('#settingsOverlay').hidden = true
  applyViewZoom()
  renderFrame(); renderTimeline(); scheduleAutosave()
}

// ------------------------------------------------- Fenster-Layout
const LAYOUT_KEY = 'schnitt.layout'
const layoutDefault = () => ({ lib: 318, insp: 248, tl: Math.round(Math.max(720, window.innerHeight) * 0.36) })

function currentLayout () {
  return {
    lib: $('#library').getBoundingClientRect().width || 318,
    insp: parseInt($('#inspector').style.width) || 248,
    tl: parseInt(els.tlScroll.style.maxHeight) || Math.round(window.innerHeight * 0.36)
  }
}

function applyLayout (l, persist = true) {
  const lay = { ...layoutDefault(), ...(l ?? {}) }
  $('#library').style.width = `${Math.min(600, Math.max(240, lay.lib))}px`
  $('#inspector').style.width = `${Math.min(520, Math.max(200, lay.insp))}px`
  const tlCap = Math.max(240, window.innerHeight * 0.7)   // 0-Hoehe bei verdecktem Fenster abfangen
  els.tlScroll.style.maxHeight = `${Math.min(tlCap, Math.max(120, lay.tl))}px`
  if (persist) localStorage.setItem(LAYOUT_KEY, JSON.stringify(lay))
  applyViewZoom()
  if (!$('#graphPanel').hidden) renderGraph()
}

function loadLayout () {
  try { applyLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY)), false) }
  catch { applyLayout(null, false) }
}

// Trenngriffe ziehen
function bindSplit (el, apply) {
  el.addEventListener('pointerdown', e => {
    e.preventDefault()
    el.classList.add('active')
    document.body.classList.add(el.id === 'splitTl' ? 'resizing-v' : 'resizing')
    const move = ev => apply(ev)
    const up = () => {
      el.classList.remove('active')
      document.body.classList.remove('resizing', 'resizing-v')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(currentLayout()))
      applyViewZoom()
      if (!$('#graphPanel').hidden) renderGraph()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })
}

bindSplit($('#splitLib'), e => {
  const w = Math.min(600, Math.max(240, e.clientX))
  $('#library').style.width = `${w}px`
})
bindSplit($('#splitInsp'), e => {
  const w = Math.min(520, Math.max(200, window.innerWidth - e.clientX))
  $('#inspector').style.width = `${w}px`
})
bindSplit($('#splitTl'), e => {
  const area = $('#timelineArea').getBoundingClientRect()
  const toolbarH = $('#tlToolbar').getBoundingClientRect().height
  const graphH = $('#graphPanel').hidden ? 0 : $('#graphPanel').getBoundingClientRect().height
  const cap = Math.max(240, window.innerHeight * 0.7)
  const h = Math.min(cap, Math.max(120, area.bottom - e.clientY - toolbarH - graphH))
  els.tlScroll.style.maxHeight = `${h}px`
})

// Layout-Menue
$('#btnLayout').onclick = e => {
  const menu = $('#layoutMenu')
  if (!menu.hidden) { menu.hidden = true; return }
  const r = e.currentTarget.getBoundingClientRect()
  menu.hidden = false
  menu.style.left = `${Math.min(r.left, window.innerWidth - 260)}px`
  menu.style.top = `${r.bottom + 8}px`
}
document.addEventListener('pointerdown', e => {
  if (!$('#layoutMenu').hidden && !e.target.closest('#layoutMenu') && !e.target.closest('#btnLayout')) {
    $('#layoutMenu').hidden = true
  }
}, true)

document.querySelectorAll('#layoutMenu .lay').forEach(b => {
  b.onclick = () => {
    const act = b.dataset.lay
    if (act === 'saveA') localStorage.setItem(LAYOUT_KEY + '.A', JSON.stringify(currentLayout()))
    if (act === 'saveB') localStorage.setItem(LAYOUT_KEY + '.B', JSON.stringify(currentLayout()))
    if (act === 'loadA' || act === 'loadB') {
      try { applyLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY + (act === 'loadA' ? '.A' : '.B')))) } catch {}
    }
    if (act === 'reset') { localStorage.removeItem(LAYOUT_KEY); applyLayout(layoutDefault()) }
    $('#layoutMenu').hidden = true
  }
})

// --------------------------------------------------------------- Start
/** SVG-Icons in alle statischen Elemente einsetzen (data-icon / data-label). */
function applyIcons () {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const icon = ICON[el.dataset.icon]
    if (!icon) return
    const label = el.dataset.label
    el.innerHTML = label ? `${icon}<span>${label}</span>` : icon
  })
  els.btnPlay.innerHTML = state.playing ? ICON.pause : ICON.play
}

async function boot () {
  applyIcons()
  loadLayout()
  const status = await api('/api/status')
  state.transitions = status.transitions
  state.whisper = Boolean(status.whisper)
  if (!status.ffmpeg) {
    $('#emptyHint').innerHTML = `<div class="hint-icon">⚠️</div>
      <h2>Eine Zutat fehlt noch</h2>
      <p>Bitte im Terminal einmal ausführen:<br><code>cd schnitt && npm install</code><br>Danach diese Seite neu laden.</p>`
  }
  const { projects } = await api('/api/projects')
  if (projects.length) {
    const { project } = await api(`/api/project/load?file=${encodeURIComponent(projects[0].file)}`)
    state.project = project
    $('#projectName').value = project.name
  } else {
    const { project } = await api('/api/project/new')
    state.project = project
  }
  els.preview.width = state.project.settings.width
  els.preview.height = state.project.settings.height
  renderTimeline()
}
boot()

// Kleine Aussenschnittstelle: erlaubt Steuerung per Konsole/Claude.
window.schnitt = {
  state, addFiles, repack, renderTimeline, seek, setPlaying, selectClip, insertClip, addTrack,
  reload: async () => {
    const { projects } = await api('/api/projects')
    if (!projects.length) return
    const { project } = await api(`/api/project/load?file=${encodeURIComponent(projects[0].file)}`)
    state.project = project
    $('#projectName').value = project.name
    videoPool.clear()
    renderTimeline()
  }
}
