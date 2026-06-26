import { describe, it, expect } from 'vitest'
import { normalizeName, nameSimilarity } from './name'

describe('normalizeName', () => {
  it('lowercases, strips punctuation + accents, collapses spaces', () => {
    expect(normalizeName('  The Café  de  Flore! ')).toBe('the cafe de flore')
    expect(normalizeName('St. Louis')).toBe('st louis')
  })
})

describe('nameSimilarity', () => {
  it('exact on normalized equality', () => {
    expect(nameSimilarity('Gateway Arch', 'gateway arch')).toBe('exact')
    expect(nameSimilarity('The Bean', 'the   bean')).toBe('exact')
  })
  it('close when one contains the other', () => {
    expect(nameSimilarity('Arch', 'Gateway Arch National Park')).toBe('close')
    expect(nameSimilarity('Louvre', 'Louvre Museum')).toBe('close')
  })
  it('close on high token overlap', () => {
    expect(nameSimilarity('Eiffel Tower Paris', 'Eiffel Tower')).toBe('close')
  })
  it('none when unrelated', () => {
    expect(nameSimilarity('Colosseum', 'Gateway Arch')).toBe('none')
    expect(nameSimilarity('', 'Anything')).toBe('none')
  })
})
