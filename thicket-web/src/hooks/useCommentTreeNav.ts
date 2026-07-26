import { useEffect, useState } from 'react'

export interface UseCommentTreeNavOptions {
  itemCount: number
  onToggleCode: (focusedIndex: number, hotkey: string) => void
  onMarkDone: () => void
  onBack: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function useCommentTreeNav({
  itemCount, onToggleCode, onMarkDone, onBack,
}: UseCommentTreeNavOptions) {
  const [focusedIndex, setFocusedIndex] = useState(0)

  useEffect(() => {
    setFocusedIndex((index) => Math.min(index, Math.max(itemCount - 1, 0)))
  }, [itemCount])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Escape always navigates back, regardless of focus location -- the
      // same rule already established for the triage grid's useKeyboardNav.
      if (e.key === 'Escape') {
        onBack()
        return
      }
      if (isTypingTarget(e.target)) return
      if (e.key === 'j') {
        setFocusedIndex((i) => Math.min(i + 1, Math.max(itemCount - 1, 0)))
      } else if (e.key === 'k') {
        setFocusedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        onMarkDone()
      } else if (/^[1-9]$/.test(e.key)) {
        onToggleCode(focusedIndex, e.key)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [itemCount, focusedIndex, onToggleCode, onMarkDone, onBack])

  return { focusedIndex, setFocusedIndex }
}
