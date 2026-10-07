// Server-only: this install's backup signing key, derived from the BACKUP_SIGNING_SEED secret.
import { keysFromSeed, type SigningKeys } from "./domain/backup";

let cached: Promise<SigningKeys> | null = null;

export function getSigningKeys(): Promise<SigningKeys> {
  const seed = process.env["BACKUP_SIGNING_SEED"];
  if (!seed)
    throw new Error(
      "Backups can't be signed: BACKUP_SIGNING_SEED is not set on this server. See README.",
    );
  cached ??= keysFromSeed(seed);
  return cached;
}
