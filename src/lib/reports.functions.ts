import { desktopAware } from "@/lib/desktop/bridge";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSupabaseRepositories } from "./adapters/supabase";
import * as reports from "./services/reports";

// Reports run through src/lib/services/reports.ts so the desktop edition shares them.
// Only posted transactions are included; voided ones are excluded from every report.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const orgId = z.string().uuid();

const incomeStatementCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ orgId, from: isoDate.optional(), to: isoDate.optional() }).parse(input),
  )
  .handler(async ({ data, context }) =>
    reports.incomeStatement(createSupabaseRepositories(context.supabase), data.orgId, data),
  );
export const incomeStatement = desktopAware("incomeStatement", incomeStatementCloud);

const balanceSheetCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId, asOf: isoDate.optional() }).parse(input))
  .handler(async ({ data, context }) =>
    reports.balanceSheet(createSupabaseRepositories(context.supabase), data.orgId, data.asOf),
  );
export const balanceSheet = desktopAware("balanceSheet", balanceSheetCloud);

const trialBalanceCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId, asOf: isoDate.optional() }).parse(input))
  .handler(async ({ data, context }) =>
    reports.trialBalance(createSupabaseRepositories(context.supabase), data.orgId, data.asOf),
  );
export const trialBalance = desktopAware("trialBalance", trialBalanceCloud);

const projectSummaryCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId }).parse(input))
  .handler(async ({ data, context }) =>
    reports.projectSummary(createSupabaseRepositories(context.supabase), data.orgId),
  );
export const projectSummary = desktopAware("projectSummary", projectSummaryCloud);

const cashHistoryCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId, days: z.number().int().min(7).max(1100) }).parse(input))
  .handler(async ({ data, context }) =>
    reports.cashHistory(createSupabaseRepositories(context.supabase), data.orgId, data.days),
  );
export const cashHistory = desktopAware("cashHistory", cashHistoryCloud);

const generalLedgerCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId,
        from: isoDate,
        to: isoDate,
        accountName: z.string().max(200).optional(),
        fundId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    reports.generalLedger(createSupabaseRepositories(context.supabase), data.orgId, data),
  );
export const generalLedger = desktopAware("generalLedger", generalLedgerCloud);
