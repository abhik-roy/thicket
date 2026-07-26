import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from './mocks/server'
import App from '../src/App'

const THREADS = [
  {
    id: 't1', subreddit: 'a', title: 'Alpha post', selftext: 'alpha body',
    author: 'x', score: 1, num_comments: 1, created_utc: 1735689600,
    n_comments_fetched: 1,
    hydrated: 1,
  },
]

const COMMENTS = [
  {
    id: 'c1', thread_id: 't1', parent_id: null, author: 'op_person',
    body: 'top level comment', score: 10, controversiality: 0,
    is_submitter: 1, depth: 0, created_utc: 0,
  },
]

const CODES = [
  {
    id: 'emotional', codebook_id: 'default', parent_id: null,
    name: 'Emotional support', description: '', color: '#e91e63',
    valence: 'positive', hotkey: '1', sort_order: 0,
  },
]

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

async function pickIdentity() {
  await waitFor(() => screen.getByText('Abhik'))
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Coder' }), 'a')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('walks identity pick -> grid -> open modal -> close modal', async () => {
    server.use(
      http.get('http://localhost:8000/coders', () =>
        HttpResponse.json([{ id: 'a', name: 'Abhik', created_at: 'x' }])),
      http.get('http://localhost:8000/threads', () =>
        HttpResponse.json({ items: THREADS, next_cursor: null })),
      http.get('http://localhost:8000/coders/a/assignment-status', () =>
        HttpResponse.json({ t1: false })),
    )
    renderApp()
    await pickIdentity()

    await waitFor(() => expect(screen.getByTestId('row-t1')).toBeTruthy())

    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'Enter' })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.getByText('alpha body')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('walks the full coding journey: grid -> thread -> code -> mark done -> back, checkmark updates', async () => {
    let assignmentDone = false
    let labelDetails: Record<string, { label_id: string; code_id: string }[]> =
      { c1: [] }
    server.use(
      http.get('http://localhost:8000/coders', () =>
        HttpResponse.json([{ id: 'a', name: 'Abhik', created_at: 'x' }])),
      http.get('http://localhost:8000/threads', () =>
        HttpResponse.json({ items: THREADS, next_cursor: null })),
      http.get('http://localhost:8000/coders/a/assignment-status', ({ request }) => {
        const itemIds = new URL(request.url).searchParams.get('item_ids')
        if (itemIds === 't1') return HttpResponse.json({ t1: assignmentDone })
        return HttpResponse.json({})
      }),
      http.get('http://localhost:8000/threads/t1/comments', () =>
        HttpResponse.json({ items: COMMENTS, next_cursor: null })),
      http.get('http://localhost:8000/codebooks/default/codes', () =>
        HttpResponse.json(CODES)),
      // Stateful, matching the pattern already established in
      // tests/api/comments.test.tsx and tests/screens/ReplyTree.test.tsx --
      // a static mock here would always return an empty label list no
      // matter how the applied code is invalidated/refetched.
      http.get('http://localhost:8000/coders/a/label-details', () =>
        HttpResponse.json(labelDetails)),
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
      http.post('http://localhost:8000/assignments', () => {
        assignmentDone = true
        return HttpResponse.json({
          coder_id: 'a', item_type: 'thread', item_id: 't1', pass_no: 1,
          status: 'done',
        }, { status: 201 })
      }),
    )

    renderApp()
    await pickIdentity()

    await waitFor(() => expect(screen.getByTestId('row-t1')).toBeTruthy())
    expect(screen.getByLabelText('Not done')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())

    await userEvent.click(screen.getByRole('link', { name: /Open thread/ }))

    await waitFor(() => expect(screen.getByTestId('comment-c1')).toBeTruthy())
    await userEvent.click(screen.getByTestId('comment-c1'))
    fireEvent.keyDown(document, { key: '1' })
    await waitFor(() => expect(screen.getByTestId('comment-c1').textContent)
      .toContain('Emotional support'))

    fireEvent.keyDown(document, { key: 'Enter' })

    await waitFor(() =>
      expect(screen.getByLabelText('Done')).toBeTruthy())
  })
})
