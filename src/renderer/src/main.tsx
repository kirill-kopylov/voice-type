import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installDevMock } from './dev-mock'
import './types'
import './index.css'

if (!navigator.userAgent.includes('Electron')) {
  installDevMock()
}

// Глобальный fallback — показываем кнопку перезапуска, если React-дерево
// умерло и ErrorBoundary по какой-то причине не сработал.
function showGlobalFallback(message: string): void {
  const existing = document.getElementById('global-fallback')
  if (existing) return
  const div = document.createElement('div')
  div.id = 'global-fallback'
  div.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    padding: 24px; background: rgba(0,0,0,0.6);
    font-family: 'Inter', system-ui, sans-serif;
  `
  div.innerHTML = `
    <div style="max-width:520px; background:#1a1a1a; color:#fff; padding:24px; border-radius:14px; border:1px solid rgba(255,255,255,0.1); box-shadow:0 16px 48px rgba(0,0,0,0.5)">
      <h2 style="font-size:16px; margin-bottom:12px">Упс, что-то сломалось</h2>
      <p style="font-size:13px; color:#ccc; margin-bottom:16px; white-space:pre-wrap; word-break:break-word">${escapeHtml(message)}</p>
      <button id="global-fallback-reload" style="padding:8px 16px; font-size:13px; border-radius:8px; background:#c9a84c; color:#000; border:none; cursor:pointer">Перезапустить</button>
    </div>
  `
  document.body.appendChild(div)
  document.getElementById('global-fallback-reload')?.addEventListener('click', () => window.location.reload())
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

window.addEventListener('error', (e) => {
  console.error('[global error]', e.error ?? e.message)
  showGlobalFallback(e.error?.stack ?? e.message ?? 'Неизвестная ошибка')
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason)
  const msg = e.reason?.stack ?? e.reason?.message ?? String(e.reason)
  // Промис-реджекты не всегда критичны (сетевые ошибки и т.п.),
  // показываем только если страница действительно пуста
  setTimeout(() => {
    if (document.getElementById('root')?.children.length === 0) {
      showGlobalFallback(msg)
    }
  }, 50)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
