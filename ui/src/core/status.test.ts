import { describe, expect, it } from 'vitest'

import { signal, signals } from './status'

describe('status signals', () => {
  it('maps each status to a label, icon, and color classes', () => {
    for (const [key, value] of Object.entries(signals)) {
      expect(value.label, key).toBeTruthy()
      expect(value.icon, key).toBeTruthy()
      expect(value.dotClass, key).toContain('bg-')
      expect(value.badgeClass, key).toContain('text-')
      expect(value.borderClass, key).toContain('border-')
    }
  })

  it('returns cache hit as distinct from fresh success', () => {
    expect(signal('cached').label).toBe('cache hit')
    expect(signal('cached').barClass).not.toBe(signal('succeeded').barClass)
  })

  it('centrally encodes model-backed and deterministic node kinds (REQ-UI-17)', () => {
    expect(signal('model-backed')).toMatchObject({ label: 'model', icon: '◆' })
    expect(signal('deterministic')).toMatchObject({
      label: 'deterministic',
      icon: '⚙',
    })
    expect(signal('model-backed').badgeClass).not.toBe(
      signal('deterministic').badgeClass,
    )
  })
})
