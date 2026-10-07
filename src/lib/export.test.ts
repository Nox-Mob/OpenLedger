import { describe, expect, it } from "vitest";
import { csvCell, escapeFormula, safeFileName, toCsv } from "./export";

describe("exports", () => {
  it("escapes formula-looking text", () => {
    for (const s of ["=SUM(A1)", "+1", "-2+3", "@cmd", "\tx", "\rx"])
      expect(escapeFormula(s)).toBe(`'${s}`);
    expect(escapeFormula("Rent")).toBe("Rent");
  });
  it("keeps numbers numeric, including negatives", () => {
    expect(csvCell(-12.5)).toBe("-12.5");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(
      toCsv([
        ["x", 1],
        [null, "y\nz"],
      ]),
    ).toBe('x,1\r\n,"y\nz"\r\n');
  });
  it("makes safe file names", () => {
    expect(safeFileName("Acme / Books 2026")).toBe("Acme-Books-2026");
  });
});
