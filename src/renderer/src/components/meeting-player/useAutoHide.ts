import { useCallback, useEffect, useRef, useState } from 'react'

const HIDE_DELAY_MS = 2500

/**
 * Панель управления во весь экран: уезжает, когда мышь замерла, и возвращается от движения или клавиши.
 * enabled=false (не во весь экран, пауза, мышь над панелью) — панель видна всегда.
 */
export function useAutoHide(enabled: boolean): { hidden: boolean; wake: () => void } {
  const [idle, setIdle] = useState(false)
  const timerRef = useRef<number>()

  const wake = useCallback(() => {
    setIdle(false)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setIdle(true), HIDE_DELAY_MS)
  }, [])

  useEffect(() => {
    if (enabled) wake()
    return () => window.clearTimeout(timerRef.current)
  }, [enabled, wake])

  return { hidden: enabled && idle, wake }
}
