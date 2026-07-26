import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCoderIdentity } from '../../src/hooks/useCoderIdentity'

describe('useCoderIdentity', () => {
  beforeEach(() => localStorage.clear())

  it('starts with no identity when localStorage is empty', () => {
    const { result } = renderHook(() => useCoderIdentity())
    expect(result.current.identity).toBeNull()
  })

  it('persists the identity to localStorage and state', () => {
    const { result } = renderHook(() => useCoderIdentity())
    act(() => result.current.setIdentity({ coderId: 'a', passNo: 1 }))
    expect(result.current.identity).toEqual({ coderId: 'a', passNo: 1 })
    expect(JSON.parse(localStorage.getItem('thicket:coder-identity')!))
      .toEqual({ coderId: 'a', passNo: 1 })
  })

  it('reads a previously stored identity on mount', () => {
    localStorage.setItem('thicket:coder-identity',
      JSON.stringify({ coderId: 'b', passNo: 2 }))
    const { result } = renderHook(() => useCoderIdentity())
    expect(result.current.identity).toEqual({ coderId: 'b', passNo: 2 })
  })

  it('clears the identity', () => {
    const { result } = renderHook(() => useCoderIdentity())
    act(() => result.current.setIdentity({ coderId: 'a', passNo: 1 }))
    act(() => result.current.clearIdentity())
    expect(result.current.identity).toBeNull()
    expect(localStorage.getItem('thicket:coder-identity')).toBeNull()
  })
})
