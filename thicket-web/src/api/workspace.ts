import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'

export interface WorkspaceCounts {
  threads: number
  comments: number
  coders: number
  codebooks: number
  labels: number
}

export interface Workspace {
  corpus_db: string
  labels_db: string
  settings_file: string
  counts: WorkspaceCounts
}

export function useWorkspace() {
  return useQuery({
    queryKey: ['workspace'],
    queryFn: () => apiFetch<Workspace>('/workspace'),
  })
}

export function useDiscoveredDatabases() {
  return useQuery({
    queryKey: ['workspace-databases'],
    queryFn: () => apiFetch<{ paths: string[] }>('/workspace/databases'),
  })
}

export function useSwitchWorkspace() {
  return useMutation({
    mutationFn: (body: {
      corpus_db: string
      labels_db: string
      create_missing: boolean
    }) => apiFetch<Workspace>('/workspace', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  })
}
