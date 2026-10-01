import { createFileRoute } from "@tanstack/react-router";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/funds")({
  head: () => ({
    meta: [
      { title: "Funds, Categories & Tags — Open Ledger" },
      { name: "description", content: "Manage funds, categories, and tags." },
      { property: "og:title", content: "Funds, Categories & Tags — Open Ledger" },
      { property: "og:description", content: "Manage funds, categories, and tags." },
    ],
  }),
  component: FundsPage,
});

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function SimpleListManager({
  title,
  description,
  items,
  onAdd,
  placeholder,
  extra,
}: {
  title: string;
  description: string;
  items: any[];
  onAdd: (name: string, extra?: any) => Promise<void>;
  placeholder: string;
  extra?: React.ReactNode;
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
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
      {extra}
      <ul className="mt-3 space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded bg-muted/50 px-3 py-1.5 text-sm"
          >
            <span>{item.name}</span>
            {item.is_restricted !== undefined && (
              <span className="text-xs text-muted-foreground">
                {item.is_restricted ? "Restricted" : "Unrestricted"}
              </span>
            )}
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

  const fundsQuery = useQuery({
    queryKey: ["funds", org?.id],
    queryFn: () => listFunds({ data: { orgId: org!.id } }),
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

  if (!org) return null;

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold">Funds, Categories & Tags</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Organize your transactions — basic fund tags (not full fund accounting yet) for grants, categories for detail, tags for
        anything.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <SimpleListManager
          title="Funds"
          description="Pools of money with a purpose."
          items={fundsQuery.data ?? []}
          placeholder="e.g. Building Fund"
          onAdd={async (name) => {
            try {
              await createFund({ data: { orgId: org.id, name, isRestricted: false } });
              toast.success("Fund created");
              queryClient.invalidateQueries({ queryKey: ["funds"] });
            } catch (err: any) {
              toast.error(err.message);
            }
          }}
        />
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
