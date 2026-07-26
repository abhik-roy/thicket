import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { server } from '../mocks/server'
import {
  useAssignmentStatus, useAssignmentStatusForPages, useCodedStatus, useCodedStatusForPages, useCreateCoder, useCoders, useThreads,
} from '../../src/api/threads'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useThreads', () => {
  it('fetches the first page and exposes next_cursor via hasNextPage', async () => {
    server.use(
      http.get('http://localhost:8000/threads', ({ request }) => {
        const params = new URL(request.url).searchParams
        expect(params.get('hydrated_only')).toBe('true')
        const cursor = params.get('cursor')
        if (!cursor) {
          return HttpResponse.json({
            items: [{
              id: 't1', subreddit: 'a', title: 'first', selftext: '',
              author: 'x', score: 1, num_comments: 0, created_utc: 0,
            }],
            next_cursor: 't1',
          })
        }
        return HttpResponse.json({ items: [], next_cursor: null })
      }),
    )
    const { result } = renderHook(() => useThreads(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages[0].items[0].id).toBe('t1')
    expect(result.current.hasNextPage).toBe(true)
  })

  it('omits the hydrated filter when metadata-only threads are requested', async () => {
    server.use(
      http.get('http://localhost:8000/threads', ({ request }) => {
        expect(new URL(request.url).searchParams.has('hydrated_only')).toBe(false)
        return HttpResponse.json({ items: [], next_cursor: null })
      }),
    )
    const { result } = renderHook(() => useThreads(undefined, false), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useCodedStatus', () => {
  it('does not fire the request when itemIds is empty', () => {
    const { result } = renderHook(
      () => useCodedStatus('a', 1, []), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches coded status for the given ids', async () => {
    server.use(
      http.get('http://localhost:8000/coders/a/coded-status', () =>
        HttpResponse.json({ t1: true, t2: false })),
    )
    const { result } = renderHook(
      () => useCodedStatus('a', 1, ['t1', 't2']), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ t1: true, t2: false })
  })
})

describe('useCodedStatusForPages', () => {
  it('merges coded-status results across multiple page chunks', async () => {
    server.use(
      http.get('http://localhost:8000/coders/a/coded-status', ({ request }) => {
        const ids = new URL(request.url).searchParams.get('item_ids')
        if (ids === 't1,t2') return HttpResponse.json({ t1: true, t2: false })
        if (ids === 't3') return HttpResponse.json({ t3: true })
        return HttpResponse.json({})
      }),
    )
    const { result } = renderHook(
      () => useCodedStatusForPages('a', 1, [['t1', 't2'], ['t3']]),
      { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({
      t1: true, t2: false, t3: true,
    }))
  })

  it('returns an empty object with no page chunks', () => {
    const { result } = renderHook(
      () => useCodedStatusForPages('a', 1, []), { wrapper })
    expect(result.current.data).toEqual({})
  })
})

describe('useAssignmentStatus', () => {
  it('does not fire the request when itemIds is empty', () => {
    const { result } = renderHook(
      () => useAssignmentStatus('a', 1, []), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches assignment status for the given ids', async () => {
    server.use(
      http.get('http://localhost:8000/coders/a/assignment-status', () =>
        HttpResponse.json({ t1: true, t2: false })),
    )
    const { result } = renderHook(
      () => useAssignmentStatus('a', 1, ['t1', 't2']), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ t1: true, t2: false })
  })
})

describe('useAssignmentStatusForPages', () => {
  it('merges assignment-status results across multiple page chunks', async () => {
    server.use(
      http.get('http://localhost:8000/coders/a/assignment-status', ({ request }) => {
        const ids = new URL(request.url).searchParams.get('item_ids')
        if (ids === 't1,t2') return HttpResponse.json({ t1: true, t2: false })
        if (ids === 't3') return HttpResponse.json({ t3: true })
        return HttpResponse.json({})
      }),
    )
    const { result } = renderHook(
      () => useAssignmentStatusForPages('a', 1, [['t1', 't2'], ['t3']]),
      { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({
      t1: true, t2: false, t3: true,
    }))
  })

  it('returns an empty object with no page chunks', () => {
    const { result } = renderHook(
      () => useAssignmentStatusForPages('a', 1, []), { wrapper })
    expect(result.current.data).toEqual({})
  })
})

describe('useCoders', () => {
  it('lists coders', async () => {
    server.use(
      http.get('http://localhost:8000/coders', () =>
        HttpResponse.json([{ id: 'a', name: 'A', created_at: 'x' }])),
    )
    const { result } = renderHook(() => useCoders(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(
      [{ id: 'a', name: 'A', created_at: 'x' }])
  })
})

describe('useCreateCoder', () => {
  it('invalidates and refetches the coders list on success', async () => {
    let coders = [{ id: 'a', name: 'A', created_at: 'x' }]
    server.use(
      http.get('http://localhost:8000/coders', () => HttpResponse.json(coders)),
      http.post('http://localhost:8000/coders', async ({ request }) => {
        const body = await request.json() as { id: string; name: string }
        const created = { ...body, created_at: 'y' }
        coders = [...coders, created]
        return HttpResponse.json(created, { status: 201 })
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

    const { result: coderList } = renderHook(() => useCoders(), { wrapper: sharedWrapper })
    await waitFor(() => expect(coderList.current.isSuccess).toBe(true))
    expect(coderList.current.data).toHaveLength(1)

    const { result: mutation } = renderHook(() => useCreateCoder(), { wrapper: sharedWrapper })
    await mutation.current.mutateAsync({ id: 'b', name: 'B' })

    await waitFor(() => expect(coderList.current.data).toHaveLength(2))
    expect(coderList.current.data).toContainEqual({ id: 'b', name: 'B', created_at: 'y' })
  })
})
