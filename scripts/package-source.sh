#!/usr/bin/env bash
# Builds public/downloads/openledgerapp-source.zip: the app (sign-in onward) without the
# public marketing website. Excludes secrets, git metadata, dependencies and build output.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)/openledgerapp"
OUT="$ROOT/public/downloads/openledgerapp-source.zip"
mkdir -p "$STAGE" "$(dirname "$OUT")"

rsync -a "$ROOT/" "$STAGE/" \
  --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude '.output' \
  --exclude '.vinxi' --exclude '.tanstack' --exclude '.nitro' --exclude '.wrangler' \
  --exclude '.env' --exclude '.env.*' --include '.env.example' --exclude '.lovable' \
  --exclude 'public/downloads' --exclude '*.log' --exclude '.DS_Store'
cp "$ROOT/.env.example" "$STAGE/.env.example" 2>/dev/null || true

# Remove the public website; self-hosted installs open straight to the app.
rm -f "$STAGE/src/routes/changelog.tsx" "$STAGE/src/routes/get-started.tsx" \
  "$STAGE/src/components/WebsiteShell.tsx" "$STAGE/src/assets/open-ledger-desk.jpg"
cat > "$STAGE/src/routes/index.tsx" <<'TSX'
import { createFileRoute, redirect } from "@tanstack/react-router";

// Self-hosted edition: no public website. "/" opens the ledger (sign-in if needed).
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/ledger" });
  },
});
TSX

# Safety: never ship secrets.
if find "$STAGE" -name '.env' -o -name '.env.local' | grep -q .; then
  echo "Refusing to package: env file found" >&2; exit 1
fi

rm -f "$OUT"
(cd "$(dirname "$STAGE")" && zip -qr "$OUT" openledgerapp)
echo "Wrote $OUT"
