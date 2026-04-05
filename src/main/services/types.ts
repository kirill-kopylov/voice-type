export interface TranscriptionRecord {
  id: string
  text: string
  audioFileName: string
  durationMs: number
  createdAt: string
  provider: 'openai' | 'openrouter'
  model: string
  status: 'success' | 'error'
  error?: string
}

export interface AppSettings {
  provider: 'openai' | 'openrouter'
  openAiApiKey: string
  openRouterApiKey: string
  model: string
  language: string
  hotkey: string
  autoPaste: boolean
  keepInClipboard: boolean
  autoStart: boolean
}

export interface StoreSchema {
  settings: AppSettings
  history: TranscriptionRecord[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openai',
  openAiApiKey: '',
  openRouterApiKey: '',
  model: 'whisper-1',
  language: 'ru',
  hotkey: 'CommandOrControl+Shift+H',
  autoPaste: true,
  keepInClipboard: false,
  autoStart: false
}
