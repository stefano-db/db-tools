// Untertitel: lokale Spracherkennung (whisper.cpp) und SRT-Import.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { run } from './ffmpeg.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WHISPER_BIN = path.join(ROOT, 'whisper/whisper.cpp-1.5.5/main')
const WHISPER_MODEL = path.join(ROOT, 'whisper/ggml-base.bin')

export function whisperReady () {
  try {
    fs.accessSync(WHISPER_BIN, fs.constants.X_OK)
    fs.accessSync(WHISPER_MODEL, fs.constants.R_OK)
    return true
  } catch { return false }
}

/**
 * WAV (16 kHz mono) transkribieren.
 * Liefert [{ start, end, text }] in Sekunden, in lesbare Stuecke zerteilt.
 */
export async function transcribe (wavFile, { language = 'de', onProgress } = {}) {
  if (!whisperReady()) {
    throw new Error('Die Spracherkennung ist nicht eingerichtet (whisper fehlt).')
  }
  const outPrefix = wavFile.replace(/\.wav$/, '_whisper')
  await run(WHISPER_BIN, [
    '-m', WHISPER_MODEL,
    '-f', wavFile,
    '-l', language,
    '-oj', '-of', outPrefix,
    '-ml', '52', '-sow',          // maximal ~52 Zeichen pro Untertitel, an Wortgrenzen
    '-t', '6', '-pp'
  ], {
    onLine: text => {
      const m = /progress\s*=\s*(\d+)%/.exec(text)
      if (m && onProgress) onProgress(Number(m[1]))
    }
  })
  const data = JSON.parse(await fsp.readFile(`${outPrefix}.json`, 'utf8'))
  await fsp.rm(`${outPrefix}.json`, { force: true }).catch(() => {})
  return (data.transcription ?? [])
    .map(seg => ({
      start: (seg.offsets?.from ?? 0) / 1000,
      end: (seg.offsets?.to ?? 0) / 1000,
      text: String(seg.text ?? '').trim()
    }))
    .filter(seg => seg.text && seg.end > seg.start + 0.05)
}

/** SRT-Datei einlesen -> [{ start, end, text }]. */
export async function parseSrt (file) {
  const raw = await fsp.readFile(file, 'utf8')
  const blocks = raw.replace(/\r/g, '').split(/\n\n+/)
  const toSec = ts => {
    const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(ts)
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : 0
  }
  const out = []
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean)
    const timeIdx = lines.findIndex(l => l.includes('-->'))
    if (timeIdx === -1) continue
    const [a, b] = lines[timeIdx].split('-->')
    const text = lines.slice(timeIdx + 1).join('\n').trim()
    if (!text) continue
    out.push({ start: toSec(a), end: toSec(b), text })
  }
  return out
}
