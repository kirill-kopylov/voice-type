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
      {/* Блобы — рендерятся canvas'ом, отскакивают от стен */}
      <canvas id="blobs-canvas" className="absolute inset-0 w-full h-full pointer-events-none" style={{ filter: 'blur(80px)' }} />

      <TitleBar isRecording={isRecording} isProcessing={isProcessing} />
      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar page={page} onPageChange={onPageChange} hotkey={hotkey} />
        <main className="flex-1 overflow-y-auto p-8 noise-bg">
          {children}
        </main>
      </div>
    </div>
  )
}
