import { beforeEach, describe, expect, it } from 'vitest'

import { clamp, readPersistedSize, writePersistedSize } from './resizable'

describe('clamp', () => {
  it('passes a value already in range through unchanged', () => {
    expect(clamp(50, 0, 100)).toBe(50)
  })
  it('clamps below the minimum', () => {
    expect(clamp(-10, 0, 100)).toBe(0)
  })
  it('clamps above the maximum', () => {
    expect(clamp(500, 0, 100)).toBe(100)
  })
})

describe('readPersistedSize / writePersistedSize', () => {
  beforeEach(() => localStorage.clear())

  it('returns the fallback when nothing is stored', () => {
    expect(readPersistedSize('missing-key', 320)).toBe(320)
  })

  it('round-trips a written value', () => {
    writePersistedSize('inspector-width', 400)
    expect(readPersistedSize('inspector-width', 320)).toBe(400)
  })

  it('returns the fallback for a corrupted (non-numeric) stored value', () => {
    localStorage.setItem('inspector-width', 'not-a-number')
    expect(readPersistedSize('inspector-width', 320)).toBe(320)
  })
})
