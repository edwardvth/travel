import { LegalLayout, Section } from './LegalLayout'

const UPDATED = 'June 29, 2026'
const SUPPORT = 'support@mypassage.ai'

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-sig-link underline underline-offset-2">{children}</a>
  )
}

/**
 * Passage Terms of Service. Plain-language terms for a free, consumer travel-planning
 * app operated by KOMITAS LLC (Missouri, USA). Recommend a lawyer review before a
 * large public launch, but the entity + governing law are now set.
 */
export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" updated={UPDATED}>
      <Section heading="Acceptance of these terms">
        <p>
          Passage (the "Service") is operated by <strong>KOMITAS LLC</strong> ("we," "us"), a Missouri, USA
          limited liability company. By creating an account or using the Service, you agree to these Terms of
          Service and to our <A href="/privacy-policy">Privacy Policy</A>. If you don't agree, please don't use the
          Service.
        </p>
      </Section>

      <Section heading="What Passage is">
        <p>
          Passage is a travel-planning app that helps you build day-by-day itineraries with AI suggestions, maps,
          photos, weather, walking times, and notes. It is a planning aid — information shown in the app (including
          AI-generated content, opening hours, place details, maps, and weather) may be incomplete, out of date, or
          inaccurate. Always verify important details (such as reservations, prices, hours, safety, and travel
          requirements) with official sources before you rely on them.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          You're responsible for the activity on your account and for keeping your login secure. Provide accurate
          information, and let us know promptly if you suspect unauthorized use. You must be old enough to form a
          binding contract in your country to use the Service.
        </p>
      </Section>

      <Section heading="Your content">
        <p>
          You own the trips and content you create. You grant Passage the limited permission needed to store,
          process, and display that content to provide the Service to you and to anyone you choose to share a trip
          with. When you use a feature that relies on a third-party provider (for example AI suggestions, maps, or
          photos), the relevant content is sent to that provider as described in the Privacy Policy.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>use the Service for anything unlawful or harmful;</li>
          <li>attempt to disrupt, overload, reverse-engineer, or gain unauthorized access to the Service;</li>
          <li>scrape or bulk-extract data, or abuse the AI or other features; or</li>
          <li>infringe others' rights or upload content you don't have the right to use.</li>
        </ul>
      </Section>

      <Section heading="AI features">
        <p>
          Passage uses AI to generate suggestions and write-ups. AI output can be wrong or misleading and does not
          represent professional advice. Use your judgment and verify before acting on it.
        </p>
      </Section>

      <Section heading="Third-party services and content">
        <p>
          The Service integrates third-party services and content (such as maps, place data, photos, and
          authentication providers). Your use of those is also subject to their terms, and we're not responsible
          for third-party content or services.
        </p>
      </Section>

      <Section heading="Availability and changes">
        <p>
          We may add, change, or remove features, and we may limit or suspend the Service for maintenance, abuse,
          or other operational reasons. We don't guarantee the Service will always be available or error-free.
        </p>
      </Section>

      <Section heading="Disclaimers and limitation of liability">
        <p>
          The Service is provided "as is" and "as available," without warranties of any kind to the extent
          permitted by law. To the maximum extent permitted by law, Passage is not liable for indirect,
          incidental, or consequential damages, or for any travel decisions made in reliance on the app. Nothing in
          these terms limits liability that cannot be limited by law.
        </p>
      </Section>

      <Section heading="Termination">
        <p>
          You can stop using the Service and delete your account at any time from within the app. We may suspend or
          terminate access if you violate these terms or use the Service in a way that risks harm to others or to
          the Service.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>
          These terms are governed by the laws of the State of Missouri, USA, without regard to its
          conflict-of-law rules. Any disputes will be subject to the courts located in Missouri, USA.
        </p>
      </Section>

      <Section heading="Changes to these terms">
        <p>
          We may update these terms as the Service evolves. We'll update the "Last updated" date above and, for
          significant changes, provide a more prominent notice. Continued use after changes means you accept them.
        </p>
      </Section>

      <Section heading="Contact">
        <p>Questions about these terms? Email <A href={`mailto:${SUPPORT}`}>{SUPPORT}</A>.</p>
      </Section>
    </LegalLayout>
  )
}
