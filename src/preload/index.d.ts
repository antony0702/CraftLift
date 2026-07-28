import type { CraftLiftApi } from './index'

// 讓畫面端的 TypeScript 知道 window.api 有哪些東西可用
declare global {
  interface Window {
    api: CraftLiftApi
  }
}

export {}
