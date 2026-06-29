# Passage — Privacy Data Map (plan B3.5)

> Source of truth for the Privacy Policy (B3) + App Store privacy labels (E1). Derived by auditing the
> code on 2026-06-29 (client `app/src` + `supabase/functions`). **No analytics/ad/tracking SDKs exist**
> (verified: no posthog/mixpanel/segment/plausible/sentry/amplitude/gtag; `index.html` loads only the app).

## Data we collect / process

| Category | Specific data | Stored where |
|---|---|---|
| Account | email, display name, auth provider (email/Google/Apple), magic-link email | Supabase `auth` + `profiles` |
| Trip content | trip title/subtitle/destination, day plans, **stops** (name, address, coordinates, time, duration, notes), **reservations** (status, confirmation #, notes), **stay/hotel** (name, address, check-in/out), completed flags, cover image | Supabase `trips` (JSONB `config`+`data`) |
| Collaboration | collaborator email addresses when a trip is shared | Supabase `trip_members` |
| Location | device geolocation while using the **Guide** live companion | **on-device only** — not persisted to our servers |
| Account status | role, AI credits | Supabase `profiles` (privilege-locked) |

## Third parties that receive data (processors)

**Server-side (via Supabase Edge Functions; API keys held server-side, never in the client):**
- **Anthropic (Claude)** — `ai-proxy` (`api.anthropic.com`): prompt content for AI suggestions/enrichment (destination, trip context, place names, optional traveler context).
- **Google Places** — `place-search` + `place-photo` (`places.googleapis.com`): place names / search text → place data + photos.
- **Pexels** — `pexels-video` (`api.pexels.com`): destination name → hero video.
- **Unsplash** — `unsplash-photo` (`api.unsplash.com`): search terms → cover photos.
- **ElevenLabs** — `narrate`: stop text → spoken narration in the Guide.
- **Resend** — `send-invite` (`api.resend.com`): collaborator email → invitation email. *(Currently not deployed; collaboration still records the member via RPC.)*

**Client-side (browser → service directly):**
- **Supabase** — database, auth, realtime, storage (the backend for everything above).
- **Photon / komoot** (`photon.komoot.io`) — typed destination/place search for autocomplete + geocoding.
- **Open-Meteo** (`api.open-meteo.com`) — stop latitude/longitude → weather forecast.
- **Wikipedia / Wikimedia Commons** (`en.wikipedia.org`, `upload.wikimedia.org`) — place names → landmark facts/images.
- **Pexels / Unsplash image CDNs** (`images.pexels.com`, `videos.pexels.com`, `images.unsplash.com`) — display media.
- **OpenStreetMap tiles** (via Leaflet) — map display; the map view + IP reach the tile provider.
- **Google Fonts** (`fonts.googleapis.com`) + **Fontshare** (`api.fontshare.com`) — web fonts; IP reaches the font host.
- **Apple Maps / Google Maps** (`maps.apple.com`, `google.com/maps`) — only when the user taps "Directions" in the Guide (opens the external app with the destination).

**Identity providers:** Google and Apple (OAuth) share the user's email + name on sign-in. Apple may relay a private/proxy email.

## Retention & deletion
- Data persists until the user deletes it (delete a trip) or deletes their account.
- **In-app account deletion** (plan B2) removes all rows/assets in this map + revokes the Apple token where available.
- Support / data requests: `support@mypassage.ai`.

## Not collected / not done
- No advertising, no ad identifiers, no cross-app tracking, no analytics SDKs.
- No selling of personal data.
- Device location is not transmitted to our servers or shared with third parties.
