# LoanLedger

A full-stack loan management platform for tracking borrowers, monthly payments, and interest/commission analytics with admin and user roles.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS v4 (at `/`)
- API: Express 5 (at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Auth: Clerk (via Replit-managed tenant, white-label)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Charts: Recharts
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/` — users, borrowers, payments
- API contract: `lib/api-spec/openapi.yaml`
- Generated hooks: `lib/api-client-react/src/generated/`
- Generated Zod schemas: `lib/api-zod/src/generated/`
- API routes: `artifacts/api-server/src/routes/`
- Frontend pages: `artifacts/loan-ledger/src/pages/`
- Auth middleware: `artifacts/api-server/src/middlewares/auth.ts`
- Clerk proxy middleware: `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`

## Architecture decisions

- **10% base interest rate is hardcoded** — `commissionRate = interestRate - 10`, stored separately in borrowers and payments tables for accurate bifurcation in analytics.
- **JIT user provisioning** — `requireUser` middleware creates a local user record from Clerk session on first request, no separate signup flow needed.
- **Admin vs user scope** — users only see their own borrowers; admins see all. Enforced at the route level via `requireAdmin` / `requireUser`.
- **Clerk proxy** — Clerk SDK calls are proxied through `/api/__clerk` so the frontend never calls Clerk directly (avoids CORS and CSP issues in the Replit sandbox).
- **Contract-first API** — OpenAPI spec is the source of truth; all React Query hooks and Zod validators are generated from it via Orval.

## Product

- **Borrower management** — Add borrowers with principal, monthly interest rate, start date, address, and notes. Rates above 10% auto-calculate commission.
- **Payment tracking** — Record monthly interest payments per borrower; toggle paid/unpaid; auto-calculates base interest + commission split.
- **Analytics** — Monthly and yearly charts showing interest vs. commission breakdown; user-level stats.
- **Admin dashboard** — System-wide overview with charts, top performer table, revenue split pie chart, and user management (activate/deactivate, promote to admin).
- **Clerk auth** — Email + Google login; role-based access (admin/user).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`, then restart workflows.
- Always run `pnpm --filter @workspace/db run push` after changing DB schema files.
- Do NOT use `console.log` in server code — use `req.log` in route handlers and the singleton `logger` elsewhere.
- The API server listens on port 8080 (set by workflow env, not hardcoded).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for Clerk customization and troubleshooting
