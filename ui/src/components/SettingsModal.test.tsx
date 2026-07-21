import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as liveClient from '../liveClient'
import { useLive } from '../liveStore'
import { SettingsModal } from './SettingsModal'

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useLive.setState({ serverUrl: 'http://127.0.0.1:7676' })
  })

  it('renders nothing when closed', () => {
    render(<SettingsModal open={false} onOpenChange={() => {}} />)
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('loads and shows set/not-set status per field without ever displaying a value', async () => {
    vi.spyOn(liveClient, 'fetchSecretsStatus').mockResolvedValue({
      OPENAI_API_KEY: true,
      ANTHROPIC_API_KEY: false,
      GITHUB_AUTH_HEADER: false,
      WEE_WORKSPACE_ROOT: false,
    })
    render(<SettingsModal open onOpenChange={() => {}} />)

    await waitFor(() => expect(screen.getByPlaceholderText('set - enter a new value to replace')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('ghp_... or github_pat_...')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('/path/to/local/repo-checkout')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'clear' })).toBeInTheDocument()
  })

  it('saves a value, then shows it as set and clears the draft input', async () => {
    vi.spyOn(liveClient, 'fetchSecretsStatus').mockResolvedValue({
      OPENAI_API_KEY: false,
      ANTHROPIC_API_KEY: false,
      GITHUB_AUTH_HEADER: false,
      WEE_WORKSPACE_ROOT: false,
    })
    const setSecretSpy = vi.spyOn(liveClient, 'setSecret').mockResolvedValue(undefined)
    render(<SettingsModal open onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument())

    const input = screen.getByLabelText('OpenAI API key')
    fireEvent.change(input, { target: { value: 'sk-live-example' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'save' })[0])

    await waitFor(() => expect(setSecretSpy).toHaveBeenCalledWith('http://127.0.0.1:7676', 'OPENAI_API_KEY', 'sk-live-example'))
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('accepts a raw GitHub token and saves the Authorization header value tools expect', async () => {
    vi.spyOn(liveClient, 'fetchSecretsStatus').mockResolvedValue({
      OPENAI_API_KEY: false,
      ANTHROPIC_API_KEY: false,
      GITHUB_AUTH_HEADER: false,
      WEE_WORKSPACE_ROOT: false,
    })
    const setSecretSpy = vi.spyOn(liveClient, 'setSecret').mockResolvedValue(undefined)
    render(<SettingsModal open onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText('GitHub token')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('GitHub token'), { target: { value: 'github_pat_example' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'save' })[2])

    await waitFor(() =>
      expect(setSecretSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:7676',
        'GITHUB_AUTH_HEADER',
        'Bearer github_pat_example',
      ),
    )
  })

  it('saves the workspace root as plain text runtime config', async () => {
    vi.spyOn(liveClient, 'fetchSecretsStatus').mockResolvedValue({
      OPENAI_API_KEY: false,
      ANTHROPIC_API_KEY: false,
      GITHUB_AUTH_HEADER: false,
      WEE_WORKSPACE_ROOT: false,
    })
    const setSecretSpy = vi.spyOn(liveClient, 'setSecret').mockResolvedValue(undefined)
    render(<SettingsModal open onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText('Workspace root')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Workspace root'), { target: { value: '/tmp/bitcoin' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'save' })[3])

    await waitFor(() =>
      expect(setSecretSpy).toHaveBeenCalledWith('http://127.0.0.1:7676', 'WEE_WORKSPACE_ROOT', '/tmp/bitcoin'),
    )
  })

  it('clears a set secret', async () => {
    vi.spyOn(liveClient, 'fetchSecretsStatus').mockResolvedValue({
      OPENAI_API_KEY: true,
      ANTHROPIC_API_KEY: false,
      GITHUB_AUTH_HEADER: false,
      WEE_WORKSPACE_ROOT: false,
    })
    const unsetSecretSpy = vi.spyOn(liveClient, 'unsetSecret').mockResolvedValue(undefined)
    render(<SettingsModal open onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'clear' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'clear' }))

    await waitFor(() => expect(unsetSecretSpy).toHaveBeenCalledWith('http://127.0.0.1:7676', 'OPENAI_API_KEY'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'clear' })).not.toBeInTheDocument())
  })

  it('shows a load error instead of a blank panel', async () => {
    vi.spyOn(liveClient, 'fetchSecretsStatus').mockRejectedValue(new Error('boom'))
    vi.spyOn(liveClient, 'fetchSettings').mockRejectedValue(new Error('unreachable'))
    render(<SettingsModal open onOpenChange={() => {}} />)
    expect(await screen.findByText('boom')).toBeInTheDocument()
  })

  it('loads durable settings and persists edits to disk (REQ-CTRL-05)', async () => {
    vi.spyOn(liveClient, 'fetchSecretsStatus').mockResolvedValue({
      OPENAI_API_KEY: false,
      ANTHROPIC_API_KEY: false,
      GITHUB_AUTH_HEADER: false,
      WEE_WORKSPACE_ROOT: false,
    })
    vi.spyOn(liveClient, 'fetchSettings').mockResolvedValue({ cacheMode: 'on' })
    const saveSpy = vi
      .spyOn(liveClient, 'saveSettings')
      .mockResolvedValue({ cacheMode: 'on', defaultBudgetUsd: 2.5 })
    render(<SettingsModal open onOpenChange={() => {}} />)

    const budget = await screen.findByPlaceholderText("0 = use each workflow's own")
    fireEvent.change(budget, { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => expect(saveSpy).toHaveBeenCalled())
    expect(saveSpy.mock.calls[0][1]).toMatchObject({ defaultBudgetUsd: 2.5 })
    expect(await screen.findByText('saved')).toBeInTheDocument()
  })
})
