// Registers @testing-library/jest-dom's matchers on Vitest's `expect`
// and cleans up the DOM between tests. Loaded via `test.setupFiles`.
import '@testing-library/jest-dom/vitest'

// React Flow measures its container via ResizeObserver, which jsdom doesn't
// implement. A no-op stub lets components that mount the canvas render in tests.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

Element.prototype.scrollIntoView ??= function scrollIntoView() {}
