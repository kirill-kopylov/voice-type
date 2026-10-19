/** Ход приёма с телефона — то, что показывает панель в углу экрана. Без Electron: проверяется тестами. */

/** Что телефон сообщает о файле в заголовках запроса. */
export interface DropStart {
  /** Одно «Поделиться» на телефоне — одна пачка */
  batch: string
  /** Место в пачке, с 1 */
  index: number
  count: number
  /** Размер всей пачки — если телефон знает размеры всех её файлов */
  batchBytes?: number
  name: string
  kind: 'file' | 'text'
  size?: number
}

export type DropRowState = 'receiving' | 'done' | 'failed'

export interface DropRow {
  key: string
  state: DropRowState
  name: string
  note: string
  /** Доля принятого, null — размер неизвестен */
  progress: number | null
}

export interface DropView {
  state: 'receiving' | 'done' | 'failed'
  title: string
  /** Какой по счёту файл идёт; null — файл один или приём закончен */
  position: { current: number; total: number } | null
  /** Общая доля принятого, null — неизвестна */
  progress: number | null
  /** Сколько принято и с какой скоростью или итог приёма */
  detail: string
  /** Сколько ещё ждать; пусто — не посчитать */
  remaining: string
  /** Новые сверху: идущий файл всегда виден */
  rows: DropRow[]
  /** Сколько ещё ждём или сколько так и не пришло */
  footnote: string
}

interface Transfer {
  start: DropStart
  state: DropRowState
  received: number
  startedAt: number
  finishedAt?: number
  path?: string
  copied: boolean
  error?: string
}

/** Скорость — по последним секундам: средняя за всю пачку не замечает, что Wi-Fi просел */
const SPEED_WINDOW_MS = 3000
const SPEED_MIN_SPAN_MS = 500
const BYTE_UNITS = ['Б', 'КБ', 'МБ', 'ГБ']

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const files = (count: number): string => `${count} ${plural(count, 'файл', 'файла', 'файлов')}`

/** «512 Б», «3,1 МБ», «200 МБ» — как в Проводнике, по 1024. */
export function formatBytes(bytes: number): string {
  const unit = bytes < 1 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = bytes / 1024 ** unit
  const text = unit === 0 || value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '').replace('.', ',')
  return `${text} ${BYTE_UNITS[unit]}`
}

/** «10 из 23 МБ»; единицы разные — «820 КБ из 23 МБ». */
function formatShare(part: number, total: number): string {
  const whole = formatBytes(total)
  const unit = whole.slice(whole.lastIndexOf(' '))
  const piece = formatBytes(part)
  return `${piece.endsWith(unit) ? piece.slice(0, -unit.length) : piece} из ${whole}`
}

/** «27 с», «2 мин 5 с», «1 ч 3 мин». */
export function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} с`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return seconds % 60 ? `${minutes} мин ${seconds % 60} с` : `${minutes} мин`
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path

/**
 * Всё, что пришло с телефона, пока панель на экране: несколько «Поделиться» подряд складываются в один
 * список. Повтор того же файла (телефон после обрыва пробует другой маршрут) занимает его прежнюю строку.
 */
export class DropTransfers {
  private readonly transfers = new Map<string, Transfer>()
  private readonly batches = new Map<string, Pick<DropStart, 'count' | 'batchBytes'>>()
  /** Сколько байт прошло всего, с повторами: по нему считается скорость */
  private moved = 0
  private samples: Array<{ at: number; moved: number }> = []
  private abandoned = false

  begin(start: DropStart, now: number): string {
    const key = `${start.batch}:${start.index}`
    this.batches.set(start.batch, { count: start.count, batchBytes: start.batchBytes })
    this.transfers.set(key, { start, state: 'receiving', received: 0, startedAt: now, copied: false })
    this.abandoned = false
    return key
  }

  progress(key: string, bytes: number, now: number): void {
    const transfer = this.transfers.get(key)
    if (!transfer) return
    transfer.received += bytes
    this.moved += bytes
    this.samples.push({ at: now, moved: this.moved })
    while (this.samples.length > 2 && now - this.samples[0].at > SPEED_WINDOW_MS) this.samples.shift()
  }

  finish(key: string, path: string, copied: boolean, now: number): void {
    const transfer = this.transfers.get(key)
    if (!transfer) return
    Object.assign(transfer, { state: 'done', path, copied, finishedAt: now })
  }

  fail(key: string, error: string, now: number): void {
    const transfer = this.transfers.get(key)
    if (!transfer) return
    Object.assign(transfer, { state: 'failed', error, finishedAt: now })
  }

  /** Телефон замолчал посреди пачки: недошедшие файлы больше не ждём. */
  abandon(): void {
    this.abandoned = true
  }

  isReceiving(): boolean {
    return [...this.transfers.values()].some((transfer) => transfer.state === 'receiving')
  }

  pathOf(key: string): string | undefined {
    return this.transfers.get(key)?.path
  }

  view(): DropView {
    const all = [...this.transfers.values()]
    const done = all.filter((transfer) => transfer.state === 'done')
    const failed = all.filter((transfer) => transfer.state === 'failed')
    const receiving = all.filter((transfer) => transfer.state === 'receiving')
    const expected = Math.max(sum([...this.batches.values()].map((batch) => batch.count)), all.length)
    const notStarted = expected - all.length
    const rows = [...this.transfers].reverse().map(([key, transfer]) => this.rowOf(key, transfer))

    if (receiving.length > 0 || (notStarted > 0 && !this.abandoned)) {
      const totalBytes = this.totalBytes()
      const speed = this.speed()
      return {
        state: 'receiving',
        title: 'Приём с телефона',
        position: expected > 1 ? { current: Math.min(done.length + failed.length + 1, expected), total: expected } : null,
        progress: this.overallProgress(totalBytes, expected, done.length + failed.length, receiving),
        detail: this.receivingDetail(totalBytes, speed),
        remaining: this.remaining(totalBytes, speed),
        rows,
        footnote: notStarted > 0 ? `Ещё ${notStarted} в очереди` : ''
      }
    }

    const lost = failed.length + notStarted
    return {
      state: lost > 0 ? 'failed' : 'done',
      title: lost === 0
        ? expected === 1 ? 'Получено с телефона' : `Получено ${files(expected)}`
        : done.length === 0 ? 'Не получилось принять' : `Получено ${done.length} из ${expected}`,
      position: null,
      // С потерями полоса показывает, какая доля дошла
      progress: done.length / expected,
      detail: this.doneDetail(done),
      remaining: '',
      rows,
      footnote: notStarted > 0 ? `${files(notStarted)} не пришли с телефона` : ''
    }
  }

  private rowOf(key: string, transfer: Transfer): DropRow {
    const { start, state, received } = transfer
    const progress = start.size ? Math.min(received / start.size, 1) : null
    const name = transfer.path ? baseName(transfer.path) : start.name || (start.kind === 'text' ? 'Текст' : 'Файл')
    if (state === 'failed') return { key, state, name, note: transfer.error ?? 'не принято', progress }
    if (state === 'done') {
      const note = start.kind === 'text' ? (transfer.copied ? 'скопировано' : '') : formatBytes(received)
      return { key, state, name, note, progress: 1 }
    }
    return { key, state, name, note: progress === null ? formatBytes(received) : `${Math.floor(progress * 100)} %`, progress }
  }

  /** Сумма размеров пачек — если телефон знает размер каждой. */
  private totalBytes(): number | null {
    const sizes = [...this.batches.values()].flatMap((batch) => (batch.batchBytes === undefined ? [] : [batch.batchBytes]))
    const total = sum(sizes)
    return sizes.length === this.batches.size && total > 0 ? total : null
  }

  private receivedBytes(): number {
    return sum([...this.transfers.values()].filter((transfer) => transfer.state !== 'failed').map((transfer) => transfer.received))
  }

  private overallProgress(totalBytes: number | null, expected: number, finished: number, receiving: Transfer[]): number | null {
    if (totalBytes !== null) return Math.min(this.receivedBytes() / totalBytes, 1)
    const current = sum(receiving.map((transfer) => (transfer.start.size ? Math.min(transfer.received / transfer.start.size, 1) : 0)))
    // Один файл неизвестного размера — честнее бегущая полоска, чем застывший ноль
    if (expected === 1 && current === 0) return null
    return (finished + current) / expected
  }

  /** Байт в секунду за последние секунды; null — замерять пока не по чему. */
  private speed(): number | null {
    const first = this.samples[0]
    const last = this.samples[this.samples.length - 1]
    if (!first || last.at - first.at < SPEED_MIN_SPAN_MS) return null
    return ((last.moved - first.moved) * 1000) / (last.at - first.at)
  }

  private receivingDetail(totalBytes: number | null, speed: number | null): string {
    const received = this.receivedBytes()
    if (received === 0) return 'Начинаю приём…'
    const amount = totalBytes === null ? formatBytes(received) : formatShare(received, totalBytes)
    return speed ? `${amount} · ${formatBytes(speed)}/с` : amount
  }

  private remaining(totalBytes: number | null, speed: number | null): string {
    const left = totalBytes === null ? 0 : totalBytes - this.receivedBytes()
    return speed && left > 0 ? `ещё ~${formatDuration((left / speed) * 1000)}` : ''
  }

  private doneDetail(done: Transfer[]): string {
    const received = done.filter((transfer) => transfer.start.kind === 'file')
    if (received.length === 0) return done.some((transfer) => transfer.copied) ? 'Скопировано в буфер обмена' : ''
    const bytes = sum(received.map((transfer) => transfer.received))
    // Время самих передач: пауза между двумя «Поделиться» к скорости отношения не имеет
    const spent = sum(done.map((transfer) => (transfer.finishedAt ?? transfer.startedAt) - transfer.startedAt))
    return spent >= 1000 ? `${formatBytes(bytes)} за ${formatDuration(spent)}` : formatBytes(bytes)
  }
}
