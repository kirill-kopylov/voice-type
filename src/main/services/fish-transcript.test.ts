import { describe, it, expect } from 'vitest'
import { parseFishTranscript, assignSpeakers, WordTiming, SpeakerTurn } from './fish-transcript'

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

describe('assignSpeakers', () => {
  const turns: SpeakerTurn[] = [
    { speaker: 0, text: '', start: 0, end: 10 },
    { speaker: 1, text: '', start: 12, end: 20 }
  ]

  it('отдаёт отрезок тому, кто звучал в нём дольше', () => {
    const [first, second] = assignSpeakers([
      { text: 'a', start: 8, end: 13 },
      { text: 'b', start: 11, end: 19 }
    ], turns)

    expect(first.speaker).toBe(0)
    expect(second.speaker).toBe(1)
  })

  it('отрезок в паузе достаётся ближайшей реплике', () => {
    const [result] = assignSpeakers([{ text: 'a', start: 10.2, end: 10.8 }], turns)

    expect(result.speaker).toBe(0)
  })

  it('без реплик голос по умолчанию — первый', () => {
    expect(assignSpeakers([{ text: 'a', start: 0, end: 1 }], [])[0].speaker).toBe(0)
  })
})
