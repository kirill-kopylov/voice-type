import { describe, expect, it } from 'vitest'
import { isSensitiveWindow } from './sensitive-window'

describe('isSensitiveWindow', () => {
  it('узнаёт страницы входа и менеджеры паролей на обоих языках', () => {
    expect(isSensitiveWindow('Вход — Google Аккаунты - Google Chrome')).toBe(true)
    expect(isSensitiveWindow('Sign in to GitHub - Mozilla Firefox')).toBe(true)
    expect(isSensitiveWindow('Введите пароль')).toBe(true)
    expect(isSensitiveWindow('Bitwarden')).toBe(true)
  })

  it('обычные окна не считает чувствительными', () => {
    expect(isSensitiveWindow('Договор.docx - Word')).toBe(false)
    expect(isSensitiveWindow('Telegram')).toBe(false)
    expect(isSensitiveWindow(undefined)).toBe(false)
  })
})
