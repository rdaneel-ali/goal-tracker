import { createContext, useContext } from 'react'
import type { Settings } from '@goal-tracker/shared/types'

export interface SettingsContextValue {
  settings: Settings
  saveSettings: (settings: Settings) => void
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (value === null) throw new Error('useSettings must be used inside SettingsContext')
  return value
}
