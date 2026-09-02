---
name: Missed EMI capitalization
description: Accounting rule for missed monthly payments and historical status corrections.
---

A missed month capitalizes the full EMI into outstanding principal: that month's interest plus scheduled principal. Scheduled principal is the original loan principal divided by tenure; loans without a tenure have no scheduled-principal component.

**Why:** A missed EMI must increase the loan balance and future interest, while a manager correcting the month to Paid or Not recorded must remove that exact increase rather than leave stale downstream balances.

**How to apply:** Treat Not recorded as no payment row, Paid as a paid row, and Missed as an explicitly missed row. Whenever a historical row is inserted, changed, or removed, rebuild payment principal and interest snapshots chronologically for that borrower.