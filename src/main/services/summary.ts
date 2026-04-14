import { net } from 'electron'
import { DialogSegment, MeetingSummary } from './types'

const SUMMARY_MODEL = 'gpt-4o-mini'

interface RawSummary {
  brief: string
  topics: string[]
  decisions: Array<{ text: string; assignee?: string; deadline?: string }>
  guessed_names: Record<string, string | null>
}

/**
 * Делает саммари встречи: краткое описание, темы, договорённости,
 * + пытается угадать имена спикеров из контекста (если они называли
 * друг друга по имени или представлялись).
 */
export async function generateSummary(
  segments: DialogSegment[],
  apiKey: string,
  knownNames: Record<string, string>
): Promise<{ summary?: MeetingSummary; error?: string }> {
  if (segments.length === 0) {
    return { error: 'Нет реплик для анализа' }
  }

  // Используем уже переименованных, остальных оставляем как есть
  const dialogText = segments
    .map((s) => `${knownNames[s.speaker] ?? s.speaker}: ${s.text}`)
    .join('\n')

  const uniqueSpeakers = Array.from(new Set(segments.map((s) => s.speaker)))
  const speakersListJson = uniqueSpeakers.map((s) => `"${s}"`).join(', ')

  const systemPrompt = `Ты — помощник, который анализирует транскрипты встреч.
Возвращай результат строго в JSON формате со следующей структурой:

{
  "brief": "2-3 предложения о чём была встреча",
  "topics": ["тема 1", "тема 2", "..."],
  "decisions": [
    { "text": "что решили", "assignee": "кто отвечает или null", "deadline": "когда или null" }
  ],
  "guessed_names": { ${speakersListJson}: "имя или null" }
}

Правила:
- brief: чётко и по делу, без воды
- topics: 3-7 ключевых тем разговора
- decisions: только реальные договорённости и action items, без размышлений и обсуждений
- guessed_names: для каждого спикера определи имя, ЕСЛИ оно явно прозвучало в диалоге (представился, к нему обратились). Если не уверен — ставь null. Не выдумывай.

Все тексты — на языке транскрипта.`

  const userPrompt = `Транскрипт встречи:\n\n${dialogText}`

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

    const guessedNames: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed.guessed_names ?? {})) {
      if (v && typeof v === 'string' && v.toLowerCase() !== 'null' && v.toLowerCase() !== 'unknown') {
        guessedNames[k] = v
      }
    }

    const summary: MeetingSummary = {
      brief: parsed.brief ?? '',
      topics: parsed.topics ?? [],
      decisions: parsed.decisions ?? [],
      guessedNames: Object.keys(guessedNames).length > 0 ? guessedNames : undefined
    }

    return { summary }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[summary] Ошибка:', message)
    return { error: `Ошибка: ${message}` }
  }
}
