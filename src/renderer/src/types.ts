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

export interface VoiceTypeAPI {
  submitAudio: (audioData: ArrayBuffer, durationMs: number) => Promise<TranscriptionRecord>
  getHistory: () => Promise<TranscriptionRecord[]>
  deleteHistoryItem: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
  rePaste: (id: string) => Promise<void>
  copyText: (text: string) => Promise<void>
  getAudio: (fileName: string) => Promise<ArrayBuffer | null>
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  testConnection: () => Promise<{ ok: boolean; error?: string }>
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  onRecordingStateChanged: (callback: (isRecording: boolean) => void) => () => void
  onTranscriptionComplete: (callback: (record: TranscriptionRecord) => void) => () => void
}

declare global {
  interface Window {
    api: VoiceTypeAPI
  }
}
