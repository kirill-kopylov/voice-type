import { net } from 'electron'
import { DialogSegment, MeetingSummary } from './types'

const SUMMARY_MODEL = 'gpt-4o-mini'

interface RawSummary {
  title: string
  brief: string
  topics: string[]
  decisions: Array<{ text: string; assignee?: string; deadline?: string }>
  guessed_names: Record<string, string | null>
}

/**
 * Анализирует транскрипт встречи. Не знает заранее, о чём была беседа,
 * сам определяет характер: рабочий созвон, болтовня, интервью, обсуждение
 * и т.д. — и подстраивает саммари под этот характер.
 *
 * Возвращает: короткий заголовок, краткое описание, темы, договорённости
 * (если применимо), и гипотезу об именах спикеров на основе диалога.
 */
export async function generateSummary(
  segments: DialogSegment[],
  apiKey: string,
  knownNames: Record<string, string>
): Promise<{ summary?: MeetingSummary; title?: string; error?: string }> {
  if (segments.length === 0) {
    return { error: 'Нет реплик для анализа' }
  }

  const dialogText = segments
    .map((s) => `${knownNames[s.speaker] ?? s.speaker}: ${s.text}`)
    .join('\n')

  const uniqueSpeakers = Array.from(new Set(segments.map((s) => s.speaker)))
  const speakersListJson = uniqueSpeakers.map((s) => `"${s}"`).join(', ')

  const systemPrompt = `Ты анализируешь транскрипт разговора. Заранее ничего не известно о его характере — это может быть рабочий созвон, дружеская болтовня, интервью, обсуждение проекта, спор, обмен новостями или что-то ещё. Определи характер сам и адаптируй стиль саммари.

Возвращай результат строго в JSON:

{
  "title": "короткий заголовок 3-6 слов на языке транскрипта",
  "brief": "1-3 предложения о чём шёл разговор и зачем",
  "topics": ["тема 1", "тема 2", ...],
  "decisions": [
    { "text": "договорённость или решение", "assignee": "ответственный или null", "deadline": "срок или null" }
  ],
  "guessed_names": { ${speakersListJson}: "имя или null" }
}

Правила:
- title: суть встречи в нескольких словах. Не "Встреча от 14 апреля", а "Планирование выставки Пушкина" или "Болтовня про путешествия".
- brief: чётко и по делу. Если разговор бессодержательный — так и пиши.
- topics: 3-7 тем. Если разговор без чёткой структуры — основные сюжеты беседы.
- decisions: только реальные договорённости и action items. Если встреча неформальная и решений не было — пустой массив. Не выдумывай.
- guessed_names: ТОЛЬКО если в диалоге явно прозвучало имя (кто-то представился или к кому-то обратились по полному имени). Не угадывай по контексту, не используй инициалы или одиночные буквы. Возвращай null если не уверен.

Все тексты — на языке транскрипта.`

  const userPrompt = `Транскрипт:\n\n${dialogText}`

  try {
    console.log('[summary] Запрос к', SUMMARY_MODEL)
    const response = await net.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[summary] Ошибка API:', text)
      return { error: `API ошибка ${response.status}: ${text.slice(0, 200)}` }
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
    const content = data.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(content) as RawSummary

    // Фильтруем мусорные имена: одиночные буквы, "null", "unknown", пустые
    const guessedNames: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed.guessed_names ?? {})) {
      if (!v || typeof v !== 'string') continue
      const trimmed = v.trim()
      const lower = trimmed.toLowerCase()
      if (
        trimmed.length < 2 ||                 // одиночные буквы
        lower === 'null' || lower === 'unknown' ||
        /^[a-zа-я]\.?$/i.test(trimmed)        // "А", "К."
      ) continue
      guessedNames[k] = trimmed
    }

    const summary: MeetingSummary = {
      brief: parsed.brief ?? '',
      topics: parsed.topics ?? [],
      decisions: parsed.decisions ?? [],
      guessedNames: Object.keys(guessedNames).length > 0 ? guessedNames : undefined
    }

    const title = parsed.title?.trim() && parsed.title.length <= 80 ? parsed.title.trim() : undefined

    return { summary, title }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[summary] Ошибка:', message)
    return { error: `Ошибка: ${message}` }
  }
}
