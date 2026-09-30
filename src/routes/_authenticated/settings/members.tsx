import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgContext } from "@/components/AppShell";
import { listOrgMembers, updateMemberRole } from "@/lib/org.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/members")({
  head: () => ({
    meta: [
      { title: "Users & Roles — Open Ledger" },
      { name: "description", content: "Manage who belongs to the organization and what they can do." },
      { property: "og:title", content: "Users & Roles — Open Ledger" },
      { property: "og:description", content: "Manage who belongs to the organization and what they can do." },
    ],
  }),
  component: MembersSettings,
});

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Full access, including settings and roles",
  member: "Can record and edit transactions",
  viewer: "Read-only access",
};

function MembersSettings() {
  const { org } = useOrgContext();
  const queryClient = useQueryClient();

  const { data: members } = useQuery({
    queryKey: ["org-members", org?.id],
    queryFn: () => listOrgMembers({ data: { orgId: org!.id } }),
    enabled: !!org,
  });

  if (!org) return null;
  const isAdmin = org.role === "admin";

  async function changeRole(userId: string, role: "admin" | "member" | "viewer") {
    try {
      await updateMemberRole({ data: { orgId: org!.id, userId, role } });
      queryClient.invalidateQueries({ queryKey: ["org-members", org!.id] });
      toast.success("Role updated");
    } catch (err: any) {
      toast.error(err.message ?? "Could not update role");
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Users & roles</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who can see this organization's books.
          {!isAdmin && " Only admins can change roles."}
        </p>
        <ul className="mt-4 divide-y">
          {(members ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <div className="text-sm font-medium">
                  {m.displayName ?? (m.isYou ? "You" : "Member")}
                  {m.isYou && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                </div>
                <div className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[m.role]}</div>
              </div>
              {isAdmin && !m.isYou ? (
                <select
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={m.role}
                  onChange={(e) => changeRole(m.userId, e.target.value as "admin" | "member" | "viewer")}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="rounded-md border border-border px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
                  {m.role}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Inviting new users by email is coming in a later version. For now, new teammates can create
          their own organization from the sidebar, or you can ask us to link an existing account.
        </p>
      </div>
    </div>
  );
}
