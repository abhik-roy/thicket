import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { Code } from './comments'

export type SegmentStatus =
  | 'captured' | 'coded' | 'uncertain' | 'excluded' | 'negative_case'

export interface EvidenceSegment {
  id: string
  item_type: 'comment' | 'thread'
  item_id: string
  thread_id: string
  coder_id: string
  pass_no: number
  start_offset: number
  end_offset: number
  selected_text: string
  context_text: string
  memo: string
  status: SegmentStatus
  created_at: string
  updated_at: string
  author: string | null
  created_utc: number | null
  permalink: string | null
  codes: Code[]
  themes: Pick<Theme, 'id' | 'name' | 'memo' | 'color' | 'status'>[]
  created_code_id?: string | null
}

export interface SelectionDraft {
  itemId: string
  startOffset: number
  endOffset: number
  selectedText: string
}

export interface CaptureInput {
  item_type: 'comment'
  item_id: string
  coder_id: string
  pass_no: number
  start_offset: number
  end_offset: number
  selected_text: string
  memo: string
  status: SegmentStatus
  codebook_id: string
  code_ids: string[]
  new_code?: { name: string; description: string; color: string }
}

export function useSegments(coderId: string, passNo: number, threadId?: string) {
  return useQuery({
    queryKey: ['open-coding', 'segments', coderId, passNo, threadId],
    queryFn: () => {
      const params = new URLSearchParams({
        coder_id: coderId, pass_no: String(passNo),
      })
      if (threadId) params.set('thread_id', threadId)
      return apiFetch<EvidenceSegment[]>(
        `/open-coding/segments?${params.toString()}`)
    },
    enabled: Boolean(coderId),
  })
}

function invalidateOpenCoding(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ['open-coding'] })
}

export function useCaptureSegment(codebookId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CaptureInput) =>
      apiFetch<EvidenceSegment>('/open-coding/capture', {
        method: 'POST', body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateOpenCoding(client)
      client.invalidateQueries({ queryKey: ['codes', codebookId] })
      client.invalidateQueries({ queryKey: ['codebooks'] })
    },
  })
}

export function useDeleteSegment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(
      `/open-coding/segments/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateOpenCoding(client),
  })
}

export function useUpdateSegment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, memo, status }: {
      id: string; memo: string; status: SegmentStatus
    }) => apiFetch<EvidenceSegment>(`/open-coding/segments/${id}`, {
      method: 'PUT', body: JSON.stringify({ memo, status }),
    }),
    onSuccess: () => invalidateOpenCoding(client),
  })
}

export function useAddSegmentCode() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ segmentId, codeId }: { segmentId: string; codeId: string }) =>
      apiFetch<EvidenceSegment>(
        `/open-coding/segments/${segmentId}/codes/${codeId}`, { method: 'PUT' }),
    onSuccess: () => invalidateOpenCoding(client),
  })
}

export function useRemoveSegmentCode() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ segmentId, codeId }: { segmentId: string; codeId: string }) =>
      apiFetch<void>(
        `/open-coding/segments/${segmentId}/codes/${codeId}`, { method: 'DELETE' }),
    onSuccess: () => invalidateOpenCoding(client),
  })
}

export function useToggleSegmentTheme() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ segmentId, themeId, linked }: {
      segmentId: string; themeId: string; linked: boolean
    }) => apiFetch<EvidenceSegment | void>(
      `/open-coding/segments/${segmentId}/themes/${themeId}`,
      { method: linked ? 'DELETE' : 'PUT' }),
    onSuccess: () => invalidateOpenCoding(client),
  })
}

export type ThemeStatus = 'candidate' | 'reviewing' | 'retained' | 'rejected'

export interface Theme {
  id: string
  codebook_id: string
  name: string
  memo: string
  color: string
  status: ThemeStatus
  created_at: string
  updated_at: string
  codes: (Code & { segment_count: number })[]
}

export interface ThemeInput {
  name: string
  memo: string
  color: string
  status: ThemeStatus
}

export function useThemes(codebookId: string) {
  return useQuery({
    queryKey: ['open-coding', 'themes', codebookId],
    queryFn: () => apiFetch<Theme[]>(
      `/open-coding/themes?codebook_id=${encodeURIComponent(codebookId)}`),
    enabled: Boolean(codebookId),
  })
}

export function useCreateTheme(codebookId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: ThemeInput) => apiFetch<Theme>(
      `/open-coding/themes?codebook_id=${encodeURIComponent(codebookId)}`,
      { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidateOpenCoding(client),
  })
}

export function useUpdateTheme() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: ThemeInput & { id: string }) =>
      apiFetch<Theme>(`/open-coding/themes/${id}`, {
        method: 'PUT', body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateOpenCoding(client),
  })
}

export function useDeleteTheme() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(
      `/open-coding/themes/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateOpenCoding(client),
  })
}

export function useToggleThemeCode() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ themeId, codeId, linked }: {
      themeId: string; codeId: string; linked: boolean
    }) => apiFetch<Theme>(`/open-coding/themes/${themeId}/codes/${codeId}`, {
      method: linked ? 'DELETE' : 'PUT',
    }),
    onSuccess: () => invalidateOpenCoding(client),
  })
}
