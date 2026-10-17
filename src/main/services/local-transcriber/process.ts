// Отдельный процесс: распознавание минутной диктовки занимает CPU на секунды, и main в это время
// не должен вставать; падение нативного аддона не роняет приложение
import { SpeechRecognizer } from 'local-stt'
import type { LocalSttEvent, LocalSttRequest } from './protocol'

let recognizer: SpeechRecognizer | null = null
const send = (event: LocalSttEvent): void => process.parentPort.postMessage(event)

process.parentPort.on('message', ({ data }: { data: LocalSttRequest }) => {
  if (data.type === 'start') {
    try {
      recognizer = new SpeechRecognizer(data.modelsDir)
      send({ type: 'ready' })
    } catch (error) {
      send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  try {
    if (!recognizer) throw new Error('модели не загружены')
    send({ type: 'result', id: data.id, text: recognizer.transcribe(data.samples) })
  } catch (error) {
    send({ type: 'error', id: data.id, message: error instanceof Error ? error.message : String(error) })
  }
})
