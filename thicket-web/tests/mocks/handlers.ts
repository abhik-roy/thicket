import type { HttpHandler } from 'msw'

// Base handlers stay empty -- every test file adds its own via
// server.use(...) in the test itself, so no test file depends on another
// test file's handler list.
export const handlers: HttpHandler[] = []
