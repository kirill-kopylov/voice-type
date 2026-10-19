/** Имена и содержимое файлов, которые телефон присылает через «Поделиться → На компьютер». */

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g
const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
const MAX_NAME_LENGTH = 120
const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi
/** Ссылку часто присылают с заголовком страницы рядом — длинный текст вокруг уже заметка, а не ссылка */
const MAX_LINK_CAPTION = 200
const TITLE_FROM_TEXT_LENGTH = 40

export interface TextDrop {
  name: string
  content: string
  /** Что положить в буфер обмена: ссылку — без подписи, чтобы сразу вставить в браузер */
  clipboard: string
}

/** Метка времени для имён: двоеточия Windows в именах не пускает. */
export function fileStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

/** Имя от телефона — чужие данные: без путей, запрещённых Windows символов и зарезервированных имён. */
export function safeFileName(raw: string, fallback: string): string {
  const cleaned = raw.replace(INVALID_CHARS, '_').trim().replace(/[. ]+$/, '')
  const name = cleaned.replace(/^\.+/, '') || fallback
  const unreserved = RESERVED_NAME.test(name) ? `_${name}` : name
  if (unreserved.length <= MAX_NAME_LENGTH) return unreserved
  const dot = unreserved.lastIndexOf('.')
  const extension = dot > 0 && unreserved.length - dot <= 10 ? unreserved.slice(dot) : ''
  return unreserved.slice(0, MAX_NAME_LENGTH - extension.length).trimEnd() + extension
}

/** «фото.jpg», 2 → «фото (2).jpg»: так Windows называет копии. */
export function numberedName(name: string, copy: number): string {
  if (copy < 2) return name
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(0, dot)} (${copy})${name.slice(dot)}` : `${name} (${copy})`
}

/** Начало текста до границы слова — имя заметки, если телефон не прислал заголовок. */
function titleOf(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim())?.trim() ?? ''
  if (firstLine.length <= TITLE_FROM_TEXT_LENGTH) return firstLine
  const cut = firstLine.slice(0, TITLE_FROM_TEXT_LENGTH)
  const space = cut.lastIndexOf(' ')
  return (space > TITLE_FROM_TEXT_LENGTH / 2 ? cut.slice(0, space) : cut) + '…'
}

/**
 * Одна ссылка (с подписью или без) — ярлык .url: двойной клик открывает браузер. Остальное — заметка .txt.
 * [title] — тема из «Поделиться»: браузеры кладут туда заголовок страницы.
 */
export function textDrop(text: string, title: string, receivedAt: Date): TextDrop {
  const body = text.trim()
  const urls = body.match(URL_PATTERN) ?? []
  const caption = urls.length === 1 ? body.replace(urls[0], '').trim() : ''
  const fallback = `Текст ${fileStamp(receivedAt)}`

  if (urls.length === 1 && caption.length <= MAX_LINK_CAPTION) {
    const url = urls[0]
    const host = url.replace(/^https?:\/\//i, '').split(/[/?#:]/)[0]
    return {
      name: `${safeFileName(title || titleOf(caption) || host, fallback)}.url`,
      content: `[InternetShortcut]\r\nURL=${url}\r\n`,
      clipboard: url
    }
  }
  return {
    name: `${safeFileName(title || titleOf(body), fallback)}.txt`,
    content: body,
    clipboard: body
  }
}
