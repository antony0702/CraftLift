export default {
  app: {
    name: 'CraftLift',
    tagline: '在 Google Cloud 上架設你自己的 Minecraft 伺服器'
  },
  nav: { settings: '設定' },
  common: {
    error: '發生錯誤',
    retry: '重試',
    copied: '已複製',
    copy: '複製',
    cancel: '取消',
    save: '儲存',
    saving: '儲存中…',
    delete: '刪除',
    back: '返回',
    refresh: '重新整理'
  },
  state: {
    PROVISIONING: '準備中',
    STAGING: '啟動中',
    RUNNING: '執行中',
    STOPPING: '關機中',
    TERMINATED: '已關機',
    SUSPENDED: '已暫停',
    UNKNOWN: '狀態不明'
  },
  setup: {
    /* 首次設定每一頁上方的小標，讓使用者知道自己走到哪一步了 */
    steps: {
      environment: '第一步 · 準備環境',
      account: '第二步 · Google 帳號',
      server: '第三步 · 建立專案'
    },
    checking: {
      account: '正在確認你的 Google 帳號……',
      billing: '正在查詢你的帳單帳戶……',
      slow: 'Google 的命令列工具啟動一次需要好幾秒，這是它的正常速度，不是當掉了。'
    },
    gcloudMissing: {
      title: '需要先安裝 Google Cloud CLI',
      desc: 'CraftLift 透過 Google 官方的命令列工具來操作你的雲端帳號。這樣做的好處是登入時不會出現「應用程式未經驗證」的警告畫面，也沒有使用人數限制。',
      how: '請開啟「終端機」或「PowerShell」，貼上以下指令後按 Enter：',
      afterInstall: '安裝完成後請重新啟動 CraftLift，讓它讀取到新安裝的工具。',
      download: '或前往官方下載頁',
      recheck: '我已安裝好，重新檢查'
    },
    login: {
      title: '登入你的 Google 帳號',
      desc: '接下來會開啟瀏覽器，請登入你要用來架設伺服器的 Google 帳號。CraftLift 全程不會接觸到你的密碼或信用卡資料——那些都在 Google 自己的網站上完成。',
      button: '使用 Google 帳號登入',
      waiting: '請在瀏覽器中完成登入……',
      waitingHint: '完成授權後這個畫面會自動繼續。若不小心關掉了瀏覽器，回來再按一次登入即可。'
    },
    noBilling: {
      title: '還沒有可用的帳單帳戶',
      desc: '你的 Google 帳號還沒有開通 Google Cloud。這一步必須由你本人在瀏覽器完成，任何軟體都無法代勞。',
      point1: 'Google 會給新帳號 300 美元額度，有效期 90 天，兩者哪個先到就結束。',
      point2: '開通需要一張信用卡驗證身分。CraftLift 不會、也無法接觸到你的卡號。',
      point3: '額度用完或到期時 Google 不會自動扣款，必須你自己手動升級成付費帳戶才會開始計費。',
      open: '前往 Google Cloud 開通',
      recheck: '我開通好了，重新檢查',
      foundButClosed:
        '偵測到 {{count}} 個帳單帳戶，但全部處於關閉狀態，無法使用。請到 Google Cloud 主控台確認帳戶是否已完成啟用。',
      autoRecheck: '在瀏覽器完成申請後切換回這個視窗，畫面會自動重新檢查。'
    },
    billing: {
      title: '準備你的雲端環境',
      signedInAs: '已登入帳號：',
      select: '選擇要使用的帳單帳戶',
      whatHappens:
        'CraftLift 會建立一個專用的 Google Cloud 專案來放你的伺服器。所有東西都隔離在裡面，日後想全部收掉時，可以一鍵刪除整個專案，保證不留下任何會繼續計費的資源。同時也會自動設定預算警示，讓 Google 在花費接近上限時直接寄信通知你。',
      continue: '建立專案並繼續',
      preparing: '正在準備雲端環境……',
      preparingHint: '正在建立專案、綁定帳單、啟用必要的服務。第一次可能需要一兩分鐘。'
    }
  },
  list: {
    loading: '正在讀取你的世界……',
    title: '你的世界',
    create: '建立新伺服器',
    manage: '進入管理',
    playing: '{{count}} 人在裡面',
    empty: '這裡還沒有伺服器。',
    emptyHint: '建立一台，把位址給朋友，就可以一起玩了。',
    copyAddress: '點一下複製位址'
  },
  create: {
    defaultName: '我的伺服器',
    loading: '正在取得 Minecraft 版本清單……',
    creating: '正在建立伺服器',
    creatingHint:
      '正在開機器、設定防火牆、安裝 Java 與 Minecraft。整個過程大約需要三到五分鐘，完成後就可以開始玩了。',
    title: '建立新伺服器',
    name: '伺服器名稱',
    tier: '大概會有多少人一起玩？',
    officialCalculator: '開啟 Google 官方計價機',
    family: '機器系列',
    familyHint:
      'E2 便宜、適合大多數情況；N2／C3 單核效能較好，Minecraft 主要吃單核，人多時會有感。不同區域提供的系列不一樣。',
    predefined: '預設規格',
    custom: '自訂規格',
    customUnsupported: '{{family}} 系列不支援自訂核心與記憶體，請從預設規格中挑選。',
    machineType: '機型',
    sharedCpu: '共用核心',
    cpus: '核心數（vCPU）',
    cpusHint: '超過 1 個時必須是偶數。Minecraft 主要使用單一核心，核心數多不會等比例變快。',
    memory: '記憶體（GB）',
    memoryHint: '必須是 0.25 GB 的倍數。各系列對「每核心可配多少記憶體」有上下限，超出範圍時 Google 會拒絕並回報原因。',
    estimate: {
      title: '費用估算',
      heap: '配給 Minecraft {{heap}}',
      perMonth: '整月不關機',
      perHour: '執行中每小時',
      diskPerMonth: '磁碟每月（關機也算）',
      calculating: '計算中……',
      unavailable: '目前無法取得價格資料。這不影響建立伺服器。',
      incomplete: '部分項目查不到單價，這個估算並不完整。',
      disclaimer:
        '以上為概略估算，僅供比較不同規格時參考。實際費用一律以 Google 的帳單為準，CraftLift 不對估算的準確性負責。估算不含網路流量費用，也不含任何折扣或免費額度。'
    },
    version: 'Minecraft 版本',
    showAdvanced: '顯示進階設定',
    hideAdvanced: '收起進階設定',
    zone: '機房位置',
    zoneHint: '選離玩家越近的機房，遊戲延遲越低。台灣玩家建議選彰化。',
    disk: '磁碟空間（GB）',
    floatingIp: '使用浮動 IP（不建議）',
    floatingIpHint:
      '浮動 IP 不需額外費用，但伺服器每次重新開機後位址都會改變，你必須重新把新位址告訴所有朋友。預設的固定位址會從你的額度中扣除少量費用。',
    disclaimer:
      '我了解建立伺服器會消耗我的 Google Cloud 額度；若額度已用完或我的帳戶為付費狀態，將產生實際費用。CraftLift 不對任何費用負責。',
    disclaimerNote:
      '只要你的帳單帳戶維持在試用狀態，Google 就不會扣款——額度用完時資源會停止，而不是向你收費。',
    submit: '建立伺服器',
    tiers: {
      small: { name: '小型', players: '2–4 人' },
      standard: { name: '標準', players: '5–10 人' },
      large: { name: '大型', players: '10–20 人' }
    },
    zones: {
      'asia-east1': '台灣彰化',
      'asia-northeast1': '日本東京',
      'asia-southeast1': '新加坡',
      'us-central1': '美國中部',
      'europe-west1': '比利時'
    }
  },
  detail: {
    confirmDelete:
      '確定要刪除「{{name}}」嗎？這會一併刪除機器、磁碟與固定位址，世界存檔也會消失。建議先到「備份」分頁把存檔存到電腦。',
    shutdown: '關機',
    boot: '開機',
    delete: '刪除伺服器',
    version: '版本',
    machine: '機器',
    zone: '機房',
    shutdownNote: '按下關機時，CraftLift 會先自動備份並把存檔帶回你的電腦，再把機器關掉。',
    needRunning: '機器目前沒有執行',
    needRunningHint: '請先按右上角的「開機」，這個分頁才能使用。',
    tabs: {
      console: '主控台',
      properties: '伺服器設定',
      players: '玩家管理',
      files: '檔案',
      backups: '備份'
    }
  },
  console: {
    machineOff: '機器目前沒有執行',
    machineOffHint: '按右上角的「開機」啟動它，大約需要一到兩分鐘。',
    running: '伺服器執行中',
    starting: 'Minecraft 啟動中……',
    who: '在裡面的人',
    nobody: '目前沒有人',
    players: '線上 {{count}} / {{max}} 人',
    restart: '重新啟動',
    stopMc: '停止 Minecraft',
    startMc: '啟動 Minecraft',
    noLog: '（還沒有日誌）',
    commandPlaceholder: '輸入指令，例如 time set day',
    send: '送出'
  },
  files: {
    notEditable: '這個檔案不是文字檔，無法用內建編輯器開啟。你可以下載回電腦再處理。',
    root: '伺服器',
    back: '上一頁',
    forward: '下一頁',
    up: '上一層',
    upload: '上傳檔案',
    newFolderName: '新增資料夾',
    revealSaved: '開啟位置',
    folder: '資料夾',
    plainFile: '檔案',
    empty: '這個資料夾是空的。把檔案從電腦拖進來就會上傳。',
    itemCount: '{{count}} 個項目',
    selectedCount: '已選取 {{count}} 個',
    andMore: '……還有 {{count}} 個',
    columns: {
      name: '名稱',
      modified: '修改日期',
      type: '類型',
      size: '大小'
    },
    menu: {
      open: '開啟',
      download: '下載',
      cut: '剪下',
      copy: '複製',
      paste: '貼上',
      rename: '重新命名',
      delete: '刪除',
      details: '內容',
      newFolder: '新增資料夾',
      uploadFile: '上傳檔案……',
      uploadFolder: '上傳資料夾……',
      selectAll: '全選',
      refresh: '重新整理'
    },
    busy: {
      open: '正在開啟……',
      upload: '正在上傳……',
      download: '正在下載……',
      delete: '正在刪除……',
      rename: '正在重新命名……',
      mkdir: '正在建立資料夾……',
      paste: '正在複製……',
      move: '正在搬移……'
    },
    confirmDeleteTitle: '刪除',
    confirmDelete: '確定要刪除這 {{count}} 個項目嗎？',
    noRecycleBin: '伺服器上沒有資源回收筒，刪掉就找不回來了。資料夾會連同裡面的東西一起刪除。',
    conflictTitle: '已經有同名的檔案',
    conflictBody: '這個位置已經有 {{count}} 個同名的項目：',
    conflictReplace: '取代',
    conflictKeep: '兩者都保留',
    conflictSkip: '略過',
    detailsTitle: '內容',
    detailsPath: '位置',
    jarHint:
      '進階用法：你可以上傳自己的伺服器主程式（例如 Paper 或 Fabric 的 jar）並命名為 server.jar 來取代原版。這屬於自行負責的操作，出問題請自行還原。',
    restartHint: '存檔後需要重新啟動 Minecraft 才會生效。'
  },
  props: {
    restartNote: '修改後需要在「主控台」按下「重新啟動」才會生效。',
    saved: '已儲存',
    values: {
      peaceful: '和平',
      easy: '簡單',
      normal: '普通',
      hard: '困難',
      survival: '生存',
      creative: '創造',
      adventure: '冒險',
      spectator: '旁觀'
    },
    fields: {
      motd: { label: '伺服器標語', hint: '玩家在伺服器清單上看到的那行字。' },
      'max-players': { label: '人數上限', hint: '同時最多能有幾個人在線上。' },
      difficulty: { label: '難度', hint: '影響怪物強度與飢餓值消耗。' },
      gamemode: { label: '預設遊戲模式', hint: '新玩家加入時的模式。' },
      pvp: { label: '允許玩家互相攻擊', hint: '關掉就無法打到隊友。' },
      hardcore: { label: '極限模式', hint: '死亡後直接變成旁觀者，無法復活。' },
      'white-list': { label: '啟用白名單', hint: '開啟後只有名單上的人能進來，防止陌生人亂入。' },
      'online-mode': {
        label: '驗證正版帳號',
        hint: '開啟時只有正版 Minecraft 帳號能連線。關閉會有安全風險，也可能被人冒名。'
      },
      'allow-nether': { label: '開放地獄', hint: '關掉的話玩家無法進入地獄。' },
      'allow-flight': { label: '允許飛行', hint: '關掉的話飛行外掛會被踢，但某些模組也會誤判。' },
      'spawn-monsters': { label: '生成怪物', hint: '關掉就不會有殭屍苦力怕等敵對生物。' },
      'view-distance': {
        label: '視野距離',
        hint: '玩家能看多遠。數字越大越吃伺服器效能，人多時建議調低。'
      },
      'simulation-distance': {
        label: '運算距離',
        hint: '多遠範圍內的方塊會持續運作（作物生長、紅石等）。'
      },
      'spawn-protection': {
        label: '出生點保護範圍',
        hint: '出生點附近幾格內非管理員無法破壞方塊，設 0 表示不保護。'
      },
      'level-seed': { label: '世界種子', hint: '留空會隨機產生。只有在世界第一次生成時有效。' }
    }
  },
  players: {
    lockedTitle: '目前沒有人能進入這台伺服器',
    lockedBody:
      '白名單已啟用，但名單是空的——包括你自己在內，沒有任何人連得進來。請在下方「白名單」欄位輸入你的 Minecraft 玩家名稱並加入。若你想讓任何人都能進來（不建議，公開的伺服器很快就會被陌生人掃描到），可以到「伺服器設定」關閉白名單。',
    note: '這裡的變更會透過伺服器指令即時生效，不需要重新啟動。',
    namePlaceholder: 'Minecraft 玩家名稱',
    emptyList: '（目前是空的）',
    whitelist: {
      title: '白名單',
      desc: '在「伺服器設定」開啟白名單後，只有這裡列出的玩家能進入伺服器。',
      add: '加入白名單'
    },
    ops: {
      title: '管理員',
      desc: '管理員可以使用遊戲內的管理指令，例如切換遊戲模式、給予物品。請謹慎給予。',
      add: '設為管理員'
    },
    banned: { title: '封鎖名單', desc: '被封鎖的玩家無法連進伺服器。', add: '封鎖玩家' }
  },
  backups: {
    warningTitle: '這些備份存在雲端機器上，不是保命備份',
    warningBody:
      '如果試用額度用完或 90 天到期，整台機器連同上面的備份都會被 Google 刪除。真正保得住世界的做法是按「存到電腦」把檔案下載回來。CraftLift 在你按下關機時會自動做這件事。',
    keepNote: '自動保留最新的 {{count}} 份，較舊的會自動刪除以節省空間。',
    createNow: '立刻備份',
    working: '處理中…',
    interval: '自動備份間隔（小時）',
    intervalHint: '伺服器會依照這個間隔自動備份。備份前會先請 Minecraft 把資料寫入磁碟。',
    empty: '（還沒有任何備份）',
    saveToPc: '存到電腦'
  },
  update: {
    title: '軟體更新',
    current: '目前版本',
    safeNote:
      '更新只會換掉程式本身。你的設定、電腦上的備份，以及雲端上的伺服器都不會被動到。',
    check: '檢查更新',
    checking: '正在檢查……',
    latest: '已經是最新版本。',
    unsupported: '開發模式不檢查更新。',
    available: '有新版本 {{version}}',
    download: '下載更新',
    downloading: '下載中',
    ready: '{{version}} 已下載完成，重新啟動就會套用',
    install: '重新啟動並安裝',
    later: '稍後'
  },
  settings: {
    general: '一般設定',
    theme: '介面配色',
    themes: { system: '跟隨系統', light: '淺色', dark: '深色' },
    scale: '介面大小',
    scaleAuto: '跟著視窗大小',
    scaleHint: '整體放大縮小介面，包含文字、間距與圖示。選「跟著視窗大小」時，把視窗拉大介面就等比變大。改完立即生效。',
    language: '語言',
    launchAtLogin: '開機時自動啟動 CraftLift',
    launchAtLoginHint:
      '開機時自動在背景啟動，縮在系統匣裡，需要時點一下就能管理伺服器。這不影響雲端上的伺服器——它會一直執行，跟這台電腦有沒有開機無關。',
    backupOnShutdown: '關機前自動把存檔備份到電腦',
    backupDir: '本機備份存放位置',
    defaultDir: '（預設：文件\\CraftLift Backups）',
    choose: '選擇資料夾',
    project: '目前使用的專案',
    feedback: {
      title: '意見回饋',
      desc: '遇到問題或有建議都可以告訴我。附上你在做什麼、預期會發生什麼、實際發生了什麼，最有幫助。',
      open: '寫一則回饋',
      subject: '標題',
      subjectPlaceholder: '一句話說明是什麼問題',
      name: '你的稱呼（選填）',
      nameHint: '留下稱呼方便回覆時稱呼你。不填也沒關係。',
      body: '問題說明',
      bodyPlaceholder: '你在做什麼、預期會發生什麼、實際發生了什麼',
      privateNote:
        '內容只有開發者看得到，不會公開。程式會自動附上版本與作業系統，省得你查。請不要填入密碼或信用卡資料。',
      sending: '送出中',
      sent: '已送出，謝謝',
      failed: '送不出去。可能是網路不通，或表單暫時無法使用。',
      openInBrowser: '改用瀏覽器送出',
      send: '送出回饋'
    },
    billing: {
      title: '費用與額度',
      note: 'CraftLift 無法讀取你的剩餘試用額度——Google 沒有提供這項查詢功能。請直接到官方頁面查看真實數字。',
      open: '查看我的剩餘額度'
    },
    account: {
      title: 'Google 帳號',
      current: '目前登入',
      none: '（未登入）',
      signOut: '登出帳號',
      working: '登出中…',
      note: '登出只會撤銷這台電腦上的登入憑證。你的伺服器、世界存檔與備份都留在 Google Cloud 上，重新登入同一個帳號就會全部回來。',
      confirm:
        '確定要登出嗎？畫面會回到一開始的設定步驟，要重新登入才能繼續管理伺服器。雲端上的東西不會被刪除。'
    },
    danger: {
      title: '徹底清除',
      desc: '刪除 CraftLift 建立的整個 Google Cloud 專案，包含所有伺服器、磁碟、固定位址與防火牆規則。這是唯一能保證日後不會冒出任何費用的做法。世界存檔會一併消失，請先確認你已經把重要的備份存到電腦。',
      button: '刪除所有雲端資源',
      working: '刪除中…',
      confirm1:
        '這會刪除所有伺服器與世界存檔，且無法從 CraftLift 復原。你確定已經把想留下的備份存到電腦了嗎？',
      confirm2: '最後確認：即將刪除整個專案 {{projectId}}。真的要繼續嗎？'
    }
  }
}
