import {
  useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient,
} from '@tanstack/react-query'
import { apiFetch } from './client'

export interface Comment {
  id: string
  thread_id: string
  parent_id: string | null
  author: string
  body: string
  score: number
  controversiality: number
  is_submitter: number
  depth: number
  created_utc: number
}

export interface CommentsPage {
  items: Comment[]
  next_cursor: string | null
}

// Must stay at or under 200 -- label-details (and every other batch
// endpoint) rejects item_ids lists longer than 200, and useLabelDetailsForPages
// chunks by page, so a page this size or larger would send an
// over-the-cap request the moment a thread has this many top-level +
// nested comments in one page. Exported so this invariant has a direct
// regression test (see tests/api/comments.test.tsx).
export const COMMENTS_LIMIT = 200

export function useComments(threadId: string) {
  return useInfiniteQuery({
    queryKey: ['comments', threadId],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(COMMENTS_LIMIT) })
      if (pageParam) params.set('cursor', pageParam)
      return apiFetch<CommentsPage>(
        `/threads/${threadId}/comments?${params.toString()}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  })
}

export interface Code {
  id: string
  codebook_id: string
  parent_id: string | null
  name: string
  description: string | null
  color: string
  valence: string | null
  hotkey: string | null
  sort_order: number
}

export function useCodes(codebookId: string) {
  return useQuery({
    queryKey: ['codes', codebookId],
    queryFn: () => apiFetch<Code[]>(`/codebooks/${codebookId}/codes`),
  })
}

export interface AppliedLabel {
  label_id: string
  code_id: string
}

export function useLabelDetailsForPages(
  coderId: string, passNo: number, pageIdChunks: string[][],
) {
  return useQueries({
    queries: pageIdChunks.map((ids) => ({
      queryKey: ['label-details', coderId, passNo, ids],
      queryFn: () => {
        const params = new URLSearchParams({
          pass_no: String(passNo),
          item_type: 'comment',
          item_ids: ids.join(','),
        })
        return apiFetch<Record<string, AppliedLabel[]>>(
          `/coders/${coderId}/label-details?${params.toString()}`)
      },
      enabled: ids.length > 0,
    })),
    combine: (results) => ({
      data: results.reduce<Record<string, AppliedLabel[]>>((acc, r) => {
        if (r.data) Object.assign(acc, r.data)
        return acc
      }, {}),
      isError: results.some((r) => r.isError),
    }),
  })
}

export interface Label {
  id: string
  item_type: string
  item_id: string
  code_id: string
  coder_id: string
  pass_no: number
  note: string | null
  created_at: string
}

export function useCreateLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: {
      itemId: string; codeId: string; coderId: string; passNo: number
    }) =>
      apiFetch<Label>('/labels', {
        method: 'POST',
        body: JSON.stringify({
          item_type: 'comment',
          item_id: label.itemId,
          code_id: label.codeId,
          coder_id: label.coderId,
          pass_no: label.passNo,
        }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['label-details', variables.coderId, variables.passNo],
      })
    },
  })
}

export function useDeleteLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: { labelId: string; coderId: string; passNo: number }) =>
      apiFetch<void>(`/labels/${label.labelId}`, { method: 'DELETE' }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['label-details', variables.coderId, variables.passNo],
      })
    },
  })
}

function useSetThreadCompletion(status: 'done' | 'pending') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assignment: {
      coderId: string; threadId: string; passNo: number
    }) =>
      apiFetch<{ status: string }>('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          coder_id: assignment.coderId,
          item_type: 'thread',
          item_id: assignment.threadId,
          pass_no: assignment.passNo,
          status,
        }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['assignment-status', variables.coderId, variables.passNo],
      })
    },
  })
}

export function useMarkThreadDone() {
  return useSetThreadCompletion('done')
}

export function useUnmarkThreadDone() {
  return useSetThreadCompletion('pending')
}
