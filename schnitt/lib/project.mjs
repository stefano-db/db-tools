// Das Projektformat. Bewusst flach und lesbar gehalten:
// Es ist eine ganz normale JSON-Datei, die auch Claude direkt bearbeiten kann.
import fs from 'node:fs/promises'
import path from 'node:path'

export const TRANSITIONS = [
  { id: 'none',       label: 'Harter Schnitt', ffmpeg: null },
  { id: 'fade',       label: 'Weich',          ffmpeg: 'fade' },
  { id: 'fadeblack',  label: 'Ueber Schwarz',  ffmpeg: 'fadeblack' },
  { id: 'wipeleft',   label: 'Wischen links',  ffmpeg: 'wipeleft' },
  { id: 'wiperight',  label: 'Wischen rechts', ffmpeg: 'wiperight' },
  { id: 'slideup',    label: 'Nach oben',      ffmpeg: 'slideup' },
  { id: 'circleopen', label: 'Kreis',          ffmpeg: 'circleopen' }
]

export function emptyProject (name = 'Ohne Titel') {
  return {
    version: 2,
    name,
    settings: { width: 1920, height: 1080, fps: 30, background: '#000000' },
    media: [],
    tracks: [
      { id: 'V1', type: 'video', label: 'Video 1', clips: [] },
      { id: 'A1', type: 'audio', label: 'Ton 1', clips: [] }
    ]
  }
}

export function defaultClip (patch = {}) {
  return {
    id: patch.id ?? newId('c'),
    mediaId: null,
    start: 0,        // Position auf der Timeline (Sekunden)
    in: 0,           // Startpunkt im Quellmaterial
    out: 0,          // Endpunkt im Quellmaterial
    volume: 1,
    scale: 1,
    x: 0,            // Verschiebung in Prozent der Breite (-1 .. 1)
    y: 0,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    transition: { type: 'none', duration: 0.5 }, // gilt zum VORHERIGEN Clip
    effect: { type: 'none', amount: 0.5 },       // sanfte Dauer-Bewegung
    ...patch
  }
}

let counter = 0
export function newId (prefix = 'id') {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`
}

export const clipDuration = clip => Math.max(0, clip.out - clip.in)
export const clipEnd = clip => clip.start + clipDuration(clip)

/** Gesamtlaenge des Projekts in Sekunden. */
export function projectDuration (project) {
  let max = 0
  for (const track of project.tracks) {
    for (const clip of track.clips) max = Math.max(max, clipEnd(clip))
  }
  return max
}

/**
 * Repariert ein Projekt, das von aussen (Hand oder Claude) bearbeitet wurde:
 * fehlende Felder ergaenzen, Clips sortieren, Ueberlappungen ausser bei
 * Uebergaengen aufloesen. So kann nichts kaputtgehen.
 */
export function normalize (project) {
  const base = emptyProject(project?.name ?? 'Ohne Titel')
  const rawTracks = Array.isArray(project?.tracks) && project.tracks.length
    ? project.tracks
    : base.tracks

  let tracks = rawTracks
    .filter(t => t && t.id)
    .map(t => ({
      id: t.id,
      type: t.type === 'audio' ? 'audio' : 'video',
      label: t.label ?? t.id,
      hidden: Boolean(t.hidden),
      duck: Boolean(t.duck),
      clips: (t.clips ?? [])
        .map(c => ({
          ...defaultClip(),
          ...c,
          transition: { ...defaultClip().transition, ...(c.transition ?? {}) },
          effect: { ...defaultClip().effect, ...(c.effect ?? {}) }
        }))
        .filter(c => clipDuration(c) > 0.001)
        .sort((a, b) => a.start - b.start)
    }))

  // Grundausstattung sicherstellen und ordnen: erst Video (V1 zuunterst), dann Ton
  if (!tracks.some(t => t.id === 'V1' && t.type === 'video')) {
    tracks.unshift({ id: 'V1', type: 'video', label: 'Video 1', clips: [] })
  }
  if (!tracks.some(t => t.type === 'audio')) {
    tracks.push({ id: 'A1', type: 'audio', label: 'Ton 1', clips: [] })
  }
  const videos = tracks.filter(t => t.type === 'video')
  videos.sort((a, b) => (a.id === 'V1' ? -1 : b.id === 'V1' ? 1 : 0))
  tracks = [...videos, ...tracks.filter(t => t.type === 'audio')]

  const out = {
    ...base,
    ...project,
    settings: { ...base.settings, ...(project?.settings ?? {}) },
    media: Array.isArray(project?.media) ? project.media : [],
    tracks
  }

  for (const track of out.tracks) {
    if (track.id !== 'V1') {
      // Freie Spuren: keine Uebergaenge, Ueberlappung ist erlaubt (stapeln/mischen)
      for (const clip of track.clips) {
        clip.start = Math.max(0, clip.start)
        clip.transition = { type: 'none', duration: 0 }
      }
      continue
    }
    // Hauptspur: magnetisch, Uebergaenge ueberlappen kontrolliert
    for (let i = 0; i < track.clips.length; i++) {
      const clip = track.clips[i]
      const prev = track.clips[i - 1]
      clip.start = Math.max(0, clip.start)
      if (!prev) { clip.transition = { type: 'none', duration: 0 }; continue }
      const wanted = clip.transition?.type && clip.transition.type !== 'none'
        ? Math.min(
            clip.transition.duration ?? 0.5,
            clipDuration(prev) * 0.9,
            clipDuration(clip) * 0.9
          )
        : 0
      if (wanted > 0) {
        clip.transition.duration = Math.round(wanted * 1000) / 1000
        clip.start = Math.max(0, clipEnd(prev) - wanted)
      } else {
        clip.transition = { type: 'none', duration: 0 }
        if (clip.start < clipEnd(prev)) clip.start = clipEnd(prev)
      }
    }
  }
  return out
}

export async function saveProject (dir, project) {
  const safe = (project.name || 'projekt').replace(/[^\w\-. äöüÄÖÜß]/g, '_').trim()
  const file = path.join(dir, `${safe || 'projekt'}.json`)
  await fs.writeFile(file, JSON.stringify(project, null, 2), 'utf8')
  return file
}

export async function loadProject (file) {
  return normalize(JSON.parse(await fs.readFile(file, 'utf8')))
}

export async function listProjects (dir) {
  try {
    const files = await fs.readdir(dir)
    const out = []
    for (const f of files.filter(f => f.endsWith('.json'))) {
      const stat = await fs.stat(path.join(dir, f))
      out.push({ file: f, name: f.replace(/\.json$/, ''), modified: stat.mtimeMs })
    }
    return out.sort((a, b) => b.modified - a.modified)
  } catch { return [] }
}
