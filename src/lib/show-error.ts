// Show a failure as a toast with a clear title and whether anything was recorded.
import { toast } from "sonner";
import { explainError } from "./friendly-errors";

export function showError(err: unknown, fallback?: string, outcome?: string) {
  const e = explainError(err, fallback, outcome);
  toast.error(e.title, { description: e.detail, duration: 10000 });
}
