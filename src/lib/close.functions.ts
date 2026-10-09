import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSupabaseRepositories } from "./adapters/supabase";
import { assertCan } from "./permissions";
import * as settings from "./services/settings";
import * as periods from "./services/periods";

// ---------- Books lock + year-end close (admin only) ----------
// Auth + permission here; workflow in src/lib/services/settings.ts.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getBooksStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await assertCan(context.supabase, context.userId, data.orgId, "read");
    const status = await settings.getBooksStatus(
      createSupabaseRepositories(context.supabase),
      data.orgId,
    );
    return { role, ...status };
  });

export const setBooksLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    // null clears the lock (unlock)
    z.object({ orgId: z.string().uuid(), lockedThrough: isoDate.nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "close_books");
    return settings.setBooksLock(
      createSupabaseRepositories(context.supabase),
      data.orgId,
      context.userId,
      data.lockedThrough,
    );
  });

/** Preview what a year-end close would do: net income for the fiscal year. */
export const previewYearEndClose = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: z.string().uuid(), fiscalYearEnd: isoDate }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "close_books");
    return settings.previewYearEndClose(
      createSupabaseRepositories(context.supabase),
      data.orgId,
      data.fiscalYearEnd,
    );
  });

/** Record the year-end close (virtual: no closing transaction) and lock the books. */
export const closeFiscalYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        fiscalYearEnd: isoDate,
        retainedEarningsAccountId: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "close_books");
    return settings.closeFiscalYear(createSupabaseRepositories(context.supabase), {
      orgId: data.orgId,
      userId: context.userId,
      fiscalYearEnd: data.fiscalYearEnd,
      retainedEarningsAccountId: data.retainedEarningsAccountId,
    });
  });

/** Month-end close preview: warnings for unchecked bank/cash/card accounts and open checks. */
export const previewMonthClose = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: z.string().uuid(), monthEnd: isoDate }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "close_books");
    return periods.previewMonthClose(
      createSupabaseRepositories(context.supabase),
      data.orgId,
      data.monthEnd,
    );
  });

export const closeMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ orgId: z.string().uuid(), monthEnd: isoDate, acknowledgeWarnings: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "close_books");
    return periods.closeMonth(createSupabaseRepositories(context.supabase), {
      ...data,
      userId: context.userId,
    });
  });

/** Audited reopen (admin or treasurer): a written reason is required and saved in history. */
export const reopenBooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        reopenThrough: isoDate.nullable(),
        reason: z.string().max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "reopen_books");
    return periods.reopenPeriod(createSupabaseRepositories(context.supabase), {
      ...data,
      userId: context.userId,
    });
  });
