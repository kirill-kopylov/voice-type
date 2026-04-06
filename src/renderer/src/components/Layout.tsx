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
}

export function Layout({ children, page, onPageChange, isRecording, isProcessing, hotkey }: LayoutProps): JSX.Element {
  return (
    <div className="h-screen flex flex-col relative overflow-hidden">
      <TitleBar isRecording={isRecording} isProcessing={isProcessing} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar page={page} onPageChange={onPageChange} hotkey={hotkey} />
        <main className="flex-1 overflow-y-auto p-8 relative">
          {/* Блобы — размытые, за шумом */}
          <canvas id="blobs-canvas" className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0, filter: 'blur(40px)' }} />
          {/* Шум поверх блобов */}
          <div className="absolute inset-0 pointer-events-none noise-bg" style={{ zIndex: 1 }} />
          {/* Контент поверх всего */}
          <div className="relative" style={{ zIndex: 2 }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
