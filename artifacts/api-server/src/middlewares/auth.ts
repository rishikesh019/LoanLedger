import { getAuth, clerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function fetchClerkUser(clerkId: string) {
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkId);
    const email =
      clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      `${clerkId}@unknown.com`;
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
      clerkUser.username ||
      "Unknown User";
    return { email, name };
  } catch {
    return { email: `${clerkId}@unknown.com`, name: "Unknown User" };
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).clerkId = clerkId;
  next();
};

export const requireUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));

  if (!user) {
    const { email, name } = await fetchClerkUser(clerkId);
    [user] = await db.insert(usersTable).values({
      clerkId,
      email,
      name,
      role: "user",
      isActive: true,
    }).returning();
  } else if (user.name === "Unknown User" || user.email.endsWith("@unknown.com")) {
    const { email, name } = await fetchClerkUser(clerkId);
    [user] = await db.update(usersTable)
      .set({ email, name, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
  }

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

  let [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden: Admin access required" });
    return;
  }

  if (user.name === "Unknown User" || user.email.endsWith("@unknown.com")) {
    const { email, name } = await fetchClerkUser(clerkId);
    [user] = await db.update(usersTable)
      .set({ email, name, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
  }

  (req as any).appUser = user;
  (req as any).clerkId = clerkId;
  next();
};
