import type { FitViewOptions } from '@xyflow/react'

// Wide graphs should pan instead of shrinking their cards past legibility.
// Users can still zoom farther out manually for an overview; both the initial
// fit and the Controls fit button preserve this reading floor.
export const READABLE_FIT_VIEW = {
  padding: 0.12,
  minZoom: 0.8,
  maxZoom: 1,
} as const satisfies FitViewOptions
