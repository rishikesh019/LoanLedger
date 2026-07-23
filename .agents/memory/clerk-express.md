---
name: Clerk + Express v2 quirk
description: clerkClient in @clerk/express v2 is a plain object, not a factory function.
---

In @clerk/express v2, `clerkClient` is an object — call `clerkClient.users.getUser(clerkId)` directly.
Do NOT call it as a function: `clerkClient()` throws.

**Why:** The API changed between v1 and v2; docs examples sometimes show the old pattern.

**How to apply:** Wherever user data needs to be fetched from Clerk in Express middleware/routes, import `{ clerkClient }` and use it as an object.
