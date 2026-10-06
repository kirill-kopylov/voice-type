import { clipboard } from 'electron'
import { inputInjector, VK } from './input-injector'

/** Промис завершается, когда клавиша уже нажата. */
export function simulateEnter(): Promise<void> {
  return inputInjector.tap(VK.ENTER)
}

/** Промис завершается, когда Ctrl+V нажат (буфер обмена восстанавливается уже после него). */
export async function pasteText(text: string, keepInClipboard: boolean): Promise<void> {
  const previousClipboard = clipboard.readText()
  clipboard.writeText(text)

  await inputInjector.tap(VK.V, 'ctrl')

  // Вставка читает буфер асинхронно — возвращаем прежнее содержимое с запасом
  if (!keepInClipboard) {
    setTimeout(() => clipboard.writeText(previousClipboard), 300)
  }
}
