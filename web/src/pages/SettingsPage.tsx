import { useState, type SubmitEvent } from 'react'
import type { Settings } from '@goal-tracker/shared/types'
import { Field, FormError, buttonStyles, cardStyles, inputStyles } from '../components/ui.tsx'
import { api, describeError } from '../lib/api.ts'
import { buildEntriesCsv } from '../lib/csv.ts'
import { findTodayInTimezone } from '../lib/dates.ts'
import { useSettings } from '../settings-context.ts'

const TIMEZONES = Intl.supportedValuesOf('timeZone')
const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

interface SettingsFormProps {
  initialSettings?: Settings
  submitLabel: string
  onSaved: (settings: Settings) => void
}

export function SettingsForm({ initialSettings, submitLabel, onSaved }: SettingsFormProps) {
  const [anchorPayday, setAnchorPayday] = useState(initialSettings?.anchor_payday ?? '')
  const [timezone, setTimezone] = useState(initialSettings?.timezone ?? BROWSER_TIMEZONE)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (anchorPayday === '') {
      setErrorMessage('Pick the date of any payday.')
      return
    }
    setErrorMessage(null)
    setSavedMessage(null)
    setIsSaving(true)
    try {
      const saved = await api.putSettings({ anchor_payday: anchorPayday, timezone })
      setSavedMessage('Saved.')
      onSaved(saved)
    } catch (error) {
      setErrorMessage(describeError(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className={`${cardStyles} space-y-4`} onSubmit={(event) => void handleSubmit(event)} noValidate>
      <Field label="A payday" hint="Any past or upcoming payday. You're paid every two weeks from this date.">
        <input
          className={inputStyles}
          type="date"
          value={anchorPayday}
          onChange={(event) => setAnchorPayday(event.target.value)}
        />
      </Field>
      <Field label="Time zone" hint="Decides when “today” starts.">
        <select className={inputStyles} value={timezone} onChange={(event) => setTimezone(event.target.value)}>
          {TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </Field>
      <FormError message={errorMessage} />
      {savedMessage !== null && (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400" role="status">
          {savedMessage}
        </p>
      )}
      <button type="submit" className={`${buttonStyles.primary} w-full`} disabled={isSaving}>
        {isSaving ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

function downloadTextFile(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function SettingsPage() {
  const { settings, saveSettings } = useSettings()
  const [exportError, setExportError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    setExportError(null)
    setIsExporting(true)
    try {
      const data = await api.exportAll()
      downloadTextFile(`goal-tracker-${findTodayInTimezone(settings.timezone)}.csv`, buildEntriesCsv(data))
    } catch (error) {
      setExportError(describeError(error))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsForm initialSettings={settings} submitLabel="Save settings" onSaved={saveSettings} />
      <section className={`${cardStyles} space-y-3`}>
        <h2 className="font-semibold">Your data</h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Download every deposit and withdrawal as a spreadsheet, with its goal and bucket.
        </p>
        <FormError message={exportError} />
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={isExporting}
          onClick={() => void handleExport()}
        >
          {isExporting ? 'Preparing…' : 'Export as CSV'}
        </button>
      </section>
    </div>
  )
}
