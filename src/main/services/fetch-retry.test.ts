import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.mock('electron', () => ({ net: { fetch: fetchMock } }))

import { fetchWithRetry } from './fetch-retry'

const URL = 'https://openrouter.ai/api/v1/chat/completions'
const respond = (status: number): Response => new Response('{}', { status })

/** Запрос с прокруткой пауз между попытками */
async function send(): Promise<Response> {
  const result = fetchWithRetry(URL, { method: 'POST' })
  await vi.runAllTimersAsync()
  return result
}

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  it('повторяет запрос, который не дошёл до сервера', async () => {
    fetchMock.mockRejectedValueOnce(new Error('net::ERR_TIMED_OUT')).mockResolvedValueOnce(respond(200))

    expect((await send()).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('повторяет временный отказ провайдера', async () => {
    fetchMock.mockResolvedValueOnce(respond(429)).mockResolvedValueOnce(respond(200))

    expect((await send()).status).toBe(200)
  })

  it('не повторяет ошибку запроса', async () => {
    fetchMock.mockResolvedValue(respond(400))

    expect((await send()).status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('после исчерпания попыток отдаёт сбой сети вызывающему', async () => {
    fetchMock.mockRejectedValue(new Error('net::ERR_TIMED_OUT'))

    const result = fetchWithRetry(URL, { method: 'POST' })
    const assertion = expect(result).rejects.toThrow()
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
