import { LegalLayout, Section } from './LegalLayout'

const UPDATED = 'June 29, 2026'
const SUPPORT = 'support@mypassage.ai'

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-sig-link underline underline-offset-2">
      {children}
    </a>
  )
}

/**
 * Passage Privacy Policy. Content is reconciled against the real data flows audited
 * in docs/superpowers/notes/privacy-data-map.md — it must stay accurate: do not add
 * claims about data we don't collect, and update it if processors change.
 */
export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" updated={UPDATED}>
      <Section heading="Summary">
        <p>
          Passage is a travel-planning app. We collect the account details you give us and the trip content you
          create, and we use a small set of trusted services to make features like AI suggestions, maps, photos,
          weather, and voice narration work. We <strong>do not</strong> use advertising, tracking, or analytics
          SDKs, and we <strong>do not</strong> sell your personal data. You can delete your account and data at any
          time. Questions: <A href={`mailto:${SUPPORT}`}>{SUPPORT}</A>.
        </p>
      </Section>

      <Section heading="Information we collect">
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Account information</strong> — your email address, display name, and which sign-in method you
            use (email &amp; password, Google, or Apple). If you use Apple, Apple may give us a private relay email
            instead of your real address.</li>
          <li><strong>Trip content you create</strong> — trip titles, destinations, day plans, and stops (place
            names, addresses, map coordinates, times, durations, and your notes), reservation details (status,
            confirmation numbers, notes), accommodation details, and cover images.</li>
          <li><strong>Collaboration data</strong> — if you share a trip, the email address of the person you invite.</li>
          <li><strong>Location</strong> — when you use the live <strong>Guide</strong> feature, your device asks
            permission to use your location to show where you are relative to your stops. This happens on your
            device; we do not store your live location on our servers or share it with third parties.</li>
        </ul>
      </Section>

      <Section heading="How we use your information">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To create your account and let you sign in.</li>
          <li>To store, sync, and display your trips across your devices.</li>
          <li>To power features: AI suggestions and stop write-ups, maps and geocoding, place and destination
            photos, weather, walking times, and optional voice narration.</li>
          <li>To let you share trips with people you choose.</li>
          <li>To respond to support requests and keep the service secure and working.</li>
        </ul>
      </Section>

      <Section heading="Where your data goes (service providers)">
        <p>
          We use the following providers strictly to deliver the features above. Each receives only the data
          needed for its job. API keys for our server-side providers are held on our servers and never in the app.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Supabase</strong> — our database, authentication, and backend. It stores your account and all
            of your trip content. (<A href="https://supabase.com/privacy">privacy</A>)</li>
          <li><strong>Anthropic (Claude)</strong> — powers AI suggestions and stop content. When you use an AI
            feature, we send the relevant prompt context (such as the destination, trip details, and place names)
            to Anthropic. (<A href="https://www.anthropic.com/legal/privacy">privacy</A>)</li>
          <li><strong>Google Places</strong> — place search and place photos; receives place names / search text.
            (<A href="https://policies.google.com/privacy">privacy</A>)</li>
          <li><strong>Photon (komoot)</strong> — address autocomplete and geocoding; receives the place or
            destination text you type.</li>
          <li><strong>Open-Meteo</strong> — weather forecasts; receives the latitude/longitude of your stops.</li>
          <li><strong>Pexels</strong> and <strong>Unsplash</strong> — destination and place imagery; receive place
            or destination names.</li>
          <li><strong>Wikipedia / Wikimedia Commons</strong> — landmark facts and images; receive place names.</li>
          <li><strong>ElevenLabs</strong> — optional voice narration in Guide; receives the stop text to be read
            aloud. (<A href="https://elevenlabs.io/privacy">privacy</A>)</li>
          <li><strong>Resend</strong> — sends trip-collaboration invitation emails; receives the invitee's email.</li>
          <li><strong>OpenStreetMap</strong> (map tiles), <strong>Google Fonts</strong>, and <strong>Fontshare</strong>
            — when maps or fonts load, your IP address and the map view reach these providers, as with any website.</li>
          <li><strong>Apple Maps / Google Maps</strong> — only when you tap "Directions" in Guide, which opens the
            external maps app with your destination.</li>
        </ul>
        <p>
          When you sign in with <strong>Google</strong> or <strong>Apple</strong>, that provider authenticates you
          and shares your email and name with us. Their handling of your sign-in is governed by their own policies.
        </p>
      </Section>

      <Section heading="What we don't do">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>No advertising and no ad identifiers.</li>
          <li>No analytics, tracking pixels, or cross-app/website tracking.</li>
          <li>No selling or renting of your personal data.</li>
        </ul>
      </Section>

      <Section heading="Data retention and deletion">
        <p>
          We keep your data until you remove it. You can delete individual trips, and you can delete your entire
          account from within the app — this permanently removes your account and associated personal data from
          our systems, and revokes your Apple sign-in token where applicable. You can also email
          {' '}<A href={`mailto:${SUPPORT}`}>{SUPPORT}</A> to request access to or deletion of your data.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          We use reputable infrastructure (Supabase) with access controls, and credentials for third-party
          services are kept server-side. No method of transmission or storage is perfectly secure, but we work to
          protect your information and limit access to what each feature needs.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          Passage is not directed to children under 13 (or the minimum age required in your country). We do not
          knowingly collect personal data from children. If you believe a child has provided us data, contact us
          and we will delete it.
        </p>
      </Section>

      <Section heading="International users">
        <p>
          Our providers may process and store data in countries other than yours, including the United States. By
          using Passage you understand your information may be transferred to and processed in those locations.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          Depending on where you live, you may have rights to access, correct, export, or delete your personal
          data, and to object to certain processing. You can exercise most of these directly in the app (account
          and trip deletion) or by emailing <A href={`mailto:${SUPPORT}`}>{SUPPORT}</A>.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          We may update this policy as the app evolves. We'll change the "Last updated" date above and, for
          significant changes, provide a more prominent notice.
        </p>
      </Section>

      <Section heading="Contact">
        <p>Questions about privacy? Email <A href={`mailto:${SUPPORT}`}>{SUPPORT}</A>.</p>
      </Section>
    </LegalLayout>
  )
}
