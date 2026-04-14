import { Tray, Menu, nativeImage, BrowserWindow, clipboard } from 'electron'
import { createCircleIcon } from './icon'
import { store } from './store'

let tray: Tray | null = null
let normalIcon: Electron.NativeImage
let recordingIcon: Electron.NativeImage

export interface TrayCallbacks {
  toggleRecording: () => void
  toggleMeeting: () => void
  quit: () => void
}

export function createTray(mainWindow: BrowserWindow, cb: TrayCallbacks): Tray {
  normalIcon = nativeImage.createFromBuffer(createCircleIcon(232, 114, 90))
  recordingIcon = nativeImage.createFromBuffer(createCircleIcon(251, 191, 36))

  tray = new Tray(normalIcon)
  tray.setToolTip('VoiceType — голосовой ввод')

  updateTrayMenu(mainWindow, cb, { isMeetingRecording: false })

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}

export function updateTrayMenu(
  mainWindow: BrowserWindow,
  cb: TrayCallbacks,
  state: { isMeetingRecording: boolean }
): void {
  if (!tray) return

  const history = store.getHistory()
  const lastSuccess = history.find((r) => r.status === 'success')
  const lastText = lastSuccess?.text ?? ''
  const truncated = lastText.length > 40 ? lastText.slice(0, 40) + '…' : lastText

  const meetings = store.getMeetings()
  const lastMeeting = meetings.find((m) => m.status === 'success')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Открыть панель',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Запись диктовки',
      click: cb.toggleRecording
    },
    {
      label: state.isMeetingRecording ? '⏺ Остановить запись встречи' : 'Записать встречу',
      click: cb.toggleMeeting
    },
    { type: 'separator' },
    {
      label: truncated ? `Копировать последнее: "${truncated}"` : 'Нет записей',
      enabled: !!lastText,
      click: () => clipboard.writeText(lastText)
    },
    {
      label: lastMeeting ? `Копировать последнюю встречу (${lastMeeting.segments.length} реплик)` : 'Нет встреч',
      enabled: !!lastMeeting,
      click: () => {
        if (!lastMeeting) return
        const text = lastMeeting.segments
          .map((s) => `${lastMeeting.speakerNames[s.speaker] ?? s.speaker}: ${s.text}`)
          .join('\n\n')
        clipboard.writeText(text)
      }
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: cb.quit
    }
  ])

  tray.setContextMenu(contextMenu)
}

export function setTrayRecording(isRecording: boolean): void {
  if (!tray) return
  tray.setImage(isRecording ? recordingIcon : normalIcon)
  tray.setToolTip(isRecording ? 'VoiceType — идёт запись...' : 'VoiceType — голосовой ввод')
}
