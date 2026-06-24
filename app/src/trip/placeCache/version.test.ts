import { describe, it, expect } from 'vitest'
import { CURRENT_ENRICH_VERSION, promptId } from './version'

describe('version', () => {
  it('CURRENT_ENRICH_VERSION is the current (facts-separated) prompt = 2', () => {
    expect(CURRENT_ENRICH_VERSION).toBe(2)
  })
})

describe('promptId', () => {
  it('is stable for the same template and differs for different templates', () => {
    const a = promptId('write three sections: history, facts, tips')
    const b = promptId('write three sections: history, facts, tips')
    const c = promptId('a different prompt')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{8,}$/) // short hex digest
  })
})
