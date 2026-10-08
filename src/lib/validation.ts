// Shared input rules for amounts, dates and names. Every form and server
// function uses these so the same mistake gets the same message everywhere.
import { isISODate } from "./dates";

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export const NAME_MAX = 120;
export const MAX_AMOUNT_CENTS = 99_999_999_999; // $999,999,999.99

/** Trims and checks a name. */
export function checkName(input: string, label = "Name"): Check<string> {
  const value = input.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, error: `${label} is required.` };
  if (value.length > NAME_MAX)
    return { ok: false, error: `${label} must be ${NAME_MAX} characters or fewer.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value))
    return { ok: false, error: `${label} can't contain hidden control characters.` };
  return { ok: true, value };
}

/** Compares names the way people read them: ignoring case and extra spaces. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

export function duplicateNameMessage(name: string): string {
  return `"${name.trim()}" already exists. Choose a different name.`;
}

export type AmountRule = { allowZero?: boolean; allowNegative?: boolean; label?: string };

/** Parses "$1,234.56" style input into whole cents with clear errors. */
export function checkAmount(input: string, rule: AmountRule = {}): Check<number> {
  const label = rule.label ?? "Amount";
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return { ok: false, error: `${label} is required.` };
  if (!/^-?\d*(\.\d*)?$/.test(cleaned) || cleaned === "-" || cleaned === ".")
    return { ok: false, error: `${label} must be a number, like 125.50.` };
  const decimals = cleaned.split(".")[1] ?? "";
  if (decimals.length > 2)
    return { ok: false, error: `${label} can't have more than two decimal places.` };
  const cents = Math.round(Number((Number(cleaned) * 100).toPrecision(15)));
  if (!rule.allowNegative && cents < 0)
    return { ok: false, error: `${label} can't be negative.` };
  if (!rule.allowZero && cents === 0)
    return { ok: false, error: `${label} must be greater than zero.` };
  if (Math.abs(cents) > MAX_AMOUNT_CENTS)
    return { ok: false, error: `${label} is too large.` };
  return { ok: true, value: cents };
}

/** Checks a YYYY-MM-DD date, optionally against the books lock. */
export function checkDate(
  input: string,
  opts: { label?: string; booksLockedThrough?: string | null } = {},
): Check<string> {
  const label = opts.label ?? "Date";
  if (!input) return { ok: false, error: `${label} is required.` };
  if (!isISODate(input)) return { ok: false, error: `${label} must be a real date (YYYY-MM-DD).` };
  if (opts.booksLockedThrough && input <= opts.booksLockedThrough)
    return {
      ok: false,
      error: `${label} falls in a locked period. The books are locked through ${opts.booksLockedThrough}.`,
    };
  return { ok: true, value: input };
}
