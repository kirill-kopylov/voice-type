import { describe, it, expect } from 'vitest'
import { numberedName, safeFileName, textDrop } from './files'

const receivedAt = new Date(2026, 9, 19, 14, 5, 9)

describe('safeFileName', () => {
  it('путь из имени не выводит файл из папки', () => {
    const name = safeFileName('..\\..\\Windows/system32/evil.exe', 'x')
    expect(name).not.toMatch(/[\\/]/)
    expect(name.startsWith('.')).toBe(false)
  })

  it('зарезервированные имена Windows не остаются как есть', () => {
    expect(safeFileName('CON.txt', 'x').toLowerCase()).not.toBe('con.txt')
  })

  it('пустое имя заменяется запасным', () => {
    expect(safeFileName('  ...  ', 'Файл')).toBe('Файл')
  })

  it('длинное имя укорачивается с сохранением расширения', () => {
    const name = safeFileName(`${'а'.repeat(300)}.jpeg`, 'x')
    expect(name.length).toBeLessThanOrEqual(120)
    expect(name.endsWith('.jpeg')).toBe(true)
  })

  it('обычное имя с кириллицей не меняется', () => {
    expect(safeFileName('Договор аренды.pdf', 'x')).toBe('Договор аренды.pdf')
  })
})

describe('numberedName', () => {
  it('копия получает номер перед расширением', () => {
    expect(numberedName('фото.jpg', 1)).toBe('фото.jpg')
    expect(numberedName('фото.jpg', 2)).not.toBe('фото.jpg')
    expect(numberedName('фото.jpg', 2).endsWith('.jpg')).toBe(true)
    expect(numberedName('фото.jpg', 2)).not.toBe(numberedName('фото.jpg', 3))
  })
})

describe('textDrop', () => {
  it('одна ссылка — ярлык, в буфер — сама ссылка', () => {
    const drop = textDrop('https://example.com/page?a=1', 'Заголовок страницы', receivedAt)
    expect(drop.name).toBe('Заголовок страницы.url')
    expect(drop.content).toContain('URL=https://example.com/page?a=1')
    expect(drop.clipboard).toBe('https://example.com/page?a=1')
  })

  it('ссылка с короткой подписью — тоже ярлык, имя из подписи', () => {
    const drop = textDrop('Смотри видео https://youtu.be/abc', '', receivedAt)
    expect(drop.name.endsWith('.url')).toBe(true)
    expect(drop.name).toContain('Смотри видео')
    expect(drop.clipboard).toBe('https://youtu.be/abc')
  })

  it('ссылка без темы и подписи — ярлык по имени сайта', () => {
    expect(textDrop('https://www.avito.ru/item/1', '', receivedAt).name).toBe('www.avito.ru.url')
  })

  it('текст без ссылки — заметка целиком, имя из начала текста', () => {
    const text = 'Купить молоко\nи хлеб'
    const drop = textDrop(text, '', receivedAt)
    expect(drop.name).toBe('Купить молоко.txt')
    expect(drop.content).toBe(text)
    expect(drop.clipboard).toBe(text)
  })

  it('несколько ссылок — заметка, а не ярлык', () => {
    expect(textDrop('https://a.ru и https://b.ru', '', receivedAt).name.endsWith('.txt')).toBe(true)
  })
})
