import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer, ModFile, UploadItem } from '@shared/types'
import { REMOTE } from '@shared/constants'
import { call, errorText, formatSize, formatTime } from '../../lib/api'
import { ErrorText, Loading, Modal, Waiting } from '../../components/Ui'

/**
 * 模組分頁。
 *
 * 操作邏輯跟「檔案」分頁完全一致——單擊選取、Ctrl／Shift 複選、雙擊執行
 * 主要動作、右鍵選單、Delete 刪除、Ctrl+A 全選、上下鍵移動、拖放上傳。
 * 使用者在同一個 app 裡不該學兩套。
 *
 * 底下也真的是同一套：上傳、刪除、下載、改名全部走 files.* 那幾個已經
 * 驗過的 IPC。「停用」在模組生態裡就是把副檔名改成 .jar.disabled，載入器
 * 只認 .jar，改個名字它就看不到了——所以停用也只是一次改名，模組本身
 * 留在原地，排查衝突時可以一個一個關掉再開回來。
 *
 * 跟檔案總管唯一不同的是這裡是平的：mods 資料夾沒有子資料夾要走，
 * 所以沒有麵包屑、沒有上一頁下一頁、沒有新增資料夾。
 */

type SortKey = 'name' | 'state' | 'size' | 'modified'
type ConflictChoice = 'replace' | 'keep' | 'skip'

interface MenuState {
  x: number
  y: number
  onItem: boolean
}

interface Planned {
  index: number
  finalName: string
  replace: boolean
}

/** 撞名時「兩者都保留」用的編號名稱 */
function uniqueName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`
    if (!taken.has(candidate)) return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

export default function ModsTab({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()

  const [mods, setMods] = useState<ModFile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState('')

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true })

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [confirming, setConfirming] = useState<ModFile[] | null>(null)
  const [details, setDetails] = useState<ModFile | null>(null)
  const [conflict, setConflict] = useState<string[] | null>(null)
  const [dropping, setDropping] = useState(false)

  /** 動過模組但還沒重新啟動。載入器只在啟動時掃一次 mods 資料夾。 */
  const [dirty, setDirty] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState<{ players: number | null } | null>(null)
  const [restarting, setRestarting] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const conflictAnswer = useRef<((choice: ConflictChoice | null) => void) | null>(null)

  // --- 讀取 -----------------------------------------------------------------

  const load = useCallback(async () => {
    try {
      setMods(await call(window.api.mods.list(server.name, server.zone)))
      setMessage('')
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [server.name, server.zone])

  useEffect(() => {
    void load()
    listRef.current?.focus({ preventScroll: true })
  }, [load])

  const sorted = useMemo(() => {
    const list = [...mods]
    list.sort((a, b) => {
      let order = 0
      if (sort.key === 'name') order = a.name.localeCompare(b.name)
      else if (sort.key === 'size') order = a.size - b.size
      else if (sort.key === 'modified') order = a.modifiedAt - b.modifiedAt
      else order = Number(b.enabled) - Number(a.enabled)
      if (order === 0) return a.name.localeCompare(b.name)
      return sort.asc ? order : -order
    })
    return list
  }, [mods, sort])

  const byPath = useMemo(() => new Map(mods.map((m) => [m.path, m])), [mods])
  const selectedMods = useMemo(() => sorted.filter((m) => selected.has(m.path)), [sorted, selected])

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

  /** 撞名時問取代、兩者都保留、還是略過——跟檔案分頁同一個對話框 */
  const planNames = async (wanted: string[]): Promise<Planned[] | null> => {
    const existing = new Set(
      await call(window.api.files.names(server.name, server.zone, REMOTE.modsDir))
    )
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
    })
    return planned
  }

  // --- 操作 -----------------------------------------------------------------

  /**
   * 啟用或停用：在 mods 與 mods/inactive 之間搬。
   *
   * 用 files.move 而不是自己開一條 IPC——它就是一次搬檔，而那條路徑已經
   * 有路徑逃逸防護也驗過了。一次搬一批，不是一個一個搬：每個遠端操作
   * 都是一趟 SSH 往返，勾了十個就往返十次的話會慢得很明顯。
   */
  const setEnabled = async (targets: ModFile[], enabled: boolean): Promise<void> => {
    const changing = targets.filter((m) => m.enabled !== enabled)
    if (changing.length === 0) return
    const targetDir = enabled ? REMOTE.modsDir : REMOTE.inactiveModsDir
    await run(t(enabled ? 'mods.busy.enable' : 'mods.busy.disable'), async () => {
      await call(
        window.api.files.move(
          server.name,
          server.zone,
          changing.map((mod) => ({ from: mod.path, to: `${targetDir}/${mod.fileName}` }))
        )
      )
      setDirty(true)
      await load()
    })
  }

  /** 雙擊與 Enter 的主要動作。跟檔案總管一樣，一次只對「這一個」動作。 */
  const primaryAction = (mod: ModFile): void => void setEnabled([mod], !mod.enabled)

  const remove = async (targets: ModFile[]): Promise<void> => {
    setConfirming(null)
    if (targets.length === 0) return
    await run(t('mods.busy.delete'), async () => {
      await call(window.api.files.delete(server.name, server.zone, targets.map((m) => m.path)))
      setSelected(new Set())
      setDirty(true)
      await load()
    })
  }

  const download = async (targets: ModFile[]): Promise<void> => {
    if (targets.length === 0) return
    await run(t('mods.busy.download'), async () => {
      const dest = await call(
        window.api.files.download(server.name, server.zone, targets.map((m) => m.path))
      )
      if (dest) setSaved(dest)
    })
  }

  /** 上傳。只收 .jar，其餘濾掉並說有幾個被略過。 */
  const upload = async (localPaths: string[]): Promise<void> => {
    const jars = localPaths.filter((p) => p.toLowerCase().endsWith('.jar'))
    const rejected = localPaths.length - jars.length
    if (jars.length === 0) {
      if (rejected > 0) setMessage(t('mods.onlyJar'))
      return
    }
    await run(t('mods.busy.upload'), async () => {
      const names = jars.map((p) => p.split(/[\\/]/).filter(Boolean).pop() as string)
      const planned = await planNames(names)
      if (!planned || planned.length === 0) return

      const items: UploadItem[] = planned.map((p) => ({
        localPath: jars[p.index],
        remotePath: `${REMOTE.modsDir}/${p.finalName}`,
        replace: p.replace
      }))
      await call(window.api.files.upload(server.name, server.zone, items))
      setDirty(true)
      await load()
      setSelected(new Set(items.map((i) => i.remotePath)))
      // 有東西被濾掉時仍然要講，不然使用者會以為全部都上傳了
      if (rejected > 0) setMessage(t('mods.someSkipped', { count: rejected }))
    })
  }

  const pickAndUpload = async (): Promise<void> => {
    try {
      const picked = await call(window.api.mods.pick())
      await upload(picked)
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  // --- 重新啟動 -------------------------------------------------------------

  const askBeforeRestart = async (): Promise<void> => {
    setBusy(t('mods.busy.checking'))
    try {
      const status = await call(window.api.minecraft.status(server.name, server.zone))
      setConfirmRestart({ players: status.playerCount })
    } catch {
      // 查不到人數也還是能重啟，只是對話框裡不提人數
      setConfirmRestart({ players: null })
    } finally {
      setBusy('')
    }
  }

  const restart = async (): Promise<void> => {
    setConfirmRestart(null)
    setRestarting(true)
    setMessage('')
    try {
      await call(window.api.minecraft.restart(server.name, server.zone))
      setDirty(false)
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setRestarting(false)
    }
  }

  // --- 選取 -----------------------------------------------------------------

  const selectOnly = (target: string): void => {
    setSelected(new Set([target]))
    setAnchor(target)
  }

  const onRowMouseDown = (event: React.MouseEvent, mod: ModFile, index: number): void => {
    // 右鍵按在已選取的項目上要保留整批選取，按在沒選到的則只選它
    if (event.button === 2) {
      if (!selected.has(mod.path)) selectOnly(mod.path)
      return
    }
    if (event.shiftKey && anchor) {
      const from = sorted.findIndex((m) => m.path === anchor)
      if (from >= 0) {
        const [lo, hi] = from < index ? [from, index] : [index, from]
        const range = sorted.slice(lo, hi + 1).map((m) => m.path)
        setSelected(new Set(event.ctrlKey ? [...selected, ...range] : range))
        return
      }
    }
    if (event.ctrlKey) {
      const next = new Set(selected)
      if (next.has(mod.path)) next.delete(mod.path)
      else next.add(mod.path)
      setSelected(next)
      setAnchor(mod.path)
      return
    }
    selectOnly(mod.path)
  }

  const moveCursor = (delta: number, extend: boolean): void => {
    if (sorted.length === 0) return
    const current = anchor ? sorted.findIndex((m) => m.path === anchor) : -1
    const next = Math.max(0, Math.min(sorted.length - 1, current < 0 ? 0 : current + delta))
    if (extend && anchor) {
      const from = sorted.findIndex((m) => m.path === anchor)
      const [lo, hi] = from < next ? [from, next] : [next, from]
      setSelected(new Set(sorted.slice(lo, hi + 1).map((m) => m.path)))
    } else {
      selectOnly(sorted[next].path)
    }
  }

  // --- 鍵盤 -----------------------------------------------------------------

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (confirming || conflict || details || confirmRestart) return

    const chosen = selectedMods
    const single = chosen.length === 1 ? chosen[0] : null

    if (event.ctrlKey && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setSelected(new Set(sorted.map((m) => m.path)))
      return
    }

    switch (event.key) {
      case 'Delete':
        if (chosen.length > 0) setConfirming(chosen)
        break
      case 'F5':
        void load()
        break
      case 'Enter':
        if (single) primaryAction(single)
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
      default:
        break
    }
  }

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
    // 不擋住的話事件會冒到容器，空白處那份選單會蓋掉剛開好的項目選單
    event.stopPropagation()
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 264),
      onItem
    })
  }

  const menuAction = (fn: () => void): ((event: React.MouseEvent) => void) => {
    return (event) => {
      event.stopPropagation()
      setMenu(null)
      fn()
    }
  }

  // --- 畫面 -----------------------------------------------------------------

  const busyNow = busy !== ''
  const disabledCount = mods.filter((m) => !m.enabled).length
  const totalSize = selectedMods.reduce((sum, m) => sum + m.size, 0)
  /** 選取的東西是不是全部都停用中。決定選單要寫「啟用」還是「停用」。 */
  const allDisabled = selectedMods.length > 0 && selectedMods.every((m) => !m.enabled)

  return (
    <div
      className={`files mods${dropping ? ' dropping' : ''}`}
      ref={listRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDropping(true)
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropping(false)
        const paths = Array.from(e.dataTransfer.files).map((f) => window.api.files.pathOf(f))
        if (paths.length > 0) void upload(paths)
      }}
    >
      <div className="toolbar">
        <span className="path">{REMOTE.modsDir}</span>
        <div className="grow" />
        <button type="button" disabled={busyNow} onClick={() => void load()}>
          {t('common.refresh')}
        </button>
        {/* 刪除、下載、啟用停用都在右鍵選單裡，工具列不重複放一份 */}
        <button
          type="button"
          className="primary"
          disabled={busyNow}
          onClick={() => void pickAndUpload()}
        >
          {t('mods.upload')}
        </button>
      </div>

      {/* 改完不重啟等於沒改。還沒動過時只是一句說明，動過之後才變成待辦。 */}
      {dirty ? (
        <div className="notice">
          <p className="small">{t('mods.needRestart')}</p>
          <div className="actions">
            <button
              type="button"
              className="torch"
              disabled={restarting || busyNow}
              onClick={() => void askBeforeRestart()}
            >
              {restarting ? t('mods.restarting') : t('mods.restartNow')}
            </button>
            {restarting && <Waiting />}
          </div>
        </div>
      ) : (
        <p className="muted small">{t('mods.restartNote')}</p>
      )}

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
            if (e.target === e.currentTarget && e.button === 0) setSelected(new Set())
          }}
        >
          <table className="table files-table">
            <thead>
              <tr>
                {/* 勾選欄沒有標題文字——欄位標題同時是排序按鈕，
                    而「按一下標題把全部勾起來」跟排序會打架 */}
                <th className="tick" />
                {(['name', 'modified', 'state', 'size'] as SortKey[]).map((key) => (
                  <th key={key}>
                    <button type="button" className="col-head" onClick={() => toggleSort(key)}>
                      {t(`mods.columns.${key}`)}
                      {sort.key === key && <i>{sort.asc ? '▲' : '▼'}</i>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((mod, index) => (
                <tr
                  key={mod.path}
                  className={[
                    'row',
                    selected.has(mod.path) ? 'picked' : '',
                    mod.enabled ? '' : 'off'
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseDown={(e) => onRowMouseDown(e, mod, index)}
                  onDoubleClick={() => primaryAction(mod)}
                  onContextMenu={(e) => openMenu(e, true)}
                >
                  {/* 勾選是這一格自己的事，不要順便改動整列的選取，
                      否則勾一個就把原本選好的一批清掉了 */}
                  <td
                    className="tick"
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={mod.enabled}
                      disabled={busyNow}
                      aria-label={mod.name}
                      onChange={(e) => void setEnabled([mod], e.target.checked)}
                    />
                  </td>
                  <td>
                    <span className="file-name">{mod.name}</span>
                    {/* Fabric 的副檔名比對區分大小寫，.JAR 它根本不會載入。
                        標成「啟用中」卻沒作用是最難查的那種問題。 */}
                    {!mod.loadable && <span className="warn"> {t('mods.badExtension')}</span>}
                  </td>
                  <td className="muted small nowrap">{formatTime(mod.modifiedAt)}</td>
                  <td className="muted small nowrap">{t(mod.enabled ? 'mods.on' : 'mods.off')}</td>
                  <td className="muted small nowrap right">{formatSize(mod.size)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted small">
                    {t('mods.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="statusbar">
        <span>{t('mods.count', { count: mods.length })}</span>
        {disabledCount > 0 && <span>{t('mods.disabledCount', { count: disabledCount })}</span>}
        {selected.size > 0 && (
          <span>
            {t('files.selectedCount', { count: selected.size })}
            {totalSize > 0 && <span className="fact">　{formatSize(totalSize)}</span>}
          </span>
        )}
        <div className="grow" />
        {busyNow && (
          <span className="busy">
            <Waiting /> {busy}
          </span>
        )}
      </div>

      {menu && (
        <div
          className="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.onItem ? (
            <>
              {/* 選到的全是停用中就寫「啟用」，否則寫「停用」。混合時
                  以「停用」為準——那是比較保守的方向。 */}
              <button
                type="button"
                onClick={menuAction(() => void setEnabled(selectedMods, allDisabled))}
              >
                {t(allDisabled ? 'mods.enable' : 'mods.disable')}
              </button>
              <button type="button" onClick={menuAction(() => void download(selectedMods))}>
                {t('files.menu.download')}
              </button>
              <hr />
              <button
                type="button"
                className="danger"
                onClick={menuAction(() => setConfirming(selectedMods))}
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
              <button type="button" onClick={menuAction(() => void pickAndUpload())}>
                {t('mods.menu.upload')}
              </button>
              <hr />
              <button
                type="button"
                onClick={menuAction(() => setSelected(new Set(sorted.map((m) => m.path))))}
              >
                {t('files.menu.selectAll')}
              </button>
              <button type="button" onClick={menuAction(() => void load())}>
                {t('files.menu.refresh')}
              </button>
            </>
          )}
        </div>
      )}

      {confirming && (
        <Modal title={t('mods.confirmDeleteTitle')} onClose={() => setConfirming(null)}>
          <p>{t('mods.confirmDelete', { count: confirming.length })}</p>
          <ul className="plain-list">
            {confirming.slice(0, 8).map((mod) => (
              <li key={mod.path} className="fact small">
                {mod.name}
              </li>
            ))}
            {confirming.length > 8 && (
              <li className="muted small">{t('files.andMore', { count: confirming.length - 8 })}</li>
            )}
          </ul>
          <p className="muted small">{t('mods.confirmDeleteNote')}</p>
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
            <dt>{t('mods.columns.name')}</dt>
            <dd className="fact">{details.name}</dd>
            <dt>{t('mods.detailsFileName')}</dt>
            <dd className="fact">{details.fileName}</dd>
            <dt>{t('mods.columns.state')}</dt>
            <dd>{t(details.enabled ? 'mods.on' : 'mods.off')}</dd>
            <dt>{t('mods.columns.size')}</dt>
            <dd className="fact">{formatSize(details.size)}</dd>
            <dt>{t('mods.columns.modified')}</dt>
            <dd className="fact">{formatTime(details.modifiedAt)}</dd>
          </dl>
        </Modal>
      )}

      {confirmRestart && (
        <Modal title={t('mods.restartNow')} onClose={() => setConfirmRestart(null)}>
          <p>{t('mods.confirmRestart')}</p>
          {confirmRestart.players !== null && confirmRestart.players > 0 && (
            <p className="error">{t('mods.confirmPlayers', { n: confirmRestart.players })}</p>
          )}
          <div className="actions">
            <button type="button" className="primary" onClick={() => void restart()}>
              {t('mods.restartNow')}
            </button>
            <button type="button" className="link-btn" onClick={() => setConfirmRestart(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
