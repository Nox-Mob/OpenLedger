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
