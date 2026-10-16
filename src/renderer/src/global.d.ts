import type { VoiceTypeAPI } from '@shared/types'

declare global {
  interface Window {
    api: VoiceTypeAPI
  }

  // Electron до 32-й версии кладёт сюда путь перетащенного файла на диске
  interface File {
    path: string
  }
}
