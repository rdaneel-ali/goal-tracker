import { useCallback, useEffect, useState } from 'react'

export type LoadState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown }

// Loads on mount and whenever `load` changes; wrap `load` in useCallback.
// A reload keeps showing the current data until the new data arrives.
export function useLoader<T>(load: () => Promise<T>): { state: LoadState<T>; reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let isCurrent = true
    load().then(
      (data) => {
        if (isCurrent) setState({ status: 'ready', data })
      },
      (error: unknown) => {
        if (isCurrent) setState({ status: 'error', error })
      },
    )
    return () => {
      isCurrent = false
    }
  }, [load, version])

  const reload = useCallback(() => {
    setVersion((current) => current + 1)
  }, [])

  return { state, reload }
}
