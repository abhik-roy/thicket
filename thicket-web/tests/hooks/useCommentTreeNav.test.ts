import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCommentTreeNav } from '../../src/hooks/useCommentTreeNav'

describe('useCommentTreeNav', () => {
  it('moves the focused index down on j and up on k, clamped', () => {
    const { result } = renderHook(() => useCommentTreeNav({
      itemCount: 3, onToggleCode: vi.fn(), onMarkDone: vi.fn(), onBack: vi.fn(),
    }))
    expect(result.current.focusedIndex).toBe(0)
    fireEvent.keyDown(document, { key: 'j' })
    expect(result.current.focusedIndex).toBe(1)
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'j' })
    expect(result.current.focusedIndex).toBe(2)
    fireEvent.keyDown(document, { key: 'k' })
    expect(result.current.focusedIndex).toBe(1)
  })

  it('calls onToggleCode with the focused index and the pressed hotkey', () => {
    const onToggleCode = vi.fn()
    renderHook(() => useCommentTreeNav({
      itemCount: 3, onToggleCode, onMarkDone: vi.fn(), onBack: vi.fn(),
    }))
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: '3' })
    expect(onToggleCode).toHaveBeenCalledWith(1, '3')
  })

  it('calls onMarkDone on Enter', () => {
    const onMarkDone = vi.fn()
    renderHook(() => useCommentTreeNav({
      itemCount: 3, onToggleCode: vi.fn(), onMarkDone, onBack: vi.fn(),
    }))
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onMarkDone).toHaveBeenCalled()
  })

  it('calls onBack on Escape even while a text input is focused', () => {
    const onBack = vi.fn()
    document.body.innerHTML = '<input id="s" />'
    const input = document.getElementById('s') as HTMLInputElement
    input.focus()
    renderHook(() => useCommentTreeNav({
      itemCount: 3, onToggleCode: vi.fn(), onMarkDone: vi.fn(), onBack,
    }))
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onBack).toHaveBeenCalled()
  })

  it('ignores j/k/number-hotkeys while a text input is focused', () => {
    document.body.innerHTML = '<input id="s" />'
    const input = document.getElementById('s') as HTMLInputElement
    input.focus()
    const onToggleCode = vi.fn()
    const { result } = renderHook(() => useCommentTreeNav({
      itemCount: 3, onToggleCode, onMarkDone: vi.fn(), onBack: vi.fn(),
    }))
    fireEvent.keyDown(input, { key: 'j' })
    fireEvent.keyDown(input, { key: '1' })
    expect(result.current.focusedIndex).toBe(0)
    expect(onToggleCode).not.toHaveBeenCalled()
  })

  it('ignores non-digit and out-of-range keys as hotkeys', () => {
    const onToggleCode = vi.fn()
    renderHook(() => useCommentTreeNav({
      itemCount: 3, onToggleCode, onMarkDone: vi.fn(), onBack: vi.fn(),
    }))
    fireEvent.keyDown(document, { key: '0' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(onToggleCode).not.toHaveBeenCalled()
  })
})
