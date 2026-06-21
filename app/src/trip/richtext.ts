const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

/**
 * Format AI-generated prose for display. The model is asked for plain text but
 * sometimes emits inline emphasis as HTML (`<strong>…</strong>`) or markdown
 * (`**…**` / `*…*`). We render those as real emphasis while keeping everything
 * else inert:
 *
 *   1. Escape ALL `&` `<` `>` (so any markup becomes harmless text).
 *   2. Re-allow a tiny inline subset that was just escaped: `strong` `em` `b`
 *      `i` and `br` — nothing else (a stray `<script>` stays escaped).
 *   3. Convert markdown emphasis (`**bold**` / `__bold__` / `*em*` / `_em_`).
 *
 * Returns an HTML string intended for `dangerouslySetInnerHTML`. Pure.
 */
export function formatInline(input: string): string {
  if (!input) return ''
  let s = input.replace(/[&<>]/g, c => ESCAPE[c])
  // Re-allow only the safe inline tags we just escaped.
  s = s
    .replace(/&lt;(\/?)(strong|em|b|i)&gt;/gi, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
  // Markdown emphasis (bold before italic so `**` isn't eaten by `*`).
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '<em>$1</em>')
  return s
}

/** Common HTML entities we decode in `renderProse` before re-escaping. */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

/**
 * Render arbitrary prose — AI plain text (`\n\n` paragraphs) OR HTML extracts
 * (e.g. Wikipedia `<p>…</p><p>…</p>`) — into clean paragraphs that NEVER leak
 * raw markup to the DOM.
 *
 * Contract: returns `string[]`, one entry per paragraph. Each entry is an
 * HTML-safe fragment (only the tiny `formatInline` emphasis allowlist can
 * appear) suitable for `dangerouslySetInnerHTML`. The component wraps each in
 * its own `<p>`. Empty / whitespace-only input → `[]`.
 *
 * Pipeline:
 *   1. Normalise block structure to blank lines: `</p>` and `<br>` → `\n\n`
 *      (and `<p>` removed) so HTML and plain text converge on the same split.
 *   2. Strip ALL remaining tags (`<[^>]+>`) — no raw HTML survives.
 *   3. Decode the common entities (`&amp; &lt; &gt; &quot; &#39; &nbsp;`).
 *   4. Split on blank lines, collapse whitespace within each paragraph.
 *   5. Re-apply `formatInline` per paragraph (escapes again, then re-allows the
 *      safe inline emphasis subset + markdown). So `**bold**` still renders but
 *      injected `<p>`/`<script>` cannot reach the DOM.
 */
export function renderProse(input: string): string[] {
  if (!input) return []
  // 1. Block tags → paragraph/line breaks.
  let s = input
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n\n')
    .replace(/<\s*p\b[^>]*>/gi, '\n\n')
    .replace(/<\s*\/?\s*(div|section|article|ul|ol|li|h[1-6]|blockquote)\b[^>]*>/gi, '\n\n')
  // 2. Strip every remaining tag.
  s = s.replace(/<[^>]+>/g, '')
  // 3. Decode common entities.
  s = s.replace(/&(amp|lt|gt|quot|#39|nbsp);/gi, m => ENTITIES[m.toLowerCase()] ?? m)
  // 4. Split into paragraphs on blank lines, collapse inner whitespace.
  return s
    .split(/\n[ \t]*\n+/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    // 5. Re-apply the safe inline renderer per paragraph.
    .map(formatInline)
}
