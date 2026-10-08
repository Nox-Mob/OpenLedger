// Fails if the tracked .env contains anything that looks like a private key.
// .env is committed on purpose (the Lovable preview needs it) and must hold public values only.
import { existsSync, readFileSync } from "node:fs";

export function privateKeyFindings(text) {
  const bad = [];
  text.split("\n").forEach((line, i) => {
    const l = line.trim();
    if (!l || l.startsWith("#")) return;
    const [name, ...rest] = l.split("=");
    const value = rest.join("=").replace(/^["']|["']$/g, "");
    if (/SERVICE_ROLE|SECRET|PASSWORD|PRIVATE|DB_URL/i.test(name)) bad.push(`${i + 1}: ${name}`);
    else if (/sb_secret_/.test(value)) bad.push(`${i + 1}: ${name} (secret key)`);
    else if (/^eyJ[\w-]+\.([\w-]+)\./.test(value)) {
      try {
        const payload = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString());
        if (payload.role === "service_role") bad.push(`${i + 1}: ${name} (service role token)`);
      } catch {
        /* not a token */
      }
    }
  });
  return bad;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  const bad = privateKeyFindings(text);
  if (bad.length) {
    console.error(".env must only hold public keys. Remove and rotate:\n" + bad.join("\n"));
    process.exit(1);
  }
  console.log(".env holds public keys only.");
}
