import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer, ServerProperties } from '@shared/types'
import { PROPERTY_FIELDS } from '@shared/properties'
import { DEFAULT_SERVER_ICON_DATA_URL } from '@shared/serverIcon'
import { call, errorText } from '../../lib/api'
import { ErrorText, Info, Loading, Modal, Waiting } from '../../components/Ui'
import PropertyFields from '../../components/PropertyFields'

/**
 * The graphical server.properties editor.
 *
 * The field table is shared with the create screen (@shared/properties) so the
 * two cannot disagree. Settings that only mean something while creating (the
 * world seed) are filtered out here — the world already exists, so keeping the
 * field would leave one that does nothing when you change it.
 */
const FIELDS = PROPERTY_FIELDS.filter((field) => !('createOnly' in field && field.createOnly))

/**
 * The server icon.
 *
 * It lives on this page because, like the MOTD and the difficulty, it is part
 * of "what the server looks like to players". It is its own block rather than
 * a Field, because it is a picture, not a text input.
 *
 * Scaling and cropping happen in the main process; this only asks, shows, and
 * states errors plainly.
 */
function ServerIcon({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()
  const [icon, setIcon] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  /** The picked image is not square; waiting on the user to allow cropping */
  const [crop, setCrop] = useState<{ path: string; width: number; height: number } | null>(null)

  const load = useCallback(async () => {
    try {
      setIcon(await call(window.api.icon.get(server.name, server.zone)))
    } catch {
      // Unreadable counts as no icon. The rest of this page should not be
      // held up because one picture failed to load.
      setIcon(null)
    } finally {
      setLoading(false)
    }
  }, [server.name, server.zone])

  useEffect(() => {
    void load()
  }, [load])

  const apply = async (path: string): Promise<void> => {
    setCrop(null)
    setBusy(true)
    try {
      await call(window.api.icon.set(server.name, server.zone, path))
      await load()
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Pick an image.
   *
   * Non-square images are asked about before anything happens — cropping
   * silently decides which half to keep, and the user will notice their
   * picture lost its head; refusing outright sends them off to find an image
   * editor.
   */
  const choose = async (): Promise<void> => {
    setMessage('')
    const picked = await call(window.api.icon.pick())
    if (!picked) return

    const size = await call(window.api.icon.probe(picked))
    if (!size) {
      setMessage(t('errors.iconUnreadable'))
      return
    }
    if (size.width !== size.height) {
      setCrop({ path: picked, ...size })
      return
    }
    await apply(picked)
  }

  const reset = async (): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      await call(window.api.icon.reset(server.name, server.zone))
      await load()
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="server-icon">
      <div className="server-icon-preview">
        {/* No icon means a machine created before v1.1.0. Show the default
            rather than a blank, because that is exactly what "restore
            default" would give them. */}
        {loading ? null : (
          <img src={icon ?? DEFAULT_SERVER_ICON_DATA_URL} width={64} height={64} alt="" />
        )}
      </div>

      <div className="server-icon-body">
        <div className="field-label">
          {t('props.icon.label')}
          <Info text={t('props.icon.hint')} />
        </div>
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => void choose()}>
            {t('props.icon.replace')}
          </button>
          <button type="button" className="link-btn" disabled={busy} onClick={() => void reset()}>
            {t('props.icon.reset')}
          </button>
          {busy && <Waiting />}
        </div>
        <ErrorText>{message}</ErrorText>
      </div>

      {crop && (
        <Modal title={t('props.icon.cropTitle')} onClose={() => setCrop(null)}>
          <p>{t('props.icon.cropBody')}</p>
          <p className="muted small fact">
            {crop.width} × {crop.height}
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void apply(crop.path)}>
              {t('props.icon.cropConfirm')}
            </button>
            <button type="button" className="link-btn" onClick={() => setCrop(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default function PropertiesTab({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()
  const [props, setProps] = useState<ServerProperties>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)
  /** Ask before saving. null means the question has not been put yet. */
  const [confirm, setConfirm] = useState<{ running: boolean; players: number | null } | null>(null)
  const [checking, setChecking] = useState(false)
  /** Restarting after a save. This takes a good ten seconds, and in silence
   *  the screen looks frozen. */
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        setProps(await call(window.api.props.get(server.name, server.zone)))
      } catch (err) {
        setMessage(errorText(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [server.name, server.zone])

  const update = (key: string, value: string): void => {
    setProps((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  /**
   * Ask once, on save.
   *
   * server.properties is only read when Minecraft starts, so a change means a
   * restart. A restart disconnects everyone online, which the user deserves to
   * know before deciding — hence checking the current state first and saying
   * how many people it would kick.
   */
  const askBeforeSave = async (): Promise<void> => {
    setChecking(true)
    setMessage('')
    try {
      const status = await call(window.api.minecraft.status(server.name, server.zone))
      setConfirm({ running: status.running, players: status.playerCount })
    } catch {
      // Saving must work even when the status cannot be read. Treat it as
      // not running: save without restarting, and say so in the dialog.
      setConfirm({ running: false, players: null })
    } finally {
      setChecking(false)
    }
  }

  /**
   * Save, then restart Minecraft if it is running.
   *
   * If it is not running, only save — restarting a stopped service means
   * starting it, which is not what anyone means by pressing "save".
   */
  const save = async (restart: boolean): Promise<void> => {
    setConfirm(null)
    setSaving(true)
    setMessage('')
    try {
      const subset: ServerProperties = {}
      for (const field of FIELDS) {
        if (props[field.key] !== undefined) subset[field.key] = props[field.key]
      }
      await call(window.api.props.set(server.name, server.zone, subset))

      if (restart) {
        setRestarting(true)
        await call(window.api.minecraft.restart(server.name, server.zone))
      }
      setSaved(true)
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setRestarting(false)
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="properties">
      <ServerIcon server={server} />

      <PropertyFields fields={FIELDS} values={props} onChange={update} />

      <ErrorText>{message}</ErrorText>

      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={saving || checking}
          onClick={() => void askBeforeSave()}
        >
          {restarting
            ? t('props.restarting')
            : saving
              ? t('common.saving')
              : checking
                ? t('props.checking')
                : t('common.save')}
        </button>
        {(saving || checking) && <Waiting />}
        {saved && <span className="muted small">{t('props.saved')}</span>}
      </div>

      {confirm && (
        <Modal
          /* Nothing restarts when it is stopped, so the title should not say so */
          title={confirm.running ? t('props.confirmTitle') : t('props.confirmTitleStopped')}
          onClose={() => setConfirm(null)}
        >
          {confirm.running ? (
            <>
              <p>{t('props.confirmRunning')}</p>
              {confirm.players !== null && confirm.players > 0 && (
                <p className="error">{t('props.confirmPlayers', { n: confirm.players })}</p>
              )}
            </>
          ) : (
            <p>{t('props.confirmStopped')}</p>
          )}
          <div className="actions">
            <button type="button" className="primary" onClick={() => void save(confirm.running)}>
              {confirm.running ? t('props.saveAndRestart') : t('common.save')}
            </button>
            <button type="button" className="link-btn" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
