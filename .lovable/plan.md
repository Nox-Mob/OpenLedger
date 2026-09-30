# Accounting App Concept — Mind Map & Outline

## Source
Your shared ChatGPT conversation "Accounting App Concept" (fetched and parsed). It covers designing a simple, secure, free accounting web app for very small businesses and nonprofits.

## What I'll build

### 1. Home page (`/`) — Interactive mind map
A zoomable, pannable mind map with "Accounting App Concept" at the center and the conversation's real structure as branches:

```text
Accounting App Concept
├── Core Philosophy
│   ├── One accounting system, one source of truth, one double-entry engine
│   ├── Everything else is presentation
│   ├── The bank is NOT the source of truth — the ledger is
│   └── Bank statement is an input, not the system itself
├── Terminology Architecture (3 layers)
│   ├── Layer 1 — Accounting engine (immutable: assets, liabilities, equity, debits, credits…)
│   ├── Layer 2 — Organization presentation (nonprofit vs business vocabulary)
│   └── Layer 3 — User presentation (simplified vs double-entry per user)
├── Organizational Concepts
│   ├── Tags (labels, attachable to anything)
│   ├── Projects (first-class, budget vs actual — e.g. 2026 Signal Corps Ball)
│   ├── Funds (restricted pools of money)
│   ├── Categories, Budgets
├── Transaction Model
│   ├── Accounting transaction (the important object)
│   ├── Bank transaction (external evidence, optionally linked)
│   ├── Source/origin metadata (import, manual, opening balance, adjustment…)
│   ├── Manual "+ New Transaction" (Money In / Money Out / Transfer / Advanced)
│   └── Splits, transfers, corrections, petty cash
├── Dates & Accrual Readiness
│   ├── Transaction date vs posted date vs settlement date
│   ├── V0.0.1: don't block accrual; Future: cash vs accrual basis switching
├── Data Flow
│   └── Bank → Import → User verification → Accounting transaction → Ledger → Reports
├── Financial Integrity
│   ├── Reconciliation, audit history, concurrent edits, import dedup, statement periods
├── Product & Operations
│   ├── Reports, exports, receipts/attachments
│   ├── Hosting/self-hosting, backup/recovery, permissions/roles
└── Open Questions / Next Steps
    ├── Design the accounting transaction via 8–10 real-world examples
    ├── Restricted funds in early versions
    └── Security & data ownership for hosting models
```

- Clicking a node opens a detail panel with that topic's key points and examples from the conversation (e.g. the $23.17 petty cash example, the $1,000 invoice accrual scenario)
- Color-coded branches per top-level topic

### 2. Outline page (`/outline`) — Exportable text outline
- The same content as a nested, collapsible outline
- **Export buttons**: copy/download as (a) human-readable indented text and (b) AI-agent-parseable structured format (JSON/YAML with stable IDs per node) — matching your request that it be readable by you and actionable by an AI agent

### 3. Content model
- All topics in one typed data file (`src/data/mindmap.ts`) with id, title, summary, key points, children — drives both the mind map and the outline/exports

## Design direction
Editorial "ledger" aesthetic: warm paper background, ink-dark text, serif display headings, muted branch colors — no generic purple-gradient look.

## Technical details
- TanStack Start (existing stack), Tailwind v4 semantic tokens
- Custom SVG mind map with pan/zoom (no heavy graph library; edge-safe)
- Routes: `src/routes/index.tsx` (mind map), `src/routes/outline.tsx` (outline + export); shared header/nav in `__root.tsx`
- Per-route `head()` metadata (unique title/description/og tags)
- No backend needed — static content

## Steps
1. Design tokens + fonts
2. `src/data/mindmap.ts` with the full conversation structure
3. Mind map page with pan/zoom + detail panel
4. Outline page with collapse + text/JSON export
5. Header/nav + head metadata
6. Build check + visual verification
