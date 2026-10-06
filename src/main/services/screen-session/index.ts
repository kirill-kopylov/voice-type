import type { AppSettings, ScreenEvent, ScreenSessionStart } from '../../../shared/types'
import { createDrawingOverlay, type DrawingOverlay } from './drawing-overlay'
import { EventRecorder } from './event-recorder'

// Всё, что приложение делает с экраном, пока идёт запись видео: рисование поверх, кольца на кликах, журнал событий.
let overlay: DrawingOverlay | null = null
let recorder: EventRecorder | null = null
// События закончившейся сессии ждут, пока встреча сохранится и заберёт их
let finishedEvents: ScreenEvent[] = []

export async function startScreenSession(start: ScreenSessionStart, settings: AppSettings): Promise<void> {
  await endScreenSession()
  finishedEvents = []

  overlay = createDrawingOverlay({
    displayIds: start.displayIds,
    onShapeDrawn: ({ displayId, tool, color, rect, text }) => recorder?.addDrawing(displayId, tool, color, rect, text)
  })

  if (!settings.recordInputEvents) return
  recorder = new EventRecorder()
  await recorder.start({
    meetingStartMs: start.meetingStartMs,
    recordTypedText: settings.recordTypedText,
    shouldRecord: () => !overlay?.isDrawing(),
    onClick: ({ displayId, x, y }) => overlay?.showClickRing(displayId, x, y)
  })
}

export async function endScreenSession(): Promise<void> {
  overlay?.destroy()
  overlay = null
  if (recorder) finishedEvents = await recorder.stop()
  recorder = null
}

/** События последней сессии, один раз: их забирает встреча, которая только что сохранилась. */
export function takeRecordedEvents(): ScreenEvent[] {
  const events = finishedEvents
  finishedEvents = []
  return events
}
