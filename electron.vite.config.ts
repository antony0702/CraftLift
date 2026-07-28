import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Electron 應用分成三塊，各自獨立編譯：
//   main     — 主行程，有完整 Node.js 權限，負責開視窗、呼叫 gcloud
//   preload  — 橋樑，把 main 的能力「有限度地」暴露給畫面，是安全邊界所在
//   renderer — 畫面，就是一般的 React 網頁，沒有 Node.js 權限
export default defineConfig({
  main: {
    // externalizeDepsPlugin：不要把 node_modules 打包進去，讓 Electron 執行時直接 require。
    // 之後會用到 ssh2 這類含原生程式碼的套件，硬打包會壞掉。
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
