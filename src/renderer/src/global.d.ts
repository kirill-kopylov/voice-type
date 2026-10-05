import type { VoiceTypeAPI } from '@shared/types'

declare global {
  interface Window {
    api: VoiceTypeAPI
  }
}
