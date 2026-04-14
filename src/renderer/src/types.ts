export interface DialogSegment {
  speaker: string
  text: string
  start: number
  end: number
}

export interface MeetingDecision {
  text: string
  assignee?: string
  deadline?: string
}

export interface MeetingSummary {
  brief: string
  topics: string[]
  decisions: MeetingDecision[]
  guessedNames?: Record<string, string>
}

export interface MeetingRecord {
  id: string
  title: string
  audioFileName: string
  durationMs: number
  createdAt: string
  segments: DialogSegment[]
  speakerNames: Record<string, string>
  summary?: MeetingSummary
  summaryStatus?: 'pending' | 'done' | 'error'
  summaryError?: string
  status: 'success' | 'error'
  error?: string
}

export interface VoiceProfile {
  id: string
  name: string
  audioFileName: string
  durationMs: number
  segmentCount: number
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
}

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
  getMeetingAudio: (fileName: string) => Promise<ArrayBuffer | null>
  generateMeetingSummary: (id: string) => Promise<MeetingRecord | null>
  getVoiceProfiles: () => Promise<VoiceProfile[]>
  createVoiceProfileFromMeeting: (meetingId: string, speaker: string, name: string) => Promise<{ profile?: VoiceProfile; error?: string }>
  deleteVoiceProfile: (id: string) => Promise<void>
  getVoiceProfileAudio: (fileName: string) => Promise<ArrayBuffer | null>
  onMeetingStateChanged: (callback: (isRecording: boolean) => void) => () => void
  onMeetingUpdated: (callback: (record: MeetingRecord) => void) => () => void
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
