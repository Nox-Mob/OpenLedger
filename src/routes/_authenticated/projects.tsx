import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, useOrgContext } from "@/components/AppShell";
import { listProjects, createProject } from "@/lib/taxonomy.functions";
import { projectSummary } from "@/lib/reports.functions";
import { formatCents, parseToCents } from "@/lib/money";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — Open Ledger" },
      { name: "description", content: "Track budget vs actual spending by project." },
      { property: "og:title", content: "Projects — Open Ledger" },
      { property: "og:description", content: "Track budget vs actual spending by project." },
    ],
  }),
  component: ProjectsPage,
});

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function ProjectsPage() {
  const { org } = useOrgContext();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["project-summary", org?.id],
    queryFn: () => projectSummary({ data: { orgId: org!.id } }),
    enabled: !!org,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    try {
      await createProject({
        data: { orgId: org.id, name, budgetCents: parseToCents(budget) ?? 0 },
      });
      toast.success("Project created");
      setName("");
      setBudget("");
      queryClient.invalidateQueries({ queryKey: ["project-summary"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (err: any) {
      toast.error(err.message ?? "Could not create project");
    }
  }

  if (!org) return null;

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold">Projects</h1>
      <p className="mt-1 text-sm text-muted-foreground">Budget vs actual spending, per project.</p>

      <form
        onSubmit={submit}
        className="mt-5 flex max-w-xl items-end gap-3 rounded-lg border bg-card p-4"
      >
        <div className="flex-1">
          <label className="text-sm font-medium">Project name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="e.g. Summer Food Program"
          />
        </div>
        <div className="w-36">
          <label className="text-sm font-medium">Budget</label>
          <input
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className={`${inputCls} tnum`}
            placeholder="0.00"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border bg-card">
        {(summaryQuery.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No projects yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Budget</th>
                <th className="px-4 py-2 text-right">Spent</th>
                <th className="px-4 py-2 text-right">Remaining</th>
                <th className="px-4 py-2 w-48"></th>
              </tr>
            </thead>
            <tbody>
              {(summaryQuery.data ?? []).map((p) => {
                const remaining = p.budgetCents - p.spentCents;
                const pct =
                  p.budgetCents > 0
                    ? Math.min(100, Math.round((p.spentCents / p.budgetCents) * 100))
                    : 0;
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.status}</td>
                    <td className="tnum px-4 py-3 text-right">{formatCents(p.budgetCents)}</td>
                    <td className="tnum px-4 py-3 text-right">{formatCents(p.spentCents)}</td>
                    <td
                      className={`tnum px-4 py-3 text-right ${remaining < 0 ? "text-destructive" : ""}`}
                    >
                      {formatCents(remaining)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-2 w-full overflow-hidden rounded bg-muted">
                        <div
                          className={`h-full ${pct >= 100 ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
