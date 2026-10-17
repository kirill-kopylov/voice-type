import { net } from 'electron'

const RETRYABLE_STATUSES = [429, 502, 503]
const MAX_ATTEMPTS = 3

type FetchInit = Parameters<typeof net.fetch>[1]
type FetchResponse = Awaited<ReturnType<typeof net.fetch>>

/**
 * net.fetch с повторами. Провайдер временно отвечает 429/502/503, а через VPN первое TLS-соединение иногда виснет
 * до net::ERR_TIMED_OUT (netlog: TCP к туннелю за 1 мс, затем 30 с тишины в TLS; следующий запрос проходит сразу).
 * Оба отказа не тарифицируются: запрос не обработан или не дошёл до сервера.
 */
export async function fetchWithRetry(url: string, init: FetchInit): Promise<FetchResponse> {
  for (let attempt = 1; ; attempt++) {
    const response = await net.fetch(url, init).catch((err: Error) => {
      if (attempt >= MAX_ATTEMPTS) throw err
      console.warn(`[fetch] ${new URL(url).host}, попытка ${attempt}: ${err.message}`)
      return null
    })
    const retryable = !response || RETRYABLE_STATUSES.includes(response.status)
    if (response && (!retryable || attempt >= MAX_ATTEMPTS)) return response
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
  }
}
