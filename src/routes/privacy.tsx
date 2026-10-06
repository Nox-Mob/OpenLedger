import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_CONFIG } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy - OpenLedgerApp" },
      {
        name: "description",
        content:
          "How Alex Weeks Home Lab protects OpenLedgerApp data and preserves user ownership.",
      },
      { property: "og:title", content: "Privacy Policy - OpenLedgerApp" },
      {
        property: "og:description",
        content:
          "OpenLedgerApp users own their data. We do not sell it or share it for anyone else's use.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="You own your data, 100%. We do not sell it or share it for anyone else’s use. Because we aren’t like that."
    >
      <section>
        <h2>1. Scope and who we are</h2>
        <p>
          This Privacy Policy describes how {LEGAL_CONFIG.operatorName} (“we,” “us,” or “our”)
          handles information when it operates the hosted OpenLedgerApp service, website, and
          related support (together, the “Service”). It applies to account holders, organization
          members, and visitors who use the hosted Service.
        </p>
        <p>
          If you use a self-hosted copy of OpenLedgerApp, the person or organization operating that
          installation controls its data practices. This policy does not govern independent,
          self-hosted installations that we do not operate.
        </p>
      </section>
      <section>
        <h2>2. Your data belongs to you</h2>
        <p>
          You retain 100% ownership of the content and records you or your authorized users enter,
          import, upload, or create through OpenLedgerApp (“Your Data”). Using the Service does not
          transfer ownership of Your Data to us. You give us only the limited permission needed to
          host, process, back up, secure, and display Your Data so we can provide features you
          choose to use. This permission ends when Your Data is deleted, except for temporary backup
          copies and records we must retain for security or legal reasons.
        </p>
      </section>
      <section>
        <h2>3. Information we collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> email address, display name, sign-in records,
            password-verification information, and organization membership and role.
          </li>
          <li>
            <strong>Your bookkeeping data:</strong> organizations, accounts, transactions, imported
            statements, attachments, projects, funds, reconciliations, reports, and settings.
          </li>
          <li>
            <strong>Technical and usage information:</strong> IP address, browser and device
            details, request times, security events, error information, and feature usage needed to
            operate, protect, and troubleshoot the Service.
          </li>
          <li>
            <strong>Support communications:</strong> information you include when you contact us.
          </li>
          <li>
            <strong>Consent and legal records:</strong> the document version and time you accepted
            applicable terms, notices, or optional features.
          </li>
        </ul>
        <p>We do not intentionally collect information we do not need to provide the Service.</p>
      </section>
      <section>
        <h2>4. How we use information</h2>
        <p>
          We use information only to provide and maintain OpenLedgerApp; authenticate users and
          enforce organization permissions; process transactions, imports, reconciliations, and
          reports you request; protect accounts and prevent abuse; diagnose errors and improve
          reliability; respond to support requests; communicate important Service or policy changes;
          enforce limits; and meet binding legal obligations.
        </p>
      </section>
      <section>
        <h2>5. We do not sell or share your data</h2>
        <p>
          We do not sell, rent, trade, or license Your Data or personal information. We do not share
          it with advertisers, data brokers, marketers, other OpenLedgerApp organizations, or anyone
          who wants to use it for their own purposes. We do not use Your Data to advertise to you or
          to build advertising profiles. Because we aren’t like that.
        </p>
        <p>
          To run the hosted Service, narrowly scoped infrastructure providers may process data on
          our behalf for hosting, database, authentication, email delivery, security, backups, and
          features you deliberately request. They are service providers, not owners of Your Data,
          and may process it only to deliver those services to us. We disclose only what is needed
          for that purpose. We may also disclose specific information if a valid law, court order,
          or legal process requires it, or when necessary to prevent imminent harm or defend the
          Service and its users. We will challenge overbroad requests when reasonably possible.
        </p>
      </section>
      <section>
        <h2>6. Optional AI-assisted PDF reading</h2>
        <p>
          AI-assisted PDF reading is optional and off until an organization administrator enables
          it. Each upload requires a separate acknowledgement. When you choose this feature, the
          uploaded statement is sent to our AI processing provider solely to extract the requested
          transaction information. Do not use this feature if you do not want that document
          processed by the provider. AI output may be wrong and must be reviewed before posting.
        </p>
      </section>
      <section>
        <h2>7. Cookies and local storage</h2>
        <p>
          The Service uses cookies or similar browser storage needed to keep you signed in, protect
          your session, remember essential preferences, and operate requested features. We do not
          use advertising cookies or cross-site behavioral tracking.
        </p>
      </section>
      <section>
        <h2>8. Retention and deletion</h2>
        <p>
          We retain account information and Your Data while your account or organization remains
          active and as needed to provide the Service. You may request deletion by contacting us.
          Deleted information may remain temporarily in encrypted backups until those backups age
          out. We may retain limited security logs, acceptance records, or other information when
          reasonably necessary to prevent fraud, resolve disputes, enforce agreements, or comply
          with law. Deleting bookkeeping records may be limited where OpenLedgerApp preserves an
          audit trail; in that case, you may delete the organization or account instead.
        </p>
      </section>
      <section>
        <h2>9. Security and account responsibility</h2>
        <p>
          We use access controls, organization-level data separation, encrypted connections,
          password protections, audit records, and other safeguards designed to protect information.
          No system can guarantee absolute security. Keep your credentials confidential, limit
          organization access to people you trust, promptly remove users who no longer need access,
          and maintain independent copies of records you are legally required to keep.
        </p>
      </section>
      <section>
        <h2>10. Your choices and rights</h2>
        <p>
          You may ask to access, correct, export, or delete personal information associated with
          your account. Organization administrators control access to organization records. We may
          need to verify your identity and authority before completing a request. We will honor
          applicable U.S. state privacy rights and will not discriminate against you for exercising
          them. We do not sell or share personal information for cross-context behavioral
          advertising, so there is no sale or advertising share to opt out of.
        </p>
      </section>
      <section>
        <h2>11. Data location</h2>
        <p>
          The hosted Service may process and store information in the United States or another
          location where our service providers operate. If you access the Service from outside the
          United States, your information may be transferred to and processed in the United States.
          This policy does not represent that the Service is offered under, or certified for,
          European Union or United Kingdom data-protection frameworks.
        </p>
      </section>
      <section>
        <h2>12. Children</h2>
        <p>
          The Service is intended for adults and organizations and is not directed to children under
          13. We do not knowingly collect personal information from children under 13. If you
          believe a child provided information to us, contact us so we can investigate and delete
          it.
        </p>
      </section>
      <section>
        <h2>13. Changes to this policy</h2>
        <p>
          We may update this policy as the Service or law changes. We will post the updated
          effective date and, when a material change applies to registered users, provide notice and
          request acceptance of the new version in the Service.
        </p>
      </section>
      <section>
        <h2>14. Contact us</h2>
        <p>
          Contact {LEGAL_CONFIG.operatorName} at{" "}
          <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.privacyEmail}`}>
            {LEGAL_CONFIG.privacyEmail}
          </a>{" "}
          with privacy questions, support requests, or requests to access, correct, export, or
          delete your information.
        </p>
      </section>
    </LegalPage>
  );
}
