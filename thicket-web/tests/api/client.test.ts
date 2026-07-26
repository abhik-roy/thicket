import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../mocks/server'
import { apiFetch, ApiError } from '../../src/api/client'

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    server.use(
      http.get('http://localhost:8000/ping', () =>
        HttpResponse.json({ ok: true })),
    )
    const result = await apiFetch<{ ok: boolean }>('/ping')
    expect(result).toEqual({ ok: true })
  })

  it('throws ApiError carrying the response status on failure', async () => {
    server.use(
      http.get('http://localhost:8000/broken', () =>
        HttpResponse.text('bad request', { status: 400 })),
    )
    await expect(apiFetch('/broken')).rejects.toBeInstanceOf(ApiError)
    try {
      await apiFetch('/broken')
      throw new Error('expected apiFetch to throw')
    } catch (e) {
      expect((e as ApiError).status).toBe(400)
    }
  })
})
