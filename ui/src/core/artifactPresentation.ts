import type { NodeRecord } from './audit'
import { contentText } from './audit'

export interface ReviewIssue {
  severity: string
  line: number
  message: string
}

export interface ReviewResult {
  verdict: string
  score: number
  issues: ReviewIssue[]
}

export interface HTTPResult {
  status: number
  body: string
}

export interface GeneratedCodeResult {
  language: string
  path: string
  code: string
  summary: string
}

export interface RiskDimension {
  name: string
  score: number
  summary: string
}

export interface RiskFinding {
  severity: string
  area: string
  message: string
}

export interface RiskReport {
  risk: string
  score: number
  summary: string
  dimensions: RiskDimension[]
  findings: RiskFinding[]
  actions: string[]
}

export function parsedJSON(record: NodeRecord | undefined): unknown {
  const text = contentText(record)
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function reviewResult(value: unknown): ReviewResult | undefined {
  if (
    !isObject(value) ||
    typeof value.verdict !== 'string' ||
    typeof value.score !== 'number' ||
    !Array.isArray(value.issues)
  ) {
    return undefined
  }
  const issues = value.issues.filter(isReviewIssue)
  if (issues.length !== value.issues.length) return undefined
  return { verdict: value.verdict, score: value.score, issues }
}

export function httpResult(value: unknown): HTTPResult | undefined {
  if (
    !isObject(value) ||
    typeof value.status !== 'number' ||
    typeof value.body !== 'string'
  )
    return undefined
  return { status: value.status, body: value.body }
}

export function generatedCodeResult(
  value: unknown,
): GeneratedCodeResult | undefined {
  if (
    !isObject(value) ||
    typeof value.language !== 'string' ||
    typeof value.path !== 'string' ||
    typeof value.code !== 'string' ||
    typeof value.summary !== 'string'
  ) {
    return undefined
  }
  return {
    language: value.language,
    path: value.path,
    code: value.code,
    summary: value.summary,
  }
}

export function riskReport(value: unknown): RiskReport | undefined {
  if (
    !isObject(value) ||
    typeof value.risk !== 'string' ||
    typeof value.score !== 'number' ||
    typeof value.summary !== 'string' ||
    !Array.isArray(value.dimensions) ||
    !Array.isArray(value.findings) ||
    !Array.isArray(value.actions)
  ) {
    return undefined
  }
  const dimensions = value.dimensions.filter(isRiskDimension)
  const findings = value.findings.filter(isRiskFinding)
  const actions = value.actions.filter(
    (action): action is string => typeof action === 'string',
  )
  if (
    dimensions.length !== value.dimensions.length ||
    findings.length !== value.findings.length ||
    actions.length !== value.actions.length
  ) {
    return undefined
  }
  return {
    risk: value.risk,
    score: value.score,
    summary: value.summary,
    dimensions,
    findings,
    actions,
  }
}

export function formatBytes(text: string): string {
  const bytes = new TextEncoder().encode(text).length
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function lineCount(text: string): number {
  if (text.length === 0) return 0
  return text.split('\n').length
}

export function compactText(text: string, max = 180): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isReviewIssue(value: unknown): value is ReviewIssue {
  return (
    isObject(value) &&
    typeof value.severity === 'string' &&
    typeof value.line === 'number' &&
    typeof value.message === 'string'
  )
}

function isRiskDimension(value: unknown): value is RiskDimension {
  return (
    isObject(value) &&
    typeof value.name === 'string' &&
    typeof value.score === 'number' &&
    typeof value.summary === 'string'
  )
}

function isRiskFinding(value: unknown): value is RiskFinding {
  return (
    isObject(value) &&
    typeof value.severity === 'string' &&
    typeof value.area === 'string' &&
    typeof value.message === 'string'
  )
}
