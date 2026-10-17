import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // local-stt подключён по file: — его исходники вне node_modules, поэтому вшиваются в бандл
    plugins: [externalizeDepsPlugin({ exclude: ['local-stt'] })],
    // Без этого ссылка node_modules/local-stt раскрывается в ../local-stt, и rollup
    // не переводит его CommonJS в ESM — именованные импорты не находятся
    resolve: { preserveSymlinks: true },
    build: {
      rollupOptions: {
        // Локальное распознавание работает в отдельном процессе (utilityProcess)
        input: {
          index: resolve('src/main/index.ts'),
          'local-transcriber': resolve('src/main/services/local-transcriber/process.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
