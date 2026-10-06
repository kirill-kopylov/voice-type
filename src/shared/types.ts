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

/** Что снимать на видео во время встречи */
export type ScreenCaptureMode = 'off' | 'screen' | 'all-screens' | 'region'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Монитор: границы и масштаб в DIP (логических пикселях), как их отдаёт Electron */
export interface ScreenDisplay {
  id: string
  bounds: Rect
  scaleFactor: number
  primary: boolean
}

/** Выбранная пользователем область: координаты в DIP относительно левого верхнего угла монитора */
export interface ScreenRegion extends Rect {
  displayId: string
}

/** Что происходило на экране во время записи; atMs — от начала встречи, как время реплик и видео */
export type ScreenEvent = { atMs: number; /** Заголовок окна, в котором это случилось */ window?: string } & (
  | { kind: 'click'; displayId: string; x: number; y: number; button: 'left' | 'right' | 'middle'; double: boolean }
  | { kind: 'key'; shortcut: string }
  /** Набранный текст целой фразой; hidden — окно похоже на ввод пароля, текст не записан */
  | { kind: 'text'; text: string; hidden: boolean }
  | { kind: 'clipboard'; text: string }
  /** focus — окно стало активным, open/close — появилось/закрылось. Заголовок окна события — в title */
  | { kind: 'window'; change: 'focus' | 'open' | 'close'; title: string; app?: string }
  /** Рисунок пользователя поверх экрана; rect — его границы в DIP относительно монитора */
  | { kind: 'drawing'; displayId: string; tool: string; color: string; text?: string; rect: Rect }
)

/** Начало записи экрана: что рисовать поверх и откуда отсчитывать время событий */
export interface ScreenSessionStart {
  displayIds: string[]
  /** Момент начала встречи (Date.now), от него считаются atMs событий */
  meetingStartMs: number
}

export interface MeetingRecord {
  id: string
  title: string
  audioFileName: string
  /** Запись экрана со звуком встречи; пока видео не удалено, лежит отдельно от аудио */
  videoFileName?: string
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
  screenCaptureMode: ScreenCaptureMode
  /** Записывать клики мыши и сочетания клавиш (без набираемого текста) и показывать кольцо на кликах */
  recordInputEvents: boolean
  /** Писать и набираемый текст (в окнах, похожих на ввод пароля, он скрывается) */
  recordTypedText: boolean
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
  /** videoOffsetMs — на сколько видео стартовало позже аудио; null, если экран не писался */
  submitMeeting: (audioData: ArrayBuffer, durationMs: number, videoOffsetMs: number | null) => Promise<MeetingRecord>
  getMeetings: () => Promise<MeetingRecord[]>
  deleteMeeting: (id: string) => Promise<void>
  getScreenDisplays: () => Promise<ScreenDisplay[]>
  /** Какой монитор отдаст следующий getDisplayMedia */
  selectCaptureSource: (displayId: string) => Promise<void>
  /** Показывает рамку выбора области; null, если пользователь отменил */
  selectScreenRegion: () => Promise<ScreenRegion | null>
  /** Видео приходит кусками во время записи, чтобы не держать часовой файл в памяти */
  beginVideoUpload: () => Promise<void>
  sendVideoChunk: (chunk: ArrayBuffer) => void
  /** Включает рисование поверх экрана и запись кликов и клавиш на время записи видео */
  startScreenSession: (start: ScreenSessionStart) => Promise<void>
  /** Останавливает сессию; записанные события уйдут в карточку встречи вместе с видео */
  endScreenSession: () => Promise<void>
  getMeetingEvents: (id: string) => Promise<ScreenEvent[]>
  deleteMeetingVideo: (id: string) => Promise<MeetingRecord | null>
  revealMeetingVideo: (id: string) => Promise<void>
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
