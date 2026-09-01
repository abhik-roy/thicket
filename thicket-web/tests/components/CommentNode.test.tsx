import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CommentNode } from '../../src/components/CommentNode'

const COMMENT = {
  id: 'c1', thread_id: 't1', parent_id: null, author: 'ser_davos33',
  body: 'this really helped me feel less alone', score: 12,
  controversiality: 0, is_submitter: 0, depth: 1, created_utc: 0,
}

const CODES_BY_ID = {
  emotional: {
    id: 'emotional', codebook_id: 'default', parent_id: null,
    name: 'Emotional support', description: '', color: '#e91e63',
    valence: 'positive', hotkey: '1', sort_order: 0,
  },
}

describe('CommentNode', () => {
  it('renders the author and body', () => {
    render(
      <CommentNode
        comment={COMMENT} appliedCodeIds={[]} codesById={CODES_BY_ID}
        focused={false} onFocus={vi.fn()}
      />,
    )
    expect(screen.getByText('u/ser_davos33')).toBeTruthy()
    expect(screen.getByText('this really helped me feel less alone')).toBeTruthy()
  })

  it('shows an OP badge only when is_submitter is 1', () => {
    render(
      <CommentNode
        comment={{ ...COMMENT, is_submitter: 1 }} appliedCodeIds={[]}
        codesById={CODES_BY_ID} focused={false} onFocus={vi.fn()}
      />,
    )
    expect(screen.getByText('OP')).toBeTruthy()
  })

  it('does not show an OP badge when is_submitter is 0', () => {
    render(
      <CommentNode
        comment={COMMENT} appliedCodeIds={[]} codesById={CODES_BY_ID}
        focused={false} onFocus={vi.fn()}
      />,
    )
    expect(screen.queryByText('OP')).toBeNull()
  })

  it('shows a chip for each applied code', () => {
    render(
      <CommentNode
        comment={COMMENT} appliedCodeIds={['emotional']}
        codesById={CODES_BY_ID} focused={false} onFocus={vi.fn()}
      />,
    )
    expect(screen.getByText('Emotional support')).toBeTruthy()
  })

  it('calls onFocus when clicked', async () => {
    const onFocus = vi.fn()
    render(
      <CommentNode
        comment={COMMENT} appliedCodeIds={[]} codesById={CODES_BY_ID}
        focused={false} onFocus={onFocus}
      />,
    )
    await userEvent.click(screen.getByTestId('comment-c1'))
    expect(onFocus).toHaveBeenCalled()
  })

  it('shows segment codes as colored pills in the highlight hover bubble', async () => {
    render(<CommentNode comment={COMMENT} appliedCodeIds={[]}
      codesById={CODES_BY_ID} focused={false} onFocus={vi.fn()}
      segments={[{
        id: 's1', item_type: 'comment', item_id: 'c1', thread_id: 't1',
        coder_id: 'a', pass_no: 1, start_offset: 5, end_offset: 11,
        selected_text: 'really', context_text: COMMENT.body, memo: '',
        status: 'coded', created_at: 'x', updated_at: 'x', author: 'alice',
        created_utc: 1, permalink: null, themes: [],
        codes: [{ ...CODES_BY_ID.emotional }],
      }]} />)
    const highlight = document.querySelector('[data-evidence-codes]')
    expect(highlight?.getAttribute('data-evidence-codes')).toBe('Emotional support')
    expect(highlight?.textContent).toBe('really')
    await userEvent.hover(highlight as Element)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Codes for this selection')
    expect(screen.getByText('Emotional support', { selector: '[role="tooltip"] span' }))
      .toHaveStyle({ backgroundColor: CODES_BY_ID.emotional.color })
  })
})
