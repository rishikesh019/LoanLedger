import { getAuth, clerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

async function fetchClerkUser(clerkId: string) {
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkId);
    const email =
      clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null;
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
      clerkUser.username ||
      null;
    return { email, name };
  } catch {
    return { email: null, name: null };
  }
}

async function resolveOrProvisionUser(clerkId: string) {
  // 1. Fast path — exact clerkId match
  let [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (user) {
    // Backfill placeholder name/email if still present
    if (user.name === "Unknown User" || (user.email && user.email.endsWith("@unknown.com"))) {
      const { email, name } = await fetchClerkUser(clerkId);
      if (email || name) {
        [user] = await db.update(usersTable)
          .set({
            ...(email ? { email } : {}),
            ...(name ? { name } : {}),
            updatedAt: new Date(),
          })
          .where(eq(usersTable.clerkId, clerkId))
          .returning();
      }
    }
    return user;
  }

  // 2. No clerkId match — fetch real email from Clerk and try to link by email
  const { email: clerkEmail, name: clerkName } = await fetchClerkUser(clerkId);

  if (clerkEmail) {
    const [existingByEmail] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, clerkEmail));

    if (existingByEmail) {
      // Link the pre-provisioned record to this Clerk account
      [user] = await db.update(usersTable)
        .set({
          clerkId,
          name: clerkName || existingByEmail.name,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existingByEmail.id))
        .returning();
      return user;
    }
  }

  // 3. Brand-new user — JIT provision
  [user] = await db.insert(usersTable).values({
    clerkId,
    email: clerkEmail ?? `${clerkId}@unknown.com`,
    name: clerkName ?? "Unknown User",
    role: "user",
    isActive: true,
  }).returning();

  return user;
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).clerkId = auth.userId;
  next();
};

export const requireUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await resolveOrProvisionUser(clerkId);
  (req as any).appUser = user;
  (req as any).clerkId = clerkId;
  next();
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await resolveOrProvisionUser(clerkId);
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden: Admin access required" });
    return;
  }

  (req as any).appUser = user;
  (req as any).clerkId = clerkId;
  next();
};
