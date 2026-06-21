import { describe, it, expect } from 'vitest'
import {
  parseAccountSettings,
  mergeAccountSettings,
  serializeAccountSettings,
  storageKey,
} from './useAccountSettings'

describe('parseAccountSettings', () => {
  it('returns {} for null / invalid JSON', () => {
    expect(parseAccountSettings(null)).toEqual({})
    expect(parseAccountSettings('not json')).toEqual({})
    expect(parseAccountSettings('"a string"')).toEqual({})
    expect(parseAccountSettings('123')).toEqual({})
    expect(parseAccountSettings('null')).toEqual({})
  })

  it('keeps only valid typed fields', () => {
    expect(
      parseAccountSettings(
        JSON.stringify({ aiModel: 'claude-sonnet-4-6', aiKey: 'sk-ant-x', units: 'imperial' }),
      ),
    ).toEqual({ aiModel: 'claude-sonnet-4-6', aiKey: 'sk-ant-x', units: 'imperial' })
  })

  it('drops empty strings and invalid unit values', () => {
    expect(parseAccountSettings(JSON.stringify({ aiModel: '', aiKey: '', units: 'lightyears' }))).toEqual({})
    expect(parseAccountSettings(JSON.stringify({ units: 42 }))).toEqual({})
  })
})

describe('parseAccountSettings voiceId', () => {
  it('parses voiceId', () => {
    expect(parseAccountSettings('{"voiceId":"abc"}').voiceId).toBe('abc')
  })
  it('drops an empty voiceId', () => {
    expect(parseAccountSettings('{"voiceId":""}').voiceId).toBeUndefined()
  })
})

describe('mergeAccountSettings voiceId', () => {
  it('clears voiceId on empty', () => {
    expect(mergeAccountSettings({ voiceId: 'abc' }, { voiceId: '' }).voiceId).toBeUndefined()
  })
})

describe('mergeAccountSettings', () => {
  it('overlays a patch onto previous settings', () => {
    expect(mergeAccountSettings({ aiModel: 'a' }, { units: 'metric' })).toEqual({
      aiModel: 'a',
      units: 'metric',
    })
  })

  it('clears a key when patched with undefined or empty string', () => {
    expect(mergeAccountSettings({ aiKey: 'sk', units: 'metric' }, { aiKey: undefined })).toEqual({
      units: 'metric',
    })
    expect(mergeAccountSettings({ aiKey: 'sk' }, { aiKey: '' })).toEqual({})
  })

  it('does not mutate the previous object', () => {
    const prev = { aiModel: 'a' }
    mergeAccountSettings(prev, { units: 'metric' })
    expect(prev).toEqual({ aiModel: 'a' })
  })
})

describe('serializeAccountSettings round-trip', () => {
  it('survives serialize → parse', () => {
    const s = { aiModel: 'claude-opus-4-6', aiKey: 'sk-ant-y', units: 'metric' as const }
    expect(parseAccountSettings(serializeAccountSettings(s))).toEqual(s)
  })
})

describe('storageKey', () => {
  it('namespaces per user id', () => {
    expect(storageKey('user-123')).toBe('voyager:account:user-123')
  })
})
