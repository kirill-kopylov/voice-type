/** Сообщения между main и процессом локального распознавания. */
export type LocalSttRequest =
  | { type: 'start'; modelsDir: string }
  | { type: 'transcribe'; id: number; samples: Float32Array }

/** error без id — не загрузились модели */
export type LocalSttEvent =
  | { type: 'ready' }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string }
