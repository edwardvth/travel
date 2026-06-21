import { describe, it, expect } from 'vitest'
import { formatInline, renderProse } from './richtext'

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

describe('renderProse', () => {
  it('returns an empty array for falsy / whitespace-only input', () => {
    expect(renderProse('')).toEqual([])
    expect(renderProse('   \n\n  ')).toEqual([])
  })

  it('splits HTML <p> blocks into paragraphs with no tags in the output', () => {
    const out = renderProse('<p>First para.</p><p>Second para.</p>')
    expect(out).toEqual(['First para.', 'Second para.'])
    // No raw tags survive.
    out.forEach(p => expect(p).not.toMatch(/<p|<\/p|&lt;p/i))
  })

  it('splits plain text on blank lines into paragraphs', () => {
    expect(renderProse('First para.\n\nSecond para.')).toEqual(['First para.', 'Second para.'])
  })

  it('treats <br> as a line break (joined within a paragraph)', () => {
    expect(renderProse('one<br>two')).toEqual(['one two'])
  })

  it('strips all remaining/unknown HTML tags', () => {
    expect(renderProse('<div class="x">Hello <span>there</span></div>')).toEqual(['Hello there'])
    expect(renderProse('Safe <script>alert(1)</script> text')).toEqual(['Safe alert(1) text'])
  })

  it('decodes common HTML entities (then re-escapes to safe HTML output)', () => {
    // Entities are decoded so encoded markup normalises; the final fragment is
    // an HTML-safe string for dangerouslySetInnerHTML, so `&`/`<`/`>` re-escape.
    expect(renderProse('Tom &amp; Jerry')).toEqual(['Tom &amp; Jerry'])
    expect(renderProse('&quot;q&quot; it&#39;s&nbsp;here')).toEqual(["\"q\" it's here"])
    // An entity-encoded tag is treated as literal visible text (not stripped),
    // so it survives as inert escaped text rather than reaching the DOM.
    expect(renderProse('&lt;tag&gt;')).toEqual(['&lt;tag&gt;'])
  })

  it('preserves safe markdown emphasis after tag stripping', () => {
    expect(renderProse('<p>The **Arch** is *tall*.</p>')).toEqual([
      'The <strong>Arch</strong> is <em>tall</em>.',
    ])
  })

  it('collapses runs of whitespace within a paragraph', () => {
    expect(renderProse('<p>lots   of\n  space</p>')).toEqual(['lots of space'])
  })

  it('never emits a raw <p> tag for AI plain text with paragraphs', () => {
    const out = renderProse('Why it matters.\n\nMore detail here.')
    expect(out).toEqual(['Why it matters.', 'More detail here.'])
  })
})
