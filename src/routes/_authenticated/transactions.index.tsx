import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { errorMessage } from "@/lib/errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { AppShell, OrgPending } from "@/components/AppShell";
import { useOrgContext } from "@/hooks/use-org-context";
import { listTransactions, voidTransaction } from "@/lib/transactions.functions";
import { formatCents } from "@/lib/money";
import { PlusCircle, Ban } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transactions/")({
  head: () => ({
    meta: [
      { title: "Transactions - OpenLedgerApp" },
      { name: "description", content: "Every transaction in your ledger." },
      { property: "og:title", content: "Transactions - OpenLedgerApp" },
      { property: "og:description", content: "Every transaction in your ledger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { org, terms, terminology } = useOrgContext();
  const [expanded, setExpanded] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const txQuery = useQuery({
    queryKey: ["transactions", org?.id, "all"],
    queryFn: () => listTransactions({ data: { orgId: org!.id, limit: 300 } }),
    enabled: !!org,
  });

  async function handleVoid(id: string) {
    if (!org) return;
    try {
      await voidTransaction({ data: { orgId: org.id, transactionId: id } });
      toast.success("Transaction voided");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err) {
      toast.error(errorMessage(err, "Could not void transaction"));
    }
  }

  if (!org) return <OrgPending />;

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Transactions</h1>
        <Link
          to="/transactions/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <PlusCircle className="h-4 w-4" /> New Transaction
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border bg-card">
        {txQuery.isPending ? (
          <LoadingState label="Loading transactions" />
        ) : txQuery.isError ? (
          <ErrorState message={errorMessage(txQuery.error)} onRetry={() => txQuery.refetch()} />
        ) : (txQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Record money coming in or going out, or import a bank file."
            action={
              <Link
                to="/transactions/new"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                New transaction
              </Link>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(txQuery.data ?? []).map((t) => {
                const total = t.entries
                  .filter((e) => e.amountCents > 0)
                  .reduce((a, e) => a + e.amountCents, 0);
                const isOpen = expanded === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr
                      key={t.id}
                      onClick={() => setExpanded(isOpen ? null : t.id)}
                      className="cursor-pointer border-b last:border-0 hover:bg-accent/40"
                    >
                      <td className="tnum px-4 py-3 text-muted-foreground">{t.transactionDate}</td>
                      <td className="px-4 py-3">
                        {t.description}
                        {t.status === "void" && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            void
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {t.source.replace("_", " ")}
                      </td>
                      <td className="tnum px-4 py-3 text-right">{formatCents(total)}</td>
                      <td className="px-4 py-3 text-right">
                        {t.status === "posted" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVoid(t.id);
                            }}
                            title="Void transaction"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${t.id}-detail`} className="border-b bg-muted/30">
                        <td colSpan={5} className="px-6 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-muted-foreground">
                                <th className="py-1">Account</th>
                                <th className="py-1">Details</th>
                                <th className="py-1 text-right">{terms.debit}</th>
                                <th className="py-1 text-right">{terms.credit}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {t.entries.map((e) => (
                                <tr key={e.id}>
                                  <td className="py-1 font-medium">{e.accountName}</td>
                                  <td className="py-1 text-muted-foreground">
                                    {[e.categoryName, e.projectName, e.fundName, e.memo]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </td>
                                  <td className="tnum py-1 text-right">
                                    {e.amountCents > 0 ? formatCents(e.amountCents) : ""}
                                  </td>
                                  <td className="tnum py-1 text-right">
                                    {e.amountCents < 0 ? formatCents(-e.amountCents) : ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {terms.levels.debitCredit !== "accounting" && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Every transaction moves money between accounts. Increases always equal
                              decreases.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
