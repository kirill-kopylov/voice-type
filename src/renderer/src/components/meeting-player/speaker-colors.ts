// Цвета спикеров: различимы между собой и читаются и на светлых, и на тёмных темах
const SPEAKER_PALETTE = ['#3B82F6', '#F59E0B', '#10B981', '#EC4899', '#8B5CF6', '#EF4444', '#14B8A6', '#84CC16']

/** Цвет каждого спикера в порядке первого появления в разговоре. */
export function speakerColors(segments: Array<{ speaker: string }>): Map<string, string> {
  const speakers = [...new Set(segments.map((segment) => segment.speaker))]
  return new Map(speakers.map((speaker, index) => [speaker, SPEAKER_PALETTE[index % SPEAKER_PALETTE.length]]))
}
