/**
 * Возвращает первый сбалансированный JSON-объект из ответа модели.
 * Модели даже в json-режиме добавляют мусор: markdown-обёртку, преамбулу,
 * обрывки после закрывающей скобки — поэтому ищем парную скобку, а не последнюю.
 */
export function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (escaped) { escaped = false; continue }
    if (inString) {
      if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return raw.slice(start, i + 1)
    }
  }
  return null
}
