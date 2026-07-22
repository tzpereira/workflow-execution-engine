import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as liveClient from '../liveClient'
import type { Worker } from '../core/model'
import { WorkerEditor } from './WorkerEditor'

function demoWorker(version: string, objective = 'review code'): Worker {
  return {
    id: 'reviewer',
    version,
    objective,
    constraints: ['be terse'],
    tools: [],
    contextPolicy: { mode: 'diff-only' },
    contract: {
      goal: 'produce a verdict',
      rules: ['cite a line'],
      outputSchema: { type: 'object' },
      successCriteria: [],
      maxRetries: 2,
    },
    model: { provider: 'openai', model: 'gpt-4o-mini' },
  }
}

describe('WorkerEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the version matching the current node ref and shows its fields', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      demoWorker('1.0.0'),
      demoWorker('1.0.1', 'review code strictly'),
    ])
    render(
      <WorkerEditor
        workerRef="reviewer@1.0.0"
        dir=""
        serverUrl="http://x"
        onWorkerRefChange={() => {}}
      />,
    )

    await waitFor(() =>
      expect(screen.getByDisplayValue('review code')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Worker version')).toHaveValue('1.0.0')
  })

  it('falls back to the latest version when the node ref matches nothing on disk', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      demoWorker('1.0.0'),
      demoWorker('1.0.1', 'latest content'),
    ])
    render(
      <WorkerEditor
        workerRef="reviewer@9.9.9"
        dir=""
        serverUrl="http://x"
        onWorkerRefChange={() => {}}
      />,
    )

    await waitFor(() =>
      expect(screen.getByDisplayValue('latest content')).toBeInTheDocument(),
    )
  })

  it('switching the version select re-points the node and loads that version into the form', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      demoWorker('1.0.0', 'old'),
      demoWorker('1.0.1', 'new'),
    ])
    const onWorkerRefChange = vi.fn()
    render(
      <WorkerEditor
        workerRef="reviewer@1.0.1"
        dir=""
        serverUrl="http://x"
        onWorkerRefChange={onWorkerRefChange}
      />,
    )
    await waitFor(() =>
      expect(screen.getByDisplayValue('new')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Worker version'), {
      target: { value: '1.0.0' },
    })
    expect(onWorkerRefChange).toHaveBeenCalledWith('reviewer@1.0.0')
    expect(screen.getByDisplayValue('old')).toBeInTheDocument()
  })

  it('saves an edit as a new version, ignoring the client-side version field, and re-points the node', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      demoWorker('1.0.0'),
    ])
    const saveWorkerSpy = vi
      .spyOn(liveClient, 'saveWorker')
      .mockResolvedValue(demoWorker('1.0.1', 'edited objective'))
    const onWorkerRefChange = vi.fn()
    render(
      <WorkerEditor
        workerRef="reviewer@1.0.0"
        dir="pr-review-autofix"
        serverUrl="http://x"
        onWorkerRefChange={onWorkerRefChange}
      />,
    )
    await waitFor(() =>
      expect(screen.getByDisplayValue('review code')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByDisplayValue('review code'), {
      target: { value: 'edited objective' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save as new version' }))

    await waitFor(() =>
      expect(screen.getByText('saved as v1.0.1')).toBeInTheDocument(),
    )
    expect(saveWorkerSpy).toHaveBeenCalledWith(
      'http://x',
      expect.objectContaining({
        id: 'reviewer',
        objective: 'edited objective',
      }),
      'pr-review-autofix',
    )
    expect(onWorkerRefChange).toHaveBeenCalledWith('reviewer@1.0.1')
  })

  it('edits model provider, model name, and temperature, then saves them (M1.14e)', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      demoWorker('1.0.0'),
    ])
    const saveWorkerSpy = vi
      .spyOn(liveClient, 'saveWorker')
      .mockResolvedValue(demoWorker('1.0.1'))
    render(
      <WorkerEditor
        workerRef="reviewer@1.0.0"
        dir=""
        serverUrl="http://x"
        onWorkerRefChange={() => {}}
      />,
    )
    await waitFor(() =>
      expect(screen.getByDisplayValue('review code')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Model provider'), {
      target: { value: 'anthropic' },
    })
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'claude-sonnet-4-5' },
    })
    fireEvent.change(screen.getByLabelText('Temperature'), {
      target: { value: '0.7' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save as new version' }))

    await waitFor(() =>
      expect(saveWorkerSpy).toHaveBeenCalledWith(
        'http://x',
        expect.objectContaining({
          model: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            params: { temperature: 0.7 },
          },
        }),
        '',
      ),
    )
  })

  it('blocks save and shows an error when the output schema is invalid JSON', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      demoWorker('1.0.0'),
    ])
    const saveWorkerSpy = vi.spyOn(liveClient, 'saveWorker')
    render(
      <WorkerEditor
        workerRef="reviewer@1.0.0"
        dir=""
        serverUrl="http://x"
        onWorkerRefChange={() => {}}
      />,
    )
    await waitFor(() =>
      expect(screen.getByDisplayValue('review code')).toBeInTheDocument(),
    )

    const schemaBox = screen.getByLabelText('Output schema (JSON)')
    fireEvent.change(schemaBox, { target: { value: '{not valid json' } })
    fireEvent.click(screen.getByRole('button', { name: 'save as new version' }))

    expect(
      await screen.findByText('outputSchema is not valid JSON'),
    ).toBeInTheDocument()
    expect(saveWorkerSpy).not.toHaveBeenCalled()
  })

  it('opens an editable draft when fetchWorkerVersions fails', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockRejectedValue(
      new Error('boom'),
    )
    const saveWorkerSpy = vi
      .spyOn(liveClient, 'saveWorker')
      .mockResolvedValue(demoWorker('1.0.0', 'draft objective'))
    const onWorkerRefChange = vi.fn()
    render(
      <WorkerEditor
        workerRef="reviewer@1.0.0"
        dir=""
        serverUrl="http://x"
        onWorkerRefChange={onWorkerRefChange}
      />,
    )

    expect(
      await screen.findByText(/No saved worker was loaded yet/),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Objective'), {
      target: { value: 'draft objective' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save as new version' }))

    await waitFor(() =>
      expect(saveWorkerSpy).toHaveBeenCalledWith(
        'http://x',
        expect.objectContaining({
          id: 'reviewer',
          version: '1.0.0',
          objective: 'draft objective',
        }),
        '',
      ),
    )
    expect(onWorkerRefChange).toHaveBeenCalledWith('reviewer@1.0.0')
  })

  it('shows an objective snippet next to each version in the picker (M2.3)', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      demoWorker('1.0.0', 'old'),
      demoWorker('1.0.1', 'new'),
    ])
    render(
      <WorkerEditor
        workerRef="reviewer@1.0.1"
        dir=""
        serverUrl="http://x"
        onWorkerRefChange={() => {}}
      />,
    )

    expect(
      await screen.findByRole('option', { name: '1.0.0 — old' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: '1.0.1 — new' }),
    ).toBeInTheDocument()
  })

  it('names the exact version Save will create, next to the version picker (M2.3)', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      demoWorker('1.0.0'),
    ])
    render(
      <WorkerEditor
        workerRef="reviewer@1.0.0"
        dir=""
        serverUrl="http://x"
        onWorkerRefChange={() => {}}
      />,
    )
    await waitFor(() =>
      expect(screen.getByDisplayValue('review code')).toBeInTheDocument(),
    )

    expect(screen.getByText('reviewer@1.0.1')).toBeInTheDocument()
  })

  it('shows informational envelope validation issues without blocking save (M2.3)', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      demoWorker('1.0.0'),
    ])
    const saveWorkerSpy = vi
      .spyOn(liveClient, 'saveWorker')
      .mockResolvedValue(demoWorker('1.0.1'))
    render(
      <WorkerEditor
        workerRef="reviewer@1.0.0"
        dir=""
        serverUrl="http://x"
        onWorkerRefChange={() => {}}
      />,
    )
    await waitFor(() =>
      expect(screen.getByDisplayValue('review code')).toBeInTheDocument(),
    )

    // contract.schema.json requires maxRetries >= 0 — a negative value is a
    // real ajv envelope violation the worker schema itself can catch.
    fireEvent.change(screen.getByLabelText('Max retries'), {
      target: { value: '-1' },
    })

    expect(
      await screen.findByText(/1 validation issue/, {}, { timeout: 2000 }),
    ).toBeInTheDocument()

    // Save is still allowed — the server is the enforcement gate, not the client.
    fireEvent.click(screen.getByRole('button', { name: 'save as new version' }))
    await waitFor(() => expect(saveWorkerSpy).toHaveBeenCalled())
  })

  it('edits long text through the expand modal without rewriting other fields (M2.10)', async () => {
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      demoWorker('1.0.0'),
    ])
    render(
      <WorkerEditor
        workerRef="reviewer@1.0.0"
        dir=""
        serverUrl="http://x"
        onWorkerRefChange={() => {}}
      />,
    )
    await waitFor(() =>
      expect(screen.getByDisplayValue('review code')).toBeInTheDocument(),
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Expand' })[0])
    const editors = await screen.findAllByDisplayValue('review code')
    const editor = editors[editors.length - 1]
    fireEvent.change(editor, { target: { value: 'review code\n\n## Notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.getByLabelText('Objective')).toHaveValue(
      'review code\n\n## Notes',
    )
    expect(screen.getByLabelText('Output schema (JSON)')).toHaveValue(
      '{\n  "type": "object"\n}',
    )
  })
})
