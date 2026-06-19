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
