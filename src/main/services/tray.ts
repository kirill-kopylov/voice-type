import { Tray, Menu, nativeImage, BrowserWindow, clipboard } from 'electron'
import { createCircleIcon } from './icon'
import { store } from './store'

let tray: Tray | null = null
let normalIcon: Electron.NativeImage
let recordingIcon: Electron.NativeImage

export function createTray(
  mainWindow: BrowserWindow,
  onToggleRecording: () => void,
  onQuit: () => void
): Tray {
  normalIcon = nativeImage.createFromBuffer(createCircleIcon(232, 114, 90))
  recordingIcon = nativeImage.createFromBuffer(createCircleIcon(251, 191, 36))

  tray = new Tray(normalIcon)
  tray.setToolTip('VoiceType — голосовой ввод')

  updateTrayMenu(mainWindow, onToggleRecording, onQuit)

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}

export function updateTrayMenu(
  mainWindow: BrowserWindow,
  onToggleRecording: () => void,
  onQuit: () => void
): void {
  if (!tray) return

  const history = store.getHistory()
  const lastSuccess = history.find((r) => r.status === 'success')
  const lastText = lastSuccess?.text ?? ''
  const truncated = lastText.length > 40 ? lastText.slice(0, 40) + '…' : lastText

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Открыть панель',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    {
      label: 'Запись',
      click: onToggleRecording
    },
    { type: 'separator' },
    {
      label: truncated ? `Копировать: "${truncated}"` : 'Нет записей',
      enabled: !!lastText,
      click: () => {
        clipboard.writeText(lastText)
      }
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: onQuit
    }
  ])

  tray.setContextMenu(contextMenu)
}

export function setTrayRecording(isRecording: boolean): void {
  if (!tray) return
  tray.setImage(isRecording ? recordingIcon : normalIcon)
  tray.setToolTip(isRecording ? 'VoiceType — идёт запись...' : 'VoiceType — голосовой ввод')
}
