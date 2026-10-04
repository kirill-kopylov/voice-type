import { store } from './store'
import { transcribeAudio, AudioFormat } from './transcription'
import { pasteText } from './paste'
import { pasteToStickyWindow, getStickyHwnd } from './sticky-window'

// Колбэк фиксации транскрипции в истории. Внедряется из main-процесса —
// боты не имеют прямого доступа к окну и трею, поэтому запись идёт через него.
export type TranscriptionRecorder = (
  audioBuffer: Buffer,
  result: { text: string; error?: string },
  durationMs: number,
  audioExt?: string
) => void

export interface RemoteVoiceOutcome {
  ok: boolean
  text: string
  error?: string
}

let recorder: TranscriptionRecorder | null = null

export function setTranscriptionRecorder(r: TranscriptionRecorder): void {
  recorder = r
}

export function insertTextIntoActiveWindow(text: string): void {
  const settings = store.getSettings()
  if (settings.stickyWindow && getStickyHwnd()) {
    pasteToStickyWindow(text, settings.keepInClipboard)
  } else {
    pasteText(text, settings.keepInClipboard)
  }
}

// Единый путь голосового из внешнего канала (Telegram/VK): транскрибировать,
// зафиксировать в истории — включая ошибки, чтобы их можно было повторить, —
// и вставить текст в активное окно.
export async function handleRemoteVoice(
  buffer: Buffer,
  format: AudioFormat,
  durationMs: number
): Promise<RemoteVoiceOutcome> {
  const settings = store.getSettings()
  const result = await transcribeAudio(buffer, settings, format)

  const audioExt = format.filename.split('.').pop() ?? 'ogg'
  recorder?.(buffer, result, durationMs, audioExt)

  const text = result.text.trim()
  if (result.error || !text) {
    return { ok: false, text: '', error: result.error ?? 'Пустой результат' }
  }

  insertTextIntoActiveWindow(text)
  return { ok: true, text }
}

// STT API ориентируется по расширению файла, поэтому mime маппим на имя файла
export function detectAudioFormat(mime: string | undefined): AudioFormat {
  const m = mime ?? 'audio/ogg'
  if (m.includes('mp3') || m.includes('mpeg')) return { filename: 'voice.mp3', mimeType: 'audio/mpeg' }
  if (m.includes('mp4') || m.includes('m4a')) return { filename: 'voice.m4a', mimeType: 'audio/mp4' }
  if (m.includes('wav')) return { filename: 'voice.wav', mimeType: 'audio/wav' }
  return { filename: 'voice.ogg', mimeType: 'audio/ogg' }
}

export function textPreview(text: string, max = 200): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}
