import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useKeyboardNav } from '../../src/hooks/useKeyboardNav'

describe('useKeyboardNav', () => {
  it('moves the highlighted index down on j and up on k, clamped', () => {
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 3, onOpen: vi.fn(), onClose: vi.fn(), onFocusSearch: vi.fn(),
    }))
    expect(result.current.highlightedIndex).toBe(0)
    fireEvent.keyDown(document, { key: 'j' })
    expect(result.current.highlightedIndex).toBe(1)
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'j' })
    expect(result.current.highlightedIndex).toBe(2) // clamped at itemCount-1
    fireEvent.keyDown(document, { key: 'k' })
    expect(result.current.highlightedIndex).toBe(1)
  })

  it('calls onOpen with the highlighted index on Enter', () => {
    const onOpen = vi.fn()
    renderHook(() => useKeyboardNav({
      itemCount: 3, onOpen, onClose: vi.fn(), onFocusSearch: vi.fn(),
    }))
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(1)
  })

  it('calls onClose on Escape even while a text input is focused', () => {
    const onClose = vi.fn()
    document.body.innerHTML = '<input id="s" />'
    const input = document.getElementById('s') as HTMLInputElement
    input.focus()
    renderHook(() => useKeyboardNav({
      itemCount: 3, onOpen: vi.fn(), onClose, onFocusSearch: vi.fn(),
    }))
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('ignores j/k while a text input is focused', () => {
    document.body.innerHTML = '<input id="s" />'
    const input = document.getElementById('s') as HTMLInputElement
    input.focus()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 3, onOpen: vi.fn(), onClose: vi.fn(), onFocusSearch: vi.fn(),
    }))
    fireEvent.keyDown(input, { key: 'j' })
    expect(result.current.highlightedIndex).toBe(0)
  })

  it('calls onFocusSearch on / when not typing in a field', () => {
    const onFocusSearch = vi.fn()
    renderHook(() => useKeyboardNav({
      itemCount: 3, onOpen: vi.fn(), onClose: vi.fn(), onFocusSearch,
    }))
    fireEvent.keyDown(document, { key: '/' })
    expect(onFocusSearch).toHaveBeenCalled()
  })

  it('does not respond to j/k/Enter/"/" when enabled is false', () => {
    const onOpen = vi.fn()
    const onFocusSearch = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 3, onOpen, onClose: vi.fn(), onFocusSearch, enabled: false,
    }))
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: '/' })
    expect(result.current.highlightedIndex).toBe(0)
    expect(onOpen).not.toHaveBeenCalled()
    expect(onFocusSearch).not.toHaveBeenCalled()
  })

  it('calls onClose on Escape even when enabled is false', () => {
    const onClose = vi.fn()
    renderHook(() => useKeyboardNav({
      itemCount: 3, onOpen: vi.fn(), onClose, onFocusSearch: vi.fn(),
      enabled: false,
    }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
