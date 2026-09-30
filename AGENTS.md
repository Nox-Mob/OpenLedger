<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md — Open Ledger

- Double-entry enforced in createTransaction + deferred DB trigger: posted tx needs ≥2 entries, sum=0, ≥1 debit and ≥1 credit (void exempt). Never bypass.
- amount_cents >0 debit, <0 credit; displayBalance() flips credit-normal types.
- Never edit entries in place: void + recreate (audit trail).
- Bank imports are evidence only (bank_transactions.transaction_id link, SHA-256/FITID fingerprint dedup); import_batch undoable until a row posts.
- Terminology is presentation-only: org level + term_overrides; screens add user overrides, reports/PDFs use org only.
- All org data via requireSupabaseAuth server fns in src/lib/*.functions.ts; RLS by org membership. Org settings/account setup admin-only (requireOrgAdmin) and audit-logged.
- Demo accounts (d0e00000-* seeds) show on /auth only in DEV/preview hosts; wipe before production.
- Reconciliation stamps entries.reconciliation_id; finish needs difference=0; completed ones lock entries via triggers.
- Starter accounts come from src/lib/account-catalog.ts (onboarding wizard + Settings → Accounts); accounts with entries can't be removed.
