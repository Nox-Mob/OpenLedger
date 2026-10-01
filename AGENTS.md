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

- Double-entry: createTransaction + deferred trigger require ≥2 entries, sum=0, positive and negative (void exempt).
- amount_cents >0 debit, <0 credit; displayBalance() flips credit-normal types.
- Never edit entries in place: void + recreate (audit trail).
- Bank imports are evidence only (FITID, else hash incl. row_seq); batches undoable until a row posts.
- Terminology is presentation-only: org level + term_overrides; screens add user overrides, reports/PDFs use org only.
- Org data uses requireSupabaseAuth + member RLS; org settings/account setup are admin-only and audited.
- Sample data: demo@demo.org / demo1234 (Acme + Riverside), manual dev/test seed only; hint only in dev/preview.
- Reconciliation stamps entries.reconciliation_id; finish needs difference=0; completed ones lock entries via triggers.
- Accounts come from the catalog; archive/reactivate, never delete. Archived accounts remain in history and reject new entries.
- Dates are YYYY-MM-DD; todayISO uses org.timezone; never toISOString transaction dates.
- Report math is pure/tested; balance sheet rolls prior years into retained earnings/net assets.
- Void is idempotent, blocked in completed reconciliation, and unticks/unlinks in-progress evidence.
- Tests: bun run test, bun run check:migrations, DATABASE_URL=... bun run test:db (supabase/tests/*.sql).
- Double-post: unique org idempotency keys; forms send one per submission, bank uses `bank:<id>`.
- AI PDF requires org opt-in, upload ack, limits; must balance or send acceptMismatch.
- Legal acceptance is append-only/versioned; U.S.-first drafts separate hosted/self-hosted terms and make no GDPR claim.
- CI (.github/workflows/ci.yml) is report-only: never auto-fixes/commits; DB checks run on a disposable local DB via scripts/ci; SQL tests end with RAISE 'RESULT k=PASS;...'.
- Startup never resets data: migrations are append-only and CI rejects DELETE/TRUNCATE/DROP TABLE in them; test scripts require a local DB; demo seed refuses DBs with real orgs.
