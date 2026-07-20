import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { Term } from './Term'

describe('Term', () => {
  beforeEach(() => localStorage.clear())

  it('shows the explanation on first encounter, alongside the wrapped label', () => {
    render(<Term name="Contract">Contract</Term>)
    expect(screen.getByText('Contract')).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent(/enforced spec/)
  })

  it('dismissing hides the explanation and persists across remounts', () => {
    const { unmount } = render(<Term name="Artifact">Artifact</Term>)
    fireEvent.click(screen.getByLabelText('Dismiss Artifact explanation'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    unmount()

    render(<Term name="Artifact">Artifact</Term>)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByText('Artifact')).toBeInTheDocument()
  })

  it('dismissing one term does not hide a different term', () => {
    localStorage.setItem('wee.termSeen.Contract', '1')
    render(<Term name="Artifact">Artifact</Term>)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })
})
