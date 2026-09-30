# Accounting Mind Map App — Plan

## Goal
Turn a ChatGPT conversation about accounting into an interactive web app: a mind map of the conversation's topics plus a structured accounting outline.

## Blocker: conversation content
The link you sent (`chatgpt.com/c/...`) is private — it only opens inside your own ChatGPT account (I verified: it returns access-denied). I need the actual conversation before I can fill in real content. To share it: in ChatGPT, open the chat → **Share → Create link** → send me the `chatgpt.com/share/...` URL (or paste the chat text here).

Until then, I'll build the full app with placeholder topic data that's trivial to swap out.

## What I'll build

### 1. Home page (`/`) — Mind map
- Interactive, zoomable/pannable mind map with the conversation's central theme at the center and branches for each major topic and sub-topic
- Nodes are clickable: selecting one shows a detail panel with that topic's summary, key points, and any figures/dates from the conversation
- Clean, distinctive design (not generic): warm paper-like background, ink-style typography, color-coded branches per topic

### 2. Outline page (`/outline`) — Structured accounting outline
- The same content as a nested, collapsible outline (I. → A. → 1. style)
- Print/export friendly

### 3. Content pipeline
- Conversation topics live in one typed data file (`src/data/mindmap.ts`) — easy to update once you share the chat
- Once you send the share link, I'll extract the real topics and replace the placeholders

## Technical details
- TanStack Start (existing stack), Tailwind v4 tokens for theming
- Mind map rendered with a lightweight canvas/SVG approach (custom pan/zoom, no heavy graph library) — edge-runtime safe
- Routes: `src/routes/index.tsx` (mind map), `src/routes/outline.tsx` (outline), shared header in `__root.tsx`
- Each route gets its own `head()` metadata (title, description, og tags)
- No backend/database needed — content is static data

## Steps
1. Design tokens + fonts (distinctive editorial look)
2. Mind map data model + placeholder accounting topics
3. Home page: interactive mind map with detail panel
4. Outline page: collapsible nested outline
5. Shared header/nav, per-route head metadata
6. Verify build + visual check
7. (After you share the link) Replace placeholders with the real conversation content
