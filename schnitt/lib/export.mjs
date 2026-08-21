// Timeline (JSON) -> fertiges Video.
// Ablauf: jeder Clip wird einzeln auf Projektgroesse normalisiert, danach werden
// die Stuecke mit concat (harter Schnitt) bzw. xfade (Uebergang) aneinandergehaengt.
// Ton laeuft getrennt und wird am Ende dazugemischt.
import fs from 'node:fs/promises'
import path from 'node:path'
import { runFfmpeg, FFMPEG, hasVideoToolbox } from './ffmpeg.mjs'
import { TRANSITIONS, clipDuration, clipEnd, projectDuration } from './project.mjs'

const even = n => Math.max(2, Math.round(n / 2) * 2)
const t3 = n => (Math.round(n * 1000) / 1000).toFixed(3)

const QUALITY = {
  hoch:   { crf: '16', preset: 'medium',   audio: '256k', vtq: '75' },
  mittel: { crf: '20', preset: 'veryfast', audio: '192k', vtq: '65' },
  klein:  { crf: '26', preset: 'veryfast', audio: '128k', vtq: '55' }
}

// Codec fuer alle Zwischenschritte. Wird pro Export gesetzt:
// Hardware (VideoToolbox) wenn vorhanden UND die Bildgroesse es erlaubt,
// sonst Software wie bisher.
let INTER = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14']

function vtAllowed (W, H) {
  return W <= 4096 && H <= 2304   // Hardware-Limit des H.264-Encoders
}

/** Wohin und wie gross ein Clip im Bild landet. */
function layout (media, clip, W, H) {
  const mw = media?.width || W
  const mh = media?.height || H
  const fit = Math.min(W / mw, H / mh) * (clip.scale ?? 1)
  const w = even(mw * fit)
  const h = even(mh * fit)
  return {
    w,
    h,
    x: Math.round((W - w) / 2 + (clip.x ?? 0) * W),
    y: Math.round((H - h) / 2 + (clip.y ?? 0) * H)
  }
}

/**
 * Sanfte Dauer-Bewegungen. Die Formeln muessen exakt denen der
 * Browser-Vorschau entsprechen (siehe effectTransform in app.js):
 *   zoomin/out : Faktor 1 .. 1 + 0.15*amount ueber die Cliplaenge
 *   panlr/rl   : dx = W*0.12*amount * (p - 0.5)
 *   floaty     : dy = H*0.03*amount * sin(2*pi*lokaleZeit/4)
 */
function effectOf (clip) {
  const fx = clip.effect ?? {}
  const amount = Math.min(1, Math.max(0, fx.amount ?? 0.5))
  return { type: fx.type ?? 'none', amount }
}

/** Overlay-Positionsausdruecke fuer Pan/Schweben. tExpr = lokale Zeit im Clip. */
function fxPosition (clip, box, W, H, dur, tExpr) {
  const { type, amount } = effectOf(clip)
  let x = String(box.x)
  let y = String(box.y)
  if (type === 'panlr' || type === 'panrl') {
    const K = (W * 0.12 * amount * (type === 'panlr' ? 1 : -1)).toFixed(2)
    x = `${box.x}+${K}*((${tExpr})/${t3(dur)}-0.5)`
  }
  if (type === 'floaty') {
    const A = (H * 0.03 * amount).toFixed(2)
    y = `${box.y}+${A}*sin(2*PI*(${tExpr})/4)`
  }
  return { x, y }
}

/** Zoom-Kette fuers Element selbst (Ken-Burns): scale hoch + zoompan runter. */
function fxZoomChain (clip, box, dur, fps) {
  const { type, amount } = effectOf(clip)
  if (type !== 'zoomin' && type !== 'zoomout') return null
  const M = 0.15 * amount
  const F = 1 + M
  const frames = Math.max(2, Math.round(dur * fps))
  const z = type === 'zoomin'
    ? `1+${M.toFixed(4)}*on/${frames}`
    : `${F.toFixed(4)}-${M.toFixed(4)}*on/${frames}`
  // Supersampling gegen Zittern: zoompan arbeitet nur pixelgenau.
  // In hoeherer Aufloesung zoomen und danach glatt herunterskalieren
  // macht die Schritte unsichtbar. Obergrenzen schuetzen den Speicher.
  const ss = Math.max(1, Math.min(
    2.6,
    12000 / (box.w * F),
    Math.sqrt(24e6 / Math.max(1, box.w * F * box.h * F))
  ))
  const bigW = even(box.w * ss)
  const bigH = even(box.h * ss)
  return [
    // Wichtig: erst auf Projekt-Framerate bringen - zoompan gibt pro
    // Eingangsbild genau ein Ausgangsbild aus. Ohne diesen Schritt wird
    // z.B. ein Bild-Clip (25 fps) im 30-fps-Projekt um 20% zu kurz,
    // und die weiche Ausblende am Clipende faellt komplett weg.
    `fps=${fps}`,
    `scale=${even(box.w * F * ss)}:${even(box.h * F * ss)}:flags=lanczos`,
    `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${bigW}x${bigH}:fps=${fps}`,
    `scale=${even(box.w)}:${even(box.h)}:flags=lanczos`
  ]
}

/**
 * Farbkorrektur eines Clips als ffmpeg-Kette.
 * Helligkeit multiplikativ, Kontrast um 50%-Grau - exakt wie die
 * CSS-Filter der Vorschau. Waerme ueber die Farbbalance der Mitteltoene.
 */
function colorFilters (clip) {
  const c = clip.color ?? {}
  const b = c.bright ?? 0
  const k = c.contrast ?? 0
  const s = c.sat ?? 0
  const t = c.temp ?? 0
  const parts = []
  if (b || k) {
    const BF = (1 + b).toFixed(4)
    const CF = (1 + k).toFixed(4)
    const expr = `'clip(((val*${BF})-128)*${CF}+128,0,255)'`
    parts.push(`lutrgb=r=${expr}:g=${expr}:b=${expr}`)
  }
  if (s) parts.push(`eq=saturation=${Math.max(0, Math.min(3, 1 + s)).toFixed(3)}`)
  if (t) {
    parts.push(
      `colorbalance=rm=${(t * 0.3).toFixed(3)}:bm=${(-t * 0.3).toFixed(3)}` +
      `:rh=${(t * 0.15).toFixed(3)}:bh=${(-t * 0.15).toFixed(3)}`
    )
  }
  return parts
}

function fadeFilters (clip, dur, useAlpha = false) {
  // useAlpha: Ueberlagerungen blenden nach DURCHSICHTIG (alpha=1),
  // die Hauptspur nach Schwarz - sonst wird aus dem Ausblenden ein schwarzer Kasten.
  const suffix = useAlpha ? ':alpha=1' : ''
  const parts = []
  if (clip.fadeIn > 0) parts.push(`fade=t=in:st=0:d=${t3(Math.min(clip.fadeIn, dur))}${suffix}`)
  if (clip.fadeOut > 0) {
    const d = Math.min(clip.fadeOut, dur)
    parts.push(`fade=t=out:st=${t3(Math.max(0, dur - d))}:d=${t3(d)}${suffix}`)
  }
  return parts
}

/** Einen Clip als eigenstaendiges Videostueck in Projektgroesse rendern. */
async function renderSegment (clip, media, project, dest, onProgress) {
  const { width: W, height: H, fps, background } = project.settings
  const dur = clipDuration(clip)
  const box = layout(media, clip, W, H)
  const bg = (background || '#000000').replace('#', '0x')

  const zoomChain = fxZoomChain(clip, box, dur, fps)
  const colChain = colorFilters(clip)
  const chain = zoomChain
    ? [...zoomChain, ...colChain, 'setsar=1', 'format=rgba']
    : [`scale=${box.w}:${box.h}:flags=lanczos`, ...colChain, 'setsar=1', 'format=rgba']
  if ((clip.opacity ?? 1) < 1) chain.push(`colorchannelmixer=aa=${t3(clip.opacity)}`)

  const pos = fxPosition(clip, box, W, H, dur, 't')
  const post = [...fadeFilters(clip, dur), `fps=${fps}`, 'format=yuv420p']

  const filter =
    `color=c=${bg}:s=${W}x${H}:r=${fps}:d=${t3(dur)}[bg];` +
    `[0:v]${chain.join(',')}[fg];` +
    `[bg][fg]overlay=x=${pos.x}:y=${pos.y}:format=auto,${post.join(',')}[v]`

  const inputArgs = media.isImage
    ? ['-loop', '1', '-t', t3(dur), '-i', media.path]
    : ['-ss', t3(clip.in), '-t', t3(dur), '-i', media.path]
  await runFfmpeg([
    '-y', ...inputArgs,
    '-filter_complex', filter, '-map', '[v]',
    ...INTER,
    '-pix_fmt', 'yuv420p', '-an', dest
  ], { onProgress })
  return dest
}

/** Schwarzes Fuellstueck fuer Luecken in der Timeline. */
async function renderGap (project, dur, dest) {
  const { width: W, height: H, fps, background } = project.settings
  const bg = (background || '#000000').replace('#', '0x')
  await runFfmpeg([
    '-y', '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:r=${fps}:d=${t3(dur)}`,
    ...INTER,
    '-pix_fmt', 'yuv420p', dest
  ])
  return dest
}

/**
 * Die Videospur zusammensetzen.
 * concat fuer harte Schnitte, xfade fuer alles andere - beides liefert einen
 * einzelnen Stream, deshalb laesst sich das Stueck fuer Stueck durchketten.
 */
async function buildVideoTrack (pieces, dest, onProgress) {
  if (pieces.length === 0) return null
  if (pieces.length === 1) { await fs.copyFile(pieces[0].file, dest); return dest }

  const inputs = []
  const filters = []
  let label = '0:v'
  let elapsed = pieces[0].duration

  for (let i = 1; i < pieces.length; i++) {
    const piece = pieces[i]
    const out = `vx${i}`
    if (piece.transition && piece.transition.ffmpeg && piece.transition.duration > 0) {
      const d = piece.transition.duration
      const offset = Math.max(0, elapsed - d)
      filters.push(
        `[${label}][${i}:v]xfade=transition=${piece.transition.ffmpeg}:` +
        `duration=${t3(d)}:offset=${t3(offset)}[${out}]`
      )
      elapsed = offset + d + piece.duration
    } else {
      filters.push(`[${label}][${i}:v]concat=n=2:v=1:a=0[${out}]`)
      elapsed += piece.duration
    }
    label = out
  }

  for (const p of pieces) inputs.push('-i', p.file)

  await runFfmpeg([
    '-y', ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', `[${label}]`,
    ...INTER,
    '-pix_fmt', 'yuv420p', dest
  ], { onProgress })
  return dest
}

/** Ueberlagerungs-Clips (Spur V2) auf das fertige Hauptvideo legen. */
async function overlayTrack (baseFile, clips, project, dest, onProgress) {
  if (clips.length === 0) return baseFile
  const { width: W, height: H } = project.settings
  const inputs = ['-i', baseFile]
  const filters = []
  let label = '0:v'

  clips.forEach((entry, idx) => {
    const { clip, media } = entry
    const i = idx + 1
    const dur = clipDuration(clip)
    const box = layout(media, clip, W, H)
    const fps = project.settings.fps
    const zoomChain = fxZoomChain(clip, box, dur, fps)
    const colChain = colorFilters(clip)
    const chain = zoomChain
      ? [...zoomChain, ...colChain, 'setsar=1', 'format=rgba']
      : [`scale=${box.w}:${box.h}:flags=lanczos`, ...colChain, 'setsar=1', 'format=rgba']
    if ((clip.opacity ?? 1) < 1) chain.push(`colorchannelmixer=aa=${t3(clip.opacity)}`)
    chain.push(...fadeFilters(clip, dur, true))
    chain.push(`setpts=PTS-STARTPTS+${t3(clip.start)}/TB`)

    // Zeit im Overlay-Ausdruck laeuft global - lokale Zeit = t - Clipstart
    const pos = fxPosition(clip, box, W, H, dur, `t-${t3(clip.start)}`)
    const out = `ov${i}`
    filters.push(`[${i}:v]${chain.join(',')}[o${i}]`)
    filters.push(
      `[${label}][o${i}]overlay=x=${pos.x}:y=${pos.y}:` +
      `enable='between(t,${t3(clip.start)},${t3(clipEnd(clip))})':eof_action=pass[${out}]`
    )
    label = out
    if (media.isImage) inputs.push('-loop', '1', '-t', t3(dur), '-i', media.path)
    else inputs.push('-ss', t3(clip.in), '-t', t3(dur), '-i', media.path)
  })

  await runFfmpeg([
    '-y', ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', `[${label}]`,
    ...INTER,
    '-pix_fmt', 'yuv420p', dest
  ], { onProgress })
  return dest
}

// ------------------------------------------------------------ Texte
const FONT_FILES = {
  sans: '/System/Library/Fonts/Helvetica.ttc',
  'sans-bold': '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  serif: '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
  'serif-bold': '/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf',
  mono: '/System/Library/Fonts/Supplemental/Courier New.ttf',
  'mono-bold': '/System/Library/Fonts/Supplemental/Courier New.ttf'
}

function fontFileFor (style) {
  const key = `${style.font ?? 'sans'}${style.bold ? '-bold' : ''}`
  return FONT_FILES[key] ?? FONT_FILES.sans
}

/** #rrggbb (+ optionale Deckkraft) -> ffmpeg-Farbe 0xRRGGBB@0.65 */
function ffColor (hex, alpha = 1) {
  const clean = (hex ?? '#ffffff').replace('#', '').slice(0, 6)
  return alpha >= 1 ? `0x${clean}` : `0x${clean}@${alpha.toFixed(2)}`
}

/** Text fuer drawtext im Filtergraph entschaerfen. */
function dtEscape (s) {
  const B = String.fromCharCode(92)   // Backslash, eindeutig
  return String(s)
    .split(B).join(B + B + B + B)
    .split("'").join(B + B + B + "'")
    .split(':').join(B + B + ':')
    .split(',').join(B + ',')
    .split(';').join(B + ';')
    .split('%').join(B + B + '%')
    .split('[').join(B + '[')
    .split(']').join(B + ']')
}

/**
 * Alle Text-Elemente per drawtext auf das fertige Video zeichnen.
 * Formeln (Groesse, Position, Fades, Pan/Schweben) entsprechen der Vorschau.
 */
async function textPass (baseFile, textClips, project, dest, onProgress) {
  const { width: W, height: H } = project.settings
  const filters = []

  for (const clip of textClips) {
    const st = clip.style ?? {}
    const fontsize = Math.max(8, Math.round((st.size ?? 0.07) * H * (clip.scale ?? 1)))
    const lineH = Math.round(fontsize * 1.3)
    const lines = String(clip.text ?? '').split('\n')
    const ts = clip.start
    const te = clipEnd(clip)
    const dur = clipDuration(clip)
    const localT = `(t-${t3(ts)})`

    // Deckkraft samt weichem Ein-/Ausblenden
    const op = Math.max(0, Math.min(1, clip.opacity ?? 1))
    let alpha = String(op)
    const fi = Math.min(clip.fadeIn ?? 0, dur)
    const fo = Math.min(clip.fadeOut ?? 0, dur)
    if (fi > 0 || fo > 0) {
      let expr = '1'
      if (fi > 0) expr = `if(lt(${localT}\,${t3(fi)})\,${localT}/${t3(fi)}\,${expr})`
      if (fo > 0) expr = `if(gt(t\,${t3(te - fo)})\,max(0\,(${t3(te)}-t)/${t3(fo)})\,${expr})`
      alpha = `${op}*${expr}`
    }

    // Bewegung (Pan / Schweben) - Zoom gibt es fuer Texte nicht
    const fx = effectOf(clip)
    let dx = '0'
    let dy = '0'
    if (fx.type === 'panlr' || fx.type === 'panrl') {
      const K = (W * 0.12 * fx.amount * (fx.type === 'panlr' ? 1 : -1)).toFixed(2)
      dx = `${K}*(${localT}/${t3(dur)}-0.5)`
    }
    if (fx.type === 'floaty') {
      const A = (H * 0.03 * fx.amount).toFixed(2)
      dy = `${A}*sin(2*PI*${localT}/4)`
    }

    const centerY = H / 2 + (clip.y ?? 0) * H
    const totalH = lines.length * lineH
    const strokeW = Math.round((st.stroke ?? 0) * fontsize)
    const shadowOff = st.shadow ? Math.max(1, Math.round(fontsize * 0.045)) : 0

    // Einblende-Animation - Formeln identisch mit textAnimState in app.js
    const anim = clip.anim ?? { type: 'none', dur: 0.8 }
    const animD = t3(Math.max(anim.dur ?? 0.8, 0.05))
    const animP = `min(${localT}/${animD},1)`
    const animRest = `pow(1-${animP},2)`
    let animAlpha = null
    if (anim.type === 'slideup') { dy = `${dy}+${(H * 0.08).toFixed(1)}*${animRest}`; animAlpha = animP }
    if (anim.type === 'slidedown') { dy = `${dy}-${(H * 0.08).toFixed(1)}*${animRest}`; animAlpha = animP }
    if (anim.type === 'slideleft') { dx = `${dx}-${(W * 0.06).toFixed(1)}*${animRest}`; animAlpha = animP }
    if (anim.type === 'slideright') { dx = `${dx}+${(W * 0.06).toFixed(1)}*${animRest}`; animAlpha = animP }
    if (animAlpha) alpha = `(${alpha})*${animAlpha}`

    const totalChars = lines.join('').length
    const useType = anim.type === 'type' && totalChars > 0 && totalChars <= 90
    const step = useType ? Math.max(anim.dur ?? 0.8, 0.05) / totalChars : 0
    let charOffset = 0

    lines.forEach((line, i) => {
      const yTop = Math.round(centerY - totalH / 2 + i * lineH + (lineH - fontsize) / 2)
      const baseParts = [
        `fontfile=${fontFileFor(st)}`,
        `fontsize=${fontsize}`,
        `fontcolor=${ffColor(st.color ?? '#ffffff')}`,
        `x='(w-text_w)/2+${Math.round((clip.x ?? 0) * W)}+${dx}'`,
        `y='${yTop}+${dy}'`
      ]
      if (strokeW > 0) baseParts.push(`borderw=${strokeW}`, `bordercolor=${ffColor(st.strokeColor ?? '#000000')}`)
      if (st.bg) baseParts.push('box=1', `boxcolor=${ffColor(st.bg, st.bgAlpha ?? 0.65)}`, `boxborderw=${Math.round(fontsize * 0.28)}`)
      if (shadowOff > 0) baseParts.push(`shadowx=${shadowOff}`, `shadowy=${shadowOff}`, `shadowcolor=${ffColor(st.shadowColor ?? '#000000', 0.75)}`)

      if (!line.trim()) { charOffset += line.length; return }

      if (useType) {
        // Tippen: fuer jeden Textanfang ein eigenes Anzeigefenster
        for (let k = 1; k <= line.length; k++) {
          const from = ts + (charOffset + k - 1) * step
          const to = k === line.length ? te : ts + (charOffset + k) * step
          filters.push(`drawtext=${[
            ...baseParts,
            `text=${dtEscape(line.slice(0, k))}`,
            `alpha='${alpha}'`,
            `enable='between(t\,${t3(from)}\,${t3(to)})'`
          ].join(':')}`)
        }
      } else {
        filters.push(`drawtext=${[
          ...baseParts,
          `text=${dtEscape(line)}`,
          `alpha='${alpha}'`,
          `enable='between(t\,${t3(ts)}\,${t3(te)})'`
        ].join(':')}`)
      }
      charOffset += line.length
    })
  }

  if (!filters.length) return baseFile
  await runFfmpeg([
    '-y', '-i', baseFile,
    '-vf', filters.join(','),
    ...INTER,
    '-pix_fmt', 'yuv420p', dest
  ], { onProgress })
  return dest
}

/**
 * Vorgerenderte Grafik-Folgen (transparente PNGs aus dem Browser)
 * ueber das Video legen. Position/Deckkraft stecken schon in den Frames.
 */
async function mgPass (baseFile, mgClips, project, dest, mgDir, onProgress) {
  const { fps } = project.settings
  const inputs = ['-i', baseFile]
  const filters = []
  let label = '0:v'
  let idx = 0

  for (const clip of mgClips) {
    const safe = String(clip.id).replace(/[^\w-]/g, '')
    const dir = path.join(mgDir, safe)
    try { await fs.access(path.join(dir, 'f_00001.png')) } catch { continue }
    idx += 1
    inputs.push('-framerate', String(fps), '-i', path.join(dir, 'f_%05d.png'))
    const out = `mg${idx}`
    filters.push(`[${idx}:v]format=rgba,setpts=PTS-STARTPTS+${t3(clip.start)}/TB[g${idx}]`)
    filters.push(
      `[${label}][g${idx}]overlay=0:0:` +
      `enable='between(t,${t3(clip.start)},${t3(clipEnd(clip))})':eof_action=pass[${out}]`
    )
    label = out
  }
  if (idx === 0) return baseFile

  await runFfmpeg([
    '-y', ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', `[${label}]`,
    ...INTER,
    '-pix_fmt', 'yuv420p', dest
  ], { onProgress })
  return dest
}

/**
 * Alle Tonquellen an ihre Zeitposition schieben und zusammenmischen.
 * groups = { speech, duck, other }: "duck"-Quellen (Musik) werden per
 * Sidechain-Kompressor automatisch leiser, sobald "speech" (Ton aus
 * den Videospuren) zu hoeren ist.
 */
async function buildAudio (groups, project, dest, onProgress) {
  const speech = groups.speech ?? []
  const duck = groups.duck ?? []
  const other = groups.other ?? []
  const sources = [...speech, ...duck, ...other]
  const total = projectDuration(project)
  if (sources.length === 0) {
    await runFfmpeg([
      '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
      '-t', t3(total), '-c:a', 'aac', '-b:a', '128k', dest
    ])
    return dest
  }

  const inputs = []
  const filters = []
  const labels = []

  sources.forEach((entry, idx) => {
    const { clip, media } = entry
    const dur = clipDuration(clip)
    const delayMs = Math.round(clip.start * 1000)
    const parts = ['aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo']
    if ((clip.volume ?? 1) !== 1) parts.push(`volume=${t3(clip.volume)}`)
    if (clip.fadeIn > 0) parts.push(`afade=t=in:st=0:d=${t3(Math.min(clip.fadeIn, dur))}`)
    if (clip.fadeOut > 0) {
      const d = Math.min(clip.fadeOut, dur)
      parts.push(`afade=t=out:st=${t3(Math.max(0, dur - d))}:d=${t3(d)}`)
    }
    if (delayMs > 0) parts.push(`adelay=${delayMs}|${delayMs}`)
    filters.push(`[${idx}:a]${parts.join(',')}[a${idx}]`)
    labels.push(`[a${idx}]`)
    inputs.push('-ss', t3(clip.in), '-t', t3(dur), '-i', media.path)
  })

  // Busse bilden: Sprache / zu duckende Musik / Rest
  const bus = (list, name) => {
    if (!list.length) return null
    const lbls = list.map(entry => `[a${sources.indexOf(entry)}]`)
    if (lbls.length === 1) return lbls[0]
    filters.push(`${lbls.join('')}amix=inputs=${lbls.length}:normalize=0:dropout_transition=0[${name}]`)
    return `[${name}]`
  }
  const spB = bus(speech, 'spb')
  const duB = bus(duck, 'dub')
  const otB = bus(other, 'otb')

  const finalInputs = []
  if (spB && duB) {
    // Sprache doppelt: einmal hoeren, einmal als Steuersignal fuer den
    // Kompressor. Das Steuersignal wird mit Stille verlaengert (apad),
    // sonst endet die Musik zusammen mit der letzten Sprachstelle.
    filters.push(`${spB}asplit=2[sp1][sp2]`)
    filters.push(`[sp2]apad=whole_dur=${t3(total + 0.5)}[sp2p]`)
    filters.push(`${duB}[sp2p]sidechaincompress=threshold=0.0125:ratio=12:attack=100:release=600[dud]`)
    finalInputs.push('[sp1]', '[dud]')
  } else {
    if (spB) finalInputs.push(spB)
    if (duB) finalInputs.push(duB)
  }
  if (otB) finalInputs.push(otB)

  if (finalInputs.length === 1) {
    filters.push(`${finalInputs[0]}alimiter=limit=0.97,apad,atrim=0:${t3(total)}[a]`)
  } else {
    filters.push(
      `${finalInputs.join('')}amix=inputs=${finalInputs.length}:normalize=0:dropout_transition=0,` +
      `alimiter=limit=0.97,apad,atrim=0:${t3(total)}[a]`
    )
  }

  await runFfmpeg([
    '-y', ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[a]', '-c:a', 'aac', '-b:a', '256k', dest
  ], { onProgress })
  return dest
}

/**
 * Hauptfunktion. onStep(text, prozent) meldet den Fortschritt an die Oberflaeche.
 */
export async function exportProject (project, { outFile, tmpDir, quality = 'hoch', scaleTo = null, mgDir = null, preRendered = [], loudness = false, onStep = () => {} }) {
  if (!FFMPEG) throw new Error('ffmpeg ist nicht installiert')
  // Ausgeblendete Spuren (Auge aus) bleiben komplett draussen
  project = { ...project, tracks: project.tracks.filter(t => !t.hidden) }

  // Hardware-Encoder nutzen, wenn Chip und Bildgroesse mitspielen
  const hw = await hasVideoToolbox() &&
    vtAllowed(project.settings.width, project.settings.height)
  INTER = hw
    ? ['-c:v', 'h264_videotoolbox', '-q:v', '75']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14']
  const total = projectDuration(project)
  if (total <= 0) throw new Error('Die Timeline ist leer - es gibt nichts zu exportieren.')

  await fs.mkdir(tmpDir, { recursive: true })
  const mediaById = new Map(project.media.map(m => [m.id, m]))
  const track = id => project.tracks.find(t => t.id === id)?.clips ?? []

  // --- 1. Hauptspur in einzelne Stuecke rendern -------------------------
  const main = track('V1').filter(c => mediaById.get(c.mediaId)?.hasVideo)
  const pieces = []
  let cursor = 0
  let done = 0
  const totalWork = Math.max(total, 0.001)

  for (let i = 0; i < main.length; i++) {
    const clip = main[i]
    const media = mediaById.get(clip.mediaId)
    const dur = clipDuration(clip)
    const hasTransition = clip.transition?.type && clip.transition.type !== 'none' && i > 0

    if (!hasTransition && clip.start > cursor + 0.02) {
      const gap = clip.start - cursor
      const file = path.join(tmpDir, `gap${i}.mp4`)
      await renderGap(project, gap, file)
      pieces.push({ file, duration: gap, transition: null })
      cursor += gap
    }

    onStep(`Clip ${i + 1} von ${main.length} wird gerendert`, Math.round((done / totalWork) * 55))
    const file = path.join(tmpDir, `seg${i}.mp4`)
    await renderSegment(clip, media, project, file, s => {
      onStep(`Clip ${i + 1} von ${main.length} wird gerendert`,
        Math.round(((done + s) / totalWork) * 55))
    })

    const def = TRANSITIONS.find(t => t.id === clip.transition?.type)
    pieces.push({
      file,
      duration: dur,
      transition: hasTransition && def?.ffmpeg
        ? { ffmpeg: def.ffmpeg, duration: clip.transition.duration }
        : null
    })
    done += dur
    cursor = clipEnd(clip)
  }

  // --- 2. Stuecke verbinden --------------------------------------------
  onStep('Schnitte und Uebergaenge werden verbunden', 58)
  let videoFile = await buildVideoTrack(pieces, path.join(tmpDir, 'video.mp4'),
    s => onStep('Schnitte und Uebergaenge werden verbunden', 58 + Math.round((s / totalWork) * 17)))

  if (!videoFile) {
    videoFile = await renderGap(project, total, path.join(tmpDir, 'video.mp4'))
  }

  // --- 3. Ueberlagerungen ----------------------------------------------
  const preSet = new Set(preRendered)
  const overlays = project.tracks
    .filter(t => t.type === 'video' && t.id !== 'V1')
    .flatMap(t => t.clips)
    .filter(c => mediaById.get(c.mediaId)?.hasVideo && !preSet.has(c.id))
    .sort((a, b) => a.start - b.start)
    .map(c => ({ clip: c, media: mediaById.get(c.mediaId) }))
  if (overlays.length) {
    onStep('Ueberlagerungen werden eingerechnet', 76)
    videoFile = await overlayTrack(videoFile, overlays, project,
      path.join(tmpDir, 'video_ov.mp4'),
      s => onStep('Ueberlagerungen werden eingerechnet', 76 + Math.round((s / totalWork) * 8)))
  }

  // --- 3b. Texte ---------------------------------------------------------
  const textClips = project.tracks
    .filter(t => t.type === 'video')
    .flatMap(t => t.clips)
    .filter(c => c.type === 'text' && String(c.text ?? '').trim() && !preSet.has(c.id))
    .sort((a, b) => a.start - b.start)
  if (textClips.length) {
    onStep('Texte werden gezeichnet', 84)
    videoFile = await textPass(videoFile, textClips, project,
      path.join(tmpDir, 'video_txt.mp4'),
      s => onStep('Texte werden gezeichnet', 84 + Math.round((s / totalWork) * 2)))
  }

  // --- 3c. Grafiken ------------------------------------------------------
  const mgClips = project.tracks
    .filter(t => t.type === 'video')
    .flatMap(t => t.clips)
    .filter(c => c.type === 'mg' || preSet.has(c.id))
    .sort((a, b) => a.start - b.start)
  if (mgClips.length && mgDir) {
    onStep('Grafiken werden eingerechnet', 86)
    videoFile = await mgPass(videoFile, mgClips, project,
      path.join(tmpDir, 'video_mg.mp4'), mgDir,
      s => onStep('Grafiken werden eingerechnet', 86 + Math.round((s / totalWork) * 2)))
  }

  // --- 4. Ton -----------------------------------------------------------
  onStep('Ton wird gemischt', 86)
  const audioGroups = { speech: [], duck: [], other: [] }
  for (const tr of project.tracks) {
    for (const clip of tr.clips) {
      const media = mediaById.get(clip.mediaId)
      if (!media?.hasAudio || (clip.volume ?? 1) <= 0) continue
      const entry = { clip, media }
      if (tr.type === 'video') audioGroups.speech.push(entry)
      else if (tr.duck) audioGroups.duck.push(entry)
      else audioGroups.other.push(entry)
    }
  }
  const audioFile = await buildAudio(audioGroups, project, path.join(tmpDir, 'audio.m4a'),
    s => onStep('Ton wird gemischt', 86 + Math.round((s / totalWork) * 6)))

  // --- 5. Zusammenfuegen ------------------------------------------------
  onStep('Datei wird geschrieben', 94)
  const q = QUALITY[quality] ?? QUALITY.hoch
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  // Optionaler Render-Bereich: nur das gewuenschte Stueck herausschneiden
  const range = project.range && project.range.out > project.range.in + 0.05
    ? { in: Math.max(0, project.range.in), out: Math.min(project.range.out, total) }
    : null
  const seek = range ? ['-ss', t3(range.in), '-to', t3(range.out)] : []
  // Ziel-Aufloesung: Hardware-Weiche gegen die AUSGABE-Groesse pruefen
  const outW = scaleTo?.w ?? project.settings.width
  const outH = scaleTo?.h ?? project.settings.height
  const hwFinal = await hasVideoToolbox() && vtAllowed(outW, outH)
  const finalCodec = hwFinal
    ? ['-c:v', 'h264_videotoolbox', '-q:v', q.vtq, '-profile:v', 'high']
    : ['-c:v', 'libx264', '-preset', q.preset, '-crf', q.crf, '-profile:v', 'high']
  const scaleArgs = scaleTo ? ['-vf', `scale=${outW}:${outH}:flags=lanczos`] : []
  await runFfmpeg([
    '-y', ...seek, '-i', videoFile, ...seek, '-i', audioFile,
    '-map', '0:v:0', '-map', '1:a:0',
    ...scaleArgs,
    ...finalCodec,
    '-pix_fmt', 'yuv420p',
    ...(loudness ? ['-af', 'loudnorm=I=-14:TP=-1.5:LRA=11'] : []),
    '-c:a', 'aac', '-b:a', q.audio,
    '-shortest', '-movflags', '+faststart',
    outFile
  ], { onProgress: s => onStep('Datei wird geschrieben', 94 + Math.min(5, Math.round((s / totalWork) * 5))) })

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  onStep('Fertig', 100)
  return outFile
}

/**
 * Den kompletten Timeline-Ton als 16-kHz-Mono-WAV rendern -
 * genau das Format, das die Spracherkennung braucht.
 */
export async function exportTimelineAudio (project, outFile, tmpDir) {
  project = { ...project, tracks: project.tracks.filter(t => !t.hidden) }
  await fs.mkdir(tmpDir, { recursive: true })
  const mediaById = new Map(project.media.map(m => [m.id, m]))
  const sources = []
  for (const tr of project.tracks) {
    for (const clip of tr.clips) {
      const media = mediaById.get(clip.mediaId)
      if (media?.hasAudio && (clip.volume ?? 1) > 0) sources.push({ clip, media })
    }
  }
  if (!sources.length) throw new Error('Die Timeline enthaelt keinen Ton.')
  const m4a = await buildAudio({ speech: sources }, project, path.join(tmpDir, 'subs.m4a'))
  await runFfmpeg(['-y', '-i', m4a, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outFile])
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  return outFile
}
