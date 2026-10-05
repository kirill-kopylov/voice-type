import { contextBridge, ipcRenderer } from 'electron'
import type { MeetingNote, MeetingRecord, TranscriptionRecord, VoiceTypeAPI } from '../shared/types'

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
  addMeetingNote: (meetingId, text) => ipcRenderer.invoke('add-meeting-note', meetingId, text),
  updateMeetingNote: (meetingId, noteId, text) => ipcRenderer.invoke('update-meeting-note', meetingId, noteId, text),
  deleteMeetingNote: (meetingId, noteId) => ipcRenderer.invoke('delete-meeting-note', meetingId, noteId),
  getMeetingAudio: (fileName) => ipcRenderer.invoke('get-meeting-audio', fileName),
  generateMeetingSummary: (id) => ipcRenderer.invoke('generate-meeting-summary', id),
  retryMeeting: (id) => ipcRenderer.invoke('retry-meeting', id),

  getVoiceProfiles: () => ipcRenderer.invoke('get-voice-profiles'),
  createVoiceProfileFromMeeting: (meetingId, speaker, name) =>
    ipcRenderer.invoke('create-voice-profile-from-meeting', meetingId, speaker, name),
  deleteVoiceProfile: (id) => ipcRenderer.invoke('delete-voice-profile', id),
  getVoiceProfileAudio: (fileName) => ipcRenderer.invoke('get-voice-profile-audio', fileName),

  onMeetingStateChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, isRecording: boolean): void => {
      callback(isRecording)
    }
    ipcRenderer.on('meeting-state-changed', handler)
    return () => ipcRenderer.removeListener('meeting-state-changed', handler)
  },

  onMeetingUpdated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, record: MeetingRecord): void => {
      callback(record)
    }
    ipcRenderer.on('meeting-updated', handler)
    return () => ipcRenderer.removeListener('meeting-updated', handler)
  },

  onMeetingNotesChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, meetingId: string, notes: MeetingNote[]): void => {
      callback(meetingId, notes)
    }
    ipcRenderer.on('meeting-notes-changed', handler)
    return () => ipcRenderer.removeListener('meeting-notes-changed', handler)
  },

  copyText: (text) => ipcRenderer.invoke('copy-text', text),

  getAudio: (fileName) => ipcRenderer.invoke('get-audio', fileName),

  getSettings: () => ipcRenderer.invoke('get-settings'),

  updateSettings: (partial) => ipcRenderer.invoke('update-settings', partial),

  getMcpStatus: () => ipcRenderer.invoke('get-mcp-status'),

  testConnection: () => ipcRenderer.invoke('test-connection'),

  windowMinimize: () => ipcRenderer.invoke('window-minimize'),

  windowMaximize: () => ipcRenderer.invoke('window-maximize'),

  windowClose: () => ipcRenderer.invoke('window-close'),

  setOverlayTheme: (config) => ipcRenderer.send('set-overlay-theme', config),

  sendMeetingLevels: (levels) => ipcRenderer.send('meeting-levels', levels),

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
