/**
 * Auth redirect targets — the single place the web/native split lives (plan B1.5).
 *
 * Every Supabase auth entry point (OAuth, magic link, email confirm) routes its
 * `redirectTo`/`emailRedirectTo` through `getAuthRedirectTo()` so that:
 *   - on the web it returns the normal `/auth` callback on the current origin, and
 *   - inside the Capacitor native shell (iOS) it returns the app's deep link, so the
 *     provider returns the user INTO the app instead of stranding them in Safari —
 *     the #1 native-auth rejection/UX snag we designed against early.
 *
 * Capacitor is NOT a build dependency yet (it's added in Phase C). We therefore
 * detect the native runtime via the `window.Capacitor` global that the native shell
 * injects — no import — so this module compiles and behaves identically before and
 * after Capacitor is installed. On the plain web `window.Capacitor` is undefined and
 * we always take the web path.
 *
 * Native deep-link contract (to be registered in Supabase URL config + the Apple
 * Services ID return URL during Phase C / C3):
 *   - Custom scheme (v1):      ai.mypassage.app://auth/callback
 *   - Universal Link (later):  https://mypassage.ai/auth/callback
 */

/** The custom URL scheme the native iOS app will register (Phase C). */
export const NATIVE_URL_SCHEME = 'ai.mypassage.app'

/** Native auth callback deep link (custom scheme, v1). */
export const NATIVE_AUTH_CALLBACK = `${NATIVE_URL_SCHEME}://auth/callback`

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
}

/** True when running inside the Capacitor native shell (iOS); false on the web. */
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  return cap?.isNativePlatform?.() ?? false
}

/**
 * Where Supabase should send the user back after OAuth / magic link / email confirm.
 * Native → the app's deep link; web → the `/auth` route on the current origin.
 */
export function getAuthRedirectTo(): string {
  if (isNativePlatform()) return NATIVE_AUTH_CALLBACK
  return window.location.origin + '/auth'
}
