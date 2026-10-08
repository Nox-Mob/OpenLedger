# Dependencies

Bun is the only package manager (`bun.lock`). Core libraries that touch money, data or sign-in are pinned to exact versions; UI helpers use caret ranges and are locked by `bun.lock`.

| Package                                            | Why it is here                                                            | Pinned |
| -------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| @tanstack/react-start, react-router, router-plugin | App framework and routing                                                 | yes    |
| react, react-dom                                   | UI                                                                        | yes    |
| @supabase/supabase-js                              | Cloud and self-hosted database, sign-in                                   | yes    |
| @lovable.dev/cloud-auth-js                         | Google sign-in broker                                                     | yes    |
| zod                                                | Input checks in every server function                                     | yes    |
| @tanstack/react-query                              | Data fetching and caching                                                 | yes    |
| exceljs                                            | Excel exports                                                             | yes    |
| jspdf, jspdf-autotable                             | PDF reports                                                               | yes    |
| pdfjs-dist                                         | Reading bank statement PDFs                                               | yes    |
| sql.js (dev)                                       | SQLite adapter contract tests                                             | yes    |
| drizzle-kit, drizzle-orm (dev)                     | Migration journal used by the hosted migration tool; not used by app code | 0.x    |
| postgres (dev)                                     | Driver used by the migration tool                                         | caret  |
| radix-ui, lucide-react, recharts, sonner, etc.     | UI components and charts                                                  | caret  |

Rules: add a package only when the shared domain or a port can't do it; record it here; never commit registry cache URLs in `bun.lock`.
