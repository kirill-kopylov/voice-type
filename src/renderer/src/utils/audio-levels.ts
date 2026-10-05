import type { MeetingLevels } from '@shared/types'

const FFT_SIZE = 1024
// Речь по RMS — это сотые доли единицы; степень растягивает тихие звуки, чтобы индикатор не «спал»
const GAIN = 7
const CURVE = 0.6

export interface LevelMeter {
  /** Текущая громкость потока, 0..1 */
  read: () => number
}

export function createLevelMeter(context: AudioContext, stream: MediaStream): LevelMeter {
  const analyser = context.createAnalyser()
  analyser.fftSize = FFT_SIZE
  context.createMediaStreamSource(stream).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)

  return {
    read: () => {
      analyser.getFloatTimeDomainData(samples)
      const meanSquare = samples.reduce((sum, value) => sum + value * value, 0) / samples.length
      return Math.min(1, Math.pow(Math.sqrt(meanSquare) * GAIN, CURVE))
    }
  }
}

export const SILENT_LEVELS: MeetingLevels = { mic: 0, system: 0, systemCaptured: true }

// Последние уровни записи встречи. Читаются кадр за кадром индикатором в окне,
// поэтому лежат вне React-состояния: перерисовывать из-за них всё приложение незачем.
let currentLevels: MeetingLevels = SILENT_LEVELS

export const meetingLevels = {
  get: (): MeetingLevels => currentLevels,
  set: (levels: MeetingLevels): void => { currentLevels = levels }
}
