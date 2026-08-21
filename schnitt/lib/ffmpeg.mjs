// Alles, was mit ffmpeg zu tun hat: Binary finden, Material analysieren,
// Proxies bauen (fuer fluessige Vorschau), Vorschaubilder und Wellenform.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function firstExisting (candidates) {
  for (const c of candidates) {
    if (!c) continue
    try { fs.accessSync(c, fs.constants.X_OK); return c } catch {}
  }
  return null
}

function fromPackage (name, key) {
  try {
    const mod = require(name)
    const p = typeof mod === 'string' ? mod : mod?.path ?? mod?.default
    return typeof p === 'string' ? p : null
  } catch { return null }
}

export const FFMPEG = firstExisting([
  process.env.FFMPEG_PATH,
  fromPackage('ffmpeg-static'),
  path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg'),
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg'
])

export const FFPROBE = firstExisting([
  process.env.FFPROBE_PATH,
  fromPackage('ffprobe-static'),
  path.join(ROOT, 'node_modules/ffprobe-static/bin/darwin/arm64/ffprobe'),
  '/opt/homebrew/bin/ffprobe',
  '/usr/local/bin/ffprobe',
  '/usr/bin/ffprobe'
])

export function ffmpegReady () {
  return Boolean(FFMPEG && FFPROBE)
}

/** ffmpeg/ffprobe ausfuehren. onProgress bekommt die "time=..."-Sekunden. */
export function run (bin, args, { onProgress, onLine } = {}) {
  return new Promise((resolve, reject) => {
    if (!bin) return reject(new Error('ffmpeg ist nicht installiert'))
    const child = spawn(bin, args)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => {
      const text = String(d)
      stderr += text
      if (stderr.length > 200000) stderr = stderr.slice(-100000)
      if (onProgress) {
        const m = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(text)
        if (m) onProgress(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]))
      }
      if (onLine) onLine(text)
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`ffmpeg beendet mit Code ${code}\n${stderr.slice(-2500)}`))
    })
  })
}

const ff = (args, opts) => run(FFMPEG, args, opts)
const probeRun = args => run(FFPROBE, args)

/** Liest Aufloesung, Dauer, Framerate, Tonspur aus einer Datei. */
export async function probe (file) {
  const { stdout } = await probeRun([
    '-v', 'error', '-print_format', 'json',
    '-show_format', '-show_streams', file
  ])
  const info = JSON.parse(stdout)
  const video = info.streams.find(s => s.codec_type === 'video')
  const audio = info.streams.find(s => s.codec_type === 'audio')

  let fps = 30
  if (video?.avg_frame_rate && video.avg_frame_rate !== '0/0') {
    const [n, d] = video.avg_frame_rate.split('/').map(Number)
    if (d) fps = n / d
  }

  // Hochkant gefilmtes Material meldet die Drehung separat
  const rotation = Math.abs(Number(
    video?.side_data_list?.find(s => s.rotation != null)?.rotation ??
    video?.tags?.rotate ?? 0
  )) % 180
  const swapped = rotation === 90
  const width = swapped ? Number(video?.height ?? 0) : Number(video?.width ?? 0)
  const height = swapped ? Number(video?.width ?? 0) : Number(video?.height ?? 0)

  return {
    duration: Number(info.format?.duration ?? 0),
    width,
    height,
    fps: Math.round(fps * 1000) / 1000,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    codec: video?.codec_name ?? audio?.codec_name ?? 'unbekannt'
  }
}

/**
 * Proxy bauen: kleine Kopie, in der JEDES Bild ein Keyframe ist (-g 1).
 * Genau das macht Scrubbing in der Vorschau verzoegerungsfrei.
 */
export async function makeProxy (src, dest, { height = 540, onProgress } = {}) {
  await ff([
    '-y', '-i', src,
    '-vf', `scale=-2:${height}:flags=bilinear,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
    '-g', '1', '-keyint_min', '1', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart',
    dest
  ], { onProgress })
  return dest
}

/** Streifen aus Vorschaubildern fuer die Clip-Karten in der Timeline. */
export async function makeThumbStrip (src, dest, { duration, count = 12, height = 72 } = {}) {
  const step = Math.max(duration / count, 0.04)
  await ff([
    '-y', '-i', src,
    '-vf', `fps=1/${step.toFixed(4)},scale=-2:${height},tile=${count}x1`,
    '-frames:v', '1', '-qscale:v', '4',
    dest
  ])
  return dest
}

/** Einzelnes Vorschaubild (Mediathek). */
export async function makePoster (src, dest, { at = 0, height = 160 } = {}) {
  await ff([
    '-y', '-ss', String(at), '-i', src,
    '-vf', `scale=-2:${height}`, '-frames:v', '1', '-qscale:v', '3',
    dest
  ])
  return dest
}

/** Wellenform als PNG mit Transparenz - liegt spaeter im Clip hinter dem Bild. */
export async function makeWaveform (src, dest, { width = 1200, height = 60 } = {}) {
  await ff([
    '-y', '-i', src,
    '-filter_complex',
    `[0:a]aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=#8ab4ff@0.9`,
    '-frames:v', '1',
    dest
  ])
  return dest
}

export { ff as runFfmpeg }

let vtCache = null
/** Steht der Hardware-Encoder des Apple-Chips zur Verfuegung? */
export async function hasVideoToolbox () {
  if (vtCache !== null) return vtCache
  try {
    const { stdout } = await run(FFMPEG, ['-hide_banner', '-encoders'])
    vtCache = stdout.includes('h264_videotoolbox')
  } catch { vtCache = false }
  return vtCache
}
