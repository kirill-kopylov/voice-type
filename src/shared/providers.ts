import type { AppSettings, Provider } from './types'

export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  local: 'Локально'
}

export const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[]

/** Ключ API выбранного провайдера; null — ключ не нужен (локальное распознавание) */
export function providerApiKey(settings: AppSettings): string | null {
  switch (settings.provider) {
    case 'openai': return settings.openAiApiKey
    case 'openrouter': return settings.openRouterApiKey
    case 'groq': return settings.groqApiKey
    case 'local': return null
  }
}
