export interface ThemeBlobs {
  enabled: boolean
  count: number
  sizeMultiplier: number  // 1 = 50% диагонали
  speed: number           // 1 = обычная
  blur: number            // px
  opacity: number         // 0-1
}

export interface ThemeNoise {
  enabled: boolean
  intensity: number       // alpha 0-255
  sparkles: boolean
  sparkleDensity: number  // 0-1
  sparkleIntensity: number // alpha 0-255
}

export interface ThemeUI {
  radius: number          // карточки, инпуты
  radiusPill: number      // бейджи, теги (9999 = pill)
  radiusPanel: number     // titlebar, sidebar (0 = прямые)
  font: string
  glassBlur: number
  borderWidth: number
  borderStyle: string
  cardShadow: string
}

export interface Theme {
  id: string
  name: string
  // Цвета
  gradient: string
  surface: string
  surfaceHover: string
  surfaceStrong: string
  surfacePanel: string
  border: string
  borderStrong: string
  text1: string
  text2: string
  text3: string
  text4: string
  accent: string
  accentBg: string
  accentBgHover: string
  accentBorder: string
  // Блобы
  blobs: ThemeBlobs & { colors: { r: number; g: number; b: number }[] }
  // Шум
  noise: ThemeNoise
  // UI
  ui: ThemeUI
}

export const themes: Theme[] = [
  {
    id: 'sunset',
    name: 'Sunset',
    gradient: 'linear-gradient(135deg, #f08030, #d4524a, #a83878, #7a3060)',
    surface: 'linear-gradient(135deg, rgb(120, 42, 62), rgb(90, 32, 80))',
    surfaceHover: 'linear-gradient(135deg, rgb(135, 50, 70), rgb(105, 40, 88))',
    surfaceStrong: 'linear-gradient(135deg, rgb(95, 30, 55), rgb(75, 22, 68))',
    surfacePanel: 'linear-gradient(135deg, rgb(105, 35, 58), rgb(80, 28, 72))',
    border: 'rgba(255, 255, 255, 0.15)',
    borderStrong: 'rgba(255, 255, 255, 0.25)',
    text1: '#ffffff',
    text2: 'rgba(255, 255, 255, 0.85)',
    text3: 'rgba(255, 255, 255, 0.6)',
    text4: 'rgba(255, 255, 255, 0.4)',
    accent: '#fbbf24',
    accentBg: 'rgba(251, 191, 36, 0.18)',
    accentBgHover: 'rgba(251, 191, 36, 0.28)',
    accentBorder: 'rgba(251, 191, 36, 0.35)',
    blobs: {
      enabled: true, count: 5, sizeMultiplier: 1, speed: 1, blur: 80, opacity: 1,
      colors: [
        { r: 255, g: 140, b: 50 }, { r: 230, g: 90, b: 80 },
        { r: 200, g: 60, b: 140 }, { r: 250, g: 180, b: 60 }, { r: 220, g: 50, b: 100 }
      ]
    },
    noise: { enabled: true, intensity: 5, sparkles: true, sparkleDensity: 0.005, sparkleIntensity: 50 },
    ui: { radius: 12, radiusPill: 9999, radiusPanel: 0, font: "'Inter', system-ui, sans-serif", glassBlur: 1, borderWidth: 1, borderStyle: 'solid', cardShadow: 'none' }
  },
  {
    id: 'ocean',
    name: 'Ocean',
    gradient: 'linear-gradient(135deg, #0c4a6e, #155e75, #1e3a5f, #172554)',
    surface: 'linear-gradient(135deg, rgb(20, 60, 90), rgb(15, 45, 80))',
    surfaceHover: 'linear-gradient(135deg, rgb(25, 70, 105), rgb(20, 55, 92))',
    surfaceStrong: 'linear-gradient(135deg, rgb(15, 48, 72), rgb(12, 35, 65))',
    surfacePanel: 'linear-gradient(135deg, rgb(18, 52, 78), rgb(14, 40, 70))',
    border: 'rgba(255, 255, 255, 0.12)',
    borderStrong: 'rgba(255, 255, 255, 0.22)',
    text1: '#f0f9ff',
    text2: 'rgba(224, 242, 255, 0.85)',
    text3: 'rgba(186, 220, 245, 0.6)',
    text4: 'rgba(148, 200, 235, 0.4)',
    accent: '#38bdf8',
    accentBg: 'rgba(56, 189, 248, 0.18)',
    accentBgHover: 'rgba(56, 189, 248, 0.28)',
    accentBorder: 'rgba(56, 189, 248, 0.35)',
    blobs: {
      enabled: true, count: 5, sizeMultiplier: 1, speed: 0.7, blur: 100, opacity: 0.8,
      colors: [
        { r: 30, g: 140, b: 220 }, { r: 20, g: 180, b: 200 },
        { r: 60, g: 100, b: 240 }, { r: 40, g: 200, b: 180 }, { r: 80, g: 120, b: 210 }
      ]
    },
    noise: { enabled: true, intensity: 4, sparkles: false, sparkleDensity: 0, sparkleIntensity: 0 },
    ui: { radius: 14, radiusPill: 9999, radiusPanel: 0, font: "'Inter', system-ui, sans-serif", glassBlur: 2, borderWidth: 1, borderStyle: 'solid', cardShadow: 'none' }
  },
  {
    id: 'aurora',
    name: 'Aurora',
    gradient: 'linear-gradient(135deg, #064e3b, #065f46, #1a3a4a, #0f2830)',
    surface: 'linear-gradient(135deg, rgb(15, 62, 50), rgb(12, 48, 55))',
    surfaceHover: 'linear-gradient(135deg, rgb(20, 72, 58), rgb(16, 56, 64))',
    surfaceStrong: 'linear-gradient(135deg, rgb(10, 50, 42), rgb(8, 38, 45))',
    surfacePanel: 'linear-gradient(135deg, rgb(12, 55, 46), rgb(10, 42, 50))',
    border: 'rgba(255, 255, 255, 0.1)',
    borderStrong: 'rgba(255, 255, 255, 0.2)',
    text1: '#ecfdf5',
    text2: 'rgba(209, 250, 229, 0.85)',
    text3: 'rgba(167, 230, 200, 0.6)',
    text4: 'rgba(130, 210, 180, 0.4)',
    accent: '#34d399',
    accentBg: 'rgba(52, 211, 153, 0.18)',
    accentBgHover: 'rgba(52, 211, 153, 0.28)',
    accentBorder: 'rgba(52, 211, 153, 0.35)',
    blobs: {
      enabled: true, count: 5, sizeMultiplier: 1.2, speed: 0.5, blur: 120, opacity: 0.7,
      colors: [
        { r: 16, g: 185, b: 129 }, { r: 20, g: 220, b: 160 },
        { r: 45, g: 140, b: 200 }, { r: 80, g: 200, b: 120 }, { r: 30, g: 160, b: 180 }
      ]
    },
    noise: { enabled: true, intensity: 3, sparkles: true, sparkleDensity: 0.003, sparkleIntensity: 35 },
    ui: { radius: 16, radiusPill: 9999, radiusPanel: 0, font: "'Inter', system-ui, sans-serif", glassBlur: 2, borderWidth: 1, borderStyle: 'solid', cardShadow: 'none' }
  },
  {
    id: 'midnight',
    name: 'Midnight',
    gradient: 'linear-gradient(135deg, #1e1b4b, #312e81, #1e1b4b, #0f0e2a)',
    surface: 'linear-gradient(135deg, rgb(40, 36, 90), rgb(30, 28, 75))',
    surfaceHover: 'linear-gradient(135deg, rgb(50, 44, 105), rgb(38, 35, 88))',
    surfaceStrong: 'linear-gradient(135deg, rgb(30, 28, 72), rgb(22, 20, 60))',
    surfacePanel: 'linear-gradient(135deg, rgb(35, 32, 80), rgb(26, 24, 68))',
    border: 'rgba(255, 255, 255, 0.1)',
    borderStrong: 'rgba(255, 255, 255, 0.2)',
    text1: '#eef2ff',
    text2: 'rgba(224, 231, 255, 0.85)',
    text3: 'rgba(186, 200, 255, 0.6)',
    text4: 'rgba(148, 170, 240, 0.4)',
    accent: '#a78bfa',
    accentBg: 'rgba(167, 139, 250, 0.18)',
    accentBgHover: 'rgba(167, 139, 250, 0.28)',
    accentBorder: 'rgba(167, 139, 250, 0.35)',
    blobs: {
      enabled: true, count: 5, sizeMultiplier: 0.9, speed: 0.8, blur: 90, opacity: 0.9,
      colors: [
        { r: 120, g: 80, b: 240 }, { r: 80, g: 60, b: 220 },
        { r: 160, g: 100, b: 255 }, { r: 60, g: 50, b: 200 }, { r: 140, g: 120, b: 250 }
      ]
    },
    noise: { enabled: true, intensity: 4, sparkles: true, sparkleDensity: 0.006, sparkleIntensity: 45 },
    ui: { radius: 12, radiusPill: 9999, radiusPanel: 0, font: "'Inter', system-ui, sans-serif", glassBlur: 1, borderWidth: 1, borderStyle: 'solid', cardShadow: 'none' }
  },
  {
    id: 'retro90',
    name: '90s Retro',
    gradient: 'linear-gradient(135deg, #00b4d8, #e040fb, #00e676, #ffea00, #ff1744)',
    surface: 'linear-gradient(135deg, rgb(15, 60, 80), rgb(60, 15, 70))',
    surfaceHover: 'linear-gradient(135deg, rgb(20, 75, 95), rgb(75, 20, 85))',
    surfaceStrong: 'linear-gradient(135deg, rgb(10, 48, 65), rgb(48, 10, 55))',
    surfacePanel: 'linear-gradient(135deg, rgb(12, 52, 72), rgb(52, 12, 62))',
    border: 'rgba(0, 230, 118, 0.25)',
    borderStrong: 'rgba(0, 230, 118, 0.4)',
    text1: '#f0fff0',
    text2: 'rgba(220, 255, 220, 0.85)',
    text3: 'rgba(180, 255, 200, 0.6)',
    text4: 'rgba(140, 220, 180, 0.4)',
    accent: '#00e676',
    accentBg: 'rgba(0, 230, 118, 0.2)',
    accentBgHover: 'rgba(0, 230, 118, 0.3)',
    accentBorder: 'rgba(0, 230, 118, 0.38)',
    blobs: {
      enabled: true, count: 5, sizeMultiplier: 0.8, speed: 1.5, blur: 60, opacity: 1,
      colors: [
        { r: 0, g: 180, b: 216 }, { r: 224, g: 64, b: 251 },
        { r: 0, g: 230, b: 118 }, { r: 255, g: 234, b: 0 }, { r: 255, g: 23, b: 68 }
      ]
    },
    noise: { enabled: true, intensity: 8, sparkles: true, sparkleDensity: 0.01, sparkleIntensity: 70 },
    ui: { radius: 8, radiusPill: 9999, radiusPanel: 0, font: "'Inter', system-ui, sans-serif", glassBlur: 0, borderWidth: 1, borderStyle: 'solid', cardShadow: 'none' }
  },
  {
    id: 'macos',
    name: 'macOS',
    gradient: 'linear-gradient(180deg, #e8e4e0, #d4d0cc, #c8c4c0)',
    surface: 'rgba(255, 255, 255, 0.72)',
    surfaceHover: 'rgba(255, 255, 255, 0.82)',
    surfaceStrong: 'rgba(255, 255, 255, 0.6)',
    surfacePanel: 'rgba(245, 243, 241, 0.85)',
    border: 'rgba(0, 0, 0, 0.08)',
    borderStrong: 'rgba(0, 0, 0, 0.15)',
    text1: '#1d1d1f',
    text2: '#3a3a3c',
    text3: '#8e8e93',
    text4: '#aeaeb2',
    accent: '#007aff',
    accentBg: 'rgba(0, 122, 255, 0.12)',
    accentBgHover: 'rgba(0, 122, 255, 0.2)',
    accentBorder: 'rgba(0, 122, 255, 0.3)',
    blobs: {
      enabled: true, count: 3, sizeMultiplier: 1.5, speed: 0.3, blur: 150, opacity: 0.4,
      colors: [
        { r: 200, g: 180, b: 220 }, { r: 180, g: 210, b: 230 }, { r: 220, g: 200, b: 190 }
      ]
    },
    noise: { enabled: false, intensity: 0, sparkles: false, sparkleDensity: 0, sparkleIntensity: 0 },
    ui: { radius: 10, radiusPill: 9999, radiusPanel: 0, font: "-apple-system, 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif", glassBlur: 20, borderWidth: 1, borderStyle: 'solid', cardShadow: '0 1px 3px rgba(0,0,0,0.06)' }
  },
  {
    id: 'win95',
    name: 'Windows 95',
    gradient: 'linear-gradient(180deg, #008080, #006868)',
    surface: '#c0c0c0',
    surfaceHover: '#d0d0d0',
    surfaceStrong: '#b0b0b0',
    surfacePanel: '#c0c0c0',
    border: '#808080',
    borderStrong: '#404040',
    text1: '#000000',
    text2: '#000000',
    text3: '#404040',
    text4: '#808080',
    accent: '#000080',
    accentBg: '#000080',
    accentBgHover: '#0000a0',
    accentBorder: '#000080',
    blobs: {
      enabled: false, count: 0, sizeMultiplier: 0, speed: 0, blur: 0, opacity: 0,
      colors: []
    },
    noise: { enabled: false, intensity: 0, sparkles: false, sparkleDensity: 0, sparkleIntensity: 0 },
    ui: { radius: 0, radiusPill: 0, radiusPanel: 0, font: "'Tahoma', 'MS Sans Serif', sans-serif", glassBlur: 0, borderWidth: 2, borderStyle: 'outset', cardShadow: 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff' }
  }
]

export function applyTheme(theme: Theme): void {
  const r = document.documentElement.style
  r.setProperty('--gradient', theme.gradient)
  r.setProperty('--surface', theme.surface)
  r.setProperty('--surface-hover', theme.surfaceHover)
  r.setProperty('--surface-strong', theme.surfaceStrong)
  r.setProperty('--surface-panel', theme.surfacePanel)
  r.setProperty('--border', theme.border)
  r.setProperty('--border-strong', theme.borderStrong)
  r.setProperty('--text-1', theme.text1)
  r.setProperty('--text-2', theme.text2)
  r.setProperty('--text-3', theme.text3)
  r.setProperty('--text-4', theme.text4)
  r.setProperty('--accent', theme.accent)
  r.setProperty('--accent-bg', theme.accentBg)
  r.setProperty('--accent-bg-hover', theme.accentBgHover)
  r.setProperty('--accent-border', theme.accentBorder)
  // UI
  r.setProperty('--radius', theme.ui.radius + 'px')
  r.setProperty('--radius-pill', theme.ui.radiusPill + 'px')
  r.setProperty('--radius-panel', theme.ui.radiusPanel + 'px')
  r.setProperty('--font', theme.ui.font)
  r.setProperty('--glass-blur', theme.ui.glassBlur + 'px')
  r.setProperty('--border-width', theme.ui.borderWidth + 'px')
  r.setProperty('--border-style', theme.ui.borderStyle)
  r.setProperty('--card-shadow', theme.ui.cardShadow)
  r.setProperty('--blob-blur', theme.blobs.blur + 'px')
}

export function getThemeById(id: string): Theme {
  return themes.find((t) => t.id === id) ?? themes[0]
}
