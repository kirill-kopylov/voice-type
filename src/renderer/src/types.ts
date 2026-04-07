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

export interface VoiceTypeAPI {
  submitAudio: (audioData: ArrayBuffer, durationMs: number) => Promise<TranscriptionRecord>
  getHistory: () => Promise<TranscriptionRecord[]>
  deleteHistoryItem: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
  rePaste: (id: string) => Promise<void>
  retryTranscription: (id: string) => Promise<TranscriptionRecord>
  copyText: (text: string) => Promise<void>
  getAudio: (fileName: string) => Promise<ArrayBuffer | null>
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  testConnection: () => Promise<{ ok: boolean; error?: string }>
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  setOverlayTheme: (config: Record<string, string | number>) => void
  onRecordingStateChanged: (callback: (isRecording: boolean) => void) => () => void
  onTranscriptionComplete: (callback: (record: TranscriptionRecord) => void) => () => void
}

declare global {
  interface Window {
    api: VoiceTypeAPI
  }
}
