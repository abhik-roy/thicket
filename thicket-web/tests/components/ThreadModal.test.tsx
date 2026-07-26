import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ThreadModal, type ThreadModalProps } from '../../src/components/ThreadModal'

const THREAD = {
  id: 't1', subreddit: 'ExperiencedDevs', title: 'A title',
  selftext: 'body text', author: 'ser_davos33', score: 4752,
  num_comments: 1118, created_utc: 1735689600, n_comments_fetched: 1118,
  hydrated: 1,
}

function renderModal(overrides: Partial<ThreadModalProps> = {}) {
  const props: ThreadModalProps = {
    thread: THREAD, codedByMe: true, onClose: vi.fn(), ...overrides,
  }
  return render(<MemoryRouter><ThreadModal {...props} /></MemoryRouter>)
}

describe('ThreadModal', () => {
  it('shows the full OP text and stats, no comments list', () => {
    renderModal()
    expect(screen.getByText('body text')).toBeTruthy()
    expect(screen.getByText('4752')).toBeTruthy()
    expect(screen.getAllByText('1118')).toHaveLength(2)
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('shows the coded-by-me badge only when true', () => {
    renderModal({ codedByMe: false })
    expect(screen.getByText('Not yet coded')).toBeTruthy()
  })

  it('allows a completed thread to be unmarked', async () => {
    const onUnmarkDone = vi.fn()
    renderModal({ onUnmarkDone })
    await userEvent.click(screen.getByRole('button', { name: 'Unmark done' }))
    expect(onUnmarkDone).toHaveBeenCalledOnce()
  })

  it('the Open thread link points at the thread route', () => {
    renderModal()
    const link = screen.getByRole('link', { name: /Open thread/ })
    expect(link.getAttribute('href')).toBe('/thread/t1')
  })

  it('explains and disables opening an unhydrated thread', () => {
    renderModal({
      thread: { ...THREAD, hydrated: 0, n_comments_fetched: 0 },
    })
    expect(screen.getByRole('status').textContent).toContain('not been hydrated')
    expect(screen.queryByRole('link', { name: /Open thread/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reply tree unavailable' }))
      .toBeDisabled()
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Close (Esc)' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('expands and restores the preview', async () => {
    renderModal()
    await userEvent.click(screen.getByRole('button', { name: 'Expand preview' }))
    expect(screen.getByRole('button', { name: 'Restore preview size' })).toBeTruthy()
  })
})
