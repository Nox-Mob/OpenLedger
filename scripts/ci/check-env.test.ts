import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { privateKeyFindings } from "./check-env.mjs";

const jwt = (role: string) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;

describe(".env public-keys-only check", () => {
  it("accepts publishable values", () => {
    expect(privateKeyFindings("VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc\n# note")).toEqual(
      [],
    );
    expect(privateKeyFindings(`SUPABASE_ANON=${jwt("anon")}`)).toEqual([]);
  });
  it("rejects a service role name, secret key or service role token", () => {
    expect(privateKeyFindings("SUPABASE_SERVICE_ROLE_KEY=x")).toHaveLength(1);
    expect(privateKeyFindings("KEY=sb_secret_abc")).toHaveLength(1);
    expect(privateKeyFindings(`KEY=${jwt("service_role")}`)).toHaveLength(1);
  });
});
