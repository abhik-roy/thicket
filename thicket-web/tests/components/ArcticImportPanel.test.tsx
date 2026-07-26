import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { ArcticImportPanel } from '../../src/components/ArcticImportPanel'
import { server } from '../mocks/server'

describe('ArcticImportPanel', () => {
  it('imports a subreddit query and reports local results', async () => {
    let posted: Record<string, unknown> | null = null
    server.use(
      http.post('http://localhost:8000/imports/arctic-shift',
        async ({ request }) => {
          posted = await request.json() as Record<string, unknown>
          return HttpResponse.json({
            matched: 2, stored: 2, hydrated: 2, comments: 18,
            thread_ids: ['t1', 't2'],
          })
        }),
    )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <ArcticImportPanel onClose={vi.fn()} />
      </QueryClientProvider>,
    )

    await userEvent.type(screen.getByPlaceholderText('e.g. AskAcademia'),
      'AskAcademia')
    await userEvent.type(screen.getByPlaceholderText('e.g. peer review'),
      'peer review')
    await userEvent.click(screen.getByRole('button', { name: 'Import threads' }))

    await waitFor(() => expect(screen.getByRole('status').textContent)
      .toContain('Stored 2 threads and 18 comments locally.'))
    expect(posted).toEqual({
      subreddit: 'AskAcademia',
      query: 'peer review',
      limit: 25,
      hydrate: true,
    })
  })
})
