export interface Theme {
  id: string
  name: string
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
  blobs: { r: number; g: number; b: number }[]
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
    blobs: [
      { r: 255, g: 140, b: 50 },
      { r: 230, g: 90, b: 80 },
      { r: 200, g: 60, b: 140 },
      { r: 250, g: 180, b: 60 },
      { r: 220, g: 50, b: 100 },
    ]
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
    blobs: [
      { r: 30, g: 140, b: 220 },
      { r: 20, g: 180, b: 200 },
      { r: 60, g: 100, b: 240 },
      { r: 40, g: 200, b: 180 },
      { r: 80, g: 120, b: 210 },
    ]
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
    blobs: [
      { r: 16, g: 185, b: 129 },
      { r: 20, g: 220, b: 160 },
      { r: 45, g: 140, b: 200 },
      { r: 80, g: 200, b: 120 },
      { r: 30, g: 160, b: 180 },
    ]
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
    blobs: [
      { r: 120, g: 80, b: 240 },
      { r: 80, g: 60, b: 220 },
      { r: 160, g: 100, b: 255 },
      { r: 60, g: 50, b: 200 },
      { r: 140, g: 120, b: 250 },
    ]
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
    blobs: [
      { r: 0, g: 180, b: 216 },
      { r: 224, g: 64, b: 251 },
      { r: 0, g: 230, b: 118 },
      { r: 255, g: 234, b: 0 },
      { r: 255, g: 23, b: 68 },
    ]
  }
]

export function applyTheme(theme: Theme): void {
  const root = document.documentElement.style
  root.setProperty('--gradient', theme.gradient)
  root.setProperty('--surface', theme.surface)
  root.setProperty('--surface-hover', theme.surfaceHover)
  root.setProperty('--surface-strong', theme.surfaceStrong)
  root.setProperty('--surface-panel', theme.surfacePanel)
  root.setProperty('--border', theme.border)
  root.setProperty('--border-strong', theme.borderStrong)
  root.setProperty('--text-1', theme.text1)
  root.setProperty('--text-2', theme.text2)
  root.setProperty('--text-3', theme.text3)
  root.setProperty('--text-4', theme.text4)
  root.setProperty('--accent', theme.accent)
  root.setProperty('--accent-bg', theme.accentBg)
  root.setProperty('--accent-bg-hover', theme.accentBgHover)
  root.setProperty('--accent-border', theme.accentBorder)
}

export function getThemeById(id: string): Theme {
  return themes.find((t) => t.id === id) ?? themes[0]
}
