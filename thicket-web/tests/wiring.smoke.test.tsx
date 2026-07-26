import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from './mocks/server'

function Probe() {
  return (
    <p className="bg-red-500 text-white" data-testid="probe">
      hi
    </p>
  )
}

describe('toolchain wiring', () => {
  it('renders a component with Tailwind classes via RTL', () => {
    render(<Probe />)
    expect(screen.getByTestId('probe')).toHaveClass('bg-red-500')
  })

  it('resolves a fetch through the MSW network boundary', async () => {
    server.use(
      http.get('http://localhost:9999/probe', () =>
        HttpResponse.json({ ok: true })),
    )
    const res = await fetch('http://localhost:9999/probe')
    expect(await res.json()).toEqual({ ok: true })
  })
})
