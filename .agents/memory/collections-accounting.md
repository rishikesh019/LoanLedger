---
name: Collections accounting
description: Defines what the monthly Collected card includes when payments contain interest, principal, or loan closure amounts.
---

The Collections **Collected** card shows interest actually received in the selected month, not total cash received.

- For active loans, include only the interest portion of a recorded payment.
- If a loan closes during the selected month, include a separate interest-only payment made before closure.
- Exclude principal reductions and lump-sum closure payments.
- Exclude loans that were already closed before the selected month.

**Why:** A combined payment can contain both interest and principal. Summing its full amount overstated August 2026 collections by including principal as income.

**How to apply:** Any monthly collection summary, export, or analytics calculation must separate interest from principal and apply closure timing using normalized calendar dates.