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

- Double-entry: ≥2 entries, sum=0, both signs (deferred trigger; void exempt). amount_cents >0 debit, <0 credit.
- DB-enforced immutability: transactions only posted→void; entries only reconciliation_id; bank rows are evidence (FITID/hash+row_seq; link must match amount/account).
- Void: idempotent, blocked by completed reconciliation, unticks/unlinks in-progress evidence.
- Reconciliation finish needs difference=0 (DB trigger); completed ones lock entries.
- Audit rows only via writeAudit() (src/lib/audit.ts, service role); no user INSERT.
- Org data: requireSupabaseAuth + assertCan + member RLS; settings/accounts admin-only.
- Terminology is presentation-only; reports/PDFs use org level only.
- Accounts: catalog-based, archive never delete.
- Dates YYYY-MM-DD in org.timezone; never toISOString.
- Reports: pure math; retained earnings derived; year-end close is virtual (no closing tx; legacy source='closing' excluded).
- Currency: two-decimal only, frozen once transactions exist.
- Idempotency keys: one per form submit; `bank:<id>`, `opening:<acct>:...`.
- AI PDF: org opt-in, upload ack, limits, balance or acceptMismatch.
- Legal acceptance append-only/versioned; U.S.-first; no GDPR claim.
- Demo: demo@demo.org / demo1234, manual dev seed only.
- CI, tests and migration-safety rules: see scripts/ci/AGENTS.md.
