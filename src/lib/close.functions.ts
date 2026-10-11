import { desktopAware } from "@/lib/desktop/bridge";
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

const getBooksStatusCloud = createServerFn({ method: "GET" })
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
export const getBooksStatus = desktopAware("getBooksStatus", getBooksStatusCloud);

const setBooksLockCloud = createServerFn({ method: "POST" })
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
export const setBooksLock = desktopAware("setBooksLock", setBooksLockCloud);

/** Preview what a year-end close would do: net income for the fiscal year. */
const previewYearEndCloseCloud = createServerFn({ method: "GET" })
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
export const previewYearEndClose = desktopAware("previewYearEndClose", previewYearEndCloseCloud);

/** Record the year-end close (virtual: no closing transaction) and lock the books. */
const closeFiscalYearCloud = createServerFn({ method: "POST" })
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
export const closeFiscalYear = desktopAware("closeFiscalYear", closeFiscalYearCloud);

/** Month-end close preview: warnings for unchecked bank/cash/card accounts and open checks. */
const previewMonthCloseCloud = createServerFn({ method: "GET" })
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
export const previewMonthClose = desktopAware("previewMonthClose", previewMonthCloseCloud);

const closeMonthCloud = createServerFn({ method: "POST" })
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
export const closeMonth = desktopAware("closeMonth", closeMonthCloud);

/** Audited reopen (admin or treasurer): a written reason is required and saved in history. */
const reopenBooksCloud = createServerFn({ method: "POST" })
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
    await assertCan(context.supabase, context.userId, data.orgId, "close_books");
    return periods.reopenPeriod(createSupabaseRepositories(context.supabase), {
      ...data,
      userId: context.userId,
    });
  });
export const reopenBooks = desktopAware("reopenBooks", reopenBooksCloud);
