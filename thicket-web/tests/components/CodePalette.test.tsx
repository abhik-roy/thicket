import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CodePalette } from '../../src/components/CodePalette'

const CODES = [
  {
    id: 'emotional', codebook_id: 'default', parent_id: null,
    name: 'Emotional support', description: '', color: '#e91e63',
    valence: 'positive', hotkey: '1', sort_order: 0,
  },
  {
    id: 'dismissal', codebook_id: 'default', parent_id: null,
    name: 'Dismissal', description: '', color: '#d32f2f',
    valence: 'negative', hotkey: '2', sort_order: 1,
  },
]

describe('CodePalette', () => {
  it('renders every code with its hotkey and name', () => {
    render(
      <CodePalette codes={CODES} appliedCodeIds={[]} onToggleCode={vi.fn()} />,
    )
    expect(screen.getByText('Emotional support')).toBeTruthy()
    expect(screen.getByText('Dismissal')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('marks an applied code as pressed', () => {
    render(
      <CodePalette
        codes={CODES} appliedCodeIds={['emotional']} onToggleCode={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: /Emotional support/ })
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('does not mark an unapplied code as pressed', () => {
    render(
      <CodePalette
        codes={CODES} appliedCodeIds={['emotional']} onToggleCode={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: /Dismissal/ })
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onToggleCode with the clicked code id', async () => {
    const onToggleCode = vi.fn()
    render(
      <CodePalette codes={CODES} appliedCodeIds={[]} onToggleCode={onToggleCode} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Dismissal/ }))
    expect(onToggleCode).toHaveBeenCalledWith('dismissal')
  })
})
