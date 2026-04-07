import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { Moon } from './Moon'
import { Page } from '../App'
import { ThemeTitlebar } from '../themes'

interface LayoutProps {
  children: ReactNode
  page: Page
  onPageChange: (page: Page) => void
  isRecording: boolean
  isProcessing: boolean
  hotkey: string
  currentTheme: string
  onThemeChange: (id: string) => void
  titlebarConfig: ThemeTitlebar
  decor?: 'moon'
}

export function Layout({ children, page, onPageChange, isRecording, isProcessing, hotkey, currentTheme, onThemeChange, titlebarConfig, decor }: LayoutProps): JSX.Element {
  return (
    <div className="h-screen flex flex-col relative">
      <TitleBar isRecording={isRecording} isProcessing={isProcessing} currentTheme={currentTheme} onThemeChange={onThemeChange} titlebarConfig={titlebarConfig} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar page={page} onPageChange={onPageChange} hotkey={hotkey} />
        <main className="flex-1 overflow-y-auto p-8 relative">
          <canvas id="blobs-canvas" className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0, filter: 'blur(var(--blob-blur, 80px))' }} />
          <div className="absolute inset-0 pointer-events-none noise-bg" style={{ zIndex: 1 }} />
          {decor === 'moon' && <div className="absolute pointer-events-none" style={{ zIndex: 2, top: 0, right: 0 }}><Moon /></div>}
          <div className="relative" style={{ zIndex: 3 }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
