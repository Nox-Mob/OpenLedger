import type { ParsedRow } from "./csv";

export interface StatementMeta {
  statementStart?: string | undefined;
  statementEnd?: string | undefined;
  beginningBalanceCents?: number | undefined;
  endingBalanceCents?: number | undefined;
}

function ofxDate(v: string | undefined): string | undefined {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

function tag(block: string, name: string): string | undefined {
  // Works for XML (<X>v</X>) and SGML (<X>v\n)
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return m ? m[1]!.trim() : undefined;
}

function cents(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export function parseOfx(text: string): { rows: ParsedRow[]; meta: StatementMeta } {
  const rows: ParsedRow[] = [];
  const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi;
  let m: RegExpExecArray | null;
  let line = 0;
  while ((m = re.exec(text))) {
    line++;
    const b = m[1]!;
    const date = ofxDate(tag(b, "DTPOSTED"));
    const amt = cents(tag(b, "TRNAMT"));
    const name = tag(b, "NAME") ?? "";
    const memo = tag(b, "MEMO") ?? "";
    const description = [name, memo && memo !== name ? memo : ""].filter(Boolean).join(" — ") || "Bank transaction";
    let error: string | undefined;
    if (!date) error = "Missing date";
    else if (amt == null) error = "Missing amount";
    else if (amt === 0) error = "Amount is zero";
    rows.push({ line, date: date ?? "", description: description.slice(0, 300), amountCents: amt ?? 0, externalId: tag(b, "FITID"), error });
  }
  const list = text.match(/<BANKTRANLIST>([\s\S]*?)<STMTTRN>/i)?.[1] ?? text;
  const ledger = text.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|$)/i)?.[1];
  const meta: StatementMeta = {
    statementStart: ofxDate(tag(list, "DTSTART")),
    statementEnd: ofxDate(tag(list, "DTEND")),
    endingBalanceCents: ledger ? cents(tag(ledger, "BALAMT")) : undefined,
  };
  if (meta.endingBalanceCents != null) {
    const sum = rows.filter((r) => !r.error).reduce((s, r) => s + r.amountCents, 0);
    meta.beginningBalanceCents = meta.endingBalanceCents - sum;
  }
  return { rows, meta };
}
