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
  provider: 'openai' | 'openrouter' | 'groq'
  openAiApiKey: string
  openRouterApiKey: string
  groqApiKey: string
  model: string
  language: string
  hotkey: string
  autoPaste: boolean
  keepInClipboard: boolean
  autoEnter: boolean
  autoEnterTriggers: string
  autoStart: boolean
  theme: string
}

export interface StoreSchema {
  settings: AppSettings
  history: TranscriptionRecord[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openai',
  openAiApiKey: '',
  openRouterApiKey: '',
  groqApiKey: '',
  model: 'whisper-1',
  language: 'ru',
  hotkey: 'CommandOrControl+Shift+H',
  autoPaste: true,
  keepInClipboard: false,
  autoEnter: true,
  autoEnterTriggers: 'enter,энтер,ентер,отправь,отправить,send,пуш,push',
  theme: 'sunset',
  autoStart: false
}
