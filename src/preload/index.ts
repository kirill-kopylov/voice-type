import { contextBridge, ipcRenderer } from 'electron'

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
  onMeetingStateChanged: (callback: (isRecording: boolean) => void) => () => void
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

interface TranscriptionRecord {
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

interface DialogSegment {
  speaker: string
  text: string
  start: number
  end: number
}

interface MeetingRecord {
  id: string
  title: string
  audioFileName: string
  durationMs: number
  createdAt: string
  segments: DialogSegment[]
  speakerNames: Record<string, string>
  status: 'success' | 'error'
  error?: string
}

interface AppSettings {
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

const api: VoiceTypeAPI = {
  submitAudio: (audioData, durationMs) =>
    ipcRenderer.invoke('submit-audio', audioData, durationMs),

  getHistory: () => ipcRenderer.invoke('get-history'),

  deleteHistoryItem: (id) => ipcRenderer.invoke('delete-history-item', id),

  clearHistory: () => ipcRenderer.invoke('clear-history'),

  rePaste: (id) => ipcRenderer.invoke('re-paste', id),

  retryTranscription: (id) => ipcRenderer.invoke('retry-transcription', id),

  submitMeeting: (audioData, durationMs) => ipcRenderer.invoke('submit-meeting', audioData, durationMs),
  getMeetings: () => ipcRenderer.invoke('get-meetings'),
  deleteMeeting: (id) => ipcRenderer.invoke('delete-meeting', id),
  renameMeetingSpeaker: (id, oldName, newName) => ipcRenderer.invoke('rename-meeting-speaker', id, oldName, newName),
  getMeetingAudio: (fileName) => ipcRenderer.invoke('get-meeting-audio', fileName),

  onMeetingStateChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, isRecording: boolean): void => {
      callback(isRecording)
    }
    ipcRenderer.on('meeting-state-changed', handler)
    return () => ipcRenderer.removeListener('meeting-state-changed', handler)
  },

  copyText: (text) => ipcRenderer.invoke('copy-text', text),

  getAudio: (fileName) => ipcRenderer.invoke('get-audio', fileName),

  getSettings: () => ipcRenderer.invoke('get-settings'),

  updateSettings: (partial) => ipcRenderer.invoke('update-settings', partial),

  testConnection: () => ipcRenderer.invoke('test-connection'),

  windowMinimize: () => ipcRenderer.invoke('window-minimize'),

  windowMaximize: () => ipcRenderer.invoke('window-maximize'),

  windowClose: () => ipcRenderer.invoke('window-close'),

  setOverlayTheme: (config) => ipcRenderer.send('set-overlay-theme', config),

  onRecordingStateChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, isRecording: boolean): void => {
      callback(isRecording)
    }
    ipcRenderer.on('recording-state-changed', handler)
    return () => ipcRenderer.removeListener('recording-state-changed', handler)
  },

  onTranscriptionComplete: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, record: TranscriptionRecord): void => {
      callback(record)
    }
    ipcRenderer.on('transcription-complete', handler)
    return () => ipcRenderer.removeListener('transcription-complete', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
