import { useCallback, useState } from 'react'

export interface CoderIdentity {
  coderId: string
  passNo: number
}

const STORAGE_KEY = 'thicket:coder-identity'

function readStored(): CoderIdentity | null {
  const params = new URLSearchParams(window.location.search)
  const requestedCoder = params.get('coder')
  const requestedPass = Number(params.get('pass') ?? '1')
  if (requestedCoder && (requestedPass === 1 || requestedPass === 2)) {
    const requested = { coderId: requestedCoder, passNo: requestedPass }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requested))
    return requested
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CoderIdentity
  } catch {
    return null
  }
}

export function useCoderIdentity() {
  const [identity, setIdentityState] = useState<CoderIdentity | null>(
    () => readStored())

  const setIdentity = useCallback((next: CoderIdentity) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setIdentityState(next)
  }, [])

  const clearIdentity = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setIdentityState(null)
  }, [])

  return { identity, setIdentity, clearIdentity }
}
