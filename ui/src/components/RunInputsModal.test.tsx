import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RunInputsModal } from './RunInputsModal'

describe('RunInputsModal', () => {
  it('pre-fills a declared default and lets the run proceed without required fields', () => {
    const onSubmit = vi.fn()
    render(
      <RunInputsModal
        inputs={[{ name: 'logPath', default: '/var/log/app.log' }]}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />
    )
    expect(screen.getByPlaceholderText('/var/log/app.log')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onSubmit).toHaveBeenCalledWith({ logPath: '/var/log/app.log' })
  })

  it('disables Run until every required field is filled in', () => {
    const onSubmit = vi.fn()
    render(<RunInputsModal inputs={[{ name: 'prUrl', required: true }]} onCancel={() => {}} onSubmit={onSubmit} />)

    const runButton = screen.getByRole('button', { name: 'Run' })
    expect(runButton).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox', { name: 'prUrl' }), { target: { value: 'https://example.com/42' } })
    expect(runButton).not.toBeDisabled()

    fireEvent.click(runButton)
    expect(onSubmit).toHaveBeenCalledWith({ prUrl: 'https://example.com/42' })
  })

  it('calls onCancel when the cancel button or backdrop is clicked', () => {
    const onCancel = vi.fn()
    render(<RunInputsModal inputs={[{ name: 'prUrl', required: true }]} onCancel={onCancel} onSubmit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
