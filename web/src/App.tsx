import { useMemo, useState } from 'react'
import { Route, Routes } from 'react-router'
import type { Settings } from '@goal-tracker/shared/types'
import { ErrorPanel, Loading } from './components/ui.tsx'
import { Layout } from './components/Layout.tsx'
import { useLoader } from './hooks/useLoader.ts'
import { ApiRequestError, api } from './lib/api.ts'
import { BucketsPage } from './pages/BucketsPage.tsx'
import { EntriesPage } from './pages/EntriesPage.tsx'
import { GoalFormPage } from './pages/GoalFormPage.tsx'
import { GoalPage } from './pages/GoalPage.tsx'
import { GoalsPage } from './pages/GoalsPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { SettingsForm, SettingsPage } from './pages/SettingsPage.tsx'
import { SettingsContext } from './settings-context.ts'

// Returns null on first run, when no settings exist yet.
async function loadSettings(): Promise<Settings | null> {
  try {
    return await api.getSettings()
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'settings_not_found') return null
    throw error
  }
}

export function App() {
  const { state, reload } = useLoader(loadSettings)
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null)
  const settings = savedSettings ?? (state.status === 'ready' ? state.data : null)
  const contextValue = useMemo(
    () => (settings === null ? null : { settings, saveSettings: setSavedSettings }),
    [settings],
  )

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <ErrorPanel error={state.error} onRetry={reload} />

  if (contextValue === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-semibold">Welcome to Goal Tracker</h1>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          First, tell it when you get paid. Every projection counts paychecks from this date.
        </p>
        <div className="mt-8">
          <SettingsForm onSaved={setSavedSettings} submitLabel="Get started" />
        </div>
      </main>
    )
  }

  return (
    <SettingsContext value={contextValue}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<GoalsPage />} />
          <Route path="goals/new" element={<GoalFormPage />} />
          <Route path="goals/:goalId" element={<GoalPage />} />
          <Route path="goals/:goalId/edit" element={<GoalFormPage />} />
          <Route path="goals/:goalId/entries" element={<EntriesPage />} />
          <Route path="buckets" element={<BucketsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SettingsContext>
  )
}
