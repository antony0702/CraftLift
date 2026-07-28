import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer } from '@shared/types'
import { call } from './lib/api'
import { supportedLanguages } from './i18n'
import Setup from './pages/Setup'
import ServerList from './pages/ServerList'
import CreateServer from './pages/CreateServer'
import ServerDetail from './pages/ServerDetail'
import Settings from './pages/Settings'

/** 用最單純的狀態機當路由。頁面就這幾個，不值得為它拉一個路由套件進來。 */
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
      <header className="app-header">
        <button
          type="button"
          className="brand"
          onClick={() => ready && setRoute({ name: 'list' })}
        >
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>{t('app.name')}</h1>
            <p className="tagline">{t('app.tagline')}</p>
          </div>
        </button>

        <div className="header-actions">
          {ready && (
            <button
              type="button"
              className={route.name === 'settings' ? 'link active' : 'link'}
              onClick={() => setRoute({ name: 'settings' })}
            >
              {t('nav.settings')}
            </button>
          )}
          <select
            className="lang-select"
            value={i18n.language}
            onChange={(e) => {
              void i18n.changeLanguage(e.target.value)
              void window.api.app.setPreferences({ language: e.target.value })
            }}
            aria-label="Language"
          >
            {supportedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </header>

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
          onProjectDeleted={() => {
            setProjectId(null)
            setRoute({ name: 'setup' })
          }}
        />
      )}
    </div>
  )
}
