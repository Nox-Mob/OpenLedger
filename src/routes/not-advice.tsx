import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_CONFIG } from "@/lib/legal";

export const Route = createFileRoute("/not-advice")({
  head: () => ({
    meta: [
      { title: "Not Advice - OpenLedgerApp" },
      {
        name: "description",
        content: "OpenLedgerApp is recordkeeping software and does not provide professional advice.",
      },
      { property: "og:title", content: "Not Advice - OpenLedgerApp" },
      {
        property: "og:description",
        content:
          "Understand the limits of OpenLedgerApp calculations, reports, and automated features.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotAdvicePage,
});

function NotAdvicePage() {
  return (
    <LegalPage
      title="Not Financial, Tax, or Legal Advice"
      summary="OpenLedgerApp helps organize records. It does not replace your judgment or a qualified professional."
    >
      <section>
        <h2>Recordkeeping software, not an adviser</h2>
        <p>
          OpenLedgerApp and its operator do not act as your accountant, bookkeeper, tax preparer,
          attorney, financial adviser, fiduciary, auditor, or compliance professional. Using the
          software does not create a professional-client relationship.
        </p>
      </section>
      <section>
        <h2>Review every result</h2>
        <p>
          Imports, suggested matches, AI-read documents, classifications, balances, reports, and
          exports can be incomplete, delayed, or wrong. You are responsible for comparing them with
          source records, correcting errors, and deciding whether they are appropriate for your
          organization.
        </p>
      </section>
      <section>
        <h2>Filings and decisions remain yours</h2>
        <p>
          Do not rely on OpenLedgerApp alone for tax returns, regulatory filings, grant reporting,
          audits, payroll, investment decisions, legal compliance, or other decisions with
          significant consequences. Laws and accounting requirements vary and change.
        </p>
      </section>
      <section>
        <h2>Ask a qualified professional</h2>
        <p>
          Consult an appropriately licensed or qualified professional who understands your facts and
          jurisdiction. If software output conflicts with professional advice or an authoritative
          source, stop and investigate before acting.
        </p>
      </section>
      <section>
        <h2>Questions</h2>
        <p>
          Questions about this notice may be sent to{" "}
          <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.supportEmail}`}>
            {LEGAL_CONFIG.supportEmail}
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
