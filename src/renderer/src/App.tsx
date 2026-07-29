import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer } from '@shared/types'
import { call } from './lib/api'
import { useTheme } from './lib/theme'
import { useUpdate } from './lib/update'
import { Gear } from './components/Icons'
import UpdateNotice from './components/UpdateNotice'
import Setup from './pages/Setup'
import ServerList from './pages/ServerList'
import CreateServer from './pages/CreateServer'
import ServerDetail from './pages/ServerDetail'
import Settings from './pages/Settings'

/** 用最單純的狀態機當路由。畫面就這幾個，不值得為它拉一個路由套件進來。 */
type Route =
  | { name: 'setup' }
  | { name: 'list' }
  | { name: 'create' }
  | { name: 'detail'; server: MinecraftServer }
  | { name: 'settings' }

export default function App(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [route, setRoute] = useState<Route>({ name: 'setup' })
  const [projectId, setProjectId] = useState<string | null>(null)
  const [version, setVersion] = useState('')
  const update = useUpdate()

  useTheme()

  useEffect(() => {
    void window.api.app.version().then((r) => {
      if (r.ok) setVersion(r.data)
    })
  }, [])

  // 啟動時套用使用者上次選的語言
  useEffect(() => {
    void (async () => {
      try {
        const prefs = await call(window.api.app.getPreferences())
        if (prefs.language !== i18n.language) await i18n.changeLanguage(prefs.language)
      } catch {
        // 讀不到設定就用預設語言，不值得為此擋住啟動
      }
    })()
  }, [i18n])

  const ready = route.name !== 'setup'

  return (
    <div className="app">
      <div className="bar">
        <button
          type="button"
          className="wordmark"
          disabled={!ready}
          onClick={() => setRoute({ name: 'list' })}
        >
          <svg width="22" height="22" viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden>
            <path d="M16 4 L30 12 L16 20 L2 12 Z" fill="#2b6c9e" />
            <path d="M2 12 L16 20 L16 30 L2 22 Z" fill="#123047" />
            <path d="M30 12 L16 20 L16 30 L30 22 Z" fill="#1b4a6b" />
            <g fill="#5e8c4a">
              <rect x="10" y="10" width="6" height="1" />
              <rect x="18" y="12" width="5" height="1" />
            </g>
            <g fill="#e07a2f">
              <rect x="6" y="24" width="9" height="2" />
              <rect x="17" y="24" width="9" height="2" />
            </g>
          </svg>
          {t('app.name')}
          {version && <span className="version fact">v{version}</span>}
        </button>

        <div className="grow" />

        {ready && (
          <button
            type="button"
            className="icon-btn"
            aria-pressed={route.name === 'settings'}
            title={t('nav.settings')}
            aria-label={t('nav.settings')}
            onClick={() => setRoute({ name: 'settings' })}
          >
            <Gear />
          </button>
        )}
      </div>

      <UpdateNotice
        state={update.state}
        onDownload={update.download}
        onInstall={update.install}
      />

      {route.name === 'setup' && (
        <Setup
          onReady={(id) => {
            setProjectId(id)
            setRoute({ name: 'list' })
          }}
        />
      )}

      {route.name === 'list' && (
        <ServerList
          onOpen={(server) => setRoute({ name: 'detail', server })}
          onCreate={() => setRoute({ name: 'create' })}
        />
      )}

      {route.name === 'create' && (
        <CreateServer
          onCreated={() => setRoute({ name: 'list' })}
          onCancel={() => setRoute({ name: 'list' })}
        />
      )}

      {route.name === 'detail' && (
        <ServerDetail
          server={route.server}
          onBack={() => setRoute({ name: 'list' })}
          onDeleted={() => setRoute({ name: 'list' })}
        />
      )}

      {route.name === 'settings' && (
        <Settings
          projectId={projectId}
          onBack={() => setRoute({ name: 'list' })}
          /* 登出與徹底清除都回到這裡。Setup 一掛載就會重新檢查登入狀態與
             專案，所以使用者看到的就是剛裝好第一次打開的那個畫面。 */
          onReturnToSetup={() => {
            setProjectId(null)
            setRoute({ name: 'setup' })
          }}
        />
      )}
    </div>
  )
}
