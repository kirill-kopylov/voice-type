import { ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  children: ReactNode
  onClose: () => void
  align?: 'top' | 'center'
  topOffset?: number
}

/**
 * Универсальная модалка:
 * - Портал в body, поверх всего
 * - Светлый блюр-бэкдроп + лёгкий шумовой слой со спарклами
 * - Закрытие на клике вне контента и Esc
 * - Не закрывается, если выделение текста начали внутри (mousedown трекается)
 */
export function Modal({ children, onClose, align = 'top', topOffset = 96 }: ModalProps): JSX.Element {
  const mouseDownTargetRef = useRef<EventTarget | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    // Блюрим контент приложения под модалкой — надёжнее, чем backdrop-filter в Electron
    const root = document.getElementById('root')
    if (root) {
      root.style.filter = 'blur(4px)'
      root.style.transition = 'filter 0.15s ease-out'
    }
    return () => {
      document.removeEventListener('keydown', handler)
      if (root) root.style.filter = ''
    }
  }, [onClose])

  const handleMouseDown = (e: React.MouseEvent): void => {
    mouseDownTargetRef.current = e.target
  }

  const handleMouseUp = (e: React.MouseEvent): void => {
    // Закрываем только если ОБА действия (down и up) произошли на бэкдропе.
    // Это не даст модалке закрываться при выделении текста, начатого внутри.
    if (
      mouseDownTargetRef.current === e.currentTarget &&
      e.target === e.currentTarget
    ) {
      onClose()
    }
    mouseDownTargetRef.current = null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-center"
      style={{
        alignItems: align === 'top' ? 'flex-start' : 'center',
        paddingTop: align === 'top' ? topOffset : 0,
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(-8px)',
        transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* Светлый блюр-бэкдроп */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'rgba(255,255,255,0.18)',
        }}
      />
      {/* Шум со спарклами поверх блюра */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'var(--noise-url)',
          backgroundSize: '200px 200px',
          backgroundRepeat: 'repeat',
          opacity: 0.15,
          mixBlendMode: 'soft-light',
        }}
      />

      {/* Контент */}
      <div onMouseDown={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()} className="relative">
        {children}
      </div>
    </div>,
    document.body
  )
}
