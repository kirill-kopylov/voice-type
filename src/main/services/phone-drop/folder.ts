import { app, shell } from 'electron'
import { mkdir } from 'fs/promises'
import path from 'path'

export const PHONE_DROP_FOLDER_NAME = 'С телефона'

/** Куда складывается всё из «Поделиться → На компьютер»: папка на рабочем столе. */
export const phoneDropFolder = (): string => path.join(app.getPath('desktop'), PHONE_DROP_FOLDER_NAME)

/** Папки нет, пока с телефона ничего не приходило, — открыть её всё равно должно получиться. */
export async function openPhoneDropFolder(): Promise<void> {
  const folder = phoneDropFolder()
  await mkdir(folder, { recursive: true })
  await shell.openPath(folder)
}
