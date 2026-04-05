# VoiceType

Voice-to-text transcription app for Windows. Press a hotkey, speak, get text inserted into any active field.

![VoiceType Dashboard](docs/screenshot.png)

## Features

- **Global hotkey** — start/stop recording from anywhere (`Ctrl+Shift+H` by default)
- **Whisper API** — cloud transcription via OpenAI or OpenRouter
- **Auto-paste** — transcribed text is instantly pasted into the active window
- **Recording waveform** — live audio visualization with mirrored frequency bars
- **Processing animation** — tunnel effect while Whisper works
- **Sound feedback** — distinct beeps for start and stop
- **History** — browse, search, replay audio, re-paste, copy, delete
- **System tray** — runs in background, tray icon changes during recording
- **Auto-start** — optional Windows startup
- **Clipboard control** — option to keep or restore clipboard after paste

## Tech Stack

Electron + React + TypeScript + Tailwind CSS + Vite

## Design

Sunset gradient palette (orange → coral → pink), noise texture with sparkles, animated floating blobs, glass panels. All colors defined as CSS tokens in `:root`.

## Getting Started

```bash
# Install
npm install

# Dev with hot reload
npm run dev

# Build installer
npm run dist
```

Set your API key in Settings after first launch.

## Configuration

Settings are stored in `%APPDATA%/voice-type/store.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `provider` | `openai` | `openai` or `openrouter` |
| `model` | `whisper-1` | Whisper model name |
| `language` | `ru` | Recognition language |
| `hotkey` | `Ctrl+Shift+H` | Global shortcut |
| `autoPaste` | `true` | Auto-insert text |
| `keepInClipboard` | `false` | Keep text in clipboard |
| `autoStart` | `false` | Start with Windows |

## Project Structure

```
src/
  main/           # Electron main process
    services/     # Transcription, paste, storage, tray, icons
  preload/        # IPC bridge
  renderer/       # React app
    src/
      components/ # Layout, TitleBar, Sidebar
      pages/      # Dashboard, History, Settings
      blobs.ts    # Animated background blobs
```

## License

MIT
