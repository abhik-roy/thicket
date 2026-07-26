import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './mocks/server'

// jsdom has no real layout engine: offsetHeight/offsetWidth are always 0
// and ResizeObserver doesn't exist at all. @tanstack/react-virtual (used
// by TriageGrid) needs a non-zero scroll-container size to compute which
// rows are "visible" -- without this, getVirtualItems() always returns
// [] and no rows ever render in tests, even though the underlying data
// loaded correctly (getTotalSize() still works, since it only depends on
// item count/estimateSize, not container size).
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  value: 500,
})
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  value: 500,
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
