---
name: Postgres numeric coercion in Zod response schemas
description: Postgres numeric/decimal columns come back as strings from Drizzle; response Zod schemas must use zod.coerce.number(), not zod.number().
---

# Postgres numeric → Zod coercion

## Rule
Any Zod schema that **parses database output** (i.e. a response schema, not a request body schema) must use `zod.coerce.number()` for fields backed by a Postgres `numeric` or `decimal` column.

**Why:** Drizzle ORM returns `numeric`/`decimal` column values as JavaScript strings (e.g. `"1000.00"`), not numbers. `zod.number()` rejects strings and throws a ZodError at runtime. `zod.coerce.number()` calls `Number(value)` first, which handles this transparently.

**How to apply:**
- Response schemas (e.g. `ListFundsResponse`, `UpdateFundResponse`): use `zod.coerce.number()`.
- Request body schemas (client sends real JS numbers): `zod.number()` is fine.
- After running codegen (`pnpm run codegen`), check any newly generated response schema that wraps a `numeric`/`decimal` DB column and manually change `zod.number()` → `zod.coerce.number()` for those fields.

**Known affected schemas (already fixed):**
- `ListFundsResponseItem.amount`
- `UpdateFundResponse.amount`

The `sum()` aggregate in `/users/:id/balance` is already safe — the route manually calls `parseFloat()` before passing to Zod.
