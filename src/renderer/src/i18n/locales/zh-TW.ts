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
    checking: '正在檢查環境……',
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
    loading: '正在讀取你的伺服器……',
    title: '我的伺服器',
    create: '建立新伺服器',
    empty: '還沒有任何伺服器',
    emptyHint: '按右上角的「建立新伺服器」開始。'
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
    confirmDelete: '確定要刪除「{{name}}」嗎？此動作無法復原。',
    up: '上一層',
    upload: '上傳檔案',
    download: '下載',
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
  settings: {
    general: '一般設定',
    language: '語言',
    launchAtLogin: '開機時自動啟動 CraftLift',
    launchAtLoginHint:
      '建議保持開啟。「試用到期前自動把存檔備份到電腦」這個保護只有在 CraftLift 有在執行時才會生效；關掉的話，你的世界可能會在 90 天到期時真的消失。',
    backupOnShutdown: '關機前自動把存檔備份到電腦',
    backupDir: '本機備份存放位置',
    defaultDir: '（預設：文件\\CraftLift Backups）',
    choose: '選擇資料夾',
    project: '目前使用的專案',
    billing: {
      title: '費用與額度',
      note: 'CraftLift 無法讀取你的剩餘試用額度——Google 沒有提供這項查詢功能。請直接到官方頁面查看真實數字。',
      open: '查看我的剩餘額度'
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
