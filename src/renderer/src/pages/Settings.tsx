import { useEffect, useState } from 'react'
import { Eye, EyeOff, CheckCircle, XCircle, Loader2, Copy, RefreshCw } from 'lucide-react'
import type { AppSettings, McpStatus, ScreenCaptureMode } from '@shared/types'
import { Select } from '../components/Select'
import { HotkeyInput } from '../components/HotkeyInput'

interface SettingsProps {
  settings: AppSettings
  onUpdate: (partial: Partial<AppSettings>) => void
  showToast: (message: string, type: 'success' | 'error') => void
}

const OPENAI_MODELS = [
  { id: 'whisper-1', name: 'Whisper v2', sub: '$0.006/мин — надёжная, проверенная' },
  { id: 'gpt-4o-transcribe', name: 'GPT-4o Transcribe', sub: '$0.006/мин — лучшее качество, контекст' },
  { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe', sub: '$0.003/мин — быстрая и дешёвая' },
]

const GROQ_MODELS = [
  { id: 'whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo', sub: 'бесплатно — быстрая, хорошее качество' },
  { id: 'whisper-large-v3', name: 'Whisper Large v3', sub: 'бесплатно — максимальная точность' },
  { id: 'distil-whisper-large-v3-en', name: 'Distil Whisper v3', sub: 'бесплатно — только English, самая быстрая' },
]

const OPENROUTER_MODELS = [
  { id: 'openai/gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe', sub: '$0.003/мин — быстрая и дешёвая' },
  { id: 'openai/gpt-4o-transcribe', name: 'GPT-4o Transcribe', sub: '$0.006/мин — высокая точность' },
  { id: 'mistralai/voxtral-mini-transcribe', name: 'Voxtral Mini Transcribe', sub: '$0.002/мин — самая быстрая, заточена под голосовые' },
  { id: 'qwen/qwen3-asr-flash-2026-02-10', name: 'Qwen3 ASR Flash', sub: '$0.002/мин — устойчива к шуму' },
]

const SCREEN_CAPTURE_MODES: Array<{ id: ScreenCaptureMode; name: string; sub: string }> = [
  { id: 'off', name: 'Не записывать', sub: 'только звук' },
  { id: 'screen', name: 'Весь экран', sub: 'основной монитор' },
  { id: 'all-screens', name: 'Все экраны', sub: 'мониторы рядом, как стоят на столе' },
  { id: 'region', name: 'Область экрана', sub: 'выделяете мышью при старте встречи' },
]

const LANGUAGES = [
  { code: 'ru', label: 'Русский' }, { code: 'en', label: 'English' }, { code: 'uk', label: 'Українська' },
  { code: 'de', label: 'Deutsch' }, { code: 'fr', label: 'Français' }, { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' }, { code: 'ja', label: '日本語' }
]

const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-1)' }
const inputClass = 'w-full px-3.5 py-2.5 glass rounded-xl text-sm focus:outline-none'

export function Settings({ settings, onUpdate, showToast }: SettingsProps): JSX.Element {
  const [showKey1, setShowKey1] = useState(false)
  const [showKey2, setShowKey2] = useState(false)
  const [showKey3, setShowKey3] = useState(false)
  const [showTgToken, setShowTgToken] = useState(false)
  const [allowedIdsDraft, setAllowedIdsDraft] = useState(settings.telegramAllowedUserIds.join(', '))
  const [relayChannelDraft, setRelayChannelDraft] = useState(settings.telegramRelayChannelId ? String(settings.telegramRelayChannelId) : '')
  const [showVkToken, setShowVkToken] = useState(false)
  const [vkIdsDraft, setVkIdsDraft] = useState(settings.vkAllowedUserIds.join(', '))
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const handleTest = async (): Promise<void> => {
    setTesting(true); setTestResult(null)
    const r = await window.api.testConnection()
    setTestResult(r); setTesting(false)
    showToast(r.ok ? 'Подключение ОК' : `Ошибка: ${r.error}`, r.ok ? 'success' : 'error')
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Настройки</h1>

      <Section title="Провайдер">
        <div className="flex gap-3">
          <ChoiceBtn label="OpenAI" active={settings.provider === 'openai'} onClick={() => onUpdate({ provider: 'openai' })} />
          <ChoiceBtn label="OpenRouter" active={settings.provider === 'openrouter'} onClick={() => onUpdate({ provider: 'openrouter' })} />
          <ChoiceBtn label="Groq" active={settings.provider === 'groq'} onClick={() => onUpdate({ provider: 'groq' })} />
        </div>
      </Section>

      <Section title="API ключи">
        <div className="space-y-4">
          <KeyInput label="OpenAI" value={settings.openAiApiKey} show={showKey1} toggle={() => setShowKey1(!showKey1)} onChange={(v) => onUpdate({ openAiApiKey: v })} ph="sk-..." active={settings.provider === 'openai'} />
          <KeyInput label="OpenRouter" value={settings.openRouterApiKey} show={showKey2} toggle={() => setShowKey2(!showKey2)} onChange={(v) => onUpdate({ openRouterApiKey: v })} ph="sk-or-..." active={settings.provider === 'openrouter'} />
          <KeyInput label="Groq" value={settings.groqApiKey} show={showKey3} toggle={() => setShowKey3(!showKey3)} onChange={(v) => onUpdate({ groqApiKey: v })} ph="gsk_..." active={settings.provider === 'groq'} />
        </div>
        <button onClick={handleTest} disabled={testing}
          className="mt-4 flex items-center gap-2 px-4 py-2 text-sm rounded-xl disabled:opacity-50 transition-colors"
          style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent-border)', color: 'var(--text-1)' }}>
          {testing ? <Loader2 size={15} className="animate-spin" /> : testResult?.ok ? <CheckCircle size={15} className="text-green-300" /> : testResult ? <XCircle size={15} className="text-red-300" /> : null}
          {testing ? 'Проверка...' : 'Проверить'}
        </button>
      </Section>

      <Section title="Модель">
        <Select
          value={settings.model}
          options={(settings.provider === 'openai' ? OPENAI_MODELS : settings.provider === 'groq' ? GROQ_MODELS : OPENROUTER_MODELS).map((m) => ({ value: m.id, label: m.name, sub: m.sub }))}
          onChange={(v) => onUpdate({ model: v })}
          placeholder="Выбрать модель"
        />
      </Section>

      <Section title="Язык">
        <Select
          value={settings.language}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          onChange={(v) => onUpdate({ language: v })}
        />
      </Section>

      <Section title="Горячая клавиша записи">
        <HotkeyInput value={settings.hotkey} onChange={(v) => onUpdate({ hotkey: v })} />
      </Section>

      <Section title="Поведение">
        <div className="space-y-4">
          <Toggle label="Автовставка текста" checked={settings.autoPaste} onChange={() => onUpdate({ autoPaste: !settings.autoPaste })} />
          <Toggle label="Оставлять в буфере обмена" checked={settings.keepInClipboard} onChange={() => onUpdate({ keepInClipboard: !settings.keepInClipboard })} />
          <Toggle label="Auto-Enter по ключевому слову" checked={settings.autoEnter} onChange={() => onUpdate({ autoEnter: !settings.autoEnter })} />
          {settings.autoEnter && (
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-4)' }}>Триггеры (через запятую)</label>
              <input
                type="text"
                value={settings.autoEnterTriggers}
                onChange={(e) => onUpdate({ autoEnterTriggers: e.target.value })}
                className={inputClass}
                style={inputStyle}
                placeholder="enter,энтер,отправь,send"
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>Если последнее слово совпадает — текст вставится и нажмётся Enter</p>
            </div>
          )}
          <Toggle label="Фиксация окна — вставка+Enter в привязанное окно" checked={settings.stickyWindow} onChange={() => onUpdate({ stickyWindow: !settings.stickyWindow })} />
          {settings.stickyWindow && (
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-4)' }}>Хоткей фиксации окна</label>
              <HotkeyInput value={settings.stickyHotkey} onChange={(v) => onUpdate({ stickyHotkey: v })} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>Нажмите в нужном окне — зафиксирует. Ещё раз — сбросит.</p>
            </div>
          )}
          <Toggle label="Автозапуск с Windows" checked={settings.autoStart} onChange={() => onUpdate({ autoStart: !settings.autoStart })} />
        </div>
      </Section>

      <Section title="Встречи (диаризация)">
        <div className="space-y-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-4)' }}>Хоткей встречи</label>
            <HotkeyInput value={settings.meetingHotkey} onChange={(v) => onUpdate({ meetingHotkey: v })} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>Старт/стоп записи встречи. Нужен OpenRouter ключ — голоса размечает Fish Audio, текст — MAI-Transcribe 2, имена — Gemini 3.5 Flash.</p>
          </div>
          <Toggle label="Захватывать системный звук (голос коллеги)" checked={settings.captureSystemAudio} onChange={() => onUpdate({ captureSystemAudio: !settings.captureSystemAudio })} />
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-4)' }}>Запись экрана вместе со встречей</label>
            <Select
              value={settings.screenCaptureMode}
              options={SCREEN_CAPTURE_MODES.map((m) => ({ value: m.id, label: m.name, sub: m.sub }))}
              onChange={(v) => onUpdate({ screenCaptureMode: v as ScreenCaptureMode })}
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>
              1080p, 16 кадров/с, видео хранится вместе со встречей, пока вы его не удалите. Кадры из записи агенты получают через MCP.
            </p>
          </div>
          {settings.screenCaptureMode !== 'off' && (
            <>
              <p className="text-[10px]" style={{ color: 'var(--text-4)' }}>
                Во время записи на экране висит панель рисования: выберите инструмент (стрелка, кружок, прямоугольник, свободная рука, маркер, линия, текст) и нарисуйте один рисунок — дальше мышь снова работает как обычно. Esc снимает инструмент. Панель в видео не попадает, нарисованное — попадает.
              </p>
              <Toggle label="Записывать события: клики, окна, сочетания клавиш, скопированное" checked={settings.recordInputEvents} onChange={() => onUpdate({ recordInputEvents: !settings.recordInputEvents })} />
              {settings.recordInputEvents && (
                <Toggle label="Записывать набранный текст" checked={settings.recordTypedText} onChange={() => onUpdate({ recordTypedText: !settings.recordTypedText })} />
              )}
              <p className="text-[10px] -mt-2" style={{ color: 'var(--text-4)' }}>
                События вплетаются в расшифровку для нейроагентов и показываются в карточке встречи. На кликах рисуется кольцо — оно видно на видео. В окнах входа и менеджерах паролей набранное и скопированное не записывается. Всё хранится рядом с видео и удаляется вместе с ним.
              </p>
            </>
          )}
        </div>
      </Section>

      <Section title="Telegram-бот">
        <div className="space-y-4">
          <Toggle
            label="Слежение за ботом"
            checked={settings.telegramEnabled}
            onChange={() => onUpdate({ telegramEnabled: !settings.telegramEnabled })}
          />
          <p className="text-[10px] -mt-2" style={{ color: 'var(--text-4)' }}>
            Бот слушает входящие. Текст вставляется как есть, голосовое — транскрибируется и вставляется. В клавиатуре бота — кнопка «Отправить» (Enter).
          </p>

          <div style={{ opacity: settings.telegramEnabled ? 1 : 0.45 }}>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Bot token</label>
            <TokenInput
              value={settings.telegramBotToken}
              show={showTgToken}
              toggle={() => setShowTgToken(!showTgToken)}
              onChange={(v) => onUpdate({ telegramBotToken: v.trim() })}
            />
          </div>

          <div style={{ opacity: settings.telegramEnabled ? 1 : 0.45 }}>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Разрешённые user ID (через запятую)</label>
            <input
              type="text"
              value={allowedIdsDraft}
              onChange={(e) => setAllowedIdsDraft(e.target.value)}
              onBlur={() => {
                const parsed = allowedIdsDraft
                  .split(/[,\s]+/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((s) => Number(s))
                  .filter((n) => Number.isFinite(n) && n > 0)
                onUpdate({ telegramAllowedUserIds: parsed })
                // Нормализуем поле — выкидываем мусор и пробелы
                setAllowedIdsDraft(parsed.join(', '))
              }}
              className={inputClass}
              style={inputStyle}
              placeholder="236170977, 123456789"
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>
              Узнать свой ID: напиши боту @userinfobot. Бот реагирует только на эти ID — все остальные игнорируются.
            </p>
          </div>

          <div style={{ opacity: settings.telegramEnabled ? 1 : 0.45 }}>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Канал для телефона (ID)</label>
            <input
              type="text"
              value={relayChannelDraft}
              onChange={(e) => setRelayChannelDraft(e.target.value)}
              onBlur={() => {
                const parsed = Number(relayChannelDraft.trim())
                const channelId = Number.isFinite(parsed) ? parsed : 0
                onUpdate({ telegramRelayChannelId: channelId })
                setRelayChannelDraft(channelId ? String(channelId) : '')
              }}
              className={inputClass}
              style={inputStyle}
              placeholder="-1004312492843"
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>
              Приложение VoiceType на телефоне публикует текст диктовки в этот канал. Этот бот и бот телефона должны быть админами канала. Пусто — выключено.
            </p>
          </div>
        </div>
      </Section>

      <Section title="VK-бот (сообщество)">
        <div className="space-y-4">
          <Toggle
            label="Слежение за сообществом"
            checked={settings.vkEnabled}
            onChange={() => onUpdate({ vkEnabled: !settings.vkEnabled })}
          />
          <p className="text-[10px] -mt-2" style={{ color: 'var(--text-4)' }}>
            Напиши в личку своего сообщества: текст вставляется как есть, голосовое — транскрибируется и вставляется. В клавиатуре — кнопка «Отправить» (Enter).
          </p>

          <div style={{ opacity: settings.vkEnabled ? 1 : 0.45 }}>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Ключ доступа сообщества</label>
            <TokenInput
              value={settings.vkCommunityToken}
              show={showVkToken}
              toggle={() => setShowVkToken(!showVkToken)}
              onChange={(v) => onUpdate({ vkCommunityToken: v.trim() })}
              placeholder="vk1.a...."
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>
              Управление сообществом → Работа с API → Ключи доступа. Нужны права «управление» и «сообщения». Long Poll API должен быть включён (событие «Входящее сообщение»).
            </p>
          </div>

          <div style={{ opacity: settings.vkEnabled ? 1 : 0.45 }}>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Разрешённые user ID (через запятую)</label>
            <input
              type="text"
              value={vkIdsDraft}
              onChange={(e) => setVkIdsDraft(e.target.value)}
              onBlur={() => {
                const parsed = vkIdsDraft
                  .split(/[,\s]+/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((s) => Number(s))
                  .filter((n) => Number.isFinite(n) && n > 0)
                onUpdate({ vkAllowedUserIds: parsed })
                // Нормализуем поле — выкидываем мусор и пробелы
                setVkIdsDraft(parsed.join(', '))
              }}
              className={inputClass}
              style={inputStyle}
              placeholder="65676077"
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>
              Числовой ID страницы ВК (vk.com/id...). Бот реагирует только на эти ID — все остальные игнорируются.
            </p>
          </div>
        </div>
      </Section>

      <McpSection settings={settings} onUpdate={onUpdate} showToast={showToast} />
    </div>
  )
}

const MCP_MIN_PORT = 1024
const MCP_MAX_PORT = 65535

function McpSection({ settings, onUpdate, showToast }: SettingsProps): JSX.Element {
  const [status, setStatus] = useState<McpStatus>({ running: false, url: '' })
  const [portDraft, setPortDraft] = useState(String(settings.mcpPort))
  const [showToken, setShowToken] = useState(false)

  // Сервер перезапускается при смене любой из этих настроек — перечитываем его состояние
  useEffect(() => {
    window.api.getMcpStatus().then(setStatus)
  }, [settings.mcpEnabled, settings.mcpPort, settings.mcpToken])

  const commitPort = (): void => {
    const port = Math.trunc(Number(portDraft))
    const valid = Number.isFinite(port) && port >= MCP_MIN_PORT && port <= MCP_MAX_PORT
    if (valid && port !== settings.mcpPort) onUpdate({ mcpPort: port })
    setPortDraft(String(valid ? port : settings.mcpPort))
  }

  const copy = (text: string, what: string): void => {
    window.api.copyText(text)
    showToast(`${what} скопировано`, 'success')
  }

  const url = status.url || `http://127.0.0.1:${settings.mcpPort}/mcp`
  const claudeCommand = (token: string): string =>
    `claude mcp add --transport http voice-type ${url} --header "Authorization: Bearer ${token}"`
  const jsonConfig = (token: string): string => JSON.stringify(
    { mcpServers: { 'voice-type': { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } },
    null, 2
  )
  const masked = '••••••••'

  return (
    <Section title="MCP-сервер для нейроагентов">
      <div className="space-y-4">
        <Toggle label="Включить MCP-сервер" checked={settings.mcpEnabled} onChange={() => onUpdate({ mcpEnabled: !settings.mcpEnabled })} />
        <p className="text-[10px] -mt-2" style={{ color: 'var(--text-4)' }}>
          Агенты (Claude Code, Cursor и др.) ищут по диктовкам и встречам, читают саммари по датам и оставляют заметки к встречам.
          Сервер слушает только этот компьютер и требует токен.
        </p>

        {settings.mcpEnabled && (
          <>
            <div className="flex items-center gap-2 text-xs" style={{ color: status.running ? 'var(--text-2)' : '#fca5a5' }}>
              {status.running ? <CheckCircle size={14} className="text-green-300" /> : <XCircle size={14} className="text-red-300" />}
              {status.running ? `Работает: ${status.url}` : status.error ?? 'Не запущен'}
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Порт</label>
              <input
                type="text"
                value={portDraft}
                onChange={(e) => setPortDraft(e.target.value)}
                onBlur={commitPort}
                className={inputClass}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Токен</label>
              <TokenInput value={settings.mcpToken} show={showToken} toggle={() => setShowToken(!showToken)} onChange={() => undefined} placeholder="" />
              <div className="flex gap-2 mt-2">
                <SmallButton icon={<Copy size={12} />} label="Копировать токен" onClick={() => copy(settings.mcpToken, 'Токен')} />
                <SmallButton icon={<RefreshCw size={12} />} label="Выпустить новый" onClick={() => onUpdate({ mcpToken: '' })} />
              </div>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>После выпуска нового токена подключённых агентов нужно настроить заново.</p>
            </div>

            <ConfigSnippet
              title="Claude Code (одна команда)"
              shown={claudeCommand(showToken ? settings.mcpToken : masked)}
              onCopy={() => copy(claudeCommand(settings.mcpToken), 'Команда')}
            />
            <ConfigSnippet
              title="Другие клиенты (JSON-конфиг)"
              shown={jsonConfig(showToken ? settings.mcpToken : masked)}
              onCopy={() => copy(jsonConfig(settings.mcpToken), 'Конфиг')}
            />
          </>
        )}
      </div>
    </Section>
  )
}

function SmallButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }): JSX.Element {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
      style={{ background: 'var(--accent-bg)', color: 'var(--text-2)' }}>
      {icon} {label}
    </button>
  )
}

function ConfigSnippet({ title, shown, onCopy }: { title: string; shown: string; onCopy: () => void }): JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{title}</span>
        <SmallButton icon={<Copy size={12} />} label="Копировать" onClick={onCopy} />
      </div>
      <pre className="text-[11px] p-3 rounded-xl overflow-x-auto whitespace-pre-wrap break-all select-text font-mono"
        style={{ background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>{shown}</pre>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return <div className="space-y-3"><h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{title}</h2>{children}</div>
}

function ChoiceBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button onClick={onClick} className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all"
      style={{ background: active ? 'var(--accent-bg-hover)' : 'var(--surface)', border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`, color: active ? 'var(--accent)' : 'var(--text-3)' }}>
      {label}
    </button>
  )
}

function KeyInput({ label, value, show, toggle, onChange, ph, active }: { label: string; value: string; show: boolean; toggle: () => void; onChange: (v: string) => void; ph: string; active: boolean }): JSX.Element {
  return (
    <div style={{ opacity: active ? 1 : 0.35 }}>
      <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>{label}{active && <span className="ml-1" style={{ color: 'var(--text-2)' }}>(активный)</span>}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph}
          className={`${inputClass} pr-10 font-mono`} style={inputStyle} />
        <button onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-4)' }}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </div>
    </div>
  )
}

function TokenInput({ value, show, toggle, onChange, placeholder = '123456:ABC...' }: { value: string; show: boolean; toggle: () => void; onChange: (v: string) => void; placeholder?: string }): JSX.Element {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputClass} pr-10 font-mono`}
        style={inputStyle}
      />
      <button onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-4)' }}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }): JSX.Element {
  return (
    <label className="flex items-center gap-3 cursor-pointer" onClick={onChange}>
      <div className="w-10 h-6 rounded-full relative transition-colors" style={{ background: checked ? 'var(--accent-bg-hover)' : 'rgba(255,255,255,0.1)' }}>
        <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform" style={{ background: checked ? 'var(--accent)' : 'rgba(255,255,255,0.6)', transform: checked ? 'translateX(16px)' : 'translateX(0)' }} />
      </div>
      <span className="text-sm" style={{ color: 'var(--text-2)' }}>{label}</span>
    </label>
  )
}
