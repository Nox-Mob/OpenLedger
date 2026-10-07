import type { CatalogAccount } from "@/lib/account-catalog";
import type { Terms } from "@/lib/terminology";
import { accountTypeLabel } from "@/lib/terminology";

export interface ChecklistRow {
  id: string;
  name: string;
  type: string;
  catalog?: CatalogAccount | undefined;
  checked: boolean;
  locked?: string | null | undefined; // reason it can't be changed
  note?: string | null | undefined;
}

const ORDER = ["asset", "liability", "equity", "revenue", "expense"];

export function AccountChecklist({
  rows,
  terms,
  onToggle,
  disabled,
}: {
  rows: ChecklistRow[];
  terms: Terms;
  onToggle: (row: ChecklistRow, next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      {ORDER.map((t) => {
        const group = rows.filter((r) => r.type === t);
        if (!group.length) return null;
        return (
          <div key={t}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {accountTypeLabel(t, terms)}
            </h3>
            <ul className="mt-2 divide-y rounded-md border">
              {group.map((r) => (
                <li key={r.id}>
                  <label
                    className={`flex gap-3 p-3 ${r.locked || disabled ? "" : "cursor-pointer hover:bg-accent/40"}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={r.checked}
                      disabled={!!r.locked || disabled}
                      onChange={(e) => onToggle(r, e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{r.name}</span>
                      {r.catalog ? (
                        <>
                          <span className="block text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Why: </span>
                            {r.catalog.why}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Why not: </span>
                            {r.catalog.whyNot}
                          </span>
                        </>
                      ) : (
                        <span className="block text-xs text-muted-foreground">
                          An account your organization added.
                        </span>
                      )}
                      {r.locked && (
                        <span className="mt-1 block text-xs font-medium text-primary">
                          {r.locked}
                        </span>
                      )}
                      {r.note && (
                        <span className="mt-1 block text-xs text-muted-foreground">{r.note}</span>
                      )}
                      {!r.checked && !r.locked && (
                        <span className="mt-1 block text-xs font-medium text-muted-foreground">
                          Archived, available to reactivate at any time.
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
