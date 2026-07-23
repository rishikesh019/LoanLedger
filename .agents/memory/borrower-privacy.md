---
name: Borrower privacy model
description: Every borrower list/get/patch/delete route is scoped to req.appUser.id — no admin exception.
---

Borrowers are private to the user who created them. Even admin users cannot see other users' borrowers in borrower routes.

**Why:** Business requirement — each lender manages their own portfolio privately.

**How to apply:**
- `GET /borrowers` — always `eq(borrowersTable.userId, appUser.id)` in conditions (no role check).
- `GET /borrowers/:id`, `PATCH`, `DELETE` — ownership check is `if (borrower.userId !== appUser.id) → 403`.
- `GET /collections/current-month` — same: always scoped to `appUser.id`.
- Admin analytics routes (`/analytics/*`) may still aggregate across all users for system-wide stats — that's intentional.
