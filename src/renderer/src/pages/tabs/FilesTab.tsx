import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer, RemoteFile, TransferItem, UploadItem } from '@shared/types'
import { REMOTE } from '@shared/constants'
import { call, errorText, formatSize, formatTime } from '../../lib/api'
import { completedKey, percentOf, useTransfers } from '../../lib/transfers'
import { ErrorText, Loading, Modal, TransferRow, Waiting } from '../../components/Ui'

/**
 * 檔案分頁。
 *
 * 操作邏輯刻意照抄 Windows 檔案總管：單擊選取、Ctrl／Shift 複選、雙擊開啟、
 * 右鍵選單、F2 改名、Delete 刪除、Ctrl+C／X／V、Backspace 上一層、拖放搬移。
 * 這些習慣使用者已經有了，重新發明一套只會讓人重學。
 *
 * 遠端不是本機磁碟這件事有兩個地方藏不住，就不假裝：
 * 每個操作都要跑一趟 SSH（所以有忙碌指示），以及沒有資源回收筒（所以刪除一定要問）。
 */

/** 副檔名在這張清單上的檔案，可以用內建編輯器直接改 */
const EDITABLE = ['.properties', '.txt', '.json', '.yml', '.yaml', '.cfg', '.conf', '.log', '.sh']

function isEditable(name: string): boolean {
  return EDITABLE.some((ext) => name.toLowerCase().endsWith(ext))
}

function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed.slice(0, trimmed.lastIndexOf('/'))
}

/** 把檔名拆成主檔名與副檔名。改名時只選主檔名的那一段要用。 */
function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' }
}

/** 撞名時「兩者都保留」用的編號名稱 */
function uniqueName(name: string, taken: Set<string>): string {
  const { stem, ext } = splitName(name)
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`
    if (!taken.has(candidate)) return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

type SortKey = 'name' | 'size' | 'type' | 'modified'
type ConflictChoice = 'replace' | 'keep' | 'skip'

/**
 * 應用程式內部拖曳用的資料格式。
 *
 * 自訂一個型別名稱，是為了跟從檔案總管拖進來的 'Files' 分得開——
 * 前者要搬移遠端檔案，後者要上傳，兩件完全不同的事。
 */
const DRAG_TYPE = 'application/x-craftlift-paths'

interface Planned {
  /** 對應到呼叫端傳進來的第幾筆 */
  index: number
  finalName: string
  replace: boolean
}

interface Clipboard {
  paths: string[]
  cut: boolean
}

interface MenuState {
  x: number
  y: number
  /** 在檔案上按的右鍵，還是在空白處 */
  onItem: boolean
}

export default function FilesTab({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()

  const [path, setPath] = useState<string>(REMOTE.serverDir)
  const [files, setFiles] = useState<RemoteFile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState('')

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true })

  const [history, setHistory] = useState<string[]>([REMOTE.serverDir])
  const [historyAt, setHistoryAt] = useState(0)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(null)
  const [editing, setEditing] = useState<{ path: string; content: string } | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirming, setConfirming] = useState<string[] | null>(null)
  const [details, setDetails] = useState<RemoteFile | null>(null)
  const [conflict, setConflict] = useState<string[] | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const conflictAnswer = useRef<((choice: ConflictChoice | null) => void) | null>(null)

  // 進度由主行程保管，所以切到別的分頁再回來，還在傳的東西依然看得到
  const transfers = useTransfers(server.name)

  // 傳輸完成後要重讀「現在這個資料夾」。用 ref 而不是把 path 放進相依，
  // 否則每次換資料夾都會多觸發一次重讀。
  const pathRef = useRef(path)
  pathRef.current = path

  // --- 讀取與導覽 -----------------------------------------------------------

  const load = useCallback(
    async (target: string) => {
      setLoading(true)
      setMessage('')
      try {
        setFiles(await call(window.api.files.list(server.name, server.zone, target)))
        setPath(target)
      } catch (err) {
        setMessage(errorText(err))
      } finally {
        setLoading(false)
      }
    },
    [server.name, server.zone]
  )

  useEffect(() => {
    void load(REMOTE.serverDir)
    // 一掛上就把焦點拿過來，這樣不用先點一下才能用鍵盤
    listRef.current?.focus({ preventScroll: true })
  }, [load])

  // 傳輸完成就重讀一次。整段上傳都發生在別的分頁上時，這裡是唯一會讓
  // 清單跟上的機會——當初送出上傳的那個元件早就卸載了。
  const finished = completedKey(transfers)
  useEffect(() => {
    if (finished) void load(pathRef.current)
  }, [finished, load])

  /** 換資料夾並記進上一頁／下一頁的歷程 */
  const goTo = useCallback(
    (target: string) => {
      if (target === path) return
      setHistory((prev) => [...prev.slice(0, historyAt + 1), target])
      setHistoryAt((prev) => prev + 1)
      setSelected(new Set())
      setAnchor(null)
      void load(target)
    },
    [historyAt, load, path]
  )

  const step = useCallback(
    (delta: number) => {
      const next = historyAt + delta
      if (next < 0 || next >= history.length) return
      setHistoryAt(next)
      setSelected(new Set())
      setAnchor(null)
      void load(history[next])
    },
    [history, historyAt, load]
  )

  const parent = parentOf(path)
  const canGoUp = path !== REMOTE.serverDir && parent.startsWith(REMOTE.serverDir)

  const crumbs = useMemo(() => {
    const out: Array<{ label: string; path: string }> = [
      { label: t('files.root'), path: REMOTE.serverDir }
    ]
    let acc: string = REMOTE.serverDir
    for (const segment of path.slice(REMOTE.serverDir.length).split('/').filter(Boolean)) {
      acc = `${acc}/${segment}`
      out.push({ label: segment, path: acc })
    }
    return out
  }, [path, t])

  // --- 排序 -----------------------------------------------------------------

  const extensionOf = (file: RemoteFile): string =>
    file.isDirectory ? '' : splitName(file.name).ext.slice(1).toLowerCase()

  const sorted = useMemo(() => {
    const list = [...files]
    list.sort((a, b) => {
      // 資料夾永遠排在檔案前面，不管照哪一欄排序——檔案總管就是這樣
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      let order = 0
      if (sort.key === 'name') order = a.name.localeCompare(b.name)
      else if (sort.key === 'size') order = a.size - b.size
      else if (sort.key === 'modified') order = a.modifiedAt - b.modifiedAt
      else order = extensionOf(a).localeCompare(extensionOf(b))
      // 同值時一律照名稱升冪，不受排序方向影響。不這樣做的話，一堆大小
      // 都是 0 的資料夾會照著後端回傳的順序排，看起來像隨機。
      if (order === 0) return a.name.localeCompare(b.name)
      return sort.asc ? order : -order
    })
    return list
  }, [files, sort])

  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files])
  const selectedFiles = useMemo(
    () => sorted.filter((f) => selected.has(f.path)),
    [sorted, selected]
  )

  const toggleSort = (key: SortKey): void =>
    setSort((prev) => ({ key, asc: prev.key === key ? !prev.asc : true }))

  // --- 忙碌與撞名 -----------------------------------------------------------

  const run = async (label: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(label)
    setMessage('')
    setSaved('')
    try {
      await fn()
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy('')
    }
  }

  const answerConflict = (choice: ConflictChoice | null): void => {
    setConflict(null)
    conflictAnswer.current?.(choice)
    conflictAnswer.current = null
  }

  /**
   * 決定一批東西放進 dir 之後各自要叫什麼。
   *
   * 撞名時停下來問使用者要取代、兩者都保留、還是略過——這三個選項跟
   * 檔案總管一樣。回傳 null 代表使用者取消了整件事。
   */
  const planNames = async (dir: string, wanted: string[]): Promise<Planned[] | null> => {
    const existing = new Set(await call(window.api.files.names(server.name, server.zone, dir)))
    const clashes = wanted.filter((name) => existing.has(name))

    if (clashes.length === 0) {
      return wanted.map((name, index) => ({ index, finalName: name, replace: false }))
    }

    setConflict(clashes)
    const choice = await new Promise<ConflictChoice | null>((resolve) => {
      conflictAnswer.current = resolve
    })
    if (!choice) return null

    const taken = new Set(existing)
    const planned: Planned[] = []
    wanted.forEach((name, index) => {
      if (!existing.has(name)) {
        taken.add(name)
        planned.push({ index, finalName: name, replace: false })
      } else if (choice === 'replace') {
        planned.push({ index, finalName: name, replace: true })
      } else if (choice === 'keep') {
        const fresh = uniqueName(name, taken)
        taken.add(fresh)
        planned.push({ index, finalName: fresh, replace: false })
      }
      // skip：不放進 planned，等於這一筆不做
    })
    return planned
  }

  // --- 操作 -----------------------------------------------------------------

  const open = async (file: RemoteFile): Promise<void> => {
    if (file.isDirectory) return goTo(file.path)
    if (!isEditable(file.name)) {
      setMessage(t('files.notEditable'))
      return
    }
    await run(t('files.busy.open'), async () => {
      const content = await call(window.api.files.read(server.name, server.zone, file.path))
      setEditing({ path: file.path, content })
    })
  }

  const saveEdit = async (): Promise<void> => {
    if (!editing) return
    setSavingEdit(true)
    try {
      await call(window.api.files.write(server.name, server.zone, editing.path, editing.content))
      setEditing(null)
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setSavingEdit(false)
    }
  }

  const remove = async (paths: string[]): Promise<void> => {
    setConfirming(null)
    if (paths.length === 0) return
    await run(t('files.busy.delete'), async () => {
      await call(window.api.files.delete(server.name, server.zone, paths))
      setSelected(new Set())
      await load(path)
    })
  }

  const commitRename = async (): Promise<void> => {
    if (!renaming) return
    const { path: target, value } = renaming
    setRenaming(null)
    if (!value.trim() || value === baseName(target)) return
    await run(t('files.busy.rename'), async () => {
      const next = await call(window.api.files.rename(server.name, server.zone, target, value))
      await load(path)
      setSelected(new Set([next]))
      setAnchor(next)
    })
  }

  const newFolder = async (): Promise<void> => {
    await run(t('files.busy.mkdir'), async () => {
      const taken = new Set(files.map((f) => f.name))
      const base = t('files.newFolderName')
      const name = taken.has(base) ? uniqueName(base, taken) : base
      const target = `${path}/${name}`
      await call(window.api.files.mkdir(server.name, server.zone, target))
      await load(path)
      setSelected(new Set([target]))
      setAnchor(target)
      // 檔案總管建完資料夾就進改名狀態，讓你直接打名字
      setRenaming({ path: target, value: name })
    })
  }

  const uploadTo = async (localPaths: string[], targetDir: string): Promise<void> => {
    if (localPaths.length === 0) return
    await run(t('files.busy.upload'), async () => {
      const names = localPaths.map((p) => p.split(/[\\/]/).filter(Boolean).pop() as string)
      const planned = await planNames(targetDir, names)
      if (!planned || planned.length === 0) return

      const items: UploadItem[] = planned.map((p) => ({
        localPath: localPaths[p.index],
        remotePath: `${targetDir}/${p.finalName}`,
        replace: p.replace
      }))
      await call(window.api.files.upload(server.name, server.zone, items))
      await load(path)
      if (targetDir === path) setSelected(new Set(items.map((i) => i.remotePath)))
    })
  }

  const pickAndUpload = async (kind: 'file' | 'directory'): Promise<void> => {
    const picked = await call(
      kind === 'file' ? window.api.files.pick() : window.api.files.pickDirectory()
    )
    await uploadTo(picked, path)
  }

  const download = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    await run(t('files.busy.download'), async () => {
      const dest = await call(window.api.files.download(server.name, server.zone, paths))
      if (dest) setSaved(dest)
    })
  }

  const pasteInto = async (targetDir: string): Promise<void> => {
    if (!clipboard || clipboard.paths.length === 0) return

    // 剪下之後貼回原本那個資料夾等於沒動。跳出「已經有同名檔案」問要不要
    // 取代是在問廢話——來源就是那個檔案。檔案總管在這種情況什麼都不做。
    const sources = clipboard.cut
      ? clipboard.paths.filter((p) => parentOf(p) !== targetDir)
      : clipboard.paths
    if (sources.length === 0) {
      setClipboard(null)
      return
    }

    await run(t(clipboard.cut ? 'files.busy.move' : 'files.busy.paste'), async () => {
      const planned = await planNames(targetDir, sources.map(baseName))
      if (!planned || planned.length === 0) return

      const items: TransferItem[] = planned.map((p) => ({
        from: sources[p.index],
        to: `${targetDir}/${p.finalName}`,
        replace: p.replace
      }))
      if (clipboard.cut) {
        await call(window.api.files.move(server.name, server.zone, items))
        setClipboard(null)
      } else {
        await call(window.api.files.copy(server.name, server.zone, items))
      }
      await load(path)
      if (targetDir === path) setSelected(new Set(items.map((i) => i.to)))
    })
  }

  /** 拖進資料夾＝搬移，跟同一顆磁碟內拖曳的預設行為一致 */
  const moveInto = async (paths: string[], targetDir: string): Promise<void> => {
    const usable = paths.filter((p) => p !== targetDir && parentOf(p) !== targetDir)
    if (usable.length === 0) return
    await run(t('files.busy.move'), async () => {
      const planned = await planNames(targetDir, usable.map(baseName))
      if (!planned || planned.length === 0) return
      const items: TransferItem[] = planned.map((p) => ({
        from: usable[p.index],
        to: `${targetDir}/${p.finalName}`,
        replace: p.replace
      }))
      await call(window.api.files.move(server.name, server.zone, items))
      setSelected(new Set())
      await load(path)
    })
  }

  // --- 選取 -----------------------------------------------------------------

  const selectOnly = (target: string): void => {
    setSelected(new Set([target]))
    setAnchor(target)
  }

  const onRowMouseDown = (event: React.MouseEvent, file: RemoteFile, index: number): void => {
    // 右鍵按在已選取的項目上要保留整批選取，這樣才能一次對多個檔案下指令；
    // 按在沒選到的項目上則只選它。修飾鍵在右鍵時一律不算。
    if (event.button === 2) {
      if (!selected.has(file.path)) selectOnly(file.path)
      return
    }

    if (event.shiftKey && anchor) {
      const from = sorted.findIndex((f) => f.path === anchor)
      if (from >= 0) {
        const [lo, hi] = from < index ? [from, index] : [index, from]
        const range = sorted.slice(lo, hi + 1).map((f) => f.path)
        setSelected(new Set(event.ctrlKey ? [...selected, ...range] : range))
        return
      }
    }
    if (event.ctrlKey) {
      const next = new Set(selected)
      if (next.has(file.path)) next.delete(file.path)
      else next.add(file.path)
      setSelected(next)
      setAnchor(file.path)
      return
    }
    selectOnly(file.path)
  }

  /** 上下鍵移動選取。按住 Shift 是延伸選取範圍。 */
  const moveCursor = (delta: number, extend: boolean): void => {
    if (sorted.length === 0) return
    const current = anchor ? sorted.findIndex((f) => f.path === anchor) : -1
    const next = Math.max(0, Math.min(sorted.length - 1, current < 0 ? 0 : current + delta))
    const target = sorted[next]
    if (extend && anchor) {
      const from = sorted.findIndex((f) => f.path === anchor)
      const [lo, hi] = from < next ? [from, next] : [next, from]
      setSelected(new Set(sorted.slice(lo, hi + 1).map((f) => f.path)))
    } else {
      setSelected(new Set([target.path]))
      setAnchor(target.path)
    }
  }

  // --- 鍵盤 -----------------------------------------------------------------

  const onKeyDown = (event: React.KeyboardEvent): void => {
    // 對話框開著時鍵盤是它的，不要搶
    if (editing || renaming || confirming || conflict || details) return

    const paths = [...selected]
    const single = paths.length === 1 ? byPath.get(paths[0]) : null

    if (event.ctrlKey && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setSelected(new Set(sorted.map((f) => f.path)))
      return
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'c' && paths.length > 0) {
      setClipboard({ paths, cut: false })
      return
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'x' && paths.length > 0) {
      setClipboard({ paths, cut: true })
      return
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'v') {
      void pasteInto(path)
      return
    }

    switch (event.key) {
      case 'Delete':
        if (paths.length > 0) setConfirming(paths)
        break
      case 'F2':
        if (single) setRenaming({ path: single.path, value: single.name })
        break
      case 'F5':
        void load(path)
        break
      case 'Enter':
        if (single) void open(single)
        break
      case 'Backspace':
        if (canGoUp) goTo(parent)
        break
      case 'Escape':
        setSelected(new Set())
        setMenu(null)
        break
      case 'ArrowDown':
        event.preventDefault()
        moveCursor(1, event.shiftKey)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveCursor(-1, event.shiftKey)
        break
      case 'ArrowLeft':
        if (event.altKey) step(-1)
        break
      case 'ArrowRight':
        if (event.altKey) step(1)
        break
      default:
        break
    }
  }

  // 選單開著時，點任何地方、捲動或視窗失焦都要收起來
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const openMenu = (event: React.MouseEvent, onItem: boolean): void => {
    event.preventDefault()
    // 檔案列包在清單容器裡面，不擋住的話事件會冒上去，
    // 空白處那份選單會蓋掉剛開好的檔案選單
    event.stopPropagation()
    // 選單量到 220×330 左右，貼著視窗邊緣時往回收，不然會被裁掉
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 330),
      onItem
    })
  }

  // --- 拖放 -----------------------------------------------------------------

  const externalPaths = (event: React.DragEvent): string[] =>
    Array.from(event.dataTransfer.files).map((file) => window.api.files.pathOf(file))

  const internalPaths = (event: React.DragEvent): string[] => {
    const raw = event.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return []
    try {
      return JSON.parse(raw) as string[]
    } catch {
      return []
    }
  }

  const onRowDragStart = (event: React.DragEvent, file: RemoteFile): void => {
    const dragging = selected.has(file.path) ? [...selected] : [file.path]
    if (!selected.has(file.path)) selectOnly(file.path)
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragging))
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = (event: React.DragEvent, targetDir: string): void => {
    event.preventDefault()
    event.stopPropagation()
    setDropTarget(null)
    if (event.dataTransfer.files.length > 0) {
      void uploadTo(externalPaths(event), targetDir)
      return
    }
    const dragged = internalPaths(event)
    if (dragged.length > 0) void moveInto(dragged, targetDir)
  }

  // --- 畫面 -----------------------------------------------------------------

  const busyNow = busy !== ''
  const totalSize = selectedFiles.reduce((sum, f) => sum + (f.isDirectory ? 0 : f.size), 0)

  const menuAction = (fn: () => void): ((event: React.MouseEvent) => void) => {
    return (event) => {
      event.stopPropagation()
      setMenu(null)
      fn()
    }
  }

  return (
    <div
      className="files"
      ref={listRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => onDrop(e, path)}
    >
      <div className="toolbar">
        <button
          type="button"
          className="icon-btn"
          disabled={historyAt === 0}
          title={t('files.back')}
          onClick={() => step(-1)}
        >
          ←
        </button>
        <button
          type="button"
          className="icon-btn"
          disabled={historyAt >= history.length - 1}
          title={t('files.forward')}
          onClick={() => step(1)}
        >
          →
        </button>
        <button
          type="button"
          className="icon-btn"
          disabled={!canGoUp}
          title={t('files.up')}
          onClick={() => goTo(parent)}
        >
          ↑
        </button>

        <nav className="crumbs">
          {crumbs.map((crumb, index) => (
            <span key={crumb.path}>
              {index > 0 && <i className="crumb-sep">›</i>}
              <button
                type="button"
                className="crumb"
                aria-current={index === crumbs.length - 1}
                onClick={() => goTo(crumb.path)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropTarget(crumb.path)
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => onDrop(e, crumb.path)}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>

        <div className="grow" />
        <button type="button" disabled={busyNow} onClick={() => void load(path)}>
          {t('common.refresh')}
        </button>
        {/* 新增資料夾、下載、刪除都在右鍵選單裡，工具列不重複放一份 */}
        <button
          type="button"
          className="primary"
          disabled={busyNow}
          onClick={() => void pickAndUpload('file')}
        >
          {t('files.upload')}
        </button>
      </div>

      <p className="muted small">{t('files.jarHint')}</p>
      <ErrorText>{message}</ErrorText>
      {saved && (
        <p className="small">
          <span className="fact">{saved}</span>{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => void call(window.api.files.reveal(saved))}
          >
            {t('files.revealSaved')}
          </button>
        </p>
      )}

      {loading ? (
        <Loading />
      ) : (
        <div
          className="explorer"
          onContextMenu={(e) => openMenu(e, false)}
          onMouseDown={(e) => {
            // 點在清單空白處＝取消選取，跟檔案總管一樣
            if (e.target === e.currentTarget && e.button === 0) setSelected(new Set())
          }}
        >
          <table className="table files-table">
            <thead>
              <tr>
                {(['name', 'modified', 'type', 'size'] as SortKey[]).map((key) => (
                  <th key={key}>
                    <button type="button" className="col-head" onClick={() => toggleSort(key)}>
                      {t(`files.columns.${key}`)}
                      {sort.key === key && <i>{sort.asc ? '▲' : '▼'}</i>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((file, index) => (
                <tr
                  key={file.path}
                  className={[
                    'row',
                    selected.has(file.path) ? 'picked' : '',
                    clipboard?.cut && clipboard.paths.includes(file.path) ? 'cut' : '',
                    dropTarget === file.path ? 'drop' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable={!renaming}
                  onMouseDown={(e) => onRowMouseDown(e, file, index)}
                  onDoubleClick={() => void open(file)}
                  onContextMenu={(e) => openMenu(e, true)}
                  onDragStart={(e) => onRowDragStart(e, file)}
                  onDragOver={(e) => {
                    if (!file.isDirectory) return
                    e.preventDefault()
                    setDropTarget(file.path)
                  }}
                  onDragLeave={() => setDropTarget((prev) => (prev === file.path ? null : prev))}
                  onDrop={(e) => (file.isDirectory ? onDrop(e, file.path) : undefined)}
                >
                  <td>
                    <span className="glyph">{file.isDirectory ? '📁' : '📄'}</span>
                    {renaming?.path === file.path ? (
                      <input
                        className="rename"
                        value={renaming.value}
                        /* 用 ref 而不是 autoFocus + onFocus：autoFocus 的對焦發生在
                           瀏覽器自己把游標移到結尾之前，在 onFocus 裡設選取範圍會被
                           蓋掉。ref 回呼在節點與 value 都就緒之後才跑，設得住。 */
                        ref={(el) => {
                          if (!el || el.dataset.armed) return
                          el.dataset.armed = '1'
                          el.focus()
                          // 檔案總管只選起主檔名，副檔名留著不動
                          el.setSelectionRange(0, splitName(el.value).stem.length)
                        }}
                        onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') void commitRename()
                          if (e.key === 'Escape') setRenaming(null)
                        }}
                      />
                    ) : (
                      <span className="file-name">{file.name}</span>
                    )}
                  </td>
                  {/* 這幾格不用再掛 .fact——整張表格已經是等寬字了，
                      而且 .fact 的 user-select: text 會跟整列選取打架 */}
                  <td className="muted small nowrap">{formatTime(file.modifiedAt)}</td>
                  <td className="muted small nowrap">
                    {file.isDirectory ? t('files.folder') : extensionOf(file) || t('files.plainFile')}
                  </td>
                  <td className="muted small nowrap right">
                    {file.isDirectory ? '—' : formatSize(file.size)}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted small">
                    {t('files.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="statusbar">
        <span>{t('files.itemCount', { count: files.length })}</span>
        {selected.size > 0 && (
          <span>
            {t('files.selectedCount', { count: selected.size })}
            {totalSize > 0 && <span className="fact">　{formatSize(totalSize)}</span>}
          </span>
        )}
        <div className="grow" />
        {/* 傳輸有自己的進度條；其餘操作（刪除、改名、貼上）沒有可量的進度，
            繼續用逐格等待指示 */}
        {transfers.map((job) => (
          <TransferRow
            key={job.id}
            label={t(job.kind === 'upload' ? 'files.busy.upload' : 'files.busy.download')}
            name={job.label}
            percent={percentOf(job)}
            failed={job.state === 'failed'}
          />
        ))}
        {busyNow && transfers.length === 0 && (
          <span className="busy">
            <Waiting /> {busy}
          </span>
        )}
      </div>

      {menu && (
        <div className="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.onItem ? (
            <>
              <button
                type="button"
                disabled={selected.size !== 1}
                onClick={menuAction(() => {
                  const file = byPath.get([...selected][0])
                  if (file) void open(file)
                })}
              >
                {t('files.menu.open')}
              </button>
              <button type="button" onClick={menuAction(() => void download([...selected]))}>
                {t('files.menu.download')}
              </button>
              <hr />
              <button
                type="button"
                onClick={menuAction(() => setClipboard({ paths: [...selected], cut: true }))}
              >
                {t('files.menu.cut')}
              </button>
              <button
                type="button"
                onClick={menuAction(() => setClipboard({ paths: [...selected], cut: false }))}
              >
                {t('files.menu.copy')}
              </button>
              <hr />
              <button
                type="button"
                disabled={selected.size !== 1}
                onClick={menuAction(() => {
                  const file = byPath.get([...selected][0])
                  if (file) setRenaming({ path: file.path, value: file.name })
                })}
              >
                {t('files.menu.rename')}
              </button>
              <button
                type="button"
                className="danger"
                onClick={menuAction(() => setConfirming([...selected]))}
              >
                {t('files.menu.delete')}
              </button>
              <hr />
              <button
                type="button"
                disabled={selected.size !== 1}
                onClick={menuAction(() => setDetails(byPath.get([...selected][0]) ?? null))}
              >
                {t('files.menu.details')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!clipboard}
                onClick={menuAction(() => void pasteInto(path))}
              >
                {t('files.menu.paste')}
              </button>
              <hr />
              <button type="button" onClick={menuAction(() => void newFolder())}>
                {t('files.menu.newFolder')}
              </button>
              <button type="button" onClick={menuAction(() => void pickAndUpload('file'))}>
                {t('files.menu.uploadFile')}
              </button>
              <button type="button" onClick={menuAction(() => void pickAndUpload('directory'))}>
                {t('files.menu.uploadFolder')}
              </button>
              <hr />
              <button
                type="button"
                onClick={menuAction(() => setSelected(new Set(sorted.map((f) => f.path))))}
              >
                {t('files.menu.selectAll')}
              </button>
              <button type="button" onClick={menuAction(() => void load(path))}>
                {t('files.menu.refresh')}
              </button>
            </>
          )}
        </div>
      )}

      {confirming && (
        <Modal title={t('files.confirmDeleteTitle')} onClose={() => setConfirming(null)}>
          <p>{t('files.confirmDelete', { count: confirming.length })}</p>
          <ul className="plain-list">
            {confirming.slice(0, 8).map((target) => (
              <li key={target} className="fact small">
                {baseName(target)}
              </li>
            ))}
            {confirming.length > 8 && (
              <li className="muted small">{t('files.andMore', { count: confirming.length - 8 })}</li>
            )}
          </ul>
          <p className="muted small">{t('files.noRecycleBin')}</p>
          <div className="actions">
            <button type="button" className="danger" onClick={() => void remove(confirming)}>
              {t('common.delete')}
            </button>
            <button type="button" className="link-btn" onClick={() => setConfirming(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}

      {conflict && (
        <Modal title={t('files.conflictTitle')} onClose={() => answerConflict(null)}>
          <p>{t('files.conflictBody', { count: conflict.length })}</p>
          <ul className="plain-list">
            {conflict.slice(0, 8).map((name) => (
              <li key={name} className="fact small">
                {name}
              </li>
            ))}
            {conflict.length > 8 && (
              <li className="muted small">{t('files.andMore', { count: conflict.length - 8 })}</li>
            )}
          </ul>
          <div className="actions">
            <button type="button" className="primary" onClick={() => answerConflict('replace')}>
              {t('files.conflictReplace')}
            </button>
            <button type="button" onClick={() => answerConflict('keep')}>
              {t('files.conflictKeep')}
            </button>
            <button type="button" onClick={() => answerConflict('skip')}>
              {t('files.conflictSkip')}
            </button>
            <button type="button" className="link-btn" onClick={() => answerConflict(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}

      {details && (
        <Modal title={t('files.detailsTitle')} onClose={() => setDetails(null)}>
          <dl className="details">
            <dt>{t('files.columns.name')}</dt>
            <dd className="fact">{details.name}</dd>
            <dt>{t('files.detailsPath')}</dt>
            <dd className="fact">{details.path}</dd>
            <dt>{t('files.columns.type')}</dt>
            <dd>
              {details.isDirectory ? t('files.folder') : extensionOf(details) || t('files.plainFile')}
            </dd>
            <dt>{t('files.columns.size')}</dt>
            <dd className="fact">{details.isDirectory ? '—' : formatSize(details.size)}</dd>
            <dt>{t('files.columns.modified')}</dt>
            <dd className="fact">{formatTime(details.modifiedAt)}</dd>
          </dl>
        </Modal>
      )}

      {editing && (
        <Modal title={<span className="path">{editing.path}</span>} onClose={() => setEditing(null)}>
          <textarea
            className="editor"
            value={editing.content}
            spellCheck={false}
            onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.ctrlKey && e.key.toLowerCase() === 's') {
                e.preventDefault()
                void saveEdit()
              }
            }}
          />
          <div className="actions">
            <button type="button" className="primary" disabled={savingEdit} onClick={() => void saveEdit()}>
              {savingEdit ? t('common.saving') : t('common.save')}
            </button>
            <button type="button" className="link-btn" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </button>
          </div>
          <p className="muted small">{t('files.restartHint')}</p>
        </Modal>
      )}
    </div>
  )
}
