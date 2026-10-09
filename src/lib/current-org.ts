import { useEffect, useState } from "react";

const KEY = "openledger_current_org";

export function getStoredOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setStoredOrgId(orgId: string) {
  window.localStorage.setItem(KEY, orgId);
  window.dispatchEvent(new Event("openledger:org-changed"));
}

export function useCurrentOrgId(): string | null {
  const [orgId, setOrgId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setOrgId(window.localStorage.getItem(KEY));
    read();
    window.addEventListener("openledger:org-changed", read);
    return () => window.removeEventListener("openledger:org-changed", read);
  }, []);
  return orgId;
}

/** The organization to show: the stored choice if the user still belongs to it, else the first. */
export function pickCurrentOrg<T extends { id: string }>(
  orgs: T[],
  storedId: string | null,
): T | null {
  return orgs.find((o) => o.id === storedId) ?? orgs[0] ?? null;
}

export function roleLabel(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  if (role === "viewer") return "View only";
  return role;
}
