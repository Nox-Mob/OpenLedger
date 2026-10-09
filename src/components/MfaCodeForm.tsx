import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";

/** Asks for the 6-digit code from an authenticator app and raises the session to two-step. */
export function MfaCodeForm({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
      if (fErr) throw fErr;
      const factor = factors.totp.find((f) => f.status === "verified");
      if (!factor) throw new Error("No authenticator app is set up for this account.");
      const { error: vErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: code.trim(),
      });
      if (vErr) throw new Error("That code didn't work. Check the app and try the newest code.");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="mfa-code" className="block text-sm font-medium">
        6-digit code from your authenticator app
      </label>
      <input
        id="mfa-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="tnum w-40 rounded-md border border-input bg-background px-3 py-2 text-lg tracking-widest outline-none focus:ring-2 focus:ring-ring"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : "Verify"}
      </Button>
    </form>
  );
}
