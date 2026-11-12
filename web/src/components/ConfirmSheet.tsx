import { useState, type ReactNode } from 'react'
import { describeError } from '../lib/api.ts'
import { FormError, Sheet, buttonStyles } from './ui.tsx'

interface ConfirmSheetProps {
  isOpen: boolean
  title: string
  confirmLabel: string
  tone?: 'primary' | 'danger'
  onConfirm: () => Promise<void>
  onClose: () => void
  children: ReactNode
}

export function ConfirmSheet({
  isOpen,
  title,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  onClose,
  children,
}: ConfirmSheetProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  async function handleConfirm() {
    setIsWorking(true)
    setErrorMessage(null)
    try {
      await onConfirm()
    } catch (error) {
      setErrorMessage(describeError(error))
    } finally {
      setIsWorking(false)
    }
  }

  function handleClose() {
    setErrorMessage(null)
    onClose()
  }

  return (
    <Sheet isOpen={isOpen} title={title} onClose={handleClose}>
      <div className="space-y-4">
        <div className="text-stone-600 dark:text-stone-300">{children}</div>
        <FormError message={errorMessage} />
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={buttonStyles.secondary} onClick={handleClose}>
            Not now
          </button>
          <button
            type="button"
            className={tone === 'danger' ? buttonStyles.danger : buttonStyles.primary}
            disabled={isWorking}
            onClick={() => void handleConfirm()}
          >
            {isWorking ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
