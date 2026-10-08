import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setStoredOrgId } from "@/lib/current-org";
import { roleLabel } from "@/lib/current-org";

type OrgOption = { id: string; name: string; role: string; orgType: string };

/** Sidebar control for people in more than one organization. */
export function OrgSwitcher({ orgs, current }: { orgs: OrgOption[]; current: OrgOption | null }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center justify-between gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-left text-sm text-sidebar-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        aria-label={`Organization: ${current?.name ?? "none"}. Switch organization`}
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {current?.name ?? "Choose organization"}
          </span>
          {current && (
            <span className="block text-xs text-sidebar-accent-foreground/80">
              {roleLabel(current.role)}
            </span>
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Your organizations</DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() => setStoredOrgId(o.id)}
            className="flex items-center justify-between gap-2"
            aria-current={o.id === current?.id ? "true" : undefined}
          >
            <span className="min-w-0">
              <span className="block truncate">{o.name}</span>
              <span className="block text-xs text-muted-foreground">
                {o.orgType === "nonprofit" ? "Nonprofit" : "Business"}, {roleLabel(o.role)}
              </span>
            </span>
            {o.id === current?.id && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/onboarding" className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> New organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
