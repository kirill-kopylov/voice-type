/**
 * Фиктивный window.api для запуска в обычном браузере (не Electron)
 * — только для отладки. В Electron сборке этот модуль не загружается.
 */
import type { VoiceTypeAPI } from './types'

export function installDevMock(): void {
  if (window.api) return

  const mockMeeting = {
    id: 'm1',
    title: 'Тест встречи',
    audioFileName: 'test.webm',
    durationMs: 60000,
    createdAt: new Date().toISOString(),
    segments: [
      { speaker: 'Speaker 1', text: 'Привет, как дела?', start: 0, end: 3 },
      { speaker: 'Speaker 1', text: 'Что у нас по задаче? Надо посмотреть.', start: 5, end: 9 },
      { speaker: 'Speaker 2', text: 'Всё хорошо, работаем.', start: 3, end: 5 },
      { speaker: 'Speaker 2', text: 'Закрыл тикет номер 42.', start: 9, end: 12 },
    ],
    speakerNames: {},
    status: 'success' as const
  }

  const mockSettings = {
    provider: 'openai' as const,
    openAiApiKey: 'sk-test', openRouterApiKey: '', groqApiKey: '',
    model: 'whisper-1', language: 'ru',
    hotkey: 'CommandOrControl+Shift+H', autoPaste: true, keepInClipboard: false,
    autoEnter: true, autoEnterTriggers: 'enter',
    stickyWindow: false, stickyHotkey: '',
    meetingHotkey: '', captureSystemAudio: true,
    autoStart: false, theme: 'sunset'
  }

  // Валидный WAV с тишиной на 15 секунд — decodeAudioData разберёт
  const fakeAudio = makeSilentWav(15, 16000)

  const noop = async (): Promise<void> => {}
  const unsub = (): (() => void) => () => {}

  const api: VoiceTypeAPI = {
    getHistory: async () => [],
    getMeetings: async () => [mockMeeting],
    getSettings: async () => mockSettings,
    getVoiceProfiles: async () => [],
    getMeetingAudio: async () => fakeAudio,
    saveVoiceProfile: async (name, _wav, dur, count, sourceId) => ({
      id: 'p-' + Date.now(),
      name, audioFileName: 'x.wav', durationMs: dur, segmentCount: count,
      sourceMeetingId: sourceId, createdAt: new Date().toISOString()
    }),
    deleteVoiceProfile: noop,
    getVoiceProfileAudio: async () => null,
    copyText: noop,
    renameMeetingSpeaker: noop,
    deleteMeeting: noop,
    updateSettings: async (p) => ({ ...mockSettings, ...p } as typeof mockSettings),
    generateMeetingSummary: async () => null,
    submitAudio: async () => mockMeeting as never,
    submitMeeting: async () => mockMeeting,
    onRecordingStateChanged: unsub,
    onTranscriptionComplete: unsub,
    onMeetingStateChanged: unsub,
    onMeetingUpdated: unsub,
    testConnection: async () => ({ ok: true }),
    deleteHistoryItem: noop,
    clearHistory: noop,
    rePaste: noop,
    retryTranscription: async () => null as never,
    getAudio: async () => null,
    windowMinimize: noop,
    windowMaximize: noop,
    windowClose: noop,
    setOverlayTheme: () => {},
  }

  ;(window as unknown as { api: VoiceTypeAPI }).api = api
  console.log('[dev-mock] window.api installed')
}

function makeSilentWav(seconds: number, sampleRate: number): ArrayBuffer {
  const numSamples = seconds * sampleRate
  const byteLength = numSamples * 2
  const buffer = new ArrayBuffer(44 + byteLength)
  const view = new DataView(buffer)

  const writeString = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + byteLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, byteLength, true)
  // PCM уже нулевой (тишина)
  return buffer
}
