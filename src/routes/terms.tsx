import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_CONFIG } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service - OpenLedgerApp" },
      {
        name: "description",
        content:
          "Terms for the hosted OpenLedgerApp service and self-hosted OpenLedgerApp software.",
      },
      { property: "og:title", content: "Terms of Service - OpenLedgerApp" },
      {
        property: "og:description",
        content: "Terms for hosted and self-hosted use of OpenLedgerApp.",
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
      summary="These terms distinguish the hosted OpenLedgerApp service from installations you operate yourself."
    >
      <section>
        <h2>Who operates the hosted service</h2>
        <p>
          The hosted OpenLedgerApp service is operated by {LEGAL_CONFIG.operatorName}. These terms
          govern your use of that hosted service.
        </p>
      </section>
      <section>
        <h2>1. Hosted OpenLedgerApp service</h2>
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
        <h2>2. Self-hosted OpenLedgerApp software</h2>
        <p>
          If you install or operate OpenLedgerApp yourself, you—not the hosted-service
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
          OpenLedgerApp provides tools and calculations, not financial, accounting, tax, or legal
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
          These Terms and any dispute arising from or relating to OpenLedgerApp or the hosted
          Service are governed by the laws of the {LEGAL_CONFIG.jurisdiction}, without regard to its
          conflict-of-law rules. Any legal action or proceeding must be brought exclusively in a
          state or federal court located in the State of Oklahoma, and each party consents to the
          personal jurisdiction and venue of those courts.
        </p>
        <p>
          This governing-law and venue provision supersedes and replaces every prior or
          contemporaneous agreement, representation, understanding, or statement concerning venue,
          whether written, oral, expressed, or implied.
        </p>
      </section>
      <section>
        <h2>9. Indemnification</h2>
        <p>
          To the extent permitted by law, you agree to defend, indemnify, and hold harmless{" "}
          {LEGAL_CONFIG.operatorName}, its owners, officers, employees, contractors, and agents from
          claims, damages, losses, liabilities, judgments, costs, and reasonable attorneys’ fees
          arising from or related to your use or misuse of the hosted Service, Your Data, your
          violation of these Terms or applicable law, or your infringement of another person’s
          rights. This obligation does not apply to the extent a claim results from the indemnified
          party’s own gross negligence or willful misconduct.
        </p>
      </section>
      <section>
        <h2>10. Severability and survival</h2>
        <p>
          If any provision of these Terms is held invalid, illegal, or unenforceable, it will be
          enforced to the greatest extent permitted by law, and the remaining provisions will remain
          in full force and effect. Provisions that by their nature should survive termination will
          survive, including provisions concerning ownership, no professional advice, warranty
          disclaimers, limits of liability, indemnification, governing law, venue, and dispute
          resolution.
        </p>
      </section>
      <section>
        <h2>11. Contact</h2>
        <p>
          Questions about these Terms may be sent to{" "}
          <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.supportEmail}`}>
            {LEGAL_CONFIG.supportEmail}
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
