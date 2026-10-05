import { describe, it, expect } from 'vitest'
import { parseFishTranscript, WordTiming } from './fish-transcript'

const words = (...items: Array<[string, number, number]>): WordTiming[] =>
  items.map(([word, start, end]) => ({ word, start, end }))

describe('parseFishTranscript', () => {
  it('делит текст на реплики по меткам спикеров и ставит времена по словам', () => {
    const turns = parseFishTranscript(
      '<|speaker:0|> Привет всем. <|speaker:1|> Здравствуйте.',
      words(['Привет', 1, 1.4], ['всем', 1.5, 2], ['Здравствуйте', 3, 3.8])
    )

    expect(turns.map((t) => t.speaker)).toEqual([0, 1])
    expect(turns[0]).toMatchObject({ start: 1, end: 2 })
    expect(turns[1]).toMatchObject({ start: 3, end: 3.8 })
  })

  it('не считает пометки звуков речью', () => {
    const turns = parseFishTranscript(
      '<|speaker:0|> [смех] Да. <|speaker:1|> [тихий шепот] Нет.',
      words(['Да', 5, 5.3], ['Нет', 7, 7.4])
    )

    expect(turns.map((t) => t.text)).toEqual(['Да.', 'Нет.'])
  })

  it('весь текст без меток — один спикер', () => {
    const turns = parseFishTranscript('Просто монолог.', words(['Просто', 0, 0.5], ['монолог', 0.6, 1.2]))

    expect(turns).toHaveLength(1)
    expect(turns[0].speaker).toBe(0)
  })

  it('отдаёт реплики мелкого голоса тому, кто говорил перед ним', () => {
    const longTurn = (speaker: number): string => `<|speaker:${speaker}|> ${'слово '.repeat(60)}`
    const text = `${longTurn(0)}${longTurn(1)}<|speaker:2|> Угу. ${longTurn(0)}`

    const turns = parseFishTranscript(text, [])

    expect(new Set(turns.map((t) => t.speaker))).toEqual(new Set([0, 1]))
    expect(turns[2].speaker).toBe(1)
  })

  it('времена не идут назад, даже если часть слов не нашлась в списке', () => {
    const turns = parseFishTranscript(
      '<|speaker:0|> раз два <|speaker:1|> неизвестное три',
      words(['раз', 1, 1.2], ['два', 1.3, 1.5], ['три', 4, 4.2])
    )

    expect(turns[1].start).toBeGreaterThanOrEqual(turns[0].end)
  })
})
