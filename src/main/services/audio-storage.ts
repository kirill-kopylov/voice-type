import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const AUDIO_DIR = 'audio-recordings'
const PROFILES_DIR = 'voice-profiles'

function getAudioDir(): string {
  const dir = path.join(app.getPath('userData'), AUDIO_DIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getProfilesDir(): string {
  const dir = path.join(app.getPath('userData'), PROFILES_DIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function saveProfileAudio(id: string, buffer: Buffer): string {
  const fileName = `${id}.wav`
  fs.writeFileSync(path.join(getProfilesDir(), fileName), buffer)
  return fileName
}

export function loadProfileAudio(fileName: string): Buffer | null {
  try {
    return fs.readFileSync(path.join(getProfilesDir(), fileName))
  } catch {
    return null
  }
}

export function deleteProfileAudio(fileName: string): void {
  try {
    fs.unlinkSync(path.join(getProfilesDir(), fileName))
  } catch {
    // already gone
  }
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
