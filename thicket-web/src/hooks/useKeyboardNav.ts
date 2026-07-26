import { useEffect, useState } from 'react'

export interface UseKeyboardNavOptions {
  itemCount: number
  onOpen: (index: number) => void
  onClose: () => void
  onFocusSearch: () => void
  enabled?: boolean
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function useKeyboardNav({
  itemCount, onOpen, onClose, onFocusSearch, enabled = true,
}: UseKeyboardNavOptions) {
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  useEffect(() => {
    setHighlightedIndex((index) => Math.min(
      index, Math.max(itemCount - 1, 0)))
  }, [itemCount])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Escape always closes, regardless of `enabled` or focus location --
      // it's the one key whose entire job is to get OUT of a state that
      // may itself be why nav is currently disabled (e.g. a modal is open).
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (!enabled) return
      if (isTypingTarget(e.target)) return
      if (e.key === 'j') {
        setHighlightedIndex(
          (i) => Math.min(i + 1, Math.max(itemCount - 1, 0)))
      } else if (e.key === 'k') {
        setHighlightedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        onOpen(highlightedIndex)
      } else if (e.key === '/') {
        e.preventDefault()
        onFocusSearch()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, itemCount, highlightedIndex, onOpen, onClose, onFocusSearch])

  return { highlightedIndex, setHighlightedIndex }
}
