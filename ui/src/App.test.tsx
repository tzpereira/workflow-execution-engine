import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

// Smoke test: proves the Vitest + Testing Library + jsdom stack renders the
// app. Real component tests arrive with the UI milestones (M1.11+).
describe('App', () => {
  it('renders the "Get started" heading', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: /get started/i }),
    ).toBeInTheDocument()
  })
})
