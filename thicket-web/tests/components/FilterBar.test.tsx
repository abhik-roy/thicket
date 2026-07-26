import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilterBar, type FilterBarProps } from '../../src/components/FilterBar'

function renderFilterBar(overrides: Partial<FilterBarProps> = {}) {
  const props: FilterBarProps = {
    subreddit: '', onSubredditChange: vi.fn(),
    year: '', onYearChange: vi.fn(),
    minComments: 0, onMinCommentsChange: vi.fn(),
    uncodedOnly: false, onUncodedOnlyChange: vi.fn(),
    hydratedOnly: true, onHydratedOnlyChange: vi.fn(),
    search: '', onSearchChange: vi.fn(),
    searchInputRef: createRef<HTMLInputElement>(),
    ...overrides,
  }
  render(<FilterBar {...props} />)
  return props
}

describe('FilterBar', () => {
  it('reports subreddit changes', async () => {
    const props = renderFilterBar()
    await userEvent.type(screen.getByRole('textbox', { name: 'Subreddit' }), 'x')
    expect(props.onSubredditChange).toHaveBeenCalled()
  })

  it('reports the uncoded-only checkbox toggling', async () => {
    const props = renderFilterBar()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Uncoded only' }))
    expect(props.onUncodedOnlyChange).toHaveBeenCalledWith(true)
  })

  it('reports the hydrated-comments-only checkbox toggling', async () => {
    const props = renderFilterBar()
    await userEvent.click(screen.getByRole('checkbox', {
      name: 'Hydrated comments only',
    }))
    expect(props.onHydratedOnlyChange).toHaveBeenCalledWith(false)
  })

  it('reports min-comments changes as a number', async () => {
    const props = renderFilterBar()
    const input = screen.getByRole('spinbutton', { name: 'Min comments' })
    await userEvent.clear(input)
    await userEvent.type(input, '5')
    expect(props.onMinCommentsChange).toHaveBeenLastCalledWith(5)
  })

  it('attaches the forwarded ref to the search input', () => {
    const ref = createRef<HTMLInputElement>()
    renderFilterBar({ searchInputRef: ref })
    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Search' }))
  })
})
