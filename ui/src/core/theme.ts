import { useEffect, useState } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'

const storageKey = 'wee.theme'

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  if (typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(storageKey)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(() => readThemeMode())
  const [system, setSystem] = useState<'light' | 'dark'>(() => systemTheme())

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystem(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const resolved = mode === 'system' ? system : mode

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.documentElement.dataset.themeMode = mode
  }, [mode, resolved])

  function setMode(next: ThemeMode) {
    window.localStorage.setItem(storageKey, next)
    setModeState(next)
  }

  function toggleTheme() {
    setMode(resolved === 'dark' ? 'light' : 'dark')
  }

  return { mode, resolved, setMode, toggleTheme }
}
