/** Ported from index.html authUrlError(): reads error_description from search+hash. */
export function authUrlError(search: string, hash: string): string | null {
  const p = new URLSearchParams((search || '').replace(/^\?/, '') + '&' + (hash || '').replace(/^#/, ''))
  const desc = p.get('error_description')
  if (!desc) return null
  if (/state not found|expired/i.test(desc))
    return 'That link expired or was opened in a different browser. Your account is likely confirmed — just sign in below.'
  return desc.replace(/\+/g, ' ')
}
