export type PatternName = string

export interface PatternDef {
  name: string
  description: string
  cells: number[][]
}

export type PatternsMap = Record<PatternName, PatternDef>

export let PATTERNS: PatternsMap = {}

export function setPatterns(patterns: PatternsMap) {
  PATTERNS = patterns
}

export function getPatternCells(patternKey: PatternName): number[][] | null {
  const p = PATTERNS[patternKey]
  return p ? p.cells : null
}


