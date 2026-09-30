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

## Architecture rules

- Double-entry is enforced twice: the `createTransaction` server fn validates entries sum to 0, and a deferred constraint trigger `entries_balanced_after_write` on `entries` re-checks at commit. Never bypass either.
- Entry sign convention: `amount_cents > 0` = debit, `< 0` = credit. Display balances flip sign for credit-normal accounts (liability/equity/revenue) via `displayBalance()` in src/lib/terminology.ts.
- Entries are never edited in place — void the transaction (status='void', trigger skips balance check) and create a new one. Keeps the audit trail honest.
- Bank imports are evidence only: `bank_transactions` rows link to ledger `transactions` via `transaction_id`; dedup is a SHA-256 fingerprint unique per (org, account).
- Terminology is presentation-only: engine vocabulary stays in the DB, org type (nonprofit/business) and user preference (simplified/accounting) map labels in src/lib/terminology.ts.
- Current org id is stored in localStorage (`openledger_current_org`) via src/lib/current-org.ts; `useOrgContext()` in AppShell resolves org + terms.
- All org data access goes through `requireSupabaseAuth` server fns in src/lib/*.functions.ts; RLS scopes every table by org membership (is_org_member / can_write_org / has_org_role).
- Dev-only demo account: demo@openledger.dev (fixed UUID d0e00000-...-0001) with seeded org "Acme Demo Co" (d0e00000-...-0002). The "Explore the demo account" button on /auth is gated by import.meta.env.DEV so it never renders in production builds. Seed rows use fixed d0e00000-* UUIDs and ON CONFLICT DO NOTHING for idempotent re-seeding. Demo data lives in the shared backend — remove it before real production use.
