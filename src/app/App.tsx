import { useState } from 'react'

import { createEditorStore } from './editor-store'
import { EditorShell } from '../editor/EditorShell'
import { SceneStorage } from '../persistence/storage'

function createBrowserStorage(): SceneStorage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const adapter = {
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    }
    return new SceneStorage(adapter)
  } catch {
    return undefined
  }
}

export function App() {
  const [store] = useState(() => {
    const storage = createBrowserStorage()
    const saved = storage?.reload()
    return createEditorStore({
      storage,
      initialScene: saved?.ok ? saved.scene : undefined,
    })
  })
  return <EditorShell store={store} />
}
