import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { server } from '../mocks/server'
import {
  COMMENTS_LIMIT, useCodes, useComments, useCreateLabel, useDeleteLabel,
  useLabelDetailsForPages, useMarkThreadDone, useUnmarkThreadDone,
} from '../../src/api/comments'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useComments', () => {
  it('fetches the first page and exposes next_cursor via hasNextPage', async () => {
    server.use(
      http.get('http://localhost:8000/threads/t1/comments', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (!cursor) {
          return HttpResponse.json({
            items: [{
              id: 'c1', thread_id: 't1', parent_id: null, author: 'x',
              body: 'first', score: 1, controversiality: 0,
              is_submitter: 0, depth: 0, created_utc: 0,
            }],
            next_cursor: 'c1',
          })
        }
        return HttpResponse.json({ items: [], next_cursor: null })
      }),
    )
    const { result } = renderHook(() => useComments('t1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages[0].items[0].id).toBe('c1')
    expect(result.current.hasNextPage).toBe(true)
  })
})

describe('COMMENTS_LIMIT stays within the batch-endpoint id cap', () => {
  it('is at most 200 -- label-details/assignment-status reject item_ids lists over 200', () => {
    // A regression test up front, per the design spec's testing section:
    // the triage grid hit this exact bug once already (a per-page-scoped
    // batch query silently assumed to stay small until pagination was
    // actually exercised). If a full page of comments (COMMENTS_LIMIT
    // items) ever exceeds the backend's per-request cap, this fails
    // immediately instead of surfacing as a runtime 400 that silently
    // reverts every code-tint in the UI to "uncoded."
    expect(COMMENTS_LIMIT).toBeLessThanOrEqual(200)
  })

  it('a full-sized page of ids does not trip the 200-item-cap boundary', async () => {
    const ids = Array.from({ length: COMMENTS_LIMIT }, (_, i) => `c${i}`)
    let receivedIdCount = -1
    server.use(
      http.get('http://localhost:8000/coders/a/label-details', ({ request }) => {
        const itemIds = new URL(request.url).searchParams.get('item_ids') ?? ''
        receivedIdCount = itemIds.split(',').filter(Boolean).length
        return HttpResponse.json(
          Object.fromEntries(ids.map((id) => [id, []])))
      }),
    )
    const { result } = renderHook(
      () => useLabelDetailsForPages('a', 1, [ids]), { wrapper })
    await waitFor(() => expect(Object.keys(result.current.data)).toHaveLength(
      COMMENTS_LIMIT))
    expect(receivedIdCount).toBe(COMMENTS_LIMIT)
    expect(receivedIdCount).toBeLessThanOrEqual(200)
  })
})

describe('useCodes', () => {
  it('lists codes for a codebook', async () => {
    server.use(
      http.get('http://localhost:8000/codebooks/default/codes', () =>
        HttpResponse.json([{
          id: 'emotional', codebook_id: 'default', parent_id: null,
          name: 'Emotional support', description: '', color: '#e91e63',
          valence: 'positive', hotkey: '1', sort_order: 0,
        }])),
    )
    const { result } = renderHook(() => useCodes('default'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].id).toBe('emotional')
  })
})

describe('useLabelDetailsForPages', () => {
  it('merges label-details results across multiple page chunks', async () => {
    server.use(
      http.get('http://localhost:8000/coders/a/label-details', ({ request }) => {
        const ids = new URL(request.url).searchParams.get('item_ids')
        if (ids === 'c1,c2') {
          return HttpResponse.json({
            c1: [{ label_id: 'l1', code_id: 'emotional' }], c2: [],
          })
        }
        if (ids === 'c3') return HttpResponse.json({ c3: [] })
        return HttpResponse.json({})
      }),
    )
    const { result } = renderHook(
      () => useLabelDetailsForPages('a', 1, [['c1', 'c2'], ['c3']]),
      { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({
      c1: [{ label_id: 'l1', code_id: 'emotional' }], c2: [], c3: [],
    }))
  })

  it('returns an empty object with no page chunks', () => {
    const { result } = renderHook(
      () => useLabelDetailsForPages('a', 1, []), { wrapper })
    expect(result.current.data).toEqual({})
  })
})

describe('useCreateLabel', () => {
  it('invalidates label-details for the same coder/pass on success', async () => {
    let details: Record<string, { label_id: string; code_id: string }[]> =
      { c1: [] }
    server.use(
      http.get('http://localhost:8000/coders/a/label-details', () =>
        HttpResponse.json(details)),
      http.post('http://localhost:8000/labels', async ({ request }) => {
        const body = await request.json() as {
          item_id: string; code_id: string
        }
        details = { c1: [{ label_id: 'l1', code_id: body.code_id }] }
        return HttpResponse.json({
          id: 'l1', item_type: 'comment', item_id: body.item_id,
          code_id: body.code_id, coder_id: 'a', pass_no: 1, note: null,
          created_at: 'x',
        }, { status: 201 })
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    function sharedWrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )
    }
    const { result: details1 } = renderHook(
      () => useLabelDetailsForPages('a', 1, [['c1']]), { wrapper: sharedWrapper })
    await waitFor(() => expect(details1.current.data).toEqual({ c1: [] }))

    const { result: mutation } = renderHook(
      () => useCreateLabel(), { wrapper: sharedWrapper })
    await mutation.current.mutateAsync({
      itemId: 'c1', codeId: 'emotional', coderId: 'a', passNo: 1,
    })

    await waitFor(() => expect(details1.current.data).toEqual({
      c1: [{ label_id: 'l1', code_id: 'emotional' }],
    }))
  })
})

describe('useDeleteLabel', () => {
  it('calls DELETE /labels/:id', async () => {
    let deletedId: string | null = null
    server.use(
      http.delete('http://localhost:8000/labels/l1', () => {
        deletedId = 'l1'
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { result } = renderHook(() => useDeleteLabel(), { wrapper })
    await result.current.mutateAsync({ labelId: 'l1', coderId: 'a', passNo: 1 })
    expect(deletedId).toBe('l1')
  })
})

describe('useMarkThreadDone', () => {
  it('posts to /assignments with status done', async () => {
    let posted: Record<string, unknown> | null = null
    server.use(
      http.post('http://localhost:8000/assignments', async ({ request }) => {
        posted = await request.json() as Record<string, unknown>
        return HttpResponse.json({
          coder_id: 'a', item_type: 'thread', item_id: 't1', pass_no: 1,
          status: 'done',
        }, { status: 201 })
      }),
    )
    const { result } = renderHook(() => useMarkThreadDone(), { wrapper })
    await result.current.mutateAsync({ coderId: 'a', threadId: 't1', passNo: 1 })
    expect(posted).toEqual({
      coder_id: 'a', item_type: 'thread', item_id: 't1', pass_no: 1,
      status: 'done',
    })
  })
})

describe('useUnmarkThreadDone', () => {
  it('posts to /assignments with status pending', async () => {
    let posted: Record<string, unknown> | null = null
    server.use(
      http.post('http://localhost:8000/assignments', async ({ request }) => {
        posted = await request.json() as Record<string, unknown>
        return HttpResponse.json({
          coder_id: 'a', item_type: 'thread', item_id: 't1', pass_no: 1,
          status: 'pending',
        })
      }),
    )
    const { result } = renderHook(() => useUnmarkThreadDone(), { wrapper })
    await result.current.mutateAsync({ coderId: 'a', threadId: 't1', passNo: 1 })
    expect(posted).toEqual({
      coder_id: 'a', item_type: 'thread', item_id: 't1', pass_no: 1,
      status: 'pending',
    })
  })
})
