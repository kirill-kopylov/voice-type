// Типы, общие для main, preload и renderer: данные приложения и контракт IPC.

export type Provider = 'openai' | 'openrouter' | 'groq'

export interface DialogSegment {
  speaker: string   // "Speaker 1", "Speaker 2" или пользовательское имя
  text: string
  start: number     // секунды от начала
  end: number
}

export interface MeetingDecision {
  text: string
  assignee?: string
  deadline?: string
}

export interface MeetingSummary {
  brief: string                              // 2-3 предложения
  topics: string[]
  decisions: MeetingDecision[]
  guessedNames?: Record<string, string>      // raw speaker -> guessed name
}

/** Заметка к встрече: свою оставляет пользователь, остальные — нейроагенты через MCP. */
export interface MeetingNote {
  id: string
  text: string
  source: 'user' | 'agent'
  author: string
  createdAt: string
  updatedAt?: string
}

export interface MeetingRecord {
  id: string
  title: string
  audioFileName: string
  durationMs: number
  createdAt: string
  segments: DialogSegment[]
  speakerNames: Record<string, string>       // "Speaker 1" -> "Кирилл"
  summary?: MeetingSummary
  summaryStatus?: 'pending' | 'done' | 'error'
  summaryError?: string
  notes?: MeetingNote[]
  status: 'success' | 'error'
  error?: string
}

export interface VoiceProfile {
  id: string
  name: string                               // "Кирилл"
  audioFileName: string                      // wav в voice-profiles/
  durationMs: number
  segmentCount: number                       // сколько кусков склеено
  sourceMeetingId?: string
  createdAt: string
}

export interface TranscriptionRecord {
  id: string
  text: string
  audioFileName: string
  durationMs: number
  createdAt: string
  provider: Provider
  model: string
  status: 'success' | 'error'
  error?: string
}

export interface ScreenPoint {
  x: number
  y: number
}

export interface AppSettings {
  provider: Provider
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
  stickyWindow: boolean
  stickyHotkey: string
  meetingHotkey: string
  captureSystemAudio: boolean
  autoStart: boolean
  theme: string
  telegramEnabled: boolean
  telegramBotToken: string
  telegramAllowedUserIds: number[]
  // id канала, куда пишет приложение на телефоне (в формате Bot API, -100…); 0 — выключено
  telegramRelayChannelId: number
  vkEnabled: boolean
  vkCommunityToken: string
  vkAllowedUserIds: number[]
  floatingButton: boolean
  floatingButtonPosition: ScreenPoint | null
  // MCP-сервер: нейроагенты ищут по диктовкам и встречам и оставляют заметки
  mcpEnabled: boolean
  mcpPort: number
  mcpToken: string
}

export interface StoreSchema {
  settings: AppSettings
  history: TranscriptionRecord[]
  meetings: MeetingRecord[]
  voiceProfiles: VoiceProfile[]
}

export interface MeetingLevels {
  mic: number
  system: number
  /** false — системный звук не захвачен, коллег в записи не будет */
  systemCaptured: boolean
}

export interface McpStatus {
  running: boolean
  /** Адрес для подключения агента; пусто, пока сервер выключен */
  url: string
  error?: string
}

/** Контракт между renderer и main: что preload выставляет в window.api. */
export interface VoiceTypeAPI {
  submitAudio: (audioData: ArrayBuffer, durationMs: number) => Promise<TranscriptionRecord>
  getHistory: () => Promise<TranscriptionRecord[]>
  deleteHistoryItem: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
  rePaste: (id: string) => Promise<void>
  retryTranscription: (id: string) => Promise<TranscriptionRecord>
  submitMeeting: (audioData: ArrayBuffer, durationMs: number) => Promise<MeetingRecord>
  getMeetings: () => Promise<MeetingRecord[]>
  deleteMeeting: (id: string) => Promise<void>
  renameMeetingSpeaker: (id: string, oldName: string, newName: string) => Promise<void>
  addMeetingNote: (meetingId: string, text: string) => Promise<MeetingRecord | null>
  updateMeetingNote: (meetingId: string, noteId: string, text: string) => Promise<MeetingRecord | null>
  deleteMeetingNote: (meetingId: string, noteId: string) => Promise<MeetingRecord | null>
  getMeetingAudio: (fileName: string) => Promise<ArrayBuffer | null>
  generateMeetingSummary: (id: string) => Promise<MeetingRecord | null>
  retryMeeting: (id: string) => Promise<MeetingRecord | null>
  getVoiceProfiles: () => Promise<VoiceProfile[]>
  createVoiceProfileFromMeeting: (meetingId: string, speaker: string, name: string) => Promise<{ profile?: VoiceProfile; error?: string }>
  deleteVoiceProfile: (id: string) => Promise<void>
  getVoiceProfileAudio: (fileName: string) => Promise<ArrayBuffer | null>
  onMeetingStateChanged: (callback: (isRecording: boolean) => void) => () => void
  onMeetingUpdated: (callback: (record: MeetingRecord) => void) => () => void
  onMeetingNotesChanged: (callback: (meetingId: string, notes: MeetingNote[]) => void) => () => void
  copyText: (text: string) => Promise<void>
  getAudio: (fileName: string) => Promise<ArrayBuffer | null>
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  getMcpStatus: () => Promise<McpStatus>
  testConnection: () => Promise<{ ok: boolean; error?: string }>
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  setOverlayTheme: (config: Record<string, string | number>) => void
  /** Уровни звука во время записи встречи (0..1) для индикатора в оверлее: свой микрофон и системный звук (коллеги). */
  sendMeetingLevels: (levels: MeetingLevels) => void
  onRecordingStateChanged: (callback: (isRecording: boolean) => void) => () => void
  onTranscriptionComplete: (callback: (record: TranscriptionRecord) => void) => () => void
}
