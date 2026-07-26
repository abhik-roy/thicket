import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../mocks/server'
import { TriageGrid, type TriageGridProps } from '../../src/components/TriageGrid'

const THREADS = [
  {
    id: 't1', subreddit: 'a', title: 'Alpha post', selftext: '',
    author: 'x', score: 1, num_comments: 50, created_utc: 1735689600, // 2025-01-01
    n_comments_fetched: 50, hydrated: 1,
  },
  {
    id: 't2', subreddit: 'b', title: 'Beta post', selftext: '',
    author: 'y', score: 1, num_comments: 5, created_utc: 1767225600, // 2026-01-01
    n_comments_fetched: 5, hydrated: 1,
  },
]

function setup(overrides: Partial<TriageGridProps> = {}) {
  server.use(
    http.get('http://localhost:8000/threads', () =>
      HttpResponse.json({ items: THREADS, next_cursor: null })),
    http.get('http://localhost:8000/coders/a/assignment-status', () =>
      HttpResponse.json({ t1: true, t2: false })),
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onOpenThread = vi.fn()
  const props: TriageGridProps = {
    coderId: 'a', passNo: 1, subreddit: '', year: '', minComments: 0,
    uncodedOnly: false, hydratedOnly: true, search: '', searchInputRef: createRef(),
    onOpenThread, onEscape: vi.fn(), modalOpen: false,
    ...overrides,
  }
  render(
    <QueryClientProvider client={queryClient}>
      <TriageGrid {...props} />
    </QueryClientProvider>,
  )
  return { onOpenThread }
}

describe('TriageGrid', () => {
  it('renders both threads with their coded status', async () => {
    setup()
    await waitFor(() =>
      expect(screen.getByLabelText('Done')).toBeTruthy())
    expect(screen.getByLabelText('Not done')).toBeTruthy()
  })

  it('shows a "no comments" marker for a thread with zero scraped comments', async () => {
    server.use(
      http.get('http://localhost:8000/threads', () =>
        HttpResponse.json({
          items: [{
            id: 't3', subreddit: 'a', title: 'Unhydrated post', selftext: '',
            author: 'z', score: 1, num_comments: 167, created_utc: 1735689600,
            n_comments_fetched: 0, hydrated: 0,
          }],
          next_cursor: null,
        })),
      http.get('http://localhost:8000/coders/a/assignment-status', () =>
        HttpResponse.json({ t3: false })),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <TriageGrid
          coderId="a" passNo={1} subreddit="" year="" minComments={0}
          uncodedOnly={false} hydratedOnly={false} search="" searchInputRef={createRef()}
          onOpenThread={vi.fn()} onEscape={vi.fn()} modalOpen={false}
        />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('row-t3')).toBeTruthy())
    expect(screen.getByTestId('row-t3').textContent).toContain('no comments')
    expect(screen.getByTestId('row-t3').textContent).not.toContain('167')
  })

  it('filters out rows below min comments', async () => {
    setup({ minComments: 10 })
    await waitFor(() => expect(screen.getByTestId('row-t1')).toBeTruthy())
    expect(screen.queryByTestId('row-t2')).toBeNull()
  })

  it('filters to uncoded only', async () => {
    setup({ uncodedOnly: true })
    // t2 renders as soon as threads load (before coded-status resolves,
    // both threads render transiently); only once coded-status resolves
    // does t1 get filtered out, settling at exactly one row. Waiting on
    // "row-t1 is absent" alone is a false positive: it's ALSO true on the
    // very first render, before anything has loaded.
    await waitFor(() =>
      expect(screen.queryAllByTestId(/^row-/)).toHaveLength(1))
    expect(screen.getByTestId('row-t2')).toBeTruthy()
    expect(screen.queryByTestId('row-t1')).toBeNull()
  })

  it('filters by year', async () => {
    setup({ year: '2025' })
    await waitFor(() => expect(screen.getByTestId('row-t1')).toBeTruthy())
    expect(screen.queryByTestId('row-t2')).toBeNull()
  })

  it('opens a thread on Enter after moving the highlight with j', async () => {
    const { onOpenThread } = setup()
    await waitFor(() => expect(screen.getByTestId('row-t1')).toBeTruthy())
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onOpenThread).toHaveBeenCalledWith(THREADS[1])
  })

  it('fetches the next page once all currently-loaded rows are in view', async () => {
    let fetchCount = 0
    server.use(
      http.get('http://localhost:8000/threads', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        fetchCount += 1
        if (!cursor) {
          return HttpResponse.json({ items: [THREADS[0]], next_cursor: 't1' })
        }
        return HttpResponse.json({ items: [THREADS[1]], next_cursor: null })
      }),
      http.get('http://localhost:8000/coders/a/assignment-status', () =>
        HttpResponse.json({})),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <TriageGrid
          coderId="a" passNo={1} subreddit="" year="" minComments={0}
          uncodedOnly={false} hydratedOnly={true} search="" searchInputRef={createRef()}
          onOpenThread={vi.fn()} onEscape={vi.fn()} modalOpen={false}
        />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('row-t2')).toBeTruthy())
    expect(fetchCount).toBeGreaterThanOrEqual(2)
  })

  it('shows an error banner when coded-status fails', async () => {
    server.use(
      http.get('http://localhost:8000/threads', () =>
        HttpResponse.json({ items: THREADS, next_cursor: null })),
      http.get('http://localhost:8000/coders/a/assignment-status', () =>
        HttpResponse.json({ detail: 'error' }, { status: 500 })),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <TriageGrid
          coderId="a" passNo={1} subreddit="" year="" minComments={0}
          uncodedOnly={false} hydratedOnly={true} search="" searchInputRef={createRef()}
          onOpenThread={vi.fn()} onEscape={vi.fn()} modalOpen={false}
        />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
})
