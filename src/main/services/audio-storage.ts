import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const AUDIO_DIR = 'audio-recordings'

function getAudioDir(): string {
  const dir = path.join(app.getPath('userData'), AUDIO_DIR)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function saveAudio(id: string, buffer: Buffer): string {
  const fileName = `${id}.webm`
  const filePath = path.join(getAudioDir(), fileName)
  fs.writeFileSync(filePath, buffer)
  return fileName
}

export function loadAudio(fileName: string): Buffer | null {
  const filePath = path.join(getAudioDir(), fileName)
  try {
    return fs.readFileSync(filePath)
  } catch {
    return null
  }
}

export function deleteAudio(fileName: string): void {
  const filePath = path.join(getAudioDir(), fileName)
  try {
    fs.unlinkSync(filePath)
  } catch {
    // Файл уже удалён — ничего страшного
  }
}
