// Lokaler Server: liefert die Oberflaeche aus und erledigt alles,
// was der Browser nicht kann - Dateien analysieren, Proxies bauen, exportieren.
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { ffmpegReady, FFMPEG, FFPROBE, probe, makeProxy, makeThumbStrip, makePoster, makeWaveform } from './lib/ffmpeg.mjs'
import { emptyProject, normalize, newId, saveProject, loadProject, listProjects, TRANSITIONS } from './lib/project.mjs'
import { exportProject, exportTimelineAudio } from './lib/export.mjs'
import { whisperReady, transcribe, parseSrt } from './lib/subtitles.mjs'

const execAsync = promisify(exec)
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.join(ROOT, 'web')
const CACHE = path.join(ROOT, 'cache')
const MEDIA = path.join(ROOT, 'media')
const PROJECTS = path.join(ROOT, 'projects')
const EXPORTS = path.join(ROOT, 'exports')
const PORT = Number(process.env.PORT ?? 4321)

for (const dir of [CACHE, MEDIA, PROJECTS, EXPORTS]) fs.mkdirSync(dir, { recursive: true })

const jobs = new Map()
const mediaIndex = new Map()   // id -> Metadaten, damit Proxy-Pfade aufloesbar bleiben

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4a': 'audio/mp4',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.webm': 'video/webm', '.svg': 'image/svg+xml'
}

const json = (res, data, code = 200) => {
  const body = JSON.stringify(data)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

const readBody = req => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) }
    catch (e) { reject(e) }
  })
  req.on('error', reject)
})

/** Datei ausliefern - mit Range-Unterstuetzung, sonst kann das Video nicht springen. */
function sendFile (req, res, file) {
  fs.stat(file, (err, stat) => {
    if (err) { res.writeHead(404); return res.end('nicht gefunden') }
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
    const range = req.headers.range

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range)
      const start = m[1] ? Number(m[1]) : 0
      const end = m[2] ? Number(m[2]) : stat.size - 1
      if (start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` })
        return res.end()
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': 'no-cache'
      })
      return fs.createReadStream(file, { start, end }).pipe(res)
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': file.startsWith(WEB) ? 'no-cache' : 'public, max-age=3600'
    })
    fs.createReadStream(file).pipe(res)
  })
}

/** Nativer macOS-Dateidialog - schneller als Hochladen, das Material bleibt wo es ist. */
async function pickFiles () {
  const script = [
    'set theFiles to choose file with prompt "Videos, Bilder oder Musik auswaehlen" with multiple selections allowed',
    'set out to ""',
    'repeat with f in theFiles',
    'set out to out & POSIX path of f & linefeed',
    'end repeat',
    'return out'
  ].map(l => `-e ${JSON.stringify(l)}`).join(' ')
  try {
    const { stdout } = await execAsync(`osascript ${script}`, { maxBuffer: 1024 * 1024 })
    return stdout.split('\n').map(s => s.trim()).filter(Boolean)
  } catch {
    return []   // Abbruch im Dialog ist kein Fehler
  }
}

/** Material analysieren und im Hintergrund Proxy, Vorschaubilder und Wellenform bauen. */
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.gif'])

async function importFile (file, job) {
  const ext = path.extname(file).toLowerCase()

  if (IMAGE_EXTS.has(ext)) {
    const info = await probe(file)
    const id = newId('m')
    const base = path.join(CACHE, id)
    await makePoster(file, `${base}_poster.jpg`, { at: 0, height: 160 })
    const media = {
      id,
      path: file,
      name: path.basename(file),
      isImage: true,
      duration: 0,
      width: info.width,
      height: info.height,
      fps: 0,
      hasVideo: true,
      hasAudio: false,
      codec: info.codec,
      proxy: null,
      poster: `${id}_poster.jpg`,
      thumbs: null,
      waveform: null
    }
    mediaIndex.set(id, media)
    return media
  }

  const info = await probe(file)
  const id = newId('m')
  const base = path.join(CACHE, id)
  const media = {
    id,
    path: file,
    name: path.basename(file),
    ...info,
    proxy: null,
    poster: null,
    thumbs: null,
    waveform: null
  }

  if (info.hasVideo) {
    job.note = `${media.name}: Vorschau wird vorbereitet`
    await makeProxy(file, `${base}_proxy.mp4`, {
      onProgress: s => { job.fileProgress = Math.min(1, s / Math.max(info.duration, 0.1)) }
    })
    media.proxy = `${id}_proxy.mp4`
    await makePoster(`${base}_proxy.mp4`, `${base}_poster.jpg`, { at: Math.min(1, info.duration / 2) }).catch(() => {})
    media.poster = `${id}_poster.jpg`
    await makeThumbStrip(`${base}_proxy.mp4`, `${base}_thumbs.jpg`, { duration: info.duration }).catch(() => {})
    media.thumbs = `${id}_thumbs.jpg`
  }
  if (info.hasAudio) {
    await makeWaveform(info.hasVideo ? `${base}_proxy.mp4` : file, `${base}_wave.png`).catch(() => {})
    media.waveform = `${id}_wave.png`
    if (!info.hasVideo) media.proxy = null
  }

  mediaIndex.set(id, media)
  return media
}

/** Bilder, die vor der Bild-Unterstuetzung importiert wurden, nachtraeglich umwidmen. */
function healLegacyImages (project) {
  let touched = false
  for (const m of project.media) {
    if (!m.isImage && IMAGE_EXTS.has(path.extname(m.name ?? '').toLowerCase())) {
      m.isImage = true
      m.duration = 0
      m.hasAudio = false
      m.proxy = null
      m.thumbs = null
      touched = true
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          if (clip.mediaId === m.id && (clip.out - clip.in) < 0.2) {
            clip.in = 0
            clip.out = 5
          }
        }
      }
    }
  }
  return touched ? normalize(project) : project
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const route = url.pathname

  try {
    // ---------- API ----------
    if (route === '/api/status') {
      return json(res, {
        ffmpeg: ffmpegReady(),
        whisper: whisperReady(),
        ffmpegPath: FFMPEG,
        ffprobePath: FFPROBE,
        transitions: TRANSITIONS,
        exportsDir: EXPORTS
      })
    }

    if (route === '/api/pick' && req.method === 'POST') {
      return json(res, { paths: await pickFiles() })
    }

    if (route === '/api/import' && req.method === 'POST') {
      const { paths = [] } = await readBody(req)
      const jobId = newId('job')
      const job = { id: jobId, state: 'laeuft', done: 0, total: paths.length, media: [], note: '', fileProgress: 0 }
      jobs.set(jobId, job)
      ;(async () => {
        for (const file of paths) {
          try {
            job.media.push(await importFile(file, job))
          } catch (e) {
            job.errors = job.errors ?? []
            job.errors.push(`${path.basename(file)}: ${e.message}`)
          }
          job.done += 1
          job.fileProgress = 0
        }
        job.state = 'fertig'
      })()
      return json(res, { jobId })
    }

    if (route.startsWith('/api/job/')) {
      const job = jobs.get(route.slice('/api/job/'.length))
      if (!job) return json(res, { error: 'unbekannt' }, 404)
      return json(res, job)
    }

    if (route === '/api/subtitles/run' && req.method === 'POST') {
      const { project, language = 'de' } = await readBody(req)
      const clean = normalize(project)
      const jobId = newId('job')
      const job = { id: jobId, state: 'laeuft', percent: 0, note: 'Ton wird vorbereitet' }
      jobs.set(jobId, job)
      ;(async () => {
        try {
          const wav = path.join(CACHE, `${jobId}.wav`)
          await exportTimelineAudio(clean, wav, path.join(CACHE, `tmp_${jobId}`))
          job.note = 'Sprache wird erkannt'
          job.percent = 10
          const segments = await transcribe(wav, {
            language,
            onProgress: p => { job.percent = 10 + Math.round(p * 0.9); job.note = 'Sprache wird erkannt' }
          })
          await fsp.rm(wav, { force: true }).catch(() => {})
          job.segments = segments
          job.state = 'fertig'
          job.percent = 100
          job.note = `${segments.length} Untertitel erkannt`
        } catch (e) {
          job.state = 'fehler'
          job.note = e.message
        }
      })()
      return json(res, { jobId })
    }

    if (route === '/api/subtitles/srt' && req.method === 'POST') {
      // Nativer Dialog: SRT-Datei waehlen und einlesen
      const script = [
        'set f to choose file with prompt "SRT-Untertiteldatei auswaehlen"',
        'return POSIX path of f'
      ].map(l => `-e ${JSON.stringify(l)}`).join(' ')
      try {
        const { stdout } = await execAsync(`osascript ${script}`)
        const file = stdout.trim()
        if (!file) return json(res, { segments: [] })
        return json(res, { segments: await parseSrt(file) })
      } catch {
        return json(res, { segments: [] })
      }
    }

    if (route === '/api/mg/frames' && req.method === 'POST') {
      const { clipId, start = 0, frames = [], reset = false } = await readBody(req)
      const safe = String(clipId).replace(/[^\w-]/g, '')
      if (!safe) return json(res, { error: 'clipId fehlt' }, 400)
      const dir = path.join(CACHE, 'mg', safe)
      if (reset) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
      fs.mkdirSync(dir, { recursive: true })
      frames.forEach((b64, i) => {
        fs.writeFileSync(
          path.join(dir, `f_${String(start + i + 1).padStart(5, '0')}.png`),
          Buffer.from(b64, 'base64')
        )
      })
      return json(res, { ok: true })
    }

    if (route === '/api/export' && req.method === 'POST') {
      const { project, quality = 'hoch', filename, scaleTo = null, preRendered = [], loudness = false } = await readBody(req)
      const clean = normalize(project)
      const name = (filename || clean.name || 'export').replace(/[^\w\-. äöüÄÖÜß]/g, '_')
      const outFile = path.join(EXPORTS, `${name}.mp4`)
      const jobId = newId('job')
      const job = { id: jobId, state: 'laeuft', percent: 0, note: 'Export startet', file: outFile }
      jobs.set(jobId, job)
      ;(async () => {
        try {
          await exportProject(clean, {
            outFile,
            tmpDir: path.join(CACHE, `tmp_${jobId}`),
            quality,
            scaleTo,
            preRendered,
            loudness,
            mgDir: path.join(CACHE, 'mg'),
            onStep: (note, percent) => { job.note = note; job.percent = percent }
          })
          job.state = 'fertig'
          job.percent = 100
          job.note = 'Fertig'
        } catch (e) {
          job.state = 'fehler'
          job.note = e.message
        }
      })()
      return json(res, { jobId })
    }

    if (route === '/api/reveal' && req.method === 'POST') {
      const { file } = await readBody(req)
      if (file && file.startsWith(EXPORTS)) await execAsync(`open -R ${JSON.stringify(file)}`).catch(() => {})
      return json(res, { ok: true })
    }

    if (route === '/api/projects') return json(res, { projects: await listProjects(PROJECTS) })

    if (route === '/api/project/save' && req.method === 'POST') {
      const { project } = await readBody(req)
      const file = await saveProject(PROJECTS, normalize(project))
      return json(res, { ok: true, file: path.basename(file) })
    }

    if (route === '/api/project/load') {
      const file = path.join(PROJECTS, path.basename(url.searchParams.get('file') ?? ''))
      let project = await loadProject(file)
      project = healLegacyImages(project)
      for (const m of project.media) mediaIndex.set(m.id, m)
      return json(res, { project })
    }

    if (route === '/api/project/new') return json(res, { project: emptyProject() })

    // ---------- Dateien ----------
    if (route.startsWith('/cache/')) {
      return sendFile(req, res, path.join(CACHE, path.basename(route)))
    }

    // Originaldatei streamen (Vorschau ohne Proxy, z.B. reine Tonspuren)
    if (route === '/original') {
      const media = mediaIndex.get(url.searchParams.get('id') ?? '')
      if (!media) { res.writeHead(404); return res.end('unbekannt') }
      return sendFile(req, res, media.path)
    }

    const file = route === '/' ? path.join(WEB, 'index.html') : path.join(WEB, route)
    if (!file.startsWith(WEB)) { res.writeHead(403); return res.end('verboten') }
    return sendFile(req, res, file)
  } catch (e) {
    return json(res, { error: e.message }, 500)
  }
})

server.listen(PORT, () => {
  console.log('')
  console.log('  Schnitt laeuft:  http://localhost:' + PORT)
  console.log('  ffmpeg:          ' + (ffmpegReady() ? FFMPEG : 'FEHLT - bitte "npm install" im Ordner schnitt ausfuehren'))
  console.log('')
})
