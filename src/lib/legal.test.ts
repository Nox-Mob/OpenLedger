import { describe, expect, it } from "vitest";
import { LEGAL_VERSIONS, missingLegalDocuments } from "./legal";

describe("legal acceptance versions", () => {
  it("requires every current document for a new user", () => {
    expect(missingLegalDocuments([])).toEqual(["terms", "privacy", "non_advice"]);
  });

  it("requires only documents whose current version is missing", () => {
    expect(
      missingLegalDocuments([
        { documentType: "terms", version: LEGAL_VERSIONS.terms },
        { documentType: "privacy", version: "old-version" },
        { documentType: "non_advice", version: LEGAL_VERSIONS.non_advice },
      ]),
    ).toEqual(["privacy"]);
  });
});
