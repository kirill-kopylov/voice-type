import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { createCircleIcon } from './icon'

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
      label: 'Выход',
      click: onQuit
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}

export function setTrayRecording(isRecording: boolean): void {
  if (!tray) return
  tray.setImage(isRecording ? recordingIcon : normalIcon)
  tray.setToolTip(isRecording ? 'VoiceType — идёт запись...' : 'VoiceType — голосовой ввод')
}
