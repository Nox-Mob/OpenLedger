import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, useOrgContext } from "@/components/AppShell";
import {
  listFunds,
  createFund,
  listTags,
  createTag,
  listCategories,
  createCategory,
} from "@/lib/taxonomy.functions";
import { getFundSummary, releaseFromRestriction, setFundRestricted } from "@/lib/funds.functions";
import { formatCents, parseToCents, todayISO } from "@/lib/money";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/funds")({
  head: () => ({
    meta: [
      { title: "Funds - OpenLedgerApp" },
      { name: "description", content: "Track restricted funds, releases, categories, and tags." },
      { property: "og:title", content: "Funds - OpenLedgerApp" },
      {
        property: "og:description",
        content: "Track restricted funds, releases, categories, and tags.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundsPage,
});

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const btnCls =
  "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";

function SimpleListManager({
  title,
  description,
  items,
  onAdd,
  placeholder,
}: {
  title: string;
  description: string;
  items: any[];
  onAdd: (name: string) => Promise<void>;
  placeholder: string;
}) {
  const [name, setName] = useState("");
  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onAdd(name);
          setName("");
        }}
        className="mt-3 flex gap-2"
      >
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
          placeholder={placeholder}
        />
        <button type="submit" className={btnCls} aria-label={`Add ${title}`}>
          <Plus className="h-4 w-4" />
        </button>
      </form>
      <ul className="mt-3 space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded bg-muted/50 px-3 py-1.5 text-sm"
          >
            <span>{item.name}</span>
            {item.type && <span className="text-xs text-muted-foreground">{item.type}</span>}
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-muted-foreground">None yet.</li>}
      </ul>
    </div>
  );
}

function FundsPage() {
  const { org } = useOrgContext();
  const queryClient = useQueryClient();
  const canWrite = org?.role === "admin" || org?.role === "member";

  const summaryQuery = useQuery({
    queryKey: ["fund-summary", org?.id],
    queryFn: () => getFundSummary({ data: { orgId: org!.id } }),
    enabled: !!org,
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", org?.id],
    queryFn: () => listCategories({ data: { orgId: org!.id } }),
    enabled: !!org,
  });
  const tagsQuery = useQuery({
    queryKey: ["tags", org?.id],
    queryFn: () => listTags({ data: { orgId: org!.id } }),
    enabled: !!org,
  });
  // Keep the shared funds list fresh for the transaction form.
  useQuery({
    queryKey: ["funds", org?.id],
    queryFn: () => listFunds({ data: { orgId: org!.id } }),
    enabled: !!org,
  });

  const [fundName, setFundName] = useState("");
  const [restricted, setRestricted] = useState(true);
  const [releaseFor, setReleaseFor] = useState<string | null>(null);
  const [releaseAmount, setReleaseAmount] = useState("");
  const [releaseDate, setReleaseDate] = useState(() => todayISO(new Date(), org?.timezone));
  const [releaseNote, setReleaseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [releaseKey, setReleaseKey] = useState(() => crypto.randomUUID());

  if (!org) return null;
  const funds = summaryQuery.data?.funds ?? [];
  const net = summaryQuery.data?.netAssets;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["fund-summary"] });
    queryClient.invalidateQueries({ queryKey: ["funds"] });
  };

  async function addFund(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createFund({ data: { orgId: org!.id, name: fundName, isRestricted: restricted } });
      toast.success("Fund created");
      setFundName("");
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function submitRelease(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseToCents(releaseAmount);
    if (!cents || cents <= 0) return toast.error("Enter an amount greater than zero.");
    setBusy(true);
    try {
      await releaseFromRestriction({
        data: {
          orgId: org!.id,
          fundId: releaseFor!,
          amountCents: cents,
          date: releaseDate,
          note: releaseNote || undefined,
          idempotencyKey: releaseKey,
        },
      });
      toast.success("Funds released");
      setReleaseFor(null);
      setReleaseAmount("");
      setReleaseNote("");
      setReleaseKey(crypto.randomUUID());
      refresh();
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Funds</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track money given for a specific purpose, and release it once the purpose is met.
          </p>
        </div>
        <Link to="/pledges" className="text-sm font-medium text-primary hover:underline">
          View pledges
        </Link>
      </div>

      {net && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Net assets without donor restrictions" cents={net.withoutRestrictionsCents} />
          <Stat label="Net assets with donor restrictions" cents={net.withRestrictionsCents} />
          <Stat label="Total net assets" cents={net.totalCents} />
        </div>
      )}

      <div className="mt-6 rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Fund balances</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2">Fund</th>
                <th className="py-2">Type</th>
                <th className="py-2 text-right">Received</th>
                <th className="py-2 text-right">Spent</th>
                <th className="py-2 text-right">Released</th>
                <th className="py-2 text-right">Remaining</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {funds.map((f) => (
                <tr key={f.id}>
                  <td className="py-2 font-medium">{f.name}</td>
                  <td className="py-2">
                    {canWrite && f.receivedCents === 0 && f.spentCents === 0 ? (
                      <select
                        aria-label={`Restriction for ${f.name}`}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        value={f.isRestricted ? "r" : "u"}
                        onChange={async (e) => {
                          try {
                            await setFundRestricted({
                              data: {
                                orgId: org.id,
                                fundId: f.id,
                                isRestricted: e.target.value === "r",
                              },
                            });
                            refresh();
                          } catch (err: any) {
                            toast.error(err.message);
                          }
                        }}
                      >
                        <option value="r">Restricted</option>
                        <option value="u">Unrestricted</option>
                      </select>
                    ) : (
                      <span className="text-xs">
                        {f.isRestricted ? "Restricted" : "Unrestricted"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatCents(f.receivedCents)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCents(f.spentCents)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {f.isRestricted ? formatCents(f.releasedCents) : ""}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {formatCents(f.remainingCents)}
                  </td>
                  <td className="py-2 text-right">
                    {canWrite && f.isRestricted && f.remainingCents > 0 && (
                      <button
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => setReleaseFor(f.id)}
                      >
                        Release
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {funds.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-muted-foreground">
                    No funds yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {funds.some((f) => f.isRestricted && f.spentCents > f.releasedCents) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Some restricted funds have more spent than released. Release the spent amount to move
            it out of restriction.
          </p>
        )}

        {releaseFor && (
          <form onSubmit={submitRelease} className="mt-4 grid gap-3 rounded-md border p-4 sm:grid-cols-4">
            <div className="sm:col-span-4 text-sm font-medium">
              Release from {funds.find((f) => f.id === releaseFor)?.name}
            </div>
            <label className="text-sm">
              Amount
              <input
                required
                inputMode="decimal"
                value={releaseAmount}
                onChange={(e) => setReleaseAmount(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="text-sm">
              Date
              <input
                type="date"
                required
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Note
              <input
                value={releaseNote}
                onChange={(e) => setReleaseNote(e.target.value)}
                className={inputCls}
                placeholder="e.g. Roof repair completed"
              />
            </label>
            <div className="flex gap-2 sm:col-span-4">
              <button type="submit" disabled={busy} className={btnCls}>
                Release funds
              </button>
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setReleaseFor(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {canWrite && (
          <form onSubmit={addFund} className="mt-4 flex flex-wrap items-center gap-2">
            <input
              required
              value={fundName}
              onChange={(e) => setFundName(e.target.value)}
              className={`${inputCls} max-w-xs`}
              placeholder="e.g. Building Fund"
            />
            <select
              aria-label="Restriction"
              value={restricted ? "r" : "u"}
              onChange={(e) => setRestricted(e.target.value === "r")}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="r">Restricted by donor</option>
              <option value="u">Unrestricted</option>
            </select>
            <button type="submit" className={btnCls}>
              <Plus className="h-4 w-4" /> Add fund
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SimpleListManager
          title="Categories"
          description="Extra detail on money in and out."
          items={categoriesQuery.data ?? []}
          placeholder="e.g. Office Supplies"
          onAdd={async (name) => {
            try {
              await createCategory({ data: { orgId: org.id, name, type: "expense" } });
              toast.success("Category created");
              queryClient.invalidateQueries({ queryKey: ["categories"] });
            } catch (err: any) {
              toast.error(err.message);
            }
          }}
        />
        <SimpleListManager
          title="Tags"
          description="Flexible labels for any transaction."
          items={tagsQuery.data ?? []}
          placeholder="e.g. annual-gala"
          onAdd={async (name) => {
            try {
              await createTag({ data: { orgId: org.id, name } });
              toast.success("Tag created");
              queryClient.invalidateQueries({ queryKey: ["tags"] });
            } catch (err: any) {
              toast.error(err.message);
            }
          }}
        />
      </div>
    </AppShell>
  );
}

function Stat({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums">{formatCents(cents)}</div>
    </div>
  );
}
