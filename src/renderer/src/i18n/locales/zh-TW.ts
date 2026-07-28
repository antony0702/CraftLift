export default {
  app: {
    name: 'CraftLift',
    tagline: '在 Google Cloud 上架設你自己的 Minecraft 伺服器'
  },
  setup: {
    checking: '正在檢查環境……',
    steps: {
      environment: '準備環境',
      account: '登入帳號',
      server: '建立伺服器'
    },
    gcloudMissing: {
      title: '需要先安裝 Google Cloud CLI',
      desc: 'CraftLift 透過 Google 官方的命令列工具來操作你的雲端帳號。這樣做的好處是登入過程不會出現「應用程式未經驗證」的警告畫面，也沒有使用人數限制。',
      how: '請開啟「終端機」或「PowerShell」，貼上以下指令後按 Enter：',
      afterInstall: '安裝完成後請重新啟動 CraftLift，讓它讀取到新安裝的工具。',
      download: '或前往官方下載頁',
      recheck: '我已安裝好，重新檢查'
    },
    gcloudReady: {
      title: '環境準備完成',
      version: '版本 {{version}}'
    },
    login: {
      title: '登入你的 Google 帳號',
      desc: '接下來會開啟瀏覽器，請登入你要用來架設伺服器的 Google 帳號。CraftLift 全程不會接觸到你的密碼或信用卡資料——那些都在 Google 自己的網站上完成。',
      button: '使用 Google 帳號登入',
      waiting: '請在瀏覽器中完成登入……',
      waitingHint: '完成授權後這個畫面會自動繼續。若不小心關掉了瀏覽器，回來再按一次登入即可。'
    },
    loggedIn: {
      title: '已登入',
      next: '下一步：建立伺服器',
      comingSoon: '（建立伺服器的功能還在開發中）'
    }
  },
  common: {
    error: '發生錯誤',
    retry: '重試',
    copied: '已複製'
  }
}
