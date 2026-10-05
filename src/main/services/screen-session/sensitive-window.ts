// Окна, в которых нельзя записывать набираемое и скопированное: ввод пароля и менеджеры паролей. Без electron.
const SENSITIVE_TITLE = /парол|password|passcode|passkey|\bpin\b|sign.?in|log.?in|логин|вход|авторизац|bitwarden|keepass|1password|lastpass|dashlane/i

export const isSensitiveWindow = (title: string | undefined): boolean => title !== undefined && SENSITIVE_TITLE.test(title)
