import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_CONFIG } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Open Ledger" },
      {
        name: "description",
        content: "Terms for the hosted Open Ledger service and self-hosted Open Ledger software.",
      },
      { property: "og:title", content: "Terms of Service — Open Ledger" },
      {
        property: "og:description",
        content: "Terms for hosted and self-hosted use of Open Ledger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="These draft terms distinguish the hosted Open Ledger service from installations you operate yourself."
    >
      <section>
        <h2>Important draft notice</h2>
        <p>
          These terms use placeholder operator and jurisdiction details and must be reviewed by
          qualified legal counsel before a public launch. The current hosted-service operator is
          listed as {LEGAL_CONFIG.operatorName}, at {LEGAL_CONFIG.mailingAddress}.
        </p>
      </section>
      <section>
        <h2>1. Hosted Open Ledger service</h2>
        <p>
          When you use a service operated by {LEGAL_CONFIG.operatorName}, you receive a limited,
          revocable right to access the service for lawful bookkeeping and recordkeeping. You remain
          responsible for your account, your authorized users, your source documents, and the
          accuracy of information entered or imported.
        </p>
        <p>
          Do not use the service to violate law, interfere with other users, probe security, upload
          malicious material, or access data you do not own or have permission to manage.
        </p>
      </section>
      <section>
        <h2>2. Self-hosted Open Ledger software</h2>
        <p>
          If you install or operate Open Ledger yourself, you—not the hosted-service
          operator—control that deployment, its security, backups, availability, user access,
          updates, and legal compliance. Open-source software rights are governed by the license
          included with the source code. These hosted-service terms do not replace that license.
        </p>
      </section>
      <section>
        <h2>3. Your data</h2>
        <p>
          You retain rights in the data you enter. For the hosted service, you authorize the
          operator to process that data only as needed to provide, secure, maintain, and improve the
          service, and as described in the Privacy Policy.
        </p>
      </section>
      <section>
        <h2>4. No professional advice</h2>
        <p>
          Open Ledger provides tools and calculations, not financial, accounting, tax, or legal
          advice. Automated imports, classifications, balances, and reports may be wrong. Review all
          outputs and consult a qualified professional when appropriate.
        </p>
      </section>
      <section>
        <h2>5. Availability and warranties</h2>
        <p>
          To the maximum extent permitted by law, the hosted service and self-hosted software are
          provided “as is” and “as available,” without promises that they will be uninterrupted,
          error-free, or suitable for a particular filing or decision.
        </p>
      </section>
      <section>
        <h2>6. Liability</h2>
        <p>
          To the maximum extent permitted by law, the operator is not liable for indirect,
          incidental, special, consequential, or exemplary damages, lost profits, lost data, or
          losses caused by reliance on software output. Final limits and any required exceptions
          must be set by counsel.
        </p>
      </section>
      <section>
        <h2>7. Changes and termination</h2>
        <p>
          We may update these terms and will require acceptance when a material new version applies.
          Hosted access may be suspended for security threats, unlawful activity, or material
          violations. Export important records and keep backups appropriate to your needs.
        </p>
      </section>
      <section>
        <h2>8. Governing law and contact</h2>
        <p>
          Placeholder governing law and venue: {LEGAL_CONFIG.jurisdiction}. Questions:{" "}
          {LEGAL_CONFIG.supportEmail}.
        </p>
      </section>
    </LegalPage>
  );
}
