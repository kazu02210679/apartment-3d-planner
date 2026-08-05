import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('アプリケーションのルート要素が見つかりません。')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
