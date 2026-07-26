import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceManager } from '../../src/components/WorkspaceManager'
import { server } from '../mocks/server'

const WORKSPACE = {
  corpus_db: '/research/corpus.db',
  labels_db: '/research/labels.db',
  settings_file: '/research/settings.json',
  counts: {
    threads: 42, comments: 900, coders: 2, codebooks: 1, labels: 73,
  },
}

describe('WorkspaceManager', () => {
  it('shows the active workspace and switches through the GUI', async () => {
    let posted: Record<string, unknown> | null = null
    const onSwitched = vi.fn()
    server.use(
      http.get('http://localhost:8000/workspace', () =>
        HttpResponse.json(WORKSPACE)),
      http.get('http://localhost:8000/workspace/databases', () =>
        HttpResponse.json({
          paths: ['/research/corpus.db', '/research/labels.db'],
        })),
      http.put('http://localhost:8000/workspace', async ({ request }) => {
        posted = await request.json() as Record<string, unknown>
        return HttpResponse.json(WORKSPACE)
      }),
    )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <WorkspaceManager onClose={vi.fn()} onSwitched={onSwitched} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(
      screen.getByText('/research/corpus.db')).toBeTruthy())
    expect(screen.getByText('42')).toBeTruthy()
    await userEvent.click(screen.getByRole(
      'button', { name: 'Use this workspace' }))

    await waitFor(() => expect(onSwitched).toHaveBeenCalledOnce())
    expect(posted).toEqual({
      corpus_db: '/research/corpus.db',
      labels_db: '/research/labels.db',
      create_missing: false,
    })
  })

  it('selects a corpus database with the GUI file picker', async () => {
    server.use(
      http.get('http://localhost:8000/workspace', () =>
        HttpResponse.json(WORKSPACE)),
      http.get('http://localhost:8000/workspace/browse', () =>
        HttpResponse.json({
          directory: '/research',
          parent: '/',
          entries: [
            { name: 'archive', path: '/research/archive', kind: 'directory' },
            { name: 'new-corpus.db', path: '/research/new-corpus.db', kind: 'database' },
          ],
        })),
    )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <WorkspaceManager onClose={vi.fn()} onSwitched={vi.fn()} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(
      screen.getAllByRole('button', { name: 'Browse…' })).toHaveLength(2))
    await userEvent.click(screen.getAllByRole(
      'button', { name: 'Browse…' },
    )[0])
    await userEvent.click(await screen.findByRole(
      'button', { name: /new-corpus\.db/ },
    ))

    expect(screen.getByText('/research/new-corpus.db')).toBeTruthy()
    expect(screen.queryByRole(
      'dialog', { name: 'Choose corpus database' },
    )).toBeNull()
  })
})
