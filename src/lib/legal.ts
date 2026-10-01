export const LEGAL_CONFIG = {
  operatorName: "Alex Weeks Home Lab",
  mailingAddress: "[HOSTING COMPANY MAILING ADDRESS]",
  jurisdiction: "State of Oklahoma",
  privacyEmail: "support@awhl.com",
  supportEmail: "support@awhl.com",
  effectiveDate: "October 1, 2026",
} as const;

export const LEGAL_VERSIONS = {
  terms: "2026-10-01-3",
  privacy: "2026-10-01-2",
  non_advice: "2026-10-01",
} as const;

export type LegalDocumentType = keyof typeof LEGAL_VERSIONS;

export function missingLegalDocuments(
  accepted: Array<{ documentType: string; version: string }>,
): LegalDocumentType[] {
  return (Object.keys(LEGAL_VERSIONS) as LegalDocumentType[]).filter(
    (documentType) =>
      !accepted.some(
        (item) =>
          item.documentType === documentType && item.version === LEGAL_VERSIONS[documentType],
      ),
  );
}
