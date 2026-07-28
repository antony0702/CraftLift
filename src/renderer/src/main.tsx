import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('找不到 #root 容器，index.html 可能被改壞了')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
