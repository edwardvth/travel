// Pretty URLs: travel-guide.ai/london2026 → /Trip.html?trip=london2026
// Static assets are served first; this worker only handles paths that
// don't match a file in the repo.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
    if (m && !m[1].includes('.')) {
      const dest = new URL('/Trip.html', url.origin);
      dest.searchParams.set('trip', m[1].toLowerCase());
      // keep any extra query params (e.g. future referral codes)
      url.searchParams.forEach((v, k) => { if (k !== 'trip') dest.searchParams.set(k, v); });
      return Response.redirect(dest.toString(), 302);
    }
    // anything else that isn't an asset → home page
    return env.ASSETS.fetch(new URL('/index.html', url.origin));
  }
};
