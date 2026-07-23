---
name: Commission rate rule
description: 10% base interest is hardcoded; commission = interestRate − 10%, stored separately.
---

BASE_INTEREST_RATE = 10 (hardcoded constant in borrowers.ts).
commissionRate = max(0, interestRate − 10).
Both commissionRate and baseInterestRate are stored in borrowers and payments tables for accurate bifurcation in analytics.

**Why:** Analytics need to split earned interest into "base" (belongs to lender) and "commission" (belongs to agent/admin).

**How to apply:** Recalculate on both create and update of borrower. When interestRate is patched, always recompute commissionRate.
