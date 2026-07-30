import type { ServerFlavor } from '@shared/types'
import { BACKUP_KEEP, REMOTE } from '@shared/constants'

export interface StartupScriptOptions {
  /** Mojang 官方的 server.jar 下載網址 */
  serverJarUrl: string
  /** 這個 Minecraft 版本需要的 Java 主版本，由 Mojang 的版本資訊提供 */
  javaMajorVersion: number
  /** 給 JVM 的堆積記憶體，例如 "6G" */
  jvmHeap: string
  /** 自動備份間隔（小時） */
  backupIntervalHours: number
  /** 主程式種類。vanilla 以外都要另外裝載入器。 */
  flavor: ServerFlavor
  /**
   * 載入器的安裝來源。flavor 是 vanilla 時為 null。
   *   serverJar —— 下載下來就是可以直接跑的 jar（Fabric）
   *   installer —— 下載的是安裝程式，要在機器上跑 --installServer
   */
  loader: { kind: 'serverJar' | 'installer'; url: string } | null
  /**
   * 要一併放進 mods 的 Fabric API。只有 Fabric 需要——Forge 與 NeoForge
   * 的 API 內建在載入器裡。不裝的話使用者上傳的第一個模組多半會因為
   * 缺少依賴而讓伺服器起不來。
   */
  fabricApi: { fileName: string; url: string } | null
}

/**
 * 產生安裝主程式的那一段，以及決定 systemd 要怎麼啟動它。
 *
 * 這段跑完之後 shell 變數 $LAUNCH 會是 java 後面要接的參數。
 *
 * Forge 與 NeoForge 的安裝程式產生什麼檔案、放在哪裡，各版本並不一致
 * （1.17 前後是兩種完全不同的佈局），所以這裡不猜路徑，而是裝完在機器上
 * 現找——找得到 unix_args.txt 就用新版的啟動方式，找不到就退回舊版那個
 * 可以直接執行的 forge-*.jar。在這裡寫死一張對照表，遲早會在某個版本上壞掉。
 */
function buildInstallBlock(opts: StartupScriptOptions): string {
  const dir = REMOTE.serverDir

  if (opts.flavor === 'vanilla' || !opts.loader) {
    return `echo "=== 下載 Minecraft 伺服器 ==="
curl -fsSL -o ${dir}/server.jar "${opts.serverJarUrl}"
LAUNCH="-jar ${dir}/server.jar nogui"`
  }

  // 停用中的模組放 mods/inactive。兩個載入器掃 mods 都不進子資料夾，
  // 所以搬進去就等於關掉。兩個資料夾都要先建好，不然第一次停用會失敗。
  const modDirs = `mkdir -p ${REMOTE.modsDir} ${REMOTE.inactiveModsDir}`

  if (opts.loader.kind === 'serverJar') {
    return `echo "=== 下載 Fabric 伺服器 ==="
# Fabric 的伺服器啟動 jar 會在第一次執行時自己抓齊需要的程式庫，
# 所以這裡跟原版一樣只要下載一個檔案。
curl -fsSL -o ${dir}/server.jar "${opts.loader.url}"
${modDirs}
${
  opts.fabricApi
    ? `
echo "=== 下載 Fabric API ==="
# 絕大多數 Fabric 模組都依賴它，少了它使用者傳上來的第一個模組
# 就會讓伺服器起不來。抓不到不擋安裝——伺服器本身仍然是好的，
# 使用者之後可以自己補上。
curl -fsSL -o ${REMOTE.modsDir}/${opts.fabricApi.fileName} "${opts.fabricApi.url}" || \\
  echo "Fabric API 下載失敗，請自行放進 mods 資料夾" >&2
`
    : ''
}
LAUNCH="-jar ${dir}/server.jar nogui"`
  }

  return `echo "=== 安裝模組載入器 ==="
curl -fsSL -o ${dir}/installer.jar "${opts.loader.url}"
cd ${dir}
java -jar ${dir}/installer.jar --installServer ${dir}
rm -f ${dir}/installer.jar ${dir}/installer.jar.log
mkdir -p ${REMOTE.modsDir} ${REMOTE.inactiveModsDir}

# 裝完了，找出這一版要怎麼啟動
ARGS_FILE=$(ls ${dir}/libraries/net/neoforged/neoforge/*/unix_args.txt 2>/dev/null | head -1)
if [ -z "$ARGS_FILE" ]; then
  ARGS_FILE=$(ls ${dir}/libraries/net/minecraftforge/forge/*/unix_args.txt 2>/dev/null | head -1)
fi

if [ -n "$ARGS_FILE" ]; then
  # 1.17 之後：安裝程式產生一份參數檔，裡面是 classpath 與主類別
  LAUNCH="@$ARGS_FILE nogui"
else
  # 1.17 之前：安裝程式直接產生一個可以執行的 jar
  FORGE_JAR=$(ls ${dir}/forge-*.jar 2>/dev/null | grep -v installer | head -1)
  if [ -z "$FORGE_JAR" ]; then
    echo "安裝程式跑完了，但找不到可以啟動的檔案" >&2
    exit 1
  fi
  LAUNCH="-jar $FORGE_JAR nogui"
fi`
}

/**
 * 產生 VM 第一次開機時執行的安裝腳本。
 *
 * 這段腳本會透過 GCE 的 startup-script metadata 傳給機器。它只在
 * 首次開機時做完整安裝，之後每次開機都會執行但會提早跳出（靠標記檔判斷），
 * 因為 systemd 已經接手負責啟動 Minecraft 了。
 *
 * 為什麼用 systemd 而不是 screen：systemd 免費提供「開機自動啟動」與
 * 「崩潰自動重開」，這兩件事用 screen 都要自己補，而且補得不可靠。
 */
export function buildStartupScript(opts: StartupScriptOptions): string {
  const { javaMajorVersion, jvmHeap, backupIntervalHours } = opts
  const dir = REMOTE.serverDir
  const installBlock = buildInstallBlock(opts)

  return `#!/bin/bash
set -euo pipefail

MARKER=${dir}/.craftlift-installed

# 這個腳本每次開機都會跑。已經裝好就直接結束，把工作交給 systemd。
if [ -f "$MARKER" ]; then
  echo "CraftLift 已安裝，略過。"
  exit 0
fi

echo "=== CraftLift 開始安裝 ==="

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y openjdk-${javaMajorVersion}-jre-headless curl tar python3

useradd -r -m -d ${dir} -s /usr/sbin/nologin minecraft || true
mkdir -p ${dir} ${REMOTE.backupDir}
cd ${dir}

${installBlock}

# 同意 Minecraft 使用者條款。使用者在 CraftLift 的建立流程中已被告知這一點。
echo "eula=true" > ${dir}/eula.txt

# RCON 密碼在機器上產生，不經過 metadata。
# metadata 對所有有專案權限的人可見，密碼放那裡沒必要。
RCON_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)
echo "$RCON_PASSWORD" > ${dir}/rcon-password
chmod 600 ${dir}/rcon-password

# 新伺服器的預設設定。使用者之後可以在「伺服器設定」分頁改。
#
# 注意 white-list=true：這代表伺服器一建好，連建立者自己都進不去，
# 必須先把玩家加進白名單。這是刻意的選擇——公開的 Minecraft 伺服器
# 幾分鐘內就會被掃描到，沒有白名單等於開門讓陌生人進來拆房子。
# UI 會在白名單是空的時候提醒使用者先把自己加進去。
cat > ${dir}/server.properties <<PROPS
enable-rcon=true
rcon.port=${REMOTE.rconPort}
rcon.password=$RCON_PASSWORD
broadcast-rcon-to-ops=false
server-port=${REMOTE.gamePort}
motd=CraftLift 伺服器
max-players=10
difficulty=hard
gamemode=survival
pvp=true
hardcore=false
white-list=true
online-mode=true
allow-nether=true
allow-flight=false
spawn-monsters=true
view-distance=10
simulation-distance=10
spawn-protection=16
PROPS

# --- RCON 用戶端 ---
# 備份時需要先叫伺服器把資料寫到磁碟，否則會打包到寫到一半的區塊檔。
# Ubuntu 內建 Python 3，寫一個四十行的小工具比裝額外套件乾淨。
cat > ${dir}/rcon.py <<'RCONPY'
#!/usr/bin/env python3
"""極簡 RCON 用戶端，只夠備份腳本使用。"""
import socket, struct, sys

def packet(req_id, req_type, body):
    payload = struct.pack('<ii', req_id, req_type) + body.encode('utf8') + b'\\x00\\x00'
    return struct.pack('<i', len(payload)) + payload

def read_packet(sock):
    raw_len = sock.recv(4)
    if len(raw_len) < 4:
        raise IOError('連線中斷')
    length = struct.unpack('<i', raw_len)[0]
    data = b''
    while len(data) < length:
        chunk = sock.recv(length - len(data))
        if not chunk:
            raise IOError('連線中斷')
        data += chunk
    req_id, _ = struct.unpack('<ii', data[:8])
    return req_id, data[8:-2].decode('utf8', errors='replace')

def main():
    password = open('${dir}/rcon-password').read().strip()
    # 指令有兩種傳法：
    #   argv   —— 給備份腳本用，內容是寫死的，安全
    #   stdin  —— 給 CraftLift 用，因為玩家名稱等內容由使用者輸入，
    #             走 stdin 就完全不經過遠端 shell，沒有命令注入的空間
    if '--stdin' in sys.argv:
        command = sys.stdin.read().strip()
    else:
        command = ' '.join(sys.argv[1:])
    if not command:
        print('沒有指令', file=sys.stderr)
        sys.exit(2)
    sock = socket.create_connection(('127.0.0.1', ${REMOTE.rconPort}), timeout=10)
    try:
        sock.sendall(packet(1, 3, password))   # 3 = 認證
        req_id, _ = read_packet(sock)
        if req_id == -1:
            print('RCON 認證失敗', file=sys.stderr)
            sys.exit(1)
        sock.sendall(packet(2, 2, command))    # 2 = 執行指令
        _, body = read_packet(sock)
        print(body)
    finally:
        sock.close()

if __name__ == '__main__':
    main()
RCONPY
chmod +x ${dir}/rcon.py

# --- 備份腳本 ---
# 先 save-off 停止自動存檔、save-all 把記憶體中的資料寫入磁碟，
# 打包完再 save-on 恢復。少了這步驟，備份可能是壞的。
cat > ${dir}/backup.sh <<'BACKUP'
#!/bin/bash
set -uo pipefail
DIR=${dir}
STAMP=$(date +%Y%m%d-%H%M%S)

if systemctl is-active --quiet ${REMOTE.serviceName}; then
  python3 "$DIR/rcon.py" save-off  || true
  python3 "$DIR/rcon.py" save-all  || true
  sleep 5
fi

tar -czf "$DIR/backups/world-$STAMP.tar.gz" -C "$DIR" world world_nether world_the_end 2>/dev/null \\
  || tar -czf "$DIR/backups/world-$STAMP.tar.gz" -C "$DIR" world

if systemctl is-active --quiet ${REMOTE.serviceName}; then
  python3 "$DIR/rcon.py" save-on || true
fi

# 只保留最新的幾份，避免把磁碟塞爆
ls -1t "$DIR"/backups/world-*.tar.gz 2>/dev/null | tail -n +$((${BACKUP_KEEP} + 1)) | xargs -r rm -f
echo "備份完成: world-$STAMP.tar.gz"

# --- 模組與設定 ---
#
# 跟世界分開包，因為兩者的變化頻率差很多：世界每幾小時就不一樣，模組與
# 設定幾乎不動，但一動就是幾百 MB。混在一起的話，每次自動備份都要重新
# 壓縮整包模組，而且拉回本機時每次都得重傳一次。
#
# 所以只有內容真的變了才重打。判斷依據是「檔名＋大小＋修改時間」的清單，
# 不對檔案內容算雜湊——對幾百 MB 的模組算 sha256 比重打包還慢。
SIG_FILE="$DIR/.craftlift-setup-sig"
SIG=$( { find "$DIR/mods" -type f -printf '%P\\t%s\\t%T@\\n' 2>/dev/null | sort
         for f in server.properties whitelist.json ops.json banned-players.json; do
           [ -f "$DIR/$f" ] && stat -c '%n %s %Y' "$DIR/$f"
         done
       } | md5sum | cut -d' ' -f1 )

if [ "$SIG" != "$(cat "$SIG_FILE" 2>/dev/null)" ]; then
  CONFIGS=""
  for f in server.properties whitelist.json ops.json banned-players.json; do
    [ -f "$DIR/$f" ] && CONFIGS="$CONFIGS $f"
  done
  # mods 在原版伺服器上不存在，這時候這一包就只有設定檔，一樣有價值
  [ -d "$DIR/mods" ] && CONFIGS="mods$CONFIGS"
  if [ -n "$CONFIGS" ]; then
    tar -czf "$DIR/backups/setup-$STAMP.tar.gz" -C "$DIR" $CONFIGS 2>/dev/null && \\
      echo "$SIG" > "$SIG_FILE"
    ls -1t "$DIR"/backups/setup-*.tar.gz 2>/dev/null | tail -n +$((${BACKUP_KEEP} + 1)) | xargs -r rm -f
    echo "模組與設定已更新: setup-$STAMP.tar.gz"
  fi
else
  echo "模組與設定沒有變動，沿用上一份"
fi
BACKUP
chmod +x ${dir}/backup.sh

# --- systemd 服務 ---
cat > /etc/systemd/system/${REMOTE.serviceName}.service <<UNIT
[Unit]
Description=Minecraft Server (CraftLift)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=minecraft
WorkingDirectory=${dir}
# $LAUNCH 由上面的安裝段決定：原版與 Fabric 是 -jar server.jar，
# Forge／NeoForge 則是安裝程式產生的參數檔。這裡是用 shell 展開寫進
# 檔案的，所以最後留在 unit 裡的是展開後的字面值。
ExecStart=/usr/bin/java -Xms${jvmHeap} -Xmx${jvmHeap} $LAUNCH
# 關機時給伺服器 90 秒好好存檔，不要直接砍掉
ExecStop=/usr/bin/python3 ${dir}/rcon.py stop
TimeoutStopSec=90
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

# --- 自動備份的排程 ---
cat > /etc/systemd/system/${REMOTE.serviceName}-backup.service <<UNIT
[Unit]
Description=Minecraft world backup (CraftLift)

[Service]
Type=oneshot
User=root
ExecStart=${dir}/backup.sh
UNIT

cat > /etc/systemd/system/${REMOTE.serviceName}-backup.timer <<UNIT
[Unit]
Description=Minecraft world backup schedule (CraftLift)

[Timer]
OnBootSec=15min
OnUnitActiveSec=${backupIntervalHours}h
Persistent=true

[Install]
WantedBy=timers.target
UNIT

chown -R minecraft:minecraft ${dir}
chmod 600 ${dir}/rcon-password
chown minecraft:minecraft ${dir}/rcon-password

systemctl daemon-reload
systemctl enable --now ${REMOTE.serviceName}.service
systemctl enable --now ${REMOTE.serviceName}-backup.timer

touch "$MARKER"
echo "=== CraftLift 安裝完成 ==="
`
}
