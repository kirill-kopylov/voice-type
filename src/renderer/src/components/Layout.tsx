import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { Page } from '../App'

interface LayoutProps {
  children: ReactNode
  page: Page
  onPageChange: (page: Page) => void
  isRecording: boolean
  isProcessing: boolean
  hotkey: string
  currentTheme: string
  onThemeChange: (id: string) => void
}

export function Layout({ children, page, onPageChange, isRecording, isProcessing, hotkey, currentTheme, onThemeChange }: LayoutProps): JSX.Element {
  return (
    <div className="h-screen flex flex-col relative">
      <TitleBar isRecording={isRecording} isProcessing={isProcessing} currentTheme={currentTheme} onThemeChange={onThemeChange} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar page={page} onPageChange={onPageChange} hotkey={hotkey} />
        <main className="flex-1 overflow-y-auto p-8 relative">
          <canvas id="blobs-canvas" className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0, filter: 'blur(var(--blob-blur, 80px))' }} />
          <div className="absolute inset-0 pointer-events-none noise-bg" style={{ zIndex: 1 }} />
          <div className="relative" style={{ zIndex: 2 }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
