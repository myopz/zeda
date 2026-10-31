import { useCallback, useState } from 'react'

export function useHistoryState<T>(initial: T) {
  const [past, setPast] = useState<T[]>([])
  const [present, setPresent] = useState(initial)
  const [future, setFuture] = useState<T[]>([])

  const reset = useCallback((value: T) => {
    setPast([])
    setPresent(value)
    setFuture([])
  }, [])

  const set = useCallback((value: T | ((prev: T) => T), recordHistory = true) => {
    setPresent((prev) => {
      const next = typeof value === 'function' ? (value as (p: T) => T)(prev) : value
      if (recordHistory) {
        setPast((p) => [...p, prev])
        setFuture([])
      }
      return next
    })
  }, [])

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p
      const previous = p[p.length - 1]!
      setFuture((f) => [present, ...f])
      setPresent(previous)
      return p.slice(0, -1)
    })
  }, [present])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f
      const next = f[0]!
      setPast((p) => [...p, present])
      setPresent(next)
      return f.slice(1)
    })
  }, [present])

  return {
    state: present,
    set,
    reset,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  }
}
