import { describe, it, expect } from 'vitest'
import { formatInline } from './richtext'

describe('formatInline', () => {
  it('keeps allowed HTML emphasis tags', () => {
    expect(formatInline('The <strong>Arch</strong> opened in <em>1965</em>.')).toBe(
      'The <strong>Arch</strong> opened in <em>1965</em>.',
    )
    expect(formatInline('<b>bold</b> and <i>italic</i>')).toBe('<b>bold</b> and <i>italic</i>')
  })

  it('converts markdown bold and italic', () => {
    expect(formatInline('**bold**')).toBe('<strong>bold</strong>')
    expect(formatInline('__bold__')).toBe('<strong>bold</strong>')
    expect(formatInline('an *emphasised* word')).toBe('an <em>emphasised</em> word')
    expect(formatInline('an _emphasised_ word')).toBe('an <em>emphasised</em> word')
  })

  it('does not treat mid-word underscores as italic', () => {
    expect(formatInline('snake_case_name')).toBe('snake_case_name')
  })

  it('neutralises disallowed markup', () => {
    expect(formatInline('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
    expect(formatInline('<img src=x onerror=y>')).toBe('&lt;img src=x onerror=y&gt;')
  })

  it('escapes bare ampersands and angle brackets', () => {
    expect(formatInline('Tom & Jerry < Bob')).toBe('Tom &amp; Jerry &lt; Bob')
  })

  it('allows <br> line breaks', () => {
    expect(formatInline('one<br>two')).toBe('one<br>two')
    expect(formatInline('one<br/>two')).toBe('one<br>two')
  })

  it('returns empty string for falsy input', () => {
    expect(formatInline('')).toBe('')
  })

  it('leaves plain text untouched', () => {
    expect(formatInline('Just a normal sentence.')).toBe('Just a normal sentence.')
  })
})
