# CraftLift

**在 Google Cloud 上架設你自己的 Minecraft 伺服器——不需要懂雲端。**

[English](README.md)

CraftLift 是一個桌面軟體，幫你用 Google 送給每個新帳號的 **$300 美金 / 90 天試用金**，
在 Google Cloud 上開一台屬於自己的 Minecraft 伺服器並持續管理它。

---

## 開始之前，請先看這段

CraftLift **不是**真正的一鍵工具。任何宣稱做得到的專案都在騙你。

Google 規定：建立 Google 帳號、綁定信用卡，這兩件事必須由你本人在瀏覽器裡手動完成，
**任何軟體都無法代勞**。CraftLift 從這裡之後接手，把剩下的全部自動化——建立專案、
啟用 API、開機器、裝 Java 和伺服器、設定防火牆、備份，以及之後的日常管理。

實際體感大概是：**跟著圖文步驟花五分鐘，之後就全自動了。**

### 關於錢

- Google 給新帳號 **$300 額度，有效期 90 天**，兩者哪個先到就結束。
- **Google 絕對不會自動刷你的卡。** 額度用完或試用期結束時，你的試用帳單帳戶會關閉、
  資源停止運作。除非**你自己**手動點選升級為付費帳戶，否則不會被收取任何費用。
- 只要你的帳單帳戶維持在試用狀態，**CraftLift 不可能讓你花到真的錢**。
- 建立伺服器前會顯示費用估算，單價取自 Google Cloud Billing Catalog API 的即時資料。
  請當成估算看待：它只涵蓋機器、固定位址與磁碟，**不含網路流量費用，也不含任何折扣
  或免費額度**。CraftLift 另外會自動幫你設定預算警示讓 Google 直接寄信通知你，並提供
  按鈕打開 Google 官方的額度頁面——**以那邊的數字為準**。
- CraftLift 全程不會接觸你的信用卡資料。付款一律在 Google 自己的網站上、你的瀏覽器裡完成。

> **關於這一節的效力。** 以上有關 Google Cloud 計費方式、試用條件與資源處置的說明
> **僅供參考**，一律以 [Google 官方公告](https://cloud.google.com/free)為準。Google 得隨時
>變更相關政策而不另行通知，本專案不對上述說明的正確性、即時性或完整性作任何擔保，
> 亦不就因此產生的任何費用、資料損失或其他損害負擔任何責任。
> **你的 Google Cloud 帳單與用量，由你自己負責。**

**本軟體不提供任何擔保。你必須自行為你的 Google Cloud 用量與費用負責。**
完整免責條款請見[授權條款](LICENSE)。

---

## 它能做什麼

- 偵測並協助你安裝 Google Cloud CLI
- 透過 Google 官方工具登入——**不會出現「應用程式未經驗證」的警告畫面，也沒有使用人數上限**
- 建立一個專用的 Google Cloud 專案，讓「徹底刪除」能保證不留下任何會扣錢的東西
- 依照「有幾個人要玩」來配機器，而不是叫你去看懂那些機型代號
- 安裝由 `systemd` 託管的原版 Minecraft 伺服器，開機自動啟動、崩潰自動重開
- 即時主控台與日誌畫面，指令透過 RCON 傳送
- 操作邏輯照抄 Windows 檔案總管的檔案管理器——多選、右鍵選單、拖放、重新命名、
  剪下複製貼上——另外內建文字編輯器，可以線上改 `server.properties`、丟資料包，
  或是自己換掉伺服器主程式
- VM 上自動輪替備份，另外在關機前自動把存檔拉回你的電腦
- `server.properties` 圖形化編輯、玩家管理（白名單／管理員／封鎖）
- 設定裡可以登出 Google 帳號，撤銷這台電腦上的憑證並回到首次設定畫面

## 更新

CraftLift 會自己去 [GitHub Releases](https://github.com/antony0702/CraftLift/releases) 查有沒有新版，
啟動十幾秒後查一次，也可以在「設定 → 軟體更新」隨時手動檢查。

查到新版時只會在視窗上方出現一條提示，**不會自己下載，也不會自己安裝**——
要不要下載、什麼時候重開安裝，兩步都由你按。下載的檔案會用 Release 裡的
SHA512 校驗，對不上就中止。

更新只換掉程式本身。以下這些都不在安裝目錄裡，所以不會被動到：

| 東西 | 放在哪 |
| --- | --- |
| 偏好設定 | `%APPDATA%\CraftLift\preferences.json` |
| Google Cloud 登入憑證 | `%APPDATA%\gcloud`（由 Google Cloud CLI 管理） |
| SSH 金鑰 | `~\.ssh\google_compute_engine`（由 Google Cloud CLI 產生） |
| 本機備份 | `文件\CraftLift Backups`（可在設定裡改） |
| 伺服器、世界存檔 | 在你的 Google Cloud 上 |

## 驗證你下載到的安裝檔

安裝檔不是在任何人的電腦上編出來的，而是由 GitHub Actions 從這個 repo 的原始碼建置，
流程寫在 [`.github/workflows/release.yml`](.github/workflows/release.yml)，公開可看。

建置完成時，GitHub 會簽發一張**建置來源證明**，把安裝檔的雜湊值綁定到 repo、
commit、workflow 與那一次 run，並登記進公開的透明性日誌。簽章金鑰由 GitHub 當場產生、
用完即棄，**沒有任何人拿得到它**——包括這個專案的作者。

安裝之前，先用 [GitHub CLI](https://cli.github.com) 驗一下：

```bash
gh attestation verify CraftLift-1.0.0-Setup.exe --repo antony0702/CraftLift
```

通過的話，你就知道手上這個檔案確實是從這裡的原始碼編出來的，而且看得到是哪一個 commit。
接著你可以去讀那份程式碼——**這才是「開源」對使用者真正的意義**。

你也可以核對 Release 頁面上 `SHA256SUMS.txt` 裡的校驗碼：

```powershell
Get-FileHash CraftLift-1.0.0-Setup.exe -Algorithm SHA256
```

不過要知道校驗碼的天花板：它是我們自己算、自己貼上去的，只擋得住「檔案在傳輸途中被改」，
擋不住「發布者本人心懷不軌」。上面那張來源證明才擋得住後者。

> **關於 Windows 的警告畫面。** 目前的安裝檔沒有購買程式碼簽章憑證，所以 Windows
> SmartScreen 會跳出「不明的發行者」。那個警告反映的是「沒有付費憑證」，不是
> 「這個檔案有問題」。要不要信任，請用上面那道驗證來判斷。

## 開發狀態

1.0.0 是第一個公開版本。

已經對真實的 Google Cloud 帳號實測過的部分：首次設定、建立伺服器、開關機、主控台與
指令、`server.properties` 編輯、玩家管理、檔案管理、備份與拉回本機、刪除單一伺服器
（連同磁碟與靜態 IP）。

**還沒有完整跑過的部分**：設定裡的「徹底清除（刪除所有雲端資源）」。那個功能已經實作，
但整條路徑沒有真的執行過一次。

仍然會有粗糙的地方。發現問題或有建議，可以用程式裡的**設定 → 意見回饋**，
或直接在這裡開一個 issue。

## 系統需求

- Windows 10 / 11
- 一個 Google 帳號，以及一張可用來申請 Google Cloud 試用的信用卡
- Google Cloud CLI（CraftLift 會引導你安裝）

## 從原始碼建置

```bash
npm install
npm run dev        # 開發模式執行
npm run build:win  # 打包成 Windows 安裝檔
```

> **關於 `npm audit` 的警告。** 你會看到一批來自 `electron-builder` 相依套件的高風險警告
> （全部源自 `brace-expansion` 的同一個正則表達式效能問題）。這些套件**只會在你自己的
> 電腦上、打包的時候執行**，完全不會被包進使用者拿到的軟體裡。**請不要執行
> `npm audit fix --force`**，它會把 `electron-builder` 降版本並弄壞整個建置流程。

## 授權條款

[GPL-3.0-or-later](LICENSE)。如果你散布修改過的版本，必須以相同授權條款公開你的修改。

本軟體並非 Minecraft 官方產品，未經 Mojang 或 Microsoft 認可，亦與其無關。
