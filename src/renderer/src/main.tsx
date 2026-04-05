import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './types'
import './index.css'

function generateNoiseTexture(): void {
  const size = 200
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(size, size)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() * 255
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 10 // базовый мелкий шум

    // Редкие белые искорки — крупнее, ярче
    if (Math.random() < 0.008) {
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = 60 + Math.random() * 80
    }
  }

  ctx.putImageData(imageData, 0, 0)
  document.documentElement.style.setProperty('--noise-url', `url(${canvas.toDataURL()})`)
}

generateNoiseTexture()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
