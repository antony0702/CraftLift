import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer, RemoteFile } from '@shared/types'
import { REMOTE } from '@shared/constants'
import { call, errorText, formatSize, formatTime } from '../../lib/api'
import { ErrorText, Loading, Modal } from '../../components/Ui'

/** 副檔名在這張清單上的檔案，可以用內建編輯器直接改 */
const EDITABLE = ['.properties', '.txt', '.json', '.yml', '.yaml', '.cfg', '.conf', '.log', '.sh']

function isEditable(name: string): boolean {
  return EDITABLE.some((ext) => name.toLowerCase().endsWith(ext))
}

export default function FilesTab({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()
  const [path, setPath] = useState<string>(REMOTE.serverDir)
  const [files, setFiles] = useState<RemoteFile[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<{ path: string; content: string } | null>(null)
  const [saving, setSaving] = useState(false)

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
  }, [load])

  const openFile = async (file: RemoteFile): Promise<void> => {
    if (file.isDirectory) return void load(file.path)
    if (!isEditable(file.name)) {
      setMessage(t('files.notEditable'))
      return
    }
    try {
      const content = await call(window.api.files.read(server.name, server.zone, file.path))
      setEditing({ path: file.path, content })
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const save = async (): Promise<void> => {
    if (!editing) return
    setSaving(true)
    try {
      await call(
        window.api.files.write(server.name, server.zone, editing.path, editing.content)
      )
      setEditing(null)
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (file: RemoteFile): Promise<void> => {
    if (!window.confirm(t('files.confirmDelete', { name: file.name }))) return
    try {
      await call(window.api.files.delete(server.name, server.zone, file.path))
      await load(path)
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const upload = async (): Promise<void> => {
    try {
      const name = await call(window.api.files.upload(server.name, server.zone, path))
      if (name) await load(path)
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const download = async (file: RemoteFile): Promise<void> => {
    try {
      await call(window.api.files.download(server.name, server.zone, file.path))
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const parent = path.substring(0, path.lastIndexOf('/'))
  const canGoUp = path !== REMOTE.serverDir && parent.startsWith(REMOTE.serverDir)

  return (
    <div className="files">
      <div className="files-bar">
        <code className="path">{path}</code>
        <div className="spacer" />
        {canGoUp && (
          <button type="button" onClick={() => void load(parent)}>
            {t('files.up')}
          </button>
        )}
        <button type="button" onClick={() => void load(path)}>
          {t('common.refresh')}
        </button>
        <button type="button" className="primary" onClick={() => void upload()}>
          {t('files.upload')}
        </button>
      </div>

      <p className="muted small">{t('files.jarHint')}</p>
      <ErrorText>{message}</ErrorText>

      {loading ? (
        <Loading />
      ) : (
        <table className="file-table">
          <tbody>
            {files.map((file) => (
              <tr key={file.path}>
                <td>
                  <button type="button" className="file-name" onClick={() => void openFile(file)}>
                    {file.isDirectory ? '📁' : '📄'} {file.name}
                  </button>
                </td>
                <td className="muted small nowrap">
                  {file.isDirectory ? '—' : formatSize(file.size)}
                </td>
                <td className="muted small nowrap">{formatTime(file.modifiedAt)}</td>
                <td className="nowrap">
                  {!file.isDirectory && (
                    <button type="button" className="link" onClick={() => void download(file)}>
                      {t('files.download')}
                    </button>
                  )}
                  <button type="button" className="link danger" onClick={() => void remove(file)}>
                    {t('common.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <Modal title={editing.path} onClose={() => setEditing(null)}>
          <textarea
            className="editor"
            value={editing.content}
            spellCheck={false}
            onChange={(e) => setEditing({ ...editing, content: e.target.value })}
          />
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <button type="button" className="link" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </button>
          </div>
          <p className="muted small">{t('files.restartHint')}</p>
        </Modal>
      )}
    </div>
  )
}
