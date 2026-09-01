import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { Code } from './comments'

export interface Codebook {
  id: string
  name: string
  description: string
  version: number
  created_at: string
  label_count: number
}

export interface CodeInput {
  name: string
  description: string
  color: string
  hotkey: string | null
}

export function useCodebooks() {
  return useQuery({
    queryKey: ['codebooks'],
    queryFn: () => apiFetch<Codebook[]>('/codebooks'),
  })
}

export function useCreateCodebook() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      apiFetch<Codebook>('/codebooks', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['codebooks'] }),
  })
}

export function useDeleteCodebook() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/codebooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['codebooks'] }),
  })
}

export function useCreateCode(codebookId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CodeInput) =>
      apiFetch<Code>(`/codebooks/${codebookId}/codes`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => client.invalidateQueries({
      queryKey: ['codes', codebookId],
    }),
  })
}

export function useUpdateCode(codebookId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: CodeInput & { id: string }) =>
      apiFetch<Code>(`/codes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => client.invalidateQueries({
      queryKey: ['codes', codebookId],
    }),
  })
}

export function useDeleteCode(codebookId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/codes/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({
      queryKey: ['codes', codebookId],
    }),
  })
}
