import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { cashHistory } from "@/lib/reports.functions";
import { formatCents } from "@/lib/money";

const RANGES = [
  { label: "1 month", days: 30 },
  { label: "3 months", days: 91 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
] as const;

const config = { cents: { label: "Cash on hand", color: "var(--primary)" } } satisfies ChartConfig;

function fmtDay(iso: string, withYear = false) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC", ...(withYear ? { year: "numeric" } : {}),
  });
}

export function CashChart({ orgId, currency }: { orgId: string; currency: string }) {
  const [days, setDays] = useState<number>(91);
  const q = useQuery({
    queryKey: ["cash-history", orgId, days],
    queryFn: () => cashHistory({ data: { orgId, days } }),
  });
  const data = q.data ?? [];
  const compact = (c: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(c / 100);

  return (
    <div className="mt-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Cash on hand over time</h2>
        <div role="group" aria-label="Time range" className="inline-flex rounded-md border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={`rounded px-3 py-1 text-xs font-medium ${days === r.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {q.isLoading ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <ChartContainer config={config} className="mt-4 h-56 w-full">
          <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-cents)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-cents)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(d) => fmtDay(d)} />
            <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={compact} />
            <ChartTooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
                    <div className="text-muted-foreground">{fmtDay(payload[0].payload.date, true)}</div>
                    <div className="tnum font-semibold">{formatCents(payload[0].payload.cents)}</div>
                  </div>
                ) : null
              }
            />
            <Area type="stepAfter" dataKey="cents" stroke="var(--color-cents)" strokeWidth={2} fill="url(#cashFill)" />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}
