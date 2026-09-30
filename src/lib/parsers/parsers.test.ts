import { describe, expect, it } from "vitest";
import { applyMapping, guessMapping, parseAmount, parseDate, tokenizeCsv } from "./csv";
import { parseOfx } from "./ofx";

describe("csv", () => {
  it("handles quoted commas and escaped quotes", () => {
    const rows = tokenizeCsv('Date,Description,Amount\n2026-09-01,"Acme, Inc ""HQ""",-12.50\n');
    expect(rows[1]).toEqual(["2026-09-01", 'Acme, Inc "HQ"', "-12.50"]);
  });
  it("parses amounts", () => {
    expect(parseAmount("$1,234.56")).toBe(123456);
    expect(parseAmount("(10.00)")).toBe(-1000);
    expect(parseAmount("abc")).toBeNull();
  });
  it("parses dot-locale amounts strictly", () => {
    expect(parseAmount("1234")).toBe(123400);
    expect(parseAmount("1,234,567.89")).toBe(123456789);
    expect(parseAmount("-5.00")).toBe(-500);
    expect(parseAmount("5.00-")).toBe(-500);
    expect(parseAmount("25.00 CR")).toBe(2500);
    expect(parseAmount("25.00 DR")).toBe(-2500);
    expect(parseAmount("+7.5")).toBe(750);
  });
  it("rejects hex, scientific notation, and 3+ decimals", () => {
    expect(parseAmount("0x10")).toBeNull();
    expect(parseAmount("1e3")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("1.2.3")).toBeNull();
    expect(parseAmount("12,34.56")).toBeNull(); // broken thousands grouping
  });
  it("parses comma-locale amounts", () => {
    expect(parseAmount("1.234,56", "comma")).toBe(123456);
    expect(parseAmount("1.234", "comma")).toBe(123400); // thousands, not decimals
    expect(parseAmount("(1.234,56)", "comma")).toBe(-123456);
    expect(parseAmount("0,05", "comma")).toBe(5);
    expect(parseAmount("1,234", "comma")).toBeNull(); // 3 digits after comma is ambiguous
    expect(parseAmount("1,234.56", "comma")).toBeNull(); // dot-locale value rejected
  });
  it("guesses the decimal separator from the file", () => {
    const eu = tokenizeCsv("Date;Description;Amount\n2026-09-01;Rent;1.234,56\n".replaceAll(";", ","));
    // comma decimals dominate → "comma"
    expect(guessMapping(tokenizeCsv("Date,Description,Amount\n2026-09-01,Rent,1234,56\n2026-09-02,Sale,50,00\n")).decimalSeparator).toBe("comma");
    expect(guessMapping(tokenizeCsv("Date,Description,Amount\n2026-09-01,Rent,1234.56\n2026-09-02,Sale,50.00\n")).decimalSeparator).toBe("dot");
    void eu;
  });
  it("parses dates", () => {
    expect(parseDate("09/03/2026", "MDY")).toBe("2026-09-03");
    expect(parseDate("09/03/2026", "DMY")).toBe("2026-03-09");
    expect(parseDate("31/02/2026", "DMY")).toBeNull();
  });
  it("maps split debit/credit and flags errors", () => {
    const rows = tokenizeCsv("Date,Description,Debit,Credit\n2026-09-01,Rent,100.00,\n2026-09-02,Sale,,50\nbad,X,1,\n");
    const m = guessMapping(rows);
    expect(m.amountMode).toBe("split");
    const out = applyMapping(rows, m);
    expect(out[0]!.amountCents).toBe(-10000);
    expect(out[1]!.amountCents).toBe(5000);
    expect(out[2]!.error).toBeTruthy();
  });
});

describe("ofx", () => {
  it("parses SGML statements", () => {
    const text = `<OFX><BANKTRANLIST><DTSTART>20260901<DTEND>20260930
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905<TRNAMT>-25.00<FITID>A1<NAME>Coffee
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260910<TRNAMT>100.00<FITID>A2<NAME>Deposit
</BANKTRANLIST><LEDGERBAL><BALAMT>575.00<DTASOF>20260930</LEDGERBAL></OFX>`;
    const { rows, meta } = parseOfx(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-09-05", amountCents: -2500, externalId: "A1" });
    expect(meta).toMatchObject({ statementStart: "2026-09-01", statementEnd: "2026-09-30", endingBalanceCents: 57500, beginningBalanceCents: 50000 });
  });
});
