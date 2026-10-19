import { describe, it, expect } from 'vitest'
import { DropTransfers, type DropStart } from './transfers'

const MB = 1024 * 1024

function file(index: number, overrides: Partial<DropStart> = {}): DropStart {
  return { batch: 'a', index, count: 3, batchBytes: 30 * MB, name: `photo${index}.jpg`, kind: 'file', size: 10 * MB, ...overrides }
}

/** Принять файл целиком. */
function receive(transfers: DropTransfers, start: DropStart, now = 0): string {
  const key = transfers.begin(start, now)
  transfers.progress(key, start.size ?? 0, now + 1000)
  transfers.finish(key, `C:\\Desktop\\С телефона\\${start.name}`, false, now + 1000)
  return key
}

describe('DropTransfers', () => {
  it('идущая пачка: какой файл по счёту, общий прогресс по байтам и очередь', () => {
    const transfers = new DropTransfers()
    receive(transfers, file(1))
    const key = transfers.begin(file(2), 2000)
    transfers.progress(key, 5 * MB, 2500)

    const view = transfers.view()
    expect(view.state).toBe('receiving')
    expect(view.position).toEqual({ current: 2, total: 3 })
    expect(view.progress).toBeCloseTo(0.5)
    expect(view.rows.map((row) => row.state)).toEqual(['receiving', 'done'])
    expect(view.rows[0].progress).toBeCloseTo(0.5)
    expect(view.footnote).not.toBe('')
  })

  it('вся пачка пришла — приём закончен удачно', () => {
    const transfers = new DropTransfers()
    for (const index of [1, 2, 3]) receive(transfers, file(index), index * 2000)

    const view = transfers.view()
    expect(view.state).toBe('done')
    expect(view.position).toBeNull()
    expect(view.progress).toBe(1)
    expect(view.rows).toHaveLength(3)
    expect(view.rows.every((row) => row.state === 'done')).toBe(true)
    expect(view.footnote).toBe('')
    expect(transfers.isReceiving()).toBe(false)
  })

  it('новые файлы — сверху списка', () => {
    const transfers = new DropTransfers()
    receive(transfers, file(1))
    receive(transfers, file(2))
    expect(transfers.view().rows.map((row) => row.name)).toEqual(['photo2.jpg', 'photo1.jpg'])
  })

  it('повтор оборвавшегося файла занимает его строку и не считается ошибкой', () => {
    const transfers = new DropTransfers()
    const start = file(1, { count: 1, batchBytes: 10 * MB })
    const key = transfers.begin(start, 0)
    transfers.progress(key, 3 * MB, 500)
    transfers.fail(key, 'связь оборвалась', 600)
    receive(transfers, start, 1000)

    const view = transfers.view()
    expect(view.state).toBe('done')
    expect(view.rows).toHaveLength(1)
  })

  it('файл не принят — приём закончен с ошибкой, причина видна в строке', () => {
    const transfers = new DropTransfers()
    receive(transfers, file(1))
    receive(transfers, file(2))
    const key = transfers.begin(file(3), 5000)
    transfers.fail(key, 'связь оборвалась', 6000)

    const view = transfers.view()
    expect(view.state).toBe('failed')
    expect(view.progress).toBeCloseTo(2 / 3)
    expect(view.rows[0].state).toBe('failed')
    expect(view.rows[0].note).not.toBe('')
  })

  it('пока телефон досылает пачку, приём не закончен; замолчал — недошедшие считаются потерянными', () => {
    const transfers = new DropTransfers()
    receive(transfers, file(1))
    expect(transfers.view().state).toBe('receiving')
    expect(transfers.isReceiving()).toBe(false)

    transfers.abandon()
    const view = transfers.view()
    expect(view.state).toBe('failed')
    expect(view.rows).toHaveLength(1)
    expect(view.footnote).not.toBe('')
  })

  it('размер пачки неизвестен — прогресс по числу файлов', () => {
    const transfers = new DropTransfers()
    const pair = { count: 2, batchBytes: undefined }
    receive(transfers, file(1, pair))
    const key = transfers.begin(file(2, pair), 2000)
    transfers.progress(key, 5 * MB, 2500)
    expect(transfers.view().progress).toBeCloseTo(0.75)
  })

  it('один файл неизвестного размера — прогресс неизвестен, строка показывает принятое', () => {
    const transfers = new DropTransfers()
    const key = transfers.begin(file(1, { count: 1, batchBytes: undefined, size: undefined }), 0)
    transfers.progress(key, 2 * MB, 500)

    const view = transfers.view()
    expect(view.progress).toBeNull()
    expect(view.position).toBeNull()
    expect(view.rows[0].progress).toBeNull()
  })

  it('второе «Поделиться», пока панель на экране, дописывается в тот же список', () => {
    const transfers = new DropTransfers()
    receive(transfers, file(1, { count: 1, batchBytes: 10 * MB }))
    transfers.begin(file(1, { batch: 'b', count: 2, batchBytes: 20 * MB }), 5000)

    const view = transfers.view()
    expect(view.state).toBe('receiving')
    expect(view.position).toEqual({ current: 2, total: 3 })
    expect(view.rows).toHaveLength(2)
  })

  it('текст и ссылка отмечаются как скопированные', () => {
    const transfers = new DropTransfers()
    const key = transfers.begin({ batch: 't', index: 1, count: 1, name: '', kind: 'text', size: 40 }, 0)
    transfers.progress(key, 40, 10)
    transfers.finish(key, 'C:\\Desktop\\С телефона\\Avito.url', true, 20)

    const [row] = transfers.view().rows
    expect(row.state).toBe('done')
    expect(row.name).toBe('Avito.url')
    expect(transfers.pathOf(key)).toContain('Avito.url')
  })
})
