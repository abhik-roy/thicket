import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { server } from '../mocks/server'
import { ReplyTree } from '../../src/screens/ReplyTree'

const COMMENTS = [
  {
    id: 'c1', thread_id: 't1', parent_id: null, author: 'op_person',
    body: 'top level comment\nhidden detail', score: 10, controversiality: 0,
    is_submitter: 1, depth: 0, created_utc: 0,
  },
  {
    id: 'c2', thread_id: 't1', parent_id: 'c1', author: 'someone',
    body: 'a reply', score: 3, controversiality: 0,
    is_submitter: 0, depth: 1, created_utc: 1,
  },
]

const CODES = [
  {
    id: 'emotional', codebook_id: 'default', parent_id: null,
    name: 'Emotional support', description: '', color: '#e91e63',
    valence: 'positive', hotkey: '1', sort_order: 0,
  },
]

function setup() {
  let labelDetails: Record<string, { label_id: string; code_id: string }[]> =
    { c1: [], c2: [] }
  server.use(
    http.get('http://localhost:8000/threads/t1/comments', () =>
      HttpResponse.json({ items: COMMENTS, next_cursor: null })),
    http.get('http://localhost:8000/codebooks/default/codes', () =>
      HttpResponse.json(CODES)),
    http.get('http://localhost:8000/coders/a/label-details', () =>
      HttpResponse.json(labelDetails)),
    http.get('http://localhost:8000/coders/a/assignment-status', () =>
      HttpResponse.json({ t1: false })),
    http.get('http://localhost:8000/open-coding/segments', () =>
      HttpResponse.json([])),
    http.get('http://localhost:8000/open-coding/themes', () =>
      HttpResponse.json([])),
    http.post('http://localhost:8000/labels', async ({ request }) => {
      const body = await request.json() as { item_id: string; code_id: string }
      const labelId = `label-${body.item_id}-${body.code_id}`
      labelDetails = {
        ...labelDetails,
        [body.item_id]: [
          ...(labelDetails[body.item_id] ?? []),
          { label_id: labelId, code_id: body.code_id },
        ],
      }
      return HttpResponse.json({
        id: labelId, item_type: 'comment', item_id: body.item_id,
        code_id: body.code_id, coder_id: 'a', pass_no: 1, note: null,
        created_at: 'x',
      }, { status: 201 })
    }),
    http.post('http://localhost:8000/assignments', () =>
      HttpResponse.json({
        coder_id: 'a', item_type: 'thread', item_id: 't1', pass_no: 1,
        status: 'done',
      }, { status: 201 })),
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/thread/t1']}>
        <Routes>
          <Route
            path="/thread/:threadId"
            element={<ReplyTree coderId="a" passNo={1} codebookId="default" />}
          />
          <Route path="/" element={<p>grid screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ReplyTree', () => {
  it('defaults to chronological full text and can open the compact tree map', async () => {
    setup()
    expect(await screen.findByTestId('comment-c1')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Tree map' }))
    const node = await screen.findByTestId('map-node-c1')
    expect(screen.getByTestId('conversation-map')).toBeTruthy()
    expect(node.textContent).toContain('top level comment')
    expect(node.textContent).not.toContain('hidden detail')

    await userEvent.click(node)

    const dialog = screen.getByRole('dialog', { name: 'Full comment' })
    expect(dialog.textContent).toContain('top level comment')
    expect(dialog.textContent).toContain('hidden detail')
    expect(dialog.textContent).toContain('Color code this comment')
    await userEvent.click(screen.getByRole(
      'button', { name: /Emotional support/ }))
    await waitFor(() => expect(
      screen.getByTestId('map-node-c1').getAttribute('style'),
    ).toContain('border-left-color'))
  })

  it('renders comments in tree order with the OP badge', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('comment-c1')).toBeTruthy())
    expect(screen.getByTestId('comment-c1').textContent).toContain('OP')
    expect(screen.getByText('a reply')).toBeTruthy()
  })

  it('applies a code by clicking it in the palette', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('comment-c1')).toBeTruthy())
    await userEvent.click(screen.getByTestId('comment-c1'))
    await userEvent.click(screen.getByRole('button', { name: /Emotional support/ }))
    await waitFor(() => expect(screen.getByTestId('comment-c1').textContent)
      .toContain('Emotional support'))
  })

  it('applies a code via its number hotkey on the focused comment', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('comment-c1')).toBeTruthy())
    await userEvent.click(screen.getByTestId('comment-c1'))
    fireEvent.keyDown(document, { key: '1' })
    await waitFor(() => expect(screen.getByTestId('comment-c1').textContent)
      .toContain('Emotional support'))
  })

  it('marks the thread done and navigates back to the grid on Enter', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('comment-c1')).toBeTruthy())
    fireEvent.keyDown(document, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('grid screen')).toBeTruthy())
  })

  it('navigates back to the grid on Escape without marking done', async () => {
    let assignmentPosted = false
    server.use(
      http.post('http://localhost:8000/assignments', () => {
        assignmentPosted = true
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    setup()
    await waitFor(() => expect(screen.getByTestId('comment-c1')).toBeTruthy())
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.getByText('grid screen')).toBeTruthy())
    expect(assignmentPosted).toBe(false)
  })

  it('filters to only coded comments when the toggle is checked', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('comment-c1')).toBeTruthy())
    await userEvent.click(screen.getByTestId('comment-c1'))
    fireEvent.keyDown(document, { key: '1' })
    await waitFor(() => expect(screen.getByTestId('comment-c1').textContent)
      .toContain('Emotional support'))

    await userEvent.click(
      screen.getByRole('checkbox', { name: /Show only coded comments/ }))
    await waitFor(() => expect(screen.queryByTestId('comment-c2')).toBeNull())
    expect(screen.getByTestId('comment-c1')).toBeTruthy()
  })

  it('fetches the next page of comments once loaded rows are in view', async () => {
    let fetchCount = 0
    server.use(
      http.get('http://localhost:8000/threads/t1/comments', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        fetchCount += 1
        if (!cursor) {
          return HttpResponse.json({ items: [COMMENTS[0]], next_cursor: 'c1' })
        }
        return HttpResponse.json({ items: [COMMENTS[1]], next_cursor: null })
      }),
      http.get('http://localhost:8000/codebooks/default/codes', () =>
        HttpResponse.json(CODES)),
      http.get('http://localhost:8000/coders/a/label-details', () =>
        HttpResponse.json({})),
      http.get('http://localhost:8000/coders/a/assignment-status', () =>
        HttpResponse.json({ t1: false })),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/thread/t1']}>
          <Routes>
            <Route
              path="/thread/:threadId"
              element={<ReplyTree coderId="a" passNo={1} codebookId="default" />}
            />
            <Route path="/" element={<p>grid screen</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('comment-c2')).toBeTruthy())
    expect(fetchCount).toBeGreaterThanOrEqual(2)
  })

  it('shows an empty-state message for a thread with no scraped comments', async () => {
    server.use(
      http.get('http://localhost:8000/threads/t1/comments', () =>
        HttpResponse.json({ items: [], next_cursor: null })),
      http.get('http://localhost:8000/codebooks/default/codes', () =>
        HttpResponse.json(CODES)),
      http.get('http://localhost:8000/coders/a/label-details', () =>
        HttpResponse.json({})),
      http.get('http://localhost:8000/coders/a/assignment-status', () =>
        HttpResponse.json({ t1: false })),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/thread/t1']}>
          <Routes>
            <Route
              path="/thread/:threadId"
              element={<ReplyTree coderId="a" passNo={1} codebookId="default" />}
            />
            <Route path="/" element={<p>grid screen</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(
      screen.getByText('No comments have been scraped for this thread yet.'),
    ).toBeTruthy())
    // Virtualized comment rows carry data-index; the container itself
    // (data-testid="comment-tree") doesn't, so this is unambiguous.
    expect(document.querySelectorAll('[data-index]')).toHaveLength(0)
  })
})
