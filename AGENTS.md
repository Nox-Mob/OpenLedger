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

- Double-entry enforced twice: `createTransaction` checks sum=0; deferred trigger `entries_balanced_after_write` re-checks at commit. Posted tx invariant: ≥2 entries, sum(amount_cents)=0, ≥1 positive and ≥1 negative entry (void exempt). Never bypass.
- Sign convention: amount_cents > 0 = debit, < 0 = credit. Balances flip sign for credit-normal accounts (liability/equity/revenue) via `displayBalance()` in src/lib/terminology.ts.
- Entries are never edited in place — void the transaction (status='void', trigger skips checks) and create a new one. Keeps the audit trail honest.
- Bank imports are evidence only: `bank_transactions` link to ledger `transactions` via `transaction_id`; dedup is a SHA-256 fingerprint unique per (org, account).
- Terminology is presentation-only: engine vocabulary stays in the DB; org type (nonprofit/business) and org-wide terminology (simplest/simple/accounting; legacy "simplified" normalizes to simplest) map labels in src/lib/terminology.ts.
- Current org id in localStorage (`openledger_current_org`) via src/lib/current-org.ts; `useOrgContext()` in AppShell resolves org + terms from org.terminology (profile preference is fallback only). Reports and PDFs follow the org setting.
- All org data access goes through `requireSupabaseAuth` server fns in src/lib/*.functions.ts; RLS scopes every table by org membership (is_org_member / can_write_org / has_org_role).
- Demo accounts (dev-only buttons on /auth, gated by import.meta.env.DEV): demo@openledger.dev → "Acme Demo Co" business (d0e00000-...-0002); demo-np@openledger.dev → "Riverside Community Kitchen" nonprofit (d0e00000-...-0004). Seed rows use fixed d0e00000-* UUIDs, ON CONFLICT DO NOTHING. Demo data lives in the shared backend — wipe before real production use.
- Org settings (name, org_type, currency, fiscal year, terminology) are admin-only: updateOrganization/updateMemberRole check admin server-side (requireOrgAdmin) plus RLS, and write audit_log rows. Settings is a layout route (settings.tsx shell) with sections: index (org profile), members (users & roles), preferences (personal).
- /onboarding doubles as the "New organization" page, linked from the sidebar for all users.
