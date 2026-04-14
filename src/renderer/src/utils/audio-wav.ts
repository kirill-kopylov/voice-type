/**
 * Извлечение аудио конкретного спикера из webm-записи встречи.
 * Декодируем webm → AudioBuffer, вырезаем сегменты по таймкодам,
 * склеиваем в один буфер, кодируем в WAV (моно, нужный API формат).
 *
 * Лимит: до MAX_DURATION_SEC секунд итогового аудио — для voice profile
 * не нужно много, и API всё равно ограничивает размер референса.
 */

const MAX_DURATION_SEC = 30
const MIN_DURATION_SEC = 3
const TARGET_SAMPLE_RATE = 16000  // OpenAI любит 16kHz

export interface SpeakerSegment {
  start: number
  end: number
}

export async function extractSpeakerWav(
  webmBuffer: ArrayBuffer,
  segments: SpeakerSegment[]
): Promise<ArrayBuffer | null> {
  if (segments.length === 0) return null

  const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(webmBuffer.slice(0))
  } catch (err) {
    console.error('Не удалось декодировать аудио:', err)
    return null
  }

  const sr = decoded.sampleRate
  const channelData = decoded.getChannelData(0)

  // Отбираем сегменты до лимита по времени
  let totalSec = 0
  const picked: SpeakerSegment[] = []
  for (const seg of segments) {
    const dur = seg.end - seg.start
    if (dur < 0.3) continue  // слишком короткие — мусор
    if (totalSec + dur > MAX_DURATION_SEC) {
      const remaining = MAX_DURATION_SEC - totalSec
      if (remaining < 1) break
      picked.push({ start: seg.start, end: seg.start + remaining })
      totalSec = MAX_DURATION_SEC
      break
    }
    picked.push(seg)
    totalSec += dur
  }

  if (totalSec < MIN_DURATION_SEC) {
    console.warn(`Слишком мало аудио для профиля: ${totalSec.toFixed(1)}с`)
    return null
  }

  const totalSamples = Math.floor(totalSec * sr)
  const merged = new Float32Array(totalSamples)
  let offset = 0

  for (const seg of picked) {
    const startSample = Math.max(0, Math.floor(seg.start * sr))
    const endSample = Math.min(channelData.length, Math.floor(seg.end * sr))
    const length = endSample - startSample
    if (length <= 0) continue

    const slice = channelData.subarray(startSample, endSample)
    merged.set(slice.subarray(0, Math.min(length, totalSamples - offset)), offset)
    offset += length
    if (offset >= totalSamples) break
  }

  return floatToWav(merged.subarray(0, offset), sr)
}

/**
 * Кодируем Float32 PCM (-1..1) → WAV PCM 16-bit моно.
 */
function floatToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const byteLength = samples.length * 2
  const buffer = new ArrayBuffer(44 + byteLength)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + byteLength, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)            // chunk size
  view.setUint16(20, 1, true)             // PCM format
  view.setUint16(22, 1, true)             // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true)             // block align
  view.setUint16(34, 16, true)            // bits per sample

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, byteLength, true)

  // PCM 16-bit samples
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return buffer
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
