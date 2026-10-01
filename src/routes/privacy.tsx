import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_CONFIG } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [
    { title: "Privacy Policy — Open Ledger" },
    { name: "description", content: "How the hosted Open Ledger service handles account and bookkeeping data." },
    { property: "og:title", content: "Privacy Policy — Open Ledger" },
    { property: "og:description", content: "Privacy practices for hosted Open Ledger and responsibilities for self-hosted installations." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalPage title="Privacy Policy" summary="This U.S.-first draft explains data handling for the hosted service and separates it from self-hosted installations.">
    <section><h2>Important draft notice</h2><p>This policy uses placeholder company and contact details and requires legal review before launch. It does not claim GDPR compliance or describe an EU/UK offering.</p></section>
    <section><h2>1. Who controls your data</h2><p>For the hosted service, the placeholder operator is {LEGAL_CONFIG.operatorName}, {LEGAL_CONFIG.mailingAddress}. For a self-hosted installation, the person or organization operating that installation controls its data practices; contact that operator directly.</p></section>
    <section><h2>2. Information we process</h2><ul><li>Account details, such as email address, display name, sign-in records, and organization membership.</li><li>Bookkeeping records, including accounts, transactions, imported statement data, projects, funds, reports, and settings.</li><li>Operational information needed for security, reliability, support, limits, and troubleshooting.</li><li>Legal acceptance records showing the document version and time accepted.</li></ul></section>
    <section><h2>3. How information is used</h2><p>We use information to provide and secure the service, authenticate users, isolate organizations, generate requested reports, support imports, enforce usage limits, investigate errors, communicate about the service, and comply with law.</p></section>
    <section><h2>4. AI-assisted PDF reading</h2><p>AI reading is off until an organization administrator enables it. Each upload also requires a user acknowledgement. Extracted results may be wrong and must be reviewed. The production policy must name the processing provider, retention terms, and any applicable subcontractors before launch.</p></section>
    <section><h2>5. Sharing</h2><p>Information may be processed by infrastructure, authentication, email, security, and AI service providers only as needed to operate requested features. We may also disclose information when legally required, to protect rights and safety, or as part of a corporate transaction. A counsel-reviewed provider list should be added before launch.</p></section>
    <section><h2>6. Retention and security</h2><p>We use access controls and organization-level separation, but no system is perfectly secure. Retention periods, backup schedules, deletion procedures, and incident contacts must be finalized before production use. Users should keep independent copies of records they must retain.</p></section>
    <section><h2>7. U.S. privacy choices</h2><p>You may request access, correction, export, or deletion by contacting {LEGAL_CONFIG.privacyEmail}. Some records may be retained where required for security, legal obligations, dispute resolution, or accounting integrity. State-specific notices and request verification procedures must be reviewed before launch.</p></section>
    <section><h2>8. Children and changes</h2><p>The hosted service is not directed to children under 13. We may update this policy and will request acceptance when a material new version applies.</p></section>
    <section><h2>9. Contact</h2><p>Privacy questions and requests: {LEGAL_CONFIG.privacyEmail}. Mailing address: {LEGAL_CONFIG.mailingAddress}.</p></section>
  </LegalPage>;
}