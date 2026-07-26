import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../mocks/server'
import { CoderPicker } from '../../src/components/CoderPicker'

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

describe('CoderPicker', () => {
  it('lets an existing coder pick themselves and their pass', async () => {
    server.use(
      http.get('http://localhost:8000/coders', () =>
        HttpResponse.json([{ id: 'a', name: 'Abhik', created_at: 'x' }])),
    )
    const onIdentitySelected = vi.fn()
    renderWithClient(<CoderPicker onIdentitySelected={onIdentitySelected} />)

    await waitFor(() => screen.getByText('Abhik'))
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Coder' }), 'a')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onIdentitySelected)
      .toHaveBeenCalledWith({ coderId: 'a', passNo: 1 })
  })

  it('creates a new coder from typed text then selects it', async () => {
    server.use(
      http.get('http://localhost:8000/coders', () => HttpResponse.json([])),
      http.post('http://localhost:8000/coders', async ({ request }) => {
        const body = await request.json() as { id: string; name: string }
        return HttpResponse.json(
          { ...body, created_at: 'x' }, { status: 201 })
      }),
    )
    const onIdentitySelected = vi.fn()
    renderWithClient(<CoderPicker onIdentitySelected={onIdentitySelected} />)

    await waitFor(() => screen.getByPlaceholderText('New coder name'))
    await userEvent.type(
      screen.getByPlaceholderText('New coder name'), 'New Person')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(onIdentitySelected).toHaveBeenCalledWith(
      { coderId: 'new-person', passNo: 1 }))
  })

  it('shows an error and does not proceed when coder creation fails', async () => {
    server.use(
      http.get('http://localhost:8000/coders', () => HttpResponse.json([])),
      http.post('http://localhost:8000/coders', () =>
        HttpResponse.json({ detail: 'server error' }, { status: 500 })),
    )
    const onIdentitySelected = vi.fn()
    renderWithClient(<CoderPicker onIdentitySelected={onIdentitySelected} />)

    await waitFor(() => screen.getByPlaceholderText('New coder name'))
    await userEvent.type(
      screen.getByPlaceholderText('New coder name'), 'New Person')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onIdentitySelected).not.toHaveBeenCalled()
  })

  it('shows an error when the coder list fails to load', async () => {
    server.use(
      http.get('http://localhost:8000/coders', () =>
        HttpResponse.json({ detail: 'error' }, { status: 500 })),
    )
    renderWithClient(<CoderPicker onIdentitySelected={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
})
