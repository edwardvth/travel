// Pretty URLs: travel-guide.ai/london2026 → /Trip.html?trip=london2026 (legacy planner, until Phase 2)
// SPA client routes (/, /auth, /trips, /trip/*) fall back to the Vite index.html.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
    const reserved = new Set(['auth', 'trips', 'trip']);
    if (slug && !slug[1].includes('.') && !reserved.has(slug[1].toLowerCase())) {
      const dest = new URL('/Trip.html', url.origin);
      dest.searchParams.set('trip', slug[1].toLowerCase());
      url.searchParams.forEach((v, k) => { if (k !== 'trip') dest.searchParams.set(k, v); });
      return Response.redirect(dest.toString(), 302);
    }
    return env.ASSETS.fetch(new URL('/index.html', url.origin));
  }
};
