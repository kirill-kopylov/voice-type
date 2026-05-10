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
  stickyWindow: boolean
  stickyHotkey: string
  meetingHotkey: string
  captureSystemAudio: boolean
  autoStart: boolean
  theme: string
  telegramEnabled: boolean
  telegramBotToken: string
  telegramAllowedUserIds: number[]
}

export interface StoreSchema {
  settings: AppSettings
  history: TranscriptionRecord[]
  meetings: MeetingRecord[]
  voiceProfiles: VoiceProfile[]
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
  stickyWindow: false,
  stickyHotkey: 'CommandOrControl+Shift+L',
  meetingHotkey: 'CommandOrControl+Shift+M',
  captureSystemAudio: true,
  theme: 'sunset',
  autoStart: false,
  telegramEnabled: false,
  telegramBotToken: '',
  telegramAllowedUserIds: []
}
