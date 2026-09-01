import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { DatasetScreen } from '../../src/screens/DatasetScreen'
import { server } from '../mocks/server'
import type { EvidenceSegment } from '../../src/api/openCoding'

describe('DatasetScreen', () => {
  it('removes a captured selection without deleting its corpus source', async () => {
    const segment: EvidenceSegment = {
      id: 's1', item_type: 'comment', item_id: 'p1', thread_id: 't1',
      coder_id: 'analyst', pass_no: 1, start_offset: 0, end_offset: 8,
      selected_text: 'Evidence', context_text: 'Evidence in context', memo: '',
      status: 'captured', created_at: 'x', updated_at: 'x', author: 'alice',
      created_utc: 1, permalink: '/p1', codes: [], themes: [],
    }
    let segments = [segment]
    let deleted = false
    server.use(
      http.get('http://localhost:8000/open-coding/segments', () => HttpResponse.json(segments)),
      http.get('http://localhost:8000/codebooks/open/codes', () => HttpResponse.json([])),
      http.get('http://localhost:8000/open-coding/themes', () => HttpResponse.json([])),
      http.delete('http://localhost:8000/open-coding/segments/s1', () => {
        deleted = true
        segments = []
        return new HttpResponse(null, { status: 204 })
      }),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter>
      <DatasetScreen coderId="analyst" passNo={1} codebookId="open"
        theme="light" onToggleTheme={vi.fn()} onOpenWorkspace={vi.fn()} />
    </MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('“Evidence”')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Export CSV/ })).toHaveAttribute(
      'href', expect.stringContaining(
        '/export/segments?codebook_id=open&coder_id=analyst&pass_no=1'))
    await userEvent.click(screen.getByRole('button', { name: 'Remove selection' }))
    await waitFor(() => expect(deleted).toBe(true))
    expect(await screen.findByText('No data units in this view.')).toBeTruthy()
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(
      'original corpus post will not be deleted'))
  })
})
