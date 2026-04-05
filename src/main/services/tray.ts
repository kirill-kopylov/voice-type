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
  normalIcon = nativeImage.createFromBuffer(createCircleIcon(99, 102, 241))
  recordingIcon = nativeImage.createFromBuffer(createCircleIcon(239, 68, 68))

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
      label: 'Запись (Ctrl+Shift+Space)',
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
