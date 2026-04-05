import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { StoreSchema, DEFAULT_SETTINGS, TranscriptionRecord } from './types'

const STORE_FILE = 'store.json'

class AppStore {
  private filePath: string
  private data: StoreSchema

  constructor() {
    this.filePath = path.join(app.getPath('userData'), STORE_FILE)
    this.data = this.load()
  }

  private load(): StoreSchema {
    const defaults: StoreSchema = {
      settings: { ...DEFAULT_SETTINGS },
      history: []
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<StoreSchema>
      return {
        settings: { ...defaults.settings, ...parsed.settings },
        history: parsed.history ?? []
      }
    } catch {
      return defaults
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }

  getSettings(): StoreSchema['settings'] {
    return { ...this.data.settings }
  }

  updateSettings(partial: Partial<StoreSchema['settings']>): StoreSchema['settings'] {
    this.data.settings = { ...this.data.settings, ...partial }
    this.save()
    return this.getSettings()
  }

  getHistory(): TranscriptionRecord[] {
    return [...this.data.history]
  }

  addHistory(record: TranscriptionRecord): void {
    this.data.history.unshift(record)
    this.save()
  }

  deleteHistory(id: string): void {
    this.data.history = this.data.history.filter((r) => r.id !== id)
    this.save()
  }

  clearHistory(): void {
    this.data.history = []
    this.save()
  }

  getHistoryItem(id: string): TranscriptionRecord | undefined {
    return this.data.history.find((r) => r.id === id)
  }
}

export const store = new AppStore()
