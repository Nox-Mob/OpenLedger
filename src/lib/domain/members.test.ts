import { describe, expect, it } from "vitest";
import {
  assertCanDeleteOrg,
  assertCanRemove,
  assertCanTransfer,
  assertInviteUsable,
  inviteStatus,
} from "./members";

const now = new Date("2026-10-07T12:00:00Z");
const base = { expiresAt: "2026-10-14T12:00:00Z", usedAt: null, revokedAt: null };

describe("invites", () => {
  it("reports status", () => {
    expect(inviteStatus(base, now)).toBe("active");
    expect(inviteStatus({ ...base, usedAt: "x" }, now)).toBe("used");
    expect(inviteStatus({ ...base, revokedAt: "x" }, now)).toBe("revoked");
    expect(inviteStatus({ ...base, expiresAt: "2026-10-07T11:59:59Z" }, now)).toBe("expired");
  });
  it("is single use and expires", () => {
    expect(() => assertInviteUsable(base, now)).not.toThrow();
    expect(() => assertInviteUsable(null, now)).toThrow(/not valid/);
    expect(() => assertInviteUsable({ ...base, usedAt: "x" }, now)).toThrow(/already used/);
    expect(() => assertInviteUsable({ ...base, expiresAt: "2026-10-01T00:00:00Z" }, now)).toThrow(
      /expired/,
    );
  });
});

const members = [
  { userId: "owner", role: "admin" as const },
  { userId: "a2", role: "admin" as const },
  { userId: "m", role: "member" as const },
];

describe("members", () => {
  it("protects owner and last admin", () => {
    expect(() => assertCanRemove(members, "m", "owner")).not.toThrow();
    expect(() => assertCanRemove(members, "owner", "owner")).toThrow(/owner/);
    expect(() => assertCanRemove(members, "a2", "owner")).not.toThrow();
    expect(() => assertCanRemove([members[0]!, members[2]!], "owner", "x")).toThrow(/one admin/);
    expect(() => assertCanRemove(members, "nobody", "owner")).toThrow();
  });
  it("transfers only from the owner to another admin", () => {
    expect(() => assertCanTransfer(members, "owner", "owner", "a2")).not.toThrow();
    expect(() => assertCanTransfer(members, "a2", "owner", "a2")).toThrow(/Only the owner/);
    expect(() => assertCanTransfer(members, "owner", "owner", "m")).toThrow(/another admin/);
  });
  it("deletes only for the owner with matching name", () => {
    expect(() => assertCanDeleteOrg("owner", "owner", "Acme", " Acme ")).not.toThrow();
    expect(() => assertCanDeleteOrg("a2", "owner", "Acme", "Acme")).toThrow();
    expect(() => assertCanDeleteOrg("owner", "owner", "Acme", "acme")).toThrow(/exactly/);
  });
});
