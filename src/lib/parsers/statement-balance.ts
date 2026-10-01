/** Pure: does opening balance + rows = closing balance? Amounts in cents, statement sign. */
export type BalanceCheck =
  | { status: "unknown" }
  | { status: "match"; expectedCents: number }
  | { status: "mismatch"; expectedCents: number; gapCents: number };

export function checkStatementBalance(
  beginningCents: number | null | undefined,
  rowCents: number[],
  endingCents: number | null | undefined,
): BalanceCheck {
  if (beginningCents == null || endingCents == null || !Number.isFinite(beginningCents) || !Number.isFinite(endingCents))
    return { status: "unknown" };
  const sum = rowCents.reduce((s, c) => s + (Number.isFinite(c) ? c : 0), 0);
  const expectedCents = beginningCents + sum;
  const gapCents = endingCents - expectedCents;
  return gapCents === 0 ? { status: "match", expectedCents } : { status: "mismatch", expectedCents, gapCents };
}

/** Per-person AI PDF reading limits. */
export const PDF_LIMITS = { perDay: 10, perMonth: 50, maxBytes: 10 * 1024 * 1024, maxPages: 40 } as const;
