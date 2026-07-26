import {
  useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient,
} from '@tanstack/react-query'
import { apiFetch } from './client'

export interface Thread {
  id: string
  subreddit: string
  title: string
  selftext: string
  author: string
  score: number
  num_comments: number
  created_utc: number
  hydrated: number
  // Reddit's OWN comment count (num_comments above) can be nonzero while
  // this thread was never hydrated by the scraper -- n_comments_fetched
  // is how many comment rows actually exist in our DB for it, and is
  // what determines whether it's actually codeable.
  n_comments_fetched: number
}

export interface ThreadsPage {
  items: Thread[]
  next_cursor: string | null
}

export interface Community {
  name: string
  thread_count: number
}

export function useCommunities() {
  return useQuery({
    queryKey: ['communities'],
    queryFn: () => apiFetch<{ items: Community[] }>('/communities'),
  })
}

export interface Coder {
  id: string
  name: string
  created_at: string
}

const THREADS_LIMIT = 100

export function useThreads(subreddit?: string, hydratedOnly = true) {
  return useInfiniteQuery({
    queryKey: ['threads', subreddit ?? null, hydratedOnly],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(THREADS_LIMIT) })
      if (hydratedOnly) params.set('hydrated_only', 'true')
      if (pageParam) params.set('cursor', pageParam)
      if (subreddit) params.set('subreddit', subreddit)
      return apiFetch<ThreadsPage>(`/threads?${params.toString()}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  })
}

export function useCodedStatus(
  coderId: string, passNo: number, itemIds: string[],
) {
  return useQuery({
    queryKey: ['coded-status', coderId, passNo, itemIds],
    queryFn: () => {
      const params = new URLSearchParams({
        pass_no: String(passNo),
        item_type: 'thread',
        item_ids: itemIds.join(','),
      })
      return apiFetch<Record<string, boolean>>(
        `/coders/${coderId}/coded-status?${params.toString()}`)
    },
    enabled: itemIds.length > 0,
  })
}

export function useCodedStatusForPages(
  coderId: string, passNo: number, pageIdChunks: string[][],
) {
  return useQueries({
    queries: pageIdChunks.map((ids) => ({
      queryKey: ['coded-status', coderId, passNo, ids],
      queryFn: () => {
        const params = new URLSearchParams({
          pass_no: String(passNo),
          item_type: 'thread',
          item_ids: ids.join(','),
        })
        return apiFetch<Record<string, boolean>>(
          `/coders/${coderId}/coded-status?${params.toString()}`)
      },
      enabled: ids.length > 0,
    })),
    combine: (results) => ({
      data: results.reduce<Record<string, boolean>>((acc, r) => {
        if (r.data) Object.assign(acc, r.data)
        return acc
      }, {}),
      isError: results.some((r) => r.isError),
    }),
  })
}

export function useAssignmentStatus(
  coderId: string, passNo: number, itemIds: string[],
) {
  return useQuery({
    queryKey: ['assignment-status', coderId, passNo, itemIds],
    queryFn: () => {
      const params = new URLSearchParams({
        pass_no: String(passNo),
        item_type: 'thread',
        item_ids: itemIds.join(','),
      })
      return apiFetch<Record<string, boolean>>(
        `/coders/${coderId}/assignment-status?${params.toString()}`)
    },
    enabled: itemIds.length > 0,
  })
}

export function useAssignmentStatusForPages(
  coderId: string, passNo: number, pageIdChunks: string[][],
) {
  return useQueries({
    queries: pageIdChunks.map((ids) => ({
      queryKey: ['assignment-status', coderId, passNo, ids],
      queryFn: () => {
        const params = new URLSearchParams({
          pass_no: String(passNo),
          item_type: 'thread',
          item_ids: ids.join(','),
        })
        return apiFetch<Record<string, boolean>>(
          `/coders/${coderId}/assignment-status?${params.toString()}`)
      },
      enabled: ids.length > 0,
    })),
    combine: (results) => ({
      data: results.reduce<Record<string, boolean>>((acc, r) => {
        if (r.data) Object.assign(acc, r.data)
        return acc
      }, {}),
      isError: results.some((r) => r.isError),
    }),
  })
}

export function useCoders() {
  return useQuery({
    queryKey: ['coders'],
    queryFn: () => apiFetch<Coder[]>('/coders'),
  })
}

export function useCreateCoder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (coder: { id: string; name: string }) =>
      apiFetch<Coder>('/coders', {
        method: 'POST',
        body: JSON.stringify(coder),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coders'] }),
  })
}

export interface ArcticImportResult {
  matched: number
  stored: number
  hydrated: number
  comments: number
  thread_ids: string[]
}

export function useArcticImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: {
      subreddit: string
      query: string
      limit: number
      hydrate: boolean
    }) => apiFetch<ArcticImportResult>('/imports/arctic-shift', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['threads'] }),
  })
}
