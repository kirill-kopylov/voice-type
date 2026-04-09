import { useState } from 'react'
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { AppSettings } from '../types'
import { Select } from '../components/Select'

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
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', sub: '$0.15/M tok — быстрая, мультимодальная' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', sub: '$2.50/M tok — лучшее качество' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', sub: '$2.50/M tok — высокая точность' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', sub: '$0.15/M tok — быстрая и дешёвая' },
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

      <Section title="Горячая клавиша">
        <input type="text" value={settings.hotkey} onChange={(e) => onUpdate({ hotkey: e.target.value })} className={inputClass} style={inputStyle} />
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-4)' }}>Ctrl, Alt, Shift, Space, A-Z, F1-F12</p>
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
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-4)' }}>Хоткей фиксации</label>
              <input
                type="text"
                value={settings.stickyHotkey}
                onChange={(e) => onUpdate({ stickyHotkey: e.target.value })}
                className={inputClass}
                style={inputStyle}
                placeholder="CommandOrControl+Shift+L"
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>Нажмите в нужном окне — зафиксирует. Нажмите ещё раз — сбросит.</p>
            </div>
          )}
          <Toggle label="Автозапуск с Windows" checked={settings.autoStart} onChange={() => onUpdate({ autoStart: !settings.autoStart })} />
        </div>
      </Section>
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
