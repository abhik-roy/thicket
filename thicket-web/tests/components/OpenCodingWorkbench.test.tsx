import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../mocks/server'
import { OpenCodingWorkbench } from '../../src/components/OpenCodingWorkbench'
import type { EvidenceSegment, SelectionDraft, Theme } from '../../src/api/openCoding'

const code = {
  id: 'c1', codebook_id: 'open', parent_id: null,
  name: 'Requesting disclosure', description: '', color: '#32735f',
  valence: null, hotkey: null, sort_order: 0,
}

function setup(selection: SelectionDraft | null = {
  itemId: 'post-1', startOffset: 3, endOffset: 18,
  selectedText: 'use is disclosed',
}) {
  let segments: EvidenceSegment[] = []
  let themes: Theme[] = []
  let captured: Record<string, unknown> | null = null
  server.use(
    http.get('http://localhost:8000/open-coding/segments', () =>
      HttpResponse.json(segments)),
    http.get('http://localhost:8000/open-coding/themes', () =>
      HttpResponse.json(themes)),
    http.post('http://localhost:8000/open-coding/capture', async ({ request }) => {
      captured = await request.json() as Record<string, unknown>
      const body = captured as { new_code?: { name: string }; memo: string }
      const created = body.new_code ? { ...code, id: 'new-code', name: body.new_code.name } : code
      const segment: EvidenceSegment = {
        id: 's1', item_type: 'comment', item_id: 'post-1', thread_id: 't1',
        coder_id: 'analyst', pass_no: 1, start_offset: 3, end_offset: 18,
        selected_text: 'use is disclosed', context_text: 'AI use is disclosed',
        memo: body.memo, status: 'coded', created_at: 'x', updated_at: 'x',
        author: 'alice', created_utc: 1, permalink: '/post-1', codes: [created],
        themes: [],
      }
      segments = [segment]
      return HttpResponse.json(segment, { status: 201 })
    }),
    http.post('http://localhost:8000/open-coding/themes', async ({ request }) => {
      const body = await request.json() as Omit<Theme, 'id'|'codebook_id'|'codes'|'created_at'|'updated_at'>
      const theme: Theme = { id: 'theme-1', codebook_id: 'open', codes: [],
        created_at: 'x', updated_at: 'x', ...body }
      themes = [theme]
      return HttpResponse.json(theme, { status: 201 })
    }),
    http.put('http://localhost:8000/open-coding/themes/theme-1/codes/c1', () => {
      themes = [{ ...themes[0], codes: [{ ...code, segment_count: 1 }] }]
      return HttpResponse.json(themes[0], { status: 201 })
    }),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>
    <OpenCodingWorkbench coderId="analyst" passNo={1} codebookId="open"
      threadId="t1" codes={[code]} selection={selection}
      onClearSelection={vi.fn()} onJumpToSource={vi.fn()}
      focusedAppliedCodeIds={[]} onToggleFocusedCode={vi.fn()}
      onCollapse={vi.fn()} />
  </QueryClientProvider>)
  return { getCaptured: () => captured }
}

describe('OpenCodingWorkbench', () => {
  it('creates and applies an inductive code in the capture interaction', async () => {
    const state = setup()
    expect(await screen.findByText(/use is disclosed/)).toBeTruthy()
    await userEvent.type(screen.getByPlaceholderText('Action-oriented code name'), 'Making use visible')
    await userEvent.type(screen.getByPlaceholderText(/What is happening/), 'Disclosure establishes traceability')
    await userEvent.click(screen.getByRole('button', { name: 'Create code and save segment' }))
    await waitFor(() => expect(state.getCaptured()).not.toBeNull())
    expect((state.getCaptured() as { new_code: { name: string } }).new_code.name)
      .toBe('Making use visible')
  })

  it('shows persisted source-grounded segments in the dataset tray', async () => {
    setup()
    await userEvent.click(await screen.findByRole('checkbox', { name: /Requesting disclosure/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply codes and save segment' }))
    await userEvent.click(screen.getByRole('button', { name: /Dataset/ }))
    expect(await screen.findByText('“use is disclosed”')).toBeTruthy()
    expect(screen.getByText('Requesting disclosure')).toBeTruthy()
  })

  it('creates a candidate theme and groups a code within it', async () => {
    setup(null)
    await userEvent.click(await screen.findByRole('button', { name: /Themes/ }))
    await userEvent.type(screen.getByPlaceholderText('Working theme name'), 'Visible accountability')
    await userEvent.type(screen.getByPlaceholderText(/central organizing concept/), 'Disclosure makes assistance reviewable')
    await userEvent.click(screen.getByRole('button', { name: 'Create candidate theme' }))
    expect(await screen.findByText('Visible accountability')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByText('Group codes under this theme'))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Requesting disclosure' }))
    await waitFor(() => expect(screen.getByText(/Requesting disclosure · 1/)).toBeTruthy())
  })
})
