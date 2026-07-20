// Panel sizing is view state, not domain data — the same boundary graph.ts's
// canvas position map already draws (REQ-UI-01: nothing here ever touches the
// canonical Workflow). Persisted in localStorage, keyed per panel, so a
// resize survives a reload without needing a backend.

import { useState } from 'react'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function readPersistedSize(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  if (raw == null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function writePersistedSize(key: string, value: number): void {
  localStorage.setItem(key, String(value))
}

/** usePersistedSize backs a resizable panel's dimension: reads localStorage
 *  once on mount, clamps every write to [min, max], and persists on change. */
export function usePersistedSize(
  key: string,
  fallback: number,
  min: number,
  max: number,
): [number, (v: number) => void] {
  const [size, setSizeState] = useState(() =>
    clamp(readPersistedSize(key, fallback), min, max),
  )

  function setSize(v: number) {
    const clamped = clamp(v, min, max)
    setSizeState(clamped)
    writePersistedSize(key, clamped)
  }

  // Derive the visible value when bounds change; the next user write persists
  // the new clamped value without an effect-driven state update.
  return [clamp(size, min, max), setSize]
}
